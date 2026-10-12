import { Pool, PoolClient } from 'pg';
import { pgTypeToTs, pgArrayUdtToTs } from './type-mapper.js';
import type { OrmConfig }             from './config.js';
import type { TableInfo, ColumnInfo, RelationshipInfo } from './types.js';

// ── Raw rows from information_schema ──────────────────────────────────────

interface RawColumn {
  column_name:              string;
  data_type:                string;
  udt_name:                 string;
  is_nullable:              string;  // 'YES' | 'NO'
  column_default:           string | null;
}

interface RawFkRow {
  column_name:          string;
  foreign_table_name:   string;
  foreign_column_name:  string;
  column_count: number;
}

// ── Main reader ───────────────────────────────────────────────────────────

/**
 * Connects to the database and builds a TableInfo for every non-link,
 * non-system table, combining schema introspection with orm.config.yaml.
 */
export async function readSchema(
  connectionString: string,
  config: OrmConfig,
): Promise<TableInfo[]> {
  const pool = new Pool({ connectionString });

  try {
    const client = await pool.connect();

    try {
      return await readSchemaFromConnection(client, config);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}

/** Read schema metadata using an existing connection (also used by generator tests). */
export async function readSchemaFromConnection(client: PoolClient, config: OrmConfig): Promise<TableInfo[]> {
  const tableNames = await listTables(client);
  const results: TableInfo[] = [];

  for (const tableName of tableNames) {
    // Link tables are transparent — skip generating a class
    if (config.linkTables.has(tableName)) continue;

    const [columns, pkColumn, foreignKeys] = await Promise.all([
      readColumns(client, tableName),
      readPrimaryKey(client, tableName),
      readForeignKeys(client, tableName),
    ]);

    const isReference = config.referenceTables.has(tableName);
    const relationships = inferReferenceRelationships(
      tableName, columns, foreignKeys, config,
    );

    results.push({
      tableName,
      className:    toPascalCase(tableName),
      isReference,
      isLink:       false,
      pkColumn:     pkColumn ?? 'id',
      columns,
      relationships,
    });
  }

  return results;
}

function inferReferenceRelationships(
  tableName: string,
  columns: ColumnInfo[],
  foreignKeys: RawFkRow[],
  config: OrmConfig,
): RelationshipInfo[] {
  const relationships = [...(config.relationships.get(tableName) ?? [])];
  for (const fk of foreignKeys) {
    if (!config.referenceTables.has(fk.foreign_table_name)) continue;
    if (fk.column_count !== 1) {
      throw new Error(`Composite reference foreign key on '${tableName}' is not supported`);
    }
    // An explicitly configured single relationship for this FK overrides inference.
    if (relationships.some(rel => rel.kind === 'single' && rel.foreignKey === fk.column_name)) continue;
    const name = fk.column_name.endsWith('_id')
      ? fk.column_name.slice(0, -3)
      : `${fk.column_name}_ref`;
    if (columns.some(column => column.name === name) || relationships.some(rel => rel.name === name)) {
      throw new Error(`Inferred relationship '${tableName}.${name}' conflicts with an existing property; configure a single relationship with a different name for '${fk.column_name}'`);
    }
    relationships.push({
      name,
      kind: 'single',
      foreignKey: fk.column_name,
      targetTable: fk.foreign_table_name,
      targetColumn: fk.foreign_column_name,
      isReference: true,
      loadWith: 'simple',
    });
  }
  return relationships;
}

async function readForeignKeys(client: PoolClient, tableName: string): Promise<RawFkRow[]> {
  const result = await client.query<RawFkRow>(`
    SELECT source_column.attname AS column_name,
           target.relname AS foreign_table_name,
           target_column.attname AS foreign_column_name,
           cardinality(fk.conkey) AS column_count
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid = fk.conrelid
    JOIN pg_namespace source_schema ON source_schema.oid = source.relnamespace
    JOIN pg_class target ON target.oid = fk.confrelid
    JOIN pg_namespace target_schema ON target_schema.oid = target.relnamespace
    JOIN pg_attribute source_column
      ON source_column.attrelid = source.oid AND source_column.attnum = fk.conkey[1]
    JOIN pg_attribute target_column
      ON target_column.attrelid = target.oid AND target_column.attnum = fk.confkey[1]
    WHERE fk.contype = 'f'
      AND source_schema.nspname = 'public'
      AND target_schema.nspname = 'public'
      AND source.relname = $1
    ORDER BY fk.conname
  `, [tableName]);
  return result.rows;
}

async function listTables(client: PoolClient): Promise<string[]> {
  const result = await client.query<{ table_name: string }>(`
    SELECT table_name
    FROM   information_schema.tables
    WHERE  table_schema = 'public'
      AND  table_type   = 'BASE TABLE'
    ORDER  BY table_name
  `);
  return result.rows.map((r: { table_name: string }) => r.table_name);
}

async function readColumns(client: PoolClient, tableName: string): Promise<ColumnInfo[]> {
  const [colResult, pkResult] = await Promise.all([
    client.query<RawColumn>(`
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM   information_schema.columns
      WHERE  table_schema = 'public'
        AND  table_name   = $1
      ORDER  BY ordinal_position
    `, [tableName]),
    readPkSet(client, tableName),
  ]);

  return colResult.rows.map((row: RawColumn) => {
    const tsType = row.data_type === 'ARRAY'
      ? pgArrayUdtToTs(row.udt_name)
      : pgTypeToTs(row.data_type);

    return {
      name:         row.column_name,
      pgType:       row.data_type,
      tsType,
      isNullable:   row.is_nullable === 'YES',
      isPrimaryKey: pkResult.has(row.column_name),
      hasDflt:      row.column_default !== null,
    };
  });
}

async function readPkSet(client: PoolClient, tableName: string): Promise<Set<string>> {
  const result = await client.query<{ column_name: string }>(`
    SELECT kcu.column_name
    FROM   information_schema.table_constraints   tc
    JOIN   information_schema.key_column_usage    kcu
           ON  tc.constraint_name  = kcu.constraint_name
           AND tc.table_schema     = kcu.table_schema
    WHERE  tc.table_schema    = 'public'
      AND  tc.table_name      = $1
      AND  tc.constraint_type = 'PRIMARY KEY'
  `, [tableName]);
  return new Set(result.rows.map((r: { column_name: string }) => r.column_name));
}

async function readPrimaryKey(client: PoolClient, tableName: string): Promise<string | null> {
  const pkSet = await readPkSet(client, tableName);
  const [first] = pkSet;
  return first ?? null;
}

// ── Utilities ─────────────────────────────────────────────────────────────

/**
 * Converts snake_case table names to PascalCase class names.
 * e.g. "article_attachments" → "ArticleAttachments"
 */
function toPascalCase(name: string): string {
  return name
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}
