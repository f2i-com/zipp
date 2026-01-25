/**
 * Tests for Core Database Module Runtime
 *
 * Tests database operations: insert, query, update, delete.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { createMockRuntimeContext } from '../../src/__tests__/helpers/mockRuntimeContext.js';
import CoreDatabaseRuntime from '../core-database/runtime.js';

describe('CoreDatabaseRuntime', () => {
  beforeEach(async () => {
    await CoreDatabaseRuntime.cleanup?.();
  });

  describe('init', () => {
    it('should initialize with context', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      expect(logs.some((l) => l.message.includes('Module initialized'))).toBe(true);
    });
  });

  describe('execute - insert', () => {
    it('should insert document and return result', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        { name: 'John', age: 30 },
        '',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.insertedId).toBeDefined();
      expect(result.rowsAffected).toBe(1);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'completed' });
      expect(logs.some((l) => l.message.includes('insert completed'))).toBe(true);
    });

    it('should wrap primitive data in object', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'values',
        'simple string',
        '',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.data).toBe('simple string');
    });

    it('should fail insert without data', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Insert requires data');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });
  });

  describe('execute - query', () => {
    it('should query documents without filter', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      // Insert some data first
      await CoreDatabaseRuntime.methods.execute('insert', 'users', { name: 'John' }, '', 'n1');
      await CoreDatabaseRuntime.methods.execute('insert', 'users', { name: 'Jane' }, '', 'n2');

      const result = await CoreDatabaseRuntime.methods.execute(
        'query',
        'users',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
      expect((result.data as unknown[]).length).toBe(2);
    });

    it('should query documents with filter', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      await CoreDatabaseRuntime.methods.execute('insert', 'users', { name: 'John', role: 'admin' }, '', 'n1');
      await CoreDatabaseRuntime.methods.execute('insert', 'users', { name: 'Jane', role: 'user' }, '', 'n2');

      const result = await CoreDatabaseRuntime.methods.execute(
        'query',
        'users',
        null,
        JSON.stringify({ role: 'admin' }),
        'node-1'
      );

      expect(result.success).toBe(true);
      expect((result.data as unknown[]).length).toBe(1);
      expect((result.data as Array<{ name: string }>)[0].name).toBe('John');
    });

    it('should handle select as alias for query', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      await CoreDatabaseRuntime.methods.execute('insert', 'items', { value: 1 }, '', 'n1');

      const result = await CoreDatabaseRuntime.methods.execute(
        'select',
        'items',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should return empty array for non-existent collection', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'query',
        'nonexistent',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('should include document id and created timestamp', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      await CoreDatabaseRuntime.methods.execute('insert', 'test', { value: 42 }, '', 'n1');

      const result = await CoreDatabaseRuntime.methods.execute(
        'query',
        'test',
        null,
        '',
        'node-1'
      );

      const docs = result.data as Array<{ id: string; _created: string; value: number }>;
      expect(docs[0].id).toBeDefined();
      expect(docs[0]._created).toBeDefined();
      expect(docs[0].value).toBe(42);
    });

    it('should ignore invalid query JSON', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      await CoreDatabaseRuntime.methods.execute('insert', 'test', { value: 1 }, '', 'n1');

      const result = await CoreDatabaseRuntime.methods.execute(
        'query',
        'test',
        null,
        'invalid json {',
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(logs.some((l) => l.message.includes('Invalid query JSON'))).toBe(true);
    });
  });

  describe('execute - update', () => {
    it('should update document by id', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const insertResult = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        { name: 'John', age: 30 },
        '',
        'n1'
      );
      const docId = insertResult.insertedId!;

      const result = await CoreDatabaseRuntime.methods.execute(
        'update',
        'users',
        { age: 31 },
        JSON.stringify({ id: docId }),
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);
    });

    it('should fail update without query.id', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'update',
        'users',
        { name: 'John' },
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update requires data and query.id');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should fail update without data', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'update',
        'users',
        null,
        JSON.stringify({ id: 'doc-1' }),
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Update requires data and query.id');
    });

    it('should return 0 rowsAffected for non-existent document', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'update',
        'users',
        { name: 'Updated' },
        JSON.stringify({ id: 'nonexistent' }),
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);
    });
  });

  describe('execute - delete', () => {
    it('should delete document by id', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const insertResult = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        { name: 'John' },
        '',
        'n1'
      );
      const docId = insertResult.insertedId!;

      const result = await CoreDatabaseRuntime.methods.execute(
        'delete',
        'users',
        null,
        JSON.stringify({ id: docId }),
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(1);

      // Verify deletion
      const queryResult = await CoreDatabaseRuntime.methods.execute(
        'query',
        'users',
        null,
        '',
        'n2'
      );
      expect((queryResult.data as unknown[]).length).toBe(0);
    });

    it('should fail delete without query.id', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'delete',
        'users',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Delete requires query.id');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should return 0 rowsAffected for non-existent document', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'delete',
        'users',
        null,
        JSON.stringify({ id: 'nonexistent' }),
        'node-1'
      );

      expect(result.success).toBe(true);
      expect(result.rowsAffected).toBe(0);
    });
  });

  describe('execute - error handling', () => {
    it('should return error when database not available', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.database = undefined;
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        { name: 'John' },
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database not available');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('Database not available'))).toBe(true);
    });

    it('should return error for unknown operation', async () => {
      const { context, nodeStatuses } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'unknown',
        'users',
        null,
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown operation: unknown');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
    });

    it('should handle database exceptions', async () => {
      const { context, logs, nodeStatuses } = createMockRuntimeContext();
      context.database = {
        insertDocument: async () => {
          throw new Error('Database connection failed');
        },
        findDocuments: async () => [],
        updateDocument: async () => false,
        deleteDocument: async () => false,
      };
      await CoreDatabaseRuntime.init?.(context);

      const result = await CoreDatabaseRuntime.methods.execute(
        'insert',
        'users',
        { name: 'John' },
        '',
        'node-1'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database connection failed');
      expect(nodeStatuses).toContainEqual({ nodeId: 'node-1', status: 'error' });
      expect(logs.some((l) => l.message.includes('failed'))).toBe(true);
    });
  });

  describe('collection isolation', () => {
    it('should isolate data between collections', async () => {
      const { context } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);

      await CoreDatabaseRuntime.methods.execute('insert', 'collection1', { value: 1 }, '', 'n1');
      await CoreDatabaseRuntime.methods.execute('insert', 'collection2', { value: 2 }, '', 'n2');

      const result1 = await CoreDatabaseRuntime.methods.execute(
        'query',
        'collection1',
        null,
        '',
        'n3'
      );
      const result2 = await CoreDatabaseRuntime.methods.execute(
        'query',
        'collection2',
        null,
        '',
        'n4'
      );

      expect((result1.data as unknown[]).length).toBe(1);
      expect((result2.data as unknown[]).length).toBe(1);
      expect((result1.data as Array<{ value: number }>)[0].value).toBe(1);
      expect((result2.data as Array<{ value: number }>)[0].value).toBe(2);
    });
  });

  describe('cleanup', () => {
    it('should log cleanup message', async () => {
      const { context, logs } = createMockRuntimeContext();
      await CoreDatabaseRuntime.init?.(context);
      await CoreDatabaseRuntime.cleanup?.();

      expect(logs.some((l) => l.message.includes('Module cleanup'))).toBe(true);
    });
  });
});
