/**
 * routes/stats.js — All statistics/analytics routes
 * Extracted from server.js for code organization.
 */
'use strict';
const express = require('express');

module.exports = function createStatsRouter({ wsRead, wsWrite, scopeToUser, requireAdmin, authMiddleware, sendEmail, getDb }) {
  const router = express.Router();

router.get('', (req, res) => {
  const stored = wsRead(req, 'stats.json', {});
  const leads  = scopeToUser(wsRead(req, 'leads.json', []), req);
  const inbox  = scopeToUser(wsRead(req, 'inbox.json', []), req);

  const active = leads.filter(l => l.status !== 'disapproved' && l.status !== 'dead');

  const cutoff24h = new Date(Date.now() - 86400000).toISOString();
  const leadsLast24h = leads.filter(l => l.createdAt >= cutoff24h);

  const live = {
    leadsFound:       leads.length,
    emailsSent:       leads.filter(l => ['sent','scheduled','replied','client'].includes(l.status)).length,
    replies:          leads.filter(l => ['replied','client'].includes(l.status)).length,
    pipelineValue:    active.filter(l => (l.estimatedValue || 0) > 0).reduce((s, l) => s + l.estimatedValue, 0),
    totalEarned:      leads.reduce((s, l) => s + (l.payments || []).filter(p => p.status === 'paid').reduce((ps, p) => ps + (p.amount || 0), 0), 0),
    inboxPending:     inbox.filter(i => !i.status || i.status === 'pending').length,
    clients:          leads.filter(l => l.status === 'client').length,
    last24hLeads:     leadsLast24h.length,
    last24hValue:     leadsLast24h
                        .filter(l => l.status !== 'disapproved' && l.status !== 'dead' && (l.estimatedValue || 0) > 0)
                        .reduce((s, l) => s + l.estimatedValue, 0),
    todayLeads: (() => {
      const today = new Date().toISOString().slice(0, 10);
      const entry = (stored.weeklyData || []).find(w => w.date === today);
      return entry ? entry.count : 0;
    })(),
    // MEGA TASK 2 — NPS results from portal surveys
    nps: (() => {
      const responses = leads.filter(l => l.npsResponse?.score).map(l => ({ score: l.npsResponse.score, feedback: l.npsResponse.feedback, companyName: l.companyName, submittedAt: l.npsResponse.submittedAt }));
      if (!responses.length) return { count: 0, average: null, responses: [] };
      const avg = Math.round((responses.reduce((s, r) => s + r.score, 0) / responses.length) * 10) / 10;
      return { count: responses.length, average: avg, responses: responses.slice(0, 20) };
    })()
  };

  res.json({ ...stored, ...live });
});

router.get('/detailed', (req, res) => {
  const leads = scopeToUser(wsRead(req, 'leads.json', []), req);
  const days  = parseInt(req.query.days || '30', 10);
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  const byDate = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    byDate[d] = 0;
  }
  leads.filter(l => l.createdAt >= cutoff).forEach(l => {
    const d = (l.createdAt || '').slice(0, 10);
    if (d in byDate) byDate[d]++;
  });
  const leadsPerDay = Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));

  const byStatus = {};
  leads.forEach(l => { byStatus[l.status || 'unknown'] = (byStatus[l.status || 'unknown'] || 0) + 1; });

  const byNiche = {};
  leads.forEach(l => { if (l.niche) byNiche[l.niche] = (byNiche[l.niche] || 0) + 1; });

  const scoreBuckets = { '0-2': 0, '2-4': 0, '4-6': 0, '6-8': 0, '8-10': 0 };
  leads.forEach(l => {
    const s = l.score || 0;
    if (s < 2) scoreBuckets['0-2']++;
    else if (s < 4) scoreBuckets['2-4']++;
    else if (s < 6) scoreBuckets['4-6']++;
    else if (s < 8) scoreBuckets['6-8']++;
    else scoreBuckets['8-10']++;
  });

  const weekMap = {};
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.now() - i * 7 * 86400000);
    const wk = d.toISOString().slice(0,10).slice(0,7) + '-W' + String(getWeekNum(d)).padStart(2,'0');
    weekMap[wk] = 0;
  }
  function getWeekNum(d) { const s = new Date(d.getFullYear(),0,1); return Math.ceil(((d-s)/86400000+s.getDay()+1)/7); }
  leads.filter(l => l.createdAt && l.estimatedValue && l.status !== 'disapproved' && l.status !== 'dead').forEach(l => {
    const d = new Date(l.createdAt);
    const wk = d.toISOString().slice(0,7) + '-W' + String(getWeekNum(d)).padStart(2,'0');
    if (wk in weekMap) weekMap[wk] += l.estimatedValue;
  });
  const pipelineByWeek = Object.entries(weekMap).sort(([a],[b]) => a.localeCompare(b)).map(([week, value]) => ({ week, value }));

  const nicheStats = {};
  leads.forEach(l => {
    if (!l.niche) return;
    if (!nicheStats[l.niche]) nicheStats[l.niche] = { sent: 0, replied: 0 };
    if (['sent','replied','client','followup1','followup2','dead'].includes(l.status)) nicheStats[l.niche].sent++;
    if (['replied','client'].includes(l.status)) nicheStats[l.niche].replied++;
  });
  const replyRateByNiche = Object.entries(nicheStats)
    .filter(([,v]) => v.sent >= 2)
    .map(([niche, v]) => ({ niche, sent: v.sent, replied: v.replied, rate: Math.round(v.replied/v.sent*100) }))
    .sort((a,b) => b.rate - a.rate);

  const topLeads = [...leads].sort((a,b) => (b.score||0)-(a.score||0)).slice(0,5)
    .map(l => ({ id: l.id, companyName: l.companyName, score: l.score, niche: l.niche, status: l.status, estimatedValue: l.estimatedValue }));

  res.json({ leadsPerDay, byStatus, byNiche, scoreBuckets, pipelineByWeek, replyRateByNiche, topLeads });
});

