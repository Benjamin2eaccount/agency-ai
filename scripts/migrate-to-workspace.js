/**
 * scripts/migrate-to-workspace.js
 *
 * Copies existing global store keys to workspace-prefixed keys for the
 * 'agencyai' workspace so that WorkspaceStore can read them.
 *
 * Safe to run multiple times — already-migrated keys are skipped.
 *
 * Usage: node scripts/migrate-to-workspace.js
 */
'use strict';

const { db } = require('../database');
const WorkspaceStore = require('../lib/workspaceStore');

// Keys to migrate from global → workspace-scoped
const MIGRATE_KEYS = [
  'leads.json',
  'inbox.json',
  'settings.json',
  'memory.json',
  'blacklist.json',
  'activity.json',
  'runs.json',
  'stats.json',
  'contacts.json',
  'run-templates.json',
  'api-keys.json',
  'users.json',
  'notifications.json',
  'webhooks.json',
  'push-subscriptions.json',
  'chat-channels.json',
  'chat-messages.json',
];

async function migrate() {
  console.log('\n🔄 Agency AI — Workspace data migratie\n');

  // Find the 'agencyai' workspace
  const ws = db.prepare("SELECT * FROM workspaces WHERE slug = 'agencyai'").get();
  if (!ws) {
    console.error('✗ Workspace "agencyai" niet gevonden. Run eerst: node scripts/seed-superadmin.js');
    process.exit(1);
  }

  console.log(`Workspace: ${ws.name} (id: ${ws.id})`);
  console.log(`Prefix   : ws:${ws.id}:\n`);

  const store   = new WorkspaceStore(ws.id);
  let migrated  = 0;
  let skipped   = 0;
  let missing   = 0;

  for (const key of MIGRATE_KEYS) {
    const result = store.migrateKey(key);
    if (result === true) {
      console.log(`✓ Gemigreerd : ${key} → ws:${ws.id}:${key}`);
      migrated++;
    } else if (store.hasOwnData(key)) {
      console.log(`⚠  Al aanwezig: ws:${ws.id}:${key}`);
      skipped++;
    } else {
      console.log(`–  Niet gevonden: ${key} (overgeslagen)`);
      missing++;
    }
  }

  // Also tag existing leads with workspaceId if not already set
  try {
    const { readJSON, writeJSON } = require('../database');
    const leads = readJSON('leads.json') || [];
    let tagged = 0;
    const updated = leads.map(l => {
      if (!l.workspaceId) { tagged++; return { ...l, workspaceId: ws.id }; }
      return l;
    });
    if (tagged > 0) {
      writeJSON('leads.json', updated);
      store.write('leads.json', updated);
      console.log(`\n✓ ${tagged} leads getagd met workspaceId: ${ws.id}`);
    }
  } catch (err) {
    console.warn('\n⚠  Leads tagging fout:', err.message);
  }

  console.log(`\n✅ Migratie voltooid:`);
  console.log(`   Gemigreerd : ${migrated}`);
  console.log(`   Overgeslagen: ${skipped}`);
  console.log(`   Niet gevonden: ${missing}\n`);
}

migrate().catch(err => {
  console.error('✗ Migratie fout:', err.message);
  process.exit(1);
});
