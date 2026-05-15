// ─── Auth guard — runs before anything else ───────────────────────────────────
(async function checkAuth() {
  if (!window.location.pathname.startsWith('/app')) return;
  const token = localStorage.getItem('agencyToken');
  if (!token) {
    window.location.href = '/login';
    return;
  }
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.valid) {
      localStorage.clear();
      window.location.href = '/login';
    }
  } catch {
    // If server unreachable, allow offline PWA use
  }
})();

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  view: 'dashboard',
  leads: [],
  inbox: [],
  stats: {},
  settings: {},
  runningPipeline: false,
  currentLeadId: null
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────
function getToken() {
  return localStorage.getItem('agencyToken') || '';
}

function authHeaders() {
  return {
    'Authorization': 'Bearer ' + getToken(),
    'Content-Type': 'application/json'
  };
}

function logout() {
  localStorage.clear();
  window.location.href = '/login';
}

function getRole() {
  return localStorage.getItem('agencyRole') || 'admin';
}

function isAdmin() {
  return getRole() === 'admin';
}

// ─── API wrapper (always sends auth header) ───────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    logout();
    return null;
  }
  return res;
}

async function apiJSON(path, options = {}) {
  const res = await api(path, options);
  if (!res) return null;
  return res.json();
}

async function claudeCall(prompt, expectJson = false) {
  return apiJSON('/api/claude', {
    method: 'POST',
    body: JSON.stringify({ prompt, json: expectJson })
  });
}

// ─── Routing ──────────────────────────────────────────────────────────────────
const VIEW_LABELS = {
  dashboard: 'Dashboard', inbox: 'Inbox', leads: 'Leads', pipeline: 'Pipeline',
  agents: 'Agents', runs: 'Runs', stats: 'Statistieken', chat: 'Chat', settings: 'Instellingen'
};

function setView(view) {
  // Stop chat polling when leaving chat view
  if (state.view === 'chat' && view !== 'chat' && state._chatPollTimer) {
    clearInterval(state._chatPollTimer);
    state._chatPollTimer = null;
  }
  // Destroy Chart.js instances when leaving stats view
  if (state.view === 'stats' && view !== 'stats') destroyStatsCharts();
  state.view = view;

  // Update topbar breadcrumb
  const topbarPage = document.getElementById('topbarPage');
  if (topbarPage) topbarPage.textContent = VIEW_LABELS[view] || view;

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  const views = {
    dashboard: renderDashboard,
    inbox:     renderInbox,
    leads:     renderLeads,
    pipeline:  renderPipeline,
    agents:    renderAgents,
    runs:      renderRuns,
    stats:     renderStats,
    chat:      renderChat,
    settings:  renderSettings
  };

  const render = views[view] || renderDashboard;
  render();
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `
    <i class="ti ti-${type === 'success' ? 'check' : type === 'error' ? 'x' : 'info-circle'}"></i>
    <span>${msg}</span>
  `;
  container.appendChild(t);
  setTimeout(() => t.classList.add('visible'), 10);
  setTimeout(() => {
    t.classList.remove('visible');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(html) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal-box">
        ${html}
      </div>
    </div>
  `;
  setTimeout(() => container.querySelector('.modal-backdrop').classList.add('visible'), 10);
  container.querySelector('.modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}

function closeModal() {
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('visible');
    setTimeout(() => { document.getElementById('modalContainer').innerHTML = ''; }, 200);
  }
}

// ─── Relative time ────────────────────────────────────────────────────────────
function relativeTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return 'zojuist';
  if (m < 60) return `${m} min geleden`;
  if (h < 24) return `${h} uur geleden`;
  return `${d} dag${d !== 1 ? 'en' : ''} geleden`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatOptimalTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  return `${days[d.getDay()]} om ${String(d.getHours()).padStart(2,'0')}:00`;
}
// ─── Score color ──────────────────────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 8) return 'success';
  if (score >= 6) return 'warning';
  return 'danger';
}

// ─── Niche badge color ────────────────────────────────────────────────────────
const NICHE_COLORS = {
  beauty: 'pink', food: 'orange', fitness: 'blue',
  retail: 'purple', restaurant: 'amber', default: 'gray'
};

const APP_SUB_NICHES = {
  beauty:     ['kapsalon', 'nagelsalon', 'schoonheidssalon', 'tattoo studio', 'barbershop'],
  food:       ['bakkerij', 'traiteur', 'foodtruck', 'ijssalon', 'slagerij'],
  fitness:    ['personal trainer', 'yoga studio', 'crossfit box', 'sportschool', 'martial arts'],
  retail:     ['kledingwinkel', 'schoenenwinkel', 'juwelier', 'boekenwinkel', 'cadeauwinkel'],
  restaurant: ['Italiaans restaurant', 'sushi restaurant', 'café', 'eetcafé', 'steakhouse'],
  horeca:     ['hotel', 'bed & breakfast', 'hostel', 'vakantiepark', 'camping'],
  health:     ['tandarts', 'fysiotherapeut', 'chiropractor', 'opticien', 'apotheek'],
  automotive: ['garagebedrijf', 'autoverkoop', 'wasstraat', 'bandendienst', 'schadeherstelbedrijf'],
};

function nicheBadge(niche) {
  const color = NICHE_COLORS[niche?.toLowerCase()] || NICHE_COLORS.default;
  return `<span class="badge badge-${color}">${niche || 'Onbekend'}</span>`;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Overzicht</div>
        <h1 class="page-title">Dashboard</h1>
      </div>
      <button class="btn btn-primary" id="runNowBtn">
        <i class="ti ti-player-play"></i> Run nu
      </button>
    </div>
    <div id="dashboardContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  document.getElementById('runNowBtn').addEventListener('click', triggerFindLeads);

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

  const earned = state.leads
    .filter(l => l.status === 'client')
    .reduce((sum, l) => sum + (l.estimatedValue || 0), 0);

  const pending = state.inbox.filter(i => !i.status || i.status === 'pending').length;
  updateInboxBadge(pending);

  const settings = await apiJSON('/api/settings');
  state.settings = settings || {};

  const nextRun = getNextRunTime(settings?.dailyRunTime || '09:00');
  const recentRuns = (runs || []).slice(0, 10);

  const weekLabels = getLast7Days();
  const weekCounts = getWeekCounts(stats.weeklyData || [], weekLabels);

  document.getElementById('dashboardContent').innerHTML = `
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
        <div class="stat-label">Verdiend${stats.clients > 0 ? ` · ${stats.clients} klant${stats.clients !== 1 ? 'en' : ''}` : ''}</div>
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
          <div style="font-size:20px;font-weight:700;color:var(--text-primary);letter-spacing:-0.5px">${nextRun.label}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:6px">Afteltimer: <span id="countdown" class="mono" style="color:var(--accent);font-weight:600">${nextRun.countdown}</span></div>
        </div>
        <div style="margin-top:12px;font-size:12px;color:var(--text-muted)">
          Laatste run: ${recentRuns[0] ? relativeTime(recentRuns[0].createdAt) : 'nog niet gerund'}
        </div>
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
  document.getElementById('funnelChart').innerHTML = funnelStages.map((s, i) => {
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
  startCountdown(nextRun.target);

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
              <div style="font-size:14px;font-weight:600;color:#111">${o.companyName}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px">Huidig: <em>${o.currentService}</em> &rarr; Voorstel: <strong>${o.upsellService}</strong> &mdash; €${(o.upsellPrice||0).toLocaleString('nl-NL')}/mnd &mdash; klant ${o.daysSince} dagen</div>
            </div>
            <button class="btn btn-ghost btn-sm" style="flex-shrink:0" onclick="generateUpsellEmail('${o.leadId}')">
              <i class="ti ti-mail"></i> Genereer upsell email
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// ─── Inbox ────────────────────────────────────────────────────────────────────
async function renderInbox() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Beoordelen</div>
        <h1 class="page-title">Inbox</h1>
      </div>
    </div>
    <div id="inboxContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  const inbox = await apiJSON('/api/inbox') || [];
  state.inbox = inbox;
  const settings = await apiJSON('/api/settings') || {};
  state.settings = settings;

  const pending = inbox.filter(i => i.status === 'pending');
  const trashed = inbox.filter(i => i.status === 'disapproved');
  updateInboxBadge(pending.length);

  const container = document.getElementById('inboxContent');

  if (!settings.gmailAddress) {
    container.innerHTML += `
      <div class="alert-banner" onclick="setView('settings')" style="cursor:pointer;margin-bottom:20px">
        <i class="ti ti-mail-off" style="font-size:16px"></i>
        <strong>Gmail niet ingesteld</strong>
        <span style="color:var(--text-secondary);font-weight:400">— klik hier om in te stellen</span>
      </div>
    `;
  }

  if (pending.length === 0) {
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-inbox-off"></i>
        <h3>Inbox is leeg</h3>
        <p>Kom morgen terug of run handmatig via het dashboard</p>
        <button class="btn btn-primary" onclick="setView('dashboard')">
          <i class="ti ti-layout-dashboard"></i> Naar dashboard
        </button>
      </div>
    `;
    return;
  }

  const highScore = pending.filter(i => (i.score || 0) >= 8.0);
  const bulkBar = pending.length >= 3 ? `
    <div id="bulkBar" class="bulk-bar">
      <span class="bulk-bar-count">${pending.length} leads klaar voor beoordeling</span>
      ${highScore.length > 0 ? `
        <button class="btn btn-primary btn-sm" onclick="bulkApproveHigh()">
          <i class="ti ti-bolt"></i> ${highScore.length} × 8.0+ goedkeuren
        </button>
      ` : ''}
      <button class="btn btn-ghost btn-sm" onclick="bulkSelectAll()"><i class="ti ti-checkbox"></i> Alles selecteren</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkDeselectAll()"><i class="ti ti-square"></i> Deselecteren</button>
      <button class="btn btn-blue btn-sm" id="bulkApproveSelBtn" style="display:none" onclick="bulkApproveSelected()">
        <i class="ti ti-check"></i> Geselecteerde goedkeuren (<span id="bulkSelCount">0</span>)
      </button>
    </div>
  ` : '';

  let html = bulkBar + pending.map(item => buildInboxCard(item)).join('');

  if (trashed.length > 0) {
    html += `
      <div class="trash-section">
        <div class="trash-header">
          <i class="ti ti-trash"></i>
          <span class="trash-title">Prullenbak</span>
          <span class="badge badge-red">${trashed.length}</span>
          <button class="btn btn-ghost btn-sm" onclick="emptyTrash()" style="margin-left:auto;color:var(--danger)">
            <i class="ti ti-trash"></i> Alles verwijderen
          </button>
        </div>
        ${trashed.map(item => `
          <div class="trash-card">
            <div class="trash-card-body">
              <div class="trash-card-row">
                <span class="trash-company">${esc(item.companyName)}</span>
                <span class="text-secondary" style="font-size:12px">${esc(item.niche)} &bull; ${esc(item.location)}</span>
                ${item.score ? `<span class="score-pill score-${scoreColor(item.score)}">${Number(item.score).toFixed(1)}</span>` : ''}
              </div>
              ${item.email?.subject ? `<div class="trash-subject">${esc(item.email.subject)}</div>` : ''}
              ${item.disapprovedAt ? `<div class="trash-date">Afgewezen ${formatDate(item.disapprovedAt)}</div>` : ''}
            </div>
            <div class="trash-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="restoreTrash('${item.id}')">
                <i class="ti ti-restore"></i> Herstel
              </button>
              <button class="btn btn-ghost btn-sm" onclick="deleteTrash('${item.id}')" style="color:var(--danger)">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
  attachInboxHandlers();
  initSwipeHandlers();
}

function buildInboxCard(item) {
  const score = item.score || 0;
  const colorClass = scoreColor(score);
  const typeLabel = item.type === 'followup1' ? 'Follow-up #1' :
                    item.type === 'followup2' ? 'Follow-up #2' :
                    item.type === 'referral'  ? 'Referral' : 'Nieuw';
  const typeBadge = item.type?.startsWith('followup')
    ? `<span class="badge badge-amber">${typeLabel}</span>`
    : item.type === 'referral'
    ? `<span class="badge badge-purple">${typeLabel}</span>`
    : `<span class="badge badge-blue">${typeLabel}</span>`;
  const langFlag = item.language === 'nl' ? '🇳🇱' : item.language === 'en' ? '🇬🇧' : '';

  return `
    <div class="inbox-card" data-id="${item.id}" id="card-${item.id}" data-selected-version="A">
      <label class="inbox-checkbox-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="bulk-checkbox" data-id="${item.id}" onchange="updateBulkSelCount()" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer">
      </label>

      <div class="inbox-card-header">
        <div class="inbox-card-title-row">
          <h3 class="inbox-company">${esc(item.companyName)}${langFlag ? ` <span class="lang-flag">${langFlag}</span>` : ''}</h3>
          ${typeBadge}
          ${item.status === 'auto-approved' ? `<span class="badge badge-green" style="font-size:10px"><i class="ti ti-bolt"></i> Auto-goedgekeurd</span>` : ''}
        </div>
        <div class="inbox-card-meta">
          ${nicheBadge(item.niche)}
          ${item.subNiche ? `<span class="sub-niche-pill">${esc(item.subNiche)}</span>` : ''}
          <span class="text-secondary" style="font-size:12px"><i class="ti ti-map-pin"></i> ${esc(item.location || '—')}</span>
          ${item.websiteUrl ? `<a href="${item.websiteUrl}" target="_blank" class="link" style="font-size:12px"><i class="ti ti-world"></i> Website</a>` : ''}
        </div>
        <div class="inbox-email-row">
          ${item.contactEmail
            ? `<span class="inbox-email-addr"><i class="ti ti-mail"></i> ${esc(item.contactEmail)}</span>
               <span class="email-src-badge ${item.emailSource === 'gevonden' ? 'email-src-found' : 'email-src-guess'}">${item.emailSource === 'gevonden' ? 'Gevonden' : 'Geschat'}</span>`
            : `<span class="inbox-email-none"><i class="ti ti-mail-off"></i> Geen email gevonden</span>`}
        </div>
        <div class="score-display score-${colorClass}">
          <span class="score-number">${score.toFixed(1)}</span>
          <span class="score-label">/ 10</span>
        </div>
      </div>

      ${item.emailOpener ? `
        <div class="opener-preview">
          <i class="ti ti-quote"></i>
          <span>${esc(item.emailOpener)}</span>
        </div>
      ` : ''}

      ${item.problems?.length ? `
        <div class="inbox-section">
          <div class="inbox-section-title"><i class="ti ti-alert-triangle" style="color:var(--danger)"></i> Problemen gevonden</div>
          <ul class="problem-list">
            ${item.problems.map(p => `<li><i class="ti ti-point-filled" style="color:var(--danger)"></i> ${p}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${item.services?.length ? `
        <div class="inbox-section">
          <div class="inbox-section-title"><i class="ti ti-currency-euro" style="color:var(--success)"></i> Kansen</div>
          <ul class="opportunity-list">
            ${item.services.map(s => `
              <li>
                <span>${s.name}</span>
                <span class="service-price">€${s.price}/mnd</span>
              </li>
            `).join('')}
          </ul>
          ${item.estimatedValue ? `<div class="estimated-value">Geschatte maandwaarde: <strong>€${item.estimatedValue.toLocaleString('nl-NL')}</strong></div>` : ''}
        </div>
      ` : ''}

      ${item.subjectOptions?.length >= 3 ? `
        <div class="inbox-section inbox-subjects-section">
          <div class="inbox-section-title"><i class="ti ti-tag" style="color:var(--accent)"></i> Onderwerpopties</div>
          <div class="subject-chips" id="subjectChips-${item.id}">
            ${item.subjectOptions.map((s, i) => `
              <button class="subject-chip${i === 0 ? ' subject-chip-active' : ''}"
                      onclick="selectSubject('${item.id}',${i})"
                      title="${esc(s)}">
                <span class="subject-chip-num">${i + 1}</span>
                <span class="subject-chip-text">${esc(s)}</span>
              </button>`).join('')}
          </div>
        </div>
      ` : ''}

      ${item.emailA && item.emailB ? `
        <div class="inbox-section inbox-ab-section">
          <div class="inbox-ab-header">
            <div class="inbox-section-title" style="margin-bottom:0"><i class="ti ti-test-pipe" style="color:var(--accent)"></i> A/B email versies</div>
            <div style="display:flex;gap:4px">
              <button id="btnA-${item.id}" class="ab-btn ab-btn-active" onclick="selectVersion('${item.id}','A')">A</button>
              <button id="btnB-${item.id}" class="ab-btn" onclick="selectVersion('${item.id}','B')">B</button>
            </div>
          </div>
          <div id="abSubject-${item.id}" class="ab-subject">${esc(item.emailA.subject)}</div>
          <div id="abDesc-${item.id}" class="ab-desc">Probleem-gericht</div>
        </div>
      ` : ''}

      ${item.voicenoteScript ? `
        <div class="voicenote-wrap">
          <button class="btn btn-ghost btn-sm voicenote-toggle" onclick="toggleVoicenote('${item.id}')">
            <i class="ti ti-microphone"></i> Voicenote script
            <i class="ti ti-chevron-down" id="voiceChevron-${item.id}" style="font-size:11px;margin-left:2px"></i>
          </button>
          <div id="voicenote-${item.id}" class="voicenote-body" style="display:none">
            <p>${esc(item.voicenoteScript)}</p>
            <div class="voicenote-footer">
              <span><i class="ti ti-info-circle"></i> Spreek in als WhatsApp of Instagram voicenote</span>
              <button class="btn btn-ghost btn-sm" onclick="copyText('${(item.voicenoteScript||'').replace(/'/g, "\\'")}','Voicenote gekopieerd!')">
                <i class="ti ti-copy"></i> Kopiëren
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="inbox-actions">
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="viewEmail('${item.id}')">
            <i class="ti ti-mail"></i> Email
          </button>
          <button class="btn btn-ghost btn-sm" onclick="viewLinkedin('${item.id}')">
            <i class="ti ti-brand-linkedin"></i> LinkedIn
          </button>
        </div>
        <div class="inbox-primary-actions">
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="disapprove('${item.id}')">
            <i class="ti ti-x"></i> Afwijzen
          </button>
          ${item.sendOptimalTime ? `
            <button class="btn btn-ghost btn-sm" style="color:var(--success)" onclick="approve('${item.id}')">
              <i class="ti ti-send"></i> Nu
            </button>
            <button class="btn btn-primary btn-sm" onclick="scheduleApprove('${item.id}')">
              <i class="ti ti-clock"></i> ${formatOptimalTime(item.sendOptimalTime)}
            </button>
          ` : `
            <button class="btn btn-primary btn-sm" onclick="approve('${item.id}')">
              <i class="ti ti-check"></i> Goedkeuren & Versturen
            </button>
          `}
        </div>
      </div>
    </div>
  `;
}

function attachInboxHandlers() {}

function selectVersion(id, version) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  card.dataset.selectedVersion = version;
  const item = state.inbox?.find(i => i.id === id);
  if (!item) return;
  const email = version === 'B' ? item.emailB : item.emailA;
  const desc  = version === 'B' ? 'Groeikansen-gericht' : 'Probleem-gericht';
  const subjectEl = document.getElementById('abSubject-' + id);
  const descEl    = document.getElementById('abDesc-' + id);
  const btnA = document.getElementById('btnA-' + id);
  const btnB = document.getElementById('btnB-' + id);
  if (subjectEl && email) subjectEl.textContent = email.subject || '';
  if (descEl) descEl.textContent = desc;
  if (btnA) { btnA.classList.toggle('ab-btn-active', version === 'A'); }
  if (btnB) { btnB.classList.toggle('ab-btn-active', version === 'B'); }
}

function initSwipeHandlers() {
  document.querySelectorAll('.inbox-card').forEach(card => {
    let startX = 0;
    card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, { passive: true });
    card.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - startX;
      const id = card.dataset.id;
      if (dx > 80) approve(id);
      else if (dx < -80) disapprove(id);
    }, { passive: true });
  });
}

async function approve(id) {
  const card = document.getElementById('card-' + id);
  card.style.transition = 'all 0.3s';
  card.style.background = '#f0fdf4';
  card.style.borderColor = '#10b981';
  const version = card?.dataset.selectedVersion || 'A';

  const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ version }) });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Goedkeuren mislukt', 'error');
    card.style.background = '';
    card.style.borderColor = '';
    return;
  }

  toast('Email verstuurd! ✓', 'success');
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 300);
    updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function scheduleApprove(id) {
  const card = document.getElementById('card-' + id);
  card.style.transition = 'all 0.3s';
  card.style.background = '#fffbeb';
  card.style.borderColor = '#f59e0b';
  const version = card?.dataset.selectedVersion || 'A';

  const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ version, scheduled: true }) });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Inplannen mislukt', 'error');
    card.style.background = '';
    card.style.borderColor = '';
    return;
  }

  const item = state.inbox?.find(i => i.id === id);
  const timeLabel = item?.sendOptimalTime ? formatOptimalTime(item.sendOptimalTime) : '';
  toast(`Ingepland voor ${timeLabel} ✓`, 'success');
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 300);
    updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function disapprove(id) {
  const card = document.getElementById('card-' + id);
  card.style.transition = 'all 0.3s';
  card.style.background = '#fef2f2';
  card.style.borderColor = '#ef4444';

  await api(`/api/inbox/${id}/disapprove`, { method: 'PATCH' });
  toast('Lead afgewezen — staat in prullenbak', 'info');
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => { card.remove(); renderInbox(); }, 300);
    updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function restoreTrash(id) {
  await api(`/api/inbox/${id}/restore`, { method: 'PATCH' });
  showToast('Lead hersteld naar inbox!', 'success');
  renderInbox();
}

async function deleteTrash(id) {
  if (!confirm('Definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
  await api(`/api/inbox/${id}?deleteLead=true`, { method: 'DELETE' });
  showToast('Definitief verwijderd', 'info');
  renderInbox();
}

async function emptyTrash() {
  if (!confirm('Alle afgewezen leads definitief verwijderen?')) return;
  const trashed = (state.inbox || []).filter(i => i.status === 'disapproved');
  for (const item of trashed) {
    await api(`/api/inbox/${item.id}?deleteLead=true`, { method: 'DELETE' });
  }
  showToast(`${trashed.length} leads verwijderd`, 'info');
  renderInbox();
}

function viewEmail(id) {
  const item = state.inbox.find(i => i.id === id);
  if (!item?.email) return toast('Geen email beschikbaar', 'error');
  const card = document.getElementById('card-' + id);
  const version = card?.dataset.selectedVersion || 'A';
  const emailToShow = (version === 'B' && item.emailB) ? item.emailB : (item.emailA || item.email);
  const versionLabel = (item.emailA && item.emailB) ? ` (versie ${version})` : '';
  const subjectIdx = parseInt(card?.dataset.selectedSubjectIdx || '0', 10);
  const subject = item.subjectOptions?.[subjectIdx] || emailToShow.subject;

  openModal(`
    <div class="modal-header">
      <h3>Email${versionLabel} — ${esc(item.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    ${item.subjectOptions?.length >= 3 ? `
      <div class="modal-subject-picker">
        <div class="modal-subject-picker-label">Kies onderwerp</div>
        <div id="modalSubjectPicker-${id}">
          ${item.subjectOptions.map((s, i) => `
            <label class="modal-subject-option${i === subjectIdx ? ' modal-subject-option-active' : ''}"
                   onclick="selectSubject('${id}',${i});updateModalSubject('${id}',${i})">
              <input type="radio" name="subjectPick-${id}" value="${i}" ${i === subjectIdx ? 'checked' : ''}
                     style="accent-color:var(--accent);flex-shrink:0">
              <span>${esc(s)}</span>
            </label>`).join('')}
        </div>
      </div>
    ` : ''}
    <div class="email-preview">
      <div class="email-subject" id="modalEmailSubject-${id}"><strong>Onderwerp:</strong> ${esc(subject)}</div>
      <div class="email-body">${(emailToShow.body || '').replace(/\n/g, '<br>')}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyModalEmail('${id}')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}

function selectSubject(id, idx) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  card.dataset.selectedSubjectIdx = idx;
  document.querySelectorAll(`#subjectChips-${id} .subject-chip`).forEach((el, i) => {
    el.classList.toggle('subject-chip-active', i === idx);
  });
}

function updateModalSubject(id, idx) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item?.subjectOptions) return;
  const subject = item.subjectOptions[idx];
  const el = document.getElementById('modalEmailSubject-' + id);
  if (el) el.innerHTML = `<strong>Onderwerp:</strong> ${esc(subject)}`;
  const picker = document.getElementById('modalSubjectPicker-' + id);
  if (picker) {
    picker.querySelectorAll('.modal-subject-option').forEach((lbl, i) => {
      lbl.classList.toggle('modal-subject-option-active', i === idx);
    });
  }
}

function copyModalEmail(id) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item) return;
  const card = document.getElementById('card-' + id);
  const version = card?.dataset.selectedVersion || 'A';
  const emailToShow = (version === 'B' && item.emailB) ? item.emailB : (item.emailA || item.email);
  const subjectIdx = parseInt(card?.dataset.selectedSubjectIdx || '0', 10);
  const subject = item.subjectOptions?.[subjectIdx] || emailToShow.subject;
  copyText(subject + '\n\n' + (emailToShow.body || ''));
}

