// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Reference table: content_types

import { ImmutableColumn } from '../orm/immutable-column.ts';
import { ImmutableRow }    from '../orm/immutable-row.ts';
import { ReferenceData }   from '../orm/reference-data.ts';

// ── Schema interface ───────────────────────────────────────────────────────

export interface ContentTypesSchema {
  id: number;
  name: string;
  form_factor_id: number;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _ContentTypesRowBase extends ImmutableRow {
  static readonly tableName = 'content_types';
  static readonly pkColumn  = 'id';

  // ── Columns ──────────────────────────────────────────────────────────────

  readonly id = new ImmutableColumn<number>('id', null as unknown as number);
  readonly name = new ImmutableColumn<string>('name', null as unknown as string);
  readonly form_factor_id = new ImmutableColumn<number>('form_factor_id', null as unknown as number);

  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
    (row as any).id = new ImmutableColumn('id', (data['id'] ?? null) as number | null);
    (row as any).name = new ImmutableColumn('name', (data['name'] ?? null) as string | null);
    (row as any).form_factor_id = new ImmutableColumn('form_factor_id', (data['form_factor_id'] ?? null) as number | null);
    row._registerColumns(
      row.id,
      row.name,
      row.form_factor_id,
    );
    return row;
  }
}

// Register so ReferenceData.initialize() finds this class automatically.
ReferenceData.register(_ContentTypesRowBase as any);
