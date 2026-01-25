/**
 * Tests for Node Extension Registry
 *
 * Tests registration, loading, and application of node extensions.
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  NodeExtensionRegistry,
  createNodeExtensionRegistry,
  getNodeExtensionRegistry,
  resetNodeExtensionRegistry,
} from '../node-extension-registry.js';
import type { NodeExtension } from '../node-extension-types.js';
import type { GraphNode } from '../types.js';

// Helper to create a minimal node
function createNode(overrides: Partial<GraphNode> = {}): GraphNode {
  return {
    id: 'test-node',
    type: 'ai_llm',
    position: { x: 0, y: 0 },
    data: {},
    ...overrides,
  };
}

// Helper to create a minimal extension
function createExtension(overrides: Partial<NodeExtension> = {}): NodeExtension {
  return {
    id: 'test-extension',
    name: 'Test Extension',
    extends: 'ai_llm',
    packageId: 'test-package',
    ...overrides,
  };
}

describe('NodeExtensionRegistry', () => {
  let registry: NodeExtensionRegistry;

  beforeEach(() => {
    registry = new NodeExtensionRegistry();
  });

  describe('registerExtension', () => {
    it('should register an extension', () => {
      const ext = createExtension();
      registry.registerExtension(ext);

      const extensions = registry.getExtensionsFor('ai_llm');
      expect(extensions.length).toBe(1);
      expect(extensions[0].id).toBe('test-extension');
    });

    it('should register multiple extensions for the same node type', () => {
      registry.registerExtension(createExtension({ id: 'ext-1' }));
      registry.registerExtension(createExtension({ id: 'ext-2' }));

      const extensions = registry.getExtensionsFor('ai_llm');
      expect(extensions.length).toBe(2);
    });

    it('should sort extensions by priority (higher first)', () => {
      registry.registerExtension(createExtension({ id: 'low', priority: 1 }));
      registry.registerExtension(createExtension({ id: 'high', priority: 10 }));
      registry.registerExtension(createExtension({ id: 'medium', priority: 5 }));

      const extensions = registry.getExtensionsFor('ai_llm');
      expect(extensions[0].id).toBe('high');
      expect(extensions[1].id).toBe('medium');
      expect(extensions[2].id).toBe('low');
    });
  });

  describe('unregisterPackage', () => {
    it('should remove all extensions from a package', () => {
      registry.registerExtension(createExtension({ id: 'ext-1', packageId: 'pkg-a' }));
      registry.registerExtension(createExtension({ id: 'ext-2', packageId: 'pkg-a' }));
      registry.registerExtension(createExtension({ id: 'ext-3', packageId: 'pkg-b' }));

      registry.unregisterPackage('pkg-a');

      const extensions = registry.getExtensionsFor('ai_llm');
      expect(extensions.length).toBe(1);
      expect(extensions[0].id).toBe('ext-3');
    });

    it('should handle unregistering non-existent package', () => {
      registry.registerExtension(createExtension());
      registry.unregisterPackage('non-existent');

      expect(registry.getExtensionsFor('ai_llm').length).toBe(1);
    });
  });

  describe('getExtensionsFor', () => {
    it('should return empty array for unknown node type', () => {
      const extensions = registry.getExtensionsFor('unknown_type');
      expect(extensions).toEqual([]);
    });
  });

  describe('getMatchingExtensions', () => {
    it('should return extensions matching node type', () => {
      registry.registerExtension(createExtension({ extends: 'ai_llm' }));
      registry.registerExtension(createExtension({ id: 'other', extends: 'template' }));

      const node = createNode({ type: 'ai_llm' });
      const matching = registry.getMatchingExtensions(node);

      expect(matching.length).toBe(1);
      expect(matching[0].id).toBe('test-extension');
    });

    it('should filter by condition - equals', () => {
      registry.registerExtension(createExtension({
        id: 'with-condition',
        condition: { property: 'model', value: 'gpt-4', operator: 'equals' },
      }));

      const matchingNode = createNode({ data: { model: 'gpt-4' } });
      const nonMatchingNode = createNode({ data: { model: 'gpt-3' } });

      expect(registry.getMatchingExtensions(matchingNode).length).toBe(1);
      expect(registry.getMatchingExtensions(nonMatchingNode).length).toBe(0);
    });

    it('should filter by condition - equals with array', () => {
      registry.registerExtension(createExtension({
        id: 'with-array-condition',
        condition: { property: 'model', value: ['gpt-4', 'gpt-4o'], operator: 'equals' },
      }));

      const matchingNode1 = createNode({ data: { model: 'gpt-4' } });
      const matchingNode2 = createNode({ data: { model: 'gpt-4o' } });
      const nonMatchingNode = createNode({ data: { model: 'gpt-3' } });

      expect(registry.getMatchingExtensions(matchingNode1).length).toBe(1);
      expect(registry.getMatchingExtensions(matchingNode2).length).toBe(1);
      expect(registry.getMatchingExtensions(nonMatchingNode).length).toBe(0);
    });

    it('should filter by condition - notEquals', () => {
      registry.registerExtension(createExtension({
        id: 'not-equals',
        condition: { property: 'mode', value: 'disabled', operator: 'notEquals' },
      }));

      const matchingNode = createNode({ data: { mode: 'enabled' } });
      const nonMatchingNode = createNode({ data: { mode: 'disabled' } });

      expect(registry.getMatchingExtensions(matchingNode).length).toBe(1);
      expect(registry.getMatchingExtensions(nonMatchingNode).length).toBe(0);
    });

    it('should filter by condition - contains', () => {
      registry.registerExtension(createExtension({
        id: 'contains',
        condition: { property: 'prompt', value: 'special', operator: 'contains' },
      }));

      const matchingNode = createNode({ data: { prompt: 'This is a special prompt' } });
      const nonMatchingNode = createNode({ data: { prompt: 'Regular prompt' } });

      expect(registry.getMatchingExtensions(matchingNode).length).toBe(1);
      expect(registry.getMatchingExtensions(nonMatchingNode).length).toBe(0);
    });

    it('should filter by condition - exists', () => {
      registry.registerExtension(createExtension({
        id: 'exists',
        condition: { property: 'apiKey', value: true, operator: 'exists' },
      }));

      const matchingNode = createNode({ data: { apiKey: 'sk-123' } });
      const nonMatchingNode = createNode({ data: {} });

      expect(registry.getMatchingExtensions(matchingNode).length).toBe(1);
      expect(registry.getMatchingExtensions(nonMatchingNode).length).toBe(0);
    });

    it('should include extensions with enabledByDefault true when no condition', () => {
      registry.registerExtension(createExtension({ enabledByDefault: true }));

      const node = createNode();
      expect(registry.getMatchingExtensions(node).length).toBe(1);
    });

    it('should exclude extensions with enabledByDefault false when no condition', () => {
      registry.registerExtension(createExtension({ enabledByDefault: false }));

      const node = createNode();
      expect(registry.getMatchingExtensions(node).length).toBe(0);
    });
  });

  describe('loadExtension', () => {
    it('should mark extension as loaded', async () => {
      const ext = createExtension();
      registry.registerExtension(ext);

      const loadedExt = registry.getExtensionsFor('ai_llm')[0];
      expect(loadedExt.loaded).toBe(false);

      await registry.loadExtension(loadedExt);
      expect(loadedExt.loaded).toBe(true);
    });

    it('should not reload already loaded extension', async () => {
      const ext = createExtension();
      registry.registerExtension(ext);

      const loadedExt = registry.getExtensionsFor('ai_llm')[0];
      await registry.loadExtension(loadedExt);
      const result = await registry.loadExtension(loadedExt);

      expect(result).toBe(true);
    });

    it('should load compiler hook from compiled code', async () => {
      const compilerCode = `
        module.exports = {
          preCompile: function(node) { return node; },
        };
      `;
      const ext = createExtension({
        compilerHook: { source: '', compiled: compilerCode },
      });
      registry.registerExtension(ext);

      const loadedExt = registry.getExtensionsFor('ai_llm')[0];
      await registry.loadExtension(loadedExt);

      expect(loadedExt.loadedCompilerHook).toBeDefined();
      expect(typeof loadedExt.loadedCompilerHook?.preCompile).toBe('function');
    });

    it('should load runtime hook from compiled code', async () => {
      const runtimeCode = `
        module.exports = {
          preExecute: async function(inputs) { return inputs; },
        };
      `;
      const ext = createExtension({
        runtimeHook: { source: '', compiled: runtimeCode },
      });
      registry.registerExtension(ext);

      const loadedExt = registry.getExtensionsFor('ai_llm')[0];
      await registry.loadExtension(loadedExt);

      expect(loadedExt.loadedRuntimeHook).toBeDefined();
      expect(typeof loadedExt.loadedRuntimeHook?.preExecute).toBe('function');
    });

    it('should handle hook loading errors', async () => {
      const invalidCode = 'this is not valid JavaScript{{{';
      const ext = createExtension({
        compilerHook: { source: '', compiled: invalidCode },
      });
      registry.registerExtension(ext);

      const loadedExt = registry.getExtensionsFor('ai_llm')[0];
      const result = await registry.loadExtension(loadedExt);

      expect(result).toBe(false);
      expect(loadedExt.loadError).toBeDefined();
    });
  });

  describe('getExtendedNodeDefinition', () => {
    it('should return base definition when no matching extensions', () => {
      const baseDef = {
        id: 'ai_llm',
        name: 'AI LLM',
        inputs: [{ id: 'input', name: 'Input', type: 'any' as const }],
        outputs: [{ id: 'output', name: 'Output', type: 'string' as const }],
        compiler: { template: '' },
      };

      const node = createNode();
      const extended = registry.getExtendedNodeDefinition(baseDef, node);

      expect(extended).toEqual(baseDef);
    });

    it('should add additional inputs from extension', () => {
      registry.registerExtension(createExtension({
        additionalInputs: [
          { id: 'extra', name: 'Extra Input', type: 'string' },
        ],
      }));

      const baseDef = {
        id: 'ai_llm',
        name: 'AI LLM',
        inputs: [{ id: 'input', name: 'Input', type: 'any' as const }],
        outputs: [],
        compiler: { template: '' },
      };

      const node = createNode();
      const extended = registry.getExtendedNodeDefinition(baseDef, node);

      expect(extended.inputs!.length).toBe(2);
      expect(extended.inputs![1].id).toBe('extra');
    });

    it('should add additional outputs from extension', () => {
      registry.registerExtension(createExtension({
        additionalOutputs: [
          { id: 'metadata', name: 'Metadata', type: 'object' },
        ],
      }));

      const baseDef = {
        id: 'ai_llm',
        name: 'AI LLM',
        inputs: [],
        outputs: [{ id: 'output', name: 'Output', type: 'string' as const }],
        compiler: { template: '' },
      };

      const node = createNode();
      const extended = registry.getExtendedNodeDefinition(baseDef, node);

      expect(extended.outputs!.length).toBe(2);
      expect(extended.outputs![1].id).toBe('metadata');
    });

    it('should add additional properties from extension', () => {
      registry.registerExtension(createExtension({
        additionalProperties: [
          { id: 'customProp', name: 'Custom Property', type: 'string', defaultValue: 'default' },
        ],
      }));

      const baseDef = {
        id: 'ai_llm',
        name: 'AI LLM',
        inputs: [],
        outputs: [],
        properties: [{ id: 'model', name: 'Model', type: 'string' as const }],
        compiler: { template: '' },
      };

      const node = createNode();
      const extended = registry.getExtendedNodeDefinition(baseDef, node);

      expect(extended.properties!.length).toBe(2);
      expect(extended.properties![1].id).toBe('customProp');
    });
  });

  describe('hasExtensions', () => {
    it('should return true when node type has extensions', () => {
      registry.registerExtension(createExtension({ extends: 'ai_llm' }));
      expect(registry.hasExtensions('ai_llm')).toBe(true);
    });

    it('should return false when node type has no extensions', () => {
      expect(registry.hasExtensions('template')).toBe(false);
    });
  });

  describe('getAllExtensions', () => {
    it('should return all registered extensions', () => {
      registry.registerExtension(createExtension({ id: 'ext-1', extends: 'ai_llm' }));
      registry.registerExtension(createExtension({ id: 'ext-2', extends: 'template' }));

      const all = registry.getAllExtensions();
      expect(all.length).toBe(2);
    });

    it('should return empty array when no extensions', () => {
      expect(registry.getAllExtensions()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should remove all extensions', () => {
      registry.registerExtension(createExtension({ id: 'ext-1' }));
      registry.registerExtension(createExtension({ id: 'ext-2', extends: 'template' }));

      registry.clear();

      expect(registry.getAllExtensions()).toEqual([]);
      expect(registry.hasExtensions('ai_llm')).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      registry.registerExtension(createExtension({ id: 'ext-1' }));
      registry.registerExtension(createExtension({
        id: 'ext-2',
        compilerHook: { source: '', compiled: 'invalid{{{' },
      }));

      // Load the second one to trigger error
      const ext2 = registry.getExtensionsFor('ai_llm').find(e => e.id === 'ext-2');
      if (ext2) await registry.loadExtension(ext2);

      const stats = registry.getStats();

      expect(stats.totalExtensions).toBe(2);
      expect(stats.failedExtensions).toBe(1);
      expect(stats.extendedNodeTypes).toBe(1);
    });
  });
});

describe('Global Registry Functions', () => {
  beforeEach(() => {
    resetNodeExtensionRegistry();
  });

  describe('getNodeExtensionRegistry', () => {
    it('should return the same instance on multiple calls', () => {
      const registry1 = getNodeExtensionRegistry();
      const registry2 = getNodeExtensionRegistry();

      expect(registry1).toBe(registry2);
    });
  });

  describe('resetNodeExtensionRegistry', () => {
    it('should clear and reset the global registry', () => {
      const registry = getNodeExtensionRegistry();
      registry.registerExtension({
        id: 'test',
        name: 'Test',
        extends: 'ai_llm',
        packageId: 'pkg',
      });

      resetNodeExtensionRegistry();

      const newRegistry = getNodeExtensionRegistry();
      expect(newRegistry.getAllExtensions()).toEqual([]);
    });
  });

  describe('createNodeExtensionRegistry', () => {
    it('should create a new registry with options', () => {
      const registry = createNodeExtensionRegistry({ allowUnsafeCode: true });
      expect(registry).toBeInstanceOf(NodeExtensionRegistry);
    });
  });
});
