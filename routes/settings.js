/**
 * routes/settings.js — All settings CRUD routes
 * Extracted from server.js for code organization.
 */
'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');

module.exports = function createSettingsRouter({ wsRead, wsWrite, getDb, requireAdmin, encryptApiKey, encryptGmailPassword, getGmailPassword, isGmailReady, isClaudeReady, buildEmailHTML, readJSON, writeJSON, DEFAULT_SERVICES, scheduleCron, scheduleBriefingCron, scheduleBackupCron }) {
  const router = express.Router();

router.get('', (req, res) => {
  try {
    const wId = req.user?.workspaceId;
    const isAgencyAI = !wId || wId === 'ws_agencyai';

    // ── Agency AI: full global settings (no isolation needed) ───────────────
    if (isAgencyAI) {
      const s = wsRead(req, 'settings.json', {});
      const safe = { ...s };
      delete safe.password; delete safe.gmailPassword; delete safe.gmailPasswordEncrypted;
      delete safe.claudeApiKeyEncrypted; delete safe.resendApiKey;
      delete safe.stripeSecretKey; delete safe.mollieApiKey;
      safe.stripeConfigured = !!(s.stripeSecretKey);
      safe.mollieConfigured = !!(s.mollieApiKey);
      safe.paypalConfigured = !!(s.paypalMe);
      safe.autoArchiveEnabled = s.autoArchiveEnabled !== undefined ? s.autoArchiveEnabled : true;
      safe.autoArchiveDays    = s.autoArchiveDays    || 30;
      safe.bankTransferConfigured = !!(s.bankTransferIban);
      safe.bankTransferIban = s.bankTransferIban || '';
      safe.bankTransferName = s.bankTransferName || '';
      safe.bankTransferBic  = s.bankTransferBic  || '';
      safe.paymentTermDays  = s.paymentTermDays  || 14;
      safe.preferredPaymentMethod = s.preferredPaymentMethod || 'bank_transfer';
      safe.fixedCosts = s.fixedCosts && s.fixedCosts.length
        ? s.fixedCosts
        : (s.monthlyHostingCost ? [{ name: 'Hosting', amount: s.monthlyHostingCost }]
          : [{ name: 'Railway hosting', amount: 5 }, { name: 'Claude API', amount: 15 },
             { name: 'Domein', amount: 2 }, { name: 'Google Workspace', amount: 6 }]);
      safe.autoInvoiceEnabled = s.autoInvoiceEnabled || false;
      safe.autoInvoiceDay = s.autoInvoiceDay || 1;
      safe.paymentReminderDays = s.paymentReminderDays || 7;
      safe.gmailConfigured  = isGmailReady(s);
      safe.gmailPasswordSet = !!(s.gmailPasswordEncrypted || (s.gmailPassword && s.gmailPassword !== '__encrypted__') || process.env.GMAIL_APP_PASSWORD);
      safe.claudeKeyConfigured = isClaudeReady(s);
      safe.claudeKeyFromEnv    = !!(process.env.CLAUDE_API_KEY) && !s.claudeApiKeyEncrypted;
      safe.resendConfigured    = !!(s.resendApiKey || process.env.RESEND_API_KEY);
      safe.resendFromAddress   = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || '';
      return res.json(safe);
    }

    // ── Tenant workspace: ONLY workspace-scoped settings, never global ───────
    const WorkspaceStore = require('../lib/workspaceStore');
    const store = new WorkspaceStore(wId);
    const ws_s = store.readDirect('settings.json') || {}; // null → empty object, NO global fallback

    // Live workspace info from DB (always fresh)
    let ws = null;
    try { ws = getDb().prepare('SELECT * FROM workspaces WHERE id = ?').get(wId); } catch (err) { console.error(`[DB]`, err.message);}

    // Build clean response — whitelist only, no env-var leakage
    const result = {
      // Identity (workspace-specific, with DB overlay)
      agencyName:   ws?.branding_name  || ws_s.agencyName  || ws?.name        || '',
      myName:       ws?.owner_name     || ws_s.myName      || '',
      agencyLogo:   ws?.branding_logo  || ws_s.agencyLogo  || '',
      brandColor:   ws?.branding_color || ws_s.brandColor  || '#2563EB',
      email:        ws_s.email         || ws?.owner_email  || '',
      username:     ws_s.username      || ws?.owner_email  || '',
      myTitle:      ws_s.myTitle       || '',
      calendlyUrl:  ws_s.calendlyUrl   || '',
      gaId:         ws_s.gaId          || '',

      // Workspace metadata
      _workspaceName: ws?.name || '',
      _workspaceSlug: ws?.slug || '',
      _workspacePlan: ws?.plan || 'starter',

      // Financial — workspace-specific IBAN, never Agency AI's
      iban:                ws_s.iban                || '',
      bic:                 ws_s.bic                 || '',
      tenaamstelling:      ws_s.tenaamstelling       || '',
      emailSignature:      ws_s.emailSignature       || '',
      bankTransferIban:    ws_s.bankTransferIban      || '',
      bankTransferName:    ws_s.bankTransferName      || '',
      bankTransferBic:     ws_s.bankTransferBic       || '',
      bankTransferConfigured: !!(ws_s.bankTransferIban),
      paymentTermDays:     ws_s.paymentTermDays       || 14,
      preferredPaymentMethod: ws_s.preferredPaymentMethod || 'bank_transfer',
      autoInvoiceEnabled:  ws_s.autoInvoiceEnabled    || false,
      autoInvoiceDay:      ws_s.autoInvoiceDay         || 1,
      paymentReminderDays: ws_s.paymentReminderDays    || 7,
      btwEnabled:          ws_s.btwEnabled             || false,
      btwRate:             ws_s.btwRate                || 21,
      btwNumber:           ws_s.btwNumber              || '',
      fixedCosts: [],  // Not shown to tenants (Agency AI's own P&L)
      stripeConfigured: !!(ws_s.stripeSecretKey),
      mollieConfigured: !!(ws_s.mollieApiKey),
      paypalConfigured: !!(ws_s.paypalMe),

      // Email — workspace-specific Resend key only, NOT platform env var
      resendConfigured:  !!(ws_s.resendApiKey),
      resendFromAddress: ws_s.resendFromAddress || '',

      // IMAP — workspace-specific credentials only
      gmailAddress:    ws_s.gmailAddress    || '',
      gmailConfigured: !!(ws_s.gmailAddress && (ws_s.gmailPasswordEncrypted || ws_s.gmailPassword)),
      gmailPasswordSet: !!(ws_s.gmailPasswordEncrypted || (ws_s.gmailPassword && ws_s.gmailPassword !== '__encrypted__')),

      // Claude: platform provides this, show as configured for all tenants
      claudeKeyConfigured: !!(process.env.CLAUDE_API_KEY),
      claudeKeyFromEnv:    true,

      // Toggles — all default OFF; read from workspace settings if saved
      replyDetection:        ws_s.replyDetection        || false,
      dailyBriefingEnabled:  ws_s.dailyBriefingEnabled  || false,
      briefingTime:          ws_s.briefingTime           || '08:00',
      weeklyUpdatesEnabled:  ws_s.weeklyUpdatesEnabled   || false,
      aiAutoReply:           ws_s.aiAutoReply            || false,
      aiAutoReplySend:       ws_s.aiAutoReplySend        || false,
      monthlyReports:        ws_s.monthlyReports         || false,
      backupEnabled:         ws_s.backupEnabled          || false,
      backupTime:            ws_s.backupTime             || '02:00',
      backupEmail:           ws_s.backupEmail            || false,
      autoArchiveEnabled:    ws_s.autoArchiveEnabled     || false,
      autoArchiveDays:       ws_s.autoArchiveDays        || 30,
      automationPaused:      ws_s.automationPaused       || false,

      // Client email toggles — all OFF by default for new workspaces
      autoClientEmails: ws_s.autoClientEmails || {
        welcome: false, intakeReceived: false, deliveryReady: false,
        weekComplete: false, monthlyUpdate: false, checkIn: false,
      },

      // Run settings
      dailyRunTime:    ws_s.dailyRunTime    || '09:00',
      leadsPerDay:     ws_s.leadsPerDay     || 10,
      targetNiches:    ws_s.targetNiches    || [],
      targetSubNiches: ws_s.targetSubNiches || [],
      niches:          ws_s.niches          || [],

      // Services
      services: ws_s.services || [],

      // Onboarding
      onboardingCompleted: ws_s.onboardingCompleted || false,
    };

    // Spread any other saved workspace-specific fields (won't overwrite above)
    Object.keys(ws_s).forEach(k => {
      if (!(k in result) && !['password','gmailPassword','gmailPasswordEncrypted',
        'claudeApiKeyEncrypted','resendApiKey','stripeSecretKey','mollieApiKey'].includes(k)) {
        result[k] = ws_s[k];
      }
    });

    res.json(result);
  } catch(e) {
    console.error('[GET /api/settings]', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.patch('/account', requireAdmin, async (req, res) => {
  // Use wsRead/wsWrite so non-agencyai workspaces save to their own scoped file
  const settings = wsRead(req, 'settings.json', {});
  const { agencyName, myName, myTitle, username, newPassword, currentPassword, websiteTagline, websiteAbout, websiteContact, calendlyUrl, agencyLogo } = req.body;

  if (agencyName) settings.agencyName = agencyName;
  if (myName) settings.myName = myName;
  if (myTitle) settings.myTitle = myTitle;
  if (username) settings.username = username;
  if (websiteTagline !== undefined) settings.websiteTagline = websiteTagline;
  if (websiteAbout   !== undefined) settings.websiteAbout   = websiteAbout;
  if (websiteContact !== undefined) settings.websiteContact = websiteContact;
  if (calendlyUrl    !== undefined) settings.calendlyUrl    = calendlyUrl;
  if (agencyLogo     !== undefined) {
    if (agencyLogo === '' || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);base64,/.test(agencyLogo)) {
      settings.agencyLogo = agencyLogo;
    }
  }
  const { gaId } = req.body;
  if (gaId !== undefined) settings.gaId = gaId;
  if (req.body.onboardingCompleted !== undefined) settings.onboardingCompleted = !!req.body.onboardingCompleted;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Huidig wachtwoord verplicht' });
    const users = readJSON('users.json') || [];
    const uIdx  = users.findIndex(u => u.id === req.user.id);
    if (uIdx === -1) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
    const ok = await bcrypt.compare(currentPassword, users[uIdx].password);
    if (!ok) return res.status(401).json({ error: 'Huidig wachtwoord onjuist' });
    const hashed = await bcrypt.hash(newPassword, 12);
    users[uIdx].password = hashed;
    writeJSON('users.json', users);
    settings.password = hashed;
  }

  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

// NOTE: /api/agency-profiles routes remain in server.js (different prefix)

router.patch('/gmail', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json', {});
  const { gmailAddress, gmailPassword, replyDetection, webhookToken, webhookConfigured } = req.body;
  if (gmailAddress !== undefined) settings.gmailAddress = gmailAddress;
  if (gmailPassword !== undefined && gmailPassword !== '') {
    settings.gmailPasswordEncrypted = encryptGmailPassword(gmailPassword);
    settings.gmailPassword = '__encrypted__';
  }
  if (replyDetection !== undefined) settings.replyDetection = replyDetection;
  if (webhookToken !== undefined) settings.webhookToken = webhookToken;
  if (webhookConfigured !== undefined) settings.webhookConfigured = webhookConfigured;
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

router.patch('/services', requireAdmin, (req, res) => {
  if (!Array.isArray(req.body.services)) return res.status(400).json({ error: 'Services moet een array zijn' });
  const settings = wsRead(req, 'settings.json', {});
  settings.services = req.body.services;
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

router.patch('/claude-key', requireAdmin, (req, res) => {
  const { claudeApiKey } = req.body;
  if (!claudeApiKey || !claudeApiKey.trim()) {
    return res.status(400).json({ error: 'API sleutel is verplicht' });
  }
  const settings = wsRead(req, 'settings.json', {});
  settings.claudeApiKeyEncrypted = encryptApiKey(claudeApiKey.trim());
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

router.patch('/resend', requireAdmin, (req, res) => {
  const { resendApiKey, resendFromAddress, agencyName } = req.body;
  const settings = wsRead(req, 'settings.json', {});
  if (resendApiKey    !== undefined) settings.resendApiKey    = resendApiKey;
  if (resendFromAddress !== undefined) settings.resendFromAddress = resendFromAddress;
  if (agencyName      !== undefined) settings.agencyName      = agencyName;
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

router.get('/services/defaults', (req, res) => {
  res.json(DEFAULT_SERVICES);
});

router.patch('/automation', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json', {});
  const { dailyRunTime, leadsPerDay, autoApproveScore, automationPaused, linkedinUrl, dailyBriefingEnabled, dailyBriefingTime, smartAutoApprove, monthlyReports, backupEnabled, backupTime, backupEmail, targetCompanySizes } = req.body;
  if (dailyRunTime !== undefined) settings.dailyRunTime = dailyRunTime;
  if (leadsPerDay !== undefined) settings.leadsPerDay = leadsPerDay;
  if (autoApproveScore !== undefined) settings.autoApproveScore = autoApproveScore;
  if (automationPaused !== undefined) settings.automationPaused = automationPaused;
  if (linkedinUrl !== undefined) settings.linkedinUrl = linkedinUrl;
  if (dailyBriefingEnabled !== undefined) settings.dailyBriefingEnabled = dailyBriefingEnabled;
  if (dailyBriefingTime !== undefined) settings.dailyBriefingTime = dailyBriefingTime;
  if (smartAutoApprove !== undefined) settings.smartAutoApprove = smartAutoApprove;
  if (monthlyReports !== undefined) settings.monthlyReports = monthlyReports;
  if (backupEnabled !== undefined) settings.backupEnabled = backupEnabled;
  if (backupTime   !== undefined) settings.backupTime    = backupTime;
  if (backupEmail  !== undefined) settings.backupEmail   = backupEmail;
  if (targetCompanySizes !== undefined) settings.targetCompanySizes = targetCompanySizes;
  if (req.body.autoClientEmails !== undefined) settings.autoClientEmails = req.body.autoClientEmails;
  if (req.body.autoInvoiceEnabled !== undefined) settings.autoInvoiceEnabled = req.body.autoInvoiceEnabled;
  if (req.body.autoInvoiceDay !== undefined) settings.autoInvoiceDay = req.body.autoInvoiceDay;
  if (req.body.paymentReminderDays !== undefined) settings.paymentReminderDays = req.body.paymentReminderDays;
  if (req.body.btwEnabled !== undefined) settings.btwEnabled = req.body.btwEnabled;
  if (req.body.btwRate !== undefined) settings.btwRate = req.body.btwRate;
  if (req.body.btwNumber !== undefined) settings.btwNumber = req.body.btwNumber;
  if (req.body.aiRateLimits     !== undefined) settings.aiRateLimits     = req.body.aiRateLimits;
  if (req.body.aiAutoReply          !== undefined) settings.aiAutoReply          = req.body.aiAutoReply;
  if (req.body.aiAutoReplySend      !== undefined) settings.aiAutoReplySend      = req.body.aiAutoReplySend;
  if (req.body.monthlyHostingCost   !== undefined) settings.monthlyHostingCost   = parseFloat(req.body.monthlyHostingCost) || 0;
  if (req.body.fixedCosts !== undefined && Array.isArray(req.body.fixedCosts)) settings.fixedCosts = req.body.fixedCosts;
  if (req.body.instagramTargeting   !== undefined) settings.instagramTargeting   = req.body.instagramTargeting;
  if (req.body.googleMapsTargeting  !== undefined) settings.googleMapsTargeting  = req.body.googleMapsTargeting;
  if (req.body.weeklyUpdatesEnabled !== undefined) settings.weeklyUpdatesEnabled = req.body.weeklyUpdatesEnabled;
  if (req.body.targetNiches    !== undefined) settings.targetNiches    = req.body.targetNiches;
  if (req.body.targetSubNiches !== undefined) settings.targetSubNiches = req.body.targetSubNiches;
  if (req.body.autoArchiveEnabled !== undefined) settings.autoArchiveEnabled = req.body.autoArchiveEnabled;
  if (req.body.autoArchiveDays    !== undefined) settings.autoArchiveDays    = parseInt(req.body.autoArchiveDays) || 30;
  if (req.body.notificationPreferences !== undefined && typeof req.body.notificationPreferences === 'object') {
    const VALID_TYPES = ['reply_received', 'intake_submitted', 'high_score_lead', 'payment_overdue', 'run_complete', 'calendly_booking', 'payment_received', 'client_question', 'contact_form', 'email_bounced'];
    const clean = {};
    for (const [k, v] of Object.entries(req.body.notificationPreferences)) {
      if (VALID_TYPES.includes(k) || VALID_TYPES.some(t => k === t + '_push')) {
        clean[k] = v === true || v === false ? v : true;
      }
    }
    settings.notificationPreferences = { ...(settings.notificationPreferences || {}), ...clean };
  }
  wsWrite(req, 'settings.json', settings);
  scheduleCron(); // re-schedule if run time changed
  scheduleBriefingCron(); // re-schedule briefing if time changed
  scheduleBackupCron(); // re-schedule backup if time changed
  res.json({ ok: true });
});

router.post('/test-email', requireAdmin, async (req, res) => {
  console.log('[TestMail] Starting...');
  const s = wsRead(req, 'settings.json', {});
  const resendKey   = s.resendApiKey || process.env.RESEND_API_KEY;
  const fromAddress = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info';
  const testRecipient = s.adminEmail || s.gmailAddress || 'info@agencyai.info';

  console.log('[TestEmail] Sending to:', testRecipient);
  console.log('[TestMail] Key set:', !!resendKey, '| From:', fromAddress, '| To:', testRecipient);

  if (!resendKey) {
    console.log('[TestMail] No RESEND_API_KEY — aborting');
    return res.status(400).json({ success: false, error: 'Resend API sleutel niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen → Email.' });
  }

  try {
    const { default: fetch } = await import('node-fetch');

    // Check domain verification status in Resend
    try {
      const domainRes = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${resendKey}` }
      });
      const domainData = await domainRes.json();
      console.log('[TestMail] Resend domain verification status:', JSON.stringify(domainData?.data?.map(d => ({ name: d.name, status: d.status, spf: d.records?.find(r=>r.type==='SPF')?.status, dkim: d.records?.find(r=>r.type?.includes('DKIM'))?.status }))));
    } catch (domErr) {
      console.warn('[TestMail] Could not fetch domain status:', domErr.message);
    }

    console.log('[TestMail] Sending via Resend...');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `"${s.agencyName || 'Agency AI'}" <${fromAddress}>`,
        to: testRecipient,
        subject: 'Agency AI — Testmail ✓',
        html: buildEmailHTML(
          `Beste ${s.myName || 'Admin'},\n\nDit is een testmail om te bevestigen dat Resend correct is ingesteld en dat Agency AI emails kan versturen namens ${s.agencyName || 'Agency AI'}.\n\nDit is het nieuwe professionele email-template dat gebruikt wordt voor alle outreach.`,
          s.agencyName || 'Agency AI',
          s.myName || 'Admin',
          s.myTitle || 'AI Growth Specialist',
          null,
          { myEmail: fromAddress, calendlyLink: s.calendlyUrl || '' }
        )
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('[TestMail] Resend rejected:', JSON.stringify(d));
      return res.status(500).json({ success: false, error: d.message || d.error || `Resend fout ${r.status}` });
    }
    console.log('[TestEmail] Resend response:', JSON.stringify(d));
    console.log('[TestMail] Success, id:', d.id, '→', testRecipient);
    return res.json({ success: true, ok: true, message: `Testmail verstuurd naar ${testRecipient}` });
  } catch (err) {
    console.error('[TestMail] Exception:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/test-imap', requireAdmin, async (req, res) => {
  console.log('[TestIMAP] Starting...');
  const s    = wsRead(req, 'settings.json', {});
  const user = s.gmailAddress || process.env.GMAIL_USER || process.env.GMAIL_ADDRESS;
  const pass = getGmailPassword(s);

  if (!user) return res.status(400).json({ success: false, error: 'Email adres niet ingesteld' });
  if (!pass) return res.status(400).json({ success: false, error: 'Email wachtwoord niet ingesteld' });

  let imapSimple;
  try { imapSimple = require('imap-simple'); }
  catch { return res.status(500).json({ success: false, error: 'imap-simple module niet beschikbaar' }); }

  let connection;
  try {
    connection = await imapSimple.connect({
      imap: { user, password: pass, host: 'imap.soverin.net', port: 993, tls: true,
              tlsOptions: { rejectUnauthorized: false }, authTimeout: 10000 }
    });
    const box = await connection.openBox('INBOX');
    const total = box?.messages?.total ?? '?';
    connection.end();
    console.log('[TestIMAP] OK — inbox messages:', total);
    return res.json({ success: true, message: `IMAP verbinding geslaagd ✓ — ${total} berichten gevonden`, user });
  } catch (err) {
    if (connection) try { connection.end(); } catch { /* IMAP connection already closed */ }
    console.error('[TestIMAP] Fout:', err.message);
    const friendly = err.message.includes('Invalid credentials') || err.message.includes('AUTHENTICATIONFAILED')
      ? 'Ongeldige inloggegevens — controleer Gmail adres en app-wachtwoord'
      : err.message.includes('IMAP access') || err.message.includes('disabled')
      ? 'IMAP is uitgeschakeld in Gmail — zie instructies hieronder'
      : err.message;
    return res.status(500).json({ success: false, error: friendly });
  }
});

router.patch('/stripe', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json', {});
  const { stripeSecretKey, mollieApiKey, paypalMe, preferredPaymentMethod, bankTransferIban, bankTransferName, bankTransferBic, paymentTermDays } = req.body;
  if (stripeSecretKey !== undefined) settings.stripeSecretKey = stripeSecretKey;
  if (mollieApiKey !== undefined) settings.mollieApiKey = mollieApiKey;
  if (paypalMe !== undefined) settings.paypalMe = paypalMe;
  if (preferredPaymentMethod !== undefined) settings.preferredPaymentMethod = preferredPaymentMethod;
  if (bankTransferIban !== undefined) settings.bankTransferIban = bankTransferIban;
  if (bankTransferName !== undefined) settings.bankTransferName = bankTransferName;
  if (bankTransferBic  !== undefined) settings.bankTransferBic  = bankTransferBic;
  if (paymentTermDays  !== undefined) settings.paymentTermDays  = parseInt(paymentTermDays) || 14;
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

// DELETE /api/settings/leads — clear all leads + inbox
router.delete('/leads', requireAdmin, (req, res) => {
  wsWrite(req, 'leads.json', []);
  wsWrite(req, 'inbox.json', []);
  res.json({ ok: true });
});

// DELETE /api/settings/stats — reset stats
router.delete('/stats', requireAdmin, (req, res) => {
  wsWrite(req, 'stats.json', { leadsFound: 0, emailsSent: 0, replies: 0, pipelineValue: 0, weeklyData: [] });
  res.json({ ok: true });
});

// GET /api/settings/export — export settings (safe fields only)
router.get('/export', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json') || {};
  const safe = { ...settings };
  delete safe.password; delete safe.gmailPassword; delete safe.gmailPasswordEncrypted;
  delete safe.claudeApiKeyEncrypted; delete safe.resendApiKey; delete safe.stripeSecretKey;
  delete safe.mollieApiKey; delete safe.vapidPrivateKey;
  res.setHeader('Content-Disposition', 'attachment; filename="agency-ai-settings.json"');
  res.json(safe);
});

// POST /api/settings/import — import safe settings fields
router.post('/import', requireAdmin, (req, res) => {
  const imported = req.body;
  if (!imported || typeof imported !== 'object') return res.status(400).json({ error: 'Ongeldig JSON' });
  const settings = wsRead(req, 'settings.json') || {};
  const SAFE = ['agencyName','myName','myTitle','agencyAddress','calendlyUrl','gaId','services','targetNiches','targetSubNiches','autoArchiveDays','autoArchiveEnabled','fixedCosts','btwEnabled','btwRate','btwNumber'];
  SAFE.forEach(k => { if (imported[k] !== undefined) settings[k] = imported[k]; });
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

// GET/POST /api/settings/ip-whitelist
router.get('/ip-whitelist', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json') || {};
  res.json({ whitelist: settings.adminIpWhitelist || [] });
});

router.post('/ip-whitelist', requireAdmin, (req, res) => {
  const settings = wsRead(req, 'settings.json') || {};
  settings.adminIpWhitelist = Array.isArray(req.body.whitelist) ? req.body.whitelist : [];
  wsWrite(req, 'settings.json', settings);
  res.json({ ok: true });
});

  return router;
};
