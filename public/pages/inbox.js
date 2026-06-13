// ─── Inbox ────────────────────────────────────────────────────────────────────
async function renderInbox() {
  document.getElementById('appView').innerHTML = `
    <style>
      .ib-card{border:1px solid var(--border,#2A2A2A);background:var(--surface,#1A1A1A);border-radius:10px;margin-bottom:12px;overflow:hidden;transition:border-color .15s}
      .ib-card:hover{border-color:var(--border-strong,#333)}
      .ib-card-head{display:flex;align-items:flex-start;gap:12px;padding:14px 16px 10px}
      .ib-avatar{width:36px;height:36px;border-radius:8px;font-size:13px;font-weight:700;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
      .ib-head-info{flex:1;min-width:0}
      .ib-company{font-size:15px;font-weight:700;color:var(--text,#F5F5F5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ib-meta{display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap}
      .ib-meta-tag{font-size:11px;color:var(--text-2,#999)}
      .ib-score-wrap{flex-shrink:0;text-align:right}
      .ib-score{font-size:22px;font-weight:800;line-height:1}
      .ib-score-sub{font-size:10px;color:var(--text-3,#666);margin-top:2px}
      .ib-type-badges{display:flex;gap:5px;padding:0 16px 10px;flex-wrap:wrap}
      .ib-type-badge{padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;border:1px solid}
      .ib-section{padding:0 16px 12px}
      .ib-section-title{font-size:10px;font-weight:600;color:var(--text-3,#666);text-transform:uppercase;letter-spacing:.07em;margin-bottom:6px;display:flex;align-items:center;gap:4px}
      .ib-problems-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:3px}
      .ib-problems-list li{font-size:12px;color:var(--text-2,#999);display:flex;align-items:flex-start;gap:5px}
      .ib-services-list{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:4px}
      .ib-services-list li{display:flex;align-items:center;justify-content:space-between;font-size:12px;color:var(--text-2,#999)}
      .ib-service-price{color:var(--success,#16A34A);font-weight:600;font-size:12px}
      .ib-email-row{padding:0 16px 10px;display:flex;align-items:center;gap:8px;font-size:12px;flex-wrap:wrap}
      .ib-email-verified{color:#16A34A;font-size:11px;font-weight:600}
      .ib-email-unverified{color:#D97706;font-size:11px;font-weight:600}
      .ib-ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      .ib-ab-ver{border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:10px;cursor:pointer;transition:all .15s}
      .ib-ab-ver.selected{border-color:var(--accent,#2563EB);background:rgba(37,99,235,.07)}
      .ib-ab-label{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;display:inline-block;margin-bottom:4px}
      .ib-ab-subject{font-size:12px;font-weight:600;color:var(--text,#F5F5F5);margin-bottom:4px}
      .ib-ab-preview{font-size:11px;color:var(--text-3,#666);line-height:1.4}
      .ib-footer{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-top:1px solid var(--border,#2A2A2A);gap:8px;flex-wrap:wrap}
      .ib-footer-left{display:flex;align-items:center;gap:6px}
      .ib-footer-right{display:flex;align-items:center;gap:6px}
      .ib-approve-btn{background:var(--accent,#2563EB);color:#fff;border:none;border-radius:6px;padding:7px 16px;font-size:13px;font-weight:600;cursor:pointer;transition:background .15s}
      .ib-approve-btn:hover{background:#1d4ed8}
      .ib-reject-btn{background:transparent;border:1px solid var(--border,#2A2A2A);color:var(--text-2,#999);border-radius:6px;padding:7px 12px;font-size:13px;cursor:pointer;transition:all .15s}
      .ib-reject-btn:hover{border-color:var(--danger,#DC2626);color:var(--danger,#DC2626)}
      .ib-ghost-btn{background:transparent;border:1px solid var(--border,#2A2A2A);color:var(--text-2,#999);border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;transition:all .15s;text-decoration:none;display:inline-flex;align-items:center;gap:4px}
      .ib-ghost-btn:hover{border-color:var(--border-strong,#333);color:var(--text,#F5F5F5)}
      .manual-email-input{background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:6px 10px;color:var(--text,#F5F5F5);font-size:12px;width:100%;margin-top:4px;outline:none;box-sizing:border-box}
      .manual-email-input:focus{border-color:var(--accent,#2563EB)}
      @media(max-width:600px){.ib-ab-grid{grid-template-columns:1fr}.ib-footer{flex-direction:column;align-items:stretch}.ib-footer-left,.ib-footer-right{justify-content:flex-end}}
    </style>
    <div class="page-header">
      <div>
        <div class="page-label">Beoordelen</div>
        <h1 class="page-title">Inbox</h1>
      </div>
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="inbox-kb-legend" title="Toetsenbordsnelkoppelingen">
          <span class="kb-key">A</span><span class="kb-hint">Goedkeuren</span>
          <span class="kb-key">R</span><span class="kb-hint">Afwijzen</span>
          <span class="kb-key">E</span><span class="kb-hint">Email</span>
          <span class="kb-key">S</span><span class="kb-hint">Volgende</span>
          <span class="kb-key">↑↓</span><span class="kb-hint">Navigeren</span>
        </div>
        <button class="btn btn-secondary btn-sm" id="checkRepliesBtn" onclick="triggerReplyCheck()" title="Controleer inbox nu op nieuwe replies">
          <i class="ti ti-mail-forward"></i> Controleer replies
        </button>
      </div>
    </div>
    <div id="swipeHint" style="display:none">
      <i class="ti ti-hand-finger"></i>
      <span>Swipe rechts = goedkeuren &nbsp;·&nbsp; swipe links = afwijzen</span>
      <button onclick="dismissSwipeHint()" aria-label="Sluiten"><i class="ti ti-x"></i></button>
    </div>
    <div id="inboxContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  const inbox = await apiJSON('/api/inbox') || [];
  state.inbox = inbox;
  const settings = await apiJSON('/api/settings') || {};
  state.settings = settings;

  const pending = inbox.filter(i => i.status === 'pending');
  const trashed = inbox.filter(i => i.status === 'disapproved');
  if (typeof updateInboxBadge === 'function') updateInboxBadge(pending.length);

  const container = document.getElementById('inboxContent');
  if (!container) return;

  if (!settings.resendConfigured) {
    container.innerHTML += `
      <div class="alert-banner alert-banner-amber" onclick="setView('settings');setTimeout(()=>document.querySelector('[data-tab=email]')?.click(),100)" style="cursor:pointer;margin-bottom:20px">
        <i class="ti ti-mail-off" style="font-size:16px"></i>
        <strong>Email niet ingesteld</strong>
        <span style="color:var(--text-secondary);font-weight:400">— voeg RESEND_API_KEY toe om emails te versturen. Klik om in te stellen &rarr;</span>
      </div>
    `;
  }

  if (pending.length === 0) {
    const nextRun = typeof getNextRunTime === 'function'
      ? getNextRunTime(state.settings?.dailyRunTime || '09:00')
      : { label: '—', countdown: '—', target: null };
    container.innerHTML = `
      <div class="empty-card">
        <i class="ti ti-inbox-off" style="font-size:48px;color:var(--border);margin-bottom:12px"></i>
        <h3 style="margin-bottom:8px">Inbox is leeg</h3>
        <p style="color:var(--text-secondary);margin-bottom:20px">Alle leads zijn beoordeeld — goed gedaan!</p>
        <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;margin-bottom:20px;text-align:left;min-width:260px">
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Volgende automatische run</div>
          <div style="font-size:18px;font-weight:700;color:var(--text-primary)">${nextRun.label}</div>
          <div style="font-size:12px;color:var(--accent);font-weight:600;margin-top:4px" id="inboxCountdown">${nextRun.countdown}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center">
          <button class="btn btn-primary" onclick="setView('runs')">
            <i class="ti ti-player-play"></i> Start handmatige run
          </button>
          <button class="btn btn-outline" onclick="setView('pipeline')">
            <i class="ti ti-git-branch"></i> Bekijk pipeline →
          </button>
        </div>
      </div>
    `;
    if (typeof startInboxCountdown === 'function') startInboxCountdown(nextRun.target);
    return;
  }

  const highScore = pending.filter(i => (i.score || 0) >= 8.0);
  const bulkBar = pending.length >= 3 ? `
    <div id="bulkBar" class="bulk-bar">
      <span class="bulk-bar-count">${pending.length} leads klaar voor beoordeling</span>
      ${highScore.length > 0 ? `
        <button class="btn btn-primary btn-sm" onclick="bulkApproveHigh()">
          <i class="ti ti-bolt"></i> ${highScore.length} × 8.0+ goedkeuren
        </button>
      ` : ''}
      <button class="btn btn-ghost btn-sm bulk-decline-all" onclick="bulkDeclineAll()" style="color:var(--danger);border-color:var(--danger)">
        <i class="ti ti-x"></i> Alle afwijzen
      </button>
      <button class="btn btn-ghost btn-sm" onclick="bulkSelectAll()"><i class="ti ti-checkbox"></i> Alles selecteren</button>
      <button class="btn btn-ghost btn-sm" onclick="bulkDeselectAll()"><i class="ti ti-square"></i> Deselecteren</button>
      <button class="btn btn-blue btn-sm" id="bulkApproveSelBtn" style="display:none" onclick="bulkApproveSelected()">
        <i class="ti ti-check"></i> Geselecteerde goedkeuren (<span id="bulkSelCount">0</span>)
      </button>
      <button class="btn btn-sm" id="bulkDeclineSelBtn" style="display:none;background:var(--danger);color:#fff" onclick="bulkDeclineSelected()">
        <i class="ti ti-x"></i> Geselecteerde afwijzen (<span id="bulkDeclineCount">0</span>)
      </button>
    </div>
  ` : '';

  let html = bulkBar + pending.map(item => buildInboxCard(item)).join('');

  if (trashed.length > 0) {
    html += `
      <div class="trash-section">
        <div class="trash-header">
          <i class="ti ti-trash"></i>
          <span class="trash-title">Prullenbak</span>
          <span class="badge badge-red">${trashed.length}</span>
          ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="emptyTrash()" style="margin-left:auto;color:var(--danger)">
            <i class="ti ti-trash"></i> Alles verwijderen
          </button>` : ''}
        </div>
        ${trashed.map(item => `
          <div class="trash-card">
            <div class="trash-card-body">
              <div class="trash-card-row">
                <span class="trash-company">${esc(item.companyName)}</span>
                <span class="text-secondary" style="font-size:12px">${esc(item.niche)} &bull; ${esc(item.location)}</span>
                ${item.score ? `<span class="score-pill score-${scoreColor(item.score)}">${Number(item.score).toFixed(1)}</span>` : ''}
              </div>
              ${item.email?.subject ? `<div class="trash-subject">${esc(item.email.subject)}</div>` : ''}
              ${item.disapprovedAt ? `<div class="trash-date">Afgewezen ${formatDate(item.disapprovedAt)}</div>` : ''}
            </div>
            <div class="trash-card-actions">
              <button class="btn btn-ghost btn-sm" onclick="restoreTrash('${item.id}')">
                <i class="ti ti-restore"></i> Herstel
              </button>
              ${isAdmin() ? `<button class="btn btn-ghost btn-sm" onclick="deleteTrash('${item.id}')" style="color:var(--danger)">
                <i class="ti ti-trash"></i>
              </button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = html;
  attachInboxHandlers();
  initSwipeHandlers();
  initInboxKeyboard();
}

function buildLinkedinDmCard(item) {
  const charCount = (item.linkedinDm || '').length;
  const dmEsc = esc(item.linkedinDm || '');
  const dmRaw = (item.linkedinDm || '').replace(/`/g, '\\`');
  return `
    <div class="inbox-card linkedin-dm-card" data-id="${item.id}" id="card-${item.id}">
      <div class="linkedin-dm-header">
        <span class="linkedin-dm-badge"><i class="ti ti-brand-linkedin"></i> LinkedIn DM — dag 7</span>
        <span class="linkedin-dm-company">${esc(item.companyName)}</span>
        <span class="linkedin-dm-meta">${esc(item.location)} &middot; score ${(item.score||0).toFixed(1)}</span>
      </div>
      <div class="linkedin-dm-body">${dmEsc.replace(/\n/g, '<br>')}</div>
      <div class="linkedin-dm-footer">
        <span class="char-count" style="font-size:11px;color:var(--text-muted)">${charCount}/280 tekens</span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost btn-sm" id="li-copy-${item.id}" onclick="copyLinkedinDm(\`${dmRaw}\`,'${item.id}')">
            <i class="ti ti-copy"></i> Kopiëren
          </button>
          <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(item.companyName || '')}" target="_blank" rel="noopener" title="Zoek op LinkedIn">
            <i class="ti ti-brand-linkedin"></i> Zoeken
          </a>
          ${item.linkedinUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(item.linkedinUrl)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Profiel</a>` : ''}
          <button class="btn btn-primary btn-sm" onclick="markLinkedinDmSent('${item.id}')">
            <i class="ti ti-check"></i> Verstuurd
          </button>
        </div>
      </div>
    </div>`;
}

function buildAiReplyCard(item) {
  const draftRaw = (item.aiDraft || '').replace(/`/g, '\\`');
  const lead = (state.leads || []).find(l => l.id === item.leadId);
  const alreadyClient  = lead?.status === 'client';
  const projectStarted = !!(lead?.projectStartedAt);

  const startProjectBtn = (!alreadyClient && !projectStarted)
    ? `<button class="btn btn-sm" style="background:#6366f1;color:#fff;border:none" onclick="startProjectFromInbox('${esc(item.id)}','${esc(item.leadId)}')">
         🚀 Start project
       </button>`
    : projectStarted
      ? `<span style="font-size:12px;background:#dcfce7;color:#166534;border-radius:6px;padding:4px 10px;font-weight:600">✓ Project gestart</span>`
      : '';

  return `
    <div class="inbox-card ai-reply-card" data-id="${item.id}" id="card-${item.id}">
      <div class="ai-reply-header">
        <span class="ai-reply-badge"><i class="ti ti-message-reply"></i> Reply ontvangen — AI antwoord klaar</span>
        <span class="ai-reply-company">${esc(item.companyName)}</span>
      </div>

      <div class="ai-reply-section">
        <div class="ai-reply-label"><i class="ti ti-quote"></i> Hun antwoord</div>
        <div class="ai-reply-original">${esc(item.originalReply || '(geen tekst gelezen)').replace(/\n/g, '<br>')}</div>
      </div>

      <div class="ai-reply-section">
        <div class="ai-reply-label"><i class="ti ti-robot"></i> AI antwoord concept</div>
        <textarea class="ai-reply-draft" id="aiDraft-${item.id}" rows="5">${esc(item.aiDraft || '')}</textarea>
      </div>

      <div class="ai-reply-actions">
        <button class="btn btn-ghost btn-sm" onclick="disapprove('${item.id}')">
          <i class="ti ti-x"></i> Overslaan
        </button>
        <button class="btn btn-primary btn-sm" onclick="sendAiReply('${item.id}')">
          <i class="ti ti-send"></i> Verstuur antwoord
        </button>
        ${startProjectBtn}
      </div>
    </div>`;
}

