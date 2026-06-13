// ─── Dashboard ────────────────────────────────────────────────────────────────

function _dashGreeting() {
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
      @media(max-width:1200px){.db-kpi-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:900px){.db-cols{grid-template-columns:1fr}}
      @media(max-width:600px){.db-kpi-grid{grid-template-columns:1fr 1fr}.db-fin-grid{flex-direction:column}.db-fin-item{border-right:none;border-bottom:1px solid #2A2A2A}.db-fin-item:last-child{border-bottom:none}.db-header-btns{width:100%}}
    </style>
    <div id="dashboardContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  const [stats, inbox, runs, allLeads] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON('/api/inbox'),
    apiJSON('/api/runs'),
    apiJSON('/api/leads')
  ]);

  if (!stats) return;

  state.stats = stats;
  state.inbox = inbox || [];
  state.leads = allLeads || [];

  const earned = stats.totalEarned || 0;
  const pending = state.inbox.filter(i => !i.status || i.status === 'pending');
  if (typeof updateInboxBadge === 'function') updateInboxBadge(pending.length);

  const settings = await apiJSON('/api/settings');
  state.settings = settings || {};
  if (typeof updateSidebarLogo === 'function') updateSidebarLogo(settings?.agencyLogo || '');

  const nextRun = typeof getNextRunTime === 'function'
    ? getNextRunTime(settings?.dailyRunTime || '09:00')
    : { label: '—', countdown: '—', target: null };
  const recentRuns = (Array.isArray(runs) ? runs : []).slice(0, 10);

  const leads = state.leads;

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

  // Activity feed (runs + replied + new clients)
  const activity = [];
  recentRuns.slice(0, 5).forEach(r => activity.push({
    text: `Run: ${r.leadsFound||0} leads gevonden${r.emailsSent > 0 ? ' · ' + r.emailsSent + ' emails' : ''}`,
    time: r.createdAt, color: '#2563EB'
  }));
  leads.filter(l => l.repliedAt).sort((a, b) => new Date(b.repliedAt) - new Date(a.repliedAt)).slice(0, 3).forEach(l =>
    activity.push({ text: `${esc(l.companyName)} heeft gereageerd`, time: l.repliedAt, color: '#16A34A' })
  );
  leads.filter(l => l.status === 'client' && l.projectStartedAt).sort((a, b) => new Date(b.projectStartedAt) - new Date(a.projectStartedAt)).slice(0, 2).forEach(l =>
    activity.push({ text: `${esc(l.companyName)} is klant geworden`, time: l.projectStartedAt, color: '#7c3aed' })
  );
  activity.sort((a, b) => new Date(b.time) - new Date(a.time));

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
    ${settings?.isDemo ? `
      <div class="db-demo-banner">
        <i class="ti ti-flask"></i>
        <strong>Demo modus actief</strong> — Gegevens zijn gesimuleerd en worden niet opgeslagen.
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
        <div class="db-kpi-num">${stats.emailsSent || 0}</div>
        <div class="db-kpi-trend ${stats.last24hLeads > 0 ? 'up' : 'nt'}">
          ${stats.last24hLeads > 0 ? `+${stats.last24hLeads} vandaag` : 'Geen vandaag'}
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
        <div class="db-kpi-trend ${stats.clients > 0 ? 'up' : 'nt'}">
          ${stats.clients > 0 ? `${stats.clients} klant${stats.clients !== 1 ? 'en' : ''}` : 'Geen klanten'}
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
                ${isAdmin() ? `<button class="db-btn-approve" onclick="approve('${esc(item.id)}')">✓</button>` : ''}
                <button class="db-btn-reject" onclick="disapprove('${esc(item.id)}')">✕</button>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="db-card">
          <div class="db-card-hdr">
            <div class="db-card-ttl">Recente activiteit</div>
          </div>
          ${activity.length === 0 ? `
            <div class="db-empty">
              <div class="db-empty-icon"><i class="ti ti-history"></i></div>
              <div class="db-empty-text">Nog geen activiteit</div>
            </div>
          ` : activity.slice(0, 8).map(a => `
            <div class="db-activity-item">
              <div class="db-activity-dot" style="background:${a.color}"></div>
              <div class="db-activity-body">
                <div class="db-activity-text">${a.text}</div>
                <div class="db-activity-time">${relativeTime(a.time)}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="db-right-col">
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
            <button class="db-btn db-btn-ghost db-btn-sm" style="width:100%;justify-content:center" onclick="toggleAutoRun(${!!settings?.automationPaused})">
              <i class="ti ti-${settings?.automationPaused ? 'player-play' : 'pause'}"></i>
              ${settings?.automationPaused ? 'Auto-run hervatten' : 'Auto-run pauzeren'}
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
            <div class="db-health-row" onclick="openProjectPage('${esc(r.id)}')">
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

  // Upsell kansen (async)
  const upsells = await apiJSON('/api/upsell') || [];
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
  renderForecastSection();
}

async function renderForecastSection() {
  const forecast = await apiJSON('/api/stats/forecast');
  if (!forecast) return;
  const section = document.getElementById('db-financial');
  if (!section) return;
  const fmt = n => '€' + (n || 0).toLocaleString('nl-NL');
  const growthUp = forecast.growth_rate >= 0;
  const growthSign = growthUp ? '+' : '';
  section.innerHTML = `
    <div class="db-card">
      <div class="db-card-hdr">
        <div class="db-card-ttl">Financieel overzicht</div>
        <span class="db-badge ${growthUp ? 'green' : 'red'}">${growthSign}${forecast.growth_rate}% vs vorige maand</span>
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
    const actualLabels = forecast.months_actual.map(m => m.label);
    const actualData   = forecast.months_actual.map(m => m.revenue);
    const projLabels   = forecast.months_projected.map(m => m.label);
    const projData     = forecast.months_projected.map(m => m.revenue);
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