router.get('/costs', (req, res) => {
  const stats = wsRead(req, 'stats.json', {});
  const log   = wsRead(req, 'activity.json', []);
  const today = new Date().toISOString().slice(0, 10);
  const todayCostUsd = log
    .filter(e => e.timestamp && e.timestamp.startsWith(today))
    .reduce((sum, e) => sum + (e.costUsd || 0), 0);
  res.json({
    totalTokensIn:  stats.totalApiTokensIn  || 0,
    totalTokensOut: stats.totalApiTokensOut || 0,
    totalCostUsd:   Math.round((stats.totalApiCostUsd || 0) * 10000) / 10000,
    todayCostUsd:   Math.round(todayCostUsd * 10000) / 10000
  });
});

router.get('/extended', authMiddleware, (req, res) => {
  try {
    const leads = wsRead(req, 'leads.json', []);
    const totalSent = leads.filter(l => l.sentAt).length;
    const totalReplied = leads.filter(l => l.repliedAt).length;
    const replyRate = totalSent > 0 ? Math.round(totalReplied / totalSent * 100) : 0;
    const avgScore = leads.length ? Math.round((leads.reduce((s,l) => s+(l.score||0),0)/leads.length)*10)/10 : 0;
    const activeProjects = leads.filter(l => l.status === 'client').length;
    const now = new Date();
    const thisMonth = leads.filter(l => (l.payments||[]).some(p => p.status==='paid' && new Date(p.paidAt).getMonth()===now.getMonth() && new Date(p.paidAt).getFullYear()===now.getFullYear()));
    const lastMonth = leads.filter(l => (l.payments||[]).some(p => p.status==='paid' && new Date(p.paidAt).getMonth()===(now.getMonth()-1+12)%12));
    const omzetDeze = thisMonth.reduce((s,l) => s + (l.payments||[]).filter(p=>p.status==='paid').reduce((a,p)=>a+parseFloat(p.amount||0),0), 0);
    const omzetVorige = lastMonth.reduce((s,l) => s + (l.payments||[]).filter(p=>p.status==='paid').reduce((a,p)=>a+parseFloat(p.amount||0),0), 0);
    const niches = {};
    leads.forEach(l => { const n = l.niche||'Onbekend'; niches[n] = (niches[n]||0)+1; });
    const statuses = {};
    leads.forEach(l => { const s = l.status||'new'; statuses[s] = (statuses[s]||0)+1; });
    const emailsPerWeek = Array.from({length:8},(_,i) => {
      const weekStart = new Date(now.getTime() - (7-i)*7*86400000);
      const weekEnd = new Date(now.getTime() - (6-i)*7*86400000);
      return leads.filter(l => l.sentAt && new Date(l.sentAt)>=weekStart && new Date(l.sentAt)<weekEnd).length;
    });
    res.json({ totalSent, totalReplied, replyRate, avgScore, activeProjects, omzetDeze, omzetVorige, niches, statuses, emailsPerWeek });
  } catch(e) { res.json({ error: e.message }); }
});

