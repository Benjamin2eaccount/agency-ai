// ─── Project Page ─────────────────────────────────────────────────────────────

window.openProjectPage = function openProjectPage(id) {
  state.currentLeadId = id;
  setView('project');
};

window.switchProjectTab = function switchProjectTab(tab) {
  window._projectTab = tab;
  document.querySelectorAll('.project-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.project-tab-content').forEach(c => {
    c.style.display = c.dataset.tabContent === tab ? '' : 'none';
  });
  // Fill iframes when tabs become visible
  const lead = state.leads.find(l => l.id === state.currentLeadId);
  if (!lead) return;
  if (tab === 'voorstel') {
    const f = document.getElementById(`proposalFrame-${lead.id}`);
    if (f && lead.proposal) f.srcdoc = lead.proposal;
  }
  if (tab === 'contract') {
    const f = document.getElementById(`contractFrame-${lead.id}`);
    if (f && lead.contract) f.srcdoc = lead.contract;
  }
  if (tab === 'portaal') {
    initPortalServices(lead.id);
  }
  if (tab === 'building') {
    // Refresh queue status badge
    apiJSON('/api/jobs').then(d => { if (d) window._jobQueueStatus = d; }).catch(() => {});
  }
}

async function renderProjectPage() {
  // Fetch fresh data so the page is always current
  const [freshLeads, freshUsers] = await Promise.all([
    apiJSON('/api/leads').catch(() => null),
    apiJSON('/api/users').catch(() => [])
  ]);
  if (freshLeads) state.leads = freshLeads;
  if (freshUsers) state.users = freshUsers;

  const lead = state.leads.find(l => l.id === state.currentLeadId);
  if (!lead) {
    document.getElementById('appView').innerHTML = `<div class="empty-card"><i class="ti ti-alert-circle"></i><h3>Lead niet gevonden</h3><button class="btn btn-primary" onclick="setView('pipeline')">← Pipeline</button></div>`;
    return;
  }

  window._agentChats = window._agentChats || {};
  if (!window._agentChats[lead.id]) window._agentChats[lead.id] = {};

  if (window._projectTab === 'taken') window._projectTab = 'overzicht';
  if (window._projectTab === 'agents' || window._projectTab === 'website') window._projectTab = 'building';
  const activeTab = window._projectTab || 'overzicht';

  // Build score/status pills
  const scoreCls = lead.score >= 8 ? 'score-num-green' : lead.score >= 6 ? 'score-num-amber' : 'score-num-red';
  const statusLabel = STATUS_LABELS[lead.status] || lead.status || 'Inbox';
  const statusColor = STATUS_COLORS[lead.status] || 'gray';

  // ── Tab: Overzicht ─────────────────────────────────────────────────────────
  const tabOverzicht = `
    <div class="project-tab-content" data-tab-content="overzicht" style="${activeTab !== 'overzicht' ? 'display:none' : ''}">

      ${lead.status === 'replied' && !lead.projectStartedAt ? `
      <div style="border:2.5px solid #16a34a;border-radius:16px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:22px 24px;margin-bottom:22px;box-shadow:0 2px 12px rgba(22,163,74,.12)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:14px">
            <span style="font-size:28px;flex-shrink:0;margin-top:2px">💬</span>
            <div>
              <div style="font-size:17px;font-weight:800;color:#15803d;margin-bottom:4px">${esc(lead.companyName)} heeft gereageerd!</div>
              <div style="font-size:13px;color:#166534;margin-bottom:2px">Klaar om het project te starten?</div>
              ${lead.repliedAt ? `<div style="font-size:11px;color:#4ade80;margin-top:4px"><i class="ti ti-clock"></i> Gereageerd ${relativeTime(lead.repliedAt)}</div>` : ''}
            </div>
          </div>
          <button class="btn btn-dark" style="background:#15803d;font-size:15px;padding:12px 22px;flex-shrink:0;align-self:center" onclick="startProject('${esc(lead.id)}')">
            <i class="ti ti-rocket"></i> Project configureren &amp; starten →
          </button>
        </div>
      </div>
      ` : ''}

      ${lead.projectStartedAt && lead.intakeToken && !lead.intakeSubmittedAt ? `
      <div style="border:2px solid var(--warning);border-radius:14px;background:linear-gradient(135deg,#fffbeb 0%,#fef9c3 100%);padding:20px 22px;margin-bottom:20px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span style="font-size:24px;flex-shrink:0">⏳</span>
          <div style="flex:1">
            <div style="font-size:15px;font-weight:800;color:#92400e;margin-bottom:3px">Wacht op intake formulier</div>
            <div style="font-size:13px;color:#78350f">De klant heeft de intake nog niet ingevuld. Agents kunnen nog niet bouwen.</div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${window.location.origin}/intake/${esc(lead.id)}/${esc(lead.intakeToken)}').then(()=>toast('Link gekopieerd','success'))"><i class="ti ti-copy"></i> Kopieer intake link</button>
          </div>
        </div>
      </div>
      ` : ''}

      ${lead.intakeSubmittedAt ? `
      <div style="border:2.5px solid var(--success);border-radius:14px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);padding:20px 22px;margin-bottom:20px;box-shadow:0 2px 10px rgba(16,185,129,.1)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap">
          <div style="display:flex;align-items:flex-start;gap:12px">
            <span style="font-size:24px;flex-shrink:0;margin-top:1px">✅</span>
            <div>
              <div style="font-size:15px;font-weight:800;color:#15803d;margin-bottom:3px">Intake ontvangen!</div>
              <div style="font-size:13px;color:#166534;margin-bottom:6px">
                ${(lead.selectedProblems||[]).length ? `Agents bouwen voor ${(lead.selectedProblems||[]).length} geselecteerde probleem${(lead.selectedProblems||[]).length>1?'en':''}.` : 'Agents bouwen op basis van bestelde diensten en gevonden problemen.'}
              </div>
              ${lead.agentsRanAt ? `<div style="font-size:11px;color:var(--text-muted)"><i class="ti ti-check" style="color:var(--success)"></i> Gebouwd op ${formatDate(lead.agentsRanAt)} — ${(lead.agentDeliverables||[]).length} leveringen</div>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;align-items:center">
            ${lead.agentsRanAt ? `<button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw bouwen</button>` : ''}
            ${isAdmin() ? `<button class="btn btn-dark" style="font-size:14px;padding:10px 20px" onclick="buildAllServicesForLead('${esc(lead.id)}')">
              <i class="ti ti-robot"></i> ${lead.agentsRanAt ? 'Alles herbouwen' : 'Ga verder — laat agents bouwen'}
            </button>` : ''}
          </div>
        </div>
      </div>
      ` : ''}

      ${lead.onboardingScript ? `
      <div style="margin-bottom:20px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:10px;padding:16px 18px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px">
            <i class="ti ti-video" style="font-size:18px;color:#0284c7;flex-shrink:0"></i>
            <span style="font-size:13px;font-weight:700;color:#0284c7">Video onboarding script</span>
            <span style="background:#0284c7;color:#fff;border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700">~60 sec</span>
          </div>
          <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="navigator.clipboard.writeText(${JSON.stringify(lead.onboardingScript)}).then(()=>toast('Script gekopieerd','success'))"><i class="ti ti-copy"></i> Kopiëren</button>
        </div>
        <p style="font-size:13px;line-height:1.65;color:#0c4a6e;white-space:pre-line;margin:0">${esc(lead.onboardingScript)}</p>
      </div>
      ` : ''}

      <div class="project-info-grid">
        <div class="project-info-item">
          <div class="project-info-label">Email</div>
          <div class="project-info-value" id="emailDisplayRow-${lead.id}">
            ${lead.contactEmail ? `<a href="mailto:${esc(lead.contactEmail)}" class="link">${esc(lead.contactEmail)}</a>` : '<span style="color:var(--text-muted)">Geen email</span>'}
            <button class="btn btn-xs btn-ghost" style="margin-left:6px;padding:2px 6px;font-size:11px" onclick="startEditEmail('${lead.id}','${esc(lead.contactEmail||'')}')"><i class="ti ti-pencil"></i></button>
          </div>
          <div id="emailEditRow-${lead.id}" style="display:none;align-items:center;gap:6px;margin-top:4px">
            <input type="email" id="emailEditInput-${lead.id}" value="${esc(lead.contactEmail||'')}" placeholder="email@domein.nl" style="height:32px;padding:0 10px;border:1.5px solid var(--accent);border-radius:6px;font-size:13px;flex:1;background:var(--surface);color:var(--text);outline:none">
            <button class="btn btn-xs btn-primary" onclick="saveLeadEmail('${lead.id}')"><i class="ti ti-check"></i></button>
            <button class="btn btn-xs btn-ghost" onclick="cancelEditEmail('${lead.id}')"><i class="ti ti-x"></i></button>
          </div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Website</div>
          <div class="project-info-value">${lead.websiteUrl ? `<a href="${esc(lead.websiteUrl)}" target="_blank" class="link">${esc(lead.websiteUrl)}</a>` : '<span style="color:var(--text-muted)">—</span>'}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Instagram</div>
          <div class="project-info-value">${lead.instagram ? `<a href="https://instagram.com/${esc(lead.instagram.replace('@',''))}" target="_blank" class="link">${esc(lead.instagram)}</a>` : '<span style="color:var(--text-muted)">—</span>'}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Locatie</div>
          <div class="project-info-value">${esc(lead.location || '—')}${lead.address ? `<br><span style="font-size:11px;color:var(--text-secondary)">${esc(lead.address)}</span>` : ''}</div>
        </div>
        <div class="project-info-item">
          <div class="project-info-label">Volgers</div>
          <div class="project-info-value">${lead.followers ? lead.followers.toLocaleString('nl-NL') : lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString('nl-NL') : '—'}</div>
        </div>
        ${lead.mapsRating ? `
        <div class="project-info-item">
          <div class="project-info-label">Google Maps</div>
          <div class="project-info-value"><span style="color:#f59e0b">★</span> ${lead.mapsRating} <span style="color:var(--text-secondary);font-size:12px">(${lead.reviewCount || '?'} reviews)</span></div>
        </div>` : ''}
        ${lead.phone ? `
        <div class="project-info-item">
          <div class="project-info-label">Telefoon</div>
          <div class="project-info-value"><a href="tel:${esc(lead.phone)}" class="link">${esc(lead.phone)}</a></div>
        </div>` : ''}
        <div class="project-info-item">
          <div class="project-info-label">Deal waarde</div>
          <div class="project-info-value">${lead.estimatedValue ? '€' + lead.estimatedValue.toLocaleString('nl-NL') : '—'}</div>
        </div>
      </div>

      ${(() => {
        const websiteScore  = lead.website?.speedScore ?? null;
        const socialRaw     = lead.social?.growthPotential;
        const socialScore   = typeof socialRaw === 'number' ? socialRaw : null;
        const engagePct     = lead.social?.engagementRate ?? null;
        const engageScore   = engagePct !== null ? Math.min(10, Math.round(engagePct * 1.5)) : null;
        const urgencyMap    = { critical: { label: 'Kritiek', color: 'var(--danger)' }, high: { label: 'Hoog', color: '#f97316' }, hoog: { label: 'Hoog', color: '#f97316' }, medium: { label: 'Medium', color: 'var(--warning)' }, low: { label: 'Laag', color: 'var(--success)' } };
        const urgInfo       = urgencyMap[lead.urgency] || null;
        const barColor      = v => v >= 8 ? 'var(--success)' : v >= 5 ? 'var(--warning)' : 'var(--danger)';
        const scoreBar      = (label, val) => val === null ? '' : `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
              <span style="font-size:12px;color:var(--text-secondary)">${label}</span>
              <span style="font-size:12px;font-weight:700;color:${barColor(val)}">${val.toFixed(1)}/10</span>
            </div>
            <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="height:100%;width:${val*10}%;background:${barColor(val)};border-radius:3px;transition:width 0.4s"></div>
            </div>
          </div>`;
        const hasAny = websiteScore !== null || socialScore !== null || engageScore !== null || lead.score || urgInfo;
        if (!hasAny) return '';
        return `
          <div style="margin-bottom:20px">
            <div class="project-section-title"><i class="ti ti-chart-bar" style="color:var(--accent);margin-right:6px"></i>Score analyse</div>
            <div style="padding:14px 16px;border:1px solid var(--border);border-radius:10px;background:var(--surface)">
              ${scoreBar('Website kwaliteit', websiteScore)}
              ${scoreBar('Social media potentieel', socialScore)}
              ${engageScore !== null ? scoreBar(`Engagement (${engagePct?.toFixed(1)}%)`, engageScore) : ''}
              ${lead.score ? scoreBar('Totale score', lead.score) : ''}
              ${urgInfo ? `<div style="display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:10px;border-top:1px solid var(--border)"><span style="font-size:12px;color:var(--text-secondary)">Urgentie</span><span style="font-size:12px;font-weight:700;color:${urgInfo.color}">${urgInfo.label}</span></div>` : ''}
            </div>
          </div>`;
      })()}

      ${lead.problems?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Gevonden problemen</div>
          ${lead.problems.map((p, i) => {
            const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
            const low = txt.toLowerCase();
            const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
            return `<div class="problem-card ${isCritical ? '' : ''}">
              <span style="font-size:16px">${isCritical ? '🔴' : '🟡'}</span>
              <span style="flex:1;font-size:13px">${esc(txt)}</span>
            </div>`;
          }).join('')}
        </div>
      ` : ''}

      ${lead.services?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Aanbevolen diensten</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${lead.services.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border:1px solid var(--border);border-radius:8px;background:var(--surface)">
                <span style="font-size:13px;font-weight:500">${esc(s.name)}</span>
                <span style="font-size:13px;color:var(--accent);font-weight:600">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${lead.competitors?.competitorNames?.length ? `
        <div style="margin-bottom:20px">
          <div class="project-section-title">Concurrentie analyse</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${lead.competitors.competitorNames.map(n => `<span style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:3px 10px;font-size:12px;font-weight:500">${esc(n)}</span>`).join('')}
          </div>
          ${lead.competitors.competitorGap ? `<div style="background:var(--warning-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--warning)"><i class="ti ti-alert-triangle" style="margin-right:6px;color:var(--warning)"></i>${esc(lead.competitors.competitorGap)}</div>` : ''}
        </div>
      ` : ''}

      <div style="margin-bottom:20px">
        <div class="project-section-title">Score</div>
        <div style="display:flex;align-items:center;gap:12px">
          <span class="score-pill score-${scoreColor(lead.score || 0)}" style="font-size:22px;padding:6px 14px">${(lead.score || 0).toFixed(1)}</span>
          <span style="font-size:13px;color:var(--text-secondary)">/10</span>
          ${lead.scoreDetails ? `<span style="font-size:12px;color:var(--text-muted)">${esc(lead.scoreDetails)}</span>` : ''}
        </div>
      </div>
    </div>`;

  // ── Tab: Problemen & Taken ─────────────────────────────────────────────────
  function buildProblemsTab() {
    const problems = lead.problems || [];
    const tasks    = lead.tasks    || [];
    const deliverables = lead.agentDeliverables || [];
    const selIdx = window._selectedProblemIdx ?? 0;
    const activeSub = (window._activeProblemSubTab && window._activeProblemSubTab[lead.id]) || 'chat';
    const checkedSet = (window._checkedProblems && window._checkedProblems[lead.id]) || new Set();

    // Progress
    const totalItems = deliverables.length + tasks.length;
    const doneItems = deliverables.filter(d => d.status === 'approved').length + tasks.filter(t => t.status === 'klaar').length;
    const pct = totalItems > 0 ? Math.round(doneItems / totalItems * 100) : 0;

    // ─ LEFT: Problem cards ─
    const selProblem = problems[selIdx];
    const selTxt = selProblem ? (typeof selProblem === 'string' ? selProblem : (selProblem.text || selProblem.description || '')) : '';

    const problemCards = problems.length
      ? problems.map((p, i) => {
          const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
          const low = txt.toLowerCase();
          const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
          const solved = p._solved || false;
          const isSelected = i === selIdx;
          const icon = solved ? '✅' : isCritical ? '🔴' : '🟡';
          const severityLabel = solved ? 'Opgelost' : isCritical ? 'Kritiek' : 'Medium';
          const severityColor = solved ? 'var(--success)' : isCritical ? 'var(--danger)' : '#d97706';
          return `<div class="problem-card${isSelected ? ' selected' : ''}${solved ? ' solved' : ''}" data-problem-idx="${i}" onclick="selectProblemCard(${i},'${esc(lead.id)}')">
            <input type="checkbox" onclick="event.stopPropagation();toggleProblemCheck('${esc(lead.id)}',${i})" ${checkedSet.has(i) ? 'checked' : ''} style="flex-shrink:0;width:15px;height:15px;cursor:pointer;accent-color:var(--accent)">
            <span style="font-size:15px">${icon}</span>
            <span style="flex:1;font-size:13px;line-height:1.4">${esc(txt)}</span>
            <span style="font-size:10px;padding:1px 7px;border-radius:3px;background:${severityColor}22;color:${severityColor};font-weight:600;white-space:nowrap">${severityLabel}</span>
          </div>`;
        }).join('')
      : `<div style="text-align:center;padding:24px 0;color:var(--text-muted)">
          <i class="ti ti-check" style="font-size:28px;display:block;margin-bottom:6px;color:var(--success)"></i>
          <div style="font-size:13px">Geen problemen gevonden voor deze lead.</div>
        </div>`;

    // Sub-tab panel
    // Chat
    const chatSubPanel = `
      <div id="probSubPanel-${lead.id}-chat" style="${activeSub !== 'chat' ? 'display:none' : ''}">
        <div id="agentChatPanel" class="problem-chat-panel" style="border:none;padding:0">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary)" id="chatProblemTitle">
              ${selTxt ? `<i class="ti ti-robot" style="color:var(--accent);margin-right:6px"></i>${esc(selTxt.substring(0, 80))}` : '<i class="ti ti-robot" style="margin-right:6px"></i>Selecteer een probleem'}
            </div>
            <button class="btn btn-ghost btn-sm" style="font-size:11px;color:var(--danger)" onclick="clearAgentChat('${esc(lead.id)}')">
              <i class="ti ti-trash"></i> Wissen
            </button>
          </div>
          <div class="agent-chat-history" id="agentChatHistory"></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','actieplan')">📋 Actieplan</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-website')">💻 Website</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-booking')">📅 Booking</button>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="fillAgentChat('${esc(lead.id)}','build-chatbot')">🤖 Chatbot</button>
          </div>
          <div class="agent-chat-input">
            <textarea id="agentChatMsg" placeholder="Beschrijf wat je wilt bouwen of vraag een actieplan..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAgentChat('${esc(lead.id)}');}"></textarea>
            <button class="btn btn-primary btn-sm" onclick="sendAgentChat('${esc(lead.id)}')"><i class="ti ti-send"></i></button>
          </div>
        </div>
      </div>`;

    // Taken (all project tasks)
    const takenSubPanel = `
      <div id="probSubPanel-${lead.id}-taken" style="${activeSub !== 'taken' ? 'display:none' : ''}">
        <div id="tasks-section-${lead.id}">${buildTasksHTML(lead, state.users || [], 1)}</div>
      </div>`;

    // Bestanden (all deliverables compact)
    const bestandenSubPanel = `
      <div id="probSubPanel-${lead.id}-bestanden" style="${activeSub !== 'bestanden' ? 'display:none' : ''}">
        ${deliverables.length
          ? deliverables.map((d, dIdx) => {
              const dot = d.status === 'approved' ? 'var(--success)' : d.status === 'error' ? 'var(--danger)' : 'var(--warning)';
              const typeIcon = d.type === 'code' ? '💻' : d.deliverableType === 'strategy' ? '📊' : '📄';
              const statusLabel = d.status === 'approved' ? 'Goedgekeurd' : d.status === 'error' ? 'Fout' : 'Wacht';
              return `<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--border)">
                <span style="width:8px;height:8px;border-radius:50%;background:${dot};flex-shrink:0"></span>
                <span style="font-size:13px;flex:1">${typeIcon} ${esc(d.service)}</span>
                <span style="font-size:11px;color:${dot}">${statusLabel}</span>
                ${d.url ? `<a href="${esc(d.url)}" target="_blank" style="font-size:11px;color:var(--accent)"><i class="ti ti-external-link"></i></a>` : ''}
                ${isAdmin() ? `<button onclick="deleteDeliverable('${esc(lead.id)}',${dIdx})" title="Verwijder" style="width:22px;height:22px;border:none;border-radius:4px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);padding:0;flex-shrink:0" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='var(--text-muted)'"><i class="ti ti-trash" style="font-size:12px"></i></button>` : ''}
              </div>`;
            }).join('')
          : `<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px">
              <i class="ti ti-files" style="font-size:24px;display:block;margin-bottom:6px"></i>
              ${lead.intakeSubmittedAt && isAdmin()
                ? `Nog geen leveringen. <button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-robot"></i> Agents starten</button>`
                : 'Nog geen leveringen gebouwd.'}
            </div>`}
      </div>`;

    const subTabSection = problems.length ? `
      <div style="margin-top:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;border-bottom:1px solid var(--border);padding:0 4px">
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="chat" onclick="switchProblemSubTab('${esc(lead.id)}','chat')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='chat'?'var(--accent)':'transparent'};color:${activeSub==='chat'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-robot"></i> Chat
          </button>
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="taken" onclick="switchProblemSubTab('${esc(lead.id)}','taken')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='taken'?'var(--accent)':'transparent'};color:${activeSub==='taken'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-checklist"></i> Taken
          </button>
          <button class="prob-subtab-btn" data-lead="${lead.id}" data-tab="bestanden" onclick="switchProblemSubTab('${esc(lead.id)}','bestanden')" style="padding:10px 16px;font-size:12px;font-weight:600;border:none;background:none;cursor:pointer;border-bottom:2px solid ${activeSub==='bestanden'?'var(--accent)':'transparent'};color:${activeSub==='bestanden'?'var(--accent)':'var(--text-secondary)'}">
            <i class="ti ti-files"></i> Bestanden
          </button>
        </div>
        <div style="padding:14px 16px">
          ${chatSubPanel}
          ${takenSubPanel}
          ${bestandenSubPanel}
        </div>
      </div>` : `<div id="tasks-section-${lead.id}" style="margin-top:16px">${buildTasksHTML(lead, state.users || [], 1)}</div>`;

    const leftPanel = `
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin:0">
            <i class="ti ti-alert-circle" style="color:var(--danger);margin-right:6px"></i>Gevonden problemen
            ${problems.length ? `<span style="font-size:11px;background:var(--danger-light,#fef2f2);color:var(--danger);border-radius:4px;padding:1px 8px;margin-left:6px">${problems.length}</span>` : ''}
          </div>
        </div>
        ${problemCards}
        <button id="startCheckedBtn-${lead.id}" onclick="startCheckedProblems('${esc(lead.id)}')" style="display:${checkedSet.size>0?'flex':'none'};width:100%;margin-top:10px;align-items:center;justify-content:center;gap:6px" class="btn btn-dark btn-sm">
          <i class="ti ti-rocket"></i> Start met ${checkedSet.size} aangevinkte probleem${checkedSet.size===1?'':'en'}
        </button>
        ${subTabSection}
      </div>`;

    // ─ RIGHT: Overview panel ─
    const progressBlock = `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface);margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Algehele voortgang</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <div style="font-size:26px;font-weight:800;color:${pct>=100?'var(--success)':pct>=50?'var(--accent)':'var(--text)'}">${pct}%</div>
          <div style="flex:1">
            <div style="height:6px;background:var(--surface-2);border-radius:3px;overflow:hidden">
              <div style="height:100%;background:${pct>=100?'var(--success)':'var(--accent)'};border-radius:3px;width:${pct}%;transition:width .4s"></div>
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-top:3px">${doneItems} van ${totalItems} items</div>
          </div>
        </div>
        <div style="display:flex;gap:14px;font-size:12px;color:var(--text-secondary)">
          <span><i class="ti ti-check" style="color:var(--success)"></i> ${deliverables.filter(d=>d.status==='approved').length}/${deliverables.length} leveringen</span>
          <span><i class="ti ti-checklist" style="color:var(--accent)"></i> ${tasks.filter(t=>t.status==='klaar').length}/${tasks.length} taken</span>
        </div>
      </div>`;

    const delivOverview = deliverables.length ? `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface);margin-bottom:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Leveringen</div>
        ${deliverables.map(d => {
          const dot = d.status === 'approved' ? '#10b981' : d.status === 'error' ? '#ef4444' : '#f59e0b';
          const typeIcon = d.type === 'code' ? '💻' : d.deliverableType === 'strategy' ? '📊' : '📄';
          return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
            <span style="width:7px;height:7px;border-radius:50%;background:${dot};flex-shrink:0"></span>
            <span style="font-size:12px;flex:1">${typeIcon} ${esc(d.service)}</span>
            ${d.url ? `<a href="${esc(d.url)}" target="_blank" style="color:var(--accent);font-size:11px"><i class="ti ti-external-link"></i></a>` : ''}
          </div>`;
        }).join('')}
      </div>` : '';

    const checklistTasks = tasks.filter(t => !t.week || t.week <= 2).slice(0, 8);
    const masterChecklist = `
      <div style="border:1px solid var(--border);border-radius:12px;padding:14px 16px;background:var(--surface)">
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">Handmatige checklist</div>
        ${checklistTasks.length
          ? checklistTasks.map(t => {
              const tid = t.id || t._id || String(tasks.indexOf(t));
              const done = t.status === 'klaar';
              return `<label style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer">
                <input type="checkbox" ${done?'checked':''} onchange="toggleProjectTask('${esc(lead.id)}','${esc(tid)}',this.checked)" style="width:14px;height:14px;accent-color:var(--accent);flex-shrink:0">
                <span style="font-size:12px;${done?'text-decoration:line-through;color:var(--text-muted)':''}">${esc(t.title||t.text||'Taak')}</span>
              </label>`;
            }).join('')
          : `<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:10px 0">Geen taken aangemaakt</div>`}
        ${lead.agentsRanAt && isAdmin() ? `<div style="margin-top:10px;font-size:11px;color:var(--text-muted)"><i class="ti ti-robot"></i> Laatste run: ${formatDate(lead.agentsRanAt)}</div>` : ''}
      </div>`;

    const rightPanel = `<div>${progressBlock}${delivOverview}${masterChecklist}</div>`;

    return `
      <div class="project-tab-content" data-tab-content="taken" style="${activeTab !== 'taken' ? 'display:none' : ''}">
        <div style="display:grid;grid-template-columns:3fr 2fr;gap:20px;align-items:start">
          ${leftPanel}
          ${rightPanel}
        </div>
      </div>`;
  }

  // ── Tab: Emails ─────────────────────────────────────────────────────────────
  function buildEmailsTab() {
    const emailEvents = new Set(['emailSent','followupSent','aiReplySent','clientEmailSent','sent','followup1','followup2']);
    const historyEmails = (lead.history || []).filter(h => emailEvents.has(h.event));
    const clientEmails = lead.clientEmailLog || [];

    const sentWelcome = clientEmails.find(e => e.trigger === 'welcome');
    const sentIntake  = clientEmails.find(e => e.trigger === 'intakeReceived') || (lead.intakeToken ? clientEmails.find(e => e.trigger === 'intake') : null);
    const sentInvoice = clientEmails.find(e => e.trigger === 'invoice' || e.trigger === 'factuur');
    const intakeUrl   = lead.intakeToken ? `${window.location.origin}/intake/${lead.id}/${lead.intakeToken}` : null;

    function actionRow(icon, label, sentEntry, actionHtml) {
      const sentBadge = sentEntry
        ? `<span style="font-size:11px;color:var(--success);display:flex;align-items:center;gap:4px"><i class="ti ti-check"></i> Verstuurd op ${formatDate(sentEntry.sentAt || sentEntry.createdAt)}</span>`
        : actionHtml;
      return `
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ${icon}" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <span style="font-size:14px;font-weight:500;flex:1">${label}</span>
          ${sentBadge}
        </div>`;
    }

    const actionSection = `
      <div style="margin-bottom:20px">
        <div class="project-section-title"><i class="ti ti-send" style="color:var(--accent);margin-right:6px"></i>Versturen</div>
        ${actionRow('ti-hand-stop', 'Welkomstmail', sentWelcome,
            `<button class="btn btn-sm btn-primary" onclick="sendClientEmail('${lead.id}','welcome')"><i class="ti ti-send"></i> Versturen</button>`)}
        ${actionRow('ti-clipboard-list', 'Intake formulier', sentIntake,
            intakeUrl
              ? `<div style="display:flex;align-items:center;gap:6px">
                   <button class="btn btn-sm btn-primary" onclick="sendClientEmail('${lead.id}','intakeReceived')"><i class="ti ti-send"></i> Versturen</button>
                   <button class="btn btn-sm btn-outline" onclick="copyToClipboard('${intakeUrl}','Link gekopieerd!')"><i class="ti ti-copy"></i> Link</button>
                 </div>`
              : `<span style="font-size:12px;color:var(--text-muted)">Start eerst het project</span>`)}
        ${actionRow('ti-receipt', 'Factuur versturen', sentInvoice,
            `<button class="btn btn-sm btn-outline" onclick="createPayment('${lead.id}')"><i class="ti ti-plus"></i> Factuur aanmaken</button>`)}
        ${(() => {
          const lastWeekly = clientEmails.filter(e => e.trigger === 'weeklyUpdate').sort((a,b) => new Date(b.sentAt)-new Date(a.sentAt))[0];
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
            <i class="ti ti-calendar-week" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:500">Weekupdate</div>
              ${lastWeekly ? `<div style="font-size:11px;color:var(--text-muted)">Laatste: ${relativeTime(lastWeekly.sentAt)}</div>` : ''}
            </div>
            <button class="btn btn-sm btn-outline" onclick="sendWeeklyUpdate('${lead.id}')"><i class="ti ti-mail-forward"></i> Weekupdate sturen</button>
          </div>`;
        })()}
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ti-pencil" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <span style="font-size:14px;font-weight:500;flex:1">Handmatige email</span>
          <button class="btn btn-sm btn-outline" onclick="openManualEmailModal('${lead.id}')"><i class="ti ti-mail-plus"></i> Opstellen</button>
        </div>
        ${(() => {
          const oe = lead.opleveringEmail;
          if (oe) {
            return `<div style="padding:14px 16px;border:2px solid var(--success);border-radius:10px;margin-bottom:8px;background:var(--success-light)">
              <div style="display:flex;align-items:flex-start;gap:10px">
                <i class="ti ti-package" style="color:var(--success);font-size:18px;flex-shrink:0;margin-top:2px"></i>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                    <span style="font-size:14px;font-weight:600">📦 Oplevering email</span>
                    <span style="font-size:11px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:1px 7px;color:var(--text-secondary)">Gegenereerd op ${formatDate(oe.generatedAt)}</span>
                    ${oe.sentAt ? `<span style="font-size:11px;background:#dcfce7;color:#16a34a;border-radius:4px;padding:1px 7px;font-weight:600"><i class="ti ti-check" style="font-size:10px"></i> Verstuurd ${relativeTime(oe.sentAt)}</span>` : ''}
                  </div>
                  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Onderwerp: ${esc(oe.subject)}</div>
                  <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">${esc((oe.body||'').substring(0,100))}${(oe.body||'').length>100?'…':''}</div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="btn btn-sm btn-primary" onclick="openSavedDeliveryEmail('${lead.id}')"><i class="ti ti-eye"></i> Bekijk &amp; verstuur</button>
                    ${oe.sentAt ? `<button class="btn btn-sm btn-outline" onclick="openSavedDeliveryEmail('${lead.id}')"><i class="ti ti-send"></i> Stuur opnieuw</button>` : ''}
                    <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="generateDeliveryEmail('${lead.id}', true)"><i class="ti ti-refresh"></i> Opnieuw genereren</button>
                  </div>
                </div>
              </div>
            </div>`;
          }
          return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:2px solid var(--accent);border-radius:10px;margin-bottom:8px;background:var(--accent-light)">
            <i class="ti ti-package" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600">Oplevering email</div>
              <div style="font-size:12px;color:var(--text-muted)">AI genereert email met alles wat gebouwd is + instructies voor klant</div>
            </div>
            <button class="btn btn-sm btn-primary" onclick="generateDeliveryEmail('${lead.id}')"><i class="ti ti-sparkles"></i> Genereer &amp; stuur</button>
          </div>`;
        })()}
        <div style="display:flex;align-items:center;gap:12px;padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <i class="ti ti-clipboard-list" style="color:var(--accent);font-size:18px;flex-shrink:0"></i>
          <div style="flex:1">
            <div style="font-size:14px;font-weight:500">Admin instructies</div>
            <div style="font-size:12px;color:var(--text-muted)">Intern document: wat gebouwd is, links, wat klant moet doen</div>
          </div>
          <button class="btn btn-sm btn-outline" onclick="generateAdminInstructions('${lead.id}')"><i class="ti ti-file-text"></i> Genereer</button>
        </div>
      </div>`;

    const historyRows = historyEmails.length
      ? historyEmails.slice().sort((a,b) => new Date(b.time)-new Date(a.time)).map(h => `
          <div style="padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
              <i class="ti ti-mail" style="color:var(--accent)"></i>
              <span style="font-size:13px;font-weight:500;flex:1">${esc(h.label || h.event)}</span>
              ${(lead.emailOpened || lead.openedAt) ? `<span class="badge badge-blue" style="font-size:10px"><i class="ti ti-eye"></i> Geopend${lead.openCount > 1 ? ' (' + lead.openCount + 'x)' : ''}</span>` : ''}
              ${lead.repliedAt ? `<span class="badge badge-green" style="font-size:10px"><i class="ti ti-message"></i> Gereageerd</span>` : ''}
              <span style="font-size:11px;color:var(--text-muted)">${relativeTime(h.time)}</span>
            </div>
            ${lead.contactEmail ? `<div style="font-size:12px;color:var(--text-secondary)">→ ${esc(lead.contactEmail)}</div>` : ''}
          </div>
        `).join('')
      : '';

    const clientRows = clientEmails.map(e => `
      <div style="padding:12px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
          <i class="ti ti-mail-forward" style="color:#7c3aed"></i>
          <span style="font-size:13px;font-weight:500;flex:1">${esc(e.trigger || 'Klant email')}</span>
          <span style="font-size:11px;color:var(--text-muted)">${relativeTime(e.sentAt || e.createdAt)}</span>
        </div>
        ${e.subject ? `<div style="font-size:12px;font-weight:600;margin-bottom:4px">${esc(e.subject)}</div>` : ''}
        ${e.body ? `<details style="font-size:12px;color:var(--text-secondary)"><summary style="cursor:pointer">Bekijk email</summary><pre style="white-space:pre-wrap;margin-top:6px">${esc(e.body.substring(0,400))}${e.body.length > 400 ? '...' : ''}</pre></details>` : ''}
      </div>
    `).join('');

    const replySection = lead.lastReplyText ? `
      <div style="margin-bottom:20px">
        <div class="project-section-title"><i class="ti ti-message-reply" style="color:var(--success);margin-right:6px"></i>Laatste reactie</div>
        <div style="padding:14px 16px;border:1px solid var(--success);border-radius:10px;background:#f0fdf4;font-size:13px;color:var(--text);white-space:pre-wrap">${esc(lead.lastReplyText)}</div>
      </div>
    ` : '';

    return `
      <div class="project-tab-content" data-tab-content="emails" style="${activeTab !== 'emails' ? 'display:none' : ''}">
        ${actionSection}
        ${replySection}
        ${historyRows || clientRows ? `
          <div class="project-section-title" style="margin-top:4px"><i class="ti ti-history" style="color:var(--text-muted);margin-right:6px"></i>Geschiedenis</div>
          ${historyRows}${clientRows}
        ` : ''}
      </div>`;
  }

  // ── Tab: Intake ─────────────────────────────────────────────────────────────
  function buildIntakeTabProject() {
    if (!lead.intakeToken) return '';
    const intakeUrl = `${window.location.origin}/intake/${lead.id}/${lead.intakeToken}`;
    return `
      <div class="project-tab-content" data-tab-content="intake" style="${activeTab !== 'intake' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-clipboard-list" style="color:var(--accent);margin-right:6px"></i>Intake formulier</div>
          ${lead.intakeSubmittedAt
            ? `<span class="badge badge-green"><i class="ti ti-check"></i> Ingevuld ${formatDate(lead.intakeSubmittedAt)}</span>`
            : `<span class="badge badge-warning">Nog niet ingevuld</span>`}
        </div>
        ${lead.intakeAnswers && Object.keys(lead.intakeAnswers).length ? `
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">
            ${Object.entries(lead.intakeAnswers).map(([q, a]) => `
              <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${esc(q)}</div>
                <div style="font-size:13px;color:var(--text-primary);white-space:pre-line">${esc(a)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De klant heeft de intake nog niet ingevuld.</div>
        `}
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <a href="${intakeUrl}" target="_blank" class="btn btn-ghost btn-sm">
            <i class="ti ti-external-link"></i> Intake link openen
          </a>
          <button class="btn btn-ghost btn-sm" onclick="copyText('${intakeUrl}'); toast('Link gekopieerd!','success')">
            <i class="ti ti-copy"></i> Link kopiëren
          </button>
        </div>
      </div>`;
  }

  // ── Tab: Betalingen ─────────────────────────────────────────────────────────
  function buildBetalingenTabProject() {
    const payments = lead.payments || [];
    return `
      <div class="project-tab-content" data-tab-content="betalingen" style="${activeTab !== 'betalingen' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-coin" style="color:var(--accent);margin-right:6px"></i>Betalingen</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="createPayment('${lead.id}')"><i class="ti ti-plus"></i> Nieuwe factuur</button>` : ''}
        </div>
        ${payments.length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...payments].reverse().map(p => {
              const statusColors = { sent: '#d97706', paid: '#16a34a', failed: '#dc2626', cancelled: '#9ca3af' };
              const statusLabels = { sent: 'Verstuurd', paid: 'Betaald', failed: 'Mislukt', cancelled: 'Geannuleerd' };
              const isOverdue = p.status === 'sent' && p.dueDate && new Date(p.dueDate) < new Date();
              return `
                <div style="border:1px solid ${isOverdue ? '#fecaca' : 'var(--border)'};border-radius:10px;padding:12px 14px;background:${isOverdue ? '#fef2f2' : 'var(--surface)'}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <div style="flex:1">
                      <div style="font-size:14px;font-weight:700">€${(p.amount||0).toLocaleString('nl-NL')}</div>
                      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(p.description||'')}${p.splitIndex ? ` — deel ${p.splitIndex}/${p.splitTotal}` : ''}</div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
                        <span style="font-size:10px;font-weight:700;background:${isOverdue?'#fef2f2':'#f3f4f6'};color:${isOverdue?'#dc2626':statusColors[p.status]||'#6b7280'};border-radius:4px;padding:2px 6px">${isOverdue?'ACHTERSTALLIG':statusLabels[p.status]||p.status}</span>
                        ${p.billing === 'maandelijks' ? '<span class="badge badge-blue" style="font-size:10px">Maandelijks</span>' : ''}
                        <span style="font-size:10px;color:#9ca3af">${p.dueDate ? 'Vervalt ' + formatDate(p.dueDate) : ''}</span>
                        ${p.paidAt ? `<span style="font-size:10px;color:#16a34a">Betaald ${formatDate(p.paidAt)}</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
                      ${p.paymentUrl ? `<a href="${p.paymentUrl}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-external-link"></i> Link</a>` : ''}
                      ${p.status !== 'paid' ? `<button onclick="markPaymentPaid('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#16a34a"><i class="ti ti-check"></i> Betaald</button>` : ''}
                      ${p.status === 'sent' ? `<button onclick="remindPayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-bell"></i> Herinner</button>` : ''}
                      <button onclick="deletePayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#dc2626"><i class="ti ti-trash"></i></button>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div style="text-align:center;padding:32px;font-size:13px;color:#9ca3af">
            <i class="ti ti-coin" style="font-size:28px;display:block;margin-bottom:8px"></i>
            Nog geen betalingen aangemaakt
          </div>
        `}
      </div>`;
  }

  // ── Tab: Voorstel ────────────────────────────────────────────────────────────
  function buildVoorstelTabProject() {
    return `
      <div class="project-tab-content" data-tab-content="voorstel" style="${activeTab !== 'voorstel' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-file-text" style="color:var(--accent);margin-right:6px"></i>Offerte / voorstel</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="propGenBtn-proj-${lead.id}" onclick="openProposalModal('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuw voorstel
          </button>` : ''}
        </div>

        ${_buildProposalsListHtml(lead)}

        ${lead.proposals?.length ? '' : `
          <div style="text-align:center;padding:32px">
            <i class="ti ti-file-description" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen voorstel gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Nieuw voorstel" om een PDF-offerte op maat te maken</div>
          </div>`}

        ${lead.proposal ? `
          <details style="margin-top:12px">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;padding:6px 0">Oud AI-voorstel tonen</summary>
            <div style="margin-top:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn btn-ghost btn-sm" onclick="downloadProposal('${lead.id}')"><i class="ti ti-download"></i> Download HTML</button>
                <button class="btn btn-ghost btn-sm" onclick="sendProposalEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
              </div>
              <div class="proposal-preview">
                <iframe id="proposalFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:420px"></iframe>
              </div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:6px">Gegenereerd op ${new Date(lead.proposalGeneratedAt).toLocaleDateString('nl-NL')}</div>
            </div>
          </details>` : ''}
      </div>`;
  }

  // ── Tab: Contract ────────────────────────────────────────────────────────────
  function buildContractTabProject() {
    return `
      <div class="project-tab-content" data-tab-content="contract" style="${activeTab !== 'contract' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-file-certificate" style="color:var(--accent);margin-right:6px"></i>Dienstverleningsovereenkomst</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${lead.contract ? `
              <button class="btn btn-ghost btn-sm" onclick="downloadContract('${lead.id}')"><i class="ti ti-download"></i> Download</button>
              <button class="btn btn-ghost btn-sm" onclick="sendContractEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
            ` : ''}
            ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="generateContract('${lead.id}')" id="contractGenBtn-${lead.id}">
              <i class="ti ti-file-certificate"></i> ${lead.contract ? 'Regenereer' : 'Genereer contract'}
            </button>` : ''}
          </div>
        </div>
        ${lead.contract ? `
          <div class="proposal-preview">
            <iframe id="contractFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:520px"></iframe>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
            Gegenereerd op ${new Date(lead.contractGeneratedAt).toLocaleDateString('nl-NL')}
            ${lead.contractSentAt ? ` · <span style="color:var(--success)"><i class="ti ti-check"></i> Verstuurd op ${new Date(lead.contractSentAt).toLocaleDateString('nl-NL')}</span>` : ''}
          </div>
        ` : `
          <div style="text-align:center;padding:32px">
            <i class="ti ti-file-certificate" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen contract gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Genereer contract" om een juridisch contract op te stellen</div>
          </div>
        `}
        <div id="contractProgress-proj-${lead.id}" style="display:none">
          <div class="proposal-progress">
            <div id="contractStep1-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contractgegevens ophalen</div>
            <div id="contractStep2-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opstellen</div>
            <div id="contractStep3-proj-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opslaan</div>
          </div>
        </div>
      </div>`;
  }

  // ── Tab: Building (agent build dashboard) ─────────────────────────────────
  function buildBuildingTab() {
    const deliverables = lead.agentDeliverables || [];
    const running = !!(window._buildAllRunning && window._buildAllRunning[lead.id]);
    const progress = (window._buildAllProgress && window._buildAllProgress[lead.id]) || [];
    // Show queue status badge (loaded async and stored in window._jobQueueStatus)
    const queueStatus = window._jobQueueStatus;
    const queueBadge = queueStatus && !running
      ? (queueStatus.running ? `<span style="font-size:12px;background:#fef3c7;color:#d97706;border-radius:20px;padding:3px 10px;font-weight:600">⏳ Ander build bezig...</span>`
      : queueStatus.queued  ? `<span style="font-size:12px;background:#eff6ff;color:#2563eb;border-radius:20px;padding:3px 10px;font-weight:600">📋 In wachtrij (#${queueStatus.queued})</span>`
      : '') : '';

    const doneCount    = running ? progress.filter(p => p.status === 'done').length   : deliverables.filter(d => d.status !== 'error').length;
    const errorCount   = running ? progress.filter(p => p.status === 'error').length  : deliverables.filter(d => d.status === 'error').length;
    const totalCount   = running ? progress.length : deliverables.length;
    const approvedCount = deliverables.filter(d => d.status === 'approved').length;
    const pendingCount  = deliverables.filter(d => d.status !== 'approved' && d.status !== 'error').length;

    // Empty state
    if (!deliverables.length && !running) {
      return `
        <div class="project-tab-content" data-tab-content="building" style="${activeTab !== 'building' ? 'display:none' : ''}">
          <div style="text-align:center;padding:48px 20px">
            <i class="ti ti-hammer" style="font-size:44px;color:var(--text-muted);display:block;margin-bottom:14px"></i>
            <div style="font-size:15px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">Nog niets gebouwd</div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Start via de intake flow hierboven in het Overzicht.</div>
            ${lead.intakeSubmittedAt && isAdmin() ? `<button class="btn btn-primary" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-rocket"></i> Nu starten</button>` : ''}
          </div>
        </div>`;
    }

    // Overall progress bar (during build)
    const overallPct = running && progress.length ? Math.round((progress.filter(p => p.status === 'done' || p.status === 'error').length / progress.length) * 100) : 0;
    const buildingIdx = running ? progress.findIndex(p => p.status === 'building') : -1;
    const remainingServices = running ? progress.filter(p => p.status === 'waiting').length : 0;
    const estMinutes = remainingServices * 1.5;

    const overallProgressBar = running ? `
      <div style="margin-bottom:18px;padding:16px 18px;border:1px solid var(--accent);border-radius:12px;background:linear-gradient(135deg,#eff6ff,#f8faff)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;flex-wrap:wrap;gap:6px">
          <div style="font-size:14px;font-weight:700;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig met bouwen... ${overallPct}% voltooid</div>
          ${estMinutes > 0 ? `<div style="font-size:12px;color:var(--text-muted)">~${Math.ceil(estMinutes)} min resterend</div>` : ''}
        </div>
        <div style="height:8px;background:var(--surface-2);border-radius:4px;overflow:hidden">
          <div style="height:100%;background:var(--accent);border-radius:4px;width:${overallPct}%;transition:width .5s"></div>
        </div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:6px">${doneCount} van ${totalCount} klaar${errorCount > 0 ? ` · ${errorCount} mislukt` : ''}</div>
      </div>
    ` : (queueBadge ? `<div style="margin-bottom:12px">${queueBadge}</div>` : '');

    // Live progress cards (during build)
    const liveCards = running && progress.length ? progress.filter(p => p && p.service).map(p => {
      const slug = (p.service || '').toLowerCase().replace(/[^a-z0-9]/g, '-');
      const borderColor = p.status === 'building' ? 'var(--accent)' : p.status === 'done' ? 'var(--success)' : p.status === 'error' ? 'var(--danger)' : 'var(--border)';
      const statusHtml = p.status === 'waiting'
        ? `<span style="font-size:12px;color:var(--text-muted)"><i class="ti ti-clock"></i> Wachten</span>`
        : p.status === 'building'
          ? `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`
          : p.status === 'done'
            ? `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar ✓</span>`
            : `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
      return `
        <div id="build-card-${lead.id}-${slug}" style="border:1.5px solid ${borderColor};border-radius:10px;padding:12px 16px;margin-bottom:8px;background:var(--surface);transition:border-color .3s">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${p.status==='building'?'8':'0'}px">
            <div style="font-size:13px;font-weight:600">${esc(p.service)}</div>
            <div class="build-status">${statusHtml}</div>
          </div>
          <div class="build-progress-wrap" style="${p.status!=='building'?'display:none':''}">
            <div style="height:4px;background:var(--surface-2);border-radius:2px;overflow:hidden">
              <div class="build-progress-bar" style="height:100%;background:var(--accent);border-radius:2px;width:${p.percent}%;transition:width .4s"></div>
            </div>
          </div>
        </div>`;
    }).join('') : '';

    // Deliverable cards (post-build)
    const deliverableCards = deliverables.map((d, i) => {
      const isHtml = d.type === 'code';
      const typeIcon = isHtml ? '💻' : (d.deliverableType === 'strategy' ? '📊' : '📄');
      const typeLabel = isHtml ? 'HTML build' : (d.deliverableType === 'strategy' ? 'Strategie' : 'Document');
      const primaryBadge = d.primary
        ? `<span style="font-size:10px;font-weight:700;background:#6366f1;color:#fff;border-radius:4px;padding:2px 7px;margin-right:4px">★ GECOMBINEERD</span>`
        : d.embedded
          ? `<span style="font-size:10px;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;padding:2px 6px;margin-right:4px">Ingebouwd in website</span>`
          : '';

      const statusBadge = d.status === 'approved'
        ? `<span class="badge badge-green"><i class="ti ti-check"></i> Goedgekeurd</span>`
        : d.status === 'error'
          ? `<span class="badge badge-red"><i class="ti ti-x"></i> Fout</span>`
          : d.status === 'adjusting'
            ? `<span class="badge badge-warning" style="background:var(--warning-light);color:#92400e"><i class="ti ti-edit"></i> Wordt aangepast</span>`
            : `<span class="badge badge-warning"><i class="ti ti-clock"></i> Wacht op goedkeuring</span>`;

      const preview = isHtml && d.html
        ? `<div style="margin:12px 0">
            <iframe srcdoc="${esc(d.html)}" sandbox="allow-scripts allow-same-origin" style="width:100%;height:300px;border:1px solid var(--border);border-radius:8px"></iframe>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            ${d.url ? `<a href="${esc(d.url)}" target="_blank" class="btn btn-ghost btn-sm"><i class="ti ti-external-link"></i> Bekijken</a>` : ''}
            ${d.url ? `<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${esc(d.url)}').then(()=>toast('URL gekopieerd!','success'))"><i class="ti ti-copy"></i> Kopieer link</button>` : ''}
          </div>
          <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin-bottom:10px">
            <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">WAT DE KLANT NOG MOET DOEN</div>
            <div style="font-size:13px;white-space:pre-line;color:var(--text)">${esc(d.todoText) || `1. Ga naar jullie website builder\n2. Maak een nieuwe pagina aan\n3. Voeg een HTML-blok of embed-sectie toe\n4. Plak deze code:\n\n<iframe src="${esc(d.url||'')}" width="100%" height="600" frameborder="0"></iframe>\n\n5. Sla op en publiceer de pagina`}</div>
          </div>`
        : (d.html || d.instructions || d.content)
          ? `<div style="padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;margin:10px 0;max-height:220px;overflow-y:auto">
              <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">${typeLabel.toUpperCase()}</div>
              <div style="font-size:13px;white-space:pre-line;line-height:1.6;color:var(--text)">${esc(((d.html||d.instructions||d.content)||'').slice(0,800))}${((d.html||d.instructions||d.content)||'').length>800?'…':''}</div>
            </div>`
          : d.status === 'error'
            ? `<div style="padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin:8px 0;font-size:13px;color:#dc2626">${esc(d.error||'Onbekende fout')}</div>`
            : '';

      const htmlCount = deliverables.filter(d2 => d2.type === 'code' && d2.html && d2.status !== 'error' && !d2.embedded).length;
      const eligibleCount = deliverables.filter(d2 => d2.status !== 'error' && !d2.embedded && (d2.html || d2.content || d2.instructions)).length;
      const combineBtn = isHtml && !d.embedded && htmlCount >= 1 && eligibleCount >= 2 && isAdmin()
        ? `<button class="btn btn-ghost btn-sm" onclick="openCombineModal('${esc(lead.id)}',${i})"><i class="ti ti-layers-intersect"></i> Combineer</button>`
        : '';

      const actions = d.status === 'approved' && isAdmin()
        ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
            <button class="btn btn-ghost btn-sm" onclick="startDeliverableEdit('${esc(lead.id)}',${i})"><i class="ti ti-edit"></i> Aanpassen</button>
            ${combineBtn}
          </div>`
        : d.status !== 'error' && isAdmin() ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
          ${isHtml
            ? `<button class="btn btn-primary btn-sm" onclick="approveDeliverable('${esc(lead.id)}',${i})"><i class="ti ti-check"></i> Goedkeuren &amp; naar klant</button>`
            : `<button class="btn btn-primary btn-sm" id="manualApproveBtn-${esc(lead.id)}-${i}" onclick="approveManualDeliverable('${esc(lead.id)}',${i})"><i class="ti ti-send"></i> Goedkeuren &amp; naar klant</button>`}
          <button class="btn btn-ghost btn-sm" onclick="toggleDeliverableChat('${esc(lead.id)}',${i})"><i class="ti ti-message"></i> Aanpassen</button>
          ${combineBtn}
        </div>` : '';

      const errorActions = d.status === 'error' && isAdmin() ? `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px">
          <button class="btn btn-sm" style="background:var(--danger);color:#fff" onclick="retryBuildService('${esc(lead.id)}','${esc(d.service)}')"><i class="ti ti-refresh"></i> Probeer opnieuw</button>
        </div>` : '';

      const chatPanel = isAdmin() ? `
        <div id="delivChat-${lead.id}-${i}" style="display:none;margin-top:12px;padding:12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
          <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:8px"><i class="ti ti-robot" style="margin-right:4px"></i>Aanpassen via AI</div>
          <textarea id="delivChatInput-${lead.id}-${i}" class="form-input" rows="2" placeholder="Beschrijf wat er anders moet..." style="resize:vertical;font-size:13px;margin-bottom:8px"></textarea>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn-ghost btn-sm" onclick="toggleDeliverableChat('${esc(lead.id)}',${i})">Sluiten</button>
            <button class="btn btn-primary btn-sm" onclick="sendDeliverableAdjust('${esc(lead.id)}',${i})"><i class="ti ti-send"></i> Aanpassing sturen</button>
          </div>
        </div>` : '';

      const timestamps = [
        d.builtAt ? `<span><i class="ti ti-hammer" style="margin-right:2px"></i>Gebouwd op ${formatDateTime(d.builtAt)}</span>` : '',
        d.approvedAt ? `<span style="color:var(--success)"><i class="ti ti-check" style="margin-right:2px"></i>Goedgekeurd op ${formatDateTime(d.approvedAt)}</span>` : '',
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

      return `<div style="border:1px solid ${d.primary ? '#6366f1' : 'var(--border)'};border-radius:12px;padding:14px 16px;margin-bottom:12px;background:var(--surface)${d.primary ? ';box-shadow:0 0 0 1px rgba(99,102,241,.15)' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:8px;flex-wrap:wrap">
          <div style="font-size:14px;font-weight:700">${esc(d.service)}${d.combinedServices?.length > 1 ? ` <span style="font-size:12px;font-weight:400;color:var(--text-muted)">+ ${d.combinedServices.slice(1).map(esc).join(' + ')}</span>` : ''}</div>
          <div style="display:flex;align-items:center;gap:6px">
            ${primaryBadge}
            <span style="font-size:11px;background:var(--surface-2);border:1px solid var(--border);border-radius:4px;padding:1px 7px">${typeIcon} ${typeLabel}</span>
            ${statusBadge}
            ${isAdmin() ? `<button onclick="deleteDeliverable('${esc(lead.id)}',${i})" title="Verwijder levering" style="width:26px;height:26px;border:none;border-radius:6px;background:transparent;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;color:var(--text-muted);transition:color .15s,background .15s;flex-shrink:0" onmouseover="this.style.color='#ef4444';this.style.background='#fef2f2'" onmouseout="this.style.color='var(--text-muted)';this.style.background='transparent'"><i class="ti ti-trash" style="font-size:14px"></i></button>` : ''}
          </div>
        </div>
        ${timestamps ? `<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;display:flex;flex-wrap:wrap;gap:6px">${timestamps}</div>` : '<div style="margin-bottom:8px"></div>'}
        ${preview}
        ${actions}
        ${errorActions}
        ${chatPanel}
      </div>`;
    }).join('');

    // Right-side summary panel
    const totalBuildMs = deliverables.reduce((s, d) => s + (d.buildTimeMs || 0), 0);
    const totalBuildMin = totalBuildMs > 0 ? Math.ceil(totalBuildMs / 60000) : null;

    const rightPanel = (!running && deliverables.length) ? `
      <div style="flex-shrink:0;width:220px;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:16px;align-self:flex-start;position:sticky;top:16px">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);margin-bottom:12px">Samenvatting</div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Klaar</span>
          <span style="font-weight:600;color:var(--success)">${doneCount}</span>
        </div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Goedgekeurd</span>
          <span style="font-weight:600;color:var(--accent)">${approvedCount}</span>
        </div>
        <div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Wacht</span>
          <span style="font-weight:600;color:var(--warning)">${pendingCount}</span>
        </div>
        ${errorCount > 0 ? `<div style="margin-bottom:8px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Mislukt</span>
          <span style="font-weight:600;color:var(--danger)">${errorCount}</span>
        </div>` : ''}
        ${totalBuildMin ? `<div style="margin-bottom:12px;display:flex;justify-content:space-between;font-size:13px">
          <span style="color:var(--text-secondary)">Bouwtijd</span>
          <span style="font-weight:600">${totalBuildMin}min</span>
        </div>` : ''}
        <div style="height:1px;background:var(--border);margin-bottom:12px"></div>
        ${isAdmin() && pendingCount > 0 ? `<button class="btn btn-primary btn-sm" style="width:100%;margin-bottom:8px" onclick="approveAllDeliverables('${esc(lead.id)}')"><i class="ti ti-checks"></i> Alles goedkeuren</button>` : ''}
        ${isAdmin() && approvedCount > 0 ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px" onclick="sendAllDeliverablesToClient('${esc(lead.id)}')"><i class="ti ti-send"></i> Stuur alles naar klant</button>` : ''}
        ${isAdmin() && deliverables.filter(d => d.type === 'code' && d.html && d.status !== 'error' && !d.embedded).length >= 1 && deliverables.filter(d => d.status !== 'error' && !d.embedded && (d.html || d.content || d.instructions)).length >= 2 ? `<button class="btn btn-ghost btn-sm" style="width:100%;margin-bottom:8px" onclick="openCombineModal('${esc(lead.id)}')"><i class="ti ti-layers-intersect"></i> Combineer deliverables</button>` : ''}
        ${isAdmin() ? `<button class="btn btn-ghost btn-sm" style="width:100%" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw bouwen</button>` : ''}
      </div>` : '';

    return `
      <div class="project-tab-content" data-tab-content="building" style="${activeTab !== 'building' ? 'display:none' : ''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="project-section-title" style="margin:0"><i class="ti ti-hammer" style="color:var(--accent);margin-right:6px"></i>Building</div>
            ${!running && deliverables.length ? `<span class="build-counter" style="font-size:12px;color:var(--text-muted)">${doneCount} van ${totalCount} gebouwd${errorCount > 0 ? ` · ${errorCount} mislukt` : ''}</span>` : ''}
          </div>
          ${!running && lead.intakeSubmittedAt && isAdmin() && deliverables.length ? `<button class="btn btn-ghost btn-sm" onclick="buildAllServicesForLead('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Opnieuw</button>` : ''}
        </div>
        ${overallProgressBar}
        <div style="display:flex;gap:20px;align-items:flex-start">
          <div style="flex:1;min-width:0">
            ${liveCards}
            ${deliverableCards}
          </div>
          ${rightPanel}
        </div>
      </div>`;
  }

  // ── Tab: Bestanden ──────────────────────────────────────────────────────────
  function buildProjectFilesTab() {
    const files = lead.projectFiles || [];
    const fileRows = files.map(f => {
      const icon = f.type === 'html' ? '🌐' : f.type === 'document' ? '📄' : '📊';
      const fullUrl = f.fullUrl || (f.url.startsWith('http') ? f.url : window.location.origin + f.url);
      const shared = f.sharedWithClient;
      return `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px;background:var(--surface)">
          <span style="font-size:22px;flex-shrink:0;margin-top:2px">${icon}</span>
          <div style="flex:1;min-width:0">
            <div style="font-size:14px;font-weight:600;margin-bottom:2px">${esc(f.name)}</div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Aangemaakt op ${formatDate(f.createdAt)}${f.problem ? ` · ${esc(f.problem.substring(0,50))}` : ''}</div>
            <a href="${esc(fullUrl)}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all;display:block;margin-bottom:8px">${esc(fullUrl)}</a>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
              <a href="${esc(fullUrl)}" target="_blank" class="btn btn-sm btn-ghost" style="font-size:11px"><i class="ti ti-eye"></i> Preview</a>
              <button class="btn btn-sm btn-ghost" style="font-size:11px" onclick="navigator.clipboard.writeText('${esc(fullUrl)}').then(()=>toast('URL gekopieerd!','success'))"><i class="ti ti-copy"></i> Kopieer</button>
              <button class="btn btn-sm ${shared ? 'btn-outline' : 'btn-ghost'}" style="font-size:11px;${shared ? 'color:var(--success);border-color:var(--success)' : 'color:var(--text-muted)'}" onclick="toggleProjectFileShare('${esc(lead.id)}','${esc(f.id)}',${!shared})">
                ${shared ? '<i class="ti ti-check"></i> Zichtbaar voor klant' : '<i class="ti ti-eye-off"></i> Alleen admin'}
              </button>
              <button class="btn btn-sm btn-ghost" style="font-size:11px;color:var(--danger)" onclick="deleteProjectFile('${esc(lead.id)}','${esc(f.id)}')"><i class="ti ti-trash"></i></button>
            </div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="project-tab-content" data-tab-content="bestanden" style="${activeTab !== 'bestanden' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin:0"><i class="ti ti-files" style="color:var(--accent);margin-right:6px"></i>Project bestanden</div>
          <button class="btn btn-sm btn-outline" onclick="openAddProjectFileModal('${esc(lead.id)}')"><i class="ti ti-plus"></i> Bestand toevoegen</button>
        </div>
        ${files.length === 0
          ? `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);font-size:13px"><i class="ti ti-files" style="font-size:32px;display:block;margin-bottom:8px;opacity:.4"></i>Nog geen bestanden — ze verschijnen hier automatisch na een agent build.</div>`
          : fileRows}
        <div style="margin-top:16px;padding:12px 14px;background:var(--surface-2);border-radius:8px;font-size:12px;color:var(--text-muted)">
          <i class="ti ti-info-circle" style="margin-right:4px"></i>
          Bestanden met <strong>Zichtbaar voor klant</strong> verschijnen automatisch in het klantportaal onder Leveringen.
        </div>
      </div>`;
  }

  // ── Tab: Website ────────────────────────────────────────────────────────────
  function buildWebsiteTabProject() {
    const site = lead.generatedSite;
    if (!site) {
      return `
        <div class="project-tab-content" data-tab-content="website" style="${activeTab !== 'website' ? 'display:none' : ''}">
          <div style="text-align:center;padding:40px 20px;color:var(--text-secondary)">
            <i class="ti ti-world" style="font-size:40px;margin-bottom:12px;display:block;color:var(--text-muted)"></i>
            <div style="font-size:15px;font-weight:600;margin-bottom:8px">Nog geen website gegenereerd</div>
            <div style="font-size:13px;margin-bottom:20px">Genereer een professionele website op maat voor ${esc(lead.companyName)}.</div>
            ${isAdmin() ? `<button class="btn btn-primary" onclick="generateSite('${esc(lead.id)}')"><i class="ti ti-wand"></i> Website genereren</button>` : `<span class="employee-notice"><i class="ti ti-lock"></i> Alleen admins kunnen websites genereren</span>`}
          </div>
        </div>`;
    }
    return `
      <div class="project-tab-content" data-tab-content="website" style="${activeTab !== 'website' ? 'display:none' : ''}">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;flex-wrap:wrap">
          <span class="site-status-badge ${site.status === 'live' ? 'site-status-live' : 'site-status-preview'}">${site.status === 'live' ? 'Live' : 'Preview'}</span>
          <a href="${esc(site.siteUrl)}" target="_blank" class="btn btn-sm btn-outline"><i class="ti ti-external-link"></i> Bekijk live</a>
          <button class="btn btn-sm btn-outline" onclick="openSeoPanel('${esc(lead.id)}')"><i class="ti ti-search"></i> SEO</button>
          ${isAdmin() ? `<button class="btn btn-sm btn-ghost" onclick="generateSite('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Regenereer</button>` : ''}
        </div>
        <iframe src="${esc(site.siteUrl)}?_t=${Date.now()}" style="width:100%;height:480px;border:1px solid var(--border);border-radius:10px" sandbox="allow-scripts allow-same-origin"></iframe>
      </div>`;
  }

  // ── Tab: Afspraken ──────────────────────────────────────────────────────────
  const tabAfspraken = `
    <div class="project-tab-content" data-tab-content="afspraken" style="${activeTab !== 'afspraken' ? 'display:none' : ''}">
      ${lead.calendlyBooking ? `
        <div style="padding:16px;border:1px solid #bfdbfe;border-radius:10px;background:#eff6ff;margin-bottom:16px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
            <i class="ti ti-calendar-check" style="color:#2563eb"></i>
            <span style="font-size:14px;font-weight:600">${esc(lead.calendlyBooking.eventName || 'Gesprek ingepland')}</span>
          </div>
          ${lead.calendlyBooking.startTime ? `<div style="font-size:13px;color:#1d4ed8">${new Date(lead.calendlyBooking.startTime).toLocaleString('nl-NL', {dateStyle:'full',timeStyle:'short'})}</div>` : ''}
          ${lead.calendlyBooking.inviteeName ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Naam: ${esc(lead.calendlyBooking.inviteeName)}</div>` : ''}
        </div>
      ` : `
        <div style="text-align:center;padding:40px 20px;color:var(--text-secondary)">
          <i class="ti ti-calendar-off" style="font-size:40px;margin-bottom:12px;display:block;color:var(--text-muted)"></i>
          <div style="font-size:15px;font-weight:600;margin-bottom:8px">Geen afspraken gevonden</div>
          ${state.settings?.calendlyUrl && lead.contactEmail ? `
            <a class="btn btn-primary" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener">
              <i class="ti ti-calendar-plus"></i> Plan gesprek via Calendly
            </a>` : '<div style="font-size:13px">Stel Calendly in bij Instellingen → API.</div>'}
        </div>
      `}
    </div>`;

  // ── Tab: Documenten ────────────────────────────────────────────────────────
  const docs = lead.documents || [];
  const DOC_TYPE_ICONS = { link: 'ti-link', password: 'ti-lock', note: 'ti-file-text' };
  const DOC_TYPE_COLORS = { link: '#2563eb', password: '#d97706', note: '#16a34a' };
  const DOC_TYPE_BG    = { link: '#eff6ff', password: '#fef3c7', note: '#f0fdf4' };
  const DOC_TYPE_LABELS = { link: 'Link', password: 'Wachtwoord', note: 'Notitie' };

  const tabDocumenten = `
    <div class="project-tab-content" data-tab-content="documenten" style="${activeTab !== 'documenten' ? 'display:none' : ''}">
      ${isAdmin() ? `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div class="project-section-title" style="margin-bottom:0">Documentvault</div>
        <button class="btn btn-sm btn-primary" onclick="openAddDocModal('${esc(lead.id)}')"><i class="ti ti-plus"></i> Document toevoegen</button>
      </div>` : '<div class="project-section-title"><i class="ti ti-folder" style="color:var(--accent);margin-right:6px"></i>Documenten</div>'}

      ${docs.length === 0 ? `<div style="font-size:13px;color:var(--text-muted);padding:16px 0;text-align:center">Nog geen documenten toegevoegd.</div>` :
        docs.map(doc => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:var(--surface)">
            <div style="display:flex;align-items:flex-start;gap:10px">
              <div style="width:34px;height:34px;border-radius:8px;background:${DOC_TYPE_BG[doc.type]||'#f3f4f6'};color:${DOC_TYPE_COLORS[doc.type]||'#374151'};display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="ti ${DOC_TYPE_ICONS[doc.type]||'ti-file'}" style="font-size:16px"></i>
              </div>
              <div style="flex:1;min-width:0">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  <span style="font-size:14px;font-weight:600">${esc(doc.title||'')}</span>
                  <span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:4px;background:${DOC_TYPE_BG[doc.type]||'#f3f4f6'};color:${DOC_TYPE_COLORS[doc.type]||'#374151'}">${DOC_TYPE_LABELS[doc.type]||doc.type}</span>
                  ${isAdmin() ? `<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:${doc.visible!==false?'#f0fdf4':'#fef2f2'};color:${doc.visible!==false?'var(--success)':'var(--danger)'}">
                    ${doc.visible!==false?'Zichtbaar':'Verborgen'}
                  </span>` : ''}
                </div>
                ${doc.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(doc.description)}</div>` : ''}
                ${doc.type === 'link' && doc.content ? `
                  <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
                    <a class="btn btn-sm btn-primary" href="${esc(doc.content)}" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Openen</a>
                    <button class="btn btn-sm btn-ghost" onclick="navigator.clipboard.writeText('${esc(doc.content)}').then(()=>toast('Link gekopieerd!'))"><i class="ti ti-copy"></i> Kopieer</button>
                  </div>` : ''}
                ${doc.type === 'password' ? `
                  <div style="margin-top:8px">
                    ${doc.username ? `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Gebruiker: <strong style="color:var(--text)">${esc(doc.username)}</strong></div>` : ''}
                    <div style="display:flex;align-items:center;gap:8px;background:var(--surface-2,#f3f4f6);border-radius:7px;padding:7px 12px;border:1px solid var(--border)">
                      <code style="font-size:13px;flex:1;letter-spacing:.05em" id="appjsPw-${doc.id}">••••••••</code>
                      <button class="btn btn-ghost btn-xs" onclick="(function(id,v){var el=document.getElementById('appjsPw-'+id);el.textContent=el.textContent==='••••••••'?v:'••••••••'})('${doc.id}','${esc(doc.content||'')}')">Toon</button>
                      <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(doc.content||'')}').then(()=>toast('Gekopieerd!'))"><i class="ti ti-copy"></i></button>
                    </div>
                  </div>` : ''}
                ${doc.type === 'note' && doc.content ? `<div style="margin-top:8px;font-size:13px;background:var(--surface-2,#f9fafb);border-radius:7px;padding:10px 12px;white-space:pre-line;line-height:1.6;border:1px solid var(--border)">${esc(doc.content)}</div>` : ''}
              </div>
              ${isAdmin() ? `
              <div style="display:flex;gap:4px;flex-shrink:0">
                <button class="btn btn-ghost btn-xs" title="${doc.visible!==false?'Verbergen voor klant':'Tonen voor klant'}" onclick="toggleDocVisibility('${esc(lead.id)}','${doc.id}',${doc.visible===false})">
                  <i class="ti ${doc.visible!==false?'ti-eye-off':'ti-eye'}"></i>
                </button>
                <button class="btn btn-ghost btn-xs" style="color:var(--danger)" onclick="deleteDoc('${esc(lead.id)}','${doc.id}')"><i class="ti ti-trash"></i></button>
              </div>` : ''}
            </div>
          </div>`).join('')}
    </div>`;

  // ── Tab: Klantportaal ───────────────────────────────────────────────────────
  const portalUrl = lead.portalToken ? `${window.location.origin}/portal/${lead.portalToken}` : null;
  const clientLoginUrl = `${window.location.origin}/client/login`;

  // Portal phase labels
  const phaseLabels = ['', 'Fase 1: Intake', 'Fase 2: Uitvoering', 'Fase 3: Oplevering & Check', 'Fase 4: Live gaan', 'Fase 5: Volgende stap'];
  const currentPhase = lead.currentPhase || 1;

  // Deliverable visibility list (for section 3)
  const delivVis = (lead.agentDeliverables || []).map((d, i) => {
    const isVisible = d.clientVisible === true;
    const typeIcon = d.type === 'code' ? '💻' : (d.deliverableType === 'strategy' ? '📊' : '📄');
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:var(--surface-2);margin-bottom:6px;gap:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          <span style="flex-shrink:0">${typeIcon}</span>
          <div style="min-width:0">
            <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.service)}</div>
            ${d.builtAt ? `<div style="font-size:11px;color:var(--text-muted)">${formatDateTime(d.builtAt)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${d.url ? `<a href="${esc(d.url)}" target="_blank" class="btn btn-ghost btn-xs"><i class="ti ti-external-link"></i></a>` : ''}
          <button class="btn btn-xs ${isVisible ? 'btn-outline' : 'btn-ghost'}" style="${isVisible ? 'border-color:var(--success);color:var(--success)' : 'color:var(--text-muted)'}"
            onclick="toggleDeliverableVisibility('${esc(lead.id)}',${i},${!isVisible})">
            <i class="ti ${isVisible ? 'ti-eye' : 'ti-eye-off'}"></i> ${isVisible ? 'Zichtbaar' : 'Verborgen'}
          </button>
        </div>
      </div>`;
  }).join('');

  // Chat section (reusable)
  const chat = lead.portalChat || [];
  const chatUnread = chat.filter(m => m.from === 'client' && !m.readAt).length;
  const chatSection = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--surface)">
      <div style="max-height:260px;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px" id="portalChatThread">
        ${chat.length === 0
          ? '<div style="font-size:12px;color:var(--text-muted);text-align:center;padding:16px 0">Nog geen berichten in de portaalchat.</div>'
          : chat.map(m => `
            <div style="max-width:82%;${m.from==='client'?'margin-left:auto':'margin-right:auto'}">
              <div style="padding:8px 12px;border-radius:10px;font-size:13px;line-height:1.5;${m.from==='client'?'background:var(--accent);color:#fff;border-bottom-right-radius:3px':'background:#f3f4f6;color:var(--text);border-bottom-left-radius:3px'}">${esc(m.message||'')}</div>
              <div style="font-size:10px;color:var(--text-muted);margin-top:2px;${m.from==='client'?'text-align:right':''}">${m.from==='admin'?esc(m.name||'Accountmanager'):esc(m.name||'Klant')} &middot; ${relativeTime(m.time)}</div>
            </div>`).join('')}
      </div>
      ${isAdmin() ? `
      <div style="border-top:1px solid var(--border);padding:10px;display:flex;gap:8px;align-items:flex-end;background:var(--surface)">
        <textarea id="portalReplyInput" placeholder="Stuur een bericht naar de klant..." rows="1"
          style="flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;resize:none;outline:none;background:var(--surface);color:var(--text);min-height:38px"
          oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'"
          onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendPortalReply('${esc(lead.id)}');}"></textarea>
        <button class="btn btn-primary btn-sm" onclick="sendPortalReply('${esc(lead.id)}')"><i class="ti ti-send"></i></button>
      </div>` : ''}
    </div>`;

  const tabPortaal = `
    <div class="project-tab-content" data-tab-content="portaal" style="${activeTab !== 'portaal' ? 'display:none' : ''}">

      <!-- SECTIE 1: Inloggegevens -->
      <div style="margin-bottom:20px">
        <div class="project-section-title">1 — Inloggegevens klant</div>
        ${lead.portalToken ? `
          <div class="credentials-card">
            <div class="credentials-row">
              <div class="credentials-label">Inlogpagina</div>
              <div class="credentials-value-row">
                <code class="credentials-code">${esc(clientLoginUrl)}</code>
                <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(clientLoginUrl)}');toast('Link gekopieerd!')"><i class="ti ti-copy"></i></button>
                <a class="btn btn-ghost btn-xs" href="${esc(clientLoginUrl)}" target="_blank"><i class="ti ti-external-link"></i></a>
              </div>
            </div>
            <div class="credentials-row">
              <div class="credentials-label">Portaalcode</div>
              <div class="credentials-value-row">
                <code class="credentials-code" id="portalCodeDisplay" style="letter-spacing:3px">••••••••••••</code>
                <button class="btn btn-ghost btn-xs" id="showTokenBtn" onclick="togglePortalToken('${esc(lead.portalToken)}')"><i class="ti ti-eye"></i> Toon</button>
                <button class="btn btn-ghost btn-xs" onclick="navigator.clipboard.writeText('${esc(lead.portalToken)}');toast('Code gekopieerd!')"><i class="ti ti-copy"></i></button>
              </div>
            </div>
            <div class="credentials-hint"><i class="ti ti-info-circle"></i> Stuur de portaalcode naar de klant. Ze loggen in via de inlogpagina met deze code.</div>
            <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-sm btn-outline" onclick="copyPortalInstructions('${esc(lead.portalToken)}','${esc(clientLoginUrl)}','${esc(lead.companyName)}')"><i class="ti ti-clipboard-text"></i> Kopieer instructies</button>
              <button class="btn btn-sm btn-ghost" onclick="resendWelcomeEmail('${esc(lead.id)}')"><i class="ti ti-mail-forward"></i> Welkomstmail sturen</button>
            </div>
          </div>
        ` : `
          <div class="credentials-card credentials-card-empty">
            <i class="ti ti-lock" style="font-size:24px;color:var(--text-muted);display:block;margin-bottom:8px"></i>
            <div style="font-size:14px;font-weight:600;margin-bottom:4px">Nog geen portaal aangemaakt</div>
            <div style="font-size:13px;color:var(--text-muted)">Start het project om automatisch een portaalcode aan te maken.</div>
          </div>
        `}
      </div>

      ${isAdmin() ? `

      <!-- SECTIE 2: Fase beheer -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">2 — Fase beheer</div>
          <span style="font-size:12px;padding:3px 10px;background:var(--accent);color:#fff;border-radius:20px;font-weight:600">${esc(phaseLabels[currentPhase] || `Fase ${currentPhase}`)}</span>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <select id="portalPhaseSelect" class="form-input" style="flex:1;min-width:180px;max-width:280px">
            ${phaseLabels.slice(1).map((label, i) => `<option value="${i+1}" ${currentPhase === i+1 ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
          <button class="btn btn-primary btn-sm" onclick="savePortalPhase('${esc(lead.id)}')"><i class="ti ti-check"></i> Zet fase handmatig</button>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:8px">De klant ziet de huidige fase direct in zijn portaal.</div>
      </div>

      <!-- SECTIE: Diensten & Investering (wat klant ziet in Overzicht) -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:4px">Diensten &amp; Investering</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Wat de klant ziet in het Overzicht tab van het portaal.</div>
        <div id="portalServicesList-${esc(lead.id)}" style="margin-bottom:10px"></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <select id="portalServiceAdd-${esc(lead.id)}" class="form-input" style="flex:1;min-width:160px;max-width:260px;font-size:13px">
            <option value="">— Selecteer dienst —</option>
            ${(state.settings?.services || []).map(s => {
              const nm = typeof s === 'string' ? s : (s.name || '');
              const pr = typeof s === 'object' ? (parseFloat(s.price) || 0) : 0;
              const bl = typeof s === 'object' ? (s.billing || 'maandelijks') : 'maandelijks';
              return `<option value="${esc(nm)}" data-price="${pr}" data-billing="${esc(bl)}">${esc(nm)} — €${pr.toLocaleString('nl-NL')}${bl==='eenmalig'?' eenm.':'/mnd'}</option>`;
            }).join('')}
          </select>
          <button class="btn btn-ghost btn-sm" onclick="addPortalService('${esc(lead.id)}')"><i class="ti ti-plus"></i> Toevoegen</button>
          <button class="btn btn-primary btn-sm" onclick="savePortalServices('${esc(lead.id)}')"><i class="ti ti-check"></i> Opslaan</button>
        </div>
      </div>

      <!-- SECTIE 3: Zichtbare builds -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">3 — Zichtbare builds voor klant</div>
          ${(lead.agentDeliverables||[]).filter(d=>d.status==='approved').length > 0 ? `
            <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="showAllApprovedDeliverables('${esc(lead.id)}')">
              <i class="ti ti-eye"></i> Toon alle goedgekeurde
            </button>` : ''}
        </div>
        ${(lead.agentDeliverables||[]).length > 0 ? `
          <div>${delivVis}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Zichtbare builds verschijnen in het Leveringen tab van de klant.</div>
        ` : `<div style="font-size:13px;color:var(--text-muted)">Nog geen builds beschikbaar. Ga naar het Building tab om builds te starten.</div>`}
      </div>

      <!-- SECTIE 4: Portaalchat -->
      <div style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">4 — Klantportaal bericht sturen ${chatUnread > 0 ? `<span class="tab-badge" style="background:var(--danger)">${chatUnread} nieuw</span>` : chat.length > 0 ? `<span class="tab-badge">${chat.length}</span>` : ''}</div>
          ${chatUnread > 0 ? `<button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="markPortalChatRead('${esc(lead.id)}')"><i class="ti ti-checks"></i> Alles gelezen</button>` : ''}
        </div>
        ${chatSection}
      </div>

      <!-- SECTIE 5: Welkomstbericht -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:8px">5 — Welkomstbericht aanpassen</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Dit bericht verschijnt bovenaan het klantportaal Overzicht. Gebruik het voor persoonlijke updates of aankondigingen.</div>
        <textarea id="portalWelcomeInput" class="form-input" rows="3" placeholder="Schrijf een persoonlijk welkomstbericht voor ${esc(lead.companyName)}..." style="resize:vertical;font-size:13px;margin-bottom:8px">${esc(lead.portalWelcomeMessage || '')}</textarea>
        <button class="btn btn-primary btn-sm" onclick="savePortalWelcomeMessage('${esc(lead.id)}')"><i class="ti ti-device-floppy"></i> Opslaan</button>
        ${lead.portalWelcomeMessage ? `<button class="btn btn-ghost btn-sm" style="margin-left:8px;color:var(--text-muted)" onclick="clearPortalWelcomeMessage('${esc(lead.id)}')"><i class="ti ti-x"></i> Wissen</button>` : ''}
      </div>

      <!-- SECTIE 6: Dashboard Analytics (real data) -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)" id="realAnalyticsSection-${esc(lead.id)}">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="project-section-title" style="margin-bottom:0">6 — Dashboard Analytics</div>
          <button class="btn btn-sm btn-outline" onclick="loadRealAnalytics('${esc(lead.id)}')">
            <i class="ti ti-refresh"></i> Vernieuwen
          </button>
        </div>
        <div id="realAnalyticsBody-${esc(lead.id)}">
          ${buildRealAnalyticsHtml(lead)}
        </div>
      </div>

      <!-- SECTIE 7: Portaallink & toegang -->
      <div style="padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:12px">7 — Portaallink &amp; toegang</div>
        ${lead.portalToken ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <code style="flex:1;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;font-size:12px;word-break:break-all">${esc(portalUrl)}</code>
              <button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${esc(portalUrl)}');toast('URL gekopieerd!')"><i class="ti ti-copy"></i></button>
              <a class="btn btn-primary btn-sm" href="${esc(portalUrl)}" target="_blank"><i class="ti ti-external-link"></i> Open als klant</a>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn btn-ghost btn-sm" onclick="resetPortalToken('${esc(lead.id)}')"><i class="ti ti-refresh"></i> Reset portaalcode</button>
              <button class="btn btn-sm ${lead.portalBlocked ? 'btn-primary' : 'btn-ghost'}" style="${lead.portalBlocked ? 'background:var(--danger);border-color:var(--danger)' : 'color:var(--danger)'}" onclick="togglePortalAccess('${esc(lead.id)}',${!lead.portalBlocked})">
                <i class="ti ${lead.portalBlocked ? 'ti-lock' : 'ti-lock-open'}"></i> ${lead.portalBlocked ? 'Toegang geblokkeerd — klik om te deblokkeren' : 'Blokkeer toegang'}
              </button>
            </div>
            ${lead.portalBlocked ? `<div style="font-size:12px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#dc2626"><i class="ti ti-alert-circle"></i> Klant kan momenteel niet inloggen op het portaal.</div>` : ''}
          </div>
        ` : `<div style="font-size:13px;color:var(--text-muted)">Geen portaal aangemaakt. Start het project om een portaallink te genereren.</div>`}
      </div>

      <!-- SECTIE 8: Geüploade bestanden door klant -->
      <div style="margin-bottom:20px;padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface)">
        <div class="project-section-title" style="margin-bottom:12px">8 — Geüploade bestanden door klant ${(lead.clientUploads||[]).length > 0 ? `<span class="tab-badge">${(lead.clientUploads||[]).length}</span>` : ''}</div>
        ${(lead.clientUploads||[]).length > 0
          ? (lead.clientUploads||[]).map(f => {
              const fmtSize = ((f.size||0)/1024).toFixed(1);
              const fmtDate = f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString('nl-NL') : '';
              return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface-2);gap:8px;flex-wrap:wrap">
                <div style="min-width:0">
                  <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i class="ti ti-paperclip" style="margin-right:4px;color:var(--accent)"></i>${esc(f.filename)}</div>
                  <div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(f.mimeType||'')} · ${fmtSize} KB${fmtDate ? ' · ' + fmtDate : ''}</div>
                </div>
                <button class="btn btn-ghost btn-xs" style="flex-shrink:0" onclick="downloadClientUpload('${esc(lead.id)}','${esc(f.filename)}')"><i class="ti ti-download"></i> Download</button>
              </div>`;
            }).join('')
          : `<div style="font-size:13px;color:var(--text-muted)">De klant heeft nog geen bestanden geüpload.</div>`
        }
      </div>

      ` : `
      <!-- Non-admin: just show the chat -->
      <div style="margin-bottom:20px">
        <div class="project-section-title" style="margin-bottom:12px">Portaalchat</div>
        ${chatSection}
      </div>
      `}

    </div>`;

  // ── Tab: Geschiedenis ───────────────────────────────────────────────────────
  const tabGeschiedenis = `
    <div class="project-tab-content" data-tab-content="geschiedenis" style="${activeTab !== 'geschiedenis' ? 'display:none' : ''}">
      <div class="project-timeline-wrap timeline-list">
        ${buildTimeline(lead) || '<div style="font-size:13px;color:var(--text-muted)">Nog geen activiteit</div>'}
      </div>
    </div>`;

  // ── Tab: Notities ───────────────────────────────────────────────────────────
  const tabNotities = `
    <div class="project-tab-content" data-tab-content="notities" style="${activeTab !== 'notities' ? 'display:none' : ''}">
      <div class="project-section-title">Notities</div>
      <textarea class="project-notes-area" id="projectNotesArea" placeholder="Schrijf notities over deze lead..."
        oninput="clearTimeout(window._notesSaveTimer);window._notesSaveTimer=setTimeout(()=>saveProjectNotes('${esc(lead.id)}'),500)"
      >${esc(lead.notes || '')}</textarea>
      <div style="margin-top:8px;font-size:12px;color:var(--text-muted)" id="notesSavedLabel"></div>
    </div>`;

  document.getElementById('appView').innerHTML = `
    <div class="project-page">
      <div class="project-header">
        <button class="project-back-btn" onclick="setView('pipeline')">
          <i class="ti ti-arrow-left"></i> Pipeline
        </button>
        <div class="project-title-row">
          <div>
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="project-company-name">${esc(lead.companyName || '—')}</span>
              ${nicheBadge(lead.niche)}
              <span class="score-pill score-${scoreColor(lead.score || 0)}">${(lead.score || 0).toFixed(1)}</span>
              ${isAdmin()
                ? `<select class="status-pill status-${statusColor}" id="projectStatusSelect" onchange="changeLeadStatus('${lead.id}',this.value)" style="cursor:pointer;border:none;font-weight:600;font-size:12px;appearance:none;padding-right:18px;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23666'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 4px center">
                    ${[['inbox','Inbox'],['approved','Goedgekeurd'],['sent','Verstuurd'],['replied','Gereageerd'],['meeting','Afspraak'],['client','Klant'],['dead','Dead']].map(([v,l]) => `<option value="${v}" ${lead.status===v?'selected':''}>${l}</option>`).join('')}
                  </select>`
                : `<span class="status-pill status-${statusColor}">${statusLabel}</span>`
              }
            </div>
            <div class="project-meta">
              ${lead.location ? `<span><i class="ti ti-map-pin"></i> ${esc(lead.location)}</span>` : ''}
              ${lead.contactEmail ? `<span><i class="ti ti-mail"></i> ${esc(lead.contactEmail)}</span>` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap">
            ${lead.projectStartedAt
              ? `<button class="btn btn-ghost btn-sm" onclick="editProjectConfig('${esc(lead.id)}')"><i class="ti ti-settings"></i> Aanpassen</button>`
              : ['approved','scheduled','sent','replied'].includes(lead.status)
                ? `<button class="btn btn-primary btn-sm" onclick="startProject('${esc(lead.id)}')"><i class="ti ti-rocket"></i> Project starten</button>`
                : ''}
          </div>
        </div>
        <div class="project-tabs">
          <button class="project-tab${activeTab==='overzicht'?' active':''}" data-tab="overzicht" onclick="switchProjectTab('overzicht')">Overzicht</button>
          <button class="project-tab${activeTab==='emails'?' active':''}" data-tab="emails" onclick="switchProjectTab('emails')">Emails</button>
          ${lead.intakeToken ? `<button class="project-tab${activeTab==='intake'?' active':''}" data-tab="intake" onclick="switchProjectTab('intake')">${lead.intakeSubmittedAt ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Intake</button>` : ''}
          <button class="project-tab${activeTab==='betalingen'?' active':''}" data-tab="betalingen" onclick="switchProjectTab('betalingen')">${(lead.payments||[]).filter(p=>p.status==='sent').length > 0 ? `<i class="ti ti-coin" style="color:var(--warning);margin-right:3px"></i>` : ''}Betalingen</button>
          <button class="project-tab${activeTab==='voorstel'?' active':''}" data-tab="voorstel" onclick="switchProjectTab('voorstel')">${(lead.proposals?.length || lead.proposal) ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Voorstel</button>
          <button class="project-tab${activeTab==='contract'?' active':''}" data-tab="contract" onclick="switchProjectTab('contract')">${lead.contract ? '<i class="ti ti-check" style="color:var(--success);margin-right:3px"></i>' : ''}Contract</button>
          <button class="project-tab${activeTab==='building'?' active':''}" data-tab="building" onclick="switchProjectTab('building')" style="${(lead.agentDeliverables||[]).some(d=>d.status==='wacht_op_goedkeuring') ? 'color:var(--warning);font-weight:700' : ''}">${(lead.agentDeliverables||[]).some(d=>d.status==='wacht_op_goedkeuring') ? '<i class="ti ti-clock" style="margin-right:3px;color:var(--warning)"></i>' : '<i class="ti ti-hammer" style="margin-right:3px"></i>'}Building${(lead.agentDeliverables||[]).filter(d=>d.status!=='error').length > 0 ? ` (${(lead.agentDeliverables||[]).filter(d=>d.status!=='error').length})` : ''}</button>
          <button class="project-tab${activeTab==='afspraken'?' active':''}" data-tab="afspraken" onclick="switchProjectTab('afspraken')">Afspraken</button>
          <button class="project-tab${activeTab==='bestanden'?' active':''}" data-tab="bestanden" onclick="switchProjectTab('bestanden')"><i class="ti ti-files" style="margin-right:3px"></i>Bestanden${(lead.projectFiles||[]).length > 0 ? ` (${(lead.projectFiles||[]).length})` : ''}</button>
          <button class="project-tab${activeTab==='documenten'?' active':''}" data-tab="documenten" onclick="switchProjectTab('documenten')"><i class="ti ti-folder" style="margin-right:3px"></i>Documenten${(lead.documents||[]).length > 0 ? ` (${(lead.documents||[]).length})` : ''}</button>
          <button class="project-tab${activeTab==='portaal'?' active':''}" data-tab="portaal" onclick="switchProjectTab('portaal')">${(lead.portalChat||[]).filter(m=>m.from==='client'&&!m.readAt).length > 0 ? `<i class="ti ti-message-circle" style="color:var(--danger);margin-right:3px"></i>` : ''}Klantportaal</button>
          <button class="project-tab${activeTab==='geschiedenis'?' active':''}" data-tab="geschiedenis" onclick="switchProjectTab('geschiedenis')">Geschiedenis</button>
          <button class="project-tab${activeTab==='notities'?' active':''}" data-tab="notities" onclick="switchProjectTab('notities')">Notities</button>
        </div>
      </div>
      <div class="project-content">
        ${tabOverzicht}
        ${buildBuildingTab()}
        ${buildEmailsTab()}
        ${buildIntakeTabProject()}
        ${buildBetalingenTabProject()}
        ${buildVoorstelTabProject()}
        ${buildContractTabProject()}
        ${tabAfspraken}
        ${tabDocumenten}
        ${tabPortaal}
        ${tabGeschiedenis}
        ${tabNotities}
        ${buildProjectFilesTab()}
      </div>
    </div>`;

  // Init: select first problem card if any
  if (lead.problems?.length) {
    selectProblemCard(0, lead.id);
  }

  // Init portal services list if portaal tab is active
  if (activeTab === 'portaal') {
    initPortalServices(lead.id);
  }
}

