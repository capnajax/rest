// Hand-maintained extension of the generated base class for 'bylines'.
// The generator will NOT overwrite this file.

import type { PoolClient } from 'pg';

import {
  _BylinesRowBase,
  type BylinesRecord,
} from '../generated/_bylines-row-base.js';
import { loadByIds } from '../orm/search-tools.js';

export class BylinesRow extends _BylinesRowBase {
  /** Gets a byline by ID, returning 404 when absent. */
  static async getBylineById(id: number, connection?: PoolClient)
  : Promise<BylinesRow | 404> {
    return this.loadBylineById(id, connection);
  }

  /** Loads a byline by ID from the database, or returns 404. */
  static async loadBylineById(id: number, connection?: PoolClient)
  : Promise<BylinesRow | 404> {
    const records = await loadByIds<BylinesRecord>(
      'bylines', [id], { connection }
    );
    return records.length > 0 ? new BylinesRow(records[0], true) : 404;
  }
}
