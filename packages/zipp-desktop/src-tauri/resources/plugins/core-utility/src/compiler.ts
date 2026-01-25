/**
 * Core Utility Module Compiler
 *
 * Compiles utility nodes (template, logic_block, memory) into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreUtilityCompiler: ModuleCompiler = {
  name: 'Utility',

  getNodeTypes() {
    return ['template', 'logic_block', 'memory', 'comfyui_free_memory'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, isInLoop, loopStartId, escapeString, sanitizeId, debugEnabled } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';
    const debug = debugEnabled ?? false;
    // Check multiple possible handle names: 'default', 'input', 'input1', 'value'
    const inputVar = inputs.get('default') || inputs.get('input') || inputs.get('input1') || inputs.get('value') || 'null';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'template': {
        let template = escapeString(String(data.template || ''));

        // Debug: log the raw template (only in debug mode)
        if (debug) {
          console.log(`[Template Compiler] Node ${node.id}: raw template (first 500 chars):`, template.substring(0, 500));
          console.log(`[Template Compiler] Node ${node.id}: template includes {{history}}:`, template.includes('{{history}}'));
        }

        // Find all {{varName}} patterns and their input sources
        const templateVars = template.match(/\{\{([^}]+)\}\}/g) || [];
        if (debug) {
          console.log(`[Template Compiler] Node ${node.id}: found templateVars:`, templateVars);
        }
        const varMap: Record<string, string> = {};

        // Track the first connected input for conditional branch detection
        let firstInputVar: string | null = null;

        // Get custom input names from node data (e.g., ['value', 'count'])
        const inputNames = (data.inputNames as string[]) || [];
        // Map from standard handle IDs to custom names
        const handleToName: Record<string, string> = {
          'input': inputNames[0] || 'input',
          'input2': inputNames[1] || 'input2',
          'input3': inputNames[2] || 'input3',
          'input4': inputNames[3] || 'input4',
          'input5': inputNames[4] || 'input5',
          'input6': inputNames[5] || 'input6',
        };

        // Build map of template variable -> source variable
        for (const [handleId, sourceVar] of inputs) {
          // Map the handle ID to the custom input name
          const varName = handleToName[handleId] || handleId;
          varMap[varName] = sourceVar;
          // Also add the handle ID itself as a fallback
          varMap[handleId] = sourceVar;
          // Track first input for condition branch null-check
          if (!firstInputVar) {
            firstInputVar = sourceVar;
          }
          // Also allow {{input}} to refer to the first connected input
          if (!varMap['input'] && (handleId === 'default' || handleId === 'input' || handleId === 'input1')) {
            varMap['input'] = sourceVar;
          }
        }

        if (debug) {
          console.log(`[Template Compiler] Node ${node.id}: inputNames:`, inputNames, 'varMap keys:', Object.keys(varMap));
        }

        // Special handling for loop variables - these are substituted at runtime, not compile-time
        // We'll add the runtime substitution code after the template is initialized
        let loopSubstitutions = '';
        if (isInLoop && loopStartId) {
          const historyStrVar = `${sanitizeId(loopStartId)}_history_str`;
          const indexVar = `node_${sanitizeId(loopStartId)}_out_index`;
          const itemVar = `node_${sanitizeId(loopStartId)}_out`;

          // Debug: log the variable names being used (only in debug mode)
          if (debug) {
            code += `
  console.log("[Template] (${node.id}) loop context: historyStrVar=${historyStrVar}, historyValue=" + ${historyStrVar});`;
          }

          // Build runtime substitution code for loop variables
          loopSubstitutions = `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{history}}").join(String(${historyStrVar} || ''));
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{index}}").join(String(${indexVar} || ''));
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{item}}").join(JSON.stringify(${itemVar}));`;
        }

        // Check if input comes from a condition branch (ends with _out_true or _out_false)
        // If the input is null, output null to support conditional branching
        const checkForConditionBranch = firstInputVar &&
          (firstInputVar.includes('_out_true') || firstInputVar.includes('_out_false'));

        if (checkForConditionBranch) {
          // Declare output variable before the if-else so it's in scope
          code += `
  // Check if condition branch input is null (skip template if so)
  ${letOrAssign}${outputVar} = null;
  if (${firstInputVar} === null) {
    console.log("[Template] (${node.id}): skipped (condition branch input is null)");
    workflow_context["${node.id}"] = null;
  } else {`;

          // Build substitution code
          code += `
    console.log("[Template] (${node.id}) === Template Node Start ===");
    let _tmpl_${sanitizedId} = "${template}";
    console.log("[Template] (${node.id}) raw template length: " + _tmpl_${sanitizedId}.length);`;

          // Add loop variable substitutions
          if (loopSubstitutions) {
            code += loopSubstitutions;
          }

          // Substitute connected variables
          for (const varName of templateVars) {
            const cleanName = varName.replace(/\{\{|\}\}/g, '');
            if (varMap[cleanName]) {
              code += `
    _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{${cleanName}}}").join(String(${varMap[cleanName]} || ''));`;
            }
          }

          // Default: replace {{input}} with the main input
          code += `
    _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{input}}").join(String(${inputVar} || ''));
    ${outputVar} = _tmpl_${sanitizedId};
    console.log("[Template] output (${node.id}): " + ${outputVar}.substring(0, 100));
    workflow_context["${node.id}"] = ${outputVar};
  }`;
        } else {
          // Non-conditional template - original code path
          code += `
  console.log("[Template] (${node.id}) === Template Node Start ===");
  let _tmpl_${sanitizedId} = "${template}";
  console.log("[Template] (${node.id}) raw template length: " + _tmpl_${sanitizedId}.length);`;

          // Add loop variable substitutions (must be done at runtime since these are loop context variables)
          if (loopSubstitutions) {
            code += loopSubstitutions;
          }

          // Substitute connected variables
          for (const varName of templateVars) {
            const cleanName = varName.replace(/\{\{|\}\}/g, '');
            if (varMap[cleanName]) {
              code += `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{${cleanName}}}").join(String(${varMap[cleanName]} || ''));`;
            }
          }

          // Default: replace {{input}} with the main input
          code += `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{input}}").join(String(${inputVar} || ''));
  ${letOrAssign}${outputVar} = _tmpl_${sanitizedId};
  console.log("[Template] output (${node.id}): " + ${outputVar}.substring(0, 100));
  workflow_context["${node.id}"] = ${outputVar};`;
        }
        break;
      }

      case 'logic_block': {
        // Get the user's code - use 'code' field (from UI) or 'script' field (legacy)
        let userCode = String(data.code || data.script || 'input');
        userCode = userCode.trim();

        // Build named input variables and IIFE parameters
        // To avoid FormLogic closure capture issues, pass all inputs as IIFE parameters
        const iifeParams: string[] = [];
        const iifeArgs: string[] = [];
        let namedInputsSetup = '';

        // Add primary input
        iifeParams.push('_p_input');
        iifeArgs.push(inputVar);
        namedInputsSetup += `
  let input = _p_input;`;

        // Add other named inputs
        for (const [handleId, sourceVar] of inputs) {
          // Skip 'default' and 'input' since we already have 'input'
          if (handleId !== 'default' && handleId !== 'input') {
            const paramName = `_p_${handleId}`;
            iifeParams.push(paramName);
            iifeArgs.push(sourceVar);
            namedInputsSetup += `
  let ${handleId} = ${paramName};`;
          }
        }

        // Expose loop index when inside a loop
        if (isInLoop && loopStartId) {
          const sanitizedLoopId = sanitizeId(loopStartId);
          const loopIdxVar = `_i_${sanitizedLoopId}`;
          iifeParams.push('_p_loop_index');
          iifeArgs.push(loopIdxVar);
          namedInputsSetup += `
  let loop_index = _p_loop_index;`;
        }

        // Check if code has return statements - if so, wrap in IIFE for proper return behavior
        const hasReturn = /\breturn\b/.test(userCode);
        // Check if code uses await - if so, use async IIFE
        const hasAwait = /\bawait\b/.test(userCode);
        const asyncPrefix = hasAwait ? 'async ' : '';
        const awaitPrefix = hasAwait ? 'await ' : '';

        if (hasReturn) {
          // Wrap in immediately-invoked function expression (IIFE) so return statements work properly
          // Pass all variables as IIFE parameters to avoid FormLogic closure capture issues
          // Use async IIFE if code contains await
          code += `
  // Logic block: wrapped in ${hasAwait ? 'async ' : ''}IIFE for proper return behavior
  let context = workflow_context;
  ${letOrAssign}${outputVar} = ${awaitPrefix}(${asyncPrefix}function(${iifeParams.join(', ')}) {${namedInputsSetup}
    ${userCode}
  })(${iifeArgs.join(', ')});
  workflow_context["${node.id}"] = ${outputVar};`;
        } else {
          // No return statements - simple inline execution
          // If it's a single expression, use it directly; otherwise wrap as expression
          const isSingleExpression = !userCode.includes(';') && !userCode.includes('\n');

          if (isSingleExpression && !hasAwait) {
            // Simple expression - inline without IIFE (only if no await)
            // Still need to evaluate inputs at the right point
            code += `
  // Logic block: inline FormLogic execution
  let context = workflow_context;
  let input = ${inputVar};`;
            for (const [handleId, sourceVar] of inputs) {
              if (handleId !== 'default' && handleId !== 'input') {
                code += `
  let ${handleId} = ${sourceVar};`;
              }
            }
            if (isInLoop && loopStartId) {
              const sanitizedLoopId = sanitizeId(loopStartId);
              code += `
  let loop_index = _i_${sanitizedLoopId};`;
            }
            code += `
  ${letOrAssign}${outputVar} = ${userCode};
  workflow_context["${node.id}"] = ${outputVar};`;
          } else {
            // Multi-statement code without return - wrap in IIFE with parameters
            // Use async IIFE if code contains await
            code += `
  // Logic block: multi-statement (no return)${hasAwait ? ' - async' : ''}
  let context = workflow_context;
  ${letOrAssign}${outputVar} = ${awaitPrefix}(${asyncPrefix}function(${iifeParams.join(', ')}) {${namedInputsSetup}
    ${userCode};
    return null;
  })(${iifeArgs.join(', ')});
  workflow_context["${node.id}"] = ${outputVar};`;
          }
        }
        break;
      }

      case 'memory': {
        const memoryKey = escapeString(String(data.key || 'default'));
        const operation = String(data.operation || 'get');

        if (operation === 'set') {
          code += `
  // Memory set: store value
  console.log("[Memory] (${node.id}) === Memory Set ===");
  console.log("[Memory] (${node.id}) key: ${memoryKey}, input type: " + (typeof ${inputVar}));
  await Agent.set("${memoryKey}", ${inputVar});
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        } else {
          // Get operation
          code += `
  // Memory get: retrieve stored value
  console.log("[Memory] (${node.id}) === Memory Get ===");
  console.log("[Memory] (${node.id}) key: ${memoryKey}");
  ${letOrAssign}${outputVar} = await Agent.get("${memoryKey}");
  console.log("[Memory] (${node.id}) retrieved type: " + (typeof ${outputVar}));
  if (${outputVar} == null) {
    ${outputVar} = ${inputVar}; // Fallback to input if nothing stored
    console.log("[Memory] (${node.id}) using fallback input");
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        }
        break;
      }

      case 'comfyui_free_memory': {
        const comfyuiUrl = escapeString(String(data.comfyuiUrl || 'http://127.0.0.1:8188'));
        const unloadModels = data.unloadModels !== false;
        const freeMemory = data.freeMemory !== false;

        code += `
  // ComfyUI Free Memory: unload models and free GPU memory
  console.log("[ComfyUI Free Memory] (${node.id}) === Freeing GPU Memory ===");
  await Utility.comfyuiFreeMemory(
    "${comfyuiUrl}",
    ${unloadModels},
    ${freeMemory},
    "${node.id}"
  );
  // Pass through the input unchanged
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      default:
        return null;
    }

    return code;
  },
};

export default CoreUtilityCompiler;