function problemToKey(txt) {
  return 'problem-' + (txt || '').substring(0, 30).replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

function renderAgentChatHistory(leadId, key) {
  const historyEl = document.getElementById('agentChatHistory');
  if (!historyEl) return;
  window._agentChats = window._agentChats || {};
  const msgs = (window._agentChats[leadId] || {})[key] || [];
  historyEl.innerHTML = msgs.map(m => {
    if (m.builtUrl) {
      return `<div class="agent-msg ai" style="padding:0;background:none;border:none">
        <div style="background:var(--success-light);border:1px solid var(--success);border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;font-weight:700;color:var(--success);margin-bottom:6px"><i class="ti ti-check"></i> Gebouwd!</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">Bekijk op:</div>
          <a href="${m.builtUrl}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all;display:block;margin-bottom:10px">${m.builtUrl}</a>
          <button class="btn btn-ghost btn-sm" style="font-size:12px" onclick="navigator.clipboard.writeText('${m.builtUrl}').then(()=>toast('URL gekopieerd!','success'))">
            <i class="ti ti-copy"></i> Kopieer URL
          </button>
        </div>
      </div>`;
    }
    if (m.buildError) {
      return `<div class="agent-msg ai" style="padding:0;background:none;border:none">
        <div style="background:var(--danger-light,#fef2f2);border:1px solid var(--danger);border-radius:10px;padding:12px 14px">
          <div style="font-size:13px;font-weight:700;color:var(--danger);margin-bottom:4px"><i class="ti ti-alert-triangle"></i> Genereren mislukt</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">${esc(m.text || 'Onbekende fout — probeer opnieuw.')}</div>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;font-size:12px" onclick="retryAgentBuild('${leadId}')">
            <i class="ti ti-refresh"></i> Probeer opnieuw
          </button>
        </div>
      </div>`;
    }
    return `<div class="agent-msg ${m.role}">${esc(m.text)}</div>`;
  }).join('');
  historyEl.scrollTop = historyEl.scrollHeight;
}

function retryAgentBuild(leadId) {
  const msgEl = document.getElementById('agentChatMsg');
  if (!msgEl) return;
  const lastMsg = window._lastAgentBuildMessage?.[leadId];
  if (!lastMsg) { toast('Geen vorig bericht gevonden', 'error'); return; }
  msgEl.value = lastMsg;
  sendAgentChat(leadId);
}

async function saveAgentChats(leadId) {
  try {
    await api(`/api/leads/${leadId}/agent-chats`, {
      method: 'PATCH',
      body: JSON.stringify({ chats: window._agentChats[leadId] || {} })
    });
  } catch (e) { /* non-fatal */ }
}

window.clearAgentChat = async function(leadId) {
  const key = window._selectedProblemKey ?? 'problem-0';
  if (!confirm('Weet je zeker dat je deze chat wil wissen?')) return;
  window._agentChats = window._agentChats || {};
  if (!window._agentChats[leadId]) window._agentChats[leadId] = {};
  window._agentChats[leadId][key] = [];
  await saveAgentChats(leadId);
  renderAgentChatHistory(leadId, key);
  toast('Chat gewist', 'success');
};

// Called when a problem card is clicked in the project page
window.selectProblemCard = async function(idx, leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  document.querySelectorAll('.problem-card').forEach((c, i) => c.classList.toggle('selected', i === idx));

  window._agentChats = window._agentChats || {};

  const problems = lead.problems || [];
  const p = problems[idx];
  const txt = p ? (typeof p === 'string' ? p : (p.text || p.description || '')) : '';
  const problemKey = problemToKey(txt);

  window._selectedProblemIdx   = idx;
  window._selectedProblemKey   = problemKey;
  window._selectedProblemLead  = leadId;
  window._selectedProblemType  = txt;

  const titleEl = document.getElementById('chatProblemTitle');
  if (titleEl) titleEl.innerHTML = `<i class="ti ti-robot" style="color:var(--accent);margin-right:6px"></i>${esc(txt.substring(0, 80))}`;

  // Always reload from API on each card open to get latest persisted history
  try {
    const saved = await apiJSON(`/api/leads/${leadId}/agent-chats`);
    window._agentChats[leadId] = saved || {};
  } catch (e) {
    window._agentChats[leadId] = window._agentChats[leadId] || {};
  }

  renderAgentChatHistory(leadId, problemKey);

  // Auto-trigger first analysis when chat is empty for this problem
  if (txt && (!window._agentChats[leadId][problemKey] || window._agentChats[leadId][problemKey].length === 0)) {
    const msgEl = document.getElementById('agentChatMsg');
    if (msgEl) {
      const co = lead.companyName || 'het bedrijf';
      msgEl.value = `Analyseer dit probleem voor ${co} en geef een concreet actieplan met concrete stappen: ${txt}`;
      sendAgentChat(leadId);
    }
  }
};

window.fillAgentChat = function(leadId, type) {
  const lead = state.leads.find(l => l.id === leadId);
  const prob = window._selectedProblemType || '';
  const co = lead?.companyName || 'het bedrijf';
  const msgs = {
    'actieplan': `Analyseer dit probleem voor ${co} en geef een concreet actieplan met 5 stappen: ${prob}`,
    'build-website': `Bouw een professionele landingspagina voor ${co} die dit probleem oplost: ${prob}`,
    'build-booking': `Bouw een volledig booking/afspraken systeem voor ${co}`,
    'build-chatbot': `Bouw een AI FAQ chatbot voor ${co} die bezoekers helpt`
  };
  const msgEl = document.getElementById('agentChatMsg');
  if (msgEl) { msgEl.value = msgs[type] || ''; msgEl.focus(); }
};

window.switchProblemSubTab = function(leadId, tab) {
  window._activeProblemSubTab = window._activeProblemSubTab || {};
  window._activeProblemSubTab[leadId] = tab;

  ['chat', 'taken', 'bestanden'].forEach(t => {
    const panel = document.getElementById(`probSubPanel-${leadId}-${t}`);
    if (panel) panel.style.display = t === tab ? '' : 'none';
  });

  document.querySelectorAll(`.prob-subtab-btn[data-lead="${leadId}"]`).forEach(btn => {
    const active = btn.dataset.tab === tab;
    btn.style.borderBottom = `2px solid ${active ? 'var(--accent)' : 'transparent'}`;
    btn.style.color = active ? 'var(--accent)' : 'var(--text-secondary)';
  });
};

window.toggleProblemCheck = function(leadId, idx) {
  window._checkedProblems = window._checkedProblems || {};
  if (!window._checkedProblems[leadId]) window._checkedProblems[leadId] = new Set();
  const set = window._checkedProblems[leadId];
  if (set.has(idx)) set.delete(idx); else set.add(idx);

  const btn = document.getElementById(`startCheckedBtn-${leadId}`);
  if (btn) {
    btn.style.display = set.size > 0 ? 'flex' : 'none';
    btn.querySelector('i').nextSibling.textContent = ` Start met ${set.size} aangevinkte probleem${set.size === 1 ? '' : 'en'}`;
  }
};

window.startCheckedProblems = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const checked = (window._checkedProblems && window._checkedProblems[leadId]) || new Set();
  if (!checked.size) return;

  const problems = lead.problems || [];
  const selectedTexts = [...checked].sort().map(i => {
    const p = problems[i];
    return typeof p === 'string' ? p : (p?.text || p?.description || '');
  }).filter(Boolean);

  // Switch to Chat sub-tab and select the first checked problem
  window._activeProblemSubTab = window._activeProblemSubTab || {};
  window._activeProblemSubTab[leadId] = 'chat';
  const firstCheckedIdx = [...checked][0];
  const firstCheckedP = problems[firstCheckedIdx];
  const firstCheckedTxt = firstCheckedP ? (typeof firstCheckedP === 'string' ? firstCheckedP : (firstCheckedP.text || firstCheckedP.description || '')) : '';
  window._selectedProblemIdx = firstCheckedIdx;
  window._selectedProblemKey = problemToKey(firstCheckedTxt);
  window._selectedProblemLead = leadId;

  await renderProjectPage();
  switchProjectTab('overzicht');

  const msgEl = document.getElementById('agentChatMsg');
  if (msgEl && selectedTexts.length) {
    msgEl.value = selectedTexts.length === 1
      ? `Analyseer dit probleem en maak een concreet actieplan: ${selectedTexts[0]}`
      : `Analyseer deze problemen en maak een actieplan:\n${selectedTexts.map((t, i) => `${i+1}. ${t}`).join('\n')}\n\nBegin met het meest kritische.`;
    msgEl.focus();
  }
};

