import { Application, createRouteContext, Request, Response } from 'filamentjs';
import { PoolClient } from 'pg';
import { ReferenceData } from '../data/orm/reference-data.js';
import { getConnection, returnConnection } from '../data/query.js';
import {
  ArticlesFilter,
  ArticlesRow,
  GetArticlesOptionsInput,
} from '../data/tables/articles-row.js';
import { ContentTypesRow } from '../data/tables/content-types-row.js';
import { FormFactorsRow } from '../data/tables/form-factors-row.js';
import { TagsRow } from '../data/tables/tags-row.js';
import { ANALYTICS_ENABLED, PUBLIC } from '../meta/defaults.js';
import { AppMeta } from '../meta/meta-types.js';
import { InvalidQuery } from '../util/exceptions.js';
import { getLogger } from '../util/logger.js';
import { assertPGableIntegerArray, randomString } from '../util/tools.js';
import type { ArticleSearchType } from './data-contracts/input.js';
import {
  NormalizedArticleSearch,
  NormalizedDataRequest,
  NormalizedObjectIdSelection,
  NormalizedSearchFilters,
  NormalizedTagSelection,
  normalizeDataRequest,
} from './data-contracts/normalizers.js';
import {
  ArticleSearchResult,
  combineDataResponses,
  DataResponse,
  DataResponseStatus,
  ObjectBatch,
  ObjectPatch,
  ResultIdSet,
  TableKey,
} from './data-contracts/output.js';

const MODULE = 'data-routes';

function normalizeRequestBody(req: Request): NormalizedDataRequest {
  let stage = 'parse';
  try {
    const body = JSON.parse(req.body?.toString() || '{}');
    stage = 'normalize';
    return normalizeDataRequest(body);
  } catch (e) {
    if (e instanceof InvalidQuery) {
      throw e;
    }
    throw new InvalidQuery('Invalid search request.', {
      stage,
      cause:
        e instanceof Error
          ? { name: e.name, message: e.message, stack: e.stack ?? null }
          : String(e),
    });
  }
}

/* @@head handlers

  ,,                                   ,,    ,,
`7MM                                 `7MM  `7MM
  MM                                   MM    MM
  MMpMMMb.   ,6"Yb.  `7MMpMMMb.   ,M""bMM    MM  .gP"Ya `7Mb,od8 ,pP"Ybd
  MM    MM  8)   MM    MM    MM ,AP    MM    MM ,M'   Yb  MM' "' 8I   `"
  MM    MM   ,pm9MM    MM    MM 8MI    MM    MM 8M""""""  MM     `YMMMa.
  MM    MM  8M   MM    MM    MM `Mb    MM    MM YM.    ,  MM     L.   I8
.JMML  JMML.`Moo9^Yo..JMML  JMML.`Wbmd"MML..JMML.`Mbmmd'.JMML.   M9mmmP'


 */

abstract class OutputHandler {
  private _exceptionedOut: boolean = false;
  private _status: DataResponseStatus;

  constructor(status: DataResponseStatus) {
    this._status = status;
  }

  get hasException(): boolean {
    return this._exceptionedOut;
  }
  get status(): DataResponseStatus {
    return this._status;
  }
  set status(newStatus: DataResponseStatus) {
    this._status = newStatus;
  }

  exceptionOut() {
    this._exceptionedOut = true;
  }

  abstract end(): Promise<void>;

  abstract object(type: ObjectBatch[]): Promise<void>;
  abstract object(type: TableKey, records: ObjectPatch[]): Promise<void>;
  abstract object(
    type: TableKey | ObjectBatch[],
    records?: ObjectPatch[]
  ): Promise<void>;

  abstract searchResults(searchResults: ArticleSearchResult): Promise<void>;
}

/**
 * This class is intended to be used for end points that only return objects,
 * not search results and support the if-modified-since header.
 */
class ObjectWithIMSResponseHandler extends OutputHandler {
  private static MODULE = `${MODULE}.ObjectWithIMSResponseHandler`;
  private objects: ObjectBatch[] = [];
  notModified: boolean = false;
  private res: Response;
  constructor(res: Response, status: DataResponseStatus) {
    super(status);
    this.res = res;
  }
  object(type: ObjectBatch[]): Promise<void>;
  object(type: TableKey, records: ObjectPatch[]): Promise<void>;
  async object(
    type: TableKey | ObjectBatch[],
    records?: ObjectPatch[]
  ): Promise<void> {
    if (typeof type === 'string') {
      this.objects.push({
        type: type as TableKey,
        records: records as ObjectPatch[],
      });
    } else {
      this.objects.push(...type);
    }
  }

