import { PoolClient } from 'pg';
import { isRecord } from '../../util/tools.js';
import {
  ALL,
  ANY,
  UnaryPGOperator,
  isUnaryPGOperator,
  BinaryPGOperator,
  isBinaryPGOperator,
  TrinaryPGOperator,
  isTrinaryPGOperator,
  MultiaryPGOperator,
  isMultiaryPGOperator,
  isPGParameterType,
  PGParameterType,
  isValidPGParameterValue,
} from './pg-types.js';
import {
  getConnection,
  QueryOptions,
  queryWithConnection,
  returnConnection,
} from '../query.js';
import QueryStream from 'pg-query-stream';

type ColumnValue = number | string | boolean | bigint | Buffer | Date;

interface WhereClauseCommon {
  column: string;
  [k: string]: unknown;
}
interface WhereClauseByUnaryOperator extends WhereClauseCommon {
  type: PGParameterType;
  operator: UnaryPGOperator;
}
interface WhereClauseByBinaryOperatorScalar extends WhereClauseCommon {
  type: PGParameterType;
  operator?: BinaryPGOperator; // default `=`
  value: ColumnValue;
}
interface WhereClauseByBinaryOperatorArray extends WhereClauseCommon {
  type: PGParameterType;
  operator?: BinaryPGOperator; // default `=`
  value: ColumnValue[];
  arrayComparison: 'ANY' | 'ALL';
}
type WhereClauseByBinaryOperator =
  | WhereClauseByBinaryOperatorScalar
  | WhereClauseByBinaryOperatorArray;
interface WhereClauseByTrinaryOperator extends WhereClauseCommon {
  type: PGParameterType;
  operator: TrinaryPGOperator;
  value: [ColumnValue, ColumnValue];
}
interface WhereClauseByMultiaryOperator extends WhereClauseCommon {
  type: PGParameterType;
  operator: MultiaryPGOperator;
  value: (ColumnValue | ColumnValue[])[];
}

/**
 * Defines a simple where clause that compares a column value to a value or a
 * member of an array of values, e.g. `my_column = $1::string` or
 * `my_column = ANY($1::int[])`
 */
export type WhereClauseByOperator =
  | WhereClauseByUnaryOperator
  | WhereClauseByBinaryOperator
  | WhereClauseByTrinaryOperator
  | WhereClauseByMultiaryOperator;

/**
 * Defines a simple where clause that compares a column value to a value. Use
 * `$$` to mark where the value parameter goes, e.g.:
 * ```
 *  id IN (SELECT table_id FROM foreign_key_table WHERE v = ANY($$))
 *  -- the $$ gets substituted for the index and type, like $1::int[]
 * ```
 */
export interface WhereClauseInSelect extends WhereClauseCommon {
  select: string;
  value: (ColumnValue | ColumnValue[])[];
}

export type WhereClause = WhereClauseByOperator | WhereClauseInSelect;

class ClassifiedWhereClause {
  readonly unary: boolean = false; // set in constructor if true
  readonly binary: boolean = false; // set in constructor if true
  readonly trinary: boolean = false; // set in constructor if true
  readonly multiary: boolean = false; // set in constructor if true
  readonly inSelect: boolean = false; // set in constructor if true
  readonly clause: WhereClause;
  constructor(o: WhereClauseCommon | WhereClause) {
    if (isWhereClauseInSelect(o)) {
      this.inSelect = true;
    } else if (isWhereClauseUnaryFromCommon(o)) {
      this.unary = true;
    } else if (isWhereClauseBinaryFromCommon(o)) {
      this.binary = true;
    } else if (isWhereClauseTrinaryFromCommon(o)) {
      this.trinary = true;
    } else if (isWhereClauseMultiaryFromCommon(o)) {
      this.multiary = true;
    } else {
      throw 'invalid';
    }
    this.clause = o as WhereClause;
  }
  get type(): PGParameterType | undefined {
    return this.inSelect ? undefined : (this.clause.type as PGParameterType);
  }
  get asUnary(): WhereClauseByUnaryOperator {
    if (this.unary) {
      return this.clause as WhereClauseByUnaryOperator;
    } else {
      throw 'not a unary where clause';
    }
  }
  get asBinary(): WhereClauseByBinaryOperator {
    if (this.binary) {
      return this.clause as WhereClauseByBinaryOperator;
    } else {
      throw 'not a binary where clause';
    }
  }
  get asTrinary(): WhereClauseByTrinaryOperator {
    if (this.trinary) {
      return this.clause as WhereClauseByTrinaryOperator;
    } else {
      throw 'not a trinary where clause';
    }
  }
  get asMultiary(): WhereClauseByMultiaryOperator {
    if (this.multiary) {
      return this.clause as WhereClauseByMultiaryOperator;
    } else {
      throw 'not a multiary where clause';
    }
  }
  get asInSelect(): WhereClauseInSelect {
    if (this.inSelect) {
      return this.clause as WhereClauseInSelect;
    } else {
      throw 'not an in-select where clause';
    }
  }
}

