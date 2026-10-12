// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Reference table: realms

import { Column, TypeValidators } from '../orm/column.js';
import { ImmutableRow } from '../orm/immutable-row.js';
import { ReferenceData }   from '../orm/reference-data.js';


// ── Schema interface ───────────────────────────────────────────────────────

export interface RealmsSchema {
  id: number;
  name: string;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _RealmsRowBase extends ImmutableRow {
  static readonly tableName = 'realms';
  static readonly pkColumn  = 'id';

  // ── Columns ──────────────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly name = new Column<string>('name', TypeValidators.string, true);  // string


  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
    row.id.assumeClean((data['id'] ?? null) as number | null);
    row.name.assumeClean((data['name'] ?? null) as string | null);
    row._registerColumns(
      row.id,
      row.name,
    );
    return row;
  }
}

// Register so ReferenceData.initialize() finds this class automatically.
ReferenceData.register(_RealmsRowBase as any);
