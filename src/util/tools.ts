import { Response } from 'filamentjs';
import { InvalidQuery } from './exceptions.js';

/**
 * Asserts that a value is a signed 32-bit PostgreSQL integer.
 * @param o The value to validate.
 * @param options additional restrictions on the integer value
 * @param options.gtzero requires the number to be greater than zero
 * @param options.gezero requires the number to be at least zero
 * @throws {InvalidQuery} if the value violates a restriction.
 */
export function assertPGableInteger(
  o: unknown,
  options?: {
    gtzero?: boolean,
    gezero?: boolean
  }
): asserts o is number {
  const lowerBound = options?.gtzero ? 1 : options?.gezero ? 0 : -2147483648;
  if (
    typeof o !== 'number' || !Number.isInteger(o) ||
    o < lowerBound || o > 2147483647
  ) {
    throw new InvalidQuery(
      'Expected a PostgreSQL integer within the permitted range.'
    );
  }
}
/**
 * Asserts that a value is an array of signed 32-bit PostgreSQL integers.
 * @param o The array to validate. Empty arrays are accepted.
 * @throws {InvalidQuery} if the value or an element is invalid.
 */
export function assertPGableIntegerArray(o: unknown): asserts o is number[] {
  if (Array.isArray(o)) {
    o.forEach(oi => assertPGableInteger(oi));
  } else {
    throw new InvalidQuery('Expected an array of PostgreSQL integers.');
  }
}

/**
 * Recursively copies arrays and enumerable own string properties of objects.
 * Object copies are plain objects; prototypes and built-in state are not kept.
 * Circular references are unsupported.
 * @param obj The value to copy. Primitive values are returned unchanged.
 * @returns The copied value.
 */
export function deepClone<T>(obj: T|null): T|null {
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as any;
  } else if (obj === null) {
    return null;
  } else if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.hasOwn(obj, key)) {
        newObj[key] = deepClone((obj as any)[key]);
      }
    }
    return newObj;
  } else {
    return obj;
  }
}

/**
 * Combines a copy of a base value with subsequent object sources.
 * Arrays and scalar values replace existing values, new value always replace
 * arrays and scalars, and objects are merged recursively. Later sources take
 * precedence. Sources must be acyclic.
 * Only enumerable own string properties are copied into plain objects.
 * Replacement arrays and objects are copied recursively. Functions are atomic
 * values and retain their identity; prototypes and built-in state are not kept.
 * @param complete The base value to copy before merging.
 * @param sources The sources to apply in order.
 * @returns The combined value.
 */
export function deepMerge<T extends object>(
  complete: T,
  ...sources: object[]
): T {
  // Copy inputs recursively, treating functions and primitives as atomic.
  function copy(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map(copy);
    }
    if (isRecord(value)) {
      const result: Record<string, unknown> = {};
      mergeInto(result, value);
      return result;
    }
    return value;
  }

  // Only merge own properties. Define data properties so special names such
  // as __proto__ remain ordinary keys without invoking inherited setters.
  function mergeInto(target: Record<string, unknown>, source: object): void {
    for (const key of Object.keys(source)) {
      const incoming = (source as Record<string, unknown>)[key];
      const existing = Object.hasOwn(target, key) ? target[key] : undefined;
      if (isRecord(existing) && isRecord(incoming)) {
        mergeInto(existing, incoming);
      } else {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: true,
          value: copy(incoming),
          writable: true,
        });
      }
    }
  }

  const result = copy(complete) as T;
  for (const source of sources) {
    mergeInto(result as Record<string, unknown>, source);
  }
  return result;
}

/**
 * Selects the earlier of two valid dates without copying it.
 * @param d1 The first date, also returned when the timestamps are equal.
 * @param d2 The second date.
 * @returns The date with the earlier timestamp.
 */
export function earlierDate(d1: Date, d2: Date): Date {
  return d2.valueOf() < d1.valueOf() ? d2 : d1;
}

/**
 * Tests whether a value is null or undefined.
 * @param value The value to test.
 * @returns Whether the value is null or undefined.
 */
