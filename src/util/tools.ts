export function deepClone<T>(obj: T|null): T|null {
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as any;
  } else if (obj === null) {
    return null;
  } else if (typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        newObj[key] = deepClone((obj as any)[key]);
      }
    }
    return newObj;
  } else {
    return obj;
  }
}

export function deepMerge<T>(
  complete: T,
  ...sources: any[]
): T {
  let result = deepClone(complete) as T;

  // deep merge each source into the result. Replace whole arrays, but merge
  // objects
  for (const source of sources) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' &&
          !Array.isArray(source[key])) {
        (result as any)[key] = deepMerge(
          (result as any)[key] || {},
          (source as any)[key]
        );
      } else {
        (result as any)[key] = (source as any)[key];
      }
    }
  }

  return result;
}

export const invalidQuery = Symbol('invalid query');

export function isNil(value: any): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Normalize a parameter that could be a string or an array of strings,
 * to a single string. Returns undefined if either no value or an
 * empty-array value is provided.
 * @param value the value string or array to normalize.
 * @param multipleValues how to handle an array with more than one value.
 *  returns the first value, last value, or throws an `invalidQuery` (Symbol)
 *  as an exception.
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
        throw invalidQuery;
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
 * Normalize a parameter that is provided as a string to a boolean value. Throws
 * if the value cannot be normalized to a boolean. Designed to be flexible in
 * and values it can accept as `true` or `false`.
 * @param value the value to normalize to `true` or `false`
 * @param booleanOptions.name the name of the parameter. If provided, a value
 *  equal to the name is accepted as `true`.
 * @param booleanOptions.default the default value of the parameter. If
 *  provided, when an `undefined` value is provided, the normalization will
 *  return the default value. Otherwise, it'll throw.
 * @returns a boolean value
 */
export function normalizeBoolean(
  value?: string, booleanOptions?:{name?: string, default?:boolean}
) {
  if (value === undefined) {
    if (booleanOptions && Object.hasOwn(booleanOptions, 'default')) {
      return booleanOptions.default;
    }
    throw invalidQuery;
  }
  const vlc = value.toLowerCase()
  if (booleanOptions?.name && [value, vlc].includes(booleanOptions?.name)) {
    return true;
  } else if (['y','yes','t','true','1','si','sí','sim'].includes(vlc)) {
    return true;
  } else if (['n','no','f','false','0','non','nao','não'].includes(vlc)) {
    return false;
  } else {
    throw invalidQuery;
  }          
};

export function omit(obj: any, ...keys: string[]): any {
  const result: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key) && !keys.includes(key)) {
      result[key] = obj[key];
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
  return new Promise(resolve => process.nextTick(resolve));
}
