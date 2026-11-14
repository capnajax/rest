// Hand-maintained extension of the generated base class for 'realms'.
// The generator will NOT overwrite this file.

import type { PoolClient } from 'pg';

import {
  _RealmsRowBase,
  type RealmsRecord,
} from '../generated/_realms-row-base.js';
import { ReferenceData } from '../orm/reference-data.js';
import { loadByIds } from '../orm/search-tools.js';

export class RealmsRow extends _RealmsRowBase {
  /** Gets a realm by ID, returning 404 when absent. */
  static async getRealmById(id: number, connection?: PoolClient)
  : Promise<RealmsRow | 404> {
    return this.loadRealmById(id, connection);
  }

  /** Loads a realm by ID from the database, or returns 404. */
  static async loadRealmById(id: number, connection?: PoolClient)
  : Promise<RealmsRow | 404> {
    const records = await loadByIds<RealmsRecord>(
      'realms', [id], { connection }
    );
    return records.length > 0 ? new RealmsRow()._fromRecord(records[0]) : 404;
  }

  /** Returns API fields unchanged until a redaction policy is defined. */
  redact(): Record<string, unknown> {
    // TODO: Apply redaction when access requirements are defined.
    return this.toJSON();
  }
}

ReferenceData.register(RealmsRow);