  async end(): Promise<void> {
    const log = getLogger(ObjectWithIMSResponseHandler.MODULE, 'end');
    if (this.notModified) {
      if (this.objects.length > 0) {
        log.error('Internal error - notModified set but also objects set');
      } else {
        this.res.statusCode = 304;
        await this.res.end();
        return;
      }
    } else {
      this.res.headers.set('Content-Type', 'application/json');
      await this.res.send(
        JSON.stringify({
          objects: this.objects,
          status: this.status,
        })
      );
    }
  }

  async searchResults(searchResults: ArticleSearchResult): Promise<void> {
    const log = getLogger(ObjectWithIMSResponseHandler.MODULE, 'searchResults');
    log.error('searchResults not implemented for ObjectWithIMSResponseHandler');
  }
}

class CombinedResponseHandler extends OutputHandler {
  private accumulator?: DataResponse[];
  private hasUpdate: boolean = false;
  private res: Response;
  private stream: boolean;

  constructor(res: Response, stream: boolean, status: DataResponseStatus) {
    super(status);
    this.res = res;
    this.stream = stream;
    if (!stream) {
      this.accumulator = [];
    }
    res.headers.set(
      'Content-Type',
      stream ? 'application/x-ndjson' : 'application/json'
    );
  }

  async end(): Promise<void> {
    // message to send if there is nothing to send
    const nullMessage = this.status ? { status: this.status } : {};
    if (this.stream) {
      if (!this.hasUpdate) {
        await this.res.sendChunk(JSON.stringify(nullMessage) + '\n');
      }
    } else {
      const combinedResponse: DataResponse | null = combineDataResponses(
        this.accumulator as DataResponse[]
      );
      await this.res.send(JSON.stringify(combinedResponse || nullMessage));
    }
    await this.res.end();
  }

  object(type: ObjectBatch[]): Promise<void>;
  object(type: TableKey, records: ObjectPatch[]): Promise<void>;
  async object(
    type: TableKey | ObjectBatch[],
    records?: ObjectPatch[]
  ): Promise<void> {
    if (this.hasException) return;
    const t: DataResponse = {
      objects:
        typeof type === 'string'
          ? [{ type: type as TableKey, records: records as ObjectPatch[] }]
          : (type as ObjectBatch[]),
      status: this.status,
    };
    if (this.stream) {
      this.hasUpdate = true;
      await this.res.sendChunk(JSON.stringify(t) + '\n');
    } else {
      this.accumulator?.push(t as DataResponse);
    }
  }

  async searchResults(searchResults: ArticleSearchResult): Promise<void> {
    if (this.hasException) return;
    const t: DataResponse = {
      searches: [searchResults],
      status: this.status,
    };
    if (this.stream) {
      this.hasUpdate = true;
      await this.res.sendChunk(JSON.stringify(t) + '\n');
    } else {
      this.accumulator?.push(t as DataResponse);
    }
  }
}

/** Handles complete article records and waits for every streamed write. */
async function handleArticleObjects(
  filter: NormalizedObjectIdSelection,
  out: OutputHandler,
  searchException: (error: unknown) => void
): Promise<void> {
  const articleWrites: Promise<void>[] = [];
  const getArticlesOptions: GetArticlesOptionsInput | undefined =
    filter.ifModifiedSince
      ? { ifModifiedSince: filter.ifModifiedSince }
      : undefined;
  await ArticlesRow.getArticlesByIds(
    filter.id,
    (articles) => {
      const write = out.object(
        'article',
        articles.map((a: ArticlesRow): ObjectPatch => {
          return a.toJSON() as ObjectPatch;
        })
      );

      // Handle failures now and retain the write for completion.
      articleWrites.push(write);
      void write.catch(searchException);
    },
    getArticlesOptions
  ).then(() => Promise.all(articleWrites));
}

async function handleContentTypeObjects(out: OutputHandler): Promise<void> {
  await out.object([
    {
      type: 'contentType',
      records: ReferenceData.all(ContentTypesRow).map(
        (row) => row.toJSON() as ObjectPatch
      ),
    },
    {
      type: 'formFactor',
      records: ReferenceData.all(FormFactorsRow).map(
        (row) => row.toJSON() as ObjectPatch
      ),
    },
  ]);
}

