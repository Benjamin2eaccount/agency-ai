/**
 * routes/inbox.js — Inbox CRUD, approve/disapprove/restore routes
 * Extracted from server.js during production hardening.
 */
const express = require('express');

module.exports = function createInboxRouter(deps) {
  const {
    readJSON, writeJSON, wsRead, wsWrite, scopeToUser,
    addLeadHistory, isDemoContext, addActivity, isResendReady,
    sendEmail, updateMemory, updateMemoryVersion, updateMemoryConversion,
    trackFunnelEvent, fireWebhooks, NL_DAYS
  } = deps;

  const router = express.Router();

router.get('/', (req, res) => {
  res.json(scopeToUser(wsRead(req, 'inbox.json', []), req));
});

router.patch('/:id/approve', async (req, res) => {
  const inbox = wsRead(req, 'inbox.json', []);
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });

  const settings = wsRead(req, 'settings.json', {});
  const item = inbox[idx];
  const version = (req.body?.version === 'B' && item.emailB) ? 'B' : 'A';
  const chosenEmail = version === 'B' ? item.emailB : (item.emailA || item.email);

  inbox[idx].approvedAt = new Date().toISOString();
  inbox[idx].sentVersion = version;

  // Email duplicate check — warn if this email was already sent to
  const allLeads = wsRead(req, 'leads.json', []);
  const emailToCheck = (item.contactEmail || '').toLowerCase().trim();
  const emailDup = emailToCheck
    ? allLeads.find(l =>
        l.id !== item.leadId &&
        (l.contactEmail || l.email || '').toLowerCase().trim() === emailToCheck &&
        ['sent', 'replied', 'client', 'scheduled'].includes(l.status))
    : null;
  if (emailDup) {
    inbox[idx].emailDuplicateWarning = { id: emailDup.id, companyName: emailDup.companyName, status: emailDup.status };
    console.warn(`[DupEmail] ${item.contactEmail} ook gebruikt door ${emailDup.companyName} (${emailDup.status})`);
  }

  // ── DEMO GUARD: skip all real sends, update statuses as-if it worked ──
  if (isDemoContext(req, item)) {
    console.log(`[DEMO] Skipped real approve/send for inbox item ${item.id} (${item.companyName})`);
    inbox[idx].status  = 'sent';
    inbox[idx].sentAt  = new Date().toISOString();
    wsWrite(req, 'inbox.json', inbox);
    const leads = wsRead(req, 'leads.json', []);
    const leadIdx = leads.findIndex(l => l.id === item.leadId);
    if (leadIdx !== -1) {
      leads[leadIdx].status  = 'sent';
      leads[leadIdx].sentAt  = inbox[idx].sentAt;
      leads[leadIdx].sentVersion = version;
      addLeadHistory(leads, item.leadId, { event: 'sent', label: `Email verstuurd (versie ${version}) [demo]` });
      wsWrite(req, 'leads.json', leads);
    }
    addActivity('email', 'Email verstuurd naar ' + (item.companyName || 'Onbekend') + ' [demo]', { meta: { companyName: item.companyName, leadId: item.leadId } });
    return res.json(inbox[idx]);
  }

  // AI reply items: send our response email back to the business
  if (item.type === 'ai_reply') {
    const draft   = req.body?.aiDraft || item.aiDraft || '';
    const replyLead = (wsRead(req, 'leads.json', [])).find(l => l.id === item.leadId);
    const origSubj = item.subject || (replyLead ? (replyLead.email?.subject || replyLead.emailA?.subject || (Array.isArray(replyLead.subjectOptions) ? replyLead.subjectOptions[0] : null) || replyLead.emailSubject) : null) || item.companyName;
    const subject = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
    try {
      await sendEmail({ to: item.contactEmail, subject, body: draft, settings });
      inbox[idx].status       = 'sent';
      inbox[idx].sentAt       = new Date().toISOString();
      inbox[idx].aiDraftFinal = draft;
      wsWrite(req, 'inbox.json', inbox);

      const leads2 = wsRead(req, 'leads.json', []);
      addLeadHistory(leads2, item.leadId, { event: 'aiReplySent', label: `AI antwoord verstuurd naar ${item.contactEmail}` });
      wsWrite(req, 'leads.json', leads2);
      addActivity('email', `AI antwoord verstuurd → ${item.companyName}`, { meta: { leadId: item.leadId } });
      return res.json(inbox[idx]);
    } catch (err) {
      console.error('[AiReply] Verzenden mislukt:', err.message);
      inbox[idx].status = 'approved';
      wsWrite(req, 'inbox.json', inbox);
      return res.status(500).json({ error: 'Email verzenden mislukt: ' + err.message });
    }
  }

  // LinkedIn DM items: no email to send — just mark as sent and update lead
  if (item.type === 'linkedinDm') {
    inbox[idx].status = 'sent';
    inbox[idx].sentAt = new Date().toISOString();
    wsWrite(req, 'inbox.json', inbox);
    const leads = wsRead(req, 'leads.json', []);
    const leadIdx = leads.findIndex(l => l.id === item.leadId);
    if (leadIdx !== -1) {
      leads[leadIdx].linkedinDmSentAt = inbox[idx].sentAt;
      addLeadHistory(leads, item.leadId, { event: 'linkedinDmSent', label: 'LinkedIn DM gekopieerd & verstuurd' });
      wsWrite(req, 'leads.json', leads);
    }
    return res.json(inbox[idx]);
  }

  // Handle scheduled send
  if (req.body?.scheduled && item.sendOptimalTime) {
    inbox[idx].status    = 'scheduled';
    inbox[idx].scheduledAt = item.sendOptimalTime;
    wsWrite(req, 'inbox.json', inbox);
    const leads = wsRead(req, 'leads.json', []);
    const leadIdx = leads.findIndex(l => l.id === item.leadId);
    if (leadIdx !== -1) {
      leads[leadIdx].status = 'scheduled';
      leads[leadIdx].scheduledAt = item.sendOptimalTime;
      leads[leadIdx].sentVersion = version;
      addLeadHistory(leads, item.leadId, { event: 'scheduled', label: `Ingepland voor ${NL_DAYS[new Date(item.sendOptimalTime).getDay()]} om ${String(new Date(item.sendOptimalTime).getHours()).padStart(2,'0')}:00` });
      wsWrite(req, 'leads.json', leads);
    }
    return res.json(inbox[idx]);
  }

  if (isResendReady(settings)) {
    try {
      const trackingToken = 'otk-' + item.leadId + '-' + Math.random().toString(36).substr(2, 8);
      inbox[idx].trackingToken = trackingToken;
      // Accept manually entered email from frontend (for leads without verified email)
      const manualEmail    = req.body?.manualEmail?.trim() || null;
      if (manualEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail)) {
        inbox[idx].status = 'approved';
        wsWrite(req, 'inbox.json', inbox);
        return res.status(400).json({ error: `Ongeldig emailadres: "${manualEmail}"` });
      }
      if (manualEmail) {
        inbox[idx].contactEmail = manualEmail;
        inbox[idx].emailSource  = 'handmatig';
        // Also save to lead
        const allLeads2 = wsRead(req, 'leads.json', []);
        const li2 = allLeads2.findIndex(l => l.id === item.leadId);
        if (li2 !== -1) { allLeads2[li2].contactEmail = manualEmail; allLeads2[li2].emailSource = 'handmatig'; wsWrite(req, 'leads.json', allLeads2); }
      }
      const recipientEmail = inbox[idx].contactEmail;
      if (!recipientEmail) {
        inbox[idx].status = 'approved';
        wsWrite(req, 'inbox.json', inbox);
        return res.status(400).json({ error: 'Geen emailadres beschikbaar — voeg handmatig een emailadres toe' });
      }
      await sendEmail({
        to: recipientEmail,
        subject: chosenEmail?.subject || item.email?.subject || 'Outreach email',
        body: chosenEmail?.body || item.email?.body || '',
        settings,
        trackingToken,
        isColdOutreach: true,
        noCalendly: false
      });
      inbox[idx].status = 'sent';
      inbox[idx].sentAt = new Date().toISOString();

      addActivity('email', 'Email verstuurd naar ' + (inbox[idx].companyName || 'Onbekend'), { meta: { companyName: inbox[idx].companyName, leadId: inbox[idx].leadId } });
      const stats = wsRead(req, 'stats.json') || {};
      stats.emailsSent = (stats.emailsSent || 0) + 1;
      if (!stats.abStats) stats.abStats = { aApproved: 0, bApproved: 0 };
      stats.abStats[version === 'B' ? 'bApproved' : 'aApproved']++;
      wsWrite(req, 'stats.json', stats);
      console.log(`[Email] Verstuurd (versie ${version}): "${chosenEmail?.subject}" -> ${recipientEmail}`);
    } catch (err) {
      console.error('[Email] Fout:', err.message);
      inbox[idx].status = 'approved'; // approved but not sent
      wsWrite(req, 'inbox.json', inbox);
      return res.status(500).json({ error: 'Email verzenden mislukt: ' + err.message });
    }
  } else {
    inbox[idx].status = 'approved'; // approved, Resend not configured
  }

  wsWrite(req, 'inbox.json', inbox);

  // Sync status to leads.json
  const leads = wsRead(req, 'leads.json', []);
  const leadIdx = leads.findIndex(l => l.id === item.leadId);
  if (leadIdx !== -1) {
    // Referral items: don't change lead status (they remain 'client')
    if (item.type !== 'referral') {
      leads[leadIdx].status = inbox[idx].status;
      leads[leadIdx].sentAt = inbox[idx].sentAt;
      if (inbox[idx].status === 'sent') { leads[leadIdx].sentVersion = version; trackFunnelEvent(item.leadId || leads[leadIdx].id, 'lead_emailed'); }
      if (inbox[idx].trackingToken) leads[leadIdx].trackingToken = inbox[idx].trackingToken;
      if (item.type === 'followup1' && inbox[idx].status === 'sent') leads[leadIdx].followup1SentAt = inbox[idx].sentAt;
      if (item.type === 'followup2' && inbox[idx].status === 'sent') leads[leadIdx].followup2SentAt = inbox[idx].sentAt;
    }
    if (item.type === 'referral' && inbox[idx].status === 'sent') {
      leads[leadIdx].referralEmailSent = true;
      leads[leadIdx].referralPending   = false;
      leads[leadIdx].referralSentAt    = inbox[idx].sentAt;
    }
    const histLabel = inbox[idx].status === 'sent'
      ? (item.type === 'referral' ? 'Referral email verstuurd' : `Email verstuurd (versie ${version})`)
      : 'Goedgekeurd';
    addLeadHistory(leads, item.leadId, { event: inbox[idx].status, label: histLabel });
    if (inbox[idx].status === 'sent' && item.type !== 'referral') {
      updateMemory(leads[leadIdx].niche, leads[leadIdx].country, 'sent');
      updateMemoryVersion(leads[leadIdx].niche, leads[leadIdx].country, version, 'sent');
    }
    wsWrite(req, 'leads.json', leads);
  }

  if (inbox[idx].status === 'sent' && item.type !== 'referral' && item.type !== 'linkedinDm') {
    const lead = (wsRead(req, 'leads.json', [])).find(l => l.id === item.leadId);
    fireWebhooks('lead.approved', { leadId: item.leadId, companyName: item.companyName, niche: item.niche, score: item.score, emailSubject: chosenEmail?.subject, sentAt: inbox[idx].sentAt, lead: lead ? { id: lead.id, status: lead.status, location: lead.location, estimatedValue: lead.estimatedValue } : null });
  }

  res.json(inbox[idx]);
});

