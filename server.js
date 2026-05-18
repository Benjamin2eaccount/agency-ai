require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const Stripe = require('stripe');
const webpush = require('web-push');
const { readJSON, writeJSON, pgInitPromise } = require('./database');
const dnsPromises = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'agency_ai_secret';
const DATA_DIR = path.join(__dirname, 'data');

// ── In-memory error log (last 100, resets on restart) ─────────────────────────
const RUN_ERRORS = [];
function logError(type, message, details = null) {
  RUN_ERRORS.unshift({ time: new Date().toISOString(), type, message, details: details || null });
  if (RUN_ERRORS.length > 100) RUN_ERRORS.pop();
}

const DEFAULT_SERVICES = [
  { name: 'Meta advertenties met AI',             price: 750,  billing: 'maandelijks', description: 'Facebook & Instagram ads opgezet en beheerd met AI-optimalisatie' },
  { name: 'Google Ads met AI',                    price: 650,  billing: 'maandelijks', description: 'Google Search en Display campagnes met wekelijkse AI-optimalisatie' },
  { name: 'AI content voor social media',         price: 395,  billing: 'maandelijks', description: 'Dagelijkse posts, captions en hashtags gegenereerd door AI' },
  { name: 'AI chatbot voor website',              price: 495,  billing: 'maandelijks', description: '24/7 klantenservice chatbot die vragen beantwoordt en leads vangt' },
  { name: 'Automatisch lead outreach systeem',    price: 995,  billing: 'maandelijks', description: 'Volledig automatisch koude emails en follow-ups naar prospects' },
  { name: 'Lokale SEO optimalisatie',             price: 450,  billing: 'maandelijks', description: 'Google ranking verbeteren voor lokale zoekopdrachten en Google Maps' },
  { name: 'Google Bedrijfsprofiel optimalisatie', price: 295,  billing: 'maandelijks', description: 'Google Maps profiel optimaliseren voor maximale lokale zichtbaarheid' },
  { name: 'Professionele website bouwen',         price: 1495, billing: 'eenmalig',    description: 'Complete website op maat gebouwd, geoptimaliseerd en gelanceerd' },
  { name: 'Website snelheid & SEO technisch',     price: 395,  billing: 'eenmalig',    description: 'Website technisch versnellen en optimaliseren voor betere rankings' },
  { name: 'Online boekingssysteem integreren',    price: 495,  billing: 'eenmalig',    description: 'Boekingssoftware koppelen aan de website voor directe afspraken' },
  { name: 'Email marketing automatisering',       price: 395,  billing: 'maandelijks', description: 'Gepersonaliseerde email flows voor leads, klanten en winback' },
  { name: 'WhatsApp Business automatisering',     price: 295,  billing: 'maandelijks', description: 'Geautomatiseerde WhatsApp berichten voor leads en klantenservice' },
  { name: 'AI video content creatie',             price: 595,  billing: 'maandelijks', description: 'Reels, TikToks en Shorts scripts en productie met AI' },
  { name: 'Reputatie management (reviews)',       price: 275,  billing: 'maandelijks', description: 'Automatisch reageren op Google en Facebook reviews met AI' },
  { name: 'Analytics & rapportage dashboard',     price: 375,  billing: 'eenmalig',    description: 'Volledig KPI-rapportage dashboard op maat opgezet en geconfigureerd' }
];

// Auto-create data directory (database.js handles SQLite init)
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Seed defaults into SQLite for fresh deploys (readJSON/writeJSON use SQLite)
const DATA_DEFAULTS = {
  'leads.json':      [],
  'inbox.json':      [],
  'runs.json':       [],
  'stats.json':      { leadsFound: 0, emailsSent: 0, replies: 0, pipelineValue: 0, weeklyData: [], newReplies: [], abStats: { aApproved: 0, bApproved: 0 } },
  'memory.json':     {},
  'blacklist.json':  [],
  'notifications.json':   [],
  'contacts.json':        [],
  'push-subscriptions.json': [],
  'webhooks.json': []
};
Object.entries(DATA_DEFAULTS).forEach(([file, def]) => {
  if (!readJSON(file)) writeJSON(file, def);
});

if (!readJSON('settings.json')) {
  const hash = bcrypt.hashSync('agency2024', 12);
  writeJSON('settings.json', {
    username: 'admin', password: hash,
    agencyName: 'Agency AI', myName: 'Ekow', myTitle: 'AI Growth Specialist',
    gmailAddress: '', gmailPassword: '', linkedinUrl: '', stripeSecretKey: '',
    mollieApiKey: '', paypalMe: '', preferredPaymentMethod: 'stripe',
    dailyRunTime: '09:00', leadsPerDay: 15, autoApproveScore: 8.0, automationPaused: false,
    replyDetection: true, dailyBriefingEnabled: true, dailyBriefingTime: '08:45',
    smartAutoApprove: { enabled: false, scoreThreshold: 8.0, requireNoAds: true, minFollowers: 5000, requireWebsite: true },
    autoClientEmails: { welcome: true, intakeReceived: true, deliveryReady: true, weekComplete: true, monthlyUpdate: true, checkIn: true },
    autoInvoiceEnabled: false, autoInvoiceDay: 1, paymentReminderDays: 7,
    monthlyReports: true, webhookToken: '', webhookConfigured: false,
    backupEnabled: true, backupTime: '02:00', backupEmail: true,
    targetCompanySizes: ['small', 'medium'],
    websiteTagline: 'Meer klanten. Minder werk. Volledig automatisch.',
    websiteAbout: 'Wij gebruiken AI om lokale bedrijven te helpen groeien — van het vinden van kansen tot het schrijven van gepersonaliseerde emails, volledig op autopiloot.',
    websiteContact: '',
    services: DEFAULT_SERVICES
  });
}

// Seed users store — migrate admin from settings.json on first run
if (!readJSON('users.json')) {
  const s = readJSON('settings.json') || {};
  writeJSON('users.json', [{
    id: '1',
    username: s.username || 'admin',
    password: s.password || bcrypt.hashSync('agency2024', 12),
    name: s.myName || 'Admin',
    role: 'admin',
    createdAt: new Date().toISOString()
  }]);
}

// If ADMIN_PASSWORD env var is set, force-reset the admin account on startup
if (process.env.ADMIN_PASSWORD) {
  const users = readJSON('users.json') || [];
  const idx = users.findIndex(u => u.role === 'admin');
  const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 12);
  if (idx >= 0) {
    users[idx].password = hash;
    users[idx].username = process.env.ADMIN_USERNAME || users[idx].username || 'admin';
  } else {
    users.push({ id: '1', username: process.env.ADMIN_USERNAME || 'admin', password: hash, name: 'Admin', role: 'admin', createdAt: new Date().toISOString() });
  }
  writeJSON('users.json', users);
  console.log('[Startup] Admin wachtwoord gereset via ADMIN_PASSWORD env var');
}

// ── Web Push / VAPID setup ────────────────────────────────────────────────────
(function initVapid() {
  const settings = readJSON('settings.json') || {};
  if (!settings.vapidPublicKey || !settings.vapidPrivateKey) {
    const keys = webpush.generateVAPIDKeys();
    settings.vapidPublicKey  = keys.publicKey;
    settings.vapidPrivateKey = keys.privateKey;
    writeJSON('settings.json', settings);
  }
  if (!settings.zapierIncomingToken) {
    settings.zapierIncomingToken = crypto.randomBytes(20).toString('hex');
    writeJSON('settings.json', settings);
  }
  webpush.setVapidDetails(
    'mailto:' + (settings.gmailAddress || 'admin@agency.ai'),
    settings.vapidPublicKey,
    settings.vapidPrivateKey
  );
})();

async function sendPushToAll(title, body, url) {
  const settings = readJSON('settings.json') || {};
  const subs = readJSON('push-subscriptions.json') || [];
  if (!subs.length) return;
  const payload = JSON.stringify({ title, body, url: url || '/app' });
  const dead = [];
  await Promise.allSettled(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub.subscription, payload, {
        vapidDetails: {
          subject: 'mailto:' + (settings.gmailAddress || 'admin@agency.ai'),
          publicKey:  settings.vapidPublicKey,
          privateKey: settings.vapidPrivateKey,
        }
      });
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) dead.push(sub.id);
    }
  }));
  if (dead.length) {
    const cleaned = subs.filter(s => !dead.includes(s.id));
    writeJSON('push-subscriptions.json', cleaned);
  }
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// ─── Public config (no auth) ─────────────────────────────────────────────────
app.get('/api/public-config', (req, res) => {
  const s = readJSON('settings.json') || {};
  res.json({
    agencyName:  s.agencyName  || 'Agency AI',
    calendlyUrl: s.calendlyUrl || null,
    gaId:        s.gaId        || null
  });
});

// ─── Clean URL routes (must come after static so files still work) ───────────
app.get('/', (req, res) => { console.log('[route] GET / → landing.html'); res.sendFile(path.join(__dirname, 'public', 'landing.html')); });
app.get('/login',        (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/client',       (_, res) => res.sendFile(path.join(__dirname, 'public', 'client-login.html')));
app.get('/client-login', (_, res) => res.sendFile(path.join(__dirname, 'public', 'client-login.html')));
app.get('/app',          (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/status',       (_, res) => res.sendFile(path.join(__dirname, 'public', 'status.html')));

// readJSON / writeJSON are provided by database.js (SQLite-backed)

function addActivity(type, label, opts) {
  opts = opts || {};
  const logFile = path.join(DATA_DIR, 'activity.json');
  let log = [];
  try {
    if (fs.existsSync(logFile)) {
      const raw = fs.readFileSync(logFile, 'utf8').replace(/^\uFEFF/, '');
      log = JSON.parse(raw);
    }
  } catch { log = []; }
  log.unshift({
    id:        Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    type,
    label,
    timestamp: new Date().toISOString(),
    tokensIn:  opts.tokensIn  || 0,
    tokensOut: opts.tokensOut || 0,
    costUsd:   opts.costUsd   || 0,
    meta:      opts.meta      || {}
  });
  if (log.length > 500) log = log.slice(0, 500);
  fs.writeFileSync(logFile, JSON.stringify(log, null, 2), 'utf8');
}

function addNotification(type, title, body, leadId) {
  const notifications = readJSON('notifications.json') || [];
  notifications.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    type, title, body,
    leadId: leadId || null,
    read: false,
    createdAt: new Date().toISOString()
  });
  if (notifications.length > 200) notifications.splice(200);
  writeJSON('notifications.json', notifications);

  const pushTypes = ['reply_received', 'intake_submitted', 'high_score_lead', 'payment_overdue', 'run_complete', 'calendly_booking'];
  if (pushTypes.includes(type)) {
    const url = leadId ? `/app#lead-${leadId}` : '/app';
    sendPushToAll(title, body, url).catch(() => {});
  }
}

// ─── Outgoing webhook helper ──────────────────────────────────────────────────

async function fireWebhooks(event, payload) {
  const hooks = (readJSON('webhooks.json') || []).filter(h => h.active !== false && (h.events || []).includes(event));
  if (!hooks.length) return;
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
  for (const hook of hooks) {
    try {
      const r = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'AgencyAI-Webhook/1.0' },
        body,
        signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
      });
      const all = readJSON('webhooks.json') || [];
      const idx = all.findIndex(h => h.id === hook.id);
      if (idx !== -1) {
        all[idx].lastTriggeredAt = new Date().toISOString();
        all[idx].lastStatus = r.ok ? 'ok' : `${r.status}`;
        writeJSON('webhooks.json', all);
      }
    } catch (e) {
      console.warn(`[Webhook] ${hook.url} fout:`, e.message);
      const all = readJSON('webhooks.json') || [];
      const idx = all.findIndex(h => h.id === hook.id);
      if (idx !== -1) { all[idx].lastStatus = 'error'; writeJSON('webhooks.json', all); }
    }
  }
}

function getSeasonalContext(lang = 'nl') {
  const now   = new Date();
  const month = now.getMonth(); // 0 = jan
  const day   = now.getDate();

  // [month]: { nl: { season, hook, event }, en: { ... } }
  const SEASONAL = [
    /* Jan */ { nl: { season: 'Januari', hook: 'Veel bedrijven starten het nieuwe jaar met nieuwe budgetten en plannen — ideaal moment om in gesprek te gaan.', event: 'Nieuwjaar' }, en: { season: 'January', hook: 'Most businesses kick off the new year with fresh budgets and plans — the perfect time to start a conversation.', event: 'New Year' } },
    /* Feb */ { nl: { season: 'Februari', hook: 'Valentijnsdag brengt extra aandacht voor cadeaus, horeca en beauty — goed moment voor een seizoensactie.', event: 'Valentijnsdag' }, en: { season: 'February', hook: 'Valentine\'s Day drives traffic for hospitality, retail and beauty — great timing for a seasonal push.', event: 'Valentine\'s Day' } },
    /* Mar */ { nl: { season: 'Lente', hook: 'De lente is hét moment om je online aanwezigheid op te frissen voor het drukke seizoen.', event: 'Lente' }, en: { season: 'Spring', hook: 'Spring is the ideal time to refresh your online presence before the busy season picks up.', event: 'Spring' } },
    /* Apr */ { nl: { season: 'Lente', hook: 'Pasen en de lentevakantie zorgen voor extra drukte — slim om nu te adverteren voordat concurrenten het doen.', event: 'Pasen' }, en: { season: 'Spring', hook: 'Easter and spring breaks drive consumer spending — smart to advertise before competitors ramp up.', event: 'Easter' } },
    /* May */ { nl: { season: 'Mei', hook: 'Moederdag en de aanloop naar de zomer zijn krachtige haakjes voor seizoensgerichte campagnes.', event: 'Moederdag' }, en: { season: 'May', hook: 'Mother\'s Day and early summer momentum are powerful hooks for seasonal campaigns right now.', event: 'Mother\'s Day' } },
    /* Jun */ { nl: { season: 'Zomer', hook: 'De zomer staat voor de deur — bedrijven die nu investeren in zichtbaarheid plukken er de vruchten van in het hoogseizoen.', event: 'Zomer' }, en: { season: 'Summer', hook: 'Summer is almost here — businesses that invest in visibility now will reap the rewards during peak season.', event: 'Summer' } },
    /* Jul */ { nl: { season: 'Zomer', hook: 'Juli is rustig voor veel bedrijven — ideaal om stille uren te benutten om je online kanalen klaar te stomen voor het najaar.', event: 'Zomervakantie' }, en: { season: 'Summer', hook: 'July is quiet for many businesses — a perfect window to prepare your online presence for the autumn rush.', event: 'Summer holidays' } },
    /* Aug */ { nl: { season: 'Zomer', hook: 'De zomervakantie loopt bijna af — slimme bedrijven bereiden nu hun najaarscampagnes voor.', event: 'Einde zomervakantie' }, en: { season: 'Late Summer', hook: 'Summer holidays are wrapping up — smart businesses are already setting up autumn campaigns.', event: 'Back to school' } },
    /* Sep */ { nl: { season: 'Najaar', hook: 'September betekent herstart: nieuwe budgetcycli, meer beslissers beschikbaar en hoge koopintentie.', event: 'Septemberstart' }, en: { season: 'Autumn', hook: 'September means a fresh start: new budget cycles, decision-makers back at their desks, and high buying intent.', event: 'September restart' } },
    /* Oct */ { nl: { season: 'Najaar', hook: 'Q4 is begonnen — de laatste sprint van het jaar voor omzetdoelen. Nu is het moment om vol gas te geven op marketing.', event: 'Q4 sprint' }, en: { season: 'Autumn', hook: 'Q4 has begun — the final push to hit annual targets. Now is the time to go all-in on marketing.', event: 'Q4 sprint' } },
    /* Nov */ { nl: { season: 'Winter', hook: 'Black Friday en de aanloop naar Kerst zijn de drukste weken van het jaar. Wie nu zichtbaar is, wint.', event: 'Black Friday / Sinterklaas' }, en: { season: 'Winter', hook: 'Black Friday and the run-up to Christmas are the busiest weeks of the year. Visibility now means revenue.', event: 'Black Friday / Christmas' } },
    /* Dec */ { nl: { season: 'Kerst', hook: 'December is de laatste kans van het jaar én het moment waarop klanten actief op zoek zijn naar diensten en cadeaus.', event: 'Kerst & Oud & Nieuw' }, en: { season: 'Christmas', hook: 'December is the last chance of the year and the moment customers are actively searching for services and gifts.', event: 'Christmas & New Year' } },
  ];

  const ctx = SEASONAL[month][lang] || SEASONAL[month].nl;
  return ctx;
}

function isBlacklisted(lead) {
  const list = readJSON('blacklist.json') || [];
  if (!list.length) return false;
  const name   = (lead.companyName  || '').toLowerCase();
  const domain = (lead.websiteUrl   || '').replace(/^https?:\/\//,'').split('/')[0].toLowerCase();
  const niche  = (lead.niche        || '').toLowerCase();
  return list.some(entry => {
    const v = (entry.value || '').toLowerCase();
    if (entry.type === 'company') return name.includes(v) || v.includes(name);
    if (entry.type === 'domain')  return domain.includes(v) || v.includes(domain);
    if (entry.type === 'niche')   return niche === v;
    return false;
  });
}

function addLeadHistory(leads, leadId, event) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.history) lead.history = [];
  lead.history.push({ ...event, time: new Date().toISOString() });
}

const NL_DAYS = ['zondag','maandag','dinsdag','woensdag','donderdag','vrijdag','zaterdag'];

const SUB_NICHES = {
  beauty:     ['kapsalon', 'nagelsalon', 'schoonheidssalon', 'tattoo studio', 'barbershop'],
  food:       ['bakkerij', 'traiteur', 'foodtruck', 'ijssalon', 'slagerij'],
  fitness:    ['personal trainer', 'yoga studio', 'crossfit box', 'sportschool', 'martial arts'],
  retail:     ['kledingwinkel', 'schoenenwinkel', 'juwelier', 'boekenwinkel', 'cadeauwinkel'],
  restaurant: ['Italiaans restaurant', 'sushi restaurant', 'café', 'eetcafé', 'steakhouse'],
  horeca:     ['hotel', 'bed & breakfast', 'hostel', 'vakantiepark', 'camping'],
  health:     ['tandarts', 'fysiotherapeut', 'chiropractor', 'opticien', 'apotheek'],
  automotive: ['garagebedrijf', 'autoverkoop', 'wasstraat', 'bandendienst', 'schadeherstelbedrijf'],
};

function getOptimalSendTime(niche) {
  const n = (niche || '').toLowerCase();
  let targetDay, targetHour;
  if (n.includes('restaurant') || n.includes('food') || n.includes('horeca') || n.includes('café') || n.includes('eetcafé') || n.includes('bakkerij') || n.includes('ijssalon') || n.includes('traiteur')) {
    targetDay = 2; targetHour = 10;
  } else if (n.includes('beauty') || n.includes('wellness') || n.includes('salon') || n.includes('spa') || n.includes('kapsalon') || n.includes('nagel') || n.includes('schoonheid') || n.includes('barbershop')) {
    targetDay = 1; targetHour = 9;
  } else if (n.includes('fitness') || n.includes('sport') || n.includes('gym') || n.includes('yoga') || n.includes('crossfit') || n.includes('martial') || n.includes('personal trainer')) {
    targetDay = 2; targetHour = 8;
  } else if (n.includes('retail') || n.includes('shop') || n.includes('webshop') || n.includes('winkel') || n.includes('juwelier') || n.includes('schoenen') || n.includes('kleding')) {
    targetDay = 3; targetHour = 10;
  } else if (n.includes('health') || n.includes('tandarts') || n.includes('fysiotherapeut') || n.includes('apotheek') || n.includes('opticien')) {
    targetDay = 2; targetHour = 11;
  } else if (n.includes('automotive') || n.includes('garage') || n.includes('auto') || n.includes('banden')) {
    targetDay = 3; targetHour = 9;
  } else {
    targetDay = 2; targetHour = 10;
  }
  const now = new Date();
  const result = new Date(now);
  result.setHours(targetHour, 0, 0, 0);
  let daysUntil = (targetDay - result.getDay() + 7) % 7;
  if (daysUntil === 0 && result <= now) daysUntil = 7;
  result.setDate(result.getDate() + daysUntil);
  return result.toISOString();
}

function getMemoryKey(niche, country) {
  return `${(niche||'unknown').toLowerCase().replace(/[^a-z]/g,'')}` +
         `_${(country||'unknown').toLowerCase().replace(/[^a-z]/g,'')}`;
}

function updateMemory(niche, country, type) {
  const memory = readJSON('memory.json') || {};
  const key = getMemoryKey(niche, country);
  if (!memory[key]) {
    memory[key] = { niche: niche||'unknown', country: (country||'unknown').toUpperCase(), sent: 0, replied: 0, replyRate: 0 };
  }
  if (type === 'sent')    memory[key].sent    = (memory[key].sent    || 0) + 1;
  if (type === 'replied') memory[key].replied = (memory[key].replied || 0) + 1;
  const { sent, replied } = memory[key];
  memory[key].replyRate = sent > 0 ? Math.round((replied / sent) * 1000) / 10 : 0;
  writeJSON('memory.json', memory);
}

// â"€â"€â"€ Email helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildEmailHTML(body, agencyName, myName, myTitle, trackingToken, opts) {
  opts = opts || {};
  const myEmail = opts.myEmail || '';
  const calendlyLink = opts.calendlyLink || '';
  const baseUrl = process.env.BASE_URL || '';

  const e = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

  // Initials from name
  const nameParts = (myName || 'AA').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0] ? nameParts[0][0] : 'A') + (nameParts.length > 1 ? nameParts[nameParts.length-1][0] : (nameParts[0] && nameParts[0][1] ? nameParts[0][1] : 'A'))).toUpperCase();

  // Body to paragraphs
  const escapedBody = e(body || '');
  const paragraphs = escapedBody
    .split(/\n{2,}/)
    .map(function(b){ return b.replace(/\n/g,'<br>').trim(); })
    .filter(Boolean)
    .map(function(b){ return '<p style="margin:0 0 18px;font-size:15px;line-height:1.75;color:#1a1a1a;font-family:Georgia,serif">' + b + '</p>'; })
    .join('');

  const ctaText = calendlyLink ? 'Plan een gratis kennismakingsgesprek &rarr;' : 'Beantwoord deze email voor meer informatie';
  const ctaHref = calendlyLink || (myEmail ? 'mailto:' + e(myEmail) : '#');
  const pixel = trackingToken ? '<img src="' + baseUrl + '/track/open/' + trackingToken + '" width="1" height="1" style="display:block;width:1px;height:1px;opacity:0;border:0" alt="">' : '';

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${e(agencyName || 'Agency AI')}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f2;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<!--[if mso]><center><table width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f2">
  <tr><td align="center" valign="top" style="padding:32px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
      <tr><td style="padding:22px 32px;background:#ffffff;border-bottom:2px solid #e8e8e5">
        <span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#111111">${e(agencyName || 'Agency AI')}</span>
      </td></tr>
      <tr><td style="padding:32px 32px 10px;background:#ffffff">${paragraphs}</td></tr>
      <tr><td align="center" style="padding:6px 32px 32px;background:#ffffff">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr><td align="center" style="background:#111111;border-radius:6px">
            <a href="${ctaHref}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none">${ctaText}</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#e8e8e5;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
      <tr><td style="padding:22px 32px;background:#f9f9f8">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="vertical-align:top">
              <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1a1a1a">${e(myName||'')}</p>
              <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">${e(myTitle||'AI Growth Specialist')} &middot; ${e(agencyName||'Agency AI')}</p>
              ${myEmail ? '<p style="margin:0 0 3px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F4E7;&nbsp;' + e(myEmail) + '</p>' : ''}
              <p style="margin:0 0 3px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F310;&nbsp;www.agencyai.info</p>
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F4CD;&nbsp;Nederland</p>
            </td>
            <td valign="top" align="right" style="vertical-align:top;width:44px;padding-left:16px">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>
                <td align="center" valign="middle" style="width:36px;height:36px;background:#111111;border-radius:4px">
                  <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#ffffff;display:block;line-height:36px;text-align:center">${initials}</span>
                </td>
              </tr></table>
            </td>
          </tr>
        </table>
      </td></tr>
      <tr><td style="padding:16px 32px;background:#f4f4f2;border-top:1px solid #e8e8e5">
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center;line-height:1.5">U ontvangt deze email omdat uw bedrijf voldoet aan onze selectiecriteria voor groeipotentieel. Wilt u geen emails meer ontvangen? Stuur een reply met &#39;Uitschrijven&#39;.</p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center">&copy; 2026 ${e(agencyName||'Agency AI')} &mdash; www.agencyai.info</p>
      </td></tr>
    </table>
  </td></tr>
</table>
<!--[if mso]></td></tr></table></center><![endif]-->
${pixel}
</body>
</html>`;
  return html;
}

// Sanitize email subject: replace fancy Unicode chars with ASCII equivalents
function sanitizeSubject(s) {
  return String(s || '')
    .replace(/[–—−]/g, '-')   // en-dash, em-dash, minus sign → hyphen
    .replace(/[‘’ʼ]/g, "'")   // smart single quotes → apostrophe
    .replace(/[“”]/g, '"')         // smart double quotes → plain quote
    .replace(/…/g, '...')               // ellipsis → three dots
    .replace(/ /g, ' ')                 // non-breaking space → space
    .replace(/[^\x20-\x7E]/g, '')           // strip all remaining non-printable-ASCII
    .trim();
}

async function sendEmail({ to, subject, body, html, settings: _settings = {}, trackingToken }) {
  const s = readJSON('settings.json') || {};
  const agencyName  = s.agencyName  || _settings.agencyName || 'Agency AI';
  const myName      = s.myName      || _settings.myName     || 'Admin';
  const myTitle     = s.myTitle     || _settings.myTitle    || '';
  const htmlBody    = html || buildEmailHTML(body, agencyName, myName, myTitle, trackingToken, {
    myEmail:      s.gmailAddress || s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || '',
    calendlyLink: s.calendlyUrl  || '',
  });
  const resendKey   = s.resendApiKey || process.env.RESEND_API_KEY;
  const fromAddress = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info';
  const cleanSubject = sanitizeSubject(subject);

  if (!resendKey) {
    throw new Error('Email niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen → Email.');
  }

  const { default: fetch } = await import('node-fetch');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `"${agencyName}" <${fromAddress}>`, to, subject: cleanSubject, html: htmlBody, text: body || '' }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || d.error || `Resend fout ${r.status}`);
  addActivity('email_sent', `Email verstuurd → ${to}`, { cost: 0 });
}

// â"€â"€â"€ Auth middleware â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// AES-256-CBC helpers for API key storage
const _aesKey = crypto.scryptSync(JWT_SECRET, 'agency-ai-salt', 32);
function encryptApiKey(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', _aesKey, iv);
  return iv.toString('hex') + ':' + Buffer.concat([cipher.update(text), cipher.final()]).toString('hex');
}
function decryptApiKey(stored) {
  const [ivHex, encHex] = stored.split(':');
  const decipher = crypto.createDecipheriv('aes-256-cbc', _aesKey, Buffer.from(ivHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString();
}
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Gmail password: encrypt/decrypt using same AES key
function encryptGmailPassword(plain) { return encryptApiKey(plain); }
function decryptGmailPassword(enc)   { return decryptApiKey(enc); }

// Always call this to get the real Gmail app-password.
// Priority: encrypted DB value → raw DB value (legacy) → env var
function getGmailPassword(s) {
  if (s.gmailPasswordEncrypted) {
    try { return decryptGmailPassword(s.gmailPasswordEncrypted); } catch {}
  }
  if (s.gmailPassword && s.gmailPassword !== '__encrypted__') return s.gmailPassword;
  return process.env.GMAIL_APP_PASSWORD || '';
}
function isGmailReady(s) {
  return !!(s && (s.gmailAddress || process.env.GMAIL_ADDRESS) && getGmailPassword(s));
}

// Claude API key: encrypted DB value → env var fallback
// Always call with fresh settings object from readJSON
function getClaudeApiKey(s) {
  if (s && s.claudeApiKeyEncrypted) {
    try { return decryptApiKey(s.claudeApiKeyEncrypted); } catch {}
  }
  return process.env.CLAUDE_API_KEY || '';
}
function isClaudeReady(s) {
  return !!(getClaudeApiKey(s));
}

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Niet geautoriseerd' });
  }
  const token = header.split(' ')[1];

  // API key authentication (sk-agency- prefix)
  if (token.startsWith('sk-agency-')) {
    const h = hashApiKey(token);
    const keys = readJSON('api-keys.json') || [];
    const found = keys.find(k => k.keyHash === h);
    if (!found) return res.status(401).json({ error: 'API sleutel ongeldig' });
    found.lastUsed = new Date().toISOString();
    writeJSON('api-keys.json', keys);
    req.user = { id: found.userId, username: found.username, role: found.role, name: found.keyLabel };
    return next();
  }

  // JWT authentication
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token ongeldig of verlopen' });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang — alleen admins' });
  }
  next();
}

// â"€â"€â"€ Auth routes (public â€" no middleware) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord verplicht' });
  }

  const users = readJSON('users.json') || [];
  const user = users.find(u => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Onjuiste gebruikersnaam of wachtwoord' });
  }

  const settings = readJSON('settings.json') || {};
  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role,
      agencyName: settings.agencyName, myName: user.name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({ token, myName: user.name, agencyName: settings.agencyName, role: user.role });
});

app.get('/api/auth/verify', (req, res) => {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.json({ valid: false });
  }
  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, user: decoded });
  } catch {
    res.json({ valid: false });
  }
});

// â"€â"€â"€ Portal (public â€" no login needed) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.get('/portal/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal.html'));
});

// ─── Intake form (public) ────────────────────────────────────────────────────

app.get('/intake/:leadId/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'intake.html'));
});

app.get('/api/intake/:leadId/:token', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.leadId && l.intakeToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Intake link ongeldig of verlopen' });

  if (lead.intakeSubmittedAt) {
    return res.json({ submitted: true, companyName: lead.companyName, agencyName: (readJSON('settings.json') || {}).agencyName || 'Agency AI' });
  }

  // Generate questions with AI if not yet cached
  if (!lead.intakeQuestions) {
    const serviceNames = (lead.services || []).map(s => s.name).join(', ') || 'AI-marketingdiensten';
    try {
      const questions = await aiJSON(`Je bent een projectmanager bij een AI marketing bureau.
Genereer een intake vragenlijst voor een nieuw klant: ${lead.companyName} (${lead.niche}, ${lead.location}).
Diensten waarvoor we gaan starten: ${serviceNames}.
Maak 6-8 gerichte vragen die echt nuttig zijn voor de uitvoering. Mix van korte antwoorden en langere tekstvelden.
Antwoord ALLEEN als JSON: { "questions": [{ "id": "q1", "label": "vraag tekst", "type": "text|textarea|select|url", "placeholder": "...", "options": ["optie1","optie2"] (alleen bij type select), "required": true/false }] }`);
      lead.intakeQuestions = questions?.questions || [];
    } catch {
      lead.intakeQuestions = [
        { id: 'q1', label: 'Wat is de website URL van je bedrijf?', type: 'url', placeholder: 'https://...', required: false },
        { id: 'q2', label: 'Wie is jullie doelgroep?', type: 'textarea', placeholder: 'Beschrijf je ideale klant...', required: true },
        { id: 'q3', label: 'Wat is jullie maandelijkse marketingbudget?', type: 'select', options: ['< €500', '€500–€1.000', '€1.000–€2.500', '€2.500+'], required: true },
        { id: 'q4', label: 'Op welke platforms zijn jullie al actief?', type: 'textarea', placeholder: 'Instagram, Facebook, LinkedIn...', required: false },
        { id: 'q5', label: 'Wat is het belangrijkste doel voor de komende 3 maanden?', type: 'textarea', placeholder: 'Meer leads, meer volgers, betere website...', required: true },
        { id: 'q6', label: 'Zijn er al bestaande campagnes of advertentieaccounts?', type: 'text', placeholder: 'Ja / nee + toelichting', required: false },
      ];
    }
    const idx = leads.findIndex(l => l.id === lead.id);
    leads[idx] = lead;
    writeJSON('leads.json', leads);
  }

  const settings = readJSON('settings.json') || {};
  res.json({
    submitted: false,
    companyName: lead.companyName,
    agencyName: settings.agencyName || 'Agency AI',
    agencyLogo: settings.agencyName || 'Agency AI',
    services: (lead.services || []).map(s => s.name),
    questions: lead.intakeQuestions,
  });
});

app.post('/api/intake/:leadId/:token', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.leadId && l.intakeToken === req.params.token);
  if (idx === -1) return res.status(404).json({ error: 'Intake link ongeldig' });
  if (leads[idx].intakeSubmittedAt) return res.status(409).json({ error: 'Intake al ingediend' });

  leads[idx].intakeAnswers = req.body.answers || {};
  leads[idx].intakeSubmittedAt = new Date().toISOString();
  addLeadHistory(leads, leads[idx].id, { event: 'intakeSubmitted', label: 'Intake ingevuld door klant' });
  addNotification('intake_submitted', `Intake ingevuld: ${leads[idx].companyName}`, `De intake is ingevuld door ${leads[idx].contactName || leads[idx].companyName}`, leads[idx].id);
  fireWebhooks('intake.submitted', { leadId: leads[idx].id, companyName: leads[idx].companyName, niche: leads[idx].niche, contactEmail: leads[idx].contactEmail, submittedAt: leads[idx].intakeSubmittedAt });
  writeJSON('leads.json', leads);

  const settings = readJSON('settings.json') || {};

  // Notify team
  if (isGmailReady(settings)) {
    try {
      const answersText = Object.entries(req.body.answers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      await sendEmail({ to: settings.gmailAddress, subject: `[Intake ingevuld] ${leads[idx].companyName}`, body: `De intake van ${leads[idx].companyName} is ingevuld.\n\nAntwoorden:\n${answersText}`, settings });
    } catch { /* optional */ }
  }

  // Auto-send intake confirmation email to client
  const lead = leads[idx];
  if (settings.autoClientEmails?.intakeReceived !== false && lead.email && isGmailReady(settings)) {
    try {
      const email = await generateClientEmail(lead, 'intakeReceived', settings);
      await sendEmail({ to: lead.email, subject: email.subject, body: email.body, settings });
      if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
      leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'intakeReceived', subject: email.subject, body: email.body, to: lead.email, sentAt: new Date().toISOString(), sentBy: 'systeem' });
      writeJSON('leads.json', leads);
    } catch { /* optional */ }
  }

  // Auto-generate website if lead has a website service and no site yet
  const hasWebsiteService = (lead.services || []).some(s =>
    s.name && (s.name.toLowerCase().includes('website') || s.name.toLowerCase().includes('site'))
  );
  if (hasWebsiteService && !lead.generatedSite) {
    setImmediate(async () => {
      try {
        const freshLeads = readJSON('leads.json') || [];
        const freshSettings = readJSON('settings.json') || {};
        const freshIdx = freshLeads.findIndex(l => l.id === lead.id);
        if (freshIdx === -1 || freshLeads[freshIdx].generatedSite) return;
        const freshLead = freshLeads[freshIdx];

        const colors = getColorScheme(freshLead.niche);
        const serviceNames = (freshLead.services || []).map(s => s.name).join(', ') || 'AI-diensten';
        const intakeCtx = '\n\nIntake antwoorden:\n' + Object.entries(freshLead.intakeAnswers || {}).map(([k, v]) => `- ${k}: ${v}`).join('\n');

        let content;
        try {
          content = await aiJSON(`Genereer website content voor ${freshLead.companyName} (${freshLead.niche}, ${freshLead.location}). Diensten: ${serviceNames}.${intakeCtx}