function viewLinkedin(id) {
  const item = state.inbox.find(i => i.id === id);
  if (!item?.linkedinDm) return toast('Geen LinkedIn DM beschikbaar', 'error');
  openModal(`
    <div class="modal-header">
      <h3>LinkedIn DM — ${item.companyName}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="email-preview">
      <div class="email-body">${item.linkedinDm.replace(/\n/g, '<br>')}</div>
      <div class="char-count">${item.linkedinDm.length} / 280 tekens</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyText(\`${item.linkedinDm.replace(/`/g, '\\`')}\`)">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg || 'Gekopieerd!', 'success'));
}

function exportLeadsCSV(statusFilter) {
  const url = '/api/leads/export.csv' + (statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '');
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  toast('CSV export gestart!', 'success');
}

function toggleVoicenote(id) {
  const box = document.getElementById('voicenote-' + id);
  const chevron = document.getElementById('voiceChevron-' + id);
  if (!box) return;
  const isOpen = box.style.display !== 'none';
  box.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function updateBulkSelCount() {
  const checked = document.querySelectorAll('.bulk-checkbox:checked');
  const btn = document.getElementById('bulkApproveSelBtn');
  const countEl = document.getElementById('bulkSelCount');
  if (countEl) countEl.textContent = checked.length;
  if (btn) btn.style.display = checked.length > 0 ? '' : 'none';
}

function bulkSelectAll() {
  document.querySelectorAll('.bulk-checkbox').forEach(cb => { cb.checked = true; });
  updateBulkSelCount();
}

function bulkDeselectAll() {
  document.querySelectorAll('.bulk-checkbox').forEach(cb => { cb.checked = false; });
  updateBulkSelCount();
}

async function bulkApproveHigh() {
  const high = (state.inbox || []).filter(i => (i.status === 'pending' || i.status === 'auto-approved') && (i.score || 0) >= 8.0);
  if (!high.length) return;
  if (!confirm(`${high.length} leads worden goedgekeurd en emails worden verstuurd. Doorgaan?`)) return;
  await runBulkApprove(high.map(i => i.id));
}

async function bulkApproveSelected() {
  const ids = Array.from(document.querySelectorAll('.bulk-checkbox:checked')).map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`${ids.length} leads worden goedgekeurd en emails worden verstuurd. Doorgaan?`)) return;
  await runBulkApprove(ids);
}

async function runBulkApprove(ids) {
  const bar = document.getElementById('bulkBar');
  if (bar) bar.innerHTML = `
    <div style="width:100%;padding:4px 0">
      <div style="font-size:13px;color:var(--text-primary);margin-bottom:8px">Bezig met versturen… <span id="bulkProgress">0</span> / ${ids.length}</div>
      <div style="background:var(--border);border-radius:99px;height:5px;overflow:hidden">
        <div id="bulkProgressBar" style="height:100%;background:var(--accent);border-radius:99px;width:0;transition:width 0.3s"></div>
      </div>
    </div>`;

  let done = 0;
  for (const id of ids) {
    const card = document.getElementById('card-' + id);
    const version = card?.dataset.selectedVersion || 'A';
    try {
      const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ version }) });
      if (res.ok) {
        done++;
        const prog = document.getElementById('bulkProgress');
        const bar2 = document.getElementById('bulkProgressBar');
        if (prog) prog.textContent = done;
        if (bar2) bar2.style.width = Math.round((done / ids.length) * 100) + '%';
        if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }
      }
    } catch { /* skip failed */ }
  }

  toast(`${done} email${done !== 1 ? 's' : ''} verstuurd!`, 'success');
  setTimeout(() => renderInbox(), 800);
}

// ─── Leads tab ───────────────────────────────────────────────────────────────

async function renderLeads() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label" id="leadsCountLabel">… BEDRIJVEN</div>
        <h1 class="page-title">Leads</h1>
        <p class="page-subtitle">Alle gevonden bedrijven met severity-score en geïdentificeerde problemen.</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" id="toggleFiltersBtn">
          <i class="ti ti-filter"></i> Filters
        </button>
        <button class="btn btn-ghost btn-sm" onclick="exportLeadsCSV()">
          <i class="ti ti-download"></i> Export CSV
        </button>
      </div>
    </div>
    <div class="pipeline-layout" id="leadsLayout">
      <div id="leadsContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
      <div id="detailPanel" class="detail-panel"></div>
    </div>
  `;

  const [leads, inbox, settings, users] = await Promise.all([apiJSON('/api/leads'), apiJSON('/api/inbox'), apiJSON('/api/settings'), isAdmin() ? apiJSON('/api/users') : Promise.resolve([])]);
  state.leads = leads || [];
  state.inbox = inbox || [];
  if (settings) state.settings = settings;
  if (users) state.users = users;

  const lbl = document.getElementById('leadsCountLabel');
  if (lbl) lbl.textContent = `${(leads || []).length} BEDRIJVEN`;

  const container = document.getElementById('leadsContent');

  if (!leads || leads.length === 0) {
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-users-off"></i>
        <h3>Nog geen leads gevonden</h3>
        <p>Run de lead finder om bedrijven te ontdekken</p>
        <button class="btn btn-primary" onclick="setView('dashboard')">
          <i class="ti ti-player-play"></i> Naar dashboard
        </button>
      </div>
    `;
    return;
  }

  const niches = [...new Set(leads.map(l => l.niche).filter(Boolean))];
  let activeNiche = 'all';
  let activeStatus = 'all';
  let activeScore = 'all';
  let sortBy = 'newest';
  let searchQ = '';
  const selectedLeads = new Set();

  function getFiltered() {
    let result = leads.filter(l => {
      const matchNiche  = activeNiche === 'all' || l.niche === activeNiche;
      const matchStatus = activeStatus === 'all' || l.status === activeStatus ||
        (activeStatus === 'sent' && ['sent','auto-approved','followup1','followup2'].includes(l.status));
      const matchScore  = activeScore === 'all' ||
        (activeScore === '8+' && (l.score || 0) >= 8) ||
        (activeScore === '6+' && (l.score || 0) >= 6);
      const q = searchQ;
      const matchSearch = !q ||
        l.companyName?.toLowerCase().includes(q) ||
        l.location?.toLowerCase().includes(q) ||
        l.niche?.toLowerCase().includes(q) ||
        l.email?.address?.toLowerCase().includes(q);
      return matchNiche && matchStatus && matchScore && matchSearch;
    });
    if (sortBy === 'score')   result = [...result].sort((a, b) => (b.score || 0) - (a.score || 0));
    else if (sortBy === 'value') result = [...result].sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0));
    else if (sortBy === 'name')  result = [...result].sort((a, b) => (a.companyName || '').localeCompare(b.companyName || ''));
    else result = [...result].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return result;
  }

  function isFiltered() {
    return activeNiche !== 'all' || activeStatus !== 'all' || activeScore !== 'all' || searchQ;
  }

  function updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    if (!bar) return;
    if (selectedLeads.size > 0) {
      bar.style.display = 'flex';
      const lbl = bar.querySelector('.bulk-count');
      if (lbl) lbl.textContent = `${selectedLeads.size} geselecteerd`;
    } else {
      bar.style.display = 'none';
    }
    const allBtn = document.getElementById('selectAllBtn') || document.getElementById('selectAllBtnMain');
    if (allBtn) {
      const filtered = getFiltered();
      const allSelected = filtered.length > 0 && filtered.every(l => selectedLeads.has(l.id));
      allBtn.innerHTML = allSelected
        ? '<i class="ti ti-square-check"></i> Deselecteer alles'
        : '<i class="ti ti-square"></i> Selecteer alles';
    }
  }

  function renderGrid() {
    const filtered = getFiltered();
    const countEl = document.getElementById('filterCount');
    if (countEl) countEl.textContent = filtered.length === leads.length ? `${leads.length} leads` : `${filtered.length} van ${leads.length} leads`;
    const clearBtn = document.getElementById('clearFiltersBtn');
    if (clearBtn) clearBtn.style.display = isFiltered() ? '' : 'none';
    const grid = document.getElementById('leadsGrid');
    if (!grid) return;
    if (filtered.length === 0) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><i class="ti ti-search-off"></i><p>Geen leads gevonden voor deze filters</p></div>`;
      return;
    }
    const COUNTRY_COLORS = { NL:'#FF6B35', BE:'#FFD700', DE:'#333333', GB:'#003087', US:'#002868' };
    const COUNTRY_TEXT   = { BE:'#333333' };
    grid.innerHTML = filtered.map(l => {
      const checked    = selectedLeads.has(l.id);
      const country    = l.country || (l.language === 'nl' ? 'NL' : l.language === 'en' ? 'GB' : null);
      const flagBg     = country ? (COUNTRY_COLORS[country] || '#9b9b98') : '#9b9b98';
      const flagTxt    = COUNTRY_TEXT[country] || '#fff';
      const countryCode = country || '??';
      const score      = l.score || 0;
      const scoreStr   = score.toFixed(1);
      const scoreCls   = score >= 8 ? 'score-num-green' : score >= 6 ? 'score-num-amber' : 'score-num-red';
      const volgers    = l.estimatedFollowers || l.linkedinCompanyFollowers || 0;
      const volgersStr = volgers >= 1000 ? (volgers/1000).toFixed(0)+'K' : (volgers || '—');
      const visits     = l.website?.monthlyVisits || l.monthlyVisits;
      const visitsStr  = visits ? (visits >= 1000 ? (visits/1000).toFixed(0)+'K' : visits) : '—';
      const websiteOk  = l.website?.reachable;
      const websiteHtml = l.websiteUrl
        ? (websiteOk ? '<span class="lc2-stat-online">● Online</span>' : '<span class="lc2-stat-offline">● Offline</span>')
        : '<span class="lc2-stat-val">—</span>';
      const dealWaarde = l.estimatedValue ? `€${(l.estimatedValue/1000).toFixed(0)}K` : '—';
      const nichePill  = l.niche ? `<span class="pill pill-gray">${esc(l.niche)}</span>${l.subNiche ? `<span class="sub-niche-pill">${esc(l.subNiche)}</span>` : ''}` : '';
      const sizePill   = l.companySize ? `<span class="pill pill-gray">${l.companySize === 'small' ? 'Klein' : l.companySize === 'medium' ? 'Middel' : 'Groot'}</span>` : '';
      const urgPill    = l.urgency === 'critical' ? `<span class="pill pill-red">kritiek</span>` : (l.urgency === 'high' || l.urgency === 'hoog') ? `<span class="pill pill-amber">hoog</span>` : '';
      return `
        <div class="lead-card-v2${checked ? ' lead-card-v2-selected' : ''}" onclick="openLeadDetail('${l.id}')">
          <input type="checkbox" class="lc2-checkbox" ${checked ? 'checked' : ''}
            onclick="event.stopPropagation();toggleLeadSelect('${l.id}')" title="Selecteer">
          <div class="lc2-header">
            <div class="lead-flag-sq" style="background:${flagBg};color:${flagTxt}">${countryCode}</div>
            <div class="lc2-name">${esc(l.companyName)}</div>
            <div class="lc2-score-wrap">
              <div class="lc2-score-num ${scoreCls}">${scoreStr}</div>
              <div class="lc2-score-label">SEVERITY</div>
            </div>
          </div>
          <div class="lc2-tags">${nichePill}${sizePill}${urgPill}</div>
          <div class="lc2-divider"></div>
          <div class="lc2-stats">
            <div>
              <div class="lc2-stat-lbl">VOLGERS</div>
              <div class="lc2-stat-val">${volgersStr}</div>
            </div>
            <div>
              <div class="lc2-stat-lbl">VISITS/MND</div>
              <div class="lc2-stat-val">${visitsStr}</div>
            </div>
            <div>
              <div class="lc2-stat-lbl">WEBSITE</div>
              ${websiteHtml}
            </div>
            <div>
              <div class="lc2-stat-lbl">DEAL-WAARDE</div>
              <div class="lc2-stat-val">${dealWaarde}</div>
            </div>
          </div>
          <div class="lc2-footer">
            <span class="text-muted" style="font-size:11px">${relativeTime(l.createdAt)}</span>
            <button class="lc2-open-btn" onclick="event.stopPropagation();openLeadDetail('${l.id}')">
              Open ›
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.toggleLeadSelect = function(id) {
    if (selectedLeads.has(id)) selectedLeads.delete(id);
    else selectedLeads.add(id);
    renderGrid();
    updateBulkBar();
  };

  window.deleteOneLead = async function(id, name) {
    if (!confirm(`${name} verwijderen? Dit kan niet ongedaan worden.`)) return;
    const r = await api(`/api/leads/${id}`, { method: 'DELETE' });
    if (r?.ok) {
      const idx = leads.findIndex(l => l.id === id);
      if (idx !== -1) leads.splice(idx, 1);
      selectedLeads.delete(id);
      renderGrid();
      updateBulkBar();
      toast(`${name} verwijderd.`, 'success');
    } else {
      toast('Verwijderen mislukt.', 'error');
    }
  };

  window.bulkDeleteLeads = async function() {
    const ids = [...selectedLeads];
    if (ids.length === 0) return;
    if (!confirm(`${ids.length} lead${ids.length > 1 ? 's' : ''} definitief verwijderen?`)) return;
    const r = await api('/api/leads/bulk-delete', { method: 'POST', body: JSON.stringify({ ids }) });
    if (r?.ok) {
      ids.forEach(id => {
        const idx = leads.findIndex(l => l.id === id);
        if (idx !== -1) leads.splice(idx, 1);
        selectedLeads.delete(id);
      });
      renderGrid();
      updateBulkBar();
      toast(`${ids.length} lead${ids.length > 1 ? 's' : ''} verwijderd.`, 'success');
    } else {
      toast('Verwijderen mislukt.', 'error');
    }
  };

  window.selectAllLeads = function() {
    const filtered = getFiltered();
    const allSelected = filtered.every(l => selectedLeads.has(l.id));
    if (allSelected) filtered.forEach(l => selectedLeads.delete(l.id));
    else filtered.forEach(l => selectedLeads.add(l.id));
    renderGrid();
    updateBulkBar();
  };

  container.innerHTML = `
    <div id="bulkActionBar" class="bulk-action-bar" style="display:none">
      <span class="bulk-count"></span>
      <button class="btn btn-danger btn-sm" onclick="bulkDeleteLeads()">
        <i class="ti ti-trash"></i> Verwijder selectie
      </button>
      <button class="btn btn-ghost btn-sm" onclick="selectAllLeads()" id="selectAllBtn">
        <i class="ti ti-square"></i> Selecteer alles
      </button>
    </div>
    <div class="leads-bar">
      <div class="leads-bar-search">
        <input type="search" class="search-input" id="leadsSearch" placeholder="Zoek bedrijf of stad...">
      </div>
      <div class="leads-bar-chips">
        <button class="niche-chip active" data-niche="all">Alles <span class="niche-chip-count">${leads.length}</span></button>
        ${niches.map(n => {
          const cnt = leads.filter(l => l.niche === n).length;
          return `<button class="niche-chip" data-niche="${n}">${esc(n)} <span class="niche-chip-count">${cnt}</span></button>`;
        }).join('')}
      </div>
    </div>
    <div id="leadsFilterPanel" class="leads-filter-panel" style="display:none">
      <div class="leads-filter-group">
        <span class="leads-filter-group-label">Status</span>
        <div class="filter-chips">
          <button class="filter-chip active" data-status="all">Alles</button>
          <button class="filter-chip" data-status="inbox">Inbox</button>
          <button class="filter-chip" data-status="approved">Goedgekeurd</button>
          <button class="filter-chip" data-status="sent">Verstuurd</button>
          <button class="filter-chip" data-status="replied">Gereageerd</button>
          <button class="filter-chip" data-status="client">Klant</button>
          <button class="filter-chip" data-status="dead">Dead</button>
        </div>
      </div>
      <div class="leads-filter-group">
        <span class="leads-filter-group-label">Score</span>
        <div class="filter-chips">
          <button class="filter-chip active" data-score="all">Alles</button>
          <button class="filter-chip" data-score="8+">8+</button>
          <button class="filter-chip" data-score="6+">6+</button>
        </div>
      </div>
      <div class="leads-filter-group" style="margin-left:auto;flex-direction:row;align-items:center;gap:10px">
        <button class="btn btn-ghost btn-sm" id="clearFiltersBtn" style="display:none" onclick="clearLeadFilters()">
          <i class="ti ti-x"></i> Wissen
        </button>
        <span id="filterCount" class="text-muted" style="font-size:13px;white-space:nowrap">${leads.length} leads</span>
        <button class="btn btn-ghost btn-sm" onclick="selectAllLeads()" id="selectAllBtnMain">
          <i class="ti ti-square"></i> Alles
        </button>
      </div>
    </div>
    <div class="lead-cards-v2" id="leadsGrid"></div>
  `;

  renderGrid();

  document.getElementById('leadsSearch').addEventListener('input', e => {
    searchQ = e.target.value.toLowerCase();
    renderGrid();
    updateBulkBar();
  });

  document.getElementById('toggleFiltersBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('leadsFilterPanel');
    const btn   = document.getElementById('toggleFiltersBtn');
    if (!panel) return;
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    btn?.classList.toggle('active', !open);
  });

  document.querySelectorAll('[data-niche]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-niche]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeNiche = btn.dataset.niche;
      renderGrid();
    });
  });

  document.querySelectorAll('.filter-chip[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status;
      renderGrid();
    });
  });

  document.querySelectorAll('.filter-chip[data-score]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip[data-score]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeScore = btn.dataset.score;
      renderGrid();
    });
  });

  window.clearLeadFilters = function() {
    activeNiche = 'all'; activeStatus = 'all'; activeScore = 'all'; sortBy = 'newest'; searchQ = '';
    document.getElementById('leadsSearch').value = '';
    document.querySelectorAll('[data-niche]').forEach(b => b.classList.toggle('active', b.dataset.niche === 'all'));
    document.querySelectorAll('.filter-chip[data-status]').forEach(b => b.classList.toggle('active', b.dataset.status === 'all'));
    document.querySelectorAll('.filter-chip[data-score]').forEach(b => b.classList.toggle('active', b.dataset.score === 'all'));
    renderGrid();
  };
}

// ─── Pipeline tracker ─────────────────────────────────────────────────────────

const STATUS_LABELS = {
  inbox: 'Inbox', approved: 'Goedgekeurd', sent: 'Verstuurd',
  'auto-approved': 'Auto-goedgekeurd', scheduled: 'Ingepland',
  followup1: 'Follow-up 1', followup2: 'Follow-up 2',
  replied: 'Gereageerd', meeting: 'Afspraak',
  client: 'Klant ✓', disapproved: 'Afgewezen', dead: 'Dead'
};

const STATUS_COLORS = {
  inbox: 'gray', approved: 'blue', sent: 'indigo', 'auto-approved': 'indigo',
  scheduled: 'amber',
  followup1: 'amber', followup2: 'orange', replied: 'green',
  meeting: 'purple', client: 'dark-green', disapproved: 'red', dead: 'gray'
};

async function renderPipeline() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">PIPELINE</div>
        <h1 class="page-title">Sleep leads door je funnel</h1>
        <p class="page-subtitle">Van eerste touch tot betalende klant. Klik een kaart om de hele context te zien.</p>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="exportLeadsCSV()">
          <i class="ti ti-download"></i> Export
        </button>
        <div class="view-toggle">
          <button class="view-toggle-btn active" id="kanbanViewBtn" onclick="switchPipelineView('kanban')">
            <i class="ti ti-layout-board"></i> Kanban
          </button>
          <button class="view-toggle-btn" id="tableViewBtn" onclick="switchPipelineView('table')">
            <i class="ti ti-table"></i> Tabel
          </button>
        </div>
      </div>
    </div>
    <div class="pipeline-layout" id="pipelineLayout">
      <div id="pipelineContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
      <div id="detailPanel" class="detail-panel"></div>
    </div>
  `;

  const leads = await apiJSON('/api/leads') || [];
  state.leads = leads;

  const container = document.getElementById('pipelineContent');

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-git-branch"></i>
        <h3>Geen leads gevonden</h3>
        <p>Run de lead finder om leads toe te voegen</p>
        <button class="btn btn-primary" onclick="setView('dashboard')">
          <i class="ti ti-player-play"></i> Naar dashboard
        </button>
      </div>
    `;
    return;
  }

  let _pipelineView = localStorage.getItem('pipelineView') || 'kanban';

  window.switchPipelineView = function(view) {
    _pipelineView = view;
    localStorage.setItem('pipelineView', view);
    document.getElementById('kanbanViewBtn')?.classList.toggle('active', view === 'kanban');
    document.getElementById('tableViewBtn')?.classList.toggle('active', view === 'table');
    if (view === 'kanban') renderKanban(state.leads, container);
    else renderPipelineTable(state.leads, container);
  };

  // Apply saved view preference
  document.getElementById('kanbanViewBtn')?.classList.toggle('active', _pipelineView === 'kanban');
  document.getElementById('tableViewBtn')?.classList.toggle('active', _pipelineView === 'table');

  if (_pipelineView === 'table') renderPipelineTable(leads, container);
  else renderKanban(leads, container);
}

const KANBAN_COLS = [
  { key: 'inbox',    label: 'Inbox',      color: '#2563eb', statuses: ['inbox', 'pending', 'new'] },
  { key: 'approved', label: 'Gekwalif.',  color: '#7c3aed', statuses: ['approved', 'auto-approved'] },
  { key: 'sent',     label: 'Verstuurd',  color: '#16a34a', statuses: ['sent', 'followup1', 'followup2', 'scheduled'] },
  { key: 'replied',  label: 'Gereageerd', color: '#d97706', statuses: ['replied'] },
  { key: 'client',   label: 'Klant',      color: '#9b9b98', statuses: ['client'] },
  { key: 'dead',     label: 'Dead',       color: '#dc2626', statuses: ['dead', 'disapproved'] }
];

function buildKanbanCard(l) {
  const COUNTRY_COLORS = { NL:'#FF6B35', BE:'#FFD700', DE:'#333333', GB:'#003087', US:'#002868' };
  const COUNTRY_TEXT   = { BE:'#333333' };
  const country   = l.country || (l.language === 'nl' ? 'NL' : l.language === 'en' ? 'GB' : null);
  const flagBg    = country ? (COUNTRY_COLORS[country] || '#9b9b98') : '#9b9b98';
  const flagTxt   = COUNTRY_TEXT[country] || '#fff';
  const code      = country || '??';
  const score     = l.score || 0;
  const scoreCls  = score >= 8 ? 'score-num-green' : score >= 6 ? 'score-num-amber' : 'score-num-red';
  const city      = l.location ? l.location.split(',')[0].trim() : '';
  const deal      = l.estimatedValue ? `€${(l.estimatedValue/1000).toFixed(0)}K` : null;
  const hasUnread = (l.clientMessages || []).some(m => !m.read);
  return `
    <div class="kanban-card" data-id="${l.id}" draggable="true">
      <div class="kc2-header">
        <div class="lead-flag-sq" style="background:${flagBg};color:${flagTxt};width:24px;height:24px;font-size:9px;border-radius:4px">${code}</div>
        <div class="kc2-name">${esc(l.companyName || '—')}${hasUnread ? ' <span class="msg-dot"></span>' : ''}</div>
        <span class="kc2-score ${scoreCls}">${score.toFixed(1)}</span>
      </div>
      ${city ? `<div class="kc2-city"><i class="ti ti-map-pin" style="font-size:10px"></i>${esc(city)}</div>` : ''}
      <div class="kc2-tags">
        ${l.niche ? `<span class="pill pill-gray">${esc(l.niche)}</span>` : ''}
        ${deal ? `<span class="kc2-deal">${deal}</span>` : ''}
      </div>
    </div>`;
}

function renderKanban(leads, container) {
  const nameCounts = {};
  leads.forEach(l => { const n = (l.companyName||'').toLowerCase().trim(); nameCounts[n] = (nameCounts[n]||0)+1; });

  const colLeads = {};
  KANBAN_COLS.forEach(col => {
    colLeads[col.key] = leads.filter(l => col.statuses.includes(l.status || 'inbox'));
  });

  container.innerHTML = `
    <div class="kanban-board" id="kanbanBoard">
      ${KANBAN_COLS.map(col => {
        const cards = colLeads[col.key];
        const totalVal = cards.reduce((s, l) => s + (l.estimatedValue || 0), 0);
        return `
          <div class="kanban-col" data-drop-status="${col.key}">
            <div class="kanban-col-header">
              <div class="kanban-col-title">
                <span class="kanban-col-dot" style="background:${col.color}"></span>
                ${col.label}
                <span class="kanban-col-count">${cards.length}</span>
              </div>
              ${totalVal > 0 ? `<div class="kanban-col-meta">€${totalVal >= 1000 ? (totalVal/1000).toFixed(0)+'K' : totalVal} pipeline</div>` : ''}
            </div>
            <div class="kanban-col-body" data-drop-status="${col.key}">
              ${cards.length ? cards.map(l => buildKanbanCard(l)).join('') : '<div class="kanban-col-empty">Nog niets hier</div>'}
            </div>
          </div>`;
      }).join('')}
    </div>`;

  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openLeadDetail(card.dataset.id));
  });

  document.querySelectorAll('.kanban-col-body').forEach(body => {
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over'); });
    body.addEventListener('drop', async e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      const colKey = body.dataset.dropStatus;
      const STATUS_MAP = { inbox: 'inbox', approved: 'approved', sent: 'sent', replied: 'replied', client: 'client', dead: 'dead' };
      const newStatus = STATUS_MAP[colKey];
      if (!newStatus || !leadId) return;
      const lead = state.leads.find(l => l.id === leadId);
      if (!lead || lead.status === newStatus) return;
      const r = await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
      if (r?.ok) {
        lead.status = newStatus;
        renderKanban(state.leads, container);
        toast(`${lead.companyName} → ${STATUS_LABELS[newStatus]}`, 'success');
      }
    });
  });
}

function renderPipelineTable(leads, container) {
  const counts = {
    all: leads.length,
    active: leads.filter(l => ['inbox','approved','sent','auto-approved','followup1','followup2'].includes(l.status)).length,
    sent: leads.filter(l => ['sent','auto-approved'].includes(l.status)).length,
    replied: leads.filter(l => l.status === 'replied').length,
    client: leads.filter(l => l.status === 'client').length
  };

  container.innerHTML = `
    <div class="table-toolbar">
      <input type="search" class="search-input" id="leadSearch" placeholder="Zoek bedrijf...">
      <select id="sizeFilter" class="form-select" style="width:140px;font-size:13px" onchange="applyPipelineFilter()">
        <option value="">Alle groottes</option>
        <option value="small">Klein (1-10)</option>
        <option value="medium">Middel (10-50)</option>
        <option value="large">Groot (50+)</option>
      </select>
      <div class="filter-tabs">
        <button class="filter-tab active" data-filter="all">Alles (${counts.all})</button>
        <button class="filter-tab" data-filter="active">Actief (${counts.active})</button>
        <button class="filter-tab" data-filter="sent">Verstuurd (${counts.sent})</button>
        <button class="filter-tab" data-filter="replied">Gereageerd (${counts.replied})</button>
        <button class="filter-tab" data-filter="client">Klant (${counts.client})</button>
      </div>
      <select id="exportSelect" class="form-select" style="width:150px;font-size:12px" onchange="if(this.value){exportLeadsCSV(this.value==='all'?'':this.value);this.value=''}">
        <option value="">⬇ Export...</option>
        <option value="all">Alle leads</option>
        <option value="client">Alleen klanten</option>
        <option value="sent">Alleen verstuurd</option>
        <option value="replied">Alleen gereageerd</option>
      </select>
    </div>
    <div class="table-wrap">
      <table class="leads-table">
        <thead>
          <tr>
            <th>Bedrijf</th>
            <th>Niche</th>
            <th>Email</th>
            <th>Score</th>
            <th>Status</th>
            <th>Verstuurd</th>
            <th>Gereageerd</th>
            <th>Waarde</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${(() => {
            const nameCounts = {};
            leads.forEach(l => { const n = (l.companyName||'').toLowerCase().trim(); if (n) nameCounts[n] = (nameCounts[n]||0)+1; });
            const dupIds = new Set(leads.filter(l => nameCounts[(l.companyName||'').toLowerCase().trim()] > 1).map(l => l.id));
            return leads.map(l => `
            <tr class="leads-row" data-id="${l.id}" data-status="${l.status || 'inbox'}" data-size="${l.companySize || ''}">
              <td><strong>${l.companyName || '—'}${l.language === 'nl' ? ' 🇳🇱' : l.language === 'en' ? ' 🇬🇧' : ''}${l.status === 'auto-approved' ? ' <span title="Auto-goedgekeurd" style="color:#10b981;font-size:11px">⚡</span>' : ''}${l.referralPending ? ' <span title="Referral email klaar voor goedkeuring" style="font-size:11px">🎁</span>' : ''}${(l.clientMessages || []).some(m => !m.read) ? ' <span class="msg-dot" title="Ongelezen klantbericht"></span>' : ''}${dupIds.has(l.id) ? ' <span title="Mogelijk duplicaat" style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;border:1px solid #fde68a">Dubbel</span>' : ''}</strong><br><span class="text-muted" style="font-size:12px">${l.location || ''}</span></td>
              <td>${nicheBadge(l.niche)}</td>
              <td>${l.contactEmail
                ? `<span class="table-email">${esc(l.contactEmail)}</span><span class="email-src-badge ${l.emailSource === 'gevonden' ? 'email-src-found' : 'email-src-guess'}" style="margin-left:4px">${l.emailSource === 'gevonden' ? 'Gevonden' : 'Geschat'}</span>`
                : `<span class="text-warning" style="font-size:11px">Geen email</span>`}</td>
              <td><span class="score-pill score-${scoreColor(l.score || 0)}">${(l.score || 0).toFixed(1)}</span></td>
              <td>
                <span class="status-pill status-${STATUS_COLORS[l.status] || 'gray'}">${STATUS_LABELS[l.status] || 'Inbox'}</span>
                ${l.scheduledAt ? `<br><span class="text-warning" style="font-size:11px"><i class="ti ti-clock"></i> ${formatOptimalTime(l.scheduledAt)}</span>` : ''}
                ${l.openedAt ? `<br><span class="text-success" style="font-size:11px"><i class="ti ti-eye"></i> Geopend ${formatDate(l.openedAt)}${l.openCount > 1 ? ' (' + l.openCount + 'x)' : ''}</span>` : ''}
              </td>
              <td class="text-secondary">${l.sentAt ? formatDate(l.sentAt) : '—'}</td>
              <td class="text-secondary">${l.repliedAt ? formatDate(l.repliedAt) : '—'}</td>
              <td class="text-secondary">${l.estimatedValue ? '€' + l.estimatedValue.toLocaleString('nl-NL') : '—'}</td>
              <td style="display:flex;gap:4px;align-items:center">
                <button class="btn btn-ghost btn-sm" onclick="openLeadDetail('${l.id}')"><i class="ti ti-chevron-right"></i></button>
                <button class="btn btn-ghost btn-sm" title="Blacklisten" onclick="quickBlacklist('${l.id}','${esc(l.companyName)}')" style="color:var(--danger)"><i class="ti ti-ban"></i></button>
              </td>
            </tr>
          `).join('');
          })()}
        </tbody>
      </table>
    </div>
  `;

  // Filter tabs
  document.querySelectorAll('.filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;
      const activeStatuses = ['inbox','approved','sent','auto-approved','followup1','followup2'];
      document.querySelectorAll('.leads-row').forEach(row => {
        const st = row.dataset.status;
        const sizeF = document.getElementById('sizeFilter')?.value || '';
        const sizeOk = !sizeF || row.dataset.size === sizeF;
        const show = filter === 'all' ? true
          : filter === 'active' ? activeStatuses.includes(st)
          : filter === 'sent' ? ['sent','auto-approved'].includes(st)
          : st === filter;
        row.style.display = (show && sizeOk) ? '' : 'none';
      });
    });
  });

  // Search
  document.getElementById('leadSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    const sizeF2 = document.getElementById('sizeFilter')?.value || '';
    document.querySelectorAll('.leads-row').forEach(row => {
      const nameOk = row.querySelector('strong').textContent.toLowerCase().includes(q);
      const szOk   = !sizeF2 || row.dataset.size === sizeF2;
      row.style.display = (nameOk && szOk) ? '' : 'none';
    });
  });

  // Row click opens detail
  document.querySelectorAll('.leads-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openLeadDetail(row.dataset.id);
    });
    row.style.cursor = 'pointer';
  });
}

function renderLeadDetail(id) { openLeadDetail(id); }

function openLeadDetail(id) {
  const lead = state.leads.find(l => l.id === id);
  if (!lead) return;
  state.currentLeadId = id;

  // Mark row active
  document.querySelectorAll('.leads-row').forEach(r => r.classList.toggle('row-active', r.dataset.id === id));

  // Find inbox item for email/LinkedIn
  const inboxItem = state.inbox?.find?.(i => i.leadId === id) || null;

  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');

  const timeline = buildTimeline(lead);

  const flag = lead.language === 'nl' ? '🇳🇱' : lead.language === 'en' ? '🇬🇧' : '';
  const emailData    = inboxItem?.email      || lead.email;
  const linkedinData = inboxItem?.linkedinDm || lead.linkedinDm;
  const unreadCount  = (lead.clientMessages || []).filter(m => !m.read).length;

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-company">${lead.companyName}${flag ? ` ${flag}` : ''}</div>
        <div class="detail-meta">
          ${nicheBadge(lead.niche)}
          <span class="text-secondary"><i class="ti ti-map-pin"></i> ${lead.location || '—'}</span>
        </div>
        <div class="detail-email-row">
          ${lead.contactEmail
            ? `<i class="ti ti-mail" style="color:var(--text-secondary);font-size:13px"></i>
               <span class="detail-email-addr">${lead.contactEmail}</span>
               <span class="email-src-badge ${lead.emailSource === 'gevonden' ? 'email-src-found' : 'email-src-guess'}">${lead.emailSource === 'gevonden' ? 'Gevonden' : 'Geschat'}</span>
               <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;margin-left:2px" onclick="navigator.clipboard.writeText('${lead.contactEmail}');toast('Email gekopieerd!')"><i class="ti ti-copy"></i></button>`
            : `<i class="ti ti-mail-off" style="color:#f59e0b;font-size:13px"></i><span style="font-size:12px;color:#f59e0b">Geen email gevonden</span>`}
        </div>
      </div>
      <button class="btn-close-panel" onclick="closeLeadDetail()"><i class="ti ti-x"></i></button>
    </div>

    <div class="detail-tabs">
      <button class="detail-tab active" data-tab="overview"  onclick="switchDetailTab('overview')">Overzicht</button>
      <button class="detail-tab"        data-tab="email"     onclick="switchDetailTab('email')">Email</button>
      <button class="detail-tab"        data-tab="linkedin"  onclick="switchDetailTab('linkedin')">LinkedIn</button>
      <button class="detail-tab"        data-tab="website"   onclick="switchDetailTab('website')">Website</button>
      <button class="detail-tab"        data-tab="notes"     onclick="switchDetailTab('notes')">Notities</button>
      ${lead.status === 'client' ? `<button class="detail-tab" data-tab="payments" onclick="switchDetailTab('payments')">${(lead.payments?.filter(p=>p.status==='sent').length||0) > 0 ? `<i class="ti ti-coin" style="margin-right:3px;color:var(--warning)"></i>Betalingen <span class="tab-badge tab-badge-warning">${lead.payments.filter(p=>p.status==='sent').length}</span>` : '<i class="ti ti-coin" style="margin-right:3px"></i>Betalingen'}</button>` : ''}
      <button class="detail-tab"        data-tab="emails"    onclick="switchDetailTab('emails')">${(lead.clientEmailLog?.length || 0) > 0 ? `<i class="ti ti-mail" style="margin-right:3px"></i>E-mails <span class="tab-badge">${lead.clientEmailLog.length}</span>` : '<i class="ti ti-mail" style="margin-right:3px"></i>E-mails'}</button>
      <button class="detail-tab"        data-tab="portal"    onclick="switchDetailTab('portal')">Klantportaal${unreadCount > 0 ? `<span class="tab-badge">${unreadCount}</span>` : ''}</button>
      <button class="detail-tab"        data-tab="reports"   onclick="switchDetailTab('reports')">Rapporten${lead.reports?.length > 0 ? `<span class="tab-badge">${lead.reports.length}</span>` : ''}</button>
      ${lead.intakeToken ? `<button class="detail-tab" data-tab="intake" onclick="switchDetailTab('intake')">${lead.intakeSubmittedAt ? '<i class="ti ti-clipboard-check" style="color:#10b981;margin-right:4px"></i>' : '<i class="ti ti-clipboard-list" style="margin-right:4px"></i>'}Intake</button>` : ''}
      ${lead.projectPlan ? `<button class="detail-tab" data-tab="project" onclick="switchDetailTab('project')"><i class="ti ti-rocket" style="margin-right:4px"></i>Project</button>` : ''}
    </div>

    <!-- ── Tab: Overzicht ── -->
    <div class="detail-tab-content" data-tab-content="overview">
      <div class="detail-score">
        <span class="score-number score-${scoreColor(lead.score || 0)}" style="font-size:28px;font-weight:800">${(lead.score || 0).toFixed(1)}</span>
        <span class="text-secondary">/10 &nbsp;·&nbsp; €${(lead.estimatedValue || 0).toLocaleString('nl-NL')}/mnd</span>
        ${lead.urgency ? `<span class="badge badge-${lead.urgency === 'critical' ? 'danger' : lead.urgency === 'high' ? 'warning' : 'blue'}" style="font-size:10px">${lead.urgency}</span>` : ''}
      </div>

      ${lead.emailOpener ? `<div class="opener-preview" style="margin-bottom:12px"><i class="ti ti-quote"></i><span>${lead.emailOpener}</span></div>` : ''}

      ${lead.problems?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Problemen</div>
          <ul class="problem-list">
            ${lead.problems.map(p => `<li><i class="ti ti-point-filled" style="color:#ef4444;font-size:8px"></i>${p}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${lead.services?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Aanbevolen diensten</div>
          <ul class="opportunity-list">
            ${lead.services.map(s => `<li><span>${s.name}</span><span class="service-price">€${s.price}/mnd</span></li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${lead.competitors?.competitorNames?.length ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="ti ti-chart-dots" style="color:#f97316;margin-right:4px"></i>Concurrentie analyse</div>
          <div style="font-size:12px;color:#6b7280;margin-bottom:8px">Concurrenten in ${lead.location}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${lead.competitors.competitorNames.map(n => `<span style="background:#f3f4f6;border-radius:6px;padding:3px 8px;font-size:12px;font-weight:500">${n}</span>`).join('')}
          </div>
          ${lead.competitors.competitorAdvantages?.length ? `
            <ul class="problem-list" style="margin-bottom:8px">
              ${lead.competitors.competitorAdvantages.map(a => `<li><i class="ti ti-point-filled" style="color:#f97316;font-size:8px"></i>${a}</li>`).join('')}
            </ul>
          ` : ''}
          ${lead.competitors.competitorGap ? `
            <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;font-size:13px;color:#9a3412">
              <i class="ti ti-alert-triangle" style="margin-right:6px;color:#f97316"></i>${lead.competitors.competitorGap}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title">Status</div>
        <select id="statusSelect" class="detail-select" onchange="updateLeadStatus('${lead.id}', this.value)">
          ${Object.entries(STATUS_LABELS).map(([val, label]) =>
            `<option value="${val}" ${lead.status === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>

      ${['approved','scheduled','sent','replied'].includes(lead.status) && !lead.projectStartedAt ? `
        <div class="detail-section">
          <div class="project-engine-cta">
            <div class="project-engine-title"><i class="ti ti-rocket"></i> Project Engine</div>
            <div class="project-engine-sub">Start het project automatisch: portaal, intake, AI-projectplan, content kalender & taken.</div>
            <button class="btn btn-sm project-engine-btn" onclick="startProject('${lead.id}')">
              <i class="ti ti-rocket"></i> Project starten
            </button>
          </div>
        </div>
      ` : ''}

      ${lead.status === 'client' ? `
        <div class="detail-section">
          <div class="detail-section-title">Facturatie</div>
          <button class="btn btn-primary btn-sm" onclick="createInvoice('${lead.id}')">
            <i class="ti ti-receipt"></i> Betaallink aanmaken
          </button>
          ${lead.stripeUrl ? `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Laatste link: <a href="${lead.stripeUrl}" target="_blank" class="link">${lead.stripeUrl.substring(0,40)}...</a></div>` : ''}
        </div>
        <div class="detail-section" id="case-study-section-${lead.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="detail-section-title" style="margin:0">Case study</div>
            <button class="btn btn-ghost btn-sm" onclick="generateCaseStudy('${lead.id}',this)" ${lead.caseStudy ? 'style="font-size:11px"' : ''}>
              <i class="ti ti-sparkles"></i> ${lead.caseStudy ? 'Opnieuw genereren' : 'Genereer case study'}
            </button>
          </div>
          ${lead.caseStudy ? `
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#16a34a;margin-bottom:6px">${esc(lead.caseStudy.industry || lead.niche)}</div>
              <div style="font-size:14px;font-weight:700;color:#111;margin-bottom:8px">${esc(lead.caseStudy.title || '')}</div>
              <p style="font-size:12px;color:#374151;line-height:1.6;margin-bottom:10px">${esc(lead.caseStudy.challenge || '')}</p>
              ${(lead.caseStudy.results || []).length ? `<ul style="list-style:none;display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${(lead.caseStudy.results || []).map(r => `<li style="font-size:12px;font-weight:600;color:#16a34a;padding-left:16px;position:relative"><span style="position:absolute;left:0">✓</span>${esc(r)}</li>`).join('')}</ul>` : ''}
              ${lead.caseStudy.quote ? `<div style="border-left:3px solid #86efac;padding:8px 12px;font-size:12px;font-style:italic;color:#374151">&ldquo;${esc(lead.caseStudy.quote)}&rdquo;<div style="font-style:normal;font-size:11px;font-weight:600;color:#111;margin-top:4px">${esc(lead.caseStudy.quoteName || '')}</div></div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
              <button class="btn btn-ghost btn-sm" onclick="copyCaseStudy('${lead.id}')"><i class="ti ti-copy"></i> Kopiëren</button>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-left:auto">
                <input type="checkbox" id="cs-publish-${lead.id}" ${lead.caseStudy.published ? 'checked' : ''} onchange="toggleCaseStudyPublish('${lead.id}',this.checked)" style="width:14px;height:14px">
                Publiceer op website
              </label>
            </div>
          ` : '<div style="font-size:12px;color:var(--text-secondary)">Nog geen case study gegenereerd.</div>'}
        </div>
      ` : ''}
    </div>

    <!-- ── Tab: Email ── -->
    <div class="detail-tab-content" data-tab-content="email" style="display:none">
      ${emailData ? `
        <div class="detail-section">
          <div class="detail-email-subject" style="margin-bottom:10px"><strong>${emailData.subject || ''}</strong></div>
          <div class="detail-email-body">${(emailData.body || '').replace(/\n/g,'<br>')}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="copyText(\`${(emailData.subject + '\n\n' + emailData.body).replace(/`/g,'\\`')}\`)">
            <i class="ti ti-copy"></i> Kopiëren
          </button>
        </div>
      ` : '<div class="empty-state"><i class="ti ti-mail-off"></i><p>Geen email beschikbaar</p></div>'}
    </div>

    <!-- ── Tab: LinkedIn ── -->
    <div class="detail-tab-content" data-tab-content="linkedin" style="display:none">
      ${linkedinData ? `
        <div class="detail-section">
          <div class="detail-section-title">LinkedIn DM</div>
          <div class="detail-email-body">${linkedinData.replace(/\n/g,'<br>')}</div>
          <div class="char-count" style="margin-top:8px">${linkedinData.length} / 280 tekens</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="copyText(\`${linkedinData.replace(/`/g,'\\`')}\`)">
            <i class="ti ti-copy"></i> Kopiëren
          </button>
        </div>
      ` : '<div class="empty-state"><i class="ti ti-brand-linkedin"></i><p>Geen LinkedIn DM beschikbaar</p></div>'}
      ${(inboxItem?.voicenoteScript || lead.voicenoteScript) ? (() => {
        const vs = inboxItem?.voicenoteScript || lead.voicenoteScript;
        return `
        <div class="detail-section" style="margin-top:14px">
          <div class="detail-section-title"><i class="ti ti-microphone" style="color:#7c3aed;margin-right:4px"></i>Voicenote script</div>
          <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;font-size:13px;color:#4c1d95;line-height:1.6">${vs.replace(/\n/g,'<br>')}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span style="font-size:11px;color:#7c3aed"><i class="ti ti-info-circle"></i> Spreek dit in als WhatsApp of Instagram voicenote voor extra impact</span>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="copyText(\`${vs.replace(/`/g,'\\`')}\`,'Voicenote gekopieerd!')">
              <i class="ti ti-copy"></i> Kopiëren
            </button>
          </div>
        </div>`;
      })() : ''}
    </div>

    <!-- ── Tab: Website ── -->
    <div class="detail-tab-content" data-tab-content="website" style="display:none">
      ${buildWebsiteTab(lead)}
    </div>

    <!-- ── Tab: Notities ── -->
    <div class="detail-tab-content" data-tab-content="notes" style="display:none">
      <div class="detail-section">
        <div class="detail-section-title">Notities</div>
        <textarea id="leadNotes" class="detail-notes" placeholder="Voeg notities toe...">${lead.notes || ''}</textarea>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="saveNotes('${lead.id}')">
          <i class="ti ti-device-floppy"></i> Opslaan
        </button>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Tijdlijn</div>
        <div class="timeline">${timeline}</div>
      </div>
    </div>

    <!-- ── Tab: Betalingen ── -->
    ${lead.status === 'client' ? `
    <div class="detail-tab-content" data-tab-content="payments" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Betalingen</div>
          <button class="btn btn-primary btn-sm" onclick="createPayment('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuwe factuur
          </button>
        </div>

        ${(lead.payments || []).length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...(lead.payments || [])].reverse().map(p => {
              const statusColors = { sent: '#d97706', paid: '#16a34a', failed: '#dc2626', cancelled: '#9ca3af' };
              const statusLabels = { sent: 'Verstuurd', paid: 'Betaald', failed: 'Mislukt', cancelled: 'Geannuleerd' };
              const isOverdue = p.status === 'sent' && p.dueDate && new Date(p.dueDate) < new Date();
              return `
                <div style="border:1px solid ${isOverdue ? '#fecaca' : 'var(--border)'};border-radius:10px;padding:12px 14px;background:${isOverdue ? '#fef2f2' : '#fff'}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <div style="flex:1">
                      <div style="font-size:14px;font-weight:700">€${(p.amount||0).toLocaleString('nl-NL')}</div>
                      <div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(p.description||'')}${p.splitIndex ? ` — deel ${p.splitIndex}/${p.splitTotal}` : ''}</div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
                        <span style="font-size:10px;font-weight:700;background:${isOverdue?'#fef2f2':'#f3f4f6'};color:${isOverdue?'#dc2626':statusColors[p.status]||'#6b7280'};border-radius:4px;padding:2px 6px">${isOverdue?'ACHTERSTALLIG':statusLabels[p.status]||p.status}</span>
                        <span style="font-size:10px;background:#f3f4f6;border-radius:4px;padding:2px 6px">${esc(p.method||'')}</span>
                        ${p.billing === 'maandelijks' ? '<span class="badge badge-blue" style="font-size:10px">Maandelijks</span>' : ''}
                        <span style="font-size:10px;color:#9ca3af">${p.dueDate ? 'Vervalt ' + formatDate(p.dueDate) : ''}</span>
                        ${p.paidAt ? `<span style="font-size:10px;color:#16a34a">Betaald ${formatDate(p.paidAt)}</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
                      ${p.paymentUrl ? `<a href="${p.paymentUrl}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-external-link"></i> Link</a>` : ''}
                      ${p.status !== 'paid' ? `<button onclick="markPaymentPaid('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#16a34a"><i class="ti ti-check"></i> Betaald</button>` : ''}
                      ${p.status === 'sent' ? `<button onclick="remindPayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-bell"></i> Herinner</button>` : ''}
                      <button onclick="deletePayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#dc2626"><i class="ti ti-trash"></i></button>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div style="text-align:center;padding:24px;font-size:13px;color:#9ca3af">
            <i class="ti ti-coin" style="font-size:24px;display:block;margin-bottom:8px"></i>
            Nog geen betalingen aangemaakt
          </div>
        `}
      </div>
    </div>
    ` : ''}

    <!-- ── Tab: E-mails ── -->
    <div class="detail-tab-content" data-tab-content="emails" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Client e-mails sturen</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">
          ${[
            { trigger: 'welcome',        label: 'Welkomstmail',      icon: 'ti-rocket' },
            { trigger: 'intakeReceived', label: 'Intake ontvangen',   icon: 'ti-clipboard-check' },
            { trigger: 'deliveryReady',  label: 'Leveringen klaar',   icon: 'ti-sparkles' },
            { trigger: 'weekComplete',   label: 'Week afgerond',      icon: 'ti-circle-check' },
            { trigger: 'monthlyUpdate',  label: 'Maandupdate',        icon: 'ti-chart-bar' },
            { trigger: 'checkIn',        label: 'Check-in',           icon: 'ti-message-circle' },
          ].map(e => `
            <button class="btn btn-ghost btn-sm" onclick="sendClientEmail('${lead.id}','${e.trigger}')">
              <i class="ti ${e.icon}"></i> ${e.label}
            </button>
          `).join('')}
        </div>

        <div class="detail-section-title">Verstuurde e-mails</div>
        ${(lead.clientEmailLog || []).length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...(lead.clientEmailLog || [])].reverse().map(log => `
              <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
                <div style="background:#f9fafb;padding:8px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                     onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                  <div>
                    <div style="font-size:13px;font-weight:600">${esc(log.subject || '')}</div>
                    <div style="font-size:11px;color:#6b7280">${formatDate(log.sentAt)} · ${esc(log.to || '')} · ${esc(log.sentBy || 'systeem')}</div>
                  </div>
                  <i class="ti ti-chevron-down" style="color:#9ca3af;font-size:12px"></i>
                </div>
                <div style="display:none;padding:12px;font-size:12px;color:#374151;white-space:pre-line;line-height:1.6">${esc(log.body || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:#9ca3af;padding:12px 0">Nog geen e-mails verstuurd.</div>
        `}
      </div>
    </div>

    <!-- ── Tab: Klantportaal ── -->
    <div class="detail-tab-content" data-tab-content="portal" style="display:none">
      ${buildPortalTab(lead)}
    </div>

    <!-- ── Tab: Rapporten ── -->
    <div class="detail-tab-content" data-tab-content="reports" style="display:none">
      ${lead.reports?.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${lead.reports.map(r => `
            <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
              <div style="background:#f9fafb;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                   onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                <div>
                  <div style="font-size:13px;font-weight:600">${r.title}</div>
                  <div style="font-size:11px;color:#6b7280">${formatDate(r.createdAt)}</div>
                </div>
                <i class="ti ti-chevron-down" style="color:#6b7280;font-size:13px"></i>
              </div>
              <div style="padding:14px;font-size:13px;color:#374151;line-height:1.7;white-space:pre-line">
                ${r.content || ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <i class="ti ti-file-description"></i>
          <p>Nog geen rapporten</p>
          <p style="font-size:12px;color:#9ca3af">Rapporten worden automatisch aangemaakt op de 1e van elke maand voor klanten</p>
        </div>
      `}
    </div>

    ${lead.intakeToken ? `
    <!-- ── Tab: Intake ── -->
    <div class="detail-tab-content" data-tab-content="intake" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="detail-section-title" style="margin:0">Intake formulier</div>
          ${lead.intakeSubmittedAt
            ? `<span class="badge badge-green"><i class="ti ti-check"></i> Ingevuld ${formatDate(lead.intakeSubmittedAt)}</span>`
            : `<span class="badge badge-warning">Nog niet ingevuld</span>`}
        </div>
        ${lead.intakeAnswers && Object.keys(lead.intakeAnswers).length ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${Object.entries(lead.intakeAnswers).map(([q, a]) => `
              <div style="padding:10px 12px;background:#f9fafb;border:1px solid var(--border);border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">${esc(q)}</div>
                <div style="font-size:13px;color:#111;white-space:pre-line">${esc(a)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:#6b7280;margin-bottom:14px">De klant heeft de intake nog niet ingevuld.</div>
        `}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="/intake/${lead.id}/${lead.intakeToken}" target="_blank" class="btn btn-ghost btn-sm">
            <i class="ti ti-external-link"></i> Intake link openen
          </a>
          <button class="btn btn-ghost btn-sm" onclick="copyText('/intake/${lead.id}/${lead.intakeToken}'); toast('Link gekopieerd!','success')">
            <i class="ti ti-copy"></i> Link kopiëren
          </button>
        </div>
      </div>
    </div>
    ` : ''}

    ${lead.projectPlan ? `
    <!-- ── Tab: Project ── -->
    <div class="detail-tab-content" data-tab-content="project" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div class="detail-section-title" style="margin:0">${esc(lead.projectPlan.title || '')}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">Gestart: ${lead.projectStartedAt ? formatDate(lead.projectStartedAt) : '—'}</div>
          </div>
          <span class="badge badge-green"><i class="ti ti-rocket"></i> Actief</span>
        </div>
        ${lead.projectPlan.overview ? `<p style="font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px">${esc(lead.projectPlan.overview)}</p>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px">
          ${(lead.projectPlan.weeks || []).map(w => `
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <div style="background:var(--surface-2);padding:10px 14px;display:flex;align-items:center;gap:10px">
                <span class="week-badge">Week ${w.week}</span>
                <span style="font-size:13px;font-weight:600">${esc(w.focus || '')}</span>
              </div>
              <ul style="padding:10px 14px 10px 28px;margin:0;display:flex;flex-direction:column;gap:4px">
                ${(w.deliverables || []).map(d => `<li style="font-size:13px;color:#374151">${esc(d)}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="detail-section" id="tasks-section-${lead.id}">
        ${buildTasksHTML(lead, state.users || [], 1)}
      </div>

      ${lead.contentCalendar?.items?.length ? `
      <div class="detail-section">
        <div class="detail-section-title">Content Kalender — Maand 1</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(lead.contentCalendar.items || []).map(item => `
            <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:11px;background:#eef2ff;color:#6366f1;border-radius:4px;padding:2px 6px;font-weight:700">Week ${item.week}</span>
                <span style="font-size:11px;background:#f3f4f6;border-radius:4px;padding:2px 6px;font-weight:600">${esc(item.platform || '')}</span>
                <span style="font-size:11px;background:#fefce8;color:#d97706;border-radius:4px;padding:2px 6px;font-weight:600">${esc(item.type || '')}</span>
              </div>
              <div style="font-size:13px;font-weight:600">${esc(item.topic || '')}</div>
              ${item.caption ? `<div style="font-size:12px;color:#6b7280;margin-top:3px">${esc(item.caption)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="detail-section" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a href="/intake/${lead.id}/${lead.intakeToken || ''}" target="_blank" class="btn btn-ghost btn-sm">
          <i class="ti ti-clipboard-list"></i> Intake formulier
        </a>
        ${!lead.delivery && lead.intakeSubmittedAt ? `
          <button class="btn btn-primary btn-sm" onclick="generateDelivery('${lead.id}')">
            <i class="ti ti-sparkles"></i> Leveringen genereren
          </button>
        ` : ''}
        ${!lead.delivery && !lead.intakeSubmittedAt ? `
          <span style="font-size:12px;color:#9ca3af"><i class="ti ti-info-circle"></i> Leveringen beschikbaar na intake</span>
        ` : ''}
      </div>

      ${lead.delivery ? `
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="detail-section-title" style="margin:0">AI Leveringen</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge badge-green"><i class="ti ti-check"></i> Gegenereerd</span>
            <button class="btn btn-ghost btn-sm" onclick="generateDelivery('${lead.id}')" title="Opnieuw genereren"><i class="ti ti-refresh"></i></button>
          </div>
        </div>

        ${lead.delivery.contentCalendar?.items?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Content Kalender — Maand 1</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.contentCalendar.items || []).slice(0,5).map(item => `
              <div style="padding:8px 10px;background:#f9fafb;border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="display:flex;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                  <span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:1px 5px;font-weight:700">W${item.week} ${item.day||''}</span>
                  <span style="background:#f3f4f6;border-radius:4px;padding:1px 5px">${esc(item.platform||'')}</span>
                  <span style="background:#fefce8;color:#d97706;border-radius:4px;padding:1px 5px">${esc(item.type||'')}</span>
                  ${item.bestTime ? `<span style="background:#f0fdf4;color:#16a34a;border-radius:4px;padding:1px 5px">${item.bestTime}</span>` : ''}
                </div>
                <div style="font-weight:600;color:#111">${esc(item.topic||'')}</div>
                ${item.caption ? `<div style="color:#6b7280;margin-top:2px;line-height:1.4">${esc(item.caption)}</div>` : ''}
                ${item.hashtags?.length ? `<div style="color:#6366f1;margin-top:3px">${item.hashtags.join(' ')}</div>` : ''}
              </div>
            `).join('')}
            ${lead.delivery.contentCalendar.items.length > 5 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.contentCalendar.items.length - 5} meer posts</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.chatbotFlow?.faqs?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Chatbot FAQ Script</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.chatbotFlow.faqs || []).slice(0,4).map(faq => `
              <div style="padding:8px 10px;background:#f9fafb;border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="font-weight:700;color:#111;margin-bottom:3px">${esc(faq.question||'')}</div>
                <div style="color:#374151;line-height:1.5">${esc(faq.answer||'')}</div>
              </div>
            `).join('')}
            ${lead.delivery.chatbotFlow.faqs.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.chatbotFlow.faqs.length - 4} meer FAQs</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.milestones?.milestones?.length ? `
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:8px">Mijlpalen — 12 weken</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.milestones.milestones || []).slice(0,4).map(m => `
              <div style="padding:8px 10px;background:#f9fafb;border:1px solid var(--border);border-radius:7px;font-size:12px;display:flex;gap:8px;align-items:flex-start">
                <span style="background:#6366f1;color:#fff;border-radius:4px;padding:2px 6px;font-weight:700;flex-shrink:0;font-size:11px">W${m.week}</span>
                <div>
                  <div style="font-weight:700;color:#111">${esc(m.title||'')}</div>
                  ${m.description ? `<div style="color:#6b7280;margin-top:2px">${esc(m.description)}</div>` : ''}
                </div>
              </div>
            `).join('')}
            ${lead.delivery.milestones.milestones.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.milestones.milestones.length - 4} meer weken</div>` : ''}
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
    ` : ''}
  `;

  // Attach hover-show for task delete buttons
  panel.querySelectorAll('.task-del-btn').forEach(btn => {
    const row = btn.closest('[style*="border:1px solid var(--border)"]');
    if (row) {
      row.addEventListener('mouseenter', () => btn.style.opacity = '1');
      row.addEventListener('mouseleave', () => btn.style.opacity = '0');
    }
  });
}

function switchDetailTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.detail-tab-content').forEach(c => {
    c.style.display = c.dataset.tabContent === tabName ? '' : 'none';
  });
  if (tabName === 'portal' && state.currentLeadId) {
    api(`/api/leads/${state.currentLeadId}/portal/read`, { method: 'POST' });
    const tabBtn = document.querySelector('.detail-tab[data-tab="portal"]');
    if (tabBtn) { const b = tabBtn.querySelector('.tab-badge'); if (b) b.remove(); }
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    if (lead?.clientMessages) lead.clientMessages.forEach(m => { m.read = true; });
  }
}

function buildWebsiteTab(lead) {
  const w = lead.website || {};
  const site = lead.generatedSite;
  const check = (val, label) => `
    <div class="website-check">
      <i class="ti ${val ? 'ti-check' : 'ti-x'}" style="color:${val ? 'var(--success)' : 'var(--danger)'}"></i>
      <span style="font-size:13px">${label}</span>
    </div>`;

  const generatorSection = site ? `
    <div class="detail-section site-gen-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="detail-section-title" style="margin:0">Gegenereerde website</div>
          <span class="site-status-badge ${site.status === 'live' ? 'site-status-live' : 'site-status-preview'}">${site.status === 'live' ? 'Live' : 'Preview'}</span>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <a href="${site.siteUrl}" target="_blank" class="btn btn-sm btn-outline"><i class="ti ti-external-link"></i> Bekijk live</a>
          <button class="btn btn-sm btn-ghost" onclick="editSiteHTML('${lead.id}')"><i class="ti ti-code"></i> HTML bewerken</button>
          <button class="btn btn-sm btn-ghost" onclick="sendSiteFeedback('${lead.id}')"><i class="ti ti-message"></i> Feedback</button>
          <button class="btn btn-sm btn-ghost" onclick="downloadSiteHTML('${lead.id}')"><i class="ti ti-download"></i> Download</button>
          ${site.status === 'preview'
            ? `<button class="btn btn-sm" style="background:#10b981;color:#fff;border:none" onclick="setSiteStatus('${lead.id}','live')"><i class="ti ti-rocket"></i> Zet live</button>`
            : `<button class="btn btn-sm btn-ghost" onclick="setSiteStatus('${lead.id}','preview')"><i class="ti ti-eye-off"></i> Terug naar preview</button>`}
          <button class="btn btn-sm" style="background:#111;color:#fff;border:none" onclick="generateSite('${lead.id}')"><i class="ti ti-refresh"></i> Regenereer</button>
        </div>
      </div>

      <div class="site-preview-wrap">
        <iframe src="${site.siteUrl}" class="site-preview-iframe" title="Website preview" loading="lazy" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>

      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-muted)">URL:</span>
        <a href="${site.siteUrl}" target="_blank" style="font-size:12px;color:#6366f1;word-break:break-all">${site.siteUrl}</a>
        <button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="navigator.clipboard.writeText('${site.siteUrl}');toast('URL gekopieerd!')"><i class="ti ti-copy"></i></button>
      </div>

      ${site.feedback?.length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Feedback (${site.feedback.length})</div>
          ${site.feedback.map(f => `
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;color:var(--text-muted);margin-bottom:4px">
              <span style="color:var(--text)">${f.text}</span>
              <span style="margin-left:8px;opacity:.6">${f.by} · ${new Date(f.time).toLocaleDateString('nl-NL')}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  ` : `
    <div class="detail-section">
      <div style="text-align:center;padding:24px 16px">
        <div style="font-size:32px;margin-bottom:10px">🌐</div>
        <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px">Website generator</div>
        <div style="font-size:13px;color:var(--text-muted);margin-bottom:18px">Genereer een professionele website op basis van de bedrijfsinformatie en intake antwoorden.</div>
        <button class="btn" style="background:#111;color:#fff;border:none;padding:10px 20px" onclick="generateSite('${lead.id}')">
          <i class="ti ti-wand"></i> Website genereren
        </button>
        ${!lead.intakeAnswers ? `<div style="font-size:12px;color:var(--text-muted);margin-top:10px">Tip: na intake invullen krijg je betere resultaten.</div>` : ''}
      </div>
    </div>
  `;

  return `
    ${generatorSection}

    ${lead.websiteUrl ? `
      <div class="website-screenshot-wrap">
        <img class="website-screenshot-img"
             src="https://s.wordpress.com/mshots/v1/${encodeURIComponent(lead.websiteUrl)}?w=600"
             alt="Screenshot" loading="lazy"
             onerror="this.closest('.website-screenshot-wrap').querySelector('.screenshot-error').style.display='flex';this.style.display='none'">
        <div class="screenshot-error" style="display:none;align-items:center;justify-content:center;height:100px;color:var(--text-muted);font-size:13px;gap:6px"><i class="ti ti-photo-off"></i> Screenshot niet beschikbaar</div>
        <a href="${lead.websiteUrl}" target="_blank" class="website-screenshot-link">
          <i class="ti ti-external-link"></i> ${lead.websiteUrl.replace(/^https?:\/\//, '').split('/')[0]}
        </a>
      </div>
    ` : ''}

    ${w.reachable !== undefined ? `
      <div class="detail-section">
        <div class="detail-section-title">Analyse huidige website</div>
        <div class="website-checks">
          ${check(w.reachable, w.reachable ? `Bereikbaar — laadtijd ${w.loadTimeMs ? (w.loadTimeMs/1000).toFixed(1)+'s' : '—'}` : 'Niet bereikbaar')}
          ${check(w.hasHttps,              'HTTPS beveiligd')}
          ${check(w.hasMobileOptimization, 'Mobiel geoptimaliseerd')}
          ${check(w.hasCTA,                'Call-to-action aanwezig')}
          ${check(w.hasBookingSystem || w.hasShop, 'Boekings- of bestelsysteem')}
        </div>
      </div>
      ${w.problems?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Verbeterpunten</div>
          <ul class="problem-list">
            ${w.problems.map(p => `<li><i class="ti ti-point-filled" style="color:#ef4444;font-size:8px"></i>${p}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    ` : ''}

    ${(lead.linkedinCompanyUrl || lead.linkedinCompanyFollowers) ? `
      <div class="detail-section">
        <div class="detail-section-title">LinkedIn bedrijfspagina</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${lead.linkedinCompanyUrl ? `
            <a href="${esc(lead.linkedinCompanyUrl)}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#0a66c2;text-decoration:none;padding:6px 12px;border:1px solid #0a66c2;border-radius:6px">
              <i class="ti ti-brand-linkedin"></i> Bekijk pagina
            </a>
          ` : ''}
          ${lead.linkedinCompanyFollowers ? `
            <span style="font-size:13px;color:#6b7280"><strong>${lead.linkedinCompanyFollowers.toLocaleString('nl-NL')}</strong> volgers</span>
          ` : ''}
          <span style="font-size:12px;padding:3px 8px;border-radius:999px;background:${lead.linkedinActive !== false ? '#f0fdf4' : '#fef2f2'};color:${lead.linkedinActive !== false ? '#15803d' : '#dc2626'};font-weight:600">
            ${lead.linkedinActive !== false ? 'Actief' : 'Inactief'}
          </span>
        </div>
      </div>
    ` : ''}
  `;
}

function buildTimeline(lead) {
  if (lead.history?.length) {
    const iconMap = {
      created:     { icon: 'ti-plus',          color: '#6366f1' },
      sent:        { icon: 'ti-mail',           color: '#10b981' },
      approved:    { icon: 'ti-check',          color: '#10b981' },
      disapproved: { icon: 'ti-x',              color: '#ef4444' },
      dead:        { icon: 'ti-ghost',          color: '#9ca3af' },
      status:      { icon: 'ti-refresh',        color: '#6366f1' },
      followup1:   { icon: 'ti-mail-forward',   color: '#f59e0b' },
      followup2:   { icon: 'ti-mail-forward',   color: '#ef4444' }
    };
    return lead.history.slice().sort((a, b) => new Date(b.time) - new Date(a.time)).map(e => {
      const { icon, color } = iconMap[e.event] || { icon: 'ti-point', color: '#6b7280' };
      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${color}"><i class="ti ${icon}"></i></div>
          <div>
            <div style="font-size:13px;font-weight:500">${e.label}</div>
            <div style="font-size:11px;color:#9ca3af">${relativeTime(e.time)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Fallback for older leads without history array
  const events = [];
  if (lead.createdAt)     events.push({ icon: 'ti-plus',    color: '#6366f1', label: 'Lead toegevoegd',   time: lead.createdAt });
  if (lead.sentAt)        events.push({ icon: 'ti-mail',    color: '#10b981', label: 'Email verstuurd',   time: lead.sentAt });
  if (lead.openedAt)      events.push({ icon: 'ti-eye',     color: '#3b82f6', label: `Email geopend${lead.openCount > 1 ? ' (' + lead.openCount + 'x)' : ''}`, time: lead.openedAt });
  if (lead.repliedAt)     events.push({ icon: 'ti-message', color: '#f59e0b', label: 'Reactie ontvangen', time: lead.repliedAt });
  if (lead.disapprovedAt) events.push({ icon: 'ti-x',       color: '#ef4444', label: 'Afgewezen',         time: lead.disapprovedAt });

  if (events.length === 0) return '<p class="text-muted" style="font-size:13px">Nog geen activiteit</p>';

  return events.sort((a, b) => new Date(b.time) - new Date(a.time)).map(e => `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${e.color}"><i class="ti ${e.icon}"></i></div>
      <div>
        <div style="font-size:13px;font-weight:500">${e.label}</div>
        <div style="font-size:11px;color:#9ca3af">${relativeTime(e.time)}</div>
      </div>
    </div>
  `).join('');
}

function closeLeadDetail() {
  const panel = document.getElementById('detailPanel');
  if (panel) panel.classList.remove('open');
  document.querySelectorAll('.leads-row').forEach(r => r.classList.remove('row-active'));
}

async function updateLeadStatus(id, newStatus) {
  const res = await api(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) lead.status = newStatus;
    // Update row pill in table
    const row = document.querySelector(`.leads-row[data-id="${id}"]`);
    if (row) {
      row.dataset.status = newStatus;
      const pill = row.querySelector('.status-pill');
      if (pill) {
        pill.className = `status-pill status-${STATUS_COLORS[newStatus] || 'gray'}`;
        pill.textContent = STATUS_LABELS[newStatus] || newStatus;
      }
    }
    toast('Status bijgewerkt', 'success');
  }
}

async function saveNotes(id) {
  const notes = document.getElementById('leadNotes')?.value || '';
  const res = await api(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes })
  });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) lead.notes = notes;
    toast('Notities opgeslagen', 'success');
  }
}

// ─── Client portal tab ───────────────────────────────────────────────────────

function buildPortalTab(lead) {
  if (!lead.portalToken) {
    return `
      <div class="detail-section" style="text-align:center;padding:24px 0">
        <i class="ti ti-world-share" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
        <p class="text-secondary" style="font-size:13px;margin-bottom:18px;max-width:280px;margin-left:auto;margin-right:auto">Genereer een unieke klantlink om je klant een live statuspagina te sturen. Ze zien de voortgang en kunnen vragen stellen.</p>
        <button class="btn btn-primary btn-sm" onclick="generatePortalLink('${lead.id}')">
          <i class="ti ti-link"></i> Genereer klantlink
        </button>
      </div>
    `;
  }

  const PHASE_NAMES = ['Intake', 'Strategie', 'Uitvoering', 'Live gaan', 'Optimalisatie'];
  const currentPhase = lead.currentPhase || 1;
  const messages     = lead.clientMessages || [];
  const unread       = messages.filter(m => !m.read).length;
  const portalUrl    = window.location.origin + '/portal/' + lead.portalToken;

  return `
    <div class="detail-section">
      <div class="detail-section-title">Klantlink</div>
      <div class="portal-link-box">
        <span class="portal-url-text">/portal/${lead.portalToken}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="copyText('${portalUrl}')" title="Kopiëren"><i class="ti ti-copy"></i></button>
        <a href="${portalUrl}" target="_blank" class="btn btn-ghost btn-sm btn-icon" title="Openen in nieuw tabblad"><i class="ti ti-external-link"></i></a>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Huidige fase</div>
      <div class="portal-phase-list">
        ${PHASE_NAMES.map((name, i) => {
          const num = i + 1;
          const isDone    = num < currentPhase;
          const isCurrent = num === currentPhase;
          return `<button class="portal-phase-btn${isCurrent ? ' active' : isDone ? ' done' : ''}" onclick="setLeadPhase('${lead.id}', ${num})">
            <span class="portal-phase-num">${isDone ? '✓' : num}</span>${name}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Verwachte afronddatum</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="date" id="estimatedCompletion" value="${lead.estimatedCompletion || ''}"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;color:var(--text-primary);outline:none">
        <button class="btn btn-ghost btn-sm" onclick="savePortalSettings('${lead.id}')">
          <i class="ti ti-device-floppy"></i> Opslaan
        </button>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        Berichten van klant
        ${unread > 0 ? `<span class="badge badge-amber" style="margin-left:6px;font-size:10px">${unread} nieuw</span>` : ''}
      </div>
      ${messages.length === 0
        ? '<p class="text-secondary" style="font-size:13px">Nog geen berichten ontvangen.</p>'
        : messages.slice().reverse().map(m => `
          <div class="client-msg-card${m.read ? '' : ' unread'}">
            <div class="client-msg-header">
              <strong style="font-size:13px">${esc(m.name)}</strong>
              <span class="text-muted" style="font-size:11px">${relativeTime(m.time)}</span>
            </div>
            <div class="client-msg-body">${esc(m.message)}</div>
          </div>
        `).join('')
      }
    </div>
  `;
}

function generateWebhookToken() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  const input = document.getElementById('webhookToken');
  if (input) { input.value = token; updateWebhookUrl(); }
}

function updateWebhookUrl() {
  const token = document.getElementById('webhookToken')?.value || '';
  const display = document.getElementById('webhookUrlDisplay');
  if (display) {
    display.textContent = token
      ? window.location.origin + '/api/gmail/webhook?token=' + token
      : 'Sla eerst een token op';
  }
}

async function saveWebhookSettings() {
  const token = document.getElementById('webhookToken')?.value || '';
  const enabled = document.getElementById('webhookEnabled')?.checked ?? false;
  if (enabled && !token) { toast('Genereer eerst een token', 'error'); return; }
  const res = await api('/api/settings/gmail', {
    method: 'PATCH',
    body: JSON.stringify({ webhookToken: token, webhookConfigured: enabled })
  });
  if (res.ok) {
    updateWebhookUrl();
    toast('Webhook instellingen opgeslagen', 'success');
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

function copyWebhookUrl() {
  const url = document.getElementById('webhookUrlDisplay')?.textContent || '';
  if (!url || url === 'Sla eerst een token op') { toast('Geen URL beschikbaar', 'error'); return; }
  copyText(url, 'Webhook URL gekopieerd');
}

function toggleWebhookInstructions() {
  const panel = document.getElementById('webhookInstructions');
  const chevron = document.getElementById('webhookInstrChevron');
  if (!panel) return;
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
}


async function triggerBackup() {
  const btn = document.getElementById('backupNowBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Bezig...'; }
  try {
    const res = await api('/api/backup/run', { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) {
      const data = await res.json();
      toast('Backup aangemaakt: ' + (data.filename || ''), 'success');
      await loadBackupList();
    } else {
      toast('Backup mislukt', 'error');
    }
  } catch (err) {
    toast('Backup mislukt: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-database-export"></i> Backup nu uitvoeren'; }
  }
}

async function loadBackupList() {
  const container = document.getElementById('backupList');
  if (!container) return;
  try {
    const res = await api('/api/backup/list');
    if (!res.ok) return;
    const data = await res.json();
    const backups = data.backups || [];
    if (!backups.length) { container.innerHTML = ''; return; }
    const rows = backups.map(b => {
      const kb = Math.round(b.size / 1024);
      const date = new Date(b.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
      return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f3f4f6;font-size:13px">' +
        '<i class="ti ti-file-description" style="color:#6b7280;font-size:14px"></i>' +
        '<span style="flex:1;color:#374151">' + b.filename + '</span>' +
        '<span style="color:#9ca3af">' + kb + ' KB</span>' +
        '<span style="color:#9ca3af">' + date + '</span>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div style="margin-top:4px"><div style="font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Recente backups</div>' + rows + '</div>';
  } catch { /* ignore */ }
}


async function generatePortalLink(leadId) {
  const res = await api(`/api/leads/${leadId}/portal/generate`, { method: 'POST' });
  if (!res || !res.ok) return toast('Genereren mislukt', 'error');
  const data = await res.json();
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return toast('Lead niet gevonden', 'error');
  lead.portalToken = data.token;
  lead.currentPhase = lead.currentPhase || 1;
  const el = document.querySelector('[data-tab-content="portal"]');
  if (el) el.innerHTML = buildPortalTab(lead);
  toast('Klantlink aangemaakt!', 'success');
}

async function setLeadPhase(leadId, phase) {
  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ currentPhase: phase }) });
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) lead.currentPhase = phase;
  document.querySelectorAll('.portal-phase-btn').forEach((btn, i) => {
    const num = i + 1;
    btn.className = `portal-phase-btn${num === phase ? ' active' : num < phase ? ' done' : ''}`;
    btn.querySelector('.portal-phase-num').textContent = num < phase ? '✓' : String(num);
  });
  toast(`Fase ${phase} — ${['Intake','Strategie','Uitvoering','Live gaan','Optimalisatie'][phase-1]} ingesteld`, 'success');
}

async function savePortalSettings(leadId) {
  const completion = document.getElementById('estimatedCompletion')?.value || null;
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ estimatedCompletion: completion }) });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.estimatedCompletion = completion;
    toast('Datum opgeslagen', 'success');
  }
}

function removeService(idx) {
  const row = document.querySelector(`.service-row[data-idx="${idx}"]`);
  if (row) row.remove();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Upsell email ────────────────────────────────────────────────────────────

async function generateUpsellEmail(leadId) {
  openModal(`
    <div class="modal-header">
      <h3>Upsell email genereren</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px;text-align:center">
      <div class="spinner-lg" style="margin:0 auto 12px"></div>
      <p style="color:#6b7280;font-size:13px">Email genereren met AI...</p>
    </div>
  `);

  const res = await api('/api/upsell/' + leadId + '/email', { method: 'POST' });
  if (!res.ok) {
    openModal('<div class="modal-header"><h3>Fout</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div><div style="padding:20px"><p>Kon email niet genereren.</p><button class="btn btn-primary" onclick="closeModal()">Sluiten</button></div>');
    return;
  }
  const { email, opp } = await res.json();
  if (!email) return;

  openModal(`
    <div class="modal-header">
      <h3>Upsell email — ${opp?.companyName || ''}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px">
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:#374151;display:block;margin-bottom:4px">Onderwerp</label>
        <input id="upsellSubject" class="form-input" style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px" value="${(email.subject||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="email-preview" style="margin-bottom:16px">
        <div class="email-body">${(email.body||'').replace(/\n/g,'<br>')}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="copyText(\`${(email.subject+'\n\n'+email.body).replace(/`/g,'\\`')}\`,'Email gekopieerd!')">
          <i class="ti ti-copy"></i> Kopiëren
        </button>
        <button class="btn btn-primary" onclick="sendUpsellEmail('${leadId}')">
          <i class="ti ti-send"></i> Verstuur naar mezelf
        </button>
        <button class="btn btn-ghost" onclick="closeModal()">Sluiten</button>
      </div>
    </div>
  `);

  window._upsellEmail = email;
}

async function sendUpsellEmail(leadId) {
  const subject = document.getElementById('upsellSubject')?.value || window._upsellEmail?.subject || '';
  const body    = window._upsellEmail?.body || '';
  const btn     = document.querySelector('.modal-footer button, .modal-header + div button[onclick*="sendUpsell"]') || null;

  const res = await api('/api/upsell/' + leadId + '/send', {
    method: 'POST',
    body: JSON.stringify({ subject, body })
  });
  if (res.ok) {
    toast('Upsell email verstuurd naar jouw inbox!', 'success');
    closeModal();
  } else {
    toast('Versturen mislukt', 'error');
  }
}

// ─── Project Engine ───────────────────────────────────────────────────────────

function startProject(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const steps = [
    { label: 'Portaaltoegang instellen' },
    { label: 'Intake link genereren' },
    { label: 'Welkomstmail versturen' },
    { label: 'Projectplan genereren (AI)' },
    { label: 'Content kalender genereren (AI)' },
    { label: 'Week 1 takenlijst aanmaken (AI)' },
    { label: 'Team briefing versturen' },
    { label: 'Status bijwerken naar klant' },
  ];

  const stepsHTML = steps.map((s, i) => `
    <div class="project-step" id="pstep-${i+1}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="pstep-icon" id="pstep-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">
        ${i+1}
      </div>
      <span id="pstep-label-${i+1}" style="font-size:13px;color:#6b7280">${s.label}</span>
      <span id="pstep-note-${i+1}" style="font-size:11px;color:#9ca3af;margin-left:auto"></span>
    </div>
  `).join('');

  openModal(`
    <div class="modal-header">
      <h3 style="background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
        <i class="ti ti-rocket" style="-webkit-text-fill-color:#6366f1"></i> Project starten — ${esc(lead.companyName)}
      </h3>
      <button class="modal-close" id="projectModalClose" onclick="closeModal()" disabled><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px">
      <div id="project-steps-list">${stepsHTML}</div>
      <div id="project-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:8px"><i class="ti ti-check"></i> Project succesvol gestart!</div>
        <div id="project-result-links" style="display:flex;flex-direction:column;gap:6px;font-size:12px"></div>
      </div>
      <div id="project-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="projectDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Sluiten</button>
    </div>
  `);

  const handleEvent = (d) => {
    const { step, label, status, note, intakeUrl, portalUrl } = d;

    if (step > 0) {
      const icon   = document.getElementById(`pstep-icon-${step}`);
      const lbl    = document.getElementById(`pstep-label-${step}`);
      const noteEl = document.getElementById(`pstep-note-${step}`);
      if (icon) {
        if (status === 'running') {
          icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>';
          icon.style.borderColor = '#6366f1';
        } else if (status === 'done') {
          icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>';
          icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4';
        } else if (status === 'skipped') {
          icon.innerHTML = '<i class="ti ti-minus" style="font-size:12px;color:#9ca3af"></i>';
        }
      }
      if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
      if (noteEl && note) noteEl.textContent = note;
    }

    if (status === 'complete') {
      const resultDiv = document.getElementById('project-result');
      const linksDiv  = document.getElementById('project-result-links');
      const doneBtn   = document.getElementById('projectDoneBtn');
      const closeBtn  = document.getElementById('projectModalClose');
      if (resultDiv) resultDiv.style.display = '';
      if (doneBtn) doneBtn.style.display = '';
      if (closeBtn) closeBtn.disabled = false;
      if (linksDiv) linksDiv.innerHTML = [
        intakeUrl ? `<div><strong>Intake link:</strong> <a href="${intakeUrl}" target="_blank" class="link">${intakeUrl}</a></div>` : '',
        portalUrl ? `<div><strong>Klantportaal:</strong> <a href="${portalUrl}" target="_blank" class="link">${portalUrl}</a></div>` : '',
      ].join('');
      const localLead = state.leads.find(l => l.id === leadId);
      if (localLead) { localLead.status = 'client'; localLead.projectStartedAt = new Date().toISOString(); }
    }

    if (status === 'error') {
      const errDiv   = document.getElementById('project-error');
      const closeBtn = document.getElementById('projectModalClose');
      const doneBtn  = document.getElementById('projectDoneBtn');
      if (errDiv) { errDiv.style.display = ''; errDiv.textContent = label; }
      if (closeBtn) closeBtn.disabled = false;
      if (doneBtn) doneBtn.style.display = '';
    }
  };

  fetch(`/api/leads/${leadId}/start-project`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        const closeBtn = document.getElementById('projectModalClose');
        const doneBtn  = document.getElementById('projectDoneBtn');
        if (closeBtn) closeBtn.disabled = false;
        if (doneBtn) doneBtn.style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try { handleEvent(JSON.parse(line.slice(6))); } catch {}
        }
      });
      pump();
    }).catch(() => {
      const closeBtn = document.getElementById('projectModalClose');
      const doneBtn  = document.getElementById('projectDoneBtn');
      if (closeBtn) closeBtn.disabled = false;
      if (doneBtn) doneBtn.style.display = '';
    });
    pump();
  }).catch(() => {
    const closeBtn = document.getElementById('projectModalClose');
    const doneBtn  = document.getElementById('projectDoneBtn');
    if (closeBtn) closeBtn.disabled = false;
    if (doneBtn) doneBtn.style.display = '';
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────

function createPayment(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const s = state.settings || {};
  const defaultAmount = (lead.services || []).filter(sv => sv.billing !== 'eenmalig').reduce((sum, sv) => sum + (sv.price||0), 0) || lead.estimatedValue || 800;
  const defaultDesc = (lead.services || []).map(sv => sv.name).join(', ') || 'AI-diensten';

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-coin"></i> Nieuwe factuur — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Type</label>
        <div style="display:flex;gap:6px">
          ${[{v:'subscription',l:'Abonnement',i:'ti-refresh'},{v:'once',l:'Eenmalig',i:'ti-coin'},{v:'split',l:'Gesplitst',i:'ti-scissors'}].map(t=>`
            <label id="paytype_${t.v}" style="display:flex;align-items:center;gap:5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center">
              <input type="radio" name="payType" value="${t.v}" ${t.v==='subscription'?'checked':''} style="display:none" onchange="updatePayTypeUI()">
              <i class="ti ${t.i}"></i> ${t.l}
            </label>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Bedrag (€)</label>
          <input type="number" id="payAmount" value="${defaultAmount}" min="1">
        </div>
        <div class="form-group" id="splitPartsGroup" style="display:none">
          <label>Aantal delen</label>
          <select id="splitParts">
            <option value="2">2 delen</option>
            <option value="3">3 delen</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Omschrijving</label>
        <input type="text" id="payDesc" value="${esc(defaultDesc)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Betaalmethode</label>
          <select id="payMethod">
            ${s.stripeConfigured ? '<option value="stripe">Stripe</option>' : ''}
            ${s.mollieConfigured ? '<option value="mollie">Mollie</option>' : ''}
            ${s.paypalConfigured ? '<option value="paypal">PayPal</option>' : ''}
          </select>
        </div>
        <div class="form-group">
          <label>Vervaldatum</label>
          <input type="date" id="payDue" value="${new Date(Date.now()+7*86400000).toISOString().split('T')[0]}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" id="savePayBtn" onclick="savePayment('${leadId}')">
        <i class="ti ti-send"></i> Factuur aanmaken
      </button>
    </div>
  `);
  updatePayTypeUI();
}

function updatePayTypeUI() {
  document.querySelectorAll('input[name="payType"]').forEach(el => {
    const lbl = document.getElementById('paytype_' + el.value);
    if (lbl) { lbl.style.borderColor = el.checked ? 'var(--accent)' : 'var(--border)'; lbl.style.background = el.checked ? '#eef2ff' : ''; lbl.style.color = el.checked ? 'var(--accent)' : ''; }
  });
  const isSplit = document.querySelector('input[name="payType"]:checked')?.value === 'split';
  const grp = document.getElementById('splitPartsGroup');
  if (grp) grp.style.display = isSplit ? '' : 'none';
}

async function savePayment(leadId) {
  const amount  = parseInt(document.getElementById('payAmount')?.value || 0);
  const desc    = document.getElementById('payDesc')?.value?.trim();
  const method  = document.getElementById('payMethod')?.value || 'stripe';
  const dueDate = document.getElementById('payDue')?.value;
  const type    = document.querySelector('input[name="payType"]:checked')?.value || 'subscription';
  const splitParts = parseInt(document.getElementById('splitParts')?.value || 2);
  const billing = type === 'subscription' ? 'maandelijks' : 'eenmalig';
  if (!amount || amount < 1) return toast('Voer een geldig bedrag in', 'error');
  const btn = document.getElementById('savePayBtn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';
  const res  = await api(`/api/leads/${leadId}/payments`, { method: 'POST', body: JSON.stringify({ type, amount, description: desc, billing, method, dueDate, splitParts }) });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Aanmaken mislukt', 'error'); btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Factuur aanmaken'; return; }
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { if (!lead.payments) lead.payments = []; lead.payments.push(...(Array.isArray(data) ? data : [data])); }
  closeModal();
  toast(`Factuur aangemaakt${Array.isArray(data) && data.length > 1 ? ` (${data.length} delen)` : ''}`, 'success');
  renderLeadDetail(leadId);
}

async function markPaymentPaid(leadId, payId) {
  const res = await api(`/api/leads/${leadId}/payments/${payId}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
  if (!res.ok) return toast('Bijwerken mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  const pay  = lead?.payments?.find(p => p.id === payId);
  if (pay) { pay.status = 'paid'; pay.paidAt = new Date().toISOString(); }
  toast('Betaling gemarkeerd als betaald', 'success');
  renderLeadDetail(leadId);
}

async function remindPayment(leadId, payId) {
  const btn = event?.target?.closest('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>'; }
  const res  = await api(`/api/leads/${leadId}/payments/${payId}/remind`, { method: 'POST' });
  const data = await res.json();
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-bell"></i> Herinner'; }
  if (!res.ok) return toast(data.error || 'Versturen mislukt', 'error');
  toast('Herinnering verstuurd', 'success');
}

async function deletePayment(leadId, payId) {
  if (!confirm('Betaling verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/payments/${payId}`, { method: 'DELETE' });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead?.payments) lead.payments = lead.payments.filter(p => p.id !== payId);
  toast('Betaling verwijderd', 'success');
  renderLeadDetail(leadId);
}

// ─── Client email sender ──────────────────────────────────────────────────────

const CLIENT_EMAIL_LABELS = {
  welcome:        'Welkomstmail',
  intakeReceived: 'Intake ontvangen',
  deliveryReady:  'Leveringen klaar',
  weekComplete:   'Week afgerond',
  monthlyUpdate:  'Maandupdate',
  checkIn:        'Check-in',
};

async function sendClientEmail(leadId, trigger) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const label = CLIENT_EMAIL_LABELS[trigger] || trigger;

  // First preview the email
  const previewBtn = document.querySelector(`button[onclick="sendClientEmail('${leadId}','${trigger}')"]`);
  if (previewBtn) { previewBtn.disabled = true; previewBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i>'; }

  const prevRes = await api(`/api/leads/${leadId}/client-email`, { method: 'POST', body: JSON.stringify({ trigger, preview: true }) });
  const prev = await prevRes.json();

  if (previewBtn) { previewBtn.disabled = false; previewBtn.innerHTML = `<i class="ti ti-mail"></i> ${label.split(' ')[0]}`; }

  if (!prevRes.ok) return toast(prev.error || 'Preview mislukt', 'error');

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-mail"></i> ${esc(label)} — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">ONDERWERP</div>
        <div style="font-size:14px;font-weight:600">${esc(prev.subject || '')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:6px">INHOUD</div>
        <div style="background:#f9fafb;border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.7;white-space:pre-line;max-height:300px;overflow-y:auto">${esc(prev.body || '')}</div>
      </div>
      ${!lead.email ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;font-size:13px;color:#dc2626"><i class="ti ti-alert-triangle"></i> Geen email adres bekend voor dit bedrijf.</div>` : `<div style="font-size:12px;color:#6b7280"><i class="ti ti-send"></i> Wordt verstuurd naar: <strong>${esc(lead.email || lead.contactEmail || '—')}</strong></div>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      ${lead.email || lead.contactEmail ? `<button class="btn btn-primary" id="confirmSendEmailBtn" onclick="confirmSendClientEmail('${leadId}','${trigger}')">
        <i class="ti ti-send"></i> Verstuur
      </button>` : ''}
    </div>
  `);
}

async function confirmSendClientEmail(leadId, trigger) {
  const btn = document.getElementById('confirmSendEmailBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res = await api(`/api/leads/${leadId}/client-email`, { method: 'POST', body: JSON.stringify({ trigger }) });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Versturen mislukt', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Verstuur'; } return; }
  closeModal();
  toast(`E-mail verstuurd: ${data.subject}`, 'success');
  // Refresh lead detail to show in log
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    if (!lead.clientEmailLog) lead.clientEmailLog = [];
    lead.clientEmailLog.push({ trigger, subject: data.subject, sentAt: new Date().toISOString(), sentBy: 'handmatig' });
  }
}

function generateDelivery(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const steps = [
    { label: 'Content kalender genereren (maand 1, 20 posts)' },
    { label: 'Chatbot FAQ flow genereren (12 Q&A)' },
    { label: 'Projectmijlpalen uitwerken (12 weken)' },
    { label: 'Opslaan & klant notificeren' },
  ];

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-sparkles" style="color:#6366f1"></i> AI Leveringen — ${esc(lead.companyName)}</h3>
      <button class="modal-close" id="delivModalClose" onclick="closeModal()" disabled><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px">
      ${steps.map((s, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div id="dstep-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">${i+1}</div>
          <span id="dstep-label-${i+1}" style="font-size:13px;color:#6b7280">${s.label}</span>
        </div>
      `).join('')}
      <div id="deliv-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;font-size:14px;font-weight:700;color:#15803d">
        <i class="ti ti-check"></i> Leveringen succesvol gegenereerd!
      </div>
      <div id="deliv-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="delivDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Sluiten</button>
    </div>
  `);

  fetch(`/api/leads/${leadId}/generate-delivery`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        document.getElementById('delivModalClose').disabled = false;
        document.getElementById('delivDoneBtn').style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          const { step, label, status } = d;
          if (step > 0) {
            const icon = document.getElementById(`dstep-icon-${step}`);
            const lbl  = document.getElementById(`dstep-label-${step}`);
            if (icon) {
              if (status === 'running') { icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>'; icon.style.borderColor = '#6366f1'; }
              else if (status === 'done') { icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>'; icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4'; }
            }
            if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
          }
          if (status === 'complete') {
            document.getElementById('deliv-result').style.display = '';
            document.getElementById('delivDoneBtn').style.display = '';
            document.getElementById('delivModalClose').disabled = false;
            const localLead = state.leads.find(l => l.id === leadId);
            if (localLead) localLead.deliveryGenerated = true;
          }
          if (status === 'error') {
            const errDiv = document.getElementById('deliv-error');
            if (errDiv) { errDiv.style.display = ''; errDiv.textContent = label; }
            document.getElementById('delivModalClose').disabled = false;
            document.getElementById('delivDoneBtn').style.display = '';
          }
        } catch {}
      });
      pump();
    }).catch(() => { document.getElementById('delivModalClose').disabled = false; document.getElementById('delivDoneBtn').style.display = ''; });
    pump();
  });
}

// ─── Website Generator ────────────────────────────────────────────────────────

function generateSite(leadId) {
  const steps = [
    { label: 'Website content genereren met AI' },
    { label: 'Volledige HTML website bouwen' },
    { label: 'Website opslaan en URL aanmaken' },
    { label: 'Preview link versturen naar klant' }
  ];

  openModal('Website genereren', `
    <div style="padding:4px 0">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
        Claude genereert een professionele website op basis van de bedrijfsinfo en intake antwoorden. Dit duurt ongeveer 30–60 seconden.
      </p>
      ${steps.map((s, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div id="site-step-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">${i+1}</div>
          <span id="site-step-label-${i+1}" style="font-size:13px;color:#6b7280">${s.label}</span>
        </div>
      `).join('')}
      <div id="site-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:6px"><i class="ti ti-check"></i> Website succesvol gegenereerd!</div>
        <a id="site-result-link" href="#" target="_blank" style="font-size:12px;color:#6366f1;word-break:break-all"></a>
      </div>
      <div id="site-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="siteModalClose" onclick="closeModal()" disabled>Sluiten</button>
      <button class="btn btn-ghost" id="siteDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Bekijk resultaat</button>
    </div>
  `);

  fetch(`/api/leads/${leadId}/generate-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        document.getElementById('siteModalClose').disabled = false;
        document.getElementById('siteDoneBtn').style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          const { step, label, status, siteUrl } = d;
          if (step > 0) {
            const icon = document.getElementById(`site-step-icon-${step}`);
            const lbl  = document.getElementById(`site-step-label-${step}`);
            if (icon) {
              if (status === 'running') { icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>'; icon.style.borderColor = '#6366f1'; }
              else if (status === 'done') { icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>'; icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4'; }
            }
            if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
          }
          if (status === 'complete') {
            document.getElementById('site-result').style.display = '';
            if (siteUrl) { const a = document.getElementById('site-result-link'); a.href = siteUrl; a.textContent = siteUrl; }
            document.getElementById('siteDoneBtn').style.display = '';
          }
          if (status === 'error') {
            document.getElementById('site-error').textContent = label;
            document.getElementById('site-error').style.display = '';
            document.getElementById('siteModalClose').disabled = false;
          }
        } catch { /* ignore */ }
      });
      pump();
    }).catch(() => { document.getElementById('siteModalClose').disabled = false; document.getElementById('siteDoneBtn').style.display = ''; });
    pump();
  });
}

async function editSiteHTML(leadId) {
  const res  = await apiFetch(`/api/leads/${leadId}/site`);
  const data = await res.json();
  if (!data.exists) { toast('Geen website gevonden'); return; }

  openModal('HTML bewerken', `
    <div style="padding:4px 0">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Bewerk de HTML direct. Sla op om de live site bij te werken.</p>
      <textarea id="siteHtmlEditor" style="width:100%;height:420px;font-family:monospace;font-size:12px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);resize:vertical;white-space:pre">${data.html.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn" style="background:#111;color:#fff;border:none" onclick="saveSiteHTML('${leadId}')"><i class="ti ti-device-floppy"></i> Opslaan</button>
    </div>
  `);
}

async function saveSiteHTML(leadId) {
  const el = document.getElementById('siteHtmlEditor');
  if (!el) return;
  const html = el.value.replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const res = await apiFetch(`/api/leads/${leadId}/site`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
  if (res.ok) { toast('Website opgeslagen!'); closeModal(); renderLeadDetail(leadId); }
  else { toast('Opslaan mislukt'); }
}

async function setSiteStatus(leadId, status) {
  const res = await apiFetch(`/api/leads/${leadId}/site/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  if (res.ok) { toast(status === 'live' ? 'Website is live gezet!' : 'Terug naar preview'); renderLeadDetail(leadId); }
  else { toast('Status wijzigen mislukt'); }
}

function sendSiteFeedback(leadId) {
  openModal('Feedback toevoegen', `
    <div style="padding:4px 0">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Beschrijf wat er aangepast moet worden aan de website.</p>
      <textarea id="siteFeedbackText" placeholder="Bijv: Verander de kleur van de knop naar groen, voeg een telefoon sectie toe..." style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg);color:var(--text);resize:vertical"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn" style="background:#111;color:#fff;border:none" onclick="submitSiteFeedback('${leadId}')"><i class="ti ti-send"></i> Feedback opslaan</button>
    </div>
  `);
}

async function submitSiteFeedback(leadId) {
  const feedback = document.getElementById('siteFeedbackText')?.value?.trim();
  if (!feedback) { toast('Voer feedback in'); return; }
  const res = await apiFetch(`/api/leads/${leadId}/site/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback }) });
  if (res.ok) { toast('Feedback opgeslagen!'); closeModal(); renderLeadDetail(leadId); }
  else { toast('Feedback opslaan mislukt'); }
}

async function downloadSiteHTML(leadId) {
  const res  = await apiFetch(`/api/leads/${leadId}/site`);
  const data = await res.json();
  if (!data.exists || !data.html) { toast('Geen website HTML beschikbaar'); return; }
  const blob = new Blob([data.html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `website-${leadId}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('HTML gedownload!');
}

// ─── Tasks system ─────────────────────────────────────────────────────────────

const TASK_STATUS = { todo: { label: 'Te doen', color: '#6b7280', bg: '#f3f4f6' }, bezig: { label: 'Bezig', color: '#d97706', bg: '#fefce8' }, klaar: { label: 'Klaar', color: '#16a34a', bg: '#f0fdf4' } };
const TASK_PRI    = { hoog: { color: '#dc2626', bg: '#fef2f2' }, middel: { color: '#d97706', bg: '#fefce8' }, laag: { color: '#16a34a', bg: '#f0fdf4' } };

function buildTasksHTML(lead, users, activeWeek = 1) {
  const tasks = (lead.tasks || []).filter(t => t.id); // only new-format tasks
  const weeks = [...new Set(tasks.map(t => t.week || 1))].sort((a,b) => a-b);
  if (!weeks.includes(activeWeek)) activeWeek = weeks[0] || 1;
  const weekTasks = tasks.filter(t => (t.week || 1) === activeWeek);
  const userMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
  const maxWeek = Math.max(...weeks, 12);
  const allWeeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  const done   = weekTasks.filter(t => t.status === 'klaar').length;
  const total  = weekTasks.length;
  const pct    = total ? Math.round((done / total) * 100) : 0;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="detail-section-title" style="margin:0">Taken</div>
      <button class="btn btn-primary btn-sm" onclick="addLeadTask('${lead.id}')">
        <i class="ti ti-plus"></i> Taak
      </button>
    </div>

    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
      ${allWeeks.map(w => {
        const wTasks = tasks.filter(t => (t.week||1) === w);
        const wDone  = wTasks.filter(t => t.status === 'klaar').length;
        return `<button onclick="filterTasksWeek('${lead.id}',${w})" style="padding:3px 10px;border-radius:20px;border:1.5px solid ${w === activeWeek ? '#6366f1' : 'var(--border)'};background:${w === activeWeek ? '#eef2ff' : '#fff'};color:${w === activeWeek ? '#6366f1' : '#6b7280'};font-size:11px;font-weight:700;cursor:pointer">
          W${w}${wTasks.length ? `<span style="margin-left:3px;opacity:.7">${wDone}/${wTasks.length}</span>` : ''}
        </button>`;
      }).join('')}
    </div>

    ${total ? `
    <div style="background:#f3f4f6;border-radius:99px;height:4px;margin-bottom:10px">
      <div style="height:100%;border-radius:99px;background:linear-gradient(to right,#10b981,#6366f1);width:${pct}%;transition:width .4s"></div>
    </div>` : ''}

    <div style="display:flex;flex-direction:column;gap:6px" id="task-list-${lead.id}">
      ${weekTasks.length ? weekTasks.map(t => buildTaskCard(t, lead.id, userMap)).join('') : `
        <div style="text-align:center;padding:20px;font-size:13px;color:#9ca3af">
          <i class="ti ti-clipboard" style="font-size:20px;display:block;margin-bottom:6px"></i>
          Geen taken voor week ${activeWeek}
        </div>`}
    </div>`;
}

function buildTaskCard(t, leadId, userMap) {
  const st  = TASK_STATUS[t.status] || TASK_STATUS.todo;
  const pri = TASK_PRI[t.priority]  || TASK_PRI.middel;
  return `
    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;display:flex;gap:8px;align-items:flex-start;${t.status==='klaar'?'opacity:.6':''}">
      <button onclick="cycleTaskStatus('${leadId}','${t.id}')" title="Status wijzigen"
        style="width:20px;height:20px;border-radius:50%;border:2px solid ${st.color};background:${t.status==='klaar'?st.color:'#fff'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px">
        ${t.status==='klaar' ? '<i class="ti ti-check" style="font-size:10px;color:#fff"></i>' : t.status==='bezig' ? '<i class="ti ti-player-play" style="font-size:9px;color:'+st.color+'"></i>' : ''}
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;${t.status==='klaar'?'text-decoration:line-through':''}">${esc(t.title||'')}</div>
        ${t.description ? `<div style="font-size:12px;color:#6b7280;margin-top:2px;line-height:1.4">${esc(t.description)}</div>` : ''}
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
          <span style="font-size:10px;font-weight:700;background:${st.bg};color:${st.color};border-radius:4px;padding:1px 5px">${st.label}</span>
          <span style="font-size:10px;font-weight:700;background:${pri.bg};color:${pri.color};border-radius:4px;padding:1px 5px">${t.priority||'middel'}</span>
          ${t.assigneeId && userMap[t.assigneeId] ? `<span style="font-size:10px;background:#f3f4f6;border-radius:4px;padding:1px 5px"><i class="ti ti-user" style="font-size:9px"></i> ${esc(userMap[t.assigneeId])}</span>` : ''}
        </div>
      </div>
      <button onclick="deleteTask('${leadId}','${t.id}')" style="background:none;border:none;cursor:pointer;color:#d1d5db;padding:2px;font-size:14px;opacity:0;transition:opacity .15s" class="task-del-btn">
        <i class="ti ti-trash"></i>
      </button>
    </div>`;
}

function filterTasksWeek(leadId, week) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  // Re-attach hover events
  container?.querySelectorAll('.task-del-btn')?.forEach(btn => {
    btn.closest('div[style*="border:1px solid"]')?.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.closest('div[style*="border:1px solid"]')?.addEventListener('mouseleave', () => btn.style.opacity = '0');
  });
}

async function cycleTaskStatus(leadId, taskId) {
  const lead = state.leads.find(l => l.id === leadId);
  const task = lead?.tasks?.find(t => t.id === taskId);
  if (!task) return;
  const cycle = { todo: 'bezig', bezig: 'klaar', klaar: 'todo' };
  const newStatus = cycle[task.status || 'todo'];
  task.status = newStatus;
  await api(`/api/leads/${leadId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
  // Rebuild current week view
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) {
    const activeBtn = container.querySelector('button[style*="#6366f1"]');
    const week = activeBtn ? parseInt(activeBtn.textContent) : 1;
    container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  }
}

function addLeadTask(leadId) {
  const users = state.users || [];
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-clipboard-plus"></i> Nieuwe taak</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Titel <span style="color:#ef4444">*</span></label>
        <input type="text" id="newTaskTitle" placeholder="Taak omschrijving" autofocus>
      </div>
      <div class="form-group">
        <label>Beschrijving</label>
        <textarea id="newTaskDesc" rows="2" placeholder="Optionele details..."></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Week</label>
          <select id="newTaskWeek">
            ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>Week ${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prioriteit</label>
          <select id="newTaskPri">
            <option value="hoog">Hoog</option>
            <option value="middel" selected>Middel</option>
            <option value="laag">Laag</option>
          </select>
        </div>
      </div>
      ${users.length > 1 ? `
      <div class="form-group">
        <label>Toegewezen aan</label>
        <select id="newTaskAssignee">
          <option value="">— Niemand —</option>
          ${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveLeadTask('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
    </div>
  `);
}

async function saveLeadTask(leadId) {
  const title      = document.getElementById('newTaskTitle')?.value?.trim();
  const desc       = document.getElementById('newTaskDesc')?.value?.trim();
  const week       = parseInt(document.getElementById('newTaskWeek')?.value || 1);
  const priority   = document.getElementById('newTaskPri')?.value || 'middel';
  const assigneeId = document.getElementById('newTaskAssignee')?.value || null;
  if (!title) return toast('Voer een taaktitel in', 'error');
  const res  = await api(`/api/leads/${leadId}/tasks`, { method: 'POST', body: JSON.stringify({ title, description: desc, week, priority, assigneeId }) });
  const task = await res.json();
  if (!res.ok) return toast(task.error || 'Taak opslaan mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { if (!lead.tasks) lead.tasks = []; lead.tasks.push(task); }
  closeModal();
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  toast('Taak toegevoegd', 'success');
}

async function deleteTask(leadId, taskId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const task = lead.tasks?.find(t => t.id === taskId);
  if (!confirm(`Taak "${task?.title || ''}" verwijderen?`)) return;
  const res = await api(`/api/leads/${leadId}/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  if (lead.tasks) lead.tasks = lead.tasks.filter(t => t.id !== taskId);
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], 1);
  toast('Taak verwijderd', 'success');
}

async function toggleLeadTask(leadId, taskIndex, done) {
  // Legacy compatibility (old index-based tasks)
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.tasks?.[taskIndex]) return;
  lead.tasks[taskIndex].done = done;
  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ tasks: lead.tasks }) });
}

