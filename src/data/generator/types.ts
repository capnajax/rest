/**
 * Internal types used by the code generator.
 * These describe the database schema as read from information_schema,
 * combined with the supplementary orm.config.yaml.
 */

export interface ColumnInfo {
  name:         string;
  pgType:       string;   // raw PostgreSQL data_type
  tsType:       string;   // mapped TypeScript type
  isNullable:   boolean;
  isPrimaryKey: boolean;
  hasDflt:      boolean;  // column has a DB-level default (e.g. serial, NOW())
}

export interface RelationshipInfo {
  name:        string;
  kind:        'link' | 'direct';
  targetTable: string;
  loadWith:    'simple' | 'all';
  // link only
  linkTable?:  string;
  sourceFk?:   string;
  targetFk?:   string;
  // direct only
  foreignKey?: string;
}

export interface TableInfo {
  tableName:     string;
  className:     string;   // PascalCase derived from tableName
  isReference:   boolean;  // true → generate ImmutableRow subclass
  isLink:        boolean;  // true → skip generating a row class entirely
  pkColumn:      string;
  columns:       ColumnInfo[];
  relationships: RelationshipInfo[];
}
