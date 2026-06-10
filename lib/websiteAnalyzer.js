// lib/websiteAnalyzer.js — 15-point automatic website analysis (MEGA TASK 4)
// Used by Agent 1/2 when a lead comes in; result stored on lead.websiteAnalysis.

/**
 * Analyze a website on 15 criteria. Never throws — returns the checks object
 * with isLive:false when the site can't be fetched.
 */
async function analyzeWebsite(url) {
  const checks = {
    // HTTP checks
    isLive: false,
    hasSSL: false,
    loadTime: null,
    statusCode: null,
    // Content checks (from HTML)
    hasMobileViewport: false,
    hasContactInfo: false,
    hasPhoneNumber: false,
    hasEmailAddress: false,
    hasGoogleAnalytics: false,
    hasFacebook: false,
    hasSchemaMarkup: false,
    hasSitemap: false,
    hasReviews: false,
    hasCTA: false,
    hasBlog: false,
    // Extras
    contactFormUrl: null,
    // Quality score
    overallScore: 0,
    problems: [],
    opportunities: [],
    analyzedAt: new Date().toISOString(),
  };

  if (!url) {
    checks.problems.push('Geen website URL bekend');
    checks.opportunities.push('Professionele website bouwen');
    return checks;
  }

  let fullUrl = url;
  if (!/^https?:\/\//i.test(fullUrl)) fullUrl = 'https://' + fullUrl;
  checks.hasSSL = fullUrl.startsWith('https://');

  let html = '';
  try {
    const { default: fetch } = await import('node-fetch');
    const start = Date.now();
    const res = await fetch(fullUrl, {
      timeout: 5000,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    checks.loadTime = Date.now() - start;
    checks.statusCode = res.status;
    checks.isLive = res.status >= 200 && res.status < 400;
    checks.hasSSL = (res.url || fullUrl).startsWith('https://');
    html = await res.text();
  } catch (err) {
    checks.problems.push(`Website niet bereikbaar (${err.message})`);
    checks.opportunities.push('Professionele website bouwen');
    return checks;
  }

  // ── Content checks ──────────────────────────────────────────────────────
  checks.hasMobileViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  checks.hasPhoneNumber    = /(?:tel:|(?:\+|00)\d{2}[\s\-]?\d|\b0\d{1,2}[\s\-]?\d{3,4}[\s\-]?\d{3,4}\b)/.test(html);
  checks.hasEmailAddress   = /(?:mailto:|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i.test(html);
  checks.hasContactInfo    = checks.hasPhoneNumber || checks.hasEmailAddress || /\b(contact|adres|address|bezoek ons|find us)\b/i.test(html);
  checks.hasGoogleAnalytics = /googletagmanager\.com|google-analytics\.com|gtag\(|ga\('create'/i.test(html);
  checks.hasFacebook       = /facebook\.com\/[a-z0-9._-]+|fbq\(|facebook-pixel/i.test(html);
  checks.hasSchemaMarkup   = /application\/ld\+json|itemtype=["']https?:\/\/schema\.org/i.test(html);
  checks.hasReviews        = /\b(review|beoordeling|sterren|stars|testimonial|tevreden klanten|⭐|★)\b/i.test(html);
  checks.hasCTA            = /\b(neem contact|contact us|bel ons|call us|boek nu|book now|offerte|afspraak maken|aanvragen|gratis gesprek|plan een|start nu|meld je aan|reserveer)\b/i.test(html);
  checks.hasBlog           = /\b(blog|nieuws|news|artikelen|kennisbank)\b/i.test(html) && /href=["'][^"']*(blog|nieuws|news)/i.test(html);

  // Contact form URL fallback (used by Agent 1 when no email address is found)
  const formMatch = html.match(/href=["']([^"']*(?:contact|kontakt|contacto)[^"']*)["']/i);
  if (formMatch) {
    try {
      checks.contactFormUrl = new URL(formMatch[1], fullUrl).href;
    } catch { checks.contactFormUrl = null; }
  } else if (/<form[^>]*>/i.test(html) && /\b(contact|bericht|message|naam|name)\b/i.test(html)) {
    checks.contactFormUrl = fullUrl;
  }

  // Sitemap check (fast HEAD-style probe, swallow failures)
  try {
    const { default: fetch } = await import('node-fetch');
    const origin = new URL(fullUrl).origin;
    const smRes = await fetch(origin + '/sitemap.xml', { method: 'HEAD', timeout: 3000 });
    checks.hasSitemap = smRes.status >= 200 && smRes.status < 400;
  } catch { checks.hasSitemap = false; }

  // ── Score + problems + opportunities ────────────────────────────────────
  const weighted = [
    ['isLive', 15, 'Website is offline', 'Professionele website bouwen'],
    ['hasSSL', 10, 'Geen HTTPS — onveilige verbinding', 'SSL certificaat + website migratie'],
    ['hasMobileViewport', 12, 'Geen mobiele versie van de website', 'Mobile-first website redesign'],
    ['hasContactInfo', 8, 'Geen duidelijke contactgegevens op de site', 'Contact sectie toevoegen'],
    ['hasPhoneNumber', 5, 'Geen telefoonnummer zichtbaar', null],
    ['hasEmailAddress', 5, 'Geen emailadres zichtbaar', null],
    ['hasGoogleAnalytics', 6, 'Geen Google Analytics — geen inzicht in bezoekers', 'Analytics + meetbaar maken website'],
    ['hasFacebook', 4, 'Geen koppeling met social media', 'Social media integratie'],
    ['hasSchemaMarkup', 7, 'Geen schema markup — slechter vindbaar in Google', 'SEO teksten optimaliseren'],
    ['hasSitemap', 5, 'Geen sitemap.xml — slechter geïndexeerd door Google', 'SEO teksten optimaliseren'],
    ['hasReviews', 8, 'Geen reviews of sociale bewijzen op de website', 'Review sectie + reputatie zichtbaar maken'],
    ['hasCTA', 10, 'Geen duidelijke call-to-action — bezoekers haken af', 'Conversie-gerichte landingspagina'],
    ['hasBlog', 5, 'Geen blog of content sectie — gemiste SEO kans', 'Blog artikelen schrijven'],
  ];
  let score = 0;
  for (const [key, weight, problem, opportunity] of weighted) {
    if (checks[key]) {
      score += weight;
    } else {
      if (problem) checks.problems.push(problem);
      if (opportunity && !checks.opportunities.includes(opportunity)) checks.opportunities.push(opportunity);
    }
  }
  // Speed bonus (max 10 points): <1.5s full, <3s partial
  if (checks.loadTime !== null) {
    if (checks.loadTime < 1500) score += 10;
    else if (checks.loadTime < 3000) score += 6;
    else if (checks.loadTime < 5000) { score += 3; checks.problems.push(`Trage laadtijd: ${(checks.loadTime / 1000).toFixed(1)}s`); }
    else { checks.problems.push(`Zeer trage laadtijd: ${(checks.loadTime / 1000).toFixed(1)}s`); checks.opportunities.push('Website snelheid optimalisatie'); }
  }
  checks.overallScore = Math.min(100, Math.round(score));
  return checks;
}

module.exports = { analyzeWebsite };
