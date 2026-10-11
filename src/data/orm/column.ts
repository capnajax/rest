import { UNSET, type Unset } from './types.js';

// Type validator function type
type TypeValidator = (value: unknown) => boolean;

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
  immutable: boolean;

  constructor(
    readonly name: string,
    private readonly typeValidator?: TypeValidator,
    immutable = false,
  ) {
    this.immutable = immutable;
  }

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

  /**
   * JSON serialization returns the current value, not the full Column wrapper.
   */
  toJSON(): T | null | undefined {
    return this._current === UNSET ? undefined : this._current;
  }

  /** Setting a value always succeeds; marks the column dirty. */
  set value(v: T | null) {
    if (this.immutable && this._original !== UNSET) {
      throw new Error(`Column '${this.name}' is immutable and cannot be changed`);
    }
    this._current = v;
  }

  /**
   * Set the value and mark it as clean (presumed to match database state).
   * This is useful when you know a value already exists in the database
   * and don't want it marked as dirty.
   */
  assumeClean(value: T | null): void {
    this._original = value;
    this._current  = value;
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
    
    // Validate type at runtime if validator is provided
    if (this.typeValidator && !this.typeValidator(value)) {
      throw new Error(
        `Type validation failed for column '${this.name}': expected valid type, got ${typeof value} (${value})`
      );
    }
    
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

// ── Type Validators ─────────────────────────────────────────────────────────

/**
 * Runtime type validators for common TypeScript types.
 * These are used for runtime type checking during hydration.
 */
export const TypeValidators = {
  number: (value: unknown): value is number => typeof value === 'number' && !isNaN(value),
  string: (value: unknown): value is string => typeof value === 'string',
  boolean: (value: unknown): value is boolean => typeof value === 'boolean',
  date: (value: unknown): value is Date => value instanceof Date,
  object: (value: unknown): value is Record<string, unknown> => 
    typeof value === 'object' && value !== null && !Array.isArray(value),
  
  // Nullable versions
  numberOrNull: (value: unknown): value is number | null => 
    value === null || (typeof value === 'number' && !isNaN(value)),
  stringOrNull: (value: unknown): value is string | null => 
    value === null || typeof value === 'string',
  dateOrNull: (value: unknown): value is Date | null => 
    value === null || value instanceof Date,
  objectOrNull: (value: unknown): value is Record<string, unknown> | null =>
    value === null || (typeof value === 'object' && value !== null && !Array.isArray(value)),
} as const;
