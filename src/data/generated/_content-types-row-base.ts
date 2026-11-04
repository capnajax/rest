// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Reference table: content_types

import { Column, TypeValidators } from '../orm/column.js';
import { ImmutableRow } from '../orm/immutable-row.js';
import { ReferenceData }   from '../orm/reference-data.js';
import type { FormFactorsRow } from '../tables/form-factors-row.js';

// ── Schema interface ───────────────────────────────────────────────────────

export interface ContentTypesSchema {
  id: number;
  name: string;
  form_factor_id: number;
}
export type ContentTypesRecord = {id: number} & Partial<ContentTypesSchema>;

// ── Generated base ─────────────────────────────────────────────────────────

export class _ContentTypesRowBase extends ImmutableRow {
  static readonly tableName = 'content_types';
  static readonly pkColumn  = 'id';

  // ── Columns ──────────────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly name = new Column<string>('name', TypeValidators.string, true);  // string
  readonly form_factor_id = new Column<number>('form_factor_id', TypeValidators.number, true);  // number


  get form_factor(): FormFactorsRow | null | undefined {
    const value = this.form_factor_id.toJSON();
    if (value === undefined || value === null) return value;
    return (ReferenceData.byTableId('form_factors', value, 'id') ?? null) as FormFactorsRow | null;
  }


  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
    row.id.assumeClean((data['id'] ?? null) as number | null);
    row.name.assumeClean((data['name'] ?? null) as string | null);
    row.form_factor_id.assumeClean((data['form_factor_id'] ?? null) as number | null);
    row._registerColumns(
      row.id,
      row.name,
      row.form_factor_id,
    );
    row._registerImmutableRefs(
      'form_factor'
    );
    return row;
  }
}
