/**
 * Canonical request contracts and the normalisers that produce them.
 * These types describe server-side values, not the JSON request schema.
 * @module
 */
import { InvalidQuery } from '../../util/exceptions.js';
import {
  assertPGableInteger,
  assertPGableIntegerArray,
  assertRecord,
  earlierDate,
  isNumberOrNumberArray,
  normalizeArray,
  normalizeDate,
} from '../../util/tools.js';
import {
  ArticleSearchType,
  assertArticleSearchInput,
  assertDataRequestOptionsInput,
  assertObjectIdSelectionInput,
  assertObjectRequestsInput,
  assertObjectSelectionInput,
  assertSearchFiltersInput,
  assertTagSelectionInput,
} from './input.js';

const DEFAULT_LIMIT = 100;

/**
 * Canonical record requests after shorthand expansion and group merging.
 */
interface NormalizedObjectRequests {
  /**
   * Explicit article selection; omitted when article loading is disabled.
   */
  articles?: NormalizedObjectIdSelection;
  /**
   * When present, load all content types and form factors together.
   */
  contentTypes?: true;
  /**
   * Canonical tag selection; omitted when tag loading is disabled.
   */
  tags?: NormalizedTagSelection;
}
/**
 * Canonical selection permitting all records.
 */
interface NormalizedObjectSelection {
  /**
   * An explicit ID array or all; scalar IDs have been expanded.
   */
  id: number[] | 'all';
  /**
   * Parsed modification threshold, when supplied.
   */
  ifModifiedSince?: Date;
}
/**
 * Canonical explicit-ID selection. Article IDs have passed signed 32-bit
 * integer validation.
 */
export interface NormalizedObjectIdSelection {
  /**
   * Explicit ID array; may be empty and may contain duplicates.
   */
  id: number[];
  /**
   * Parsed modification threshold, when supplied.
   */
  ifModifiedSince?: Date;
}
/**
 * Canonical tag selection, including the inherited ID and date fields. The
 * current tag handler only applies the importance restriction.
 */
export interface NormalizedTagSelection extends NormalizedObjectSelection {
  /**
   * Present only when important tags are required. False becomes omission.
   */
  important?: true;
}
/**
 * Canonical article search with explicit pagination defaults.
 */
export interface NormalizedArticleSearch {
  /**
   * Validated finite ordering token, scoped to the search type.
   */
  searchSequence: number;
  /**
   * Feed or sidebar search category.
   */
  type: ArticleSearchType;
  /**
   * Tag IDs expanded to an array and validated as signed 32-bit integers.
   */
  tagId?: number[];
  /**
   * Validated non-negative signed 32-bit row limit; defaults to 100.
   */
  limit: number;
  /**
   * Validated non-negative signed 32-bit offset; defaults to 0.
   */
  offset: number;
}
/**
 * Canonical search container.
 */
export interface NormalizedSearchFilters {
  /**
   * Canonical article search, when requested.
   */
  article?: NormalizedArticleSearch;
}
/**
 * Canonical response delivery options with defaults applied.
 */
interface NormalizedDataRequestOptions {
  /**
   * True selects newline-delimited JSON; false selects one JSON response.
   */
  stream: boolean;
}
/**
 * Canonical request consumed by route processing. All envelope properties are
 * present. Search containers may still include superseded searches; route
 * processing selects the highest sequence for each type.
 */
export interface NormalizedDataRequest {
  /**
   * Merged canonical record requests. Empty when no records were requested.
   */
  objects: NormalizedObjectRequests;
  /**
   * Canonical search containers. Empty when no searches were requested.
   */
  filters: NormalizedSearchFilters[];
  /**
   * Canonical delivery options, including the streaming default.
   */
  options: NormalizedDataRequestOptions;
}

function searchObjectReducer(
  accumulator: NormalizedObjectRequests,
  o?: NormalizedObjectRequests
): NormalizedObjectRequests {
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

function normalizeArticleSearch(value: unknown): NormalizedArticleSearch {
  assertArticleSearchInput(value);
  const result: NormalizedArticleSearch = {
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
function normalizeObjectRequests(value: unknown): NormalizedObjectRequests {
  assertObjectRequestsInput(value);
  const result: NormalizedObjectRequests = {};
  // false or undefined means the same, and `true` is disallowed by the assert
  if (value.articles) {
    result.articles = normalizeObjectIdSelection(value.articles);
  }
  if (value.contentTypes || value.formFactors) {
    result.contentTypes = true;
  }
  if (value.tags) {
    result.tags = normalizeTagSelection(value.tags);
  }
  return result;
}
function normalizeObjectSelection(value: unknown): NormalizedObjectSelection {
  assertObjectSelectionInput(value);
  if (typeof value === 'boolean') {
    return { id: 'all' };
  }
  if (isNumberOrNumberArray(value)) {
    return { id: normalizeArray(value) };
  }
  const result: NormalizedObjectSelection = {
    id: value.id === 'all' ? value.id : normalizeArray(value.id),
  };
  if (value.ifModifiedSince) {
    result.ifModifiedSince = normalizeDate(value.ifModifiedSince);
  }
  return result;
}
function normalizeTagSelection(value: unknown): NormalizedTagSelection {
  assertTagSelectionInput(value);
  if (typeof value === 'boolean') {
    return { id: 'all' };
  }
  if (isNumberOrNumberArray(value)) {
    return { id: normalizeArray(value) };
  }
  const result: NormalizedTagSelection = {
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
function normalizeObjectIdSelection(
  value: unknown
): NormalizedObjectIdSelection {
  assertObjectIdSelectionInput(value);
  if (value === false) {
    return { id: [] };
  }
  if (isNumberOrNumberArray(value)) {
    const result = { id: normalizeArray(value) };
    assertPGableIntegerArray(result.id);
    return result;
  }
  const result: NormalizedObjectIdSelection = {
    id: normalizeArray(value.id),
  };
  if (value.ifModifiedSince) {
    result.ifModifiedSince = normalizeDate(value.ifModifiedSince);
  }
  assertPGableIntegerArray(result.id);
  return result;
}
function normalizeSearchFilters(value: unknown): NormalizedSearchFilters {
  assertSearchFiltersInput(value);
  const result: NormalizedSearchFilters = {};
  if (value.article !== undefined) {
    result.article = normalizeArticleSearch(value.article);
  }
  return result;
}
function normalizeDataRequestOptions(
  value: unknown
): NormalizedDataRequestOptions {
  assertDataRequestOptionsInput(value);
  return {
    stream: !!value.stream,
  };
}
/**
 * Validates untrusted request data and reduces it to the canonical form.
 * Applies defaults, expands scalar IDs, parses dates, and merges object
 * groups. Unknown properties are discarded. This function does not query
 * resources or guarantee that requested IDs exist.
 *
 * ID arrays may be reused and extended while merging groups. Callers that
 * retain their input should clone it first, as preset route handlers do.
 *
 * @param value Parsed request body or in-process request input.
 * @returns Canonical request with explicit objects, filters, and options.
 * @throws {TypeError} If an envelope or nested value has an invalid shape.
 * @throws {InvalidQuery} If a checked number or date is invalid.
 */
export function normalizeDataRequest(value: unknown): NormalizedDataRequest {
  assertRecord(value);
  const objects: NormalizedObjectRequests = value.objects
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
          const highestSequence: Partial<Record<ArticleSearchType, number>> =
            {};
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
  const options = normalizeDataRequestOptions(value.options || {});
  return { objects, filters, options };
}
