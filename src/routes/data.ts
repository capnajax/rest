import { KeyObject } from 'node:crypto';
import { Application, createRouteContext, Request, Response } from 'filamentjs';
import { ArticlesRecord } from '../data/generated/_articles-row-base.js';
import { ReferenceData } from '../data/orm/reference-data.js';
import {
  ArticlesFilter,
  ArticlesRow,
  GetArticlesOptions,
} from '../data/tables/articles-row.js';
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
import { ContentTypesRow } from '../data/tables/content-types-row.js';
import { FormFactorsRow } from '../data/tables/form-factors-row.js';
import { TagsRow } from '../data/tables/tags-row.js';
import { getConnection, returnConnection } from '../data/query.js';
import { PoolClient } from 'pg';
import { MutableRow } from '../data/orm/mutable-row.js';
import { ImmutableRow } from '../data/orm/immutable-row.js';

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
interface ObjectsRequestFilterObj {
  id: number | number[] | 'all'; // 'all' is disallowed for articles
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
  tags?: NormalizedObjectsRequestFilter;
}
interface NormalizedObjectsRequestFilter {
  id: number[] | 'all';
  ifModifiedSince?: Date;
}
interface NormalizedObjectsRequestFilterNoAll {
  id: number[];
  ifModifiedSince?: Date;
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
*/

class OutputHandler {

  private res: Response;
  private stream: boolean;
  private _status?: UpdateStatus;

  private hasUpdate: boolean = false;
  private accumulator?: Updates[];
  private exceptionedOut:boolean = false;

  constructor(res: Response, stream: boolean, status?: UpdateStatus) {
    this.res = res;
    this.stream = stream;
    this._status = status;
    if (!stream) {
      this.accumulator = [];
    }
    res.headers.set(
      'Content-Type',
      stream ? 'application/x-ndjson' : 'application/json'
    );
  }

  get hasException(): boolean { return this.exceptionedOut; }

  get status(): UpdateStatus|undefined { return this._status; }
  set status(newStatus: UpdateStatus) { this._status = newStatus; }

