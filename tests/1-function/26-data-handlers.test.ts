import assert from 'node:assert/strict';
import { after, before, mock, test } from 'node:test';
import type { Request, Response } from 'filamentjs';
import { Pool } from 'pg';
import { parsedArgs } from '../../src/args.js';
import { ArticlesRow } from '../../src/data/tables/articles-row.js';
import { TagsRow } from '../../src/data/tables/tags-row.js';
import {
  createPresetDataHandler,
  getArticleObjects,
  getTagObjects,
} from '../../src/routes/data.js';
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
      callback([{ exportRecord: () => ({ id: 7 }) } as ArticlesRow]);
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
          callback([{ exportRecord: () => record } as ArticlesRow]);
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
