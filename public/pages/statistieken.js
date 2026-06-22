// ─── Statistics ───────────────────────────────────────────────────────────────

let _statsCharts = [];
function destroyStatsCharts() {
  _statsCharts.forEach(c => { try { c.destroy(); } catch {} });
  _statsCharts = [];
}

function _sparkSVG(vals, color, w, h) {
  w = w || 80; h = h || 28;
  if (!vals || vals.length < 2) return '<svg width="' + w + '" height="' + h + '"></svg>';
  var min = Math.min.apply(null, vals), range = Math.max.apply(null, vals) - min || 1;
  var pts = vals.map(function(v, i) {
    var x = ((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1);
    var y = (h - 3 - ((v - min) / range) * (h - 6)).toFixed(1);
    return x + ',' + y;
  }).join(' ');
  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" fill="none" style="display:block"><polyline points="' + pts + '" stroke="' + color + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}

function _agentCircle(pct, color) {
  var r = 20, cx = 28, cy = 28, circ = 2 * Math.PI * r;
  var filled = (Math.min(100, Math.max(0, pct)) / 100 * circ).toFixed(2);
  return '<svg width="56" height="56" viewBox="0 0 56 56" style="display:block;margin:0 auto">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="#2a2a2a" stroke-width="5"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="5"' +
    ' stroke-dasharray="' + filled + ' ' + circ.toFixed(2) + '" stroke-linecap="round"' +
    ' transform="rotate(-90 ' + cx + ' ' + cy + ')"/>' +
    '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="middle"' +
    ' font-size="9" font-weight="700" fill="#f5f5f5">' + Math.round(pct) + '%</text>' +
    '</svg>';
}

async function renderStats() {
  destroyStatsCharts();
  document.getElementById('appView').innerHTML = `
    <style>
      .sp-header{display:flex;justify-content:space-between;align-items:flex-start;padding:0 0 24px;flex-wrap:wrap;gap:12px}
      .sp-eyebrow{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px}
      .sp-header h1{font-size:26px;font-weight:700;color:var(--text-primary);margin:0}
      .sp-hdr-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .sp-range-sel{background:var(--surface-2);border:1px solid var(--border);color:var(--text-primary);font-size:13px;padding:7px 12px;border-radius:var(--radius);cursor:pointer;outline:none}
      .sp-range-sel:focus{border-color:var(--accent)}
      .sp-gh-btn{background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-size:12px;padding:7px 11px;border-radius:var(--radius);cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:.15s;white-space:nowrap;text-decoration:none;font-family:inherit}
      .sp-gh-btn:hover{border-color:var(--accent);color:var(--text-primary)}
      .sp-load{display:flex;justify-content:center;align-items:center;min-height:300px;color:var(--text-secondary)}
      .sp-kpi-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:16px}
      @media(max-width:1200px){.sp-kpi-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:768px){.sp-kpi-grid{grid-template-columns:repeat(2,1fr)}}
      .sp-kpi{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px;overflow:hidden;transition:border-color .15s}
      .sp-kpi:hover{border-color:var(--border-strong)}
      .sp-kpi-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
      .sp-kpi-icon{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px}
      .sp-kpi-trend{font-size:11px;font-weight:600;padding:2px 7px;border-radius:99px}
      .sp-kpi-trend.up{background:rgba(74,222,128,.1);color:#4ade80}
      .sp-kpi-trend.dn{background:rgba(248,113,113,.1);color:#f87171}
      .sp-kpi-trend.nt{background:rgba(255,255,255,.06);color:#666}
      .sp-kpi-val{font-size:22px;font-weight:700;color:var(--text-primary);line-height:1.1;margin-bottom:3px}
      .sp-kpi-lbl{font-size:12px;color:var(--text-secondary);margin-bottom:10px}
      .sp-kpi-spark{height:28px}
      .sp-charts-main{display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:12px}
      @media(max-width:900px){.sp-charts-main{grid-template-columns:1fr}}
      .sp-charts-sec{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
      @media(max-width:900px){.sp-charts-sec{grid-template-columns:1fr}}
      .sp-charts-half{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
      @media(max-width:768px){.sp-charts-half{grid-template-columns:1fr}}
      .sp-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden}
      .sp-ch{display:flex;justify-content:space-between;align-items:center;padding:16px 20px 0}
      .sp-ct{font-size:13px;font-weight:600;color:var(--text-primary)}
      .sp-cs{font-size:11px;color:var(--text-secondary)}
      .sp-cb{padding:12px 20px 20px}
      .sp-sec-hdr{display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px}
      .sp-sec-ttl{font-size:14px;font-weight:700;color:var(--text-primary);display:flex;align-items:center;gap:6px}
      .sp-sec-sub{font-size:11px;color:var(--text-secondary)}
      .sp-ab-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
      @media(max-width:600px){.sp-ab-row{grid-template-columns:1fr}}
      .sp-ab-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;position:relative}
      .sp-ab-card.winner{border-color:#2563eb}
      .sp-ab-wb{position:absolute;top:14px;right:14px;background:#2563eb;color:#fff;font-size:10px;font-weight:700;padding:3px 9px;border-radius:99px}
      .sp-ab-v{font-size:22px;font-weight:800;color:var(--text-primary);margin-bottom:2px}
      .sp-ab-s{font-size:12px;color:var(--text-secondary);margin-bottom:14px}
      .sp-ab-ms{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .sp-ab-mv{font-size:18px;font-weight:700;color:var(--text-primary)}
      .sp-ab-mv.hl{color:#60a5fa}
      .sp-ab-ml{font-size:10px;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.05em;margin-top:2px}
      .sp-fin-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px}
      @media(max-width:900px){.sp-fin-row{grid-template-columns:1fr}}
      .sp-fin-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px}
      .sp-fin-ttl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--text-secondary);margin-bottom:14px}
      .sp-fin-line{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px}
      .sp-fin-line:last-child{border:none}
      .sp-fin-lbl{color:var(--text-secondary)}
      .sp-fin-val{font-weight:600;color:var(--text-primary)}
      .sp-fin-val.pos{color:#4ade80}
      .sp-fin-val.neg{color:#f87171}
      .sp-forecast-trk{height:8px;background:var(--border);border-radius:99px;overflow:hidden;margin:10px 0 4px}
      .sp-forecast-fill{height:100%;background:#2563eb;border-radius:99px;transition:width .6s}
      .sp-forecast-meta{display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary)}
      .sp-agents-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:10px;margin-bottom:12px}
      @media(max-width:1100px){.sp-agents-grid{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:600px){.sp-agents-grid{grid-template-columns:repeat(2,1fr)}}
      .sp-agent{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 12px;text-align:center}
      .sp-agent-name{font-size:11px;font-weight:600;color:var(--text-primary);margin-top:8px;line-height:1.3}
      .sp-agent-val{font-size:11px;color:var(--text-secondary);margin-top:2px}
      .sp-pnl-tbl{width:100%;border-collapse:collapse;font-size:12px}
      .sp-pnl-tbl th{padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-secondary);border-bottom:1px solid var(--border);text-align:right}
      .sp-pnl-tbl th:first-child{text-align:left}
      .sp-pnl-tbl td{padding:9px 14px;border-bottom:1px solid var(--border);text-align:right}
      .sp-pnl-tbl td:first-child{text-align:left;font-weight:600}
      .sp-pnl-tbl tr:last-child td{border:none}
      .sp-pnl-tbl tr:hover td{background:var(--surface-2)}
      .sp-pos{color:#4ade80;font-weight:600}
      .sp-neg{color:#f87171;font-weight:600}
      .sp-ab-tbl{width:100%;border-collapse:collapse;font-size:12px;margin-top:12px}
      .sp-ab-tbl th{padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-secondary);border-bottom:1px solid var(--border);text-align:right}
      .sp-ab-tbl th:first-child{text-align:left}
      .sp-ab-tbl td{padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;text-transform:capitalize}
      .sp-ab-tbl td:first-child{text-align:left;font-weight:600}
      .sp-ab-tbl tr:last-child td{border:none}
      .sp-ab-nw{background:#2563eb;color:#fff;font-size:10px;padding:2px 7px;border-radius:99px;font-weight:700}
      .sp-niche-tbl{width:100%;border-collapse:collapse;font-size:13px}
      .sp-niche-tbl th{padding:10px 14px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-secondary);border-bottom:1px solid var(--border);text-align:right}
      .sp-niche-tbl th:first-child{text-align:left}
      .sp-niche-tbl td{padding:10px 14px;border-bottom:1px solid var(--border);color:var(--text-primary);text-align:right}
      .sp-niche-tbl td:first-child{text-align:left;font-weight:600}
      .sp-niche-tbl tr:last-child td{border:none}
      .sp-niche-tbl tr:hover td{background:var(--surface-2)}
      .sp-rr-pill{font-size:11px;font-weight:700;padding:2px 7px;border-radius:99px}
      .sp-rr-h{background:rgba(74,222,128,.12);color:#4ade80}
      .sp-rr-m{background:rgba(251,191,36,.12);color:#fbbf24}
      .sp-rr-l{background:rgba(255,255,255,.06);color:#666}
      .sp-funnel-card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:20px;margin-bottom:12px}
      .sp-funnel-ttl{font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:16px;display:flex;align-items:center;gap:6px}
      .sp-funnel-stage{margin-bottom:10px}
      .sp-funnel-info{display:flex;justify-content:space-between;align-items:center;margin-bottom:4px}
      .sp-funnel-name{font-size:12px;font-weight:600;color:var(--text-primary)}
      .sp-funnel-stat{font-size:12px;color:var(--text-secondary)}
      .sp-funnel-trk{height:24px;background:var(--surface-2);border-radius:6px;overflow:hidden}
      .sp-funnel-bar{height:100%;border-radius:6px;display:flex;align-items:center;padding-left:8px;transition:width .6s ease}
      .sp-funnel-blbl{font-size:10px;font-weight:700;color:#fff}
      .sp-funnel-drop{text-align:right;font-size:11px;color:var(--text-secondary);margin-top:2px}
      .sp-subj-tbl{width:100%;border-collapse:collapse;font-size:12px}
      .sp-subj-tbl th{padding:8px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--text-secondary);border-bottom:1px solid var(--border)}
      .sp-subj-tbl th:not(:first-child){text-align:right}
      .sp-subj-tbl td{padding:8px 12px;border-bottom:1px solid var(--border)}
      .sp-subj-tbl td:not(:first-child){text-align:right}
      .sp-subj-tbl tr:last-child td{border:none}
      .sp-subj-tbl tr:hover td{background:var(--surface-2)}
      .sp-rr-bar-row{margin-bottom:10px}
      .sp-rr-bar-info{display:flex;justify-content:space-between;margin-bottom:4px;font-size:12px}
      .sp-rr-bar-trk{height:6px;background:var(--surface-2);border-radius:99px;overflow:hidden}
      .sp-rr-bar-fill{height:100%;border-radius:99px;background:#2563eb}
    </style>
    <div class="sp-header">
      <div>
        <div class="sp-eyebrow">Analyse</div>
        <h1>Statistieken</h1>
      </div>
      <div class="sp-hdr-actions">
        <select class="sp-range-sel" id="statsRangeSelect">
          <option value="7">Afgelopen 7 dagen</option>
          <option value="30" selected>Afgelopen 30 dagen</option>
          <option value="90">Afgelopen 90 dagen</option>
          <option value="365">Dit jaar</option>
        </select>
        <button class="sp-gh-btn" onclick="showPeriodComparison()"><i class="ti ti-git-compare"></i> Vergelijk</button>
        <button class="sp-gh-btn" onclick="showHeatmap()">🔥 Heatmap</button>
        <button class="sp-gh-btn" onclick="showTopSubjects()">📧 Subjects</button>
        <a href="/api/stats/export.csv" class="sp-gh-btn" download>↓ Exporteer</a>
      </div>
    </div>
    <div id="statsBody"><div class="sp-load"><div class="spinner"></div></div></div>
    <div id="statsFunnel"></div>
    <div id="statsNiche"></div>
  `;

  document.getElementById('statsRangeSelect').addEventListener('change', function(e) {
    loadStatsData(parseInt(e.target.value));
  });

  loadStatsData(30);
  renderFunnelChart();
  showNicheComparison();
}

async function loadStatsData(days) {
  destroyStatsCharts();
  const [summary, detail, pnl, ab, topSubj] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON('/api/stats/detailed?days=' + days),
    apiJSON('/api/stats/pnl'),
    apiJSON('/api/stats/ab'),
    apiJSON('/api/stats/top-subjects')
  ]);
  if (!summary || !detail) return;
  const pnlData = pnl || { months: [], totalRevenue: 0, totalCosts: 0, totalProfit: 0, margin: 0 };
  const abData = ab || null;
  const subjects = (topSubj || {}).subjects || [];

  const body = document.getElementById('statsBody');
  if (!body) return;

  const fmt = function(n) { n = Number(n) || 0; return n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n); };
  const fmtEur = function(n) { return '€' + (n >= 1000 ? (n/1000).toFixed(0) + 'K' : String(Math.round(n || 0))); };
  const fmtEurFull = function(n) { return '€' + Math.round(n || 0).toLocaleString('nl-NL'); };

  const replyRate = summary.emailsSent > 0 ? Math.round(summary.replies / summary.emailsSent * 100) : 0;

  // sparkline data
  const spk = detail.leadsPerDay.map(function(d) { return d.count; });
  const half = Math.floor(spk.length / 2);
  const f1 = spk.slice(0, half).reduce(function(a,b){return a+b;}, 0);
  const f2 = spk.slice(half).reduce(function(a,b){return a+b;}, 0);
  const leadsTrend = f1 > 0 ? Math.round((f2 - f1) / f1 * 100) : 0;
  const pnlSpk = pnlData.months.slice(-6).map(function(m){return m.revenue;});

  function trendBadge(v) {
    if (v > 0) return '<span class="sp-kpi-trend up">+' + v + '%</span>';
    if (v < 0) return '<span class="sp-kpi-trend dn">' + v + '%</span>';
    return '<span class="sp-kpi-trend nt">—</span>';
  }

  // agent performance
  const dailyTarget = days * 15;
  const agFinder = dailyTarget > 0 ? Math.min(100, Math.round(summary.leadsFound / dailyTarget * 100)) : 0;
  const agEmail   = summary.leadsFound > 0 ? Math.min(100, Math.round(summary.emailsSent / summary.leadsFound * 100)) : 0;
  const agReply   = replyRate;
  const agScore   = (() => {
    const bkts = detail.scoreBuckets || {};
    const entries = Object.entries(bkts);
    const total = entries.reduce(function(a,[,v]){return a+v;}, 0);
    if (!total) return 0;
    const ws = entries.reduce(function(s,[k,v]){
      const nums = (k.match(/\d+/g)||['5']).map(Number);
      const mid = nums.length > 1 ? (nums[0]+nums[nums.length-1])/2 : nums[0];
      return s + mid * v;
    }, 0);
    return Math.round((ws / total) * 10);
  })();
  const agProject = summary.emailsSent > 0 ? Math.min(100, Math.round(summary.clients / summary.emailsSent * 100)) : 0;
  const agPnl     = pnlData.margin >= 0 ? Math.min(100, pnlData.margin) : 0;
  const agPipeline = summary.leadsFound > 0 ? Math.min(100, Math.round((summary.clients / summary.leadsFound) * 100)) : 0;

  // financial
  const clients = (state.leads || []).filter(function(l){return l.status==='client';});
  const curMonth = new Date().toISOString().slice(0,7);
  const curRev = (pnlData.months.find(function(m){return m.month===curMonth;})||{}).revenue || 0;
  const prevRev = (pnlData.months.filter(function(m){return m.month < curMonth;}).slice(-1)[0]||{}).revenue || 0;
  const forecastPct = prevRev > 0 ? Math.min(100, Math.round(curRev / prevRev * 100)) : 0;
  const curCosts  = (pnlData.months.find(function(m){return m.month===curMonth;})||{}).costs || 0;
  const curProfit = curRev - curCosts;

  // KPI cards config
  const kpis = [
    { label: 'Emails verstuurd', value: fmt(summary.emailsSent),       icon: '📧', bg: 'rgba(37,99,235,.12)',   clr: '#60a5fa', spark: spk,    trend: trendBadge(leadsTrend) },
    { label: 'Reply rate',       value: replyRate + '%',               icon: '💬', bg: 'rgba(74,222,128,.12)', clr: '#4ade80', spark: spk,    trend: replyRate >= 10 ? '<span class="sp-kpi-trend up">✓ doel</span>' : '<span class="sp-kpi-trend nt">&lt;10%</span>' },
    { label: 'Gem. score',       value: agScore > 0 ? (agScore/10).toFixed(1) : '—', icon: '⭐', bg: 'rgba(251,191,36,.12)', clr: '#fbbf24', spark: spk, trend: trendBadge(0) },
    { label: 'Actieve klanten',  value: fmt(summary.clients),           icon: '🏢', bg: 'rgba(167,139,250,.12)','clr': '#a78bfa', spark: spk, trend: trendBadge(0) },
    { label: 'Omzet',            value: fmtEur(pnlData.totalRevenue),  icon: '💰', bg: 'rgba(74,222,128,.12)', clr: '#4ade80', spark: pnlSpk.length ? pnlSpk : spk, trend: trendBadge(pnlData.margin > 0 ? Math.round(pnlData.margin) : 0) },
    { label: 'Leads gevonden',   value: fmt(summary.leadsFound),        icon: '🔍', bg: 'rgba(37,99,235,.12)',  clr: '#60a5fa', spark: spk,    trend: trendBadge(leadsTrend) }
  ];

  const STATUS_COLORS_CHART = { inbox:'#2563eb', approved:'#0ea5e9', sent:'#0ea5e9', replied:'#16a34a', client:'#16a34a', disapproved:'#dc2626', dead:'#9b9b98', scheduled:'#d97706', followup1:'#d97706', followup2:'#ea580c' };

  body.innerHTML = `
    <!-- KPI grid -->
    <div class="sp-kpi-grid">
      ${kpis.map(function(k) { return `
        <div class="sp-kpi">
          <div class="sp-kpi-top">
            <div class="sp-kpi-icon" style="background:${k.bg}">${k.icon}</div>
            ${k.trend}
          </div>
          <div class="sp-kpi-val">${k.value}</div>
          <div class="sp-kpi-lbl">${k.label}</div>
          <div class="sp-kpi-spark">${_sparkSVG(k.spark, k.clr)}</div>
        </div>
      `; }).join('')}
    </div>

    <!-- Charts row 1: 60/40 -->
    <div class="sp-charts-main">
      <div class="sp-card">
        <div class="sp-ch">
          <span class="sp-ct">Email activiteit</span>
          <span class="sp-cs">Leads gevonden per dag (${days}d)</span>
        </div>
        <div class="sp-cb"><canvas id="chartEmailActivity" height="160"></canvas></div>
      </div>
      <div class="sp-card">
        <div class="sp-ch"><span class="sp-ct">Score verdeling</span></div>
        <div class="sp-cb"><canvas id="chartScoreDist" height="160"></canvas></div>
      </div>
    </div>

    <!-- Charts row 2: 3-equal -->
    <div class="sp-charts-sec">
      <div class="sp-card">
        <div class="sp-ch"><span class="sp-ct">Leads per niche</span></div>
        <div class="sp-cb"><canvas id="chartNiches" height="180"></canvas></div>
      </div>
      <div class="sp-card">
        <div class="sp-ch"><span class="sp-ct">Lead statussen</span></div>
        <div class="sp-cb"><canvas id="chartStatus" height="180"></canvas></div>
      </div>
      <div class="sp-card">
        <div class="sp-ch"><span class="sp-ct">Maandelijkse omzet</span></div>
        <div class="sp-cb"><canvas id="chartMonthlyRev" height="180"></canvas></div>
      </div>
    </div>

    <!-- Email performance: top subjects + reply rate -->
    <div class="sp-charts-half">
      <div class="sp-card">
        <div class="sp-ch">
          <span class="sp-ct">Top email onderwerpen</span>
          <button class="sp-gh-btn" onclick="showTopSubjects()" style="font-size:11px;padding:4px 9px">Alle →</button>
        </div>
        <div class="sp-cb">
          ${subjects.length === 0
            ? '<p style="font-size:13px;color:var(--text-secondary)">Nog niet genoeg data (min. 2 per onderwerp).</p>'
            : `<table class="sp-subj-tbl">
                <thead><tr><th>Onderwerp</th><th>Verstuurd</th><th>Open%</th><th style="color:#4ade80">Reply%</th></tr></thead>
                <tbody>${subjects.slice(0, 6).map(function(s) { return `<tr>
                  <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.subject)}</td>
                  <td>${s.sent}</td>
                  <td>${s.openRate}%</td>
                  <td style="font-weight:700;color:#4ade80">${s.replyRate}%</td>
                </tr>`; }).join('')}</tbody>
              </table>`}
        </div>
      </div>
      <div class="sp-card">
        <div class="sp-ch">
          <span class="sp-ct">Reply rate per niche</span>
          <button class="sp-gh-btn" onclick="showHeatmap()" style="font-size:11px;padding:4px 9px">🔥 Heatmap</button>
        </div>
        <div class="sp-cb">
          ${detail.replyRateByNiche.length === 0
            ? '<p style="font-size:13px;color:var(--text-secondary)">Nog niet genoeg data.</p>'
            : detail.replyRateByNiche.map(function(r) { return `
              <div class="sp-rr-bar-row">
                <div class="sp-rr-bar-info">
                  <span style="font-weight:600;color:var(--text-primary)">${esc(r.niche)}</span>
                  <span style="color:var(--text-secondary)">${r.replied}/${r.sent} · <strong style="color:var(--text-primary)">${r.rate}%</strong></span>
                </div>
                <div class="sp-rr-bar-trk">
                  <div class="sp-rr-bar-fill" style="width:${Math.min(100,r.rate)}%;background:${r.rate>10?'#4ade80':r.rate>5?'#fbbf24':'#60a5fa'}"></div>
                </div>
              </div>
            `; }).join('')}
        </div>
      </div>
    </div>

    <!-- A/B test section -->
    <div class="sp-sec-hdr">
      <div class="sp-sec-ttl"><i class="ti ti-test-pipe" style="color:#a78bfa"></i>A/B Test Resultaten</div>
      <span class="sp-sec-sub">${(abData||{}).totalLeadsWithVersion || 0} leads met versie-data</span>
    </div>
    ${abData && abData.totalLeadsWithVersion > 0 ? `
      <div class="sp-ab-row">
        ${['A','B'].map(function(v) {
          const d = abData[v];
          const isW = abData.winner === v;
          const f1 = function(x) { return x === null ? '—' : x + '%'; };
          return `<div class="sp-ab-card ${isW ? 'winner' : ''}">
            ${isW ? '<div class="sp-ab-wb">🏆 Winnaar</div>' : ''}
            <div class="sp-ab-v">Versie ${v}</div>
            <div class="sp-ab-s">${d.sent} verstuurd</div>
            <div class="sp-ab-ms">
              <div><div class="sp-ab-mv ${isW ? 'hl' : ''}">${f1(d.replyRate)}</div><div class="sp-ab-ml">Reply rate</div></div>
              <div><div class="sp-ab-mv">${f1(d.openRate)}</div><div class="sp-ab-ml">Open rate</div></div>
              <div><div class="sp-ab-mv">${d.replied}</div><div class="sp-ab-ml">Replies</div></div>
              <div><div class="sp-ab-mv" style="color:#f87171">${f1(d.bounceRate)}</div><div class="sp-ab-ml">Bounce</div></div>
            </div>
          </div>`;
        }).join('')}
      </div>
      <div class="sp-card" style="margin-bottom:12px">
        <div class="sp-ch"><span class="sp-ct">Reply rate per niche — A/B</span></div>
        <div class="sp-cb">
          <canvas id="chartAB" height="140"></canvas>
          ${abData.niches.filter(function(n){return n.A.sent>0||n.B.sent>0;}).length > 0 ? `
            <table class="sp-ab-tbl">
              <thead><tr>
                <th style="text-align:left">Niche</th>
                <th>A (gestuurd)</th><th>B (gestuurd)</th>
                <th>Reply A</th><th>Reply B</th><th>Winnaar</th>
              </tr></thead>
              <tbody>${abData.niches.filter(function(n){return n.A.sent>0||n.B.sent>0;}).map(function(n) { return `
                <tr>
                  <td>${esc(n.niche)}</td>
                  <td>${n.A.sent}</td><td>${n.B.sent}</td>
                  <td class="${n.winner==='A'?'sp-pos':''}">${n.A.replyRate!==null?n.A.replyRate+'%':'—'}</td>
                  <td class="${n.winner==='B'?'sp-pos':''}">${n.B.replyRate!==null?n.B.replyRate+'%':'—'}</td>
                  <td>${n.winner==='tie'?'🤝 Gelijk':n.winner?'<span class="sp-ab-nw">Versie '+n.winner+'</span>':'—'}</td>
                </tr>`; }).join('')}
              </tbody>
            </table>` : ''}
        </div>
      </div>
    ` : `<div class="sp-card" style="padding:28px;text-align:center;margin-bottom:12px">
        <i class="ti ti-test-pipe" style="font-size:28px;color:var(--text-secondary);opacity:.3;display:block;margin-bottom:8px"></i>
        <span style="font-size:13px;color:var(--text-secondary)">Nog geen A/B data. Verstuur emails via inbox om data te verzamelen.</span>
      </div>`}

    <!-- Financial overview -->
    <div class="sp-sec-hdr">
      <div class="sp-sec-ttl"><i class="ti ti-trending-up" style="color:#2563eb"></i>Financieel overzicht</div>
      <span class="sp-sec-sub">Laatste 12 maanden · AI-kosten in EUR (koers 0.92)</span>
    </div>
    <div class="sp-fin-row">
      <div class="sp-fin-card">
        <div class="sp-fin-ttl">MRR & klanten</div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">Actieve klanten</span><span class="sp-fin-val">${clients.length}</span></div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">Totale omzet</span><span class="sp-fin-val pos">${fmtEurFull(pnlData.totalRevenue)}</span></div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">Totale kosten</span><span class="sp-fin-val neg">${fmtEurFull(pnlData.totalCosts)}</span></div>
        <div class="sp-fin-line" style="font-weight:700"><span class="sp-fin-lbl">Netto winst</span><span class="sp-fin-val ${pnlData.totalProfit>=0?'pos':'neg'}">${fmtEurFull(pnlData.totalProfit)}</span></div>
      </div>
      <div class="sp-fin-card">
        <div class="sp-fin-ttl">Maandprognose</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px">Huidige maand vs vorige</div>
        <div class="sp-forecast-trk"><div class="sp-forecast-fill" style="width:${forecastPct}%"></div></div>
        <div class="sp-forecast-meta"><span>${fmtEurFull(curRev)} ontvangen</span><span>${fmtEurFull(prevRev)} doel</span></div>
        <div style="font-size:22px;font-weight:800;color:var(--text-primary);margin:12px 0 4px">${forecastPct}%</div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">Kosten deze maand</span><span class="sp-fin-val neg">${fmtEurFull(curCosts)}</span></div>
        <div class="sp-fin-line" style="font-weight:700"><span class="sp-fin-lbl">Netto deze maand</span><span class="sp-fin-val ${curProfit>=0?'pos':'neg'}">${fmtEurFull(curProfit)}</span></div>
      </div>
      <div class="sp-fin-card">
        <div class="sp-fin-ttl">Winst & verlies</div>
        <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:12px">
          <span style="font-size:28px;font-weight:800;color:${pnlData.totalProfit>=0?'#4ade80':'#f87171'}">${fmtEurFull(pnlData.totalProfit)}</span>
          <span style="font-size:13px;color:var(--text-secondary)">netto</span>
        </div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">Omzet</span><span class="sp-fin-val pos">${fmtEurFull(pnlData.totalRevenue)}</span></div>
        <div class="sp-fin-line"><span class="sp-fin-lbl">AI + hosting</span><span class="sp-fin-val neg">${fmtEurFull(pnlData.totalCosts)}</span></div>
        <div class="sp-fin-line" style="font-weight:700"><span class="sp-fin-lbl">Marge</span><span class="sp-fin-val ${pnlData.margin>=0?'pos':'neg'}">${pnlData.margin}%</span></div>
      </div>
    </div>

    <!-- Agent prestaties -->
    <div class="sp-sec-hdr">
      <div class="sp-sec-ttl"><i class="ti ti-robot" style="color:#a78bfa"></i>Agent prestaties</div>
      <span class="sp-sec-sub">Op basis van de laatste ${days} dagen</span>
    </div>
    <div class="sp-agents-grid">
      ${[
        { name: 'Lead Finder',   val: summary.leadsFound + ' leads',       pct: agFinder,   clr: '#60a5fa' },
        { name: 'Website Check', val: 'Agent 2',                            pct: Math.min(100,agEmail),  clr: '#34d399' },
        { name: 'Social Scan',   val: 'Agent 3',                            pct: Math.min(100,agScore),  clr: '#a78bfa' },
        { name: 'Lead Scorer',   val: (agScore/10).toFixed(1) + ' / 10',   pct: agScore,    clr: '#fbbf24' },
        { name: 'Email Writer',  val: summary.emailsSent + ' emails',       pct: agEmail,    clr: '#f472b6' },
        { name: 'Reply Rate',    val: replyRate + '% reply',                pct: agReply,    clr: '#4ade80' },
        { name: 'Conversie',     val: summary.clients + ' klanten',         pct: agPipeline, clr: '#fb923c' }
      ].map(function(a) { return `
        <div class="sp-agent">
          ${_agentCircle(a.pct, a.clr)}
          <div class="sp-agent-name">${a.name}</div>
          <div class="sp-agent-val">${a.val}</div>
        </div>
      `; }).join('')}
    </div>

    <!-- P&L chart + table -->
    ${pnlData.months.length ? `
      <div class="sp-card" style="margin-bottom:12px">
        <div class="sp-ch"><span class="sp-ct">Omzet vs kosten per maand</span></div>
        <div class="sp-cb"><canvas id="chartPnL" height="160"></canvas></div>
      </div>
      <div class="sp-card" style="overflow:hidden;margin-bottom:12px">
        <table class="sp-pnl-tbl">
          <thead><tr><th>Maand</th><th>Omzet</th><th>Kosten</th><th>Winst</th><th>Marge</th></tr></thead>
          <tbody>
            ${pnlData.months.filter(function(m){return m.revenue>0||m.costs>0;}).map(function(m) {
              const mg = m.revenue > 0 ? Math.round(m.profit / m.revenue * 100) : (m.costs > 0 ? -100 : 0);
              const nl = new Date(m.month + '-02').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' });
              return `<tr>
                <td>${nl}</td>
                <td class="sp-pos">${fmtEurFull(m.revenue)}</td>
                <td class="sp-neg">${fmtEurFull(m.costs)}</td>
                <td class="${m.profit>=0?'sp-pos':'sp-neg'}">${fmtEurFull(m.profit)}</td>
                <td style="color:${mg>=0?'#4ade80':'#f87171'};font-weight:600">${mg}%</td>
              </tr>`;
            }).join('') || '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-secondary);font-size:13px">Nog geen betaalde facturen.</td></tr>'}
          </tbody>
        </table>
      </div>
    ` : ''}

    <!-- Top 5 leads -->
    ${detail.topLeads.length > 0 ? `
      <div class="sp-card" style="margin-bottom:12px;overflow:hidden">
        <div class="sp-ch"><span class="sp-ct">Top 5 leads op score</span></div>
        <div class="sp-cb" style="padding-top:8px">
          ${detail.topLeads.map(function(l, i) { return `
            <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)${i===detail.topLeads.length-1?';border:none':''}">
              <span style="font-size:12px;font-weight:700;color:var(--text-secondary);width:16px;text-align:right">${i+1}</span>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(l.companyName)}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${esc(l.niche||'')} · ${STATUS_LABELS[l.status]||l.status}</div>
              </div>
              <span class="score-pill score-${scoreColor(l.score||0)}">${(l.score||0).toFixed(1)}</span>
              ${l.estimatedValue ? '<span style="font-size:12px;font-weight:600;color:#4ade80">€' + Math.round(l.estimatedValue/1000) + 'K</span>' : ''}
            </div>
          `; }).join('')}
        </div>
      </div>
    ` : ''}

    <!-- Case studies -->
    ${(() => {
      const cls = (state.leads || []).filter(function(l){return l.status==='client';});
      const csCount = cls.filter(function(l){return l.caseStudy;}).length;
      const earliest = cls.filter(function(l){return !l.caseStudy&&l.projectStartedAt;})
        .map(function(l){ return 30 - Math.floor((Date.now()-new Date(l.projectStartedAt))/86400000); })
        .filter(function(d){return d>0;}).sort(function(a,b){return a-b;})[0];
      return `<div class="sp-card" style="margin-bottom:12px">
        <div class="sp-ch">
          <span class="sp-ct"><i class="ti ti-file-text" style="color:#2563eb;margin-right:5px"></i>Case studies</span>
          <span class="sp-cs" style="background:${csCount>0?'rgba(74,222,128,.1)':'rgba(255,255,255,.06)'};color:${csCount>0?'#4ade80':'#666'};padding:2px 8px;border-radius:99px;font-size:11px;font-weight:600">${csCount} gegenereerd</span>
        </div>
        <div class="sp-cb">
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:8px">Case studies worden automatisch gegenereerd 30 dagen nadat een klant actief is — als social proof op de publieke website.</div>
          <div style="font-size:12px;color:var(--text-secondary)"><i class="ti ti-clock" style="margin-right:4px"></i>${
            csCount === 0
              ? (earliest !== undefined ? 'Eerste case study mogelijk over ' + earliest + ' dag' + (earliest!==1?'en':'') + '.' : 'Nog geen klanten actief lang genoeg.')
              : csCount + ' case stud' + (csCount!==1?'ies':'y') + ' beschikbaar.'
          }</div>
        </div>
      </div>`;
    })()}
  `;

  // Chart colours
  const BLUE = '#2563eb', SKY = '#0ea5e9', GREEN = '#16a34a';
  const AMBER = '#d97706', RED = '#dc2626', PURPLE = '#7c3aed';

  const axOpts = {
    ticks: { color: '#666', font: { size: 11 } },
    grid: { color: 'rgba(255,255,255,.04)' },
    border: { display: false }
  };

  // Email activity line chart
  const ctx1 = document.getElementById('chartEmailActivity') && document.getElementById('chartEmailActivity').getContext('2d');
  if (ctx1) {
    _statsCharts.push(new Chart(ctx1, {
      type: 'line',
      data: {
        labels: detail.leadsPerDay.map(function(d){return d.date.slice(5);}),
        datasets: [{ label: 'Leads gevonden', data: detail.leadsPerDay.map(function(d){return d.count;}), borderColor: BLUE, backgroundColor: BLUE + '18', fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: axOpts, y: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { stepSize: 1 }) }) } }
    }));
  }

  // Score distribution horizontal bar
  const ctx2 = document.getElementById('chartScoreDist') && document.getElementById('chartScoreDist').getContext('2d');
  if (ctx2) {
    _statsCharts.push(new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: Object.keys(detail.scoreBuckets),
        datasets: [{ data: Object.values(detail.scoreBuckets), backgroundColor: [RED+'cc', AMBER+'cc', BLUE+'cc', GREEN+'cc', PURPLE+'cc'], borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { stepSize: 1 }) }), y: Object.assign({}, axOpts, { grid: { display: false } }) } }
    }));
  }

  // Status donut
  const ctx3 = document.getElementById('chartStatus') && document.getElementById('chartStatus').getContext('2d');
  if (ctx3) {
    const entries = Object.entries(detail.byStatus).filter(function(e){return e[1]>0;});
    _statsCharts.push(new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: entries.map(function(e){return STATUS_LABELS[e[0]]||e[0];}),
        datasets: [{ data: entries.map(function(e){return e[1];}), backgroundColor: entries.map(function(e){return STATUS_COLORS_CHART[e[0]]||'#9ca3af';}), borderWidth: 2, borderColor: '#1a1a1a' }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#999', font: { size: 11 }, boxWidth: 10 } } } }
    }));
  }

  // Niches horizontal bar
  const ctx4 = document.getElementById('chartNiches') && document.getElementById('chartNiches').getContext('2d');
  if (ctx4) {
    const top = Object.entries(detail.byNiche).sort(function(a,b){return b[1]-a[1];}).slice(0,8);
    _statsCharts.push(new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: top.map(function(t){return t[0];}),
        datasets: [{ data: top.map(function(t){return t[1];}), backgroundColor: BLUE + 'cc', borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { stepSize: 1 }) }), y: Object.assign({}, axOpts, { grid: { display: false } }) } }
    }));
  }

  // Monthly revenue bar
  const ctx5 = document.getElementById('chartMonthlyRev') && document.getElementById('chartMonthlyRev').getContext('2d');
  if (ctx5) {
    const mRevData = pnlData.months.slice(-8);
    _statsCharts.push(new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: mRevData.map(function(m){return new Date(m.month+'-02').toLocaleDateString('nl-NL',{month:'short'});}),
        datasets: [{ label: 'Omzet', data: mRevData.map(function(m){return m.revenue;}), backgroundColor: GREEN + 'cc', borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: Object.assign({}, axOpts, { grid: { display: false } }), y: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { callback: function(v){return '€'+v;} }) }) } }
    }));
  }

  // A/B chart
  const ctxAB = document.getElementById('chartAB') && document.getElementById('chartAB').getContext('2d');
  if (ctxAB && abData && abData.niches && abData.niches.length) {
    const niches = abData.niches.filter(function(n){return n.A.sent>0||n.B.sent>0;}).slice(0,8);
    _statsCharts.push(new Chart(ctxAB, {
      type: 'bar',
      data: {
        labels: niches.map(function(n){return n.niche;}),
        datasets: [
          { label: 'Versie A reply%', data: niches.map(function(n){return n.A.replyRate||0;}), backgroundColor: BLUE + 'cc', borderRadius: 4 },
          { label: 'Versie B reply%', data: niches.map(function(n){return n.B.replyRate||0;}), backgroundColor: PURPLE + 'cc', borderRadius: 4 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#999', font: { size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign({}, axOpts, { grid: { display: false } }), y: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { callback: function(v){return v+'%';} }) }) } }
    }));
  }

  // P&L grouped bar
  const ctxPnL = document.getElementById('chartPnL') && document.getElementById('chartPnL').getContext('2d');
  if (ctxPnL && pnlData.months.length) {
    const labels = pnlData.months.map(function(m){return new Date(m.month+'-02').toLocaleDateString('nl-NL',{month:'short',year:'2-digit'});});
    _statsCharts.push(new Chart(ctxPnL, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Omzet',     data: pnlData.months.map(function(m){return m.revenue;}), backgroundColor: GREEN  + 'cc', borderRadius: 4 },
          { label: 'Kosten',    data: pnlData.months.map(function(m){return m.costs;}),   backgroundColor: RED    + 'cc', borderRadius: 4 },
          { label: 'Winst',     data: pnlData.months.map(function(m){return m.profit;}),  backgroundColor: BLUE   + 'cc', borderRadius: 4 }
        ]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { color: '#999', font: { size: 11 }, boxWidth: 10 } } }, scales: { x: Object.assign({}, axOpts, { grid: { display: false } }), y: Object.assign({}, axOpts, { beginAtZero: true, ticks: Object.assign({}, axOpts.ticks, { callback: function(v){return '€'+v;} }) }) } }
    }));
  }
}


