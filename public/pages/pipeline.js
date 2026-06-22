// ─── Pipeline tracker ─────────────────────────────────────────────────────────

window.STATUS_LABELS = Object.assign(window.STATUS_LABELS || {}, {
  inbox: 'Inbox', approved: 'Goedgekeurd', sent: 'Verstuurd',
  'auto-approved': 'Auto-goedgekeurd', scheduled: 'Ingepland',
  followup1: 'Follow-up 1', followup2: 'Follow-up 2',
  replied: 'Gereageerd', meeting: 'Afspraak',
  client: 'Klant ✓', disapproved: 'Afgewezen', dead: 'Inactief',
  bounced: 'Niet aangekomen', delivery_delayed: 'Vertraagd'
});
const STATUS_LABELS = window.STATUS_LABELS;

window.STATUS_COLORS = Object.assign(window.STATUS_COLORS || {}, {
  inbox: 'gray', approved: 'blue', sent: 'indigo', 'auto-approved': 'indigo',
  scheduled: 'amber',
  followup1: 'amber', followup2: 'orange', replied: 'green',
  meeting: 'purple', client: 'dark-green', disapproved: 'red', dead: 'gray',
  bounced: 'red', delivery_delayed: 'orange'
});
const STATUS_COLORS = window.STATUS_COLORS;

const PIPELINE_GROUPS = [
  { key: 'replied',     label: 'Gereageerd',      dot: '#d97706', statuses: ['replied'],                                              defaultOpen: true },
  { key: 'client',      label: 'Klant',            dot: '#7c3aed', statuses: ['client'],                                              defaultOpen: true },
  { key: 'sent',        label: 'Verstuurd',        dot: '#16a34a', statuses: ['sent','followup1','followup2','scheduled','auto-approved'] },
  { key: 'inbox',       label: 'Inbox / wacht',    dot: '#2563eb', statuses: ['inbox','pending','new','approved'] },
  { key: 'bounced',     label: 'Niet aangekomen',  dot: '#dc2626', statuses: ['bounced','delivery_delayed'] },
  { key: 'disapproved', label: 'Afgekeurd',        dot: '#6b7280', statuses: ['disapproved'] },
  { key: 'dead',        label: 'Inactief',          dot: '#9b9b98', statuses: ['dead'] }
];

function _plHealth(l) {
  const hasOverdue = (l.payments||[]).some(p => p.status !== 'paid' && p.dueDate && new Date(p.dueDate) < new Date());
  if (hasOverdue) return { label: 'Kritiek', color: '#DC2626', dotClass: 'pl-dot-red' };
  if (l.projectStartedAt && !l.intakeSubmittedAt) return { label: 'Aandacht', color: '#D97706', dotClass: 'pl-dot-yellow' };
  return { label: 'Gezond', color: '#16A34A', dotClass: 'pl-dot-green' };
}

