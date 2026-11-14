// Hand-maintained extension of the generated base class for 'people'.
// The generator will NOT overwrite this file.

import type { PoolClient } from 'pg';

import {
  _PeopleRowBase,
  type PeopleRecord,
} from '../generated/_people-row-base.js';
import { loadByIds, search } from '../orm/search-tools.js';

export class PeopleRow extends _PeopleRowBase {
  /** Gets a person by ID, returning 404 when absent. */
  static async getPersonById(id: number, connection?: PoolClient)
  : Promise<PeopleRow | 404> {
    return this.loadPersonById(id, connection);
  }

  /** Gets a person by realm name or ID and username, or returns 404. */
  static async getPersonByUsername(
    realm: string | number, username: string, connection?: PoolClient
  ): Promise<PeopleRow | 404> {
    return this.loadPersonByUsername(realm, username, connection);
  }

  /** Loads a person by ID from the database, or returns 404. */
  static async loadPersonById(id: number, connection?: PoolClient)
  : Promise<PeopleRow | 404> {
    const records = await loadByIds<PeopleRecord>(
      'people', [id], { connection }
    );
    return records.length > 0 ? new PeopleRow(records[0], true) : 404;
  }

  /** Loads a person by realm name or ID and username, or returns 404. */
  static async loadPersonByUsername(
    realm: string | number, username: string, connection?: PoolClient
  ): Promise<PeopleRow | 404> {
    let realmId: number;
    if (typeof realm === 'number') {
      realmId = realm;
    } else {
      const realms = await search<{ id: number }>(
        'realms', [{ column: 'name', type: 'text', value: realm }],
        { connection }
      );
      if (realms.length === 0) return 404;
      realmId = realms[0].id;
    }
    const records = await search<PeopleRecord>(
      'people',
      [
        { column: 'realm_id', type: 'int', value: realmId },
        { column: 'username', type: 'text', value: username },
      ],
      { connection }
    );
    return records.length > 0 ? new PeopleRow(records[0], true) : 404;
  }
}