// ─── Stripe invoice ───────────────────────────────────────────────────────────

async function generateCaseStudy(leadId, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Genereren...';
  try {
    const cs = await apiFetch(`/api/leads/${leadId}/case-study`, { method: 'POST' });
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.caseStudy = cs;
    showToast('Case study gegenereerd!', 'success');
    await loadLeads();
    renderPipeline();
  } catch (e) {
    showToast('Fout: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function toggleCaseStudyPublish(leadId, published) {
  try {
    await apiFetch(`/api/leads/${leadId}/case-study`, { method: 'PATCH', body: JSON.stringify({ published }) });
    const lead = state.leads.find(l => l.id === leadId);
    if (lead && lead.caseStudy) lead.caseStudy.published = published;
    showToast(published ? 'Gepubliceerd op /agency' : 'Verwijderd van website', 'success');
  } catch (e) {
    showToast('Fout: ' + e.message, 'error');
  }
}

function copyCaseStudy(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead || !lead.caseStudy) return;
  const cs = lead.caseStudy;
  const text = [
    cs.title,
    '',
    'Uitdaging',
    cs.challenge,
    '',
    'Oplossing',
    cs.solution || '',
    '',
    'Resultaten',
    ...(cs.results || []).map(r => '- ' + r),
    cs.quote ? `\n"${cs.quote}" — ${cs.quoteName || ''}` : ''
  ].join('\n').trim();
  copyText(text, 'Case study gekopieerd!');
}

function createInvoice(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const s = state.settings || {};
  const preferred = s.preferredPaymentMethod || 'stripe';
  const defaultDesc = lead.services?.map(sv => sv.name).join(', ') || 'AI-marketingdiensten';
  const defaultBilling = lead.services?.[0]?.billing || 'maandelijks';

  const methodOpts = [
    { value: 'stripe',  label: 'Stripe',  icon: 'ti-brand-stripe', enabled: s.stripeConfigured },
    { value: 'mollie',  label: 'Mollie',  icon: 'ti-credit-card',  enabled: s.mollieConfigured },
    { value: 'paypal',  label: 'PayPal',  icon: 'ti-brand-paypal', enabled: s.paypalConfigured },
  ].filter(m => m.enabled || m.value === preferred);

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-credit-card"></i> Betaallink — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Betaalmethode</label>
        <div style="display:flex;gap:8px">
          ${methodOpts.map(m => `
            <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center;transition:all .15s" id="payMethodLabel_${m.value}">
              <input type="radio" name="invoiceMethod" value="${m.value}" ${m.value === preferred ? 'checked' : ''} style="display:none" onchange="updateInvoiceMethodUI()">
              <i class="ti ${m.icon}"></i> ${m.label}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Facturatie type</label>
        <div style="display:flex;gap:8px">
          <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center" id="billingLabelMaandelijks">
            <input type="radio" name="invoiceBilling" value="maandelijks" ${defaultBilling !== 'eenmalig' ? 'checked' : ''} style="display:none" onchange="updateInvoiceBillingUI()">
            <i class="ti ti-refresh"></i> Maandelijks
          </label>
          <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center" id="billingLabelEenmalig">
            <input type="radio" name="invoiceBilling" value="eenmalig" ${defaultBilling === 'eenmalig' ? 'checked' : ''} style="display:none" onchange="updateInvoiceBillingUI()">
            <i class="ti ti-coin"></i> Eenmalig
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Dienst omschrijving</label>
        <input type="text" id="invoiceDesc" value="${esc(defaultDesc)}">
      </div>
      <div class="form-group">
        <label>Bedrag (€)</label>
        <input type="number" id="invoiceAmount" value="${lead.estimatedValue || 800}" min="1">
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" id="createInvoiceBtn" onclick="submitInvoice('${leadId}')">
        <i class="ti ti-link"></i> Maak betaallink
      </button>
    </div>
  `);
  updateInvoiceMethodUI();
  updateInvoiceBillingUI();
}

function updateInvoiceMethodUI() {
  document.querySelectorAll('input[name="invoiceMethod"]').forEach(el => {
    const lbl = document.getElementById('payMethodLabel_' + el.value);
    if (lbl) {
      lbl.style.borderColor = el.checked ? 'var(--accent)' : 'var(--border)';
      lbl.style.background  = el.checked ? '#eef2ff' : '';
      lbl.style.color       = el.checked ? 'var(--accent)' : '';
    }
  });
}

function updateInvoiceBillingUI() {
  const maand = document.querySelector('input[name="invoiceBilling"][value="maandelijks"]');
  const een   = document.querySelector('input[name="invoiceBilling"][value="eenmalig"]');
  const lblM  = document.getElementById('billingLabelMaandelijks');
  const lblE  = document.getElementById('billingLabelEenmalig');
  if (maand && lblM) {
    lblM.style.borderColor = maand.checked ? 'var(--accent)' : 'var(--border)';
    lblM.style.background  = maand.checked ? '#eef2ff' : '';
    lblM.style.color       = maand.checked ? 'var(--accent)' : '';
  }
  if (een && lblE) {
    lblE.style.borderColor = een.checked ? 'var(--accent)' : 'var(--border)';
    lblE.style.background  = een.checked ? '#eef2ff' : '';
    lblE.style.color       = een.checked ? 'var(--accent)' : '';
  }
}

async function submitInvoice(leadId) {
  const lead    = state.leads.find(l => l.id === leadId);
  const desc    = document.getElementById('invoiceDesc')?.value || '';
  const amount  = parseInt(document.getElementById('invoiceAmount')?.value || 0);
  const method  = document.querySelector('input[name="invoiceMethod"]:checked')?.value || 'stripe';
  const billing = document.querySelector('input[name="invoiceBilling"]:checked')?.value || 'maandelijks';
  const btn     = document.getElementById('createInvoiceBtn');

  if (!amount || amount < 1) return toast('Voer een geldig bedrag in', 'error');

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';

  const endpointMap = { stripe: '/api/stripe/invoice', mollie: '/api/mollie/invoice', paypal: '/api/paypal/invoice' };
  const endpoint = endpointMap[method] || '/api/stripe/invoice';

  const res  = await api(endpoint, {
    method: 'POST',
    body: JSON.stringify({ companyName: lead?.companyName, description: desc, amount, billing })
  });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Betaallink fout', 'error');
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-link"></i> Maak betaallink';
    return;
  }

  // Save URL to lead for reference
  await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ stripeUrl: data.url })
  });
  if (lead) lead.stripeUrl = data.url;

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-check" style="color:var(--success)"></i> Betaallink aangemaakt!</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <p class="text-secondary">Stuur deze link naar <strong>${lead?.companyName}</strong>:</p>
      <div class="stripe-link-box">
        <a href="${data.url}" target="_blank" class="link" style="word-break:break-all">${data.url}</a>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyText('${data.url.replace(/'/g, "\\'")}'); toast('Link gekopieerd!', 'success')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}

