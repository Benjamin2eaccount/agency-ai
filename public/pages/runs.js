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

