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
  if (res.status === 429) { console.warn('[API] 429 Too Many Requests:', path); return null; }
  if (!res.ok) return null;
  return res.json();
}

async function claudeCall(prompt, expectJson = false) {
  return apiJSON('/api/claude', {
    method: 'POST',
    body: JSON.stringify({ prompt, json: expectJson })
  });
}

// ─── Lazy page loader ─────────────────────────────────────────────────────────
const _loadedPages = new Set();
const _pageDeps = {
  inbox:    ['leads'],
  pipeline: ['leads'],
  project:  ['leads'],
};

function loadPage(view) {
  if (_loadedPages.has(view)) return Promise.resolve();
  const deps = _pageDeps[view] || [];
  const loadDeps = deps.length ? Promise.all(deps.map(d => loadPage(d))) : Promise.resolve();
  // Map view names to actual filenames (when they differ)
  var fileMap = {
    'stats':      'statistieken',
    'statistieken':'statistieken',
    'contacts':   'contacten',
    'contacten':  'contacten',
    'settings':   'instellingen',
    'instellingen':'instellingen'
  };
  var filename = fileMap[view] || view;
  return loadDeps.then(function() {
    return new Promise(function(resolve) {
      var s = document.createElement('script');
      s.src = '/pages/' + filename + '.js';
      s.onload  = function() { _loadedPages.add(view); resolve(); };
      s.onerror = function() { console.error('[Page] Failed to load:', filename + '.js (view: ' + view + ')'); _loadedPages.add(view); resolve(); };
      document.head.appendChild(s);
    });
  });
}

// ─── Routing ──────────────────────────────────────────────────────────────────
const VIEW_LABELS = {
  dashboard: 'Dashboard', inbox: 'Inbox', leads: 'Leads', pipeline: 'Pipeline',
  agents: 'Agents', runs: 'Runs', stats: 'Statistieken', chat: 'Chat', settings: 'Instellingen',
  project: 'Project', contacts: 'Contacten', betalingen: 'Betalingen'
};