async function handleTagObjects(
  filter: NormalizedTagSelection,
  out: OutputHandler,
  searchException: (error: unknown) => void
): Promise<void> {
  const tagWrites: Promise<void>[] = [];

  await TagsRow.getTags(filter, (tags) => {
    const write = out.object(
      'tag',
      tags.map((tag) => tag.exportRecord() as ObjectPatch)
    );

    // Handle failures immediately while retaining the write for completion.
    tagWrites.push(write);
    void write.catch(searchException);
  }).then(() => Promise.all(tagWrites));
}

async function handleFeedSearch(
  af: NormalizedArticleSearch,
  out: OutputHandler,
  conn: PoolClient
): Promise<void> {
  const search: ArticlesFilter = {
    is_hidden: false,
    limit: af.limit,
    offset: af.offset,
  };
  af.tagId && (search.tagIds = af.tagId);
  await ArticlesRow.searchArticles(search, conn).then((result) => {
    return out.searchResults({
      searchSequence: af.searchSequence,
      type: 'feed',
      result: {
        ids: result.articles,
        quantity: result.count,
        offset: af.offset,
      },
    });
  });
}

async function handleSidebarSearch(
  af: NormalizedArticleSearch,
  out: OutputHandler,
  conn: PoolClient
): Promise<void> {
  const search: ArticlesFilter = {
    is_hidden: false,
    limit: af.limit,
    offset: af.offset,
  };
  af.tagId && (search.tagIds = af.tagId);
  type resultSetTypes = 'featured' | 'cheatNotes';
  const resultSets: Partial<Record<resultSetTypes, ResultIdSet>> = {};

  await ArticlesRow.searchArticles(
    { types: ['article'], is_featured: true, ...search },
    conn
  )
    .then((result) => {
      resultSets.featured = {
        ids: result.articles,
        quantity: result.count,
        offset: af.offset,
      };
    })
    .then(() => {
      return ArticlesRow.searchArticles({ types: ['cheat'], ...search }, conn);
    })
    .then((result) => {
      resultSets.cheatNotes = {
        ids: result.articles,
        quantity: result.count,
        offset: af.offset,
      };
    })
    .then(() => {
      return out.searchResults({
        searchSequence: af.searchSequence,
        type: 'sidebar',
        ...(resultSets as Record<resultSetTypes, ResultIdSet>),
      });
    });
}

/** Selects the latest search of each type and shares one connection. */
async function handleArticleSearches(
  filters: NormalizedSearchFilters[],
  out: OutputHandler
): Promise<void> {
  const latest: Partial<Record<ArticleSearchType, NormalizedArticleSearch>> =
    {};
  for (const { article } of filters) {
    if (
      article &&
      (latest[article.type] === undefined ||
        article.searchSequence > latest[article.type]!.searchSequence)
    ) {
      latest[article.type] = article;
    }
  }
  if (!latest.feed && !latest.sidebar) return;

  const conn = await getConnection();
  try {
    if (latest.feed) await handleFeedSearch(latest.feed, out, conn);
    if (latest.sidebar) await handleSidebarSearch(latest.sidebar, out, conn);
  } finally {
    returnConnection(conn);
  }
}

