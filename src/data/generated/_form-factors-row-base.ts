// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Reference table: form_factors

import { ImmutableColumn } from '../orm/immutable-column.ts';
import { ImmutableRow }    from '../orm/immutable-row.ts';
import { ReferenceData }   from '../orm/reference-data.ts';

// ── Schema interface ───────────────────────────────────────────────────────

export interface FormFactorsSchema {
  id: number;
  name: string;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _FormFactorsRowBase extends ImmutableRow {
  static readonly tableName = 'form_factors';
  static readonly pkColumn  = 'id';

  // ── Columns ──────────────────────────────────────────────────────────────

  readonly id = new ImmutableColumn<number>('id', null as unknown as number);
  readonly name = new ImmutableColumn<string>('name', null as unknown as string);

  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
    (row as any).id = new ImmutableColumn('id', (data['id'] ?? null) as number | null);
    (row as any).name = new ImmutableColumn('name', (data['name'] ?? null) as string | null);
    row._registerColumns(
      row.id,
      row.name,
    );
    return row;
  }
}

// Register so ReferenceData.initialize() finds this class automatically.
ReferenceData.register(_FormFactorsRowBase as any);
