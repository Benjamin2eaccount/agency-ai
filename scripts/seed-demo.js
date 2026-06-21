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

  // ── Outreach content per inbox lead (opener, LinkedIn DM, voicenote) ─────
  const DEMO_OUTREACH = {
    'demo-bloom':    { opener:'Jullie signature balayage is populair op Instagram — 4.8 sterren op Google ook.', dm:'Hi Sophie, ik zag Bloom Beauty op Google Maps — prachtige reviews! We helpen salons met Instagram management waardoor ze 3x meer online boekingen krijgen. Kan ik even bellen?', voice:'Hey Sophie, met Agency AI. Ik zag dat Bloom Beauty super mooie reviews heeft maar nog weinig zichtbaar is op Instagram. Wij helpen salons met posts en advertenties zodat je agenda automatisch vol loopt. Zal ik een voorstel sturen?' },
    'demo-trattoria':{ opener:'De foto\'s op jullie site zien er heerlijk uit — maar lastig te vinden bij "restaurant Rotterdam" op Google.', dm:'Hi Marco, Trattoria Bella Vista ziet er fantastisch uit! We helpen restaurants met social media waardoor ze 40% meer reserveringen krijgen. Even bellen?', voice:'Hey Marco, met Agency AI. Ik keek naar Trattoria Bella Vista en jullie hebben echt een mooi concept. Maar online worden jullie nog niet goed gevonden. Wij kunnen dat veranderen met social media. Mag ik een voorstel sturen?' },
    'demo-fitlife':  { opener:'Zag dat jullie vorig jaar een nieuwe locatie geopend hebben — dat gaat goed!', dm:'Hi Daan, FitLife ziet er top uit! We automatiseren klantwerving voor personal trainers — gemiddeld 8 nieuwe klanten per maand. Kort gesprekje?', voice:'Hey Daan, met Agency AI. Ik zag dat FitLife mooie resultaten boekt maar online nog niet echt zichtbaar is. Wij bouwen websites en automatiseren de klantwerving zodat jij je op training kunt richten. Interesse?' },
    'demo-vdberg':   { opener:'Jullie hebben mooie panden in portefeuille, maar "makelaar Den Haag" toont jullie niet op pagina 1.', dm:'Hi Peter, Van den Berg Makelaardij — mooi aanbod! Met SEO optimalisatie brengen we jullie naar pagina 1 van Google. Even sparren?', voice:'Hey Peter, met Agency AI. Ik googelde "makelaar Den Haag" en jullie kwamen niet in de top 10. Zonde want jullie hebben een sterk aanbod. Met SEO kunnen we dat fixen. Mag ik een voorstel sturen?' },
    'demo-cafe':     { opener:'Jullie worden goed beoordeeld op TripAdvisor, maar op Facebook en Instagram is het stil.', dm:'Hi Jan, Café De Hoek is een fijne plek! We helpen horeca met Facebook ads waardoor er meer gasten binnenkomen. Zullen we bellen?', voice:'Hey Jan, met Agency AI. Café De Hoek heeft goede reviews maar bijna geen social media. Met gerichte Facebook ads kunnen we meer lokale gasten trekken. Zal ik even langskomen?' },
    'demo-karin':    { opener:'Klanten moeten bellen voor een afspraak — een online boekingssysteem scheelt veel tijd.', dm:'Hi Karin, Studio Karin ziet er prachtig uit! We bouwen AI boekingssystemen waardoor klanten 24/7 online kunnen reserveren. Interesse?', voice:'Hey Karin, met Agency AI. Ik zag dat klanten bij Studio Karin nog moeten bellen voor een afspraak. Wij koppelen een online boekingssysteem aan je Instagram zodat klanten direct boeken. Meer weten?' },
    'demo-garage':   { opener:'Jullie concurrent Autoservice Eindhoven staat #1 in Google — maar hun reviews zijn slechter dan jullie.', dm:'Hi Rob, Garage Smits heeft sterke reviews! Met Google Ads en lokale SEO komen jullie boven de concurrent. Kort gesprekje?', voice:'Hey Rob, met Agency AI. Jullie concurrent staat boven Garage Smits in Google terwijl jullie betere reviews hebben. Met de juiste aanpak draaien we dat om. Zal ik een voorstel sturen?' },
    'demo-yoga':     { opener:'Jullie hebben 120+ leden maar ik zie geen automatische herinneringen — dat verklaart het verloop.', dm:'Hi Lisa, Yoga & Welzijn Centrum ziet er geweldig uit! We helpen studio\'s met marketing automatisering om leden vast te houden. Even bellen?', voice:'Hey Lisa, met Agency AI. Yoga & Welzijn heeft veel leden maar ook hoog verloop. Wij bouwen AI chatbots en automatiseren herinneringen zodat leden blijven terugkomen. Mag ik meer vertellen?' },
    'demo-bouw':     { opener:'Jullie website laadt in 4,2 seconden — dat kost waarschijnlijk de helft van de bezoekers.', dm:'Hi Henk, BouwService Noord doet mooi werk! Met een snellere website en SEO krijgen jullie meer offerteaanvragen. Interesse?', voice:'Hey Henk, met Agency AI. Ik keek naar jullie website en die is echt traag. Dat kost klanten. Met een nieuwe website en SEO genereren we meer offertes. Zal ik een voorstel sturen?' },
    'demo-bakkerij': { opener:'Jullie croissants hebben 5 sterren op Google — maar jullie verzamelen geen emailadressen.', dm:'Hi Marie, Bakkerij Vers & Puur klinkt heerlijk! Met email marketing brengen jullie vaste klanten terug. Zullen we even praten?', voice:'Hey Marie, met Agency AI. Vers & Puur heeft fantastische reviews maar geen manier om klanten terug te laten komen. Met email marketing lossen we dat op. Interesse?' },
    'demo-techstart':{ opener:'Jullie productpagina ziet er sterk uit, maar het demo-aanvraagproces heeft 5 stappen — dat schrikt af.', dm:'Hi Tom, TechStart is een interessant product! We automatiseren demo-aanvragen en leads met AI. Kunnen we bellen deze week?', voice:'Hey Tom, met Agency AI. TechStart heeft een mooi product maar het demo-proces is te lang. Wij bouwen AI chatbots en automatiseren de hele funnel. Zal ik een voorstel sturen?' },
    'demo-foto':     { opener:'Jullie portfolio op de website is prachtig, maar op Instagram posten jullie maar 2x per maand.', dm:'Hi Anna, Fotostudio Lens maakt prachtig werk! Met consistente Instagram posts krijg je veel meer boekingen. Even praten?', voice:'Hey Anna, met Agency AI. Jullie portfolio is echt mooi maar op Instagram is het stil. Met regelmatige posts en de juiste hashtags genereren we meer boekingen. Interesse?' },
  };

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
    const outreach = DEMO_OUTREACH[spec.id] || {};
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
      emailOpener:   outreach.opener || null,
      linkedinDm:    outreach.dm || null,
      voicenoteScript: outreach.voice || null,
      website: { speedScore: rand(45, 85), hasSocialLinks: true, hasContactForm: true },
      social:  { engagementRate: (rand(5, 30) / 10).toFixed(1), postFrequency: 'wekelijks', growthPotential: spec.score >= 8 ? 'hoog' : 'medium' },
      history: spec.history || [
        { event: 'created', label: 'Lead toegevoegd via AI run', time: ago(spec.days) },
        ...(spec.sentAt ? [{ event: 'sent', label: 'Email verstuurd', time: spec.sentAt }] : []),
        ...(spec.repliedAt ? [{ event: 'replied', label: 'Klant heeft gereageerd', time: spec.repliedAt }] : []),
      ],
      portalToken: spec.portalToken || null,
      currentPhase: spec.currentPhase || null,
      portalPasswordSet: spec.portalPasswordSet || false,
      intakeToken: spec.intakeToken || null,
      intakeSubmittedAt: spec.intakeSubmittedAt || null,
      intakeAnswers: spec.intakeAnswers || null,
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
      emailOpener:   lead.emailOpener,
      linkedinDm:    lead.linkedinDm,
      voicenoteScript: lead.voicenoteScript,
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
    portalPasswordSet: true,
    portalWelcomeMessage: 'Welkom bij uw klantportaal! Fase 3 is gestart — uw website en SEO rapport zijn klaar voor review. Bekijk ze hieronder.',
    intakeToken: 'demo-intake-portal',
    intakeSubmittedAt: ago(24),
    intakeAnswers: {
      'Wat is uw huidige website?': 'Oude WordPress site, niet responsive, 5 jaar oud.',
      'Welke diensten/producten biedt u aan?': 'Retail webshop met lifestyle producten. Circa 200 artikelen.',
      'Doelgroep?': 'Mannen en vrouwen 25-45, geïnteresseerd in design en lifestyle producten.',
      'Heeft u een huisstijl?': 'Minimalistisch, wit met donkerblauw accent (#1e3a5f).',
      'Wat zijn uw belangrijkste doelen?': 'Meer organisch verkeer, hogere Google positie, professionele uitstraling.',
    },
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

  // ── 3 FULLY FLESHED CLIENT PROJECTS ──────────────────────────────────────

  // PROJECT 1: Bella Cucina — Italian restaurant, Amsterdam
  const project1 = buildLead({
    id:'demo-project-bella', company:'Bella Cucina', name:'Giovanni Moretti',
    email:'giovanni@bellacucina.nl', city:'Amsterdam', niche:'food', sub:'restaurant',
    score:9.0, val:1290, days:21, sentAt:ago(21), repliedAt:ago(19), projectStartedAt:ago(17),
    portalToken:'demo-bella-cucina-2026', currentPhase:4, portalPasswordSet:true,
    portalWelcomeMessage:'Welkom Giovanni! Uw nieuwe website en social media content zijn klaar. Bekijk alles hieronder en laat weten als u vragen heeft.',
    projectServices:[
      {name:'Professionele website bouwen',price:995,billing:'eenmalig'},
      {name:'AI content voor social media',price:295,billing:'maandelijks'},
    ],
    services:[{name:'Professionele website bouwen',price:995,billing:'eenmalig'},{name:'AI content voor social media',price:295,billing:'maandelijks'}],
    probs:['Verouderde website','Geen social media strategie','Menu niet online te vinden'],
    intakeToken:'demo-intake-bella', intakeSubmittedAt:ago(16),
    intakeAnswers:{
      'Wat is uw huidige website URL?':'www.bellacucina-oud.nl (verouderd, niet responsive)',
      'Welke sfeer wilt u uitstralen?':'Warm, Italiaans, authentiek. Donkere kleuren met goud accenten.',
      'Heeft u een logo en huisstijl?':'Ja, ons logo is een gouden olijftak. Kleuren: donkergroen (#1a3a2a) en goud (#c9a84c).',
      'Wat zijn uw populairste gerechten?':'Ossobuco, huisgemaakte pasta, tiramisu. Alles vers bereid.',
      'Openingstijden?':'Dinsdag t/m zondag 17:00-23:00, lunch vrijdag t/m zondag 12:00-15:00.',
      'Welke social media kanalen gebruikt u?':'Instagram (300 volgers) en Facebook (150 likes). Posten we bijna nooit op.',
      'Doelgroep voor social media?':'Foodies 25-55 jaar in Amsterdam, koppels voor een avondje uit.',
    },
    payments:[{id:'demo-pay-bella-1',description:'Website bouwen + eerste maand social media',amount:1290,type:'once',billing:'eenmalig',method:'bank_transfer',status:'paid',paymentUrl:null,dueDate:ago(14),paidAt:ago(13),createdAt:ago(17),invoiceNr:'FAC-2026-004'}],
    agentDeliverables:[
      {id:'demo-del-bella-website',service:'Professionele website bouwen',type:'code',deliverableType:'HTML_BUILD',status:'approved',clientVisible:true,url:'https://demo-bella-cucina.agencyai.info',builtAt:ago(12),approvedAt:ago(10)},
      {id:'demo-del-bella-social',service:'AI content voor social media',type:'document',deliverableType:'TEXT_DOCUMENT',status:'approved',clientVisible:true,content:'# Social Media Content Kalender — Bella Cucina\n\n## Week 1\n**Maandag** — Instagram Reel: Chef Giovanni die verse pasta maakt.\n**Woensdag** — Foto post: Close-up van Ossobuco met polenta.\n**Vrijdag** — Story serie: Behind the scenes in de keuken.\n**Zondag** — Carousel: "5 redenen waarom onze tiramisu anders is"\n\n## Week 2\n**Dinsdag** — Instagram Reel: Sfeerbeelden bij kaarslicht.\n**Donderdag** — Foto post: Seizoensmenu highlight.\n**Zaterdag** — User generated content repost.\n\n## Hashtag Strategie\n#BellaCucina #ItaliaanskokenAmsterdam #AmsterdamRestaurant\n\n## Tone of Voice\nWarm, persoonlijk, trots op traditie.',builtAt:ago(11),approvedAt:ago(9)},
    ],
    history:[
      {event:'created',label:'Lead toegevoegd via AI run',time:ago(21)},
      {event:'sent',label:'Email verstuurd',time:ago(21)},
      {event:'replied',label:'Klant heeft gereageerd',time:ago(19)},
      {event:'projectStarted',label:'Project gestart — welkomstmail verstuurd',time:ago(17)},
      {event:'intakeSubmitted',label:'Intake ingevuld door klant',time:ago(16)},
      {event:'agentBuild',label:'Website gebouwd door AI agent',time:ago(12)},
      {event:'agentBuild',label:'Social media content gegenereerd',time:ago(11)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: Professionele website bouwen',time:ago(10)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: AI content voor social media',time:ago(9)},
      {event:'paymentReceived',label:'Betaling ontvangen: €1.290',time:ago(13)},
    ],
    clientMessages:[{id:'cm-bella-1',name:'Giovanni Moretti',message:'De website is prachtig! Precies de sfeer die we zochten.',time:ago(9)}],
    portalChat:[
      {id:'pc-bella-1',from:'client',name:'Giovanni Moretti',message:'Buongiorno! De website ziet er fantastisch uit. Kunnen we het menu nog updaten met onze zomergerechten?',time:ago(9)},
      {id:'pc-bella-2',from:'admin',name:'Agency AI Demo',message:'Dank je Giovanni! Natuurlijk, stuur het nieuwe menu door en we passen het vandaag aan.',time:ago(8)},
      {id:'pc-bella-3',from:'client',name:'Giovanni Moretti',message:'Hier het menu! We hebben 3 nieuwe pasta\'s en een zomerdessert toegevoegd.',time:ago(8)},
      {id:'pc-bella-4',from:'admin',name:'Agency AI Demo',message:'Perfect, het menu is bijgewerkt. De social media posts zijn ook ingepland met de nieuwe gerechten.',time:ago(7)},
    ],
  }, 'client');
  newLeads.push(project1);

  // PROJECT 2: StyleStore Online — fashion webshop, Rotterdam
  const project2 = buildLead({
    id:'demo-project-style', company:'StyleStore Online', name:'Femke de Groot',
    email:'femke@stylestoreonline.nl', city:'Rotterdam', niche:'retail', sub:'webshop',
    score:8.5, val:1540, days:25, sentAt:ago(25), repliedAt:ago(23), projectStartedAt:ago(20),
    portalToken:'demo-stylestore-2026', currentPhase:4, portalPasswordSet:true,
    portalWelcomeMessage:'Welkom Femke! Uw webshop, Google Ads en email flows zijn opgeleverd.',
    projectServices:[
      {name:'Webshop opzetten',price:795,billing:'eenmalig'},
      {name:'Google Ads met AI',price:450,billing:'maandelijks'},
      {name:'Email marketing automatisering',price:295,billing:'maandelijks'},
    ],
    services:[{name:'Webshop opzetten',price:795,billing:'eenmalig'},{name:'Google Ads met AI',price:450,billing:'maandelijks'},{name:'Email marketing automatisering',price:295,billing:'maandelijks'}],
    probs:['Geen online verkoopkanaal','Concurrent verkoopt al online','Geen email database'],
    intakeToken:'demo-intake-style', intakeSubmittedAt:ago(18),
    intakeAnswers:{
      'Wat verkoopt u precies?':'Duurzame dameskleding: jurken, tops, broeken en accessoires.',
      'Prijsrange producten?':'€39 - €189. Gemiddelde orderwaarde rond €85.',
      'Welke betaalmethoden wilt u?':'iDEAL, creditcard en Klarna achteraf betalen.',
      'Heeft u productfoto\'s?':'Ja, professionele foto\'s van alle 120 producten.',
      'Wat is uw merkidentiteit?':'Minimalistisch, duurzaam, vrouwelijk. Kleuren: zacht roze en donkergrijs.',
      'Doelgroep?':'Vrouwen 25-45 jaar die bewust kopen.',
      'Verzending?':'Gratis verzending boven €75. Standaard €4,95. Retour binnen 30 dagen.',
    },
    payments:[{id:'demo-pay-style-1',description:'Webshop + eerste maand ads & email',amount:1540,type:'once',billing:'eenmalig',method:'bank_transfer',status:'paid',paymentUrl:null,dueDate:ago(16),paidAt:ago(15),createdAt:ago(20),invoiceNr:'FAC-2026-005'}],
    agentDeliverables:[
      {id:'demo-del-style-shop',service:'Webshop opzetten',type:'code',deliverableType:'HTML_BUILD',status:'approved',clientVisible:true,url:'https://demo-stylestore.agencyai.info',builtAt:ago(14),approvedAt:ago(12)},
      {id:'demo-del-style-ads',service:'Google Ads met AI',type:'document',deliverableType:'TEXT_DOCUMENT',status:'approved',clientVisible:true,content:'# Google Ads Campagne — StyleStore Online\n\n## Campagne 1: Branded Search\n**Keywords:** stylestore online, stylestore kleding\n**Koppen:** "StyleStore Online — Duurzame Damesmode", "Ontdek Onze Collectie | Gratis Verzending >€75"\n\n## Campagne 2: Product Category\n**Jurken:** "Duurzame Jurken Vanaf €49 | StyleStore"\n**Tops:** "Duurzame Tops & Blouses | StyleStore Online"\n\n## Budget Advies\nStartbudget: €15/dag. Verwachte CPC: €0,45-€0,80. Verwachte ROAS: 4-6x.',builtAt:ago(13),approvedAt:ago(11)},
      {id:'demo-del-style-email',service:'Email marketing automatisering',type:'document',deliverableType:'TEXT_DOCUMENT',status:'approved',clientVisible:true,content:'# Email Marketing Flows — StyleStore Online\n\n## Flow 1: Welkomstreeks (3 emails)\n**Email 1:** "Welkom bij StyleStore — 10% korting" — kortingscode WELKOM10.\n**Email 2 (dag 3):** "Dit maakt onze mode anders" — duurzaamheidsverhaal.\n**Email 3 (dag 7):** "De favorieten van deze week" — bestsellers.\n\n## Flow 2: Verlaten Winkelwagen\n**1 uur:** "Je hebt iets achtergelaten" — product reminder.\n**24 uur:** "Gratis verzending vandaag" — incentive.\n**72 uur:** "Laatste kans — 5% extra" — code LAATSTE5.\n\n## Flow 3: Post-Purchase\n**Dag 3:** Verzendbevestiging. **Dag 10:** Review verzoek. **Dag 30:** Nieuwe collectie.',builtAt:ago(12),approvedAt:ago(10)},
    ],
    history:[
      {event:'created',label:'Lead toegevoegd via AI run',time:ago(25)},
      {event:'sent',label:'Email verstuurd',time:ago(25)},
      {event:'replied',label:'Klant heeft gereageerd',time:ago(23)},
      {event:'projectStarted',label:'Project gestart — welkomstmail verstuurd',time:ago(20)},
      {event:'intakeSubmitted',label:'Intake ingevuld door klant',time:ago(18)},
      {event:'agentBuild',label:'Webshop gebouwd door AI agent',time:ago(14)},
      {event:'agentBuild',label:'Google Ads campagne gegenereerd',time:ago(13)},
      {event:'agentBuild',label:'Email marketing flows opgezet',time:ago(12)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: Webshop opzetten',time:ago(12)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: Google Ads met AI',time:ago(11)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: Email marketing automatisering',time:ago(10)},
      {event:'paymentReceived',label:'Betaling ontvangen: €1.540',time:ago(15)},
    ],
    clientMessages:[{id:'cm-style-1',name:'Femke de Groot',message:'De webshop ziet er super professioneel uit!',time:ago(11)}],
    portalChat:[
      {id:'pc-style-1',from:'client',name:'Femke de Groot',message:'De webshop is echt mooi! Kunnen we productcategorieën nog aanpassen?',time:ago(11)},
      {id:'pc-style-2',from:'admin',name:'Agency AI Demo',message:'Dank je Femke! Welke categorieën wil je toevoegen of wijzigen?',time:ago(10)},
      {id:'pc-style-3',from:'client',name:'Femke de Groot',message:'Graag "Nieuw binnen" en "Sale" als aparte categorieën.',time:ago(10)},
      {id:'pc-style-4',from:'admin',name:'Agency AI Demo',message:'De categorieën zijn toegevoegd! Ik stuur je ook een voorstel voor Instagram ads.',time:ago(9)},
    ],
  }, 'client');
  newLeads.push(project2);

  // PROJECT 3: PowerGym Fitness — fitness studio, Utrecht
  const project3 = buildLead({
    id:'demo-project-gym', company:'PowerGym Fitness', name:'Rick van der Linden',
    email:'rick@powergymfitness.nl', city:'Utrecht', niche:'fitness', sub:'sportschool',
    score:8.8, val:545, days:18, sentAt:ago(18), repliedAt:ago(16), projectStartedAt:ago(14),
    portalToken:'demo-powergym-2026', currentPhase:4, portalPasswordSet:true,
    portalWelcomeMessage:'Welkom Rick! Uw AI chatbot en SEO rapport zijn klaar. De chatbot staat al live.',
    projectServices:[
      {name:'AI chatbot voor website',price:195,billing:'maandelijks'},
      {name:'Lokale SEO optimalisatie',price:350,billing:'maandelijks'},
    ],
    services:[{name:'AI chatbot voor website',price:195,billing:'maandelijks'},{name:'Lokale SEO optimalisatie',price:350,billing:'maandelijks'}],
    probs:['Veel vragen via telefoon kosten tijd','Concurrent scoort hoger in Google Maps','Geen online proefles boeken'],
    intakeToken:'demo-intake-gym', intakeSubmittedAt:ago(13),
    intakeAnswers:{
      'Welke abonnementen biedt u aan?':'Basis €29,99/mnd, Plus €44,99/mnd (+ groepslessen), Premium €59,99/mnd (+ PT).',
      'Openingstijden?':'Ma-vr 06:00-22:00, weekend 08:00-20:00.',
      'Welke groepslessen?':'Spinning, HIIT, Yoga, Boxing, Pilates. 5-8 lessen per dag.',
      'Proefles mogelijkheid?':'Ja, eerste les gratis. Daarna 3-daagse proefpas voor €9,99.',
      'Meest gestelde vragen?':'Prijzen, openingstijden, proefles, parkeren (gratis 50 plekken), kleedkamers.',
      'Huisstijl?':'Zwart (#1a1a1a) met fel oranje (#ff6b00). Stoer maar toegankelijk.',
    },
    payments:[{id:'demo-pay-gym-1',description:'Eerste maand AI chatbot + SEO',amount:545,type:'once',billing:'maandelijks',method:'bank_transfer',status:'paid',paymentUrl:null,dueDate:ago(10),paidAt:ago(9),createdAt:ago(14),invoiceNr:'FAC-2026-006'}],
    agentDeliverables:[
      {id:'demo-del-gym-chatbot',service:'AI chatbot voor website',type:'code',deliverableType:'HTML_BUILD',status:'approved',clientVisible:true,url:'https://demo-powergym-chatbot.agencyai.info',builtAt:ago(9),approvedAt:ago(7)},
      {id:'demo-del-gym-seo',service:'Lokale SEO optimalisatie',type:'document',deliverableType:'STRATEGY_DOCUMENT',status:'approved',clientVisible:true,content:'# Lokale SEO Rapport — PowerGym Fitness Utrecht\n\n## Huidige Situatie\n- Google Maps positie: #8 voor "sportschool Utrecht" (doel: top 3)\n- Website snelheid: 3,8s (doel: <2s)\n- 67 reviews, 4.6 sterren\n\n## Gevonden Problemen\n1. Title tags niet geoptimaliseerd\n2. Meta descriptions ontbreken op 4 pagina\'s\n3. Google Bedrijfsprofiel mist updates\n4. Geen lokale backlinks\n5. Afbeeldingen zonder alt-teksten\n\n## Actieplan\n### Maand 1 — Technische Basis\n- Title tags + meta descriptions optimaliseren\n- Schema.org markup toevoegen\n- Alt-teksten op alle afbeeldingen\n\n### Maand 2 — Content & Lokaal\n- 4 blogartikelen over sportschool Utrecht\n- Google Posts: 2x per week\n- Lokale directories aanmelden\n\n### Maand 3 — Reviews\n- QR code bij balie voor reviews\n- Automatische email na eerste bezoek\n\n## Verwacht: van #8 naar top 3 in 3 maanden.',builtAt:ago(8),approvedAt:ago(6)},
    ],
    history:[
      {event:'created',label:'Lead toegevoegd via AI run',time:ago(18)},
      {event:'sent',label:'Email verstuurd',time:ago(18)},
      {event:'replied',label:'Klant heeft gereageerd',time:ago(16)},
      {event:'projectStarted',label:'Project gestart — welkomstmail verstuurd',time:ago(14)},
      {event:'intakeSubmitted',label:'Intake ingevuld door klant',time:ago(13)},
      {event:'agentBuild',label:'AI chatbot gebouwd',time:ago(9)},
      {event:'agentBuild',label:'SEO rapport gegenereerd',time:ago(8)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: AI chatbot voor website',time:ago(7)},
      {event:'deliverableApproved',label:'Levering goedgekeurd: Lokale SEO optimalisatie',time:ago(6)},
      {event:'paymentReceived',label:'Betaling ontvangen: €545',time:ago(9)},
    ],
    clientMessages:[{id:'cm-gym-1',name:'Rick van der Linden',message:'De chatbot werkt perfect, leden vinden het handig!',time:ago(5)}],
    portalChat:[
      {id:'pc-gym-1',from:'client',name:'Rick van der Linden',message:'De chatbot is live! Kan hij ook direct een PT afspraak inplannen?',time:ago(5)},
      {id:'pc-gym-2',from:'admin',name:'Agency AI Demo',message:'Goed idee Rick! We voegen een directe booking-link toe voor personal training.',time:ago(4)},
      {id:'pc-gym-3',from:'client',name:'Rick van der Linden',message:'Top! Het SEO rapport is duidelijk. We gaan QR codes bij de balie neerleggen.',time:ago(4)},
      {id:'pc-gym-4',from:'admin',name:'Agency AI Demo',message:'Super! Google positie is al van #8 naar #5 gestegen. Blogartikelen worden volgende week ingepland.',time:ago(3)},
    ],
  }, 'client');
  newLeads.push(project3);

  writeJSON('leads.json', [...existingLeads, ...newLeads]);
  writeJSON('inbox.json', [...existingInbox, ...newInbox]);
  console.log(`✓ ${newLeads.length} demo leads created (${INBOX_SPECS.length} inbox, ${PIPELINE_SPECS.length} pipeline, 4 client/portal)`);
  console.log(`✓ ${newInbox.length} inbox items created`);
  console.log(`  Portal tokens: ${PORTAL_TOKEN}, demo-bella-cucina-2026, demo-stylestore-2026, demo-powergym-2026`);
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
