/**
 * Type guards for FormLogic BaseObject types.
 * These help safely extract values from FormLogic runtime results.
 */

// Minimal interface for objects with a value property
interface ValueObject {
  value: unknown;
}

// Minimal interface for ArrayObject-like structures
interface ArrayLikeObject {
  elements: unknown[];
}

// Minimal interface for HashObject-like structures with Map pairs
interface HashObjectWithMap {
  pairs: Map<string, unknown>;
}

// Minimal interface for HashObject-like structures with plain object pairs
interface HashObjectWithPlainPairs {
  pairs: Record<string, unknown>;
}

// Minimal interface for inspectable objects
interface InspectableObject {
  inspect: () => string;
}

/**
 * Check if object has a 'value' property (StringObject, IntegerObject, etc.)
 */
export function hasValue(obj: unknown): obj is ValueObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'value' in obj
  );
}

/**
 * Check if object is ArrayObject-like (has elements array)
 */
export function isArrayLike(obj: unknown): obj is ArrayLikeObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'elements' in obj &&
    Array.isArray((obj as ArrayLikeObject).elements)
  );
}

/**
 * Check if object is HashObject with Map pairs
 */
export function isHashWithMap(obj: unknown): obj is HashObjectWithMap {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'pairs' in obj &&
    (obj as HashObjectWithMap).pairs instanceof Map
  );
}

/**
 * Check if object is HashObject with plain object pairs
 */
export function isHashWithPlainPairs(obj: unknown): obj is HashObjectWithPlainPairs {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'pairs' in obj &&
    typeof (obj as HashObjectWithPlainPairs).pairs === 'object' &&
    !((obj as HashObjectWithPlainPairs).pairs instanceof Map)
  );
}

/**
 * Check if object has an inspect method
 */
export function isInspectable(obj: unknown): obj is InspectableObject {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    'inspect' in obj &&
    typeof (obj as InspectableObject).inspect === 'function'
  );
}

// Maximum depth for recursive extraction to prevent stack overflow
const MAX_EXTRACT_DEPTH = 50;

/**
 * Recursively extract the actual value from a FormLogic object
 * Handles nested structures and various FormLogic wrapper types
 * Uses depth limiting to prevent stack overflow on deeply nested or circular structures
 */
export function extractDeepValue(val: unknown, depth: number = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  // Depth limit to prevent stack overflow
  if (depth > MAX_EXTRACT_DEPTH) {
    console.warn('[extractDeepValue] Max depth exceeded, returning placeholder');
    return '[Object: max depth exceeded]';
  }

  if (val === null || val === undefined) {
    return val;
  }

  // Primitive types - return as-is
  if (typeof val !== 'object') {
    return val;
  }

  // Circular reference detection
  if (seen.has(val)) {
    console.warn('[extractDeepValue] Circular reference detected');
    return '[Circular Reference]';
  }
  seen.add(val);

  // If it has a value property (StringObject, IntegerObject, etc.), extract it
  if (hasValue(val)) {
    return extractDeepValue(val.value, depth + 1, seen);
  }

  // If it's an array-like FormLogic object, extract elements
  if (isArrayLike(val)) {
    return val.elements.map(el => extractDeepValue(el, depth + 1, seen));
  }

  // If it has an inspect method and looks like a FormLogic wrapper (has _marked or similar internal props)
  // but no other useful properties, use inspect to get the string representation
  if (isInspectable(val)) {
    const obj = val as unknown as Record<string, unknown>;
    const keys = Object.keys(obj).filter(k => !k.startsWith('_') && k !== 'inspect');
    // If the only non-internal properties are FormLogic internal ones, inspect it
    if (keys.length === 0 || (keys.length === 1 && keys[0] === 'pairs')) {
      // Check if it's a hash with useful content
      if (isHashWithMap(val) || isHashWithPlainPairs(val)) {
        // Extract from hash
        return extractFromHash(val, depth + 1, seen);
      }
      // Otherwise use inspect
      return val.inspect();
    }
  }

  // If it's a hash object, try to extract meaningful value
  if (isHashWithMap(val) || isHashWithPlainPairs(val)) {
    return extractFromHash(val, depth + 1, seen);
  }

  // For other objects, check common value properties
  const obj = val as Record<string, unknown>;

  // Check for common output value keys
  const valueKeys = ['output', '__output__', 'result', 'image', 'response', 'text', 'url'];
  for (const key of valueKeys) {
    if (key in obj && obj[key] !== undefined) {
      return extractDeepValue(obj[key], depth + 1, seen);
    }
  }

  // If it's a plain object with only _marked (internal marker), it might be empty
  const nonInternalKeys = Object.keys(obj).filter(k => !k.startsWith('_'));
  if (nonInternalKeys.length === 0) {
    // Object has no useful properties, return empty string
    return '';
  }

  // Return the object as-is if we can't extract a simpler value
  return val;
}

