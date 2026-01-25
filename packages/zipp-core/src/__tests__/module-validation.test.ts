/**
 * Module Validation Tests
 *
 * Tests for module manifest and node definition validation.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { ModuleLoader } from '../module-loader.js';
import type { ModuleManifest, NodeDefinition } from '../module-types.js';

describe('Module Validation', () => {
  let loader: ModuleLoader;

  beforeEach(() => {
    loader = new ModuleLoader();
  });

  describe('validateManifest', () => {
    const validManifest: ModuleManifest = {
      id: 'test-module',
      name: 'Test Module',
      version: '1.0.0',
      description: 'A test module',
      category: 'Utility',
      nodes: ['test_node'],
    };

    it('should validate a correct manifest', () => {
      const result = loader.validateManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing module ID', () => {
      const manifest = { ...validManifest, id: undefined as unknown as string };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'id')).toBe(true);
    });

    it('should reject invalid module ID format', () => {
      const manifest = { ...validManifest, id: 'Invalid-ID' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'id')).toBe(true);
    });

    it('should reject module ID starting with number', () => {
      const manifest = { ...validManifest, id: '123-module' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('should accept module ID with hyphens', () => {
      const manifest = { ...validManifest, id: 'my-test-module' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('should reject missing module name', () => {
      const manifest = { ...validManifest, name: undefined as unknown as string };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'name')).toBe(true);
    });

    it('should reject missing version', () => {
      const manifest = { ...validManifest, version: undefined as unknown as string };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'version')).toBe(true);
    });

    it('should reject invalid version format', () => {
      const manifest = { ...validManifest, version: 'v1' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'version')).toBe(true);
    });

    it('should accept valid semantic version', () => {
      const manifest = { ...validManifest, version: '2.1.0' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('should accept semantic version with prerelease', () => {
      const manifest = { ...validManifest, version: '1.0.0-beta.1' };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(true);
    });

    it('should reject empty nodes array', () => {
      const manifest = { ...validManifest, nodes: [] };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'nodes')).toBe(true);
    });

    it('should reject missing nodes array', () => {
      const manifest = { ...validManifest, nodes: undefined as unknown as string[] };
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
    });

    it('should collect multiple errors', () => {
      const manifest = {
        id: '',
        name: '',
        version: 'invalid',
        nodes: [],
      } as ModuleManifest;
      const result = loader.validateManifest(manifest);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validateNodeDefinition', () => {
    const validNode: NodeDefinition = {
      id: 'test_node',
      name: 'Test Node',
      description: 'A test node',
      inputs: [{ id: 'input', name: 'Input', type: 'any' }],
      outputs: [{ id: 'output', name: 'Output', type: 'any' }],
      compiler: { template: '{{outputVar}} = "test";' },
    };

    it('should validate a correct node definition', () => {
      const result = loader.validateNodeDefinition(validNode);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing node ID', () => {
      const node = { ...validNode, id: undefined as unknown as string };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'id')).toBe(true);
    });

    it('should reject invalid node ID format', () => {
      const node = { ...validNode, id: 'Invalid-Node' };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
    });

    it('should accept node ID with underscores', () => {
      const node = { ...validNode, id: 'my_test_node' };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(true);
    });

    it('should accept package-prefixed node ID', () => {
      const node = { ...validNode, id: 'pkg:my-package:custom_node' };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(true);
    });

    it('should reject missing node name', () => {
      const node = { ...validNode, name: undefined as unknown as string };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'name')).toBe(true);
    });

    it('should reject non-array inputs', () => {
      const node = { ...validNode, inputs: 'not an array' as unknown as NodeDefinition['inputs'] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'inputs')).toBe(true);
    });

    it('should reject non-array outputs', () => {
      const node = { ...validNode, outputs: undefined as unknown as NodeDefinition['outputs'] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'outputs')).toBe(true);
    });

    it('should reject missing compiler', () => {
      const node = { ...validNode, compiler: undefined as unknown as NodeDefinition['compiler'] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'compiler')).toBe(true);
    });

    it('should reject compiler without template or customHandler', () => {
      const node = { ...validNode, compiler: {} as NodeDefinition['compiler'] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.path === 'compiler.template')).toBe(true);
    });

    it('should accept compiler with customHandler', () => {
      const node = { ...validNode, compiler: { customHandler: true } };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(true);
    });

    it('should accept node with empty inputs array', () => {
      const node = { ...validNode, inputs: [] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(true);
    });

    it('should accept node with empty outputs array', () => {
      const node = { ...validNode, outputs: [] };
      const result = loader.validateNodeDefinition(node);
      expect(result.valid).toBe(true);
    });
  });

  describe('loadModule validation integration', () => {
    it('should reject module with invalid manifest', async () => {
      const invalidManifest: ModuleManifest = {
        id: '',
        name: 'Test',
        version: '1.0.0',
        nodes: ['test'],
      };

      const result = await loader.loadModule(
        invalidManifest,
        [],
        undefined,
        '/fake/path'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.error).toContain('Invalid module manifest');
    });

    it('should reject module with invalid node definition', async () => {
      const validManifest: ModuleManifest = {
        id: 'test-module',
        name: 'Test',
        version: '1.0.0',
        nodes: ['test_node'],
      };

      const invalidNode: NodeDefinition = {
        id: '',
        name: 'Test Node',
        inputs: [],
        outputs: [],
        compiler: { template: 'test' },
      };

      const result = await loader.loadModule(
        validManifest,
        [invalidNode],
        undefined,
        '/fake/path'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.error).toContain('Invalid node definition');
    });

    it('should successfully load valid module', async () => {
      const validManifest: ModuleManifest = {
        id: 'test-module',
        name: 'Test Module',
        version: '1.0.0',
        nodes: ['test_node'],
      };

      const validNode: NodeDefinition = {
        id: 'test_node',
        name: 'Test Node',
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', type: 'any' }],
        compiler: { template: '{{outputVar}} = "test";' },
      };

      const result = await loader.loadModule(
        validManifest,
        [validNode],
        undefined,
        '/fake/path'
      );

      expect(result.success).toBe(true);
      expect(result.module).toBeDefined();
      expect(result.module?.manifest.id).toBe('test-module');
    });
  });
});