// ─── Agents tab ───────────────────────────────────────────────────────────────

async function renderAgents() {
  const AGENTS = [
    { num: 1, color: '#2563eb', icon: 'ti-search',          name: 'Lead Finder',        role: 'Genereert bedrijven per dag',           desc: 'Vraagt Claude om realistische bedrijven te genereren die baat hebben bij AI-marketing. Mixt niches (beauty, food, fitness, retail, restaurant) en locaties (NL, BE, DE, UK, VS).', s1l: 'Gevonden', s2l: 'Runs' },
    { num: 2, color: '#7c3aed', icon: 'ti-world',           name: 'Website Checker',    role: 'Analyseert website technisch',           desc: 'Bezoekt de website van elk bedrijf, meet laadtijd, controleert HTTPS, mobile viewport, aanwezigheid van CTA en boekingssysteem. Genereert concrete verbeterpunten.', s1l: 'Gecheckt', s2l: 'Problemen' },
    { num: 3, color: '#16a34a', icon: 'ti-brand-instagram', name: 'Social Analyzer',    role: 'Analyseert social media',               desc: 'Schat engagement rate, postfrequentie en groeipotentieel in. Genereert een gepersonaliseerde email-opener gebaseerd op echte observaties over het account.', s1l: 'Geanalyseerd', s2l: 'Openers' },
    { num: 4, color: '#0891b2', icon: 'ti-chart-bar',       name: 'Opportunity Scorer', role: 'Score 1–10 + aanbevolen diensten',      desc: 'Combineert website- en social data om een kwaliteitsscore te berekenen. Koppelt de beste diensten aan het bedrijf en schat de maandelijkse pipeline waarde.', s1l: 'Gescoord', s2l: 'Gem. score' },
    { num: 5, color: '#dc2626', icon: 'ti-mail',            name: 'Email Writer',       role: 'Schrijft gepersonaliseerde koude email', desc: 'Schrijft een menselijke koude email in de taal van het bedrijf (NL of EN). Max 120 woorden, informele toon, begint met de gepersonaliseerde opener van Agent 3.', s1l: 'Geschreven', s2l: 'Verstuurd' },
    { num: 6, color: '#0284c7', icon: 'ti-brand-linkedin',  name: 'LinkedIn DM Writer', role: 'Schrijft LinkedIn DM (max 280 tekens)',  desc: 'Schrijft een korte, directe LinkedIn DM in de taal van het bedrijf. Max 280 tekens, vriendelijk en specifiek. Klaar om te plakken in LinkedIn.', s1l: "DM's geschreven", s2l: 'Verstuurd' },
    { num: 7, color: '#d97706', icon: 'ti-chart-dots',      name: 'Competitor Analyzer',role: 'Analyseert lokale concurrenten',         desc: 'Genereert 2-3 realistische concurrenten voor het bedrijf in hun stad of regio. Analyseert hun voordelen (ads, website, reviews). Agent 5 gebruikt dit om een concurrentie-hook toe te voegen aan de email.', s1l: 'Geanalyseerd', s2l: 'Concurrenten' }
  ];

  const [stats, runs, memory] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON('/api/runs'),
    apiJSON('/api/memory')
  ]);
  const totalRuns   = (runs  || []).length;
  window._agentLogsRuns = runs || [];
  const totalLeads  = stats?.leadsFound  || 0;
  const totalSent   = stats?.emailsSent  || 0;
  const memEntries  = Object.values(memory || {});

  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Automatisering</div>
        <h1 class="page-title">Agents</h1>
      </div>
      <button class="btn btn-primary" id="agentRunBtn">
        <i class="ti ti-player-play"></i> Run nu starten
      </button>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-refresh"></i></div>
        <div class="stat-value">${totalRuns}</div>
        <div class="stat-label">Totaal runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div class="stat-value">${totalLeads}</div>
        <div class="stat-label">Leads gevonden</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-send"></i></div>
        <div class="stat-value">${totalSent}</div>
        <div class="stat-label">Emails verstuurd</div>
      </div>
    </div>

    <div class="agents-list" id="agentsList">
      ${AGENTS.map((agent, i) => {
        const s1v = agent.num === 1 ? totalLeads : agent.num === 4 ? ((stats?.avgScore)||'—') : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        const s2v = agent.num === 1 ? totalRuns : agent.num === 7 ? totalLeads * 2 : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        return `
        <div class="agent-entry">
          <div class="agent-row" id="agentRow${agent.num}" onclick="toggleAgentRow(${agent.num})">
            <div class="agent-num-circle" style="background:${agent.color}">${agent.num}</div>
            <div class="agent-row-icon" style="background:${agent.color}18;border:1px solid ${agent.color}30;color:${agent.color}">
              <i class="ti ${agent.icon}"></i>
            </div>
            <div class="agent-row-info">
              <div class="agent-row-name">${agent.name}</div>
              <div class="agent-row-role" style="color:${agent.color}">${agent.role}</div>
            </div>
            <div class="agent-row-stats">
              <div class="agent-row-stat">
                <div class="agent-row-stat-lbl">${agent.s1l}</div>
                <div class="agent-row-stat-val">${s1v}</div>
              </div>
              <div class="agent-row-stat">
                <div class="agent-row-stat-lbl">${agent.s2l}</div>
                <div class="agent-row-stat-val">${s2v}</div>
              </div>
            </div>
            <button class="agent-row-chevron" onclick="event.stopPropagation();toggleAgentRow(${agent.num})">
              <i class="ti ti-chevron-down"></i>
            </button>
          </div>
          <div class="agent-expand" id="agentExpand${agent.num}">
            <div class="agent-expand-inner">
              <div class="agent-expand-desc">${agent.desc}</div>
              <div class="agent-expand-actions">
                <button class="btn btn-ghost btn-sm" onclick="showAgentSummary(${agent.num}, '${agent.name}', '${agent.icon}')">
                  <i class="ti ti-eye"></i> Bekijk prompt
                </button>
                <button class="btn btn-ghost btn-sm" onclick="showAgentLogs(${agent.num})">
                  <i class="ti ti-file-text"></i> Logs
                </button>
              </div>
            </div>
          </div>
        </div>
        ${i < AGENTS.length - 1 ? '<div class="agent-dashed-gap"></div>' : ''}
      `}).join('')}
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-brain" style="color:#7c3aed;margin-right:6px"></i> Wat het systeem heeft geleerd</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Agent 4 past scores automatisch aan op basis van historische reply rates per niche + land. Minimaal 5 verstuurde emails nodig voor aanpassing.</p>
      ${memEntries.length === 0 ? `
        <div class="empty-state">
          <i class="ti ti-database-off"></i>
          <p>Nog geen data — wordt gevuld na de eerste verstuurde emails</p>
        </div>
      ` : `
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr>
            <th>Niche</th><th>Land</th><th>Leads verstuurd</th><th>Reply rate</th><th>Score aanpassing</th>
          </tr></thead>
          <tbody>
            ${memEntries.map(m => {
              let adj = '—', adjClass = 'text-secondary';
              if (m.sent >= 5) {
                if (m.replyRate > 20) { adj = '+0.5'; adjClass = 'text-success'; }
                else if (m.replyRate < 5) { adj = '-0.3'; adjClass = 'text-danger'; }
                else { adj = '0'; adjClass = ''; }
              }
              return `<tr>
                <td>${nicheBadge(m.niche)}</td>
                <td>${m.country}</td>
                <td>${m.sent}</td>
                <td>${m.replyRate}%${m.sent < 5 ? ' <span class="text-muted" style="font-size:11px">(te weinig data)</span>' : ''}</td>
                <td class="${adjClass}" style="font-weight:600">${adj}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      `}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-ab" style="color:var(--accent);margin-right:6px"></i> Agent 5 — A/B email statistieken</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Elke lead krijgt 2 email versies: A (probleem-gericht) en B (groeikansen-gericht). Kies per lead welke je verstuurt.</p>
      ${(() => {
        const ab = stats?.abStats || { aApproved: 0, bApproved: 0 };
        const total = (ab.aApproved || 0) + (ab.bApproved || 0);
        const pctA = total > 0 ? Math.round((ab.aApproved / total) * 100) : 0;
        const pctB = total > 0 ? Math.round((ab.bApproved / total) * 100) : 0;
        const winner = total >= 5 ? (ab.aApproved > ab.bApproved ? 'A' : ab.bApproved > ab.aApproved ? 'B' : 'gelijk') : null;
        return `
          <div class="ab-stats-grid">
            <div class="ab-stat-card">
              <div class="ab-stat-value">${ab.aApproved || 0}</div>
              <div class="ab-stat-label">Versie A goedgekeurd</div>
              <div class="ab-stat-sub">Probleem-gericht</div>
            </div>
            <div class="ab-stat-card">
              <div class="ab-stat-value" style="color:#7c3aed">${ab.bApproved || 0}</div>
              <div class="ab-stat-label">Versie B goedgekeurd</div>
              <div class="ab-stat-sub">Groeikansen-gericht</div>
            </div>
          </div>
          ${total >= 5 ? `
            <div class="ab-winner-banner">
              <strong>${winner === 'gelijk' ? 'Gelijkspel' : `Versie ${winner} wint`}</strong> — ${pctA}% kiest A, ${pctB}% kiest B
            </div>
          ` : `<div class="text-muted" style="font-size:12px">Minimaal 5 goedkeuringen nodig voor statistieken</div>`}
        `;
      })()}
    </div>
  `;

  document.getElementById('agentRunBtn').addEventListener('click', triggerFindLeads);
}