function isWhereClauseCommon(o: unknown): o is WhereClauseCommon {
  return isRecord(o) && typeof o.column === 'string';
}
function isColumnValue(o: unknown): o is ColumnValue {
  return (
    Buffer.isBuffer(o) ||
    o instanceof Date ||
    ['string', 'number', 'boolean', 'bigint'].includes(typeof o)
  );
}
function isWhereClauseUnaryFromCommon(
  o: WhereClauseCommon | WhereClause
): o is WhereClauseByUnaryOperator {
  return (
    isPGParameterType(o.type) &&
    o.value === undefined &&
    isUnaryPGOperator(o.operator)
  );
}
function isWhereClauseBinaryFromCommon(
  o: WhereClauseCommon | WhereClause
): o is WhereClauseByBinaryOperator {
  return (
    isPGParameterType(o.type) &&
    (o.operator === undefined || // default is =
      isBinaryPGOperator(o.operator)) &&
    (Array.isArray(o.value) && !Buffer.isBuffer(o.value)
      ? o.value.every((v) => isColumnValue(v)) &&
        typeof o.arrayComparison === 'string' &&
        [ANY, ALL].includes(o.arrayComparison)
      : isColumnValue(o.value))
  );
}
function isWhereClauseTrinaryFromCommon(
  o: WhereClauseCommon | WhereClause
): o is WhereClauseByTrinaryOperator {
  return (
    isPGParameterType(o.type) &&
    Array.isArray(o.value) &&
    o.value.length === 2 &&
    isColumnValue(o.value[0]) &&
    isColumnValue(o.value[1]) &&
    isTrinaryPGOperator(o.operator)
  );
}
function isWhereClauseMultiaryFromCommon(
  o: WhereClauseCommon | WhereClause
): o is WhereClauseByMultiaryOperator {
  return (
    isPGParameterType(o.type) &&
    Array.isArray(o.value) &&
    o.value.every((oi) => isColumnValue(oi)) &&
    isMultiaryPGOperator(o.operator)
  );
}

function isWhereClauseByUnaryOperator(
  o: unknown
): o is WhereClauseByUnaryOperator {
  return isWhereClauseCommon(o) && isWhereClauseUnaryFromCommon(o);
}
function isWhereClauseByBinaryOperator(
  o: unknown
): o is WhereClauseByBinaryOperator {
  return isWhereClauseCommon(o) && isWhereClauseBinaryFromCommon(o);
}
function isWhereClauseByTrinaryOperator(
  o: unknown
): o is WhereClauseByTrinaryOperator {
  return isWhereClauseCommon(o) && isWhereClauseTrinaryFromCommon(o);
}
function isWhereClauseByArrayOperator(
  o: unknown
): o is WhereClauseByMultiaryOperator {
  return isWhereClauseCommon(o) && isWhereClauseMultiaryFromCommon(o);
}
function isWhereClauseByOperatorFromCommon(
  o: WhereClauseCommon
): o is WhereClauseByOperator {
  return (
    isWhereClauseCommon(o) &&
    (isWhereClauseUnaryFromCommon(o) ||
      isWhereClauseBinaryFromCommon(o) ||
      isWhereClauseTrinaryFromCommon(o) ||
      isWhereClauseMultiaryFromCommon(o))
  );
}
function whereClauseInSelectFromCommon(
  o: WhereClauseCommon
): o is WhereClauseInSelect {
  return (
    typeof o.select === 'string' &&
    Array.isArray(o.value) &&
    o.value.every((v) => {
      return Array.isArray(v)
        ? v.every((vv) => isColumnValue(vv))
        : isColumnValue(v);
    })
  );
}
function isWhereClauseByOperator(o: unknown): o is WhereClauseByOperator {
  return isWhereClauseCommon(o) && isWhereClauseByOperatorFromCommon(o);
}
function isWhereClauseInSelect(o: unknown): o is WhereClauseInSelect {
  return isWhereClauseCommon(o) && whereClauseInSelectFromCommon(o);
}
function isWhereClause(o: unknown): o is WhereClause {
  return (
    isWhereClauseCommon(o) &&
    (isWhereClauseByOperatorFromCommon(o) || whereClauseInSelectFromCommon(o))
  );
}

function isColumnValueForType(
  value: unknown,
  type: PGParameterType
): value is ColumnValue {
  return isColumnValue(value) && isValidPGParameterValue(type, value);
}

type OrderBy = string | { column: string; direction: 'ASC' | 'DESC' };

