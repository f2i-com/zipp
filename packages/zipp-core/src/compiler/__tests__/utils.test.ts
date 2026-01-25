import { describe, it, expect } from '@jest/globals';
import {
  sanitizeId,
  escapeString,
  escapeValue,
  escapeObject,
  topologicalSort,
} from '../utils.js';
import type { WorkflowGraph } from '../../types.js';

describe('Compiler Utils', () => {
  describe('sanitizeId', () => {
    it('should keep alphanumeric characters and underscores', () => {
      expect(sanitizeId('node_1')).toBe('node_1');
      expect(sanitizeId('abc123')).toBe('abc123');
    });

    it('should replace special characters with underscores', () => {
      expect(sanitizeId('node-1')).toBe('node_1');
      expect(sanitizeId('my.node')).toBe('my_node');
      expect(sanitizeId('test@123')).toBe('test_123');
    });

    it('should handle UUIDs', () => {
      expect(sanitizeId('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4_e5f6_7890_abcd_ef1234567890');
    });
  });

  describe('escapeString', () => {
    it('should escape quotes', () => {
      expect(escapeString('hello "world"')).toBe('hello \\"world\\"');
    });

    it('should escape newlines', () => {
      expect(escapeString('line1\nline2')).toBe('line1\\nline2');
    });

    it('should escape backslashes', () => {
      expect(escapeString('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    it('should escape tabs', () => {
      expect(escapeString('col1\tcol2')).toBe('col1\\tcol2');
    });

    it('should handle empty strings', () => {
      expect(escapeString('')).toBe('');
    });
  });

  describe('escapeValue', () => {
    it('should handle null and undefined', () => {
      expect(escapeValue(null)).toBe('null');
      expect(escapeValue(undefined)).toBe('null');
    });

    it('should handle strings', () => {
      expect(escapeValue('hello')).toBe('"hello"');
      expect(escapeValue('with "quotes"')).toBe('"with \\"quotes\\""');
    });

    it('should handle numbers', () => {
      expect(escapeValue(42)).toBe('42');
      expect(escapeValue(3.14)).toBe('3.14');
      expect(escapeValue(-10)).toBe('-10');
    });

    it('should handle booleans', () => {
      expect(escapeValue(true)).toBe('true');
      expect(escapeValue(false)).toBe('false');
    });

    it('should handle arrays', () => {
      expect(escapeValue([1, 2, 3])).toBe('[1, 2, 3]');
      expect(escapeValue(['a', 'b'])).toBe('["a", "b"]');
      expect(escapeValue([])).toBe('[]');
    });

    it('should handle nested arrays', () => {
      expect(escapeValue([[1, 2], [3, 4]])).toBe('[[1, 2], [3, 4]]');
    });

    it('should handle objects', () => {
      expect(escapeValue({ key: 'value' })).toBe('({key: "value"})');
    });
  });

  describe('escapeObject', () => {
    it('should handle empty objects', () => {
      expect(escapeObject({})).toBe('({})');
    });

    it('should handle simple objects', () => {
      expect(escapeObject({ name: 'test' })).toBe('({name: "test"})');
    });

    it('should quote keys with special characters', () => {
      expect(escapeObject({ 'my-key': 'value' })).toBe('({"my-key": "value"})');
    });

    it('should handle multiple keys', () => {
      const result = escapeObject({ a: 1, b: 2 });
      expect(result).toContain('a: 1');
      expect(result).toContain('b: 2');
    });

    it('should handle nested objects', () => {
      expect(escapeObject({ outer: { inner: 'value' } })).toBe('({outer: ({inner: "value"})})');
    });
  });

  describe('topologicalSort', () => {
    it('should sort nodes in dependency order', () => {
      const graph: WorkflowGraph = {
        nodes: [
          { id: 'c', type: 'output', data: {}, position: { x: 0, y: 0 } },
          { id: 'a', type: 'input_text', data: {}, position: { x: 0, y: 0 } },
          { id: 'b', type: 'ai_llm', data: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
      };

      const sorted = topologicalSort(graph);
      const ids = sorted.map(n => n.id);

      // a should come before b, b should come before c
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
    });

    it('should handle disconnected nodes', () => {
      const graph: WorkflowGraph = {
        nodes: [
          { id: 'a', type: 'input_text', data: {}, position: { x: 0, y: 0 } },
          { id: 'b', type: 'input_text', data: {}, position: { x: 0, y: 0 } },
        ],
        edges: [],
      };

      const sorted = topologicalSort(graph);
      expect(sorted).toHaveLength(2);
    });

    it('should handle empty graph', () => {
      const graph: WorkflowGraph = { nodes: [], edges: [] };
      const sorted = topologicalSort(graph);
      expect(sorted).toHaveLength(0);
    });

    it('should handle diamond dependency pattern', () => {
      const graph: WorkflowGraph = {
        nodes: [
          { id: 'a', type: 'input_text', data: {}, position: { x: 0, y: 0 } },
          { id: 'b', type: 'ai_llm', data: {}, position: { x: 0, y: 0 } },
          { id: 'c', type: 'template', data: {}, position: { x: 0, y: 0 } },
          { id: 'd', type: 'output', data: {}, position: { x: 0, y: 0 } },
        ],
        edges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'a', target: 'c' },
          { id: 'e3', source: 'b', target: 'd' },
          { id: 'e4', source: 'c', target: 'd' },
        ],
      };

      const sorted = topologicalSort(graph);
      const ids = sorted.map(n => n.id);

      // a should come first, d should come last
      expect(ids[0]).toBe('a');
      expect(ids[ids.length - 1]).toBe('d');
      // b and c should both come before d
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'));
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'));
    });
  });
});
