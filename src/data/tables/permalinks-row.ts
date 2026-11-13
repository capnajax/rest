// Hand-maintained extension of the generated base class for 'permalinks'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import { PoolClient, QueryResult } from 'pg';
import { _PermalinksRowBase, PermalinksRecord } from '../generated/_permalinks-row-base.js';
import { getConnection, queryWithConnection, returnConnection } from '../query.js';
import { getLogger } from '../../util/logger.js';

const MODULE = 't.permalinks-row';

export class PermalinksRow extends _PermalinksRowBase {

  static async getPermalink(name: string, connection?: PoolClient)
  : Promise<PermalinksRow|404> {

    // TODO future feature: get froma cache

    return this.loadPermalink(name, connection);
  }

  static async loadPermalink(name: string, connection?: PoolClient)
  : Promise<PermalinksRow|404> {

    const log = getLogger(MODULE, 'loadPermalink');
    const recordToRow = (record: PermalinksRecord): PermalinksRow => {
      return new PermalinksRow(record, true);
    };

    const ownConn: boolean = !connection;

    try {
      connection ??= await getConnection();

      log.verbose('Querying permalink.getPermalink, name = %s', name);

      const permalinksRs: QueryResult<{
        id: number;
        name: string;
        article_id: number;
      }> = await queryWithConnection(
        { connection },
        'permalink.getPermalink',
        [ name ]
      );

      log.silly('Query complete');
      log.verbose('Row count: %s', permalinksRs.rowCount);

      if (!permalinksRs.rowCount) {
        return 404;
      } else if (permalinksRs.rowCount > 1) {
        log.error('Possible data integrity issue -- permalink.getPermalink ' +
          'returned multiple records for permalink "' + name + '".');
      }
      return recordToRow(permalinksRs.rows[0]);

    } finally {
      if (ownConn && connection) {
        returnConnection(connection);
      }
    }

  }

  override toJSON(): Record<string, unknown> {
    // Serialize scalars directly: super.toJSON() could traverse article before
    // we had a chance to remove it, creating an article/permalink cycle.
    const result: Record<string, unknown> = {};
    for (const [name, column] of this._columnMap) {
      const value = column.toJSON();
      if (value !== undefined) result[name] = value;
    }
    return result;
  }
}