function toggleAgentRow(num) {
  const row = document.getElementById(`agentRow${num}`);
  const expand = document.getElementById(`agentExpand${num}`);
  if (!row || !expand) return;
  const isOpen = row.classList.contains('open');
  row.classList.toggle('open', !isOpen);
  expand.classList.toggle('open', !isOpen);
}

function showAgentLogs(num) {
  const runs = (window._agentLogsRuns || []).slice(-10).reverse();
  const rows = runs.length
    ? runs.map(r => `<tr><td style="font-size:11px;color:var(--text-muted)">${new Date(r.startedAt||r.date||'').toLocaleDateString('nl-NL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td>${r.leadsFound||0} leads</td><td>${r.emailsSent||0} emails</td></tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">Nog geen runs</td></tr>`;
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Agent ${num} — Logs</h3>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <table class="table"><thead><tr><th>Datum</th><th>Leads</th><th>Emails</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`);
}

async function showAgentSummary(num, name, icon) {
  openModal(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="agent-icon-wrap" style="width:32px;height:32px">
          <i class="ti ${icon}" style="font-size:15px"></i>
        </div>
        <h3 class="modal-title">Agent ${num} — ${name}</h3>
      </div>
      <button class="btn-icon" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body" id="agentSummaryBody">
      <div style="text-align:center;padding:32px 0">
        <div class="spinner-lg" style="margin:0 auto 12px"></div>
        <p class="text-secondary" style="font-size:13px">Samenvatting genereren...</p>
      </div>
    </div>
  `);

  const PROMPTS = {
    1: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 1 (Lead Finder) precies doet. Beschrijf: welke input het krijgt, hoe het bedrijven kiest, welke velden het teruggeeft (companyName, location, niche, followers, website, companySize) en hoe het bijdraagt aan de totale pipeline. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    2: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 2 (Website Checker) precies doet. Beschrijf: hoe het de website technisch analyseert (laadtijd, HTTPS, mobile, CTA, boekingssysteem), welke problemen het detecteert en hoe die data wordt doorgegeven aan de volgende agents. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    3: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 3 (Social Analyzer) precies doet. Beschrijf: hoe het engagement, postfrequentie en groeipotentieel inschat, hoe het de gepersonaliseerde emailOpener genereert en waarom die opener zo belangrijk is voor de conversie. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    4: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 4 (Opportunity Scorer) precies doet. Beschrijf: hoe het alle data van agents 1-3 combineert tot een score (1-10), hoe het de beste diensten koppelt aan het bedrijf, hoe urgency wordt bepaald en wat de estimatedValue betekent. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    5: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 5 (Email Writer) precies doet. Beschrijf: hoe het de emailOpener van Agent 3 gebruikt als opening, hoe taal (NL/EN) en bedrijfsgrootte (small/medium/large) de aanhef bepalen, welke stijlregels gelden (geen bullets, geen jargon, max 120 woorden) en hoe het uiteindelijke email eruit ziet. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    6: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 6 (LinkedIn DM Writer) precies doet. Beschrijf: hoe het een korte, menselijke LinkedIn DM schrijft (max 280 tekens), welke toon het aanhoudt, hoe het verschilt van de email en hoe de DM klaar staat om direct in LinkedIn te plakken. Schrijf in het Nederlands, zakelijk maar toegankelijk.`
  };

  const result = await claudeCall(PROMPTS[num] || `Beschrijf agent ${num} (${name}) in 4-5 zinnen.`);
  const body = document.getElementById('agentSummaryBody');
  if (!body) return;
  if (!result || result.error) {
    body.innerHTML = `<p class="text-secondary" style="font-size:14px">Kon geen samenvatting laden. Controleer of CLAUDE_API_KEY is ingesteld.</p>`;
    return;
  }
  const text = typeof result === 'string' ? result : result.result || JSON.stringify(result);
  body.innerHTML = `<p style="font-size:14px;line-height:1.75;color:var(--text-primary)">${text.replace(/\n/g,'<br>')}</p>`;
}

// ─── Runs tab ─────────────────────────────────────────────────────────────────

async function renderRuns() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Automatisering</div>
        <h1 class="page-title">Runs</h1>
      </div>
      <button class="btn btn-primary" id="runNowBtn2">
        <i class="ti ti-player-play"></i> Run nu
      </button>
    </div>
    <div id="runsContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  document.getElementById('runNowBtn2').addEventListener('click', triggerFindLeads);

  const [runs, settings] = await Promise.all([
    apiJSON('/api/runs') || [],
    apiJSON('/api/settings') || {}
  ]);
  const safeRuns = runs || [];

  const totalRuns  = safeRuns.length;
  const totalLeads = safeRuns.reduce((s, r) => s + (r.leadsFound   || 0), 0);
  const totalAuto  = safeRuns.reduce((s, r) => s + (r.autoApproved || 0), 0);
  const totalValue = safeRuns.reduce((s, r) => s + (r.totalValue   || 0), 0);

  // Calculate next scheduled run
  const runTime    = (settings || {}).dailyRunTime || '09:00';
  const [rh, rm]   = runTime.split(':').map(Number);
  const now        = new Date();
  const next       = new Date(now);
  next.setHours(rh, rm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const nextLabel  = next.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + runTime;

  document.getElementById('runsContent').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-rotate-clockwise"></i></div>
        <div class="stat-value">${totalRuns}</div>
        <div class="stat-label">Runs totaal</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div class="stat-value">${totalLeads}</div>
        <div class="stat-label">Leads gevonden</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-check"></i></div>
        <div class="stat-value">${totalAuto}</div>
        <div class="stat-label">Auto-goedgekeurd</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-currency-euro"></i></div>
        <div class="stat-value">€${totalValue.toLocaleString('nl-NL')}</div>
        <div class="stat-label">Totale waarde</div>
      </div>
    </div>

    <!-- Persoonlijke run-sjablonen -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-bookmark"></i> Run-sjablonen</h3>
        <button class="btn btn-ghost btn-sm" onclick="showNewTemplateForm()">
          <i class="ti ti-plus"></i> Nieuw
        </button>
      </div>
      <div id="templateFormWrap" class="template-form-wrap" style="display:none">
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label>Naam</label>
            <input type="text" id="tmplName" placeholder="Bijv. Restaurants NL">
          </div>
          <div class="form-group" style="margin:0">
            <label>Niches <span class="text-muted" style="font-size:11px">(komma-gescheiden)</span></label>
            <input type="text" id="tmplNiches" placeholder="restaurant, fitness, beauty">
          </div>
          <div class="form-group" style="margin:0">
            <label>Aantal leads</label>
            <input type="number" id="tmplCount" value="10" min="1" max="30">
          </div>
          <div class="form-group" style="margin:0">
            <label>Locatie <span class="text-muted" style="font-size:11px">(optioneel)</span></label>
            <input type="text" id="tmplLocation" placeholder="Amsterdam, Rotterdam...">
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary btn-sm" onclick="saveTemplate()"><i class="ti ti-device-floppy"></i> Opslaan</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('templateFormWrap').style.display='none'">Annuleren</button>
        </div>
      </div>
      <div id="templateList"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>

    <!-- Section 1: Run Configuratie -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Run configuratie</h3>
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label class="settings-label">Aantal leads</label>
          <input type="number" id="runCount" value="${(settings || {}).leadsPerDay || 15}" min="1" max="50"
            style="width:80px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Niches (komma-gescheiden, leeg = alles)</label>
          <input type="text" id="runNiches" placeholder="beauty, food, fitness"
            style="width:260px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <button class="btn btn-primary" id="startRunBtn" onclick="startCustomRun()">
          <i class="ti ti-player-play"></i> Start run
        </button>
      </div>
    </div>

    <!-- Section 2: Eigen bedrijf toevoegen -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Eigen bedrijf toevoegen</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Voeg een specifiek bedrijf toe om direct te analyseren en aan je inbox toe te voegen.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label class="settings-label">Bedrijfsnaam *</label>
          <input type="text" id="custCompany" placeholder="Bijv. Salon Rosa" oninput="checkDuplicateLive()" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div id="dupWarning" style="display:none;align-items:center;gap:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px"></div>
        <div>
          <label class="settings-label">Website URL</label>
          <input type="text" id="custWebsite" placeholder="https://..." oninput="checkDuplicateLive()" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Instagram handle</label>
          <input type="text" id="custInstagram" placeholder="@handle" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Niche</label>
          <select id="custNiche" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
            <option value="beauty">Beauty</option>
            <option value="food">Food</option>
            <option value="fitness">Fitness</option>
            <option value="retail">Retail</option>
            <option value="restaurant">Restaurant</option>
          </select>
        </div>
        <div>
          <label class="settings-label">Locatie</label>
          <input type="text" id="custLocation" placeholder="Amsterdam, NL" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Land</label>
          <input type="text" id="custCountry" placeholder="NL" value="NL" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
      </div>
      <button class="btn btn-secondary" id="analyzeBtn" style="margin-top:14px" onclick="analyzeCustomCompany()">
        <i class="ti ti-wand"></i> Voeg toe en analyseer
      </button>
      <div id="analyzeProgress" style="display:none;margin-top:14px"></div>
    </div>

    <!-- Section 3: Geplande runs -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Geplande runs</h3>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:14px">
        <i class="ti ti-calendar-event" style="color:var(--text-muted)"></i>
        <span>Volgende automatische run: <strong>${nextLabel}</strong></span>
      </div>
      <p class="text-secondary" style="font-size:12px;margin-top:8px">Aanpassen via Instellingen → Automatisering.</p>
    </div>

    <!-- Section 4: Run geschiedenis -->
    ${safeRuns.length === 0 ? `
      <div class="empty-card">
        <i class="ti ti-history-off"></i>
        <h3>Nog geen runs</h3>
        <p>Start een run om leads te vinden</p>
      </div>
    ` : `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Run geschiedenis</h3>
        </div>
        <div class="table-wrap">
          <table class="leads-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tijd</th>
                <th>Leads</th>
                <th>Auto-goedgekeurd</th>
                <th>Pipeline waarde</th>
              </tr>
            </thead>
            <tbody>
              ${safeRuns.map(r => `
                <tr>
                  <td>${formatDate(r.createdAt)}</td>
                  <td class="text-secondary mono">${new Date(r.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><strong>${r.leadsFound || 0}</strong></td>
                  <td>${r.autoApproved || 0}</td>
                  <td class="text-secondary">€${(r.totalValue || 0).toLocaleString('nl-NL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `}

    <!-- Kosten & activiteiten -->
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title">Activiteiten &amp; API kosten</h3>
        <span id="costsHeader" class="text-muted" style="font-size:12px">Laden...</span>
      </div>
      <div id="costsCards" class="stats-grid" style="margin-bottom:20px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Log</span>
        <select id="activityFilter" class="form-select" style="width:160px;font-size:12px" onchange="loadActivityLog()">
          <option value="">Alle activiteiten</option>
          <option value="run">Runs</option>
          <option value="email">Emails verstuurd</option>
          <option value="reply">Replies ontvangen</option>
          <option value="backup">Backups</option>
        </select>
      </div>
      <div id="activityLog"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>
  `;

  // Load costs + activity after render
  loadCostStats();
  loadActivityLog();
  loadTemplates();
}

const ACTIVITY_ICONS = { run: 'ti-player-play', email: 'ti-send', reply: 'ti-message-reply', backup: 'ti-database-export', followup: 'ti-clock-hour-4' };
const ACTIVITY_COLORS = { run: '#2563eb', email: '#16a34a', reply: '#ea580c', backup: '#9b9b98', followup: '#7c3aed' };

async function loadCostStats() {
  try {
    const data = await apiJSON('/api/stats/costs');
    if (!data) return;
    const cards = document.getElementById('costsCards');
    if (!cards) return;
    const totalEur = (data.totalCostUsd * 0.92).toFixed(4);
    const todayEur = (data.todayCostUsd * 0.92).toFixed(4);
    cards.innerHTML =
      statCard('Totale API kosten', '€' + totalEur, 'ti-coin') +
      statCard('Vandaag', '€' + todayEur, 'ti-calendar-stats') +
      statCard('Input tokens', formatNumber(data.totalTokensIn), 'ti-arrow-bar-to-right') +
      statCard('Output tokens', formatNumber(data.totalTokensOut), 'ti-arrow-bar-to-left');
    const header = document.getElementById('costsHeader');
    if (header) header.textContent = 'claude-sonnet-4-6 · $3/$15 per M tokens';
  } catch {}
}

function statCard(label, value, icon) {
  return `<div class="stat-card">
    <div class="stat-icon"><i class="ti ${icon}"></i></div>
    <div class="stat-value">${value}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

function formatNumber(n) {
  if (!n) return '0';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(n);
}

async function loadActivityLog() {
  const container = document.getElementById('activityLog');
  if (!container) return;
  const filter = document.getElementById('activityFilter')?.value || '';
  try {
    const data = await apiJSON('/api/activity?limit=50');
    if (!data) return;
    let entries = data.activity || [];
    if (filter) entries = entries.filter(e => e.type === filter);
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-list"></i><p>Geen activiteiten gevonden</p></div>';
      return;
    }
    container.innerHTML = entries.map(e => {
      const icon  = ACTIVITY_ICONS[e.type]  || 'ti-point';
      const color = ACTIVITY_COLORS[e.type] || 'var(--text-muted)';
      const time  = new Date(e.timestamp).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const dollarSign = String.fromCharCode(36);
      const cost  = e.costUsd > 0 ? `<span class="text-muted" style="font-size:11px;margin-left:8px">${dollarSign}${e.costUsd.toFixed(4)}</span>` : '';
      const tok   = e.tokensIn > 0 ? `<span class="text-muted" style="font-size:11px;margin-left:6px">${formatNumber(e.tokensIn + e.tokensOut)} tok</span>` : '';
      return `<div class="activity-log-row">
        <div class="activity-log-icon" style="background:${color}18;color:${color}">
          <i class="ti ${icon}"></i>
        </div>
        <div class="activity-log-body">
          <div class="activity-log-label">${esc(e.label)}${cost}${tok}</div>
          <div class="activity-log-time">${time}</div>
        </div>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<p class="text-muted" style="font-size:13px">Laden mislukt</p>'; }
}


function showNewTemplateForm() {
  const wrap = document.getElementById('templateFormWrap');
  if (wrap) { wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; }
}

async function loadTemplates() {
  const container = document.getElementById('templateList');
  if (!container) return;
  try {
    const data = await apiJSON('/api/run-templates');
    const templates = (data && data.templates) || [];
    if (!templates.length) {
      container.innerHTML = '<p class="text-muted" style="font-size:13px;margin:0">Geen sjablonen. Voeg er een toe om snel te herstarten.</p>';
      return;
    }
    container.innerHTML = templates.map(t => {
      const niches = (t.niches || []).join(', ') || '—';
      const loc    = t.location ? ' · ' + t.location : '';
      return `<div class="template-row">
        <div class="template-row-info">
          <div class="template-row-name">${esc(t.name)}</div>
          <div class="template-row-meta">${esc(niches)}${loc} · ${t.count} leads</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="runTemplate('${t.id}', this)">
          <i class="ti ti-player-play"></i> Uitvoeren
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteTemplate('${t.id}')">
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<p class="text-muted" style="font-size:13px;margin:0">Laden mislukt</p>';
  }
}

async function saveTemplate() {
  const name     = document.getElementById('tmplName')?.value?.trim();
  const niches   = document.getElementById('tmplNiches')?.value?.trim();
  const count    = document.getElementById('tmplCount')?.value;
  const location = document.getElementById('tmplLocation')?.value?.trim();
  if (!name) { toast('Voer een naam in', 'error'); return; }
  const res = await api('/api/run-templates', {
    method: 'POST',
    body: JSON.stringify({ name, niches, count, location })
  });
  if (res.ok) {
    toast('Sjabloon opgeslagen', 'success');
    document.getElementById('templateFormWrap').style.display = 'none';
    document.getElementById('tmplName').value = '';
    document.getElementById('tmplNiches').value = '';
    document.getElementById('tmplCount').value = '10';
    document.getElementById('tmplLocation').value = '';
    await loadTemplates();
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function runTemplate(id, btn) {
  if (!confirm('Run starten met dit sjabloon?')) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Bezig...'; }
  try {
    const res = await api('/api/run-templates/' + id + '/run', { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) {
      const data = await res.json();
      toast('Run klaar — ' + (data.found || 0) + ' leads gevonden', 'success');
      await renderRuns();
    } else {
      toast('Run mislukt', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Uitvoeren'; }
    }
  } catch {
    toast('Run mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Uitvoeren'; }
  }
}

async function deleteTemplate(id) {
  if (!confirm('Sjabloon verwijderen?')) return;
  const res = await api('/api/run-templates/' + id, { method: 'DELETE' });
  if (res.ok) {
    toast('Sjabloon verwijderd', 'success');
    await loadTemplates();
  } else {
    toast('Verwijderen mislukt', 'error');
  }
}

// ── Blacklist ──────────────────────────────────────────────────────────────────
async function quickBlacklist(leadId, companyName) {
  if (!confirm(`${companyName} blacklisten? Dit bedrijf wordt voortaan overgeslagen.`)) return;
  const res = await api('/api/leads/' + leadId + '/blacklist', { method: 'POST', body: JSON.stringify({ reason: 'Geblacklist via pipeline' }) });
  if (res.ok) {
    toast(companyName + ' geblacklist', 'success');
  } else {
    toast('Fout bij blacklisten', 'error');
  }
}

async function loadBlacklist() {
  const res  = await api('/api/blacklist');
  const list = await res.json();
  const el   = document.getElementById('blacklistItems');
  if (!el) return;
  if (!list.length) {
    el.innerHTML = '<p style="font-size:13px;color:#9ca3af;padding:12px 0">Geen geblokkeerde bedrijven.</p>';
    return;
  }
  el.innerHTML = list.map(e => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
      <div>
        <span style="font-size:13px;font-weight:600">${esc(e.value)}</span>
        <span style="font-size:11px;color:#9ca3af;margin-left:8px">${e.type}</span>
        ${e.reason ? `<span style="font-size:11px;color:#9ca3af;margin-left:6px">— ${esc(e.reason)}</span>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="removeBlacklist('${e.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

async function removeBlacklist(id) {
  const res = await api('/api/blacklist/' + id, { method: 'DELETE' });
  if (res.ok) { toast('Verwijderd', 'success'); loadBlacklist(); }
}

async function addBlacklistEntry() {
  const type  = document.getElementById('blType')?.value;
  const value = document.getElementById('blValue')?.value?.trim();
  const reason = document.getElementById('blReason')?.value?.trim();
  if (!value) return toast('Voer een waarde in', 'error');
  const res = await api('/api/blacklist', { method: 'POST', body: JSON.stringify({ type, value, reason }) });
  if (res.ok) {
    toast('Toegevoegd aan blacklist', 'success');
    document.getElementById('blValue').value = '';
    document.getElementById('blReason').value = '';
    loadBlacklist();
  }
}

async function startCustomRun() {
  const count  = parseInt(document.getElementById('runCount')?.value) || 15;
  const niches = document.getElementById('runNiches')?.value?.trim();
  const nicheArr = niches ? niches.split(',').map(n => n.trim()).filter(Boolean) : [];
  const btn = document.getElementById('startRunBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }
  const res = await api('/api/find-leads', {
    method: 'POST',
    body: JSON.stringify({ count, niches: nicheArr })
  });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Start run'; }
  if (res?.ok) {
    const data = await res.json();
    toast(`Run klaar — ${data.found || 0} leads gevonden`, 'success');
    renderRuns();
  } else {
    toast('Run mislukt. Controleer de server logs.', 'error');
  }
}

let _dupCheckTimer = null;
async function checkDuplicateLive() {
  clearTimeout(_dupCheckTimer);
  const nameEl = document.getElementById('custCompany');
  const domainEl = document.getElementById('custWebsite');
  const warn = document.getElementById('dupWarning');
  if (!warn) return;
  const name = nameEl?.value?.trim() || '';
  const domain = domainEl?.value?.trim() || '';
  if (!name && !domain) { warn.style.display = 'none'; return; }
  _dupCheckTimer = setTimeout(async () => {
    const params = new URLSearchParams();
    if (name)   params.set('name', name);
    if (domain) params.set('domain', domain);
    const data = await apiJSON(`/api/leads/check-duplicate?${params}`);
    if (data?.duplicate) {
      warn.style.display = 'flex';
      warn.innerHTML = `<i class="ti ti-alert-triangle" style="color:#f59e0b;flex-shrink:0"></i><span style="font-size:12px">Mogelijk duplicaat: <strong>${esc(data.companyName)}</strong> staat al in je pipeline (status: ${data.status || '?'})</span>`;
    } else {
      warn.style.display = 'none';
    }
  }, 500);
}

async function analyzeCustomCompany() {
  const companyName = document.getElementById('custCompany')?.value?.trim();
  if (!companyName) { toast('Vul een bedrijfsnaam in.', 'error'); return; }

  const domain = document.getElementById('custWebsite')?.value?.trim() || '';
  const dupParams = new URLSearchParams();
  dupParams.set('name', companyName);
  if (domain) dupParams.set('domain', domain);
  const dupData = await apiJSON(`/api/leads/check-duplicate?${dupParams}`);
  if (dupData?.duplicate) {
    if (!confirm(`${companyName} staat al in je pipeline (status: ${dupData.status}). Toch toevoegen?`)) return;
  }

  const btn = document.getElementById('analyzeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }

  const STEPS = [
    { icon: 'ti-search',          name: 'Lead Finder',         sub: 'Bedrijf registreren' },
    { icon: 'ti-world',           name: 'Website Checker',     sub: 'Website analyseren' },
    { icon: 'ti-brand-instagram', name: 'Social Analyzer',     sub: 'Social media checken' },
    { icon: 'ti-chart-bar',       name: 'Opportunity Scorer',  sub: 'Score berekenen' },
    { icon: 'ti-chart-dots',      name: 'Competitor Analyzer', sub: 'Concurrenten zoeken' },
    { icon: 'ti-mail',            name: 'Email Writer',        sub: 'Email schrijven' },
    { icon: 'ti-brand-linkedin',  name: 'LinkedIn DM',         sub: 'LinkedIn DM schrijven' },
  ];

  const progressEl = document.getElementById('analyzeProgress');
  if (progressEl) {
    progressEl.style.display = '';
    progressEl.innerHTML = `
      <div class="analyze-progress-panel">
        <div class="analyze-progress-header">
          <span class="analyze-progress-title" id="analyzePanelTitle">Agent pipeline bezig...</span>
          <div class="analyze-progress-bar-wrap"><div class="analyze-progress-bar" id="analyzeProgressBar" style="width:0%"></div></div>
          <span class="analyze-progress-count" id="analyzeProgressCount">0 / ${STEPS.length}</span>
        </div>
        <div class="analyze-steps">
          ${STEPS.map((s, i) => `
            <div class="analyze-step step-pending" id="astep-${i}">
              <span class="analyze-step-icon" id="astep-icon-${i}"><i class="ti ti-circle" style="color:var(--border)"></i></span>
              <span class="analyze-step-name">${s.name}</span>
              <span class="analyze-step-status" id="astep-status-${i}">${s.sub}</span>
            </div>
          `).join('')}
        </div>
        <div class="analyze-result" id="analyzeResult" style="display:none"></div>
      </div>`;
  }

  let doneCount = 0;
  function stepActive(i) {
    const el = document.getElementById(`astep-${i}`);
    const icon = document.getElementById(`astep-icon-${i}`);
    const status = document.getElementById(`astep-status-${i}`);
    if (el) el.className = 'analyze-step step-active';
    if (icon) icon.innerHTML = '<i class="ti ti-loader-2 spin" style="color:var(--accent)"></i>';
    if (status) status.textContent = 'Bezig...';
  }
  function stepDone(i) {
    const el = document.getElementById(`astep-${i}`);
    const icon = document.getElementById(`astep-icon-${i}`);
    const status = document.getElementById(`astep-status-${i}`);
    if (el) el.className = 'analyze-step step-done';
    if (icon) icon.innerHTML = '<i class="ti ti-check" style="color:#16a34a"></i>';
    if (status) status.textContent = 'Klaar';
    doneCount++;
    const pct = Math.round((doneCount / STEPS.length) * 100);
    const bar = document.getElementById('analyzeProgressBar');
    const cnt = document.getElementById('analyzeProgressCount');
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent = `${doneCount} / ${STEPS.length}`;
  }

  // Simulate step progress while real fetch runs (~5s per step)
  const STEP_DELAYS = [0, 4000, 8000, 13000, 18000, 23000, 28000];
  let activatedUpTo = -1;
  let fetchComplete = false;
  const timers = STEPS.map((_, i) => setTimeout(() => {
    if (fetchComplete) return;
    if (activatedUpTo >= 0) stepDone(activatedUpTo);
    stepActive(i);
    activatedUpTo = i;
  }, STEP_DELAYS[i]));

  // Real API call
  let res = null, data = null;
  try {
    res = await api('/api/analyze-company', {
      method: 'POST',
      body: JSON.stringify({
        companyName,
        websiteUrl:      domain,
        instagramHandle: document.getElementById('custInstagram')?.value?.trim() || '',
        niche:           document.getElementById('custNiche')?.value || 'retail',
        location:        document.getElementById('custLocation')?.value?.trim() || 'Nederland',
        country:         document.getElementById('custCountry')?.value?.trim() || 'NL'
      })
    });
    if (res) data = await res.json();
  } catch (_) {}

  fetchComplete = true;
  timers.forEach(t => clearTimeout(t));

  // Fast-complete remaining steps
  if (activatedUpTo >= 0) stepDone(activatedUpTo);
  for (let i = activatedUpTo + 1; i < STEPS.length; i++) {
    stepActive(i);
    await new Promise(r => setTimeout(r, 70));
    stepDone(i);
  }

  // Show result
  const resultEl = document.getElementById('analyzeResult');
  const titleEl  = document.getElementById('analyzePanelTitle');
  if (!res || !res.ok) {
    const errMsg = data?.error || `Fout ${res?.status || 'onbekend'}`;
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.className = 'analyze-result result-error';
      resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${esc(errMsg)}`;
    }
    if (titleEl) titleEl.textContent = 'Analyse mislukt';
  } else {
    const score = data?.item?.score != null ? Number(data.item.score).toFixed(1) : '?';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.className = 'analyze-result result-success';
      resultEl.innerHTML = `<strong>✓ ${esc(companyName)} toegevoegd!</strong> Score: ${score}/10 &nbsp;—&nbsp; <a href="#" onclick="event.preventDefault();setView('inbox')">Bekijk in inbox →</a>`;
    }
    if (titleEl) titleEl.textContent = 'Analyse voltooid';
    ['custCompany','custWebsite','custInstagram','custLocation'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const warn = document.getElementById('dupWarning');
    if (warn) warn.style.display = 'none';
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Voeg toe en analyseer'; }
}

// ─── Statistics ───────────────────────────────────────────────────────────────

let _statsCharts = [];
function destroyStatsCharts() {
  _statsCharts.forEach(c => { try { c.destroy(); } catch {} });
  _statsCharts = [];
}

async function renderStats() {
  destroyStatsCharts();
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Analyse</div>
        <h1 class="page-title">Statistieken</h1>
      </div>
      <div style="display:flex;gap:8px">
        ${[7,30,90].map(d => `<button class="btn btn-ghost btn-sm stats-range-btn${d===30?' active':''}" data-days="${d}">${d} dagen</button>`).join('')}
      </div>
    </div>
    <div id="statsBody"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  document.querySelectorAll('.stats-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadStatsData(parseInt(btn.dataset.days));
    });
  });

  loadStatsData(30);
}

async function loadStatsData(days) {
  destroyStatsCharts();
  const [summary, detail] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON(`/api/stats/detailed?days=${days}`)
  ]);
  if (!summary || !detail) return;

  const body = document.getElementById('statsBody');
  if (!body) return;

  const fmt = n => n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n || 0);
  const fmtEur = n => '€' + (n >= 1000 ? (n/1000).toFixed(0) + 'K' : String(Math.round(n || 0)));

  const replyRate = summary.emailsSent > 0 ? Math.round(summary.replies / summary.emailsSent * 100) : 0;

  body.innerHTML = `
    <!-- KPI cards -->
    <div class="stats-grid" style="margin-bottom:24px">
      ${[
        { label: 'Leads gevonden',  value: fmt(summary.leadsFound),         icon: 'ti-users',          color: '#2563eb' },
        { label: 'Emails verstuurd',value: fmt(summary.emailsSent),         icon: 'ti-mail',           color: '#0ea5e9' },
        { label: 'Reacties',        value: fmt(summary.replies),            icon: 'ti-message-reply',  color: '#16a34a' },
        { label: 'Reply rate',      value: replyRate + '%',                 icon: 'ti-percentage',     color: '#d97706' },
        { label: 'Pipeline waarde', value: fmtEur(summary.pipelineValue),   icon: 'ti-currency-euro',  color: '#7c3aed' },
        { label: 'Klanten',         value: fmt(summary.clients),            icon: 'ti-star',           color: '#dc2626' }
      ].map(k => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${k.color}20;color:${k.color}"><i class="ti ${k.icon}"></i></div>
          <div>
            <div class="stat-value">${k.value}</div>
            <div class="stat-label">${k.label}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Charts row 1 -->
    <div class="charts-row-2">
      <div class="card chart-card">
        <h3 class="chart-title">Leads per dag</h3>
        <canvas id="chartLeadsPerDay" height="200"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Pipeline waarde per week</h3>
        <canvas id="chartPipelineWeek" height="200"></canvas>
      </div>
    </div>

    <!-- Charts row 2 -->
    <div class="charts-row-3">
      <div class="card chart-card">
        <h3 class="chart-title">Status verdeling</h3>
        <canvas id="chartStatus" height="220"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Top niches</h3>
        <canvas id="chartNiches" height="220"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Score verdeling</h3>
        <canvas id="chartScores" height="220"></canvas>
      </div>
    </div>

    <!-- Reply rate by niche + top leads -->
    <div class="charts-row-2" style="margin-bottom:0">
      <div class="card chart-card">
        <h3 class="chart-title">Reply rate per niche</h3>
        ${detail.replyRateByNiche.length === 0
          ? '<p class="text-secondary" style="font-size:13px">Nog niet genoeg data.</p>'
          : detail.replyRateByNiche.map(r => `
            <div class="reply-rate-row">
              <div class="reply-rate-label">
                <span style="font-weight:600">${esc(r.niche)}</span>
                <span class="text-secondary">${r.replied}/${r.sent} (${r.rate}%)</span>
              </div>
              <div class="reply-rate-bar">
                <div class="reply-rate-fill" style="width:${r.rate}%"></div>
              </div>
            </div>
          `).join('')}
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Top 5 leads op score</h3>
        ${detail.topLeads.length === 0
          ? '<p class="text-secondary" style="font-size:13px">Nog geen leads.</p>'
          : detail.topLeads.map((l, i) => `
            <div class="top-lead-row${i < detail.topLeads.length-1 ? ' border-bottom' : ''}">
              <span class="top-lead-rank">${i+1}</span>
              <div class="top-lead-info">
                <div class="top-lead-name">${esc(l.companyName)}</div>
                <div class="top-lead-sub">${esc(l.niche || '')} · ${STATUS_LABELS[l.status] || l.status}</div>
              </div>
              <span class="score-pill score-${scoreColor(l.score||0)}">${(l.score||0).toFixed(1)}</span>
              ${l.estimatedValue ? `<span class="text-success" style="font-size:12px;font-weight:600">€${Math.round(l.estimatedValue/1000)}K</span>` : ''}
            </div>
          `).join('')}
      </div>
    </div>
  `;

  // Chart colours
  const BLUE = '#2563eb'; const SKY = '#0ea5e9'; const GREEN = '#16a34a';
  const AMBER = '#d97706'; const RED = '#dc2626'; const PURPLE = '#7c3aed';

  const STATUS_COLORS_CHART = { inbox:'#2563eb', approved:'#0ea5e9', sent:'#0ea5e9', replied:'#16a34a', client:'#16a34a', disapproved:'#dc2626', dead:'#9b9b98', scheduled:'#d97706', followup1:'#d97706', followup2:'#ea580c' };

  // Leads per day
  const ctx1 = document.getElementById('chartLeadsPerDay')?.getContext('2d');
  if (ctx1) {
    _statsCharts.push(new Chart(ctx1, {
      type: 'line',
      data: {
        labels: detail.leadsPerDay.map(d => d.date.slice(5)),
        datasets: [{ label: 'Leads', data: detail.leadsPerDay.map(d => d.count), borderColor: BLUE, backgroundColor: BLUE + '20', fill: true, tension: 0.4, pointRadius: 3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }

  // Pipeline by week
  const ctx2 = document.getElementById('chartPipelineWeek')?.getContext('2d');
  if (ctx2) {
    _statsCharts.push(new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: detail.pipelineByWeek.map(w => w.week.slice(-5)),
        datasets: [{ label: '€ Waarde', data: detail.pipelineByWeek.map(w => w.value), backgroundColor: SKY + 'cc', borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    }));
  }

  // Status donut
  const ctx3 = document.getElementById('chartStatus')?.getContext('2d');
  if (ctx3) {
    const entries = Object.entries(detail.byStatus).filter(([,v]) => v > 0);
    _statsCharts.push(new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => STATUS_LABELS[k] || k),
        datasets: [{ data: entries.map(([,v]) => v), backgroundColor: entries.map(([k]) => STATUS_COLORS_CHART[k] || '#9ca3af'), borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } } }
    }));
  }

  // Niches bar
  const ctx4 = document.getElementById('chartNiches')?.getContext('2d');
  if (ctx4) {
    const top = Object.entries(detail.byNiche).sort(([,a],[,b]) => b-a).slice(0, 8);
    _statsCharts.push(new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: top.map(([k]) => k),
        datasets: [{ data: top.map(([,v]) => v), backgroundColor: BLUE + 'cc', borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }

  // Score histogram
  const ctx5 = document.getElementById('chartScores')?.getContext('2d');
  if (ctx5) {
    _statsCharts.push(new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: Object.keys(detail.scoreBuckets),
        datasets: [{ data: Object.values(detail.scoreBuckets), backgroundColor: [RED+'cc', AMBER+'cc', BLUE+'cc', GREEN+'cc', PURPLE+'cc'], borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

async function renderChat() {
  document.getElementById('appView').innerHTML = `
    <div class="chat-layout">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <span class="chat-sidebar-title">Team Chat</span>
          ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="createChatChannel()" title="Nieuw kanaal"><i class="ti ti-plus"></i></button>` : ''}
        </div>
        <div id="chatChannelList"></div>
      </div>
      <div class="chat-main" id="chatMain">
        <div class="chat-empty-state">
          <i class="ti ti-message-circle" style="font-size:40px;color:var(--border)"></i>
          <p class="text-secondary" style="margin-top:8px">Selecteer een kanaal</p>
        </div>
      </div>
    </div>
  `;

  const channels = await apiJSON('/api/chat/channels');
  if (!channels) return;
  state._chatChannels = channels;
  state._activeChannelId = null;

  renderChatChannelList(channels);

  // Auto-open first channel
  if (channels.length > 0) openChatChannel(channels[0].id);
}

function renderChatChannelList(channels) {
  const el = document.getElementById('chatChannelList');
  if (!el) return;
  el.innerHTML = channels.map(ch => `
    <button class="chat-channel-btn${state._activeChannelId === ch.id ? ' active' : ''}" onclick="openChatChannel('${ch.id}')">
      <span class="chat-channel-hash">#</span>
      <span class="chat-channel-name">${esc(ch.name)}</span>
      ${ch.lastMessage ? `<span class="chat-channel-preview">${esc(ch.lastMessage.name)}: ${esc(ch.lastMessage.text).slice(0,30)}</span>` : ''}
    </button>
  `).join('');
}

async function openChatChannel(channelId) {
  if (state._chatPollTimer) { clearInterval(state._chatPollTimer); state._chatPollTimer = null; }
  state._activeChannelId = channelId;
  const ch = (state._chatChannels || []).find(c => c.id === channelId);

  const main = document.getElementById('chatMain');
  if (!main) return;

  main.innerHTML = `
    <div class="chat-header">
      <div>
        <span class="chat-header-name">#${esc(ch?.name || '')}</span>
        ${ch?.description ? `<span class="chat-header-desc">${esc(ch.description)}</span>` : ''}
      </div>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm btn-danger-ghost" onclick="deleteChatChannel('${channelId}')"><i class="ti ti-trash"></i></button>` : ''}
    </div>
    <div class="chat-messages" id="chatMessages"><div class="loading-state"><div class="spinner"></div></div></div>
    <form class="chat-input-row" id="chatForm" onsubmit="sendChatMessage(event,'${channelId}')">
      <input type="text" class="chat-input" id="chatInput" placeholder="Bericht naar #${esc(ch?.name || '')}..." autocomplete="off" maxlength="2000">
      <button type="submit" class="btn btn-primary btn-sm"><i class="ti ti-send"></i></button>
    </form>
  `;

  document.getElementById('chatInput')?.focus();
  renderChatChannelList(state._chatChannels || []);

  // Load initial messages
  await loadChatMessages(channelId, true);

  // Poll for new messages every 3 seconds
  state._chatLastSince = new Date().toISOString();
  state._chatPollTimer = setInterval(() => pollChatMessages(channelId), 3000);
}

async function loadChatMessages(channelId, scrollBottom = false) {
  const msgs = await apiJSON(`/api/chat/channels/${channelId}/messages?limit=100`);
  if (!msgs) return;
  renderChatMessages(msgs);
  if (scrollBottom) {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }
}

async function pollChatMessages(channelId) {
  if (state._activeChannelId !== channelId) return;
  const since = state._chatLastSince || '';
  const msgs = await apiJSON(`/api/chat/channels/${channelId}/messages?since=${encodeURIComponent(since)}&limit=50`);
  if (!msgs || msgs.length === 0) return;
  state._chatLastSince = msgs[msgs.length - 1].createdAt;

  const el = document.getElementById('chatMessages');
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

  msgs.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildChatMessageHTML(msg);
    el.appendChild(div);
  });

  if (atBottom) el.scrollTop = el.scrollHeight;
}

function renderChatMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (msgs.length === 0) {
    el.innerHTML = '<div class="chat-messages-empty">Geen berichten nog. Stuur het eerste bericht!</div>';
    return;
  }

  let html = '';
  let lastDate = '';
  for (const msg of msgs) {
    const d = new Date(msg.createdAt).toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });
    if (d !== lastDate) {
      html += `<div class="chat-date-divider"><span>${d}</span></div>`;
      lastDate = d;
    }
    html += `<div class="chat-message" data-id="${msg.id}">${buildChatMessageHTML(msg)}</div>`;
  }
  el.innerHTML = html;
}

function buildChatMessageHTML(msg) {
  const myId = (() => { try { return JSON.parse(atob(getToken().split('.')[1])).id; } catch { return null; } })();
  const isOwn = msg.userId === myId;
  const canDelete = isOwn || isAdmin();
  return `
    <div class="chat-msg-avatar" style="background:${msg.role === 'admin' ? '#111' : '#2563eb'}">${(msg.name || msg.username)[0].toUpperCase()}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${esc(msg.name || msg.username)}</span>
        <span class="chat-msg-time">${new Date(msg.createdAt).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' })}</span>
        ${canDelete ? `<button class="chat-msg-delete" onclick="deleteChatMessage('${msg.id}')" title="Verwijder"><i class="ti ti-trash"></i></button>` : ''}
      </div>
      <div class="chat-msg-text">${esc(msg.text).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

async function sendChatMessage(e, channelId) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const res = await api(`/api/chat/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  if (!res?.ok) { toast('Verzenden mislukt.', 'error'); input.value = text; return; }
  const msg = await res.json();
  // Append immediately without waiting for poll
  const el = document.getElementById('chatMessages');
  if (el) {
    const emptyMsg = el.querySelector('div[style*="Geen berichten"]');
    if (emptyMsg) emptyMsg.remove();
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildChatMessageHTML(msg);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  state._chatLastSince = msg.createdAt;
}

async function deleteChatMessage(id) {
  const res = await api(`/api/chat/messages/${id}`, { method: 'DELETE' });
  if (res?.ok) {
    document.querySelector(`.chat-message[data-id="${id}"]`)?.remove();
  } else {
    toast('Verwijderen mislukt.', 'error');
  }
}

async function createChatChannel() {
  const name = prompt('Kanaalnaam (bijv. marketing):')?.trim();
  if (!name) return;
  const desc = prompt('Omschrijving (optioneel):')?.trim() || '';
  const res = await api('/api/chat/channels', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
  if (res?.ok) {
    const ch = await res.json();
    state._chatChannels = state._chatChannels || [];
    state._chatChannels.push({ ...ch, messageCount: 0, lastMessage: null });
    renderChatChannelList(state._chatChannels);
    openChatChannel(ch.id);
  } else {
    const d = res ? await res.json().catch(() => ({})) : {};
    toast(d.error || 'Aanmaken mislukt.', 'error');
  }
}

async function deleteChatChannel(id) {
  const ch = (state._chatChannels || []).find(c => c.id === id);
  if (!confirm(`Kanaal #${ch?.name} en alle berichten verwijderen?`)) return;
  const res = await api(`/api/chat/channels/${id}`, { method: 'DELETE' });
  if (res?.ok) {
    state._chatChannels = (state._chatChannels || []).filter(c => c.id !== id);
    renderChatChannelList(state._chatChannels);
    const main = document.getElementById('chatMain');
    if (main) main.innerHTML = `<div class="chat-empty-state"><i class="ti ti-message-circle" style="font-size:40px;color:var(--border)"></i><p class="text-secondary" style="margin-top:8px">Kanaal verwijderd</p></div>`;
    state._activeChannelId = null;
    if (state._chatChannels.length > 0) openChatChannel(state._chatChannels[0].id);
  } else toast('Verwijderen mislukt.', 'error');
}

// ─── API Keys helpers ─────────────────────────────────────────────────────────

async function loadApiKeysList() {
  const el = document.getElementById('apiKeysList');
  if (!el) return;
  const keys = await apiJSON('/api/auth/api-keys');
  if (!keys) return;
  if (keys.length === 0) {
    el.innerHTML = '<p class="text-secondary" style="font-size:13px">Geen actieve sleutels.</p>';
    return;
  }
  el.innerHTML = keys.map(k => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="flex:1">
        <div style="font-size:13px;font-weight:600">${esc(k.keyLabel)}</div>
        <div style="font-size:11px;color:var(--text-secondary);font-family:monospace">${esc(k.keyPrefix)} &bull; aangemaakt ${relativeTime(k.createdAt)}${k.lastUsed ? ' &bull; gebruikt ' + relativeTime(k.lastUsed) : ''}</div>
      </div>
      <span class="badge badge-${k.role === 'admin' ? 'gray' : 'blue'}" style="font-size:10px">${k.role === 'admin' ? 'Admin' : 'Medewerker'}</span>
      <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="revokeApiKey('${k.id}')"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}

async function generateApiKey() {
  const label = document.getElementById('newKeyLabel')?.value?.trim() || 'API Sleutel';
  const res = await api('/api/auth/api-keys', { method: 'POST', body: JSON.stringify({ label }) });
  if (!res?.ok) { toast('Genereren mislukt.', 'error'); return; }
  const data = await res.json();
  const display = document.getElementById('newKeyDisplay');
  const val = document.getElementById('newKeyValue');
  if (display) display.style.display = '';
  if (val) val.textContent = data.key;
  document.getElementById('newKeyLabel').value = '';
  loadApiKeysList();
}

async function revokeApiKey(id) {
  if (!confirm('Deze API sleutel intrekken?')) return;
  const res = await api(`/api/auth/api-keys/${id}`, { method: 'DELETE' });
  if (res?.ok) { toast('Sleutel ingetrokken.', 'success'); loadApiKeysList(); }
  else toast('Intrekken mislukt.', 'error');
}

function copyApiKey() {
  const val = document.getElementById('newKeyValue')?.textContent;
  if (val) navigator.clipboard.writeText(val).then(() => toast('Sleutel gekopieerd.', 'success'));
}

// ─── Users management helpers ─────────────────────────────────────────────────

async function loadUsersList() {
  const el = document.getElementById('usersList');
  if (!el) return;
  const users = await apiJSON('/api/users');
  if (!users) return;
  el.innerHTML = users.map(u => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:32px;height:32px;border-radius:50%;background:${u.role==='admin'?'#111':'#6366f1'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0">${u.name[0].toUpperCase()}</div>
      <div style="flex:1">
        <div style="font-size:14px;font-weight:600">${esc(u.name)} <span style="font-size:11px;color:var(--text-secondary)">@${esc(u.username)}</span></div>
        <span class="badge ${u.role==='admin'?'badge-gray':'badge-blue'}" style="font-size:10px">${u.role==='admin'?'Admin':'Medewerker'}</span>
      </div>
      ${u.id !== '1' ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteUser('${u.id}','${esc(u.name).replace(/'/g,"\\'")}')"><i class="ti ti-trash"></i></button>` : '<span style="font-size:11px;color:var(--text-secondary)">Hoofd-admin</span>'}
    </div>
  `).join('') || '<p class="text-secondary" style="font-size:13px">Geen gebruikers gevonden.</p>';
}

async function addUser() {
  const name = document.getElementById('newUserName')?.value?.trim();
  const username = document.getElementById('newUserUsername')?.value?.trim();
  const password = document.getElementById('newUserPassword')?.value;
  const role = document.getElementById('newUserRole')?.value;
  if (!name || !username || !password) { toast('Vul alle velden in.', 'error'); return; }
  const res = await api('/api/users', { method: 'POST', body: JSON.stringify({ name, username, password, role }) });
  if (res?.ok) {
    toast(`${name} aangemaakt als ${role === 'admin' ? 'Admin' : 'Medewerker'}.`, 'success');
    ['newUserName','newUserUsername','newUserPassword'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadUsersList();
  } else {
    const d = res ? await res.json().catch(() => ({})) : {};
    toast(d.error || 'Aanmaken mislukt.', 'error');
  }
}

async function deleteUser(id, name) {
  if (!confirm(`${name} verwijderen?`)) return;
  const res = await api(`/api/users/${id}`, { method: 'DELETE' });
  if (res?.ok) { toast(`${name} verwijderd.`, 'success'); loadUsersList(); }
  else { const d = res ? await res.json().catch(()=>({})) : {}; toast(d.error || 'Verwijderen mislukt.', 'error'); }
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function switchSettingsTab(id) {
  document.querySelectorAll('.settings-tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-nav-item[data-tab]').forEach(el => el.classList.remove('active'));
  document.getElementById('stab-' + id)?.classList.add('active');
  document.querySelector(`.settings-nav-item[data-tab="${id}"]`)?.classList.add('active');
  localStorage.setItem('settingsTab', id);
}

async function renderSettings() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Configuratie</div>
        <h1 class="page-title">Instellingen</h1>
      </div>
    </div>
    <div id="settingsContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  const s = await apiJSON('/api/settings') || {};
  state.settings = s;

  document.getElementById('settingsContent').innerHTML = `
  <div class="settings-layout">
    <nav class="settings-nav">
      <button class="settings-nav-item active" data-tab="account" onclick="switchSettingsTab('account')"><i class="ti ti-user"></i> Account</button>
      <button class="settings-nav-item" data-tab="website" onclick="switchSettingsTab('website')"><i class="ti ti-world"></i> Publieke pagina</button>
      <button class="settings-nav-item" data-tab="email" onclick="switchSettingsTab('email')"><i class="ti ti-mail"></i> Email &amp; versturen</button>
      <button class="settings-nav-item" data-tab="niches" onclick="switchSettingsTab('niches')"><i class="ti ti-filter"></i> Niches &amp; filters</button>
      <button class="settings-nav-item" data-tab="payments" onclick="switchSettingsTab('payments')"><i class="ti ti-credit-card"></i> Betalingen</button>
      <button class="settings-nav-item" data-tab="api" onclick="switchSettingsTab('api')"><i class="ti ti-key"></i> API &amp; integraties</button>
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="team" onclick="switchSettingsTab('team')"><i class="ti ti-users"></i> Team</button>` : ''}
      <button class="settings-nav-item nav-danger" data-tab="danger" onclick="switchSettingsTab('danger')"><i class="ti ti-alert-triangle"></i> Gevaarlijke zone</button>
    </nav>
    <div class="settings-content">

      <!-- ── Account ── -->
      <div class="settings-tab-pane active" id="stab-account">
        <h2 class="settings-title"><i class="ti ti-user"></i> Mijn account</h2>
        <div class="form-grid">
          <div class="form-group"><label>Agency naam</label><input type="text" id="agencyName" value="${esc(s.agencyName)}"></div>
          <div class="form-group"><label>Mijn naam</label><input type="text" id="myName" value="${esc(s.myName)}"></div>
          <div class="form-group"><label>Mijn titel</label><input type="text" id="myTitle" value="${esc(s.myTitle)}"></div>
          <div class="form-group"><label>Gebruikersnaam</label><input type="text" id="settingsUsername" value="${esc(s.username)}"></div>
        </div>
        <hr class="divider">
        <h3 class="settings-subtitle">Wachtwoord wijzigen</h3>
        <div class="form-grid">
          <div class="form-group"><label>Huidig wachtwoord</label><input type="password" id="currentPassword" placeholder="••••••••"></div>
          <div class="form-group"><label>Nieuw wachtwoord</label><input type="password" id="newPassword" placeholder="••••••••"></div>
        </div>
        <button class="btn btn-primary" id="saveAccountBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
      </div>

      <!-- ── Publieke pagina ── -->
      <div class="settings-tab-pane" id="stab-website">
        <h2 class="settings-title">
          <i class="ti ti-world"></i> Publieke website
          <a href="/agency" target="_blank" rel="noopener" class="settings-header-link"><i class="ti ti-external-link"></i> Bekijk website</a>
        </h2>
        <p class="settings-note">Publieke landingspagina op <code>/agency</code> — deel deze link met potentiële klanten.</p>
        <div class="form-grid">
          <div class="form-group" style="grid-column:1/-1">
            <label>Tagline</label>
            <input type="text" id="websiteTagline" value="${esc(s.websiteTagline || 'Meer klanten. Minder werk. Volledig automatisch.')}">
          </div>
          <div class="form-group" style="grid-column:1/-1">
            <label>Over ons tekst</label>
            <textarea id="websiteAbout" rows="3" style="resize:vertical">${esc(s.websiteAbout || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Contactmail op website</label>
            <input type="email" id="websiteContact" value="${esc(s.websiteContact || s.gmailAddress || '')}" placeholder="contact@jouwbedrijf.nl">
          </div>
        </div>
        <button class="btn btn-primary" id="saveWebsiteBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
      </div>

      <!-- ── Email & versturen ── -->
      <div class="settings-tab-pane" id="stab-email">
        <h2 class="settings-title">
          <i class="ti ti-mail"></i> Gmail instellen
          ${s.gmailAddress ? `<span class="badge badge-green"><i class="ti ti-check"></i> Ingesteld</span>` : `<span class="badge badge-red">Niet ingesteld</span>`}
        </h2>
        <div class="form-grid">
          <div class="form-group">
            <label>Gmail adres</label>
            <input type="email" id="gmailAddress" value="${s.gmailAddress || ''}" placeholder="jouw@gmail.com">
          </div>
          <div class="form-group">
            <label>App-wachtwoord <a href="https://myaccount.google.com/apppasswords" target="_blank" class="link">Hoe maak ik dit aan?</a></label>
            <input type="password" id="gmailPassword" placeholder="xxxx xxxx xxxx xxxx">
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="saveGmailBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
          <button class="btn btn-ghost" id="testEmailBtn"><i class="ti ti-send"></i> Stuur testmail</button>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label class="toggle-wrap">
            <input type="checkbox" id="replyDetection" ${s.replyDetection !== false ? 'checked' : ''}>
            <span class="toggle"></span>
            <span class="toggle-label">Reply detectie inschakelen</span>
          </label>
          <p class="toggle-hint">Controleert elke 2 uur je Gmail inbox op antwoorden van prospects</p>
        </div>
        <div class="form-group" style="margin-top:14px">
          <label class="toggle-wrap">
            <input type="checkbox" id="webhookEnabled" ${s.webhookConfigured ? 'checked' : ''} onchange="document.getElementById('webhookPanel').style.display=this.checked?'block':'none'">
            <span class="toggle"></span>
            <span class="toggle-label">Real-time webhook inschakelen</span>
          </label>
          <p class="toggle-hint">Detecteert replies direct via Google Pub/Sub — sneller dan polling elke 2 uur</p>
        </div>
        <div id="webhookPanel" class="settings-panel" style="display:${s.webhookConfigured ? 'block' : 'none'};margin-top:12px">
          <div class="form-group">
            <label>Webhook token <span class="text-muted">(geheime sleutel in de URL)</span></label>
            <div style="display:flex;gap:8px">
              <input type="text" id="webhookToken" value="${esc(s.webhookToken || '')}" placeholder="Genereer een token..." style="flex:1;font-family:monospace;font-size:13px" oninput="updateWebhookUrl()">
              <button class="btn btn-ghost btn-sm" onclick="generateWebhookToken()"><i class="ti ti-refresh"></i> Genereer</button>
            </div>
          </div>
          <div class="form-group" style="margin-top:10px">
            <label>Jouw webhook URL <span class="text-muted">(gebruik dit als Pub/Sub push endpoint)</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              <code id="webhookUrlDisplay" class="webhook-url-code">${s.webhookToken ? window.location.origin + '/api/gmail/webhook?token=' + s.webhookToken : 'Sla eerst een token op'}</code>
              <button class="btn btn-ghost btn-sm btn-icon" onclick="copyWebhookUrl()"><i class="ti ti-copy"></i></button>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="saveWebhookSettings()"><i class="ti ti-device-floppy"></i> Token opslaan</button>
          <div style="margin-top:16px">
            <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:space-between;text-align:left" onclick="toggleWebhookInstructions()">
              <span><i class="ti ti-info-circle"></i> Setup instructies — Google Cloud Pub/Sub</span>
              <i class="ti ti-chevron-down" id="webhookInstrChevron" style="transition:transform 0.2s"></i>
            </button>
            <div id="webhookInstructions" class="webhook-instructions" style="display:none">
              <ol style="margin:0;padding-left:18px">
                <li>Ga naar <strong>console.cloud.google.com</strong> en maak een nieuw project aan</li>
                <li>Activeer <strong>Gmail API</strong> + <strong>Cloud Pub/Sub API</strong> via "APIs &amp; Services"</li>
                <li>Maak een Pub/Sub topic aan: bijv. <code style="background:var(--border);padding:1px 5px;border-radius:4px">gmail-replies</code></li>
                <li>Maak een <strong>Push subscription</strong> aan — plak jouw webhook URL als endpoint</li>
                <li>Geef het account <code style="background:var(--border);padding:1px 5px;border-radius:4px">gmail-api-push@system.gserviceaccount.com</code> de rol <strong>Pub/Sub Publisher</strong> op het topic</li>
                <li>Stel Gmail push notifications in via de <strong>Gmail API Explorer</strong> → <code style="background:var(--border);padding:1px 5px;border-radius:4px">users.watch</code> met jouw topic naam</li>
                <li>Genereer en sla een token op (zie boven) — de webhook is nu actief</li>
              </ol>
              <p style="margin:12px 0 0;padding:10px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;font-size:12px;color:#92400e">
                ⚡ Wanneer de webhook actief is wordt de 2-uurlijkse IMAP polling automatisch uitgeschakeld.
              </p>
            </div>
          </div>
        </div>
        <hr class="divider" style="margin:20px 0">
        <h3 class="settings-subtitle"><i class="ti ti-mail-cog" style="margin-right:5px"></i> Dagelijkse briefing email</h3>
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group">
            <label class="toggle-wrap">
              <input type="checkbox" id="dailyBriefingEnabled" ${s.dailyBriefingEnabled !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Briefing email inschakelen</span>
            </label>
            <p class="toggle-hint">Stuur dagelijks een overzicht met leads, reacties en pipelinewaarde</p>
          </div>
          <div class="form-group">
            <label>Verzendtijd briefing</label>
            <input type="time" id="dailyBriefingTime" value="${s.dailyBriefingTime || '08:45'}">
          </div>
        </div>
        <hr class="divider" style="margin:20px 0">
        <h3 class="settings-subtitle"><i class="ti ti-mail-cog" style="margin-right:5px"></i> Automatische klant e-mails</h3>
        <div class="auto-emails-grid">
          ${[
            { key: 'welcome',        label: 'Welkomstmail bij projectstart' },
            { key: 'intakeReceived', label: 'Bevestiging intake ontvangen' },
            { key: 'deliveryReady',  label: 'Leveringen klaarstaan' },
            { key: 'weekComplete',   label: 'Week afgerond update' },
            { key: 'monthlyUpdate',  label: 'Maandelijkse update' },
            { key: 'checkIn',        label: 'Halverwege check-in' },
          ].map(opt => `
            <label class="auto-email-label">
              <input type="checkbox" id="ace_${opt.key}" ${(s.autoClientEmails?.[opt.key] !== false) ? 'checked' : ''} style="width:14px;height:14px">
              ${opt.label}
            </label>
          `).join('')}
        </div>
        <p class="text-muted" style="margin-top:8px"><i class="ti ti-info-circle"></i> Automatische e-mails worden verstuurd als Gmail geconfigureerd is en de klant een e-mailadres heeft.</p>
        <button class="btn btn-primary" style="margin-top:16px" id="saveEmailAutoBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
      </div>

      <!-- ── Niches & filters ── -->
      <div class="settings-tab-pane" id="stab-niches">
        <h2 class="settings-title"><i class="ti ti-filter"></i> Niches &amp; filters</h2>

        <!-- Niche targeting -->
        <span class="settings-sublabel"><i class="ti ti-target" style="margin-right:6px"></i>Doelgroep niches</span>
        <p class="toggle-hint" style="margin:4px 0 10px">Kies welke niches én sub-niches Agent 1 mag targeten. Alles uitgevinkt = alle niches.</p>
        <div id="nicheTargetingGrid" style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">
          ${Object.entries(APP_SUB_NICHES).map(([niche, subs]) => `
            <div class="niche-target-group">
              <label class="niche-target-header">
                <input type="checkbox" class="niche-top-cb" data-niche="${niche}"
                  ${(s.targetNiches||[]).includes(niche) || !(s.targetNiches?.length) ? 'checked' : ''}>
                <span class="niche-target-name">${niche}</span>
              </label>
              <div class="niche-target-subs">
                ${subs.map(sub => `
                  <label class="sub-niche-cb-wrap">
                    <input type="checkbox" class="sub-niche-cb" data-subniche="${sub}" data-niche="${niche}"
                      ${(s.targetSubNiches||[]).includes(sub) || !(s.targetSubNiches?.length) ? 'checked' : ''}>
                    <span>${sub}</span>
                  </label>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <hr class="divider" style="margin:16px 0">

        <div class="form-grid">
          <div class="form-group">
            <label>Dagelijkse run tijd</label>
            <input type="time" id="dailyRunTime" value="${s.dailyRunTime || '09:00'}">
          </div>
          <div class="form-group">
            <label>Leads per dag</label>
            <div class="radio-group">
              ${[10,15,20].map(n => `<label class="radio-label"><input type="radio" name="leadsPerDay" value="${n}" ${s.leadsPerDay == n ? 'checked' : ''}> ${n}</label>`).join('')}
            </div>
          </div>
          <div class="form-group form-group-full">
            <span class="settings-sublabel">Slimme auto-approve <span class="text-muted" style="font-weight:400">(alle actieve voorwaarden moeten kloppen)</span></span>
            <div class="settings-panel settings-panel-flex">
              <label class="toggle-wrap">
                <input type="checkbox" id="smartAutoEnabled" ${s.smartAutoApprove?.enabled ? 'checked' : ''}>
                <span class="toggle"></span>
                <span class="toggle-label" style="font-weight:600">Auto-approve inschakelen</span>
              </label>
              <div class="auto-approve-grid">
                <div class="form-group" style="margin:0">
                  <label>Score drempel ≥ <span id="scoreVal">${s.smartAutoApprove?.scoreThreshold || s.autoApproveScore || 8.0}</span></label>
                  <input type="range" id="autoApproveScore" min="7" max="9.5" step="0.5" value="${s.smartAutoApprove?.scoreThreshold || s.autoApproveScore || 8.0}" oninput="document.getElementById('scoreVal').textContent=this.value">
                </div>
                <div class="form-group" style="margin:0">
                  <label>Minimum volgers</label>
                  <input type="number" id="smartMinFollowers" value="${s.smartAutoApprove?.minFollowers ?? 5000}" min="0" step="500">
                </div>
                <div class="form-group" style="margin:0">
                  <label class="toggle-wrap">
                    <input type="checkbox" id="smartRequireNoAds" ${s.smartAutoApprove?.requireNoAds !== false ? 'checked' : ''}>
                    <span class="toggle"></span>
                    <span class="toggle-label">Geen advertenties</span>
                  </label>
                </div>
                <div class="form-group" style="margin:0">
                  <label class="toggle-wrap">
                    <input type="checkbox" id="smartRequireWebsite" ${s.smartAutoApprove?.requireWebsite !== false ? 'checked' : ''}>
                    <span class="toggle"></span>
                    <span class="toggle-label">Heeft website</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div class="form-group">
            <label>Automatisering pauzeren</label>
            <label class="toggle-wrap">
              <input type="checkbox" id="automationPaused" ${s.automationPaused ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Gepauzeerd</span>
            </label>
          </div>
        </div>
        <hr class="divider" style="margin:16px 0">
        <div class="form-group">
          <label class="toggle-wrap">
            <input type="checkbox" id="monthlyReports" ${s.monthlyReports !== false ? 'checked' : ''}>
            <span class="toggle"></span>
            <span class="toggle-label">Automatische maandrapporten</span>
          </label>
          <p class="toggle-hint">Genereert elke 1e van de maand automatisch een rapport voor elke actieve klant en publiceert het in hun portaal</p>
        </div>
        <hr class="divider" style="margin:16px 0">
        <span class="settings-sublabel"><i class="ti ti-building" style="margin-right:6px"></i>Doelgroep bedrijfsgrootte</span>
        <p class="toggle-hint" style="margin:4px 0 10px">Leads buiten de geselecteerde groottes krijgen een lagere score (-0.5)</p>
        <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
          <label class="toggle-wrap">
            <input type="checkbox" id="sizeSmall" ${(s.targetCompanySizes||['small','medium']).includes('small') ? 'checked' : ''}>
            <span class="toggle"></span><span class="toggle-label">Klein (1–10 medewerkers)</span>
          </label>
          <label class="toggle-wrap">
            <input type="checkbox" id="sizeMedium" ${(s.targetCompanySizes||['small','medium']).includes('medium') ? 'checked' : ''}>
            <span class="toggle"></span><span class="toggle-label">Middel (10–50)</span>
          </label>
          <label class="toggle-wrap">
            <input type="checkbox" id="sizeLarge" ${(s.targetCompanySizes||[]).includes('large') ? 'checked' : ''}>
            <span class="toggle"></span><span class="toggle-label">Groot (50+)</span>
          </label>
        </div>
        <hr class="divider" style="margin:16px 0">
        <span class="settings-sublabel"><i class="ti ti-database-export" style="margin-right:6px"></i>Dagelijkse data backup</span>
        <div class="form-group" style="margin-top:10px">
          <label class="toggle-wrap">
            <input type="checkbox" id="backupEnabled" ${s.backupEnabled !== false ? 'checked' : ''}>
            <span class="toggle"></span>
            <span class="toggle-label">Automatische backup inschakelen</span>
          </label>
          <p class="toggle-hint">Maakt dagelijks een volledige backup van al je data (leads, inbox, runs, stats)</p>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-top:10px">
          <div class="form-group" style="margin:0">
            <label>Backup tijd</label>
            <input type="time" id="backupTime" value="${s.backupTime || '02:00'}" style="width:120px">
          </div>
          <div class="form-group" style="margin:0">
            <label class="toggle-wrap">
              <input type="checkbox" id="backupEmail" ${s.backupEmail !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Stuur backup als email bijlage</span>
            </label>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="triggerBackup()" id="backupNowBtn">
            <i class="ti ti-database-export"></i> Backup nu uitvoeren
          </button>
        </div>
        <div id="backupList" style="margin-top:12px"></div>
        <hr class="divider" style="margin:16px 0">
        <span class="settings-sublabel"><i class="ti ti-ban" style="margin-right:6px"></i>Blacklist</span>
        <p class="settings-note" style="margin:8px 0 12px">Geblokkeerde bedrijven, domeinen of niches worden voortaan overgeslagen bij elke run.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end">
          <select id="blType"><option value="company">Bedrijfsnaam</option><option value="domain">Domein</option><option value="niche">Niche</option></select>
          <input type="text" id="blValue" placeholder="bijv. Studio Bloom of studiodesign.nl" style="flex:1;min-width:180px">
          <input type="text" id="blReason" placeholder="Reden (optioneel)" style="flex:1;min-width:140px">
          <button class="btn btn-primary btn-sm" onclick="addBlacklistEntry()"><i class="ti ti-plus"></i> Toevoegen</button>
        </div>
        <div id="blacklistItems"></div>
        <hr class="divider" style="margin:16px 0">
        <button class="btn btn-primary" id="saveAutomationBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
      </div>

      <!-- ── Betalingen ── -->
      <div class="settings-tab-pane" id="stab-payments">
        <h2 class="settings-title"><i class="ti ti-briefcase"></i> Diensten die ik verkoop</h2>
        <div id="servicesTable" class="services-scroll">
          ${(s.services || []).map((svc, i) => `
            <div class="service-row" data-idx="${i}">
              <input type="text" class="svc-name" value="${esc(svc.name)}" placeholder="Dienst naam">
              <input type="number" class="svc-price" value="${svc.price}" placeholder="Prijs/mnd" style="width:120px">
              <input type="text" class="svc-desc" value="${esc(svc.description)}" placeholder="Beschrijving">
              <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
            </div>
          `).join('')}
        </div>
        <div class="btn-row" style="margin-top:10px">
          <button class="btn btn-ghost btn-sm" id="addServiceBtn"><i class="ti ti-plus"></i> Toevoegen</button>
          <button class="btn btn-ghost btn-sm" id="loadDefaultServicesBtn"><i class="ti ti-refresh"></i> Standaard laden</button>
          <button class="btn btn-primary" id="saveServicesBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>
        <hr class="divider" style="margin:20px 0">
        <h2 class="settings-title"><i class="ti ti-credit-card"></i> Betaalmethoden</h2>
        <p class="settings-note">Koppel één of meerdere betaalmethoden om automatisch factuurlinks te genereren voor klanten.</p>
        <div style="margin-bottom:18px">
          <span class="settings-sublabel">Standaard betaalmethode</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
            <label class="radio-card ${s.preferredPaymentMethod === 'stripe' ? 'radio-card-active' : ''}">
              <input type="radio" name="preferredPayment" value="stripe" ${s.preferredPaymentMethod === 'stripe' || !s.preferredPaymentMethod ? 'checked' : ''}>
              <i class="ti ti-brand-stripe"></i> Stripe
              ${s.stripeConfigured ? '<span class="badge badge-green" style="font-size:10px">✓</span>' : ''}
            </label>
            <label class="radio-card ${s.preferredPaymentMethod === 'mollie' ? 'radio-card-active' : ''}">
              <input type="radio" name="preferredPayment" value="mollie" ${s.preferredPaymentMethod === 'mollie' ? 'checked' : ''}>
              <i class="ti ti-credit-card"></i> Mollie
              ${s.mollieConfigured ? '<span class="badge badge-green" style="font-size:10px">✓</span>' : ''}
            </label>
            <label class="radio-card ${s.preferredPaymentMethod === 'paypal' ? 'radio-card-active' : ''}">
              <input type="radio" name="preferredPayment" value="paypal" ${s.preferredPaymentMethod === 'paypal' ? 'checked' : ''}>
              <i class="ti ti-brand-paypal"></i> PayPal
              ${s.paypalConfigured ? '<span class="badge badge-green" style="font-size:10px">✓</span>' : ''}
            </label>
          </div>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Stripe Secret Key <a href="https://dashboard.stripe.com/apikeys" target="_blank" class="link" style="font-size:11px">Waar vind ik dit?</a></label>
            <input type="password" id="stripeSecretKey" placeholder="sk_live_... of sk_test_...">
            ${s.stripeConfigured ? '<p style="font-size:11px;color:var(--success);margin-top:4px"><i class="ti ti-check"></i> Stripe ingesteld</p>' : ''}
          </div>
          <div class="form-group">
            <label>Mollie API sleutel <a href="https://my.mollie.com/dashboard/developers/api-keys" target="_blank" class="link" style="font-size:11px">Waar vind ik dit?</a></label>
            <input type="password" id="mollieApiKey" placeholder="live_... of test_...">
            ${s.mollieConfigured ? '<p style="font-size:11px;color:var(--success);margin-top:4px"><i class="ti ti-check"></i> Mollie ingesteld</p>' : ''}
          </div>
          <div class="form-group">
            <label>PayPal.me gebruikersnaam</label>
            <input type="text" id="paypalMe" value="${esc(s.paypalMe || '')}" placeholder="jouwnaam (zonder paypal.me/)">
            ${s.paypalConfigured ? '<p style="font-size:11px;color:var(--success);margin-top:4px"><i class="ti ti-check"></i> PayPal ingesteld</p>' : ''}
          </div>
        </div>
        <hr class="divider" style="margin:16px 0">
        <span class="settings-sublabel"><i class="ti ti-coin" style="margin-right:6px"></i>Automatische facturering</span>
        <label class="auto-billing-label" style="margin-top:10px">
          <input type="checkbox" id="autoInvoiceEnabled" ${s.autoInvoiceEnabled ? 'checked' : ''} style="width:14px;height:14px">
          Automatisch maandelijkse facturen aanmaken voor actieve klanten
        </label>
        <div class="auto-billing-grid">
          <div class="form-group">
            <label>Factuurdag van de maand</label>
            <select id="autoInvoiceDay">
              ${Array.from({length:28},(_,i)=>i+1).map(d=>`<option value="${d}" ${(s.autoInvoiceDay||1)===d?'selected':''}>${d}e</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Herinnering na (dagen)</label>
            <input type="number" id="paymentReminderDays" value="${s.paymentReminderDays || 7}" min="1" max="30">
          </div>
        </div>
        <p class="text-muted" style="margin-top:4px"><i class="ti ti-info-circle"></i> Herinneringen worden dagelijks om 09:00 gecheckt. Vereist een geconfigureerde betaalmethode.</p>
        <div class="btn-row" style="margin-top:16px">
          <button class="btn btn-primary" id="saveStripeBtn"><i class="ti ti-device-floppy"></i> Betaalmethoden opslaan</button>
          <button class="btn btn-ghost" id="savePaymentsAutoBtn"><i class="ti ti-device-floppy"></i> Facturering opslaan</button>
        </div>
      </div>

      <!-- ── API & integraties ── -->
      <div class="settings-tab-pane" id="stab-api">
        <h2 class="settings-title"><i class="ti ti-key"></i> API Sleutels</h2>
        <p class="settings-note">Gebruik API sleutels om externe integraties te authenticeren. Een sleutel wordt slechts <strong>één keer</strong> getoond.</p>
        <div id="apiKeysList" style="margin-bottom:16px"></div>
        <div style="display:flex;gap:10px;align-items:center">
          <input type="text" id="newKeyLabel" placeholder="Label (bijv. Zapier integratie)" style="flex:1">
          <button class="btn btn-primary btn-sm" onclick="generateApiKey()"><i class="ti ti-plus"></i> Genereer sleutel</button>
        </div>
        <div id="newKeyDisplay" class="new-key-display" style="display:none">
          <div class="new-key-title">Sla deze sleutel op — wordt niet opnieuw getoond</div>
          <div style="display:flex;align-items:center;gap:8px">
            <code id="newKeyValue" class="new-key-code"></code>
            <button class="btn btn-ghost btn-sm" onclick="copyApiKey()"><i class="ti ti-copy"></i></button>
          </div>
        </div>
      </div>

      <!-- ── Team ── -->
      ${isAdmin() ? `
      <div class="settings-tab-pane" id="stab-team">
        <h2 class="settings-title"><i class="ti ti-users"></i> Team &amp; gebruikers</h2>
        <div id="usersList" style="margin-bottom:16px"></div>
        <div class="settings-panel">
          <span class="settings-sublabel">Nieuwe gebruiker toevoegen</span>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
            <div class="form-group"><label>Naam</label><input type="text" id="newUserName" placeholder="Jan Jansen"></div>
            <div class="form-group"><label>Gebruikersnaam</label><input type="text" id="newUserUsername" placeholder="jan"></div>
            <div class="form-group"><label>Wachtwoord</label><input type="password" id="newUserPassword" placeholder="••••••••"></div>
            <div class="form-group"><label>Rol</label>
              <select id="newUserRole" class="form-select">
                <option value="employee">Medewerker</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <button class="btn btn-primary btn-sm" onclick="addUser()"><i class="ti ti-plus"></i> Gebruiker aanmaken</button>
        </div>
      </div>
      ` : ''}

      <!-- ── Gevaarlijke zone ── -->
      <div class="settings-tab-pane" id="stab-danger">
        <h2 class="settings-title" style="color:#dc2626"><i class="ti ti-alert-triangle"></i> Gevaarlijke zone</h2>
        <p class="text-secondary" style="font-size:13px;margin-bottom:20px">Deze acties zijn onomkeerbaar. Wees zeker voordat je verder gaat.</p>
        <div id="dangerZoneContent">
          <div class="btn-row">
            <button class="btn btn-danger" id="deleteLeadsBtn">Verwijder alle leads</button>
            <button class="btn btn-danger" id="resetStatsBtn">Reset statistieken</button>
          </div>
        </div>
      </div>

    </div>
  </div>
  `;

  attachSettingsHandlers(s);
  switchSettingsTab(localStorage.getItem('settingsTab') || 'account');
}

function attachSettingsHandlers(s) {
  loadBackupList();
  loadBlacklist();
  document.getElementById('saveAccountBtn').addEventListener('click', async () => {
    const body = {
      agencyName: document.getElementById('agencyName').value,
      myName: document.getElementById('myName').value,
      myTitle: document.getElementById('myTitle').value,
      username: document.getElementById('settingsUsername').value,
      currentPassword: document.getElementById('currentPassword').value || undefined,
      newPassword: document.getElementById('newPassword').value || undefined,
      websiteTagline: document.getElementById('websiteTagline')?.value,
      websiteAbout: document.getElementById('websiteAbout')?.value,
      websiteContact: document.getElementById('websiteContact')?.value
    };
    const res = await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      toast('Account opgeslagen', 'success');
      localStorage.setItem('myName', body.myName);
      document.getElementById('userName').textContent = body.myName;
      document.getElementById('userAvatar').textContent = body.myName[0].toUpperCase();
    } else {
      toast(data.error, 'error');
    }
  });

  document.getElementById('saveGmailBtn').addEventListener('click', async () => {
    const body = {
      gmailAddress: document.getElementById('gmailAddress').value,
      gmailPassword: document.getElementById('gmailPassword').value,
      replyDetection: document.getElementById('replyDetection')?.checked ?? true,
      webhookToken: document.getElementById('webhookToken')?.value || '',
      webhookConfigured: document.getElementById('webhookEnabled')?.checked ?? false
    };
    const res = await api('/api/settings/gmail', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) toast('Gmail opgeslagen', 'success');
    else toast('Opslaan mislukt', 'error');
  });

  document.getElementById('testEmailBtn').addEventListener('click', async () => {
    const btn = document.getElementById('testEmailBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Verzenden...';
    const res = await api('/api/settings/test-email', { method: 'POST' });
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-send"></i> Stuur testmail';
    if (res.ok) toast('Testmail verstuurd! Check je inbox.', 'success');
    else toast(data.error, 'error');
  });

  document.getElementById('addServiceBtn').addEventListener('click', () => {
    const table = document.getElementById('servicesTable');
    const idx = table.children.length;
    const row = document.createElement('div');
    row.className = 'service-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <input type="text" class="svc-name" placeholder="Dienst naam">
      <input type="number" class="svc-price" placeholder="Prijs/mnd" style="width:120px">
      <input type="text" class="svc-desc" placeholder="Beschrijving">
      <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
    `;
    table.appendChild(row);
  });

  document.getElementById('loadDefaultServicesBtn').addEventListener('click', async () => {
    if (!confirm('Huidige diensten vervangen door de standaard lijst van 16 diensten?')) return;
    const defaults = await apiJSON('/api/settings/services/defaults');
    if (!defaults) return toast('Laden mislukt', 'error');
    const table = document.getElementById('servicesTable');
    table.innerHTML = defaults.map((svc, i) => `
      <div class="service-row" data-idx="${i}">
        <input type="text" class="svc-name" value="${esc(svc.name)}" placeholder="Dienst naam">
        <input type="number" class="svc-price" value="${svc.price}" placeholder="Prijs/mnd" style="width:120px">
        <input type="text" class="svc-desc" value="${esc(svc.description)}" placeholder="Beschrijving">
        <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
      </div>
    `).join('');
    toast('16 standaard diensten geladen — klik Opslaan om te bewaren', 'info');
  });

  document.getElementById('saveServicesBtn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('.service-row');
    const services = Array.from(rows).map(r => ({
      name: r.querySelector('.svc-name').value,
      price: parseInt(r.querySelector('.svc-price').value) || 0,
      description: r.querySelector('.svc-desc').value
    }));
    const res = await api('/api/settings/services', { method: 'PATCH', body: JSON.stringify({ services }) });
    if (res.ok) toast('Diensten opgeslagen', 'success');
  });

  document.getElementById('saveAutomationBtn').addEventListener('click', async () => {
    const body = {
      dailyRunTime: document.getElementById('dailyRunTime').value,
      leadsPerDay: parseInt(document.querySelector('input[name="leadsPerDay"]:checked')?.value || 15),
      autoApproveScore: parseFloat(document.getElementById('autoApproveScore').value),
      automationPaused: document.getElementById('automationPaused').checked,
      dailyBriefingEnabled: document.getElementById('dailyBriefingEnabled').checked,
      dailyBriefingTime: document.getElementById('dailyBriefingTime').value,
      smartAutoApprove: {
        enabled:         document.getElementById('smartAutoEnabled').checked,
        scoreThreshold:  parseFloat(document.getElementById('autoApproveScore').value),
        requireNoAds:    document.getElementById('smartRequireNoAds').checked,
        minFollowers:    parseInt(document.getElementById('smartMinFollowers').value) || 0,
        requireWebsite:  document.getElementById('smartRequireWebsite').checked
      },
      monthlyReports: document.getElementById('monthlyReports').checked,
      backupEnabled: document.getElementById('backupEnabled').checked,
      backupTime:    document.getElementById('backupTime').value,
      backupEmail:   document.getElementById('backupEmail').checked,
      targetCompanySizes: [
        document.getElementById('sizeSmall')?.checked  ? 'small'  : null,
        document.getElementById('sizeMedium')?.checked ? 'medium' : null,
        document.getElementById('sizeLarge')?.checked  ? 'large'  : null
      ].filter(Boolean),
      targetNiches: [...document.querySelectorAll('.niche-top-cb:checked')].map(el => el.dataset.niche),
      targetSubNiches: [...document.querySelectorAll('.sub-niche-cb:checked')].map(el => el.dataset.subniche),
      autoClientEmails: {
        welcome:        document.getElementById('ace_welcome')?.checked ?? true,
        intakeReceived: document.getElementById('ace_intakeReceived')?.checked ?? true,
        deliveryReady:  document.getElementById('ace_deliveryReady')?.checked ?? true,
        weekComplete:   document.getElementById('ace_weekComplete')?.checked ?? true,
        monthlyUpdate:  document.getElementById('ace_monthlyUpdate')?.checked ?? true,
        checkIn:        document.getElementById('ace_checkIn')?.checked ?? true,
      },
      autoInvoiceEnabled:   document.getElementById('autoInvoiceEnabled')?.checked ?? false,
      autoInvoiceDay:       parseInt(document.getElementById('autoInvoiceDay')?.value || 1),
      paymentReminderDays:  parseInt(document.getElementById('paymentReminderDays')?.value || 7),
    };
    const res = await api('/api/settings/automation', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) toast('Automatisering opgeslagen', 'success');
  });

  // API Keys collapsible (all users)
  loadApiKeysList();
  document.getElementById('apiKeysToggle')?.addEventListener('click', () => {
    const c = document.getElementById('apiKeysContent');
    const ch = document.getElementById('apiKeysChevron');
    const open = c.style.display !== 'none';
    c.style.display = open ? 'none' : '';
    if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
    if (!open) loadApiKeysList();
  });

  if (isAdmin()) {
    loadUsersList();
    document.getElementById('usersToggle')?.addEventListener('click', () => {
      const c = document.getElementById('usersContent');
      const ch = document.getElementById('usersChevron');
      const open = c.style.display !== 'none';
      c.style.display = open ? 'none' : '';
      if (ch) ch.style.transform = open ? '' : 'rotate(180deg)';
    });
  }

  document.getElementById('saveWebsiteBtn')?.addEventListener('click', async () => {
    const body = {
      websiteTagline: document.getElementById('websiteTagline')?.value,
      websiteAbout:   document.getElementById('websiteAbout')?.value,
      websiteContact: document.getElementById('websiteContact')?.value
    };
    const res = await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) toast('Website opgeslagen', 'success');
    else toast('Opslaan mislukt', 'error');
  });

  document.getElementById('saveEmailAutoBtn')?.addEventListener('click', () => {
    document.getElementById('saveAutomationBtn')?.click();
  });

  document.getElementById('savePaymentsAutoBtn')?.addEventListener('click', () => {
    document.getElementById('saveAutomationBtn')?.click();
  });

  document.getElementById('saveStripeBtn').addEventListener('click', async () => {
    const stripeKey = document.getElementById('stripeSecretKey').value;
    const mollieKey = document.getElementById('mollieApiKey').value;
    const paypalMe  = document.getElementById('paypalMe').value.trim();
    const preferred = document.querySelector('input[name="preferredPayment"]:checked')?.value || 'stripe';
    const body = { preferredPaymentMethod: preferred };
    if (stripeKey) body.stripeSecretKey = stripeKey;
    if (mollieKey) body.mollieApiKey = mollieKey;
    if (paypalMe !== undefined) body.paypalMe = paypalMe;
    const res = await api('/api/settings/stripe', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) {
      toast('Betalingen opgeslagen', 'success');
      document.getElementById('stripeSecretKey').value = '';
      document.getElementById('mollieApiKey').value = '';
    } else {
      toast('Opslaan mislukt', 'error');
    }
  });

  document.getElementById('deleteLeadsBtn').addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je alle leads wilt verwijderen?')) return;
    const res = await api('/api/settings/leads', { method: 'DELETE' });
    if (res.ok) toast('Alle leads verwijderd', 'success');
  });

  document.getElementById('resetStatsBtn').addEventListener('click', async () => {
    if (!confirm('Weet je zeker dat je de statistieken wilt resetten?')) return;
    const res = await api('/api/settings/stats', { method: 'DELETE' });
    if (res.ok) { toast('Statistieken gereset', 'success'); state.stats = {}; }
  });
}

// ─── Find leads (trigger pipeline) ───────────────────────────────────────────
async function triggerFindLeads() {
  if (state.runningPipeline) return;
  state.runningPipeline = true;

  const btns = ['runNowBtn', 'runNowBtn2', 'agentRunBtn'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(btn => { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; });

  toast('Lead finder gestart — dit duurt 1-2 minuten', 'info');

  try {
    const res = await api('/api/find-leads', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      toast(`${data.found || 0} leads gevonden en toegevoegd aan inbox!`, 'success');
      updateInboxBadge(data.found || 0);
    } else {
      toast(data.error || 'Lead finder mislukt', 'error');
    }
  } catch (err) {
    toast('Fout: ' + err.message, 'error');
  } finally {
    state.runningPipeline = false;
    btns.forEach(btn => { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Run nu'; });
  }
}

// ─── Inbox badge ──────────────────────────────────────────────────────────────
function updateInboxBadge(count) {
  ['inboxBadge', 'inboxBadgeMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (count > 0) { el.textContent = count; el.style.display = ''; }
    else el.style.display = 'none';
  });
}

// ─── Time helpers ─────────────────────────────────────────────────────────────
function getLast7Days() {
  const days = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return days[d.getDay()];
  });
}

function getWeekCounts(weeklyData, labels) {
  return labels.map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().split('T')[0];
    const entry = weeklyData.find(w => w.date === key);
    return entry ? entry.count : 0;
  });
}

function getNextRunTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const diff = next - now;
  const hh = Math.floor(diff / 3600000);
  const mm = Math.floor((diff % 3600000) / 60000);
  const ss = Math.floor((diff % 60000) / 1000);
  const pad = n => String(n).padStart(2, '0');
  return {
    label: `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`,
    countdown: `${pad(hh)}:${pad(mm)}:${pad(ss)}`,
    target: next
  };
}

let countdownInterval = null;
function startCountdown(target) {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    const el = document.getElementById('countdown');
    if (!el) { clearInterval(countdownInterval); return; }
    const diff = target - Date.now();
    if (diff <= 0) { el.textContent = '00:00:00'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }, 1000);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
// ─── Dark mode ────────────────────────────────────────────────────────────────
function toggleDarkMode() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.innerHTML = `<i class="ti ti-${next === 'dark' ? 'sun' : 'moon'}"></i>`;
}

// ─── Notifications ────────────────────────────────────────────────────────────
let _notifPollTimer = null;

function startNotificationPolling() {
  if (_notifPollTimer) return;
  fetchNotifications();
  _notifPollTimer = setInterval(fetchNotifications, 30000);
}

async function fetchNotifications() {
  const data = await apiJSON('/api/notifications');
  if (!data) return;
  updateNotificationBadge(data.unread);
}

function updateNotificationBadge(count) {
  [document.getElementById('notifBadge'), document.getElementById('notifBadgeMobile')].forEach(el => {
    if (!el) return;
    el.textContent = count > 9 ? '9+' : count;
    el.style.display = count > 0 ? '' : 'none';
  });
}

async function openNotificationPanel() {
  const panel = document.getElementById('notifPanel');
  if (panel && panel.classList.contains('visible')) {
    closeNotificationPanel();
    return;
  }

  const data = await apiJSON('/api/notifications');
  if (!data) return;
  updateNotificationBadge(data.unread);

  const ICONS = {
    reply_received:   'ti-mail-opened',
    intake_submitted: 'ti-clipboard-check',
    high_score_lead:  'ti-star',
    payment_overdue:  'ti-alert-triangle',
    run_complete:     'ti-check'
  };

  const notifHTML = data.notifications.length === 0
    ? '<div class="notif-empty">Geen meldingen</div>'
    : data.notifications.map(n => `
        <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}','${n.leadId || ''}')">
          <div class="notif-icon-wrap ${n.type}">
            <i class="ti ${ICONS[n.type] || 'ti-bell'}"></i>
          </div>
          <div class="notif-content">
            <div class="notif-title">${n.title}</div>
            <div class="notif-body">${n.body}</div>
            <div class="notif-time">${relativeTime(n.createdAt)}</div>
          </div>
          ${!n.read ? '<div class="notif-dot"></div>' : ''}
        </div>`).join('');

  const headerHTML = `
    <div class="notif-panel-header">
      <span>Meldingen</span>
      ${data.unread > 0 ? `<button class="notif-read-all" onclick="markAllNotificationsRead()">Alles gelezen</button>` : ''}
    </div>`;

  if (window.innerWidth < 768) {
    openModal(`
      <div class="modal-header">
        <h3 class="modal-title">Meldingen</h3>
        ${data.unread > 0 ? `<button onclick="markAllNotificationsRead()" style="background:none;border:none;color:var(--accent);font-size:13px;font-weight:600;cursor:pointer;margin-left:auto;">Alles gelezen</button>` : ''}
      </div>
      <div style="max-height:60vh;overflow-y:auto;margin:0 -24px -24px">${notifHTML}</div>
    `);
    return;
  }

  let panelEl = document.getElementById('notifPanel');
  if (!panelEl) {
    panelEl = document.createElement('div');
    panelEl.id = 'notifPanel';
    panelEl.className = 'notif-panel';
    document.body.appendChild(panelEl);
  }
  panelEl.innerHTML = headerHTML + `<div class="notif-list">${notifHTML}</div>`;
  panelEl.style.display = '';
  requestAnimationFrame(() => panelEl.classList.add('visible'));

  setTimeout(() => document.addEventListener('click', _closeNotifOnOutsideClick), 50);
}

function _closeNotifOnOutsideClick(e) {
  const panel = document.getElementById('notifPanel');
  const btn = document.getElementById('notifBtn');
  if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
    closeNotificationPanel();
    document.removeEventListener('click', _closeNotifOnOutsideClick);
  }
}

function closeNotificationPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.classList.remove('visible');
  setTimeout(() => { if (panel) panel.style.display = 'none'; }, 200);
  document.removeEventListener('click', _closeNotifOnOutsideClick);
}

async function handleNotificationClick(id, leadId) {
  await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
  closeNotificationPanel();
  closeModal();
  if (leadId) {
    setView('leads');
    setTimeout(() => openLeadDetail(leadId), 300);
  }
  fetchNotifications();
}

async function markAllNotificationsRead() {
  await api('/api/notifications/read-all', { method: 'POST' });
  updateNotificationBadge(0);
  closeNotificationPanel();
  closeModal();
  toast('Alle meldingen als gelezen gemarkeerd');
}

document.addEventListener('DOMContentLoaded', () => {
  // Topbar clock
  function updateTopbarTime() {
    const el = document.getElementById('topbarTime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  }
  updateTopbarTime();
  setInterval(updateTopbarTime, 30000);

  // Set user name + role badge from localStorage
  const name = localStorage.getItem('myName') || 'Admin';
  const role = getRole();
  const userNameEl = document.getElementById('userName');
  const userAvatarEl = document.getElementById('userAvatar');
  const userRoleEl = document.getElementById('userRole');
  if (userNameEl) userNameEl.textContent = name;
  if (userAvatarEl) userAvatarEl.textContent = name[0].toUpperCase();
  if (userRoleEl) userRoleEl.textContent = role === 'admin' ? 'Admin' : 'Medewerker';

  // Hide admin-only nav items for employees
  if (!isAdmin()) {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
  }

  // Nav click handlers
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      setView(el.dataset.view);
    });
  });

  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', () => {
    if (confirm('Wil je uitloggen?')) logout();
  });

  // Dark mode toggle — set icon based on current theme
  const _themeBtn = document.getElementById('themeBtn');
  if (_themeBtn) {
    const _theme = document.documentElement.getAttribute('data-theme') || 'light';
    _themeBtn.innerHTML = `<i class="ti ti-${_theme === 'dark' ? 'sun' : 'moon'}"></i>`;
    _themeBtn.addEventListener('click', toggleDarkMode);
  }

  // Notification bell
  document.getElementById('notifBtn')?.addEventListener('click', openNotificationPanel);
  document.getElementById('notifBtnMobile')?.addEventListener('click', openNotificationPanel);
  startNotificationPolling();

  // Service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Load initial view
  setView('dashboard');

  // Check for new replies and show toasts
  (async () => {
    const res = await api('/api/replies/new');
    if (res?.ok) {
      const data = await res.json();
      (data.newReplies || []).forEach((name, i) => {
        setTimeout(() => toast(`💬 ${name} heeft gereageerd!`, 'success'), 600 + i * 1500);
      });
    }
  })().catch(() => {});
});
