import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import type { Request, Response } from 'filamentjs';
import { Pool } from 'pg';
import { parsedArgs } from '../../src/args.js';
import { ArticlesRow } from '../../src/data/tables/articles-row.js';
import { BylinesRow } from '../../src/data/tables/bylines-row.js';
import { PeopleRow } from '../../src/data/tables/people-row.js';
import { PermalinksRow } from '../../src/data/tables/permalinks-row.js';
import { RealmsRow } from '../../src/data/tables/realms-row.js';
import { TagsRow } from '../../src/data/tables/tags-row.js';
import {
  createPresetDataHandler,
  getArticleByPermalink,
  getArticleObjects,
  getBylineObjects,
  getPersonObjects,
  getRealmObjects,
  getTagObjects,
} from '../../src/routes/data.js';
import { normalizeDataRequest } from
  '../../src/routes/data-contracts/normalizers.js';
import { initializeLogger, resetLogger } from '../../src/util/logger.js';

before(() =>
  initializeLogger({
    logging: { level: 'error', transport: { type: 'console' } },
  })
);
after(() => resetLogger());

function makeResponse() {
  const messages: string[] = [];
  const headers = new Map<string, string>();
  const state = { ended: 0, frozen: false, statusCode: 200 };
  const response = {
    headers: {
      set: (name: string, value: string) => headers.set(name, value),
      get frozen() {
        return state.frozen;
      },
    },
    get statusCode() {
      return state.statusCode;
    },
    set statusCode(value: number) {
      state.statusCode = value;
    },
    async send(value: string) {
      state.frozen = true;
      messages.push(value);
    },
    async sendChunk(value: string) {
      state.frozen = true;
      messages.push(value);
    },
    async end() {
      state.ended++;
    },
  } as unknown as Response;
  return { headers, messages, response, state };
}

for (const stream of [false, true]) {
  test(`empty preset preserves status and headers (stream=${stream})`, async () => {
    const handler = createPresetDataHandler({ options: { stream } });
    const first = makeResponse();
    const second = makeResponse();
    await Promise.all([
      handler({} as Request, first.response),
      handler({} as Request, second.response),
    ]);
    for (const result of [first, second]) {
      assert.equal(result.state.ended, 1);
      assert.equal(
        result.headers.get('Content-Type'),
        stream ? 'application/x-ndjson' : 'application/json'
      );
      assert.ok(JSON.parse(result.messages[0]).status.date);
    }
  });
}

test('article handler waits for writes and forwards normalised input', async () => {
  const result = makeResponse();
  const since = new Date('2026-01-01T00:00:00Z');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    writeStarted = resolve;
  });
  const getArticles = mock.method(
    ArticlesRow,
    'getArticlesByIds',
    async (
      ...[ids, callback, options]: Parameters<
        typeof ArticlesRow.getArticlesByIds
      >
    ) => {
      assert.deepEqual(ids, [7]);
      assert.equal(
        options?.ifModifiedSince?.toISOString(),
        since.toISOString()
      );
      callback([{ toJSON: () => ({ id: 7 }) } as ArticlesRow]);
    }
  );
  result.response.sendChunk = async (value) => {
    writeStarted();
    await pending;
    result.messages.push(String(value));
  };
  try {
    const handler = createPresetDataHandler({
      objects: { articles: { id: 7, ifModifiedSince: since.toISOString() } },
      options: { stream: true },
    });
    const completion = handler({} as Request, result.response);
    await started;
    assert.equal(result.state.ended, 0);
    release();
    await completion;
    assert.equal(result.state.ended, 1);
    const message = JSON.parse(result.messages[0]);
    assert.deepEqual(message.objects, [
      { type: 'article', records: [{ id: 7 }] },
    ]);
    assert.ok(message.status.date);
  } finally {
    release();
    getArticles.mock.restore();
  }
});

test('query failures end the response once with an error status', async () => {
  const query = mock.method(ArticlesRow, 'getArticlesByIds', async () => {
    throw new Error('Query failed');
  });
  try {
    const result = makeResponse();
    await createPresetDataHandler({ objects: { articles: 7 } })(
      {} as Request,
      result.response
    );
    assert.equal(result.state.statusCode, 500);
    assert.equal(result.state.ended, 1);
    assert.deepEqual(result.messages, []);
  } finally {
    query.mock.restore();
  }
});