window.startProjectFromInbox = function(itemId, leadId) {
  console.log('[InboxStart] clicked, leadId:', leadId);
  console.log('[InboxStart] modal fn:', typeof openProjectConfigModal);
  window._inboxProjectStart = { itemId, leadId };
  openProjectConfigModal(leadId, false);
};


async function sendAiReply(id) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item) return;
  const draftEl = document.getElementById('aiDraft-' + id);
  const draft   = draftEl ? draftEl.value.trim() : item.aiDraft;
  if (!draft) return toast('Geen antwoord ingevuld', 'error');

  const card = document.getElementById('card-' + id);
  if (card) card.style.opacity = '0.5';

  try {
    const res = await api('/api/inbox/' + id + '/approve', {
      method: 'PATCH',
      body: JSON.stringify({ aiDraft: draft })
    });
    if (!res.ok) {
      const d = await res.json();
      toast(d.error || 'Verzenden mislukt', 'error');
      if (card) card.style.opacity = '';
      return;
    }
    state.inbox = (state.inbox || []).filter(i => i.id !== id);
    if (card) {
      card.style.transition = 'opacity 0.3s';
      card.style.opacity = '0';
      setTimeout(() => card.remove(), 300);
    }
    toast(`AI antwoord verstuurd naar ${item.companyName}`, 'success');
  } catch (e) {
    toast(e.message, 'error');
    if (card) card.style.opacity = '';
  }
}

