import { Pool, PoolClient, QueryResult } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import { parsedArgs } from '../args.js';
import { completeToken, registerToken } from '../util/readiness.js';
import { getLogger } from '../util/logger.js';

const MODULE = 'data/query';

interface Query {
  description?: string;
  query: string;
}

export interface QueryOptions {
  connection: PoolClient,
  allowHardcoded?: boolean
}

/**
 * A QueryNode is a nested object where the keys are strings and the values can
 * be:
 * - A Query object (leaf node)
 * - Another QueryNode (nested structure)
 * - An SQL string
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
    typeof value === 'object' && value !== null &&
    (!('description' in value) || typeof value.description === 'string') &&
    'query' in value &&
    typeof value.query === 'string'
  );
}

/**
 * Type guard for QueryNode
 * @param value: the value to test if a QueryNode
 */
function isQueryNode(value: any, ..._circularCheck:QueryNode[])
: value is QueryNode {
  return typeof value === 'object' && value !== null &&
    Object.values(value).every((v:any) => {
      return typeof v === 'string' ||
        isQuery(v) || 
        ( !(_circularCheck.includes(v)) &&
          isQueryNode(v, value, ..._circularCheck)
        );
    });
}

let pools: Record<string, Pool> = {};

function getPool(): Pool {

  const urlArg = parsedArgs.dbUrl;
  if (!urlArg) {
    throw new Error(
      'DATABASE_URL is not set. Ensure parseArgs() is called before ' +
      'any DB queries.'
    );
  }

  if (!pools[urlArg]) {
    pools[urlArg] = new Pool({ connectionString: urlArg });
  }

  return pools[urlArg];
}

// Cache for parsed queries
let queryBook:{[key: string]:Query}|null = null;

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
      continue;
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
async function loadQueries(): Promise<QueryBook> {

  if (queryBook) {
    return Promise.resolve(queryBook);
  }

  const token = 'queries';
  registerToken(token);

  const queryPath = path.join(import.meta.dirname, 'queries.yaml');
  const fileContent = fs.readFileSync(queryPath, 'utf-8');
  const parsed = yaml.parse(fileContent) as { queries: QueryBook };

  if (!parsed.queries) {
    throw new Error('queries.yaml must have a top-level QueryBook key');
  }

  try {
    validateQueryNode(parsed.queries);
  } catch(reason) {
    completeToken(token, false);
    throw reason;
  }

  const flattened:{[key: string]:Query} = Object.create(null);
  const unroll = (node: QueryNode, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const queryPath = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') {
        flattened[queryPath] = {query:value};
      } else if (isQuery(value)) {
        flattened[queryPath] = value;
      } else {
        unroll(value, queryPath);
      }
    }
  };
  unroll(parsed.queries, '');

  queryBook = flattened;
  return queryBook;
}

/**
 * Get a connection from the pool
 */
export async function getConnection():Promise<PoolClient> {
  return getPool().connect();
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
export function getQuery(path: string): Query {

  if (queryBook === null) {
    throw new Error(`Queries not loaded yet`);
  }

  const query:unknown = queryBook[path];
  if (!query) {
    throw new Error(`Query "${path}" does not exist`);
  } else if (isQuery(query)) {
    return query;
  } else if (typeof query === 'string') {
    return {query};
  } else {
    throw new Error(`Unknown query type in path "${path}"`);
  }
}

/**
 * Execute a query with a provided connection
 * Returns the raw QueryResult object
 */
export async function queryWithConnection(
  options: QueryOptions,
  query: string|Query,
  parameters: any[] = []
): Promise<QueryResult> {
  const log = getLogger(MODULE, 'queryWithConnection');
  const connection = options.connection;
  let sql!:string;
  if (isQuery(query)) {
    sql = query.query;
  } else {
    if (/^[a-z][a-zA-Z0-9_]+(\.[a-z][a-zA-Z0-9_]+)*$/.test(query)) {
      query = getQuery(query).query;
    } else if (options.allowHardcoded !== true) {
      log.warn(
        'Hard-coded query or incorrectly-formatted query path "%s"', query
      );
      console.log('query:', query);
      console.log('options.allowHardcoded:', options.allowHardcoded);
      console.trace();
    }
    sql = query;
  }

  return connection.query(sql, parameters);
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
  const sql = getQuery(path);
  const connection = await getConnection();

  try {
    const result = await queryWithConnection({connection}, sql, parameters);
    return resultToArray(result);
  } finally {
    returnConnection(connection);
  }
}

/**
 * Execute a raw SQL string with optional connection. If no connection is
 * provided one is acquired from the pool and released automatically.
 * Use this for ORM-generated queries that are not in queries.yaml.
 */
export async function sqlQuery(
  sql: string,
  parameters: any[] = [],
  connectionOrDb?: PoolClient
): Promise<QueryResult> {
  if (connectionOrDb) {
    return queryWithConnection({connection: connectionOrDb}, sql, parameters);
  } else {
    const conn = await getConnection();
    try {
      return queryWithConnection({connection: conn}, {query: sql}, parameters);
    } finally {
      returnConnection(conn);
    }
  }
}

/**
 * Execute a function within a database transaction.
 * Automatically handles BEGIN, COMMIT, ROLLBACK, and connection management.
 *
 * @param callback - Function to execute with the transaction connection
 * @returns The result of the callback function
 * @throws Any error thrown by the callback (after rolling back the transaction)
 *
 * @example
 * ```typescript
 * const result = await inTransaction(async (conn) => {
 *   await article.save(conn);
 *   await audit.save(conn);
 *   return 'success';
 * });
 * ```
 */
export async function inTransaction<T>(
  callback: (connection: PoolClient) => Promise<T>
): Promise<T> {
  const conn = await getConnection();
  
  await conn.query('BEGIN');
  
  try {
    const result = await callback(conn);
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK');
    throw err;
  } finally {
    returnConnection(conn);
  }
}

loadQueries();
