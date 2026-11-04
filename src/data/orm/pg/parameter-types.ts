import { testOp } from './operators.js';

const pbNumberParameterTypesEnum = [
  'int',
  'integer',
  'int4',
  'smallint',
  'int2',
  'real',
  'float4',
  'double precision',
  'float8', // the space is `double precision` is valid
  'oid',
] as const;
const pbNumericOrStringParameterTypesEnum = ['numeric', 'decimal'] as const;
const pbBigIntParameterTypesEnum = ['bigint', 'int8'] as const;
const pbStringParameterTypesEnum = [
  'text',
  'varchar',
  'character varying',
  'name', // the space is valid
  'uuid',
  'inet',
  'cidr',
  'macaddr',
  'macaddr8',
  'money',
  'xml',
  'json',
  'jsonb',
  'tsvector',
  'tsquery',
  'bit',
  'varbit',
] as const;
const pbBooleanParameterTypesEnum = ['boolean', 'bool'] as const;
const pbBufferParameterTypesEnum = ['bytea'] as const;
const pbDateParameterTypesEnum = [
  'date',
  'timestamp',
  'timestamptz',
  'time',
  'timetz',
  'interval',
] as const;

const pgParameterTypesEnum = [
  ...pbNumberParameterTypesEnum,
  ...pbNumericOrStringParameterTypesEnum,
  ...pbBigIntParameterTypesEnum,
  ...pbStringParameterTypesEnum,
  ...pbBooleanParameterTypesEnum,
  ...pbBufferParameterTypesEnum,
  ...pbDateParameterTypesEnum,
] as const;

export const pgParameterTypes = pgParameterTypesEnum.map((t) => t as string);
export type PGParameterType = (typeof pgParameterTypesEnum)[number];
/**
 * Narrows a value to a PostgreSQL parameter type supported by this module.
 * Names and aliases must match exactly, including case and embedded spaces.
 * Array suffixes such as `[]` and type modifiers such as `(10)` are not
 * accepted.
 *
 * @param o - Value to check against the supported parameter type names.
 * @returns Whether the value is a supported parameter type name.
 */
export function isPGParameterType(o: unknown): o is PGParameterType {
  return testOp(o, pgParameterTypes);
}

/**
 * Maps each PG array-element type to its natural TypeScript type.
 *
 * Usage:
 *   type T = PGTypeToTS['uuid']  // → string
 *   type T = PGTypeToTS['int']   // → number
 *   type T = PGTypeToTS['bool']  // → boolean
 */
export type PGParameterTypeToTS = {
  // integers
  int: number;
  integer: number;
  int4: number;
  bigint: bigint;
  int8: bigint;
  smallint: number;
  int2: number;
  // numeric
  numeric: string; // use string to avoid float precision loss
  decimal: string;
  real: number;
  float4: number;
  'double precision': number;
  float8: number;
  // strings
  text: string;
  varchar: string;
  'character varying': string;
  name: string;
  // ids
  uuid: string;
  oid: number;
  // date/time
  date: string | Date;
  timestamp: string | Date;
  timestamptz: string | Date;
  time: string;
  timetz: string;
  interval: string;
  // boolean
  boolean: boolean;
  bool: boolean;
  // network
  inet: string;
  cidr: string;
  macaddr: string;
  macaddr8: string;
  // binary / misc
  bytea: Buffer;
  bit: string;
  varbit: string;
  money: string;
  xml: string;
  json: unknown;
  jsonb: unknown;
  // full-text
  tsvector: string;
  tsquery: string;
};
