// ─── Theme: apply before render to avoid flash ───────────────────────────────
(function () {
  const t = localStorage.getItem('theme') ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
})();

// ─── Auth guard — runs immediately, blocks page until verified ────────────────
(async function checkAuth() {
  const token = localStorage.getItem('agencyToken');
  if (!token) { window.location.href = '/login'; return; }
  try {
    const res = await fetch('/api/auth/verify', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    if (!data.valid) { localStorage.clear(); window.location.href = '/login'; return; }
  } catch {
    // Server unreachable — allow offline PWA use
  }
  await initSharedUI();
})();

// ─── Load sidebar + topbar, wire up controls ─────────────────────────────────
async function initSharedUI() {
  await Promise.all([loadSidebar(), loadTopbar()]);
  _startClock();
  _loadNotifCount();
  setInterval(_loadNotifCount, 30000);
  // Signal page JS that shared UI is ready
  document.dispatchEvent(new Event('sharedUIReady'));
}

async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  sidebar.innerHTML = await fetch('/app/shared/sidebar.html').then(r => r.text());

  // Mark active nav item by matching current path segment
  const page = window.location.pathname.replace(/^\/app\/?/, '').split('/')[0] || 'dashboard';
  sidebar.querySelectorAll('.nav-item[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });

  // Hide admin-only items for non-admin users
  if (!isAdmin()) {
    sidebar.querySelectorAll('[data-admin-only]').forEach(el => el.style.display = 'none');
  }

  // Fill user info
  const name = localStorage.getItem('agencyName') || 'Admin';
  const role = localStorage.getItem('agencyRole') || 'admin';
  const el = id => sidebar.querySelector('#' + id);
  if (el('userAvatar')) el('userAvatar').textContent = name.charAt(0).toUpperCase();
  if (el('userName'))   el('userName').textContent   = name;
  if (el('userRole'))   el('userRole').textContent   = role === 'admin' ? 'Admin' : 'Medewerker';

  // Theme toggle
  const themeBtn = el('themeBtn');
  if (themeBtn) {
    _applyThemeIcon(themeBtn);
    themeBtn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
      _applyThemeIcon(themeBtn);
    });
  }

  // Logout
  const logoutBtn = el('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // Notification bell
  const notifBtn = el('notifBtn');
  if (notifBtn) notifBtn.addEventListener('click', openNotificationPanel);

  // Logo from settings (best-effort)
  apiJSON('/api/public-config').then(cfg => {
    if (!cfg) return;
    const nameEl = document.getElementById('sidebarLogoName');
    if (nameEl && cfg.agencyName) nameEl.textContent = cfg.agencyName;
    if (cfg.agencyLogo) {
      const iconEl = document.getElementById('sidebarLogoIcon');
      if (iconEl) iconEl.innerHTML = `<img src="/api/logo" alt="logo" style="height:28px;width:28px;object-fit:contain;border-radius:6px;">`;
    }
  }).catch(() => {});
}

async function loadTopbar() {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;
  topbar.innerHTML = await fetch('/app/shared/topbar.html').then(r => r.text());
  // Set page label from document title (strip " — Agency AI" suffix if present)
  const pageLabel = document.title.replace(/\s*[—–-]\s*Agency AI\s*$/, '') || 'Dashboard';
  const pageEl = topbar.querySelector('#topbarPage');
  if (pageEl) pageEl.textContent = pageLabel;
}

// ─── Notification badge ───────────────────────────────────────────────────────
async function _loadNotifCount() {
  try {
    const data = await apiJSON('/api/notifications');
    if (!data) return;
    const count = data.unreadCount || 0;
    ['notifBadge', 'notifBadgeMobile'].forEach(id => {
      const b = document.getElementById(id);
      if (!b) return;
      b.textContent = count;
      b.style.display = count > 0 ? 'flex' : 'none';
    });
    // Inbox badge
    const inboxBadge = document.getElementById('inboxBadge');
    const inboxBadgeMobile = document.getElementById('inboxBadgeMobile');
    const pending = (data.notifications || []).filter(n => n.type === 'run_complete').length;
    [inboxBadge, inboxBadgeMobile].forEach(b => {
      if (!b) return;
      // Handled by each page on load — just ensure badge container is wired
    });
  } catch {}
}