router.get('/ab', authMiddleware, (req, res) => {
  const leads = scopeToUser(wsRead(req, 'leads.json', []), req).filter(l => l.sentVersion);
  const sentStatuses = ['sent', 'replied', 'client', 'scheduled'];

  const empty = () => ({ sent: 0, replied: 0, opened: 0, bounced: 0 });
  const tot = { A: empty(), B: empty() };
  const byNiche = {};

  for (const l of leads) {
    const v = l.sentVersion === 'B' ? 'B' : 'A';
    tot[v].sent++;
    if (['replied', 'client'].includes(l.status)) tot[v].replied++;
    if (l.emailOpened) tot[v].opened++;
    if (l.emailBounced) tot[v].bounced++;

    const niche = l.niche || 'overig';
    if (!byNiche[niche]) byNiche[niche] = { A: empty(), B: empty() };
    byNiche[niche][v].sent++;
    if (['replied', 'client'].includes(l.status)) byNiche[niche][v].replied++;
    if (l.emailOpened) byNiche[niche][v].opened++;
    if (l.emailBounced) byNiche[niche][v].bounced++;
  }

  const rate = (n, d) => d > 0 ? Math.round(n / d * 1000) / 10 : null;
  const stats = (v) => ({
    sent:       tot[v].sent,
    replied:    tot[v].replied,
    opened:     tot[v].opened,
    bounced:    tot[v].bounced,
    replyRate:  rate(tot[v].replied, tot[v].sent),
    openRate:   rate(tot[v].opened,  tot[v].sent),
    bounceRate: rate(tot[v].bounced, tot[v].sent),
  });

  const a = stats('A');
  const b = stats('B');
  let winner = null;
  if (a.sent > 0 && b.sent > 0) {
    if ((a.replyRate ?? 0) > (b.replyRate ?? 0)) winner = 'A';
    else if ((b.replyRate ?? 0) > (a.replyRate ?? 0)) winner = 'B';
    else winner = 'tie';
  }

  const niches = Object.entries(byNiche).map(([niche, d]) => ({
    niche,
    A: { sent: d.A.sent, replyRate: rate(d.A.replied, d.A.sent) },
    B: { sent: d.B.sent, replyRate: rate(d.B.replied, d.B.sent) },
    winner: d.A.sent > 0 && d.B.sent > 0
      ? ((d.A.replied / d.A.sent) > (d.B.replied / d.B.sent) ? 'A' : (d.B.replied / d.B.sent) > (d.A.replied / d.A.sent) ? 'B' : 'tie')
      : null
  })).sort((x, y) => (y.A.sent + y.B.sent) - (x.A.sent + x.B.sent));

  res.json({ A: a, B: b, winner, niches, totalLeadsWithVersion: leads.length });
});

router.get('/pnl', authMiddleware, (req, res) => {
  const leads       = scopeToUser(wsRead(req, 'leads.json', []), req);
  const settings    = wsRead(req, 'settings.json', {});
  const activityLog = wsRead(req, 'activity.json', []);

  const USD_TO_EUR     = 0.92;
  const fixedCostsList = settings.fixedCosts && settings.fixedCosts.length
    ? settings.fixedCosts
    : (settings.monthlyHostingCost ? [{ name: 'Hosting', amount: settings.monthlyHostingCost }] : []);
  const hostingPerMonth = fixedCostsList.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0);
  const buckets = {};
  const getM = key => { if (!buckets[key]) buckets[key] = { revenue: 0, costs: 0 }; return buckets[key]; };

  // Revenue: sum of paid payments
  leads.forEach(lead => {
    (lead.payments || []).forEach(pay => {
      if (pay.status === 'paid' && pay.paidAt) {
        const m = pay.paidAt.slice(0, 7);
        getM(m).revenue += Number(pay.amount) || 0;
      }
    });
    // Fallback: clients with estimatedValue but no paid payments → count as MRR from projectStartDate
    if (lead.status === 'client' && (lead.estimatedValue || 0) > 0) {
      const hasPaid = (lead.payments || []).some(p => p.status === 'paid');
      if (!hasPaid) {
        const start = lead.projectStartDate || lead.projectStartedAt || lead.createdAt;
        if (start) getM(start.slice(0, 7)).revenue += Number(lead.estimatedValue) || 0;
      }
    }
  });

  // AI costs from activity log
  activityLog.forEach(entry => {
    if (entry.costUsd > 0 && entry.timestamp) {
      getM(entry.timestamp.slice(0, 7)).costs += (entry.costUsd || 0) * USD_TO_EUR;
    }
  });

  const now = new Date();
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets[key] || { revenue: 0, costs: 0 };
    const revenue = Math.round(b.revenue * 100) / 100;
    const costs   = Math.round((b.costs + hostingPerMonth) * 100) / 100;
    months.push({ month: key, revenue, costs, profit: Math.round((revenue - costs) * 100) / 100 });
  }

  const totalRevenue = Math.round(months.reduce((s, m) => s + m.revenue, 0) * 100) / 100;
  const totalCosts   = Math.round(months.reduce((s, m) => s + m.costs,   0) * 100) / 100;
  const totalProfit  = Math.round((totalRevenue - totalCosts) * 100) / 100;
  const margin       = totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) : 0;

  res.json({ months, totalRevenue, totalCosts, totalProfit, margin });
});

