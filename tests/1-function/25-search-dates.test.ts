import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import type { PoolClient } from 'pg';
import { search, type WhereClause } from '../../src/data/orm/search-tools.js';
import { initializeLogger, resetLogger } from '../../src/util/logger.js';

const start = new Date('2026-01-01T00:00:00Z');
const end = new Date('2026-02-01T00:00:00Z');

after(() => resetLogger());

test('search preserves Date parameters in every comparison form', async () => {
  initializeLogger({
    logging: { level: 'error', transport: { type: 'console' } },
  });
  const cases: {
    clause: WhereClause;
    sql: string;
    values: unknown[];
  }[] = [
    {
      clause: { column: 'created', type: 'date', value: start },
      sql: 'created = $1::date',
      values: [start],
    },
    {
      clause: {
        column: 'created',
        type: 'timestamp',
        value: [start, end],
        arrayComparison: 'ANY',
      },
      sql: 'created = ANY($1::timestamp[])',
      values: [[start, end]],
    },
    {
      clause: {
        column: 'created',
        type: 'timestamptz',
        operator: 'BETWEEN',
        value: [start, end],
      },
      sql: 'created BETWEEN $1::timestamptz AND $2::timestamptz',
      values: [start, end],
    },
    {
      clause: {
        column: 'created',
        type: 'date',
        operator: 'IN',
        value: [start, end],
      },
      sql: 'created IN ($1::date, $2::date)',
      values: [start, end],
    },
    {
      clause: {
        column: 'created',
        type: 'timestamptz',
        select: 'created = $$ OR created = ANY($$)',
        value: [start, [end]],
      },
      sql: 'created = $1::timestamptz OR created = ANY($2::timestamptz[])',
      values: [start, [end]],
    },
  ];

  for (const { clause, sql, values } of cases) {
    let calls = 0;
    const connection = {
      async query(query: string, parameters: unknown[]) {
        calls++;
        assert.equal(query, `SELECT * FROM articles WHERE ${sql}`);
        assert.deepEqual(parameters, values);
        return { rows: [] };
      },
    } as unknown as PoolClient;
    await search('articles', [clause], { connection });
    assert.equal(calls, 1);
  }
});

test('search rejects invalid Dates and Dates for other types', async () => {
  for (const [type, value] of [
    ['date', new Date(NaN)],
    ['timestamp', new Date(NaN)],
    ['timestamptz', new Date(NaN)],
    ['text', start],
    ['int', start],
  ] as const) {
    await assert.rejects(
      search('articles', [{ column: 'created', type, value }], {}),
      TypeError
    );
  }
});
