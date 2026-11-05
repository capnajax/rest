import { Application, createRouteContext, Request, Response } from 'filamentjs';
import { PoolClient } from 'pg';
import { ArticlesRecord } from '../data/generated/_articles-row-base.js';
import { ImmutableRow } from '../data/orm/immutable-row.js';
import { MutableRow } from '../data/orm/mutable-row.js';
import { ReferenceData } from '../data/orm/reference-data.js';
import { getConnection, returnConnection } from '../data/query.js';
import {
  ArticlesFilter,
  ArticlesRow,
  GetArticlesOptions,
} from '../data/tables/articles-row.js';
import { ContentTypesRow } from '../data/tables/content-types-row.js';
import { FormFactorsRow } from '../data/tables/form-factors-row.js';
import { TagsRow } from '../data/tables/tags-row.js';
import { ANALYTICS_ENABLED, PUBLIC } from '../meta/defaults.js';
import { AppMeta } from '../meta/meta-types.js';
import { InvalidQuery } from '../util/exceptions.js';
import { getLogger } from '../util/logger.js';
import {
  assertPGableInteger,
  assertPGableIntegerArray,
  assertRecord,
  earlierDate,
  isNumberOrNumberArray,
  isRecord,
  isValidDate,
  normalizeArray,
  normalizeDate,
  randomString,
} from '../util/tools.js';

const MODULE = 'data-routes';

const DEFAULT_LIMIT = 100;

/* @@head Inputs


`7MMF'                                  mm
  MM                                    MM
  MM  `7MMpMMMb. `7MMpdMAo.`7MM  `7MM mmMMmm ,pP"Ybd
  MM    MM    MM   MM   `Wb  MM    MM   MM   8I   `"
  MM    MM    MM   MM    M8  MM    MM   MM   `YMMMa.
  MM    MM    MM   MM   ,AP  MM    MM   MM   L.   I8
.JMML..JMML  JMML. MMbmmd'   `Mbod"YML. `MbmoM9mmmP'
                   MM
                 .JMML.
 */

const articleSearchFilterTypes = ['feed', 'sidebar'];
type ArticleSearchFilterType = 'feed' | 'sidebar';

interface ArticleSearchFilter {
  /**
   * SearchSequence is provided in case two searches of a type come in rapid
   * succession, the larger searchSequence number takes precedent, and any
   * filters or results with a lower searchSequence are discarded.
   */
  searchSequence: number;
  /**
   * Type is required. Searches are indexed by type and searchSequence, and
   * searchSquences only override earlier searches of the same type
   */
  type: ArticleSearchFilterType;
  tagId?: number | number[];
  limit?: number; // default is DEFAULT_LIMIT
  offset?: number; // default 0
}
/**
 * Requests to get a complete object by their ids
 */
interface ObjectsRequest {
  articles?: ObjectsRequestFilterNoAll;
  /**
   * This is mostly bupkis, if any content types or form factors are requested,
   * all the content types and form factors will be returned.
   */
  contentTypes?: ObjectsRequestFilter;
  /**
   * This is mostly bupkis, if any content types or form factors are requested,
   * all the content types and form factors will be returned.
   */
  formFactors?: ObjectsRequestFilter;
  tags?: ObjectsRequestFilter;

}

/**
 * The same as `GetRowsRequest` except that requests for all (either `true` or
 * value with `id` set to `'all'` are forbidden)
 */
export type ObjectsRequestFilterNoAll =
  | false
  | number
  | number[]
  | ObjectsRequestFilterObjNoAll;
export type ObjectsRequestFilter =
  | boolean
  | number
  | number[]
  | ObjectsRequestFilterObj;
export type TagsRequestFilter =
  | boolean
  | number
  | number[]
  | TagsRequestFilterObj;
interface ObjectsRequestFilterObj {
  id: number | number[] | 'all'; // 'all' is disallowed for articles
  ifModifiedSince?: Date | string;
}
interface TagsRequestFilterObj {
  id: number | number[] | 'all'; // 'all' is disallowed for articles
  important?: boolean; // only used for tags
  ifModifiedSince?: Date | string;
}
interface ObjectsRequestFilterObjNoAll {
  id: number | number[]; // 'all' is disallowed for articles
  ifModifiedSince?: Date | string;
}