/**
 * Extract value from a hash object, looking for output-related keys
 * Passes depth and seen through for stack overflow prevention
 */
function extractFromHash(val: HashObjectWithMap | HashObjectWithPlainPairs, depth: number = 0, seen: WeakSet<object> = new WeakSet()): unknown {
  const pairs = isHashWithMap(val) ? val.pairs : new Map(Object.entries(val.pairs));

  // Look for output-related keys (with and without string: prefix)
  const outputKeys = ['__output__', 'output', 'result', 'image', 'response', 'value'];
  for (const key of outputKeys) {
    const prefixedKey = `string:${key}`;
    const value = pairs.get(prefixedKey) ?? pairs.get(key);
    if (value !== undefined) {
      return extractDeepValue(value, depth + 1, seen);
    }
  }

  // If no output key found, return all pairs as object
  const result: Record<string, unknown> = {};
  for (const [rawKey, value] of pairs) {
    const key = rawKey.startsWith('string:') ? rawKey.slice(7) : rawKey;
    result[key] = extractDeepValue(value, depth + 1, seen);
  }
  return result;
}

/**
 * Extract string value from a FormLogic value object
 */
export function extractValue(val: unknown): string {
  const extracted = extractDeepValue(val);
  if (extracted === null || extracted === undefined) {
    return '';
  }
  if (typeof extracted === 'string') {
    return extracted;
  }
  if (typeof extracted === 'object') {
    // If it's an array, join the elements
    if (Array.isArray(extracted)) {
      return extracted.map(e => typeof e === 'string' ? e : JSON.stringify(e)).join(', ');
    }
    return JSON.stringify(extracted);
  }
  return String(extracted);
}

/**
 * Extract array of string values from a FormLogic ArrayObject
 */
export function extractArrayValues(arrayObj: ArrayLikeObject): string[] {
  return arrayObj.elements.map((el) => {
    const extracted = extractDeepValue(el);
    if (typeof extracted === 'string') {
      return extracted;
    }
    if (extracted === null || extracted === undefined) {
      return '';
    }
    return JSON.stringify(extracted);
  });
}

/**
 * Extract node outputs from a FormLogic HashObject result
 */
export function extractNodeOutputs(result: unknown): {
  outputs: Record<string, string | string[]>;
  finalValue: string | string[];
} {
  const outputs: Record<string, string | string[]> = {};
  let finalValue: string | string[] = '';

  // Helper to strip 'string:' prefix from FormLogic hash keys
  const cleanKey = (key: string): string => {
    return key.startsWith('string:') ? key.slice(7) : key;
  };

  // Helper to check if key represents the final output
  const isFinalKey = (key: string): boolean => {
    const clean = cleanKey(key);
    return clean === 'final' || clean === '__output__';
  };

  // Helper to extract value from any type
  const extractAnyValue = (value: unknown): string | string[] => {
    if (isArrayLike(value)) {
      return extractArrayValues(value);
    }
    // Use extractValue which now uses extractDeepValue for better extraction
    return extractValue(value);
  };

  if (isHashWithMap(result)) {
    for (const [rawKey, value] of result.pairs) {
      const key = cleanKey(rawKey);
      const extractedValue = extractAnyValue(value);
      outputs[key] = extractedValue;
      if (isFinalKey(rawKey)) {
        finalValue = extractedValue;
      }
    }
  } else if (isHashWithPlainPairs(result)) {
    for (const [rawKey, value] of Object.entries(result.pairs)) {
      const key = cleanKey(rawKey);
      const extractedValue = extractAnyValue(value);
      outputs[key] = extractedValue;
      if (isFinalKey(rawKey)) {
        finalValue = extractedValue;
      }
    }
  }

  return { outputs, finalValue };
}