function buildInboxCard(item) {
  if (item.type === 'linkedinDm') return buildLinkedinDmCard(item);
  if (item.type === 'ai_reply')   return buildAiReplyCard(item);

  const score = item.score || 0;
  const initials = (item.companyName || '?').slice(0, 2).toUpperCase();
  function _ibAvBg(n) {
    const c = (n || 'A').toUpperCase().charCodeAt(0);
    return c <= 69 ? '#2563EB' : c <= 74 ? '#7C3AED' : c <= 79 ? '#16A34A' : c <= 84 ? '#D97706' : '#DC2626';
  }
  const avatarBg   = _ibAvBg(item.companyName || '');
  const scoreColor2 = score >= 8 ? '#16A34A' : score >= 6 ? '#60A5FA' : score >= 4 ? '#D97706' : '#EF4444';

  const typeLabel = item.type === 'followup1' ? 'Follow-up #1' :
                    item.type === 'followup2' ? 'Follow-up #2' :
                    item.type === 'referral'  ? 'Referral' : 'Nieuw';
  const typeBadgeStyle = item.type?.startsWith('followup')
    ? 'background:rgba(217,119,6,.15);color:#D97706;border-color:rgba(217,119,6,.3)'
    : item.type === 'referral'
    ? 'background:rgba(139,92,246,.15);color:#A78BFA;border-color:rgba(139,92,246,.3)'
    : 'background:rgba(37,99,235,.15);color:#60A5FA;border-color:rgba(37,99,235,.3)';
  const langFlag = item.language === 'nl' ? '🇳🇱' : item.language === 'en' ? '🇬🇧' : item.language === 'de' ? '🇩🇪' : item.language === 'fr' ? '🇫🇷' : item.language === 'it' ? '🇮🇹' : '';

  const emailAlreadySent = item.contactEmail && (state.leads || []).some(l =>
    l.id !== item.leadId &&
    (l.contactEmail || '').toLowerCase() === item.contactEmail.toLowerCase() &&
    ['sent', 'replied', 'client', 'scheduled'].includes(l.status)
  );

  const emailSection = item.emailVerified
    ? `<div class="ib-email-row"><i class="ti ti-mail" style="color:var(--text-3,#666)"></i><span style="color:var(--text-2,#999)">${esc(item.contactEmail)}</span><span class="ib-email-verified"><i class="ti ti-check"></i> Geverifieerd</span></div>`
    : item.contactEmail
    ? `<div class="ib-email-row"><i class="ti ti-mail" style="color:var(--text-3,#666)"></i><span style="color:var(--text-2,#999)">${esc(item.contactEmail)}</span><span class="ib-email-unverified"><i class="ti ti-alert-triangle"></i> Niet geverifieerd</span></div>`
    : `<div class="ib-section"><span style="font-size:12px;color:var(--text-3,#666)"><i class="ti ti-mail-off"></i> Geen email gevonden</span><br><input type="email" class="manual-email-input" id="manualEmail-${item.id}" placeholder="Voer email handmatig in…" onclick="event.stopPropagation()" oninput="event.stopPropagation()"></div>`;

  const openerSection = item.emailOpener
    ? `<div class="ib-section" style="border-top:1px solid var(--border,#2A2A2A);padding-top:10px"><div style="font-size:12px;color:var(--text-2,#999);font-style:italic"><i class="ti ti-quote" style="color:var(--text-3,#666);margin-right:4px"></i>${esc(item.emailOpener)}</div></div>`
    : '';

  const problemsSection = item.problems?.length ? `
    <div class="ib-section">
      <div class="ib-section-title"><i class="ti ti-alert-triangle" style="color:var(--danger,#DC2626)"></i> Problemen</div>
      <ul class="ib-problems-list">${item.problems.map(p => `<li><i class="ti ti-point-filled" style="color:var(--danger,#DC2626);flex-shrink:0"></i>${esc(p)}</li>`).join('')}</ul>
    </div>` : '';

  const servicesSection = item.services?.length ? `
    <div class="ib-section">
      <div class="ib-section-title"><i class="ti ti-currency-euro" style="color:var(--success,#16A34A)"></i> Kansen</div>
      <ul class="ib-services-list">${item.services.map(s => `<li><span>${esc(s.name)}</span><span class="ib-service-price">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span></li>`).join('')}</ul>
      ${item.estimatedValue ? `<div style="font-size:12px;color:var(--text-2,#999);margin-top:6px">Maandwaarde: <strong style="color:var(--success,#16A34A)">€${item.estimatedValue.toLocaleString('nl-NL')}</strong></div>` : ''}
    </div>` : '';

  const subjectsSection = item.subjectOptions?.length >= 3 ? `
    <div class="ib-section">
      <div class="ib-section-title"><i class="ti ti-tag" style="color:var(--accent,#2563EB)"></i> Onderwerpopties</div>
      <div id="subjectChips-${item.id}" style="display:flex;flex-direction:column;gap:4px">
        ${item.subjectOptions.map((s, i) => `
          <button class="subject-chip${i === 0 ? ' subject-chip-active' : ''}" onclick="selectSubject('${item.id}',${i})" title="${esc(s)}">
            <span class="subject-chip-num">${i + 1}</span>
            <span class="subject-chip-text">${esc(s)}</span>
          </button>`).join('')}
      </div>
    </div>` : '';

  const abSection = item.emailA && item.emailB ? `
    <div class="ib-section">
      <div class="ib-section-title"><i class="ti ti-test-pipe" style="color:var(--accent,#2563EB)"></i> A/B versies — klik om te kiezen</div>
      <div class="ib-ab-grid">
        <div class="inbox-ab-ver ib-ab-ver selected" id="abVerA-${item.id}" onclick="selectVersion('${item.id}','A')">
          <div><span class="ib-ab-label" style="background:rgba(37,99,235,.2);color:#60A5FA">A</span><span style="font-size:10px;color:var(--text-3,#666);margin-left:6px">Probleem-gericht</span></div>
          <div class="ib-ab-subject">${esc(item.emailA.subject)}</div>
          <div class="ib-ab-preview">${esc((item.emailA.body || '').replace(/<[^>]+>/g,'').slice(0,120))}…</div>
        </div>
        <div class="inbox-ab-ver ib-ab-ver" id="abVerB-${item.id}" onclick="selectVersion('${item.id}','B')">
          <div><span class="ib-ab-label" style="background:rgba(139,92,246,.2);color:#A78BFA">B</span><span style="font-size:10px;color:var(--text-3,#666);margin-left:6px">Groei-gericht</span></div>
          <div class="ib-ab-subject">${esc(item.emailB.subject)}</div>
          <div class="ib-ab-preview">${esc((item.emailB.body || '').replace(/<[^>]+>/g,'').slice(0,120))}…</div>
        </div>
      </div>
    </div>` : '';

  const voicenoteSection = item.voicenoteScript ? `
    <div style="padding:0 16px 10px">
      <button class="ib-ghost-btn" onclick="toggleVoicenote('${item.id}')">
        <i class="ti ti-microphone"></i> Voicenote script
        <i class="ti ti-chevron-down" id="voiceChevron-${item.id}" style="font-size:11px"></i>
      </button>
      <div id="voicenote-${item.id}" class="voicenote-body" style="display:none;margin-top:8px;background:var(--surface-2,#222);border-radius:6px;padding:10px;font-size:12px;color:var(--text-2,#999)">
        <p style="margin:0 0 8px">${esc(item.voicenoteScript)}</p>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
          <span style="font-size:11px;color:var(--text-3,#666)"><i class="ti ti-info-circle"></i> Spreek in als WhatsApp of Instagram voicenote</span>
          <button class="ib-ghost-btn" onclick="copyText('${(item.voicenoteScript||'').replace(/'/g, "\\'")}','Voicenote gekopieerd!')"><i class="ti ti-copy"></i> Kopiëren</button>
        </div>
      </div>
    </div>` : '';

  return `
    <div class="inbox-card ib-card" data-id="${item.id}" id="card-${item.id}" data-selected-version="A">
      <div class="ib-card-head">
        <label onclick="event.stopPropagation()" style="flex-shrink:0;margin-top:4px">
          <input type="checkbox" class="bulk-checkbox" data-id="${item.id}" onchange="updateBulkSelCount()" style="width:15px;height:15px;accent-color:var(--accent,#2563EB);cursor:pointer">
        </label>
        <span class="ib-avatar" style="background:${avatarBg}">${initials}</span>
        <div class="ib-head-info">
          <div class="ib-company">${esc(item.companyName)}${langFlag ? ` <span>${langFlag}</span>` : ''}</div>
          <div class="ib-meta">
            ${item.niche ? `<span class="ib-meta-tag">${esc(item.niche)}</span>` : ''}
            ${item.subNiche ? `<span class="ib-meta-tag" style="color:var(--accent,#2563EB)">· ${esc(item.subNiche)}</span>` : ''}
            <span class="ib-meta-tag"><i class="ti ti-map-pin"></i> ${esc(item.location || '—')}</span>
            ${item.websiteUrl ? `<a href="${item.websiteUrl}" target="_blank" style="font-size:11px;color:var(--accent,#2563EB);text-decoration:none" onclick="event.stopPropagation()"><i class="ti ti-world"></i> Website</a>` : ''}
          </div>
        </div>
        <div class="ib-score-wrap">
          <div class="ib-score" style="color:${scoreColor2}">${score.toFixed(1)}</div>
          <div class="ib-score-sub">/ 10</div>
        </div>
      </div>

      <div class="ib-type-badges">
        <span class="ib-type-badge" style="${typeBadgeStyle}">${typeLabel}</span>
        ${item.emailBounced ? `<span class="ib-type-badge" style="background:rgba(220,38,38,.15);color:#EF4444;border-color:rgba(220,38,38,.3)"><i class="ti ti-mail-off"></i> Gebounced</span>` : ''}
        ${emailAlreadySent ? `<span class="ib-type-badge" style="background:rgba(217,119,6,.15);color:#D97706;border-color:rgba(217,119,6,.3)"><i class="ti ti-alert-triangle"></i> Al gecontacteerd</span>` : ''}
        ${item.status === 'auto-approved' ? `<span class="ib-type-badge" style="background:rgba(22,163,74,.15);color:#16A34A;border-color:rgba(22,163,74,.3)"><i class="ti ti-bolt"></i> Auto-goedgekeurd</span>` : ''}
        ${item.leadSource === 'instagram' ? `<span class="ib-type-badge" style="background:rgba(190,24,93,.15);color:#be185d;border-color:rgba(190,24,93,.3)"><i class="ti ti-brand-instagram"></i> Instagram</span>` : ''}
        ${item.leadSource === 'maps' ? `<span class="ib-type-badge" style="background:rgba(29,78,216,.15);color:#1d4ed8;border-color:rgba(29,78,216,.3)"><i class="ti ti-map-pin"></i> Google Maps</span>` : ''}
      </div>

      ${emailSection}
      ${openerSection}
      ${problemsSection}
      ${servicesSection}
      ${subjectsSection}
      ${abSection}
      ${voicenoteSection}

      <div class="ib-footer">
        <div class="ib-footer-left">
          <button class="ib-ghost-btn" onclick="viewEmail('${item.id}')"><i class="ti ti-mail"></i> Email</button>
          <button class="ib-ghost-btn" onclick="viewLinkedin('${item.id}')"><i class="ti ti-brand-linkedin"></i> LinkedIn</button>
          ${state.settings?.calendlyUrl ? `<a class="ib-ghost-btn" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener" onclick="event.stopPropagation()"><i class="ti ti-calendar-event"></i> Gesprek</a>` : ''}
        </div>
        <div class="ib-footer-right">
          <button class="ib-reject-btn" onclick="disapprove('${item.id}')"><i class="ti ti-x"></i> Afwijzen</button>
          ${item.sendOptimalTime ? `
            <button class="ib-ghost-btn" style="color:var(--success,#16A34A)" onclick="approve('${item.id}')"><i class="ti ti-send"></i> Nu</button>
            <button class="ib-approve-btn" onclick="scheduleApprove('${item.id}')"><i class="ti ti-clock"></i> ${formatOptimalTime(item.sendOptimalTime)}</button>
          ` : `
            <button class="ib-approve-btn" onclick="approve('${item.id}')"><i class="ti ti-check"></i> Goedkeuren</button>
          `}
        </div>
      </div>
    </div>
  `;
}

function attachInboxHandlers() {}

function selectVersion(id, version) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  card.dataset.selectedVersion = version;
  const verA = document.getElementById('abVerA-' + id);
  const verB = document.getElementById('abVerB-' + id);
  if (verA) verA.classList.toggle('selected', version === 'A');
  if (verB) verB.classList.toggle('selected', version === 'B');
}

function initSwipeHandlers() {
  const THRESHOLD = 90;

  // One-time swipe hint
  if (!localStorage.getItem('swipeHintDismissed')) {
    const hint = document.getElementById('swipeHint');
    if (hint) hint.style.display = 'flex';
  }

  document.querySelectorAll('.inbox-card').forEach(card => {
    // Inject overlay layers once
    if (!card.querySelector('.swipe-overlay-approve')) {
      const ok = document.createElement('div');
      ok.className = 'swipe-overlay swipe-overlay-approve';
      ok.innerHTML = '<i class="ti ti-check"></i> Goedkeuren';
      card.appendChild(ok);

      const no = document.createElement('div');
      no.className = 'swipe-overlay swipe-overlay-reject';
      no.innerHTML = '<i class="ti ti-x"></i> Afwijzen';
      card.appendChild(no);
    }

    let startX = 0, startY = 0, swiping = false, locked = false;
    const id = card.dataset.id;

    card.addEventListener('touchstart', e => {
      if (locked) return;
      startX   = e.touches[0].clientX;
      startY   = e.touches[0].clientY;
      swiping  = false;
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (locked) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!swiping && Math.abs(dy) > Math.abs(dx) + 5) return; // vertical scroll
      swiping = true;

      const progress   = Math.min(Math.abs(dx) / THRESHOLD, 1);
      const okEl       = card.querySelector('.swipe-overlay-approve');
      const noEl       = card.querySelector('.swipe-overlay-reject');

      card.style.transition = 'none';
      card.style.transform  = `translateX(${dx}px)`;

      if (dx > 0) {
        card.style.boxShadow = `0 0 0 2px rgba(22,163,74,${progress * 0.6})`;
        if (okEl) okEl.style.opacity = String(progress);
        if (noEl) noEl.style.opacity = '0';
      } else {
        card.style.boxShadow = `0 0 0 2px rgba(220,38,38,${progress * 0.6})`;
        if (noEl) noEl.style.opacity = String(progress);
        if (okEl) okEl.style.opacity = '0';
      }

      if (Math.abs(dx) >= THRESHOLD) navigator.vibrate?.(8);
    }, { passive: true });

    card.addEventListener('touchend', e => {
      if (locked || !swiping) { resetSwipeCard(card); return; }
      const dx = e.changedTouches[0].clientX - startX;
      if (dx > THRESHOLD) {
        locked = true;
        dismissSwipeHint();
        swipeCardOff(card, 'right', () => approve(id));
      } else if (dx < -THRESHOLD) {
        locked = true;
        dismissSwipeHint();
        swipeCardOff(card, 'left', () => disapprove(id));
      } else {
        resetSwipeCard(card);
      }
    }, { passive: true });
  });
}

function resetSwipeCard(card) {
  card.style.transition  = 'transform 0.35s cubic-bezier(.25,.46,.45,.94), box-shadow 0.35s';
  card.style.transform   = '';
  card.style.boxShadow   = '';
  card.querySelectorAll('.swipe-overlay').forEach(el => { el.style.opacity = '0'; });
}

function swipeCardOff(card, direction, cb) {
  const vw = window.innerWidth || 400;
  card.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
  card.style.transform  = `translateX(${direction === 'right' ? vw + 60 : -(vw + 60)}px)`;
  card.style.opacity    = '0';
  setTimeout(cb, 300);
}

// ─── Inbox keyboard shortcuts ─────────────────────────────────────────────────
let _inboxKbListener = null;

function initInboxKeyboard() {
  if (_inboxKbListener) document.removeEventListener('keydown', _inboxKbListener);

  _inboxKbListener = function(e) {
    if (state.view !== 'inbox') return;
    // Don't fire when typing in inputs/textareas
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    // Don't fire when a modal is open
    if (document.getElementById('modal')?.style.display !== 'none' &&
        document.getElementById('modal')?.style.display !== '') return;

    const cards = [...document.querySelectorAll('#inboxContent .inbox-card:not([style*="opacity: 0"])')]
      .filter(c => !c.closest('.trash-section'));

    if (!cards.length) return;

    let idx = cards.findIndex(c => c.classList.contains('kb-focused'));
    if (idx === -1) idx = 0;

    switch (e.key) {
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        setInboxFocus(cards, Math.min(idx + 1, cards.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setInboxFocus(cards, Math.max(idx - 1, 0));
        break;
      case 'a':
      case 'A':
        if (cards[idx]) { approve(cards[idx].dataset.id); clearInboxFocus(cards); }
        break;
      case 'r':
      case 'R':
        if (cards[idx]) { disapprove(cards[idx].dataset.id); clearInboxFocus(cards); }
        break;
      case 'e':
      case 'E':
        if (cards[idx]) viewEmail(cards[idx].dataset.id);
        break;
    }
  };

  document.addEventListener('keydown', _inboxKbListener);
  // Focus first card automatically
  const cards = [...document.querySelectorAll('#inboxContent .inbox-card')]
    .filter(c => !c.closest('.trash-section'));
  if (cards.length) setInboxFocus(cards, 0);
}

function setInboxFocus(cards, idx) {
  cards.forEach((c, i) => c.classList.toggle('kb-focused', i === idx));
  cards[idx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearInboxFocus(cards) {
  cards.forEach(c => c.classList.remove('kb-focused'));
}

async function markLinkedinDmSent(id) {
  const card = document.getElementById('card-' + id);
  await api(`/api/inbox/${id}/approve`, { method: 'PATCH' });
  toast('LinkedIn DM gemarkeerd als verstuurd', 'success');
  if (card) {
    card.style.transition = 'all 0.3s';
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 320);
  }
}

async function triggerReplyCheck() {
  const btns = ['checkRepliesBtn', 'dashCheckRepliesBtn'].map(id => document.getElementById(id)).filter(Boolean);
  btns.forEach(b => { b.disabled = true; b.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; });
  try {
    const data = await apiJSON('/api/check-replies', { method: 'POST' });
    const found = data?.found ?? 0;
    const names = data?.names || [];
    if (found === 0) {
      toast('Geen nieuwe replies', 'info');
    } else if (names.length === 1) {
      toast(`Nieuwe reply gevonden van ${names[0]}!`, 'success');
    } else {
      names.forEach(name => toast(`Nieuwe reply gevonden van ${name}!`, 'success'));
    }
    if (found > 0 && state.view === 'inbox') renderInbox();
  } catch (err) {
    toast('Reply check mislukt: ' + err.message, 'error');
  } finally {
    btns.forEach(b => {
      b.disabled = false;
      b.innerHTML = b.id === 'dashCheckRepliesBtn'
        ? '<i class="ti ti-mail-forward"></i> Controleer replies nu'
        : '<i class="ti ti-mail-forward"></i> Controleer replies';
    });
  }
}

async function approve(id, opts = {}) {
  if (!state.settings?.resendConfigured) {
    openModal(`
      <div style="text-align:center;padding:8px 0">
        <div style="font-size:40px;margin-bottom:12px">✉️</div>
        <h3 style="margin:0 0 8px;font-size:18px">Email niet ingesteld</h3>
        <p style="color:var(--text-secondary);margin:0 0 20px;font-size:14px">Stel eerst Resend in voordat je emails kunt versturen.</p>
        <div style="display:flex;gap:10px;justify-content:center">
          <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
          <button class="btn btn-primary" onclick="closeModal();setView('settings');setTimeout(()=>document.querySelector('[data-tab=email]')?.click(),100)">
            <i class="ti ti-settings"></i> Naar Instellingen
          </button>
        </div>
      </div>
    `);
    return;
  }

  const item = state.inbox?.find(i => i.id === id);

  // FIX: validate email before sending
  if (!opts.force) {
    const manualEmailEl = document.getElementById('manualEmail-' + id);
    const manualEmail   = manualEmailEl?.value?.trim() || '';
    if (!item?.emailVerified && !item?.contactEmail && !manualEmail) {
      // No email at all — require manual input
      if (manualEmailEl) manualEmailEl.focus();
      toast('Voer eerst een email adres in', 'error');
      return;
    }
    if (!item?.emailVerified && item?.contactEmail && !opts.confirmed) {
      // Email exists but not scraped from site — show warning
      openModal(`
        <div style="text-align:center;padding:8px 0">
          <div style="font-size:36px;margin-bottom:12px">⚠️</div>
          <h3 style="margin:0 0 8px;font-size:17px">Email niet geverifieerd</h3>
          <p style="color:var(--text-secondary);margin:0 0 6px;font-size:13px">Dit email adres is <strong>niet gevonden op de website</strong> en is mogelijk onjuist:</p>
          <code style="display:block;background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px;margin:0 0 16px;font-size:13px">${esc(item.contactEmail)}</code>
          <p style="color:var(--text-secondary);margin:0 0 20px;font-size:13px">Weet je zeker dat je wilt versturen?</p>
          <div style="display:flex;gap:10px;justify-content:center">
            <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
            <button class="btn btn-primary" onclick="closeModal(); approve('${id}', {force:true})">
              <i class="ti ti-send"></i> Toch versturen
            </button>
          </div>
        </div>
      `);
      return;
    }
  }

  const card = document.getElementById('card-' + id);
  if (card) { card.style.transition = 'all 0.3s'; card.style.background = '#f0fdf4'; card.style.borderColor = '#10b981'; }
  const version = card?.dataset.selectedVersion || 'A';

  const manualEmail = document.getElementById('manualEmail-' + id)?.value?.trim() || undefined;
  const body = { version, ...(manualEmail ? { manualEmail } : {}) };
  const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify(body) });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Goedkeuren mislukt', 'error');
    card.style.background = '';
    card.style.borderColor = '';
    return;
  }

  if (data.emailDuplicateWarning) {
    toast(`Waarschuwing: ${esc(data.emailDuplicateWarning.companyName)} heeft hetzelfde e-mailadres (status: ${data.emailDuplicateWarning.status})`, 'warning');
  } else {
    toast('Email verstuurd! ✓', 'success');
  }
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 300);
    if (typeof updateInboxBadge === 'function') updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function scheduleApprove(id) {
  const card = document.getElementById('card-' + id);
  card.style.transition = 'all 0.3s';
  card.style.background = '#fffbeb';
  card.style.borderColor = '#f59e0b';
  const version = card?.dataset.selectedVersion || 'A';

  const res = await api(`/api/inbox/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ version, scheduled: true }) });
  const data = await res.json();

  if (!res.ok) {
    toast(data.error || 'Inplannen mislukt', 'error');
    card.style.background = '';
    card.style.borderColor = '';
    return;
  }

  const item = state.inbox?.find(i => i.id === id);
  const timeLabel = item?.sendOptimalTime ? formatOptimalTime(item.sendOptimalTime) : '';
  toast(`Ingepland voor ${timeLabel} ✓`, 'success');
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => card.remove(), 300);
    if (typeof updateInboxBadge === 'function') updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function disapprove(id) {
  const card = document.getElementById('card-' + id);
  card.style.transition = 'all 0.3s';
  card.style.background = '#fef2f2';
  card.style.borderColor = '#ef4444';

  await api(`/api/inbox/${id}/disapprove`, { method: 'PATCH' });
  toast('Lead afgewezen — staat in prullenbak', 'info');
  setTimeout(() => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(-8px)';
    setTimeout(() => { card.remove(); renderInbox(); }, 300);
    if (typeof updateInboxBadge === 'function') updateInboxBadge(document.querySelectorAll('.inbox-card').length - 1);
  }, 400);
}