test('invalid presets are rejected before queries run', async () => {
  const result = makeResponse();
  await createPresetDataHandler({ objects: { articles: true } })(
    {} as Request,
    result.response
  );
  assert.equal(result.state.statusCode, 400);
  assert.equal(result.state.ended, 1);
  assert.deepEqual(result.messages, []);
});

for (const fail of [false, true]) {
  test(`searches share and release their connection (failure=${fail})`, async () => {
    const previousUrl = parsedArgs.dbUrl;
    parsedArgs.dbUrl = 'postgres://unused/data-handler-test';
    let released = 0;
    const connection = {
      release() {
        released++;
      },
    };
    const connect = mock.method(
      Pool.prototype,
      'connect',
      async () => connection
    );
    const calls: unknown[] = [];
    const search = mock.method(
      ArticlesRow,
      'searchArticles',
      async (
        ...[filter, client]: Parameters<typeof ArticlesRow.searchArticles>
      ) => {
        assert.equal(client, connection);
        calls.push(filter);
        if (fail) throw new Error('Search failed');
        return { articles: [{ id: calls.length }], count: 12 };
      }
    );
    try {
      const result = makeResponse();
      await createPresetDataHandler({
        filters: [
          { article: { type: 'feed', searchSequence: 1, tagId: 1 } },
          { article: { type: 'feed', searchSequence: 2, tagId: 2 } },
          { article: { type: 'sidebar', searchSequence: 3, limit: 5 } },
        ],
      })({} as Request, result.response);
      assert.equal(released, 1);
      assert.equal(connect.mock.callCount(), 1);
      assert.equal(result.state.ended, 1);
      if (fail) {
        assert.equal(result.state.statusCode, 500);
        assert.equal(calls.length, 1);
      } else {
        assert.deepEqual(calls, [
          { is_hidden: false, limit: 100, offset: 0, tagIds: [2] },
          {
            types: ['article'],
            is_featured: true,
            is_hidden: false,
            limit: 5,
            offset: 0,
          },
          { types: ['cheat'], is_hidden: false, limit: 5, offset: 0 },
        ]);
        const message = JSON.parse(result.messages[0]);
        assert.deepEqual(
          message.searches.map((value: { type: string }) => value.type),
          ['feed', 'sidebar']
        );
        assert.equal(message.searches[0].searchSequence, 2);
        assert.equal(message.searches[1].featured.quantity, 12);
        assert.equal(message.searches[1].cheatNotes.quantity, 12);
      }
    } finally {
      parsedArgs.dbUrl = previousUrl;
      connect.mock.restore();
      search.mock.restore();
    }
  });
}

test('reusing a preset does not mutate its object ID arrays', async () => {
  const input = { objects: [{ articles: [1] }, { articles: [2] }] };
  const query = mock.method(
    ArticlesRow,
    'getArticlesByIds',
    async (...[ids]: Parameters<typeof ArticlesRow.getArticlesByIds>) => {
      assert.deepEqual(ids, [1, 2]);
    }
  );
  try {
    const handler = createPresetDataHandler(input);
    await handler({} as Request, makeResponse().response);
    await handler({} as Request, makeResponse().response);
    assert.deepEqual(input.objects[0].articles, [1]);
  } finally {
    query.mock.restore();
  }
});

function makeArticleRequest(ids: string, since?: string): Request {
  return {
    params: { ids },
    headers: new Headers(since ? { 'If-Modified-Since': since } : {}),
  } as unknown as Request;
}