export interface LoadByIdsOptions {
  /**
   * Caller-owned connection, which is left open. When omitted, search acquires
   * a pooled connection and releases it when finished.
   */
  connection?: PoolClient;
  /**
   * Additional where clauses.
   */
  wheres?: WhereClause[];
}

/**
 * Controls the selected columns, connection, ordering, and pagination.
 */
export interface SearchOptions {
  /**
   * Columns to select. Omitted or empty lists select all columns (`*`).
   * Entries are inserted directly into SQL and must be trusted SQL.
   */
  columns?: string[];
  /**
   * Caller-owned connection, which is left open. When omitted, search acquires
   * a pooled connection and releases it when finished.
   */
  connection?: PoolClient;
  /** Maximum number of rows to return. Omitted means no limit. */
  limit?: number;
  /** Number of rows to skip before returning results. Defaults to zero. */
  offset?: number;
  /**
   * Columns to sort by, in priority order. String entries default to `ASC`.
   * Omitted or empty lists leave the order unspecified. Column names are
   * inserted directly into SQL and must be trusted SQL.
   */
  orderBy?: OrderBy | OrderBy[];
}

export function loadByIds<T extends { id: number }>(
  tablename: string,
  ids: (number | string)[],
  cb: (row: T) => void
): Promise<void>;
export function loadByIds<T extends { id: number }>(
  tablename: string,
  ids: (number | string)[],
  options: LoadByIdsOptions,
  cb: (row: T) => void
): Promise<void>;
export function loadByIds<T extends { id: number }>(
  tablename: string,
  ids: (number | string)[],
  options?: LoadByIdsOptions
): Promise<T[]>;
export function loadByIds<T extends { id: number }>(
  tablename: string,
  ids: (number | string)[],
  options?: LoadByIdsOptions | ((row: T) => void),
  cb?: (row: T) => void
): Promise<T[] | void> {
  if (typeof options === 'function') {
    cb = options;
    options = undefined;
  }
  options ??= {};

  // avoid a query if the list is empty
  if (ids.length === 0) {
    return cb ? Promise.resolve() : Promise.resolve([]);
  }

  const searchOptions: SearchOptions = {
    connection: options.connection,
  };

  // convert all strings to numbers and filter out duplicates
  const uniqueIds: number[] = [
    ...new Set(
      ids.map((id) => {
        const result = typeof id === 'string' ? Number.parseInt(id) : id;
        if (Number.isNaN(result)) {
          throw `invalid id "${id}"`;
        }
        return result;
      })
    ),
  ];
  const where: WhereClauseByBinaryOperator = {
    column: 'id',
    type: 'int',
    operator: '=',
    value: uniqueIds,
    arrayComparison: ANY,
  };
  const wheres: WhereClause[] = [where];
  if (options.wheres) {
    wheres.push(...options.wheres);
  }

  return cb
    ? search<T>(tablename, wheres, searchOptions, cb)
    : search<T>(tablename, wheres, searchOptions);
}

/**
 * Selects columns from a table, combining the where clauses with `AND`.
 * All columns are selected unless options.columns specifies a non-empty list.
 * An empty clause list selects rows without a `WHERE` condition.
 *
 * With a callback, streams each row to the callback and resolves without a
 * result. Without a callback, resolves with an array of rows. Callbacks are
 * invoked synchronously; returned promises are not awaited.
 *
 * @typeParam T - The expected row shape; rows are not converted to instances.
 * @param tablename - Trusted SQL table name, inserted directly into the query.
 * @param whereClauses - Conditions to apply. Column names and SQL fragments
 * must be trusted because they are inserted directly into the query.
 * @param options - Column selection, connection, ordering, and pagination.
 * @param cb - Optional callback invoked for each streamed row.
 * @returns A promise for the row array, or void when a callback is supplied.
 * @remarks A supplied connection remains owned by the caller. Otherwise, the
 * function acquires a connection and attempts to release it when finished.
 */
