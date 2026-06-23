/**
 * lib/email.js — Email service with dependency injection
 *
 * Usage:
 *   const { createEmailService } = require('./lib/email');
 *   const emailService = createEmailService({ wsReadWs, addActivity, BASE_URL, aiJSON });
 *   await emailService.sendEmail({ to, subject, body, settings, workspaceId });
 */

function sanitizeSubject(s) {
  return String(s || '')
    .replace(/[–—−]/g, '-')
    .replace(/[''ʼ]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[^\x20-\x7E]/g, '')
    .trim();
}

function generateInvoiceNumber(settings) {
  const year = new Date().getFullYear();
  const last = parseInt(settings.lastInvoiceNumber) || 0;
  const next = last + 1;
  return { nr: `FAC-${year}-${String(next).padStart(3, '0')}`, nextNum: next };
}

function isResendReady(s) {
  return !!(s && (s.resendApiKey || process.env.RESEND_API_KEY));
}

function createEmailService(deps) {
  const { wsReadWs, addActivity, BASE_URL, aiJSON, getModel } = deps;

  function buildEmailHTML(body, agencyName, myName, myTitle, trackingToken, opts) {
    opts = opts || {};
    const myEmail = opts.myEmail || '';
    const calendlyLink = opts.calendlyLink || '';
    const logoUrl = opts.logoUrl || (BASE_URL + '/images/agency_ai_logo_dark.png');
    const baseUrl = BASE_URL;

    const e = function(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); };

    const nameParts = (myName || 'AA').trim().split(/\s+/).filter(Boolean);
    const initials = ((nameParts[0] ? nameParts[0][0] : 'A') + (nameParts.length > 1 ? nameParts[nameParts.length-1][0] : (nameParts[0] && nameParts[0][1] ? nameParts[0][1] : 'A'))).toUpperCase();

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

    return `<!DOCTYPE html>
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
  }

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
  <tr><td style="padding:22px 32px;background:#111111">
    ${logoUrl
      ? `<img src="${logoUrl}" alt="${e(agencyName)}" style="height:30px;max-width:150px;object-fit:contain;display:block">`
      : `<span style="font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:700;color:#ffffff">${e(agencyName)}</span>`}
  </td></tr>
  <tr><td style="padding:0">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td style="padding:24px 32px;background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border-bottom:2px solid #bbf7d0">
      <p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.07em">Klaar voor gebruik</p>
      <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:800;color:#14532d">Uw ${e(serviceNm)} staat klaar!</p>
    </td></tr>
    </table>
  </td></tr>
  <tr><td style="padding:28px 32px 0">
    <p style="margin:0 0 20px;font-family:Georgia,serif;font-size:15px;line-height:1.75;color:#1a1a1a">Beste ${e(company)},</p>
    <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:15px;line-height:1.75;color:#1a1a1a">Geweldig nieuws — uw <strong>${e(serviceNm)}</strong> is volledig opgebouwd en klaar voor gebruik. Hieronder vindt u alles wat u moet weten om direct aan de slag te gaan.</p>
  </td></tr>
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
  <tr><td style="padding:0 32px 28px">
    <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;color:#111111">Heeft u vragen?</p>
    <p style="margin:0 0 16px;font-family:Georgia,serif;font-size:14px;line-height:1.7;color:#374151">Wij staan altijd voor u klaar. U kunt uw klantportaal raadplegen voor updates, documenten en facturen, of direct op deze email antwoorden.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
      ${portalBtn}
    </table>
  </td></tr>
  <tr><td style="padding:0 32px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="height:1px;background:#e8e8e5;font-size:0;line-height:0">&nbsp;</td></tr></table></td></tr>
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
  <tr><td style="padding:16px 32px;background:#f4f4f2;border-top:1px solid #e8e8e5">
    <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#9b9b98;text-align:center">&copy; ${new Date().getFullYear()} ${e(agencyName)} &bull; Vragen? Antwoord op deze email.</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  }

  async function sendEmail({ to, subject, body, html, settings: _settings = {}, trackingToken, noCalendly = true, isColdOutreach = false, attachments = [], workspaceId: _wsId = null }) {
    const toStr = Array.isArray(to) ? to[0] : to;
    const toRaw = (typeof toStr === 'string' ? toStr : String(toStr || ''));
    console.log('[Email] Raw to value:', JSON.stringify(toRaw));
    console.log('[Email] Char codes:', [...toRaw].map(c => c.charCodeAt(0)).join(','));
    const toFinal = toRaw
      .replace(/^<|>$/g, '')
      .replace(/[\r\n\t\0]/g, '')
      .replace(/[^\x20-\x7E]/g, '')
      .replace(/\s+/g, '')
      .toLowerCase()
      .trim();
    if (!toFinal || !toFinal.includes('@')) {
      throw new Error(`sendEmail: ongeldig "to" adres na opschoning: "${toFinal}" (origineel: ${JSON.stringify(toRaw)})`);
    }
    console.log(`[Email] Versturen naar: "${toFinal}" (origineel: ${JSON.stringify(toRaw)})`);

    const s = wsReadWs(_wsId, 'settings.json', {});

    if (!noCalendly) {
      const allLeads = wsReadWs(_wsId, 'leads.json', []);
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
      throw new Error('Email niet ingesteld. Voeg RESEND_API_KEY toe als Railway environment variable of via Instellingen \u2192 Email.');
    }

    const platformName = _settings.brandingName || s.agencyName || 'Agency AI';
    const fromName = isColdOutreach
      ? `${myName || 'Agency AI'} via ${platformName}`
      : platformName;
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
    const d2 = await r.json();
    if (!r.ok) throw new Error(d2.message || d2.error || `Resend fout ${r.status}`);
    addActivity('email_sent', `Email verstuurd \u2192 ${toFinal}`, { cost: 0, workspaceId: _wsId});
  }

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
BELANGRIJK: Spreek de klant aan als "Beste ${lead.contactName || lead.companyName}," \u2014 gebruik NOOIT de naam van het bureau of medewerker als aanhef.
De mail is professioneel maar persoonlijk, max 200 woorden. Geen bullet lists. Noem concreet wat er de komende week gaat gebeuren.
${intakeUrl ? `Vraag de klant om de intake-vragenlijst in te vullen via: ${intakeUrl} \u2014 dit is belangrijk voor een goede start.` : ''}
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
    const result = await aiJSON(prompt, getModel('CLIENT_EMAIL'));
    if (!result?.subject || !result?.body) throw new Error('AI gaf geen geldige email terug');

    result.subject = result.subject
      .replace('{agency}', settings.agencyName)
      .replace('{company}', lead.companyName)
      .replace('{week}', extra.week || '')
      .replace('{month}', new Date().toLocaleDateString('nl-NL', {month:'long'}));

    return result;
  }

  return {
    sendEmail,
    buildEmailHTML,
    buildDeliveryEmailHTML,
    generateClientEmail,
    sanitizeSubject,
    generateInvoiceNumber,
    isResendReady,
  };
}

module.exports = { createEmailService, sanitizeSubject, generateInvoiceNumber, isResendReady };