async function restoreTrash(id) {
  await api(`/api/inbox/${id}/restore`, { method: 'PATCH' });
  showToast('Lead hersteld naar inbox!', 'success');
  renderInbox();
}

async function deleteTrash(id) {
  if (!confirm('Definitief verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
  await api(`/api/inbox/${id}?deleteLead=true`, { method: 'DELETE' });
  showToast('Definitief verwijderd', 'info');
  renderInbox();
}

async function emptyTrash() {
  if (!confirm('Alle afgewezen leads definitief verwijderen?')) return;
  const trashed = (state.inbox || []).filter(i => i.status === 'disapproved');
  for (const item of trashed) {
    await api(`/api/inbox/${item.id}?deleteLead=true`, { method: 'DELETE' });
  }
  showToast(`${trashed.length} leads verwijderd`, 'info');
  renderInbox();
}

function viewEmail(id) {
  const item = state.inbox.find(i => i.id === id);
  if (!item?.email) return toast('Geen email beschikbaar', 'error');
  const card = document.getElementById('card-' + id);
  const version = card?.dataset.selectedVersion || 'A';
  const emailToShow = (version === 'B' && item.emailB) ? item.emailB : (item.emailA || item.email);
  const versionLabel = (item.emailA && item.emailB) ? ` (versie ${version})` : '';
  const subjectIdx = parseInt(card?.dataset.selectedSubjectIdx || '0', 10);
  const subject = item.subjectOptions?.[subjectIdx] || emailToShow.subject;

  openModal(`
    <div class="modal-header">
      <h3>Email${versionLabel} — ${esc(item.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    ${item.subjectOptions?.length >= 3 ? `
      <div class="modal-subject-picker">
        <div class="modal-subject-picker-label">Kies onderwerp</div>
        <div id="modalSubjectPicker-${id}">
          ${item.subjectOptions.map((s, i) => `
            <label class="modal-subject-option${i === subjectIdx ? ' modal-subject-option-active' : ''}"
                   onclick="selectSubject('${id}',${i});updateModalSubject('${id}',${i})">
              <input type="radio" name="subjectPick-${id}" value="${i}" ${i === subjectIdx ? 'checked' : ''}
                     style="accent-color:var(--accent);flex-shrink:0">
              <span>${esc(s)}</span>
            </label>`).join('')}
        </div>
      </div>
    ` : ''}
    <div class="email-preview">
      <div class="email-subject" id="modalEmailSubject-${id}"><strong>Onderwerp:</strong> ${esc(subject)}</div>
      <div class="email-body">${(emailToShow.body || '').replace(/\n/g, '<br>')}</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyModalEmail('${id}')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}

function selectSubject(id, idx) {
  const card = document.getElementById('card-' + id);
  if (!card) return;
  card.dataset.selectedSubjectIdx = idx;
  document.querySelectorAll(`#subjectChips-${id} .subject-chip`).forEach((el, i) => {
    el.classList.toggle('subject-chip-active', i === idx);
  });
}

function updateModalSubject(id, idx) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item?.subjectOptions) return;
  const subject = item.subjectOptions[idx];
  const el = document.getElementById('modalEmailSubject-' + id);
  if (el) el.innerHTML = `<strong>Onderwerp:</strong> ${esc(subject)}`;
  const picker = document.getElementById('modalSubjectPicker-' + id);
  if (picker) {
    picker.querySelectorAll('.modal-subject-option').forEach((lbl, i) => {
      lbl.classList.toggle('modal-subject-option-active', i === idx);
    });
  }
}

