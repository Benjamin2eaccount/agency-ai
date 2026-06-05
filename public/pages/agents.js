// ─── Agents tab ───────────────────────────────────────────────────────────────

async function renderAgents() {
  const AGENTS = [
    { num: 1, color: '#2563eb', icon: 'ti-search',          name: 'Lead Finder',        role: 'Genereert bedrijven per dag',           desc: 'Vraagt Claude om realistische bedrijven te genereren die baat hebben bij AI-marketing. Mixt niches (beauty, food, fitness, retail, restaurant) en locaties (NL, BE, DE, UK, VS).', s1l: 'Gevonden', s2l: 'Runs' },
    { num: 2, color: '#7c3aed', icon: 'ti-world',           name: 'Website Checker',    role: 'Analyseert website technisch',           desc: 'Bezoekt de website van elk bedrijf, meet laadtijd, controleert HTTPS, mobile viewport, aanwezigheid van CTA en boekingssysteem. Genereert concrete verbeterpunten.', s1l: 'Gecheckt', s2l: 'Problemen' },
    { num: 3, color: '#16a34a', icon: 'ti-brand-instagram', name: 'Social Analyzer',    role: 'Analyseert social media',               desc: 'Schat engagement rate, postfrequentie en groeipotentieel in. Genereert een gepersonaliseerde email-opener gebaseerd op echte observaties over het account.', s1l: 'Geanalyseerd', s2l: 'Openers' },
    { num: 4, color: '#0891b2', icon: 'ti-chart-bar',       name: 'Opportunity Scorer', role: 'Score 1–10 + aanbevolen diensten',      desc: 'Combineert website- en social data om een kwaliteitsscore te berekenen. Koppelt de beste diensten aan het bedrijf en schat de maandelijkse pipeline waarde.', s1l: 'Gescoord', s2l: 'Gem. score' },
    { num: 5, color: '#dc2626', icon: 'ti-mail',            name: 'Email Writer',       role: 'Schrijft gepersonaliseerde koude email', desc: 'Schrijft een menselijke koude email in de taal van het bedrijf (NL, EN, DE, FR of IT). Max 120 woorden, informele toon, begint met de gepersonaliseerde opener van Agent 3.', s1l: 'Geschreven', s2l: 'Verstuurd' },
    { num: 6, color: '#0284c7', icon: 'ti-brand-linkedin',  name: 'LinkedIn DM Writer', role: 'Schrijft LinkedIn DM (max 280 tekens)',  desc: 'Schrijft een korte, directe LinkedIn DM in de taal van het bedrijf. Max 280 tekens, vriendelijk en specifiek. Klaar om te plakken in LinkedIn.', s1l: "DM's geschreven", s2l: 'Verstuurd' },
    { num: 7, color: '#d97706', icon: 'ti-chart-dots',      name: 'Competitor Analyzer',role: 'Analyseert lokale concurrenten',         desc: 'Genereert 2-3 realistische concurrenten voor het bedrijf in hun stad of regio. Analyseert hun voordelen (ads, website, reviews). Agent 5 gebruikt dit om een concurrentie-hook toe te voegen aan de email.', s1l: 'Geanalyseerd', s2l: 'Concurrenten' }
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
    <div class="page-header">
      <div>
        <div class="page-label">Automatisering</div>
        <h1 class="page-title">Agents</h1>
      </div>
    </div>

    <div class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-refresh"></i></div>
        <div class="stat-value">${totalRuns}</div>
        <div class="stat-label">Totaal runs</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-users"></i></div>
        <div class="stat-value">${totalLeads}</div>
        <div class="stat-label">Leads gevonden</div>
      </div>
      <div class="stat-card">
        <div class="stat-icon"><i class="ti ti-send"></i></div>
        <div class="stat-value">${totalSent}</div>
        <div class="stat-label">Emails verstuurd</div>
      </div>
    </div>

    <div class="agents-list" id="agentsList">
      ${AGENTS.map((agent, i) => {
        const s1v = agent.num === 1 ? totalLeads : agent.num === 4 ? ((stats?.avgScore)||'—') : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        const s2v = agent.num === 1 ? totalRuns : agent.num === 7 ? totalLeads * 2 : agent.num === 5 || agent.num === 6 ? totalSent : totalLeads;
        return `
        <div class="agent-entry">
          <div class="agent-row" id="agentRow${agent.num}" onclick="toggleAgentRow(${agent.num})">
            <div class="agent-num-circle" style="background:${agent.color}">${agent.num}</div>
            <div class="agent-row-icon" style="background:${agent.color}18;border:1px solid ${agent.color}30;color:${agent.color}">
              <i class="ti ${agent.icon}"></i>
            </div>
            <div class="agent-row-info">
              <div class="agent-row-name">${agent.name}</div>
              <div class="agent-row-role" style="color:${agent.color}">${agent.role}</div>
            </div>
            <div class="agent-row-stats">
              <div class="agent-row-stat">
                <div class="agent-row-stat-lbl">${agent.s1l}</div>
                <div class="agent-row-stat-val">${s1v}</div>
              </div>
              <div class="agent-row-stat">
                <div class="agent-row-stat-lbl">${agent.s2l}</div>
                <div class="agent-row-stat-val">${s2v}</div>
              </div>
            </div>
            <button class="agent-row-chevron" onclick="event.stopPropagation();toggleAgentRow(${agent.num})">
              <i class="ti ti-chevron-down"></i>
            </button>
          </div>
          <div class="agent-expand" id="agentExpand${agent.num}">
            <div class="agent-expand-inner">
              <div class="agent-expand-desc">${agent.desc}</div>
              <div class="agent-expand-actions">
                <button class="btn btn-ghost btn-sm" onclick="showAgentSummary(${agent.num}, '${agent.name}', '${agent.icon}')">
                  <i class="ti ti-eye"></i> Bekijk prompt
                </button>
                <button class="btn btn-ghost btn-sm" onclick="showAgentLogs(${agent.num})">
                  <i class="ti ti-file-text"></i> Logs
                </button>
              </div>
            </div>
          </div>
        </div>
        ${i < AGENTS.length - 1 ? '<div class="agent-dashed-gap"></div>' : ''}
      `}).join('')}
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header" style="cursor:pointer;user-select:none" onclick="const b=document.getElementById('memTableBody');const c=document.getElementById('memChevron');const open=b.style.display!=='none';b.style.display=open?'none':'';c.style.transform=open?'':'rotate(90deg)'">
        <h3 class="card-title"><i class="ti ti-brain" style="color:#7c3aed;margin-right:6px"></i> Wat het systeem heeft geleerd</h3>
        <i class="ti ti-chevron-right" id="memChevron" style="color:var(--text-muted);transition:transform 0.2s"></i>
      </div>
      <div id="memTableBody" style="display:none">
        <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Agent 4 past scores automatisch aan op basis van historische reply rates per niche + land. Minimaal 5 verstuurde emails nodig voor aanpassing.</p>
        ${memEntries.length === 0 ? `
          <div class="empty-state">
            <i class="ti ti-database-off"></i>
            <p>Nog geen data — wordt gevuld na de eerste verstuurde emails</p>
          </div>
        ` : `
        <div style="overflow-x:auto">
          <table class="table">
            <thead><tr>
              <th>Niche</th><th>Land</th><th>Leads verstuurd</th><th>Reply rate</th><th>Score aanpassing</th><th>A/B auto</th>
            </tr></thead>
            <tbody>
              ${memEntries.map(m => {
                const cappedRate = Math.min(100, m.replyRate || 0);
                const tooFewData = m.sent < 5;
                let adj = '—', adjClass = 'text-secondary';
                if (!tooFewData) {
                  if (cappedRate > 20) { adj = '+0.5'; adjClass = 'text-success'; }
                  else if (cappedRate < 5) { adj = '-0.3'; adjClass = 'text-danger'; }
                  else { adj = '0'; adjClass = ''; }
                }
                const abKey = `${(m.niche||'unknown').toLowerCase().replace(/[^a-z]/g,'')}_${(m.country||'unknown').toLowerCase().replace(/[^a-z]/g,'')}`;
                const abCell = m.autoPickVersion
                  ? `<span style="color:var(--accent);font-weight:600">Versie ${m.autoPickVersion} wint</span> <button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:11px;margin-left:4px" onclick="resetAbMemory('${abKey}')">Reset</button>`
                  : `<span class="text-muted" style="font-size:12px">—</span>`;
                return `<tr>
                  <td>${nicheBadge(m.niche)}</td>
                  <td>${m.country}</td>
                  <td>${m.sent}</td>
                  <td>${tooFewData ? `<span class="text-muted" style="font-size:12px">te weinig data</span>` : `${cappedRate}%`}</td>
                  <td class="${adjClass}" style="font-weight:600">${adj}</td>
                  <td>${abCell}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        `}
      </div>
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-brain" style="color:#7c3aed;margin-right:6px"></i> Conversie-intelligentie (ML)</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Agent 4 past scores automatisch aan op basis van historische conversiedata (welke leads werden klant vs. verloren).</p>
      ${(() => {
        const mlEntries = memEntries.filter(m => (m.converted || 0) + (m.lost || 0) >= 1);
        if (mlEntries.length === 0) return `<div class="empty-state" style="padding:20px"><i class="ti ti-chart-line"></i><p>Nog geen conversiedata — wordt gevuld zodra leads klant worden of verloren gaan.</p></div>`;
        return `<div style="overflow-x:auto">
          <table class="table">
            <thead><tr>
              <th>Niche</th><th>Land</th><th>Klanten</th><th>Verloren</th><th>Conversieratio</th><th>Score boost</th><th>Beste profiel</th>
            </tr></thead>
            <tbody>
              ${mlEntries.map(m => {
                const total = (m.converted || 0) + (m.lost || 0);
                const rate = m.conversionRate || 0;
                let boostVal = 0, boostClass = '';
                if (total >= 3) {
                  if (rate > 15) { boostVal = 1.0; boostClass = 'text-success'; }
                  else if (rate > 8) { boostVal = 0.5; boostClass = 'text-success'; }
                  else if (rate < 3 && total >= 5) { boostVal = -0.5; boostClass = 'text-danger'; }
                }
                const profileParts = [];
                if (m.bestFollowerRange) profileParts.push(`${m.bestFollowerRange} volgers`);
                if (m.bestWebsiteScore && m.bestWebsiteScore !== 'unknown') profileParts.push(`website ${m.bestWebsiteScore}`);
                return `<tr>
                  <td>${nicheBadge(m.niche)}</td>
                  <td>${m.country}</td>
                  <td style="color:var(--success);font-weight:600">${m.converted || 0}</td>
                  <td style="color:var(--danger)">${m.lost || 0}</td>
                  <td>${total < 3 ? '<span class="text-muted" style="font-size:12px">te weinig data</span>' : `${rate}%`}</td>
                  <td class="${boostClass}" style="font-weight:600">${boostVal !== 0 ? (boostVal > 0 ? '+' : '') + boostVal : '—'}</td>
                  <td style="font-size:12px;color:var(--text-secondary)">${profileParts.length ? profileParts.join(', ') : '—'}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
      })()}
    </div>

    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <h3 class="card-title"><i class="ti ti-ab" style="color:var(--accent);margin-right:6px"></i> Agent 5 — A/B email statistieken</h3>
      </div>
      <p class="text-secondary" style="font-size:13px;margin-bottom:14px">Elke lead krijgt 2 email versies: A (probleem-gericht) en B (groeikansen-gericht). Kies per lead welke je verstuurt.</p>
      ${(() => {
        const ab = stats?.abStats || { aApproved: 0, bApproved: 0 };
        const total = (ab.aApproved || 0) + (ab.bApproved || 0);
        const pctA = total > 0 ? Math.round((ab.aApproved / total) * 100) : 0;
        const pctB = total > 0 ? Math.round((ab.bApproved / total) * 100) : 0;
        const winner = total >= 5 ? (ab.aApproved > ab.bApproved ? 'A' : ab.bApproved > ab.aApproved ? 'B' : 'gelijk') : null;
        return `
          <div class="ab-stats-grid">
            <div class="ab-stat-card">
              <div class="ab-stat-value">${ab.aApproved || 0}</div>
              <div class="ab-stat-label">Versie A goedgekeurd</div>
              <div class="ab-stat-sub">Probleem-gericht</div>
            </div>
            <div class="ab-stat-card">
              <div class="ab-stat-value" style="color:#7c3aed">${ab.bApproved || 0}</div>
              <div class="ab-stat-label">Versie B goedgekeurd</div>
              <div class="ab-stat-sub">Groeikansen-gericht</div>
            </div>
          </div>
          ${total >= 5 ? `
            <div class="ab-winner-banner">
              <strong>${winner === 'gelijk' ? 'Gelijkspel' : `Versie ${winner} wint`}</strong> — ${pctA}% kiest A, ${pctB}% kiest B
            </div>
          ` : `<div class="text-muted" style="font-size:12px">Minimaal 5 goedkeuringen nodig voor statistieken</div>`}
        `;
      })()}
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

