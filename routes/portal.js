/**
 * routes/portal.js — Public client portal API routes
 * Fully migrated from server.js
 *
 * Factory function receives shared deps to avoid circular imports.
 */
const express = require('express');
const path    = require('path');

const DEMO_TOKEN = 'demo-klant-portal-2026';

module.exports = function createPortalRouter({ readJSON, writeJSON, addNotification, addLeadHistory, computeRealAnalytics, getDb, JWT_SECRET, bcrypt }) {
  const router = express.Router();
  const jwt    = require('jsonwebtoken');

  // ── requirePortalAuth middleware ──────────────────────────────────────────────
  // Skipped for demo portals (any lead with isDemo:true). All real portals must send a valid portal JWT.
  function _isDemoPortal(token) {
    if (token === DEMO_TOKEN) return true;
    const leads = readJSON('leads.json') || [];
    const lead = leads.find(l => l.portalToken === token);
    return !!(lead && lead.isDemo);
  }
  function requirePortalAuth(req, res, next) {
    if (_isDemoPortal(req.params.token)) return next();
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Niet ingelogd', requiresLogin: true });
    }
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
      if (payload.portalToken !== req.params.token) {
        return res.status(401).json({ error: 'Token ongeldig', requiresLogin: true });
      }
      req.portalUser = payload;
      next();
    } catch {
      return res.status(401).json({ error: 'Sessie verlopen — log opnieuw in', requiresLogin: true });
    }
  }

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

  function _getBranding(lead, settings) {
    let branding = {
      name       : settings.agencyName || 'Agency AI',
      logo       : settings.agencyLogo || null,
      color      : '#2563eb',
      emailSender: settings.agencyName || 'Agency AI',
    };
    try {
      const db = typeof getDb === 'function' ? getDb() : null;
      if (db) {
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
    return branding;
  }

  // ── GET /api/portal/:token ──────────────────────────────────────────────────
  // Returns requiresSetup/requiresLogin for unauthenticated requests on real portals.
  router.get('/:token', (req, res) => {
    // Search global store first, then all workspace-scoped stores (resilient to data
    // migration — e.g. if leads ended up in ws:${id}:leads.json instead of leads.json)
    let lead = (readJSON('leads.json') || []).find(l => l.portalToken === req.params.token);
    if (!lead) {
      try {
        const db = typeof getDb === 'function' ? getDb() : null;
        if (db) {
          const keys = db.prepare("SELECT key FROM store WHERE key LIKE 'ws:%:leads.json'").all();
          for (const { key } of keys) {
            const wLeads = readJSON(key) || [];
            lead = wLeads.find(l => l.portalToken === req.params.token);
            if (lead) break;
          }
        }
      } catch { /* non-fatal fallback search */ }
    }
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd. Neem contact op met uw accountmanager.' });

    const settings = readJSON('settings.json') || {};
    const branding = _getBranding(lead, settings);

    // Demo portal — always open
    const isDemo = req.params.token === DEMO_TOKEN || !!(lead.isDemo);

    if (!isDemo) {
      // First visit: password not set yet
      if (!lead.portalPasswordSet) {
        return res.json({
          requiresSetup: true,
          companyName:   lead.companyName,
          agencyName:    branding.name,
          agencyLogo:    branding.logo,
          branding,
        });
      }

      // Returning visit: verify portal JWT
      const authHeader = req.headers.authorization;
      let jwtValid = false;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        try {
          const payload = jwt.verify(authHeader.slice(7), JWT_SECRET);
          jwtValid = payload.portalToken === req.params.token;
        } catch { /* expired or invalid */ }
      }

      if (!jwtValid) {
        return res.json({
          requiresLogin: true,
          companyName:   lead.companyName,
          agencyName:    branding.name,
          agencyLogo:    branding.logo,
          branding,
        });
      }
    }

    // ── Full portal data ────────────────────────────────────────────────────
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
      // MEGA TASK 2 — timeline, revisions, NPS
      projectStartedAt:     lead.projectStartedAt || lead.projectStartDate || null,
      projectEndDate:       lead.projectEndDate || null,
      revisionRequests:     (lead.revisionRequests || []).map(r => ({ id: r.id, service: r.service, text: r.text, priority: r.priority, status: r.status, createdAt: r.createdAt, resolvedAt: r.resolvedAt || null })),
      npsEligible:          _npsEligible(lead),
      npsSubmitted:         !!lead.npsResponse,
    });
  });

  // NPS survey appears 3 days after the last deliverable was approved
  function _npsEligible(lead) {
    if (lead.npsResponse) return false;
    const approved = (lead.agentDeliverables || []).filter(d => d.approvedAt || d.status === 'approved');
    if (!approved.length) return false;
    const last = approved
      .map(d => new Date(d.approvedAt || d.builtAt || 0).getTime())
      .sort((a, b) => b - a)[0];
    return last && (Date.now() - last) >= 3 * 86400000;
  }

  // ── POST /api/portal/:token/revision ────────────────────────────────────────
  // Client requests a revision on a deliverable: text + priority (+ optional file ref)
  router.post('/:token/revision', requirePortalAuth, (req, res) => {
    const { service, text, priority } = req.body || {};
    if (!text || !text.trim()) return res.status(400).json({ error: 'Beschrijf wat er moet veranderen' });
    const prio = ['Laag', 'Normaal', 'Hoog'].includes(priority) ? priority : 'Normaal';
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });

    lead.revisionRequests = lead.revisionRequests || [];
    const rev = {
      id: 'rev-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      service: (service || 'Algemeen').substring(0, 120),
      text: text.trim().substring(0, 3000),
      priority: prio,
      status: 'Ingediend', // Ingediend → In behandeling → Opgelost
      createdAt: new Date().toISOString(),
    };
    lead.revisionRequests.push(rev);
    addLeadHistory(leads, lead.id, { event: 'revision', label: `Revisie aangevraagd (${prio}): ${rev.text.substring(0, 60)}${rev.text.length > 60 ? '...' : ''}` });
    writeJSON('leads.json', leads);
    addNotification('client_question', `🔁 Revisie aanvraag: ${lead.companyName}`, `${rev.service} — ${rev.text.substring(0, 80)}`, lead.id, `project:${lead.id}`);
    res.json({ ok: true, revision: rev });
  });

  // ── POST /api/portal/:token/nps ─────────────────────────────────────────────
  // NPS survey: score 1-10 + open feedback. Stored once per lead.
  router.post('/:token/nps', requirePortalAuth, (req, res) => {
    const { score, feedback } = req.body || {};
    const n = parseInt(score, 10);
    if (!n || n < 1 || n > 10) return res.status(400).json({ error: 'Score 1-10 verplicht' });
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (lead.npsResponse) return res.status(400).json({ error: 'Al ingevuld — bedankt!' });

    lead.npsResponse = { score: n, feedback: (feedback || '').substring(0, 2000), submittedAt: new Date().toISOString() };
    addLeadHistory(leads, lead.id, { event: 'nps', label: `NPS score: ${n}/10` });
    writeJSON('leads.json', leads);
    addNotification('client_question', `⭐ NPS van ${lead.companyName}: ${n}/10`, (feedback || '').substring(0, 100) || 'Geen toelichting', lead.id, `project:${lead.id}`);
    res.json({ ok: true });
  });

  // ── POST /api/portal/:token/set-password ────────────────────────────────────
  // First-time password setup. Returns portal JWT on success.
  router.post('/:token/set-password', express.json(), async (req, res) => {
    const leads = readJSON('leads.json') || [];
    const li    = leads.findIndex(l => l.portalToken === req.params.token);
    if (li === -1) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (req.params.token === DEMO_TOKEN) return res.status(400).json({ error: 'Demo portaal heeft geen wachtwoord nodig' });

    const { password } = req.body || {};
    if (!password || password.length < 8) return res.status(400).json({ error: 'Wachtwoord minimaal 8 tekens' });

    const hash = await bcrypt.hash(password, 12);
    leads[li].portalPassword    = hash;
    leads[li].portalPasswordSet = true;
    leads[li].portalLastLogin   = new Date().toISOString();
    writeJSON('leads.json', leads);

    const token = jwt.sign(
      { portalToken: req.params.token, leadId: leads[li].id, companyName: leads[li].companyName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ ok: true, jwt: token });
  });

  // ── POST /api/portal/:token/login ───────────────────────────────────────────
  // Returning visitor login. Returns portal JWT on success.
  router.post('/:token/login', express.json(), async (req, res) => {
    const leads = readJSON('leads.json') || [];
    const li    = leads.findIndex(l => l.portalToken === req.params.token);
    if (li === -1) return res.status(404).json({ error: 'Portaal niet gevonden' });
    if (req.params.token === DEMO_TOKEN) return res.status(400).json({ error: 'Demo portaal heeft geen login nodig' });

    if (!leads[li].portalPasswordSet) return res.status(400).json({ error: 'Wachtwoord nog niet ingesteld' });

    const { password } = req.body || {};
    if (!password) return res.status(400).json({ error: 'Wachtwoord verplicht' });

    const match = await bcrypt.compare(password, leads[li].portalPassword || '');
    if (!match) return res.status(401).json({ error: 'Onjuist wachtwoord' });

    leads[li].portalLastLogin = new Date().toISOString();
    writeJSON('leads.json', leads);

    const token = jwt.sign(
      { portalToken: req.params.token, leadId: leads[li].id, companyName: leads[li].companyName },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    res.json({ ok: true, jwt: token });
  });

  // ── POST /api/portal/:token/site-feedback ───────────────────────────────────
  router.post('/:token/site-feedback', requirePortalAuth, (req, res) => {
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
  router.post('/:token/message', requirePortalAuth, (req, res) => {
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
  router.get('/:token/chat', requirePortalAuth, (req, res) => {
    const leads = readJSON('leads.json') || [];
    const lead  = leads.find(l => l.portalToken === req.params.token);
    if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
    res.json({ chat: lead.portalChat || [], companyName: lead.companyName });
  });

  // ── POST /api/portal/:token/upload ─────────────────────────────────────────
  router.post('/:token/upload', requirePortalAuth, express.json({ limit: '15mb' }), async (req, res) => {
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
  router.delete('/:token/upload/:filename', requirePortalAuth, (req, res) => {
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
  router.get('/:token/download/:filename', requirePortalAuth, (req, res) => {
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
