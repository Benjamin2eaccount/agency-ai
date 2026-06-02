// ─── Chat ─────────────────────────────────────────────────────────────────────

async function renderChat() {
  document.getElementById('appView').innerHTML = `
    <div class="chat-layout">
      <div class="chat-sidebar">
        <div class="chat-sidebar-header">
          <span class="chat-sidebar-title">Team Chat</span>
          ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="createChatChannel()" title="Nieuw kanaal"><i class="ti ti-plus"></i></button>` : ''}
        </div>
        <div class="chat-sidebar-section-label">Kanalen</div>
        <div id="chatChannelList"></div>
        <div class="chat-sidebar-section-label" style="margin-top:12px">Directe berichten</div>
        <div id="chatDmList"></div>
      </div>
      <div class="chat-main" id="chatMain">
        <div class="chat-empty-state">
          <i class="ti ti-message-circle" style="font-size:40px;color:var(--border)"></i>
          <p class="text-secondary" style="margin-top:8px">Selecteer een kanaal of teamlid</p>
        </div>
      </div>
    </div>
  `;

  const [channels, dmUsers] = await Promise.all([
    apiJSON('/api/chat/channels'),
    apiJSON('/api/chat/users')
  ]);
  if (!channels) return;
  state._chatChannels = channels;
  state._chatDmUsers = dmUsers || [];
  state._activeChannelId = null;
  state._activeDmUserId = null;

  renderChatChannelList(channels);
  renderChatDmList(dmUsers || []);

  // Auto-open first channel
  if (channels.length > 0) openChatChannel(channels[0].id);
}

function renderChatChannelList(channels) {
  const el = document.getElementById('chatChannelList');
  if (!el) return;
  el.innerHTML = channels.map(ch => `
    <button class="chat-channel-btn${state._activeChannelId === ch.id ? ' active' : ''}" onclick="openChatChannel('${ch.id}')">
      <span class="chat-channel-hash">#</span>
      <span class="chat-channel-name">${esc(ch.name)}</span>
      ${ch.lastMessage ? `<span class="chat-channel-preview">${esc(ch.lastMessage.name)}: ${esc(ch.lastMessage.text).slice(0,30)}</span>` : ''}
    </button>
  `).join('');
}

function renderChatDmList(users) {
  const el = document.getElementById('chatDmList');
  if (!el) return;
  if (!users.length) {
    el.innerHTML = `<div style="padding:6px 12px;font-size:12px;color:var(--text-muted)">Geen andere teamleden</div>`;
    return;
  }
  el.innerHTML = users.map(u => `
    <button class="chat-channel-btn${state._activeDmUserId === u.id ? ' active' : ''}" onclick="openDmChannel('${u.id}')">
      <span class="chat-dm-avatar" style="background:${u.role === 'admin' ? '#111' : '#2563eb'}">${(u.name || u.username)[0].toUpperCase()}</span>
      <span class="chat-channel-name">${esc(u.name || u.username)}</span>
      <span class="chat-dm-role">${u.role === 'admin' ? 'Admin' : 'Medewerker'}</span>
    </button>
  `).join('');
}

async function openDmChannel(partnerId) {
  if (state._chatPollTimer) { clearInterval(state._chatPollTimer); state._chatPollTimer = null; }
  state._activeDmUserId = partnerId;
  state._activeChannelId = null;
  const partner = (state._chatDmUsers || []).find(u => u.id === partnerId);

  const main = document.getElementById('chatMain');
  if (!main) return;

  main.innerHTML = `
    <div class="chat-header">
      <div style="display:flex;align-items:center;gap:10px">
        <span class="chat-dm-avatar" style="background:${partner?.role === 'admin' ? '#111' : '#2563eb'};font-size:14px">${(partner?.name || partner?.username || '?')[0].toUpperCase()}</span>
        <div>
          <span class="chat-header-name">${esc(partner?.name || partner?.username || 'Onbekend')}</span>
          <span class="chat-header-desc">${partner?.role === 'admin' ? 'Admin' : 'Medewerker'}</span>
        </div>
      </div>
    </div>
    <div class="chat-messages" id="chatMessages"><div class="loading-state"><div class="spinner"></div></div></div>
    <form class="chat-input-row" id="chatForm" onsubmit="sendDmMessage(event,'${partnerId}')">
      <input type="text" class="chat-input" id="chatInput" placeholder="Bericht naar ${esc(partner?.name || '')}..." autocomplete="off" maxlength="2000">
      <button type="submit" class="btn btn-primary btn-sm"><i class="ti ti-send"></i></button>
    </form>
  `;

  document.getElementById('chatInput')?.focus();
  renderChatChannelList(state._chatChannels || []);
  renderChatDmList(state._chatDmUsers || []);

  await loadDmMessages(partnerId, true);
  state._chatLastSince = new Date().toISOString();
  state._chatPollTimer = setInterval(() => pollDmMessages(partnerId), 3000);
}

async function loadDmMessages(partnerId, scrollBottom = false) {
  const msgs = await apiJSON(`/api/chat/dm/${partnerId}/messages?limit=100`);
  if (!msgs) return;
  renderDmMessages(msgs, partnerId);
  if (scrollBottom) {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }
}

async function pollDmMessages(partnerId) {
  if (state._activeDmUserId !== partnerId) return;
  const since = state._chatLastSince || '';
  const msgs = await apiJSON(`/api/chat/dm/${partnerId}/messages?since=${encodeURIComponent(since)}&limit=50`);
  if (!msgs || msgs.length === 0) return;
  state._chatLastSince = msgs[msgs.length - 1].createdAt;
  const el = document.getElementById('chatMessages');
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  msgs.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildDmMessageHTML(msg);
    el.appendChild(div);
  });
  if (atBottom) el.scrollTop = el.scrollHeight;
}

function renderDmMessages(msgs, partnerId) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (!msgs.length) {
    el.innerHTML = '<div class="chat-messages-empty">Nog geen berichten. Stuur het eerste bericht!</div>';
    return;
  }
  let html = '';
  let lastDate = '';
  for (const msg of msgs) {
    const d = new Date(msg.createdAt).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    if (d !== lastDate) { html += `<div class="chat-date-divider"><span>${d}</span></div>`; lastDate = d; }
    html += `<div class="chat-message" data-id="${msg.id}">${buildDmMessageHTML(msg)}</div>`;
  }
  el.innerHTML = html;
}

function buildDmMessageHTML(msg) {
  const myId = (() => { try { return JSON.parse(atob(getToken().split('.')[1])).id; } catch { return null; } })();
  const isOwn = msg.fromId === myId;
  const canDelete = isOwn || isAdmin();
  return `
    <div class="chat-msg-avatar" style="background:${msg.fromRole === 'admin' ? '#111' : '#2563eb'}">${(msg.fromName || '?')[0].toUpperCase()}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${esc(msg.fromName || '')}${isOwn ? ' <span style="font-size:10px;color:var(--text-muted)">(jij)</span>' : ''}</span>
        <span class="chat-msg-time">${new Date(msg.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>
        ${canDelete ? `<button class="chat-msg-delete" onclick="deleteDmMessage('${msg.id}')" title="Verwijder"><i class="ti ti-trash"></i></button>` : ''}
      </div>
      <div class="chat-msg-text">${esc(msg.text).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

async function sendDmMessage(e, partnerId) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const res = await api(`/api/chat/dm/${partnerId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  if (!res?.ok) { toast('Verzenden mislukt.', 'error'); input.value = text; return; }
  const msg = await res.json();
  const el = document.getElementById('chatMessages');
  if (el) {
    const emptyMsg = el.querySelector('.chat-messages-empty');
    if (emptyMsg) emptyMsg.remove();
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildDmMessageHTML(msg);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  state._chatLastSince = msg.createdAt;
}

async function deleteDmMessage(id) {
  const res = await api(`/api/chat/dm/messages/${id}`, { method: 'DELETE' });
  if (res?.ok) document.querySelector(`.chat-message[data-id="${id}"]`)?.remove();
  else toast('Verwijderen mislukt.', 'error');
}

async function openChatChannel(channelId) {
  if (state._chatPollTimer) { clearInterval(state._chatPollTimer); state._chatPollTimer = null; }
  state._activeChannelId = channelId;
  const ch = (state._chatChannels || []).find(c => c.id === channelId);

  const main = document.getElementById('chatMain');
  if (!main) return;

  main.innerHTML = `
    <div class="chat-header">
      <div>
        <span class="chat-header-name">#${esc(ch?.name || '')}</span>
        ${ch?.description ? `<span class="chat-header-desc">${esc(ch.description)}</span>` : ''}
      </div>
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm btn-danger-ghost" onclick="deleteChatChannel('${channelId}')"><i class="ti ti-trash"></i></button>` : ''}
    </div>
    <div class="chat-messages" id="chatMessages"><div class="loading-state"><div class="spinner"></div></div></div>
    <form class="chat-input-row" id="chatForm" onsubmit="sendChatMessage(event,'${channelId}')">
      <input type="text" class="chat-input" id="chatInput" placeholder="Bericht naar #${esc(ch?.name || '')}..." autocomplete="off" maxlength="2000">
      <button type="submit" class="btn btn-primary btn-sm"><i class="ti ti-send"></i></button>
    </form>
  `;

  document.getElementById('chatInput')?.focus();
  renderChatChannelList(state._chatChannels || []);

  // Load initial messages
  await loadChatMessages(channelId, true);

  // Poll for new messages every 3 seconds
  state._chatLastSince = new Date().toISOString();
  state._chatPollTimer = setInterval(() => pollChatMessages(channelId), 3000);
}

async function loadChatMessages(channelId, scrollBottom = false) {
  const msgs = await apiJSON(`/api/chat/channels/${channelId}/messages?limit=100`);
  if (!msgs) return;
  renderChatMessages(msgs);
  if (scrollBottom) {
    const el = document.getElementById('chatMessages');
    if (el) el.scrollTop = el.scrollHeight;
  }
}

async function pollChatMessages(channelId) {
  if (state._activeChannelId !== channelId) return;
  const since = state._chatLastSince || '';
  const msgs = await apiJSON(`/api/chat/channels/${channelId}/messages?since=${encodeURIComponent(since)}&limit=50`);
  if (!msgs || msgs.length === 0) return;
  state._chatLastSince = msgs[msgs.length - 1].createdAt;

  const el = document.getElementById('chatMessages');
  if (!el) return;
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

  msgs.forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildChatMessageHTML(msg);
    el.appendChild(div);
  });

  if (atBottom) el.scrollTop = el.scrollHeight;
}

function renderChatMessages(msgs) {
  const el = document.getElementById('chatMessages');
  if (!el) return;
  if (msgs.length === 0) {
    el.innerHTML = '<div class="chat-messages-empty">Geen berichten nog. Stuur het eerste bericht!</div>';
    return;
  }

  let html = '';
  let lastDate = '';
  for (const msg of msgs) {
    const d = new Date(msg.createdAt).toLocaleDateString('nl-NL', { weekday:'long', day:'numeric', month:'long' });
    if (d !== lastDate) {
      html += `<div class="chat-date-divider"><span>${d}</span></div>`;
      lastDate = d;
    }
    html += `<div class="chat-message" data-id="${msg.id}">${buildChatMessageHTML(msg)}</div>`;
  }
  el.innerHTML = html;
}

function buildChatMessageHTML(msg) {
  const myId = (() => { try { return JSON.parse(atob(getToken().split('.')[1])).id; } catch { return null; } })();
  const isOwn = msg.userId === myId;
  const canDelete = isOwn || isAdmin();
  return `
    <div class="chat-msg-avatar" style="background:${msg.role === 'admin' ? '#111' : '#2563eb'}">${(msg.name || msg.username)[0].toUpperCase()}</div>
    <div class="chat-msg-body">
      <div class="chat-msg-meta">
        <span class="chat-msg-name">${esc(msg.name || msg.username)}</span>
        <span class="chat-msg-time">${new Date(msg.createdAt).toLocaleTimeString('nl-NL', { hour:'2-digit', minute:'2-digit' })}</span>
        ${canDelete ? `<button class="chat-msg-delete" onclick="deleteChatMessage('${msg.id}')" title="Verwijder"><i class="ti ti-trash"></i></button>` : ''}
      </div>
      <div class="chat-msg-text">${esc(msg.text).replace(/\n/g, '<br>')}</div>
    </div>
  `;
}

async function sendChatMessage(e, channelId) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const text = input?.value?.trim();
  if (!text) return;
  input.value = '';
  const res = await api(`/api/chat/channels/${channelId}/messages`, { method: 'POST', body: JSON.stringify({ text }) });
  if (!res?.ok) { toast('Verzenden mislukt.', 'error'); input.value = text; return; }
  const msg = await res.json();
  // Append immediately without waiting for poll
  const el = document.getElementById('chatMessages');
  if (el) {
    const emptyMsg = el.querySelector('div[style*="Geen berichten"]');
    if (emptyMsg) emptyMsg.remove();
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.dataset.id = msg.id;
    div.innerHTML = buildChatMessageHTML(msg);
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
  }
  state._chatLastSince = msg.createdAt;
}

async function deleteChatMessage(id) {
  const res = await api(`/api/chat/messages/${id}`, { method: 'DELETE' });
  if (res?.ok) {
    document.querySelector(`.chat-message[data-id="${id}"]`)?.remove();
  } else {
    toast('Verwijderen mislukt.', 'error');
  }
}

async function createChatChannel() {
  const name = prompt('Kanaalnaam (bijv. marketing):')?.trim();
  if (!name) return;
  const desc = prompt('Omschrijving (optioneel):')?.trim() || '';
  const res = await api('/api/chat/channels', { method: 'POST', body: JSON.stringify({ name, description: desc }) });
  if (res?.ok) {
    const ch = await res.json();
    state._chatChannels = state._chatChannels || [];
    state._chatChannels.push({ ...ch, messageCount: 0, lastMessage: null });
    renderChatChannelList(state._chatChannels);
    openChatChannel(ch.id);
  } else {
    const d = res ? await res.json().catch(() => ({})) : {};
    toast(d.error || 'Aanmaken mislukt.', 'error');
  }
}

async function deleteChatChannel(id) {
  const ch = (state._chatChannels || []).find(c => c.id === id);
  if (!confirm(`Kanaal #${ch?.name} en alle berichten verwijderen?`)) return;
  const res = await api(`/api/chat/channels/${id}`, { method: 'DELETE' });
  if (res?.ok) {
    state._chatChannels = (state._chatChannels || []).filter(c => c.id !== id);
    renderChatChannelList(state._chatChannels);
    const main = document.getElementById('chatMain');
    if (main) main.innerHTML = `<div class="chat-empty-state"><i class="ti ti-message-circle" style="font-size:40px;color:var(--border)"></i><p class="text-secondary" style="margin-top:8px">Kanaal verwijderd</p></div>`;
    state._activeChannelId = null;
    if (state._chatChannels.length > 0) openChatChannel(state._chatChannels[0].id);
  } else toast('Verwijderen mislukt.', 'error');
}

