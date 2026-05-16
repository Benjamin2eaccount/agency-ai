let config = { serverUrl: '', apiKey: '' };
let pageInfo = null;

async function loadConfig() {
  return new Promise(resolve => {
    chrome.storage.local.get(['serverUrl', 'apiKey'], data => {
      config.serverUrl = data.serverUrl || '';
      config.apiKey    = data.apiKey    || '';
      resolve();
    });
  });
}

async function saveConfig() {
  const url = document.getElementById('serverUrl').value.trim().replace(/\/$/, '');
  const key = document.getElementById('apiKey').value.trim();
  if (!url) return toast('Vul een server URL in.', true);
  if (!key) return toast('Vul een API sleutel in.', true);

  config.serverUrl = url;
  config.apiKey    = key;
  chrome.storage.local.set({ serverUrl: url, apiKey: key });

  toast('Opgeslagen! Verbinding testen...');
  const ok = await testConnection();
  if (ok) {
    document.getElementById('setupPanel').style.display = 'none';
    document.getElementById('mainPanel').style.display  = '';
    document.getElementById('headerRight').style.display = '';
    loadData();
  }
}

async function testConnection() {
  try {
    const r = await fetch(`${config.serverUrl}/api/extension/data`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'X-API-Key': config.apiKey }
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function loadData() {
  if (!config.serverUrl || !config.apiKey) return;
  try {
    const r = await fetch(`${config.serverUrl}/api/extension/data`, {
      headers: { 'Authorization': `Bearer ${config.apiKey}`, 'X-API-Key': config.apiKey }
    });
    if (!r.ok) throw new Error('Unauthorized');
    const data = await r.json();

    document.getElementById('statPending').textContent = data.pendingCount || 0;
    document.getElementById('statLeads').textContent   = data.totalLeads   || 0;
    document.getElementById('statClients').textContent = data.clientCount  || 0;

    renderInbox(data.pending || []);
  } catch (e) {
    document.getElementById('inboxList').innerHTML =
      `<div class="error-msg">Verbindingsfout: ${e.message}</div>`;
  }
}

function renderInbox(items) {
  const el = document.getElementById('inboxList');
  if (!items.length) {
    el.innerHTML = '<div class="empty-state">Geen items in inbox</div>';
    return;
  }
  el.innerHTML = items.map(i => {
    const score = i.score || 0;
    const cls   = score >= 8 ? 'score-high' : score >= 6 ? 'score-mid' : 'score-low';
    return `
      <div class="inbox-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div class="inbox-item-name">${esc(i.companyName)}</div>
          <span class="score-pill ${cls}">${score}/10</span>
        </div>
        <div class="inbox-item-meta">
          <span>${esc(i.location || '')}</span>
          ${i.niche ? `<span class="badge badge-blue">${esc(i.niche)}</span>` : ''}
          ${i.estimatedValue ? `<span>€${(i.estimatedValue/1000).toFixed(1)}k</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function extractPageInfo() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return resolve(null);
      chrome.tabs.sendMessage(tabs[0].id, { type: 'EXTRACT_COMPANY' }, response => {
        if (chrome.runtime.lastError || !response) {
          resolve({ companyName: tabs[0].title?.split(/[|\-–]/)[0].trim() || '', websiteUrl: tabs[0].url || '' });
        } else {
          resolve(response);
        }
      });
    });
  });
}

async function addCurrentPage() {
  const btn = document.getElementById('addPageBtn');
  btn.disabled = true;
  btn.innerHTML = '<div class="spinner"></div> Analyseren...';

  const niche = document.getElementById('nicheSelect').value;
  const info  = pageInfo || {};

  try {
    const r = await fetch(`${config.serverUrl}/api/analyze-company`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
        'X-API-Key':     config.apiKey
      },
      body: JSON.stringify({
        companyName:     info.companyName || 'Onbekend bedrijf',
        websiteUrl:      info.websiteUrl  || '',
        instagramHandle: info.instagramHandle || '',
        niche,
        location:  info.location || '',
        country:   info.country  || 'NL'
      })
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Fout bij toevoegen');
    toast(`${esc(data.item?.companyName || 'Bedrijf')} toegevoegd — score ${data.item?.score || '?'}/10`);
    loadData();
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg> Toevoegen aan pipeline';
  }
}

function showSetup() {
  document.getElementById('setupPanel').style.display = '';
  document.getElementById('mainPanel').style.display  = 'none';
  document.getElementById('serverUrl').value = config.serverUrl;
  document.getElementById('apiKey').value    = config.apiKey;
}

function toast(msg, isError = false) {
  const el = document.getElementById('toastEl');
  el.textContent = msg;
  el.style.background = isError ? '#dc2626' : '#111';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2800);
}

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

async function init() {
  await loadConfig();

  if (!config.serverUrl || !config.apiKey) {
    document.getElementById('setupPanel').style.display = '';
    document.getElementById('headerSub').textContent    = 'Instellen vereist';
    return;
  }

  document.getElementById('headerSub').textContent     = config.serverUrl.replace(/^https?:\/\//, '');
  document.getElementById('headerRight').style.display = '';
  document.getElementById('mainPanel').style.display   = '';

  pageInfo = await extractPageInfo();
  if (pageInfo) {
    document.getElementById('previewName').textContent = pageInfo.companyName || pageInfo.pageTitle || '(onbekend)';
    document.getElementById('previewUrl').textContent  = pageInfo.websiteUrl  || '';
  }

  loadData();
}

init();
