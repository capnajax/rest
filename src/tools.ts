export function deepClone<T>(obj: T|null): T|null {
  if (Array.isArray(obj)) {
    return obj.map(deepClone) as any;
  } else if (obj === null) {
    return null;
  } else if (typeof obj === 'object') {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        (obj as any)[key] = deepClone((obj as any)[key]);
      }
    }
    return obj;
  } else {
    return obj;
  }
}

export function deepMerge<T>(
  complete: T,
  ...sources: Partial<T>[]
): T {
  let result = deepClone(complete) as T;

  // deep merge each source into the result. Replace whole arrays, but merge
  // objects
  for (const source of sources) {
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' &&
          !Array.isArray(source[key])) {
        (result as any)[key] = deepMerge((result as any)[key], (source as any)[key]);
      } else {
        (result as any)[key] = (source as any)[key];
      }
    }
  }

  return result;
}
  