// ─── Funnel chart ─────────────────────────────────────────────────────────────
async function renderFunnelChart() {
  const data = await apiJSON('/api/stats/funnel');
  if (!data) return;

  const STAGE_LABELS = {
    lead_found:       'Lead gevonden',
    lead_emailed:     'Email verstuurd',
    email_opened:     'Email geopend',
    email_replied:    'Reply ontvangen',
    project_started:  'Project gestart',
    intake_completed: 'Intake ingevuld',
    first_build:      'Eerste build',
    invoice_sent:     'Factuur verstuurd',
    payment_received: 'Betaling ontvangen'
  };

  const STAGE_COLORS = [
    'linear-gradient(90deg,#2563eb,#3b82f6)',
    'linear-gradient(90deg,#0ea5e9,#38bdf8)',
    'linear-gradient(90deg,#06b6d4,#22d3ee)',
    'linear-gradient(90deg,#10b981,#34d399)',
    'linear-gradient(90deg,#16a34a,#4ade80)',
    'linear-gradient(90deg,#65a30d,#a3e635)',
    'linear-gradient(90deg,#ca8a04,#fbbf24)',
    'linear-gradient(90deg,#d97706,#fb923c)',
    'linear-gradient(90deg,#dc2626,#f87171)'
  ];

  const maxCount = Math.max.apply(null, data.stages.map(function(s){return s.count;})) || 1;

  const funnelHtml = `
    <div class="sp-funnel-card">
      <div class="sp-funnel-ttl"><i class="ti ti-filter" style="color:#2563eb"></i>Conversie Funnel</div>
      ${data.stages.map(function(s, i) {
        const pct = Math.round((s.count / maxCount) * 100);
        const prevCount = i > 0 ? data.stages[i-1].count : s.count;
        const dropPct = prevCount > 0 && i > 0 ? Math.round((1 - s.count / prevCount) * 100) : null;
        return `<div class="sp-funnel-stage">
          <div class="sp-funnel-info">
            <span class="sp-funnel-name">${STAGE_LABELS[s.event] || s.event}</span>
            <span class="sp-funnel-stat">${s.count} · ${s.conversionRate}% totaal</span>
          </div>
          <div class="sp-funnel-trk">
            <div class="sp-funnel-bar" style="width:${pct}%;background:${STAGE_COLORS[i % STAGE_COLORS.length]}">
              ${s.count > 0 ? '<span class="sp-funnel-blbl">' + s.count + '</span>' : ''}
            </div>
          </div>
          ${dropPct !== null ? '<div class="sp-funnel-drop">↓ ' + dropPct + '% uitval</div>' : ''}
        </div>`;
      }).join('')}
    </div>`;

  const container = document.getElementById('statsFunnel') || document.getElementById('content');
  if (container) container.innerHTML = funnelHtml;
}

