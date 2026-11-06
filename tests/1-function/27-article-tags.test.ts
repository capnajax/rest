import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { PoolClient } from 'pg';
import { ArticlesRow } from '../../src/data/tables/articles-row.js';
import { TagsRow } from '../../src/data/tables/tags-row.js';
import { initializeLogger, resetLogger } from '../../src/util/logger.js';

before(() => initializeLogger({
  logging: { level: 'error', transport: { type: 'console' } },
}));
after(() => resetLogger());

for (const streaming of [false, true]) {
  test(`article tags are loaded as clean rows (streaming=${streaming})`,
    async () => {
      const records = [{ id: 7, title: 'Seven' }, { id: 8, title: 'Eight' }];
      let calls = 0;
      const connection = {
        query(sql: unknown, parameters: unknown[]) {
          calls++;
          if (typeof sql !== 'string') {
            return (async function* () { yield* records; })();
          }
          if (sql.includes('array_agg')) {
            assert.deepEqual(parameters, [[7, 8]]);
            return Promise.resolve({ rows: [
              { article_id: 8, tag_ids: [] },
              { article_id: 7, tag_ids: [3, 5] },
            ] });
          }
          return Promise.resolve({ rows: records });
        },
      } as unknown as PoolClient;
      const messages: unknown[] = [];
      const received: ArticlesRow[] = [];
      const callback = (row: ArticlesRow): void => {
        received.push(row);
        messages.push(JSON.parse(JSON.stringify(row)));
      };
      const rows = streaming
        ? await ArticlesRow.loadArticlesByIds([7, 8], { connection }, callback)
        : await ArticlesRow.loadArticlesByIds([7, 8], { connection });
      assert.equal(calls, 2);
      if (streaming) {
        assert.equal(rows, undefined);
        assert.deepEqual(messages, [
          ...records,
          { id: 8, tags: [] },
          { id: 7, tags: [{ id: 3 }, { id: 5 }] },
        ]);
        assert.notEqual(received[0], received[3]);
        assert.notEqual(received[1], received[2]);
        assert.equal(received[0].tags, undefined);
        assert.equal(received[1].tags, undefined);
        assert.deepEqual(
          received[3].tags?.items.map((tag) => tag.id.value), [3, 5]
        );
      } else {
        assert.ok(rows);
        received.push(...rows);
        assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
          { ...records[0], tags: [{ id: 3 }, { id: 5 }] },
          { ...records[1], tags: [] },
        ]);
      }
      for (const row of received) {
        assert.equal(row.isNew, false);
        assert.equal(row.isDirty(), false);
        if (row.tags) {
          // The generated article base inherits relationship serialisation.
          assert.deepEqual(row.toJSON().tags, [...row.tags.items]);
        }
        for (const tag of row.tags?.items ?? []) {
          assert.ok(tag instanceof TagsRow);
          assert.equal(tag.isNew, false);
          assert.equal(tag.isDirty(), false);
        }
      }
    });
}
