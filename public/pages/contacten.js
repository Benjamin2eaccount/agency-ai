// ─── Contacts view ────────────────────────────────────────────────────────────
async function renderContacts() {
  const appView = document.getElementById('appView');
  if (!appView) return;
  appView.innerHTML = `<div class="loading-spinner"></div>`;
  let contacts;
  try {
    contacts = await apiJSON('/api/contacts');
  } catch(e) { contacts = null; }
  if (!Array.isArray(contacts)) contacts = [];

  state._contactsFilter    = state._contactsFilter    || 'all';
  state._contactsTypeFilter = state._contactsTypeFilter || 'all';

  // Demo aanvragen tab only visible for the Agency AI internal workspace
  const _isAgencyAI = (() => { try { const pl = getTokenPayload(); return pl?.workspaceId === 'ws_agencyai' || !pl?.workspaceId; } catch { return false; } })();
  const TYPE_FILTERS = [
    { key: 'all',   label: 'Alle' },
    ...(_isAgencyAI ? [{ key: 'demo', label: 'Demo aanvragen' }] : []),
    { key: 'other', label: 'Overig' },
  ];

  const STATUS_FILTERS = [
    { key: 'all',        label: 'Alles' },
    { key: 'new',        label: 'Nieuw' },
    { key: 'read',       label: 'Gelezen' },
    { key: 'contacted',  label: 'Gecontacteerd' },
    { key: 'converted',  label: 'Geconverteerd' },
  ];

  const STATUS_LABELS = { new: 'Nieuw', read: 'Gelezen', contacted: 'Gecontacteerd', converted: 'Geconverteerd', rejected: 'Afgewezen' };
  const STATUS_COLORS = { new: '#f97316', read: 'var(--text-muted)', contacted: '#f59e0b', converted: '#10b981', rejected: 'var(--danger)' };

  // Apply type filter first, then status filter
  const typeFiltered = state._contactsTypeFilter === 'all'
    ? contacts
    : state._contactsTypeFilter === 'demo'
      ? contacts.filter(c => c.type === 'demo')
      : contacts.filter(c => c.type !== 'demo');

  const filtered = state._contactsFilter === 'all'
    ? typeFiltered
    : typeFiltered.filter(c => c.status === state._contactsFilter);

  const typeChips = TYPE_FILTERS.map(f => {
    const count = f.key === 'all' ? contacts.length
      : f.key === 'demo' ? contacts.filter(c => c.type === 'demo').length
      : contacts.filter(c => c.type !== 'demo').length;
    return `<button class="filter-chip${state._contactsTypeFilter === f.key ? ' active' : ''}" onclick="window._setContactsTypeFilter('${f.key}')">${f.label} <span class="filter-chip-count">${count}</span></button>`;
  }).join('');

  const filterChips = STATUS_FILTERS.map(f => {
    const count = f.key === 'all' ? typeFiltered.length : typeFiltered.filter(c => c.status === f.key).length;
    return `<button class="filter-chip${state._contactsFilter === f.key ? ' active' : ''}" onclick="window._setContactsFilter('${f.key}')">${f.label} <span class="filter-chip-count">${count}</span></button>`;
  }).join('');

  const cards = filtered.length === 0
    ? `<div class="empty-card"><i class="ti ti-address-book" style="font-size:2.5rem;color:var(--text-muted)"></i><h3>Geen contacten</h3><p>Nog geen aanvragen ontvangen.</p></div>`
    : filtered.map(c => {
        const effectiveStatus = c.status || 'new';
        const statusColor = STATUS_COLORS[effectiveStatus] || 'var(--text-muted)';
        const statusLabel = STATUS_LABELS[effectiveStatus] || effectiveStatus;
        const date = new Date(c.submittedAt || c.createdAt).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
        const isDemo = c.type === 'demo';
        return `
          <div class="contact-card" id="cc-${c.id}">
            <div class="contact-card-header">
              <div class="contact-card-info">
                <div class="contact-card-name">
                  ${esc(c.name)}${c.company ? ` <span class="contact-card-company">· ${esc(c.company)}</span>` : ''}
                  ${isDemo ? `<span class="niche-badge" style="background:#f97316;color:#fff;margin-left:6px">Demo aanvraag</span>` : ''}
                </div>
                <div class="contact-card-meta">
                  ${c.email ? `<a href="mailto:${esc(c.email)}" class="contact-meta-link"><i class="ti ti-mail"></i> ${esc(c.email)}</a>` : ''}
                  ${c.phone ? `<a href="tel:${esc(c.phone)}" class="contact-meta-link"><i class="ti ti-phone"></i> ${esc(c.phone)}</a>` : ''}
                  ${isDemo && c.clients ? `<span class="niche-badge"><i class="ti ti-users" style="margin-right:3px"></i>${esc(c.clients)} klanten</span>` : ''}
                  ${!isDemo && c.service ? `<span class="niche-badge">${esc(c.service)}</span>` : ''}
                </div>
              </div>
              <div class="contact-card-right">
                <span class="contact-status-badge" style="background:${statusColor}20;color:${statusColor}">${statusLabel}</span>
                <span class="contact-card-date">${date}</span>
              </div>
            </div>
            ${c.message ? `<div class="contact-card-message">${esc(c.message)}</div>` : ''}
            <div class="contact-card-actions">
              ${effectiveStatus === 'new' ? `<button class="btn btn-sm btn-ghost" onclick="window._contactAction('${c.id}','read')"><i class="ti ti-check"></i> Gelezen</button>` : ''}
              ${effectiveStatus !== 'contacted' && effectiveStatus !== 'converted' ? `<button class="btn btn-sm btn-ghost" onclick="window._contactAction('${c.id}','contacted')"><i class="ti ti-send"></i> Gecontacteerd</button>` : ''}
              ${effectiveStatus !== 'rejected' ? `<button class="btn btn-sm btn-danger-ghost" onclick="window._contactAction('${c.id}','rejected')" title="Afwijzen"><i class="ti ti-x"></i> Afwijzen</button>` : '<span style="font-size:12px;color:var(--text-muted)"><i class="ti ti-x"></i> Afgewezen</span>'}
              ${effectiveStatus !== 'converted' && !isDemo ? `<button class="btn btn-sm btn-primary" onclick="window._contactToLead('${c.id}')"><i class="ti ti-user-plus"></i> Lead aanmaken</button>` : effectiveStatus === 'converted' ? `<span class="contact-converted-note"><i class="ti ti-check"></i> Geconverteerd naar lead</span>` : ''}
              <button class="btn btn-sm btn-danger-ghost" onclick="window._contactDelete('${c.id}')"><i class="ti ti-trash"></i></button>
            </div>
          </div>`;
      }).join('');

  // Build integration info section (workspace slug from settings or JWT)
  const _wSlug = (() => {
    try {
      const tok = getToken();
      if (!tok) return 'jouw-workspace';
      const pl = JSON.parse(atob(tok.split('.')[1]));
      return pl.workspaceSlug || 'jouw-workspace';
    } catch { return 'jouw-workspace'; }
  })();
  const _formCode = `<form action="https://www.agencyai.info/api/contact-form" method="POST">\n  <input type="hidden" name="workspace" value="${_wSlug}">\n  <input type="text"  name="name"    placeholder="Naam"     required>\n  <input type="email" name="email"   placeholder="Email"    required>\n  <input type="tel"   name="phone"   placeholder="Telefoon">\n  <textarea           name="message" placeholder="Bericht"></textarea>\n  <button type="submit">Versturen</button>\n</form>`;

  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Marketing</div>
        <h1 class="page-title">Contacten</h1>
      </div>
    </div>

    <details class="integration-info-box" style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:14px 18px;margin-bottom:20px">
      <summary style="cursor:pointer;font-weight:600;font-size:13px;list-style:none;display:flex;align-items:center;gap:8px">
        <i class="ti ti-code" style="color:var(--accent)"></i>
        📋 Contactformulier integreren op je website
      </summary>
      <div style="margin-top:12px;font-size:13px;color:var(--text-secondary)">
        Voeg dit formulier toe aan je website om leads direct in je systeem te ontvangen:
      </div>
      <pre id="contactFormCode" style="background:var(--surface-3,#f3f4f6);border:1px solid var(--border);border-radius:6px;padding:12px;margin-top:8px;font-size:12px;overflow-x:auto;white-space:pre-wrap">${_esc(_formCode)}</pre>
      <button class="btn btn-ghost btn-sm" style="margin-top:8px" onclick="
        navigator.clipboard.writeText(document.getElementById('contactFormCode').textContent).then(()=>{this.textContent='✓ Gekopieerd!';setTimeout(()=>{this.textContent='Kopieer code'},1800)})
      ">Kopieer code</button>
    </details>

    <div class="filter-bar" style="margin-bottom:12px">${typeChips}</div>
    <div class="filter-bar" style="margin-bottom:20px">${filterChips}</div>
    <div id="contactsList">${cards}</div>`;

  fetchContactsBadge();

  window._setContactsTypeFilter = (f) => {
    state._contactsTypeFilter = f;
    state._contactsFilter = 'all'; // reset status filter when type changes
    renderContacts();
  };

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