/** Runs normalised input independently of the HTTP request method. */
function handleDataRequest(
  res: Response,
  body: NormalizedDataRequest
): Promise<void> {
  const log = getLogger(MODULE, 'handleDataRequest');
  /* Share output state across every object and search handler. */
  const status: DataResponseStatus = { date: new Date() };

  const out = new CombinedResponseHandler(res, body.options.stream, status);

  //
  //  There are multiple searches in this request, and we need to know when
  //  they are all complete, so let's track them.
  //
  return new Promise((resolve, reject) => {
    const sp = new Set<symbol>();
    const searchPending = (name: string) => {
      const handle = Symbol(name);
      sp.add(handle);
      return handle;
    };
    const searchComplete = async (handle: symbol): Promise<void> => {
      if (!out.hasException) {
        if (!sp.has(handle)) throw 'Internal error';
        sp.delete(handle);
        if (sp.size === 0) {
          await out.end();
          resolve();
        }
      }
    };
    const searchException = (e: unknown): void => {
      if (e instanceof InvalidQuery) {
        log.warn('Invalid query: %s; details: %j', e.message, e.details);
      }
      if (out.hasException) {
        return;
      }
      out.exceptionOut();

      void (async () => {
        if (res.disconnected || res.closed) {
          return;
        }

        if (!res.headers.frozen) {
          res.statusCode = e instanceof InvalidQuery ? 400 : 500;
        } else {
          status.panic = randomString();
          // send the panic directly because the exceptionedOut guard is in
          // place now
          await res.sendChunk(JSON.stringify({ status }) + '\n');
        }

        await res.end();
      })().then(() => resolve(), reject);
    };

    // Keep startup pending so a fast handler cannot end the response early.
    const SEARCH_START = searchPending('Search start');

    /* Start independent handlers before allowing completion. */
    if (body.objects.articles) {
      const handle = searchPending('article objects');
      handleArticleObjects(body.objects.articles, out, searchException)
        .then(() => searchComplete(handle))
        .catch(searchException);
    }
    if (body.objects.contentTypes) {
      const handle = searchPending('content types and form factors');
      handleContentTypeObjects(out)
        .then(() => searchComplete(handle))
        .catch(searchException);
    }
    if (body.objects.tags) {
      const handle = searchPending('tag objects');
      handleTagObjects(body.objects.tags, out, searchException)
        .then(() => searchComplete(handle))
        .catch(searchException);
    }
    if (body.filters.some((filter) => filter.article)) {
      const handle = searchPending('article searches');
      handleArticleSearches(body.filters, out)
        .then(() => searchComplete(handle))
        .catch(searchException);
    }

    searchComplete(SEARCH_START).catch(searchException);
  });
}

/**
 * Creates a route handler for preset input, using the same validation as PUT.
 * Normalise per request so request state is never shared between responses.
 * Example: ctx.get('/reference', PUBLIC, createPresetDataHandler({
 *   objects: { contentTypes: true, tags: true },
 * }));
 */
export function createPresetDataHandler(
  input: unknown
): (req: Request, res: Response) => Promise<void> {
  return async (_req, res) => {
    let body: NormalizedDataRequest;
    try {
      body = normalizeDataRequest(structuredClone(input));
    } catch (error) {
      await rejectDataRequest(res, error);
      return;
    }
    await handleDataRequest(res, body);
  };
}

/** Returns articles filtered by the optional modification date. */
export async function getArticleObjects(
  req: Request,
  res: Response
): Promise<void> {
  let ids: number[];
  try {
    const values = req.params.ids.split(',');
    if (values.some((value) => !/^[+-]?\d+$/.test(value))) {
      throw new InvalidQuery('Expected comma-separated integer article IDs.');
    }
    ids = values.map(Number);
    assertPGableIntegerArray(ids);
  } catch (error) {
    await rejectDataRequest(res, error);
    return;
  }

  const header = req.headers.get('If-Modified-Since');
  const since = typeof header === 'string' ? Date.parse(header) : NaN;
  const options: GetArticlesOptionsInput = {};
  if (Number.isFinite(since)) {
    options.ifModifiedSince = new Date(since);
  }

  const status: DataResponseStatus = { date: new Date() };
  const records: ObjectPatch[] = [];
  try {
    await ArticlesRow.getArticlesByIds(
      ids,
      (articles) => {
        for (const article of articles) {
          const patch = article.toJSON() as ObjectPatch;
          const existing = records.find((record) => record.id === patch.id);
          if (existing) {
            Object.assign(existing, patch);
          } else {
            records.push(patch);
          }
        }
      },
      options
    );
  } catch (error) {
    getLogger(MODULE, 'getArticleObjects').error(
      'Failed to load articles: %s',
      error
    );
    res.statusCode = 500;
    await res.end();
    return;
  }

  /* HTTP dates have second precision. */
  const timestamps = records.map((record) =>
    record.last_update instanceof Date ? record.last_update.getTime() : NaN
  );
  const canValidate =
    timestamps.length > 0 && timestamps.every(Number.isFinite);
  const out = new ObjectWithIMSResponseHandler(res, status);
  if (canValidate) {
    const latest = timestamps.reduce((a, b) => Math.max(a, b));
    const lastModified = Math.floor(latest / 1000) * 1000;
    res.headers.set('Last-Modified', new Date(lastModified).toUTCString());
  }
  out.notModified =
    options.ifModifiedSince !== undefined && records.length === 0;
  if (!out.notModified) {
    await out.object('article', records);
  }
  await out.end();
}

