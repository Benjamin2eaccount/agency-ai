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

// loadActivityLog moved to runs.js (called from runs-page HTML)


// showNewTemplateForm, loadTemplates, saveTemplate, runTemplate, deleteRunTemplate
// were moved to runs.js (they operate on runs-page DOM elements)

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

// resetAbMemory moved to agents.js (called from agents-page HTML)

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

// _runFmt, toggleLeadSource, startCustomRun, checkDuplicateLive, analyzeCustomCompany
// were moved to runs.js (they operate on runs-page DOM elements)

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

async function saveWeeklyUpdatesSetting(enabled) {
  const res = await api('/api/settings/automation', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyUpdatesEnabled: enabled })
  });
  if (res?.ok) toast(enabled ? 'Weekupdates ingeschakeld' : 'Weekupdates uitgeschakeld', 'success');
  else toast('Opslaan mislukt', 'error');
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

// ─── Permission definitions ───────────────────────────────────────────────────
const PERMISSION_GROUPS = [
  { label: '📊 Data', items: [
    { id: 'leads_view',    label: 'Leads bekijken' },
    { id: 'leads_approve', label: 'Leads goedkeuren' },
    { id: 'leads_delete',  label: 'Leads verwijderen' },
  ]},
  { label: '📧 Communicatie', items: [
    { id: 'inbox_view',    label: 'Inbox bekijken' },
    { id: 'inbox_reply',   label: 'Emails beantwoorden' },
  ]},
  { label: '🏗️ Projecten', items: [
    { id: 'pipeline_view',   label: 'Pipeline bekijken' },
    { id: 'projects_view',   label: 'Projecten bekijken' },
    { id: 'projects_edit',   label: 'Projecten bewerken' },
    { id: 'builds_create',   label: 'Websites bouwen' },
    { id: 'builds_approve',  label: 'Deliverables goedkeuren' },
  ]},
  { label: '💰 Financieel', items: [
    { id: 'invoices_view',   label: 'Facturen bekijken' },
    { id: 'invoices_create', label: 'Facturen aanmaken' },
    { id: 'billing_view',    label: 'Betalingen bekijken' },
  ]},
  { label: '⚙️ Systeem', items: [
    { id: 'runs_view',      label: 'Runs bekijken' },
    { id: 'runs_start',     label: 'Runs starten' },
    { id: 'agents_view',    label: 'Agents bekijken' },
    { id: 'stats_view',     label: 'Statistieken bekijken' },
    { id: 'clients_view',   label: 'Klanten bekijken' },
    { id: 'settings_view',  label: 'Instellingen bekijken' },
    { id: 'team_manage',    label: 'Team beheren' },
  ]},
];
const ALL_PERMISSIONS    = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.id));
const PRESET_MEDEWERKER  = ['leads_view','inbox_view','inbox_reply','pipeline_view','projects_view','builds_create','stats_view','clients_view'];
const PRESET_READONLY    = ['leads_view','inbox_view','pipeline_view','stats_view'];

