"use strict";
var __PLUGIN_EXPORTS__ = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // external-global:react
  var require_react = __commonJS({
    "external-global:react"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.React;
    }
  });

  // external-global:@xyflow/react
  var require_react2 = __commonJS({
    "external-global:@xyflow/react"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ReactFlow;
    }
  });

  // external-global:zipp-ui-components
  var require_zipp_ui_components = __commonJS({
    "external-global:zipp-ui-components"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ZippUIComponents;
    }
  });

  // external-global:react/jsx-runtime
  var require_jsx_runtime = __commonJS({
    "external-global:react/jsx-runtime"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ReactJSXRuntime;
    }
  });

  // ../zipp-core/modules/core-ai/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-ai/runtime.ts
  var ctx;
  var MAX_ENDPOINT_LENGTH = 2048;
  var MAX_CONTENT_LENGTH = 10 * 1024 * 1024;
  function validateEndpoint(endpoint, context) {
    if (!endpoint || typeof endpoint !== "string") {
      throw new Error(`${context}: Endpoint URL is required`);
    }
    if (endpoint.length > MAX_ENDPOINT_LENGTH) {
      throw new Error(`${context}: Endpoint URL exceeds maximum length`);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      throw new Error(`${context}: Invalid endpoint URL: ${endpoint}`);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`${context}: Invalid protocol. Only http and https are allowed.`);
    }
    if (endpoint.toLowerCase().includes("javascript:")) {
      throw new Error(`${context}: JavaScript URLs are not allowed`);
    }
  }
  function validateContentLength(content, fieldName) {
    if (content && content.length > MAX_CONTENT_LENGTH) {
      const sizeMB = (content.length / 1024 / 1024).toFixed(2);
      throw new Error(`${fieldName} exceeds maximum size of 10MB (current: ${sizeMB}MB)`);
    }
  }
  function parseChunkRef(text) {
    const match = text.match(/__CHUNK_REF:({.*?})__/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
  function parseFileRef(text) {
    const match = text.match(/__FILE_REF:({.*?})__/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }
  async function readChunkContent(chunkRef) {
    if (!ctx.tauri) {
      throw new Error("Tauri not available for reading chunks");
    }
    return ctx.tauri.invoke("plugin:zipp-filesystem|read_chunk_content", {
      path: chunkRef.path,
      start: chunkRef.startByte,
      length: chunkRef.endByte - chunkRef.startByte
    });
  }
  var DEFAULT_MAX_IMAGE_DIMENSION = 1024;
  var DEFAULT_MAX_IMAGE_SIZE_KB = 200;
  function getMaxImageDimension() {
    const setting = ctx.getModuleSetting("maxImageDimension");
    if (typeof setting === "number" && setting > 0) {
      return setting;
    }
    return DEFAULT_MAX_IMAGE_DIMENSION;
  }
  function getMaxImageSizeKB() {
    const setting = ctx.getModuleSetting("maxImageSizeKB");
    if (typeof setting === "number" && setting > 0) {
      return setting;
    }
    return DEFAULT_MAX_IMAGE_SIZE_KB;
  }
  async function resizeImageIfNeeded(dataUrl, maxDimensionOverride = 0, maxSizeKBOverride = 0) {
    if (!dataUrl.startsWith("data:image")) {
      return dataUrl;
    }
    const maxDimension = maxDimensionOverride > 0 ? maxDimensionOverride : getMaxImageDimension();
    const maxSizeKB = maxSizeKBOverride > 0 ? maxSizeKBOverride : getMaxImageSizeKB();
    if (ctx.tauri) {
      try {
        const result = await ctx.tauri.invoke("resize_image", { dataUrl, maxDimension, maxSizeKb: maxSizeKB });
        if (result.success && result.dataUrl) {
          ctx.log("info", `[AI] Image resized via Rust: ${result.originalWidth}x${result.originalHeight} -> ${result.newWidth}x${result.newHeight}, ${result.originalSizeKb}KB -> ${result.newSizeKb}KB`);
          return result.dataUrl;
        } else if (result.error) {
          ctx.log("warn", `[AI] Rust resize failed: ${result.error}, falling back to canvas`);
        }
      } catch (err) {
        ctx.log("warn", `[AI] Rust resize not available: ${err}, falling back to canvas`);
      }
    }
    if (typeof document === "undefined" || typeof Image === "undefined") {
      ctx.log("info", "[AI] Canvas not available, skipping image resize");
      return dataUrl;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const originalSizeKB = Math.round(dataUrl.length / 1024);
        const dimensionsOk = width <= maxDimension && height <= maxDimension;
        const sizeOk = originalSizeKB <= maxSizeKB;
        const isPng = dataUrl.startsWith("data:image/png");
        if (dimensionsOk && sizeOk && !isPng) {
          ctx.log("info", `[AI] Image ${width}x${height} (${originalSizeKB}KB) within limits, no resize needed`);
          resolve(dataUrl);
          return;
        }
        let newWidth;
        let newHeight;
        if (width > height) {
          newWidth = Math.min(width, maxDimension);
          newHeight = Math.round(height * (newWidth / width));
        } else {
          newHeight = Math.min(height, maxDimension);
          newWidth = Math.round(width * (newHeight / height));
        }
        if (originalSizeKB > maxSizeKB) {
          const sizeRatio = originalSizeKB / maxSizeKB;
          const scaleFactor = 1 / Math.sqrt(sizeRatio);
          newWidth = Math.max(256, Math.round(newWidth * scaleFactor));
          newHeight = Math.max(256, Math.round(newHeight * scaleFactor));
        }
        ctx.log("info", `[AI] Resizing image via canvas from ${width}x${height} (${originalSizeKB}KB) to ${newWidth}x${newHeight}`);
        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          ctx.log("error", "[AI] Failed to get canvas context");
          resolve(dataUrl);
          return;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(img, 0, 0, newWidth, newHeight);
        let resizedDataUrl = canvas.toDataURL("image/jpeg", 0.8);
        let attempts = 0;
        let quality = 0.8;
        while (resizedDataUrl.length / 1024 > maxSizeKB && attempts < 3 && quality > 0.3) {
          quality -= 0.2;
          resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
          attempts++;
        }
        const newSizeKB = Math.round(resizedDataUrl.length / 1024);
        ctx.log("info", `[AI] Image resized: ${originalSizeKB}KB -> ${newSizeKB}KB (quality: ${quality.toFixed(1)})`);
        resolve(resizedDataUrl);
      };
      img.onerror = () => {
        ctx.log("error", "[AI] Failed to load image for resizing");
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }
  function getUserFriendlyError(error, context) {
    if (error.includes("Failed to fetch") || error.includes("NetworkError")) {
      return `Network error during ${context}. Check your internet connection and endpoint URL.`;
    }
    if (error.includes("401") || error.includes("Unauthorized")) {
      return `Authentication failed for ${context}. Check your API key.`;
    }
    if (error.includes("429") || error.includes("rate limit")) {
      return `Rate limit exceeded for ${context}. Please wait and try again.`;
    }
    if (error.includes("timeout") || error.includes("AbortError")) {
      return `Request timed out for ${context}.`;
    }
    return error;
  }
  function resolveApiKey(apiKeyConstant) {
    if (!apiKeyConstant) return "";
    if (apiKeyConstant.startsWith("sk-") || apiKeyConstant.startsWith("anthropic-") || apiKeyConstant.startsWith("gsk_") || apiKeyConstant.length > 40) {
      return apiKeyConstant;
    }
    if (ctx.getConstant) {
      const key = ctx.getConstant(apiKeyConstant);
      if (key) return key;
    }
    const settingKey = ctx.getModuleSetting(apiKeyConstant);
    if (typeof settingKey === "string") return settingKey;
    return "";
  }
  async function chat(systemPrompt, userPrompt, input, endpoint, model, apiKeyConstant, streaming, maxTokens, temperature, responseFormat, includeImages, visionDetail, nodeId, chunkRefs = [], messageHistory = "", maxImageDimensionOverride = 0, maxImageSizeKBOverride = 0) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[AI] Aborted by user before chat started");
      return "__ABORT__";
    }
    validateEndpoint(endpoint, "AI chat");
    validateContentLength(systemPrompt, "System prompt");
    validateContentLength(userPrompt, "User prompt");
    ctx.onNodeStatus?.(nodeId, "running");
    let finalPrompt = userPrompt;
    let imageInputs = [];
    const isImagePath = (s) => {
      const lower = s.toLowerCase();
      return (lower.includes("\\") || lower.includes("/")) && (lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif") || lower.endsWith(".webp") || lower.endsWith(".bmp"));
    };
    const isImageUrl = (s) => {
      try {
        const url = new URL(s);
        if (url.protocol !== "http:" && url.protocol !== "https:") return false;
        const pathname = url.pathname.toLowerCase();
        const filename = url.searchParams.get("filename")?.toLowerCase() || "";
        return pathname.endsWith(".png") || pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") || pathname.endsWith(".gif") || pathname.endsWith(".webp") || pathname.endsWith(".bmp") || filename.endsWith(".png") || filename.endsWith(".jpg") || filename.endsWith(".jpeg") || filename.endsWith(".gif") || filename.endsWith(".webp") || filename.endsWith(".bmp");
      } catch {
        return false;
      }
    };
    const fetchImageUrl = async (url) => {
      try {
        ctx.log("info", `[AI] Fetching image from URL: ${url}`);
        const response = await ctx.secureFetch(url, {
          method: "GET",
          purpose: "Fetch image for AI vision"
        });
        if (!response.ok) {
          ctx.log("warn", `[AI] Failed to fetch image: HTTP ${response.status}`);
          return null;
        }
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
        );
        const mimeType = blob.type || "image/png";
        ctx.log("info", `[AI] Fetched image: ${Math.round(base64.length / 1024)}KB, type: ${mimeType}`);
        return `data:${mimeType};base64,${base64}`;
      } catch (err) {
        ctx.log("error", `[AI] Failed to fetch image URL ${url}: ${err}`);
        return null;
      }
    };
    const readImageFile = async (filePath) => {
      if (!ctx.tauri) {
        ctx.log("warn", "[AI] Cannot read local file - Tauri not available");
        return null;
      }
      try {
        let normalizedPath = filePath;
        if (normalizedPath.startsWith("\\\\?\\")) {
          normalizedPath = normalizedPath.substring(4);
        }
        const fileContent = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
          path: normalizedPath,
          readAs: "base64"
        });
        if (fileContent.content) {
          let dataUrl = fileContent.content;
          if (!dataUrl.startsWith("data:")) {
            const ext = filePath.toLowerCase().split(".").pop() || "png";
            const mimeTypes = {
              "png": "image/png",
              "jpg": "image/jpeg",
              "jpeg": "image/jpeg",
              "gif": "image/gif",
              "webp": "image/webp",
              "bmp": "image/bmp"
            };
            const mime = mimeTypes[ext] || "image/png";
            dataUrl = `data:${mime};base64,${dataUrl}`;
          }
          ctx.log("info", `[AI] Read image file: ${filePath}`);
          return dataUrl;
        }
      } catch (err) {
        ctx.log("error", `[AI] Failed to read image file ${filePath}: ${err}`);
      }
      return null;
    };
    const inputItems = Array.isArray(input) ? input : input ? [input] : [];
    for (const item of inputItems) {
      if (typeof item !== "string" || !item) continue;
      if (item.startsWith("data:image")) {
        imageInputs.push(item);
      } else if (isImagePath(item)) {
        const dataUrl = await readImageFile(item);
        if (dataUrl) {
          imageInputs.push(dataUrl);
        }
      } else if (isImageUrl(item)) {
        const dataUrl = await fetchImageUrl(item);
        if (dataUrl) {
          imageInputs.push(dataUrl);
        }
      } else {
        finalPrompt = finalPrompt ? `${finalPrompt}

${item}` : item;
      }
    }
    const hasImages = imageInputs.length > 0;
    if (chunkRefs && chunkRefs.length > 0) {
      ctx.log("info", `[AI] Processing ${chunkRefs.length} chunk reference(s)...`);
    }
    const chunkRef = parseChunkRef(finalPrompt);
    if (chunkRef && ctx.tauri) {
      ctx.log("info", `[AI] Reading chunk ${chunkRef.index + 1}/${chunkRef.total} from file...`);
      try {
        finalPrompt = await readChunkContent(chunkRef);
        ctx.log("info", `[AI] Loaded chunk content (${finalPrompt.length} chars)`);
      } catch (error) {
        ctx.onNodeStatus?.(nodeId, "error");
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        ctx.log("error", `[AI] Failed to read chunk: ${errMsg}`);
        throw new Error(`Failed to read file chunk: ${errMsg}`);
      }
    }
    const fileRef = parseFileRef(finalPrompt);
    if (fileRef) {
      ctx.onNodeStatus?.(nodeId, "error");
      const sizeMB = (fileRef.size / 1024 / 1024).toFixed(2);
      ctx.log("error", `[AI] Cannot send large file (${sizeMB} MB) directly to AI.`);
      throw new Error(
        `File is too large (${sizeMB} MB) to send to AI directly. Please use a Text Chunker node to split it into smaller pieces first.`
      );
    }
    const apiKey = resolveApiKey(apiKeyConstant);
    if (!endpoint) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("No endpoint configured for AI request");
    }
    ctx.log("info", `[AI] Calling ${model} at ${endpoint}...`);
    try {
      const isAnthropic = endpoint.includes("anthropic") || endpoint.includes("claude");
      let headers = {
        "Content-Type": "application/json"
      };
      let body;
      const messages = [];
      let effectiveSystemPrompt = systemPrompt;
      if (messageHistory) {
        if (typeof messageHistory === "string" && messageHistory.length > 0) {
          const histStr = messageHistory.length > 5e3 ? "...(earlier truncated)...\n" + messageHistory.slice(-5e3) : messageHistory;
          effectiveSystemPrompt = effectiveSystemPrompt ? `${effectiveSystemPrompt}

## Previous Actions
${histStr}` : `## Previous Actions
${histStr}`;
          ctx.log("info", `[AI] Added history context to system prompt (${messageHistory.length} chars)`);
        } else if (Array.isArray(messageHistory) && messageHistory.length > 0) {
          for (const msg of messageHistory) {
            if (msg.role && msg.content) {
              messages.push({ role: msg.role, content: msg.content });
            }
          }
          ctx.log("info", `[AI] Added ${messageHistory.length} history message(s)`);
        }
      }
      if (effectiveSystemPrompt) {
        messages.push({ role: "system", content: effectiveSystemPrompt });
      }
      if (includeImages && hasImages) {
        const userContent = [];
        if (finalPrompt) {
          userContent.push({ type: "text", text: finalPrompt });
        }
        for (const imageData of imageInputs) {
          const resizedImage = await resizeImageIfNeeded(imageData, maxImageDimensionOverride, maxImageSizeKBOverride);
          userContent.push({
            type: "image_url",
            image_url: {
              url: resizedImage,
              detail: visionDetail || "auto"
            }
          });
        }
        ctx.log("info", `[AI] Including ${imageInputs.length} image(s) in request`);
        messages.push({ role: "user", content: userContent });
      } else {
        messages.push({ role: "user", content: finalPrompt });
      }
      if (isAnthropic) {
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        body = {
          model,
          max_tokens: maxTokens || 4096,
          messages: messages.filter((m) => m.role !== "system")
          // Anthropic uses system differently
        };
        if (systemPrompt) {
          body.system = systemPrompt;
        }
        if (temperature > 0) {
          body.temperature = temperature;
        }
      } else {
        if (apiKey) {
          headers["Authorization"] = `Bearer ${apiKey}`;
        }
        body = {
          model,
          messages,
          stream: false
        };
        if (maxTokens > 0) {
          body.max_tokens = maxTokens;
        }
        if (temperature > 0) {
          body.temperature = temperature;
        }
        if (responseFormat === "json") {
          body.response_format = { type: "json_object" };
        }
        if (endpoint.includes("localhost") || endpoint.includes("127.0.0.1")) {
          body.options = { num_ctx: 32768 };
        }
      }
      ctx.log("info", `[AI] Sending request...`);
      if (ctx.abortSignal?.aborted) {
        ctx.log("info", "[AI] Aborted by user before sending request");
        ctx.onNodeStatus?.(nodeId, "completed");
        return "__ABORT__";
      }
      if (ctx.useClaudeForAI && ctx.yieldForAI) {
        ctx.log("info", `[AI] Claude-as-AI mode: yielding for external response`);
        const historyArray = Array.isArray(messageHistory) ? messageHistory.filter((m) => m.role && m.content).map((m) => ({
          role: m.role,
          content: m.content
        })) : void 0;
        const externalResponse = await ctx.yieldForAI({
          nodeId,
          systemPrompt: effectiveSystemPrompt || "",
          userPrompt: finalPrompt,
          images: includeImages && hasImages ? imageInputs : void 0,
          history: historyArray
        });
        ctx.log("info", `[AI] Received external response (${externalResponse.length} chars)`);
        if (ctx.onStreamToken && streaming) {
          ctx.onStreamToken(nodeId, externalResponse);
        }
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[AI] Chat completed (via Claude-as-AI)`);
        return externalResponse;
      }
      const response = await ctx.secureFetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        nodeId,
        purpose: "AI/LLM chat request"
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      const responseText = await response.text();
      const data = JSON.parse(responseText);
      let content;
      if (isAnthropic) {
        content = data.content?.[0]?.text || JSON.stringify(data);
      } else {
        content = data.choices?.[0]?.message?.content || data.response || JSON.stringify(data);
      }
      ctx.log("info", `[AI] Response received (${content.length} chars)`);
      if (ctx.onStreamToken && streaming) {
        ctx.onStreamToken(nodeId, content);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[AI] Chat completed`);
      return content;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      const userMessage = getUserFriendlyError(errMsg, "AI chat");
      ctx.log("error", `[AI] ${userMessage}`);
      throw new Error(userMessage);
    }
  }
  async function vision(prompt, imageData, systemPrompt, model, nodeId, format, endpoint, apiKey, imageFormat, contextLength, maxTokens, maxImageDimension = 0, maxImageSizeKB = 0) {
    return chat(
      systemPrompt,
      prompt,
      imageData,
      endpoint,
      model,
      "",
      // apiKeyConstant not used, apiKey passed directly
      false,
      // streaming
      maxTokens,
      0.7,
      // temperature
      "text",
      // responseFormat
      imageFormat !== "none",
      // includeImages
      "auto",
      // visionDetail
      nodeId,
      [],
      // chunkRefs
      "",
      // messageHistory
      maxImageDimension,
      maxImageSizeKB
    );
  }
  async function request(body, endpoint, apiKey, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[AI] Aborted by user before custom request");
      return "__ABORT__";
    }
    validateEndpoint(endpoint, "Custom API request");
    validateContentLength(body, "Request body");
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[AI] Custom request to ${endpoint}...`);
    try {
      const headers = {
        "Content-Type": "application/json"
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const response = await ctx.secureFetch(endpoint, {
        method: "POST",
        headers,
        body,
        nodeId,
        purpose: "Custom API request"
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
      }
      const responseText = await response.text();
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[AI] Custom request complete (${responseText.length} chars)`);
      return responseText;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      const userMessage = getUserFriendlyError(errMsg, "custom request");
      ctx.log("error", `[AI] ${userMessage}`);
      throw new Error(userMessage);
    }
  }
  var CoreAIRuntime = {
    name: "AI",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[AI] Module initialized");
    },
    methods: {
      chat,
      vision,
      request
    },
    streaming: {
      chat: true,
      vision: true
    },
    async cleanup() {
      ctx?.log?.("info", "[AI] Module cleanup");
    }
  };
  var runtime_default = CoreAIRuntime;

  // ../zipp-core/modules/core-ai/compiler.ts
  var CoreAICompiler = {
    name: "AI",
    getNodeTypes() {
      return ["ai_llm"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, isInLoop, loopStartId, escapeString, sanitizeId, debugEnabled } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const debug = debugEnabled ?? false;
      if (nodeType !== "ai_llm") {
        return null;
      }
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("prompt") || "null";
      const imageInputCount = Number(data.imageInputCount) || 0;
      const imageVars = [];
      const legacyImage = inputs.get("image");
      if (legacyImage) {
        imageVars.push(legacyImage);
      }
      for (let i = 0; i < imageInputCount; i++) {
        const imageVar = inputs.get(`image_${i}`);
        if (imageVar) {
          imageVars.push(imageVar);
        }
      }
      const historyVar = inputs.get("history") || "null";
      if (debug) {
        const inputsDebug = Array.from(inputs.entries()).map(([k, v]) => `${k}=${v}`).join(", ");
        console.log(`[AI Compiler] Node ${node.id}: inputs=[${inputsDebug}], resolved inputVar=${inputVar}, imageVars=[${imageVars.join(", ")}], historyVar=${historyVar}`);
      }
      let systemPrompt = escapeString(String(data.systemPrompt || ""));
      let userPrompt = escapeString(String(data.prompt || ""));
      if (isInLoop && loopStartId) {
        const historyStrVar = `${sanitizeId(loopStartId)}_history_str`;
        systemPrompt = systemPrompt.replace(/\{\{history\}\}/g, `" + ${historyStrVar} + "`);
        userPrompt = userPrompt.replace(/\{\{history\}\}/g, `" + ${historyStrVar} + "`);
      }
      const projectSettings = data.projectSettings;
      const endpoint = escapeString(String(data.endpoint || projectSettings?.defaultAIEndpoint || ""));
      const model = escapeString(String(data.model || projectSettings?.defaultAIModel || ""));
      const apiKeyConstant = escapeString(String(data.apiKeyConstant || data.apiKey || projectSettings?.defaultAIApiKeyConstant || "OPENAI_API_KEY"));
      const streaming = data.streaming !== false;
      const maxTokens = Number(data.maxTokens) || 0;
      const temperature = Number(data.temperature) || 0.7;
      const responseFormat = escapeString(String(data.responseFormat || "text"));
      const includeImages = data.includeImages !== false;
      const visionDetail = escapeString(String(data.visionDetail || "auto"));
      const chunkRefVar = `_chunk_refs_${sanitizedId}`;
      let code = `
  // --- Node: ${node.id} (ai_llm) ---
  let ${chunkRefVar} = [];`;
      if (apiKeyConstant.match(/^(sk-|anthropic-|gsk_|AIza)/)) {
        throw new Error(
          `[Security Error] Node ${node.id}: Raw API key detected in settings. For security, API keys must be stored in Project Constants (not directly in nodes). Please create a constant like 'OPENAI_API_KEY' in Project Settings and reference it here.`
        );
      }
      for (const [handleId, sourceVar] of inputs) {
        if (handleId.startsWith("chunk_ref_")) {
          code += `
  if (${sourceVar} && ${sourceVar}.documentId) {
    ${chunkRefVar}.push(${sourceVar});
  }`;
        }
      }
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
      const hasStaticUserPrompt = userPrompt.trim().length > 0;
      const userPromptExpr = hasStaticUserPrompt ? `"${userPrompt}" + (${inputVar} ? "\\n\\n" + String(${inputVar}) : "")` : `${inputVar} ? String(${inputVar}) : ""`;
      const historyMessagesVar = `_history_messages_${sanitizedId}`;
      let imagesExpr;
      if (imageVars.length === 0) {
        imagesExpr = "null";
      } else if (imageVars.length === 1) {
        imagesExpr = imageVars[0];
      } else {
        imagesExpr = `[${imageVars.join(", ")}]`;
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
    }
  };
  var compiler_default = CoreAICompiler;

  // ../zipp-core/modules/core-ai/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    AILLMNode: () => AILLMNode_default
  });

  // ../zipp-core/modules/core-ai/ui/AILLMNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  function useCallbackRefs(data) {
    const refs = {
      onModelChange: (0, import_react.useRef)(data.onModelChange),
      onSystemPromptChange: (0, import_react.useRef)(data.onSystemPromptChange),
      onEndpointChange: (0, import_react.useRef)(data.onEndpointChange),
      onApiKeyChange: (0, import_react.useRef)(data.onApiKeyChange),
      onApiKeyConstantChange: (0, import_react.useRef)(data.onApiKeyConstantChange),
      onHeadersChange: (0, import_react.useRef)(data.onHeadersChange),
      onImageFormatChange: (0, import_react.useRef)(data.onImageFormatChange),
      onRequestFormatChange: (0, import_react.useRef)(data.onRequestFormatChange),
      onProviderChange: (0, import_react.useRef)(data.onProviderChange),
      onContextLengthChange: (0, import_react.useRef)(data.onContextLengthChange),
      onMaxTokensChange: (0, import_react.useRef)(data.onMaxTokensChange),
      onImageInputCountChange: (0, import_react.useRef)(data.onImageInputCountChange),
      onCollapsedChange: (0, import_react.useRef)(data.onCollapsedChange)
    };
    (0, import_react.useEffect)(() => {
      refs.onModelChange.current = data.onModelChange;
      refs.onSystemPromptChange.current = data.onSystemPromptChange;
      refs.onEndpointChange.current = data.onEndpointChange;
      refs.onApiKeyChange.current = data.onApiKeyChange;
      refs.onApiKeyConstantChange.current = data.onApiKeyConstantChange;
      refs.onHeadersChange.current = data.onHeadersChange;
      refs.onImageFormatChange.current = data.onImageFormatChange;
      refs.onRequestFormatChange.current = data.onRequestFormatChange;
      refs.onProviderChange.current = data.onProviderChange;
      refs.onContextLengthChange.current = data.onContextLengthChange;
      refs.onMaxTokensChange.current = data.onMaxTokensChange;
      refs.onImageInputCountChange.current = data.onImageInputCountChange;
      refs.onCollapsedChange.current = data.onCollapsedChange;
    });
    return refs;
  }
  var AI_PROVIDERS = [
    { value: "openai", label: "OpenAI", endpoint: "https://api.openai.com/v1/chat/completions", model: "gpt-4o", apiKeyConstant: "OPENAI_API_KEY", requestFormat: "openai" },
    { value: "anthropic", label: "Anthropic", endpoint: "https://api.anthropic.com/v1/messages", model: "claude-sonnet-4-20250514", apiKeyConstant: "ANTHROPIC_API_KEY", requestFormat: "anthropic" },
    { value: "google", label: "Google AI", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", model: "gemini-2.0-flash", apiKeyConstant: "GOOGLE_API_KEY", requestFormat: "openai" },
    { value: "openrouter", label: "OpenRouter", endpoint: "https://openrouter.ai/api/v1/chat/completions", model: "openai/gpt-4o", apiKeyConstant: "OPENROUTER_API_KEY", requestFormat: "openai" },
    { value: "groq", label: "Groq", endpoint: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile", apiKeyConstant: "GROQ_API_KEY", requestFormat: "openai" },
    { value: "ollama", label: "Ollama (Local)", endpoint: "http://localhost:11434/v1/chat/completions", model: "llama3.2", apiKeyConstant: "", requestFormat: "openai" },
    { value: "lmstudio", label: "LM Studio (Local)", endpoint: "http://localhost:1234/v1/chat/completions", model: "local-model", apiKeyConstant: "", requestFormat: "openai" },
    { value: "custom", label: "Custom", endpoint: "", model: "", apiKeyConstant: "", requestFormat: "openai" }
  ];
  var IMAGE_FORMATS = [
    { value: "none", label: "None", description: "No image input" },
    { value: "base64_inline", label: "Base64 Inline", description: "Image as base64 data URL in message content" },
    { value: "base64_separate", label: "Base64 Separate", description: "Base64 in separate image_url field" },
    { value: "url", label: "URL", description: "Image URL reference in content" },
    { value: "binary", label: "Binary", description: "Raw binary data (for multipart requests)" }
  ];
  var AIIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "currentColor", viewBox: "0 0 20 20", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M11 3a1 1 0 10-2 0v1a1 1 0 102 0V3zM15.657 5.757a1 1 0 00-1.414-1.414l-.707.707a1 1 0 001.414 1.414l.707-.707zM18 10a1 1 0 01-1 1h-1a1 1 0 110-2h1a1 1 0 011 1zM5.05 6.464A1 1 0 106.464 5.05l-.707-.707a1 1 0 00-1.414 1.414l.707.707zM5 10a1 1 0 01-1 1H3a1 1 0 110-2h1a1 1 0 011 1zM8 16v-1h4v1a2 2 0 11-4 0zM12 14c.015-.34.208-.646.477-.859a4 4 0 10-4.954 0c.27.213.462.519.476.859h4.002z" }) });
  function AILLMNode({ data }) {
    const nodeId = (0, import_react2.useNodeId)();
    const updateNodeInternals = (0, import_react2.useUpdateNodeInternals)();
    const { size, handleResizeStart } = (0, import_zipp_ui_components.useNodeResize)({
      initialWidth: 320,
      initialHeight: 420,
      constraints: { minWidth: 280, maxWidth: 500, minHeight: 350, maxHeight: 700 }
    });
    const [showAdvanced, setShowAdvanced] = (0, import_react.useState)(
      !!(data.headers || data.imageFormat || data.imageInputCount && data.imageInputCount > 0)
    );
    const callbackRefs = useCallbackRefs(data);
    const imageInputCount = data.imageInputCount || 0;
    (0, import_react.useEffect)(() => {
      if (nodeId) {
        updateNodeInternals(nodeId);
      }
    }, [nodeId, updateNodeInternals, imageInputCount]);
    (0, import_react.useEffect)(() => {
      const providerValue = data.provider;
      if (!providerValue) return;
      const providerConfig = AI_PROVIDERS.find((p) => p.value === providerValue);
      if (providerConfig && providerValue !== "custom") {
        let endpoint = providerConfig.endpoint;
        if (providerValue === "ollama") {
          const baseUrl = data.projectSettings?.ollamaEndpoint || "http://localhost:11434";
          endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
        } else if (providerValue === "lmstudio") {
          const baseUrl = data.projectSettings?.lmstudioEndpoint || "http://localhost:1234";
          endpoint = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
        }
        if (data.endpoint !== endpoint && callbackRefs.onEndpointChange.current) {
          callbackRefs.onEndpointChange.current(endpoint);
        }
        if (data.model !== providerConfig.model && callbackRefs.onModelChange.current) {
          callbackRefs.onModelChange.current(providerConfig.model);
        }
        if (data.requestFormat !== providerConfig.requestFormat && callbackRefs.onRequestFormatChange.current) {
          callbackRefs.onRequestFormatChange.current(providerConfig.requestFormat);
        }
        if (providerConfig.apiKeyConstant && data.apiKeyConstant !== providerConfig.apiKeyConstant && callbackRefs.onApiKeyConstantChange.current) {
          callbackRefs.onApiKeyConstantChange.current(providerConfig.apiKeyConstant);
        }
      }
    }, [data.provider, data.projectSettings?.ollamaEndpoint, data.projectSettings?.lmstudioEndpoint]);
    const handleModelChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onModelChange.current?.(e.target.value);
    }, []);
    const handleSystemPromptChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onSystemPromptChange.current?.(e.target.value);
    }, []);
    const handleEndpointChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onEndpointChange.current?.(e.target.value);
    }, []);
    const handleApiKeyChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onApiKeyChange.current?.(e.target.value);
    }, []);
    const handleApiKeyConstantChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onApiKeyConstantChange.current?.(e.target.value);
    }, []);
    const handleHeadersChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onHeadersChange.current?.(e.target.value);
    }, []);
    const handleImageFormatChange = (0, import_react.useCallback)((e) => {
      callbackRefs.onImageFormatChange.current?.(e.target.value);
    }, []);
    const handleContextLengthChange = (0, import_react.useCallback)((e) => {
      const value = parseInt(e.target.value) || 0;
      callbackRefs.onContextLengthChange.current?.(value);
    }, []);
    const handleMaxTokensChange = (0, import_react.useCallback)((e) => {
      const value = parseInt(e.target.value) || 0;
      callbackRefs.onMaxTokensChange.current?.(value);
    }, []);
    const handleProviderChange = (0, import_react.useCallback)((e) => {
      const providerValue = e.target.value;
      callbackRefs.onProviderChange.current?.(providerValue);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      callbackRefs.onCollapsedChange.current?.(collapsed);
    }, []);
    const defaultProvider = data.projectSettings?.defaultAIProvider || "openai";
    const defaultEndpoint = data.projectSettings?.defaultAIEndpoint || "";
    const defaultModel = data.projectSettings?.defaultAIModel || "";
    const defaultApiKeyConstant = data.projectSettings?.defaultAIApiKeyConstant || "";
    const provider = data.provider || defaultProvider;
    const imageFormat = data.imageFormat || "none";
    const isCustomProvider = provider === "custom";
    const projectConstants = data.projectConstants || [];
    const apiKeyConstants = projectConstants.filter((c) => c.category === "api_key");
    const showBody = data.showBodyProperties !== false;
    const handleAddImageInput = (0, import_react.useCallback)(() => {
      const newCount = Math.min((data.imageInputCount || 0) + 1, 10);
      callbackRefs.onImageInputCountChange.current?.(newCount);
    }, [data.imageInputCount]);
    const handleRemoveImageInput = (0, import_react.useCallback)(() => {
      const newCount = Math.max((data.imageInputCount || 0) - 1, 0);
      callbackRefs.onImageInputCountChange.current?.(newCount);
    }, [data.imageInputCount]);
    const effectiveEndpoint = data.endpoint || defaultEndpoint;
    const effectiveModel = data.model || defaultModel;
    const effectiveApiKeyConstant = data.apiKeyConstant || defaultApiKeyConstant;
    const validationIssues = (0, import_react.useMemo)(() => {
      const issues = [];
      if (!effectiveEndpoint && isCustomProvider) {
        issues.push({ field: "Endpoint", message: "Required for custom provider" });
      }
      if (!effectiveModel && isCustomProvider) {
        issues.push({ field: "Model", message: "Required for custom provider" });
      }
      return issues;
    }, [effectiveEndpoint, effectiveModel, isCustomProvider]);
    const providerLabel = AI_PROVIDERS.find((p) => p.value === provider)?.label || provider;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 space-y-0.5", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "truncate text-purple-400 font-medium", children: providerLabel }),
      effectiveModel && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "truncate text-xs text-slate-500", children: effectiveModel })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => {
      const handles = [
        { id: "prompt", type: "target", position: import_react2.Position.Left, color: "!bg-blue-500", label: "prompt", labelColor: "text-blue-400", size: "lg" },
        { id: "headers", type: "target", position: import_react2.Position.Left, color: "!bg-orange-500", label: "headers", labelColor: "text-orange-400", size: "sm" },
        { id: "apiKey", type: "target", position: import_react2.Position.Left, color: "!bg-yellow-500", label: "api key", labelColor: "text-yellow-400", size: "sm" },
        { id: "history", type: "target", position: import_react2.Position.Left, color: "!bg-purple-400", label: "history", labelColor: "text-purple-400", size: "sm" }
      ];
      for (let i = 0; i < imageInputCount; i++) {
        handles.push({
          id: i === 0 ? "image" : `image_${i}`,
          type: "target",
          position: import_react2.Position.Left,
          color: "!bg-pink-500",
          label: imageInputCount === 1 ? "image" : `image ${i + 1}`,
          labelColor: "text-pink-400",
          size: "sm"
        });
      }
      return handles;
    }, [imageInputCount]);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "response", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "s")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity",
          onMouseDown: (e) => handleResizeStart(e, "se"),
          children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-slate-500", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22Z" }) })
        }
      )
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "AI / LLM",
        color: "purple",
        icon: AIIcon,
        width: size.width,
        collapsedWidth: 140,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: [
          showBody && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Provider" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  value: provider,
                  onChange: handleProviderChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: AI_PROVIDERS.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: p.value, children: p.label }, p.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Model ",
                !isCustomProvider && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(override)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  placeholder: AI_PROVIDERS.find((p) => p.value === provider)?.model || "gpt-4o",
                  value: data.model || "",
                  onChange: handleModelChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "API Key ",
                apiKeyConstants.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(from settings)" })
              ] }),
              apiKeyConstants.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  value: effectiveApiKeyConstant,
                  onChange: handleApiKeyConstantChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "", children: "None / Manual" }),
                    apiKeyConstants.map((c) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("option", { value: c.key, children: [
                      c.name,
                      " (",
                      c.key,
                      ")"
                    ] }, c.id))
                  ]
                }
              ) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "password",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  placeholder: "sk-...",
                  value: data.apiKey || "",
                  onChange: handleApiKeyChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "System Prompt" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500",
                  rows: 3,
                  placeholder: "You are a helpful assistant...",
                  value: data.systemPrompt || "",
                  onChange: handleSystemPromptChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: () => setShowAdvanced(!showAdvanced),
              className: "w-full flex items-center justify-between px-2 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 transition-colors",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Advanced" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "svg",
                  {
                    className: `w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`,
                    fill: "none",
                    stroke: "currentColor",
                    viewBox: "0 0 24 24",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" })
                  }
                )
              ]
            }
          ),
          showAdvanced && showBody && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "space-y-3 pt-1 border-t border-slate-300 dark:border-slate-700", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Endpoint URL ",
                !isCustomProvider && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(override)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: AI_PROVIDERS.find((p) => p.value === provider)?.endpoint || "https://api.openai.com/v1/chat/completions",
                  value: data.endpoint || "",
                  onChange: handleEndpointChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            apiKeyConstants.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Manual API Key ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(override)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "password",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  placeholder: "sk-...",
                  value: data.apiKey || "",
                  onChange: handleApiKeyChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Image Inputs" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleRemoveImageInput,
                    disabled: imageInputCount === 0,
                    className: "nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M20 12H4" }) })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "flex-1 text-center text-sm text-slate-700 dark:text-slate-300", children: [
                  imageInputCount,
                  " image",
                  imageInputCount !== 1 ? "s" : ""
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleAddImageInput,
                    disabled: imageInputCount >= 10,
                    className: "nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 4v16m8-8H4" }) })
                  }
                )
              ] }),
              imageInputCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-slate-500 mt-1", children: "Images will be sent to the AI for vision analysis" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Image Input Format" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  value: imageFormat,
                  onChange: handleImageFormatChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: IMAGE_FORMATS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: f.value, children: f.label }, f.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Context Length (0 = default)" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: "32768",
                  value: data.contextLength || 0,
                  min: 0,
                  max: 131072,
                  step: 1024,
                  onChange: handleContextLengthChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Max Tokens (0 = default 4096)" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: "4096",
                  value: data.maxTokens || 0,
                  min: 0,
                  max: 32768,
                  step: 256,
                  onChange: handleMaxTokensChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Headers (JSON)" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500 font-mono",
                  rows: 2,
                  placeholder: '{"X-Custom": "value"}',
                  value: data.headers || "",
                  onChange: handleHeadersChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] })
        ]
      }
    );
  }
  var AILLMNode_default = (0, import_react.memo)(AILLMNode);

  // ../zipp-core/modules/core-ai/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
