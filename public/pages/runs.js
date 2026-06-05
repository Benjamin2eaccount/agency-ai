// ─── Runs tab ─────────────────────────────────────────────────────────────────

async function renderRuns() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Automatisering</div>
        <h1 class="page-title">Runs</h1>
      </div>
      <button class="btn btn-primary" id="runNowBtn2">
        <i class="ti ti-player-play"></i> Run nu
      </button>
    </div>
    <div id="runsContent"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  document.getElementById('runNowBtn2')?.addEventListener('click', () => {
    if (typeof triggerFindLeads === 'function') triggerFindLeads();
  });

  const [runs, settings] = await Promise.all([
    apiJSON('/api/runs') || [],
    apiJSON('/api/settings') || {}
  ]);
  const safeRuns = Array.isArray(runs) ? runs : [];

  const totalRuns  = safeRuns.length;
  const totalLeads = safeRuns.reduce((s, r) => s + (r.leadsFound   || 0), 0);
  const totalAuto  = safeRuns.reduce((s, r) => s + (r.autoApproved || 0), 0);
  const totalValue = safeRuns.reduce((s, r) => s + (r.totalValue   || 0), 0);

  // Calculate next scheduled run
  const runTime    = (settings || {}).dailyRunTime || '09:00';
  const [rh, rm]   = runTime.split(':').map(Number);
  const now        = new Date();
  const next       = new Date(now);
  next.setHours(rh, rm, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const nextLabel  = next.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' }) + ' om ' + runTime;

  document.getElementById('runsContent').innerHTML = `
    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-rotate-clockwise"></i></div>
        <div class="stat-value">${totalRuns}</div>
        <div class="stat-label">Runs totaal</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div class="stat-value">${totalLeads}</div>
        <div class="stat-label">Leads gevonden</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-check"></i></div>
        <div class="stat-value">${totalAuto}</div>
        <div class="stat-label">Auto-goedgekeurd</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-currency-euro"></i></div>
        <div class="stat-value">€${totalValue.toLocaleString('nl-NL')}</div>
        <div class="stat-label">Totale waarde</div>
      </div>
    </div>

    <!-- Persoonlijke run-sjablonen -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-bookmark"></i> Run-sjablonen</h3>
        <button class="btn btn-ghost btn-sm" onclick="showNewTemplateForm()">
          <i class="ti ti-plus"></i> Nieuw
        </button>
      </div>
      <div id="templateFormWrap" class="template-form-wrap" style="display:none">
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label>Naam</label>
            <input type="text" id="tmplName" placeholder="Bijv. Restaurants NL">
          </div>
          <div class="form-group" style="margin:0">
            <label>Niches <span class="text-muted" style="font-size:11px">(komma-gescheiden)</span></label>
            <input type="text" id="tmplNiches" placeholder="restaurant, fitness, beauty">
          </div>
          <div class="form-group" style="margin:0">
            <label>Aantal leads</label>
            <input type="number" id="tmplCount" value="10" min="1" max="30">
          </div>
          <div class="form-group" style="margin:0">
            <label>Locatie <span class="text-muted" style="font-size:11px">(optioneel)</span></label>
            <input type="text" id="tmplLocation" placeholder="Amsterdam, Rotterdam...">
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary btn-sm" onclick="saveTemplate()"><i class="ti ti-device-floppy"></i> Opslaan</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('templateFormWrap').style.display='none'">Annuleren</button>
        </div>
      </div>
      <div id="templateList"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>

    <!-- Live run progress (hidden when idle) -->
    <div id="liveRunCard" style="display:none;margin-bottom:16px"></div>

    <!-- Section 1: Run Configuratie -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Run configuratie</h3>
      </div>
      ${!isAdmin() ? `<div class="employee-notice"><i class="ti ti-lock"></i> Alleen admins kunnen runs starten</div>` : `
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label class="settings-label">Aantal leads</label>
          <input type="number" id="runCount" value="${(settings || {}).leadsPerDay || 15}" min="1" max="50"
            style="width:80px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Niches (komma-gescheiden, leeg = alles)</label>
          <input type="text" id="runNiches" placeholder="beauty, food, fitness"
            style="width:260px;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <button class="btn btn-primary" id="startRunBtn" onclick="startCustomRun()">
          <i class="ti ti-player-play"></i> Start run
        </button>
      </div>`}
      ${isAdmin() ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border);display:flex;gap:20px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="igTargetingToggle" ${(settings || {}).instagramTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('instagramTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent)">
          <i class="ti ti-brand-instagram" style="color:#e1306c;font-size:15px"></i>
          Instagram targeting
          <span style="font-size:11px;color:var(--text-muted);font-weight:400">— accounts 2K-200K volgers, laag engagement</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="mapsTargetingToggle" ${(settings || {}).googleMapsTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('googleMapsTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent)">
          <i class="ti ti-map-pin" style="color:#4285f4;font-size:15px"></i>
          Google Maps targeting
          <span style="font-size:11px;color:var(--text-muted);font-weight:400">— 3-4 ster reviews, minder dan 50 reviews</span>
        </label>
      </div>` : ''}
      <div style="margin-top:14px">
        <p id="run-status" style="display:none;font-size:13px;color:var(--text-muted);margin:0 0 6px"></p>
        <div id="run-progress-bar" style="display:none"></div>
        <p id="run-timer" style="display:none;font-size:12px;color:var(--text-muted);margin:6px 0 0"></p>
      </div>
    </div>

    <!-- Section 2: Eigen bedrijf toevoegen -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Eigen bedrijf toevoegen</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Voeg een specifiek bedrijf toe om direct te analyseren en aan je inbox toe te voegen.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label class="settings-label">Bedrijfsnaam *</label>
          <input type="text" id="custCompany" placeholder="Bijv. Salon Rosa" oninput="checkDuplicateLive()" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div id="dupWarning" style="display:none;align-items:center;gap:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px"></div>
        <div>
          <label class="settings-label">Website URL</label>
          <input type="text" id="custWebsite" placeholder="https://..." oninput="checkDuplicateLive()" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Email <span style="font-weight:400;color:var(--text-muted)">(optioneel — anders zoekt Agent 1)</span></label>
          <input type="email" id="custEmail" placeholder="info@bedrijf.nl" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Instagram handle</label>
          <input type="text" id="custInstagram" placeholder="@handle" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Niche</label>
          <select id="custNiche" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
            <option value="beauty">Beauty</option>
            <option value="food">Food</option>
            <option value="fitness">Fitness</option>
            <option value="retail">Retail</option>
            <option value="restaurant">Restaurant</option>
          </select>
        </div>
        <div>
          <label class="settings-label">Locatie</label>
          <input type="text" id="custLocation" placeholder="Amsterdam, NL" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
        <div>
          <label class="settings-label">Land</label>
          <input type="text" id="custCountry" placeholder="NL" value="NL" style="width:100%;padding:8px 10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:14px;font-family:inherit">
        </div>
      </div>
      <button class="btn btn-secondary" id="analyzeBtn" style="margin-top:14px" onclick="analyzeCustomCompany()">
        <i class="ti ti-wand"></i> Voeg toe en analyseer
      </button>
      <div id="analyzeProgress" style="display:none;margin-top:14px"></div>
    </div>

    <!-- Section 3: Geplande runs -->
    <div class="card" style="margin-bottom:14px">
      <div class="card-header">
        <h3 class="card-title">Geplande runs</h3>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:14px">
        <i class="ti ti-calendar-event" style="color:var(--text-muted)"></i>
        <span>Volgende automatische run: <strong>${nextLabel}</strong></span>
      </div>
      <p class="text-secondary" style="font-size:12px;margin-top:8px">Aanpassen via Instellingen → Automatisering.</p>
    </div>

    <!-- Section 4: Run geschiedenis -->
    ${safeRuns.length === 0 ? `
      <div class="empty-card">
        <i class="ti ti-history-off"></i>
        <h3>Nog geen runs</h3>
        <p>Start een run om leads te vinden</p>
      </div>
    ` : `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Run geschiedenis</h3>
        </div>
        <div class="table-wrap">
          <table class="leads-table">
            <thead>
              <tr>
                <th>Datum</th>
                <th>Tijd</th>
                <th>Leads</th>
                <th>Auto-goedgekeurd</th>
                <th>Pipeline waarde</th>
              </tr>
            </thead>
            <tbody>
              ${safeRuns.map(r => `
                <tr>
                  <td>${formatDate(r.createdAt)}</td>
                  <td class="text-secondary mono">${new Date(r.createdAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</td>
                  <td><strong>${r.leadsFound || 0}</strong></td>
                  <td>${r.autoApproved || 0}</td>
                  <td class="text-secondary">€${(r.totalValue || 0).toLocaleString('nl-NL')}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `}

    <!-- Kosten & activiteiten -->
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title">Activiteiten &amp; API kosten</h3>
        <span id="costsHeader" class="text-muted" style="font-size:12px">Laden...</span>
      </div>
      <div id="costsCards" class="stats-grid" style="margin-bottom:20px"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;font-weight:600;color:var(--text-primary)">Log</span>
        <select id="activityFilter" class="form-select" style="width:160px;font-size:12px" onchange="loadActivityLog()">
          <option value="">Alle activiteiten</option>
          <option value="run">Runs</option>
          <option value="email">Emails verstuurd</option>
          <option value="reply">Replies ontvangen</option>
          <option value="backup">Backups</option>
        </select>
      </div>
      <div id="activityLog"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>

    <!-- Systeemstatus & foutmeldingen -->
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-heartbeat" style="color:var(--danger)"></i> Systeemstatus</h3>
        <div style="display:flex;gap:8px">
          <a class="btn btn-ghost btn-sm" href="/status" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Statuspagina</a>
          <button class="btn btn-ghost btn-sm" id="dashCheckRepliesBtn" onclick="triggerReplyCheck()" title="Controleer Gmail inbox nu op nieuwe replies"><i class="ti ti-mail-forward"></i> Controleer replies nu</button>
          <button class="btn btn-ghost btn-sm" onclick="loadSystemHealth()"><i class="ti ti-refresh"></i> Vernieuwen</button>
        </div>
      </div>
      <div id="healthPanel"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>
  `;

  // Load costs + activity after render
  loadCostStats();
  loadActivityLog();
  loadTemplates();
  loadSystemHealth();
  startRunProgressPoll();
}

let _runProgressPollTimer = null;
function startRunProgressPoll() {
  stopRunProgressPoll();
  pollRunProgress();
}
function stopRunProgressPoll() {
  if (_runProgressPollTimer) { clearTimeout(_runProgressPollTimer); _runProgressPollTimer = null; }
}
function updateSidebarRunning(p) {
  const wrap = document.getElementById('sidebarRunning');
  const text = document.getElementById('sidebarRunningText');
  const bar  = document.getElementById('sidebarRunningBar');
  if (!wrap) return;
  if (p && p.running) {
    wrap.style.display = '';
    if (text) text.textContent = p.currentAgent || 'Outreach run';
    if (bar)  bar.style.width = (p.target > 0 ? Math.round((p.found / p.target) * 100) : 0) + '%';
  } else {
    wrap.style.display = 'none';
    if (bar) bar.style.width = '0%';
  }
}

async function pollRunProgress() {
  const card = document.getElementById('liveRunCard');
  if (!card) return;
  try {
    const p = await apiJSON('/api/run/progress');
    updateSidebarRunning(p);
    if (p && p.running) {
      const pct = p.target > 0 ? Math.round((p.found / p.target) * 100) : 0;
      const elapsed = p.startedAt ? Math.round((Date.now() - new Date(p.startedAt).getTime()) / 1000) : 0;
      const elapsedLabel = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed/60)}m ${elapsed%60}s`;
      card.style.display = 'block';
      card.innerHTML = `
        <div class="card" style="border:2px solid var(--accent);background:var(--accent-light)">
          <div class="card-header" style="border-bottom:1px solid var(--accent);padding-bottom:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="running-dot"></span>
              <h3 class="card-title" style="color:var(--accent)">Run actief</h3>
              <span style="font-size:12px;color:var(--text-muted)">${elapsedLabel} bezig</span>
            </div>
            <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${p.found}/${p.target} leads</span>
          </div>
          <div style="padding:14px 20px">
            <div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:4px">
                <span>${p.currentAgent || 'Bezig...'}</span>
                <span>${pct}%</span>
              </div>
              <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:3px;transition:width .4s"></div>
              </div>
            </div>
            ${p.currentLead ? `<div style="font-size:12px;color:var(--text-muted)">Huidig bedrijf: <strong style="color:var(--text-primary)">${p.currentLead}</strong></div>` : ''}
            ${p.skipped > 0 ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">${p.skipped} overgeslagen (geen email / blacklist)</div>` : ''}
            ${p.log && p.log.length ? `
              <div style="margin-top:10px;border-top:1px solid var(--border);padding-top:10px">
                <div style="font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Log</div>
                ${p.log.slice(0,5).map(l => `
                  <div style="font-size:12px;color:var(--text-secondary);line-height:1.6">${l.msg}</div>
                `).join('')}
              </div>` : ''}
          </div>
        </div>`;
      _runProgressPollTimer = setTimeout(pollRunProgress, 3000);
    } else {
      card.style.display = 'none';
      updateSidebarRunning(null);
      if (p && p.finishedAt && !p.running) {
        const justFinished = (Date.now() - new Date(p.finishedAt).getTime()) < 10000;
        if (justFinished) loadSystemHealth();
      }
    }
  } catch {
    card.style.display = 'none';
    updateSidebarRunning(null);
  }
}

async function loadSystemHealth() {
  const panel = document.getElementById('healthPanel');
  if (!panel) return;

  const [health, errors, rateStatus] = await Promise.all([
    fetch('/health').then(r => r.json()).catch(() => null),
    apiJSON('/api/errors').catch(() => []),
    apiJSON('/api/ai/rate-status').catch(() => null)
  ]);

  if (!health) {
    panel.innerHTML = `<div class="error-state"><i class="ti ti-alert-circle"></i> Kon status niet laden</div>`;
    return;
  }

  const aiThrottled = rateStatus && (
    rateStatus.callsLastMinute >= rateStatus.limits.maxCallsPerMinute * 0.9 ||
    rateStatus.callsLastDay    >= rateStatus.limits.maxCallsPerDay    * 0.9 ||
    rateStatus.costLastDay     >= rateStatus.limits.maxDailyCostUsd   * 0.9
  );
  const checks = [
    { key: 'claude_api', label: 'Claude API',   icon: 'ti-brain',         ok: health.checks?.claude_api },
    { key: 'gmail',      label: 'Gmail SMTP',   icon: 'ti-mail',          ok: health.checks?.gmail },
    { key: 'postgres',   label: 'PostgreSQL',   icon: 'ti-database',      ok: health.checks?.postgres, optional: true },
    ...(rateStatus ? [{ key: 'ai_rate', label: `AI calls vandaag: ${rateStatus.callsLastDay}/${rateStatus.limits.maxCallsPerDay}`, icon: 'ti-gauge', ok: !aiThrottled, optional: true }] : []),
  ];

  const statusColor = health.status === 'ok' ? 'var(--success)' : 'var(--warning)';
  const statusLabel = health.status === 'ok' ? 'Alles operationeel' : 'Aandacht vereist';

  const errorRows = (errors || []).slice(0, 10);
  const typeIcon  = { run: 'ti-player-play', agent1: 'ti-search', cron_run: 'ti-clock', followup1: 'ti-mail-forward', followup2: 'ti-mail-forward', cron_followup: 'ti-clock' };

  panel.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
      <div style="width:10px;height:10px;border-radius:50%;background:${statusColor};flex-shrink:0"></div>
      <span style="font-size:13px;font-weight:600;color:var(--text-primary)">${statusLabel}</span>
      <span class="text-muted" style="font-size:12px">• Uptime: ${health.uptimeLabel || '—'}</span>
      ${health.lastRun ? `<span class="text-muted" style="font-size:12px">• Laatste run: ${formatDate(health.lastRun.time)} (${health.lastRun.leadsFound} leads)</span>` : ''}
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      ${checks.map(c => `
        <div class="health-check-pill ${c.ok ? 'health-ok' : c.optional ? 'health-warn' : 'health-err'}">
          <i class="ti ${c.icon}"></i>
          <span>${c.label}</span>
          <i class="ti ${c.ok ? 'ti-check' : 'ti-x'}" style="font-size:11px"></i>
        </div>`).join('')}
    </div>
    ${errorRows.length ? `
      <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">
        Recente fouten (${errorRows.length})
      </div>
      <div class="error-log-list">
        ${errorRows.map(e => `
          <div class="error-log-row">
            <i class="ti ${typeIcon[e.type] || 'ti-alert-circle'}" style="color:var(--danger);flex-shrink:0"></i>
            <div style="flex:1;min-width:0">
              <div style="font-size:12px;font-weight:600;color:var(--text-primary)">${esc(e.message)}</div>
              ${e.details ? `<div class="error-log-detail">${esc(e.details)}</div>` : ''}
            </div>
            <span class="error-log-time">${new Date(e.time).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})} ${formatDate(e.time)}</span>
          </div>`).join('')}
      </div>` : `
      <div style="display:flex;align-items:center;gap:8px;color:var(--success);font-size:13px">
        <i class="ti ti-circle-check"></i> Geen recente fouten
      </div>`}
  `;
}

// ─── Run-page functions (moved from instellingen.js) ──────────────────────────

const _ACTIVITY_ICONS  = { run: 'ti-player-play', email: 'ti-send', reply: 'ti-message-reply', backup: 'ti-database-export', followup: 'ti-clock-hour-4', bounce: 'ti-mail-off', ai_call: 'ti-brain' };
const _ACTIVITY_COLORS = { run: '#2563eb', email: '#16a34a', reply: '#ea580c', backup: '#9b9b98', followup: '#7c3aed', bounce: '#dc2626', ai_call: '#7c3aed' };

async function loadActivityLog() {
  const container = document.getElementById('activityLog');
  if (!container) return;
  const filter = document.getElementById('activityFilter')?.value || '';
  try {
    const data = await apiJSON('/api/activity?limit=50');
    if (!data) return;
    let entries = data.activity || [];
    if (filter) entries = entries.filter(e => e.type === filter);
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state"><i class="ti ti-list"></i><p>Geen activiteiten gevonden</p></div>';
      return;
    }
    container.innerHTML = entries.map(e => {
      const icon  = _ACTIVITY_ICONS[e.type]  || 'ti-point';
      const color = _ACTIVITY_COLORS[e.type] || 'var(--text-muted)';
      const time  = new Date(e.timestamp).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      const dollarSign = String.fromCharCode(36);
      const cost  = e.costUsd > 0 ? `<span class="text-muted" style="font-size:11px;margin-left:8px">${dollarSign}${e.costUsd.toFixed(4)}</span>` : '';
      const tok   = e.tokensIn > 0 ? `<span class="text-muted" style="font-size:11px;margin-left:6px">${formatNumber(e.tokensIn + e.tokensOut)} tok</span>` : '';
      return `<div class="activity-log-row">
        <div class="activity-log-icon" style="background:${color}18;color:${color}">
          <i class="ti ${icon}"></i>
        </div>
        <div class="activity-log-body">
          <div class="activity-log-label">${esc(e.label)}${cost}${tok}</div>
          <div class="activity-log-time">${time}</div>
        </div>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<p class="text-muted" style="font-size:13px">Laden mislukt</p>'; }
}

function _runFmt(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

async function toggleLeadSource(key, value) {
  const res = await api('/api/settings/automation', { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ [key]: value }) });
  if (res.ok) toast(value ? `${key === 'instagramTargeting' ? 'Instagram' : 'Google Maps'} targeting ingeschakeld` : `Targeting uitgeschakeld`, 'success');
  else toast('Opslaan mislukt', 'error');
}

function showNewTemplateForm() {
  const wrap = document.getElementById('templateFormWrap');
  if (wrap) { wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none'; }
}

async function loadTemplates() {
  const container = document.getElementById('templateList');
  if (!container) return;
  try {
    const data = await apiJSON('/api/run-templates');
    const templates = (data && data.templates) || [];
    if (!templates.length) {
      container.innerHTML = '<p class="text-muted" style="font-size:13px;margin:0">Geen sjablonen. Voeg er een toe om snel te herstarten.</p>';
      return;
    }
    container.innerHTML = templates.map(t => {
      const niches = (t.niches || []).join(', ') || '—';
      const loc    = t.location ? ' · ' + t.location : '';
      return `<div class="template-row">
        <div class="template-row-info">
          <div class="template-row-name">${esc(t.name)}</div>
          <div class="template-row-meta">${esc(niches)}${loc} · ${t.count} leads</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="runTemplate('${t.id}', this)">
          <i class="ti ti-player-play"></i> Uitvoeren
        </button>
        <button class="btn btn-ghost btn-sm btn-icon" onclick="deleteRunTemplate('${t.id}')">
          <i class="ti ti-trash"></i>
        </button>
      </div>`;
    }).join('');
  } catch {
    container.innerHTML = '<p class="text-muted" style="font-size:13px;margin:0">Laden mislukt</p>';
  }
}

async function saveTemplate() {
  const name     = document.getElementById('tmplName')?.value?.trim();
  const niches   = document.getElementById('tmplNiches')?.value?.trim();
  const count    = document.getElementById('tmplCount')?.value;
  const location = document.getElementById('tmplLocation')?.value?.trim();
  if (!name) { toast('Voer een naam in', 'error'); return; }
  const res = await api('/api/run-templates', {
    method: 'POST',
    body: JSON.stringify({ name, niches, count, location })
  });
  if (res.ok) {
    toast('Sjabloon opgeslagen', 'success');
    document.getElementById('templateFormWrap').style.display = 'none';
    document.getElementById('tmplName').value = '';
    document.getElementById('tmplNiches').value = '';
    document.getElementById('tmplCount').value = '10';
    document.getElementById('tmplLocation').value = '';
    await loadTemplates();
  } else {
    toast('Opslaan mislukt', 'error');
  }
}

async function runTemplate(id, btn) {
  if (!confirm('Run starten met dit sjabloon?')) return;
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 ti-spin"></i> Bezig...'; }
  try {
    const res = await api('/api/run-templates/' + id + '/run', { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) {
      const data = await res.json();
      toast('Run klaar — ' + (data.found || 0) + ' leads gevonden', 'success');
      await renderRuns();
    } else {
      toast('Run mislukt', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Uitvoeren'; }
    }
  } catch {
    toast('Run mislukt', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Uitvoeren'; }
  }
}

async function deleteRunTemplate(id) {
  if (!confirm('Sjabloon verwijderen?')) return;
  const res = await api('/api/run-templates/' + id, { method: 'DELETE' });
  if (res.ok) {
    toast('Sjabloon verwijderd', 'success');
    await loadTemplates();
  } else {
    toast('Verwijderen mislukt', 'error');
  }
}

async function startCustomRun() {
  const count    = parseInt(document.getElementById('runCount')?.value) || 15;
  const niches   = document.getElementById('runNiches')?.value?.trim();
  const nicheArr = niches ? niches.split(',').map(n => n.trim()).filter(Boolean) : [];
  const btn      = document.getElementById('startRunBtn');
  const statusEl = document.getElementById('run-status');
  const barEl    = document.getElementById('run-progress-bar');
  const timerEl  = document.getElementById('run-timer');

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }
  if (statusEl) { statusEl.textContent = 'Run gestart...'; statusEl.style.display = ''; statusEl.style.color = ''; }
  if (barEl)    barEl.style.display = '';
  if (timerEl)  { timerEl.textContent = 'Bezig: 0:00'; timerEl.style.display = ''; }

  if (document.getElementById('liveRunCard') && typeof startRunProgressPoll === 'function') startRunProgressPoll();

  const t0 = Date.now();
  const timer = setInterval(() => {
    if (timerEl) timerEl.textContent = `Bezig: ${_runFmt(Date.now() - t0)}`;
  }, 1000);

  try {
    const res  = await api('/api/find-leads', { method: 'POST', body: JSON.stringify({ count, niches: nicheArr }) });
    const data = await res.json().catch(() => ({}));
    clearInterval(timer);
    const duration = _runFmt(Date.now() - t0);

    if (barEl)   barEl.style.display = 'none';
    if (timerEl) timerEl.style.display = 'none';

    if (res?.ok) {
      if (statusEl) statusEl.textContent = `Klaar in ${duration} — ${data.found || 0} leads gevonden`;
      toast(`Run klaar — ${data.found || 0} leads gevonden`, 'success');
      renderRuns();
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Run mislukt — controleer logs'; statusEl.style.color = '#dc2626'; }
      toast(data.error || 'Run mislukt — controleer server logs', 'error');
    }
  } catch (err) {
    clearInterval(timer);
    if (barEl)   barEl.style.display = 'none';
    if (timerEl) timerEl.style.display = 'none';
    if (statusEl) { statusEl.textContent = 'Fout: ' + err.message; statusEl.style.color = '#dc2626'; }
    toast('Fout: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-player-play"></i> Start run'; }
  }
}

let _dupCheckTimer = null;
async function checkDuplicateLive() {
  clearTimeout(_dupCheckTimer);
  const nameEl = document.getElementById('custCompany');
  const domainEl = document.getElementById('custWebsite');
  const warn = document.getElementById('dupWarning');
  if (!warn) return;
  const name = nameEl?.value?.trim() || '';
  const domain = domainEl?.value?.trim() || '';
  if (!name && !domain) { warn.style.display = 'none'; return; }
  _dupCheckTimer = setTimeout(async () => {
    const params = new URLSearchParams();
    if (name)   params.set('name', name);
    if (domain) params.set('domain', domain);
    const data = await apiJSON(`/api/leads/check-duplicate?${params}`);
    if (data?.duplicate) {
      warn.style.display = 'flex';
      warn.innerHTML = `<i class="ti ti-alert-triangle" style="color:#f59e0b;flex-shrink:0"></i><span style="font-size:12px">Mogelijk duplicaat: <strong>${esc(data.companyName)}</strong> staat al in je pipeline (status: ${data.status || '?'})</span>`;
    } else {
      warn.style.display = 'none';
    }
  }, 500);
}

async function analyzeCustomCompany() {
  const companyName = document.getElementById('custCompany')?.value?.trim();
  if (!companyName) { toast('Vul een bedrijfsnaam in.', 'error'); return; }

  const domain = document.getElementById('custWebsite')?.value?.trim() || '';
  const dupParams = new URLSearchParams();
  dupParams.set('name', companyName);
  if (domain) dupParams.set('domain', domain);
  const dupData = await apiJSON(`/api/leads/check-duplicate?${dupParams}`);
  if (dupData?.duplicate) {
    if (!confirm(`${companyName} staat al in je pipeline (status: ${dupData.status}). Toch toevoegen?`)) return;
  }

  const btn = document.getElementById('analyzeBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ti ti-loader-2 spin"></i> Bezig...'; }

  const STEPS = [
    { icon: 'ti-search',          name: 'Lead Finder',         sub: 'Bedrijf registreren' },
    { icon: 'ti-world',           name: 'Website Checker',     sub: 'Website analyseren' },
    { icon: 'ti-brand-instagram', name: 'Social Analyzer',     sub: 'Social media checken' },
    { icon: 'ti-chart-bar',       name: 'Opportunity Scorer',  sub: 'Score berekenen' },
    { icon: 'ti-chart-dots',      name: 'Competitor Analyzer', sub: 'Concurrenten zoeken' },
    { icon: 'ti-mail',            name: 'Email Writer',        sub: 'Email schrijven' },
    { icon: 'ti-brand-linkedin',  name: 'LinkedIn DM',         sub: 'LinkedIn DM schrijven' },
  ];

  const progressEl = document.getElementById('analyzeProgress');
  if (progressEl) {
    progressEl.style.display = '';
    progressEl.innerHTML = `
      <div class="analyze-progress-panel">
        <div class="analyze-progress-header">
          <span class="analyze-progress-title" id="analyzePanelTitle">Agent pipeline bezig...</span>
          <div class="analyze-progress-bar-wrap"><div class="analyze-progress-bar" id="analyzeProgressBar" style="width:0%"></div></div>
          <span class="analyze-progress-count" id="analyzeProgressCount">0 / ${STEPS.length}</span>
        </div>
        <div class="analyze-steps">
          ${STEPS.map((s, i) => `
            <div class="analyze-step step-pending" id="astep-${i}">
              <span class="analyze-step-icon" id="astep-icon-${i}"><i class="ti ti-circle" style="color:var(--border)"></i></span>
              <span class="analyze-step-name">${s.name}</span>
              <span class="analyze-step-status" id="astep-status-${i}">${s.sub}</span>
            </div>
          `).join('')}
        </div>
        <div class="analyze-result" id="analyzeResult" style="display:none"></div>
      </div>`;
  }

  let doneCount = 0;
  function stepActive(i) {
    const el = document.getElementById(`astep-${i}`);
    const icon = document.getElementById(`astep-icon-${i}`);
    const status = document.getElementById(`astep-status-${i}`);
    if (el) el.className = 'analyze-step step-active';
    if (icon) icon.innerHTML = '<i class="ti ti-loader-2 spin" style="color:var(--accent)"></i>';
    if (status) status.textContent = 'Bezig...';
  }
  function stepDone(i) {
    const el = document.getElementById(`astep-${i}`);
    const icon = document.getElementById(`astep-icon-${i}`);
    const status = document.getElementById(`astep-status-${i}`);
    if (el) el.className = 'analyze-step step-done';
    if (icon) icon.innerHTML = '<i class="ti ti-check" style="color:#16a34a"></i>';
    if (status) status.textContent = 'Klaar';
    doneCount++;
    const pct = Math.round((doneCount / STEPS.length) * 100);
    const bar = document.getElementById('analyzeProgressBar');
    const cnt = document.getElementById('analyzeProgressCount');
    if (bar) bar.style.width = pct + '%';
    if (cnt) cnt.textContent = `${doneCount} / ${STEPS.length}`;
  }

  // Simulate step progress while real fetch runs (~5s per step)
  const STEP_DELAYS = [0, 4000, 8000, 13000, 18000, 23000, 28000];
  let activatedUpTo = -1;
  let fetchComplete = false;
  const timers = STEPS.map((_, i) => setTimeout(() => {
    if (fetchComplete) return;
    if (activatedUpTo >= 0) stepDone(activatedUpTo);
    stepActive(i);
    activatedUpTo = i;
  }, STEP_DELAYS[i]));

  // Real API call
  let res = null, data = null;
  try {
    res = await api('/api/analyze-company', {
      method: 'POST',
      body: JSON.stringify({
        companyName,
        websiteUrl:      domain,
        email:           document.getElementById('custEmail')?.value?.trim() || '',
        instagramHandle: document.getElementById('custInstagram')?.value?.trim() || '',
        niche:           document.getElementById('custNiche')?.value || 'retail',
        location:        document.getElementById('custLocation')?.value?.trim() || 'Nederland',
        country:         document.getElementById('custCountry')?.value?.trim() || 'NL'
      })
    });
    if (res) data = await res.json();
  } catch (_) {}

  fetchComplete = true;
  timers.forEach(t => clearTimeout(t));

  // Fast-complete remaining steps
  if (activatedUpTo >= 0) stepDone(activatedUpTo);
  for (let i = activatedUpTo + 1; i < STEPS.length; i++) {
    stepActive(i);
    await new Promise(r => setTimeout(r, 70));
    stepDone(i);
  }

  // Show result
  const resultEl = document.getElementById('analyzeResult');
  const titleEl  = document.getElementById('analyzePanelTitle');
  if (!res || !res.ok) {
    const errMsg = data?.error || `Fout ${res?.status || 'onbekend'}`;
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.className = 'analyze-result result-error';
      resultEl.innerHTML = `<i class="ti ti-alert-circle"></i> ${esc(errMsg)}`;
    }
    if (titleEl) titleEl.textContent = 'Analyse mislukt';
  } else {
    const score = data?.item?.score != null ? Number(data.item.score).toFixed(1) : '?';
    if (resultEl) {
      resultEl.style.display = '';
      resultEl.className = 'analyze-result result-success';
      resultEl.innerHTML = `<strong>✓ ${esc(companyName)} toegevoegd!</strong> Score: ${score}/10 &nbsp;—&nbsp; <a href="#" onclick="event.preventDefault();setView('inbox')">Bekijk in inbox →</a>`;
    }
    if (titleEl) titleEl.textContent = 'Analyse voltooid';
    ['custCompany','custWebsite','custEmail','custInstagram','custLocation'].forEach(id => {
      const el = document.getElementById(id); if (el) el.value = '';
    });
    const warn = document.getElementById('dupWarning');
    if (warn) warn.style.display = 'none';
  }

  if (btn) { btn.disabled = false; btn.innerHTML = '<i class="ti ti-wand"></i> Voeg toe en analyseer'; }
}