router.get('/funnel', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const db = getDb();
  const STAGES = ['lead_found','lead_emailed','email_opened','email_replied','project_started','intake_completed','first_build','invoice_sent','payment_received'];
  const result = STAGES.map(event => {
    const row = db.prepare('SELECT COUNT(DISTINCT lead_id) as c FROM funnel_events WHERE event=?').get(event);
    return { event, count: row ? row.c : 0 };
  });
  // Compute conversion rates between consecutive stages
  for (let i = 1; i < result.length; i++) {
    const prev = result[i-1].count;
    result[i].conversionRate = prev > 0 ? Math.round((result[i].count / prev) * 100) : 0;
  }
  result[0].conversionRate = 100;
  res.json({ stages: result });
});

router.get('/forecast', requireAdmin, (req, res) => {
  const leads    = wsRead(req, 'leads.json', []);
  const clients  = leads.filter(l => l.status === 'client');
  const settings = wsRead(req, 'settings.json', {});
  const activity = wsRead(req, 'activity.json', []);

  // MRR: sum monthly payments from clients
  let current_mrr = 0;
  for (const lead of clients) {
    const paidMonthly = (lead.payments || []).filter(p => p.status === 'paid' && p.billing === 'maandelijks');
    if (paidMonthly.length) {
      current_mrr += paidMonthly.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    } else if (lead.estimatedValue > 0) {
      current_mrr += lead.estimatedValue;
    }
  }

  // Pipeline value: open invoices
  let pipeline_value = 0;
  for (const lead of leads) {
    const openInvoices = (lead.payments || []).filter(p => p.status === 'pending' || p.status === 'sent');
    pipeline_value += openInvoices.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
  }

  const current_arr = current_mrr * 12;
  const forecast_30d = current_mrr + (pipeline_value * 0.3);

  // Growth rate: compare this month vs last month revenue from activity
  const now = new Date();
  const thisMonthKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const lastMonth = new Date(now); lastMonth.setMonth(lastMonth.getMonth()-1);
  const lastMonthKey = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth()+1).padStart(2,'0')}`;
  const revByMonth = {};
  for (const a of activity) {
    if (a.type !== 'payment') continue;
    const key = (a.at || '').slice(0,7);
    revByMonth[key] = (revByMonth[key] || 0) + (parseFloat(a.amount) || 0);
  }
  const thisRev = revByMonth[thisMonthKey] || current_mrr;
  const lastRev = revByMonth[lastMonthKey] || current_mrr;
  const growth_rate = lastRev > 0 ? (thisRev - lastRev) / lastRev : 0;
  const forecast_90d = current_mrr * Math.pow(1 + growth_rate, 3);

  const churn_risk_count = clients.filter(l => {
    const lastActivity = l.history?.slice(-1)[0]?.at;
    if (!lastActivity) return false;
    return Date.now() - new Date(lastActivity).getTime() > 45 * 86400000;
  }).length;

  // Last 6 months actual revenue
  const months_actual = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });
    months_actual.push({ key, label, revenue: revByMonth[key] || (i === 0 ? current_mrr : 0) });
  }
  // Next 3 months projected
  const months_projected = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(); d.setMonth(d.getMonth() + i);
    const label = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' });
    months_projected.push({ label, revenue: Math.round(current_mrr * Math.pow(1 + growth_rate, i)) });
  }

  res.json({
    current_mrr: Math.round(current_mrr),
    current_arr: Math.round(current_arr),
    pipeline_value: Math.round(pipeline_value),
    forecast_30d: Math.round(forecast_30d),
    forecast_90d: Math.round(forecast_90d),
    churn_risk_count,
    growth_rate: Math.round(growth_rate * 100),
    months_actual,
    months_projected
  });
});

router.get('/export.csv', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json') || [];
  const rows = [['Bedrijf','Email','Status','Score','Locatie','Niche','Verstuurd','Reply','Klant sinds','Omzet'].join(',')];
  leads.forEach(l => {
    const revenue = (l.payments||[]).filter(p=>p.status==='paid').reduce((s,p)=>s+(p.amount||0),0);
    rows.push([
      `"${(l.companyName||'').replace(/"/g,'""')}"`,
      `"${(l.contactEmail||'').replace(/"/g,'""')}"`,
      l.status||'',
      l.score||'',
      `"${(l.location||'').replace(/"/g,'""')}"`,
      l.niche||'',
      l.sentAt?.slice(0,10)||'',
      l.repliedAt?.slice(0,10)||'',
      l.projectStartedAt?.slice(0,10)||'',
      revenue
    ].join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="stats-export.csv"');
  res.send(rows.join('\n'));
});

