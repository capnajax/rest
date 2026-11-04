import ipaddr from 'ipaddr.js';
import { PGParameterType } from './parameter-types.js';

function isJsonText(value: unknown): boolean {
  if (!isString(value)) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

const isString = (value: unknown): value is string =>
  typeof value === 'string';

const isValidDate = (value: unknown): boolean => {
  if (!isString(value) || value.length === 0) return false;

  // Require ISO-like input with an explicit timezone for timestamps.
  // Adjust this policy if you intentionally accept PostgreSQL's broader syntax.
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  return Number.isFinite(Date.parse(value));
};

type Validator = typeof import('fast-xml-validator').SyntaxValidator;
let syntaxValidator: Validator | null | undefined; // undefined = loading
const xmlValidatorReady: Promise<void> =
  import('fast-xml-validator').then(
    (module) => {
      syntaxValidator = module.SyntaxValidator;
    },
    () => {
      syntaxValidator = null;
    }
  );

const isXmlText = (value: unknown): boolean => {
  if (typeof value !== "string") return false;

  if (syntaxValidator === undefined) {
    throw new Error("XML validator is still loading");
  }
  if (syntaxValidator === null) {
    throw new Error("'fast-xml-validator' is not available");
  }
  return syntaxValidator.validate(value) === true;
};
// Await this as part of application startup:
await xmlValidatorReady;

const pgTypeValidators: Record<string, (v: unknown)=>boolean> = {
  // UUID syntax. This checks the conventional 8-4-4-4-12 hexadecimal form.
  uuid: (v) =>
    isString(v) &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v),

  // inet accepts an IP address, optionally with a prefix length.
  inet: (v) =>
    isString(v) &&
    (ipaddr.isValid(v) || ipaddr.isValidCIDR(v)),

  // cidr requires an IP address with a prefix length.
  cidr: (v) =>
    isString(v) &&
    ipaddr.isValidCIDR(v),

  // PostgreSQL macaddr is 6 bytes; macaddr8 is 8 bytes.
  macaddr: (v) =>
    isString(v) &&
    /^(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(v),

  macaddr8: (v) =>
    isString(v) &&
    /^(?:[0-9a-f]{2}[:-]){7}[0-9a-f]{2}$/i.test(v),

  date: isValidDate,

  // Apply the same explicit-timezone policy to timestamp values.
  timestamp: isValidDate,
  timestamptz: isValidDate,

  // Basic time syntax with optional fractional seconds and timezone.
  time: (v) =>
    isString(v) &&
    /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(v),

  timetz: (v) =>
    isString(v) &&
    /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/i.test(v),

  // PostgreSQL interval syntax is broad; this is intentionally not validated
  // with a simplistic regex. Add a dedicated parser if you need strict checks.

  json: isJsonText,
  jsonb: isJsonText,

  // This checks well-formed XML, not validity against a schema/DTD.
  xml: isXmlText
};

type BufferFromArgs =
  | [string, BufferEncoding?]
  | [ArrayLike<number>]
  | [ArrayBuffer, number?, number?]
  | [SharedArrayBuffer, number?, number?];

function isBufferFromArgs(value: unknown): value is BufferFromArgs {
  if (!Array.isArray(value) || value.length === 0) return false;

  const [first, second, third] = value;

  return (
    (typeof first === 'string' &&
      (value.length === 1 ||
        (value.length === 2 &&
          (second === undefined ||
            (typeof second === 'string' &&
              Buffer.isEncoding(second)))))) ||
    (value.length === 1 &&
      first !== null &&
      typeof first === 'object' &&
      'length' in first &&
      Number.isInteger(first.length)) ||
    ((first instanceof ArrayBuffer ||
      (typeof SharedArrayBuffer !== 'undefined' &&
        first instanceof SharedArrayBuffer)) &&
      (value.length === 1 ||
        (value.length === 2 && Number.isInteger(second)) ||
        (value.length === 3 &&
          Number.isInteger(second) &&
          Number.isInteger(third)))
    )
  );
}

function isValidDateValue(value: unknown): boolean {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date
  ) {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime());
  } else {
    return false;
  }
}

