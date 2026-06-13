// ─── Agents tab ───────────────────────────────────────────────────────────────

async function renderAgents() {
  const AGENTS = [
    { num: 1, color: '#2563EB', icon: 'ti-search',          name: 'Lead Finder',        role: 'Genereert bedrijven per dag',           desc: 'Vraagt Claude om realistische bedrijven te genereren die baat hebben bij AI-marketing. Mixt niches (beauty, food, fitness, retail, restaurant) en locaties (NL, BE, DE, UK, VS).', s1l: 'Gevonden', s2l: 'Runs' },
    { num: 2, color: '#16A34A', icon: 'ti-world',           name: 'Website Checker',    role: 'Analyseert website technisch',           desc: 'Bezoekt de website van elk bedrijf, meet laadtijd, controleert HTTPS, mobile viewport, aanwezigheid van CTA en boekingssysteem. Genereert concrete verbeterpunten.', s1l: 'Gecheckt', s2l: 'Problemen' },
    { num: 3, color: '#7C3AED', icon: 'ti-brand-instagram', name: 'Social Analyzer',    role: 'Analyseert social media',               desc: 'Schat engagement rate, postfrequentie en groeipotentieel in. Genereert een gepersonaliseerde email-opener gebaseerd op echte observaties over het account.', s1l: 'Geanalyseerd', s2l: 'Openers' },
    { num: 4, color: '#D97706', icon: 'ti-chart-bar',       name: 'Opportunity Scorer', role: 'Score 1–10 + aanbevolen diensten',      desc: 'Combineert website- en social data om een kwaliteitsscore te berekenen. Koppelt de beste diensten aan het bedrijf en schat de maandelijkse pipeline waarde.', s1l: 'Gescoord', s2l: 'Gem. score' },
    { num: 5, color: '#DB2777', icon: 'ti-mail',            name: 'Email Writer',       role: 'Schrijft gepersonaliseerde koude email', desc: 'Schrijft een menselijke koude email in de taal van het bedrijf (NL, EN, DE, FR of IT). Max 120 woorden, informele toon, begint met de gepersonaliseerde opener van Agent 3.', s1l: 'Geschreven', s2l: 'Verstuurd' },
    { num: 6, color: '#0891B2', icon: 'ti-brand-linkedin',  name: 'LinkedIn DM Writer', role: 'Schrijft LinkedIn DM (max 280 tekens)',  desc: 'Schrijft een korte, directe LinkedIn DM in de taal van het bedrijf. Max 280 tekens, vriendelijk en specifiek. Klaar om te plakken in LinkedIn.', s1l: "DM's geschreven", s2l: 'Verstuurd' },
    { num: 7, color: '#CA8A04', icon: 'ti-chart-dots',      name: 'Competitor Analyzer',role: 'Analyseert lokale concurrenten',         desc: 'Genereert 2-3 realistische concurrenten voor het bedrijf in hun stad of regio. Analyseert hun voordelen (ads, website, reviews). Agent 5 gebruikt dit om een concurrentie-hook toe te voegen aan de email.', s1l: 'Geanalyseerd', s2l: 'Concurrenten' }
  ];

  const [stats, runs, memory] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON('/api/runs'),
    apiJSON('/api/memory')
  ]);
  const totalRuns   = (runs  || []).length;
  window._agentLogsRuns = runs || [];
  const totalLeads  = stats?.leadsFound  || 0;
  const totalSent   = stats?.emailsSent  || 0;
  const memEntries  = Object.values(memory || {});

  document.getElementById('appView').innerHTML = `
    <style>
      .ag-page-head{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:24px}
      .ag-page-titles{display:flex;flex-direction:column;gap:2px}
      .ag-page-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.8px;color:var(--text-3,#666)}
      .ag-page-title{font-size:22px;font-weight:700;color:var(--text,#F5F5F5);margin:0}
      .ag-page-sub{font-size:13px;color:var(--text-2,#999);margin-top:2px}
      .ag-kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:24px}
      .ag-kpi{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:4px}
      .ag-kpi-val{font-size:26px;font-weight:700;color:var(--text,#F5F5F5);line-height:1}
      .ag-kpi-lbl{font-size:12px;color:var(--text-2,#999)}
      /* Pipeline visualization */
      .ag-pipeline{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:10px;padding:20px 24px;margin-bottom:24px;overflow-x:auto}
      .ag-pipe-title{font-size:13px;font-weight:600;color:var(--text-2,#999);text-transform:uppercase;letter-spacing:.6px;margin-bottom:16px}
      .ag-pipe-row{display:flex;align-items:center;gap:0;min-width:600px}
      .ag-pipe-node{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0}
      .ag-node-circle{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;flex-shrink:0;position:relative}
      .ag-node-dot{width:8px;height:8px;border-radius:50%;background:#fff;position:absolute;bottom:2px;right:2px;opacity:.7}
      .ag-node-name{font-size:10px;font-weight:600;color:var(--text-2,#999);text-align:center;line-height:1.3;max-width:64px}
      .ag-pipe-arrow{flex-shrink:0;width:24px;display:flex;align-items:center;justify-content:center;padding-bottom:24px}
      .ag-pipe-arrow svg{color:var(--border-strong,#333);display:block}
      /* Agent cards grid */
      .ag-cards-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:24px}
      .ag-card{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
      .ag-card-top{padding:16px 18px 14px;display:flex;align-items:flex-start;gap:14px;border-bottom:1px solid var(--border,#2A2A2A)}
      .ag-num-badge{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:#fff;flex-shrink:0}
      .ag-card-meta{flex:1;min-width:0}
      .ag-card-name{font-size:14px;font-weight:700;color:var(--text,#F5F5F5);margin-bottom:2px}
      .ag-card-role{font-size:12px;font-weight:500}
      .ag-card-body{padding:14px 18px;flex:1;display:flex;flex-direction:column;gap:10px}
      .ag-card-desc{font-size:12px;color:var(--text-2,#999);line-height:1.6}
      .ag-card-stats{display:flex;gap:20px}
      .ag-stat{display:flex;flex-direction:column;gap:2px}
      .ag-stat-val{font-size:16px;font-weight:700;color:var(--text,#F5F5F5)}
      .ag-stat-lbl{font-size:11px;color:var(--text-3,#666)}
      .ag-card-footer{padding:12px 18px;border-top:1px solid var(--border,#2A2A2A);display:flex;gap:8px;background:var(--surface-2,#222)}
      /* Expand panel on agent-row */
      .ag-row{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:10px;overflow:hidden;margin-bottom:0}
      .ag-row-head{display:flex;align-items:center;gap:12px;padding:14px 16px;cursor:pointer;user-select:none}
      .ag-row-head:hover{background:var(--surface-2,#222)}
      .ag-row-icon{width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0}
      .ag-row-info{flex:1;min-width:0}
      .ag-row-name{font-size:13px;font-weight:600;color:var(--text,#F5F5F5)}
      .ag-row-role{font-size:11px;margin-top:1px}
      .ag-row-expand{display:none;padding:0 16px 14px;border-top:1px solid var(--border,#2A2A2A)}
      .ag-row-expand.open{display:block}
      .ag-row-desc{font-size:13px;color:var(--text-2,#999);line-height:1.65;margin-bottom:12px}
      .ag-row-actions{display:flex;gap:8px}
      /* Memory / ML section */
      .ag-section{background:var(--surface,#1A1A1A);border:1px solid var(--border,#2A2A2A);border-radius:10px;margin-bottom:16px}
      .ag-section-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;cursor:pointer;user-select:none}
      .ag-section-head:hover{background:var(--surface-2,#222);border-radius:10px}
      .ag-section-title{font-size:14px;font-weight:600;color:var(--text,#F5F5F5);display:flex;align-items:center;gap:8px}
      .ag-section-body{padding:0 20px 20px}
      .ag-section-sub{font-size:12px;color:var(--text-2,#999);margin-bottom:14px;line-height:1.5}
      /* ML stats grid */
      .ag-ml-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
      .ag-ml-stat{background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:12px 14px;text-align:center}
      .ag-ml-val{font-size:18px;font-weight:700;color:var(--text,#F5F5F5)}
      .ag-ml-lbl{font-size:11px;color:var(--text-3,#666);margin-top:2px}
      .ag-table{width:100%;border-collapse:collapse;font-size:13px}
      .ag-table th{padding:8px 12px;text-align:left;font-size:11px;font-weight:600;color:var(--text-3,#666);text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid var(--border,#2A2A2A)}
      .ag-table td{padding:9px 12px;border-bottom:1px solid var(--border,#2A2A2A);color:var(--text-2,#999)}
      .ag-table tr:last-child td{border-bottom:none}
      .ag-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:24px;color:var(--text-3,#666);font-size:13px;text-align:center}
      .ag-empty i{font-size:28px}
      /* AB section */
      .ag-ab-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
      .ag-ab-card{background:var(--surface-2,#222);border:1px solid var(--border,#2A2A2A);border-radius:8px;padding:16px 18px;text-align:center}
      .ag-ab-val{font-size:22px;font-weight:700;color:var(--text,#F5F5F5)}
      .ag-ab-lbl{font-size:12px;color:var(--text-2,#999);margin-top:3px}
      .ag-ab-sub{font-size:11px;color:var(--text-3,#666);margin-top:2px}
      .ag-ab-winner{background:var(--surface-2,#222);border:1px solid var(--accent,#2563EB);border-radius:8px;padding:12px 16px;text-align:center;font-size:13px;color:var(--text,#F5F5F5)}
      .ag-row-head.open .ti-chevron-down{transform:rotate(180deg)}
      @media(max-width:768px){
        .ag-kpi-grid{grid-template-columns:repeat(2,1fr)}
        .ag-cards-grid{grid-template-columns:1fr}
        .ag-ml-grid{grid-template-columns:repeat(2,1fr)}
        .ag-ab-grid{grid-template-columns:1fr}
      }
    </style>

    <div class="ag-page-head">
      <div class="ag-page-titles">
        <div class="ag-page-label">Automatisering</div>
        <h1 class="ag-page-title">Agents</h1>
        <p class="ag-page-sub">AI agent pipeline configuratie</p>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="setView('stats')">
        <i class="ti ti-chart-bar"></i> Prestaties bekijken
      </button>
    </div>

    <!-- KPI row -->
    <div class="ag-kpi-grid">
      <div class="ag-kpi">
        <div class="ag-kpi-val">${totalRuns}</div>
        <div class="ag-kpi-lbl">Totaal runs</div>
      </div>
      <div class="ag-kpi">
        <div class="ag-kpi-val">${totalLeads}</div>
        <div class="ag-kpi-lbl">Leads gevonden</div>
      </div>
      <div class="ag-kpi">
        <div class="ag-kpi-val">${totalSent}</div>
        <div class="ag-kpi-lbl">Emails verstuurd</div>
      </div>
    </div>

    <!-- Pipeline visualization -->
    <div class="ag-pipeline">
      <div class="ag-pipe-title">Pipeline</div>
      <div class="ag-pipe-row">
        ${AGENTS.map((a, i) => `
          <div class="ag-pipe-node">
            <div class="ag-node-circle" style="background:${a.color}">
              ${a.num}
              <span class="ag-node-dot"></span>
            </div>
            <div class="ag-node-name">${a.name}</div>
          </div>
          ${i < AGENTS.length - 1 ? `<div class="ag-pipe-arrow"><svg width="20" height="12" viewBox="0 0 20 12" fill="none"><path d="M0 6h16M12 1l6 5-6 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : ''}
        `).join('')}
      </div>
    </div>

    <!-- Agent cards 2-column grid -->
    <div class="ag-cards-grid">
      ${AGENTS.map(agent => {
        const s1v = agent.num === 1 ? totalLeads : agent.num === 4 ? ((stats?.avgScore)||'—') : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        const s2v = agent.num === 1 ? totalRuns : agent.num === 7 ? totalLeads * 2 : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        return `
        <div class="ag-card">
          <div class="ag-card-top">
            <div class="ag-num-badge" style="background:${agent.color}">
              <i class="ti ${agent.icon}" style="font-size:17px"></i>
            </div>
            <div class="ag-card-meta">
              <div class="ag-card-name">Agent ${agent.num} — ${agent.name}</div>
              <div class="ag-card-role" style="color:${agent.color}">${agent.role}</div>
            </div>
          </div>
          <div class="ag-card-body">
            <div id="agentRow${agent.num}" class="ag-row-head" style="padding:0;cursor:pointer" onclick="toggleAgentRow(${agent.num})">
              <div class="ag-card-desc" style="flex:1">${agent.desc}</div>
              <i class="ti ti-chevron-down" style="font-size:14px;color:var(--text-3,#666);margin-left:8px;flex-shrink:0;transition:transform .2s"></i>
            </div>
            <div id="agentExpand${agent.num}" class="ag-row-expand">
              <div class="ag-card-stats">
                <div class="ag-stat">
                  <div class="ag-stat-val">${s1v}</div>
                  <div class="ag-stat-lbl">${agent.s1l}</div>
                </div>
                <div class="ag-stat">
                  <div class="ag-stat-val">${s2v}</div>
                  <div class="ag-stat-lbl">${agent.s2l}</div>
                </div>
              </div>
            </div>
          </div>
          <div class="ag-card-footer">
            <button class="btn btn-ghost btn-sm" onclick="showAgentSummary(${agent.num}, '${agent.name}', '${agent.icon}')">
              <i class="ti ti-eye"></i> Prompt
            </button>
            <button class="btn btn-ghost btn-sm" onclick="showAgentLogs(${agent.num})">
              <i class="ti ti-file-text"></i> Logs
            </button>
          </div>
        </div>
        `;
      }).join('')}
    </div>

    <!-- Memory / wat het systeem heeft geleerd -->
    <div class="ag-section">
      <div class="ag-section-head" onclick="const b=document.getElementById('memTableBody');const c=document.getElementById('memChevron');const open=b.style.display!=='none';b.style.display=open?'none':'block';c.style.transform=open?'':'rotate(180deg)'">
        <span class="ag-section-title"><i class="ti ti-brain" style="color:#7C3AED"></i> Wat het systeem heeft geleerd</span>
        <i class="ti ti-chevron-down" id="memChevron" style="color:var(--text-3,#666);transition:transform .2s"></i>
      </div>
      <div id="memTableBody" style="display:none">
        <div class="ag-section-body">
          <p class="ag-section-sub">Agent 4 past scores automatisch aan op basis van historische reply rates per niche + land. Minimaal 5 verstuurde emails nodig voor aanpassing.</p>
          ${memEntries.length === 0 ? `
            <div class="ag-empty"><i class="ti ti-database-off"></i><span>Nog geen data — wordt gevuld na de eerste verstuurde emails</span></div>
          ` : `
          <div style="overflow-x:auto">
            <table class="ag-table">
              <thead><tr>
                <th>Niche</th><th>Land</th><th>Verstuurd</th><th>Reply rate</th><th>Score ±</th><th>A/B auto</th>
              </tr></thead>
              <tbody>
                ${memEntries.map(m => {
                  const cappedRate = Math.min(100, m.replyRate || 0);
                  const tooFewData = m.sent < 5;
                  let adj = '—', adjColor = 'var(--text-3,#666)';
                  if (!tooFewData) {
                    if (cappedRate > 20) { adj = '+0.5'; adjColor = '#16A34A'; }
                    else if (cappedRate < 5) { adj = '-0.3'; adjColor = '#DC2626'; }
                    else { adj = '0'; adjColor = 'var(--text-2,#999)'; }
                  }
                  const abKey = `${(m.niche||'unknown').toLowerCase().replace(/[^a-z]/g,'')}_${(m.country||'unknown').toLowerCase().replace(/[^a-z]/g,'')}`;
                  const abCell = m.autoPickVersion
                    ? `<span style="color:var(--accent,#2563EB);font-weight:600">Versie ${m.autoPickVersion} wint</span> <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;margin-left:4px" onclick="resetAbMemory('${abKey}')">Reset</button>`
                    : `<span style="color:var(--text-3,#666);font-size:12px">—</span>`;
                  return `<tr>
                    <td>${nicheBadge(m.niche)}</td>
                    <td>${m.country}</td>
                    <td>${m.sent}</td>
                    <td>${tooFewData ? `<span style="color:var(--text-3,#666);font-size:12px">te weinig data</span>` : `${cappedRate}%`}</td>
                    <td style="font-weight:600;color:${adjColor}">${adj}</td>
                    <td>${abCell}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          `}
        </div>
      </div>
    </div>

    <!-- Conversie-intelligentie (ML) -->
    <div class="ag-section">
      <div class="ag-section-head" style="cursor:default">
        <span class="ag-section-title"><i class="ti ti-brain" style="color:#7C3AED"></i> Conversie-intelligentie (ML)</span>
      </div>
      <div class="ag-section-body">
        <p class="ag-section-sub">Agent 4 past scores automatisch aan op basis van historische conversiedata (welke leads werden klant vs. verloren).</p>
        ${(() => {
          const mlEntries = memEntries.filter(m => (m.converted || 0) + (m.lost || 0) >= 1);
          const totalConverted = mlEntries.reduce((s, m) => s + (m.converted||0), 0);
          const totalLost = mlEntries.reduce((s, m) => s + (m.lost||0), 0);
          const totalMl = totalConverted + totalLost;
          const avgRate = totalMl > 0 ? Math.round((totalConverted / totalMl) * 100) : 0;
          return `
            <div class="ag-ml-grid">
              <div class="ag-ml-stat">
                <div class="ag-ml-val" style="color:#16A34A">${totalConverted}</div>
                <div class="ag-ml-lbl">Klanten gewonnen</div>
              </div>
              <div class="ag-ml-stat">
                <div class="ag-ml-val" style="color:#DC2626">${totalLost}</div>
                <div class="ag-ml-lbl">Verloren leads</div>
              </div>
              <div class="ag-ml-stat">
                <div class="ag-ml-val">${avgRate}%</div>
                <div class="ag-ml-lbl">Gem. conversieratio</div>
              </div>
              <div class="ag-ml-stat">
                <div class="ag-ml-val">${mlEntries.length}</div>
                <div class="ag-ml-lbl">Niches met data</div>
              </div>
            </div>
            ${mlEntries.length === 0 ? `
              <div class="ag-empty"><i class="ti ti-chart-line"></i><span>Nog geen conversiedata — wordt gevuld zodra leads klant worden of verloren gaan.</span></div>
            ` : `
            <div style="overflow-x:auto">
              <table class="ag-table">
                <thead><tr>
                  <th>Niche</th><th>Land</th><th>Klanten</th><th>Verloren</th><th>Conversieratio</th><th>Score boost</th><th>Beste profiel</th>
                </tr></thead>
                <tbody>
                  ${mlEntries.map(m => {
                    const total = (m.converted || 0) + (m.lost || 0);
                    const rate = m.conversionRate || 0;
                    let boostVal = 0, boostColor = 'var(--text-2,#999)';
                    if (total >= 3) {
                      if (rate > 15) { boostVal = 1.0; boostColor = '#16A34A'; }
                      else if (rate > 8) { boostVal = 0.5; boostColor = '#16A34A'; }
                      else if (rate < 3 && total >= 5) { boostVal = -0.5; boostColor = '#DC2626'; }
                    }
                    const profileParts = [];
                    if (m.bestFollowerRange) profileParts.push(`${m.bestFollowerRange} volgers`);
                    if (m.bestWebsiteScore && m.bestWebsiteScore !== 'unknown') profileParts.push(`website ${m.bestWebsiteScore}`);
                    return `<tr>
                      <td>${nicheBadge(m.niche)}</td>
                      <td>${m.country}</td>
                      <td style="color:#16A34A;font-weight:600">${m.converted || 0}</td>
                      <td style="color:#DC2626">${m.lost || 0}</td>
                      <td>${total < 3 ? '<span style="color:var(--text-3,#666);font-size:12px">te weinig data</span>' : `${rate}%`}</td>
                      <td style="font-weight:600;color:${boostColor}">${boostVal !== 0 ? (boostVal > 0 ? '+' : '') + boostVal : '—'}</td>
                      <td style="font-size:12px;color:var(--text-3,#666)">${profileParts.length ? profileParts.join(', ') : '—'}</td>
                    </tr>`;
                  }).join('')}
                </tbody>
              </table>
            </div>
            `}
          `;
        })()}
      </div>
    </div>

    <!-- A/B email statistieken -->
    <div class="ag-section">
      <div class="ag-section-head" style="cursor:default">
        <span class="ag-section-title"><i class="ti ti-ab" style="color:var(--accent,#2563EB)"></i> Agent 5 — A/B email statistieken</span>
      </div>
      <div class="ag-section-body">
        <p class="ag-section-sub">Elke lead krijgt 2 email versies: A (probleem-gericht) en B (groeikansen-gericht). Kies per lead welke je verstuurt.</p>
        ${(() => {
          const ab = stats?.abStats || { aApproved: 0, bApproved: 0 };
          const total = (ab.aApproved || 0) + (ab.bApproved || 0);
          const pctA = total > 0 ? Math.round((ab.aApproved / total) * 100) : 0;
          const pctB = total > 0 ? Math.round((ab.bApproved / total) * 100) : 0;
          const winner = total >= 5 ? (ab.aApproved > ab.bApproved ? 'A' : ab.bApproved > ab.aApproved ? 'B' : 'gelijk') : null;
          return `
            <div class="ag-ab-grid">
              <div class="ag-ab-card">
                <div class="ag-ab-val" style="color:var(--accent,#2563EB)">${ab.aApproved || 0}</div>
                <div class="ag-ab-lbl">Versie A goedgekeurd</div>
                <div class="ag-ab-sub">Probleem-gericht</div>
              </div>
              <div class="ag-ab-card">
                <div class="ag-ab-val" style="color:#7C3AED">${ab.bApproved || 0}</div>
                <div class="ag-ab-lbl">Versie B goedgekeurd</div>
                <div class="ag-ab-sub">Groeikansen-gericht</div>
              </div>
            </div>
            ${total >= 5 ? `
              <div class="ag-ab-winner">
                <strong>${winner === 'gelijk' ? 'Gelijkspel' : `Versie ${winner} wint`}</strong> — ${pctA}% kiest A, ${pctB}% kiest B
              </div>
            ` : `<div style="font-size:12px;color:var(--text-3,#666)">Minimaal 5 goedkeuringen nodig voor statistieken</div>`}
          `;
        })()}
      </div>
    </div>
  `;

}

function toggleAgentRow(num) {
  const row = document.getElementById(`agentRow${num}`);
  const expand = document.getElementById(`agentExpand${num}`);
  if (!row || !expand) return;
  const isOpen = row.classList.contains('open');
  row.classList.toggle('open', !isOpen);
  expand.classList.toggle('open', !isOpen);
}

function showAgentLogs(num) {
  const runs = (window._agentLogsRuns || []).slice(-10).reverse();
  const rows = runs.length
    ? runs.map(r => `<tr><td style="font-size:11px;color:var(--text-muted)">${new Date(r.startedAt||r.date||'').toLocaleDateString('nl-NL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}</td><td>${r.leadsFound||0} leads</td><td>${r.emailsSent||0} emails</td></tr>`).join('')
    : `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:16px">Nog geen runs</td></tr>`;
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">Agent ${num} — Logs</h3>
      <button class="btn btn-ghost btn-sm" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body">
      <table class="table"><thead><tr><th>Datum</th><th>Leads</th><th>Emails</th></tr></thead>
      <tbody>${rows}</tbody></table>
    </div>`);
}

async function showAgentSummary(num, name, icon) {
  openModal(`
    <div class="modal-header">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="agent-icon-wrap" style="width:32px;height:32px">
          <i class="ti ${icon}" style="font-size:15px"></i>
        </div>
        <h3 class="modal-title">Agent ${num} — ${name}</h3>
      </div>
      <button class="btn-icon" onclick="closeModal()"><i class="ti ti-x"></i></button>
    </div>
    <div class="modal-body" id="agentSummaryBody">
      <div style="text-align:center;padding:32px 0">
        <div class="spinner-lg" style="margin:0 auto 12px"></div>
        <p class="text-secondary" style="font-size:13px">Samenvatting genereren...</p>
      </div>
    </div>
  `);

  const PROMPTS = {
    1: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 1 (Lead Finder) precies doet. Beschrijf: welke input het krijgt, hoe het bedrijven kiest, welke velden het teruggeeft (companyName, location, niche, followers, website, companySize) en hoe het bijdraagt aan de totale pipeline. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    2: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 2 (Website Checker) precies doet. Beschrijf: hoe het de website technisch analyseert (laadtijd, HTTPS, mobile, CTA, boekingssysteem), welke problemen het detecteert en hoe die data wordt doorgegeven aan de volgende agents. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    3: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 3 (Social Analyzer) precies doet. Beschrijf: hoe het engagement, postfrequentie en groeipotentieel inschat, hoe het de gepersonaliseerde emailOpener genereert en waarom die opener zo belangrijk is voor de conversie. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    4: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 4 (Opportunity Scorer) precies doet. Beschrijf: hoe het alle data van agents 1-3 combineert tot een score (1-10), hoe het de beste diensten koppelt aan het bedrijf, hoe urgency wordt bepaald en wat de estimatedValue betekent. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    5: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 5 (Email Writer) precies doet. Beschrijf: hoe het de emailOpener van Agent 3 gebruikt als opening, hoe taal (NL/EN) en bedrijfsgrootte (small/medium/large) de aanhef bepalen, welke stijlregels gelden (geen bullets, geen jargon, max 120 woorden) en hoe het uiteindelijke email eruit ziet. Schrijf in het Nederlands, zakelijk maar toegankelijk.`,
    6: `Je bent een AI-outreach systeem. Leg in 4-5 zinnen uit wat Agent 6 (LinkedIn DM Writer) precies doet. Beschrijf: hoe het een korte, menselijke LinkedIn DM schrijft (max 280 tekens), welke toon het aanhoudt, hoe het verschilt van de email en hoe de DM klaar staat om direct in LinkedIn te plakken. Schrijf in het Nederlands, zakelijk maar toegankelijk.`
  };

  const result = await claudeCall(PROMPTS[num] || `Beschrijf agent ${num} (${name}) in 4-5 zinnen.`);
  const body = document.getElementById('agentSummaryBody');
  if (!body) return;
  if (!result || result.error) {
    body.innerHTML = `<p class="text-secondary" style="font-size:14px">Kon geen samenvatting laden. Controleer of CLAUDE_API_KEY is ingesteld.</p>`;
    return;
  }
  const text = typeof result === 'string' ? result : result.result || JSON.stringify(result);
  body.innerHTML = `<p style="font-size:14px;line-height:1.75;color:var(--text-primary)">${text.replace(/\n/g,'<br>')}</p>`;
}

async function resetAbMemory(key) {
  if (!confirm('A/B data resetten voor deze niche? De auto-pick wordt gewist en beide versies worden weer afgewisseld.')) return;
  const res = await api(`/api/memory/${encodeURIComponent(key)}/reset-ab`, { method: 'POST' });
  if (res.ok) { toast('A/B reset — beide versies worden weer afgewisseld', 'success'); setView('agents'); }
  else toast('Reset mislukt', 'error');
}

