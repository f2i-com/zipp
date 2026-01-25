/**
 * Tests for Template Compiler
 *
 * Tests the template-based module compilation system.
 */

import { describe, it, expect } from '@jest/globals';
import { createTemplateCompiler, createSingleNodeTemplateCompiler } from '../template-compiler.js';
import type { NodeDefinition, ModuleCompilerContext } from '../module-types.js';

// Helper to create a minimal node definition with required fields
function createNodeDef(overrides: Partial<NodeDefinition> & { id: string; name: string }): NodeDefinition {
  return {
    inputs: [],
    outputs: [],
    compiler: { template: '' },
    ...overrides,
  };
}

// Helper to create a minimal compiler context
function createMockContext(overrides: Partial<ModuleCompilerContext> = {}): ModuleCompilerContext {
  const defaultDef = createNodeDef({ id: 'test_type', name: 'Test Type' });
  return {
    node: {
      id: 'test-node',
      type: 'test_type',
      data: {},
      position: { x: 0, y: 0 },
    },
    outputVar: 'node_test_node_out',
    sanitizedId: 'test_node',
    inputs: new Map(),
    escapeString: (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'),
    sanitizeId: (id: string) => id.replace(/[^a-zA-Z0-9_]/g, '_'),
    skipVarDeclaration: false,
    isInLoop: false,
    definition: defaultDef,
    ...overrides,
  };
}

describe('createTemplateCompiler', () => {
  describe('basic functionality', () => {
    it('should return a compiler with name and methods', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = "test";' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);

      expect(compiler.name).toBe('TestModule');
      expect(typeof compiler.getNodeTypes).toBe('function');
      expect(typeof compiler.compileNode).toBe('function');
    });

    it('should return node types from definitions', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('node_a', createNodeDef({ id: 'node_a', name: 'Node A', compiler: { template: '' } }));
      definitions.set('node_b', createNodeDef({ id: 'node_b', name: 'Node B', compiler: { template: '' } }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const types = compiler.getNodeTypes!();

      expect(types).toContain('node_a');
      expect(types).toContain('node_b');
      expect(types.length).toBe(2);
    });
  });

  describe('template placeholder replacement', () => {
    it('should replace {{outputVar}} placeholder', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = "value";' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({ outputVar: 'node_abc_out' });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('node_abc_out = "value"');
    });

    it('should replace {{sanitizedId}} placeholder', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: 'let var_{{sanitizedId}} = 1;' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({ sanitizedId: 'my_node_123' });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('var_my_node_123');
    });

    it('should replace {{nodeId}} placeholder', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: 'process("{{nodeId}}");' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: { id: 'original-node-id', type: 'test_node', data: {}, position: { x: 0, y: 0 } },
      });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('process("original-node-id")');
    });

    it('should replace {{inputs.X}} with connected input variable', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = transform({{inputs.data}});' },
      }));

      const inputs = new Map<string, string>();
      inputs.set('data', 'node_prev_out');

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({ inputs });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('transform(node_prev_out)');
    });

    it('should replace {{inputs.X}} with null when not connected', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = transform({{inputs.missing}});' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({ inputs: new Map() });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('transform(null)');
    });

    it('should replace {{props.X}} with node data value', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = process({{props.mode}});' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: {
          id: 'test-node',
          type: 'test_node',
          data: { mode: 'fast' },
          position: { x: 0, y: 0 },
        },
      });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('process("fast")');
    });

    it('should replace {{props.X}} with default value when not in data', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        properties: [{ id: 'mode', name: 'Mode', type: 'string', default: 'normal' }],
        compiler: { template: '{{outputVar}} = process({{props.mode}});' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: { id: 'test-node', type: 'test_node', data: {}, position: { x: 0, y: 0 } },
        definition: definitions.get('test_node')!,
      });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('process("normal")');
    });

    it('should replace {{props.X}} with empty string when no value or default', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = process({{props.missing}});' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext();
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('process("")');
    });

    it('should replace {{data.X}} with raw node data value', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = {{data.count}};' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: {
          id: 'test-node',
          type: 'test_node',
          data: { count: 42 },
          position: { x: 0, y: 0 },
        },
      });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('= 42');
    });

    it('should replace {{data.X}} with null when not present', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = {{data.missing}};' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext();
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('= null');
    });
  });

  describe('escaping', () => {
    it('should escape string values in props', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = {{props.text}};' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: {
          id: 'test-node',
          type: 'test_node',
          data: { text: 'Hello "World"\nLine 2' },
          position: { x: 0, y: 0 },
        },
      });
      const code = compiler.compileNode('test_node', ctx);

      // Should escape quotes and newlines
      expect(code).toContain('\\"World\\"');
      expect(code).toContain('\\n');
    });
  });

  describe('output handling', () => {
    it('should include workflow_context assignment', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = "result";' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext({
        node: { id: 'my-node', type: 'test_node', data: {}, position: { x: 0, y: 0 } },
      });
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toContain('workflow_context["my-node"]');
    });

    it('should handle skipVarDeclaration flag', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: { template: '{{outputVar}} = "value";' },
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);

      // With declaration
      const ctxWithDecl = createMockContext({ skipVarDeclaration: false });
      const codeWithDecl = compiler.compileNode('test_node', ctxWithDecl);
      expect(codeWithDecl).toContain('let node_test_node_out = null');

      // Without declaration
      const ctxNoDecl = createMockContext({ skipVarDeclaration: true });
      const codeNoDecl = compiler.compileNode('test_node', ctxNoDecl);
      expect(codeNoDecl).not.toMatch(/let\s+node_test_node_out\s*=/);
    });
  });

  describe('error handling', () => {
    it('should return null for node type without template', () => {
      const definitions = new Map<string, NodeDefinition>();
      definitions.set('test_node', createNodeDef({
        id: 'test_node',
        name: 'Test Node',
        compiler: {}, // No template
      }));

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext();
      const code = compiler.compileNode('test_node', ctx);

      expect(code).toBeNull();
    });

    it('should return null for unknown node type', () => {
      const definitions = new Map<string, NodeDefinition>();

      const compiler = createTemplateCompiler('TestModule', definitions);
      const ctx = createMockContext();
      const code = compiler.compileNode('unknown_node', ctx);

      expect(code).toBeNull();
    });
  });
});

describe('createSingleNodeTemplateCompiler', () => {
  it('should create a compiler for a single node definition', () => {
    const definition = createNodeDef({
      id: 'my_node',
      name: 'My Node',
      compiler: { template: '{{outputVar}} = "single";' },
    });

    const compiler = createSingleNodeTemplateCompiler('my_node', definition);

    expect(compiler.name).toBe('Template:my_node');
    expect(compiler.getNodeTypes!()).toEqual(['my_node']);
  });

  it('should compile the single node correctly', () => {
    const definition = createNodeDef({
      id: 'my_node',
      name: 'My Node',
      compiler: { template: '{{outputVar}} = process({{inputs.data}});' },
    });

    const compiler = createSingleNodeTemplateCompiler('my_node', definition);
    const inputs = new Map<string, string>();
    inputs.set('data', 'prev_output');

    const ctx = createMockContext({ inputs });
    const code = compiler.compileNode('my_node', ctx);

    expect(code).toContain('process(prev_output)');
  });
});
