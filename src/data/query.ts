import { Pool, PoolClient, QueryResult } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';

interface Query {
  description?: string;
  query: string;
}

/**
 * A QueryNode is a nested object where the keys are strings and the values can
 * be:
 * - A Query object (leaf node)
 * - Another QueryNode (nested structure)
 * - A string (ignored, but used for metadata or comments in queries.yaml)
 */
interface QueryNode {
  [key: string]: string|Query|QueryNode;
}

/**
 * By convention, call the top-level object in queries.yaml "QueryBook". It is a
 * nested structure of QueryNodes, where the leaf nodes are Query objects.
 */
type QueryBook = QueryNode;

/**
 * Type guard for Query
 */
function isQuery(value: any): value is Query {
  return (
    typeof value === 'object' &&
    value !== null &&
    'query' in value &&
    typeof value.query === 'string'
  );
}

/**
 * Type guard for QueryNode
 */
function isQueryNode(value: any): value is QueryNode {
  return typeof value === 'object' && value !== null;
}

// Initialize the connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Cache for parsed queries
let queriesCache: QueryBook | null = null;

/**
 * Validate a QueryNode recursively
 */
function validateQueryNode(node: any, path: string = 'QueryBook'): void {
  if (!isQueryNode(node)) {
    throw new Error(`Invalid QueryNode at path "${path}": expected object`);
  }

  for (const [key, value] of Object.entries(node)) {
    const currentPath = `${path}.${key}`;

    if (isQuery(value)) {
      // Valid query object
      continue;
    } else if (isQueryNode(value)) {
      // Recursively validate nested QueryNode
      validateQueryNode(value, currentPath);
    } else if (typeof value === 'string') {
      throw new Error(
        `Invalid value at path "${currentPath}": strings are not allowed, expected Query or QueryNode`
      );
    } else {
      throw new Error(
        `Invalid value at path "${currentPath}": unexpected type ${typeof value}`
      );
    }
  }
}

/**
 * Load and parse the queries.yaml file
 */
function loadQueries(): QueryBook {
  if (queriesCache) {
    return queriesCache;
  }

  const queryPath = path.join(__dirname, 'queries.yaml');
  const fileContent = fs.readFileSync(queryPath, 'utf-8');
  const parsed = yaml.parse(fileContent) as { queryBook: QueryBook };

  if (!parsed.queryBook) {
    throw new Error('queries.yaml must have a top-level QueryBook key');
  }

  // Validate the entire structure
  validateQueryNode(parsed.queryBook);

  queriesCache = parsed.queryBook;
  return queriesCache as QueryBook;
}

/**
 * Get a connection from the pool
 */
export async function getConnection():Promise<PoolClient> {
  return pool.connect();
}

/**
 * Return a connection to the pool
 */
export function returnConnection(connection: PoolClient): void {
  connection.release();
}

/**
 * Get a query from queries.yaml by path (dot notation)
 * Example: getQuery('users.auth.login')
 */
export function getQuery(path: string): string {
  const books = loadQueries();
  const segments = path.split('.');

  let current: any = books;
  for (const segment of segments) {
    if (current[segment] === undefined) {
      throw new Error(`Path "${path}" not found in queries.yaml`);
    }
    current = current[segment];
  }

  if (!current.query) {
    throw new Error(`No query found at path "${path}"`);
  }

  return current.query;
}

/**
 * Execute a query with a provided connection
 * Returns the raw QueryResult object
 */
export async function queryWithConnection(
  connection: PoolClient,
  query: string,
  parameters: any[] = []
): Promise<QueryResult> {
  return connection.query(query, parameters);
}

/**
 * Convert a QueryResult to an array of rows
 */
export function resultToArray(result: QueryResult): any[] {
  return result.rows;
}

/**
 * Execute a query by book and queryname with automatic connection management
 * Gets connection from pool, executes query, converts to array, returns connection
 */
export async function query(
  path: string,
  parameters: any[] = []
): Promise<any[]> {
  const connection = await getConnection();

  try {
    const sql = getQuery(path);
    const result = await queryWithConnection(connection, sql, parameters);
    return resultToArray(result);
  } finally {
    returnConnection(connection);
  }
}