// ─── Statistics ───────────────────────────────────────────────────────────────

let _statsCharts = [];
function destroyStatsCharts() {
  _statsCharts.forEach(c => { try { c.destroy(); } catch {} });
  _statsCharts = [];
}

async function renderStats() {
  destroyStatsCharts();
  document.getElementById('appView').innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-label">Analyse</div>
        <h1 class="page-title">Statistieken</h1>
      </div>
      <div style="display:flex;gap:8px">
        ${[7,30,90].map(d => `<button class="btn btn-ghost btn-sm stats-range-btn${d===30?' active':''}" data-days="${d}">${d} dagen</button>`).join('')}
      </div>
    </div>
    <div id="statsBody"><div class="loading-state"><div class="spinner-lg"></div></div></div>
  `;

  document.querySelectorAll('.stats-range-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stats-range-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadStatsData(parseInt(btn.dataset.days));
    });
  });

  loadStatsData(30);
  renderFunnelChart();
}

async function loadStatsData(days) {
  destroyStatsCharts();
  const [summary, detail, pnl, ab] = await Promise.all([
    apiJSON('/api/stats'),
    apiJSON(`/api/stats/detailed?days=${days}`),
    apiJSON('/api/stats/pnl'),
    apiJSON('/api/stats/ab')
  ]);
  if (!summary || !detail) return;
  const pnlData = pnl || { months: [], totalRevenue: 0, totalCosts: 0, totalProfit: 0, margin: 0 };
  const abData = ab || null;

  const body = document.getElementById('statsBody');
  if (!body) return;

  const fmt = n => n >= 1000 ? (n/1000).toFixed(1) + 'K' : String(n || 0);
  const fmtEur = n => '€' + (n >= 1000 ? (n/1000).toFixed(0) + 'K' : String(Math.round(n || 0)));

  const replyRate = summary.emailsSent > 0 ? Math.round(summary.replies / summary.emailsSent * 100) : 0;

  body.innerHTML = `
    <!-- KPI cards -->
    <div class="stats-grid" style="margin-bottom:24px">
      ${[
        { label: 'Leads gevonden',  value: fmt(summary.leadsFound),         icon: 'ti-users',          color: '#2563eb' },
        { label: 'Emails verstuurd',value: fmt(summary.emailsSent),         icon: 'ti-mail',           color: '#0ea5e9' },
        { label: 'Reacties',        value: fmt(summary.replies),            icon: 'ti-message-reply',  color: '#16a34a' },
        { label: 'Reply rate',      value: replyRate + '%',                 icon: 'ti-percentage',     color: '#d97706' },
        { label: 'Pipeline waarde', value: fmtEur(summary.pipelineValue),   icon: 'ti-currency-euro',  color: '#7c3aed' },
        { label: 'Klanten',         value: fmt(summary.clients),            icon: 'ti-star',           color: '#dc2626' }
      ].map(k => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${k.color}20;color:${k.color}"><i class="ti ${k.icon}"></i></div>
          <div>
            <div class="stat-value">${k.value}</div>
            <div class="stat-label">${k.label}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- Charts row 1 -->
    <div class="charts-row-2">
      <div class="card chart-card">
        <h3 class="chart-title">Leads per dag</h3>
        <canvas id="chartLeadsPerDay" height="200"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Pipeline waarde per week</h3>
        <canvas id="chartPipelineWeek" height="200"></canvas>
      </div>
    </div>

    <!-- Charts row 2 -->
    <div class="charts-row-3">
      <div class="card chart-card">
        <h3 class="chart-title">Status verdeling</h3>
        <canvas id="chartStatus" height="220"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Top niches</h3>
        <canvas id="chartNiches" height="220"></canvas>
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Score verdeling</h3>
        <canvas id="chartScores" height="220"></canvas>
      </div>
    </div>

    <!-- Reply rate by niche + top leads -->
    <div class="charts-row-2" style="margin-bottom:0">
      <div class="card chart-card">
        <h3 class="chart-title">Reply rate per niche</h3>
        ${detail.replyRateByNiche.length === 0
          ? '<p class="text-secondary" style="font-size:13px">Nog niet genoeg data.</p>'
          : detail.replyRateByNiche.map(r => `
            <div class="reply-rate-row">
              <div class="reply-rate-label">
                <span style="font-weight:600">${esc(r.niche)}</span>
                <span class="text-secondary">${r.replied}/${r.sent} (${r.rate}%)</span>
              </div>
              <div class="reply-rate-bar">
                <div class="reply-rate-fill" style="width:${r.rate}%"></div>
              </div>
            </div>
          `).join('')}
      </div>
      <div class="card chart-card">
        <h3 class="chart-title">Top 5 leads op score</h3>
        ${detail.topLeads.length === 0
          ? '<p class="text-secondary" style="font-size:13px">Nog geen leads.</p>'
          : detail.topLeads.map((l, i) => `
            <div class="top-lead-row${i < detail.topLeads.length-1 ? ' border-bottom' : ''}">
              <span class="top-lead-rank">${i+1}</span>
              <div class="top-lead-info">
                <div class="top-lead-name">${esc(l.companyName)}</div>
                <div class="top-lead-sub">${esc(l.niche || '')} · ${STATUS_LABELS[l.status] || l.status}</div>
              </div>
              <span class="score-pill score-${scoreColor(l.score||0)}">${(l.score||0).toFixed(1)}</span>
              ${l.estimatedValue ? `<span class="text-success" style="font-size:12px;font-weight:600">€${Math.round(l.estimatedValue/1000)}K</span>` : ''}
            </div>
          `).join('')}
      </div>
    </div>

    <!-- ── Winst & Verlies ── -->
    <hr style="margin:28px 0;border:none;border-top:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary)"><i class="ti ti-test-pipe" style="margin-right:6px;color:#7c3aed"></i>A/B Email Resultaten</h2>
      <span class="text-muted" style="font-size:12px">${abData?.totalLeadsWithVersion || 0} leads met versie-data</span>
    </div>
    ${abData && abData.totalLeadsWithVersion > 0 ? `
    <div class="ab-compare-row">
      ${['A','B'].map(v => {
        const d = abData[v];
        const isWinner = abData.winner === v;
        const fmt1 = x => x === null ? '—' : x + '%';
        return `<div class="ab-version-card ${isWinner ? 'ab-winner' : ''}">
          ${isWinner ? '<div class="ab-winner-badge"><i class="ti ti-trophy"></i> Winnaar</div>' : ''}
          <div class="ab-version-label">Versie ${v}</div>
          <div class="ab-version-sent">${d.sent} verstuurd</div>
          <div class="ab-metrics">
            <div class="ab-metric">
              <div class="ab-metric-value ${isWinner ? 'ab-metric-highlight' : ''}">${fmt1(d.replyRate)}</div>
              <div class="ab-metric-label">Reply rate</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value">${fmt1(d.openRate)}</div>
              <div class="ab-metric-label">Open rate</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value">${d.replied}</div>
              <div class="ab-metric-label">Replies</div>
            </div>
            <div class="ab-metric">
              <div class="ab-metric-value" style="color:var(--danger)">${fmt1(d.bounceRate)}</div>
              <div class="ab-metric-label">Bounce rate</div>
            </div>
          </div>
          <div class="ab-bar-wrap">
            <div class="ab-bar" style="width:${Math.min(100, d.replyRate ?? 0) * 4}%;background:${isWinner ? 'var(--accent)' : 'var(--border)'}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="card chart-card" style="margin-top:16px">
      <h3 class="chart-title">Reply rate vergelijking per niche</h3>
      <canvas id="chartAB" height="160"></canvas>
    </div>
    ${abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).length > 0 ? `
    <div class="card" style="overflow:hidden;margin-bottom:0;margin-top:16px">
      <table class="pnl-table">
        <thead><tr><th>Niche</th><th>Versie A (gestuurd)</th><th>Versie B (gestuurd)</th><th>Reply A</th><th>Reply B</th><th>Winnaar</th></tr></thead>
        <tbody>
          ${abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).map(n => `
            <tr class="pnl-row">
              <td style="font-weight:600;text-transform:capitalize">${esc(n.niche)}</td>
              <td>${n.A.sent}</td>
              <td>${n.B.sent}</td>
              <td class="${n.winner === 'A' ? 'pnl-pos' : ''}">${n.A.replyRate !== null ? n.A.replyRate + '%' : '—'}</td>
              <td class="${n.winner === 'B' ? 'pnl-pos' : ''}">${n.B.replyRate !== null ? n.B.replyRate + '%' : '—'}</td>
              <td>${n.winner === 'tie' ? '🤝 Gelijk' : n.winner ? `<span class="ab-niche-winner">Versie ${n.winner}</span>` : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>` : ''}
    ` : `<div class="card" style="padding:28px;text-align:center;color:var(--text-secondary);font-size:13px">
      <i class="ti ti-test-pipe" style="font-size:28px;margin-bottom:8px;display:block;opacity:.3"></i>
      Nog geen A/B data beschikbaar. Stuur emails goed via de inbox om A/B test data te verzamelen.
    </div>`}

    <hr style="margin:28px 0;border:none;border-top:1px solid var(--border)">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
      <h2 style="font-size:18px;font-weight:700;color:var(--text-primary)"><i class="ti ti-trending-up" style="margin-right:6px;color:var(--accent)"></i>Winst & Verlies</h2>
      <span class="text-muted" style="font-size:12px">Laatste 12 maanden · AI-kosten in EUR (koers 0.92)</span>
    </div>
    <div class="stats-grid" style="margin-bottom:20px;grid-template-columns:repeat(4,1fr)">
      ${[
        { label: 'Omzet (betaald + klanten)',  value: '€' + Math.round(pnlData.totalRevenue), icon: 'ti-cash',         color: '#16a34a' },
        { label: 'Kosten (AI + hosting)',     value: '€' + Math.round(pnlData.totalCosts),   icon: 'ti-brain',        color: '#dc2626' },
        { label: 'Netto Winst',      value: '€' + Math.round(pnlData.totalProfit),  icon: 'ti-trending-up',  color: pnlData.totalProfit >= 0 ? '#16a34a' : '#dc2626' },
        { label: 'Marge',            value: pnlData.margin + '%',                   icon: 'ti-percentage',   color: pnlData.margin >= 0 ? '#7c3aed' : '#dc2626' }
      ].map(k => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${k.color}20;color:${k.color}"><i class="ti ${k.icon}"></i></div>
          <div>
            <div class="stat-value">${k.value}</div>
            <div class="stat-label">${k.label}</div>
          </div>
        </div>
      `).join('')}
    </div>
    <div class="card chart-card" style="margin-bottom:16px">
      <h3 class="chart-title">Maandelijkse omzet vs kosten</h3>
      <canvas id="chartPnL" height="180"></canvas>
    </div>
    <div class="card" style="overflow:hidden;margin-bottom:0">
      <table class="pnl-table">
        <thead><tr><th>Maand</th><th>Omzet</th><th>AI Kosten</th><th>Winst</th><th>Marge</th></tr></thead>
        <tbody>
          ${pnlData.months.filter(m => m.revenue > 0 || m.costs > 0).map(m => {
            const mg = m.revenue > 0 ? Math.round(m.profit / m.revenue * 100) : (m.costs > 0 ? -100 : 0);
            const nl = new Date(m.month + '-02').toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' });
            return `<tr class="pnl-row">
              <td style="font-weight:600">${nl}</td>
              <td class="pnl-pos">€ ${Math.round(m.revenue).toLocaleString('nl-NL')}</td>
              <td class="pnl-neg">€ ${Math.round(m.costs).toLocaleString('nl-NL')}</td>
              <td class="${m.profit >= 0 ? 'pnl-pos' : 'pnl-neg'}">€ ${Math.round(m.profit).toLocaleString('nl-NL')}</td>
              <td style="color:${mg >= 0 ? 'var(--success)' : 'var(--danger)'};font-weight:600">${mg}%</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5" class="text-muted" style="padding:20px;text-align:center;font-size:13px">Nog geen betaalde facturen geregistreerd.</td></tr>'}
        </tbody>
      </table>
    </div>

    <!-- Case study info card -->
    ${(() => {
      const clients = (state.leads || []).filter(l => l.status === 'client');
      const caseStudyCount = clients.filter(l => l.caseStudy).length;
      const earliest = clients.filter(l => !l.caseStudy && l.projectStartedAt)
        .map(l => { const daysIn = Math.floor((Date.now() - new Date(l.projectStartedAt)) / 86400000); return 30 - daysIn; })
        .filter(d => d > 0).sort((a,b) => a-b)[0];
      return `
        <div class="card" style="margin-top:24px">
          <div class="card-header">
            <h3 class="card-title"><i class="ti ti-file-text" style="color:var(--accent);margin-right:6px"></i>Case studies</h3>
            <span class="badge badge-${caseStudyCount > 0 ? 'green' : 'gray'}">${caseStudyCount} gegenereerd</span>
          </div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.7;margin-bottom:12px">
            Case studies worden automatisch gegenereerd 30 dagen nadat een klant actief is. Het systeem maakt een geanonimiseerd succesverhaal op basis van de dienst en resultaten. Dit verschijnt automatisch op je publieke website onder <em>Resultaten</em> als social proof.
          </div>
          <div style="font-size:12px;color:var(--text-muted)">
            <i class="ti ti-clock"></i>
            ${caseStudyCount === 0
              ? earliest !== undefined
                ? `Eerste case study mogelijk over ${earliest} dag${earliest !== 1 ? 'en' : ''}.`
                : 'Nog geen klanten actief lang genoeg voor een case study.'
              : `${caseStudyCount} case stud${caseStudyCount !== 1 ? 'ies' : 'y'} beschikbaar — zichtbaar op de publieke website wanneer gepubliceerd.`}
          </div>
        </div>`;
    })()}
  `;

  // Chart colours
  const BLUE = '#2563eb'; const SKY = '#0ea5e9'; const GREEN = '#16a34a';
  const AMBER = '#d97706'; const RED = '#dc2626'; const PURPLE = '#7c3aed';

  const STATUS_COLORS_CHART = { inbox:'#2563eb', approved:'#0ea5e9', sent:'#0ea5e9', replied:'#16a34a', client:'#16a34a', disapproved:'#dc2626', dead:'#9b9b98', scheduled:'#d97706', followup1:'#d97706', followup2:'#ea580c' };

  // Leads per day
  const ctx1 = document.getElementById('chartLeadsPerDay')?.getContext('2d');
  if (ctx1) {
    _statsCharts.push(new Chart(ctx1, {
      type: 'line',
      data: {
        labels: detail.leadsPerDay.map(d => d.date.slice(5)),
        datasets: [{ label: 'Leads', data: detail.leadsPerDay.map(d => d.count), borderColor: BLUE, backgroundColor: BLUE + '20', fill: true, tension: 0.4, pointRadius: 3 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }

  // Pipeline by week
  const ctx2 = document.getElementById('chartPipelineWeek')?.getContext('2d');
  if (ctx2) {
    _statsCharts.push(new Chart(ctx2, {
      type: 'bar',
      data: {
        labels: detail.pipelineByWeek.map(w => w.week.slice(-5)),
        datasets: [{ label: '€ Waarde', data: detail.pipelineByWeek.map(w => w.value), backgroundColor: SKY + 'cc', borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    }));
  }

  // Status donut
  const ctx3 = document.getElementById('chartStatus')?.getContext('2d');
  if (ctx3) {
    const entries = Object.entries(detail.byStatus).filter(([,v]) => v > 0);
    _statsCharts.push(new Chart(ctx3, {
      type: 'doughnut',
      data: {
        labels: entries.map(([k]) => STATUS_LABELS[k] || k),
        datasets: [{ data: entries.map(([,v]) => v), backgroundColor: entries.map(([k]) => STATUS_COLORS_CHART[k] || '#9ca3af'), borderWidth: 2 }]
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } } }
    }));
  }

  // Niches bar
  const ctx4 = document.getElementById('chartNiches')?.getContext('2d');
  if (ctx4) {
    const top = Object.entries(detail.byNiche).sort(([,a],[,b]) => b-a).slice(0, 8);
    _statsCharts.push(new Chart(ctx4, {
      type: 'bar',
      data: {
        labels: top.map(([k]) => k),
        datasets: [{ data: top.map(([,v]) => v), backgroundColor: BLUE + 'cc', borderRadius: 4 }]
      },
      options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }

  // Score histogram
  const ctx5 = document.getElementById('chartScores')?.getContext('2d');
  if (ctx5) {
    _statsCharts.push(new Chart(ctx5, {
      type: 'bar',
      data: {
        labels: Object.keys(detail.scoreBuckets),
        datasets: [{ data: Object.values(detail.scoreBuckets), backgroundColor: [RED+'cc', AMBER+'cc', BLUE+'cc', GREEN+'cc', PURPLE+'cc'], borderRadius: 4 }]
      },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    }));
  }

  // A/B chart (reply rate per niche)
  const ctxAB = document.getElementById('chartAB')?.getContext('2d');
  if (ctxAB && abData && abData.niches.length) {
    const niches = abData.niches.filter(n => n.A.sent > 0 || n.B.sent > 0).slice(0, 8);
    _statsCharts.push(new Chart(ctxAB, {
      type: 'bar',
      data: {
        labels: niches.map(n => n.niche),
        datasets: [
          { label: 'Versie A reply%', data: niches.map(n => n.A.replyRate ?? 0), backgroundColor: BLUE + 'cc', borderRadius: 4 },
          { label: 'Versie B reply%', data: niches.map(n => n.B.replyRate ?? 0), backgroundColor: PURPLE + 'cc', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => v + '%' } } }
      }
    }));
  }

  // P&L chart
  const ctxPnL = document.getElementById('chartPnL')?.getContext('2d');
  if (ctxPnL && pnlData.months.length) {
    const labels = pnlData.months.map(m => new Date(m.month + '-02').toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }));
    _statsCharts.push(new Chart(ctxPnL, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Omzet',    data: pnlData.months.map(m => m.revenue), backgroundColor: GREEN + 'cc', borderRadius: 4 },
          { label: 'AI Kosten',data: pnlData.months.map(m => m.costs),   backgroundColor: RED   + 'cc', borderRadius: 4 },
          { label: 'Winst',    data: pnlData.months.map(m => m.profit),  backgroundColor: BLUE  + 'cc', borderRadius: 4 }
        ]
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 10 } } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => '€' + v } } }
      }
    }));
  }
}


// ─── Funnel chart (Task 11) ────────────────────────────────────────────────────
async function renderFunnelChart() {
  const data = await apiJSON('/api/stats/funnel');
  if (!data) return;

  const STAGE_LABELS = {
    lead_found:        'Lead gevonden',
    lead_emailed:      'Email verstuurd',
    email_opened:      'Email geopend',
    email_replied:     'Reply ontvangen',
    project_started:   'Project gestart',
    intake_completed:  'Intake ingevuld',
    first_build:       'Eerste build',
    invoice_sent:      'Factuur verstuurd',
    payment_received:  'Betaling ontvangen'
  };

  const maxCount = Math.max(...data.stages.map(s => s.count), 1);

  const funnelHtml = `
    <div class="card" style="margin-top:24px;">
      <div class="card-header"><h3 class="card-title">🔽 Conversie Funnel</h3></div>
      <div style="padding:20px;">
        ${data.stages.map(s => {
          const pct = Math.round((s.count / maxCount) * 100);
          return `
            <div style="margin-bottom:14px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                <span style="font-size:13px;font-weight:600;">${STAGE_LABELS[s.event] || s.event}</span>
                <span style="font-size:13px;color:var(--text-secondary);">${s.count} (${s.conversionRate}%)</span>
              </div>
              <div style="height:28px;background:#f3f4f6;border-radius:6px;overflow:hidden;">
                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,#6366f1,#818cf8);border-radius:6px;display:flex;align-items:center;padding-left:8px;transition:width .5s;">
                  ${s.count > 0 ? `<span style="font-size:11px;color:#fff;font-weight:700;">${s.count}</span>` : ''}
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`;

  const container = document.getElementById('content');
  if (container) container.insertAdjacentHTML('beforeend', funnelHtml);
}
