import { Column } from './column.js';

/**
 * A read-only column on an ImmutableRow (reference table).
 *
 * Reference table rows are loaded once at startup and never mutated.
 */
export class ImmutableColumn<T> extends Column<T> {
  constructor(
    readonly name: string,
    value: T | null,
  ) {
    super(name, undefined, true);
    this.assumeClean(value);
  }

  get isLoaded(): true  { return true; }
  get isDirty():  false { return false; }
}
