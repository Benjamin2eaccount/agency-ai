/**
 * routes/leads.js — Lead CRUD, scoring, export, tasks, case-study routes
 * Extracted from server.js during production hardening.
 */
const express = require('express');

module.exports = function createLeadsRouter(deps) {
  const {
    readJSON, wsRead, wsWrite, requireAdmin, scopeToUser,
    addLeadHistory, isDemoContext, aiJSON, updateMemoryConversion,
    isResendReady, generateClientEmail, sendEmail
  } = deps;

  const router = express.Router();

router.get('/', (req, res) => {
  res.json(scopeToUser(wsRead(req, 'leads.json', []), req));
});

router.get('/export.csv', (req, res) => {
  const leads = scopeToUser(wsRead(req, 'leads.json', []), req);
  const status = req.query.status; // optional filter
  const filtered = status ? leads.filter(l => l.status === status) : leads;

  const csvEsc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const headers = [
    'Bedrijfsnaam','Niche','Locatie','Land','Score','Status','Taal',
    'Website','Volgers','Waarde (EUR)','Email onderwerp',
    'Aangemaakt','Verstuurd','Gereageerd','Geopend (keer)'
  ];

  const rows = filtered.map(l => [
    l.companyName, l.niche, l.location, l.country,
    l.score != null ? Number(l.score).toFixed(2) : '',
    l.status, l.language,
    l.websiteUrl, l.estimatedFollowers, l.estimatedValue,
    l.email?.subject || '',
    l.createdAt ? l.createdAt.slice(0,10) : '',
    l.sentAt     ? l.sentAt.slice(0,10)     : '',
    l.repliedAt  ? l.repliedAt.slice(0,10)  : '',
    l.openCount  || ''
  ].map(csvEsc).join(','));

  const csv = [headers.join(','), ...rows].join('\r\n');
  const filename = `leads-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
});

router.post('/', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const { id: _id, createdAt: _ca, isDemo: _dm, portalToken: _pt, intakeToken: _it, ...safeBody } = req.body || {};
  const lead = { ...safeBody, id: Date.now().toString(), createdAt: new Date().toISOString() };
  leads.push(lead);
  wsWrite(req, 'leads.json', leads);
  res.json(lead);
});

router.post('/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids verplicht' });
  const leads = wsRead(req, 'leads.json', []);
  const inbox = wsRead(req, 'inbox.json', []);
  wsWrite(req, 'leads.json', leads.filter(l => !ids.includes(l.id)));
  wsWrite(req, 'inbox.json', inbox.filter(i => !ids.includes(i.id)));
  res.json({ ok: true, deleted: ids.length });
});

router.get('/unread-portal-count', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const count = leads.filter(l =>
    (l.portalChat || []).some(m => m.from === 'client' && !m.readAt)
  ).length;
  res.json({ count });
});

router.get('/check-duplicate', (req, res) => {
  const { name, domain, email } = req.query;
  if (!name && !domain && !email) return res.json({ duplicate: false });
  const leads = wsRead(req, 'leads.json', []);
  const nameLower  = (name   || '').toLowerCase().trim();
  const normDom = (domain || '').replace(/^https?:\/\//i,'').replace(/^www\./i,'').split('/')[0].replace(/:\d+$/,'').toLowerCase().trim();
  const emailLower = (email  || '').toLowerCase().trim();

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
    for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
      dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    return dp[m][n];
  }

  const found = leads.find(l => {
    const ln = (l.companyName  || '').toLowerCase().trim();
    const ld = (l.websiteUrl   || '').replace(/^https?:\/\//i,'').replace(/^www\./i,'').split('/')[0].replace(/:\d+$/,'').toLowerCase().trim();
    const le = (l.contactEmail || l.email || '').toLowerCase().trim();
    if (nameLower  && ln && nameLower  === ln) return true;
    if (normDom    && ld && normDom    === ld) return true;
    if (emailLower && le && emailLower === le) return true;
    // Fuzzy name match
    if (nameLower && ln && nameLower.length >= 3 && ln.length >= 3 && Math.abs(nameLower.length - ln.length) <= 3) {
      const dist = levenshtein(nameLower, ln);
      if (dist <= 2 || (Math.max(nameLower.length, ln.length) >= 8 && dist / Math.max(nameLower.length, ln.length) <= 0.25)) return true;
    }
    return false;
  });
  res.json(found ? { duplicate: true, id: found.id, companyName: found.companyName, status: found.status, score: found.score } : { duplicate: false });
});

router.get('/:id/reports', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(lead.reports || []);
});

router.post('/:id/case-study', async (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];

  // ── DEMO GUARD ──
  if (isDemoContext(req, lead)) {
    console.log(`[DEMO] Skipped real case-study generation for ${lead.companyName}`);
    const mockStudy = { title: `Case Study: ${lead.companyName}`, summary: 'Demo case study — geen echt AI-rapport gegenereerd.', sections: [], generatedAt: new Date().toISOString() };
    leads[idx].caseStudy = mockStudy;
    wsWrite(req, 'leads.json', leads);
    return res.json(mockStudy);
  }

  const settings = wsRead(req, 'settings.json', {});
  const agencyName = settings.agencyName || 'Agency';
  const lang = lead.language || 'nl';
  const isNL = lang === 'nl';

  const services = (lead.services || []).join(', ') || 'digitale marketing';
  const problems = (lead.problems || []).join(', ') || 'online zichtbaarheid verbeteren';
  const estimatedValue = lead.estimatedValue ? `€${lead.estimatedValue}/mnd` : '';

  const prompt = isNL
    ? `Schrijf een professionele case study voor een klant van ${agencyName}. Geef JSON terug met deze exacte velden.

Klantgegevens:
- Bedrijf: ${lead.companyName}
- Sector: ${lead.niche}
- Locatie: ${lead.location}
- Uitdagingen: ${problems}
- Diensten afgenomen: ${services}
${estimatedValue ? `- Investering: ${estimatedValue}` : ''}

Schrijf een realistische, overtuigende case study. Verzin plausibele resultaten (percentages, getallen) die passen bij de sector en diensten. Schrijf in de derde persoon over het bedrijf.

{"title": "Case study titel (max 8 woorden)", "industry": "${lead.niche}", "challenge": "2-3 zinnen over de uitdaging (geen jargon)", "solution": "2-3 zinnen over de aanpak van ${agencyName}", "results": ["Resultaat 1 met getal/percentage", "Resultaat 2 met getal/percentage", "Resultaat 3 met getal/percentage"], "quote": "Fictief klantcitaat van max 20 woorden, klinkt oprecht", "quoteName": "Voornaam + Achternaam, Functietitel", "published": false}`
    : `Write a professional case study for a client of ${agencyName}. Return JSON with these exact fields.

Client data:
- Company: ${lead.companyName}
- Industry: ${lead.niche}
- Location: ${lead.location}
- Challenges: ${problems}
- Services: ${services}
${estimatedValue ? `- Investment: ${estimatedValue}` : ''}

Write a realistic, convincing case study. Invent plausible results (percentages, numbers) that fit the industry and services. Write in third person about the company.

{"title": "Case study title (max 8 words)", "industry": "${lead.niche}", "challenge": "2-3 sentences about the challenge (no jargon)", "solution": "2-3 sentences about ${agencyName}'s approach", "results": ["Result 1 with number/percentage", "Result 2 with number/percentage", "Result 3 with number/percentage"], "quote": "Fictional client quote max 20 words, sounds genuine", "quoteName": "First Last, Job Title", "published": false}`;

  try {
    const caseStudy = await aiJSON(prompt);
    caseStudy.createdAt = new Date().toISOString();
    caseStudy.published = caseStudy.published || false;
    leads[idx].caseStudy = caseStudy;
    addLeadHistory(leads, lead.id, { event: 'caseStudy', label: 'Case study gegenereerd' });
    wsWrite(req, 'leads.json', leads);
    res.json(caseStudy);
  } catch (err) {
    console.error('[Case study] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/case-study', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!leads[idx].caseStudy) return res.status(404).json({ error: 'Geen case study' });
  leads[idx].caseStudy = { ...leads[idx].caseStudy, ...req.body };
  wsWrite(req, 'leads.json', leads);
  res.json(leads[idx].caseStudy);
});

router.patch('/:id', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const prevStatus = leads[idx].status;
  const { id: _id, createdAt: _ca, isDemo: _dm, portalToken: _pt, intakeToken: _it, ...safeBody } = req.body || {};
  leads[idx] = { ...leads[idx], ...safeBody };
  // Migrate old-format tasks (no id) to new format
  if (leads[idx].tasks) {
    leads[idx].tasks = leads[idx].tasks.map((t, i) => t.id ? t : {
      id: `legacy-${i}-${Date.now().toString(36)}`, title: t.title || 'Taak', description: t.description || '',
      week: 1, priority: t.priority || 'middel', status: t.done ? 'klaar' : 'todo', createdAt: new Date().toISOString()
    });
  }
  if (req.body.status && req.body.status !== prevStatus) {
    addLeadHistory(leads, req.params.id, { event: 'status', label: `Status: ${req.body.status}` });
    const lead = leads[idx];
    if (req.body.status === 'client') {
      updateMemoryConversion(lead.niche, lead.country, 'converted', lead.estimatedFollowers, lead.website?.speedScore);
    } else if (req.body.status === 'dead' || req.body.status === 'disapproved') {
      updateMemoryConversion(lead.niche, lead.country, 'lost', lead.estimatedFollowers, lead.website?.speedScore);
    }
  }
  if (req.body.projectBilling !== undefined || req.body.projectDuration !== undefined || req.body.projectStartDate !== undefined || req.body.estimatedValue !== undefined) {
    const b = req.body;
    const parts = [];
    if (b.projectBilling) parts.push(`facturering: ${b.projectBilling}`);
    if (b.projectDuration !== undefined) parts.push(`looptijd: ${b.projectDuration ? b.projectDuration + ' mnd' : 'onbepaald'}`);
    if (b.projectStartDate) parts.push(`start: ${b.projectStartDate}`);
    if (b.estimatedValue) parts.push(`prijs: €${b.estimatedValue}`);
    if (parts.length) addLeadHistory(leads, req.params.id, { event: 'projectConfig', label: `Project config bijgewerkt — ${parts.join(', ')}` });
  }
  wsWrite(req, 'leads.json', leads);
  res.json(leads[idx]);
});

router.delete('/:id', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const filtered = leads.filter(l => l.id !== req.params.id);
  wsWrite(req, 'leads.json', filtered);
  res.json({ ok: true });
});

// ─── Tasks per lead ──────────────────────────────────────────────────────────


router.post('/:id/tasks', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const { title, description, week, priority, assigneeId, status } = req.body;
  if (!title) return res.status(400).json({ error: 'title verplicht' });
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title, description: description || '', week: week || 1,
    priority: priority || 'middel', assigneeId: assigneeId || null,
    status: status || 'todo', createdAt: new Date().toISOString()
  };
  if (!leads[idx].tasks) leads[idx].tasks = [];
  leads[idx].tasks.push(task);
  wsWrite(req, 'leads.json', leads);
  res.json(task);
});

router.patch('/:id/tasks/:taskId', async (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  let tIdx = (leads[idx].tasks || []).findIndex(t => t.id === req.params.taskId);
  // Legacy fallback: tasks created before IDs were assigned — try numeric index
  if (tIdx === -1 && /^\d+$/.test(req.params.taskId)) {
    const numIdx = parseInt(req.params.taskId);
    if (numIdx >= 0 && numIdx < (leads[idx].tasks || []).length) {
      tIdx = numIdx;
      // Assign a real ID now so future calls use it
      if (!leads[idx].tasks[tIdx].id) {
        leads[idx].tasks[tIdx].id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      }
    }
  }
  if (tIdx === -1) return res.status(404).json({ error: 'Taak niet gevonden' });
  const { id: _tid, createdAt: _tca, ...safeTaskBody } = req.body || {};
  leads[idx].tasks[tIdx] = { ...leads[idx].tasks[tIdx], ...safeTaskBody };
  if (req.body.status === 'klaar' && !leads[idx].tasks[tIdx].doneAt) leads[idx].tasks[tIdx].doneAt = new Date().toISOString();
  wsWrite(req, 'leads.json', leads);
  res.json(leads[idx].tasks[tIdx]);

  // Auto week-complete email: check if all tasks in this week are now done
  if (req.body.status === 'klaar') {
    const settings = wsRead(req, 'settings.json', {});
    if (settings.autoClientEmails?.weekComplete !== false) {
      const week = leads[idx].tasks[tIdx].week || 1;
      const weekTasks = (leads[idx].tasks || []).filter(t => (t.week||1) === week);
      const allDone = weekTasks.length > 0 && weekTasks.every(t => t.status === 'klaar');
      const lead = leads[idx];
      if (allDone && lead.contactEmail && isResendReady(settings)) {
        // Only send once (check log)
        const alreadySent = (lead.clientEmailLog || []).some(e => e.trigger === 'weekComplete' && e.week === week);
        if (!alreadySent) {
          try {
            const email = await generateClientEmail(lead, 'weekComplete', settings, { week, tasksDone: weekTasks.length, tasksTotal: weekTasks.length });
            await sendEmail({ to: lead.contactEmail, subject: email.subject, body: email.body, settings });
            const freshLeads = wsRead(req, 'leads.json', []);
            const fIdx = freshLeads.findIndex(l => l.id === lead.id);
            if (fIdx !== -1) {
              if (!freshLeads[fIdx].clientEmailLog) freshLeads[fIdx].clientEmailLog = [];
              freshLeads[fIdx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'weekComplete', week, subject: email.subject, body: email.body, to: lead.contactEmail, sentAt: new Date().toISOString(), sentBy: 'systeem' });
              wsWrite(req, 'leads.json', freshLeads);
            }
            console.log(`[ClientEmail] weekComplete week ${week} → ${lead.companyName}`);
          } catch { /* optional */ }
        }
      }
    }
  }
});

router.delete('/:id/tasks/:taskId', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].tasks = (leads[idx].tasks || []).filter(t => t.id !== req.params.taskId);
  wsWrite(req, 'leads.json', leads);
  res.json({ ok: true });
});

router.post('/:id/portal/generate', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const token = Math.random().toString(36).substr(2, 8) + Math.random().toString(36).substr(2, 4);
  leads[idx].portalToken = token;
  if (!leads[idx].currentPhase) leads[idx].currentPhase = 1;
  addLeadHistory(leads, req.params.id, { event: 'portalCreated', label: 'Klantportaal aangemaakt' });
  wsWrite(req, 'leads.json', leads);
  res.json({ token });
});


  return router;
};
