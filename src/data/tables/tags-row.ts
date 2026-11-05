// Hand-maintained extension of the generated base class for 'tags'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import type { PoolClient } from 'pg';

import { _TagsRowBase, TagsRecord } from '../generated/_tags-row-base.js';
import {
  getConnection,
  queryWithConnection,
  returnConnection,
} from '../query.js';
import {
  normalizeResultGroupOptions,
  ResultGrouper,
  ResultGroupOptions,
} from '../../util/result-grouping.js';
import { search, SearchOptions } from '../orm/search-tools.js';

/**
 * Options for the `getTagsByIds` call
 */
interface FullGetTagsOptions extends ResultGroupOptions {
  /**
   *  The `PoolConnection` to use to load tags. If none is provided, a new
   *  connection will be created if needed.
   */
  connection: PoolClient | null;
  important?: boolean;
}

export type GetTagsOptions = Partial<FullGetTagsOptions>;
function normalizeGetTagsOptions(
  options: GetTagsOptions = {}
): FullGetTagsOptions {
  return {
    ...normalizeResultGroupOptions(options),
    connection: options.connection || null,
  };
}

export class TagsRow extends _TagsRowBase {
  /** Loads all tags, with a place to add caching in the future. */
  static async getTags(
    options: GetTagsOptions,
    cb: (tag: TagsRow[]) => void
  ): Promise<void> {
    const normalizedOptions = normalizeGetTagsOptions(options);

    // TODO future feature: get from a cache

    const grouper = new ResultGrouper<TagsRow>(normalizedOptions, cb);

    // this loads all the rows, then filters according to the options

    const filterGroup = options.important
      ? (row:TagsRow) => {
          if (row.important.value) {
            grouper.push(row);
          }
        }
      : (row:TagsRow) => grouper.push(row);

    if (options?.connection) {
      await this.loadTags(options.connection, filterGroup);
    } else {
      await this.loadTags(filterGroup);
    }
    grouper.flush();
  }

  static async loadTags(connection?: PoolClient): Promise<TagsRow[]>;
  static async loadTags(cb: (tags: TagsRow) => void): Promise<void>;
  static async loadTags(
    connection: PoolClient,
    cb: (tags: TagsRow) => void
  ): Promise<void>;
  static async loadTags(
    connection?: PoolClient | ((tags: TagsRow) => void),
    cb?: (tags: TagsRow) => void
  ): Promise<TagsRow[] | void> {
    if (typeof connection === 'function') {
      cb = connection;
      connection = undefined;
    }

    const loadOptions: SearchOptions = {
      connection,
    };

    const recordToRow = (record: TagsRecord): TagsRow => {
      return new TagsRow(record);
    };
    if (cb) {
      const loadCb = (record: TagsRecord): void => {
        cb(recordToRow(record));
      };
      return search<TagsRecord>('tags', [], loadOptions, loadCb);
    } else {
      return search<TagsRecord>('tags', [], loadOptions).then((records) =>
        records.map((r) => recordToRow(r))
      );
    }
  }
}