Antwoord ALLEEN als JSON: { "headline": "string", "subheadline": "string", "about": "string", "services": [{"icon":"emoji","title":"string","desc":"string"}], "ctaText": "string", "ctaSubtext": "string", "footerTagline": "string" }`);
        } catch { content = { headline: `Welkom bij ${freshLead.companyName}`, subheadline: `Professionele ${freshLead.niche} diensten`, about: `${freshLead.companyName} biedt professionele diensten aan in ${freshLead.location}.`, services: [], ctaText: 'Neem contact op', ctaSubtext: 'We reageren binnen 24 uur', footerTagline: freshLead.companyName }; }

        const servicesStr = (content.services || []).map(s => `${s.icon} ${s.title}: ${s.desc}`).join('\n');
        let siteHtml = await aiCall(`Maak een volledige professionele HTML website voor ${freshLead.companyName} (${freshLead.niche}, ${freshLead.location}). Headline: ${content.headline}. Subheadline: ${content.subheadline}. About: ${content.about}. Diensten:\n${servicesStr}. CTA: ${content.ctaText}. Kleur: ${colors.primary}. Standalone HTML, alle CSS inline. Geef ALLEEN HTML terug.`);
        siteHtml = siteHtml.trim().replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
        if (!siteHtml.toLowerCase().includes('<!doctype') && !siteHtml.toLowerCase().includes('<html')) {
          siteHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${freshLead.companyName}</title></head><body>${siteHtml}</body></html>`;
        }

        const siteSlug = generateSiteSlug(freshLead.companyName);
        const sitesDir = path.join(__dirname, 'public', 'sites', siteSlug);
        fs.mkdirSync(sitesDir, { recursive: true });
        fs.writeFileSync(path.join(sitesDir, 'index.html'), siteHtml, 'utf8');

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
        const siteUrl = `${baseUrl}/sites/${siteSlug}`;

        const updatedLeads = readJSON('leads.json') || [];
        const updIdx = updatedLeads.findIndex(l => l.id === freshLead.id);
        if (updIdx !== -1) {
          updatedLeads[updIdx].generatedSite = { siteSlug, siteUrl, generatedAt: new Date().toISOString(), content, status: 'preview', feedback: [] };
          addLeadHistory(updatedLeads, freshLead.id, { event: 'siteGenerated', label: `Website auto-gegenereerd na intake: ${siteUrl}` });
          writeJSON('leads.json', updatedLeads);
        }
        console.log(`[Website] Auto-generated for ${freshLead.companyName}: ${siteUrl}`);
      } catch (e) { console.error('[Website] Auto-generate failed:', e.message); }
    });
  }

  res.json({ ok: true });
});

// ── Public agency website ─────────────────────────────────────────────────────
// ── Email open tracking pixel (public) ───────────────────────────────────────
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