function setView(view) {
  if (state.view === 'chat' && view !== 'chat' && state._chatPollTimer) {
    clearInterval(state._chatPollTimer);
    state._chatPollTimer = null;
  }
  if (state.view === 'stats' && view !== 'stats' && typeof destroyStatsCharts !== 'undefined') destroyStatsCharts();
  if (state.view === 'runs' && view !== 'runs' && typeof stopRunProgressPoll !== 'undefined') stopRunProgressPoll();
  state.view = view;

  const topbarPage = document.getElementById('topbarPage');
  if (topbarPage) topbarPage.textContent = VIEW_LABELS[view] || view;

  document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  // Arrow-function wrappers defer function lookup to call time (after page script loads)
  const renderFns = {
    dashboard:  () => renderDashboard(),
    inbox:      () => renderInbox(),
    leads:      () => renderLeads(),
    pipeline:   () => renderPipeline(),
    agents:     () => renderAgents(),
    runs:       () => renderRuns(),
    stats:      () => renderStats(),
    chat:       () => renderChat(),
    settings:   () => renderSettings(),
    project:    () => renderProjectPage(),
    contacts:   () => renderContacts(),
    betalingen: () => renderBetalingen()
  };

  const render = renderFns[view] || renderFns.dashboard;
  loadPage(view).then(() => render());
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `
    <i class="ti ti-${type === 'success' ? 'check' : type === 'error' ? 'x' : type === 'warning' ? 'alert-triangle' : 'info-circle'}"></i>
    <span>${msg}</span>
    <button onclick="this.closest('.toast').remove()" style="background:none;border:none;color:rgba(255,255,255,.7);cursor:pointer;font-size:16px;margin-left:8px;line-height:1">×</button>
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


// ─── XSS escaping (shared across all pages) ───────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
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

// ─── Global keyboard shortcuts ────────────────────────────────────────────────
function initGlobalKeyboard() {
  document.addEventListener('keydown', function(e) {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (document.querySelector('.modal-backdrop')) return;
    if (state.view === 'inbox') return; // inbox has its own handler
    switch (e.key) {
      case '?': e.preventDefault(); showShortcutsOverlay(); break;
      case 'i': case 'I': setView('inbox'); break;
      case 'l': case 'L': setView('leads'); break;
      case 'p': case 'P': setView('pipeline'); break;
      case 's': if (!e.shiftKey) { setView('stats'); } break;
      case 'n': case 'N': setView('runs'); break;
    }
  });
}

function showShortcutsOverlay() {
  openModal(`
    <div style="padding:24px;min-width:360px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
        <h3 style="font-size:16px;font-weight:700">Keyboard shortcuts</h3>
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-secondary)">×</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px">
        ${[
          ['I','Inbox'],['L','Leads'],['P','Pipeline'],['S','Statistieken'],['N','Runs / New run'],
          ['A','Approve (inbox)'],['R','Reject (inbox)'],['↑ ↓','Navigate (inbox)'],['?','Deze hulp']
        ].map(([k,d]) => `<div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:14px;color:var(--text-secondary)">${d}</span>
          <kbd style="background:var(--surface-2);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-family:monospace;font-size:13px;font-weight:600">${k}</kbd>
        </div>`).join('')}
      </div>
    </div>
  `);
}

// ─── Sidebar logo (used by dashboard + settings; must live in core) ──────────
function updateSidebarLogo(logoUrl) {
  const logoIcon = document.querySelector('.logo-icon');
  if (!logoIcon) return;
  const src = logoUrl || '/images/agency_ai_logo_dark.png';
  logoIcon.innerHTML = `<img src="${src}" style="height:28px;max-width:120px;object-fit:contain;display:block">`;
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

// ─── WebSocket real-time updates ──────────────────────────────────────────────
let _ws = null;
let _wsReconnectTimer = null;

function initWebSocket() {
  const token = localStorage.getItem('agencyToken');
  if (!token) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`;
  try {
    _ws = new WebSocket(url);
  } catch { return; }

  _ws.onopen = () => {
    console.log('[WS] Verbonden');
    if (_wsReconnectTimer) { clearTimeout(_wsReconnectTimer); _wsReconnectTimer = null; }
  };

  _ws.onmessage = (evt) => {
    let msg;
    try { msg = JSON.parse(evt.data); } catch { return; }
    const { event, data } = msg;

    if (event === 'new_reply') {
      toast(`💬 ${data.companyName} heeft gereageerd!`, 'success');
      fetchNotifications();
      // If inbox is open, refresh it
      if (state.view === 'inbox') renderInbox();
    } else if (event === 'new_lead') {
      toast(`⚡ Run klaar: ${data.count} leads gevonden`, 'info');
      fetchNotifications();
      // Update inbox badge
      const badge = document.getElementById('inboxBadge');
      if (badge) { badge.textContent = parseInt(badge.textContent || '0') + data.count; badge.style.display = ''; }
    } else if (event === 'build_complete') {
      toast(`🏗️ Build klaar: ${data.count} leveringen gebouwd`, 'success');
      // If currently viewing that project's building tab, refresh it
      if (state.view === 'project' && state._openLeadId === data.leadId) {
        const leads = state.leads || [];
        const lead = leads.find(l => l.id === data.leadId);
        if (lead) { apiJSON(`/api/leads/${data.leadId}`).then(updated => { if (updated) { const idx = leads.findIndex(l => l.id === data.leadId); if (idx !== -1) { state.leads[idx] = updated; renderProjectPage(); } } }); }
      }
    } else if (event === 'notification') {
      fetchNotifications();
    }
  };

  _ws.onclose = (evt) => {
    console.log('[WS] Verbinding verbroken, herverbinden in 15s...', evt.code);
    _ws = null;
    if (evt.code !== 4001) { // 4001 = unauthorized, don't retry
      _wsReconnectTimer = setTimeout(initWebSocket, 15000);
    }
  };

  _ws.onerror = () => {};
}

