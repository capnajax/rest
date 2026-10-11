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

export function isNil(value: any): value is null | undefined {
  return value === null || value === undefined;
}

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
