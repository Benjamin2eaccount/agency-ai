/**
 * routes/portal.js — Public client portal API routes
 * Fully migrated from server.js
 *
 * Factory function receives shared deps to avoid circular imports.
 */
const express = require('express');
const path    = require('path');

module.exports = function createPortalRouter({ readJSON, writeJSON, addNotification, addLeadHistory, computeRealAnalytics, getDb }) {
  const router = express.Router();

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function _findUpload(uploads, rawFilename) {
    if (!uploads || !rawFilename) return null;
    let decoded = rawFilename;
    try { decoded = decodeURIComponent(rawFilename); } catch {}
    const sanitized = decoded.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    return uploads.find(u =>
      u.filename === rawFilename ||
      u.filename === decoded     ||
      u.filename === sanitized   ||
      u.filename.replace(/\s+/g, '_') === rawFilename ||
      u.filename.replace(/\s+/g, '_') === decoded
    ) || null;
  }

  function _serveUpload(upload, res) {
    if (!upload || !upload.content) return res.status(404).json({ error: 'Bestandsinhoud niet beschikbaar' });
    const buffer = Buffer.from(upload.content, 'base64');
    res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${upload.filename}"`);
    res.send(buffer);
  }

  // ── GET /api/portal/:token ──────────────────────────────────────────────────
  router.get('/:token', (req, res) => {
    const leads   = readJSON('leads.json') || [];
    const lead    = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd. Neem contact op met uw accountmanager.' });

    const settings    = readJSON('settings.json') || {};
    const settingsSvcs = settings.services || [];
    const rawSvcs = (lead.projectServices && lead.projectServices.length)
      ? lead.projectServices : (lead.services || []);
    const enrichedSvcs = rawSvcs.map(s => {
      const sName   = typeof s === 'string' ? s : (s.name || '');
      const match   = settingsSvcs.find(ss => ss.name === sName);
      const price   = typeof s === 'object' ? (parseFloat(s.price) || 0) : (parseFloat(match?.price) || 0);
      const billing = typeof s === 'object' ? (s.billing || 'maandelijks') : (match?.billing || 'maandelijks');
      return { name: sName, price, billing, description: match?.description || '' };
    }).filter(s => s.name);

    // ── Workspace branding lookup ─────────────────────────────────────────────
    let branding = {
      name       : settings.agencyName || 'Agency AI',
      logo       : settings.agencyLogo || null,
      color      : '#2563eb',
      emailSender: settings.agencyName || 'Agency AI',
    };
    try {
      const db = typeof getDb === 'function' ? getDb() : null; // getDb passed as () => require('./database').getDb()
      if (db) {
        // Find workspace: prefer lead.workspaceId, else look up by slug 'agencyai'
        const wsId = lead.workspaceId || null;
        const ws = wsId
          ? db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId)
          : db.prepare("SELECT * FROM workspaces WHERE slug = 'agencyai' LIMIT 1").get();
        if (ws) {
          branding = {
            name       : ws.branding_name || ws.name || branding.name,
            logo       : ws.branding_logo || branding.logo,
            color      : ws.branding_color || branding.color,
            emailSender: ws.branding_email_sender || ws.branding_name || ws.name || branding.name,
          };
        }
      }
    } catch { /* workspace lookup is non-fatal */ }

    res.json({
      companyName:          lead.companyName,
      agencyName:           branding.name,
      agencyLogo:           branding.logo,
      myName:               settings.myName || '',
      branding,
      currentPhase:         lead.currentPhase || 1,
      estimatedCompletion:  lead.estimatedCompletion || null,
      services:             enrichedSvcs,
      reports:              (lead.reports || []).map(r => ({ title: r.title, month: r.month, createdAt: r.createdAt, content: r.content })),
      delivery:             lead.delivery || null,
      generatedSite:        lead.generatedSite ? { siteUrl: lead.generatedSite.siteUrl, status: lead.generatedSite.status, generatedAt: lead.generatedSite.generatedAt } : null,
      calendlyUrl:          settings.calendlyUrl || null,
      payments:             (lead.payments || []).map(p => ({
                              id: p.id, description: p.description, amount: p.amount,
                              status: p.status, dueDate: p.dueDate, paidAt: p.paidAt,
                              paymentUrl: p.paymentUrl, type: p.type, billing: p.billing
                            })),
      messages:             (lead.clientMessages || []),
      timeline:             (lead.history || []).slice(-40).reverse(),
      analytics:            computeRealAnalytics(lead),
      portalChat:           lead.portalChat || [],
      documents:            (lead.documents || []).filter(d => d.visible !== false),
      portalWelcomeMessage: lead.portalWelcomeMessage || null,
      approvedDeliverables: (lead.agentDeliverables || [])
        .filter(d => d.clientVisible === true)
        .map(d => ({ service: d.service, type: d.type, deliverableType: d.deliverableType, url: d.url, approvedAt: d.approvedAt, builtAt: d.builtAt })),
      sharedProjectFiles:   (lead.projectFiles || [])
        .filter(f => f.sharedWithClient)
        .map(f => ({ id: f.id, name: f.name, type: f.type, url: f.url, fullUrl: f.fullUrl, createdAt: f.createdAt })),
      projectServices:      enrichedSvcs,
      contactSubmissions:   (lead.contactSubmissions || []).slice(0, 20),
      clientUploads:        (lead.clientUploads || []).map(({ content: _c, ...f }) => f),
      customDomain:         lead.customDomain || null,
      customDomainStatus:   lead.customDomainStatus || (lead.customDomain ? 'pending' : null),
    });
  });

  // ── POST /api/portal/:token/site-feedback ───────────────────────────────────
  router.post('/:token/site-feedback', (req, res) => {
    const { feedback } = req.body;
    if (!feedback) return res.status(400).json({ error: 'Feedback verplicht' });
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (!lead.generatedSite) return res.status(400).json({ error: 'Geen website gegenereerd' });
    if (!lead.generatedSite.feedback) lead.generatedSite.feedback = [];
    const preview = feedback.length > 60 ? feedback.substring(0, 60) + '...' : feedback;
    lead.generatedSite.feedback.push({ text: feedback, time: new Date().toISOString(), by: lead.companyName || 'klant' });
    addLeadHistory(leads, lead.id, { event: 'siteFeedback', label: `Website feedback van klant: ${preview}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true });
  });

  // ── POST /api/portal/:token/message ────────────────────────────────────────
  router.post('/:token/message', (req, res) => {
    const { name, message } = req.body;
    if (!name || !message) return res.status(400).json({ error: 'Naam en bericht verplicht' });
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (!lead.clientMessages) lead.clientMessages = [];
    lead.clientMessages.push({ name, message, time: new Date().toISOString(), read: false });
    if (!lead.portalChat) lead.portalChat = [];
    lead.portalChat.push({ id: 'pc-' + Date.now(), from: 'client', name, message, time: new Date().toISOString() });
    const preview = message.length > 60 ? message.substring(0, 60) + '...' : message;
    addLeadHistory(leads, lead.id, { event: 'clientMessage', label: `Klant bericht van ${name}: ${preview}` });
    writeJSON('leads.json', leads);
    addNotification('client_question', `Klant vraag: ${lead.companyName}`, `${name}: ${preview}`, lead.id, `project:${lead.id}`);
    res.json({ ok: true });
  });

  // ── GET /api/portal/:token/chat ─────────────────────────────────────────────
  router.get('/:token/chat', (req, res) => {
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    res.json({ chat: lead.portalChat || [], companyName: lead.companyName });
  });

  // ── POST /api/portal/:token/upload ─────────────────────────────────────────
  router.post('/:token/upload', express.json({ limit: '15mb' }), async (req, res) => {
    const leads = readJSON('leads.json') || [];
    const li = leads.findIndex(l => l.portalToken === req.params.token);
    if (li === -1) return res.status(404).json({ error: 'Niet gevonden' });
    if (leads[li].portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });

    const { filename, mimeType, dataBase64, size } = req.body || {};
    if (!filename || !dataBase64) return res.status(400).json({ error: 'Bestandsnaam en data verplicht' });

    const allowed = ['image/jpeg','image/png','image/svg+xml','image/gif','image/webp','application/pdf','application/zip'];
    if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Bestandstype niet toegestaan' });
    if (size > 10 * 1024 * 1024) return res.status(400).json({ error: 'Bestand te groot (max 10MB)' });

    const safeName  = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const rawBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');
    const fileInfo  = { id: Date.now().toString(36), filename: safeName, mimeType, size, content: rawBase64, uploadedAt: new Date().toISOString(), usedInBuild: false };

    leads[li].clientUploads = leads[li].clientUploads || [];
    if (!leads[li].clientUploads.some(u => u.filename === fileInfo.filename)) {
      leads[li].clientUploads.push(fileInfo);
    }
    writeJSON('leads.json', leads);
    addNotification('client_question', `📎 Bestand geüpload: ${safeName}`, `${leads[li].companyName} heeft een bestand geüpload`, leads[li].id, `project:${leads[li].id}`);

    const { content: _c, ...fileInfoPublic } = fileInfo;
    res.json({ ok: true, file: fileInfoPublic });
  });

  // ── DELETE /api/portal/:token/upload/:filename ──────────────────────────────
  router.delete('/:token/upload/:filename', (req, res) => {
    const leads = readJSON('leads.json') || [];
    const li = leads.findIndex(l => l.portalToken === req.params.token);
    if (li === -1) return res.status(404).json({ error: 'Niet gevonden' });
    if (leads[li].portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });
    const safeName = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
    const uploads  = leads[li].clientUploads || [];
    if (!uploads.find(f => f.filename === safeName)) return res.status(404).json({ error: 'Bestand niet gevonden' });
    leads[li].clientUploads = uploads.filter(f => f.filename !== safeName);
    writeJSON('leads.json', leads);
    res.json({ ok: true });
  });

  // ── GET /api/portal/:token/download/:filename ───────────────────────────────
  router.get('/:token/download/:filename', (req, res) => {
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
    if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });
    const upload = _findUpload(lead.clientUploads, req.params.filename);
    if (!upload) return res.status(404).json({ error: 'Bestand niet gevonden' });
    _serveUpload(upload, res);
  });

  return router;
};