  async end(): Promise<void> {
    // message to send if there is nothing to send
    const nullMessage = this._status ? { status: this._status } : {};
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

  exceptionOut() {
    this.exceptionedOut = true;
  }

  async object (updates: Partial<Updates>): Promise<void> {
    if (this.exceptionedOut) return;
    this._status && (updates.status = this._status);
    if (this.stream) {
      this.hasUpdate = true;
      await this.res.sendChunk(JSON.stringify(updates) + '\n');
    } else {
      this.accumulator?.push(updates as Updates);
    }
  }
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

  ctx.put('/', PUBLIC, (req, res) => {
    const log = getLogger(MODULE, 'GET', '/v3/data/');
    let body!: NormalizedSearchRequest;
    try {
      body = normalizeRequestBody(req);
    } catch (e) {
      if (e instanceof InvalidQuery) {
        log.warn('Invalid query: %s; details: %j', e.message, e.details);
      }
      res.statusCode = 400;
      res.end();
      return;
    }

    const status: UpdateStatus = { date: new Date() };

    const out = new OutputHandler(res, body.options.stream, status);

    //
    //  There are multiple searches in this request, and we need to know when
    //  they are all complete, so let's track them.
    //
    return new Promise((resolve, reject) => {
      const sp: Set<string | symbol> = new Set<string | symbol>();
      const searchPending = (name: string) => {
        const handle = typeof name === 'string' ? Symbol(name) : name;
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

      // create a pending search for starting searches -- just to prevent a fast
      // search from ending the request to early
      const SEARCH_START = searchPending('Search start');

      // get objects data
      if (body.objects.articles) {
        const ARTICLES = searchPending('articles objects');
        const articleWrites: Promise<void>[] = [];
        const getArticlesOptions: GetArticlesOptions | undefined = body.objects
          .articles.ifModifiedSince
          ? { ifModifiedSince: body.objects.articles.ifModifiedSince }
          : undefined;
        ArticlesRow.getArticlesByIds(
          body.objects.articles.id,
          (articles) => {
            const write = out.object({
              objects: [
                {
                  type: 'article',
                  records: articles.map((a: ArticlesRow): TableUpdate => {
                    return a.exportRecord() as TableUpdate;
                  }),
                },
              ],
            });

            // Handle failures now and retain the write for completion.
            articleWrites.push(write);
            void write.catch(searchException);
          },
          getArticlesOptions
        )
          .then(() => Promise.all(articleWrites))
          .then(() => searchComplete(ARTICLES))
          .catch(searchException);
      }

      if (body.objects.contentTypes) {
        const CONTENT_TYPES = searchPending('contentTypes and formFactors');
        out
          .object({
            objects: [
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
            ],
          })
          .then(() => searchComplete(CONTENT_TYPES))
          .catch(searchException);
      }

      if (body.objects.tags) {
        const TAGS = searchPending('tags');
        const tagWrites: Promise<void>[] = [];

        TagsRow.getTags({}, (tags) => {
          const write = out.object({
            objects: [
              {
                type: 'tag',
                records: tags.map((tag) => tag.exportRecord() as TableUpdate),
              },
            ],
          });

          // Handle failures immediately while retaining the write for completion.
          tagWrites.push(write);
          void write.catch(searchException);
        })
          .then(() => Promise.all(tagWrites))
          .then(() => searchComplete(TAGS))
          .catch(searchException);
      }

      if (body.filters?.length) {
        const articleFilters = body.filters.filter((f) => f.article);
        if (articleFilters.length) {
          const ARTICLE_FILTER = searchPending(`filters.article`);
          const feedFilters = articleFilters
            .filter((f) => f.article?.type === 'feed')
            .sort((a, b) => {
              const ass = a.article?.searchSequence as number;
              const bss = b.article?.searchSequence as number;
              return bss - ass; // reverse order by searchSequence
            });
          const feedFilter = feedFilters.length ? feedFilters[0] : null;
          const sidebarFilters = articleFilters
            .filter((f) => f.article?.type === 'sidebar')
            .sort((a, b) => {
              const ass = a.article?.searchSequence as number;
              const bss = b.article?.searchSequence as number;
              return bss - ass; // reverse order by searchSequence
            });
          const sidebarFilter = sidebarFilters.length
            ? sidebarFilters[0]
            : null;

          // do feed and sidebar on the same connection
          let conn: PoolClient | null = null;
          getConnection()
            .then(async (c) => {
              conn = c;
              if (feedFilter) {
                const af = feedFilter.article as NormalizedArticleSearchFilter;
                const search: ArticlesFilter = {
                  is_hidden: false,
                  limit: af.limit,
                  offset: af.offset,
                };
                af.tagId && (search.tagIds = af.tagId);
                await ArticlesRow.searchArticles(search, conn).then(
                  (result) => {
                    return out.object({
                      searches: [
                        {
                          searchSequence: af.searchSequence,
                          type: 'feed',
                          result: {
                            ids: result.articles,
                            quantity: result.count,
                            offset: af.offset,
                          },
                        },
                      ],
                    });
                  }
                );
              }
              if (sidebarFilter) {
                const af =
                  sidebarFilter.article as NormalizedArticleSearchFilter;
                const search: ArticlesFilter = {
                  is_hidden: false,
                  limit: af.limit,
                  offset: af.offset,
                };
                af.tagId && (search.tagIds = af.tagId);
                type resultSetTypes = 'featured' | 'cheatNotes';
                const resultSets: Partial<Record<resultSetTypes, ResultIdSet>> =
                  {};

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
                    return ArticlesRow.searchArticles(
                      { types: ['cheat'], ...search },
                      conn as PoolClient
                    );
                  })
                  .then((result) => {
                    resultSets.cheatNotes = {
                      ids: result.articles,
                      quantity: result.count,
                      offset: af.offset,
                    };
                  })
                  .then(() => {
                    return out.object({
                      searches: [
                        {
                          searchSequence: af.searchSequence,
                          type: 'sidebar',
                          ...(resultSets as Record<
                            resultSetTypes,
                            ResultIdSet
                          >),
                        },
                      ],
                    });
                  });
              }
            })
            .finally(() => {
              if (conn) {
                returnConnection(conn);
              }
            })
            .then(() => searchComplete(ARTICLE_FILTER))
            .catch(searchException);
        }
      }

      searchComplete(SEARCH_START).catch(searchException);
    });
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
    throw new TypeError('Expected a GetRowsRequest');
  }
}
function assertGetRowsRequestNoAll(
  value: unknown
): asserts value is ObjectsRequestFilterNoAll {
  if (!isObjectsRequestFilterNoAll(value)) {
    throw new TypeError('Expected a GetRowsRequest');
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
    (value.tags === undefined || isObjectsRequestFilter(value.tags))
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
    result.tags = normalizeObjectsRequestFilter(value.tags);
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
