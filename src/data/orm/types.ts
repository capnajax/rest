/**
 * Sentinel value distinguishing "column was never touched" from null.
 * - UNSET:   column was not included in a SELECT, or is on a new row with no value assigned
 * - null:    column was loaded and its DB value is NULL
 * - T:       column was loaded and has a value
 */
export const UNSET = Symbol('UNSET');
export type Unset = typeof UNSET;

/**
 * The three named column sets every mutable row exposes.
 *
 * summary  – id, name, title, created_at (universal, fixed by convention)
 * simple   – all scalar columns + array relationships marked loadWith:'simple'
 * all      – all scalar columns + all array relationships
 */
export type ColumnSets = {
  readonly summary: readonly string[];
  readonly simple:  readonly string[];
  readonly all:     readonly string[];
};

/**
 * Defines a relationship between two tables. Relationships are used by
 * loadSimple() / loadAll() to populate RelationshipArray properties.
 *
 * kind: 'link'   – joined through a link/junction table (many-to-many)
 * kind: 'direct' – joined via a foreign key on the target table (one-to-many)
 * kind: 'single' – local foreign key references the target primary key
 *
 * loadWith: 'simple' – included in loadSimple() and loadAll()
 * loadWith: 'all'    – included only in loadAll()
 */
export type RelationshipDef =
  & {
      name:        string;
      targetTable: string;
      loadWith:    'simple' | 'all';
    }
  & (
    | { kind: 'link';   linkTable: string; sourceFk: string; targetFk: string }
    | { kind: 'direct'; foreignKey: string }
    | { kind: 'single'; foreignKey: string; isReference: boolean; targetColumn?: string }
  );

/**
 * Static shape every generated MutableRow subclass must satisfy.
 * Accessed at runtime via `this.constructor` in base methods.
 */
export interface MutableRowStatics {
  tableName:        string;
  pkColumn:         string;
  columnSets:       ColumnSets;
  relationshipDefs: RelationshipDef[];
}

/**
 * Static shape every generated ImmutableRow subclass must satisfy.
 */
export interface ImmutableRowStatics {
  tableName: string;
  pkColumn:  string;
}