// ─── Notifications ────────────────────────────────────────────────────────────
let _notifPollTimer = null;

function startNotificationPolling() {
  if (_notifPollTimer) return;
  fetchNotifications();
  _notifPollTimer = setInterval(fetchNotifications, 30000);
  // Also try WebSocket (falls back to polling if unavailable)
  initWebSocket();
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
      openProjectPage(leadId);
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

  // Global keyboard shortcuts
  initGlobalKeyboard();

  // Load initial view
  setView('dashboard');

  // Onboarding wizard: show on first login if not completed
  setTimeout(async () => {
    if (!isAdmin()) return;
    const s = await apiJSON('/api/settings');
    if (s && !s.onboardingCompleted) showOnboardingWizard();
  }, 800);

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

// ─── Onboarding wizard ────────────────────────────────────────────────────────
let _onboardingStep = 1;
const ONBOARDING_NICHES = [
  { icon: '🍽️', label: 'Restaurant' }, { icon: '✂️', label: 'Kapper' },
  { icon: '💪', label: 'Fysiotherapeut' }, { icon: '🦷', label: 'Tandarts' },
  { icon: '⚖️', label: 'Advocaat' }, { icon: '🏠', label: 'Makelaar' },
  { icon: '🍞', label: 'Bakkerij' }, { icon: '🔧', label: 'Garage' },
  { icon: '📸', label: 'Fotograaf' }, { icon: '💅', label: 'Beauty Salon' },
  { icon: '🏋️', label: 'Sportschool' }, { icon: '💊', label: 'Apotheek' }
];

function showOnboardingWizard() {
  _onboardingStep = 1;
  _renderOnboardingStep();
}

function _renderOnboardingStep() {
  const steps = ['Bureau naam', 'Email test', 'Bankgegevens', 'Niche', 'Logo', 'Klaar!'];
  const progressPct = Math.round((_onboardingStep / 6) * 100);
  const progressBar = `<div style="height:4px;background:#e5e7eb;border-radius:2px;margin-bottom:24px;">
    <div style="height:4px;background:#6366f1;border-radius:2px;width:${progressPct}%;transition:width 0.3s;"></div>
  </div>
  <div style="font-size:12px;color:#9ca3af;margin-bottom:16px;text-align:center;">
    Stap ${_onboardingStep} van 6 — ${steps[_onboardingStep-1]}
  </div>`;

  let content = '';
  if (_onboardingStep === 1) {
    content = `
      <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Welkom bij Agency AI! 🚀</h2>
      <p style="color:#6b7280;margin-bottom:24px;">Laten we je bureau instellen. Hoe heet je bureau?</p>
      <input id="ob_agencyName" class="input-field" placeholder="Bijv. Digital Pro Bureau" style="width:100%;margin-bottom:16px;" value="">
      <input id="ob_myName" class="input-field" placeholder="Jouw naam (bijv. Lisa de Vries)" style="width:100%;margin-bottom:16px;" value="">`;
  } else if (_onboardingStep === 2) {
    content = `
      <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Email verbinding 📧</h2>
      <p style="color:#6b7280;margin-bottom:24px;">Stel je email in zodat Agency AI emails kan versturen. Je kunt dit later ook instellen via Instellingen → Email.</p>
      <div id="ob_emailStatus" style="padding:16px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;color:#6b7280;font-size:14px;">
        Configureer email in <strong>Instellingen → Email</strong> na het afronden van de wizard.
      </div>`;
  } else if (_onboardingStep === 3) {
    content = `
      <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Bankgegevens 💳</h2>
      <p style="color:#6b7280;margin-bottom:24px;">Voor facturen aan je klanten.</p>
      <input id="ob_iban" class="input-field" placeholder="IBAN (bijv. NL00 RABO 0000 0000 00)" style="width:100%;margin-bottom:12px;">
      <input id="ob_bic" class="input-field" placeholder="BIC (bijv. RABONL2U)" style="width:100%;margin-bottom:12px;">
      <input id="ob_tenaamstelling" class="input-field" placeholder="Tenaamstelling (naam op bankrekening)" style="width:100%;margin-bottom:12px;">`;
  } else if (_onboardingStep === 4) {
    const nicheGrid = ONBOARDING_NICHES.map((n, i) => `
      <div onclick="window._ob_niche='${n.label}';document.querySelectorAll('.ob-niche').forEach(el=>el.classList.remove('selected'));this.classList.add('selected');"
        class="ob-niche" data-idx="${i}" style="text-align:center;padding:16px 8px;border:2px solid #e5e7eb;border-radius:10px;cursor:pointer;transition:all 0.15s;">
        <div style="font-size:28px;">${n.icon}</div>
        <div style="font-size:12px;font-weight:500;margin-top:6px;">${n.label}</div>
      </div>`).join('');
    content = `
      <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Eerste niche 🎯</h2>
      <p style="color:#6b7280;margin-bottom:20px;">Welk type klanten ga je als eerste targeten?</p>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">${nicheGrid}</div>`;
    window._ob_niche = '';
  } else if (_onboardingStep === 5) {
    content = `
      <h2 style="font-size:24px;font-weight:700;margin-bottom:8px;">Bureau logo 🖼️</h2>
      <p style="color:#6b7280;margin-bottom:24px;">Upload je logo voor in emails en het klantportaal (optioneel).</p>
      <div style="border:2px dashed #e5e7eb;border-radius:10px;padding:32px;text-align:center;">
        <input type="file" id="ob_logo" accept="image/*" style="display:none" onchange="window._previewObLogo(this)">
        <div id="ob_logoPreview" style="font-size:48px;margin-bottom:12px;">🖼️</div>
        <button onclick="document.getElementById('ob_logo').click()" class="btn btn-secondary">Kies logo bestand</button>
        <p style="font-size:12px;color:#9ca3af;margin-top:8px;">PNG, JPG of SVG — max 2MB</p>
      </div>`;
    window._ob_logoData = null;
    window._previewObLogo = (input) => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        window._ob_logoData = e.target.result;
        const prev = document.getElementById('ob_logoPreview');
        if (prev) prev.innerHTML = `<img src="${e.target.result}" style="max-height:80px;max-width:200px;object-fit:contain;">`;
      };
      reader.readAsDataURL(file);
    };
  } else if (_onboardingStep === 6) {
    content = `
      <div style="text-align:center;padding:16px 0;">
        <div style="font-size:72px;margin-bottom:16px;">✅</div>
        <h2 style="font-size:28px;font-weight:700;margin-bottom:12px;">Je bent klaar!</h2>
        <p style="color:#6b7280;margin-bottom:32px;font-size:16px;">Agency AI is geconfigureerd en klaar om leads te vinden.<br>Start je eerste run om automatisch lokale bedrijven te vinden.</p>
        <button onclick="window._finishOnboarding()" class="btn btn-primary" style="padding:14px 32px;font-size:16px;">
          Start eerste run →
        </button>
      </div>`;
  }

  const navHtml = _onboardingStep < 6 ? `
    <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:24px;">
      ${_onboardingStep > 1 ? `<button onclick="_onboardingStep--;_renderOnboardingStep()" class="btn btn-secondary">← Vorige</button>` : ''}
      <button onclick="window._obNext()" class="btn btn-primary">
        ${_onboardingStep === 5 ? 'Afronden →' : 'Volgende →'}
      </button>
    </div>` : '';

  openModal(`
    <style>
      .ob-niche.selected { border-color:#6366f1!important; background:#eef2ff; }
    </style>
    <div style="max-width:520px;margin:0 auto;">
      ${progressBar}
      ${content}
      ${navHtml}
    </div>
  `);
}

