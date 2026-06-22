/**
 * routes/payments.js — Payment creation, tracking, Stripe/Mollie/PayPal routes
 * Extracted from server.js
 */
const express = require('express');
const Stripe = require('stripe');

module.exports = function createPaymentsRouter(deps) {
  const {
    wsRead, wsWrite, requireAdmin, isDemoUser, isDemoContext,
    sendEmail, addLeadHistory, addNotification, isResendReady,
    generateInvoiceNumber, buildInvoiceEmailHTML, generateInvoicePDF,
    aiJSON, trackFunnelEvent, authMiddleware,
  } = deps;

  const router = express.Router();

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
      return null;
    }
    throw new Error('Onbekende betaalmethode');
  }

router.post('/stripe/invoice', requireAdmin, async (req, res) => {
  // ── DEMO GUARD ──
  if (isDemoUser(req)) {
    console.log('[DEMO] Skipped real Stripe invoice for demo user');
    return res.json({ url: 'https://demo.agencyai.nl/stripe/demo-' + Date.now().toString(36) });
  }
  const settings = wsRead(req, 'settings.json', {});
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

router.post('/mollie/invoice', requireAdmin, async (req, res) => {
  // ── DEMO GUARD ──
  if (isDemoUser(req)) {
    console.log('[DEMO] Skipped real Mollie invoice for demo user');
    return res.json({ url: 'https://demo.agencyai.nl/mollie/demo-' + Date.now().toString(36) });
  }
  const settings = wsRead(req, 'settings.json', {});
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

router.post('/paypal/invoice', requireAdmin, (req, res) => {
  // ── DEMO GUARD ──
  if (isDemoUser(req)) {
    console.log('[DEMO] Skipped real PayPal invoice for demo user');
    return res.json({ url: 'https://demo.agencyai.nl/paypal/demo-' + Date.now().toString(36) });
  }
  const settings = wsRead(req, 'settings.json', {});
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


router.get('/payments', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const all = [];
  for (const lead of leads) {
    for (const p of (lead.payments || [])) {
      all.push({ ...p, leadId: lead.id, leadName: lead.companyName, niche: lead.niche });
    }
  }
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

router.get('/payments/overview', authMiddleware, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
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

router.get('/leads/:id/payments', (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const lead = leads.find(l => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead niet gevonden' });
  res.json(lead.payments || []);
});

router.post('/leads/:id/payments', requireAdmin, async (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const settings = wsRead(req, 'settings.json', {});
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });

  // ── DEMO GUARD: create payment record with fake URL, skip real payment provider ──
  if (isDemoContext(req, leads[idx])) {
    console.log(`[DEMO] Skipped real payment creation for ${leads[idx].companyName}`);
    const { amount, description, method, dueDate } = req.body;
    const fakePayment = {
      id: 'demo-pay-' + Date.now().toString(36),
      invoiceNr: 'FAC-DEMO-' + Date.now().toString(36).toUpperCase(),
      amount: parseFloat(amount) || 0,
      description: description || 'Demo betaling',
      method: method || 'bank_transfer',
      status: 'pending',
      createdAt: new Date().toISOString(),
      dueDate: dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      paymentUrl: 'https://demo.agencyai.nl/betaallink/demo-' + Date.now().toString(36),
      isDemo: true
    };
    if (!leads[idx].payments) leads[idx].payments = [];
    leads[idx].payments.push(fakePayment);
    addLeadHistory(leads, leads[idx].id, { event: 'paymentCreated', label: `Betaling aangemaakt: €${fakePayment.amount} [demo]` });
    wsWrite(req, 'leads.json', leads);
    return res.json({ payments: leads[idx].payments });
  }

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
    wsWrite(req, 'leads.json', leads);

    // Auto-send professional invoice email with PDF to client
    const lead = leads[idx];
    const payEmailTo = (lead.contactEmail || '').trim();
    console.log('[Invoice] Sending to:', payEmailTo || '(no email)');
    if (payEmailTo && isResendReady(settings)) {
      try {
        const { nr: invoiceNr, nextNum: _invNum } = generateInvoiceNumber(settings);
        settings.lastInvoiceNumber = _invNum;
        wsWrite(req, 'settings.json', settings);
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
       , workspaceId: req.user?.workspaceId});
        console.log('[Invoice] Email sent OK');
      } catch (emailErr) { console.error('[Invoice email]', emailErr.message); }
    }

    res.json(newPayments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/leads/:id/payments/:payId', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const pIdx = (leads[idx].payments || []).findIndex(p => p.id === req.params.payId);
  if (pIdx === -1) return res.status(404).json({ error: 'Betaling niet gevonden' });
  const prevPayStatus = leads[idx].payments[pIdx].status;
  const { id: _pid, createdAt: _pca, isDemo: _pdm, ...safePayBody } = req.body || {};
  leads[idx].payments[pIdx] = { ...leads[idx].payments[pIdx], ...safePayBody };
  if (req.body.status === 'paid' && !leads[idx].payments[pIdx].paidAt) leads[idx].payments[pIdx].paidAt = new Date().toISOString();
  if (req.body.status === 'paid' && prevPayStatus !== 'paid') {
    trackFunnelEvent(leads[idx].id, 'payment_received');
    const pay = leads[idx].payments[pIdx];
    addNotification('payment_received', `Betaling ontvangen: ${leads[idx].companyName}`,
      `€${(pay.amount || 0).toLocaleString('nl-NL')}${pay.description ? ' — ' + pay.description : ''}`,
      leads[idx].id, `project:${leads[idx].id}`, req.user?.workspaceId);
  }
  wsWrite(req, 'leads.json', leads);
  res.json(leads[idx].payments[pIdx]);
});

router.delete('/leads/:id/payments/:payId', requireAdmin, (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  leads[idx].payments = (leads[idx].payments || []).filter(p => p.id !== req.params.payId);
  wsWrite(req, 'leads.json', leads);
  res.json({ ok: true });
});

router.post('/leads/:id/payments/:payId/remind', requireAdmin, async (req, res) => {
  const leads = wsRead(req, 'leads.json', []);
  const settings = wsRead(req, 'settings.json', {});
  const idx = leads.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Lead niet gevonden' });
  const lead = leads[idx];

  // ── DEMO GUARD ──
  if (isDemoContext(req, lead)) {
    console.log(`[DEMO] Skipped real payment reminder for ${lead.companyName}`);
    const pay = (leads[idx].payments || []).find(p => p.id === req.params.payId);
    if (pay) {
      const pIdx = leads[idx].payments.findIndex(p => p.id === req.params.payId);
      if (pIdx !== -1) { leads[idx].payments[pIdx].lastReminderAt = new Date().toISOString(); leads[idx].payments[pIdx].reminderCount = (leads[idx].payments[pIdx].reminderCount || 0) + 1; }
    }
    addLeadHistory(leads, lead.id, { event: 'paymentReminder', label: 'Betalingsherinnering verstuurd [demo]' });
    wsWrite(req, 'leads.json', leads);
    return res.json({ ok: true, subject: 'Betalingsherinnering [demo]' });
  }

  const pay = (leads[idx].payments || []).find(p => p.id === req.params.payId);
  if (!pay) return res.status(404).json({ error: 'Betaling niet gevonden' });
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

    await sendEmail({ to: remindTo, subject: reminderEmail.subject, body: reminderEmail.body, settings, workspaceId: req.user?.workspaceId});
    // Log reminder
    if (!leads[idx].payments) return;
    const pIdx = leads[idx].payments.findIndex(p => p.id === req.params.payId);
    if (pIdx !== -1) { leads[idx].payments[pIdx].lastReminderAt = new Date().toISOString(); leads[idx].payments[pIdx].reminderCount = (leads[idx].payments[pIdx].reminderCount || 0) + 1; }
    addLeadHistory(leads, lead.id, { event: 'paymentReminder', label: `Betalingsherinnering verstuurd: €${pay.amount}` });
    wsWrite(req, 'leads.json', leads);
    res.json({ ok: true, subject: reminderEmail.subject });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

  return router;
};
