import type { PoolClient } from 'pg';
import { getConnection, returnConnection, queryWithConnection } from '../query.js';
import type { ImmutableRow } from './immutable-row.js';
import type { ImmutableRowStatics } from './types.js';

type ImmutableRowConstructor<T extends ImmutableRow> = (new () => T) & ImmutableRowStatics;

/**
 * Holds all reference-table data loaded at startup.
 *
 * Reference tables are small, immutable lookup tables (e.g. statuses,
 * media types, categories) that never change during application lifetime.
 * "ReferenceData" deliberately avoids the word "cache" — this is not a
 * cache with liveness concerns; it is a startup snapshot.
 *
 * Usage:
 *
 *   // Application startup
 *   await ReferenceData.initialize(pool);
 *
 *   // Anywhere in the application
 *   const statuses = ReferenceData.all(StatusRow);
 *   const draft    = ReferenceData.byName(StatusRow, 'draft');
 *   const status   = ReferenceData.byId(StatusRow, 3);
 */
export class ReferenceData {
  private static _store = new Map<Function, ImmutableRow[]>();
  private static _registered: ImmutableRowConstructor<any>[] = [];

  /**
   * Register a reference-table row class. Generated reference-table files
   * call this at module load time.
   */
  static register<T extends ImmutableRow>(ctor: ImmutableRowConstructor<T>): void {
    ReferenceData._registered.push(ctor);
  }

  /**
   * Load all registered reference tables from the database.
   * Call once during application startup, before handling any requests.
   */
  static async initialize(connection?: PoolClient): Promise<void> {
    const conn    = connection ?? await getConnection();
    const ownConn = !connection;

    try {
      for (const ctor of ReferenceData._registered) {
        const sql    = `SELECT * FROM "${ctor.tableName}" ORDER BY "${ctor.pkColumn}"`;
        const result = await queryWithConnection(conn, sql, []);
        const rows   = result.rows.map(row => {
          const instance = new ctor();
          return instance._fromRecord(row);
        });
        ReferenceData._store.set(ctor, rows);
      }
    } finally {
      if (ownConn) returnConnection(conn);
    }
  }

  /**
   * Return all rows for a reference table.
   * Throws if initialize() has not been called for this class.
   */
  static all<T extends ImmutableRow>(ctor: ImmutableRowConstructor<T>): readonly T[] {
    return ReferenceData._require(ctor) as T[];
  }

  /** Find a reference row by primary key. */
  static byId<T extends ImmutableRow>(
    ctor:  ImmutableRowConstructor<T>,
    id:    number,
  ): T | undefined {
    const pkColumn = ctor.pkColumn;
    return (ReferenceData._require(ctor) as T[]).find(
      row => (row.getValue(pkColumn)) === id,
    );
  }

  /** Find a reference row by its name column. */
  static byName<T extends ImmutableRow>(
    ctor:  ImmutableRowConstructor<T>,
    name:  string,
  ): T | undefined {
    return (ReferenceData._require(ctor) as T[]).find(
      row => (row.getValue('name')) === name,
    );
  }

  private static _require(ctor: Function): ImmutableRow[] {
    const rows = ReferenceData._store.get(ctor);
    if (!rows) {
      throw new Error(
        `ReferenceData for '${(ctor as any).tableName ?? ctor.name}' is not loaded. `
        + `Call ReferenceData.initialize() at application startup.`,
      );
    }
    return rows;
  }
}
