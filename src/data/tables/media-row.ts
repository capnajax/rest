// Hand-maintained extension of the generated base class for 'media'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import { PoolClient, QueryResult } from 'pg';
import { _MediaRowBase, MediaRecord } from '../generated/_media-row-base.js';
import { getLogger } from '../../util/logger.js';
import { getConnection, queryWithConnection, returnConnection } from '../query.js';
import { extname } from 'node:path';
import { getDefaultMimeType } from '../../routes/data-contracts/default-mime-types.js';

const MODULE = 't.media-row';

export interface GetMediaOptions {
  /**
   *  The `PoolConnection` to use to load articles. If none is provided, a new
   *  connection will be created if needed.
   */
  connection?: PoolClient;
  /**
   *  Only get media that has been updated since a certain date
   */
  ifModifiedSince?: Date;
}

export class MediaRow extends _MediaRowBase {

  /**
   * Returns a media item, loading from the database if necessary. If there is
   * no media item for the given `articleId` and `filename`, this function will
   * return `404`. If there is an item for the given `articleId` and `filename`,
   * but `options.ifModifiedSince` is set and newer than the `last_update` in
   * the media item, it returns a `304`.
   * @param articleId The article the media is for
   * @param filename The filename of the media item
   * @param options additional query options
   * @returns a promise that resolves with the `MediaRow` object for the
   *  `articleId` and `filename`, or `304` or `404` as appropriate.
   */
  static async getMedia(
    articleId: number, filename: string, options: GetMediaOptions = {})
  : Promise<MediaRow|404|304> {

    // TODO future feature: get froma cache

    return this.loadMedia(articleId, filename, options);
  }

  /**
   * Loads a media item from the database. If there is no media item for the
   * given `articleId` and `filename`, this function will return `404`. If
   * there is an item for the given `articleId` and `filename`, but
   * `options.ifModifiedSince` is set and newer than the `last_update` in the
   * media item, it returns a `304`.
   * @param articleId The article the media is for
   * @param filename The filename of the media item
   * @param options additional query options
   * @returns a promise that resolves with the `MediaRow` object for the
   *  `articleId` and `filename`, or `304` or `404` as appropriate.
   */
  static async loadMedia(
    articleId: number, filename: string, options: GetMediaOptions)
  : Promise<MediaRow|404|304> {

    const log = getLogger(MODULE, 'loadPermalink');
    const recordToRow = (record: MediaRecord): MediaRow => {
      if (record.data_b64 === null) {
        record = { ... record };
        delete record.data_b64;
      }
      return new MediaRow(record, true);
    };

    const ownConn: boolean = !options.connection;
    let connection!: PoolClient;

    try {
      connection = options.connection ?? await getConnection();
      const mediaRs: QueryResult<{
        id: number;
        article_id: number;
        filename: string;
        last_update: Date;
        data_b64: string|null|undefined;
      }> = await queryWithConnection(
        { connection: connection, allowHardcoded: false },
        'media.getMedia',
        [articleId, filename, options.ifModifiedSince || null]
      );
      if (!mediaRs.rowCount) {
        return 404;
      } else if (mediaRs.rowCount > 1) {
        log.error('Possible data integrity issue -- media.getMedia ' +
          'returned multiple records for articleId "' + articleId +
          '" and filename "' + filename + '".');
      }
      const row = mediaRs.rows[0];
      if (row.data_b64 === null) {
        return 304;
      }

      const result = recordToRow(row as unknown as MediaRecord);

      if (!result.mime_type.value) {
        const extension = extname(result.filename.value as string);
        result.mime_type.value = await getDefaultMimeType(extension);
      }

      return result;

    } finally {
      if (ownConn && connection) {
        returnConnection(connection);
      }
    }
  }
}
