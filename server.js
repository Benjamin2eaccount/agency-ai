require('dotenv').config();

// Global error handlers — log instead of silent crash
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err?.message, err?.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled rejection:', reason?.message || reason);
});

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
const WebSocket   = require('ws');
const rateLimit   = require('express-rate-limit');
const { readJSON, writeJSON, pgInitPromise } = require('./database');
const dnsPromises = require('dns').promises;
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'agency_ai_secret';
if (!process.env.JWT_SECRET) console.warn('[Security] JWT_SECRET not set — using insecure default. Set JWT_SECRET in environment variables.');
const DATA_DIR = path.join(__dirname, 'data');
const BASE_URL = process.env.BASE_URL || 'https://www.agencyai.info';

// ── In-memory error log (last 100, resets on restart) ─────────────────────────
const RUN_ERRORS = [];
function logError(type, message, details = null) {
  RUN_ERRORS.unshift({ time: new Date().toISOString(), type, message, details: details || null });
  if (RUN_ERRORS.length > 100) RUN_ERRORS.pop();
}

// ── Live run progress state ────────────────────────────────────────────────────
let _runState = {
  running: false, startedAt: null, target: 0, found: 0,
  skipped: 0, currentAgent: null, currentLead: null, log: []
};
function runLog(msg) {
  _runState.log.unshift({ msg, at: new Date().toISOString() });
  if (_runState.log.length > 10) _runState.log.pop();
}

const DEFAULT_SERVICES = [
  // ── Maandelijkse managed services (34) ───────────────────────────────────────
  { name: 'Meta advertenties met AI',             price: 495,  billing: 'maandelijks', description: 'Facebook & Instagram ads opgezet en beheerd met AI-optimalisatie' },
  { name: 'Google Ads met AI',                    price: 450,  billing: 'maandelijks', description: 'Google Search en Display campagnes met wekelijkse AI-optimalisatie' },
  { name: 'AI content voor social media',         price: 295,  billing: 'maandelijks', description: 'Dagelijkse posts, captions en hashtags gegenereerd door AI' },
  { name: 'AI chatbot voor website',              price: 195,  billing: 'maandelijks', description: '24/7 klantenservice chatbot die vragen beantwoordt en leads vangt' },
  { name: 'Automatisch lead outreach systeem',    price: 595,  billing: 'maandelijks', description: 'Volledig automatisch koude emails en follow-ups naar prospects' },
  { name: 'Lokale SEO optimalisatie',             price: 350,  billing: 'maandelijks', description: 'Google ranking verbeteren voor lokale zoekopdrachten en Google Maps' },
  { name: 'Google Bedrijfsprofiel optimalisatie', price: 195,  billing: 'maandelijks', description: 'Google Maps profiel optimaliseren voor maximale lokale zichtbaarheid' },
  { name: 'Email marketing automatisering',       price: 295,  billing: 'maandelijks', description: 'Gepersonaliseerde email flows voor leads, klanten en winback' },
  { name: 'WhatsApp Business automatisering',     price: 195,  billing: 'maandelijks', description: 'Geautomatiseerde WhatsApp berichten voor leads en klantenservice' },
  { name: 'AI video content creatie',             price: 395,  billing: 'maandelijks', description: 'Reels, TikToks en Shorts scripts en productie met AI' },
  { name: 'Reputatie management (reviews)',       price: 195,  billing: 'maandelijks', description: 'Automatisch reageren op Google en Facebook reviews met AI' },
  { name: 'Maandelijkse content kalender',        price: 295,  billing: 'maandelijks', description: '20 posts + captions + hashtags per maand, AI gegenereerd op maat' },
  { name: 'Instagram Reels scripts',              price: 195,  billing: 'maandelijks', description: '8 Reels scripts per maand met hooks, tekst en CTA' },
  { name: 'Blog artikelen schrijven',             price: 295,  billing: 'maandelijks', description: '4 SEO geoptimaliseerde blog artikelen per maand' },
  { name: 'Email nieuwsbrief reeks',              price: 195,  billing: 'maandelijks', description: '4 nieuwsbrieven per maand, geschreven en klaar om te versturen' },
  { name: 'TikTok content creatie',               price: 295,  billing: 'maandelijks', description: '8 TikTok video scripts + captions per maand met trending hooks' },
  { name: 'LinkedIn content management',          price: 295,  billing: 'maandelijks', description: '12 LinkedIn posts per maand gericht op thought leadership' },
  { name: 'Pinterest content strategie',          price: 195,  billing: 'maandelijks', description: '20 Pinterest pins met beschrijvingen en bord optimalisatie' },
  { name: 'YouTube Shorts scripts',               price: 195,  billing: 'maandelijks', description: '4 YouTube Shorts scripts per maand met hook en CTA' },
  { name: 'AI thumbnail design',                  price: 95,   billing: 'maandelijks', description: '8 YouTube/blog thumbnails per maand gegenereerd met AI' },
  { name: 'Google Shopping advertenties',         price: 395,  billing: 'maandelijks', description: 'Product feed optimalisatie en Shopping campagne beheer' },
  { name: 'Retargeting advertenties',             price: 295,  billing: 'maandelijks', description: 'Retargeting campagnes op Meta en Google voor websitebezoekers' },
  { name: 'SMS marketing automatisering',         price: 195,  billing: 'maandelijks', description: 'Geautomatiseerde SMS campagnes voor aanbiedingen en herinneringen' },
  { name: 'Review generatie campagne',            price: 195,  billing: 'maandelijks', description: 'Automatisch reviews verzamelen via email en WhatsApp na aankoop' },
  { name: 'Klantretentie email flows',            price: 295,  billing: 'maandelijks', description: 'Win-back en upsell email sequenties voor bestaande klanten' },
  { name: 'Social media analytics rapport',       price: 195,  billing: 'maandelijks', description: 'Maandelijks prestatierapport met inzichten en actiepunten' },
  { name: 'Influencer outreach beheer',           price: 395,  billing: 'maandelijks', description: 'Micro-influencer identificatie, outreach en campagne coordinatie' },
  { name: 'Seizoenskampagnes',                    price: 295,  billing: 'maandelijks', description: 'Campagne content en advertenties voor feestdagen en seizoenen' },
  { name: 'Evenement promotie content',           price: 195,  billing: 'maandelijks', description: 'Social media content en advertenties voor evenementen en openingen' },
  { name: 'Loyalty programma emails',             price: 195,  billing: 'maandelijks', description: 'Geautomatiseerde emails voor loyaliteitsprogramma en beloningen' },
  { name: 'Competitor monitoring',                price: 195,  billing: 'maandelijks', description: 'Maandelijks overzicht van concurrenten activiteiten en kansen' },
  { name: 'AI persberichten',                     price: 195,  billing: 'maandelijks', description: '2 professionele persberichten per maand voor media outreach' },
  { name: 'Google Ads remarketing',               price: 295,  billing: 'maandelijks', description: 'Display remarketing campagnes voor websitebezoekers op Google' },
  { name: 'Facebook Pixel & conversies',          price: 295,  billing: 'maandelijks', description: 'Pixel optimalisatie, custom conversies en CAPI instellen' },
  { name: 'AI offerte generator',                  price: 245,  billing: 'maandelijks', description: 'Offertes automatisch gegenereerd op basis van klantinformatie' },
  { name: 'AI sales opvolging',                    price: 395,  billing: 'maandelijks', description: 'Automatische opvolging van leads via email en WhatsApp' },
  // ── Eenmalige projecten (26) ──────────────────────────────────────────────────
  { name: 'Professionele website bouwen',         price: 995,  billing: 'eenmalig',    description: 'Complete website op maat gebouwd, geoptimaliseerd en gelanceerd' },
  { name: 'Webshop opzetten',                     price: 795,  billing: 'eenmalig',    description: 'Complete webshop met betaling, producten en mobile-first design' },
  { name: 'Landingspagina bouwen',                price: 495,  billing: 'eenmalig',    description: 'Conversie-geoptimaliseerde landingspagina voor campagnes' },
  { name: 'Online boekingssysteem integreren',    price: 495,  billing: 'eenmalig',    description: 'Boekingssoftware koppelen aan de website voor directe afspraken' },
  { name: 'Logo ontwerp',                         price: 395,  billing: 'eenmalig',    description: 'Professioneel logo met 3 varianten en volledig brandpakket' },
  { name: 'Website snelheid & SEO technisch',     price: 395,  billing: 'eenmalig',    description: 'Website technisch versnellen en optimaliseren voor betere rankings' },
  { name: 'Analytics & rapportage dashboard',     price: 395,  billing: 'eenmalig',    description: 'Volledig KPI-rapportage dashboard op maat opgezet en geconfigureerd' },
  { name: 'Huisstijl handleiding',                price: 295,  billing: 'eenmalig',    description: 'Complete brand guide: kleuren, fonts, logo gebruik en tone of voice' },
  { name: 'Website teksten schrijven',            price: 295,  billing: 'eenmalig',    description: 'Volledige website teksten: home, over ons, diensten, contact' },
  { name: 'SEO teksten optimaliseren',            price: 295,  billing: 'eenmalig',    description: 'Alle pagina teksten SEO geoptimaliseerd met meta titles en descriptions' },
  { name: 'Email autoresponder reeks',            price: 295,  billing: 'eenmalig',    description: '7-delige welkomst email reeks voor nieuwe klanten of leads' },
  { name: 'Google Ads teksten',                   price: 195,  billing: 'eenmalig',    description: '10 advertentievarianten met headlines, descriptions en CTA' },
  { name: 'Facebook Ad copy',                     price: 195,  billing: 'eenmalig',    description: '5 complete Facebook/Instagram advertentie teksten' },
  { name: 'Chatbot script voor website',          price: 195,  billing: 'eenmalig',    description: 'Volledig chatbot script met 15+ Q&A paren en lead capture flow' },
  { name: 'Concurrentieanalyse rapport',          price: 195,  billing: 'eenmalig',    description: 'Uitgebreide analyse van 3 concurrenten met verbeterpunten' },
  { name: 'Product beschrijvingen',               price: 195,  billing: 'eenmalig',    description: '20 SEO geoptimaliseerde product beschrijvingen voor webshop' },
  { name: 'Pitch deck teksten',                   price: 195,  billing: 'eenmalig',    description: 'Volledige presentatie teksten voor investor of klant pitch' },
  { name: 'Verlaten winkelwagen emails',          price: 195,  billing: 'eenmalig',    description: '3-delige email reeks voor verlaten winkelwagens' },
  { name: 'Keyword research rapport',             price: 145,  billing: 'eenmalig',    description: 'Uitgebreid zoekwoordenonderzoek met volume, concurrentie en gaps' },
  { name: 'Privacy policy + algemene voorwaarden', price: 145, billing: 'eenmalig',    description: 'GDPR-compliant privacy policy en algemene voorwaarden op maat' },
  { name: 'Over ons pagina schrijven',            price: 145,  billing: 'eenmalig',    description: 'Professionele over ons pagina die vertrouwen wekt' },
  { name: 'Nieuwsbrief template ontwerpen',       price: 145,  billing: 'eenmalig',    description: 'HTML email template op maat voor nieuwsbrieven' },
  { name: 'Social media audit',                   price: 95,   billing: 'eenmalig',    description: 'Volledig audit rapport van Instagram/Facebook met actieplan' },
  { name: 'Google Bedrijfsprofiel content',       price: 95,   billing: 'eenmalig',    description: 'Volledige optimalisatie teksten voor Google Maps profiel' },
  { name: 'Social media profiel optimalisatie',   price: 95,   billing: 'eenmalig',    description: 'Bio, links, highlights en visuele uitstraling optimaliseren' },
  { name: 'FAQ pagina schrijven',                 price: 95,   billing: 'eenmalig',    description: '20 veelgestelde vragen met uitgebreide antwoorden' },
  { name: 'AI FAQ assistent',                      price: 145,  billing: 'eenmalig',    description: 'Dynamische FAQ sectie met AI antwoorden' },
  { name: 'AI kennisbank systeem',                 price: 195,  billing: 'eenmalig',    description: 'Slimme interne kennisbank voor klanten of teams' },
  { name: 'AI onboarding systeem',                 price: 245,  billing: 'eenmalig',    description: 'Automatische onboarding flow voor nieuwe klanten' },
  { name: 'AI branding kit generatie',             price: 395,  billing: 'eenmalig',    description: 'Logo, kleuren, fonts en branding assets' },
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
  'activity.json':   [],
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
    agencyName: 'Agency AI', myName: 'Admin', myTitle: 'AI Growth Specialist',
    gmailAddress: process.env.GMAIL_USER || 'info@agencyai.info', gmailPassword: process.env.GMAIL_APP_PASSWORD || '', adminEmail: 'info@agencyai.info', agencyEmail: 'info@agencyai.info', linkedinUrl: '', stripeSecretKey: '',
    mollieApiKey: '', paypalMe: '', preferredPaymentMethod: 'bank_transfer',
    bankTransferIban: '', bankTransferName: '', bankTransferBic: '', paymentTermDays: 14,
    dailyRunTime: '09:00', leadsPerDay: 15, autoApproveScore: 8.0, automationPaused: false, autoArchiveEnabled: true, autoArchiveDays: 30,
    replyDetection: true, dailyBriefingEnabled: true, dailyBriefingTime: '08:45',
    smartAutoApprove: { enabled: false, scoreThreshold: 8.0, requireNoAds: true, minFollowers: 5000, requireWebsite: true },
    autoClientEmails: { welcome: true, intakeReceived: true, deliveryReady: true, weekComplete: true, monthlyUpdate: true, checkIn: true },
    autoInvoiceEnabled: false, autoInvoiceDay: 1, paymentReminderDays: 7,
    fixedCosts: [{ name: 'Railway hosting', amount: 5 }, { name: 'Claude API', amount: 15 }, { name: 'Domein', amount: 2 }, { name: 'Google Workspace', amount: 6 }],
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

// ─── API version header on every response ────────────────────────────────────
const API_VERSION = '1.0.0';
app.use((req, res, next) => {
  res.setHeader('X-API-Version', API_VERSION);
  next();
});

// ─── GET /api/version (public, no auth) ──────────────────────────────────────
app.get('/api/version', (req, res) => {
  res.json({
    version: API_VERSION,
    environment: process.env.NODE_ENV || 'production',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

// ─── /api/v1/* alias — forwards to /api/* (backwards compatible versioning) ──
// Allows clients to use /api/v1/leads instead of /api/leads.
// When /api/v2 is created, /api/ will alias to it and /api/v1 stays frozen.
app.use('/api/v1', (req, res, next) => {
  if (req._v1Aliased) return next(); // prevent infinite loop
  req._v1Aliased = true;
  req.url = '/api' + req.url;
  req.originalUrl = req.url;
  app.handle(req, res, next);
});

// ─── Rate limiters ────────────────────────────────────────────────────────────
function _rlOnLimitReached(req, _res, _options) {
  // Log to audit_log when a limit is hit
  try {
    const { getDb } = require('./database');
    getDb().prepare('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)')
      .run('rate_limit_hit', 'ip', req.ip, JSON.stringify({ path: req.path, method: req.method }));
  } catch {}
}

// Global — 200 req / 15 min per IP (all routes)
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel verzoeken. Probeer het over enkele minuten opnieuw.' },
  skip: (req) => req.path === '/health' || req.path.startsWith('/track/'), // exempt health + pixel
  handler: (req, res, next, options) => { _rlOnLimitReached(req, res, options); res.status(429).json(options.message); }
}));

// Auth login — 10 attempts / 15 min per IP (stricter)
const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Te veel inlogpogingen. Wacht 15 minuten en probeer het opnieuw.' },
  handler: (req, res, next, options) => { _rlOnLimitReached(req, res, options); res.status(429).json(options.message); }
});
app.use('/api/auth/login', authRateLimit);

// Runs — 5 runs / hour per IP
const runsRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Maximum 5 runs per uur bereikt. Probeer het over een uur opnieuw.' },
  handler: (req, res, next, options) => { _rlOnLimitReached(req, res, options); res.status(429).json(options.message); }
});
app.use('/api/find-leads', runsRateLimit);
app.use('/api/runs', runsRateLimit);

// Email sending — 50 emails / hour per IP
const emailRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Maximum 50 emails per uur bereikt. Probeer het over een uur opnieuw.' },
  handler: (req, res, next, options) => { _rlOnLimitReached(req, res, options); res.status(429).json(options.message); }
});
app.use('/api/leads', (req, res, next) => {
  if (/\/send-/i.test(req.path) && req.method === 'POST') return emailRateLimit(req, res, next);
  next();
});

// Builds — 20 builds / hour per IP
const buildRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Maximum 20 builds per uur bereikt. Probeer het over een uur opnieuw.' },
  handler: (req, res, next, options) => { _rlOnLimitReached(req, res, options); res.status(429).json(options.message); }
});
app.use('/api/leads', (req, res, next) => {
  if (/\/build-all-services|\/agent-chat/i.test(req.path) && req.method === 'POST') return buildRateLimit(req, res, next);
  next();
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.use('/components', express.static(path.join(__dirname, 'components')));

// ── Custom domain middleware — serve site when Host matches a lead's domain ──
app.use((req, res, next) => {
  const host = req.hostname; // e.g. "www.kappersamsterdam.nl"
  if (!host || host.includes('localhost') || host.includes('agencyai.info') || host.includes('railway.app')) return next();
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.customDomain && (l.customDomain === host || l.customDomain === `www.${host}` || `www.${l.customDomain}` === host));
  if (!lead) return next();
  // Find their built website file
  const slug     = (lead.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const siteSlug = lead.generatedSite?.siteSlug || slug;
  const sitePath = path.join(__dirname, 'public', 'sites', siteSlug, 'website.html');
  const fallback = path.join(__dirname, 'public', 'sites', siteSlug, 'index.html');
  const file = fs.existsSync(sitePath) ? sitePath : fs.existsSync(fallback) ? fallback : null;
  if (!file) return next();
  console.log(`[CustomDomain] ${host} → ${file}`);
  res.sendFile(file);
});

// ─── Public config (no auth) ─────────────────────────────────────────────────
app.get('/api/public-config', (req, res) => {
  const s = readJSON('settings.json') || {};
  res.json({
    agencyName:  s.agencyName  || 'Agency AI',
    calendlyUrl: s.calendlyUrl || null,
    gaId:        s.gaId        || null,
    agencyLogo:  s.agencyLogo  || null
  });
});

app.get('/api/logo', (req, res) => {
  const s = readJSON('settings.json') || {};
  if (!s.agencyLogo) return res.status(404).send('No logo');
  const match = s.agencyLogo.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return res.status(404).send('No logo');
  const buf = Buffer.from(match[2], 'base64');
  res.set('Content-Type', match[1]).set('Cache-Control', 'public, max-age=86400').send(buf);
});

// ─── Clean URL routes (must come after static so files still work) ───────────
app.get('/', (req, res) => { console.log('[route] GET / → landing.html'); res.sendFile(path.join(__dirname, 'public', 'landing.html')); });
app.get('/login',        (_, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/client',       (_, res) => res.sendFile(path.join(__dirname, 'public', 'client-login.html')));
app.get('/client-login', (_, res) => res.sendFile(path.join(__dirname, 'public', 'client-login.html')));
// /app routes — no server-side auth; frontend (app.js) reads JWT from localStorage
// and redirects to /login if missing. Server just serves the HTML shell.
app.get('/app', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/status',       (_, res) => res.sendFile(path.join(__dirname, 'public', 'status.html')));

// MPA routes — each /app/:page serves its own HTML file
app.get('/app/:page', (req, res) => {
  const page = req.params.page;
  // Block path traversal
  if (!/^[a-z0-9-]+$/i.test(page)) return res.redirect('/app');
  const filePath = path.join(__dirname, 'public', 'app', page + '.html');
  if (require('fs').existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.redirect('/app');
  }
});

// Wildcard catch-all for deep /app/** paths — serves SPA shell, client router takes over
app.get('/app/*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// readJSON / writeJSON are provided by database.js (SQLite-backed)

function addActivity(type, label, opts) {
  opts = opts || {};
  let log = readJSON('activity.json') || [];
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
  writeJSON('activity.json', log);
}

function addNotification(type, title, body, leadId, link) {
  const notifications = readJSON('notifications.json') || [];
  const resolvedLink = link || (leadId ? `project:${leadId}` : null);
  notifications.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    type, title, body,
    leadId: leadId || null,
    link: resolvedLink,
    read: false,
    createdAt: new Date().toISOString()
  });
  if (notifications.length > 200) notifications.splice(200);
  writeJSON('notifications.json', notifications);

  const pushTypes = ['reply_received', 'intake_submitted', 'high_score_lead', 'payment_overdue', 'run_complete', 'calendly_booking', 'payment_received', 'client_question'];
  if (pushTypes.includes(type)) {
    const url = leadId ? `/app#lead-${leadId}` : '/app';
    sendPushToAll(title, body, url).catch(() => {});
  }

  // Broadcast to all connected WebSocket clients
  broadcastWS('notification', { type, title, body, leadId, link: resolvedLink });
}

// ─── Outgoing webhook helper ──────────────────────────────────────────────────

// ─── Job Queue ────────────────────────────────────────────────────────────────
class JobQueue {
  constructor() {
    this._running = false;
    this._queue   = []; // { jobId, jobType, fn, attempts }
  }

  // Add a job. Returns a Promise that resolves when the job completes.
  add(jobType, fn, data = {}, priority = 'normal') {
    let jobId;
    try {
      const { getDb } = require('./database');
      const stmt = getDb().prepare(
        'INSERT INTO job_queue (job_type, status, priority, data) VALUES (?, ?, ?, ?)'
      );
      jobId = stmt.run(jobType, 'pending', priority, JSON.stringify(data)).lastInsertRowid;
    } catch {}

    return new Promise((resolve, reject) => {
      const entry = { jobId, jobType, fn, attempts: 0, resolve, reject };
      if (priority === 'high') this._queue.unshift(entry);
      else this._queue.push(entry);
      this._process();
    });
  }

  async _process() {
    if (this._running || !this._queue.length) return;
    this._running = true;
    const job = this._queue.shift();

    try {
      this._update(job.jobId, 'running', { started_at: new Date().toISOString() });
      const result = await job.fn();
      this._update(job.jobId, 'completed', { result: JSON.stringify(result ?? null), completed_at: new Date().toISOString() });
      broadcastWS('job_complete', { jobId: job.jobId, jobType: job.jobType });
      job.resolve(result);
    } catch (err) {
      job.attempts++;
      this._update(job.jobId, 'failed', { error: err.message, attempts: job.attempts });
      if (job.attempts < 3) {
        console.log(`[JobQueue] ${job.jobType} mislukt (poging ${job.attempts}/3), opnieuw proberen...`);
        this._update(job.jobId, 'pending', {});
        this._queue.unshift(job); // retry at front
      } else {
        console.error(`[JobQueue] ${job.jobType} definitief mislukt na 3 pogingen:`, err.message);
        broadcastWS('job_failed', { jobId: job.jobId, jobType: job.jobType, error: err.message });
        job.reject(err);
      }
    }

    this._running = false;
    setImmediate(() => this._process()); // process next without stack overflow
  }

  _update(jobId, status, fields = {}) {
    if (!jobId) return;
    try {
      const { getDb } = require('./database');
      const sets = ['status = ?', 'attempts = attempts + 0'];
      const vals = [status];
      if (fields.started_at)   { sets.push('started_at = ?');   vals.push(fields.started_at); }
      if (fields.completed_at) { sets.push('completed_at = ?'); vals.push(fields.completed_at); }
      if (fields.result)       { sets.push('result = ?');       vals.push(fields.result); }
      if (fields.error)        { sets.push('error = ?');        vals.push(fields.error); }
      if (fields.attempts !== undefined) { sets.push('attempts = ?'); vals.push(fields.attempts); }
      vals.push(jobId);
      getDb().prepare(`UPDATE job_queue SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
    } catch {}
  }

  status() {
    return { running: this._running, queued: this._queue.length, currentJob: this._queue[0]?.jobType || null };
  }

  recentJobs(limit = 20) {
    try {
      const { getDb } = require('./database');
      return getDb().prepare('SELECT * FROM job_queue ORDER BY created_at DESC LIMIT ?').all(limit);
    } catch { return []; }
  }
}

const jobQueue = new JobQueue();

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
  const name   = (lead.companyName  || '').toLowerCase().trim();
  const domain = (lead.websiteUrl   || '').replace(/^https?:\/\//,'').split('/')[0].toLowerCase().trim();
  const niche  = (lead.niche        || '').toLowerCase().trim();

  console.log(`[Blacklist] Checken: name="${name}" domain="${domain || '(leeg)'}" niche="${niche}" — ${list.length} entries`);

  for (const entry of list) {
    const v = (entry.value || '').toLowerCase().trim();
    if (!v) continue; // skip empty entries

    let blocked = false;
    if (entry.type === 'company') {
      // Require non-empty name; only check name.includes(v), not reverse (prevents short names matching long entries)
      blocked = !!(name && (name === v || name.includes(v)));
    } else if (entry.type === 'domain') {
      // Require non-empty domain; empty websiteUrl must never trigger a domain block
      blocked = !!(domain && (domain === v || domain.includes(v) || v.includes(domain)));
    } else if (entry.type === 'niche') {
      blocked = !!(niche && niche === v);
    }

    if (blocked) {
      console.log(`[Blacklist] GEBLOKKEERD: "${lead.companyName}" — entry type=${entry.type} value="${entry.value}"`);
      return true;
    }
  }

  console.log(`[Blacklist] "${lead.companyName}" — niet op blacklist ✓`);
  return false;
}

function autoBlacklist(domain, reason) {
  if (!domain || domain.length < 3) return;
  const list = readJSON('blacklist.json') || [];
  if (list.some(e => e.value === domain)) return;
  list.unshift({ id: 'bl-auto-' + Date.now(), type: 'domain', value: domain, reason, autoAdded: true, addedAt: new Date().toISOString() });
  writeJSON('blacklist.json', list);
  addActivity('blacklist', `[${domain}] automatisch geblokkeerd: ${reason}`, {});
  console.log(`[AutoBlacklist] ${domain} geblokkeerd: ${reason}`);
}

function addLeadHistory(leads, leadId, event) {
  const lead = leads.find(l => l.id === leadId);
  if (!lead) return;
  if (!lead.history) lead.history = [];
  lead.history.push({ ...event, time: new Date().toISOString() });
}

function logAction(action, entityType, entityId, details) {
  try {
    const { getDb } = require('./database');
    const dbInst = getDb();
    if (!dbInst) return;
    dbInst.prepare('INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)').run(action, entityType || null, String(entityId || ''), JSON.stringify(details || {}));
  } catch(e) { console.log('[Audit] Log error:', e.message); }
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

function updateMemoryVersion(niche, country, version, type) {
  if (!version) return;
  const memory = readJSON('memory.json') || {};
  const key = getMemoryKey(niche, country);
  if (!memory[key]) memory[key] = { niche: niche||'unknown', country: (country||'unknown').toUpperCase(), sent: 0, replied: 0, replyRate: 0 };
  const v = version === 'B' ? 'vB' : 'vA';
  if (!memory[key][v]) memory[key][v] = { sent: 0, replied: 0 };
  if (type === 'sent')    memory[key][v].sent    = (memory[key][v].sent    || 0) + 1;
  if (type === 'replied') memory[key][v].replied = (memory[key][v].replied || 0) + 1;
  const totSent = (memory[key].vA?.sent || 0) + (memory[key].vB?.sent || 0);
  if (totSent >= 50) {
    const rateA = (memory[key].vA?.sent || 0) > 0 ? ((memory[key].vA.replied || 0) / memory[key].vA.sent) * 100 : 0;
    const rateB = (memory[key].vB?.sent || 0) > 0 ? ((memory[key].vB.replied || 0) / memory[key].vB.sent) * 100 : 0;
    if (rateA - rateB >= 10) memory[key].autoPickVersion = 'A';
    else if (rateB - rateA >= 10) memory[key].autoPickVersion = 'B';
    else delete memory[key].autoPickVersion;
  }
  writeJSON('memory.json', memory);
}

function getAutoPickVersion(niche, country) {
  return (readJSON('memory.json') || {})[getMemoryKey(niche, country)]?.autoPickVersion || null;
}

// ITEM 8: Conversion tracking + ML score boost
function _followerBucket(followers) {
  const f = followers || 0;
  if (f < 1000)   return 'micro';
  if (f < 5000)   return '1k-5k';
  if (f < 20000)  return '5k-20k';
  if (f < 50000)  return '20k-50k';
  if (f < 200000) return '50k-200k';
  return '200k+';
}

function _websiteBucket(speedScore) {
  if (!speedScore) return 'unknown';
  if (speedScore < 40) return 'low';
  if (speedScore < 70) return 'medium';
  return 'high';
}

function updateMemoryConversion(niche, country, type, followers, websiteScore) {
  if (!niche && !country) return;
  const memory = readJSON('memory.json') || {};
  const key = getMemoryKey(niche, country);
  if (!memory[key]) memory[key] = { niche: niche||'unknown', country: (country||'unknown').toUpperCase(), sent: 0, replied: 0, replyRate: 0 };
  const entry = memory[key];
  if (type === 'converted') {
    entry.converted = (entry.converted || 0) + 1;
    const fb = _followerBucket(followers);
    const wb = _websiteBucket(websiteScore);
    if (!entry.convertedProfiles) entry.convertedProfiles = {};
    entry.convertedProfiles[fb] = (entry.convertedProfiles[fb] || 0) + 1;
    if (!entry.convertedWebsiteScores) entry.convertedWebsiteScores = {};
    entry.convertedWebsiteScores[wb] = (entry.convertedWebsiteScores[wb] || 0) + 1;
  } else if (type === 'lost') {
    entry.lost = (entry.lost || 0) + 1;
  }
  const total = (entry.converted || 0) + (entry.lost || 0);
  entry.conversionRate = total > 0 ? Math.round(((entry.converted || 0) / total) * 1000) / 10 : 0;
  if (entry.convertedProfiles) entry.bestFollowerRange = Object.entries(entry.convertedProfiles).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  if (entry.convertedWebsiteScores) entry.bestWebsiteScore = Object.entries(entry.convertedWebsiteScores).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  writeJSON('memory.json', memory);
}

function getConversionBoost(niche, country, followers, websiteScore) {
  const entry = (readJSON('memory.json') || {})[getMemoryKey(niche, country)];
  if (!entry) return 0;
  const total = (entry.converted || 0) + (entry.lost || 0);
  if (total < 3) return 0;
  let boost = 0;
  const rate = entry.conversionRate || 0;
  if (rate > 15) boost += 1.0;
  else if (rate > 8) boost += 0.5;
  else if (rate < 3 && total >= 5) boost -= 0.5;
  if (entry.bestFollowerRange && _followerBucket(followers) === entry.bestFollowerRange) boost += 0.3;
  if (entry.bestWebsiteScore && entry.bestWebsiteScore !== 'unknown' && _websiteBucket(websiteScore) === entry.bestWebsiteScore) boost += 0.2;
  return Math.round(boost * 10) / 10;
}

// â"€â"€â"€ Email helper â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function buildEmailHTML(body, agencyName, myName, myTitle, trackingToken, opts) {
  opts = opts || {};
  const myEmail = opts.myEmail || '';
  const calendlyLink = opts.calendlyLink || '';
  const logoUrl = opts.logoUrl || '';
  const baseUrl = BASE_URL;

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

  const ctaText = calendlyLink ? 'Plan een gratis gesprek &rarr;' : 'Beantwoord deze email voor meer informatie';
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
        ${logoUrl ? `<img src="${logoUrl}" alt="${e(agencyName || 'Agency AI')}" style="height:32px;max-width:160px;object-fit:contain;display:block">` : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:18px;font-weight:700;color:#111111">${e(agencyName || 'Agency AI')}</span>`}
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
              <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F310;&nbsp;${e(opts.agencyWebsite || BASE_URL || '')}</p>
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
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center;line-height:1.5">U ontvangt deze email van Agency AI. Uitschrijven? Stuur een reply met &#39;Uitschrijven&#39; of klik hieronder.</p>
        <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center"><a href="mailto:info@agencyai.info?subject=uitschrijven" style="color:#9b9b98;text-decoration:underline">Uitschrijven</a></p>
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center">&copy; ${new Date().getFullYear()} ${e(agencyName||'Agency AI')}</p>
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

// Rich HTML delivery email for approved HTML deliverables (booking pages, websites, etc.)
function buildDeliveryEmailHTML({ lead, d, settings, portalLink }) {
  const e = s => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const agencyName  = settings.agencyName || 'Agency AI';
  const myName      = settings.myName || 'Het team';
  const myTitle     = settings.myTitle || 'AI Growth Specialist';
  const myEmail     = settings.gmailAddress || settings.resendFromAddress || process.env.RESEND_FROM_ADDRESS || '';
  const logoUrl     = settings.agencyLogo ? `${BASE_URL}/api/logo` : '';
  const baseUrl     = BASE_URL;
  const serviceNm   = d.service || 'levering';
  const liveUrl     = d.url || '';
  const company     = lead.companyName || 'uw bedrijf';
  const portalBtn   = portalLink
    ? `<tr><td align="center" style="padding-top:10px">
        <a href="${e(portalLink)}" target="_blank" style="display:inline-block;padding:10px 22px;background:#f4f4f2;border-radius:6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:600;color:#111111;text-decoration:none;border:1px solid #e0e0de">Bekijk uw klantportaal &rarr;</a>
       </td></tr>`
    : '';

  const nameParts = (myName || 'AA').trim().split(/\s+/).filter(Boolean);
  const initials = ((nameParts[0]?.[0] || 'A') + (nameParts.length > 1 ? (nameParts[nameParts.length - 1]?.[0] || 'A') : (nameParts[0]?.[1] || 'A'))).toUpperCase();

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${e(serviceNm)} klaar — ${e(agencyName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2">
<tr><td align="center" style="padding:32px 16px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">

  <!-- Header -->
  <tr><td style="padding:22px 32px;background:#111111">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${e(agencyName)}" style="height:30px;max-width:150px;object-fit:contain;display:block">`
      : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff">${e(agencyName)}</span>`}
  </td></tr>

  <!-- Success banner -->
  <tr><td style="padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border-bottom:2px solid #bbf7d0">
      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.07em">Klaar voor gebruik</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#14532d">Uw ${e(serviceNm)} staat klaar!</p>
    </td></tr>
    </table>
  </td></tr>

  <!-- Greeting -->
  <tr><td style="padding:28px 32px 0">
    <p style="margin:0 0 20px;font-family:Georgia,serif;font-size:15px;line-height:1.75;color:#1a1a1a">Beste ${e(company)},</p>
    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;line-height:1.75;color:#1a1a1a">Geweldig nieuws — uw <strong>${e(serviceNm)}</strong> is volledig opgebouwd en klaar voor gebruik. Hieronder vindt u alles wat u moet weten om direct aan de slag te gaan.</p>
  </td></tr>

  <!-- Wat staat klaar -->
  <tr><td style="padding:0 32px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f9f9f8;border-radius:8px;border:1px solid #e8e8e5;overflow:hidden">
      <tr><td style="padding:16px 20px;background:#111111;border-radius:8px 8px 0 0">
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:.06em">Wat er voor u klaarstaat</p>
      </td></tr>
      <tr><td style="padding:20px">
        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#111111">${e(serviceNm)}</p>
        ${liveUrl ? `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">Uw pagina is live op het volgende adres:</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="background:#2563eb;border-radius:6px">
            <a href="${e(liveUrl)}" target="_blank" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">&#128279; Bekijk uw pagina live &rarr;</a>
          </td>
        </tr></table>` : ''}
      </td></tr>
    </table>
  </td></tr>

  <!-- Zo gebruikt u het -->
  <tr><td style="padding:0 32px 24px">
    <p style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#111111">Zo gebruikt u het</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      ${[
        [`1`, `Open de pagina`, liveUrl ? `Ga naar: <a href="${e(liveUrl)}" style="color:#2563eb;word-break:break-all">${e(liveUrl)}</a>` : 'Open uw pagina via de link hierboven.'],
        [`2`, `Test het zelf`, `Doorloop het proces als klant — plaats een testboeking of vul het formulier in om te controleren of alles werkt.`],
        [`3`, `Voeg de link toe aan uw website`, `Ga naar uw websitebeheer → maak een nieuw menu-item of knop aan → plak de URL: <code style="background:#f4f4f2;padding:2px 6px;border-radius:4px;font-size:12px;color:#111">${e(liveUrl)}</code>`],
        [`4`, `Deel met uw klanten`, `Stuur de link via WhatsApp, social media of zet hem in uw Instagram bio — klanten kunnen dan direct boeken of contact opnemen.`],
      ].map(([num, title, desc]) => `
      <tr><td style="padding:0 0 14px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td valign="top" style="width:32px;padding-top:2px">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
              <td align="center" valign="middle" style="width:26px;height:26px;background:#111111;border-radius:50%">
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#ffffff;display:block;line-height:26px;text-align:center">${num}</span>
              </td>
            </tr></table>
          </td>
          <td style="padding-left:12px">
            <p style="margin:0 0 4px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111111">${title}</p>
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#374151">${desc}</p>
          </td>
        </tr>
        </table>
      </td></tr>`).join('')}
    </table>
  </td></tr>

  <!-- Zo zien uw klanten het -->
  <tr><td style="padding:0 32px 24px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe">
      <tr><td style="padding:20px">
        <p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#1e40af">Zo zien uw klanten het</p>
        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#1e3a8a">Uw klanten kunnen via de pagina:</p>
        ${['Een dienst of product kiezen', 'Een datum en tijd selecteren', 'Hun gegevens invullen', 'Direct een bevestiging ontvangen'].map(item =>
          `<p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1e3a8a">&#10003; &nbsp;${item}</p>`
        ).join('')}
        <p style="margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:#1e3a8a"><strong>U ontvangt een notificatie bij elke nieuwe aanvraag of boeking.</strong></p>
      </td></tr>
    </table>
  </td></tr>

  <!-- Vragen -->
  <tr><td style="padding:0 32px 28px">
    <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111111">Heeft u vragen?</p>
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#374151">Wij staan altijd voor u klaar. U kunt uw klantportaal raadplegen voor updates, documenten en facturen, of direct op deze email antwoorden.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      ${portalBtn}
    </table>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#e8e8e5;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>

  <!-- Signature -->
  <tr><td style="padding:22px 32px;background:#f9f9f8">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
      <td valign="top">
        <p style="margin:0 0 2px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#1a1a1a">${e(myName)}</p>
        <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">${e(myTitle)} &middot; ${e(agencyName)}</p>
        ${myEmail ? `<p style="margin:0 0 3px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F4E7;&nbsp;${e(myEmail)}</p>` : ''}
        <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#6b7280">&#x1F310;&nbsp;${e(baseUrl)}</p>
      </td>
      <td valign="top" align="right" style="width:44px;padding-left:16px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right"><tr>
          <td align="center" valign="middle" style="width:36px;height:36px;background:#111111;border-radius:4px">
            <span style="font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#ffffff;display:block;line-height:36px;text-align:center">${initials}</span>
          </td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:16px 32px;background:#f4f4f2;border-top:1px solid #e8e8e5">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center">&copy; ${new Date().getFullYear()} ${e(agencyName)} &bull; Vragen? Antwoord op deze email.</p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// HTML-escape helper — used by server-side HTML builders (emails, proposals, agency page)
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateInvoiceNumber(settings) {
  const year = new Date().getFullYear();
  const last = parseInt(settings.lastInvoiceNumber) || 0;
  const next = last + 1;
  // Caller must save settings after using this
  return { nr: `FAC-${year}-${String(next).padStart(3, '0')}`, nextNum: next };
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

function buildIntegrationGuide(settings) {
  const s = settings || {};
  const agencyName = s.agencyName || 'Agency AI';
  const agencyEmail = s.gmailAddress || '';
  return `
<!--
═══════════════════════════════════════════════════════════
  INTEGRATIE INSTRUCTIES — ${agencyName}
  Heeft u vragen? ${agencyEmail || 'Neem contact op met uw accountmanager'}
═══════════════════════════════════════════════════════════

OPTIE 1 — WordPress / Elementor / Divi
  1. Ga naar uw WordPress dashboard → Pagina's → Nieuwe pagina
  2. Klik op '+ Blok toevoegen' → zoek 'Aangepaste HTML'
  3. Plak de volgende embedcode:
     <iframe src="[UW-URL]" width="100%" height="700" frameborder="0" style="border:none;border-radius:8px"></iframe>
  4. Publiceer de pagina en controleer op uw website

OPTIE 2 — Webflow
  1. Open de pagina in Webflow Designer
  2. Voeg een 'Embed' element toe (HTML-blok)
  3. Plak dezelfde embedcode als hierboven
  4. Publiceer de site

OPTIE 3 — Shopify
  1. Online Store → Thema's → Thema aanpassen
  2. Voeg een 'Aangepaste HTML'-sectie toe
  3. Plak de embedcode

OPTIE 4 — Wix
  1. Klik op '+' → Meer → HTML-iframe
  2. Klik op 'Coderen' en plak de embedcode

OPTIE 5 — Directe link
  Deel de URL direct met uw klanten of zet hem in uw email-handtekening.

Bouwtijd: ${new Date().toLocaleDateString('nl-NL')} | Door: ${agencyName}
═══════════════════════════════════════════════════════════
-->`;
}

function buildInvoiceEmailHTML({ invoiceNr, invoiceDate, dueDate, lead, services, amount, settings }) {
  const s = settings || {};
  const agencyName  = s.agencyName || 'Agency AI';
  const myName      = s.myName || '';
  const myEmail     = s.gmailAddress || s.resendFromAddress || '';
  const agencyWeb   = s.agencyWebsite || BASE_URL || '';
  const iban        = s.bankTransferIban || '';
  const tenaam      = s.bankTransferName || agencyName;
  const bic         = s.bankTransferBic  || '';
  const btwEnabled  = s.btwEnabled === true;
  const btwRate     = parseFloat(s.btwRate) || 21;
  const logoUrl     = s.agencyLogo ? `${BASE_URL}/api/logo` : '';
  const companyName = lead.companyName || lead.contactName || 'Klant';
  const location    = lead.location || lead.city || '';

  const dueFmt      = new Date(dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  const invFmt      = new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const svcs = Array.isArray(services) && services.length ? services : [{ name: lead.services?.[0] || 'AI-diensten', price: amount, billing: 'eenmalig' }];

  let subtotal = 0;
  const rows = svcs.map(svc => {
    const price = parseFloat(svc.price) || (amount / svcs.length);
    subtotal += price;
    const btwAmt   = btwEnabled ? price * btwRate / 100 : 0;
    const totalRow = btwEnabled ? price + btwAmt : price;
    return `
      <tr style="border-bottom:1px solid #f0f0f0">
        <td style="padding:12px 16px;font-size:14px;color:#111">${esc(svc.name || 'Dienst')}${svc.billing === 'maandelijks' ? ' <span style="font-size:11px;color:#888">/mnd</span>' : ''}</td>
        <td style="padding:12px 16px;font-size:14px;color:#111;text-align:right">€${price.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        ${btwEnabled ? `<td style="padding:12px 16px;font-size:14px;color:#666;text-align:right">€${btwAmt.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>` : ''}
        <td style="padding:12px 16px;font-size:14px;color:#111;text-align:right">€${totalRow.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
      </tr>`;
  }).join('');

  const totalBtw  = btwEnabled ? subtotal * btwRate / 100 : 0;
  const totalIncl = btwEnabled ? subtotal + totalBtw : subtotal;

  const payBlock = iban
    ? `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#555">IBAN</td><td colspan="2" style="padding:6px 0;font-size:13px;color:#111;font-weight:600">${esc(iban)}</td></tr>
       <tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#555">Tenaamstelling</td><td colspan="2" style="padding:6px 0;font-size:13px;color:#111">${esc(tenaam)}</td></tr>
       ${bic ? `<tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#555">BIC</td><td colspan="2" style="padding:6px 0;font-size:13px;color:#111">${esc(bic)}</td></tr>` : ''}
       <tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#555">Omschrijving</td><td colspan="2" style="padding:6px 0;font-size:13px;color:#111">${esc(companyName)} / ${esc(invoiceNr)}</td></tr>
       <tr><td colspan="2" style="padding:6px 0;font-size:13px;color:#555">Betalen voor</td><td colspan="2" style="padding:6px 0;font-size:13px;color:#111;font-weight:600">${dueFmt}</td></tr>`
    : `<tr><td colspan="4" style="padding:6px 0;font-size:13px;color:#555">Zie betaallink in bovenstaand bericht.</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

  <!-- HEADER -->
  <tr><td style="background:#0A0A0F;padding:28px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>${logoUrl ? `<img src="${logoUrl}" height="36" style="display:block;border-radius:4px" alt="${esc(agencyName)}">` : `<span style="color:#fff;font-size:20px;font-weight:700">${esc(agencyName)}</span>`}</td>
      <td align="right"><span style="color:#fff;font-size:26px;font-weight:800;letter-spacing:2px">FACTUUR</span></td>
    </tr></table>
  </td></tr>

  <!-- META ROW -->
  <tr><td style="background:#18181f;padding:16px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#aaa;font-size:12px">FACTUURNUMMER<br><span style="color:#fff;font-size:14px;font-weight:600">${esc(invoiceNr)}</span></td>
      <td align="center" style="color:#aaa;font-size:12px">FACTUURDATUM<br><span style="color:#fff;font-size:14px">${invFmt}</span></td>
      <td align="right" style="color:#aaa;font-size:12px">VERVALDATUM<br><span style="color:#fff;font-size:14px;font-weight:600">${dueFmt}</span></td>
    </tr></table>
  </td></tr>

  <!-- KLANTGEGEVENS -->
  <tr><td style="padding:24px 32px 16px">
    <p style="margin:0 0 4px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px">Aan</p>
    <p style="margin:0;font-size:16px;font-weight:700;color:#111">${esc(companyName)}</p>
    ${location ? `<p style="margin:2px 0 0;font-size:13px;color:#555">${esc(location)}</p>` : ''}
  </td></tr>

  <!-- SERVICES TABLE -->
  <tr><td style="padding:0 24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#f9f9f9">
          <th style="padding:11px 16px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;text-align:left;font-weight:600">Dienst</th>
          <th style="padding:11px 16px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;text-align:right;font-weight:600">Excl. BTW</th>
          ${btwEnabled ? `<th style="padding:11px 16px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;text-align:right;font-weight:600">BTW ${btwRate}%</th>` : ''}
          <th style="padding:11px 16px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:1px;text-align:right;font-weight:600">Totaal</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
        <tr style="background:#f9f9f9;border-top:1px solid #e8e8e8">
          <td colspan="${btwEnabled ? '2' : '1'}" style="padding:10px 16px;font-size:13px;color:#555">Subtotaal</td>
          ${btwEnabled ? `<td style="padding:10px 16px;font-size:13px;color:#555;text-align:right"></td>` : ''}
          <td style="padding:10px 16px;font-size:13px;color:#111;text-align:right">€${subtotal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        </tr>
        ${btwEnabled ? `<tr style="background:#f9f9f9">
          <td colspan="2" style="padding:8px 16px;font-size:13px;color:#555">BTW ${btwRate}%</td>
          <td style="padding:8px 16px;font-size:13px;color:#555;text-align:right"></td>
          <td style="padding:8px 16px;font-size:13px;color:#555;text-align:right">€${totalBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        </tr>` : `<tr><td colspan="2" style="padding:8px 16px 4px;font-size:11px;color:#999">Vrijgesteld van BTW</td></tr>`}
        <tr style="background:#1a56db">
          <td colspan="${btwEnabled ? '2' : '1'}" style="padding:14px 16px;font-size:14px;font-weight:700;color:#fff">TOTAAL TE BETALEN</td>
          ${btwEnabled ? `<td style="padding:14px 16px;text-align:right"></td>` : ''}
          <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#fff;text-align:right">€${totalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </td></tr>

  <!-- BETAALINFORMATIE -->
  ${iban ? `<tr><td style="padding:24px 32px 8px">
    <p style="margin:0 0 12px;font-size:13px;font-weight:700;color:#111;text-transform:uppercase;letter-spacing:1px">Betaalinformatie</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;padding:16px;background:#f9f9ff">
      ${payBlock}
    </table>
  </td></tr>` : ''}

  <!-- FOOTER -->
  <tr><td style="padding:24px 32px;border-top:1px solid #f0f0f0;text-align:center">
    <p style="margin:0 0 6px;font-size:13px;color:#555">${esc(agencyName)}${myEmail ? ` · ${esc(myEmail)}` : ''}${agencyWeb ? ` · ${esc(agencyWeb)}` : ''}</p>
    <p style="margin:0;font-size:13px;color:#888">Bedankt voor uw vertrouwen</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

async function generateInvoicePDF({ invoiceNr, invoiceDate, dueDate, lead, services, amount, settings }) {
  return new Promise((resolve, reject) => {
    const s = settings || {};
    const agencyName  = s.agencyName || 'Agency AI';
    const myName      = s.myName || '';
    const myEmail     = s.gmailAddress || s.resendFromAddress || '';
    const iban        = s.bankTransferIban || '';
    const tenaam      = s.bankTransferName || agencyName;
    const bic         = s.bankTransferBic  || '';
    const btwEnabled  = s.btwEnabled === true;
    const btwRate     = parseFloat(s.btwRate) || 21;
    const companyName = lead.companyName || lead.contactName || 'Klant';
    const location    = lead.location || lead.city || '';
    const dueFmt      = new Date(dueDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const invFmt      = new Date(invoiceDate).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

    const svcs = Array.isArray(services) && services.length ? services : [{ name: 'AI-diensten', price: amount, billing: 'eenmalig' }];

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = '#1a56db';

    // Header background
    doc.rect(0, 0, doc.page.width, 90).fill('#0A0A0F');
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(22).text(agencyName, 50, 28);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(28).text('FACTUUR', 0, 24, { align: 'right' });

    // Invoice meta bar
    doc.rect(0, 90, doc.page.width, 42).fill('#18181f');
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('FACTUURNUMMER', 50, 98);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(11).text(invoiceNr, 50, 109);
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('FACTUURDATUM', doc.page.width / 2 - 60, 98, { width: 120, align: 'center' });
    doc.fill('#ffffff').font('Helvetica').fontSize(11).text(invFmt, doc.page.width / 2 - 60, 109, { width: 120, align: 'center' });
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('VERVALDATUM', 0, 98, { align: 'right' });
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(11).text(dueFmt, 0, 109, { align: 'right' });

    let y = 156;

    // Klant
    doc.fill('#888888').font('Helvetica').fontSize(9).text('AAN', 50, y);
    y += 14;
    doc.fill('#111111').font('Helvetica-Bold').fontSize(14).text(companyName, 50, y);
    y += 18;
    if (location) { doc.fill('#555555').font('Helvetica').fontSize(11).text(location, 50, y); y += 16; }
    y += 16;

    // Table header
    const cols = btwEnabled
      ? [50, 300, 390, 480]
      : [50, 360, 480];
    const tableWidth = doc.page.width - 100;
    doc.rect(50, y, tableWidth, 26).fill('#f9f9f9');
    doc.rect(50, y, tableWidth, 26).stroke('#e8e8e8');
    doc.fill('#888888').font('Helvetica-Bold').fontSize(9);
    doc.text('DIENST', cols[0] + 8, y + 9);
    doc.text('EXCL. BTW', cols[1], y + 9, { width: 80, align: 'right' });
    if (btwEnabled) doc.text(`BTW ${btwRate}%`, cols[2], y + 9, { width: 80, align: 'right' });
    doc.text('TOTAAL', cols[cols.length - 1], y + 9, { width: 80, align: 'right' });
    y += 26;

    let subtotal = 0;
    svcs.forEach((svc, idx) => {
      const price    = parseFloat(svc.price) || (amount / svcs.length);
      subtotal      += price;
      const btwAmt   = btwEnabled ? price * btwRate / 100 : 0;
      const totalRow = btwEnabled ? price + btwAmt : price;

      if (idx % 2 === 1) doc.rect(50, y, tableWidth, 24).fill('#fafafa');
      doc.rect(50, y, tableWidth, 24).stroke('#f0f0f0');

      doc.fill('#111111').font('Helvetica').fontSize(11).text((svc.name || 'Dienst') + (svc.billing === 'maandelijks' ? ' /mnd' : ''), cols[0] + 8, y + 7, { width: 220, ellipsis: true });
      doc.text(`€${price.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[1], y + 7, { width: 80, align: 'right' });
      if (btwEnabled) doc.fill('#666666').text(`€${btwAmt.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[2], y + 7, { width: 80, align: 'right' });
      doc.fill('#111111').text(`€${totalRow.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[cols.length - 1], y + 7, { width: 80, align: 'right' });
      y += 24;
    });

    // Subtotal / BTW / Total rows
    const totalBtw  = btwEnabled ? subtotal * btwRate / 100 : 0;
    const totalIncl = btwEnabled ? subtotal + totalBtw : subtotal;

    doc.rect(50, y, tableWidth, 24).fill('#f9f9f9').stroke('#e8e8e8');
    doc.fill('#555555').font('Helvetica').fontSize(11).text('Subtotaal', cols[0] + 8, y + 7);
    doc.fill('#111111').text(`€${subtotal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[cols.length - 1], y + 7, { width: 80, align: 'right' });
    y += 24;

    if (btwEnabled) {
      doc.rect(50, y, tableWidth, 22).fill('#f9f9f9').stroke('#f0f0f0');
      doc.fill('#555555').font('Helvetica').fontSize(11).text(`BTW ${btwRate}%`, cols[0] + 8, y + 6);
      doc.fill('#555555').text(`€${totalBtw.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[cols.length - 1], y + 6, { width: 80, align: 'right' });
      y += 22;
    } else {
      doc.fill('#999999').font('Helvetica').fontSize(10).text('Vrijgesteld van BTW', cols[0] + 8, y + 4);
      y += 18;
    }

    // Total row (accent)
    doc.rect(50, y, tableWidth, 32).fill(accent);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(13).text('TOTAAL TE BETALEN', cols[0] + 8, y + 10);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text(`€${totalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, cols[cols.length - 1], y + 8, { width: 80, align: 'right' });
    y += 44;

    // Payment info
    if (iban) {
      doc.fill('#111111').font('Helvetica-Bold').fontSize(12).text('BETAALINFORMATIE', 50, y);
      y += 18;
      doc.rect(50, y, tableWidth, 1).fill('#e8e8e8');
      y += 10;

      const payRows = [
        ['IBAN', iban],
        ['Tenaamstelling', tenaam],
        ...(bic ? [['BIC', bic]] : []),
        ['Omschrijving', `${companyName} / ${invoiceNr}`],
        ['Betalen voor', dueFmt],
      ];
      payRows.forEach(([label, val]) => {
        doc.fill('#888888').font('Helvetica').fontSize(10).text(label, 50, y, { width: 160 });
        doc.fill('#111111').font('Helvetica').fontSize(10).text(val, 210, y, { width: 340 });
        y += 18;
      });
    }

    // Footer
    const footerY = doc.page.height - 60;
    doc.rect(0, footerY - 1, doc.page.width, 1).fill('#f0f0f0');
    const footerParts = [agencyName, myEmail, BASE_URL].filter(Boolean).join('  ·  ');
    doc.fill('#888888').font('Helvetica').fontSize(10).text(footerParts, 50, footerY + 8, { align: 'center', width: doc.page.width - 100 });
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('Bedankt voor uw vertrouwen', 50, footerY + 24, { align: 'center', width: doc.page.width - 100 });

    doc.end();
  });
}

async function sendEmail({ to, subject, body, html, settings: _settings = {}, trackingToken, noCalendly = true, isColdOutreach = false, attachments = [] }) {
  // Normalise "to" — Resend requires a clean plain string
  const toStr = Array.isArray(to) ? to[0] : to;
  const toRaw = (typeof toStr === 'string' ? toStr : String(toStr || ''));
  console.log('[Email] Raw to value:', JSON.stringify(toRaw));
  console.log('[Email] Char codes:', [...toRaw].map(c => c.charCodeAt(0)).join(','));
  // Strip angle brackets, control chars, non-ASCII, all whitespace, lowercase
  const toFinal = toRaw
    .replace(/^<|>$/g, '')        // strip surrounding angle brackets
    .replace(/[\r\n\t\0]/g, '')   // remove newlines, tabs, null bytes
    .replace(/[^\x20-\x7E]/g, '') // remove non-printable / non-ASCII
    .replace(/\s+/g, '')          // collapse any remaining whitespace
    .toLowerCase()
    .trim();
  if (!toFinal || !toFinal.includes('@')) {
    throw new Error(`sendEmail: ongeldig "to" adres na opschoning: "${toFinal}" (origineel: ${JSON.stringify(toRaw)})`);
  }
  console.log(`[Email] Versturen naar: "${toFinal}" (origineel: ${JSON.stringify(toRaw)})`);

  const s = readJSON('settings.json') || {};

  // Auto-suppress Calendly for clients who have already submitted their intake form
  if (!noCalendly) {
    const allLeads = readJSON('leads.json') || [];
    const matchedLead = allLeads.find(l => (l.contactEmail || '').toLowerCase().trim() === toFinal);
    if (matchedLead?.intakeSubmittedAt || matchedLead?.status === 'client') noCalendly = true;
  }

  const agencyName  = s.agencyName  || _settings.agencyName || 'Agency AI';
  const myName      = s.myName      || _settings.myName     || 'Admin';
  const myTitle     = s.myTitle     || _settings.myTitle    || '';
  const htmlBody    = html || buildEmailHTML(body, agencyName, myName, myTitle, trackingToken, {
    myEmail:      s.gmailAddress || s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || '',
    calendlyLink: noCalendly ? '' : (s.calendlyUrl || ''),
    logoUrl:      s.agencyLogo ? `${BASE_URL}/api/logo` : '',
  });
  const resendKey   = s.resendApiKey || process.env.RESEND_API_KEY;
  const fromAddress = s.resendFromAddress || process.env.RESEND_FROM_ADDRESS || 'noreply@agencyai.info';
  const cleanSubject = sanitizeSubject(subject);

  if (!resendKey) {
    throw new Error('Email niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen → Email.');
  }

  const fromName = isColdOutreach
    ? `${myName || 'Benjamin van Hemert'} via Agency AI`
    : 'Agency AI';
  const replyTo  = s.gmailAddress || process.env.GMAIL_USER || 'info@agencyai.info';
  const entityId = Math.random().toString(36).substring(2, 12);
  const plainText = (body || htmlBody.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) || '';

  const { default: fetch } = await import('node-fetch');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <info@agencyai.info>`,
      to: toFinal,
      reply_to: replyTo,
      subject: cleanSubject,
      html: htmlBody,
      text: plainText,
      headers: {
        'X-Entity-Ref-ID': entityId,
        'List-Unsubscribe': `<mailto:info@agencyai.info?subject=uitschrijven>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      ...(attachments.length ? { attachments } : {})
    }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message || d.error || `Resend fout ${r.status}`);
  addActivity('email_sent', `Email verstuurd → ${toFinal}`, { cost: 0 });
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
  return process.env.GMAIL_APP_PASSWORD || process.env.IMAP_PASSWORD || '';
}
function isGmailReady(s) {
  return !!(s && (s.gmailAddress || process.env.GMAIL_USER || process.env.GMAIL_ADDRESS) && getGmailPassword(s));
}
function isResendReady(s) {
  return !!(s && (s.resendApiKey || process.env.RESEND_API_KEY));
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

// Browser-friendly auth: redirects to /login for page navigations instead of returning JSON 401
function requireAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    if (req.headers.accept?.includes('text/html')) {
      return res.redirect('/login');
    }
    return res.status(401).json({ error: 'Niet geautoriseerd' });
  }
  return authMiddleware(req, res, next);
}

// ── Auth routes (public — no middleware) ────────────────────────────────────

// Simple in-memory login rate limiter: max 10 attempts per IP per 15 minutes
const _loginAttempts = new Map();
// loginRateLimit moved to routes/auth.js — kept here as no-op in case of references
function loginRateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const now = Date.now();
  const window = 15 * 60 * 1000; // 15 minutes
  const max = 10;
  const entry = _loginAttempts.get(ip) || { count: 0, resetAt: now + window };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + window; }
  entry.count++;
  _loginAttempts.set(ip, entry);
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return res.status(429).json({ error: `Te veel inlogpogingen. Probeer het opnieuw over ${Math.ceil(retryAfter / 60)} minuten.` });
  }
  next();
}

// ── Auth routes — migrated to routes/auth.js ────────────────────────────────
app.use('/api/auth', require('./routes/auth')({ readJSON, writeJSON, JWT_SECRET }));

// ── Portal routes — migrated to routes/portal.js ────────────────────────────

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
    const serviceNames = (lead.services || []).map(s => typeof s === 'string' ? s : s.name).filter(Boolean).join('\n- ') || 'AI-marketingdiensten';
    const problemsList = (lead.selectedProblems || lead.problems || []).map(p => typeof p === 'string' ? p : p.text).filter(Boolean).join('\n- ');
    const ourEmail = lead.emailA?.body || lead.email?.body || '';
    const theirReply = (lead.replyHistory || []).map(r => r.body || r.text || '').filter(Boolean).join('\n') || '';
    const langNote = (lead.language && lead.language !== 'nl') ? 'English' : 'Dutch (Nederlands)';
    try {
      const questions = await aiJSON(`You are a project manager at an AI marketing agency generating a client intake form.

COMPANY: ${lead.companyName}
LOCATION: ${lead.location || ''}
NICHE: ${lead.niche || ''}
WEBSITE: ${lead.websiteUrl || ''}
LANGUAGE: ${langNote}

PROBLEMS WE WILL SOLVE:
${problemsList ? `- ${problemsList}` : '(not specified)'}

SERVICES PURCHASED:
- ${serviceNames}

EMAIL CONVERSATION SO FAR:
Our outreach email: ${ourEmail ? ourEmail.substring(0, 600) : '(none)'}
Their reply: ${theirReply ? theirReply.substring(0, 400) : '(no reply yet)'}

Generate 6-8 intake questions that are SPECIFIC to the problems we will solve and what was discussed.

Rules:
1. Each question must be directly useful to BUILD the deliverable (not generic)
2. Reference the specific problems and services, not general marketing goals
3. For any booking/website/chatbot build: ask exactly what content, services, prices, times are needed
4. Ask about brand style (colors, tone, examples they like) — this is always useful
5. Ask about their target audience specifically (not "who is your audience?" — be specific to their niche)
6. Reference the email conversation naturally where relevant
7. Write ALL questions in ${langNote}

BAD question: "What are your goals?"
GOOD question: "Welke 3 diensten moeten er in het boekingssysteem staan, en wat is de prijs en duur van elk?"

Return ONLY valid JSON (no markdown):
{ "questions": [{ "id": "q1", "label": "vraag tekst", "type": "text|textarea|select|url", "placeholder": "...", "options": ["optie1","optie2"] (only for type select, else null), "required": true }] }`);
      lead.intakeQuestions = questions?.questions || [];
    } catch {
      lead.intakeQuestions = [
        { id: 'q1', label: lead.language !== 'nl' ? 'What is the URL of your website?' : 'Wat is de URL van jullie website?', type: 'url', placeholder: 'https://...', required: false },
        { id: 'q2', label: lead.language !== 'nl' ? 'Who is your target audience?' : 'Wie is jullie doelgroep?', type: 'textarea', placeholder: lead.language !== 'nl' ? 'Describe your ideal customer...' : 'Beschrijf je ideale klant...', required: true },
        { id: 'q3', label: lead.language !== 'nl' ? 'What are your brand colors?' : 'Wat zijn jullie merkkleur(en)?', type: 'text', placeholder: '#2563eb, donkerblauw...', required: false },
        { id: 'q4', label: lead.language !== 'nl' ? 'Tone of voice: formal or informal?' : 'Toon van communicatie: formeel of informeel?', type: 'select', options: lead.language !== 'nl' ? ['Informal (you/your)', 'Formal (you/your — formal)'] : ['Informeel (jij/je/jouw)', 'Formeel (u/uw)'], required: true },
        { id: 'q5', label: lead.language !== 'nl' ? 'What is the most important result for the next 3 months?' : 'Wat is het belangrijkste resultaat voor de komende 3 maanden?', type: 'textarea', placeholder: lead.language !== 'nl' ? 'More leads, more bookings...' : 'Meer leads, meer boekingen...', required: true },
        { id: 'q6', label: lead.language !== 'nl' ? 'Are there examples of websites or brands you like?' : 'Zijn er websites of merken waarvan jullie de stijl mooi vinden?', type: 'textarea', placeholder: 'https://voorbeeld.nl, ...', required: false },
      ];
    }
    // Always append the two fixed file-upload prompt questions
    const isNl = lead.language === 'nl' || !lead.language;
    lead.intakeQuestions.push(
      {
        id: 'q_logo',
        label: isNl
          ? 'Heeft u een logo, huisstijl of merkrichtlijnen beschikbaar?'
          : 'Do you have a logo, brand style or brand guidelines available?',
        type: 'select',
        options: isNl
          ? ['Ja, ik upload het bij Bestanden', 'Nee, jullie mogen een stijl kiezen', 'Ik heb alleen een logo (geen huisstijl)']
          : ['Yes, I will upload it under Files', 'No, you may choose a style', 'I only have a logo (no brand guidelines)'],
        required: true
      },
      {
        id: 'q_photos',
        label: isNl
          ? "Heeft u foto's van uw bedrijf, producten of diensten die op de website moeten?"
          : 'Do you have photos of your business, products or services for the website?',
        type: 'select',
        options: isNl
          ? ["Ja, ik upload ze bij Bestanden", 'Nee, gebruik stockfoto\'s of placeholders', 'Deels — ik upload wat ik heb']
          : ['Yes, I will upload them under Files', 'No, use stock photos or placeholders', 'Partly — I will upload what I have'],
        required: true
      }
    );
    const idx = leads.findIndex(l => l.id === lead.id);
    leads[idx] = lead;
    writeJSON('leads.json', leads);
  }

  const settings = readJSON('settings.json') || {};
  res.json({
    submitted: false,
    companyName: lead.companyName,
    agencyName: settings.agencyName || 'Agency AI',
    agencyLogo: settings.agencyLogo || null,
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
  trackFunnelEvent(leads[idx].id, 'intake_completed');
  // Advance to Fase 2 — Uitvoering on intake submission
  if ((leads[idx].currentPhase || 1) < 2) leads[idx].currentPhase = 2;
  addLeadHistory(leads, leads[idx].id, { event: 'intakeSubmitted', label: 'Intake ingevuld door klant' });
  addNotification('intake_submitted', `Intake ingevuld: ${leads[idx].companyName}`, `De intake is ingevuld door ${leads[idx].contactName || leads[idx].companyName}`, leads[idx].id, `project:${leads[idx].id}`);
  fireWebhooks('intake.submitted', { leadId: leads[idx].id, companyName: leads[idx].companyName, niche: leads[idx].niche, contactEmail: leads[idx].contactEmail, submittedAt: leads[idx].intakeSubmittedAt });
  writeJSON('leads.json', leads);

  const settings = readJSON('settings.json') || {};

  // Notify team
  if (isResendReady(settings)) {
    try {
      const answersText = Object.entries(req.body.answers || {}).map(([k, v]) => `${k}: ${v}`).join('\n');
      await sendEmail({ to: settings.gmailAddress, subject: `[Intake ingevuld] ${leads[idx].companyName}`, body: `De intake van ${leads[idx].companyName} is ingevuld.\n\nAntwoorden:\n${answersText}`, settings });
    } catch { /* optional */ }
  }

  // Auto-send intake confirmation email to client
  const lead = leads[idx];
  const intakeConfirmTo = (lead.contactEmail || '').trim();
  if (settings.autoClientEmails?.intakeReceived !== false && intakeConfirmTo && isResendReady(settings)) {
    try {
      const email = await generateClientEmail(lead, 'intakeReceived', settings);
      await sendEmail({ to: intakeConfirmTo, subject: email.subject, body: email.body, settings });
      if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
      leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'intakeReceived', subject: email.subject, body: email.body, to: intakeConfirmTo, sentAt: new Date().toISOString(), sentBy: 'systeem' });
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
        const siteHtml = await aiCallBuild(`${BUILD_HTML_RULES}Build a complete HTML website for ${freshLead.companyName} (${freshLead.niche}, ${freshLead.location}).

BRAND CONTEXT:
- Headline: ${content.headline}
- Subheadline: ${content.subheadline}
- About: ${content.about}
- Services: ${servicesStr}
- CTA: ${content.ctaText}
- Accent color: ${colors.primary}

MUST include in <body>:
1. Sticky navigation with all sections + hamburger on mobile
2. Full-viewport hero: use the headline, subheadline, a stats row, and two CTA buttons
3. Over ons section: about text + 3 value cards (icon + title + description)
4. Diensten section: service cards with icon, title, description
5. Contact section with form posting to /api/sites/${(freshLead.companyName||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}/contact
6. Footer with company name, location, copyright
Use ${colors.primary} as accent color. Scroll-triggered animations. Mobile responsive.`);

        const siteSlug = generateSiteSlug(freshLead.companyName);
        const sitesDir = path.join(__dirname, 'public', 'sites', siteSlug);
        fs.mkdirSync(sitesDir, { recursive: true });
        fs.writeFileSync(path.join(sitesDir, 'index.html'), siteHtml, 'utf8');

        const baseUrl = BASE_URL;
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
        leads[idx].emailOpened = true;
        addLeadHistory(leads, leads[idx].id, { event: 'opened', label: 'Email geopend' });
        addActivity('open', 'Email geopend door ' + (leads[idx].companyName || 'Onbekend'), { meta: { leadId: leads[idx].id } });
        trackFunnelEvent(leads[idx].id, 'email_opened');
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

// ── Portal API routes — migrated to routes/portal.js ────────────────────────
app.use('/api/portal', require('./routes/portal')({ readJSON, writeJSON, addNotification, addLeadHistory, computeRealAnalytics }));

// === LEGACY portal routes below — superseded by routes/portal.js above ===
// Express matches the router first; these are unreachable but kept for reference
// during migration. Delete in the next cleanup pass.
if (false) { /* eslint-disable-line no-constant-condition */
app.get('/api/portal/:token', (req, res) => {
  const leads   = readJSON('leads.json') || [];
  const lead    = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
  if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd. Neem contact op met uw accountmanager.' });
  const settings = readJSON('settings.json') || {};
  const settingsSvcs = settings.services || [];
  const rawSvcs = (lead.projectServices && lead.projectServices.length)
    ? lead.projectServices : (lead.services || []);
  const enrichedSvcs = rawSvcs.map(s => {
    const sName   = typeof s === 'string' ? s : (s.name || '');
    const match   = settingsSvcs.find(ss => ss.name === sName);
    const price   = typeof s === 'object' ? (parseFloat(s.price)   || 0) : (parseFloat(match?.price)   || 0);
    const billing = typeof s === 'object' ? (s.billing || 'maandelijks') : (match?.billing || 'maandelijks');
    return { name: sName, price, billing, description: match?.description || '' };
  }).filter(s => s.name);
  res.json({
    companyName:         lead.companyName,
    agencyName:          settings.agencyName || 'Agency AI',
    agencyLogo:          settings.agencyLogo || null,
    myName:              settings.myName || '',
    currentPhase:        lead.currentPhase || 1,
    estimatedCompletion: lead.estimatedCompletion || null,
    services:            enrichedSvcs,
    reports:             (lead.reports || []).map(r => ({ title: r.title, month: r.month, createdAt: r.createdAt, content: r.content })),
    delivery:            lead.delivery || null,
    generatedSite:       lead.generatedSite ? { siteUrl: lead.generatedSite.siteUrl, status: lead.generatedSite.status, generatedAt: lead.generatedSite.generatedAt } : null,
    calendlyUrl:         settings.calendlyUrl || null,
    payments:            (lead.payments || []).map(p => ({
                           id: p.id, description: p.description, amount: p.amount,
                           status: p.status, dueDate: p.dueDate, paidAt: p.paidAt,
                           paymentUrl: p.paymentUrl, type: p.type, billing: p.billing
                         })),
    messages:            (lead.clientMessages || []),
    timeline:            (lead.history || []).slice(-40).reverse(),
    analytics:           computeRealAnalytics(lead),
    portalChat:          lead.portalChat || [],
    documents:           (lead.documents || []).filter(d => d.visible !== false),
    portalWelcomeMessage: lead.portalWelcomeMessage || null,
    approvedDeliverables: (lead.agentDeliverables || [])
      .filter(d => d.clientVisible === true)
      .map(d => ({ service: d.service, type: d.type, deliverableType: d.deliverableType, url: d.url, approvedAt: d.approvedAt, builtAt: d.builtAt })),
    sharedProjectFiles: (lead.projectFiles || [])
      .filter(f => f.sharedWithClient)
      .map(f => ({ id: f.id, name: f.name, type: f.type, url: f.url, fullUrl: f.fullUrl, createdAt: f.createdAt })),
    projectServices: enrichedSvcs,
    contactSubmissions: (lead.contactSubmissions || []).slice(0, 20),
    clientUploads: (lead.clientUploads || []).map(({ content: _c, ...f }) => f)
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
  if (!lead.portalChat) lead.portalChat = [];
  lead.portalChat.push({ id: 'pc-' + Date.now(), from: 'client', name, message, time: new Date().toISOString() });
  const preview = message.length > 60 ? message.substring(0, 60) + '...' : message;
  addLeadHistory(leads, lead.id, { event: 'clientMessage', label: `Klant bericht van ${name}: ${preview}` });
  writeJSON('leads.json', leads);
  addNotification('client_question', `Klant vraag: ${lead.companyName}`, `${name}: ${preview}`, lead.id, `project:${lead.id}`);
  res.json({ ok: true });
});

app.get('/api/portal/:token/chat', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Portaal niet gevonden' });
  res.json({ chat: lead.portalChat || [], companyName: lead.companyName });
});

app.post('/api/portal/:token/upload', express.json({ limit: '15mb' }), async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.portalToken === req.params.token);
  if (li === -1) return res.status(404).json({ error: 'Niet gevonden' });
  if (leads[li].portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });

  const { filename, mimeType, dataBase64, size } = req.body || {};
  if (!filename || !dataBase64) return res.status(400).json({ error: 'Bestandsnaam en data verplicht' });

  const allowed = ['image/jpeg','image/png','image/svg+xml','image/gif','image/webp','application/pdf','application/zip'];
  if (!allowed.includes(mimeType)) return res.status(400).json({ error: 'Bestandstype niet toegestaan' });
  if (size > 10 * 1024 * 1024) return res.status(400).json({ error: 'Bestand te groot (max 10MB)' });

  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  // Strip data-URL prefix if present; store raw base64 in DB (survives Railway redeploys)
  const rawBase64 = dataBase64.replace(/^data:[^;]+;base64,/, '');

  const fileInfo = {
    id: Date.now().toString(36),
    filename: safeName,
    mimeType,
    size,
    content: rawBase64,
    uploadedAt: new Date().toISOString(),
    usedInBuild: false
  };
  leads[li].clientUploads = leads[li].clientUploads || [];
  const alreadyExists = leads[li].clientUploads.some(u => u.filename === fileInfo.filename);
  if (!alreadyExists) leads[li].clientUploads.push(fileInfo);
  console.log('[Upload] Saving to lead:', leads[li].id, leads[li].companyName);
  console.log('[Upload] clientUploads count:', leads[li].clientUploads.length);
  writeJSON('leads.json', leads);

  addNotification('client_question', `📎 Bestand geüpload: ${safeName}`, `${leads[li].companyName} heeft een bestand geüpload`, leads[li].id, `project:${leads[li].id}`);

  // Return without content to keep response small
  const { content: _c, ...fileInfoPublic } = fileInfo;
  res.json({ ok: true, file: fileInfoPublic });
});

app.delete('/api/portal/:token/upload/:filename', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.portalToken === req.params.token);
  if (li === -1) return res.status(404).json({ error: 'Niet gevonden' });
  if (leads[li].portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });

  const safeName = req.params.filename.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  const uploads = leads[li].clientUploads || [];
  if (!uploads.find(f => f.filename === safeName)) return res.status(404).json({ error: 'Bestand niet gevonden' });

  leads[li].clientUploads = uploads.filter(f => f.filename !== safeName);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

function _findUpload(uploads, rawFilename) {
  if (!uploads || !rawFilename) return null;
  let decoded = rawFilename;
  try { decoded = decodeURIComponent(rawFilename); } catch { /* use raw */ }
  const sanitized = decoded.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 100);
  return uploads.find(u =>
    u.filename === rawFilename ||
    u.filename === decoded ||
    u.filename === sanitized ||
    u.filename.replace(/\s+/g, '_') === rawFilename ||
    u.filename.replace(/\s+/g, '_') === decoded
  ) || null;
}

function _serveUpload(upload, res) {
  if (!upload || !upload.content) return res.status(404).json({ error: 'Bestandsinhoud niet beschikbaar' });
  const buffer = Buffer.from(upload.content, 'base64');
  res.setHeader('Content-Type', upload.mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${upload.filename}"`);
  res.send(buffer);
}

app.get('/api/portal/:token/download/:filename', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  if (lead.portalBlocked) return res.status(403).json({ error: 'Toegang geblokkeerd' });

  const filename = req.params.filename;
  console.log('[Download] filename param:', filename);
  console.log('[Download] clientUploads count:', lead.clientUploads?.length);
  console.log('[Download] upload filenames:', lead.clientUploads?.map(u => u.filename));
  const upload = _findUpload(lead.clientUploads, filename);
  console.log('[Download] found upload:', upload ? 'yes, content length: ' + upload.content?.length : 'NOT FOUND');
  if (!upload) return res.status(404).json({ error: 'Bestand niet gevonden' });
  _serveUpload(upload, res);
});
} // end legacy portal stubs

// Public route — client uploaded files served from built websites (no auth required)
app.get('/api/sites/:siteSlug/uploads/:filename', (req, res) => {
  console.log('[PublicUpload] hit');
  console.log('[PublicUpload] siteSlug:', req.params.siteSlug);
  console.log('[PublicUpload] filename:', req.params.filename);
  if (!/^[a-z0-9-]+$/.test(req.params.siteSlug)) return res.status(404).json({ error: 'Niet gevonden' });
  const leads = readJSON('leads.json') || []; // readJSON hits SQLite directly — always fresh
  console.log('[PublicUpload] leads count:', leads.length);
  const slug = req.params.siteSlug;
  console.log('[PublicUpload] All lead slugs:', leads.map(l => ({
    name: l.companyName,
    siteSlug: l.siteSlug,
    generatedSlug: l.generatedSite?.siteSlug,
    computed: (l.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  })));
  const lead = leads.find(l => {
    const computed = (l.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return l.siteSlug === slug ||
      l.generatedSite?.siteSlug === slug ||
      computed === slug ||
      computed.includes(slug) ||
      slug.includes(computed);
  });
  console.log('[PublicUpload] lead found:', lead ? lead.companyName : 'NOT FOUND');
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  console.log('[PublicUpload] clientUploads count:', lead.clientUploads?.length || 0);
  const upload = _findUpload(lead.clientUploads, req.params.filename);
  console.log('[PublicUpload] upload found:', upload ? 'yes, content length: ' + upload.content?.length : 'NOT FOUND');
  if (!upload) return res.status(404).json({ error: 'Bestand niet gevonden' });
  _serveUpload(upload, res);
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

// Public contact form — must be BEFORE app.use('/api', authMiddleware)
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
  addNotification('contact_form', `Nieuwe aanvraag: ${name}`, `${company ? company + ' — ' : ''}${service || 'Algemene aanvraag'}`, null, 'contacts');
  const settings = readJSON('settings.json') || {};
  if (isResendReady(settings)) {
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

// ── /bestellen page (public) ──────────────────────────────────────────────────
app.get('/bestellen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'bestellen.html'));
});

// Public order form — must be BEFORE app.use('/api', authMiddleware)
app.post('/api/order', async (req, res) => {
  const { name, company, email, phone, service, message } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Naam en email zijn verplicht' });

  // Save to contacts with type "order"
  const contacts = readJSON('contacts.json') || [];
  const contactId = Date.now().toString(36) + Math.random().toString(36).substr(2, 4);
  contacts.unshift({
    id: contactId, name, company: company || '', email, phone: phone || '',
    service: service || '', message: message || '',
    type: 'order', createdAt: new Date().toISOString(), status: 'new'
  });
  writeJSON('contacts.json', contacts);

  // Create lead in pipeline with status "besteld"
  const settings   = readJSON('settings.json') || {};
  const allLeads   = readJSON('leads.json')    || [];
  const allServices = settings.services || DEFAULT_SERVICES;
  const matchedSvc = allServices.find(s => s.name === service);
  const leadId = 'ord-' + Date.now().toString(36);
  const newLead = {
    id: leadId,
    companyName:   company || name,
    contactName:   name,
    contactEmail:  email,
    phone:         phone || '',
    niche:         matchedSvc ? 'bestelling' : 'bestelling',
    location:      '',
    status:        'besteld',
    source:        'bestellen',
    services:      matchedSvc ? [{ name: matchedSvc.name, price: matchedSvc.price, billing: matchedSvc.billing }] : (service ? [{ name: service, price: 0, billing: 'eenmalig' }] : []),
    estimatedValue: matchedSvc ? matchedSvc.price : 0,
    notes:         message || '',
    history:       [{ event: 'ordered', label: `Bestelling geplaatst via website: ${service || '—'}`, createdAt: new Date().toISOString() }],
    createdAt:     new Date().toISOString()
  };
  allLeads.unshift(newLead);
  writeJSON('leads.json', allLeads);

  // Notify admin
  addNotification('contact_form', `Nieuwe bestelling: ${name}`, `${company ? company + ' — ' : ''}${service || 'Dienst onbekend'}`, leadId, `project:${leadId}`);

  // Confirmation email to customer
  if (isResendReady(settings)) {
    try {
      const calendlyCta = settings.calendlyUrl ? `\n\nWil je alvast een gesprek inplannen om de details door te nemen?\n${settings.calendlyUrl}` : '';
      await sendEmail({
        to: email,
        subject: `Bestelling ontvangen — ${settings.agencyName || 'Agency AI'}`,
        body: `Hoi ${name},\n\nBedankt voor je bestelling! We hebben je aanvraag voor "${service || 'onze dienst'}" ontvangen.\n\nWe nemen binnen 1 werkdag contact met je op om alles door te nemen.${calendlyCta}\n\nMet vriendelijke groet,\n${settings.myName || 'Het team'}\n${settings.agencyName || 'Agency AI'}`,
        settings
      });
    } catch (_) { /* non-critical */ }
  }

  // Notification email to admin
  if (isResendReady(settings)) {
    try {
      await sendEmail({
        to: settings.gmailAddress,
        subject: `Nieuwe bestelling: ${name}${company ? ' — ' + company : ''} — ${service}`,
        body: `Nieuwe bestelling via de website:\n\nNaam: ${name}\nBedrijf: ${company || '—'}\nEmail: ${email}\nTelefoon: ${phone || '—'}\nDienst: ${service || '—'}\n\nBericht:\n${message || '—'}\n\nLead aangemaakt in pipeline: ${leadId}`,
        settings
      });
    } catch (_) { /* non-critical */ }
  }

  res.json({ ok: true, leadId });
});

// Public booking form — MexyDigital (and any future client sites)
app.post('/api/booking/:client', async (req, res) => {
  const { service, price, duration, date, time, naam, bedrijf, email, tel, website, notities } = req.body;
  if (!naam || !email) return res.status(400).json({ error: 'Naam en email zijn verplicht' });

  const client = req.params.client;
  const contacts = readJSON('contacts.json') || [];
  contacts.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    name: naam, company: bedrijf || '', email, phone: tel || '',
    website: website || '', service, message: notities || '',
    bookingDate: date, bookingTime: time, bookingDuration: duration, bookingPrice: price,
    type: 'booking', client, createdAt: new Date().toISOString(), status: 'new'
  });
  writeJSON('contacts.json', contacts);

  addNotification('contact_form', `Nieuwe boeking: ${naam}`, `${bedrijf ? bedrijf + ' — ' : ''}${service} op ${date} ${time}`, null, 'contacts');

  const settings = readJSON('settings.json') || {};
  if (isResendReady(settings)) {
    try {
      await sendEmail({
        to: email,
        subject: `Afspraak bevestigd: ${service} op ${date} om ${time}`,
        body: `Hoi ${naam},\n\nJe afspraak is bevestigd!\n\nDienst: ${service} (${price})\nDatum: ${date}\nTijd: ${time}\nDuur: ${duration}\n${bedrijf ? 'Bedrijf: ' + bedrijf + '\n' : ''}${website ? 'Website: ' + website + '\n' : ''}\n${notities ? 'Notities: ' + notities + '\n\n' : '\n'}We kijken ernaar uit!\n\nMet vriendelijke groet,\nHet MexyDigital team`,
        settings
      });
    } catch (_) { /* non-critical */ }
    try {
      await sendEmail({
        to: settings.gmailAddress,
        subject: `Nieuwe afspraak: ${naam} — ${service}`,
        body: `Er is een nieuwe afspraak gemaakt via de boekingspagina.\n\nNaam: ${naam}\n${bedrijf ? 'Bedrijf: ' + bedrijf + '\n' : ''}Email: ${email}\n${tel ? 'Telefoon: ' + tel + '\n' : ''}Dienst: ${service} (${price})\nDatum: ${date}\nTijd: ${time}\nDuur: ${duration}\n${notities ? '\nNotities: ' + notities : ''}`,
        settings
      });
    } catch (_) { /* non-critical */ }
  }

  res.json({ ok: true });
});

// Public services list — used by landing page (must be before authMiddleware)
app.get('/api/services', (req, res) => {
  const settings = readJSON('settings.json') || {};
  res.json(settings.services || DEFAULT_SERVICES);
});

// Contact form submissions from built client sites — public, no auth
app.post('/api/sites/:siteSlug/contact', async (req, res) => {
  if (!/^[a-z0-9-]+$/.test(req.params.siteSlug)) return res.status(404).json({ error: 'Niet gevonden' });
  const { name, email, phone, message, service } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Naam en email zijn verplicht' });

  const siteSlug = req.params.siteSlug;
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};

  // Find lead whose generated site matches this slug
  const lead = leads.find(l => {
    if (l.generatedSite?.siteSlug === siteSlug) return true;
    if ((l.agentBuilds || []).some(b => (b.url || '').includes(`/sites/${siteSlug}/`))) return true;
    const compSlug = (l.companyName || '').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return compSlug === siteSlug;
  });

  const submission = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    name, email, phone: phone || '', message: message || '', service: service || '',
    siteSlug, submittedAt: new Date().toISOString()
  };

  if (lead) {
    if (!lead.contactSubmissions) lead.contactSubmissions = [];
    lead.contactSubmissions.unshift(submission);
    addLeadHistory(leads, lead.id, { event: 'contactFormSubmission', label: `Contactformulier ingevuld door ${name} via gebouwde website` });
    writeJSON('leads.json', leads);

    // Notify lead's contact email
    if (lead.contactEmail && isResendReady(settings)) {
      const bodyText = `Hallo,\n\nEr is een nieuw bericht via uw website:\n\nNaam: ${name}\nEmail: ${email}${phone ? `\nTelefoon: ${phone}` : ''}${service ? `\nDienst: ${service}` : ''}\n\nBericht:\n${message || '(geen bericht)'}\n\nU kunt reageren via uw portaal.\n\nMet vriendelijke groet,\n${settings.agencyName || 'Agency AI'}`;
      sendEmail({ to: lead.contactEmail, subject: `Nieuw contactbericht via uw website — ${name}`, body: bodyText, settings, noCalendly: true }).catch(e => console.error('[Site contact email]', e.message));
    }
    addNotification('client_question', `Contactformulier: ${lead.companyName}`, `${name}: ${(message || service || '').substring(0, 80)}`, lead.id, `project:${lead.id}`);
  } else {
    // Save as generic contact if lead not found
    const contacts = readJSON('contacts.json') || [];
    contacts.unshift({ ...submission, type: 'site_contact', source: siteSlug });
    writeJSON('contacts.json', contacts);
  }

  res.json({ success: true });
});

app.use('/api', authMiddleware);
app.use('/data/uploads', authMiddleware, express.static(path.join(__dirname, 'data', 'uploads')));

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
  const { companyName, websiteUrl, instagramHandle, niche, location, country, estimatedFollowers, companySize, email } = req.body || {};
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

    // Email: 1) use manually entered email, or 2) find via web search
    const cleanEmail = (email || '').toLowerCase().trim();
    if (cleanEmail && cleanEmail.includes('@')) {
      lead.email = cleanEmail;
      console.log(`[Manual] Email handmatig opgegeven: ${lead.email}`);
    } else {
      console.log(`[Manual] Geen email opgegeven — web search starten...`);
      try {
        const domain = websiteUrl ? websiteUrl.replace(/^https?:\/\//,'').replace(/^www\./,'').split('/')[0] : '';
        const searchQuery = `${companyName} ${domain} contact email`;
        console.log(`[Manual] Web search query: "${searchQuery}"`);
        const searchText = await aiWebSearch(searchQuery);
        console.log(`[Manual] Web search resultaat (eerste 300 tekens): ${(searchText || '').substring(0, 300)}`);
        const allMatches = (searchText.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g) || []);
        console.log(`[Manual] Gevonden email adressen: ${JSON.stringify(allMatches)}`);
        const validEmail = allMatches.find(e =>
          !e.includes('@example') && !e.includes('@test.') && !e.includes('@sentry') &&
          !/noreply|no-reply|donotreply/i.test(e) &&
          !/\.(png|jpg|gif|svg|css|js|woff|ico|pdf)$/i.test(e)
        );
        if (validEmail) {
          lead.email = validEmail.toLowerCase();
          console.log(`[Manual] Email geselecteerd: ${lead.email}`);
        } else {
          console.log(`[Manual] Geen geldig email gevonden via web search — doorgaan zonder email`);
        }
      } catch (searchErr) {
        console.warn(`[Manual] Web search mislukt: ${searchErr.message} — doorgaan zonder email`);
      }
    }

    console.log(`[Manual] lead.email voor processOneLead: "${lead.email || 'leeg'}"`);
    const result = await processOneLead(lead, settings, { manualRun: true });
    if (!result) return res.status(400).json({ error: 'Overgeslagen: bedrijf staat op de blacklist' });
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

app.get('/api/leads/unread-portal-count', authMiddleware, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const count = leads.filter(l =>
    (l.portalChat || []).some(m => m.from === 'client' && !m.readAt)
  ).length;
  res.json({ count });
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
    const lead = leads[idx];
    if (req.body.status === 'client') {
      updateMemoryConversion(lead.niche, lead.country, 'converted', lead.estimatedFollowers, lead.website?.speedScore);
    } else if (req.body.status === 'dead' || req.body.status === 'disapproved') {
      updateMemoryConversion(lead.niche, lead.country, 'lost', lead.estimatedFollowers, lead.website?.speedScore);
    }
  }
  if (req.body.projectBilling !== undefined || req.body.projectDuration !== undefined || req.body.projectStartDate !== undefined || req.body.estimatedValue !== undefined) {
    const b = req.body;
    const parts = [];
    if (b.projectBilling) parts.push(`facturering: ${b.projectBilling}`);
    if (b.projectDuration !== undefined) parts.push(`looptijd: ${b.projectDuration ? b.projectDuration + ' mnd' : 'onbepaald'}`);
    if (b.projectStartDate) parts.push(`start: ${b.projectStartDate}`);
    if (b.estimatedValue) parts.push(`prijs: €${b.estimatedValue}`);
    if (parts.length) addLeadHistory(leads, req.params.id, { event: 'projectConfig', label: `Project config bijgewerkt — ${parts.join(', ')}` });
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
  let tIdx = (leads[idx].tasks || []).findIndex(t => t.id === req.params.taskId);
  // Legacy fallback: tasks created before IDs were assigned — try numeric index
  if (tIdx === -1 && /^\d+$/.test(req.params.taskId)) {
    const numIdx = parseInt(req.params.taskId);
    if (numIdx >= 0 && numIdx < (leads[idx].tasks || []).length) {
      tIdx = numIdx;
      // Assign a real ID now so future calls use it
      if (!leads[idx].tasks[tIdx].id) {
        leads[idx].tasks[tIdx].id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      }
    }
  }
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
      if (allDone && lead.contactEmail && isResendReady(settings)) {
        // Only send once (check log)
        const alreadySent = (lead.clientEmailLog || []).some(e => e.trigger === 'weekComplete' && e.week === week);
        if (!alreadySent) {
          try {
            const email = await generateClientEmail(lead, 'weekComplete', settings, { week, tasksDone: weekTasks.length, tasksTotal: weekTasks.length });
            await sendEmail({ to: lead.contactEmail, subject: email.subject, body: email.body, settings });
            const freshLeads = readJSON('leads.json') || [];
            const fIdx = freshLeads.findIndex(l => l.id === lead.id);
            if (fIdx !== -1) {
              if (!freshLeads[fIdx].clientEmailLog) freshLeads[fIdx].clientEmailLog = [];
              freshLeads[fIdx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'weekComplete', week, subject: email.subject, body: email.body, to: lead.contactEmail, sentAt: new Date().toISOString(), sentBy: 'systeem' });
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
    console.log(`[ProjectStart] Lead: "${lead.companyName}" | contactEmail: ${JSON.stringify(lead.contactEmail)} | type: ${typeof lead.contactEmail} | email field type: ${typeof lead.email}`);
    // Step 1 — Portal token
    send(1, 'Portaaltoegang instellen', 'running');
    if (!lead.portalToken) {
      lead.portalToken = crypto.randomBytes(16).toString('hex');
    }
    const portalUrl = `${BASE_URL}/portal/${lead.portalToken}`;
    send(1, 'Portaaltoegang instellen', 'done', { portalUrl });

    // Step 2 — Intake token + persist both tokens immediately
    send(2, 'Intake link genereren', 'running');
    if (!lead.intakeToken) {
      lead.intakeToken = crypto.randomBytes(16).toString('hex');
    }
    const intakeUrl = `${BASE_URL}/intake/${lead.id}/${lead.intakeToken}`;
    // Save tokens now so links are valid even if later steps fail
    writeJSON('leads.json', leads);
    send(2, 'Intake link genereren', 'done', { intakeUrl });

    // Step 3 — Welcome email to client
    send(3, 'Welkomstmail versturen', 'running');
    const clientEmail = (lead.contactEmail || '').trim();
    const clientName = lead.contactName || lead.companyName;
    let emailSent = false;
    if (clientEmail && isResendReady(settings)) {
      try {
        const welcomeBody = `Beste ${clientName},\n\nWelkom! We zijn verheugd om samen te werken.\n\nVia de onderstaande link kun je jouw intake-vragenlijst invullen, zodat we zo snel mogelijk kunnen starten:\n${intakeUrl}\n\nHeb je vragen? Stuur dan gerust een bericht via je klantportaal:\n${portalUrl}\n\nMet vriendelijke groet,\n${settings.myName}\n${settings.myTitle || ''}\n${settings.agencyName}`;
        await sendEmail({ to: clientEmail, subject: `Welkom bij ${settings.agencyName} — volgende stappen`, body: welcomeBody, settings, noCalendly: true });
        emailSent = true;
      } catch (emailErr) {
        console.warn(`[Project] Welkomstmail mislukt voor ${lead.companyName}:`, emailErr.message);
      }
    }
    send(3, 'Welkomstmail versturen', emailSent ? 'done' : 'skipped', { note: emailSent ? clientEmail : 'Geen email of Email niet geconfigureerd' });

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

    // Step 5 — AI onboarding video script
    send(5, 'Video onboarding script genereren (AI)', 'running');
    let onboardingScript = null;
    try {
      const serviceNames5 = (lead.services || []).map(s => s.name).join(', ') || 'AI-marketingdiensten';
      onboardingScript = await aiCall(`Je bent een vriendelijke projectmanager bij ${settings.agencyName || 'Agency AI'}.
Schrijf een persoonlijk 60-seconden welkomstscript (gesproken tekst) voor een korte onboarding video voor nieuwe klant ${lead.companyName || 'de klant'} (${lead.niche || 'ondernemer'}, ${lead.location || ''}).
Diensten die wij leveren: ${serviceNames5}.
Schrijfstijl: warm, professioneel, concreet. Gebruik "u" of "jullie" consequent.
Structuur: (1) korte begroeting + felicitatie, (2) wat we samen gaan doen (diensten), (3) de 3 stappen voor vandaag (intake invullen, portaal bookmarken, afspraak inplannen), (4) slotwoord.
Maximaal 150 woorden. Schrijf ALLEEN de gesproken tekst, geen regieaanwijzingen of timestamps.`);
    } catch { onboardingScript = null; }
    send(5, 'Video onboarding script genereren (AI)', onboardingScript ? 'done' : 'skipped');

    // Step 6 — AI content calendar
    send(6, 'Content kalender genereren (AI)', 'running');
    let contentCalendar = null;
    try {
      contentCalendar = await aiJSON(`Maak een content kalender voor maand 1 voor ${lead.companyName} (${lead.niche}).
Antwoord ALLEEN als JSON: { "items": [{ "week": 1, "platform": "Instagram/Facebook/LinkedIn", "type": "Reel/Post/Story", "topic": "string", "caption": "string (kort)" }, ...8 items total] }`);
    } catch { contentCalendar = { items: [] }; }
    send(6, 'Content kalender genereren (AI)', 'done');

    // Step 7 — AI week-1 tasks
    send(7, 'Week 1 takenlijst aanmaken (AI)', 'running');
    let tasks = null;
    try {
      tasks = await aiJSON(`Maak een takenlijst voor week 1 van het project voor ${lead.companyName}.
Antwoord ALLEEN als JSON: { "tasks": [{ "title": "string", "description": "string", "priority": "hoog/middel/laag", "day": "ma/di/wo/do/vr" }, ...6-8 items] }`);
    } catch { tasks = { tasks: [] }; }
    send(7, 'Week 1 takenlijst aanmaken (AI)', 'done');

    // Step 8 — Team briefing email (includes onboarding script)
    send(8, 'Team briefing versturen', 'running');
    let briefingSent = false;
    if (isResendReady(settings)) {
      try {
        const scriptSection = onboardingScript ? `\n\n--- ONBOARDING VIDEO SCRIPT ---\n${onboardingScript}\n--- EINDE SCRIPT ---` : '';
        const briefBody = `Nieuw project gestart: ${lead.companyName}\n\nNiche: ${lead.niche} | Locatie: ${lead.location}\nDiensten: ${(lead.services || []).map(s => s.name).join(', ')}\nGeschat maandbedrag: €${lead.estimatedValue || 0}\n\nProjectplan: ${projectPlan?.title || ''}\n${projectPlan?.overview || ''}\n\nIntake link (voor klant): ${intakeUrl}\nKlantportaal: ${portalUrl}\n\nWeek 1 focus: ${projectPlan?.weeks?.[0]?.focus || 'Onboarding'}${scriptSection}`;
        await sendEmail({ to: settings.gmailAddress, subject: `[Project gestart] ${lead.companyName}`, body: briefBody, settings });
        briefingSent = true;
      } catch { /* optional */ }
    }
    send(8, 'Team briefing versturen', briefingSent ? 'done' : 'skipped');

    // Step 9 — Status update
    send(9, 'Status bijwerken naar klant', 'running');
    lead.status = 'client';
    lead.projectStartedAt = new Date().toISOString();
    lead.projectPlan = projectPlan;
    trackFunnelEvent(lead.id, 'project_started');
    lead.contentCalendar = contentCalendar;
    lead.onboardingScript = onboardingScript || null;
    lead.tasks = (tasks?.tasks || []).map(t => ({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      ...t,
      week: t.week || 1,
      status: t.status || 'todo',
      createdAt: new Date().toISOString()
    }));
    addLeadHistory(leads, lead.id, { event: 'projectStarted', label: 'Project gestart via Project Engine' });
    writeJSON('leads.json', leads);
    send(9, 'Status bijwerken naar klant', 'done');

    send(0, 'Project engine voltooid', 'complete', { intakeUrl, portalUrl });
  } catch (err) {
    send(0, err.message, 'error');
  }
  res.end();
});

// ─── Proposal PDF + Email builders ──────────────────────────────────────────

function buildProposalEmailHTML({ proposalNr, lead, services, total, note, validUntil, settings }) {
  const s           = settings || {};
  const agencyName  = s.agencyName || 'Agency AI';
  const myName      = s.myName || '';
  const myEmail     = s.gmailAddress || s.resendFromAddress || '';
  const logoUrl     = s.agencyLogo ? `${BASE_URL}/api/logo` : '';
  const companyName = lead.companyName || 'Klant';
  const contactName = lead.contactName || companyName;
  const btwEnabled  = s.btwEnabled === true;
  const btwRate     = parseFloat(s.btwRate) || 21;
  const dueFmt      = validUntil ? new Date(validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  const svcsHtml = services.map(svc => `
    <tr>
      <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #f0f0f0">${esc(svc.name || '')}</td>
      <td style="padding:10px 16px;font-size:13px;color:#555;border-bottom:1px solid #f0f0f0">${esc(svc.description || '')}</td>
      <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #f0f0f0;text-align:right;white-space:nowrap">€${parseFloat(svc.price || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })}${svc.billing === 'maandelijks' ? '<span style="font-size:11px;color:#888">/mnd</span>' : ''}</td>
    </tr>`).join('');

  const subtotal  = services.reduce((sum, sv) => sum + parseFloat(sv.price || 0), 0);
  const btwAmt    = btwEnabled ? subtotal * btwRate / 100 : 0;
  const totalIncl = btwEnabled ? subtotal + btwAmt : subtotal;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
  <tr><td style="background:#0A0A0F;padding:28px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td>${logoUrl ? `<img src="${logoUrl}" height="36" alt="${esc(agencyName)}" style="border-radius:4px">` : `<span style="color:#fff;font-size:20px;font-weight:700">${esc(agencyName)}</span>`}</td>
      <td align="right"><span style="color:#fff;font-size:26px;font-weight:800;letter-spacing:2px">VOORSTEL</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#18181f;padding:14px 32px">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="color:#aaa;font-size:11px">VOORSTELNNUMMER<br><span style="color:#fff;font-size:13px;font-weight:600">${esc(proposalNr)}</span></td>
      ${dueFmt ? `<td align="right" style="color:#aaa;font-size:11px">GELDIG TOT<br><span style="color:#fff;font-size:13px;font-weight:600">${dueFmt}</span></td>` : ''}
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 32px 16px">
    <p style="margin:0 0 12px;font-size:15px;color:#111">Beste ${esc(contactName)},</p>
    <p style="margin:0;font-size:14px;color:#374151;line-height:1.7">Bedankt voor uw interesse. Graag presenteren wij ons voorstel op maat voor <strong>${esc(companyName)}</strong>. Bijgevoegd vindt u de volledige PDF.</p>
    ${note ? `<p style="margin:12px 0 0;font-size:14px;color:#374151;line-height:1.7;padding:12px 16px;background:#f9f9ff;border-left:3px solid #1a56db;border-radius:0 8px 8px 0">${esc(note)}</p>` : ''}
  </td></tr>
  <tr><td style="padding:0 24px">
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e8e8e8;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#f9f9f9">
        <th style="padding:10px 16px;font-size:11px;color:#888;text-transform:uppercase;text-align:left;font-weight:600">Dienst</th>
        <th style="padding:10px 16px;font-size:11px;color:#888;text-transform:uppercase;text-align:left;font-weight:600">Omschrijving</th>
        <th style="padding:10px 16px;font-size:11px;color:#888;text-transform:uppercase;text-align:right;font-weight:600">Prijs</th>
      </tr></thead>
      <tbody>
        ${svcsHtml}
        <tr style="background:#f9f9f9;border-top:1px solid #e8e8e8">
          <td colspan="2" style="padding:10px 16px;font-size:13px;color:#555">Subtotaal</td>
          <td style="padding:10px 16px;font-size:13px;color:#111;text-align:right">€${subtotal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        </tr>
        ${btwEnabled ? `<tr style="background:#f9f9f9"><td colspan="2" style="padding:8px 16px;font-size:13px;color:#555">BTW ${btwRate}%</td><td style="padding:8px 16px;font-size:13px;color:#555;text-align:right">€${btwAmt.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td></tr>` : ''}
        <tr style="background:#1a56db">
          <td colspan="2" style="padding:14px 16px;font-size:14px;font-weight:700;color:#fff">TOTAAL${btwEnabled ? ' INCL. BTW' : ''}</td>
          <td style="padding:14px 16px;font-size:18px;font-weight:800;color:#fff;text-align:right">€${totalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</td>
        </tr>
      </tbody>
    </table>
  </td></tr>
  <tr><td style="padding:24px 32px;text-align:center">
    <p style="margin:0 0 8px;font-size:14px;color:#374151">Vragen? Reageer direct op deze e-mail.</p>
    <p style="margin:0;font-size:14px;color:#555">Met vriendelijke groet,<br><strong>${esc(myName || agencyName)}</strong>${myEmail ? `<br><a href="mailto:${esc(myEmail)}" style="color:#1a56db">${esc(myEmail)}</a>` : ''}</p>
  </td></tr>
  <tr><td style="padding:16px 32px;border-top:1px solid #f0f0f0;text-align:center">
    <p style="margin:0;font-size:12px;color:#aaa">${esc(agencyName)} — Bedankt voor uw vertrouwen</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function generateProposalPDF({ proposalNr, lead, services, validUntil, note, btwEnabled, btwRate, settings }) {
  return new Promise((resolve, reject) => {
    const s           = settings || {};
    const agencyName  = s.agencyName || 'Agency AI';
    const myName      = s.myName || '';
    const myEmail     = s.gmailAddress || s.resendFromAddress || '';
    const companyName = lead.companyName || 'Klant';
    const location    = lead.location || lead.city || '';
    const btwR        = parseFloat(btwRate) || 21;
    const btwE        = btwEnabled === true;
    const validFmt    = validUntil ? new Date(validUntil).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
    const todayFmt    = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
    const problems    = (lead.selectedProblems || lead.problems || []).slice(0, 3);

    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const accent = '#1a56db';
    const pageW  = doc.page.width;
    const tableW = pageW - 100;

    // ── Header ──
    doc.rect(0, 0, pageW, 90).fill('#0A0A0F');
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(20).text(agencyName, 50, 28);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(28).text('VOORSTEL', 0, 24, { align: 'right' });

    // ── Meta bar ──
    doc.rect(0, 90, pageW, 42).fill('#18181f');
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('VOORSTELNNUMMER', 50, 98);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(11).text(proposalNr, 50, 109);
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('DATUM', pageW / 2 - 60, 98, { width: 120, align: 'center' });
    doc.fill('#ffffff').font('Helvetica').fontSize(11).text(todayFmt, pageW / 2 - 60, 109, { width: 120, align: 'center' });
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text('GELDIG TOT', 0, 98, { align: 'right' });
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(11).text(validFmt, 0, 109, { align: 'right' });

    let y = 152;

    // ── VOOR ──
    doc.fill('#888888').font('Helvetica').fontSize(9).text('VOOR', 50, y);
    y += 14;
    doc.fill('#111111').font('Helvetica-Bold').fontSize(14).text(companyName, 50, y);
    y += 18;
    if (location) { doc.fill('#555555').font('Helvetica').fontSize(11).text(location, 50, y); y += 16; }
    y += 10;

    // ── WAT WE VOOR JOU GAAN DOEN ──
    if (problems.length) {
      doc.rect(50, y, tableW, 1).fill('#e8e8e8'); y += 14;
      doc.fill('#111111').font('Helvetica-Bold').fontSize(12).text('WAT WE VOOR JOU GAAN DOEN', 50, y); y += 16;
      const introText = `Wij helpen ${companyName} met de volgende uitdagingen: ${problems.join(', ')}. Met onze aanpak zorgen we voor concrete, meetbare resultaten die direct impact hebben op uw omzet en online aanwezigheid.`;
      doc.fill('#374151').font('Helvetica').fontSize(11).text(introText, 50, y, { width: tableW, lineGap: 3 });
      y += doc.heightOfString(introText, { width: tableW, lineGap: 3 }) + 18;
    }

    // ── Personal note ──
    if (note) {
      doc.rect(50, y, tableW, 1).fill('#e8e8e8'); y += 12;
      doc.fill('#374151').font('Helvetica-Oblique').fontSize(11).text(`"${note}"`, 50, y, { width: tableW, lineGap: 3 });
      y += doc.heightOfString(`"${note}"`, { width: tableW, lineGap: 3 }) + 14;
    }

    // ── Services table ──
    doc.rect(50, y, tableW, 1).fill('#e8e8e8'); y += 14;
    doc.fill('#111111').font('Helvetica-Bold').fontSize(12).text('DIENSTEN OVERZICHT', 50, y); y += 18;

    // Header row
    doc.rect(50, y, tableW, 24).fill('#f9f9f9').stroke('#e8e8e8');
    doc.fill('#888888').font('Helvetica-Bold').fontSize(9);
    doc.text('DIENST', 58, y + 8, { width: 185 });
    doc.text('OMSCHRIJVING', 246, y + 8, { width: 185 });
    doc.text('PRIJS', pageW - 50 - 95, y + 8, { width: 87, align: 'right' });
    y += 24;

    let subtotal = 0;
    services.forEach((svc, idx) => {
      const price = parseFloat(svc.price || 0);
      subtotal += price;
      if (idx % 2 === 1) doc.rect(50, y, tableW, 26).fill('#fafafa');
      doc.rect(50, y, tableW, 26).stroke('#f0f0f0');
      doc.fill('#111111').font('Helvetica').fontSize(11).text(svc.name || 'Dienst', 58, y + 8, { width: 182, ellipsis: true });
      doc.fill('#555555').font('Helvetica').fontSize(10).text(svc.description || '', 246, y + 8, { width: 182, ellipsis: true });
      const priceLabel = `€${price.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}${svc.billing === 'maandelijks' ? '/mnd' : ''}`;
      doc.fill('#111111').font('Helvetica').fontSize(11).text(priceLabel, pageW - 50 - 95, y + 8, { width: 87, align: 'right' });
      y += 26;
    });

    // Totals
    const btwAmt    = btwE ? subtotal * btwR / 100 : 0;
    const totalIncl = btwE ? subtotal + btwAmt : subtotal;

    doc.rect(50, y, tableW, 24).fill('#f9f9f9').stroke('#e8e8e8');
    doc.fill('#555555').font('Helvetica').fontSize(11).text('Subtotaal', 58, y + 7);
    doc.fill('#111111').text(`€${subtotal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, pageW - 50 - 95, y + 7, { width: 87, align: 'right' });
    y += 24;

    if (btwE) {
      doc.rect(50, y, tableW, 22).fill('#f9f9f9').stroke('#f0f0f0');
      doc.fill('#555555').font('Helvetica').fontSize(11).text(`BTW ${btwR}%`, 58, y + 6);
      doc.fill('#555555').text(`€${btwAmt.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, pageW - 50 - 95, y + 6, { width: 87, align: 'right' });
      y += 22;
    } else {
      doc.fill('#999999').font('Helvetica').fontSize(10).text('Vrijgesteld van BTW', 58, y + 4); y += 16;
    }

    doc.rect(50, y, tableW, 32).fill(accent);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(13).text(`TOTAAL${btwE ? ' INCL. BTW' : ''}`, 58, y + 10);
    doc.fill('#ffffff').font('Helvetica-Bold').fontSize(16).text(`€${totalIncl.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`, pageW - 50 - 95, y + 8, { width: 87, align: 'right' });
    y += 44;

    // ── VOLGENDE STAP ──
    doc.rect(50, y, tableW, 1).fill('#e8e8e8'); y += 14;
    doc.fill('#111111').font('Helvetica-Bold').fontSize(12).text('VOLGENDE STAP', 50, y); y += 16;
    const nextStep = 'Om te starten hebben we het volgende nodig: akkoord op dit voorstel en de eerste betaling. U kunt reageren via reply op de begeleidende e-mail of door rechtstreeks contact op te nemen.';
    doc.fill('#374151').font('Helvetica').fontSize(11).text(nextStep, 50, y, { width: tableW, lineGap: 3 });
    y += doc.heightOfString(nextStep, { width: tableW, lineGap: 3 }) + 18;

    // ── Contact ──
    doc.rect(50, y, tableW, 1).fill('#e8e8e8'); y += 12;
    const contactLine = [agencyName, myName, myEmail].filter(Boolean).join('  ·  ');
    doc.fill('#555555').font('Helvetica').fontSize(10).text(contactLine, 50, y, { width: tableW });

    // ── Footer ──
    const footerY = doc.page.height - 50;
    doc.rect(0, footerY - 1, pageW, 1).fill('#f0f0f0');
    doc.fill('#aaaaaa').font('Helvetica').fontSize(9).text(`${proposalNr}  ·  Opgesteld op ${todayFmt}  ·  Geldig tot ${validFmt}`, 50, footerY + 8, { align: 'center', width: pageW - 100 });

    doc.end();
  });
}

// ─── New Proposals API ────────────────────────────────────────────────────────

app.post('/api/leads/:id/proposals', requireAdmin, async (req, res) => {
  const leads    = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx      = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];

  const { services, validUntil, note, btwEnabled, btwRate, sendToClient } = req.body;
  if (!Array.isArray(services) || !services.length) return res.status(400).json({ error: 'Geen diensten geselecteerd' });

  const proposalNr = `VRS-${Date.now().toString(36).toUpperCase()}`;
  const btwR       = parseFloat(btwRate) || 21;
  const subtotal   = services.reduce((s, sv) => s + (parseFloat(sv.price) || 0), 0);
  const btwAmt     = btwEnabled ? subtotal * btwR / 100 : 0;
  const total      = btwEnabled ? subtotal + btwAmt : subtotal;

  try {
    const pdfBuffer = await generateProposalPDF({ proposalNr, lead, services, validUntil, note, btwEnabled, btwRate: btwR, settings });

    const proposalRecord = {
      id: proposalNr, proposalNr,
      createdAt: new Date().toISOString(),
      sentAt: null, status: 'draft',
      services, validUntil: validUntil || null, note: note || '',
      btwEnabled: !!btwEnabled, btwRate: btwR, total
    };

    if (!leads[idx].proposals) leads[idx].proposals = [];
    leads[idx].proposals.unshift(proposalRecord);
    addLeadHistory(leads, lead.id, { event: 'proposalCreated', label: `Voorstel ${proposalNr} aangemaakt — €${total.toLocaleString('nl-NL')}` });

    if (sendToClient) {
      const to = (lead.contactEmail || '').trim();
      if (to && to.includes('@') && isResendReady(settings)) {
        const emailHtml   = buildProposalEmailHTML({ proposalNr, lead, services, total, note, validUntil, settings });
        const safeCompany = (lead.companyName || 'klant').replace(/[^a-zA-Z0-9]/g, '-');
        await sendEmail({
          to, subject: `Voorstel ${settings.agencyName || 'Agency AI'} × ${lead.companyName}`,
          body: `Beste ${lead.contactName || lead.companyName},\n\nBijgevoegd vindt u ons voorstel ${proposalNr}.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.agencyName || 'Agency AI'}`,
          html: emailHtml, settings, noCalendly: true,
          attachments: [{ filename: `Voorstel-${proposalNr}-${safeCompany}.pdf`, content: pdfBuffer.toString('base64') }]
        });
        leads[idx].proposals[0].sentAt = new Date().toISOString();
        leads[idx].proposals[0].status = 'sent';
        addLeadHistory(leads, lead.id, { event: 'proposalSent', label: `Voorstel ${proposalNr} verstuurd naar ${to}` });
      }
    }

    writeJSON('leads.json', leads);
    res.json({ ok: true, proposalNr, proposal: leads[idx].proposals[0], pdfBase64: pdfBuffer.toString('base64') });
  } catch (err) {
    console.error('[Proposal]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/proposals/:proposalId/send', requireAdmin, async (req, res) => {
  const leads    = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx      = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead     = leads[idx];
  const proposal = (lead.proposals || []).find(p => p.id === req.params.proposalId);
  if (!proposal) return res.status(404).json({ error: 'Voorstel niet gevonden' });

  const to = (lead.contactEmail || '').trim();
  if (!to || !to.includes('@')) return res.status(400).json({ error: 'Geen geldig e-mailadres bekend' });
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });

  try {
    const pdfBuffer = await generateProposalPDF({ proposalNr: proposal.proposalNr, lead, services: proposal.services, validUntil: proposal.validUntil, note: proposal.note, btwEnabled: proposal.btwEnabled, btwRate: proposal.btwRate, settings });
    const emailHtml = buildProposalEmailHTML({ proposalNr: proposal.proposalNr, lead, services: proposal.services, total: proposal.total, note: proposal.note, validUntil: proposal.validUntil, settings });
    const safeCompany = (lead.companyName || 'klant').replace(/[^a-zA-Z0-9]/g, '-');

    await sendEmail({
      to, subject: `Voorstel ${settings.agencyName || 'Agency AI'} × ${lead.companyName}`,
      body: `Beste ${lead.contactName || lead.companyName},\n\nBijgevoegd vindt u ons voorstel ${proposal.proposalNr}.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.agencyName || 'Agency AI'}`,
      html: emailHtml, settings, noCalendly: true,
      attachments: [{ filename: `Voorstel-${proposal.proposalNr}-${safeCompany}.pdf`, content: pdfBuffer.toString('base64') }]
    });

    const pIdx = leads[idx].proposals.findIndex(p => p.id === req.params.proposalId);
    if (pIdx !== -1) { leads[idx].proposals[pIdx].sentAt = new Date().toISOString(); leads[idx].proposals[pIdx].status = 'sent'; }
    addLeadHistory(leads, lead.id, { event: 'proposalSent', label: `Voorstel ${proposal.proposalNr} verstuurd naar ${to}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Proposal Generator (SSE 3-step, legacy) ─────────────────────────────────

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
  const myName     = settings.myName     || '';
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
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });

  const to = lead.contactEmail;
  if (!to) return res.status(400).json({ error: 'Geen email adres bekend' });

  try {
    await sendEmail({
      to,
      subject: `Voorstel van ${settings.agencyName || 'Agency AI'} voor ${lead.companyName}`,
      body: `Beste ${lead.contactName || 'eigenaar'},\n\nHierbij sturen wij ons voorstel voor ${lead.companyName}.\n\nBekijk het voorstel in de bijlage of reply op deze email voor vragen.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.myTitle || 'AI Growth Specialist'}\n${settings.agencyName || 'Agency AI'}`,
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
  const myName     = settings.myName     || '';
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
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });

  const to = lead.contactEmail;
  if (!to) return res.status(400).json({ error: 'Geen email adres bekend' });

  try {
    await sendEmail({
      to,
      subject: `Dienstverleningsovereenkomst — ${settings.agencyName || 'Agency AI'} × ${lead.companyName}`,
      body: `Beste ${lead.contactName || 'eigenaar'},\n\nHierbij sturen wij de dienstverleningsovereenkomst ter ondertekening.\n\nLees het contract door, onderteken en stuur een scan/foto terug.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.myTitle || 'AI Growth Specialist'}\n${settings.agencyName || 'Agency AI'}`,
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

    // Step 4 — Service-specific deliveries
    send(4, 'Service leveringen genereren', 'running');
    const serviceDeliveries = {};
    const SD_SERVICES = new Set([
      'Maandelijkse content kalender','Instagram Reels scripts','Blog artikelen schrijven',
      'Email nieuwsbrief reeks','Website teksten schrijven','SEO teksten optimaliseren',
      'Chatbot script voor website','Concurrentieanalyse rapport','Social media audit',
      'Google Ads teksten','Facebook Ad copy','Email autoresponder reeks',
      'Product beschrijvingen','Pitch deck teksten','Privacy policy + algemene voorwaarden',
      'Google Bedrijfsprofiel content','Verlaten winkelwagen emails',
      'Over ons pagina schrijven','FAQ pagina schrijven','Nieuwsbrief template ontwerpen'
    ]);
    const leadServicesToGenerate = (lead.services || []).map(s => s.name.trim()).filter(n => SD_SERVICES.has(n));
    console.log(`[Delivery] Service leveringen: ${leadServicesToGenerate.join(', ') || 'geen'}`);

    for (const svcName of leadServicesToGenerate) {
      try {
        console.log(`[Delivery] Genereren: ${svcName}...`);
        const co = lead.companyName, ni = lead.niche, lo = lead.location;
        let html = '';

        switch (svcName) {

          case 'Maandelijkse content kalender': {
            const d = await aiJSON(`Maak een content kalender voor ${co} (${ni}, ${lo}) voor een volledige maand.${intakeContext}
Maak precies 20 Instagram posts, verspreid over 30 dagen.
Geef ALLEEN JSON: { "month":"Maand 1","posts":[{"day":1,"date":"ma 2 juni","type":"foto/carousel/reel","topic":"string","caption":"volledig klaar om te posten (100-150 woorden, emoji, professioneel)","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5"],"visual":"korte visuele beschrijving"}] }`);
            const posts = (d.posts||d.items||[]).slice(0,20);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 12px">Content Kalender — ${d.month||'Maand 1'}</h2>
<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f3f4f6"><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Dag</th><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Type</th><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Onderwerp</th><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Caption</th><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Hashtags</th><th style="padding:7px;text-align:left;border:1px solid #e5e7eb">Visual</th></tr></thead><tbody>
${posts.map(p=>`<tr><td style="padding:7px;border:1px solid #e5e7eb;font-weight:700;color:#6366f1;white-space:nowrap">${p.date||`Dag ${p.day}`}</td><td style="padding:7px;border:1px solid #e5e7eb"><span style="background:#eef2ff;color:#6366f1;border-radius:3px;padding:1px 5px">${p.type||''}</span></td><td style="padding:7px;border:1px solid #e5e7eb;font-weight:600">${p.topic||''}</td><td style="padding:7px;border:1px solid #e5e7eb;line-height:1.5;color:#374151">${p.caption||''}</td><td style="padding:7px;border:1px solid #e5e7eb;color:#6366f1">${(p.hashtags||[]).join(' ')}</td><td style="padding:7px;border:1px solid #e5e7eb;color:#6b7280;font-style:italic">${p.visual||''}</td></tr>`).join('')}
</tbody></table>`;
            break;
          }

          case 'Instagram Reels scripts': {
            const d = await aiJSON(`Maak 8 Instagram Reels scripts voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"scripts":[{"nummer":1,"titel":"string","hook":"eerste 3 sec (max 15 woorden)","inhoud":["Stap 1","Stap 2","Stap 3"],"cta":"string","muziek":"aanbevolen stijl","duur":"15/30/60 sec"}]}`);
            const scripts = (d.scripts||[]).slice(0,8);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Instagram Reels Scripts</h2><div style="display:flex;flex-direction:column;gap:14px">
${scripts.map(s=>`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px"><div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px"><strong style="font-size:13px">Reel ${s.nummer}: ${s.titel}</strong><span style="background:#fefce8;color:#d97706;border-radius:4px;padding:2px 7px;font-size:11px">${s.duur}</span></div><div style="background:#fef2f2;border-left:3px solid #ef4444;padding:8px 11px;margin-bottom:8px;border-radius:0 6px 6px 0"><strong style="font-size:10px;color:#dc2626;text-transform:uppercase">Hook (eerste 3 sec)</strong><p style="margin:3px 0 0;font-size:13px;font-weight:700">"${s.hook}"</p></div><ul style="margin:0 0 8px;padding-left:18px">${(s.inhoud||[]).map(i=>`<li style="font-size:13px;color:#374151;margin-bottom:3px">${i}</li>`).join('')}</ul><div style="display:flex;gap:6px;flex-wrap:wrap"><span style="background:#f0fdf4;border-radius:5px;padding:5px 9px;font-size:12px"><b>CTA:</b> ${s.cta}</span><span style="background:#f0f9ff;border-radius:5px;padding:5px 9px;font-size:12px"><b>Muziek:</b> ${s.muziek}</span></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Blog artikelen schrijven': {
            const d = await aiJSON(`Schrijf 4 volledige blog artikelen voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"articles":[{"nummer":1,"seoTitle":"max 60 tekens","metaDescription":"max 155 tekens","keyword":"string","body":"volledig artikel in HTML met h2/h3/p (600-800 woorden)","internalLinks":["suggestie1","suggestie2"]}]}`);
            const articles = (d.articles||[]).slice(0,4);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Blog Artikelen (4 stuks)</h2><div style="display:flex;flex-direction:column;gap:20px">
${articles.map(a=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb"><div style="font-size:14px;font-weight:700;margin-bottom:3px">${a.seoTitle}</div><div style="font-size:12px;color:#6b7280;margin-bottom:5px">${a.metaDescription}</div><span style="background:#eef2ff;color:#6366f1;border-radius:4px;padding:1px 6px;font-size:11px">Keyword: ${a.keyword}</span></div><div style="padding:16px;font-size:13px;line-height:1.7;color:#374151">${a.body||''}</div>${a.internalLinks?.length?`<div style="padding:8px 16px;background:#fffbeb;border-top:1px solid #fef3c7;font-size:12px"><b>Interne links:</b> ${(a.internalLinks||[]).join(', ')}</div>`:''}</div>`).join('')}
</div>`;
            break;
          }

          case 'Email nieuwsbrief reeks': {
            const d = await aiJSON(`Schrijf 4 nieuwsbrieven voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"newsletters":[{"nummer":1,"subjectA":"string","subjectB":"A/B variant","preview":"max 90 tekens","body":"HTML nieuwsbrief (inline styles, email-safe)","cta":"knoptekst"}]}`);
            const nl = (d.newsletters||[]).slice(0,4);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Email Nieuwsbrief Reeks (4 stuks)</h2><div style="display:flex;flex-direction:column;gap:16px">
${nl.map(n=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:12px 16px;border-bottom:1px solid #e5e7eb"><b>Nieuwsbrief ${n.nummer}</b><br><span style="font-size:13px"><b>Subject A:</b> ${n.subjectA}</span><br><span style="font-size:13px"><b>Subject B:</b> ${n.subjectB}</span><br><span style="font-size:12px;color:#6b7280"><b>Preview:</b> ${n.preview}</span></div><div style="padding:16px;font-size:13px;line-height:1.7">${n.body||''}</div><div style="padding:8px 16px;background:#f0fdf4;border-top:1px solid #bbf7d0;font-size:13px"><b>CTA knop:</b> ${n.cta}</div></div>`).join('')}
</div>`;
            break;
          }

          case 'Website teksten schrijven': {
            const d = await aiJSON(`Schrijf volledige website teksten voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"homepage":{"hero":{"headline":"max 10 woorden","subheadline":"max 20 woorden","ctaButton":"string"},"about":"3-4 zinnen","services":[{"title":"string","description":"2-3 zinnen"}],"cta":{"headline":"string","subtext":"string","button":"string"}},"aboutPage":{"title":"string","intro":"2 alineas","values":[{"title":"string","text":"string"}]},"servicesPage":{"title":"string","intro":"string","services":[{"name":"string","description":"string"}]},"contactPage":{"title":"string","intro":"string","formLabels":{"name":"string","email":"string","message":"string","submit":"string"}}}`);
            const h=d.homepage||{},a=d.aboutPage||{},s=d.servicesPage||{},c=d.contactPage||{};
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 16px">Website Teksten — ${co}</h2><div style="display:flex;flex-direction:column;gap:16px">
<section style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#6366f1;padding:9px 16px"><b style="color:#fff;font-size:12px">HOMEPAGE</b></div><div style="padding:16px"><div style="margin-bottom:10px"><b>Hero:</b> <span style="font-size:16px;font-weight:700">${h.hero?.headline||''}</span> <span style="color:#6b7280;font-size:13px">— ${h.hero?.subheadline||''}</span></div><div style="margin-bottom:10px"><b>Over ons:</b><p style="color:#374151;font-size:13px;margin:4px 0">${h.about||''}</p></div>${(h.services||[]).map(sv=>`<div style="margin-bottom:7px;padding:7px;background:#f9fafb;border-radius:5px"><b style="font-size:13px">${sv.title}</b><br><span style="font-size:12px;color:#374151">${sv.description}</span></div>`).join('')}</div></section>
<section style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#0891b2;padding:9px 16px"><b style="color:#fff;font-size:12px">OVER ONS</b></div><div style="padding:16px;font-size:13px;line-height:1.7;color:#374151"><b style="font-size:14px;color:#111">${a.title||''}</b><p>${a.intro||''}</p>${(a.values||[]).map(v=>`<div style="margin-bottom:6px"><b>${v.title}</b> — ${v.text}</div>`).join('')}</div></section>
<section style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#059669;padding:9px 16px"><b style="color:#fff;font-size:12px">DIENSTEN</b></div><div style="padding:16px;font-size:13px;color:#374151"><b style="font-size:14px;color:#111">${s.title||''}</b><p>${s.intro||''}</p>${(s.services||[]).map(sv=>`<div style="margin-bottom:10px;padding:8px;background:#f9fafb;border-radius:5px"><b>${sv.name}</b><p style="margin:3px 0 0;font-size:12px">${sv.description}</p></div>`).join('')}</div></section>
<section style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#d97706;padding:9px 16px"><b style="color:#fff;font-size:12px">CONTACT</b></div><div style="padding:16px;font-size:13px"><b style="font-size:14px;color:#111">${c.title||''}</b><p>${c.intro||''}</p>${c.formLabels?`<div style="background:#f9fafb;padding:8px;border-radius:5px;font-size:12px">Naam: ${c.formLabels.name||''} | Email: ${c.formLabels.email||''} | Knop: ${c.formLabels.submit||''}</div>`:''}</div></section>
</div>`;
            break;
          }

          case 'SEO teksten optimaliseren': {
            const d = await aiJSON(`Optimaliseer SEO teksten voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"pages":[{"pagina":"Homepage","geoptimaliseerdeTitle":"50-60 tekens","metaDescription":"150-160 tekens","h1":"string","keywords":["kw1","kw2","kw3"],"verbeterpunten":["punt1","punt2"]}]}`);
            const pages = (d.pages||[]);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">SEO Optimalisatie — ${co}</h2><div style="display:flex;flex-direction:column;gap:12px">
${pages.map(p=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:10px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:13px">${p.pagina}</div><div style="padding:12px 14px"><div style="margin-bottom:8px"><span style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Title Tag (${(p.geoptimaliseerdeTitle||'').length}/60)</span><div style="font-size:13px;color:#1d4ed8;text-decoration:underline;margin-top:2px">${p.geoptimaliseerdeTitle}</div></div><div style="margin-bottom:8px"><span style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Meta Description (${(p.metaDescription||'').length}/160)</span><div style="font-size:12px;color:#374151;margin-top:2px">${p.metaDescription}</div></div><div style="margin-bottom:8px"><span style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">H1</span><div style="font-size:13px;font-weight:700;margin-top:2px">${p.h1}</div></div><div style="display:flex;gap:4px;flex-wrap:wrap;margin-bottom:8px">${(p.keywords||[]).map(k=>`<span style="background:#eef2ff;color:#6366f1;border-radius:3px;padding:2px 6px;font-size:11px">${k}</span>`).join('')}</div><ul style="margin:0;padding-left:16px">${(p.verbeterpunten||[]).map(v=>`<li style="font-size:12px;color:#374151;margin-bottom:2px">${v}</li>`).join('')}</ul></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Chatbot script voor website': {
            const d = await aiJSON(`Maak chatbot script voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"welkom":"string","buiten_openingstijden":"string","faqs":[{"vraag":"string","antwoord":"string","categorie":"string","followUp":"string optioneel"}],"leadCapture":{"triggerZin":"string","vragen":["Naam?","Email?","Vraag?"],"bevestiging":"string"}}`);
            const faqs = (d.faqs||[]).slice(0,15);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Chatbot Script — ${co}</h2><div style="display:flex;flex-direction:column;gap:12px">
<div style="border:2px solid #6366f1;border-radius:8px;padding:12px"><div style="font-size:10px;color:#6366f1;text-transform:uppercase;font-weight:700;margin-bottom:5px">Welkomstbericht</div><div style="font-size:13px">"${d.welkom||''}"</div></div>
<div style="border:1px solid #fde68a;border-radius:8px;padding:12px;background:#fefce8"><div style="font-size:10px;color:#d97706;text-transform:uppercase;font-weight:700;margin-bottom:5px">Buiten openingstijden</div><div style="font-size:13px">"${d.buiten_openingstijden||''}"</div></div>
<div><div style="font-size:12px;font-weight:700;margin-bottom:7px">Q&A Paren (${faqs.length})</div>${faqs.map((f,i)=>`<div style="border:1px solid #e5e7eb;border-radius:7px;margin-bottom:6px;overflow:hidden"><div style="background:#f9fafb;padding:7px 11px;font-weight:700;font-size:12px"><span style="background:#6366f1;color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;margin-right:5px">${i+1}</span>${f.vraag}</div><div style="padding:7px 11px;font-size:12px;color:#374151;line-height:1.5">${f.antwoord}</div>${f.followUp?`<div style="padding:5px 11px;background:#f0f9ff;font-size:11px;color:#0369a1;border-top:1px solid #e0f2fe">→ ${f.followUp}</div>`:''}</div>`).join('')}</div>
${d.leadCapture?`<div style="border:1px solid #bbf7d0;border-radius:8px;padding:12px;background:#f0fdf4"><div style="font-size:10px;color:#16a34a;text-transform:uppercase;font-weight:700;margin-bottom:6px">Lead Capture</div><div style="font-size:12px;margin-bottom:4px"><b>Trigger:</b> "${d.leadCapture.triggerZin}"</div><div style="font-size:12px;margin-bottom:4px"><b>Vragen:</b> ${(d.leadCapture.vragen||[]).join(' → ')}</div><div style="font-size:12px"><b>Bevestiging:</b> "${d.leadCapture.bevestiging}"</div></div>`:''}
</div>`;
            break;
          }

          case 'Concurrentieanalyse rapport': {
            let rawText;
            try { rawText = await aiWebSearch(`Zoek info over de 3 grootste concurrenten van ${co} in ${lo} (${ni}). Analyseer website, social media, sterke en zwakke punten. Geef ALLEEN JSON: {"concurrenten":[{"naam":"string","website":"string","sterkePunten":["string"],"zwakkePunten":["string"],"socialMedia":"string"}],"kansen":["string"],"actieplan":["string"]}`); }
            catch { rawText = await aiCall(`Analyseer 3 concurrenten van ${co} (${ni}, ${lo}).${intakeContext} Geef ALLEEN JSON: {"concurrenten":[{"naam":"string","website":"string","sterkePunten":["string"],"zwakkePunten":["string"],"socialMedia":"string"}],"kansen":["string"],"actieplan":["string"]}`); }
            let d = {}; try { d = parseJsonFromText(rawText); } catch {}
            const comps = (d.concurrenten||[]).slice(0,3);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Concurrentieanalyse — ${co}</h2><div style="display:flex;flex-direction:column;gap:14px">
${comps.map((c,i)=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#${['374151','1e40af','7c2d12'][i]};padding:9px 16px"><b style="color:#fff">Concurrent ${i+1}: ${c.naam}</b></div><div style="padding:12px 16px;display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><b style="font-size:10px;color:#16a34a;text-transform:uppercase">✓ Sterk</b><ul style="margin:4px 0 0;padding-left:15px">${(c.sterkePunten||[]).map(s=>`<li style="font-size:12px;margin-bottom:2px">${s}</li>`).join('')}</ul></div><div><b style="font-size:10px;color:#dc2626;text-transform:uppercase">✗ Zwak</b><ul style="margin:4px 0 0;padding-left:15px">${(c.zwakkePunten||[]).map(s=>`<li style="font-size:12px;margin-bottom:2px">${s}</li>`).join('')}</ul></div></div></div>`).join('')}
${d.kansen?.length?`<div style="border:1px solid #bbf7d0;border-radius:8px;padding:14px;background:#f0fdf4"><b style="font-size:12px;color:#15803d">Kansen voor ${co}</b><ul style="margin:6px 0 0;padding-left:16px">${(d.kansen||[]).map(k=>`<li style="font-size:13px;margin-bottom:4px">${k}</li>`).join('')}</ul></div>`:''}
${d.actieplan?.length?`<div style="border:1px solid #bfdbfe;border-radius:8px;padding:14px;background:#eff6ff"><b style="font-size:12px;color:#1d4ed8">Actieplan</b><ol style="margin:6px 0 0;padding-left:16px">${(d.actieplan||[]).map(a=>`<li style="font-size:13px;margin-bottom:4px">${a}</li>`).join('')}</ol></div>`:''}
</div>`;
            break;
          }

          case 'Social media audit': {
            const handle = lead.instagramHandle || '@' + co.toLowerCase().replace(/\s+/g,'');
            const d = await aiJSON(`Social media audit voor ${co} (${ni}, ${lo}). Instagram: ${handle}, volgers: ${lead.estimatedFollowers||'onbekend'}.${intakeContext}
Geef ALLEEN JSON: {"score":7,"huidigeStatus":{"volgers":"string","engagement":"string","postFrequentie":"string"},"sterkePunten":["string"],"verbeterpunten":["string"],"contentGaps":["string"],"actiepunten":[{"prioriteit":"hoog/middel/laag","actie":"string","impact":"string"}]}`);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Social Media Audit — ${co}</h2>
<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px;padding:14px;background:#f9fafb;border-radius:8px"><div style="text-align:center"><div style="font-size:32px;font-weight:800;color:${(d.score||0)>=7?'#16a34a':(d.score||0)>=5?'#d97706':'#dc2626'}">${d.score||'?'}</div><div style="font-size:11px;color:#6b7280">Score /10</div></div><div style="flex:1;font-size:13px"><div><b>Volgers:</b> ${d.huidigeStatus?.volgers||handle}</div><div><b>Engagement:</b> ${d.huidigeStatus?.engagement||'?'}</div><div><b>Frequentie:</b> ${d.huidigeStatus?.postFrequentie||'?'}</div></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px"><div style="border:1px solid #bbf7d0;border-radius:7px;padding:10px;background:#f0fdf4"><b style="font-size:10px;color:#16a34a;text-transform:uppercase">✓ Sterk</b><ul style="margin:5px 0 0;padding-left:15px">${(d.sterkePunten||[]).map(s=>`<li style="font-size:12px;margin-bottom:2px">${s}</li>`).join('')}</ul></div><div style="border:1px solid #fecaca;border-radius:7px;padding:10px;background:#fef2f2"><b style="font-size:10px;color:#dc2626;text-transform:uppercase">✗ Verbeter</b><ul style="margin:5px 0 0;padding-left:15px">${(d.verbeterpunten||[]).map(s=>`<li style="font-size:12px;margin-bottom:2px">${s}</li>`).join('')}</ul></div></div>
${(d.actiepunten||[]).length?`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#111;padding:9px 14px"><b style="color:#fff;font-size:12px">Actiepunten</b></div>${(d.actiepunten||[]).slice(0,10).map(a=>`<div style="padding:9px 14px;border-bottom:1px solid #f3f4f6;display:flex;gap:8px;align-items:flex-start"><span style="background:${a.prioriteit==='hoog'?'#dc2626':a.prioriteit==='middel'?'#d97706':'#6b7280'};color:#fff;border-radius:3px;padding:1px 5px;font-size:10px;font-weight:700;flex-shrink:0">${a.prioriteit}</span><div><div style="font-size:12px;font-weight:600">${a.actie}</div><div style="font-size:11px;color:#6b7280">${a.impact}</div></div></div>`).join('')}</div>`:''}`;
            break;
          }

          case 'Google Ads teksten': {
            const d = await aiJSON(`Genereer 10 Google Ads varianten voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"campagneNaam":"string","targetKeywords":["kw1","kw2"],"ads":[{"nummer":1,"headlines":["H1 max 30 tekens","H2","H3"],"descriptions":["D1 max 90 tekens","D2"],"displayUrl":"example.nl/dienst","doelgroep":"string"}]}`);
            const ads = (d.ads||[]).slice(0,10);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 6px">Google Ads Teksten (10 varianten)</h2><div style="font-size:12px;color:#6b7280;margin-bottom:14px">${d.campagneNaam||co} | Keywords: ${(d.targetKeywords||[]).join(', ')}</div><div style="display:flex;flex-direction:column;gap:10px">
${ads.map((ad,i)=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:7px 12px;border-bottom:1px solid #e5e7eb;font-size:11px;font-weight:700;color:#6b7280">AD ${ad.nummer||i+1} — ${ad.doelgroep||''}</div><div style="padding:10px 12px"><div style="font-size:11px;color:#0369a1;margin-bottom:4px">● ${ad.displayUrl||''}</div>${(ad.headlines||[]).map(h=>`<div style="font-size:13px;color:#1d4ed8;font-weight:700">${h} <span style="font-size:10px;color:#9ca3af;font-weight:400">(${(h||'').length}/30)</span></div>`).join('')}<div style="height:4px"></div>${(ad.descriptions||[]).map(dd=>`<div style="font-size:12px;color:#374151;margin-bottom:3px">${dd} <span style="font-size:10px;color:#9ca3af">(${(dd||'').length}/90)</span></div>`).join('')}</div></div>`).join('')}
</div>`;
            break;
          }

          case 'Facebook Ad copy': {
            const d = await aiJSON(`Schrijf 5 Facebook/Instagram advertentie teksten voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"ads":[{"nummer":1,"doelgroep":"Koud/Warm","primaryText":"max 125 tekens","headline":"max 40 tekens","description":"max 30 tekens","cta":"SHOP_NOW/LEARN_MORE/CONTACT_US/BOOK_NOW","format":"Beeld/Video/Carrousel","tip":"creatieve tip"}]}`);
            const ads = (d.ads||[]).slice(0,5);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Facebook Ad Copy (5 advertenties)</h2><div style="display:flex;flex-direction:column;gap:12px">
${ads.map(ad=>`<div style="border:2px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#1877f2;padding:8px 14px;display:flex;justify-content:space-between;align-items:center"><b style="color:#fff;font-size:12px">Ad ${ad.nummer} — ${ad.doelgroep}</b><span style="background:rgba(255,255,255,.2);color:#fff;border-radius:3px;padding:2px 6px;font-size:11px">${ad.format}</span></div><div style="padding:12px 14px"><div style="margin-bottom:8px"><span style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Primaire tekst (${(ad.primaryText||'').length}/125)</span><div style="font-size:12px;color:#374151;margin-top:2px">${ad.primaryText}</div></div><div style="background:#f9fafb;border-radius:6px;padding:9px;margin-bottom:8px"><div style="font-size:13px;font-weight:700">${ad.headline} <span style="font-size:10px;color:#9ca3af;font-weight:400">(${(ad.headline||'').length}/40)</span></div><div style="font-size:12px;color:#6b7280">${ad.description} (${(ad.description||'').length}/30)</div><span style="display:inline-block;background:#1877f2;color:#fff;border-radius:3px;padding:3px 9px;font-size:11px;font-weight:700;margin-top:5px">${ad.cta}</span></div><div style="font-size:11px;color:#6b7280;font-style:italic">💡 ${ad.tip}</div></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Email autoresponder reeks': {
            const d = await aiJSON(`Schrijf 7-delige email autoresponder voor ${co} (${ni}, ${lo}).${intakeContext}
Emails: Dag 1 (Welkom), Dag 2 (Beste tip), Dag 3 (Succesverhaal), Dag 5 (Spotlight), Dag 7 (FAQ), Dag 10 (Aanbieding), Dag 14 (Check-in).
Geef ALLEEN JSON: {"reeks":[{"dag":1,"onderwerp":"string","preview":"string","doel":"string","body":"300-400 woorden, persoonlijk en nuttig"}]}`);
            const emails = (d.reeks||[]).slice(0,7);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Email Autoresponder (7 emails)</h2><div style="display:flex;flex-direction:column;gap:12px">
${emails.map((e,i)=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#0f172a;padding:9px 14px;display:flex;justify-content:space-between;align-items:center"><b style="color:#fff;font-size:12px">Email ${i+1} — Dag ${e.dag}</b><span style="background:#334155;color:#94a3b8;border-radius:3px;padding:2px 6px;font-size:11px">${e.doel||''}</span></div><div style="padding:12px 14px"><div style="margin-bottom:5px"><b style="font-size:12px">Subject:</b> ${e.onderwerp}</div><div style="margin-bottom:9px;font-size:11px;color:#6b7280"><b>Preview:</b> ${e.preview}</div><div style="font-size:12px;line-height:1.7;color:#374151;border-left:3px solid #e5e7eb;padding-left:10px">${(e.body||'').replace(/\n/g,'<br>')}</div></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Product beschrijvingen': {
            const d = await aiJSON(`Schrijf 20 SEO product beschrijvingen voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"categorie":"string","producten":[{"naam":"string","seoTitle":"max 60 tekens","korteBeschrijving":"50 woorden","langeBeschrijving":"150 woorden SEO","kenmerken":["kw1","kw2","kw3","kw4","kw5"],"metaDescription":"max 155 tekens","keyword":"string"}]}`);
            const products = (d.producten||[]).slice(0,20);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 6px">Product Beschrijvingen (${products.length})</h2><div style="font-size:12px;color:#6b7280;margin-bottom:14px">Categorie: ${d.categorie||ni}</div><div style="display:flex;flex-direction:column;gap:10px">
${products.map((p,i)=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 12px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between"><b style="font-size:12px">${p.naam}</b><span style="background:#eef2ff;color:#6366f1;border-radius:3px;padding:1px 5px;font-size:11px">${p.keyword}</span></div><div style="padding:10px 12px"><div style="font-size:12px;font-weight:600;margin-bottom:5px">${p.seoTitle}</div><div style="font-size:12px;color:#374151;margin-bottom:5px;line-height:1.5">${p.korteBeschrijving}</div><div style="font-size:12px;color:#374151;margin-bottom:6px;line-height:1.6">${p.langeBeschrijving}</div><div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px">${(p.kenmerken||[]).map(k=>`<span style="background:#f3f4f6;border-radius:3px;padding:1px 6px;font-size:11px">✓ ${k}</span>`).join('')}</div><div style="font-size:11px;color:#6b7280;background:#f9fafb;padding:5px 7px;border-radius:4px">${p.metaDescription}</div></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Pitch deck teksten': {
            const d = await aiJSON(`Schrijf pitch deck voor ${co} (${ni}, ${lo}).${intakeContext}
10-12 slides: Dekblad, Probleem, Oplossing, Product, Markt, Businessmodel, Tractie, Team, Financiën, CTA.
Geef ALLEEN JSON: {"slides":[{"nummer":1,"titel":"string","type":"string","hoofdtekst":"string","bullets":["string"],"noot":"sprekersnoot"}]}`);
            const slides = (d.slides||[]).slice(0,12);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Pitch Deck — ${co}</h2><div style="display:flex;flex-direction:column;gap:10px">
${slides.map(s=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#0f172a;padding:9px 14px;display:flex;justify-content:space-between"><b style="color:#fff;font-size:12px">Slide ${s.nummer}: ${s.titel}</b><span style="background:#334155;color:#94a3b8;border-radius:3px;padding:2px 6px;font-size:11px">${s.type}</span></div><div style="padding:12px 14px"><div style="font-size:13px;margin-bottom:7px">${s.hoofdtekst||''}</div>${(s.bullets||[]).length?`<ul style="margin:0 0 7px;padding-left:16px">${(s.bullets||[]).map(b=>`<li style="font-size:12px;color:#374151;margin-bottom:3px">${b}</li>`).join('')}</ul>`:''} ${s.noot?`<div style="padding:7px;background:#f9fafb;border-radius:5px;font-size:11px;color:#6b7280;border-left:3px solid #6366f1;font-style:italic">🎤 ${s.noot}</div>`:''}</div></div>`).join('')}
</div>`;
            break;
          }

          case 'Privacy policy + algemene voorwaarden': {
            const lang = lead.language || 'nl';
            const d = await aiJSON(`Genereer GDPR-compliant juridische documenten voor ${co} (${lo}).${intakeContext}
Taal: ${lang==='nl'?'Nederlands':'English'}. 6-8 artikelen per document.
Geef ALLEEN JSON: {"privacyPolicy":{"titel":"string","artikelen":[{"nummer":1,"titel":"string","tekst":"string"}]},"algVoorwaarden":{"titel":"string","artikelen":[{"nummer":1,"titel":"string","tekst":"string"}]},"cookiePolicy":"volledige tekst"}`);
            const pp=d.privacyPolicy||{}, av=d.algVoorwaarden||{};
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Juridische Documenten — ${co}</h2><div style="display:flex;flex-direction:column;gap:16px">
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#1d4ed8;padding:10px 16px"><b style="color:#fff">Privacy Policy</b></div><div style="padding:16px;font-size:13px;line-height:1.7">${(pp.artikelen||[]).map(a=>`<div style="margin-bottom:14px"><h3 style="font-size:13px;font-weight:700;margin:0 0 4px">Art. ${a.nummer}: ${a.titel}</h3><p style="margin:0;color:#374151">${a.tekst}</p></div>`).join('')}</div></div>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#7c3aed;padding:10px 16px"><b style="color:#fff">Algemene Voorwaarden</b></div><div style="padding:16px;font-size:13px;line-height:1.7">${(av.artikelen||[]).map(a=>`<div style="margin-bottom:14px"><h3 style="font-size:13px;font-weight:700;margin:0 0 4px">Art. ${a.nummer}: ${a.titel}</h3><p style="margin:0;color:#374151">${a.tekst}</p></div>`).join('')}</div></div>
${d.cookiePolicy?`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#047857;padding:10px 16px"><b style="color:#fff">Cookie Policy</b></div><div style="padding:16px;font-size:13px;line-height:1.7;color:#374151">${d.cookiePolicy}</div></div>`:''}
</div>`;
            break;
          }

          case 'Google Bedrijfsprofiel content': {
            const d = await aiJSON(`Google Business Profile teksten voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"bedrijfsBeschrijving":"max 750 tekens","diensten":[{"naam":"string","beschrijving":"max 300 tekens"}],"faq":[{"vraag":"string","antwoord":"string"}],"googlePosts":[{"type":"Nieuw/Aanbieding/Evenement","tekst":"max 1500 tekens"}]}
5 diensten, 10 FAQs, 5 posts.`);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Google Bedrijfsprofiel — ${co}</h2><div style="display:flex;flex-direction:column;gap:14px">
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px"><span style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700">Bedrijfsbeschrijving (${(d.bedrijfsBeschrijving||'').length}/750)</span><div style="font-size:13px;line-height:1.7;color:#374151;margin-top:6px">${d.bedrijfsBeschrijving||''}</div></div>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px">Diensten</div>${(d.diensten||[]).map(dd=>`<div style="padding:9px 14px;border-bottom:1px solid #f3f4f6"><div style="font-weight:600;font-size:12px">${dd.naam}</div><div style="font-size:12px;color:#6b7280;margin-top:2px">${dd.beschrijving}</div></div>`).join('')}</div>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px">FAQ</div>${(d.faq||[]).map(f=>`<div style="padding:9px 14px;border-bottom:1px solid #f3f4f6"><div style="font-size:12px;font-weight:600;margin-bottom:2px">V: ${f.vraag}</div><div style="font-size:12px;color:#374151">A: ${f.antwoord}</div></div>`).join('')}</div>
<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px">Google Posts</div>${(d.googlePosts||[]).map(p=>`<div style="padding:9px 14px;border-bottom:1px solid #f3f4f6"><span style="font-size:10px;color:#6b7280;text-transform:uppercase">${p.type}</span><div style="font-size:12px;color:#374151;margin-top:4px;line-height:1.6">${p.tekst}</div></div>`).join('')}</div>
</div>`;
            break;
          }

          case 'Verlaten winkelwagen emails': {
            const d = await aiJSON(`3-delige verlaten winkelwagen email reeks voor ${co} (${ni}, ${lo}).${intakeContext}
Email 1: Vriendelijke herinnering (1 uur). Email 2: Voordeel aanbieden (24 uur). Email 3: Urgentie/schaarste (72 uur).
Geef ALLEEN JSON: {"emails":[{"nummer":1,"timing":"1 uur na verlaten","onderwerp":"string","preview":"string","body":"150-200 woorden, HTML inline styles"}]}`);
            const emails = (d.emails||[]).slice(0,3);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Verlaten Winkelwagen Emails</h2><div style="display:flex;flex-direction:column;gap:12px">
${emails.map(e=>`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f59e0b;padding:9px 14px;display:flex;justify-content:space-between"><b style="color:#fff;font-size:12px">Email ${e.nummer}</b><span style="background:rgba(255,255,255,.2);color:#fff;font-size:11px;padding:2px 6px;border-radius:3px">${e.timing}</span></div><div style="padding:12px 14px"><div style="margin-bottom:5px;font-size:12px"><b>Subject:</b> ${e.onderwerp}</div><div style="margin-bottom:9px;font-size:11px;color:#6b7280"><b>Preview:</b> ${e.preview}</div><div style="font-size:12px;line-height:1.7;color:#374151;border-left:3px solid #f59e0b;padding-left:10px">${(e.body||'').replace(/\n/g,'<br>')}</div></div></div>`).join('')}
</div>`;
            break;
          }

          case 'Over ons pagina schrijven': {
            const d = await aiJSON(`Schrijf "Over ons" pagina voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"hero":{"headline":"max 10 woorden","subheadline":"max 20 woorden"},"verhaal":"300-400 woorden (persoonlijk, vertrouwen)","missie":"2-3 zinnen","waarden":[{"icon":"emoji","titel":"string","beschrijving":"1-2 zinnen"}],"team":[{"naam":"string","rol":"string","bio":"2-3 zinnen"}]}`);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Over Ons Pagina — ${co}</h2><div style="display:flex;flex-direction:column;gap:14px">
<div style="text-align:center;padding:16px;background:#f9fafb;border-radius:8px"><div style="font-size:20px;font-weight:800">${d.hero?.headline||''}</div><div style="color:#6b7280;font-size:14px;margin-top:4px">${d.hero?.subheadline||''}</div></div>
<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-bottom:7px">Ons Verhaal</div><div style="font-size:13px;line-height:1.7;color:#374151">${(d.verhaal||'').replace(/\n/g,'<br>')}</div></div>
<div style="border:1px solid #bfdbfe;border-radius:8px;padding:12px;background:#eff6ff"><div style="font-size:10px;color:#1d4ed8;text-transform:uppercase;font-weight:700;margin-bottom:5px">Missie</div><div style="font-size:13px;font-style:italic;color:#1d4ed8">"${d.missie||''}"</div></div>
${(d.waarden||[]).length?`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-bottom:8px">Kernwaarden</div><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">${(d.waarden||[]).map(w=>`<div style="background:#f9fafb;border-radius:6px;padding:9px"><div style="font-size:16px;margin-bottom:3px">${w.icon||'⭐'}</div><div style="font-weight:700;font-size:12px;margin-bottom:2px">${w.titel}</div><div style="font-size:11px;color:#6b7280">${w.beschrijving}</div></div>`).join('')}</div></div>`:''}
${(d.team||[]).length?`<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px"><div style="font-size:10px;color:#6b7280;text-transform:uppercase;font-weight:700;margin-bottom:8px">Team</div>${(d.team||[]).map(t=>`<div style="padding:9px;background:#f9fafb;border-radius:6px;margin-bottom:7px"><div style="font-weight:700;font-size:13px">${t.naam}</div><div style="font-size:11px;color:#6366f1;margin-bottom:2px">${t.rol}</div><div style="font-size:12px;color:#6b7280">${t.bio}</div></div>`).join('')}</div>`:''}
</div>`;
            break;
          }

          case 'FAQ pagina schrijven': {
            const d = await aiJSON(`Schrijf FAQ pagina voor ${co} (${ni}, ${lo}) — 20 vragen.${intakeContext}
Geef ALLEEN JSON: {"intro":"2-3 zinnen","faqs":[{"nummer":1,"vraag":"string","antwoord":"80-120 woorden","categorie":"Prijzen/Diensten/Openingstijden/Contact/Algemeen"}]}`);
            const faqs = (d.faqs||[]).slice(0,20);
            const cats = [...new Set(faqs.map(f=>f.categorie||'Algemeen'))];
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 6px">FAQ Pagina — ${co}</h2><p style="font-size:12px;color:#6b7280;margin:0 0 14px">${d.intro||''}</p>
${cats.map(cat=>`<div style="margin-bottom:14px"><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6366f1;margin-bottom:7px;padding-bottom:3px;border-bottom:2px solid #eef2ff">${cat}</div><div style="display:flex;flex-direction:column;gap:5px">${faqs.filter(f=>(f.categorie||'Algemeen')===cat).map(f=>`<div style="border:1px solid #e5e7eb;border-radius:7px;overflow:hidden"><div style="padding:9px 12px;font-weight:600;font-size:12px;background:#f9fafb">${f.vraag}</div><div style="padding:9px 12px;font-size:12px;color:#374151;line-height:1.6">${f.antwoord}</div></div>`).join('')}</div></div>`).join('')}`;
            break;
          }

          case 'Nieuwsbrief template ontwerpen': {
            const d = await aiJSON(`Ontwerp HTML email nieuwsbrief template voor ${co} (${ni}, ${lo}).${intakeContext}
Geef ALLEEN JSON: {"primaryColor":"#hexcode","sections":[{"type":"header/hero/featured/twoColumn/cta/footer","content":"beschrijving"}],"htmlTemplate":"volledig HTML email (max 3000 chars, inline styles, email-safe, responsive)"}`);
            html = `<h2 style="font-size:17px;font-weight:700;margin:0 0 14px">Nieuwsbrief Template — ${co}</h2>
<div style="margin-bottom:12px;padding:10px;background:#f9fafb;border-radius:7px;font-size:12px"><b>Primaire kleur:</b> <span style="display:inline-block;width:12px;height:12px;background:${d.primaryColor||'#6366f1'};border-radius:2px;vertical-align:middle;margin-right:4px"></span>${d.primaryColor||'#6366f1'}</div>
${d.htmlTemplate?`<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px">Template Preview</div><div style="padding:14px">${d.htmlTemplate}</div></div>`:''}
${(d.sections||[]).length?`<div style="margin-top:12px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><div style="background:#f9fafb;padding:9px 14px;border-bottom:1px solid #e5e7eb;font-weight:700;font-size:12px">Secties</div>${(d.sections||[]).map(s=>`<div style="padding:9px 14px;border-bottom:1px solid #f3f4f6"><span style="background:#eef2ff;color:#6366f1;border-radius:3px;padding:1px 5px;font-size:11px;font-weight:700;margin-right:5px">${s.type}</span><span style="font-size:12px;color:#374151">${s.content}</span></div>`).join('')}</div>`:''}`;
            break;
          }
        }

        if (html) {
          serviceDeliveries[svcName] = { html, generatedAt: new Date().toISOString() };
          console.log(`[Delivery] ✓ ${svcName}`);
        }
      } catch (err) {
        console.error(`[Delivery] ${svcName} mislukt:`, err.message);
        serviceDeliveries[svcName] = { html: `<p style="color:#dc2626;font-size:13px;padding:10px;background:#fef2f2;border-radius:6px">⚠ Generatie mislukt: ${err.message}</p>`, generatedAt: new Date().toISOString(), error: true };
      }
    }
    const sdCount = Object.keys(serviceDeliveries).filter(k => !serviceDeliveries[k].error).length;
    send(4, `${sdCount} service ${sdCount === 1 ? 'levering' : 'leveringen'} gegenereerd`, 'done');

    // Step 5 — Save and notify
    send(5, 'Opslaan & klant notificeren', 'running');
    const delivery = {
      generatedAt: new Date().toISOString(),
      contentCalendar: fullCalendar,
      chatbotFlow: chatbotFlow,
      milestones: milestones,
      serviceDeliveries: serviceDeliveries
    };
    leads[idx].delivery = delivery;
    // Advance to Fase 2 — Uitvoering if not already past it
    if ((leads[idx].currentPhase || 1) < 2) leads[idx].currentPhase = 2;
    addLeadHistory(leads, lead.id, { event: 'deliveryGenerated', label: 'AI leveringen gegenereerd (content kalender, chatbot FAQ, mijlpalen)' });
    writeJSON('leads.json', leads);

    // Auto-send AI delivery email to client
    if (settings.autoClientEmails?.deliveryReady !== false && lead.contactEmail && isResendReady(settings)) {
      try {
        const email = await generateClientEmail(leads[idx], 'deliveryReady', settings);
        await sendEmail({ to: lead.contactEmail, subject: email.subject, body: email.body, settings });
        if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
        leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'deliveryReady', subject: email.subject, body: email.body, to: lead.contactEmail, sentAt: new Date().toISOString(), sentBy: 'systeem' });
        writeJSON('leads.json', leads);
      } catch { /* optional */ }
    }
    send(5, 'Opslaan & klant notificeren', 'done');

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

// ─── Real Analytics (computed from actual lead data) ─────────────────────────

function computeRealAnalytics(lead) {
  const now      = new Date();
  const contacts = readJSON('contacts.json') || [];

  // Bookings: match by contactEmail or company name
  const leadEmail   = (lead.contactEmail || '').toLowerCase();
  const leadCompany = (lead.companyName  || '').toLowerCase();
  const bookings = contacts.filter(c => {
    if (c.type !== 'booking') return false;
    if (leadEmail   && c.email   && c.email.toLowerCase()   === leadEmail)   return true;
    if (leadCompany && c.company && c.company.toLowerCase() === leadCompany) return true;
    return false;
  }).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const thisMonth   = now.getMonth();
  const thisYear    = now.getFullYear();
  const monthBookings = bookings.filter(b => {
    const d = new Date(b.createdAt || 0);
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  });

  const svcCounts = {};
  bookings.forEach(b => { if (b.service) svcCounts[b.service] = (svcCounts[b.service] || 0) + 1; });
  const popularService = Object.entries(svcCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

  // Deliverables: only client-visible approved pages with a URL
  const deliverables = (lead.agentDeliverables || [])
    .filter(d => d.status === 'approved' && d.clientVisible === true && d.url)
    .map(d => ({
      service:     d.service || '',
      url:         d.url     || null,
      builtAt:     d.builtAt || null,
      approvedAt:  d.approvedAt || null,
      type:        d.deliverableType || d.type || 'html',
    }))
    .sort((a, b) => new Date(b.builtAt || 0) - new Date(a.builtAt || 0));

  // Tasks
  const tasks          = lead.tasks || [];
  const completedTasks = tasks.filter(t => t.status === 'klaar' || t.done === true);

  // Project age
  const startDate  = lead.projectStartedAt ? new Date(lead.projectStartedAt) : null;
  const daysActive = startDate ? Math.max(0, Math.floor((now - startDate) / 86400000)) : null;

  // Client emails sent
  const emailLog = lead.clientEmailLog || [];

  return {
    bookings: {
      total:              bookings.length,
      thisMonth:          monthBookings.length,
      lastBooking:        bookings[0]?.createdAt        || null,
      lastBookingService: bookings[0]?.service          || null,
      popularService,
    },
    deliverables: {
      total:    deliverables.length,
      lastBuilt: deliverables[0]?.builtAt || null,
      items:    deliverables,
    },
    project: {
      phase:          lead.currentPhase   || null,
      daysActive,
      startDate:      lead.projectStartedAt || null,
      tasksTotal:     tasks.length,
      tasksCompleted: completedTasks.length,
    },
    emails: {
      total:    emailLog.length,
      lastSent: emailLog.slice(-1)[0]?.sentAt || null,
    },
    generatedAt: now.toISOString(),
  };
}

app.get('/api/leads/:id/real-analytics', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(computeRealAnalytics(lead));
});

// ─── Document Vault ───────────────────────────────────────────────────────────

app.get('/api/leads/:id/documents', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json({ documents: lead.documents || [] });
});

app.post('/api/leads/:id/documents', requireAdmin, (req, res) => {
  const { type, title, content, description, username, visible } = req.body;
  if (!title?.trim() || !type) return res.status(400).json({ error: 'Titel en type zijn verplicht' });
  const leads = readJSON('leads.json') || [];
  const users = readJSON('users.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const user = users.find(u => u.id === req.user?.id);
  if (!leads[idx].documents) leads[idx].documents = [];
  const doc = {
    id: 'doc-' + Date.now(),
    type: type || 'link',
    title: title.trim(),
    content: (content || '').trim(),
    description: (description || '').trim(),
    username: (username || '').trim(),
    visible: visible !== false,
    addedAt: new Date().toISOString(),
    addedBy: user?.name || req.user?.username || 'admin'
  };
  leads[idx].documents.push(doc);
  addLeadHistory(leads, leads[idx].id, { event: 'documentAdded', label: `Document toegevoegd: ${doc.title}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true, document: doc });
});

app.patch('/api/leads/:id/documents/:docId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const docIdx = (leads[idx].documents || []).findIndex(d => d.id === req.params.docId);
  if (docIdx === -1) return res.status(404).json({ error: 'Document niet gevonden' });
  const allowed = ['title', 'content', 'description', 'username', 'visible'];
  allowed.forEach(k => { if (req.body[k] !== undefined) leads[idx].documents[docIdx][k] = req.body[k]; });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.delete('/api/leads/:id/documents/:docId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const before = (leads[idx].documents || []).length;
  leads[idx].documents = (leads[idx].documents || []).filter(d => d.id !== req.params.docId);
  if (leads[idx].documents.length === before) return res.status(404).json({ error: 'Document niet gevonden' });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

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

    const baseUrl = BASE_URL;
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
    if (contactEmail && isResendReady(settings)) {
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
  const portalUrl = lead.portalToken ? `${BASE_URL}/portal/${lead.portalToken}` : '';
  const intakeUrl = lead.intakeToken ? `${BASE_URL}/intake/${lead.id}/${lead.intakeToken}` : '';

  const prompts = {
    welcome: `Schrijf een warme welkomstmail voor een nieuw klant.
Klant: ${lead.contactName || lead.companyName} (bedrijf: ${lead.companyName}, ${lead.niche}, ${lead.location}).
Diensten: ${serviceNames}.
Bureau: ${settings.agencyName}, contactpersoon: ${settings.myName} (${settings.myTitle||''}).
${intakeCtx}
BELANGRIJK: Spreek de klant aan als "Beste ${lead.contactName || lead.companyName}," — gebruik NOOIT de naam van het bureau of medewerker als aanhef.
De mail is professioneel maar persoonlijk, max 200 woorden. Geen bullet lists. Noem concreet wat er de komende week gaat gebeuren.
${intakeUrl ? `Vraag de klant om de intake-vragenlijst in te vullen via: ${intakeUrl} — dit is belangrijk voor een goede start.` : ''}
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

    weeklyUpdate: `Schrijf een professionele maar warme wekelijkse update email (vrijdagmiddag) voor klant ${lead.companyName} (${lead.niche}, ${lead.location}).
Bureau: ${settings.agencyName}, contactpersoon: ${settings.myName} (${settings.myTitle || ''}).
Actieve diensten: ${(lead.services || []).map(s => s.name).join(', ') || 'AI-marketingdiensten'}.
${intakeCtx}
${portalUrl ? `Portaallink: ${portalUrl}` : ''}
Week van: ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' })}.
Structuur: (1) korte positieve opening over de week, (2) 2-3 concrete dingen die deze week gedaan zijn per dienst (wees specifiek en opbouwend), (3) focus voor volgende week, (4) vriendelijke afsluiting. Max 200 woorden. Geen bullet lijsten, vloeiende tekst.
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

  // Auto-generate intake token for welcome emails so the link is always present
  if (trigger === 'welcome' && !lead.intakeToken) {
    leads[idx].intakeToken = Math.random().toString(36).substr(2, 10) + Date.now().toString(36);
    lead.intakeToken = leads[idx].intakeToken;
    writeJSON('leads.json', leads);
  }

  try {
    const email = await generateClientEmail(lead, trigger, settings, req.body);

    // If preview=true, just return without sending
    if (preview) return res.json({ subject: email.subject, body: email.body });

    const to = (lead.contactEmail || '').trim();
    console.log(`[ClientEmail] contactEmail raw: ${JSON.stringify(lead.contactEmail)}`);
    console.log(`[ClientEmail] Char codes: ${[...(lead.contactEmail || '')].map(c => c.charCodeAt(0)).join(',')}`);
    if (!to) return res.status(400).json({ error: 'Geen email adres bekend voor dit bedrijf' });
    if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet geconfigureerd' });

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

app.post('/api/leads/:id/send-welcome', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];

  const to = (lead.contactEmail || '').trim();
  if (!to) return res.status(400).json({ error: 'Geen contactEmail op deze lead — stel het handmatig in via Overzicht → potlood-knop.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return res.status(400).json({ error: `Ongeldig emailadres: "${to}" — pas het aan via Overzicht.` });
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet geconfigureerd — voeg Resend API key toe via Instellingen → Email.' });

  try {
    // Ensure portal + intake tokens exist
    if (!leads[idx].portalToken) {
      leads[idx].portalToken = require('crypto').randomBytes(16).toString('hex');
      lead.portalToken = leads[idx].portalToken;
    }
    if (!leads[idx].intakeToken) {
      leads[idx].intakeToken = require('crypto').randomBytes(16).toString('hex');
      lead.intakeToken = leads[idx].intakeToken;
    }

    const portalUrl  = lead.portalToken ? `${BASE_URL}/portal/${lead.portalToken}` : BASE_URL;
    const intakeUrl  = lead.intakeToken ? `${BASE_URL}/intake/${lead.id}/${lead.intakeToken}` : '';
    const logoUrl    = settings.agencyLogo ? `${BASE_URL}/api/logo` : '';
    const agencyName = settings.agencyName || 'Agency AI';
    const myName     = settings.myName || agencyName;
    const myTitle    = settings.myTitle || 'AI Growth Specialist';
    const serviceList = (lead.services || []).map(s => s.name).filter(Boolean);
    const e = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Welkom bij ${e(agencyName)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f2">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f2">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border-radius:10px;overflow:hidden">

      <!-- Header -->
      <tr><td style="padding:24px 32px;background:#111;border-bottom:3px solid #2563eb">
        ${logoUrl
          ? `<img src="${logoUrl}" alt="${e(agencyName)}" style="height:34px;max-width:160px;object-fit:contain;display:block">`
          : `<span style="font-family:Arial,sans-serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:-0.5px">${e(agencyName)}</span>`}
      </td></tr>

      <!-- Hero -->
      <tr><td style="padding:36px 32px 20px;background:#fff">
        <h1 style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:24px;font-weight:800;color:#111">Welkom, ${e(lead.contactName || lead.companyName)}!</h1>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#374151">
          Fijn dat je voor ${e(agencyName)} hebt gekozen. We gaan samen de volgende stap zetten — hieronder vind je alles wat je nodig hebt om van start te gaan.
        </p>
      </td></tr>

      <!-- Services chip list -->
      ${serviceList.length ? `<tr><td style="padding:0 32px 24px">
        <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px">Jouw pakket</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px">${serviceList.map(s => `<span style="display:inline-block;padding:5px 12px;background:#eff6ff;color:#1d4ed8;font-family:Arial,sans-serif;font-size:13px;font-weight:600;border-radius:99px">${e(s)}</span>`).join('')}</div>
      </td></tr>` : ''}

      <!-- Divider -->
      <tr><td style="padding:0 32px"><div style="height:1px;background:#e5e7eb"></div></td></tr>

      <!-- Step 1: Intake -->
      ${intakeUrl ? `<tr><td style="padding:24px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="width:40px">
              <div style="width:32px;height:32px;background:#2563eb;border-radius:50%;text-align:center;line-height:32px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#fff">1</div>
            </td>
            <td valign="top" style="padding-left:14px">
              <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111">Vul de intake in <span style="font-size:12px;font-weight:600;color:#dc2626;background:#fef2f2;padding:2px 8px;border-radius:99px;margin-left:6px">Vereist</span></p>
              <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b7280;line-height:1.6">Zodat we precies weten wat je nodig hebt. Duurt ca. 5 minuten.</p>
              <a href="${e(intakeUrl)}" style="display:inline-block;padding:12px 22px;background:#2563eb;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px">Intake invullen →</a>
            </td>
          </tr>
        </table>
      </td></tr>` : ''}

      <!-- Step 2: Portal -->
      <tr><td style="padding:24px 32px 0">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="width:40px">
              <div style="width:32px;height:32px;background:#2563eb;border-radius:50%;text-align:center;line-height:32px;font-family:Arial,sans-serif;font-size:14px;font-weight:800;color:#fff">${intakeUrl ? '2' : '1'}</div>
            </td>
            <td valign="top" style="padding-left:14px">
              <p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111">Jouw persoonlijke klantportaal</p>
              <p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:14px;color:#6b7280;line-height:1.6">Volg de voortgang van jouw project, bekijk leveringen en stel vragen — 24/7 beschikbaar.</p>
              <a href="${e(portalUrl)}" style="display:inline-block;padding:12px 22px;background:#111;color:#fff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px">Portaal openen →</a>
              <p style="margin:8px 0 0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af">Bewaar deze link — je hebt hem altijd nodig.</p>
            </td>
          </tr>
        </table>
      </td></tr>


      <!-- Footer -->
      <tr><td style="padding:32px 32px 28px">
        <div style="height:1px;background:#e5e7eb;margin-bottom:24px"></div>
        <p style="margin:0 0 2px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111">${e(myName)}</p>
        <p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280">${e(myTitle)} &middot; ${e(agencyName)}</p>
        <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;color:#9ca3af">Heb je vragen? Reageer op deze email of stuur een bericht via je portaal.</p>
      </td></tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;

    await sendEmail({ to, subject: `Welkom bij ${agencyName} — jouw toegangslinks`, html, settings });
    addLeadHistory(leads, lead.id, { event: 'welcomeEmailSent', label: `Welkomstmail verstuurd naar ${to}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true, to });
  } catch (err) {
    console.error('[WelcomeEmail] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Agent Chat (project page AI agent) ──────────────────────────────────────

app.post('/api/leads/:id/agent-chat', requireAdmin, async (req, res) => {
  const { problemType, message, action, deliverableIdx } = req.body || {};
  const leadId = req.params.id;
  console.log('[AgentChat] leadId:', leadId);
  console.log('[AgentChat] message:', message?.slice(0, 50));
  console.log('[AgentChat] action:', action, '| deliverableIdx:', deliverableIdx);

  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === leadId);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead     = leads[idx];
  const settings = readJSON('settings.json') || {};

  if (!message?.trim()) return res.status(400).json({ error: 'Geen bericht opgegeven' });

  try {
    if (action === 'build') {
      const PREAMBLE = BUILD_HTML_RULES;
      // Extract live brand style from client website
      const chatStyle = await extractWebsiteStyle(lead.websiteUrl);
      const chatIntakeRaw = { ...(lead.intakeAnswers || {}), ...(lead.intakeData || {}) };
      const chatProblems = (lead.selectedProblems || []).map(p => (typeof p === 'string' ? p : p.text || p)).filter(Boolean);
      const chatToneNote = chatStyle.tone === 'formal' ? 'Formal/Formeel — use "u"/"uw" (not "jij/je")' : 'Informal/Informeel — use "jij"/"je"/"jouw" (not "u/uw")';
      const chatLang = (lead.language && lead.language !== 'nl') ? 'English' : 'Dutch (Nederlands)';
      const chatIntakeLines = Object.entries(chatIntakeRaw).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`).join('\n');

      const _chatBaseSiteSlug = (lead.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const _chatUploadedFiles = (lead.clientUploads || []).map(u => ({
        filename: u.filename,
        mimeType: u.mimeType || 'application/octet-stream',
        url: `${BASE_URL}/api/sites/${_chatBaseSiteSlug}/uploads/${encodeURIComponent(u.filename)}`
      }));
      const _chatHasImages = _chatUploadedFiles.some(f => f.mimeType.startsWith('image/'));
      const chatUploadsCtx = `\nUPLOADED FILES BY CLIENT:\n${_chatUploadedFiles.length > 0
        ? _chatUploadedFiles.map(f => `- ${f.filename} (${f.mimeType}) → ${f.url}`).join('\n')
        : 'No files uploaded yet'}${_chatUploadedFiles.length > 0 ? `\n\nUSE THESE EXACT IMAGE URLs (no auth needed, publicly accessible):\n${_chatUploadedFiles.map(f => `${f.filename}: ${f.url}`).join('\n')}` : ''}${_chatHasImages ? `\nIMPORTANT — client has uploaded images. Use their direct URLs in HTML:\n- Logo file (name contains "logo"): use as <img> in header/nav\n- Banner/header image: use as hero background\n- All other images: embed contextually using the URL above\n- Do NOT use placeholder images when real client files are available\n- IMPORTANT: Copy the URL exactly as shown — these URLs work without any login` : ''}`;

      const chatBrandCtx = `
BRAND & STYLE — follow exactly:
Company: ${lead.companyName} | Location: ${lead.location || ''} | Niche: ${lead.niche || ''}
Primary color: ${chatStyle.color} — use as accent, buttons, headers (NOT indigo unless this IS the brand color)
Font: ${chatStyle.font} — load from Google Fonts
Tone: ${chatToneNote}
Language: ${chatLang}
${chatStyle.description ? `Brand description: ${chatStyle.description}` : ''}
${chatProblems.length ? `Problems being solved:\n${chatProblems.map(p => `- ${p}`).join('\n')}` : ''}
${chatIntakeLines ? `Client intake answers:\n${chatIntakeLines}` : ''}
${chatUploadsCtx}
`.trim();

      const msgLower = (message || '').toLowerCase();
      const typeLower = (problemType || '').toLowerCase();
      const combined = msgLower + ' ' + typeLower;

      // Detect which of 4 build categories applies
      const isBooking  = /boek|reserv|afspra|agenda|appointment|calendar/.test(combined);
      const isChatbot  = /chatbot|chat.*bot|faq.*assistent|kennisbank|support.*bot/.test(combined);
      const isDocument = /rapport|audit|analyse|report|seo rapport|concurrentie|keyword|onderzoek|strateg/.test(combined) && !isBooking;
      const isStrategy = /crm|automatiser|lead scoring|a\/b|funnel|stappenplan|roadmap/.test(combined) && !isBooking;
      const isHtml     = !isDocument && !isStrategy; // website, chatbot, booking, dashboard, landing → full HTML

      let buildPrompt;
      if (isBooking) {
        buildPrompt = `${PREAMBLE}Build a complete HTML booking page for ${lead.companyName} in ${lead.location || ''}.

${chatBrandCtx}

MUST include in <body>:
1. Sticky header with company name and tagline
2. Full-viewport hero section: headline, subtext, 2 CTA buttons
3. Step-by-step booking flow:
   - Step 1: Service selection (clickable cards) — use intake answers for actual services/prices: ${message}
   - Step 2: Date picker — Mon-Fri calendar only (past dates + weekends disabled), month navigation
   - Step 3: Time slot picker 09:00-17:00 (1-hour intervals, visually styled)
   - Step 4: Contact form (naam, bedrijf, email, telefoon, notities)
   - Submit with loading spinner
   - Success confirmation screen with booking summary
4. Footer with contact info
Use brand color ${chatStyle.color} as accent. Load font "${chatStyle.font}" from Google Fonts. Scroll-triggered animations. Mobile responsive.`;
      } else if (isDocument) {
        buildPrompt = `${PREAMBLE}Build a complete HTML report/document for ${lead.companyName}.

${chatBrandCtx}

Task: ${message}

MUST include in <body>:
- Professional report header with title, company name, date
- Executive summary (3-5 key findings specific to ${lead.niche || 'their industry'})
- Main content sections with headings, data tables where relevant, bullet lists
- Recommendations with numbered action items
- Footer

Style: clean report layout, white background, dark section headers, ${chatStyle.font} from Google Fonts, print-friendly. Use brand color ${chatStyle.color} for headings and accents.`;
      } else if (isStrategy) {
        buildPrompt = `${PREAMBLE}Build a complete HTML strategy document for ${lead.companyName}.

${chatBrandCtx}

Task: ${message}

MUST include in <body>:
- Strategy title and company context section
- Situation analysis: current state vs desired state with visual comparison cards
- Step-by-step implementation plan with phases and timelines
- Visual roadmap section
- KPIs and success metrics table
- Next steps and quick wins section

Use brand color ${chatStyle.color} for section highlights and phase colors. Load font "${chatStyle.font}" from Google Fonts. Scroll-triggered animations.`;
      } else if (isChatbot) {
        buildPrompt = `${PREAMBLE}Build a complete HTML chatbot / FAQ assistant page for ${lead.companyName}.

${chatBrandCtx}

Task: ${message}

MUST include in <body>:
1. Full-viewport hero section with headline, subtext, and chat preview
2. Floating chat widget (bottom-right): open/close toggle, message bubbles, typing indicator animation
3. Minimum 15 pre-programmed Q&A pairs relevant to their niche and services
4. Lead capture form triggered when user asks to contact/book
5. IMPORTANT fallback: "Ik kan u helaas niet verder helpen met deze vraag. Neem contact op via ${lead.contactEmail || '[email]'} of bel ons voor directe hulp."
6. Veelgestelde vragen accordion section (top 8 questions)
7. Footer
Use brand color ${chatStyle.color} as accent. Load font "${chatStyle.font}" from Google Fonts. Mobile responsive.`;
      } else {
        buildPrompt = `${PREAMBLE}Build a complete, fully functional standalone HTML page for ${lead.companyName}.

${chatBrandCtx}

Task: ${message}

MUST include in <body>:
1. Sticky navigation with all sections + hamburger menu on mobile
2. Full-viewport hero: large headline, subtext, stats row (3 numbers), 2 CTA buttons
3. 3+ richly styled content sections directly relevant to the task/service — each with heading, subtext, and content cards (icon + title + description)
4. Contact/CTA section with form or button
5. Branded footer
Use brand color ${chatStyle.color} as accent. Load font "${chatStyle.font}" from Google Fonts. Scroll-triggered entrance animations. Mobile responsive. Minimum 500 words.`;
      }

      // aiCallBuild() now handles markdown stripping + body validation internally
      let html = await aiCallBuild(buildPrompt);

      // Append integration guide as HTML comment before </body>
      const _integGuide = buildIntegrationGuide(settings);
      html = html.includes('</body>') ? html.replace('</body>', `${_integGuide}\n</body>`) : html + _integGuide;

      const companySlug = lead.companyName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      // Map problem type to a short clean keyword
      const typeKeywords = {
        booking: ['boek', 'reserv', 'afspra', 'agenda', 'appointment'],
        chatbot: ['chat', 'bot', 'faq', 'vragen', 'support'],
        website: ['website', 'site', 'pagina', 'webshop', 'shop'],
        forms: ['formulier', 'form', 'intake', 'aanvraag'],
        social: ['social', 'instagram', 'facebook', 'linkedin'],
        review: ['review', 'beoorde', 'google'],
        email: ['email', 'mail', 'nieuwsbrief', 'newsletter'],
      };
      const probLower = (problemType || '').toLowerCase();
      let typeSlug = 'tool';
      for (const [key, keywords] of Object.entries(typeKeywords)) {
        if (keywords.some(k => probLower.includes(k))) { typeSlug = key; break; }
      }
      const sitesDir = path.join(__dirname, 'public', 'sites', companySlug);
      fs.mkdirSync(sitesDir, { recursive: true });
      const filePath = path.join(sitesDir, `${typeSlug}.html`);
      fs.writeFileSync(filePath, html, 'utf8');
      console.log('[Build] Saved to:', filePath);
      console.log('[Build] File exists:', fs.existsSync(filePath));
      const filename = `${typeSlug}.html`;
      const url = `${BASE_URL}/sites/${companySlug}/${filename}`;

      if (!leads[idx].agentBuilds) leads[idx].agentBuilds = [];
      leads[idx].agentBuilds.push({ type: typeSlug, url, filename, builtAt: new Date().toISOString() });

      // If this was a deliverable adjustment, update the existing deliverable record
      const dIdx = parseInt(deliverableIdx);
      if (!isNaN(dIdx) && leads[idx].agentDeliverables?.[dIdx]) {
        leads[idx].agentDeliverables[dIdx].html   = html;
        leads[idx].agentDeliverables[dIdx].url    = url;
        leads[idx].agentDeliverables[dIdx].builtAt = new Date().toISOString();
        leads[idx].agentDeliverables[dIdx].status  = 'wacht_op_goedkeuring';
        leads[idx].agentDeliverables[dIdx].clientVisible = false;
        console.log('[AgentChat] Updated agentDeliverables[' + dIdx + '] with new build');
      }

      addLeadHistory(leads, leadId, { event: 'agentBuild', label: `Agent bouwde: ${typeSlug}` });
      writeJSON('leads.json', leads);

      return res.json({ built: true, url, typeSlug, companySlug, response: `✓ Gebouwd! Beschikbaar op: ${url}` });
    }

    // action === 'chat': generate a plan and ask for confirmation
    const chatPrompt = `Je bent een gespecialiseerde AI-agent voor: ${problemType || 'marketing'}.

Klant: ${lead.companyName} (${lead.niche || 'onbekend'}, ${lead.location || ''})
Website: ${lead.websiteUrl || 'geen'}
Probleem: ${problemType || 'onbekend'}

De gebruiker zegt: "${message}"

Geef een concreet actieplan in max 120 woorden. Sluit altijd af met:
"Wil je dat ik dit nu maak? Typ 'ja bouwen' om te bevestigen."

Schrijf in het Nederlands.`;

    const response = await aiCall(chatPrompt);
    res.json({ built: false, response });
  } catch (err) {
    console.error('[AgentChat] Fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Agent chat persistence ────────────────────────────────────────────────────
app.get('/api/leads/:id/agent-chats', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.agentChats || {});
});

app.patch('/api/leads/:id/agent-chats', (req, res) => {
  const { chats } = req.body || {};
  if (!chats || typeof chats !== 'object') return res.status(400).json({ error: 'Geen chats opgegeven' });
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].agentChats = chats;
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.get('/api/leads/:id/client-emails', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.clientEmailLog || []);
});

app.post('/api/leads/:id/manual-email', requireAdmin, async (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Onderwerp en inhoud zijn verplicht' });
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];
  if (!lead.contactEmail) return res.status(400).json({ error: 'Lead heeft geen email adres' });
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });
  await sendEmail({ to: lead.contactEmail, subject, body, settings });
  const entry = { id: Date.now().toString(36), trigger: 'manual', subject, body, sentAt: new Date().toISOString() };
  leads[idx].clientEmailLog = leads[idx].clientEmailLog || [];
  leads[idx].clientEmailLog.push(entry);
  addLeadHistory(leads, lead.id, { event: 'clientEmailSent', label: `Handmatige email: ${subject}` });
  writeJSON('leads.json', leads);
  addActivity('email', `Handmatige email → ${lead.companyName}`, { leadId: lead.id });
  res.json({ ok: true });
});

app.post('/api/leads/:id/generate-delivery-email', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  const settings = readJSON('settings.json') || {};
  const isNL = (lead.language || 'nl') !== 'en';
  const deliverables = (lead.agentDeliverables || []).filter(d => d.status === 'done' || d.status === 'approved');
  const htmlDelivs   = deliverables.filter(d => d.type === 'code');
  const otherDelivs  = deliverables.filter(d => d.type !== 'code');
  const portalUrl = lead.portalToken ? `${BASE_URL}/portal/${lead.portalToken}` : '';
  const agencyName = settings.agencyName || 'Agency AI';
  const myName = settings.myName || 'Het team';
  const adminEmail = settings.gmailAddress || '';
  const clientLoginUrl = `${BASE_URL}/client/login`;

  const htmlDelivBlock = htmlDelivs.map(d => {
    const fullUrl = d.url ? (d.url.startsWith('http') ? d.url : BASE_URL + d.url) : null;
    return `  SERVICE: ${d.service}\n  DIRECTE LINK: ${fullUrl || '(geen URL)'}\n  TYPE: Interactieve HTML pagina`;
  }).join('\n\n');

  const otherDelivBlock = otherDelivs.map(d => `  SERVICE: ${d.service} [${d.type}]`).join('\n');

  const prompt = isNL
    ? `Je bent een professional bij ${agencyName}. Schrijf een warme professionele opleveringsmail voor klant ${lead.companyName}.

HTML PAGINA'S GEBOUWD (vermeld ELKE pagina met exacte URL):
${htmlDelivBlock || '  (geen HTML paginas gebouwd)'}

${otherDelivBlock ? 'OVERIGE LEVERINGEN:\n' + otherDelivBlock + '\n' : ''}${portalUrl ? 'Klantportaal: ' + portalUrl : ''}
Klantlogin pagina: ${clientLoginUrl} (inloggen met gebruikersnaam + wachtwoord, NIET met emailadres)
Agency: ${agencyName} | Naam: ${myName} | Email: ${adminEmail}

Schrijf in het Nederlands. Geen markdown, plain text. Geef terug als JSON: {"subject":"...","body":"..."}

REGELS:
1. Noem ALLEEN de diensten en pagina's die hierboven vermeld staan. Noem GEEN projectplan, content kalender of takenoverzicht als die niet in de lijst staan.
2. Voor elke HTML pagina: geef de exacte URL, leg uit wat het doet, hoe klanten van de klant het gebruiken, en hoe de klant het kan toevoegen aan zijn website (bijv. "Voeg deze link toe als menuknop of navigatiemenuitem").
3. Portaallogin: schrijf ALTIJD "Log in met uw gebruikersnaam en wachtwoord" — NOOIT "log in met uw e-mailadres".
4. Body moet bevatten:
   - Warme opening met bedrijfsnaam klant
   - Per HTML pagina: directe URL (duidelijk vermeld), wat het doet, hoe klanten het gebruiken, hoe toe te voegen aan website
   - Sectie "Hoe logt u in op uw portaal?" met gebruikersnaam+wachtwoord instructie en link naar ${clientLoginUrl}
   - Sectie "Wat u nu kunt doen" met 3-5 concrete stappen
   - Afsluiting met contactgegevens van ${myName}`
    : `You are a professional at ${agencyName}. Write a warm delivery email for client ${lead.companyName}.

HTML PAGES BUILT (mention EACH page with exact URL):
${htmlDelivBlock || '  (no HTML pages built)'}

${otherDelivBlock ? 'OTHER DELIVERABLES:\n' + otherDelivBlock + '\n' : ''}${portalUrl ? 'Client portal: ' + portalUrl : ''}
Client login page: ${clientLoginUrl} (login with username + password, NOT with email address)
Agency: ${agencyName} | Name: ${myName} | Email: ${adminEmail}

Write in English. Plain text only. Return JSON: {"subject":"...","body":"..."}

RULES:
1. Only mention the services and pages listed above. Do NOT mention project plan, content calendar or task overview unless they are in the list.
2. For each HTML page: include the exact URL, explain what it does, how the client's customers use it, and how to add it to their website (e.g. "Add this link as a menu button or navigation item").
3. Portal login: always write "Log in with your username and password" — NEVER "log in with your email address".
4. Body must include:
   - Warm opening with client company name
   - Per HTML page: direct URL (clearly shown), what it does, how customers use it, how to add to website
   - Section "How to log in to your portal" with username+password instruction and link to ${clientLoginUrl}
   - Section "What you can do now" with 3-5 concrete steps
   - Closing with contact info for ${myName}`;
  try {
    const result = await aiJSON(prompt);
    const subject = result.subject || `Uw project is klaar — ${lead.companyName}`;
    const body    = result.body || '';
    // Persist to lead so UI can show saved state
    const leadsW = readJSON('leads.json') || [];
    const wIdx   = leadsW.findIndex(l => l.id === req.params.id);
    if (wIdx !== -1) {
      leadsW[wIdx].opleveringEmail = { subject, body, generatedAt: new Date().toISOString(), sentAt: leadsW[wIdx].opleveringEmail?.sentAt || null };
      writeJSON('leads.json', leadsW);
    }
    res.json({ subject, body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/send-delivery-email', requireAdmin, async (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Onderwerp en inhoud zijn verplicht' });
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];
  if (!lead.contactEmail) return res.status(400).json({ error: 'Klant heeft geen emailadres' });
  const settings = readJSON('settings.json') || {};
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld. Ga naar Instellingen → Email.' });
  await sendEmail({ to: lead.contactEmail, subject, body, settings });
  const sentAt = new Date().toISOString();
  leads[idx].clientEmailLog = leads[idx].clientEmailLog || [];
  leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'deliveryEmail', subject, body, sentAt });
  if (leads[idx].opleveringEmail) leads[idx].opleveringEmail.sentAt = sentAt;
  addLeadHistory(leads, lead.id, { event: 'clientEmailSent', label: 'Oplevering email verstuurd' });
  writeJSON('leads.json', leads);
  addActivity('email', `Oplevering email → ${lead.companyName}`, { leadId: lead.id });
  res.json({ ok: true });
});

// ── Project files ───────────────────────────────────────────────────────────
app.get('/api/leads/:id/client-uploads/:filename', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });

  const filename = req.params.filename;
  console.log('[Download] Admin filename param:', filename);
  console.log('[Download] clientUploads count:', lead.clientUploads?.length);
  console.log('[Download] upload filenames:', lead.clientUploads?.map(u => u.filename));
  const upload = _findUpload(lead.clientUploads, filename);
  console.log('[Download] found upload:', upload ? 'yes, content length: ' + upload.content?.length : 'NOT FOUND');
  if (!upload) return res.status(404).json({ error: 'Bestand niet gevonden' });
  _serveUpload(upload, res);
});

app.get('/api/leads/:id/project-files', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.projectFiles || []);
});

app.post('/api/leads/:id/project-files', requireAdmin, (req, res) => {
  const { name, type, url, problem } = req.body;
  if (!name || !url) return res.status(400).json({ error: 'Naam en URL zijn verplicht' });
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const file = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: name.trim(),
    type: type || 'html',
    url,
    fullUrl: url.startsWith('http') ? url : (process.env.BASE_URL || 'https://www.agencyai.info') + url,
    problem: problem || '',
    createdAt: new Date().toISOString(),
    sharedWithClient: false,
    adminOnly: true
  };
  leads[idx].projectFiles = leads[idx].projectFiles || [];
  leads[idx].projectFiles.push(file);
  writeJSON('leads.json', leads);
  res.json(file);
});

app.patch('/api/leads/:id/project-files/:fileId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const files = leads[idx].projectFiles || [];
  const fIdx  = files.findIndex(f => f.id === req.params.fileId);
  if (fIdx === -1) return res.status(404).json({ error: 'Bestand niet gevonden' });
  Object.assign(files[fIdx], req.body);
  leads[idx].projectFiles = files;
  writeJSON('leads.json', leads);
  res.json(files[fIdx]);
});

app.delete('/api/leads/:id/project-files/:fileId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx   = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].projectFiles = (leads[idx].projectFiles || []).filter(f => f.id !== req.params.fileId);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/generate-admin-instructions', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  const settings    = readJSON('settings.json') || {};
  const deliverables = (lead.agentDeliverables || []).filter(d => d.status === 'done' || d.status === 'approved');
  const openTasks   = (lead.tasks || []).filter(t => t.status !== 'klaar');
  const delivList   = deliverables.map(d => `- ${d.service}: ${d.url ? (d.url.startsWith('http') ? d.url : BASE_URL + d.url) : '(geen URL)'} [${d.type || 'document'}]`).join('\n') || '(geen deliverables gebouwd)';
  const taskList    = openTasks.map(t => `- ${t.title} (W${t.week || 1})`).join('\n') || '(geen open taken)';
  const portalUrl   = lead.portalToken ? `${BASE_URL}/portal/${lead.portalToken}` : 'niet aangemaakt';
  const bookingD    = deliverables.find(d => /booking|afspraak|reserv/i.test(d.service));
  const bookingUrl  = bookingD?.url ? BASE_URL + bookingD.url : null;
  const prompt = `Schrijf een duidelijk admin-instructiedocument in het Nederlands voor project "${lead.companyName}".
Dit is voor de agency intern — niet voor de klant.

DELIVERABLES:
${delivList}

OPEN TAKEN:
${taskList}

INFO:
Klant: ${lead.companyName} | Email: ${lead.contactEmail || 'onbekend'}
Portaal: ${portalUrl}
Admin email: ${settings.gmailAddress || 'niet ingesteld'}
Agency: ${settings.agencyName || 'Agency AI'}
${bookingUrl ? 'Booking URL: ' + bookingUrl : ''}

Maak een gestructureerd document (plain text, geen markdown, geen ###) met deze secties:
ADMIN INSTRUCTIES — ${lead.companyName}
Aangemaakt: ${new Date().toLocaleDateString('nl-NL')}

WAT IS GEBOUWD
HOE KLANT DELIVERABLES ZIET
${bookingUrl ? 'HOE BOEKINGEN WERKEN' : ''}
WAT KLANT NOG MOET DOEN
WAT JIJ NOG MOET DOEN
BELANGRIJKE LINKS

Max 500 woorden. Geef direct de tekst terug, geen JSON.`;
  try {
    const text = await aiCall(prompt);
    res.json({ text: text.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/send-admin-email', requireAdmin, async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'Geen tekst opgegeven' });
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  const settings = readJSON('settings.json') || {};
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });
  if (!settings.gmailAddress) return res.status(400).json({ error: 'Geen admin emailadres ingesteld in Instellingen → Email' });
  try {
    await sendEmail({ to: settings.gmailAddress, subject: `Admin instructies — ${lead.companyName}`, body: text, settings });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/leads/:id/portal/read', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (lead.clientMessages) lead.clientMessages.forEach(m => { m.read = true; });
  if (lead.portalChat) lead.portalChat.filter(m => m.from === 'client').forEach(m => { m.readAt = m.readAt || new Date().toISOString(); });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/portal-reply', requireAdmin, async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Bericht verplicht' });
  const leads    = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const lead     = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  if (!lead.portalChat) lead.portalChat = [];
  const entry = { id: 'pa-' + Date.now(), from: 'admin', name: settings.myName || settings.agencyName || 'Agency', message: message.trim(), time: new Date().toISOString() };
  lead.portalChat.push(entry);
  addLeadHistory(leads, lead.id, { event: 'adminPortalReply', label: `Portaalreactie verstuurd: ${message.trim().substring(0, 60)}` });
  writeJSON('leads.json', leads);
  // Optionally email the client
  const clientEmail = (lead.contactEmail || '').trim();
  if (clientEmail && isResendReady(settings) && lead.portalToken) {
    const portalUrl = `${BASE_URL}/portal/${lead.portalToken}`;
    try {
      await sendEmail({ to: clientEmail, subject: `Reactie van ${settings.agencyName || 'uw bureau'}`, body: `Beste ${lead.contactName || lead.companyName},\n\nU heeft een nieuw bericht ontvangen via uw klantportaal:\n\n"${message.trim()}"\n\nBekijk het portaal: ${portalUrl}\n\nMet vriendelijke groet,\n${settings.myName || settings.agencyName}`, settings });
    } catch { /* non-fatal */ }
  }
  res.json({ ok: true, entry });
});

// ── Agent deliverables builder ────────────────────────────────────────────────
const CODE_KEYWORDS = ['website', 'booking', 'boek', 'chatbot', 'reserv', 'webshop', 'landing', 'pagina', 'formulier', 'faq bot', 'chatbot'];
function isCodeService(name) {
  const n = (name || '').toLowerCase();
  return CODE_KEYWORDS.some(k => n.includes(k));
}

app.post('/api/leads/:id/run-agents', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (idx, label, status, extra = {}) =>
    res.write(`data: ${JSON.stringify({ idx, label, status, ...extra })}\n\n`);

  try {
    const leads    = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    const li       = leads.findIndex(l => l.id === req.params.id);
    if (li === -1) { send(-1, 'Lead niet gevonden', 'error'); res.end(); return; }
    const lead = leads[li];

    const services = lead.services || [];
    if (!services.length) { send(-1, 'Geen diensten ingesteld op dit project', 'error'); res.end(); return; }

    const intakeContext = lead.intakeAnswers
      ? '\n\nKlant intake antwoorden:\n' + Object.entries(lead.intakeAnswers).map(([k,v]) => `- ${k}: ${v}`).join('\n')
      : '';
    const companySlug = (lead.companyName || 'bedrijf')
      .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 20);

    const deliverables = [];

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      send(i, svc.name, 'running', { total: services.length });

      try {
        if (isCodeService(svc.name)) {
          // Build HTML page
          const nameL = (svc.name || '').toLowerCase();
          const typeSlug = (() => {
            if (/boek|booking|afspraak|reserv|agenda/.test(nameL)) return 'booking';
            if (/website|site/.test(nameL)) return 'website';
            if (/chatbot|chat/.test(nameL)) return 'chatbot';
            if (/dashboard/.test(nameL)) return 'dashboard';
            if (/landing/.test(nameL)) return 'landing';
            if (/faq/.test(nameL)) return 'faq';
            return nameL.replace(/[^a-z]/g, '').substring(0, 20) || 'deliverable';
          })();
          const prompt = `Build a complete HTML page for ${lead.companyName}: ${svc.name}.
Return ONLY raw HTML starting with <!DOCTYPE html>. No markdown, no backticks, no explanation.
Includes all features for: ${svc.name}.${intakeContext}
Style: white bg, indigo #6366f1 accent, Plus Jakarta Sans from Google Fonts, mobile responsive.
All CSS in <style> in <head>. All JS in <script> before </body>.`;

          // aiCallBuild() handles markdown stripping + body validation internally
          const html = await aiCallBuild(prompt);

          // Save file
          const sitesDir = path.join(__dirname, 'public', 'sites', companySlug);
          fs.mkdirSync(sitesDir, { recursive: true });
          const filename = `${typeSlug}.html`;
          fs.writeFileSync(path.join(sitesDir, filename), html, 'utf8');
          const url = `${BASE_URL}/sites/${companySlug}/${filename}`;
          // Generate sitemap.xml and robots.txt
          try {
            const today2 = new Date().toISOString().split('T')[0];
            const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${url}</loc>\n    <lastmod>${today2}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>`;
            const robots = `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sites/${companySlug}/sitemap.xml`;
            fs.writeFileSync(path.join(sitesDir, 'sitemap.xml'), sitemap, 'utf8');
            fs.writeFileSync(path.join(sitesDir, 'robots.txt'), robots, 'utf8');
          } catch(e2) { console.log('[Sitemap] Error:', e2.message); }
          // Generate 404.html for website builds
          if (filename.includes('website') || typeSlug === 'website') {
            try {
              const primaryColor = (html.match(/--primary[^:]*:\s*([#\w()]+)/)?.[1] || '#6366f1').trim();
              const compName = lead?.companyName || companySlug;
              const notFoundHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pagina niet gevonden — ${compName}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f9fafb;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}.card{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;box-shadow:0 4px 24px rgba(0,0,0,.1)}h1{font-size:4rem;font-weight:800;color:${primaryColor};line-height:1}h2{font-size:1.5rem;font-weight:700;margin:12px 0 8px}p{color:#666;font-size:15px;margin-bottom:28px}a{display:inline-block;background:${primaryColor};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}a:hover{opacity:.9}</style></head><body><div class="card"><h1>404</h1><h2>Pagina niet gevonden</h2><p>De pagina die u zoekt bestaat niet of is verplaatst.</p><a href="website.html">&#8592; Terug naar ${compName}</a></div></body></html>`;
              fs.writeFileSync(path.join(sitesDir, '404.html'), notFoundHtml, 'utf8');
            } catch(e4) { console.log('[404] Error:', e4.message); }
          }

          // Auto-generate todo list for client
          const embedCode = `<iframe src="${url}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
          const todoText = await aiCall(`Voor het volgende project, maak een stap-voor-stap lijst voor de klant wat ze zelf moeten doen om dit te activeren op hun website.
Gebouwde pagina: ${svc.name} voor ${lead.companyName}.
Live URL: ${url}
Embed code: ${embedCode}

Geef max 5 stappen in het Nederlands. Verwerk de embed code als letterlijk codeblok in de stappen waar relevant. Begin elke stap met een nummer. Geef ALLEEN de stappen, geen intro of uitleg eromheen.`).catch(() => '');

          deliverables.push({
            id: Date.now().toString(36) + i,
            service: svc.name,
            type: 'code',
            status: 'wacht_op_goedkeuring',
            clientVisible: false,
            html,
            url,
            todoText,
            builtAt: new Date().toISOString()
          });
          send(i, svc.name, 'done', { total: services.length, type: 'code', url });
        } else {
          // Manual work — generate instructions
          const instructions = await aiCall(`Maak een gedetailleerde stap-voor-stap instructiegids voor de admin om de dienst "${svc.name}" uit te voeren voor de klant ${lead.companyName} (${lead.niche || ''}, ${lead.location || ''}).${intakeContext}

Schrijf de instructies voor de ADMIN (niet voor de klant). Max 400 woorden, in het Nederlands.
Wees concreet: welke tools, welke stappen, welke instellingen.`);

          deliverables.push({
            id: Date.now().toString(36) + i,
            service: svc.name,
            type: 'manual',
            status: 'wacht_op_goedkeuring',
            clientVisible: false,
            instructions,
            builtAt: new Date().toISOString()
          });
          send(i, svc.name, 'done', { total: services.length, type: 'manual' });
        }
      } catch (err) {
        deliverables.push({
          id: Date.now().toString(36) + i,
          service: svc.name,
          type: 'unknown',
          status: 'error',
          error: err.message,
          builtAt: new Date().toISOString()
        });
        send(i, svc.name, 'error', { total: services.length, error: err.message });
      }
    }

    leads[li].agentDeliverables = deliverables;
    leads[li].agentsRanAt = new Date().toISOString();
    writeJSON('leads.json', leads);
    addLeadHistory(leads, req.params.id, { event: 'agentsRan', label: `Agents bouwden ${deliverables.length} leveringen` });

    send(-1, 'Klaar', 'complete', { deliverables });
  } catch (err) {
    send(-1, err.message, 'error');
  }
  res.end();
});

// ── Website style extraction helper ──────────────────────────────────────────
async function extractWebsiteStyle(websiteUrl) {
  if (!websiteUrl) return { color: '#6366f1', font: 'Plus Jakarta Sans', tone: 'informal', description: '' };
  try {
    const r = await fetch(websiteUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
    const html = await r.text();

    // Color: theme-color meta → CSS variable → background-color
    const colorMatch =
      html.match(/name=["']theme-color["'][^>]+content=["']([#][0-9a-fA-F]{3,6})["']/i) ||
      html.match(/content=["']([#][0-9a-fA-F]{3,6})["'][^>]+name=["']theme-color["']/i) ||
      html.match(/--(?:primary|brand|accent|main|color)[^:]{0,40}:\s*(#[0-9a-fA-F]{6})/i) ||
      html.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{6})/i);

    // Font: Google Fonts URL first (most reliable), then inline CSS
    const gFontsRaw = html.match(/fonts\.googleapis\.com[^"'<\s]*family=([A-Za-z0-9+:,;|]+)/)?.[1];
    const gFont = gFontsRaw?.split(/[|,;]/)[0].replace(/\+/g, ' ').split(':')[0].trim();
    const cssFontMatch = html.match(/font-family:\s*['"]?([A-Za-z][A-Za-z\s]+?)['"]?\s*[,;]/);

    // Tone: count je/jij (informal) vs u/uw (formal) in visible text
    const textSample = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').substring(0, 6000);
    const informalCount = (textSample.match(/\b(jij|je|jouw|jou)\b/gi) || []).length;
    const formalCount   = (textSample.match(/\b(u|uw)\b/g) || []).length;
    const tone = (formalCount > informalCount * 1.5 && formalCount >= 3) ? 'formal' : 'informal';

    // Brand description from meta
    const description = (
      html.match(/<meta\s+name=["']description["'][^>]+content=["']([^"']{10,200})["']/i)?.[1] ||
      html.match(/content=["']([^"']{10,200})["'][^>]+name=["']description["']/i)?.[1] || ''
    ).trim();

    return {
      color: colorMatch?.[1] || '#6366f1',
      font: gFont || cssFontMatch?.[1]?.trim() || 'Plus Jakarta Sans',
      tone,
      description,
    };
  } catch {
    return { color: '#6366f1', font: 'Plus Jakarta Sans', tone: 'informal', description: '' };
  }
}

const BUILD_HTML_RULES = `You are an expert HTML developer building a premium professional website.

Your ENTIRE response must be raw HTML starting with <!DOCTYPE html> and ending with </html>.
Do NOT use markdown, backticks, or any explanation outside the HTML.
All CSS in a <style> tag in <head>. All JS in a <script> tag before </body>.
No external dependencies except Google Fonts.

CRITICAL QUALITY REQUIREMENTS — follow without exception:

DESIGN:
- Choose a strong color scheme that fits the business niche (dark/light, fitting accent color)
- One consistent design language throughout the entire page
- NO section that looks visually different or pasted in from another design
- Smooth gradient transitions between sections
- Professional typography: load exactly 2 fonts from Google Fonts (a display/heading font + a body font)
- All text must have sufficient contrast — NEVER dark text on dark background, NEVER white text on white background
- Rich visual detail: icons (use Unicode emoji or inline SVG), subtle shadows, border-radius on cards

STRUCTURE:
- Sticky navigation bar listing all sections, with smooth scroll anchors; hamburger menu on mobile
- Full-viewport hero section: large headline, subtext, a stats row (3 numbers), and 2 CTA buttons
- Every section has a clear heading + short subtext paragraph before the content
- Cards always have: icon/emoji, bold title, description text
- Footer with company name, address, phone, email, and current year copyright

SCROLL & ANIMATION:
- Smooth scroll between all anchor sections
- Scroll-triggered entrance animations: elements fade/slide in as they enter the viewport (use IntersectionObserver)

TECHNICAL:
- Contact/booking forms POST to the correct API endpoint (use relative path)
- All buttons and links are functional (no href="#" dead links)
- Hover effects on all interactive elements (buttons, cards, nav links)
- Page loads fast — no heavy external images; use CSS gradients and emoji for visuals

CONTENT:
- Use ALL intake data and brand context provided below
- Show real business name, address, phone number, opening hours if known
- Show real products/services with real prices from intake answers
- Write copy that is specific to the business niche and location
- Professional copywriting tone matching the brand's detected tone (formal/informal)
- Dutch language unless the business is international (English)

MOBILE RESPONSIVE:
- Multi-column grids collapse to 1 column below 768px
- Navigation becomes a hamburger toggle menu on mobile
- Font sizes scale down proportionally on small screens
- All touch targets minimum 44px height
- Zero horizontal scroll on mobile

ABSOLUTELY NEVER:
- Generic placeholder content or Lorem ipsum text
- Broken layout on desktop or mobile
- Invisible text due to wrong color contrast
- Sections that look visually disconnected from the rest
- Any markdown visible in the HTML output (no backticks, no ** bold, no # headings outside HTML)

COOKIE CONSENT (REQUIRED FOR ALL PAGES):
Add a GDPR cookie consent banner fixed at the bottom. Check localStorage.getItem('cookieConsent') - if null/false, show a banner with: message "Wij gebruiken cookies voor een betere ervaring.", [Accepteren] button (sets localStorage.setItem('cookieConsent','1') and hides banner), [Meer info] link (scrolls to #privacy or footer). Style to match the page theme.

PRINT STYLESHEET (REQUIRED):
Add this in the <head>: <style>@media print { nav, header nav, .nav, .navbar, .chatbot-widget, #cookieBanner, .cookie-banner, .sticky, [style*="position:fixed"], [style*="position: fixed"] { display: none !important; } body { background: white !important; color: black !important; } .card, [class*="card"] { box-shadow: none !important; border: 1px solid #ddd !important; } h2, h3 { page-break-after: avoid; } .section, section { page-break-inside: avoid; } }</style>

SCHEMA MARKUP (REQUIRED FOR LOCAL BUSINESS WEBSITES):
Add LocalBusiness JSON-LD in <head>: <script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"[bedrijfsnaam uit intake]","address":{"@type":"PostalAddress","addressLocality":"[stad]","addressCountry":"NL"},"telephone":"[telefoon als bekend]","url":"[website URL]","description":"[1 zin beschrijving van het bedrijf]"}</script>. Also add FAQPage schema if the page includes FAQ items.

PERFORMANCE REQUIRED:
- All images: loading='lazy' except first above-fold image (loading='eager')
- Add in <head>: <link rel='preconnect' href='https://fonts.googleapis.com'><link rel='dns-prefetch' href='//fonts.googleapis.com'>
- Always include: <meta name='viewport' content='width=device-width, initial-scale=1'>

AVAILABLE COMPONENT PATTERNS (use as inspiration for sections):
hero-dark, hero-light, nav-sticky, services-grid, booking-simple,
contact-form, faq-accordion, footer-full, chatbot-widget,
testimonials, stats-bar, cta-section
`;

// ── Build all services for a lead (SSE) ──────────────────────────────────────
app.post('/api/leads/:id/build-all-services', requireAdmin, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  // Track this build in the job_queue table for visibility
  let _buildJobId;
  try {
    const { getDb } = require('./database');
    _buildJobId = getDb().prepare(
      'INSERT INTO job_queue (job_type, status, data, started_at) VALUES (?, ?, ?, ?)'
    ).run('html_build', 'running', JSON.stringify({ leadId: req.params.id }), new Date().toISOString()).lastInsertRowid;
  } catch {}

  try {
    const leads    = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    const li       = leads.findIndex(l => l.id === req.params.id);
    if (li === -1) { sse({ type: 'error', service: '', message: 'Lead niet gevonden' }); res.end(); return; }
    const lead     = leads[li];
    // Support: explicit services array, serviceNames string array (for single retry), or all lead.services
    let services = lead.services || [];
    if (req.body?.services?.length) {
      services = req.body.services;
    } else if (req.body?.serviceNames?.length) {
      const names = req.body.serviceNames;
      services = (lead.services || []).filter(s => names.includes(typeof s === 'string' ? s : s.name));
      if (!services.length) services = names.map(n => ({ name: n }));
    }

    // Normalize: convert strings → objects, filter out null/undefined entries
    services = services
      .filter(s => s && (typeof s === 'string' ? s.trim() : s.name || s.service))
      .map(s => typeof s === 'string' ? { name: s.trim() } : { ...s, name: (s.name || s.service || '').trim() })
      .filter(s => s.name);

    console.log('[Build] Services to build:', JSON.stringify(services.map(s => s.name)));
    console.log('[Build] Selected problems:', JSON.stringify(lead.selectedProblems || []));

    if (!services.length) { sse({ type: 'error', service: '', message: 'Geen diensten ingesteld op dit project' }); res.end(); return; }

    const companySlug = (lead.companyName || 'bedrijf')
      .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
      .substring(0, 20);

    // Build intake context from all available intake fields
    const intakeRaw = { ...(lead.intakeAnswers || {}), ...(lead.intakeData || {}) };
    const intakeContext = Object.keys(intakeRaw).length
      ? `\n\nKLANT INFORMATIE (gebruik dit in alles):
Bedrijf: ${lead.companyName}
Locatie: ${lead.location || ''}
Niche: ${lead.niche || ''}
Website: ${lead.websiteUrl || ''}
Contact: ${intakeRaw.contactNaam || intakeRaw.naam || ''}
Startdatum: ${intakeRaw.startDatum || intakeRaw.startdatum || ''}
Wensen: ${intakeRaw.opmerkingen || intakeRaw.wensen || intakeRaw.notities || ''}
Taal: ${lead.language === 'nl' || !lead.language ? 'Nederlands' : 'Engels'}
Volledige intake:
${Object.entries(intakeRaw).map(([k, v]) => `  ${k}: ${v}`).join('\n')}`
      : `\n\nKLANT INFORMATIE:
Bedrijf: ${lead.companyName}
Locatie: ${lead.location || ''}
Niche: ${lead.niche || ''}
Website: ${lead.websiteUrl || ''}`;

    // Extract website style for brand-matching
    const style = await extractWebsiteStyle(lead.websiteUrl);

    // Compose brandContext — injected into every build prompt
    const problemsCtxList = (lead.selectedProblems || []).map(p => (typeof p === 'string' ? p : p.text || p)).filter(Boolean);
    const toneNote = style.tone === 'formal' ? 'Formeel — gebruik "u" en "uw" (NIET jij/je)' : 'Informeel — gebruik "jij", "je", "jouw" (NIET u/uw)';
    const langNote = (lead.language && lead.language !== 'nl') ? 'English' : 'Nederlands';
    const intakeLines = Object.entries(intakeRaw).filter(([, v]) => v).map(([k, v]) => `  ${k}: ${v}`).join('\n');

    const _baseSiteSlug = (lead.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const _uploadedFiles = (lead.clientUploads || []).map(u => ({
      filename: u.filename,
      mimeType: u.mimeType || 'application/octet-stream',
      size: u.size,
      url: `${BASE_URL}/api/sites/${_baseSiteSlug}/uploads/${encodeURIComponent(u.filename)}`
    }));
    const _hasUploadedImages = _uploadedFiles.some(f => f.mimeType.startsWith('image/'));
    const uploadsCtx = `\n\nUPLOADED FILES BY CLIENT:
${_uploadedFiles.length > 0
  ? _uploadedFiles.map(f => `- ${f.filename} (${f.mimeType}) → ${f.url}`).join('\n')
  : 'No files uploaded yet'}${_uploadedFiles.length > 0 ? `\n\nUSE THESE EXACT IMAGE URLs (no auth needed, publicly accessible):\n${_uploadedFiles.map(f => `${f.filename}: ${f.url}`).join('\n')}` : ''}${_hasUploadedImages ? `\n\nIMPORTANT — client has uploaded images. When building HTML deliverables:
- If a file with "logo" in the name exists, use it as the company logo: <img src="[url]" alt="${lead.companyName} logo" style="height:48px">
- If a file with "banner" or "header" in the name exists, use it as the hero background or header image
- Embed images using their EXACT URL shown above — do NOT use placeholder or stock images when real client files are available
- If none of those patterns match, still consider using the uploaded images contextually
- IMPORTANT: Copy the URL exactly as shown — these URLs work without any login` : ''}`;

    const brandContext = `
MERK & STIJL — volg dit exact:
Bedrijf: ${lead.companyName} | Locatie: ${lead.location || ''} | Niche: ${lead.niche || ''}
Website: ${lead.websiteUrl || ''}
Primaire kleur: ${style.color} — gebruik als accent, knoppen en headers
Lettertype: ${style.font} — laad via Google Fonts indien beschikbaar
Toon: ${toneNote}
Taal van alle teksten: ${langNote}
${style.description ? `Merkbeschrijving: ${style.description}` : ''}
${problemsCtxList.length ? `Problemen die we oplossen:\n${problemsCtxList.map(p => `- ${p}`).join('\n')}` : ''}
${intakeLines ? `Intake antwoorden van klant:\n${intakeLines}` : ''}${uploadsCtx}
`.trim();

    // Service classification
    const HTML_KEYWORDS   = /website|boek|boeking|booking|chatbot|dashboard|landingspagina|landing.*page|faq.*assistent|kennisbank|offerte.*generator|onboarding/i;
    const STRAT_KEYWORDS  = /seo.*rapport|concurrentie|audit|crm|lead.*scoring|branding|heatmap|trend|keyword.*research/i;
    // everything else → TEXT_DOCUMENT

    const deliverables = [];

    for (let i = 0; i < services.length; i++) {
      const svc = services[i];
      const serviceName = (svc.name || '').trim();
      if (!serviceName) {
        console.log('[Build] Skipping undefined service at index', i);
        continue;
      }
      sse({ type: 'start', service: serviceName, index: i, total: services.length });

      try {
        const nameL = serviceName.toLowerCase();
        const typeSlug = (() => {
          if (/boek|booking|afspraak|reserv|agenda/.test(nameL)) return 'booking';
          if (/website|site/.test(nameL)) return 'website';
          if (/chatbot|chat/.test(nameL)) return 'chatbot';
          if (/dashboard/.test(nameL)) return 'dashboard';
          if (/landing/.test(nameL)) return 'landing';
          if (/faq/.test(nameL)) return 'faq';
          return nameL.replace(/[^a-z]/g, '').substring(0, 20) || 'deliverable';
        })();

        let deliverable;

        // Text-writing services must NOT be classified as HTML builds even if
        // the name contains "website" (e.g. "Website teksten schrijven")
        const FORCE_TEXT_DOC = /\bteksten\b/i;

        if (HTML_KEYWORDS.test(serviceName) && !FORCE_TEXT_DOC.test(serviceName)) {
          // ── HTML build ──────────────────────────────────────────────────────
          console.log(`[Build] Type: HTML_BUILD | Service: ${serviceName}`);
          sse({ type: 'progress', service: serviceName, percent: 20 });

          const isBooking = /boek|booking|afspraak|reserv|agenda|integreren.*systeem|systeem.*integrer/i.test(serviceName);
          let prompt;
          if (isBooking) {
            prompt = `${BUILD_HTML_RULES}Build a complete HTML booking page for ${lead.companyName} in ${lead.location || ''}.

${brandContext}

MUST include in <body>:
1. Sticky header with company name and tagline
2. Full-viewport hero section: headline, subtext, 2 CTA buttons
3. Step-by-step booking flow:
   - Step 1: Service selection (clickable cards with real service names/prices from intake)
   - Step 2: Date picker — Mon-Fri calendar only (past dates + weekends disabled), month navigation
   - Step 3: Time slot picker 09:00-17:00 (1-hour intervals, visually styled)
   - Step 4: Contact form (naam, bedrijf, email, telefoon, notities)
   - Submit button with loading spinner
   - Success confirmation screen with booking summary
4. Footer with contact info
Use EXACTLY the brand color ${style.color} as accent. Load font "${style.font}" from Google Fonts. Scroll-triggered animations. Mobile responsive.`;
          } else if (/chatbot|faq.*assistent|kennisbank/i.test(serviceName)) {
            prompt = `${BUILD_HTML_RULES}Build a complete HTML chatbot / FAQ assistant page for ${lead.companyName}.

${brandContext}

MUST include in <body>:
1. Full-viewport hero section with headline, subtext, and chat widget preview
2. Floating chat widget (bottom-right corner): open/close toggle button, message bubbles (left for bot, right for user), typing indicator animation, smooth open/close animation
3. Pre-programmed Q&A pairs (minimum 15) specifically about ${lead.niche || 'the business'} — use intake answers for real services/prices
4. Lead capture form triggered when user asks to contact or book
5. IMPORTANT fallback: when no matching answer, display exactly: "Ik kan u helaas niet verder helpen met deze vraag. Neem contact op via ${lead.contactEmail || '[email]'} of bel ons voor directe hulp."
6. "Veelgestelde vragen" section showing the top 8 questions as clickable FAQ accordion
7. Footer with contact info
Use EXACTLY the brand color ${style.color} as accent. Load font "${style.font}" from Google Fonts. Scroll-triggered animations. Mobile responsive.`;
          } else if (/dashboard/i.test(serviceName)) {
            prompt = `${BUILD_HTML_RULES}Build a complete HTML analytics dashboard for ${lead.companyName}.

${brandContext}

MUST include in <body>: sidebar navigation with menu items, top bar with company name and date filter, KPI cards row (omzet, bezoekers, conversies, engagement) with trend arrows, two chart placeholder sections with realistic demo data visualized via CSS bars, a data table with sortable columns, responsive grid layout.
Use EXACTLY the brand color ${style.color} as accent. Load font "${style.font}" from Google Fonts. Mobile responsive.`;
          } else {
            prompt = `${BUILD_HTML_RULES}Build a complete HTML ${serviceName} page for ${lead.companyName}.

${brandContext}

MUST include in <body> — in this order:
1. Sticky navigation: company name/logo left, nav links right (Home, Over ons, Diensten, Boeken, Contact), hamburger on mobile
2. Full-viewport hero: large headline, subtext describing the business, a stats row with 3 impressive numbers (clients, years, satisfaction etc.), two CTA buttons (primary + secondary)
3. Over ons section with company story and 3 value cards (each with icon + title + description)
4. Diensten section: richly styled service cards (icon, name, short description, price if known)
5. A section with id="boeken" — place this comment inside: <!-- BOOKING_INJECT -->
6. Contact section with a working form (naam, email, bericht) that POSTs to /api/sites/${(lead.companyName||'').toLowerCase().replace(/[^a-z0-9]+/g,'-')}/contact
7. Branded footer with address, phone, email, social links, copyright year
8. Place this comment exactly before </body>: <!-- CHATBOT_INJECT -->
Use EXACTLY the brand color ${style.color} as accent color. Load font "${style.font}" from Google Fonts. Minimum 600 words of visible content. Scroll-triggered animations on all sections.`;
          }

          sse({ type: 'progress', service: serviceName, percent: 50 });
          let html = await aiCallBuild(prompt);
          sse({ type: 'progress', service: serviceName, percent: 80 });
          { const bm = html.match(/<body[^>]*>([\s\S]*)<\/body>/i); console.log(`[Build] Body length: ${(bm?.[1]?.trim()||'').length} | Success: true`); }

          // Append integration guide as HTML comment before </body>
          const integGuide = buildIntegrationGuide(settings);
          html = html.includes('</body>') ? html.replace('</body>', `${integGuide}\n</body>`) : html + integGuide;

          const sitesDir = path.join(__dirname, 'public', 'sites', companySlug);
          fs.mkdirSync(sitesDir, { recursive: true });
          const filename = `${typeSlug}.html`;
          fs.writeFileSync(path.join(sitesDir, filename), html, 'utf8');
          const url = `${BASE_URL}/sites/${companySlug}/${filename}`;
          // Generate sitemap.xml and robots.txt
          try {
            const today3 = new Date().toISOString().split('T')[0];
            const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>${url}</loc>\n    <lastmod>${today3}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>1.0</priority>\n  </url>\n</urlset>`;
            const robotsTxt = `User-agent: *\nAllow: /\nSitemap: ${BASE_URL}/sites/${companySlug}/sitemap.xml`;
            fs.writeFileSync(path.join(sitesDir, 'sitemap.xml'), sitemapXml, 'utf8');
            fs.writeFileSync(path.join(sitesDir, 'robots.txt'), robotsTxt, 'utf8');
          } catch(e3) { console.log('[Sitemap] Error:', e3.message); }
          // Generate 404.html for website builds
          if (filename.includes('website') || typeSlug === 'website') {
            try {
              const primaryColor5 = (html.match(/--primary[^:]*:\s*([#\w()]+)/)?.[1] || '#6366f1').trim();
              const compName5 = lead?.companyName || companySlug;
              const nfHtml = `<!DOCTYPE html><html lang="nl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Pagina niet gevonden — ${compName5}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#f9fafb;color:#111;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:24px}.card{background:#fff;border-radius:16px;padding:48px 40px;max-width:440px;box-shadow:0 4px 24px rgba(0,0,0,.1)}h1{font-size:4rem;font-weight:800;color:${primaryColor5};line-height:1}h2{font-size:1.5rem;font-weight:700;margin:12px 0 8px}p{color:#666;font-size:15px;margin-bottom:28px}a{display:inline-block;background:${primaryColor5};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px}a:hover{opacity:.9}</style></head><body><div class="card"><h1>404</h1><h2>Pagina niet gevonden</h2><p>De pagina die u zoekt bestaat niet of is verplaatst.</p><a href="website.html">&#8592; Terug naar ${compName5}</a></div></body></html>`;
              fs.writeFileSync(path.join(sitesDir, '404.html'), nfHtml, 'utf8');
            } catch(e5) { console.log('[404] Error:', e5.message); }
          }

          const todoText = await aiCall(`Schrijf max 5 concrete stappen voor de klant om "${serviceName}" te activeren op hun website. Live URL: ${url}. Embed code: <iframe src="${url}" width="100%" height="600" frameborder="0"></iframe>. Stap-voor-stap, in het Nederlands.`).catch(() => '');

          const id = Date.now().toString(36) + i;
          deliverable = { id, service: serviceName, type: 'code', status: 'wacht_op_goedkeuring', html, url, todoText, builtAt: new Date().toISOString() };
          sse({ type: 'done', service: serviceName, index: i, total: services.length, deliverableType: 'code', url, deliverableId: id });

        } else if (STRAT_KEYWORDS.test(serviceName)) {
          // ── Strategy / report document ────────────────────────────────────
          console.log(`[Build] Type: STRATEGY_DOCUMENT | Service: ${serviceName}`);
          sse({ type: 'progress', service: serviceName, percent: 30 });
          const content = await aiCall(`Schrijf een professioneel "${serviceName}" rapport voor ${lead.companyName} (${lead.niche || ''}, ${lead.location || ''}).

${brandContext}

Structuur:
1. Managementsamenvatting (3-5 bevindingen)
2. Huidige situatie analyse
3. Verbeterpunten (genummerd, concreet)
4. Stappenplan per kwartaal
5. KPI's en succesmetrics
6. Aanbevolen volgende stap

Schrijf in de toon en taal van het merk (zie boven). Maximaal 600 woorden. Concreet en specifiek voor niche/locatie.`);
          sse({ type: 'progress', service: serviceName, percent: 80 });

          const id = Date.now().toString(36) + i;
          deliverable = { id, service: serviceName, type: 'strategy', status: 'wacht_op_goedkeuring', content, builtAt: new Date().toISOString() };
          sse({ type: 'done', service: serviceName, index: i, total: services.length, deliverableType: 'strategy', deliverableId: id });

        } else {
          // ── Text document (content, copy, scripts) ────────────────────────
          console.log(`[Build] Type: TEXT_DOCUMENT | Service: ${serviceName}`);
          sse({ type: 'progress', service: serviceName, percent: 30 });
          const content = await aiCall(`Lever de dienst "${serviceName}" voor ${lead.companyName} (${lead.niche || ''}, ${lead.location || ''}).

${brandContext}

Schrijf complete, direct bruikbare inhoud:
- Gebruik de exacte toon en taal van het merk (zie boven — formeel/informeel)
- Specifiek voor hun niche, locatie en de problemen die we oplossen
- Klaar om te gebruiken (geen placeholders zoals [naam] of [bedrijf])
- Schrijf ALS de copywriter van dit bedrijf, niet als externe partij
- Minimum 300 woorden aan bruikbare content

Dienst: ${svc.description || serviceName}`);
          sse({ type: 'progress', service: serviceName, percent: 80 });

          const id = Date.now().toString(36) + i;
          deliverable = { id, service: serviceName, type: 'document', status: 'wacht_op_goedkeuring', content, builtAt: new Date().toISOString() };
          sse({ type: 'done', service: serviceName, index: i, total: services.length, deliverableType: 'document', deliverableId: id });
        }

        deliverables.push(deliverable);
      } catch (err) {
        const id = Date.now().toString(36) + i;
        deliverables.push({ id, service: serviceName, type: 'unknown', status: 'error', error: err.message, builtAt: new Date().toISOString() });
        sse({ type: 'error', service: serviceName, index: i, total: services.length, message: err.message });
      }
    }

    // ── Combine HTML deliverables into one website (website + chatbot + booking) ──
    const websiteDel = deliverables.find(d =>
      d.type === 'code' && d.status !== 'error' &&
      /website|site/.test((d.service || '').toLowerCase())
    );
    const chatbotDel = deliverables.find(d =>
      d.type === 'code' && d.status !== 'error' &&
      /chatbot|chat/.test((d.service || '').toLowerCase())
    );
    const bookingDel = deliverables.find(d =>
      d.type === 'code' && d.status !== 'error' &&
      /boek|booking/.test((d.service || '').toLowerCase())
    );

    if (websiteDel && (chatbotDel || bookingDel)) {
      sse({ type: 'combine_start', message: 'Componenten samenvoegen tot één website...' });
      try {
        let combinedHtml = websiteDel.html;

        // Inject chatbot as floating widget
        if (chatbotDel) {
          const widgetCode = await aiCall(`From this chatbot HTML page, extract ONLY the floating chat widget code.
Return ONLY the <style>, <div>, and <script> elements for the floating chat button and panel.
Do NOT include <!DOCTYPE>, <html>, <head>, <body>, or full-page wrapper tags.
The snippet must work when pasted before </body> in another HTML page.
Return raw HTML/CSS/JS only — no markdown, no explanation.

CHATBOT HTML:
${chatbotDel.html.substring(0, 8000)}`).catch(() => '');

          if (widgetCode && widgetCode.trim().length > 50) {
            combinedHtml = combinedHtml.includes('<!-- CHATBOT_INJECT -->')
              ? combinedHtml.replace('<!-- CHATBOT_INJECT -->', widgetCode)
              : combinedHtml.replace('</body>', `\n${widgetCode}\n</body>`);
            chatbotDel.embeddedIn = websiteDel.id;
            chatbotDel.embedded = true;
            console.log('[Build] Chatbot widget injected into website');
          }
        }

        // Inject booking as a section
        if (bookingDel) {
          const bookingSection = await aiCall(`From this booking system HTML page, extract ONLY the booking form section content.
Return a self-contained <section id="boeken"> element containing: service selection, calendar, time slots, and contact form.
Include all <style> blocks needed for this section.
Do NOT include the full page header, nav, footer, or page wrapper.
Do NOT include <!DOCTYPE>, <html>, <head>, <body> tags.
Return raw HTML only — no markdown, no explanation.

BOOKING HTML:
${bookingDel.html.substring(0, 8000)}`).catch(() => '');

          if (bookingSection && bookingSection.trim().length > 100) {
            const cleanSection = /^\s*<section/i.test(bookingSection.trim())
              ? bookingSection.trim()
              : `<section id="boeken" style="padding:60px 20px;background:#f9fafb">\n${bookingSection.trim()}\n</section>`;

            combinedHtml = combinedHtml.includes('<!-- BOOKING_INJECT -->')
              ? combinedHtml.replace('<!-- BOOKING_INJECT -->', cleanSection)
              : combinedHtml.includes('id="boeken"')
                ? combinedHtml.replace(/(<[^>]+id="boeken"[^>]*>)([\s\S]*?)(<\/section>)/i, cleanSection)
                : combinedHtml.replace('</body>', `\n${cleanSection}\n</body>`);

            // Ensure nav link exists
            if (!combinedHtml.includes('href="#boeken"')) {
              combinedHtml = combinedHtml
                .replace(/(<a[^>]*>\s*Contact\s*<\/a>)/i, '<a href="#boeken">Boeken</a> $1')
                .replace(/(<li[^>]*>\s*<a[^>]*>\s*Contact\s*<\/a>\s*<\/li>)/i, '<li><a href="#boeken">Boeken</a></li>$1');
            }
            bookingDel.embeddedIn = websiteDel.id;
            bookingDel.embedded = true;
            console.log('[Build] Booking section injected into website');
          }
        }

        // Overwrite the website file with the combined version
        const sitesDir = path.join(__dirname, 'public', 'sites', companySlug);
        const websiteFilename = (websiteDel.url || '').split('/').pop() || 'website.html';
        fs.writeFileSync(path.join(sitesDir, websiteFilename), combinedHtml, 'utf8');

        websiteDel.html = combinedHtml;
        websiteDel.primary = true;
        websiteDel.combinedServices = [websiteDel.service, chatbotDel?.service, bookingDel?.service].filter(Boolean);

        const combinedList = websiteDel.combinedServices.join(' + ');
        sse({ type: 'combine_done', url: websiteDel.url, combinedServices: websiteDel.combinedServices, message: `${combinedList} gecombineerd tot één website` });
        console.log(`[Build] Combined website saved: ${websiteDel.url}`);
      } catch (combineErr) {
        console.error('[Build] Combine error:', combineErr.message);
        sse({ type: 'combine_error', message: combineErr.message });
        // Non-fatal — individual deliverables still saved as-is
      }
    }

    // If combination succeeded, drop embedded sub-deliverables — client only sees the combined one
    const toSave = deliverables.filter(d => !d.embedded);

    // Merge with any existing deliverables (keep approved ones)
    const existing = (leads[li].agentDeliverables || []).filter(d => d.status === 'approved');
    leads[li].agentDeliverables = [...existing, ...toSave];
    leads[li].agentsRanAt = new Date().toISOString();
    writeJSON('leads.json', leads);
    addLeadHistory(leads, req.params.id, { event: 'buildAllServices', label: `Agents bouwden ${toSave.length} leveringen automatisch` });
    addActivity('agent_build', `${lead.companyName}: ${toSave.length} leveringen gebouwd`);

    sse({ type: 'all_done', count: toSave.length, deliverables: toSave });
    broadcastWS('build_complete', { leadId: req.params.id, count: toSave.length });
    if (toSave.length > 0) trackFunnelEvent(req.params.id, 'first_build', { count: toSave.length });
    // Mark build job complete
    try { if (_buildJobId) { const { getDb } = require('./database'); getDb().prepare("UPDATE job_queue SET status='completed', completed_at=? WHERE id=?").run(new Date().toISOString(), _buildJobId); } } catch {}
  } catch (err) {
    try { if (_buildJobId) { const { getDb } = require('./database'); getDb().prepare("UPDATE job_queue SET status='failed', error=? WHERE id=?").run(err.message, _buildJobId); } } catch {}
    sse({ type: 'error', service: '', message: err.message });
  }
  res.end();
});

// Generate delivery email preview for manual deliverables
app.post('/api/leads/:id/deliverables/:dIdx/preview-email', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const dIdx = parseInt(req.params.dIdx);
  const d = (leads[li].agentDeliverables || [])[dIdx];
  if (!d) return res.status(404).json({ error: 'Levering niet gevonden' });

  const lead = leads[li];
  const agencyName = settings.agencyName || 'Agency AI';
  const myName = settings.myName || 'Het team';
  const myTitle = settings.myTitle || '';

  try {
    const emailBody = await aiCall(`Schrijf een professionele leveringsemail voor een klant.
Dienst: ${d.service}
Klant: ${lead.companyName} (${lead.location || ''})
Wat gedaan (instructies samenvatting): ${(d.content || d.instructions || (d.url ? `Live URL: ${d.url}` : '') || d.todoText || '').substring(0, 600)}
Agency: ${agencyName} — ${myName}${myTitle ? `, ${myTitle}` : ''}

De email moet bevatten:
1. Begroeting met bedrijfsnaam
2. "Uw [dienst] is nu live / klaar!"
3. Korte samenvatting van wat gedaan is (2-3 zinnen)
4. Hoe de klant het gebruikt / waar te vinden (praktisch)
5. Wat de volgende stap is
6. Afsluiting met contactinfo

Schrijf in het Nederlands, professioneel maar warm. Max 250 woorden. Geef ALLEEN de emailtekst, geen onderwerp.`);

    const subject = `Uw ${d.service} is klaar! — ${agencyName}`;
    res.json({ subject, body: emailBody.trim() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/leads/:id/deliverables/:dIdx/approve', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const dIdx = parseInt(req.params.dIdx);
  const d = (leads[li].agentDeliverables || [])[dIdx];
  if (!d) return res.status(404).json({ error: 'Levering niet gevonden' });

  leads[li].agentDeliverables[dIdx].status = 'approved';
  leads[li].agentDeliverables[dIdx].approvedAt = new Date().toISOString();
  leads[li].agentDeliverables[dIdx].clientVisible = false; // admin must manually toggle eye to share

  // Email client — rich HTML for HTML deliverables, custom body for manual, generic fallback
  const lead = leads[li];
  if (isResendReady(settings) && lead.contactEmail) {
    const agencyName = settings.agencyName || 'Agency AI';
    const subject = req.body?.emailSubject || `Uw ${d.service} staat klaar — hier is alles wat u moet weten`;
    if (d.url && !req.body?.emailBody) {
      // HTML deliverable: send rich delivery email
      const portalLink = lead.portalToken ? `${BASE_URL}/portal/${lead.portalToken}` : null;
      const html = buildDeliveryEmailHTML({ lead, d, settings, portalLink });
      await sendEmail({ to: lead.contactEmail, subject, html, settings }).catch(e => console.warn('[Approve] Email fout:', e.message));
    } else {
      // Manual deliverable or custom override
      const body = req.body?.emailBody || `Beste ${lead.companyName},\n\nGoed nieuws! Uw ${d.service} is klaar.\n\nLog in op uw klantportaal voor alle details.\n\nMet vriendelijke groet,\n${settings.myName || 'Het team'} — ${agencyName}`;
      await sendEmail({ to: lead.contactEmail, subject: req.body?.emailSubject || subject, body, settings }).catch(e => console.warn('[Approve] Email fout:', e.message));
    }
  }

  addLeadHistory(leads, req.params.id, { event: 'deliverableApproved', label: `Levering goedgekeurd: ${d.service}` });
  addNotification('run_complete', `Levering goedgekeurd: ${d.service}`, `${lead.companyName} — ${d.service}`, lead.id, `project:${lead.id}`);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

app.post('/api/leads/:id/deliverables/:dIdx/unapprove', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const dIdx = parseInt(req.params.dIdx);
  const d = (leads[li].agentDeliverables || [])[dIdx];
  if (!d) return res.status(404).json({ error: 'Levering niet gevonden' });

  leads[li].agentDeliverables[dIdx].status = 'adjusting';
  leads[li].agentDeliverables[dIdx].clientVisible = false;
  delete leads[li].agentDeliverables[dIdx].approvedAt;

  addLeadHistory(leads, req.params.id, { event: 'deliverableUnapproved', label: `Levering teruggezet voor aanpassing: ${d.service}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Toggle deliverable clientVisible
app.patch('/api/leads/:id/deliverables/:dIdx/visibility', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const dIdx = parseInt(req.params.dIdx);
  if (!leads[li].agentDeliverables?.[dIdx]) return res.status(404).json({ error: 'Levering niet gevonden' });
  leads[li].agentDeliverables[dIdx].clientVisible = !!req.body.clientVisible;
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Delete deliverable
app.delete('/api/leads/:id/deliverables/:dIdx', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const dIdx = parseInt(req.params.dIdx);
  if (!leads[li].agentDeliverables?.[dIdx]) return res.status(404).json({ error: 'Levering niet gevonden' });
  const removed = leads[li].agentDeliverables.splice(dIdx, 1)[0];
  addLeadHistory(leads, req.params.id, { event: 'deliverableDeleted', label: `Levering verwijderd: ${removed.service || 'onbekend'}` });
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Manual combine deliverables
app.post('/api/leads/:id/deliverables/combine', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });

  const { baseIdx, injectIdxs } = req.body;
  if (typeof baseIdx !== 'number' || !Array.isArray(injectIdxs) || injectIdxs.length === 0) {
    return res.status(400).json({ error: 'baseIdx (number) en injectIdxs (array) zijn vereist' });
  }

  const deliverables = leads[li].agentDeliverables || [];
  const baseDel = deliverables[baseIdx];
  if (!baseDel || baseDel.type !== 'code' || !baseDel.html) {
    return res.status(400).json({ error: 'Basis deliverable moet een HTML build zijn' });
  }

  try {
    let combinedHtml = baseDel.html;
    const injectedServices = [baseDel.service];

    for (const idx of injectIdxs) {
      const injectDel = deliverables[idx];
      if (!injectDel) continue;
      const svcLower = (injectDel.service || '').toLowerCase();
      const isHtmlDel = injectDel.type === 'code' && !!injectDel.html;

      if (isHtmlDel && /chatbot|chat/.test(svcLower)) {
        const widgetCode = await aiCall(`From this chatbot HTML page, extract ONLY the floating chat widget code.
Return ONLY the <style>, <div>, and <script> elements for the floating chat button and panel.
Do NOT include <!DOCTYPE>, <html>, <head>, <body>, or full-page wrapper tags.
The snippet must work when pasted before </body> in another HTML page.
Return raw HTML/CSS/JS only — no markdown, no explanation.

CHATBOT HTML:
${injectDel.html.substring(0, 8000)}`).catch(() => '');

        if (widgetCode && widgetCode.trim().length > 50) {
          combinedHtml = combinedHtml.includes('<!-- CHATBOT_INJECT -->')
            ? combinedHtml.replace('<!-- CHATBOT_INJECT -->', widgetCode)
            : combinedHtml.replace('</body>', `\n${widgetCode}\n</body>`);
          injectDel.embedded = true;
          injectDel.embeddedIn = baseDel.id;
          injectedServices.push(injectDel.service);
          console.log('[Combine] Chatbot widget injected');
        }
      } else if (isHtmlDel && /boek|booking|reserv|agenda/.test(svcLower)) {
        const bookingSection = await aiCall(`From this booking system HTML page, extract ONLY the booking form section content.
Return a self-contained <section id="boeken"> element containing: service selection, calendar, time slots, and contact form.
Include all <style> blocks needed for this section.
Do NOT include the full page header, nav, footer, or page wrapper.
Do NOT include <!DOCTYPE>, <html>, <head>, <body> tags.
Return raw HTML only — no markdown, no explanation.

BOOKING HTML:
${injectDel.html.substring(0, 8000)}`).catch(() => '');

        if (bookingSection && bookingSection.trim().length > 100) {
          const cleanSection = /^\s*<section/i.test(bookingSection.trim())
            ? bookingSection.trim()
            : `<section id="boeken" style="padding:60px 20px;background:#f9fafb">\n${bookingSection.trim()}\n</section>`;

          combinedHtml = combinedHtml.includes('<!-- BOOKING_INJECT -->')
            ? combinedHtml.replace('<!-- BOOKING_INJECT -->', cleanSection)
            : combinedHtml.includes('id="boeken"')
              ? combinedHtml.replace(/(<[^>]+id="boeken"[^>]*>)([\s\S]*?)(<\/section>)/i, cleanSection)
              : combinedHtml.replace('</body>', `\n${cleanSection}\n</body>`);

          if (!combinedHtml.includes('href="#boeken"')) {
            combinedHtml = combinedHtml
              .replace(/(<a[^>]*>\s*Contact\s*<\/a>)/i, '<a href="#boeken">Boeken</a> $1')
              .replace(/(<li[^>]*>\s*<a[^>]*>\s*Contact\s*<\/a>\s*<\/li>)/i, '<li><a href="#boeken">Boeken</a></li>$1');
          }
          injectDel.embedded = true;
          injectDel.embeddedIn = baseDel.id;
          injectedServices.push(injectDel.service);
          console.log('[Combine] Booking section injected');
        }
      } else if (isHtmlDel) {
        // Other HTML: extract main content as a section
        const genericSection = await aiCall(`From this HTML page, extract the main content as a self-contained <section> element.
Return a single <section> with all needed inline <style> and <script>.
Do NOT include <!DOCTYPE>, <html>, <head>, <body> tags.
Return raw HTML only — no markdown, no explanation.

HTML:
${injectDel.html.substring(0, 8000)}`).catch(() => '');

        if (genericSection && genericSection.trim().length > 50) {
          combinedHtml = combinedHtml.replace('</body>', `\n${genericSection.trim()}\n</body>`);
          injectDel.embedded = true;
          injectDel.embeddedIn = baseDel.id;
          injectedServices.push(injectDel.service);
          console.log('[Combine] HTML section injected:', injectDel.service);
        }
      } else {
        // Non-HTML deliverable (document/strategy/text): convert content to styled HTML section
        const rawContent = injectDel.content || injectDel.instructions || '';
        if (!rawContent.trim()) { console.log('[Combine] Skipping empty non-HTML deliverable:', injectDel.service); continue; }

        const docSection = await aiCall(`Convert this text document into a styled HTML <section> to embed in a website.
Make it visually appealing with proper headings, readable typography, and clean layout.
Use inline <style> within the section only — no external dependencies.
Do NOT include <!DOCTYPE>, <html>, <head>, <body> tags.
Return raw HTML <section> only — no markdown, no explanation.

DOCUMENT: ${injectDel.service}
CONTENT:
${rawContent.substring(0, 6000)}`).catch(() => '');

        if (docSection && docSection.trim().length > 100) {
          const cleanDoc = /^\s*<section/i.test(docSection.trim())
            ? docSection.trim()
            : `<section style="padding:60px 20px;background:#f9fafb">\n${docSection.trim()}\n</section>`;
          combinedHtml = combinedHtml.replace('</body>', `\n${cleanDoc}\n</body>`);
          injectDel.embedded = true;
          injectDel.embeddedIn = baseDel.id;
          injectedServices.push(injectDel.service);
          console.log('[Combine] Document section injected:', injectDel.service);
        }
      }
    }

    // Save combined HTML to disk
    const companySlug = (leads[li].companyName || 'bedrijf')
      .toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 20);
    const sitesDir = path.join(__dirname, 'public', 'sites', companySlug);
    if (!fs.existsSync(sitesDir)) fs.mkdirSync(sitesDir, { recursive: true });
    const websiteFilename = (baseDel.url || '').split('/').pop() || 'website.html';
    fs.writeFileSync(path.join(sitesDir, websiteFilename), combinedHtml, 'utf8');

    baseDel.html = combinedHtml;
    baseDel.primary = true;
    baseDel.combinedServices = injectedServices;

    addLeadHistory(leads, req.params.id, { event: 'deliverablesManualCombined', label: `Deliverables handmatig gecombineerd: ${injectedServices.join(' + ')}` });
    writeJSON('leads.json', leads);

    res.json({ ok: true, deliverables: leads[li].agentDeliverables, combinedServices: injectedServices });
  } catch (err) {
    console.error('[Combine] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Reset portal token
app.post('/api/leads/:id/portal/reset-token', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const li = leads.findIndex(l => l.id === req.params.id);
  if (li === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const newToken = Math.random().toString(36).substr(2, 8) + Math.random().toString(36).substr(2, 4);
  leads[li].portalToken = newToken;
  addLeadHistory(leads, req.params.id, { event: 'portalTokenReset', label: 'Portaalcode gereset door admin' });
  writeJSON('leads.json', leads);
  res.json({ ok: true, portalToken: newToken });
});

// ── Inbox ────────────────────────────────────────────────────────────────────

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
    const replyLead = (readJSON('leads.json') || []).find(l => l.id === item.leadId);
    const origSubj = item.subject || (replyLead ? (replyLead.email?.subject || replyLead.emailA?.subject || (Array.isArray(replyLead.subjectOptions) ? replyLead.subjectOptions[0] : null) || replyLead.emailSubject) : null) || item.companyName;
    const subject = origSubj.startsWith('Re:') ? origSubj : `Re: ${origSubj}`;
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

  if (isResendReady(settings)) {
    try {
      const trackingToken = 'otk-' + item.leadId + '-' + Math.random().toString(36).substr(2, 8);
      inbox[idx].trackingToken = trackingToken;
      // Accept manually entered email from frontend (for leads without verified email)
      const manualEmail    = req.body?.manualEmail?.trim() || null;
      if (manualEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manualEmail)) {
        inbox[idx].status = 'approved';
        writeJSON('inbox.json', inbox);
        return res.status(400).json({ error: `Ongeldig emailadres: "${manualEmail}"` });
      }
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
        trackingToken,
        isColdOutreach: true,
        noCalendly: false
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
    inbox[idx].status = 'approved'; // approved, Resend not configured
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
      if (inbox[idx].status === 'sent') { leads[leadIdx].sentVersion = version; trackFunnelEvent(item.leadId || leads[leadIdx].id, 'lead_emailed'); }
      if (inbox[idx].trackingToken) leads[leadIdx].trackingToken = inbox[idx].trackingToken;
      if (item.type === 'followup1' && inbox[idx].status === 'sent') leads[leadIdx].followup1SentAt = inbox[idx].sentAt;
      if (item.type === 'followup2' && inbox[idx].status === 'sent') leads[leadIdx].followup2SentAt = inbox[idx].sentAt;
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
      updateMemoryVersion(leads[leadIdx].niche, leads[leadIdx].country, version, 'sent');
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
    updateMemoryConversion(leads[leadIdx].niche, leads[leadIdx].country, 'lost', leads[leadIdx].estimatedFollowers, leads[leadIdx].website?.speedScore);
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

app.get('/api/run/progress', (req, res) => {
  res.json(_runState);
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
  safe.autoArchiveEnabled = s.autoArchiveEnabled !== undefined ? s.autoArchiveEnabled : true;
  safe.autoArchiveDays    = s.autoArchiveDays    || 30;
  safe.bankTransferConfigured = !!(s.bankTransferIban);
  safe.bankTransferIban = s.bankTransferIban || '';
  safe.bankTransferName = s.bankTransferName || '';
  safe.bankTransferBic  = s.bankTransferBic  || '';
  safe.paymentTermDays  = s.paymentTermDays  || 14;
  safe.preferredPaymentMethod = s.preferredPaymentMethod || 'bank_transfer';
  safe.fixedCosts = s.fixedCosts && s.fixedCosts.length
    ? s.fixedCosts
    : (s.monthlyHostingCost ? [{ name: 'Hosting', amount: s.monthlyHostingCost }] : [{ name: 'Railway hosting', amount: 5 }, { name: 'Claude API', amount: 15 }, { name: 'Domein', amount: 2 }, { name: 'Google Workspace', amount: 6 }]);
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

app.patch('/api/settings/account', requireAdmin, async (req, res) => {
  const settings = readJSON('settings.json');
  const { agencyName, myName, myTitle, username, newPassword, currentPassword, websiteTagline, websiteAbout, websiteContact, calendlyUrl, agencyLogo } = req.body;

  if (agencyName) settings.agencyName = agencyName;
  if (myName) settings.myName = myName;
  if (myTitle) settings.myTitle = myTitle;
  if (username) settings.username = username;
  if (websiteTagline !== undefined) settings.websiteTagline = websiteTagline;
  if (websiteAbout   !== undefined) settings.websiteAbout   = websiteAbout;
  if (websiteContact !== undefined) settings.websiteContact = websiteContact;
  if (calendlyUrl    !== undefined) settings.calendlyUrl    = calendlyUrl;
  if (agencyLogo     !== undefined) {
    // Validate: must be empty string or a data URL (image/*)
    if (agencyLogo === '' || /^data:image\/(png|jpeg|jpg|gif|svg\+xml|webp);base64,/.test(agencyLogo)) {
      settings.agencyLogo = agencyLogo;
    }
  }
  const { gaId } = req.body;
  if (gaId !== undefined) settings.gaId = gaId;
  if (req.body.onboardingCompleted !== undefined) settings.onboardingCompleted = !!req.body.onboardingCompleted;

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
  if (!Array.isArray(req.body.services)) return res.status(400).json({ error: 'Services moet een array zijn' });
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
  if (req.body.aiAutoReply          !== undefined) settings.aiAutoReply          = req.body.aiAutoReply;
  if (req.body.aiAutoReplySend      !== undefined) settings.aiAutoReplySend      = req.body.aiAutoReplySend;
  if (req.body.monthlyHostingCost   !== undefined) settings.monthlyHostingCost   = parseFloat(req.body.monthlyHostingCost) || 0;
  if (req.body.fixedCosts !== undefined && Array.isArray(req.body.fixedCosts)) settings.fixedCosts = req.body.fixedCosts;
  if (req.body.instagramTargeting   !== undefined) settings.instagramTargeting   = req.body.instagramTargeting;
  if (req.body.googleMapsTargeting  !== undefined) settings.googleMapsTargeting  = req.body.googleMapsTargeting;
  if (req.body.weeklyUpdatesEnabled !== undefined) settings.weeklyUpdatesEnabled = req.body.weeklyUpdatesEnabled;
  if (req.body.targetNiches    !== undefined) settings.targetNiches    = req.body.targetNiches;
  if (req.body.targetSubNiches !== undefined) settings.targetSubNiches = req.body.targetSubNiches;
  if (req.body.autoArchiveEnabled !== undefined) settings.autoArchiveEnabled = req.body.autoArchiveEnabled;
  if (req.body.autoArchiveDays    !== undefined) settings.autoArchiveDays    = parseInt(req.body.autoArchiveDays) || 30;
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
  const testRecipient = s.adminEmail || s.gmailAddress || 'info@agencyai.info';

  console.log('[TestEmail] Sending to:', testRecipient);
  console.log('[TestMail] Key set:', !!resendKey, '| From:', fromAddress, '| To:', testRecipient);

  if (!resendKey) {
    console.log('[TestMail] No RESEND_API_KEY — aborting');
    return res.status(400).json({ success: false, error: 'Resend API sleutel niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen → Email.' });
  }

  try {
    const { default: fetch } = await import('node-fetch');

    // Check domain verification status in Resend
    try {
      const domainRes = await fetch('https://api.resend.com/domains', {
        headers: { 'Authorization': `Bearer ${resendKey}` }
      });
      const domainData = await domainRes.json();
      console.log('[TestMail] Resend domain verification status:', JSON.stringify(domainData?.data?.map(d => ({ name: d.name, status: d.status, spf: d.records?.find(r=>r.type==='SPF')?.status, dkim: d.records?.find(r=>r.type?.includes('DKIM'))?.status }))));
    } catch (domErr) {
      console.warn('[TestMail] Could not fetch domain status:', domErr.message);
    }

    console.log('[TestMail] Sending via Resend...');
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `"${s.agencyName || 'Agency AI'}" <${fromAddress}>`,
        to: testRecipient,
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
    console.log('[TestEmail] Resend response:', JSON.stringify(d));
    console.log('[TestMail] Success, id:', d.id, '→', testRecipient);
    return res.json({ success: true, ok: true, message: `Testmail verstuurd naar ${testRecipient}` });
  } catch (err) {
    console.error('[TestMail] Exception:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings/test-imap', requireAdmin, async (req, res) => {
  console.log('[TestIMAP] Starting...');
  const s    = readJSON('settings.json') || {};
  const user = s.gmailAddress || process.env.GMAIL_USER || process.env.GMAIL_ADDRESS;
  const pass = getGmailPassword(s);

  if (!user) return res.status(400).json({ success: false, error: 'Email adres niet ingesteld' });
  if (!pass) return res.status(400).json({ success: false, error: 'Email wachtwoord niet ingesteld' });

  let imapSimple;
  try { imapSimple = require('imap-simple'); }
  catch { return res.status(500).json({ success: false, error: 'imap-simple module niet beschikbaar' }); }

  let connection;
  try {
    connection = await imapSimple.connect({
      imap: { user, password: pass, host: 'imap.soverin.net', port: 993, tls: true,
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
  const { stripeSecretKey, mollieApiKey, paypalMe, preferredPaymentMethod, bankTransferIban, bankTransferName, bankTransferBic, paymentTermDays } = req.body;
  if (stripeSecretKey !== undefined) settings.stripeSecretKey = stripeSecretKey;
  if (mollieApiKey !== undefined) settings.mollieApiKey = mollieApiKey;
  if (paypalMe !== undefined) settings.paypalMe = paypalMe;
  if (preferredPaymentMethod !== undefined) settings.preferredPaymentMethod = preferredPaymentMethod;
  if (bankTransferIban !== undefined) settings.bankTransferIban = bankTransferIban;
  if (bankTransferName !== undefined) settings.bankTransferName = bankTransferName;
  if (bankTransferBic  !== undefined) settings.bankTransferBic  = bankTransferBic;
  if (paymentTermDays  !== undefined) settings.paymentTermDays  = parseInt(paymentTermDays) || 14;
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

app.post('/api/stripe/invoice', requireAdmin, async (req, res) => {
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
      unit_amount: Math.round(parseFloat(amount) * 100),
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
      amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) },
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
    const priceData = { product: product.id, unit_amount: Math.round(parseFloat(amount) * 100), currency: 'eur' };
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
      body: JSON.stringify({ description: description || `AI-diensten — ${companyName}`, amount: { currency: 'EUR', value: parseFloat(amount).toFixed(2) }, redirectUrl: settings.websiteContact || 'https://agencyai.nl' })
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
  if (method === 'bank_transfer') {
    // No URL — bank details stored separately on the payment record
    return null;
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

app.get('/api/payments/overview', authMiddleware, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const rows = [];
  leads.forEach(lead => {
    (lead.payments || []).forEach(pay => {
      rows.push({
        id: pay.id,
        leadId: lead.id,
        invoiceNr: pay.invoiceNr || pay.id,
        companyName: lead.companyName || '',
        service: pay.description || (lead.services?.[0]?.name || lead.services?.[0] || ''),
        amount: pay.amount || 0,
        createdAt: pay.createdAt || pay.dueDate,
        dueDate: pay.dueDate,
        status: pay.status || 'pending',
        paidAt: pay.paidAt || null,
      });
    });
  });
  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(rows);
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

  const bankDetails = effectiveMethod === 'bank_transfer' ? {
    iban: settings.bankTransferIban || '',
    name: settings.bankTransferName || settings.agencyName || '',
    bic:  settings.bankTransferBic  || ''
  } : null;

  try {
    if (type === 'split' && splitParts > 1) {
      const partAmount = Math.round(amount / splitParts);
      for (let i = 1; i <= splitParts; i++) {
        const partDesc = `${description || 'AI-diensten'} — deel ${i}/${splitParts}`;
        const url = await createPaymentLink(effectiveMethod, { companyName: leads[idx].companyName, amount: partAmount, description: partDesc, billing: 'eenmalig', settings });
        const dueDays = (i - 1) * 14; // every 2 weeks
        const rec = {
          id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
          type: 'split', amount: partAmount, description: partDesc, billing: 'eenmalig',
          method: effectiveMethod, paymentUrl: url, status: 'sent',
          dueDate: dueDate ? new Date(new Date(dueDate).getTime() + dueDays * 86400000).toISOString() : new Date(Date.now() + dueDays * 86400000).toISOString(),
          splitIndex: i, splitTotal: splitParts, createdAt: new Date().toISOString()
        };
        if (bankDetails) rec.bankDetails = bankDetails;
        newPayments.push(rec);
      }
    } else {
      const url = await createPaymentLink(effectiveMethod, { companyName: leads[idx].companyName, amount, description, billing: billing || 'maandelijks', settings });
      const rec = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
        type: type || (billing === 'eenmalig' ? 'once' : 'subscription'),
        amount, description: description || 'AI-diensten', billing: billing || 'maandelijks',
        method: effectiveMethod, paymentUrl: url, status: 'sent',
        dueDate: dueDate || new Date(Date.now() + 7 * 86400000).toISOString(),
        createdAt: new Date().toISOString()
      };
      if (bankDetails) rec.bankDetails = bankDetails;
      newPayments.push(rec);
    }

    if (!leads[idx].payments) leads[idx].payments = [];
    leads[idx].payments.push(...newPayments);
    addLeadHistory(leads, leads[idx].id, { event: 'paymentCreated', label: `${newPayments.length > 1 ? `Gesplitste betaling (${splitParts} delen)` : type || 'Betaallink'}: €${amount}` });
    trackFunnelEvent(leads[idx].id, 'invoice_sent', { amount });
    writeJSON('leads.json', leads);

    // Auto-send professional invoice email with PDF to client
    const lead = leads[idx];
    const payEmailTo = (lead.contactEmail || '').trim();
    console.log('[Invoice] Sending to:', payEmailTo || '(no email)');
    if (payEmailTo && isResendReady(settings)) {
      try {
        const { nr: invoiceNr, nextNum: _invNum } = generateInvoiceNumber(settings);
        settings.lastInvoiceNumber = _invNum;
        writeJSON('settings.json', settings);
        const invoiceDate = new Date().toISOString();
        const termDays   = settings.paymentTermDays || 14;
        const dueDateISO = new Date(Date.now() + termDays * 86400000).toISOString();

        // Build services list from lead.projectServices or lead.services
        const svcsRaw = lead.projectServices && lead.projectServices.length
          ? lead.projectServices : (lead.services || []);
        const svcsForInvoice = svcsRaw.length
          ? svcsRaw.map(s => typeof s === 'string' ? { name: s, price: amount / svcsRaw.length, billing: 'eenmalig' } : s)
          : [{ name: description || 'AI-diensten', price: amount, billing: billing || 'eenmalig' }];

        const invoiceHtml = buildInvoiceEmailHTML({ invoiceNr, invoiceDate, dueDate: dueDateISO, lead, services: svcsForInvoice, amount, settings });

        // Add payment link(s) block after table if online payment
        let payLinkHtml = '';
        if (effectiveMethod !== 'bank_transfer') {
          const links = newPayments.filter(p => p.paymentUrl).map((p, i) =>
            `<a href="${p.paymentUrl}" style="display:inline-block;margin:4px 0;padding:12px 28px;background:#1a56db;color:#fff;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">${newPayments.length > 1 ? `Betaal deel ${i+1}/${newPayments.length} — €${p.amount}` : `Factuur betalen — €${amount}`}</a>`
          ).join('<br>');
          payLinkHtml = links
            ? `<div style="padding:20px 32px;text-align:center;background:#f5f8ff;border-top:1px solid #e8eef8">${links}</div>`
            : '';
        }
        const finalHtml = payLinkHtml
          ? invoiceHtml.replace('</body></html>', `${payLinkHtml}</body></html>`)
          : invoiceHtml;

        // Generate PDF (non-fatal — send email without attachment if PDF fails)
        let pdfBuffer = null;
        try {
          pdfBuffer = await generateInvoicePDF({ invoiceNr, invoiceDate, dueDate: dueDateISO, lead, services: svcsForInvoice, amount, settings });
        } catch (pdfErr) {
          console.error('[Invoice PDF error]', pdfErr.message);
        }
        const safeCompany = (lead.companyName || 'klant').replace(/[^a-zA-Z0-9]/g, '-');

        await sendEmail({
          to: payEmailTo,
          subject: `Factuur ${invoiceNr} — ${settings.agencyName || 'Agency AI'}`,
          body: `Beste ${lead.contactName || lead.companyName},\n\nBijgevoegd vindt u uw factuur ${invoiceNr}.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.agencyName || 'Agency AI'}`,
          html: finalHtml,
          settings,
          noCalendly: true,
          attachments: pdfBuffer ? [{ filename: `Factuur-${invoiceNr}-${safeCompany}.pdf`, content: pdfBuffer.toString('base64') }] : []
        });
        console.log('[Invoice] Email sent OK');
      } catch (emailErr) { console.error('[Invoice email]', emailErr.message); }
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
  const prevPayStatus = leads[idx].payments[pIdx].status;
  leads[idx].payments[pIdx] = { ...leads[idx].payments[pIdx], ...req.body };
  if (req.body.status === 'paid' && !leads[idx].payments[pIdx].paidAt) leads[idx].payments[pIdx].paidAt = new Date().toISOString();
  if (req.body.status === 'paid' && prevPayStatus !== 'paid') {
    trackFunnelEvent(leads[idx].id, 'payment_received');
    const pay = leads[idx].payments[pIdx];
    addNotification('payment_received', `Betaling ontvangen: ${leads[idx].companyName}`,
      `€${(pay.amount || 0).toLocaleString('nl-NL')}${pay.description ? ' — ' + pay.description : ''}`,
      leads[idx].id, `project:${leads[idx].id}`);
  }
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
  const remindTo = (lead.contactEmail || '').trim();
  if (!remindTo) return res.status(400).json({ error: 'Geen e-mailadres bekend' });
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet geconfigureerd' });

  try {
    const termDays = settings.paymentTermDays || 14;
    const payLinkLine = pay.paymentUrl ? `Betaallink: ${pay.paymentUrl}\nBetalingstermijn: ${termDays} dagen` : (pay.bankDetails ? `Betaling via overboeking:\nIBAN: ${pay.bankDetails.iban}\nTenaamstelling: ${pay.bankDetails.name || settings.bankTransferName || settings.agencyName || ''}\nBetalingstermijn: ${termDays} dagen` : '');
    const reminderEmail = await aiJSON(`Schrijf een vriendelijke maar dringende betalingsherinnering.
Klant: ${lead.companyName}. Bureau: ${settings.agencyName}, ${settings.myName}.
Bedrag: €${pay.amount}. Omschrijving: ${pay.description}. ${payLinkLine}
Tone: professioneel maar begripvol. Max 150 woorden.
Antwoord ALLEEN als JSON: { "subject": "...", "body": "..." }`);

    await sendEmail({ to: remindTo, subject: reminderEmail.subject, body: reminderEmail.body, settings });
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

  const myName     = settings.myName     || '';
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
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });
  const { subject, body } = req.body;
  if (!subject || !body) return res.status(400).json({ error: 'Subject en body vereist' });
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.leadId);
  if (!lead || !lead.contactEmail) return res.status(400).json({ error: 'Klant heeft geen emailadres' });
  try {
    await sendEmail({ to: lead.contactEmail, subject, body, settings });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/settings/stats', requireAdmin, (req, res) => {
  writeJSON('stats.json', { leadsFound: 0, emailsSent: 0, replies: 0, pipelineValue: 0, weeklyData: [] });
  res.json({ ok: true });
});

// Debug endpoint — tests all 3 aiCallBuild types end-to-end (admin only)
app.get('/api/test-build', requireAdmin, async (req, res) => {
  const BASE_RULES = `You are an expert HTML developer.

CRITICAL RULES:
- Return ONLY raw HTML
- Start response with: <!DOCTYPE html>
- End response with: </html>
- NEVER use markdown or backticks
- The <body> MUST contain all visible content
- Minimum 500 words of visible content in <body>
- All CSS in <style> tag in <head>
- All JS in <script> tag before </body>
- No external dependencies except Google Fonts

`;

  const tests = [
    {
      type: 'HTML_BUILD',
      prompt: BASE_RULES + 'Build a complete booking page for Test Company in Amsterdam. Include: header, service cards, Mon–Fri calendar (past days disabled), time slot picker (09:00–17:00), contact form (naam/email/tel), submit with loading state, success screen. Style: white bg, indigo #6366f1 accent, mobile responsive. Minimum 600 words of visible body content.'
    },
    {
      type: 'TEXT_DOCUMENT',
      prompt: BASE_RULES + 'Build a complete HTML content calendar document for Restaurant De Gouden Leeuw in Rotterdam. Include: monthly overview table with 20 post ideas, each with date/platform/topic/caption/hashtags, posting schedule per weekday, tips section. Style: white bg, clean typography, printable layout. Minimum 600 words of visible body content.'
    },
    {
      type: 'STRATEGY_DOCUMENT',
      prompt: BASE_RULES + 'Build a complete HTML SEO rapport for Kapsalon Haar & Zo in Utrecht. Include: executive summary, keyword analysis table (15+ keywords with volume/difficulty), competitor overview, 12-week action plan with milestones, KPI dashboard section, recommendations list. Style: white bg, professional report layout, data tables. Minimum 600 words of visible body content.'
    }
  ];

  const results = [];

  for (const test of tests) {
    console.log(`[Build] Type: ${test.type}`);
    try {
      const html = await aiCallBuild(test.prompt);
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyContent = bodyMatch?.[1]?.trim() || '';
      console.log(`[Build] Body length: ${bodyContent.length}`);
      console.log(`[Build] Success: true`);
      results.push({
        type: test.type,
        success: true,
        htmlLength: html.length,
        bodyLength: bodyContent.length,
        firstBodyChars: bodyContent.substring(0, 200)
      });
    } catch (err) {
      console.log(`[Build] Body length: 0`);
      console.log(`[Build] Success: false — ${err.message}`);
      results.push({ type: test.type, success: false, error: err.message, htmlLength: 0, bodyLength: 0, firstBodyChars: '' });
    }
  }

  const allPassed = results.every(r => r.success);
  res.json({
    success: allPassed,
    results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    },
    // Backwards-compat fields from first result (HTML_BUILD)
    htmlLength: results[0]?.htmlLength ?? 0,
    bodyLength: results[0]?.bodyLength ?? 0,
    firstBodyChars: results[0]?.firstBodyChars ?? ''
  });
});

// Test a single service end-to-end with custom inputs (admin only)
app.post('/api/test-service', requireAdmin, async (req, res) => {
  const { serviceName, companyName = 'Test Bedrijf BV', location = 'Amsterdam', niche = 'bedrijf', wishes = '' } = req.body;
  if (!serviceName) return res.status(400).json({ error: 'serviceName vereist' });

  console.log('[TestService] Starting test for:', serviceName, `(${companyName}, ${location}, ${niche})`);

  const HTML_KW   = /website|boek|boeking|booking|chatbot|dashboard|landingspagina|landing.*page|faq.*assistent|kennisbank|offerte.*generator|onboarding/i;
  const STRAT_KW  = /seo.*rapport|concurrentie|audit|crm|lead.*scoring|branding|heatmap|trend|keyword.*research/i;
  const FORCE_TXT = /\bteksten\b/i;

  const intakeCtx = `\n\nKLANT INFORMATIE:\nBedrijf: ${companyName}\nLocatie: ${location}\nNiche: ${niche}\nWensen: ${wishes || 'Professionele online aanwezigheid'}`;

  let type = 'TEXT_DOCUMENT';
  try {
    if (HTML_KW.test(serviceName) && !FORCE_TXT.test(serviceName)) {
      type = 'HTML_BUILD';
      const isBooking = /boek|booking|afspraak|reserv|agenda|integreren.*systeem|systeem.*integrer/i.test(serviceName);
      const isChatbot = /chatbot|faq.*assistent|kennisbank/i.test(serviceName);
      let prompt;
      if (isBooking) {
        prompt = `${BUILD_HTML_RULES}Build a complete HTML booking page for ${companyName} in ${location}.${intakeCtx}

MUST include in <body>: sticky header with company name, 3 service cards (with real service names/prices if in intake), Mon-Fri calendar (past days disabled), time slot picker 09:00-17:00, contact form (naam/email/telefoon), submit with loading state, success screen. Full viewport hero. Mobile responsive.`;
      } else if (isChatbot) {
        prompt = `${BUILD_HTML_RULES}Build a complete HTML chatbot/FAQ assistant page for ${companyName} (${niche}).${intakeCtx}

MUST include in <body>: floating chat widget with open/close toggle, 15+ pre-programmed Q&A pairs relevant to ${niche}, message bubbles, typing indicator, lead capture form when user asks to contact. Fallback message: "Ik kan u helaas niet verder helpen met deze vraag. Neem contact op via onze website of bel ons voor directe hulp." Full viewport hero section behind the chat widget. Mobile responsive.`;
      } else {
        prompt = `${BUILD_HTML_RULES}Build a complete HTML ${serviceName} page for ${companyName} (${niche}) in ${location}.${intakeCtx}

MUST include in <body>: sticky navigation, full-viewport hero with headline + stats row + CTA buttons, 3+ richly styled content sections directly relevant to "${serviceName}", contact section with form, branded footer. Min 500 words of real content. Mobile responsive.`;
      }
      const html = await aiCallBuild(prompt);
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const bodyLength = (bodyMatch?.[1]?.trim() || '').length;
      const htmlLength = html.length;
      const success = bodyLength >= 200;
      console.log('[TestService] Done:', serviceName, success ? '✓' : '✗', `— body: ${bodyLength} tekens`);
      return res.json({ success, type, html, htmlLength, bodyLength, testedAt: new Date().toISOString(), ...(!success ? { error: `HTML body te kort: ${bodyLength} tekens` } : {}) });

    } else if (STRAT_KW.test(serviceName)) {
      type = 'STRATEGY_DOCUMENT';
      const content = await aiCall(`Schrijf een professioneel "${serviceName}" document voor ${companyName} (${niche}, ${location}).${intakeCtx}\n\nStructuur:\n1. Managementsamenvatting\n2. Huidige situatie\n3. Verbeterpunten (min 5)\n4. Stappenplan Q1-Q4\n5. KPI's\n6. Volgende stap\n\nMin 400 woorden Nederlands.`);
      const contentLength = content.length;
      const success = contentLength >= 200;
      console.log('[TestService] Done:', serviceName, success ? '✓' : '✗', `— ${contentLength} tekens`);
      return res.json({ success, type, content, contentLength, testedAt: new Date().toISOString(), ...(!success ? { error: `Content te kort: ${contentLength} tekens` } : {}) });

    } else {
      type = 'TEXT_DOCUMENT';
      const content = await aiCall(`Lever de dienst "${serviceName}" volledig op voor ${companyName} (${niche}, ${location}).${intakeCtx}\n\nSchrijf direct bruikbare Nederlandse inhoud, minimaal 300 woorden, geen placeholders.`);
      const contentLength = content.length;
      const success = contentLength >= 200;
      console.log('[TestService] Done:', serviceName, success ? '✓' : '✗', `— ${contentLength} tekens`);
      return res.json({ success, type, content, contentLength, testedAt: new Date().toISOString(), ...(!success ? { error: `Content te kort: ${contentLength} tekens` } : {}) });
    }
  } catch (err) {
    console.log('[TestService] Done:', serviceName, '✗', `— ${err.message}`);
    return res.status(500).json({ success: false, type, error: err.message, testedAt: new Date().toISOString() });
  }
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
  const tokIn  = usage.input_tokens  || 0;
  const tokOut = usage.output_tokens || 0;
  _sessionTokensIn  += tokIn;
  _sessionTokensOut += tokOut;
  _aiCallLog.push({ ts: Date.now() });
  // Log every call so costs are tracked outside of run batches too
  const callCost = calcCostUsd(tokIn, tokOut);
  const promptLabel = prompt.slice(0, 60).replace(/\n/g, ' ');
  addActivity('ai_call', `Claude: ${promptLabel}…`, { tokensIn: tokIn, tokensOut: tokOut, costUsd: callCost });
  // Update running stats.json totals
  const statsNow = readJSON('stats.json') || {};
  statsNow.totalApiTokensIn  = (statsNow.totalApiTokensIn  || 0) + tokIn;
  statsNow.totalApiTokensOut = (statsNow.totalApiTokensOut || 0) + tokOut;
  statsNow.totalApiCostUsd   = Math.round(((statsNow.totalApiCostUsd || 0) + callCost) * 10000) / 10000;
  writeJSON('stats.json', statsNow);
  // Join ALL text blocks — Claude may split long responses across multiple content blocks
  return data.content.filter(b => b.type === 'text').map(b => b.text).join('');
}

// Variant with 8000 max_tokens for HTML generation (pages get cut off at 4000)
// Joins ALL content blocks — Claude sometimes splits a long response into multiple text blocks.
async function aiCallBuild(prompt) {
  console.log('[Build] Starting build...');
  console.log('[Build] Prompt length:', prompt.length);
  console.log('[Build] Prompt start:', prompt.substring(0, 200));

  aiRateCheck();
  const s = readJSON('settings.json') || {};
  const apiKey = getClaudeApiKey(s);
  console.log('[Build] API key exists:', !!apiKey);
  if (!apiKey) throw new Error('Claude API sleutel niet ingesteld.');

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
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();

  console.log('[Build] Response received');
  console.log('[Build] HTTP status:', res.status);
  console.log('[Build] Stop reason:', data.stop_reason);
  console.log('[Build] Content blocks:', data.content?.length);
  console.log('[Build] Usage:', JSON.stringify(data.usage));

  if (!data.content) {
    console.error('[Build] No content in response. Error:', JSON.stringify(data.error));
    throw new Error(data.error?.message || 'Claude API fout');
  }

  data.content.forEach((block, i) => {
    console.log(`[Build] Block ${i}: type=${block.type} length=${block.text?.length || 0}`);
    if (block.text) console.log(`[Build] Block ${i} start:`, block.text.substring(0, 200));
  });

  const usage = data.usage || {};
  const tokIn  = usage.input_tokens  || 0;
  const tokOut = usage.output_tokens || 0;
  _sessionTokensIn  += tokIn;
  _sessionTokensOut += tokOut;
  _aiCallLog.push({ ts: Date.now() });
  const callCost = calcCostUsd(tokIn, tokOut);
  addActivity('ai_call', `Claude build: ${prompt.slice(0, 50).replace(/\n/g,' ')}…`, { tokensIn: tokIn, tokensOut: tokOut, costUsd: callCost });
  const statsNow = readJSON('stats.json') || {};
  statsNow.totalApiTokensIn  = (statsNow.totalApiTokensIn  || 0) + tokIn;
  statsNow.totalApiTokensOut = (statsNow.totalApiTokensOut || 0) + tokOut;
  statsNow.totalApiCostUsd   = Math.round(((statsNow.totalApiCostUsd || 0) + callCost) * 10000) / 10000;
  writeJSON('stats.json', statsNow);

  // Join ALL text blocks — critical: a single [0].text drops content when Claude splits the response
  let fullText = data.content.filter(b => b.type === 'text').map(b => b.text).join('');
  console.log('[Build] Total HTML length:', fullText.length);
  console.log('[Build] HTML start:', fullText.substring(0, 300));

  // Strip markdown code fences
  let clean = fullText
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  console.log('[Build] After strip length:', clean.length);
  console.log('[Build] Starts with DOCTYPE:', clean.startsWith('<!DOCTYPE') || clean.startsWith('<html') || clean.startsWith('<HTML'));

  // Extract valid HTML block if prefixed with explanation text
  if (!clean.startsWith('<!DOCTYPE') && !clean.startsWith('<html') && !clean.startsWith('<HTML')) {
    const match = clean.match(/<!DOCTYPE[\s\S]*<\/html>/i);
    if (match) {
      clean = match[0];
      console.log('[Build] Extracted HTML from text, length:', clean.length);
    } else {
      console.error('[Build] No valid HTML found. Raw (500):', clean.substring(0, 500));
      throw new Error('Geen geldige HTML in response');
    }
  }

  // If Claude hit max_tokens, HTML is cut off — close it gracefully
  const stopReason = data.stop_reason;
  if (stopReason === 'max_tokens') {
    console.warn('[Build] max_tokens hit — attempting to close truncated HTML');
    if (clean.includes('<body') && !clean.includes('</body>')) {
      clean = clean + '\n</body>\n</html>';
      console.log('[Build] Closed truncated HTML');
    }
  }

  // Robust body extraction — works even if </body> is missing
  let bodyContent = '';
  const bodyOpenMatch = clean.match(/<body[^>]*>/i);
  if (bodyOpenMatch) {
    const bodyStart = clean.indexOf(bodyOpenMatch[0]) + bodyOpenMatch[0].length;
    bodyContent = clean.substring(bodyStart).replace(/<\/body>[\s\S]*$/i, '').trim();
  }
  console.log('[Build] Body length:', bodyContent.length);
  console.log('[Build] Body start:', bodyContent.substring(0, 200) || 'EMPTY');

  if (!bodyContent || bodyContent.length < 100) {
    console.error('[Build] Empty/thin body detected!');
    console.error('[Build] Full HTML length was:', clean.length);
    console.error('[Build] stop_reason was:', stopReason);
    throw new Error(
      `Lege body na build. HTML length: ${clean.length}, Body length: ${bodyContent.length}, stop_reason: ${stopReason}`
    );
  }

  return clean;
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

function extractJSON(text) {
  // 1. Strip code fences then try direct parse
  try {
    const clean = text
      .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(clean);
  } catch {}

  // 2. Find JSON array anywhere in the text
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }

  // 3. Find single JSON object and wrap in array
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return [JSON.parse(objMatch[0])]; } catch {}
  }

  console.error('[JSON] Could not parse response:', text.substring(0, 300));
  throw new Error('JSON parse mislukt');
}

async function aiWebSearchJSON(prompt) {
  const text = await aiWebSearch(prompt);
  return extractJSON(text);
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
    const hasChatbot  = /tawk\.to|crisp\.chat|intercom|drift\.com|tidio|hubspot.*chat|chatbot|livechat|freshchat|zendesk.*chat|zoho.*salesiq|messenger.*chat/i.test(html);
    const speedScore  = ms < 1500 ? 9 : ms < 3000 ? 7 : ms < 5000 ? 5 : 3;

    const problems = [];
    if (ms > 3000) problems.push(`Trage laadtijd: ${(ms/1000).toFixed(1)}s (ideaal <2s)`);
    if (!hasViewport) problems.push('Geen mobile-optimalisatie gevonden');
    if (!hasHttps) problems.push('Geen HTTPS — onveilige verbinding');
    if (!hasBooking && !hasShop) problems.push('Geen duidelijk boekings- of bestelsysteem');
    if (!hasChatbot) problems.push('Geen chatbot of live chat op de website');
    if (!hasCTA) problems.push('Geen duidelijke call-to-action op de pagina');

    console.log(`[Agent2] ${url} — status: ${res.status}, ${ms}ms, speedScore: ${speedScore}`);

    return { reachable: true, loadTimeMs: ms, speedScore, hasHttps, hasMobileOptimization: hasViewport, hasBookingSystem: hasBooking, hasChatbot, hasShop, hasCTA, problems };
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

async function processOneLead(lead, settings, options = {}) {
  if (isBlacklisted(lead)) {
    console.log(`  ✗ Geblokkeerd (blacklist): ${lead.companyName}`);
    return null;
  }

  const dup = isDuplicate(lead);
  if (dup) {
    console.log(`  ✗ Duplicaat overgeslagen: ${lead.companyName} (bestaat al als ${dup.status})`);
    return null;
  }
  const services  = settings.services || DEFAULT_SERVICES;
  const myName    = settings.myName    || '';
  const agencyName = settings.agencyName || 'Agency AI';

  const c = (lead.country || '').toLowerCase().replace(/[^a-z]/g, '');
  const language =
    ['nl','be','nederland','netherlands','thenetherlands','belgie','belgi','belgium'].includes(c) ? 'nl' :
    ['de','at','ch','germany','deutschland','austria','osterreich','schweiz','switzerland'].includes(c) ? 'de' :
    ['fr','lu','france','frankreich','luxembourg','luxemburg'].includes(c) ? 'fr' :
    ['it','italy','italia','italien'].includes(c) ? 'it' : 'en';
  lead.language = language;
  const companySize = lead.companySize || 'small';

  _runState.currentAgent = 'Agent 2 — Website checker';
  console.log(`  [Agent 2] Website checken: ${lead.websiteUrl}`);
  const website = await checkWebsite(lead.websiteUrl);
  console.log(`  [Agent 2] Bereikbaar: ${website.reachable}, laadtijd: ${website.loadTimeMs || '—'}ms`);

  // Skip immediately if website unreachable — don't waste agent credits on fake companies
  // Exception: manual runs (options.manualRun) — user knowingly entered the company
  if (!website.reachable) {
    if (options.manualRun) {
      console.log(`  ⚠ Website onbereikbaar — ${lead.companyName} (handmatige run, doorgaan)`);
    } else {
      console.log(`  ✗ Website onbereikbaar — ${lead.companyName} overgeslagen (${website.notes || 'geen verbinding'})`);
      addActivity('skip', `${lead.companyName} overgeslagen — website onbereikbaar`, { meta: { companyName: lead.companyName, websiteUrl: lead.websiteUrl || '' } });
      return null;
    }
  }

  // Email: provided by Agent 1 web search — validate format + MX here
  // For manual runs (options.manualRun) never block on missing/invalid email —
  // the lead goes to inbox without email so the user can add it manually.
  const rawEmail = (lead.email || '').toLowerCase().trim().replace(/^mailto:/i, '');
  const isValidEmailFormat = e => e && e.includes('@') && e.includes('.') && e.length <= 80 &&
    !/\.(png|jpg|gif|svg|css|js|woff|ico|pdf)$/i.test(e) &&
    !e.includes('@example') && !e.includes('@test.') && !e.includes('@sentry');
  const isNoReplyAddr = e => /noreply|no-reply|donotreply|do-not-reply/i.test(e);

  let contactEmail = null;
  let emailVerified = false;

  console.log(`  [Email debug] manualRun=${!!options.manualRun}, rawEmail="${rawEmail || 'leeg'}", validFormat=${isValidEmailFormat(rawEmail)}, noReply=${isNoReplyAddr(rawEmail)}`);

  if (!rawEmail || !isValidEmailFormat(rawEmail) || isNoReplyAddr(rawEmail)) {
    if (options.manualRun) {
      console.log(`  ⚠ [Manual] Geen geldig email voor ${lead.companyName} — doorgaan zonder email`);
      // contactEmail stays null — inbox will show "Geen email" so user can add manually
    } else {
      console.log(`  ✗ Email ongeldig van Agent 1: "${rawEmail || 'leeg'}" — ${lead.companyName} overgeslagen`);
      addActivity('skip', `${lead.companyName} overgeslagen — geen geldig email van Agent 1`, { meta: { companyName: lead.companyName, niche: lead.niche } });
      return null;
    }
  } else {
    // DNS MX check — only reject on empty array, allow on DNS errors or timeout
    const emailDomain = rawEmail.split('@')[1];
    console.log(`  [Agent 2] Email verifiëren: ${rawEmail}`);
    try {
      const mx = await Promise.race([
        dnsPromises.resolveMx(emailDomain),
        new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), 3000))
      ]);
      if (mx && mx.length > 0) {
        contactEmail  = rawEmail;
        emailVerified = true;
        console.log(`  [Agent 2] MX check: ${emailDomain} → valid ✓ — email: ${contactEmail}`);
      } else {
        if (options.manualRun) {
          console.log(`  ⚠ [Manual] MX check: ${emailDomain} → geen MX records — doorgaan zonder email`);
        } else {
          console.log(`  ✗ MX check: ${emailDomain} → no records — ${lead.companyName} overgeslagen`);
          addActivity('skip', `${lead.companyName} overgeslagen — email domein ontvangt geen mail`, { meta: { companyName: lead.companyName } });
          return null;
        }
      }
    } catch (mxErr) {
      // DNS error or timeout (Railway network issue) → allow the email
      contactEmail  = rawEmail;
      emailVerified = false;
      console.log(`  [Agent 2] MX check: ${emailDomain} → ${mxErr.message === 'DNS timeout' ? 'timeout (3s)' : 'DNS fout (' + (mxErr.code || mxErr.message) + ')'}, email toegestaan`);
    }
  }

  const emailSource = contactEmail ? 'verified' : null;

  _runState.currentAgent = 'Agent 3 — Social analyzer';
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

  _runState.currentAgent = 'Agent 4 — Scorer';
  console.log(`  [Agent 4] Kansen berekenen...`);

  // Only recommend services agents can build 100% automatically (HTML page or written document)
  const AUTO_BUILDABLE = new Set([
    // TIER 1 — always recommend first (core website + content builds)
    'professionele website bouwen', 'website bouwen', 'online boekingssysteem integreren',
    'ai chatbot voor website', 'ai landingspagina',
    'website teksten schrijven', 'seo teksten optimaliseren',
    // TIER 2 — recommend when relevant to the lead's needs
    'ai faq assistent', 'ai kennisbank systeem', 'ai onboarding systeem',
    'email autoresponder reeks', 'blog artikelen schrijven', 'over ons pagina schrijven',
    'faq pagina schrijven', 'privacy policy + algemene voorwaarden',
    'ai offerte generator', 'chatbot script voor website',
    'nieuwsbrief template ontwerpen', 'email nieuwsbrief reeks', 'product beschrijvingen',
    'google bedrijfsprofiel content',
    // TIER 3 — only when specifically relevant to the lead's niche
    'ai content voor social media', 'maandelijkse content kalender',
    'instagram reels scripts', 'ai tiktok content systeem', 'ai youtube scripts',
    // Other fully auto-buildable outputs
    'ai keyword research', 'concurrentieanalyse rapport', 'social media audit',
    'ai branding kit generatie', 'ai sales opvolging', 'email marketing automatisering',
    'ai video content creatie',
  ]);

  // Services that should NEVER be recommended — require manual setup, platform access, paid ad accounts, or ongoing human work
  const NEVER_RECOMMEND = new Set([
    'lokale seo optimalisatie', 'webshop opzetten', 'verlaten winkelwagen emails',
    'google ads beheer', 'facebook ads beheer', 'meta ads campagne',
    'retargeting campagne opzetten', 'google shopping campagnes',
    'reputatie management', 'whatsapp automatisering', 'ai telefonische assistent',
    'facebook pixel & conversies', 'google ads remarketing',
  ]);
  const buildableServices = services.filter(s => {
    const key = (s.name || '').toLowerCase().trim();
    return AUTO_BUILDABLE.has(key) && !NEVER_RECOMMEND.has(key);
  });
  // Fall back to all services minus the never-recommend ones if whitelist has no matches
  const recommendableServices = buildableServices.length > 0
    ? buildableServices
    : services.filter(s => !NEVER_RECOMMEND.has((s.name || '').toLowerCase().trim()));
  const servicesList = recommendableServices
    .map(s => `- ${s.name} (${s.billing}): €${s.price} — ${s.description}`).join('\n');

  let opportunity;
  try {
    opportunity = await aiJSON(`Analyseer dit bedrijf en geef een opportunity score. Geef JSON terug:

Bedrijf: ${lead.companyName} (${lead.niche})
Locatie: ${lead.location}
Instagram: ${lead.estimatedFollowers} volgers, engagement ${social.engagementRate}%
Website: ${website.reachable ? `bereikbaar in ${website.loadTimeMs}ms` : 'niet bereikbaar'}
Website problemen: ${[...(website.problems||[])].join(', ') || 'geen'}
Betaalde ads: ${social.runningAds ? 'ja' : 'nee'}

Beschikbare diensten (kies de 2-3 meest relevante voor dit specifieke bedrijf):
${servicesList}

PRIORITEIT: Focus primair op het aanbevelen van website builds, chatbots en geschreven content. Deze leveren direct tastbare waarde en kunnen volledig automatisch worden gebouwd.

REGELS voor dienstaanbeveling:
- Als het bedrijf geen website heeft of de website niet bereikbaar is: ALTIJD een website build als eerste dienst aanbevelen.
- Als er geen online boekingssysteem is bij een servicebedrijf (kapper, fysiotherapeut, restaurant, etc.): boekingssysteem aanbevelen.
- Als er geen chatbot op de website staat: AI chatbot voor website aanbevelen.
- Kies 1-2 diensten die een CONCREET, ZICHTBAAR resultaat opleveren dat de klant morgen al kan gebruiken.
- STRIKT VEREIST: Gebruik ALLEEN de exacte dienstnamen uit de bovenstaande lijst. Verzin geen andere diensten.
- NOOIT aanbevelen: advertentiebeheer (Google/Meta Ads), webshops opzetten, reputatie management, WhatsApp automatisering, of diensten die externe platformtoegang of handmatige instellingen vereisen.

Geef JSON:
{
  "score": getal 1-10,
  "problems": ["top probleem 1 met specifieke data", "probleem 2", "probleem 3"],
  "recommendedServices": [{"name": "exacte dienstnaam uit lijst", "price": getal, "billing": "maandelijks of eenmalig"}],
  "estimatedValue": totaal maandelijks equivalent in euros,
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

  // ITEM 8: Apply conversion-based ML score boost
  const convBoost = getConversionBoost(lead.niche, lead.country, lead.estimatedFollowers, website.speedScore);
  if (convBoost !== 0) {
    opportunity.score = Math.min(10, Math.max(1, (opportunity.score || 6.5) + convBoost));
    console.log(`  [ML] Conversie boost ${convBoost > 0 ? '+' : ''}${convBoost} voor ${lead.niche}/${lead.country}`);
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

  // Website gap bonuses — businesses with obvious digital needs score higher
  const wsBonus = [];
  if (!website.reachable) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 2.0);
    wsBonus.push('+2.0 geen/onbereikbare website');
  } else if (website.speedScore <= 3) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 1.5);
    wsBonus.push('+1.5 zeer trage website');
  }
  if (!website.hasBookingSystem) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 1.5);
    wsBonus.push('+1.5 geen boekingssysteem');
  }
  if (!website.hasChatbot) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 1.5);
    wsBonus.push('+1.5 geen chatbot');
  }
  if (!website.hasCTA) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 1.0);
    wsBonus.push('+1.0 geen duidelijke CTA');
  }
  if (!website.hasMobileOptimization) {
    opportunity.score = Math.min(10, (opportunity.score || 6.5) + 0.5);
    wsBonus.push('+0.5 niet mobiel responsive');
  }
  opportunity.score = Math.min(10, opportunity.score || 6.5);
  if (wsBonus.length > 0) console.log(`  [WebGap] ${wsBonus.join(', ')}`);

  _runState.currentAgent = 'Agent 7 — Concurrent analyzer';
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

  _runState.currentAgent = 'Agent 5 — Email schrijver';
  console.log(`  [Agent 5] Email schrijven A+B (${language})...`);
  const topProblem = opportunity.problems?.[0] || (language === 'nl' ? 'groei online aanwezigheid' : language === 'de' ? 'Online-Präsenz verbessern' : language === 'fr' ? 'améliorer la présence en ligne' : language === 'it' ? 'migliorare la presenza online' : 'growing online presence');
  const topService = opportunity.recommendedServices?.[0]?.name || services[0]?.name || 'AI-marketing';
  const loadSec = website.loadTimeMs ? (website.loadTimeMs / 1000).toFixed(1) : null;

  // Determine the most specific website gap for the email opening
  const wsGapNL = !website.reachable ? 'geen professionele website heeft'
    : !website.hasBookingSystem ? 'geen online boekingssysteem heeft'
    : !website.hasChatbot ? 'geen chatbot of live chat op de website heeft'
    : !website.hasMobileOptimization ? 'de website niet goed werkt op mobiel'
    : null;
  const wsGapEN = !website.reachable ? 'doesn\'t have a professional website'
    : !website.hasBookingSystem ? 'has no online booking system'
    : !website.hasChatbot ? 'has no chatbot on the website'
    : !website.hasMobileOptimization ? 'the website doesn\'t work well on mobile'
    : null;
  const wsGapDE = !website.reachable ? 'keine professionelle Website hat'
    : !website.hasBookingSystem ? 'kein Online-Buchungssystem hat'
    : !website.hasChatbot ? 'keinen Chatbot auf der Website hat'
    : !website.hasMobileOptimization ? 'die Website auf Mobilgeräten nicht gut funktioniert'
    : null;
  const wsGapFR = !website.reachable ? 'n\'a pas de site web professionnel'
    : !website.hasBookingSystem ? 'n\'a pas de système de réservation en ligne'
    : !website.hasChatbot ? 'n\'a pas de chatbot sur son site web'
    : !website.hasMobileOptimization ? 'le site web ne fonctionne pas bien sur mobile'
    : null;
  const wsGapIT = !website.reachable ? 'non ha un sito web professionale'
    : !website.hasBookingSystem ? 'non ha un sistema di prenotazione online'
    : !website.hasChatbot ? 'non ha un chatbot sul sito web'
    : !website.hasMobileOptimization ? 'il sito web non funziona bene su mobile'
    : null;

  const opener = language === 'nl'
    ? (wsGapNL ? `Uw website bekeken en gezien dat ${lead.companyName} ${wsGapNL}` : (social.emailOpener || `Zag ${lead.companyName} online en merkte ${topProblem.toLowerCase()}`))
    : language === 'de'
    ? (wsGapDE ? `Ihre Website besucht und festgestellt, dass ${lead.companyName} ${wsGapDE}` : `Ich bin auf ${lead.companyName} gestoßen und habe bemerkt: ${topProblem.toLowerCase()}`)
    : language === 'fr'
    ? (wsGapFR ? `En visitant votre site, j'ai constaté que ${lead.companyName} ${wsGapFR}` : `En découvrant ${lead.companyName}, j'ai remarqué que ${topProblem.toLowerCase()}`)
    : language === 'it'
    ? (wsGapIT ? `Ho visitato il vostro sito e notato che ${lead.companyName} ${wsGapIT}` : `Ho trovato ${lead.companyName} online e ho notato che ${topProblem.toLowerCase()}`)
    : (wsGapEN ? `Visited ${lead.companyName}'s website and noticed it ${wsGapEN}` : (social.emailOpenerEn || `Came across ${lead.companyName} online and noticed ${topProblem.toLowerCase()}`));

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
    : language === 'de'
    ? `Unternehmen: ${lead.companyName} (${nicheLabel}, ${lead.location})
Unternehmensgröße: ${companySize}
Instagram: ${lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + ' Follower' : 'unbekannt'}
LinkedIn: ${social.linkedinCompanyFollowers ? social.linkedinCompanyFollowers.toLocaleString() + ' Follower' : 'unbekannt'}
Ladezeit Website: ${loadSec ? loadSec + ' Sekunden' : 'unbekannt'}
Problem: ${topProblem}
Dienstleistung: ${topService}
Wettbewerb in ${lead.location}: ${competitors?.competitorGap || 'nicht verfügbar'}
Absender: ${myName} von ${agencyName}
Jahreszeit: ${seasonal.season}`
    : language === 'fr'
    ? `Entreprise: ${lead.companyName} (${nicheLabel}, ${lead.location})
Taille: ${companySize}
Instagram: ${lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + ' abonnés' : 'inconnu'}
LinkedIn: ${social.linkedinCompanyFollowers ? social.linkedinCompanyFollowers.toLocaleString() + ' abonnés' : 'inconnu'}
Temps de chargement: ${loadSec ? loadSec + ' secondes' : 'inconnu'}
Problème: ${topProblem}
Service: ${topService}
Concurrence à ${lead.location}: ${competitors?.competitorGap || 'non disponible'}
Expéditeur: ${myName} de ${agencyName}
Saison: ${seasonal.season}`
    : language === 'it'
    ? `Azienda: ${lead.companyName} (${nicheLabel}, ${lead.location})
Dimensione: ${companySize}
Instagram: ${lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + ' follower' : 'sconosciuto'}
LinkedIn: ${social.linkedinCompanyFollowers ? social.linkedinCompanyFollowers.toLocaleString() + ' follower' : 'sconosciuto'}
Tempo caricamento: ${loadSec ? loadSec + ' secondi' : 'sconosciuto'}
Problema: ${topProblem}
Servizio: ${topService}
Concorrenza a ${lead.location}: ${competitors?.competitorGap || 'non disponibile'}
Mittente: ${myName} di ${agencyName}
Stagione: ${seasonal.season}`
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
    ? (language === 'nl' ? `\nCalendly link: ${calendlyUrl} — sluit de CTA af met deze link als directe uitnodiging om in te plannen`
      : language === 'de' ? `\nCalendly-Link: ${calendlyUrl} — beenden Sie den CTA mit diesem Link als direkte Buchungseinladung`
      : language === 'fr' ? `\nLien Calendly: ${calendlyUrl} — terminez le CTA avec ce lien comme invitation directe à prendre rendez-vous`
      : language === 'it' ? `\nLink Calendly: ${calendlyUrl} — concludere il CTA con questo link come invito diretto alla prenotazione`
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
  const greetingDE = companySize === 'large'
    ? `Sehr geehrte Damen und Herren von ${lead.companyName},`
    : `Sehr geehrte/r ${lead.companyName},`;
  const greetingFR = `Bonjour ${lead.companyName},`;
  const greetingIT = `Gentile ${lead.companyName},`;

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
- CTA alinea 3: zachte uitnodiging — bijv. "Zou u openstaan voor een kort gesprek?" ${calendlyLink ? `Sluit vervolgens af met een nieuwe zin: "Plan direct een gratis gesprek van 20 minuten via: ${calendlyLink}"` : 'Sluit af met: "Beantwoord deze email voor meer informatie."'}
- Afsluiting: "Met vriendelijke groet," op een nieuwe regel, dan "${myName}"
- Max 150 woorden in de body (exclusief aanhef en afsluiting)
- Als er concurrentie context is: verweef maximaal 1 zin organisch
- VERBODEN WOORDEN: oplossing, traject, optimaliseren, implementeren, synergie, innovatief, vrijblijvend, passie, data-gedreven, op maat, uniek aanbod, fantastisch, geweldig, absoluut, transformeren, naar een hoger niveau, concurrentievoordeel, bewezen, resultaatgericht
- SEIZOEN: Het is nu ${seasonal.season}. Verweef optioneel 1 subtiele seizoensreferentie alleen als het écht past bij hun niche (bijv. ${seasonal.event}). Forceer dit NIET.`
    : language === 'de'
    ? `- Anrede: immer genau diese Anrede verwenden: "${greetingDE}"
- Ton: professionell und sachlich — wie ein erfahrener Berater, kein Bot, kein Marketingtext
- Siezen (formelles "Sie") immer verwenden
- Den ersten Satz NIE mit "Ich" beginnen
- Betreff: 4-6 Wörter, konkret, Firmenname oder Stadt erwähnen — KEIN "KI", "Marketing", "Zusammenarbeit"
- Fließende professionelle Absätze — KEINE Aufzählungszeichen, KEINE Listen
- 3 Absätze: (1) konkrete Beobachtung mit Datenpunkt, (2) Bedeutung + wie wir helfen, (3) sanfte Einladung zum Gespräch
- Absätze 1-2: je max. 2-3 Sätze. Absatz 3: max. 2 Sätze
- Dienstleistung: Ergebnis in 1 Satz beschreiben — nie werbend
- CTA Absatz 3: sanfte Einladung — z.B. "Wären Sie offen für ein kurzes Gespräch?" ${calendlyLink ? `Schließen Sie dann mit: "Buchen Sie direkt ein kostenloses 20-minütiges Gespräch: ${calendlyLink}"` : 'Abschlusssatz: "Antworten Sie auf diese E-Mail für mehr Informationen."'}
- Abschluss: "Mit freundlichen Grüßen," neue Zeile, dann "${myName}"
- Max. 150 Wörter im Haupttext (ohne Anrede und Abschluss)
- VERBOTENE WÖRTER: Lösung, Synergie, innovativ, Optimierung, Implementierung, datengetrieben, einzigartig, transformieren, Mehrwert, maßgeschneidert`
    : language === 'fr'
    ? `- Formule d'appel: toujours exactement: "${greetingFR}"
- Ton: professionnel et accessible — comme un consultant senior, pas un robot marketing
- Vouvoiement obligatoire ("vous")
- Ne jamais commencer la première phrase par "Je"
- Objet: 4-6 mots, concret, nom d'entreprise ou ville — PAS "IA", "marketing", "collaboration"
- Paragraphes professionnels fluides — SANS puces ni listes
- 3 paragraphes: (1) observation concrète avec donnée chiffrée, (2) ce que ça signifie + comment on aide, (3) invitation douce
- Paragraphes 1-2: max 2-3 phrases chacun. Paragraphe 3: max 2 phrases
- Service: décrire le résultat en 1 phrase — jamais promotionnel
- CTA paragraphe 3: invitation douce — ex. "Seriez-vous ouvert(e) à un bref échange?" ${calendlyLink ? `Puis conclure avec: "Réservez directement un rendez-vous de 20 minutes: ${calendlyLink}"` : 'Conclure avec: "Répondez à cet e-mail pour plus d\'informations."'}
- Formule de clôture: "Cordialement," nouvelle ligne, puis "${myName}"
- Max 150 mots dans le corps (hors formule d'appel et clôture)
- MOTS INTERDITS: solution, synergie, innovant, optimiser, implémenter, data-driven, unique, transformer, valeur ajoutée, sur-mesure`
    : language === 'it'
    ? `- Apertura: usare sempre esattamente: "${greetingIT}"
- Tono: professionale e diretto — come un consulente senior, non un bot di marketing
- Usare il "Lei" formale sempre
- Non iniziare mai la prima frase con "Io"
- Oggetto: 4-6 parole, specifico, nome azienda o città — NO "AI", "marketing", "collaborazione"
- Paragrafi professionali fluidi — NESSUN punto elenco, NESSUNA lista
- 3 paragrafi: (1) osservazione concreta con dato specifico, (2) significato + come aiutiamo, (3) invito gentile
- Paragrafi 1-2: max 2-3 frasi ciascuno. Paragrafo 3: max 2 frasi
- Servizio: descrivere il risultato in 1 frase — mai promozionale
- CTA paragrafo 3: invito gentile — es. "Sarebbe disponibile per una breve chiamata?" ${calendlyLink ? `Poi concludere con: "Prenoti direttamente una chiamata gratuita di 20 minuti: ${calendlyLink}"` : 'Concludere con: "Risponda a questa email per ulteriori informazioni."'}
- Chiusura: "Cordiali saluti," nuova riga, poi "${myName}"
- Max 150 parole nel corpo (esclusi apertura e chiusura)
- PAROLE VIETATE: soluzione, sinergia, innovativo, ottimizzare, implementare, data-driven, unico, trasformare, valore aggiunto, su misura`
    : `- Greeting: always use exactly this greeting: "${greetingEN}"
- FORBIDDEN greetings: Hey, Hi, Hello, What's up, Howdy — ONLY "Dear" is allowed
- Tone: professional but approachable — write like a senior consultant who genuinely noticed something specific about their business
- NEVER start the first sentence with "I"
- Subject: 4-6 words, specific, mention company or city — NO "AI", "marketing" or "collaboration" — use ONLY plain ASCII (a-z, 0-9, hyphen, comma, question mark)
- Write in flowing professional paragraphs — NO bullet points, NO lists, NO --- dividers
- 3 paragraphs: (1) specific observation with concrete data point, (2) what this means for them + how we help, (3) soft invitation to connect
- Paragraphs 1-2: max 2-3 sentences each. Paragraph 3: max 2 sentences
- Service: describe the outcome in 1 sentence — never promotional or superlative
- CTA paragraph 3: soft invitation — e.g. "Would you be open to a brief call?" ${calendlyLink ? `Then close with a new sentence: "Book a free 20-minute call directly at: ${calendlyLink}"` : 'Close with: "Reply to this email for more information."'}
- Sign-off: "Kind regards," on a new line, then "${myName}"
- Max 150 words in the body (excluding greeting and sign-off)
- If competitor context is provided: weave in max 1 sentence naturally
- BANNED WORDS: solution, trajectory, optimize, implement, synergy, leverage, innovative, data-driven, tailored, unique offering, fantastic, absolutely, transform, take to the next level, proven, competitive advantage, seamlessly, cutting-edge, game-changer
- SEASONAL: It is currently ${seasonal.season}. Optionally weave in 1 subtle seasonal reference only if it genuinely fits their niche (e.g. ${seasonal.event}). Do NOT force this.`;

  // No-ads restriction appended to sharedRules for all languages
  const noAdsLine = language === 'nl'
    ? '\n- NOOIT vermelden in de email: Meta advertenties, Facebook ads, Google Ads, betaalde advertenties, WhatsApp Business automatisering, CRM-systemen, heatmap analyse, A/B testing\n- FOCUS ALLEEN OP: website verbetering, online boekingssysteem, AI chatbot voor website, professionele content (blogs/social/emails), SEO teksten, landingspagina\'s, email reeksen'
    : language === 'de'
    ? '\n- NIE in der E-Mail erwähnen: Meta-Anzeigen, Facebook Ads, Google Ads, bezahlte Werbung, WhatsApp-Automatisierung, CRM-Systeme, Heatmap-Analyse, A/B-Tests\n- NUR fokussieren auf: Website-Verbesserung, Online-Buchungssystem, KI-Chatbot, professionelle Inhalte (Blogs/Social/E-Mails), SEO-Texte, Landingpages, E-Mail-Sequenzen'
    : language === 'fr'
    ? "\n- NE JAMAIS mentionner: publicités Meta, Facebook Ads, Google Ads, publicité payante, WhatsApp, CRM, heatmaps, A/B testing\n- SE CONCENTRER UNIQUEMENT SUR: amélioration du site web, réservation en ligne, chatbot IA, contenu (blogs/réseaux/emails), textes SEO, pages d'atterrissage, séquences email"
    : language === 'it'
    ? '\n- NON menzionare mai: Meta ads, Facebook Ads, Google Ads, pubblicità a pagamento, WhatsApp, CRM, heatmap, A/B testing\n- CONCENTRARSI SOLO SU: sito web, prenotazioni online, chatbot AI, contenuto (blog/social/email), SEO, landing page, sequenze email'
    : '\n- NEVER mention in the email: Meta ads, Facebook ads, Google Ads, paid advertising, WhatsApp automation, CRM systems, heatmap analysis, A/B testing\n- FOCUS ONLY ON: website improvement, online booking systems, AI chatbot, professional content (blogs/social/emails), SEO content, landing pages, email sequences';

  const promptA = language === 'nl'
    ? `Schrijf een koude email — VERSIE A: PROBLEEM-GERICHT. Klinkt als een echte persoon, NIET als AI. Geef JSON terug.\n\nCONTEXT:\n${sharedContext}\n\nOPENING ZIN (gebruik deze exact of pas licht aan):\n"${opener}"\n\nAANPAK VERSIE A: Begin met het probleem. Gebruik de opening zin hierboven. Noem het probleem concreet met een getal of vergelijking. Dan de dienst als logische oplossing.\n\nREGELS:\n${sharedRules}${noAdsLine}\n\n{"subject": "onderwerp", "body": "emailtekst"}`
    : language === 'de'
    ? `Schreibe eine Kalt-E-Mail — VERSION A: PROBLEM-ORIENTIERT. Klingt wie ein echter Mensch, NICHT wie KI. Schreibe auf DEUTSCH. JSON zurückgeben.\n\nKONTEXT:\n${sharedContext}\n\nERÖFFNUNGSSATZ (exakt verwenden oder leicht anpassen):\n"${opener}"\n\nANSATZ VERSION A: Mit dem Problem beginnen. Den Eröffnungssatz verwenden. Problem konkret mit Zahlen nennen. Dann Dienstleistung als logische Lösung.\n\nREGELN:\n${sharedRules}${noAdsLine}\n\n{"subject": "Betreff", "body": "E-Mail-Text"}`
    : language === 'fr'
    ? `Rédige un e-mail de prospection — VERSION A: CENTRÉ SUR LE PROBLÈME. Sonne comme une vraie personne, PAS comme une IA. Écrire en FRANÇAIS. Retourner JSON.\n\nCONTEXTE:\n${sharedContext}\n\nPHRASE D'OUVERTURE (utiliser exactement ou adapter légèrement):\n"${opener}"\n\nAPPROCHE VERSION A: Commencer par le problème. Utiliser la phrase d'ouverture. Mentionner le problème concrètement avec un chiffre. Puis le service comme solution logique.\n\nRÈGLES:\n${sharedRules}${noAdsLine}\n\n{"subject": "objet", "body": "corps de l'e-mail"}`
    : language === 'it'
    ? `Scrivi una cold email — VERSIONE A: FOCALIZZATA SUL PROBLEMA. Suona come una persona reale, NON come un'IA. Scrivere in ITALIANO. Restituire JSON.\n\nCONTESTO:\n${sharedContext}\n\nFRASE D'APERTURA (usare esattamente o adattare leggermente):\n"${opener}"\n\nAPPROCCIO VERSIONE A: Iniziare con il problema. Usare la frase d'apertura. Menzionare il problema concretamente con un numero. Poi il servizio come soluzione logica.\n\nREGOLE:\n${sharedRules}${noAdsLine}\n\n{"subject": "oggetto", "body": "corpo email"}`
    : `Write a cold email — VERSION A: PROBLEM-FOCUSED. Reads like a real person typed it, NOT like AI. Return JSON.\n\nCONTEXT:\n${sharedContext}\n\nOPENING LINE (use this exactly or adapt slightly):\n"${opener}"\n\nVERSION A APPROACH: Start with the problem. Use the opening line above. State the problem concretely with a number or comparison. Then offer the service as the logical next step.\n\nRULES:\n${sharedRules}${noAdsLine}\n\n{"subject": "subject line", "body": "email body"}`;

  const openerB = language === 'nl'
    ? `${lead.companyName} heeft echt potentieel in ${lead.location} — en ik denk dat ${topService.toLowerCase()} precies dat kan versnellen.`
    : language === 'de'
    ? `${lead.companyName} hat echtes Potenzial in ${lead.location} — und ${topService.toLowerCase()} könnte genau das beschleunigen.`
    : language === 'fr'
    ? `${lead.companyName} a un vrai potentiel à ${lead.location} — et ${topService.toLowerCase()} pourrait exactement accélérer cela.`
    : language === 'it'
    ? `${lead.companyName} ha un vero potenziale a ${lead.location} — e ${topService.toLowerCase()} potrebbe accelerare esattamente questo.`
    : `${lead.companyName} has real potential to grow in ${lead.location} — and I think ${topService.toLowerCase()} could accelerate that.`;

  const promptB = language === 'nl'
    ? `Schrijf een koude email — VERSIE B: GROEIKANSEN-GERICHT. Klinkt als een echte persoon, NIET als AI. Geef JSON terug.\n\nCONTEXT:\n${sharedContext}\n\nOPENING ZIN VERSIE B (gebruik deze exact of pas licht aan):\n"${openerB}"\n\nAANPAK VERSIE B: Begin positief — met groeipotentieel, niet met problemen. Focus op wat ze KUNNEN bereiken met ${topService}. Enthousiaster toon.\n\nREGELS:\n${sharedRules}${noAdsLine}\n\n{"subject": "onderwerp", "body": "emailtekst"}`
    : language === 'de'
    ? `Schreibe eine Kalt-E-Mail — VERSION B: WACHSTUMSORIENTIERT. Klingt wie ein echter Mensch, NICHT wie KI. Schreibe auf DEUTSCH. JSON zurückgeben.\n\nKONTEXT:\n${sharedContext}\n\nERÖFFNUNGSSATZ VERSION B (exakt verwenden oder leicht anpassen):\n"${openerB}"\n\nANSATZ VERSION B: Positiv beginnen — Wachstumspotenzial betonen, nicht Probleme. Auf das fokussieren, was mit ${topService} erreicht werden kann.\n\nREGELN:\n${sharedRules}${noAdsLine}\n\n{"subject": "Betreff", "body": "E-Mail-Text"}`
    : language === 'fr'
    ? `Rédige un e-mail de prospection — VERSION B: CENTRÉ SUR LA CROISSANCE. Sonne comme une vraie personne, PAS comme une IA. Écrire en FRANÇAIS. Retourner JSON.\n\nCONTEXTE:\n${sharedContext}\n\nPHRASE D'OUVERTURE VERSION B (utiliser exactement ou adapter légèrement):\n"${openerB}"\n\nAPPROCHE VERSION B: Commencer positivement — potentiel de croissance, pas les problèmes. Se concentrer sur ce qui peut être accompli avec ${topService}.\n\nRÈGLES:\n${sharedRules}${noAdsLine}\n\n{"subject": "objet", "body": "corps de l'e-mail"}`
    : language === 'it'
    ? `Scrivi una cold email — VERSIONE B: FOCALIZZATA SULLA CRESCITA. Suona come una persona reale, NON come un'IA. Scrivere in ITALIANO. Restituire JSON.\n\nCONTESTO:\n${sharedContext}\n\nFRASE D'APERTURA VERSIONE B (usare esattamente o adattare leggermente):\n"${openerB}"\n\nAPPROCCIO VERSIONE B: Iniziare positivamente — potenziale di crescita, non problemi. Concentrarsi su cosa si può raggiungere con ${topService}.\n\nREGOLE:\n${sharedRules}${noAdsLine}\n\n{"subject": "oggetto", "body": "corpo email"}`
    : `Write a cold email — VERSION B: GROWTH/OPPORTUNITY-FOCUSED. Reads like a real person typed it, NOT like AI. Return JSON.\n\nCONTEXT:\n${sharedContext}\n\nOPENING LINE VERSION B (use this exactly or adapt slightly):\n"${openerB}"\n\nVERSION B APPROACH: Start positively — with growth potential, not problems. Focus on what they CAN achieve with ${topService}. More enthusiastic tone.\n\nRULES:\n${sharedRules}${noAdsLine}\n\n{"subject": "subject line", "body": "email body"}`;

  // ITEM 18: use winning A/B version when auto-pick is set for this niche
  const autoVersion = getAutoPickVersion(lead.niche, lead.country);

  let emailA, emailB;
  try {
    if (autoVersion === 'A') {
      emailA = await aiJSON(promptA);
      emailB = emailA;
    } else if (autoVersion === 'B') {
      emailB = await aiJSON(promptB);
      emailA = emailB;
    } else {
      [emailA, emailB] = await Promise.all([aiJSON(promptA), aiJSON(promptB)]);
    }
  } catch {
    const fbGreeting = language === 'nl' ? greetingNL : language === 'de' ? greetingDE : language === 'fr' ? greetingFR : language === 'it' ? greetingIT : greetingEN;
    const fbSignoff  = language === 'nl' ? `Met vriendelijke groet,\n${myName}` : language === 'de' ? `Mit freundlichen Grüßen,\n${myName}` : language === 'fr' ? `Cordialement,\n${myName}` : language === 'it' ? `Cordiali saluti,\n${myName}` : `Kind regards,\n${myName}`;
    emailA = language === 'nl'
      ? { subject: `${lead.companyName} – iets opgevallen`, body: `${fbGreeting}\n\nBij het bekijken van ${lead.companyName} viel mij op dat er concrete ruimte is om meer uit ${topService.toLowerCase()} te halen.\n\nZou u openstaan voor een kort kennismakingsgesprek?\n\n${fbSignoff}` }
      : language === 'de'
      ? { subject: `${lead.companyName} – etwas aufgefallen`, body: `${fbGreeting}\n\nBei der Betrachtung von ${lead.companyName} ist mir aufgefallen, dass es konkreten Spielraum gibt, mehr aus ${topService.toLowerCase()} herauszuholen.\n\nWären Sie offen für ein kurzes Gespräch?\n\n${fbSignoff}` }
      : language === 'fr'
      ? { subject: `${lead.companyName} – quelque chose remarqué`, body: `${fbGreeting}\n\nEn regardant ${lead.companyName}, j'ai remarqué qu'il y a une opportunité concrète pour améliorer ${topService.toLowerCase()}.\n\nSeriez-vous ouvert(e) à un bref échange ?\n\n${fbSignoff}` }
      : language === 'it'
      ? { subject: `${lead.companyName} – qualcosa notato`, body: `${fbGreeting}\n\nGuardando ${lead.companyName}, ho notato che c'è un'opportunità concreta per migliorare ${topService.toLowerCase()}.\n\nSarebbe disponibile per una breve chiamata?\n\n${fbSignoff}` }
      : { subject: `${lead.companyName} – noticed something`, body: `${fbGreeting}\n\nLooking at ${lead.companyName}, I noticed there is a clear opportunity to strengthen your ${topService.toLowerCase()}.\n\nWould you be open to a brief introductory call?\n\n${fbSignoff}` };
    emailB = language === 'nl'
      ? { subject: `${lead.companyName} – concrete kans`, body: `${fbGreeting}\n\n${lead.companyName} heeft een solide basis. Naar mijn inschatting is er echter nog onbenut potentieel op het gebied van ${topService.toLowerCase()}.\n\nKan ik u laten zien wat dat in de praktijk betekent?\n\n${fbSignoff}` }
      : language === 'de'
      ? { subject: `${lead.companyName} – konkretes Potenzial`, body: `${fbGreeting}\n\n${lead.companyName} hat eine solide Grundlage. Es gibt jedoch noch ungenutztes Potenzial im Bereich ${topService.toLowerCase()}.\n\nDarf ich Ihnen zeigen, was das in der Praxis bedeutet?\n\n${fbSignoff}` }
      : language === 'fr'
      ? { subject: `${lead.companyName} – opportunité concrète`, body: `${fbGreeting}\n\n${lead.companyName} a une base solide. Il y a cependant un potentiel inexploité dans ${topService.toLowerCase()}.\n\nPuis-je vous montrer ce que cela signifie en pratique ?\n\n${fbSignoff}` }
      : language === 'it'
      ? { subject: `${lead.companyName} – opportunità concreta`, body: `${fbGreeting}\n\n${lead.companyName} ha una base solida. C'è tuttavia un potenziale non sfruttato in ${topService.toLowerCase()}.\n\nPosso mostrarle cosa significa in pratica?\n\n${fbSignoff}` }
      : { subject: `${lead.companyName} – concrete opportunity`, body: `${fbGreeting}\n\n${lead.companyName} has a strong foundation. Based on what I have seen, there is untapped potential in ${topService.toLowerCase()} worth exploring.\n\nWould you be open to a short conversation?\n\n${fbSignoff}` };
  }
  // Agent 5b: 3 subject line options — data-driven, specific to each lead
  const followerLabel = lead.estimatedFollowers ? lead.estimatedFollowers.toLocaleString() + (language === 'nl' ? ' volgers' : language === 'de' ? ' Follower' : language === 'fr' ? ' abonnés' : language === 'it' ? ' follower' : ' followers') : null;
  const speedLabel = loadSec ? loadSec + (language === 'nl' ? 's laadtijd' : language === 'de' ? 's Ladezeit' : language === 'fr' ? 's de chargement' : language === 'it' ? 's di caricamento' : 's load time') : null;
  const subjectPrompt = language === 'nl'
    ? `Bedenk 3 scherpe email-onderwerpregels voor een koude email.

Bedrijf: ${lead.companyName} (${lead.niche}, ${lead.location})
${followerLabel ? `Instagram: ${followerLabel}` : ''}
${speedLabel ? `Website laadtijd: ${speedLabel}` : ''}
Probleem: ${topProblem}
Dienst: ${topService}

Regels:
- Max 8 woorden, GEEN leesteken aan het einde
- Verwijs naar een CONCREET DATA PUNT als je het hebt (volgers, laadtijd, locatie)
- Formaat: nieuwsgierigheid of probleem-bewustzijn — GEEN resultaatbelofte
- VERBODEN: "AI", "marketing", "samenwerking", "vrijblijvend", "groeien", "helpen"
- Klinkt menselijk, niet als spam, geen uitroeptekens
- Optie 1: probleemgericht met concreet data punt (bijv. "23K volgers, nog geen advertenties" of "Jullie website laadt in ${speedLabel||'4s'}")
- Optie 2: nieuwsgierigheid wekken met tegenstelling (bijv. "Jullie Instagram groeit — jullie website niet")
- Optie 3: specifieke vondst of vraag (bijv. "Gevonden: 3 dingen die boekingen kosten" of "Waarom jullie website klanten wegjaagt")

Goede voorbeeldpatronen (NIET letterlijk overnemen, alleen als inspiratie):
"${followerLabel||'Jullie'} Instagram groeit — jullie website niet"
"${followerLabel ? followerLabel + ', nog geen advertenties' : 'Gevonden: 3 dingen die boekingen kosten'}"
"Waarom jullie website klanten wegjaagt"
"Gevonden: iets op jullie website"
"${lead.location} ${lead.niche} — concrete kans"

Geef ALLEEN JSON: { "subjectOptions": ["optie1", "optie2", "optie3"] }`
    : language === 'de'
    ? `Erstelle 3 prägnante E-Mail-Betreffzeilen auf DEUTSCH für eine Kalt-E-Mail.\n\nUnternehmen: ${lead.companyName} (${lead.niche}, ${lead.location})\n${followerLabel ? `Instagram: ${followerLabel}` : ''}\n${speedLabel ? `Ladezeit: ${speedLabel}` : ''}\nProblem: ${topProblem}\n\nRegeln:\n- Max. 8 Wörter, KEIN Satzzeichen am Ende\n- Konkreten Datenpunkt einbeziehen wenn vorhanden\n- VERBOTEN: "KI", "Marketing", "Zusammenarbeit"\n- Klingt menschlich, kein Spam\n\nNur JSON zurückgeben: { "subjectOptions": ["option1", "option2", "option3"] }`
    : language === 'fr'
    ? `Crée 3 objets d'e-mail percutants en FRANÇAIS pour un e-mail de prospection.\n\nEntreprise: ${lead.companyName} (${lead.niche}, ${lead.location})\n${followerLabel ? `Instagram: ${followerLabel}` : ''}\n${speedLabel ? `Temps de chargement: ${speedLabel}` : ''}\nProblème: ${topProblem}\n\nRègles:\n- Max 8 mots, SANS ponctuation à la fin\n- Inclure un point de données concret si disponible\n- INTERDIT: "IA", "marketing", "collaboration"\n- Sonne humain, pas spam\n\nRetourner uniquement JSON: { "subjectOptions": ["option1", "option2", "option3"] }`
    : language === 'it'
    ? `Crea 3 oggetti email incisivi in ITALIANO per una cold email.\n\nAzienda: ${lead.companyName} (${lead.niche}, ${lead.location})\n${followerLabel ? `Instagram: ${followerLabel}` : ''}\n${speedLabel ? `Tempo di caricamento: ${speedLabel}` : ''}\nProblema: ${topProblem}\n\nRegole:\n- Max 8 parole, NESSUNA punteggiatura alla fine\n- Includere un dato concreto se disponibile\n- VIETATO: "AI", "marketing", "collaborazione"\n- Suona umano, non spam\n\nRestituire solo JSON: { "subjectOptions": ["option1", "option2", "option3"] }`
    : `Generate 3 sharp email subject lines for a cold email.

Company: ${lead.companyName} (${lead.niche}, ${lead.location})
${followerLabel ? `Instagram: ${followerLabel}` : ''}
${speedLabel ? `Website load time: ${speedLabel}` : ''}
Problem: ${topProblem}
Service: ${topService}

Rules:
- Max 8 words, NO punctuation at the end
- Reference a CONCRETE DATA POINT when available (followers, load time, location)
- Format: curiosity or problem-awareness — NO results promise
- BANNED: "AI", "marketing", "collaboration", "no obligation", "grow", "help"
- Sounds like a real person, not spam, no exclamation marks
- Option 1: problem-focused with a concrete data point (e.g. "18K followers, zero ad spend" or "Your site loads in ${speedLabel||'4s'}")
- Option 2: curiosity using contrast (e.g. "Your Instagram grows — your website doesn't")
- Option 3: specific finding or question (e.g. "3 things costing you bookings right now" or "Found something on your website")

Good example patterns (do NOT copy literally, use as inspiration):
"${followerLabel||'Your'} Instagram grows — your website doesn't"
"${followerLabel ? followerLabel + ', zero ad spend' : '3 things costing you bookings right now'}"
"Found something on your website"
"Why your website is losing customers"
"${lead.location} ${lead.niche} — concrete opportunity"

Return ONLY JSON: { "subjectOptions": ["option1", "option2", "option3"] }`;

  let subjectOptions = [];
  try {
    const subjectResult = await aiJSON(subjectPrompt);
    subjectOptions = Array.isArray(subjectResult?.subjectOptions) ? subjectResult.subjectOptions : [];
  } catch {}
  if (subjectOptions.length < 3) {
    subjectOptions = language === 'nl'
      ? [emailA.subject, `Vraag over ${lead.companyName}`, `${lead.niche} in ${lead.location}`]
      : language === 'de' ? [emailA.subject, `Frage zu ${lead.companyName}`, `${lead.niche} in ${lead.location}`]
      : language === 'fr' ? [emailA.subject, `Question pour ${lead.companyName}`, `${lead.niche} à ${lead.location}`]
      : language === 'it' ? [emailA.subject, `Domanda per ${lead.companyName}`, `${lead.niche} a ${lead.location}`]
      : [emailA.subject, `Question for ${lead.companyName}`, `${lead.niche} in ${lead.location}`];
  }
  subjectOptions = subjectOptions.slice(0, 3).map(s => String(s).trim());

  const email = { ...emailA, subject: subjectOptions[0] };

  _runState.currentAgent = 'Agent 6 — LinkedIn DM schrijver';
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
    leadSource: lead.leadSource || 'web', instagramBio: lead.instagramBio || null,
    mapsRating: lead.mapsRating || null, reviewCount: lead.reviewCount || null,
    address: lead.address || null, phone: lead.phone || null,
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
    websiteUrl: lead.websiteUrl, leadSource: lead.leadSource || 'web', instagramBio: lead.instagramBio || null,
    mapsRating: lead.mapsRating || null, reviewCount: lead.reviewCount || null,
    address: lead.address || null, phone: lead.phone || null,
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

async function runFindLeadsJob(overrides = {}, manual = false) {
  console.log('[Run] Starting runFindLeadsJob...');
  console.log('[Run] Overrides:', JSON.stringify(overrides));
  _runState = { running: true, startedAt: new Date().toISOString(), target: 0, found: 0, skipped: 0, currentAgent: 'Opstarten', currentLead: null, log: [] };
  runLog('Run gestart');

  const settings0 = readJSON('settings.json') || {};
  const apiKey = getClaudeApiKey(settings0);
  console.log('[Run] API key exists:', !!apiKey);

  if (!isClaudeReady(settings0)) {
    throw new Error('Claude API sleutel niet ingesteld. Voeg toe via Instellingen → API & integraties of stel CLAUDE_API_KEY in als Railway environment variable.');
  }
  const settings = readJSON('settings.json') || {};
  if (!manual && settings.automationPaused) {
    console.log('[Agency AI] Automatisering gepauzeerd — geplande run overgeslagen');
    return 0;
  }

  const count      = overrides.count      || settings.leadsPerDay || 15;
  const services   = settings.services   || DEFAULT_SERVICES;
  const myName     = settings.myName     || '';
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
    // Default to local service businesses that typically lack websites, chatbots, and booking systems
    nichesList = 'restaurant, kapper, schoonheidssalon, fysiotherapeut, tandarts, advocaat, accountant, makelaar, aannemer, loodgieter, elektricien, garage, dierenarts, personal trainer, fotograaf';
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
    'restaurant', 'kapper', 'schoonheidssalon', 'fysiotherapeut', 'tandarts',
    'makelaar', 'aannemer', 'loodgieter', 'garage', 'personal trainer',
    'fotograaf', 'advocaat', 'accountant', 'dierenarts', 'elektricien',
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
  const instagramTargeting  = settings.instagramTargeting  === true;
  const googleMapsTargeting = settings.googleMapsTargeting === true;

  _runState.target = target;
  runLog(`Doel: ${target} leads zoeken`);
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
}]

CRITICAL: Your response must be ONLY a JSON array.
No explanation, no thinking, no commentary.
Start your response with [ and end with ]
If you cannot find ${batchSize} businesses with emails, return whatever you found as JSON.
Example format:
[{"companyName":"Example","websiteUrl":"https://example.com","email":"info@example.com","location":"${randomCity}","country":"NL","niche":"beauty","instagramHandle":"@example","estimatedFollowers":5000}]${alreadySeen}`;

    // 7s between web-search calls to stay under the 10/min rate limit
    if (attempts > 0) await new Promise(r => setTimeout(r, 7000));

    let batch;
    try {
      console.log(`[Agent 1] Searching for ${randomNiche} businesses in ${randomCity}...`);
      batch = await aiWebSearchJSON(searchPrompt);
      if (!Array.isArray(batch)) batch = [batch];
      batch = batch.slice(0, batchSize);
    } catch (err) {
      console.error(`[Agent 1] Batch mislukt:`, err.message);
      logError('agent1', 'Agent 1 batch mislukt', err.message);
      attempts += batchSize;
      continue; // try next batch, don't crash the run
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

    // Early-exit: if 25+ companies checked with 0 leads found, email scraper is likely broken
    if (attempts >= 25 && found === 0) {
      const errMsg = 'Email scraper lijkt niet te werken. Controleer de Railway logs op [Agent2] berichten.';
      console.error(`[Run] GESTOPT: ${errMsg}`);
      logError('scraper', errMsg, `${attempts} bedrijven gecontroleerd, 0 emails gevonden`);
      throw new Error(errMsg);
    }

    // ── Instagram targeting (optional extra batch) ────────────────────────
    let instaBatch = [];
    if (instagramTargeting && found < target) {
      try {
        console.log(`[Agent 1-IG] Zoeken naar Instagram accounts: ${randomNiche} in ${randomCity}...`);
        _runState.currentAgent = 'Agent 1 — Instagram Finder';
        const igPrompt = `Search Instagram and the web for ${batchSize} real small local businesses in ${randomCity} in the niche: ${randomNiche}, that have an Instagram account with between 2,000 and 200,000 followers, a low engagement rate (under 2%), no booking system link in their bio, and an active profile (post within last 30 days).

For EACH account you MUST find:
1. Real company/business name
2. Instagram handle (@handle)
3. Estimated follower count (2000–200000)
4. Bio text (what they write in their profile)
5. Website URL from bio (or null)
6. Approximate date of last post (e.g. "2025-05-10")
7. Real contact email (from website, Google Maps, or bio) — only include if found

Search queries to use: "${randomNiche} ${randomCity} instagram followers site:instagram.com" and "${randomNiche} ${randomCity} instagram account"

Return ONLY a JSON array:
[{
  "companyName": "Business name",
  "instagramHandle": "@handle",
  "estimatedFollowers": 15000,
  "instagramBio": "Bio text here",
  "websiteUrl": "https://their-website.com or null",
  "lastPostDate": "2025-05-10",
  "email": "info@business.com or null",
  "location": "${randomCity}, Country",
  "country": "2-letter country code",
  "niche": "beauty or food or fitness or retail or restaurant or horeca or health or automotive",
  "subNiche": "${randomNiche}",
  "leadSource": "instagram"
}]

CRITICAL: Return ONLY a JSON array. Start with [ end with ].${alreadySeen}`;
        await new Promise(r => setTimeout(r, 7000));
        const igRaw = await aiWebSearchJSON(igPrompt);
        instaBatch = (Array.isArray(igRaw) ? igRaw : []).filter(b => b && b.companyName && b.instagramHandle).slice(0, batchSize);
        instaBatch = instaBatch.filter(b => {
          const key = b.companyName.toLowerCase().trim();
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        }).map(b => ({ ...b, leadSource: 'instagram' }));
        console.log(`[Agent 1-IG] ${instaBatch.length} Instagram accounts gevonden`);
        runLog(`Instagram: ${instaBatch.length} accounts gevonden`);
      } catch (igErr) {
        console.warn(`[Agent 1-IG] Instagram batch mislukt:`, igErr.message);
      }
    }

    // ── Google Maps targeting (optional extra batch) ──────────────────────
    let mapsBatch = [];
    if (googleMapsTargeting && found < target) {
      try {
        console.log(`[Agent 1-Maps] Zoeken op Google Maps: ${randomNiche} in ${randomCity}...`);
        _runState.currentAgent = 'Agent 1 — Google Maps Finder';
        const mapsPrompt = `Search Google Maps and the web for ${batchSize} real small local businesses in ${randomCity} in the niche: ${randomNiche}. Look specifically for businesses that have:
- Between 3 and 4 star reviews (room for improvement — not perfect, not bad)
- Fewer than 50 Google reviews (small/new business)
- A website listed on Google Maps
- Active in the last 6 months

Search queries to use: "${randomNiche} ${randomCity} google maps 3 star reviews website" and "site:maps.google.com OR site:google.com/maps ${randomNiche} ${randomCity}"

For EACH business you MUST find:
1. Real business name
2. Full address
3. Google Maps rating (3.0–4.0)
4. Number of Google reviews (under 50)
5. Website URL (listed on Maps)
6. Phone number (if visible)
7. Real contact email (from website or Google Maps listing) — only include if found

Return ONLY a JSON array:
[{
  "companyName": "Business name",
  "address": "Full street address",
  "mapsRating": 3.8,
  "reviewCount": 24,
  "websiteUrl": "https://their-website.com",
  "phone": "+31 20 123 4567 or null",
  "email": "info@business.com or null",
  "location": "${randomCity}, Country",
  "country": "2-letter country code",
  "niche": "beauty or food or fitness or retail or restaurant or horeca or health or automotive",
  "subNiche": "${randomNiche}",
  "leadSource": "maps"
}]

CRITICAL: Return ONLY a JSON array. Start with [ end with ].${alreadySeen}`;
        await new Promise(r => setTimeout(r, 7000));
        const mapsRaw = await aiWebSearchJSON(mapsPrompt);
        mapsBatch = (Array.isArray(mapsRaw) ? mapsRaw : []).filter(b => b && b.companyName && b.websiteUrl).slice(0, batchSize);
        mapsBatch = mapsBatch.filter(b => {
          const key = b.companyName.toLowerCase().trim();
          if (seenNames.has(key)) return false;
          seenNames.add(key);
          return true;
        }).map(b => ({ ...b, leadSource: 'maps' }));
        console.log(`[Agent 1-Maps] ${mapsBatch.length} Google Maps bedrijven gevonden`);
        runLog(`Google Maps: ${mapsBatch.length} bedrijven gevonden`);
      } catch (mapsErr) {
        console.warn(`[Agent 1-Maps] Google Maps batch mislukt:`, mapsErr.message);
      }
    }

    const allBatch = [...freshBatch, ...instaBatch, ...mapsBatch];

    for (const lead of allBatch) {
      if (found >= target) break;
      const src = lead.leadSource === 'instagram' ? ' [Instagram]' : lead.leadSource === 'maps' ? ' [Maps]' : '';
      console.log(`\n[Lead ${found + 1}/${target}] ${lead.companyName} (${lead.niche})${src}`);
      _runState.currentLead = lead.companyName;
      _runState.currentAgent = lead.leadSource === 'instagram' ? 'Agent 1 — Instagram Finder' : lead.leadSource === 'maps' ? 'Agent 1 — Google Maps Finder' : 'Agent 1 — Finder';
      _runState.found = found;
      _runState.skipped = skipped;
      runLog(`Verwerken: ${lead.companyName}${src}`);
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
      trackFunnelEvent(leadRecord.id, 'lead_found', { source: leadRecord.leadSource || 'web' });
      found++;
      _runState.found = found;
      runLog(`✓ ${lead.companyName} — score ${item.score}${src}`);
      console.log(`  ✓ Klaar — score: ${item.score}, waarde: €${item.estimatedValue} → inbox (wacht op goedkeuring)`);
    }
  }

  } catch (loopErr) {
    console.error('[Run] Batch loop crashed:', loopErr.message);
    console.error('[Run] Stack:', loopErr.stack);
    logError('run', `Batch loop gecrasht na ${found} leads`, loopErr.message);
    runLog(`Fout: ${loopErr.message}`);
    // Don't rethrow — save whatever was found
  }

  _runState.running = false;
  _runState.found = found;
  _runState.skipped = skipped;
  _runState.currentAgent = null;
  _runState.currentLead = null;
  _runState.finishedAt = new Date().toISOString();
  runLog(`Klaar: ${found} leads gevonden`);
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
  // Log run summary (costs already tracked per-call in aiCall(); costUsd:0 here avoids double-counting in P&L)
  addActivity('run', `Run klaar: ${inboxItems.length} leads gevonden (${skipped} overgeslagen zonder email)`, { tokensIn: runTokIn, tokensOut: runTokOut, costUsd: 0, meta: { leadsFound: inboxItems.length, skipped, attempts, totalValue, runCostUsd } });

  const pendingCount   = inboxItems.length;
  const highScoreCount = inboxItems.filter(i => i.score >= 8).length;

  if (pendingCount > 0) {
    addNotification('run_complete', `Run klaar: ${pendingCount} leads gevonden`,
      `${pendingCount} wachten op goedkeuring${highScoreCount > 0 ? ` · ${highScoreCount} met score 8+` : ''}`, null, 'inbox');
    broadcastWS('new_lead', { count: pendingCount, highScoreCount });
    fireWebhooks('run.complete', { leadsFound: pendingCount, pendingCount, highScoreCount, totalValue, completedAt: new Date().toISOString() });
  }

  // Run-complete notification email
  const runSettings = readJSON('settings.json');
  if (isResendReady(runSettings)) {
    try {
      const agencyName = runSettings.agencyName || 'Agency AI';
      const runDate    = new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const fmt        = n => '€' + Number(n).toLocaleString('nl-NL');

      const topLeads = [...inboxItems]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 5);

      const scoreColor = s => s >= 8 ? '#10b981' : s >= 6 ? '#f59e0b' : '#ef4444';

      const leadsRows = topLeads.map(item =>
        `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:9px 12px;font-size:13px;color:#111;font-weight:500">${item.companyName || '—'}</td>
          <td style="padding:9px 12px;font-size:12px;color:#6b7280">${item.city || '—'}</td>
          <td style="padding:9px 12px;font-size:12px;color:#6b7280">${item.niche || '—'}</td>
          <td style="padding:9px 12px;font-size:12px;font-weight:700;color:${scoreColor(item.score || 0)}">${item.score || '—'}/10</td>
        </tr>`
      ).join('');

      const statPill = (label, value, bg, color) =>
        `<div style="display:inline-block;background:${bg};color:${color};border-radius:8px;padding:10px 18px;margin:0 6px 6px 0;text-align:center;min-width:90px">
          <div style="font-size:20px;font-weight:700">${value}</div>
          <div style="font-size:11px;opacity:0.8;margin-top:2px">${label}</div>
        </div>`;

      const runEmailHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <div style="background:#111;padding:26px 30px">
    <div style="color:#fff;font-size:17px;font-weight:700">⚡ ${agencyName}</div>
    <div style="color:#9ca3af;font-size:12px;margin-top:2px">Dagelijkse run voltooid — ${runDate}</div>
  </div>

  <div style="padding:26px 30px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:16px">
      ${pendingCount > 0 ? `${pendingCount} nieuwe lead${pendingCount !== 1 ? 's' : ''} gevonden` : 'Run voltooid — geen nieuwe leads'}
    </div>

    <div style="margin-bottom:20px">
      ${statPill('Gevonden', pendingCount, '#eff6ff', '#1d4ed8')}
      ${statPill('Score 8+', highScoreCount, '#f0fdf4', '#15803d')}
      ${statPill('Pipeline', fmt(totalValue), '#faf5ff', '#7c3aed')}
      ${statPill('Gecontroleerd', attempts, '#f9fafb', '#374151')}
    </div>

    ${topLeads.length ? `
    <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px">
      Top leads (op score)
    </div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
      <thead><tr style="background:#f9fafb">
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Bedrijf</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Stad</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Niche</th>
        <th style="padding:8px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Score</th>
      </tr></thead>
      <tbody>${leadsRows}</tbody>
    </table>` : ''}

    ${skipped > 0 ? `<div style="margin-top:14px;font-size:12px;color:#9ca3af">${skipped} bedrijf${skipped !== 1 ? 'en' : ''} overgeslagen (blacklist / duplicaat / geen email)</div>` : ''}

    <div style="margin-top:20px;text-align:center">
      <a href="${BASE_URL || 'https://www.agencyai.info'}/app" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;padding:12px 28px;font-size:14px;font-weight:600">Inbox bekijken →</a>
    </div>
  </div>
</div>
</body></html>`;

      await sendEmail({
        to: runSettings.gmailAddress,
        subject: `✅ Run klaar: ${pendingCount} leads · ${highScoreCount} score 8+ · ${fmt(totalValue)}`,
        html: runEmailHtml,
        settings: runSettings
      });
      console.log('[Run] Notificatie email verstuurd');
    } catch (err) {
      console.error('[Run] Notificatie email fout:', err.message);
    }
  }

  console.log(`\n[Agency AI] ─── Run klaar: ${pendingCount} leads gevonden (${skipped} overgeslagen zonder email, ${attempts} bedrijven gecontroleerd), €${totalValue} pipeline ───\n`);
  return pendingCount;
}

// â"€â"€â"€ Find leads endpoint â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

app.post('/api/find-leads', requireAdmin, async (req, res) => {
  try {
    const overrides = req.body || {};
    const manual = overrides.manual !== false;
    const found = await jobQueue.add('find_leads', () => runFindLeadsJob(overrides, manual), overrides, 'high');
    res.json({ ok: true, found });
  } catch (err) {
    logError('run', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs', requireAdmin, (req, res) => {
  const status = jobQueue.status();
  const recent = jobQueue.recentJobs(50);
  res.json({ ...status, jobs: recent });
});

// â"€â"€â"€ Follow-up sequencer â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function daysSince(isoDate) {
  return (Date.now() - new Date(isoDate).getTime()) / 86400000;
}

async function runFollowUpJob() {
  const settings  = readJSON('settings.json');
  if (settings.automationPaused) return;

  const myName      = settings.myName     || '';
  const agencyName  = settings.agencyName || 'Agency AI';
  const _fuCalendly = settings.calendlyUrl ? `\nCalendly: ${settings.calendlyUrl} — je kunt dit in de email verwerken als uitnodiging` : '';
  const _fuCalendlyEN = settings.calendlyUrl ? `\nCalendly: ${settings.calendlyUrl} — you may include this as a booking invitation` : '';

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

Context: Stuurden ${lead.companyName} (${nicheCtx}, ${lead.location}) 2 dagen geleden een email. Origineel onderwerp: "${origSubj}". Nog geen reactie.
Afzender: ${myName} van ${agencyName}${_fuCalendly}

Structuur (volg dit exact):
1. Open met: "Wilde dit even naar boven halen —"
2. Dan: "en ik had nog iets gevonden over [specifiek probleem dat relevant is voor een ${nicheCtx} in ${lead.location}]."
3. Voeg 1 zin concrete waarde toe: wat dit betekent voor hun bedrijf.
4. Eindig met: "Zou u hier even 20 minuten voor hebben?"

Regels:
- Max 80 woorden totaal
- Persoonlijk en direct, geen salespitch
- Verwijs NIET naar de vorige email
- VERBODEN: "vrijblijvend", "innovatief", "ik hoop", "niet verplicht", "u leest dit misschien al"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "volledige email tekst"}`

          : lang === 'de'
          ? `Schreibe eine kurze Follow-up-E-Mail. Gib JSON zurück.

Kontext: Habe ${lead.companyName} (${nicheCtx}, ${lead.location}) vor 2 Tagen eine E-Mail gesendet. Betreff: "${origSubj}". Noch keine Antwort.
Absender: ${myName} von ${agencyName}${_fuCalendly}

Struktur (genau einhalten):
1. Beginnen mit: "Ich wollte kurz nachfassen —"
2. Dann: "und habe noch etwas Interessantes entdeckt bezüglich [spezifisches Problem für ${nicheCtx} in ${lead.location}]."
3. Eine Zeile konkreter Mehrwert: was das für ihr Unternehmen bedeutet.
4. Abschluss: "Hätten Sie kurz 20 Minuten dafür?"

Regeln:
- Max. 80 Wörter insgesamt
- Persönlich und direkt, kein Verkaufsgespräch
- NICHT auf die vorherige E-Mail verweisen
- VERBOTEN: "unverbindlich", "innovativ", "ich hoffe", "kein Druck"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "vollständiger E-Mail-Text"}`

          : lang === 'fr'
          ? `Écris un court email de suivi. Retourne du JSON.

Contexte: J'ai envoyé un email à ${lead.companyName} (${nicheCtx}, ${lead.location}) il y a 2 jours. Objet: "${origSubj}". Pas de réponse.
Expéditeur: ${myName} de ${agencyName}${_fuCalendly}

Structure (à suivre exactement):
1. Commencer par: "Je voulais juste faire remonter ce message —"
2. Puis: "et j'ai trouvé quelque chose d'intéressant concernant [problème spécifique pour un ${nicheCtx} à ${lead.location}]."
3. Une phrase de valeur concrète: ce que cela représente pour leur activité.
4. Terminer par: "Auriez-vous 20 minutes pour en discuter?"

Règles:
- Maximum 80 mots au total
- Personnel et direct, pas de discours commercial
- NE PAS faire référence à l'email précédent
- INTERDIT: "sans engagement", "innovant", "j'espère", "sans pression"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "texte complet de l'email"}`

          : lang === 'it'
          ? `Scrivi una breve email di follow-up. Restituisci JSON.

Contesto: Ho inviato un'email a ${lead.companyName} (${nicheCtx}, ${lead.location}) 2 giorni fa. Oggetto: "${origSubj}". Nessuna risposta.
Mittente: ${myName} di ${agencyName}${_fuCalendly}

Struttura (seguire esattamente):
1. Iniziare con: "Volevo solo riprendere il discorso —"
2. Poi: "e ho trovato qualcosa di interessante riguardo a [problema specifico per ${nicheCtx} a ${lead.location}]."
3. Una frase di valore concreto: cosa significa per la loro attività.
4. Terminare con: "Avrebbe 20 minuti per parlarne?"

Regole:
- Max 80 parole in totale
- Personale e diretto, nessun discorso commerciale
- NON fare riferimento all'email precedente
- VIETATO: "senza impegno", "innovativo", "spero", "nessuna pressione"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "testo completo dell'email"}`

          : `Write a short follow-up email. Return JSON.

Context: Sent ${lead.companyName} (${nicheCtx}, ${lead.location}) an email 2 days ago. Subject: "${origSubj}". No reply yet.
Sender: ${myName} from ${agencyName}${_fuCalendlyEN}

Structure (follow exactly):
1. Open with: "Just following up on my email —"
2. Then: "I found one more thing worth mentioning about [specific issue relevant to a ${nicheCtx} in ${lead.location}]."
3. One line of concrete value: what this means for their business.
4. Close with: "Worth a quick 20-minute call?"

Rules:
- Max 80 words total
- Personal and direct, no sales pitch
- Do NOT reference "the previous email" or apologise
- BANNED: "no obligation", "innovative", "I hope", "just checking in", "at your convenience"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "full email text"}`;

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

Context: ${lead.companyName} (${nicheCtx}, ${lead.location}) heeft niet gereageerd. Dit is het laatste bericht.
Afzender: ${myName} van ${agencyName}${_fuCalendly}

Structuur (volg dit exact):
1. Open met: "Laatste berichtje van mijn kant —"
2. Dan: "als de timing niet goed is helemaal geen probleem."
3. Eindig met: "Mocht u ooit willen kijken wat er mogelijk is, ik sta klaar."

Regels:
- Max 50 woorden totaal
- Geen druk, geen salespitch, geen excuses
- Persoonlijk en warm
- VERBODEN: "vrijblijvend", "ik hoop", "laatste kans", "jammer"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "volledige email tekst"}`

          : lang === 'de'
          ? `Schreibe eine sehr kurze letzte Follow-up-E-Mail. Gib JSON zurück.

Kontext: ${lead.companyName} (${nicheCtx}, ${lead.location}) hat nicht geantwortet. Dies ist die letzte Nachricht.
Absender: ${myName} von ${agencyName}${_fuCalendly}

Struktur (genau einhalten):
1. Beginnen mit: "Meine letzte Nachricht —"
2. Dann: "kein Problem, wenn der Zeitpunkt nicht passt."
3. Abschluss: "Falls Sie sich irgendwann fragen, was möglich ist, bin ich hier."

Regeln:
- Max. 50 Wörter insgesamt
- Kein Druck, keine Entschuldigung
- Persönlich und warm
- VERBOTEN: "unverbindlich", "letzte Chance", "ich hoffe"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "vollständiger E-Mail-Text"}`

          : lang === 'fr'
          ? `Écris un très court dernier email de suivi. Retourne du JSON.

Contexte: ${lead.companyName} (${nicheCtx}, ${lead.location}) n'a pas répondu. C'est le dernier message.
Expéditeur: ${myName} de ${agencyName}${_fuCalendly}

Structure (à suivre exactement):
1. Commencer par: "Mon dernier message —"
2. Puis: "pas de problème si le moment n'est pas opportun."
3. Terminer par: "Si jamais vous souhaitez explorer les possibilités, je suis là."

Règles:
- Maximum 50 mots au total
- Aucune pression, aucune excuse
- Personnel et chaleureux
- INTERDIT: "sans engagement", "dernière chance", "j'espère"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "texte complet de l'email"}`

          : lang === 'it'
          ? `Scrivi un brevissimo ultimo email di follow-up. Restituisci JSON.

Contesto: ${lead.companyName} (${nicheCtx}, ${lead.location}) non ha risposto. Questo è l'ultimo messaggio.
Mittente: ${myName} di ${agencyName}${_fuCalendly}

Struttura (seguire esattamente):
1. Iniziare con: "Il mio ultimo messaggio —"
2. Poi: "nessun problema se i tempi non sono giusti."
3. Terminare con: "Se mai volesse esplorare le possibilità, sono qui."

Regole:
- Max 50 parole in totale
- Nessuna pressione, nessuna scusa
- Personale e caldo
- VIETATO: "senza impegno", "ultima possibilità", "spero"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "testo completo dell'email"}`

          : `Write a very short final follow-up email. Return JSON.

Context: ${lead.companyName} (${nicheCtx}, ${lead.location}) hasn't responded. This is the last message.
Sender: ${myName} from ${agencyName}${_fuCalendlyEN}

Structure (follow exactly):
1. Open with: "Last message from me —"
2. Then: "completely understand if the timing isn't right."
3. Close with: "If you ever want to explore what's possible, I'm here."

Rules:
- Max 50 words total
- Zero pressure, no apology, no sales pitch
- Personal and warm
- BANNED: "no obligation", "last chance", "I hope", "just checking in"

{"subject": "Re: ${origSubj || lead.companyName}", "body": "full email text"}`;

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

function extractReplyText(rawBody) {
  if (!rawBody) return '';

  function decodeQP(s) {
    return s.replace(/=\r?\n/g, '').replace(/=([A-F0-9]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
  }

  function decodeB64(s) {
    try { return Buffer.from(s.replace(/\s/g, ''), 'base64').toString('utf-8'); } catch { return s; }
  }

  function stripHtml(html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&[a-z#0-9]+;/gi, ' ')
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function applyEncoding(content, partHeaders) {
    const enc = (partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i)?.[1] || '').toLowerCase().trim();
    if (enc === 'base64') return decodeB64(content);
    if (enc === 'quoted-printable') return decodeQP(content);
    return content;
  }

  function bodyAfterHeaders(part) {
    const crlfIdx = part.indexOf('\r\n\r\n');
    if (crlfIdx !== -1) return [part.substring(0, crlfIdx), part.substring(crlfIdx + 4)];
    const lfIdx = part.indexOf('\n\n');
    if (lfIdx !== -1) return [part.substring(0, lfIdx), part.substring(lfIdx + 2)];
    return [part, ''];
  }

  let text = '';
  let isHtml = false;

  // ── Multipart: find text/plain first, fall back to text/html ──────────────
  const boundaryMatch = rawBody.match(/boundary=["']?([^"'\r\n;>]+)["']?/i);
  if (boundaryMatch) {
    const boundary = boundaryMatch[1].trim();
    const escapedB = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = rawBody.split(new RegExp(`--${escapedB}(?:--)?`));
    let htmlFallback = '';

    for (const part of parts) {
      const [hdr, body] = bodyAfterHeaders(part);
      const ct = (hdr.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').toLowerCase().trim();
      if (ct === 'text/plain') {
        text = applyEncoding(body.trim(), hdr);
        break;
      }
      if (ct === 'text/html' && !htmlFallback) {
        htmlFallback = applyEncoding(body.trim(), hdr);
      }
    }

    if (!text && htmlFallback) {
      text = stripHtml(htmlFallback);
      isHtml = false; // already stripped
    }
  } else {
    // ── Single-part ───────────────────────────────────────────────────────────
    const [hdr, body] = bodyAfterHeaders(rawBody);
    const ct = (hdr.match(/Content-Type:\s*([^\r\n;]+)/i)?.[1] || '').toLowerCase().trim();
    isHtml = ct.includes('text/html');
    text = applyEncoding(body || rawBody, hdr);
  }

  // ── Fallback: if still raw MIME-looking blob, try stripping HTML ──────────
  if (!text) text = rawBody;

  // ── Always strip HTML — Outlook mobile mixes HTML into text/plain parts ──
  text = stripHtml(text);
  // Second pass: if tags still remain (e.g. encoded or nested), strip again
  if (/<[a-z][^>]*>/i.test(text)) text = stripHtml(text);

  // ── Quoted-printable leftovers ────────────────────────────────────────────
  if (/=[A-F0-9]{2}/i.test(text)) text = decodeQP(text);

  // ── Attempt base64 decode if text still looks encoded (no real words) ─────
  if (text.length > 20 && !/\s/.test(text.substring(0, 40)) && /^[A-Za-z0-9+/]+=*$/.test(text.replace(/\s/g, ''))) {
    const decoded = decodeB64(text);
    if (decoded.length > 10 && /[a-z ]{5}/i.test(decoded)) text = decoded;
  }

  // ── Strip quoted original (new content only) ──────────────────────────────
  const quoteIdx = text.search(/\r?\n[ \t]*>[ \t]?|\r?\nOp .{5,100}schreef:|\r?\nOn .{5,100}wrote:|\r?\nVan:[ \t]|\r?\nFrom:[ \t]|\r?\n-{3,}.*[Oo]riginal|\r?\n_{5,}/);
  if (quoteIdx > 20) text = text.substring(0, quoteIdx).trim();

  // ── Final cleanup ─────────────────────────────────────────────────────────
  text = text.replace(/\s+/g, ' ').trim();
  return text.substring(0, 600);
}

async function generateAndQueueAiReply(lead, replyText, settings) {
  const myName     = settings.myName     || 'Admin';
  const agencyName = settings.agencyName || 'Agency AI';
  const origSubject = lead.email?.subject || lead.emailA?.subject || (Array.isArray(lead.subjectOptions) ? lead.subjectOptions[0] : null) || lead.emailSubject || 'onze email';
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
  if (!isGmailReady(settings)) {
    console.log('[IMAP] Overgeslagen — Gmail niet geconfigureerd');
    return { count: 0, names: [] };
  }
  if (settings.replyDetection === false) {
    console.log('[IMAP] Overgeslagen — replyDetection uitgeschakeld');
    return { count: 0, names: [] };
  }

  let imapSimple, simpleParser;
  try {
    imapSimple = require('imap-simple');
    ({ simpleParser } = require('mailparser'));
  } catch (e) {
    console.error('[IMAP] imap-simple of mailparser niet beschikbaar:', e.message);
    return { count: 0, names: [] };
  }

  const imapConfig = {
    imap: {
      user:       settings.gmailAddress || process.env.GMAIL_USER || process.env.GMAIL_ADDRESS || 'info@agencyai.info',
      password:   getGmailPassword(settings),
      host:       'imap.soverin.net',
      port:       993,
      tls:        true,
      tlsOptions: { rejectUnauthorized: false },
      authTimeout: 10000
    }
  };

  let connection;
  try {
    console.log(`[IMAP] Verbinden met Soverin als ${imapConfig.imap.user}...`);
    connection = await imapSimple.connect(imapConfig);
    console.log('[IMAP] Verbonden ✓');
    await connection.openBox('INBOX');

    const since = new Date();
    since.setDate(since.getDate() - 14);
    const searchCriteria = [['SINCE', since]];
    // Fetch HEADER (pre-parsed object) + TEXT (body) separately — avoids RFC822/simpleParser issues
    const fetchOptions = { bodies: ['HEADER', 'TEXT'], markSeen: false };

    const messages = await connection.search(searchCriteria, fetchOptions);
    const leads  = readJSON('leads.json') || [];
    const stats  = readJSON('stats.json') || {};
    // Include clients — they can reply too; only permanently-dead leads are excluded
    const sentLeads = leads.filter(l =>
      l.sentAt || ['sent','replied','followup1','followup2','client'].includes(l.status)
    );
    console.log(`[IMAP] ${messages.length} emails gevonden in inbox (laatste 14 dagen), ${sentLeads.length} verstuurde leads om tegen te checken`);

    let repliesFound = 0;
    let bouncesFound = 0;
    const newNames = [];
    const aiReplyQueue = [];
    // Global set of messageIds already matched this session — prevents one message matching multiple leads
    const sessionProcessed = new Set();

    for (const msg of messages) {
      const headerPart = msg.parts.find(p => p.which === 'HEADER');
      if (!headerPart) continue;

      const header     = headerPart.body;
      const rawSubject = (header.subject?.[0] || '').trim();
      const subject    = rawSubject.toLowerCase();
      const fromRaw    = (header.from?.[0] || '').trim();
      const senderEmail = fromRaw.replace(/^.*<(.+)>.*$/, '$1').toLowerCase().trim() || fromRaw.toLowerCase().trim();
      const msgId      = (header['message-id']?.[0] || `uid-${msg.attributes.uid}`).trim();

      // Only look at replies (subject starts with Re:)
      if (!/^re:/i.test(subject)) continue;
      const cleanSubject = subject.replace(/^(re:\s*)+/i, '').trim();

      console.log(`[IMAP] Reply email: from="${senderEmail}", subject="${rawSubject}", msgId="${msgId}"`);

      // Skip if already matched this session (prevents one message matching multiple leads)
      if (sessionProcessed.has(msgId)) {
        console.log(`[IMAP] Skipping - already matched this session: ${msgId}`);
        continue;
      }

      // Pre-compute sender domain for Strategy 4
      const fromDomain = (senderEmail.split('@')[1] || '').toLowerCase().trim();

      let matched = null;
      let matchStrategy = '';

      // ── Pass 1: exact email match — wins immediately, no fallback ──
      for (const l of sentLeads) {
        if (l.processedMessageIds?.includes(msgId)) continue;
        if (senderEmail && l.contactEmail &&
            senderEmail === l.contactEmail.toLowerCase().trim()) {
          matched = l;
          matchStrategy = 'strategy 1 (exact email)';
          console.log(`[IMAP] Matched to: ${l.companyName} via ${matchStrategy}`);
          break; // stop immediately — exact match found
        }
      }

      // ── Pass 2: fuzzy matching — only if no exact email match ──
      if (!matched) {
        for (const l of sentLeads) {
          if (l.processedMessageIds?.includes(msgId)) continue;

          // Strategy 2: company name appears in reply subject
          const companyLower = (l.companyName || '').toLowerCase().trim();
          if (companyLower.length >= 3 && cleanSubject.includes(companyLower)) {
            matched = l;
            matchStrategy = 'strategy 2 (bedrijfsnaam in onderwerp)';
            console.log(`[IMAP] Matched to: ${l.companyName} via ${matchStrategy}`);
            break;
          }

          // Strategy 3: reply subject matches any sent subject
          const possibleSubjects = [
            l.email?.subject,
            l.emailA?.subject,
            l.emailB?.subject,
            ...(Array.isArray(l.subjectOptions) ? l.subjectOptions : [])
          ].filter(Boolean).map(s => s.toLowerCase().trim());

          let subjectMatched = false;
          for (const orig of possibleSubjects) {
            if (cleanSubject === orig ||
                (orig.length >= 10 && cleanSubject.includes(orig.substring(0, 30))) ||
                (cleanSubject.length >= 10 && orig.includes(cleanSubject.substring(0, 30)))) {
              subjectMatched = true;
              break;
            }
          }
          if (subjectMatched) {
            matched = l;
            matchStrategy = 'strategy 3 (onderwerp match)';
            console.log(`[IMAP] Matched to: ${l.companyName} via ${matchStrategy}`);
            break;
          }

          // Strategy 4: sender domain matches lead website or email domain
          if (fromDomain.length >= 4) {
            const websiteHost = (l.websiteUrl || '')
              .replace(/^https?:\/\/(www\.)?/, '').toLowerCase().split('/')[0].split('?')[0];
            if (websiteHost && websiteHost === fromDomain) {
              matched = l;
              matchStrategy = 'strategy 4 (website domein)';
              console.log(`[IMAP] Matched to: ${l.companyName} via ${matchStrategy}`);
              break;
            }
            const contactDomain = (l.contactEmail || '').split('@')[1]?.toLowerCase().trim() || '';
            if (contactDomain && contactDomain === fromDomain) {
              matched = l;
              matchStrategy = 'strategy 4 (email domein)';
              console.log(`[IMAP] Matched to: ${l.companyName} via ${matchStrategy}`);
              break;
            }
          }
        }
      }

      if (!matched) {
        console.log(`[IMAP]   → Geen match gevonden voor email van "${senderEmail}"`);
        if (sentLeads.length <= 20) {
          sentLeads.forEach(l => console.log(`[IMAP]     Geen match: ${l.companyName} | contactEmail: ${l.contactEmail || '—'} | subject: ${l.email?.subject || l.emailA?.subject || '—'}`));
        }
      }

      // Mark as processed immediately — no other lead can claim this message
      if (matched) sessionProcessed.add(msgId);

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

        // Extract clean reply text — extractReplyText handles MIME parsing + encoding
        const textPart  = msg.parts.find(p => p.which === 'TEXT');
        const rawBody   = (textPart?.body || '').toString();
        const replyText = extractReplyText(rawBody);

        matched.status        = 'replied';
        matched.repliedAt     = new Date().toISOString();
        matched.lastReplyText = replyText || '';
        matched.lastReplyAt   = matched.repliedAt;
        matched.lastReplyFrom = fromRaw || matched.contactEmail || '';
        trackFunnelEvent(matched.id, 'email_replied');

        addLeadHistory(leads, matched.id, {
          event: 'replied',
          label: `Reply ontvangen op ${new Date().toLocaleDateString('nl-NL')}`
        });
        if (matched.referralEmailSent) {
          addLeadHistory(leads, matched.id, { event: 'referral', label: 'Referral interesse getoond' });
        }
        updateMemory(matched.niche, matched.country, 'replied');
        updateMemoryVersion(matched.niche, matched.country, matched.sentVersion, 'replied');
        repliesFound++;
        newNames.push(matched.companyName);

        // Auto-blacklist on unsubscribe or aggressive reply
        const UNSUB_KEYWORDS = ['unsubscribe','uitschrijven','remove me','stop emailing','niet meer mailen','geen mail meer','verwijder me'];
        const AGGRESSIVE_KEYWORDS = ['spam','reporting you','scam','fuck off','stop contacting','never contact','do not contact','ga weg','rot op','oplichter','aangifte'];
        const replyLower = (replyText || '').toLowerCase();
        const replyDomain = (matched.contactEmail || '').split('@')[1];
        if (replyDomain) {
          if (UNSUB_KEYWORDS.some(k => replyLower.includes(k))) autoBlacklist(replyDomain, 'Uitschrijfverzoek in antwoord');
          else if (AGGRESSIVE_KEYWORDS.some(k => replyLower.includes(k))) autoBlacklist(replyDomain, 'Negatieve/agressieve reactie');
        }

        addActivity('reply', 'Reply ontvangen van ' + matched.companyName, { meta: { companyName: matched.companyName, leadId: matched.id } });
        addNotification('reply_received', `Reply: ${matched.companyName}`, `${matched.companyName} heeft gereageerd op jouw email`, matched.id, `project:${matched.id}`);
        broadcastWS('new_reply', { leadId: matched.id, companyName: matched.companyName, repliedAt: matched.repliedAt });
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
      const bounceCriteria = [['SINCE', bounceSince], ['FROM', 'MAILER-DAEMON']];
      const bounceFetch   = { bodies: ['HEADER', 'TEXT'], markSeen: false };
      const bounceMessages = await connection.search(bounceCriteria, bounceFetch);

      const EMAIL_RE = /[\w.+%-]+@[\w-]+\.[a-z]{2,}/gi;

      for (const msg of bounceMessages) {
        const hdrPart = msg.parts.find(p => p.which === 'HEADER');
        const body    = msg.parts.find(p => p.which === 'TEXT');
        if (!hdrPart) continue;

        const hdr     = hdrPart.body;
        const subj    = (hdr.subject?.[0] || '').toLowerCase();
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
            const bouncedDomain = failedEmail.split('@')[1];
            if (bouncedDomain) autoBlacklist(bouncedDomain, 'Email gebounced');
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

    console.log(`[IMAP] Check klaar: ${repliesFound} replies, ${bouncesFound} bounces`);
    return { count: repliesFound, names: newNames };
  } catch (err) {
    console.error('[IMAP] Fout tijdens reply check:', err.message);
    if (connection) try { connection.end(); } catch {}
    return { count: 0, names: [] };
  }
}

app.post('/api/check-replies', async (req, res) => {
  try {
    const result = await checkReplies();
    res.json({ ok: true, found: result.count, names: result.names });
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
  const log = readJSON('activity.json') || [];
  const limit = parseInt(req.query.limit) || 100;
  res.json({ activity: log.slice(0, limit) });
});

app.get('/api/stats/costs', (req, res) => {
  const stats = readJSON('stats.json') || {};
  const log   = readJSON('activity.json') || [];
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

// ─── Extended stats ───────────────────────────────────────────────────────────
app.get('/api/stats/extended', authMiddleware, (req, res) => {
  try {
    const leads = readJSON('leads.json') || [];
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
  const leads       = readJSON('leads.json')    || [];
  const settings    = readJSON('settings.json') || {};
  const activityLog = readJSON('activity.json') || [];

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

app.get('/api/ai/rate-status', authMiddleware, (req, res) => {
  const settings   = readJSON('settings.json') || {};
  const lim        = settings.aiRateLimits || {};
  const now        = Date.now();
  while (_aiCallLog.length && _aiCallLog[0].ts < now - 86400000) _aiCallLog.shift();
  const callsLastMinute = _aiCallLog.filter(e => e.ts >= now - 60000).length;
  const callsLastHour   = _aiCallLog.filter(e => e.ts >= now - 3600000).length;
  const callsLastDay    = _aiCallLog.length;

  const today = new Date().toISOString().slice(0, 10);
  const actLog = readJSON('activity.json') || [];
  const costLastDay = actLog.filter(e => e.timestamp?.startsWith(today)).reduce((s, e) => s + (e.costUsd || 0), 0);

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

app.post('/api/memory/:key/reset-ab', requireAdmin, (req, res) => {
  const memory = readJSON('memory.json') || {};
  const key = req.params.key;
  if (!memory[key]) return res.status(404).json({ error: 'Key niet gevonden' });
  delete memory[key].vA;
  delete memory[key].vB;
  delete memory[key].autoPickVersion;
  writeJSON('memory.json', memory);
  res.json({ ok: true });
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

// ─── Chat: DMs ────────────────────────────────────────────────────────────────
if (!readJSON('dm-messages.json')) writeJSON('dm-messages.json', []);

app.get('/api/chat/users', authMiddleware, (req, res) => {
  const users = (readJSON('users.json') || [])
    .filter(u => u.id !== req.user.id)
    .map(u => ({ id: u.id, name: u.name, username: u.username, role: u.role }));
  res.json(users);
});

app.get('/api/chat/dm/:partnerId/messages', authMiddleware, (req, res) => {
  const myId = req.user.id;
  const pid  = req.params.partnerId;
  const { since, limit = 100 } = req.query;
  const all = readJSON('dm-messages.json') || [];
  let msgs = all.filter(m =>
    (m.fromId === myId && m.toId === pid) ||
    (m.fromId === pid  && m.toId === myId)
  );
  if (since) msgs = msgs.filter(m => m.createdAt > since);
  res.json(msgs.slice(-parseInt(limit)));
});

app.post('/api/chat/dm/:partnerId/messages', authMiddleware, (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'Tekst verplicht' });
  const users = readJSON('users.json') || [];
  const partner = users.find(u => u.id === req.params.partnerId);
  if (!partner) return res.status(404).json({ error: 'Gebruiker niet gevonden' });
  const msgs = readJSON('dm-messages.json') || [];
  const msg = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    fromId: req.user.id,
    toId:   req.params.partnerId,
    fromName: req.user.name || req.user.username,
    fromRole: req.user.role,
    text: text.trim(),
    createdAt: new Date().toISOString()
  };
  msgs.push(msg);
  if (msgs.length > 2000) msgs.splice(0, msgs.length - 2000);
  writeJSON('dm-messages.json', msgs);
  res.json(msg);
});

app.delete('/api/chat/dm/messages/:id', authMiddleware, (req, res) => {
  const msgs = readJSON('dm-messages.json') || [];
  const msg = msgs.find(m => m.id === req.params.id);
  if (!msg) return res.status(404).json({ error: 'Niet gevonden' });
  if (msg.fromId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Geen toegang' });
  writeJSON('dm-messages.json', msgs.filter(m => m.id !== req.params.id));
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
  if (!isResendReady(settings)) return;

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
      clientEmail: client.contactEmail || null,
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
  const myName     = settings.myName     || '';
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
    if (client.portalToken && client.contactEmail && isResendReady(settings)) {
      try {
        const portalUrl = BASE_URL + '/portal/' + client.portalToken;
        const subject = lang === 'nl'
          ? agencyName + ' — Uw maandrapport voor ' + monthName + ' staat klaar'
          : agencyName + ' — Your monthly report for ' + monthName + ' is ready';
        const body = lang === 'nl'
          ? 'Beste ' + client.companyName + ',\n\nUw maandrapport voor ' + monthName + ' staat klaar in uw portaal.\n\nBekijk het hier: ' + portalUrl + '\n\nMet vriendelijke groet,\n' + myName
          : 'Dear ' + client.companyName + ',\n\nYour monthly report for ' + monthName + ' is ready in your portal.\n\nView it here: ' + portalUrl + '\n\nBest regards,\n' + myName;
        await sendEmail({ to: client.contactEmail, subject, body, settings });
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
  const myName     = settings.myName     || '';
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

// ─── Weekly client updates ────────────────────────────────────────────────────

async function runWeeklyUpdates() {
  const settings = readJSON('settings.json') || {};
  if (!settings.weeklyUpdatesEnabled) return;
  if (!isResendReady(settings)) {
    console.warn('[WeeklyUpdate] Resend niet ingesteld — overgeslagen');
    return;
  }
  const leads = readJSON('leads.json') || [];
  const clients = leads.filter(l => l.status === 'client' && (l.contactEmail || '').trim());
  console.log(`[WeeklyUpdate] ${clients.length} klanten gevonden`);
  let sent = 0;
  for (const lead of clients) {
    const idx = leads.findIndex(l => l.id === lead.id);
    try {
      const email = await generateClientEmail(lead, 'weeklyUpdate', settings);
      await sendEmail({ to: (lead.contactEmail || '').trim(), subject: email.subject, body: email.body, settings });
      if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
      leads[idx].clientEmailLog.push({ id: Date.now().toString(36) + '_' + idx, trigger: 'weeklyUpdate', subject: email.subject, body: email.body, to: lead.contactEmail, sentAt: new Date().toISOString(), sentBy: 'systeem' });
      addLeadHistory(leads, lead.id, { event: 'weeklyUpdateSent', label: `Automatische weekupdate verstuurd: ${email.subject}` });
      addActivity('email', `[Weekupdate] ${lead.companyName}`, { cost: 0 });
      sent++;
      console.log(`[WeeklyUpdate] Verstuurd naar ${lead.companyName} (${lead.contactEmail})`);
    } catch (err) {
      console.warn(`[WeeklyUpdate] Fout voor ${lead.companyName}:`, err.message);
    }
  }
  writeJSON('leads.json', leads);
  console.log(`[WeeklyUpdate] Klaar — ${sent}/${clients.length} emails verstuurd`);
}

// Manual trigger: send weekly update to a single client
app.post('/api/leads/:id/send-weekly-update', requireAdmin, async (req, res) => {
  const leads    = readJSON('leads.json') || [];
  const settings = readJSON('settings.json') || {};
  const idx      = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];
  if (!(lead.contactEmail || '').trim()) return res.status(400).json({ error: 'Geen email adres voor deze klant' });
  if (!isResendReady(settings)) return res.status(400).json({ error: 'Email niet ingesteld' });
  try {
    const email = await generateClientEmail(lead, 'weeklyUpdate', settings);
    await sendEmail({ to: (lead.contactEmail || '').trim(), subject: email.subject, body: email.body, settings });
    if (!leads[idx].clientEmailLog) leads[idx].clientEmailLog = [];
    leads[idx].clientEmailLog.push({ id: Date.now().toString(36), trigger: 'weeklyUpdate', subject: email.subject, body: email.body, to: lead.contactEmail, sentAt: new Date().toISOString(), sentBy: 'admin' });
    addLeadHistory(leads, lead.id, { event: 'weeklyUpdateSent', label: `Weekupdate handmatig verstuurd: ${email.subject}` });
    writeJSON('leads.json', leads);
    res.json({ ok: true, subject: email.subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

      // Build summary stats from bundle
      const leads      = bundle.leads || [];
      const inbox      = bundle.inbox || [];
      const runs       = bundle.runs  || [];
      const statsData  = bundle.stats || {};
      const agencyName = settings.agencyName || 'Agency AI';

      const totalLeads    = leads.length;
      const clientCount   = leads.filter(l => l.status === 'client').length;
      const pendingCount  = inbox.filter(i => !i.status || i.status === 'pending').length;
      const sentCount     = leads.filter(l => l.status === 'sent').length;
      const repliedCount  = leads.filter(l => l.status === 'replied').length;
      const pipelineValue = leads.reduce((s, l) => s + (Array.isArray(l.services) ? l.services.reduce((ss, sv) => ss + (sv.price || 0), 0) : 0), 0);
      const earnedTotal   = leads.reduce((s, l) => s + (l.payments || []).filter(p => p.status === 'paid').reduce((ps, p) => ps + (p.amount || 0), 0), 0);
      const lastRun       = runs.length ? runs[runs.length - 1] : null;
      const last24hLeads  = leads.filter(l => l.createdAt && (Date.now() - new Date(l.createdAt).getTime()) < 86400000).length;
      const totalApiCost  = (statsData.totalApiCostUsd || 0).toFixed(2);

      // Recent 5 leads
      const recentLeads = [...leads]
        .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 5);

      const STATUS_NL = { new:'Nieuw', inbox:'Inbox', pending:'Wachtend', approved:'Goedgekeurd', sent:'Verstuurd', replied:'Gereageerd', client:'Klant', dead:'Dead', scheduled:'Gepland' };

      const fmt = n => '€' + Number(n).toLocaleString('nl-NL');

      const statCard = (label, value, color) =>
        `<td style="width:25%;padding:0 8px 0 0"><div style="background:${color}14;border:1px solid ${color}30;border-radius:10px;padding:14px 16px;text-align:center"><div style="font-size:22px;font-weight:700;color:${color}">${value}</div><div style="font-size:11px;color:#6b7280;margin-top:2px">${label}</div></div></td>`;

      const recentRows = recentLeads.map(l =>
        `<tr style="border-bottom:1px solid #f3f4f6">
          <td style="padding:9px 12px;font-size:13px;color:#111;font-weight:500">${l.companyName || '—'}</td>
          <td style="padding:9px 12px;font-size:12px;color:#6b7280">${l.niche || '—'}</td>
          <td style="padding:9px 12px;font-size:12px"><span style="background:#f3f4f6;border-radius:5px;padding:2px 8px">${STATUS_NL[l.status] || l.status || '—'}</span></td>
          <td style="padding:9px 12px;font-size:12px;color:#2563eb;font-weight:600">${l.score ? l.score + '/10' : '—'}</td>
        </tr>`
      ).join('');

      const lastRunInfo = lastRun
        ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;font-size:13px;color:#374151">
            <strong>Laatste run:</strong> ${lastRun.startedAt ? new Date(lastRun.startedAt).toLocaleString('nl-NL') : '—'}
            &nbsp;·&nbsp; Gevonden: <strong>${lastRun.found || 0}</strong>
            &nbsp;·&nbsp; Verwerkt: <strong>${lastRun.processed || 0}</strong>
            &nbsp;·&nbsp; Status: <strong>${lastRun.status || '—'}</strong>
           </div>`
        : '';

      const backupHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08)">

  <!-- Header -->
  <div style="background:#111111;padding:28px 32px;display:flex;align-items:center">
    <div style="width:36px;height:36px;background:#2563eb;border-radius:8px;display:inline-flex;align-items:center;justify-content:center;margin-right:12px;vertical-align:middle">
      <span style="color:#fff;font-size:18px;font-weight:700">⚡</span>
    </div>
    <div style="display:inline-block;vertical-align:middle">
      <div style="color:#ffffff;font-size:17px;font-weight:700">${agencyName}</div>
      <div style="color:#9ca3af;font-size:12px">Dagelijkse backup — ${new Date().toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Body -->
  <div style="padding:28px 32px">

    <!-- KPI row -->
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px"><tr>
      ${statCard('Totaal leads', totalLeads, '#2563eb')}
      ${statCard('Klanten', clientCount, '#10b981')}
      ${statCard('Te beoordelen', pendingCount, '#f59e0b')}
      ${statCard('Verdiend', fmt(earnedTotal), '#6366f1')}
    </tr></table>

    <!-- Secondary row -->
    <table style="width:100%;border-collapse:separate;border-spacing:0;margin-bottom:24px"><tr>
      ${statCard('Verstuurd', sentCount, '#3b82f6')}
      ${statCard('Gereageerd', repliedCount, '#8b5cf6')}
      ${statCard('Afgelopen 24u', last24hLeads, '#ec4899')}
      ${statCard('AI kosten', '$' + totalApiCost, '#ef4444')}
    </tr></table>

    <!-- Pipeline value -->
    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:14px 18px;margin-bottom:24px;font-size:14px;color:#1d4ed8">
      Pipeline waarde: <strong>${fmt(pipelineValue)}</strong> totaal over ${totalLeads} leads
    </div>

    <!-- Last run -->
    ${lastRunInfo}
    ${lastRun ? '<div style="height:16px"></div>' : ''}

    <!-- Recent leads table -->
    ${recentLeads.length ? `
    <div style="margin-bottom:8px;font-size:13px;font-weight:600;color:#374151">Recente leads</div>
    <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px">
      <thead><tr style="background:#f9fafb">
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Bedrijf</th>
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Niche</th>
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Status</th>
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;text-transform:uppercase">Score</th>
      </tr></thead>
      <tbody>${recentRows}</tbody>
    </table>` : ''}

    <!-- Footer note -->
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid #f3f4f6;font-size:11px;color:#9ca3af">
      Backup bestand bijgevoegd: <em>${filename}</em><br>
      Bevat: leads, inbox, runs, stats, memory en instellingen (zonder wachtwoorden).
    </div>
  </div>
</div>
</body></html>`;

      const { default: fetch } = await import('node-fetch');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: `"${agencyName}" <${fromAddr}>`,
          to: toAddr,
          subject: `${agencyName} Backup ${dateStr} — ${totalLeads} leads · ${clientCount} klanten`,
          html: backupHtml,
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
    jobQueue.add('find_leads_cron', () => runFindLeadsJob({}, false), {}).catch(err => logError('cron_run', 'Dagelijkse run mislukt', err.message));
  });
  console.log(`[Cron] Dagelijkse run ingepland om ${time} (${schedule})`);
}

// Follow-up cron: daily at 10:00
cron.schedule('0 10 * * *', () => {
  console.log('[Cron] Follow-up check gestart');
  runFollowUpJob().catch(err => logError('cron_followup', 'Follow-up cron mislukt', err.message));
});

async function runAutoArchive() {
  const settings = readJSON('settings.json') || {};
  if (!settings.autoArchiveEnabled) return;
  const archiveDays = parseInt(settings.autoArchiveDays) || 30;
  const leads = readJSON('leads.json') || [];
  const now = Date.now();
  let archived = 0;
  for (const lead of leads) {
    if (lead.status !== 'sent' && lead.status !== 'dead') continue;
    if (lead.repliedAt) continue;
    const lastSent = lead.followup2SentAt || lead.followup1SentAt || lead.sentAt || lead.approvedAt;
    if (!lastSent) continue;
    const daysSince = (now - new Date(lastSent).getTime()) / 86400000;
    if (daysSince < archiveDays) continue;
    lead.status = 'archived';
    lead.archivedAt = new Date().toISOString();
    lead.archiveReason = 'geen_reactie';
    if (!lead.history) lead.history = [];
    lead.history.push({ event: `Automatisch gearchiveerd na ${archiveDays} dagen zonder reactie`, at: new Date().toISOString() });
    archived++;
  }
  if (archived > 0) {
    writeJSON('leads.json', leads);
    console.log(`[AutoArchive] ${archived} leads gearchiveerd`);
  }
}

// Auto-archive cron: daily at 10:30
cron.schedule('30 10 * * *', () => {
  console.log('[Cron] Auto-archief check gestart');
  runAutoArchive().catch(err => console.error('[Cron AutoArchive] Fout:', err.message));
});

// Custom domain verification — daily 10:30
cron.schedule('30 10 * * *', async () => {
  try {
    const leads   = readJSON('leads.json') || [];
    let changed   = false;
    for (const lead of leads) {
      if (!lead.customDomain) continue;
      try {
        const domain = lead.customDomain.startsWith('http') ? lead.customDomain : `http://${lead.customDomain}`;
        const r = await fetch(domain, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(8000) });
        const newStatus = r.ok ? 'active' : 'error';
        if (lead.customDomainStatus !== newStatus) { lead.customDomainStatus = newStatus; changed = true; }
      } catch {
        if (lead.customDomainStatus !== 'pending') { lead.customDomainStatus = 'error'; changed = true; }
      }
    }
    if (changed) writeJSON('leads.json', leads);
    console.log('[DomainCheck] Verificatie voltooid');
  } catch (e) { console.log('[DomainCheck] Fout:', e.message); }
});

// Birthday emails — daily 09:05
cron.schedule('5 9 * * *', async () => {
  try {
    const leads = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    if (!isResendReady(settings)) return;
    const today = new Date();
    const mmdd = `${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const birthdays = leads.filter(l => l.clientBirthday && l.clientBirthday.slice(5) === mmdd && l.contactEmail);
    for (const lead of birthdays) {
      await sendEmail({
        to: lead.contactEmail,
        subject: `Fijne verjaardag van ${settings.agencyName || 'Agency AI'}! 🎂`,
        body: `Beste ${lead.contactName || lead.companyName},\n\nVan het hele team van ${settings.agencyName || 'Agency AI'} wensen wij u een hele fijne verjaardag! 🎂\n\nWij werken graag verder samen met ${lead.companyName} en wensen u een succesvol jaar toe.\n\nMet vriendelijke groet,\n${settings.myName || 'Het team'}\n${settings.agencyName || 'Agency AI'}`,
        settings
      }).catch(e => console.log('[Birthday] Email error:', e.message));
    }
    if (birthdays.length) console.log(`[Birthday] Sent ${birthdays.length} birthday emails`);
  } catch(e) { console.log('[Birthday] Cron error:', e.message); }
});

// Data retention — cleanup archived leads older than 90 days (Sunday 03:00)
cron.schedule('0 3 * * 0', async () => {
  try {
    const leads = readJSON('leads.json') || [];
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const before = leads.length;
    const cleaned = leads.filter(l => !(l.status === 'archived' && l.archivedAt && l.archivedAt < cutoff));
    if (cleaned.length < before) {
      writeJSON('leads.json', cleaned);
      const deleted = before - cleaned.length;
      console.log(`[CLEANUP] Deleted ${deleted} old archived leads (>90 days)`);
      addActivity('cleanup', `${deleted} gearchiveerde leads verwijderd (>90 dagen)`);
    }
  } catch(e) { console.log('[CLEANUP] Error:', e.message); }
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

// Weekly client updates: every Friday at 16:00
cron.schedule('0 16 * * 5', () => {
  console.log('[Cron] Weekupdates voor klanten gestart');
  runWeeklyUpdates().catch(err => console.error('[Cron WeeklyUpdate] Fout:', err.message));
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
  jobQueue.add('check_replies', () => checkReplies(), {}).catch(err => console.error('[Cron Reply] Fout:', err.message));
});

// Scheduled send cron: every minute
cron.schedule('* * * * *', async () => {
  const inbox = readJSON('inbox.json') || [];
  const now = new Date();
  const due = inbox.filter(i => i.status === 'scheduled' && i.scheduledAt && new Date(i.scheduledAt) <= now);
  if (!due.length) return;

  const settings = readJSON('settings.json');
  if (!isResendReady(settings)) return;

  const leads = readJSON('leads.json') || [];
  let changed = false;

  for (const item of due) {
    const version = item.sentVersion || 'A';
    const chosenEmail = version === 'B' ? item.emailB : (item.emailA || item.email);
    const idx = inbox.findIndex(i => i.id === item.id);
    try {
      const scheduledToken = item.trackingToken || ('otk-' + item.leadId + '-' + Math.random().toString(36).substr(2, 8));
      if (!item.trackingToken) inbox[idx].trackingToken = scheduledToken;
      const scheduledTo = item.contactEmail || item.email?.to || '';
      if (!scheduledTo) { console.warn(`[Scheduled] Geen contactEmail voor ${item.companyName} — overgeslagen`); continue; }
      await sendEmail({
        to: scheduledTo,
        subject: chosenEmail?.subject || item.email?.subject || 'Outreach email',
        body: chosenEmail?.body || item.email?.body || '',
        settings,
        trackingToken: scheduledToken,
        isColdOutreach: true,
        noCalendly: false
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
        updateMemoryVersion(leads[leadIdx].niche, leads[leadIdx].country, version, 'sent');
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

// Task 43 — Nightly backup at 03:00
cron.schedule('0 3 * * *', () => {
  runNightlyBackup();
});

// Task 29 — Weekly admin report: every Monday 08:00
cron.schedule('0 8 * * 1', () => {
  runWeeklyAdminReport().catch(e => console.error('[Cron WeeklyReport]', e.message));
});

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
        if (lead.contactEmail && isResendReady(settings)) {
          const termDays    = settings.paymentTermDays || 14;
          const { nr: invoiceNr, nextNum: _invNum2 } = generateInvoiceNumber(settings);
          settings.lastInvoiceNumber = _invNum2;
          writeJSON('settings.json', settings);
          const dueDateISO  = new Date(today.getTime() + termDays * 86400000).toISOString();
          const svcsForInv  = monthlyServices.map(s => ({ name: s.name || 'Dienst', price: s.price || 0, billing: 'maandelijks' }));
          const invoiceHtml = buildInvoiceEmailHTML({ invoiceNr, invoiceDate: today.toISOString(), dueDate: dueDateISO, lead, services: svcsForInv, amount: total, settings });
          let finalHtml = invoiceHtml;
          if (url) {
            const btn = `<div style="padding:20px 32px;text-align:center;background:#f5f8ff;border-top:1px solid #e8eef8"><a href="${url}" style="display:inline-block;padding:12px 28px;background:#1a56db;color:#fff;border-radius:8px;font-weight:700;font-size:14px;text-decoration:none">Factuur betalen — €${total}</a></div>`;
            finalHtml = invoiceHtml.replace('</body></html>', `${btn}</body></html>`);
          }
          const pdfBuf = await generateInvoicePDF({ invoiceNr, invoiceDate: today.toISOString(), dueDate: dueDateISO, lead, services: svcsForInv, amount: total, settings });
          const safeCompany = (lead.companyName || 'klant').replace(/[^a-zA-Z0-9]/g, '-');
          await sendEmail({ to: lead.contactEmail, subject: `Factuur ${invoiceNr} — ${settings.agencyName}`, body: `Beste ${lead.contactName || lead.companyName},\n\nBijgevoegd vindt u uw factuur ${invoiceNr}.\n\nMet vriendelijke groet,\n${settings.myName || ''}\n${settings.agencyName}`, html: finalHtml, settings, noCalendly: true, attachments: [{ filename: `Factuur-${invoiceNr}-${safeCompany}.pdf`, content: pdfBuf.toString('base64') }] });
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
      if (!lead.contactEmail || !isResendReady(settings)) continue;
      try {
        const overdueLink = pay.paymentUrl ? `Betaallink: ${pay.paymentUrl}` : (pay.bankDetails ? `IBAN: ${pay.bankDetails.iban}` : '');
        const reminderEmail = await aiJSON(`Schrijf een vriendelijke betalingsherinnering. Klant: ${lead.companyName}. Bedrag: €${pay.amount}. ${daysOverdue} dagen te laat. ${overdueLink} Max 100 woorden. JSON: { "subject": "...", "body": "..." }`);
        await sendEmail({ to: lead.contactEmail, subject: reminderEmail.subject, body: reminderEmail.body, settings });
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

// Client health alerts — daily 09:30
cron.schedule('30 9 * * *', async () => {
  try {
    const leads = readJSON('leads.json') || [];
    const settings = readJSON('settings.json') || {};
    if (!isResendReady(settings)) return;
    const now = Date.now();
    const day = 86400000;
    const issues = [];

    for (const l of leads.filter(l => l.status === 'client')) {
      const overduePayment = (l.payments||[]).find(p => p.status !== 'paid' && p.dueDate && (now - new Date(p.dueDate).getTime()) > 14*day);
      const noPortalActivity = l.portalToken && !l.lastPortalVisit && l.projectStartedAt && (now - new Date(l.projectStartedAt).getTime()) > 30*day;
      const waitingDeliverable = (l.agentDeliverables||[]).find(d => d.status === 'wacht_op_goedkeuring' && d.builtAt && (now - new Date(d.builtAt).getTime()) > 7*day);

      if (overduePayment) issues.push({ company: l.companyName, id: l.id, type: '💰 Betaling verlopen', detail: `Factuur ${overduePayment.invoiceNr||'—'} verlopen op ${new Date(overduePayment.dueDate).toLocaleDateString('nl-NL')}` });
      if (noPortalActivity) issues.push({ company: l.companyName, id: l.id, type: '👻 Geen portaal activiteit', detail: 'Klant heeft portaal >30 dagen niet bezocht' });
      if (waitingDeliverable) issues.push({ company: l.companyName, id: l.id, type: '⏳ Deliverable wacht', detail: `"${waitingDeliverable.service}" wacht >7 dagen op goedkeuring` });
    }

    if (!issues.length) return;

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const issueRows = issues.map(i => `<tr><td style="padding:10px 14px;font-weight:600">${i.company}</td><td style="padding:10px 14px">${i.type}</td><td style="padding:10px 14px;color:#666">${i.detail}</td><td style="padding:10px 14px"><a href="${baseUrl}/app/dashboard" style="color:#6366f1">Open →</a></td></tr>`).join('');

    await sendEmail({
      to: settings.gmailAddress || settings.resendFromAddress || 'info@agencyai.info',
      subject: `Agency AI — ${issues.length} klant${issues.length > 1 ? 'en vereisen' : ' vereist'} aandacht`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#111">Klant gezondheid — actie vereist</h2><p style="color:#555;margin-bottom:20px">${issues.length} issue${issues.length>1?'s':''} vereisen uw aandacht:</p><table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden"><thead><tr style="background:#f9fafb"><th style="padding:10px 14px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Klant</th><th style="padding:10px 14px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Type</th><th style="padding:10px 14px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Detail</th><th style="padding:10px 14px;text-align:left;font-size:12px;color:#888;text-transform:uppercase">Actie</th></tr></thead><tbody>${issueRows}</tbody></table><p style="margin-top:20px;color:#888;font-size:13px">Agency AI — automatisch gegenereerde alert</p></div>`,
      settings,
      noCalendly: true
    }).catch(e => console.log('[HealthAlert] Email error:', e.message));

    console.log(`[HealthAlert] Sent alert for ${issues.length} client issues`);
  } catch(e) { console.log('[HealthAlert] Cron error:', e.message); }
});

// ─── Admin data stats ────────────────────────────────────────────────────────
app.get('/api/admin/migrations', requireAdmin, (req, res) => {
  try {
    const { getDb } = require('./database');
    const db = getDb();
    const applied = db.prepare('SELECT * FROM schema_migrations ORDER BY id').all();
    const migrationsDir = path.join(__dirname, 'migrations');
    const allFiles = fs.existsSync(migrationsDir)
      ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
      : [];
    const appliedSet = new Set(applied.map(m => m.filename));
    const pending    = allFiles.filter(f => !appliedSet.has(f));
    res.json({ applied, pending, total: allFiles.length, upToDate: pending.length === 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/admin/data-stats', requireAdmin, (req, res) => {
  try {
    const leads = readJSON('leads.json') || [];
    const cutoff = new Date(Date.now() - 90 * 86400000).toISOString();
    const archived = leads.filter(l => l.status === 'archived');
    const toCleanup = archived.filter(l => l.archivedAt && l.archivedAt < cutoff);
    const dbPath = path.join(__dirname, 'data', 'agency.db');
    let dbSize = '—';
    try { const s = require('fs').statSync(dbPath); dbSize = (s.size / (1024*1024)).toFixed(1) + ' MB'; } catch {}
    res.json({ total_leads: leads.length, archived_leads: archived.length, leads_to_cleanup: toCleanup.length, database_size_estimate: dbSize });
  } catch(e) { res.json({ error: e.message }); }
});

// ─── Audit log ───────────────────────────────────────────────────────────────
app.get('/api/audit-log', requireAdmin, (req, res) => {
  try {
    const { getDb } = require('./database');
    const dbInst = getDb();
    const rows = dbInst.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100').all();
    res.json(rows);
  } catch(e) {
    res.json([]);
  }
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
// ─── Contacts management ──────────────────────────────────────────────────────
app.get('/api/contacts', authMiddleware, (req, res) => {
  res.json(readJSON('contacts.json') || []);
});

app.patch('/api/contacts/:id', authMiddleware, (req, res) => {
  const contacts = readJSON('contacts.json') || [];
  const idx = contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  const allowed = ['status', 'notes'];
  allowed.forEach(f => { if (req.body[f] !== undefined) contacts[idx][f] = req.body[f]; });
  contacts[idx].updatedAt = new Date().toISOString();
  writeJSON('contacts.json', contacts);
  res.json(contacts[idx]);
});

app.delete('/api/contacts/:id', requireAdmin, (req, res) => {
  const contacts = readJSON('contacts.json') || [];
  const next = contacts.filter(c => c.id !== req.params.id);
  if (next.length === contacts.length) return res.status(404).json({ error: 'Niet gevonden' });
  writeJSON('contacts.json', next);
  res.json({ ok: true });
});

app.post('/api/contacts/:id/to-lead', requireAdmin, async (req, res) => {
  const contacts = readJSON('contacts.json') || [];
  const idx = contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  const c = contacts[idx];
  const leads = readJSON('leads.json') || [];
  const lead = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
    companyName: c.company || c.name,
    contactName: c.name,
    contactEmail: c.email,
    phone: c.phone || '',
    niche: c.service || 'overig',
    city: '',
    score: 5,
    status: 'new',
    source: 'contact_form',
    notes: c.message || '',
    services: [],
    history: [{ event: 'created', date: new Date().toISOString(), note: 'Aangemaakt via contactformulier' }],
    createdAt: new Date().toISOString()
  };
  leads.unshift(lead);
  writeJSON('leads.json', leads);
  contacts[idx].status = 'converted';
  contacts[idx].convertedLeadId = lead.id;
  contacts[idx].updatedAt = new Date().toISOString();
  writeJSON('contacts.json', contacts);
  res.json({ ok: true, leadId: lead.id });
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
  if (!/^[a-z0-9-]+$/.test(req.params.siteSlug)) return res.status(404).send('<h1>Website niet gevonden</h1>');
  const sitePath = path.join(__dirname, 'public', 'sites', req.params.siteSlug, 'index.html');
  if (!fs.existsSync(sitePath)) return res.status(404).send('<h1>Website niet gevonden</h1>');
  res.sendFile(sitePath);
});

// ── GET /api/sites/:slug/domain-config — DNS setup instructions ──────────────
app.get('/api/sites/:slug/domain-config', requireAdmin, (req, res) => {
  if (!/^[a-z0-9-]+$/.test(req.params.slug)) return res.status(404).json({ error: 'Ongeldige slug' });
  const leads = readJSON('leads.json') || [];
  const lead  = leads.find(l => {
    const slug = (l.companyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return slug === req.params.slug || (l.generatedSite?.siteSlug === req.params.slug);
  });
  const host = BASE_URL.replace(/^https?:\/\//, '');
  const siteUrl = `${BASE_URL}/sites/${req.params.slug}/website.html`;
  res.json({
    slug: req.params.slug,
    siteUrl,
    customDomain: lead?.customDomain || null,
    customDomainStatus: lead?.customDomainStatus || 'pending',
    dnsInstructions: {
      cname: { type: 'CNAME', name: 'www', value: host, ttl: 3600 },
      a_record_alternative: { type: 'A', note: 'Gebruik CNAME als uw provider dat ondersteunt' },
      notes: [
        'DNS-wijzigingen kunnen 24–48 uur duren voordat ze actief zijn.',
        'Na het instellen van de DNS verifiëren wij automatisch de koppeling.',
        `Uw website wordt dan bereikbaar op uw eigen domein en verwijst naar: ${siteUrl}`
      ]
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 10 — Subscription management
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/subscriptions/:leadId — get or create subscription for a lead
app.get('/api/subscriptions/:leadId', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const db = getDb();
  let sub = db.prepare('SELECT * FROM subscriptions WHERE project_id = ? LIMIT 1').get(req.params.leadId);
  if (!sub) {
    const leads = readJSON('leads.json') || [];
    const lead = leads.find(l => l.id === req.params.leadId);
    const price = lead?.estimatedValue || 0;
    const nextDate = new Date(); nextDate.setMonth(nextDate.getMonth() + 1);
    db.prepare('INSERT INTO subscriptions (project_id, plan, status, billing_cycle, next_billing_date, price_per_month, services) VALUES (?,?,?,?,?,?,?)').run(
      req.params.leadId, 'basic', 'active', 'monthly',
      nextDate.toISOString().slice(0,10), price,
      JSON.stringify(lead?.services?.map(s => (typeof s === 'string' ? s : s.name)) || [])
    );
    sub = db.prepare('SELECT * FROM subscriptions WHERE project_id = ? LIMIT 1').get(req.params.leadId);
  }
  if (sub && sub.services) try { sub.services = JSON.parse(sub.services); } catch { sub.services = []; }
  res.json(sub);
});

// POST /api/subscriptions/:leadId — create/update subscription
app.post('/api/subscriptions/:leadId', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const db = getDb();
  const { plan, status, billing_cycle, next_billing_date, price_per_month, services } = req.body;
  const existing = db.prepare('SELECT id FROM subscriptions WHERE project_id = ? LIMIT 1').get(req.params.leadId);
  if (existing) {
    db.prepare('UPDATE subscriptions SET plan=?,status=?,billing_cycle=?,next_billing_date=?,price_per_month=?,services=? WHERE project_id=?').run(
      plan, status, billing_cycle, next_billing_date, price_per_month, JSON.stringify(services || []), req.params.leadId);
  } else {
    db.prepare('INSERT INTO subscriptions (project_id,plan,status,billing_cycle,next_billing_date,price_per_month,services) VALUES (?,?,?,?,?,?,?)').run(
      req.params.leadId, plan || 'basic', status || 'active', billing_cycle || 'monthly',
      next_billing_date, price_per_month, JSON.stringify(services || []));
  }
  res.json({ ok: true });
});

// POST /api/portal/:token/subscription-request — client requests change (public)
app.post('/api/portal/:token/subscription-request', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const { type, serviceName, message } = req.body;
  if (!type || !['add_service','pause','cancel'].includes(type)) return res.status(400).json({ error: 'Ongeldig verzoek' });

  const request = { id: crypto.randomUUID(), type, serviceName: serviceName || '', message: message || '', createdAt: new Date().toISOString(), status: 'pending' };
  if (!lead.subscriptionRequests) lead.subscriptionRequests = [];
  lead.subscriptionRequests.push(request);
  writeJSON('leads.json', leads);
  addNotification('client_question', `Abonnement verzoek: ${lead.companyName}`,
    `${type === 'add_service' ? 'Wil ' + serviceName + ' toevoegen' : type === 'pause' ? 'Wil pauzeren' : 'Wil opzeggen'}`,
    lead.id, `project:${lead.id}`);

  const settings = readJSON('settings.json') || {};
  if (isResendReady(settings)) {
    await sendEmail({ to: settings.gmailAddress, subject: `Abonnement verzoek: ${lead.companyName}`,
      body: `<p><strong>${lead.companyName}</strong> heeft een verzoek ingediend:<br><br>Type: <strong>${type}</strong><br>${serviceName ? 'Dienst: ' + serviceName + '<br>' : ''}Bericht: ${message || '—'}</p>`,
      noCalendly: true });
  }
  res.json({ ok: true });
});

// PATCH /api/subscriptions/:leadId/requests/:reqId — admin approve/reject
app.patch('/api/subscriptions/:leadId/requests/:reqId', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const request = (lead.subscriptionRequests || []).find(r => r.id === req.params.reqId);
  if (!request) return res.status(404).json({ error: 'Verzoek niet gevonden' });
  request.status = req.body.status; // 'approved' or 'rejected'
  request.resolvedAt = new Date().toISOString();
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 11 — Conversion funnel events
// ═══════════════════════════════════════════════════════════════════════════════

function trackFunnelEvent(leadId, event, metadata = {}) {
  try {
    const { getDb } = require('./database');
    getDb().prepare('INSERT INTO funnel_events (lead_id, event, metadata) VALUES (?,?,?)').run(
      String(leadId), event, JSON.stringify(metadata));
  } catch (e) { console.warn('[Funnel] Track error:', e.message); }
}

app.get('/api/stats/funnel', requireAdmin, (req, res) => {
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

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 14 — Client service ordering from portal
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/portal/:token/order-service — client orders a new service
app.post('/api/portal/:token/order-service', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const { serviceName, servicePrice } = req.body;
  if (!serviceName) return res.status(400).json({ error: 'Dienst vereist' });

  const { getDb } = require('./database');
  getDb().prepare('INSERT INTO service_orders (project_id, lead_id, service_name, service_price, status) VALUES (?,?,?,?,?)').run(
    lead.id, lead.id, serviceName, servicePrice || 0, 'pending');

  addNotification('client_question', `Nieuwe dienst aanvraag: ${lead.companyName}`,
    `Wil "${serviceName}" toevoegen`, lead.id, `project:${lead.id}`);

  const settings = readJSON('settings.json') || {};
  if (isResendReady(settings)) {
    await sendEmail({ to: settings.gmailAddress,
      subject: `Nieuwe dienst aanvraag van ${lead.companyName}`,
      body: `<p><strong>${esc(lead.companyName)}</strong> wil de volgende dienst toevoegen:<br><br><strong>${esc(serviceName)}</strong>${servicePrice ? ' — €' + servicePrice : ''}</p><p><a href="${BASE_URL}/app">Bekijk in dashboard →</a></p>`,
      noCalendly: true });
  }
  res.json({ ok: true });
});

// GET /api/service-orders — admin view pending orders
app.get('/api/service-orders', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const orders = getDb().prepare('SELECT * FROM service_orders ORDER BY created_at DESC').all();
  res.json(orders);
});

// PATCH /api/service-orders/:id — admin approve/reject
app.patch('/api/service-orders/:id', requireAdmin, async (req, res) => {
  const { getDb } = require('./database');
  const db = getDb();
  const order = db.prepare('SELECT * FROM service_orders WHERE id=?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Niet gevonden' });
  const { status } = req.body;
  db.prepare('UPDATE service_orders SET status=? WHERE id=?').run(status, req.params.id);
  if (status === 'approved') {
    const leads = readJSON('leads.json') || [];
    const lead = leads.find(l => l.id === order.lead_id);
    if (lead) {
      if (!lead.services) lead.services = [];
      lead.services.push({ name: order.service_name, price: order.service_price, billing: 'maandelijks' });
      writeJSON('leads.json', leads);
    }
  }
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 17 — CSV lead import
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/leads/template.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="leads-template.csv"');
  res.send('Bedrijf,Email,Website,Telefoon,Locatie,Niche,Notities\nVoorbeeld BV,info@voorbeeld.nl,https://voorbeeld.nl,0612345678,Amsterdam,beauty,Notitie hier\n');
});

app.post('/api/leads/import', requireAdmin, async (req, res) => {
  const { csv } = req.body;
  if (!csv) return res.status(400).json({ error: 'CSV data vereist' });

  const lines = csv.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return res.status(400).json({ error: 'CSV heeft geen data rijen' });

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const emailIdx    = headers.findIndex(h => h === 'email');
  const bedrijfIdx  = headers.findIndex(h => h === 'bedrijf' || h === 'company');
  const websiteIdx  = headers.findIndex(h => h === 'website');
  const telefoonIdx = headers.findIndex(h => h === 'telefoon' || h === 'phone');
  const locatieIdx  = headers.findIndex(h => h === 'locatie' || h === 'location');
  const nicheIdx    = headers.findIndex(h => h === 'niche');
  const notitiesIdx = headers.findIndex(h => h === 'notities' || h === 'notes');

  if (emailIdx === -1 || bedrijfIdx === -1) {
    return res.status(400).json({ error: 'CSV moet "Bedrijf" en "Email" kolommen hebben' });
  }

  const leads = readJSON('leads.json') || [];
  const existingEmails = new Set(leads.map(l => (l.contactEmail || '').toLowerCase()));
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let imported = 0, skipped = 0;
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    const bedrijf = cells[bedrijfIdx] || '';
    const email   = cells[emailIdx] || '';

    if (!bedrijf) { errors.push(`Rij ${i+1}: Bedrijfsnaam ontbreekt`); continue; }
    if (!email || !emailRegex.test(email)) { errors.push(`Rij ${i+1}: Ongeldig emailadres`); continue; }
    if (existingEmails.has(email.toLowerCase())) { skipped++; continue; }

    const newLead = {
      id: crypto.randomUUID(),
      companyName: bedrijf,
      contactEmail: email,
      websiteUrl: websiteIdx >= 0 ? cells[websiteIdx] : '',
      phone: telefoonIdx >= 0 ? cells[telefoonIdx] : '',
      location: locatieIdx >= 0 ? cells[locatieIdx] : '',
      niche: nicheIdx >= 0 ? cells[nicheIdx] : 'overig',
      notes: notitiesIdx >= 0 ? cells[notitiesIdx] : '',
      status: 'imported',
      score: 5,
      source: 'csv_import',
      createdAt: new Date().toISOString(),
      history: [{ event: 'Geïmporteerd via CSV', at: new Date().toISOString() }]
    };
    leads.push(newLead);
    existingEmails.add(email.toLowerCase());
    trackFunnelEvent(newLead.id, 'lead_found', { source: 'csv_import' });
    imported++;
  }

  writeJSON('leads.json', leads);
  res.json({ imported, skipped, errors: errors.slice(0, 20) });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 18 — Revenue forecasting
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/stats/forecast', requireAdmin, (req, res) => {
  const leads    = readJSON('leads.json') || [];
  const clients  = leads.filter(l => l.status === 'client');
  const settings = readJSON('settings.json') || {};
  const activity = readJSON('activity.json') || [];

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

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 19 — Component library
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/components', requireAdmin, (req, res) => {
  const componentsDir = path.join(__dirname, 'components');
  if (!fs.existsSync(componentsDir)) return res.json([]);
  const files = fs.readdirSync(componentsDir).filter(f => f.endsWith('.html'));
  const components = files.map(f => ({
    name: f.replace('.html', ''),
    filename: f,
    url: `/components/${f}`
  }));
  res.json(components);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TASK 20 — Template library
// ═══════════════════════════════════════════════════════════════════════════════

app.get('/api/templates', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const templates = getDb().prepare('SELECT * FROM website_templates ORDER BY id').all();
  res.json(templates);
});

app.post('/api/templates', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const { name, niche, description, primary_color, accent_color, bg_color, font_heading, font_body, style_description } = req.body;
  if (!name || !niche) return res.status(400).json({ error: 'Naam en niche vereist' });
  const result = getDb().prepare('INSERT INTO website_templates (name,niche,description,primary_color,accent_color,bg_color,font_heading,font_body,style_description) VALUES (?,?,?,?,?,?,?,?,?)').run(
    name, niche, description||'', primary_color||'#111', accent_color||'#6366f1', bg_color||'#fff', font_heading||'Inter', font_body||'Inter', style_description||'');
  res.json({ id: result.lastInsertRowid, ok: true });
});

app.patch('/api/templates/:id', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  const { name, niche, description, primary_color, accent_color, bg_color, font_heading, font_body, style_description } = req.body;
  getDb().prepare('UPDATE website_templates SET name=?,niche=?,description=?,primary_color=?,accent_color=?,bg_color=?,font_heading=?,font_body=?,style_description=? WHERE id=?').run(
    name, niche, description, primary_color, accent_color, bg_color, font_heading, font_body, style_description, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/templates/:id', requireAdmin, (req, res) => {
  const { getDb } = require('./database');
  getDb().prepare('DELETE FROM website_templates WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH 3 — New routes
// ═══════════════════════════════════════════════════════════════════════════════

// Task 22 — Portal profile update
app.put('/api/portal/:token/profile', (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const { contactName, phone, address } = req.body;
  if (contactName) lead.contactName = contactName;
  if (phone)       lead.phone = phone;
  if (address)     lead.address = address;
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Task 23 — Portal password change
app.post('/api/portal/:token/change-password', async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.portalToken === req.params.token);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Wachtwoord minimaal 6 tekens' });
  lead.portalPassword = await bcrypt.hash(newPassword, 10);
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Task 21 — Set portal theme color (admin)
app.patch('/api/leads/:id/portal-theme', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Niet gevonden' });
  leads[idx].portalThemeColor = req.body.color || '#6366f1';
  writeJSON('leads.json', leads);
  res.json({ ok: true });
});

// Task 30 — Export project as PDF
app.post('/api/leads/:id/export-pdf', requireAdmin, async (req, res) => {
  const leads = readJSON('leads.json') || [];
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Niet gevonden' });
  const settings = readJSON('settings.json') || {};

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', () => {
    const buf = Buffer.concat(chunks);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="project-${lead.id}.pdf"`);
    res.send(buf);
  });

  // Header
  doc.fontSize(24).font('Helvetica-Bold').text(settings.agencyName || 'Agency AI', 50, 50);
  doc.fontSize(10).font('Helvetica').fillColor('#6b7280').text(`Project rapport — gegenereerd ${new Date().toLocaleDateString('nl-NL')}`, 50, 80);
  doc.moveTo(50, 100).lineTo(545, 100).strokeColor('#e5e7eb').stroke();

  // Lead info
  doc.fontSize(18).font('Helvetica-Bold').fillColor('#111').text(lead.companyName || 'Onbekend', 50, 120);
  doc.fontSize(11).font('Helvetica').fillColor('#374151');
  doc.text(`Status: ${lead.status || '—'}`, 50, 148);
  doc.text(`Email: ${lead.contactEmail || '—'}`, 50, 163);
  doc.text(`Locatie: ${lead.location || '—'}`, 50, 178);
  doc.text(`Score: ${lead.score || '—'}`, 50, 193);
  doc.text(`Project gestart: ${lead.projectStartedAt ? new Date(lead.projectStartedAt).toLocaleDateString('nl-NL') : '—'}`, 50, 208);

  // Services
  if (lead.services?.length) {
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111').text('Diensten', 50, 240);
    lead.services.forEach((svc, i) => {
      const name = typeof svc === 'string' ? svc : (svc.name || '');
      const price = typeof svc === 'object' ? svc.price : '';
      doc.fontSize(11).font('Helvetica').fillColor('#374151').text(`• ${name}${price ? ` — €${price}` : ''}`, 50, 262 + i * 16);
    });
  }

  // Payments
  const payments = lead.payments || [];
  if (payments.length) {
    const yStart = 380;
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#111').text('Betalingen', 50, yStart);
    payments.slice(0,10).forEach((p, i) => {
      doc.fontSize(10).font('Helvetica').fillColor('#374151')
        .text(`${p.description || 'Betaling'} — €${p.amount || 0} (${p.status || '—'})`, 50, yStart + 22 + i * 16);
    });
  }

  doc.end();
});

// Task 31 — Export statistics as CSV
app.get('/api/stats/export.csv', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
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

// Task 33 — Heatmap best send times
app.get('/api/stats/heatmap', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
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

// Task 34 — Top 10 best performing email subjects
app.get('/api/stats/top-subjects', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
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

// Task 35 — Niche performance comparison
app.get('/api/stats/niches', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
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

// Task 36 — Lead source tracking per run
app.get('/api/stats/sources', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
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

// Task 37 — Blacklist CSV import
app.post('/api/blacklist/import', requireAdmin, (req, res) => {
  const { csv, type = 'domain' } = req.body;
  if (!csv) return res.status(400).json({ error: 'CSV vereist' });
  const blacklist = readJSON('blacklist.json') || [];
  const existing = new Set(blacklist.map(b => b.value?.toLowerCase()));
  const lines = csv.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  let added = 0, skipped = 0;
  lines.forEach(val => {
    const clean = val.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    if (!clean || existing.has(clean)) { skipped++; return; }
    blacklist.unshift({ id: `bl-csv-${Date.now()}-${added}`, type, value: clean, reason: 'CSV import', addedAt: new Date().toISOString() });
    existing.add(clean);
    added++;
  });
  writeJSON('blacklist.json', blacklist);
  res.json({ added, skipped });
});

// Task 38 — Levenshtein duplicate detection
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1}, (_,i) => Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0));
  for (let i=1;i<=m;i++) for (let j=1;j<=n;j++)
    dp[i][j] = a[i-1]===b[j-1] ? dp[i-1][j-1] : 1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}

app.get('/api/leads/fuzzy-duplicates', requireAdmin, (req, res) => {
  const leads = readJSON('leads.json') || [];
  const threshold = parseInt(req.query.threshold) || 3;
  const dupes = [];
  for (let i=0;i<leads.length;i++) {
    for (let j=i+1;j<leads.length;j++) {
      const a = (leads[i].companyName||'').toLowerCase();
      const b = (leads[j].companyName||'').toLowerCase();
      if (Math.abs(a.length-b.length) > threshold*2) continue;
      const dist = levenshtein(a,b);
      if (dist <= threshold && dist > 0) dupes.push({ lead1: leads[i].id, name1: leads[i].companyName, lead2: leads[j].id, name2: leads[j].companyName, distance: dist });
    }
  }
  res.json({ duplicates: dupes.slice(0,50) });
});

// Task 39 — Resend bounce webhook
app.post('/api/webhooks/resend-bounce', async (req, res) => {
  res.json({ ok: true }); // respond immediately
  const event = req.body;
  if (!event?.type?.includes('bounce')) return;
  const email = event?.data?.email_id ? (event?.data?.to?.[0] || '') : (event?.email || '');
  if (!email) return;
  const leads = readJSON('leads.json') || [];
  const idx = leads.findIndex(l => (l.contactEmail||'').toLowerCase() === email.toLowerCase());
  if (idx === -1) return;
  leads[idx].emailBounced = true;
  leads[idx].bouncedAt = new Date().toISOString();
  addLeadHistory(leads, leads[idx].id, { event: 'bounced', label: `Email hard gebounced (Resend webhook)` });
  writeJSON('leads.json', leads);
  const domain = email.split('@')[1];
  if (domain) autoBlacklist(domain, 'Hard bounce via Resend webhook');
});

// Task 40 — Cron log table
function logCron(jobName, status = 'ok', details = '') {
  try {
    const { getDb } = require('./database');
    getDb().prepare('INSERT INTO cron_logs (job_name, status, details) VALUES (?,?,?)').run(jobName, status, details || null);
  } catch {}
}

app.get('/api/cron-logs', requireAdmin, (req, res) => {
  try {
    const { getDb } = require('./database');
    const logs = getDb().prepare('SELECT * FROM cron_logs ORDER BY ran_at DESC LIMIT 200').all();
    res.json(logs);
  } catch { res.json([]); }
});

// Task 41 — Extended health check
app.get('/health', (req, res) => {
  const settings = readJSON('settings.json') || {};
  const hasClaudeKey = !!(process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== 'your_anthropic_api_key_here');
  const gmailOk = isGmailReady(settings);
  const resendOk = isResendReady(settings);
  const pgOk = !!process.env.DATABASE_URL;

  // DB ping
  let dbOk = false;
  try { const { getDb } = require('./database'); getDb().prepare('SELECT 1').get(); dbOk = true; } catch {}

  // IMAP check
  const imapOk = !!(settings.gmailAddress && settings.gmailPassword !== '__encrypted__' ? settings.gmailPassword : null) || !!settings.gmailPasswordEncrypted;

  const status = dbOk && hasClaudeKey ? 'ok' : 'degraded';
  const uptime = process.uptime();
  const h = Math.floor(uptime/3600), m = Math.floor((uptime%3600)/60);
  res.json({
    status,
    uptime: Math.floor(uptime),
    uptimeLabel: `${h}u ${m}m`,
    memUsageMb: Math.round(process.memoryUsage().heapUsed/1024/1024),
    heapUsedMb: Math.round(process.memoryUsage().heapUsed/1024/1024),
    nodeVersion: process.version,
    checks: {
      claude_api: hasClaudeKey ? 'ok' : 'missing',
      resend: resendOk ? 'ok' : 'not_configured',
      gmail_imap: imapOk ? 'configured' : 'not_configured',
      database: dbOk ? 'ok' : 'error',
      postgresql: pgOk ? 'configured' : 'sqlite_only'
    },
    lastRun: (readJSON('runs.json')||[]).slice(-1)[0]?.startedAt || null,
    aiCallsToday: _aiCallLog.filter(t => Date.now()-t < 86400000).length,
    stats: {
      totalLeads: (readJSON('leads.json')||[]).length,
      clients: (readJSON('leads.json')||[]).filter(l=>l.status==='client').length,
      pending: (readJSON('inbox.json')||[]).filter(i=>!i.sentAt&&!i.declinedAt).length
    },
    agencyName: settings.agencyName || 'Agency AI',
    recentErrors: RUN_ERRORS.slice(0,5),
    checkedAt: new Date().toISOString()
  });
});

// Task 42 — Settings export/import
app.get('/api/settings/export', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json') || {};
  const safe = { ...settings };
  delete safe.password; delete safe.gmailPassword; delete safe.gmailPasswordEncrypted;
  delete safe.claudeApiKeyEncrypted; delete safe.resendApiKey; delete safe.stripeSecretKey;
  delete safe.mollieApiKey; delete safe.vapidPrivateKey;
  res.setHeader('Content-Disposition', 'attachment; filename="agency-ai-settings.json"');
  res.json(safe);
});

app.post('/api/settings/import', requireAdmin, (req, res) => {
  const imported = req.body;
  if (!imported || typeof imported !== 'object') return res.status(400).json({ error: 'Ongeldig JSON' });
  const settings = readJSON('settings.json') || {};
  // Only import safe fields
  const SAFE = ['agencyName','myName','myTitle','agencyAddress','calendlyUrl','gaId','services','targetNiches','targetSubNiches','autoArchiveDays','autoArchiveEnabled','fixedCosts','btwEnabled','btwRate','btwNumber'];
  SAFE.forEach(k => { if (imported[k] !== undefined) settings[k] = imported[k]; });
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

// Task 43 — Nightly backup cron (additional cron at 03:00 keeping 7 days)
// Note: main backup cron already exists; this registers an additional export
function runNightlyBackup() {
  try {
    const DATA_BACKUP_DIR = path.join(__dirname, 'data', 'backups');
    if (!fs.existsSync(DATA_BACKUP_DIR)) fs.mkdirSync(DATA_BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().slice(0,10);
    const files = ['leads.json','inbox.json','settings.json','memory.json','blacklist.json','activity.json'];
    const bundle = {};
    files.forEach(f => { try { bundle[f] = readJSON(f); } catch {} });
    fs.writeFileSync(path.join(DATA_BACKUP_DIR, `nightly-${stamp}.json`), JSON.stringify(bundle, null, 2));
    // Keep only 7 most recent nightly backups
    const nightlyFiles = fs.readdirSync(DATA_BACKUP_DIR).filter(f => f.startsWith('nightly-')).sort();
    while (nightlyFiles.length > 7) { fs.unlinkSync(path.join(DATA_BACKUP_DIR, nightlyFiles.shift())); }
    logCron('nightly_backup', 'ok', `${files.length} bestanden`);
    console.log('[Backup] Nachtelijke backup opgeslagen:', stamp);
  } catch (e) { logCron('nightly_backup', 'error', e.message); console.error('[Backup] Fout:', e.message); }
}

// Task 44 — IP whitelist for admin login
function checkIpWhitelist(req, settings) {
  const whitelist = settings.adminIpWhitelist;
  if (!whitelist || !Array.isArray(whitelist) || whitelist.length === 0) return true;
  const clientIp = req.ip || req.connection?.remoteAddress || '';
  return whitelist.some(ip => clientIp.includes(ip));
}

app.get('/api/settings/ip-whitelist', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json') || {};
  res.json({ whitelist: settings.adminIpWhitelist || [] });
});

app.post('/api/settings/ip-whitelist', requireAdmin, (req, res) => {
  const settings = readJSON('settings.json') || {};
  settings.adminIpWhitelist = Array.isArray(req.body.whitelist) ? req.body.whitelist : [];
  writeJSON('settings.json', settings);
  res.json({ ok: true });
});

// Task 29 — Weekly admin report cron (Monday 08:00)
async function runWeeklyAdminReport() {
  const settings = readJSON('settings.json') || {};
  if (!isResendReady(settings)) { logCron('weekly_admin_report','skipped','Resend not ready'); return; }
  const leads = readJSON('leads.json') || [];
  const now = new Date(); const weekAgo = new Date(now - 7*86400000);
  const newLeads = leads.filter(l => l.createdAt && new Date(l.createdAt) > weekAgo);
  const replies = leads.filter(l => l.repliedAt && new Date(l.repliedAt) > weekAgo);
  const revenue = leads.reduce((s,l) => s + (l.payments||[]).filter(p=>p.status==='paid'&&p.paidAt&&new Date(p.paidAt)>weekAgo).reduce((ps,p)=>ps+(p.amount||0),0), 0);
  const openTasks = leads.reduce((s,l)=>s+(l.tasks||[]).filter(t=>t.status!=='klaar').length,0);

  try {
    await sendEmail({ to: settings.gmailAddress, subject: `📊 Weekrapport Agency AI — ${now.toLocaleDateString('nl-NL')}`,
      body: `<h2>Weekrapport</h2><p><strong>Nieuwe leads:</strong> ${newLeads.length}<br><strong>Replies:</strong> ${replies.length}<br><strong>Omzet (week):</strong> €${revenue.toLocaleString('nl-NL')}<br><strong>Open taken:</strong> ${openTasks}</p>`,
      noCalendly: true });
    logCron('weekly_admin_report','ok',`${newLeads.length} leads, ${replies.length} replies`);
  } catch(e) { logCron('weekly_admin_report','error',e.message); }
}

// Task 50 — Changelog entries
const CHANGELOG = [
  { version: '3.0', date: '2026-06-04', items: [
    { type:'new', text: 'Multi-page app met lazy loading (core.js + 12 page files)' },
    { type:'new', text: 'Subscription management met portaal tab' },
    { type:'new', text: 'Conversion funnel analyse met Chart.js' },
    { type:'new', text: 'Unit tests (jest + supertest, 15 tests)' },
    { type:'new', text: 'Onboarding wizard 6 stappen' },
    { type:'new', text: 'Client bijbestellen vanuit portaal' },
    { type:'new', text: 'PWA klantportaal (service worker + offline page)' },
    { type:'improve', text: 'Performance: debounce, apiCache, skeleton loaders' },
    { type:'new', text: 'CSV lead import met drag-drop modal' },
    { type:'new', text: 'Revenue forecasting dashboard met Chart.js' },
    { type:'new', text: '12 HTML component bibliotheek' },
    { type:'new', text: '10 website templates met DB opslag' },
  ]},
  { version: '2.0', date: '2026-06-02', items: [
    { type:'new', text: 'API versioning (X-API-Version header + /api/v1/)' },
    { type:'new', text: 'Database migratie systeem' },
    { type:'new', text: 'Aangepaste domein koppeling' },
    { type:'improve', text: 'API rate limiting met express-rate-limit' },
    { type:'improve', text: 'Routes gesplitst in modules' },
    { type:'new', text: 'Background job queue' },
  ]},
  { version: '1.0', date: '2025-01-01', items: [
    { type:'new', text: 'Initiële release Agency AI' },
    { type:'new', text: '7 AI agents voor lead outreach' },
    { type:'new', text: 'Klantportaal + intake formulier' },
    { type:'new', text: 'Gmail SMTP + Resend integratie' },
  ]}
];

app.get('/api/changelog', requireAdmin, (req, res) => res.json(CHANGELOG));

// ─── SPA fallback ─────────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Niet gevonden' });
  if (req.path.startsWith('/sites/')) return res.status(404).send('<h1>Pagina niet gevonden</h1>');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// â"€â"€â"€ Start â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

pgInitPromise.catch(err => {
  console.error('[DB] pgInitPromise rejected (unexpected):', err?.message || err);
}).finally(() => {
  // Server ALWAYS starts — even if pgInitPromise somehow rejects
});

// ─── WebSocket client registry ────────────────────────────────────────────────
const _wsClients = new Set();

function broadcastWS(event, data = {}) {
  const msg = JSON.stringify({ event, data, ts: Date.now() });
  for (const client of _wsClients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

if (require.main === module || process.env.NODE_ENV !== 'test') pgInitPromise.then(() => {
  const server = app.listen(PORT, () => {
    const s = readJSON('settings.json') || {};
    const runTime      = s.dailyRunTime      || '09:00';
    const briefingTime = s.dailyBriefingTime || '08:45';
    const backupTime   = s.backupTime        || '02:00';
    const hasClaudeKey = !!(process.env.CLAUDE_API_KEY && process.env.CLAUDE_API_KEY !== 'your_anthropic_api_key_here');
    const gmailOk      = isGmailReady(s);
    const pgOk         = !!process.env.DATABASE_URL;

    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║              Agency AI — gestart                 ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  URL      : http://localhost:${PORT}${' '.repeat(Math.max(0, 19 - String(PORT).length))}║`);
    console.log(`║  Data     : ${DATA_DIR.slice(-36).padEnd(36)} ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Claude   : ${hasClaudeKey ? '✓ API key ingesteld    ' : '✗ ONTBREEKT — stel in '}           ║`);
    console.log(`║  Gmail    : ${gmailOk      ? '✓ Geconfigureerd       ' : '✗ Niet ingesteld       '}           ║`);
    console.log(`║  Database : ${pgOk         ? '✓ PostgreSQL (Railway) ' : '✓ SQLite (lokaal)      '}           ║`);
    console.log('╠══════════════════════════════════════════════════╣');
    console.log('║  Actieve cron jobs:                              ║');
    console.log(`║  • Dagelijkse run        : ${runTime} dagelijks        ║`);
    console.log(`║  • Briefing email        : ${briefingTime} dagelijks        ║`);
    console.log(`║  • Follow-up check       : 10:00 dagelijks        ║`);
    console.log(`║  • Upsell check          : 11:00 dagelijks        ║`);
    console.log(`║  • Referral check        : 12:00 dagelijks        ║`);
    console.log(`║  • Reply detectie        : elke 2 uur             ║`);
    console.log(`║  • Geplande emails       : elke minuut            ║`);
    console.log(`║  • Weekupdates klanten   : vr 16:00               ║`);
    console.log(`║  • Maandrapporten        : 1e vd maand 09:00      ║`);
    console.log(`║  • Auto-factuur/herinner : 09:00 dagelijks        ║`);
    console.log(`║  • Backup                : ${backupTime} dagelijks        ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');

    // Run a reply check shortly after startup so any replies that arrived during downtime are detected immediately
    setTimeout(() => {
      console.log('[Startup] Directe reply check uitvoeren...');
      checkReplies().catch(err => console.warn('[Startup] Reply check fout:', err.message));
    }, 5000);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Fout] Poort ${PORT} al in gebruik — slechts één instantie mag draaien`);
      process.exit(1);
    }
    throw err;
  });

  // ── WebSocket server (attached to same HTTP server) ──────────────────────
  const wss = new WebSocket.Server({ server, path: '/ws' });
  wss.on('connection', (ws, req) => {
    // Authenticate via ?token= query param
    const url = new URL(req.url, `http://localhost`);
    const token = url.searchParams.get('token');
    let authenticated = false;
    if (token) {
      try {
        jwt.verify(token, JWT_SECRET);
        authenticated = true;
      } catch {}
    }
    if (!authenticated) { ws.close(4001, 'Unauthorized'); return; }
    _wsClients.add(ws);
    ws.on('close', () => _wsClients.delete(ws));
    ws.on('error', () => _wsClients.delete(ws));
    ws.send(JSON.stringify({ event: 'connected', data: { message: 'Agency AI WebSocket verbonden' } }));
    console.log(`[WS] Client verbonden (${_wsClients.size} actief)`);
  });
  console.log('[WS] WebSocket server actief op /ws');
});

// Export app for testing
module.exports = app;
