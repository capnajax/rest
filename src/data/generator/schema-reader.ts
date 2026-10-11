import { Pool, PoolClient } from 'pg';
import { pgTypeToTs, pgArrayUdtToTs } from './type-mapper.js';
import type { OrmConfig }             from './config.js';
import type { TableInfo, ColumnInfo } from './types.js';

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
      const tableNames = await listTables(client);
      const results: TableInfo[] = [];

      for (const tableName of tableNames) {
        // Link tables are transparent — skip generating a class
        if (config.linkTables.has(tableName)) continue;

        const [columns, pkColumn] = await Promise.all([
          readColumns(client, tableName),
          readPrimaryKey(client, tableName),
        ]);

        const isReference = config.referenceTables.has(tableName);
        const relationships = config.relationships.get(tableName) ?? [];

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
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
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
