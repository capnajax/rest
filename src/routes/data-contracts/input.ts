/**
 * Public request contracts accepted by the data API.
 * Dates are strings in JSON; in-process callers may also supply Date objects.
 * Shape guards do not apply every semantic constraint; normalisers complete
 * validation before request processing. Unknown properties are ignored.
 * @module
 */
import {
  isNumberOrNumberArray,
  isRecord,
  isValidDate,
} from '../../util/tools.js';

const articleSearchTypes = ['feed', 'sidebar'];
/**
 * Search category. Sequence numbers are scoped to each category.
 */
export type ArticleSearchType = 'feed' | 'sidebar';
function isArticleSearchType(value: unknown): value is ArticleSearchType {
  return typeof value === 'string' && articleSearchTypes.includes(value);
}

/**
 * Article search parameters for a feed or sidebar.
 */
export interface ArticleSearchInput {
  /**
   * Finite client-supplied ordering token. Higher values supersede lower
   * values for the same search type; it need not be an integer.
   */
  searchSequence: number;
  /**
   * Search category: feed returns one result set; sidebar returns featured
   * articles and cheat notes.
   */
  type: ArticleSearchType;
  /**
   * Optional tag selection, supplied as one ID or an array of IDs. IDs must
   * fit signed 32-bit PostgreSQL integers.
   */
  tagId?: number | number[];
  /**
   * Maximum rows per result set, from 0 to 2147483647. Defaults to 100; zero
   * requests no rows.
   */
  limit?: number;
  /**
   * Number of matching rows to skip, from 0 to 2147483647. Defaults to 0.
   */
  offset?: number;
}
function isArticleSearchInput(value: unknown): value is ArticleSearchInput {
  return (
    isRecord(value) &&
    typeof value.searchSequence === 'number' &&
    isArticleSearchType(value.type) &&
    (value.tagId === undefined || isNumberOrNumberArray(value.tagId)) &&
    (value.limit === undefined || typeof value.limit === 'number') &&
    (value.offset === undefined || typeof value.offset === 'number')
  );
}
/**
 * Asserts the accepted shape of {@link ArticleSearchInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertArticleSearchInput(
  value: unknown
): asserts value is ArticleSearchInput {
  if (!isArticleSearchInput(value)) {
    throw new TypeError('Expected ArticleSearchInput');
  }
}
/**
 * Requests for complete records, independently of article searches. Omitted or
 * false selections request no records.
 */
export interface ObjectRequestsInput {
  /**
   * Explicit article IDs. Requests for all articles are not supported.
   */
  articles?: ObjectIdSelectionInput;
  /**
   * Any truthy selection requests every content type and form factor.
   * Individual IDs and modification dates do not restrict this load.
   */
  contentTypes?: ObjectSelectionInput;
  /**
   * Any truthy selection requests every form factor and content type.
   * Equivalent to a truthy contentTypes selection.
   */
  formFactors?: ObjectSelectionInput;
  /**
   * Tag selection. Supports IDs, all tags, and the detailed tag options. The
   * current handler loads all tags and applies only the important filter; ID
   * and modification-date restrictions are not applied.
   */
  tags?: TagSelectionInput;
}
function isObjectRequestsInput(value: unknown): value is ObjectRequestsInput {
  return (
    isRecord(value) &&
    (value.articles === undefined ||
      isObjectIdSelectionInput(value.articles)) &&
    (value.contentTypes === undefined ||
      isObjectSelectionInput(value.contentTypes)) &&
    (value.formFactors === undefined ||
      isObjectSelectionInput(value.formFactors)) &&
    (value.tags === undefined || isTagSelectionInput(value.tags))
  );
}
/**
 * Asserts the accepted shape of {@link ObjectRequestsInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertObjectRequestsInput(
  value: unknown
): asserts value is ObjectRequestsInput {
  if (!isObjectRequestsInput(value)) {
    throw new TypeError('Expected ObjectRequestsInput');
  }
}

/**
 * Explicit record selection: false disables loading; a number or array selects
 * IDs; the detailed form also supplies a modification date. Article IDs must
 * fit signed 32-bit PostgreSQL integers. An empty array selects no IDs.
 */
export type ObjectIdSelectionInput =
  | false
  | number
  | number[]
  | ObjectIdSelectionDetailsInput;
