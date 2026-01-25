import { describe, it, expect, beforeEach } from '@jest/globals';
import { BoundedMap } from '../BoundedMap.js';

describe('BoundedMap', () => {
  let map: BoundedMap<string, unknown>;

  beforeEach(() => {
    map = new BoundedMap({ maxEntries: 5, maxValueSize: 1024 });
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      map.set('key1', 'value1');
      expect(map.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(map.get('missing')).toBeUndefined();
    });

    it('should overwrite existing keys', () => {
      map.set('key1', 'value1');
      map.set('key1', 'value2');
      expect(map.get('key1')).toBe('value2');
      expect(map.size).toBe(1);
    });

    it('should delete keys', () => {
      map.set('key1', 'value1');
      expect(map.delete('key1')).toBe(true);
      expect(map.get('key1')).toBeUndefined();
    });

    it('should check if key exists', () => {
      map.set('key1', 'value1');
      expect(map.has('key1')).toBe(true);
      expect(map.has('key2')).toBe(false);
    });

    it('should clear all entries', () => {
      map.set('key1', 'value1');
      map.set('key2', 'value2');
      map.clear();
      expect(map.size).toBe(0);
    });

    it('should report correct size', () => {
      expect(map.size).toBe(0);
      map.set('key1', 'value1');
      expect(map.size).toBe(1);
      map.set('key2', 'value2');
      expect(map.size).toBe(2);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      // Fill to capacity
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);
      map.set('d', 4);
      map.set('e', 5);
      expect(map.size).toBe(5);

      // Add one more, should evict 'a'
      map.set('f', 6);
      expect(map.size).toBe(5);
      expect(map.has('a')).toBe(false);
      expect(map.has('f')).toBe(true);
    });

    it('should refresh LRU position on get', () => {
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);
      map.set('d', 4);
      map.set('e', 5);

      // Access 'a' to make it recently used
      map.get('a');

      // Add new entries to trigger eviction
      map.set('f', 6);
      map.set('g', 7);

      // 'a' should still exist (was refreshed)
      expect(map.has('a')).toBe(true);
      // 'b' and 'c' should be evicted (were oldest)
      expect(map.has('b')).toBe(false);
      expect(map.has('c')).toBe(false);
    });

    it('should refresh LRU position on set existing key', () => {
      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);
      map.set('d', 4);
      map.set('e', 5);

      // Update 'a' to make it recently used
      map.set('a', 100);

      // Add new entries to trigger eviction
      map.set('f', 6);

      // 'a' should still exist (was refreshed)
      expect(map.has('a')).toBe(true);
      expect(map.get('a')).toBe(100);
      // 'b' should be evicted (was oldest)
      expect(map.has('b')).toBe(false);
    });
  });

  describe('value size limits', () => {
    it('should reject values that exceed maxValueSize', () => {
      const largeMap = new BoundedMap<string, string>({ maxValueSize: 100 });
      const largeValue = 'x'.repeat(100); // ~200 bytes in UTF-16

      largeMap.set('key', largeValue);
      expect(largeMap.has('key')).toBe(false);
    });

    it('should accept values within maxValueSize', () => {
      const largeMap = new BoundedMap<string, string>({ maxValueSize: 1000 });
      const smallValue = 'x'.repeat(100);

      largeMap.set('key', smallValue);
      expect(largeMap.get('key')).toBe(smallValue);
    });
  });

  describe('iteration', () => {
    it('should iterate over entries', () => {
      map.set('a', 1);
      map.set('b', 2);

      const entries = Array.from(map.entries());
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
    });

    it('should iterate over keys', () => {
      map.set('a', 1);
      map.set('b', 2);

      const keys = Array.from(map.keys());
      expect(keys).toHaveLength(2);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
    });

    it('should iterate over values', () => {
      map.set('a', 1);
      map.set('b', 2);

      const values = Array.from(map.values());
      expect(values).toHaveLength(2);
      expect(values).toContain(1);
      expect(values).toContain(2);
    });

    it('should support forEach', () => {
      map.set('a', 1);
      map.set('b', 2);

      const collected: Array<[string, unknown]> = [];
      map.forEach((value, key) => {
        collected.push([key, value]);
      });

      expect(collected).toHaveLength(2);
    });

    it('should support for...of iteration', () => {
      map.set('a', 1);
      map.set('b', 2);

      const collected: Array<[string, unknown]> = [];
      for (const entry of map) {
        collected.push(entry);
      }

      expect(collected).toHaveLength(2);
    });
  });

  describe('default options', () => {
    it('should use default maxEntries of 1000', () => {
      const defaultMap = new BoundedMap<number, number>();

      // Add 1000 entries
      for (let i = 0; i < 1000; i++) {
        defaultMap.set(i, i);
      }
      expect(defaultMap.size).toBe(1000);

      // Add one more, should evict oldest
      defaultMap.set(1000, 1000);
      expect(defaultMap.size).toBe(1000);
      expect(defaultMap.has(0)).toBe(false);
    });
  });

  describe('different value types', () => {
    it('should handle null and undefined', () => {
      map.set('null', null);
      map.set('undefined', undefined);
      expect(map.get('null')).toBeNull();
      expect(map.get('undefined')).toBeUndefined();
    });

    it('should handle numbers', () => {
      map.set('int', 42);
      map.set('float', 3.14);
      expect(map.get('int')).toBe(42);
      expect(map.get('float')).toBe(3.14);
    });

    it('should handle booleans', () => {
      map.set('true', true);
      map.set('false', false);
      expect(map.get('true')).toBe(true);
      expect(map.get('false')).toBe(false);
    });

    it('should handle objects', () => {
      const obj = { key: 'value', nested: { a: 1 } };
      map.set('obj', obj);
      expect(map.get('obj')).toEqual(obj);
    });

    it('should handle arrays', () => {
      const arr = [1, 2, 3];
      map.set('arr', arr);
      expect(map.get('arr')).toEqual(arr);
    });
  });
});
