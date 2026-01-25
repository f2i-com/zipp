/**
 * Core Image Module Compiler
 *
 * Compiles image nodes (image_gen, image_view, image_save, image_combiner) into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreImageCompiler: ModuleCompiler = {
  name: 'Image',

  getNodeTypes() {
    return ['image_gen', 'image_view', 'image_save', 'image_resize'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';
    // Check multiple possible handle names: 'default', 'input', 'image', 'prompt'
    // Note: For image_gen, 'prompt' and 'image' are separate inputs - see image_gen case
    const inputVar = inputs.get('default') || inputs.get('input') || inputs.get('image') || inputs.get('prompt') || 'null';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'image_gen': {
        const prompt = escapeString(String(data.prompt || ''));
        // For image_gen, get the prompt input separately from image inputs
        // The 'prompt' handle is for dynamic prompt text, 'image' handles are for image inputs
        const promptInputVar = inputs.get('prompt') || inputs.get('default') || inputs.get('input') || 'null';
        // Get endpoint - fall back to projectSettings.defaultImageEndpoint if not set
        const projectSettings = data.projectSettings as { defaultImageEndpoint?: string; defaultImageApiKeyConstant?: string } | undefined;
        const endpoint = escapeString(String(data.endpoint || projectSettings?.defaultImageEndpoint || ''));
        const model = escapeString(String(data.model || ''));
        const apiKeyConstant = escapeString(String(data.apiKeyConstant || projectSettings?.defaultImageApiKeyConstant || 'OPENAI_API_KEY'));
        const width = Number(data.width) || 1024;
        const height = Number(data.height) || 1024;
        const steps = Number(data.steps) || 20;
        const apiFormat = escapeString(String(data.apiFormat || 'openai'));

        // ComfyUI workflow configuration
        // For the workflow JSON, we stringify it as a raw JSON value (not a string literal)
        // This avoids escaping issues with nested quotes
        let comfyWorkflowCode = 'null';
        if (data.comfyWorkflow) {
          try {
            let parsedWorkflow;
            if (typeof data.comfyWorkflow === 'string') {
              // Parse string workflow
              parsedWorkflow = JSON.parse(data.comfyWorkflow);
            } else if (typeof data.comfyWorkflow === 'object') {
              // Already an object (embedded in flow file)
              parsedWorkflow = data.comfyWorkflow;
            }
            if (parsedWorkflow) {
              comfyWorkflowCode = JSON.stringify(JSON.stringify(parsedWorkflow));
            }
          } catch {
            // If parsing fails, fall back to null
            comfyWorkflowCode = 'null';
          }
        } else if (data.comfyuiWorkflow && typeof data.comfyuiWorkflow === 'object') {
          // Handle embedded workflow (stored as object in macro definitions)
          try {
            comfyWorkflowCode = JSON.stringify(JSON.stringify(data.comfyuiWorkflow));
          } catch {
            comfyWorkflowCode = 'null';
          }
        }

        // Get primary prompt node ID - check both direct property and workflowInputs
        const comfyPrimaryPromptNodeId = data.comfyPrimaryPromptNodeId
          || (data.workflowInputs as { promptNodeId?: string } | undefined)?.promptNodeId
          || null;
        // Get image input node IDs - check both direct properties and workflowInputs
        let comfyImageInputNodeIds = Array.isArray(data.comfyImageInputNodeIds) ? data.comfyImageInputNodeIds : [];
        let comfyImageInputConfigs = Array.isArray(data.comfyImageInputConfigs) ? data.comfyImageInputConfigs : [];
        const comfyAllImageNodeIds = Array.isArray(data.comfyAllImageNodeIds) ? data.comfyAllImageNodeIds : [];

        // For embedded workflows with workflowInputs, create image input config from imageNodeId
        const workflowInputs = data.workflowInputs as { imageNodeId?: string; imageInputKey?: string } | undefined;
        if (workflowInputs?.imageNodeId && comfyImageInputNodeIds.length === 0 && comfyImageInputConfigs.length === 0) {
          comfyImageInputNodeIds = [workflowInputs.imageNodeId];
          comfyImageInputConfigs = [{
            nodeId: workflowInputs.imageNodeId,
            title: 'Input Image',
            nodeType: 'LoadImage',
            allowBypass: true, // Optional input
          }];
        }
        const comfySeedMode = String(data.comfySeedMode || 'random');
        const comfyFixedSeed = data.comfyFixedSeed != null ? Number(data.comfyFixedSeed) : null;

        // Get image inputs from connected handles
        const imageInputCount = Number(data.imageInputCount) || 0;
        const imageInputVars: string[] = [];

        // For ComfyUI, prefer comfyImageInputConfigs length, then comfyImageInputNodeIds; for others, use imageInputCount
        const effectiveImageCount = apiFormat === 'comfyui'
          ? (comfyImageInputConfigs.length || comfyImageInputNodeIds.length)
          : imageInputCount;

        for (let i = 0; i < effectiveImageCount; i++) {
          // Check for image_0, image_1, etc. Also accept 'image' as fallback for first input (backwards compatibility)
          let imageVar = inputs.get(`image_${i}`);
          if (!imageVar && i === 0) {
            imageVar = inputs.get('image');
          }
          imageInputVars.push(imageVar || 'null');
        }

        // Build the image inputs array literal
        const imageInputsCode = imageInputVars.length > 0 ? `[${imageInputVars.join(', ')}]` : 'null';
        const comfyNodeIdsCode = comfyImageInputNodeIds.length > 0
          ? `[${comfyImageInputNodeIds.map(id => `"${escapeString(id)}"`).join(', ')}]`
          : 'null';

        // Build the image input configs array (with bypass settings)
        // Handle both old format (title, nodeType) and new format (label, inputName)
        let comfyImageInputConfigsCode = 'null';
        if (comfyImageInputConfigs.length > 0) {
          const configItems = comfyImageInputConfigs.map((cfg: { nodeId?: string; title?: string; label?: string; nodeType?: string; inputName?: string; allowBypass?: boolean }) => {
            const nodeId = cfg.nodeId || '';
            const title = cfg.title || cfg.label || '';
            const nodeType = cfg.nodeType || cfg.inputName || 'LoadImage';
            const allowBypass = cfg.allowBypass ?? false;
            return `{nodeId:"${escapeString(nodeId)}",title:"${escapeString(title)}",nodeType:"${escapeString(nodeType)}",allowBypass:${allowBypass}}`;
          });
          comfyImageInputConfigsCode = `[${configItems.join(',')}]`;
        }

        // Build ALL image node IDs array (for bypassing unselected ones)
        const comfyAllImageNodeIdsCode = comfyAllImageNodeIds.length > 0
          ? `[${comfyAllImageNodeIds.map(id => `"${escapeString(id)}"`).join(', ')}]`
          : 'null';

        // Image size limits for input images (0 = use defaults)
        const maxImageDimension = Number(data.maxImageDimension) || 0;
        const maxImageSizeKB = Number(data.maxImageSizeKB) || 0;

        // Check if prompt input is null (skip generation if so - e.g., from condition branch)
        code += `
  if (${promptInputVar} === null) {
    console.log("[Image Gen] (${node.id}) Skipped - prompt is null");
    ${letOrAssign}${outputVar} = null;
    let ${outputVar}_image = null;
    workflow_context["${node.id}"] = null;
  } else {
    console.log("[Image Gen] (${node.id}) imageInputs:", ${imageInputsCode});
    ${letOrAssign}${outputVar} = await Image.generate(
      "${prompt}",
      ${promptInputVar},
      "${endpoint}",
      "${model}",
      "${apiKeyConstant}",
      ${width},
      ${height},
      ${steps},
      "${apiFormat}",
      "${node.id}",
      ${comfyWorkflowCode},
      ${comfyPrimaryPromptNodeId ? `"${escapeString(String(comfyPrimaryPromptNodeId))}"` : 'null'},
      ${comfyNodeIdsCode},
      ${imageInputsCode},
      ${comfyImageInputConfigsCode},
      "${comfySeedMode}",
      ${comfyFixedSeed !== null ? comfyFixedSeed : 'null'},
      ${comfyAllImageNodeIdsCode},
      ${maxImageDimension},
      ${maxImageSizeKB}
    );
    if (${outputVar} === "__ABORT__") {
      console.log("[Workflow] aborted");
      return workflow_context;
    }
    // Create suffixed output variable for consistency with multi-output pattern
    // Always use 'let' for suffix variables as they are only created here
    let ${outputVar}_image = ${outputVar};
    workflow_context["${node.id}"] = ${outputVar};
  }`;
        break;
      }

      case 'image_view': {
        // Image view just passes through the input
        code += `
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'image_save': {
        // Note: node property is 'path', not 'outputPath'
        const outputPath = escapeString(String(data.path || data.outputPath || ''));
        const format = escapeString(String(data.format || 'png'));
        const quality = Number(data.quality) || 90;
        const createDir = data.createDirectory !== false;

        code += `
  ${letOrAssign}${outputVar} = await Image.save(
    ${inputVar},
    "${outputPath}",
    "${format}",
    ${quality},
    ${createDir},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variable for 'path' output handle
  let ${outputVar}_path = ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'image_resize': {
        const maxDimension = Number(data.maxDimension) || 1024;
        const maxSizeKB = Number(data.maxSizeKB) || 200;
        const quality = Number(data.quality) || 85;

        code += `
  ${letOrAssign}${outputVar} = await Image.resize(
    ${inputVar},
    ${maxDimension},
    ${maxSizeKB},
    ${quality},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variable for 'image' output handle
  let ${outputVar}_image = ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      default:
        return null;
    }

    return code;
  },
};

export default CoreImageCompiler;
