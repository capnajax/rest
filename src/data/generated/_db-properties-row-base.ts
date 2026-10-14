// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Reference table: db_properties

import { Column, TypeValidators } from '../orm/column.js';
import { ImmutableRow } from '../orm/immutable-row.js';
import { ReferenceData }   from '../orm/reference-data.js';


// ── Schema interface ───────────────────────────────────────────────────────

export interface DbPropertiesSchema {
  id: number;
  name: string;
  value: string;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _DbPropertiesRowBase extends ImmutableRow {
  static readonly tableName = 'db_properties';
  static readonly pkColumn  = 'id';

  // ── Columns ──────────────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly name = new Column<string>('name', TypeValidators.string, true);  // string
  readonly value = new Column<string>('value', TypeValidators.string, true);  // string



  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
    row.id.assumeClean((data['id'] ?? null) as number | null);
    row.name.assumeClean((data['name'] ?? null) as string | null);
    row.value.assumeClean((data['value'] ?? null) as string | null);
    row._registerColumns(
      row.id,
      row.name,
      row.value,
    );
    return row;
  }
}

// Register so ReferenceData.initialize() finds this class automatically.
ReferenceData.register(_DbPropertiesRowBase as any);
