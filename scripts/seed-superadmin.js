/**
 * scripts/seed-superadmin.js
 *
 * Creates:
 *   1. 'superadmin' workspace  — the platform owner (Benjamin)
 *   2. superadmin user         — info@agencyai.info / superadmin2024
 *   3. 'agencyai' workspace    — existing single-tenant Agency AI instance
 *
 * Safe to run multiple times — skips already-existing records.
 *
 * Usage:  node scripts/seed-superadmin.js
 */
'use strict';

// Pull in the database (also runs pending migrations automatically)
const { db } = require('../database');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');

function genId() {
  return crypto.randomBytes(8).toString('hex');
}

function generatePaymentReference(name) {
  const year   = new Date().getFullYear();
  const rand   = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 4);
  return `AAI-${year}-${rand}`;
}

async function seed() {
  console.log('\n🌱 Agency AI — Super Admin Seed\n');

  // ── 1. Super admin workspace ───────────────────────────────────────────────
  const saId   = 'ws_superadmin';
  const saSlug = 'superadmin';
  const saExists = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(saSlug);

  if (!saExists) {
    db.prepare(`
      INSERT INTO workspaces
        (id, slug, name, owner_email, owner_name, plan, status, branding_color, activated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(saId, saSlug, 'Agency AI Platform', 'info@agencyai.info', 'Benjamin van Hemert',
           'agency', 'active', '#2563EB');
    console.log('✓ Superadmin workspace aangemaakt (slug: superadmin)');
  } else {
    console.log('⚠  Superadmin workspace bestaat al — overgeslagen');
  }

  // ── 2. Super admin user ────────────────────────────────────────────────────
  const saUserExists = db.prepare(
    'SELECT id FROM workspace_users WHERE workspace_id = ? AND role = ?'
  ).get(saId, 'superadmin');

  if (!saUserExists) {
    const hash = await bcrypt.hash('superadmin2024', 12);
    db.prepare(`
      INSERT INTO workspace_users (id, workspace_id, email, password, name, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(genId(), saId, 'info@agencyai.info', hash, 'Benjamin van Hemert', 'superadmin');
    console.log('✓ Superadmin gebruiker aangemaakt');
    console.log('  Email    : info@agencyai.info');
    console.log('  Wachtwoord: superadmin2024  ← wijzig dit na eerste login!');
  } else {
    console.log('⚠  Superadmin gebruiker bestaat al — overgeslagen');
  }

  // ── 3. Agency AI workspace (existing single-tenant instance) ───────────────
  const aaiId   = 'ws_agencyai';
  const aaiSlug = 'agencyai';
  const aaiExists = db.prepare('SELECT id FROM workspaces WHERE slug = ?').get(aaiSlug);

  if (!aaiExists) {
    const payRef = generatePaymentReference('Agency AI');
    db.prepare(`
      INSERT INTO workspaces
        (id, slug, name, owner_email, owner_name, plan, status, branding_color,
         payment_reference, activated_at)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(aaiId, aaiSlug, 'Agency AI', 'benjamin.van.hemert2@gmail.com',
           'Benjamin van Hemert', 'agency', 'active', '#2563EB', payRef);
    console.log(`✓ Agency AI workspace aangemaakt (slug: ${aaiSlug})`);
    console.log(`  Betalingsreferentie: ${payRef}`);
  } else {
    console.log('⚠  Agency AI workspace bestaat al — overgeslagen');
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = db.prepare('SELECT COUNT(*) as c FROM workspaces').get().c;
  const users = db.prepare('SELECT COUNT(*) as c FROM workspace_users').get().c;

  console.log(`\n✅ Seed voltooid — ${total} workspace(s), ${users} workspace_user(s)`);
  console.log('\nSuper admin inloggen via: agencyai.info/superadmin');
  console.log('Agency AI inloggen via  : agencyai.info/app/agencyai\n');
}

seed().catch(err => {
  console.error('✗ Seed mislukt:', err.message);
  process.exit(1);
});