app.get('/track/open/:token', (req, res) => {
  const token = req.params.token;
  res.set({ 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' });
  res.send(PIXEL_GIF);

  // Async update — don't block the pixel response
  setImmediate(() => {
    try {
      const leads = readJSON('leads.json') || [];
      const idx = leads.findIndex(l => l.trackingToken === token);
      if (idx === -1) return;
      const now = new Date().toISOString();
      if (!leads[idx].openedAt) {
        leads[idx].openedAt = now;
        addLeadHistory(leads, leads[idx].id, { event: 'opened', label: 'Email geopend' });
        addActivity('open', 'Email geopend door ' + (leads[idx].companyName || 'Onbekend'), { meta: { leadId: leads[idx].id } });
        console.log(`[Tracking] Email geopend: ${leads[idx].companyName}`);
      }
      leads[idx].openCount = (leads[idx].openCount || 0) + 1;
      leads[idx].lastOpenedAt = now;
      writeJSON('leads.json', leads);

      const inbox = readJSON('inbox.json') || [];
      const iIdx = inbox.findIndex(i => i.trackingToken === token);
      if (iIdx !== -1) {
        if (!inbox[iIdx].openedAt) inbox[iIdx].openedAt = now;
        inbox[iIdx].openCount = (inbox[iIdx].openCount || 0) + 1;
        writeJSON('inbox.json', inbox);
      }
    } catch { /* silent */ }
  });
});

app.get('/agency', (req, res) => {
  const s        = readJSON('settings.json') || {};
  const name     = s.agencyName  || 'Agency AI';
  const myName   = s.myName      || '';
  const myTitle  = s.myTitle     || 'AI Growth Specialist';
  const tagline  = s.websiteTagline  || 'Meer klanten. Minder werk. Volledig automatisch.';
  const about    = s.websiteAbout    || 'Wij gebruiken AI om lokale bedrijven te helpen groeien — van het vinden van kansen tot het schrijven van gepersonaliseerde emails, volledig op autopiloot.';
  const email    = s.websiteContact  || s.gmailAddress || '';
  const linkedin = s.linkedinUrl     || '';
  const services = (s.services || []).slice(0, 12);

  const serviceCards = services.map(sv => `
    <div class="srv-card">
      <div class="srv-name">${esc(sv.name)}</div>
      <div class="srv-price">${sv.billing === 'eenmalig' ? 'Eenmalig' : 'Per maand'} &bull; &euro;${sv.price || 0}</div>
      ${sv.description ? `<div class="srv-desc">${esc(sv.description)}</div>` : ''}
    </div>`).join('');

  const leads = readJSON('leads.json') || [];
  const publishedCases = leads.filter(l => l.caseStudy && l.caseStudy.published === true).slice(0, 6);
  const caseCards = publishedCases.map(l => {
    const cs = l.caseStudy;
    const resultsHtml = (cs.results || []).map(r => `<li>${esc(r)}</li>`).join('');
    return `
    <div class="cs-card">
      <div class="cs-tag">${esc(cs.industry || l.niche)}</div>
      <h3 class="cs-title">${esc(cs.title)}</h3>
      <p class="cs-challenge">${esc(cs.challenge)}</p>
      ${resultsHtml ? `<ul class="cs-results">${resultsHtml}</ul>` : ''}
      ${cs.quote ? `<blockquote class="cs-quote">&ldquo;${esc(cs.quote)}&rdquo;<cite>${esc(cs.quoteName || '')}</cite></blockquote>` : ''}
    </div>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(name)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --black: #0d0d0d; --white: #ffffff; --gray: #6b7280; --border: #e5e7eb;
      --accent: #111827; --bg: #f9fafb; --card: #ffffff;
    }
    body { font-family: 'Plus Jakarta Sans', sans-serif; background: var(--bg); color: var(--black); line-height: 1.6; }
    a { color: inherit; text-decoration: none; }

    /* NAV */
    nav { background: #fff; border-bottom: 1px solid var(--border); padding: 0 24px; display: flex; align-items: center; justify-content: space-between; height: 60px; position: sticky; top: 0; z-index: 100; }
    .nav-logo { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
    .nav-cta { background: var(--black); color: #fff; padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600; transition: opacity .15s; }
    .nav-cta:hover { opacity: .85; }

    /* HERO */
    .hero { text-align: center; padding: 96px 24px 80px; max-width: 760px; margin: 0 auto; }
    .hero-badge { display: inline-flex; align-items: center; gap: 6px; background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 999px; margin-bottom: 28px; }
    .hero h1 { font-size: clamp(36px, 6vw, 60px); font-weight: 800; line-height: 1.1; letter-spacing: -1.5px; margin-bottom: 20px; }
    .hero p { font-size: 18px; color: var(--gray); max-width: 540px; margin: 0 auto 36px; }
    .hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn-primary { background: var(--black); color: #fff; padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: opacity .15s; }
    .btn-primary:hover { opacity: .85; }
    .btn-ghost { border: 1px solid var(--border); padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 600; color: var(--black); transition: background .15s; }
    .btn-ghost:hover { background: var(--border); }

    /* STATS */
    .stats { display: flex; justify-content: center; gap: 48px; flex-wrap: wrap; padding: 48px 24px; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); background: #fff; }
    .stat-item { text-align: center; }
    .stat-num { font-size: 32px; font-weight: 800; letter-spacing: -1px; }
    .stat-lbl { font-size: 13px; color: var(--gray); margin-top: 4px; }

    /* SECTION */
    section { max-width: 1080px; margin: 0 auto; padding: 80px 24px; }
    .section-tag { font-size: 12px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--gray); margin-bottom: 12px; }
    .section-title { font-size: clamp(28px, 4vw, 40px); font-weight: 800; letter-spacing: -1px; margin-bottom: 14px; line-height: 1.15; }
    .section-sub { font-size: 17px; color: var(--gray); max-width: 540px; margin-bottom: 48px; }

    /* ABOUT */
    .about-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; align-items: center; }
    @media (max-width: 680px) { .about-grid { grid-template-columns: 1fr; } }
    .about-text p { font-size: 17px; color: var(--gray); line-height: 1.75; margin-bottom: 16px; }
    .feature-list { list-style: none; display: flex; flex-direction: column; gap: 14px; }
    .feature-list li { display: flex; align-items: flex-start; gap: 12px; font-size: 15px; font-weight: 500; }
    .feature-list li::before { content: "✓"; background: #f0fdf4; color: #16a34a; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; flex-shrink: 0; margin-top: 1px; }

    /* SERVICES */
    .srv-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
    .srv-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 20px; transition: box-shadow .15s; }
    .srv-card:hover { box-shadow: 0 4px 20px rgba(0,0,0,.08); }
    .srv-name { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
    .srv-price { font-size: 12px; color: var(--gray); font-weight: 600; margin-bottom: 8px; }
    .srv-desc { font-size: 13px; color: var(--gray); line-height: 1.55; }

    /* PROCESS */
    .steps { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
    .step { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
    .step-num { width: 32px; height: 32px; background: var(--black); color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; margin-bottom: 14px; }
    .step h3 { font-size: 15px; font-weight: 700; margin-bottom: 8px; }
    .step p { font-size: 13px; color: var(--gray); line-height: 1.6; }

    /* CASE STUDIES */
    .cs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; margin-top: 40px; }
    .cs-card { background: #fff; border: 1px solid var(--border); border-radius: 16px; padding: 28px; display: flex; flex-direction: column; gap: 12px; }
    .cs-tag { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .8px; color: var(--accent); background: #f0f4ff; border-radius: 6px; padding: 3px 8px; display: inline-block; }
    .cs-title { font-size: 17px; font-weight: 700; color: var(--black); letter-spacing: -.3px; line-height: 1.3; }
    .cs-challenge { font-size: 13px; color: var(--gray); line-height: 1.6; }
    .cs-results { list-style: none; display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .cs-results li { font-size: 13px; font-weight: 600; color: #16a34a; padding-left: 18px; position: relative; }
    .cs-results li::before { content: '✓'; position: absolute; left: 0; color: #16a34a; }
    .cs-quote { border-left: 3px solid var(--border); padding: 10px 14px; margin-top: 4px; font-size: 13px; font-style: italic; color: var(--gray); line-height: 1.5; }
    .cs-quote cite { display: block; font-style: normal; font-size: 12px; font-weight: 600; color: #374151; margin-top: 6px; }

    /* CTA BANNER */
    .cta-banner { background: var(--black); border-radius: 20px; padding: 60px 40px; text-align: center; margin: 0 24px 80px; }
    .cta-banner h2 { font-size: clamp(26px, 4vw, 38px); font-weight: 800; color: #fff; letter-spacing: -1px; margin-bottom: 14px; }
    .cta-banner p { font-size: 16px; color: rgba(255,255,255,.65); margin-bottom: 32px; }
    .btn-white { background: #fff; color: var(--black); padding: 14px 28px; border-radius: 10px; font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; gap: 8px; transition: opacity .15s; }
    .btn-white:hover { opacity: .9; }

    /* FOOTER */
    footer { border-top: 1px solid var(--border); padding: 28px 24px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; font-size: 13px; color: var(--gray); max-width: 1080px; margin: 0 auto; }
  </style>
</head>
<body>

<nav>
  <div class="nav-logo">${esc(name)}</div>
  ${email ? `<a class="nav-cta" href="mailto:${esc(email)}">Neem contact op</a>` : ''}
</nav>

<div class="hero">
  <div class="hero-badge">&#9679; AI-gedreven marketing</div>
  <h1>${esc(tagline)}</h1>
  <p>${esc(about)}</p>
  <div class="hero-btns">
    ${email ? `<a class="btn-primary" href="mailto:${esc(email)}">&#9993; Stuur een bericht</a>` : ''}
    ${linkedin ? `<a class="btn-ghost" href="${esc(linkedin)}" target="_blank" rel="noopener">LinkedIn &rarr;</a>` : ''}
  </div>
</div>

<div class="stats">
  <div class="stat-item"><div class="stat-num">15+</div><div class="stat-lbl">Leads per dag gevonden</div></div>
  <div class="stat-item"><div class="stat-num">6</div><div class="stat-lbl">AI-agents per bedrijf</div></div>
  <div class="stat-item"><div class="stat-num">100%</div><div class="stat-lbl">Gepersonaliseerd</div></div>
  <div class="stat-item"><div class="stat-num">24/7</div><div class="stat-lbl">Volledig automatisch</div></div>
</div>

<section>
  <div class="about-grid">
    <div class="about-text">
      <div class="section-tag">Over ons</div>
      <div class="section-title">Waarom ${esc(name)}?</div>
      <p>${esc(about)}</p>
      ${myName ? `<p>— <strong>${esc(myName)}</strong>, ${esc(myTitle)}</p>` : ''}
    </div>
    <ul class="feature-list">
      <li>Volledig geautomatiseerde lead research</li>
      <li>Diepgaande analyse van elk bedrijf</li>
      <li>Gepersonaliseerde emails op basis van AI</li>
      <li>Follow-up sequenties zonder handmatig werk</li>
      <li>Realtime rapportage &amp; statistieken</li>
      <li>Klantportaal met live projectstatus</li>
    </ul>
  </div>
</section>

${serviceCards ? `
<section style="background:#fff;border-top:1px solid var(--border);border-bottom:1px solid var(--border);max-width:100%;padding:80px 24px;">
<div style="max-width:1080px;margin:0 auto">
  <div class="section-tag">Diensten</div>
  <div class="section-title">Wat wij aanbieden</div>
  <p class="section-sub">Van advertentiecampagnes tot volledige AI-outreach — wij regelen het.</p>
  <div class="srv-grid">${serviceCards}</div>
</div>
</section>` : ''}

<section>
  <div class="section-tag">Werkwijze</div>
  <div class="section-title">Hoe het werkt</div>
  <p class="section-sub">Van lead tot klant — volledig geautomatiseerd.</p>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><h3>Lead vinden</h3><p>AI zoekt dagelijks 15+ bedrijven die perfect passen bij jouw doelgroep.</p></div>
    <div class="step"><div class="step-num">2</div><h3>Bedrijf analyseren</h3><p>6 AI-agents onderzoeken website, social media, concurrenten en kansen.</p></div>
    <div class="step"><div class="step-num">3</div><h3>Email schrijven</h3><p>Volledig gepersonaliseerde outreach — klinkt menselijk, geen AI-taal.</p></div>
    <div class="step"><div class="step-num">4</div><h3>Opvolgen</h3><p>Automatische follow-ups na 2 en 5 dagen. Replies worden direct gesignaleerd.</p></div>
  </div>
</section>

${caseCards ? `
<section style="background:#f9fafb;border-top:1px solid var(--border);border-bottom:1px solid var(--border);max-width:100%;padding:80px 24px;">
<div style="max-width:1080px;margin:0 auto">
  <div class="section-tag">Resultaten</div>
  <div class="section-title">Wat onze klanten bereikten</div>
  <p class="section-sub">Echte bedrijven, meetbare groei.</p>
  <div class="cs-grid">${caseCards}</div>
</div>
</section>` : ''}

<div class="cta-banner" style="max-width:1080px;margin:0 auto 80px;">
  <h2>Klaar om te groeien?</h2>
  <p>Geen setup nodig. Geen technische kennis vereist. Alleen resultaten.</p>
  ${email ? `<a class="btn-white" href="mailto:${esc(email)}">&#9993;&nbsp; ${esc(email)}</a>` : ''}
</div>

<footer>
  <span>&copy; ${new Date().getFullYear()} ${esc(name)}${myName ? ' &mdash; ' + esc(myName) : ''}</span>
  <div style="display:flex;gap:16px">
    ${email ? `<a href="mailto:${esc(email)}">${esc(email)}</a>` : ''}
    ${linkedin ? `<a href="${esc(linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
  </div>
</footer>

</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/api/portal/:token', (req, res) => {
  const leads   = readJSON('leads.json') || [];
  const lead    = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
  const settings = readJSON('settings.json') || {};
  const settingsSvcs = settings.services || [];
  const enrichedSvcs = (lead.services || []).map(s => {
    const match = settingsSvcs.find(ss => ss.name === s.name);
    return { ...s, description: match?.description || '' };
  });
  res.json({
    companyName:         lead.companyName,
    agencyName:          settings.agencyName || 'Agency AI',
    myName:              settings.myName || '',
    currentPhase:        lead.currentPhase || 1,
    estimatedCompletion: lead.estimatedCompletion || null,
    services:            enrichedSvcs,
    reports:             (lead.reports || []).map(r => ({ title: r.title, month: r.month, createdAt: r.createdAt, content: r.content })),
    delivery:            lead.delivery || null,
    generatedSite:       lead.generatedSite ? { siteUrl: lead.generatedSite.siteUrl, status: lead.generatedSite.status, generatedAt: lead.generatedSite.generatedAt } : null,
    calendlyUrl:         settings.calendlyUrl || null
  });
});

app.post('/api/portal/:token/site-feedback', (req, res) => {
  const { feedback } = req.body;
  if (!feedback) return res.status(400).json({ error: 'Feedback verplicht' });
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
  if (!lead.generatedSite) return res.status(400).json({ error: 'Geen website gegenereerd' });
  if (!lead.generatedSite.feedback) lead.generatedSite.feedback = [];
  lead.generatedSite.feedback.push({ text: feedback, time: new Date().toISOString(), by: lead.companyName || 'klant' });
  const preview = feedback.length > 60 ? feedback.substring(0, 60) + '...' : feedback;
  addLeadHistory(leads, lead.id, { event: 'siteFeedback', label: `Website feedback van klant: ${preview}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/portal/:token/message', (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Naam en bericht verplicht' });
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
  if (!lead.clientMessages) lead.clientMessages = [];
  lead.clientMessages.push({ name, message, time: new Date().toISOString(), read: false });
  const preview = message.length > 60 ? message.substring(0, 60) + '...' : message;
  addLeadHistory(leads, lead.id, { event: 'clientMessage', label: `Klant bericht van ${name}: ${preview}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// â"€â"€â"€ Apply auth middleware to all /api/ routes below this line â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// ─── Gmail Pub/Sub webhook (public — no auth, validated by secret token) ──────

app.post('/api/gmail/webhook', async (req, res) => {
  // Acknowledge immediately — Pub/Sub will retry if we respond too slowly
  res.status(200).json({ ok: true });

  try {
    const settings = readJSON('settings.json') || {};
    const expectedToken = settings.webhookToken || '';
    const receivedToken  = req.query.token || '';

    if (!expectedToken || receivedToken !== expectedToken) {
      console.warn('[Webhook] Ongeldig of ontbrekend token — verzoek genegeerd');
      return;
    }

    // Pub/Sub data contains historyId (base64 JSON) — we just use it as a trigger
    const msg = req.body && req.body.message;
    if (msg && msg.data) {
      try {
        const decoded = JSON.parse(Buffer.from(msg.data, 'base64').toString('utf8'));
        console.log('[Webhook] Pub/Sub bericht, historyId:', decoded.historyId);
      } catch { /* non-fatal */ }
    }

    console.log('[Webhook] Real-time trigger ontvangen — directe reply check gestart');
    await checkReplies();
  } catch (err) {
    console.error('[Webhook] Fout:', err.message);
  }
});

app.use('/api', authMiddleware);

// ─── API Keys management ──────────────────────────────────────────────────────

app.get('/api/auth/api-keys', (req, res) => {
  const keys = readJSON('api-keys.json') || [];
  const mine = keys
    .filter(k => k.userId === req.user.id || req.user.role === 'admin')
    .map(k => ({ id: k.id, keyLabel: k.keyLabel, keyPrefix: k.keyPrefix, role: k.role, userId: k.userId, username: k.username, createdAt: k.createdAt, lastUsed: k.lastUsed }));
  res.json(mine);
});

app.post('/api/auth/api-keys', (req, res) => {
  const { label } = req.body;
  const rawKey = 'sk-agency-' + crypto.randomBytes(24).toString('hex');
  const entry = {
    id: Date.now().toString(),
    userId: req.user.id,
    username: req.user.username,
    role: req.user.role,
    keyLabel: label || 'API Sleutel',
    keyPrefix: rawKey.slice(0, 18) + '...',
    keyHash: hashApiKey(rawKey),
    keyEncrypted: encryptApiKey(rawKey),
    createdAt: new Date().toISOString(),
    lastUsed: null
  };
  const keys = readJSON('api-keys.json') || [];
  keys.push(entry);
  writeJSON('api-keys.json', keys);
  res.json({ ok: true, id: entry.id, key: rawKey, keyPrefix: entry.keyPrefix });
});

app.delete('/api/auth/api-keys/:id', (req, res) => {
  const keys = readJSON('api-keys.json') || [];
  const key = keys.find(k => k.id === req.params.id);
  if (!key) return res.status(404).json({ error: 'Sleutel niet gevonden' });
  if (key.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Geen toegang' });
  }
  writeJSON('api-keys.json', keys.filter(k => k.id !== req.params.id));
  res.json({ ok: true });
});

// ─── Claude API proxy â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.post('/api/claude', async (req, res) => {
  const { prompt, json: expectJson } = req.body;
  if (!prompt) return res.status(400).json({ error: 'Prompt verplicht' });

  try {
    const apiKey = getClaudeApiKey(readJSON('settings.json') || {});
    if (!apiKey) return res.status(400).json({ error: 'Claude API sleutel niet ingesteld' });
    const { default: fetch } = await import('node-fetch');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Claude API fout' });
    }

    const text = data.content[0].text;
    if (expectJson) {
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
      try {
        return res.json({ result: JSON.parse(clean) });
      } catch {
        const m = clean.match(/\[[\s\S]*\]/) || clean.match(/\{[\s\S]*\}/);
        try { return res.json({ result: m ? JSON.parse(m[0]) : text }); }
        catch { return res.json({ result: text }); }
      }
    }
    res.json({ result: text });
  } catch (err) {
    console.error('Claude error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Analyze single company (bypasses Agent 1, runs agents 2-6) ──────────────

app.post('/api/analyze-company', requireAdmin, async (req, res) => {
  const { companyName, websiteUrl, instagramHandle, niche, location, country, estimatedFollowers, companySize } = req.body || {};
  if (!companyName) return res.status(400).json({ error: 'companyName verplicht' });
  const lead = {
    companyName, websiteUrl: websiteUrl || '', instagramHandle: instagramHandle || '',
    niche: niche || 'retail', location: location || 'Nederland', country: country || 'NL',
    estimatedFollowers: estimatedFollowers || 0, companySize: companySize || 'small'
  };
  try {
    const settings = readJSON('settings.json') || {};
    console.log(`[Aangepast bedrijf] ${companyName} analyseren...`);
    const dupCheck = isDuplicate(lead);
    if (dupCheck) return res.status(409).json({ error: `Duplicaat: ${lead.companyName} bestaat al (status: ${dupCheck.status})`, existing: { id: dupCheck.id, status: dupCheck.status } });
    const result = await processOneLead(lead, settings);
    if (!result) return res.status(400).json({ error: 'Overgeslagen: bedrijf staat op de blacklist of geen emailadres gevonden op de website' });
    const { item, leadRecord } = result;

    const inbox = readJSON('inbox.json') || [];
    writeJSON('inbox.json', [item, ...inbox]);
    const allLeads = readJSON('leads.json') || [];
    writeJSON('leads.json', [leadRecord, ...allLeads]);

    const stats = readJSON('stats.json') || {};
    writeJSON('stats.json', { ...stats, leadsFound: (stats.leadsFound || 0) + 1, pipelineValue: (stats.pipelineValue || 0) + (item.estimatedValue || 0) });

    console.log(`[Aangepast bedrijf] Klaar — score: ${item.score}`);
    res.json({ ok: true, item });
  } catch (err) {
    console.error('[analyze-company] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check (public) ──────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  const settings  = readJSON('settings.json') || {};
  const runs      = readJSON('runs.json') || [];
  const lastRun   = runs.length ? runs[runs.length - 1] : null;
  const apiKeyOk  = isClaudeReady(settings);
  const emailOk   = !!(settings.resendApiKey || process.env.RESEND_API_KEY);
  const pgOk      = !!process.env.DATABASE_URL;
  const mem       = process.memoryUsage();

  const checks = { claude_api: apiKeyOk, email: emailOk, postgres: pgOk };
  const criticalOk = apiKeyOk;
  const allOk = apiKeyOk && emailOk;

  const now        = Date.now();
  const callsToday = _aiCallLog.filter(e => e.ts >= now - 86400000).length;
  const leads      = readJSON('leads.json') || [];
  const inbox      = readJSON('inbox.json') || [];

  res.json({
    status:       allOk ? 'ok' : criticalOk ? 'degraded' : 'down',
    uptime:       Math.floor(process.uptime()),
    uptimeLabel:  formatUptime(process.uptime()),
    checks,
    lastRun:      lastRun ? { time: lastRun.createdAt, leadsFound: lastRun.leadsFound || 0 } : null,
    recentErrors: RUN_ERRORS.slice(0, 5),
    version:      require('./package.json').version,
    nodeVersion:  process.version,
    memUsageMb:   Math.round(mem.rss / 1024 / 1024),
    heapUsedMb:   Math.round(mem.heapUsed / 1024 / 1024),
    aiCallsToday: callsToday,
    stats: {
      totalLeads:   leads.length,
      clients:      leads.filter(l => l.status === 'client').length,
      pending:      inbox.filter(i => !i.status || i.status === 'pending').length,
    },
    agencyName: settings.agencyName || 'Agency AI',
    checkedAt:  new Date().toISOString(),
  });
});

function formatUptime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}u ${m}m` : `${m}m`;
}

// ── Error log (admin only) ────────────────────────────────────────────────────

app.get('/api/errors', requireAdmin, (req, res) => {
  res.json(RUN_ERRORS);
});

// ── Stats ─────────────────────────────────────────────────────────────────────

app.get('/api/stats', (req, res) => {
  const stored = readJSON('stats.json') || {};
  const leads  = readJSON('leads.json') || [];
  const inbox  = readJSON('inbox.json') || [];

  const active = leads.filter(l => l.status !== 'disapproved' && l.status !== 'dead');

  const cutoff24h = new Date(Date.now() - 86400000).toISOString();
  const leadsLast24h = leads.filter(l => l.createdAt >= cutoff24h);

  const live = {
    leadsFound:       leads.length,
    emailsSent:       leads.filter(l => ['sent','scheduled','replied','client'].includes(l.status)).length,
    replies:          leads.filter(l => ['replied','client'].includes(l.status)).length,
    pipelineValue:    active.reduce((s, l) => s + (l.estimatedValue || 0), 0),
    inboxPending:     inbox.filter(i => !i.status || i.status === 'pending').length,
    clients:          leads.filter(l => l.status === 'client').length,
    last24hLeads:     leadsLast24h.length,
    last24hValue:     leadsLast24h
                        .filter(l => l.status !== 'disapproved' && l.status !== 'dead')
                        .reduce((s, l) => s + (l.estimatedValue || 0), 0),
    todayLeads: (() => {
      const today = new Date().toISOString().slice(0, 10);
      const entry = (stored.weeklyData || []).find(w => w.date === today);
      return entry ? entry.count : 0;
    })()
  };

  res.json({ ...stored, ...live });
});

// â"€â"€â"€ Leads â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.get('/api/stats/detailed', (req, res) => {
  const leads = readJSON('leads.json') || [];
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

app.get('/api/leads', (req, res) => {
  res.json(readJSON('leads.json') || []);
});

app.get('/api/leads/export.csv', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const status = req.query.status; // optional filter
  const filtered = status ? leads.filter(l => l.status === status) : leads;

  const csvEsc = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
  };

  const headers = [
    'Bedrijfsnaam','Niche','Locatie','Land','Score','Status','Taal',
    'Website','Volgers','Waarde (EUR)','Email onderwerp',
    'Aangemaakt','Verstuurd','Gereageerd','Geopend (keer)'
  ];

  const rows = filtered.map(l => [
    l.companyName, l.niche, l.location, l.country,
    l.score != null ? Number(l.score).toFixed(2) : '',
    l.status, l.language,
    l.websiteUrl, l.estimatedFollowers, l.estimatedValue,
    l.email?.subject || '',
    l.createdAt ? l.createdAt.slice(0,10) : '',
    l.sentAt     ? l.sentAt.slice(0,10)     : '',
    l.repliedAt  ? l.repliedAt.slice(0,10)  : '',
    l.openCount  || ''
  ].map(csvEsc).join(','));

  const csv = [headers.join(','), ...rows].join('\r\n');
  const filename = `leads-${new Date().toISOString().slice(0,10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM so Excel opens UTF-8 correctly
});

app.post('/api/leads', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...req.body };
  leads.push(lead);
  writeJSON('leads.json', leads);
  res.json(lead);
});

app.post('/api/leads/bulk-delete', requireAdmin, (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids verplicht' });
  const leads = readJSON('leads.json') || [];
  const inbox = readJSON('inbox.json') || [];
  writeJSON('leads.json', leads.filter(l => !ids.includes(l.id)));
  writeJSON('inbox.json', inbox.filter(i => !ids.includes(i.id)));
  res.json({ ok: true, deleted: ids.length });
});

app.get('/api/leads/check-duplicate', (req, res) => {
  const { name, domain, email } = req.query;
  if (!name && !domain && !email) return res.json({ duplicate: false });
  const leads = readJSON('leads.json') || [];
  const nameLower  = (name   || '').toLowerCase().trim();
  const domLower   = (domain || '').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase().trim();
  const emailLower = (email  || '').toLowerCase().trim();
  const found = leads.find(l => {
    const ln = (l.companyName  || '').toLowerCase().trim();
    const ld = (l.websiteUrl   || '').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase().trim();
    const le = (l.contactEmail || l.email || '').toLowerCase().trim();
    if (nameLower  && ln && nameLower  === ln) return true;
    if (domLower   && ld && domLower   === ld) return true;
    if (emailLower && le && emailLower === le) return true;
    return false;
  });
  res.json(found ? { duplicate: true, id: found.id, companyName: found.companyName, status: found.status, score: found.score } : { duplicate: false });
});

app.get('/api/leads/:id/reports', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(lead.reports || []);
});

app.post('/api/leads/:id/case-study', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];
  const settings = readJSON('settings.json') || {};
  const agencyName = settings.agencyName || 'Agency';
  const lang = lead.language || 'nl';
  const isNL = lang === 'nl';

  const services = (lead.services || []).join(', ') || 'digitale marketing';
  const problems = (lead.problems || []).join(', ') || 'online zichtbaarheid verbeteren';
  const estimatedValue = lead.estimatedValue ? `€${lead.estimatedValue}/mnd` : '';

  const prompt = isNL
    ? `Schrijf een professionele case study voor een klant van ${agencyName}. Geef JSON terug met deze exacte velden.

Klantgegevens:
- Bedrijf: ${lead.companyName}
- Sector: ${lead.niche}
- Locatie: ${lead.location}
- Uitdagingen: ${problems}
- Diensten afgenomen: ${services}
${estimatedValue ? `- Investering: ${estimatedValue}` : ''}

Schrijf een realistische, overtuigende case study. Verzin plausibele resultaten (percentages, getallen) die passen bij de sector en diensten. Schrijf in de derde persoon over het bedrijf.

{"title": "Case study titel (max 8 woorden)", "industry": "${lead.niche}", "challenge": "2-3 zinnen over de uitdaging (geen jargon)", "solution": "2-3 zinnen over de aanpak van ${agencyName}", "results": ["Resultaat 1 met getal/percentage", "Resultaat 2 met getal/percentage", "Resultaat 3 met getal/percentage"], "quote": "Fictief klantcitaat van max 20 woorden, klinkt oprecht", "quoteName": "Voornaam + Achternaam, Functietitel", "published": false}`
    : `Write a professional case study for a client of ${agencyName}. Return JSON with these exact fields.

Client data:
- Company: ${lead.companyName}
- Industry: ${lead.niche}
- Location: ${lead.location}
- Challenges: ${problems}
- Services: ${services}
${estimatedValue ? `- Investment: ${estimatedValue}` : ''}

Write a realistic, convincing case study. Invent plausible results (percentages, numbers) that fit the industry and services. Write in third person about the company.

{"title": "Case study title (max 8 words)", "industry": "${lead.niche}", "challenge": "2-3 sentences about the challenge (no jargon)", "solution": "2-3 sentences about ${agencyName}'s approach", "results": ["Result 1 with number/percentage", "Result 2 with number/percentage", "Result 3 with number/percentage"], "quote": "Fictional client quote max 20 words, sounds genuine", "quoteName": "First Last, Job Title", "published": false}`;

  try {
    const caseStudy = await aiJSON(prompt);
    caseStudy.createdAt = new Date().toISOString();
    caseStudy.published = caseStudy.published || false;
    leads[idx].caseStudy = caseStudy;
    addLeadHistory(leads, lead.id, { event: 'caseStudy', label: 'Case study gegenereerd' });
    writeJSON('leads.json', leads);
    res.json(caseStudy);
  } catch (err) {
    console.error('[Case study] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/leads/:id/case-study', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!leads[idx].caseStudy) return res.status(404).json({ error: 'Geen case study' });
  leads[idx].caseStudy = { ...leads[idx].caseStudy, ...req.body };
  writeJSON('leads.json', leads);
  res.json(leads[idx].caseStudy);
});

app.patch('/api/leads/:id', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const prevStatus = leads[idx].status;
  leads[idx] = { ...leads[idx], ...req.body };
  // Migrate old-format tasks (no id) to new format
  if (leads[idx].tasks) {
    leads[idx].tasks = leads[idx].tasks.map((t, i) => t.id ? t : {
      id: `legacy-${i}-${Date.now().toString(36)}`, title: t.title || 'Taak', description: t.description || '',
      week: 1, priority: t.priority || 'middel', status: t.done ? 'klaar' : 'todo', createdAt: new Date().toISOString()
    });
  }
  if (req.body.status && req.body.status !== prevStatus) {
    addLeadHistory(leads, req.params.id, { event: 'status', label: `Status: ${req.body.status}` });
  }
  writeJSON('leads.json', leads);
  res.json(leads[idx]);
});

app.delete('/api/leads/:id', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const filtered = leads.filter(l => l.id !== req.params.id);
  writeJSON('leads.json', filtered);
  res.json({ ok: true });
});

// ─── Tasks per lead ──────────────────────────────────────────────────────────

app.get('/api/tasks', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const users = readJSON('users.json') || [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u.name]));
  const all = [];
  for (const lead of leads) {
    for (const task of (lead.tasks || [])) {
      all.push({ ...task, leadId: lead.id, leadName: lead.companyName, assigneeName: userMap[task.assigneeId] || null });
    }
  }
  // Sort: todo/bezig first, then by week, then priority order
  const statusOrder = { todo: 0, bezig: 1, klaar: 2 };
  const priOrder    = { hoog: 0, middel: 1, laag: 2 };
  all.sort((a, b) => (statusOrder[a.status||'todo'] - statusOrder[b.status||'todo']) || (a.week||99) - (b.week||99) || (priOrder[a.priority||'middel'] - priOrder[b.priority||'middel']));
  res.json(all);
});

app.post('/api/leads/:id/tasks', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const { title, description, week, priority, assigneeId, status } = req.body;
  if (!title) return res.status(400).json({ error: 'title verplicht' });
  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title, description: description || '', week: week || 1,
    priority: priority || 'middel', assigneeId: assigneeId || null,
    status: status || 'todo', createdAt: new Date().toISOString()
  };
  if (!leads[idx].tasks) leads[idx].tasks = [];
  leads[idx].tasks.push(task);
  writeJSON('leads.json', leads);
  res.json(task);
});

app.patch('/api/leads/:id/tasks/:taskId', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const tIdx = (leads[idx].tasks || []).findIndex(t => t.id === req.params.taskId);
  if (tIdx === -1) return res.status(404).json({ error: 'Taak niet gevonden' });
  leads[idx].tasks[tIdx] = { ...leads[idx].tasks[tIdx], ...req.body };
  if (req.body.status === 'klaar' && !leads[idx].tasks[tIdx].doneAt) leads[idx].tasks[tIdx].doneAt = new Date().toISOString();
  writeJSON('leads.json', leads);
  res.json(leads[idx].tasks[tIdx]);

  // Auto week-complete email: check if all tasks in this week are now done
  if (req.body.status === 'klaar') {
    const settings = readJSON('settings.json') || {};
    if (settings.autoClientEmails?.weekComplete !== false) {
      const week = leads[idx].tasks[tIdx].week || 1;
      const weekTasks = (leads[idx].tasks || []).filter(t => (t.week||1) === week);
      const allDone = weekTasks.length > 0 && weekTasks.every(t => t.status === 'klaar');
      const lead = leads[idx];
      if (allDone && lead.email && isGmailReady(settings)) {
        // Only send once (check log)
        const alreadySent = (lead.clientEmailLog || []).some(e => e.trigger === 'weekComplete' && e.week === week);
        if (!alreadySent) {
          try {
            const email = await generateClientEmail(lead, 'weekComplete', settings, { week, tasksDone: weekTasks.length, tasksTotal: weekTasks.length });
            await sendEmail({ to: lead.email, subject: email.subject, body: email.body, settings });
            const freshLeads = readJSON('leads.json') || [];
            const fIdx = freshLeads.findIndex(l => l.id === lead.id);
            if (fIdx !== -1) {
              if (!freshLeads[fIdx].clientEmailLog) freshLeads[fIdx].clientEmailLog = [];
              freshLeads[fIdx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'weekComplete', week, subject: email.subject, body: email.body, to: lead.email, sentAt: new Date().toISOString(), sentBy: 'systeem' });
              writeJSON('leads.json', freshLeads);
            }
            console.log(`[ClientEmail] weekComplete week ${week} → ${lead.companyName}`);
          } catch { /* optional */ }
        }
      }
    }
  }
});

app.delete('/api/leads/:id/tasks/:taskId', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].tasks = (leads[idx].tasks || []).filter(t => t.id !== req.params.taskId);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/portal/generate', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const token = Math.random().toString(36).substr(2, 8) + Math.random().toString(36).substr(2, 4);
  leads[idx].portalToken = token;
  if (!leads[idx].currentPhase) leads[idx].currentPhase = 1;
  addLeadHistory(leads, req.params.id, { event: 'portalCreated', label: 'Klantportaal aangemaakt' });
  writeJSON('leads.json', leads);
  res.json({ token });
});

// ─── Project Engine (SSE 8-step) ────────────────────────────────────────────

app.post('/api/leads/:id/start-project', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (step, label, status, extra = {}) => {
    res.write(`data: ${JSON.stringify({ step, label, status, ...extra })}\n\n`);
  };

  try {
    const leads = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    const idx = leads.findIndex(l => l.id === req.params.id);
    if (idx === -1) { send(0, 'Lead niet gevonden', 'error'); res.end(); return; }
    const lead = leads[idx];
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;

    // Step 1 — Portal token
    send(1, 'Portaaltoegang instellen', 'running');
    if (!lead.portalToken) {
      lead.portalToken = Math.random().toString(36).substr(2, 8) + Math.random().toString(36).substr(2, 4);
    }
    const portalUrl = `${baseUrl}/portal/${lead.portalToken}`;
    send(1, 'Portaaltoegang instellen', 'done', { portalUrl });

    // Step 2 — Intake token
    send(2, 'Intake link genereren', 'running');
    if (!lead.intakeToken) {
      lead.intakeToken = Math.random().toString(36).substr(2, 10) + Date.now().toString(36);
    }
    const intakeUrl = `${baseUrl}/intake/${lead.id}/${lead.intakeToken}`;
    send(2, 'Intake link genereren', 'done', { intakeUrl });

    // Step 3 — Welcome email to client
    send(3, 'Welkomstmail versturen', 'running');
    const clientEmail = lead.email || lead.contactEmail || '';
    let emailSent = false;
    if (clientEmail && isGmailReady(settings)) {
      try {
        const welcomeBody = `Beste ${lead.contactName || lead.companyName},\n\nWelkom! We zijn verheugd om samen te werken.\n\nVia de onderstaande link kun je jouw intake-vragenlijst invullen, zodat we zo snel mogelijk kunnen starten:\n${intakeUrl}\n\nHeb je vragen? Stuur dan gerust een bericht via je klantportaal:\n${portalUrl}\n\nMet vriendelijke groet,\n${settings.myName}\n${settings.myTitle || ''}\n${settings.agencyName}`;
        await sendEmail({ to: clientEmail, subject: `Welkom bij ${settings.agencyName} — volgende stappen`, body: welcomeBody, settings });
        emailSent = true;
      } catch { /* email optional */ }
    }
    send(3, 'Welkomstmail versturen', emailSent ? 'done' : 'skipped', { note: emailSent ? clientEmail : 'Geen email of Gmail niet geconfigureerd' });

    // Step 4 — AI project plan
    send(4, 'Projectplan genereren (AI)', 'running');
    let projectPlan = null;
    try {
      const serviceNames = (lead.services || []).map(s => s.name).join(', ') || 'AI-marketingdiensten';
      projectPlan = await aiJSON(`Je bent een projectmanager bij een AI marketing bureau.
Maak een 4-weken projectplan voor ${lead.companyName} (${lead.niche}, ${lead.location}).
Diensten: ${serviceNames}.
Antwoord ALLEEN als JSON: { "title": "string", "overview": "string (2-3 zinnen)", "weeks": [{ "week": 1, "focus": "string", "deliverables": ["string"] }, ...4 items total] }`);
    } catch { projectPlan = { title: `Project ${lead.companyName}`, overview: 'Automatisch projectplan wordt later aangevuld.', weeks: [{ week: 1, focus: 'Onboarding & intake', deliverables: ['Intake gesprek plannen', 'Strategie document opstellen'] }] }; }
    send(4, 'Projectplan genereren (AI)', 'done');

    // Step 5 — AI content calendar
    send(5, 'Content kalender genereren (AI)', 'running');
    let contentCalendar = null;
    try {
      contentCalendar = await aiJSON(`Maak een content kalender voor maand 1 voor ${lead.companyName} (${lead.niche}).
Antwoord ALLEEN als JSON: { "items": [{ "week": 1, "platform": "Instagram/Facebook/LinkedIn", "type": "Reel/Post/Story", "topic": "string", "caption": "string (kort)" }, ...8 items total] }`);
    } catch { contentCalendar = { items: [] }; }
    send(5, 'Content kalender genereren (AI)', 'done');

    // Step 6 — AI week-1 tasks
    send(6, 'Week 1 takenlijst aanmaken (AI)', 'running');
    let tasks = null;
    try {
      tasks = await aiJSON(`Maak een takenlijst voor week 1 van het project voor ${lead.companyName}.
Antwoord ALLEEN als JSON: { "tasks": [{ "title": "string", "description": "string", "priority": "hoog/middel/laag", "day": "ma/di/wo/do/vr" }, ...6-8 items] }`);
    } catch { tasks = { tasks: [] }; }
    send(6, 'Week 1 takenlijst aanmaken (AI)', 'done');

    // Step 7 — Team briefing email
    send(7, 'Team briefing versturen', 'running');
    let briefingSent = false;
    if (isGmailReady(settings)) {
      try {
        const briefBody = `Nieuw project gestart: ${lead.companyName}\n\nNiche: ${lead.niche} | Locatie: ${lead.location}\nDiensten: ${(lead.services || []).map(s => s.name).join(', ')}\nGeschat maandbedrag: €${lead.estimatedValue || 0}\n\nProjectplan: ${projectPlan?.title || ''}\n${projectPlan?.overview || ''}\n\nIntake link (voor klant): ${intakeUrl}\nKlantportaal: ${portalUrl}\n\nWeek 1 focus: ${projectPlan?.weeks?.[0]?.focus || 'Onboarding'}`;
        await sendEmail({ to: settings.gmailAddress, subject: `[Project gestart] ${lead.companyName}`, body: briefBody, settings });
        briefingSent = true;
      } catch { /* optional */ }
    }
    send(7, 'Team briefing versturen', briefingSent ? 'done' : 'skipped');

    // Step 8 — Status update
    send(8, 'Status bijwerken naar klant', 'running');
    lead.status = 'client';
    lead.projectStartedAt = new Date().toISOString();
    lead.projectPlan = projectPlan;
    lead.contentCalendar = contentCalendar;
    lead.tasks = tasks?.tasks || [];
    addLeadHistory(leads, lead.id, { event: 'projectStarted', label: 'Project gestart via Project Engine' });
    writeJSON('leads.json', leads);
    send(8, 'Status bijwerken naar klant', 'done');

    send(0, 'Project engine voltooid', 'complete', { intakeUrl, portalUrl });
  } catch (err) {
    send(0, err.message, 'error');
  }
  res.end();
});

// ─── Proposal Generator (SSE 3-step) ────────────────────────────────────────

app.post('/api/leads/:id/generate-proposal', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');

  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) { send({ error: 'Lead niet gevonden' }); return res.end(); }

  const settings = readJSON('settings.json') || {};
  const agencyName = settings.agencyName || 'Agency AI';
  const myName     = settings.myName     || 'Ekow';
  const myTitle    = settings.myTitle    || 'AI Growth Specialist';

  try {
    // Step 1: analyse
    send({ step: 1, label: 'Lead data analyseren' });
    const services = (lead.services || []).slice(0, 6);
    const totalMonthly = services.filter(s => s.billing !== 'eenmalig').reduce((a, s) => a + (s.price || 0), 0);
    const totalOneTime = services.filter(s => s.billing === 'eenmalig').reduce((a, s) => a + (s.price || 0), 0);
    const problems = (lead.problems || []).slice(0, 3).join(', ');

    // Step 2: write proposal
    send({ step: 2, label: 'Voorstel schrijven' });
    const lang = lead.language || 'nl';
    const proposalPrompt = lang === 'nl'
      ? `Schrijf een professionele zakelijke offerte in HTML voor ${lead.companyName}.

Gegevens:
- Bedrijf: ${lead.companyName}, ${lead.niche}, ${lead.location}
- Contactpersoon: ${lead.contactName || 'de eigenaar'}
- Gesignaleerde problemen: ${problems || 'online aanwezigheid verbeteren'}
- Voorgestelde diensten: ${services.map(s => `${s.name} (€${s.price} ${s.billing})`).join(', ') || 'Maatwerk pakket'}
- Maandelijkse investering: €${totalMonthly.toLocaleString('nl-NL')}${totalOneTime ? ` + €${totalOneTime.toLocaleString('nl-NL')} eenmalig` : ''}
- Agency: ${agencyName}
- Contactpersoon agency: ${myName}, ${myTitle}

Structuur (HTML met inline CSS, professioneel maar leesbaar):
1. Header met agency logo tekst + datum
2. Persoonlijke aanhef
3. Situatieanalyse (2-3 zinnen over hun situatie)
4. Aanpak / wat wij doen (3-4 bullet points)
5. Dienstenlijst met prijzen in een nette tabel
6. Investering overzicht (maandelijks + eenmalig)
7. Planning (3 stappen: week 1, week 2-3, week 4+)
8. Waarom ${agencyName}? (3 punten)
9. Volgende stap / CTA
10. Ondertekening

Gebruik een professioneel kleurenschema met blauw (#2563eb) accent. Max 800 woorden. Geef ALLEEN de HTML terug, geen uitleg.`
      : `Write a professional business proposal in HTML for ${lead.companyName}.

Details:
- Company: ${lead.companyName}, ${lead.niche}, ${lead.location}
- Contact: ${lead.contactName || 'the owner'}
- Issues identified: ${problems || 'improve online presence'}
- Proposed services: ${services.map(s => `${s.name} (€${s.price} ${s.billing})`).join(', ') || 'Custom package'}
- Monthly investment: €${totalMonthly.toLocaleString('en')}${totalOneTime ? ` + €${totalOneTime.toLocaleString('en')} one-time` : ''}
- Agency: ${agencyName}
- Contact at agency: ${myName}, ${myTitle}

Structure (HTML with inline CSS, professional but readable):
1. Header with agency name + date
2. Personal greeting
3. Situation analysis (2-3 sentences)
4. Approach / what we do (3-4 bullet points)
5. Services list with pricing in a clean table
6. Investment overview (monthly + one-time)
7. Timeline (3 steps: week 1, week 2-3, week 4+)
8. Why ${agencyName}? (3 points)
9. Next step / CTA
10. Signature

Use a professional colour scheme with blue (#2563eb) accent. Max 800 words. Return ONLY the HTML, no explanation.`;

    const proposalHtml = await aiCall(proposalPrompt);

    // Step 3: save
    send({ step: 3, label: 'Opslaan & weergeven' });
    const idx = leads.findIndex(l => l.id === req.params.id);
    const generatedAt = new Date().toISOString();
    leads[idx].proposal = proposalHtml.trim();
    leads[idx].proposalGeneratedAt = generatedAt;
    addLeadHistory(leads, req.params.id, { event: 'proposalGenerated', label: 'Voorstel gegenereerd' });
    writeJSON('leads.json', leads);

    send({ done: true, proposal: leads[idx].proposal, generatedAt });
    res.end();
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

app.post('/api/leads/:id/proposal/send', authMiddleware, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead?.proposal) return res.status(400).json({ error: 'Geen voorstel beschikbaar' });

  const settings = readJSON('settings.json') || {};
  if (!isGmailReady(settings)) return res.status(400).json({ error: 'Gmail niet ingesteld' });

  const to = lead.contactEmail;
  if (!to) return res.status(400).json({ error: 'Geen email adres bekend' });

  try {
    await sendEmail({
      to,
      subject: `Voorstel van ${settings.agencyName || 'Agency AI'} voor ${lead.companyName}`,
      body: `Beste ${lead.contactName || 'eigenaar'},\n\nHierbij sturen wij ons voorstel voor ${lead.companyName}.\n\nBekijk het voorstel in de bijlage of reply op deze email voor vragen.\n\nMet vriendelijke groet,\n${settings.myName || 'Ekow'}\n${settings.myTitle || 'AI Growth Specialist'}\n${settings.agencyName || 'Agency AI'}`,
      settings,
      html: lead.proposal
    });
    const idx = leads.findIndex(l => l.id === req.params.id);
    leads[idx].proposalSentAt = new Date().toISOString();
    addLeadHistory(leads, req.params.id, { event: 'proposalSent', label: `Voorstel verstuurd naar ${to}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Contract Generator ──────────────────────────────────────────────────────

app.post('/api/leads/:id/generate-contract', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  const send = obj => res.write('data: ' + JSON.stringify(obj) + '\n\n');

  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) { send({ error: 'Lead niet gevonden' }); return res.end(); }

  const settings = readJSON('settings.json') || {};
  const agencyName = settings.agencyName || 'Agency AI';
  const myName     = settings.myName     || 'Ekow';
  const myTitle    = settings.myTitle    || 'AI Growth Specialist';
  const agencyAddress = settings.agencyAddress || '';
  const btwNumber  = settings.btwNumber  || '';

  try {
    send({ step: 1, label: 'Contractgegevens ophalen' });
    const services = (lead.services || []).slice(0, 8);
    const totalMonthly = services.filter(s => s.billing !== 'eenmalig').reduce((a, s) => a + (s.price || 0), 0);
    const totalOneTime = services.filter(s => s.billing === 'eenmalig').reduce((a, s) => a + (s.price || 0), 0);
    const today = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const lang = lead.language || 'nl';

    send({ step: 2, label: 'Contract opstellen' });
    const prompt = lang === 'nl'
      ? `Schrijf een professionele dienstverleningsovereenkomst in HTML met inline CSS voor onderstaande partijen.

Gegevens:
- Opdrachtgever: ${lead.companyName}, ${lead.location}${lead.contactName ? `, t.a.v. ${lead.contactName}` : ''}
- Opdrachtnemer: ${agencyName}${agencyAddress ? `, ${agencyAddress}` : ''}${myName ? `, vertegenwoordigd door ${myName} (${myTitle})` : ''}${btwNumber ? `, BTW: ${btwNumber}` : ''}
- Diensten: ${services.map(s => `${s.name} (€${s.price} ${s.billing})`).join('; ') || 'Maatwerk AI-diensten'}
- Maandelijkse vergoeding: €${totalMonthly.toLocaleString('nl-NL')}${totalOneTime ? ` + €${totalOneTime.toLocaleString('nl-NL')} eenmalig` : ''}
- Datum: ${today}

Structuur (HTML met inline CSS, professioneel zakelijk, zwart-wit met blauwe accenten #2563eb):
1. Koptekst met naam overeenkomst, partijen, datum
2. Artikel 1 — Opdracht & scope (verwijs naar specifieke diensten)
3. Artikel 2 — Looptijd (12 maanden, automatisch verlengbaar met 30 dagen opzegtermijn)
4. Artikel 3 — Vergoeding & betaling (bedragen, betaaltermijn 14 dagen, mogelijkheid om BTW toe te voegen)
5. Artikel 4 — Intellectueel eigendom (resultaten zijn eigendom opdrachtgever na volledige betaling)
6. Artikel 5 — Vertrouwelijkheid (beide partijen, 2 jaar na beëindiging)
7. Artikel 6 — Aansprakelijkheid (beperkt tot 3× maandvergoeding)
8. Artikel 7 — Overmacht
9. Artikel 8 — Beëindiging
10. Artikel 9 — Toepasselijk recht (Nederlands recht, rechtbank Amsterdam)
11. Ondertekeningsblok (twee kolommen: opdrachtgever | opdrachtnemer, naam/functie/datum/handtekening-lijn)

Gebruik nette tabellen en witruimte. Geef ALLEEN de HTML terug.`
      : `Write a professional service agreement in HTML with inline CSS for the following parties.

Details:
- Client: ${lead.companyName}, ${lead.location}${lead.contactName ? `, attn. ${lead.contactName}` : ''}
- Service provider: ${agencyName}${agencyAddress ? `, ${agencyAddress}` : ''}${myName ? `, represented by ${myName} (${myTitle})` : ''}${btwNumber ? `, VAT: ${btwNumber}` : ''}
- Services: ${services.map(s => `${s.name} (€${s.price} ${s.billing})`).join('; ') || 'Custom AI services'}
- Monthly fee: €${totalMonthly.toLocaleString('en')}${totalOneTime ? ` + €${totalOneTime.toLocaleString('en')} one-time` : ''}
- Date: ${today}

Structure (HTML with inline CSS, professional, black/white with blue accents #2563eb):
1. Header with agreement title, parties, date
2. Article 1 — Scope of services (reference specific services)
3. Article 2 — Duration (12 months, auto-renewable with 30-day notice)
4. Article 3 — Fees & payment (amounts, 14-day payment term)
5. Article 4 — Intellectual property (results owned by client after full payment)
6. Article 5 — Confidentiality (both parties, 2 years after termination)
7. Article 6 — Liability (limited to 3× monthly fee)
8. Article 7 — Force majeure
9. Article 8 — Termination
10. Article 9 — Governing law (Dutch law, Amsterdam court)
11. Signature block (two columns: client | provider, name/title/date/signature line)

Use clean tables and white space. Return ONLY the HTML.`;

    const contractHtml = await aiCall(prompt);

    send({ step: 3, label: 'Contract opslaan' });
    const idx = leads.findIndex(l => l.id === req.params.id);
    const generatedAt = new Date().toISOString();
    leads[idx].contract = contractHtml.trim();
    leads[idx].contractGeneratedAt = generatedAt;
    addLeadHistory(leads, req.params.id, { event: 'contractGenerated', label: 'Contract gegenereerd' });
    writeJSON('leads.json', leads);

    send({ done: true, contract: leads[idx].contract, generatedAt });
    res.end();
  } catch (err) {
    send({ error: err.message });
    res.end();
  }
});

app.post('/api/leads/:id/contract/send', authMiddleware, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead?.contract) return res.status(400).json({ error: 'Geen contract beschikbaar' });

  const settings = readJSON('settings.json') || {};
  if (!isGmailReady(settings)) return res.status(400).json({ error: 'Gmail niet ingesteld' });

  const to = lead.contactEmail;
  if (!to) return res.status(400).json({ error: 'Geen email adres bekend' });

  try {
    await sendEmail({
      to,
      subject: `Dienstverleningsovereenkomst — ${settings.agencyName || 'Agency AI'} × ${lead.companyName}`,
      body: `Beste ${lead.contactName || 'eigenaar'},\n\nHierbij sturen wij de dienstverleningsovereenkomst ter ondertekening.\n\nLees het contract door, onderteken en stuur een scan/foto terug.\n\nMet vriendelijke groet,\n${settings.myName || 'Ekow'}\n${settings.myTitle || 'AI Growth Specialist'}\n${settings.agencyName || 'Agency AI'}`,
      settings,
      html: lead.contract
    });
    const idx = leads.findIndex(l => l.id === req.params.id);
    leads[idx].contractSentAt = new Date().toISOString();
    addLeadHistory(leads, req.params.id, { event: 'contractSent', label: `Contract verstuurd naar ${to}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Delivery Generator (SSE 4-step) ─────────────────────────────────────

app.post('/api/leads/:id/generate-delivery', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (step, label, status, extra = {}) => {
    res.write(`data: ${JSON.stringify({ step, label, status, ...extra })}\n\n`);
  };

  try {
    const leads = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    const idx = leads.findIndex(l => l.id === req.params.id);
    if (idx === -1) { send(0, 'Lead niet gevonden', 'error'); res.end(); return; }
    const lead = leads[idx];

    const serviceNames = (lead.services || []).map(s => s.name).join(', ') || 'AI-marketingdiensten';
    const intakeContext = lead.intakeAnswers
      ? '\n\nIntake antwoorden van de klant:\n' + Object.entries(lead.intakeAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : '';

    // Step 1 — Full content calendar
    send(1, 'Content kalender genereren (maand 1)', 'running');
    let fullCalendar = null;
    try {
      fullCalendar = await aiJSON(`Maak een gedetailleerde content kalender voor VOLLEDIGE MAAND 1 voor ${lead.companyName} (${lead.niche}, ${lead.location}).
Diensten: ${serviceNames}.${intakeContext}
Maak precies 20 posts verspreid over 4 weken.
Antwoord ALLEEN als JSON: { "items": [{ "week": 1, "day": "ma/di/wo/do/vr/za/zo", "platform": "Instagram/Facebook/LinkedIn/TikTok", "type": "Reel/Carousel/Post/Story/Video", "topic": "string", "caption": "string (volledige Nederlandse caption, 2-3 zinnen)", "hashtags": ["#tag1","#tag2","#tag3","#tag4","#tag5"], "bestTime": "HH:MM" }] }`);
    } catch { fullCalendar = { items: (lead.contentCalendar?.items || []) }; }
    send(1, 'Content kalender genereren (maand 1)', 'done');

    // Step 2 — Chatbot FAQ flow
    send(2, 'Chatbot FAQ flow genereren', 'running');
    let chatbotFlow = null;
    try {
      chatbotFlow = await aiJSON(`Maak een chatbot FAQ script voor ${lead.companyName} (${lead.niche}).${intakeContext}
Dit zijn de meest gestelde vragen die bezoekers stellen op de website of via WhatsApp.
Maak 12 relevante Q&A paren die direct nuttig zijn voor het bedrijf.
Antwoord ALLEEN als JSON: { "faqs": [{ "question": "string", "answer": "string (2-3 zinnen, vriendelijk en professioneel)", "category": "Prijzen/Openingstijden/Diensten/Locatie/Afspraken/Overig" }] }`);
    } catch { chatbotFlow = { faqs: [] }; }
    send(2, 'Chatbot FAQ flow genereren', 'done');

    // Step 3 — Detailed project milestones
    send(3, 'Projectmijlpalen uitwerken', 'running');
    let milestones = null;
    try {
      milestones = await aiJSON(`Maak een gedetailleerde mijlpalentijdlijn voor een 3-maanden project voor ${lead.companyName}.
Diensten: ${serviceNames}.${intakeContext}
Antwoord ALLEEN als JSON: { "milestones": [{ "week": 1, "title": "string", "description": "string", "deliverables": ["string","string","string"], "status": "upcoming" }] } — maak precies 12 weken.`);
    } catch { milestones = { milestones: [] }; }
    send(3, 'Projectmijlpalen uitwerken', 'done');

    // Step 4 — Save and notify
    send(4, 'Opslaan & klant notificeren', 'running');
    const delivery = {
      generatedAt: new Date().toISOString(),
      contentCalendar: fullCalendar,
      chatbotFlow: chatbotFlow,
      milestones: milestones
    };
    leads[idx].delivery = delivery;
    // Update portal phase to 2 (Strategie → Uitvoering)
    if ((leads[idx].currentPhase || 1) < 2) leads[idx].currentPhase = 2;
    addLeadHistory(leads, lead.id, { event: 'deliveryGenerated', label: 'AI leveringen gegenereerd (content kalender, chatbot FAQ, mijlpalen)' });
    writeJSON('leads.json', leads);

    // Auto-send AI delivery email to client
    if (settings.autoClientEmails?.deliveryReady !== false && lead.email && isGmailReady(settings)) {
      try {
        const email = await generateClientEmail(leads[idx], 'deliveryReady', settings);
        await sendEmail({ to: lead.email, subject: email.subject, body: email.body, settings });
        if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
        leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'deliveryReady', subject: email.subject, body: email.body, to: lead.email, sentAt: new Date().toISOString(), sentBy: 'systeem' });
        writeJSON('leads.json', leads);
      } catch { /* optional */ }
    }
    send(4, 'Opslaan & klant notificeren', 'done');

    send(0, 'Leveringen gegenereerd', 'complete');
  } catch (err) {
    send(0, err.message, 'error');
  }
  res.end();
});

// ─── Website Generator ───────────────────────────────────────────────────────

function generateSiteSlug(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40) + '-' + Date.now().toString(36);
}

function getColorScheme(niche) {
  const schemes = {
    horeca:     { primary: '#c2410c', accent: '#ea580c' },
    kapper:     { primary: '#7c3aed', accent: '#8b5cf6' },
    schoonheid: { primary: '#be185d', accent: '#ec4899' },
    beauty:     { primary: '#be185d', accent: '#ec4899' },
    fitness:    { primary: '#047857', accent: '#10b981' },
    gezondheid: { primary: '#0369a1', accent: '#0ea5e9' },
    tandarts:   { primary: '#0284c7', accent: '#38bdf8' },
    advocaat:   { primary: '#1d4ed8', accent: '#3b82f6' },
    accountant: { primary: '#1d4ed8', accent: '#3b82f6' },
    vastgoed:   { primary: '#b45309', accent: '#f59e0b' },
    auto:       { primary: '#374151', accent: '#6b7280' },
    restaurant: { primary: '#c2410c', accent: '#ea580c' },
    bakker:     { primary: '#92400e', accent: '#d97706' },
    slager:     { primary: '#991b1b', accent: '#dc2626' },
  };
  const key = Object.keys(schemes).find(k => (niche || '').toLowerCase().includes(k));
  return schemes[key] || { primary: '#4f46e5', accent: '#6366f1' };
}

app.post('/api/leads/:id/generate-site', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (step, label, status, extra = {}) => {
    res.write(`data: ${JSON.stringify({ step, label, status, ...extra })}\n\n`);
  };

  try {
    const leads = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    const idx = leads.findIndex(l => l.id === req.params.id);
    if (idx === -1) { send(0, 'Lead niet gevonden', 'error'); res.end(); return; }
    const lead = leads[idx];

    const serviceNames = (lead.services || []).map(s => s.name).join(', ') || 'AI-diensten';
    const intakeContext = lead.intakeAnswers
      ? '\n\nIntake antwoorden:\n' + Object.entries(lead.intakeAnswers).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : '';
    const colors = getColorScheme(lead.niche);

    // Step 1 — Generate content
    send(1, 'Website content genereren met AI', 'running');
    let content = null;
    try {
      content = await aiJSON(`Genereer complete website content voor ${lead.companyName} (${lead.niche}, ${lead.location}).
Diensten geleverd: ${serviceNames}.${intakeContext}
Primaire kleur: ${colors.primary}.
Antwoord ALLEEN als JSON:
{
  "headline": "Hoofdtitel (max 8 woorden, pakkend en specifiek voor dit bedrijf)",
  "subheadline": "Ondertitel (1 zin, max 15 woorden, beschrijft de waarde)",
  "about": "Over ons tekst (2-3 zinnen, persoonlijk en concreet)",
  "services": [{ "icon": "emoji", "title": "string (max 4 woorden)", "desc": "1-2 zinnen" }],
  "ctaText": "Call-to-action knoptekst (max 5 woorden)",
  "ctaSubtext": "Ondertekst bij CTA (max 12 woorden)",
  "footerTagline": "Footer slogan (max 10 woorden)"
}`);
    } catch {
      content = {
        headline: `Welkom bij ${lead.companyName}`,
        subheadline: `Professionele ${lead.niche} diensten in ${lead.location}`,
        about: `${lead.companyName} staat voor kwaliteit en betrouwbaarheid in ${lead.location}. Wij helpen onze klanten met professionele diensten op maat.`,
        services: [{ icon: '⭐', title: serviceNames.split(',')[0].trim(), desc: 'Professionele service op maat voor uw behoeften.' }],
        ctaText: 'Neem contact op',
        ctaSubtext: 'We reageren binnen 24 uur',
        footerTagline: `${lead.companyName} — Altijd voor u klaar`
      };
    }
    send(1, 'Website content genereren met AI', 'done');

    // Step 2 — Generate full HTML
    send(2, 'Volledige HTML website bouwen', 'running');
    let siteHtml = null;
    const contactEmail = lead.contactEmail || '';
    const template = req.body?.template || 'modern';
    const templateStyle = {
      modern:    'Modern en clean: veel witruimte, subtiele schaduwen, gradient hero, afgeronde hoeken, blue/white kleurenschema.',
      bold:      'Bold en impactvol: donkere hero (#0f172a), grote headlines, hoge contrast, opvallende CTA knop in accent kleur.',
      minimal:   'Minimalistisch: extreem veel witruimte, dunne borders, grijstinten, kleine elegante typografie, geen afbeeldingen.',
      corporate: 'Corporate/zakelijk: strak grid, professionele blauwe tinten, duidelijke hiërarchie, formele toon.'
    }[template] || 'Modern en clean.';
    try {
      const servicesStr = (content.services || []).map(s => `${s.icon} ${s.title}: ${s.desc}`).join('\n');
      siteHtml = await aiCall(`Maak een COMPLETE professionele single-page website in HTML voor ${lead.companyName} (${lead.niche} in ${lead.location}).

Stijl template: ${templateStyle}

Gebruik deze content EXACT:
- Headline: ${content.headline}
- Subheadline: ${content.subheadline}
- Over ons: ${content.about}
- Diensten:\n${servicesStr}
- CTA knop: ${content.ctaText}
- CTA ondertekst: ${content.ctaSubtext}
- Primaire kleur: ${colors.primary}
- Accent kleur: ${colors.accent}
${contactEmail ? `- Email: ${contactEmail}` : ''}

VERPLICHTE structuur:
1. Nav (logo/naam, links: Home | Diensten | Over ons | Contact)
2. Hero (grote headline, subheadline, CTA knop, gradient achtergrond in primaire kleur)
3. Diensten grid (3 kolommen op desktop, 1 op mobiel)
4. Over ons sectie
5. Contact sectie (email knop${contactEmail ? `, mailto:${contactEmail}` : ''})
6. Footer

TECHNISCHE VEREISTEN:
- Volledig standalone HTML — alle CSS in <style> tag
- Mobile responsive (flexbox/grid)
- Smooth scroll (scroll-behavior: smooth)
- Geen externe resources, geen JavaScript, geen afbeeldingen
- Kleur ${colors.primary} voor knoppen, headings, accenten
- Wit op primaire kleur voor hero CTA knop
- Schone, moderne typografie (system font stack)
- Geen placeholder tekst

Geef ALLEEN de volledige HTML terug. Geen uitleg, geen markdown, geen backticks.`);
    } catch (e) { send(0, 'HTML generatie mislukt: ' + e.message, 'error'); res.end(); return; }

    // Strip markdown code fences if Claude wrapped it
    siteHtml = siteHtml.trim();
    if (siteHtml.startsWith('```')) {
      siteHtml = siteHtml.replace(/^```[a-z]*\n?/, '').replace(/```$/, '').trim();
    }
    if (!siteHtml.toLowerCase().includes('<!doctype') && !siteHtml.toLowerCase().includes('<html')) {
      siteHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${lead.companyName}</title></head><body>${siteHtml}</body></html>`;
    }
    send(2, 'Volledige HTML website bouwen', 'done');

    // Step 3 — Save to disk
    send(3, 'Website opslaan en URL aanmaken', 'running');
    const siteSlug = generateSiteSlug(lead.companyName);
    const sitesDir = path.join(__dirname, 'public', 'sites', siteSlug);
    fs.mkdirSync(sitesDir, { recursive: true });

    // Auto-inject GA4 if configured
    if (settings.gaId && /^G-[A-Z0-9]+$/i.test(settings.gaId)) {
      const gaSnippet = `<!-- Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=${settings.gaId}"></script>\n<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${settings.gaId}',{anonymize_ip:true});</script>`;
      siteHtml = siteHtml.replace(/<\/head>/i, gaSnippet + '\n</head>');
    }

    // Archive previous version (max 3)
    const existingHtmlPath = path.join(sitesDir, 'index.html');
    if (fs.existsSync(existingHtmlPath) && leads[idx].generatedSite) {
      const prevHtml = fs.readFileSync(existingHtmlPath, 'utf8');
      if (!leads[idx].generatedSite.versions) leads[idx].generatedSite.versions = [];
      leads[idx].generatedSite.versions.unshift({ html: prevHtml, savedAt: leads[idx].generatedSite.generatedAt || new Date().toISOString(), template: leads[idx].generatedSite.template || 'modern' });
      if (leads[idx].generatedSite.versions.length > 3) leads[idx].generatedSite.versions.splice(3);
    }

    fs.writeFileSync(path.join(sitesDir, 'index.html'), siteHtml, 'utf8');

    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    const siteUrl = `${baseUrl}/sites/${siteSlug}`;

    leads[idx].generatedSite = {
      siteSlug, siteUrl,
      generatedAt: new Date().toISOString(),
      template,
      content, status: leads[idx].generatedSite?.status || 'preview',
      feedback: leads[idx].generatedSite?.feedback || [],
      versions: leads[idx].generatedSite?.versions || []
    };
    addLeadHistory(leads, lead.id, { event: 'siteGenerated', label: `Website gegenereerd: ${siteUrl}` });
    writeJSON('leads.json', leads);
    send(3, 'Website opslaan en URL aanmaken', 'done');

    // Step 4 — Send preview to client
    send(4, 'Preview link versturen naar klant', 'running');
    if (contactEmail && isGmailReady(settings)) {
      try {
        const subject = `Je website preview is klaar — ${lead.companyName}`;
        const body = `Hoi${lead.contactName ? ' ' + lead.contactName.split(' ')[0] : ''},\n\nJe website preview staat klaar! Bekijk hem via de link hieronder:\n\n${siteUrl}\n\nHeb je feedback of aanpassingen? Laat het gerust weten via het klantportaal of stuur een reply.\n\nMet vriendelijke groet,\n${settings.myName || settings.agencyName || 'Agency AI'}`;
        await sendEmail({ to: contactEmail, subject, body, settings });
        if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
        leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'sitePreview', subject, body, to: contactEmail, sentAt: new Date().toISOString(), sentBy: 'systeem' });
        writeJSON('leads.json', leads);
      } catch { /* optional */ }
    }
    send(4, 'Preview link versturen naar klant', 'done');

    send(0, 'Website gegenereerd', 'complete', { siteUrl, siteSlug });
  } catch (err) {
    send(0, err.message, 'error');
  }
  res.end();
});

app.get('/api/leads/:id/site', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!lead.generatedSite) return res.json({ exists: false });
  const { siteSlug } = lead.generatedSite;
  let html = '';
  try { html = fs.readFileSync(path.join(__dirname, 'public', 'sites', siteSlug, 'index.html'), 'utf8'); } catch { /* file may not exist */ }
  res.json({ exists: true, ...lead.generatedSite, html });
});

app.patch('/api/leads/:id/site', requireAdmin, (req, res) => {
  const { html } = req.body;
  if (!html) return res.status(400).json({ error: 'HTML verplicht' });
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!leads[idx].generatedSite) return res.status(400).json({ error: 'Geen website gegenereerd' });
  const { siteSlug } = leads[idx].generatedSite;
  try { fs.writeFileSync(path.join(__dirname, 'public', 'sites', siteSlug, 'index.html'), html, 'utf8'); }
  catch (e) { return res.status(500).json({ error: e.message }); }
  leads[idx].generatedSite.lastEditedAt = new Date().toISOString();
  addLeadHistory(leads, leads[idx].id, { event: 'siteEdited', label: 'Website HTML bewerkt' });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/site/feedback', (req, res) => {
  const { feedback } = req.body;
  if (!feedback) return res.status(400).json({ error: 'Feedback verplicht' });
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!leads[idx].generatedSite) return res.status(400).json({ error: 'Geen website gegenereerd' });
  if (!leads[idx].generatedSite.feedback) leads[idx].generatedSite.feedback = [];
  leads[idx].generatedSite.feedback.push({ text: feedback, time: new Date().toISOString(), by: req.user?.name || 'team' });
  addLeadHistory(leads, leads[idx].id, { event: 'siteFeedback', label: `Website feedback: ${feedback.substring(0, 60)}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// SEO meta inject
app.post('/api/leads/:id/site/seo', requireAdmin, (req, res) => {
  const { title, description, keywords } = req.body || {};
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const site  = leads[idx].generatedSite;
  if (!site) return res.status(400).json({ error: 'Geen website gegenereerd' });
  const htmlPath = path.join(__dirname, 'public', 'sites', site.siteSlug, 'index.html');
  let html;
  try { html = fs.readFileSync(htmlPath, 'utf8'); } catch { return res.status(500).json({ error: 'HTML bestand niet gevonden' }); }

  // Replace or inject <title>
  if (title) {
    if (/<title>/i.test(html)) { html = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`); }
    else { html = html.replace(/<head>/i, `<head>\n<title>${title}</title>`); }
  }
  // Replace or inject meta description
  const descTag = `<meta name="description" content="${description || ''}">`;
  if (/<meta\s+name="description"/i.test(html)) { html = html.replace(/<meta\s+name="description"[^>]*>/i, descTag); }
  else { html = html.replace(/<\/title>/i, `</title>\n${descTag}`); }

  // Keywords
  if (keywords) {
    const kwTag = `<meta name="keywords" content="${keywords}">`;
    if (/<meta\s+name="keywords"/i.test(html)) { html = html.replace(/<meta\s+name="keywords"[^>]*>/i, kwTag); }
    else { html = html.replace(/<\/title>/i, `</title>\n${kwTag}`); }
  }

  try { fs.writeFileSync(htmlPath, html, 'utf8'); } catch (e) { return res.status(500).json({ error: e.message }); }
  leads[idx].generatedSite.seo = { title, description, keywords, updatedAt: new Date().toISOString() };
  addLeadHistory(leads, leads[idx].id, { event: 'siteSeo', label: 'Website SEO meta tags bijgewerkt' });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Version revert
app.post('/api/leads/:id/site/revert/:versionIdx', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const site  = leads[idx].generatedSite;
  if (!site) return res.status(400).json({ error: 'Geen website gegenereerd' });
  const vIdx  = parseInt(req.params.versionIdx, 10);
  const versions = site.versions || [];
  if (isNaN(vIdx) || vIdx < 0 || vIdx >= versions.length) return res.status(400).json({ error: 'Ongeldige versie index' });

  const htmlPath = path.join(__dirname, 'public', 'sites', site.siteSlug, 'index.html');
  // Archive current before reverting
  let currentHtml = '';
  try { currentHtml = fs.readFileSync(htmlPath, 'utf8'); } catch {}
  if (currentHtml) { versions.unshift({ html: currentHtml, savedAt: site.generatedAt || new Date().toISOString(), template: site.template || 'modern' }); }

  const target = versions.splice(vIdx + (currentHtml ? 1 : 0), 1)[0];
  if (versions.length > 3) versions.splice(3);

  try { fs.writeFileSync(htmlPath, target.html, 'utf8'); } catch (e) { return res.status(500).json({ error: e.message }); }
  leads[idx].generatedSite.versions = versions;
  leads[idx].generatedSite.generatedAt = target.savedAt;
  leads[idx].generatedSite.template = target.template || 'modern';
  addLeadHistory(leads, leads[idx].id, { event: 'siteReverted', label: `Website teruggezet naar versie van ${new Date(target.savedAt).toLocaleDateString('nl-NL')}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.patch('/api/leads/:id/site/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  if (!['preview', 'live'].includes(status)) return res.status(400).json({ error: 'Ongeldige status' });
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!leads[idx].generatedSite) return res.status(400).json({ error: 'Geen website gegenereerd' });
  leads[idx].generatedSite.status = status;
  addLeadHistory(leads, leads[idx].id, { event: 'siteStatus', label: `Website status: ${status}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// ─── Automatic client communications ────────────────────────────────────────

const CLIENT_EMAIL_TEMPLATES = {
  welcome:         { subject: 'Welkom bij {agency} — jouw project start nu!', trigger: 'Projectstart' },
  intakeReceived:  { subject: 'Intake ontvangen — we gaan aan de slag!', trigger: 'Intake ingevuld' },
  deliveryReady:   { subject: 'Jouw eerste leveringen zijn klaar 🎉', trigger: 'Leveringen klaar' },
  weekComplete:    { subject: 'Week {week} afgerond — hier is het overzicht', trigger: 'Week afgerond' },
  monthlyUpdate:   { subject: 'Maandupdate — {month} resultaten voor {company}', trigger: 'Maandupdate' },
  checkIn:         { subject: 'Check-in: hoe gaat het tot nu toe?', trigger: 'Check-in' },
};

async function generateClientEmail(lead, trigger, settings, extra = {}) {
  const serviceNames = (lead.services || []).map(s => s.name).join(', ') || 'AI-diensten';
  const intakeCtx = lead.intakeAnswers ? '\nIntake antwoorden:\n' + Object.entries(lead.intakeAnswers).map(([k,v]) => `- ${k}: ${v}`).join('\n') : '';
  const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const portalUrl = lead.portalToken ? `${baseUrl}/portal/${lead.portalToken}` : '';

  const prompts = {
    welcome: `Schrijf een warme welkomstmail voor een nieuw klant.
Klant: ${lead.companyName} (${lead.niche}, ${lead.location}).
Diensten: ${serviceNames}.
Bureau: ${settings.agencyName}, contactpersoon: ${settings.myName} (${settings.myTitle||''}).
${intakeCtx}
De mail is professioneel maar persoonlijk, max 200 woorden. Geen bullet lists. Noem concreet wat er de komende week gaat gebeuren.
${portalUrl ? `Vermeld de klantportaal link: ${portalUrl}` : ''}
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,

    intakeReceived: `Schrijf een korte bevestigingsmail dat we de intake hebben ontvangen en ermee aan de slag gaan.
Klant: ${lead.companyName}. Bureau: ${settings.agencyName}, ${settings.myName}.
${intakeCtx}
Max 120 woorden. Informeer wanneer ze de eerste leveringen kunnen verwachten (binnen 24-48 uur).
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,

    deliveryReady: `Schrijf een enthousiaste mail dat de eerste leveringen klaarstaan in het portaal.
Klant: ${lead.companyName}. Bureau: ${settings.agencyName}, ${settings.myName}.
Leveringen: content kalender maand 1, chatbot FAQ script, projectmijlpalen.
${portalUrl ? `Portaal: ${portalUrl}` : ''}
Max 180 woorden. Wek enthousiasme, leg kort uit wat erin zit.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,

    weekComplete: `Schrijf een korte wekelijkse voortgangsupdate mail.
Klant: ${lead.companyName}. Week ${extra.week || 1} is afgerond.
Taken voltooid: ${extra.tasksDone || 0}/${extra.tasksTotal || 0}.
Bureau: ${settings.agencyName}, ${settings.myName}.
${portalUrl ? `Portaal: ${portalUrl}` : ''}
Max 150 woorden. Positief en motiverend.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,

    monthlyUpdate: `Schrijf een maandelijkse voortgangsmail.
Klant: ${lead.companyName} (${lead.niche}). Diensten: ${serviceNames}.
Maand: ${new Date().toLocaleDateString('nl-NL', {month:'long',year:'numeric'})}.
Bureau: ${settings.agencyName}, ${settings.myName}.
${portalUrl ? `Portaal: ${portalUrl}` : ''}
Max 200 woorden. Bespreek resultaten, wat er goed gaat en wat de focus is voor volgende maand.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,

    checkIn: `Schrijf een vriendelijke check-in mail halverwege het project.
Klant: ${lead.companyName}. Project loopt nu ${extra.weeksRunning || 4} weken.
Bureau: ${settings.agencyName}, ${settings.myName}.
Max 130 woorden. Informeel, vraag naar ervaringen, bied aan om te bellen.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`,
  };

  const prompt = prompts[trigger];
  if (!prompt) throw new Error('Onbekend trigger type');
  const result = await aiJSON(prompt);
  if (!result?.subject || !result?.body) throw new Error('AI gaf geen geldige email terug');

  // Replace placeholders
  result.subject = result.subject
    .replace('{agency}', settings.agencyName)
    .replace('{company}', lead.companyName)
    .replace('{week}', extra.week || '')
    .replace('{month}', new Date().toLocaleDateString('nl-NL', {month:'long'}));

  return result;
}

app.post('/api/leads/:id/client-email', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];
  const { trigger, customNote, preview } = req.body;

  if (!CLIENT_EMAIL_TEMPLATES[trigger]) return res.status(400).json({ error: 'Ongeldig trigger type' });

  try {
    const email = await generateClientEmail(lead, trigger, settings, req.body);

    // If preview=true, just return without sending
    if (preview) return res.json({ subject: email.subject, body: email.body });

    const to = lead.email || lead.contactEmail || '';
    if (!to) return res.status(400).json({ error: 'Geen email adres bekend voor dit bedrijf' });
    if (!isGmailReady(settings)) return res.status(400).json({ error: 'Gmail niet geconfigureerd' });

    await sendEmail({ to, subject: email.subject, body: email.body, settings });

    // Log
    if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
    leads[idx].clientEmailLog.push({
      id: Date.now().toString(36),
      trigger,
      subject: email.subject,
      body: email.body,
      to,
      sentAt: new Date().toISOString(),
      sentBy: req.user?.name || req.user?.username || 'systeem'
    });
    addLeadHistory(leads, lead.id, { event: 'clientEmailSent', label: `Email verstuurd: ${CLIENT_EMAIL_TEMPLATES[trigger].trigger} → ${to}` });
    writeJSON('leads.json', leads);

    console.log(`[ClientEmail] ${trigger} → ${lead.companyName} <${to}>`);
    res.json({ ok: true, subject: email.subject });
  } catch (err) {
    console.error('[ClientEmail] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/leads/:id/client-emails', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.clientEmailLog || []);
});

app.post('/api/leads/:id/portal/read', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (lead.clientMessages) lead.clientMessages.forEach(m => { m.read = true; });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// â"€â"€â"€ Inbox â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.get('/api/inbox', (req, res) => {
  const inbox = readJSON('inbox.json') || [];
  res.json(inbox);
});

app.patch('/api/inbox/:id/approve', async (req, res) => {
  const inbox = readJSON('inbox.json') || [];
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });

  const settings = readJSON('settings.json');
  const item = inbox[idx];
  const version = (req.body?.version === 'B' && item.emailB) ? 'B' : 'A';
  const chosenEmail = version === 'B' ? item.emailB : (item.emailA || item.email);

  inbox[idx].approvedAt = new Date().toISOString();
  inbox[idx].sentVersion = version;

  // Email duplicate check — warn if this email was already sent to
  const allLeads = readJSON('leads.json') || [];
  const emailToCheck = (item.contactEmail || '').toLowerCase().trim();
  const emailDup = emailToCheck
    ? allLeads.find(l =>
        l.id !== item.leadId &&
        (l.contactEmail || l.email || '').toLowerCase().trim() === emailToCheck &&
        ['sent', 'replied', 'client', 'scheduled'].includes(l.status))
    : null;
  if (emailDup) {
    inbox[idx].emailDuplicateWarning = { id: emailDup.id, companyName: emailDup.companyName, status: emailDup.status };
    console.warn(`[DupEmail] ${item.contactEmail} ook gebruikt door ${emailDup.companyName} (${emailDup.status})`);
  }

  // AI reply items: send our response email back to the business
  if (item.type === 'ai_reply') {
    const draft   = req.body?.aiDraft || item.aiDraft || '';
    const subject = item.subject || `Re: ${item.companyName}`;
    try {
      await sendEmail({ to: item.contactEmail, subject, body: draft, settings });
      inbox[idx].status       = 'sent';
      inbox[idx].sentAt       = new Date().toISOString();
      inbox[idx].aiDraftFinal = draft;
      writeJSON('inbox.json', inbox);

      const leads2 = readJSON('leads.json') || [];
      addLeadHistory(leads2, item.leadId, { event: 'aiReplySent', label: `AI antwoord verstuurd naar ${item.contactEmail}` });
      writeJSON('leads.json', leads2);
      addActivity('email', `AI antwoord verstuurd → ${item.companyName}`, { meta: { leadId: item.leadId } });
      return res.json(inbox[idx]);
    } catch (err) {
      console.error('[AiReply] Verzenden mislukt:', err.message);
      inbox[idx].status = 'approved';
      writeJSON('inbox.json', inbox);
      return res.status(500).json({ error: 'Email verzenden mislukt: ' + err.message });
    }
  }

  // LinkedIn DM items: no email to send — just mark as sent and update lead
  if (item.type === 'linkedinDm') {
    inbox[idx].status = 'sent';
    inbox[idx].sentAt = new Date().toISOString();
    writeJSON('inbox.json', inbox);
    const leads = readJSON('leads.json') || [];
    const leadIdx = leads.findIndex(l => l.id === item.leadId);
    if (leadIdx !== -1) {
      leads[leadIdx].linkedinDmSentAt = inbox[idx].sentAt;
      addLeadHistory(leads, item.leadId, { event: 'linkedinDmSent', label: 'LinkedIn DM gekopieerd & verstuurd' });
      writeJSON('leads.json', leads);
    }
    return res.json(inbox[idx]);
  }

  // Handle scheduled send
  if (req.body?.scheduled && item.sendOptimalTime) {
    inbox[idx].status    = 'scheduled';
    inbox[idx].scheduledAt = item.sendOptimalTime;
    writeJSON('inbox.json', inbox);
    const leads = readJSON('leads.json') || [];
    const leadIdx = leads.findIndex(l => l.id === item.leadId);
    if (leadIdx !== -1) {
      leads[leadIdx].status = 'scheduled';
      leads[leadIdx].scheduledAt = item.sendOptimalTime;
      leads[leadIdx].sentVersion = version;
      addLeadHistory(leads, item.leadId, { event: 'scheduled', label: `Ingepland voor ${NL_DAYS[new Date(item.sendOptimalTime).getDay()]} om ${String(new Date(item.sendOptimalTime).getHours()).padStart(2,'0')}:00` });
      writeJSON('leads.json', leads);
    }
    return res.json(inbox[idx]);
  }

  if (isGmailReady(settings)) {
    try {
      const trackingToken = 'otk-' + item.leadId + '-' + Math.random().toString(36).substr(2, 8);
      inbox[idx].trackingToken = trackingToken;
      // Accept manually entered email from frontend (for leads without verified email)
      const manualEmail    = req.body?.manualEmail?.trim() || null;
      if (manualEmail) {
        inbox[idx].contactEmail = manualEmail;
        inbox[idx].emailSource  = 'handmatig';
        // Also save to lead
        const allLeads2 = readJSON('leads.json') || [];
        const li2 = allLeads2.findIndex(l => l.id === item.leadId);
        if (li2 !== -1) { allLeads2[li2].contactEmail = manualEmail; allLeads2[li2].emailSource = 'handmatig'; writeJSON('leads.json', allLeads2); }
      }
      const recipientEmail = inbox[idx].contactEmail;
      if (!recipientEmail) {
        inbox[idx].status = 'approved';
        writeJSON('inbox.json', inbox);
        return res.status(400).json({ error: 'Geen emailadres beschikbaar — voeg handmatig een emailadres toe' });
      }
      await sendEmail({
        to: recipientEmail,
        subject: chosenEmail?.subject || item.email?.subject || 'Outreach email',
        body: chosenEmail?.body || item.email?.body || '',
        settings,
        trackingToken
      });
      inbox[idx].status = 'sent';
      inbox[idx].sentAt = new Date().toISOString();

      addActivity('email', 'Email verstuurd naar ' + (inbox[idx].companyName || 'Onbekend'), { meta: { companyName: inbox[idx].companyName, leadId: inbox[idx].leadId } });
      const stats = readJSON('stats.json') || {};
      stats.emailsSent = (stats.emailsSent || 0) + 1;
      if (!stats.abStats) stats.abStats = { aApproved: 0, bApproved: 0 };
      stats.abStats[version === 'B' ? 'bApproved' : 'aApproved']++;
      writeJSON('stats.json', stats);
      console.log(`[Email] Verstuurd (versie ${version}): "${chosenEmail?.subject}" -> ${recipientEmail}`);
    } catch (err) {
      console.error('[Email] Fout:', err.message);
      inbox[idx].status = 'approved'; // approved but not sent
      writeJSON('inbox.json', inbox);
      return res.status(500).json({ error: 'Email verzenden mislukt: ' + err.message });
    }
  } else {
    inbox[idx].status = 'approved'; // approved, Gmail not configured
  }

  writeJSON('inbox.json', inbox);

  // Sync status to leads.json
  const leads = readJSON('leads.json') || [];
  const leadIdx = leads.findIndex(l => l.id === item.leadId);
  if (leadIdx !== -1) {
    // Referral items: don't change lead status (they remain 'client')
    if (item.type !== 'referral') {
      leads[leadIdx].status = inbox[idx].status;
      leads[leadIdx].sentAt = inbox[idx].sentAt;
      if (inbox[idx].status === 'sent') leads[leadIdx].sentVersion = version;
      if (inbox[idx].trackingToken) leads[leadIdx].trackingToken = inbox[idx].trackingToken;
    }
    if (item.type === 'referral' && inbox[idx].status === 'sent') {
      leads[leadIdx].referralEmailSent = true;
      leads[leadIdx].referralPending   = false;
      leads[leadIdx].referralSentAt    = inbox[idx].sentAt;
    }
    const histLabel = inbox[idx].status === 'sent'
      ? (item.type === 'referral' ? 'Referral email verstuurd' : `Email verstuurd (versie ${version})`)
      : 'Goedgekeurd';
    addLeadHistory(leads, item.leadId, { event: inbox[idx].status, label: histLabel });
    if (inbox[idx].status === 'sent' && item.type !== 'referral') {
      updateMemory(leads[leadIdx].niche, leads[leadIdx].country, 'sent');
    }
    writeJSON('leads.json', leads);
  }

  if (inbox[idx].status === 'sent' && item.type !== 'referral' && item.type !== 'linkedinDm') {
    const lead = (readJSON('leads.json') || []).find(l => l.id === item.leadId);
    fireWebhooks('lead.approved', { leadId: item.leadId, companyName: item.companyName, niche: item.niche, score: item.score, emailSubject: chosenEmail?.subject, sentAt: inbox[idx].sentAt, lead: lead ? { id: lead.id, status: lead.status, location: lead.location, estimatedValue: lead.estimatedValue } : null });
  }

  res.json(inbox[idx]);
});

app.patch('/api/inbox/:id/disapprove', (req, res) => {
  const inbox = readJSON('inbox.json') || [];
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });
  inbox[idx].status = 'disapproved';
  inbox[idx].disapprovedAt = new Date().toISOString();
  writeJSON('inbox.json', inbox);

  const leads = readJSON('leads.json') || [];
  const leadIdx = leads.findIndex(l => l.id === inbox[idx].leadId);
  if (leadIdx !== -1) {
    leads[leadIdx].status = 'disapproved';
    addLeadHistory(leads, inbox[idx].leadId, { event: 'disapproved', label: 'Afgewezen' });
    writeJSON('leads.json', leads);
  }

  res.json(inbox[idx]);
});

app.patch('/api/inbox/:id/restore', (req, res) => {
  const inbox = readJSON('inbox.json') || [];
  const idx = inbox.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item niet gevonden' });
  inbox[idx].status = 'pending';
  delete inbox[idx].disapprovedAt;
  writeJSON('inbox.json', inbox);

  const leads = readJSON('leads.json') || [];
  const leadIdx = leads.findIndex(l => l.id === inbox[idx].leadId);
  if (leadIdx !== -1) {
    leads[leadIdx].status = 'new';
    addLeadHistory(leads, inbox[idx].leadId, { event: 'restored', label: 'Hersteld uit prullenbak' });
    writeJSON('leads.json', leads);
  }

  res.json(inbox[idx]);
});

app.delete('/api/inbox/:id', (req, res) => {
  const inbox = readJSON('inbox.json') || [];
  const item = inbox.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Item niet gevonden' });
  const filtered = inbox.filter(i => i.id !== req.params.id);
  writeJSON('inbox.json', filtered);

  if (req.query.deleteLead === 'true' && item.leadId) {
    const leads = readJSON('leads.json') || [];
    writeJSON('leads.json', leads.filter(l => l.id !== item.leadId));
  }

  res.json({ ok: true });
});

// â"€â"€â"€ Runs â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.get('/api/runs', (req, res) => {
  res.json(readJSON('runs.json') || []);
});

app.post('/api/runs', (req, res) => {
  const runs = readJSON('runs.json') || [];
  const run = { id: Date.now().toString(), createdAt: new Date().toISOString(), ...req.body };
  runs.unshift(run);
  if (runs.length > 100) runs.splice(100);
  writeJSON('runs.json', runs);
  res.json(run);
});

// â"€â"€â"€ Settings â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.get('/api/settings', (req, res) => {
  const s = readJSON('settings.json') || {};
  const safe = { ...s };
  delete safe.password;
  delete safe.gmailPassword;
  delete safe.gmailPasswordEncrypted;
  delete safe.claudeApiKeyEncrypted;
  delete safe.resendApiKey;
  delete safe.stripeSecretKey;
  delete safe.mollieApiKey;
  safe.stripeConfigured = !!(s.stripeSecretKey);
  safe.mollieConfigured = !!(s.mollieApiKey);
  safe.paypalConfigured = !!(s.paypalMe);
  safe.preferredPaymentMethod = s.preferredPaymentMethod || 'stripe';
  safe.autoInvoiceEnabled = s.autoInvoiceEnabled || false;
  safe.autoInvoiceDay = s.autoInvoiceDay || 1;
  safe.paymentReminderDays = s.paymentReminderDays || 7;
  safe.gmailConfigured = isGmailReady(s);
  safe.gmailPasswordSet = !!(s.gmailPasswordEncrypted || (s.gmailPassword && s.gmailPassword !== '__encrypted__') || process.env.GMAIL_APP_PASSWORD);
  safe.claudeKeyConfigured = isClaudeReady(s);
  safe.claudeKeyFromEnv = !!(process.env.CLAUDE_API_KEY) && !s.claudeApiKeyEncrypted;
  safe.resendConfigured = !!(s.resendApiKey || process.env.RESEND_API_KEY);
  safe.resendFromAddress = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || '';
  res.json(safe);
});

app.patch('/api/settings/account', async (req, res) => {
  const settings = readJSON('settings.json');
  const { agencyName, myName, myTitle, username, newPassword, currentPassword, websiteTagline, websiteAbout, websiteContact, calendlyUrl } = req.body;

  if (agencyName) settings.agencyName = agencyName;
  if (myName) settings.myName = myName;
  if (myTitle) settings.myTitle = myTitle;
  if (username) settings.username = username;
  if (websiteTagline !== undefined) settings.websiteTagline = websiteTagline;
  if (websiteAbout   !== undefined) settings.websiteAbout   = websiteAbout;
  if (websiteContact !== undefined) settings.websiteContact = websiteContact;
  if (calendlyUrl    !== undefined) settings.calendlyUrl    = calendlyUrl;
  const { gaId } = req.body;
  if (gaId !== undefined) settings.gaId = gaId;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Huidig wachtwoord verplicht' });
    const ok = await bcrypt.compare(currentPassword, settings.password);
    if (!ok) return res.status(401).json({ error: 'Huidig wachtwoord onjuist' });
    const hashed = await bcrypt.hash(newPassword, 12);
    settings.password = hashed;
    // sync to users store
    const users = readJSON('users.json') || [];
    const uIdx = users.findIndex(u => u.username === (settings.username || 'admin'));
    if (uIdx !== -1) { users[uIdx].password = hashed; writeJSON('users.json', users); }
  }

  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

// ── Agency Profiles ──────────────────────────────────────────────────────────

app.get('/api/agency-profiles', authMiddleware, (req, res) => {
  const settings = readJSON('settings.json') || {};
  res.json(settings.agencyProfiles || []);
});

app.post('/api/agency-profiles', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  if (!settings.agencyProfiles) settings.agencyProfiles = [];
  const { agencyName, myName, myTitle, agencyAddress, brandColor } = req.body;
  if (!agencyName) return res.status(400).json({ error: 'Agency naam verplicht' });
  const profile = {
    id: 'prof-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    agencyName, myName: myName || '', myTitle: myTitle || '', agencyAddress: agencyAddress || '', brandColor: brandColor || '#2563eb',
    createdAt: new Date().toISOString()
  };
  settings.agencyProfiles.push(profile);
  writeJSON('settings.json', settings);
  res.json(profile);
});

app.patch('/api/agency-profiles/:id', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  const profs = settings.agencyProfiles || [];
  const idx = profs.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Profiel niet gevonden' });
  const { agencyName, myName, myTitle, agencyAddress, brandColor } = req.body;
  if (agencyName)      profs[idx].agencyName    = agencyName;
  if (myName !== undefined) profs[idx].myName   = myName;
  if (myTitle !== undefined) profs[idx].myTitle  = myTitle;
  if (agencyAddress !== undefined) profs[idx].agencyAddress = agencyAddress;
  if (brandColor)      profs[idx].brandColor    = brandColor;
  settings.agencyProfiles = profs;
  writeJSON('settings.json', settings);
  res.json(profs[idx]);
});

app.delete('/api/agency-profiles/:id', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  settings.agencyProfiles = (settings.agencyProfiles || []).filter(p => p.id !== req.params.id);
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.post('/api/agency-profiles/:id/activate', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  const prof = (settings.agencyProfiles || []).find(p => p.id === req.params.id);
  if (!prof) return res.status(404).json({ error: 'Profiel niet gevonden' });
  settings.agencyName     = prof.agencyName;
  settings.myName         = prof.myName         || settings.myName;
  settings.myTitle        = prof.myTitle        || settings.myTitle;
  settings.agencyAddress  = prof.agencyAddress  || settings.agencyAddress || '';
  settings.brandColor     = prof.brandColor     || '#2563eb';
  settings.activeProfileId = prof.id;
  writeJSON('settings.json', settings);
  res.json({ ok: true, settings: { agencyName: settings.agencyName, myName: settings.myName, myTitle: settings.myTitle, brandColor: settings.brandColor } });
});

app.patch('/api/settings/gmail', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  const { gmailAddress, gmailPassword, replyDetection, webhookToken, webhookConfigured } = req.body;
  if (gmailAddress !== undefined) settings.gmailAddress = gmailAddress;
  if (gmailPassword !== undefined && gmailPassword !== '') {
    settings.gmailPasswordEncrypted = encryptGmailPassword(gmailPassword);
    settings.gmailPassword = '__encrypted__';
  }
  if (replyDetection !== undefined) settings.replyDetection = replyDetection;
  if (webhookToken !== undefined) settings.webhookToken = webhookToken;
  if (webhookConfigured !== undefined) settings.webhookConfigured = webhookConfigured;
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.patch('/api/settings/services', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  settings.services = req.body.services;
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.patch('/api/settings/claude-key', requireAdmin, (req, res) => {
  const { claudeApiKey } = req.body;
  if (!claudeApiKey || !claudeApiKey.trim()) {
    return res.status(400).json({ error: 'API sleutel is verplicht' });
  }
  const settings = readJSON('settings.json');
  settings.claudeApiKeyEncrypted = encryptApiKey(claudeApiKey.trim());
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.patch('/api/settings/resend', requireAdmin, (req, res) => {
  const { resendApiKey, resendFromAddress, agencyName } = req.body;
  const settings = readJSON('settings.json');
  if (resendApiKey    !== undefined) settings.resendApiKey    = resendApiKey;
  if (resendFromAddress !== undefined) settings.resendFromAddress = resendFromAddress;
  if (agencyName      !== undefined) settings.agencyName      = agencyName;
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.get('/api/settings/services/defaults', (req, res) => {
  res.json(DEFAULT_SERVICES);
});

app.patch('/api/settings/automation', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  const { dailyRunTime, leadsPerDay, autoApproveScore, automationPaused, linkedinUrl, dailyBriefingEnabled, dailyBriefingTime, smartAutoApprove, monthlyReports, backupEnabled, backupTime, backupEmail, targetCompanySizes } = req.body;
  if (dailyRunTime !== undefined) settings.dailyRunTime = dailyRunTime;
  if (leadsPerDay !== undefined) settings.leadsPerDay = leadsPerDay;
  if (autoApproveScore !== undefined) settings.autoApproveScore = autoApproveScore;
  if (automationPaused !== undefined) settings.automationPaused = automationPaused;
  if (linkedinUrl !== undefined) settings.linkedinUrl = linkedinUrl;
  if (dailyBriefingEnabled !== undefined) settings.dailyBriefingEnabled = dailyBriefingEnabled;
  if (dailyBriefingTime !== undefined) settings.dailyBriefingTime = dailyBriefingTime;
  if (smartAutoApprove !== undefined) settings.smartAutoApprove = smartAutoApprove;
  if (monthlyReports !== undefined) settings.monthlyReports = monthlyReports;
  if (backupEnabled !== undefined) settings.backupEnabled = backupEnabled;
  if (backupTime   !== undefined) settings.backupTime    = backupTime;
  if (backupEmail  !== undefined) settings.backupEmail   = backupEmail;
  if (targetCompanySizes !== undefined) settings.targetCompanySizes = targetCompanySizes;
  if (req.body.autoClientEmails !== undefined) settings.autoClientEmails = req.body.autoClientEmails;
  if (req.body.autoInvoiceEnabled !== undefined) settings.autoInvoiceEnabled = req.body.autoInvoiceEnabled;
  if (req.body.autoInvoiceDay !== undefined) settings.autoInvoiceDay = req.body.autoInvoiceDay;
  if (req.body.paymentReminderDays !== undefined) settings.paymentReminderDays = req.body.paymentReminderDays;
  if (req.body.btwEnabled !== undefined) settings.btwEnabled = req.body.btwEnabled;
  if (req.body.btwRate !== undefined) settings.btwRate = req.body.btwRate;
  if (req.body.btwNumber !== undefined) settings.btwNumber = req.body.btwNumber;
  if (req.body.aiRateLimits     !== undefined) settings.aiRateLimits     = req.body.aiRateLimits;
  if (req.body.aiAutoReply     !== undefined) settings.aiAutoReply     = req.body.aiAutoReply;
  if (req.body.aiAutoReplySend !== undefined) settings.aiAutoReplySend = req.body.aiAutoReplySend;
  writeJSON('settings.json', settings);
  scheduleCron(); // re-schedule if run time changed
  scheduleBriefingCron(); // re-schedule briefing if time changed
  scheduleBackupCron(); // re-schedule backup if time changed
  res.json({ ok: true });
});

app.post('/api/settings/test-email', requireAdmin, async (req, res) => {
  console.log('[TestMail] Starting...');
  const s = readJSON('settings.json') || {};
  const resendKey   = s.resendApiKey || process.env.RESEND_API_KEY;
  const fromAddress = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info';
  const toAddress   = s.gmailAddress || process.env.GMAIL_ADDRESS || fromAddress;

  console.log('[TestMail] Key set:', !!resendKey, '| From:', fromAddress, '| To:', toAddress);

  if (!resendKey) {
    console.log('[TestMail] No RESEND_API_KEY — aborting');
    return res.status(400).json({ success: false, error: 'Resend API sleutel niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen → Email.' });
  }

  try {
    const { default: fetch } = await import('node-fetch');
    console.log('[TestMail] Sending via Resend...');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `"${s.agencyName || 'Agency AI'}" <${fromAddress}>`,
        to: toAddress,
        subject: 'Agency AI — Testmail ✓',
        html: buildEmailHTML(
          `Beste ${s.myName || 'Admin'},\n\nDit is een testmail om te bevestigen dat Resend correct is ingesteld en dat Agency AI emails kan versturen namens ${s.agencyName || 'Agency AI'}.\n\nDit is het nieuwe professionele email-template dat gebruikt wordt voor alle outreach.`,
          s.agencyName || 'Agency AI',
          s.myName || 'Admin',
          s.myTitle || 'AI Growth Specialist',
          null,
          { myEmail: fromAddress, calendlyLink: s.calendlyUrl || '' }
        )
      }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
    });
    const d = await r.json();
    if (!r.ok) {
      console.error('[TestMail] Resend rejected:', JSON.stringify(d));
      return res.status(500).json({ success: false, error: d.message || d.error || `Resend fout ${r.status}` });
    }
    console.log('[TestMail] Success, id:', d.id, '→', toAddress);
    return res.json({ success: true, ok: true, message: `Testmail verstuurd naar ${toAddress}` });
  } catch (err) {
    console.error('[TestMail] Exception:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings/test-imap', requireAdmin, async (req, res) => {
  console.log('[TestIMAP] Starting...');
  const s    = readJSON('settings.json') || {};
  const user = s.gmailAddress || process.env.GMAIL_ADDRESS;
  const pass = getGmailPassword(s);

  if (!user) return res.status(400).json({ success: false, error: 'Gmail adres niet ingesteld' });
  if (!pass) return res.status(400).json({ success: false, error: 'Gmail app-wachtwoord niet ingesteld' });

  let imapSimple;
  try { imapSimple = require('imap-simple'); }
  catch { return res.status(500).json({ success: false, error: 'imap-simple module niet beschikbaar' }); }

  let connection;
  try {
    connection = await imapSimple.connect({
      imap: { user, password: pass, host: 'imap.gmail.com', port: 993, tls: true,
              tlsOptions: { rejectUnauthorized: false }, authTimeout: 10000 }
    });
    const box = await connection.openBox('INBOX');
    const total = box?.messages?.total ?? '?';
    connection.end();
    console.log('[TestIMAP] OK — inbox messages:', total);
    return res.json({ success: true, message: `IMAP verbinding geslaagd ✓ — ${total} berichten gevonden`, user });
  } catch (err) {
    if (connection) try { connection.end(); } catch {}
    console.error('[TestIMAP] Fout:', err.message);
    const friendly = err.message.includes('Invalid credentials') || err.message.includes('AUTHENTICATIONFAILED')
      ? 'Ongeldige inloggegevens — controleer Gmail adres en app-wachtwoord'
      : err.message.includes('IMAP access') || err.message.includes('disabled')
      ? 'IMAP is uitgeschakeld in Gmail — zie instructies hieronder'
      : err.message;
    return res.status(500).json({ success: false, error: friendly });
  }
});

app.patch('/api/settings/stripe', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  const { stripeSecretKey, mollieApiKey, paypalMe, preferredPaymentMethod } = req.body;
  if (stripeSecretKey !== undefined) settings.stripeSecretKey = stripeSecretKey;
  if (mollieApiKey !== undefined) settings.mollieApiKey = mollieApiKey;
  if (paypalMe !== undefined) settings.paypalMe = paypalMe;
  if (preferredPaymentMethod !== undefined) settings.preferredPaymentMethod = preferredPaymentMethod;
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.post('/api/stripe/invoice', async (req, res) => {
  const settings = readJSON('settings.json');
  if (!settings.stripeSecretKey) {
    return res.status(400).json({ error: 'Stripe sleutel niet ingesteld — voeg toe in Instellingen' });
  }
  const { companyName, amount, description, billing } = req.body;
  if (!amount || amount < 1) {
    return res.status(400).json({ error: 'Ongeldig bedrag' });
  }
  try {
    const stripe = Stripe(settings.stripeSecretKey);
    const product = await stripe.products.create({
      name: description || `AI-diensten — ${companyName}`
    });
    const priceData = {
      product: product.id,
      unit_amount: Math.round(amount) * 100,
      currency: 'eur'
    };
    if (billing !== 'eenmalig') priceData.recurring = { interval: 'month' };
    const price = await stripe.prices.create(priceData);
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }]
    });
    console.log(`[Stripe] Betaallink aangemaakt voor ${companyName}: ${paymentLink.url}`);
    res.json({ url: paymentLink.url });
  } catch (err) {
    console.error('[Stripe] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mollie/invoice', requireAdmin, async (req, res) => {
  const settings = readJSON('settings.json');
  if (!settings.mollieApiKey) {
    return res.status(400).json({ error: 'Mollie API sleutel niet ingesteld — voeg toe in Instellingen' });
  }
  const { companyName, amount, description, billing } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Ongeldig bedrag' });
  try {
    const fetch = (await import('node-fetch')).default;
    const body = {
      description: description || `AI-diensten — ${companyName}`,
      amount: { currency: 'EUR', value: (Math.round(amount)).toFixed(2) },
      redirectUrl: settings.websiteContact || 'https://agencyai.nl',
    };
    const mollieRes = await fetch('https://api.mollie.com/v2/payment-links', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.mollieApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const mollieData = await mollieRes.json();
    if (!mollieRes.ok) {
      return res.status(400).json({ error: mollieData.detail || 'Mollie fout' });
    }
    const url = mollieData._links?.paymentLink?.href || mollieData._links?.checkout?.href;
    console.log(`[Mollie] Betaallink aangemaakt voor ${companyName}: ${url}`);
    res.json({ url });
  } catch (err) {
    console.error('[Mollie] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/paypal/invoice', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json');
  if (!settings.paypalMe) {
    return res.status(400).json({ error: 'PayPal.me naam niet ingesteld — voeg toe in Instellingen' });
  }
  const { amount, description } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Ongeldig bedrag' });
  const handle = settings.paypalMe.replace(/^.*paypal\.me\//i, '').replace(/\/$/, '');
  const url = `https://www.paypal.me/${handle}/${Math.round(amount)}EUR`;
  res.json({ url });
});

// ─── Payments per lead ───────────────────────────────────────────────────────

async function createPaymentLink(method, { companyName, amount, description, billing, settings }) {
  if (method === 'stripe') {
    if (!settings.stripeSecretKey) throw new Error('Stripe niet geconfigureerd');
    const stripe = Stripe(settings.stripeSecretKey);
    const product = await stripe.products.create({ name: description || `AI-diensten — ${companyName}` });
    const priceData = { product: product.id, unit_amount: Math.round(amount) * 100, currency: 'eur' };
    if (billing !== 'eenmalig') priceData.recurring = { interval: 'month' };
    const price = await stripe.prices.create(priceData);
    const link = await stripe.paymentLinks.create({ line_items: [{ price: price.id, quantity: 1 }] });
    return link.url;
  }
  if (method === 'mollie') {
    if (!settings.mollieApiKey) throw new Error('Mollie niet geconfigureerd');
    const fetch = (await import('node-fetch')).default;
    const mollieRes = await fetch('https://api.mollie.com/v2/payment-links', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${settings.mollieApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: description || `AI-diensten — ${companyName}`, amount: { currency: 'EUR', value: Math.round(amount).toFixed(2) }, redirectUrl: settings.websiteContact || 'https://agencyai.nl' })
    });
    const d = await mollieRes.json();
    if (!mollieRes.ok) throw new Error(d.detail || 'Mollie fout');
    return d._links?.paymentLink?.href || d._links?.checkout?.href;
  }
  if (method === 'paypal') {
    if (!settings.paypalMe) throw new Error('PayPal niet geconfigureerd');
    const handle = settings.paypalMe.replace(/^.*paypal\.me\//i, '').replace(/\/$/, '');
    return `https://www.paypal.me/${handle}/${Math.round(amount)}EUR`;
  }
  throw new Error('Onbekende betaalmethode');
}

app.get('/api/payments', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const all = [];
  for (const lead of leads) {
    for (const p of (lead.payments || [])) {
      all.push({ ...p, leadId: lead.id, leadName: lead.companyName, niche: lead.niche });
    }
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

app.get('/api/leads/:id/payments', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.payments || []);
});

app.post('/api/leads/:id/payments', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const { type, amount, description, billing, method, dueDate, splitParts } = req.body;
  if (!amount || amount < 1) return res.status(400).json({ error: 'Ongeldig bedrag' });

  const effectiveMethod = method || settings.preferredPaymentMethod || 'stripe';
  const newPayments = [];

  try {
    if (type === 'split' && splitParts > 1) {
      const partAmount = Math.round(amount / splitParts);
      for (let i = 1; i <= splitParts; i++) {
        const partDesc = `${description || 'AI-diensten'} — deel ${i}/${splitParts}`;
        const url = await createPaymentLink(effectiveMethod, { companyName: leads[idx].companyName, amount: partAmount, description: partDesc, billing: 'eenmalig', settings });
        const dueDays = (i - 1) * 14; // every 2 weeks
        newPayments.push({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
          type: 'split', amount: partAmount, description: partDesc, billing: 'eenmalig',
          method: effectiveMethod, paymentUrl: url, status: 'sent',
          dueDate: dueDate ? new Date(new Date(dueDate).getTime() + dueDays * 86400000).toISOString() : new Date(Date.now() + dueDays * 86400000).toISOString(),
          splitIndex: i, splitTotal: splitParts, createdAt: new Date().toISOString()
        });
      }
    } else {
      const url = await createPaymentLink(effectiveMethod, { companyName: leads[idx].companyName, amount, description, billing: billing || 'maandelijks', settings });
      newPayments.push({
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        type: type || (billing === 'eenmalig' ? 'once' : 'subscription'),
        amount, description: description || 'AI-diensten', billing: billing || 'maandelijks',
        method: effectiveMethod, paymentUrl: url, status: 'sent',
        dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: new Date().toISOString()
      });
    }

    if (!leads[idx].payments) leads[idx].payments = [];
    leads[idx].payments.push(...newPayments);
    addLeadHistory(leads, leads[idx].id, { event: 'paymentCreated', label: `${newPayments.length > 1 ? `Gesplitste betaling (${splitParts} delen)` : type || 'Betaallink'}: €${amount}` });
    writeJSON('leads.json', leads);

    // Auto-send payment email to client
    const lead = leads[idx];
    if (lead.email && isGmailReady(settings)) {
      try {
        const linksText = newPayments.map((p, i) => `${newPayments.length > 1 ? `Deel ${i+1}/${newPayments.length}: ` : ''}€${p.amount} → ${p.paymentUrl}`).join('\n');
        await sendEmail({
          to: lead.email,
          subject: `Factuur ${description || 'AI-diensten'} — ${settings.agencyName}`,
          body: `Beste ${lead.contactName || lead.companyName},\n\nHieronder vind je de betaallink(s) voor ${description || 'onze diensten'}:\n\n${linksText}\n\nHeb je vragen? Neem gerust contact op.\n\nMet vriendelijke groet,\n${settings.myName}\n${settings.agencyName}`,
          settings
        });
      } catch { /* optional */ }
    }

    res.json(newPayments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/leads/:id/payments/:payId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const pIdx = (leads[idx].payments || []).findIndex(p => p.id === req.params.payId);
  if (pIdx === -1) return res.status(404).json({ error: 'Betaling niet gevonden' });
  leads[idx].payments[pIdx] = { ...leads[idx].payments[pIdx], ...req.body };
  if (req.body.status === 'paid' && !leads[idx].payments[pIdx].paidAt) leads[idx].payments[pIdx].paidAt = new Date().toISOString();
  writeJSON('leads.json', leads);
  res.json(leads[idx].payments[pIdx]);
});

app.delete('/api/leads/:id/payments/:payId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].payments = (leads[idx].payments || []).filter(p => p.id !== req.params.payId);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/payments/:payId/remind', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const pay = (leads[idx].payments || []).find(p => p.id === req.params.payId);
  if (!pay) return res.status(404).json({ error: 'Betaling niet gevonden' });
  const lead = leads[idx];
  if (!lead.email) return res.status(400).json({ error: 'Geen e-mailadres bekend' });
  if (!isGmailReady(settings)) return res.status(400).json({ error: 'Gmail niet geconfigureerd' });

  try {
    const reminderEmail = await aiJSON(`Schrijf een vriendelijke maar dringende betalingsherinnering.
Klant: ${lead.companyName}. Bureau: ${settings.agencyName}, ${settings.myName}.
Bedrag: €${pay.amount}. Omschrijving: ${pay.description}. Betaallink: ${pay.paymentUrl}.
Tone: professioneel maar begripvol. Max 150 woorden.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`);

    await sendEmail({ to: lead.email, subject: reminderEmail.subject, body: reminderEmail.body, settings });
    // Log reminder
    if (!leads[idx].payments) return;
    const pIdx = leads[idx].payments.findIndex(p => p.id === req.params.payId);
    if (pIdx !== -1) { leads[idx].payments[pIdx].lastReminderAt = new Date().toISOString(); leads[idx].payments[pIdx].reminderCount = (leads[idx].payments[pIdx].reminderCount || 0) + 1; }
    addLeadHistory(leads, lead.id, { event: 'paymentReminder', label: `Betalingsherinnering verstuurd: €${pay.amount}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true, subject: reminderEmail.subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/settings/leads', requireAdmin, (req, res) => {
  writeJSON('leads.json', []);
  writeJSON('inbox.json', []);
  res.json({ ok: true });
});

app.get('/api/upsell', (req, res) => {
  const stats = readJSON('stats.json') || {};
  res.json(stats.upsellOpportunities || []);
});

app.get('/api/referrals', authMiddleware, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const referredLeads = leads.filter(l => l.referredBy);
  const clients = leads.filter(l => l.referralEmailSent || referredLeads.some(r => r.referredBy === l.id));
  const data = clients.map(c => ({
    id: c.id,
    companyName: c.companyName,
    niche: c.niche,
    location: c.location,
    referralSentAt: c.referralSentAt || null,
    referralEmailSent: c.referralEmailSent || false,
    referrals: referredLeads
      .filter(l => l.referredBy === c.id)
      .map(l => ({ id: l.id, companyName: l.companyName, status: l.status, createdAt: l.createdAt }))
  }));
  const totalSent     = leads.filter(l => l.referralEmailSent).length;
  const totalReferred = referredLeads.length;
  const converted     = referredLeads.filter(l => l.status === 'client').length;
  res.json({
    stats: { totalSent, totalReferred, converted, conversionRate: totalReferred > 0 ? Math.round(converted / totalReferred * 100) : 0 },
    clients: data,
    referredLeads: referredLeads.map(l => {
      const referrer = leads.find(r => r.id === l.referredBy);
      return { id: l.id, companyName: l.companyName, status: l.status, createdAt: l.createdAt, referrerName: referrer?.companyName || '?' };
    })
  });
});

app.post('/api/leads/:id/set-referrer', authMiddleware, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const { referrerId } = req.body;
  if (referrerId && !leads.find(l => l.id === referrerId)) return res.status(400).json({ error: 'Referrer niet gevonden' });
  const prev = leads[idx].referredBy;
  leads[idx].referredBy = referrerId || null;
  if (referrerId && referrerId !== prev) {
    const referrer = leads.find(l => l.id === referrerId);
    addLeadHistory(leads, req.params.id, { event: 'referralLinked', label: `Doorverwezen door ${referrer?.companyName || referrerId}` });
  } else if (!referrerId && prev) {
    addLeadHistory(leads, req.params.id, { event: 'referralUnlinked', label: 'Referral-koppeling verwijderd' });
  }
  writeJSON('leads.json', leads);
  res.json(leads[idx]);
});

app.post('/api/upsell/:leadId/email', async (req, res) => {
  const settings = readJSON('settings.json');
  const stats    = readJSON('stats.json') || {};
  const opps     = stats.upsellOpportunities || [];
  const opp      = opps.find(o => o.leadId === req.params.leadId);
  if (!opp) return res.status(404).json({ error: 'Niet gevonden' });

  const myName     = settings.myName     || 'Ekow';
  const agencyName = settings.agencyName || 'Agency AI';

  try {
    const prompt = opp.language === 'nl'
      ? 'Schrijf een warme upsell email voor een bestaande klant. Klinkt persoonlijk, NIET als AI. Geef JSON terug.\n\nKlant: ' + opp.companyName + ' (' + opp.niche + ', ' + opp.location + ')\nHuidige dienst: ' + opp.currentService + '\nNieuwe dienst: ' + opp.upsellService + ' (\u20AC' + opp.upsellPrice + ')\nKlant al ' + opp.daysSince + ' dagen actief\nAfzender: ' + myName + ' van ' + agencyName + '\nDatum vandaag: ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n\nRegels:\n- Refereer aan hun huidige resultaten positief\n- Introduceer de nieuwe dienst als logische volgende stap\n- Max 100 woorden\n- Geen bullet points\n- CTA: vraag of ze even willen bellen\n- Afsluiting: "Groeten, ' + myName + '"\n\n{"subject": "onderwerp", "body": "emailtekst"}'
      : 'Write a warm upsell email for an existing client. Sounds personal, NOT like AI. Return JSON.\n\nClient: ' + opp.companyName + ' (' + opp.niche + ', ' + opp.location + ')\nCurrent service: ' + opp.currentService + '\nNew service: ' + opp.upsellService + ' (\u20AC' + opp.upsellPrice + ')\nClient active for ' + opp.daysSince + ' days\nSender: ' + myName + ' from ' + agencyName + '\n\nRules:\n- Reference their current positive results\n- Introduce new service as natural next step\n- Max 100 words\n- No bullet points\n- CTA: ask for a quick call\n- Sign off: "Best, ' + myName + '"\n\n{"subject": "subject", "body": "email body"}';

    const email = await aiJSON(prompt);
    res.json({ email, opp });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/upsell/:leadId/send', async (req, res) => {
  const settings = readJSON('settings.json');
  if (!isGmailReady(settings)) return res.status(400).json({ error: 'Gmail niet ingesteld' });
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject en body vereist' });
  try {
    await sendEmail({ to: settings.gmailAddress, subject, body, settings });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/settings/stats', requireAdmin, (req, res) => {
  writeJSON('stats.json', { leadsFound: 0, emailsSent: 0, replies: 0, pipelineValue: 0, weeklyData: [] });
  res.json({ ok: true });
});

// â"€â"€â"€ Server-side Claude helpers â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// In-memory token accumulator — reset per run
let _sessionTokensIn = 0;
let _sessionTokensOut = 0;

// Claude Sonnet 4.x pricing (USD per million tokens)
const PRICE_IN_PER_M  = 3.0;
const PRICE_OUT_PER_M = 15.0;

function calcCostUsd(tokIn, tokOut) {
  return (tokIn / 1e6) * PRICE_IN_PER_M + (tokOut / 1e6) * PRICE_OUT_PER_M;
}

// ── AI Rate Limiter ──────────────────────────────────────────────────────────
const _aiCallLog = []; // { ts: number } — in-memory sliding window, resets on restart


function aiRateCheck() {
  const settings  = readJSON('settings.json') || {};
  const lim       = settings.aiRateLimits || {};
  const maxPerMin  = lim.maxCallsPerMinute || 10;
  const maxPerHour = lim.maxCallsPerHour   || 100;
  const maxPerDay  = lim.maxCallsPerDay    || 500;
  const maxCostDay = typeof lim.maxDailyCostUsd === 'number' ? lim.maxDailyCostUsd : 10.0;

  const now = Date.now();
  // Prune entries older than 24h
  while (_aiCallLog.length && _aiCallLog[0].ts < now - 86400000) _aiCallLog.shift();

  const lastMin  = _aiCallLog.filter(e => e.ts >= now - 60000).length;
  const lastHour = _aiCallLog.filter(e => e.ts >= now - 3600000).length;
  const lastDay  = _aiCallLog.length;

  if (lastMin  >= maxPerMin)  throw new Error(`AI rate limit: max ${maxPerMin} calls/minuut bereikt (${lastMin}/${maxPerMin})`);
  if (lastHour >= maxPerHour) throw new Error(`AI rate limit: max ${maxPerHour} calls/uur bereikt (${lastHour}/${maxPerHour})`);
  if (lastDay  >= maxPerDay)  throw new Error(`AI rate limit: max ${maxPerDay} calls/dag bereikt (${lastDay}/${maxPerDay})`);

  // Check today's API cost from activity log
  if (maxCostDay > 0) {
    const logFile = path.join(DATA_DIR, 'activity.json');
    const today   = new Date().toISOString().slice(0, 10);
    let todayCost = 0;
    try {
      if (fs.existsSync(logFile)) {
        const log = JSON.parse(fs.readFileSync(logFile, 'utf8').replace(/^﻿/, ''));
        todayCost = log.filter(e => e.timestamp?.startsWith(today)).reduce((s, e) => s + (e.costUsd || 0), 0);
      }
    } catch {}
    if (todayCost >= maxCostDay) throw new Error(`AI daglimiet bereikt: $${todayCost.toFixed(3)} van $${maxCostDay}`);
  }
}

async function aiCall(prompt) {
  aiRateCheck();
  const s = readJSON('settings.json') || {};
  const apiKey = getClaudeApiKey(s);
  if (!apiKey) {
    throw new Error('Claude API sleutel niet ingesteld. Voeg toe via Instellingen → API & integraties of stel CLAUDE_API_KEY in als Railway environment variable.');
  }
  const { default: fetch } = await import('node-fetch');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  if (!data.content) throw new Error(data.error?.message || 'Claude API fout');
  const usage = data.usage || {};
  _sessionTokensIn  += usage.input_tokens  || 0;
  _sessionTokensOut += usage.output_tokens || 0;
  _aiCallLog.push({ ts: Date.now() });
  return data.content[0].text;
}

async function aiJSON(prompt) {
  const text = await aiCall(prompt);

  // Strip ALL markdown code fences globally (Claude wraps JSON in ```json...```)
  const clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // Try direct parse on stripped text
  try { return JSON.parse(clean); } catch {}

  // Fallback: extract first JSON array or object
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch(e) {
      console.error('[aiJSON] Array fallback parse failed:', e.message);
    }
  }
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch(e) {
      console.error('[aiJSON] Object fallback parse failed:', e.message);
    }
  }

  console.error('[aiJSON] Parse failed. Raw response (500 chars):', text.substring(0, 500));
  throw new Error('Claude JSON parse mislukt: ' + clean.substring(0, 200));
}

// Shared JSON-from-text parser
function parseJsonFromText(text) {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try { return JSON.parse(clean); } catch {}
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) { try { return JSON.parse(arrMatch[0]); } catch {} }
  const objMatch = clean.match(/\{[\s\S]*\}/);
  if (objMatch) { try { return JSON.parse(objMatch[0]); } catch {} }
  throw new Error('JSON parse mislukt: ' + clean.substring(0, 200));
}

// Claude API call with web_search tool — handles multi-turn tool loop
async function aiWebSearch(prompt) {
  aiRateCheck();
  const s = readJSON('settings.json') || {};
  const apiKey = getClaudeApiKey(s);
  if (!apiKey) throw new Error('Claude API sleutel niet ingesteld');
  const { default: fetch } = await import('node-fetch');

  const messages = [{ role: 'user', content: prompt }];
  let lastText = '';

  for (let turn = 0; turn < 10; turn++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages
      })
    });
    const data = await res.json();
    if (!data.content) throw new Error(data.error?.message || 'Claude web search API fout');

    const usage = data.usage || {};
    _sessionTokensIn  += usage.input_tokens  || 0;
    _sessionTokensOut += usage.output_tokens || 0;
    _aiCallLog.push({ ts: Date.now() });

    const texts = data.content.filter(b => b.type === 'text').map(b => b.text);
    if (texts.length) lastText = texts.join('');

    if (data.stop_reason === 'end_turn') return lastText;

    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = data.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({ type: 'tool_result', tool_use_id: b.id, content: '' }));
      messages.push({ role: 'user', content: toolResults });
      continue;
    }
    break;
  }

  if (lastText) return lastText;
  throw new Error('Web search: geen resultaat na 10 rondes');
}

async function aiWebSearchJSON(prompt) {
  const text = await aiWebSearch(prompt);
  try { return parseJsonFromText(text); } catch (e) {
    console.error('[aiWebSearchJSON] Parse failed. Raw (500):', text.substring(0, 500));
    throw e;
  }
}

// â"€â"€â"€ Website checker (Agent 2) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// Agent 2: website quality check only — email is provided by Agent 1 web search
async function checkWebsite(url) {
  if (!url) return { reachable: false, notes: 'Geen URL opgegeven' };
  try {
    const { default: fetch } = await import('node-fetch');
    const start = Date.now();
    const res = await fetch(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
      }
    });
    const ms   = Date.now() - start;
    const html = await res.text();

    const hasViewport = /<meta[^>]+viewport/i.test(html);
    const hasHttps    = url.startsWith('https://');
    const hasBooking  = /\b(boek|reserveer|afspraak|appointment|book|reservat)/i.test(html);
    const hasShop     = /\b(shop|winkel|bestel|kopen|cart|basket|checkout)/i.test(html);
    const hasCTA      = /\b(contact|contact us|meer info|neem contact|bel ons|call us)/i.test(html);
    const speedScore  = ms < 1500 ? 9 : ms < 3000 ? 7 : ms < 5000 ? 5 : 3;

    const problems = [];
    if (ms > 3000) problems.push(`Trage laadtijd: ${(ms/1000).toFixed(1)}s (ideaal <2s)`);
    if (!hasViewport) problems.push('Geen mobile-optimalisatie gevonden');
    if (!hasHttps) problems.push('Geen HTTPS — onveilige verbinding');
    if (!hasBooking && !hasShop) problems.push('Geen duidelijk boekings- of bestelsysteem');
    if (!hasCTA) problems.push('Geen duidelijke call-to-action op de pagina');

    console.log(`[Agent2] ${url} — status: ${res.status}, ${ms}ms, speedScore: ${speedScore}`);

    return { reachable: true, loadTimeMs: ms, speedScore, hasHttps, hasMobileOptimization: hasViewport, hasBookingSystem: hasBooking, hasShop, hasCTA, problems };
  } catch (err) {
    return { reachable: false, notes: `Website niet bereikbaar: ${err.message}` };
  }
}

// â"€â"€â"€ 6-agent pipeline â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

// â"€â"€ Per-lead processing helper (agents 2-6 + build item) â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
function guessContactEmail(websiteUrl) {
  if (!websiteUrl) return null;
  const domain = websiteUrl.replace(/^https?:\/\//i,'').replace(/^www\./i,'').split('/')[0].toLowerCase();
  if (!domain || !domain.includes('.')) return null;
  return 'info@' + domain;
}

function isDuplicate(lead) {
  const existing = readJSON('leads.json') || [];
  if (!existing.length) return null;
  const nameLower  = (lead.companyName  || '').toLowerCase().trim();
  const domainRaw  = (lead.websiteUrl   || '').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
  const emailLower = (lead.contactEmail || lead.email || '').toLowerCase().trim();
  for (const e of existing) {
    const eName   = (e.companyName  || '').toLowerCase().trim();
    const eDomain = (e.websiteUrl   || '').replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0].toLowerCase();
    const eEmail  = (e.contactEmail || e.email || '').toLowerCase().trim();
    if (nameLower  && eName   && nameLower  === eName)   return e;
    if (domainRaw  && eDomain && domainRaw  === eDomain) return e;
    if (emailLower && eEmail  && emailLower === eEmail && e.id !== lead.id)  return e;
  }
  return null;
}

async function processOneLead(lead, settings) {
  if (isBlacklisted(lead)) {
    console.log(`  ✗ Geblokkeerd (blacklist): ${lead.companyName}`);
    return null;
  }

  const dup = isDuplicate(lead);
  if (dup) {
    console.log(`  ✗ Duplicaat overgeslagen: ${lead.companyName} (bestaat al als ${dup.status})`);
    return null;
  }
  const { services = [], myName = '', agencyName = 'Agency AI' } = settings;

  const c = (lead.country || '').toLowerCase().replace(/[^a-z]/g, '');
  const language = (
    c === 'nl' || c === 'be' ||
    c === 'nederland' || c === 'netherlands' || c === 'thenetherlands' ||
    c === 'belgie' || c === 'belgi' || c === 'belgium' || c === 'belgique'
  ) ? 'nl' : 'en';
  lead.language = language;
  const companySize = lead.companySize || 'small';

  console.log(`  [Agent 2] Website checken: ${lead.websiteUrl}`);
  const website = await checkWebsite(lead.websiteUrl);
  console.log(`  [Agent 2] Bereikbaar: ${website.reachable}, laadtijd: ${website.loadTimeMs || '—'}ms`);

  // Skip immediately if website unreachable — don't waste agent credits on fake companies
  if (!website.reachable) {
    console.log(`  ✗ Website onbereikbaar — ${lead.companyName} overgeslagen (${website.notes || 'geen verbinding'})`);
    addActivity('skip', `${lead.companyName} overgeslagen — website onbereikbaar`, { meta: { companyName: lead.companyName, websiteUrl: lead.websiteUrl || '' } });
    return null;
  }

  // Email: provided by Agent 1 web search — validate format + MX here
  const rawEmail = (lead.email || '').toLowerCase().trim().replace(/^mailto:/i, '');
  const isValidEmailFormat = e => e && e.includes('@') && e.includes('.') && e.length <= 80 &&
    !/\.(png|jpg|gif|svg|css|js|woff|ico|pdf)$/i.test(e) &&
    !e.includes('@example') && !e.includes('@test.') && !e.includes('@sentry');
  const isNoReplyAddr = e => /noreply|no-reply|donotreply|do-not-reply/i.test(e);

  if (!rawEmail || !isValidEmailFormat(rawEmail) || isNoReplyAddr(rawEmail)) {
    console.log(`  ✗ Email ongeldig van Agent 1: "${rawEmail || 'leeg'}" — ${lead.companyName} overgeslagen`);
    addActivity('skip', `${lead.companyName} overgeslagen — geen geldig email van Agent 1`, { meta: { companyName: lead.companyName, niche: lead.niche } });
    return null;
  }

  // DNS MX check — only reject on empty array, allow on DNS errors
  let contactEmail = null;
  let emailVerified = false;
  const emailDomain = rawEmail.split('@')[1];
  console.log(`  [Agent 2] Email verifiëren: ${rawEmail}`);
  try {
    const mx = await dnsPromises.resolveMx(emailDomain);
    if (mx && mx.length > 0) {
      contactEmail  = rawEmail;
      emailVerified = true;
      console.log(`  [Agent 2] MX check: ${emailDomain} → valid ✓ — email: ${contactEmail}`);
    } else {
      console.log(`  ✗ MX check: ${emailDomain} → no records — ${lead.companyName} overgeslagen`);
      addActivity('skip', `${lead.companyName} overgeslagen — email domein ontvangt geen mail`, { meta: { companyName: lead.companyName } });
      return null;
    }
  } catch (mxErr) {
    // DNS error (Railway network issue) → allow the email
    contactEmail  = rawEmail;
    emailVerified = false;
    console.log(`  [Agent 2] MX check: ${emailDomain} → DNS fout (${mxErr.code || mxErr.message}), email toegestaan`);
  }

  const emailSource = 'agent1_websearch';

  console.log(`  [Agent 3] Social media analyseren...`);
  let social;
  try {
    social = await aiJSON(`Analyseer dit bedrijf op social media potentieel. Geef JSON terug:

Bedrijf: ${lead.companyName}
Niche: ${lead.niche}
Instagram: ${lead.instagramHandle}
Geschatte volgers: ${lead.estimatedFollowers}
Locatie: ${lead.location}
Website laadtijd: ${website.loadTimeMs ? (website.loadTimeMs/1000).toFixed(1) + 's' : 'onbekend'}
Website problemen: ${website.problems?.join(', ') || 'geen'}

{
  "engagementRate": getal (bijv 3.2 voor 3.2%),
  "postFrequency": "dagelijks/wekelijks/maandelijks",
  "runningAds": true of false,
  "growthPotential": getal 1-10,
  "improvements": ["verbetering 1", "verbetering 2", "verbetering 3"],
  "emailOpener": "1 concrete, specifieke observatie over dit bedrijf die je als opening in een koude email kunt gebruiken. Gebruik echte details: volgers, postfrequentie, website snelheid, niche. Schrijf in de 2e persoon (jullie/je). Max 1 zin. Klinkt als iets wat je echt online zou opmerken. Bijv: 'Zag dat jullie de afgelopen maand nauwelijks posts hebben geplaatst terwijl jullie ${lead.estimatedFollowers} volgers wachten op nieuwe content.'",
  "emailOpenerEn": "Same but in English, 2nd person (you/your). Max 1 sentence. E.g: 'Noticed your last few posts got way less engagement than your follower count suggests — looks like reach has dropped.'",
  "linkedinCompanyFollowers": geschat getal LinkedIn bedrijfspagina volgers (op basis van bedrijfsgrootte en niche — realistisch schatten),
  "linkedinActive": true of false (heeft het bedrijf waarschijnlijk een actieve LinkedIn aanwezigheid?)
}`);
  } catch {
    social = { engagementRate: 2.5, postFrequency: 'wekelijks', runningAds: false, growthPotential: 6, improvements: [], emailOpener: null, emailOpenerEn: null };
  }

  console.log(`  [Agent 4] Kansen berekenen...`);
  const servicesList = services.map(s => `- ${s.name}: â‚¬${s.price} â€" ${s.description}`).join('\n');
  let opportunity;
  try {
    opportunity = await aiJSON(`Analyseer dit bedrijf en geef een opportunity score. Geef JSON terug:

Bedrijf: ${lead.companyName} (${lead.niche})
Locatie: ${lead.location}
Instagram: ${lead.estimatedFollowers} volgers, engagement ${social.engagementRate}%
Website: ${website.reachable ? `bereikbaar in ${website.loadTimeMs}ms` : 'niet bereikbaar'}
Website problemen: ${[...(website.problems||[])].join(', ') || 'geen'}
Betaalde ads: ${social.runningAds ? 'ja' : 'nee'}

Onze diensten:
${servicesList}

Geef JSON:
{
  "score": getal 1-10,
  "problems": ["top probleem 1 met specifieke data", "probleem 2", "probleem 3"],
  "recommendedServices": [{"name": "dienstnaam", "price": getal}],
  "estimatedValue": totaal maandelijks bedrag in euros,
  "urgency": "low" of "medium" of "high" of "critical",
  "reason": "korte uitleg score in 1 zin"
}`);
  } catch {
    opportunity = { score: 6.5, problems: ['Onvoldoende data'], recommendedServices: services.slice(0,2), estimatedValue: 800, urgency: 'medium', reason: 'Gemiddeld potentieel' };
  }

  // Apply memory-based score adjustment
  const memEntry = (readJSON('memory.json') || {})[getMemoryKey(lead.niche, lead.country)];
  if (memEntry && memEntry.sent >= 5) {
    let adj = 0;
    if (memEntry.replyRate > 20) adj = 0.5;
    else if (memEntry.replyRate < 5) adj = -0.3;
    if (adj !== 0) {
      opportunity.score = Math.min(10, Math.max(1, (opportunity.score || 6.5) + adj));
      console.log(`  [Memory] Score ${adj > 0 ? '+' : ''}${adj} voor ${lead.niche}/${lead.country} (reply rate: ${memEntry.replyRate}%)`);
    }
  }

  // Company size score boost/penalty based on target sizes
  const targetSizes = settings.targetCompanySizes || ['small', 'medium'];
  if (companySize && targetSizes.length > 0) {
    if (!targetSizes.includes(companySize)) {
      opportunity.score = Math.max(1, (opportunity.score || 6.5) - 0.5);
      console.log(`  [Size filter] Score -0.5 voor ${companySize} bedrijf (niet in doelgroep)`);
    } else {
      opportunity.score = Math.min(10, (opportunity.score || 6.5) + 0.2);
      console.log(`  [Size filter] Score +0.2 voor ${companySize} bedrijf (in doelgroep)`);
    }
  }

  console.log(`  [Agent 7] Concurrentie analyseren...`);
  let competitors;
  try {
    const lang7 = language === 'nl' ? 'Nederlands' : 'English';
    competitors = await aiJSON(`Analyseer de concurrentie voor dit bedrijf. Antwoord in ${lang7}. Geef alleen JSON terug.

Bedrijf: ${lead.companyName} (${lead.niche})
Locatie: ${lead.location}

Genereer 2-3 realistische lokale concurrenten in dezelfde stad of regio.
Analyseer wat die concurrenten waarschijnlijk beter doen aan online marketing.

{
  "competitorNames": ["naam 1", "naam 2"],
  "competitorAdvantages": ["concreet voordeel 1", "concreet voordeel 2", "concreet voordeel 3"],
  "competitorGap": "één concrete zin in ${lang7} die samenvat wat het grootste voordeel is dat hun concurrenten hebben ten opzichte van dit bedrijf"
}`);
  } catch {
    competitors = { competitorNames: [], competitorAdvantages: [], competitorGap: null };
  }

  console.log(`  [Agent 5] Email schrijven A+B (${language})...`);
  const topProblem = opportunity.problems?.[0] || (language === 'nl' ? 'groei online aanwezigheid' : 'growing online presence');
  const topService = opportunity.recommendedServices?.[0]?.name || services[0]?.name || 'AI-marketing';
  const loadSec = website.loadTimeMs ? (website.loadTimeMs / 1000).toFixed(1) : null;
  const opener  = language === 'nl'
    ? (social.emailOpener    || `Zag ${lead.companyName} online en merkte ${topProblem.toLowerCase()}`)
    : (social.emailOpenerEn  || `Came across ${lead.companyName} online and noticed ${topProblem.toLowerCase()}`);

  const todayNL   = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const seasonal  = getSeasonalContext(language);
  const todayEN   = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const nicheLabel   = lead.subNiche || lead.niche;
  const calendlyLink = settings.calendlyUrl || settings.calendlyLink || null;

  const sharedContext = language === 'nl'
    ? `Bedrijf: ${lead.companyName} (${nicheLabel}, ${lead.location})
Bedrijfstype: ${lead.subNiche ? `${lead.subNiche} (categorie: ${lead.niche})` : lead.niche}
Bedrijfsgrootte: ${companySize}
Instagram: ${lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + ' volgers' : 'onbekend'}
LinkedIn: ${social.linkedinCompanyFollowers ? social.linkedinCompanyFollowers.toLocaleString() + ' volgers' : 'onbekend'}${social.linkedinActive === false ? ' (inactief)' : ''}
Website laadtijd: ${loadSec ? loadSec + ' seconden' : 'onbekend'}
Probleem: ${topProblem}
Dienst: ${topService}
Concurrentie in ${lead.location}: ${competitors?.competitorGap || 'niet beschikbaar'}
Afzender: ${myName} van ${agencyName}
Datum vandaag: ${todayNL}
Seizoenscontext: ${seasonal.season} — ${seasonal.hook}`
    : `Company: ${lead.companyName} (${nicheLabel}, ${lead.location})
Business type: ${lead.subNiche ? `${lead.subNiche} (category: ${lead.niche})` : lead.niche}
Company size: ${companySize}
Instagram: ${lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + ' followers' : 'unknown'}
LinkedIn: ${social.linkedinCompanyFollowers ? social.linkedinCompanyFollowers.toLocaleString() + ' followers' : 'unknown'}${social.linkedinActive === false ? ' (inactive)' : ''}
Website load time: ${loadSec ? loadSec + ' seconds' : 'unknown'}
Problem: ${topProblem}
Service: ${topService}
Competitor context in ${lead.location}: ${competitors?.competitorGap || 'not available'}
Sender: ${myName} from ${agencyName}
Today's date: ${todayEN}
Seasonal context: ${seasonal.season} — ${seasonal.hook}`;

  const calendlyUrl = settings.calendlyUrl || '';
  const calendlyCta = calendlyUrl
    ? (language === 'nl'
        ? `\nCalendly link: ${calendlyUrl} — sluit de CTA af met deze link als directe uitnodiging om in te plannen`
        : `\nCalendly link: ${calendlyUrl} — end the CTA with this link as a direct booking invitation`)
    : '';

  // Append Calendly CTA instruction to shared context
  const sharedContextFinal = sharedContext + calendlyCta;

  const isNlBe = ['nl','be','nederland','netherlands','belgie','belgium'].includes((lead.country||'').toLowerCase().replace(/[^a-z]/g,''));
  const greetingNL = (companySize === 'large' || !isNlBe)
    ? `Geachte ${lead.companyName} team,`
    : `Beste ${lead.companyName},`;
  const greetingEN = (companySize === 'large')
    ? `Dear ${lead.companyName} team,`
    : `Dear ${lead.companyName},`;

  const sharedRules = language === 'nl'
    ? `- Aanhef: gebruik altijd exact deze aanhef: "${greetingNL}"
- VERBODEN aanhef: Hoi, Hey, Hi, Hallo, Goedemorgen, Beste mensen — ALLEEN "Beste" of "Geachte" is toegestaan
- Toon: professioneel maar toegankelijk — schrijf als een senior consultant, niet als een chatbot of marketingbureau
- Gebruik "u" bij grote bedrijven of niet-NL/BE, anders "je/jullie"
- Begin NOOIT een zin met "Ik" als eerste woord van de email
- Onderwerp: 4-6 woorden, concreet, noem bedrijfsnaam of stad — GEEN "AI", "marketing" of "samenwerking" — gebruik ALLEEN gewone tekens (a-z, 0-9, koppelteken, komma, vraagteken)
- Schrijf vloeiende professionele alinea's — GEEN bullet points, GEEN opsommingen, GEEN --- scheidingslijnen
- 3 alinea's: (1) specifieke observatie met concreet gegeven, (2) wat dit betekent + hoe wij helpen, (3) zachte uitnodiging voor een gesprek
- Alinea 1-2: elk max 2-3 zinnen. Alinea 3: max 2 zinnen
- Dienst: beschrijf het resultaat in 1 zin — nooit aanprijzend of met superlatieven
- CTA alinea 3: zachte uitnodiging — bijv. "Zou u openstaan voor een kort kennismakingsgesprek?" ${calendlyLink ? `Sluit af met: ${calendlyLink}` : ''}
- Afsluiting: "Met vriendelijke groet," op een nieuwe regel, dan "${myName}"
- Max 150 woorden in de body (exclusief aanhef en afsluiting)
- Als er concurrentie context is: verweef maximaal 1 zin organisch
- VERBODEN WOORDEN: oplossing, traject, optimaliseren, implementeren, synergie, innovatief, vrijblijvend, passie, data-gedreven, op maat, uniek aanbod, fantastisch, geweldig, absoluut, transformeren, naar een hoger niveau, concurrentievoordeel, bewezen, resultaatgericht
- SEIZOEN: Het is nu ${seasonal.season}. Verweef optioneel 1 subtiele seizoensreferentie alleen als het écht past bij hun niche (bijv. ${seasonal.event}). Forceer dit NIET.`
    : `- Greeting: always use exactly this greeting: "${greetingEN}"
- FORBIDDEN greetings: Hey, Hi, Hello, What's up, Howdy — ONLY "Dear" is allowed
- Tone: professional but approachable — write like a senior consultant who genuinely noticed something specific about their business
- NEVER start the first sentence with "I"
- Subject: 4-6 words, specific, mention company or city — NO "AI", "marketing" or "collaboration" — use ONLY plain ASCII (a-z, 0-9, hyphen, comma, question mark)
- Write in flowing professional paragraphs — NO bullet points, NO lists, NO --- dividers
- 3 paragraphs: (1) specific observation with concrete data point, (2) what this means for them + how we help, (3) soft invitation to connect
- Paragraphs 1-2: max 2-3 sentences each. Paragraph 3: max 2 sentences
- Service: describe the outcome in 1 sentence — never promotional or superlative
- CTA paragraph 3: soft invitation — e.g. "Would you be open to a brief introductory call?" ${calendlyLink ? `Close with: ${calendlyLink}` : ''}
- Sign-off: "Kind regards," on a new line, then "${myName}"
- Max 150 words in the body (excluding greeting and sign-off)
- If competitor context is provided: weave in max 1 sentence naturally
- BANNED WORDS: solution, trajectory, optimize, implement, synergy, leverage, innovative, data-driven, tailored, unique offering, fantastic, absolutely, transform, take to the next level, proven, competitive advantage, seamlessly, cutting-edge, game-changer
- SEASONAL: It is currently ${seasonal.season}. Optionally weave in 1 subtle seasonal reference only if it genuinely fits their niche (e.g. ${seasonal.event}). Do NOT force this.`;

  const promptA = language === 'nl'
    ? `Schrijf een koude email â€" VERSIE A: PROBLEEM-GERICHT. Klinkt als een echte persoon, NIET als AI. Geef JSON terug.

CONTEXT:
${sharedContext}

OPENING ZIN (gebruik deze exact of pas licht aan):
"${opener}"

AANPAK VERSIE A: Begin met het probleem. Gebruik de opening zin hierboven. Noem het probleem concreet met een getal of vergelijking. Dan de dienst als logische oplossing.

REGELS:
${sharedRules}

{"subject": "onderwerp", "body": "emailtekst"}`
    : `Write a cold email â€" VERSION A: PROBLEM-FOCUSED. Reads like a real person typed it, NOT like AI. Return JSON.

CONTEXT:
${sharedContext}

OPENING LINE (use this exactly or adapt slightly):
"${opener}"

VERSION A APPROACH: Start with the problem. Use the opening line above. State the problem concretely with a number or comparison. Then offer the service as the logical next step.

RULES:
${sharedRules}

{"subject": "subject line", "body": "email body"}`;

  const openerB = language === 'nl'
    ? `${lead.companyName} heeft echt potentieel in ${lead.location} â€" en ik denk dat ${topService.toLowerCase()} precies dat kan versnellen.`
    : `${lead.companyName} has real potential to grow in ${lead.location} â€" and I think ${topService.toLowerCase()} could accelerate that.`;

  const promptB = language === 'nl'
    ? `Schrijf een koude email â€" VERSIE B: GROEIKANSEN-GERICHT. Klinkt als een echte persoon, NIET als AI. Geef JSON terug.

CONTEXT:
${sharedContext}

OPENING ZIN VERSIE B (gebruik deze exact of pas licht aan):
"${openerB}"

AANPAK VERSIE B: Begin positief â€" met groeipotentieel, niet met problemen. Focus op wat ze KUNNEN bereiken met ${topService}. Enthousiaster toon. Probleem mag kort genoemd worden als context, maar niet als hoofdboodschap.

REGELS:
${sharedRules}

{"subject": "onderwerp", "body": "emailtekst"}`
    : `Write a cold email â€" VERSION B: GROWTH/OPPORTUNITY-FOCUSED. Reads like a real person typed it, NOT like AI. Return JSON.

CONTEXT:
${sharedContext}

OPENING LINE VERSION B (use this exactly or adapt slightly):
"${openerB}"

VERSION B APPROACH: Start positively â€" with growth potential, not problems. Focus on what they CAN achieve with ${topService}. More enthusiastic tone. Problem can be briefly mentioned as context but not as the main message.

RULES:
${sharedRules}

{"subject": "subject line", "body": "email body"}`;

  let emailA, emailB;
  try {
    [emailA, emailB] = await Promise.all([aiJSON(promptA), aiJSON(promptB)]);
  } catch {
    emailA = language === 'nl'
      ? { subject: `${lead.companyName} – iets opgevallen`, body: `${greetingNL}\n\nBij het bekijken van ${lead.companyName} viel mij op dat er concrete ruimte is om meer uit ${topService.toLowerCase()} te halen.\n\nZou u openstaan voor een kort kennismakingsgesprek?\n\nMet vriendelijke groet,\n${myName}` }
      : { subject: `${lead.companyName} – noticed something`, body: `${greetingEN}\n\nLooking at ${lead.companyName}, I noticed there is a clear opportunity to strengthen your ${topService.toLowerCase()}.\n\nWould you be open to a brief introductory call?\n\nKind regards,\n${myName}` };
    emailB = language === 'nl'
      ? { subject: `${lead.companyName} – concrete kans`, body: `${greetingNL}\n\n${lead.companyName} heeft een solide basis. Naar mijn inschatting is er echter nog onbenut potentieel op het gebied van ${topService.toLowerCase()}.\n\nKan ik u laten zien wat dat in de praktijk betekent?\n\nMet vriendelijke groet,\n${myName}` }
      : { subject: `${lead.companyName} – concrete opportunity`, body: `${greetingEN}\n\n${lead.companyName} has a strong foundation. Based on what I have seen, there is untapped potential in ${topService.toLowerCase()} worth exploring.\n\nWould you be open to a short conversation?\n\nKind regards,\n${myName}` };
  }
  // Agent 5b: 3 subject line options
  const subjectPrompt = language === 'nl'
    ? `Bedenk 3 scherpe email-onderwerpregels voor een koude email.

Bedrijf: ${lead.companyName} (${lead.niche}, ${lead.location})
Probleem: ${topProblem}
Dienst: ${topService}

Regels voor elke onderwerpregel:
- Max 7 woorden
- Verwijs altijd naar iets SPECIFIEKS (bedrijfsnaam, stad, of het concrete probleem)
- Formaat: nieuwsgierigheid wekken of probleem-bewustzijn — GEEN resultaatbelofte
- VERBODEN: "AI", "marketing", "samenwerking", "vrijblijvend", "groeien", "helpen"
- Klinkt menselijk, geen spam
- Optie 1: probleemgericht (noem het specifieke probleem concreet)
- Optie 2: nieuwsgierigheid of vraag-formaat
- Optie 3: stad of niche-specifiek, persoonlijk

Geef ALLEEN JSON terug: { "subjectOptions": ["optie1", "optie2", "optie3"] }`
    : `Generate 3 sharp email subject lines for a cold email.

Company: ${lead.companyName} (${lead.niche}, ${lead.location})
Problem: ${topProblem}
Service: ${topService}

Rules for each subject line:
- Max 7 words
- Always reference something SPECIFIC (company name, city, or the concrete problem)
- Format: curiosity or problem-awareness — NO results promise
- BANNED: "AI", "marketing", "collaboration", "no obligation", "grow", "help"
- Sounds like a real person, not spam
- Option 1: problem-focused (name the specific problem concretely)
- Option 2: curiosity or question format
- Option 3: location or niche specific, personal

Return ONLY JSON: { "subjectOptions": ["option1", "option2", "option3"] }`;

  let subjectOptions = [];
  try {
    const subjectResult = await aiJSON(subjectPrompt);
    subjectOptions = Array.isArray(subjectResult?.subjectOptions) ? subjectResult.subjectOptions : [];
  } catch {}
  if (subjectOptions.length < 3) {
    subjectOptions = language === 'nl'
      ? [emailA.subject, `Vraag over ${lead.companyName}`, `${lead.niche} in ${lead.location}`]
      : [emailA.subject, `Question for ${lead.companyName}`, `${lead.niche} in ${lead.location}`];
  }
  subjectOptions = subjectOptions.slice(0, 3).map(s => String(s).trim());

  const email = { ...emailA, subject: subjectOptions[0] };

  console.log(`  [Agent 6] LinkedIn DM + voicenote schrijven (${language})...`);
  const dmPrompt = language === 'nl'
    ? `Schrijf een LinkedIn DM als een direct, persoonlijk berichtje. Max 280 tekens. Geen hashtags.

Bedrijf: ${lead.companyName} (${lead.niche}, ${lead.location})
Probleem: ${topProblem}
Dienst: ${topService}

Regels:
- Begin met een concrete observatie over hun bedrijf, niet met een zelfintroductie
- "hoi/hey + naam als mogelijk" - maar begin NOOIT met "Ik zie dat" of "Ik merkte dat"
- Noem 1 specifiek detail (volgers, laadtijd, niche) als het past
- Eindig met een open vraag, niet met een CTA of link-aanbod
- Max 280 tekens inclusief afsluiting
- VERBODEN: innovatief, synergie, vrijblijvend, perfect, uniek, oplossingen op maat
Geef alleen de DM-tekst, geen uitleg.`
    : `Write a LinkedIn DM that reads like a real, quick personal message. Max 280 characters. No hashtags.

Company: ${lead.companyName} (${lead.niche}, ${lead.location})
Problem: ${topProblem}
Service: ${topService}

Rules:
- Start with a specific observation about their business, NOT a self-intro
- "Hey/Hi + name if possible" - but NEVER start with "I noticed" or "I saw"
- Mention 1 specific detail (followers, load time, niche) if natural
- End with an open question, not a CTA or link offer
- Max 280 characters including sign-off
- BANNED: innovative, synergy, leverage, perfect, unique, tailored solutions
Return only the DM text, no explanation.`;

  const voicePrompt = language === 'nl'
    ? `Schrijf een voicenote script voor WhatsApp of Instagram. Max 75 woorden (30 seconden uitgesproken). Klinkt als een spontaan persoonlijk berichtje.

Bedrijf: ${lead.companyName} (${lead.niche}, ${lead.location})
Specifiek detail: ${topProblem}
Dienst: ${topService}

Regels:
- Begin middenin een gedachte, niet met standaard begroeting
- 1 specifieke observatie over hun bedrijf
- Gebruik ... voor 1 natuurlijke pauze
- Eindig met een zachte vraag
- Klinkt menselijk, niet als pitch
- Geef alleen de spreektekst, geen labels of aanwijzingen`
    : `Write a voicenote script for WhatsApp or Instagram. Max 75 words (30 seconds spoken). Sounds like a spontaneous personal message.

Company: ${lead.companyName} (${lead.niche}, ${lead.location})
Specific detail: ${topProblem}
Service: ${topService}

Rules:
- Start mid-thought, not with a standard greeting
- 1 specific observation about their business
- Use ... for 1 natural pause
- End with a soft question
- Sounds human, not like a pitch
- Return only the spoken text, no labels`;

  let linkedinDm, voicenoteScript;
  try {
    const [dmText, voiceText] = await Promise.all([aiCall(dmPrompt), aiCall(voicePrompt)]);
    linkedinDm      = dmText.trim().substring(0, 280);
    voicenoteScript = voiceText.trim();
  } catch {
    linkedinDm = language === 'nl'
      ? `Hoi! Zag ${lead.companyName} online — jullie doen interessant werk in ${lead.niche}. Wij helpen vergelijkbare bedrijven groeien met AI-marketing. Gratis audit beschikbaar — even kennismaken?`
      : `Hi! Came across ${lead.companyName} — great work in the ${lead.niche} space. We help similar businesses grow with AI marketing. Free audit available — fancy a quick chat?`;
    voicenoteScript = null;
  }

  const id = `lead-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
  const now = new Date().toISOString();
  const item = {
    id, leadId: id, status: 'pending', type: 'new',
    companyName: lead.companyName, location: lead.location, country: lead.country,
    language, companySize, emailOpener: opener,
    niche: lead.niche, subNiche: lead.subNiche || null, instagramHandle: lead.instagramHandle,
    estimatedFollowers: lead.estimatedFollowers, websiteUrl: lead.websiteUrl,
    linkedinCompanyUrl: lead.linkedinCompanyUrl || null,
    linkedinCompanyFollowers: social.linkedinCompanyFollowers || null,
    linkedinActive: social.linkedinActive !== false,
    score: Math.round(opportunity.score * 10) / 10,
    estimatedValue: opportunity.estimatedValue, urgency: opportunity.urgency,
    problems: opportunity.problems || [], services: opportunity.recommendedServices || [],
    contactEmail, emailSource, emailVerified,
    website, social, email, emailA, emailB, subjectOptions, linkedinDm, voicenoteScript, competitors,
    sendOptimalTime: getOptimalSendTime(lead.niche), createdAt: now
  };
  // Every lead goes to inbox for manual approval — no auto-approve

  const leadRecord = {
    id, companyName: lead.companyName, niche: lead.niche, subNiche: lead.subNiche || null, location: lead.location,
    country: lead.country, language, companySize,
    instagramHandle: lead.instagramHandle, estimatedFollowers: lead.estimatedFollowers,
    websiteUrl: lead.websiteUrl,
    linkedinCompanyUrl: lead.linkedinCompanyUrl || null,
    linkedinCompanyFollowers: social.linkedinCompanyFollowers || null,
    linkedinActive: social.linkedinActive !== false,
    score: item.score, urgency: item.urgency,
    status: item.status, estimatedValue: item.estimatedValue,
    problems: item.problems, services: item.services, emailOpener: opener,
    contactEmail, emailSource, emailVerified,
    email: item.email, emailA: item.emailA, emailB: item.emailB, subjectOptions: item.subjectOptions, linkedinDm: item.linkedinDm,
    voicenoteScript: item.voicenoteScript,
    website: item.website, competitors, sendOptimalTime: item.sendOptimalTime,
    social: { engagementRate: social.engagementRate, postFrequency: social.postFrequency, growthPotential: social.growthPotential },
    createdAt: now,
    history: [{ event: 'created', label: 'Lead toegevoegd', time: now }]
  };

  return { item, leadRecord };
}

async function runFindLeadsJob(overrides = {}) {
  console.log('[Run] Starting runFindLeadsJob...');
  console.log('[Run] Overrides:', JSON.stringify(overrides));

  const settings0 = readJSON('settings.json') || {};
  const apiKey = getClaudeApiKey(settings0);
  console.log('[Run] API key exists:', !!apiKey);

  if (!isClaudeReady(settings0)) {
    throw new Error('Claude API sleutel niet ingesteld. Voeg toe via Instellingen → API & integraties of stel CLAUDE_API_KEY in als Railway environment variable.');
  }
  const settings = readJSON('settings.json') || {};
  if (settings.automationPaused) {
    console.log('[Agency AI] Automatisering gepauzeerd — run overgeslagen');
    return 0;
  }

  const count      = overrides.count      || settings.leadsPerDay || 15;
  const services   = settings.services   || [];
  const myName     = settings.myName     || 'Ekow';
  const agencyName = settings.agencyName || 'Agency AI';
  console.log('[Run] Target leads:', count, '| Services:', services.length, '| myName:', myName);

  // Build niche targeting list from settings or overrides
  const targetSubNiches = settings.targetSubNiches || [];
  const targetNiches    = settings.targetNiches    || [];
  let nichesList;
  if (overrides.niches?.length) {
    nichesList = overrides.niches.join(', ');
  } else if (targetSubNiches.length) {
    nichesList = targetSubNiches.join(', ');
  } else if (targetNiches.length) {
    const expanded = targetNiches.flatMap(n => SUB_NICHES[n] || [n]);
    nichesList = expanded.join(', ');
  } else {
    nichesList = Object.values(SUB_NICHES).flat().join(', ');
  }


  // Cities and niches to rotate through — each batch picks one of each at random
  const SEARCH_CITIES = [
    'Amsterdam', 'Rotterdam', 'Utrecht', 'Antwerp', 'Brussels',
    'Paris', 'Lyon', 'Berlin', 'Munich', 'Hamburg',
    'Rome', 'Milan', 'London', 'Manchester',
    'New York', 'Los Angeles', 'Chicago', 'Toronto',
    'Sydney', 'Barcelona', 'Madrid', 'Vienna', 'Zurich'
  ];
  const SEARCH_NICHES_WEB = [
    'beauty salon', 'restaurant', 'fitness studio', 'retail shop',
    'wellness spa', 'bakery', 'photography studio', 'interior design'
  ];

  const BATCH_SIZE = 5;
  const target      = count;
  const maxAttempts = 60;
  let found    = 0;
  let attempts = 0;
  let skipped  = 0;
  const seenNames  = new Set();
  const inboxItems = [];
  const newLeads   = [];

  console.log(`\n[Agency AI] ─── Lead finder gestart: ${target} leads nodig ───`);

  try {
  while (found < target && attempts < maxAttempts) {
    const remaining = target - found;
    const batchSize = Math.min(BATCH_SIZE, remaining + 2);

    // ── Agent 1: Web-search finder (batch) ────────────────────────────────
    const randomCity  = SEARCH_CITIES[Math.floor(Math.random() * SEARCH_CITIES.length)];
    const randomNiche = SEARCH_NICHES_WEB[Math.floor(Math.random() * SEARCH_NICHES_WEB.length)];
    const alreadySeen = seenNames.size > 0
      ? `\n\nDo NOT return these businesses (already found): ${[...seenNames].slice(-30).join(', ')}`
      : '';

    const searchPrompt = `Search the web and find ${batchSize} real small independent local businesses in ${randomCity} that sell or offer: ${randomNiche}.

For EACH business you MUST find:
1. Real company name (as shown on their website)
2. Real website URL (the actual URL you found while searching)
3. Real contact email address — find it from their website, Google Maps listing, social media profile, or any public source. Do NOT guess or invent an email.

Only include businesses where you actually found a real email address.

Requirements:
- Independently owned local business (NOT a national chain or franchise)
- Real active website (not just a social media page)
- Operating for at least 1 year

Return ONLY a JSON array, no explanation:
[{
  "companyName": "Exact business name",
  "websiteUrl": "https://their-real-website.com",
  "email": "real@emailaddress.com",
  "location": "${randomCity}, Country",
  "country": "2-letter country code e.g. NL, DE, GB, US, FR",
  "instagramHandle": "@handle or null",
  "niche": "beauty" or "food" or "fitness" or "retail" or "restaurant" or "horeca" or "health" or "automotive",
  "subNiche": "${randomNiche}",
  "estimatedFollowers": 0,
  "companySize": "small"
}]${alreadySeen}`;

    // 7s between web-search calls to stay under the 10/min rate limit
    if (attempts > 0) await new Promise(r => setTimeout(r, 7000));

    let batch;
    try {
      console.log(`[Agent 1] Searching for ${randomNiche} businesses in ${randomCity}...`);
      batch = await aiWebSearchJSON(searchPrompt);
      if (!Array.isArray(batch)) batch = [batch];
      batch = batch.slice(0, batchSize);
    } catch (err) {
      console.error(`[Agent 1] Web search batch mislukt:`, err.message);
      logError('agent1', `Agent 1 web search mislukt`, err.message);
      if (found === 0) throw new Error(`Agent 1 (Lead Finder) mislukt: ${err.message}`);
      attempts += batchSize;
      continue;
    }

    // Deduplicate within and across batches
    const freshBatch = batch.filter(b => {
      if (!b || !b.companyName) return false;
      const key = b.companyName.toLowerCase().trim();
      if (seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });

    // Always advance attempts by at least batchSize to prevent infinite loop
    // (freshBatch.length can be 0 if all names were duplicates)
    attempts += Math.max(batchSize, freshBatch.length);
    console.log(`[Agent 1] ${freshBatch.length} nieuwe bedrijven in batch (attempts: ${attempts}/${maxAttempts})`);

    // Early-exit: if 20+ companies checked with 0 leads found, email scraper is likely broken
    if (attempts >= 20 && found === 0) {
      const errMsg = 'Email scraper lijkt niet te werken. Controleer de Railway logs op [Agent2] berichten.';
      console.error(`[Run] GESTOPT: ${errMsg}`);
      logError('scraper', errMsg, `${attempts} bedrijven gecontroleerd, 0 emails gevonden`);
      throw new Error(errMsg);
    }

    for (const lead of freshBatch) {
      if (found >= target) break;
      console.log(`\n[Lead ${found + 1}/${target}] ${lead.companyName} (${lead.niche})`);
      let result;
      try {
        result = await processOneLead(lead, settings);
      } catch (leadErr) {
        console.error(`[Lead] processOneLead crashed voor ${lead.companyName}:`, leadErr.message);
        skipped++;
        continue;
      }
      if (!result) {
        skipped++;
        continue;
      }
      const { item, leadRecord } = result;
      inboxItems.push(item);
      newLeads.push(leadRecord);
      found++;
      console.log(`  ✓ Klaar — score: ${item.score}, waarde: €${item.estimatedValue} → inbox (wacht op goedkeuring)`);
    }
  }

  } catch (loopErr) {
    console.error('[Run] Batch loop crashed:', loopErr.message);
    console.error('[Run] Stack:', loopErr.stack);
    logError('run', `Batch loop gecrasht na ${found} leads`, loopErr.message);
    // Don't rethrow — save whatever was found
  }

  console.log(`\n[Agency AI] Lus klaar: ${found} leads gevonden, ${skipped} overgeslagen zonder email, ${attempts} bedrijven gecontroleerd`);
  // â"€â"€ Save results â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€
  const inbox = readJSON('inbox.json') || [];
  writeJSON('inbox.json', [...inboxItems, ...inbox]);

  const allLeads = readJSON('leads.json') || [];
  writeJSON('leads.json', [...newLeads, ...allLeads]);

  // Update stats
  const stats = readJSON('stats.json') || {};
  const today = new Date().toISOString().split('T')[0];
  const weeklyData = stats.weeklyData || [];
  const todayEntry = weeklyData.find(w => w.date === today);
  if (todayEntry) todayEntry.count = (todayEntry.count || 0) + inboxItems.length;
  else weeklyData.push({ date: today, count: inboxItems.length });
  if (weeklyData.length > 30) weeklyData.splice(0, weeklyData.length - 30);

  const totalValue = newLeads.reduce((s, l) => s + (l.estimatedValue || 0), 0);
  writeJSON('stats.json', {
    ...stats,
    leadsFound: (stats.leadsFound || 0) + inboxItems.length,
    pipelineValue: (stats.pipelineValue || 0) + totalValue,
    weeklyData
  });

  // Save run log
  const runs = readJSON('runs.json') || [];
  runs.unshift({
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    leadsFound: inboxItems.length,
    autoApproved: 0,
    totalValue
  });
  if (runs.length > 100) runs.splice(100);
  writeJSON('runs.json', runs);

  const runTokIn  = _sessionTokensIn;
  const runTokOut = _sessionTokensOut;
  _sessionTokensIn = 0; _sessionTokensOut = 0;
  const runCostUsd = calcCostUsd(runTokIn, runTokOut);
  addActivity('run', `Run klaar: ${inboxItems.length} leads gevonden (${skipped} overgeslagen zonder email)`, { tokensIn: runTokIn, tokensOut: runTokOut, costUsd: runCostUsd, meta: { leadsFound: inboxItems.length, skipped, attempts, totalValue } });
  const statsAft = readJSON('stats.json') || {};
  statsAft.totalApiTokensIn  = (statsAft.totalApiTokensIn  || 0) + runTokIn;
  statsAft.totalApiTokensOut = (statsAft.totalApiTokensOut || 0) + runTokOut;
  statsAft.totalApiCostUsd   = Math.round(((statsAft.totalApiCostUsd || 0) + runCostUsd) * 10000) / 10000;
  writeJSON('stats.json', statsAft);

  if (inboxItems.length > 0) {
    const pendingCount = inboxItems.length;
    const highScoreCount = inboxItems.filter(i => i.score >= 8).length;
    addNotification('run_complete', `Run klaar: ${inboxItems.length} leads gevonden`,
      `${pendingCount} wachten op goedkeuring${highScoreCount > 0 ? ` · ${highScoreCount} met score 8+` : ''}`);
    fireWebhooks('run.complete', { leadsFound: inboxItems.length, pendingCount, highScoreCount, totalValue, completedAt: new Date().toISOString() });
  }
  console.log(`\n[Agency AI] ─── Run klaar: ${inboxItems.length} leads gevonden (${skipped} overgeslagen zonder email, ${attempts} bedrijven gecontroleerd), €${totalValue} pipeline ───\n`);
  return inboxItems.length;
}

// â"€â"€â"€ Find leads endpoint â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.post('/api/find-leads', requireAdmin, async (req, res) => {
  try {
    const found = await runFindLeadsJob(req.body || {});
    res.json({ ok: true, found });
  } catch (err) {
    logError('run', err.message);
    res.status(500).json({ error: err.message });
  }
});

// â"€â"€â"€ Follow-up sequencer â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / 86400000;
}

async function runFollowUpJob() {
  const settings  = readJSON('settings.json');
  if (settings.automationPaused) return;

  const myName     = settings.myName     || 'Ekow';
  const agencyName = settings.agencyName || 'Agency AI';

  const inbox = readJSON('inbox.json') || [];
  const leads = readJSON('leads.json') || [];

  let added = 0;
  let markedDead = 0;

  for (const lead of leads) {
    if (lead.status !== 'sent') continue;
    if (!lead.sentAt) continue;

    const days     = daysSince(lead.sentAt);
    const lang     = lead.language || 'nl';
    const nicheCtx = lead.subNiche || lead.niche;
    const origSubj = lead.email?.subject || lead.emailA?.subject || '';

    // Mark dead after 8+ days with no reply and no pending follow-ups
    if (days >= 8) {
      const hasPending = inbox.some(i => i.leadId === lead.id && i.status === 'pending');
      if (!hasPending) {
        lead.status = 'dead';
        addLeadHistory(leads, lead.id, { event: 'dead', label: `Dead â€" ${Math.floor(days)} dagen geen reactie` });
        markedDead++;
        console.log(`[Follow-up] ${lead.companyName} â†' dead (${Math.floor(days)} dagen geen reactie)`);
        continue;
      }
    }

    // Follow-up 1: day 2 after sending, no reply yet
    const hasFollowup1 = inbox.some(i => i.leadId === lead.id && i.type === 'followup1');
    if (days >= 2 && days < 5 && !hasFollowup1) {
      console.log(`[Follow-up] Genereer follow-up 1 voor ${lead.companyName}...`);
      try {
        const fu1Prompt = lang === 'nl'
          ? `Schrijf een korte follow-up email. Geef JSON terug.

Context: Stuurden ${lead.companyName} (${nicheCtx}, ${lead.location}) 2 dagen geleden een koude email. Origineel onderwerp: "${origSubj}". Nog geen reactie. Eerste opvolging.
Afzender: ${myName} van ${agencyName}
Seizoen: ${getSeasonalContext('nl').season}

Regels:
- Start exact met: "Wilde dit even naar boven halen -"
- Noem in 1 zin iets specifieks over hun ${nicheCtx} in ${lead.location}
- Max 50 woorden totaal
- Eindig met 1 simpele vraag zoals "Past het komende week even?" of "Heb je 10 minuten?"
- GEEN uitleg over je dienst, GEEN excuses voor de follow-up
- Toon: snel getypt op telefoon, niet vanachter bureau
- VERBODEN: "vrijblijvend", "innovatief", "ik hoop", "niet verplicht"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "volledige email"}`
          : `Write a short follow-up email. Return JSON.

Context: Sent ${lead.companyName} (${nicheCtx}, ${lead.location}) a cold email 2 days ago. Original subject: "${origSubj}". No reply yet. First follow-up.
Sender: ${myName} from ${agencyName}
Season: ${getSeasonalContext('en').season}

Rules:
- Start exactly with: "Just bumping this up -"
- Mention 1 specific thing about their ${nicheCtx} in ${lead.location}
- Max 50 words total
- End with 1 simple question like "Worth a quick chat this week?" or "Got 10 minutes?"
- NO explanation of your service, NO apology for following up
- Tone: typed quickly on a phone, not from behind a desk
- BANNED: "no obligation", "innovative", "I hope", "just checking in"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "full email"}`;

        const email = await aiJSON(fu1Prompt);
        const item = {
          id: `fu1-${lead.id}-${Date.now()}`,
          leadId: lead.id,
          status: 'pending',
          type: 'followup1',
          companyName: lead.companyName,
          location: lead.location,
          country: lead.country,
          niche: lead.niche,
          subNiche: lead.subNiche || null,
          language: lang,
          score: lead.score,
          estimatedValue: lead.estimatedValue,
          contactEmail: lead.contactEmail,
          email,
          sendOptimalTime: getOptimalSendTime(nicheCtx),
          createdAt: new Date().toISOString()
        };
        inbox.unshift(item);
        addLeadHistory(leads, lead.id, { event: 'followup1', label: 'Follow-up 1 aangemaakt (dag 2)' });
        added++;
        console.log(`[Follow-up] Follow-up 1 aangemaakt voor ${lead.companyName}`);
      } catch (err) {
        logError('followup1', `Follow-up 1 mislukt voor ${lead.companyName}`, err.message);
      }
    }

    // Follow-up 2: day 5 after sending, no reply yet
    const hasFollowup2 = inbox.some(i => i.leadId === lead.id && i.type === 'followup2');
    if (days >= 5 && days < 8 && !hasFollowup2) {
      console.log(`[Follow-up] Genereer follow-up 2 voor ${lead.companyName}...`);
      try {
        const fu2Prompt = lang === 'nl'
          ? `Schrijf een heel korte laatste follow-up email. Geef JSON terug.

Context: ${lead.companyName} (${nicheCtx}, ${lead.location}) heeft niet gereageerd op 2 eerdere emails. Dit is de laatste poging.
Afzender: ${myName} van ${agencyName}
Seizoen: ${getSeasonalContext('nl').season}

Regels:
- Start exact met: "Laatste berichtje -"
- Max 40 woorden
- Toon: luchtig, geen druk, deur openlaten
- 1 specifieke referentie aan hun niche (${nicheCtx}) of locatie (${lead.location})
- Sluit af met: "Succes in ieder geval — en mocht timing later beter uitkomen, weet je me te vinden."
- VERBODEN: salesy taal, excuses, "vrijblijvend", "ik hoop"

{"subject": "Laatste berichtje — ${lead.companyName}", "body": "volledige email"}`
          : `Write a very short final follow-up email. Return JSON.

Context: ${lead.companyName} (${nicheCtx}, ${lead.location}) hasn't responded to 2 previous emails. This is the last attempt.
Sender: ${myName} from ${agencyName}
Season: ${getSeasonalContext('en').season}

Rules:
- Start exactly with: "Last message -"
- Max 40 words
- Tone: light, zero pressure, leave the door open
- 1 specific reference to their niche (${nicheCtx}) or location (${lead.location})
- Close with: "Good luck either way — and if timing ever works out, you know where to find me."
- BANNED: salesy language, apologies, "no obligation", "I hope"

{"subject": "Last message — ${lead.companyName}", "body": "full email"}`;

        const email = await aiJSON(fu2Prompt);
        const item = {
          id: `fu2-${lead.id}-${Date.now()}`,
          leadId: lead.id,
          status: 'pending',
          type: 'followup2',
          companyName: lead.companyName,
          location: lead.location,
          country: lead.country,
          niche: lead.niche,
          subNiche: lead.subNiche || null,
          language: lang,
          score: lead.score,
          estimatedValue: lead.estimatedValue,
          contactEmail: lead.contactEmail,
          email,
          sendOptimalTime: getOptimalSendTime(nicheCtx),
          createdAt: new Date().toISOString()
        };
        inbox.unshift(item);
        addLeadHistory(leads, lead.id, { event: 'followup2', label: 'Follow-up 2 aangemaakt (dag 5)' });
        added++;
        console.log(`[Follow-up] Follow-up 2 aangemaakt voor ${lead.companyName}`);
      } catch (err) {
        logError('followup2', `Follow-up 2 mislukt voor ${lead.companyName}`, err.message);
      }
    }

    // LinkedIn DM: day 7 (after both email FUs, before dead)
    const hasLinkedinDmItem = inbox.some(i => i.leadId === lead.id && i.type === 'linkedinDm');
    if (days >= 7 && days < 8 && !hasLinkedinDmItem && !lead.linkedinDmSentAt) {
      console.log(`[Follow-up] Genereer LinkedIn DM voor ${lead.companyName}...`);
      try {
        const dmPrompt = lang === 'nl'
          ? `Schrijf een korte LinkedIn DM voor een prospect die niet heeft gereageerd op 2 emails. Max 280 tekens. Geen JSON, alleen de tekst.

Bedrijf: ${lead.companyName} (${nicheCtx}, ${lead.location})
Afzender: ${myName} van ${agencyName}

Regels:
- Eerste zin: verwijzing naar hun branche/locatie, niet naar de emails
- Max 1 concrete belofte of vraag
- Toon: informeel, direct, menselijk — geen pitch
- Sluit af met je voornaam
- Absoluut max 280 tekens`
          : `Write a short LinkedIn DM for a prospect who hasn't replied to 2 emails. Max 280 chars. No JSON, just the text.

Company: ${lead.companyName} (${nicheCtx}, ${lead.location})
Sender: ${myName} from ${agencyName}

Rules:
- First sentence: reference to their industry/location, not the emails
- Max 1 concrete promise or question
- Tone: casual, direct, human — not a pitch
- Sign off with your first name only
- Hard limit: 280 characters`;

        let dmText = (await aiCall(dmPrompt)).trim().substring(0, 280);
        if (!dmText) dmText = lang === 'nl'
          ? `Hoi! Zag ${lead.companyName} — jullie doen interessant werk in ${lead.location}. Wij helpen vergelijkbare bedrijven groeien met AI. Gratis audit beschikbaar. Even kennismaken? — ${myName}`
          : `Hi! Came across ${lead.companyName} — great work in the ${lead.location} area. We help similar businesses grow with AI. Free audit available. Worth a quick chat? — ${myName}`;

        const item = {
          id: `lkd-${lead.id}-${Date.now()}`,
          leadId: lead.id,
          status: 'pending',
          type: 'linkedinDm',
          companyName: lead.companyName,
          location: lead.location,
          country: lead.country,
          niche: lead.niche,
          subNiche: lead.subNiche || null,
          language: lang,
          score: lead.score,
          estimatedValue: lead.estimatedValue,
          linkedinUrl: lead.social?.linkedinUrl || null,
          linkedinDm: dmText,
          createdAt: new Date().toISOString()
        };
        inbox.unshift(item);
        addLeadHistory(leads, lead.id, { event: 'linkedinDmCreated', label: 'LinkedIn DM aangemaakt (dag 7)' });
        added++;
        console.log(`[Follow-up] LinkedIn DM aangemaakt voor ${lead.companyName}`);
      } catch (err) {
        logError('linkedin_dm', `LinkedIn DM mislukt voor ${lead.companyName}`, err.message);
      }
    }
  }

  if (markedDead > 0 || added > 0) {
    writeJSON('inbox.json', inbox);
    writeJSON('leads.json', leads);
  }

  console.log(`[Follow-up] Klaar: ${added} follow-ups aangemaakt, ${markedDead} leads dead`);
  return { added, markedDead };
}

// Manual trigger endpoint for follow-up job
app.post('/api/follow-ups/run', async (req, res) => {
  try {
    const result = await runFollowUpJob();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Reply detection via Gmail IMAP ──────────────────────────────────────────

const IMAP_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function toImapDate(d) {
  return `${d.getDate()}-${IMAP_MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function extractReplyText(raw) {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n');
  // Strip base64 encoded blocks
  text = text.replace(/[A-Za-z0-9+/]{60,}={0,2}/g, '');
  // Remove quoted reply block (lines starting with >)
  const parts = text.split(/^>.*$/m);
  text = parts[0];
  // Remove "On ... wrote:" type quote markers
  text = text.replace(/^On .{10,200}\bwrote:[\s\S]*/m, '');
  // Strip HTML tags if any
  text = text.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ');
  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text.substring(0, 600);
}

async function generateAndQueueAiReply(lead, replyText, settings) {
  const myName     = settings.myName     || 'Admin';
  const agencyName = settings.agencyName || 'Agency AI';
  const origSubject = lead.email?.subject || 'onze email';
  const services    = (settings.services || DEFAULT_SERVICES).slice(0, 4).map(s => s.name).join(', ');
  const calendlyCta = settings.calendlyUrl ? `\nCalendly: ${settings.calendlyUrl}` : '';

  const isNL = !/\b(the|and|for|with|your|this|we|our|have|that)\b/i.test(replyText) ||
               /\b(het|een|van|je|jij|wij|ons|naar|voor)\b/i.test(replyText);

  const prompt = isNL
    ? `Schrijf een zakelijke e-mailreactie op onderstaande reply van een potentiële klant. Geef ALLEEN de emailtekst terug — geen onderwerpregel, geen JSON, geen uitleg.

Bedrijf: ${lead.companyName} (${lead.niche || 'onbekend'}, ${lead.location || ''})
Oorspronkelijk onderwerp: ${origSubject}
Hun antwoord:
"${replyText}"

Afzender: ${myName} van ${agencyName}
Diensten: ${services}${calendlyCta}

Regels:
- Lees hun antwoord zorgvuldig en reageer precies op wat ze schreven
- Als ze interesse tonen → stel een kort gesprek voor${settings.calendlyUrl ? ', voeg de Calendly-link toe' : ''}
- Als ze een vraag stellen → beantwoord bondig, stuur aan op een call
- Als ze niet geïnteresseerd zijn → reageer vriendelijk, laat de deur open
- Als onduidelijk → stel één verduidelijkende vraag
- Maximaal 100 woorden
- Klinkt menselijk, geen AI-jargon, geen buzzwords
- Sluit af met: ${myName}, ${agencyName}`
    : `Write a business email reply to the following prospect response. Return ONLY the email body — no subject line, no JSON, no explanation.

Company: ${lead.companyName} (${lead.niche || 'unknown'}, ${lead.location || ''})
Original subject: ${origSubject}
Their reply:
"${replyText}"

Sender: ${myName} from ${agencyName}
Services: ${services}${calendlyCta}

Rules:
- Read their reply carefully and respond to exactly what they said
- If they show interest → suggest a quick call${settings.calendlyUrl ? ', include the Calendly link' : ''}
- If they ask a question → answer briefly and steer toward a call
- If not interested → respond graciously, leave door open
- If unclear → ask one clarifying question
- Max 100 words
- Sounds human, no AI jargon, no buzzwords
- Sign off with: ${myName}, ${agencyName}`;

  const draft = (await aiCall(prompt)).trim();
  const subject = `Re: ${origSubject}`;

  // Auto-send if toggle is on AND score is high enough
  if (settings.aiAutoReplySend && (lead.score || 0) >= 8) {
    await sendEmail({ to: lead.contactEmail || lead.email?.to || '', subject, body: draft });
    const leads = readJSON('leads.json') || [];
    addLeadHistory(leads, lead.id, { event: 'aiReplySent', label: `AI antwoord automatisch verstuurd naar ${lead.contactEmail || ''}` });
    writeJSON('leads.json', leads);
    addActivity('email', `AI antwoord auto-verstuurd → ${lead.companyName}`, { meta: { leadId: lead.id } });
    console.log(`[AiReply] Auto-verstuurd naar ${lead.companyName}`);
    return;
  }

  const item = {
    id:            `air-${lead.id}-${Date.now()}`,
    leadId:        lead.id,
    type:          'ai_reply',
    status:        'pending',
    companyName:   lead.companyName,
    location:      lead.location,
    country:       lead.country,
    niche:         lead.niche,
    score:         lead.score,
    contactEmail:  lead.contactEmail || lead.email?.to || '',
    subject,
    originalReply: replyText,
    aiDraft:       draft,
    createdAt:     new Date().toISOString()
  };

  const inbox = readJSON('inbox.json') || [];
  // Skip if we already have a pending ai_reply for this lead
  const alreadyQueued = inbox.some(i => i.type === 'ai_reply' && i.leadId === lead.id && i.status === 'pending');
  if (!alreadyQueued) {
    inbox.unshift(item);
    writeJSON('inbox.json', inbox);
    console.log(`[AiReply] Draft aangemaakt voor ${lead.companyName}`);
  }
}

async function checkReplies() {
  const settings = readJSON('settings.json');
  if (!isGmailReady(settings)) return 0;
  if (settings.replyDetection === false) return 0;

  let imapSimple, simpleParser;
  try {
    imapSimple = require('imap-simple');
    ({ simpleParser } = require('mailparser'));
  } catch (e) {
    console.error('[Reply] imap-simple of mailparser niet beschikbaar:', e.message);
    return 0;
  }

  const imapConfig = {
    imap: {
      user:       settings.gmailAddress || process.env.GMAIL_ADDRESS,
      password:   getGmailPassword(settings),
      host:       'imap.gmail.com',
      port:       993,
      tls:        true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  let connection;
  try {
    connection = await imapSimple.connect(imapConfig);
    await connection.openBox('INBOX');

    const since = new Date();
    since.setDate(since.getDate() - 7);
    const searchCriteria = [['SINCE', toImapDate(since)]];
    // Fetch full RFC822 message so mailparser can do proper MIME decoding
    const fetchOptions = { bodies: ['RFC822'], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const leads  = readJSON('leads.json') || [];
    const stats  = readJSON('stats.json') || {};
    let repliesFound = 0;
    let bouncesFound = 0;
    const newNames = [];
    const aiReplyQueue = [];

    for (const msg of messages) {
      const rfc822 = msg.parts.find(p => p.which === 'RFC822');
      if (!rfc822) continue;

      let parsed;
      try { parsed = await simpleParser(rfc822.body); }
      catch (parseErr) { console.warn('[Reply] Mailparser fout:', parseErr.message); continue; }

      const subject = (parsed.subject || '').toLowerCase().trim();
      if (!/^re:/i.test(subject)) continue;
      const cleanSubject = subject.replace(/^(re:\s*)+/i, '').trim();
      const msgId = parsed.messageId || `uid-${msg.attributes.uid}`;

      const matched = leads.find(l => {
        if (!l.sentAt) return false;
        if (['client', 'dead'].includes(l.status)) return false;
        // Skip if we already processed this exact message ID
        if (l.processedMessageIds?.includes(msgId)) return false;
        const orig = (l.email?.subject || '').toLowerCase().trim();
        if (!orig) return false;
        return cleanSubject === orig ||
               cleanSubject.includes(orig.substring(0, 25)) ||
               orig.includes(cleanSubject.substring(0, 25));
      });

      if (matched) {
        // Mark as read in Gmail (never delete)
        try { await connection.addFlags(msg.attributes.uid, ['\\Seen']); }
        catch (flagErr) { console.warn('[Reply] Mark-as-read mislukt:', flagErr.message); }

        // Track message ID to prevent reprocessing
        if (!matched.processedMessageIds) matched.processedMessageIds = [];
        matched.processedMessageIds.push(msgId);
        if (matched.processedMessageIds.length > 20) {
          matched.processedMessageIds = matched.processedMessageIds.slice(-20);
        }

        // Extract clean reply text (mailparser already decoded charset + base64)
        const bodyText = parsed.text ||
          (parsed.html || '').replace(/<[^>]*>/g, '').replace(/&[a-z]+;/gi, ' ');
        const replyText = extractReplyText(bodyText);

        matched.status        = 'replied';
        matched.repliedAt     = new Date().toISOString();
        matched.lastReplyText = replyText || '';
        matched.lastReplyAt   = matched.repliedAt;
        matched.lastReplyFrom = parsed.from?.text || (matched.contactEmail || '');

        addLeadHistory(leads, matched.id, {
          event: 'replied',
          label: `Reply ontvangen op ${new Date().toLocaleDateString('nl-NL')}`
        });
        if (matched.referralEmailSent) {
          addLeadHistory(leads, matched.id, { event: 'referral', label: 'Referral interesse getoond' });
        }
        updateMemory(matched.niche, matched.country, 'replied');
        repliesFound++;
        newNames.push(matched.companyName);
        addActivity('reply', 'Reply ontvangen van ' + matched.companyName, { meta: { companyName: matched.companyName, leadId: matched.id } });
        addNotification('reply_received', `Reply: ${matched.companyName}`, `${matched.companyName} heeft gereageerd op jouw email`, matched.id);
        fireWebhooks('lead.replied', { leadId: matched.id, companyName: matched.companyName, niche: matched.niche, score: matched.score, location: matched.location, contactEmail: matched.contactEmail, repliedAt: matched.repliedAt });
        console.log(`[Reply] Reply gedetecteerd: ${matched.companyName} (${msgId})`);

        if (settings.aiAutoReply !== false && replyText) {
          aiReplyQueue.push({ lead: { ...matched }, replyText });
        }
      }
    }

    // ── Bounce detection ─────────────────────────────────────────────────────
    try {
      const bounceSince = new Date();
      bounceSince.setDate(bounceSince.getDate() - 14);
      const bounceCriteria = [['SINCE', toImapDate(bounceSince)], ['FROM', 'MAILER-DAEMON']];
      const bounceFetch   = { bodies: ['HEADER.FIELDS (FROM SUBJECT TO)', 'TEXT'], markSeen: false };
      const bounceMessages = await connection.search(bounceCriteria, bounceFetch);

      const EMAIL_RE = /[\w.+%-]+@[\w-]+\.[a-z]{2,}/gi;

      for (const msg of bounceMessages) {
        const hdr  = msg.parts.find(p => p.which === 'HEADER.FIELDS (FROM SUBJECT TO)');
        const body = msg.parts.find(p => p.which === 'TEXT');
        if (!hdr) continue;

        const hdrRaw  = hdr.body;
        const subj    = (hdrRaw.match(/^Subject:\s*(.+)/im)?.[1] || '').toLowerCase();
        const isBounce = /delivery.*(fail|status|report)|undeliver|failure notice|mail delivery|non.delivery|returned mail|bounce/i.test(subj);
        if (!isBounce) continue;

        const bodyText   = typeof body?.body === 'string' ? body.body : '';
        const candidates = [...new Set([...bodyText.matchAll(EMAIL_RE)].map(m => m[0].toLowerCase()))];

        for (const failedEmail of candidates) {
          const hit = leads.find(l =>
            !l.emailBounced &&
            l.sentAt &&
            !['dead'].includes(l.status) &&
            l.contactEmail?.toLowerCase() === failedEmail
          );
          if (hit) {
            hit.emailBounced = true;
            hit.bouncedAt    = new Date().toISOString();
            addLeadHistory(leads, hit.id, { event: 'bounced', label: `Email gebounced — ongeldig adres (${failedEmail})` });
            addActivity('bounce', `Bounce: ${hit.companyName}`, { meta: { companyName: hit.companyName, leadId: hit.id, email: failedEmail } });
            addNotification('email_bounced', `Bounce: ${hit.companyName}`, `Email naar ${failedEmail} is niet aangekomen`, hit.id);
            bouncesFound++;
            console.log(`[Reply] Bounce gedetecteerd voor ${hit.companyName} (${failedEmail})`);
            break;
          }
        }
      }
    } catch (bounceErr) {
      console.warn('[Reply] Bounce check overgeslagen:', bounceErr.message);
    }

    connection.end();

    if (repliesFound > 0 || bouncesFound > 0) {
      writeJSON('leads.json', leads);
    }
    if (repliesFound > 0) {
      writeJSON('stats.json', {
        ...stats,
        replies: (stats.replies || 0) + repliesFound,
        newReplies: [...(stats.newReplies || []), ...newNames]
      });
    }

    // Generate AI reply drafts after saving (fire-and-forget per lead, errors don't break reply count)
    for (const { lead, replyText } of aiReplyQueue) {
      try {
        const freshLeads = readJSON('leads.json') || [];
        const freshLead  = freshLeads.find(l => l.id === lead.id) || lead;
        await generateAndQueueAiReply(freshLead, replyText, settings);
      } catch (err) {
        console.warn(`[AiReply] Mislukt voor ${lead.companyName}:`, err.message);
      }
    }

    console.log(`[Reply] Check klaar: ${repliesFound} replies, ${bouncesFound} bounces`);
    return repliesFound;
  } catch (err) {
    console.error('[Reply check] Fout:', err.message);
    if (connection) try { connection.end(); } catch {}
    return 0;
  }
}

app.post('/api/check-replies', async (req, res) => {
  try {
    const found = await checkReplies();
    res.json({ ok: true, found });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/run', requireAdmin, async (req, res) => {
  try {
    const filename = await runDailyBackup(true);
    res.json({ ok: true, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/list', (req, res) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return res.json({ backups: [] });
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
      .sort().reverse()
      .slice(0, 10)
      .map(f => {
        const stat = fs.statSync(path.join(BACKUP_DIR, f));
        return { filename: f, size: stat.size, createdAt: stat.birthtime };
      });
    res.json({ backups: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run templates ─────────────────────────────────────────────────────────────

app.get('/api/run-templates', (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  res.json({ templates });
});

app.post('/api/run-templates', (req, res) => {
  const { name, niches, count, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Naam verplicht' });
  const templates = readJSON('run-templates.json') || [];
  const tmpl = {
    id:        Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    name:      name.trim(),
    niches:    Array.isArray(niches) ? niches : (niches ? niches.split(',').map(n => n.trim()).filter(Boolean) : []),
    count:     parseInt(count) || 10,
    location:  (location || '').trim(),
    createdAt: new Date().toISOString()
  };
  templates.push(tmpl);
  writeJSON('run-templates.json', templates);
  res.json({ ok: true, template: tmpl });
});

app.delete('/api/run-templates/:id', (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  const updated = templates.filter(t => t.id !== req.params.id);
  writeJSON('run-templates.json', updated);
  res.json({ ok: true });
});

app.post('/api/run-templates/:id/run', async (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  const tmpl = templates.find(t => t.id === req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Sjabloon niet gevonden' });
  try {
    const found = await runFindLeadsJob({ count: tmpl.count, niches: tmpl.niches, location: tmpl.location });
    res.json({ ok: true, found });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Run templates ─────────────────────────────────────────────────────────────

app.get('/api/run-templates', (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  res.json({ templates });
});

app.post('/api/run-templates', (req, res) => {
  const { name, niches, count, location } = req.body;
  if (!name) return res.status(400).json({ error: 'Naam verplicht' });
  const templates = readJSON('run-templates.json') || [];
  const tmpl = {
    id:        Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    name:      name.trim(),
    niches:    Array.isArray(niches) ? niches : (niches ? niches.split(',').map(n => n.trim()).filter(Boolean) : []),
    count:     parseInt(count) || 10,
    location:  (location || '').trim(),
    createdAt: new Date().toISOString()
  };
  templates.push(tmpl);
  writeJSON('run-templates.json', templates);
  res.json({ ok: true, template: tmpl });
});

app.delete('/api/run-templates/:id', (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  const updated = templates.filter(t => t.id !== req.params.id);
  writeJSON('run-templates.json', updated);
  res.json({ ok: true });
});

app.post('/api/run-templates/:id/run', async (req, res) => {
  const templates = readJSON('run-templates.json') || [];
  const tmpl = templates.find(t => t.id === req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Sjabloon niet gevonden' });
  try {
    const found = await runFindLeadsJob({ count: tmpl.count, niches: tmpl.niches, location: tmpl.location });
    res.json({ ok: true, found });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/replies/new', (req, res) => {
  const stats = readJSON('stats.json') || {};
  const newReplies = stats.newReplies || [];
  if (newReplies.length > 0) {
    writeJSON('stats.json', { ...stats, newReplies: [] });
  }
  res.json({ newReplies });
});

// ── Test scraper endpoint ──────────────────────────────────────────────────────
app.get('/api/test-scrape', requireAdmin, async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'url query param required' });
  try {
    const { default: fetch } = await import('node-fetch');
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8'
    };
    const r = await fetch(url, { timeout: 10000, headers });
    const html = await r.text();
    const allEmails = html.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g) || [];
    const mailtoEmails = [...html.matchAll(/href=["']mailto:([^"'?\s]+)/gi)].map(m => m[1]);

    // MX check for each unique email domain
    const domains = [...new Set(allEmails.map(e => e.split('@')[1]))];
    const mxResults = {};
    for (const d of domains.slice(0, 5)) {
      try {
        const mx = await dnsPromises.resolveMx(d);
        mxResults[d] = { records: mx.length, valid: mx.length > 0 };
      } catch (e) {
        mxResults[d] = { error: e.code || e.message };
      }
    }

    res.json({
      url,
      status: r.status,
      htmlLength: html.length,
      mailtoEmails,
      allEmailsFound: [...new Set(allEmails)],
      mxCheck: mxResults
    });
  } catch (err) {
    res.json({ url, error: err.message });
  }
});

app.get('/api/activity', requireAdmin, (req, res) => {
  try {
    const logFile = path.join(DATA_DIR, 'activity.json');
    if (!fs.existsSync(logFile)) return res.json({ activity: [] });
    const raw = fs.readFileSync(logFile, 'utf8').replace(/^\uFEFF/, '');
    const log = JSON.parse(raw);
    const limit = parseInt(req.query.limit) || 100;
    res.json({ activity: log.slice(0, limit) });
  } catch { res.json({ activity: [] }); }
});

app.get('/api/stats/costs', (req, res) => {
  const stats   = readJSON('stats.json') || {};
  const logFile = path.join(DATA_DIR, 'activity.json');
  let log = [];
  try {
    if (fs.existsSync(logFile)) log = JSON.parse(fs.readFileSync(logFile, 'utf8').replace(/^\uFEFF/, ''));
  } catch { log = []; }
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

// ─── A/B email stats ──────────────────────────────────────────────────────────

app.get('/api/stats/ab', authMiddleware, (req, res) => {
  const leads = (readJSON('leads.json') || []).filter(l => l.sentVersion);
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

app.get('/api/stats/pnl', authMiddleware, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const logFile = path.join(DATA_DIR, 'activity.json');
  let activityLog = [];
  try {
    if (fs.existsSync(logFile)) activityLog = JSON.parse(fs.readFileSync(logFile, 'utf8').replace(/^﻿/, ''));
  } catch { activityLog = []; }

  const USD_TO_EUR = 0.92;
  const buckets = {};
  const getM = key => { if (!buckets[key]) buckets[key] = { revenue: 0, costs: 0 }; return buckets[key]; };

  leads.forEach(lead => {
    (lead.payments || []).forEach(pay => {
      if (pay.status === 'paid' && pay.paidAt) {
        getM(pay.paidAt.slice(0, 7)).revenue += pay.amount || 0;
      }
    });
  });

  activityLog.forEach(entry => {
    if (entry.costUsd && entry.timestamp) {
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
    const costs   = Math.round(b.costs   * 100) / 100;
    months.push({ month: key, revenue, costs, profit: Math.round((revenue - costs) * 100) / 100 });
  }

  const totalRevenue = Math.round(months.reduce((s, m) => s + m.revenue, 0) * 100) / 100;
  const totalCosts   = Math.round(months.reduce((s, m) => s + m.costs,   0) * 100) / 100;
  const totalProfit  = Math.round((totalRevenue - totalCosts) * 100) / 100;
  const margin       = totalRevenue > 0 ? Math.round(totalProfit / totalRevenue * 100) : 0;

  res.json({ months, totalRevenue, totalCosts, totalProfit, margin });
});

app.get('/api/ai/rate-status', authMiddleware, (req, res) => {
  const settings   = readJSON('settings.json') || {};
  const lim        = settings.aiRateLimits || {};
  const now        = Date.now();
  while (_aiCallLog.length && _aiCallLog[0].ts < now - 86400000) _aiCallLog.shift();
  const callsLastMinute = _aiCallLog.filter(e => e.ts >= now - 60000).length;
  const callsLastHour   = _aiCallLog.filter(e => e.ts >= now - 3600000).length;
  const callsLastDay    = _aiCallLog.length;

  const logFile = path.join(DATA_DIR, 'activity.json');
  const today   = new Date().toISOString().slice(0, 10);
  let costLastDay = 0;
  try {
    if (fs.existsSync(logFile)) {
      const log = JSON.parse(fs.readFileSync(logFile, 'utf8').replace(/^﻿/, ''));
      costLastDay = log.filter(e => e.timestamp?.startsWith(today)).reduce((s, e) => s + (e.costUsd || 0), 0);
    }
  } catch {}

  const limits = {
    maxCallsPerMinute: lim.maxCallsPerMinute || 10,
    maxCallsPerHour:   lim.maxCallsPerHour   || 100,
    maxCallsPerDay:    lim.maxCallsPerDay    || 500,
    maxDailyCostUsd:   typeof lim.maxDailyCostUsd === 'number' ? lim.maxDailyCostUsd : 10.0
  };
  res.json({ callsLastMinute, callsLastHour, callsLastDay, costLastDay: Math.round(costLastDay * 10000) / 10000, limits });
});

// ─── Chrome Extension compact data ───────────────────────────────────────────

app.get('/api/extension/data', authMiddleware, (req, res) => {
  const inbox  = readJSON('inbox.json') || [];
  const leads  = readJSON('leads.json') || [];
  const stats  = readJSON('stats.json') || {};
  const pending = inbox.filter(i => !i.sentAt && !i.disapprovedAt).slice(0, 20).map(i => ({
    id: i.id, companyName: i.companyName, niche: i.niche, score: i.score,
    location: i.location, emailSubject: i.emailA?.subject || i.emailSubject || '',
    estimatedValue: i.estimatedValue, createdAt: i.createdAt, subNiche: i.subNiche || ''
  }));
  const recentLeads = leads.slice(0, 5).map(l => ({
    id: l.id, companyName: l.companyName, status: l.status, score: l.score, niche: l.niche
  }));
  res.json({
    pending,
    pendingCount: pending.length,
    totalLeads: leads.length,
    clientCount: leads.filter(l => l.status === 'client').length,
    pipelineValue: stats.pipelineValue || 0,
    recentLeads,
    serverVersion: '1.0'
  });
});

app.get('/api/memory', (req, res) => {
  res.json(readJSON('memory.json') || {});
});

// ─── Team chat ────────────────────────────────────────────────────────────────

function seedChatChannels() {
  if (!readJSON('chat-channels.json')) {
    writeJSON('chat-channels.json', [
      { id: '1', name: 'algemeen',  description: 'Algemeen teamkanaal', createdAt: new Date().toISOString() },
      { id: '2', name: 'leads',     description: 'Lead discussies',     createdAt: new Date().toISOString() },
      { id: '3', name: 'intern',    description: 'Intern overleg',       createdAt: new Date().toISOString() }
    ]);
  }
  if (!readJSON('chat-messages.json')) writeJSON('chat-messages.json', []);
}
seedChatChannels();

app.get('/api/chat/channels', (req, res) => {
  const channels = readJSON('chat-channels.json') || [];
  const messages = readJSON('chat-messages.json') || [];
  // attach last message + unread count per channel
  const result = channels.map(ch => {
    const msgs = messages.filter(m => m.channelId === ch.id);
    const last = msgs[msgs.length - 1] || null;
    return { ...ch, messageCount: msgs.length, lastMessage: last ? { text: last.text, name: last.name, createdAt: last.createdAt } : null };
  });
  res.json(result);
});

app.post('/api/chat/channels', requireAdmin, (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'name verplicht' });
  const channels = readJSON('chat-channels.json') || [];
  const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (channels.find(c => c.name === slug)) return res.status(409).json({ error: 'Kanaal bestaat al' });
  const ch = { id: Date.now().toString(), name: slug, description: description || '', createdAt: new Date().toISOString() };
  channels.push(ch);
  writeJSON('chat-channels.json', channels);
  res.json(ch);
});

app.delete('/api/chat/channels/:id', requireAdmin, (req, res) => {
  const channels = readJSON('chat-channels.json') || [];
  if (!channels.find(c => c.id === req.params.id)) return res.status(404).json({ error: 'Kanaal niet gevonden' });
  writeJSON('chat-channels.json', channels.filter(c => c.id !== req.params.id));
  const msgs = readJSON('chat-messages.json') || [];
  writeJSON('chat-messages.json', msgs.filter(m => m.channelId !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/chat/channels/:id/messages', (req, res) => {
  const messages = readJSON('chat-messages.json') || [];
  const { since, limit = 100 } = req.query;
  let msgs = messages.filter(m => m.channelId === req.params.id);
  if (since) msgs = msgs.filter(m => m.createdAt > since);
  res.json(msgs.slice(-Number(limit)));
});

app.post('/api/chat/channels/:id/messages', (req, res) => {
  const channels = readJSON('chat-channels.json') || [];
  if (!channels.find(c => c.id === req.params.id)) return res.status(404).json({ error: 'Kanaal niet gevonden' });
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Bericht verplicht' });
  const msg = {
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    channelId: req.params.id,
    userId: req.user.id,
    username: req.user.username,
    name: req.user.name || req.user.username,
    role: req.user.role,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  const messages = readJSON('chat-messages.json') || [];
  messages.push(msg);
  // Keep max 2000 messages per channel to prevent unbounded growth
  const channelMsgs = messages.filter(m => m.channelId === req.params.id);
  if (channelMsgs.length > 2000) {
    const oldestIds = new Set(channelMsgs.slice(0, channelMsgs.length - 2000).map(m => m.id));
    writeJSON('chat-messages.json', messages.filter(m => !oldestIds.has(m.id)));
  } else {
    writeJSON('chat-messages.json', messages);
  }
  res.json(msg);
});

app.delete('/api/chat/messages/:id', (req, res) => {
  const messages = readJSON('chat-messages.json') || [];
  const msg = messages.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Bericht niet gevonden' });
  if (msg.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Geen toegang' });
  writeJSON('chat-messages.json', messages.filter(m => m.id !== req.params.id));
  res.json({ ok: true });
});

// ─── Users management ─────────────────────────────────────────────────────────

app.get('/api/users', requireAdmin, (req, res) => {
  const users = (readJSON('users.json') || []).map(u => ({ id: u.id, username: u.username, name: u.name, role: u.role, createdAt: u.createdAt }));
  res.json(users);
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name) return res.status(400).json({ error: 'username, password en name verplicht' });
  if (!['admin', 'employee'].includes(role)) return res.status(400).json({ error: 'Ongeldig role (admin of employee)' });
  const users = readJSON('users.json') || [];
  if (users.find(u => u.username === username)) return res.status(409).json({ error: 'Gebruikersnaam al in gebruik' });
  const newUser = { id: Date.now().toString(), username, password: await bcrypt.hash(password, 12), name, role, createdAt: new Date().toISOString() };
  users.push(newUser);
  writeJSON('users.json', users);
  res.json({ ok: true, id: newUser.id });
});

app.patch('/api/users/:id', requireAdmin, async (req, res) => {
  const users = readJSON('users.json') || [];
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  const { name, role, password } = req.body;
  if (name) users[idx].name = name;
  if (role && ['admin', 'employee'].includes(role)) users[idx].role = role;
  if (password) users[idx].password = await bcrypt.hash(password, 12);
  writeJSON('users.json', users);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const users = readJSON('users.json') || [];
  if (users.find(u => u.id === req.params.id)?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) {
    return res.status(400).json({ error: 'Kan de laatste admin niet verwijderen' });
  }
  writeJSON('users.json', users.filter(u => u.id !== req.params.id));
  res.json({ ok: true });
});

// ── Blacklist ──────────────────────────────────────────────────────────────────
app.get('/api/blacklist', (req, res) => {
  res.json(readJSON('blacklist.json') || []);
});

app.post('/api/blacklist', requireAdmin, (req, res) => {
  const { type, value, reason } = req.body || {};
  if (!type || !value) return res.status(400).json({ error: 'type en value verplicht' });
  const list = readJSON('blacklist.json') || [];
  const entry = { id: 'bl-' + Date.now(), type, value: value.trim().toLowerCase(), reason: reason || '', addedAt: new Date().toISOString() };
  list.unshift(entry);
  writeJSON('blacklist.json', list);
  res.json({ ok: true, entry });
});

app.delete('/api/blacklist/:id', requireAdmin, (req, res) => {
  let list = readJSON('blacklist.json') || [];
  list = list.filter(e => e.id !== req.params.id);
  writeJSON('blacklist.json', list);
  res.json({ ok: true });
});

app.post('/api/leads/:id/blacklist', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  const list = readJSON('blacklist.json') || [];
  const entries = [];
  if (lead.companyName) {
    const e = { id: 'bl-' + Date.now(), type: 'company', value: lead.companyName.trim().toLowerCase(), reason: req.body?.reason || 'Geblacklist via lead panel', addedAt: new Date().toISOString() };
    list.unshift(e);
    entries.push(e);
  }
  if (lead.websiteUrl) {
    const domain = lead.websiteUrl.replace(/^https?:\/\//,'').split('/')[0].toLowerCase();
    if (domain) {
      const e = { id: 'bl-' + (Date.now()+1), type: 'domain', value: domain, reason: req.body?.reason || 'Geblacklist via lead panel', addedAt: new Date().toISOString() };
      list.unshift(e);
      entries.push(e);
    }
  }
  writeJSON('blacklist.json', list);
  res.json({ ok: true, entries });
});

// â"€â"€â"€ Cron scheduler â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€


// ── Daily Briefing ──────────────────────────────────────────────────────────

async function sendDailyBriefing() {
  const settings = readJSON('settings.json');
  if (settings.dailyBriefingEnabled === false) return;
  if (!isGmailReady(settings)) return;

  const inbox  = readJSON('inbox.json') || [];
  const leads  = readJSON('leads.json') || [];
  const stats  = readJSON('stats.json') || {};

  const pending = inbox.filter(i => i.status === 'pending');
  const top3    = [...leads]
    .filter(l => l.score)
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 3);

  const repliesSince  = leads.filter(l => l.repliedAt).length;
  const sentYesterday = (stats.weeklyData || []).slice(-1)[0]?.sent || 0;
  const pipelineValue = stats.pipelineValue || 0;
  const briefingDate  = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });

  let motivationalLine = 'Blijf gefocust — elke email is een stap dichter bij de volgende klant.';
  try {
    const raw = await aiCall('Genereer 1 motiverende zin in het Nederlands (max 20 woorden, geen cliches) voor een sales agent met ' + pending.length + ' leads in inbox, ' + repliesSince + ' reacties totaal en pipeline waarde EUR ' + pipelineValue + '. Geef alleen de zin.');
    motivationalLine = raw.trim();
  } catch { /* keep default */ }

  const top3Rows = top3.map(l =>
    '<tr><td style="padding:8px 12px;font-size:14px;font-weight:600">' + l.companyName + '</td>' +
    '<td style="padding:8px 12px;font-size:13px;color:#6b7280">' + (l.niche || '—') + '</td>' +
    '<td style="padding:8px 12px;font-size:13px;color:#6b7280">' + (l.country || '—') + '</td>' +
    '<td style="padding:8px 12px;font-size:14px;font-weight:700;color:#6366f1">' + (l.score || 0).toFixed(1) + '</td></tr>'
  ).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
  '<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f9fafb;margin:0;padding:32px 16px">' +
  '<div style="max-width:560px;margin:0 auto">' +
  '<div style="font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px">Agency AI</div>' +
  '<h1 style="font-size:22px;font-weight:800;color:#111;margin:0 0 4px">Dagelijkse update</h1>' +
  '<div style="font-size:14px;color:#6b7280;margin-bottom:24px">' + briefingDate + '</div>' +
  '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:14px">' +
  '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
  '<div style="background:#f9fafb;border-radius:8px;padding:14px"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Te beoordelen</div><div style="font-size:26px;font-weight:800;color:#111">' + pending.length + '</div></div>' +
  '<div style="background:#f9fafb;border-radius:8px;padding:14px"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Totaal reacties</div><div style="font-size:26px;font-weight:800;color:#10b981">' + repliesSince + '</div></div>' +
  '<div style="background:#f9fafb;border-radius:8px;padding:14px"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Emails gisteren</div><div style="font-size:26px;font-weight:800;color:#6366f1">' + sentYesterday + '</div></div>' +
  '<div style="background:#f9fafb;border-radius:8px;padding:14px"><div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px">Pipeline waarde</div><div style="font-size:26px;font-weight:800;color:#111">&#8364;' + Math.round(pipelineValue / 1000) + 'K</div></div>' +
  '</div></div>' +
  (top3.length ? '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:14px"><div style="font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:14px">Top 3 leads vandaag</div><table style="width:100%;border-collapse:collapse"><thead><tr style="border-bottom:1px solid #f3f4f6"><th style="text-align:left;padding:6px 12px;font-size:11px;color:#9ca3af;font-weight:600">Bedrijf</th><th style="text-align:left;padding:6px 12px;font-size:11px;color:#9ca3af;font-weight:600">Niche</th><th style="text-align:left;padding:6px 12px;font-size:11px;color:#9ca3af;font-weight:600">Land</th><th style="text-align:left;padding:6px 12px;font-size:11px;color:#9ca3af;font-weight:600">Score</th></tr></thead><tbody>' + top3Rows + '</tbody></table></div>' : '') +
  '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px;font-size:14px;color:#166534;font-style:italic">&ldquo;' + motivationalLine + '&rdquo;</div>' +
  '<div style="margin-top:20px;font-size:12px;color:#9ca3af;text-align:center">Agency AI &mdash; automatisch verstuurd om ' + (settings.dailyBriefingTime || '08:45') + '</div>' +
  '</div></body></html>';

  try {
    await sendEmail({
      to: settings.gmailAddress,
      subject: 'Agency AI — Dagelijkse update ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }),
      body: '',
      html,
      settings
    });
    console.log('[Briefing] Dagelijkse briefing verstuurd');
  } catch (err) {
    console.error('[Briefing] Fout:', err.message);
  }
}


// ── Upsell detector ─────────────────────────────────────────────────────────

async function runUpsellCheck() {
  const settings = readJSON('settings.json');
  const leads    = readJSON('leads.json') || [];
  const stats    = readJSON('stats.json') || {};
  const allServices = settings.services || [];

  const clients = leads.filter(l => l.status === 'client' && l.createdAt);
  const now = Date.now();
  const opportunities = [];

  for (const client of clients) {
    const daysSince = Math.floor((now - new Date(client.createdAt).getTime()) / 86400000);
    if (daysSince < 30) continue;

    const clientServiceNames = (client.services || []).map(s => s.name.toLowerCase());
    const missing = allServices.filter(s => !clientServiceNames.some(n => n === s.name.toLowerCase()));
    if (missing.length < 2) continue;

    // Pick the highest-value missing service
    const topUpsell = missing.sort((a, b) => (b.price || 0) - (a.price || 0))[0];
    const currentService = (client.services || [])[0]?.name || 'huidige dienst';

    opportunities.push({
      leadId: client.id,
      companyName: client.companyName,
      niche: client.niche,
      location: client.location,
      language: client.language || 'nl',
      currentService,
      upsellService: topUpsell.name,
      upsellPrice: topUpsell.price,
      upsellDescription: topUpsell.description || '',
      clientEmail: client.email?.to || null,
      daysSince
    });
  }

  stats.upsellOpportunities = opportunities;
  writeJSON('stats.json', stats);
  console.log('[Upsell] ' + opportunities.length + ' kansen gevonden');
  return opportunities;
}


// ── Monthly report generator ─────────────────────────────────────────────────

async function runMonthlyReports() {
  const settings = readJSON('settings.json');
  if (settings.monthlyReports === false) return;

  const leads = readJSON('leads.json') || [];
  const myName     = settings.myName     || 'Ekow';
  const agencyName = settings.agencyName || 'Agency AI';
  const clients = leads.filter(l => l.status === 'client');
  if (!clients.length) return;

  const now       = new Date();
  const monthName = now.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' });
  let changed = false;

  for (const client of clients) {
    const service     = (client.services || [])[0]?.name || 'AI-marketingdienst';
    const daysSince   = Math.floor((now - new Date(client.createdAt || now).getTime()) / 86400000);
    const monthsActive = Math.max(1, Math.floor(daysSince / 30));
    const lang        = client.language || 'nl';

    let reportContent = '';
    try {
      const prompt = lang === 'nl'
        ? 'Schrijf een professioneel maar bondig maandrapport voor een klant. Klinkt realistisch en positief. Max 200 woorden in het Nederlands.\n\nKlant: ' + client.companyName + ' (' + client.niche + ', ' + client.location + ')\nDienst: ' + service + '\nActief: ' + monthsActive + ' maand(en)\nMaand: ' + monthName + '\n\nStructuur:\n- Samenvatting prestaties (realistische positieve getallen voor ' + service + ')\n- Uitgevoerde werkzaamheden\n- Aanbeveling voor volgende maand\n\nGeef alleen de rapporttekst.'
        : 'Write a professional but concise monthly report for a client. Sounds realistic and positive. Max 200 words in English.\n\nClient: ' + client.companyName + ' (' + client.niche + ', ' + client.location + ')\nService: ' + service + '\nActive: ' + monthsActive + ' month(s)\nMonth: ' + monthName + '\n\nStructure:\n- Performance summary (realistic positive numbers for ' + service + ')\n- Work completed\n- Recommendation for next month\n\nReturn only the report text.';
      reportContent = (await aiCall(prompt)).trim();
    } catch {
      reportContent = lang === 'nl'
        ? 'Dit rapport is automatisch gegenereerd voor ' + monthName + '.\n\nDienst: ' + service + '\nStatus: Actief en op schema.\n\nVoor vragen kunt u contact opnemen via het portaal.'
        : 'This report was automatically generated for ' + monthName + '.\n\nService: ' + service + '\nStatus: Active and on track.\n\nFor questions, please use the portal contact form.';
    }

    const report = {
      id: 'rep-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      month: monthName,
      createdAt: now.toISOString(),
      title: (lang === 'nl' ? 'Maandrapport ' : 'Monthly Report ') + monthName,
      content: reportContent
    };

    const idx = leads.findIndex(l => l.id === client.id);
    if (idx !== -1) {
      if (!leads[idx].reports) leads[idx].reports = [];
      leads[idx].reports.unshift(report);
      changed = true;
    }

    // Email notification if portal exists
    if (client.portalToken && isGmailReady(settings)) {
      try {
        const portalUrl = 'http://localhost:' + (process.env.PORT || 3000) + '/portal/' + client.portalToken;
        const subject = lang === 'nl'
          ? agencyName + ' — Uw maandrapport voor ' + monthName + ' staat klaar'
          : agencyName + ' — Your monthly report for ' + monthName + ' is ready';
        const body = lang === 'nl'
          ? 'Beste ' + client.companyName + ',\n\nUw maandrapport voor ' + monthName + ' staat klaar in uw portaal.\n\nBekijk het hier: ' + portalUrl + '\n\nMet vriendelijke groet,\n' + myName
          : 'Dear ' + client.companyName + ',\n\nYour monthly report for ' + monthName + ' is ready in your portal.\n\nView it here: ' + portalUrl + '\n\nBest regards,\n' + myName;
        await sendEmail({ to: settings.gmailAddress, subject, body, settings });
      } catch { /* skip */ }
    }
  }

  if (changed) {
    writeJSON('leads.json', leads);
    console.log('[Maandrapport] Rapporten gegenereerd voor ' + clients.length + ' klant(en)');
  }
}


// ── Referral module ──────────────────────────────────────────────────────────

async function runReferralCheck() {
  const settings   = readJSON('settings.json');
  const leads      = readJSON('leads.json') || [];
  const inbox      = readJSON('inbox.json') || [];
  const myName     = settings.myName     || 'Ekow';
  const agencyName = settings.agencyName || 'Agency AI';
  const now        = Date.now();
  let changed = false;

  const clients = leads.filter(l =>
    l.status === 'client' &&
    !l.referralEmailSent &&
    !l.referralPending &&
    !inbox.some(i => i.leadId === l.id && i.type === 'referral') &&
    l.createdAt &&
    Math.floor((now - new Date(l.createdAt).getTime()) / 86400000) >= 90
  );

  for (const client of clients) {
    const lang    = client.language || 'nl';
    const service = (client.services || [])[0]?.name || 'AI-marketing';
    const daysSince = Math.floor((now - new Date(client.createdAt).getTime()) / 86400000);

    let email = null;
    try {
      const prompt = lang === 'nl'
        ? 'Schrijf een warme referral-verzoek email voor een tevreden klant. Klinkt persoonlijk, niet als een template. Geef JSON terug.\n\nKlant: ' + client.companyName + ' (' + client.niche + ', ' + client.location + ')\nDienst: ' + service + '\nActief: ' + daysSince + ' dagen\nAfzender: ' + myName + ' van ' + agencyName + '\nDatum vandaag: ' + new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) + '\n\nRegels:\n- Refereer positief aan hun samenwerking en resultaten\n- Vraag vriendelijk of ze iemand kennen die ook baat zou hebben\n- NIET pusherig of salesy\n- Max 100 woorden\n- Geen bullet points\n- Einde met zachte vraag\n- Afsluiting: "Groeten, ' + myName + '"\n\n{"subject": "onderwerp", "body": "emailtekst"}'
        : 'Write a warm referral request email for a happy client. Sounds personal, not like a template. Return JSON.\n\nClient: ' + client.companyName + ' (' + client.niche + ', ' + client.location + ')\nService: ' + service + '\nActive: ' + daysSince + ' days\nSender: ' + myName + ' from ' + agencyName + '\n\nRules:\n- Reference their positive collaboration and results\n- Warmly ask if they know anyone who could benefit\n- NOT pushy or salesy\n- Max 100 words\n- No bullet points\n- End with a soft question\n- Sign off: "Best, ' + myName + '"\n\n{"subject": "subject", "body": "email body"}';
      email = await aiJSON(prompt);
    } catch {
      email = lang === 'nl'
        ? { subject: 'Kort vraagje – ' + client.companyName, body: 'Beste ' + client.companyName + ',\n\nWe werken nu al ' + Math.floor(daysSince / 30) + ' maanden samen en ik hoop dat u tevreden bent met de behaalde resultaten.\n\nKent u iemand in uw netwerk die ook baat zou kunnen hebben bij onze aanpak? Een warme introductie wordt zeer gewaardeerd.\n\nMet vriendelijke groet,\n' + myName }
        : { subject: 'Quick question – ' + client.companyName, body: 'Dear ' + client.companyName + ',\n\nWe have been working together for ' + Math.floor(daysSince / 30) + ' months now and I hope you are satisfied with the results so far.\n\nDo you know anyone in your network who could benefit from what we do? A warm introduction would be greatly appreciated.\n\nKind regards,\n' + myName };
    }

    const id = 'ref-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5);
    inbox.push({
      id, leadId: client.id, status: 'pending', type: 'referral',
      companyName: client.companyName, location: client.location, country: client.country,
      language: lang, niche: client.niche,
      score: client.score || 0,
      email, emailA: email, emailB: null,
      createdAt: new Date().toISOString()
    });

    const idx = leads.findIndex(l => l.id === client.id);
    if (idx !== -1) {
      leads[idx].referralPending = true;
      addLeadHistory(leads, client.id, { event: 'referral', label: 'Referral email gegenereerd en klaar voor goedkeuring' });
    }
    changed = true;
    console.log('[Referral] Gegenereerd voor', client.companyName);
  }

  if (changed) {
    writeJSON('inbox.json', inbox);
    writeJSON('leads.json', leads);
  }
}

// ── Daily Backup ────────────────────────────────────────────────────────────

const BACKUP_DIR = path.join(DATA_DIR, 'backups');

async function runDailyBackup(manual = false) {
  const settings = readJSON('settings.json');
  if (!manual && settings.backupEnabled === false) return;

  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  const dateStr = new Date().toISOString().slice(0, 10);
  const filename = 'backup_' + dateStr + '.json';
  const filepath = path.join(BACKUP_DIR, filename);

  // Build sanitized bundle (strip credentials)
  const settingsRaw = readJSON('settings.json') || {};
  const safeSettings = { ...settingsRaw };
  delete safeSettings.password;
  delete safeSettings.gmailPassword;
  delete safeSettings.stripeSecretKey;
  delete safeSettings.webhookToken;

  const bundle = {
    exportedAt:   new Date().toISOString(),
    leads:  readJSON('leads.json')  || [],
    inbox:  readJSON('inbox.json')  || [],
    runs:   readJSON('runs.json')   || [],
    stats:  readJSON('stats.json')  || {},
    memory: readJSON('memory.json') || {},
    settings: safeSettings
  };

  fs.writeFileSync(filepath, JSON.stringify(bundle, null, 2), 'utf8');
  console.log('[Backup] Backup aangemaakt:', filename);
  addActivity('backup', 'Backup aangemaakt: ' + filename, { meta: { filename } });

  // Rotate: keep last 30 backups
  const all = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.startsWith('backup_') && f.endsWith('.json'))
    .sort();
  if (all.length > 30) {
    const toDelete = all.slice(0, all.length - 30);
    toDelete.forEach(f => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, f)); } catch {}
    });
    console.log('[Backup] Rotatie: ' + toDelete.length + ' oude backup(s) verwijderd');
  }

  // Email backup via Resend if configured
  const resendKey = settings.resendApiKey || process.env.RESEND_API_KEY;
  if (settings.backupEmail !== false && resendKey) {
    try {
      const toAddr   = settings.gmailAddress || process.env.GMAIL_ADDRESS || (settings.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info');
      const fromAddr = settings.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info';
      const { default: fetch } = await import('node-fetch');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `"${settings.agencyName || 'Agency AI'}" <${fromAddr}>`,
          to: toAddr,
          subject: 'Agency AI Backup — ' + dateStr,
          html: '<div style="font-family:sans-serif;padding:24px"><h2 style="margin:0 0 12px;font-size:18px">Agency AI — Dagelijkse backup</h2><p style="color:#6b7280;font-size:14px">Automatische backup van ' + dateStr + '.</p><p style="font-size:12px;color:#9ca3af;margin-top:24px">Bevat: leads, inbox, runs, stats, memory en instellingen (zonder wachtwoorden).</p><p><em>Bijlage: ' + filename + '</em></p></div>',
          attachments: [{ filename, content: Buffer.from(JSON.stringify(bundle, null, 2)).toString('base64') }]
        })
      });
      if (r.ok) console.log('[Backup] Backup email verstuurd naar', toAddr);
      else console.error('[Backup] Resend fout:', (await r.json()).message);
    } catch (err) {
      console.error('[Backup] Email fout:', err.message);
    }
  }

  return filename;
}

let backupCronJob = null;

function scheduleBackupCron() {
  const settings = readJSON('settings.json');
  if (settings.backupEnabled === false) {
    if (backupCronJob) { backupCronJob.stop(); backupCronJob = null; }
    return;
  }
  const time = settings.backupTime || '02:00';
  const [h, m] = time.split(':').map(Number);
  if (backupCronJob) backupCronJob.stop();
  backupCronJob = cron.schedule(m + ' ' + h + ' * * *', () => {
    console.log('[Cron] Dagelijkse backup gestart');
    runDailyBackup().catch(err => console.error('[Cron Backup] Fout:', err.message));
  });
  console.log('[Cron] Dagelijkse backup ingepland om ' + time);
}

let cronJob = null;

function scheduleCron() {
  const settings = readJSON('settings.json');
  const time = settings.dailyRunTime || '09:00';
  const [hour, minute] = time.split(':').map(Number);
  const schedule = `${minute} ${hour} * * *`;

  if (cronJob) cronJob.stop();
  cronJob = cron.schedule(schedule, () => {
    console.log(`[Cron] Dagelijkse run gestart om ${time}`);
    runFindLeadsJob().catch(err => logError('cron_run', 'Dagelijkse run mislukt', err.message));
  });
  console.log(`[Cron] Dagelijkse run ingepland om ${time} (${schedule})`);
}

// Follow-up cron: daily at 10:00
cron.schedule('0 10 * * *', () => {
  console.log('[Cron] Follow-up check gestart');
  runFollowUpJob().catch(err => logError('cron_followup', 'Follow-up cron mislukt', err.message));
});

let briefingCronJob = null;

function scheduleBriefingCron() {
  const settings = readJSON('settings.json');
  const time = settings.dailyBriefingTime || '08:45';
  const [h, m] = time.split(':').map(Number);
  if (briefingCronJob) briefingCronJob.stop();
  briefingCronJob = cron.schedule(m + ' ' + h + ' * * *', () => {
    console.log('[Cron] Dagelijkse briefing gestart');
    sendDailyBriefing().catch(err => console.error('[Cron Briefing] Fout:', err.message));
  });
  console.log('[Cron] Dagelijkse briefing ingepland om ' + time);
}

// Upsell check cron: daily at 11:00
cron.schedule('0 11 * * *', () => {
  console.log('[Cron] Upsell check gestart');
  runUpsellCheck().catch(err => console.error('[Cron Upsell] Fout:', err.message));
});

// Monthly report cron: 1st of every month at 09:00
cron.schedule('0 9 1 * *', () => {
  console.log('[Cron] Maandrapport generatie gestart');
  runMonthlyReports().catch(err => console.error('[Cron Maandrapport] Fout:', err.message));
});

// Referral check cron: daily at 12:00
cron.schedule('0 12 * * *', () => {
  console.log('[Cron] Referral check gestart');
  runReferralCheck().catch(err => console.error('[Cron Referral] Fout:', err.message));
});

// Reply detection cron: every 2 hours (skipped when real-time webhook is active)
cron.schedule('0 */2 * * *', () => {
  const s = readJSON('settings.json') || {};
  if (s.webhookConfigured) {
    console.log('[Cron] Reply check overgeslagen — webhook is actief');
    return;
  }
  console.log('[Cron] Reply check gestart');
  checkReplies().catch(err => console.error('[Cron Reply] Fout:', err.message));
});

// Scheduled send cron: every minute
cron.schedule('* * * * *', async () => {
  const inbox = readJSON('inbox.json') || [];
  const now = new Date();
  const due = inbox.filter(i => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt) <= now);
  if (!due.length) return;

  const settings = readJSON('settings.json');
  if (!isGmailReady(settings)) return;

  const leads = readJSON('leads.json') || [];
  let changed = false;

  for (const item of due) {
    const version = item.sentVersion || 'A';
    const chosenEmail = version === 'B' ? item.emailB : (item.emailA || item.email);
    const idx = inbox.findIndex(i => i.id === item.id);
    try {
      const scheduledToken = item.trackingToken || ('otk-' + item.leadId + '-' + Math.random().toString(36).substr(2, 8));
      if (!item.trackingToken) inbox[idx].trackingToken = scheduledToken;
      await sendEmail({
        to: settings.gmailAddress,
        subject: chosenEmail?.subject || item.email?.subject || 'Outreach email',
        body: chosenEmail?.body || item.email?.body || '',
        settings,
        trackingToken: scheduledToken
      });
      inbox[idx].status = 'sent';
      inbox[idx].sentAt = new Date().toISOString();

      const stats = readJSON('stats.json') || {};
      stats.emailsSent = (stats.emailsSent || 0) + 1;
      if (!stats.abStats) stats.abStats = { aApproved: 0, bApproved: 0 };
      stats.abStats[version === 'B' ? 'bApproved' : 'aApproved']++;
      writeJSON('stats.json', stats);

      const leadIdx = leads.findIndex(l => l.id === item.leadId);
      if (leadIdx !== -1) {
        leads[leadIdx].status = 'sent';
        leads[leadIdx].sentAt = inbox[idx].sentAt;
        addLeadHistory(leads, item.leadId, { event: 'sent', label: `Email verstuurd op ingeplande tijd (versie ${version})` });
        updateMemory(leads[leadIdx].niche, leads[leadIdx].country, 'sent');
      }
      console.log(`[Scheduled] Email verstuurd voor ${item.companyName}`);
      changed = true;
    } catch (err) {
      console.error(`[Scheduled] Fout bij ${item.companyName}:`, err.message);
    }
  }
  if (changed) {
    writeJSON('inbox.json', inbox);
    writeJSON('leads.json', leads);
  }
});

scheduleCron();
scheduleBriefingCron();
scheduleBackupCron();

// ─── Monthly auto-invoice + overdue reminder ──────────────────────────────────

cron.schedule('0 9 * * *', async () => {
  const settings = readJSON('settings.json') || {};
  const leads = readJSON('leads.json') || [];
  const today = new Date();

  // Auto-invoice: run on configured day of month
  if (settings.autoInvoiceEnabled && today.getDate() === (settings.autoInvoiceDay || 1)) {
    console.log('[Cron] Auto-factuur run gestart');
    const clients = leads.filter(l => l.status === 'client' && (l.services || []).some(s => s.billing !== 'eenmalig'));
    for (const lead of clients) {
      try {
        const monthlyServices = (lead.services || []).filter(s => s.billing !== 'eenmalig');
        const total = monthlyServices.reduce((sum, s) => sum + (s.price || 0), 0);
        if (total < 1) continue;
        const method = settings.preferredPaymentMethod || 'stripe';
        const desc = `${monthlyServices.map(s => s.name).join(', ')} — ${today.toLocaleDateString('nl-NL', {month:'long',year:'numeric'})}`;
        const url = await createPaymentLink(method, { companyName: lead.companyName, amount: total, description: desc, billing: 'eenmalig', settings });
        const freshLeads = readJSON('leads.json') || [];
        const fIdx = freshLeads.findIndex(l => l.id === lead.id);
        if (fIdx !== -1) {
          if (!freshLeads[fIdx].payments) freshLeads[fIdx].payments = [];
          freshLeads[fIdx].payments.push({ id: Date.now().toString(36), type: 'subscription', amount: total, description: desc, billing: 'eenmalig', method, paymentUrl: url, status: 'sent', dueDate: new Date(today.getTime() + 14 * 86400000).toISOString(), createdAt: new Date().toISOString() });
          addLeadHistory(freshLeads, lead.id, { event: 'autoInvoice', label: `Automatische factuur aangemaakt: €${total}` });
          writeJSON('leads.json', freshLeads);
        }
        if (lead.email && isGmailReady(settings)) {
          await sendEmail({ to: lead.email, subject: `Factuur ${today.toLocaleDateString('nl-NL', {month:'long'})} — ${settings.agencyName}`, body: `Beste ${lead.contactName || lead.companyName},\n\nHieronder de factuur voor deze maand:\n\n${desc}\nBedrag: €${total}\nBetaallink: ${url}\n\nMet vriendelijke groet,\n${settings.myName}\n${settings.agencyName}`, settings });
        }
        console.log(`[AutoInvoice] €${total} → ${lead.companyName}`);
      } catch (err) { console.error(`[AutoInvoice] Fout voor ${lead.companyName}:`, err.message); }
    }
  }

  // Overdue reminders
  const reminderDays = settings.paymentReminderDays || 7;
  const allLeads = readJSON('leads.json') || [];
  for (const lead of allLeads) {
    for (const pay of (lead.payments || [])) {
      if (pay.status !== 'sent') continue;
      const due = new Date(pay.dueDate);
      const daysOverdue = Math.floor((today - due) / 86400000);
      if (daysOverdue < reminderDays) continue;
      // Don't spam: only send if no reminder in last 7 days
      const lastReminder = pay.lastReminderAt ? new Date(pay.lastReminderAt) : null;
      if (lastReminder && (today - lastReminder) < 7 * 86400000) continue;
      if (!lead.email || !isGmailReady(settings)) continue;
      try {
        const reminderEmail = await aiJSON(`Schrijf een vriendelijke betalingsherinnering. Klant: ${lead.companyName}. Bedrag: €${pay.amount}. ${daysOverdue} dagen te laat. Betaallink: ${pay.paymentUrl}. Max 100 woorden. JSON: { "subject": "...", "body": "..." }`);
        await sendEmail({ to: lead.email, subject: reminderEmail.subject, body: reminderEmail.body, settings });
        const lIdx = allLeads.findIndex(l => l.id === lead.id);
        const pIdx = (allLeads[lIdx]?.payments || []).findIndex(p => p.id === pay.id);
        if (lIdx !== -1 && pIdx !== -1) { allLeads[lIdx].payments[pIdx].lastReminderAt = new Date().toISOString(); allLeads[lIdx].payments[pIdx].reminderCount = (allLeads[lIdx].payments[pIdx].reminderCount || 0) + 1; }
        addNotification('payment_overdue', `Betaling te laat: ${lead.companyName}`, `€${pay.amount} is ${daysOverdue} dagen te laat — herinnering verstuurd`, lead.id);
        console.log(`[Overdue] Herinnering verstuurd aan ${lead.companyName} voor €${pay.amount}`);
      } catch { /* optional */ }
    }
  }
  writeJSON('leads.json', allLeads);
});

// ─── Notifications ───────────────────────────────────────────────────────────

app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  const unread = notifications.filter(n => !n.read).length;
  res.json({ notifications: notifications.slice(0, 50), unread });
});

app.post('/api/notifications/read-all', authMiddleware, (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  notifications.forEach(n => { n.read = true; });
  writeJSON('notifications.json', notifications);
  res.json({ ok: true });
});

app.patch('/api/notifications/:id/read', authMiddleware, (req, res) => {
  const notifications = readJSON('notifications.json') || [];
  const idx = notifications.findIndex(n => n.id === req.params.id);
  if (idx !== -1) { notifications[idx].read = true; writeJSON('notifications.json', notifications); }
  res.json({ ok: true });
});

// ─── Calendly webhook (public) ───────────────────────────────────────────────
app.post('/api/webhooks/calendly', (req, res) => {
  try {
    const event = req.body?.event;
    const payload = req.body?.payload;
    if (event === 'invitee.created' && payload) {
      const inviteeName  = payload.name  || payload.first_name || 'Iemand';
      const inviteeEmail = payload.email || '';
      const eventName    = payload.event_type?.name || 'Gesprek';
      const startTime    = payload.scheduled_event?.start_time || payload.event?.start_time || '';
      const startLabel   = startTime ? new Date(startTime).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' }) : '';

      // Match to a lead by email
      const leads = readJSON('leads.json') || [];
      const lead  = leads.find(l => l.contactEmail?.toLowerCase() === inviteeEmail.toLowerCase());
      if (lead) {
        const idx = leads.findIndex(l => l.id === lead.id);
        leads[idx].calendlyBooking = { name: inviteeName, email: inviteeEmail, eventName, startTime, bookedAt: new Date().toISOString() };
        addLeadHistory(leads, lead.id, { event: 'calendlyBooked', label: `Gesprek ingepland: ${eventName}${startLabel ? ' op ' + startLabel : ''}` });
        addNotification('calendly_booking', `Gesprek ingepland: ${inviteeName}`, `${eventName}${startLabel ? ' op ' + startLabel : ''}`, lead.id);
        writeJSON('leads.json', leads);
      } else {
        addNotification('calendly_booking', `Nieuw gesprek: ${inviteeName}`, `${eventName}${startLabel ? ' op ' + startLabel : ''} (${inviteeEmail})`);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Outgoing webhooks CRUD ───────────────────────────────────────────────────

app.get('/api/webhooks', authMiddleware, (req, res) => {
  res.json(readJSON('webhooks.json') || []);
});

app.post('/api/webhooks', requireAdmin, (req, res) => {
  const { label, url, events } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL verplicht' });
  if (!Array.isArray(events) || !events.length) return res.status(400).json({ error: 'Minimaal één event verplicht' });
  const hooks = readJSON('webhooks.json') || [];
  const hook = { id: Date.now().toString(36) + Math.random().toString(36).substr(2,4), label: label || '', url, events, active: true, createdAt: new Date().toISOString(), lastTriggeredAt: null, lastStatus: null };
  hooks.push(hook);
  writeJSON('webhooks.json', hooks);
  res.json(hook);
});

app.patch('/api/webhooks/:id', requireAdmin, (req, res) => {
  const hooks = readJSON('webhooks.json') || [];
  const idx = hooks.findIndex(h => h.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  if (req.body.label   !== undefined) hooks[idx].label  = req.body.label;
  if (req.body.url     !== undefined) hooks[idx].url    = req.body.url;
  if (req.body.events  !== undefined) hooks[idx].events = req.body.events;
  if (req.body.active  !== undefined) hooks[idx].active = req.body.active;
  writeJSON('webhooks.json', hooks);
  res.json(hooks[idx]);
});

app.delete('/api/webhooks/:id', requireAdmin, (req, res) => {
  const hooks = (readJSON('webhooks.json') || []).filter(h => h.id !== req.params.id);
  writeJSON('webhooks.json', hooks);
  res.json({ ok: true });
});

app.post('/api/webhooks/:id/test', requireAdmin, async (req, res) => {
  const hook = (readJSON('webhooks.json') || []).find(h => h.id === req.params.id);
  if (!hook) return res.status(404).json({ error: 'Niet gevonden' });
  try {
    const r = await fetch(hook.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'AgencyAI-Webhook/1.0' },
      body: JSON.stringify({ event: 'test', timestamp: new Date().toISOString(), data: { message: 'Dit is een testbericht van Agency AI.' } }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
    });
    const hooks = readJSON('webhooks.json') || [];
    const idx   = hooks.findIndex(h => h.id === hook.id);
    if (idx !== -1) { hooks[idx].lastTriggeredAt = new Date().toISOString(); hooks[idx].lastStatus = r.ok ? 'ok' : `${r.status}`; writeJSON('webhooks.json', hooks); }
    res.json({ ok: r.ok, status: r.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Incoming Zapier trigger (public, guarded by token) ───────────────────────

app.post('/api/zapier/trigger', async (req, res) => {
  const settings = readJSON('settings.json') || {};
  const token    = req.headers['x-zapier-token'] || req.body?.token || '';
  if (!token || token !== settings.zapierIncomingToken) {
    return res.status(401).json({ error: 'Ongeldig token' });
  }
  const { action, companyName, websiteUrl, niche, location, country, instagramHandle } = req.body || {};
  if (action === 'add_lead') {
    if (!companyName) return res.status(400).json({ error: 'companyName verplicht' });
    const lead = { companyName, websiteUrl: websiteUrl || '', niche: niche || 'retail', location: location || '', country: country || 'NL', instagramHandle: instagramHandle || '', estimatedFollowers: 0, companySize: 'small' };
    const dup = isDuplicate(lead);
    if (dup) return res.status(409).json({ error: `Duplicaat: ${dup.companyName}`, existing: { id: dup.id, status: dup.status } });
    try {
      const result = await processOneLead(lead, settings);
      if (!result) return res.status(400).json({ error: 'Overgeslagen: bedrijf staat op de blacklist of geen emailadres gevonden op de website' });
      const { item, leadRecord } = result;
      const inbox    = readJSON('inbox.json')  || [];
      const allLeads = readJSON('leads.json')  || [];
      writeJSON('inbox.json',  [item, ...inbox]);
      writeJSON('leads.json',  [leadRecord, ...allLeads]);
      const statsObj = readJSON('stats.json') || {};
      writeJSON('stats.json', { ...statsObj, leadsFound: (statsObj.leadsFound || 0) + 1, pipelineValue: (statsObj.pipelineValue || 0) + (item.estimatedValue || 0) });
      return res.json({ ok: true, leadId: leadRecord.id, score: item.score });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
  return res.status(400).json({ error: `Onbekende actie: ${action}` });
});

// ─── Push notifications ───────────────────────────────────────────────────────

app.get('/api/push/vapid-public-key', (req, res) => {
  const settings = readJSON('settings.json') || {};
  res.json({ publicKey: settings.vapidPublicKey || null });
});

app.post('/api/push/subscribe', authMiddleware, (req, res) => {
  const { subscription } = req.body;
  if (!subscription?.endpoint) return res.status(400).json({ error: 'Ongeldige subscription' });
  const subs = readJSON('push-subscriptions.json') || [];
  const exists = subs.find(s => s.subscription.endpoint === subscription.endpoint);
  if (!exists) {
    subs.push({ id: Date.now().toString(36), userId: req.user.id, subscription, createdAt: new Date().toISOString() });
    writeJSON('push-subscriptions.json', subs);
  }
  res.json({ ok: true });
});

app.delete('/api/push/unsubscribe', authMiddleware, (req, res) => {
  const { endpoint } = req.body;
  if (!endpoint) return res.status(400).json({ error: 'Endpoint ontbreekt' });
  const subs = readJSON('push-subscriptions.json') || [];
  writeJSON('push-subscriptions.json', subs.filter(s => s.subscription.endpoint !== endpoint));
  res.json({ ok: true });
});

// ─── Contact form (public) ───────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, company, email, phone, service, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Naam en email zijn verplicht' });
  const contacts = readJSON('contacts.json') || [];
  contacts.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    name, company: company || '', email, phone: phone || '',
    service: service || '', message: message || '',
    createdAt: new Date().toISOString(),
    status: 'new'
  });
  writeJSON('contacts.json', contacts);
  const settings = readJSON('settings.json') || {};
  if (isGmailReady(settings)) {
    try {
      await sendEmail({
        to: settings.gmailAddress,
        subject: `Nieuwe aanvraag: ${name}${company ? ' — ' + company : ''}`,
        body: `Nieuwe websiteaanvraag:\n\nNaam: ${name}\nBedrijf: ${company || '—'}\nEmail: ${email}\nTelefoon: ${phone || '—'}\nDienst: ${service || '—'}\n\nBericht:\n${message || '—'}`,
        settings
      });
    } catch (_) { /* email is optional */ }
  }
  res.json({ ok: true });
});

// ─── Chrome extension download (zip) ──────────────────────────────────────────
app.get('/extension-download', (req, res) => {
  const extDir = path.join(__dirname, 'public', 'extension');
  if (!fs.existsSync(extDir)) return res.status(404).json({ error: 'Extensie niet gevonden' });
  const archiver = (() => { try { return require('archiver'); } catch { return null; } })();
  if (!archiver) {
    // fallback: redirect to the extension folder so the user can download manually
    return res.redirect('/extension/manifest.json');
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="agency-ai-extension.zip"');
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(extDir, false);
  archive.finalize();
});

// ─── Generated client sites ───────────────────────────────────────────────────
app.get('/sites/:siteSlug', (req, res) => {
  const sitePath = path.join(__dirname, 'public', 'sites', req.params.siteSlug, 'index.html');
  if (!fs.existsSync(sitePath)) return res.status(404).send('<h1>Website niet gevonden</h1>');
  res.sendFile(sitePath);
});

// ─── SPA fallback ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Niet gevonden' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// â"€â"€â"€ Start â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

pgInitPromise.then(() => {
  const server = app.listen(PORT, () => {
    console.log(`\nAgency AI draait op http://localhost:${PORT}`);
    console.log(`Data directory: ${DATA_DIR}`);
    if (!process.env.CLAUDE_API_KEY || process.env.CLAUDE_API_KEY === 'your_anthropic_api_key_here') {
      console.warn('⚠️  CLAUDE_API_KEY niet ingesteld — voeg toe aan .env');
    }
    console.log('\nAgency AI klaar voor deployment');
    console.log('Ga naar railway.app om online te zetten\n');
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Fout] Poort ${PORT} al in gebruik — slechts één instantie mag draaien`);
      process.exit(1);
    }
    throw err;
  });
});
