/**
 * Value Converter Module
 *
 * Converts between FormLogic's BaseObject types and JavaScript values.
 * Handles deeply nested structures with depth limiting and circular reference detection.
 */

import {
  StringObject,
  IntegerObject,
  FloatObject,
  BooleanObject,
  NullObject,
  ArrayObject,
  HashObject,
} from 'formlogic-lang';
import type { BaseObject } from 'formlogic-lang';

/** Maximum recursion depth to prevent stack overflow */
const MAX_DEPTH = 100;

/**
 * Convert a FormLogic BaseObject to a JavaScript value.
 * Handles primitives, arrays, and objects with depth limiting.
 *
 * @param obj - The BaseObject to convert
 * @param depth - Current recursion depth (internal use)
 * @returns The equivalent JavaScript value
 */
export function baseObjectToJsValue(obj: BaseObject, depth: number = 0): unknown {
  // Prevent stack overflow on deeply nested structures
  if (depth > MAX_DEPTH) {
    console.warn('[ValueConverter] baseObjectToJsValue: max depth exceeded, returning string representation');
    return '[Object: max depth exceeded]';
  }

  if (obj instanceof StringObject) {
    return obj.value;
  }
  if (obj instanceof IntegerObject) {
    return obj.value;
  }
  if (obj instanceof FloatObject) {
    return obj.value;
  }
  if (obj instanceof BooleanObject) {
    return obj.value;
  }
  if (obj instanceof NullObject) {
    return null;
  }
  // For arrays and objects, try to extract the value
  if ('value' in obj && obj.value !== undefined) {
    return obj.value;
  }
  // Check for array-like objects
  if ('elements' in obj && Array.isArray((obj as { elements?: unknown[] }).elements)) {
    return (obj as { elements: BaseObject[] }).elements.map((el) => baseObjectToJsValue(el, depth + 1));
  }
  // Check for hash/object-like objects
  if ('pairs' in obj && (obj as { pairs?: Map<string, BaseObject> }).pairs instanceof Map) {
    const result: Record<string, unknown> = {};
    const pairs = (obj as { pairs: Map<string, BaseObject> }).pairs;
    pairs.forEach((value, key) => {
      // FormLogic uses 'string:key' format
      const cleanKey = key.startsWith('string:') ? key.slice(7) : key;
      result[cleanKey] = baseObjectToJsValue(value, depth + 1);
    });
    return result;
  }
  return String(obj);
}

/**
 * Convert a JavaScript value to a FormLogic BaseObject.
 * Handles primitives, arrays, and objects with depth limiting and circular reference detection.
 *
 * @param value - The JavaScript value to convert
 * @param depth - Current recursion depth (internal use)
 * @param seen - Set of already-visited objects for circular reference detection (internal use)
 * @returns The equivalent BaseObject
 */
export function jsValueToBaseObject(
  value: unknown,
  depth: number = 0,
  seen: WeakSet<object> = new WeakSet()
): BaseObject {
  // Prevent stack overflow on deeply nested structures
  if (depth > MAX_DEPTH) {
    console.warn('[ValueConverter] jsValueToBaseObject: max depth exceeded, returning string representation');
    return new StringObject('[Object: max depth exceeded]');
  }

  if (value === null || value === undefined) {
    return new NullObject();
  }
  if (typeof value === 'string') {
    return new StringObject(value);
  }
  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      return new IntegerObject(value);
    }
    return new FloatObject(value);
  }
  if (typeof value === 'boolean') {
    return new BooleanObject(value);
  }

  // For objects and arrays, check for circular references
  if (typeof value === 'object') {
    if (seen.has(value)) {
      console.warn('[ValueConverter] jsValueToBaseObject: circular reference detected');
      return new StringObject('[Circular Reference]');
    }
    seen.add(value);
  }

  // Convert arrays to ArrayObject
  if (Array.isArray(value)) {
    const elements = value.map((el) => jsValueToBaseObject(el, depth + 1, seen));
    return new ArrayObject(elements);
  }
  // Convert objects to HashObject (preserves property access like obj.id)
  if (typeof value === 'object') {
    const pairs = new Map<string, BaseObject>();
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // FormLogic uses 'string:key' format for hash keys
      pairs.set(`string:${key}`, jsValueToBaseObject(val, depth + 1, seen));
    }
    return new HashObject(pairs);
  }
  // Fallback for any other type
  return new StringObject(String(value));
}
