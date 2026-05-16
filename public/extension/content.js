chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'EXTRACT_COMPANY') return;

  const getMeta = (names) => {
    for (const name of names) {
      const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      if (el?.content) return el.content;
    }
    return '';
  };

  const getStructuredData = () => {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const s of scripts) {
        const data = JSON.parse(s.textContent);
        if (data['@type'] === 'LocalBusiness' || data['@type'] === 'Organization') return data;
      }
    } catch {}
    return null;
  };

  const structured = getStructuredData();
  const title      = document.title.split(/[|\-–]/)[0].trim();
  const description = getMeta(['description', 'og:description', 'twitter:description']);
  const siteName   = getMeta(['og:site_name']) || '';
  const phone      = structured?.telephone || getMeta(['og:phone_number']) || '';
  const address    = structured?.address?.addressLocality || structured?.address?.streetAddress || '';
  const country    = structured?.address?.addressCountry || 'NL';
  const instagram  = (() => {
    const links = [...document.querySelectorAll('a[href*="instagram.com"]')];
    for (const l of links) {
      const m = l.href.match(/instagram\.com\/([^/?#]+)/);
      if (m && m[1] !== 'p') return m[1];
    }
    return '';
  })();

  sendResponse({
    companyName:  siteName || title,
    websiteUrl:   window.location.origin,
    description,
    phone,
    location:     address,
    country:      country || 'NL',
    instagramHandle: instagram,
    pageTitle:    title
  });

  return true;
});