for (const ids of ['all', '7,9', '7,7', '99']) {
  test(`GET tags returns requested records and ignores IMS (${ids})`, async () => {
    const records = [{ id: 7 }, { id: 8 }, { id: 9 }];
    const query = mock.method(
      TagsRow,
      'getTags',
      async (...[options, callback]: Parameters<typeof TagsRow.getTags>) => {
        assert.deepEqual(options, {});
        for (const record of records) {
          callback([{ exportRecord: () => record } as TagsRow]);
        }
      }
    );
    try {
      const result = makeResponse();
      await getTagObjects(makeArticleRequest(
        ids, 'Thu, 01 Jan 2099 00:00:00 GMT'
      ), result.response);
      const expected = ids === 'all'
        ? records
        : records.filter((record) => ids.split(',').includes(`${record.id}`));
      assert.equal(result.state.statusCode, 200);
      assert.equal(result.state.ended, 1);
      assert.equal(result.headers.get('Last-Modified'), undefined);
      assert.equal(result.headers.get('Content-Type'), 'application/json');
      const body = JSON.parse(result.messages[0]);
      assert.deepEqual(body.objects, [{ type: 'tag', records: expected }]);
      assert.ok(body.status.date);
    } finally {
      query.mock.restore();
    }
  });
}

for (const ids of [undefined, '', '1,', ',1', '1,,2', '1.5', 'all,1',
  '2147483648']) {
  test(`GET tags rejects missing or invalid IDs (${ids})`, async () => {
    const query = mock.method(TagsRow, 'getTags', async () => {});
    try {
      const result = makeResponse();
      const request = { params: { ids } } as unknown as Request;
      await getTagObjects(request, result.response);
      assert.equal(result.state.statusCode, ids === undefined ? 404 : 400);
      assert.equal(result.state.ended, 1);
      assert.equal(query.mock.callCount(), 0);
    } finally {
      query.mock.restore();
    }
  });
}

test('GET tags ends the response when loading fails', async () => {
  const query = mock.method(TagsRow, 'getTags', async () => {
    throw new Error('Query failed');
  });
  try {
    const result = makeResponse();
    await getTagObjects(makeArticleRequest('all'), result.response);
    assert.equal(result.state.statusCode, 500);
    assert.equal(result.state.ended, 1);
    assert.deepEqual(result.messages, []);
  } finally {
    query.mock.restore();
  }
});

for (const since of [
  undefined,
  'invalid',
  'Wed, 31 Dec 2025 23:59:59 GMT',
  'Thu, 01 Jan 2026 00:00:00 GMT',
  'Fri, 02 Jan 2026 00:00:00 GMT',
]) {
  test(`GET articles validates modification dates (${since})`, async () => {
    const records = [
      { id: 7, last_update: new Date('2025-12-31T00:00:00Z') },
      { id: 8, last_update: new Date('2026-01-01T00:00:00.500Z') },
    ];
    const timestamp = since === undefined ? NaN : Date.parse(since);
    const expected = records.filter((record) =>
      !Number.isFinite(timestamp) || record.last_update.getTime() >= timestamp
    );
    const query = mock.method(
      ArticlesRow,
      'getArticlesByIds',
      async (...[ids, callback, options]: Parameters<
        typeof ArticlesRow.getArticlesByIds
      >) => {
        assert.deepEqual(ids, [7, 8]);
        assert.deepEqual(options, Number.isFinite(timestamp)
          ? { ifModifiedSince: new Date(timestamp) }
          : {});
        for (const record of expected) {
          callback([{ toJSON: () => record } as ArticlesRow]);
        }
      }
    );
    try {
      const result = makeResponse();
      await getArticleObjects(
        makeArticleRequest('7,8', since), result.response
      );
      assert.equal(
        result.headers.get('Last-Modified'),
        expected.length > 0 ? 'Thu, 01 Jan 2026 00:00:00 GMT' : undefined
      );
      const unchanged = expected.length === 0;
      assert.equal(result.state.statusCode, unchanged ? 304 : 200);
      if (unchanged) {
        assert.equal(result.state.ended, 1);
        assert.deepEqual(result.messages, []);
      } else {
        const body = JSON.parse(result.messages[0]);
        assert.deepEqual(body.objects, [{
          type: 'article', records: JSON.parse(JSON.stringify(expected)),
        }]);
        assert.ok(body.status.date);
        assert.equal(result.headers.get('Content-Type'), 'application/json');
      }
    } finally {
      query.mock.restore();
    }
  });
}

