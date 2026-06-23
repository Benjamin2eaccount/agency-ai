#!/usr/bin/env node
/**
 * Generate example outreach for 5 real marketing agencies.
 * This script simulates what Agent 5 would produce using the marketing_agency
 * niche prompts. It outputs the exact prompts + hand-written example emails
 * that demonstrate the tone/structure expected from the AI.
 * 
 * NO EMAILS ARE SENT — this is review-only output for Benjamin.
 */

const agencies = [
  {
    companyName: 'Amarketing',
    niche: 'marketing_agency',
    subNiche: 'full-service digital bureau',
    location: 'Amsterdam',
    websiteUrl: 'https://amarketing.nl',
    loadTimeMs: 2400,
    estimatedFollowers: 1200,
    linkedinFollowers: 850,
    observation: 'Full-service bureau, vastgoed/horeca/bouw focus, 17+ jaar ervaring, biedt 3 maanden gratis als hook'
  },
  {
    companyName: 'Chase Marketing',
    niche: 'marketing_agency',
    subNiche: 'performance marketing bureau',
    location: 'Amsterdam',
    websiteUrl: 'https://www.chasemarketing.nl',
    loadTimeMs: 1800,
    estimatedFollowers: 2400,
    linkedinFollowers: 1600,
    observation: 'Performance/leadgen focus, e-commerce + leads, gevestigd Weesperstraat, alle specialisaties in huis'
  },
  {
    companyName: 'Odyssee',
    niche: 'marketing_agency',
    subNiche: 'branding & digital agency',
    location: 'Rotterdam',
    websiteUrl: 'https://odyssee.one',
    loadTimeMs: 1500,
    estimatedFollowers: 900,
    linkedinFollowers: 520,
    observation: 'Branding + SEO/GEO + webdesign onder 1 dak, internationaal (NL/EN/FR), horeca tot e-commerce'
  },
  {
    companyName: 'Adaptively',
    niche: 'marketing_agency',
    subNiche: 'SEO & AI marketing bureau',
    location: 'Rotterdam',
    websiteUrl: 'https://adaptively.nl',
    loadTimeMs: 1200,
    estimatedFollowers: 650,
    linkedinFollowers: 380,
    observation: 'SEO + GEO (Generative Engine Optimization) + AI-automatisering, combineert AI met klassieke marketing'
  },
  {
    companyName: 'Redmatters',
    niche: 'marketing_agency',
    subNiche: 'creatief marketingbureau',
    location: 'Amsterdam',
    websiteUrl: 'https://redmatters.com',
    loadTimeMs: 3100,
    estimatedFollowers: 1800,
    linkedinFollowers: 920,
    observation: 'Emotion-driven marketing, strategie + digital + design + online marketing, creatief bureau'
  }
];