/**
 * Interface the `filters` value of the searchRequest must fit. Some possible
 * values here will be rejected by isSearchFilters as listed in that function's
 * comments
 */
interface SearchFilters {
  article?: ArticleSearchFilter;
}

interface SearchOptions {
  stream?: boolean;
}

interface NormalizedObjectsRequests {
  articles?: NormalizedObjectsRequestFilterNoAll;
  contentTypes?: true;
  tags?: NormalizedTagsRequestFilter;
}
interface NormalizedObjectsRequestFilter {
  id: number[] | 'all';
  ifModifiedSince?: Date;
}
interface NormalizedObjectsRequestFilterNoAll {
  id: number[];
  ifModifiedSince?: Date;
}
interface NormalizedTagsRequestFilter extends NormalizedObjectsRequestFilter {
  important?: true;
}
interface NormalizedArticleSearchFilter {
  searchSequence: number;
  type: ArticleSearchFilterType;
  tagId?: number[];
  limit: number;
  offset: number;
}
interface NormalizedSearchFilters {
  article?: NormalizedArticleSearchFilter;
}
interface NormalizedSearchOptions {
  stream: boolean;
}
interface NormalizedSearchRequest {
  objects: NormalizedObjectsRequests;
  filters: NormalizedSearchFilters[];
  options: NormalizedSearchOptions;
}

function searchObjectReducer(
  accumulator: NormalizedObjectsRequests,
  o?: NormalizedObjectsRequests
): NormalizedObjectsRequests {
  if (!o) {
    return accumulator;
  }

  // articles
  if (accumulator.articles) {
    if (o.articles) {
      accumulator.articles.id.push(...o.articles.id);
      // ifModifiedSince - use earlier date, undefined trumps any date
      if (accumulator.articles.ifModifiedSince) {
        if (o.articles.ifModifiedSince) {
          accumulator.articles.ifModifiedSince = earlierDate(
            accumulator.articles.ifModifiedSince,
            o.articles.ifModifiedSince
          );
        } else {
          delete accumulator.articles.ifModifiedSince;
        }
      }
    }
  } else if (o.articles) {
    accumulator.articles = o.articles;
  }

  // contentTypes
  if (!accumulator.contentTypes && o.contentTypes) {
    accumulator.contentTypes = o.contentTypes;
  }

  // tags
  if (accumulator.tags) {
    // tags.id cannot change after 'all' has been established
    if (accumulator.tags?.id !== 'all') {
      if (o.tags?.id === 'all') {
        accumulator.tags.id = 'all';
      } else if (o.tags) {
        accumulator.tags.id.push(...o.tags.id);
        // ifModifiedSince - use earlier date, undefined trumps any date
        if (accumulator.tags.ifModifiedSince) {
          if (o.tags.ifModifiedSince) {
            accumulator.tags.ifModifiedSince = earlierDate(
              accumulator.tags.ifModifiedSince,
              o.tags.ifModifiedSince
            );
          } else {
            delete accumulator.tags.ifModifiedSince;
          }
        }
      }
    }
  } else if (o.tags) {
    accumulator.tags = o.tags;
  }

  return accumulator;
}

/* @@head Outputs


  .g8""8q.                mm                          mm
.dP'    `YM.              MM                          MM
dM'      `MM `7MM  `7MM mmMMmm `7MMpdMAo.`7MM  `7MM mmMMmm ,pP"Ybd
MM        MM   MM    MM   MM     MM   `Wb  MM    MM   MM   8I   `"
MM.      ,MP   MM    MM   MM     MM    M8  MM    MM   MM   `YMMMa.
`Mb.    ,dP'   MM    MM   MM     MM   ,AP  MM    MM   MM   L.   I8
  `"bmmd"'     `Mbod"YML. `Mbmo  MMbmmd'   `Mbod"YML. `MbmoM9mmmP'
                                 MM
                               .JMML.
 */