function copyModalEmail(id) {
  const item = state.inbox?.find(i => i.id === id);
  if (!item) return;
  const card = document.getElementById('card-' + id);
  const version = card?.dataset.selectedVersion || 'A';
  const emailToShow = (version === 'B' && item.emailB) ? item.emailB : (item.emailA || item.email);
  const subjectIdx = parseInt(card?.dataset.selectedSubjectIdx || '0', 10);
  const subject = item.subjectOptions?.[subjectIdx] || emailToShow.subject;
  copyText(subject + '\n\n' + (emailToShow.body || ''));
}

function viewLinkedin(id) {
  const item = state.inbox.find(i => i.id === id);
  if (!item?.linkedinDm) return toast('Geen LinkedIn DM beschikbaar', 'error');
  openModal(`
    <div class="modal-header">
      <h3>LinkedIn DM — ${esc(item.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="email-preview">
      <div class="email-body">${item.linkedinDm.replace(/\n/g, '<br>')}</div>
      <div class="char-count">${item.linkedinDm.length} / 280 tekens</div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyText(\`${item.linkedinDm.replace(/`/g, '\\`')}\`)">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}

function copyText(text, msg) {
  navigator.clipboard.writeText(text).then(() => toast(msg || 'Gekopieerd!', 'success'));
}