async function renderPipeline() {
  document.getElementById('appView').innerHTML = `
    <style>
      .pl-header{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:16px}
      .pl-page-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-3,#666)}
      .pl-page-title{font-size:22px;font-weight:700;color:var(--text,#F5F5F5);margin:2px 0 0}
      .pl-page-sub{font-size:14px;color:var(--text-2,#999);margin-top:3px}
      .pl-header-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .pl-view-toggle{display:flex;background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:7px;padding:3px;gap:2px}
      .pl-view-btn{padding:5px 12px;border-radius:5px;font-size:12px;font-weight:500;color:var(--text-2,#999);background:transparent;border:none;cursor:pointer;transition:all .15s}
      .pl-view-btn.active{background:var(--accent,#2563EB);color:#fff}
      .pl-view-btn:not(.active):hover{color:var(--text,#F5F5F5)}
      .pl-filter-bar{display:flex;align-items:center;gap:12px;background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:10px 16px;margin-bottom:20px;flex-wrap:wrap}
      .pl-search-wrap{flex:1;min-width:180px;display:flex;align-items:center;gap:8px;background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:0 12px}
      .pl-search-wrap i{color:var(--text-3,#666);font-size:14px}
      .pl-search{background:transparent;border:none;outline:none;font-size:13px;color:var(--text,#F5F5F5);padding:7px 0;width:100%}
      .pl-search::placeholder{color:var(--text-3,#666)}
      .pl-chips{display:flex;gap:6px;flex-wrap:wrap}
      .pl-chip{padding:5px 11px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--border,#2A2A2A);background:var(--surface-2,#222);color:var(--text-2,#999);transition:all .15s;white-space:nowrap}
      .pl-chip:hover{color:var(--text,#F5F5F5);border-color:var(--border-strong,#333)}
      .pl-chip.active{background:var(--accent,#2563EB);border-color:var(--accent,#2563EB);color:#fff}
      .pl-sort-btn{padding:5px 12px;font-size:12px;font-weight:500;color:var(--text-2,#999);background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:6px;cursor:pointer;white-space:nowrap}
      .pl-sort-btn:hover{color:var(--text,#F5F5F5)}
      /* Kanban */
      .pl-kanban{display:flex;gap:16px;overflow-x:auto;padding-bottom:16px;min-height:480px}
      .pl-kanban::-webkit-scrollbar{height:6px}
      .pl-kanban::-webkit-scrollbar-track{background:var(--surface,#1A1A1A)}
      .pl-kanban::-webkit-scrollbar-thumb{background:var(--border-strong,#333);border-radius:3px}
      .pl-col{width:280px;flex-shrink:0;display:flex;flex-direction:column}
      .pl-col-head{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px 8px 0 0;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;border-top-width:3px}
      .pl-col-head-left{display:flex;align-items:center;gap:8px}
      .pl-col-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
      .pl-col-label{font-size:13px;font-weight:600;color:var(--text,#F5F5F5)}
      .pl-col-count{background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600;color:var(--text-2,#999)}
      .pl-col-add{width:24px;height:24px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text-3,#666);background:transparent;border:none;cursor:pointer;transition:all .15s;line-height:1}
      .pl-col-add:hover{background:var(--surface-2,#222);color:var(--text,#F5F5F5)}
      .pl-col-body{background:var(--bg,#0F0F0F);border:1px solid var(--border,#2A2A2A);border-top:none;border-radius:0 0 8px 8px;padding:8px;min-height:400px;flex:1;overflow-y:auto}
      .pl-col-body::-webkit-scrollbar{width:4px}
      .pl-col-body::-webkit-scrollbar-thumb{background:var(--border-strong,#333);border-radius:2px}
      .pl-col-body.drag-over{background:rgba(37,99,235,.05);border-color:var(--accent,#2563EB)!important;border-style:dashed!important}
      .pl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:32px 16px;border:1px dashed var(--border-strong,#333);border-radius:6px;margin:8px 0;color:var(--text-3,#666);font-size:13px;text-align:center}
      .pl-empty i{font-size:22px}
      /* Cards */
      .pl-card{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:14px 16px 14px 22px;margin-bottom:8px;cursor:pointer;transition:all 150ms;position:relative}
      .pl-card:hover{border-color:var(--border-strong,#333);transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.3)}
      .pl-card.dragging{opacity:.4;transform:rotate(2deg) scale(1.02);cursor:grabbing}
      .pl-drag-handle{position:absolute;left:6px;top:50%;transform:translateY(-50%);color:var(--text-3,#666);font-size:13px;opacity:0;cursor:grab;line-height:1}
      .pl-card:hover .pl-drag-handle{opacity:1}
      .pl-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px}
      .pl-card-name{font-size:14px;font-weight:600;color:var(--text,#F5F5F5);line-height:1.3;flex:1;min-width:0;word-break:break-word}
      .pl-card-health{display:flex;align-items:center;gap:4px;font-size:11px;font-weight:500;flex-shrink:0}
      .pl-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
      .pl-dot-green{background:#16A34A}
      .pl-dot-yellow{background:#D97706}
      .pl-dot-red{background:#DC2626}
      .pl-card-chips{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px}
      .pl-chip-sm{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:500;background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);color:var(--text-2,#999);white-space:nowrap}
      .pl-phase-bar{width:100%;height:3px;background:var(--border,#2A2A2A);border-radius:2px;margin-bottom:10px;overflow:hidden}
      .pl-phase-fill{height:100%;border-radius:2px;transition:width .3s}
      .pl-card-footer{display:flex;align-items:center;justify-content:space-between}
      .pl-avatar{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#fff;flex-shrink:0;background:var(--accent,#2563EB)}
      .pl-card-date{font-size:11px;color:var(--text-3,#666);margin-left:6px}
      .pl-card-invoice{font-size:11px;font-weight:600;color:#D97706}
      .pl-unread-dot{width:7px;height:7px;border-radius:50%;background:var(--accent,#2563EB);flex-shrink:0}
      .pl-more-btn{width:100%;padding:8px;font-size:12px;color:var(--text-2,#999);background:transparent;border:1px dashed var(--border,#2A2A2A);border-radius:6px;cursor:pointer;margin-top:4px;transition:all .15s}
      .pl-more-btn:hover{border-color:var(--border-strong,#333);color:var(--text,#F5F5F5)}
      /* Stats bar */
      .pl-stats-bar{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:16px 24px;margin-top:20px;display:flex;align-items:stretch;gap:0;flex-wrap:wrap}
      .pl-stat-phase{flex:1;min-width:100px;padding:0 16px;border-right:1px solid var(--border,#2A2A2A);display:flex;flex-direction:column;gap:5px}
      .pl-stat-phase:first-child{padding-left:0}
      .pl-stat-phase:last-child{border-right:none}
      .pl-stat-phase-row{display:flex;align-items:center;justify-content:space-between}
      .pl-stat-phase-name{font-size:11px;font-weight:600;color:var(--text-2,#999);text-transform:uppercase;letter-spacing:.4px}
      .pl-stat-phase-count{font-size:20px;font-weight:700;color:var(--text,#F5F5F5)}
      .pl-stat-bar{height:3px;border-radius:2px;background:var(--border,#2A2A2A);overflow:hidden}
      .pl-stat-bar-fill{height:100%;border-radius:2px}
      .pl-stat-val{font-size:11px;color:var(--text-3,#666)}
      .pl-stats-total{margin-left:auto;padding-left:24px;text-align:right;flex-shrink:0;display:flex;flex-direction:column;justify-content:center;gap:2px}
      .pl-stats-total-num{font-size:20px;font-weight:700;color:var(--text,#F5F5F5)}
      .pl-stats-total-lbl{font-size:11px;color:var(--text-3,#666)}
      /* Table */
      .pl-summary{display:flex;align-items:center;background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:14px 20px;margin-bottom:14px;flex-wrap:wrap;gap:4px}
      .pl-sum-item{display:flex;align-items:center;gap:6px;cursor:pointer;padding:4px 10px;border-radius:6px;transition:background .15s}
      .pl-sum-item:hover{background:var(--surface-2,#222)}
      .pl-sum-num{font-size:20px;font-weight:700;color:var(--text,#F5F5F5)}
      .pl-sum-num.green{color:#16A34A}
      .pl-sum-num.purple{color:#7C3AED}
      .pl-sum-num.red{color:#DC2626}
      .pl-sum-lbl{font-size:12px;color:var(--text-2,#999)}
      .pl-sum-sep{width:1px;height:28px;background:var(--border,#2A2A2A);margin:0 4px;flex-shrink:0}
      .pl-tab-bar{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
      .pl-tab{padding:6px 14px;border-radius:20px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--border,#2A2A2A);background:var(--surface,#1A1A1A);color:var(--text-2,#999);transition:all .15s;white-space:nowrap}
      .pl-tab:hover{color:var(--text,#F5F5F5);border-color:var(--border-strong,#333)}
      .pl-tab.active{background:var(--accent,#2563EB);border-color:var(--accent,#2563EB);color:#fff}
      /* Status groups */
      .pl-group{margin-bottom:8px;border:1px solid var(--border,#2A2A2A);border-radius:8px;overflow:hidden}
      .pl-group-head{display:flex;align-items:center;gap:10px;padding:12px 16px;cursor:pointer;background:var(--surface,#1A1A1A);transition:background .15s;user-select:none}
      .pl-group-head:hover{background:var(--surface-2,#222)}
      .pl-group-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
      .pl-group-label{font-size:13px;font-weight:600;color:var(--text,#F5F5F5)}
      .pl-group-count{font-size:12px;color:var(--text-2,#999);background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:10px;padding:1px 8px}
      .pl-group-val{font-size:12px;font-weight:600;color:#16A34A;margin-left:auto}
      .pl-group-chevron{color:var(--text-3,#666);transition:transform .2s;font-size:14px}
      .pl-group-head.open .pl-group-chevron{transform:rotate(90deg)}
      .pl-group-body{display:none;background:var(--bg,#0F0F0F)}
      .pl-group-body.open{display:block}
      .pl-group-empty{padding:16px;text-align:center;font-size:13px;color:var(--text-3,#666)}
      .pl-table-wrap{overflow-x:auto}
      .pl-table{width:100%;border-collapse:collapse;min-width:700px}
      .pl-table th{padding:10px 16px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-3,#666);background:var(--surface-2,#222);border-bottom:1px solid var(--border,#2A2A2A);white-space:nowrap}
      .pl-table td{padding:14px 16px;border-bottom:1px solid var(--border,#2A2A2A);vertical-align:middle}
      .pl-table tr:last-child td{border-bottom:none}
      .pl-table tr.leads-row:hover td{background:rgba(255,255,255,.02);cursor:pointer}
      @media(max-width:768px){
        .pl-kanban{display:none!important}
        .pl-view-btn[data-view="kanban"]{opacity:.4;pointer-events:none}
        .pl-filter-bar{gap:8px}
        .pl-chips{overflow-x:auto;flex-wrap:nowrap;padding-bottom:2px}
        .pl-stats-bar{flex-direction:column;gap:12px}
        .pl-stat-phase{border-right:none;border-bottom:1px solid var(--border,#2A2A2A);padding:0 0 12px}
        .pl-stat-phase:last-child{border-bottom:none;padding-bottom:0}
        .pl-stats-total{margin-left:0;padding-left:0;text-align:left}
      }
    </style>

    <div class="pl-header">
      <div>
        <div class="pl-page-label">Klanten</div>
        <h1 class="pl-page-title">Pipeline</h1>
        <p class="pl-page-sub" id="plSubtitle">Laden...</p>
      </div>
      <div class="pl-header-right">
        <div class="pl-view-toggle">
          <button class="pl-view-btn" data-view="kanban" id="kanbanViewBtn" onclick="switchPipelineView('kanban')">
            <i class="ti ti-layout-board"></i> Kanban
          </button>
          <button class="pl-view-btn" data-view="table" id="tableViewBtn" onclick="switchPipelineView('table')">
            <i class="ti ti-list"></i> Lijst
          </button>
        </div>
        <button class="btn btn-primary btn-sm" onclick="setView('inbox')">
          <i class="ti ti-plus"></i> Nieuw project
        </button>
      </div>
    </div>

    <div class="pl-filter-bar">
      <div class="pl-search-wrap">
        <i class="ti ti-search"></i>
        <input class="pl-search" id="plSearch" placeholder="Zoek op klant of bedrijf..." type="search">
      </div>
      <div class="pl-chips" id="plPhaseChips">
        <button class="pl-chip active" data-phase="all">Alle fasen</button>
        <button class="pl-chip" data-phase="inbox">Inbox</button>
        <button class="pl-chip" data-phase="approved">Gekwalif.</button>
        <button class="pl-chip" data-phase="sent">Verstuurd</button>
        <button class="pl-chip" data-phase="replied">Gereageerd</button>
        <button class="pl-chip" data-phase="client">Klant</button>
      </div>
      <button class="pl-sort-btn">Datum ▾</button>
    </div>

    <div id="pipelineLayout">
      <div id="pipelineContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
    </div>
  `;

  const leads = await apiJSON('/api/leads') || [];
  state.leads = leads;

  const container = document.getElementById('pipelineContent');
  if (!container) return;

  const activeCount = leads.filter(l => l.status === 'client').length;
  const subtitleEl = document.getElementById('plSubtitle');
  if (subtitleEl) subtitleEl.textContent = `${activeCount} actieve projecten`;

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-git-branch"></i>
        <h3>Geen leads gevonden</h3>
        <p>Run de lead finder om leads toe te voegen</p>
        <button class="btn btn-primary" onclick="setView('dashboard')">
          <i class="ti ti-player-play"></i> Naar dashboard
        </button>
      </div>`;
    return;
  }

  let _pipelineView = localStorage.getItem('pipelineView') || 'kanban';
  if (window.innerWidth <= 768) _pipelineView = 'table';

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

  document.getElementById('kanbanViewBtn')?.classList.toggle('active', _pipelineView === 'kanban');
  document.getElementById('tableViewBtn')?.classList.toggle('active', _pipelineView === 'table');

  // Phase chip filter
  let _activePhase = 'all';
  const _filterByPhase = l => {
    if (_activePhase === 'all') return true;
    if (_activePhase === 'sent') return ['sent','followup1','followup2','scheduled','auto-approved'].includes(l.status);
    if (_activePhase === 'approved') return ['approved','auto-approved'].includes(l.status);
    return (l.status || 'inbox') === _activePhase;
  };
  document.querySelectorAll('.pl-chip[data-phase]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.pl-chip[data-phase]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _activePhase = chip.dataset.phase;
      const filtered = state.leads.filter(_filterByPhase);
      if (_pipelineView === 'kanban') renderKanban(filtered, container);
      else renderPipelineTable(filtered, container);
    });
  });

  // Search
  document.getElementById('plSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    const filtered = state.leads.filter(l =>
      _filterByPhase(l) && (!q ||
        (l.companyName || '').toLowerCase().includes(q) ||
        (l.contactName || '').toLowerCase().includes(q) ||
        (l.location || '').toLowerCase().includes(q))
    );
    if (_pipelineView === 'kanban') renderKanban(filtered, container);
    else renderPipelineTable(filtered, container);
  });

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
  { key: 'dead',     label: 'Inactief',          color: '#9b9b98', statuses: ['dead', 'disapproved'] }
];

function buildKanbanCard(l) {
  const health   = _plHealth(l);
  const initials = (l.contactName || l.companyName || '?').split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
  const services = Array.isArray(l.services) ? l.services.map(s => typeof s === 'string' ? s : (s.name || '')).filter(Boolean) : [];
  const phase    = l.currentPhase || 0;
  const phaseColors = ['#7C3AED','#2563EB','#D97706','#16A34A','#0891B2'];
  const phaseColor  = phaseColors[(phase - 1)] || '#2563EB';
  const phasePct    = phase > 0 ? Math.round((phase / 5) * 100) : 0;
  const hasUnread   = (l.clientMessages || []).some(m => !m.read);
  const openInvoice = (l.payments || []).find(p => p.status !== 'paid' && p.amount);
  const date        = l.projectStartedAt || l.sentAt || l.createdAt;
  const dateStr     = date ? new Date(date).toLocaleDateString('nl-NL', { day: '2-digit', month: 'short' }) : '';

  const chips = services.length > 0
    ? services.slice(0, 2).map(s => `<span class="pl-chip-sm">${esc(s)}</span>`).join('') +
      (services.length > 2 ? `<span class="pl-chip-sm">+${services.length - 2}</span>` : '')
    : l.niche ? `<span class="pl-chip-sm">${esc(l.niche)}</span>` : '';

  return `
    <div class="pl-card" data-id="${l.id}" draggable="true">
      <span class="pl-drag-handle">⠿</span>
      <div class="pl-card-top">
        <div class="pl-card-name">${esc(l.companyName || '—')}</div>
        <div class="pl-card-health">
          <span class="pl-dot ${health.dotClass}"></span>
          <span style="color:${health.color};font-size:11px">${health.label}</span>
        </div>
      </div>
      ${chips ? `<div class="pl-card-chips">${chips}</div>` : ''}
      ${phasePct > 0 ? `<div class="pl-phase-bar"><div class="pl-phase-fill" style="width:${phasePct}%;background:${phaseColor}"></div></div>` : ''}
      <div class="pl-card-footer">
        <div style="display:flex;align-items:center">
          <div class="pl-avatar">${esc(initials)}</div>
          ${dateStr ? `<span class="pl-card-date">${dateStr}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${openInvoice ? `<span class="pl-card-invoice">€${Number(openInvoice.amount).toLocaleString('nl-NL')} openstaand</span>` : ''}
          ${hasUnread ? `<span class="pl-unread-dot" title="Ongelezen berichten"></span>` : ''}
        </div>
      </div>
    </div>`;
}

function renderKanban(leads, container) {
  if (!container) return;
  const KANBAN_PAGE_SIZE = 10;
  const colLeads = {};
  KANBAN_COLS.forEach(col => {
    colLeads[col.key] = leads.filter(l => col.statuses.includes(l.status || 'inbox'));
  });
  if (!window._kanbanExpanded) window._kanbanExpanded = {};

  function buildColHTML(col) {
    const all      = colLeads[col.key];
    const expanded = window._kanbanExpanded[col.key];
    const visible  = expanded ? all : all.slice(0, KANBAN_PAGE_SIZE);
    const hidden   = all.length - visible.length;
    return `
      <div class="pl-col" data-col-key="${col.key}" data-drop-status="${col.key}">
        <div class="pl-col-head" style="border-top-color:${col.color}">
          <div class="pl-col-head-left">
            <span class="pl-col-dot" style="background:${col.color}"></span>
            <span class="pl-col-label">${col.label}</span>
            <span class="pl-col-count">${all.length}</span>
          </div>
          <button class="pl-col-add" title="Nieuw" onclick="setView('inbox')">+</button>
        </div>
        <div class="pl-col-body" data-drop-status="${col.key}">
          ${visible.length
            ? visible.map(l => buildKanbanCard(l)).join('')
            : `<div class="pl-empty"><i class="ti ti-inbox"></i>Geen projecten</div>`}
          ${hidden > 0 ? `<button class="pl-more-btn kanban-more-btn" data-col="${col.key}">+ ${hidden} meer</button>` : ''}
        </div>
      </div>`;
  }

  const totalLeads = leads.length;
  const totalVal   = leads.filter(l => (l.estimatedValue||0) > 0).reduce((s,l) => s + l.estimatedValue, 0);
  const maxCount   = Math.max(...KANBAN_COLS.map(c => colLeads[c.key].length), 1);

  container.innerHTML = `
    <div class="pl-kanban" id="kanbanBoard">
      ${KANBAN_COLS.map(col => buildColHTML(col)).join('')}
    </div>
    <div class="pl-stats-bar">
      ${KANBAN_COLS.map(col => {
        const cnt = colLeads[col.key].length;
        const val = colLeads[col.key].filter(l => (l.estimatedValue||0) > 0).reduce((s,l) => s + l.estimatedValue, 0);
        const pct = Math.round((cnt / maxCount) * 100);
        return `<div class="pl-stat-phase">
          <div class="pl-stat-phase-row">
            <span class="pl-stat-phase-name">${col.label}</span>
            <span class="pl-stat-phase-count" style="color:${col.color}">${cnt}</span>
          </div>
          <div class="pl-stat-bar"><div class="pl-stat-bar-fill" style="width:${pct}%;background:${col.color}"></div></div>
          <span class="pl-stat-val">${val > 0 ? '€' + (val >= 1000 ? (val/1000).toFixed(0)+'K' : val) : '—'}</span>
        </div>`;
      }).join('')}
      <div class="pl-stats-total">
        <div class="pl-stats-total-num">${totalLeads} leads</div>
        ${totalVal > 0 ? `<div class="pl-stats-total-num">€${totalVal >= 1000 ? (totalVal/1000).toFixed(0)+'K' : totalVal}</div><div class="pl-stats-total-lbl">pipeline waarde</div>` : ''}
      </div>
    </div>`;

  document.querySelectorAll('.pl-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openProjectPage(card.dataset.id));
  });

  document.querySelectorAll('.kanban-more-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      window._kanbanExpanded[btn.dataset.col] = true;
      renderKanban(state.leads, container);
    });
  });

  document.querySelectorAll('.pl-col-body').forEach(body => {
    body.addEventListener('dragover', e => { e.preventDefault(); body.classList.add('drag-over'); });
    body.addEventListener('dragleave', e => { if (!body.contains(e.relatedTarget)) body.classList.remove('drag-over'); });
    body.addEventListener('drop', async e => {
      e.preventDefault();
      body.classList.remove('drag-over');
      const leadId  = e.dataTransfer.getData('text/plain');
      const colKey  = body.dataset.dropStatus;
      const STATUS_MAP = { inbox:'inbox', approved:'approved', sent:'sent', replied:'replied', bounced:'bounced', client:'client', dead:'dead' };
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
  const val    = groupLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  const valStr = val > 0 ? `<span class="pl-group-val">€${val >= 1000 ? (val/1000).toFixed(0)+'K' : val}</span>` : '';
  return `
    <div class="pl-group status-group" data-group="${group.key}">
      <div class="pl-group-head status-group-header ${isOpen ? 'open' : ''}" onclick="toggleStatusGroup('${group.key}')">
        <span class="pl-group-dot sg-dot" style="background:${group.dot}"></span>
        <span class="pl-group-label sg-label">${group.label}</span>
        <span class="pl-group-count sg-count">${groupLeads.length}</span>
        ${valStr}
        <i class="ti ti-chevron-right pl-group-chevron sg-chevron" style="${isOpen ? 'transform:rotate(90deg)' : ''}"></i>
      </div>
      <div class="pl-group-body status-group-body ${isOpen ? 'open' : ''}">
        ${groupLeads.length ? `
          <div class="pl-table-wrap">
            <table class="pl-table leads-table">
              <thead><tr>
                <th>Bedrijf</th><th>Niche</th><th>Email</th><th>Score</th>
                <th>Status</th><th>Verstuurd</th><th>Gereageerd</th><th>Waarde</th><th></th>
              </tr></thead>
              <tbody>${groupLeads.map(l => buildLeadTableRow(l, dupIds)).join('')}</tbody>
            </table>
          </div>` : `<div class="pl-group-empty">Geen leads in deze groep</div>`}
      </div>
    </div>`;
}

function renderPipelineTable(leads, container) {
  const sentStatuses    = ['sent','followup1','followup2','scheduled','auto-approved'];
  const activeStatuses  = ['inbox','approved','sent','auto-approved','followup1','followup2'];
  const bouncedStatuses = ['bounced','delivery_delayed'];

  const cTotal   = leads.length;
  const cSent    = leads.filter(l => sentStatuses.includes(l.status)).length;
  const cReplied = leads.filter(l => l.status === 'replied').length;
  const cClient  = leads.filter(l => l.status === 'client').length;
  const cBounced = leads.filter(l => bouncedStatuses.includes(l.status)).length;
  const cActive  = leads.filter(l => activeStatuses.includes(l.status)).length;
  const replyRate = cSent > 0 ? Math.round((cReplied / cSent) * 100) : 0;

  const nameCounts = {};
  leads.forEach(l => { const n = (l.companyName||'').toLowerCase().trim(); if (n) nameCounts[n] = (nameCounts[n]||0)+1; });
  const dupIds = new Set(leads.filter(l => nameCounts[(l.companyName||'').toLowerCase().trim()] > 1).map(l => l.id));

  const defaultOpen = new Set(['replied', 'client']);
  if (!window._pipelineGroupOpen) {
    window._pipelineGroupOpen = Object.fromEntries(
      PIPELINE_GROUPS.map(g => [g.key, defaultOpen.has(g.key)])
    );
  }

  const groupSections = PIPELINE_GROUPS
    .map(g => ({ group: g, groupLeads: leads.filter(l => g.statuses.includes(l.status || 'inbox')) }))
    .filter(({ groupLeads }) => groupLeads.length > 0);

  container.innerHTML = `
    <div class="pl-summary">
      <div class="pl-sum-item" onclick="filterPipelineTab('all')">
        <span class="pl-sum-num">${cTotal}</span>
        <span class="pl-sum-lbl">leads totaal</span>
      </div>
      <div class="pl-sum-sep"></div>
      <div class="pl-sum-item" onclick="filterPipelineTab('sent')">
        <span class="pl-sum-num">${cSent}</span>
        <span class="pl-sum-lbl">verstuurd</span>
      </div>
      <div class="pl-sum-sep"></div>
      <div class="pl-sum-item" onclick="filterPipelineTab('replied')">
        <span class="pl-sum-num green">${cReplied}</span>
        <span class="pl-sum-lbl">gereageerd${cSent > 0 ? ` (${replyRate}%)` : ''}</span>
      </div>
      <div class="pl-sum-sep"></div>
      <div class="pl-sum-item" onclick="filterPipelineTab('client')">
        <span class="pl-sum-num purple">${cClient}</span>
        <span class="pl-sum-lbl">klanten</span>
      </div>
      ${cBounced > 0 ? `
      <div class="pl-sum-sep"></div>
      <div class="pl-sum-item" onclick="filterPipelineTab('bounced')">
        <span class="pl-sum-num red">${cBounced}</span>
        <span class="pl-sum-lbl">niet aangekomen</span>
      </div>` : ''}
    </div>

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <div class="pl-tab-bar" style="flex:1">
        <button class="pl-tab pipeline-filter-tab active" data-group="all">Alles (${cTotal})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="active">Actief (${cActive})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="sent">Verstuurd (${cSent})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="replied">Gereageerd (${cReplied})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="bounced">Niet aang. (${cBounced})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="client">Klanten (${cClient})</button>
        <button class="pl-tab pipeline-filter-tab" data-group="disapproved">Afgekeurd</button>
      </div>
      <div style="display:flex;gap:8px">
        <input type="search" id="leadSearch" placeholder="Zoek bedrijf..." style="width:180px;background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:6px 12px;font-size:13px;color:var(--text,#F5F5F5);outline:none">
        <select id="exportSelect" style="font-size:12px;background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:6px 10px;color:var(--text-2,#999)" onchange="if(this.value){exportLeadsCSV(this.value==='all'?'':this.value);this.value=''}">
          <option value="">⬇ Export...</option>
          <option value="all">Alle leads</option>
          <option value="client">Klanten</option>
          <option value="sent">Verstuurd</option>
          <option value="replied">Gereageerd</option>
        </select>
      </div>
    </div>

    <div id="pipelineGroups">
      ${groupSections.map(({ group, groupLeads }) =>
        buildGroupSection(group, groupLeads, dupIds, window._pipelineGroupOpen[group.key] || false)
      ).join('')}
    </div>
  `;

  document.querySelectorAll('.leads-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      openProjectPage(row.dataset.id);
    });
    row.style.cursor = 'pointer';
  });

  document.getElementById('leadSearch')?.addEventListener('input', e => {
    const q = e.target.value.toLowerCase().trim();
    document.querySelectorAll('.leads-row').forEach(row => {
      const name = row.querySelector('strong')?.textContent?.toLowerCase() || '';
      row.style.display = (!q || name.includes(q)) ? '' : 'none';
    });
    document.querySelectorAll('.status-group').forEach(sg => {
      const visRows = sg.querySelectorAll('.leads-row:not([style*="none"])');
      sg.style.display = visRows.length ? '' : 'none';
    });
  });

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
    const key   = sg.dataset.group;
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


// ═══════════════════════════════════════════════════════════════════════════════
// Calendar view for appointments/follow-ups
// ═══════════════════════════════════════════════════════════════════════════════
let _calYear, _calMonth;

function showCalendarView() {
  const now = new Date();
  _calYear  = now.getFullYear();
  _calMonth = now.getMonth();
  _renderCalendarModal();
}

function _renderCalendarModal() {
  const leads  = state.leads || [];
  const events = [];
  leads.forEach(l => {
    if (l.followup1SentAt) events.push({ date: l.followup1SentAt.slice(0,10), label: `FU1: ${l.companyName}`, color: 'var(--warning)' });
    if (l.followup2SentAt) events.push({ date: l.followup2SentAt.slice(0,10), label: `FU2: ${l.companyName}`, color: 'var(--danger)' });
    if (l.calendlyBooking?.startTime) events.push({ date: l.calendlyBooking.startTime.slice(0,10), label: `📅 ${l.companyName}`, color: 'var(--accent)' });
  });
  const evByDate = {};
  events.forEach(e => { if (!evByDate[e.date]) evByDate[e.date] = []; evByDate[e.date].push(e); });

  const firstDay    = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const monthName   = new Date(_calYear, _calMonth).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  const today       = new Date().toISOString().slice(0,10);
  const dayLabels   = ['Zo','Ma','Di','Wo','Do','Vr','Za'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell" style="background:var(--surface-2);opacity:.3;"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr   = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvents = evByDate[dateStr] || [];
    cells += `<div class="cal-cell${dateStr===today?' cal-today':''}">
      <div class="cal-day-num">${d}</div>
      ${dayEvents.slice(0,3).map(e => `<div class="cal-event" style="background:${e.color}" title="${esc(e.label)}">${esc(e.label)}</div>`).join('')}
      ${dayEvents.length > 3 ? `<div style="font-size:10px;color:var(--text-secondary);">+${dayEvents.length-3} meer</div>` : ''}
    </div>`;
  }

  openModal(`
    <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;">
      <h3 class="modal-title">📅 Kalender</h3>
      <div style="display:flex;align-items:center;gap:8px;">
        <button onclick="_calMonth--;if(_calMonth<0){_calMonth=11;_calYear--;}_renderCalendarModal()" class="btn btn-ghost btn-sm">‹</button>
        <span style="font-weight:700;font-size:14px;">${monthName}</span>
        <button onclick="_calMonth++;if(_calMonth>11){_calMonth=0;_calYear++;}_renderCalendarModal()" class="btn btn-ghost btn-sm">›</button>
        <button onclick="closeModal()" class="modal-close" style="margin-left:8px;">×</button>
      </div>
    </div>
    <div class="cal-grid" style="margin-top:12px;">
      ${dayLabels.map(l => `<div class="cal-cell-header">${l}</div>`).join('')}
      ${cells}
    </div>
  `);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Multi-column sorting
// ═══════════════════════════════════════════════════════════════════════════════
let _pipelineSort = { col: 'companyName', dir: 1 };

function setSortCol(col) {
  if (_pipelineSort.col === col) _pipelineSort.dir *= -1;
  else { _pipelineSort.col = col; _pipelineSort.dir = 1; }
  renderPipeline();
}