type TableKey = 'article' | 'contentType' | 'formFactor' | 'tag';
const tableKeys: TableKey[] = ['article', 'contentType', 'formFactor', 'tag'];
interface TableUpdate {
  id: number;
  [key: string]: unknown;
}
interface TableResults {
  type: TableKey;
  records: TableUpdate[];
}
interface ResultIdSet {
  /**
   * The ids of the objects found by the search. The records can be provided in
   * a separate request, or can be included in the `Updates.objects`.
   */
  ids: Partial<MutableRow | ImmutableRow>[];
  /**
   *  The number of results that would have been produced if they were not
   *  limited. Provide the number if known, `has-more` if the number is not
   *  known but it is known that there are more results available, `no-more`
   *  if it is known that there are no more results available, and leave
   *  `undefined` if it is now known if there are more or not.
   */
  quantity?: number | 'has-more' | 'no-more';
  offset?: number;
}
interface BaseSearchResults {
  searchSequence: number;
  type: ArticleSearchFilterType;
}
interface ArticleFeedSearchResults extends BaseSearchResults {
  type: 'feed';
  result: ResultIdSet;
}
interface ArticleSidebarSearchResults extends BaseSearchResults {
  type: 'sidebar';
  featured: ResultIdSet;
  cheatNotes: ResultIdSet;
}
type SearchResults = ArticleFeedSearchResults | ArticleSidebarSearchResults;
interface UpdateStatus {
  /**
   *  The server date of the request. Set at the time the request is received.
   */
  date: Date;
  /**
   *  If `status.panic` is set to a non-empty string, trigger a panic on the
   *  client side. The server logs should also contain the same string, along
   *  with additional information, so we can search the logs for the error.
   */
  panic?: string;
  session?: {
    /**
     *  Whether the user is authenticated:
     *  - `anonymous` the user has not authenticated
     *  - `pending` awaiting TFA
     *  - `low` the device has a cookie that's old, not appropriate for
     *     sensitive actions
     *  - `high` the user recently authenticated and can do sensitive things
     */
    authentication: 'anonymous' | 'pending' | 'low' | 'high';
  };
}
interface Updates {
  /**
   *  The results of searches
   */
  searches?: SearchResults[];

  /**
   *  Table data, including reference tables. There is no requirement that these
   *  objects have complete information about a table row, a search can include
   *  partial table objects for its first few results to improve its perceived
   *  speed, but records that come from `ObjectsRequest` queries should be
   *  complete.
   */
  objects?: TableResults[];

  status: UpdateStatus;
}