for (const ids of ['', '1,', ',1', '1,,2', '1.5', 'all', '2147483648']) {
  test(`GET articles rejects invalid IDs (${ids})`, async () => {
    const query = mock.method(ArticlesRow, 'getArticlesByIds', async () => {});
    try {
      const result = makeResponse();
      await getArticleObjects(makeArticleRequest(ids), result.response);
      assert.equal(result.state.statusCode, 400);
      assert.equal(result.state.ended, 1);
      assert.equal(query.mock.callCount(), 0);
    } finally {
      query.mock.restore();
    }
  });
}

for (const fail of [false, true]) {
  test(`GET articles handles empty results and errors (${fail})`, async () => {
    const query = mock.method(ArticlesRow, 'getArticlesByIds', async () => {
      if (fail) throw new Error('Query failed');
    });
    try {
      const result = makeResponse();
      await getArticleObjects(makeArticleRequest(
        '7', 'Thu, 01 Jan 2026 00:00:00 GMT'
      ), result.response);
      assert.equal(result.state.statusCode, fail ? 500 : 304);
      if (fail) {
        assert.equal(result.state.ended, 1);
        assert.deepEqual(result.messages, []);
      } else {
        assert.equal(result.state.ended, 1);
        assert.deepEqual(result.messages, []);
      }
    } finally {
      query.mock.restore();
    }
  });
}

test('GET important tags returns only important records', async () => {
  const records = [
    { id: 7, important: true },
    { id: 8, important: false },
    { id: 9, important: true },
  ];
  const query = mock.method(TagsRow, 'loadTags', async (...args: unknown[]) => {
    const callback = args[0] as (row: TagsRow) => void;
    for (const record of records) {
      callback(new TagsRow(record));
    }
  });
  try {
    const result = makeResponse();
    await getTagObjects(makeArticleRequest('important'), result.response);
    assert.equal(result.state.statusCode, 200);
    assert.equal(result.state.ended, 1);
    assert.equal(query.mock.callCount(), 1);
    const body = JSON.parse(result.messages[0]);
    assert.deepEqual(body.objects, [{
      type: 'tag',
      records: records.filter((record) => record.important),
    }]);
  } finally {
    query.mock.restore();
  }
});

for (const mode of ['stream', 'combined', 'get'] as const) {
  test(`article tags survive the complete response path (${mode})`, async () => {
    const previousUrl = parsedArgs.dbUrl;
    parsedArgs.dbUrl = 'postgres://unused/article-tags-response-test';
    let released = 0;
    let tagQueries = 0;
    const records = [{ id: 7, title: 'Seven' }, { id: 8, title: 'Eight' }];
    const result = makeResponse();
    const connection = {
      query(sql: unknown, parameters: unknown[]) {
        if (typeof sql !== 'string') {
          return (async function* () { yield* records; })();
        }
        assert.match(sql, /array_agg/);
        assert.deepEqual(parameters, [[7, 8]]);
        tagQueries++;
        if (mode === 'stream') {
          // Articles must be sent before this query even begins.
          assert.equal(result.messages.length, 1);
          const first = JSON.parse(result.messages[0]);
          assert.deepEqual(first.objects[0].records, records);
        }
        return Promise.resolve({ rows: [
          { article_id: 7, tag_ids: [3, 5] },
          { article_id: 8, tag_ids: [] },
        ] });
      },
      release() { released++; },
    };
    const connect = mock.method(
      Pool.prototype, 'connect', async () => connection
    );
    try {
      if (mode === 'get') {
        await getArticleObjects(makeArticleRequest('7,8'), result.response);
      } else {
        await createPresetDataHandler({
          objects: { articles: [7, 8] },
          options: { stream: mode === 'stream' },
        })({} as Request, result.response);
      }
      assert.equal(result.state.statusCode, 200);
      assert.equal(tagQueries, 1);
      if (mode === 'stream') {
        assert.equal(result.messages.length, 2);
        const first = JSON.parse(result.messages[0]);
        assert.equal(first.objects[0].records[0].tags, undefined);
      }
      assert.equal(released, 1);
      const articles = result.messages.flatMap((message) =>
        JSON.parse(message).objects.flatMap(
          (batch: { records: Record<string, unknown>[] }) => batch.records
        )
      );
      for (const [id, tags] of [[7, [{ id: 3 }, { id: 5 }]], [8, []]]) {
        const article = articles.findLast(
          (row: Record<string, unknown>) => row.id === id
        );
        assert.ok(article);
        assert.deepEqual(article.tags, tags);
        if (mode === 'stream') {
          assert.deepEqual(Object.keys(article).sort(), ['id', 'tags']);
        } else {
          assert.equal(article.title, id === 7 ? 'Seven' : 'Eight');
        }
      }
    } finally {
      parsedArgs.dbUrl = previousUrl;
      connect.mock.restore();
    }
  });
}


