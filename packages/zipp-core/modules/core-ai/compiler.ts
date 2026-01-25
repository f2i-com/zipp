/**
 * Core AI Module Compiler
 *
 * Compiles AI/LLM nodes into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreAICompiler: ModuleCompiler = {
  name: 'AI',

  getNodeTypes() {
    return ['ai_llm'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, isInLoop, loopStartId, escapeString, sanitizeId, debugEnabled } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';
    const debug = debugEnabled ?? false;

    if (nodeType !== 'ai_llm') {
      return null;
    }

    // Get input from connected node or use empty
    // Check multiple possible handle names: 'default', 'input', 'prompt'
    const inputVar = inputs.get('default') || inputs.get('input') || inputs.get('prompt') || 'null';

    // Get image inputs - collect all image_0, image_1, etc. handles
    // Also support legacy 'image' handle for backwards compatibility
    const imageInputCount = Number(data.imageInputCount) || 0;
    const imageVars: string[] = [];

    // Check for legacy 'image' handle first
    const legacyImage = inputs.get('image');
    if (legacyImage) {
      imageVars.push(legacyImage);
    }

    // Collect numbered image inputs
    for (let i = 0; i < imageInputCount; i++) {
      const imageVar = inputs.get(`image_${i}`);
      if (imageVar) {
        imageVars.push(imageVar);
      }
    }

    // Get history input for message history (connected to 'history' handle)
    const historyVar = inputs.get('history') || 'null';

    // Debug: log what inputs the compiler received (only in debug mode)
    if (debug) {
      const inputsDebug = Array.from(inputs.entries()).map(([k, v]) => `${k}=${v}`).join(', ');
      console.log(`[AI Compiler] Node ${node.id}: inputs=[${inputsDebug}], resolved inputVar=${inputVar}, imageVars=[${imageVars.join(', ')}], historyVar=${historyVar}`);
    }

    // Build system prompt with template substitution
    let systemPrompt = escapeString(String(data.systemPrompt || ''));
    let userPrompt = escapeString(String(data.prompt || ''));

    // If inside a loop, add special history variable substitution
    if (isInLoop && loopStartId) {
      const historyStrVar = `${sanitizeId(loopStartId)}_history_str`;
      // Template variable substitution for {{history}}
      systemPrompt = systemPrompt.replace(/\{\{history\}\}/g, `" + ${historyStrVar} + "`);
      userPrompt = userPrompt.replace(/\{\{history\}\}/g, `" + ${historyStrVar} + "`);
    }

    // Extract configuration from node data
    // Fall back to projectSettings defaults if not set on node
    const projectSettings = data.projectSettings as {
      defaultAIEndpoint?: string;
      defaultAIModel?: string;
      defaultAIApiKeyConstant?: string;
    } | undefined;
    const endpoint = escapeString(String(data.endpoint || projectSettings?.defaultAIEndpoint || ''));
    const model = escapeString(String(data.model || projectSettings?.defaultAIModel || ''));
    // Check both apiKeyConstant (constant name) and apiKey (direct value)
    const apiKeyConstant = escapeString(String(data.apiKeyConstant || data.apiKey || projectSettings?.defaultAIApiKeyConstant || 'OPENAI_API_KEY'));

    const streaming = data.streaming !== false;
    const maxTokens = Number(data.maxTokens) || 0;
    const temperature = Number(data.temperature) || 0.7;
    const responseFormat = escapeString(String(data.responseFormat || 'text'));
    const includeImages = data.includeImages !== false;
    const visionDetail = escapeString(String(data.visionDetail || 'auto'));

    // Build chunk references from connected nodes
    const chunkRefVar = `_chunk_refs_${sanitizedId}`;

    // chunkRefVar is always a new temporary variable (not the output)
    let code = `
  // --- Node: ${node.id} (ai_llm) ---
  let ${chunkRefVar} = [];`;

    // Security Check: REFUSE to compile if raw API key is detected
    // Raw keys embedded in workflows get exposed when files are shared/exported
    if (apiKeyConstant.match(/^(sk-|anthropic-|gsk_|AIza)/)) {
      throw new Error(
        `[Security Error] Node ${node.id}: Raw API key detected in settings. ` +
        `For security, API keys must be stored in Project Constants (not directly in nodes). ` +
        `Please create a constant like 'OPENAI_API_KEY' in Project Settings and reference it here.`
      );
    }

    // Check for multiple chunk reference inputs
    for (const [handleId, sourceVar] of inputs) {
      if (handleId.startsWith('chunk_ref_')) {
        code += `
  if (${sourceVar} && ${sourceVar}.documentId) {
    ${chunkRefVar}.push(${sourceVar});
  }`;
      }
    }

    // Handle input: if it's an array of chunk references, add them
    code += `
  if (Array.isArray(${inputVar})) {
    for (let _cr of ${inputVar}) {
      if (_cr && _cr.documentId) {
        ${chunkRefVar}.push(_cr);
      }
    }
  } else if (${inputVar} && ${inputVar}.documentId) {
    ${chunkRefVar}.push(${inputVar});
  }`;

    // Generate the AI call
    // If there's a connected input and no static user prompt, use the input as the user prompt
    // Otherwise, append the input to the user prompt
    const hasStaticUserPrompt = userPrompt.trim().length > 0;
    const userPromptExpr = hasStaticUserPrompt
      ? `"${userPrompt}" + (${inputVar} ? "\\n\\n" + String(${inputVar}) : "")`
      : `${inputVar} ? String(${inputVar}) : ""`;

    // Build message history from the history input
    // The history can be a string (newline-separated steps) or an array of messages
    const historyMessagesVar = `_history_messages_${sanitizedId}`;

    // Build the images array expression
    // If there are multiple images, pass them as an array
    // If there's just one, pass it directly for backwards compatibility
    // If none, pass null
    let imagesExpr: string;
    if (imageVars.length === 0) {
      imagesExpr = 'null';
    } else if (imageVars.length === 1) {
      imagesExpr = imageVars[0];
    } else {
      imagesExpr = `[${imageVars.join(', ')}]`;
    }

    code += `
  let _user_prompt_${sanitizedId} = ${userPromptExpr};
  let ${historyMessagesVar} = ${historyVar} || "";
  ${letOrAssign}${outputVar} = await AI.chat(
    "${systemPrompt}",
    _user_prompt_${sanitizedId},
    ${imagesExpr},
    "${endpoint}",
    "${model}",
    "${apiKeyConstant}",
    ${streaming},
    ${maxTokens},
    ${temperature},
    "${responseFormat}",
    ${includeImages},
    "${visionDetail}",
    "${node.id}",
    ${chunkRefVar},
    ${historyMessagesVar}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;

    return code;
  },
};

export default CoreAICompiler;