window._obNext = async function() {
  if (_onboardingStep === 1) {
    const name = document.getElementById('ob_agencyName')?.value?.trim();
    const myName = document.getElementById('ob_myName')?.value?.trim();
    if (!name) { toast('Vul een bureaunaam in', 'error'); return; }
    await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify({ agencyName: name, myName: myName || '' }) });
  } else if (_onboardingStep === 3) {
    const iban = document.getElementById('ob_iban')?.value?.trim();
    const bic = document.getElementById('ob_bic')?.value?.trim();
    const ten = document.getElementById('ob_tenaamstelling')?.value?.trim();
    if (iban) await api('/api/settings/automation', { method: 'PATCH', body: JSON.stringify({ bankIban: iban, bankBic: bic || '', bankTenaamstelling: ten || '' }) });
  } else if (_onboardingStep === 4) {
    if (window._ob_niche) {
      await api('/api/settings/automation', { method: 'PATCH', body: JSON.stringify({ targetNiches: [window._ob_niche.toLowerCase()] }) });
    }
  } else if (_onboardingStep === 5) {
    if (window._ob_logoData) {
      await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify({ agencyLogo: window._ob_logoData }) });
    }
    // Mark onboarding complete
    await api('/api/settings/account', { method: 'PATCH', body: JSON.stringify({ onboardingCompleted: true }) });
  }
  _onboardingStep++;
  _renderOnboardingStep();
};