export function isNil(value: any): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Tests for a number or an array containing only numbers.
 * Empty arrays, NaN and infinities are accepted; integer bounds are not tested.
 * @param value The value to test.
 * @returns Whether the value has the required shape.
 */
export function isNumberOrNumberArray(value: unknown): value is number|number[] {
  return typeof value === 'number' ||
    (Array.isArray(value) && value.every(item => typeof item === 'number'));
}

/**
 * Tests for a non-null object other than an array, including class instances.
 * @param value The value to test.
 * @returns Whether the value is a non-array object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/**
 * Tests for a valid Date or a string accepted by JavaScript's date parser.
 * @param value The date or date string to test.
 * @returns Whether the value represents a valid date.
 */
export function isValidDate(value: unknown): value is string|Date {
  return ( value instanceof Date && !Number.isNaN(value.valueOf()) ) ||
    ( typeof value === 'string' && !Number.isNaN(new Date(value).valueOf()) );
}
/**
 * Asserts that a value is a non-null, non-array object.
 * @param value The value to validate.
 * @throws {TypeError} If the value is not a record.
 */
export function assertRecord(value: unknown)
: asserts value is Record<string, unknown> {
  if (!isRecord(value)) {
    throw TypeError('Expected an object');
  }
}

/**
 * Wraps a single value in an array, preserving existing arrays by reference.
 * @param value The value or array to normalise.
 * @returns The existing array or a new single-element array.
 */
export function normalizeArray<T>(value: T|T[]): T[] {
  return Array.isArray(value) ? value : [value];
}

// export function normalizeArrayOfInts(
//   value?:string|string[]
// ):number[] {

//   if (value === undefined || value === '') {
//     return [];
//   }

//   const result:number[] = [];
//   if (!Array.isArray(value)) {
//     value = [value];
//   }
//   for (const v of value) {
//     if (v !== '') {
//       result.push(...v.split(/,\s*/).map(v => Number.parseInt(v)))
//     }
//   }
//   if (result.some(v => Number.isNaN(v))) {
//     throw new InvalidQuery('Expected integers.');
//   }
//   return result;
// }

/**
 * Normalises a boolean or a recognised, case-insensitive boolean string.
 * @param value the value to normalize to `true` or `false`
 * @param booleanOptions Optional name alias and fallback value.
 * @param booleanOptions.name the name of the parameter. If provided, a value
 *  equal to the name is accepted as `true`.
 * @param booleanOptions.default the default value of the parameter. If
 *  provided, when an `undefined` value is provided, the normalization will
 *  return the default value. Otherwise, it'll throw.
 * @returns a boolean value
 * @throws {InvalidQuery} if the value is unrecognised or missing
 * without a default.
 */