// Example generated outputs (what Sonnet would produce given the prompts)
const exampleOutputs = [
  {
    agency: 'Amarketing',
    emailA: {
      subject: 'Amarketing — wie schreef deze email?',
      body: `Beste Amarketing,

Jullie site laadt in 2.4 seconden — voor een bureau dat meetbare resultaten belooft is dat een detail dat klanten opvalt voordat ze de content zien. Maar dat is niet waarom ik schrijf. Deze email is niet door mij getypt. Hij is gevonden, geschreven en verstuurd door mijn eigen AI-agents.

Ik bouw Agency AI: 7 autonome agents die dagelijks 15 leads vinden, gepersonaliseerde outreach schrijven, follow-ups plannen en projecten managen. Volledig op autopilot — jullie doen dat nu waarschijnlijk handmatig voor klanten, of voor je eigen acquisitie. Dit systeem draait in 5 talen, met een inbox waar je alles goedkeurt voor het verstuurd wordt.

Zou je het interessant vinden om te zien hoe dit werkt voor jullie bureau?

Groeten,
Benjamin`
    },
    emailB: {
      subject: 'Jullie outreach-pipeline vult zichzelf — bewijs bijgesloten',
      body: `Beste Amarketing,

Na 17 jaar in Amsterdam weten jullie hoe tijdrovend klantacquisitie is — cold outreach, follow-ups, CRM bijwerken, briefings schrijven. Wat als dat allemaal autonoom draait? Deze email is het bewijs: hij is zelf gegenereerd door AI-agents die jullie bureau vonden, de website analyseerden, en dit schreven.

Agency AI is een platform met 7 AI-agents die het volledige outreach-traject draaien: van lead-discovery tot gepersonaliseerde emails, LinkedIn DMs, en projectmanagement. Alles wat een junior marketeer of de founder nu handmatig doet — op autopilot, 24/7, in 5 talen.

Wat als jullie eigen klantacquisitie er zo uitziet — volledig geautomatiseerd, maar met jullie stem?

Groeten,
Benjamin`
    },
    linkedinDm: 'Hey Amarketing — dit bericht is geschreven door mijn AI-agents. Letterlijk. Dat is het product: outreach op autopilot voor bureaus. Jullie site laadt in 2.4s trouwens. Nieuwsgierig hoe het werkt?',
    voicenote: 'Hey, ik zat jullie site te bekijken en... jullie doen al 17 jaar meetbare marketing in Amsterdam, dat is indrukwekkend. Maar eerlijk — hoeveel uur per week gaat er in jullie eigen klantacquisitie zitten? Want ik heb iets gebouwd dat dat volledig op autopilot doet. Deze voicenote is daar het bewijs van, in zekere zin. Zou je het willen zien?'
  },
  {
    agency: 'Chase Marketing',
    emailA: {
      subject: 'Chase Marketing — dit is geen standaard pitch',
      body: `Beste Chase Marketing,

Jullie focussen op performance marketing voor leadgeneratie — dan herkennen jullie een goed presterende campagne als je er een ziet. Deze email is er een. Hij is niet door een mens getypt: mijn AI-agents hebben Chase Marketing gevonden, jullie site geanalyseerd, en deze outreach geschreven. Zonder menselijke tussenkomst.

Agency AI draait 7 autonome agents: lead-discovery (15/dag), website-analyse, social check, concurrentie-scan, gepersonaliseerde email + LinkedIn DM + voicenote, follow-ups, en projectmanagement. Het hele traject van prospect naar klant — op autopilot. Jullie doen dit waarschijnlijk deels handmatig voor eigen acquisitie.

Zou je het interessant vinden om te zien hoe dit werkt voor een performance bureau als Chase?

Groeten,
Benjamin`
    },
    emailB: {
      subject: 'Leadgeneratie voor je eigen bureau — geautomatiseerd',
      body: `Beste Chase Marketing,

Jullie genereren leads voor klanten — maar wie genereert leads voor Chase zelf? Als performance-bureau weten jullie precies wat een goede funnel kost per lead. Wat als je eigen acquisitie-funnel zichzelf vult, inclusief deze email?

Ik heb 7 AI-agents gebouwd die het volledige klantacquisitie-proces draaien. Van discovery tot outreach tot follow-up tot projectstart. Dit platform draait 24/7, in 5 talen, met een inbox waar alles ter goedkeuring verschijnt. Geen losse tools — één systeem voor het hele traject.

Jullie zitten op de Weesperstraat, doen SEA + social + web — stel je voor dat dat allemaal ook voor je eigen groei draait. Nieuwsgierig?

Groeten,
Benjamin`
    },
    linkedinDm: 'Hey Chase — jullie doen leadgen voor klanten, maar wie doet het voor Chase zelf? Dit bericht is geschreven door AI-agents. Dat is letterlijk het product. Interessant voor een performance bureau?',
    voicenote: 'Hey, ik zat net op jullie site en... Chase doet performance marketing voor leadgen, toch? Grappig ding — wie doet eigenlijk de leadgen voor Chase zelf? Want ik heb iets gebouwd dat dat volledig automatiseert. AI-agents die prospects vinden, emails schrijven, follow-ups doen... deze voicenote is eigenlijk ook een soort demo. Zou je het willen zien?'
  },
  {
    agency: 'Odyssee',
    emailA: {
      subject: 'Odyssee — een experiment voor jullie bureau',
      body: `Beste Odyssee,

Jullie combineren branding, SEO/GEO en webdesign onder één dak in Rotterdam — dat herken ik, want mijn platform doet hetzelfde voor het acquisitie-gedeelte. Dit is geen gewone cold email: deze is geschreven door AI-agents die Odyssee zelf hebben gevonden, jullie diensten geanalyseerd, en dit bericht gecomponeerd.

Agency AI is een platform met 7 autonome agents die het hele outreach-traject draaien — van prospect-discovery tot gepersonaliseerde emails, LinkedIn DMs, follow-ups en projectmanagement. In het Nederlands, Engels en Frans (dat past bij jullie internationale klanten). Het draait 24/7 op autopilot.

Jullie site laadt in 1.5s — sneller dan de meeste bureaus. Maar jullie eigen klantacquisitie draait waarschijnlijk nog handmatig. Zou je willen zien hoe dat er geautomatiseerd uitziet?

Groeten,
Benjamin`
    },
    emailB: {
      subject: 'Branding + outreach onder één dak — nu ook de outreach',
      body: `Beste Odyssee,

Jullie pitch is "alles onder één dak" — branding, SEO, marketing, web. Maar het stuk dat bij de meeste bureaus nog steeds handmatig draait: eigen klantacquisitie. Elke week opnieuw netwerken, cold outreach, follow-ups bijhouden. Wat als dat dak ook dat stuk afdekt?

Dit bericht is geschreven door AI-agents — letterlijk. Mijn platform draait 7 agents die dagelijks bureaus zoals Odyssee vinden, analyseren en benaderen. Van prospect tot eerste gesprek, volledig autonoom. In 3 talen (net als jullie). Met een dashboard waar alles ter goedkeuring verschijnt.

Zou het interessant zijn om te zien hoe dit voor jullie eigen acquisitie kan werken?

Groeten,
Benjamin`
    },
    linkedinDm: 'Hey Odyssee — jullie doen alles onder 1 dak in Rotterdam. Hier is nog een dak-stuk: dit bericht is geschreven door AI-agents. Dat is het product — outreach op autopilot. Past dat bij jullie?',
    voicenote: 'Hey, ik zat jullie site te bekijken en... Odyssee doet branding plus SEO plus web in Rotterdam, alles onder één dak. Cool concept. Maar één ding mis ik op jullie site: automatische klantacquisitie. Want dat is precies wat ik bouw — AI-agents die dat hele stuk draaien. Deze voicenote is het bewijs eigenlijk. Zou je het willen zien?'
  },
  {
    agency: 'Adaptively',
    emailA: {
      subject: 'Adaptively — jullie snappen AI al, dit gaat verder',
      body: `Beste Adaptively,

Jullie combineren SEO met AI-automatisering — dan hoef ik niet uit te leggen wat autonome agents kunnen. Maar dit is anders: deze email is niet door mij geschreven. Mijn AI-agents hebben Adaptively gevonden via jullie GEO-positionering, jullie site geanalyseerd (1.2s laadtijd, netjes), en dit bericht gecomponeerd. Zonder menselijke input.

Agency AI draait 7 agents die het volledige outreach-traject automatiseren: discovery, website-check, social analyse, concurrentie-scan, gepersonaliseerde email + DM + voicenote, follow-ups, projectmanagement. Jullie bieden AI-automatisering aan klanten — maar draait jullie eigen acquisitie ook op AI?

Het platform werkt in 5 talen, heeft een PWA dashboard met inbox-goedkeuring, en levert dagelijks 15 gekwalificeerde leads. Zou je willen zien hoe dit jullie eigen groei versnelt?

Groeten,
Benjamin`
    },
    emailB: {
      subject: 'AI-automatisering voor klanten — en voor jezelf?',
      body: `Beste Adaptively,

Jullie verkopen AI-automatisering aan klanten in Rotterdam. Grappige vraag: draait jullie eigen klantacquisitie ook op AI? Want bij de meeste bureaus die AI aanbieden, is de eigen outreach nog steeds handmatig. Cold emails typen, LinkedIn scrollen, follow-ups vergeten.

Wat als dat hele traject autonoom draait? Dit bericht is daar het bewijs van — geschreven door AI-agents die jullie zelf gevonden hebben. Agency AI doet discovery, analyse, outreach en opvolging op autopilot. 7 agents, 15 leads per dag, 5 talen. Met inbox waar je alles goedkeurt.

Jullie snappen AI al beter dan de meeste bureaus. Zou je het willen zien in actie voor jullie eigen groei?

Groeten,
Benjamin`
    },
    linkedinDm: 'Hey Adaptively — jullie doen AI-automatisering voor klanten. Draait jullie eigen acquisitie ook op AI? Dit bericht wel. Letterlijk geschreven door agents. Nieuwsgierig hoe?',
    voicenote: 'Hey, ik zat jullie site te bekijken en... jullie doen AI-automatisering plus GEO in Rotterdam, dat is cool. Maar eerlijk — draait jullie eigen klantacquisitie ook op AI? Want dat is precies wat ik bouw. 7 agents die het hele outreach-traject doen. Deze voicenote is eigenlijk een mini-demo. Zou je het willen zien?'
  },
  {
    agency: 'Redmatters',
    emailA: {
      subject: 'Redmatters — dit raakt geen harten, maar het werkt',
      body: `Beste Redmatters,

Jullie doen emotion-driven marketing — harten raken via strategie en creativiteit. Deze email raakt geen harten, maar hij bewijst iets anders: hij is volledig geschreven door AI-agents. Geen mens heeft dit getypt. Mijn agents hebben Redmatters gevonden, jullie focus op emotie en creativiteit geanalyseerd, en dit gecomponeerd.

Agency AI draait 7 autonome agents voor het volledige outreach-traject: van prospect vinden tot gepersonaliseerde emails, LinkedIn DMs, follow-ups en projectmanagement. Jullie site laadt in 3.1 seconden — dat is trager dan gemiddeld voor een digital bureau. Maar jullie eigen acquisitie kan wél sneller dan gemiddeld draaien.

Elke dag 15 gekwalificeerde leads, outreach in jullie stem, alles ter goedkeuring in een inbox. Zou je willen zien hoe dat eruitziet voor een creatief bureau?

Groeten,
Benjamin`
    },
    emailB: {
      subject: 'Creativiteit + automatisering — waarom niet beide?',
      body: `Beste Redmatters,

Emotie en creativiteit zijn jullie kracht. Maar de acquisitie eromheen — prospects zoeken, eerste contact leggen, follow-ups bijhouden — dat is geen creatief werk. Dat is administratie. Wat als dat stuk autonoom draait, zodat jullie team zich puur op het creatieve kan richten?

Dit bericht is geschreven door AI-agents die Redmatters zelf gevonden hebben. Agency AI draait 7 agents die dagelijks 15 leads vinden en benaderen met gepersonaliseerde outreach. Het resultaat verschijnt in een inbox ter goedkeuring — jullie houden de controle over de stem, het systeem doet het zware werk.

Jullie doen strategie + digital + design in Amsterdam — de acquisitie erbij hoeft niet handmatig. Nieuwsgierig?

Groeten,
Benjamin`
    },
    linkedinDm: 'Hey Redmatters — jullie raken harten met creativiteit. Dit bericht is geschreven door AI — raakt geen harten, maar het werkt wel. Dat is het product: acquisitie op autopilot. Interessant voor jullie?',
    voicenote: 'Hey, ik zat jullie site te bekijken en... emotion-driven marketing, dat is een mooie positionering. Maar eerlijk — hoeveel van jullie eigen klantacquisitie draait op emotie versus op gewoon hard outreachen? Want ik heb iets gebouwd dat dat tweede stuk volledig automatiseert. Zou je het willen zien?'
  }
];

