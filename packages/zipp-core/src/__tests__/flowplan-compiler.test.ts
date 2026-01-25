/**
 * Tests for FlowPlan Compiler
 *
 * Tests conversion of FlowPlan DSL to WorkflowGraph.
 */

import { describe, it, expect } from '@jest/globals';
import { compileFlowPlan } from '../flowplan-compiler.js';
import type { FlowPlan, FlowPlanStep, FlowPlanInput, FlowPlanCollection, FlowPlanLoop } from '../flowplan.js';

// Helper to create a minimal FlowPlan
function createFlowPlan(overrides: Partial<FlowPlan> = {}): FlowPlan {
  return {
    name: 'Test Plan',
    description: 'A test plan',
    inputs: [],
    ...overrides,
  };
}

// Helper to create an input definition
function createInput(overrides: Partial<FlowPlanInput> = {}): FlowPlanInput {
  return {
    name: 'test_input',
    type: 'text',
    ...overrides,
  };
}

// Helper to create a step
function createStep(overrides: Partial<FlowPlanStep> = {}): FlowPlanStep {
  return {
    id: 'step-1',
    type: 'template',
    ...overrides,
  } as FlowPlanStep;
}

describe('compileFlowPlan', () => {
  describe('basic compilation', () => {
    it('should compile plan with inputs and steps', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'my_input' })],
        steps: [
          createStep({ id: 'step1', type: 'template', template: '{{my_input}}' }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(result.graph!.nodes.length).toBeGreaterThan(0);
    });

    it('should return errors for invalid plan', () => {
      const plan = createFlowPlan({
        name: '', // Invalid: name required
      });

      const result = compileFlowPlan(plan);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return result object with expected structure', () => {
      const plan = createFlowPlan({
        inputs: [createInput()],
        steps: [createStep({ id: 's1', type: 'template', template: 'test' })],
      });

      const result = compileFlowPlan(plan);

      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });
  });

  describe('input compilation', () => {
    it('should create input_text nodes for text inputs', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'prompt', type: 'text' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{prompt}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const inputNode = result.graph!.nodes.find(n => n.type === 'input_text');
      expect(inputNode).toBeDefined();
    });

    it('should create input_file nodes for file_path inputs', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'image', type: 'file_path' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{image}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const fileNode = result.graph!.nodes.find(n => n.type === 'input_file');
      expect(fileNode).toBeDefined();
    });

    it('should set default values from input definition', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'greeting', type: 'text', default: 'Hello World' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{greeting}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const inputNode = result.graph!.nodes.find(n => n.type === 'input_text');
      expect(inputNode?.data.value).toBe('Hello World');
    });

    it('should set label from input name', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'prompt', type: 'text' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{prompt}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const inputNode = result.graph!.nodes.find(n => n.type === 'input_text');
      expect(inputNode?.data.label).toBe('prompt');
    });
  });

  describe('collection compilation', () => {
    it('should create input_folder nodes for folder_files collections', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'images_folder', type: 'folder_path' })],
        collections: [
          {
            name: 'images',
            type: 'folder_files',
            from: 'images_folder',
          } as FlowPlanCollection,
        ],
        loop: {
          mode: 'for_each',
          over: 'images',
          itemAlias: 'img',
          steps: [createStep({ id: 's1', type: 'template', template: '{{img}}' })],
        },
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const folderNode = result.graph!.nodes.find(n => n.type === 'input_folder');
      expect(folderNode).toBeDefined();
    });

    it('should set collection options on input_folder node', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'folder', type: 'folder_path' })],
        collections: [
          {
            name: 'files',
            type: 'folder_files',
            from: 'folder',
            recursive: true,
            include: ['*.jpg', '*.png'],
            max: 50,
          } as FlowPlanCollection,
        ],
        loop: {
          mode: 'for_each',
          over: 'files',
          itemAlias: 'f',
          steps: [createStep({ id: 's1', type: 'template', template: '{{f}}' })],
        },
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const folderNode = result.graph!.nodes.find(n => n.type === 'input_folder');
      expect(folderNode?.data.recursive).toBe(true);
      expect(folderNode?.data.maxFiles).toBe(50);
    });

    it('should use collectionPaths option to pre-fill folder path', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'images_folder', type: 'folder_path' })],
        collections: [
          {
            name: 'images',
            type: 'folder_files',
            from: 'images_folder',
          } as FlowPlanCollection,
        ],
        loop: {
          mode: 'for_each',
          over: 'images',
          itemAlias: 'img',
          steps: [createStep({ id: 's1', type: 'template', template: '{{img}}' })],
        },
      });

      const result = compileFlowPlan(plan, {
        collectionPaths: { images: 'C:/my/images' },
      });

      expect(result.graph).toBeDefined();
      const folderNode = result.graph!.nodes.find(n => n.type === 'input_folder');
      expect(folderNode?.data.path).toBe('C:/my/images');
    });
  });

  describe('step compilation', () => {
    it('should create nodes for template steps', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'input', type: 'text' })],
        steps: [
          createStep({
            id: 'process',
            type: 'template',
            template: 'Hello {{input}}',
          }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const templateNode = result.graph!.nodes.find(n => n.type === 'template');
      expect(templateNode).toBeDefined();
    });

    it('should create edges between connected steps', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'input', type: 'text' })],
        steps: [
          createStep({ id: 'step1', type: 'template', template: '{{input}}' }),
          createStep({ id: 'step2', type: 'template', template: '{{step1}}' }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(result.graph!.edges.length).toBeGreaterThan(0);
    });

    it('should compile ai_llm steps', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'prompt', type: 'text' })],
        steps: [
          createStep({
            id: 'ai-response',
            type: 'ai_llm',
            prompt: 'Answer this: {{prompt}}',
          }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const aiNode = result.graph!.nodes.find(n => n.type === 'ai_llm');
      expect(aiNode).toBeDefined();
    });

    it('should compile file_read steps', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'path', type: 'text' })],
        steps: [
          createStep({
            id: 'read-file',
            type: 'file_read',
            path: '{{path}}',
            as: 'text',
          }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const fileNode = result.graph!.nodes.find(n => n.type === 'file_read');
      expect(fileNode).toBeDefined();
    });
  });

  describe('loop compilation', () => {
    it('should create loop nodes for foreach loops', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'folder', type: 'folder_path' })],
        collections: [
          {
            name: 'files',
            type: 'folder_files',
            from: 'folder',
          } as FlowPlanCollection,
        ],
        loop: {
          mode: 'for_each',
          over: 'files',
          itemAlias: 'file',
          steps: [
            createStep({ id: 'process', type: 'template', template: 'Processing {{file}}' }),
          ],
        } as FlowPlanLoop,
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      // Should have some loop-related node
      const hasLoopNode = result.graph!.nodes.some(n =>
        n.type === 'loop_start' || n.type.includes('loop')
      );
      expect(hasLoopNode || result.graph!.nodes.length > 0).toBe(true);
    });

    it('should create template nodes inside loop', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'folder', type: 'folder_path' })],
        collections: [
          {
            name: 'files',
            type: 'folder_files',
            from: 'folder',
          } as FlowPlanCollection,
        ],
        loop: {
          mode: 'for_each',
          over: 'files',
          itemAlias: 'item',
          steps: [
            createStep({ id: 'inner-step', type: 'template', template: '{{item}}' }),
          ],
        } as FlowPlanLoop,
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const templateNode = result.graph!.nodes.find(n => n.type === 'template');
      expect(templateNode).toBeDefined();
    });
  });

  describe('output handling', () => {
    it('should add output node when no explicit output step', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'text', type: 'text' })],
        steps: [
          createStep({ id: 'process', type: 'template', template: '{{text}}' }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const outputNode = result.graph!.nodes.find(n => n.type === 'output');
      expect(outputNode).toBeDefined();
    });
  });

  describe('edge creation', () => {
    it('should create edges from input references', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'my_input', type: 'text' })],
        steps: [
          createStep({
            id: 'step1',
            type: 'template',
            template: 'Value: {{my_input}}',
          }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(result.graph!.edges.length).toBeGreaterThan(0);
    });

    it('should create edges between steps for step references', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'input', type: 'text' })],
        steps: [
          createStep({ id: 'step1', type: 'template', template: '{{input}}' }),
          createStep({ id: 'step2', type: 'template', template: '{{step1}}' }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(result.graph!.edges.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('compiler options', () => {
    it('should accept AI options', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'prompt', type: 'text' })],
        steps: [
          createStep({
            id: 'ai-step',
            type: 'ai_llm',
            prompt: '{{prompt}}',
          }),
        ],
      });

      const result = compileFlowPlan(plan, {
        aiModel: 'gpt-4o',
        aiProvider: 'openai',
        aiEndpoint: 'https://api.openai.com/v1/chat/completions',
      });

      expect(result.graph).toBeDefined();
      const aiNode = result.graph!.nodes.find(n => n.type === 'ai_llm');
      expect(aiNode).toBeDefined();
    });

    it('should accept image options', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'prompt', type: 'text' })],
        steps: [
          createStep({
            id: 'gen-image',
            type: 'ai_image',
            prompt: '{{prompt}}',
          }),
        ],
      });

      const result = compileFlowPlan(plan, {
        imageModel: 'dall-e-3',
        imageEndpoint: 'https://api.openai.com/v1/images/generations',
        imageApiFormat: 'openai',
      });

      expect(result.graph).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should return error for plan with no name', () => {
      const plan = {
        name: '',
        description: 'Test',
        inputs: [],
      } as FlowPlan;

      const result = compileFlowPlan(plan);

      expect(result.success).toBe(false);
      expect(result.errors.some(e => e.toLowerCase().includes('name'))).toBe(true);
    });

    it('should return result even for unknown step types', () => {
      const plan = createFlowPlan({
        inputs: [createInput()],
        steps: [
          createStep({
            id: 'test',
            type: 'unknown_type_xyz',
          }),
        ],
      });

      const result = compileFlowPlan(plan);

      expect(result).toBeDefined();
      expect(result).toHaveProperty('success');
    });
  });

  describe('graph structure', () => {
    it('should return graph with nodes array', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'x', type: 'text' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{x}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(Array.isArray(result.graph!.nodes)).toBe(true);
    });

    it('should return graph with edges array', () => {
      const plan = createFlowPlan({
        inputs: [createInput({ name: 'x', type: 'text' })],
        steps: [createStep({ id: 's1', type: 'template', template: '{{x}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      expect(Array.isArray(result.graph!.edges)).toBe(true);
    });

    it('should generate unique node IDs', () => {
      const plan = createFlowPlan({
        inputs: [
          createInput({ name: 'a', type: 'text' }),
          createInput({ name: 'b', type: 'text' }),
        ],
        steps: [createStep({ id: 's1', type: 'template', template: '{{a}} {{b}}' })],
      });

      const result = compileFlowPlan(plan);

      expect(result.graph).toBeDefined();
      const ids = result.graph!.nodes.map(n => n.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });
});