router.get('/heatmap', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const grid = {};
  const days = ['Zo','Ma','Di','Wo','Do','Vr','Za'];
  days.forEach(d => { grid[d] = {}; for (let h=0; h<24; h++) grid[d][h] = { sent:0, replied:0 }; });
  leads.forEach(l => {
    if (!l.sentAt) return;
    const d = new Date(l.sentAt);
    const day = days[d.getDay()]; const hour = d.getHours();
    if (grid[day]?.[hour]) {
      grid[day][hour].sent++;
      if (l.repliedAt) grid[day][hour].replied++;
    }
  });
  const result = days.map(day => ({
    day,
    hours: Array.from({length:24},(_,h) => ({
      hour:h,
      sent: grid[day][h].sent,
      replied: grid[day][h].replied,
      rate: grid[day][h].sent > 0 ? Math.round(grid[day][h].replied/grid[day][h].sent*100) : 0
    }))
  }));
  res.json({ heatmap: result });
});

router.get('/top-subjects', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const subjects = {};
  leads.forEach(l => {
    const subj = l.emailA?.subject || l.subjectOptions?.[0] || l.emailSubject || '';
    if (!subj) return;
    if (!subjects[subj]) subjects[subj] = { subject: subj, sent: 0, opened: 0, replied: 0 };
    subjects[subj].sent++;
    if (l.openedAt) subjects[subj].opened++;
    if (l.repliedAt) subjects[subj].replied++;
  });
  const result = Object.values(subjects)
    .filter(s => s.sent >= 2)
    .map(s => ({ ...s, replyRate: Math.round(s.replied/s.sent*100), openRate: Math.round(s.opened/s.sent*100) }))
    .sort((a,b) => b.replyRate - a.replyRate)
    .slice(0, 10);
  res.json({ subjects: result });
});

router.get('/niches', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const niches = {};
  leads.forEach(l => {
    const n = l.niche || 'overig';
    if (!niches[n]) niches[n] = { niche: n, found: 0, emailed: 0, replied: 0, clients: 0, revenue: 0 };
    niches[n].found++;
    if (['sent','replied','client','scheduled'].includes(l.status)) niches[n].emailed++;
    if (['replied','client'].includes(l.status)) niches[n].replied++;
    if (l.status === 'client') niches[n].clients++;
    niches[n].revenue += (l.payments||[]).filter(p=>p.status==='paid').reduce((s,p)=>s+(p.amount||0),0);
  });
  const result = Object.values(niches)
    .map(n => ({ ...n, replyRate: n.emailed > 0 ? Math.round(n.replied/n.emailed*100) : 0 }))
    .sort((a,b) => b.replyRate - a.replyRate);
  res.json({ niches: result });
});

router.get('/sources', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json') || [];
  const sources = {};
  leads.forEach(l => {
    const src = l.source || l.leadSource || 'web';
    if (!sources[src]) sources[src] = { source: src, found: 0, approved: 0, replied: 0, client: 0 };
    sources[src].found++;
    if (!['pending','new'].includes(l.status||'')) sources[src].approved++;
    if (['replied','client'].includes(l.status)) sources[src].replied++;
    if (l.status === 'client') sources[src].client++;
  });
  res.json({ sources: Object.values(sources) });
});

  return router;
};
