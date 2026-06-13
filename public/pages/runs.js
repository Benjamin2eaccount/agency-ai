// ─── Runs tab ─────────────────────────────────────────────────────────────────

async function renderRuns() {
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Automatisering</div>
        <h1 class="page-title">Runs</h1>
        <p style="margin-top:4px;font-size:14px;color:var(--text-2,#999);margin-bottom:0">Agent pipeline activiteit</p>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-ghost btn-sm" onclick="setView('settings')">
          <i class="ti ti-settings"></i> Instellingen
        </button>
        <button class="btn btn-primary" id="runNowBtn2">
          <i class="ti ti-player-play"></i> Start run
        </button>
      </div>
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
    <style>
      .rn-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
      .rn-kpi{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:16px 18px}
      .rn-kpi-val{font-size:24px;font-weight:700;color:var(--text,#F5F5F5);line-height:1;margin-bottom:4px}
      .rn-kpi-lbl{font-size:10px;color:var(--text-3,#666);text-transform:uppercase;letter-spacing:.07em}
      .rn-section{margin-bottom:14px}
      .rn-card{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:18px 20px}
      .rn-card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}
      .rn-card-title{font-size:15px;font-weight:600;color:var(--text,#F5F5F5);display:flex;align-items:center;gap:6px}
      .rn-live-card{background:var(--surface,#1A1A1A);border:1px solid var(--accent,#2563EB);border-left:3px solid var(--accent,#2563EB);border-radius:8px;padding:18px 20px;margin-bottom:14px}
      .rn-live-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
      .rn-live-title{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:600;color:var(--text,#F5F5F5)}
      .rn-live-dot{width:8px;height:8px;border-radius:50%;background:var(--accent,#2563EB);animation:rn-pulse 1.2s ease-in-out infinite;flex-shrink:0}
      @keyframes rn-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(.85)}}
      .rn-progress-bar{width:100%;height:6px;background:var(--border,#2A2A2A);border-radius:3px;overflow:hidden;margin:8px 0}
      .rn-progress-fill{height:100%;background:var(--accent,#2563EB);border-radius:3px;transition:width .4s}
      .rn-log-box{background:var(--bg,#0F0F0F);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:10px 14px;max-height:180px;overflow-y:auto;margin-top:10px;font-family:'JetBrains Mono','Fira Code',monospace}
      .rn-log-line{font-size:12px;color:var(--text-2,#999);line-height:1.7}
      .rn-run-list{display:flex;flex-direction:column;gap:8px}
      .rn-run-card{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:8px;overflow:hidden;transition:border-color .15s;display:flex}
      .rn-run-card:hover{border-color:var(--border-strong,#333)}
      .rn-run-stripe{width:3px;flex-shrink:0}
      .rn-run-body{flex:1;padding:14px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap}
      .rn-run-info{flex:1;min-width:0}
      .rn-run-date{font-size:14px;font-weight:600;color:var(--text,#F5F5F5)}
      .rn-run-sub{font-size:12px;color:var(--text-3,#666);margin-top:2px}
      .rn-run-stats{display:flex;align-items:center;gap:20px}
      .rn-run-stat{display:flex;flex-direction:column;align-items:center;gap:2px}
      .rn-run-stat-val{font-size:16px;font-weight:700;color:var(--text,#F5F5F5)}
      .rn-run-stat-lbl{font-size:10px;color:var(--text-3,#666);text-transform:uppercase;letter-spacing:.05em}
      .rn-input{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:6px;padding:8px 12px;color:var(--text,#F5F5F5);font-size:13px;outline:none;transition:border-color .15s;font-family:inherit;box-sizing:border-box}
      .rn-input:focus{border-color:var(--accent,#2563EB)}
      .rn-cost-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px}
      .rn-cost-card{background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:14px 16px}
      .rn-cost-val{font-size:20px;font-weight:700;color:var(--success,#16A34A)}
      .rn-cost-lbl{font-size:11px;color:var(--text-3,#666);margin-top:3px}
      .rn-divider{height:1px;background:var(--border,#2A2A2A);margin:14px 0}
      @media(max-width:768px){.rn-kpi-grid{grid-template-columns:repeat(2,1fr)}.rn-run-stats{gap:12px}.rn-cost-grid{grid-template-columns:repeat(2,1fr)}.rn-run-body{gap:10px}}
    </style>

    <div class="rn-kpi-grid">
      <div class="rn-kpi">
        <div class="rn-kpi-val">${totalRuns}</div>
        <div class="rn-kpi-lbl">Runs totaal</div>
      </div>
      <div class="rn-kpi">
        <div class="rn-kpi-val">${totalLeads}</div>
        <div class="rn-kpi-lbl">Leads gevonden</div>
      </div>
      <div class="rn-kpi">
        <div class="rn-kpi-val">${totalAuto}</div>
        <div class="rn-kpi-lbl">Auto-goedgekeurd</div>
      </div>
      <div class="rn-kpi">
        <div class="rn-kpi-val">€${totalValue.toLocaleString('nl-NL')}</div>
        <div class="rn-kpi-lbl">Totale waarde</div>
      </div>
    </div>

    <!-- Run sjablonen -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-bookmark"></i> Run-sjablonen</span>
        <button class="btn btn-ghost btn-sm" onclick="showNewTemplateForm()"><i class="ti ti-plus"></i> Nieuw</button>
      </div>
      <div id="templateFormWrap" class="template-form-wrap" style="display:none">
        <div class="form-grid" style="margin-bottom:10px">
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Naam</label>
            <input type="text" id="tmplName" placeholder="Bijv. Restaurants NL" class="rn-input" style="width:100%">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Niches <span style="font-size:11px;opacity:.7">(komma-gescheiden)</span></label>
            <input type="text" id="tmplNiches" placeholder="restaurant, fitness, beauty" class="rn-input" style="width:100%">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Aantal leads</label>
            <input type="number" id="tmplCount" value="10" min="1" max="30" class="rn-input" style="width:80px">
          </div>
          <div class="form-group" style="margin:0">
            <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Locatie <span style="font-size:11px;opacity:.7">(optioneel)</span></label>
            <input type="text" id="tmplLocation" placeholder="Amsterdam, Rotterdam..." class="rn-input" style="width:100%">
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary btn-sm" onclick="saveTemplate()"><i class="ti ti-device-floppy"></i> Opslaan</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('templateFormWrap').style.display='none'">Annuleren</button>
        </div>
      </div>
      <div id="templateList"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>

    <!-- Live run (hidden when idle) -->
    <div id="liveRunCard" style="display:none;margin-bottom:14px"></div>

    <!-- Run configuratie -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-settings-2"></i> Run configuratie</span>
      </div>
      ${!isAdmin() ? `<div class="employee-notice"><i class="ti ti-lock"></i> Alleen admins kunnen runs starten</div>` : `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Aantal leads</label>
          <input type="number" id="runCount" value="${(settings || {}).leadsPerDay || 15}" min="1" max="50" class="rn-input" style="width:80px">
        </div>
        <div style="flex:1;min-width:200px">
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Niches <span style="opacity:.7">(komma-gescheiden, leeg = alles)</span></label>
          <input type="text" id="runNiches" placeholder="beauty, food, fitness" class="rn-input" style="width:100%">
        </div>
        <button class="btn btn-primary" id="startRunBtn" onclick="startCustomRun()">
          <i class="ti ti-player-play"></i> Start run
        </button>
      </div>`}
      ${isAdmin() ? `
      <div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border,#2A2A2A);display:flex;gap:20px;flex-wrap:wrap">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="igTargetingToggle" ${(settings || {}).instagramTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('instagramTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent,#2563EB)">
          <i class="ti ti-brand-instagram" style="color:#e1306c;font-size:15px"></i>
          Instagram targeting
          <span style="font-size:11px;color:var(--text-3,#666);font-weight:400">— accounts 2K-200K volgers, laag engagement</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500">
          <input type="checkbox" id="mapsTargetingToggle" ${(settings || {}).googleMapsTargeting ? 'checked' : ''}
            onchange="toggleLeadSource('googleMapsTargeting', this.checked)"
            style="width:16px;height:16px;accent-color:var(--accent,#2563EB)">
          <i class="ti ti-map-pin" style="color:#4285f4;font-size:15px"></i>
          Google Maps targeting
          <span style="font-size:11px;color:var(--text-3,#666);font-weight:400">— 3-4 ster reviews, minder dan 50 reviews</span>
        </label>
      </div>` : ''}
      <div style="margin-top:14px">
        <p id="run-status" style="display:none;font-size:13px;color:var(--text-2,#999);margin:0 0 6px"></p>
        <div id="run-progress-bar" style="display:none"></div>
        <p id="run-timer" style="display:none;font-size:12px;color:var(--text-3,#666);margin:6px 0 0"></p>
      </div>
    </div>

    <!-- Eigen bedrijf toevoegen -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-building"></i> Eigen bedrijf toevoegen</span>
      </div>
      <p style="font-size:13px;color:var(--text-2,#999);margin-bottom:14px">Voeg een specifiek bedrijf toe om direct te analyseren en aan je inbox toe te voegen.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Bedrijfsnaam *</label>
          <input type="text" id="custCompany" placeholder="Bijv. Salon Rosa" oninput="checkDuplicateLive()" class="rn-input" style="width:100%">
        </div>
        <div id="dupWarning" style="display:none;align-items:center;gap:8px;background:rgba(217,119,6,.1);border:1px solid rgba(217,119,6,.3);border-radius:8px;padding:10px 12px"></div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Website URL</label>
          <input type="text" id="custWebsite" placeholder="https://..." oninput="checkDuplicateLive()" class="rn-input" style="width:100%">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Email <span style="opacity:.7">(optioneel — anders zoekt Agent 1)</span></label>
          <input type="email" id="custEmail" placeholder="info@bedrijf.nl" class="rn-input" style="width:100%">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Instagram handle</label>
          <input type="text" id="custInstagram" placeholder="@handle" class="rn-input" style="width:100%">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Niche</label>
          <select id="custNiche" class="rn-input" style="width:100%;cursor:pointer">
            <option value="beauty">Beauty</option>
            <option value="food">Food</option>
            <option value="fitness">Fitness</option>
            <option value="retail">Retail</option>
            <option value="restaurant">Restaurant</option>
          </select>
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Locatie</label>
          <input type="text" id="custLocation" placeholder="Amsterdam, NL" class="rn-input" style="width:100%">
        </div>
        <div>
          <label style="font-size:12px;color:var(--text-3,#666);display:block;margin-bottom:5px">Land</label>
          <input type="text" id="custCountry" placeholder="NL" value="NL" class="rn-input" style="width:100%">
        </div>
      </div>
      <button class="btn btn-secondary" id="analyzeBtn" style="margin-top:14px" onclick="analyzeCustomCompany()">
        <i class="ti ti-wand"></i> Voeg toe en analyseer
      </button>
      <div id="analyzeProgress" style="display:none;margin-top:14px"></div>
    </div>

    <!-- Geplande runs -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-calendar-event"></i> Geplande runs</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;font-size:14px">
        <span style="color:var(--text-2,#999)">Volgende automatische run: <strong style="color:var(--text,#F5F5F5)">${nextLabel}</strong></span>
      </div>
      <p style="font-size:12px;color:var(--text-3,#666);margin-top:8px;margin-bottom:0">Aanpassen via Instellingen → Automatisering.</p>
    </div>

    <!-- Run historiek -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-history"></i> Run historiek</span>
        <span style="font-size:12px;color:var(--text-3,#666)">${safeRuns.length} runs</span>
      </div>
      ${safeRuns.length === 0 ? `
        <div style="padding:32px;text-align:center">
          <i class="ti ti-history-off" style="font-size:36px;color:var(--border,#2A2A2A);display:block;margin-bottom:10px"></i>
          <p style="color:var(--text-3,#666);margin:0">Nog geen runs — start een run om leads te vinden</p>
        </div>
      ` : `
        <div class="rn-run-list">
          ${safeRuns.map(r => {
            const dt = new Date(r.createdAt);
            const dateStr = dt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
            const timeStr = dt.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
            return `
              <div class="rn-run-card">
                <div class="rn-run-stripe" style="background:var(--success,#16A34A)"></div>
                <div class="rn-run-body">
                  <div class="rn-run-info">
                    <div class="rn-run-date">${dateStr} om ${timeStr}</div>
                    <div class="rn-run-sub">${r.leadsFound || 0} leads gevonden</div>
                  </div>
                  <div class="rn-run-stats">
                    <div class="rn-run-stat">
                      <div class="rn-run-stat-val">${r.leadsFound || 0}</div>
                      <div class="rn-run-stat-lbl">Gevonden</div>
                    </div>
                    <div class="rn-run-stat">
                      <div class="rn-run-stat-val">${r.autoApproved || 0}</div>
                      <div class="rn-run-stat-lbl">Goedgekeurd</div>
                    </div>
                    <div class="rn-run-stat">
                      <div class="rn-run-stat-val" style="color:var(--text-2,#999)">€${(r.totalValue || 0).toLocaleString('nl-NL')}</div>
                      <div class="rn-run-stat-lbl">Waarde</div>
                    </div>
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>
      `}
    </div>

    <!-- API gebruik & kosten -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-chart-line"></i> API gebruik &amp; kosten</span>
        <span id="costsHeader" style="font-size:12px;color:var(--text-3,#666)">Laden...</span>
      </div>
      <div id="costsCards" class="rn-cost-grid"></div>
      <div class="rn-divider"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <span style="font-size:13px;font-weight:600;color:var(--text,#F5F5F5)">Activiteit log</span>
        <select id="activityFilter" class="rn-input" style="width:160px;font-size:12px;cursor:pointer" onchange="loadActivityLog()">
          <option value="">Alle activiteiten</option>
          <option value="run">Runs</option>
          <option value="email">Emails verstuurd</option>
          <option value="reply">Replies ontvangen</option>
          <option value="backup">Backups</option>
        </select>
      </div>
      <div id="activityLog"><div class="loading-state"><div class="spinner"></div></div></div>
    </div>

    <!-- Systeemstatus -->
    <div class="rn-card rn-section">
      <div class="rn-card-head">
        <span class="rn-card-title"><i class="ti ti-heartbeat" style="color:var(--danger,#DC2626)"></i> Systeemstatus</span>
        <div style="display:flex;gap:8px">
          <a class="btn btn-ghost btn-sm" href="/status" target="_blank" rel="noopener"><i class="ti ti-external-link"></i> Statuspagina</a>
          <button class="btn btn-ghost btn-sm" id="dashCheckRepliesBtn" onclick="triggerReplyCheck()"><i class="ti ti-mail-forward"></i> Controleer replies</button>
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
        <div class="rn-live-card">
          <div class="rn-live-head">
            <div class="rn-live-title">
              <span class="rn-live-dot"></span>
              Run actief
              <span style="font-size:12px;font-weight:400;color:var(--text-2,#999);margin-left:4px">${elapsedLabel} bezig</span>
            </div>
            <span style="font-size:13px;font-weight:600;color:var(--text,#F5F5F5)">${p.found}/${p.target} leads</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text-2,#999);margin-bottom:4px">
            <span>${p.currentAgent || 'Bezig...'}</span>
            <span>${pct}%</span>
          </div>
          <div class="rn-progress-bar"><div class="rn-progress-fill" style="width:${pct}%"></div></div>
          ${p.currentLead ? `<div style="font-size:12px;color:var(--text-2,#999);margin-top:6px">Huidig bedrijf: <strong style="color:var(--text,#F5F5F5)">${p.currentLead}</strong></div>` : ''}
          ${p.skipped > 0 ? `<div style="font-size:12px;color:var(--text-3,#666);margin-top:4px">${p.skipped} overgeslagen (geen email / blacklist)</div>` : ''}
          ${p.log && p.log.length ? `
            <div class="rn-log-box">
              ${p.log.slice(0,5).map(l => `<div class="rn-log-line">${l.msg}</div>`).join('')}
            </div>` : ''}
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