async function sendAgentChat(leadId) {
  const msgEl = document.getElementById('agentChatMsg');
  if (!msgEl) return;
  const message = msgEl.value.trim();
  if (!message) return;

  const key = window._selectedProblemKey ?? 'problem-0';
  const problemType = window._selectedProblemType || '';

  window._agentChats = window._agentChats || {};
  if (!window._agentChats[leadId]) window._agentChats[leadId] = {};
  if (!window._agentChats[leadId][key]) window._agentChats[leadId][key] = [];

  const isBuild = /\b(bouw|bouwen|maak|genereer|build|generate|cre[eë]er|aanmaken|schrijf.*pagina|maak.*pagina|bouw.*pagina)\b/i.test(message)
    || /\b(booking.*pagina|landingspagina|website|chatbot|dashboard|content.*kalender|rapport|strateg)\b/i.test(message);
  const action = isBuild ? 'build' : 'chat';

  // Remember last build message for retry
  if (isBuild) {
    window._lastAgentBuildMessage = window._lastAgentBuildMessage || {};
    window._lastAgentBuildMessage[leadId] = message;
  }

  // Add user message and persist immediately
  window._agentChats[leadId][key].push({ role: 'user', text: message, ts: new Date().toISOString() });
  msgEl.value = '';
  saveAgentChats(leadId);

  // Show history + thinking indicator
  renderAgentChatHistory(leadId, key);
  const historyEl = document.getElementById('agentChatHistory');
  if (historyEl) {
    historyEl.innerHTML += `<div class="agent-msg ai" id="agentThinking"><i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Bezig...</div>`;
    historyEl.scrollTop = historyEl.scrollHeight;
  }

  try {
    const res = await api(`/api/leads/${leadId}/agent-chat`, {
      method: 'POST',
      body: JSON.stringify({ problemType, message, action })
    });
    const data = await res?.json();

    document.getElementById('agentThinking')?.remove();

    if (data?.built && data?.url) {
      window._agentChats[leadId][key].push({ role: 'ai', builtUrl: data.url, ts: new Date().toISOString() });
      // Auto-save to project files
      const lead = state.leads.find(l => l.id === leadId);
      const coName = lead?.companyName || leadId;
      const fileType = /booking|afspraak|reserv/i.test(message) ? 'html'
        : /chatbot|faq/i.test(message) ? 'html'
        : /rapport|audit|analyse|keyword|strateg/i.test(message) ? 'document'
        : 'html';
      const fileName = /booking/i.test(message) ? `Boekingssysteem ${coName}`
        : /chatbot/i.test(message) ? `Chatbot ${coName}`
        : /dashboard/i.test(message) ? `Dashboard ${coName}`
        : /landing/i.test(message) ? `Landingspagina ${coName}`
        : `Website ${coName}`;
      api(`/api/leads/${leadId}/project-files`, {
        method: 'POST',
        body: JSON.stringify({ name: fileName, type: fileType, url: data.url, problem: problemType })
      }).catch(() => {});
      const updatedLeads = await apiJSON('/api/leads');
      if (updatedLeads) state.leads = updatedLeads;
    } else if (data?.response) {
      window._agentChats[leadId][key].push({ role: 'ai', text: data.response, ts: new Date().toISOString() });
    }
    if (data?.error) {
      const isBuildErr = action === 'build' || /lege body|probeer opnieuw|geen geldige html/i.test(data.error);
      window._agentChats[leadId][key].push({
        role: 'ai',
        text: data.error,
        buildError: isBuildErr,
        ts: new Date().toISOString()
      });
    }
  } catch (err) {
    document.getElementById('agentThinking')?.remove();
    const isBuildErr = action === 'build';
    window._agentChats[leadId][key].push({
      role: 'ai',
      text: `Verbindingsfout: ${err.message}`,
      buildError: isBuildErr,
      ts: new Date().toISOString()
    });
  }

  // Persist after AI response and re-render
  saveAgentChats(leadId);
  renderAgentChatHistory(leadId, key);
}

window.runAgentsForLead = async function(leadId) {
  window._agentsRunning = window._agentsRunning || {};
  window._agentsRunning[leadId] = true;

  // Switch to agents tab + re-render to show progress card
  await renderProjectPage();
  switchProjectTab('building');

  const progressList = document.getElementById(`agentsProgressList-${leadId}`);
  const lead = state.leads.find(l => l.id === leadId);

  try {
    const res = await fetch(`/api/leads/${leadId}/run-agents`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
    });
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        window._agentsRunning[leadId] = false;
        // Re-render page to show final deliverables
        renderProjectPage().then(() => switchProjectTab('building'));
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.status === 'complete') {
            window._agentsRunning[leadId] = false;
            // Merge deliverables into state
            if (lead) lead.agentDeliverables = d.deliverables || [];
            renderProjectPage().then(() => switchProjectTab('building'));
            return;
          }
          if (d.status === 'error' && d.idx === -1) {
            window._agentsRunning[leadId] = false;
            toast(d.label || 'Fout bij agents', 'error');
            return;
          }
          // Update progress list
          if (progressList) {
            const rowId = `agentRow-${leadId}-${d.idx}`;
            let row = document.getElementById(rowId);
            if (!row) {
              row = document.createElement('div');
              row.id = rowId;
              row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px';
              progressList.appendChild(row);
            }
            const icon = d.status === 'running' ? '<i class="ti ti-loader-2 spin" style="color:var(--accent)"></i>'
              : d.status === 'done' ? '<i class="ti ti-check" style="color:var(--success)"></i>'
              : '<i class="ti ti-x" style="color:var(--danger)"></i>';
            row.innerHTML = `${icon} <span>${esc(d.label)}</span>`;
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      window._agentsRunning[leadId] = false;
      toast('Verbindingsfout: ' + err.message, 'error');
    });
    pump();
  } catch (err) {
    window._agentsRunning[leadId] = false;
    toast('Fout: ' + err.message, 'error');
  }
};

window.approveDeliverable = async function(leadId, dIdx) {
  const lead = state.leads.find(l => l.id === leadId);
  const hasPaidInvoice = (lead?.payments || []).some(p => p.status === 'paid');
  if (!hasPaidInvoice) {
    openModal(`
      <div class="modal-header">
        <strong>⚠️ Nog geen betaling ontvangen</strong>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:16px 0 4px">
        <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin:0 0 20px">
          <strong>${esc(lead?.companyName || 'Deze klant')}</strong> heeft nog niet betaald.<br>
          Wil je toch de levering sturen?
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="closeModal();createPayment('${esc(leadId)}')">
            <i class="ti ti-receipt"></i> Maak eerst factuur aan
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--text-muted)" onclick="closeModal();_doApproveDeliverable('${esc(leadId)}',${dIdx})">
            Stuur toch
          </button>
        </div>
      </div>
    `);
    return;
  }
  await _doApproveDeliverable(leadId, dIdx);
};

