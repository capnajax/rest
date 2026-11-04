import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PoolClient } from 'pg';
import {
  ContentTypesRow, DbPropertiesRow, FormFactorsRow, RealmsRow
} from '../../src/data/generated/index.js';
import { ReferenceData } from '../../src/data/orm/reference-data.js';
import { initializeLogger, resetLogger } from '../../src/util/logger.js';

after(() => resetLogger());

test('startup loads public reference rows and resolves public targets', async () => {
  initializeLogger({
    logging: { level: 'error', transport: { type: 'console' } }
  });
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql);
      const rows = sql.includes('FROM "content_types"')
        ? [{ id: 1, name: 'Article', form_factor_id: 2 }]
        : [{ id: 2, name: 'Feature' }];
      return { rows };
    }
  } as unknown as PoolClient;

  await ReferenceData.initialize(client);
  assert.equal(calls.length, 4);
  for (const ctor of [
    ContentTypesRow, DbPropertiesRow, FormFactorsRow, RealmsRow
  ]) {
    const rows = ReferenceData.all(ctor);
    assert.equal(rows.length, 1);
    assert.ok(rows[0] instanceof ctor);
  }
  const content = ReferenceData.byId(ContentTypesRow, 1)!;
  const factor = ReferenceData.byName(FormFactorsRow, 'Feature')!;
  assert.equal(content.toJSON, ContentTypesRow.prototype.toJSON);
  assert.equal(content.form_factor, factor);
  assert.equal(ReferenceData.byTableId('content_types', 1), content);
  assert.equal(ReferenceData.byTableId('form_factors', 2), factor);
  assert.equal(calls.length, 4);
});
