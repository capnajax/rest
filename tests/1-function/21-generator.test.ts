import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../../src/data/generator/config.js';
import { writeGeneratedFiles } from '../../src/data/generator/writer.js';
import type { TableInfo } from '../../src/data/generator/types.js';
import { _ContentTypesRowBase } from '../../src/data/generated/_content-types-row-base.js';

test('rebuild preserves reference table generation and extension files', () => {
  const config = loadConfig(fileURLToPath(new URL('../../', import.meta.url)));
  const root = mkdtempSync(join(tmpdir(), 'orm-generator-'));
  const tables: TableInfo[] = [...config.referenceTables, 'articles'].map(tableName => ({
    tableName,
    className: tableName.split('_').map(part => part[0].toUpperCase() + part.slice(1)).join(''),
    isReference: config.referenceTables.has(tableName),
    isLink: false,
    pkColumn: 'id',
    columns: [
      { name: 'id', pgType: 'integer', tsType: 'number', isNullable: false, isPrimaryKey: true, hasDflt: true },
      { name: 'name', pgType: 'text', tsType: 'string', isNullable: false, isPrimaryKey: false, hasDflt: false },
    ],
    relationships: [],
  }));
  try {
    writeGeneratedFiles(tables, config.outputDir, root);
    const stub = join(root, 'src/data/tables/content-types-row.ts');
    assert.match(readFileSync(stub, 'utf8'), /-row-base\.js'/);
    const custom = readFileSync(stub, 'utf8') + '\n// Custom extension\n';
    writeFileSync(stub, custom);
    // Simulate stale output from an earlier generation.
    writeFileSync(join(root, config.outputDir, '_content-types-row-base.ts'), '// stale');
    writeGeneratedFiles(tables, config.outputDir, root);
    assert.equal(readFileSync(stub, 'utf8'), custom);
    for (const table of tables) {
      const source = readFileSync(join(root, config.outputDir, `_${table.tableName.replace(/_/g, '-')}-row-base.ts`), 'utf8');
      assert.match(source, table.isReference ? /extends ImmutableRow/ : /extends MutableRow/);
      assert.match(source, /import \{ Column, TypeValidators \}/);
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
