/**
 * A read-only column on an ImmutableRow (reference table).
 *
 * Reference table rows are loaded once at startup and never mutated, so
 * ImmutableColumn has no setter, is always considered loaded, and is never dirty.
 */
export class ImmutableColumn<T> {
  private readonly _value: T | null;

  constructor(
    readonly name: string,
    value: T | null,
  ) {
    this._value = value;
  }

  get isLoaded(): true  { return true;  }
  get isDirty():  false { return false; }

  get value(): T | null {
    return this._value;
  }

  /** Same as value — provided for interface symmetry with Column<T>. */
  get original(): T | null {
    return this._value;
  }
}