export function normalizeBoolean(
  value?: string|boolean, booleanOptions?: {name?: string, default?: boolean}
) {
  if (value === undefined) {
    if (booleanOptions && Object.hasOwn(booleanOptions, 'default')) {
      return booleanOptions.default;
    }
    throw new InvalidQuery('Expected a boolean value.');
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const vlc = value.toLowerCase()
  if (booleanOptions?.name && [value, vlc].includes(booleanOptions?.name)) {
    return true;
  } else if (['y','yes','t','true','1','si','sí','sim'].includes(vlc)) {
    return true;
  } else if (['n','no','f','false','0','non','nao','não'].includes(vlc)) {
    return false;
  } else {
    throw new InvalidQuery('Expected a recognized boolean value.');
  }          
};

/**
 * Parses a date string or returns an existing Date by reference.
 * @param value The date or date string to normalise.
 * @returns The existing Date or the parsed date.
 * @throws {InvalidQuery} if a string cannot be parsed as a date.
 */
export function normalizeDate(value: string|Date): Date {
  if (!isValidDate(value)) {
    throw new InvalidQuery('Expected a valid date.');
  }
  return value instanceof Date
    ? value
    : new Date(value);
};


/**
 * Normalises a parameter that could be a string or an array of strings,
 * to a single string. Returns undefined if either no value or an
 * empty-array value is provided.
 * @param value the value string or array to normalize.
 * @param multipleValues how to handle an array with more than one value.
 *  returns the first value, last value, or throws an `InvalidQuery`
 *  as an exception.
 * @returns The selected string, or undefined when no value is available.
 * @throws {InvalidQuery} for multiple values in `throw` mode.
 */
export function normalizeZeroOrOne(
  value?:string|string[],
  multipleValues:'first'|'last'|'throw' = 'throw'
):string|undefined {
  if (Array.isArray(value)) {
    if (value.length > 1) {
      switch(multipleValues) {
      case 'first':
        return value[0];
      case 'last':
        return value[value.length-1];
      case 'throw':
        throw new InvalidQuery('Expected at most one parameter value.');
      }
    } else if (value.length === 1) {
      return value[0];
    } else {
      return undefined;
    }
  } else {
    return value;
  }
};

/**
 * Returns a copy of a `Record` that does not contain any of the entries listed
 * in `keys`.
 * @param o the object to copy
 * @param keys The keys to exclude, individually or in arrays.
 * @returns a copy of the object without the given keys
 */
export function omit(
  o: Record<string, unknown>,
  ...keys:readonly (string|(readonly string[]))[]
):Record<string, unknown> {
  const result: any = {};
  const flatKeys = keys.flat();
  for (const key in o) {
    if (!flatKeys.includes(key)) {
      result[key] = o[key];
    }
  }
  return result;
}

/**
 * Creates a handler to send results of request to a response. Collects one
 * results object at a time, and either sends them each back in real time if
 * streaming is enabled, or returns them all a single array if streaming mode
 * is not enabled. 
 * @param stream set to `true` to stream the results, that is send one item
 *  per line in new-line delimited JSON. Set to `false` to send all the results
 *  as a single array in JSON.
 * @param res The response to receive the serialised results.
 * @returns A handler with `object` to accept a value and `end` to finish the
 * response, plus the streaming flag and buffered JSON strings, if applicable.
 */
export function outputHandler(stream: boolean, res: Response) {
  const result = {
    accumulator: stream ? null : new Array<string>(),
    isStreaming: stream,
    object: stream
      ? (datum:unknown):void => {
          res.sendChunk(JSON.stringify(datum) + '\n');
        }
      : (datum:unknown):void => {
          result.accumulator?.push(JSON.stringify(datum));
        },
    end: stream
      ? ():void => { res.end(); }
      : ():void => {
        res.send(`[${result.accumulator?.join(',')}]`);
        res.end();
      }
  };
  res.headers.set(
    'Content-Type',
    stream ? 'application/x-ndjson' : 'application/json'
  );
  return result;
}

/**
 * Returns a copy of a `Record` that contains only the entries listed in `keys`.
 * If the object key is missing from the original object, there will be no
 * entry in the new object either.
 * @param o the object to copy
 * @param keys the keys to include.
 * @returns a copy of the object with only the listed keys.
 */
export function pick(
  o: Record<string, unknown>,
  ...keys:readonly (string|(readonly string[]))[]
):Record<string, unknown> {
  const resultEntries:[string, unknown][] = [];
  const addIfAvailable = (key: string) => {
    if (Object.hasOwn(o, key)) {
      resultEntries.push([key, o[key]])
    }
  }
  for (const k of keys) {
    if (Array.isArray(k)) {
      for (const kk of k) {
        addIfAvailable(kk);
      }
    } else {
      addIfAvailable(k as string);
    }
  }
  return Object.fromEntries(resultEntries);
}

/**
 * Create a random alphanumeric string. The first character is always a letter.
 * @param length how long the string should be
 * @returns a random string.
 */
export function randomString(length: number=6):string {
  let result = String.fromCharCode(
    'a'.charCodeAt(0) + Math.floor(Math.random() * 26)
  );
  for (let i = 1; i < length; i++) {
    const c = Math.floor(Math.random() * 36);
    if (c < 10) {
      result += `${c}`;
    } else {
      result += `${String.fromCharCode('a'.charCodeAt(0) + c - 10)}`
    }
  }
  return result;
}

/**
 * Yield to the event loop, allowing other asynchronous operations to proceed
 * before continuing execution of the current function. This is useful for
 * preventing long-running operations from blocking the event loop.
 * @returns Promise that resolves on the next tick of the event loop.
 */
export function yieldToEventLoop(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}