// ─── Notification panel (simple overlay) ─────────────────────────────────────
async function openNotificationPanel() {
  const data = await apiJSON('/api/notifications');
  if (!data) return;
  const notifs = (data.notifications || []).slice(0, 20);

  const ICONS = {
    reply_received:  { icon: 'ti-mail-opened', color: '#16a34a' },
    intake_submitted:{ icon: 'ti-clipboard-check', color: '#2563eb' },
    run_complete:    { icon: 'ti-player-play', color: '#7c3aed' },
    payment_received:{ icon: 'ti-circle-check', color: '#16a34a' },
    payment_overdue: { icon: 'ti-alert-circle', color: '#dc2626' },
    client_question: { icon: 'ti-message-2', color: '#7c3aed' },
    contact_form:    { icon: 'ti-forms', color: '#2563eb' },
    email_bounced:   { icon: 'ti-mail-off', color: '#dc2626' },
    calendly_booking:{ icon: 'ti-calendar-event', color: '#006bff' }
  };

  const itemsHtml = notifs.length
    ? notifs.map(n => {
        const ic = ICONS[n.type] || { icon: 'ti-bell', color: '#6b7280' };
        return `
          <div style="display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #f3f4f6;cursor:pointer;${!n.readAt ? 'background:rgba(99,102,241,0.04)' : ''}"
               onclick="handleNotifClick('${esc(n.id)}','${esc(n.link || '')}')">
            <div style="width:34px;height:34px;border-radius:8px;background:${ic.color}18;display:flex;align-items:center;justify-content:center;flex-shrink:0">
              <i class="ti ${ic.icon}" style="color:${ic.color};font-size:16px"></i>
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-size:13px;font-weight:600;color:#1a1a1a">${esc(n.title || '')}</div>
              <div style="font-size:12px;color:#6b7280;margin-top:2px">${esc(n.body || '')}</div>
              <div style="font-size:11px;color:#9ca3af;margin-top:4px">${relativeTime(n.createdAt)}</div>
            </div>
            ${!n.readAt ? '<div style="width:7px;height:7px;border-radius:50%;background:#2563eb;flex-shrink:0;margin-top:4px"></div>' : ''}
          </div>`;
      }).join('')
    : `<div style="text-align:center;padding:40px 20px;color:#9ca3af">
        <div style="font-size:28px;margin-bottom:8px">🔔</div>
        <div style="font-size:14px">Geen meldingen</div>
       </div>`;

  openModal(`
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #e5e7eb">
      <strong style="font-size:15px">Meldingen</strong>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-ghost btn-sm" onclick="markAllNotifsRead()">Alles gelezen</button>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
    </div>
    <div style="max-height:60vh;overflow-y:auto">${itemsHtml}</div>
  `);
}

window.markAllNotifsRead = async function() {
  await apiJSON('/api/notifications/read-all', { method: 'POST' });
  closeModal();
  _loadNotifCount();
};

window.handleNotifClick = async function(id, link) {
  await apiJSON(`/api/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  closeModal();
  _loadNotifCount();
  if (!link) return;
  if (link.startsWith('project:')) {
    const leadId = link.replace('project:', '');
    window.location.href = `/app/leads?project=${leadId}`;
  } else {
    window.location.href = `/app/${link}`;
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _startClock() {
  const tick = () => {
    const el = document.getElementById('topbarTime');
    if (el) el.textContent = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  };
  tick();
  setInterval(tick, 60000);
}

function _applyThemeIcon(btn) {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  btn.innerHTML = `<i class="ti ti-${isDark ? 'sun' : 'moon'}"></i>`;
}