window._finishOnboarding = function() {
  closeModal();
  setView('runs');
};

// ─── Performance: debounce + API cache ───────────────────────────────────────
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const apiCache = new Map();
function cachedFetch(url, maxAge = 30000) {
  const cached = apiCache.get(url);
  if (cached && Date.now() - cached.time < maxAge) return Promise.resolve(cached.data);
  return apiJSON(url).then(data => {
    if (data) apiCache.set(url, { data, time: Date.now() });
    return data;
  });
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────
function skeletonRows(count = 5) {
  return Array.from({ length: count }, (_, i) => `
    <div class="skeleton" style="height:56px;border-radius:8px;margin-bottom:8px;width:${85 + (i % 3) * 5}%;"></div>
  `).join('');
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH 3 — UX, Admin, Portal, Extra features
// ═══════════════════════════════════════════════════════════════════════════════

// Task 2 — Empty state helper
function emptyState(icon, title, sub, actionHtml = '') {
  return `<div class="empty-state">
    <div class="empty-state-icon">${icon}</div>
    <div class="empty-state-title">${title}</div>
    <div class="empty-state-sub">${sub}</div>
    ${actionHtml ? `<div class="empty-state-action">${actionHtml}</div>` : ''}
  </div>`;
}

// Task 4 — Breadcrumb builder
function breadcrumb(items) {
  return `<div class="breadcrumb">${items.map((item, i) => {
    const isLast = i === items.length - 1;
    return isLast
      ? `<span class="breadcrumb-current">${item.label}</span>`
      : `<span class="breadcrumb-item" onclick="${item.onClick || ''}">${item.label}</span>
         <span class="breadcrumb-sep">›</span>`;
  }).join('')}</div>`;
}

// Task 5 — Global search
function globalSearchInput(val) {
  const results = document.getElementById('searchResults');
  if (!results) return;
  if (!val || val.length < 2) { results.style.display = 'none'; return; }
  const q = val.toLowerCase();
  const leads = state.leads || [];
  const hits = { leads: [], contacts: [], invoices: [] };

  leads.slice(0, 200).forEach(l => {
    const match = (l.companyName||'').toLowerCase().includes(q) ||
                  (l.contactEmail||'').toLowerCase().includes(q) ||
                  (l.location||'').toLowerCase().includes(q);
    if (match) hits.leads.push(l);
    (l.payments||[]).forEach(p => {
      if ((p.description||'').toLowerCase().includes(q)) hits.invoices.push({ ...p, leadId: l.id, companyName: l.companyName });
    });
  });

  let html = '';
  if (hits.leads.length) {
    html += `<div class="search-result-section">Leads</div>`;
    hits.leads.slice(0,5).forEach(l => {
      html += `<div class="search-result-item" onclick="closeSearchResults();openProjectPage&&openProjectPage('${l.id}')">
        <div class="search-result-icon">${l.status === 'client' ? '👤' : '🏢'}</div>
        <div><div class="search-result-main">${esc(l.companyName)}</div>
        <div class="search-result-sub">${esc(l.location||'')} · ${esc(l.status||'')}</div></div>
      </div>`;
    });
  }
  if (hits.invoices.length) {
    html += `<div class="search-result-section">Facturen</div>`;
    hits.invoices.slice(0,3).forEach(p => {
      html += `<div class="search-result-item" onclick="closeSearchResults();setView('betalingen')">
        <div class="search-result-icon">💰</div>
        <div><div class="search-result-main">${esc(p.description||'Factuur')}</div>
        <div class="search-result-sub">${esc(p.companyName)} · €${p.amount||0}</div></div>
      </div>`;
    });
  }
  if (!html) html = `<div style="padding:16px;text-align:center;font-size:13px;color:var(--text-secondary);">Geen resultaten voor "${esc(val)}"</div>`;
  results.innerHTML = html;
  results.style.display = 'block';
}

function closeSearchResults() {
  const r = document.getElementById('searchResults');
  if (r) r.style.display = 'none';
  const i = document.getElementById('globalSearch');
  if (i) i.value = '';
}

// Task 8 — Confetti on first project start
function fireConfetti() {
  if (typeof confetti !== 'function') return;
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 } });
  setTimeout(() => confetti({ particleCount: 60, angle: 60, spread: 55, origin: { x: 0 } }), 250);
  setTimeout(() => confetti({ particleCount: 60, angle: 120, spread: 55, origin: { x: 1 } }), 400);
}

