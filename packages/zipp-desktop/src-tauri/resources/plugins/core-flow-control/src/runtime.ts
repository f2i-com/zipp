/**
 * Core Flow Control Module Runtime
 *
 * Provides flow control primitives: loops, conditions, subflows, macros, output.
 * Note: Most flow control is handled by the compiler, not the runtime.
 * This module provides runtime support for subflow and macro execution.
 */

import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

// Module-level context reference (set during init)
let ctx: RuntimeContext;

// Track subflow/macro call stack to prevent infinite recursion
const callStack: string[] = [];
const MAX_RECURSION_DEPTH = 10;

/**
 * Execute a subflow
 *
 * Parameters match compiler output:
 * Subflow.execute(flowId, input, nodeId)
 */
async function execute(
  flowId: string,
  input: unknown,
  nodeId: string
): Promise<unknown> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Subflow] Running flow: ${flowId}`);

  if (!ctx.runSubflow) {
    ctx.onNodeStatus?.(nodeId, 'error');
    ctx.log('error', '[Subflow] No subflow callback configured in runtime context');
    return `Error: No subflow callback configured`;
  }

  // Check for infinite recursion
  if (callStack.includes(flowId)) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error(`Recursive subflow detected: ${flowId}`);
  }

  if (callStack.length >= MAX_RECURSION_DEPTH) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error(`Maximum subflow depth (${MAX_RECURSION_DEPTH}) exceeded`);
  }

  try {
    callStack.push(flowId);
    // Convert input to record format for callback
    const inputs: Record<string, unknown> = typeof input === 'object' && input !== null
      ? input as Record<string, unknown>
      : { input };
    const result = await ctx.runSubflow(flowId, inputs);
    callStack.pop();

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Subflow] Completed: ${flowId}`);
    return result;
  } catch (error) {
    callStack.pop();
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Subflow] Failed: ${errMsg}`);
    throw error;
  }
}

/**
 * Check abort signal
 */
function checkAborted(): boolean {
  return ctx.abortSignal?.aborted ?? false;
}

/**
 * Execute a macro workflow
 *
 * Parameters match compiler output:
 * Macro.execute(workflowId, inputs, nodeId)
 *
 * The macro workflow is executed with inputs mapped to __macro_inputs__
 * and outputs collected from __macro_outputs__
 */
async function executeMacro(
  workflowId: string,
  inputs: Record<string, unknown>,
  nodeId: string
): Promise<Record<string, unknown>> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Macro] Running macro workflow: ${workflowId}`);
  ctx.log('info', `[Macro] DEBUG: inputs received = ${JSON.stringify(inputs).substring(0, 500)}`);

  if (!ctx.runSubflow) {
    ctx.onNodeStatus?.(nodeId, 'error');
    ctx.log('error', '[Macro] No subflow callback configured in runtime context');
    throw new Error('No subflow callback configured');
  }

  // Check for infinite recursion
  const stackKey = `macro:${workflowId}`;
  if (callStack.includes(stackKey)) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error(`Recursive macro detected: ${workflowId}`);
  }

  if (callStack.length >= MAX_RECURSION_DEPTH) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error(`Maximum macro depth (${MAX_RECURSION_DEPTH}) exceeded`);
  }

  try {
    callStack.push(stackKey);

    // Pass inputs as __macro_inputs__ so macro_input nodes can access them
    const macroContext: Record<string, unknown> = {
      __macro_inputs__: inputs,
    };

    ctx.log('info', `[Macro] DEBUG: macroContext = ${JSON.stringify(macroContext).substring(0, 500)}`);

    // Execute the macro workflow
    const result = await ctx.runSubflow(workflowId, macroContext);

    callStack.pop();

    // Extract outputs from __macro_outputs__
    const outputs = (result as Record<string, unknown>)?.__macro_outputs__ || result || {};

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Macro] Completed: ${workflowId}`);

    return outputs as Record<string, unknown>;
  } catch (error) {
    callStack.pop();
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Macro] Failed: ${errMsg}`);
    throw error;
  }
}

/**
 * Core Flow Control Runtime Module
 *
 * Provides subflow and macro execution capabilities
 */
const CoreFlowControlRuntime: RuntimeModule = {
  name: 'Subflow',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    callStack.length = 0;
    ctx?.log?.('info', '[Core Flow Control] Module initialized');
  },

  methods: {
    execute,
    executeMacro,
    checkAborted,
  },

  async cleanup(): Promise<void> {
    callStack.length = 0;
    ctx?.log?.('info', '[Core Flow Control] Module cleanup');
  },
};

export default CoreFlowControlRuntime;
