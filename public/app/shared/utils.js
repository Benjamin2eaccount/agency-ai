// ─── HTML escaping ────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function relativeTime(iso) {
  const t = new Date(iso || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return '—';
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1)  return 'zojuist';
  if (m < 60) return `${m} min geleden`;
  if (h < 24) return `${h} uur geleden`;
  return `${d} dag${d !== 1 ? 'en' : ''} geleden`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatOptimalTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const days = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];
  return `${days[d.getDay()]} om ${String(d.getHours()).padStart(2,'0')}:00`;
}

// ─── Clipboard ────────────────────────────────────────────────────────────────
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text)
    .then(() => toast(successMsg || 'Gekopieerd!'))
    .catch(() => toast('Kopiëren mislukt', 'error'));
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.innerHTML = `
    <i class="ti ti-${type === 'success' ? 'check' : type === 'error' ? 'x' : 'info-circle'}"></i>
    <span>${msg}</span>
  `;
  container.appendChild(t);
  setTimeout(() => t.classList.add('visible'), 10);
  setTimeout(() => { t.classList.remove('visible'); setTimeout(() => t.remove(), 300); }, 3500);
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function openModal(html) {
  const container = document.getElementById('modalContainer');
  if (!container) return;
  container.innerHTML = `
    <div class="modal-backdrop" id="modalBackdrop">
      <div class="modal-box">${html}</div>
    </div>
  `;
  setTimeout(() => container.querySelector('.modal-backdrop').classList.add('visible'), 10);
  container.querySelector('.modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'modalBackdrop') closeModal();
  });
}

function closeModal() {
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop) {
    backdrop.classList.remove('visible');
    setTimeout(() => { const c = document.getElementById('modalContainer'); if (c) c.innerHTML = ''; }, 200);
  }
}

// ─── Status maps ──────────────────────────────────────────────────────────────
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
  scheduled: 'amber', followup1: 'amber', followup2: 'orange',
  replied: 'green', meeting: 'purple', client: 'dark-green',
  disapproved: 'red', dead: 'gray', bounced: 'red', delivery_delayed: 'orange'
};

const KANBAN_COLS = [
  { key: 'inbox',       label: 'Inbox',        statuses: ['inbox','pending','new'] },
  { key: 'approved',    label: 'Goedgekeurd',   statuses: ['approved','auto-approved','scheduled'] },
  { key: 'sent',        label: 'Verstuurd',     statuses: ['sent','followup1','followup2'] },
  { key: 'replied',     label: 'Gereageerd',    statuses: ['replied','meeting'] },
  { key: 'client',      label: 'Klant',         statuses: ['client'] },
  { key: 'dead',        label: 'Dead',          statuses: ['dead','disapproved','bounced'] }
];
