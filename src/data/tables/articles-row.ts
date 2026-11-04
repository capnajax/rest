// Hand-maintained extension of the generated base class for 'articles'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import type { PoolClient } from 'pg';
import './content-types-row.js';
import './form-factors-row.js';
import {
  _ArticlesRowBase,
  ArticlesRecord,
} from '../generated/_articles-row-base.js';
import './media-row.js';
import './people-row.js';
import './permalinks-row.js';
import './tags-row.js';
import {
  normalizeResultGroupOptions,
  ResultGrouper,
  ResultGroupOptions,
} from '../../util/result-grouping.js';
import {
  loadByIds,
  search,
  SearchOptions,
  LoadByIdsOptions as SearchToolsLoadByIdsOptions,
  WhereClause,
} from '../orm/search-tools.js';
import { ContentTypesRow } from './content-types-row.js';
import { ANY } from '../orm/pg-types.js';
import { ReferenceData } from '../orm/reference-data.js';
import { omit } from '../../util/tools.js';

/**
 * Options for the `getArticlesByIds` call
 */
interface FullGetArticlesOptions extends ResultGroupOptions {
  /**
   *  The `PoolConnection` to use to load articles. If none is provided, a new
   *  connection will be created if needed.
   */
  connection: PoolClient | null;
  /**
   *  Only get articles that have been updated since a certain date
   */
  ifModifiedSince: Date | null;
}
export type GetArticlesOptions = Partial<FullGetArticlesOptions>;
function normalizeGetArticlesOptions(
  options: GetArticlesOptions = {}
): FullGetArticlesOptions {
  return {
    ...normalizeResultGroupOptions(options),
    connection: options.connection || null,
    ifModifiedSince: null,
  };
}

interface LoadByIdsOptions {
  connection?: PoolClient;
  ifModifiedSince?: Date;
}

export interface ArticlesFilter {
  // three states: `true` for "include only this",
  // `false` for "exclude this", and `undefined` for do not consider this
  is_hidden?: boolean;
  // true for "only featured", false for "exclude featured", undefined
  // for not filtering on featured at all
  is_featured?: boolean;
  tagIds?: number[];
  // no filtering if not included, inclusive if any form factors are
  // included
  types?: ('article' | 'cheat' | 'link' | 'rocket')[];
  ifModifiedSince?: Date;
  limit: number;
  offset?: number;
}

export class ArticlesRow extends _ArticlesRowBase {
  /**
   * Loads `Articles` from the database or from a cache and calls a callback
   * with articles as they are loaded. The callback may be called more than once
   * and will always return an array of one or more articles. Resolves when all
   * the articles are loaded.
   * @param ids
   * @param connection
   * @param cb
   */
  static async getArticlesByIds(
    ids: (number | string)[],
    cb: (articles: ArticlesRow[]) => void,
    options?: GetArticlesOptions
  ): Promise<void> {
    const normalizedOptions = normalizeGetArticlesOptions(options);
    const connection = normalizedOptions.connection;

    const grouper = new ResultGrouper<ArticlesRow>(normalizedOptions, cb);

    // TODO future feature: get from a cache

    // load from database
    const loadOptions: LoadByIdsOptions = {};
    connection && (loadOptions.connection = connection);
    if (options?.ifModifiedSince) {
      loadOptions.ifModifiedSince = options.ifModifiedSince;
    }
    await ArticlesRow.loadArticlesByIds(ids, loadOptions, (row) =>
      grouper.push(row)
    );
    grouper.flush();
  }