function normalizeRequestBody(req: Request): NormalizedSearchRequest {
  let stage = 'parse';
  try {
    const body = JSON.parse(req.body?.toString() || '{}');
    stage = 'normalize';
    return normalizeSearchRequest(body);
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

/**
 * Combines a set of table results together, favouring the last table if there
 * is a conflict. It's assumed the `id` is the same on all tables.
 */
function combineObjects(tableResults: TableResults[]): TableResults[] {
  const objects: Partial<Record<TableKey, Record<string, TableUpdate>>> = {};

  for (const tr of tableResults) {
    objects[tr.type] ??= {};
    const otr = objects[tr.type] as Record<string, TableUpdate>;
    for (const record of tr.records) {
      const orec = otr[`${record.id}`];
      if (orec) {
        for (const rk of Object.keys(record)) {
          if (rk === 'id') continue;
          orec[rk] = record[rk];
        }
      } else {
        otr[`${record.id}`] = { ...record };
      }
    }
  }

  const result: TableResults[] = [];
  for (const rk of tableKeys) {
    if (!objects[rk]) continue;
    result.push({
      type: rk,
      records: Object.values(objects[rk]),
    });
  }

  return result;
}

function filterSearches(searchResults: SearchResults[]): SearchResults[] {
  const result: SearchResults[] = [];
  for (const sr of searchResults) {
    const i = result.findIndex((r) => sr.type === r.type);
    if (i === -1) {
      result.push(sr);
    } else {
      if (result[i].searchSequence <= sr.searchSequence) {
        result[i] = sr;
      }
    }
  }

  return result;
}

/**
 * Comines several updates objects into one.
 * @param updates the updates to combine
 * @return the combined update
 */
function combineUpdates(updates: Updates[]): Updates | null {
  if (updates.length === 0) {
    return null;
  }

  const result: Updates = {
    // use the last update's status
    status: updates[updates.length - 1].status,
  };

  const updateObjects = updates
    .map((u) => u.objects)
    .filter((o) => o) as TableResults[][];
  if (updateObjects.length) {
    const objectsResults = combineObjects(updateObjects.flat());
    if (objectsResults.length) {
      result.objects = objectsResults;
    }
  }

  const updateSearchs = updates
    .map((u) => u.searches)
    .filter((s) => s) as SearchResults[][];
  if (updateSearchs.length) {
    const searchResults = filterSearches(updateSearchs.flat());
    if (searchResults.length) {
      result.searches = searchResults;
    }
  }

  return result;
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
  private _status: UpdateStatus;

  constructor(status: UpdateStatus) {
    this._status = status;
  }

  get hasException(): boolean {
    return this._exceptionedOut;
  }
  get status(): UpdateStatus {
    return this._status;
  }
  set status(newStatus: UpdateStatus) {
    this._status = newStatus;
  }

  exceptionOut() {
    this._exceptionedOut = true;
  }

  abstract end(): Promise<void>;

  abstract object(type: TableResults[]): Promise<void>;
  abstract object(type: TableKey, records: TableUpdate[]): Promise<void>;
  abstract object(type: TableKey|(TableResults[]), records?: TableUpdate[])
  : Promise<void>;

  abstract searchResults(searchResults: SearchResults): Promise<void>;
}

/**
 * This class is intended to be used for end points that only return objects,
 * not search results and support the if-modified-since header.
 */
class ObjectWithIMSResponseHandler extends OutputHandler {
  private static MODULE = `${MODULE}.ObjectWithIMSResponseHandler`;
  private objects: TableResults[] = [];
  notModified: boolean = false;
  private res: Response;
  constructor(res: Response, status: UpdateStatus) {
    super(status);
    this.res = res;
  }
  object(type: TableResults[]): Promise<void>;
  object(type: TableKey, records: TableUpdate[]): Promise<void>;
  async object(type: TableKey|(TableResults[]), records?: TableUpdate[])
  : Promise<void> {
    if (typeof type === 'string') {
      this.objects.push({
        type: type as TableKey, records: records as TableUpdate[]}
      )
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
      await this.res.send(JSON.stringify({
        objects: this.objects,
        status: this.status
      }));
    }
  }

  async searchResults(searchResults: SearchResults): Promise<void> {
    const log = getLogger(ObjectWithIMSResponseHandler.MODULE, 'searchResults');
    log.error('searchResults not implemented for ObjectWithIMSResponseHandler');
  };
}

class CombinedResponseHandler extends OutputHandler {
  private accumulator?: Updates[];
  private hasUpdate: boolean = false;
  private res: Response;
  private stream: boolean;

  constructor(res: Response, stream: boolean, status: UpdateStatus) {
    super(status)
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
      const resultUpdates: Updates | null = combineUpdates(
        this.accumulator as Updates[]
      );
      await this.res.send(JSON.stringify(resultUpdates || nullMessage));
    }
    await this.res.end();
  }

  object(type: TableResults[]): Promise<void>;
  object(type: TableKey, records: TableUpdate[]): Promise<void>;
  async object(type: TableKey|(TableResults[]), records?: TableUpdate[])
  : Promise<void> {
    if (this.hasException) return;
    const t: Updates = {
      objects: typeof type === 'string'
        ? [{type: type as TableKey, records: records as TableUpdate[]}]
        : type as TableResults[],
      status: this.status
    };
    if (this.stream) {
      this.hasUpdate = true;
      await this.res.sendChunk(JSON.stringify(t) + '\n');
    } else {
      this.accumulator?.push(t as Updates);
    }
  }

  async searchResults(searchResults: SearchResults): Promise<void> {
    if (this.hasException) return;
    const t: Updates = {
      searches: [searchResults],
      status: this.status
    };
    if (this.stream) {
      this.hasUpdate = true;
      await this.res.sendChunk(JSON.stringify(t) + '\n');
    } else {
      this.accumulator?.push(t as Updates);
    }
  }
}

/** Handles complete article records and waits for every streamed write. */
async function handleArticleObjects(
  filter: NormalizedObjectsRequestFilterNoAll,
  out: OutputHandler,
  searchException: (error: unknown) => void
): Promise<void> {
  const articleWrites: Promise<void>[] = [];
  const getArticlesOptions: GetArticlesOptions | undefined =
    filter.ifModifiedSince
      ? { ifModifiedSince: filter.ifModifiedSince }
      : undefined;
  await ArticlesRow.getArticlesByIds(
    filter.id,
    (articles) => {
      const write = out.object(
        'article',
        articles.map((a: ArticlesRow): TableUpdate => {
          return a.exportRecord() as TableUpdate;
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
          (row) => row.toJSON() as TableUpdate
        ),
      },
      {
        type: 'formFactor',
        records: ReferenceData.all(FormFactorsRow).map(
          (row) => row.toJSON() as TableUpdate
        ),
      },
    ]);
}

async function handleTagObjects(
  filter: NormalizedTagsRequestFilter,
  out: OutputHandler,
  searchException: (error: unknown) => void
): Promise<void> {
  const tagWrites: Promise<void>[] = [];

  await TagsRow.getTags(filter, (tags) => {
    const write = out.object(
      'tag',
      tags.map((tag) => tag.exportRecord() as TableUpdate)
    );

    // Handle failures immediately while retaining the write for completion.
    tagWrites.push(write);
    void write.catch(searchException);
  }).then(() => Promise.all(tagWrites));
}

async function handleFeedSearch(
  af: NormalizedArticleSearchFilter,
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
    })
  });
}