test('permalink lookup includes relationships and byline', async () => {
  const result = makeResponse();
  const lookup = mock.method(PermalinksRow, 'getPermalink', async (name) => {
    assert.equal(name, 'old-name');
    return new PermalinksRow({ id: 1, article_id: 7 }, true);
  });
  const load = mock.method(ArticlesRow.prototype, 'loadSimple', async function (
    this: ArticlesRow
  ) {
    assert.equal(this.id.value, 7);
    this.assumeClean('byline_id', 3);
  });
  const serialize = mock.method(ArticlesRow.prototype, 'toJSON', () => ({
    id: 7, tags: [{ id: 2, title: 'Example' }],
    content_type: { id: 1, name: 'article' },
    primary_permalink: { id: 4, name: 'new-name' },
  }));
  const byline = mock.method(BylinesRow, 'findById', async (id) => {
    assert.equal(id, 3);
    return new BylinesRow({ id, text: 'An author' }, true);
  });
  try {
    await getArticleByPermalink({
      params: { permalink: 'old-name' },
    } as unknown as Request, result.response);
    const body = JSON.parse(result.messages.join(''));
    assert.equal(result.state.statusCode, 200);
    assert.equal(result.state.ended, 1);
    assert.equal(body.objects[0].records[0].byline, 'An author');
    assert.equal(body.objects[0].records[0].tags[0].id, 2);
    assert.equal(body.objects[0].records[0].primary_permalink.name, 'new-name');
  } finally {
    lookup.mock.restore();
    load.mock.restore();
    serialize.mock.restore();
    byline.mock.restore();
  }
});

for (const fails of [false, true]) {
  test(`permalink lookup handles missing or failed lookup (${fails})`, async () => {
    const result = makeResponse();
    const lookup = mock.method(PermalinksRow, 'getPermalink', async () => {
      if (fails) throw new Error('Lookup failed');
      return 404 as const;
    });
    try {
      await getArticleByPermalink({
        params: { permalink: 'missing' },
      } as unknown as Request, result.response);
      assert.equal(result.state.statusCode, fails ? 500 : 404);
      assert.equal(result.state.ended, 1);
      assert.equal(result.messages.length, 0);
    } finally {
      lookup.mock.restore();
    }
  });
}

