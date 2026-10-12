import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PoolClient } from 'pg';
import { _ArticlesRowBase, _ContentTypesRowBase, _PermalinksRowBase } from '../../src/data/generated/index.js';
import { initializeLogger, resetLogger } from '../../src/util/logger.js';
import { ReferenceData } from '../../src/data/orm/reference-data.js';

function connection(handler: (sql: string, params: unknown[]) => Record<string, unknown>[]) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const client = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      return { rows: handler(sql, params) };
    },
  } as unknown as PoolClient;
  return { client, calls };
}

after(() => resetLogger());

before(async () => {
  initializeLogger({ logging: { level: 'error', transport: { type: 'console' } } });
  const { client } = connection(sql => sql.includes('FROM "content_types"')
    ? [{ id: 1, name: 'Article', form_factor_id: 1 }, { id: 2, name: 'Note', form_factor_id: 1 }]
    : sql.includes('FROM "form_factors"') ? [{ id: 1, name: 'feature' }] : []);
  await ReferenceData.initialize(client);
});

test('reference getters use the startup snapshot and follow the current FK without queries', async () => {
  const row = new _ArticlesRowBase({ id: 10, content_type_id: 1 }, true);
  assert.equal(row.content_type, ReferenceData.byId(_ContentTypesRowBase, 1));
  await row.loadRelationship('content_type'); // No database connection configured or needed.
  assert.equal(row.isDirty(), false);
  row.content_type_id.value = 2;
  assert.equal(row.content_type?.name.value, 'Note');
  assert.deepEqual(row.toJSON().content_type, { id: 2, name: 'Note', form_factor_id: 1 });
  assert.throws(() => { row.content_type!.name.value = 'Changed'; }, /immutable/);
});

test('single references distinguish unloaded, null, and missing targets', async () => {
  const row = new _ArticlesRowBase({ id: 10 }, true);
  assert.equal(row.content_type, undefined);
  assert.equal(row.primary_permalink, undefined);
  assert.equal('primary_permalink' in row.toJSON(), false);
  await assert.rejects(row.loadRelationship('primary_permalink'), /not loaded/);
  row.primary_permalink_id.value = null;
  assert.equal(row.primary_permalink, null);
  await row.loadRelationship('primary_permalink'); // Null needs no connection.
  assert.equal(row.toJSON().primary_permalink, null);
  row.primary_permalink_id.value = 99;
  const { client, calls } = connection(() => []);
  await row.loadRelationship('primary_permalink', client);
  assert.equal(calls.length, 1);
  assert.equal(row.primary_permalink, null);
  row.content_type_id.value = 99;
  assert.equal(row.content_type, null);
  await assert.rejects(row.loadRelationship('unknown', client), /Unknown relationship/);
});

test('dynamic single references query the target PK with the local FK and invalidate stale values', async () => {
  const row = new _ArticlesRowBase({ id: 10, primary_permalink_id: 27 }, true);
  const { client, calls } = connection((sql, params) => {
    assert.match(sql, /FROM "permalinks" WHERE "id" = \$1 LIMIT 1/);
    return [{ id: params[0], name: `url-${params[0]}`, article_id: 10 }];
  });
  await row.loadRelationship('primary_permalink', client);
  assert.deepEqual(calls[0].params, [27]);
  assert.ok(row.primary_permalink instanceof _PermalinksRowBase);
  assert.equal(row.primary_permalink.isNew, false);
  assert.equal(row.primary_permalink.name.value, 'url-27');
  assert.equal(row.isDirty(), false);
  row.primary_permalink_id.value = 28;
  assert.equal(row.primary_permalink, undefined);
  assert.equal('primary_permalink' in row.toJSON(), false);
  await row.loadRelationship('primary_permalink', client);
  assert.equal(row.primary_permalink?.id.value, 28);
  row._hydrate({ primary_permalink_id: 29 });
  assert.equal(row.primary_permalink, undefined);
});

test('loadSimple loads single relationships and still exposes link collections', async () => {
  const row = new _ArticlesRowBase({ id: 10 });
  const { client, calls } = connection(sql => {
    if (sql.includes('FROM articles')) return [{ id: 10, content_type_id: 1, primary_permalink_id: 27 }];
    if (sql.includes('FROM "permalinks"')) return [{ id: 27, name: 'hello', article_id: 10 }];
    if (sql.includes('FROM "tags"')) return [{ id: 3, name: 'tag' }];
    throw new Error(`Unexpected query: ${sql}`);
  });
  await row.loadSimple(client);
  assert.equal(calls.length, 3); // Parent, permalink, tags; no reference-table query.
  assert.equal(row.content_type?.name.value, 'Article');
  assert.equal(row.primary_permalink?.name.value, 'hello');
  assert.equal(row.tags?.items[0].id.value, 3);
  assert.equal(row.attachments, undefined);
  assert.equal(row.isDirty(), false);
  assert.deepEqual(row.toJSON().primary_permalink, { id: 27, name: 'hello', article_id: 10 });
});

test('saving/deleting the owner does not cascade into a single target', async () => {
  const row = new _ArticlesRowBase({ id: 10, primary_permalink_id: 27 }, true);
  const { client, calls } = connection(sql => sql.startsWith('SELECT')
    ? [{ id: 27, name: 'hello', article_id: 10 }] : []);
  await row.loadRelationship('primary_permalink', client);
  row.primary_permalink!.name.value = 'Changed target';
  assert.equal(row.isDirty(), false);
  row.primary_permalink_id.value = 28;
  await row.save(client);
  const updates = calls.filter(call => call.sql.startsWith('UPDATE'));
  assert.equal(updates.length, 1);
  assert.match(updates[0].sql, /UPDATE "articles" SET "primary_permalink_id" = \$1/);
  assert.deepEqual(updates[0].params, [28, 10]);
  await row.loadRelationship('primary_permalink', client);
  await row.delete(client);
  assert.equal(calls.some(call => /(?:UPDATE|DELETE FROM) "permalinks"/.test(call.sql)), false);
});


test('loadAll includes direct and link collections alongside single targets', async () => {
  const row = new _ArticlesRowBase({ id: 10 });
  const { client, calls } = connection(sql => {
    if (sql.includes('FROM articles')) return [{ id: 10, content_type_id: 1, primary_permalink_id: 27 }];
    if (sql.includes('FROM "permalinks"')) return [{ id: 27, name: 'hello', article_id: 10 }];
    return [];
  });
  await row.loadAll(client);
  assert.equal(calls.length, 5);
  assert.equal(row.primary_permalink?.id.value, 27);
  assert.equal(row.permalinks?.items[0].id.value, 27);
  assert.deepEqual(row.attachments?.items, []);
  assert.deepEqual(row.tags?.items, []);
  const direct = calls.find(call => call.sql.includes('WHERE "article_id" = $1'));
  assert.deepEqual(direct?.params, [10]);
});


test('inferred reference-to-reference getters resolve from the startup snapshot', () => {
  const type = ReferenceData.byId(_ContentTypesRowBase, 1)!;
  assert.equal(type.form_factor?.name.value, 'feature');
  assert.equal(ReferenceData.byTableId('content_types', 'Article', 'name'), type);
});