function buildPermissionsChecklist(prefix, currentPerms) {
  const active = Array.isArray(currentPerms) ? currentPerms : [];
  return `
    <div style="margin-top:16px;border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="padding:10px 14px;background:var(--surface-2);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div style="font-size:13px;font-weight:700">Rechten</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="btn btn-ghost btn-xs" onclick="applyPermPreset('${prefix}','all')">Alles</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="applyPermPreset('${prefix}','medewerker')">Medewerker</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="applyPermPreset('${prefix}','readonly')">Alleen lezen</button>
          <button type="button" class="btn btn-ghost btn-xs" onclick="applyPermPreset('${prefix}','none')">Geen</button>
        </div>
      </div>
      <div style="padding:12px 14px;display:grid;gap:0">
        ${PERMISSION_GROUPS.map(g => `
          <div style="margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">${g.label}</div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${g.items.map(p => `
                <label style="display:flex;align-items:center;gap:5px;font-size:13px;cursor:pointer;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:${active.includes(p.id)?'var(--accent)':'var(--surface)'};color:${active.includes(p.id)?'#fff':'var(--text)'}">
                  <input type="checkbox" name="${prefix}_perm" value="${p.id}" ${active.includes(p.id)?'checked':''} style="display:none"
                    onchange="this.closest('label').style.background=this.checked?'var(--accent)':'var(--surface)';this.closest('label').style.color=this.checked?'#fff':'var(--text)'">
                  ${p.label}
                </label>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function applyPermPreset(prefix, preset) {
  const presets = { all: ALL_PERMISSIONS, medewerker: PRESET_MEDEWERKER, readonly: PRESET_READONLY, none: [] };
  const target = presets[preset] || [];
  document.querySelectorAll(`input[name="${prefix}_perm"]`).forEach(cb => {
    cb.checked = target.includes(cb.value);
    const label = cb.closest('label');
    if (label) {
      label.style.background = cb.checked ? 'var(--accent)' : 'var(--surface)';
      label.style.color      = cb.checked ? '#fff' : 'var(--text)';
    }
  });
}

function getCheckedPerms(prefix) {
  return [...document.querySelectorAll(`input[name="${prefix}_perm"]:checked`)].map(c => c.value);
}

// ─── Users management helpers ─────────────────────────────────────────────────

async function loadUsersList() {
  const el = document.getElementById('usersList');
  if (!el) return;
  const users = await apiJSON('/api/users');
  if (!users) return;

  // Cache full user objects by id so onclick handlers never pass complex
  // values through HTML attributes (avoids all quote/encoding breakage).
  window._usersCache = {};
  users.forEach(u => { window._usersCache[u.id] = u; });

  el.innerHTML = users.map(u => {
    const perms = Array.isArray(u.permissions) ? u.permissions : [];
    const permBadges = u.role !== 'admin' && perms.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">${perms.slice(0,5).map(p => `<span style="font-size:10px;background:var(--surface-2);border:1px solid var(--border);padding:1px 6px;border-radius:4px;color:var(--text-muted)">${p}</span>`).join('')}${perms.length > 5 ? `<span style="font-size:10px;color:var(--text-muted)">+${perms.length-5} meer</span>` : ''}</div>`
      : '';
    return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px;background:var(--surface)">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:36px;height:36px;border-radius:50%;background:${u.role==='admin'?'#111':'#6366f1'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;flex-shrink:0">${(u.name||'?')[0].toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:600">${esc(u.name)} <span style="font-size:11px;color:var(--text-secondary)">@${esc(u.username)}</span></div>
          <span class="badge ${u.role==='admin'?'badge-gray':'badge-blue'}" style="font-size:10px">${u.role==='admin'?'Admin':'Medewerker'}</span>
          ${permBadges}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          ${u.id !== '1' ? `
            <button class="btn btn-ghost btn-sm" title="Bewerken"
              data-uid="${u.id}" onclick="openEditUser(this.dataset.uid)">
              <i class="ti ti-pencil"></i>
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" title="Verwijderen"
              data-uid="${u.id}" data-name="${esc(u.name).replace(/"/g,'&quot;')}"
              onclick="deleteUser(this.dataset.uid, this.dataset.name)">
              <i class="ti ti-trash"></i>
            </button>` : '<span style="font-size:11px;color:var(--text-secondary)">Hoofd-admin</span>'}
        </div>
      </div>
    </div>`;
  }).join('') || '<p class="text-secondary" style="font-size:13px">Geen gebruikers gevonden.</p>';
}

async function addUser() {
  const name = document.getElementById('newUserName')?.value?.trim();
  const username = document.getElementById('newUserUsername')?.value?.trim();
  const password = document.getElementById('newUserPassword')?.value;
  const role = document.getElementById('newUserRole')?.value;
  if (!name || !username || !password) { toast('Vul alle velden in.', 'error'); return; }
  const permissions = role === 'employee' ? getCheckedPerms('newUser') : null;
  const res = await api('/api/users', { method: 'POST', body: JSON.stringify({ name, username, password, role, permissions }) });
  if (res?.ok) {
    toast(`${name} aangemaakt als ${role === 'admin' ? 'Admin' : 'Medewerker'}.`, 'success');
    ['newUserName','newUserUsername','newUserPassword'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    loadUsersList();
  } else {
    const d = res ? await res.json().catch(() => ({})) : {};
    toast(d.error || 'Aanmaken mislukt.', 'error');
  }
}

function openEditUser(userId) {
  const u = (window._usersCache || {})[userId];
  if (!u) { toast('Gebruiker niet gevonden.', 'error'); return; }
  const perms = Array.isArray(u.permissions) ? u.permissions : [];
  const isEmp = u.role === 'employee';
  const userName     = u.name;
  const userUsername = u.username;
  const userRole     = u.role;
  openModal(`
    <div style="padding:24px;max-height:88vh;overflow-y:auto;min-width:340px">
      <div style="font-size:16px;font-weight:700;margin-bottom:18px;display:flex;align-items:center;gap:8px">
        <i class="ti ti-user-edit"></i> Bewerk gebruiker
      </div>

      <div style="display:grid;gap:12px;margin-bottom:4px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px">Naam</label>
          <input id="editUserName" class="stg-input" value="${esc(userName)}" placeholder="Volledige naam">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px">Gebruikersnaam / E-mail</label>
          <input id="editUserUsername" class="stg-input" value="${esc(userUsername)}" placeholder="gebruiker of naam@bureau.nl">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px">Rol</label>
          <select id="editUserRole" class="stg-input form-select"
            onchange="var s=document.getElementById('editUserPermsSection');s.style.display=this.value==='employee'?'':'none'">
            <option value="employee"${isEmp?' selected':''}>Medewerker</option>
            <option value="admin"${!isEmp?' selected':''}>Admin</option>
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.06em;display:block;margin-bottom:5px">
            Nieuw wachtwoord <span style="font-weight:400;text-transform:none">(leeg = ongewijzigd)</span>
          </label>
          <input id="editUserPassword" type="password" class="stg-input" placeholder="••••••••">
        </div>
      </div>

      <div id="editUserPermsSection" style="${isEmp?'':'display:none'}">
        ${buildPermissionsChecklist('editUser', perms)}
      </div>

      <div style="display:flex;gap:8px;margin-top:20px">
        <button class="btn btn-primary" onclick="saveEditUser('${userId}')">
          <i class="ti ti-check"></i> Opslaan
        </button>
        <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      </div>
    </div>`);
}

async function saveEditUser(userId) {
  const name     = document.getElementById('editUserName')?.value?.trim();
  const username = document.getElementById('editUserUsername')?.value?.trim();
  const role     = document.getElementById('editUserRole')?.value;
  const password = document.getElementById('editUserPassword')?.value;
  const permissions = role === 'employee' ? getCheckedPerms('editUser') : null;

  if (!name) { toast('Naam is verplicht.', 'error'); return; }

  const patch = { name, role };
  if (username) patch.username = username;
  if (password) patch.password = password;
  if (permissions !== null) patch.permissions = permissions;

  const res = await api(`/api/users/${userId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  if (res?.ok) { toast('Gebruiker bijgewerkt.', 'success'); closeModal(); loadUsersList(); }
  else { const d = res ? await res.json().catch(() => ({})) : {}; toast(d.error || 'Opslaan mislukt.', 'error'); }
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
  // Load audit log when tab opens
  if (id === 'auditlog') loadAuditLog();
  if (id === 'components') loadComponentsTab();
  if (id === 'templates') loadTemplatesTab();
  if (id === 'changelog') loadChangelogTab();
  if (id === 'ip-whitelist') loadIpWhitelistSection();
}

async function loadAuditLog() {
  const el = document.getElementById('auditLogContent');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Laden...</div>';
  const rows = await apiJSON('/api/audit-log') || [];
  if (!rows.length) { el.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:16px 0">Nog geen audit log entries</div>'; return; }
  el.innerHTML = `<div style="overflow-x:auto">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:var(--surface-2)">
        <th style="padding:8px 12px;text-align:left;color:var(--text-secondary);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Actie</th>
        <th style="padding:8px 12px;text-align:left;color:var(--text-secondary);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Type</th>
        <th style="padding:8px 12px;text-align:left;color:var(--text-secondary);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">ID</th>
        <th style="padding:8px 12px;text-align:left;color:var(--text-secondary);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.5px">Datum</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 12px;font-weight:600">${esc(r.action)}</td>
        <td style="padding:8px 12px;color:var(--text-secondary)">${esc(r.entity_type||'—')}</td>
        <td style="padding:8px 12px;color:var(--text-muted);font-size:12px">${esc(r.entity_id||'—')}</td>
        <td style="padding:8px 12px;color:var(--text-muted);font-size:12px">${r.created_at ? new Date(r.created_at).toLocaleString('nl-NL') : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
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
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="auditlog" onclick="switchSettingsTab('auditlog')"><i class="ti ti-list-search"></i> Audit log</button>` : ''}
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="components" onclick="switchSettingsTab('components')"><i class="ti ti-puzzle"></i> 🧩 Components</button>` : ''}
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="templates" onclick="switchSettingsTab('templates')"><i class="ti ti-palette"></i> 🎨 Templates</button>` : ''}
      ${isAdmin() ? `<button class="settings-nav-item" data-tab="changelog" onclick="switchSettingsTab('changelog')"><i class="ti ti-history"></i> Changelog</button>` : ''}
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
            <div class="stg-title">IMAP — reply detectie
              ${s.gmailConfigured ? `<span class="stg-status-badge stg-badge-green"><i class="ti ti-check"></i> Ingesteld</span>` : `<span class="stg-status-badge stg-badge-amber"><i class="ti ti-alert-triangle"></i> Niet ingesteld</span>`}
            </div>
            <div class="stg-sub">Verbind uw inbox om antwoorden van prospects automatisch te detecteren. Gebruik uw <strong>info@agencyai.info</strong> gegevens (Soverin — imap.soverin.net:993).</div>
          </div>
          <div class="stg-grid-2">
            <div class="stg-field">
              <label class="stg-label">E-MAILADRES</label>
              <input type="email" class="stg-input" id="gmailAddress" value="${s.gmailAddress || 'info@agencyai.info'}" placeholder="info@agencyai.info">
            </div>
            <div class="stg-field">
              <label class="stg-label">WACHTWOORD ${s.gmailPasswordSet ? '<span class="stg-status-badge stg-badge-green" style="font-size:10px">Ingesteld</span>' : ''}</label>
              <input type="password" class="stg-input" id="gmailPassword" placeholder="${s.gmailPasswordSet ? '(laat leeg om ongewijzigd te laten)' : 'Wachtwoord van info@agencyai.info'}">
            </div>
          </div>
          <div class="stg-toggle-row">
            <label class="toggle-wrap">
              <input type="checkbox" id="replyDetection" ${s.replyDetection !== false ? 'checked' : ''}>
              <span class="toggle"></span>
              <span class="toggle-label">Reply detectie inschakelen</span>
            </label>
            <p class="toggle-hint">Controleert elke 2 uur uw inbox (imap.soverin.net) op antwoorden van prospects</p>
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
            <button class="btn btn-ghost btn-sm" id="saveGmailBtn"><i class="ti ti-device-floppy"></i> Opslaan</button>
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
              <div class="stg-field"><label class="stg-label">ROL</label>
                <select class="stg-input form-select" id="newUserRole" onchange="document.getElementById('newUserPermsWrap').style.display=this.value==='employee'?'':'none'">
                  <option value="employee">Medewerker</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div id="newUserPermsWrap">
              ${buildPermissionsChecklist('newUser', PRESET_MEDEWERKER)}
            </div>
            <button class="btn btn-primary btn-sm stg-save-btn" onclick="addUser()"><i class="ti ti-plus"></i> Gebruiker aanmaken</button>
          </div>
        </div>
      </div>
      ` : ''}

      <!-- ── Gevaarlijke zone ── -->
      <div class="settings-tab-pane" id="stab-auditlog">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-list-search" style="margin-right:6px"></i>Audit log</div>
            <div class="stg-sub">Laatste 100 admin acties in het systeem</div>
          </div>
          <div id="auditLogContent"><div style="color:var(--text-muted);font-size:13px">Laden...</div></div>
        </div>
      </div>

      <!-- Components tab (Task 19) -->
      <div class="settings-tab-pane" id="stab-components">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-puzzle" style="margin-right:6px"></i>🧩 Component bibliotheek</div>
            <div class="stg-sub">12 herbruikbare HTML-componenten voor website builds</div>
          </div>
          <div id="componentsTabContent"><div style="color:var(--text-secondary);font-size:13px">Laden...</div></div>
        </div>
      </div>

      <!-- Templates tab (Task 20) -->
      <div class="settings-tab-pane" id="stab-templates">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-palette" style="margin-right:6px"></i>🎨 Template bibliotheek</div>
            <div class="stg-sub">Website stijl-templates voor verschillende niches</div>
          </div>
          <div id="templatesTabContent"><div style="color:var(--text-secondary);font-size:13px">Laden...</div></div>
        </div>
      </div>

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

      <!-- Changelog tab (Task 50) -->
      <div class="settings-tab-pane" id="stab-changelog">
        <div class="stg-section">
          <div class="stg-section-header">
            <div class="stg-title"><i class="ti ti-history" style="margin-right:6px"></i>Changelog</div>
            <div class="stg-sub">Wat is er recent veranderd in het systeem</div>
          </div>
          <div id="changelogContent"><div style="color:var(--text-secondary);font-size:13px">Laden...</div></div>
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
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Opslaan';
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
    if (!table) return toast('Diensten tabel niet gevonden', 'error');
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
  if (document.getElementById('liveRunCard') && typeof startRunProgressPoll === 'function') startRunProgressPoll();

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
    if (typeof stopRunProgressPoll === 'function') stopRunProgressPoll();
    const card = document.getElementById('liveRunCard');
    if (card) card.style.display = 'none';
  }
}


// ─── Components tab (Task 19) ─────────────────────────────────────────────────
async function loadComponentsTab() {
  const el = document.getElementById('componentsTabContent');
  if (!el) return;
  const components = await apiJSON('/api/components') || [];
  if (!components.length) { el.innerHTML = '<p style="color:var(--text-secondary);font-size:13px;">Geen components gevonden.</p>'; return; }
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-top:16px;">
      ${components.map(c => `
        <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">
          <div style="background:var(--surface-2);padding:12px;font-weight:600;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
            <span>🧩 ${c.name}</span>
            <a href="${c.url}" target="_blank" style="font-size:11px;color:var(--accent);text-decoration:none;">Bekijk →</a>
          </div>
          <iframe src="${c.url}" style="width:100%;height:180px;border:none;display:block;pointer-events:none;transform:scale(0.7);transform-origin:top left;width:143%;height:257px;" scrolling="no"></iframe>
        </div>`).join('')}
    </div>`;
}

// ─── Templates tab (Task 20) ──────────────────────────────────────────────────
async function loadTemplatesTab() {
  const el = document.getElementById('templatesTabContent');
  if (!el) return;
  const templates = await apiJSON('/api/templates') || [];
  el.innerHTML = `
    <button onclick="openAddTemplateModal()" class="btn btn-primary btn-sm" style="margin-bottom:16px;margin-top:8px;">+ Nieuw template</button>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="background:var(--surface-2);">
          <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Kleuren</th>
          <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Naam</th>
          <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Niche</th>
          <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Fonts</th>
          <th style="padding:10px 12px;text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Acties</th>
        </tr></thead>
        <tbody>
          ${templates.map(t => `<tr style="border-bottom:1px solid var(--border);">
            <td style="padding:10px 12px;">
              <div style="display:flex;gap:4px;">
                <div style="width:20px;height:20px;border-radius:4px;background:${esc(t.bg_color||'#fff')};border:1px solid var(--border);" title="Background"></div>
                <div style="width:20px;height:20px;border-radius:4px;background:${esc(t.primary_color||'#111')};" title="Primary"></div>
                <div style="width:20px;height:20px;border-radius:4px;background:${esc(t.accent_color||'#6366f1')};" title="Accent"></div>
              </div>
            </td>
            <td style="padding:10px 12px;font-weight:600;">${esc(t.name)}</td>
            <td style="padding:10px 12px;color:var(--text-secondary);">${esc(t.niche)}</td>
            <td style="padding:10px 12px;color:var(--text-secondary);font-size:11px;">${esc(t.font_heading||'')} / ${esc(t.font_body||'')}</td>
            <td style="padding:10px 12px;">
              <button onclick="deleteTemplate(${t.id})" class="btn btn-ghost btn-sm" style="color:#ef4444;border-color:#ef4444;font-size:11px;">Verwijder</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

async function deleteTemplate(id) {
  if (!confirm('Template verwijderen?')) return;
  await api('/api/templates/' + id, { method: 'DELETE' });
  loadTemplatesTab();
  toast('Template verwijderd');
}

function openAddTemplateModal() {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Nieuw template</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Naam</label><input id="tmpl_name" class="input-field" style="width:100%" placeholder="Restaurant Elegant"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Niche</label><input id="tmpl_niche" class="input-field" style="width:100%" placeholder="restaurant"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Primary kleur</label><input id="tmpl_primary" type="color" value="#111111" style="width:100%;height:38px;border-radius:6px;border:1px solid var(--border);cursor:pointer;"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Accent kleur</label><input id="tmpl_accent" type="color" value="#6366f1" style="width:100%;height:38px;border-radius:6px;border:1px solid var(--border);cursor:pointer;"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Achtergrond</label><input id="tmpl_bg" type="color" value="#ffffff" style="width:100%;height:38px;border-radius:6px;border:1px solid var(--border);cursor:pointer;"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Heading font</label><input id="tmpl_fh" class="input-field" style="width:100%" placeholder="Inter"></div>
      <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Body font</label><input id="tmpl_fb" class="input-field" style="width:100%" placeholder="Inter"></div>
    </div>
    <div><label style="font-size:12px;font-weight:600;display:block;margin-bottom:4px;">Stijl beschrijving</label><input id="tmpl_style" class="input-field" style="width:100%" placeholder="Modern en strak"></div>
    <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:16px;">
      <button onclick="closeModal()" class="btn btn-secondary">Annuleren</button>
      <button onclick="saveNewTemplate()" class="btn btn-primary">Opslaan</button>
    </div>
  `);
}

async function saveNewTemplate() {
  const body = {
    name: document.getElementById('tmpl_name')?.value,
    niche: document.getElementById('tmpl_niche')?.value,
    primary_color: document.getElementById('tmpl_primary')?.value,
    accent_color: document.getElementById('tmpl_accent')?.value,
    bg_color: document.getElementById('tmpl_bg')?.value,
    font_heading: document.getElementById('tmpl_fh')?.value,
    font_body: document.getElementById('tmpl_fb')?.value,
    style_description: document.getElementById('tmpl_style')?.value
  };
  if (!body.name || !body.niche) { toast('Naam en niche zijn verplicht', 'error'); return; }
  await api('/api/templates', { method: 'POST', body: JSON.stringify(body) });
  closeModal();
  loadTemplatesTab();
  toast('Template opgeslagen');
}

// ─── Also add "Setup opnieuw doorlopen" button to account tab (Task 13) ───────
// Injected after renderSettings runs
function _injectOnboardingResetBtn() {
  const accountTab = document.getElementById('stab-account');
  if (!accountTab || accountTab.querySelector('.onboarding-reset-btn')) return;
  const btn = document.createElement('div');
  btn.innerHTML = `<button class="onboarding-reset-btn btn btn-ghost btn-sm" style="margin-top:8px;" onclick="showOnboardingWizard()">
    <i class="ti ti-refresh"></i> Setup opnieuw doorlopen
  </button>`;
  accountTab.querySelector('.stg-section')?.appendChild(btn.firstElementChild);
}

// ─── Task 50 — Changelog ──────────────────────────────────────────────────────
async function loadChangelogTab() {
  const el = document.getElementById('changelogContent');
  if (!el) return;
  const entries = await apiJSON('/api/changelog') || [];
  const TYPE_LABELS = { new: 'Nieuw', fix: 'Fix', improve: 'Verbeterd' };
  el.innerHTML = entries.map(e => `
    <div class="changelog-entry">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span class="changelog-version">v${esc(e.version)}</span>
        <span class="changelog-date">${esc(e.date)}</span>
      </div>
      <ul class="changelog-items">
        ${(e.items||[]).map(i => `<li><span class="changelog-badge badge-${i.type}">${TYPE_LABELS[i.type]||i.type}</span>${esc(i.text)}</li>`).join('')}
      </ul>
    </div>`).join('') || '<p style="color:var(--text-secondary);">Geen changelog gevonden.</p>';
}

// ─── Task 44 — IP Whitelist UI ────────────────────────────────────────────────
async function loadIpWhitelistSection() {
  const data = await apiJSON('/api/settings/ip-whitelist');
  const list = data?.whitelist || [];
  const el = document.getElementById('ipWhitelistContent');
  if (!el) return;
  el.innerHTML = `
    <div style="margin-bottom:12px;">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">Laat leeg om alle IPs toe te staan. Wanneer ingevuld, kunnen alleen deze IP-adressen inloggen als admin.</p>
      <textarea id="ipWhitelistInput" class="input-field" rows="4" style="width:100%;font-family:monospace;font-size:13px;" placeholder="Één IP per regel, bijv.:\n192.168.1.100\n10.0.0.1">${list.join('\n')}</textarea>
    </div>
    <button onclick="saveIpWhitelist()" class="btn btn-primary btn-sm">Opslaan</button>`;
}

async function saveIpWhitelist() {
  const val = document.getElementById('ipWhitelistInput')?.value || '';
  const whitelist = val.split('\n').map(l=>l.trim()).filter(Boolean);
  await api('/api/settings/ip-whitelist', { method:'POST', body: JSON.stringify({ whitelist }) });
  toast('IP whitelist opgeslagen');
}

// ─── Task 37 — Blacklist CSV import UI ────────────────────────────────────────
function openBlacklistCsvModal() {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📋 Blacklist CSV importeren</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Eén domein of bedrijfsnaam per regel.</p>
    <textarea id="blCsvInput" class="input-field" rows="8" style="width:100%;font-family:monospace;font-size:13px;" placeholder="voorbeeld.nl&#10;spambedrijf.com&#10;tegoed-oplichters.nl"></textarea>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <select id="blCsvType" class="input-field" style="width:140px;">
        <option value="domain">Domein</option>
        <option value="company">Bedrijfsnaam</option>
      </select>
      <button onclick="_importBlacklistCsv()" class="btn btn-primary btn-sm">Importeren</button>
    </div>
    <div id="blCsvResult" style="margin-top:12px;"></div>
  `);
}

async function _importBlacklistCsv() {
  const csv = document.getElementById('blCsvInput')?.value;
  const type = document.getElementById('blCsvType')?.value || 'domain';
  const data = await apiJSON('/api/blacklist/import', { method:'POST', body: JSON.stringify({ csv, type }) });
  const el = document.getElementById('blCsvResult');
  if (el) el.innerHTML = `<div style="padding:10px;background:#dcfce7;border-radius:8px;font-size:13px;color:#15803d;">✓ ${data?.added||0} toegevoegd, ${data?.skipped||0} overgeslagen</div>`;
}

// ─── Task 42 — Settings export/import UI ─────────────────────────────────────
function exportSettings() {
  window.open('/api/settings/export', '_blank');
}

function openSettingsImportModal() {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📥 Instellingen importeren</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px;">Plak een eerder geëxporteerd settings.json hieronder.</p>
    <textarea id="importSettingsJson" class="input-field" rows="10" style="width:100%;font-family:monospace;font-size:12px;" placeholder='{"agencyName":"...", "services": [...]}'></textarea>
    <div style="margin-top:12px;display:flex;justify-content:flex-end;gap:10px;">
      <button onclick="closeModal()" class="btn btn-secondary">Annuleren</button>
      <button onclick="_doImportSettings()" class="btn btn-primary">Importeren</button>
    </div>
  `);
}

async function _doImportSettings() {
  try {
    const json = JSON.parse(document.getElementById('importSettingsJson')?.value || '{}');
    await api('/api/settings/import', { method:'POST', body: JSON.stringify(json) });
    closeModal(); toast('Instellingen geïmporteerd — herlaad de pagina');
  } catch { toast('Ongeldige JSON', 'error'); }
}

// ─── Task 38 — Fuzzy duplicate detection UI ───────────────────────────────────
async function showFuzzyDuplicates() {
  const data = await apiJSON('/api/leads/fuzzy-duplicates');
  const dupes = data?.duplicates || [];
  if (!dupes.length) { toast('Geen fuzzy duplicaten gevonden'); return; }
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">🔍 Fuzzy duplicaten (${dupes.length})</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <div style="max-height:400px;overflow-y:auto;">
      ${dupes.map(d => `
        <div style="padding:10px;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;font-size:13px;">
          <div style="flex:1;"><strong>${esc(d.name1)}</strong><br><strong>${esc(d.name2)}</strong></div>
          <div style="color:var(--text-secondary);">Afstand: ${d.distance}</div>
          <button onclick="quickDeleteLead&&quickDeleteLead('${d.lead2}','${d.name2}')" class="btn btn-ghost btn-sm" style="color:#ef4444;border-color:#ef4444;font-size:11px;">Verwijder 2e</button>
        </div>`).join('')}
    </div>
  `);
}

// ─── Settings-page functions (moved from project.js) ──────────────────────────

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