export function search<T extends { id: number }>(
  tablename: string,
  whereClauses: WhereClause[],
  options: SearchOptions,
  cb: (row: T) => void
): Promise<void>;
export function search<T extends { id: number }>(
  tablename: string,
  whereClauses: WhereClause[],
  options: SearchOptions
): Promise<T[]>;
export async function search<T extends { id: number }>(
  tablename: string,
  whereClauses: WhereClause[],
  options: SearchOptions = {},
  cb?: (row: T) => void
): Promise<T[] | void> {
  const params: any[] = [];
  const whereClauseParts: string[] = [];

  const param = (cwc: ClassifiedWhereClause, index?: number): string => {
    let placeholder!: string;
    const value = (v: unknown): unknown => {
      const values = Array.isArray(v) ? v : [v];
      for (const [index, item] of values.entries()) {
        if (!cwc.type) {
          throw new TypeError();
        }
        if (!isValidPGParameterValue(cwc.type, item)) {
          const location = Array.isArray(v) ? ` at array index ${index}` : '';
          throw new TypeError(
            `Invalid value${location} for column "${cwc.clause.column}" ` +
              `with PostgreSQL parameter type "${cwc.type}"`
          );
        }
      }
      if (cwc.type === 'json' || cwc.type === 'jsonb') {
        return Array.isArray(v)
          ? v.map((vi) => JSON.parse(vi as string))
          : JSON.parse(v as string);
      } else {
        return v;
      }
    };
    if (cwc.multiary) {
      placeholder = (cwc.asMultiary.value as unknown[])
        .map((v) => {
          params.push(value(v));
          return `$${params.length}::${cwc.type as string}`;
        })
        .join(', ');
    } else if (cwc.trinary) {
      params.push(value((cwc.asTrinary.value as unknown[])[index as number]));
      placeholder = `$${params.length}::${cwc.type as string}`;
    } else if (cwc.inSelect) {
      const v = (cwc.asInSelect.value as unknown[])[index as number];
      const pgType = (cwc.type as string) + (Array.isArray(v) ? '[]' : '');
      params.push(value(v));
      placeholder = `$${params.length}::${pgType}`;
    } else {
      params.push(value(cwc.clause.value));
      placeholder = `$${params.length}::${cwc.type as string}`;
    }
    return placeholder;
  };

  for (const wc of whereClauses) {
    if (isWhereClauseCommon(wc)) {
      const cwc = new ClassifiedWhereClause(wc);
      if (cwc.unary) {
        whereClauseParts.push(`${wc.column} ${wc.operator}`);
      } else if (cwc.binary) {
        const op = wc.operator || '=';
        if (Array.isArray(wc.value)) {
          whereClauseParts.push(
            `${wc.column} ${op} ${wc.arrayComparison}(${param(cwc)}[])`
          );
        } else {
          whereClauseParts.push(`${wc.column} ${op} ${param(cwc)}`);
        }
      } else if (cwc.trinary) {
        whereClauseParts.push(
          `${wc.column} ${wc.operator} ${param(cwc, 0)} AND ${param(cwc, 1)}`
        );
      } else if (cwc.multiary) {
        if (cwc.asMultiary.value.length) {
          whereClauseParts.push(`${wc.column} ${wc.operator} (${param(cwc)})`);
        } else {
          throw 'Empty multiarty value set';
        }
      } else if (cwc.inSelect) {
        let $$index!: number;
        let select = `${cwc.asInSelect.column} IN (${cwc.asInSelect.select})`;
        let index = 0;
        while (-1 !== ($$index = select.indexOf('$$'))) {
          if (cwc.asInSelect.value.length <= index) {
            throw 'more parameters than values in where-select clause';
          }
          select =
            select.substring(0, $$index) +
            param(cwc, index++) +
            select.substring($$index + 2);
        }
        if (cwc.asInSelect.value.length > index) {
          throw 'more values than parameters in where-select clause';
        }
        whereClauseParts.push(select);
      } else {
        throw 'Unrecognized where clause';
      }
    } else {
      throw 'Invalid where clause';
    }
  }

  let orderByClause: string | null = null;
  if (
    options.orderBy &&
    (!Array.isArray(options.orderBy) || options.orderBy.length)
  ) {
    const ob = Array.isArray(options.orderBy)
      ? options.orderBy
      : [options.orderBy];
    orderByClause =
      ` ORDER BY ` +
      ob
        .map((obi) => {
          if (typeof obi === 'string') {
            obi = { column: obi, direction: 'ASC' };
          }
          return `${obi.column} ${obi.direction}`;
        })
        .join(', ');
  }

  let limitClause: string = '';
  if (options.limit !== undefined) {
    limitClause = ` LIMIT ${options.limit}`;
  }
  if (options.offset) {
    limitClause += ` OFFSET ${options.offset}`;
  }

  const columns = options.columns?.length ? options.columns.join(', ') : '*';

  let query = `SELECT ${columns} FROM ${tablename}`;
  if (whereClauseParts.length) {
    query += ` WHERE ${whereClauseParts.join(' AND ')}`;
  }
  if (orderByClause) {
    query += orderByClause;
  }
  if (limitClause) {
    query += limitClause;
  }

  let conn!: QueryOptions | undefined;
  const ownConn: boolean = !options.connection;
  try {
    conn = {
      connection: options.connection ?? (await getConnection()),
      allowHardcoded: true,
    };

    if (cb) {
      const queryStream = conn.connection.query(new QueryStream(query, params));
      for await (const row of queryStream) {
        cb(row as T);
      }
      return;
    } else {
      const queryResult = await queryWithConnection(conn, query, params);
      return queryResult.rows as T[];
    }
  } finally {
    if (ownConn && conn) {
      returnConnection(conn.connection);
    }
  }
}
