/**
 * Plugin Vectorize Module Compiler
 *
 * Compiles vectorize nodes into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const PluginVectorizeCompiler: ModuleCompiler = {
  name: 'Vectorize',

  getNodeTypes() {
    return ['vectorize'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';

    // Get input image from connected handle
    const inputVar = inputs.get('default') || inputs.get('input') || inputs.get('image') || 'null';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'vectorize': {
        const outputPath = escapeString(String(data.outputPath || ''));
        const colorCount = Number(data.colorCount) || 16;
        const quality = escapeString(String(data.quality || 'balanced'));
        const smoothness = Number(data.smoothness) || 1.0;
        const minArea = Number(data.minArea) || 4;
        const removeBackground = data.removeBackground === true;
        const optimize = data.optimize !== false;

        code += `
  ${letOrAssign}${outputVar} = await Vectorize.convert(
    ${inputVar},
    "${outputPath}",
    ${colorCount},
    "${quality}",
    ${smoothness},
    ${minArea},
    ${removeBackground},
    ${optimize},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      default:
        return null;
    }

    return code;
  },
};

export default PluginVectorizeCompiler;