// ─── Period comparison ────────────────────────────────────────────────────────
async function showPeriodComparison() {
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📊 Periode vergelijking</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div>
        <label class="form-label" style="font-size:12px;font-weight:600;">Periode A</label>
        <input type="date" id="cmpA1" class="input-field" style="width:100%;margin-bottom:6px;">
        <input type="date" id="cmpA2" class="input-field" style="width:100%;">
      </div>
      <div>
        <label class="form-label" style="font-size:12px;font-weight:600;">Periode B</label>
        <input type="date" id="cmpB1" class="input-field" style="width:100%;margin-bottom:6px;">
        <input type="date" id="cmpB2" class="input-field" style="width:100%;">
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;gap:8px;">
      <button onclick="closeModal()" class="btn btn-secondary btn-sm">Annuleren</button>
      <button onclick="_runComparison()" class="btn btn-primary btn-sm">Vergelijken</button>
    </div>
    <div id="cmpResult" style="margin-top:16px;"></div>
  `);
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  document.getElementById('cmpA1').value = new Date(y, m-1, 1).toISOString().slice(0,10);
  document.getElementById('cmpA2').value = new Date(y, m, 0).toISOString().slice(0,10);
  document.getElementById('cmpB1').value = new Date(y, m, 1).toISOString().slice(0,10);
  document.getElementById('cmpB2').value = now.toISOString().slice(0,10);
}

async function _runComparison() {
  const a1 = document.getElementById('cmpA1').value;
  const a2 = document.getElementById('cmpA2').value;
  const b1 = document.getElementById('cmpB1').value;
  const b2 = document.getElementById('cmpB2').value;
  const leads = state.leads || [];
  const inRange = (d, from, to) => d && d >= from && d <= to + 'T23:59:59';
  const calc = (from, to) => ({
    newLeads:  leads.filter(l => inRange(l.createdAt, from, to)).length,
    emailed:   leads.filter(l => inRange(l.sentAt, from, to)).length,
    replied:   leads.filter(l => inRange(l.repliedAt, from, to)).length,
    clients:   leads.filter(l => inRange(l.projectStartedAt, from, to)).length,
    revenue:   leads.reduce((s,l) => s + (l.payments||[]).filter(p=>p.paidAt&&inRange(p.paidAt,from,to)).reduce((ps,p)=>ps+(p.amount||0),0), 0)
  });
  const A = calc(a1, a2), B = calc(b1, b2);
  const row = (label, av, bv, isEuro=false) => {
    const diff = bv - av;
    const color = diff > 0 ? '#4ade80' : diff < 0 ? '#f87171' : 'var(--text-secondary)';
    const fmt = isEuro ? v => '€' + v.toLocaleString('nl-NL') : v => v;
    return `<tr style="border-bottom:1px solid var(--border);">
      <td style="padding:8px 12px;font-weight:600;">${label}</td>
      <td style="padding:8px 12px;text-align:right;">${fmt(av)}</td>
      <td style="padding:8px 12px;text-align:right;">${fmt(bv)}</td>
      <td style="padding:8px 12px;text-align:right;color:${color};font-weight:600;">${diff>0?'+':''}${fmt(diff)}</td>
    </tr>`;
  };
  document.getElementById('cmpResult').innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead><tr style="background:var(--surface-2);">
        <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Metric</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Periode A</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Periode B</th>
        <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-secondary);">Verschil</th>
      </tr></thead>
      <tbody>
        ${row('Nieuwe leads', A.newLeads, B.newLeads)}
        ${row('Emails verstuurd', A.emailed, B.emailed)}
        ${row('Replies', A.replied, B.replied)}
        ${row('Nieuwe klanten', A.clients, B.clients)}
        ${row('Omzet', A.revenue, B.revenue, true)}
      </tbody>
    </table>`;
}