function isObjectIdSelectionInput(
  value: unknown
): value is ObjectIdSelectionInput {
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
/**
 * Asserts the accepted shape of {@link ObjectIdSelectionInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertObjectIdSelectionInput(
  value: unknown
): asserts value is ObjectIdSelectionInput {
  if (!isObjectIdSelectionInput(value)) {
    throw new TypeError('Expected ObjectIdSelectionInput');
  }
}
/**
 * Record selection shorthand: false disables loading, true selects all, and a
 * number or array selects IDs. The detailed form allows all IDs and a
 * modification date. Reference-table handlers ignore selection details once
 * enabled.
 */
export type ObjectSelectionInput =
  | boolean
  | number
  | number[]
  | ObjectSelectionDetailsInput;
function isObjectSelectionInput(value: unknown): value is ObjectSelectionInput {
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
/**
 * Asserts the accepted shape of {@link ObjectSelectionInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertObjectSelectionInput(
  value: unknown
): asserts value is ObjectSelectionInput {
  if (!isObjectSelectionInput(value)) {
    throw new TypeError('Expected ObjectSelectionInput');
  }
}
/**
 * Tag selection shorthand or detailed options. False disables loading and true
 * requests all tags. The current tag handler does not restrict loading by ID
 * or modification date.
 */
export type TagSelectionInput =
  | boolean
  | number
  | number[]
  | TagSelectionDetailsInput;
function isTagSelectionInput(value: unknown): value is TagSelectionInput {
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
/**
 * Asserts the accepted shape of {@link TagSelectionInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertTagSelectionInput(
  value: unknown
): asserts value is TagSelectionInput {
  if (!isTagSelectionInput(value)) {
    throw new TypeError('Expected TagSelectionInput');
  }
}
/**
 * Detailed record selection for resources that permit selecting all records.
 */
export interface ObjectSelectionDetailsInput {
  /**
   * One ID, an array of IDs, or all to select every record.
   */
  id: number | number[] | 'all';
  /**
   * Optional modification threshold. Use an ISO 8601 date-time string in JSON.
   * Valid JavaScript date strings and Date objects are accepted in process.
   * Resource handlers may ignore this threshold.
   */
  ifModifiedSince?: Date | string;
}
/**
 * Detailed tag selection with an optional importance restriction.
 */
export interface TagSelectionDetailsInput {
  /**
   * One tag ID, an array of IDs, or all. Currently retained during
   * normalisation but not applied by the tag handler.
   */
  id: number | number[] | 'all';
  /**
   * When true, return only important tags. False or omission imposes no
   * importance restriction.
   */
  important?: boolean;
  /**
   * Optional valid date string or Date. Currently retained during
   * normalisation but not applied by the tag handler.
   */
  ifModifiedSince?: Date | string;
}
/**
 * Detailed selection of explicit record IDs. Selecting all is forbidden.
 */
export interface ObjectIdSelectionDetailsInput {
  /**
   * One ID or an array of IDs. Article IDs must fit signed 32-bit PostgreSQL
   * integers.
   */
  id: number | number[];
  /**
   * Optional valid date string or Date restricting articles to records updated
   * at or after this instant. Prefer ISO 8601 date-time strings in JSON.
   */
  ifModifiedSince?: Date | string;
}

/**
 * Container for one article search. An empty container requests no search.
 */
export interface SearchFiltersInput {
  /**
   * Optional article search parameters.
   */
  article?: ArticleSearchInput;
}
function isSearchFiltersInput(value: unknown): value is SearchFiltersInput {
  // tests for permitted values
  return (
    isRecord(value) &&
    (value.article === undefined || isArticleSearchInput(value.article))
  );
}
/**
 * Asserts the accepted shape of {@link SearchFiltersInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertSearchFiltersInput(
  value: unknown
): asserts value is SearchFiltersInput {
  if (!isSearchFiltersInput(value)) {
    throw new TypeError('Expected SearchFiltersInput');
  }
}

/**
 * Public data API request envelope. Every property is optional; an empty
 * object produces a status-only response. This interface documents the
 * contract; it is not a runtime validator. Validation and canonicalisation are
 * performed by normalizeDataRequest. Dates in JSON are strings.
 *
 * @example
 * { objects: { articles: [7, 9] }, options: { stream: false } }
 */
export interface DataRequest {
  /**
   * One record-request group or an array of groups to merge. Repeated explicit
   * IDs may remain duplicated; no deduplication is promised.
   */
  objects?: ObjectRequestsInput | ObjectRequestsInput[];
  /**
   * One search container or an array of containers. Processing selects the
   * highest searchSequence for each search type.
   */
  filters?: SearchFiltersInput | SearchFiltersInput[];
  /**
   * Response delivery options. Omission uses their defaults.
   */
  options?: DataRequestOptionsInput;
}

/**
 * Controls how the data response is delivered.
 */
export interface DataRequestOptionsInput {
  /**
   * Defaults to false: send one application/json response. When true, send
   * application/x-ndjson, with one DataResponse per line.
   */
  stream?: boolean;
}
function isDataRequestOptionsInput(
  value: unknown
): value is DataRequestOptionsInput {
  return (
    isRecord(value) &&
    value !== null &&
    (value.stream === undefined || typeof value.stream === 'boolean')
  );
}
/**
 * Asserts the accepted shape of {@link DataRequestOptionsInput}.
 * Semantic constraints are applied separately during normalisation.
 * @param value Untrusted input to inspect.
 * @throws {TypeError} If the value does not match the accepted shape.
 */
export function assertDataRequestOptionsInput(
  value: unknown
): asserts value is DataRequestOptionsInput {
  if (!isDataRequestOptionsInput(value)) {
    throw new TypeError('Expected DataRequestOptionsInput');
  }
}

/** Accepted input name for the public data request envelope. */
export type DataRequestInput = DataRequest;
