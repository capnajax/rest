/**
 * Data API response contracts and envelope aggregation.
 * Date values are serialised as ISO 8601 date-time strings in JSON.
 * @module
 */
import type { ImmutableRow } from '../../data/orm/immutable-row.js';
import type { MutableRow } from '../../data/orm/mutable-row.js';
import type { ArticleSearchType } from './input.js';

const tableKeys: TableKey[] = ['article', 'contentType', 'formFactor', 'tag'];

/**
 * Resource discriminator used to group record patches in responses.
 */
export type TableKey = 'article' | 'contentType' | 'formFactor' | 'tag';
/**
 * Record fields for one resource. A patch may be partial; merge fields by
 * resource type and ID without discarding previously known fields.
 */
export interface ObjectPatch {
  /**
   * Stable record identifier within the resource type.
   */
  id: number;
  /**
   * Resource-specific fields. Their presence depends on the resource and
   * whether the record is complete or partial.
   */
  [key: string]: unknown;
}
/**
 * Record patches belonging to one resource type.
 */
export interface ObjectBatch {
  /**
   * Resource type shared by every record in this batch.
   */
  type: TableKey;
  /**
   * Record patches. The array may be empty.
   */
  records: ObjectPatch[];
}
/**
 * Ordered search page with optional pagination metadata. Despite the property
 * name ids, entries are serialised row objects rather than bare numeric IDs.
 * This server-side type uses ORM row types; JSON serialisation emits their
 * data fields.
 */
export interface ResultIdSet {
  /**
   * Ordered matching record objects, potentially partial. Complete records can
   * be requested separately through objects.
   */
  ids: Partial<MutableRow | ImmutableRow>[];
  /**
   * Total matching count when known; has-more indicates additional matches,
   * and no-more indicates exhaustion. Omission means availability is unknown.
   * The current query implementation reports zero for empty pages, even when
   * earlier pages may contain matches.
   */
  quantity?: number | 'has-more' | 'no-more';
  /**
   * Zero-based number of matching rows skipped for this page.
   */
  offset?: number;
}
/**
 * Fields identifying the search that produced a result.
 */
interface BaseArticleSearchResult {
  /**
   * Client ordering token echoed from the request.
   */
  searchSequence: number;
  /**
   * Search category identifying the result shape.
   */
  type: ArticleSearchType;
}
/**
 * Feed search response containing one ordered page of visible articles.
 */
interface ArticleFeedSearchResult extends BaseArticleSearchResult {
  /**
   * Feed result discriminator.
   */
  type: 'feed';
  /**
   * Matching feed page, including available pagination metadata.
   */
  result: ResultIdSet;
}
/**
 * Sidebar search response containing independent featured and cheat-note
 * pages. The request pagination applies to each page.
 */
interface ArticleSidebarSearchResult extends BaseArticleSearchResult {
  /**
   * Sidebar result discriminator.
   */
  type: 'sidebar';
  /**
   * Visible featured articles with article content type.
   */
  featured: ResultIdSet;
  /**
   * Visible articles with cheat content type.
   */
  cheatNotes: ResultIdSet;
}
/**
 * Discriminated union of feed and sidebar results. Inspect type before reading
 * category-specific fields.
 */
export type ArticleSearchResult =
  | ArticleFeedSearchResult
  | ArticleSidebarSearchResult;
/**
 * Request status accompanying every response envelope.
 */
export interface DataResponseStatus {
  /**
   * Server timestamp captured when request processing starts. Represented as a
   * Date in process and an ISO 8601 date-time string in JSON.
   */
  date: Date;
  /**
   * Optional failure correlation token. A non-empty token signals a client
   * panic and identifies corresponding server logs.
   */
  panic?: string;
  /**
   * Optional authentication state, when supplied. Current data handlers do not
   * populate this field.
   */
  session?: {
    /**
     * Authentication level: anonymous has not authenticated; pending awaits a
     * second factor; low has an older device cookie; high recently
     * authenticated and may perform sensitive actions.
     */
    authentication: 'anonymous' | 'pending' | 'low' | 'high';
  };
}
/**
 * Data API response envelope. Non-streaming requests receive one JSON
 * envelope; streaming requests receive one envelope per NDJSON line. Envelopes
 * can contain only status. A conditional object endpoint may instead return
 * HTTP 304 without a body.
 */
export interface DataResponse {
  /**
   * Search results included in this envelope. Omitted when none are emitted.
   */
  searches?: ArticleSearchResult[];

  /**
   * Resource batches. Explicit object requests return complete records;
   * search-related patches may be partial.
   */
  objects?: ObjectBatch[];

  /**
   * Server timestamp and optional failure or authentication information.
   */
  status: DataResponseStatus;
}

/**
 * Combines a set of table results together, favouring the last table if there
 * is a conflict. It's assumed the `id` is the same on all tables.
 */
function combineObjects(objectBatches: ObjectBatch[]): ObjectBatch[] {
  const objects: Partial<Record<TableKey, Record<string, ObjectPatch>>> = {};

  for (const tr of objectBatches) {
    objects[tr.type] ??= {};
    const otr = objects[tr.type] as Record<string, ObjectPatch>;
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

  const result: ObjectBatch[] = [];
  for (const rk of tableKeys) {
    if (!objects[rk]) continue;
    result.push({
      type: rk,
      records: Object.values(objects[rk]),
    });
  }

  return result;
}

function filterSearches(
  searchResults: ArticleSearchResult[]
): ArticleSearchResult[] {
  const result: ArticleSearchResult[] = [];
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
 * Combines several data responses into one.
 * @param responses the responses to combine
 * @return the combined response
 */
export function combineDataResponses(
  responses: DataResponse[]
): DataResponse | null {
  if (responses.length === 0) {
    return null;
  }

  const result: DataResponse = {
    // use the last response's status
    status: responses[responses.length - 1].status,
  };

  const responseObjects = responses
    .map((u) => u.objects)
    .filter((o) => o) as ObjectBatch[][];
  if (responseObjects.length) {
    const objectsResults = combineObjects(responseObjects.flat());
    if (objectsResults.length) {
      result.objects = objectsResults;
    }
  }

  const responseSearches = responses
    .map((u) => u.searches)
    .filter((s) => s) as ArticleSearchResult[][];
  if (responseSearches.length) {
    const searchResults = filterSearches(responseSearches.flat());
    if (searchResults.length) {
      result.searches = searchResults;
    }
  }

  return result;
}