/** Returns tags selected by numeric IDs, 'all', or 'important'. */
export async function getTagObjects(
  req: Request,
  res: Response
): Promise<void> {
  if (req.params.ids === undefined) {
    res.statusCode = 404;
    await res.end();
    return;
  }

  const filters: { important?: boolean } = {};

  if (req.params.ids === 'important') {
    filters.important = true;
  }

  let ids: Set<number> | undefined;
  if (req.params.ids !== 'all' && req.params.ids !== 'important') {
    try {
      const values = req.params.ids.split(',');
      if (values.some((value) => !/^[+-]?\d+$/.test(value))) {
        throw new InvalidQuery('Expected comma-separated integer tag IDs.');
      }
      const numbers = values.map(Number);
      assertPGableIntegerArray(numbers);
      ids = new Set(numbers);
    } catch (error) {
      await rejectDataRequest(res, error);
      return;
    }
  }

  const status: DataResponseStatus = { date: new Date() };
  const records: ObjectPatch[] = [];
  try {
    await TagsRow.getTags(filters, (tags) => {
      for (const tag of tags) {
        const record = tag.exportRecord();
        if (ids === undefined || ids.has(record.id)) {
          records.push(record);
        }
      }
    });
  } catch (error) {
    getLogger(MODULE, 'getTagObjects').error('Failed to load tags: %s', error);
    res.statusCode = 500;
    await res.end();
    return;
  }

  const out = new CombinedResponseHandler(res, false, status);
  await out.object('tag', records);
  await out.end();
}

async function rejectDataRequest(res: Response, error: unknown): Promise<void> {
  if (error instanceof InvalidQuery) {
    getLogger(MODULE, 'request').warn(
      'Invalid query: %s; details: %j',
      error.message,
      error.details
    );
  }
  res.statusCode = 400;
  await res.end();
}

export function dataRoutes(app: Application<AppMeta>) {
  const log = getLogger(MODULE, 'dataRoutes');
  const ctx = createRouteContext(app, '/v3/data', ANALYTICS_ENABLED);

  /* @@head Endpoints
  
                                ,,                      ,,
  `7MM"""YMM                  `7MM                      db              mm
    MM    `7                    MM                                      MM
    MM   d    `7MMpMMMb.   ,M""bMM `7MMpdMAo.  ,pW"Wq.`7MM  `7MMpMMMb.mmMMmm ,pP"Ybd
    MMmmMM      MM    MM ,AP    MM   MM   `Wb 6W'   `Wb MM    MM    MM  MM   8I   `"
    MM   Y  ,   MM    MM 8MI    MM   MM    M8 8M     M8 MM    MM    MM  MM   `YMMMa.
    MM     ,M   MM    MM `Mb    MM   MM   ,AP YA.   ,A9 MM    MM    MM  MM   L.   I8
  .JMMmmmmMMM .JMML  JMML.`Wbmd"MML. MMbmmd'   `Ybmd9'.JMML..JMML  JMML.`MbmoM9mmmP'
                                     MM
                                   .JMML.
   */

  ctx.get('/', '', PUBLIC, (req, res) => {
    const body: NormalizedDataRequest = {
      objects: {
        contentTypes: true,
        tags: { id: [], important: true },
      },
      filters: [
        {
          article: {
            searchSequence: 1,
            limit: 20,
            offset: 0,
            type: 'feed',
          },
        },
        {
          article: {
            searchSequence: 1,
            limit: 8,
            offset: 0,
            type: 'sidebar',
          },
        },
      ],
      options: {
        stream: false,
      },
    };
    return handleDataRequest(res, body);
  });

  ctx.get('/articles/:ids', PUBLIC, getArticleObjects);
  ctx.get('/tags/:ids', PUBLIC, getTagObjects);

  ctx.put('/', '', PUBLIC, (req, res) => {
    let body!: NormalizedDataRequest;
    try {
      body = normalizeRequestBody(req);
    } catch (e) {
      return rejectDataRequest(res, e);
    }

    return handleDataRequest(res, body);
  });

  log.info('Data routes registered');
}