window._doApproveDeliverable = async function(leadId, dIdx) {
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/approve`, { method: 'POST' });
  if (res?.ok) {
    toast('Levering goedgekeurd en klant genotificeerd!', 'success');
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else {
    const d = await res?.json();
    toast(d?.error || 'Goedkeuren mislukt', 'error');
  }
};

window.approveManualDeliverable = async function(leadId, dIdx) {
  const lead = state.leads.find(l => l.id === leadId);
  const hasPaidInvoice = (lead?.payments || []).some(p => p.status === 'paid');
  if (!hasPaidInvoice) {
    openModal(`
      <div class="modal-header">
        <strong>⚠️ Nog geen betaling ontvangen</strong>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:16px 0 4px">
        <p style="color:var(--text-secondary);font-size:14px;line-height:1.6;margin:0 0 20px">
          <strong>${esc(lead?.companyName || 'Deze klant')}</strong> heeft nog niet betaald.<br>
          Wil je toch de levering sturen?
        </p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" onclick="closeModal();createPayment('${esc(leadId)}')">
            <i class="ti ti-receipt"></i> Maak eerst factuur aan
          </button>
          <button class="btn btn-ghost btn-sm" style="color:var(--text-muted)" onclick="closeModal();_doApproveManualDeliverable('${esc(leadId)}',${dIdx})">
            Stuur toch
          </button>
        </div>
      </div>
    `);
    return;
  }
  await _doApproveManualDeliverable(leadId, dIdx);
};

window._doApproveManualDeliverable = async function(leadId, dIdx) {
  const btn = document.getElementById(`manualApproveBtn-${leadId}-${dIdx}`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2"></i> Email genereren…'; }

  const preview = await apiJSON(`/api/leads/${leadId}/deliverables/${dIdx}/preview-email`, { method: 'POST' });
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Klaar — stuur naar klant'; }

  if (!preview) { toast('Kon email niet genereren', 'error'); return; }

  openModal(`
    <div class="modal-header">
      <strong>Leveringsemail — preview &amp; verzenden</strong>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:0 0 16px">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Onderwerp</div>
      <input id="delivEmailSubject" class="form-input" style="margin-bottom:14px" value="${esc(preview.subject)}">
      <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Bericht (bewerkbaar)</div>
      <textarea id="delivEmailBody" class="form-input" rows="10" style="resize:vertical;font-size:13px;line-height:1.6">${esc(preview.body)}</textarea>
    </div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="btn btn-ghost btn-sm" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary btn-sm" onclick="sendManualDeliverable('${esc(leadId)}',${dIdx})"><i class="ti ti-send"></i> Verstuur naar klant</button>
    </div>
  `);
};

window.sendManualDeliverable = async function(leadId, dIdx) {
  const subject = document.getElementById('delivEmailSubject')?.value?.trim();
  const body = document.getElementById('delivEmailBody')?.value?.trim();
  if (!subject || !body) { toast('Vul onderwerp en bericht in', 'error'); return; }

  closeModal();
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ emailSubject: subject, emailBody: body })
  });
  if (res?.ok) {
    toast('Email verstuurd en levering goedgekeurd!', 'success');
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else {
    const d = await res?.json();
    toast(d?.error || 'Versturen mislukt', 'error');
  }
};

window.startDeliverableEdit = async function(leadId, dIdx) {
  const lead = state.leads.find(l => l.id === leadId);
  const d = lead?.agentDeliverables?.[dIdx];
  if (!d) return;
  const confirmed = confirm(`Weet je zeker dat je "${d.service}" wil aanpassen?\n\nDe deliverable wordt verborgen voor de klant totdat jij hem opnieuw goedkeurt.`);
  if (!confirmed) return;

  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/unapprove`, { method: 'POST' });
  if (!res.ok) { toast('Kon status niet wijzigen', 'error'); return; }

  window._projectActiveTab = 'building';
  await renderProjectPage();
  // Open the chat panel immediately after re-render
  const panel = document.getElementById(`delivChat-${leadId}-${dIdx}`);
  if (panel) { panel.style.display = 'block'; panel.querySelector('textarea')?.focus(); }
  toast('Deliverable teruggezet — pas aan via de chat', 'info');
};

window.toggleDeliverableChat = function(leadId, dIdx) {
  const panel = document.getElementById(`delivChat-${leadId}-${dIdx}`);
  if (!panel) return;
  const open = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = open ? 'block' : 'none';
  if (open) panel.querySelector('textarea')?.focus();
};

window.sendDeliverableAdjust = async function(leadId, dIdx) {
  const input = document.getElementById(`delivChatInput-${leadId}-${dIdx}`);
  const msg = input?.value?.trim();
  if (!msg) { toast('Beschrijf wat er anders moet', 'error'); return; }

  const btn = document.querySelector(`#delivChat-${leadId}-${dIdx} .btn-primary`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }

  const lead = state.leads.find(l => l.id === leadId);
  const deliverable = lead?.agentDeliverables?.[dIdx];
  if (!deliverable) { toast('Levering niet gevonden', 'error'); return; }

  // Use the existing agent-chat endpoint for adjustments
  const res = await apiJSON(`/api/leads/${leadId}/agent-chat`, {
    method: 'POST',
    body: JSON.stringify({
      message: `Pas de levering voor "${deliverable.service}" aan: ${msg}`,
      action: deliverable.type === 'code' ? 'build' : 'adjust',
      service: deliverable.service,
      deliverableIdx: dIdx
    })
  });

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Aanpassing sturen'; }

  if (res?.error) {
    toast(res.error, 'error');
  } else if (res?.built) {
    toast('Aanpassing gebouwd — pagina wordt herladen', 'success');
    if (input) input.value = '';
    const freshLeads = await apiJSON('/api/leads');
    if (freshLeads) state.leads = freshLeads;
    renderProjectPage().then(() => switchProjectTab('building'));
  } else if (res?.response) {
    // Chat path: show AI reply in the panel
    const panel = document.getElementById(`delivChat-${leadId}-${dIdx}`);
    if (panel) {
      let replyDiv = panel.querySelector('.ai-reply');
      if (!replyDiv) {
        replyDiv = document.createElement('div');
        replyDiv.className = 'ai-reply';
        replyDiv.style.cssText = 'font-size:13px;color:var(--text-primary);background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px 12px;margin-bottom:8px;white-space:pre-wrap;line-height:1.6';
        panel.insertBefore(replyDiv, panel.querySelector('textarea'));
      }
      replyDiv.textContent = res.response;
    }
    toast('AI antwoord ontvangen', 'success');
  } else {
    toast('Geen reactie ontvangen', 'error');
  }
};

window.buildAllServicesForLead = async function(leadId) {
  window._buildAllRunning = window._buildAllRunning || {};
  window._buildAllProgress = window._buildAllProgress || {};

  if (window._buildAllRunning[leadId]) return;
  window._buildAllRunning[leadId] = true;

  const lead = state.leads.find(l => l.id === leadId);
  const services = (lead?.services || []).map(s => typeof s === 'string' ? s : (s.name || s));

  // Init per-service progress tracking
  window._buildAllProgress[leadId] = services.length
    ? services.map(name => ({ service: name, status: 'waiting', percent: 0 }))
    : [{ service: 'Diensten laden...', status: 'waiting', percent: 0 }];

  await renderProjectPage();
  switchProjectTab('building');

  // Timer map: service name → { timerId, startTime, estSecs }
  window._buildTimers = window._buildTimers || new Map();

  const _fmtTime = (secs) => {
    const m = Math.floor(Math.abs(secs) / 60), s = Math.abs(secs) % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const _estSecs = (serviceName) => {
    const n = (serviceName || '').toLowerCase();
    if (/website|site|boek|booking|chatbot|chat|dashboard|landing|faq/.test(n)) return 120;
    if (/seo.*rapport|concurrentie|audit|crm|keyword.*research|branding|heatmap/.test(n)) return 60;
    return 90;
  };

  const _startTimer = (serviceName, estSecs) => {
    const startTime = Date.now();
    const slug = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const timerId = setInterval(() => {
      const card = document.getElementById(`build-card-${leadId}-${slug}`);
      const statusEl = card?.querySelector('.build-status');
      if (!statusEl) return;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const remaining = estSecs - elapsed;
      if (remaining > 0) {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> ~${_fmtTime(remaining)} resterend</span>`;
      } else {
        const over = elapsed - estSecs;
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--warning)"><i class="ti ti-loader-2 spin"></i> Bijna klaar... +${_fmtTime(over)}</span>`;
      }
    }, 1000);
    window._buildTimers.set(serviceName, { timerId, startTime, estSecs });
  };

  const _stopTimer = (serviceName) => {
    const t = window._buildTimers.get(serviceName);
    if (!t) return 0;
    clearInterval(t.timerId);
    const elapsed = Math.floor((Date.now() - t.startTime) / 1000);
    window._buildTimers.delete(serviceName);
    return elapsed;
  };

  const _stopAllTimers = () => {
    window._buildTimers.forEach(t => clearInterval(t.timerId));
    window._buildTimers.clear();
  };

  const updateCard = (serviceName, updates) => {
    const prog = window._buildAllProgress[leadId];
    if (!prog) return;
    const item = prog.find(p => p.service === serviceName);
    if (item) Object.assign(item, updates);

    if (!serviceName) return;
    const slug = serviceName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const card = document.getElementById(`build-card-${leadId}-${slug}`);
    if (!card) return;

    const statusEl = card.querySelector('.build-status');
    const progressBar = card.querySelector('.build-progress-bar');
    const progressWrap = card.querySelector('.build-progress-wrap');

    if (statusEl) {
      if (updates.status === 'building') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`;
        card.style.borderColor = 'var(--accent)';
      } else if (updates.status === 'done') {
        const elapsed = _stopTimer(serviceName);
        const timeStr = elapsed > 0 ? ` in ${_fmtTime(elapsed)}` : '';
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar${timeStr}</span>`;
        card.style.borderColor = 'var(--success)';
        if (progressWrap) progressWrap.style.display = 'none';
      } else if (updates.status === 'error') {
        _stopTimer(serviceName);
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
        card.style.borderColor = 'var(--danger)';
        if (progressWrap) progressWrap.style.display = 'none';
      }
    }
    if (progressBar && typeof updates.percent === 'number') {
      progressBar.style.width = updates.percent + '%';
      if (progressWrap && updates.status === 'building') progressWrap.style.display = '';
    }

    // Update counter in header
    const prog2 = window._buildAllProgress[leadId] || [];
    const doneCount = prog2.filter(p => p.status === 'done').length;
    const hdr = document.querySelector(`[data-tab-content="building"] .build-counter`);
    if (hdr) hdr.textContent = `Bezig... ${doneCount}/${prog2.length} leveringen klaar`;
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/build-all-services`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        _stopAllTimers();
        window._buildAllRunning[leadId] = false;
        delete window._buildAllProgress[leadId];
        renderProjectPage().then(() => switchProjectTab('building'));
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();

      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));

          if (d.type === 'start') {
            updateCard(d.service, { status: 'building', percent: 10 });
            _startTimer(d.service, _estSecs(d.service));
          } else if (d.type === 'progress') {
            updateCard(d.service, { percent: d.percent });
          } else if (d.type === 'done') {
            // _stopTimer is called inside updateCard for 'done' status
            updateCard(d.service, { status: 'done', percent: 100, url: d.url, deliverableType: d.deliverableType });
          } else if (d.type === 'error' && d.service) {
            updateCard(d.service, { status: 'error' });
          } else if (d.type === 'combine_start') {
            _startTimer('__combine__', 60);
            const hdr = document.querySelector(`[data-tab-content="building"] .build-counter`);
            if (hdr) {
              const combineTimerId = setInterval(() => {
                const t = window._buildTimers.get('__combine__');
                if (!t || !hdr.isConnected) return;
                const elapsed = Math.floor((Date.now() - t.startTime) / 1000);
                const remaining = 60 - elapsed;
                if (remaining > 0) {
                  hdr.textContent = `Samenvoegen... ~${_fmtTime(remaining)} resterend`;
                } else {
                  hdr.textContent = `Samenvoegen... bijna klaar`;
                }
              }, 1000);
              // Store interval on the element so combine_done can clear it
              hdr._combineTimerId = combineTimerId;
              hdr.textContent = d.message || 'Samenvoegen...';
            }
          } else if (d.type === 'combine_done') {
            _stopTimer('__combine__');
            const hdr = document.querySelector(`[data-tab-content="building"] .build-counter`);
            if (hdr?._combineTimerId) { clearInterval(hdr._combineTimerId); delete hdr._combineTimerId; }
            toast(`✓ ${d.message || 'Website gecombineerd'}`, 'success');
          } else if (d.type === 'combine_error') {
            _stopTimer('__combine__');
            const hdr = document.querySelector(`[data-tab-content="building"] .build-counter`);
            if (hdr?._combineTimerId) { clearInterval(hdr._combineTimerId); delete hdr._combineTimerId; }
            toast('Samenvoegen mislukt (afzonderlijke bestanden beschikbaar)', 'info');
          } else if (d.type === 'all_done') {
            _stopAllTimers();
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            const l = state.leads.find(x => x.id === leadId);
            if (l) l.agentDeliverables = d.deliverables || [];
            const combined = (d.deliverables || []).find(x => x.primary);
            if (combined) toast(`✓ ${combined.combinedServices?.join(' + ') || 'Leveringen'} gecombineerd in één website!`, 'success');
            else toast(`${d.count} leveringen klaar!`, 'success');
            renderProjectPage().then(() => switchProjectTab('building'));
          } else if (d.type === 'error' && !d.service) {
            _stopAllTimers();
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            toast(d.message || 'Fout bij bouwen', 'error');
            renderProjectPage().then(() => switchProjectTab('building'));
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      _stopAllTimers();
      window._buildAllRunning[leadId] = false;
      delete window._buildAllProgress[leadId];
      toast('Verbindingsfout: ' + err.message, 'error');
    });

    pump();
  } catch (err) {
    _stopAllTimers();
    window._buildAllRunning[leadId] = false;
    delete window._buildAllProgress[leadId];
    toast('Fout: ' + err.message, 'error');
    renderProjectPage().then(() => switchProjectTab('building'));
  }
};

window.approveAllDeliverables = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const pending = (lead.agentDeliverables || []).map((d, i) => ({ d, i })).filter(({d}) => d.status !== 'approved' && d.status !== 'error');
  if (!pending.length) return toast('Geen leveringen om goed te keuren', 'info');
  if (!confirm(`${pending.length} levering${pending.length > 1 ? 'en' : ''} goedkeuren en naar klant sturen?`)) return;
  for (const {i} of pending) {
    await api(`/api/leads/${leadId}/deliverables/${i}/approve`, { method: 'POST' });
  }
  toast(`${pending.length} leveringen goedgekeurd!`, 'success');
  const freshLeads = await apiJSON('/api/leads');
  if (freshLeads) state.leads = freshLeads;
  renderProjectPage().then(() => switchProjectTab('building'));
};

window.sendAllDeliverablesToClient = async function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.contactEmail) return toast('Geen email adres voor deze klant', 'error');
  if (!confirm(`Oplevering email genereren en sturen naar ${lead.contactEmail}?`)) return;
  const res = await apiJSON(`/api/leads/${leadId}/generate-delivery-email`, { method: 'POST' });
  if (!res?.subject) return toast('Email genereren mislukt', 'error');
  const sendRes = await api(`/api/leads/${leadId}/send-delivery-email`, { method: 'POST', body: JSON.stringify({ subject: res.subject, body: res.body }) });
  if (sendRes?.ok) toast('Oplevering email verstuurd naar klant!', 'success');
  else toast('Versturen mislukt', 'error');
};

window.retryBuildService = async function(leadId, serviceName) {
  window._buildAllRunning = window._buildAllRunning || {};
  window._buildAllProgress = window._buildAllProgress || {};

  if (window._buildAllRunning[leadId]) { toast('Al bezig met bouwen...', 'warning'); return; }
  window._buildAllRunning[leadId] = true;

  const existing = window._buildAllProgress[leadId] || [];
  const item = existing.find(p => p.service === serviceName);
  if (item) Object.assign(item, { status: 'waiting', percent: 0 });
  else existing.push({ service: serviceName, status: 'waiting', percent: 0 });
  window._buildAllProgress[leadId] = existing;

  await renderProjectPage();
  switchProjectTab('building');

  const updateCard = (svc, updates) => {
    const prog = window._buildAllProgress[leadId];
    if (!prog) return;
    const it = prog.find(p => p.service === svc);
    if (it) Object.assign(it, updates);
    const slug = svc.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const card = document.getElementById(`build-card-${leadId}-${slug}`);
    if (!card) return;
    const statusEl = card.querySelector('.build-status');
    const progressBar = card.querySelector('.build-progress-bar');
    const progressWrap = card.querySelector('.build-progress-wrap');
    if (statusEl) {
      if (updates.status === 'building') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--accent)"><i class="ti ti-loader-2 spin"></i> Bezig...</span>`;
        card.style.borderColor = 'var(--accent)';
      } else if (updates.status === 'done') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--success)"><i class="ti ti-check"></i> Klaar ✓</span>`;
        card.style.borderColor = 'var(--success)';
        if (progressWrap) progressWrap.style.display = 'none';
      } else if (updates.status === 'error') {
        statusEl.innerHTML = `<span style="font-size:12px;color:var(--danger)"><i class="ti ti-x"></i> Mislukt ✗</span>`;
        card.style.borderColor = 'var(--danger)';
        if (progressWrap) progressWrap.style.display = 'none';
      }
    }
    if (progressBar && typeof updates.percent === 'number') {
      progressBar.style.width = updates.percent + '%';
      if (progressWrap && updates.status === 'building') progressWrap.style.display = '';
    }
  };

  try {
    const res = await fetch(`/api/leads/${leadId}/build-all-services`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ serviceNames: [serviceName] })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        window._buildAllRunning[leadId] = false;
        delete window._buildAllProgress[leadId];
        renderProjectPage().then(() => switchProjectTab('building'));
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          if (d.type === 'start') updateCard(d.service, { status: 'building', percent: 10 });
          else if (d.type === 'progress') updateCard(d.service, { percent: d.percent });
          else if (d.type === 'done') updateCard(d.service, { status: 'done', percent: 100 });
          else if (d.type === 'all_done') {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            const l = state.leads.find(x => x.id === leadId);
            if (l && d.deliverables) l.agentDeliverables = d.deliverables;
            toast(`${serviceName} opnieuw gebouwd!`, 'success');
            renderProjectPage().then(() => switchProjectTab('building'));
          } else if (d.type === 'error') {
            window._buildAllRunning[leadId] = false;
            delete window._buildAllProgress[leadId];
            toast(d.message || `Fout bij ${serviceName}`, 'error');
            renderProjectPage().then(() => switchProjectTab('building'));
          }
        } catch {}
      });
      pump();
    }).catch(err => {
      window._buildAllRunning[leadId] = false;
      delete window._buildAllProgress[leadId];
      toast('Verbindingsfout: ' + err.message, 'error');
    });

    pump();
  } catch (err) {
    window._buildAllRunning[leadId] = false;
    delete window._buildAllProgress[leadId];
    toast('Fout: ' + err.message, 'error');
    renderProjectPage().then(() => switchProjectTab('building'));
  }
};

window.deleteDeliverable = function(leadId, dIdx) {
  openModal(`
    <div style="padding:24px">
      <h3 style="margin:0 0 10px;font-size:16px;font-weight:700">Levering verwijderen</h3>
      <p style="margin:0 0 20px;color:var(--text-secondary);font-size:14px">Weet je zeker dat je deze levering wilt verwijderen? Dit kan niet ongedaan worden gemaakt.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="closeModal()">Annuleer</button>
        <button class="btn" style="background:#ef4444;color:#fff" onclick="closeModal();_doDeleteDeliverable('${leadId}',${dIdx})"><i class="ti ti-trash"></i> Verwijder</button>
      </div>
    </div>
  `);
};

window._doDeleteDeliverable = async function(leadId, dIdx) {
  try {
    const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}`, { method: 'DELETE' });
    if (!res?.ok) throw new Error('Verwijderen mislukt');
    const lead = (state.leads || []).find(l => l.id === leadId);
    if (lead?.agentDeliverables) lead.agentDeliverables.splice(dIdx, 1);
    toast('Levering verwijderd', 'success');
    renderProjectPage().then(() => switchProjectTab('building'));
  } catch(e) {
    toast(e.message || 'Verwijderen mislukt', 'error');
  }
};

window.openCombineModal = function(leadId, preSelectedIdx) {
  const lead = (state.leads || []).find(l => l.id === leadId);
  if (!lead) return;
  const deliverables = lead.agentDeliverables || [];

  // All non-embedded deliverables with content are eligible
  const eligible = deliverables
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.status !== 'error' && !d.embedded && (d.html || d.content || d.instructions));

  // HTML builds that can serve as the base website
  const htmlEligible = eligible.filter(({ d }) => d.type === 'code' && d.html);

  if (htmlEligible.length < 1) {
    toast('Je hebt minimaal 1 HTML build nodig als basis om te combineren.', 'error');
    return;
  }
  if (eligible.length < 2) {
    toast('Je hebt minimaal 2 deliverables nodig om te combineren.', 'error');
    return;
  }

  function _combineLabel(d) {
    const svc = (d.service || '').toLowerCase();
    if (d.type === 'code') {
      if (/chatbot|chat/.test(svc)) return '(widget)';
      if (/boek|booking|reserv/.test(svc)) return '(sectie)';
      return '(sectie)';
    }
    return '(sectie)';
  }

  const rows = eligible.map(({ d, i }) => {
    const isHtml = d.type === 'code' && !!d.html;
    const label = _combineLabel(d);
    const typeTag = isHtml
      ? `<span style="font-size:10px;background:#eef2ff;color:#4338ca;border-radius:4px;padding:1px 6px;font-weight:600">HTML</span>`
      : `<span style="font-size:10px;background:var(--surface-2);color:var(--text-muted);border-radius:4px;padding:1px 6px">DOC</span>`;
    return `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface);cursor:pointer"
         id="combineRow-${i}" onclick="window._toggleCombineRow(${i})">
      <input type="checkbox" id="combineCheck-${i}" value="${i}"
        ${i === preSelectedIdx ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--accent);flex-shrink:0"
        onclick="event.stopPropagation();window._toggleCombineRow(${i})">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${esc(d.service)} <span style="font-size:12px;color:var(--text-muted);font-weight:400">${label}</span></div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;display:flex;gap:5px;align-items:center">
          ${typeTag}
          ${d.primary ? `<span style="color:#6366f1;font-weight:600">★ Eerder gecombineerd</span>` : ''}
        </div>
      </div>
      ${isHtml ? `<div>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-secondary);cursor:pointer;white-space:nowrap"
               onclick="event.stopPropagation()">
          <input type="radio" name="combineBase" value="${i}" ${i === preSelectedIdx ? 'checked' : ''}
            style="accent-color:var(--accent)" onclick="window._onCombineBaseChange(${i},event)">
          Basis
        </label>
      </div>` : ''}
    </div>`;
  }).join('');

  openModal(`
    <div style="padding:24px;max-width:520px">
      <h3 style="margin:0 0 6px;font-size:17px;font-weight:700"><i class="ti ti-layers-intersect" style="margin-right:6px;color:var(--accent)"></i>Combineer deliverables</h3>
      <p style="margin:0 0 6px;font-size:13px;color:var(--text-secondary)">Selecteer alles wat samengevoegd moet worden tot één website. Kies daarna de <strong>basis</strong> (de HTML hoofdpagina).</p>
      <p style="margin:0 0 14px;font-size:12px;color:var(--text-muted)">HTML builds worden als sectie/widget ingebouwd. Documenten worden omgezet naar een gestylde sectie op de pagina.</p>
      <div id="combineRowList">${rows}</div>
      <div id="combineError" style="display:none;margin-top:10px;padding:9px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;font-size:13px;color:#dc2626"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px">
        <button class="btn btn-ghost" onclick="closeModal()">Annuleer</button>
        <button class="btn btn-primary" onclick="window._doCombineDeliverables('${esc(leadId)}')">
          <i class="ti ti-layers-intersect"></i> Combineer geselecteerde
        </button>
      </div>
    </div>
  `);
};

window._toggleCombineRow = function(idx) {
  const cb = document.getElementById(`combineCheck-${idx}`);
  if (cb) cb.checked = !cb.checked;
};

window._onCombineBaseChange = function(idx, event) {
  // Auto-check the checkbox when selecting as base
  const cb = document.getElementById(`combineCheck-${idx}`);
  if (cb) cb.checked = true;
};

window._doCombineDeliverables = async function(leadId) {
  const checked = [...document.querySelectorAll('#combineRowList input[type="checkbox"]:checked')].map(cb => parseInt(cb.value));
  const baseEl = document.querySelector('#combineRowList input[name="combineBase"]:checked');
  const baseIdx = baseEl ? parseInt(baseEl.value) : null;
  const errBox = document.getElementById('combineError');

  if (checked.length < 2) {
    errBox.textContent = 'Selecteer minimaal 2 deliverables om te combineren.';
    errBox.style.display = 'block';
    return;
  }
  if (baseIdx === null) {
    errBox.textContent = 'Selecteer welke HTML build de basis website is (klik op Basis).';
    errBox.style.display = 'block';
    return;
  }
  if (!checked.includes(baseIdx)) {
    errBox.textContent = 'De basis deliverable moet ook aangevinkt zijn.';
    errBox.style.display = 'block';
    return;
  }
  errBox.style.display = 'none';

  const injectIdxs = checked.filter(i => i !== baseIdx);
  const confirmBtn = document.querySelector('#combineRowList')?.closest('[style]')?.querySelector('button.btn-primary');
  if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Combineren...'; }

  try {
    const res = await api(`/api/leads/${leadId}/deliverables/combine`, {
      method: 'POST',
      body: JSON.stringify({ baseIdx, injectIdxs })
    });
    if (!res?.ok && !res?.combinedServices) throw new Error(res?.error || 'Combineren mislukt');

    const lead = (state.leads || []).find(l => l.id === leadId);
    if (lead && res.deliverables) lead.agentDeliverables = res.deliverables;

    closeModal();
    toast(`Gecombineerd: ${(res.combinedServices || []).join(' + ')}`, 'success');
    renderProjectPage().then(() => switchProjectTab('building'));
  } catch(e) {
    if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerHTML = '<i class="ti ti-layers-intersect"></i> Combineer geselecteerde'; }
    if (errBox) { errBox.textContent = e.message || 'Combineren mislukt'; errBox.style.display = 'block'; }
  }
};

async function toggleProjectTask(leadId, taskId, checked) {
  const newStatus = checked ? 'klaar' : 'todo';
  const res = await api(`/api/leads/${leadId}/tasks/${taskId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.tasks) {
      const task = lead.tasks.find(t => (t.id || t._id) === taskId);
      if (task) task.status = newStatus;
    }
    toast(checked ? 'Taak voltooid!' : 'Taak heropend', 'success');
  } else {
    toast('Kon taak niet bijwerken', 'error');
  }
}

async function saveProjectNotes(leadId) {
  const notes = document.getElementById('projectNotesArea')?.value || '';
  const res = await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.notes = notes;
    const lbl = document.getElementById('notesSavedLabel');
    if (lbl) { lbl.textContent = '✓ Opgeslagen'; setTimeout(() => { if (lbl) lbl.textContent = ''; }, 2000); }
  }
}

function togglePortalToken(token) {
  const display = document.getElementById('portalCodeDisplay');
  const btn     = document.getElementById('showTokenBtn');
  if (!display || !btn) return;
  const hidden = display.textContent.includes('•');
  display.textContent = hidden ? token : '••••••••••••';
  display.style.letterSpacing = hidden ? '1px' : '3px';
  btn.innerHTML = hidden ? '<i class="ti ti-eye-off"></i> Verberg' : '<i class="ti ti-eye"></i> Toon';
}

function copyPortalInstructions(token, loginUrl, companyName) {
  const text = `Beste ${companyName},\n\nHieronder vind je de inloggegevens voor je klantportaal:\n\nInlogpagina: ${loginUrl}\nPortaalcode: ${token}\n\nVia het portaal kun je de voortgang van je project bekijken en ons berichten sturen.\n\nMet vriendelijke groet`;
  navigator.clipboard.writeText(text);
  toast('Instructies gekopieerd naar klembord!', 'success');
}

async function resendWelcomeEmail(leadId) {
  if (!confirm('Welkomstmail opnieuw sturen naar deze klant?')) return;
  const res = await api(`/api/leads/${leadId}/send-welcome`, { method: 'POST' });
  if (res?.ok) toast('Welkomstmail verstuurd!', 'success');
  else toast('Kon welkomstmail niet sturen', 'error');
}

async function sendPortalReply(leadId) {
  const inp = document.getElementById('portalReplyInput');
  const msg = inp?.value?.trim();
  if (!msg) return;
  inp.disabled = true;
  const res = await api(`/api/leads/${leadId}/portal-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg })
  });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) {
      if (!lead.portalChat) lead.portalChat = [];
      lead.portalChat.push(data.entry);
    }
    inp.value = '';
    inp.style.height = 'auto';
    toast('Bericht verstuurd', 'success');
    renderProjectPage();
  } else {
    toast('Versturen mislukt', 'error');
  }
  if (inp) inp.disabled = false;
}

async function markPortalChatRead(leadId) {
  await api(`/api/leads/${leadId}/portal/read`, { method: 'POST' });
  const lead = state.leads.find(l => l.id === leadId);
  if (lead?.portalChat) lead.portalChat.filter(m => m.from === 'client').forEach(m => { m.readAt = new Date().toISOString(); });
  renderProjectPage();
}

window._portalSvcs = window._portalSvcs || {};

function initPortalServices(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const raw = (lead.projectServices && lead.projectServices.length) ? lead.projectServices : (lead.services || []);
  window._portalSvcs[leadId] = raw.map(s =>
    typeof s === 'string'
      ? { name: s, price: 0, billing: 'maandelijks' }
      : { name: s.name || '', price: parseFloat(s.price) || 0, billing: s.billing || 'maandelijks' }
  ).filter(s => s.name);
  renderPortalServicesRows(leadId);
}

function renderPortalServicesRows(leadId) {
  const svcs = window._portalSvcs[leadId] || [];
  const el = document.getElementById(`portalServicesList-${leadId}`);
  if (!el) return;
  el.innerHTML = svcs.length
    ? svcs.map((s, i) => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px">
          <span style="flex:1;font-size:13px;font-weight:500">${esc(s.name)}</span>
          <span style="font-size:12px;color:var(--text-muted)">€${(s.price||0).toLocaleString('nl-NL')}${s.billing==='eenmalig'?' eenm.':'/mnd'}</span>
          <button class="btn btn-ghost btn-xs" onclick="removePortalService('${esc(leadId)}',${i})" style="color:var(--danger);padding:2px 6px"><i class="ti ti-x"></i></button>
        </div>`).join('')
    : '<div style="font-size:13px;color:var(--text-muted);padding:4px 0">Nog geen diensten. Voeg toe via het dropdown hieronder.</div>';
}

window.addPortalService = function(leadId) {
  const sel = document.getElementById(`portalServiceAdd-${leadId}`);
  if (!sel || !sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  const svc = { name: sel.value, price: parseFloat(opt.dataset.price) || 0, billing: opt.dataset.billing || 'maandelijks' };
  const existing = window._portalSvcs[leadId] || [];
  if (!existing.some(s => s.name === svc.name)) {
    window._portalSvcs[leadId] = [...existing, svc];
    renderPortalServicesRows(leadId);
  }
  sel.value = '';
};

window.removePortalService = function(leadId, idx) {
  if (!window._portalSvcs[leadId]) return;
  window._portalSvcs[leadId].splice(idx, 1);
  renderPortalServicesRows(leadId);
};

window.savePortalServices = async function(leadId) {
  const svcs = window._portalSvcs[leadId] || [];
  const res = await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectServices: svcs })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.projectServices = [...svcs];
    toast('Diensten opgeslagen', 'success');
  } else {
    toast('Opslaan mislukt', 'error');
  }
};

async function savePortalPhase(leadId) {
  const phase = parseInt(document.getElementById('portalPhaseSelect')?.value || '1');
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPhase: phase }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.currentPhase = phase;
    toast('Fase bijgewerkt — klant ziet dit direct', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function toggleDeliverableVisibility(leadId, dIdx, visible) {
  const res = await api(`/api/leads/${leadId}/deliverables/${dIdx}/visibility`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVisible: visible })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.agentDeliverables?.[dIdx]) lead.agentDeliverables[dIdx].clientVisible = visible;
    toast(visible ? 'Build zichtbaar voor klant' : 'Build verborgen voor klant', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function showAllApprovedDeliverables(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  const approved = (lead?.agentDeliverables || []).map((d, i) => ({ d, i })).filter(({ d }) => d.status === 'approved' && !d.clientVisible);
  if (!approved.length) { toast('Alle goedgekeurde builds zijn al zichtbaar', 'success'); return; }
  for (const { i } of approved) {
    await api(`/api/leads/${leadId}/deliverables/${i}/visibility`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientVisible: true })
    });
    if (lead?.agentDeliverables?.[i]) lead.agentDeliverables[i].clientVisible = true;
  }
  toast(`${approved.length} build(s) zichtbaar gemaakt voor klant`, 'success');
  renderProjectPage().then(() => switchProjectTab('portaal'));
}

async function savePortalWelcomeMessage(leadId) {
  const msg = document.getElementById('portalWelcomeInput')?.value?.trim() || '';
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalWelcomeMessage: msg }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalWelcomeMessage = msg;
    toast('Welkomstbericht opgeslagen', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function clearPortalWelcomeMessage(leadId) {
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalWelcomeMessage: '' }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalWelcomeMessage = '';
    toast('Welkomstbericht gewist', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  }
}

async function togglePortalAccess(leadId, block) {
  if (block && !confirm(`Wil je de portaaltoegang voor deze klant blokkeren? Ze kunnen dan niet meer inloggen.`)) return;
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ portalBlocked: block }) });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.portalBlocked = block;
    toast(block ? 'Portaaltoegang geblokkeerd' : 'Portaaltoegang hersteld', block ? 'error' : 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function resetPortalToken(leadId) {
  if (!confirm('Wil je een nieuwe portaalcode genereren? De oude code werkt dan niet meer.')) return;
  const res = await api(`/api/leads/${leadId}/portal/reset-token`, { method: 'POST' });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead && data.portalToken) lead.portalToken = data.portalToken;
    toast('Nieuwe portaalcode gegenereerd', 'success');
    renderProjectPage().then(() => switchProjectTab('portaal'));
  } else {
    toast('Reset mislukt', 'error');
  }
}

