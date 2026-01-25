/**
 * Core Input Module Compiler
 *
 * Compiles input nodes (input_text, input_file, folder_input) into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreInputCompiler: ModuleCompiler = {
  name: 'Input',

  getNodeTypes() {
    return ['input_text', 'input_file', 'input_video', 'input_folder', 'input_audio'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, outputVar, skipVarDeclaration, escapeString } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'input_text': {
        // Check if there's an input for this node (by id, label, or generic "input" key for subflows)
        const nodeLabel = String(data.label || '').toLowerCase().replace(/\s+/g, '_');
        const nodeId = node.id;
        const defaultValue = JSON.stringify(data.value || '');

        // Priority order:
        // 1. __inputs["nodeId"] - exact node ID match
        // 2. __inputs["label"] - label-based match (lowercased, spaces to underscores)
        // 3. __inputs["input"] - generic input key (used when subflow is called with single input)
        // 4. defaultValue - fallback to configured default
        code += `
  ${letOrAssign}${outputVar} = (__inputs["${nodeId}"] != null ? __inputs["${nodeId}"] : (__inputs["${nodeLabel}"] != null ? __inputs["${nodeLabel}"] : (__inputs["input"] != null ? __inputs["input"] : ${defaultValue})));
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'input_file': {
        // File input outputs the file content (text or data URL for images)
        // Note: Video handling has been moved to input_video node
        code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(data.content || data.fileContent || data.dataUrl || data.filePath || '')};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'input_video': {
        // Video input outputs the file path for processing by downstream nodes
        const videoPath = data.filePath || '';
        code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(videoPath)};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'input_folder': {
        // Folder input with file listing
        const path = escapeString(String(data.path || ''));
        const recursive = data.recursive !== false;
        const includePatterns = escapeString(String(data.includePatterns || '*'));
        const maxFiles = Number(data.maxFiles) || 1000;

        code += `
  ${letOrAssign}${outputVar} = await FileSystem.listFolder("${path}", ${recursive}, "${includePatterns}", ${maxFiles}, "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'input_audio': {
        // Audio input outputs the file path for audio mixing
        const audioPath = data.filePath || '';
        code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(audioPath)};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      default:
        return null; // Unknown node type, let main compiler handle it
    }

    return code;
  },
};

export default CoreInputCompiler;