// ─── Heatmap best send times ──────────────────────────────────────────────────
async function showHeatmap() {
  const data = await apiJSON('/api/stats/heatmap');
  if (!data) { toast('Heatmap laden mislukt', 'error'); return; }
  const maxRate = Math.max.apply(null, data.heatmap.flatMap(d => d.hours.map(h => h.rate))) || 1;
  const hours = Array.from({length:24}, (_,h) => String(h).padStart(2,'0'));

  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">🔥 Heatmap beste verzendtijden</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    <div style="overflow-x:auto;margin-top:12px;">
      <div style="display:grid;grid-template-columns:40px repeat(24,32px);gap:2px;font-size:10px;">
        <div></div>
        ${hours.map(h => `<div style="text-align:center;color:var(--text-secondary);padding:2px 0;">${h}</div>`).join('')}
        ${data.heatmap.map((row, ri) => `
          <div style="color:var(--text-secondary);font-weight:600;line-height:24px;text-align:right;padding-right:6px;">${row.day}</div>
          ${row.hours.map(h => {
            if (h.sent === 0) return `<div class="heatmap-cell" style="background:#2a2a2a;"></div>`;
            const alpha = Math.round((h.rate / maxRate) * 90 + 10);
            const color = h.rate > 20 ? `rgba(74,222,128,${alpha/100})` : h.rate > 10 ? `rgba(96,165,250,${alpha/100})` : `rgba(255,255,255,.06)`;
            return `<div class="heatmap-cell" style="background:${color};font-size:9px;color:#fff;" title="${row.day} ${h.hour}:00 — ${h.rate}%">${h.rate||''}</div>`;
          }).join('')}
        `).join('')}
      </div>
    </div>
    <div style="margin-top:12px;font-size:11px;color:var(--text-secondary);">Groen = hoge reply rate · Blauw = gemiddeld · Grijs = geen data</div>
  `);
}

// ─── Top subjects ─────────────────────────────────────────────────────────────
async function showTopSubjects() {
  const data = await apiJSON('/api/stats/top-subjects');
  const subjects = data?.subjects || [];
  openModal(`
    <div class="modal-header">
      <h3 class="modal-title">📧 Top 10 email onderwerpen</h3>
      <button onclick="closeModal()" class="modal-close">×</button>
    </div>
    ${!subjects.length ? '<p style="color:var(--text-secondary);font-size:13px;margin-top:12px;">Nog te weinig data (minimaal 2 per onderwerp).</p>' :
    `<div style="overflow-x:auto;margin-top:12px;">
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="background:var(--surface-2);">
          <th style="padding:8px 12px;text-align:left;">Onderwerp</th>
          <th style="padding:8px 12px;text-align:right;">Verstuurd</th>
          <th style="padding:8px 12px;text-align:right;">Open%</th>
          <th style="padding:8px 12px;text-align:right;color:#4ade80;">Reply%</th>
        </tr></thead>
        <tbody>${subjects.map(s => `<tr style="border-bottom:1px solid var(--border);">
          <td style="padding:8px 12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(s.subject)}</td>
          <td style="padding:8px 12px;text-align:right;">${s.sent}</td>
          <td style="padding:8px 12px;text-align:right;">${s.openRate}%</td>
          <td style="padding:8px 12px;text-align:right;font-weight:700;color:#4ade80;">${s.replyRate}%</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>`}
  `);
}