  static async searchArticles(
    filters: ArticlesFilter,
    connection?: PoolClient
  ): Promise<{ articles: ArticlesRow[]; count: number }>;
  static async searchArticles(
    filters: ArticlesFilter,
    cb: (article: ArticlesRow) => void
  ): Promise<number>;
  static async searchArticles(
    filters: ArticlesFilter,
    connection: PoolClient,
    cb: (article: ArticlesRow) => void
  ): Promise<number>;
  static async searchArticles(
    filters: ArticlesFilter,
    connection?: PoolClient | ((articles: ArticlesRow) => void),
    cb?: (article: ArticlesRow) => void
  ): Promise<{ articles: ArticlesRow[]; count: number } | number> {
    if (typeof connection === 'function') {
      cb = connection;
      connection = undefined;
    }

    const loadOptions: SearchOptions = {
      columns: [
        'id',
        'title',
        'last_update',
        'COUNT(*) OVER() AS __total_count',
      ],
      connection,
      orderBy: {
        column: 'last_update',
        direction: 'DESC',
      },
      limit: filters.limit,
      offset: filters.offset || 0,
    };

    const wheres: WhereClause[] = [];

    const where3State = (property: string, def?: boolean): void => {
      let fv = (filters as Record<string, any>)[property];
      if (fv === undefined) {
        fv = def;
      }
      if (fv !== undefined) {
        wheres.push({
          column: property,
          type: 'bool',
          operator: '=',
          value: fv,
        });
      }
    };
    where3State('is_featured');
    where3State('is_hidden', false);
    if (filters.tagIds) {
      wheres.push({
        column: 'id',
        select:
          'SELECT article_id FROM article_tag ' + `WHERE tag_id = ANY($$))`,
        value: [filters.tagIds],
      });
    }
    if (filters.types?.length) {
      const ctIds: number[] = filters.types
        .map((name) => ReferenceData.byName(ContentTypesRow, name)?.id.value)
        .filter((id): id is number => typeof id === 'number');
      wheres.push({
        column: 'content_type_id',
        type: 'int',
        operator: '=',
        value: ctIds,
        arrayComparison: ANY,
      });
    }
    if (filters.ifModifiedSince) {
      wheres.push({
        column: 'last_update',
        type: 'timestamp',
        operator: '>=',
        value: filters.ifModifiedSince,
      });
    }

    const recordToRow = (
      record: ArticlesRecord & { __total_count: number }
    ): ArticlesRow => {
      return new ArticlesRow(omit(record, '__total_count'), true);
    };
    if (cb) {
      const loadCb = (
        row: ArticlesRecord & { __total_count: number }
      ): void => {
        totalCount ||= row.__total_count;
        cb(recordToRow(row));
      };
      let totalCount = 0;
      return search<ArticlesRecord & { __total_count: number }>(
        'articles',
        wheres,
        loadOptions,
        loadCb
      ).then(() => {
        return totalCount;
      });
    } else {
      return search<ArticlesRecord & { __total_count: number }>(
        'articles',
        wheres,
        loadOptions
      ).then((rows) => {
        return {
          articles: rows.map((r) => recordToRow(r)),
          count: rows.length ? rows[0].__total_count : 0,
        };
      });
    }
  }

  /**
   * Loads `ArticlesRow` objects from the database. Returns a `Promise` that
   * resolves with all the articles loaded as an array of `ArticlesRow`.
   *
   * Unlike `getArticlesByIds`, this method always loads articles from the
   * database, and will not be affected by any current or future cacheing or
   * flow control features.
   * @param ids the article ids to load
   * @param connection the database pool connection to use, or `null` to create
   *  its own connection
   * @param cb the callback to return articles. The callback will be called once
   *  per article
   * @returns a `Promise` that resolves with an array of `ArticlesRow` objects.
   */
  static async loadArticlesByIds(
    ids: (number | string)[],
    options: LoadByIdsOptions,
    cb: (article: ArticlesRow) => void
  ): Promise<void>;
  static async loadArticlesByIds(
    ids: (number | string)[],
    cb: (article: ArticlesRow) => void
  ): Promise<void>;
  static async loadArticlesByIds(
    ids: (number | string)[],
    options?: LoadByIdsOptions
  ): Promise<ArticlesRow[]>;
  static async loadArticlesByIds(
    ids: (number | string)[],
    options?: ((article: ArticlesRow) => void) | LoadByIdsOptions,
    cb?: (article: ArticlesRow) => void
  ): Promise<ArticlesRow[] | void> {
    const recordToRow = (record: ArticlesRecord): ArticlesRow => {
      return new ArticlesRow(record);
    };

    if (typeof options === 'function') {
      cb = options;
      options = undefined;
    }

    const loadOptions: SearchToolsLoadByIdsOptions = {};
    if (options?.connection) {
      loadOptions.connection = options?.connection;
    }
    if (options?.ifModifiedSince) {
      loadOptions.wheres = [
        {
          column: 'last_update',
          type: 'timestamp',
          operator: '>=',
          value: options.ifModifiedSince,
        },
      ];
    }

    if (cb) {
      const loadCb = (record: ArticlesRecord): void => {
        cb && cb(recordToRow(record));
      };
      await loadByIds<ArticlesRecord>('articles', ids, loadOptions, loadCb);
    } else {
      return loadByIds<ArticlesRecord>('articles', ids, loadOptions).then(
        (records: ArticlesRecord[]) => {
          return records.map((r) => recordToRow(r));
        }
      );
    }
  }
}
