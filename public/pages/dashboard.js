// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Overzicht</div>
        <h1 class="page-title">Dashboard</h1>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="openWidgetSelector()" data-tooltip="Widgets aanpassen">
        <i class="ti ti-layout-dashboard"></i> Widgets
      </button>
    </div>
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

  const pending = state.inbox.filter(i => !i.status || i.status === 'pending').length;
  if (typeof updateInboxBadge === 'function') updateInboxBadge(pending);

  const settings = await apiJSON('/api/settings');
  state.settings = settings || {};
  if (typeof updateSidebarLogo === 'function') updateSidebarLogo(settings?.agencyLogo || '');

  const nextRun = typeof getNextRunTime === 'function'
    ? getNextRunTime(settings?.dailyRunTime || '09:00')
    : { label: '—', countdown: '—', target: null };
  const recentRuns = (Array.isArray(runs) ? runs : []).slice(0, 10);

  const weekLabels = getLast7Days();
  const weekCounts = getWeekCounts(stats.weeklyData || [], weekLabels);

  const dashboardContent = document.getElementById('dashboardContent');
  if (!dashboardContent) return;
  dashboardContent.innerHTML = `
    ${!settings?.resendConfigured ? `
      <div class="alert-banner alert-banner-amber" onclick="setView('settings');setTimeout(()=>document.querySelector('[data-tab=email]')?.click(),100)" style="cursor:pointer;margin-bottom:16px">
        <i class="ti ti-mail-off" style="font-size:16px"></i>
        <strong>Email niet ingesteld</strong>
        <span style="color:var(--text-secondary);font-weight:400">— voeg RESEND_API_KEY toe om emails te versturen. Klik om in te stellen &rarr;</span>
      </div>
    ` : ''}
    ${pending > 0 ? `
      <div class="alert-banner" onclick="setView('inbox')" style="cursor:pointer;margin-bottom:20px">
        <i class="ti ti-inbox" style="font-size:16px"></i>
        <strong>${pending} lead${pending !== 1 ? 's' : ''} wachten op beoordeling</strong>
        <span style="color:var(--text-secondary);font-weight:400">— klik om te openen</span>
      </div>
    ` : ''}

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div class="stat-value">${stats.leadsFound || 0}</div>
        <div class="stat-label">Leads in pipeline</div>
        ${stats.last24hLeads > 0 ? `<div class="stat-sub">+${stats.last24hLeads} vandaag</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-mail"></i></div>
        <div class="stat-value">${stats.emailsSent || 0}</div>
        <div class="stat-label">Emails verstuurd</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-message-circle"></i></div>
        <div class="stat-value">${stats.replies || 0}</div>
        <div class="stat-label">Replies ontvangen</div>
      </div>
      <div class="stat-card${pending > 0 ? ' stat-card-urgent' : ''}" style="cursor:pointer" onclick="setView('inbox')">
        <div class="stat-icon"><i class="ti ti-inbox"></i></div>
        <div class="stat-value">${pending || 0}</div>
        <div class="stat-label">Te beoordelen</div>
        ${pending > 0 ? `<div class="stat-sub" style="color:var(--warning)">Bekijken &rarr;</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-currency-euro"></i></div>
        <div class="stat-value">€${(stats.pipelineValue || 0).toLocaleString('nl-NL')}</div>
        <div class="stat-label">Pipeline waarde</div>
        ${stats.last24hValue > 0 ? `<div class="stat-sub">+€${Math.round(stats.last24hValue).toLocaleString('nl-NL')} vandaag</div>` : ''}
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-trophy"></i></div>
        <div class="stat-value">€${earned.toLocaleString('nl-NL')}</div>
        <div class="stat-label">Verdiend (betaald)${stats.clients > 0 ? ` · ${stats.clients} klant${stats.clients !== 1 ? 'en' : ''}` : ''}</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Outreach per dag</h3>
          <span class="card-meta">Afgelopen 7 dagen</span>
        </div>
        <div class="chart-wrap">
          <canvas id="weekChart"></canvas>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Pipeline funnel</h3>
        </div>
        <div class="funnel" id="funnelChart"></div>
      </div>
    </div>

    <div class="dashboard-grid" style="grid-template-columns:1fr 1fr">
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Auto-run</h3>
          ${settings?.automationPaused
            ? `<span class="badge badge-red"><i class="ti ti-pause"></i> Gepauzeerd</span>`
            : `<span class="badge badge-green"><i class="ti ti-player-play"></i> Actief</span>`
          }
        </div>
        <div style="margin-top:4px">
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">Volgende run</div>
          <div style="font-size:20px;font-weight:700;color:var(--text-primary);letter-spacing:-0.5px">${settings?.automationPaused ? '—' : nextRun.label}</div>
          ${!settings?.automationPaused ? `<div style="font-size:12px;color:var(--text-muted);margin-top:6px">Afteltimer: <span id="countdown" class="mono" style="color:var(--accent);font-weight:600">${nextRun.countdown}</span></div>` : ''}
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">
          Laatste run: ${recentRuns[0] ? relativeTime(recentRuns[0].createdAt) : 'nog niet gerund'}
        </div>
        ${isAdmin() ? `
        <div style="margin-top:14px">
          <button class="btn btn-sm ${settings?.automationPaused ? 'btn-primary' : 'btn-outline'}" onclick="toggleAutoRun(${!!settings?.automationPaused})">
            <i class="ti ti-${settings?.automationPaused ? 'player-play' : 'pause'}"></i>
            ${settings?.automationPaused ? 'Auto-run hervatten' : 'Auto-run pauzeren'}
          </button>
        </div>` : ''}
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recente activiteit</h3>
        </div>
        ${recentRuns.length === 0
          ? `<div class="empty-state"><i class="ti ti-history"></i><p>Nog geen activiteit</p></div>`
          : `<div class="activity-list">${recentRuns.slice(0,5).map(r => `
              <div class="activity-item">
                <div class="activity-icon"><i class="ti ti-bolt"></i></div>
                <div class="activity-body">
                  <div class="activity-title">${r.leadsFound || 0} leads gevonden</div>
                  <div class="activity-time">${relativeTime(r.createdAt)}</div>
                </div>
                ${r.emailsSent > 0 ? `<span class="badge badge-green" style="font-size:11px">${r.emailsSent} emails</span>` : ''}
              </div>
            `).join('')}</div>`
        }
      </div>
    </div>

    <div id="upsellSection"></div>
    <div id="referralSection"></div>
  `;

  // Weekly chart
  const ctx = document.getElementById('weekChart')?.getContext('2d');
  if (ctx) {
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: weekLabels,
        datasets: [{
          label: 'Emails verstuurd',
          data: weekCounts,
          backgroundColor: 'rgba(37,99,235,0.12)',
          borderColor: '#2563eb',
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } }, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { ticks: { font: { size: 11 } }, grid: { display: false } }
        }
      }
    });
  }

  // Funnel
  const funnelStages = [
    { label: 'Gevonden',      count: stats.leadsFound || 0,   color: '#2563eb' },
    { label: 'Gekwalificeerd',count: state.leads.filter(l => l.score >= 6).length, color: '#7c3aed' },
    { label: 'Verstuurd',     count: stats.emailsSent || 0,   color: '#16a34a' },
    { label: 'Gereageerd',    count: stats.replies || 0,       color: '#ea580c' }
  ];
  const maxCount = Math.max(...funnelStages.map(s => s.count), 1);
  const funnelEl = document.getElementById('funnelChart');
  if (!funnelEl) return;
  funnelEl.innerHTML = funnelStages.map((s, i) => {
    const width = Math.max(30, Math.round((s.count / maxCount) * 100));
    return `
      <div class="funnel-row">
        <div class="funnel-label">${s.label}</div>
        <div class="funnel-bar-wrap">
          <div class="funnel-bar" style="width:${width}%;background:${s.color}">
            <span>${s.count}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Countdown timer
  if (typeof startCountdown === 'function' && nextRun.target) startCountdown(nextRun.target);

  // Upsell kansen
  const upsells = await apiJSON('/api/upsell') || [];
  const upsellSection = document.getElementById('upsellSection');
  if (upsellSection && upsells.length > 0) {
    upsellSection.innerHTML = `
      <div class="card" style="margin-top:0">
        <div class="card-header">
          <h3 class="card-title"><i class="ti ti-trending-up" style="color:#f59e0b;margin-right:6px"></i>Upsell kansen</h3>
          <span class="badge badge-amber">${upsells.length} klant${upsells.length !== 1 ? 'en' : ''}</span>
        </div>
        ${upsells.map(o => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid #f3f4f6;gap:12px;flex-wrap:wrap">
            <div style="min-width:0">
              <div style="font-size:14px;font-weight:600;color:var(--text-primary)">${esc(o.companyName)}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">Huidig: <em>${esc(o.currentService)}</em> &rarr; Voorstel: <strong>${esc(o.upsellService)}</strong> &mdash; €${(o.upsellPrice||0).toLocaleString('nl-NL')}/mnd &mdash; klant ${o.daysSince} dagen</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="generateUpsellEmail('${o.leadId}')">
              <i class="ti ti-mail"></i> Genereer upsell email
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }

  // Referral overzicht
  const ref = await apiJSON('/api/referrals').catch(() => null);
  const refSection = document.getElementById('referralSection');
  if (refSection && ref) {
    const { stats: rs, referredLeads } = ref;
    refSection.innerHTML = `
      <div class="card" style="margin-top:0">
        <div class="card-header">
          <h3 class="card-title"><i class="ti ti-users-group" style="color:var(--accent);margin-right:6px"></i>Referral programma</h3>
          <button class="btn btn-ghost btn-sm" style="padding:3px 7px" title="Hoe werkt dit?" onclick="document.getElementById('referralInfoBox').style.display=document.getElementById('referralInfoBox').style.display==='none'?'block':'none'"><i class="ti ti-info-circle"></i></button>
          ${rs.totalSent > 0 ? `<span class="badge badge-blue">${rs.totalSent} verzoek${rs.totalSent !== 1 ? 'en' : ''} verstuurd</span>` : ''}
        </div>
        <div id="referralInfoBox" style="display:none;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;font-size:13px;color:var(--text-secondary);margin-bottom:14px;line-height:1.6">
          <strong style="color:var(--text-primary);display:block;margin-bottom:4px"><i class="ti ti-info-circle" style="color:var(--accent)"></i> Hoe werkt het referral programma?</strong>
          Het referral programma stuurt automatisch een vriendelijk verzoek naar klanten die al 90 dagen actief zijn om jouw agency aan te bevelen. Als zij iemand doorverwijzen die klant wordt, ontvangen ze een korting op hun volgende factuur.
          <div style="margin-top:8px;font-size:12px;color:var(--text-muted)"><i class="ti ti-clock"></i> Eerste referral mogelijk na 90 dagen klant zijn.</div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding:4px 0 14px">
          ${[
            { label: 'Verzoeken verstuurd', value: rs.totalSent,    color: '#2563eb' },
            { label: 'Doorverwezen leads',  value: rs.totalReferred, color: '#7c3aed' },
            { label: 'Geconverteerd',       value: rs.converted,    color: '#16a34a' }
          ].map(k => `
            <div style="text-align:center;padding:10px;background:var(--surface-2);border-radius:var(--radius)">
              <div style="font-size:22px;font-weight:800;color:${k.color}">${k.value}</div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px">${k.label}</div>
            </div>
          `).join('')}
        </div>
        ${referredLeads.length > 0 ? `
          <div class="card-label" style="margin-bottom:8px">Doorverwezen leads</div>
          ${referredLeads.slice(0, 5).map(l => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border-light);cursor:pointer" onclick="openLeadDetail('${l.id}')">
              <div>
                <div style="font-size:13px;font-weight:600">${esc(l.companyName)}</div>
                <div style="font-size:11px;color:var(--text-muted)">via ${esc(l.referrerName)}</div>
              </div>
              <span class="badge badge-${l.status === 'client' ? 'green' : l.status === 'replied' ? 'blue' : 'gray'}">${STATUS_LABELS[l.status] || l.status}</span>
            </div>
          `).join('')}
        ` : `<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Nog geen doorverwezen leads. Koppel referrers via de lead-detail pagina.</div>`}
      </div>
    `;
  }

  // Client health dashboard section
  const healthHtml = buildClientHealthSection(state.leads);
  if (healthHtml) {
    const healthDiv = document.createElement('div');
    healthDiv.innerHTML = healthHtml;
    document.getElementById('referralSection')?.after(healthDiv);
  }

  // Revenue forecasting section (Task 18)
  renderForecastSection();
}

async function renderForecastSection() {
  const forecast = await apiJSON('/api/stats/forecast');
  if (!forecast) return;
  const section = document.getElementById('content');
  if (!section) return;
  const fmt = (n) => '€' + (n || 0).toLocaleString('nl-NL');
  const growthColor = forecast.growth_rate >= 0 ? '#16a34a' : '#ef4444';
  const growthSign = forecast.growth_rate >= 0 ? '+' : '';
  const forecastHtml = `
    <div class="card" id="forecastSection" style="margin-top:24px;">
      <div class="card-header" style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title">💰 Financieel Overzicht</h3>
        <span style="font-size:12px;font-weight:700;color:${growthColor};background:${forecast.growth_rate >= 0?'#dcfce7':'#fee2e2'};padding:3px 10px;border-radius:20px;">${growthSign}${forecast.growth_rate}% vs vorige maand</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;padding:0 20px 20px;">
        <div style="background:var(--surface-2);border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">MRR</div>
          <div style="font-size:24px;font-weight:800;color:var(--text-primary);">${fmt(forecast.current_mrr)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">per maand</div>
        </div>
        <div style="background:var(--surface-2);border-radius:10px;padding:16px;text-align:center;">
          <div style="font-size:11px;color:var(--text-secondary);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">ARR</div>
          <div style="font-size:24px;font-weight:800;color:var(--text-primary);">${fmt(forecast.current_arr)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">per jaar</div>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:16px;text-align:center;border:1px solid #16a34a22;">
          <div style="font-size:11px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">🔮 30 dagen</div>
          <div style="font-size:24px;font-weight:800;color:#15803d;">${fmt(forecast.forecast_30d)}</div>
          <div style="font-size:11px;color:#16a34a;">verwacht</div>
        </div>
        <div style="background:#f0fdf4;border-radius:10px;padding:16px;text-align:center;border:1px solid #16a34a22;">
          <div style="font-size:11px;color:#16a34a;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">🔮 90 dagen</div>
          <div style="font-size:24px;font-weight:800;color:#15803d;">${fmt(forecast.forecast_90d)}</div>
          <div style="font-size:11px;color:#16a34a;">verwacht</div>
        </div>
        <div style="background:#fff7ed;border-radius:10px;padding:16px;text-align:center;border:1px solid #f59e0b22;">
          <div style="font-size:11px;color:#d97706;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px;">⚠️ Open facturen</div>
          <div style="font-size:24px;font-weight:800;color:#92400e;">${fmt(forecast.pipeline_value)}</div>
          <div style="font-size:11px;color:#d97706;">openstaand</div>
        </div>
      </div>
      <canvas id="forecastChart" style="max-height:200px;padding:0 20px 20px;"></canvas>
    </div>`;
  section.insertAdjacentHTML('beforeend', forecastHtml);

  // Draw chart
  const canvas = document.getElementById('forecastChart');
  if (canvas && window.Chart) {
    const actualLabels = forecast.months_actual.map(m => m.label);
    const actualData = forecast.months_actual.map(m => m.revenue);
    const projLabels = forecast.months_projected.map(m => m.label);
    const projData = forecast.months_projected.map(m => m.revenue);

    new Chart(canvas, {
      type: 'line',
      data: {
        labels: [...actualLabels, ...projLabels],
        datasets: [
          { label: 'Werkelijk', data: [...actualData, null, null, null], borderColor: '#6366f1', backgroundColor: '#6366f122', fill: true, tension: .3, pointRadius: 4 },
          { label: 'Verwacht', data: [...actualData.fill ? [] : new Array(actualLabels.length).fill(null), actualData.at(-1), ...projData], borderColor: '#10b981', borderDash: [6,3], fill: false, tension: .3, pointRadius: 3 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: v => '€' + v.toLocaleString('nl-NL') } } } }
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
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="setView('project');setTimeout(()=>openLeadDetail('${esc(l.id)}'),50)">
      <td style="padding:10px 14px;font-size:13px;font-weight:600">${esc(l.companyName)}</td>
      <td style="padding:10px 14px"><span style="display:inline-flex;align-items:center;gap:6px;background:${color}22;color:${color};border-radius:20px;padding:3px 10px;font-size:12px;font-weight:600"><span style="width:7px;height:7px;border-radius:50%;background:${color};flex-shrink:0"></span>${label}</span></td>
      <td style="padding:10px 14px;font-size:13px;color:var(--text-secondary)">${esc(reason)}</td>
      <td style="padding:10px 14px"><button class="btn btn-sm btn-outline" onclick="event.stopPropagation();setView('project');setTimeout(()=>openLeadDetail('${esc(l.id)}'),50)">Open →</button></td>
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