async function handleSidebarSearch(
  af: NormalizedArticleSearchFilter,
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
      })
    });
}

/** Selects the latest search of each type and shares one connection. */
async function handleArticleSearches(
  filters: NormalizedSearchFilters[],
  out: OutputHandler
): Promise<void> {
  const latest: Partial<
    Record<ArticleSearchFilterType, NormalizedArticleSearchFilter>
  > = {};
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
  body: NormalizedSearchRequest
): Promise<void> {
  const log = getLogger(MODULE, 'handleDataRequest');
  /* Share output state across every object and search handler. */
  const status: UpdateStatus = { date: new Date() };

  const out =
    new CombinedResponseHandler(res, body.options.stream, status);

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
    let body: NormalizedSearchRequest;
    try {
      body = normalizeSearchRequest(structuredClone(input));
    } catch (error) {
      await rejectDataRequest(res, error);
      return;
    }
    await handleDataRequest(res, body);
  };
}

/** Returns articles filtered by the optional modification date. */
export async function getArticleObjects(req: Request, res: Response)
: Promise<void> {
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
  const options: GetArticlesOptions = {};
  if (Number.isFinite(since)) {
    options.ifModifiedSince = new Date(since);
  }

  const status: UpdateStatus = { date: new Date() };
  const records: TableUpdate[] = [];
  try {
    await ArticlesRow.getArticlesByIds(ids, (articles) => {
      records.push(...articles.map((article) => article.exportRecord()));
    }, options);
  } catch (error) {
    getLogger(MODULE, 'getArticleObjects').error(
      'Failed to load articles: %s', error
    );
    res.statusCode = 500;
    await res.end();
    return;
  }

  /* HTTP dates have second precision. */
  const timestamps = records.map((record) =>
    record.last_update instanceof Date
      ? record.last_update.getTime()
      : NaN
  );
  const canValidate = timestamps.length > 0 &&
    timestamps.every(Number.isFinite);
  const out = new ObjectWithIMSResponseHandler(res, status);
  if (canValidate) {
    const latest = timestamps.reduce((a, b) => Math.max(a, b));
    const lastModified = Math.floor(latest / 1000) * 1000;
    res.headers.set('Last-Modified', new Date(lastModified).toUTCString());
  }
  out.notModified = options.ifModifiedSince !== undefined &&
    records.length === 0;
  if (!out.notModified) {
    await out.object('article', records);
  }
  await out.end();
}

