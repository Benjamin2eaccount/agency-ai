#!/usr/bin/env node
/**
 * Seed demo accounts and demo data for pitch presentations.
 * Run: node scripts/seed-demo.js
 *
 * Creates:
 *  - 3 demo users (admin, medewerker, klant)
 *  - 12 inbox leads (pending)
 *  - 3 pipeline leads (sent/replied/approved)
 *  - 1 client lead with completed deliverables + portal
 *  - Demo stats / activity data
 */
'use strict';
const bcrypt = require('bcryptjs');
const path   = require('path');

const { readJSON, writeJSON } = require(path.join(__dirname, '..', 'database.js'));

const DEMO_PASS  = 'Demo2026!';
const DEMO_HASH  = bcrypt.hashSync(DEMO_PASS, 12);
const PORTAL_TOKEN = 'demo-klant-portal-2026';

// ─── helpers ─────────────────────────────────────────────────────────────────
function ago(days) {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── STEP 1 — users ──────────────────────────────────────────────────────────
function seedUsers() {
  const users = (readJSON('users.json') || []).filter(u => !u.isDemo);
  users.push(
    { id: 'demo-admin',      username: 'admin@demo.agencyai.info',      password: DEMO_HASH, name: 'Agency AI Demo', role: 'admin',    isDemo: true, createdAt: ago(60) },
    { id: 'demo-medewerker', username: 'medewerker@demo.agencyai.info', password: DEMO_HASH, name: 'Demo Medewerker', role: 'employee', isDemo: true, createdAt: ago(60) },
    { id: 'demo-klant',      username: 'klant@demo.agencyai.info',      password: DEMO_HASH, name: 'Demo Klant',      role: 'client',   isDemo: true, createdAt: ago(60) }
  );
  writeJSON('users.json', users);
  console.log('✓ 3 demo users created');
}

// ─── STEP 2 — leads + inbox + portal ─────────────────────────────────────────
function seedLeads() {
  const existingLeads = (readJSON('leads.json') || []).filter(l => !l.isDemo);
  const existingInbox = (readJSON('inbox.json') || []).filter(i => !i.isDemo);

  // ── inbox leads (pending, shown in the approval inbox) ──────────────────
  const INBOX_SPECS = [
    { id: 'demo-bloom',    company: 'Bloom Beauty Studio',      name: 'Sophie van Dijk',   email: 'sophie@bloombeauty.nl',       city: 'Amsterdam',  niche: 'beauty',       sub: 'kapsalon',   score: 8.7, val: 850,  days: 1,  subj: 'Bloom Beauty — 3x meer boekingen mogelijk',       services: [{ name: 'Instagram Management', price: 450, billing: 'maandelijks' }, { name: 'Google Ads beheer', price: 395, billing: 'maandelijks' }], probs: ['Weinig Instagram volgers', 'Geen online boekingssysteem'] },
    { id: 'demo-trattoria',company: 'Trattoria Bella Vista',    name: 'Marco Rossi',       email: 'info@trattoriabellavista.nl', city: 'Rotterdam',  niche: 'food',         sub: 'restaurant', score: 7.9, val: 695,  days: 1,  subj: 'Meer reserveringen voor Trattoria Bella Vista?',  services: [{ name: 'Social Media Management', price: 495, billing: 'maandelijks' }], probs: ['Geen online reserveringen', 'Weinig Google reviews'] },
    { id: 'demo-fitlife',  company: 'FitLife Personal Training', name: 'Daan de Vries',   email: 'daan@fitlifetraining.nl',     city: 'Utrecht',    niche: 'fitness',      sub: 'personal',   score: 9.1, val: 995,  days: 2,  subj: 'FitLife — automatisch nieuwe klanten werven?',    services: [{ name: 'Marketing Automatisering', price: 595, billing: 'maandelijks' }, { name: 'Website bouwen', price: 895, billing: 'eenmalig' }], probs: ['Weinig nieuwe klanten', 'Geen geautomatiseerde opvolging'] },
    { id: 'demo-vdberg',   company: 'Van den Berg Makelaardij', name: 'Peter van den Berg',email: 'peter@vdbergmakelaardij.nl', city: 'Den Haag',   niche: 'real_estate',  sub: 'makelaar',   score: 7.2, val: 595,  days: 2,  subj: 'Meer woningzoekenden voor Van den Berg?',         services: [{ name: 'SEO Optimalisatie', price: 350, billing: 'maandelijks' }], probs: ['Lage zoekmachineposities', 'Weinig organisch verkeer'] },
    { id: 'demo-cafe',     company: 'Café De Hoek',             name: 'Jan Bakker',        email: 'info@cafedehoek.nl',         city: 'Haarlem',    niche: 'food',         sub: 'café',       score: 6.8, val: 495,  days: 3,  subj: 'Café De Hoek — meer gasten via social?',          services: [{ name: 'Facebook Ads beheer', price: 295, billing: 'maandelijks' }], probs: ['Geen actieve social media', 'Lage online zichtbaarheid'] },
    { id: 'demo-karin',    company: 'Studio Karin Kap',         name: 'Karin Smits',       email: 'karin@studiokarin.nl',       city: 'Groningen',  niche: 'beauty',       sub: 'kapsalon',   score: 8.4, val: 795,  days: 3,  subj: 'Studio Karin — automatisch agenda vullen?',       services: [{ name: 'AI Booking Systeem', price: 195, billing: 'maandelijks' }, { name: 'Instagram Management', price: 450, billing: 'maandelijks' }], probs: ['Agenda niet goed gevuld', 'Mist online boekingssysteem'] },
    { id: 'demo-garage',   company: 'AutoGarage Smits',         name: 'Rob Smits',         email: 'rob@garagessmits.nl',        city: 'Eindhoven',  niche: 'automotive',   sub: 'garage',     score: 7.6, val: 645,  days: 4,  subj: 'Garage Smits — meer werkplaatsbezoekers?',        services: [{ name: 'Google Ads beheer', price: 395, billing: 'maandelijks' }, { name: 'Lokale SEO', price: 550, billing: 'eenmalig' }], probs: ['Concurrent scoort beter in Google', 'Weinig aanvragen'] },
    { id: 'demo-yoga',     company: 'Yoga & Welzijn Centrum',   name: 'Lisa Harmsen',      email: 'lisa@yogawelzijn.nl',        city: 'Amsterdam',  niche: 'wellness',     sub: 'yoga',       score: 8.9, val: 945,  days: 5,  subj: 'Yoga & Welzijn — 40% meer leden mogelijk?',       services: [{ name: 'Marketing Automatisering', price: 595, billing: 'maandelijks' }, { name: 'AI Chatbot', price: 195, billing: 'maandelijks' }], probs: ['Hoog klantverloop', 'Geen geautomatiseerde herinneringen'] },
    { id: 'demo-bouw',     company: 'BouwService Noord',        name: 'Henk Jansen',       email: 'henk@bouwservicenoord.nl',   city: 'Zwolle',     niche: 'construction', sub: 'verbouw',    score: 7.1, val: 550,  days: 5,  subj: 'BouwService Noord — meer offerteaanvragen?',      services: [{ name: 'SEO Optimalisatie', price: 350, billing: 'maandelijks' }, { name: 'Website verbeteren', price: 495, billing: 'eenmalig' }], probs: ['Website scoort slecht', 'Weinig online aanvragen'] },
    { id: 'demo-bakkerij', company: 'Bakkerij Vers & Puur',     name: 'Marie de Boer',     email: 'marie@versenpuur.nl',        city: 'Rotterdam',  niche: 'food',         sub: 'bakkerij',   score: 6.5, val: 445,  days: 6,  subj: 'Bakkerij Vers & Puur — meer vaste klanten?',      services: [{ name: 'Email Marketing', price: 295, billing: 'maandelijks' }], probs: ['Geen klantendatabase', 'Nauwelijks terugkerende klanten'] },
    { id: 'demo-techstart',company: 'TechStart BV',             name: 'Tom Verhoeven',     email: 'tom@techstart.nl',           city: 'Amsterdam',  niche: 'tech',         sub: 'saas',       score: 9.3, val: 1250, days: 6,  subj: 'TechStart — demo aanvragen automatiseren?',       services: [{ name: 'Marketing Automatisering', price: 595, billing: 'maandelijks' }, { name: 'AI Chatbot', price: 195, billing: 'maandelijks' }, { name: 'CRM Integratie', price: 895, billing: 'eenmalig' }], probs: ['Demo pipeline loopt niet efficiënt', 'Weinig marketing leads'] },
    { id: 'demo-foto',     company: 'Fotostudio Lens',          name: 'Anna Bergman',      email: 'anna@fotostudiolens.nl',     city: 'Utrecht',    niche: 'photography',  sub: 'portret',    score: 7.8, val: 625,  days: 7,  subj: 'Fotostudio Lens — meer boekingen via Instagram?', services: [{ name: 'Instagram Management', price: 450, billing: 'maandelijks' }], probs: ['Inconsistent Instagram account', 'Weinig online bekendheid'] },
  ];

  // ── pipeline leads ─────────────────────────────────────────────────────────
  const PIPELINE_SPECS = [
    { id: 'demo-monteur',  company: 'Monteur Direct',      name: 'Erik Visser',  email: 'erik@monteurdirect.nl',   city: 'Amsterdam', niche: 'automotive', sub: 'monteur', score: 8.2, val: 745,  status: 'sent',     days: 5,  sentAt: ago(5) },
    { id: 'demo-huisdier', company: 'Huisdier Paradijs',   name: 'Sandra Kok',   email: 'sandra@huisdierparadijs.nl', city: 'Breda',  niche: 'retail',     sub: 'dierenwinkel', score: 8.8, val: 895, status: 'replied', days: 8, sentAt: ago(8), repliedAt: ago(3) },
    { id: 'demo-digital',  company: 'Digital Media Groep', name: 'Kevin van Loon',email: 'kevin@digitalmediagroep.nl',city: 'Amsterdam',niche: 'marketing', sub: 'bureau', score: 7.5, val: 1095, status: 'approved', days: 10 },
  ];

  const newLeads = [];
  const newInbox = [];

  function buildLead(spec, status) {
    const emailA = {
      subject: spec.subj || `${spec.company} — meer klanten mogelijk?`,
      body: `Beste ${spec.name},\n\nIk zag dat ${spec.company} al mooie dingen doet in ${spec.city}, maar online nog meer uit de kast kan halen.\n\nOnze aanpak: ${(spec.services || []).map(s => s.name).join(' + ')} — zodat u zich kunt richten op wat u goed doet.\n\nZou u 20 minuten hebben voor een kort gesprek?\n\nMet vriendelijke groet,\nAgency AI Demo`
    };
    return {
      id:            spec.id,
      companyName:   spec.company,
      contactName:   spec.name,
      contactEmail:  spec.email,
      websiteUrl:    `https://www.${spec.id.replace('demo-', '')}.nl`,
      phone:         '+31 6 1' + rand(1000000, 9999999),
      location:      spec.city,
      niche:         spec.niche,
      subNiche:      spec.sub || spec.niche,
      language:      'nl',
      country:       'NL',
      score:         spec.score,
      urgency:       spec.score >= 8 ? 'hoog' : spec.score >= 6 ? 'medium' : 'laag',
      status,
      estimatedValue: spec.val,
      emailSource:   'verified',
      emailVerified: true,
      source:        'demo',
      isDemo:        true,
      createdAt:     ago(spec.days),
      sentAt:        spec.sentAt   || null,
      repliedAt:     spec.repliedAt || null,
      projectStartedAt: spec.projectStartedAt || null,
      problems:      spec.probs || ['Weinig online zichtbaarheid', 'Geen actieve social media'],
      services:      spec.services || [{ name: 'Social Media Management', price: 450, billing: 'maandelijks' }],
      emailA,
      emailB:        emailA,
      subjectOptions: [emailA.subject, `${spec.company} — 3x meer bereik`, `Tip voor ${spec.company} in ${spec.city}`],
      website: { speedScore: rand(45, 85), hasSocialLinks: true, hasContactForm: true },
      social:  { engagementRate: (rand(5, 30) / 10).toFixed(1), postFrequency: 'wekelijks', growthPotential: spec.score >= 8 ? 'hoog' : 'medium' },
      history: [
        { event: 'created', label: 'Lead toegevoegd via AI run', time: ago(spec.days) },
        ...(spec.sentAt ? [{ event: 'sent', label: 'Email verstuurd', time: spec.sentAt }] : []),
        ...(spec.repliedAt ? [{ event: 'replied', label: 'Klant heeft gereageerd', time: spec.repliedAt }] : []),
      ],
      portalToken: spec.portalToken || null,
      currentPhase: spec.currentPhase || null,
      payments: spec.payments || [],
      agentDeliverables: spec.agentDeliverables || [],
      projectServices: spec.projectServices || null,
      clientMessages: spec.clientMessages || [],
      portalChat: spec.portalChat || [],
      portalWelcomeMessage: spec.portalWelcomeMessage || null,
    };
  }

  // inbox items
  for (const spec of INBOX_SPECS) {
    const lead = buildLead(spec, 'pending');
    newLeads.push(lead);
    newInbox.push({
      id:            spec.id,
      leadId:        spec.id,
      status:        'pending',
      type:          'new',
      isDemo:        true,
      companyName:   spec.company,
      contactEmail:  spec.email,
      location:      spec.city,
      niche:         spec.niche,
      subNiche:      spec.sub || spec.niche,
      score:         spec.score,
      estimatedValue: spec.val,
      problems:      lead.problems,
      services:      lead.services,
      emailA:        lead.emailA,
      emailB:        lead.emailA,
      subjectOptions: lead.subjectOptions,
      createdAt:     lead.createdAt,
    });
  }

  // pipeline leads
  for (const spec of PIPELINE_SPECS) {
    newLeads.push(buildLead(spec, spec.status));
  }

  // ── client lead with portal ─────────────────────────────────────────────────
  const portalLead = buildLead({
    id:    'demo-klant-portal',
    company: 'Demo Project — Website & Marketing',
    name:  'Alex Janssen',
    email: 'klant@demo.agencyai.info',
    city:  'Amsterdam',
    niche: 'retail',
    sub:   'webshop',
    score: 9.2,
    val:   1500,
    days:  30,
    sentAt: ago(30),
    repliedAt: ago(28),
    projectStartedAt: ago(25),
    portalToken:  PORTAL_TOKEN,
    currentPhase: 3,
    portalWelcomeMessage: 'Welkom bij uw klantportaal! Fase 3 is gestart — uw website en SEO rapport zijn klaar voor review. Bekijk ze hieronder.',
    projectServices: [
      { name: 'Website bouwen',          price: 895, billing: 'eenmalig'   },
      { name: 'SEO Optimalisatie',       price: 350, billing: 'maandelijks' },
      { name: 'Social Media Management', price: 495, billing: 'maandelijks' },
    ],
    services: [
      { name: 'Website bouwen',          price: 895, billing: 'eenmalig'   },
      { name: 'SEO Optimalisatie',       price: 350, billing: 'maandelijks' },
      { name: 'Social Media Management', price: 495, billing: 'maandelijks' },
    ],
    probs: ['Geen professionele website', 'Lage Google-positie', 'Weinig organic traffic'],
    payments: [{
      id:          'demo-payment-1',
      description: 'Website bouwen + SEO opstartpakket',
      amount:      1500,
      type:        'once',
      billing:     'eenmalig',
      method:      'bank_transfer',
      status:      'paid',
      paymentUrl:  null,
      dueDate:     ago(20),
      paidAt:      ago(19),
      createdAt:   ago(25),
      invoiceNr:   'FAC-2026-001',
    }],
    agentDeliverables: [
      {
        id:              'demo-del-website',
        service:         'Website bouwen',
        type:            'code',
        deliverableType: 'HTML_BUILD',
        status:          'approved',
        clientVisible:   true,
        url:             'https://www.agencyai.info',
        builtAt:         ago(20),
        approvedAt:      ago(18),
      },
      {
        id:              'demo-del-seo',
        service:         'SEO Optimalisatie',
        type:            'document',
        deliverableType: 'STRATEGY_DOCUMENT',
        status:          'approved',
        clientVisible:   true,
        content:         '# SEO Rapport — Demo Project\n\n## Samenvatting\nNa analyse van uw website zijn 15 verbeterpunten gevonden. Met onze aanpak verwachten wij een stijging van 40–60% in organisch verkeer binnen 3 maanden.\n\n## Gevonden problemen\n1. Titeltags niet geoptimaliseerd\n2. Geen meta-descriptions ingesteld\n3. Trage laadtijd (3,2s → doel: <2s)\n4. Ontbrekende alt-teksten op afbeeldingen\n\n## Actieplan\n- Week 1–2: Technische SEO fixes\n- Week 3–4: Content optimalisatie\n- Maand 2: Linkbuilding campagne starten',
        builtAt:         ago(19),
        approvedAt:      ago(17),
      },
    ],
    clientMessages: [
      { id: 'cm-1', name: 'Alex Janssen', message: 'De website ziet er geweldig uit! Kunnen we de headerkleur nog iets aanpassen?', time: ago(16) },
    ],
    portalChat: [
      { id: 'pc-1', from: 'client', name: 'Alex Janssen', message: 'De website ziet er geweldig uit! Kunnen we de headerkleur nog iets aanpassen?', time: ago(16) },
      { id: 'pc-2', from: 'admin',  name: 'Agency AI Demo', message: 'Zeker! We passen dit vandaag nog aan. U ontvangt een notificatie zodra de update live staat.', time: ago(15) },
    ],
  }, 'client');

  newLeads.push(portalLead);

  writeJSON('leads.json', [...existingLeads, ...newLeads]);
  writeJSON('inbox.json', [...existingInbox, ...newInbox]);
  console.log(`✓ ${newLeads.length} demo leads created (${INBOX_SPECS.length} inbox, ${PIPELINE_SPECS.length} pipeline, 1 client/portal)`);
  console.log(`✓ ${newInbox.length} inbox items created`);
  console.log(`  Portal token: ${PORTAL_TOKEN}`);
}

// ─── STEP 3 — stats + activity (fill charts) ─────────────────────────────────
function seedStats() {
  // Activity log — 30 days of AI runs + email sends
  const existing = (readJSON('activity.json') || []).filter(a => !a.isDemo);
  const demoActivity = [];
  for (let i = 30; i >= 0; i--) {
    demoActivity.push({
      id:        `demo-ai-${i}`,
      type:      'ai',
      label:     `AI outreach run dag ${i}`,
      isDemo:    true,
      timestamp: ago(i),
      tokensIn:  rand(8000, 20000),
      tokensOut: rand(2000, 6000),
      cost:      parseFloat((rand(15, 55) / 100).toFixed(3)),
    });
    if (i % 2 === 0) {
      demoActivity.push({
        id:        `demo-email-${i}`,
        type:      'email',
        label:     `Outreach email verstuurd dag ${i}`,
        isDemo:    true,
        timestamp: ago(i),
        tokensIn:  0, tokensOut: 0, cost: 0,
      });
    }
  }
  writeJSON('activity.json', [...existing, ...demoActivity]);

  // Stats + weekly lead counts for line chart
  const weeklyData = [];
  for (let i = 29; i >= 0; i--) {
    weeklyData.push({ date: new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10), count: rand(2, 12) });
  }
  const existing_stats = readJSON('stats.json') || {};
  writeJSON('stats.json', {
    ...existing_stats,
    leadsFound:    54,
    emailsSent:    37,
    replies:       8,
    pipelineValue: 18450,
    weeklyData,
    abStats:       { aApproved: 22, bApproved: 15 },
  });
  console.log('✓ Demo stats + 31-day activity log created');
}

// ─── main ─────────────────────────────────────────────────────────────────────
(function main() {
  console.log('\n🌱 Seeding demo data...\n');
  seedUsers();
  seedLeads();
  seedStats();
  console.log('\n✅ Done!\n');
  console.log('Demo accounts:');
  console.log(`  Admin:      admin@demo.agencyai.info    / ${DEMO_PASS}`);
  console.log(`  Medewerker: medewerker@demo.agencyai.info / ${DEMO_PASS}`);
  console.log(`  Klant:      portal token = ${PORTAL_TOKEN}`);
  console.log('\nDemo routes (after server restart):');
  console.log('  GET /demo            → landing page');
  console.log('  GET /demo/admin      → auto-login as admin');
  console.log('  GET /demo/medewerker → auto-login as medewerker');
  console.log(`  GET /demo/klant      → portal redirect`);
  process.exit(0);
})();
