/**
 * lib/workspaceStore.js — Per-workspace data isolation layer
 *
 * Wraps readJSON/writeJSON with a workspace-scoped key prefix so that
 * data for workspace A can never bleed into workspace B.
 *
 * Key format:  "ws:<workspaceId>:<key>"
 * Example:     "ws:ws_agencyai:leads.json"
 *
 * Fallback behaviour: if the prefixed key has no data yet, falls back
 * to the global key (backward compat during migration period).
 */
'use strict';

const { readJSON, writeJSON } = require('../database');

class WorkspaceStore {
  constructor(workspaceId) {
    if (!workspaceId) throw new Error('WorkspaceStore: workspaceId is required');
    this.workspaceId = workspaceId;
    this.prefix = `ws:${workspaceId}:`;
  }

  /** Scoped key, e.g. "ws:ws_agencyai:leads.json" */
  _key(key) {
    return this.prefix + key;
  }

  /**
   * Read data for this workspace.
   * Falls back to global key if no workspace-scoped data exists yet
   * (migration period safety net).
   */
  read(key) {
    const scoped = readJSON(this._key(key));
    if (scoped !== null && scoped !== undefined) return scoped;
    // Fallback to global key for backward compat
    return readJSON(key);
  }

  /** Write data for this workspace (always to the scoped key). */
  write(key, value) {
    return writeJSON(this._key(key), value);
  }

  /**
   * Read workspace-scoped data only — NEVER falls back to global.
   * Use this for settings where global fallback would leak credentials.
   */
  readDirect(key) {
    return readJSON(this._key(key)) ?? null;
  }

  /**
   * Returns true if the workspace has its own scoped data for this key
   * (i.e., is not purely falling back to global data).
   */
  hasOwnData(key) {
    return readJSON(this._key(key)) !== null;
  }

  /**
   * Copy a global key into this workspace's scoped namespace.
   * Used by the migration script.
   */
  migrateKey(key) {
    if (this.hasOwnData(key)) return false; // already migrated
    const global = readJSON(key);
    if (global === null) return false;
    this.write(key, global);
    return true;
  }
}

module.exports = WorkspaceStore;
