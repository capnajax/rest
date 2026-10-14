import { getLogger } from '../../util/logger.js';
import { Column } from './column.js';

const MODULE = 'orm/immutable-row';

/**
 * Abstract base for all generated reference-table row classes.
 *
 * Reference table rows are loaded once at startup via ReferenceData and
 * are never mutated. There is no save(), no delete(), and no load() — the
 * row is fully constructed from DB data by _fromRecord() and then frozen.
 *
 * Generated subclasses declare:
 *   - static tableName, pkColumn
 *   - typed Column<T> properties for every scalar column
 *   - static _fromRecord(data: Record<string, unknown>): SubClass
 */
export abstract class ImmutableRow {
  readonly isNew: false = false;

  isDirty(): false {
    return false;
  }

  /**
   * Populate a new instance from a raw DB result row.
   * Implemented by the generated subclass since it knows the column set.
   * @internal
   */
  abstract _fromRecord(data: Record<string, unknown>): this;

  /** Convenience: get any column by name for generic iteration. */
  protected _columns = new Map<string, Column<any>>();
  /** Convenience: get any immutable reference for generic iteration. */
  protected _immutableRefs = new Array<string>();

  toJSON(): Record<string, unknown> {
    const log = getLogger(MODULE, 'toJSON');
    const result: Record<string, unknown> = {};
    for (const [name, col] of this._columns.entries()) {
      const value = col.toJSON();
      if (value !== undefined) {
        result[name] = value;
      }
    }
    for (const ref of this._immutableRefs) {
      const value = (this as unknown as Record<string, unknown>)[ref];
      log.debug('Resolving immutable reference %s: %s', ref, value);
      if (value !== undefined) {
        if (value === null) {
          result[ref] = null;
        } else {
          result[ref] = value;
        }
      }
    }
    return result;
  }

  protected _registerColumns(...cols: Column<any>[]): void {
    for (const col of cols) {
      this._columns.set(col.name, col);
    }
  }
  protected _registerImmutableRefs(...refs: string[]): void {
    this._immutableRefs.push(...refs);
  }

  getValue(columnName: string): any {
    const col = this._columns.get(columnName);
    if (!col) {
      throw new Error(`Column ${columnName} does not exist on ${this.constructor.name}`);
    }
    return col.value;
  }
}