function buildRealAnalyticsHtml(lead) {
  const ra = lead._realAnalytics || {};
  const bk = ra.bookings    || {};
  const dv = ra.deliverables|| {};
  const pj = ra.project     || {};
  const em = ra.emails      || {};

  const row = (label, value) =>
    `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid rgba(0,0,0,.06);font-size:13px">
       <span style="color:var(--text-secondary)">${label}</span>
       <span style="font-weight:600;color:var(--text-primary)">${value}</span>
     </div>`;

  const card = (emoji, title, color, border, textColor, body) =>
    `<div style="background:${color};border:1px solid ${border};border-radius:10px;padding:14px 16px;margin-bottom:10px">
       <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:${textColor};margin-bottom:8px">${emoji} ${title}</div>
       ${body}
     </div>`;

  const empty = txt => `<div style="font-size:13px;color:var(--text-muted);padding:3px 0">${txt}</div>`;

  const bookBody = bk.total > 0
    ? `${row('Totaal boekingen', bk.total)}
       ${row('Boekingen deze maand', bk.thisMonth || 0)}
       ${bk.lastBooking  ? row('Laatste boeking', relativeTime(bk.lastBooking))  : ''}
       ${bk.popularService ? row('Populairste dienst', esc(bk.popularService))  : ''}`
    : empty('Nog geen boekingen ontvangen.');

  const delivBody = dv.total > 0
    ? `${row("Pagina's gebouwd", dv.total)}
       ${dv.lastBuilt ? row('Laatste update', relativeTime(dv.lastBuilt)) : ''}
       <div style="margin-top:8px;display:flex;flex-direction:column;gap:4px">
         ${(dv.items||[]).map(d => `
           <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;padding:4px 0;border-top:1px solid rgba(0,0,0,.06)">
             <span style="font-weight:600">${esc(d.service)}</span>
             ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-size:11px">Bekijk →</a>` : '<span style="color:var(--text-muted);font-size:11px">Geen link</span>'}
           </div>`).join('')}
       </div>`
    : empty('Nog geen paginas gebouwd.');

  const projBody = pj.startDate
    ? `${pj.phase ? row('Huidige fase', 'Fase ' + pj.phase + ' van 5') : ''}
       ${pj.daysActive !== null ? row('Dagen actief als klant', pj.daysActive) : ''}
       ${pj.tasksTotal > 0 ? row('Taken voltooid', pj.tasksCompleted + ' van ' + pj.tasksTotal) : ''}`
    : empty('Project is nog niet gestart.');

  const emailBody = em.total > 0
    ? `${row('Berichten verstuurd', em.total)}
       ${em.lastSent ? row('Laatste bericht', relativeTime(em.lastSent)) : ''}`
    : '';

  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      ${card('📅', 'Boekingen',       '#eff6ff', '#bfdbfe', '#1d4ed8', bookBody)}
      ${card('💻', "Gebouwde pagina's",'#f0fdf4', '#bbf7d0', '#15803d', delivBody)}
      ${card('📊', 'Project voortgang','#f5f3ff', '#ddd6fe', '#6d28d9', projBody)}
      ${emailBody ? card('✉️', 'Communicatie', '#fff7ed', '#fed7aa', '#c2410c', emailBody) : ''}
    </div>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;padding:8px 10px;background:var(--surface-2);border-radius:6px">
      ⓘ Alle cijfers zijn gebaseerd op werkelijke data — geen schattingen.
      ${ra.generatedAt ? 'Bijgewerkt: ' + relativeTime(ra.generatedAt) : ''}
    </div>`;
}

async function loadRealAnalytics(leadId) {
  const body = document.getElementById(`realAnalyticsBody-${leadId}`);
  if (!body) return;
  body.innerHTML = '<div style="font-size:13px;color:var(--text-muted)"><i class="ti ti-loader-2 spin"></i> Laden...</div>';
  const res = await api(`/api/leads/${leadId}/real-analytics`);
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead._realAnalytics = data;
    body.innerHTML = buildRealAnalyticsHtml(lead || { _realAnalytics: data });
  } else {
    body.innerHTML = '<div style="font-size:13px;color:var(--danger)">Laden mislukt.</div>';
  }
}

// ─── End Project Page ──────────────────────────────────────────────────────────

function renderLeadDetail(id) { openLeadDetail(id); }

window.openLeadDetail = function openLeadDetail(id) {
  const lead = state.leads.find(l => l.id === id);
  if (!lead) return;
  state.currentLeadId = id;

  // Mark row active
  document.querySelectorAll('.leads-row').forEach(r => r.classList.toggle('row-active', r.dataset.id === id));

  // Find inbox item for email/LinkedIn
  const inboxItem = state.inbox?.find?.(i => i.leadId === id) || null;

  const panel = document.getElementById('detailPanel');
  panel.classList.add('open');

  const timeline = buildTimeline(lead);

  const flag = lead.language === 'nl' ? '🇳🇱' : lead.language === 'en' ? '🇬🇧' : '';
  const emailData    = inboxItem?.email      || lead.email;
  const linkedinData = inboxItem?.linkedinDm || lead.linkedinDm;
  const unreadCount  = (lead.clientMessages || []).filter(m => !m.read).length;

  panel.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-company">${esc(lead.companyName)}${flag ? ` ${flag}` : ''}</div>
        <div class="detail-meta">
          ${nicheBadge(lead.niche)}
          <span class="text-secondary"><i class="ti ti-map-pin"></i> ${lead.location || '—'}</span>
        </div>
        <div class="detail-email-row">
          ${lead.contactEmail
            ? `<i class="ti ti-mail" style="color:var(--text-secondary);font-size:13px"></i>
               <span class="detail-email-addr">${lead.contactEmail}</span>
               ${['verified','scraped','gevonden','agent1_websearch'].includes(lead.emailSource) ? `<span class="email-src-badge email-src-found">✓ Geverifieerd</span>` : lead.emailSource === 'guessed' || lead.emailSource === 'geschat' ? `<span class="email-src-badge email-src-guess">Geschat</span>` : ''}
               <button class="btn btn-ghost btn-sm" style="padding:2px 8px;font-size:11px;margin-left:2px" onclick="navigator.clipboard.writeText('${lead.contactEmail}');toast('Email gekopieerd!')"><i class="ti ti-copy"></i></button>`
            : `<i class="ti ti-mail-off" style="color:#f59e0b;font-size:13px"></i><span style="font-size:12px;color:#f59e0b">Geen email gevonden</span>`}
        </div>
      </div>
      <button class="btn-close-panel" onclick="closeLeadDetail()"><i class="ti ti-x"></i></button>
    </div>

    <div class="detail-tabs">
      <button class="detail-tab active" data-tab="overview"  onclick="switchDetailTab('overview')">Overzicht</button>
      <button class="detail-tab"        data-tab="email"     onclick="switchDetailTab('email')">Email</button>
      <button class="detail-tab"        data-tab="linkedin"  onclick="switchDetailTab('linkedin')">LinkedIn</button>
      <button class="detail-tab"        data-tab="website"   onclick="switchDetailTab('website')">Website</button>
      <button class="detail-tab"        data-tab="notes"     onclick="switchDetailTab('notes')">Notities</button>
      ${lead.status === 'client' ? `<button class="detail-tab" data-tab="payments" onclick="switchDetailTab('payments')">${(lead.payments?.filter(p=>p.status==='sent').length||0) > 0 ? `<i class="ti ti-coin" style="margin-right:3px;color:var(--warning)"></i>Betalingen <span class="tab-badge tab-badge-warning">${lead.payments.filter(p=>p.status==='sent').length}</span>` : '<i class="ti ti-coin" style="margin-right:3px"></i>Betalingen'}</button>` : ''}
      <button class="detail-tab"        data-tab="emails"    onclick="switchDetailTab('emails')">${(lead.clientEmailLog?.length || 0) > 0 ? `<i class="ti ti-mail" style="margin-right:3px"></i>E-mails <span class="tab-badge">${lead.clientEmailLog.length}</span>` : '<i class="ti ti-mail" style="margin-right:3px"></i>E-mails'}</button>
      <button class="detail-tab"        data-tab="portal"    onclick="switchDetailTab('portal')">Klantportaal${unreadCount > 0 ? `<span class="tab-badge">${unreadCount}</span>` : ''}</button>
      <button class="detail-tab"        data-tab="reports"   onclick="switchDetailTab('reports')">Rapporten${lead.reports?.length > 0 ? `<span class="tab-badge">${lead.reports.length}</span>` : ''}</button>
      ${lead.intakeToken ? `<button class="detail-tab" data-tab="intake" onclick="switchDetailTab('intake')">${lead.intakeSubmittedAt ? '<i class="ti ti-clipboard-check" style="color:#10b981;margin-right:4px"></i>' : '<i class="ti ti-clipboard-list" style="margin-right:4px"></i>'}Intake</button>` : ''}
      ${lead.projectPlan ? `<button class="detail-tab" data-tab="project" onclick="switchDetailTab('project')"><i class="ti ti-rocket" style="margin-right:4px"></i>Project</button>` : ''}
      <button class="detail-tab" data-tab="proposal"  onclick="switchDetailTab('proposal')">${(lead.proposals?.length || lead.proposal) ? '<i class="ti ti-file-check" style="margin-right:4px;color:var(--success)"></i>' : '<i class="ti ti-file-text" style="margin-right:4px"></i>'}Voorstel</button>
      <button class="detail-tab" data-tab="contract" onclick="switchDetailTab('contract')">${lead.contract  ? '<i class="ti ti-file-certificate" style="margin-right:4px;color:var(--success)"></i>' : '<i class="ti ti-file-certificate" style="margin-right:4px"></i>'}Contract</button>
    </div>

    <!-- ── Tab: Overzicht ── -->
    <div class="detail-tab-content" data-tab-content="overview">
      <div class="detail-score">
        <span class="score-number score-${scoreColor(lead.score || 0)}" style="font-size:28px;font-weight:800">${(lead.score || 0).toFixed(1)}</span>
        <span class="text-secondary">/10 &nbsp;·&nbsp; €${(lead.estimatedValue || 0).toLocaleString('nl-NL')}/mnd</span>
        ${lead.urgency ? `<span class="badge badge-${lead.urgency === 'critical' ? 'danger' : lead.urgency === 'high' ? 'warning' : 'blue'}" style="font-size:10px">${lead.urgency}</span>` : ''}
        ${(lead.emailBounced || ['bounced','delivery_delayed'].includes(lead.status)) ? `<span class="badge badge-red" style="font-size:10px"><i class="ti ti-mail-off"></i> ${lead.status === 'delivery_delayed' ? 'Vertraagd' : 'Niet aangekomen'}</span>` : ''}
        ${lead.contactEmail && (state.leads || []).some(l => l.id !== lead.id && (l.contactEmail||'').toLowerCase() === lead.contactEmail.toLowerCase() && ['sent','replied','client','scheduled'].includes(l.status)) ? `<span class="badge badge-amber" style="font-size:10px" title="Dit e-mailadres is ook gekoppeld aan een andere lead"><i class="ti ti-alert-triangle"></i> Email duplicaat</span>` : ''}
      </div>

      ${lead.emailOpener ? `<div class="opener-preview" style="margin-bottom:12px"><i class="ti ti-quote"></i><span>${lead.emailOpener}</span></div>` : ''}

      ${lead.problems?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Problemen</div>
          <ul class="problem-list">
            ${lead.problems.map(p => `<li><i class="ti ti-point-filled" style="color:#ef4444;font-size:8px"></i>${p}</li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${lead.services?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Aanbevolen diensten</div>
          <ul class="opportunity-list">
            ${lead.services.map(s => `<li><span>${s.name}</span><span class="service-price">€${s.price}${s.billing === 'eenmalig' ? ' eenmalig' : '/mnd'}</span></li>`).join('')}
          </ul>
        </div>
      ` : ''}

      ${lead.competitors?.competitorNames?.length ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="ti ti-chart-dots" style="color:#f97316;margin-right:4px"></i>Concurrentie analyse</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">Concurrenten in ${lead.location}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
            ${lead.competitors.competitorNames.map(n => `<span style="background:#f3f4f6;border-radius:6px;padding:3px 8px;font-size:12px;font-weight:500">${n}</span>`).join('')}
          </div>
          ${lead.competitors.competitorAdvantages?.length ? `
            <ul class="problem-list" style="margin-bottom:8px">
              ${lead.competitors.competitorAdvantages.map(a => `<li><i class="ti ti-point-filled" style="color:#f97316;font-size:8px"></i>${a}</li>`).join('')}
            </ul>
          ` : ''}
          ${lead.competitors.competitorGap ? `
            <div style="background:var(--warning-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--warning)">
              <i class="ti ti-alert-triangle" style="margin-right:6px;color:var(--warning)"></i>${lead.competitors.competitorGap}
            </div>
          ` : ''}
        </div>
      ` : ''}

      <div class="detail-section">
        <div class="detail-section-title">Status</div>
        <select id="statusSelect" class="detail-select" onchange="updateLeadStatus('${lead.id}', this.value)">
          ${Object.entries(STATUS_LABELS).map(([val, label]) =>
            `<option value="${val}" ${lead.status === val ? 'selected' : ''}>${label}</option>`
          ).join('')}
        </select>
      </div>

      ${['bounced','delivery_delayed'].includes(lead.status) || lead.emailBounced ? `
      <div class="detail-section bounce-alert-section">
        <div class="bounce-alert-header">
          <i class="ti ti-mail-off"></i>
          <span>${lead.status === 'delivery_delayed' ? 'Email vertraagd' : 'Email niet aangekomen'}</span>
        </div>
        <p class="bounce-alert-desc">
          ${lead.status === 'delivery_delayed'
            ? 'De email server van de ontvanger reageert niet. De email is nog niet afgeleverd.'
            : `De email kon niet worden afgeleverd op <strong>${esc(lead.contactEmail || 'onbekend adres')}</strong>. Mogelijk is het adres onjuist of niet meer actief.`}
        </p>
        <div id="retryEmailSection-${lead.id}">
          <button class="btn btn-sm" style="background:#dc2626;color:#fff;gap:6px" onclick="openRetryEmailSection('${lead.id}')">
            <i class="ti ti-refresh"></i> Probeer ander email adres
          </button>
        </div>
      </div>
      ` : ''}

      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="detail-section-title" style="margin:0"><i class="ti ti-users-group" style="margin-right:4px;color:var(--accent)"></i>Referral</div>
          <button class="btn btn-ghost btn-sm" onclick="linkReferral('${lead.id}')">
            <i class="ti ti-link"></i> ${lead.referredBy ? 'Wijzigen' : 'Koppel referrer'}
          </button>
        </div>
        ${lead.referredBy ? (() => {
          const referrer = state.leads.find(l => l.id === lead.referredBy);
          return referrer
            ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--accent-light);border:1px solid #bfdbfe;border-radius:8px;font-size:13px">
                <i class="ti ti-user-check" style="color:var(--accent)"></i>
                <span>Doorverwezen door <strong style="cursor:pointer;color:var(--accent)" onclick="openLeadDetail('${referrer.id}')">${esc(referrer.companyName)}</strong></span>
                <button class="btn btn-ghost btn-sm" style="margin-left:auto;padding:2px 6px;font-size:11px" onclick="unlinkReferral('${lead.id}')"><i class="ti ti-x"></i></button>
              </div>`
            : `<div style="font-size:12px;color:var(--text-muted)">Referrer-id ingesteld maar niet gevonden.</div>`;
        })() : `<div style="font-size:12px;color:var(--text-muted)">Niet doorverwezen — koppel een bestaande klant als referrer.</div>`}
        ${lead.referralEmailSent ? `
          <div style="margin-top:8px;font-size:12px;color:var(--success)"><i class="ti ti-send"></i> Referral-verzoek verstuurd${lead.referralSentAt ? ' op ' + new Date(lead.referralSentAt).toLocaleDateString('nl-NL') : ''}</div>
        ` : ''}
      </div>

      ${state.settings?.calendlyUrl ? `
        <div class="detail-section">
          <div class="detail-section-title"><i class="ti ti-calendar-event" style="color:#006bff"></i> Gesprek inplannen</div>
          <a class="btn btn-ghost btn-sm calendly-btn" href="${esc(state.settings.calendlyUrl)}" target="_blank" rel="noopener">
            <i class="ti ti-calendar-event"></i> Calendly openen
          </a>
          ${lead.calendlyBooking ? `
            <div style="margin-top:8px;padding:8px 12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:12px;color:#1d4ed8">
              <i class="ti ti-check"></i> <strong>${esc(lead.calendlyBooking.eventName)}</strong> ingepland${lead.calendlyBooking.startTime ? ' op ' + new Date(lead.calendlyBooking.startTime).toLocaleString('nl-NL', {dateStyle:'short',timeStyle:'short'}) : ''}
            </div>` : ''}
        </div>
      ` : ''}

      ${['approved','scheduled','sent','replied'].includes(lead.status) && !lead.projectStartedAt ? `
        <div class="detail-section">
          <div class="project-engine-cta">
            <div class="project-engine-title"><i class="ti ti-rocket"></i> Project Engine</div>
            <div class="project-engine-sub">Start het project automatisch: portaal, intake, AI-projectplan, content kalender & taken.</div>
            <button class="btn btn-sm project-engine-btn" onclick="startProject('${lead.id}')">
              <i class="ti ti-rocket"></i> Project starten
            </button>
          </div>
        </div>
      ` : ''}

      ${lead.status === 'client' ? `
        <div class="detail-section">
          <div class="detail-section-title">Facturatie</div>
          <button class="btn btn-primary btn-sm" onclick="createInvoice('${lead.id}')">
            <i class="ti ti-receipt"></i> Betaallink aanmaken
          </button>
          ${lead.stripeUrl ? `<div style="margin-top:8px;font-size:12px;color:var(--text-secondary)">Laatste link: <a href="${lead.stripeUrl}" target="_blank" class="link">${lead.stripeUrl.substring(0,40)}...</a></div>` : ''}
        </div>
        <div class="detail-section" id="case-study-section-${lead.id}">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
            <div class="detail-section-title" style="margin:0">Case study</div>
            <button class="btn btn-ghost btn-sm" onclick="generateCaseStudy('${lead.id}',this)" ${lead.caseStudy ? 'style="font-size:11px"' : ''}>
              <i class="ti ti-sparkles"></i> ${lead.caseStudy ? 'Opnieuw genereren' : 'Genereer case study'}
            </button>
          </div>
          ${lead.caseStudy ? `
            <div style="background:var(--success-light);border:1px solid var(--border);border-radius:10px;padding:14px">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#16a34a;margin-bottom:6px">${esc(lead.caseStudy.industry || lead.niche)}</div>
              <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:8px">${esc(lead.caseStudy.title || '')}</div>
              <p style="font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:10px">${esc(lead.caseStudy.challenge || '')}</p>
              ${(lead.caseStudy.results || []).length ? `<ul style="list-style:none;display:flex;flex-direction:column;gap:4px;margin-bottom:10px">${(lead.caseStudy.results || []).map(r => `<li style="font-size:12px;font-weight:600;color:#16a34a;padding-left:16px;position:relative"><span style="position:absolute;left:0">✓</span>${esc(r)}</li>`).join('')}</ul>` : ''}
              ${lead.caseStudy.quote ? `<div style="border-left:3px solid var(--success);padding:8px 12px;font-size:12px;font-style:italic;color:var(--text-secondary)">&ldquo;${esc(lead.caseStudy.quote)}&rdquo;<div style="font-style:normal;font-size:11px;font-weight:600;color:var(--text-primary);margin-top:4px">${esc(lead.caseStudy.quoteName || '')}</div></div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:10px;margin-top:10px">
              <button class="btn btn-ghost btn-sm" onclick="copyCaseStudy('${lead.id}')"><i class="ti ti-copy"></i> Kopiëren</button>
              <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-left:auto">
                <input type="checkbox" id="cs-publish-${lead.id}" ${lead.caseStudy.published ? 'checked' : ''} onchange="toggleCaseStudyPublish('${lead.id}',this.checked)" style="width:14px;height:14px">
                Publiceer op website
              </label>
            </div>
          ` : '<div style="font-size:12px;color:var(--text-secondary)">Nog geen case study gegenereerd.</div>'}
        </div>
      ` : ''}
    </div>

    <!-- ── Tab: Email ── -->
    <div class="detail-tab-content" data-tab-content="email" style="display:none">
      ${emailData ? `
        <div class="detail-section">
          <div class="detail-email-subject" style="margin-bottom:10px"><strong>${emailData.subject || ''}</strong></div>
          <div class="detail-email-body">${(emailData.body || '').replace(/\n/g,'<br>')}</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px" onclick="copyText(\`${(emailData.subject + '\n\n' + emailData.body).replace(/`/g,'\\`')}\`)">
            <i class="ti ti-copy"></i> Kopiëren
          </button>
        </div>
      ` : '<div class="empty-state"><i class="ti ti-mail-off"></i><p>Geen email beschikbaar</p></div>'}
    </div>

    <!-- ── Tab: LinkedIn ── -->
    <div class="detail-tab-content" data-tab-content="linkedin" style="display:none">
      ${linkedinData ? `
        <div class="detail-section">
          <div class="detail-section-title">LinkedIn DM</div>
          <div class="detail-email-body">${linkedinData.replace(/\n/g,'<br>')}</div>
          <div class="char-count" style="margin-top:8px">${linkedinData.length} / 280 tekens</div>
          <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="li-copy-detail-${lead.id}" onclick="copyLinkedinDm(\`${linkedinData.replace(/`/g,'\\`')}\`,'detail-${lead.id}')">
              <i class="ti ti-copy"></i> Kopiëren
            </button>
            <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(lead.companyName||'')}" target="_blank" rel="noopener">
              <i class="ti ti-brand-linkedin"></i> Zoeken op LinkedIn
            </a>
          </div>
        </div>
      ` : '<div class="empty-state"><i class="ti ti-brand-linkedin"></i><p>Geen LinkedIn DM beschikbaar</p></div>'}
      ${(inboxItem?.voicenoteScript || lead.voicenoteScript) ? (() => {
        const vs = inboxItem?.voicenoteScript || lead.voicenoteScript;
        return `
        <div class="detail-section" style="margin-top:14px">
          <div class="detail-section-title"><i class="ti ti-microphone" style="color:#7c3aed;margin-right:4px"></i>Voicenote script</div>
          <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:8px;padding:14px;font-size:13px;color:#4c1d95;line-height:1.6">${vs.replace(/\n/g,'<br>')}</div>
          <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px">
            <span style="font-size:11px;color:#7c3aed"><i class="ti ti-info-circle"></i> Spreek dit in als WhatsApp of Instagram voicenote voor extra impact</span>
            <button class="btn btn-ghost btn-sm" style="font-size:11px" onclick="copyText(\`${vs.replace(/`/g,'\\`')}\`,'Voicenote gekopieerd!')">
              <i class="ti ti-copy"></i> Kopiëren
            </button>
          </div>
        </div>`;
      })() : ''}
    </div>

    <!-- ── Tab: Website ── -->
    <div class="detail-tab-content" data-tab-content="website" style="display:none">
      ${buildWebsiteTab(lead)}
    </div>

    <!-- ── Tab: Notities ── -->
    <div class="detail-tab-content" data-tab-content="notes" style="display:none">
      <div class="detail-section">
        <div class="detail-section-title">Notities</div>
        <textarea id="leadNotes" class="detail-notes" placeholder="Voeg notities toe...">${lead.notes || ''}</textarea>
        <button class="btn btn-ghost btn-sm" style="margin-top:6px" onclick="saveNotes('${lead.id}')">
          <i class="ti ti-device-floppy"></i> Opslaan
        </button>
      </div>
      <div class="detail-section">
        <div class="detail-section-title">Tijdlijn</div>
        <div class="timeline">${timeline}</div>
      </div>
    </div>

    <!-- ── Tab: Betalingen ── -->
    ${lead.status === 'client' ? `
    <div class="detail-tab-content" data-tab-content="payments" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Betalingen</div>
          <button class="btn btn-primary btn-sm" onclick="createPayment('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuwe factuur
          </button>
        </div>

        ${(lead.payments || []).length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...(lead.payments || [])].reverse().map(p => {
              const statusColors = { sent: '#d97706', paid: '#16a34a', failed: '#dc2626', cancelled: '#9ca3af' };
              const statusLabels = { sent: 'Verstuurd', paid: 'Betaald', failed: 'Mislukt', cancelled: 'Geannuleerd' };
              const isOverdue = p.status === 'sent' && p.dueDate && new Date(p.dueDate) < new Date();
              return `
                <div style="border:1px solid ${isOverdue ? '#fecaca' : 'var(--border)'};border-radius:10px;padding:12px 14px;background:${isOverdue ? '#fef2f2' : '#fff'}">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
                    <div style="flex:1">
                      <div style="font-size:14px;font-weight:700">€${(p.amount||0).toLocaleString('nl-NL')}</div>
                      <div style="font-size:12px;color:var(--text-secondary);margin-top:2px">${esc(p.description||'')}${p.splitIndex ? ` — deel ${p.splitIndex}/${p.splitTotal}` : ''}</div>
                      <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
                        <span style="font-size:10px;font-weight:700;background:${isOverdue?'#fef2f2':'#f3f4f6'};color:${isOverdue?'#dc2626':statusColors[p.status]||'#6b7280'};border-radius:4px;padding:2px 6px">${isOverdue?'ACHTERSTALLIG':statusLabels[p.status]||p.status}</span>
                        <span style="font-size:10px;background:#f3f4f6;border-radius:4px;padding:2px 6px">${esc(p.method||'')}</span>
                        ${p.billing === 'maandelijks' ? '<span class="badge badge-blue" style="font-size:10px">Maandelijks</span>' : ''}
                        <span style="font-size:10px;color:#9ca3af">${p.dueDate ? 'Vervalt ' + formatDate(p.dueDate) : ''}</span>
                        ${p.paidAt ? `<span style="font-size:10px;color:#16a34a">Betaald ${formatDate(p.paidAt)}</span>` : ''}
                      </div>
                    </div>
                    <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex-shrink:0">
                      ${p.paymentUrl ? `<a href="${p.paymentUrl}" target="_blank" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-external-link"></i> Link</a>` : ''}
                      ${p.method === 'bank_transfer' && p.bankDetails ? `<button onclick="showBankDetails('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-building-bank"></i> Bankgegevens</button>` : ''}
                      ${p.status !== 'paid' ? `<button onclick="markPaymentPaid('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#16a34a"><i class="ti ti-check"></i> Betaald</button>` : ''}
                      ${p.status === 'sent' ? `<button onclick="remindPayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px"><i class="ti ti-bell"></i> Herinner</button>` : ''}
                      <button onclick="deletePayment('${lead.id}','${p.id}')" class="btn btn-ghost btn-sm" style="font-size:11px;color:#dc2626"><i class="ti ti-trash"></i></button>
                    </div>
                  </div>
                </div>`;
            }).join('')}
          </div>
        ` : `
          <div style="text-align:center;padding:24px;font-size:13px;color:#9ca3af">
            <i class="ti ti-coin" style="font-size:24px;display:block;margin-bottom:8px"></i>
            Nog geen betalingen aangemaakt
          </div>
        `}
      </div>
    </div>
    ` : ''}

    <!-- ── Tab: E-mails ── -->
    <div class="detail-tab-content" data-tab-content="emails" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Client e-mails sturen</div>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">
          ${[
            { trigger: 'welcome',        label: 'Welkomstmail',      icon: 'ti-rocket' },
            { trigger: 'intakeReceived', label: 'Intake ontvangen',   icon: 'ti-clipboard-check' },
            { trigger: 'deliveryReady',  label: 'Leveringen klaar',   icon: 'ti-sparkles' },
            { trigger: 'weekComplete',   label: 'Week afgerond',      icon: 'ti-circle-check' },
            { trigger: 'monthlyUpdate',  label: 'Maandupdate',        icon: 'ti-chart-bar' },
            { trigger: 'checkIn',        label: 'Check-in',           icon: 'ti-message-circle' },
          ].map(e => `
            <button class="btn btn-ghost btn-sm" onclick="sendClientEmail('${lead.id}','${e.trigger}')">
              <i class="ti ${e.icon}"></i> ${e.label}
            </button>
          `).join('')}
        </div>

        <div class="detail-section-title">Verstuurde e-mails</div>
        ${(lead.clientEmailLog || []).length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${[...(lead.clientEmailLog || [])].reverse().map(log => `
              <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden">
                <div style="background:var(--surface-2);padding:8px 12px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                     onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                  <div>
                    <div style="font-size:13px;font-weight:600">${esc(log.subject || '')}</div>
                    <div style="font-size:11px;color:var(--text-secondary)">${formatDate(log.sentAt)} · ${esc(log.to || '')} · ${esc(log.sentBy || 'systeem')}</div>
                  </div>
                  <i class="ti ti-chevron-down" style="color:#9ca3af;font-size:12px"></i>
                </div>
                <div style="display:none;padding:12px;font-size:12px;color:var(--text-secondary);white-space:pre-line;line-height:1.6">${esc(log.body || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:#9ca3af;padding:12px 0">Nog geen e-mails verstuurd.</div>
        `}
      </div>
    </div>

    <!-- ── Tab: Klantportaal ── -->
    <div class="detail-tab-content" data-tab-content="portal" style="display:none">
      ${buildPortalTab(lead)}
    </div>

    <!-- ── Tab: Rapporten ── -->
    <div class="detail-tab-content" data-tab-content="reports" style="display:none">
      ${lead.reports?.length > 0 ? `
        <div style="display:flex;flex-direction:column;gap:10px">
          ${lead.reports.map(r => `
            <div style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
              <div style="background:var(--surface-2);padding:10px 14px;display:flex;align-items:center;justify-content:space-between;cursor:pointer"
                   onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'':'none'">
                <div>
                  <div style="font-size:13px;font-weight:600">${r.title}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${formatDate(r.createdAt)}</div>
                </div>
                <i class="ti ti-chevron-down" style="color:var(--text-secondary);font-size:13px"></i>
              </div>
              <div style="padding:14px;font-size:13px;color:var(--text-secondary);line-height:1.7;white-space:pre-line">
                ${r.content || ''}
              </div>
            </div>
          `).join('')}
        </div>
      ` : `
        <div class="empty-state">
          <i class="ti ti-file-description"></i>
          <p>Nog geen rapporten</p>
          <p style="font-size:12px;color:#9ca3af">Rapporten worden automatisch aangemaakt op de 1e van elke maand voor klanten</p>
        </div>
      `}
    </div>

    ${lead.intakeToken ? `
    <!-- ── Tab: Intake ── -->
    <div class="detail-tab-content" data-tab-content="intake" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="detail-section-title" style="margin:0">Intake formulier</div>
          ${lead.intakeSubmittedAt
            ? `<span class="badge badge-green"><i class="ti ti-check"></i> Ingevuld ${formatDate(lead.intakeSubmittedAt)}</span>`
            : `<span class="badge badge-warning">Nog niet ingevuld</span>`}
        </div>
        ${lead.intakeAnswers && Object.keys(lead.intakeAnswers).length ? `
          <div style="display:flex;flex-direction:column;gap:10px">
            ${Object.entries(lead.intakeAnswers).map(([q, a]) => `
              <div style="padding:10px 12px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px">
                <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">${esc(q)}</div>
                <div style="font-size:13px;color:var(--text-primary);white-space:pre-line">${esc(a)}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De klant heeft de intake nog niet ingevuld.</div>
        `}
        <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
          <a href="/intake/${lead.id}/${lead.intakeToken}" target="_blank" class="btn btn-ghost btn-sm">
            <i class="ti ti-external-link"></i> Intake link openen
          </a>
          <button class="btn btn-ghost btn-sm" onclick="copyText('/intake/${lead.id}/${lead.intakeToken}'); toast('Link gekopieerd!','success')">
            <i class="ti ti-copy"></i> Link kopiëren
          </button>
        </div>
      </div>
    </div>
    ` : ''}

    ${lead.projectPlan ? `
    <!-- ── Tab: Project ── -->
    <div class="detail-tab-content" data-tab-content="project" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div>
            <div class="detail-section-title" style="margin:0">${esc(lead.projectPlan.title || '')}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:3px">Gestart: ${lead.projectStartedAt ? formatDate(lead.projectStartedAt) : '—'}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge badge-green"><i class="ti ti-rocket"></i> Actief</span>
            <button class="btn btn-ghost btn-sm" onclick="resendWelcomeEmail('${lead.id}')" title="Welkomstmail opnieuw sturen">
              <i class="ti ti-mail-forward"></i> Welkomstmail
            </button>
          </div>
        </div>
        ${lead.projectPlan.overview ? `<p style="font-size:13px;color:var(--text-secondary);line-height:1.6;margin-bottom:14px">${esc(lead.projectPlan.overview)}</p>` : ''}
        <div style="display:flex;flex-direction:column;gap:10px">
          ${(lead.projectPlan.weeks || []).map(w => `
            <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
              <div style="background:var(--surface-2);padding:10px 14px;display:flex;align-items:center;gap:10px">
                <span class="week-badge">Week ${w.week}</span>
                <span style="font-size:13px;font-weight:600">${esc(w.focus || '')}</span>
              </div>
              <ul style="padding:10px 14px 10px 28px;margin:0;display:flex;flex-direction:column;gap:4px">
                ${(w.deliverables || []).map(d => `<li style="font-size:13px;color:var(--text-secondary)">${esc(d)}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="detail-section" id="tasks-section-${lead.id}">
        ${buildTasksHTML(lead, state.users || [], 1)}
      </div>

      ${lead.contentCalendar?.items?.length ? `
      <div class="detail-section">
        <div class="detail-section-title">Content Kalender — Maand 1</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${(lead.contentCalendar.items || []).map(item => `
            <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <span style="font-size:11px;background:#eef2ff;color:#6366f1;border-radius:4px;padding:2px 6px;font-weight:700">Week ${item.week}</span>
                <span style="font-size:11px;background:#f3f4f6;border-radius:4px;padding:2px 6px;font-weight:600">${esc(item.platform || '')}</span>
                <span style="font-size:11px;background:#fefce8;color:#d97706;border-radius:4px;padding:2px 6px;font-weight:600">${esc(item.type || '')}</span>
              </div>
              <div style="font-size:13px;font-weight:600">${esc(item.topic || '')}</div>
              ${item.caption ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:3px">${esc(item.caption)}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div class="detail-section" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <a href="/intake/${lead.id}/${lead.intakeToken || ''}" target="_blank" class="btn btn-ghost btn-sm">
          <i class="ti ti-clipboard-list"></i> Intake formulier
        </a>
        ${!lead.delivery && lead.intakeSubmittedAt ? `
          <button class="btn btn-primary btn-sm" onclick="generateDelivery('${lead.id}')">
            <i class="ti ti-sparkles"></i> Leveringen genereren
          </button>
        ` : ''}
        ${!lead.delivery && !lead.intakeSubmittedAt ? `
          <span style="font-size:12px;color:#9ca3af"><i class="ti ti-info-circle"></i> Leveringen beschikbaar na intake</span>
        ` : ''}
      </div>

      ${lead.delivery ? `
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <div class="detail-section-title" style="margin:0">AI Leveringen</div>
          <div style="display:flex;gap:6px;align-items:center">
            <span class="badge badge-green"><i class="ti ti-check"></i> Gegenereerd</span>
            <button class="btn btn-ghost btn-sm" onclick="generateDelivery('${lead.id}')" title="Opnieuw genereren"><i class="ti ti-refresh"></i></button>
          </div>
        </div>

        ${lead.delivery.contentCalendar?.items?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Content Kalender — Maand 1</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.contentCalendar.items || []).slice(0,5).map(item => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="display:flex;gap:6px;margin-bottom:3px;flex-wrap:wrap">
                  <span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:1px 5px;font-weight:700">W${item.week} ${item.day||''}</span>
                  <span style="background:#f3f4f6;border-radius:4px;padding:1px 5px">${esc(item.platform||'')}</span>
                  <span style="background:#fefce8;color:#d97706;border-radius:4px;padding:1px 5px">${esc(item.type||'')}</span>
                  ${item.bestTime ? `<span style="background:#f0fdf4;color:#16a34a;border-radius:4px;padding:1px 5px">${item.bestTime}</span>` : ''}
                </div>
                <div style="font-weight:600;color:var(--text-primary)">${esc(item.topic||'')}</div>
                ${item.caption ? `<div style="color:var(--text-secondary);margin-top:2px;line-height:1.4">${esc(item.caption)}</div>` : ''}
                ${item.hashtags?.length ? `<div style="color:#6366f1;margin-top:3px">${item.hashtags.join(' ')}</div>` : ''}
              </div>
            `).join('')}
            ${lead.delivery.contentCalendar.items.length > 5 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.contentCalendar.items.length - 5} meer posts</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.chatbotFlow?.faqs?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Chatbot FAQ Script</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.chatbotFlow.faqs || []).slice(0,4).map(faq => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px">
                <div style="font-weight:700;color:var(--text-primary);margin-bottom:3px">${esc(faq.question||'')}</div>
                <div style="color:var(--text-secondary);line-height:1.5">${esc(faq.answer||'')}</div>
              </div>
            `).join('')}
            ${lead.delivery.chatbotFlow.faqs.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.chatbotFlow.faqs.length - 4} meer FAQs</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${lead.delivery.milestones?.milestones?.length ? `
        <div>
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Mijlpalen — 12 weken</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${(lead.delivery.milestones.milestones || []).slice(0,4).map(m => `
              <div style="padding:8px 10px;background:var(--surface-2);border:1px solid var(--border);border-radius:7px;font-size:12px;display:flex;gap:8px;align-items:flex-start">
                <span style="background:#6366f1;color:#fff;border-radius:4px;padding:2px 6px;font-weight:700;flex-shrink:0;font-size:11px">W${m.week}</span>
                <div>
                  <div style="font-weight:700;color:var(--text-primary)">${esc(m.title||'')}</div>
                  ${m.description ? `<div style="color:var(--text-secondary);margin-top:2px">${esc(m.description)}</div>` : ''}
                </div>
              </div>
            `).join('')}
            ${lead.delivery.milestones.milestones.length > 4 ? `<div style="font-size:12px;color:#9ca3af;padding:4px 0">+ ${lead.delivery.milestones.milestones.length - 4} meer weken</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${Object.keys(lead.delivery.serviceDeliveries || {}).length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin-bottom:8px">Service Leveringen (${Object.keys(lead.delivery.serviceDeliveries).length})</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            ${Object.entries(lead.delivery.serviceDeliveries).map(([name, del]) => `
              <div style="padding:8px 10px;background:${del.error ? '#fef2f2' : '#f9fafb'};border:1px solid ${del.error ? '#fecaca' : 'var(--border)'};border-radius:7px;font-size:12px;display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;color:${del.error ? '#dc2626' : '#111'}">${del.error ? '⚠ ' : '✓ '}${esc(name)}</span>
                ${!del.error ? `<button class="btn btn-ghost btn-sm" onclick="previewServiceDelivery('${lead.id}','${name.replace(/'/g,"\\'")}')">Bekijk</button>` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}
      </div>
      ` : ''}
    </div>
    ` : ''}

    <!-- ── Tab: Contract ── -->
    <div class="detail-tab-content" data-tab-content="contract" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Dienstverleningsovereenkomst</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${lead.contract ? `
              <button class="btn btn-ghost btn-sm" onclick="downloadContract('${lead.id}')">
                <i class="ti ti-download"></i> Download
              </button>
              <button class="btn btn-ghost btn-sm" onclick="sendContractEmail('${lead.id}')">
                <i class="ti ti-mail"></i> Verstuur
              </button>
            ` : ''}
            ${isAdmin() ? `<button class="btn btn-primary btn-sm" onclick="generateContract('${lead.id}')" id="contractGenBtn-${lead.id}">
              <i class="ti ti-file-certificate"></i> ${lead.contract ? 'Regenereer' : 'Genereer contract'}
            </button>` : ''}
          </div>
        </div>
        ${lead.contract ? `
          <div class="proposal-preview">
            <iframe id="contractFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:520px"></iframe>
          </div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:8px">
            Gegenereerd op ${new Date(lead.contractGeneratedAt).toLocaleDateString('nl-NL')}
            ${lead.contractSentAt ? ` · <span style="color:var(--success)"><i class="ti ti-check"></i> Verstuurd op ${new Date(lead.contractSentAt).toLocaleDateString('nl-NL')}</span>` : ''}
          </div>
        ` : `
          <div class="empty-state" style="padding:32px 0;text-align:center">
            <i class="ti ti-file-certificate" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen contract gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Genereer contract" om een juridisch contract op te stellen</div>
          </div>
        `}
        <div id="contractProgress-${lead.id}" style="display:none">
          <div class="proposal-progress">
            <div id="contractStep1-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contractgegevens ophalen</div>
            <div id="contractStep2-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opstellen</div>
            <div id="contractStep3-${lead.id}" class="proposal-step pending"><i class="ti ti-circle"></i> Contract opslaan</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Tab: Voorstel ── -->
    <div class="detail-tab-content" data-tab-content="proposal" style="display:none">
      <div class="detail-section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="detail-section-title" style="margin:0">Offerte / voorstel</div>
          ${isAdmin() ? `<button class="btn btn-primary btn-sm" id="propGenBtn-${lead.id}" onclick="openProposalModal('${lead.id}')">
            <i class="ti ti-plus"></i> Nieuw voorstel
          </button>` : ''}
        </div>

        ${_buildProposalsListHtml(lead)}

        ${!(lead.proposals?.length) && !lead.proposal ? `
          <div class="empty-state" style="padding:28px 0;text-align:center">
            <i class="ti ti-file-description" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
            <div style="color:var(--text-secondary);font-size:14px">Nog geen voorstel gegenereerd</div>
            <div style="color:var(--text-muted);font-size:12px;margin-top:4px">Klik op "Nieuw voorstel" om een PDF-offerte op maat te maken</div>
          </div>` : ''}

        ${lead.proposal ? `
          <details style="margin-top:12px">
            <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;padding:6px 0">Oud AI-voorstel tonen</summary>
            <div style="margin-top:8px">
              <div style="display:flex;gap:8px;margin-bottom:8px">
                <button class="btn btn-ghost btn-sm" onclick="downloadProposal('${lead.id}')"><i class="ti ti-download"></i> Download HTML</button>
                <button class="btn btn-ghost btn-sm" onclick="sendProposalEmail('${lead.id}')"><i class="ti ti-mail"></i> Verstuur</button>
              </div>
              <div class="proposal-preview">
                <iframe id="proposalFrame-${lead.id}" sandbox="allow-same-origin" style="width:100%;border:none;min-height:420px"></iframe>
              </div>
            </div>
          </details>` : ''}
      </div>
    </div>
  `;

  // Attach hover-show for task delete buttons
  panel.querySelectorAll('.task-del-btn').forEach(btn => {
    const row = btn.closest('[style*="border:1px solid var(--border)"]');
    if (row) {
      row.addEventListener('mouseenter', () => btn.style.opacity = '1');
      row.addEventListener('mouseleave', () => btn.style.opacity = '0');
    }
  });
}

window.switchDetailTab = function switchDetailTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.detail-tab-content').forEach(c => {
    c.style.display = c.dataset.tabContent === tabName ? '' : 'none';
  });
  if (tabName === 'portal' && state.currentLeadId) {
    api(`/api/leads/${state.currentLeadId}/portal/read`, { method: 'POST' });
    const tabBtn = document.querySelector('.detail-tab[data-tab="portal"]');
    if (tabBtn) { const b = tabBtn.querySelector('.tab-badge'); if (b) b.remove(); }
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    if (lead?.clientMessages) lead.clientMessages.forEach(m => { m.read = true; });
  }
  if (tabName === 'proposal' && state.currentLeadId) {
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    const frame = document.getElementById(`proposalFrame-${state.currentLeadId}`);
    if (frame && lead?.proposal) frame.srcdoc = lead.proposal;
  }
  if (tabName === 'contract' && state.currentLeadId) {
    const lead = state.leads.find(l => l.id === state.currentLeadId);
    const frame = document.getElementById(`contractFrame-${state.currentLeadId}`);
    if (frame && lead?.contract) frame.srcdoc = lead.contract;
  }
}

function buildWebsiteTab(lead) {
  const w = lead.website || {};
  const site = lead.generatedSite;
  const check = (val, label) => `
    <div class="website-check">
      <i class="ti ${val ? 'ti-check' : 'ti-x'}" style="color:${val ? 'var(--success)' : 'var(--danger)'}"></i>
      <span style="font-size:13px">${label}</span>
    </div>`;

  const SITE_TEMPLATES = [
    { id: 'modern',    label: 'Modern',    icon: '✨', desc: 'Clean, witruimte, gradient hero' },
    { id: 'bold',      label: 'Bold',      icon: '⚡', desc: 'Donkere hero, hoog contrast' },
    { id: 'minimal',   label: 'Minimaal',  icon: '◻',  desc: 'Wit, subtiel, elegant' },
    { id: 'corporate', label: 'Corporate', icon: '🏢', desc: 'Zakelijk, blauw, formeel' },
  ];

  const generatorSection = site ? `
    <div class="detail-section site-gen-section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div class="detail-section-title" style="margin:0">Gegenereerde website</div>
          <span class="site-status-badge ${site.status === 'live' ? 'site-status-live' : 'site-status-preview'}">${site.status === 'live' ? 'Live' : 'Preview'}</span>
          ${site.template ? `<span style="font-size:11px;color:var(--text-secondary);background:var(--surface-2);padding:2px 8px;border-radius:20px">${site.template}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <a href="${site.siteUrl}" target="_blank" class="btn btn-sm btn-outline"><i class="ti ti-external-link"></i> Bekijk</a>
          <button class="btn btn-sm btn-ghost" onclick="editSiteHTML('${lead.id}')"><i class="ti ti-code"></i> HTML</button>
          <button class="btn btn-sm btn-ghost" onclick="openSeoPanel('${lead.id}')"><i class="ti ti-search"></i> SEO</button>
          <button class="btn btn-sm btn-ghost" onclick="downloadSiteHTML('${lead.id}')"><i class="ti ti-download"></i> Download</button>
          ${site.status === 'preview'
            ? `<button class="btn btn-sm" style="background:#10b981;color:#fff;border:none" onclick="setSiteStatus('${lead.id}','live')"><i class="ti ti-rocket"></i> Zet live</button>`
            : `<button class="btn btn-sm btn-ghost" onclick="setSiteStatus('${lead.id}','preview')"><i class="ti ti-eye-off"></i> Preview</button>`}
          <button class="btn btn-sm" style="background:#111;color:#fff;border:none" onclick="openRegenerateModal('${lead.id}')"><i class="ti ti-refresh"></i> Regenereer</button>
        </div>
      </div>

      <div class="site-preview-wrap">
        <iframe src="${site.siteUrl}?_t=${Date.now()}" class="site-preview-iframe" title="Website preview" loading="lazy" sandbox="allow-same-origin allow-scripts"></iframe>
      </div>

      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span style="font-size:12px;color:var(--text-muted)">URL:</span>
        <a href="${site.siteUrl}" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all">${site.siteUrl}</a>
        <button class="btn btn-ghost" style="padding:2px 8px;font-size:11px" onclick="navigator.clipboard.writeText('${site.siteUrl}');toast('URL gekopieerd!')"><i class="ti ti-copy"></i></button>
      </div>

      ${(site.versions || []).length ? `
        <div style="margin-top:14px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
            <span><i class="ti ti-history"></i> Versiegeschiedenis (${site.versions.length})</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${(site.versions || []).map((v, i) => `
              <div class="site-version-card">
                <div>
                  <div style="font-size:12px;font-weight:600">${new Date(v.savedAt).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${v.template || 'modern'} template</div>
                </div>
                <button class="btn btn-ghost btn-sm" onclick="revertSiteVersion('${lead.id}', ${i})"><i class="ti ti-history"></i> Terugzetten</button>
              </div>`).join('')}
          </div>
        </div>
      ` : ''}

      ${site.feedback?.length ? `
        <div style="margin-top:12px">
          <div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:6px">Feedback (${site.feedback.length})</div>
          ${site.feedback.map(f => `
            <div style="background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:12px;margin-bottom:4px">
              <span>${esc(f.text)}</span>
              <span style="margin-left:8px;opacity:.6">${esc(f.by)} · ${new Date(f.time).toLocaleDateString('nl-NL')}</span>
            </div>`).join('')}
        </div>
      ` : ''}
    </div>
  ` : `
    <div class="detail-section">
      <div style="font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:10px">Kies een template</div>
      <div class="site-template-grid" id="siteTemplateGrid">
        ${SITE_TEMPLATES.map(t => `
          <div class="site-template-card ${t.id === 'modern' ? 'selected' : ''}" onclick="selectSiteTemplate('${t.id}',this)">
            <div class="site-template-icon">${t.icon}</div>
            <div class="site-template-label">${t.label}</div>
            <div class="site-template-desc">${t.desc}</div>
          </div>`).join('')}
      </div>
      <div style="text-align:center;padding:16px 0 8px">
        <button class="btn" style="background:#111;color:#fff;border:none;padding:12px 28px;font-size:14px" onclick="generateSite('${lead.id}')">
          <i class="ti ti-wand"></i> Website genereren
        </button>
        ${!lead.intakeAnswers ? `<div style="font-size:12px;color:var(--text-muted);margin-top:10px"><i class="ti ti-info-circle"></i> Tip: intake invullen geeft betere resultaten.</div>` : ''}
      </div>
    </div>
  `;

  return `
    ${generatorSection}

    ${lead.websiteUrl ? `
      <div class="website-screenshot-wrap">
        <img class="website-screenshot-img"
             src="https://s.wordpress.com/mshots/v1/${encodeURIComponent(lead.websiteUrl)}?w=600"
             alt="Screenshot" loading="lazy"
             onerror="this.closest('.website-screenshot-wrap').querySelector('.screenshot-error').style.display='flex';this.style.display='none'">
        <div class="screenshot-error" style="display:none;align-items:center;justify-content:center;height:100px;color:var(--text-muted);font-size:13px;gap:6px"><i class="ti ti-photo-off"></i> Screenshot niet beschikbaar</div>
        <a href="${lead.websiteUrl}" target="_blank" class="website-screenshot-link">
          <i class="ti ti-external-link"></i> ${lead.websiteUrl.replace(/^https?:\/\//, '').split('/')[0]}
        </a>
      </div>
    ` : ''}

    ${w.reachable !== undefined ? `
      <div class="detail-section">
        <div class="detail-section-title">Analyse huidige website</div>
        <div class="website-checks">
          ${check(w.reachable, w.reachable ? `Bereikbaar — laadtijd ${w.loadTimeMs ? (w.loadTimeMs/1000).toFixed(1)+'s' : '—'}` : 'Niet bereikbaar')}
          ${check(w.hasHttps,              'HTTPS beveiligd')}
          ${check(w.hasMobileOptimization, 'Mobiel geoptimaliseerd')}
          ${check(w.hasCTA,                'Call-to-action aanwezig')}
          ${check(w.hasBookingSystem || w.hasShop, 'Boekings- of bestelsysteem')}
        </div>
      </div>
      ${w.problems?.length ? `
        <div class="detail-section">
          <div class="detail-section-title">Verbeterpunten</div>
          <ul class="problem-list">
            ${w.problems.map(p => `<li><i class="ti ti-point-filled" style="color:#ef4444;font-size:8px"></i>${p}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
    ` : ''}

    ${(lead.linkedinCompanyUrl || lead.linkedinCompanyFollowers) ? `
      <div class="detail-section">
        <div class="detail-section-title">LinkedIn bedrijfspagina</div>
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          ${lead.linkedinCompanyUrl ? `
            <a href="${esc(lead.linkedinCompanyUrl)}" target="_blank" rel="noopener"
               style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#0a66c2;text-decoration:none;padding:6px 12px;border:1px solid #0a66c2;border-radius:6px">
              <i class="ti ti-brand-linkedin"></i> Bekijk pagina
            </a>
          ` : ''}
          ${lead.linkedinCompanyFollowers ? `
            <span style="font-size:13px;color:var(--text-secondary)"><strong>${lead.linkedinCompanyFollowers.toLocaleString('nl-NL')}</strong> volgers</span>
          ` : ''}
          <span style="font-size:12px;padding:3px 8px;border-radius:999px;background:${lead.linkedinActive !== false ? '#f0fdf4' : '#fef2f2'};color:${lead.linkedinActive !== false ? '#15803d' : '#dc2626'};font-weight:600">
            ${lead.linkedinActive !== false ? 'Actief' : 'Inactief'}
          </span>
        </div>
      </div>
    ` : ''}
  `;
}

function buildTimeline(lead) {
  if (lead.history?.length) {
    const iconMap = {
      created:     { icon: 'ti-plus',          color: '#6366f1' },
      sent:        { icon: 'ti-mail',           color: '#10b981' },
      approved:    { icon: 'ti-check',          color: '#10b981' },
      disapproved: { icon: 'ti-x',              color: '#ef4444' },
      dead:        { icon: 'ti-ghost',          color: '#9ca3af' },
      status:      { icon: 'ti-refresh',        color: '#6366f1' },
      followup1:   { icon: 'ti-mail-forward',   color: '#f59e0b' },
      followup2:   { icon: 'ti-mail-forward',   color: '#ef4444' }
    };
    return lead.history.slice().sort((a, b) => new Date(b.time) - new Date(a.time)).map(e => {
      const { icon, color } = iconMap[e.event] || { icon: 'ti-point', color: '#6b7280' };
      return `
        <div class="timeline-item">
          <div class="timeline-dot" style="background:${color}"><i class="ti ${icon}"></i></div>
          <div>
            <div style="font-size:13px;font-weight:500">${e.label}</div>
            <div style="font-size:11px;color:#9ca3af">${relativeTime(e.time)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Fallback for older leads without history array
  const events = [];
  if (lead.createdAt)     events.push({ icon: 'ti-plus',    color: '#6366f1', label: 'Lead toegevoegd',   time: lead.createdAt });
  if (lead.sentAt)        events.push({ icon: 'ti-mail',    color: '#10b981', label: 'Email verstuurd',   time: lead.sentAt });
  if (lead.openedAt)      events.push({ icon: 'ti-eye',     color: '#3b82f6', label: `Email geopend${lead.openCount > 1 ? ' (' + lead.openCount + 'x)' : ''}`, time: lead.openedAt });
  if (lead.repliedAt)     events.push({ icon: 'ti-message', color: '#f59e0b', label: 'Reactie ontvangen', time: lead.repliedAt });
  if (lead.disapprovedAt) events.push({ icon: 'ti-x',       color: '#ef4444', label: 'Afgewezen',         time: lead.disapprovedAt });

  if (events.length === 0) return '<p class="text-muted" style="font-size:13px">Nog geen activiteit</p>';

  return events.sort((a, b) => new Date(b.time) - new Date(a.time)).map(e => `
    <div class="timeline-item">
      <div class="timeline-dot" style="background:${e.color}"><i class="ti ${e.icon}"></i></div>
      <div>
        <div style="font-size:13px;font-weight:500">${e.label}</div>
        <div style="font-size:11px;color:#9ca3af">${relativeTime(e.time)}</div>
      </div>
    </div>
  `).join('');
}

function closeLeadDetail() {
  const panel = document.getElementById('detailPanel');
  if (panel) panel.classList.remove('open');
  document.querySelectorAll('.leads-row').forEach(r => r.classList.remove('row-active'));
}

async function updateLeadStatus(id, newStatus) {
  const res = await api(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus })
  });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) lead.status = newStatus;
    // Update row pill in table
    const row = document.querySelector(`.leads-row[data-id="${id}"]`);
    if (row) {
      row.dataset.status = newStatus;
      const pill = row.querySelector('.status-pill');
      if (pill) {
        pill.className = `status-pill status-${STATUS_COLORS[newStatus] || 'gray'}`;
        pill.textContent = STATUS_LABELS[newStatus] || newStatus;
      }
    }
    toast('Status bijgewerkt', 'success');
  }
}

async function saveNotes(id) {
  const notes = document.getElementById('leadNotes')?.value || '';
  const res = await api(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ notes })
  });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === id);
    if (lead) lead.notes = notes;
    toast('Notities opgeslagen', 'success');
  }
}

// ─── Client portal tab ───────────────────────────────────────────────────────

function buildPortalTab(lead) {
  if (!lead.portalToken) {
    return `
      <div class="detail-section" style="text-align:center;padding:24px 0">
        <i class="ti ti-world-share" style="font-size:36px;color:var(--text-muted);display:block;margin-bottom:10px"></i>
        <p class="text-secondary" style="font-size:13px;margin-bottom:18px;max-width:280px;margin-left:auto;margin-right:auto">Genereer een unieke klantlink om je klant een live statuspagina te sturen. Ze zien de voortgang en kunnen vragen stellen.</p>
        <button class="btn btn-primary btn-sm" onclick="generatePortalLink('${lead.id}')">
          <i class="ti ti-link"></i> Genereer klantlink
        </button>
      </div>
    `;
  }

  const PHASE_NAMES = ['Intake', 'Uitvoering', 'Oplevering & Check', 'Live gaan', 'Volgende stap'];
  const currentPhase = lead.currentPhase || 1;
  const messages     = lead.clientMessages || [];
  const unread       = messages.filter(m => !m.read).length;
  const portalUrl    = window.location.origin + '/portal/' + lead.portalToken;

  return `
    <div class="detail-section">
      <div class="detail-section-title">Klantlink</div>
      <div class="portal-link-box">
        <span class="portal-url-text">/portal/${lead.portalToken}</span>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="copyText('${portalUrl}')" title="Kopiëren"><i class="ti ti-copy"></i></button>
        <a href="${portalUrl}" target="_blank" class="btn btn-ghost btn-sm btn-icon" title="Openen in nieuw tabblad"><i class="ti ti-external-link"></i></a>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Huidige fase</div>
      <div class="portal-phase-list">
        ${PHASE_NAMES.map((name, i) => {
          const num = i + 1;
          const isDone    = num < currentPhase;
          const isCurrent = num === currentPhase;
          return `<button class="portal-phase-btn${isCurrent ? ' active' : isDone ? ' done' : ''}" onclick="setLeadPhase('${lead.id}', ${num})">
            <span class="portal-phase-num">${isDone ? '✓' : num}</span>${name}
          </button>`;
        }).join('')}
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Verwachte afronddatum</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="date" id="estimatedCompletion" value="${lead.estimatedCompletion || ''}"
          style="padding:7px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:13px;font-family:inherit;color:var(--text-primary);outline:none">
        <button class="btn btn-ghost btn-sm" onclick="savePortalSettings('${lead.id}')">
          <i class="ti ti-device-floppy"></i> Opslaan
        </button>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        Berichten van klant
        ${unread > 0 ? `<span class="badge badge-amber" style="margin-left:6px;font-size:10px">${unread} nieuw</span>` : ''}
      </div>
      ${messages.length === 0
        ? '<p class="text-secondary" style="font-size:13px">Nog geen berichten ontvangen.</p>'
        : messages.slice().reverse().map(m => `
          <div class="client-msg-card${m.read ? '' : ' unread'}">
            <div class="client-msg-header">
              <strong style="font-size:13px">${esc(m.name)}</strong>
              <span class="text-muted" style="font-size:11px">${relativeTime(m.time)}</span>
            </div>
            <div class="client-msg-body">${esc(m.message)}</div>
          </div>
        `).join('')
      }
    </div>

    <div class="detail-section">
      <div class="detail-section-title">📎 Geüploade bestanden door klant</div>
      ${(lead.clientUploads || []).length > 0
        ? (lead.clientUploads || []).map(f => {
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--border);border-radius:6px;margin-bottom:6px;background:var(--surface)">
              <div>
                <div style="font-size:13px;font-weight:600">${esc(f.filename)}</div>
                <div style="font-size:11px;color:var(--text-muted)">${esc(f.mimeType||'')} · ${((f.size||0)/1024).toFixed(1)} KB · ${f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString('nl-NL') : ''}</div>
              </div>
              <button class="btn btn-ghost btn-xs" onclick="downloadClientUpload('${esc(lead.id)}','${esc(f.filename)}')"><i class="ti ti-download"></i> Download</button>
            </div>`;
          }).join('')
        : '<p class="text-secondary" style="font-size:13px">Nog geen bestanden geüpload door klant.</p>'
      }
    </div>
  `;
}

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

function toggleWebhookInstructions() {
  const panel = document.getElementById('webhookInstructions');
  const chevron = document.getElementById('webhookInstrChevron');
  if (!panel) return;
  const open = panel.style.display === 'none';
  panel.style.display = open ? 'block' : 'none';
  if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
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


async function generatePortalLink(leadId) {
  const res = await api(`/api/leads/${leadId}/portal/generate`, { method: 'POST' });
  if (!res || !res.ok) return toast('Genereren mislukt', 'error');
  const data = await res.json();
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return toast('Lead niet gevonden', 'error');
  lead.portalToken = data.token;
  lead.currentPhase = lead.currentPhase || 1;
  const el = document.querySelector('[data-tab-content="portal"]');
  if (el) el.innerHTML = buildPortalTab(lead);
  toast('Klantlink aangemaakt!', 'success');
}

async function setLeadPhase(leadId, phase) {
  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ currentPhase: phase }) });
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) lead.currentPhase = phase;
  document.querySelectorAll('.portal-phase-btn').forEach((btn, i) => {
    const num = i + 1;
    btn.className = `portal-phase-btn${num === phase ? ' active' : num < phase ? ' done' : ''}`;
    btn.querySelector('.portal-phase-num').textContent = num < phase ? '✓' : String(num);
  });
  toast(`Fase ${phase} — ${['Intake','Uitvoering','Oplevering & Check','Live gaan','Volgende stap'][phase-1]} ingesteld`, 'success');
}

async function savePortalSettings(leadId) {
  const completion = document.getElementById('estimatedCompletion')?.value || null;
  const res = await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ estimatedCompletion: completion }) });
  if (res.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.estimatedCompletion = completion;
    toast('Datum opgeslagen', 'success');
  }
}

function removeService(idx) {
  const row = document.querySelector(`.service-row[data-idx="${idx}"]`);
  if (row) row.remove();
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── Upsell email ────────────────────────────────────────────────────────────

async function generateUpsellEmail(leadId) {
  openModal(`
    <div class="modal-header">
      <h3>Upsell email genereren</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px;text-align:center">
      <div class="spinner-lg" style="margin:0 auto 12px"></div>
      <p style="color:var(--text-secondary);font-size:13px">Email genereren met AI...</p>
    </div>
  `);

  const res = await api('/api/upsell/' + leadId + '/email', { method: 'POST' });
  if (!res.ok) {
    openModal('<div class="modal-header"><h3>Fout</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div><div style="padding:20px"><p>Kon email niet genereren.</p><button class="btn btn-primary" onclick="closeModal()">Sluiten</button></div>');
    return;
  }
  const { email, opp } = await res.json();
  if (!email) return;

  openModal(`
    <div class="modal-header">
      <h3>Upsell email — ${opp?.companyName || ''}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px">
      <div style="margin-bottom:12px">
        <label style="font-size:12px;font-weight:600;color:var(--text-secondary);display:block;margin-bottom:4px">Onderwerp</label>
        <input id="upsellSubject" class="form-input" style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:14px" value="${(email.subject||'').replace(/"/g,'&quot;')}">
      </div>
      <div class="email-preview" style="margin-bottom:16px">
        <div class="email-body">${(email.body||'').replace(/\n/g,'<br>')}</div>
      </div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="copyText(\`${(email.subject+'\n\n'+email.body).replace(/`/g,'\\`')}\`,'Email gekopieerd!')">
          <i class="ti ti-copy"></i> Kopiëren
        </button>
        <button class="btn btn-primary" onclick="sendUpsellEmail('${leadId}')">
          <i class="ti ti-send"></i> Verstuur naar mezelf
        </button>
        <button class="btn btn-ghost" onclick="closeModal()">Sluiten</button>
      </div>
    </div>
  `);

  window._upsellEmail = email;
}

async function sendUpsellEmail(leadId) {
  const subject = document.getElementById('upsellSubject')?.value || window._upsellEmail?.subject || '';
  const body    = window._upsellEmail?.body || '';
  const btn     = document.querySelector('.modal-footer button, .modal-header + div button[onclick*="sendUpsell"]') || null;

  const res = await api('/api/upsell/' + leadId + '/send', {
    method: 'POST',
    body: JSON.stringify({ subject, body })
  });
  if (res.ok) {
    toast('Upsell email verstuurd naar jouw inbox!', 'success');
    closeModal();
  } else {
    toast('Versturen mislukt', 'error');
  }
}

// ─── Project Engine ───────────────────────────────────────────────────────────

function startProject(leadId) { openProjectConfigModal(leadId, false); }
function editProjectConfig(leadId) { openProjectConfigModal(leadId, true); }

function openProjectConfigModal(leadId, editMode) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const servicesList = state.settings?.services || [];
  const today = new Date().toISOString().split('T')[0];
  const startDate = lead.projectStartDate || today;

  const serviceCheckboxes = servicesList.length
    ? servicesList.map((s, sIdx) => {
        const sName    = typeof s === 'string' ? s : s.name;
        const sPrice   = typeof s === 'object' ? (parseFloat(s.price) || 0) : 0;
        const sBilling = typeof s === 'object' ? (s.billing || 'maandelijks') : 'maandelijks';
        const checked  = !lead.services?.length || (lead.services || []).some(ls => (typeof ls === 'string' ? ls : ls.name) === sName);
        // Use existing custom price if project was already configured
        const existingSvc = (lead.projectServices || []).find(ps => (typeof ps === 'string' ? ps : ps.name) === sName);
        const displayPrice = existingSvc != null ? (parseFloat(existingSvc.price) ?? sPrice) : sPrice;
        const billingTag = sBilling === 'eenmalig' ? 'eenm.' : '/mnd';
        const cid = `svcchk-${sIdx}`;
        const pid = `svcprice-${sIdx}`;
        const bid = `svcbilling-${sIdx}`;
        return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;margin-bottom:6px;background:var(--surface)">
          <input type="checkbox" id="${cid}" name="svc" value="${esc(sName)}" data-price="${sPrice}" data-billing="${sBilling}" ${checked ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0;cursor:pointer"
            onchange="updateProjectTotal();document.getElementById('${pid}').style.display=this.checked?'block':'none';document.getElementById('${bid}').style.display=this.checked?'inline':'none'">
          <label for="${cid}" style="flex:1;font-size:13px;font-weight:500;cursor:pointer;margin:0">${esc(sName)}</label>
          <input id="${pid}" type="number" class="svc-price-input form-control" value="${displayPrice}" min="0" step="1"
            style="display:${checked?'block':'none'};width:82px;font-size:13px;padding:4px 8px;text-align:right;border:1px solid var(--border);border-radius:6px"
            oninput="updateProjectTotal()" placeholder="0">
          <span id="${bid}" style="font-size:11px;color:var(--text-muted);white-space:nowrap;display:${checked?'inline':'none'}">${billingTag}</span>
        </div>`;
      }).join('')
    : `<div style="font-size:13px;color:var(--text-muted)">Geen diensten in instellingen. <a onclick="setView('settings')" style="color:var(--accent);cursor:pointer">Voeg toe in Instellingen →</a></div>`;

  const durationOptions = [
    { value: 1, label: '1 maand' }, { value: 3, label: '3 maanden' },
    { value: 6, label: '6 maanden' }, { value: 12, label: '12 maanden' },
    { value: 0, label: 'Onbepaald' },
  ];
  const currentDur = lead.projectDuration !== undefined ? lead.projectDuration : 12;
  const durationSel = durationOptions.map(o =>
    `<option value="${o.value}" ${currentDur === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

  const billingOptions = [
    { value: 'maandelijks', label: 'Maandelijks' },
    { value: 'eenmalig',    label: 'Eenmalig' },
    { value: 'gesplitst',   label: 'Gesplitst (50/50)' },
  ];
  const currentBilling = lead.projectBilling || 'maandelijks';

  const problems = lead.problems || [];
  const problemCheckboxes = problems.length
    ? problems.map((p, i) => {
        const txt = typeof p === 'string' ? p : (p.text || p.description || JSON.stringify(p));
        const low = txt.toLowerCase();
        const isCritical = low.includes('geen') || low.includes('niet') || low.includes('slecht') || low.includes('0');
        const icon = isCritical ? '🔴' : '🟡';
        const severityLabel = isCritical ? 'Kritiek' : 'Medium';
        const severityColor = isCritical ? 'var(--danger)' : '#d97706';
        const alreadySel = !lead.selectedProblems || lead.selectedProblems.includes(txt);
        return `<label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border:1px solid var(--border);border-radius:8px;cursor:pointer;margin-bottom:6px;background:var(--surface)">
          <input type="checkbox" name="prob" value="${esc(txt)}" ${alreadySel ? 'checked' : ''} style="width:15px;height:15px;accent-color:var(--accent);flex-shrink:0">
          <span style="font-size:15px;flex-shrink:0">${icon}</span>
          <span style="flex:1;font-size:13px;line-height:1.4">${esc(txt)}</span>
          <span style="font-size:10px;padding:1px 7px;border-radius:3px;background:${severityColor}22;color:${severityColor};font-weight:600;white-space:nowrap;flex-shrink:0">${severityLabel}</span>
        </label>`;
      }).join('')
    : `<div style="font-size:13px;color:var(--text-muted);padding:8px 0">Geen problemen gedetecteerd — agents bouwen op basis van bestelde diensten.</div>`;

  openModal(`
    <div class="modal-header">
      <strong><i class="ti ti-settings" style="color:var(--accent)"></i> Project configureren — ${esc(lead.companyName)}</strong>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:0 0 8px;max-height:65vh;overflow-y:auto">

      ${problems.length ? `
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Problemen <span style="font-weight:400;text-transform:none;color:var(--text-secondary)">(selecteer wat agents aanpakken)</span></div>
      <div id="projProblemsList" style="margin-bottom:16px">${problemCheckboxes}</div>
      <div style="height:1px;background:var(--border);margin-bottom:16px"></div>
      ` : ''}

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Diensten</div>
      <div id="projServicesList" style="margin-bottom:6px">${serviceCheckboxes}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface-2);border-radius:8px;margin-bottom:16px;font-size:13px">
        <span style="font-weight:600">Totaal services</span>
        <span id="projServicesTotal" style="font-weight:700;color:var(--accent)">€0</span>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Prijs</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Totaalprijs (€) — laat leeg voor auto</label>
          <input type="number" id="projPrice" class="form-control" value="${lead.estimatedValue || lead.servicePrice || ''}" placeholder="Auto van diensten" min="0" style="width:100%" oninput="window._projPriceManual=true">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Facturering</label>
          <select id="projBilling" class="form-control" style="width:100%">
            ${billingOptions.map(o => `<option value="${o.value}" ${currentBilling === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">Looptijd</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Duur</label>
          <select id="projDuration" class="form-control" style="width:100%" onchange="updateProjectEndDate()">
            ${durationSel}
          </select>
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Startdatum</label>
          <input type="date" id="projStartDate" class="form-control" value="${startDate}" style="width:100%" onchange="updateProjectEndDate()">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px">Einddatum</label>
          <input type="date" id="projEndDate" class="form-control" value="${lead.projectEndDate || ''}" style="width:100%;background:var(--surface-2)" readonly>
        </div>
      </div>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin-bottom:8px">
        Notities <span style="font-weight:400;text-transform:none">(intern, niet zichtbaar voor klant)</span>
      </div>
      <textarea id="projNotes" class="form-control" rows="3" placeholder="Speciale wensen, doelen, beperkingen..." style="width:100%;resize:vertical">${esc(lead.projectNotes || '')}</textarea>

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:16px 0 8px">
        Verjaardag contactpersoon <span style="font-weight:400;text-transform:none">(voor automatische verjaardagsmail)</span>
      </div>
      <input type="date" id="projBirthday" class="form-input" style="max-width:200px" value="${esc(lead.clientBirthday || '')}">

      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted);margin:16px 0 8px">
        Eigen domein <span style="font-weight:400;text-transform:none">(optioneel — klant kan eigen domeinnaam koppelen)</span>
      </div>
      <div style="display:flex;gap:10px;align-items:center">
        <input type="text" id="projCustomDomain" class="form-input" style="flex:1;max-width:320px"
          value="${esc(lead.customDomain || '')}"
          placeholder="www.klantnaam.nl">
        ${lead.customDomain ? `<span style="font-size:12px;padding:3px 10px;border-radius:20px;font-weight:600;${lead.customDomainStatus === 'active' ? 'background:#f0fdf4;color:#16a34a' : lead.customDomainStatus === 'error' ? 'background:#fef2f2;color:#dc2626' : 'background:#fffbeb;color:#d97706'}">
          ${lead.customDomainStatus === 'active' ? '✓ Actief' : lead.customDomainStatus === 'error' ? '✗ Fout' : '⏳ In afwachting'}
        </span>` : ''}
      </div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Het klantportaal toont automatisch de DNS-instructies voor dit domein.</div>

    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="confirmStartProject('${leadId}',${editMode})">
        <i class="ti ti-${editMode ? 'check' : 'rocket'}"></i> ${editMode ? 'Opslaan' : 'Sla op en start project'}
      </button>
    </div>
  `);

  window._projPriceManual = !!(lead.estimatedValue || lead.servicePrice);
  updateProjectTotal();
  updateProjectEndDate();
}
window.openProjectConfigModal = openProjectConfigModal;

function updateProjectTotal() {
  const checked = [...document.querySelectorAll('#projServicesList input[name="svc"]:checked')];
  const getPrice = el => {
    const inp = el.parentElement?.querySelector('.svc-price-input');
    return parseFloat(inp?.value) || parseFloat(el.dataset.price) || 0;
  };
  const monthly = checked.filter(el => el.dataset.billing !== 'eenmalig').reduce((sum, el) => sum + getPrice(el), 0);
  const oneTime = checked.filter(el => el.dataset.billing === 'eenmalig').reduce((sum, el) => sum + getPrice(el), 0);
  const totalEl = document.getElementById('projServicesTotal');
  if (totalEl) {
    let label = '';
    if (monthly > 0 && oneTime > 0) label = `€${monthly.toLocaleString('nl-NL')}/mnd + €${oneTime.toLocaleString('nl-NL')} eenm.`;
    else if (monthly > 0) label = `€${monthly.toLocaleString('nl-NL')}/mnd`;
    else if (oneTime > 0) label = `€${oneTime.toLocaleString('nl-NL')} eenmalig`;
    else label = '€0';
    totalEl.textContent = label;
  }
  if (!window._projPriceManual && (monthly + oneTime) > 0) {
    const priceEl = document.getElementById('projPrice');
    if (priceEl) priceEl.value = monthly > 0 ? monthly : oneTime;
  }
}

function updateProjectEndDate() {
  const durEl   = document.getElementById('projDuration');
  const startEl = document.getElementById('projStartDate');
  const endEl   = document.getElementById('projEndDate');
  if (!durEl || !startEl || !endEl) return;
  const months = parseInt(durEl.value);
  if (!months || !startEl.value) { endEl.value = ''; return; }
  const d = new Date(startEl.value);
  d.setMonth(d.getMonth() + months);
  endEl.value = d.toISOString().split('T')[0];
}

async function confirmStartProject(leadId, editMode) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const checkedEls = [...document.querySelectorAll('#projServicesList input[name="svc"]:checked')];
  const projectServices = checkedEls.map(el => {
    const priceInput = el.parentElement?.querySelector('.svc-price-input');
    return {
      name: el.value,
      price: parseFloat(priceInput?.value) || parseFloat(el.dataset.price) || 0,
      billing: el.dataset.billing || 'maandelijks'
    };
  });
  const services = projectServices.length ? projectServices : (lead.services || []);
  const selectedProblems = [...document.querySelectorAll('#projProblemsList input[name="prob"]:checked')].map(el => el.value);
  const price     = parseFloat(document.getElementById('projPrice')?.value) || 0;
  const billing   = document.getElementById('projBilling')?.value || 'maandelijks';
  const duration  = parseInt(document.getElementById('projDuration')?.value) || 0;
  const startDate = document.getElementById('projStartDate')?.value || new Date().toISOString().split('T')[0];
  const endDate   = document.getElementById('projEndDate')?.value || '';
  const notes        = document.getElementById('projNotes')?.value?.trim() || '';
  const birthday     = document.getElementById('projBirthday')?.value || '';
  const customDomain = document.getElementById('projCustomDomain')?.value?.trim().toLowerCase().replace(/^https?:\/\//,'') || '';

  const patch = {
    estimatedValue: price, servicePrice: price,
    projectBilling: billing, projectDuration: duration,
    projectStartDate: startDate, projectEndDate: endDate,
    projectNotes: notes,
    selectedProblems: selectedProblems,
    projectServices: projectServices,
    ...(birthday ? { clientBirthday: birthday } : {}),
    ...(customDomain !== (lead.customDomain || '') ? { customDomain, customDomainStatus: customDomain ? 'pending' : null } : {})
  };
  if (services.length) patch.services = services;

  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) Object.assign(state.leads[idx], patch);

  closeModal();
  if (editMode) {
    toast('Project configuratie bijgewerkt', 'success');
    renderProjectPage();
  } else {
    _doStartProject(leadId);
  }
}

function _doStartProject(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const steps = [
    { label: 'Portaaltoegang instellen' },
    { label: 'Intake link genereren' },
    { label: 'Welkomstmail versturen' },
    { label: 'Projectplan genereren (AI)' },
    { label: 'Video onboarding script genereren (AI)' },
    { label: 'Content kalender genereren (AI)' },
    { label: 'Week 1 takenlijst aanmaken (AI)' },
    { label: 'Team briefing versturen' },
    { label: 'Status bijwerken naar klant' },
  ];

  const stepsHTML = steps.map((s, i) => `
    <div class="project-step" id="pstep-${i+1}" style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
      <div class="pstep-icon" id="pstep-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">
        ${i+1}
      </div>
      <span id="pstep-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
      <span id="pstep-note-${i+1}" style="font-size:11px;color:#9ca3af;margin-left:auto"></span>
    </div>
  `).join('');

  openModal(`
    <div class="modal-header">
      <h3 style="background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent">
        <i class="ti ti-rocket" style="-webkit-text-fill-color:#6366f1"></i> Project starten — ${esc(lead.companyName)}
      </h3>
      <button class="modal-close" id="projectModalClose" onclick="closeModal()" disabled><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px">
      <div id="project-steps-list">${stepsHTML}</div>
      <div id="project-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:8px"><i class="ti ti-check"></i> Project succesvol gestart!</div>
        <div id="project-result-links" style="display:flex;flex-direction:column;gap:6px;font-size:12px"></div>
      </div>
      <div id="project-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="projectDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Sluiten</button>
    </div>
  `);

  const handleEvent = (d) => {
    const { step, label, status, note, intakeUrl, portalUrl } = d;

    if (step > 0) {
      const icon   = document.getElementById(`pstep-icon-${step}`);
      const lbl    = document.getElementById(`pstep-label-${step}`);
      const noteEl = document.getElementById(`pstep-note-${step}`);
      if (icon) {
        if (status === 'running') {
          icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>';
          icon.style.borderColor = '#6366f1';
        } else if (status === 'done') {
          icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>';
          icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4';
        } else if (status === 'skipped') {
          icon.innerHTML = '<i class="ti ti-minus" style="font-size:12px;color:#9ca3af"></i>';
        }
      }
      if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
      if (noteEl && note) noteEl.textContent = note;
    }

    if (status === 'complete') {
      const resultDiv = document.getElementById('project-result');
      const linksDiv  = document.getElementById('project-result-links');
      const doneBtn   = document.getElementById('projectDoneBtn');
      const closeBtn  = document.getElementById('projectModalClose');
      if (resultDiv) resultDiv.style.display = '';
      if (doneBtn) doneBtn.style.display = '';
      if (closeBtn) closeBtn.disabled = false;
      if (linksDiv) linksDiv.innerHTML = [
        intakeUrl ? `<div><strong>Intake link:</strong> <a href="${intakeUrl}" target="_blank" class="link">${intakeUrl}</a></div>` : '',
        portalUrl ? `<div><strong>Klantportaal:</strong> <a href="${portalUrl}" target="_blank" class="link">${portalUrl}</a></div>` : '',
      ].join('');
      const localLead = state.leads.find(l => l.id === leadId);
      if (localLead) { localLead.status = 'client'; localLead.projectStartedAt = new Date().toISOString(); }
      // Remove inbox card and show success toast if project was started from inbox
      if (window._inboxProjectStart?.leadId === leadId) {
        const { itemId } = window._inboxProjectStart;
        const companyName = localLead?.companyName || '';
        // Remove the card with a fade-out
        const card = document.getElementById(`card-${itemId}`);
        if (card) {
          card.style.transition = 'opacity 0.3s';
          card.style.opacity = '0';
          setTimeout(() => {
            card.remove();
            // Also remove from state.inbox so empty-state check is accurate
            state.inbox = (state.inbox || []).filter(i => i.id !== itemId);
            // Show empty state if inbox is now empty
            const container = document.getElementById('inboxCards');
            if (container && !container.querySelector('.inbox-card')) {
              container.innerHTML = `<div class="empty-state" style="padding:40px 0">
                <i class="ti ti-inbox" style="font-size:32px;color:var(--text-muted)"></i>
                <p>Inbox is leeg</p>
              </div>`;
            }
          }, 300);
        }
        toast(`✓ Project gestart — ${companyName} is nu een klant`, 'success');
        window._inboxProjectStart = null;
      }
    }

    if (status === 'error') {
      const errDiv   = document.getElementById('project-error');
      const closeBtn = document.getElementById('projectModalClose');
      const doneBtn  = document.getElementById('projectDoneBtn');
      if (errDiv) { errDiv.style.display = ''; errDiv.textContent = label; }
      if (closeBtn) closeBtn.disabled = false;
      if (doneBtn) doneBtn.style.display = '';
    }
  };

  fetch(`/api/leads/${leadId}/start-project`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        const closeBtn = document.getElementById('projectModalClose');
        const doneBtn  = document.getElementById('projectDoneBtn');
        if (closeBtn) closeBtn.disabled = false;
        if (doneBtn) doneBtn.style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (line.startsWith('data: ')) {
          try { handleEvent(JSON.parse(line.slice(6))); } catch {}
        }
      });
      pump();
    }).catch(() => {
      const closeBtn = document.getElementById('projectModalClose');
      const doneBtn  = document.getElementById('projectDoneBtn');
      if (closeBtn) closeBtn.disabled = false;
      if (doneBtn) doneBtn.style.display = '';
    });
    pump();
  }).catch(() => {
    const closeBtn = document.getElementById('projectModalClose');
    const doneBtn  = document.getElementById('projectDoneBtn');
    if (closeBtn) closeBtn.disabled = false;
    if (doneBtn) doneBtn.style.display = '';
  });
}

// ─── Payments ────────────────────────────────────────────────────────────────

function createPayment(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const s = state.settings || {};
  const defaultAmount = (lead.services || []).filter(sv => sv.billing !== 'eenmalig').reduce((sum, sv) => sum + (sv.price||0), 0) || lead.estimatedValue || 800;
  const defaultDesc = (lead.services || []).map(sv => sv.name).join(', ') || 'AI-diensten';

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-coin"></i> Nieuwe factuur — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Type</label>
        <div style="display:flex;gap:6px">
          ${[{v:'subscription',l:'Abonnement',i:'ti-refresh'},{v:'once',l:'Eenmalig',i:'ti-coin'},{v:'split',l:'Gesplitst',i:'ti-scissors'}].map(t=>`
            <label id="paytype_${t.v}" style="display:flex;align-items:center;gap:5px;padding:7px 12px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center">
              <input type="radio" name="payType" value="${t.v}" ${t.v==='subscription'?'checked':''} style="display:none" onchange="updatePayTypeUI()">
              <i class="ti ${t.i}"></i> ${t.l}
            </label>
          `).join('')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Bedrag excl. BTW (€)</label>
          <input type="number" id="payAmount" value="${defaultAmount}" min="1" oninput="updateBtwBreakdown('pay')">
        </div>
        <div class="form-group" id="splitPartsGroup" style="display:none">
          <label>Aantal delen</label>
          <select id="splitParts">
            <option value="2">2 delen</option>
            <option value="3">3 delen</option>
          </select>
        </div>
      </div>
      ${s.btwEnabled ? `<div class="btw-breakdown" id="btwBreakdownPay">
        <div class="btw-row"><span>Excl. BTW</span><span id="btwExclPay">€ ${defaultAmount.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row"><span>BTW ${s.btwRate !== undefined ? s.btwRate : 21}%</span><span id="btwAmtPay">€ ${(defaultAmount * (s.btwRate !== undefined ? s.btwRate : 21) / 100).toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row btw-total"><span>Incl. BTW</span><span id="btwInclPay">€ ${(defaultAmount * (1 + (s.btwRate !== undefined ? s.btwRate : 21) / 100)).toFixed(2).replace('.',',')}</span></div>
      </div>` : ''}
      <div class="form-group">
        <label>Omschrijving</label>
        <input type="text" id="payDesc" value="${esc(defaultDesc)}">
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Betaalmethode</label>
          <select id="payMethod">
            <option value="bank_transfer" selected>Bankoverschrijving</option>
          </select>
        </div>
        <div class="form-group">
          <label>Vervaldatum</label>
          <input type="date" id="payDue" value="${new Date(Date.now()+7*86400000).toISOString().split('T')[0]}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" id="savePayBtn" onclick="savePayment('${leadId}')">
        <i class="ti ti-send"></i> Factuur aanmaken
      </button>
    </div>
  `);
  updatePayTypeUI();
}

function updatePayTypeUI() {
  document.querySelectorAll('input[name="payType"]').forEach(el => {
    const lbl = document.getElementById('paytype_' + el.value);
    if (lbl) { lbl.style.borderColor = el.checked ? 'var(--accent)' : 'var(--border)'; lbl.style.background = el.checked ? '#eef2ff' : ''; lbl.style.color = el.checked ? 'var(--accent)' : ''; }
  });
  const isSplit = document.querySelector('input[name="payType"]:checked')?.value === 'split';
  const grp = document.getElementById('splitPartsGroup');
  if (grp) grp.style.display = isSplit ? '' : 'none';
}

async function savePayment(leadId) {
  const amountExcl = parseFloat(document.getElementById('payAmount')?.value || 0);
  const desc    = document.getElementById('payDesc')?.value?.trim();
  const method  = document.getElementById('payMethod')?.value || 'bank_transfer';
  const dueDate = document.getElementById('payDue')?.value;
  const type    = document.querySelector('input[name="payType"]:checked')?.value || 'subscription';
  const splitParts = parseInt(document.getElementById('splitParts')?.value || 2);
  const billing = type === 'subscription' ? 'maandelijks' : 'eenmalig';
  if (!amountExcl || amountExcl < 1) return toast('Voer een geldig bedrag in', 'error');
  const s = state.settings || {};
  const btwEnabled = s.btwEnabled || false;
  const btwRate    = s.btwRate !== undefined ? s.btwRate : 21;
  const btwAmt     = btwEnabled ? Math.round(amountExcl * btwRate) / 100 : 0;
  const amount     = btwEnabled ? Math.round((amountExcl + btwAmt) * 100) / 100 : amountExcl;
  const description = btwEnabled ? `${desc} (incl. ${btwRate}% BTW)` : desc;
  const btn = document.getElementById('savePayBtn');
  btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';
  const res  = await api(`/api/leads/${leadId}/payments`, { method: 'POST', body: JSON.stringify({ type, amount, description, billing, method, dueDate, splitParts }) });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Aanmaken mislukt', 'error'); btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Factuur aanmaken'; return; }
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { if (!lead.payments) lead.payments = []; lead.payments.push(...(Array.isArray(data) ? data : [data])); }
  closeModal();
  toast(`Factuur aangemaakt${Array.isArray(data) && data.length > 1 ? ` (${data.length} delen)` : ''}`, 'success');
  renderLeadDetail(leadId);
}

async function markPaymentPaid(leadId, payId) {
  const res = await api(`/api/leads/${leadId}/payments/${payId}`, { method: 'PATCH', body: JSON.stringify({ status: 'paid' }) });
  if (!res.ok) return toast('Bijwerken mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  const pay  = lead?.payments?.find(p => p.id === payId);
  if (pay) { pay.status = 'paid'; pay.paidAt = new Date().toISOString(); }
  toast('Betaling gemarkeerd als betaald', 'success');
  renderLeadDetail(leadId);
}

async function remindPayment(leadId, payId) {
  const btn = event?.target?.closest('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i>'; }
  const res  = await api(`/api/leads/${leadId}/payments/${payId}/remind`, { method: 'POST' });
  const data = await res.json();
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-bell"></i> Herinner'; }
  if (!res.ok) return toast(data.error || 'Versturen mislukt', 'error');
  toast('Herinnering verstuurd', 'success');
}

async function deletePayment(leadId, payId) {
  if (!confirm('Betaling verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/payments/${payId}`, { method: 'DELETE' });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead?.payments) lead.payments = lead.payments.filter(p => p.id !== payId);
  toast('Betaling verwijderd', 'success');
  renderLeadDetail(leadId);
}

function showBankDetails(leadId, payId) {
  const lead = state.leads.find(l => l.id === leadId);
  const p = lead?.payments?.find(p => p.id === payId);
  if (!p?.bankDetails) return toast('Geen bankgegevens gevonden', 'error');
  const d = p.bankDetails;
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-building-bank"></i> Bankgegevens</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:10px">
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;font-size:14px">
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">IBAN</span><strong>${esc(d.iban)}</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Tenaamstelling</span><strong>${esc(d.name)}</strong></div>
        ${d.bic ? `<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">BIC</span><strong>${esc(d.bic)}</strong></div>` : ''}
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Bedrag</span><strong style="color:var(--accent)">€${(p.amount||0).toLocaleString('nl-NL')}</strong></div>
        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Omschrijving</span><strong>${esc(p.description||'')}</strong></div>
      </div>
      <p style="font-size:12px;color:var(--text-muted)">Stuur bovenstaande gegevens naar de klant zodat zij de betaling kunnen uitvoeren.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Sluiten</button>
      <button class="btn btn-primary" onclick="navigator.clipboard.writeText('IBAN: ${esc(d.iban)}\\nTenaamstelling: ${esc(d.name)}${d.bic ? '\\nBIC: ' + esc(d.bic) : ''}\\nBedrag: €${p.amount}\\nOmschrijving: ${esc(p.description||'')}');toast('Gekopieerd','success')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
    </div>
  `);
}

// ─── Client email sender ──────────────────────────────────────────────────────

const CLIENT_EMAIL_LABELS = {
  welcome:        'Welkomstmail',
  intakeReceived: 'Intake ontvangen',
  deliveryReady:  'Leveringen klaar',
  weekComplete:   'Week afgerond',
  monthlyUpdate:  'Maandupdate',
  checkIn:        'Check-in',
};

async function resendWelcomeEmail(leadId) {
  const btn = document.querySelector(`button[onclick="resendWelcomeEmail('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  try {
    const res = await api(`/api/leads/${leadId}/send-welcome`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) { toast(data.error || 'Versturen mislukt', 'error'); return; }
    toast(`Welkomstmail verstuurd naar ${data.to}`, 'success');
  } catch (err) {
    toast('Fout: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Welkomstmail'; }
  }
}

function openAddDocModal(leadId) {
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-folder-plus"></i> Document toevoegen</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:12px">
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">TYPE</label>
        <div style="display:flex;gap:8px" id="docTypeSelector">
          ${[['link','Link / URL','ti-link'],['password','Wachtwoord','ti-lock'],['note','Notitie','ti-file-text']].map(([v,l,ic]) =>
            `<label style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px 6px;border:1.5px solid var(--border);border-radius:8px;cursor:pointer;font-size:12px;font-weight:600">
              <input type="radio" name="docType" value="${v}" ${v==='link'?'checked':''} style="display:none" onchange="document.querySelectorAll('#docTypeSelector label').forEach(el=>el.style.borderColor='var(--border)');this.closest('label').style.borderColor='var(--accent)'">
              <i class="ti ${ic}" style="font-size:18px"></i>${l}
            </label>`).join('')}
        </div>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">TITEL *</label>
        <input type="text" id="docTitle" placeholder="Bijv. Google Drive map, WordPress login..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">INHOUD (URL / WACHTWOORD / TEKST)</label>
        <input type="text" id="docContent" placeholder="Vul hier de URL, het wachtwoord of de tekst in..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div id="docUsernameRow">
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">GEBRUIKERSNAAM (optioneel)</label>
        <input type="text" id="docUsername" placeholder="admin@domein.nl" style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;color:var(--text-secondary);display:block;margin-bottom:5px">BESCHRIJVING (optioneel)</label>
        <input type="text" id="docDescription" placeholder="Extra toelichting..." style="width:100%;height:38px;padding:0 12px;border:1.5px solid var(--border);border-radius:7px;font-family:inherit;font-size:13px;background:var(--surface);color:var(--text);outline:none">
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer">
        <input type="checkbox" id="docVisible" checked> Direct zichtbaar voor klant in portaal
      </label>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveNewDoc('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
    </div>
  `);
  // Show/hide username field based on type
  document.querySelectorAll('input[name="docType"]').forEach(r => r.addEventListener('change', () => {
    document.getElementById('docUsernameRow').style.display = r.value === 'password' ? '' : 'none';
  }));
  document.getElementById('docUsernameRow').style.display = 'none';
  // Highlight initially selected type
  document.querySelector('input[name="docType"]:checked')?.closest('label')?.style && (document.querySelector('input[name="docType"]:checked').closest('label').style.borderColor = 'var(--accent)');
}

async function saveNewDoc(leadId) {
  const type        = document.querySelector('input[name="docType"]:checked')?.value || 'link';
  const title       = document.getElementById('docTitle')?.value?.trim();
  const content     = document.getElementById('docContent')?.value?.trim();
  const username    = document.getElementById('docUsername')?.value?.trim();
  const description = document.getElementById('docDescription')?.value?.trim();
  const visible     = document.getElementById('docVisible')?.checked ?? true;
  if (!title) { toast('Voer een titel in', 'error'); return; }
  const res = await api(`/api/leads/${leadId}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, title, content, username, description, visible })
  });
  if (res?.ok) {
    const data = await res.json();
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) { if (!lead.documents) lead.documents = []; lead.documents.push(data.document); }
    closeModal();
    toast('Document toegevoegd', 'success');
    renderProjectPage();
  } else {
    toast('Toevoegen mislukt', 'error');
  }
}

async function toggleDocVisibility(leadId, docId, currentlyHidden) {
  const res = await api(`/api/leads/${leadId}/documents/${docId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visible: currentlyHidden })
  });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    const doc = lead?.documents?.find(d => d.id === docId);
    if (doc) doc.visible = currentlyHidden;
    toast(currentlyHidden ? 'Document zichtbaar' : 'Document verborgen', 'success');
    renderProjectPage();
  } else toast('Opslaan mislukt', 'error');
}

async function deleteDoc(leadId, docId) {
  if (!confirm('Document verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/documents/${docId}`, { method: 'DELETE' });
  if (res?.ok) {
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.documents = (lead.documents || []).filter(d => d.id !== docId);
    toast('Document verwijderd', 'success');
    renderProjectPage();
  } else toast('Verwijderen mislukt', 'error');
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

async function sendWeeklyUpdate(leadId) {
  const btn = document.querySelector(`button[onclick="sendWeeklyUpdate('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res = await api(`/api/leads/${leadId}/send-weekly-update`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    toast(`Weekupdate verstuurd: ${data.subject || ''}`, 'success');
    renderProjectPage();
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail-forward"></i> Weekupdate sturen'; }
  }
}

function _openDeliveryEmailModal(leadId, subject, body) {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📦 Oplevering email</h3>
    </div>
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Onderwerp</div>
      <div id="delivSubject" style="font-size:14px;font-weight:600;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">${esc(subject)}</div>
    </div>
    <div style="margin-bottom:16px">
      <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Email inhoud</div>
      <div id="delivBodyView" style="font-size:13px;white-space:pre-wrap;padding:12px;background:var(--bg);border-radius:8px;border:1px solid var(--border);max-height:320px;overflow-y:auto">${esc(body)}</div>
      <textarea id="delivBodyEdit" style="display:none;width:100%;min-height:240px;font-size:13px;padding:12px;border:1.5px solid var(--accent);border-radius:8px;font-family:inherit;resize:vertical"></textarea>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" style="flex:1" onclick="sendDeliveryEmail('${leadId}')"><i class="ti ti-send"></i> Verstuur naar klant</button>
      <button class="btn btn-outline" onclick="toggleDeliveryEmailEdit()"><i class="ti ti-pencil"></i> Bewerken</button>
      <button class="btn btn-ghost" onclick="copyToClipboard((document.getElementById('delivBodyEdit')?.style.display!=='none'?document.getElementById('delivBodyEdit')?.value:document.getElementById('delivBodyView')?.textContent)||'','Gekopieerd!')"><i class="ti ti-copy"></i></button>
    </div>
  `);
}

window.openSavedDeliveryEmail = function(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  const oe = lead?.opleveringEmail;
  if (!oe) return toast('Geen opgeslagen email gevonden', 'error');
  _openDeliveryEmailModal(leadId, oe.subject, oe.body);
};

async function generateDeliveryEmail(leadId, regenerate = false) {
  if (regenerate) {
    if (!confirm('Weet je zeker? De huidige email wordt overschreven.')) return;
  }
  const btn = document.querySelector(`button[onclick="generateDeliveryEmail('${leadId}')"], button[onclick="generateDeliveryEmail('${leadId}', true)"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res  = await api(`/api/leads/${leadId}/generate-delivery-email`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (btn) { btn.disabled = false; btn.innerHTML = regenerate ? '<i class="ti ti-refresh"></i> Opnieuw genereren' : '<i class="ti ti-sparkles"></i> Genereer & stuur'; }
  if (!res?.ok) return toast(data?.error || 'Genereren mislukt', 'error');
  if (regenerate) toast('Email opnieuw gegenereerd', 'success');
  // Update local state so UI refreshes
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    lead.opleveringEmail = { subject: data.subject, body: data.body, generatedAt: new Date().toISOString(), sentAt: lead.opleveringEmail?.sentAt || null };
  }
  renderProjectPage().then(() => switchProjectTab('emails'));
  _openDeliveryEmailModal(leadId, data.subject, data.body);
}

function toggleDeliveryEmailEdit() {
  const view = document.getElementById('delivBodyView');
  const edit = document.getElementById('delivBodyEdit');
  if (!view || !edit) return;
  if (edit.style.display !== 'none') {
    view.textContent = edit.value;
    view.style.display = '';
    edit.style.display = 'none';
  } else {
    edit.value = view.textContent;
    view.style.display = 'none';
    edit.style.display = '';
    edit.focus();
  }
}

async function sendDeliveryEmail(leadId) {
  const subject = document.getElementById('delivSubject')?.textContent?.trim() || '';
  const editEl  = document.getElementById('delivBodyEdit');
  const viewEl  = document.getElementById('delivBodyView');
  const body    = editEl?.style.display !== 'none' ? (editEl?.value || '') : (viewEl?.textContent || '');
  const btn = document.querySelector(`button[onclick="sendDeliveryEmail('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res  = await api(`/api/leads/${leadId}/send-delivery-email`, { method: 'POST', body: JSON.stringify({ subject, body }) });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    closeModal();
    toast('Oplevering email verstuurd!', 'success');
    const lead = state.leads.find(l => l.id === leadId);
    if (lead?.opleveringEmail) lead.opleveringEmail.sentAt = new Date().toISOString();
    renderProjectPage().then(() => switchProjectTab('emails'));
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Verstuur naar klant'; }
  }
}

async function generateAdminInstructions(leadId) {
  const btn = document.querySelector(`button[onclick="generateAdminInstructions('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Genereren...'; }
  const res  = await api(`/api/leads/${leadId}/generate-admin-instructions`, { method: 'POST' });
  const data = res ? await res.json() : {};
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-file-text"></i> Genereer'; }
  if (!res?.ok) return toast(data?.error || 'Genereren mislukt', 'error');
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📋 Admin instructies</h3>
    </div>
    <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:16px;max-height:380px;overflow-y:auto;margin-bottom:16px">
      <pre id="adminInstrText" style="font-size:12px;white-space:pre-wrap;font-family:inherit;color:var(--text-primary);line-height:1.7">${esc(data.text)}</pre>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="sendAdminInstructions('${leadId}')"><i class="ti ti-mail"></i> Stuur naar mijzelf</button>
      <button class="btn btn-outline" onclick="copyToClipboard(document.getElementById('adminInstrText')?.textContent||'','Gekopieerd!')"><i class="ti ti-copy"></i> Kopieer alles</button>
      <button class="btn btn-ghost" onclick="downloadAdminInstructions()"><i class="ti ti-download"></i> Download .txt</button>
    </div>
  `);
}

async function sendAdminInstructions(leadId) {
  const text = document.getElementById('adminInstrText')?.textContent || '';
  const btn  = document.querySelector(`button[onclick="sendAdminInstructions('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res  = await api(`/api/leads/${leadId}/send-admin-email`, { method: 'POST', body: JSON.stringify({ text }) });
  const data = res ? await res.json() : {};
  if (res?.ok) {
    toast('Admin instructies verstuurd naar jouw email!', 'success');
  } else {
    toast(data?.error || 'Versturen mislukt', 'error');
  }
  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-mail"></i> Stuur naar mijzelf'; }
}

function downloadAdminInstructions() {
  const text = document.getElementById('adminInstrText')?.textContent || '';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'admin-instructies.txt'; a.click();
  URL.revokeObjectURL(url);
}

// ── Project files helpers ───────────────────────────────────────────────────
window.toggleProjectFileShare = async function(leadId, fileId, shared) {
  const res = await api(`/api/leads/${leadId}/project-files/${fileId}`, {
    method: 'PATCH',
    body: JSON.stringify({ sharedWithClient: shared, adminOnly: !shared })
  });
  if (!res?.ok) return toast('Bijwerken mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    const f = (lead.projectFiles || []).find(f => f.id === fileId);
    if (f) { f.sharedWithClient = shared; f.adminOnly = !shared; }
  }
  toast(shared ? 'Zichtbaar voor klant ✓' : 'Verborgen voor klant', shared ? 'success' : 'info');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
};

window.deleteProjectFile = async function(leadId, fileId) {
  if (!confirm('Bestand verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/project-files/${fileId}`, { method: 'DELETE' });
  if (!res?.ok) return toast('Verwijderen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) lead.projectFiles = (lead.projectFiles || []).filter(f => f.id !== fileId);
  toast('Bestand verwijderd', 'info');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
};

window.openAddProjectFileModal = function(leadId) {
  openModal(`
    <div class="modal-header"><h3 class="modal-title">📁 Bestand toevoegen</h3></div>
    <div class="form-group">
      <label>Naam</label>
      <input type="text" id="pfName" placeholder="Bijv. Boekingssysteem MexyDigital" class="form-control">
    </div>
    <div class="form-group">
      <label>Type</label>
      <select id="pfType" class="form-control">
        <option value="html">🌐 HTML pagina</option>
        <option value="document">📄 Document</option>
        <option value="strategy">📊 Strategie</option>
      </select>
    </div>
    <div class="form-group">
      <label>URL</label>
      <input type="text" id="pfUrl" placeholder="https://... of /sites/..." class="form-control">
    </div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn btn-primary" style="flex:1" onclick="saveProjectFile('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
    </div>
  `);
};

window.saveProjectFile = async function(leadId) {
  const name = document.getElementById('pfName')?.value?.trim();
  const type = document.getElementById('pfType')?.value || 'html';
  const url  = document.getElementById('pfUrl')?.value?.trim();
  if (!name || !url) return toast('Naam en URL zijn verplicht', 'error');
  const res  = await api(`/api/leads/${leadId}/project-files`, {
    method: 'POST',
    body: JSON.stringify({ name, type, url })
  });
  const data = res ? await res.json() : {};
  if (!res?.ok) return toast(data?.error || 'Toevoegen mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { lead.projectFiles = lead.projectFiles || []; lead.projectFiles.push(data); }
  closeModal();
  toast('Bestand toegevoegd!', 'success');
  renderProjectPage().then(() => switchProjectTab('bestanden'));
};

async function sendClientEmail(leadId, trigger) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const label = CLIENT_EMAIL_LABELS[trigger] || trigger;

  // First preview the email
  const previewBtn = document.querySelector(`button[onclick="sendClientEmail('${leadId}','${trigger}')"]`);
  if (previewBtn) { previewBtn.disabled = true; previewBtn.innerHTML = '<i class="ti ti-loader-2 spin"></i>'; }

  const prevRes = await api(`/api/leads/${leadId}/client-email`, { method: 'POST', body: JSON.stringify({ trigger, preview: true }) });
  const prev = await prevRes.json();

  if (previewBtn) { previewBtn.disabled = false; previewBtn.innerHTML = `<i class="ti ti-mail"></i> ${label.split(' ')[0]}`; }

  if (!prevRes.ok) return toast(prev.error || 'Preview mislukt', 'error');

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-mail"></i> ${esc(label)} — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:12px">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:4px">ONDERWERP</div>
        <div style="font-size:14px;font-weight:600">${esc(prev.subject || '')}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--text-secondary);margin-bottom:6px">INHOUD</div>
        <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.7;white-space:pre-line;max-height:300px;overflow-y:auto">${esc(prev.body || '')}</div>
      </div>
      ${!lead.email ? `<div style="background:var(--danger-light);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:13px;color:var(--danger)"><i class="ti ti-alert-triangle"></i> Geen email adres bekend voor dit bedrijf.</div>` : `<div style="font-size:12px;color:var(--text-secondary)"><i class="ti ti-send"></i> Wordt verstuurd naar: <strong>${esc(lead.email || lead.contactEmail || '—')}</strong></div>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      ${lead.email || lead.contactEmail ? `<button class="btn btn-primary" id="confirmSendEmailBtn" onclick="confirmSendClientEmail('${leadId}','${trigger}')">
        <i class="ti ti-send"></i> Verstuur
      </button>` : ''}
    </div>
  `);
}

async function confirmSendClientEmail(leadId, trigger) {
  const btn = document.getElementById('confirmSendEmailBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Versturen...'; }
  const res = await api(`/api/leads/${leadId}/client-email`, { method: 'POST', body: JSON.stringify({ trigger }) });
  const data = await res.json();
  if (!res.ok) { toast(data.error || 'Versturen mislukt', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-send"></i> Verstuur'; } return; }
  closeModal();
  toast(`E-mail verstuurd: ${data.subject}`, 'success');
  // Refresh lead detail to show in log
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) {
    if (!lead.clientEmailLog) lead.clientEmailLog = [];
    lead.clientEmailLog.push({ trigger, subject: data.subject, sentAt: new Date().toISOString(), sentBy: 'handmatig' });
  }
}

function generateDelivery(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const steps = [
    { label: 'Content kalender genereren (maand 1, 20 posts)' },
    { label: 'Chatbot FAQ flow genereren (12 Q&A)' },
    { label: 'Projectmijlpalen uitwerken (12 weken)' },
    { label: 'Service-specifieke leveringen genereren' },
    { label: 'Opslaan & klant notificeren' },
  ];

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-sparkles" style="color:#6366f1"></i> AI Leveringen — ${esc(lead.companyName)}</h3>
      <button class="modal-close" id="delivModalClose" onclick="closeModal()" disabled><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px">
      ${steps.map((s, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div id="dstep-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">${i+1}</div>
          <span id="dstep-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
        </div>
      `).join('')}
      <div id="deliv-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;font-size:14px;font-weight:700;color:#15803d">
        <i class="ti ti-check"></i> Leveringen succesvol gegenereerd!
      </div>
      <div id="deliv-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="delivDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Sluiten</button>
    </div>
  `);

  fetch(`/api/leads/${leadId}/generate-delivery`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}` }
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        document.getElementById('delivModalClose').disabled = false;
        document.getElementById('delivDoneBtn').style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          const { step, label, status } = d;
          if (step > 0) {
            const icon = document.getElementById(`dstep-icon-${step}`);
            const lbl  = document.getElementById(`dstep-label-${step}`);
            if (icon) {
              if (status === 'running') { icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>'; icon.style.borderColor = '#6366f1'; }
              else if (status === 'done') { icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>'; icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4'; }
            }
            if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
          }
          if (status === 'complete') {
            document.getElementById('deliv-result').style.display = '';
            document.getElementById('delivDoneBtn').style.display = '';
            document.getElementById('delivModalClose').disabled = false;
            const localLead = state.leads.find(l => l.id === leadId);
            if (localLead) localLead.deliveryGenerated = true;
          }
          if (status === 'error') {
            const errDiv = document.getElementById('deliv-error');
            if (errDiv) { errDiv.style.display = ''; errDiv.textContent = label; }
            document.getElementById('delivModalClose').disabled = false;
            document.getElementById('delivDoneBtn').style.display = '';
          }
        } catch {}
      });
      pump();
    }).catch(() => { document.getElementById('delivModalClose').disabled = false; document.getElementById('delivDoneBtn').style.display = ''; });
    pump();
  });
}

// ─── Website Generator ────────────────────────────────────────────────────────

function previewServiceDelivery(leadId, svcName) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const del = lead.delivery?.serviceDeliveries?.[svcName];
  if (!del || !del.html) return;
  openModal(svcName, `
    <div style="max-height:70vh;overflow:auto;padding:4px 0">
      <div style="font-size:11px;color:#9ca3af;margin-bottom:12px">Gegenereerd: ${del.generatedAt ? new Date(del.generatedAt).toLocaleString('nl-NL') : '—'}</div>
      ${del.html}
    </div>
  `, { wide: true });
}

function generateSite(leadId) {
  const steps = [
    { label: 'Website content genereren met AI' },
    { label: 'Volledige HTML website bouwen' },
    { label: 'Website opslaan en URL aanmaken' },
    { label: 'Preview link versturen naar klant' }
  ];

  openModal('Website genereren', `
    <div style="padding:4px 0">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px">
        Claude genereert een professionele website op basis van de bedrijfsinfo en intake antwoorden. Dit duurt ongeveer 30–60 seconden.
      </p>
      ${steps.map((s, i) => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div id="site-step-icon-${i+1}" style="width:22px;height:22px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:11px;color:#9ca3af">${i+1}</div>
          <span id="site-step-label-${i+1}" style="font-size:13px;color:var(--text-secondary)">${s.label}</span>
        </div>
      `).join('')}
      <div id="site-result" style="display:none;margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px">
        <div style="font-size:14px;font-weight:700;color:#15803d;margin-bottom:6px"><i class="ti ti-check"></i> Website succesvol gegenereerd!</div>
        <a id="site-result-link" href="#" target="_blank" style="font-size:12px;color:#6366f1;word-break:break-all"></a>
      </div>
      <div id="site-error" style="display:none;margin-top:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;font-size:13px;color:#dc2626"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" id="siteModalClose" onclick="closeModal()" disabled>Sluiten</button>
      <button class="btn btn-ghost" id="siteDoneBtn" style="display:none" onclick="closeModal(); renderLeadDetail('${leadId}')">Bekijk resultaat</button>
    </div>
  `);

  const selectedTemplate = document.querySelector('#siteTemplateGrid .selected')?.dataset?.template
    || document.querySelector('.site-template-card.selected')?.dataset?.template
    || (window._selectedSiteTemplate ?? 'modern');

  fetch(`/api/leads/${leadId}/generate-site`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${localStorage.getItem('agencyToken')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ template: selectedTemplate })
  }).then(res => {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    const pump = () => reader.read().then(({ done, value }) => {
      if (done) {
        document.getElementById('siteModalClose').disabled = false;
        document.getElementById('siteDoneBtn').style.display = '';
        return;
      }
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      parts.forEach(part => {
        const line = part.trim();
        if (!line.startsWith('data: ')) return;
        try {
          const d = JSON.parse(line.slice(6));
          const { step, label, status, siteUrl } = d;
          if (step > 0) {
            const icon = document.getElementById(`site-step-icon-${step}`);
            const lbl  = document.getElementById(`site-step-label-${step}`);
            if (icon) {
              if (status === 'running') { icon.innerHTML = '<i class="ti ti-loader-2 spin" style="font-size:12px;color:#6366f1"></i>'; icon.style.borderColor = '#6366f1'; }
              else if (status === 'done') { icon.innerHTML = '<i class="ti ti-check" style="font-size:12px;color:#10b981"></i>'; icon.style.borderColor = '#10b981'; icon.style.background = '#f0fdf4'; }
            }
            if (lbl) lbl.style.color = status === 'done' ? '#111' : status === 'running' ? '#6366f1' : '';
          }
          if (status === 'complete') {
            document.getElementById('site-result').style.display = '';
            if (siteUrl) { const a = document.getElementById('site-result-link'); a.href = siteUrl; a.textContent = siteUrl; }
            document.getElementById('siteDoneBtn').style.display = '';
          }
          if (status === 'error') {
            document.getElementById('site-error').textContent = label;
            document.getElementById('site-error').style.display = '';
            document.getElementById('siteModalClose').disabled = false;
          }
        } catch { /* ignore */ }
      });
      pump();
    }).catch(() => { document.getElementById('siteModalClose').disabled = false; document.getElementById('siteDoneBtn').style.display = ''; });
    pump();
  });
}

async function editSiteHTML(leadId) {
  const res  = await apiFetch(`/api/leads/${leadId}/site`);
  const data = await res.json();
  if (!data.exists) { toast('Geen website gevonden'); return; }

  openModal('HTML bewerken', `
    <div style="padding:4px 0">
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">Bewerk de HTML direct. Sla op om de live site bij te werken.</p>
      <textarea id="siteHtmlEditor" style="width:100%;height:420px;font-family:monospace;font-size:12px;padding:10px;border:1.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);resize:vertical;white-space:pre">${data.html.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn" style="background:#111;color:#fff;border:none" onclick="saveSiteHTML('${leadId}')"><i class="ti ti-device-floppy"></i> Opslaan</button>
    </div>
  `);
}

async function saveSiteHTML(leadId) {
  const el = document.getElementById('siteHtmlEditor');
  if (!el) return;
  const html = el.value.replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const res = await apiFetch(`/api/leads/${leadId}/site`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ html }) });
  if (res.ok) { toast('Website opgeslagen!'); closeModal(); renderLeadDetail(leadId); }
  else { toast('Opslaan mislukt'); }
}

async function setSiteStatus(leadId, status) {
  const res = await apiFetch(`/api/leads/${leadId}/site/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  if (res.ok) { toast(status === 'live' ? 'Website is live gezet!' : 'Terug naar preview'); renderLeadDetail(leadId); }
  else { toast('Status wijzigen mislukt'); }
}

function sendSiteFeedback(leadId) {
  openModal('Feedback toevoegen', `
    <div style="padding:4px 0">
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Beschrijf wat er aangepast moet worden aan de website.</p>
      <textarea id="siteFeedbackText" placeholder="Bijv: Verander de kleur van de knop naar groen, voeg een telefoon sectie toe..." style="width:100%;height:120px;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:13px;background:var(--bg);color:var(--text);resize:vertical"></textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn" style="background:#111;color:#fff;border:none" onclick="submitSiteFeedback('${leadId}')"><i class="ti ti-send"></i> Feedback opslaan</button>
    </div>
  `);
}

async function submitSiteFeedback(leadId) {
  const feedback = document.getElementById('siteFeedbackText')?.value?.trim();
  if (!feedback) { toast('Voer feedback in'); return; }
  const res = await apiFetch(`/api/leads/${leadId}/site/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feedback }) });
  if (res.ok) { toast('Feedback opgeslagen!'); closeModal(); renderLeadDetail(leadId); }
  else { toast('Feedback opslaan mislukt'); }
}

function selectSiteTemplate(templateId, el) {
  window._selectedSiteTemplate = templateId;
  document.querySelectorAll('.site-template-card').forEach(c => c.classList.remove('selected'));
  if (el) { el.classList.add('selected'); el.dataset.template = templateId; }
}

function openRegenerateModal(leadId) {
  const SITE_TEMPLATES = [
    { id: 'modern',    label: 'Modern',    icon: '✨', desc: 'Clean, witruimte, gradient hero' },
    { id: 'bold',      label: 'Bold',      icon: '⚡', desc: 'Donkere hero, hoog contrast' },
    { id: 'minimal',   label: 'Minimaal',  icon: '◻',  desc: 'Wit, subtiel, elegant' },
    { id: 'corporate', label: 'Corporate', icon: '🏢', desc: 'Zakelijk, blauw, formeel' },
  ];
  openModal(`<div class="modal-header"><h3 class="modal-title">Website regenereren</h3></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">De huidige versie wordt opgeslagen in de versiegeschiedenis. Kies een template voor de nieuwe versie.</p>
      <div class="site-template-grid" id="regenTemplateGrid">
        ${SITE_TEMPLATES.map(t => `
          <div class="site-template-card ${t.id === 'modern' ? 'selected' : ''}" data-template="${t.id}" onclick="selectSiteTemplate('${t.id}',this)">
            <div class="site-template-icon">${t.icon}</div>
            <div class="site-template-label">${t.label}</div>
            <div class="site-template-desc">${t.desc}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="closeModal();generateSite('${leadId}')"><i class="ti ti-wand"></i> Genereren</button>
    </div>`);
}

async function openSeoPanel(leadId) {
  const data = await apiJSON(`/api/leads/${leadId}/site`);
  if (!data?.exists) { toast('Geen website gevonden', 'error'); return; }
  const seo = data.seo || {};
  openModal(`<div class="modal-header"><h3 class="modal-title"><i class="ti ti-search"></i> SEO meta tags</h3></div>
    <div class="modal-body">
      <p style="font-size:13px;color:var(--text-secondary);margin-bottom:14px">Deze tags worden direct in de HTML van de website geïnjecteerd en helpen Google de pagina beter te indexeren.</p>
      <div class="form-group"><label>Paginatitel (title tag)</label><input type="text" id="seoTitle" placeholder="${esc(data.content?.headline || '')}" value="${esc(seo.title || '')}"></div>
      <div class="form-group"><label>Meta description (max 160 tekens)</label><textarea id="seoDesc" style="height:80px;resize:vertical" placeholder="Korte beschrijving voor in Google zoekresultaten...">${esc(seo.description || '')}</textarea></div>
      <div class="form-group"><label>Keywords (komma-gescheiden)</label><input type="text" id="seoKeywords" placeholder="kapsalon amsterdam, haarkleur, highlights" value="${esc(seo.keywords || '')}"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveSeoMeta('${leadId}')"><i class="ti ti-device-floppy"></i> SEO opslaan</button>
    </div>`);
}

async function saveSeoMeta(leadId) {
  const title    = document.getElementById('seoTitle')?.value?.trim() || '';
  const description = document.getElementById('seoDesc')?.value?.trim() || '';
  const keywords = document.getElementById('seoKeywords')?.value?.trim() || '';
  const res = await api(`/api/leads/${leadId}/site/seo`, { method: 'POST', body: JSON.stringify({ title, description, keywords }) });
  if (res?.ok) { toast('SEO tags opgeslagen.', 'success'); closeModal(); renderLeadDetail(leadId); }
  else toast('SEO opslaan mislukt.', 'error');
}

async function revertSiteVersion(leadId, versionIdx) {
  if (!confirm(`Versie ${versionIdx + 1} terugzetten? De huidige versie wordt gearchiveerd.`)) return;
  const res = await api(`/api/leads/${leadId}/site/revert/${versionIdx}`, { method: 'POST' });
  if (res?.ok) { toast('Versie teruggezet.', 'success'); renderLeadDetail(leadId); }
  else toast('Terugzetten mislukt.', 'error');
}

async function downloadSiteHTML(leadId) {
  const res  = await apiFetch(`/api/leads/${leadId}/site`);
  const data = await res.json();
  if (!data.exists || !data.html) { toast('Geen website HTML beschikbaar'); return; }
  const blob = new Blob([data.html], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `website-${leadId}.html`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('HTML gedownload!');
}

// ─── Tasks system ─────────────────────────────────────────────────────────────

const TASK_STATUS = { todo: { label: 'Te doen', color: '#6b7280', bg: '#f3f4f6' }, bezig: { label: 'Bezig', color: '#d97706', bg: '#fefce8' }, klaar: { label: 'Klaar', color: '#16a34a', bg: '#f0fdf4' } };
const TASK_PRI    = { hoog: { color: '#dc2626', bg: '#fef2f2' }, middel: { color: '#d97706', bg: '#fefce8' }, laag: { color: '#16a34a', bg: '#f0fdf4' } };

function buildTasksHTML(lead, users, activeWeek = 1) {
  const tasks = (lead.tasks || []).filter(t => t.id); // only new-format tasks
  const weeks = [...new Set(tasks.map(t => t.week || 1))].sort((a,b) => a-b);
  if (!weeks.includes(activeWeek)) activeWeek = weeks[0] || 1;
  const weekTasks = tasks.filter(t => (t.week || 1) === activeWeek);
  const userMap = Object.fromEntries((users || []).map(u => [u.id, u.name]));
  const maxWeek = Math.max(...weeks, 12);
  const allWeeks = Array.from({ length: maxWeek }, (_, i) => i + 1);

  const done   = weekTasks.filter(t => t.status === 'klaar').length;
  const total  = weekTasks.length;
  const pct    = total ? Math.round((done / total) * 100) : 0;

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div class="detail-section-title" style="margin:0">Taken</div>
      <button class="btn btn-primary btn-sm" onclick="addLeadTask('${lead.id}')">
        <i class="ti ti-plus"></i> Taak
      </button>
    </div>

    <div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:12px">
      ${allWeeks.map(w => {
        const wTasks = tasks.filter(t => (t.week||1) === w);
        const wDone  = wTasks.filter(t => t.status === 'klaar').length;
        return `<button onclick="filterTasksWeek('${lead.id}',${w})" style="padding:3px 10px;border-radius:20px;border:1.5px solid ${w === activeWeek ? '#6366f1' : 'var(--border)'};background:${w === activeWeek ? '#eef2ff' : '#fff'};color:${w === activeWeek ? '#6366f1' : '#6b7280'};font-size:11px;font-weight:700;cursor:pointer">
          W${w}${wTasks.length ? `<span style="margin-left:3px;opacity:.7">${wDone}/${wTasks.length}</span>` : ''}
        </button>`;
      }).join('')}
    </div>

    ${total ? `
    <div style="background:#f3f4f6;border-radius:99px;height:4px;margin-bottom:10px">
      <div style="height:100%;border-radius:99px;background:linear-gradient(to right,#10b981,#6366f1);width:${pct}%;transition:width .4s"></div>
    </div>` : ''}

    <div style="display:flex;flex-direction:column;gap:6px" id="task-list-${lead.id}">
      ${weekTasks.length ? weekTasks.map(t => buildTaskCard(t, lead.id, userMap)).join('') : `
        <div style="text-align:center;padding:20px;font-size:13px;color:#9ca3af">
          <i class="ti ti-clipboard" style="font-size:20px;display:block;margin-bottom:6px"></i>
          Geen taken voor week ${activeWeek}
        </div>`}
    </div>`;
}

function buildTaskCard(t, leadId, userMap) {
  const st  = TASK_STATUS[t.status] || TASK_STATUS.todo;
  const pri = TASK_PRI[t.priority]  || TASK_PRI.middel;
  return `
    <div style="padding:10px 12px;border:1px solid var(--border);border-radius:8px;display:flex;gap:8px;align-items:flex-start;${t.status==='klaar'?'opacity:.6':''}">
      <button onclick="cycleTaskStatus('${leadId}','${t.id}')" title="Status wijzigen"
        style="width:20px;height:20px;border-radius:50%;border:2px solid ${st.color};background:${t.status==='klaar'?st.color:'#fff'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;margin-top:1px">
        ${t.status==='klaar' ? '<i class="ti ti-check" style="font-size:10px;color:#fff"></i>' : t.status==='bezig' ? '<i class="ti ti-player-play" style="font-size:9px;color:'+st.color+'"></i>' : ''}
      </button>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;${t.status==='klaar'?'text-decoration:line-through':''}">${esc(t.title||'')}</div>
        ${t.description ? `<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;line-height:1.4">${esc(t.description)}</div>` : ''}
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
          <span style="font-size:10px;font-weight:700;background:${st.bg};color:${st.color};border-radius:4px;padding:1px 5px">${st.label}</span>
          <span style="font-size:10px;font-weight:700;background:${pri.bg};color:${pri.color};border-radius:4px;padding:1px 5px">${t.priority||'middel'}</span>
          ${t.assigneeId && userMap[t.assigneeId] ? `<span style="font-size:10px;background:#f3f4f6;border-radius:4px;padding:1px 5px"><i class="ti ti-user" style="font-size:9px"></i> ${esc(userMap[t.assigneeId])}</span>` : ''}
        </div>
      </div>
      <button onclick="deleteTask('${leadId}','${t.id}')" style="background:none;border:none;cursor:pointer;color:#d1d5db;padding:2px;font-size:14px;opacity:0;transition:opacity .15s" class="task-del-btn">
        <i class="ti ti-trash"></i>
      </button>
    </div>`;
}

function filterTasksWeek(leadId, week) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  // Re-attach hover events
  container?.querySelectorAll('.task-del-btn')?.forEach(btn => {
    btn.closest('div[style*="border:1px solid"]')?.addEventListener('mouseenter', () => btn.style.opacity = '1');
    btn.closest('div[style*="border:1px solid"]')?.addEventListener('mouseleave', () => btn.style.opacity = '0');
  });
}

async function cycleTaskStatus(leadId, taskId) {
  const lead = state.leads.find(l => l.id === leadId);
  const task = lead?.tasks?.find(t => t.id === taskId);
  if (!task) return;
  const cycle = { todo: 'bezig', bezig: 'klaar', klaar: 'todo' };
  const newStatus = cycle[task.status || 'todo'];
  task.status = newStatus;
  await api(`/api/leads/${leadId}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) });
  // Rebuild current week view
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) {
    const activeBtn = container.querySelector('button[style*="#6366f1"]');
    const week = activeBtn ? parseInt(activeBtn.textContent) : 1;
    container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  }
}

function addLeadTask(leadId) {
  const users = state.users || [];
  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-clipboard-plus"></i> Nieuwe taak</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Titel <span style="color:#ef4444">*</span></label>
        <input type="text" id="newTaskTitle" placeholder="Taak omschrijving" autofocus>
      </div>
      <div class="form-group">
        <label>Beschrijving</label>
        <textarea id="newTaskDesc" rows="2" placeholder="Optionele details..."></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div class="form-group">
          <label>Week</label>
          <select id="newTaskWeek">
            ${Array.from({length:12},(_,i)=>`<option value="${i+1}" ${i===0?'selected':''}>Week ${i+1}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Prioriteit</label>
          <select id="newTaskPri">
            <option value="hoog">Hoog</option>
            <option value="middel" selected>Middel</option>
            <option value="laag">Laag</option>
          </select>
        </div>
      </div>
      ${users.length > 1 ? `
      <div class="form-group">
        <label>Toegewezen aan</label>
        <select id="newTaskAssignee">
          <option value="">— Niemand —</option>
          ${users.map(u => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}
        </select>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveLeadTask('${leadId}')"><i class="ti ti-plus"></i> Toevoegen</button>
    </div>
  `);
}

async function saveLeadTask(leadId) {
  const title      = document.getElementById('newTaskTitle')?.value?.trim();
  const desc       = document.getElementById('newTaskDesc')?.value?.trim();
  const week       = parseInt(document.getElementById('newTaskWeek')?.value || 1);
  const priority   = document.getElementById('newTaskPri')?.value || 'middel';
  const assigneeId = document.getElementById('newTaskAssignee')?.value || null;
  if (!title) return toast('Voer een taaktitel in', 'error');
  const res  = await api(`/api/leads/${leadId}/tasks`, { method: 'POST', body: JSON.stringify({ title, description: desc, week, priority, assigneeId }) });
  const task = await res.json();
  if (!res.ok) return toast(task.error || 'Taak opslaan mislukt', 'error');
  const lead = state.leads.find(l => l.id === leadId);
  if (lead) { if (!lead.tasks) lead.tasks = []; lead.tasks.push(task); }
  closeModal();
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], week);
  toast('Taak toegevoegd', 'success');
}

async function deleteTask(leadId, taskId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;
  const task = lead.tasks?.find(t => t.id === taskId);
  if (!confirm(`Taak "${task?.title || ''}" verwijderen?`)) return;
  const res = await api(`/api/leads/${leadId}/tasks/${taskId}`, { method: 'DELETE' });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  if (lead.tasks) lead.tasks = lead.tasks.filter(t => t.id !== taskId);
  const container = document.getElementById(`tasks-section-${leadId}`);
  if (container) container.innerHTML = buildTasksHTML(lead, state.users || [], 1);
  toast('Taak verwijderd', 'success');
}

async function toggleLeadTask(leadId, taskIndex, done) {
  // Legacy compatibility (old index-based tasks)
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead?.tasks?.[taskIndex]) return;
  lead.tasks[taskIndex].done = done;
  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ tasks: lead.tasks }) });
}

// ─── Referral linking ────────────────────────────────────────────────────────

function linkReferral(leadId) {
  const clients = state.leads.filter(l => l.status === 'client' && l.id !== leadId);
  if (!clients.length) return toast('Nog geen klanten om te koppelen', 'error');
  const lead = state.leads.find(l => l.id === leadId);

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-users-group"></i> Referrer koppelen</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:16px 24px;display:flex;flex-direction:column;gap:14px">
      <p style="font-size:13px;color:var(--text-secondary)">Selecteer welke klant deze lead heeft doorverwezen.</p>
      <div class="form-group">
        <label>Doorverwezen door</label>
        <select id="referrerSelect" style="width:100%">
          <option value="">— Geen referrer —</option>
          ${clients.map(c => `<option value="${c.id}" ${lead?.referredBy === c.id ? 'selected' : ''}>${esc(c.companyName)} (${esc(c.location || c.niche || '')})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" onclick="saveReferralLink('${leadId}')"><i class="ti ti-link"></i> Opslaan</button>
    </div>
  `);
}

async function saveReferralLink(leadId) {
  const referrerId = document.getElementById('referrerSelect')?.value || null;
  const res = await api(`/api/leads/${leadId}/set-referrer`, { method: 'POST', body: JSON.stringify({ referrerId: referrerId || null }) });
  if (!res.ok) return toast('Opslaan mislukt', 'error');
  const data = await res.json();
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].referredBy = data.referredBy || null;
  closeModal();
  toast(referrerId ? 'Referrer gekoppeld' : 'Referrer-koppeling verwijderd', 'success');
  openLeadDetail(leadId);
}

async function unlinkReferral(leadId) {
  if (!confirm('Referral-koppeling verwijderen?')) return;
  const res = await api(`/api/leads/${leadId}/set-referrer`, { method: 'POST', body: JSON.stringify({ referrerId: null }) });
  if (!res.ok) return toast('Verwijderen mislukt', 'error');
  const idx = state.leads.findIndex(l => l.id === leadId);
  if (idx !== -1) state.leads[idx].referredBy = null;
  toast('Referral-koppeling verwijderd', 'success');
  openLeadDetail(leadId);
}

// ─── Stripe invoice ───────────────────────────────────────────────────────────

async function generateCaseStudy(leadId, btn) {
  const orig = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Genereren...';
  try {
    const cs = await apiFetch(`/api/leads/${leadId}/case-study`, { method: 'POST' });
    const lead = state.leads.find(l => l.id === leadId);
    if (lead) lead.caseStudy = cs;
    showToast('Case study gegenereerd!', 'success');
    await loadLeads();
    renderPipeline();
  } catch (e) {
    showToast('Fout: ' + e.message, 'error');
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function toggleCaseStudyPublish(leadId, published) {
  try {
    await apiFetch(`/api/leads/${leadId}/case-study`, { method: 'PATCH', body: JSON.stringify({ published }) });
    const lead = state.leads.find(l => l.id === leadId);
    if (lead && lead.caseStudy) lead.caseStudy.published = published;
    showToast(published ? 'Gepubliceerd op /agency' : 'Verwijderd van website', 'success');
  } catch (e) {
    showToast('Fout: ' + e.message, 'error');
  }
}

function copyCaseStudy(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead || !lead.caseStudy) return;
  const cs = lead.caseStudy;
  const text = [
    cs.title,
    '',
    'Uitdaging',
    cs.challenge,
    '',
    'Oplossing',
    cs.solution || '',
    '',
    'Resultaten',
    ...(cs.results || []).map(r => '- ' + r),
    cs.quote ? `\n"${cs.quote}" — ${cs.quoteName || ''}` : ''
  ].join('\n').trim();
  copyText(text, 'Case study gekopieerd!');
}

function createInvoice(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  const s = state.settings || {};
  const preferred = 'bank_transfer';
  const defaultDesc = lead.services?.map(sv => sv.name).join(', ') || 'AI-marketingdiensten';
  const defaultBilling = lead.services?.[0]?.billing || 'maandelijks';

  const methodOpts = [
    { value: 'bank_transfer', label: 'Bankoverschrijving', icon: 'ti-building-bank', enabled: true },
  ];

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-credit-card"></i> Betaallink — ${esc(lead.companyName)}</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <div class="form-group">
        <label>Betaalmethode</label>
        <div style="display:flex;gap:8px">
          ${methodOpts.map(m => `
            <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center;transition:all .15s" id="payMethodLabel_${m.value}">
              <input type="radio" name="invoiceMethod" value="${m.value}" ${m.value === preferred ? 'checked' : ''} style="display:none" onchange="updateInvoiceMethodUI()">
              <i class="ti ${m.icon}"></i> ${m.label}
            </label>
          `).join('')}
        </div>
      </div>
      <div class="form-group">
        <label>Facturatie type</label>
        <div style="display:flex;gap:8px">
          <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center" id="billingLabelMaandelijks">
            <input type="radio" name="invoiceBilling" value="maandelijks" ${defaultBilling !== 'eenmalig' ? 'checked' : ''} style="display:none" onchange="updateInvoiceBillingUI()">
            <i class="ti ti-refresh"></i> Maandelijks
          </label>
          <label style="display:flex;align-items:center;gap:6px;padding:8px 14px;border:1.5px solid var(--border);border-radius:var(--radius);cursor:pointer;font-size:13px;font-weight:600;flex:1;justify-content:center" id="billingLabelEenmalig">
            <input type="radio" name="invoiceBilling" value="eenmalig" ${defaultBilling === 'eenmalig' ? 'checked' : ''} style="display:none" onchange="updateInvoiceBillingUI()">
            <i class="ti ti-coin"></i> Eenmalig
          </label>
        </div>
      </div>
      <div class="form-group">
        <label>Dienst omschrijving</label>
        <input type="text" id="invoiceDesc" value="${esc(defaultDesc)}">
      </div>
      <div class="form-group">
        <label>Bedrag ${s.btwEnabled ? 'excl. BTW ' : ''}(€)</label>
        <input type="number" id="invoiceAmount" value="${lead.estimatedValue || 800}" min="1" oninput="updateBtwBreakdown('invoice')">
      </div>
      ${s.btwEnabled ? (() => { const base = lead.estimatedValue || 800; const rate = s.btwRate !== undefined ? s.btwRate : 21; const btw = base * rate / 100; return `<div class="btw-breakdown" id="btwBreakdownInvoice">
        <div class="btw-row"><span>Excl. BTW</span><span id="btwExclInvoice">€ ${base.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row"><span>BTW ${rate}%</span><span id="btwAmtInvoice">€ ${btw.toFixed(2).replace('.',',')}</span></div>
        <div class="btw-row btw-total"><span>Incl. BTW</span><span id="btwInclInvoice">€ ${(base+btw).toFixed(2).replace('.',',')}</span></div>
      </div>`; })() : ''}
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Annuleren</button>
      <button class="btn btn-primary" id="createInvoiceBtn" onclick="submitInvoice('${leadId}')">
        <i class="ti ti-link"></i> Maak betaallink
      </button>
    </div>
  `);
  updateInvoiceMethodUI();
  updateInvoiceBillingUI();
}

function updateInvoiceMethodUI() {
  document.querySelectorAll('input[name="invoiceMethod"]').forEach(el => {
    const lbl = document.getElementById('payMethodLabel_' + el.value);
    if (lbl) {
      lbl.style.borderColor = el.checked ? 'var(--accent)' : 'var(--border)';
      lbl.style.background  = el.checked ? '#eef2ff' : '';
      lbl.style.color       = el.checked ? 'var(--accent)' : '';
    }
  });
}

function updateInvoiceBillingUI() {
  const maand = document.querySelector('input[name="invoiceBilling"][value="maandelijks"]');
  const een   = document.querySelector('input[name="invoiceBilling"][value="eenmalig"]');
  const lblM  = document.getElementById('billingLabelMaandelijks');
  const lblE  = document.getElementById('billingLabelEenmalig');
  if (maand && lblM) {
    lblM.style.borderColor = maand.checked ? 'var(--accent)' : 'var(--border)';
    lblM.style.background  = maand.checked ? '#eef2ff' : '';
    lblM.style.color       = maand.checked ? 'var(--accent)' : '';
  }
  if (een && lblE) {
    lblE.style.borderColor = een.checked ? 'var(--accent)' : 'var(--border)';
    lblE.style.background  = een.checked ? '#eef2ff' : '';
    lblE.style.color       = een.checked ? 'var(--accent)' : '';
  }
}

function updateBtwBreakdown(prefix) {
  const s = state.settings || {};
  if (!s.btwEnabled) return;
  const amountEl = document.getElementById(prefix === 'pay' ? 'payAmount' : 'invoiceAmount');
  const base = parseFloat(amountEl?.value || 0);
  const rate = s.btwRate !== undefined ? s.btwRate : 21;
  const btw  = Math.round(base * rate) / 100;
  const incl = Math.round((base + btw) * 100) / 100;
  const fmt  = v => '€ ' + v.toFixed(2).replace('.', ',');
  const sfx  = prefix === 'pay' ? 'Pay' : 'Invoice';
  const exEl = document.getElementById('btwExcl' + sfx);
  const bEl  = document.getElementById('btwAmt'  + sfx);
  const iEl  = document.getElementById('btwIncl' + sfx);
  if (exEl) exEl.textContent = fmt(base);
  if (bEl)  bEl.textContent  = fmt(btw);
  if (iEl)  iEl.textContent  = fmt(incl);
}

async function submitInvoice(leadId) {
  const lead    = state.leads.find(l => l.id === leadId);
  const desc    = document.getElementById('invoiceDesc')?.value || '';
  const amount  = parseInt(document.getElementById('invoiceAmount')?.value || 0);
  const method  = document.querySelector('input[name="invoiceMethod"]:checked')?.value || 'bank_transfer';
  const billing = document.querySelector('input[name="invoiceBilling"]:checked')?.value || 'maandelijks';
  const btn     = document.getElementById('createInvoiceBtn');

  if (!amount || amount < 1) return toast('Voer een geldig bedrag in', 'error');

  const s2 = state.settings || {};
  const btwEnabled2 = s2.btwEnabled || false;
  const btwRate2    = s2.btwRate !== undefined ? s2.btwRate : 21;
  const btwAmt2     = btwEnabled2 ? Math.round(amount * btwRate2) / 100 : 0;
  const amountIncl  = btwEnabled2 ? Math.round((amount + btwAmt2) * 100) / 100 : amount;
  const descWithBtw = btwEnabled2 ? `${desc} (incl. ${btwRate2}% BTW)` : desc;

  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...';

  const endpointMap = { stripe: '/api/stripe/invoice', mollie: '/api/mollie/invoice', paypal: '/api/paypal/invoice' };
  const endpoint = method === 'bank_transfer' ? `/api/leads/${leadId}/payments` : (endpointMap[method] || '/api/stripe/invoice');

  const resetBtn = () => {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-link"></i> Maak betaallink'; }
  };

  let data;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const bodyPayload = method === 'bank_transfer'
      ? { method: 'bank_transfer', amount: amountIncl, description: descWithBtw, billing, type: billing === 'maandelijks' ? 'subscription' : 'eenmalig', dueDate: new Date(Date.now() + ((state.settings?.paymentTermDays || 14) * 86400000)).toISOString() }
      : { companyName: lead?.companyName, description: descWithBtw, amount: amountIncl, billing };
    const res = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify(bodyPayload),
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!res) { resetBtn(); return; } // logged out by api()

    data = await res.json();

    if (!res.ok) {
      resetBtn();
      // Show fallback manual modal when payment provider not configured
      const errMsg = data?.error || 'Betaallink aanmaken mislukt';
      openModal(`
        <div class="modal-header">
          <h3><i class="ti ti-alert-triangle" style="color:var(--warning)"></i> Betaallink mislukt</h3>
          <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
        </div>
        <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
          <p class="text-secondary">${esc(errMsg)}</p>
          <div class="invoice-fallback-box">
            <div class="invoice-fallback-label">Stuur handmatig een betalingsverzoek:</div>
            <div id="fallbackInvoiceText" style="font-size:13px;white-space:pre-wrap;color:var(--text-primary)">${esc(`Betalingsverzoek voor ${lead?.companyName || ''}\n\nBedrag: €${amountIncl}\nOmschrijving: ${descWithBtw}\nBetalingstermijn: 14 dagen\n\nOmschrijving bij overboeking: ${(lead?.companyName || '').slice(0,20)}-factuur`)}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="copyText(document.getElementById('fallbackInvoiceText').innerText); toast('Gekopieerd!','success')"><i class="ti ti-copy"></i> Kopiëren</button>
          <button class="btn btn-ghost" onclick="setView('settings')">Instellingen</button>
          <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
        </div>
      `);
      return;
    }
  } catch (err) {
    resetBtn();
    const isTimeout = err.name === 'AbortError';
    toast(isTimeout ? 'Tijdlimiet overschreden — probeer opnieuw' : 'Verbindingsfout — controleer je internetverbinding', 'error');
    return;
  }

  if (method === 'bank_transfer') {
    const s2 = state.settings || {};
    const termDays2 = s2.paymentTermDays || 14;
    openModal(`
      <div class="modal-header">
        <h3><i class="ti ti-check" style="color:var(--success)"></i> Factuur aangemaakt!</h3>
        <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
      </div>
      <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
        <p class="text-secondary">Factuur aangemaakt voor <strong>${esc(lead?.companyName)}</strong>. Een betalingsverzoek is automatisch verzonden naar de klant.</p>
        ${s2.bankTransferIban ? `<div style="background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:14px;font-size:13px;line-height:1.8">
          <strong style="display:block;margin-bottom:6px;color:var(--text-primary)">Overboekingsgegevens</strong>
          <div>IBAN: <code style="color:var(--accent)">${esc(s2.bankTransferIban)}</code></div>
          ${s2.bankTransferName ? `<div>Tenaamstelling: ${esc(s2.bankTransferName)}</div>` : ''}
          ${s2.bankTransferBic ? `<div>BIC: ${esc(s2.bankTransferBic)}</div>` : ''}
          <div>Betalingstermijn: ${termDays2} dagen</div>
        </div>` : ''}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
      </div>
    `);
    return;
  }

  // Save URL to lead for reference (Stripe/Mollie/PayPal)
  await api(`/api/leads/${leadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ stripeUrl: data.url })
  });
  if (lead) lead.stripeUrl = data.url;

  openModal(`
    <div class="modal-header">
      <h3><i class="ti ti-check" style="color:var(--success)"></i> Betaallink aangemaakt!</h3>
      <button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div style="padding:20px 24px;display:flex;flex-direction:column;gap:14px">
      <p class="text-secondary">Stuur deze link naar <strong>${esc(lead?.companyName)}</strong>:</p>
      <div class="stripe-link-box">
        <a href="${data.url}" target="_blank" class="link" style="word-break:break-all">${data.url}</a>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="copyText('${data.url.replace(/'/g, "\\'")}'); toast('Link gekopieerd!', 'success')">
        <i class="ti ti-copy"></i> Kopiëren
      </button>
      <button class="btn btn-primary" onclick="closeModal()">Sluiten</button>
    </div>
  `);
}


// ─── Subscription requests admin UI (Task 10) ─────────────────────────────────
async function renderSubscriptionRequests(leadId) {
  const leads = state.leads || [];
  const lead = leads.find(l => l.id === leadId);
  const requests = (lead?.subscriptionRequests || []).filter(r => r.status === 'pending');
  if (!requests.length) return '';

  const TYPE_LABELS = { add_service: '+ Dienst toevoegen', pause: '⏸ Pauzeren', cancel: '✕ Opzeggen' };
  return `
    <div class="card" style="border-left:3px solid #f59e0b;margin-bottom:16px;">
      <div class="card-header"><h3 class="card-title" style="color:#d97706;">📋 Abonnement verzoeken (${requests.length})</h3></div>
      ${requests.map(r => `
        <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px;">
          <div style="flex:1;">
            <div style="font-weight:600;font-size:13px;">${esc(TYPE_LABELS[r.type] || r.type)}</div>
            ${r.serviceName ? `<div style="font-size:12px;color:var(--text-secondary);">Dienst: ${esc(r.serviceName)}</div>` : ''}
            <div style="font-size:11px;color:var(--text-secondary);">${formatDate(r.createdAt)}</div>
          </div>
          <button onclick="resolveSubRequest('${leadId}','${r.id}','approved')" class="btn btn-primary btn-sm">Goedkeuren</button>
          <button onclick="resolveSubRequest('${leadId}','${r.id}','rejected')" class="btn btn-ghost btn-sm" style="color:#ef4444;border-color:#ef4444;">Afwijzen</button>
        </div>`).join('')}
    </div>`;
}

async function resolveSubRequest(leadId, reqId, status) {
  await api(`/api/subscriptions/${leadId}/requests/${reqId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  const lead = (state.leads || []).find(l => l.id === leadId);
  if (lead) {
    const r = (lead.subscriptionRequests || []).find(r => r.id === reqId);
    if (r) { r.status = status; r.resolvedAt = new Date().toISOString(); }
  }
  toast(status === 'approved' ? 'Verzoek goedgekeurd' : 'Verzoek afgewezen');
  renderProjectPage();
}

// ─── Service orders admin UI (Task 14) ────────────────────────────────────────
async function loadPendingServiceOrders() {
  const orders = await apiJSON('/api/service-orders') || [];
  return orders.filter(o => o.status === 'pending');
}

async function resolveServiceOrder(id, status) {
  await api(`/api/service-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  toast(status === 'approved' ? 'Dienst toegevoegd aan klant' : 'Aanvraag afgewezen');
  renderProjectPage();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 20 — Project timeline view
// ═══════════════════════════════════════════════════════════════════════════════
function buildProjectTimeline(lead) {
  if (!lead) return '';
  const events = [];
  const add = (at, icon, title, body='') => { if (at) events.push({ at, icon, title, body }); };
  add(lead.createdAt, '🔍', 'Lead gevonden', lead.niche || '');
  add(lead.sentAt, '📧', 'Email verstuurd', lead.emailA?.subject || '');
  add(lead.openedAt, '👁', 'Email geopend', '');
  add(lead.repliedAt, '💬', 'Reply ontvangen', (lead.lastReplyText||'').slice(0,80));
  add(lead.projectStartedAt, '🚀', 'Project gestart', '');
  add(lead.intakeSubmittedAt, '📋', 'Intake ingevuld', '');
  (lead.agentDeliverables||[]).filter(d=>d.builtAt).forEach(d => add(d.builtAt, '🏗️', `Build: ${d.service||''}`, ''));
  (lead.payments||[]).filter(p=>p.paidAt).forEach(p => add(p.paidAt, '💰', `Betaling: €${p.amount||0}`, p.description||''));
  events.sort((a,b) => new Date(a.at) - new Date(b.at));

  if (!events.length) return `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Geen events</div></div>`;
  return `<div class="timeline">${events.map(e => `
    <div class="timeline-item">
      <div class="timeline-dot">${e.icon}</div>
      <div class="timeline-content">
        <div class="timeline-title">${esc(e.title)}</div>
        <div class="timeline-time">${formatDateTime(e.at)}</div>
        ${e.body ? `<div class="timeline-body">${esc(e.body)}</div>` : ''}
      </div>
    </div>`).join('')}</div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 24 — Deliverable progress percentage (set by admin)
// ═══════════════════════════════════════════════════════════════════════════════
async function setDeliverableProgress(leadId, dIdx, pct) {
  const lead = (state.leads||[]).find(l => l.id === leadId);
  if (!lead || !lead.agentDeliverables?.[dIdx]) return;
  lead.agentDeliverables[dIdx].progress = parseInt(pct) || 0;
  await api(`/api/leads/${leadId}`, { method: 'PATCH', body: JSON.stringify({ agentDeliverables: lead.agentDeliverables }) });
  toast(`Voortgang ingesteld: ${pct}%`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 25 — Deliverable comments by client
// ═══════════════════════════════════════════════════════════════════════════════
async function loadDeliverableComments(leadId, dIdx) {
  const lead = (state.leads||[]).find(l => l.id === leadId);
  if (!lead) return;
  const comments = lead.agentDeliverables?.[dIdx]?.comments || [];
  return comments;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Task 30 — Export project as PDF
// ═══════════════════════════════════════════════════════════════════════════════
async function exportProjectPDF(leadId) {
  const btn = document.querySelector(`[onclick*="exportProjectPDF('${leadId}')"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Exporteren…'; }
  const res = await api(`/api/leads/${leadId}/export-pdf`, { method: 'POST' });
  if (btn) { btn.disabled = false; btn.textContent = '📄 Exporteer PDF'; }
  if (!res?.ok) { toast('PDF export mislukt', 'error'); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `project-${leadId}.pdf`; a.click();
  URL.revokeObjectURL(url);
  toast('PDF gedownload');
}
