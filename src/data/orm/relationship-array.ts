import type { MutableRow } from './mutable-row.js';

/**
 * Tracks a collection of related rows, recording which items have been added
 * or removed since the collection was last loaded from the database.
 *
 * Mutations are explicit (add / remove) rather than intercepted array
 * operations, which keeps tracking simple and predictable.
 */
export class RelationshipArray<T extends MutableRow> {
  private _original: T[];
  private _current:  T[];

  constructor(initial: T[] = []) {
    this._original = [...initial];
    this._current  = [...initial];
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  get items(): readonly T[] {
    return this._current;
  }

  /**
   * JSON serialization returns only the current related items.
   */
  toJSON(): T[] {
    return [...this._current];
  }

  get isDirty(): boolean {
    if (this._current.length !== this._original.length) return true;
    return this._current.some(item => !this._original.includes(item));
  }

  /** Items present in the current set but not in the original. */
  get added(): T[] {
    return this._current.filter(item => !this._original.includes(item));
  }

  /** Items present in the original set but no longer in the current set. */
  get removed(): T[] {
    return this._original.filter(item => !this._current.includes(item));
  }

  // ── Mutate ────────────────────────────────────────────────────────────────

  add(item: T): void {
    if (!this._current.includes(item)) {
      this._current.push(item);
    }
  }

  remove(item: T): void {
    const idx = this._current.indexOf(item);
    if (idx !== -1) this._current.splice(idx, 1);
  }

  // ── Internal lifecycle ────────────────────────────────────────────────────

  /**
   * Called after a successful save. Resets tracking so the current state
   * becomes the new baseline.
   * @internal
   */
  _commit(): void {
    this._original = [...this._current];
  }
}
