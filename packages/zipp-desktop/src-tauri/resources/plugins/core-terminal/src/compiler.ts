/**
 * Core Terminal Module Compiler
 *
 * Compiles terminal automation nodes into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreTerminalCompiler: ModuleCompiler = {
  name: 'Terminal',

  getNodeTypes() {
    return ['terminal_session', 'terminal_ai_control', 'terminal_run_command'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString } = ctx;
    const data = node.data;
    const props = (data?.properties || {}) as Record<string, unknown>;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'terminal_session': {
        const shell = escapeString(String(props.shell || 'auto'));
        const workingDir = escapeString(String(props.workingDir || ''));
        const showWindow = props.showWindow === true;
        const title = escapeString(String(props.title || ''));

        code += `
  ${letOrAssign}${outputVar} = await Terminal.createSession("${shell}", "${workingDir}", ${showWindow}, "${title}", "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'terminal_ai_control': {
        // Session input is optional - if not connected, node creates its own
        const sessionInput = inputs.get('session') || inputs.get('default');
        const sessionVar = sessionInput || 'null';

        // Task can come from input or property
        const taskInput = inputs.get('task');
        const taskDescription = escapeString(String(props.taskDescription || ''));
        const taskExpr = taskInput || `"${taskDescription}"`;

        // Context image input (optional)
        const contextImageInput = inputs.get('contextImage');
        const contextImageExpr = contextImageInput || 'null';

        // Build options
        const shell = escapeString(String(props.shell || 'auto'));
        const workingDir = escapeString(String(props.workingDir || ''));
        const showWindow = props.showWindow !== false;
        const systemPrompt = escapeString(String(props.systemPrompt || 'You are an AI assistant controlling a terminal.'));
        const screenshotDelayMs = Number(props.screenshotDelayMs) || 500;
        const maxIterations = Number(props.maxIterations) || 20;
        const provider = escapeString(String(props.provider || 'openai'));
        const model = escapeString(String(props.model || ''));
        const apiKey = escapeString(String(props.apiKey || ''));
        const apiKeyConstant = escapeString(String(props.apiKeyConstant || ''));
        const endpoint = escapeString(String(props.endpoint || ''));
        const format = escapeString(String(props.format || 'openai'));
        const maxTokens = Number(props.maxTokens) || 1000;

        code += `
  // Terminal AI Control
  let _session_input_${sanitizedId} = ${sessionVar};
  let _task_${sanitizedId} = ${taskExpr};
  let _context_image_${sanitizedId} = ${contextImageExpr};

  let _ai_options_${sanitizedId} = {
    shell: "${shell}",
    workingDir: "${workingDir}",
    showWindow: ${showWindow},
    systemPrompt: "${systemPrompt}",
    screenshotDelayMs: ${screenshotDelayMs},
    maxIterations: ${maxIterations},
    provider: "${provider}",
    model: "${model}",
    apiKey: "${apiKey}",
    apiKeyConstant: "${apiKeyConstant}",
    endpoint: "${endpoint}",
    format: "${format}",
    maxTokens: ${maxTokens},
    contextImage: _context_image_${sanitizedId}
  };

  let _ai_result_${sanitizedId} = await Terminal.aiControl(_session_input_${sanitizedId}, _task_${sanitizedId}, _ai_options_${sanitizedId}, "${node.id}");

  if (_ai_result_${sanitizedId} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }

  // Extract values using direct property access (FormLogic handles this correctly)
  ${letOrAssign}${outputVar} = _ai_result_${sanitizedId};
  ${letOrAssign}${outputVar}_session = _ai_result_${sanitizedId} ? _ai_result_${sanitizedId}.session : null;
  ${letOrAssign}${outputVar}_result = _ai_result_${sanitizedId} ? (_ai_result_${sanitizedId}.result || "") : "";
  ${letOrAssign}${outputVar}_screenshot = _ai_result_${sanitizedId} ? (_ai_result_${sanitizedId}.screenshot || "") : "";

  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_session"] = ${outputVar}_session;
  workflow_context["${node.id}_result"] = ${outputVar}_result;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;`;
        break;
      }

      case 'terminal_run_command': {
        // Session input is required
        const sessionInput = inputs.get('session') || inputs.get('default');
        const sessionVar = sessionInput || 'null';

        // Command can come from input or property
        const commandInput = inputs.get('command');
        const commandText = escapeString(String(props.commandText || ''));
        const commandExpr = commandInput || `"${commandText}"`;

        const waitMs = Number(props.waitMs) || 1000;
        const takeScreenshot = props.takeScreenshot === true;

        code += `
  // Terminal Run Command
  let _session_${sanitizedId} = ${sessionVar};
  let _command_${sanitizedId} = ${commandExpr};

  let _cmd_options_${sanitizedId} = {
    waitMs: ${waitMs},
    takeScreenshot: ${takeScreenshot}
  };

  let _cmd_result_${sanitizedId} = await Terminal.runCommand(_session_${sanitizedId}, _command_${sanitizedId}, _cmd_options_${sanitizedId}, "${node.id}");

  if (_cmd_result_${sanitizedId} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }

  // Extract values using direct property access (FormLogic handles this correctly)
  ${letOrAssign}${outputVar} = _cmd_result_${sanitizedId};
  ${letOrAssign}${outputVar}_session = _cmd_result_${sanitizedId} ? _cmd_result_${sanitizedId}.session : null;
  ${letOrAssign}${outputVar}_output = _cmd_result_${sanitizedId} ? (_cmd_result_${sanitizedId}.output || "") : "";
  ${letOrAssign}${outputVar}_screenshot = _cmd_result_${sanitizedId} ? (_cmd_result_${sanitizedId}.screenshot || "") : "";

  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_session"] = ${outputVar}_session;
  workflow_context["${node.id}_output"] = ${outputVar}_output;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;`;
        break;
      }

      default:
        return null;
    }

    return code;
  },
};

export default CoreTerminalCompiler;
