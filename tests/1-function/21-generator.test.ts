import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/data/generator/config.js';
import { writeGeneratedFiles } from '../../src/data/generator/writer.js';
import type { PoolClient } from 'pg';
import { readSchemaFromConnection } from '../../src/data/generator/schema-reader.js';
import { _ContentTypesRowBase } from '../../src/data/generated/_content-types-row-base.js';

function metadataClient(options: { explicitColumn?: string; composite?: boolean } = {}): PoolClient {
  return {
    async query(sql: string, params: string[] = []) {
      const table = params[0];
      if (sql.includes('information_schema.tables')) {
        return { rows: ['articles', 'content_types', 'form_factors'].map(table_name => ({ table_name })) };
      }
      if (sql.includes('information_schema.columns')) {
        const names = table === 'articles'
          ? ['id', 'name', 'content_type_id', 'primary_permalink_id', ...(options.explicitColumn ? [options.explicitColumn] : [])]
          : table === 'content_types' ? ['id', 'name', 'form_factor_id'] : ['id', 'name'];
        return { rows: names.map(column_name => ({ column_name, data_type: column_name === 'name' ? 'text' : 'integer', udt_name: '', is_nullable: 'NO', column_default: null })) };
      }
      if (sql.includes('pg_constraint')) {
        const rows = table === 'articles'
          ? [{ column_name: 'content_type_id', foreign_table_name: 'content_types', foreign_column_name: 'id', column_count: options.composite ? 2 : 1 },
             { column_name: 'primary_permalink_id', foreign_table_name: 'permalinks', foreign_column_name: 'id', column_count: 1 }]
          : table === 'content_types'
            ? [{ column_name: 'form_factor_id', foreign_table_name: 'form_factors', foreign_column_name: 'id', column_count: 1 }] : [];
        return { rows };
      }
      if (sql.includes('information_schema.table_constraints')) return { rows: [{ column_name: 'id' }] };
      throw new Error(`Unexpected metadata query: ${sql}`);
    },
  } as unknown as PoolClient;
}

test('rebuild infers reference relationships and preserves extension files', async () => {
  const config = loadConfig(fileURLToPath(new URL('../../', import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), 'orm-generator-'));
  assert.equal(config.relationships.get('articles')?.some(rel => rel.name === 'content_type'), false);
  const tables = await readSchemaFromConnection(metadataClient(), config);

  try {
    writeGeneratedFiles(tables, config.outputDir, root);
    const stub = join(root, 'src/data/tables/content-types-row.ts');
    assert.match(readFileSync(stub, 'utf8'), /-row-base\.js'/);
    const custom = readFileSync(stub, 'utf8') + '\n// Custom extension\n';
    writeFileSync(stub, custom);
    // Simulate stale output from an earlier generation.
    writeFileSync(join(root, config.outputDir, '_content-types-row-base.ts'), '// stale');
    const rebuilt = await readSchemaFromConnection(metadataClient(), config);
    writeGeneratedFiles(rebuilt, config.outputDir, root);
    assert.equal(readFileSync(stub, 'utf8'), custom);
    for (const table of tables) {
      const source = readFileSync(join(root, config.outputDir, `_${table.tableName.replace(/_/g, '-')}-row-base.ts`), 'utf8');
      assert.match(source, table.isReference ? /extends ImmutableRow/ : /extends MutableRow/);
      assert.match(source, /import \{ Column, TypeValidators \}/);
      if (table.tableName === 'articles') {
        assert.match(source, /get content_type\(\): _ContentTypesRowBase \| null \| undefined/);
        assert.match(source, /get primary_permalink\(\): _PermalinksRowBase \| null \| undefined/);
        assert.match(source, /foreignKey: 'content_type_id', isReference: true/);
        assert.match(source, /foreignKey: 'primary_permalink_id', isReference: false/);
        assert.match(source, /get tags\(\): RelationshipArray<_TagsRowBase>/);
      }
      if (table.tableName === 'content_types') {
        assert.match(source, /get form_factor\(\): _FormFactorsRowBase/);
      }
      if (table.isReference) {
        assert.match(source, /TypeValidators.string, true/);
        assert.doesNotMatch(source, /extends MutableRow/);
      }
    }
    assert.doesNotMatch(readFileSync(join(root, config.outputDir, 'index.ts'), 'utf8'), /from '.*\.ts'/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generated reference rows reject changes after hydration', () => {
  const row = new _ContentTypesRowBase()._fromRecord({ id: 1, name: 'Article', form_factor_id: 2 });
  assert.equal(row.name.value, 'Article');
  assert.throws(() => { row.name.value = 'Changed'; }, /immutable/);
  assert.equal('save' in row, false);
  assert.equal('delete' in row, false);
});


test('explicit relationships override inference and dynamic FKs remain opt-in', async () => {
  const config = loadConfig(fileURLToPath(new URL('../../', import.meta.url)));
  config.relationships.set('articles', [{ name: 'type', kind: 'single', foreignKey: 'content_type_id', targetTable: 'content_types', isReference: true, loadWith: 'all' }]);
  const tables = await readSchemaFromConnection(metadataClient(), config);
  const rels = tables.find(table => table.tableName === 'articles')!.relationships;
  assert.deepEqual(rels, config.relationships.get('articles'));
});

test('ambiguous names and composite reference FKs fail with an actionable error', async () => {
  const config = loadConfig(fileURLToPath(new URL('../../', import.meta.url)));
  await assert.rejects(readSchemaFromConnection(metadataClient({ explicitColumn: 'content_type' }), config), /conflicts.*configure/);
  await assert.rejects(readSchemaFromConnection(metadataClient({ composite: true }), config), /Composite reference foreign key/);
});