for (const { type, handler, query, row } of [
  {
    type: 'byline', handler: getBylineObjects,
    query: (load: (id: number) => Promise<unknown>) =>
      mock.method(BylinesRow, 'getBylineById', async (id) =>
        await load(id) as BylinesRow | 404),
    row: { toJSON: () => ({ id: 7, text: 'Author' }) },
  },
  {
    type: 'person', handler: getPersonObjects,
    query: (load: (id: number) => Promise<unknown>) =>
      mock.method(PeopleRow, 'getPersonById', async (id) =>
        await load(id) as PeopleRow | 404),
    row: { redact: () => ({ id: 7, username: 'author' }) },
  },
  {
    type: 'realm', handler: getRealmObjects,
    query: (load: (id: number) => Promise<unknown>) =>
      mock.method(RealmsRow, 'getRealmById', async (id) =>
        await load(id) as RealmsRow | 404),
    row: { redact: () => ({ id: 7, name: 'Example' }) },
  },
]) {
  const key = { byline: 'bylines', person: 'people', realm: 'realms' }[type]!;
  for (const stream of [false, true]) {
    test(`body ${key} supports merged selections (stream=${stream})`,
      async () => {
        const loaded: number[] = [];
        const lookup = query(async (id) => {
          loaded.push(id);
          return id === 7 ? row : 404;
        });
        try {
          const input = {
            objects: [{ [key]: 7 }, { [key]: [7, 99] }],
            options: { stream },
          };
          const result = makeResponse();
          await createPresetDataHandler(input)(
            {} as Request, result.response
          );
          assert.deepEqual(loaded, [7, 99]);
          const expected = 'redact' in row ? row.redact() : row.toJSON();
          assert.deepEqual(JSON.parse(result.messages[0]).objects,
            [{ type, records: [expected] }]);
          assert.equal(result.state.ended, 1);
          assert.equal(result.state.statusCode, 200);

          for (const selection of [true, 'all', 1.5, 2147483648]) {
            assert.throws(() => normalizeDataRequest({
              objects: { [key]: selection },
            }));
          }
          assert.deepEqual(normalizeDataRequest({
            objects: { [key]: false },
          }).objects, {});
          const since = '2026-01-01T00:00:00Z';
          const earlier = '2025-01-01T00:00:00Z';
          const merged = normalizeDataRequest({ objects: [
            { [key]: { id: 7, ifModifiedSince: since } },
            { [key]: { id: [99], ifModifiedSince: earlier } },
          ] });
          assert.deepEqual(merged.objects, {
            [key]: { id: [7, 99], ifModifiedSince: new Date(earlier) },
          });
        } finally {
          lookup.mock.restore();
        }
      });
  }
  const calls: number[] = [];
  let fail = false;
  async function load(id: number): Promise<unknown> {
    calls.push(id);
    if (fail) throw new Error('Lookup failed');
    return id === 7 ? row : 404;
  }

  test(`GET ${type} validates IDs and serializes selected rows`, async () => {
    const lookup = query(load);
    try {
      for (const ids of [undefined, '', 'all', '1,', '1.5', '2147483648']) {
        const result = makeResponse();
        await handler({ params: { ids } } as unknown as Request,
          result.response);
        assert.equal(result.state.statusCode, ids === undefined ? 404 : 400);
        assert.equal(result.state.ended, 1);
      }
      assert.deepEqual(calls, []);
      const result = makeResponse();
      await handler(makeArticleRequest('7,7,99'), result.response);
      assert.deepEqual(calls, [7, 99]);
      const body = JSON.parse(result.messages[0]);
      const expected = 'redact' in row ? row.redact() : row.toJSON();
      assert.deepEqual(body.objects, [{ type, records: [expected] }]);
      assert.ok(body.status.date);
      assert.equal(result.state.ended, 1);
      assert.equal(result.headers.get('Content-Type'), 'application/json');

      const missing = makeResponse();
      await handler(makeArticleRequest('99'), missing.response);
      assert.deepEqual(JSON.parse(missing.messages[0]).objects,
        [{ type, records: [] }]);

      fail = true;
      const failure = makeResponse();
      await handler(makeArticleRequest('7'), failure.response);
      assert.equal(failure.state.statusCode, 500);
      assert.equal(failure.state.ended, 1);
      assert.deepEqual(failure.messages, []);
    } finally {
      lookup.mock.restore();
    }
  });
}


test('permalink omits a null byline without a lookup', async () => {
  const lookup = mock.method(PermalinksRow, 'getPermalink', async () =>
    new PermalinksRow({ id: 1, article_id: 7 }, true));
  const load = mock.method(ArticlesRow.prototype, 'loadSimple',
    async function (this: ArticlesRow) {
      this.assumeClean('author_id', 2);
      this.assumeClean('byline_id', null);
    });
  const byline = mock.method(BylinesRow, 'findById', async () => {
    throw new Error('Unexpected byline lookup');
  });
  try {
    const result = makeResponse();
    await getArticleByPermalink({
      params: { permalink: 'example' },
    } as unknown as Request, result.response);
    assert.equal(result.state.statusCode, 200);
    const record = JSON.parse(result.messages[0]).objects[0].records[0];
    assert.equal(record.byline_id, null);
    assert.equal(Object.hasOwn(record, 'byline'), false);
    assert.equal(byline.mock.callCount(), 0);
  } finally {
    lookup.mock.restore();
    load.mock.restore();
    byline.mock.restore();
  }
});