function isIntegerInRange(
  value: unknown,
  min: number,
  max: number
): boolean {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

const integerValidators: Record<string, (value: unknown) => boolean> = {
  int: (v) => isIntegerInRange(v, -2_147_483_648, 2_147_483_647),
  integer: (v) => isIntegerInRange(v, -2_147_483_648, 2_147_483_647),
  int4: (v) => isIntegerInRange(v, -2_147_483_648, 2_147_483_647),
  smallint: (v) => isIntegerInRange(v, -32_768, 32_767),
  int2: (v) => isIntegerInRange(v, -32_768, 32_767),
  oid: (v) => isIntegerInRange(v, 0, 4_294_967_295)
};

const numberValidators: Record<string, (value: unknown) => boolean> = {
  real: (v) => typeof v === 'number' && Number.isFinite(v),
  float4: (v) => typeof v === 'number' && Number.isFinite(v),
  'double precision': (v) => typeof v === 'number' && Number.isFinite(v),
  float8: (v) => typeof v === 'number' && Number.isFinite(v)
};

const bigintValidators: Record<string, (value: unknown) => boolean> = {
  bigint: (v) =>
    typeof v === 'bigint' ||
    (typeof v === 'string' && /^[+-]?\d+$/.test(v)),
  int8: (v) =>
    typeof v === 'bigint' ||
    (typeof v === 'string' && /^[+-]?\d+$/.test(v))
};

const numericValidators: Record<string, (value: unknown) => boolean> = {
  numeric: (v) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)),
  decimal: (v) =>
    (typeof v === 'number' && Number.isFinite(v)) ||
    (typeof v === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v))
};

const booleanValidators: Record<string, (value: unknown) => boolean> = {
  boolean: (v) => typeof v === 'boolean',
  bool: (v) => typeof v === 'boolean'
};

const stringValidators: Record<string, (value: unknown) => boolean> = {
  text: isString,
  varchar: isString,
  'character varying': isString,
  name: isString,
  uuid: pgTypeValidators.uuid,
  inet: pgTypeValidators.inet,
  cidr: pgTypeValidators.cidr,
  macaddr: pgTypeValidators.macaddr,
  macaddr8: pgTypeValidators.macaddr8,
  money: isString,
  xml: pgTypeValidators.xml,
  json: pgTypeValidators.json,
  jsonb: pgTypeValidators.jsonb,
  tsvector: isString,
  tsquery: isString,
  bit: isString,
  varbit: isString
};

const dateValidators: Record<string, (value: unknown) => boolean> = {
  date: isValidDateValue,
  timestamp: isValidDateValue,
  timestamptz: isValidDateValue,
  time: isString,
  timetz: isString,
  interval: isString
};

const pgValueValidators: Record<string, (value: unknown) => boolean> = {
  ...integerValidators,
  ...numberValidators,
  ...bigintValidators,
  ...numericValidators,
  ...booleanValidators,
  ...stringValidators,
  ...dateValidators,

  bytea: (v) =>
    Buffer.isBuffer(v) ||
    typeof v === 'string' ||
    (isBufferFromArgs(v) && isBufferArgsUsable(v))
};

function isBufferArgsUsable(args: BufferFromArgs): boolean {
  try {
    Buffer.from(...(args as Parameters<typeof Buffer.from>));
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks a value against the local validator for a supported parameter type.
 * The value is neither converted nor checked by PostgreSQL itself.
 *
 * Integer types enforce their ranges; floating-point types require finite
 * numbers. Big integers accept bigint values or signed integer strings without
 * a range check. Numeric types accept finite numbers or numeric strings.
 * Booleans require boolean values. Most text types require strings; UUID,
 * network, MAC address, JSON text and XML text receive additional checks.
 * Date and timestamp types accept valid Date objects or values accepted by
 * the JavaScript Date constructor (strings or numbers). Time and interval
 * types only require strings. Binary values accept Buffers, strings or
 * argument tuples that can be passed successfully to `Buffer.from`.
 *
 * @param type - Supported PostgreSQL parameter type selecting the validator.
 * @param value - Candidate parameter value.
 * @returns Whether the value passes the selected validator.
 * @throws {Error} When XML text validation requires the unavailable
 * `fast-xml-validator` dependency.
 */
export function isValidPGParameterValue(
  type: PGParameterType,
  value: unknown
): boolean {
  return pgValueValidators[type](value);
}

/**
 * Throws when a value fails {@link isValidPGParameterValue}.
 * Does not convert the value or narrow it to a type-specific TypeScript type.
 *
 * @param type - Supported PostgreSQL parameter type selecting the validator.
 * @param value - Candidate parameter value.
 * @throws {TypeError} When validation fails. Formatting the error with
 * `JSON.stringify` can also throw for values such as bigints or circular data.
 * @throws {Error} When XML text validation requires the unavailable
 * `fast-xml-validator` dependency.
 */
export function assertValidPGParameterValue(
  type: PGParameterType,
  value: unknown
): asserts value is unknown {
  if (!isValidPGParameterValue(type, value)) {
    throw new TypeError(
      `Invalid value for PostgreSQL parameter type "${type}": ${
        JSON.stringify(value)}`
    );
  }
}