// ─── Niche comparison ─────────────────────────────────────────────────────────
async function showNicheComparison() {
  const data = await apiJSON('/api/stats/niches');
  const niches = data?.niches || [];
  const container = document.getElementById('statsNiche') || document.getElementById('content');
  if (!container) return;
  container.innerHTML = niches.length === 0 ? '' : `
    <div class="sp-card" style="overflow:hidden;margin-bottom:12px">
      <div class="sp-ch"><span class="sp-ct"><i class="ti ti-building" style="color:#2563eb;margin-right:5px"></i>Niche prestatie vergelijking</span></div>
      <div style="overflow-x:auto">
        <table class="sp-niche-tbl">
          <thead><tr>
            <th style="text-align:left">Niche</th>
            <th>Gevonden</th><th>Verstuurd</th><th>Replies</th>
            <th>Reply%</th><th>Klanten</th><th>Omzet</th>
          </tr></thead>
          <tbody>${niches.map(function(n) { return `<tr>
            <td>${esc(n.niche)}</td>
            <td>${n.found}</td><td>${n.emailed}</td><td>${n.replied}</td>
            <td><span class="sp-rr-pill ${n.replyRate>10?'sp-rr-h':n.replyRate>5?'sp-rr-m':'sp-rr-l'}">${n.replyRate}%</span></td>
            <td>${n.clients}</td>
            <td>€${(n.revenue||0).toLocaleString('nl-NL')}</td>
          </tr>`; }).join('')}</tbody>
        </table>
      </div>
    </div>`;
}
