/**
 * ORM Code Generator — CLI entry point
 *
 * Usage:
 *   npx tsx src/data/generator/index.ts
 *
 * Reads orm.config.yaml from the project root, introspects the live
 * PostgreSQL schema (DATABASE_URL must be set), and writes generated
 * base files to the configured output directory.
 *
 * Add to package.json scripts:
 *   "generate": "tsx src/data/generator/index.ts"
 */

import * as path    from 'path';
import * as url     from 'url';
import { loadConfig }        from './config.ts';
import { readSchema }        from './schema-reader.ts';
import { writeGeneratedFiles } from './writer.ts';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// Project root is three levels up: generator/ → data/ → src/
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');

async function main(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌  DATABASE_URL environment variable is not set.');
    process.exit(1);
  }

  console.log('📖  Reading orm.config.yaml …');
  const config = loadConfig(PROJECT_ROOT);

  console.log(`📡  Connecting to database ${dbUrl} …`);
  const tables = await readSchema(dbUrl, config);

  const mutable   = tables.filter(t => !t.isReference);
  const reference = tables.filter(t => t.isReference);
  console.log(`    Found ${tables.length} table(s): `
    + `${mutable.length} mutable, ${reference.length} reference`);

  console.log(`✍️   Writing files …`);
  const { written, skipped } = writeGeneratedFiles(tables, config.outputDir, PROJECT_ROOT);

  for (const f of written) {
    console.log(`    ✓ ${f}`);
  }
  for (const f of skipped) {
    console.log(`    – ${f} (exists, skipped)`);
  }

  console.log('✅  Generation complete.');
}

main().catch(err => {
  console.error('❌  Generator failed:', err);
  process.exit(1);
});