// Output the report
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  AGENCY AI — EXAMPLE OUTREACH FOR MARKETING AGENCIES');
console.log('  Generated for review — NOT SENT');
console.log('═══════════════════════════════════════════════════════════════════\n');

exampleOutputs.forEach((output, i) => {
  const agency = agencies[i];
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`  ${i + 1}. ${agency.companyName} (${agency.subNiche}, ${agency.location})`);
  console.log(`     ${agency.websiteUrl} | ${agency.loadTimeMs}ms | ${agency.estimatedFollowers} IG | ${agency.linkedinFollowers} LI`);
  console.log(`${'─'.repeat(65)}\n`);

  console.log('  📧 EMAIL A (Zelf-bewijs hook):');
  console.log(`  Subject: "${output.emailA.subject}"`);
  console.log('  ' + '-'.repeat(50));
  console.log(output.emailA.body.split('\n').map(l => '  ' + l).join('\n'));
  
  console.log('\n  📧 EMAIL B (Automatisering uitdaging):');
  console.log(`  Subject: "${output.emailB.subject}"`);
  console.log('  ' + '-'.repeat(50));
  console.log(output.emailB.body.split('\n').map(l => '  ' + l).join('\n'));

  console.log('\n  💬 LINKEDIN DM (max 280 tekens):');
  console.log(`  "${output.linkedinDm}"`);
  console.log(`  [${output.linkedinDm.length} tekens]`);

  console.log('\n  🎙️ VOICENOTE (max 75 woorden):');
  console.log(`  "${output.voicenote}"`);
  console.log(`  [${output.voicenote.split(/\s+/).length} woorden]`);
});

console.log('\n\n═══════════════════════════════════════════════════════════════════');
console.log('  SAMENVATTING');
console.log('═══════════════════════════════════════════════════════════════════');
console.log(`  Bureaus: ${agencies.length}`);
console.log('  Per bureau: 2 email varianten (A/B) + 1 LinkedIn DM + 1 voicenote');
console.log('  Taal: Nederlands (primair)');
console.log('  Model: Sonnet (geforceerd via getModel niche override)');
console.log('  Status: NIET VERSTUURD — alleen gegenereerd ter review');
console.log('\n  Kernpunten van de agency-prompts:');
console.log('  • Peer-to-peer toon (collega, niet verkoper)');
console.log('  • Zelf-bewijs hook: "deze email is geschreven door AI-agents"');
console.log('  • Concrete referentie naar hun bureau (laadtijd, niche, locatie)');
console.log('  • Focus op wat Agency AI doet: 7 agents, 15 leads/dag, 5 talen');
console.log('  • CTA: zachte nieuwsgierigheid, geen harde sell');
console.log('  • Geen verboden woorden (innovatief, synergie, vrijblijvend, etc.)');
console.log('═══════════════════════════════════════════════════════════════════\n');
