// ─── Auth guard — runs after DOM is ready so localStorage is fully committed ──
document.addEventListener('DOMContentLoaded', async () => {
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
});

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
  agents: 'Agents', runs: 'Runs', stats: 'Statistieken', chat: 'Chat', settings: 'Instellingen',
  project: 'Project', contacts: 'Contacten'
};

function setView(view) {
  // Stop chat polling when leaving chat view
  if (state.view === 'chat' && view !== 'chat' && state._chatPollTimer) {
    clearInterval(state._chatPollTimer);
    state._chatPollTimer = null;
  }
  // Destroy Chart.js instances when leaving stats view
  if (state.view === 'stats' && view !== 'stats') destroyStatsCharts();
  // Stop run progress polling when leaving runs view
  if (state.view === 'runs' && view !== 'runs') stopRunProgressPoll();
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
    settings:  renderSettings,
    project:   renderProjectPage,
    contacts:  renderContacts
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

function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) +
    ' om ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function formatOptimalTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  return `${days[d.getDay()]} om ${String(d.getHours()).padStart(2,'0')}:00`;
}
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text).then(() => toast(successMsg || 'Gekopieerd!')).catch(() => toast('Kopiëren mislukt', 'error'));
}

async function openManualEmailModal(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  openModal(`
    <div class="modal-header">
      <strong>Handmatige email</strong>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:0 0 16px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Aan: ${esc(lead.contactEmail || '—')}</div>
      <div class="form-group">
        <label>Onderwerp</label>
        <input type="text" id="manualEmailSubject" class="form-control" placeholder="Onderwerp..." style="width:100%">
      </div>
      <div class="form-group" style="margin-top:12px">
        <label>Inhoud</label>
        <textarea id="manualEmailBody" class="form-control" rows="8" placeholder="Schrijf je email..." style="width:100%;resize:vertical"></textarea>
      </div>
      <div id="manualEmailError" style="color:var(--danger);font-size:12px;margin-top:8px;display:none"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="sendManualEmail('${leadId}')"><i class="ti ti-send"></i> Versturen</button>
    </div>
  `);
}

async function sendManualEmail(leadId) {
  const subject = document.getElementById('manualEmailSubject')?.value?.trim();
  const body    = document.getElementById('manualEmailBody')?.value?.trim();
  const errEl   = document.getElementById('manualEmailError');
  if (!subject || !body) {
    if (errEl) { errEl.textContent = 'Vul onderwerp en inhoud in.'; errEl.style.display = 'block'; }
    return;
  }
  const btn = document.querySelector('#modalContainer .btn-primary');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res = await api(`/api/leads/${leadId}/manual-email`, { method: 'POST', body: JSON.stringify({ subject, body }) });
  if (!res || !res.ok) {
    const data = res ? await res.json() : {};
    if (errEl) { errEl.textContent = data.error || 'Versturen mislukt.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Versturen'; }
    return;
  }
  closeModal();
  toast('Email verstuurd!');
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) {
    state.leads[idx].clientEmailLog = state.leads[idx].clientEmailLog || [];
    state.leads[idx].clientEmailLog.push({ trigger: 'manual', subject, sentAt: new Date().toISOString() });
    renderProjectPage();
  }
}

function copyLinkedinDm(text, cardId) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById(`li-copy-${cardId}`);
    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = '<i class="ti ti-check"></i> Gekopieerd!';
      btn.style.color = 'var(--success)';
      setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 2000);
    }
  }).catch(() => toast('Kopiëren mislukt', 'error'));
}

function quickFollowup(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.contactEmail) { toast('Lead heeft geen email adres', 'error'); return; }
  openManualEmailModal(leadId);
}

async function quickDeleteLead(leadId, companyName) {
  if (!confirm(`Lead "${companyName}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
  const res = await api(`/api/leads/${leadId}`, { method: 'DELETE' });
  if (!res || !res.ok) { toast('Verwijderen mislukt', 'error'); return; }
  state.leads = state.leads.filter(l => l.id !== leadId);
  toast(`${companyName} verwijderd`);
  renderPipeline();
}

async function changeLeadStatus(leadId, newStatus) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead || lead.status === newStatus) return;
  const oldLabel = STATUS_LABELS[lead.status] || lead.status;
  const newLabel = STATUS_LABELS[newStatus] || newStatus;
  const res = await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus, statusChangedAt: new Date().toISOString() })
  });
  if (!res || !res.ok) { toast('Status wijzigen mislukt', 'error'); renderProjectPage(); return; }
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].status = newStatus;
  toast(`Status: ${oldLabel} → ${newLabel}`);
  renderProjectPage();
}

function startEditEmail(leadId, currentEmail) {
  document.getElementById(`emailDisplayRow-${leadId}`).style.display = 'none';
  const row = document.getElementById(`emailEditRow-${leadId}`);
  row.style.display = 'flex';
  const input = document.getElementById(`emailEditInput-${leadId}`);
  input.value = currentEmail;
  input.focus();
  input.select();
  input.onkeydown = (e) => {
    if (e.key === 'Enter') saveLeadEmail(leadId);
    if (e.key === 'Escape') cancelEditEmail(leadId);
  };
}

function cancelEditEmail(leadId) {
  document.getElementById(`emailDisplayRow-${leadId}`).style.display = '';
  document.getElementById(`emailEditRow-${leadId}`).style.display = 'none';
}

async function saveLeadEmail(leadId) {
  const input = document.getElementById(`emailEditInput-${leadId}`);
  const email = input?.value?.trim() || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    input.style.borderColor = 'var(--danger)';
    toast('Ongeldig email adres', 'error');
    return;
  }
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ contactEmail: email }) });
  if (!res || !res.ok) { toast('Opslaan mislukt', 'error'); return; }
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].contactEmail = email;
  toast('Email opgeslagen');
  renderProjectPage();
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
  updateInboxBadge(pending);

  const settings = await apiJSON('/api/settings');
  state.settings = settings || {};
  updateSidebarLogo(settings?.agencyLogo || '');

  const nextRun = getNextRunTime(settings?.dailyRunTime || '09:00');
  const recentRuns = (runs || []).slice(0, 10);

  const weekLabels = getLast7Days();
  const weekCounts = getWeekCounts(stats.weeklyData || [], weekLabels);

  document.getElementById('dashboardContent').innerHTML = `
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
}

// ─── Inbox ────────────────────────────────────────────────────────────────────
async function renderInbox() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Beoordelen</div>
        <h1 class="page-title">Inbox</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="inbox-kb-legend" title="Toetsenbordsnelkoppelingen">
          <span class="kb-key">A</span><span class="kb-hint">Goedkeuren</span>
          <span class="kb-key">R</span><span class="kb-hint">Afwijzen</span>
          <span class="kb-key">E</span><span class="kb-hint">Email</span>
          <span class="kb-key">S</span><span class="kb-hint">Volgende</span>
          <span class="kb-key">↑↓</span><span class="kb-hint">Navigeren</span>
        </div>
        <button class="btn btn-secondary btn-sm" id="checkRepliesBtn" onclick="triggerReplyCheck()" title="Controleer Gmail inbox nu op nieuwe replies">
          <i class="ti ti-mail-forward"></i> Controleer replies
        </button>
      </div>
    </div>
    <div id="swipeHint" style="display:none">
      <i class="ti ti-hand-finger"></i>
      <span>Swipe rechts = goedkeuren &nbsp;·&nbsp; swipe links = afwijzen</span>
      <button onclick="dismissSwipeHint()" aria-label="Sluiten"><i class="ti ti-x"></i></button>
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

  if (!settings.resendConfigured) {
    container.innerHTML += `
      <div class="alert-banner alert-banner-amber" onclick="setView('settings');setTimeout(()=>document.querySelector('[data-tab=email]')?.click(),100)" style="cursor:pointer;margin-bottom:20px">
        <i class="ti ti-mail-off" style="font-size:16px"></i>
        <strong>Email niet ingesteld</strong>
        <span style="color:var(--text-secondary);font-weight:400">— voeg RESEND_API_KEY toe om emails te versturen. Klik om in te stellen &rarr;</span>
      </div>
    `;
  }

  if (pending.length === 0) {
    const nextRun = getNextRunTime(state.settings?.dailyRunTime || '09:00');
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-inbox-off" style="font-size:48px;color:var(--border);margin-bottom:12px"></i>
        <h3 style="margin-bottom:8px">Inbox is leeg</h3>
        <p style="color:var(--text-secondary);margin-bottom:20px">Alle leads zijn beoordeeld — goed gedaan!</p>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:20px;text-align:left;min-width:260px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Volgende automatische run</div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${nextRun.label}</div>
          <div style="font-size:12px;color:var(--accent);font-weight:600;margin-top:4px" id="inboxCountdown">${nextRun.countdown}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" onclick="setView('runs')">
            <i class="ti ti-player-play"></i> Start handmatige run
          </button>
          <button class="btn btn-outline" onclick="setView('pipeline')">
            <i class="ti ti-git-branch"></i> Bekijk pipeline →
          </button>
        </div>
      </div>
    `;
    startInboxCountdown(nextRun.target);
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
      <button class="btn btn-ghost btn-sm bulk-decline-all" onclick="bulkDeclineAll()" style="color:var(--danger);border-color:var(--danger)">
        <i class="ti ti-x"></i> Alle afwijzen
      </button>
      <button class="btn btn-ghost btn-sm" onclick="bulkSelectAll()"><i class="ti ti-checkbox"></i> Alles selecteren</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkDeselectAll()"><i class="ti ti-square"></i> Deselecteren</button>
      <button class="btn btn-blue btn-sm" id="bulkApproveSelBtn" style="display:none" onclick="bulkApproveSelected()">
        <i class="ti ti-check"></i> Geselecteerde goedkeuren (<span id="bulkSelCount">0</span>)
      </button>
      <button class="btn btn-sm" id="bulkDeclineSelBtn" style="display:none;background:var(--danger);color:#fff" onclick="bulkDeclineSelected()">
        <i class="ti ti-x"></i> Geselecteerde afwijzen (<span id="bulkDeclineCount">0</span>)
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
          ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="emptyTrash()" style="margin-left:auto;color:var(--danger)">
            <i class="ti ti-trash"></i> Alles verwijderen
          </button>` : ''}
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
              ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="deleteTrash('${item.id}')" style="color:var(--danger)">
                <i class="ti ti-trash"></i>
              </button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
  attachInboxHandlers();
  initSwipeHandlers();
  initInboxKeyboard();
}

function buildLinkedinDmCard(item) {
  const charCount = (item.linkedinDm || '').length;
  const dmEsc = esc(item.linkedinDm || '');
  const dmRaw = (item.linkedinDm || '').replace(/`/g, '\\`');
  return `
    <div class="inbox-card linkedin-dm-card" data-id="${item.id}" id="card-${item.id}">
      <div class="linkedin-dm-header">
        <span class="linkedin-dm-badge"><i class="ti ti-brand-linkedin"></i> LinkedIn DM — dag 7</span>
        <span class="linkedin-dm-company">${esc(item.companyName)}</span>
        <span class="linkedin-dm-meta">${esc(item.location)} &middot; score ${(item.score||0).toFixed(1)}</span>
      </div>
      <div class="linkedin-dm-body">${dmEsc.replace(/\n/g, '<br>')}</div>
      <div class="linkedin-dm-footer">
        <span class="char-count" style="font-size:11px;color:var(--text-muted)">${charCount}/280 tekens</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="li-copy-${item.id}" onclick="copyLinkedinDm(\`${dmRaw}\`,'${item.id}')">
            <i class="ti ti-copy"></i> Kopiëren
          </button>
          <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(item.companyName || '')}" target="_blank" rel="noopener" title="Zoek op LinkedIn">
            <i class="ti ti-brand-linkedin"></i> Zoeken
          </a>
          ${item.linkedinUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(item.linkedinUrl)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Profiel</a>` : ''}
          <button class="btn btn-primary btn-sm" onclick="markLinkedinDmSent('${item.id}')">
            <i class="ti ti-check"></i> Verstuurd
          </button>
        </div>
      </div>
    </div>`;
}

function buildAiReplyCard(item) {
  const draftRaw = (item.aiDraft || '').replace(/`/g, '\\`');
  const lead = (state.leads || []).find(l => l.id === item.leadId);
  const alreadyClient  = lead?.status === 'client';
  const projectStarted = !!(lead?.projectStartedAt);

  const startProjectBtn = (!alreadyClient && !projectStarted)
    ? `<button class="btn btn-sm" style="background:#6366f1;color:#fff;border:none" onclick="startProjectFromInbox('${esc(item.id)}','${esc(item.leadId)}')">
         🚀 Start project
       </button>`
    : projectStarted
      ? `<span style="font-size:12px;background:#dcfce7;color:#166534;border-radius:6px;padding:4px 10px;font-weight:600">✓ Project gestart</span>`
      : '';

  return `
    <div class="inbox-card ai-reply-card" data-id="${item.id}" id="card-${item.id}">
      <div class="ai-reply-header">
        <span class="ai-reply-badge"><i class="ti ti-message-reply"></i> Reply ontvangen — AI antwoord klaar</span>
        <span class="ai-reply-company">${esc(item.companyName)}</span>
      </div>

      <div class="ai-reply-section">
        <div class="ai-reply-label"><i class="ti ti-quote"></i> Hun antwoord</div>
        <div class="ai-reply-original">${esc(item.originalReply || '(geen tekst gelezen)').replace(/\n/g, '<br>')}</div>
      </div>

      <div class="ai-reply-section">
        <div class="ai-reply-label"><i class="ti ti-robot"></i> AI antwoord concept</div>
        <textarea class="ai-reply-draft" id="aiDraft-${item.id}" rows="5">${esc(item.aiDraft || '')}</textarea>
      </div>

      <div class="ai-reply-actions">
        <button class="btn btn-ghost btn-sm" onclick="disapprove('${item.id}')">
          <i class="ti ti-x"></i> Overslaan
        </button>
        <button class="btn btn-primary btn-sm" onclick="sendAiReply('${item.id}')">
          <i class="ti ti-send"></i> Verstuur antwoord
        </button>
        ${startProjectBtn}
      </div>
    </div>`;
}

window.startProjectFromInbox = function(itemId, leadId) {
  console.log('[InboxStart] clicked, leadId:', leadId);
  console.log('[InboxStart] modal fn:', typeof openProjectConfigModal);
  window._inboxProjectStart = { itemId, leadId };
  openProjectConfigModal(leadId, false);
};


async function sendAiReply(id) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item) return;
  const draftEl = document.getElementById('aiDraft-' + id);
  const draft   = draftEl ? draftEl.value.trim() : item.aiDraft;
  if (!draft) return toast('Geen antwoord ingevuld', 'error');

  const card = document.getElementById('card-' + id);
  if (card) card.style.opacity = '0.5';

  try {
    const res = await api('/api/inbox/' + id + '/approve', {
      method: 'PATCH',
      body: JSON.stringify({ aiDraft: draft })
    });
    if (!res.ok) {
      const d = await res.json();
      toast(d.error || 'Verzenden mislukt', 'error');
      if (card) card.style.opacity = '';
      return;
    }
    state.inbox = (state.inbox || []).filter(i => i.id !== id);
    if (card) {
      card.style.transition = 'opacity 0.3s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
    }
    toast(`AI antwoord verstuurd naar ${item.companyName}`, 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (card) card.style.opacity = '';
  }
}

function buildInboxCard(item) {
  // LinkedIn DM cards get a dedicated compact layout
  if (item.type === 'linkedinDm') return buildLinkedinDmCard(item);
  if (item.type === 'ai_reply')   return buildAiReplyCard(item);

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
  const langFlag = item.language === 'nl' ? '🇳🇱' : item.language === 'en' ? '🇬🇧' : item.language === 'de' ? '🇩🇪' : item.language === 'fr' ? '🇫🇷' : item.language === 'it' ? '🇮🇹' : '';

  // Email duplicate check: flag if this email already received outreach on another lead
  const emailAlreadySent = item.contactEmail && (state.leads || []).some(l =>
    l.id !== item.leadId &&
    (l.contactEmail || '').toLowerCase() === item.contactEmail.toLowerCase() &&
    ['sent', 'replied', 'client', 'scheduled'].includes(l.status)
  );

  return `
    <div class="inbox-card" data-id="${item.id}" id="card-${item.id}" data-selected-version="A">
      <label class="inbox-checkbox-wrap" onclick="event.stopPropagation()">
        <input type="checkbox" class="bulk-checkbox" data-id="${item.id}" onchange="updateBulkSelCount()">
      </label>

      <div class="inbox-card-header">
        <div class="inbox-card-title-row">
          <h3 class="inbox-company">${esc(item.companyName)}${langFlag ? ` <span class="lang-flag">${langFlag}</span>` : ''}</h3>
          ${typeBadge}
          ${item.emailBounced ? `<span class="badge badge-red" style="font-size:10px"><i class="ti ti-mail-off"></i> Gebounced</span>` : ''}
          ${emailAlreadySent ? `<span class="badge badge-amber" style="font-size:10px" title="Dit e-mailadres werd al gebruikt voor een andere lead"><i class="ti ti-alert-triangle"></i> Al gecontacteerd</span>` : ''}
          ${item.status === 'auto-approved' ? `<span class="badge badge-green" style="font-size:10px"><i class="ti ti-bolt"></i> Auto-goedgekeurd</span>` : ''}
          ${item.leadSource === 'instagram' ? `<span class="badge" style="font-size:10px;background:#fce7f3;color:#be185d;border:1px solid #fbcfe8"><i class="ti ti-brand-instagram"></i> Instagram</span>` : ''}
          ${item.leadSource === 'maps' ? `<span class="badge" style="font-size:10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe"><i class="ti ti-map-pin"></i> Google Maps</span>` : ''}
        </div>
        <div class="inbox-card-meta">
          ${nicheBadge(item.niche)}
          ${item.subNiche ? `<span class="sub-niche-pill">${esc(item.subNiche)}</span>` : ''}
          <span class="text-secondary" style="font-size:12px"><i class="ti ti-map-pin"></i> ${esc(item.location || '—')}</span>
          ${item.websiteUrl ? `<a href="${item.websiteUrl}" target="_blank" class="link" style="font-size:12px"><i class="ti ti-world"></i> Website</a>` : ''}
        </div>
        <div class="inbox-email-row">
          ${item.emailVerified
            ? `<span class="inbox-email-addr"><i class="ti ti-mail"></i> ${esc(item.contactEmail)}</span>
               <span class="email-src-badge email-src-found"><i class="ti ti-check"></i> Geverifieerd</span>`
            : item.contactEmail
            ? `<span class="inbox-email-addr"><i class="ti ti-mail"></i> ${esc(item.contactEmail)}</span>
               <span class="email-src-badge email-src-guess"><i class="ti ti-alert-triangle"></i> Niet geverifieerd</span>`
            : `<div class="inbox-email-missing">
                 <span class="inbox-email-none"><i class="ti ti-mail-off"></i> Geen email gevonden op website</span>
                 <input type="email" class="manual-email-input" id="manualEmail-${item.id}"
                   placeholder="Voer email handmatig in..."
                   onclick="event.stopPropagation()"
                   oninput="event.stopPropagation()">
               </div>`}
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
                <span class="service-price">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span>
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
            <div class="inbox-section-title" style="margin-bottom:0"><i class="ti ti-test-pipe" style="color:var(--accent)"></i> A/B email versies — klik om te kiezen</div>
          </div>
          <div class="inbox-ab-compare">
            <div class="inbox-ab-ver selected" id="abVerA-${item.id}" onclick="selectVersion('${item.id}','A')">
              <div class="inbox-ab-ver-top"><span class="inbox-ab-ver-label">A</span><span class="inbox-ab-ver-desc">Probleem-gericht</span></div>
              <div class="inbox-ab-ver-subject">${esc(item.emailA.subject)}</div>
              <div class="inbox-ab-ver-preview">${esc((item.emailA.body || '').replace(/<[^>]+>/g,'').slice(0,130))}…</div>
            </div>
            <div class="inbox-ab-ver" id="abVerB-${item.id}" onclick="selectVersion('${item.id}','B')">
              <div class="inbox-ab-ver-top"><span class="inbox-ab-ver-label">B</span><span class="inbox-ab-ver-desc">Groeikansen-gericht</span></div>
              <div class="inbox-ab-ver-subject">${esc(item.emailB.subject)}</div>
              <div class="inbox-ab-ver-preview">${esc((item.emailB.body || '').replace(/<[^>]+>/g,'').slice(0,130))}…</div>
            </div>
          </div>
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
          ${state.settings?.calendlyUrl ? `<a class="btn btn-ghost btn-sm calendly-btn" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener"><i class="ti ti-calendar-event"></i> Plan gesprek</a>` : ''}
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
  const verA = document.getElementById('abVerA-' + id);
  const verB = document.getElementById('abVerB-' + id);
  if (verA) verA.classList.toggle('selected', version === 'A');
  if (verB) verB.classList.toggle('selected', version === 'B');
}

function initSwipeHandlers() {
  const THRESHOLD = 90;

  // One-time swipe hint
  if (!localStorage.getItem('swipeHintDismissed')) {
    const hint = document.getElementById('swipeHint');
    if (hint) hint.style.display = 'flex';
  }

  document.querySelectorAll('.inbox-card').forEach(card => {
    // Inject overlay layers once
    if (!card.querySelector('.swipe-overlay-approve')) {
      const ok = document.createElement('div');
      ok.className = 'swipe-overlay swipe-overlay-approve';
      ok.innerHTML = '<i class="ti ti-check"></i> Goedkeuren';
      card.appendChild(ok);

      const no = document.createElement('div');
      no.className = 'swipe-overlay swipe-overlay-reject';
      no.innerHTML = '<i class="ti ti-x"></i> Afwijzen';
      card.appendChild(no);
    }

    let startX = 0, startY = 0, swiping = false, locked = false;
    const id = card.dataset.id;

    card.addEventListener('touchstart', e => {
      if (locked) return;
      startX   = e.touches[0].clientX;
      startY   = e.touches[0].clientY;
      swiping  = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (locked) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!swiping && Math.abs(dy) > Math.abs(dx) + 5) return; // vertical scroll
      swiping = true;

      const progress   = Math.min(Math.abs(dx) / THRESHOLD, 1);
      const okEl       = card.querySelector('.swipe-overlay-approve');
      const noEl       = card.querySelector('.swipe-overlay-reject');

      card.style.transition = 'none';
      card.style.transform  = `translateX(${dx}px)`;

      if (dx > 0) {
        card.style.boxShadow = `0 0 0 2px rgba(22,163,74,${progress * 0.6})`;
        if (okEl) okEl.style.opacity = String(progress);
        if (noEl) noEl.style.opacity = '0';
      } else {
        card.style.boxShadow = `0 0 0 2px rgba(220,38,38,${progress * 0.6})`;
        if (noEl) noEl.style.opacity = String(progress);
        if (okEl) okEl.style.opacity = '0';
      }

      if (Math.abs(dx) >= THRESHOLD) navigator.vibrate?.(8);
    }, { passive: true });

    card.addEventListener('touchend', e => {
      if (locked || !swiping) { resetSwipeCard(card); return; }
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > THRESHOLD) {
        locked = true;
        dismissSwipeHint();
        swipeCardOff(card, 'right', () => approve(id));
      } else if (dx < -THRESHOLD) {
        locked = true;
        dismissSwipeHint();
        swipeCardOff(card, 'left', () => disapprove(id));
      } else {
        resetSwipeCard(card);
      }
    }, { passive: true });
  });
}

function resetSwipeCard(card) {
  card.style.transition  = 'transform 0.35s cubic-bezier(.25,.46,.45,.94), box-shadow 0.35s';
  card.style.transform   = '';
  card.style.boxShadow   = '';
  card.querySelectorAll('.swipe-overlay').forEach(el => { el.style.opacity = '0'; });
}

function swipeCardOff(card, direction, cb) {
  const vw = window.innerWidth || 400;
  card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  card.style.transform  = `translateX(${direction === 'right' ? vw + 60 : -(vw + 60)}px)`;
  card.style.opacity    = '0';
  setTimeout(cb, 300);
}

// ─── Push notifications ────────────────────────────────────────────────────────
async function initPushNotifications(reg) {
  if (!('PushManager' in window)) return;
  const { publicKey } = await apiJSON('/api/push/vapid-public-key').catch(() => ({}));
  if (!publicKey) return;
  window._vapidPublicKey = publicKey;

  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    window._pushSubscription = existing;
    updatePushBtn(true);
  } else {
    updatePushBtn(false);
  }
}

function updatePushBtn(subscribed) {
  document.querySelectorAll('.push-toggle-btn').forEach(btn => {
    btn.dataset.subscribed = subscribed ? '1' : '0';
    btn.innerHTML = subscribed
      ? '<i class="ti ti-bell-off"></i> Notificaties uit'
      : '<i class="ti ti-bell-ringing"></i> Notificaties aan';
    btn.title = subscribed ? 'Push notificaties uitschakelen' : 'Push notificaties inschakelen';
  });
}

async function togglePushSubscription() {
  if (!('PushManager' in window) || !window._swReg) {
    toast('Push notificaties worden niet ondersteund door deze browser', 'error');
    return;
  }
  const btn = document.querySelector('.push-toggle-btn');
  const subscribed = btn?.dataset.subscribed === '1';

  if (subscribed && window._pushSubscription) {
    await window._pushSubscription.unsubscribe();
    await api('/api/push/unsubscribe', { method: 'DELETE', body: JSON.stringify({ endpoint: window._pushSubscription.endpoint }) });
    window._pushSubscription = null;
    updatePushBtn(false);
    toast('Push notificaties uitgeschakeld', 'info');
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Toestemming geweigerd — sta notificaties toe in je browser', 'error');
    return;
  }
  try {
    const sub = await window._swReg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(window._vapidPublicKey)
    });
    window._pushSubscription = sub;
    await api('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    updatePushBtn(true);
    toast('Push notificaties ingeschakeld!', 'success');
  } catch (err) {
    toast('Kon niet abonneren op push notificaties', 'error');
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

function dismissSwipeHint() {
  localStorage.setItem('swipeHintDismissed', '1');
  const hint = document.getElementById('swipeHint');
  if (hint) { hint.style.opacity = '0'; setTimeout(() => hint.remove(), 300); }
}

// ─── Inbox keyboard shortcuts ─────────────────────────────────────────────────
let _inboxKbListener = null;

function initInboxKeyboard() {
  if (_inboxKbListener) document.removeEventListener('keydown', _inboxKbListener);

  _inboxKbListener = function(e) {
    if (state.view !== 'inbox') return;
    // Don't fire when typing in inputs/textareas
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    // Don't fire when a modal is open
    if (document.getElementById('modal')?.style.display !== 'none' &&
        document.getElementById('modal')?.style.display !== '') return;

    const cards = [...document.querySelectorAll('#inboxContent .inbox-card:not([style*="opacity: 0"])')]
      .filter(c => !c.closest('.trash-section'));

    if (!cards.length) return;

    let idx = cards.findIndex(c => c.classList.contains('kb-focused'));
    if (idx === -1) idx = 0;

    switch (e.key) {
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        setInboxFocus(cards, Math.min(idx + 1, cards.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setInboxFocus(cards, Math.max(idx - 1, 0));
        break;
      case 'a':
      case 'A':
        if (cards[idx]) { approve(cards[idx].dataset.id); clearInboxFocus(cards); }
        break;
      case 'r':
      case 'R':
        if (cards[idx]) { disapprove(cards[idx].dataset.id); clearInboxFocus(cards); }
        break;
      case 'e':
      case 'E':
        if (cards[idx]) viewEmail(cards[idx].dataset.id);
        break;
    }
  };

  document.addEventListener('keydown', _inboxKbListener);
  // Focus first card automatically
  const cards = [...document.querySelectorAll('#inboxContent .inbox-card')]
    .filter(c => !c.closest('.trash-section'));
  if (cards.length) setInboxFocus(cards, 0);
}

function setInboxFocus(cards, idx) {
  cards.forEach((c, i) => c.classList.toggle('kb-focused', i === idx));
  cards[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearInboxFocus(cards) {
  cards.forEach(c => c.classList.remove('kb-focused'));
}

async function markLinkedinDmSent(id) {
  const card = document.getElementById('card-' + id);
  await api(`/api/inbox/${id}/approve`, { method: 'PATCH' });
  toast('LinkedIn DM gemarkeerd als verstuurd', 'success');
  if (card) {
    card.style.transition = 'all 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 320);
  }
}

async function triggerReplyCheck() {
  const btns = ['checkRepliesBtn', 'dashCheckRepliesBtn'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; b.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; });
  try {
    const data = await apiJSON('/api/check-replies', { method: 'POST' });
    const found = data?.found ?? 0;
    const names = data?.names || [];
    if (found === 0) {
      toast('Geen nieuwe replies', 'info');
    } else if (names.length === 1) {
      toast(`Nieuwe reply gevonden van ${names[0]}!`, 'success');
    } else {
      names.forEach(name => toast(`Nieuwe reply gevonden van ${name}!`, 'success'));
    }
    if (found > 0 && state.view === 'inbox') renderInbox();
  } catch (err) {
    toast('Reply check mislukt: ' + err.message, 'error');
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      b.innerHTML = b.id === 'dashCheckRepliesBtn'
        ? '<i class="ti ti-mail-forward"></i> Controleer replies nu'
        : '<i class="ti ti-mail-forward"></i> Controleer replies';
    });
  }
}

async function approve(id, opts = {}) {
  if (!state.settings?.resendConfigured) {
    openModal(`
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:40px;margin-bottom:12px">✉️</div>
        <h3 style="margin:0 0 8px;font-size:18px">Email niet ingesteld</h3>
        <p style="color:var(--text-secondary);margin:0 0 20px;font-size:14px">Stel eerst Resend in voordat je emails kunt versturen.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
          <button class="btn btn-primary" onclick="closeModal();setView('settings');setTimeout(()=>document.querySelector('[data-tab=email]')?.click(),100)">
            <i class="ti ti-settings"></i> Naar Instellingen
          </button>
        </div>
      </div>
    `);
    return;
  }

  const item = state.inbox?.find(i => i.id === id);

  // FIX: validate email before sending
  if (!opts.force) {
    const manualEmailEl = document.getElementById('manualEmail-' + id);
    const manualEmail   = manualEmailEl?.value?.trim() || '';
    if (!item?.emailVerified && !item?.contactEmail && !manualEmail) {
      // No email at all — require manual input
      if (manualEmailEl) manualEmailEl.focus();
      toast('Voer eerst een email adres in', 'error');
      return;
    }
    if (!item?.emailVerified && item?.contactEmail && !opts.confirmed) {
      // Email exists but not scraped from site — show warning
      openModal(`
        <div style="text-align:center;padding:8px 0">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <h3 style="margin:0 0 8px;font-size:17px">Email niet geverifieerd</h3>
          <p style="color:var(--text-secondary);margin:0 0 6px;font-size:13px">Dit email adres is <strong>niet gevonden op de website</strong> en is mogelijk onjuist:</p>
          <code style="display:block;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;margin:0 0 16px;font-size:13px">${esc(item.contactEmail)}</code>
          <p style="color:var(--text-secondary);margin:0 0 20px;font-size:13px">Weet je zeker dat je wilt versturen?</p>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
            <button class="btn btn-primary" onclick="closeModal(); approve('${id}', {force:true})">
              <i class="ti ti-send"></i> Toch versturen
            </button>
          </div>
        </div>
      `);
      return;
    }
  }

  const card = document.getElementById('card-' + id);
  if (card) { card.style.transition = 'all 0.3s'; card.style.background = '#f0fdf4'; card.style.borderColor = '#10b981'; }
  const version = card?.dataset.selectedVersion || 'A';

  const manualEmail = document.getElementById('manualEmail-' + id)?.value?.trim() || undefined;
  const body = { version, ...(manualEmail ? { manualEmail } : {}) };
  const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Goedkeuren mislukt', 'error');
    card.style.background = '';
    card.style.borderColor = '';
    return;
  }

  if (data.emailDuplicateWarning) {
    toast(`Waarschuwing: ${esc(data.emailDuplicateWarning.companyName)} heeft hetzelfde e-mailadres (status: ${data.emailDuplicateWarning.status})`, 'warning');
  } else {
    toast('Email verstuurd! ✓', 'success');
  }
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
      <h3>LinkedIn DM — ${esc(item.companyName)}</h3>
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

// ─── Proposal generator (new modal-based PDF system) ─────────────────────────

window._proposalModalState = {};

function openProposalModal(leadId) {
  const lead    = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const allSvcs = (state.settings?.services || []);
  const leadSvcNames = (lead.projectServices || lead.services || []).map(s => typeof s === 'string' ? s : (s.name || ''));
  const validUntil   = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  window._proposalModalState[leadId] = {
    rows: allSvcs.map(svc => ({
      name:        svc.name || '',
      price:       parseFloat(svc.price) || 0,
      billing:     svc.billing || 'maandelijks',
      description: svc.description || '',
      checked:     leadSvcNames.includes(svc.name)
    })),
    btwEnabled:          !!(state.settings?.btwEnabled),
    btwRate:             parseFloat(state.settings?.btwRate) || 21,
    generatedProposalId: null
  };

  const ms = window._proposalModalState[leadId];

  openModal(`
    <div style="padding:4px 0 8px">
      <h3 style="margin:0 0 3px;font-size:17px;font-weight:700;color:var(--text-primary)"><i class="ti ti-file-text" style="color:var(--accent);margin-right:8px"></i>Voorstel genereren</h3>
      <p style="margin:0 0 20px;font-size:13px;color:var(--text-secondary)">${esc(lead.companyName)}</p>

      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Diensten selecteren</div>
      <div id="proposalRows-${leadId}" style="max-height:260px;overflow-y:auto;border:1px solid var(--border);border-radius:8px">
        ${_buildProposalRowsHtml(leadId)}
      </div>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:16px;margin-top:10px;padding:10px 12px;background:var(--surface-2);border-radius:8px;font-size:13px;flex-wrap:wrap">
        <span style="color:var(--text-secondary)">Subtotaal: <strong id="proposalSubtotal-${leadId}">€0,00</strong></span>
        <span id="proposalBtwRow-${leadId}" style="color:var(--text-secondary);display:none">BTW: <strong id="proposalBtwAmt-${leadId}">€0,00</strong></span>
        <span style="font-weight:700">Totaal: <strong id="proposalTotal-${leadId}" style="color:var(--accent)">€0,00</strong></span>
      </div>

      <div style="margin:18px 0;display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:end">
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Geldig tot</label>
          <input type="date" id="proposalValidUntil-${leadId}" value="${validUntil}" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;background:var(--surface);color:var(--text-primary)">
        </div>
        <div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary);padding-bottom:8px">
            <input type="checkbox" id="proposalBtwToggle-${leadId}" ${ms.btwEnabled ? 'checked' : ''} onchange="_toggleProposalBtw('${leadId}')">
            BTW ${ms.btwRate}% tonen op voorstel
          </label>
        </div>
      </div>

      <div style="margin-bottom:20px">
        <label style="font-size:11px;font-weight:600;color:var(--text-muted);display:block;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px">Persoonlijke notitie <span style="font-weight:400;text-transform:none">(optioneel)</span></label>
        <textarea id="proposalNote-${leadId}" rows="2" placeholder="Bijv. 'Fijn dat we kennis hebben gemaakt — hierbij ons voorstel op maat.'" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;resize:vertical;background:var(--surface);color:var(--text-primary)"></textarea>
      </div>

      <div id="proposalSuccessState-${leadId}" style="display:none;margin-bottom:16px;padding:14px 16px;border:1.5px solid var(--success);border-radius:10px;background:var(--success-light)">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:4px">✅ Voorstel aangemaakt</div>
        <div id="proposalSuccessNr-${leadId}" style="font-size:12px;color:var(--text-secondary);margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="proposalDownloadBtn-${leadId}" class="btn btn-ghost btn-sm"><i class="ti ti-download"></i> Download PDF</button>
          <button id="proposalSendLaterBtn-${leadId}" class="btn btn-primary btn-sm" style="display:none" onclick="_sendGeneratedProposal('${leadId}')"><i class="ti ti-send"></i> Stuur naar klant</button>
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <button class="btn btn-ghost btn-sm" style="margin-right:auto" onclick="closeModal()">Annuleren</button>
        <button class="btn btn-outline btn-sm" id="proposalGenBtn-${leadId}" onclick="_generateProposal('${leadId}', false)">
          <i class="ti ti-file-text"></i> Genereer voorstel
        </button>
        <button class="btn btn-primary btn-sm" id="proposalGenSendBtn-${leadId}" onclick="_generateProposal('${leadId}', true)">
          <i class="ti ti-send"></i> Genereer &amp; stuur naar klant
        </button>
      </div>
    </div>
  `);

  _calcProposalTotals(leadId);
}

function _buildProposalRowsHtml(leadId) {
  const ms = window._proposalModalState?.[leadId];
  if (!ms || !ms.rows.length) return '<div style="padding:16px;color:var(--text-muted);text-align:center;font-size:13px">Geen diensten gevonden — voeg diensten toe via Instellingen</div>';
  return ms.rows.map((r, i) => `
    <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--border);${i % 2 === 1 ? 'background:var(--surface-2)' : ''}">
      <input type="checkbox" ${r.checked ? 'checked' : ''} onchange="window._proposalModalState['${leadId}'].rows[${i}].checked=this.checked;_calcProposalTotals('${leadId}')">
      <span style="flex:1;font-size:13px;color:var(--text-primary);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(r.name)}">${esc(r.name)}</span>
      <input type="number" value="${r.price}" min="0" step="1"
        style="width:72px;flex-shrink:0;border:1px solid var(--border);border-radius:6px;padding:4px 7px;font-size:13px;background:var(--surface);color:var(--text-primary);text-align:right"
        onchange="window._proposalModalState['${leadId}'].rows[${i}].price=parseFloat(this.value)||0;_calcProposalTotals('${leadId}')">
      <select onchange="window._proposalModalState['${leadId}'].rows[${i}].billing=this.value;_calcProposalTotals('${leadId}')"
        style="flex-shrink:0;border:1px solid var(--border);border-radius:6px;padding:4px 5px;font-size:12px;background:var(--surface);color:var(--text-secondary)">
        <option value="maandelijks" ${r.billing === 'maandelijks' ? 'selected' : ''}>/mnd</option>
        <option value="eenmalig" ${r.billing === 'eenmalig' ? 'selected' : ''}>eenm.</option>
      </select>
    </div>`).join('');
}

function _calcProposalTotals(leadId) {
  const ms = window._proposalModalState?.[leadId];
  if (!ms) return;
  const subtotal = ms.rows.filter(r => r.checked).reduce((s, r) => s + (r.price || 0), 0);
  const btwAmt   = ms.btwEnabled ? subtotal * ms.btwRate / 100 : 0;
  const total    = subtotal + btwAmt;
  const fmt      = v => `€${v.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`;
  const el = id => document.getElementById(id);
  if (el(`proposalSubtotal-${leadId}`)) el(`proposalSubtotal-${leadId}`).textContent = fmt(subtotal);
  if (el(`proposalBtwRow-${leadId}`))   el(`proposalBtwRow-${leadId}`).style.display = ms.btwEnabled ? '' : 'none';
  if (el(`proposalBtwAmt-${leadId}`))   el(`proposalBtwAmt-${leadId}`).textContent   = fmt(btwAmt);
  if (el(`proposalTotal-${leadId}`))    el(`proposalTotal-${leadId}`).textContent     = fmt(total);
}

function _toggleProposalBtw(leadId) {
  const ms = window._proposalModalState?.[leadId];
  if (!ms) return;
  ms.btwEnabled = document.getElementById(`proposalBtwToggle-${leadId}`)?.checked || false;
  _calcProposalTotals(leadId);
}

async function _generateProposal(leadId, sendToClient) {
  const ms = window._proposalModalState?.[leadId];
  if (!ms) return;

  const selected = ms.rows.filter(r => r.checked).map(r => ({ name: r.name, price: r.price, billing: r.billing, description: r.description || '' }));
  if (!selected.length) { toast('Selecteer minimaal één dienst', 'error'); return; }

  const validUntil = document.getElementById(`proposalValidUntil-${leadId}`)?.value || '';
  const note       = document.getElementById(`proposalNote-${leadId}`)?.value || '';

  const genBtn  = document.getElementById(`proposalGenBtn-${leadId}`);
  const sendBtn = document.getElementById(`proposalGenSendBtn-${leadId}`);
  if (genBtn)  { genBtn.disabled  = true; genBtn.innerHTML  = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Genereren...'; }
  if (sendBtn) { sendBtn.disabled = true; sendBtn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Genereren...'; }

  try {
    const res = await api(`/api/leads/${leadId}/proposals`, {
      method: 'POST',
      body: JSON.stringify({ services: selected, validUntil, note, btwEnabled: ms.btwEnabled, btwRate: ms.btwRate, sendToClient })
    });

    if (!res.ok) { toast('Fout: ' + (res.error || 'onbekend'), 'error'); return; }

    // Update lead in state
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) { if (!lead.proposals) lead.proposals = []; lead.proposals.unshift(res.proposal); }

    if (sendToClient) {
      toast(`Voorstel ${res.proposalNr} verstuurd naar klant!`, 'success');
      closeModal();
      const onProj = document.querySelector(`[data-tab-content="voorstel"]`);
      if (onProj) renderProjectPage().then(() => switchProjectTab('voorstel'));
    } else {
      const successDiv = document.getElementById(`proposalSuccessState-${leadId}`);
      const successNr  = document.getElementById(`proposalSuccessNr-${leadId}`);
      const dlBtn      = document.getElementById(`proposalDownloadBtn-${leadId}`);
      const sendLater  = document.getElementById(`proposalSendLaterBtn-${leadId}`);

      if (successDiv) successDiv.style.display = '';
      if (successNr)  successNr.textContent = `${res.proposalNr} — ${selected.map(sv => sv.name).join(', ')}`;

      if (dlBtn && res.pdfBase64) {
        dlBtn.onclick = () => {
          const bytes = Uint8Array.from(atob(res.pdfBase64), c => c.charCodeAt(0));
          const blob  = new Blob([bytes], { type: 'application/pdf' });
          const url   = URL.createObjectURL(blob);
          const a     = document.createElement('a');
          a.href = url; a.download = `Voorstel-${res.proposalNr}.pdf`; a.click();
          URL.revokeObjectURL(url);
        };
      }

      if (sendLater) {
        const lead2 = state.leads.find(l => l.id === leadId);
        if (lead2?.contactEmail) { sendLater.style.display = ''; sendLater.dataset.proposalId = res.proposalNr; }
      }

      ms.generatedProposalId = res.proposalNr;
    }
  } catch (err) {
    toast('Fout bij genereren: ' + err.message, 'error');
  } finally {
    if (genBtn)  { genBtn.disabled  = false; genBtn.innerHTML  = '<i class="ti ti-file-text"></i> Genereer voorstel'; }
    if (sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<i class="ti ti-send"></i> Genereer &amp; stuur naar klant'; }
  }
}

async function _sendGeneratedProposal(leadId) {
  const ms     = window._proposalModalState?.[leadId];
  const btn    = document.getElementById(`proposalSendLaterBtn-${leadId}`);
  const propId = btn?.dataset?.proposalId || ms?.generatedProposalId;
  if (!propId) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Versturen...'; }
  try {
    const res = await api(`/api/leads/${leadId}/proposals/${propId}/send`, { method: 'POST' });
    if (res.ok) { toast('Voorstel verstuurd!', 'success'); closeModal(); }
    else toast('Fout: ' + (res.error || 'onbekend'), 'error');
  } catch (err) { toast('Fout: ' + err.message, 'error'); }
  finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Stuur naar klant'; } }
}

async function sendProposalById(leadId, proposalId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.contactEmail) { toast('Geen e-mailadres bekend', 'error'); return; }
  if (!confirm(`Voorstel ${proposalId} versturen naar ${lead.contactEmail}?`)) return;
  const res = await api(`/api/leads/${leadId}/proposals/${proposalId}/send`, { method: 'POST' });
  if (res.ok) {
    const p = (lead.proposals || []).find(p => p.id === proposalId);
    if (p) { p.sentAt = new Date().toISOString(); p.status = 'sent'; }
    toast('Voorstel verstuurd!', 'success');
    const onProj = document.querySelector(`[data-tab-content="voorstel"]`);
    if (onProj) renderProjectPage().then(() => switchProjectTab('voorstel'));
  } else toast('Fout: ' + (res.error || 'onbekend'), 'error');
}

function _buildProposalsListHtml(lead) {
  const proposals = lead.proposals || [];
  if (!proposals.length) return '';
  const statusColors = { sent: 'var(--success)', accepted: 'var(--accent)', declined: 'var(--danger)', draft: 'var(--text-muted)' };
  const statusLabels = { sent: 'Verstuurd', accepted: 'Geaccepteerd', declined: 'Afgewezen', draft: 'Concept' };
  return `
    <div style="margin-bottom:18px">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Gegenereerde voorstellen</div>
      ${proposals.map(p => {
        const clr = statusColors[p.status] || statusColors.draft;
        const lbl = statusLabels[p.status] || 'Concept';
        const date = p.sentAt ? `Verstuurd ${new Date(p.sentAt).toLocaleDateString('nl-NL')}` : `Aangemaakt ${new Date(p.createdAt).toLocaleDateString('nl-NL')}`;
        const svcNames = (p.services || []).slice(0, 3).map(s => esc(s.name)).join(', ');
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface-2);gap:8px;flex-wrap:wrap">
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${esc(p.proposalNr)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${svcNames}${p.services?.length > 3 ? ' +meer' : ''} — <strong>€${(p.total || 0).toLocaleString('nl-NL')}</strong></div>
            <div style="font-size:11px;color:var(--text-muted)">${date}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
            <span style="font-size:11px;font-weight:600;color:${clr};padding:3px 8px;border:1px solid ${clr};border-radius:12px">${lbl}</span>
            ${p.status !== 'sent' && isAdmin() ? `<button class="btn btn-ghost btn-sm" style="padding:4px 8px;font-size:12px" onclick="sendProposalById('${esc(lead.id)}','${esc(p.id)}')"><i class="ti ti-send" style="font-size:12px"></i></button>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ─── Legacy proposal SSE generator (kept for backward compat) ─────────────────
async function generateProposal(leadId) {
  const onProjectPage = !!document.getElementById(`propProgress-proj-${leadId}`);
  const progId = onProjectPage ? `propProgress-proj-${leadId}` : `propProgress-${leadId}`;
  const stepSuffix = onProjectPage ? `-proj-${leadId}` : `-${leadId}`;

  const btn = document.getElementById(`propGenBtn-${leadId}`);
  const prog = document.getElementById(progId);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Genereren...'; }
  if (prog) prog.style.display = '';

  function setStep(i, done) {
    const el = document.getElementById(`propStep${i + 1}${stepSuffix}`);
    if (!el) return;
    el.className = `proposal-step ${done ? 'done' : 'active'}`;
    el.querySelector('i').className = done ? 'ti ti-circle-check' : 'ti ti-loader-2';
    el.querySelector('i').style.animation = done ? '' : 'spin 1s linear infinite';
  }

  try {
    const res = await fetch(`/api/leads/${leadId}/generate-proposal`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok || !res.body) throw new Error('Server error');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.step !== undefined) setStep(ev.step - 1, false);
          if (ev.done) {
            [0, 1, 2].forEach(i => setStep(i, true));
            const lead = state.leads.find(l => l.id === leadId);
            if (lead && ev.proposal) {
              lead.proposal = ev.proposal;
              lead.proposalGeneratedAt = ev.generatedAt;
            }
            if (onProjectPage) {
              setTimeout(() => renderProjectPage().then(() => switchProjectTab('voorstel')), 300);
            } else {
              setTimeout(() => openLeadDetail(leadId), 300);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    toast('Voorstel genereren mislukt: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-text"></i> Genereer voorstel'; }
    if (prog) prog.style.display = 'none';
  }
}

function downloadProposal(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.proposal) return;
  const blob = new Blob([`<!DOCTYPE html><meta charset="utf-8"><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6}</style>${lead.proposal}`], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `voorstel-${lead.companyName.replace(/\s+/g,'-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

async function sendProposalEmail(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.proposal) return;
  if (!confirm(`Voorstel versturen naar ${lead.contactEmail || lead.companyName}?`)) return;
  const res = await api(`/api/leads/${leadId}/proposal/send`, { method: 'POST' });
  if (res.ok) toast('Voorstel verstuurd!', 'success');
  else toast('Versturen mislukt', 'error');
}

async function generateContract(leadId) {
  const onProjectPage = !!document.getElementById(`contractProgress-proj-${leadId}`);
  const progId = onProjectPage ? `contractProgress-proj-${leadId}` : `contractProgress-${leadId}`;
  const stepSuffix = onProjectPage ? `-proj-${leadId}` : `-${leadId}`;

  const btn  = document.getElementById(`contractGenBtn-${leadId}`);
  const prog = document.getElementById(progId);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Genereren...'; }
  if (prog) prog.style.display = '';

  function setStep(i, done) {
    const el = document.getElementById(`contractStep${i + 1}${stepSuffix}`);
    if (!el) return;
    el.className = `proposal-step ${done ? 'done' : 'active'}`;
    el.querySelector('i').className = done ? 'ti ti-circle-check' : 'ti ti-loader-2';
    el.querySelector('i').style.animation = done ? '' : 'spin 1s linear infinite';
  }

  try {
    const res = await fetch(`/api/leads/${leadId}/generate-contract`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok || !res.body) throw new Error('Server error');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.step !== undefined) setStep(ev.step - 1, false);
          if (ev.done) {
            [0, 1, 2].forEach(i => setStep(i, true));
            const lead = state.leads.find(l => l.id === leadId);
            if (lead && ev.contract) {
              lead.contract = ev.contract;
              lead.contractGeneratedAt = ev.generatedAt;
            }
            if (onProjectPage) {
              setTimeout(() => renderProjectPage().then(() => switchProjectTab('contract')), 300);
            } else {
              setTimeout(() => { openLeadDetail(leadId); switchDetailTab('contract'); }, 300);
            }
          }
          if (ev.error) throw new Error(ev.error);
        } catch {}
      }
    }
  } catch (err) {
    toast('Contract genereren mislukt: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-certificate"></i> Genereer contract'; }
    if (prog) prog.style.display = 'none';
  }
}

function downloadContract(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.contract) return;
  const blob = new Blob([`<!DOCTYPE html><meta charset="utf-8"><style>body{font-family:sans-serif;max-width:800px;margin:40px auto;padding:0 24px;line-height:1.6}</style>${lead.contract}`], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contract-${lead.companyName.replace(/\s+/g, '-').toLowerCase()}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

async function sendContractEmail(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.contract) return;
  if (!confirm(`Contract versturen naar ${lead.contactEmail || lead.companyName}?`)) return;
  const res = await api(`/api/leads/${leadId}/contract/send`, { method: 'POST' });
  if (res.ok) {
    toast('Contract verstuurd!', 'success');
    const idx = state.leads.findIndex(l => l.id === leadId);
    if (idx !== -1) state.leads[idx].contractSentAt = new Date().toISOString();
    openLeadDetail(leadId);
  } else {
    toast('Versturen mislukt', 'error');
  }
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
  const n = checked.length;
  const approveBtn = document.getElementById('bulkApproveSelBtn');
  const declineBtn = document.getElementById('bulkDeclineSelBtn');
  const countEl    = document.getElementById('bulkSelCount');
  const decCountEl = document.getElementById('bulkDeclineCount');
  if (countEl)    countEl.textContent    = n;
  if (decCountEl) decCountEl.textContent = n;
  if (approveBtn) approveBtn.style.display = n > 0 ? '' : 'none';
  if (declineBtn) declineBtn.style.display = n > 0 ? '' : 'none';
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

async function bulkDeclineAll() {
  const pending = (state.inbox || []).filter(i => i.status === 'pending' || i.status === 'auto-approved');
  if (!pending.length) return;
  if (!confirm(`Weet je zeker dat je ${pending.length} leads wilt afwijzen?`)) return;
  await runBulkDecline(pending.map(i => i.id));
}

async function bulkDeclineSelected() {
  const ids = Array.from(document.querySelectorAll('.bulk-checkbox:checked')).map(cb => cb.dataset.id);
  if (!ids.length) return;
  if (!confirm(`Weet je zeker dat je ${ids.length} leads wilt afwijzen?`)) return;
  await runBulkDecline(ids);
}

async function runBulkDecline(ids) {
  const bar = document.getElementById('bulkBar');
  if (bar) bar.innerHTML = `
    <div style="width:100%;padding:4px 0">
      <div style="font-size:13px;color:var(--text-primary);margin-bottom:8px">Afwijzen… <span id="bulkDeclineProgress">0</span> / ${ids.length}</div>
      <div style="background:var(--border);border-radius:99px;height:5px;overflow:hidden">
        <div id="bulkDeclineBar" style="height:100%;background:var(--danger);border-radius:99px;width:0;transition:width 0.3s"></div>
      </div>
    </div>`;

  let done = 0;
  for (const id of ids) {
    const card = document.getElementById('card-' + id);
    try {
      const res = await api(`/api/inbox/${id}/disapprove`, { method: 'PATCH' });
      if (res.ok) {
        done++;
        const prog = document.getElementById('bulkDeclineProgress');
        const bar2 = document.getElementById('bulkDeclineBar');
        if (prog) prog.textContent = done;
        if (bar2) bar2.style.width = Math.round((done / ids.length) * 100) + '%';
        if (card) { card.style.opacity = '0.4'; card.style.pointerEvents = 'none'; }
      }
    } catch { /* skip failed */ }
  }

  toast(`${done} lead${done !== 1 ? 's' : ''} afgewezen`, 'success');
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
      const matchStatus = activeStatus === 'archived'
        ? l.status === 'archived'
        : activeStatus === 'all'
          ? l.status !== 'archived'
          : l.status === activeStatus ||
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
          ${isAdmin() ? `<input type="checkbox" class="lc2-checkbox" ${checked ? 'checked' : ''}
            onclick="event.stopPropagation();toggleLeadSelect('${l.id}')" title="Selecteer">` : ''}
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
            <span class="text-muted" style="font-size:11px">${l.status === 'archived' ? `<span style="color:var(--text-secondary);font-weight:600">Gearchiveerd</span>` : relativeTime(l.createdAt)}</span>
            ${l.status === 'archived' && isAdmin() ? `<button class="btn btn-ghost btn-sm" style="font-size:11px;height:26px;padding:0 8px" onclick="event.stopPropagation();restoreArchivedLead('${l.id}','${esc(l.companyName)}')">Herstel</button>` : `<button class="lc2-open-btn" onclick="event.stopPropagation();openLeadDetail('${l.id}')">Open ›</button>`}
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

  window.restoreArchivedLead = async function(id, name) {
    const r = await api(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'dead', archivedAt: null, archiveReason: null }) });
    if (r?.ok) {
      const lead = leads.find(l => l.id === id);
      if (lead) { lead.status = 'dead'; delete lead.archivedAt; delete lead.archiveReason; }
      renderGrid();
      toast(`${name} hersteld`, 'success');
    } else {
      toast('Herstellen mislukt.', 'error');
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
    ${isAdmin() ? `<div id="bulkActionBar" class="bulk-action-bar" style="display:none">
      <span class="bulk-count"></span>
      <button class="btn btn-danger btn-sm" onclick="bulkDeleteLeads()">
        <i class="ti ti-trash"></i> Verwijder selectie
      </button>
      <button class="btn btn-ghost btn-sm" onclick="selectAllLeads()" id="selectAllBtn">
        <i class="ti ti-square"></i> Selecteer alles
      </button>
    </div>` : ''}
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
          <button class="filter-chip" data-status="archived" style="color:var(--text-secondary)">Archief</button>
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
  client: 'Klant ✓', disapproved: 'Afgewezen', dead: 'Dead',
  bounced: 'Niet aangekomen', delivery_delayed: 'Vertraagd'
};

const STATUS_COLORS = {
  inbox: 'gray', approved: 'blue', sent: 'indigo', 'auto-approved': 'indigo',
  scheduled: 'amber',
  followup1: 'amber', followup2: 'orange', replied: 'green',
  meeting: 'purple', client: 'dark-green', disapproved: 'red', dead: 'gray',
  bounced: 'red', delivery_delayed: 'orange'
};

// Groups used by pipeline table view
const PIPELINE_GROUPS = [
  { key: 'replied',     label: 'Gereageerd',      dot: '#d97706', statuses: ['replied'],                                              defaultOpen: true },
  { key: 'client',      label: 'Klant',            dot: '#7c3aed', statuses: ['client'],                                              defaultOpen: true },
  { key: 'sent',        label: 'Verstuurd',        dot: '#16a34a', statuses: ['sent','followup1','followup2','scheduled','auto-approved'] },
  { key: 'inbox',       label: 'Inbox / wacht',    dot: '#2563eb', statuses: ['inbox','pending','new','approved'] },
  { key: 'bounced',     label: 'Niet aangekomen',  dot: '#dc2626', statuses: ['bounced','delivery_delayed'] },
  { key: 'disapproved', label: 'Afgekeurd',        dot: '#6b7280', statuses: ['disapproved'] },
  { key: 'dead',        label: 'Dead',             dot: '#9b9b98', statuses: ['dead'] }
];

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

  // Reset per-session view state on fresh page load
  window._pipelineGroupOpen = null;
  window._kanbanExpanded    = {};

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
  { key: 'inbox',    label: 'Inbox',           color: '#2563eb', statuses: ['inbox', 'pending', 'new'] },
  { key: 'approved', label: 'Gekwalif.',        color: '#7c3aed', statuses: ['approved', 'auto-approved'] },
  { key: 'sent',     label: 'Verstuurd',        color: '#16a34a', statuses: ['sent', 'followup1', 'followup2', 'scheduled'] },
  { key: 'replied',  label: 'Gereageerd',       color: '#d97706', statuses: ['replied'] },
  { key: 'bounced',  label: 'Niet aangekomen',  color: '#dc2626', statuses: ['bounced', 'delivery_delayed'] },
  { key: 'client',   label: 'Klant',            color: '#059669', statuses: ['client'] },
  { key: 'dead',     label: 'Dead',             color: '#9b9b98', statuses: ['dead', 'disapproved'] }
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
        ${l.leadSource === 'instagram' ? `<span class="pill" style="background:#fce7f3;color:#be185d;border:none"><i class="ti ti-brand-instagram" style="font-size:10px"></i> IG</span>` : ''}
        ${l.leadSource === 'maps' ? `<span class="pill" style="background:#eff6ff;color:#1d4ed8;border:none"><i class="ti ti-map-pin" style="font-size:10px"></i> Maps</span>` : ''}
        ${deal ? `<span class="kc2-deal">${deal}</span>` : ''}
      </div>
    </div>`;
}

function renderKanban(leads, container) {
  const KANBAN_PAGE_SIZE = 10;
  const colLeads = {};
  KANBAN_COLS.forEach(col => {
    colLeads[col.key] = leads.filter(l => col.statuses.includes(l.status || 'inbox'));
  });

  // Track which cols have been fully expanded (persisted within session)
  if (!window._kanbanExpanded) window._kanbanExpanded = {};

  function buildColHTML(col) {
    const all   = colLeads[col.key];
    const expanded = window._kanbanExpanded[col.key];
    const visible  = expanded ? all : all.slice(0, KANBAN_PAGE_SIZE);
    const hidden   = all.length - visible.length;
    const totalVal = all.filter(l => (l.estimatedValue || 0) > 0).reduce((s, l) => s + l.estimatedValue, 0);
    return `
      <div class="kanban-col" data-col-key="${col.key}" data-drop-status="${col.key}">
        <div class="kanban-col-header">
          <div class="kanban-col-title">
            <span class="kanban-col-dot" style="background:${col.color}"></span>
            ${col.label}
            <span class="kanban-col-count">${all.length}</span>
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${totalVal > 0 ? `<div class="kanban-col-meta">€${totalVal >= 1000 ? (totalVal/1000).toFixed(0)+'K' : totalVal}</div>` : ''}
            ${all.length > KANBAN_PAGE_SIZE ? `<button class="kanban-see-all-btn" onclick="switchPipelineView('table');setTimeout(()=>filterPipelineGroup('${col.key}'),50)">Alles zien</button>` : ''}
          </div>
        </div>
        <div class="kanban-col-body" data-drop-status="${col.key}">
          ${visible.length ? visible.map(l => buildKanbanCard(l)).join('') : '<div class="kanban-col-empty">Nog niets hier</div>'}
          ${hidden > 0 ? `<button class="kanban-more-btn" data-col="${col.key}">+ ${hidden} meer</button>` : ''}
        </div>
      </div>`;
  }

  container.innerHTML = `
    <div class="kanban-board" id="kanbanBoard">
      ${KANBAN_COLS.map(col => buildColHTML(col)).join('')}
    </div>`;

  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openProjectPage(card.dataset.id));
  });

  // "X meer" expand buttons
  document.querySelectorAll('.kanban-more-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window._kanbanExpanded[btn.dataset.col] = true;
      renderKanban(state.leads, container);
    });
  });

  document.querySelectorAll('.kanban-col-body').forEach(body => {
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over'); });
    body.addEventListener('drop', async e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const leadId = e.dataTransfer.getData('text/plain');
      const colKey = body.dataset.dropStatus;
      const STATUS_MAP = { inbox: 'inbox', approved: 'approved', sent: 'sent', replied: 'replied', bounced: 'bounced', client: 'client', dead: 'dead' };
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

// Called from "Alles zien" kanban link — activates table view filtered to a group
window.filterPipelineGroup = function(groupKey) {
  document.querySelectorAll('.pipeline-filter-tab').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.pipeline-filter-tab[data-group="${groupKey}"]`);
  if (btn) btn.classList.add('active');
  applyPipelineGroupFilter(groupKey);
};

function buildLeadTableRow(l, dupIds) {
  return `
    <tr class="leads-row" data-id="${l.id}" data-status="${l.status || 'inbox'}" data-size="${l.companySize || ''}">
      <td><strong>${esc(l.companyName || '—')}${l.language === 'nl' ? ' 🇳🇱' : l.language === 'en' ? ' 🇬🇧' : ''}${l.status === 'auto-approved' ? ' <span title="Auto-goedgekeurd" style="color:#10b981;font-size:11px">⚡</span>' : ''}${l.referralPending ? ' <span title="Referral email klaar voor goedkeuring" style="font-size:11px">🎁</span>' : ''}${(l.clientMessages || []).some(m => !m.read) ? ' <span class="msg-dot" title="Ongelezen klantbericht"></span>' : ''}${dupIds.has(l.id) ? ' <span title="Mogelijk duplicaat" style="background:#fef3c7;color:#92400e;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;border:1px solid #fde68a">Dubbel</span>' : ''}</strong><br><span class="text-muted" style="font-size:12px">${esc(l.location || '')}</span></td>
      <td>${nicheBadge(l.niche)}</td>
      <td>${l.contactEmail
        ? `<span class="table-email">${esc(l.contactEmail)}</span>${['verified','scraped','gevonden','agent1_websearch'].includes(l.emailSource) ? `<span class="email-src-badge email-src-found" style="margin-left:4px">✓ Geverifieerd</span>` : l.emailSource === 'guessed' || l.emailSource === 'geschat' ? `<span class="email-src-badge email-src-guess" style="margin-left:4px">Geschat</span>` : ''}`
        : `<span class="text-warning" style="font-size:11px">Geen email</span>`}</td>
      <td><span class="score-pill score-${scoreColor(l.score || 0)}">${(l.score || 0).toFixed(1)}</span></td>
      <td>
        ${['bounced','delivery_delayed'].includes(l.status)
          ? `<span class="status-pill-bounced"><i class="ti ti-mail-off"></i> Niet aangekomen</span>`
          : `<span class="status-pill status-${STATUS_COLORS[l.status] || 'gray'}">${STATUS_LABELS[l.status] || 'Inbox'}</span>`}
        ${l.followup1SentAt ? `<br><span style="font-size:10px;font-weight:600;color:#d97706;background:#fef3c7;border-radius:3px;padding:1px 5px">FU1</span>` : ''}
        ${l.followup2SentAt ? ` <span style="font-size:10px;font-weight:600;color:#ea580c;background:#fff7ed;border-radius:3px;padding:1px 5px">FU2</span>` : ''}
        ${l.sentAt && !l.repliedAt ? (() => { const d = Math.floor((Date.now() - new Date(l.sentAt)) / 86400000); return d > 0 ? `<br><span class="text-muted" style="font-size:10px">${d}d geleden</span>` : ''; })() : ''}
        ${l.scheduledAt ? `<br><span class="text-warning" style="font-size:11px"><i class="ti ti-clock"></i> ${formatOptimalTime(l.scheduledAt)}</span>` : ''}
        ${l.openedAt ? `<br><span class="text-success" style="font-size:11px"><i class="ti ti-eye"></i> Geopend ${formatDate(l.openedAt)}${l.openCount > 1 ? ' (' + l.openCount + 'x)' : ''}</span>` : ''}
      </td>
      <td class="text-secondary">${l.sentAt ? formatDate(l.sentAt) : '—'}</td>
      <td class="text-secondary">${l.repliedAt ? formatDate(l.repliedAt) : '—'}</td>
      <td class="text-secondary">${l.estimatedValue ? '€' + l.estimatedValue.toLocaleString('nl-NL') : '—'}</td>
      <td class="row-actions-cell">
        <div class="row-actions">
          <button class="btn btn-ghost btn-sm" title="Open project" onclick="openProjectPage('${l.id}')"><i class="ti ti-arrow-right"></i></button>
          ${l.contactEmail ? `<button class="btn btn-ghost btn-sm" title="Kopieer email" onclick="copyToClipboard('${esc(l.contactEmail)}','Email gekopieerd!')"><i class="ti ti-copy"></i></button>` : ''}
          <button class="btn btn-ghost btn-sm" title="Stuur follow-up" onclick="quickFollowup('${l.id}')"><i class="ti ti-mail-forward"></i></button>
          <button class="btn btn-ghost btn-sm" title="Verwijder lead" style="color:var(--danger)" onclick="quickDeleteLead('${l.id}','${esc(l.companyName)}')"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`;
}

function buildGroupSection(group, groupLeads, dupIds, isOpen) {
  const val = groupLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const valStr = val > 0 ? `<span class="sg-val">€${val >= 1000 ? (val/1000).toFixed(0)+'K' : val}</span>` : '';
  return `
    <div class="status-group" data-group="${group.key}">
      <div class="status-group-header ${isOpen ? 'open' : ''}" onclick="toggleStatusGroup('${group.key}')">
        <span class="sg-dot" style="background:${group.dot}"></span>
        <span class="sg-label">${group.label}</span>
        <span class="sg-count">${groupLeads.length}</span>
        ${valStr}
        <i class="ti ti-chevron-right sg-chevron"></i>
      </div>
      <div class="status-group-body ${isOpen ? 'open' : ''}">
        ${groupLeads.length ? `
          <div class="table-wrap" style="margin:0">
            <table class="leads-table">
              <thead><tr>
                <th>Bedrijf</th><th>Niche</th><th>Email</th><th>Score</th>
                <th>Status</th><th>Verstuurd</th><th>Gereageerd</th><th>Waarde</th><th></th>
              </tr></thead>
              <tbody>${groupLeads.map(l => buildLeadTableRow(l, dupIds)).join('')}</tbody>
            </table>
          </div>` : `<div class="sg-empty">Geen leads in deze groep</div>`}
      </div>
    </div>`;
}

function renderPipelineTable(leads, container) {
  // Compute summary counts
  const sentStatuses    = ['sent','followup1','followup2','scheduled','auto-approved'];
  const activeStatuses  = ['inbox','approved','sent','auto-approved','followup1','followup2'];
  const bouncedStatuses = ['bounced','delivery_delayed'];

  const cTotal    = leads.length;
  const cSent     = leads.filter(l => sentStatuses.includes(l.status)).length;
  const cReplied  = leads.filter(l => l.status === 'replied').length;
  const cClient   = leads.filter(l => l.status === 'client').length;
  const cBounced  = leads.filter(l => bouncedStatuses.includes(l.status)).length;
  const cActive   = leads.filter(l => activeStatuses.includes(l.status)).length;
  const replyRate = cSent > 0 ? Math.round((cReplied / cSent) * 100) : 0;

  // Build dup map once
  const nameCounts = {};
  leads.forEach(l => { const n = (l.companyName||'').toLowerCase().trim(); if (n) nameCounts[n] = (nameCounts[n]||0)+1; });
  const dupIds = new Set(leads.filter(l => nameCounts[(l.companyName||'').toLowerCase().trim()] > 1).map(l => l.id));

  // Which groups are open by default
  const defaultOpen = new Set(['replied', 'client']);
  if (!window._pipelineGroupOpen) {
    window._pipelineGroupOpen = Object.fromEntries(
      PIPELINE_GROUPS.map(g => [g.key, defaultOpen.has(g.key)])
    );
  }

  // Build group sections (only for groups that have leads)
  const groupSections = PIPELINE_GROUPS
    .map(g => {
      const gl = leads.filter(l => g.statuses.includes(l.status || 'inbox'));
      return { group: g, groupLeads: gl };
    })
    .filter(({ groupLeads }) => groupLeads.length > 0);

  container.innerHTML = `
    <!-- Summary bar -->
    <div class="pipeline-summary-bar">
      <button class="psb-item" onclick="filterPipelineTab('all')">
        <span class="psb-num">${cTotal}</span> <span class="psb-lbl">leads totaal</span>
      </button>
      <span class="psb-sep">|</span>
      <button class="psb-item" onclick="filterPipelineTab('sent')">
        <span class="psb-num">${cSent}</span> <span class="psb-lbl">verstuurd</span>
      </button>
      <span class="psb-sep">|</span>
      <button class="psb-item" onclick="filterPipelineTab('replied')">
        <span class="psb-num psb-green">${cReplied}</span>
        <span class="psb-lbl">gereageerd${cSent > 0 ? ` <span class="psb-rate">(${replyRate}%)</span>` : ''}</span>
      </button>
      <span class="psb-sep">|</span>
      <button class="psb-item" onclick="filterPipelineTab('client')">
        <span class="psb-num psb-purple">${cClient}</span> <span class="psb-lbl">klanten</span>
      </button>
      ${cBounced > 0 ? `<span class="psb-sep">|</span>
      <button class="psb-item" onclick="filterPipelineTab('bounced')">
        <span class="psb-num psb-red">${cBounced}</span> <span class="psb-lbl">niet aangekomen</span>
      </button>` : ''}
    </div>

    <!-- Filter tabs -->
    <div class="pipeline-filter-bar">
      <div class="filter-tabs pipeline-tabs">
        <button class="filter-tab pipeline-filter-tab active" data-group="all">Alles (${cTotal})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="active">Actief (${cActive})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="sent">Verstuurd (${cSent})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="replied">Gereageerd (${cReplied})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="bounced">Niet aangekomen (${cBounced})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="client">Klanten (${cClient})</button>
        <button class="filter-tab pipeline-filter-tab" data-group="disapproved">Afgekeurd</button>
      </div>
      <div style="display:flex;gap:8px;margin-left:auto">
        <input type="search" class="search-input" id="leadSearch" placeholder="Zoek bedrijf..." style="width:180px">
        <select id="exportSelect" class="form-select" style="width:140px;font-size:12px" onchange="if(this.value){exportLeadsCSV(this.value==='all'?'':this.value);this.value=''}">
          <option value="">⬇ Export...</option>
          <option value="all">Alle leads</option>
          <option value="client">Alleen klanten</option>
          <option value="sent">Alleen verstuurd</option>
          <option value="replied">Alleen gereageerd</option>
        </select>
      </div>
    </div>

    <!-- Grouped status sections -->
    <div id="pipelineGroups">
      ${groupSections.map(({ group, groupLeads }) =>
        buildGroupSection(group, groupLeads, dupIds, window._pipelineGroupOpen[group.key] || false)
      ).join('')}
    </div>
  `;

  // Attach row-click handlers
  document.querySelectorAll('.leads-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openProjectPage(row.dataset.id);
    });
    row.style.cursor = 'pointer';
  });

  // Search
  document.getElementById('leadSearch').addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.leads-row').forEach(row => {
      const name = row.querySelector('strong')?.textContent?.toLowerCase() || '';
      row.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
    // Show groups that still have visible rows
    document.querySelectorAll('.status-group').forEach(sg => {
      const visRows = sg.querySelectorAll('.leads-row:not([style*="none"])');
      sg.style.display = visRows.length ? '' : 'none';
    });
  });

  // Filter tab handlers
  document.querySelectorAll('.pipeline-filter-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pipeline-filter-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      applyPipelineGroupFilter(btn.dataset.group);
    });
  });
}

window.toggleStatusGroup = function(key) {
  const sg = document.querySelector(`.status-group[data-group="${key}"]`);
  if (!sg) return;
  const header = sg.querySelector('.status-group-header');
  const body   = sg.querySelector('.status-group-body');
  const nowOpen = header.classList.toggle('open');
  body.classList.toggle('open', nowOpen);
  if (!window._pipelineGroupOpen) window._pipelineGroupOpen = {};
  window._pipelineGroupOpen[key] = nowOpen;
};

window.filterPipelineTab = function(groupKey) {
  document.querySelectorAll('.pipeline-filter-tab').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.pipeline-filter-tab[data-group="${groupKey}"]`);
  if (btn) btn.classList.add('active');
  applyPipelineGroupFilter(groupKey);
};

function applyPipelineGroupFilter(filter) {
  const activeStatuses  = ['inbox','approved','sent','auto-approved','followup1','followup2'];
  const bouncedStatuses = ['bounced','delivery_delayed'];

  document.querySelectorAll('.status-group').forEach(sg => {
    const key = sg.dataset.group;
    const group = PIPELINE_GROUPS.find(g => g.key === key);
    if (!group) return;

    let show = false;
    if (filter === 'all') {
      show = true;
    } else if (filter === 'active') {
      show = group.statuses.some(s => activeStatuses.includes(s));
    } else if (filter === 'bounced') {
      show = group.statuses.some(s => bouncedStatuses.includes(s));
    } else if (filter === 'sent') {
      show = group.statuses.some(s => ['sent','followup1','followup2','scheduled','auto-approved'].includes(s));
    } else if (filter === 'replied') {
      show = group.statuses.includes('replied');
    } else if (filter === 'client') {
      show = group.statuses.includes('client');
    } else if (filter === 'disapproved') {
      show = group.statuses.includes('disapproved') || group.statuses.includes('dead');
    }

    sg.style.display = show ? '' : 'none';

    // Auto-expand the matching group when filtering to it
    if (show && filter !== 'all') {
      const header = sg.querySelector('.status-group-header');
      const body   = sg.querySelector('.status-group-body');
      header.classList.add('open');
      body.classList.add('open');
      if (!window._pipelineGroupOpen) window._pipelineGroupOpen = {};
      window._pipelineGroupOpen[key] = true;
    }
  });
}

// ─── Project Page ─────────────────────────────────────────────────────────────

function openProjectPage(id) {
  state.currentLeadId = id;
  setView('project');
}

function switchProjectTab(tab) {
  window._projectTab = tab;
  document.querySelectorAll('.project-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.project-tab-content').forEach(c => {
    c.style.display = c.dataset.tabContent === tab ? '' : 'none';
  });
  // Fill iframes when tabs become visible
  const lead = state.leads.find(l => l.id === state.currentLeadId);
  if (!lead) return;
  if (tab === 'voorstel') {
    const f = document.getElementById(`proposalFrame-${lead.id}`);
    if (f && lead.proposal) f.srcdoc = lead.proposal;
  }
  if (tab === 'contract') {
    const f = document.getElementById(`contractFrame-${lead.id}`);
    if (f && lead.contract) f.srcdoc = lead.contract;
  }
  if (tab === 'portaal') {
    initPortalServices(lead.id);
  }
}

async function renderProjectPage() {
  // Fetch fresh data so the page is always current
  const [freshLeads, freshUsers] = await Promise.all([
    apiJSON('/api/leads').catch(() => null),
    apiJSON('/api/users').catch(() => [])
  ]);
  if (freshLeads) state.leads = freshLeads;
  if (freshUsers) state.users = freshUsers;

  const lead = state.leads.find(l => l.id === state.currentLeadId);
  if (!lead) {
    document.getElementById('appView').innerHTML = `<div class="empty-card"><i class="ti ti-alert-circle"></i><h3>Lead niet gevonden</h3><button class="btn btn-primary" onclick="setView('pipeline')">← Pipeline</button></div>`;
    return;
  }

  window._agentChats = window._agentChats || {};
  if (!window._agentChats[lead.id]) window._agentChats[lead.id] = {};

  if (window._projectTab === 'taken') window._projectTab = 'overzicht';
  if (window._projectTab === 'agents' || window._projectTab === 'website') window._projectTab = 'building';
  const activeTab = window._projectTab || 'overzicht';

  // Build score/status pills
  const scoreCls = lead.score >= 8 ? 'score-num-green' : lead.score >= 6 ? 'score-num-amber' : 'score-num-red';
  const statusLabel = STATUS_LABELS[lead.status] || lead.status || 'Inbox';
  const statusColor = STATUS_COLORS[lead.status] || 'gray';

  // ── Tab: Overzicht ─────────────────────────────────────────────────────────
  const tabOverzicht = `
    <div class="project-tab-content" data-tab-content="overzicht" style="${activeTab !== 'overzicht' ? 'display:none' : ''}">

      ${lead.status === 'replied' && !lead.projectStartedAt ? `
      <div style="border:2.5px solid #16a34a;border-radius:16px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:22px 24px;margin-bottom:22px;box-shadow:0 2px 12px rgba(22,163,74,.12)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:14px">
            <span style="font-size:28px;flex-shrink:0;margin-top:2px">💬</span>
            <div>
              <div style="font-size:17px;font-weight:800;color:#15803d;margin-bottom:4px">${esc(lead.companyName)} heeft gereageerd!</div>
              <div style="font-size:13px;color:#166534;margin-bottom:2px">Klaar om het project te starten?</div>
              ${lead.repliedAt ? `<div style="font-size:11px;color:#4ade80;margin-top:4px"><i class="ti ti-clock"></i> Gereageerd ${relativeTime(lead.repliedAt)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-dark" style="background:#15803d;font-size:15px;padding:12px 22px;flex-shrink:0;align-self:center" onclick="startProject('${esc(lead.id)}')">
            <i class="ti ti-rocket"></i> Project configureren &amp; starten →
          </button>
        </div>
      </div>
      ` : ''}

      ${lead.projectStartedAt && lead.intakeToken && !lead.intakeSubmittedAt ? `
      <div style="border:2px solid var(--warning);border-radius:14px;background:linear-gradient(135deg,#fffbeb 0%,#fef9c3 100%);padding:20px 22px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span style="font-size:24px;flex-shrink:0">⏳</span>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:800;color:#92400e;margin-bottom:3px">Wacht op intake formulier</div>
            <div style="font-size:13px;color:#78350f">De klant heeft de intake nog niet ingevuld. Agents kunnen nog niet bouwen.</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${window.location.origin}/intake/${esc(lead.id)}/${esc(lead.intakeToken)}').then(()=>toast('Link gekopieerd','success'))"><i class="ti ti-copy"></i> Kopieer intake link</button>
          </div>
        </div>
      </div>
      ` : ''}

      ${lead.intakeSubmittedAt ? `
      <div style="border:2.5px solid var(--success);border-radius:14px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:20px 22px;margin-bottom:20px;box-shadow:0 2px 10px rgba(16,185,129,.1)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:24px;flex-shrink:0;margin-top:1px">✅</span>
            <div>
              <div style="font-size:15px;font-weight:800;color:#15803d;margin-bottom:3px">Intake ontvangen!</div>
              <div style="font-size:13px;color:#166534;margin-bottom:6px">
                ${(lead.selectedProblems||[]).length ? `Agents bouwen voor ${(lead.selectedProblems||[]).length} geselecteerde probleem${(lead.selectedProblems||[]).length>1?'en':''}.` : 'Agents bouwen op basis van bestelde diensten en gevonden problemen.'}
              </div>
              ${lead.agentsRanAt ? `<div style="font-size:11px;color:var(--text-muted)"><i class="ti ti-check" style="color:var(--success)"></i> Gebouwd op ${formatDate(lead.agentsRanAt)} — ${(lead.agentDeliverables||[]).length} leveringen</div>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center">
            ${lead.agentsRanAt ? `<button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw bouwen</button>` : ''}
            ${isAdmin() ? `<button class="btn btn-dark" style="font-size:14px;padding:10px 20px" onclick="buildAllServicesForLead('${esc(lead.id)}')">
              <i class="ti ti-robot"></i> ${lead.agentsRanAt ? 'Alles herbouwen' : 'Ga verder — laat agents bouwen'}
            </button>` : ''}
          </div>
        </div>
      </div>
      ` : ''}

      ${lead.onboardingScript ? `
      <div style="margin-bottom:20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <i class="ti ti-video" style="font-size:18px;color:#0284c7;flex-shrink:0"></i>
            <span style="font-size:13px;font-weight:700;color:#0284c7">Video onboarding script</span>
            <span style="background:#0284c7;color:#fff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700">~60 sec</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="navigator.clipboard.writeText(${JSON.stringify(lead.onboardingScript)}).then(()=>toast('Script gekopieerd','success'))"><i class="ti ti-copy"></i> Kopiëren</button>
        </div>
        <p style="font-size:13px;line-height:1.65;color:#0c4a6e;white-space:pre-line;margin:0">${esc(lead.onboardingScript)}</p>
      </div>
      ` : ''}

      <div class="project-info-grid">
        <div class="project-info-item">
          <div class="project-info-label">Email</div>
          <div class="project-info-value" id="emailDisplayRow-${lead.id}">
            ${lead.contactEmail ? `<a href="mailto:${esc(lead.contactEmail)}" class="link">${esc(lead.contactEmail)}</a>` : '<span style="color:var(--text-muted)">Geen email</span>'}
            <button class="btn btn-xs btn-ghost" style="margin-left:6px;padding:2px 6px;font-size:11px" onclick="startEditEmail('${lead.id}','${esc(lead.contactEmail||'')}')"><i class="ti ti-pencil"></i></button>
          </div>
          <div id="emailEditRow-${lead.id}" style="display:none;align-items:center;gap:6px;margin-top:4px">
            <input type="email" id="emailEditInput-${lead.id}" value="${esc(lead.contactEmail||'')}" placeholder="email@domein.nl" style="height:32px;padding:0 10px;border:1.5px solid var(--accent);border-radius:6px;font-size:13px;flex:1;background:var(--surface);color:var(--text);outline:none">
            <button class="btn btn-xs btn-primary" onclick="saveLeadEmail('${lead.id}')"><i class="ti ti-check"></i></button>
            <button class="btn btn-xs btn-ghost" onclick="cancelEditEmail('${lead.id}')"><i class="ti ti-x"></i></button>
          </div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Website</div>
          <div class="project-info-value">${lead.websiteUrl ? `<a href="${esc(lead.websiteUrl)}" target="_blank" class="link">${esc(lead.websiteUrl)}</a>` : '<span style="color:var(--text-muted)">—</span>'}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Instagram</div>
          <div class="project-info-value">${lead.instagram ? `<a href="https://instagram.com/${esc(lead.instagram.replace('@',''))}" target="_blank" class="link">${esc(lead.instagram)}</a>` : '<span style="color:var(--text-muted)">—</span>'}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Locatie</div>
          <div class="project-info-value">${esc(lead.location || '—')}${lead.address ? `<br><span style="font-size:11px;color:var(--text-secondary)">${esc(lead.address)}</span>` : ''}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Volgers</div>
          <div class="project-info-value">${lead.followers ? lead.followers.toLocaleString('nl-NL') : lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString('nl-NL') : '—'}</div>
        </div>
        ${lead.mapsRating ? `
        <div class="project-info-item">
          <div class="project-info-label">Google Maps</div>
          <div class="project-info-value"><span style="color:#f59e0b">★</span> ${lead.mapsRating} <span style="color:var(--text-secondary);font-size:12px">(${lead.reviewCount || '?'} reviews)</span></div>
        </div>` : ''}
        ${lead.phone ? `
        <div class="project-info-item">
          <div class="project-info-label">Telefoon</div>
          <div class="project-info-value"><a href="tel:${esc(lead.phone)}" class="link">${esc(lead.phone)}</a></div>
        </div>` : ''}
        <div class="project-info-item">
          <div class="project-info-label">Deal waarde</div>
          <div class="project-info-value">${lead.estimatedValue ? '€' + lead.estimatedValue.toLocaleString('nl-NL') : '—'}</div>
        </div>
      </div>

      ${(() => {
        const websiteScore  = lead.website?.speedScore ?? null;
        const socialRaw     = lead.social?.growthPotential;
        const socialScore   = typeof socialRaw === 'number' ? socialRaw : null;
        const engagePct     = lead.social?.engagementRate ?? null;
        const engageScore   = engagePct !== null ? Math.min(10, Math.round(engagePct * 1.5)) : null;
        const urgencyMap    = { critical: { label: 'Kritiek', color: 'var(--danger)' }, high: { label: 'Hoog', color: '#f97316' }, hoog: { label: 'Hoog', color: '#f97316' }, medium: { label: 'Medium', color: 'var(--warning)' }, low: { label: 'Laag', color: 'var(--success)' } };
        const urgInfo       = urgencyMap[lead.urgency] || null;
        const barColor      = v => v >= 8 ? 'var(--success)' : v >= 5 ? 'var(--warning)' : 'var(--danger)';
        const scoreBar      = (label, val) => val === null ? '' : `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text-secondary)">${label}</span>
              <span style="font-size:12px;font-weight:700;color:${barColor(val)}">${val.toFixed(1)}/10</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${val*10}%;background:${barColor(val)};border-radius:3px;transition:width 0.4s"></div>
            </div>
          </div>`;
        const hasAny = websiteScore !== null || socialScore !== null || engageScore !== null || lead.score || urgInfo;
        if (!hasAny) return '';
        return `
          <div style="margin-bottom:20px">
            <div class="project-section-title"><i class="ti ti-chart-bar" style="color:var(--accent);margin-right:6px"></i>Score analyse</div>
            <div style="padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
              ${scoreBar('Website kwaliteit', websiteScore)}
              ${scoreBar('Social media potentieel', socialScore)}
              ${engageScore !== null ? scoreBar(`Engagement (${engagePct?.toFixed(1)}%)`, engageScore) : ''}
              ${lead.score ? scoreBar('Totale score', lead.score) : ''}
              ${urgInfo ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:10px;border-top:1px solid var(--border)"><span style="font-size:12px;color:var(--text-secondary)">Urgentie</span><span style="font-size:12px;font-weight:700;color:${urgInfo.color}">${urgInfo.label}</span></div>` : ''}
            </div>
          </div>`;
      })()}

      ${lead.problems?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Gevonden problemen</div>
          ${lead.problems.map((p, i) => {
            const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
            const low = txt.toLowerCase();
            const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
            return `<div class="problem-card ${isCritical ? '' : ''}">
              <span style="font-size:16px">${isCritical ? '🔴' : '🟡'}</span>
              <span style="flex:1;font-size:13px">${esc(txt)}</span>
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${lead.services?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Aanbevolen diensten</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${lead.services.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
                <span style="font-size:13px;font-weight:500">${esc(s.name)}</span>
                <span style="font-size:13px;color:var(--accent);font-weight:600">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${lead.competitors?.competitorNames?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Concurrentie analyse</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${lead.competitors.competitorNames.map(n => `<span style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:500">${esc(n)}</span>`).join('')}
          </div>
          ${lead.competitors.competitorGap ? `<div style="background:var(--warning-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--warning)"><i class="ti ti-alert-triangle" style="margin-right:6px;color:var(--warning)"></i>${esc(lead.competitors.competitorGap)}</div>` : ''}
        </div>
      ` : ''}

      <div style="margin-bottom:20px">
        <div class="project-section-title">Score</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="score-pill score-${scoreColor(lead.score || 0)}" style="font-size:22px;padding:6px 14px">${(lead.score || 0).toFixed(1)}</span>
          <span style="font-size:13px;color:var(--text-secondary)">/10</span>
          ${lead.scoreDetails ? `<span style="font-size:12px;color:var(--text-muted)">${esc(lead.scoreDetails)}</span>` : ''}
        </div>
      </div>
    </div>`;

  // ── Tab: Problemen & Taken ─────────────────────────────────────────────────
  function buildProblemsTab() {
    const problems = lead.problems || [];
    const tasks    = lead.tasks    || [];
    const deliverables = lead.agentDeliverables || [];
    const selIdx = window._selectedProblemIdx ?? 0;
    const activeSub = (window._activeProblemSubTab && window._activeProblemSubTab[lead.id]) || 'chat';
    const checkedSet = (window._checkedProblems && window._checkedProblems[lead.id]) || new Set();

    // Progress
    const totalItems = deliverables.length + tasks.length;
    const doneItems = deliverables.filter(d => d.status === 'approved').length + tasks.filter(t => t.status === 'klaar').length;
    const pct = totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0;

    // ─ LEFT: Problem cards ─
    const selProblem = problems[selIdx];
    const selTxt = selProblem ? (typeof selProblem === 'string' ? selProblem : (selProblem.text || selProblem.description || '')) : '';

    const problemCards = problems.length
      ? problems.map((p, i) => {
          const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
          const low = txt.toLowerCase();
          const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
          const solved = p._solved || false;
          const isSelected = i === selIdx;
          const icon = solved ? '✅' : isCritical ? '🔴' : '🟡';
          const severityLabel = solved ? 'Opgelost' : isCritical ? 'Kritiek' : 'Medium';
          const severityColor = solved ? 'var(--success)' : isCritical ? 'var(--danger)' : '#d97706';
          return `<div class="problem-card${isSelected ? ' selected' : ''}${solved ? ' solved' : ''}" data-problem-idx="${i}" onclick="selectProblemCard(${i},'${esc(lead.id)}')">
            <input type="checkbox" onclick="event.stopPropagation();toggleProblemCheck('${esc(lead.id)}',${i})" ${checkedSet.has(i) ? 'checked' : ''} style="flex-shrink:0;width:15px;height:15px;cursor:pointer;accent-color:var(--accent)">
            <span style="font-size:15px">${icon}</span>
            <span style="flex:1;font-size:13px;line-height:1.4">${esc(txt)}</span>
            <span style="font-size:10px;padding:1px 7px;border-radius:3px;background:${severityColor}22;color:${severityColor};font-weight:600;white-space:nowrap">${severityLabel}</span>
          </div>`;
        }).join('')
      : `<div style="text-align:center;padding:24px 0;color:var(--text-muted)">
          <i class="ti ti-check" style="font-size:28px;display:block;margin-bottom:6px;color:var(--success)"></i>
          <div style="font-size:13px">Geen problemen gevonden voor deze lead.</div>
        </div>`;

    // Sub-tab panel
    // Chat
    const chatSubPanel = `
      <div id="probSubPanel-${lead.id}-chat" style="${activeSub !== 'chat' ? 'display:none' : ''}">
        <div id="agentChatPanel" class="problem-chat-panel" style="border:none;padding:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary)" id="chatProblemTitle">
              ${selTxt ? `<i class="ti ti-robot" style="color:var(--accent);margin-right:6px"></i>${esc(selTxt.substring(0, 80))}` : '<i class="ti ti-robot" style="margin-right:6px"></i>Selecteer een probleem'}
            </div>
            <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--danger)" onclick="clearAgentChat('${esc(lead.id)}')">
              <i class="ti ti-trash"></i> Wissen
            </button>
          </div>
          <div class="agent-chat-history" id="agentChatHistory"></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','actieplan')">📋 Actieplan</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-website')">💻 Website</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-booking')">📅 Booking</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-chatbot')">🤖 Chatbot</button>
          </div>
          <div class="agent-chat-input">
            <textarea id="agentChatMsg" placeholder="Beschrijf wat je wilt bouwen of vraag een actieplan..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAgentChat('${esc(lead.id)}');}"></textarea>
            <button class="btn btn-primary btn-sm" onclick="sendAgentChat('${esc(lead.id)}')"><i class="ti ti-send"></i></button>
          </div>
        </div>
      </div>`;

    // Taken (all project tasks)
    const takenSubPanel = `
      <div id="probSubPanel-${lead.id}-taken" style="${activeSub !== 'taken' ? 'display:none' : ''}">
        <div id="tasks-section-${lead.id}">${buildTasksHTML(lead, state.users || [], 1)}</div>
      </div>`;

    // Bestanden (all deliverables compact)
    const bestandenSubPanel = `
      <div id="probSubPanel-${lead.id}-bestanden" style="${activeSub !== 'bestanden' ? 'display:none' : ''}">
        ${deliverables.length
          ? deliverables.map((d, dIdx) => {
              const dot = d.status === 'approved' ? 'var(--success)' : d.status === 'error' ? 'var(--danger)' : 'var(--warning)';
              const typeIcon = d.type === 'code' ? '💻' : d.deliverableType === 'strategy' ? '📊' : '📄';
              const statusLabel = d.status === 'approved' ? 'Goedgekeurd' : d.status === 'error' ? 'Fout' : 'Wacht';
              return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
                <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></span>
                <span style="font-size:13px;flex:1">${typeIcon} ${esc(d.service)}</span>
                <span style="font-size:11px;color:${dot}">${statusLabel}</span>
                ${d.url ? `<a href="${esc(d.url)}" target="_blank" style="font-size:11px;color:var(--accent)"><i class="ti ti-external-link"></i></a>` : ''}
                ${isAdmin() ? `<button onclick="deleteDeliverable('${esc(lead.id)}',${dIdx})" title="Verwijder" style="width:22px;height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);padding:0;flex-shrink:0" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'"><i class="ti ti-trash" style="font-size:12px"></i></button>` : ''}
              </div>`;
            }).join('')
          : `<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px">
              <i class="ti ti-files" style="font-size:24px;display:block;margin-bottom:6px"></i>
              ${lead.intakeSubmittedAt && isAdmin()
                ? `Nog geen leveringen. <button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-robot"></i> Agents starten</button>`
                : 'Nog geen leveringen gebouwd.'}
            </div>`}
      </div>`;

    const subTabSection = problems.length ? `
      <div style="margin-top:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;border-bottom:1px solid var(--border);padding:0 4px">
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="chat" onclick="switchProblemSubTab('${esc(lead.id)}','chat')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='chat'?'var(--accent)':'transparent'};color:${activeSub==='chat'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-robot"></i> Chat
          </button>
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="taken" onclick="switchProblemSubTab('${esc(lead.id)}','taken')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='taken'?'var(--accent)':'transparent'};color:${activeSub==='taken'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-checklist"></i> Taken
          </button>
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="bestanden" onclick="switchProblemSubTab('${esc(lead.id)}','bestanden')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='bestanden'?'var(--accent)':'transparent'};color:${activeSub==='bestanden'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-files"></i> Bestanden
          </button>
        </div>
        <div style="padding:14px 16px">
          ${chatSubPanel}
          ${takenSubPanel}
          ${bestandenSubPanel}
        </div>
      </div>` : `<div id="tasks-section-${lead.id}" style="margin-top:16px">${buildTasksHTML(lead, state.users || [], 1)}</div>`;

    const leftPanel = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin:0">
            <i class="ti ti-alert-circle" style="color:var(--danger);margin-right:6px"></i>Gevonden problemen
            ${problems.length ? `<span style="font-size:11px;background:var(--danger-light,#fef2f2);color:var(--danger);border-radius:4px;padding:1px 8px;margin-left:6px">${problems.length}</span>` : ''}
          </div>
        </div>
        ${problemCards}
        <button id="startCheckedBtn-${lead.id}" onclick="startCheckedProblems('${esc(lead.id)}')" style="display:${checkedSet.size>0?'flex':'none'};width:100%;margin-top:10px;align-items:center;justify-content:center;gap:6px" class="btn btn-dark btn-sm">
          <i class="ti ti-rocket"></i> Start met ${checkedSet.size} aangevinkte probleem${checkedSet.size===1?'':'en'}
        </button>
        ${subTabSection}
      </div>`;

    // ─ RIGHT: Overview panel ─
    const progressBlock = `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface);margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Algehele voortgang</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div style="font-size:26px;font-weight:800;color:${pct>=100?'var(--success)':pct>=50?'var(--accent)':'var(--text)'}">${pct}%</div>
          <div style="flex:1">
            <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
              <div style="height:100%;background:${pct>=100?'var(--success)':'var(--accent)'};border-radius:3px;width:${pct}%;transition:width .4s"></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${doneItems} van ${totalItems} items</div>
          </div>
        </div>
        <div style="display:flex;gap:14px;font-size:12px;color:var(--text-secondary)">
          <span><i class="ti ti-check" style="color:var(--success)"></i> ${deliverables.filter(d=>d.status==='approved').length}/${deliverables.length} leveringen</span>
          <span><i class="ti ti-checklist" style="color:var(--accent)"></i> ${tasks.filter(t=>t.status==='klaar').length}/${tasks.length} taken</span>
        </div>
      </div>`;

    const delivOverview = deliverables.length ? `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface);margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Leveringen</div>
        ${deliverables.map(d => {
          const dot = d.status === 'approved' ? '#10b981' : d.status === 'error' ? '#ef4444' : '#f59e0b';
          const typeIcon = d.type === 'code' ? '💻' : d.deliverableType === 'strategy' ? '📊' : '📄';
          return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></span>
            <span style="font-size:12px;flex:1">${typeIcon} ${esc(d.service)}</span>
            ${d.url ? `<a href="${esc(d.url)}" target="_blank" style="color:var(--accent);font-size:11px"><i class="ti ti-external-link"></i></a>` : ''}
          </div>`;
        }).join('')}
      </div>` : '';

    const checklistTasks = tasks.filter(t => !t.week || t.week <= 2).slice(0, 8);
    const masterChecklist = `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface)">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Handmatige checklist</div>
        ${checklistTasks.length
          ? checklistTasks.map(t => {
              const tid = t.id || t._id || String(tasks.indexOf(t));
              const done = t.status === 'klaar';
              return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer">
                <input type="checkbox" ${done?'checked':''} onchange="toggleProjectTask('${esc(lead.id)}','${esc(tid)}',this.checked)" style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0">
                <span style="font-size:12px;${done?'text-decoration:line-through;color:var(--text-muted)':''}">${esc(t.title||t.text||'Taak')}</span>
              </label>`;
            }).join('')
          : `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px 0">Geen taken aangemaakt</div>`}
        ${lead.agentsRanAt && isAdmin() ? `<div style="margin-top:10px;font-size:11px;color:var(--text-muted)"><i class="ti ti-robot"></i> Laatste run: ${formatDate(lead.agentsRanAt)}</div>` : ''}
      </div>`;

    const rightPanel = `<div>${progressBlock}${delivOverview}${masterChecklist}</div>`;

    return `
      <div class="project-tab-content" data-tab-content="taken" style="${activeTab !== 'taken' ? 'display:none' : ''}">
        <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start">
          ${leftPanel}
          ${rightPanel}
        </div>
      </div>`;
  }

  // ── Tab: Emails ─────────────────────────────────────────────────────────────
  function buildEmailsTab() {
    const emailEvents = new Set(['emailSent','followupSent','aiReplySent','clientEmailSent','sent','followup1','followup2']);
    const historyEmails = (lead.history || []).filter(h => emailEvents.has(h.event));
    const clientEmails = lead.clientEmailLog || [];

    const sentWelcome = clientEmails.find(e => e.trigger === 'welcome');
    const sentIntake  = clientEmails.find(e => e.trigger === 'intakeReceived') || (lead.intakeToken ? clientEmails.find(e => e.trigger === 'intake') : null);
    const sentInvoice = clientEmails.find(e => e.trigger === 'invoice' || e.trigger === 'factuur');
    const intakeUrl   = lead.intakeToken ? `${window.location.origin}/intake/${lead.id}/${lead.intakeToken}` : null;

    function actionRow(icon, label, sentEntry, actionHtml) {
      const sentBadge = sentEntry
        ? `<span style="font-size:11px;color:var(--success);display:flex;align-items:center;gap:4px"><i class="ti ti-check"></i> Verstuurd op ${formatDate(sentEntry.sentAt || sentEntry.createdAt)}</span>`
        : actionHtml;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ${icon}" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <span style="font-size:14px;font-weight:500;flex:1">${label}</span>
          ${sentBadge}
        </div>`;
    }

    const actionSection = `
      <div style="margin-bottom:20px">
        <div class="project-section-title"><i class="ti ti-send" style="color:var(--accent);margin-right:6px"></i>Versturen</div>
        ${actionRow('ti-hand-stop', 'Welkomstmail', sentWelcome,
            `<button class="btn btn-sm btn-primary" onclick="sendClientEmail('${lead.id}','welcome')"><i class="ti ti-send"></i> Versturen</button>`)}
        ${actionRow('ti-clipboard-list', 'Intake formulier', sentIntake,
            intakeUrl
              ? `<div style="display:flex;align-items:center;gap:6px">
                   <button class="btn btn-sm btn-primary" onclick="sendClientEmail('${lead.id}','intakeReceived')"><i class="ti ti-send"></i> Versturen</button>
                   <button class="btn btn-sm btn-outline" onclick="copyToClipboard('${intakeUrl}','Link gekopieerd!')"><i class="ti ti-copy"></i> Link</button>
                 </div>`
              : `<span style="font-size:12px;color:var(--text-muted)">Start eerst het project</span>`)}
        ${actionRow('ti-receipt', 'Factuur versturen', sentInvoice,
            `<button class="btn btn-sm btn-outline" onclick="createPayment('${lead.id}')"><i class="ti ti-plus"></i> Factuur aanmaken</button>`)}
        ${(() => {
          const lastWeekly = clientEmails.filter(e => e.trigger === 'weeklyUpdate').sort((a,b) => new Date(b.sentAt)-new Date(a.sentAt))[0];
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
            <i class="ti ti-calendar-week" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:500">Weekupdate</div>
              ${lastWeekly ? `<div style="font-size:11px;color:var(--text-muted)">Laatste: ${relativeTime(lastWeekly.sentAt)}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-outline" onclick="sendWeeklyUpdate('${lead.id}')"><i class="ti ti-mail-forward"></i> Weekupdate sturen</button>
          </div>`;
        })()}
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ti-pencil" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <span style="font-size:14px;font-weight:500;flex:1">Handmatige email</span>
          <button class="btn btn-sm btn-outline" onclick="openManualEmailModal('${lead.id}')"><i class="ti ti-mail-plus"></i> Opstellen</button>
        </div>
        ${(() => {
          const oe = lead.opleveringEmail;
          if (oe) {
            return `<div style="padding:14px 16px;border:2px solid var(--success);border-radius:10px;margin-bottom:8px;background:var(--success-light)">
              <div style="display:flex;align-items:flex-start;gap:10px">
                <i class="ti ti-package" style="color:var(--success);font-size:18px;flex-shrink:0;margin-top:2px"></i>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:14px;font-weight:600">📦 Oplevering email</span>
                    <span style="font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 7px;color:var(--text-secondary)">Gegenereerd op ${formatDate(oe.generatedAt)}</span>
                    ${oe.sentAt ? `<span style="font-size:11px;background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 7px;font-weight:600"><i class="ti ti-check" style="font-size:10px"></i> Verstuurd ${relativeTime(oe.sentAt)}</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Onderwerp: ${esc(oe.subject)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${esc((oe.body||'').substring(0,100))}${(oe.body||'').length>100?'…':''}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-primary" onclick="openSavedDeliveryEmail('${lead.id}')"><i class="ti ti-eye"></i> Bekijk &amp; verstuur</button>
                    ${oe.sentAt ? `<button class="btn btn-sm btn-outline" onclick="openSavedDeliveryEmail('${lead.id}')"><i class="ti ti-send"></i> Stuur opnieuw</button>` : ''}
                    <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="generateDeliveryEmail('${lead.id}', true)"><i class="ti ti-refresh"></i> Opnieuw genereren</button>
                  </div>
                </div>
              </div>
            </div>`;
          }
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:2px solid var(--accent);border-radius:10px;margin-bottom:8px;background:var(--accent-light)">
            <i class="ti ti-package" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600">Oplevering email</div>
              <div style="font-size:12px;color:var(--text-muted)">AI genereert email met alles wat gebouwd is + instructies voor klant</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="generateDeliveryEmail('${lead.id}')"><i class="ti ti-sparkles"></i> Genereer &amp; stuur</button>
          </div>`;
        })()}
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ti-clipboard-list" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:500">Admin instructies</div>
            <div style="font-size:12px;color:var(--text-muted)">Intern document: wat gebouwd is, links, wat klant moet doen</div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="generateAdminInstructions('${lead.id}')"><i class="ti ti-file-text"></i> Genereer</button>
        </div>
      </div>`;

    const historyRows = historyEmails.length
      ? historyEmails.slice().sort((a,b) => new Date(b.time)-new Date(a.time)).map(h => `
          <div style="padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <i class="ti ti-mail" style="color:var(--accent)"></i>
              <span style="font-size:13px;font-weight:500;flex:1">${esc(h.label || h.event)}</span>
              ${(lead.emailOpened || lead.openedAt) ? `<span class="badge badge-blue" style="font-size:10px"><i class="ti ti-eye"></i> Geopend${lead.openCount > 1 ? ' (' + lead.openCount + 'x)' : ''}</span>` : ''}
              ${lead.repliedAt ? `<span class="badge badge-green" style="font-size:10px"><i class="ti ti-message"></i> Gereageerd</span>` : ''}
              <span style="font-size:11px;color:var(--text-muted)">${relativeTime(h.time)}</span>
            </div>
            ${lead.contactEmail ? `<div style="font-size:12px;color:var(--text-secondary)">→ ${esc(lead.contactEmail)}</div>` : ''}
          </div>
        `).join('')
      : '';

    const clientRows = clientEmails.map(e => `
      <div style="padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <i class="ti ti-mail-forward" style="color:#7c3aed"></i>
          <span style="font-size:13px;font-weight:500;flex:1">${esc(e.trigger || 'Klant email')}</span>
          <span style="font-size:11px;color:var(--text-muted)">${relativeTime(e.sentAt || e.createdAt)}</span>
        </div>
        ${e.subject ? `<div style="font-size:12px;font-weight:600;margin-bottom:4px">${esc(e.subject)}</div>` : ''}
        ${e.body ? `<details style="font-size:12px;color:var(--text-secondary)"><summary style="cursor:pointer">Bekijk email</summary><pre style="white-space:pre-wrap;margin-top:6px">${esc(e.body.substring(0,400))}${e.body.length > 400 ? '...' : ''}</pre></details>` : ''}
      </div>
    `).join('');

    const replySection = lead.lastReplyText ? `
      <div style="margin-bottom:20px">
        <div class="project-section-title"><i class="ti ti-message-reply" style="color:var(--success);margin-right:6px"></i>Laatste reactie</div>
        <div style="padding:14px 16px;border:1px solid var(--success);border-radius:10px;background:#f0fdf4;font-size:13px;color:var(--text);white-space:pre-wrap">${esc(lead.lastReplyText)}</div>
      </div>
    ` : '';

    return `
      <div class="project-tab-content" data-tab-content="emails" style="${activeTab !== 'emails' ? 'display:none' : ''}">
        ${actionSection}
        ${replySection}
        ${historyRows || clientRows ? `
          <div class="project-section-title" style="margin-top:4px"><i class="ti ti-history" style="color:var(--text-muted);margin-right:6px"></i>Geschiedenis</div>
          ${historyRows}${clientRows}
        ` : ''}
      </div>`;
  }

  // ── Tab: Intake ─────────────────────────────────────────────────────────────
  function buildIntakeTabProject() {
    if (!lead.intakeToken) return '';
    const intakeUrl = `${window.location.origin}/intake/${lead.id}/${lead.intakeToken}`;
    return `
      <div class="project-tab-content" data-tab-content="intake" style="${activeTab !== 'intake' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-clipboard-list" style="color:var(--accent);margin-right:6px"></i>Intake formulier</div>
          ${lead.intakeSubmittedAt
            ? `<span class="badge badge-green"><i class="ti ti-check"></i> Ingevuld ${formatDate(lead.intakeSubmittedAt)}</span>`
            : `<span class="badge badge-warning">Nog niet ingevuld</span>`}
        </div>
        ${lead.intakeAnswers && Object.keys(lead.intakeAnswers).length ? `
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
            ${Object.entries(lead.intakeAnswers).map(([q, a]) => `
              <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${esc(q)}</div>
                <div style="font-size:13px;color:var(--text-primary);white-space:pre-line">${esc(a)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De klant heeft de intake nog niet ingevuld.</div>
        `}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${intakeUrl}" target="_blank" class="btn btn-ghost btn-sm">
            <i class="ti ti-external-link"></i> Intake link openen
          </a>
          <button class="btn btn-ghost btn-sm" onclick="copyText('${intakeUrl}'); toast('Link gekopieerd!','success')">
            <i class="ti ti-copy"></i> Link kopiëren
          </button>
        </div>
      </div>`;
  }

  // ── Tab: Betalingen ─────────────────────────────────────────────────────────
  function buildBetalingenTabProject() {
    const payments = lead.payments || [];
    return `
      <div class="project-tab-content" data-tab-content="betalingen" style="${activeTab !== 'betalingen' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-coin" style="color:var(--accent);margin-right:6px"></i>Betalingen</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="createPayment('${lead.id}')"><i class="ti ti-plus"></i> Nieuwe factuur</button>` : ''}
        </div>
        ${payments.length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...payments].reverse().map(p => {
              const statusColors = { sent: '#d97706', paid: '#16a34a', failed: '#dc2626', cancelled: '#9ca3af' };
              const statusLabels = { sent: 'Verstuurd', paid: 'Betaald', failed: 'Mislukt', cancelled: 'Geannuleerd' };
              const isOverdue = p.status === 'sent' && p.dueDate && new Date(p.dueDate) < new Date();
              return `
                <div style="border:1px solid ${isOverdue ? '#fecaca' : 'var(--border)'};border-radius:10px;padding:12px 14px;background:${isOverdue ? '#fef2f2' : 'var(--surface)'}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <div style="flex:1">
                      <div style="font-size:14px;font-weight:700">€${(p.amount||0).toLocaleString('nl-NL')}</div>
                      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(p.description||'')}${p.splitIndex ? ` — deel ${p.splitIndex}/${p.splitTotal}` : ''}</div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
                        <span style="font-size:10px;font-weight:700;background:${isOverdue?'#fef2f2':'#f3f4f6'};color:${isOverdue?'#dc2626':statusColors[p.status]||'#6b7280'};border-radius:4px;padding:2px 6px">${isOverdue?'ACHTERSTALLIG':statusLabels[p.status]||p.status}</span>
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
          <div style="text-align:center;padding:32px;font-size:13px;color:#9ca3af">
            <i class="ti ti-coin" style="font-size:28px;display:block;margin-bottom:8px"></i>
            Nog geen betalingen aangemaakt
          </div>
        `}
      </div>`;
  }

  // ── Tab: Voorstel ────────────────────────────────────────────────────────────
  function buildVoorstelTabProject() {
    return `
      <div class="project-tab-content" data-tab-content="voorstel" style="${activeTab !== 'voorstel' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-file-text" style="color:var(--accent);margin-right:6px"></i>Offerte / voorstel</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="propGenBtn-proj-${lead.id}" onclick="openProposalModal('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuw voorstel
          </button>` : ''}
        </div>

        ${_buildProposalsListHtml(lead)}

        ${lead.proposals?.length ? '' : `
          <div style="text-align:center;padding:32px">
            <i class="ti ti-file-description" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen voorstel gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Nieuw voorstel" om een PDF-offerte op maat te maken</div>
          </div>`}

        ${lead.proposal ? `
          <details style="margin-top:12px">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;padding:6px 0">Oud AI-voorstel tonen</summary>
            <div style="margin-top:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn btn-ghost btn-sm" onclick="downloadProposal('${lead.id}')"><i class="ti ti-download"></i> Download HTML</button>
                <button class="btn btn-ghost btn-sm" onclick="sendProposalEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
              </div>
              <div class="proposal-preview">
                <iframe id="proposalFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:420px"></iframe>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Gegenereerd op ${new Date(lead.proposalGeneratedAt).toLocaleDateString('nl-NL')}</div>
            </div>
          </details>` : ''}
      </div>`;
  }

  // ── Tab: Contract ────────────────────────────────────────────────────────────
  function buildContractTabProject() {
    return `
      <div class="project-tab-content" data-tab-content="contract" style="${activeTab !== 'contract' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-file-certificate" style="color:var(--accent);margin-right:6px"></i>Dienstverleningsovereenkomst</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${lead.contract ? `
              <button class="btn btn-ghost btn-sm" onclick="downloadContract('${lead.id}')"><i class="ti ti-download"></i> Download</button>
              <button class="btn btn-ghost btn-sm" onclick="sendContractEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
            ` : ''}
            ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="generateContract('${lead.id}')" id="contractGenBtn-${lead.id}">
              <i class="ti ti-file-certificate"></i> ${lead.contract ? 'Regenereer' : 'Genereer contract'}
            </button>` : ''}
          </div>
        </div>
        ${lead.contract ? `
          <div class="proposal-preview">
            <iframe id="contractFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:520px"></iframe>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
            Gegenereerd op ${new Date(lead.contractGeneratedAt).toLocaleDateString('nl-NL')}
            ${lead.contractSentAt ? ` · <span style="color:var(--success)"><i class="ti ti-check"></i> Verstuurd op ${new Date(lead.contractSentAt).toLocaleDateString('nl-NL')}</span>` : ''}
          </div>
        ` : `
          <div style="text-align:center;padding:32px">
            <i class="ti ti-file-certificate" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen contract gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Genereer contract" om een juridisch contract op te stellen</div>
          </div>
        `}
        <div id="contractProgress-proj-${lead.id}" style="display:none">
          <div class="proposal-progress">
            <div id="contractStep1-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contractgegevens ophalen</div>
            <div id="contractStep2-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opstellen</div>
            <div id="contractStep3-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opslaan</div>
          </div>
        </div>
      </div>`;
  }

  // ── Tab: Building (agent build dashboard) ─────────────────────────────────
  function buildBuildingTab() {
    const deliverables = lead.agentDeliverables || [];
    const running = !!(window._buildAllRunning && window._buildAllRunning[lead.id]);
    const progress = (window._buildAllProgress && window._buildAllProgress[lead.id]) || [];

    const doneCount    = running ? progress.filter(p => p.status === 'done').length   : deliverables.filter(d => d.status !== 'error').length;
    const errorCount   = running ? progress.filter(p => p.status === 'error').length  : deliverables.filter(d => d.status === 'error').length;
    const totalCount   = running ? progress.length : deliverables.length;
    const approvedCount = deliverables.filter(d => d.status === 'approved').length;
    const pendingCount  = deliverables.filter(d => d.status !== 'approved' && d.status !== 'error').length;

    // Empty state
    if (!deliverables.length && !running) {
      return `
        <div class="project-tab-content" data-tab-content="building" style="${activeTab !== 'building' ? 'display:none' : ''}">
          <div style="text-align:center;padding:48px 20px">
            <i class="ti ti-hammer" style="font-size:44px;color:var(--text-muted);display:block;margin-bottom:14px"></i>
            <div style="font-size:15px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Nog niets gebouwd</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Start via de intake flow hierboven in het Overzicht.</div>
            ${lead.intakeSubmittedAt && isAdmin() ? `<button class="btn btn-primary" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-rocket"></i> Nu starten</button>` : ''}
          </div>
        </div>`;
    }

    // Overall progress bar (during build)
    const overallPct = running && progress.length ? Math.round((progress.filter(p => p.status === 'done' || p.status === 'error').length / progress.length) * 100) : 0;
    const buildingIdx = running ? progress.findIndex(p => p.status === 'building') : -1;
    const remainingServices = running ? progress.filter(p => p.status === 'waiting').length : 0;
    const estMinutes = remainingServices * 1.5;

    const overallProgressBar = running ? `
      <div style="margin-bottom:18px;padding:16px 18px;border:1px solid var(--accent);border-radius:12px;background:linear-gradient(135deg,#eff6ff,#f8faff)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
          <div style="font-size:14px;font-weight:700;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig met bouwen... ${overallPct}% voltooid</div>
          ${estMinutes > 0 ? `<div style="font-size:12px;color:var(--text-muted)">~${Math.ceil(estMinutes)} min resterend</div>` : ''}
        </div>
        <div style="height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
          <div style="height:100%;background:var(--accent);border-radius:4px;width:${overallPct}%;transition:width .5s"></div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${doneCount} van ${totalCount} klaar${errorCount > 0 ? ` · ${errorCount} mislukt` : ''}</div>
      </div>
    ` : '';

    // Live progress cards (during build)
    const liveCards = running && progress.length ? progress.filter(p => p && p.service).map(p => {
      const slug = (p.service || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const borderColor = p.status === 'building' ? 'var(--accent)' : p.status === 'done' ? 'var(--success)' : p.status === 'error' ? 'var(--danger)' : 'var(--border)';
      const statusHtml = p.status === 'waiting'
        ? `<span style="font-size:12px;color:var(--text-muted)"><i class="ti ti-clock"></i> Wachten</span>`
        : p.status === 'building'
          ? `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`
          : p.status === 'done'
            ? `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar ✓</span>`
            : `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
      return `
        <div id="build-card-${lead.id}-${slug}" style="border:1.5px solid ${borderColor};border-radius:10px;padding:12px 16px;margin-bottom:8px;background:var(--surface);transition:border-color .3s">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${p.status==='building'?'8':'0'}px">
            <div style="font-size:13px;font-weight:600">${esc(p.service)}</div>
            <div class="build-status">${statusHtml}</div>
          </div>
          <div class="build-progress-wrap" style="${p.status!=='building'?'display:none':''}">
            <div style="height:4px;background:var(--surface-2);border-radius:2px;overflow:hidden">
              <div class="build-progress-bar" style="height:100%;background:var(--accent);border-radius:2px;width:${p.percent}%;transition:width .4s"></div>
            </div>
          </div>
        </div>`;
    }).join('') : '';

    // Deliverable cards (post-build)
    const deliverableCards = deliverables.map((d, i) => {
      const isHtml = d.type === 'code';
      const typeIcon = isHtml ? '💻' : (d.deliverableType === 'strategy' ? '📊' : '📄');
      const typeLabel = isHtml ? 'HTML build' : (d.deliverableType === 'strategy' ? 'Strategie' : 'Document');

      const statusBadge = d.status === 'approved'
        ? `<span class="badge badge-green"><i class="ti ti-check"></i> Goedgekeurd</span>`
        : d.status === 'error'
          ? `<span class="badge badge-red"><i class="ti ti-x"></i> Fout</span>`
          : `<span class="badge badge-warning"><i class="ti ti-clock"></i> Wacht op goedkeuring</span>`;

      const preview = isHtml && d.html
        ? `<div style="margin:12px 0">
            <iframe srcdoc="${esc(d.html)}" sandbox="allow-scripts allow-same-origin" style="width:100%;height:300px;border:1px solid var(--border);border-radius:8px"></iframe>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            ${d.url ? `<a href="${esc(d.url)}" target="_blank" class="btn btn-ghost btn-sm"><i class="ti ti-external-link"></i> Bekijken</a>` : ''}
            ${d.url ? `<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${esc(d.url)}').then(()=>toast('URL gekopieerd!','success'))"><i class="ti ti-copy"></i> Kopieer link</button>` : ''}
          </div>
          <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">WAT DE KLANT NOG MOET DOEN</div>
            <div style="font-size:13px;white-space:pre-line;color:var(--text)">${esc(d.todoText) || `1. Ga naar jullie website builder\n2. Maak een nieuwe pagina aan\n3. Voeg een HTML-blok of embed-sectie toe\n4. Plak deze code:\n\n<iframe src="${esc(d.url||'')}" width="100%" height="600" frameborder="0"></iframe>\n\n5. Sla op en publiceer de pagina`}</div>
          </div>`
        : (d.html || d.instructions || d.content)
          ? `<div style="padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin:10px 0;max-height:220px;overflow-y:auto">
              <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">${typeLabel.toUpperCase()}</div>
              <div style="font-size:13px;white-space:pre-line;line-height:1.6;color:var(--text)">${esc(((d.html||d.instructions||d.content)||'').slice(0,800))}${((d.html||d.instructions||d.content)||'').length>800?'…':''}</div>
            </div>`
          : d.status === 'error'
            ? `<div style="padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin:8px 0;font-size:13px;color:#dc2626">${esc(d.error||'Onbekende fout')}</div>`
            : '';

      const actions = d.status !== 'approved' && d.status !== 'error' && isAdmin() ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
          ${isHtml
            ? `<button class="btn btn-primary btn-sm" onclick="approveDeliverable('${esc(lead.id)}',${i})"><i class="ti ti-check"></i> Goedkeuren &amp; naar klant</button>`
            : `<button class="btn btn-primary btn-sm" id="manualApproveBtn-${esc(lead.id)}-${i}" onclick="approveManualDeliverable('${esc(lead.id)}',${i})"><i class="ti ti-send"></i> Goedkeuren &amp; naar klant</button>`}
          <button class="btn btn-ghost btn-sm" onclick="toggleDeliverableChat('${esc(lead.id)}',${i})"><i class="ti ti-message"></i> Aanpassen</button>
        </div>` : '';

      const errorActions = d.status === 'error' && isAdmin() ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
          <button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="retryBuildService('${esc(lead.id)}','${esc(d.service)}')"><i class="ti ti-refresh"></i> Probeer opnieuw</button>
        </div>` : '';

      const chatPanel = isAdmin() ? `
        <div id="delivChat-${lead.id}-${i}" style="display:none;margin-top:12px;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px"><i class="ti ti-robot" style="margin-right:4px"></i>Aanpassen via AI</div>
          <textarea id="delivChatInput-${lead.id}-${i}" class="form-input" rows="2" placeholder="Beschrijf wat er anders moet..." style="resize:vertical;font-size:13px;margin-bottom:8px"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" onclick="toggleDeliverableChat('${esc(lead.id)}',${i})">Sluiten</button>
            <button class="btn btn-primary btn-sm" onclick="sendDeliverableAdjust('${esc(lead.id)}',${i})"><i class="ti ti-send"></i> Aanpassing sturen</button>
          </div>
        </div>` : '';

      const timestamps = [
        d.builtAt ? `<span><i class="ti ti-hammer" style="margin-right:2px"></i>Gebouwd op ${formatDateTime(d.builtAt)}</span>` : '',
        d.approvedAt ? `<span style="color:var(--success)"><i class="ti ti-check" style="margin-right:2px"></i>Goedgekeurd op ${formatDateTime(d.approvedAt)}</span>` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      return `<div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:12px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:700">${esc(d.service)}</div>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="font-size:11px;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 7px">${typeIcon} ${typeLabel}</span>
            ${statusBadge}
            ${isAdmin() ? `<button onclick="deleteDeliverable('${esc(lead.id)}',${i})" title="Verwijder levering" style="width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);transition:color .15s,background .15s;flex-shrink:0" onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='var(--text-muted)';this.style.background='transparent'"><i class="ti ti-trash" style="font-size:14px"></i></button>` : ''}
          </div>
        </div>
        ${timestamps ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">${timestamps}</div>` : '<div style="margin-bottom:8px"></div>'}
        ${preview}
        ${actions}
        ${errorActions}
        ${chatPanel}
      </div>`;
    }).join('');

    // Right-side summary panel
    const totalBuildMs = deliverables.reduce((s, d) => s + (d.buildTimeMs || 0), 0);
    const totalBuildMin = totalBuildMs > 0 ? Math.ceil(totalBuildMs / 60000) : null;

    const rightPanel = (!running && deliverables.length) ? `
      <div style="flex-shrink:0;width:220px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;align-self:flex-start;position:sticky;top:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:12px">Samenvatting</div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Klaar</span>
          <span style="font-weight:600;color:var(--success)">${doneCount}</span>
        </div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Goedgekeurd</span>
          <span style="font-weight:600;color:var(--accent)">${approvedCount}</span>
        </div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Wacht</span>
          <span style="font-weight:600;color:var(--warning)">${pendingCount}</span>
        </div>
        ${errorCount > 0 ? `<div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Mislukt</span>
          <span style="font-weight:600;color:var(--danger)">${errorCount}</span>
        </div>` : ''}
        ${totalBuildMin ? `<div style="margin-bottom:12px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Bouwtijd</span>
          <span style="font-weight:600">${totalBuildMin}min</span>
        </div>` : ''}
        <div style="height:1px;background:var(--border);margin-bottom:12px"></div>
        ${isAdmin() && pendingCount > 0 ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:8px" onclick="approveAllDeliverables('${esc(lead.id)}')"><i class="ti ti-checks"></i> Alles goedkeuren</button>` : ''}
        ${isAdmin() && approvedCount > 0 ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px" onclick="sendAllDeliverablesToClient('${esc(lead.id)}')"><i class="ti ti-send"></i> Stuur alles naar klant</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" style="width:100%" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw bouwen</button>` : ''}
      </div>` : '';

    return `
      <div class="project-tab-content" data-tab-content="building" style="${activeTab !== 'building' ? 'display:none' : ''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="project-section-title" style="margin:0"><i class="ti ti-hammer" style="color:var(--accent);margin-right:6px"></i>Building</div>
            ${!running && deliverables.length ? `<span class="build-counter" style="font-size:12px;color:var(--text-muted)">${doneCount} van ${totalCount} gebouwd${errorCount > 0 ? ` · ${errorCount} mislukt` : ''}</span>` : ''}
          </div>
          ${!running && lead.intakeSubmittedAt && isAdmin() && deliverables.length ? `<button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw</button>` : ''}
        </div>
        ${overallProgressBar}
        <div style="display:flex;gap:20px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            ${liveCards}
            ${deliverableCards}
          </div>
          ${rightPanel}
        </div>
      </div>`;
  }

  // ── Tab: Bestanden ──────────────────────────────────────────────────────────
  function buildProjectFilesTab() {
    const files = lead.projectFiles || [];
    const fileRows = files.map(f => {
      const icon = f.type === 'html' ? '🌐' : f.type === 'document' ? '📄' : '📊';
      const fullUrl = f.fullUrl || (f.url.startsWith('http') ? f.url : window.location.origin + f.url);
      const shared = f.sharedWithClient;
      return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <span style="font-size:22px;flex-shrink:0;margin-top:2px">${icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(f.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Aangemaakt op ${formatDate(f.createdAt)}${f.problem ? ` · ${esc(f.problem.substring(0,50))}` : ''}</div>
            <a href="${esc(fullUrl)}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all;display:block;margin-bottom:8px">${esc(fullUrl)}</a>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <a href="${esc(fullUrl)}" target="_blank" class="btn btn-sm btn-ghost" style="font-size:11px"><i class="ti ti-eye"></i> Preview</a>
              <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="navigator.clipboard.writeText('${esc(fullUrl)}').then(()=>toast('URL gekopieerd!','success'))"><i class="ti ti-copy"></i> Kopieer</button>
              <button class="btn btn-sm ${shared ? 'btn-outline' : 'btn-ghost'}" style="font-size:11px;${shared ? 'color:var(--success);border-color:var(--success)' : 'color:var(--text-muted)'}" onclick="toggleProjectFileShare('${esc(lead.id)}','${esc(f.id)}',${!shared})">
                ${shared ? '<i class="ti ti-check"></i> Zichtbaar voor klant' : '<i class="ti ti-eye-off"></i> Alleen admin'}
              </button>
              <button class="btn btn-sm btn-ghost" style="font-size:11px;color:var(--danger)" onclick="deleteProjectFile('${esc(lead.id)}','${esc(f.id)}')"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="project-tab-content" data-tab-content="bestanden" style="${activeTab !== 'bestanden' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-files" style="color:var(--accent);margin-right:6px"></i>Project bestanden</div>
          <button class="btn btn-sm btn-outline" onclick="openAddProjectFileModal('${esc(lead.id)}')"><i class="ti ti-plus"></i> Bestand toevoegen</button>
        </div>
        ${files.length === 0
          ? `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px"><i class="ti ti-files" style="font-size:32px;display:block;margin-bottom:8px;opacity:.4"></i>Nog geen bestanden — ze verschijnen hier automatisch na een agent build.</div>`
          : fileRows}
        <div style="margin-top:16px;padding:12px 14px;background:var(--surface-2);border-radius:8px;font-size:12px;color:var(--text-muted)">
          <i class="ti ti-info-circle" style="margin-right:4px"></i>
          Bestanden met <strong>Zichtbaar voor klant</strong> verschijnen automatisch in het klantportaal onder Leveringen.
        </div>
      </div>`;
  }

  // ── Tab: Website ────────────────────────────────────────────────────────────
  function buildWebsiteTabProject() {
    const site = lead.generatedSite;
    if (!site) {
      return `
        <div class="project-tab-content" data-tab-content="website" style="${activeTab !== 'website' ? 'display:none' : ''}">
          <div style="text-align:center;padding:40px 20px;color:var(--text-secondary)">
            <i class="ti ti-world" style="font-size:40px;margin-bottom:12px;display:block;color:var(--text-muted)"></i>
            <div style="font-size:15px;font-weight:600;margin-bottom:8px">Nog geen website gegenereerd</div>
            <div style="font-size:13px;margin-bottom:20px">Genereer een professionele website op maat voor ${esc(lead.companyName)}.</div>
            ${isAdmin() ? `<button class="btn btn-primary" onclick="generateSite('${esc(lead.id)}')"><i class="ti ti-wand"></i> Website genereren</button>` : `<span class="employee-notice"><i class="ti ti-lock"></i> Alleen admins kunnen websites genereren</span>`}
          </div>
        </div>`;
    }
    return `
      <div class="project-tab-content" data-tab-content="website" style="${activeTab !== 'website' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <span class="site-status-badge ${site.status === 'live' ? 'site-status-live' : 'site-status-preview'}">${site.status === 'live' ? 'Live' : 'Preview'}</span>
          <a href="${esc(site.siteUrl)}" target="_blank" class="btn btn-sm btn-outline"><i class="ti ti-external-link"></i> Bekijk live</a>
          <button class="btn btn-sm btn-outline" onclick="openSeoPanel('${esc(lead.id)}')"><i class="ti ti-search"></i> SEO</button>
          ${isAdmin() ? `<button class="btn btn-sm btn-ghost" onclick="generateSite('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Regenereer</button>` : ''}
        </div>
        <iframe src="${esc(site.siteUrl)}?_t=${Date.now()}" style="width:100%;height:480px;border:1px solid var(--border);border-radius:10px" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>`;
  }

  // ── Tab: Afspraken ──────────────────────────────────────────────────────────
  const tabAfspraken = `
    <div class="project-tab-content" data-tab-content="afspraken" style="${activeTab !== 'afspraken' ? 'display:none' : ''}">
      ${lead.calendlyBooking ? `
        <div style="padding:16px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <i class="ti ti-calendar-check" style="color:#2563eb"></i>
            <span style="font-size:14px;font-weight:600">${esc(lead.calendlyBooking.eventName || 'Gesprek ingepland')}</span>
          </div>
          ${lead.calendlyBooking.startTime ? `<div style="font-size:13px;color:#1d4ed8">${new Date(lead.calendlyBooking.startTime).toLocaleString('nl-NL', {dateStyle:'full',timeStyle:'short'})}</div>` : ''}
          ${lead.calendlyBooking.inviteeName ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Naam: ${esc(lead.calendlyBooking.inviteeName)}</div>` : ''}
        </div>
      ` : `
        <div style="text-align:center;padding:40px 20px;color:var(--text-secondary)">
          <i class="ti ti-calendar-off" style="font-size:40px;margin-bottom:12px;display:block;color:var(--text-muted)"></i>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">Geen afspraken gevonden</div>
          ${state.settings?.calendlyUrl && lead.contactEmail ? `
            <a class="btn btn-primary" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener">
              <i class="ti ti-calendar-plus"></i> Plan gesprek via Calendly
            </a>` : '<div style="font-size:13px">Stel Calendly in bij Instellingen → API.</div>'}
        </div>
      `}
    </div>`;

  // ── Tab: Documenten ────────────────────────────────────────────────────────
  const docs = lead.documents || [];
  const DOC_TYPE_ICONS = { link: 'ti-link', password: 'ti-lock', note: 'ti-file-text' };
  const DOC_TYPE_COLORS = { link: '#2563eb', password: '#d97706', note: '#16a34a' };
  const DOC_TYPE_BG    = { link: '#eff6ff', password: '#fef3c7', note: '#f0fdf4' };
  const DOC_TYPE_LABELS = { link: 'Link', password: 'Wachtwoord', note: 'Notitie' };

  const tabDocumenten = `
    <div class="project-tab-content" data-tab-content="documenten" style="${activeTab !== 'documenten' ? 'display:none' : ''}">
      ${isAdmin() ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div class="project-section-title" style="margin-bottom:0">Documentvault</div>
        <button class="btn btn-sm btn-primary" onclick="openAddDocModal('${esc(lead.id)}')"><i class="ti ti-plus"></i> Document toevoegen</button>
      </div>` : '<div class="project-section-title"><i class="ti ti-folder" style="color:var(--accent);margin-right:6px"></i>Documenten</div>'}

      ${docs.length === 0 ? `<div style="font-size:13px;color:var(--text-muted);padding:16px 0;text-align:center">Nog geen documenten toegevoegd.</div>` :
        docs.map(doc => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:var(--surface)">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="width:34px;height:34px;border-radius:8px;background:${DOC_TYPE_BG[doc.type]||'#f3f4f6'};color:${DOC_TYPE_COLORS[doc.type]||'#374151'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="ti ${DOC_TYPE_ICONS[doc.type]||'ti-file'}" style="font-size:16px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-size:14px;font-weight:600">${esc(doc.title||'')}</span>
                  <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${DOC_TYPE_BG[doc.type]||'#f3f4f6'};color:${DOC_TYPE_COLORS[doc.type]||'#374151'}">${DOC_TYPE_LABELS[doc.type]||doc.type}</span>
                  ${isAdmin() ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${doc.visible!==false?'#f0fdf4':'#fef2f2'};color:${doc.visible!==false?'var(--success)':'var(--danger)'}">
                    ${doc.visible!==false?'Zichtbaar':'Verborgen'}
                  </span>` : ''}
                </div>
                ${doc.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(doc.description)}</div>` : ''}
                ${doc.type === 'link' && doc.content ? `
                  <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
                    <a class="btn btn-sm btn-primary" href="${esc(doc.content)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Openen</a>
                    <button class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText('${esc(doc.content)}').then(()=>toast('Link gekopieerd!'))"><i class="ti ti-copy"></i> Kopieer</button>
                  </div>` : ''}
                ${doc.type === 'password' ? `
                  <div style="margin-top:8px">
                    ${doc.username ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Gebruiker: <strong style="color:var(--text)">${esc(doc.username)}</strong></div>` : ''}
                    <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2,#f3f4f6);border-radius:7px;padding:7px 12px;border:1px solid var(--border)">
                      <code style="font-size:13px;flex:1;letter-spacing:.05em" id="appjsPw-${doc.id}">••••••••</code>
                      <button class="btn btn-ghost btn-xs" onclick="(function(id,v){var el=document.getElementById('appjsPw-'+id);el.textContent=el.textContent==='••••••••'?v:'••••••••'})('${doc.id}','${esc(doc.content||'')}')">Toon</button>
                      <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(doc.content||'')}').then(()=>toast('Gekopieerd!'))"><i class="ti ti-copy"></i></button>
                    </div>
                  </div>` : ''}
                ${doc.type === 'note' && doc.content ? `<div style="margin-top:8px;font-size:13px;background:var(--surface-2,#f9fafb);border-radius:7px;padding:10px 12px;white-space:pre-line;line-height:1.6;border:1px solid var(--border)">${esc(doc.content)}</div>` : ''}
              </div>
              ${isAdmin() ? `
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn btn-ghost btn-xs" title="${doc.visible!==false?'Verbergen voor klant':'Tonen voor klant'}" onclick="toggleDocVisibility('${esc(lead.id)}','${doc.id}',${doc.visible===false})">
                  <i class="ti ${doc.visible!==false?'ti-eye-off':'ti-eye'}"></i>
                </button>
                <button class="btn btn-ghost btn-xs" style="color:var(--danger)" onclick="deleteDoc('${esc(lead.id)}','${doc.id}')"><i class="ti ti-trash"></i></button>
              </div>` : ''}
            </div>
          </div>`).join('')}
    </div>`;

  // ── Tab: Klantportaal ───────────────────────────────────────────────────────
  const portalUrl = lead.portalToken ? `${window.location.origin}/portal/${lead.portalToken}` : null;
  const clientLoginUrl = `${window.location.origin}/client/login`;

  // Portal phase labels
  const phaseLabels = ['', 'Fase 1: Intake', 'Fase 2: Uitvoering', 'Fase 3: Oplevering & Check', 'Fase 4: Live gaan', 'Fase 5: Volgende stap'];
  const currentPhase = lead.currentPhase || 1;

  // Deliverable visibility list (for section 3)
  const delivVis = (lead.agentDeliverables || []).map((d, i) => {
    const isVisible = d.clientVisible === true;
    const typeIcon = d.type === 'code' ? '💻' : (d.deliverableType === 'strategy' ? '📊' : '📄');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:var(--surface-2);margin-bottom:6px;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="flex-shrink:0">${typeIcon}</span>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.service)}</div>
            ${d.builtAt ? `<div style="font-size:11px;color:var(--text-muted)">${formatDateTime(d.builtAt)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${d.url ? `<a href="${esc(d.url)}" target="_blank" class="btn btn-ghost btn-xs"><i class="ti ti-external-link"></i></a>` : ''}
          <button class="btn btn-xs ${isVisible ? 'btn-outline' : 'btn-ghost'}" style="${isVisible ? 'border-color:var(--success);color:var(--success)' : 'color:var(--text-muted)'}"
            onclick="toggleDeliverableVisibility('${esc(lead.id)}',${i},${!isVisible})">
            <i class="ti ${isVisible ? 'ti-eye' : 'ti-eye-off'}"></i> ${isVisible ? 'Zichtbaar' : 'Verborgen'}
          </button>
        </div>
      </div>`;
  }).join('');

  // Chat section (reusable)
  const chat = lead.portalChat || [];
  const chatUnread = chat.filter(m => m.from === 'client' && !m.readAt).length;
  const chatSection = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)">
      <div style="max-height:260px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px" id="portalChatThread">
        ${chat.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0">Nog geen berichten in de portaalchat.</div>'
          : chat.map(m => `
            <div style="max-width:82%;${m.from==='client'?'margin-left:auto':'margin-right:auto'}">
              <div style="padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;${m.from==='client'?'background:var(--accent);color:#fff;border-bottom-right-radius:3px':'background:#f3f4f6;color:var(--text);border-bottom-left-radius:3px'}">${esc(m.message||'')}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;${m.from==='client'?'text-align:right':''}">${m.from==='admin'?esc(m.name||'Accountmanager'):esc(m.name||'Klant')} &middot; ${relativeTime(m.time)}</div>
            </div>`).join('')}
      </div>
      ${isAdmin() ? `
      <div style="border-top:1px solid var(--border);padding:10px;display:flex;gap:8px;align-items:flex-end;background:var(--surface)">
        <textarea id="portalReplyInput" placeholder="Stuur een bericht naar de klant..." rows="1"
          style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;resize:none;outline:none;background:var(--surface);color:var(--text);min-height:38px"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendPortalReply('${esc(lead.id)}');}"></textarea>
        <button class="btn btn-primary btn-sm" onclick="sendPortalReply('${esc(lead.id)}')"><i class="ti ti-send"></i></button>
      </div>` : ''}
    </div>`;

  const tabPortaal = `
    <div class="project-tab-content" data-tab-content="portaal" style="${activeTab !== 'portaal' ? 'display:none' : ''}">

      <!-- SECTIE 1: Inloggegevens -->
      <div style="margin-bottom:20px">
        <div class="project-section-title">1 — Inloggegevens klant</div>
        ${lead.portalToken ? `
          <div class="credentials-card">
            <div class="credentials-row">
              <div class="credentials-label">Inlogpagina</div>
              <div class="credentials-value-row">
                <code class="credentials-code">${esc(clientLoginUrl)}</code>
                <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(clientLoginUrl)}');toast('Link gekopieerd!')"><i class="ti ti-copy"></i></button>
                <a class="btn btn-ghost btn-xs" href="${esc(clientLoginUrl)}" target="_blank"><i class="ti ti-external-link"></i></a>
              </div>
            </div>
            <div class="credentials-row">
              <div class="credentials-label">Portaalcode</div>
              <div class="credentials-value-row">
                <code class="credentials-code" id="portalCodeDisplay" style="letter-spacing:3px">••••••••••••</code>
                <button class="btn btn-ghost btn-xs" id="showTokenBtn" onclick="togglePortalToken('${esc(lead.portalToken)}')"><i class="ti ti-eye"></i> Toon</button>
                <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(lead.portalToken)}');toast('Code gekopieerd!')"><i class="ti ti-copy"></i></button>
              </div>
            </div>
            <div class="credentials-hint"><i class="ti ti-info-circle"></i> Stuur de portaalcode naar de klant. Ze loggen in via de inlogpagina met deze code.</div>
            <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-outline" onclick="copyPortalInstructions('${esc(lead.portalToken)}','${esc(clientLoginUrl)}','${esc(lead.companyName)}')"><i class="ti ti-clipboard-text"></i> Kopieer instructies</button>
              <button class="btn btn-sm btn-ghost" onclick="resendWelcomeEmail('${esc(lead.id)}')"><i class="ti ti-mail-forward"></i> Welkomstmail sturen</button>
            </div>
          </div>
        ` : `
          <div class="credentials-card credentials-card-empty">
            <i class="ti ti-lock" style="font-size:24px;color:var(--text-muted);display:block;margin-bottom:8px"></i>
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Nog geen portaal aangemaakt</div>
            <div style="font-size:13px;color:var(--text-muted)">Start het project om automatisch een portaalcode aan te maken.</div>
          </div>
        `}
      </div>

      ${isAdmin() ? `

      <!-- SECTIE 2: Fase beheer -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">2 — Fase beheer</div>
          <span style="font-size:12px;padding:3px 10px;background:var(--accent);color:#fff;border-radius:20px;font-weight:600">${esc(phaseLabels[currentPhase] || `Fase ${currentPhase}`)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="portalPhaseSelect" class="form-input" style="flex:1;min-width:180px;max-width:280px">
            ${phaseLabels.slice(1).map((label, i) => `<option value="${i+1}" ${currentPhase === i+1 ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="savePortalPhase('${esc(lead.id)}')"><i class="ti ti-check"></i> Zet fase handmatig</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px">De klant ziet de huidige fase direct in zijn portaal.</div>
      </div>

      <!-- SECTIE: Diensten & Investering (wat klant ziet in Overzicht) -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:4px">Diensten &amp; Investering</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Wat de klant ziet in het Overzicht tab van het portaal.</div>
        <div id="portalServicesList-${esc(lead.id)}" style="margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="portalServiceAdd-${esc(lead.id)}" class="form-input" style="flex:1;min-width:160px;max-width:260px;font-size:13px">
            <option value="">— Selecteer dienst —</option>
            ${(state.settings?.services || []).map(s => {
              const nm = typeof s === 'string' ? s : (s.name || '');
              const pr = typeof s === 'object' ? (parseFloat(s.price) || 0) : 0;
              const bl = typeof s === 'object' ? (s.billing || 'maandelijks') : 'maandelijks';
              return `<option value="${esc(nm)}" data-price="${pr}" data-billing="${esc(bl)}">${esc(nm)} — €${pr.toLocaleString('nl-NL')}${bl==='eenmalig'?' eenm.':'/mnd'}</option>`;
            }).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="addPortalService('${esc(lead.id)}')"><i class="ti ti-plus"></i> Toevoegen</button>
          <button class="btn btn-primary btn-sm" onclick="savePortalServices('${esc(lead.id)}')"><i class="ti ti-check"></i> Opslaan</button>
        </div>
      </div>

      <!-- SECTIE 3: Zichtbare builds -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">3 — Zichtbare builds voor klant</div>
          ${(lead.agentDeliverables||[]).filter(d=>d.status==='approved').length > 0 ? `
            <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="showAllApprovedDeliverables('${esc(lead.id)}')">
              <i class="ti ti-eye"></i> Toon alle goedgekeurde
            </button>` : ''}
        </div>
        ${(lead.agentDeliverables||[]).length > 0 ? `
          <div>${delivVis}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Zichtbare builds verschijnen in het Leveringen tab van de klant.</div>
        ` : `<div style="font-size:13px;color:var(--text-muted)">Nog geen builds beschikbaar. Ga naar het Building tab om builds te starten.</div>`}
      </div>

      <!-- SECTIE 4: Portaalchat -->
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">4 — Klantportaal bericht sturen ${chatUnread > 0 ? `<span class="tab-badge" style="background:var(--danger)">${chatUnread} nieuw</span>` : chat.length > 0 ? `<span class="tab-badge">${chat.length}</span>` : ''}</div>
          ${chatUnread > 0 ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="markPortalChatRead('${esc(lead.id)}')"><i class="ti ti-checks"></i> Alles gelezen</button>` : ''}
        </div>
        ${chatSection}
      </div>

      <!-- SECTIE 5: Welkomstbericht -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:8px">5 — Welkomstbericht aanpassen</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Dit bericht verschijnt bovenaan het klantportaal Overzicht. Gebruik het voor persoonlijke updates of aankondigingen.</div>
        <textarea id="portalWelcomeInput" class="form-input" rows="3" placeholder="Schrijf een persoonlijk welkomstbericht voor ${esc(lead.companyName)}..." style="resize:vertical;font-size:13px;margin-bottom:8px">${esc(lead.portalWelcomeMessage || '')}</textarea>
        <button class="btn btn-primary btn-sm" onclick="savePortalWelcomeMessage('${esc(lead.id)}')"><i class="ti ti-device-floppy"></i> Opslaan</button>
        ${lead.portalWelcomeMessage ? `<button class="btn btn-ghost btn-sm" style="margin-left:8px;color:var(--text-muted)" onclick="clearPortalWelcomeMessage('${esc(lead.id)}')"><i class="ti ti-x"></i> Wissen</button>` : ''}
      </div>

      <!-- SECTIE 6: Dashboard Analytics (real data) -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)" id="realAnalyticsSection-${esc(lead.id)}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">6 — Dashboard Analytics</div>
          <button class="btn btn-sm btn-outline" onclick="loadRealAnalytics('${esc(lead.id)}')">
            <i class="ti ti-refresh"></i> Vernieuwen
          </button>
        </div>
        <div id="realAnalyticsBody-${esc(lead.id)}">
          ${buildRealAnalyticsHtml(lead)}
        </div>
      </div>

      <!-- SECTIE 7: Portaallink & toegang -->
      <div style="padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:12px">7 — Portaallink &amp; toegang</div>
        ${lead.portalToken ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <code style="flex:1;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;font-size:12px;word-break:break-all">${esc(portalUrl)}</code>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${esc(portalUrl)}');toast('URL gekopieerd!')"><i class="ti ti-copy"></i></button>
              <a class="btn btn-primary btn-sm" href="${esc(portalUrl)}" target="_blank"><i class="ti ti-external-link"></i> Open als klant</a>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" onclick="resetPortalToken('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Reset portaalcode</button>
              <button class="btn btn-sm ${lead.portalBlocked ? 'btn-primary' : 'btn-ghost'}" style="${lead.portalBlocked ? 'background:var(--danger);border-color:var(--danger)' : 'color:var(--danger)'}" onclick="togglePortalAccess('${esc(lead.id)}',${!lead.portalBlocked})">
                <i class="ti ${lead.portalBlocked ? 'ti-lock' : 'ti-lock-open'}"></i> ${lead.portalBlocked ? 'Toegang geblokkeerd — klik om te deblokkeren' : 'Blokkeer toegang'}
              </button>
            </div>
            ${lead.portalBlocked ? `<div style="font-size:12px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#dc2626"><i class="ti ti-alert-circle"></i> Klant kan momenteel niet inloggen op het portaal.</div>` : ''}
          </div>
        ` : `<div style="font-size:13px;color:var(--text-muted)">Geen portaal aangemaakt. Start het project om een portaallink te genereren.</div>`}
      </div>

      ` : `
      <!-- Non-admin: just show the chat -->
      <div style="margin-bottom:20px">
        <div class="project-section-title" style="margin-bottom:12px">Portaalchat</div>
        ${chatSection}
      </div>
      `}

    </div>`;

  // ── Tab: Geschiedenis ───────────────────────────────────────────────────────
  const tabGeschiedenis = `
    <div class="project-tab-content" data-tab-content="geschiedenis" style="${activeTab !== 'geschiedenis' ? 'display:none' : ''}">
      <div class="project-timeline-wrap timeline-list">
        ${buildTimeline(lead) || '<div style="font-size:13px;color:var(--text-muted)">Nog geen activiteit</div>'}
      </div>
    </div>`;

  // ── Tab: Notities ───────────────────────────────────────────────────────────
  const tabNotities = `
    <div class="project-tab-content" data-tab-content="notities" style="${activeTab !== 'notities' ? 'display:none' : ''}">
      <div class="project-section-title">Notities</div>
      <textarea class="project-notes-area" id="projectNotesArea" placeholder="Schrijf notities over deze lead..."
        oninput="clearTimeout(window._notesSaveTimer);window._notesSaveTimer=setTimeout(()=>saveProjectNotes('${esc(lead.id)}'),500)"
      >${esc(lead.notes || '')}</textarea>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted)" id="notesSavedLabel"></div>
    </div>`;

  document.getElementById('appView').innerHTML = `
    <div class="project-page">
      <div class="project-header">
        <button class="project-back-btn" onclick="setView('pipeline')">
          <i class="ti ti-arrow-left"></i> Pipeline
        </button>
        <div class="project-title-row">
          <div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="project-company-name">${esc(lead.companyName || '—')}</span>
              ${nicheBadge(lead.niche)}
              <span class="score-pill score-${scoreColor(lead.score || 0)}">${(lead.score || 0).toFixed(1)}</span>
              ${isAdmin()
                ? `<select class="status-pill status-${statusColor}" id="projectStatusSelect" onchange="changeLeadStatus('${lead.id}',this.value)" style="cursor:pointer;border:none;font-weight:600;font-size:12px;appearance:none;padding-right:18px;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 4px center">
                    ${[['inbox','Inbox'],['approved','Goedgekeurd'],['sent','Verstuurd'],['replied','Gereageerd'],['meeting','Afspraak'],['client','Klant'],['dead','Dead']].map(([v,l]) => `<option value="${v}" ${lead.status===v?'selected':''}>${l}</option>`).join('')}
                  </select>`
                : `<span class="status-pill status-${statusColor}">${statusLabel}</span>`
              }
            </div>
            <div class="project-meta">
              ${lead.location ? `<span><i class="ti ti-map-pin"></i> ${esc(lead.location)}</span>` : ''}
              ${lead.contactEmail ? `<span><i class="ti ti-mail"></i> ${esc(lead.contactEmail)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            ${lead.projectStartedAt
              ? `<button class="btn btn-ghost btn-sm" onclick="editProjectConfig('${esc(lead.id)}')"><i class="ti ti-settings"></i> Aanpassen</button>`
              : ['approved','scheduled','sent','replied'].includes(lead.status)
                ? `<button class="btn btn-primary btn-sm" onclick="startProject('${esc(lead.id)}')"><i class="ti ti-rocket"></i> Project starten</button>`
                : ''}
          </div>
        </div>
        <div class="project-tabs">
          <button class="project-tab${activeTab==='overzicht'?' active':''}" data-tab="overzicht" onclick="switchProjectTab('overzicht')">Overzicht</button>
          <button class="project-tab${activeTab==='emails'?' active':''}" data-tab="emails" onclick="switchProjectTab('emails')">Emails</button>
          ${lead.intakeToken ? `<button class="project-tab${activeTab==='intake'?' active':''}" data-tab="intake" onclick="switchProjectTab('intake')">${lead.intakeSubmittedAt ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Intake</button>` : ''}
          <button class="project-tab${activeTab==='betalingen'?' active':''}" data-tab="betalingen" onclick="switchProjectTab('betalingen')">${(lead.payments||[]).filter(p=>p.status==='sent').length > 0 ? `<i class="ti ti-coin" style="color:var(--warning);margin-right:3px"></i>` : ''}Betalingen</button>
          <button class="project-tab${activeTab==='voorstel'?' active':''}" data-tab="voorstel" onclick="switchProjectTab('voorstel')">${(lead.proposals?.length || lead.proposal) ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Voorstel</button>
          <button class="project-tab${activeTab==='contract'?' active':''}" data-tab="contract" onclick="switchProjectTab('contract')">${lead.contract ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Contract</button>
          <button class="project-tab${activeTab==='building'?' active':''}" data-tab="building" onclick="switchProjectTab('building')" style="${(lead.agentDeliverables||[]).some(d=>d.status==='wacht_op_goedkeuring') ? 'color:var(--warning);font-weight:700' : ''}">${(lead.agentDeliverables||[]).some(d=>d.status==='wacht_op_goedkeuring') ? '<i class="ti ti-clock" style="margin-right:3px;color:var(--warning)"></i>' : '<i class="ti ti-hammer" style="margin-right:3px"></i>'}Building${(lead.agentDeliverables||[]).filter(d=>d.status!=='error').length > 0 ? ` (${(lead.agentDeliverables||[]).filter(d=>d.status!=='error').length})` : ''}</button>
          <button class="project-tab${activeTab==='afspraken'?' active':''}" data-tab="afspraken" onclick="switchProjectTab('afspraken')">Afspraken</button>
          <button class="project-tab${activeTab==='bestanden'?' active':''}" data-tab="bestanden" onclick="switchProjectTab('bestanden')"><i class="ti ti-files" style="margin-right:3px"></i>Bestanden${(lead.projectFiles||[]).length > 0 ? ` (${(lead.projectFiles||[]).length})` : ''}</button>
          <button class="project-tab${activeTab==='documenten'?' active':''}" data-tab="documenten" onclick="switchProjectTab('documenten')"><i class="ti ti-folder" style="margin-right:3px"></i>Documenten${(lead.documents||[]).length > 0 ? ` (${(lead.documents||[]).length})` : ''}</button>
          <button class="project-tab${activeTab==='portaal'?' active':''}" data-tab="portaal" onclick="switchProjectTab('portaal')">${(lead.portalChat||[]).filter(m=>m.from==='client'&&!m.readAt).length > 0 ? `<i class="ti ti-message-circle" style="color:var(--danger);margin-right:3px"></i>` : ''}Klantportaal</button>
          <button class="project-tab${activeTab==='geschiedenis'?' active':''}" data-tab="geschiedenis" onclick="switchProjectTab('geschiedenis')">Geschiedenis</button>
          <button class="project-tab${activeTab==='notities'?' active':''}" data-tab="notities" onclick="switchProjectTab('notities')">Notities</button>
        </div>
      </div>
      <div class="project-content">
        ${tabOverzicht}
        ${buildBuildingTab()}
        ${buildEmailsTab()}
        ${buildIntakeTabProject()}
        ${buildBetalingenTabProject()}
        ${buildVoorstelTabProject()}
        ${buildContractTabProject()}
        ${tabAfspraken}
        ${tabDocumenten}
        ${tabPortaal}
        ${tabGeschiedenis}
        ${tabNotities}
        ${buildProjectFilesTab()}
      </div>
    </div>`;

  // Init: select first problem card if any
  if (lead.problems?.length) {
    selectProblemCard(0, lead.id);
  }

  // Init portal services list if portaal tab is active
  if (activeTab === 'portaal') {
    initPortalServices(lead.id);
  }
}

function problemToKey(txt) {
  return 'problem-' + (txt || '').substring(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function renderAgentChatHistory(leadId, key) {
  const historyEl = document.getElementById('agentChatHistory');
  if (!historyEl) return;
  window._agentChats = window._agentChats || {};
  const msgs = (window._agentChats[leadId] || {})[key] || [];
  historyEl.innerHTML = msgs.map(m => {
    if (m.builtUrl) {
      return `<div class="agent-msg ai" style="padding:0;background:none;border:none">
        <div style="background:var(--success-light);border:1px solid var(--success);border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px"><i class="ti ti-check"></i> Gebouwd!</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Bekijk op:</div>
          <a href="${m.builtUrl}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all;display:block;margin-bottom:10px">${m.builtUrl}</a>
          <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="navigator.clipboard.writeText('${m.builtUrl}').then(()=>toast('URL gekopieerd!','success'))">
            <i class="ti ti-copy"></i> Kopieer URL
          </button>
        </div>
      </div>`;
    }
    if (m.buildError) {
      return `<div class="agent-msg ai" style="padding:0;background:none;border:none">
        <div style="background:var(--danger-light,#fef2f2);border:1px solid var(--danger);border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:4px"><i class="ti ti-alert-triangle"></i> Genereren mislukt</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">${esc(m.text || 'Onbekende fout — probeer opnieuw.')}</div>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;font-size:12px" onclick="retryAgentBuild('${leadId}')">
            <i class="ti ti-refresh"></i> Probeer opnieuw
          </button>
        </div>
      </div>`;
    }
    return `<div class="agent-msg ${m.role}">${esc(m.text)}</div>`;
  }).join('');
  historyEl.scrollTop = historyEl.scrollHeight;
}

function retryAgentBuild(leadId) {
  const msgEl = document.getElementById('agentChatMsg');
  if (!msgEl) return;
  const lastMsg = window._lastAgentBuildMessage?.[leadId];
  if (!lastMsg) { toast('Geen vorig bericht gevonden', 'error'); return; }
  msgEl.value = lastMsg;
  sendAgentChat(leadId);
}

async function saveAgentChats(leadId) {
  try {
    await api(`/api/leads/${leadId}/agent-chats`, {
      method: 'PATCH',
      body: JSON.stringify({ chats: window._agentChats[leadId] || {} })
    });
  } catch (e) { /* non-fatal */ }
}

window.clearAgentChat = async function(leadId) {
  const key = window._selectedProblemKey ?? 'problem-0';
  if (!confirm('Weet je zeker dat je deze chat wil wissen?')) return;
  window._agentChats = window._agentChats || {};
  if (!window._agentChats[leadId]) window._agentChats[leadId] = {};
  window._agentChats[leadId][key] = [];
  await saveAgentChats(leadId);
  renderAgentChatHistory(leadId, key);
  toast('Chat gewist', 'success');
};

// Called when a problem card is clicked in the project page
window.selectProblemCard = async function(idx, leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  document.querySelectorAll('.problem-card').forEach((c, i) => c.classList.toggle('selected', i === idx));

  window._agentChats = window._agentChats || {};

  const problems = lead.problems || [];
  const p = problems[idx];
  const txt = p ? (typeof p === 'string' ? p : (p.text || p.description || '')) : '';
  const problemKey = problemToKey(txt);

  window._selectedProblemIdx   = idx;
  window._selectedProblemKey   = problemKey;
  window._selectedProblemLead  = leadId;
  window._selectedProblemType  = txt;

  const titleEl = document.getElementById('chatProblemTitle');
  if (titleEl) titleEl.innerHTML = `<i class="ti ti-robot" style="color:var(--accent);margin-right:6px"></i>${esc(txt.substring(0, 80))}`;

  // Always reload from API on each card open to get latest persisted history
  try {
    const saved = await apiJSON(`/api/leads/${leadId}/agent-chats`);
    window._agentChats[leadId] = saved || {};
  } catch (e) {
    window._agentChats[leadId] = window._agentChats[leadId] || {};
  }

  renderAgentChatHistory(leadId, problemKey);

  // Auto-trigger first analysis when chat is empty for this problem
  if (txt && (!window._agentChats[leadId][problemKey] || window._agentChats[leadId][problemKey].length === 0)) {
    const msgEl = document.getElementById('agentChatMsg');
    if (msgEl) {
      const co = lead.companyName || 'het bedrijf';
      msgEl.value = `Analyseer dit probleem voor ${co} en geef een concreet actieplan met concrete stappen: ${txt}`;
      sendAgentChat(leadId);
    }
  }
};

window.fillAgentChat = function(leadId, type) {
  const lead = state.leads.find(l => l.id === leadId);
  const prob = window._selectedProblemType || '';
  const co = lead?.companyName || 'het bedrijf';
  const msgs = {
    'actieplan': `Analyseer dit probleem voor ${co} en geef een concreet actieplan met 5 stappen: ${prob}`,
    'build-website': `Bouw een professionele landingspagina voor ${co} die dit probleem oplost: ${prob}`,
    'build-booking': `Bouw een volledig booking/afspraken systeem voor ${co}`,
    'build-chatbot': `Bouw een AI FAQ chatbot voor ${co} die bezoekers helpt`
  };
  const msgEl = document.getElementById('agentChatMsg');
  if (msgEl) { msgEl.value = msgs[type] || ''; msgEl.focus(); }
};

window.switchProblemSubTab = function(leadId, tab) {
  window._activeProblemSubTab = window._activeProblemSubTab || {};
  window._activeProblemSubTab[leadId] = tab;

  ['chat', 'taken', 'bestanden'].forEach(t => {
    const panel = document.getElementById(`probSubPanel-${leadId}-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });

  document.querySelectorAll(`.prob-subtab-btn[data-lead="${leadId}"]`).forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.borderBottom = `2px solid ${active ? 'var(--accent)' : 'transparent'}`;
    btn.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
  });
};

window.toggleProblemCheck = function(leadId, idx) {
  window._checkedProblems = window._checkedProblems || {};
  if (!window._checkedProblems[leadId]) window._checkedProblems[leadId] = new Set();
  const set = window._checkedProblems[leadId];
  if (set.has(idx)) set.delete(idx); else set.add(idx);

  const btn = document.getElementById(`startCheckedBtn-${leadId}`);
  if (btn) {
    btn.style.display = set.size > 0 ? 'flex' : 'none';
    btn.querySelector('i').nextSibling.textContent = ` Start met ${set.size} aangevinkte probleem${set.size === 1 ? '' : 'en'}`;
  }
};

window.startCheckedProblems = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const checked = (window._checkedProblems && window._checkedProblems[leadId]) || new Set();
  if (!checked.size) return;

  const problems = lead.problems || [];
  const selectedTexts = [...checked].sort().map(i => {
    const p = problems[i];
    return typeof p === 'string' ? p : (p?.text || p?.description || '');
  }).filter(Boolean);

  // Switch to Chat sub-tab and select the first checked problem
  window._activeProblemSubTab = window._activeProblemSubTab || {};
  window._activeProblemSubTab[leadId] = 'chat';
  const firstCheckedIdx = [...checked][0];
  const firstCheckedP = problems[firstCheckedIdx];
  const firstCheckedTxt = firstCheckedP ? (typeof firstCheckedP === 'string' ? firstCheckedP : (firstCheckedP.text || firstCheckedP.description || '')) : '';
  window._selectedProblemIdx = firstCheckedIdx;
  window._selectedProblemKey = problemToKey(firstCheckedTxt);
  window._selectedProblemLead = leadId;

  await renderProjectPage();
  switchProjectTab('overzicht');

  const msgEl = document.getElementById('agentChatMsg');
  if (msgEl && selectedTexts.length) {
    msgEl.value = selectedTexts.length === 1
      ? `Analyseer dit probleem en maak een concreet actieplan: ${selectedTexts[0]}`
      : `Analyseer deze problemen en maak een actieplan:\n${selectedTexts.map((t, i) => `${i+1}. ${t}`).join('\n')}\n\nBegin met het meest kritische.`;
    msgEl.focus();
  }
};

async function sendAgentChat(leadId) {
  const msgEl = document.getElementById('agentChatMsg');
  if (!msgEl) return;
  const message = msgEl.value.trim();
  if (!message) return;

  const key = window._selectedProblemKey ?? 'problem-0';
  const problemType = window._selectedProblemType || '';

  window._agentChats = window._agentChats || {};
  if (!window._agentChats[leadId]) window._agentChats[leadId] = {};
  if (!window._agentChats[leadId][key]) window._agentChats[leadId][key] = [];

  const isBuild = /\b(bouw|bouwen|maak|genereer|build|generate|cre[eë]er|aanmaken|schrijf.*pagina|maak.*pagina|bouw.*pagina)\b/i.test(message)
    || /\b(booking.*pagina|landingspagina|website|chatbot|dashboard|content.*kalender|rapport|strateg)\b/i.test(message);
  const action = isBuild ? 'build' : 'chat';

  // Remember last build message for retry
  if (isBuild) {
    window._lastAgentBuildMessage = window._lastAgentBuildMessage || {};
    window._lastAgentBuildMessage[leadId] = message;
  }

  // Add user message and persist immediately
  window._agentChats[leadId][key].push({ role: 'user', text: message, ts: new Date().toISOString() });
  msgEl.value = '';
  saveAgentChats(leadId);

  // Show history + thinking indicator
  renderAgentChatHistory(leadId, key);
  const historyEl = document.getElementById('agentChatHistory');
  if (historyEl) {
    historyEl.innerHTML += `<div class="agent-msg ai" id="agentThinking"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Bezig...</div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  try {
    const res = await api(`/api/leads/${leadId}/agent-chat`, {
      method: 'POST',
      body: JSON.stringify({ problemType, message, action })
    });
    const data = await res?.json();

    document.getElementById('agentThinking')?.remove();

    if (data?.built && data?.url) {
      window._agentChats[leadId][key].push({ role: 'ai', builtUrl: data.url, ts: new Date().toISOString() });
      // Auto-save to project files
      const lead = state.leads.find(l => l.id === leadId);
      const coName = lead?.companyName || leadId;
      const fileType = /booking|afspraak|reserv/i.test(message) ? 'html'
        : /chatbot|faq/i.test(message) ? 'html'
        : /rapport|audit|analyse|keyword|strateg/i.test(message) ? 'document'
        : 'html';
      const fileName = /booking/i.test(message) ? `Boekingssysteem ${coName}`
        : /chatbot/i.test(message) ? `Chatbot ${coName}`
        : /dashboard/i.test(message) ? `Dashboard ${coName}`
        : /landing/i.test(message) ? `Landingspagina ${coName}`
        : `Website ${coName}`;
      api(`/api/leads/${leadId}/project-files`, {
        method: 'POST',
        body: JSON.stringify({ name: fileName, type: fileType, url: data.url, problem: problemType })
      }).catch(() => {});
      const updatedLeads = await apiJSON('/api/leads');
      if (updatedLeads) state.leads = updatedLeads;
    } else if (data?.response) {
      window._agentChats[leadId][key].push({ role: 'ai', text: data.response, ts: new Date().toISOString() });
    }
    if (data?.error) {
      const isBuildErr = action === 'build' || /lege body|probeer opnieuw|geen geldige html/i.test(data.error);
      window._agentChats[leadId][key].push({
        role: 'ai',
        text: data.error,
        buildError: isBuildErr,
        ts: new Date().toISOString()
      });
    }
  } catch (err) {
    document.getElementById('agentThinking')?.remove();
    const isBuildErr = action === 'build';
    window._agentChats[leadId][key].push({
      role: 'ai',
      text: `Verbindingsfout: ${err.message}`,
      buildError: isBuildErr,
      ts: new Date().toISOString()
    });
  }

  // Persist after AI response and re-render
  saveAgentChats(leadId);
  renderAgentChatHistory(leadId, key);
}

window.runAgentsForLead = async function(leadId) {
  window._agentsRunning = window._agentsRunning || {};
  window._agentsRunning[leadId] = true;

  // Switch to agents tab + re-render to show progress card
  await renderProjectPage();
  switchProjectTab('building');

  const progressList = document.getElementById(`agentsProgressList-${leadId}`);
  const lead = state.leads.find(l => l.id === leadId);

  try {
    const res = await fetch(`/api/leads/${leadId}/run-agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        window._agentsRunning[leadId] = false;
        // Re-render page to show final deliverables
        renderProjectPage().then(() => switchProjectTab('building'));
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
          if (d.status === 'complete') {
            window._agentsRunning[leadId] = false;
            // Merge deliverables into state
            if (lead) lead.agentDeliverables = d.deliverables || [];
            renderProjectPage().then(() => switchProjectTab('building'));
            return;
          }
          if (d.status === 'error' && d.idx === -1) {
            window._agentsRunning[leadId] = false;
            toast(d.label || 'Fout bij agents', 'error');
            return;
          }
          // Update progress list
          if (progressList) {
            const rowId = `agentRow-${leadId}-${d.idx}`;
            let row = document.getElementById(rowId);
            if (!row) {
              row = document.createElement('div');
              row.id = rowId;
              row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px';
              progressList.appendChild(row);
            }
            const icon = d.status === 'running' ? '<i class="ti ti-loader-2 spin" style="color:var(--accent)"></i>'
              : d.status === 'done' ? '<i class="ti ti-check" style="color:var(--success)"></i>'
              : '<i class="ti ti-x" style="color:var(--danger)"></i>';
            row.innerHTML = `${icon} <span>${esc(d.label)}</span>`;
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      window._agentsRunning[leadId] = false;
      toast('Verbindingsfout: ' + err.message, 'error');
    });
    pump();
  } catch (err) {
    window._agentsRunning[leadId] = false;
    toast('Fout: ' + err.message, 'error');
  }
};

window.approveDeliverable = async function(leadId, dIdx) {
  const lead = state.leads.find(l => l.id === leadId);
  const hasPaidInvoice = (lead?.payments || []).some(p => p.status === 'paid');
  if (!hasPaidInvoice) {
    openModal(`
      <div class="modal-header">
        <strong>⚠️ Nog geen betaling ontvangen</strong>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:16px 0 4px">
        <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin:0 0 20px">
          <strong>${esc(lead?.companyName || 'Deze klant')}</strong> heeft nog niet betaald.<br>
          Wil je toch de levering sturen?
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="closeModal();createPayment('${esc(leadId)}')">
            <i class="ti ti-receipt"></i> Maak eerst factuur aan
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--text-muted)" onclick="closeModal();_doApproveDeliverable('${esc(leadId)}',${dIdx})">
            Stuur toch
          </button>
        </div>
      </div>
    `);
    return;
  }
  await _doApproveDeliverable(leadId, dIdx);
};

window._doApproveDeliverable = async function(leadId, dIdx) {
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/approve`, { method: 'POST' });
  if (res?.ok) {
    toast('Levering goedgekeurd en klant genotificeerd!', 'success');
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else {
    const d = await res?.json();
    toast(d?.error || 'Goedkeuren mislukt', 'error');
  }
};

window.approveManualDeliverable = async function(leadId, dIdx) {
  const lead = state.leads.find(l => l.id === leadId);
  const hasPaidInvoice = (lead?.payments || []).some(p => p.status === 'paid');
  if (!hasPaidInvoice) {
    openModal(`
      <div class="modal-header">
        <strong>⚠️ Nog geen betaling ontvangen</strong>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:16px 0 4px">
        <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin:0 0 20px">
          <strong>${esc(lead?.companyName || 'Deze klant')}</strong> heeft nog niet betaald.<br>
          Wil je toch de levering sturen?
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="closeModal();createPayment('${esc(leadId)}')">
            <i class="ti ti-receipt"></i> Maak eerst factuur aan
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--text-muted)" onclick="closeModal();_doApproveManualDeliverable('${esc(leadId)}',${dIdx})">
            Stuur toch
          </button>
        </div>
      </div>
    `);
    return;
  }
  await _doApproveManualDeliverable(leadId, dIdx);
};

window._doApproveManualDeliverable = async function(leadId, dIdx) {
  const btn = document.getElementById(`manualApproveBtn-${leadId}-${dIdx}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Email genereren…'; }

  const preview = await apiJSON(`/api/leads/${leadId}/deliverables/${dIdx}/preview-email`, { method: 'POST' });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Klaar — stuur naar klant'; }

  if (!preview) { toast('Kon email niet genereren', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <strong>Leveringsemail — preview &amp; verzenden</strong>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:0 0 16px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Onderwerp</div>
      <input id="delivEmailSubject" class="form-input" style="margin-bottom:14px" value="${esc(preview.subject)}">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Bericht (bewerkbaar)</div>
      <textarea id="delivEmailBody" class="form-input" rows="10" style="resize:vertical;font-size:13px;line-height:1.6">${esc(preview.body)}</textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary btn-sm" onclick="sendManualDeliverable('${esc(leadId)}',${dIdx})"><i class="ti ti-send"></i> Verstuur naar klant</button>
    </div>
  `);
};

window.sendManualDeliverable = async function(leadId, dIdx) {
  const subject = document.getElementById('delivEmailSubject')?.value?.trim();
  const body = document.getElementById('delivEmailBody')?.value?.trim();
  if (!subject || !body) { toast('Vul onderwerp en bericht in', 'error'); return; }

  closeModal();
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailSubject: subject, emailBody: body })
  });
  if (res?.ok) {
    toast('Email verstuurd en levering goedgekeurd!', 'success');
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else {
    const d = await res?.json();
    toast(d?.error || 'Versturen mislukt', 'error');
  }
};

window.toggleDeliverableChat = function(leadId, dIdx) {
  const panel = document.getElementById(`delivChat-${leadId}-${dIdx}`);
  if (!panel) return;
  const open = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = open ? 'block' : 'none';
  if (open) panel.querySelector('textarea')?.focus();
};

window.sendDeliverableAdjust = async function(leadId, dIdx) {
  const input = document.getElementById(`delivChatInput-${leadId}-${dIdx}`);
  const msg = input?.value?.trim();
  if (!msg) { toast('Beschrijf wat er anders moet', 'error'); return; }

  const btn = document.querySelector(`#delivChat-${leadId}-${dIdx} .btn-primary`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }

  const lead = state.leads.find(l => l.id === leadId);
  const deliverable = lead?.agentDeliverables?.[dIdx];
  if (!deliverable) { toast('Levering niet gevonden', 'error'); return; }

  // Use the existing agent-chat endpoint for adjustments
  const res = await apiJSON(`/api/leads/${leadId}/agent-chat`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Pas de levering voor "${deliverable.service}" aan: ${msg}`,
      action: deliverable.type === 'code' ? 'build' : 'adjust',
      service: deliverable.service,
      deliverableIdx: dIdx
    })
  });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Aanpassing sturen'; }

  if (res?.error) {
    toast(res.error, 'error');
  } else if (res?.built) {
    toast('Aanpassing gebouwd — pagina wordt herladen', 'success');
    if (input) input.value = '';
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else if (res?.response) {
    // Chat path: show AI reply in the panel
    const panel = document.getElementById(`delivChat-${leadId}-${dIdx}`);
    if (panel) {
      let replyDiv = panel.querySelector('.ai-reply');
      if (!replyDiv) {
        replyDiv = document.createElement('div');
        replyDiv.className = 'ai-reply';
        replyDiv.style.cssText = 'font-size:13px;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px;white-space:pre-wrap;line-height:1.6';
        panel.insertBefore(replyDiv, panel.querySelector('textarea'));
      }
      replyDiv.textContent = res.response;
    }
    toast('AI antwoord ontvangen', 'success');
  } else {
    toast('Geen reactie ontvangen', 'error');
  }
};

window.buildAllServicesForLead = async function(leadId) {
  window._buildAllRunning = window._buildAllRunning || {};
  window._buildAllProgress = window._buildAllProgress || {};

  if (window._buildAllRunning[leadId]) return;
  window._buildAllRunning[leadId] = true;

  const lead = state.leads.find(l => l.id === leadId);
  const services = (lead?.services || []).map(s => typeof s === 'string' ? s : (s.name || s));

  // Init per-service progress tracking
  window._buildAllProgress[leadId] = services.length
    ? services.map(name => ({ service: name, status: 'waiting', percent: 0 }))
    : [{ service: 'Diensten laden...', status: 'waiting', percent: 0 }];

  await renderProjectPage();
  switchProjectTab('building');

  const updateCard = (serviceName, updates) => {
    const prog = window._buildAllProgress[leadId];
    if (!prog) return;
    const item = prog.find(p => p.service === serviceName);
    if (item) Object.assign(item, updates);

    if (!serviceName) return;
    const slug = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const card = document.getElementById(`build-card-${leadId}-${slug}`);
    if (!card) return;

    const statusEl = card.querySelector('.build-status');
    const progressBar = card.querySelector('.build-progress-bar');
    const progressWrap = card.querySelector('.build-progress-wrap');

    if (statusEl) {
      if (updates.status === 'building') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`;
        card.style.borderColor = 'var(--accent)';
      } else if (updates.status === 'done') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar ✓</span>`;
        card.style.borderColor = 'var(--success)';
        if (progressWrap) progressWrap.style.display = 'none';
      } else if (updates.status === 'error') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
        card.style.borderColor = 'var(--danger)';
        if (progressWrap) progressWrap.style.display = 'none';
      }
    }
    if (progressBar && typeof updates.percent === 'number') {
      progressBar.style.width = updates.percent + '%';
      if (progressWrap && updates.status === 'building') progressWrap.style.display = '';
    }

    // Update counter in header
    const prog2 = window._buildAllProgress[leadId] || [];
    const doneCount = prog2.filter(p => p.status === 'done').length;
    const hdr = document.querySelector(`[data-tab-content="building"] .build-counter`);
    if (hdr) hdr.textContent = `Bezig... ${doneCount}/${prog2.length} leveringen klaar`;
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/build-all-services`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        window._buildAllRunning[leadId] = false;
        delete window._buildAllProgress[leadId];
        renderProjectPage().then(() => switchProjectTab('building'));
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

          if (d.type === 'start') {
            updateCard(d.service, { status: 'building', percent: 10 });
          } else if (d.type === 'progress') {
            updateCard(d.service, { percent: d.percent });
          } else if (d.type === 'done') {
            updateCard(d.service, { status: 'done', percent: 100, url: d.url, deliverableType: d.deliverableType });
          } else if (d.type === 'error' && d.service) {
            updateCard(d.service, { status: 'error' });
          } else if (d.type === 'all_done') {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            const l = state.leads.find(x => x.id === leadId);
            if (l) l.agentDeliverables = d.deliverables || [];
            toast(`${d.count} leveringen klaar!`, 'success');
            renderProjectPage().then(() => switchProjectTab('building'));
          } else if (d.type === 'error' && !d.service) {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            toast(d.message || 'Fout bij bouwen', 'error');
            renderProjectPage().then(() => switchProjectTab('building'));
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      window._buildAllRunning[leadId] = false;
      delete window._buildAllProgress[leadId];
      toast('Verbindingsfout: ' + err.message, 'error');
    });

    pump();
  } catch (err) {
    window._buildAllRunning[leadId] = false;
    delete window._buildAllProgress[leadId];
    toast('Fout: ' + err.message, 'error');
    renderProjectPage().then(() => switchProjectTab('building'));
  }
};

window.approveAllDeliverables = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const pending = (lead.agentDeliverables || []).map((d, i) => ({ d, i })).filter(({d}) => d.status !== 'approved' && d.status !== 'error');
  if (!pending.length) return toast('Geen leveringen om goed te keuren', 'info');
  if (!confirm(`${pending.length} levering${pending.length > 1 ? 'en' : ''} goedkeuren en naar klant sturen?`)) return;
  for (const {i} of pending) {
    await api(`/api/leads/${leadId}/deliverables/${i}/approve`, { method: 'POST' });
  }
  toast(`${pending.length} leveringen goedgekeurd!`, 'success');
  const freshLeads = await apiJSON('/api/leads');
  if (freshLeads) state.leads = freshLeads;
  renderProjectPage().then(() => switchProjectTab('building'));
};

window.sendAllDeliverablesToClient = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.contactEmail) return toast('Geen email adres voor deze klant', 'error');
  if (!confirm(`Oplevering email genereren en sturen naar ${lead.contactEmail}?`)) return;
  const res = await apiJSON(`/api/leads/${leadId}/generate-delivery-email`, { method: 'POST' });
  if (!res?.subject) return toast('Email genereren mislukt', 'error');
  const sendRes = await api(`/api/leads/${leadId}/send-delivery-email`, { method: 'POST', body: JSON.stringify({ subject: res.subject, body: res.body }) });
  if (sendRes?.ok) toast('Oplevering email verstuurd naar klant!', 'success');
  else toast('Versturen mislukt', 'error');
};

window.retryBuildService = async function(leadId, serviceName) {
  window._buildAllRunning = window._buildAllRunning || {};
  window._buildAllProgress = window._buildAllProgress || {};

  if (window._buildAllRunning[leadId]) { toast('Al bezig met bouwen...', 'warning'); return; }
  window._buildAllRunning[leadId] = true;

  const existing = window._buildAllProgress[leadId] || [];
  const item = existing.find(p => p.service === serviceName);
  if (item) Object.assign(item, { status: 'waiting', percent: 0 });
  else existing.push({ service: serviceName, status: 'waiting', percent: 0 });
  window._buildAllProgress[leadId] = existing;

  await renderProjectPage();
  switchProjectTab('building');

  const updateCard = (svc, updates) => {
    const prog = window._buildAllProgress[leadId];
    if (!prog) return;
    const it = prog.find(p => p.service === svc);
    if (it) Object.assign(it, updates);
    const slug = svc.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const card = document.getElementById(`build-card-${leadId}-${slug}`);
    if (!card) return;
    const statusEl = card.querySelector('.build-status');
    const progressBar = card.querySelector('.build-progress-bar');
    const progressWrap = card.querySelector('.build-progress-wrap');
    if (statusEl) {
      if (updates.status === 'building') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`;
        card.style.borderColor = 'var(--accent)';
      } else if (updates.status === 'done') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar ✓</span>`;
        card.style.borderColor = 'var(--success)';
        if (progressWrap) progressWrap.style.display = 'none';
      } else if (updates.status === 'error') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
        card.style.borderColor = 'var(--danger)';
        if (progressWrap) progressWrap.style.display = 'none';
      }
    }
    if (progressBar && typeof updates.percent === 'number') {
      progressBar.style.width = updates.percent + '%';
      if (progressWrap && updates.status === 'building') progressWrap.style.display = '';
    }
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/build-all-services`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ serviceNames: [serviceName] })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        window._buildAllRunning[leadId] = false;
        delete window._buildAllProgress[leadId];
        renderProjectPage().then(() => switchProjectTab('building'));
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
          if (d.type === 'start') updateCard(d.service, { status: 'building', percent: 10 });
          else if (d.type === 'progress') updateCard(d.service, { percent: d.percent });
          else if (d.type === 'done') updateCard(d.service, { status: 'done', percent: 100 });
          else if (d.type === 'all_done') {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            const l = state.leads.find(x => x.id === leadId);
            if (l && d.deliverables) l.agentDeliverables = d.deliverables;
            toast(`${serviceName} opnieuw gebouwd!`, 'success');
            renderProjectPage().then(() => switchProjectTab('building'));
          } else if (d.type === 'error') {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            toast(d.message || `Fout bij ${serviceName}`, 'error');
            renderProjectPage().then(() => switchProjectTab('building'));
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      window._buildAllRunning[leadId] = false;
      delete window._buildAllProgress[leadId];
      toast('Verbindingsfout: ' + err.message, 'error');
    });

    pump();
  } catch (err) {
    window._buildAllRunning[leadId] = false;
    delete window._buildAllProgress[leadId];
    toast('Fout: ' + err.message, 'error');
    renderProjectPage().then(() => switchProjectTab('building'));
  }
};

window.deleteDeliverable = function(leadId, dIdx) {
  openModal(`
    <div style="padding:24px">
      <h3 style="margin:0 0 10px;font-size:16px;font-weight:700">Levering verwijderen</h3>
      <p style="margin:0 0 20px;color:var(--text-secondary);font-size:14px">Weet je zeker dat je deze levering wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="closeModal()">Annuleer</button>
        <button class="btn" style="background:#ef4444;color:#fff" onclick="closeModal();_doDeleteDeliverable('${leadId}',${dIdx})"><i class="ti ti-trash"></i> Verwijder</button>
      </div>
    </div>
  `);
};

window._doDeleteDeliverable = async function(leadId, dIdx) {
  try {
    const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}`, { method: 'DELETE' });
    if (!res?.ok) throw new Error('Verwijderen mislukt');
    const lead = (state.leads || []).find(l => l.id === leadId);
    if (lead?.agentDeliverables) lead.agentDeliverables.splice(dIdx, 1);
    toast('Levering verwijderd', 'success');
    renderProjectPage().then(() => switchProjectTab('building'));
  } catch(e) {
    toast(e.message || 'Verwijderen mislukt', 'error');
  }
};

async function toggleProjectTask(leadId, taskId, checked) {
  const newStatus = checked ? 'klaar' : 'todo';
  const res = await api(`/api/leads/${leadId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.tasks) {
      const task = lead.tasks.find(t => (t.id || t._id) === taskId);
      if (task) task.status = newStatus;
    }
    toast(checked ? 'Taak voltooid!' : 'Taak heropend', 'success');
  } else {
    toast('Kon taak niet bijwerken', 'error');
  }
}

async function saveProjectNotes(leadId) {
  const notes = document.getElementById('projectNotesArea')?.value || '';
  const res = await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.notes = notes;
    const lbl = document.getElementById('notesSavedLabel');
    if (lbl) { lbl.textContent = '✓ Opgeslagen'; setTimeout(() => { if (lbl) lbl.textContent = ''; }, 2000); }
  }
}

function togglePortalToken(token) {
  const display = document.getElementById('portalCodeDisplay');
  const btn     = document.getElementById('showTokenBtn');
  if (!display || !btn) return;
  const hidden = display.textContent.includes('•');
  display.textContent = hidden ? token : '••••••••••••';
  display.style.letterSpacing = hidden ? '1px' : '3px';
  btn.innerHTML = hidden ? '<i class="ti ti-eye-off"></i> Verberg' : '<i class="ti ti-eye"></i> Toon';
}

function copyPortalInstructions(token, loginUrl, companyName) {
  const text = `Beste ${companyName},\n\nHieronder vind je de inloggegevens voor je klantportaal:\n\nInlogpagina: ${loginUrl}\nPortaalcode: ${token}\n\nVia het portaal kun je de voortgang van je project bekijken en ons berichten sturen.\n\nMet vriendelijke groet`;
  navigator.clipboard.writeText(text);
  toast('Instructies gekopieerd naar klembord!', 'success');
}

async function resendWelcomeEmail(leadId) {
  if (!confirm('Welkomstmail opnieuw sturen naar deze klant?')) return;
  const res = await api(`/api/leads/${leadId}/send-welcome`, { method: 'POST' });
  if (res?.ok) toast('Welkomstmail verstuurd!', 'success');
  else toast('Kon welkomstmail niet sturen', 'error');
}

async function sendPortalReply(leadId) {
  const inp = document.getElementById('portalReplyInput');
  const msg = inp?.value?.trim();
  if (!msg) return;
  inp.disabled = true;
  const res = await api(`/api/leads/${leadId}/portal-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) {
      if (!lead.portalChat) lead.portalChat = [];
      lead.portalChat.push(data.entry);
    }
    inp.value = '';
    inp.style.height = 'auto';
    toast('Bericht verstuurd', 'success');
    renderProjectPage();
  } else {
    toast('Versturen mislukt', 'error');
  }
  if (inp) inp.disabled = false;
}

async function markPortalChatRead(leadId) {
  await api(`/api/leads/${leadId}/portal/read`, { method: 'POST' });
  const lead = state.leads.find(l => l.id === leadId);
  if (lead?.portalChat) lead.portalChat.filter(m => m.from === 'client').forEach(m => { m.readAt = new Date().toISOString(); });
  renderProjectPage();
}

window._portalSvcs = window._portalSvcs || {};

function initPortalServices(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const raw = (lead.projectServices && lead.projectServices.length) ? lead.projectServices : (lead.services || []);
  window._portalSvcs[leadId] = raw.map(s =>
    typeof s === 'string'
      ? { name: s, price: 0, billing: 'maandelijks' }
      : { name: s.name || '', price: parseFloat(s.price) || 0, billing: s.billing || 'maandelijks' }
  ).filter(s => s.name);
  renderPortalServicesRows(leadId);
}

function renderPortalServicesRows(leadId) {
  const svcs = window._portalSvcs[leadId] || [];
  const el = document.getElementById(`portalServicesList-${leadId}`);
  if (!el) return;
  el.innerHTML = svcs.length
    ? svcs.map((s, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px">
          <span style="flex:1;font-size:13px;font-weight:500">${esc(s.name)}</span>
          <span style="font-size:12px;color:var(--text-muted)">€${(s.price||0).toLocaleString('nl-NL')}${s.billing==='eenmalig'?' eenm.':'/mnd'}</span>
          <button class="btn btn-ghost btn-xs" onclick="removePortalService('${esc(leadId)}',${i})" style="color:var(--danger);padding:2px 6px"><i class="ti ti-x"></i></button>
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--text-muted);padding:4px 0">Nog geen diensten. Voeg toe via het dropdown hieronder.</div>';
}

window.addPortalService = function(leadId) {
  const sel = document.getElementById(`portalServiceAdd-${leadId}`);
  if (!sel || !sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  const svc = { name: sel.value, price: parseFloat(opt.dataset.price) || 0, billing: opt.dataset.billing || 'maandelijks' };
  const existing = window._portalSvcs[leadId] || [];
  if (!existing.some(s => s.name === svc.name)) {
    window._portalSvcs[leadId] = [...existing, svc];
    renderPortalServicesRows(leadId);
  }
  sel.value = '';
};

window.removePortalService = function(leadId, idx) {
  if (!window._portalSvcs[leadId]) return;
  window._portalSvcs[leadId].splice(idx, 1);
  renderPortalServicesRows(leadId);
};

window.savePortalServices = async function(leadId) {
  const svcs = window._portalSvcs[leadId] || [];
  const res = await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectServices: svcs })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.projectServices = [...svcs];
    toast('Diensten opgeslagen', 'success');
  } else {
    toast('Opslaan mislukt', 'error');
  }
};

async function savePortalPhase(leadId) {
  const phase = parseInt(document.getElementById('portalPhaseSelect')?.value || '1');
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPhase: phase }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.currentPhase = phase;
    toast('Fase bijgewerkt — klant ziet dit direct', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function toggleDeliverableVisibility(leadId, dIdx, visible) {
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/visibility`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVisible: visible })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.agentDeliverables?.[dIdx]) lead.agentDeliverables[dIdx].clientVisible = visible;
    toast(visible ? 'Build zichtbaar voor klant' : 'Build verborgen voor klant', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function showAllApprovedDeliverables(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  const approved = (lead?.agentDeliverables || []).map((d, i) => ({ d, i })).filter(({ d }) => d.status === 'approved' && !d.clientVisible);
  if (!approved.length) { toast('Alle goedgekeurde builds zijn al zichtbaar', 'success'); return; }
  for (const { i } of approved) {
    await api(`/api/leads/${leadId}/deliverables/${i}/visibility`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVisible: true })
    });
    if (lead?.agentDeliverables?.[i]) lead.agentDeliverables[i].clientVisible = true;
  }
  toast(`${approved.length} build(s) zichtbaar gemaakt voor klant`, 'success');
  renderProjectPage().then(() => switchProjectTab('portaal'));
}

async function savePortalWelcomeMessage(leadId) {
  const msg = document.getElementById('portalWelcomeInput')?.value?.trim() || '';
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalWelcomeMessage: msg }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalWelcomeMessage = msg;
    toast('Welkomstbericht opgeslagen', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function clearPortalWelcomeMessage(leadId) {
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalWelcomeMessage: '' }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalWelcomeMessage = '';
    toast('Welkomstbericht gewist', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  }
}

async function togglePortalAccess(leadId, block) {
  if (block && !confirm(`Wil je de portaaltoegang voor deze klant blokkeren? Ze kunnen dan niet meer inloggen.`)) return;
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalBlocked: block }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalBlocked = block;
    toast(block ? 'Portaaltoegang geblokkeerd' : 'Portaaltoegang hersteld', block ? 'error' : 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function resetPortalToken(leadId) {
  if (!confirm('Wil je een nieuwe portaalcode genereren? De oude code werkt dan niet meer.')) return;
  const res = await api(`/api/leads/${leadId}/portal/reset-token`, { method: 'POST' });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead && data.portalToken) lead.portalToken = data.portalToken;
    toast('Nieuwe portaalcode gegenereerd', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Reset mislukt', 'error');
  }
}

function buildRealAnalyticsHtml(lead) {
  const ra = lead._realAnalytics || {};
  const bk = ra.bookings    || {};
  const dv = ra.deliverables|| {};
  const pj = ra.project     || {};
  const em = ra.emails      || {};

  const row = (label, value) =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px">
       <span style="color:var(--text-secondary)">${label}</span>
       <span style="font-weight:600;color:var(--text-primary)">${value}</span>
     </div>`;

  const card = (emoji, title, color, border, textColor, body) =>
    `<div style="background:${color};border:1px solid ${border};border-radius:10px;padding:14px 16px;margin-bottom:10px">
       <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${textColor};margin-bottom:8px">${emoji} ${title}</div>
       ${body}
     </div>`;

  const empty = txt => `<div style="font-size:13px;color:var(--text-muted);padding:3px 0">${txt}</div>`;

  const bookBody = bk.total > 0
    ? `${row('Totaal boekingen', bk.total)}
       ${row('Boekingen deze maand', bk.thisMonth || 0)}
       ${bk.lastBooking  ? row('Laatste boeking', relativeTime(bk.lastBooking))  : ''}
       ${bk.popularService ? row('Populairste dienst', esc(bk.popularService))  : ''}`
    : empty('Nog geen boekingen ontvangen.');

  const delivBody = dv.total > 0
    ? `${row("Pagina's gebouwd", dv.total)}
       ${dv.lastBuilt ? row('Laatste update', relativeTime(dv.lastBuilt)) : ''}
       <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
         ${(dv.items||[]).map(d => `
           <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-top:1px solid rgba(0,0,0,.06)">
             <span style="font-weight:600">${esc(d.service)}</span>
             ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-size:11px">Bekijk →</a>` : '<span style="color:var(--text-muted);font-size:11px">Geen link</span>'}
           </div>`).join('')}
       </div>`
    : empty('Nog geen paginas gebouwd.');

  const projBody = pj.startDate
    ? `${pj.phase ? row('Huidige fase', 'Fase ' + pj.phase + ' van 5') : ''}
       ${pj.daysActive !== null ? row('Dagen actief als klant', pj.daysActive) : ''}
       ${pj.tasksTotal > 0 ? row('Taken voltooid', pj.tasksCompleted + ' van ' + pj.tasksTotal) : ''}`
    : empty('Project is nog niet gestart.');

  const emailBody = em.total > 0
    ? `${row('Berichten verstuurd', em.total)}
       ${em.lastSent ? row('Laatste bericht', relativeTime(em.lastSent)) : ''}`
    : '';

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${card('📅', 'Boekingen',       '#eff6ff', '#bfdbfe', '#1d4ed8', bookBody)}
      ${card('💻', "Gebouwde pagina's",'#f0fdf4', '#bbf7d0', '#15803d', delivBody)}
      ${card('📊', 'Project voortgang','#f5f3ff', '#ddd6fe', '#6d28d9', projBody)}
      ${emailBody ? card('✉️', 'Communicatie', '#fff7ed', '#fed7aa', '#c2410c', emailBody) : ''}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px">
      ⓘ Alle cijfers zijn gebaseerd op werkelijke data — geen schattingen.
      ${ra.generatedAt ? 'Bijgewerkt: ' + relativeTime(ra.generatedAt) : ''}
    </div>`;
}

async function loadRealAnalytics(leadId) {
  const body = document.getElementById(`realAnalyticsBody-${leadId}`);
  if (!body) return;
  body.innerHTML = '<div style="font-size:13px;color:var(--text-muted)"><i class="ti ti-loader-2 spin"></i> Laden...</div>';
  const res = await api(`/api/leads/${leadId}/real-analytics`);
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead._realAnalytics = data;
    body.innerHTML = buildRealAnalyticsHtml(lead || { _realAnalytics: data });
  } else {
    body.innerHTML = '<div style="font-size:13px;color:var(--danger)">Laden mislukt.</div>';
  }
}

// ─── End Project Page ──────────────────────────────────────────────────────────

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
        <div class="detail-company">${esc(lead.companyName)}${flag ? ` ${flag}` : ''}</div>
        <div class="detail-meta">
          ${nicheBadge(lead.niche)}
          <span class="text-secondary"><i class="ti ti-map-pin"></i> ${lead.location || '—'}</span>
        </div>
        <div class="detail-email-row">
          ${lead.contactEmail
            ? `<i class="ti ti-mail" style="color:var(--text-secondary);font-size:13px"></i>
               <span class="detail-email-addr">${lead.contactEmail}</span>
               ${['verified','scraped','gevonden','agent1_websearch'].includes(lead.emailSource) ? `<span class="email-src-badge email-src-found">✓ Geverifieerd</span>` : lead.emailSource === 'guessed' || lead.emailSource === 'geschat' ? `<span class="email-src-badge email-src-guess">Geschat</span>` : ''}
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
      <button class="detail-tab" data-tab="proposal"  onclick="switchDetailTab('proposal')">${(lead.proposals?.length || lead.proposal) ? '<i class="ti ti-file-check" style="margin-right:4px;color:var(--success)"></i>' : '<i class="ti ti-file-text" style="margin-right:4px"></i>'}Voorstel</button>
      <button class="detail-tab" data-tab="contract" onclick="switchDetailTab('contract')">${lead.contract  ? '<i class="ti ti-file-certificate" style="margin-right:4px;color:var(--success)"></i>' : '<i class="ti ti-file-certificate" style="margin-right:4px"></i>'}Contract</button>
    </div>

    <!-- ── Tab: Overzicht ── -->
    <div class="detail-tab-content" data-tab-content="overview">
      <div class="detail-score">
        <span class="score-number score-${scoreColor(lead.score || 0)}" style="font-size:28px;font-weight:800">${(lead.score || 0).toFixed(1)}</span>
        <span class="text-secondary">/10 &nbsp;·&nbsp; €${(lead.estimatedValue || 0).toLocaleString('nl-NL')}/mnd</span>
        ${lead.urgency ? `<span class="badge badge-${lead.urgency === 'critical' ? 'danger' : lead.urgency === 'high' ? 'warning' : 'blue'}" style="font-size:10px">${lead.urgency}</span>` : ''}
        ${(lead.emailBounced || ['bounced','delivery_delayed'].includes(lead.status)) ? `<span class="badge badge-red" style="font-size:10px"><i class="ti ti-mail-off"></i> ${lead.status === 'delivery_delayed' ? 'Vertraagd' : 'Niet aangekomen'}</span>` : ''}
        ${lead.contactEmail && (state.leads || []).some(l => l.id !== lead.id && (l.contactEmail||'').toLowerCase() === lead.contactEmail.toLowerCase() && ['sent','replied','client','scheduled'].includes(l.status)) ? `<span class="badge badge-amber" style="font-size:10px" title="Dit e-mailadres is ook gekoppeld aan een andere lead"><i class="ti ti-alert-triangle"></i> Email duplicaat</span>` : ''}
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
            ${lead.services.map(s => `<li><span>${s.name}</span><span class="service-price">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span></li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${lead.competitors?.competitorNames?.length ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="ti ti-chart-dots" style="color:#f97316;margin-right:4px"></i>Concurrentie analyse</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Concurrenten in ${lead.location}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${lead.competitors.competitorNames.map(n => `<span style="background:#f3f4f6;border-radius:6px;padding:3px 8px;font-size:12px;font-weight:500">${n}</span>`).join('')}
          </div>
          ${lead.competitors.competitorAdvantages?.length ? `
            <ul class="problem-list" style="margin-bottom:8px">
              ${lead.competitors.competitorAdvantages.map(a => `<li><i class="ti ti-point-filled" style="color:#f97316;font-size:8px"></i>${a}</li>`).join('')}
            </ul>
          ` : ''}
          ${lead.competitors.competitorGap ? `
            <div style="background:var(--warning-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--warning)">
              <i class="ti ti-alert-triangle" style="margin-right:6px;color:var(--warning)"></i>${lead.competitors.competitorGap}
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

      ${['bounced','delivery_delayed'].includes(lead.status) || lead.emailBounced ? `
      <div class="detail-section bounce-alert-section">
        <div class="bounce-alert-header">
          <i class="ti ti-mail-off"></i>
          <span>${lead.status === 'delivery_delayed' ? 'Email vertraagd' : 'Email niet aangekomen'}</span>
        </div>
        <p class="bounce-alert-desc">
          ${lead.status === 'delivery_delayed'
            ? 'De email server van de ontvanger reageert niet. De email is nog niet afgeleverd.'
            : `De email kon niet worden afgeleverd op <strong>${esc(lead.contactEmail || 'onbekend adres')}</strong>. Mogelijk is het adres onjuist of niet meer actief.`}
        </p>
        <div id="retryEmailSection-${lead.id}">
          <button class="btn btn-sm" style="background:#dc2626;color:#fff;gap:6px" onclick="openRetryEmailSection('${lead.id}')">
            <i class="ti ti-refresh"></i> Probeer ander email adres
          </button>
        </div>
      </div>
      ` : ''}

      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="detail-section-title" style="margin:0"><i class="ti ti-users-group" style="margin-right:4px;color:var(--accent)"></i>Referral</div>
          <button class="btn btn-ghost btn-sm" onclick="linkReferral('${lead.id}')">
            <i class="ti ti-link"></i> ${lead.referredBy ? 'Wijzigen' : 'Koppel referrer'}
          </button>
        </div>
        ${lead.referredBy ? (() => {
          const referrer = state.leads.find(l => l.id === lead.referredBy);
          return referrer
            ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--accent-light);border:1px solid #bfdbfe;border-radius:8px;font-size:13px">
                <i class="ti ti-user-check" style="color:var(--accent)"></i>
                <span>Doorverwezen door <strong style="cursor:pointer;color:var(--accent)" onclick="openLeadDetail('${referrer.id}')">${esc(referrer.companyName)}</strong></span>
                <button class="btn btn-ghost btn-sm" style="margin-left:auto;padding:2px 6px;font-size:11px" onclick="unlinkReferral('${lead.id}')"><i class="ti ti-x"></i></button>
              </div>`
            : `<div style="font-size:12px;color:var(--text-muted)">Referrer-id ingesteld maar niet gevonden.</div>`;
        })() : `<div style="font-size:12px;color:var(--text-muted)">Niet doorverwezen — koppel een bestaande klant als referrer.</div>`}
        ${lead.referralEmailSent ? `
          <div style="margin-top:8px;font-size:12px;color:var(--success)"><i class="ti ti-send"></i> Referral-verzoek verstuurd${lead.referralSentAt ? ' op ' + new Date(lead.referralSentAt).toLocaleDateString('nl-NL') : ''}</div>
        ` : ''}
      </div>

      ${state.settings?.calendlyUrl ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="ti ti-calendar-event" style="color:#006bff"></i> Gesprek inplannen</div>
          <a class="btn btn-ghost btn-sm calendly-btn" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener">
            <i class="ti ti-calendar-event"></i> Calendly openen
          </a>
          ${lead.calendlyBooking ? `
            <div style="margin-top:8px;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1d4ed8">
              <i class="ti ti-check"></i> <strong>${esc(lead.calendlyBooking.eventName)}</strong> ingepland${lead.calendlyBooking.startTime ? ' op ' + new Date(lead.calendlyBooking.startTime).toLocaleString('nl-NL', {dateStyle:'short',timeStyle:'short'}) : ''}
            </div>` : ''}
        </div>
      ` : ''}

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
            <div style="background:var(--success-light);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#16a34a;margin-bottom:6px">${esc(lead.caseStudy.industry || lead.niche)}</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${esc(lead.caseStudy.title || '')}</div>
              <p style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">${esc(lead.caseStudy.challenge || '')}</p>
              ${(lead.caseStudy.results || []).length ? `<ul style="list-style:none;display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${(lead.caseStudy.results || []).map(r => `<li style="font-size:12px;font-weight:600;color:#16a34a;padding-left:16px;position:relative"><span style="position:absolute;left:0">✓</span>${esc(r)}</li>`).join('')}</ul>` : ''}
              ${lead.caseStudy.quote ? `<div style="border-left:3px solid var(--success);padding:8px 12px;font-size:12px;font-style:italic;color:var(--text-secondary)">&ldquo;${esc(lead.caseStudy.quote)}&rdquo;<div style="font-style:normal;font-size:11px;font-weight:600;color:var(--text-primary);margin-top:4px">${esc(lead.caseStudy.quoteName || '')}</div></div>` : ''}
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
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="li-copy-detail-${lead.id}" onclick="copyLinkedinDm(\`${linkedinData.replace(/`/g,'\\`')}\`,'detail-${lead.id}')">
              <i class="ti ti-copy"></i> Kopiëren
            </button>
            <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(lead.companyName||'')}" target="_blank" rel="noopener">
              <i class="ti ti-brand-linkedin"></i> Zoeken op LinkedIn
            </a>
          </div>
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
                      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(p.description||'')}${p.splitIndex ? ` — deel ${p.splitIndex}/${p.splitTotal}` : ''}</div>
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
                      ${p.method === 'bank_transfer' && p.bankDetails ? `<button onclick="showBankDetails('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-building-bank"></i> Bankgegevens</button>` : ''}
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
                <div style="background:var(--surface-2);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                     onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                  <div>
                    <div style="font-size:13px;font-weight:600">${esc(log.subject || '')}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">${formatDate(log.sentAt)} · ${esc(log.to || '')} · ${esc(log.sentBy || 'systeem')}</div>
                  </div>
                  <i class="ti ti-chevron-down" style="color:#9ca3af;font-size:12px"></i>
                </div>
                <div style="display:none;padding:12px;font-size:12px;color:var(--text-secondary);white-space:pre-line;line-height:1.6">${esc(log.body || '')}</div>
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
              <div style="background:var(--surface-2);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                   onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                <div>
                  <div style="font-size:13px;font-weight:600">${r.title}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${formatDate(r.createdAt)}</div>
                </div>
                <i class="ti ti-chevron-down" style="color:var(--text-secondary);font-size:13px"></i>
              </div>
              <div style="padding:14px;font-size:13px;color:var(--text-secondary);line-height:1.7;white-space:pre-line">
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
              <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${esc(q)}</div>
                <div style="font-size:13px;color:var(--text-primary);white-space:pre-line">${esc(a)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De klant heeft de intake nog niet ingevuld.</div>
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
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge badge-green"><i class="ti ti-rocket"></i> Actief</span>
            <button class="btn btn-ghost btn-sm" onclick="resendWelcomeEmail('${lead.id}')" title="Welkomstmail opnieuw sturen">
              <i class="ti ti-mail-forward"></i> Welkomstmail
            </button>
          </div>
        </div>
        ${lead.projectPlan.overview ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">${esc(lead.projectPlan.overview)}</p>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px">
          ${(lead.projectPlan.weeks || []).map(w => `
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <div style="background:var(--surface-2);padding:10px 14px;display:flex;align-items:center;gap:10px">
                <span class="week-badge">Week ${w.week}</span>
                <span style="font-size:13px;font-weight:600">${esc(w.focus || '')}</span>
              </div>
              <ul style="padding:10px 14px 10px 28px;margin:0;display:flex;flex-direction:column;gap:4px">
                ${(w.deliverables || []).map(d => `<li style="font-size:13px;color:var(--text-secondary)">${esc(d)}</li>`).join('')}
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
              ${item.caption ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${esc(item.caption)}</div>` : ''}
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
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Content Kalender — Maand 1</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.contentCalendar.items || []).slice(0,5).map(item => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="display:flex;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                  <span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:1px 5px;font-weight:700">W${item.week} ${item.day||''}</span>
                  <span style="background:#f3f4f6;border-radius:4px;padding:1px 5px">${esc(item.platform||'')}</span>
                  <span style="background:#fefce8;color:#d97706;border-radius:4px;padding:1px 5px">${esc(item.type||'')}</span>
                  ${item.bestTime ? `<span style="background:#f0fdf4;color:#16a34a;border-radius:4px;padding:1px 5px">${item.bestTime}</span>` : ''}
                </div>
                <div style="font-weight:600;color:var(--text-primary)">${esc(item.topic||'')}</div>
                ${item.caption ? `<div style="color:var(--text-secondary);margin-top:2px;line-height:1.4">${esc(item.caption)}</div>` : ''}
                ${item.hashtags?.length ? `<div style="color:#6366f1;margin-top:3px">${item.hashtags.join(' ')}</div>` : ''}
              </div>
            `).join('')}
            ${lead.delivery.contentCalendar.items.length > 5 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.contentCalendar.items.length - 5} meer posts</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.chatbotFlow?.faqs?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Chatbot FAQ Script</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.chatbotFlow.faqs || []).slice(0,4).map(faq => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:3px">${esc(faq.question||'')}</div>
                <div style="color:var(--text-secondary);line-height:1.5">${esc(faq.answer||'')}</div>
              </div>
            `).join('')}
            ${lead.delivery.chatbotFlow.faqs.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.chatbotFlow.faqs.length - 4} meer FAQs</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.milestones?.milestones?.length ? `
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Mijlpalen — 12 weken</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.milestones.milestones || []).slice(0,4).map(m => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px;display:flex;gap:8px;align-items:flex-start">
                <span style="background:#6366f1;color:#fff;border-radius:4px;padding:2px 6px;font-weight:700;flex-shrink:0;font-size:11px">W${m.week}</span>
                <div>
                  <div style="font-weight:700;color:var(--text-primary)">${esc(m.title||'')}</div>
                  ${m.description ? `<div style="color:var(--text-secondary);margin-top:2px">${esc(m.description)}</div>` : ''}
                </div>
              </div>
            `).join('')}
            ${lead.delivery.milestones.milestones.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.milestones.milestones.length - 4} meer weken</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${Object.keys(lead.delivery.serviceDeliveries || {}).length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Service Leveringen (${Object.keys(lead.delivery.serviceDeliveries).length})</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${Object.entries(lead.delivery.serviceDeliveries).map(([name, del]) => `
              <div style="padding:8px 10px;background:${del.error ? '#fef2f2' : '#f9fafb'};border:1px solid ${del.error ? '#fecaca' : 'var(--border)'};border-radius:7px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;color:${del.error ? '#dc2626' : '#111'}">${del.error ? '⚠ ' : '✓ '}${esc(name)}</span>
                ${!del.error ? `<button class="btn btn-ghost btn-sm" onclick="previewServiceDelivery('${lead.id}','${name.replace(/'/g,"\\'")}')">Bekijk</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
    ` : ''}

    <!-- ── Tab: Contract ── -->
    <div class="detail-tab-content" data-tab-content="contract" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Dienstverleningsovereenkomst</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${lead.contract ? `
              <button class="btn btn-ghost btn-sm" onclick="downloadContract('${lead.id}')">
                <i class="ti ti-download"></i> Download
              </button>
              <button class="btn btn-ghost btn-sm" onclick="sendContractEmail('${lead.id}')">
                <i class="ti ti-mail"></i> Verstuur
              </button>
            ` : ''}
            ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="generateContract('${lead.id}')" id="contractGenBtn-${lead.id}">
              <i class="ti ti-file-certificate"></i> ${lead.contract ? 'Regenereer' : 'Genereer contract'}
            </button>` : ''}
          </div>
        </div>
        ${lead.contract ? `
          <div class="proposal-preview">
            <iframe id="contractFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:520px"></iframe>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
            Gegenereerd op ${new Date(lead.contractGeneratedAt).toLocaleDateString('nl-NL')}
            ${lead.contractSentAt ? ` · <span style="color:var(--success)"><i class="ti ti-check"></i> Verstuurd op ${new Date(lead.contractSentAt).toLocaleDateString('nl-NL')}</span>` : ''}
          </div>
        ` : `
          <div class="empty-state" style="padding:32px 0;text-align:center">
            <i class="ti ti-file-certificate" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen contract gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Genereer contract" om een juridisch contract op te stellen</div>
          </div>
        `}
        <div id="contractProgress-${lead.id}" style="display:none">
          <div class="proposal-progress">
            <div id="contractStep1-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contractgegevens ophalen</div>
            <div id="contractStep2-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opstellen</div>
            <div id="contractStep3-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opslaan</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: Voorstel ── -->
    <div class="detail-tab-content" data-tab-content="proposal" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Offerte / voorstel</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="propGenBtn-${lead.id}" onclick="openProposalModal('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuw voorstel
          </button>` : ''}
        </div>

        ${_buildProposalsListHtml(lead)}

        ${!(lead.proposals?.length) && !lead.proposal ? `
          <div class="empty-state" style="padding:28px 0;text-align:center">
            <i class="ti ti-file-description" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen voorstel gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Nieuw voorstel" om een PDF-offerte op maat te maken</div>
          </div>` : ''}

        ${lead.proposal ? `
          <details style="margin-top:12px">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;padding:6px 0">Oud AI-voorstel tonen</summary>
            <div style="margin-top:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn btn-ghost btn-sm" onclick="downloadProposal('${lead.id}')"><i class="ti ti-download"></i> Download HTML</button>
                <button class="btn btn-ghost btn-sm" onclick="sendProposalEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
              </div>
              <div class="proposal-preview">
                <iframe id="proposalFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:420px"></iframe>
              </div>
            </div>
          </details>` : ''}
      </div>
    </div>
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
  if (tabName === 'proposal' && state.currentLeadId) {
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    const frame = document.getElementById(`proposalFrame-${state.currentLeadId}`);
    if (frame && lead?.proposal) frame.srcdoc = lead.proposal;
  }
  if (tabName === 'contract' && state.currentLeadId) {
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    const frame = document.getElementById(`contractFrame-${state.currentLeadId}`);
    if (frame && lead?.contract) frame.srcdoc = lead.contract;
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

  const SITE_TEMPLATES = [
    { id: 'modern',    label: 'Modern',    icon: '✨', desc: 'Clean, witruimte, gradient hero' },
    { id: 'bold',      label: 'Bold',      icon: '⚡', desc: 'Donkere hero, hoog contrast' },
    { id: 'minimal',   label: 'Minimaal',  icon: '◻',  desc: 'Wit, subtiel, elegant' },
    { id: 'corporate', label: 'Corporate', icon: '🏢', desc: 'Zakelijk, blauw, formeel' },
  ];

  const generatorSection = site ? `
    <div class="detail-section site-gen-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="detail-section-title" style="margin:0">Gegenereerde website</div>
          <span class="site-status-badge ${site.status === 'live' ? 'site-status-live' : 'site-status-preview'}">${site.status === 'live' ? 'Live' : 'Preview'}</span>
          ${site.template ? `<span style="font-size:11px;color:var(--text-secondary);background:var(--surface-2);padding:2px 8px;border-radius:20px">${site.template}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <a href="${site.siteUrl}" target="_blank" class="btn btn-sm btn-outline"><i class="ti ti-external-link"></i> Bekijk</a>
          <button class="btn btn-sm btn-ghost" onclick="editSiteHTML('${lead.id}')"><i class="ti ti-code"></i> HTML</button>
          <button class="btn btn-sm btn-ghost" onclick="openSeoPanel('${lead.id}')"><i class="ti ti-search"></i> SEO</button>
          <button class="btn btn-sm btn-ghost" onclick="downloadSiteHTML('${lead.id}')"><i class="ti ti-download"></i> Download</button>
          ${site.status === 'preview'
            ? `<button class="btn btn-sm" style="background:#10b981;color:#fff;border:none" onclick="setSiteStatus('${lead.id}','live')"><i class="ti ti-rocket"></i> Zet live</button>`
            : `<button class="btn btn-sm btn-ghost" onclick="setSiteStatus('${lead.id}','preview')"><i class="ti ti-eye-off"></i> Preview</button>`}
          <button class="btn btn-sm" style="background:#111;color:#fff;border:none" onclick="openRegenerateModal('${lead.id}')"><i class="ti ti-refresh"></i> Regenereer</button>
        </div>
      </div>

      <div class="site-preview-wrap">
        <iframe src="${site.siteUrl}?_t=${Date.now()}" class="site-preview-iframe" title="Website preview" loading="lazy" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>

      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-muted)">URL:</span>
        <a href="${site.siteUrl}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all">${site.siteUrl}</a>
        <button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="navigator.clipboard.writeText('${site.siteUrl}');toast('URL gekopieerd!')"><i class="ti ti-copy"></i></button>
      </div>

      ${(site.versions || []).length ? `
        <div style="margin-top:14px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
            <span><i class="ti ti-history"></i> Versiegeschiedenis (${site.versions.length})</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${(site.versions || []).map((v, i) => `
              <div class="site-version-card">
                <div>
                  <div style="font-size:12px;font-weight:600">${new Date(v.savedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${v.template || 'modern'} template</div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="revertSiteVersion('${lead.id}', ${i})"><i class="ti ti-history"></i> Terugzetten</button>
              </div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${site.feedback?.length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Feedback (${site.feedback.length})</div>
          ${site.feedback.map(f => `
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:4px">
              <span>${esc(f.text)}</span>
              <span style="margin-left:8px;opacity:.6">${esc(f.by)} · ${new Date(f.time).toLocaleDateString('nl-NL')}</span>
            </div>`).join('')}
        </div>
      ` : ''}
    </div>
  ` : `
    <div class="detail-section">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Kies een template</div>
      <div class="site-template-grid" id="siteTemplateGrid">
        ${SITE_TEMPLATES.map(t => `
          <div class="site-template-card ${t.id === 'modern' ? 'selected' : ''}" onclick="selectSiteTemplate('${t.id}',this)">
            <div class="site-template-icon">${t.icon}</div>
            <div class="site-template-label">${t.label}</div>
            <div class="site-template-desc">${t.desc}</div>
          </div>`).join('')}
      </div>
      <div style="text-align:center;padding:16px 0 8px">
        <button class="btn" style="background:#111;color:#fff;border:none;padding:12px 28px;font-size:14px" onclick="generateSite('${lead.id}')">
          <i class="ti ti-wand"></i> Website genereren
        </button>
        ${!lead.intakeAnswers ? `<div style="font-size:12px;color:var(--text-muted);margin-top:10px"><i class="ti ti-info-circle"></i> Tip: intake invullen geeft betere resultaten.</div>` : ''}
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
            <span style="font-size:13px;color:var(--text-secondary)"><strong>${lead.linkedinCompanyFollowers.toLocaleString('nl-NL')}</strong> volgers</span>
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

  const PHASE_NAMES = ['Intake', 'Uitvoering', 'Oplevering & Check', 'Live gaan', 'Volgende stap'];
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

async function testImapConnection() {
  const btn = document.getElementById('testImapBtn');
  const result = document.getElementById('imapTestResult');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner"></div> Verbinden...'; }
  if (result) result.style.display = 'none';

  try {
    const res = await api('/api/settings/test-imap', { method: 'POST' });
    const d   = await res.json();
    if (result) {
      result.style.display = '';
      if (d.success) {
        result.innerHTML = `<div class="inline-result inline-result-ok"><i class="ti ti-check"></i> ${esc(d.message)}</div>`;
      } else {
        result.innerHTML = `<div class="inline-result inline-result-err"><i class="ti ti-x"></i> ${esc(d.error)}</div>`;
      }
    }
  } catch (e) {
    if (result) {
      result.style.display = '';
      result.innerHTML = `<div class="inline-result inline-result-err"><i class="ti ti-x"></i> ${esc(e.message)}</div>`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-plug-connected"></i> Test IMAP verbinding'; }
  }
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
        '<i class="ti ti-file-description" style="color:var(--text-secondary);font-size:14px"></i>' +
        '<span style="flex:1;color:var(--text-secondary)">' + b.filename + '</span>' +
        '<span style="color:#9ca3af">' + kb + ' KB</span>' +
        '<span style="color:#9ca3af">' + date + '</span>' +
        '</div>';
    }).join('');
    container.innerHTML = '<div style="margin-top:4px"><div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px">Recente backups</div>' + rows + '</div>';
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
  toast(`Fase ${phase} — ${['Intake','Uitvoering','Oplevering & Check','Live gaan','Volgende stap'][phase-1]} ingesteld`, 'success');
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
      <p style="color:var(--text-secondary);font-size:13px">Email genereren met AI...</p>
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
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Onderwerp</label>
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

function startProject(leadId) { openProjectConfigModal(leadId, false); }
function editProjectConfig(leadId) { openProjectConfigModal(leadId, true); }

function openProjectConfigModal(leadId, editMode) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const servicesList = state.settings?.services || [];
  const today = new Date().toISOString().split('T')[0];
  const startDate = lead.projectStartDate || today;

  const serviceCheckboxes = servicesList.length
    ? servicesList.map((s, sIdx) => {
        const sName    = typeof s === 'string' ? s : s.name;
        const sPrice   = typeof s === 'object' ? (parseFloat(s.price) || 0) : 0;
        const sBilling = typeof s === 'object' ? (s.billing || 'maandelijks') : 'maandelijks';
        const checked  = !lead.services?.length || (lead.services || []).some(ls => (typeof ls === 'string' ? ls : ls.name) === sName);
        // Use existing custom price if project was already configured
        const existingSvc = (lead.projectServices || []).find(ps => (typeof ps === 'string' ? ps : ps.name) === sName);
        const displayPrice = existingSvc != null ? (parseFloat(existingSvc.price) ?? sPrice) : sPrice;
        const billingTag = sBilling === 'eenmalig' ? 'eenm.' : '/mnd';
        const cid = `svcchk-${sIdx}`;
        const pid = `svcprice-${sIdx}`;
        const bid = `svcbilling-${sIdx}`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
          <input type="checkbox" id="${cid}" name="svc" value="${esc(sName)}" data-price="${sPrice}" data-billing="${sBilling}" ${checked ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;cursor:pointer"
            onchange="updateProjectTotal();document.getElementById('${pid}').style.display=this.checked?'block':'none';document.getElementById('${bid}').style.display=this.checked?'inline':'none'">
          <label for="${cid}" style="flex:1;font-size:13px;font-weight:500;cursor:pointer;margin:0">${esc(sName)}</label>
          <input id="${pid}" type="number" class="svc-price-input form-control" value="${displayPrice}" min="0" step="1"
            style="display:${checked?'block':'none'};width:82px;font-size:13px;padding:4px 8px;text-align:right;border:1px solid var(--border);border-radius:6px"
            oninput="updateProjectTotal()" placeholder="0">
          <span id="${bid}" style="font-size:11px;color:var(--text-muted);white-space:nowrap;display:${checked?'inline':'none'}">${billingTag}</span>
        </div>`;
      }).join('')
    : `<div style="font-size:13px;color:var(--text-muted)">Geen diensten in instellingen. <a onclick="setView('settings')" style="color:var(--accent);cursor:pointer">Voeg toe in Instellingen →</a></div>`;

  const durationOptions = [
    { value: 1, label: '1 maand' }, { value: 3, label: '3 maanden' },
    { value: 6, label: '6 maanden' }, { value: 12, label: '12 maanden' },
    { value: 0, label: 'Onbepaald' },
  ];
  const currentDur = lead.projectDuration !== undefined ? lead.projectDuration : 12;
  const durationSel = durationOptions.map(o =>
    `<option value="${o.value}" ${currentDur === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

  const billingOptions = [
    { value: 'maandelijks', label: 'Maandelijks' },
    { value: 'eenmalig',    label: 'Eenmalig' },
    { value: 'gesplitst',   label: 'Gesplitst (50/50)' },
  ];
  const currentBilling = lead.projectBilling || 'maandelijks';

  const problems = lead.problems || [];
  const problemCheckboxes = problems.length
    ? problems.map((p, i) => {
        const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
        const low = txt.toLowerCase();
        const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
        const icon = isCritical ? '🔴' : '🟡';
        const severityLabel = isCritical ? 'Kritiek' : 'Medium';
        const severityColor = isCritical ? 'var(--danger)' : '#d97706';
        const alreadySel = !lead.selectedProblems || lead.selectedProblems.includes(txt);
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:6px;background:var(--surface)">
          <input type="checkbox" name="prob" value="${esc(txt)}" ${alreadySel ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0">
          <span style="font-size:15px;flex-shrink:0">${icon}</span>
          <span style="flex:1;font-size:13px;line-height:1.4">${esc(txt)}</span>
          <span style="font-size:10px;padding:1px 7px;border-radius:3px;background:${severityColor}22;color:${severityColor};font-weight:600;white-space:nowrap;flex-shrink:0">${severityLabel}</span>
        </label>`;
      }).join('')
    : `<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Geen problemen gedetecteerd — agents bouwen op basis van bestelde diensten.</div>`;

  openModal(`
    <div class="modal-header">
      <strong><i class="ti ti-settings" style="color:var(--accent)"></i> Project configureren — ${esc(lead.companyName)}</strong>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:0 0 8px;max-height:65vh;overflow-y:auto">

      ${problems.length ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Problemen <span style="font-weight:400;text-transform:none;color:var(--text-secondary)">(selecteer wat agents aanpakken)</span></div>
      <div id="projProblemsList" style="margin-bottom:16px">${problemCheckboxes}</div>
      <div style="height:1px;background:var(--border);margin-bottom:16px"></div>
      ` : ''}

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Diensten</div>
      <div id="projServicesList" style="margin-bottom:6px">${serviceCheckboxes}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:13px">
        <span style="font-weight:600">Totaal services</span>
        <span id="projServicesTotal" style="font-weight:700;color:var(--accent)">€0</span>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Prijs</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Totaalprijs (€) — laat leeg voor auto</label>
          <input type="number" id="projPrice" class="form-control" value="${lead.estimatedValue || lead.servicePrice || ''}" placeholder="Auto van diensten" min="0" style="width:100%" oninput="window._projPriceManual=true">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Facturering</label>
          <select id="projBilling" class="form-control" style="width:100%">
            ${billingOptions.map(o => `<option value="${o.value}" ${currentBilling === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Looptijd</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Duur</label>
          <select id="projDuration" class="form-control" style="width:100%" onchange="updateProjectEndDate()">
            ${durationSel}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Startdatum</label>
          <input type="date" id="projStartDate" class="form-control" value="${startDate}" style="width:100%" onchange="updateProjectEndDate()">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Einddatum</label>
          <input type="date" id="projEndDate" class="form-control" value="${lead.projectEndDate || ''}" style="width:100%;background:var(--surface-2)" readonly>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">
        Notities <span style="font-weight:400;text-transform:none">(intern, niet zichtbaar voor klant)</span>
      </div>
      <textarea id="projNotes" class="form-control" rows="3" placeholder="Speciale wensen, doelen, beperkingen..." style="width:100%;resize:vertical">${esc(lead.projectNotes || '')}</textarea>

    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="confirmStartProject('${leadId}',${editMode})">
        <i class="ti ti-${editMode ? 'check' : 'rocket'}"></i> ${editMode ? 'Opslaan' : 'Sla op en start project'}
      </button>
    </div>
  `);

  window._projPriceManual = !!(lead.estimatedValue || lead.servicePrice);
  updateProjectTotal();
  updateProjectEndDate();
}
window.openProjectConfigModal = openProjectConfigModal;

function updateProjectTotal() {
  const checked = [...document.querySelectorAll('#projServicesList input[name="svc"]:checked')];
  const getPrice = el => {
    const inp = el.parentElement?.querySelector('.svc-price-input');
    return parseFloat(inp?.value) || parseFloat(el.dataset.price) || 0;
  };
  const monthly = checked.filter(el => el.dataset.billing !== 'eenmalig').reduce((sum, el) => sum + getPrice(el), 0);
  const oneTime = checked.filter(el => el.dataset.billing === 'eenmalig').reduce((sum, el) => sum + getPrice(el), 0);
  const totalEl = document.getElementById('projServicesTotal');
  if (totalEl) {
    let label = '';
    if (monthly > 0 && oneTime > 0) label = `€${monthly.toLocaleString('nl-NL')}/mnd + €${oneTime.toLocaleString('nl-NL')} eenm.`;
    else if (monthly > 0) label = `€${monthly.toLocaleString('nl-NL')}/mnd`;
    else if (oneTime > 0) label = `€${oneTime.toLocaleString('nl-NL')} eenmalig`;
    else label = '€0';
    totalEl.textContent = label;
  }
  if (!window._projPriceManual && (monthly + oneTime) > 0) {
    const priceEl = document.getElementById('projPrice');
    if (priceEl) priceEl.value = monthly > 0 ? monthly : oneTime;
  }
}

function updateProjectEndDate() {
  const durEl   = document.getElementById('projDuration');
  const startEl = document.getElementById('projStartDate');
  const endEl   = document.getElementById('projEndDate');
  if (!durEl || !startEl || !endEl) return;
  const months = parseInt(durEl.value);
  if (!months || !startEl.value) { endEl.value = ''; return; }
  const d = new Date(startEl.value);
  d.setMonth(d.getMonth() + months);
  endEl.value = d.toISOString().split('T')[0];
}

async function confirmStartProject(leadId, editMode) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const checkedEls = [...document.querySelectorAll('#projServicesList input[name="svc"]:checked')];
  const projectServices = checkedEls.map(el => {
    const priceInput = el.parentElement?.querySelector('.svc-price-input');
    return {
      name: el.value,
      price: parseFloat(priceInput?.value) || parseFloat(el.dataset.price) || 0,
      billing: el.dataset.billing || 'maandelijks'
    };
  });
  const services = projectServices.length ? projectServices : (lead.services || []);
  const selectedProblems = [...document.querySelectorAll('#projProblemsList input[name="prob"]:checked')].map(el => el.value);
  const price     = parseFloat(document.getElementById('projPrice')?.value) || 0;
  const billing   = document.getElementById('projBilling')?.value || 'maandelijks';
  const duration  = parseInt(document.getElementById('projDuration')?.value) || 0;
  const startDate = document.getElementById('projStartDate')?.value || new Date().toISOString().split('T')[0];
  const endDate   = document.getElementById('projEndDate')?.value || '';
  const notes     = document.getElementById('projNotes')?.value?.trim() || '';

  const patch = {
    estimatedValue: price, servicePrice: price,
    projectBilling: billing, projectDuration: duration,
    projectStartDate: startDate, projectEndDate: endDate,
    projectNotes: notes,
    selectedProblems: selectedProblems,
    projectServices: projectServices,
  };
  if (services.length) patch.services = services;

  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) Object.assign(state.leads[idx], patch);

  closeModal();
  if (editMode) {
    toast('Project configuratie bijgewerkt', 'success');
    renderProjectPage();
  } else {
    _doStartProject(leadId);
  }
}

function _doStartProject(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const steps = [
    { label: 'Portaaltoegang instellen' },
    { label: 'Intake link genereren' },
    { label: 'Welkomstmail versturen' },
    { label: 'Projectplan genereren (AI)' },
    { label: 'Video onboarding script genereren (AI)' },
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
      <span id="pstep-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
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
      // Remove inbox card and show success toast if project was started from inbox
      if (window._inboxProjectStart?.leadId === leadId) {
        const { itemId } = window._inboxProjectStart;
        const companyName = localLead?.companyName || '';
        // Remove the card with a fade-out
        const card = document.getElementById(`card-${itemId}`);
        if (card) {
          card.style.transition = 'opacity 0.3s';
          card.style.opacity = '0';
          setTimeout(() => {
            card.remove();
            // Also remove from state.inbox so empty-state check is accurate
            state.inbox = (state.inbox || []).filter(i => i.id !== itemId);
            // Show empty state if inbox is now empty
            const container = document.getElementById('inboxCards');
            if (container && !container.querySelector('.inbox-card')) {
              container.innerHTML = `<div class="empty-state" style="padding:40px 0">
                <i class="ti ti-inbox" style="font-size:32px;color:var(--text-muted)"></i>
                <p>Inbox is leeg</p>
              </div>`;
            }
          }, 300);
        }
        toast(`✓ Project gestart — ${companyName} is nu een klant`, 'success');
        window._inboxProjectStart = null;
      }
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
          <label>Bedrag excl. BTW (€)</label>
          <input type="number" id="payAmount" value="${defaultAmount}" min="1" oninput="updateBtwBreakdown('pay')">
        </div>
        <div class="form-group" id="splitPartsGroup" style="display:none">
          <label>Aantal delen</label>
          <select id="splitParts">
            <option value="2">2 delen</option>
            <option value="3">3 delen</option>
          </select>
        </div>
      </div>
      ${s.btwEnabled ? `<div class="btw-breakdown" id="btwBreakdownPay">
        <div class="btw-row"><span>Excl. BTW</span><span id="btwExclPay">€ ${defaultAmount.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row"><span>BTW ${s.btwRate !== undefined ? s.btwRate : 21}%</span><span id="btwAmtPay">€ ${(defaultAmount * (s.btwRate !== undefined ? s.btwRate : 21) / 100).toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row btw-total"><span>Incl. BTW</span><span id="btwInclPay">€ ${(defaultAmount * (1 + (s.btwRate !== undefined ? s.btwRate : 21) / 100)).toFixed(2).replace('.',',')}</span></div>
      </div>` : ''}
      <div class="form-group">
        <label>Omschrijving</label>
        <input type="text" id="payDesc" value="${esc(defaultDesc)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Betaalmethode</label>
          <select id="payMethod">
            <option value="bank_transfer" selected>Bankoverschrijving</option>
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
  const amountExcl = parseFloat(document.getElementById('payAmount')?.value || 0);
  const desc    = document.getElementById('payDesc')?.value?.trim();
  const method  = document.getElementById('payMethod')?.value || 'bank_transfer';
  const dueDate = document.getElementById('payDue')?.value;
  const type    = document.querySelector('input[name="payType"]:checked')?.value || 'subscription';
  const splitParts = parseInt(document.getElementById('splitParts')?.value || 2);
  const billing = type === 'subscription' ? 'maandelijks' : 'eenmalig';
  if (!amountExcl || amountExcl < 1) return toast('Voer een geldig bedrag in', 'error');
  const s = state.settings || {};
  const btwEnabled = s.btwEnabled || false;
  const btwRate    = s.btwRate !== undefined ? s.btwRate : 21;
  const btwAmt     = btwEnabled ? Math.round(amountExcl * btwRate) / 100 : 0;
  const amount     = btwEnabled ? Math.round((amountExcl + btwAmt) * 100) / 100 : amountExcl;
  const description = btwEnabled ? `${desc} (incl. ${btwRate}% BTW)` : desc;
  const btn = document.getElementById('savePayBtn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';
  const res  = await api(`/api/leads/${leadId}/payments`, { method: 'POST', body: JSON.stringify({ type, amount, description, billing, method, dueDate, splitParts }) });
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

function showBankDetails(leadId, payId) {
  const lead = state.leads.find(l => l.id === leadId);
  const p = lead?.payments?.find(p => p.id === payId);
  if (!p?.bankDetails) return toast('Geen bankgegevens gevonden', 'error');
  const d = p.bankDetails;
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-building-bank"></i> Bankgegevens</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;font-size:14px">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">IBAN</span><strong>${esc(d.iban)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Tenaamstelling</span><strong>${esc(d.name)}</strong></div>
        ${d.bic ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">BIC</span><strong>${esc(d.bic)}</strong></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Bedrag</span><strong style="color:var(--accent)">€${(p.amount||0).toLocaleString('nl-NL')}</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Omschrijving</span><strong>${esc(p.description||'')}</strong></div>
      </div>
      <p style="font-size:12px;color:var(--text-muted)">Stuur bovenstaande gegevens naar de klant zodat zij de betaling kunnen uitvoeren.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Sluiten</button>
      <button class="btn btn-primary" onclick="navigator.clipboard.writeText('IBAN: ${esc(d.iban)}\\nTenaamstelling: ${esc(d.name)}${d.bic ? '\\nBIC: ' + esc(d.bic) : ''}\\nBedrag: €${p.amount}\\nOmschrijving: ${esc(p.description||'')}');toast('Gekopieerd','success')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
    </div>
  `);
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

async function resendWelcomeEmail(leadId) {
  const btn = document.querySelector(`button[onclick="resendWelcomeEmail('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  try {
    const res = await api(`/api/leads/${leadId}/send-welcome`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Versturen mislukt', 'error'); return; }
    toast(`Welkomstmail verstuurd naar ${data.to}`, 'success');
  } catch (err) {
    toast('Fout: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Welkomstmail'; }
  }
}

function openAddDocModal(leadId) {
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-folder-plus"></i> Document toevoegen</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">TYPE</label>
        <div style="display:flex;gap:8px" id="docTypeSelector">
          ${[['link','Link / URL','ti-link'],['password','Wachtwoord','ti-lock'],['note','Notitie','ti-file-text']].map(([v,l,ic]) =>
            `<label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">
              <input type="radio" name="docType" value="${v}" ${v==='link'?'checked':''} style="display:none" onchange="document.querySelectorAll('#docTypeSelector label').forEach(el=>el.style.borderColor='var(--border)');this.closest('label').style.borderColor='var(--accent)'">
              <i class="ti ${ic}" style="font-size:18px"></i>${l}
            </label>`).join('')}
        </div>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">TITEL *</label>
        <input type="text" id="docTitle" placeholder="Bijv. Google Drive map, WordPress login..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">INHOUD (URL / WACHTWOORD / TEKST)</label>
        <input type="text" id="docContent" placeholder="Vul hier de URL, het wachtwoord of de tekst in..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div id="docUsernameRow">
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">GEBRUIKERSNAAM (optioneel)</label>
        <input type="text" id="docUsername" placeholder="admin@domein.nl" style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">BESCHRIJVING (optioneel)</label>
        <input type="text" id="docDescription" placeholder="Extra toelichting..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="docVisible" checked> Direct zichtbaar voor klant in portaal
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveNewDoc('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
    </div>
  `);
  // Show/hide username field based on type
  document.querySelectorAll('input[name="docType"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('docUsernameRow').style.display = r.value === 'password' ? '' : 'none';
  }));
  document.getElementById('docUsernameRow').style.display = 'none';
  // Highlight initially selected type
  document.querySelector('input[name="docType"]:checked')?.closest('label')?.style && (document.querySelector('input[name="docType"]:checked').closest('label').style.borderColor = 'var(--accent)');
}

async function saveNewDoc(leadId) {
  const type        = document.querySelector('input[name="docType"]:checked')?.value || 'link';
  const title       = document.getElementById('docTitle')?.value?.trim();
  const content     = document.getElementById('docContent')?.value?.trim();
  const username    = document.getElementById('docUsername')?.value?.trim();
  const description = document.getElementById('docDescription')?.value?.trim();
  const visible     = document.getElementById('docVisible')?.checked ?? true;
  if (!title) { toast('Voer een titel in', 'error'); return; }
  const res = await api(`/api/leads/${leadId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, content, username, description, visible })
  });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) { if (!lead.documents) lead.documents = []; lead.documents.push(data.document); }
    closeModal();
    toast('Document toegevoegd', 'success');
    renderProjectPage();
  } else {
    toast('Toevoegen mislukt', 'error');
  }
}

async function toggleDocVisibility(leadId, docId, currentlyHidden) {
  const res = await api(`/api/leads/${leadId}/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible: currentlyHidden })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    const doc = lead?.documents?.find(d => d.id === docId);
    if (doc) doc.visible = currentlyHidden;
    toast(currentlyHidden ? 'Document zichtbaar' : 'Document verborgen', 'success');
    renderProjectPage();
  } else toast('Opslaan mislukt', 'error');
}

async function deleteDoc(leadId, docId) {
  if (!confirm('Document verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/documents/${docId}`, { method: 'DELETE' });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.documents = (lead.documents || []).filter(d => d.id !== docId);
    toast('Document verwijderd', 'success');
    renderProjectPage();
  } else toast('Verwijderen mislukt', 'error');
}

async function saveWeeklyUpdatesSetting(enabled) {
  const res = await api('/api/settings/automation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyUpdatesEnabled: enabled })
  });
  if (res?.ok) toast(enabled ? 'Weekupdates ingeschakeld' : 'Weekupdates uitgeschakeld', 'success');
  else toast('Opslaan mislukt', 'error');
}

async function sendWeeklyUpdate(leadId) {
  const btn = document.querySelector(`button[onclick="sendWeeklyUpdate('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res = await api(`/api/leads/${leadId}/send-weekly-update`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    toast(`Weekupdate verstuurd: ${data.subject || ''}`, 'success');
    renderProjectPage();
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Weekupdate sturen'; }
  }
}

function _openDeliveryEmailModal(leadId, subject, body) {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📦 Oplevering email</h3>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Onderwerp</div>
      <div id="delivSubject" style="font-size:14px;font-weight:600;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">${esc(subject)}</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Email inhoud</div>
      <div id="delivBodyView" style="font-size:13px;white-space:pre-wrap;padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);max-height:320px;overflow-y:auto">${esc(body)}</div>
      <textarea id="delivBodyEdit" style="display:none;width:100%;min-height:240px;font-size:13px;padding:12px;border:1.5px solid var(--accent);border-radius:8px;font-family:inherit;resize:vertical"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" style="flex:1" onclick="sendDeliveryEmail('${leadId}')"><i class="ti ti-send"></i> Verstuur naar klant</button>
      <button class="btn btn-outline" onclick="toggleDeliveryEmailEdit()"><i class="ti ti-pencil"></i> Bewerken</button>
      <button class="btn btn-ghost" onclick="copyToClipboard((document.getElementById('delivBodyEdit')?.style.display!=='none'?document.getElementById('delivBodyEdit')?.value:document.getElementById('delivBodyView')?.textContent)||'','Gekopieerd!')"><i class="ti ti-copy"></i></button>
    </div>
  `);
}

window.openSavedDeliveryEmail = function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  const oe = lead?.opleveringEmail;
  if (!oe) return toast('Geen opgeslagen email gevonden', 'error');
  _openDeliveryEmailModal(leadId, oe.subject, oe.body);
};

async function generateDeliveryEmail(leadId, regenerate = false) {
  if (regenerate) {
    if (!confirm('Weet je zeker? De huidige email wordt overschreven.')) return;
  }
  const btn = document.querySelector(`button[onclick="generateDeliveryEmail('${leadId}')"], button[onclick="generateDeliveryEmail('${leadId}', true)"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res  = await api(`/api/leads/${leadId}/generate-delivery-email`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (btn) { btn.disabled = false; btn.innerHTML = regenerate ? '<i class="ti ti-refresh"></i> Opnieuw genereren' : '<i class="ti ti-sparkles"></i> Genereer & stuur'; }
  if (!res?.ok) return toast(data?.error || 'Genereren mislukt', 'error');
  if (regenerate) toast('Email opnieuw gegenereerd', 'success');
  // Update local state so UI refreshes
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    lead.opleveringEmail = { subject: data.subject, body: data.body, generatedAt: new Date().toISOString(), sentAt: lead.opleveringEmail?.sentAt || null };
  }
  renderProjectPage().then(() => switchProjectTab('emails'));
  _openDeliveryEmailModal(leadId, data.subject, data.body);
}

function toggleDeliveryEmailEdit() {
  const view = document.getElementById('delivBodyView');
  const edit = document.getElementById('delivBodyEdit');
  if (!view || !edit) return;
  if (edit.style.display !== 'none') {
    view.textContent = edit.value;
    view.style.display = '';
    edit.style.display = 'none';
  } else {
    edit.value = view.textContent;
    view.style.display = 'none';
    edit.style.display = '';
    edit.focus();
  }
}

async function sendDeliveryEmail(leadId) {
  const subject = document.getElementById('delivSubject')?.textContent?.trim() || '';
  const editEl  = document.getElementById('delivBodyEdit');
  const viewEl  = document.getElementById('delivBodyView');
  const body    = editEl?.style.display !== 'none' ? (editEl?.value || '') : (viewEl?.textContent || '');
  const btn = document.querySelector(`button[onclick="sendDeliveryEmail('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res  = await api(`/api/leads/${leadId}/send-delivery-email`, { method: 'POST', body: JSON.stringify({ subject, body }) });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    closeModal();
    toast('Oplevering email verstuurd!', 'success');
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.opleveringEmail) lead.opleveringEmail.sentAt = new Date().toISOString();
    renderProjectPage().then(() => switchProjectTab('emails'));
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Verstuur naar klant'; }
  }
}

async function generateAdminInstructions(leadId) {
  const btn = document.querySelector(`button[onclick="generateAdminInstructions('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res  = await api(`/api/leads/${leadId}/generate-admin-instructions`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-text"></i> Genereer'; }
  if (!res?.ok) return toast(data?.error || 'Genereren mislukt', 'error');
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📋 Admin instructies</h3>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;max-height:380px;overflow-y:auto;margin-bottom:16px">
      <pre id="adminInstrText" style="font-size:12px;white-space:pre-wrap;font-family:inherit;color:var(--text-primary);line-height:1.7">${esc(data.text)}</pre>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="sendAdminInstructions('${leadId}')"><i class="ti ti-mail"></i> Stuur naar mijzelf</button>
      <button class="btn btn-outline" onclick="copyToClipboard(document.getElementById('adminInstrText')?.textContent||'','Gekopieerd!')"><i class="ti ti-copy"></i> Kopieer alles</button>
      <button class="btn btn-ghost" onclick="downloadAdminInstructions()"><i class="ti ti-download"></i> Download .txt</button>
    </div>
  `);
}

async function sendAdminInstructions(leadId) {
  const text = document.getElementById('adminInstrText')?.textContent || '';
  const btn  = document.querySelector(`button[onclick="sendAdminInstructions('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res  = await api(`/api/leads/${leadId}/send-admin-email`, { method: 'POST', body: JSON.stringify({ text }) });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    toast('Admin instructies verstuurd naar jouw email!', 'success');
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail"></i> Stuur naar mijzelf'; }
}

function downloadAdminInstructions() {
  const text = document.getElementById('adminInstrText')?.textContent || '';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'admin-instructies.txt'; a.click();
  URL.revokeObjectURL(url);
}

// ── Project files helpers ───────────────────────────────────────────────────
window.toggleProjectFileShare = async function(leadId, fileId, shared) {
  const res = await api(`/api/leads/${leadId}/project-files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ sharedWithClient: shared, adminOnly: !shared })
  });
  if (!res?.ok) return toast('Bijwerken mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    const f = (lead.projectFiles || []).find(f => f.id === fileId);
    if (f) { f.sharedWithClient = shared; f.adminOnly = !shared; }
  }
  toast(shared ? 'Zichtbaar voor klant ✓' : 'Verborgen voor klant', shared ? 'success' : 'info');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
};

window.deleteProjectFile = async function(leadId, fileId) {
  if (!confirm('Bestand verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/project-files/${fileId}`, { method: 'DELETE' });
  if (!res?.ok) return toast('Verwijderen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) lead.projectFiles = (lead.projectFiles || []).filter(f => f.id !== fileId);
  toast('Bestand verwijderd', 'info');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
};

window.openAddProjectFileModal = function(leadId) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">📁 Bestand toevoegen</h3></div>
    <div class="form-group">
      <label>Naam</label>
      <input type="text" id="pfName" placeholder="Bijv. Boekingssysteem MexyDigital" class="form-control">
    </div>
    <div class="form-group">
      <label>Type</label>
      <select id="pfType" class="form-control">
        <option value="html">🌐 HTML pagina</option>
        <option value="document">📄 Document</option>
        <option value="strategy">📊 Strategie</option>
      </select>
    </div>
    <div class="form-group">
      <label>URL</label>
      <input type="text" id="pfUrl" placeholder="https://... of /sites/..." class="form-control">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" style="flex:1" onclick="saveProjectFile('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
    </div>
  `);
};

window.saveProjectFile = async function(leadId) {
  const name = document.getElementById('pfName')?.value?.trim();
  const type = document.getElementById('pfType')?.value || 'html';
  const url  = document.getElementById('pfUrl')?.value?.trim();
  if (!name || !url) return toast('Naam en URL zijn verplicht', 'error');
  const res  = await api(`/api/leads/${leadId}/project-files`, {
    method: 'POST',
    body: JSON.stringify({ name, type, url })
  });
  const data = res ? await res.json() : {};
  if (!res?.ok) return toast(data?.error || 'Toevoegen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { lead.projectFiles = lead.projectFiles || []; lead.projectFiles.push(data); }
  closeModal();
  toast('Bestand toegevoegd!', 'success');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
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
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">ONDERWERP</div>
        <div style="font-size:14px;font-weight:600">${esc(prev.subject || '')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">INHOUD</div>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.7;white-space:pre-line;max-height:300px;overflow-y:auto">${esc(prev.body || '')}</div>
      </div>
      ${!lead.email ? `<div style="background:var(--danger-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--danger)"><i class="ti ti-alert-triangle"></i> Geen email adres bekend voor dit bedrijf.</div>` : `<div style="font-size:12px;color:var(--text-secondary)"><i class="ti ti-send"></i> Wordt verstuurd naar: <strong>${esc(lead.email || lead.contactEmail || '—')}</strong></div>`}
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
    { label: 'Service-specifieke leveringen genereren' },
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
          <span id="dstep-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
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

function previewServiceDelivery(leadId, svcName) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const del = lead.delivery?.serviceDeliveries?.[svcName];
  if (!del || !del.html) return;
  openModal(svcName, `
    <div style="max-height:70vh;overflow:auto;padding:4px 0">
      <div style="font-size:11px;color:#9ca3af;margin-bottom:12px">Gegenereerd: ${del.generatedAt ? new Date(del.generatedAt).toLocaleString('nl-NL') : '—'}</div>
      ${del.html}
    </div>
  `, { wide: true });
}

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
          <span id="site-step-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
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

  const selectedTemplate = document.querySelector('#siteTemplateGrid .selected')?.dataset?.template
    || document.querySelector('.site-template-card.selected')?.dataset?.template
    || (window._selectedSiteTemplate ?? 'modern');

  fetch(`/api/leads/${leadId}/generate-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: selectedTemplate })
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

function selectSiteTemplate(templateId, el) {
  window._selectedSiteTemplate = templateId;
  document.querySelectorAll('.site-template-card').forEach(c => c.classList.remove('selected'));
  if (el) { el.classList.add('selected'); el.dataset.template = templateId; }
}

function openRegenerateModal(leadId) {
  const SITE_TEMPLATES = [
    { id: 'modern',    label: 'Modern',    icon: '✨', desc: 'Clean, witruimte, gradient hero' },
    { id: 'bold',      label: 'Bold',      icon: '⚡', desc: 'Donkere hero, hoog contrast' },
    { id: 'minimal',   label: 'Minimaal',  icon: '◻',  desc: 'Wit, subtiel, elegant' },
    { id: 'corporate', label: 'Corporate', icon: '🏢', desc: 'Zakelijk, blauw, formeel' },
  ];
  openModal(`<div class="modal-header"><h3 class="modal-title">Website regenereren</h3></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De huidige versie wordt opgeslagen in de versiegeschiedenis. Kies een template voor de nieuwe versie.</p>
      <div class="site-template-grid" id="regenTemplateGrid">
        ${SITE_TEMPLATES.map(t => `
          <div class="site-template-card ${t.id === 'modern' ? 'selected' : ''}" data-template="${t.id}" onclick="selectSiteTemplate('${t.id}',this)">
            <div class="site-template-icon">${t.icon}</div>
            <div class="site-template-label">${t.label}</div>
            <div class="site-template-desc">${t.desc}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="closeModal();generateSite('${leadId}')"><i class="ti ti-wand"></i> Genereren</button>
    </div>`);
}

async function openSeoPanel(leadId) {
  const data = await apiJSON(`/api/leads/${leadId}/site`);
  if (!data?.exists) { toast('Geen website gevonden', 'error'); return; }
  const seo = data.seo || {};
  openModal(`<div class="modal-header"><h3 class="modal-title"><i class="ti ti-search"></i> SEO meta tags</h3></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Deze tags worden direct in de HTML van de website geïnjecteerd en helpen Google de pagina beter te indexeren.</p>
      <div class="form-group"><label>Paginatitel (title tag)</label><input type="text" id="seoTitle" placeholder="${esc(data.content?.headline || '')}" value="${esc(seo.title || '')}"></div>
      <div class="form-group"><label>Meta description (max 160 tekens)</label><textarea id="seoDesc" style="height:80px;resize:vertical" placeholder="Korte beschrijving voor in Google zoekresultaten...">${esc(seo.description || '')}</textarea></div>
      <div class="form-group"><label>Keywords (komma-gescheiden)</label><input type="text" id="seoKeywords" placeholder="kapsalon amsterdam, haarkleur, highlights" value="${esc(seo.keywords || '')}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveSeoMeta('${leadId}')"><i class="ti ti-device-floppy"></i> SEO opslaan</button>
    </div>`);
}

async function saveSeoMeta(leadId) {
  const title    = document.getElementById('seoTitle')?.value?.trim() || '';
  const description = document.getElementById('seoDesc')?.value?.trim() || '';
  const keywords = document.getElementById('seoKeywords')?.value?.trim() || '';
  const res = await api(`/api/leads/${leadId}/site/seo`, { method: 'POST', body: JSON.stringify({ title, description, keywords }) });
  if (res?.ok) { toast('SEO tags opgeslagen.', 'success'); closeModal(); renderLeadDetail(leadId); }
  else toast('SEO opslaan mislukt.', 'error');
}

async function revertSiteVersion(leadId, versionIdx) {
  if (!confirm(`Versie ${versionIdx + 1} terugzetten? De huidige versie wordt gearchiveerd.`)) return;
  const res = await api(`/api/leads/${leadId}/site/revert/${versionIdx}`, { method: 'POST' });
  if (res?.ok) { toast('Versie teruggezet.', 'success'); renderLeadDetail(leadId); }
  else toast('Terugzetten mislukt.', 'error');
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
        ${t.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;line-height:1.4">${esc(t.description)}</div>` : ''}
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

// ─── Referral linking ────────────────────────────────────────────────────────

function linkReferral(leadId) {
  const clients = state.leads.filter(l => l.status === 'client' && l.id !== leadId);
  if (!clients.length) return toast('Nog geen klanten om te koppelen', 'error');
  const lead = state.leads.find(l => l.id === leadId);

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-users-group"></i> Referrer koppelen</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
      <p style="font-size:13px;color:var(--text-secondary)">Selecteer welke klant deze lead heeft doorverwezen.</p>
      <div class="form-group">
        <label>Doorverwezen door</label>
        <select id="referrerSelect" style="width:100%">
          <option value="">— Geen referrer —</option>
          ${clients.map(c => `<option value="${c.id}" ${lead?.referredBy === c.id ? 'selected' : ''}>${esc(c.companyName)} (${esc(c.location || c.niche || '')})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveReferralLink('${leadId}')"><i class="ti ti-link"></i> Opslaan</button>
    </div>
  `);
}

async function saveReferralLink(leadId) {
  const referrerId = document.getElementById('referrerSelect')?.value || null;
  const res = await api(`/api/leads/${leadId}/set-referrer`, { method: 'POST', body: JSON.stringify({ referrerId: referrerId || null }) });
  if (!res.ok) return toast('Opslaan mislukt', 'error');
  const data = await res.json();
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].referredBy = data.referredBy || null;
  closeModal();
  toast(referrerId ? 'Referrer gekoppeld' : 'Referrer-koppeling verwijderd', 'success');
  openLeadDetail(leadId);
}

async function unlinkReferral(leadId) {
  if (!confirm('Referral-koppeling verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/set-referrer`, { method: 'POST', body: JSON.stringify({ referrerId: null }) });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].referredBy = null;
  toast('Referral-koppeling verwijderd', 'success');
  openLeadDetail(leadId);
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
  const preferred = 'bank_transfer';
  const defaultDesc = lead.services?.map(sv => sv.name).join(', ') || 'AI-marketingdiensten';
  const defaultBilling = lead.services?.[0]?.billing || 'maandelijks';

  const methodOpts = [
    { value: 'bank_transfer', label: 'Bankoverschrijving', icon: 'ti-building-bank', enabled: true },
  ];

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
        <label>Bedrag ${s.btwEnabled ? 'excl. BTW ' : ''}(€)</label>
        <input type="number" id="invoiceAmount" value="${lead.estimatedValue || 800}" min="1" oninput="updateBtwBreakdown('invoice')">
      </div>
      ${s.btwEnabled ? (() => { const base = lead.estimatedValue || 800; const rate = s.btwRate !== undefined ? s.btwRate : 21; const btw = base * rate / 100; return `<div class="btw-breakdown" id="btwBreakdownInvoice">
        <div class="btw-row"><span>Excl. BTW</span><span id="btwExclInvoice">€ ${base.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row"><span>BTW ${rate}%</span><span id="btwAmtInvoice">€ ${btw.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row btw-total"><span>Incl. BTW</span><span id="btwInclInvoice">€ ${(base+btw).toFixed(2).replace('.',',')}</span></div>
      </div>`; })() : ''}
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

function updateBtwBreakdown(prefix) {
  const s = state.settings || {};
  if (!s.btwEnabled) return;
  const amountEl = document.getElementById(prefix === 'pay' ? 'payAmount' : 'invoiceAmount');
  const base = parseFloat(amountEl?.value || 0);
  const rate = s.btwRate !== undefined ? s.btwRate : 21;
  const btw  = Math.round(base * rate) / 100;
  const incl = Math.round((base + btw) * 100) / 100;
  const fmt  = v => '€ ' + v.toFixed(2).replace('.', ',');
  const sfx  = prefix === 'pay' ? 'Pay' : 'Invoice';
  const exEl = document.getElementById('btwExcl' + sfx);
  const bEl  = document.getElementById('btwAmt'  + sfx);
  const iEl  = document.getElementById('btwIncl' + sfx);
  if (exEl) exEl.textContent = fmt(base);
  if (bEl)  bEl.textContent  = fmt(btw);
  if (iEl)  iEl.textContent  = fmt(incl);
}

async function submitInvoice(leadId) {
  const lead    = state.leads.find(l => l.id === leadId);
  const desc    = document.getElementById('invoiceDesc')?.value || '';
  const amount  = parseInt(document.getElementById('invoiceAmount')?.value || 0);
  const method  = document.querySelector('input[name="invoiceMethod"]:checked')?.value || 'bank_transfer';
  const billing = document.querySelector('input[name="invoiceBilling"]:checked')?.value || 'maandelijks';
  const btn     = document.getElementById('createInvoiceBtn');

  if (!amount || amount < 1) return toast('Voer een geldig bedrag in', 'error');

  const s2 = state.settings || {};
  const btwEnabled2 = s2.btwEnabled || false;
  const btwRate2    = s2.btwRate !== undefined ? s2.btwRate : 21;
  const btwAmt2     = btwEnabled2 ? Math.round(amount * btwRate2) / 100 : 0;
  const amountIncl  = btwEnabled2 ? Math.round((amount + btwAmt2) * 100) / 100 : amount;
  const descWithBtw = btwEnabled2 ? `${desc} (incl. ${btwRate2}% BTW)` : desc;

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';

  const endpointMap = { stripe: '/api/stripe/invoice', mollie: '/api/mollie/invoice', paypal: '/api/paypal/invoice' };
  const endpoint = method === 'bank_transfer' ? `/api/leads/${leadId}/payments` : (endpointMap[method] || '/api/stripe/invoice');

  const resetBtn = () => {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-link"></i> Maak betaallink'; }
  };

  let data;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const bodyPayload = method === 'bank_transfer'
      ? { method: 'bank_transfer', amount: amountIncl, description: descWithBtw, billing, type: billing === 'maandelijks' ? 'subscription' : 'eenmalig', dueDate: new Date(Date.now() + ((state.settings?.paymentTermDays || 14) * 86400000)).toISOString() }
      : { companyName: lead?.companyName, description: descWithBtw, amount: amountIncl, billing };
    const res = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res) { resetBtn(); return; } // logged out by api()

    data = await res.json();

    if (!res.ok) {
      resetBtn();
      // Show fallback manual modal when payment provider not configured
      const errMsg = data?.error || 'Betaallink aanmaken mislukt';
      openModal(`
        <div class="modal-header">
          <h3><i class="ti ti-alert-triangle" style="color:var(--warning)"></i> Betaallink mislukt</h3>
          <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
          <p class="text-secondary">${esc(errMsg)}</p>
          <div class="invoice-fallback-box">
            <div class="invoice-fallback-label">Stuur handmatig een betalingsverzoek:</div>
            <div id="fallbackInvoiceText" style="font-size:13px;white-space:pre-wrap;color:var(--text-primary)">${esc(`Betalingsverzoek voor ${lead?.companyName || ''}\n\nBedrag: €${amountIncl}\nOmschrijving: ${descWithBtw}\nBetalingstermijn: 14 dagen\n\nOmschrijving bij overboeking: ${(lead?.companyName || '').slice(0,20)}-factuur`)}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="copyText(document.getElementById('fallbackInvoiceText').innerText); toast('Gekopieerd!','success')"><i class="ti ti-copy"></i> Kopiëren</button>
          <button class="btn btn-ghost" onclick="setView('settings')">Instellingen</button>
          <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
        </div>
      `);
      return;
    }
  } catch (err) {
    resetBtn();
    const isTimeout = err.name === 'AbortError';
    toast(isTimeout ? 'Tijdlimiet overschreden — probeer opnieuw' : 'Verbindingsfout — controleer je internetverbinding', 'error');
    return;
  }

  if (method === 'bank_transfer') {
    const s2 = state.settings || {};
    const termDays2 = s2.paymentTermDays || 14;
    openModal(`
      <div class="modal-header">
        <h3><i class="ti ti-check" style="color:var(--success)"></i> Factuur aangemaakt!</h3>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
        <p class="text-secondary">Factuur aangemaakt voor <strong>${esc(lead?.companyName)}</strong>. Een betalingsverzoek is automatisch verzonden naar de klant.</p>
        ${s2.bankTransferIban ? `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8">
          <strong style="display:block;margin-bottom:6px;color:var(--text-primary)">Overboekingsgegevens</strong>
          <div>IBAN: <code style="color:var(--accent)">${esc(s2.bankTransferIban)}</code></div>
          ${s2.bankTransferName ? `<div>Tenaamstelling: ${esc(s2.bankTransferName)}</div>` : ''}
          ${s2.bankTransferBic ? `<div>BIC: ${esc(s2.bankTransferBic)}</div>` : ''}
          <div>Betalingstermijn: ${termDays2} dagen</div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
      </div>
    `);
    return;
  }

  // Save URL to lead for reference (Stripe/Mollie/PayPal)
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
      <p class="text-secondary">Stuur deze link naar <strong>${esc(lead?.companyName)}</strong>:</p>
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
    { num: 5, color: '#dc2626', icon: 'ti-mail',            name: 'Email Writer',       role: 'Schrijft gepersonaliseerde koude email', desc: 'Schrijft een menselijke koude email in de taal van het bedrijf (NL, EN, DE, FR of IT). Max 120 woorden, informele toon, begint met de gepersonaliseerde opener van Agent 3.', s1l: 'Geschreven', s2l: 'Verstuurd' },
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
      <div class="card-header" style="cursor:pointer;user-select:none" onclick="const b=document.getElementById('memTableBody');const c=document.getElementById('memChevron');const open=b.style.display!=='none';b.style.display=open?'none':'';c.style.transform=open?'':'rotate(90deg)'">
        <h3 class="card-title"><i class="ti ti-brain" style="color:#7c3aed;margin-right:6px"></i> Wat het systeem heeft geleerd</h3>
        <i class="ti ti-chevron-right" id="memChevron" style="color:var(--text-muted);transition:transform 0.2s"></i>
      </div>
      <div id="memTableBody" style="display:none">
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
              <th>Niche</th><th>Land</th><th>Leads verstuurd</th><th>Reply rate</th><th>Score aanpassing</th><th>A/B auto</th>
            </tr></thead>
            <tbody>
              ${memEntries.map(m => {
                const cappedRate = Math.min(100, m.replyRate || 0);
                const tooFewData = m.sent < 5;
                let adj = '—', adjClass = 'text-secondary';
                if (!tooFewData) {
                  if (cappedRate > 20) { adj = '+0.5'; adjClass = 'text-success'; }
                  else if (cappedRate < 5) { adj = '-0.3'; adjClass = 'text-danger'; }
                  else { adj = '0'; adjClass = ''; }
                }
                const abKey = `${(m.niche||'unknown').toLowerCase().replace(/[^a-z]/g,'')}_${(m.country||'unknown').toLowerCase().replace(/[^a-z]/g,'')}`;
                const abCell = m.autoPickVersion
                  ? `<span style="color:var(--accent);font-weight:600">Versie ${m.autoPickVersion} wint</span> <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;margin-left:4px" onclick="resetAbMemory('${abKey}')">Reset</button>`
                  : `<span class="text-muted" style="font-size:12px">—</span>`;
                return `<tr>
                  <td>${nicheBadge(m.niche)}</td>
                  <td>${m.country}</td>
                  <td>${m.sent}</td>
                  <td>${tooFewData ? `<span class="text-muted" style="font-size:12px">te weinig data</span>` : `${cappedRate}%`}</td>
                  <td class="${adjClass}" style="font-weight:600">${adj}</td>
                  <td>${abCell}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        `}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-brain" style="color:#7c3aed;margin-right:6px"></i> Conversie-intelligentie (ML)</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Agent 4 past scores automatisch aan op basis van historische conversiedata (welke leads werden klant vs. verloren).</p>
      ${(() => {
        const mlEntries = memEntries.filter(m => (m.converted || 0) + (m.lost || 0) >= 1);
        if (mlEntries.length === 0) return `<div class="empty-state" style="padding:20px"><i class="ti ti-chart-line"></i><p>Nog geen conversiedata — wordt gevuld zodra leads klant worden of verloren gaan.</p></div>`;
        return `<div style="overflow-x:auto">
          <table class="table">
            <thead><tr>
              <th>Niche</th><th>Land</th><th>Klanten</th><th>Verloren</th><th>Conversieratio</th><th>Score boost</th><th>Beste profiel</th>
            </tr></thead>
            <tbody>
              ${mlEntries.map(m => {
                const total = (m.converted || 0) + (m.lost || 0);
                const rate = m.conversionRate || 0;
                let boostVal = 0, boostClass = '';
                if (total >= 3) {
                  if (rate > 15) { boostVal = 1.0; boostClass = 'text-success'; }
                  else if (rate > 8) { boostVal = 0.5; boostClass = 'text-success'; }
                  else if (rate < 3 && total >= 5) { boostVal = -0.5; boostClass = 'text-danger'; }
                }
                const profileParts = [];
                if (m.bestFollowerRange) profileParts.push(`${m.bestFollowerRange} volgers`);
                if (m.bestWebsiteScore && m.bestWebsiteScore !== 'unknown') profileParts.push(`website ${m.bestWebsiteScore}`);
                return `<tr>
                  <td>${nicheBadge(m.niche)}</td>
                  <td>${m.country}</td>
                  <td style="color:var(--success);font-weight:600">${m.converted || 0}</td>
                  <td style="color:var(--danger)">${m.lost || 0}</td>
                  <td>${total < 3 ? '<span class="text-muted" style="font-size:12px">te weinig data</span>' : `${rate}%`}</td>
                  <td class="${boostClass}" style="font-weight:600">${boostVal !== 0 ? (boostVal > 0 ? '+' : '') + boostVal : '—'}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">${profileParts.length ? profileParts.join(', ') : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      })()}
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

    <!-- Live run progress (hidden when idle) -->
    <div id="liveRunCard" style="display:none;margin-bottom:16px"></div>

    <!-- Section 1: Run Configuratie -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Run configuratie</h3>
      </div>
      ${!isAdmin() ? `<div class="employee-notice"><i class="ti ti-lock"></i> Alleen admins kunnen runs starten</div>` : `
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
      </div>`}
      ${isAdmin() ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;gap:20px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="igTargetingToggle" ${(settings || {}).instagramTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('instagramTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent)">
          <i class="ti ti-brand-instagram" style="color:#e1306c;font-size:15px"></i>
          Instagram targeting
          <span style="font-size:11px;color:var(--text-muted);font-weight:400">— accounts 2K-200K volgers, laag engagement</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="mapsTargetingToggle" ${(settings || {}).googleMapsTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('googleMapsTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent)">
          <i class="ti ti-map-pin" style="color:#4285f4;font-size:15px"></i>
          Google Maps targeting
          <span style="font-size:11px;color:var(--text-muted);font-weight:400">— 3-4 ster reviews, minder dan 50 reviews</span>
        </label>
      </div>` : ''}
      <div style="margin-top:14px">
        <p id="run-status" style="display:none;font-size:13px;color:var(--text-muted);margin:0 0 6px"></p>
        <div id="run-progress-bar" style="display:none"></div>
        <p id="run-timer" style="display:none;font-size:12px;color:var(--text-muted);margin:6px 0 0"></p>
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
          <label class="settings-label">Email <span style="font-weight:400;color:var(--text-muted)">(optioneel — anders zoekt Agent 1)</span></label>
          <input type="email" id="custEmail" placeholder="info@bedrijf.nl" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
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

    <!-- Systeemstatus & foutmeldingen -->
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-heartbeat" style="color:var(--danger)"></i> Systeemstatus</h3>
        <div style="display:flex;gap:8px">
          <a class="btn btn-ghost btn-sm" href="/status" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Statuspagina</a>
          <button class="btn btn-ghost btn-sm" id="dashCheckRepliesBtn" onclick="triggerReplyCheck()" title="Controleer Gmail inbox nu op nieuwe replies"><i class="ti ti-mail-forward"></i> Controleer replies nu</button>
          <button class="btn btn-ghost btn-sm" onclick="loadSystemHealth()"><i class="ti ti-refresh"></i> Vernieuwen</button>
        </div>
      </div>
      <div id="healthPanel"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>
  `;

  // Load costs + activity after render
  loadCostStats();
  loadActivityLog();
  loadTemplates();
  loadSystemHealth();
  startRunProgressPoll();
}

let _runProgressPollTimer = null;
function startRunProgressPoll() {
  stopRunProgressPoll();
  pollRunProgress();
}
function stopRunProgressPoll() {
  if (_runProgressPollTimer) { clearTimeout(_runProgressPollTimer); _runProgressPollTimer = null; }
}
function updateSidebarRunning(p) {
  const wrap = document.getElementById('sidebarRunning');
  const text = document.getElementById('sidebarRunningText');
  const bar  = document.getElementById('sidebarRunningBar');
  if (!wrap) return;
  if (p && p.running) {
    wrap.style.display = '';
    if (text) text.textContent = p.currentAgent || 'Outreach run';
    if (bar)  bar.style.width = (p.target > 0 ? Math.round((p.found / p.target) * 100) : 0) + '%';
  } else {
    wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
  }
}

async function pollRunProgress() {
  const card = document.getElementById('liveRunCard');
  if (!card) return;
  try {
    const p = await apiJSON('/api/run/progress');
    updateSidebarRunning(p);
    if (p && p.running) {
      const pct = p.target > 0 ? Math.round((p.found / p.target) * 100) : 0;
      const elapsed = p.startedAt ? Math.round((Date.now() - new Date(p.startedAt).getTime()) / 1000) : 0;
      const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;
      card.style.display = 'block';
      card.innerHTML = `
        <div class="card" style="border:2px solid var(--accent);background:var(--accent-light)">
          <div class="card-header" style="border-bottom:1px solid var(--accent);padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="running-dot"></span>
              <h3 class="card-title" style="color:var(--accent)">Run actief</h3>
              <span style="font-size:12px;color:var(--text-muted)">${elapsedLabel} bezig</span>
            </div>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${p.found}/${p.target} leads</span>
          </div>
          <div style="padding:14px 20px">
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
                <span>${p.currentAgent || 'Bezig...'}</span>
                <span>${pct}%</span>
              </div>
              <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .4s"></div>
              </div>
            </div>
            ${p.currentLead ? `<div style="font-size:12px;color:var(--text-muted)">Huidig bedrijf: <strong style="color:var(--text-primary)">${p.currentLead}</strong></div>` : ''}
            ${p.skipped > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${p.skipped} overgeslagen (geen email / blacklist)</div>` : ''}
            ${p.log && p.log.length ? `
              <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
                <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Log</div>
                ${p.log.slice(0,5).map(l => `
                  <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${l.msg}</div>
                `).join('')}
              </div>` : ''}
          </div>
        </div>`;
      _runProgressPollTimer = setTimeout(pollRunProgress, 3000);
    } else {
      card.style.display = 'none';
      updateSidebarRunning(null);
      if (p && p.finishedAt && !p.running) {
        const justFinished = (Date.now() - new Date(p.finishedAt).getTime()) < 10000;
        if (justFinished) loadSystemHealth();
      }
    }
  } catch {
    card.style.display = 'none';
    updateSidebarRunning(null);
  }
}

async function loadSystemHealth() {
  const panel = document.getElementById('healthPanel');
  if (!panel) return;

  const [health, errors, rateStatus] = await Promise.all([
    fetch('/health').then(r => r.json()).catch(() => null),
    apiJSON('/api/errors').catch(() => []),
    apiJSON('/api/ai/rate-status').catch(() => null)
  ]);

  if (!health) {
    panel.innerHTML = `<div class="error-state"><i class="ti ti-alert-circle"></i> Kon status niet laden</div>`;
    return;
  }

  const aiThrottled = rateStatus && (
    rateStatus.callsLastMinute >= rateStatus.limits.maxCallsPerMinute * 0.9 ||
    rateStatus.callsLastDay    >= rateStatus.limits.maxCallsPerDay    * 0.9 ||
    rateStatus.costLastDay     >= rateStatus.limits.maxDailyCostUsd   * 0.9
  );
  const checks = [
    { key: 'claude_api', label: 'Claude API',   icon: 'ti-brain',         ok: health.checks?.claude_api },
    { key: 'gmail',      label: 'Gmail SMTP',   icon: 'ti-mail',          ok: health.checks?.gmail },
    { key: 'postgres',   label: 'PostgreSQL',   icon: 'ti-database',      ok: health.checks?.postgres, optional: true },
    ...(rateStatus ? [{ key: 'ai_rate', label: `AI calls vandaag: ${rateStatus.callsLastDay}/${rateStatus.limits.maxCallsPerDay}`, icon: 'ti-gauge', ok: !aiThrottled, optional: true }] : []),
  ];

  const statusColor = health.status === 'ok' ? 'var(--success)' : 'var(--warning)';
  const statusLabel = health.status === 'ok' ? 'Alles operationeel' : 'Aandacht vereist';

  const errorRows = (errors || []).slice(0, 10);
  const typeIcon  = { run: 'ti-player-play', agent1: 'ti-search', cron_run: 'ti-clock', followup1: 'ti-mail-forward', followup2: 'ti-mail-forward', cron_followup: 'ti-clock' };

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:10px;height:10px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${statusLabel}</span>
      <span class="text-muted" style="font-size:12px">• Uptime: ${health.uptimeLabel || '—'}</span>
      ${health.lastRun ? `<span class="text-muted" style="font-size:12px">• Laatste run: ${formatDate(health.lastRun.time)} (${health.lastRun.leadsFound} leads)</span>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${checks.map(c => `
        <div class="health-check-pill ${c.ok ? 'health-ok' : c.optional ? 'health-warn' : 'health-err'}">
          <i class="ti ${c.icon}"></i>
          <span>${c.label}</span>
          <i class="ti ${c.ok ? 'ti-check' : 'ti-x'}" style="font-size:11px"></i>
        </div>`).join('')}
    </div>
    ${errorRows.length ? `
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
        Recente fouten (${errorRows.length})
      </div>
      <div class="error-log-list">
        ${errorRows.map(e => `
          <div class="error-log-row">
            <i class="ti ${typeIcon[e.type] || 'ti-alert-circle'}" style="color:var(--danger);flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(e.message)}</div>
              ${e.details ? `<div class="error-log-detail">${esc(e.details)}</div>` : ''}
            </div>
            <span class="error-log-time">${new Date(e.time).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})} ${formatDate(e.time)}</span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;align-items:center;gap:8px;color:var(--success);font-size:13px">
        <i class="ti ti-circle-check"></i> Geen recente fouten
      </div>`}
  `;
}

// ── Agency Profiles ──────────────────────────────────────────────────────────

async function loadAgencyProfiles() {
  const list = document.getElementById('agencyProfilesList');
  if (!list) return;
  const profiles = await apiJSON('/api/agency-profiles').catch(() => []) || [];
  const activeId = state.settings?.activeProfileId;
  if (!profiles.length) {
    list.innerHTML = `<div style="font-size:13px;color:var(--text-muted)">Nog geen profielen aangemaakt. Maak een profiel aan om snel te wisselen van agency-identiteit.</div>`;
    return;
  }
  list.innerHTML = profiles.map(p => `
    <div style="border:1.5px solid ${p.id === activeId ? 'var(--accent)' : 'var(--border)'};border-radius:var(--radius);padding:12px 14px;background:${p.id === activeId ? 'var(--accent-light)' : 'var(--surface)'};display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="width:14px;height:14px;border-radius:3px;background:${esc(p.brandColor || '#2563eb')};flex-shrink:0"></div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:var(--text-primary)">${esc(p.agencyName)}</div>
        <div style="font-size:12px;color:var(--text-secondary)">${esc(p.myName || '')}${p.myTitle ? ' · ' + esc(p.myTitle) : ''}${p.agencyAddress ? ' · ' + esc(p.agencyAddress) : ''}</div>
      </div>
      ${p.id === activeId ? `<span class="badge badge-blue" style="font-size:10px"><i class="ti ti-check"></i> Actief</span>` : `<button class="btn btn-primary btn-sm" onclick="activateAgencyProfile('${p.id}')"><i class="ti ti-bolt"></i> Activeer</button>`}
      <button class="btn btn-ghost btn-sm" onclick="openProfileModal('${p.id}')"><i class="ti ti-edit"></i></button>
      <button class="btn btn-ghost btn-sm" onclick="deleteAgencyProfile('${p.id}')" style="color:var(--danger)"><i class="ti ti-trash"></i></button>
    </div>
  `).join('');
}

function openProfileModal(profileId) {
  const profiles = [];
  const existing = profileId ? (state.settings?.agencyProfiles || []).find(p => p.id === profileId) : null;
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-building"></i> ${existing ? 'Profiel bewerken' : 'Nieuw agency profiel'}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-grid">
        <div class="form-group" style="grid-column:1/-1">
          <label>Agency naam *</label>
          <input type="text" id="profAgencyName" value="${esc(existing?.agencyName || '')}" placeholder="Growth Lab BV">
        </div>
        <div class="form-group">
          <label>Mijn naam</label>
          <input type="text" id="profMyName" value="${esc(existing?.myName || '')}" placeholder="Jan de Vries">
        </div>
        <div class="form-group">
          <label>Functietitel</label>
          <input type="text" id="profMyTitle" value="${esc(existing?.myTitle || '')}" placeholder="AI Growth Specialist">
        </div>
        <div class="form-group" style="grid-column:1/-1">
          <label>Kantooradres</label>
          <input type="text" id="profAddress" value="${esc(existing?.agencyAddress || '')}" placeholder="Keizersgracht 1, Amsterdam">
        </div>
        <div class="form-group">
          <label>Merkkleur</label>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="color" id="profColor" value="${existing?.brandColor || '#2563eb'}" style="width:44px;height:36px;border:1px solid var(--border);border-radius:6px;cursor:pointer">
            <input type="text"  id="profColorHex" value="${existing?.brandColor || '#2563eb'}" style="width:90px" oninput="document.getElementById('profColor').value=this.value">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveAgencyProfile('${profileId || ''}')"><i class="ti ti-device-floppy"></i> Opslaan</button>
    </div>
  `);
  document.getElementById('profColor')?.addEventListener('input', e => {
    const hex = document.getElementById('profColorHex');
    if (hex) hex.value = e.target.value;
  });
}

async function saveAgencyProfile(profileId) {
  const agencyName    = document.getElementById('profAgencyName')?.value?.trim();
  const myName        = document.getElementById('profMyName')?.value?.trim() || '';
  const myTitle       = document.getElementById('profMyTitle')?.value?.trim() || '';
  const agencyAddress = document.getElementById('profAddress')?.value?.trim() || '';
  const brandColor    = document.getElementById('profColorHex')?.value?.trim() || '#2563eb';
  if (!agencyName) return toast('Agency naam is verplicht', 'error');

  const isEdit = !!profileId;
  const res = await api(
    isEdit ? `/api/agency-profiles/${profileId}` : '/api/agency-profiles',
    { method: isEdit ? 'PATCH' : 'POST', body: JSON.stringify({ agencyName, myName, myTitle, agencyAddress, brandColor }) }
  );
  if (!res.ok) return toast('Opslaan mislukt', 'error');
  const profile = await res.json();

  if (!state.settings.agencyProfiles) state.settings.agencyProfiles = [];
  if (isEdit) {
    const idx = state.settings.agencyProfiles.findIndex(p => p.id === profileId);
    if (idx !== -1) state.settings.agencyProfiles[idx] = profile;
  } else {
    state.settings.agencyProfiles.push(profile);
  }
  closeModal();
  toast(isEdit ? 'Profiel bijgewerkt' : 'Profiel aangemaakt', 'success');
  loadAgencyProfiles();
}

async function activateAgencyProfile(profileId) {
  const res = await api(`/api/agency-profiles/${profileId}/activate`, { method: 'POST' });
  if (!res.ok) return toast('Activeren mislukt', 'error');
  const data = await res.json();
  if (state.settings) {
    state.settings.activeProfileId = profileId;
    state.settings.agencyName  = data.settings.agencyName;
    state.settings.myName      = data.settings.myName;
    state.settings.myTitle     = data.settings.myTitle;
    state.settings.brandColor  = data.settings.brandColor;
    // Reflect in account form fields immediately
    const el = id => document.getElementById(id);
    if (el('agencyName')) el('agencyName').value = data.settings.agencyName || '';
    if (el('myName'))     el('myName').value     = data.settings.myName     || '';
    if (el('myTitle'))    el('myTitle').value     = data.settings.myTitle   || '';
  }
  toast(`Profiel "${data.settings.agencyName}" is nu actief`, 'success');
  loadAgencyProfiles();
}

async function deleteAgencyProfile(profileId) {
  if (!confirm('Profiel verwijderen?')) return;
  const res = await api(`/api/agency-profiles/${profileId}`, { method: 'DELETE' });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  if (state.settings?.agencyProfiles) {
    state.settings.agencyProfiles = state.settings.agencyProfiles.filter(p => p.id !== profileId);
  }
  toast('Profiel verwijderd', 'success');
  loadAgencyProfiles();
}

async function loadAiRateStatus() {
  const bar = document.getElementById('aiRateStatusBar');
  if (!bar) return;
  const d = await apiJSON('/api/ai/rate-status').catch(() => null);
  if (!d) { bar.innerHTML = ''; return; }
  const pct = v => Math.min(100, Math.round(v * 100));
  const pill = (label, used, max, warn) => {
    const p = pct(used / max);
    const color = p >= 90 ? 'var(--danger)' : p >= 70 ? 'var(--warning)' : 'var(--success)';
    return `<div style="font-size:12px;margin-bottom:4px;display:flex;align-items:center;gap:8px">
      <span style="width:130px;color:var(--text-secondary)">${label}</span>
      <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
        <div style="height:100%;width:${p}%;background:${color};border-radius:3px;transition:width .3s"></div>
      </div>
      <span style="font-size:11px;color:${color};font-weight:600;width:60px;text-align:right">${used} / ${max}</span>
    </div>`;
  };
  bar.innerHTML = `
    <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius);padding:12px 14px">
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:10px">Huidig API gebruik</div>
      ${pill('Calls / minuut', d.callsLastMinute, d.limits.maxCallsPerMinute)}
      ${pill('Calls / uur',    d.callsLastHour,   d.limits.maxCallsPerHour)}
      ${pill('Calls / dag',    d.callsLastDay,    d.limits.maxCallsPerDay)}
      ${pill('Kosten vandaag ($)', d.costLastDay, d.limits.maxDailyCostUsd)}
    </div>`;
}

const ACTIVITY_ICONS = { run: 'ti-player-play', email: 'ti-send', reply: 'ti-message-reply', backup: 'ti-database-export', followup: 'ti-clock-hour-4', bounce: 'ti-mail-off', ai_call: 'ti-brain' };
const ACTIVITY_COLORS = { run: '#2563eb', email: '#16a34a', reply: '#ea580c', backup: '#9b9b98', followup: '#7c3aed', bounce: '#dc2626', ai_call: '#7c3aed' };

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
window.openRetryEmailSection = function(leadId) {
  const el = document.getElementById(`retryEmailSection-${leadId}`);
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <input type="email" id="retryEmail-${leadId}" class="form-input" placeholder="Nieuw email adres..." style="flex:1;min-width:180px">
      <button class="btn btn-sm btn-primary" onclick="submitRetryEmail('${leadId}')">
        <i class="ti ti-send"></i> Opslaan & verstuur opnieuw
      </button>
      <button class="btn btn-ghost btn-sm" onclick="openRetryEmailSection('${leadId}')">Annuleren</button>
    </div>`;
};

window.submitRetryEmail = async function(leadId) {
  const input = document.getElementById(`retryEmail-${leadId}`);
  const email = input?.value?.trim();
  if (!email || !email.includes('@')) { toast('Voer een geldig email adres in', 'error'); return; }
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  // Save new email on lead
  const r = await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ contactEmail: email, emailSource: 'handmatig', emailVerified: false, status: 'approved' }) });
  if (!r?.ok) { toast('Opslaan mislukt', 'error'); return; }
  lead.contactEmail = email;
  lead.emailSource  = 'handmatig';
  lead.status       = 'approved';
  toast(`Email opgeslagen voor ${lead.companyName}. Keur opnieuw goed om te versturen.`, 'success');
  openLeadDetail(leadId);
};

window.addFixedCostRow = function() {
  const list = document.getElementById('fixedCostsList');
  if (!list) return;
  const row = document.createElement('div');
  row.className = 'fixed-cost-row';
  row.style.cssText = 'display:flex;gap:8px;align-items:center';
  row.innerHTML = `
    <input type="text" class="stg-input fc-name" placeholder="Naam (bijv. Railway hosting)" style="flex:1" oninput="updateFixedCostTotal()">
    <div style="display:flex;align-items:center;gap:4px">
      <span style="color:var(--text-secondary);font-size:14px">€</span>
      <input type="number" class="stg-input fc-amount" placeholder="0" value="0" min="0" step="0.01" style="width:90px" oninput="updateFixedCostTotal()">
    </div>
    <button class="btn btn-ghost btn-sm" style="padding:0 8px;height:36px;color:var(--danger)" onclick="this.closest('.fixed-cost-row').remove();updateFixedCostTotal()" title="Verwijder">×</button>
  `;
  list.appendChild(row);
  row.querySelector('.fc-name').focus();
};

window.updateFixedCostTotal = function() {
  const total = [...document.querySelectorAll('#fixedCostsList .fc-amount')]
    .reduce((sum, el) => sum + (parseFloat(el.value) || 0), 0);
  const el = document.getElementById('fixedCostTotal');
  if (el) el.textContent = '€' + total.toFixed(2);
};

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
        ${e.autoAdded ? `<span style="font-size:10px;color:#9ca3af;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;margin-left:6px">Automatisch</span>` : ''}
      </div>
      <button class="btn btn-ghost btn-sm" style="color:#ef4444" onclick="removeBlacklist('${e.id}')"><i class="ti ti-x"></i></button>
    </div>`).join('');
}

async function removeBlacklist(id) {
  const res = await api('/api/blacklist/' + id, { method: 'DELETE' });
  if (res.ok) { toast('Verwijderd', 'success'); loadBlacklist(); }
}

async function resetAbMemory(key) {
  if (!confirm('A/B data resetten voor deze niche? De auto-pick wordt gewist en beide versies worden weer afgewisseld.')) return;
  const res = await api(`/api/memory/${encodeURIComponent(key)}/reset-ab`, { method: 'POST' });
  if (res.ok) { toast('A/B reset — beide versies worden weer afgewisseld', 'success'); setView('agents'); }
  else toast('Reset mislukt', 'error');
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

function _runFmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function toggleLeadSource(key, value) {
  const res = await api('/api/settings/automation', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ [key]: value }) });
  if (res.ok) toast(value ? `${key === 'instagramTargeting' ? 'Instagram' : 'Google Maps'} targeting ingeschakeld` : `Targeting uitgeschakeld`, 'success');
  else toast('Opslaan mislukt', 'error');
}

async function startCustomRun() {
  const count    = parseInt(document.getElementById('runCount')?.value) || 15;
  const niches   = document.getElementById('runNiches')?.value?.trim();
  const nicheArr = niches ? niches.split(',').map(n => n.trim()).filter(Boolean) : [];
  const btn      = document.getElementById('startRunBtn');
  const statusEl = document.getElementById('run-status');
  const barEl    = document.getElementById('run-progress-bar');
  const timerEl  = document.getElementById('run-timer');

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }
  if (statusEl) { statusEl.textContent = 'Run gestart...'; statusEl.style.display = ''; statusEl.style.color = ''; }
  if (barEl)    barEl.style.display = '';
  if (timerEl)  { timerEl.textContent = 'Bezig: 0:00'; timerEl.style.display = ''; }

  if (document.getElementById('liveRunCard')) startRunProgressPoll();

  const t0 = Date.now();
  const timer = setInterval(() => {
    if (timerEl) timerEl.textContent = `Bezig: ${_runFmt(Date.now() - t0)}`;
  }, 1000);

  try {
    const res  = await api('/api/find-leads', { method: 'POST', body: JSON.stringify({ count, niches: nicheArr }) });
    const data = await res.json().catch(() => ({}));
    clearInterval(timer);
    const duration = _runFmt(Date.now() - t0);

    if (barEl)   barEl.style.display = 'none';
    if (timerEl) timerEl.style.display = 'none';

    if (res?.ok) {
      if (statusEl) statusEl.textContent = `Klaar in ${duration} — ${data.found || 0} leads gevonden`;
      toast(`Run klaar — ${data.found || 0} leads gevonden`, 'success');
      renderRuns();
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Run mislukt — controleer logs'; statusEl.style.color = '#dc2626'; }
      toast(data.error || 'Run mislukt — controleer server logs', 'error');
    }
  } catch (err) {
    clearInterval(timer);
    if (barEl)   barEl.style.display = 'none';
    if (timerEl) timerEl.style.display = 'none';
    if (statusEl) { statusEl.textContent = 'Fout: ' + err.message; statusEl.style.color = '#dc2626'; }
    toast('Fout: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Start run'; }
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
        email:           document.getElementById('custEmail')?.value?.trim() || '',
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
    ['custCompany','custWebsite','custEmail','custInstagram','custLocation'].forEach(id => {
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
  const [summary, detail, pnl, ab] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON(`/api/stats/detailed?days=${days}`),
    apiJSON('/api/stats/pnl'),
    apiJSON('/api/stats/ab')
  ]);
  if (!summary || !detail) return;
  const pnlData = pnl || { months: [], totalRevenue: 0, totalCosts: 0, totalProfit: 0, margin: 0 };
  const abData = ab || null;

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

    <!-- ── Winst & Verlies ── -->
    <hr style="margin:28px 0;border:none;border-top:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary)"><i class="ti ti-test-pipe" style="margin-right:6px;color:#7c3aed"></i>A/B Email Resultaten</h2>
      <span class="text-muted" style="font-size:12px">${abData?.totalLeadsWithVersion || 0} leads met versie-data</span>
    </div>
    ${abData && abData.totalLeadsWithVersion > 0 ? `
    <div class="ab-compare-row">
      ${['A','B'].map(v => {
        const d = abData[v];
        const isWinner = abData.winner === v;
        const fmt1 = x => x === null ? '—' : x + '%';
        return `<div class="ab-version-card ${isWinner ? 'ab-winner' : ''}">
          ${isWinner ? '<div class="ab-winner-badge"><i class="ti ti-trophy"></i> Winnaar</div>' : ''}
          <div class="ab-version-label">Versie ${v}</div>
          <div class="ab-version-sent">${d.sent} verstuurd</div>
          <div class="ab-metrics">
            <div class="ab-metric">
              <div class="ab-metric-value ${isWinner ? 'ab-metric-highlight' : ''}">${fmt1(d.replyRate)}</div>
              <div class="ab-metric-label">Reply rate</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value">${fmt1(d.openRate)}</div>
              <div class="ab-metric-label">Open rate</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value">${d.replied}</div>
              <div class="ab-metric-label">Replies</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value" style="color:var(--danger)">${fmt1(d.bounceRate)}</div>
              <div class="ab-metric-label">Bounce rate</div>
            </div>
          </div>
          <div class="ab-bar-wrap">
            <div class="ab-bar" style="width:${Math.min(100, d.replyRate ?? 0) * 4}%;background:${isWinner ? 'var(--accent)' : 'var(--border)'}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="card chart-card" style="margin-top:16px">
      <h3 class="chart-title">Reply rate vergelijking per niche</h3>
      <canvas id="chartAB" height="160"></canvas>
    </div>
    ${abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).length > 0 ? `
    <div class="card" style="overflow:hidden;margin-bottom:0;margin-top:16px">
      <table class="pnl-table">
        <thead><tr><th>Niche</th><th>Versie A (gestuurd)</th><th>Versie B (gestuurd)</th><th>Reply A</th><th>Reply B</th><th>Winnaar</th></tr></thead>
        <tbody>
          ${abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).map(n => `
            <tr class="pnl-row">
              <td style="font-weight:600;text-transform:capitalize">${esc(n.niche)}</td>
              <td>${n.A.sent}</td>
              <td>${n.B.sent}</td>
              <td class="${n.winner === 'A' ? 'pnl-pos' : ''}">${n.A.replyRate !== null ? n.A.replyRate + '%' : '—'}</td>
              <td class="${n.winner === 'B' ? 'pnl-pos' : ''}">${n.B.replyRate !== null ? n.B.replyRate + '%' : '—'}</td>
              <td>${n.winner === 'tie' ? '🤝 Gelijk' : n.winner ? `<span class="ab-niche-winner">Versie ${n.winner}</span>` : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
    ` : `<div class="card" style="padding:28px;text-align:center;color:var(--text-secondary);font-size:13px">
      <i class="ti ti-test-pipe" style="font-size:28px;margin-bottom:8px;display:block;opacity:.3"></i>
      Nog geen A/B data beschikbaar. Stuur emails goed via de inbox om A/B test data te verzamelen.
    </div>`}

    <hr style="margin:28px 0;border:none;border-top:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary)"><i class="ti ti-trending-up" style="margin-right:6px;color:var(--accent)"></i>Winst & Verlies</h2>
      <span class="text-muted" style="font-size:12px">Laatste 12 maanden · AI-kosten in EUR (koers 0.92)</span>
    </div>
    <div class="stats-grid" style="margin-bottom:20px;grid-template-columns:repeat(4,1fr)">
      ${[
        { label: 'Omzet (betaald + klanten)',  value: '€' + Math.round(pnlData.totalRevenue), icon: 'ti-cash',         color: '#16a34a' },
        { label: 'Kosten (AI + hosting)',     value: '€' + Math.round(pnlData.totalCosts),   icon: 'ti-brain',        color: '#dc2626' },
        { label: 'Netto Winst',      value: '€' + Math.round(pnlData.totalProfit),  icon: 'ti-trending-up',  color: pnlData.totalProfit >= 0 ? '#16a34a' : '#dc2626' },
        { label: 'Marge',            value: pnlData.margin + '%',                   icon: 'ti-percentage',   color: pnlData.margin >= 0 ? '#7c3aed' : '#dc2626' }
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
    <div class="card chart-card" style="margin-bottom:16px">
      <h3 class="chart-title">Maandelijkse omzet vs kosten</h3>
      <canvas id="chartPnL" height="180"></canvas>
    </div>
    <div class="card" style="overflow:hidden;margin-bottom:0">
      <table class="pnl-table">
        <thead><tr><th>Maand</th><th>Omzet</th><th>AI Kosten</th><th>Winst</th><th>Marge</th></tr></thead>
        <tbody>
          ${pnlData.months.filter(m => m.revenue > 0 || m.costs > 0).map(m => {
            const mg = m.revenue > 0 ? Math.round(m.profit / m.revenue * 100) : (m.costs > 0 ? -100 : 0);
            const nl = new Date(m.month + '-02').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' });
            return `<tr class="pnl-row">
              <td style="font-weight:600">${nl}</td>
              <td class="pnl-pos">€ ${Math.round(m.revenue).toLocaleString('nl-NL')}</td>
              <td class="pnl-neg">€ ${Math.round(m.costs).toLocaleString('nl-NL')}</td>
              <td class="${m.profit >= 0 ? 'pnl-pos' : 'pnl-neg'}">€ ${Math.round(m.profit).toLocaleString('nl-NL')}</td>
              <td style="color:${mg >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:600">${mg}%</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center;font-size:13px">Nog geen betaalde facturen geregistreerd.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Case study info card -->
    ${(() => {
      const clients = (state.leads || []).filter(l => l.status === 'client');
      const caseStudyCount = clients.filter(l => l.caseStudy).length;
      const earliest = clients.filter(l => !l.caseStudy && l.projectStartedAt)
        .map(l => { const daysIn = Math.floor((Date.now() - new Date(l.projectStartedAt)) / 86400000); return 30 - daysIn; })
        .filter(d => d > 0).sort((a,b) => a-b)[0];
      return `
        <div class="card" style="margin-top:24px">
          <div class="card-header">
            <h3 class="card-title"><i class="ti ti-file-text" style="color:var(--accent);margin-right:6px"></i>Case studies</h3>
            <span class="badge badge-${caseStudyCount > 0 ? 'green' : 'gray'}">${caseStudyCount} gegenereerd</span>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px">
            Case studies worden automatisch gegenereerd 30 dagen nadat een klant actief is. Het systeem maakt een geanonimiseerd succesverhaal op basis van de dienst en resultaten. Dit verschijnt automatisch op je publieke website onder <em>Resultaten</em> als social proof.
          </div>
          <div style="font-size:12px;color:var(--text-muted)">
            <i class="ti ti-clock"></i>
            ${caseStudyCount === 0
              ? earliest !== undefined
                ? `Eerste case study mogelijk over ${earliest} dag${earliest !== 1 ? 'en' : ''}.`
                : 'Nog geen klanten actief lang genoeg voor een case study.'
              : `${caseStudyCount} case stud${caseStudyCount !== 1 ? 'ies' : 'y'} beschikbaar — zichtbaar op de publieke website wanneer gepubliceerd.`}
          </div>
        </div>`;
    })()}
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

  // A/B chart (reply rate per niche)
  const ctxAB = document.getElementById('chartAB')?.getContext('2d');
  if (ctxAB && abData && abData.niches.length) {
    const niches = abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).slice(0, 8);
    _statsCharts.push(new Chart(ctxAB, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.niche),
        datasets: [
          { label: 'Versie A reply%', data: niches.map(n => n.A.replyRate ?? 0), backgroundColor: BLUE + 'cc', borderRadius: 4 },
          { label: 'Versie B reply%', data: niches.map(n => n.B.replyRate ?? 0), backgroundColor: PURPLE + 'cc', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } }
      }
    }));
  }

  // P&L chart
  const ctxPnL = document.getElementById('chartPnL')?.getContext('2d');
  if (ctxPnL && pnlData.months.length) {
    const labels = pnlData.months.map(m => new Date(m.month + '-02').toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }));
    _statsCharts.push(new Chart(ctxPnL, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Omzet',    data: pnlData.months.map(m => m.revenue), backgroundColor: GREEN + 'cc', borderRadius: 4 },
          { label: 'AI Kosten',data: pnlData.months.map(m => m.costs),   backgroundColor: RED   + 'cc', borderRadius: 4 },
          { label: 'Winst',    data: pnlData.months.map(m => m.profit),  backgroundColor: BLUE  + 'cc', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '€' + v } } }
      }
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
        <div class="chat-sidebar-section-label">Kanalen</div>
        <div id="chatChannelList"></div>
        <div class="chat-sidebar-section-label" style="margin-top:12px">Directe berichten</div>
        <div id="chatDmList"></div>
      </div>
      <div class="chat-main" id="chatMain">
        <div class="chat-empty-state">
          <i class="ti ti-message-circle" style="font-size:40px;color:var(--border)"></i>
          <p class="text-secondary" style="margin-top:8px">Selecteer een kanaal of teamlid</p>
        </div>
      </div>
    </div>
  `;

  const [channels, dmUsers] = await Promise.all([
    apiJSON('/api/chat/channels'),
    apiJSON('/api/chat/users')
  ]);
  if (!channels) return;
  state._chatChannels = channels;
  state._chatDmUsers = dmUsers || [];
  state._activeChannelId = null;
  state._activeDmUserId = null;

  renderChatChannelList(channels);
  renderChatDmList(dmUsers || []);

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

function renderChatDmList(users) {
  const el = document.getElementById('chatDmList');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = `<div style="padding:6px 12px;font-size:12px;color:var(--text-muted)">Geen andere teamleden</div>`;
    return;
  }
  el.innerHTML = users.map(u => `
    <button class="chat-channel-btn${state._activeDmUserId === u.id ? ' active' : ''}" onclick="openDmChannel('${u.id}')">
      <span class="chat-dm-avatar" style="background:${u.role === 'admin' ? '#111' : '#2563eb'}">${(u.name || u.username)[0].toUpperCase()}</span>
      <span class="chat-channel-name">${esc(u.name || u.username)}</span>
      <span class="chat-dm-role">${u.role === 'admin' ? 'Admin' : 'Medewerker'}</span>
    </button>
  `).join('');
}

async function openDmChannel(partnerId) {
  if (state._chatPollTimer) { clearInterval(state._chatPollTimer); state._chatPollTimer = null; }
  state._activeDmUserId = partnerId;
  state._activeChannelId = null;
  const partner = (state._chatDmUsers || []).find(u => u.id === partnerId);

  const main = document.getElementById('chatMain');
  if (!main) return;

  main.innerHTML = `
    <div class="chat-header">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="chat-dm-avatar" style="background:${partner?.role === 'admin' ? '#111' : '#2563eb'};font-size:14px">${(partner?.name || partner?.username || '?')[0].toUpperCase()}</span>
        <div>
          <span class="chat-header-name">${esc(partner?.name || partner?.username || 'Onbekend')}</span>
          <span class="chat-header-desc">${partner?.role === 'admin' ? 'Admin' : 'Medewerker'}</span>
        </div>
      </div>
    </div>
    <div class="chat-messages" id="chatMessages"><div class="loading-state"><div class="spinner"></div></div></div>
    <form class="chat-input-row" id="chatForm" onsubmit="sendDmMessage(event,'${partnerId}')">
      <input type="text" class="chat-input" id="chatInput" placeholder="Bericht naar ${esc(partner?.name || '')}..." autocomplete="off" maxlength="2000">
      <button type="submit" class="btn btn-primary btn-sm"><i class="ti ti-send"></i></button>
    </form>
  `;

  document.getElementById('chatInput')?.focus();
  renderChatChannelList(state._chatChannels || []);
  renderChatDmList(state._chatDmUsers || []);

  await loadDmMessages(partnerId, true);
  state._chatLastSince = new Date().toISOString();
  state._chatPollTimer = setInterval(() => pollDmMessages(partnerId), 3000);
}

async function loadDmMessages(partnerId, scrollBottom = false) {
  const msgs = await apiJSON(`/api/chat/dm/${partnerId}/messages?limit=100`);
  if (!msgs) return;
  renderDmMessages(msgs, partnerId);
  if (scrollBottom) {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }
}

async function pollDmMessages(partnerId) {
  if (state._activeDmUserId !== partnerId) return;
  const since = state._chatLastSince || '';
  const msgs = await apiJSON(`/api/chat/dm/${partnerId}/messages?since=${encodeURIComponent(since)}&limit=50`);
  if (!msgs || msgs.length === 0) return;
  state._chatLastSince = msgs[msgs.length - 1].createdAt;
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  msgs.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildDmMessageHTML(msg);
    el.appendChild(div);
  });
  if (atBottom) el.scrollTop = el.scrollHeight;
}

function renderDmMessages(msgs, partnerId) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div class="chat-messages-empty">Nog geen berichten. Stuur het eerste bericht!</div>';
    return;
  }
  let html = '';
  let lastDate = '';
  for (const msg of msgs) {
    const d = new Date(msg.createdAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== lastDate) { html += `<div class="chat-date-divider"><span>${d}</span></div>`; lastDate = d; }
    html += `<div class="chat-message" data-id="${msg.id}">${buildDmMessageHTML(msg)}</div>`;
  }
  el.innerHTML = html;
}

function buildDmMessageHTML(msg) {
  const myId = (() => { try { return JSON.parse(atob(getToken().split('.')[1])).id; } catch { return null; } })();
  const isOwn = msg.fromId === myId;
  const canDelete = isOwn || isAdmin();
  return `
    <div class="chat-msg-avatar" style="background:${msg.fromRole === 'admin' ? '#111' : '#2563eb'}">${(msg.fromName || '?')[0].toUpperCase()}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${esc(msg.fromName || '')}${isOwn ? ' <span style="font-size:10px;color:var(--text-muted)">(jij)</span>' : ''}</span>
        <span class="chat-msg-time">${new Date(msg.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
        ${canDelete ? `<button class="chat-msg-delete" onclick="deleteDmMessage('${msg.id}')" title="Verwijder"><i class="ti ti-trash"></i></button>` : ''}
      </div>
      <div class="chat-msg-text">${esc(msg.text).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

async function sendDmMessage(e, partnerId) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const res = await api(`/api/chat/dm/${partnerId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  if (!res?.ok) { toast('Verzenden mislukt.', 'error'); input.value = text; return; }
  const msg = await res.json();
  const el = document.getElementById('chatMessages');
  if (el) {
    const emptyMsg = el.querySelector('.chat-messages-empty');
    if (emptyMsg) emptyMsg.remove();
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildDmMessageHTML(msg);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  state._chatLastSince = msg.createdAt;
}

async function deleteDmMessage(id) {
  const res = await api(`/api/chat/dm/messages/${id}`, { method: 'DELETE' });
  if (res?.ok) document.querySelector(`.chat-message[data-id="${id}"]`)?.remove();
  else toast('Verwijderen mislukt.', 'error');
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

function copyExtensionUrl() {
  const val = document.getElementById('extensionServerUrl')?.textContent;
  if (val) navigator.clipboard.writeText(val).then(() => toast('Server URL gekopieerd.', 'success'));
}

// ─── Per-dienst tester ────────────────────────────────────────────────────────

let _lastServiceTestResult = null;

function openServiceTestModal(serviceName) {
  if (!serviceName || !serviceName.trim()) {
    toast('Vul eerst een dienst naam in.', 'warning');
    return;
  }
  openModal(`
    <div style="padding:4px 0;min-width:320px">
      <h3 style="margin:0 0 4px;font-size:16px">Test: ${esc(serviceName)}</h3>
      <p style="color:var(--text-secondary);font-size:12px;margin:0 0 16px">Vul testgegevens in en klik Start test om een preview te genereren.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:4px">Bedrijfsnaam</label>
          <input id="stBedrijf" class="stg-input" style="width:100%" placeholder="Test Bedrijf BV" value="Test Bedrijf BV">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:4px">Locatie</label>
          <input id="stLocatie" class="stg-input" style="width:100%" placeholder="Amsterdam" value="Amsterdam">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:4px">Niche</label>
          <input id="stNiche" class="stg-input" style="width:100%" placeholder="beauty / horeca / retail…" value="beauty">
        </div>
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.04em;display:block;margin-bottom:4px">Wensen</label>
          <input id="stWensen" class="stg-input" style="width:100%" placeholder="Professionele online aanwezigheid">
        </div>
      </div>
      <button class="btn btn-primary" style="width:100%" data-svc="${esc(serviceName)}" onclick="runServiceTest(this.dataset.svc)">
        <i class="ti ti-test-pipe"></i> Start test
      </button>
      <div id="stResult" style="margin-top:14px"></div>
    </div>
  `);
}

async function runServiceTest(serviceName) {
  const bedrijf = document.getElementById('stBedrijf')?.value.trim() || 'Test Bedrijf BV';
  const locatie = document.getElementById('stLocatie')?.value.trim() || 'Amsterdam';
  const niche   = document.getElementById('stNiche')?.value.trim() || 'bedrijf';
  const wensen  = document.getElementById('stWensen')?.value.trim() || '';
  const resultEl = document.getElementById('stResult');
  if (!resultEl) return;

  // Disable the Start test button immediately
  const startBtn = resultEl.closest('div[style]')?.querySelector('button.btn-primary');
  if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '0.6'; startBtn.style.cursor = 'not-allowed'; }

  resultEl.innerHTML = `
    <div style="padding:14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
      <div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:8px">⚡ Bezig met genereren…</div>
      <div style="width:100%;height:6px;background:#e5e7eb;border-radius:3px;overflow:hidden;margin-bottom:8px">
        <div style="height:100%;background:#6366f1;width:40%;animation:stSlide 1.5s infinite;border-radius:3px"></div>
      </div>
      <div style="font-size:12px;color:var(--text-secondary)">Claude is aan het werk — dit duurt ~1-2 minuten</div>
    </div>
    <style>@keyframes stSlide{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}</style>`;

  try {
    const res = await fetch('/api/test-service', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
      body: JSON.stringify({ serviceName, companyName: bedrijf, location: locatie, niche, wishes: wensen })
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    _lastServiceTestResult = { serviceName, bedrijf, locatie, niche, wensen, ...data };

    const typeLabel = data.type === 'HTML_BUILD' ? '💻 HTML pagina' : data.type === 'STRATEGY_DOCUMENT' ? '📊 Strategie document' : '📄 Tekst document';
    const chars     = data.htmlLength || data.contentLength || 0;
    const bodyChars = data.bodyLength ?? chars;
    const ok        = data.success;
    const dateStr   = data.testedAt ? new Date(data.testedAt).toLocaleString('nl-NL') : '—';

    const preview = data.type === 'HTML_BUILD' && data.html
      ? `<iframe srcdoc="${esc(data.html)}" style="width:100%;height:340px;border:1px solid var(--border);border-radius:8px;margin-top:10px" sandbox="allow-scripts allow-same-origin"></iframe>`
      : data.content
        ? `<pre style="white-space:pre-wrap;font-size:12px;color:var(--text-primary);background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:12px;max-height:300px;overflow-y:auto;margin-top:10px">${esc(data.content.slice(0, 3000))}${data.content.length > 3000 ? '\n\n…(ingekort)' : ''}</pre>`
        : '';

    resultEl.innerHTML = `
      ${ok
        ? `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.25);border-radius:8px;font-size:13px;font-weight:600;color:var(--success)">✅ Test geslaagd</div>`
        : `<div style="display:flex;align-items:center;gap:8px;padding:10px 14px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;font-weight:600;color:var(--danger)">❌ Test mislukt${data.error ? ' — ' + esc(data.error) : ''}</div>`
      }
      ${preview}
      <div style="margin-top:12px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;font-size:12px">
        <div style="font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">TESTRAPPORT</div>
        <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;color:var(--text-secondary)">
          <span style="color:var(--text-muted)">Datum</span><span style="color:var(--text-primary)">${dateStr}</span>
          <span style="color:var(--text-muted)">Type</span><span style="color:var(--text-primary)">${typeLabel}</span>
          <span style="color:var(--text-muted)">Totaal tekens</span><span style="color:var(--text-primary)">${chars.toLocaleString('nl-NL')}</span>
          ${data.type === 'HTML_BUILD' ? `<span style="color:var(--text-muted)">Body tekens</span><span style="color:var(--text-primary)">${bodyChars.toLocaleString('nl-NL')}</span>` : ''}
          <span style="color:var(--text-muted)">Kwaliteit</span><span style="color:var(--text-primary)">${bodyChars >= 2000 ? '⭐⭐⭐ Uitstekend' : bodyChars >= 800 ? '⭐⭐ Goed' : bodyChars >= 200 ? '⭐ Voldoende' : '✗ Onvoldoende'}</span>
          <span style="color:var(--text-muted)">Bedrijf</span><span style="color:var(--text-primary)">${esc(bedrijf)} · ${esc(locatie)}</span>
          <span style="color:var(--text-muted)">Niche</span><span style="color:var(--text-primary)">${esc(niche)}</span>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn btn-ghost btn-sm" onclick="closeModal()">Sluit</button>
        <button class="btn btn-ghost btn-sm" onclick="_saveServiceTestReport()"><i class="ti ti-download"></i> Sla rapport op</button>
      </div>
    `;
  } catch (err) {
    resultEl.innerHTML = `<div style="padding:10px 14px;background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2);border-radius:8px;font-size:13px;color:var(--danger)">❌ ${esc(err.message)}</div>`;
  }
}

function _saveServiceTestReport() {
  if (!_lastServiceTestResult) return;
  const blob = new Blob([JSON.stringify(_lastServiceTestResult, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `test-${(_lastServiceTestResult.serviceName || 'dienst').replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Zapier & Webhooks ────────────────────────────────────────────────────────

function copyZapierUrl() {
  const val = document.getElementById('zapierTriggerUrl')?.textContent;
  if (val) navigator.clipboard.writeText(val).then(() => toast('Zapier URL gekopieerd.', 'success'));
}

function updateSidebarLogo(logoUrl) {
  const logoIcon = document.querySelector('.logo-icon');
  if (!logoIcon) return;
  if (logoUrl) {
    logoIcon.innerHTML = `<img src="${logoUrl}" style="width:26px;height:26px;object-fit:contain;border-radius:4px;display:block">`;
  } else {
    logoIcon.innerHTML = '<i class="ti ti-bolt"></i>';
  }
}

function previewLogo(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (file.size > 512 * 1024) { toast('Logo moet kleiner zijn dan 500KB', 'error'); input.value = ''; return; }
  const reader = new FileReader();
  reader.onload = e => {
    window._pendingLogo = e.target.result;
    const preview = document.getElementById('logoPreview');
    if (preview) preview.innerHTML = `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`;
  };
  reader.readAsDataURL(file);
}

function removeLogo() {
  window._pendingLogo = '';
  const preview = document.getElementById('logoPreview');
  if (preview) preview.innerHTML = '<i class="ti ti-bolt" style="font-size:22px;color:var(--accent)"></i>';
}

function copyZapierToken() {
  const val = document.getElementById('zapierTokenDisplay')?.textContent;
  if (val) navigator.clipboard.writeText(val).then(() => toast('Token gekopieerd.', 'success'));
}

const WEBHOOK_EVENTS = [
  { value: 'lead.approved',   label: 'Lead goedgekeurd & verstuurd' },
  { value: 'lead.replied',    label: 'Reply ontvangen' },
  { value: 'run.complete',    label: 'Dagelijkse run klaar' },
  { value: 'intake.submitted', label: 'Intake ingevuld' },
];

async function loadWebhooksList() {
  const el = document.getElementById('webhooksList');
  if (!el) return;
  const hooks = await apiJSON('/api/webhooks') || [];
  if (!hooks.length) {
    el.innerHTML = '<p class="settings-note">Nog geen webhooks geconfigureerd.</p>';
    return;
  }
  el.innerHTML = hooks.map(h => {
    const status = h.lastStatus === 'ok' ? 'success' : h.lastStatus ? 'error' : 'idle';
    const statusLabel = h.lastStatus === 'ok' ? 'OK' : h.lastStatus || 'Niet getest';
    const statusColor = status === 'success' ? 'var(--success)' : status === 'error' ? 'var(--danger)' : 'var(--text-secondary)';
    const eventLabels = (h.events || []).map(e => WEBHOOK_EVENTS.find(ev => ev.value === e)?.label || e).join(', ');
    return `<div class="webhook-card">
      <div class="webhook-card-header">
        <div>
          <div class="webhook-card-label">${esc(h.label || h.url)}</div>
          <div class="webhook-card-url">${esc(h.url)}</div>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <span style="font-size:11px;color:${statusColor};font-weight:600">${statusLabel}</span>
          <button class="btn btn-ghost btn-sm" onclick="testWebhook('${h.id}')"><i class="ti ti-send"></i> Test</button>
          <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="deleteWebhook('${h.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </div>
      <div class="webhook-card-events">${esc(eventLabels)}</div>
      ${h.lastTriggeredAt ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:4px">Laatste trigger: ${new Date(h.lastTriggeredAt).toLocaleString('nl-NL')}</div>` : ''}
    </div>`;
  }).join('');
}

function openWebhookModal() {
  const evChecks = WEBHOOK_EVENTS.map(e =>
    `<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;margin-bottom:6px">
      <input type="checkbox" name="whEvent" value="${e.value}"> ${e.label}
    </label>`).join('');
  openModal(`<div class="modal-header"><h3 class="modal-title">Webhook toevoegen</h3></div>
    <div class="modal-body">
      <div class="form-group"><label>Webhook URL</label><input type="url" id="whUrl" placeholder="https://hooks.zapier.com/hooks/catch/..."></div>
      <div class="form-group"><label>Label (optioneel)</label><input type="text" id="whLabel" placeholder="Slack notificatie"></div>
      <div class="form-group"><label>Events</label>${evChecks}</div>
    </div>
    <div class="modal-footer"><button class="btn btn-ghost" onclick="closeModal()">Annuleren</button><button class="btn btn-primary" onclick="saveWebhook()">Opslaan</button></div>`);
}

async function saveWebhook() {
  const url    = document.getElementById('whUrl')?.value?.trim();
  const label  = document.getElementById('whLabel')?.value?.trim() || '';
  const events = [...document.querySelectorAll('input[name="whEvent"]:checked')].map(el => el.value);
  if (!url) return toast('Vul een webhook URL in.', 'error');
  if (!events.length) return toast('Selecteer minimaal één event.', 'error');
  const res = await api('/api/webhooks', { method: 'POST', body: JSON.stringify({ url, label, events }) });
  if (res?.ok) { closeModal(); toast('Webhook toegevoegd.', 'success'); loadWebhooksList(); }
  else toast('Fout bij opslaan.', 'error');
}

async function testWebhook(id) {
  const res  = await api(`/api/webhooks/${id}/test`, { method: 'POST' });
  const data = res?.ok ? await res.json().catch(() => ({})) : {};
  if (res?.ok && data.ok) toast('Testbericht verstuurd.', 'success');
  else toast(`Fout: ${data.error || res?.status}`, 'error');
  loadWebhooksList();
}

async function deleteWebhook(id) {
  if (!confirm('Webhook verwijderen?')) return;
  await api(`/api/webhooks/${id}`, { method: 'DELETE' });
  toast('Webhook verwijderd.', 'success');
  loadWebhooksList();
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
  // Redirect legacy tab names
  if (id === 'niches') id = 'automation';
  document.querySelectorAll('.settings-tab-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.settings-nav-item[data-tab]').forEach(el => el.classList.remove('active'));
  document.getElementById('stab-' + id)?.classList.add('active');
  document.querySelector(`.settings-nav-item[data-tab="${id}"]`)?.classList.add('active');
  localStorage.setItem('settingsTab', id);
  // Load AI rate status when automation or api tab opens
  if (id === 'automation' || id === 'api') loadAiRateStatus?.();
}

// ─── Contacts view ────────────────────────────────────────────────────────────
async function renderContacts() {
  document.getElementById('appView').innerHTML = `<div class="loading-spinner"></div>`;
  const contacts = await apiJSON('/api/contacts');
  if (!contacts) return;

  state._contactsFilter = state._contactsFilter || 'all';

  const FILTERS = [
    { key: 'all',        label: 'Alles' },
    { key: 'new',        label: 'Nieuw' },
    { key: 'read',       label: 'Gelezen' },
    { key: 'contacted',  label: 'Gecontacteerd' },
    { key: 'converted',  label: 'Geconverteerd' },
  ];

  const STATUS_LABELS = { new: 'Nieuw', read: 'Gelezen', contacted: 'Gecontacteerd', converted: 'Geconverteerd' };
  const STATUS_COLORS = { new: 'var(--accent)', read: 'var(--text-muted)', contacted: '#f59e0b', converted: '#10b981' };

  const filtered = state._contactsFilter === 'all'
    ? contacts
    : contacts.filter(c => c.status === state._contactsFilter);

  const filterChips = FILTERS.map(f => {
    const count = f.key === 'all' ? contacts.length : contacts.filter(c => c.status === f.key).length;
    return `<button class="filter-chip${state._contactsFilter === f.key ? ' active' : ''}" onclick="window._setContactsFilter('${f.key}')">${f.label} <span class="filter-chip-count">${count}</span></button>`;
  }).join('');

  const cards = filtered.length === 0
    ? `<div class="empty-card"><i class="ti ti-address-book" style="font-size:2.5rem;color:var(--text-muted)"></i><h3>Geen contacten</h3><p>Nog geen aanvragen via het contactformulier.</p></div>`
    : filtered.map(c => {
        const statusColor = STATUS_COLORS[c.status] || 'var(--text-muted)';
        const statusLabel = STATUS_LABELS[c.status] || c.status;
        const date = new Date(c.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
        return `
          <div class="contact-card" id="cc-${c.id}">
            <div class="contact-card-header">
              <div class="contact-card-info">
                <div class="contact-card-name">${c.name}${c.company ? ` <span class="contact-card-company">· ${c.company}</span>` : ''}</div>
                <div class="contact-card-meta">
                  ${c.email ? `<a href="mailto:${c.email}" class="contact-meta-link"><i class="ti ti-mail"></i> ${c.email}</a>` : ''}
                  ${c.phone ? `<a href="tel:${c.phone}" class="contact-meta-link"><i class="ti ti-phone"></i> ${c.phone}</a>` : ''}
                  ${c.service ? `<span class="niche-badge">${c.service}</span>` : ''}
                </div>
              </div>
              <div class="contact-card-right">
                <span class="contact-status-badge" style="background:${statusColor}20;color:${statusColor}">${statusLabel}</span>
                <span class="contact-card-date">${date}</span>
              </div>
            </div>
            ${c.message ? `<div class="contact-card-message">${c.message}</div>` : ''}
            <div class="contact-card-actions">
              ${c.status === 'new' ? `<button class="btn btn-sm btn-ghost" onclick="window._contactAction('${c.id}','read')"><i class="ti ti-check"></i> Gelezen</button>` : ''}
              ${c.status !== 'contacted' && c.status !== 'converted' ? `<button class="btn btn-sm btn-ghost" onclick="window._contactAction('${c.id}','contacted')"><i class="ti ti-send"></i> Gecontacteerd</button>` : ''}
              ${c.status !== 'converted' ? `<button class="btn btn-sm btn-primary" onclick="window._contactToLead('${c.id}')"><i class="ti ti-user-plus"></i> Lead aanmaken</button>` : `<span class="contact-converted-note"><i class="ti ti-check"></i> Geconverteerd naar lead</span>`}
              <button class="btn btn-sm btn-danger-ghost" onclick="window._contactDelete('${c.id}')"><i class="ti ti-trash"></i></button>
            </div>
          </div>`;
      }).join('');

  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Marketing</div>
        <h1 class="page-title">Contacten</h1>
      </div>
    </div>
    <div class="filter-bar" style="margin-bottom:20px">${filterChips}</div>
    <div id="contactsList">${cards}</div>`;

  fetchContactsBadge();

  window._setContactsFilter = (f) => {
    state._contactsFilter = f;
    renderContacts();
  };

  window._contactAction = async (id, status) => {
    await api(`/api/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    renderContacts();
  };

  window._contactToLead = async (id) => {
    const btn = document.querySelector(`#cc-${id} .btn-primary`);
    if (btn) { btn.disabled = true; btn.textContent = 'Aanmaken...'; }
    const res = await api(`/api/contacts/${id}/to-lead`, { method: 'POST', body: JSON.stringify({}) });
    if (!res || !res.ok) { toast('Fout bij aanmaken lead'); return; }
    const data = await res.json();
    toast('Lead aangemaakt');
    // Refresh leads in state
    const leadsData = await apiJSON('/api/leads');
    if (leadsData) state.leads = leadsData;
    renderContacts();
  };

  window._contactDelete = async (id) => {
    if (!confirm('Contact verwijderen?')) return;
    await api(`/api/contacts/${id}`, { method: 'DELETE' });
    renderContacts();
  };
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
      <button class="settings-nav-item active" data-tab="account"    onclick="switchSettingsTab('account')">   <i class="ti ti-user"></i>         Account</button>
      <button class="settings-nav-item"         data-tab="email"     onclick="switchSettingsTab('email')">     <i class="ti ti-mail"></i>          Email &amp; versturen</button>
      <button class="settings-nav-item"         data-tab="services"  onclick="switchSettingsTab('services')">  <i class="ti ti-briefcase"></i>     Diensten</button>
      <button class="settings-nav-item"         data-tab="automation" onclick="switchSettingsTab('automation')"><i class="ti ti-settings-automation"></i> Automatisering</button>
      <button class="settings-nav-item"         data-tab="payments"  onclick="switchSettingsTab('payments')">  <i class="ti ti-credit-card"></i>   Betalingen</button>
      <button class="settings-nav-item"         data-tab="blacklist" onclick="switchSettingsTab('blacklist')"> <i class="ti ti-ban"></i>           Blacklist</button>
      <button class="settings-nav-item"         data-tab="api"       onclick="switchSettingsTab('api')">       <i class="ti ti-api"></i>           API &amp; integraties</button>
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="team" onclick="switchSettingsTab('team')"><i class="ti ti-users"></i> Team</button>` : ''}
      <div class="settings-nav-spacer"></div>
      <button class="settings-nav-item nav-danger" data-tab="danger" onclick="switchSettingsTab('danger')"><i class="ti ti-alert-triangle"></i> Gevaarlijke zone</button>
    </nav>
    <div class="settings-content">

      <!-- ── Account ── -->
      <div class="settings-tab-pane active" id="stab-account">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Profiel</div>
            <div class="stg-sub">Je naam en agencynaam worden gebruikt in alle uitgaande emails</div>
          </div>
          <!-- Logo upload -->
          <div class="logo-upload-row" style="margin-bottom:18px">
            <div class="logo-upload-preview" id="logoPreview">
              ${s.agencyLogo
                ? `<img src="${s.agencyLogo}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`
                : `<i class="ti ti-bolt" style="font-size:22px;color:var(--accent)"></i>`}
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;gap:6px;align-items:center">
                <label class="btn btn-ghost btn-sm" for="logoFileInput" style="cursor:pointer">
                  <i class="ti ti-upload"></i> Logo uploaden
                </label>
                <input type="file" id="logoFileInput" accept="image/png,image/jpeg,image/gif,image/svg+xml,image/webp" style="display:none" onchange="previewLogo(this)">
                ${s.agencyLogo ? `<button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="removeLogo()" title="Logo verwijderen"><i class="ti ti-trash"></i></button>` : ''}
              </div>
              <p style="font-size:11px;color:var(--text-muted);margin:0">PNG, JPG of SVG · max 500KB · zichtbaar in de sidebar</p>
            </div>
          </div>

          <div class="stg-grid-2">
            <div class="stg-field"><label class="stg-label">AGENCY NAAM</label><input type="text" class="stg-input" id="agencyName" value="${esc(s.agencyName)}"></div>
            <div class="stg-field"><label class="stg-label">MIJN NAAM</label><input type="text" class="stg-input" id="myName" value="${esc(s.myName)}"></div>
            <div class="stg-field"><label class="stg-label">MIJN TITEL</label><input type="text" class="stg-input" id="myTitle" value="${esc(s.myTitle)}"></div>
            <div class="stg-field"><label class="stg-label">GEBRUIKERSNAAM</label><input type="text" class="stg-input" id="settingsUsername" value="${esc(s.username)}"></div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Wachtwoord wijzigen</div>
            <div class="stg-sub">Laat leeg als je het wachtwoord niet wilt wijzigen</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field"><label class="stg-label">HUIDIG WACHTWOORD</label><input type="password" class="stg-input" id="currentPassword" placeholder="••••••••"></div>
            <div class="stg-field"><label class="stg-label">NIEUW WACHTWOORD</label><input type="password" class="stg-input" id="newPassword" placeholder="••••••••"></div>
          </div>
          <button class="btn btn-primary stg-save-btn" id="saveAccountBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-building" style="margin-right:6px;color:var(--text-secondary)"></i>Agency profielen</div>
            <div class="stg-sub">Wissel snel van identiteit voor multi-agency gebruik</div>
          </div>
          ${s.activeProfileId ? `<div class="stg-status-badge stg-badge-green"><i class="ti ti-check"></i> Actief: <strong>${esc((s.agencyProfiles||[]).find(p=>p.id===s.activeProfileId)?.agencyName || '—')}</strong></div>` : ''}
          <div id="agencyProfilesList" style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px"></div>
          <button class="btn btn-ghost btn-sm" onclick="openProfileModal()"><i class="ti ti-plus"></i> Nieuw profiel</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-brand-zapier" style="color:#ff4a00;margin-right:6px"></i>Zapier inkomend token</div>
            <div class="stg-sub">Voeg toe als header <code>x-zapier-token</code> in je Zapier webhook-actie</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <code id="zapierTokenDisplay" class="stg-code-block" style="filter:blur(4px);transition:filter .2s;cursor:pointer" onclick="this.style.filter='none'" title="Klik om zichtbaar te maken">${esc(s.zapierIncomingToken || '—')}</code>
            <button class="btn btn-ghost btn-sm" onclick="copyZapierToken()"><i class="ti ti-copy"></i></button>
          </div>
        </div>
      </div>

<!-- ── Email & versturen ── -->
      <div class="settings-tab-pane" id="stab-email">

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Resend — verzenden
              ${s.resendConfigured ? `<span class="stg-status-badge stg-badge-green"><i class="ti ti-check"></i> Actief</span>` : `<span class="stg-status-badge stg-badge-amber"><i class="ti ti-alert-triangle"></i> Niet ingesteld</span>`}
            </div>
            <div class="stg-sub">Emails worden verstuurd via Resend. Gratis tot 100/dag. Account aanmaken op <a href="https://resend.com" target="_blank" class="link">resend.com</a></div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">RESEND API SLEUTEL ${s.resendConfigured ? '<span class="stg-status-badge stg-badge-green" style="font-size:10px">Ingesteld</span>' : ''}</label>
              <input type="password" class="stg-input" id="resendApiKey" placeholder="${s.resendConfigured ? '(laat leeg om ongewijzigd te laten)' : 're_...'}">
            </div>
            <div class="stg-field">
              <label class="stg-label">AFZENDER NAAM</label>
              <input type="text" class="stg-input" id="resendSenderName" value="${esc(s.agencyName || '')}" placeholder="${esc(s.agencyName || 'Agency AI')}">
            </div>
            <div class="stg-field stg-field-full">
              <label class="stg-label">AFZENDER E-MAILADRES <span class="stg-label-note">— moet geverifieerd zijn in Resend dashboard</span></label>
              <input type="text" class="stg-input" id="resendFromAddress" value="${esc(s.resendFromAddress || '')}" placeholder="noreply@agencyai.info">
            </div>
          </div>
          <button class="btn btn-primary stg-save-btn" id="saveResendBtn"><i class="ti ti-device-floppy"></i> Opslaan &amp; testen</button>
          <div id="resendSaveResult" style="margin-top:12px;display:none"></div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Gmail IMAP — reply detectie
              ${s.gmailConfigured ? `<span class="stg-status-badge stg-badge-green"><i class="ti ti-check"></i> Ingesteld</span>` : `<span class="stg-status-badge stg-badge-amber"><i class="ti ti-alert-triangle"></i> Niet ingesteld</span>`}
            </div>
            <div class="stg-sub">Gmail wordt <strong>niet</strong> gebruikt voor verzenden — alleen voor het detecteren van antwoorden van prospects</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">GMAIL ADRES</label>
              <input type="email" class="stg-input" id="gmailAddress" value="${s.gmailAddress || ''}" placeholder="jouw@gmail.com">
            </div>
            <div class="stg-field">
              <label class="stg-label">APP-WACHTWOORD ${s.gmailPasswordSet ? '<span class="stg-status-badge stg-badge-green" style="font-size:10px">Ingesteld</span>' : ''}</label>
              <input type="password" class="stg-input" id="gmailPassword" placeholder="${s.gmailPasswordSet ? '(laat leeg om ongewijzigd te laten)' : 'xxxx xxxx xxxx xxxx'}">
            </div>
          </div>
          <details class="stg-details" style="margin-bottom:14px">
            <summary><i class="ti ti-info-circle" style="color:var(--accent)"></i> Hoe maak ik een app-wachtwoord aan?</summary>
            <div class="stg-details-body">
              <ol>
                <li>Ga naar Gmail → Tandwiel → <strong>Alle instellingen</strong> → tabblad <strong>Doorsturen en POP/IMAP</strong> → zet IMAP aan</li>
                <li>Ga naar <strong>myaccount.google.com → Beveiliging → 2-stapsverificatie → App-wachtwoorden</strong></li>
                <li>Kies <em>E-mail + Windows/Mac</em> en kopieer het 16-cijferige wachtwoord</li>
              </ol>
            </div>
          </details>
          <div class="stg-toggle-row">
            <label class="toggle-wrap">
              <input type="checkbox" id="replyDetection" ${s.replyDetection !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Reply detectie inschakelen</span>
            </label>
            <p class="toggle-hint">Controleert elke 2 uur je Gmail inbox op antwoorden van prospects</p>
          </div>
          <div class="stg-toggle-row">
            <label class="toggle-wrap">
              <input type="checkbox" id="webhookEnabled" ${s.webhookConfigured ? 'checked' : ''} onchange="document.getElementById('webhookPanel').style.display=this.checked?'block':'none'">
              <span class="toggle"></span>
              <span class="toggle-label">Real-time webhook (Google Pub/Sub)</span>
            </label>
            <p class="toggle-hint">Detecteert replies direct — sneller dan polling elke 2 uur</p>
          </div>
          <div id="webhookPanel" class="settings-panel" style="display:${s.webhookConfigured ? 'block' : 'none'};margin:12px 0">
            <div class="stg-field" style="margin-bottom:10px">
              <label class="stg-label">WEBHOOK TOKEN</label>
              <div style="display:flex;gap:8px">
                <input type="text" class="stg-input" id="webhookToken" value="${esc(s.webhookToken || '')}" placeholder="Genereer een token..." style="flex:1;font-family:monospace" oninput="updateWebhookUrl()">
                <button class="btn btn-ghost btn-sm" onclick="generateWebhookToken()"><i class="ti ti-refresh"></i> Genereer</button>
              </div>
            </div>
            <div class="stg-field" style="margin-bottom:10px">
              <label class="stg-label">WEBHOOK URL</label>
              <div style="display:flex;gap:8px;align-items:center">
                <code id="webhookUrlDisplay" class="stg-code-block" style="flex:1">${s.webhookToken ? window.location.origin + '/api/gmail/webhook?token=' + s.webhookToken : 'Sla eerst een token op'}</code>
                <button class="btn btn-ghost btn-sm" onclick="copyWebhookUrl()"><i class="ti ti-copy"></i></button>
              </div>
            </div>
            <button class="btn btn-primary btn-sm" onclick="saveWebhookSettings()"><i class="ti ti-device-floppy"></i> Token opslaan</button>
            <details class="stg-details" style="margin-top:12px">
              <summary><i class="ti ti-info-circle"></i> Setup instructies — Google Cloud Pub/Sub</summary>
              <div class="stg-details-body">
                <ol>
                  <li>Ga naar <strong>console.cloud.google.com</strong> → nieuw project</li>
                  <li>Activeer <strong>Gmail API</strong> + <strong>Cloud Pub/Sub API</strong></li>
                  <li>Maak Pub/Sub topic aan + push subscription met jouw webhook URL</li>
                  <li>Geef <code>gmail-api-push@system.gserviceaccount.com</code> rol <strong>Pub/Sub Publisher</strong></li>
                  <li>Stel Gmail push in via API Explorer → <code>users.watch</code></li>
                </ol>
              </div>
            </details>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button class="btn btn-ghost btn-sm" id="saveGmailBtn"><i class="ti ti-device-floppy"></i> Gmail opslaan</button>
            <button class="btn btn-ghost btn-sm" id="testImapBtn" onclick="testImapConnection()"><i class="ti ti-plug-connected"></i> Test IMAP verbinding</button>
          </div>
          <div id="gmailTestResult" style="margin-top:10px;display:none"></div>
          <div id="imapTestResult" style="margin-top:8px;display:none"></div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Dagelijkse briefing</div>
            <div class="stg-sub">Ontvang dagelijks een overzicht met leads, reacties en pipelinewaarde</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="toggle-wrap">
                <input type="checkbox" id="dailyBriefingEnabled" ${s.dailyBriefingEnabled !== false ? 'checked' : ''}>
                <span class="toggle"></span>
                <span class="toggle-label">Briefing email inschakelen</span>
              </label>
            </div>
            <div class="stg-field">
              <label class="stg-label">VERZENDTIJD</label>
              <input type="time" class="stg-input" id="dailyBriefingTime" value="${s.dailyBriefingTime || '08:45'}" style="width:140px">
            </div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Automatische klant e-mails</div>
            <div class="stg-sub">Welke e-mails wil je automatisch versturen naar klanten?</div>
          </div>
          <div class="stg-toggle-list">
            ${[
              { key: 'welcome',        label: 'Welkomstmail bij projectstart' },
              { key: 'intakeReceived', label: 'Bevestiging intake ontvangen' },
              { key: 'deliveryReady',  label: 'Leveringen klaarstaan' },
              { key: 'weekComplete',   label: 'Week afgerond update' },
              { key: 'monthlyUpdate',  label: 'Maandelijkse update' },
              { key: 'checkIn',        label: 'Halverwege check-in' },
            ].map(opt => `
              <label class="stg-toggle-item">
                <input type="checkbox" id="ace_${opt.key}" ${(s.autoClientEmails?.[opt.key] !== false) ? 'checked' : ''}>
                <span class="toggle"></span>
                <span class="toggle-label">${opt.label}</span>
              </label>`).join('')}
          </div>
          <button class="btn btn-primary stg-save-btn" id="saveEmailAutoBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>

        <div class="stg-section" style="margin-top:16px">
          <div class="stg-section-header">
            <div class="stg-title">Automatische weekupdates</div>
            <div class="stg-sub">Elke vrijdag om 16:00 wordt een AI-gegenereerde weekupdate verstuurd naar alle actieve klanten met een e-mailadres</div>
          </div>
          <label class="toggle-wrap">
            <input type="checkbox" id="weeklyUpdatesEnabled" ${s.weeklyUpdatesEnabled ? 'checked' : ''} onchange="saveWeeklyUpdatesSetting(this.checked)">
            <span class="toggle"></span>
            <span class="toggle-label">Automatische weekupdates inschakelen (vrijdag 16:00)</span>
          </label>
        </div>
      </div>

      <!-- ── Diensten ── -->
      <div class="settings-tab-pane" id="stab-services">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Diensten die ik verkoop</div>
            <div class="stg-sub">Deze worden gebruikt in offertes, contracten en de AI-emailgeneratie</div>
          </div>
          <div id="servicesTable" class="services-scroll">
            ${(s.services || []).map((svc, i) => `
              <div class="service-row" data-idx="${i}">
                <input type="text" class="svc-name" value="${esc(svc.name)}" placeholder="Dienst naam">
                <input type="number" class="svc-price" value="${svc.price}" placeholder="Prijs" style="width:100px">
                <select class="svc-billing" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-primary)">
                  <option value="maandelijks" ${(svc.billing||'maandelijks')==='maandelijks'?'selected':''}>Maandelijks</option>
                  <option value="eenmalig" ${svc.billing==='eenmalig'?'selected':''}>Eenmalig</option>
                </select>
                <input type="text" class="svc-desc" value="${esc(svc.description)}" placeholder="Beschrijving">
                <button class="btn btn-ghost btn-sm btn-icon" title="Test deze dienst" onclick="openServiceTestModal(this.closest('.service-row').querySelector('.svc-name').value)"><i class="ti ti-test-pipe"></i></button>
                <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
              </div>`).join('')}
          </div>
          <div class="stg-btn-row">
            <button class="btn btn-ghost btn-sm" id="addServiceBtn"><i class="ti ti-plus"></i> Dienst toevoegen</button>
            <button class="btn btn-ghost btn-sm" id="loadDefaultServicesBtn"><i class="ti ti-refresh"></i> Standaard laden</button>
            <button class="btn btn-primary" id="saveServicesBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
          </div>
        </div>
      </div>

      <!-- ── Automatisering ── -->
      <div class="settings-tab-pane" id="stab-automation">

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Run instellingen</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">DAGELIJKSE RUN TIJD</label>
              <input type="time" class="stg-input" id="dailyRunTime" value="${s.dailyRunTime || '09:00'}" style="width:140px">
            </div>
            <div class="stg-field">
              <label class="stg-label">LEADS PER DAG</label>
              <div class="radio-group">
                ${[10,15,20].map(n => `<label class="radio-label"><input type="radio" name="leadsPerDay" value="${n}" ${s.leadsPerDay == n ? 'checked' : ''}> ${n}</label>`).join('')}
              </div>
            </div>
            <div class="stg-field">
              <label class="toggle-wrap">
                <input type="checkbox" id="automationPaused" ${s.automationPaused ? 'checked' : ''}>
                <span class="toggle"></span>
                <span class="toggle-label">Automatisering pauzeren</span>
              </label>
            </div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Goedkeuring</div>
          </div>
          <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:var(--accent-light);border:1px solid var(--accent);border-radius:var(--radius);color:var(--accent)">
            <i class="ti ti-shield-check" style="font-size:18px;flex-shrink:0;margin-top:1px"></i>
            <div>
              <div style="font-weight:600;font-size:14px;margin-bottom:4px">Handmatige goedkeuring ingeschakeld</div>
              <div style="font-size:13px;opacity:0.85">Alle leads gaan naar de inbox en wachten op jouw goedkeuring. Geen enkele lead of email wordt automatisch verstuurd.</div>
            </div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Niche targeting</div>
            <div class="stg-sub">Kies welke niches Agent 1 mag targeten. Alles uitgevinkt = alle niches.</div>
          </div>
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
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Doelgroep bedrijfsgrootte</div>
            <div class="stg-sub">Leads buiten de geselecteerde groottes krijgen een lagere score (−0.5)</div>
          </div>
          <div class="stg-toggle-list">
            <label class="stg-toggle-item"><input type="checkbox" id="sizeSmall"  ${(s.targetCompanySizes||['small','medium']).includes('small')  ? 'checked' : ''}><span class="toggle"></span><span class="toggle-label">Klein (1–10 medewerkers)</span></label>
            <label class="stg-toggle-item"><input type="checkbox" id="sizeMedium" ${(s.targetCompanySizes||['small','medium']).includes('medium') ? 'checked' : ''}><span class="toggle"></span><span class="toggle-label">Middel (10–50)</span></label>
            <label class="stg-toggle-item"><input type="checkbox" id="sizeLarge"  ${(s.targetCompanySizes||[]).includes('large') ? 'checked' : ''}><span class="toggle"></span><span class="toggle-label">Groot (50+)</span></label>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">AI Auto-reply</div>
            <div class="stg-sub">Wanneer een bedrijf reageert, schrijft de AI automatisch een passend antwoord</div>
          </div>
          <div class="stg-toggle-list">
            <label class="stg-toggle-item">
              <input type="checkbox" id="aiAutoReply" ${s.aiAutoReply !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">AI auto-reply inschakelen</span>
            </label>
            <label class="stg-toggle-item">
              <input type="checkbox" id="aiAutoReplySend" ${s.aiAutoReplySend ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Automatisch versturen zonder goedkeuring (score ≥ 8)</span>
            </label>
          </div>
          <p class="toggle-hint" style="color:var(--danger);margin-top:6px"><i class="ti ti-alert-triangle"></i> Gevaarlijk: slaat inbox-goedkeuring over voor leads met hoge score</p>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Rapporten &amp; backup</div>
          </div>
          <div class="stg-toggle-list" style="margin-bottom:16px">
            <label class="stg-toggle-item">
              <input type="checkbox" id="monthlyReports" ${s.monthlyReports !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Automatische maandrapporten (1e van de maand)</span>
            </label>
            <label class="stg-toggle-item">
              <input type="checkbox" id="backupEnabled" ${s.backupEnabled !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Automatische dagelijkse backup</span>
            </label>
            <label class="stg-toggle-item">
              <input type="checkbox" id="backupEmail" ${s.backupEmail !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Stuur backup als email bijlage</span>
            </label>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">BACKUP TIJD</label>
              <input type="time" class="stg-input" id="backupTime" value="${s.backupTime || '02:00'}" style="width:140px">
            </div>
            <div class="stg-field" style="display:flex;align-items:flex-end">
              <button class="btn btn-ghost btn-sm" onclick="triggerBackup()" id="backupNowBtn"><i class="ti ti-database-export"></i> Backup nu uitvoeren</button>
            </div>
          </div>
          <div id="backupList" style="margin-top:12px"></div>
        </div>
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Auto-archivering</div>
            <div class="stg-sub">Leads zonder reactie worden na X dagen automatisch gearchiveerd</div>
          </div>
          <div class="stg-grid" style="align-items:center">
            <div class="stg-field">
              <label class="stg-label">AUTO-ARCHIVERING</label>
              <label class="toggle-label">
                <input type="checkbox" id="autoArchiveEnabled" ${s.autoArchiveEnabled !== false ? 'checked' : ''}>
                <span class="toggle-track"><span class="toggle-thumb"></span></span>
                Ingeschakeld
              </label>
            </div>
            <div class="stg-field">
              <label class="stg-label">ARCHIVEER NA (DAGEN)</label>
              <input class="stg-input" type="number" id="autoArchiveDays" value="${s.autoArchiveDays || 30}" min="7" max="365" style="width:100px">
            </div>
          </div>
          <p class="stg-sub" style="margin-top:8px">Leads met status "Verstuurd" of "Dead" zonder reactie worden gearchiveerd. Ze zijn nog zichtbaar via de <strong>Archief</strong> filter op de Leads pagina en komen niet terug in toekomstige runs.</p>
          <button class="btn btn-primary stg-save-btn" id="saveAutomationBtn" style="margin-top:12px"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>
      </div>

      <!-- ── Betalingen ── -->
      <div class="settings-tab-pane" id="stab-payments">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Betaalmethoden</div>
            <div class="stg-sub">Koppel betaalmethoden om automatisch factuurlinks te genereren voor klanten</div>
          </div>
          <div style="margin-bottom:18px">
            <label class="stg-label">BETAALMETHODE</label>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
              <label class="radio-card radio-card-active">
                <input type="radio" name="preferredPayment" value="bank_transfer" checked style="display:none"><i class="ti ti-building-bank"></i> Bankoverschrijving <span class="stg-status-badge stg-badge-green">Actief</span>
              </label>
              <div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);opacity:.5;font-size:13px;font-weight:600;color:var(--text-secondary);pointer-events:none">
                <i class="ti ti-brand-stripe"></i> Stripe <span style="font-size:11px;background:var(--surface-2);padding:2px 6px;border-radius:4px;margin-left:2px">Binnenkort</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);opacity:.5;font-size:13px;font-weight:600;color:var(--text-secondary);pointer-events:none">
                <i class="ti ti-credit-card"></i> Mollie <span style="font-size:11px;background:var(--surface-2);padding:2px 6px;border-radius:4px;margin-left:2px">Binnenkort</span>
              </div>
            </div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">IBAN NUMMER</label>
              <input type="text" class="stg-input" id="bankTransferIban" value="${esc(s.bankTransferIban || '')}" placeholder="NL00BANK0000000000">
            </div>
            <div class="stg-field">
              <label class="stg-label">TENAAMSTELLING</label>
              <input type="text" class="stg-input" id="bankTransferName" value="${esc(s.bankTransferName || '')}" placeholder="${esc(s.agencyName || 'Agency AI')}">
            </div>
            <div class="stg-field">
              <label class="stg-label">BIC / SWIFT (optioneel)</label>
              <input type="text" class="stg-input" id="bankTransferBic" value="${esc(s.bankTransferBic || '')}" placeholder="INGBNL2A">
            </div>
            <div class="stg-field">
              <label class="stg-label">BETALINGSTERMIJN (DAGEN)</label>
              <input type="number" class="stg-input" id="paymentTermDays" value="${s.paymentTermDays || 14}" min="1" max="90" placeholder="14">
            </div>
          </div>

          <button class="btn btn-primary stg-save-btn" id="saveStripeBtn"><i class="ti ti-device-floppy"></i> Betaalinstellingen opslaan</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">BTW instellingen</div>
          </div>
          <div style="margin-bottom:12px">
            <label class="toggle-wrap">
              <input type="checkbox" id="btwEnabled" ${s.btwEnabled ? 'checked' : ''} onchange="document.getElementById('btwSettingsGrid').style.display=this.checked?'':'none'">
              <span class="toggle"></span>
              <span class="toggle-label">BTW berekening inschakelen op facturen</span>
            </label>
          </div>
          <div class="stg-grid-2" id="btwSettingsGrid" style="${s.btwEnabled ? '' : 'display:none'}">
            <div class="stg-field">
              <label class="stg-label">BTW TARIEF</label>
              <select class="stg-input" id="btwRate">
                <option value="21" ${(s.btwRate === undefined || s.btwRate === 21) ? 'selected' : ''}>21% (standaard)</option>
                <option value="9"  ${s.btwRate === 9  ? 'selected' : ''}>9% (laag tarief)</option>
                <option value="0"  ${s.btwRate === 0  ? 'selected' : ''}>0% (vrijgesteld)</option>
              </select>
            </div>
            <div class="stg-field">
              <label class="stg-label">BTW NUMMER</label>
              <input type="text" class="stg-input" id="btwNumber" value="${esc(s.btwNumber || '')}" placeholder="NL000000000B01">
            </div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Vaste kosten (P&amp;L)</div>
            <div class="stg-sub">Maandelijkse kosten worden meegenomen in de Winst &amp; Verlies berekening</div>
          </div>
          <div id="fixedCostsList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px">
            ${(s.fixedCosts || []).map((c, i) => `
            <div class="fixed-cost-row" style="display:flex;gap:8px;align-items:center">
              <input type="text" class="stg-input fc-name" placeholder="Naam (bijv. Railway hosting)" value="${esc(c.name || '')}" style="flex:1" oninput="updateFixedCostTotal()">
              <div style="display:flex;align-items:center;gap:4px">
                <span style="color:var(--text-secondary);font-size:14px">€</span>
                <input type="number" class="stg-input fc-amount" placeholder="0" value="${c.amount || 0}" min="0" step="0.01" style="width:90px" oninput="updateFixedCostTotal()">
              </div>
              <button class="btn btn-ghost btn-sm" style="padding:0 8px;height:36px;color:var(--danger)" onclick="this.closest('.fixed-cost-row').remove();updateFixedCostTotal()" title="Verwijder">×</button>
            </div>`).join('')}
          </div>
          <button class="btn btn-ghost btn-sm" style="margin-bottom:12px" onclick="addFixedCostRow()"><i class="ti ti-plus"></i> Kosten toevoegen</button>
          <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:12px">Totaal: <span id="fixedCostTotal" style="color:var(--text-primary)">€${(s.fixedCosts || []).reduce((s,c) => s + (parseFloat(c.amount)||0), 0).toFixed(2)}</span> per maand</div>
          <button class="btn btn-ghost stg-save-btn" id="savePaymentsAutoBtn2" onclick="document.getElementById('savePaymentsAutoBtn')?.click()"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Automatische facturering</div>
          </div>
          <div style="margin-bottom:14px">
            <label class="toggle-wrap">
              <input type="checkbox" id="autoInvoiceEnabled" ${s.autoInvoiceEnabled ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Automatisch maandelijkse facturen aanmaken voor actieve klanten</span>
            </label>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">FACTUURDAG VAN DE MAAND</label>
              <select class="stg-input" id="autoInvoiceDay">
                ${Array.from({length:28},(_,i)=>i+1).map(d=>`<option value="${d}" ${(s.autoInvoiceDay||1)===d?'selected':''}>${d}e</option>`).join('')}
              </select>
            </div>
            <div class="stg-field">
              <label class="stg-label">HERINNERING NA (DAGEN)</label>
              <input type="number" class="stg-input" id="paymentReminderDays" value="${s.paymentReminderDays || 7}" min="1" max="30">
            </div>
          </div>
          <button class="btn btn-ghost stg-save-btn" id="savePaymentsAutoBtn"><i class="ti ti-device-floppy"></i> Facturering opslaan</button>
        </div>
      </div>

      <!-- ── Blacklist ── -->
      <div class="settings-tab-pane" id="stab-blacklist">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Blacklist</div>
            <div class="stg-sub">Geblokkeerde bedrijven, domeinen of niches worden overgeslagen bij elke run</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:flex-end">
            <div class="stg-field" style="flex:0 0 140px">
              <label class="stg-label">TYPE</label>
              <select class="stg-input" id="blType"><option value="company">Bedrijfsnaam</option><option value="domain">Domein</option><option value="niche">Niche</option></select>
            </div>
            <div class="stg-field" style="flex:2;min-width:160px">
              <label class="stg-label">WAARDE</label>
              <input type="text" class="stg-input" id="blValue" placeholder="bijv. Studio Bloom of studiodesign.nl">
            </div>
            <div class="stg-field" style="flex:2;min-width:140px">
              <label class="stg-label">REDEN (OPTIONEEL)</label>
              <input type="text" class="stg-input" id="blReason" placeholder="Reden">
            </div>
            <button class="btn btn-primary btn-sm" style="flex-shrink:0" onclick="addBlacklistEntry()"><i class="ti ti-plus"></i> Toevoegen</button>
          </div>
          <div id="blacklistItems"></div>
        </div>
      </div>

      <!-- ── API & integraties ── -->
      <div class="settings-tab-pane" id="stab-api">

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Claude API Sleutel
              ${s.claudeKeyConfigured ? s.claudeKeyFromEnv ? `<span class="stg-status-badge stg-badge-blue">Env var actief</span>` : `<span class="stg-status-badge stg-badge-green"><i class="ti ti-check"></i> Opgeslagen</span>` : `<span class="stg-status-badge stg-badge-amber"><i class="ti ti-alert-triangle"></i> Niet ingesteld</span>`}
            </div>
            <div class="stg-sub">Vereist voor alle AI-functies. Via <a href="https://console.anthropic.com/settings/keys" target="_blank" class="link">console.anthropic.com</a></div>
          </div>
          <div class="stg-field" style="max-width:420px;margin-bottom:12px">
            <label class="stg-label">ANTHROPIC API SLEUTEL ${s.claudeKeyConfigured && !s.claudeKeyFromEnv ? '<span class="stg-status-badge stg-badge-green" style="font-size:10px">Ingesteld</span>' : ''}</label>
            <input type="password" class="stg-input" id="claudeApiKeyInput" placeholder="${s.claudeKeyConfigured ? '(laat leeg om ongewijzigd te laten)' : 'sk-ant-...'}">
          </div>
          <div id="claudeKeyResult" style="margin-bottom:8px;display:none"></div>
          <button class="btn btn-primary btn-sm" id="saveClaudeKeyBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Agency AI API Sleutels</div>
            <div class="stg-sub">Gebruik voor externe integraties. Sleutel wordt slechts <strong>één keer</strong> getoond.</div>
          </div>
          <div id="apiKeysList" style="margin-bottom:16px"></div>
          <div style="display:flex;gap:10px;align-items:center">
            <input type="text" class="stg-input" id="newKeyLabel" placeholder="Label (bijv. Chrome Extensie)" style="flex:1">
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

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-brand-google-analytics" style="color:#e37400;margin-right:6px"></i>Google Analytics</div>
            <div class="stg-sub">Voeg je GA4 ID toe voor bezoekersdata van de landingspagina</div>
          </div>
          <div class="stg-field" style="max-width:280px;margin-bottom:12px">
            <label class="stg-label">GA4 MEASUREMENT ID</label>
            <input type="text" class="stg-input" id="gaId" placeholder="G-XXXXXXXXXX" value="${esc(s.gaId || '')}">
          </div>
          <button class="btn btn-primary btn-sm" id="saveGaBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
          ${s.gaId && /^G-[A-Z0-9]+$/i.test(s.gaId || '') ? '<div style="margin-top:8px;font-size:12px;color:#16a34a;font-weight:600"><i class="ti ti-circle-check"></i> Google Analytics actief</div>' : ''}
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-calendar-event" style="color:#006bff;margin-right:6px"></i>Calendly</div>
            <div class="stg-sub">Automatische boekingsknoppen in emails en klantportaal</div>
          </div>
          <div class="stg-field" style="max-width:480px;margin-bottom:8px">
            <label class="stg-label">CALENDLY URL</label>
            <input type="url" class="stg-input" id="calendlyUrl" placeholder="https://calendly.com/jouw-naam/gesprek" value="${esc(s.calendlyUrl || '')}">
          </div>
          <p class="stg-sub" style="margin-bottom:12px">Calendly webhook: <code class="stg-code-block" style="display:inline-block;margin-top:4px">${window.location.origin}/api/webhooks/calendly</code></p>
          <button class="btn btn-primary btn-sm" id="saveCalendlyBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-brand-zapier" style="color:#ff4a00;margin-right:6px"></i>Zapier &amp; Webhooks</div>
            <div class="stg-sub">Stuur data naar externe tools of laat Zapier leads toevoegen</div>
          </div>
          <div class="stg-field" style="margin-bottom:16px">
            <label class="stg-label">INKOMENDE ZAPIER TRIGGER URL</label>
            <div style="display:flex;gap:8px;align-items:center">
              <code id="zapierTriggerUrl" class="stg-code-block" style="flex:1">${window.location.origin}/api/zapier/trigger</code>
              <button class="btn btn-ghost btn-sm" onclick="copyZapierUrl()"><i class="ti ti-copy"></i></button>
            </div>
            <p class="stg-sub" style="margin-top:6px">Header <code>x-zapier-token</code> + body: <code>action: "add_lead"</code>, <code>companyName</code>, optioneel <code>websiteUrl</code>, <code>niche</code></p>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <label class="stg-label" style="margin:0">UITGAANDE WEBHOOKS</label>
            <button class="btn btn-primary btn-sm" onclick="openWebhookModal()"><i class="ti ti-plus"></i> Toevoegen</button>
          </div>
          <div id="webhooksList"></div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-puzzle" style="color:#4f46e5;margin-right:6px"></i>Chrome Extensie</div>
            <div class="stg-sub">Voeg bedrijven direct vanuit de browser toe aan je pipeline</div>
          </div>
          <div class="extension-install-card">
            <div class="ext-step"><span class="ext-step-num">1</span><div><strong>Download</strong><div class="ext-step-desc">Download de extensiebestanden.</div><a class="btn btn-primary btn-sm" href="/extension-download" download style="margin-top:8px"><i class="ti ti-download"></i> Download (.zip)</a></div></div>
            <div class="ext-step"><span class="ext-step-num">2</span><div><strong>Installeer in Chrome</strong><div class="ext-step-desc"><code>chrome://extensions</code> → Ontwikkelaarsmodus → Uitgepakt laden</div></div></div>
            <div class="ext-step"><span class="ext-step-num">3</span><div><strong>Server URL</strong><div style="display:flex;align-items:center;gap:8px;margin-top:6px"><code id="extensionServerUrl" class="stg-code-block">${window.location.origin}</code><button class="btn btn-ghost btn-sm" onclick="copyExtensionUrl()"><i class="ti ti-copy"></i></button></div></div></div>
            <div class="ext-step"><span class="ext-step-num">4</span><div><strong>API sleutel</strong><div class="ext-step-desc">Genereer een API sleutel hierboven en plak in de extensie.</div></div></div>
          </div>
        </div>

        <div class="stg-divider"></div>

        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">AI API limieten</div>
            <div class="stg-sub">Voorkom onverwachte kosten — de server slaat een actie over wanneer een limiet bereikt is</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field"><label class="stg-label">MAX CALLS / MINUUT</label><input type="number" class="stg-input" id="aiMaxPerMin"  value="${(s.aiRateLimits?.maxCallsPerMinute) ?? 10}"  min="1" max="60"></div>
            <div class="stg-field"><label class="stg-label">MAX CALLS / UUR</label>  <input type="number" class="stg-input" id="aiMaxPerHour" value="${(s.aiRateLimits?.maxCallsPerHour)   ?? 100}" min="1" max="1000"></div>
            <div class="stg-field"><label class="stg-label">MAX CALLS / DAG</label>  <input type="number" class="stg-input" id="aiMaxPerDay"  value="${(s.aiRateLimits?.maxCallsPerDay)    ?? 500}" min="1" max="5000"></div>
            <div class="stg-field"><label class="stg-label">MAX KOSTEN / DAG ($)</label><input type="number" class="stg-input" id="aiMaxCostDay" value="${(s.aiRateLimits?.maxDailyCostUsd)    ?? 10}"  min="0" step="0.5"></div>
          </div>
          <div id="aiRateStatusBar" style="margin-top:10px"></div>
          <button class="btn btn-primary stg-save-btn" id="saveAiRateLimitsBtn" style="margin-top:12px"><i class="ti ti-device-floppy"></i> Opslaan</button>
        </div>
      </div>

      <!-- ── Team ── -->
      ${isAdmin() ? `
      <div class="settings-tab-pane" id="stab-team">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title">Team &amp; gebruikers</div>
            <div class="stg-sub">Beheer toegang en rechten voor medewerkers</div>
          </div>
          <div id="usersList" style="margin-bottom:20px"></div>
          <div class="stg-divider"></div>
          <div style="margin-top:16px">
            <div class="stg-title" style="font-size:14px;margin-bottom:12px">Nieuwe gebruiker toevoegen</div>
            <div class="stg-grid-2">
              <div class="stg-field"><label class="stg-label">NAAM</label><input type="text" class="stg-input" id="newUserName" placeholder="Jan Jansen"></div>
              <div class="stg-field"><label class="stg-label">GEBRUIKERSNAAM</label><input type="text" class="stg-input" id="newUserUsername" placeholder="jan"></div>
              <div class="stg-field"><label class="stg-label">WACHTWOORD</label><input type="password" class="stg-input" id="newUserPassword" placeholder="••••••••"></div>
              <div class="stg-field"><label class="stg-label">ROL</label><select class="stg-input form-select" id="newUserRole"><option value="employee">Medewerker</option><option value="admin">Admin</option></select></div>
            </div>
            <button class="btn btn-primary btn-sm stg-save-btn" onclick="addUser()"><i class="ti ti-plus"></i> Gebruiker aanmaken</button>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- ── Gevaarlijke zone ── -->
      <div class="settings-tab-pane" id="stab-danger">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title" style="color:#dc2626"><i class="ti ti-alert-triangle" style="margin-right:6px"></i>Gevaarlijke zone</div>
            <div class="stg-sub">Deze acties zijn onomkeerbaar. Klik om uit te klappen.</div>
          </div>
          <details class="stg-danger-details">
            <summary class="stg-danger-summary"><i class="ti ti-chevron-right stg-danger-chevron"></i> Toon gevaarlijke acties</summary>
            <div class="stg-danger-body">
              <div class="stg-danger-action">
                <div><strong>Verwijder alle leads</strong><p>Verwijdert alle leads permanent uit de database.</p></div>
                <button class="btn btn-danger" id="deleteLeadsBtn">Verwijder alle leads</button>
              </div>
              <div class="stg-danger-action">
                <div><strong>Reset statistieken</strong><p>Wist alle statistieken en telwaarden.</p></div>
                <button class="btn btn-danger" id="resetStatsBtn">Reset statistieken</button>
              </div>
            </div>
          </details>
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
  loadApiKeysList();
  loadAiRateStatus();
  loadAgencyProfiles();
  loadWebhooksList();

  document.getElementById('saveResendBtn')?.addEventListener('click', async () => {
    const btn      = document.getElementById('saveResendBtn');
    const resultEl = document.getElementById('resendSaveResult');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Opslaan...';
    resultEl.style.display = 'none';

    const keyVal  = document.getElementById('resendApiKey')?.value?.trim() || '';
    const fromVal = document.getElementById('resendFromAddress')?.value?.trim() || '';
    const nameVal = document.getElementById('resendSenderName')?.value?.trim() || '';
    const body = { resendFromAddress: fromVal };
    if (keyVal) body.resendApiKey = keyVal;
    if (nameVal) body.agencyName = nameVal;

    const saveRes = await api('/api/settings/resend', { method: 'PATCH', body: JSON.stringify(body) });
    if (!saveRes.ok) {
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-device-floppy"></i> Opslaan &amp; testen';
      resultEl.style.display = 'block';
      resultEl.innerHTML = `<div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px"><i class="ti ti-x-circle"></i> Opslaan mislukt</div>`;
      return;
    }
    if (keyVal) { document.getElementById('resendApiKey').value = ''; state.settings.resendConfigured = true; }

    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Verbinding testen...';
    const testRes  = await api('/api/settings/test-email', { method: 'POST' });
    const testData = await testRes.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Opslaan &amp; testen';
    resultEl.style.display = 'block';
    if (testRes.ok) {
      resultEl.innerHTML = `<div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#16a34a;font-size:13px"><i class="ti ti-circle-check"></i> ${esc(testData.message || 'Testmail verstuurd!')}</div>`;
    } else {
      resultEl.innerHTML = `<div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px"><i class="ti ti-x-circle"></i> <strong>Test mislukt:</strong> ${esc(testData.error || 'Onbekende fout')}</div>`;
    }
  });

  document.getElementById('saveClaudeKeyBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveClaudeKeyBtn');
    const resultEl = document.getElementById('claudeKeyResult');
    const val = document.getElementById('claudeApiKeyInput')?.value?.trim() || '';
    if (!val) { toast('Voer een API sleutel in', 'error'); return; }
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Opslaan...';
    const res = await api('/api/settings/claude-key', { method: 'PATCH', body: JSON.stringify({ claudeApiKey: val }) });
    const data = await res.json();
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Opslaan';
    resultEl.style.display = 'block';
    if (res.ok) {
      resultEl.innerHTML = `<div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#16a34a;font-size:13px"><i class="ti ti-circle-check"></i> Claude API sleutel opgeslagen in database</div>`;
      document.getElementById('claudeApiKeyInput').value = '';
      state.settings.claudeKeyConfigured = true;
    } else {
      resultEl.innerHTML = `<div style="padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px"><i class="ti ti-x-circle"></i> ${esc(data.error || 'Opslaan mislukt')}</div>`;
    }
  });

  document.getElementById('saveGaBtn')?.addEventListener('click', async () => {
    const gaId = document.getElementById('gaId')?.value?.trim() || '';
    if (gaId && !/^G-[A-Z0-9]+$/i.test(gaId)) {
      toast('Ongeldig GA4 ID — gebruik formaat G-XXXXXXXXXX', 'error');
      return;
    }
    const res = await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify({ gaId }) });
    if (res.ok) toast('Google Analytics opgeslagen', 'success');
    else toast('Opslaan mislukt', 'error');
  });

  document.getElementById('saveCalendlyBtn')?.addEventListener('click', async () => {
    const calendlyUrl = document.getElementById('calendlyUrl')?.value?.trim() || '';
    const res = await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify({ calendlyUrl }) });
    if (res.ok) toast('Calendly opgeslagen', 'success');
    else toast('Opslaan mislukt', 'error');
  });

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
    if (window._pendingLogo !== undefined) {
      body.agencyLogo = window._pendingLogo;
    }
    const res = await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify(body) });
    const data = await res.json();
    if (res.ok) {
      toast('Account opgeslagen', 'success');
      localStorage.setItem('myName', body.myName);
      document.getElementById('userName').textContent = body.myName;
      document.getElementById('userAvatar').textContent = (body.myName || 'A')[0].toUpperCase();
      if (window._pendingLogo !== undefined) {
        updateSidebarLogo(window._pendingLogo);
        if (state.settings) state.settings.agencyLogo = window._pendingLogo;
        window._pendingLogo = undefined;
      }
    } else {
      toast(data.error, 'error');
    }
  });

  document.getElementById('saveGmailBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveGmailBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Opslaan...';
    const pwVal = document.getElementById('gmailPassword')?.value?.trim() || '';
    const body = {
      gmailAddress: document.getElementById('gmailAddress')?.value?.trim() || '',
      replyDetection: document.getElementById('replyDetection')?.checked ?? true,
      webhookToken: document.getElementById('webhookToken')?.value || '',
      webhookConfigured: document.getElementById('webhookEnabled')?.checked ?? false
    };
    if (pwVal) body.gmailPassword = pwVal;
    const res = await api('/api/settings/gmail', { method: 'PATCH', body: JSON.stringify(body) });
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Gmail opslaan';
    if (res.ok) toast('Gmail opgeslagen', 'success');
    else toast('Opslaan mislukt', 'error');
  });

  document.getElementById('addServiceBtn').addEventListener('click', () => {
    const table = document.getElementById('servicesTable');
    const idx = table.children.length;
    const row = document.createElement('div');
    row.className = 'service-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <input type="text" class="svc-name" placeholder="Dienst naam">
      <input type="number" class="svc-price" placeholder="Prijs" style="width:100px">
      <select class="svc-billing" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-primary)">
        <option value="maandelijks">Maandelijks</option>
        <option value="eenmalig">Eenmalig</option>
      </select>
      <input type="text" class="svc-desc" placeholder="Beschrijving">
      <button class="btn btn-ghost btn-sm btn-icon" title="Test deze dienst" onclick="openServiceTestModal(this.closest('.service-row').querySelector('.svc-name').value)"><i class="ti ti-test-pipe"></i></button>
      <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
    `;
    table.appendChild(row);
  });

  document.getElementById('loadDefaultServicesBtn').addEventListener('click', async () => {
    if (!confirm('Huidige diensten vervangen door de standaard lijst van 66 diensten?')) return;
    const defaults = await apiJSON('/api/settings/services/defaults');
    if (!defaults) return toast('Laden mislukt', 'error');
    const table = document.getElementById('servicesTable');
    table.innerHTML = defaults.map((svc, i) => `
      <div class="service-row" data-idx="${i}">
        <input type="text" class="svc-name" value="${esc(svc.name)}" placeholder="Dienst naam">
        <input type="number" class="svc-price" value="${svc.price}" placeholder="Prijs" style="width:100px">
        <select class="svc-billing" style="font-size:12px;padding:4px 6px;border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--text-primary)">
          <option value="maandelijks" ${(svc.billing||'maandelijks')==='maandelijks'?'selected':''}>Maandelijks</option>
          <option value="eenmalig" ${svc.billing==='eenmalig'?'selected':''}>Eenmalig</option>
        </select>
        <input type="text" class="svc-desc" value="${esc(svc.description)}" placeholder="Beschrijving">
        <button class="btn btn-ghost btn-sm btn-icon" title="Test deze dienst" onclick="openServiceTestModal(this.closest('.service-row').querySelector('.svc-name').value)"><i class="ti ti-test-pipe"></i></button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="this.closest('.service-row').remove()"><i class="ti ti-trash"></i></button>
      </div>
    `).join('');
    toast('66 standaard diensten geladen — klik Opslaan om te bewaren', 'info');
  });

  document.getElementById('saveServicesBtn').addEventListener('click', async () => {
    const rows = document.querySelectorAll('.service-row');
    const services = Array.from(rows).map(r => ({
      name: r.querySelector('.svc-name').value,
      price: parseInt(r.querySelector('.svc-price').value) || 0,
      billing: r.querySelector('.svc-billing')?.value || 'maandelijks',
      description: r.querySelector('.svc-desc').value
    }));
    const res = await api('/api/settings/services', { method: 'PATCH', body: JSON.stringify({ services }) });
    if (res.ok) toast('Diensten opgeslagen', 'success');
  });

  document.getElementById('saveAutomationBtn').addEventListener('click', async () => {
    const body = {
      dailyRunTime: document.getElementById('dailyRunTime').value,
      leadsPerDay: parseInt(document.querySelector('input[name="leadsPerDay"]:checked')?.value || 15),
      automationPaused: document.getElementById('automationPaused').checked,
      dailyBriefingEnabled: document.getElementById('dailyBriefingEnabled').checked,
      dailyBriefingTime: document.getElementById('dailyBriefingTime').value,
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
      btwEnabled:  document.getElementById('btwEnabled')?.checked ?? false,
      btwRate:     parseInt(document.getElementById('btwRate')?.value || 21),
      btwNumber:   document.getElementById('btwNumber')?.value?.trim() || '',
      fixedCosts: [...document.querySelectorAll('#fixedCostsList .fixed-cost-row')].map(row => ({
        name: row.querySelector('.fc-name')?.value.trim() || '',
        amount: parseFloat(row.querySelector('.fc-amount')?.value) || 0
      })).filter(c => c.name),
      aiRateLimits: {
        maxCallsPerMinute: parseInt(document.getElementById('aiMaxPerMin')?.value  || 10),
        maxCallsPerHour:   parseInt(document.getElementById('aiMaxPerHour')?.value || 100),
        maxCallsPerDay:    parseInt(document.getElementById('aiMaxPerDay')?.value  || 500),
        maxDailyCostUsd:   parseFloat(document.getElementById('aiMaxCostDay')?.value || 10)
      },
      aiAutoReply:        document.getElementById('aiAutoReply')?.checked ?? true,
      aiAutoReplySend:    document.getElementById('aiAutoReplySend')?.checked ?? false,
      autoArchiveEnabled: document.getElementById('autoArchiveEnabled')?.checked ?? true,
      autoArchiveDays:    parseInt(document.getElementById('autoArchiveDays')?.value || 30),
    };
    const res = await api('/api/settings/automation', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) toast('Automatisering opgeslagen', 'success');
  });

  if (isAdmin()) loadUsersList();

  document.getElementById('saveAiRateLimitsBtn')?.addEventListener('click', async () => {
    const body = {
      aiRateLimits: {
        maxCallsPerMinute: parseInt(document.getElementById('aiMaxPerMin')?.value  || 10),
        maxCallsPerHour:   parseInt(document.getElementById('aiMaxPerHour')?.value || 100),
        maxCallsPerDay:    parseInt(document.getElementById('aiMaxPerDay')?.value  || 500),
        maxDailyCostUsd:   parseFloat(document.getElementById('aiMaxCostDay')?.value || 10)
      }
    };
    const res = await api('/api/settings/automation', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) { toast('AI limieten opgeslagen', 'success'); loadAiRateStatus?.(); }
    else toast('Opslaan mislukt', 'error');
  });

  document.getElementById('saveEmailAutoBtn')?.addEventListener('click', () => {
    document.getElementById('saveAutomationBtn')?.click();
  });

  document.getElementById('savePaymentsAutoBtn')?.addEventListener('click', () => {
    document.getElementById('saveAutomationBtn')?.click();
  });

  document.getElementById('saveStripeBtn').addEventListener('click', async () => {
    const bankIban    = document.getElementById('bankTransferIban').value.trim();
    const bankName    = document.getElementById('bankTransferName').value.trim();
    const bankBic     = document.getElementById('bankTransferBic').value.trim();
    const termDays    = parseInt(document.getElementById('paymentTermDays')?.value || 14);
    const body = { preferredPaymentMethod: 'bank_transfer', bankTransferIban: bankIban, bankTransferName: bankName, bankTransferBic: bankBic, paymentTermDays: termDays };
    const res = await api('/api/settings/stripe', { method: 'PATCH', body: JSON.stringify(body) });
    if (res.ok) {
      toast('Betaalinstellingen opgeslagen', 'success');
      state.settings = { ...(state.settings || {}), bankTransferIban: bankIban, bankTransferName: bankName, bankTransferBic: bankBic, paymentTermDays: termDays, preferredPaymentMethod: 'bank_transfer', bankTransferConfigured: !!bankIban };
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

  const btns = ['runNowBtn2'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(btn => { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; });

  toast('Run gestart', 'info');
  // Start progress polling so the live card shows up right away
  if (document.getElementById('liveRunCard')) startRunProgressPoll();

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
    btns.forEach(btn => { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Run nu'; }); // runNowBtn2 restore
    stopRunProgressPoll();
    const card = document.getElementById('liveRunCard');
    if (card) card.style.display = 'none';
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

function startInboxCountdown(target) {
  const el = document.getElementById('inboxCountdown');
  if (!el) return;
  const tick = () => {
    const diff = target - Date.now();
    if (diff <= 0) { el.textContent = 'Nu...'; return; }
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
    const pad = n => String(n).padStart(2, '0');
    el.textContent = `over ${pad(h)}:${pad(m)}:${pad(s)}`;
    setTimeout(tick, 1000);
  };
  tick();
}

async function toggleAutoRun(currentlyPaused) {
  const res = await api('/api/settings/automation', {
    method: 'PATCH',
    body: JSON.stringify({ automationPaused: !currentlyPaused })
  });
  if (!res || !res.ok) { toast('Opslaan mislukt', 'error'); return; }
  state.settings.automationPaused = !currentlyPaused;
  toast(currentlyPaused ? 'Auto-run hervat' : 'Auto-run gepauzeerd');
  renderDashboard();
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
  fetchContactsBadge();
  fetchPipelineBadge();
}

async function fetchPipelineBadge() {
  const data = await apiJSON('/api/leads/unread-portal-count');
  if (!data) return;
  const count = data.count || 0;
  ['pipelineBadge', 'pipelineBadgeMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = count > 9 ? '9+' : count;
    el.style.display = count > 0 ? '' : 'none';
  });
}

async function fetchContactsBadge() {
  const contacts = await apiJSON('/api/contacts');
  if (!contacts) return;
  const newCount = contacts.filter(c => c.status === 'new').length;
  const badge = document.getElementById('contactsBadge');
  if (badge) {
    badge.textContent = newCount > 9 ? '9+' : newCount;
    badge.style.display = newCount > 0 ? '' : 'none';
  }
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

  const TYPE_EMOJI = {
    reply_received:   '💬',
    intake_submitted: '📋',
    high_score_lead:  '⭐',
    payment_overdue:  '⚠️',
    payment_received: '💰',
    run_complete:     '⚡',
    email_bounced:    '📭',
    calendly_booking: '📅',
    contact_form:     '📩',
    client_question:  '💬'
  };

  const notifHTML = data.notifications.length === 0
    ? `<div style="text-align:center;padding:40px 16px;color:#9b9b98;font-size:13px;">
        <div style="font-size:32px;margin-bottom:8px;">🔔</div>
        <div>Geen nieuwe meldingen</div>
       </div>`
    : data.notifications.map(n => `
        <div onclick="handleNotificationClick('${n.id}','${encodeURIComponent(n.link || '')}')"
          style="display:flex;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid #e8e8e5;
            background:${n.read ? 'transparent' : 'rgba(99,102,241,0.05)'};transition:background 0.15s;"
          onmouseover="this.style.background='rgba(0,0,0,0.03)'"
          onmouseout="this.style.background='${n.read ? 'transparent' : 'rgba(99,102,241,0.05)'}'">
          <div style="font-size:20px;flex-shrink:0;padding-top:2px;">
            ${TYPE_EMOJI[n.type] || '🔔'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:${n.read ? '400' : '600'};font-size:13px;color:#1a1a1a;margin-bottom:2px;">
              ${esc(n.title || 'Melding')}
            </div>
            <div style="font-size:12px;color:#6b7280;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
              ${esc(n.body || '')}
            </div>
            <div style="font-size:11px;color:#9ca3af;margin-top:3px;">
              ${relativeTime(n.createdAt)}
            </div>
          </div>
          ${!n.read ? `<div style="width:8px;height:8px;background:#6366f1;border-radius:50%;flex-shrink:0;margin-top:5px;"></div>` : ''}
        </div>`).join('');

  const pushSubscribed = window._pushSubscription ? '1' : '0';
  const headerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;border-bottom:1px solid #e8e8e5;">
      <span style="font-size:15px;font-weight:700;color:#1a1a1a;">Meldingen</span>
      <div style="display:flex;gap:6px;align-items:center;">
        ${'PushManager' in window ? `<button class="push-toggle-btn notif-push-btn" data-subscribed="${pushSubscribed}" onclick="togglePushSubscription()" title="${pushSubscribed === '1' ? 'Notificaties uitschakelen' : 'Notificaties inschakelen'}">
          <i class="ti ti-bell${pushSubscribed === '1' ? '-off' : '-ringing'}"></i>
        </button>` : ''}
        ${data.unread > 0 ? `<button onclick="markAllNotificationsRead()" style="font-size:12px;color:#6366f1;background:none;border:none;cursor:pointer;font-weight:600;padding:4px 8px;border-radius:6px;">Alles gelezen</button>` : ''}
      </div>
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

  // Remove old backdrop if any
  document.getElementById('notifBackdrop')?.remove();

  let panelEl = document.getElementById('notifPanel');
  if (!panelEl) {
    panelEl = document.createElement('div');
    panelEl.id = 'notifPanel';
    panelEl.className = 'notif-panel';
    document.body.appendChild(panelEl);
  }
  panelEl.innerHTML = headerHTML + `<div class="notif-list">${notifHTML}</div>`;
  panelEl.style.display = 'block';
  requestAnimationFrame(() => panelEl.classList.add('visible'));

  // Backdrop closes on click outside
  const backdrop = document.createElement('div');
  backdrop.id = 'notifBackdrop';
  backdrop.className = 'notif-backdrop';
  backdrop.addEventListener('click', closeNotificationPanel);
  document.body.insertBefore(backdrop, panelEl);
}

function closeNotificationPanel() {
  const panel = document.getElementById('notifPanel');
  if (!panel) return;
  panel.classList.remove('visible');
  document.getElementById('notifBackdrop')?.remove();
  setTimeout(() => { if (panel) panel.style.display = 'none'; }, 200);
}

async function handleNotificationClick(id, encodedLink) {
  await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
  closeNotificationPanel();
  closeModal();
  const link = decodeURIComponent(encodedLink || '');
  if (link) {
    if (link.startsWith('project:')) {
      const leadId = link.split(':')[1];
      setView('leads');
      setTimeout(() => openLeadDetail(leadId), 300);
    } else {
      setView(link);
    }
  }
  fetchNotifications();
}

async function markNotificationRead(id) {
  await api(`/api/notifications/${id}/read`, { method: 'PATCH' });
  fetchNotifications();
  openNotificationPanel();
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

  // Poll run progress every 10s globally (keeps sidebar "Nu draait" in sync)
  setInterval(async () => {
    if (state.view === 'runs') return; // runs page has its own faster poll
    try {
      const p = await apiJSON('/api/run/progress');
      updateSidebarRunning(p);
    } catch {}
  }, 10000);

  // Service worker + push notifications
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      window._swReg = reg;
      initPushNotifications(reg);
    }).catch(() => {});
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
