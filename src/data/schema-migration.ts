import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

import { PoolClient } from 'pg';

import { getConnection, returnConnection } from './query.js';
import { getLogger } from '../util/logger.js';
import { registerToken, completeToken } from '../util/readiness.js';

const MODULE = 'schema-migration';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCHEMA_DIR = path.join(__dirname, 'schema');

/**
 * Compare two semver-like version strings numerically.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const ap = a.split('.').map(Number);
  const bp = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (ap[i] !== bp[i]) return ap[i] - bp[i];
  }
  return 0;
}

/**
 * Get the current schema version from db_properties.
 * Returns null if the table does not exist yet.
 */
async function getCurrentVersion(
  conn: PoolClient
): Promise<string | null> {
  try {
    const result = await conn.query(
      "SELECT value FROM db_properties WHERE name = 'schema_version'"
    );
    return result.rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Apply all B-prefixed (non-B99) SQL files for a given schema version
 * directory, then update schema_version in db_properties. This replaces
 * the B99-schema-version.sql files — no B99 file is needed or executed.
 *
 * R-prefixed files (database creation) are skipped; the database is
 * assumed to already exist when this runs.
 *
 * Version 0.0.0 is a special case: its B10-tables.sql inserts the
 * initial schema_version row, so no separate UPDATE is issued.
 */
async function applyVersion(
  conn: PoolClient,
  version: string
): Promise<void> {
  const log = getLogger(MODULE, 'applyVersion');
  const versionDir = path.join(SCHEMA_DIR, version);

  // B-prefixed, exclude B99
  const files = fs.readdirSync(versionDir)
    .filter(f => /^B(?!99)\d+.*\.sql$/.test(f))
    .sort();

  log.info(`Applying schema ${version} (${files.length} file(s))`);

  for (const file of files) {
    const sql = fs.readFileSync(
      path.join(versionDir, file), 'utf-8'
    );
    log.debug(`Executing ${file}`);
    await conn.query(sql);
  }

  if (version !== '0.0.0') {
    await conn.query(
      "UPDATE db_properties SET value = $1 " +
      "WHERE name = 'schema_version'",
      [version]
    );
    log.info(`Schema version set to ${version}`);
  }
}

/**
 * Run all pending schema migrations on startup.
 *
 * Process:
 *  1. Apply version 0.0.0 (creates db_properties if absent — idempotent).
 *  2. Read the current schema_version.
 *  3. Apply every version directory greater than the current version,
 *     in ascending semver order.
 *
 * A readiness token 'schema-update' is registered immediately and
 * cleared when all migrations complete successfully.
 */
export async function runSchemaMigrations(): Promise<void> {
  const log = getLogger(MODULE, 'runSchemaMigrations');
  registerToken('schema-update');

  const conn = await getConnection();
  try {
    // Step 1: always apply 0.0.0 (idempotent; uses IF NOT EXISTS)
    await applyVersion(conn, '0.0.0');

    // Step 2: data import happens externally before this runs, if needed.

    // Step 3: apply all versions newer than the current schema_version
    const current = await getCurrentVersion(conn) ?? '0.0.0';
    log.info(`Current schema version: ${current}`);

    const pending = fs.readdirSync(SCHEMA_DIR)
      .filter(name => /^\d+\.\d+\.\d+$/.test(name))
      .sort(compareVersions)
      .filter(
        v => v !== '0.0.0' && compareVersions(v, current) > 0
      );

    if (pending.length === 0) {
      log.info('Schema is up to date');
    } else {
      log.info(
        `Applying ${pending.length} update(s): ${pending.join(', ')}`
      );
      for (const version of pending) {
        await applyVersion(conn, version);
      }
    }

    completeToken('schema-update');
  } catch (err) {
    log.error('Schema migration failed:', err);
    throw err;
  } finally {
    returnConnection(conn);
  }
}