/** Returns tags selected by numeric IDs, 'all', or 'important'. */
export async function getTagObjects(req: Request, res: Response)
: Promise<void> {
  if (req.params.ids === undefined) {
    res.statusCode = 404;
    await res.end();
    return;
  }

  const filters: { important?:boolean } = {};

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

  const status: UpdateStatus = { date: new Date() };
  const records: TableUpdate[] = [];
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
    getLogger(MODULE, 'getTagObjects').error(
      'Failed to load tags: %s', error
    );
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

  ctx.get('/', PUBLIC, (req, res) => {
    const body: NormalizedSearchRequest = {
      objects: {
        contentTypes: true,
        tags: { id: 'all' }
      },
      filters: [{
        article: {
          searchSequence: 1,
          limit: 20,
          offset: 0,
          type: 'feed'
        }
      },{
        article: {
          searchSequence: 1,
          limit: 8,
          offset: 0,
          type: 'sidebar'
        }
      }],
      options: {
        stream: false
      }
    };
    return handleDataRequest(res, body);
  });

  ctx.get('/articles/:ids', PUBLIC, getArticleObjects);
  ctx.get('/tags/:ids', PUBLIC, getTagObjects);

  ctx.put('/', PUBLIC, (req, res) => {
    let body!: NormalizedSearchRequest;
    try {
      body = normalizeRequestBody(req);
    } catch (e) {
      return rejectDataRequest(res, e);
    }

    return handleDataRequest(res, body);
  });

  log.info('Data routes registered');
}

//
//  Typeguards, Assertions, and normalizers
//

/* @@head Asserts


      db                                         mm
     ;MM:                                        MM
    ,V^MM.    ,pP"Ybd ,pP"Ybd  .gP"Ya `7Mb,od8 mmMMmm ,pP"Ybd
   ,M  `MM    8I   `" 8I   `" ,M'   Yb  MM' "'   MM   8I   `"
   AbmmmqMA   `YMMMa. `YMMMa. 8M""""""  MM       MM   `YMMMa.
  A'     VML  L.   I8 L.   I8 YM.    ,  MM       MM   L.   I8
.AMA.   .AMMA.M9mmmP' M9mmmP'  `Mbmmd'.JMML.     `MbmoM9mmmP'


 */

function assertArticleSearchFilter(
  value: unknown
): asserts value is ArticleSearchFilter {
  if (!isArticleSearchFilter(value)) {
    throw new TypeError('Expected a ArticleSearchFilter');
  }
}
function assertGetRequest(value: unknown): asserts value is ObjectsRequest {
  if (!isObjectsRequest(value)) {
    throw new TypeError('Expected a GetRequest');
  }
}
function assertGetRowsRequest(
  value: unknown
): asserts value is ObjectsRequestFilter {
  if (!isObjectsRequestFilter(value)) {
    throw new TypeError('Expected a ObjectsRequestFilter');
  }
}
function assertGetRowsRequestNoAll(
  value: unknown
): asserts value is ObjectsRequestFilterNoAll {
  if (!isObjectsRequestFilterNoAll(value)) {
    throw new TypeError('Expected a ObjectsRequestFilterNoAll');
  }
}
function assertGetTagsRowsRequest(
  value: unknown
): asserts value is TagsRequestFilter {
  if (!isTagsRequestFilter(value)) {
    throw new TypeError('Expected a TagsRequestFilter');
  }
}
function assertSearchFilters(value: unknown): asserts value is SearchFilters {
  if (!isSearchFilters(value)) {
    throw new TypeError('Expected a SearchRequest');
  }
}
function assertSearchOptions(value: unknown): asserts value is SearchOptions {
  if (!isSearchOptions(value)) {
    throw new TypeError('Expected SearchOptions');
  }
}

/* @@head Typegrds

                                                                ,,
MMP""MM""YMM                                                  `7MM
P'   MM   `7                                                    MM
     MM `7M'   `MF'`7MMpdMAo.  .gP"Ya   .P"Ybmmm `7Mb,od8  ,M""bMM  ,pP"Ybd
     MM   VA   ,V    MM   `Wb ,M'   Yb :MI  I8     MM' "',AP    MM  8I   `"
     MM    VA ,V     MM    M8 8M""""""  WmmmP"     MM    8MI    MM  `YMMMa.
     MM     VVV      MM   ,AP YM.    , 8M          MM    `Mb    MM  L.   I8
   .JMML.   ,V       MMbmmd'   `Mbmmd'  YMMMMMb  .JMML.   `Wbmd"MML.M9mmmP'
           ,V        MM                6'     dP
        OOb"       .JMML.              Ybmmmd'
 */

