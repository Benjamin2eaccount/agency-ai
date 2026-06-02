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

async function downloadClientUpload(leadId, filename) {
  const url = `/api/leads/${encodeURIComponent(leadId)}/client-uploads/${encodeURIComponent(filename)}`;
  console.log('[DownloadBtn] URL:', url);
  try {
    const res = await api(url);
    if (!res.ok) { toast('Download mislukt (' + res.status + ')', 'error'); return; }
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(blobUrl); a.remove(); }, 1000);
  } catch (e) {
    console.error('[DownloadBtn] Error:', e);
    toast('Download mislukt', 'error');
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
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="openCsvImportModal()">
          <i class="ti ti-upload"></i> Importeer CSV
        </button>` : ''}
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


// ─── CSV Import (Task 17) ─────────────────────────────────────────────────────
function openCsvImportModal() {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📥 Leads importeren via CSV</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">
      Upload een CSV-bestand met leads. Download eerst de template voor het juiste formaat.
    </p>
    <div style="display:flex;gap:10px;margin-bottom:16px;">
      <a href="/api/leads/template.csv" download style="font-size:13px;color:var(--accent);text-decoration:none;border:1px solid var(--accent);border-radius:6px;padding:6px 12px;">
        ⬇️ Download template
      </a>
    </div>
    <div id="csvDropZone" style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;margin-bottom:16px;"
      onclick="document.getElementById('csvFileInput').click()"
      ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
      ondragleave="this.style.borderColor='var(--border)'"
      ondrop="event.preventDefault();handleCsvDrop(event)">
      <div style="font-size:32px;margin-bottom:8px;">📄</div>
      <div style="font-weight:600;">Klik of sleep CSV-bestand hier</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">Maximaal 5MB · CSV formaat</div>
    </div>
    <input type="file" id="csvFileInput" accept=".csv" style="display:none" onchange="handleCsvFile(this.files[0])">
    <div id="csvResult"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
      <button onclick="closeModal()" class="btn btn-secondary">Sluiten</button>
    </div>
  `);
}

function handleCsvDrop(e) {
  const file = e.dataTransfer.files[0];
  if (file) handleCsvFile(file);
}

async function handleCsvFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    const csv = e.target.result;
    const resultDiv = document.getElementById('csvResult');
    if (resultDiv) resultDiv.innerHTML = '<div style="color:var(--text-secondary);font-size:13px;">Importeren...</div>';
    const data = await apiJSON('/api/leads/import', { method: 'POST', body: JSON.stringify({ csv }) });
    if (!data) { if (resultDiv) resultDiv.innerHTML = '<div style="color:#ef4444;">Import mislukt.</div>'; return; }
    const html = `
      <div style="background:#f0fdf4;border:1px solid #16a34a;border-radius:8px;padding:16px;">
        <div style="color:#15803d;font-weight:700;margin-bottom:8px;">Import voltooid</div>
        <div style="font-size:13px;">✅ ${data.imported} leads geïmporteerd</div>
        ${data.skipped > 0 ? `<div style="font-size:13px;">⚠️ ${data.skipped} overgeslagen (duplicaten)</div>` : ''}
        ${data.errors?.length > 0 ? `<div style="font-size:13px;color:#ef4444;">❌ ${data.errors.length} fouten</div>` : ''}
      </div>
      ${data.imported > 0 ? '<div style="margin-top:12px;"><button onclick="closeModal();renderLeads()" class="btn btn-primary">Bekijk geïmporteerde leads</button></div>' : ''}`;
    if (resultDiv) resultDiv.innerHTML = html;
  };
  reader.readAsText(file);
}
