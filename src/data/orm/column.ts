import { UNSET, type Unset } from './types.ts';

/**
 * Wraps a single scalar column on a mutable row.
 *
 * State machine:
 *   UNSET → UNSET    column was not in the SELECT and no value has been set
 *   UNSET → value    value was set on a new row (will be included in INSERT)
 *   value → value    loaded from DB; clean if current === original, dirty otherwise
 *
 * Distinguishes null (DB NULL) from UNSET (never loaded / never set).
 */
export class Column<T> {
  private _original: T | null | Unset = UNSET;
  private _current:  T | null | Unset = UNSET;

  constructor(readonly name: string) {}

  // ── State ─────────────────────────────────────────────────────────────────

  /** True when this column was included in the last SELECT (has a DB origin). */
  get isLoaded(): boolean {
    return this._original !== UNSET;
  }

  /**
   * True when the current value differs from the original.
   * Also true for columns on new rows where a value has been assigned,
   * since those need to appear in the INSERT.
   */
  get isDirty(): boolean {
    return this._current !== this._original;
  }

  // ── Value access ──────────────────────────────────────────────────────────

  /**
   * Current value of the column.
   * Throws if neither loaded from DB nor set on a new row.
   */
  get value(): T | null {
    if (this._current === UNSET) {
      throw new Error(`Column '${this.name}' is not loaded`);
    }
    return this._current;
  }

  /** Setting a value always succeeds; marks the column dirty. */
  set value(v: T | null) {
    this._current = v;
  }

  /**
   * The value that was loaded from the database.
   * Throws if the column was never loaded.
   */
  get original(): T | null {
    if (this._original === UNSET) {
      throw new Error(`Column '${this.name}' has no original value (not loaded from DB)`);
    }
    return this._original;
  }

  // ── Internal lifecycle ────────────────────────────────────────────────────

  /**
   * Called by BaseRow._hydrate(). Passing undefined means the column was not
   * present in the query result and should remain UNSET.
   * @internal
   */
  _hydrate(value: T | null | undefined): void {
    if (value === undefined) return;
    this._original = value;
    this._current  = value;
  }

  /**
   * Called after a successful save. Resets dirty state so original reflects
   * what is now in the database.
   * @internal
   */
  _commit(): void {
    if (this._current !== UNSET) {
      this._original = this._current;
    }
  }
}
