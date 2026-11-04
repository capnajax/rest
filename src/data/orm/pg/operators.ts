export const BETWEEN = 'BETWEEN';
export const IS_NULL = 'IS NULL';
export const IS_NOT_NULL = 'IS NOT NULL';
export const LIKE = 'LIKE';
export const NOT_LIKE = 'NOT LIKE';
export const ILIKE = 'ILIKE';
export const NOT_ILIKE = 'NOT ILIKE';
export const IN = 'IN';

export const ALL = 'ALL';
export const ANY = 'ANY';

/**
 * Checks whether a value is a string in the supplied operator list.
 * Matching is case-sensitive; no trimming or normalisation is performed.
 *
 * @param o - Value to check.
 * @param ar - Accepted operator strings.
 * @returns Whether the value exactly matches an entry in the list.
 */
export function testOp(o: unknown, ar: string[]): boolean {
  return typeof o === 'string' && ar.includes(o);
}

const unaryPGOps = [IS_NULL, IS_NOT_NULL] as const;
const binaryPGOps = [
  '=',
  '<>',
  '>',
  '<',
  '>=',
  '<=',
  LIKE,
  NOT_LIKE,
  ILIKE,
  NOT_ILIKE,
] as const;
const trinaryPGOps = [BETWEEN] as const;
const multiaryPGOps = [IN] as const;
const pgOps = [
  ...unaryPGOps,
  ...binaryPGOps,
  ...trinaryPGOps,
  ...multiaryPGOps,
] as const;

export type UnaryPGOperator = (typeof unaryPGOps)[number];
export type BinaryPGOperator = (typeof binaryPGOps)[number];
export type TrinaryPGOperator = (typeof trinaryPGOps)[number];
export type MultiaryPGOperator = (typeof multiaryPGOps)[number];
export type PGOperator = (typeof pgOps)[number];

export const unaryPGOperators = unaryPGOps.map((t) => t as string);
export const binaryPGOperators = binaryPGOps.map((t) => t as string);
export const trinaryPGOperators = trinaryPGOps.map((t) => t as string);
export const multiaryPGOperators = multiaryPGOps.map((t) => t as string);
export const pgOperators = pgOps.map((t) => t as string);

/**
 * Narrows a value to `IS NULL` or `IS NOT NULL`.
 * Unary operators require no comparison value.
 *
 * @param o - Value to check, matched exactly and case-sensitively.
 * @returns Whether the value is a supported unary PostgreSQL operator.
 */
export function isUnaryPGOperator(o: unknown): o is UnaryPGOperator {
  return testOp(o, unaryPGOperators);
}

/**
 * Narrows a value to a supported comparison or pattern-matching operator.
 * Binary operators compare a column with one value.
 *
 * @param o - Value to check, matched exactly and case-sensitively.
 * @returns Whether the value is a supported binary PostgreSQL operator.
 */
export function isBinaryPGOperator(o: unknown): o is BinaryPGOperator {
  return testOp(o, binaryPGOperators);
}

/**
 * Narrows a value to `BETWEEN`, which compares a column with two bounds.
 *
 * @param o - Value to check, matched exactly and case-sensitively.
 * @returns Whether the value is the supported trinary PostgreSQL operator.
 */
export function isTrinaryPGOperator(o: unknown): o is TrinaryPGOperator {
  return testOp(o, trinaryPGOperators);
}

/**
 * Narrows a value to `IN`, which compares a column with a list of values.
 *
 * @param o - Value to check, matched exactly and case-sensitively.
 * @returns Whether the value is the supported multiary PostgreSQL operator.
 */
export function isMultiaryPGOperator(o: unknown): o is MultiaryPGOperator {
  return testOp(o, multiaryPGOperators);
}

/**
 * Narrows a value to any PostgreSQL operator supported by this module.
 * Array comparison modifiers `ANY` and `ALL` are not included.
 *
 * @param o - Value to check, matched exactly and case-sensitively.
 * @returns Whether the value is a supported PostgreSQL operator.
 */
export function isPGOperator(o: unknown): o is PGOperator {
  return testOp(o, pgOperators);
}