router.patch('/:id/disapprove', (req, res) => {
  const inbox = wsRead(req, 'inbox.json', []);
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });
  inbox[idx].status = 'disapproved';
  inbox[idx].disapprovedAt = new Date().toISOString();
  wsWrite(req, 'inbox.json', inbox);

  const leads = wsRead(req, 'leads.json', []);
  const leadIdx = leads.findIndex(l => l.id === inbox[idx].leadId);
  if (leadIdx !== -1) {
    leads[leadIdx].status = 'disapproved';
    addLeadHistory(leads, inbox[idx].leadId, { event: 'disapproved', label: 'Afgewezen' });
    updateMemoryConversion(leads[leadIdx].niche, leads[leadIdx].country, 'lost', leads[leadIdx].estimatedFollowers, leads[leadIdx].website?.speedScore);
    wsWrite(req, 'leads.json', leads);
  }

  res.json(inbox[idx]);
});

router.patch('/:id/restore', (req, res) => {
  const inbox = wsRead(req, 'inbox.json', []);
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });
  inbox[idx].status = 'pending';
  delete inbox[idx].disapprovedAt;
  wsWrite(req, 'inbox.json', inbox);

  const leads = wsRead(req, 'leads.json', []);
  const leadIdx = leads.findIndex(l => l.id === inbox[idx].leadId);
  if (leadIdx !== -1) {
    leads[leadIdx].status = 'new';
    addLeadHistory(leads, inbox[idx].leadId, { event: 'restored', label: 'Hersteld uit prullenbak' });
    wsWrite(req, 'leads.json', leads);
  }

  res.json(inbox[idx]);
});

router.delete('/:id', (req, res) => {
  const inbox = wsRead(req, 'inbox.json', []);
  const item = inbox.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item niet gevonden' });
  const filtered = inbox.filter(i => i.id !== req.params.id);
  wsWrite(req, 'inbox.json', filtered);

  if (req.query.deleteLead === 'true' && item.leadId) {
    const leads = wsRead(req, 'leads.json', []);
    wsWrite(req, 'leads.json', leads.filter(l => l.id !== item.leadId));
  }

  res.json({ ok: true });
});


  return router;
};
