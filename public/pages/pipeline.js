// ─── Pipeline tracker ─────────────────────────────────────────────────────────

// Extend the global STATUS_LABELS stub (from core.js) with pipeline-specific labels
window.STATUS_LABELS = Object.assign(window.STATUS_LABELS || {}, {
  inbox: 'Inbox', approved: 'Goedgekeurd', sent: 'Verstuurd',
  'auto-approved': 'Auto-goedgekeurd', scheduled: 'Ingepland',
  followup1: 'Follow-up 1', followup2: 'Follow-up 2',
  replied: 'Gereageerd', meeting: 'Afspraak',
  client: 'Klant ✓', disapproved: 'Afgewezen', dead: 'Dead',
  bounced: 'Niet aangekomen', delivery_delayed: 'Vertraagd'
});
const STATUS_LABELS = window.STATUS_LABELS;

// Extend the global STATUS_COLORS (defined in core.js) with pipeline-specific values
window.STATUS_COLORS = Object.assign(window.STATUS_COLORS || {}, {
  inbox: 'gray', approved: 'blue', sent: 'indigo', 'auto-approved': 'indigo',
  scheduled: 'amber',
  followup1: 'amber', followup2: 'orange', replied: 'green',
  meeting: 'purple', client: 'dark-green', disapproved: 'red', dead: 'gray',
  bounced: 'red', delivery_delayed: 'orange'
});
const STATUS_COLORS = window.STATUS_COLORS;

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
  if (!container) return;

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
  if (!container) return;
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


// ═══════════════════════════════════════════════════════════════════════════════
// Task 16 — Calendar view for appointments/follow-ups
// ═══════════════════════════════════════════════════════════════════════════════
let _calYear, _calMonth;

function showCalendarView() {
  const now = new Date();
  _calYear = now.getFullYear();
  _calMonth = now.getMonth();
  _renderCalendarModal();
}

function _renderCalendarModal() {
  const leads = state.leads || [];
  const events = [];
  leads.forEach(l => {
    if (l.followup1SentAt) events.push({ date: l.followup1SentAt.slice(0,10), label: `FU1: ${l.companyName}`, color: 'var(--warning)' });
    if (l.followup2SentAt) events.push({ date: l.followup2SentAt.slice(0,10), label: `FU2: ${l.companyName}`, color: 'var(--danger)' });
    if (l.calendlyBooking?.startTime) events.push({ date: l.calendlyBooking.startTime.slice(0,10), label: `📅 ${l.companyName}`, color: 'var(--accent)' });
  });
  const evByDate = {};
  events.forEach(e => { if (!evByDate[e.date]) evByDate[e.date] = []; evByDate[e.date].push(e); });

  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const daysInMonth = new Date(_calYear, _calMonth + 1, 0).getDate();
  const monthName = new Date(_calYear, _calMonth).toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0,10);
  const dayLabels = ['Zo','Ma','Di','Wo','Do','Vr','Za'];

  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell" style="background:var(--surface-2);opacity:.3;"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${_calYear}-${String(_calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
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
// Task 17 — Project archiving: add "Archief" button to pipeline header
// ═══════════════════════════════════════════════════════════════════════════════
// renderPipeline already has filter tabs; archived filter added via leads.js (status=archived)

// ═══════════════════════════════════════════════════════════════════════════════
// Task 19 — Multi-column sorting
// ═══════════════════════════════════════════════════════════════════════════════
let _pipelineSort = { col: 'companyName', dir: 1 };

function setSortCol(col) {
  if (_pipelineSort.col === col) _pipelineSort.dir *= -1;
  else { _pipelineSort.col = col; _pipelineSort.dir = 1; }
  renderPipeline();
}