// Task 9 — Show/hide overlay spinner on a container
function showSpinner(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (el.querySelector('.loading-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'loading-overlay';
  ov.innerHTML = '<div class="spinner spinner-lg"></div>';
  el.style.position = 'relative';
  el.appendChild(ov);
}
function hideSpinner(containerId) {
  document.getElementById(containerId)?.querySelector('.loading-overlay')?.remove();
}

// Task 10 — Auto-scroll to top on tab switch
function scrollToTop() { document.getElementById('content')?.scrollTo(0,0); window.scrollTo(0,0); }

// Task 15 — Pipeline drag-and-drop setup helper (uses Sortable.js loaded in index.html)
function initKanbanDrag() {
  if (typeof Sortable === 'undefined') return;
  document.querySelectorAll('.kanban-col-cards').forEach(col => {
    if (col._sortable) return;
    col._sortable = new Sortable(col, {
      group: 'kanban', animation: 150, ghostClass: 'kanban-ghost',
      onEnd(evt) {
        const leadId = evt.item?.dataset?.leadId;
        const newStatus = evt.to?.dataset?.status;
        if (!leadId || !newStatus) return;
        api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) })
          .then(() => { toast(`Lead verplaatst naar ${newStatus}`); const l = (state.leads||[]).find(x=>x.id===leadId); if(l) l.status = newStatus; });
      }
    });
  });
}

// Task 18 — Context menu
function showContextMenu(e, items) {
  e.preventDefault();
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.top = Math.min(e.clientY, window.innerHeight - 200) + 'px';
  menu.style.left = Math.min(e.clientX, window.innerWidth - 200) + 'px';
  items.forEach(item => {
    if (item === 'divider') {
      menu.insertAdjacentHTML('beforeend', '<div class="context-menu-divider"></div>');
    } else {
      const el = document.createElement('div');
      el.className = 'context-menu-item' + (item.danger ? ' danger' : '');
      el.innerHTML = `${item.icon ? '<span>' + item.icon + '</span>' : ''}<span>${esc(item.label)}</span>`;
      el.onclick = () => { menu.remove(); item.action(); };
      menu.appendChild(el);
    }
  });
  document.body.appendChild(menu);
  const close = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', close); } };
  setTimeout(() => document.addEventListener('click', close), 10);
}

