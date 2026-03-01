import type { PoolClient } from 'pg';
import { getConnection, returnConnection, queryWithConnection } from '../query.ts';
import { Column } from './column.ts';
import { RelationshipArray } from './relationship-array.ts';
import { getRowClass } from './row-registry.ts';
import type { RelationshipDef, MutableRowStatics } from './types.ts';

/**
 * Abstract base for all generated mutable row classes.
 *
 * Generated subclasses declare:
 *   - static tableName, pkColumn, columnSets, relationshipDefs
 *   - typed Column<T> properties for every scalar column
 *   - typed RelationshipArray<T> properties for every relationship
 *   - loadSummary(), loadSimple(), loadAll() that call _load()
 *
 * Call the static factory methods (findById, findByName) to load rows.
 * Use `new MyRow()` only when creating rows that will be INSERTed.
 */
export abstract class MutableRow {
  private _isNew: boolean = true;

  /** Column instances indexed by column name — populated by _registerColumns(). */
  protected readonly _columnMap = new Map<string, Column<any>>();

  /** Relationship arrays indexed by relationship name — set by _loadRelationship(). */
  protected readonly _relationships = new Map<string, RelationshipArray<any>>();

  // ── State ─────────────────────────────────────────────────────────────────

  /** True when this row has not yet been saved to the database. */
  get isNew(): boolean {
    return this._isNew;
  }

  /** True when any scalar column or relationship array has unsaved changes. */
  isDirty(): boolean {
    for (const col of this._columnMap.values()) {
      if (col.isDirty) return true;
    }
    for (const rel of this._relationships.values()) {
      if (rel.isDirty) return true;
    }
    return false;
  }

  // ── Registration (called in generated constructor) ────────────────────────

  protected _registerColumns(...cols: Column<any>[]): void {
    for (const col of cols) {
      this._columnMap.set(col.name, col);
    }
  }

  // ── Hydration ─────────────────────────────────────────────────────────────