function isArticleSearchFilter(value: unknown): value is ArticleSearchFilter {
  return (
    isRecord(value) &&
    typeof value.searchSequence === 'number' &&
    isArticleSearchFilterType(value.type) &&
    (value.tagId === undefined || isNumberOrNumberArray(value.tagId)) &&
    (value.limit === undefined || typeof value.limit === 'number') &&
    (value.offset === undefined || typeof value.offset === 'number')
  );
}
function isArticleSearchFilterType(
  value: unknown
): value is ArticleSearchFilterType {
  return typeof value === 'string' && articleSearchFilterTypes.includes(value);
}
function isObjectsRequest(value: unknown): value is ObjectsRequest {
  return (
    isRecord(value) &&
    (value.articles === undefined ||
      isObjectsRequestFilterNoAll(value.articles)) &&
    (value.contentTypes === undefined ||
      isObjectsRequestFilter(value.contentTypes)) &&
    (value.formFactors === undefined ||
      isObjectsRequestFilter(value.formFactors)) &&
    (value.tags === undefined || isTagsRequestFilter(value.tags))
  );
}
function isObjectsRequestFilter(value: unknown): value is ObjectsRequestFilter {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((n) => typeof n === 'number')) ||
    (isRecord(value) &&
      (isNumberOrNumberArray(value.id) || value.id === 'all') &&
      (value.ifModifiedSince === undefined ||
        isValidDate(value.ifModifiedSince)))
  );
}
function isTagsRequestFilter(value: unknown): value is TagsRequestFilter {
  return (
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((n) => typeof n === 'number')) ||
    (isRecord(value) &&
      (isNumberOrNumberArray(value.id) || value.id === 'all') &&
      (value.important === undefined || typeof value.important === 'boolean') &&
      (value.ifModifiedSince === undefined ||
        isValidDate(value.ifModifiedSince)))
  );
}
function isObjectsRequestFilterNoAll(
  value: unknown
): value is ObjectsRequestFilterNoAll {
  return (
    value === false ||
    typeof value === 'number' ||
    (Array.isArray(value) && value.every((n) => typeof n === 'number')) ||
    (isRecord(value) &&
      isNumberOrNumberArray(value.id) &&
      (value.ifModifiedSince === undefined ||
        isValidDate(value.ifModifiedSince)))
  );
}
function isSearchFilters(value: unknown): value is SearchFilters {
  // tests for permitted values
  return (
    isRecord(value) &&
    (value.article === undefined || isArticleSearchFilter(value.article))
  );
}
function isSearchOptions(value: unknown): value is SearchOptions {
  return (
    isRecord(value) &&
    value !== null &&
    (value.stream === undefined || typeof value.stream === 'boolean')
  );
}

/* @@head Normzrs


`7MN.   `7MF'
  MMN.    M
  M YMb   M  ,pW"Wq.`7Mb,od8 `7MMpMMMb.pMMMb.  M"""MMV `7Mb,od8 ,pP"Ybd
  M  `MN. M 6W'   `Wb MM' "'   MM    MM    MM  '  AMV    MM' "' 8I   `"
  M   `MM.M 8M     M8 MM       MM    MM    MM    AMV     MM     `YMMMa.
  M     YMM YA.   ,A9 MM       MM    MM    MM   AMV  ,   MM     L.   I8
.JML.    YM  `Ybmd9'.JMML.   .JMML  JMML  JMML.AMMmmmM .JMML.   M9mmmP'


 */