// Task 47 — Auto scroll to top on setView
const _origSetView = setView;
// (setView is already defined in this file — we patch it by wrapping the existing call)
// Note: scrollToTop() is called inside renderXxx() functions that need it

// Task 48 — Confirm dialog helper (replaces confirm())
function confirmAction(msg, onConfirm, { danger = true, confirmText = 'Bevestigen', cancelText = 'Annuleren' } = {}) {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">${danger ? '⚠️ ' : ''}Bevestiging</h3>
    </div>
    <p style="margin-bottom:20px;color:var(--text-secondary);">${esc(msg)}</p>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button onclick="closeModal()" class="btn btn-secondary">${cancelText}</button>
      <button onclick="closeModal();(window._confirmCb&&window._confirmCb())" class="btn ${danger?'btn-danger':'btn-primary'}" style="${danger?'background:#ef4444;':''}">${confirmText}</button>
    </div>
  `);
  window._confirmCb = onConfirm;
}

// Task 49 — Project tab prev/next
function nextProjectTab() {
  const tabs = ['overzicht','emails','building','intake','betalingen','voorstel','contract','taken','bestanden','portaal'];
  const current = document.querySelector('.proj-tab-btn.active')?.dataset?.tab || 'overzicht';
  const idx = tabs.indexOf(current);
  if (idx < tabs.length - 1) switchProjectTab && switchProjectTab(tabs[idx + 1]);
}
function prevProjectTab() {
  const tabs = ['overzicht','emails','building','intake','betalingen','voorstel','contract','taken','bestanden','portaal'];
  const current = document.querySelector('.proj-tab-btn.active')?.dataset?.tab || 'overzicht';
  const idx = tabs.indexOf(current);
  if (idx > 0) switchProjectTab && switchProjectTab(tabs[idx - 1]);
}

// ─── Global constants used across multiple page files ────────────────────────
window.STATUS_LABELS = window.STATUS_LABELS || {
  new: 'Nieuw', inbox: 'Inbox', pending: 'In beoordeling', approved: 'Goedgekeurd',
  disapproved: 'Afgewezen', scheduled: 'Ingepland', sent: 'Verstuurd',
  replied: 'Gereageerd', client: 'Klant', dead: 'Dead',
  archived: 'Gearchiveerd', imported: 'Geïmporteerd', besteld: 'Besteld'
};
// STATUS_COLORS is used in project.js and pipeline.js — define globally so project page
// works without pipeline.js being loaded first.
window.STATUS_COLORS = window.STATUS_COLORS || {
  new: 'gray', inbox: 'blue', pending: 'amber', approved: 'green',
  disapproved: 'red', scheduled: 'purple', sent: 'blue',
  replied: 'green', client: 'green', dead: 'gray',
  archived: 'gray', imported: 'gray', besteld: 'amber'
};

// ─── Safety stubs — real implementations in page files override these ─────────
// These prevent "X is not defined" errors when a page file that defines the
// real function hasn't been lazy-loaded yet.
// Cross-page function stubs (defined in page files, may be called before that page loads)
window.triggerFindLeads       = window.triggerFindLeads       || function() {};
// These stubs must do real work so that clicks fire BEFORE project.js lazy-loads.
// project.js overwrites them with richer implementations once it loads.
window.openProjectPage = window.openProjectPage || function(id) {
  if (id) state.currentLeadId = id;
  setView('project');
};
window.openLeadDetail = window.openLeadDetail || function(id) {
  if (!id) return;
  state.currentLeadId = id;
  if (document.getElementById('detailPanel')) {
    // On leads page — load project.js then let the real impl open the panel
    loadPage('project').then(function() {
      if (window.openLeadDetail) window.openLeadDetail(id);
    });
  } else {
    // Elsewhere — just open the project page
    setView('project');
  }
};
window.buildAllServicesForLead= window.buildAllServicesForLead|| function() {};
window.startProject           = window.startProject           || function() {};
window.createPayment          = window.createPayment          || function() {};
window.sendClientEmail        = window.sendClientEmail        || function() {};
window.generateDeliveryEmail  = window.generateDeliveryEmail  || function() {};
window.generateSite           = window.generateSite           || function() {};
window.setSiteStatus          = window.setSiteStatus          || function() {};
window.resendWelcomeEmail     = window.resendWelcomeEmail     || function() {};
window.switchDetailTab        = window.switchDetailTab        || function() {};
window.switchProjectTab       = window.switchProjectTab       || function() {};
window.switchPipelineView     = window.switchPipelineView     || function() {};
window.sendContractEmail      = window.sendContractEmail      || function() {};
window.sendProposalEmail      = window.sendProposalEmail      || function() {};
window.sendDeliveryEmail      = window.sendDeliveryEmail      || function() {};
window.sendAdminInstructions  = window.sendAdminInstructions  || function() {};
window.sendWeeklyUpdate       = window.sendWeeklyUpdate       || function() {};
window.selectSubject          = window.selectSubject          || function() {};
window.selectVersion          = window.selectVersion          || function() {};
window.toggleDeliverableChat  = window.toggleDeliverableChat  || function() {};
window.copyText               = window.copyText               || function() {};
window.triggerReplyCheck      = window.triggerReplyCheck      || function() {};
window.loadBackupList         = window.loadBackupList         || function() {};
window.updateSidebarLogo      = window.updateSidebarLogo      || function() {};
window.updateInboxBadge     = window.updateInboxBadge     || function() {};
window.startInboxCountdown  = window.startInboxCountdown  || function() {};
window.stopRunProgressPoll  = window.stopRunProgressPoll  || function() {};
window.startRunProgressPoll = window.startRunProgressPoll || function() {};
window.fireConfetti         = window.fireConfetti         || function() {};
window.initKanbanDrag       = window.initKanbanDrag       || function() {};
window.renderKanban         = window.renderKanban         || function() {};
window.getNextRunTime       = window.getNextRunTime       || function() { return { label: '—', countdown: '—', target: null }; };
window.startCountdown       = window.startCountdown       || function() {};
window.generateUpsellEmail      = window.generateUpsellEmail      || function() {};
window.sendUpsellEmail          = window.sendUpsellEmail          || function() {};
window.openRetryEmailSection    = window.openRetryEmailSection    || function() {};
window.submitRetryEmail         = window.submitRetryEmail         || function() {};
window.loadCostStats            = window.loadCostStats            || function() {};
window.approveEmail             = window.approveEmail             || function() {};
window.rejectEmail              = window.rejectEmail              || function() {};
window.buildBuildingTab         = window.buildBuildingTab         || function() {};
window.approveDeliverable       = window.approveDeliverable       || function() {};
window.deleteDeliverable        = window.deleteDeliverable        || function() {};
window.openCombineModal         = window.openCombineModal         || function() {};
window.renderProjectPage        = window.renderProjectPage        || function() {};
window.switchSettingsTab        = window.switchSettingsTab        || function() {};
window.testImapConnection       = window.testImapConnection       || function() {};
window.generateWebhookToken     = window.generateWebhookToken     || function() {};
window.saveWeeklyUpdatesSetting = window.saveWeeklyUpdatesSetting || function() {};
window.triggerBackup            = window.triggerBackup            || function() {};
window.resetAbMemory            = window.resetAbMemory            || function() {};
window.startCustomRun           = window.startCustomRun           || function() {};
window.analyzeCustomCompany     = window.analyzeCustomCompany     || function() {};
window.loadTemplates            = window.loadTemplates            || function() {};
window.saveTemplate             = window.saveTemplate             || function() {};
window.runTemplate              = window.runTemplate              || function() {};
window.deleteRunTemplate        = window.deleteRunTemplate        || function() {};