  /**
   * Populate columns from a raw DB result row. Columns absent from the row
   * object are left as UNSET (not loaded), which is correct for partial loads.
   * @internal
   */
  _hydrate(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      this._columnMap.get(key)?._hydrate(value as any);
    }
  }

  /** @internal */
  _markLoaded(): void {
    this._isNew = false;
  }

  // ── Loading ───────────────────────────────────────────────────────────────

  /**
   * Core load mechanism. Selects the given columns from the DB using the
   * provided WHERE clause, hydrates this row, then loads any requested
   * relationships at summary level.
   *
   * Generated load methods (loadSummary, loadSimple, loadAll) call this with
   * their respective column sets and relationship subsets.
   * @internal
   */
  protected async _load(
    columns:       readonly string[],
    relationships: RelationshipDef[],
    where:         Record<string, unknown>,
    connection?:   PoolClient,
  ): Promise<boolean> {
    const statics = this.constructor as unknown as MutableRowStatics;
    const tableName = statics.tableName;

    const keys   = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys
      .map((k, i) => `"${k}" = $${i + 1}`)
      .join(' AND ');

    const sql = `SELECT ${columns.map(c => `"${c}"`).join(', ')} `
      + `FROM "${tableName}" WHERE ${whereClause} LIMIT 1`;

    const conn = connection ?? await getConnection();
    const ownConn = !connection;

    try {
      const result = await queryWithConnection(conn, sql, values);
      if (result.rows.length === 0) return false;

      this._hydrate(result.rows[0]);
      this._isNew = false;

      for (const rel of relationships) {
        const pkValue = this._pkValue(statics);
        await this._loadRelationship(rel, pkValue, conn);
      }

      return true;
    } finally {
      if (ownConn) returnConnection(conn);
    }
  }

  private async _loadRelationship(
    rel:       RelationshipDef,
    pkValue:   unknown,
    conn:      PoolClient,
  ): Promise<void> {
    const RelatedClass = getRowClass(rel.targetTable) as any;
    const summaryColumns: string[] =
      RelatedClass.columnSets?.summary ?? ['id', 'name', 'title', 'created_at'];
    const relatedPk: string = RelatedClass.pkColumn ?? 'id';

    let rows: Record<string, unknown>[];

    if (rel.kind === 'link') {
      const cols = summaryColumns.map(c => `t."${c}"`).join(', ');
      const sql  = `SELECT ${cols} FROM "${rel.targetTable}" t `
        + `JOIN "${rel.linkTable}" lt ON lt."${rel.targetFk}" = t."${relatedPk}" `
        + `WHERE lt."${rel.sourceFk}" = $1`;
      rows = (await queryWithConnection(conn, sql, [pkValue])).rows;
    } else {
      const cols = summaryColumns.map(c => `"${c}"`).join(', ');
      const sql  = `SELECT ${cols} FROM "${rel.targetTable}" `
        + `WHERE "${rel.foreignKey}" = $1`;
      rows = (await queryWithConnection(conn, sql, [pkValue])).rows;
    }

    const items = rows.map(row => {
      const item = new RelatedClass() as MutableRow;
      item._hydrate(row);
      item._markLoaded();
      return item;
    });

    this._relationships.set(rel.name, new RelationshipArray(items));
  }

  // ── Saving ────────────────────────────────────────────────────────────────

  /**
   * Persist this row to the database.
   * - New rows (isNew === true)  → INSERT, captures RETURNING *, flips isNew.
   * - Existing rows (isNew === false) → UPDATE dirty columns only.
   * Relationship arrays are persisted in the same transaction.
   */
  async save(connection?: PoolClient): Promise<void> {
    const conn     = connection ?? await getConnection();
    const ownConn  = !connection;

    try {
      if (ownConn) await conn.query('BEGIN');

      if (this._isNew) {
        await this._insert(conn);
      } else {
        await this._update(conn);
      }

      await this._saveRelationships(conn);

      if (ownConn) await conn.query('COMMIT');

      this._commitAll();
      this._isNew = false;
    } catch (err) {
      if (ownConn) await conn.query('ROLLBACK');
      throw err;
    } finally {
      if (ownConn) returnConnection(conn);
    }
  }

  private async _insert(conn: PoolClient): Promise<void> {
    const statics   = this.constructor as unknown as MutableRowStatics;
    const tableName = statics.tableName;

    // Include all columns that have been explicitly set (isDirty covers this
    // because UNSET !== UNSET is false, UNSET !== value is true).
    const dirtyEntries = [...this._columnMap.entries()]
      .filter(([, col]) => col.isDirty);

    if (dirtyEntries.length === 0) {
      // INSERT with defaults only — still need the row, e.g. for auto-PK
      const result = await queryWithConnection(conn,
        `INSERT INTO "${tableName}" DEFAULT VALUES RETURNING *`, []);
      if (result.rows.length > 0) this._hydrate(result.rows[0]);
      return;
    }

    const colNames = dirtyEntries.map(([name]) => `"${name}"`).join(', ');
    const params   = dirtyEntries.map(([, col]) => col.value);
    const placeholders = params.map((_, i) => `$${i + 1}`).join(', ');

    const sql    = `INSERT INTO "${tableName}" (${colNames}) VALUES (${placeholders}) RETURNING *`;
    const result = await queryWithConnection(conn, sql, params);
    if (result.rows.length > 0) this._hydrate(result.rows[0]);
  }

  private async _update(conn: PoolClient): Promise<void> {
    const statics   = this.constructor as unknown as MutableRowStatics;
    const tableName = statics.tableName;
    const pkColumn  = statics.pkColumn;
    const pkValue   = this._pkValue(statics);

    const dirtyEntries = [...this._columnMap.entries()]
      .filter(([name, col]) => name !== pkColumn && col.isDirty);

    if (dirtyEntries.length === 0) return; // nothing to update

    const setClauses = dirtyEntries
      .map(([name], i) => `"${name}" = $${i + 1}`)
      .join(', ');
    const params = [
      ...dirtyEntries.map(([, col]) => col.value),
      pkValue,
    ];

    const sql = `UPDATE "${tableName}" SET ${setClauses} WHERE "${pkColumn}" = $${params.length}`;
    await queryWithConnection(conn, sql, params);
  }

  private async _saveRelationships(conn: PoolClient): Promise<void> {
    const statics   = this.constructor as unknown as MutableRowStatics;
    const pkColumn  = statics.pkColumn;
    const pkValue   = this._pkValue(statics);
    const relDefs   = statics.relationshipDefs ?? [];

    for (const def of relDefs) {
      const relArray = this._relationships.get(def.name);
      if (!relArray || !relArray.isDirty) continue;

      if (def.kind === 'link') {
        for (const item of relArray.added) {
          if (item.isNew) await item.save(conn);
          const itemPk = item._pkValue(item.constructor as unknown as MutableRowStatics);
          await queryWithConnection(conn,
            `INSERT INTO "${def.linkTable}" ("${def.sourceFk}", "${def.targetFk}") `
            + `VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [pkValue, itemPk]);
        }
        for (const item of relArray.removed) {
          const itemPk = item._pkValue(item.constructor as unknown as MutableRowStatics);
          await queryWithConnection(conn,
            `DELETE FROM "${def.linkTable}" WHERE "${def.sourceFk}" = $1 AND "${def.targetFk}" = $2`,
            [pkValue, itemPk]);
        }
      } else {
        // direct FK
        for (const item of relArray.added) {
          item._columnMap.get(def.foreignKey)!.value = pkValue;
          await item.save(conn);
        }
        for (const item of relArray.items) {
          if (!relArray.added.includes(item) && item.isDirty()) {
            await item.save(conn);
          }
        }
        for (const item of relArray.removed) {
          await item.delete(conn);
        }
      }
    }
  }

  // ── Deleting ──────────────────────────────────────────────────────────────

  /**
   * Hard-delete this row from the database.
   * - Link table relationships: removes links, leaves related rows intact.
   * - Direct FK relationships (if loaded): deletes child rows recursively.
   *   If not loaded, relies on database CASCADE constraints.
   */
  async delete(connection?: PoolClient): Promise<void> {
    if (this._isNew) throw new Error('Cannot delete a row that has not been saved');

    const statics   = this.constructor as unknown as MutableRowStatics;
    const tableName = statics.tableName;
    const pkColumn  = statics.pkColumn;
    const pkValue   = this._pkValue(statics);
    const relDefs   = statics.relationshipDefs ?? [];

    const conn    = connection ?? await getConnection();
    const ownConn = !connection;

    try {
      if (ownConn) await conn.query('BEGIN');

      for (const def of relDefs) {
        if (def.kind === 'link') {
          await queryWithConnection(conn,
            `DELETE FROM "${def.linkTable}" WHERE "${def.sourceFk}" = $1`,
            [pkValue]);
        } else {
          const relArray = this._relationships.get(def.name);
          if (relArray) {
            for (const item of relArray.items) await item.delete(conn);
          }
          // If relationship not loaded, database CASCADE handles it.
        }
      }

      await queryWithConnection(conn,
        `DELETE FROM "${tableName}" WHERE "${pkColumn}" = $1`,
        [pkValue]);

      if (ownConn) await conn.query('COMMIT');
    } catch (err) {
      if (ownConn) await conn.query('ROLLBACK');
      throw err;
    } finally {
      if (ownConn) returnConnection(conn);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** @internal — also used by _saveRelationships for related rows. */
  _pkValue(statics: MutableRowStatics): unknown {
    const col = this._columnMap.get(statics.pkColumn);
    if (!col) throw new Error(`Primary key column '${statics.pkColumn}' not registered`);
    return col.value;
  }

  private _commitAll(): void {
    for (const col of this._columnMap.values()) col._commit();
    for (const rel of this._relationships.values()) rel._commit();
  }
}