function normalizeArticleSearchFilter(
  value: unknown
): NormalizedArticleSearchFilter {
  assertArticleSearchFilter(value);
  const result: NormalizedArticleSearchFilter = {
    searchSequence: value.searchSequence,
    type: value.type,
    limit: value.limit ?? DEFAULT_LIMIT,
    offset: value.offset ?? 0,
  };
  assertPGableInteger(result.limit, { gezero: true });
  assertPGableInteger(result.offset, { gezero: true });
  if (!Number.isFinite(result.searchSequence)) {
    throw new InvalidQuery('Expected a finite search sequence.');
  }
  if (value.tagId) {
    result.tagId = normalizeArray(value.tagId);
    assertPGableIntegerArray(result.tagId);
  }
  return result;
}
function normalizeObjectRequests(value: unknown): NormalizedObjectsRequests {
  assertGetRequest(value);
  const result: NormalizedObjectsRequests = {};
  // false or undefined means the same, and `true` is disallowed by the assert
  if (value.articles) {
    result.articles = normalizeObjectsRequestFilterNoAll(value.articles);
  }
  if (value.contentTypes || value.formFactors) {
    result.contentTypes = true;
  }
  if (value.tags) {
    result.tags = normalizeTagsRequestFilter(value.tags);
  }
  return result;
}
function normalizeObjectsRequestFilter(
  value: unknown
): NormalizedObjectsRequestFilter {
  assertGetRowsRequest(value);
  if (typeof value === 'boolean') {
    return { id: 'all' };
  }
  if (isNumberOrNumberArray(value)) {
    return { id: normalizeArray(value) };
  }
  const result: NormalizedObjectsRequestFilter = {
    id: value.id === 'all' ? value.id : normalizeArray(value.id),
  };
  if (value.ifModifiedSince) {
    result.ifModifiedSince = normalizeDate(value.ifModifiedSince);
  }
  return result;
}
function normalizeTagsRequestFilter(
  value: unknown
): NormalizedTagsRequestFilter {
  assertGetTagsRowsRequest(value);
  if (typeof value === 'boolean') {
    return { id: 'all' };
  }
  if (isNumberOrNumberArray(value)) {
    return { id: normalizeArray(value) };
  }
  const result: NormalizedTagsRequestFilter = {
    id: value.id === 'all' ? value.id : normalizeArray(value.id),
  };
  if (value.important) {
    result.important = true;
  }
  if (value.ifModifiedSince) {
    result.ifModifiedSince = normalizeDate(value.ifModifiedSince);
  }
  return result;
}
function normalizeObjectsRequestFilterNoAll(
  value: unknown
): NormalizedObjectsRequestFilterNoAll {
  assertGetRowsRequestNoAll(value);
  if (value === false) {
    return { id: [] };
  }
  if (isNumberOrNumberArray(value)) {
    const result = { id: normalizeArray(value) };
    assertPGableIntegerArray(result.id);
    return result;
  }
  const result: NormalizedObjectsRequestFilterNoAll = {
    id: normalizeArray(value.id),
  };
  if (value.ifModifiedSince) {
    result.ifModifiedSince = normalizeDate(value.ifModifiedSince);
  }
  assertPGableIntegerArray(result.id);
  return result;
}
function normalizeSearchFilters(value: unknown): NormalizedSearchFilters {
  assertSearchFilters(value);
  const result: NormalizedSearchFilters = {};
  if (value.article !== undefined) {
    result.article = normalizeArticleSearchFilter(value.article);
  }
  return result;
}
function normalizeSearchOptions(value: unknown): NormalizedSearchOptions {
  assertSearchOptions(value);
  return {
    stream: !!value.stream,
  };
}
function normalizeSearchRequest(value: unknown): NormalizedSearchRequest {
  assertRecord(value);
  const objects: NormalizedObjectsRequests = value.objects
    ? Array.isArray(value.objects)
      ? value.objects
          .map((o) => normalizeObjectRequests(o))
          .reduce(searchObjectReducer, {})
      : normalizeObjectRequests(value.objects)
    : {};
  const filters: NormalizedSearchFilters[] = value.filters
    ? Array.isArray(value.filters)
      ? (() => {
          const normalized = value.filters.map((f) =>
            normalizeSearchFilters(f)
          );
          const highestSequence: Partial<
            Record<ArticleSearchFilterType, number>
          > = {};
          const result: NormalizedSearchFilters[] = [];
          for (const af of normalized) {
            if (af.article) {
              const seq = af.article.searchSequence;
              const type = af.article.type;
              if (
                undefined === highestSequence[type] ||
                seq >= highestSequence[type]
              ) {
                highestSequence[type] = seq;
                result.push(af);
              }
            }
          }
          return result;
        })()
      : [normalizeSearchFilters(value.filters)]
    : [];
  const options = normalizeSearchOptions(value.options || {});
  return { objects, filters, options };
}
