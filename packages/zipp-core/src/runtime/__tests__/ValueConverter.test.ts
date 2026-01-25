import { describe, it, expect } from '@jest/globals';
import {
  StringObject,
  IntegerObject,
  FloatObject,
  BooleanObject,
  NullObject,
  ArrayObject,
  HashObject,
} from 'formlogic-lang';
import { baseObjectToJsValue, jsValueToBaseObject } from '../ValueConverter.js';

describe('ValueConverter', () => {
  describe('baseObjectToJsValue', () => {
    it('should convert StringObject to string', () => {
      expect(baseObjectToJsValue(new StringObject('hello'))).toBe('hello');
    });

    it('should convert IntegerObject to number', () => {
      expect(baseObjectToJsValue(new IntegerObject(42))).toBe(42);
    });

    it('should convert FloatObject to number', () => {
      expect(baseObjectToJsValue(new FloatObject(3.14))).toBe(3.14);
    });

    it('should convert BooleanObject to boolean', () => {
      expect(baseObjectToJsValue(new BooleanObject(true))).toBe(true);
      expect(baseObjectToJsValue(new BooleanObject(false))).toBe(false);
    });

    it('should convert NullObject to null', () => {
      expect(baseObjectToJsValue(new NullObject())).toBeNull();
    });

    it('should convert ArrayObject to array', () => {
      const arr = new ArrayObject([
        new StringObject('a'),
        new IntegerObject(1),
        new BooleanObject(true),
      ]);
      expect(baseObjectToJsValue(arr)).toEqual(['a', 1, true]);
    });

    it('should convert HashObject to object', () => {
      const pairs = new Map<string, import('formlogic-lang').BaseObject>();
      pairs.set('string:name', new StringObject('test'));
      pairs.set('string:value', new IntegerObject(123));
      const hash = new HashObject(pairs);

      expect(baseObjectToJsValue(hash)).toEqual({ name: 'test', value: 123 });
    });

    it('should handle nested structures', () => {
      const innerPairs = new Map<string, import('formlogic-lang').BaseObject>();
      innerPairs.set('string:id', new IntegerObject(1));

      const arr = new ArrayObject([new HashObject(innerPairs)]);

      const outerPairs = new Map<string, import('formlogic-lang').BaseObject>();
      outerPairs.set('string:items', arr);
      outerPairs.set('string:count', new IntegerObject(1));

      const hash = new HashObject(outerPairs);

      expect(baseObjectToJsValue(hash)).toEqual({
        items: [{ id: 1 }],
        count: 1,
      });
    });

    it('should handle objects with value property', () => {
      const obj = { value: 'custom' } as unknown as import('formlogic-lang').BaseObject;
      expect(baseObjectToJsValue(obj)).toBe('custom');
    });

    it('should convert unknown types to string', () => {
      const obj = { toString: () => 'custom' } as unknown as import('formlogic-lang').BaseObject;
      expect(baseObjectToJsValue(obj)).toBe('custom');
    });
  });

  describe('jsValueToBaseObject', () => {
    it('should convert null to NullObject', () => {
      const result = jsValueToBaseObject(null);
      expect(result).toBeInstanceOf(NullObject);
    });

    it('should convert undefined to NullObject', () => {
      const result = jsValueToBaseObject(undefined);
      expect(result).toBeInstanceOf(NullObject);
    });

    it('should convert string to StringObject', () => {
      const result = jsValueToBaseObject('hello');
      expect(result).toBeInstanceOf(StringObject);
      expect((result as StringObject).value).toBe('hello');
    });

    it('should convert integer to IntegerObject', () => {
      const result = jsValueToBaseObject(42);
      expect(result).toBeInstanceOf(IntegerObject);
      expect((result as IntegerObject).value).toBe(42);
    });

    it('should convert float to FloatObject', () => {
      const result = jsValueToBaseObject(3.14);
      expect(result).toBeInstanceOf(FloatObject);
      expect((result as FloatObject).value).toBe(3.14);
    });

    it('should convert boolean to BooleanObject', () => {
      const trueResult = jsValueToBaseObject(true);
      expect(trueResult).toBeInstanceOf(BooleanObject);
      expect((trueResult as BooleanObject).value).toBe(true);

      const falseResult = jsValueToBaseObject(false);
      expect(falseResult).toBeInstanceOf(BooleanObject);
      expect((falseResult as BooleanObject).value).toBe(false);
    });

    it('should convert array to ArrayObject', () => {
      const result = jsValueToBaseObject([1, 'two', true]);
      expect(result).toBeInstanceOf(ArrayObject);

      const elements = (result as ArrayObject).elements;
      expect(elements).toHaveLength(3);
      expect(elements[0]).toBeInstanceOf(IntegerObject);
      expect(elements[1]).toBeInstanceOf(StringObject);
      expect(elements[2]).toBeInstanceOf(BooleanObject);
    });

    it('should convert object to HashObject', () => {
      const result = jsValueToBaseObject({ name: 'test', value: 123 });
      expect(result).toBeInstanceOf(HashObject);

      const pairs = (result as HashObject).pairs;
      expect(pairs.get('string:name')).toBeInstanceOf(StringObject);
      expect(pairs.get('string:value')).toBeInstanceOf(IntegerObject);
    });

    it('should handle nested structures', () => {
      const result = jsValueToBaseObject({
        items: [{ id: 1 }],
        count: 1,
      });

      expect(result).toBeInstanceOf(HashObject);
      const pairs = (result as HashObject).pairs;

      const items = pairs.get('string:items');
      expect(items).toBeInstanceOf(ArrayObject);

      const firstItem = (items as ArrayObject).elements[0];
      expect(firstItem).toBeInstanceOf(HashObject);
    });

    it('should handle circular references', () => {
      const obj: Record<string, unknown> = { name: 'test' };
      obj.self = obj; // Circular reference

      const result = jsValueToBaseObject(obj);
      expect(result).toBeInstanceOf(HashObject);

      const pairs = (result as HashObject).pairs;
      const selfRef = pairs.get('string:self');
      expect(selfRef).toBeInstanceOf(StringObject);
      expect((selfRef as StringObject).value).toBe('[Circular Reference]');
    });

    it('should handle empty array', () => {
      const result = jsValueToBaseObject([]);
      expect(result).toBeInstanceOf(ArrayObject);
      expect((result as ArrayObject).elements).toHaveLength(0);
    });

    it('should handle empty object', () => {
      const result = jsValueToBaseObject({});
      expect(result).toBeInstanceOf(HashObject);
      expect((result as HashObject).pairs.size).toBe(0);
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve primitives through round-trip', () => {
      const values = ['hello', 42, 3.14, true, false, null];

      for (const value of values) {
        const baseObj = jsValueToBaseObject(value);
        const result = baseObjectToJsValue(baseObj);
        expect(result).toEqual(value);
      }
    });

    it('should preserve arrays through round-trip', () => {
      const arr = [1, 'two', true, null];
      const baseObj = jsValueToBaseObject(arr);
      const result = baseObjectToJsValue(baseObj);
      expect(result).toEqual(arr);
    });

    it('should preserve objects through round-trip', () => {
      const obj = { name: 'test', count: 42, active: true };
      const baseObj = jsValueToBaseObject(obj);
      const result = baseObjectToJsValue(baseObj);
      expect(result).toEqual(obj);
    });

    it('should preserve nested structures through round-trip', () => {
      const obj = {
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' },
        ],
        metadata: {
          total: 2,
          page: 1,
        },
      };
      const baseObj = jsValueToBaseObject(obj);
      const result = baseObjectToJsValue(baseObj);
      expect(result).toEqual(obj);
    });
  });
});
