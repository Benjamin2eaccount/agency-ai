async function renderBetalingen() {
  const el = document.getElementById('appView');
  el.innerHTML = `<div class="page-header"><h1 class="page-title">Betalingen</h1></div><div style="padding:20px;color:var(--text-muted)">Laden...</div>`;
  const rows = await apiJSON('/api/payments/overview');
  if (!rows) return;

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtEur = (n) => `€${parseFloat(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`;

  const statusBadge = (s, due) => {
    const overdue = s !== 'paid' && due && new Date(due) < new Date();
    if (s === 'paid') return `<span class="badge badge-green">✅ Betaald</span>`;
    if (overdue || s === 'overdue') return `<span class="badge badge-red">🔴 Verlopen</span>`;
    return `<span class="badge badge-warning">🟡 Openstaand</span>`;
  };

  const render = (filter, q) => {
    const minAmt = parseFloat(document.getElementById('betMinAmt')?.value) || 0;
    const maxAmt = parseFloat(document.getElementById('betMaxAmt')?.value) || Infinity;
    const fromDate = document.getElementById('betFromDate')?.value;
    const toDate = document.getElementById('betToDate')?.value;
    let data = q ? rows.filter(r => r.companyName.toLowerCase().includes(q.toLowerCase()) || (r.invoiceNr || '').toLowerCase().includes(q.toLowerCase())) : rows;
    if (filter === 'open') data = data.filter(r => r.status !== 'paid' && !(new Date(r.dueDate) < new Date()));
    if (filter === 'paid') data = data.filter(r => r.status === 'paid');
    if (filter === 'overdue') data = data.filter(r => r.status !== 'paid' && new Date(r.dueDate) < new Date());
    if (minAmt > 0) data = data.filter(r => parseFloat(r.amount||0) >= minAmt);
    if (isFinite(maxAmt)) data = data.filter(r => parseFloat(r.amount||0) <= maxAmt);
    if (fromDate) data = data.filter(r => r.createdAt && r.createdAt >= fromDate);
    if (toDate) data = data.filter(r => r.createdAt && r.createdAt <= toDate + 'T23:59:59');
    const countEl = document.getElementById('betCount');
    if (countEl) countEl.textContent = `${data.length} facturen`;

    const totalOpen = data.filter(r => r.status !== 'paid').reduce((s, r) => s + parseFloat(r.amount || 0), 0);
    const totalPaid = data.filter(r => r.status === 'paid').reduce((s, r) => s + parseFloat(r.amount || 0), 0);

    const tableRows = data.map(r => `
      <tr onclick="setView('project');setTimeout(()=>openLeadDetail('${esc(r.leadId)}'),50)" style="cursor:pointer">
        <td style="padding:10px 14px;font-size:13px;font-weight:600;color:var(--accent)">${esc(r.invoiceNr || '—')}</td>
        <td style="padding:10px 14px;font-size:13px">${esc(r.companyName)}</td>
        <td style="padding:10px 14px;font-size:13px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.service || '—')}</td>
        <td style="padding:10px 14px;font-size:13px;font-weight:600">${fmtEur(r.amount)}</td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text-secondary)">${fmt(r.createdAt)}</td>
        <td style="padding:10px 14px;font-size:12px;color:var(--text-secondary)">${fmt(r.dueDate)}</td>
        <td style="padding:10px 14px">${statusBadge(r.status, r.dueDate)}</td>
      </tr>`).join('');

    const tbody = document.getElementById('betTable');
    if (tbody) tbody.innerHTML = tableRows || `<tr><td colspan="7" style="padding:32px;text-align:center;color:var(--text-muted)">Geen betalingen gevonden</td></tr>`;
    const totalsEl = document.getElementById('betTotals');
    if (totalsEl) totalsEl.innerHTML = `Totaal openstaand: <strong>${fmtEur(totalOpen)}</strong> &nbsp;|&nbsp; Totaal betaald: <strong>${fmtEur(totalPaid)}</strong>`;
  };

  el.innerHTML = `
    <div class="page-header">
      <h1 class="page-title"><i class="ti ti-receipt" style="margin-right:8px"></i>Betalingen</h1>
    </div>
    <div style="display:flex;gap:0;min-height:400px">
      <div style="width:200px;flex-shrink:0;border-right:1px solid var(--border);padding:16px 0">
        ${[['all','Alle betalingen'],['open','Openstaand'],['paid','Betaald'],['overdue','Verlopen']].map(([v,l]) =>
          `<a href="#" onclick="event.preventDefault();document.querySelectorAll('.bet-filter').forEach(x=>x.classList.remove('active'));this.classList.add('active');window._betFilter='${v}';window._renderBet()" class="bet-filter${v==='all'?' active':''}" style="display:block;padding:10px 20px;font-size:13px;color:var(--text);text-decoration:none;border-left:3px solid transparent;transition:.15s" data-v="${v}">${l}</a>`
        ).join('')}
      </div>
      <div style="flex:1;padding:20px">
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;align-items:flex-end">
          <input id="betSearch" type="text" placeholder="Zoek op bedrijf of factuurnummer..." class="form-input" style="max-width:260px">
          <input id="betFromDate" type="date" class="form-input" style="width:140px" title="Van datum">
          <input id="betToDate" type="date" class="form-input" style="width:140px" title="Tot datum">
          <input id="betMinAmt" type="number" class="form-input" style="width:100px" placeholder="Min €">
          <input id="betMaxAmt" type="number" class="form-input" style="width:100px" placeholder="Max €">
          <span id="betCount" style="font-size:13px;color:var(--text-secondary);line-height:36px"></span>
        </div>
        <div style="overflow-x:auto;border:1px solid var(--border);border-radius:10px">
          <table style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface-2);border-bottom:1px solid var(--border)">
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Factuurnr</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Klant</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Dienst</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Bedrag</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Datum</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Vervaldatum</th>
                <th style="padding:10px 14px;font-size:11px;font-weight:700;color:var(--text-secondary);text-align:left;text-transform:uppercase;letter-spacing:.5px">Status</th>
              </tr>
            </thead>
            <tbody id="betTable"></tbody>
          </table>
        </div>
        <div id="betTotals" style="padding:12px 0;font-size:13px;color:var(--text-secondary);text-align:right"></div>
      </div>
    </div>
    <style>.bet-filter.active{background:var(--accent-light,rgba(99,102,241,.08));color:var(--accent);border-left-color:var(--accent)!important;font-weight:600}</style>`;

  window._betFilter = 'all';
  window._renderBet = () => render(window._betFilter, document.getElementById('betSearch')?.value || '');
  window._renderBet();

  document.getElementById('betSearch')?.addEventListener('input', () => window._renderBet());
  ['betFromDate','betToDate','betMinAmt','betMaxAmt'].forEach(id => document.getElementById(id)?.addEventListener('input', () => window._renderBet()));
}

