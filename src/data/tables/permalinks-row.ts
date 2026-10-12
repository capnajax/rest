// Hand-maintained extension of the generated base class for 'permalinks'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import { _PermalinksRowBase } from '../generated/_permalinks-row-base.js';

export class PermalinksRow extends _PermalinksRowBase {
  override toJSON(): Record<string, unknown> {
    // Serialize scalars directly: super.toJSON() could traverse article before
    // we had a chance to remove it, creating an article/permalink cycle.
    const result: Record<string, unknown> = {};
    for (const [name, column] of this._columnMap) {
      const value = column.toJSON();
      if (value !== undefined) result[name] = value;
    }
    return result;
  }
}
