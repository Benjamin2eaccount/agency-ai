// ─── Dashboard ────────────────────────────────────────────────────────────────

function _dashGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'Goedemorgen';
  if (h >= 12 && h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function _dashDailyGreeting() {
  const h = new Date().getHours();
  if (h >= 6 && h < 12) return 'Goedemorgen';
  if (h >= 12 && h < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

function _initColor(name) {
  const COLORS = ['#2563eb','#7c3aed','#db2777','#dc2626','#d97706','#16a34a','#0891b2','#4f46e5'];
  if (!name) return COLORS[0];
  return COLORS[name.trim().charCodeAt(0) % COLORS.length];
}

function _dashScore(lead) {
  const raw = Number(lead?.score || lead?.leadScore || 0);
  if (!Number.isFinite(raw)) return 0;
  return raw > 10 ? raw / 10 : raw;
}

function _dashAgeDays(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return 0;
  return (Date.now() - t) / 86400000;
}

function _dashIsToday(iso) {
  const d = new Date(iso || 0);
  if (!Number.isFinite(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function _dashIsOpenTask(task) {
  return task && task.done !== true && task.status !== 'klaar' && task.status !== 'done';
}

function _dashIsDemoId(id) {
  return String(id || '').indexOf('demo-') === 0;
}

function _dashIso(days = 0, hour = null, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  if (hour !== null) d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function _dashAddMinutes(iso, minutes) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return iso;
  return new Date(t + minutes * 60000).toISOString();
}

function _dashFirstDate(...values) {
  for (const v of values) {
    const t = new Date(v || 0).getTime();
    if (Number.isFinite(t) && t > 0) return v;
  }
  return null;
}

function _dashTimelineTime(iso) {
  const d = new Date(iso || 0);
  if (!Number.isFinite(d.getTime())) return 'Vandaag';
  if (_dashIsToday(iso)) {
    return d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  return typeof relativeTime === 'function' ? relativeTime(iso) : d.toLocaleDateString('nl-NL');
}

function _dashHasClientSignal(lead) {
  const unreadChat = (lead.portalChat || []).some(m => m.from === 'client' && !m.readAt);
  const openContact = (lead.contactSubmissions || []).some(s => !s.readAt && !s.handledAt && !s.resolvedAt);
  const recentSiteFeedback = (lead.generatedSite?.feedback || []).some(f => !f.readAt && !f.handledAt && !f.resolvedAt && _dashAgeDays(f.time) <= 14);
  return unreadChat || openContact || recentSiteFeedback;
}

function _dashIsOverdueProject(lead) {
  const openTaskOverdue = (lead.tasks || []).some(t => {
    const due = t.dueDate || t.deadline || t.date;
    return _dashIsOpenTask(t) && due && new Date(due).getTime() < Date.now();
  });
  const noIntake = lead.projectStartedAt && !lead.intakeSubmittedAt && _dashAgeDays(lead.projectStartedAt) > 7;
  const noDeliverables = lead.intakeSubmittedAt && !(lead.agentDeliverables || []).length && _dashAgeDays(lead.intakeSubmittedAt) > 14;
  const waitingApproval = (lead.agentDeliverables || []).some(d => d.status === 'wacht_op_goedkeuring' && d.builtAt && _dashAgeDays(d.builtAt) > 7);
  return openTaskOverdue || noIntake || noDeliverables || waitingApproval;
}

function _dashClientSignalTime(lead) {
  const times = [];
  (lead.portalChat || []).forEach(m => {
    if (m.from === 'client' && !m.readAt) times.push(_dashFirstDate(m.time, m.createdAt, m.sentAt));
  });
  (lead.contactSubmissions || []).forEach(s => {
    if (!s.readAt && !s.handledAt && !s.resolvedAt) times.push(_dashFirstDate(s.time, s.createdAt, s.submittedAt));
  });
  (lead.generatedSite?.feedback || []).forEach(f => {
    if (!f.readAt && !f.handledAt && !f.resolvedAt) times.push(_dashFirstDate(f.time, f.createdAt));
  });
  return times.filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;
}

function buildDashboardActivityTimeline(leads = [], inbox = [], recentRuns = []) {
  const items = [];
  const push = (agent, text, time, color) => {
    if (!text) return;
    items.push({ agent, text, time: time || null, color });
  };

  recentRuns.slice(0, 3).forEach(r => {
    const leadsFound = Number(r.leadsFound || r.found || 0);
    const emailsPrepared = Number(r.emailsSent || r.approved || 0);
    if (leadsFound > 0) push('Research Agent', `vond ${leadsFound} leads.`, r.createdAt, '#2563EB');
    if (emailsPrepared > 0) push('Outreach Agent', `bereidde ${emailsPrepared} emails voor.`, _dashAddMinutes(r.createdAt, 12), '#0891B2');
  });

  const scheduledToday = (inbox || []).filter(i => i.status === 'scheduled' && _dashIsToday(i.scheduledAt));
  if (scheduledToday.length) {
    const firstScheduled = scheduledToday
      .map(i => i.scheduledAt)
      .filter(Boolean)
      .sort((a, b) => new Date(a) - new Date(b))[0];
    push('Outreach Agent', `plande ${scheduledToday.length} email${scheduledToday.length !== 1 ? 's' : ''} voor vandaag.`, firstScheduled, '#16A34A');
  }

  const pendingInbox = (inbox || []).filter(i => !i.status || i.status === 'pending');
  const pendingTime = _dashFirstDate(...pendingInbox.map(i => i.createdAt || i.generatedAt || i.time));
  if (pendingInbox.length && pendingTime) {
    push('Outreach Agent', `zette ${pendingInbox.length} email${pendingInbox.length !== 1 ? 's' : ''} klaar voor review.`, pendingTime, '#D97706');
  }

  (leads || [])
    .filter(l => l.repliedAt)
    .sort((a, b) => new Date(b.repliedAt) - new Date(a.repliedAt))
    .slice(0, 3)
    .forEach(l => push('Sales Signal', `${l.companyName || 'Een lead'} reageerde.`, l.repliedAt, '#16A34A'));

  (leads || [])
    .filter(l => l.status === 'client' && _dashHasClientSignal(l))
    .slice(0, 3)
    .forEach(l => push('Portal Agent', `detecteerde feedback van ${l.companyName || 'een klant'}.`, _dashClientSignalTime(l), '#D97706'));

  (leads || [])
    .filter(l => ['approved','replied','client'].includes(l.status))
    .filter(l => !(l.proposal || l.proposalGeneratedAt || (Array.isArray(l.proposals) && l.proposals.length)))
    .slice(0, 2)
    .forEach(l => push('Proposal Agent', `zette een volgende stap klaar voor ${l.companyName || 'een lead'}.`, _dashFirstDate(l.repliedAt, l.projectStartedAt, l.createdAt), '#7c3aed'));

  (leads || [])
    .filter(l => l.status === 'client' && _dashIsOverdueProject(l))
    .slice(0, 2)
    .forEach(l => push('Client Health', `${l.companyName || 'Een klant'} vraagt opvolging.`, _dashFirstDate(l.projectStartedAt, l.intakeSubmittedAt, l.createdAt), '#DC2626'));

  return items
    .sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0))
    .slice(0, 8);
}

function shouldUseDashboardDemoState(leads = [], inbox = [], runs = [], stats = {}) {
  const meaningfulLead = (leads || []).some(l =>
    ['approved','scheduled','sent','replied','client'].includes(l.status) ||
    l.repliedAt || l.projectStartedAt || (l.agentDeliverables || []).length
  );
  const meaningfulInbox = (inbox || []).some(i => !i.status || ['pending','scheduled'].includes(i.status));
  const meaningfulStats = (stats?.emailsSent || 0) > 0 || (stats?.clients || 0) > 0 || (stats?.replies || 0) > 0;
  if ((leads || []).length + (inbox || []).length + (runs || []).length === 0) return true;
  return (leads || []).length <= 1 && !(inbox || []).length && !(runs || []).length &&
    !meaningfulLead && !meaningfulInbox && !meaningfulStats;
}

function buildDashboardDemoState(baseStats = {}) {
  const leads = [
    {
      id: 'demo-lead-acme', _demo: true, companyName: 'Acme Studio', niche: 'Beauty',
      location: 'Utrecht', status: 'replied', score: 9.1, estimatedValue: 2400,
      createdAt: _dashIso(-1, 10), repliedAt: _dashIso(0, 9)
    },
    {
      id: 'demo-lead-velora', _demo: true, companyName: 'Velora Dental', niche: 'Zorg',
      location: 'Amsterdam', status: 'approved', score: 8.7, estimatedValue: 3200,
      createdAt: _dashIso(-2, 14)
    },
    {
      id: 'demo-client-nova', _demo: true, companyName: 'Studio Nova', niche: 'Creative',
      location: 'Rotterdam', status: 'client', score: 8.4, estimatedValue: 1800,
      projectStartedAt: _dashIso(-10, 11), payments: [{ status: 'sent', dueDate: _dashIso(-2, 12), amount: 895 }]
    },
    {
      id: 'demo-client-koffie', _demo: true, companyName: 'Koffiebar Noord', niche: 'Horeca',
      location: 'Haarlem', status: 'client', score: 8.9, estimatedValue: 1495,
      projectStartedAt: _dashIso(-6, 13), intakeSubmittedAt: _dashIso(-5, 10),
      portalChat: [{ id: 'demo-chat-1', from: 'client', message: 'Kunnen we de openingsuren aanpassen?', time: _dashIso(0, 8) }],
      agentDeliverables: [{ status: 'wacht_op_goedkeuring', builtAt: _dashIso(-8, 16), service: 'Website update' }]
    },
    {
      id: 'demo-client-lumen', _demo: true, companyName: 'Fysiopraktijk Lumen', niche: 'Zorg',
      location: 'Leiden', status: 'client', score: 8.2, estimatedValue: 1295,
      projectStartedAt: _dashIso(-18, 9), intakeSubmittedAt: _dashIso(-17, 13),
      agentDeliverables: [{ status: 'approved', builtAt: _dashIso(-4, 15), service: 'Boekingssysteem' }],
      payments: [{ status: 'paid', paidAt: _dashIso(-3, 12), amount: 1295 }]
    }
  ];

  const inbox = [
    { id: 'demo-inbox-1', _demo: true, leadId: 'demo-lead-acme', companyName: 'Acme Studio', niche: 'Beauty', location: 'Utrecht', score: 9.1, status: 'pending' },
    { id: 'demo-inbox-2', _demo: true, leadId: 'demo-lead-velora', companyName: 'Velora Dental', niche: 'Zorg', location: 'Amsterdam', score: 8.7, status: 'pending' },
    { id: 'demo-scheduled-1', _demo: true, companyName: 'Kapsalon Mira', status: 'scheduled', scheduledAt: _dashIso(0, 11) },
    { id: 'demo-scheduled-2', _demo: true, companyName: 'Yoga Flow', status: 'scheduled', scheduledAt: _dashIso(0, 13) },
    { id: 'demo-scheduled-3', _demo: true, companyName: 'Bakkerij Prins', status: 'scheduled', scheduledAt: _dashIso(0, 15) },
    { id: 'demo-scheduled-4', _demo: true, companyName: 'Tandarts West', status: 'scheduled', scheduledAt: _dashIso(0, 16) }
  ];

  const runs = [
    { id: 'demo-run-1', _demo: true, createdAt: _dashIso(0, 8), niche: 'Beauty', leadsFound: 12, emailsSent: 5, approved: 5, rejected: 2, status: 'done' },
    { id: 'demo-run-2', _demo: true, createdAt: _dashIso(-1, 9), niche: 'Horeca', leadsFound: 9, emailsSent: 4, approved: 4, rejected: 1, status: 'done' },
    { id: 'demo-run-3', _demo: true, createdAt: _dashIso(-2, 9), niche: 'Zorg', leadsFound: 11, emailsSent: 6, approved: 6, rejected: 2, status: 'done' }
  ];

  const stats = {
    ...baseStats,
    emailsSent: 18,
    last24hLeads: 3,
    clients: 3,
    totalEarned: 1295,
    pipelineValue: 10190,
    replies: 1,
    inboxPending: 2
  };

  return { leads, inbox, runs, stats };
}

function _dashFallbackValue(fallback) {
  if (Array.isArray(fallback)) return [];
  if (fallback && typeof fallback === 'object') return { ...fallback };
  return fallback;
}

function _dashIsObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

async function _dashSafeApi(label, path, fallback, isValid) {
  try {
    const value = await apiJSON(path);
    if (value == null || (typeof isValid === 'function' && !isValid(value))) {
      console.warn(`[Dashboard] ${label} unavailable; using safe fallback.`);
      return { label, failed: true, value: _dashFallbackValue(fallback) };
    }
    return { label, failed: false, value };
  } catch (err) {
    console.warn(`[Dashboard] ${label} failed; using safe fallback.`, err);
    return { label, failed: true, value: _dashFallbackValue(fallback) };
  }
}

function _dashLoadWarningHTML(labels = []) {
  if (!labels.length) return '';
  const uniqueLabels = [...new Set(labels)];
  const detail = uniqueLabels.length === 1
    ? `${uniqueLabels[0]} is tijdelijk niet beschikbaar.`
    : `${uniqueLabels.length} databronnen zijn tijdelijk niet beschikbaar.`;
  return `
    <div class="db-demo-banner">
      <i class="ti ti-alert-triangle"></i>
      <strong>Live data beperkt</strong> - ${esc(detail)} Veilige standaardwaarden worden getoond.
    </div>
  `;
}

function _dashRenderLoadWarnings(labels = []) {
  const el = document.getElementById('dbLoadWarning');
  if (el) el.innerHTML = _dashLoadWarningHTML(labels);
}

function buildAgencyCopilotCard(leads = [], inbox = []) {
  const activeLeads = (leads || []).filter(l => !['client','dead','disapproved','archived'].includes(l.status));
  const warmLeads = activeLeads.filter(l => l.status === 'replied' || l.status === 'approved' || _dashScore(l) >= 8);
  const clients = (leads || []).filter(l => l.status === 'client');
  const overdueProjects = clients.filter(_dashIsOverdueProject);
  const clientsAwaiting = clients.filter(_dashHasClientSignal);
  const scheduledToday = (inbox || []).filter(i => i.status === 'scheduled' && _dashIsToday(i.scheduledAt));
  const pendingInbox = (inbox || []).filter(i => !i.status || i.status === 'pending');

  const warmLead = warmLeads.find(l => l.status === 'replied') || warmLeads[0];
  const clientSignal = clientsAwaiting[0];
  const overdue = overdueProjects[0];

  let recommendation = { text: 'Start een run om nieuwe kansen in de pijplijn te zetten.', view: 'runs' };
  if (clientSignal) {
    recommendation = { text: `Reageer vandaag op ${clientSignal.companyName || 'de klant'}.`, id: clientSignal.id };
  } else if (overdue) {
    recommendation = { text: `Pak ${overdue.companyName || 'het project'} vandaag op.`, id: overdue.id };
  } else if (warmLead) {
    recommendation = { text: `Volg ${warmLead.companyName || 'de warme lead'} vandaag op.`, id: warmLead.id };
  } else if (scheduledToday.length) {
    recommendation = { text: 'Controleer de geplande emails voor vandaag.', view: 'inbox' };
  } else if (pendingInbox.length) {
    recommendation = 'Beoordeel de inbox zodat warme kansen niet blijven liggen.';
    recommendation = { text: recommendation, view: 'inbox' };
  } else if (clients.length) {
    recommendation = { text: 'Geen urgente acties gevonden. Controleer later opnieuw.', view: 'dashboard' };
  }

  const fallbackView = recommendation.id && _dashIsDemoId(recommendation.id) ? 'leads' : (recommendation.view || 'dashboard');
  const action = recommendation.id && !_dashIsDemoId(recommendation.id)
    ? `openProjectPage('${esc(recommendation.id)}')`
    : `setView('${esc(fallbackView)}')`;

  return `
    <div class="db-card db-copilot-card">
      <div class="db-card-hdr">
        <div class="db-card-ttl"><i class="ti ti-sparkles" style="color:#2563EB"></i> Agency Copilot</div>
      </div>
      <div class="db-copilot-lines">
        <div class="db-copilot-line"><span class="db-copilot-dot"></span><span>${warmLeads.length} warme lead${warmLeads.length !== 1 ? 's' : ''}.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot amber"></span><span>${overdueProjects.length} vertraagde project${overdueProjects.length !== 1 ? 'en' : ''}.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot green"></span><span>${clientsAwaiting.length} klant${clientsAwaiting.length !== 1 ? 'en' : ''} wacht${clientsAwaiting.length === 1 ? '' : 'en'} op reactie.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot blue"></span><span>${scheduledToday.length} geplande email${scheduledToday.length !== 1 ? 's' : ''} vandaag.</span></div>
      </div>
      <div class="db-copilot-rec">
        <div class="db-copilot-rec-label">Aanbeveling</div>
        <div class="db-copilot-rec-row">
          <div class="db-copilot-rec-text">"${esc(recommendation.text)}"</div>
          <button class="db-card-lnk" onclick="${action}">Open</button>
        </div>
      </div>
    </div>
  `;
}

function buildDailyBriefingSection(leads = [], inbox = [], settings = {}) {
  const activeLeads = (leads || []).filter(l => !['client','dead','disapproved','archived'].includes(l.status));
  const warmLeads = activeLeads.filter(l => l.status === 'replied' || l.status === 'approved' || _dashScore(l) >= 8);
  const clients = (leads || []).filter(l => l.status === 'client');
  const delayedProjects = clients.filter(_dashIsOverdueProject);
  const clientsAwaiting = clients.filter(_dashHasClientSignal);
  const scheduledEmails = (inbox || []).filter(i => i.status === 'scheduled' && _dashIsToday(i.scheduledAt));
  const pendingInbox = (inbox || []).filter(i => !i.status || i.status === 'pending');

  const awaitingClient = clientsAwaiting[0];
  const delayedProject = delayedProjects[0];
  const warmLead = warmLeads.find(l => l.status === 'replied') || warmLeads[0];

  let recommendation = 'Start een nieuwe leadrun.';
  if (awaitingClient) {
    recommendation = `Controleer portaalfeedback van ${awaitingClient.companyName || 'de klant'}.`;
  } else if (delayedProject) {
    recommendation = `Bekijk vertraagde projecten, te beginnen met ${delayedProject.companyName || 'het oudste project'}.`;
  } else if (warmLead) {
    recommendation = `Volg ${warmLead.companyName || 'de warme lead'} vandaag op.`;
  } else if (scheduledEmails.length) {
    recommendation = 'Controleer de geplande emails van vandaag.';
  } else if (pendingInbox.length) {
    recommendation = 'Beoordeel openstaande outreach-emails.';
  }

  const adminName = settings?.myName || 'Admin';
  return `
    <div class="db-card" style="margin-bottom:20px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="min-width:240px;flex:1">
          <div class="db-greeting">${_dashDailyGreeting()}, ${esc(adminName)}.</div>
          <div class="db-greeting-sub">Agency AI heeft de activiteit van vandaag bekeken.</div>
        </div>
        <div style="font-size:12px;color:#666;white-space:nowrap">${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      </div>
      <div class="db-copilot-lines" style="margin-top:16px">
        <div class="db-copilot-line"><span class="db-copilot-dot"></span><span>${warmLeads.length} warme lead${warmLeads.length !== 1 ? 's' : ''}.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot amber"></span><span>${delayedProjects.length} vertraagd project${delayedProjects.length !== 1 ? 'en' : ''}.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot green"></span><span>${clientsAwaiting.length} klant${clientsAwaiting.length !== 1 ? 'en' : ''} wacht${clientsAwaiting.length === 1 ? '' : 'en'} op feedback.</span></div>
        <div class="db-copilot-line"><span class="db-copilot-dot blue"></span><span>${scheduledEmails.length} geplande email${scheduledEmails.length !== 1 ? 's' : ''} vandaag.</span></div>
      </div>
      <div class="db-copilot-rec">
        <div class="db-copilot-rec-label">Aanbeveling</div>
        <div class="db-copilot-rec-text">"${esc(recommendation)}"</div>
      </div>
    </div>
  `;
}

function buildLiveAgentActivityCard(leads = [], inbox = [], recentRuns = []) {
  const runList = Array.isArray(recentRuns) ? recentRuns : [];
  const latestRun = runList[0] || null;
  const newLeadsToday = (leads || []).filter(l => l.createdAt && _dashIsToday(l.createdAt)).length;
  const researchQueue = (leads || []).filter(l => ['new','inbox','pending'].includes(l.status)).length;
  const pendingInbox = (inbox || []).filter(i => !i.status || i.status === 'pending');
  const scheduled = (inbox || []).filter(i => i.status === 'scheduled');
  const scheduledToday = scheduled.filter(i => _dashIsToday(i.scheduledAt));
  const proposalCandidates = (leads || []).filter(l =>
    ['approved','replied','client'].includes(l.status) &&
    !(l.proposal || l.proposalGeneratedAt || (Array.isArray(l.proposals) && l.proposals.length))
  );
  const deliverablesWaiting = (leads || []).filter(l =>
    (l.agentDeliverables || []).some(d => d.status === 'wacht_op_goedkeuring')
  );
  const portalWaiting = (leads || []).filter(_dashHasClientSignal);
  const clients = (leads || []).filter(l => l.status === 'client');

  const hasAnyData = (leads || []).length || (inbox || []).length || runList.length;
  if (!hasAnyData) {
    return `
      <div class="db-card">
        <div class="db-card-hdr">
          <div class="db-card-ttl"><i class="ti ti-activity" style="color:#2563EB"></i> Live Agents</div>
        </div>
        <div class="db-empty">
          <div class="db-empty-icon"><i class="ti ti-robot"></i></div>
          <div class="db-empty-text">Nog geen agentactiviteit</div>
        </div>
      </div>
    `;
  }

  const researchDetail = newLeadsToday > 0
    ? `${newLeadsToday} nieuwe lead${newLeadsToday !== 1 ? 's' : ''} vandaag gevonden.`
    : latestRun?.createdAt
      ? `Laatste run ${relativeTime(latestRun.createdAt)}.`
      : researchQueue > 0
        ? `${researchQueue} lead${researchQueue !== 1 ? 's' : ''} in onderzoek.`
        : 'Wacht op de volgende run.';

  const outreachDetail = scheduledToday.length > 0
    ? `${scheduledToday.length} email${scheduledToday.length !== 1 ? 's' : ''} vandaag ingepland.`
    : scheduled.length > 0
      ? `${scheduled.length} email${scheduled.length !== 1 ? 's' : ''} ingepland.`
      : pendingInbox.length > 0
        ? `${pendingInbox.length} email${pendingInbox.length !== 1 ? 's' : ''} wacht${pendingInbox.length === 1 ? '' : 'en'} op beoordeling.`
        : 'Geen outreach-acties open.';

  const proposalDetail = deliverablesWaiting.length > 0
    ? `${deliverablesWaiting.length} project${deliverablesWaiting.length !== 1 ? 'en' : ''} wacht${deliverablesWaiting.length === 1 ? '' : 'en'} op goedkeuring.`
    : proposalCandidates.length > 0
      ? `${proposalCandidates.length} voorstel${proposalCandidates.length !== 1 ? 'len' : ''} kan${proposalCandidates.length === 1 ? '' : 'nen'} worden voorbereid.`
      : 'Geen voorstellen in wachtrij.';

  const portalDetail = portalWaiting.length > 0
    ? `${portalWaiting.length} klant${portalWaiting.length !== 1 ? 'en' : ''} vraagt${portalWaiting.length === 1 ? '' : 'en'} aandacht.`
    : clients.length > 0
      ? 'Wacht op klantacties.'
      : 'Nog geen klantportalen actief.';

  const rows = [
    {
      mark: newLeadsToday > 0 || researchQueue > 0 ? '●' : '○',
      name: 'Research Agent',
      detail: researchDetail,
      color: newLeadsToday > 0 || researchQueue > 0 ? '#2563EB' : '#555'
    },
    {
      mark: scheduled.length > 0 ? '✓' : pendingInbox.length > 0 ? '●' : '○',
      name: 'Outreach Agent',
      detail: outreachDetail,
      color: scheduled.length > 0 ? '#16A34A' : pendingInbox.length > 0 ? '#D97706' : '#555'
    },
    {
      mark: deliverablesWaiting.length > 0 || proposalCandidates.length > 0 ? '●' : '○',
      name: 'Proposal Agent',
      detail: proposalDetail,
      color: deliverablesWaiting.length > 0 ? '#D97706' : proposalCandidates.length > 0 ? '#2563EB' : '#555'
    },
    {
      mark: portalWaiting.length > 0 ? '●' : '○',
      name: 'Portal Agent',
      detail: portalDetail,
      color: portalWaiting.length > 0 ? '#D97706' : '#555'
    }
  ];

  return `
    <div class="db-card">
      <div class="db-card-hdr">
        <div class="db-card-ttl"><i class="ti ti-activity" style="color:#2563EB"></i> Live Agents</div>
      </div>
      ${rows.map(r => `
        <div class="db-activity-item">
          <div class="db-activity-dot" style="background:${r.color}"></div>
          <div class="db-activity-body">
            <div class="db-activity-text"><strong>${r.mark} ${esc(r.name)}</strong></div>
            <div class="db-activity-time">${esc(r.detail)}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function renderDashboard() {
  const appView = document.getElementById('appView');
  appView.innerHTML = `
    <style>
      .db-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;gap:12px}
      .db-greeting{font-size:22px;font-weight:700;color:#F5F5F5;line-height:1.2}
      .db-greeting-sub{font-size:14px;color:#999;margin-top:4px}
      .db-header-btns{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
      .db-status{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:8px;padding:10px 16px;display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:20px}
      .db-status-item{display:flex;align-items:center;gap:6px;font-size:12px;color:#999;white-space:nowrap}
      .db-status-sep{width:1px;height:14px;background:#2A2A2A;margin:0 4px;flex-shrink:0}
      .db-status-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
      .db-status-dot.green{background:#16A34A;box-shadow:0 0 5px rgba(22,163,74,.5)}
      .db-status-dot.amber{background:#D97706;box-shadow:0 0 5px rgba(217,119,6,.5)}
      .db-status-dot.red{background:#DC2626;box-shadow:0 0 5px rgba(220,38,38,.5)}
      .db-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .db-kpi{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:8px;padding:20px 24px;transition:border-color .15s}
      .db-kpi:hover{border-color:#333}
      .db-kpi-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
      .db-kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:600}
      .db-kpi-icon{font-size:18px;color:#333}
      .db-kpi-num{font-size:32px;font-weight:700;color:#F5F5F5;letter-spacing:-1px;line-height:1;margin-bottom:10px}
      .db-kpi-trend{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:20px}
      .db-kpi-trend.up{background:rgba(22,163,74,.12);color:#16A34A}
      .db-kpi-trend.dn{background:rgba(220,38,38,.12);color:#DC2626}
      .db-kpi-trend.nt{background:rgba(153,153,153,.1);color:#999}
      .db-kpi-trend.amber{background:rgba(217,119,6,.12);color:#D97706}
      .db-cols{display:grid;grid-template-columns:65fr 35fr;gap:16px;margin-bottom:20px}
      .db-left-col,.db-right-col{display:flex;flex-direction:column;gap:16px}
      .db-card{background:#1A1A1A;border:1px solid #2A2A2A;border-radius:8px;padding:20px 24px}
      .db-card-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #2A2A2A}
      .db-card-ttl{font-size:15px;font-weight:600;color:#F5F5F5;display:flex;align-items:center;gap:8px}
      .db-card-lnk{font-size:13px;color:#2563EB;cursor:pointer;background:none;border:none;padding:0;white-space:nowrap}
      .db-card-lnk:hover{text-decoration:underline}
      .db-lead-row{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid #222}
      .db-lead-row:last-child{border-bottom:none;padding-bottom:0}
      .db-lead-init{width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0}
      .db-lead-info{flex:1;min-width:0}
      .db-lead-name{font-size:14px;font-weight:600;color:#F5F5F5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .db-lead-sub{font-size:12px;color:#666;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .db-lead-actions{display:flex;gap:6px;flex-shrink:0}
      .db-btn-approve{background:rgba(22,163,74,.12);color:#16A34A;border:1px solid rgba(22,163,74,.25);border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}
      .db-btn-approve:hover{background:rgba(22,163,74,.22)}
      .db-btn-reject{background:rgba(220,38,38,.08);color:#DC2626;border:1px solid rgba(220,38,38,.2);border-radius:6px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;transition:background .15s}
      .db-btn-reject:hover{background:rgba(220,38,38,.16)}
      .db-activity-item{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid #222}
      .db-activity-item:last-child{border-bottom:none}
      .db-activity-dot{width:8px;height:8px;border-radius:50%;margin-top:4px;flex-shrink:0}
      .db-activity-body{flex:1;min-width:0}
      .db-activity-text{font-size:13px;color:#F5F5F5}
      .db-activity-time{font-size:12px;color:#666;margin-top:2px}
      .db-phase-row{margin-bottom:14px}
      .db-phase-row:last-child{margin-bottom:0}
      .db-phase-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
      .db-phase-lbl{font-size:13px;color:#999}
      .db-phase-count{font-size:12px;font-weight:600;background:#222;color:#999;border-radius:20px;padding:1px 8px}
      .db-phase-bar{height:4px;background:#222;border-radius:4px}
      .db-phase-fill{height:100%;border-radius:4px;transition:width .6s ease}
      .db-chip{display:inline-block;font-size:11px;background:#222;border:1px solid #2A2A2A;border-radius:20px;padding:2px 8px;color:#999;margin:2px}
      .db-health-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #222;cursor:pointer}
      .db-health-row:last-child{border-bottom:none}
      .db-health-row:hover .db-health-name{color:#2563EB}
      .db-health-dot{width:9px;height:9px;border-radius:50%;flex-shrink:0}
      .db-health-info{flex:1;min-width:0}
      .db-health-name{font-size:13px;font-weight:600;color:#F5F5F5;transition:color .15s}
      .db-health-reason{font-size:12px;color:#666;margin-top:1px}
      .db-fin-grid{display:flex;border:1px solid #2A2A2A;border-radius:8px;overflow:hidden;margin-bottom:20px}
      .db-fin-item{flex:1;padding:20px 22px;border-right:1px solid #2A2A2A}
      .db-fin-item:last-child{border-right:none}
      .db-fin-lbl{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:600;margin-bottom:6px}
      .db-fin-num{font-size:24px;font-weight:700;color:#F5F5F5;letter-spacing:-.5px}
      .db-fin-sub{font-size:12px;color:#666;margin-top:3px}
      .db-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .db-tbl th{padding:10px 14px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#666;border-bottom:1px solid #2A2A2A;white-space:nowrap}
      .db-tbl td{padding:12px 14px;color:#F5F5F5;border-bottom:1px solid #222;vertical-align:middle}
      .db-tbl tr:last-child td{border-bottom:none}
      .db-tbl tr:hover td{background:rgba(255,255,255,.02)}
      .db-badge{display:inline-flex;align-items:center;font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap}
      .db-badge.green{background:rgba(22,163,74,.12);color:#16A34A}
      .db-badge.blue{background:rgba(37,99,235,.12);color:#2563EB}
      .db-badge.amber{background:rgba(217,119,6,.12);color:#D97706}
      .db-badge.red{background:rgba(220,38,38,.12);color:#DC2626}
      .db-badge.grey{background:rgba(153,153,153,.1);color:#999}
      .db-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:opacity .15s;white-space:nowrap}
      .db-btn:hover{opacity:.85}
      .db-btn-blue{background:#2563EB;color:#fff}
      .db-btn-ghost{background:transparent;color:#999;border:1px solid #2A2A2A}
      .db-btn-ghost:hover{border-color:#333;color:#F5F5F5;opacity:1}
      .db-btn-sm{padding:5px 10px;font-size:12px}
      .db-empty{text-align:center;padding:24px 0;color:#666}
      .db-empty-icon{font-size:24px;margin-bottom:6px}
      .db-empty-text{font-size:13px}
      .db-demo-banner{background:rgba(217,119,6,.08);border:1px solid rgba(217,119,6,.25);border-radius:8px;padding:10px 16px;margin-bottom:20px;display:flex;align-items:center;gap:10px;font-size:13px;color:#D97706}
      .db-copilot-lines{display:flex;flex-direction:column;gap:7px}
      .db-copilot-line{display:flex;align-items:center;gap:8px;font-size:13px;color:#D6D6D6}
      .db-copilot-dot{width:6px;height:6px;border-radius:50%;background:#2563EB;flex-shrink:0}
      .db-copilot-dot.amber{background:#D97706}
      .db-copilot-dot.green{background:#16A34A}
      .db-copilot-dot.blue{background:#0891B2}
      .db-copilot-rec{margin-top:14px;padding-top:12px;border-top:1px solid #222}
      .db-copilot-rec-label{font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#666;font-weight:700;margin-bottom:6px}
      .db-copilot-rec-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .db-copilot-rec-text{font-size:13px;line-height:1.45;color:#F5F5F5}
      @media(max-width:1200px){.db-kpi-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:900px){.db-cols{grid-template-columns:1fr}}
      @media(max-width:600px){.db-kpi-grid{grid-template-columns:1fr 1fr}.db-fin-grid{flex-direction:column}.db-fin-item{border-right:none;border-bottom:1px solid #2A2A2A}.db-fin-item:last-child{border-bottom:none}.db-header-btns{width:100%}}
    </style>
    <div id="dashboardContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  const [statsRes, inboxRes, runsRes, leadsRes] = await Promise.all([
    _dashSafeApi('Statistieken', '/api/stats', {}, _dashIsObject),
    _dashSafeApi('Inbox', '/api/inbox', [], Array.isArray),
    _dashSafeApi('Runs', '/api/runs', [], Array.isArray),
    _dashSafeApi('Leads', '/api/leads', [], Array.isArray)
  ]);

  const dashboardLoadWarnings = [statsRes, inboxRes, runsRes, leadsRes]
    .filter(r => r.failed)
    .map(r => r.label);

  const realStats = statsRes.value || {};
  const realInbox = Array.isArray(inboxRes.value) ? inboxRes.value : [];
  const realRuns = Array.isArray(runsRes.value) ? runsRes.value : [];
  const realLeads = Array.isArray(leadsRes.value) ? leadsRes.value : [];
  const useDashboardDemo = shouldUseDashboardDemoState(realLeads, realInbox, realRuns, realStats);
  const demoState = useDashboardDemo ? buildDashboardDemoState(realStats) : null;
  const displayStats = demoState?.stats || realStats;
  const displayInbox = demoState?.inbox || realInbox;
  const displayRuns = demoState?.runs || realRuns;
  const displayLeads = demoState?.leads || realLeads;

  state.stats = realStats;
  state.inbox = realInbox;
  state.leads = realLeads;

  const earned = displayStats.totalEarned || 0;
  const pending = displayInbox.filter(i => !i.status || i.status === 'pending');
  const realPending = realInbox.filter(i => !i.status || i.status === 'pending');
  if (typeof updateInboxBadge === 'function') updateInboxBadge(realPending.length);

  const settingsRes = await _dashSafeApi('Instellingen', '/api/settings', {}, _dashIsObject);
  if (settingsRes.failed) dashboardLoadWarnings.push(settingsRes.label);
  const settings = settingsRes.value || {};
  state.settings = settings || {};
  if (typeof updateSidebarLogo === 'function') updateSidebarLogo(settings?.agencyLogo || '');

  const nextRun = typeof getNextRunTime === 'function'
    ? getNextRunTime(settings?.dailyRunTime || '09:00')
    : { label: '—', countdown: '—', target: null };
  const recentRuns = displayRuns.slice(0, 10);

  const leads = displayLeads;

  // Pipeline phases (client-stage breakdown)
  const phaseIntake     = leads.filter(l => l.status === 'client' && l.projectStartedAt && !l.intakeSubmittedAt).length;
  const phaseUitvoering = leads.filter(l => l.status === 'client' && l.intakeSubmittedAt && (l.agentDeliverables||[]).some(d => d.status === 'pending' || d.status === 'building')).length;
  const phaseOplevering = leads.filter(l => l.status === 'client' && (l.agentDeliverables||[]).some(d => d.status === 'wacht_op_goedkeuring')).length;
  const phaseLive       = leads.filter(l => l.status === 'client' && (l.agentDeliverables||[]).some(d => d.status === 'approved')).length;
  const phases = [
    { label: 'Intake',     count: phaseIntake,     color: '#2563EB' },
    { label: 'Uitvoering', count: phaseUitvoering, color: '#7c3aed' },
    { label: 'Oplevering', count: phaseOplevering, color: '#D97706' },
    { label: 'Live',       count: phaseLive,        color: '#16A34A' },
  ];
  const maxPhase = Math.max(...phases.map(p => p.count), 1);

  const activity = buildDashboardActivityTimeline(leads, displayInbox, recentRuns);

  // Client health (compact)
  const now = Date.now();
  const day = 86400000;
  const clients = leads.filter(l => l.status === 'client');
  const healthRows = clients.slice(0, 5).map(l => {
    const pendingPayment = (l.payments||[]).some(p => p.status !== 'paid' && p.dueDate && new Date(p.dueDate) < new Date());
    const overdue30 = (l.payments||[]).some(p => p.status !== 'paid' && p.dueDate && (now - new Date(p.dueDate).getTime()) > 30 * day);
    const noDeliverables = l.intakeSubmittedAt && !((l.agentDeliverables||[]).length) && (now - new Date(l.intakeSubmittedAt).getTime()) > 14 * day;
    let dot = '#16A34A', reason = 'Alles in orde';
    if (overdue30 || noDeliverables) { dot = '#DC2626'; reason = overdue30 ? 'Betaling verlopen' : 'Geen deliverables'; }
    else if (pendingPayment) { dot = '#D97706'; reason = 'Betaling openstaand'; }
    return { id: l.id, name: l.companyName, dot, reason };
  });

  // Niches chips
  const niches = [...new Set(leads.filter(l => l.niche).map(l => l.niche))].slice(0, 8);

  // Counts
  const repliesOpen = leads.filter(l => l.status === 'replied').length;
  const totalClientCount = clients.length;

  const greeting   = _dashGreeting();
  const adminName  = settings?.myName || 'Admin';
  const emailOk    = settings?.resendConfigured;
  const lastRunLbl = recentRuns[0] ? relativeTime(recentRuns[0].createdAt) : 'nog niet';

  const dashboardContent = document.getElementById('dashboardContent');
  if (!dashboardContent) return;

  dashboardContent.innerHTML = `
    ${useDashboardDemo ? `
      <div class="db-demo-banner">
        <i class="ti ti-flask"></i>
        <strong>Demo data</strong> - Read-only voorbeeldweergave. Er is niets opgeslagen en demo-acties zijn uitgeschakeld.
      </div>
    ` : settings?.isDemo ? `
      <div class="db-demo-banner">
        <i class="ti ti-flask"></i>
        <strong>Demo modus actief</strong> — Gegevens zijn gesimuleerd en worden niet opgeslagen.
      </div>
    ` : ''}

    <div id="dbLoadWarning">${_dashLoadWarningHTML(dashboardLoadWarnings)}</div>

    ${buildDailyBriefingSection(leads, displayInbox, settings)}

    ${leads.length === 0 && !settings?.isDemo ? `
    <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border:1px solid #334155;border-radius:14px;padding:28px 32px;margin-bottom:24px">
      <h2 style="margin:0 0 8px;font-size:20px;color:#f1f5f9;font-weight:700">Welkom bij Agency AI! 🚀</h2>
      <p style="margin:0 0 16px;font-size:14px;color:#94a3b8;line-height:1.6">Start in 3 stappen:</p>
      <div style="display:flex;gap:16px;flex-wrap:wrap">
        <div style="flex:1;min-width:180px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px">
          <div style="font-size:24px;margin-bottom:6px">1️⃣</div>
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:4px">Instellingen configureren</div>
          <div style="font-size:12px;color:#64748b">Stel je agencynaam, email en Claude API key in</div>
          <button class="btn btn-outline" style="margin-top:10px;font-size:12px;padding:6px 14px" onclick="setView('settings')">Naar instellingen →</button>
        </div>
        <div style="flex:1;min-width:180px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px">
          <div style="font-size:24px;margin-bottom:6px">2️⃣</div>
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:4px">Eerste run starten</div>
          <div style="font-size:12px;color:#64748b">De AI vindt automatisch leads in jouw niche</div>
          <button class="btn btn-primary" style="margin-top:10px;font-size:12px;padding:6px 14px" onclick="setView('runs')">Run starten →</button>
        </div>
        <div style="flex:1;min-width:180px;background:#1e293b;border:1px solid #334155;border-radius:10px;padding:16px">
          <div style="font-size:24px;margin-bottom:6px">3️⃣</div>
          <div style="font-size:13px;font-weight:600;color:#e2e8f0;margin-bottom:4px">Leads beoordelen</div>
          <div style="font-size:12px;color:#64748b">Keur leads goed in je inbox voor automatische outreach</div>
        </div>
      </div>
      <p style="margin:16px 0 0;font-size:12px;color:#64748b">Hulp nodig? Mail <a href="mailto:info@agencyai.info" style="color:#60a5fa">info@agencyai.info</a></p>
    </div>
    ` : ''}

    <div class="db-header">
      <div>
        <div class="db-greeting">${greeting}, ${esc(adminName)} 👋</div>
        <div class="db-greeting-sub">${
          pending.length > 0
            ? `${pending.length} lead${pending.length !== 1 ? 's' : ''} wacht${pending.length === 1 ? '' : 'en'} op beoordeling`
            : 'Alles bijgewerkt — goed werk!'
        }</div>
      </div>
      <div class="db-header-btns">
        <button class="db-btn db-btn-ghost db-btn-sm" onclick="setView('runs')">
          <i class="ti ti-player-play"></i> Nieuwe run starten
        </button>
        <button class="db-btn db-btn-blue db-btn-sm" onclick="setView('leads')">
          <i class="ti ti-plus"></i> Nieuw project
        </button>
        <button class="db-btn db-btn-ghost db-btn-sm" onclick="openWidgetSelector()" title="Widgets aanpassen">
          <i class="ti ti-layout-dashboard"></i>
        </button>
      </div>
    </div>

    <div class="db-status">
      <div class="db-status-item"><span class="db-status-dot green"></span> Agents actief</div>
      <div class="db-status-sep"></div>
      <div class="db-status-item">
        <span class="db-status-dot ${emailOk ? 'green' : 'red'}"></span>
        ${emailOk ? 'Email actief' : 'Email niet ingesteld'}
      </div>
      <div class="db-status-sep"></div>
      <div class="db-status-item"><span class="db-status-dot green"></span> Database online</div>
      <div class="db-status-sep"></div>
      <div class="db-status-item">
        <i class="ti ti-clock" style="font-size:12px;color:#555"></i>
        Volgende run:&nbsp;<strong style="color:#F5F5F5">${settings?.automationPaused ? 'Gepauzeerd' : nextRun.label}</strong>
      </div>
      <div class="db-status-sep"></div>
      <div class="db-status-item">
        <i class="ti ti-history" style="font-size:12px;color:#555"></i>
        Laatste run: ${lastRunLbl}
      </div>
    </div>

    <div class="db-kpi-grid">
      <div class="db-kpi" style="cursor:pointer" onclick="setView('inbox')">
        <div class="db-kpi-top">
          <div class="db-kpi-label">Inbox</div>
          <i class="ti ti-inbox db-kpi-icon"></i>
        </div>
        <div class="db-kpi-num">${pending.length}</div>
        <div class="db-kpi-trend ${pending.length > 0 ? 'amber' : 'nt'}">
          ${pending.length > 0 ? '⏳ Wacht op actie' : '✓ Leeg'}
        </div>
      </div>

      <div class="db-kpi">
        <div class="db-kpi-top">
          <div class="db-kpi-label">Emails verstuurd</div>
          <i class="ti ti-mail db-kpi-icon"></i>
        </div>
        <div class="db-kpi-num">${displayStats.emailsSent || 0}</div>
        <div class="db-kpi-trend ${displayStats.last24hLeads > 0 ? 'up' : 'nt'}">
          ${displayStats.last24hLeads > 0 ? `+${displayStats.last24hLeads} vandaag` : 'Geen vandaag'}
        </div>
      </div>

      <div class="db-kpi">
        <div class="db-kpi-top">
          <div class="db-kpi-label">Openstaande replies</div>
          <i class="ti ti-message-circle db-kpi-icon"></i>
        </div>
        <div class="db-kpi-num">${repliesOpen}</div>
        <div class="db-kpi-trend ${repliesOpen > 0 ? 'up' : 'nt'}">
          ${repliesOpen > 0 ? `${repliesOpen} actief` : 'Geen actief'}
        </div>
      </div>

      <div class="db-kpi">
        <div class="db-kpi-top">
          <div class="db-kpi-label">Omzet</div>
          <i class="ti ti-currency-euro db-kpi-icon"></i>
        </div>
        <div class="db-kpi-num">€${earned.toLocaleString('nl-NL')}</div>
        <div class="db-kpi-trend ${displayStats.clients > 0 ? 'up' : 'nt'}">
          ${displayStats.clients > 0 ? `${displayStats.clients} klant${displayStats.clients !== 1 ? 'en' : ''}` : 'Geen klanten'}
        </div>
      </div>
    </div>

    <div class="db-cols">
      <div class="db-left-col">
        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">
              Wacht op beoordeling
              ${pending.length > 0 ? `<span class="db-badge amber">${pending.length}</span>` : ''}
            </div>
            <button class="db-card-lnk" onclick="setView('inbox')">Alles zien →</button>
          </div>
          ${pending.length === 0 ? `
            <div class="db-empty">
              <div class="db-empty-icon">✓</div>
              <div class="db-empty-text">Inbox leeg — goed gedaan!</div>
            </div>
          ` : pending.slice(0, 5).map(item => `
            <div class="db-lead-row">
              <div class="db-lead-init" style="background:${_initColor(item.companyName)}">${(item.companyName || '?').charAt(0).toUpperCase()}</div>
              <div class="db-lead-info">
                <div class="db-lead-name">${esc(item.companyName || '—')}</div>
                <div class="db-lead-sub">${[item.niche, item.location, item.score ? 'Score ' + item.score : ''].filter(Boolean).map(esc).join(' · ')}</div>
              </div>
              <div class="db-lead-actions">
                ${item._demo ? `<span class="db-badge grey">Demo data</span>` : `
                  ${isAdmin() ? `<button class="db-btn-approve" onclick="approve('${esc(item.id)}')">✓</button>` : ''}
                  <button class="db-btn-reject" onclick="disapprove('${esc(item.id)}')">✕</button>
                `}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">Today's Activity Timeline</div>
            <span class="db-badge grey">Vandaag</span>
          </div>
          ${activity.length === 0 ? `
            <div class="db-empty">
              <div class="db-empty-icon"><i class="ti ti-history"></i></div>
              <div class="db-empty-text">Nog geen activiteit vandaag</div>
            </div>
          ` : activity.slice(0, 8).map(a => `
            <div class="db-activity-item">
              <div class="db-activity-dot" style="background:${a.color}"></div>
              <div class="db-activity-body">
                <div class="db-activity-text"><strong>${esc(a.agent)}</strong> ${esc(a.text)}</div>
                <div class="db-activity-time">${_dashTimelineTime(a.time)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="db-right-col">
        ${buildAgencyCopilotCard(leads, displayInbox)}
        ${buildLiveAgentActivityCard(leads, displayInbox, recentRuns)}

        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">Pipeline</div>
            <button class="db-card-lnk" onclick="setView('leads')">Bekijken →</button>
          </div>
          ${phases.map(p => {
            const pct = Math.max(4, Math.round((p.count / maxPhase) * 100));
            return `
              <div class="db-phase-row">
                <div class="db-phase-top">
                  <span class="db-phase-lbl">${p.label}</span>
                  <span class="db-phase-count">${p.count}</span>
                </div>
                <div class="db-phase-bar">
                  <div class="db-phase-fill" style="width:${pct}%;background:${p.color}"></div>
                </div>
              </div>
            `;
          }).join('')}
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #222;display:flex;justify-content:space-between;font-size:12px;color:#555">
            <span>${totalClientCount} klanten totaal</span>
            <span>${repliesOpen} replies actief</span>
          </div>
        </div>

        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">Auto-run</div>
            <span class="db-badge ${settings?.automationPaused ? 'red' : 'green'}">${settings?.automationPaused ? '⏸ Gepauzeerd' : '▶ Actief'}</span>
          </div>
          <div style="margin-bottom:14px">
            <div style="font-size:12px;color:#555;margin-bottom:4px">Volgende run</div>
            <div style="font-size:20px;font-weight:700;color:#F5F5F5;letter-spacing:-.5px">${settings?.automationPaused ? '—' : nextRun.label}</div>
            ${!settings?.automationPaused ? `
              <div style="font-size:12px;color:#555;margin-top:6px">Afteltimer: <span id="countdown" style="color:#2563EB;font-weight:600;font-family:monospace">${nextRun.countdown}</span></div>
            ` : ''}
          </div>
          ${niches.length > 0 ? `
            <div style="margin-bottom:14px">
              <div style="font-size:11px;color:#555;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Niches</div>
              ${niches.map(n => `<span class="db-chip">${esc(n)}</span>`).join('')}
            </div>
          ` : ''}
          ${isAdmin() ? `
            <button class="db-btn db-btn-ghost db-btn-sm" style="width:100%;justify-content:center" onclick="${useDashboardDemo ? `setView('runs')` : `toggleAutoRun(${!!settings?.automationPaused})`}">
              <i class="ti ti-${useDashboardDemo ? 'player-play' : settings?.automationPaused ? 'player-play' : 'pause'}"></i>
              ${useDashboardDemo ? 'Start echte run via Runs' : settings?.automationPaused ? 'Auto-run hervatten' : 'Auto-run pauzeren'}
            </button>
          ` : ''}
        </div>

        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">Klant gezondheid</div>
            <button class="db-card-lnk" onclick="setView('leads')">Alle klanten →</button>
          </div>
          ${healthRows.length === 0 ? `
            <div class="db-empty">
              <div class="db-empty-icon"><i class="ti ti-users"></i></div>
              <div class="db-empty-text">Nog geen klanten</div>
            </div>
          ` : healthRows.map(r => `
            <div class="db-health-row" onclick="${_dashIsDemoId(r.id) ? `setView('leads')` : `openProjectPage('${esc(r.id)}')`}">
              <div class="db-health-dot" style="background:${r.dot}"></div>
              <div class="db-health-info">
                <div class="db-health-name">${esc(r.name)}</div>
                <div class="db-health-reason">${esc(r.reason)}</div>
              </div>
              <i class="ti ti-chevron-right" style="color:#333;font-size:14px;flex-shrink:0"></i>
            </div>
          `).join('')}
        </div>
      </div>
    </div>

    <div id="db-financial" style="margin-bottom:20px"></div>
    <div id="db-upsell" style="margin-bottom:20px"></div>
    <div id="upsellSection" style="display:none"></div>
    <div id="referralSection" style="display:none"></div>

    <div class="db-card" style="margin-bottom:0">
      <div class="db-card-hdr">
        <div class="db-card-ttl">Recente runs</div>
        <button class="db-card-lnk" onclick="setView('runs')">Alle runs →</button>
      </div>
      ${recentRuns.length === 0 ? `
        <div class="db-empty">
          <div class="db-empty-icon"><i class="ti ti-bolt"></i></div>
          <div class="db-empty-text">Nog geen runs uitgevoerd</div>
        </div>
      ` : `
        <div style="overflow-x:auto">
          <table class="db-tbl">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Niche</th>
                <th>Gevonden</th>
                <th>Goedgekeurd</th>
                <th>Afgewezen</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${recentRuns.slice(0, 5).map(r => {
                const isDone = r.status === 'done' || r.status === 'completed' || !r.status;
                const isErr  = r.status === 'error';
                return `
                  <tr>
                    <td style="color:#666">${relativeTime(r.createdAt)}</td>
                    <td>${r.niche ? `<span class="db-chip">${esc(r.niche)}</span>` : '<span style="color:#444">—</span>'}</td>
                    <td style="font-weight:600">${r.leadsFound || 0}</td>
                    <td style="color:#16A34A;font-weight:600">${r.approved || r.emailsSent || 0}</td>
                    <td style="color:#555">${r.rejected || 0}</td>
                    <td><span class="db-badge ${isErr ? 'red' : isDone ? 'green' : 'grey'}">${isErr ? 'Fout' : 'Klaar'}</span></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;

  // Countdown timer
  if (typeof startCountdown === 'function' && nextRun.target) startCountdown(nextRun.target);

  if (!useDashboardDemo) {
    // Upsell kansen (async)
    const upsellRes = await _dashSafeApi('Upsell kansen', '/api/upsell', [], Array.isArray);
    if (upsellRes.failed) {
      dashboardLoadWarnings.push(upsellRes.label);
      _dashRenderLoadWarnings(dashboardLoadWarnings);
    }
    const upsells = upsellRes.value || [];
    const dbUpsell = document.getElementById('db-upsell');
    if (dbUpsell && upsells.length > 0) {
      dbUpsell.innerHTML = `
        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl"><i class="ti ti-trending-up" style="color:#D97706"></i> Upsell kansen</div>
            <span class="db-badge amber">${upsells.length} klant${upsells.length !== 1 ? 'en' : ''}</span>
          </div>
          <div style="overflow-x:auto">
            <table class="db-tbl">
              <thead>
                <tr>
                  <th>Klant</th>
                  <th>Huidig</th>
                  <th>Aanbevolen</th>
                  <th>Potentieel</th>
                  <th>Actie</th>
                </tr>
              </thead>
              <tbody>
                ${upsells.map(o => `
                  <tr>
                    <td style="font-weight:600">${esc(o.companyName)}</td>
                    <td style="color:#666">${esc(o.currentService)}</td>
                    <td><strong>${esc(o.upsellService)}</strong></td>
                    <td style="color:#16A34A;font-weight:600">€${(o.upsellPrice||0).toLocaleString('nl-NL')}/mnd</td>
                    <td>
                      <button class="db-btn db-btn-ghost db-btn-sm" onclick="generateUpsellEmail('${esc(o.leadId)}')">
                        <i class="ti ti-mail"></i> Email
                      </button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    // Revenue forecast (populates #db-financial)
    renderForecastSection(dashboardLoadWarnings);
  }
}

async function renderForecastSection(dashboardLoadWarnings = []) {
  const forecastRes = await _dashSafeApi('Financieel overzicht', '/api/stats/forecast', {}, _dashIsObject);
  if (forecastRes.failed) {
    dashboardLoadWarnings.push(forecastRes.label);
    _dashRenderLoadWarnings(dashboardLoadWarnings);
    return;
  }
  const forecast = forecastRes.value || {};
  const section = document.getElementById('db-financial');
  if (!section) return;
  const fmt = n => '€' + (n || 0).toLocaleString('nl-NL');
  const growthRate = Number(forecast.growth_rate || 0);
  const growthUp = growthRate >= 0;
  const growthSign = growthUp ? '+' : '';
  const actualMonths = Array.isArray(forecast.months_actual) ? forecast.months_actual : [];
  const projectedMonths = Array.isArray(forecast.months_projected) ? forecast.months_projected : [];
  section.innerHTML = `
    <div class="db-card">
      <div class="db-card-hdr">
        <div class="db-card-ttl">Financieel overzicht</div>
        <span class="db-badge ${growthUp ? 'green' : 'red'}">${growthSign}${growthRate}% vs vorige maand</span>
      </div>
      <div class="db-fin-grid">
        <div class="db-fin-item">
          <div class="db-fin-lbl">MRR</div>
          <div class="db-fin-num">${fmt(forecast.current_mrr)}</div>
          <div class="db-fin-sub">per maand</div>
        </div>
        <div class="db-fin-item">
          <div class="db-fin-lbl">ARR</div>
          <div class="db-fin-num">${fmt(forecast.current_arr)}</div>
          <div class="db-fin-sub">per jaar</div>
        </div>
        <div class="db-fin-item">
          <div class="db-fin-lbl">🔮 30 dagen</div>
          <div class="db-fin-num" style="color:#16A34A">${fmt(forecast.forecast_30d)}</div>
          <div class="db-fin-sub">verwacht</div>
        </div>
        <div class="db-fin-item">
          <div class="db-fin-lbl">🔮 90 dagen</div>
          <div class="db-fin-num" style="color:#16A34A">${fmt(forecast.forecast_90d)}</div>
          <div class="db-fin-sub">verwacht</div>
        </div>
        <div class="db-fin-item">
          <div class="db-fin-lbl">⚠️ Open facturen</div>
          <div class="db-fin-num" style="color:#D97706">${fmt(forecast.pipeline_value)}</div>
          <div class="db-fin-sub">openstaand</div>
        </div>
      </div>
      <canvas id="forecastChart" style="max-height:180px"></canvas>
    </div>
  `;

  const canvas = document.getElementById('forecastChart');
  if (canvas && window.Chart) {
    const actualLabels = actualMonths.map(m => m.label);
    const actualData   = actualMonths.map(m => m.revenue);
    const projLabels   = projectedMonths.map(m => m.label);
    const projData     = projectedMonths.map(m => m.revenue);
    new Chart(canvas, {
      type: 'line',
      data: {
        labels: [...actualLabels, ...projLabels],
        datasets: [
          {
            label: 'Werkelijk',
            data: [...actualData, null, null, null],
            borderColor: '#2563EB',
            backgroundColor: 'rgba(37,99,235,.1)',
            fill: true, tension: .3, pointRadius: 4
          },
          {
            label: 'Verwacht',
            data: [...new Array(actualLabels.length).fill(null), actualData.at(-1) || 0, ...projData],
            borderColor: '#16A34A',
            borderDash: [6, 3],
            fill: false, tension: .3, pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top', labels: { color: '#999', font: { size: 11 } } } },
        scales: {
          y: { ticks: { callback: v => '€' + v.toLocaleString('nl-NL'), color: '#666', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,.04)' }, border: { display: false } },
          x: { ticks: { color: '#666', font: { size: 11 } }, grid: { display: false }, border: { display: false } }
        }
      }
    });
  }
}

function buildClientHealthSection(leads) {
  const clients = (leads || []).filter(l => l.status === 'client');
  if (!clients.length) return '';
  const now = Date.now();
  const day = 86400000;
  const rows = clients.map(l => {
    const pendingPayment = (l.payments || []).some(p => p.status !== 'paid' && p.dueDate && new Date(p.dueDate) < new Date());
    const overdue30 = (l.payments || []).some(p => p.status !== 'paid' && p.dueDate && (now - new Date(p.dueDate).getTime()) > 30*day);
    const noDeliverables = l.intakeSubmittedAt && !((l.agentDeliverables||[]).length) && (now - new Date(l.intakeSubmittedAt).getTime()) > 14*day;
    const waitingDeliverable = (l.agentDeliverables||[]).some(d => d.status === 'wacht_op_goedkeuring' && d.builtAt && (now - new Date(d.builtAt).getTime()) > 7*day);
    const noPortalActivity = l.portalToken && !l.lastPortalVisit && l.projectStartedAt && (now - new Date(l.projectStartedAt).getTime()) > 30*day;

    let health = 'green', reason = 'Alles in orde';
    if (overdue30 || noDeliverables) { health = 'red'; reason = overdue30 ? 'Betaling >30 dagen verlopen' : 'Geen deliverables na intake'; }
    else if (pendingPayment || waitingDeliverable || noPortalActivity) {
      health = 'orange';
      reason = pendingPayment ? 'Betaling openstaand' : waitingDeliverable ? 'Deliverable wacht op goedkeuring' : 'Geen portaal activiteit >30 dagen';
    }
    const color = health === 'green' ? 'var(--success)' : health === 'orange' ? '#f59e0b' : 'var(--danger)';
    const label = health === 'green' ? 'Gezond' : health === 'orange' ? 'Aandacht' : 'Kritiek';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="openProjectPage('${esc(l.id)}')">
      <td style="padding:10px 14px;font-size:13px;font-weight:600">${esc(l.companyName)}</td>
      <td style="padding:10px 14px"><span style="display:inline-flex;align-items:center;gap:6px;background:${color}22;color:${color};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>${label}</span></td>
      <td style="padding:10px 14px;font-size:13px;color:var(--text-secondary)">${esc(reason)}</td>
      <td style="padding:10px 14px"><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();openProjectPage('${esc(l.id)}')">Open →</button></td>
    </tr>`;
  }).join('');

  if (!rows) return '';
  return `<div class="card" style="margin-top:24px">
    <div class="card-header"><h3 class="card-title"><i class="ti ti-heart-rate-monitor" style="margin-right:8px"></i>Klant gezondheid</h3></div>
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse">
        <thead><tr style="background:var(--surface-2)">
          <th style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);text-align:left">Klant</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);text-align:left">Status</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);text-align:left">Reden</th>
          <th style="padding:10px 14px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-secondary);text-align:left">Actie</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}


// ─── Task 45 — Dashboard widget selector ──────────────────────────────────────
const DEFAULT_WIDGETS = ['stats','inbox','clients','referral','upsell','forecast'];

function getEnabledWidgets() {
  try { return JSON.parse(localStorage.getItem('dashWidgets') || 'null') || DEFAULT_WIDGETS; }
  catch { return DEFAULT_WIDGETS; }
}

function openWidgetSelector() {
  const enabled = getEnabledWidgets();
  const ALL = [
    { key: 'stats',    label: 'Statistieken kaarten' },
    { key: 'inbox',    label: 'Inbox overzicht' },
    { key: 'clients',  label: 'Klant gezondheid' },
    { key: 'referral', label: 'Referral programma' },
    { key: 'upsell',   label: 'Upsell kansen' },
    { key: 'forecast', label: '💰 Financieel overzicht' },
    { key: 'chart',    label: 'Pipeline grafiek' },
  ];
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">⚙️ Dashboard widgets</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Kies welke widgets zichtbaar zijn op je dashboard.</p>
    <div style="margin-bottom:20px;">
      ${ALL.map(w => `
        <div class="widget-toggle">
          <label style="display:flex;align-items:center;gap:10px;cursor:pointer;flex:1;">
            <input type="checkbox" data-widget="${w.key}" ${enabled.includes(w.key)?'checked':''}>
            <span style="font-size:14px;font-weight:500;">${w.label}</span>
          </label>
        </div>`).join('')}
    </div>
    <div style="display:flex;justify-content:flex-end;gap:10px;">
      <button onclick="closeModal()" class="btn btn-secondary">Annuleren</button>
      <button onclick="_saveWidgetPrefs()" class="btn btn-primary">Opslaan</button>
    </div>
  `);
}

function _saveWidgetPrefs() {
  const checked = [...document.querySelectorAll('[data-widget]:checked')].map(cb => cb.dataset.widget);
  localStorage.setItem('dashWidgets', JSON.stringify(checked));
  closeModal();
  renderDashboard();
  toast('Dashboard bijgewerkt');
}
