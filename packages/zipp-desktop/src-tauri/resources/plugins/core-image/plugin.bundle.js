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

  // ../zipp-core/modules/core-image/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-image/runtime.ts
  var ctx;
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function resolveApiKey(apiKeyConstant) {
    if (!apiKeyConstant) return "";
    if (ctx.getConstant) {
      const key = ctx.getConstant(apiKeyConstant);
      if (key) return key;
    }
    const settingKey = ctx.getModuleSetting(apiKeyConstant);
    if (typeof settingKey === "string") return settingKey;
    return "";
  }
  var DEFAULT_MAX_IMAGE_DIMENSION = 1024;
  var DEFAULT_MAX_IMAGE_SIZE_KB = 200;
  async function resizeImageIfNeeded(dataUrl, maxDimension = 0, maxSizeKB = 0) {
    if (!dataUrl.startsWith("data:image")) {
      return dataUrl;
    }
    const effectiveMaxDimension = maxDimension > 0 ? maxDimension : DEFAULT_MAX_IMAGE_DIMENSION;
    const effectiveMaxSizeKB = maxSizeKB > 0 ? maxSizeKB : DEFAULT_MAX_IMAGE_SIZE_KB;
    if (ctx.tauri) {
      try {
        const result = await ctx.tauri.invoke("resize_image", {
          dataUrl,
          maxDimension: effectiveMaxDimension,
          maxSizeKb: effectiveMaxSizeKB
        });
        if (result.success && result.dataUrl) {
          ctx.log("info", `[ImageGen] Image resized: ${result.originalWidth}x${result.originalHeight} -> ${result.newWidth}x${result.newHeight}, ${result.originalSizeKb}KB -> ${result.newSizeKb}KB`);
          return result.dataUrl;
        } else if (result.error) {
          ctx.log("warn", `[ImageGen] Rust resize failed: ${result.error}, falling back to canvas`);
        }
      } catch (err) {
        ctx.log("warn", `[ImageGen] Rust resize not available: ${err}, falling back to canvas`);
      }
    }
    if (typeof document === "undefined" || typeof Image === "undefined") {
      ctx.log("info", "[ImageGen] Canvas not available, skipping image resize");
      return dataUrl;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        const originalSizeKB = Math.round(dataUrl.length / 1024);
        const dimensionsOk = width <= effectiveMaxDimension && height <= effectiveMaxDimension;
        const sizeOk = originalSizeKB <= effectiveMaxSizeKB;
        const isPng = dataUrl.startsWith("data:image/png");
        if (dimensionsOk && sizeOk && !isPng) {
          ctx.log("info", `[ImageGen] Image ${width}x${height} (${originalSizeKB}KB) within limits`);
          resolve(dataUrl);
          return;
        }
        let newWidth;
        let newHeight;
        if (width > height) {
          newWidth = Math.min(width, effectiveMaxDimension);
          newHeight = Math.round(height * (newWidth / width));
        } else {
          newHeight = Math.min(height, effectiveMaxDimension);
          newWidth = Math.round(width * (newHeight / height));
        }
        if (originalSizeKB > effectiveMaxSizeKB) {
          const sizeRatio = originalSizeKB / effectiveMaxSizeKB;
          const scaleFactor = 1 / Math.sqrt(sizeRatio);
          newWidth = Math.max(256, Math.round(newWidth * scaleFactor));
          newHeight = Math.max(256, Math.round(newHeight * scaleFactor));
        }
        ctx.log("info", `[ImageGen] Resizing image from ${width}x${height} (${originalSizeKB}KB) to ${newWidth}x${newHeight}`);
        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(img, 0, 0, newWidth, newHeight);
        let resizedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        let attempts = 0;
        let quality = 0.85;
        while (resizedDataUrl.length / 1024 > effectiveMaxSizeKB && attempts < 3 && quality > 0.3) {
          quality -= 0.15;
          resizedDataUrl = canvas.toDataURL("image/jpeg", quality);
          attempts++;
        }
        const newSizeKB = Math.round(resizedDataUrl.length / 1024);
        ctx.log("info", `[ImageGen] Image resized: ${originalSizeKB}KB -> ${newSizeKB}KB`);
        resolve(resizedDataUrl);
      };
      img.onerror = () => {
        ctx.log("error", "[ImageGen] Failed to load image for resizing");
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }
  async function generateOpenAI(prompt, endpoint, model, width, height, apiKey) {
    ctx.log("info", `[ImageGen] OpenAI request to ${endpoint}`);
    const size = `${width}x${height}`;
    const body = {
      model: model || "dall-e-3",
      prompt,
      n: 1,
      size
    };
    const response = await ctx.secureFetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      purpose: "OpenAI image generation"
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    if (data.data?.[0]?.url) {
      return data.data[0].url;
    } else if (data.data?.[0]?.b64_json) {
      return `data:image/png;base64,${data.data[0].b64_json}`;
    }
    throw new Error("No image in OpenAI response");
  }
  async function generateGemini(prompt, endpoint, apiKey) {
    ctx.log("info", `[ImageGen] Gemini request`);
    const url = `${endpoint}?key=${apiKey}`;
    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"]
      }
    };
    const response = await ctx.secureFetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      purpose: "Gemini image generation"
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    const candidates = data.candidates || [];
    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
        }
      }
    }
    throw new Error("No image in Gemini response");
  }
  async function waitForComfyUIImage(endpoint, promptId, outputNodeId, maxAttempts = 3600) {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    for (let i = 0; i < maxAttempts; i++) {
      if (ctx.abortSignal?.aborted) {
        ctx.log("info", "[ImageGen] Aborted by user");
        throw new Error("Image generation aborted by user");
      }
      await delay(1e3);
      try {
        const historyResponse = await ctx.secureFetch(`${endpoint}/history/${promptId}`, {
          method: "GET",
          purpose: "ComfyUI polling"
        });
        if (!historyResponse.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= maxConsecutiveErrors) {
            throw new Error(`ComfyUI history endpoint failed ${consecutiveErrors} times consecutively`);
          }
          continue;
        }
        consecutiveErrors = 0;
        const history = await historyResponse.json();
        const promptHistory = history[promptId];
        if (promptHistory && promptHistory.outputs) {
          const saveImageOutput = promptHistory.outputs[outputNodeId];
          if (saveImageOutput && saveImageOutput.images && saveImageOutput.images.length > 0) {
            const image = saveImageOutput.images[0];
            const imageUrl = `${endpoint}/view?filename=${encodeURIComponent(image.filename)}&subfolder=${encodeURIComponent(image.subfolder || "")}&type=${encodeURIComponent(image.type || "output")}`;
            return imageUrl;
          }
        }
        if (i % 5 === 0) {
          ctx.log("info", `[ImageGen] Still generating... (${i}s)`);
        }
      } catch (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`ComfyUI polling failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }
    throw new Error(`Timeout waiting for image generation after ${maxAttempts} seconds`);
  }
  async function uploadImageToComfyUI(endpoint, imageData, filename) {
    let blob;
    let mimeType = "image/png";
    if (imageData.startsWith("data:")) {
      const parts = imageData.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const base64Data = parts[1];
      const byteChars = atob(base64Data);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
    } else if (imageData.startsWith("http")) {
      const response2 = await ctx.secureFetch(imageData, { purpose: "Fetch image for ComfyUI" });
      blob = await response2.blob();
      mimeType = blob.type || "image/png";
    } else {
      throw new Error("Unsupported image format for ComfyUI upload");
    }
    const extMap = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/bmp": "bmp"
    };
    const ext = extMap[mimeType] || "png";
    const baseFilename = filename.replace(/\.[^.]+$/, "");
    const finalFilename = `${baseFilename}.${ext}`;
    ctx.log("info", `[ImageGen] Uploading image to ComfyUI: ${finalFilename} (${mimeType}, ${blob.size} bytes)`);
    const formData = new FormData();
    formData.append("image", blob, finalFilename);
    formData.append("type", "input");
    formData.append("overwrite", "true");
    const response = await ctx.secureFetch(`${endpoint}/upload/image`, {
      method: "POST",
      body: formData,
      purpose: "ComfyUI image upload"
    });
    if (!response.ok) {
      const errorText = await response.text();
      ctx.log("error", `[ImageGen] ComfyUI upload failed: ${response.status} - ${errorText}`);
      throw new Error(`ComfyUI upload error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    ctx.log("info", `[ImageGen] ComfyUI upload response: ${JSON.stringify(data)}`);
    return data.name || finalFilename;
  }
  async function generateComfyUI(workflowJson, endpoint, promptOverride, primaryPromptNodeId, imageInputs, imageInputNodeIds, imageInputConfigs, seedMode, fixedSeed, allImageNodeIds, maxImageDimension = 0, maxImageSizeKB = 0) {
    ctx.log("info", `[ImageGen] ComfyUI request to ${endpoint}`);
    let workflow;
    try {
      workflow = JSON.parse(workflowJson);
    } catch {
      throw new Error("ComfyUI requires a valid JSON workflow as input");
    }
    if (promptOverride && primaryPromptNodeId && workflow[primaryPromptNodeId]) {
      const node = workflow[primaryPromptNodeId];
      const textKeys = ["text", "prompt", "string", "positive"];
      for (const key of textKeys) {
        if (typeof node.inputs?.[key] === "string") {
          ctx.log("info", `[ImageGen] Overriding prompt in node ${primaryPromptNodeId}.${key}`);
          node.inputs[key] = promptOverride;
          break;
        }
      }
    }
    const selectedNodeIds = new Set(imageInputConfigs?.map((c) => c.nodeId) || imageInputNodeIds || []);
    const nodesToBypass = /* @__PURE__ */ new Set();
    if (imageInputConfigs && imageInputs) {
      for (let i = 0; i < imageInputConfigs.length; i++) {
        const config = imageInputConfigs[i];
        const imageInput = imageInputs[i];
        const hasInput = imageInput !== void 0 && imageInput !== null && imageInput !== "";
        if (!hasInput && config.allowBypass) {
          ctx.log("info", `[ImageGen] Node ${config.nodeId} (${config.title}) has no input and allowBypass=true - will be bypassed`);
          nodesToBypass.add(config.nodeId);
          selectedNodeIds.delete(config.nodeId);
        }
      }
    }
    if (allImageNodeIds && allImageNodeIds.length > 0) {
      for (const nodeId of allImageNodeIds) {
        if (!selectedNodeIds.has(nodeId)) {
          nodesToBypass.add(nodeId);
        }
      }
    }
    for (const nodeId of nodesToBypass) {
      if (workflow[nodeId]) {
        ctx.log("info", `[ImageGen] Bypassing (removing) image node: ${nodeId}`);
        delete workflow[nodeId];
        for (const [, otherNode] of Object.entries(workflow)) {
          const node = otherNode;
          if (node.inputs) {
            for (const [inputKey, inputValue] of Object.entries(node.inputs)) {
              if (Array.isArray(inputValue) && inputValue[0] === nodeId) {
                ctx.log("info", `[ImageGen] Removing reference to bypassed node ${nodeId} from input ${inputKey}`);
                delete node.inputs[inputKey];
              }
            }
          }
        }
      }
    }
    const effectiveNodeIds = (imageInputConfigs?.map((c) => c.nodeId) || imageInputNodeIds || []).filter((nodeId) => !nodesToBypass.has(nodeId));
    ctx.log("info", `[ImageGen] Processing ${effectiveNodeIds.length} image inputs, imageInputs=${JSON.stringify(imageInputs)?.substring(0, 200)}`);
    if (imageInputs && effectiveNodeIds.length > 0) {
      for (let i = 0; i < effectiveNodeIds.length; i++) {
        const nodeId = effectiveNodeIds[i];
        const imageInput = imageInputs[i];
        const config = imageInputConfigs?.[i];
        ctx.log("info", `[ImageGen] Image ${i}: nodeId=${nodeId}, input=${JSON.stringify(imageInput)?.substring(0, 100)}, config=${JSON.stringify(config)}`);
        if (!nodeId || !workflow[nodeId]) {
          ctx.log("warn", `[ImageGen] Image ${i}: skipping - nodeId missing or not in workflow`);
          continue;
        }
        const hasInput = imageInput !== void 0 && imageInput !== null && imageInput !== "";
        if (!hasInput) {
          const title = config?.title || `Image ${i}`;
          ctx.log("info", `[ImageGen] Image input ${i} (${title}) not connected - using workflow default`);
          continue;
        }
        const node = workflow[nodeId];
        const nodeType = node.class_type;
        const source = extractImageSource(imageInput);
        let base64Data;
        if (source.dataUrl) {
          base64Data = source.dataUrl;
        } else if (source.url) {
          try {
            const response2 = await ctx.secureFetch(source.url, { purpose: "Fetch image for ComfyUI" });
            const blob = await response2.blob();
            const arrayBuffer = await blob.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = "";
            for (let j = 0; j < bytes.length; j++) {
              binary += String.fromCharCode(bytes[j]);
            }
            const base64 = btoa(binary);
            const mime = blob.type || "image/png";
            base64Data = `data:${mime};base64,${base64}`;
            ctx.log("info", `[ImageGen] Fetched image from URL`);
          } catch (err) {
            ctx.log("error", `[ImageGen] Failed to fetch image from URL: ${err}`);
            continue;
          }
        } else if (source.path) {
          if (ctx.tauri) {
            try {
              let normalizedPath = source.path;
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
                  const ext = source.path.toLowerCase().split(".").pop() || "png";
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
                base64Data = dataUrl;
                ctx.log("info", `[ImageGen] Read local file: ${source.path}`);
              }
            } catch (err) {
              ctx.log("error", `[ImageGen] Failed to read local file: ${err}`);
              continue;
            }
          } else {
            ctx.log("warn", `[ImageGen] No Tauri available, cannot read local file`);
            continue;
          }
        }
        if (base64Data) {
          const resizedData = await resizeImageIfNeeded(base64Data, maxImageDimension, maxImageSizeKB);
          const filename = `zipp_input_${nodeId}_${Date.now()}.png`;
          try {
            const uploadedFilename = await uploadImageToComfyUI(endpoint, resizedData, filename);
            if (nodeType === "LoadImage" || nodeType === "LoadImageMask") {
              node.inputs.image = uploadedFilename;
              ctx.log("info", `[ImageGen] Uploaded image for node ${nodeId}: ${uploadedFilename}`);
            } else if (nodeType === "LoadImageBase64") {
              node.inputs.image_base64 = resizedData;
            }
          } catch (err) {
            ctx.log("error", `[ImageGen] Failed to upload image: ${err}`);
            continue;
          }
        }
      }
    }
    const effectiveSeedMode = seedMode || "random";
    ctx.log("info", `[ImageGen] Seed mode: ${effectiveSeedMode}${effectiveSeedMode === "fixed" ? ` (${fixedSeed})` : ""}`);
    for (const [, nodeValue] of Object.entries(workflow)) {
      const node = nodeValue;
      if (!node.inputs) continue;
      const seedKeys = ["seed", "noise_seed"];
      for (const key of seedKeys) {
        if (node.inputs[key] !== void 0) {
          switch (effectiveSeedMode) {
            case "random":
              node.inputs[key] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
              break;
            case "fixed":
              if (fixedSeed !== null && fixedSeed !== void 0) {
                node.inputs[key] = fixedSeed;
              }
              break;
            case "workflow":
              if (node.inputs[key] === -1) {
                node.inputs[key] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
              }
              break;
          }
        }
      }
    }
    let outputNodeId = "9";
    for (const [nodeKey, nodeValue] of Object.entries(workflow)) {
      const node = nodeValue;
      if (node.class_type === "SaveImage" || node.class_type === "PreviewImage") {
        outputNodeId = nodeKey;
        ctx.log("info", `[ImageGen] Auto-detected output node: ${outputNodeId}`);
        break;
      }
    }
    const response = await ctx.secureFetch(`${endpoint}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
      purpose: "ComfyUI image generation"
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ComfyUI error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    const promptId = data.prompt_id;
    ctx.log("info", `[ImageGen] Queued with ID: ${promptId}, waiting...`);
    return await waitForComfyUIImage(endpoint, promptId, outputNodeId);
  }
  async function generateCustom(prompt, endpoint, apiKey) {
    ctx.log("info", `[ImageGen] Custom API request to ${endpoint}`);
    const headers = {
      "Content-Type": "application/json"
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    let body = prompt;
    try {
      JSON.parse(prompt);
    } catch {
      body = JSON.stringify({ prompt });
    }
    const response = await ctx.secureFetch(endpoint, {
      method: "POST",
      headers,
      body,
      purpose: "Custom image generation"
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Custom API error: ${response.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await response.json();
    if (data.url) return data.url;
    if (data.image_url) return data.image_url;
    if (data.data?.[0]?.url) return data.data[0].url;
    if (data.data?.[0]?.b64_json) return `data:image/png;base64,${data.data[0].b64_json}`;
    if (data.images?.[0]) {
      const img = data.images[0];
      if (typeof img === "string") {
        if (img.startsWith("http")) return img;
        if (img.startsWith("data:")) return img;
        return `data:image/png;base64,${img}`;
      }
    }
    if (data.output?.[0]) return data.output[0];
    throw new Error("Could not find image in custom API response");
  }
  async function generate(prompt, input, endpoint, model, apiKeyConstant, width, height, steps, apiFormat, nodeId, comfyWorkflow, comfyPrimaryPromptNodeId, comfyImageInputNodeIds, imageInputs, comfyImageInputConfigs, comfySeedMode, comfyFixedSeed, comfyAllImageNodeIds, maxImageDimension = 0, maxImageSizeKB = 0) {
    ctx.onNodeStatus?.(nodeId, "running");
    let finalPrompt = prompt;
    if (typeof input === "string" && input) {
      finalPrompt = finalPrompt ? `${finalPrompt}
${input}` : input;
    }
    ctx.log("info", `[ImageGen] Generating with ${apiFormat}: "${finalPrompt.substring(0, 50)}..."`);
    if (!endpoint) {
      ctx.log("info", "[ImageGen] No endpoint configured, using mock response");
      await delay(500);
      const mockResult = `mock://generated-image-${Date.now()}.png`;
      ctx.onNodeStatus?.(nodeId, "completed");
      return mockResult;
    }
    const apiKey = resolveApiKey(apiKeyConstant);
    try {
      let imageUrl;
      switch (apiFormat) {
        case "openai":
          imageUrl = await generateOpenAI(finalPrompt, endpoint, model, width, height, apiKey);
          break;
        case "gemini":
        case "gemini-3-pro":
        case "gemini-flash":
        case "gemini-2-flash":
          imageUrl = await generateGemini(finalPrompt, endpoint, apiKey);
          break;
        case "comfyui":
          const workflowToUse = comfyWorkflow || finalPrompt;
          const promptOverride = comfyWorkflow ? finalPrompt : void 0;
          imageUrl = await generateComfyUI(
            workflowToUse,
            endpoint,
            promptOverride,
            comfyPrimaryPromptNodeId,
            imageInputs,
            comfyImageInputNodeIds,
            comfyImageInputConfigs,
            comfySeedMode,
            comfyFixedSeed,
            comfyAllImageNodeIds,
            maxImageDimension,
            maxImageSizeKB
          );
          break;
        case "custom":
        default:
          imageUrl = await generateCustom(finalPrompt, endpoint, apiKey);
      }
      ctx.onStreamToken?.(nodeId, imageUrl);
      ctx.onImage?.(nodeId, imageUrl);
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[ImageGen] Image generated successfully`);
      return imageUrl;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      ctx.log("error", `[ImageGen] Error: ${errMsg}`);
      throw error;
    }
  }
  function extractImageSource(imageInput) {
    if (typeof imageInput === "string") {
      const str = imageInput;
      if (str.startsWith("data:")) {
        return { dataUrl: str };
      } else if (str.startsWith("http://") || str.startsWith("https://")) {
        return { url: str };
      } else {
        return { path: str };
      }
    } else if (typeof imageInput === "object" && imageInput !== null) {
      const obj = imageInput;
      const result = {};
      if (typeof obj.path === "string" && obj.path.length > 0) {
        result.path = obj.path;
      }
      if (typeof obj.dataUrl === "string" && obj.dataUrl.length > 0) {
        result.dataUrl = obj.dataUrl;
      }
      if (typeof obj.url === "string" && obj.url.length > 0) {
        result.url = obj.url;
      }
      return result;
    }
    return {};
  }
  async function save(imageInput, outputPath, format, quality, createDir, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    const source = extractImageSource(imageInput);
    ctx.log("info", `[ImageSave] Saving image: ${outputPath} (${format}, quality=${quality})`);
    ctx.log("info", `[ImageSave] Input type: ${typeof imageInput}, value: ${JSON.stringify(imageInput).substring(0, 200)}`);
    ctx.log("info", `[ImageSave] Source: path=${source.path}, dataUrl=${source.dataUrl ? "yes (" + source.dataUrl.substring(0, 50) + "...)" : "no"}, url=${source.url}`);
    ctx.log("info", `[ImageSave] Tauri available: ${!!ctx.tauri}`);
    const imagePath = source.path;
    const imageDataUrl = source.dataUrl;
    if (ctx.onImage) {
      if (imageDataUrl) {
        ctx.onImage(nodeId, imageDataUrl);
      } else if (imagePath && ctx.tauri) {
        try {
          const fileContent = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
            path: imagePath,
            readAs: "base64"
          });
          if (!fileContent.isLargeFile && fileContent.content) {
            ctx.onImage(nodeId, fileContent.content);
          }
        } catch (e) {
          ctx.log("warn", `[ImageSave] Could not read image for preview: ${e}`);
        }
      }
    }
    if (!imagePath && !imageDataUrl && !source.url) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("No valid image source provided");
    }
    try {
      if (ctx.tauri) {
        if (imageDataUrl) {
          let finalOutputPath = outputPath;
          if (!finalOutputPath) {
            let filename = "image";
            if (source.path) {
              const parts = source.path.replace(/\\/g, "/").split("/");
              const srcFilename = parts.pop() || "image";
              filename = srcFilename.split(".")[0];
            } else {
              filename = `image_${Date.now()}`;
            }
            const downloadsPath = await ctx.tauri.invoke("plugin:zipp-filesystem|get_downloads_path").catch(() => "");
            if (downloadsPath) {
              finalOutputPath = `${downloadsPath}/${filename}.${format}`;
            } else {
              finalOutputPath = `${filename}.${format}`;
            }
          } else if (!finalOutputPath.includes(".")) {
            finalOutputPath = `${finalOutputPath}.${format}`;
          }
          ctx.log("info", `[ImageSave] Writing to: ${finalOutputPath}`);
          await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
            path: finalOutputPath,
            content: imageDataUrl,
            contentType: "base64",
            createDirs: createDir
          });
          ctx.onNodeStatus?.(nodeId, "completed");
          ctx.log("success", `[ImageSave] Image saved: ${finalOutputPath}`);
          return finalOutputPath;
        }
        if (imagePath) {
          let finalOutputPath = outputPath;
          if (!finalOutputPath) {
            const parts = imagePath.replace(/\\/g, "/").split("/");
            const srcFilename = parts.pop() || "image";
            const filename = srcFilename.split(".")[0];
            const downloadsPath = await ctx.tauri.invoke("plugin:zipp-filesystem|get_downloads_path").catch(() => "");
            if (downloadsPath) {
              finalOutputPath = `${downloadsPath}/${filename}.${format}`;
            } else {
              const dir = parts.join("/");
              finalOutputPath = `${dir}/${filename}_saved.${format}`;
            }
          } else if (!finalOutputPath.includes(".")) {
            finalOutputPath = `${finalOutputPath}.${format}`;
          }
          ctx.log("info", `[ImageSave] Copying to: ${finalOutputPath}`);
          await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
            source: imagePath,
            destination: finalOutputPath,
            createDirs: createDir
          });
          ctx.onNodeStatus?.(nodeId, "completed");
          ctx.log("success", `[ImageSave] Image copied: ${finalOutputPath}`);
          return finalOutputPath;
        }
      }
      const downloadUrl = imageDataUrl || source.url || "";
      if (downloadUrl) {
        const filename = outputPath.split("/").pop() || `image-${Date.now()}`;
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = `${filename}.${format}`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[ImageSave] Download triggered: ${filename}.${format}`);
        return `${filename}.${format}`;
      }
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Cannot save image: no Tauri available and no downloadable URL");
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      const errStack = error instanceof Error ? error.stack : "";
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      ctx.log("error", `[ImageSave] Error: ${errMsg}`);
      if (errStack) {
        ctx.log("error", `[ImageSave] Stack: ${errStack}`);
      }
      return `Error: ${errMsg}`;
    }
  }
  async function resize(imageData, maxDimension, maxSizeKB, quality, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!imageData || !imageData.startsWith("data:image")) {
        ctx.onNodeStatus?.(nodeId, "error");
        ctx.log("error", "[ImageResize] Invalid image data - must be a base64 data URL");
        return "Error: Invalid image data";
      }
      const originalSizeKB = Math.round(imageData.length / 1024);
      ctx.log("info", `[ImageResize] Input image: ${originalSizeKB}KB`);
      const resized = await resizeImageWithQuality(imageData, maxDimension, maxSizeKB, quality);
      const newSizeKB = Math.round(resized.length / 1024);
      ctx.log("info", `[ImageResize] Output image: ${newSizeKB}KB (${Math.round((1 - newSizeKB / originalSizeKB) * 100)}% reduction)`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return resized;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      if (error instanceof Error && (error.name === "AbortError" || errMsg.includes("aborted"))) {
        return "__ABORT__";
      }
      ctx.log("error", `[ImageResize] Error: ${errMsg}`);
      return `Error: ${errMsg}`;
    }
  }
  async function resizeImageWithQuality(dataUrl, maxDimension, maxSizeKB, quality) {
    if (ctx.tauri) {
      try {
        const result = await ctx.tauri.invoke("resize_image", {
          dataUrl,
          maxDimension,
          maxSizeKb: maxSizeKB,
          quality: quality / 100
          // Rust expects 0-1 range
        });
        if (result.success && result.dataUrl) {
          ctx.log("info", `[ImageResize] Resized: ${result.originalWidth}x${result.originalHeight} -> ${result.newWidth}x${result.newHeight}`);
          return result.dataUrl;
        } else if (result.error) {
          ctx.log("warn", `[ImageResize] Rust resize failed: ${result.error}, using canvas fallback`);
        }
      } catch (err) {
        ctx.log("warn", `[ImageResize] Rust not available: ${err}, using canvas fallback`);
      }
    }
    if (typeof document === "undefined" || typeof Image === "undefined") {
      ctx.log("warn", "[ImageResize] No canvas available, returning original");
      return dataUrl;
    }
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const { width, height } = img;
        let newWidth = width;
        let newHeight = height;
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            newWidth = maxDimension;
            newHeight = Math.round(height * (maxDimension / width));
          } else {
            newHeight = maxDimension;
            newWidth = Math.round(width * (maxDimension / height));
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = newWidth;
        canvas.height = newHeight;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(dataUrl);
          return;
        }
        context.drawImage(img, 0, 0, newWidth, newHeight);
        let currentQuality = quality / 100;
        let resizedDataUrl = canvas.toDataURL("image/jpeg", currentQuality);
        let attempts = 0;
        while (resizedDataUrl.length / 1024 > maxSizeKB && attempts < 5 && currentQuality > 0.1) {
          currentQuality -= 0.15;
          resizedDataUrl = canvas.toDataURL("image/jpeg", Math.max(0.1, currentQuality));
          attempts++;
        }
        resolve(resizedDataUrl);
      };
      img.onerror = () => {
        ctx.log("error", "[ImageResize] Failed to load image");
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  }
  var CoreImageRuntime = {
    name: "Image",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Image] Module initialized");
    },
    methods: {
      generate,
      save,
      resize
    },
    async cleanup() {
      ctx?.log?.("info", "[Image] Module cleanup");
    }
  };
  var runtime_default = CoreImageRuntime;

  // ../zipp-core/modules/core-image/compiler.ts
  var CoreImageCompiler = {
    name: "Image",
    getNodeTypes() {
      return ["image_gen", "image_view", "image_save", "image_resize"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("image") || inputs.get("prompt") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "image_gen": {
          const prompt = escapeString(String(data.prompt || ""));
          const promptInputVar = inputs.get("prompt") || inputs.get("default") || inputs.get("input") || "null";
          const projectSettings = data.projectSettings;
          const endpoint = escapeString(String(data.endpoint || projectSettings?.defaultImageEndpoint || ""));
          const model = escapeString(String(data.model || ""));
          const apiKeyConstant = escapeString(String(data.apiKeyConstant || projectSettings?.defaultImageApiKeyConstant || "OPENAI_API_KEY"));
          const width = Number(data.width) || 1024;
          const height = Number(data.height) || 1024;
          const steps = Number(data.steps) || 20;
          const apiFormat = escapeString(String(data.apiFormat || "openai"));
          let comfyWorkflowCode = "null";
          if (data.comfyWorkflow) {
            try {
              let parsedWorkflow;
              if (typeof data.comfyWorkflow === "string") {
                parsedWorkflow = JSON.parse(data.comfyWorkflow);
              } else if (typeof data.comfyWorkflow === "object") {
                parsedWorkflow = data.comfyWorkflow;
              }
              if (parsedWorkflow) {
                comfyWorkflowCode = JSON.stringify(JSON.stringify(parsedWorkflow));
              }
            } catch {
              comfyWorkflowCode = "null";
            }
          } else if (data.comfyuiWorkflow && typeof data.comfyuiWorkflow === "object") {
            try {
              comfyWorkflowCode = JSON.stringify(JSON.stringify(data.comfyuiWorkflow));
            } catch {
              comfyWorkflowCode = "null";
            }
          }
          const comfyPrimaryPromptNodeId = data.comfyPrimaryPromptNodeId || data.workflowInputs?.promptNodeId || null;
          let comfyImageInputNodeIds = Array.isArray(data.comfyImageInputNodeIds) ? data.comfyImageInputNodeIds : [];
          let comfyImageInputConfigs = Array.isArray(data.comfyImageInputConfigs) ? data.comfyImageInputConfigs : [];
          const comfyAllImageNodeIds = Array.isArray(data.comfyAllImageNodeIds) ? data.comfyAllImageNodeIds : [];
          const workflowInputs = data.workflowInputs;
          if (workflowInputs?.imageNodeId && comfyImageInputNodeIds.length === 0 && comfyImageInputConfigs.length === 0) {
            comfyImageInputNodeIds = [workflowInputs.imageNodeId];
            comfyImageInputConfigs = [{
              nodeId: workflowInputs.imageNodeId,
              title: "Input Image",
              nodeType: "LoadImage",
              allowBypass: true
              // Optional input
            }];
          }
          const comfySeedMode = String(data.comfySeedMode || "random");
          const comfyFixedSeed = data.comfyFixedSeed != null ? Number(data.comfyFixedSeed) : null;
          const imageInputCount = Number(data.imageInputCount) || 0;
          const imageInputVars = [];
          const effectiveImageCount = apiFormat === "comfyui" ? comfyImageInputConfigs.length || comfyImageInputNodeIds.length : imageInputCount;
          for (let i = 0; i < effectiveImageCount; i++) {
            let imageVar = inputs.get(`image_${i}`);
            if (!imageVar && i === 0) {
              imageVar = inputs.get("image");
            }
            imageInputVars.push(imageVar || "null");
          }
          const imageInputsCode = imageInputVars.length > 0 ? `[${imageInputVars.join(", ")}]` : "null";
          const comfyNodeIdsCode = comfyImageInputNodeIds.length > 0 ? `[${comfyImageInputNodeIds.map((id) => `"${escapeString(id)}"`).join(", ")}]` : "null";
          let comfyImageInputConfigsCode = "null";
          if (comfyImageInputConfigs.length > 0) {
            const configItems = comfyImageInputConfigs.map((cfg) => {
              const nodeId = cfg.nodeId || "";
              const title = cfg.title || cfg.label || "";
              const nodeType2 = cfg.nodeType || cfg.inputName || "LoadImage";
              const allowBypass = cfg.allowBypass ?? false;
              return `{nodeId:"${escapeString(nodeId)}",title:"${escapeString(title)}",nodeType:"${escapeString(nodeType2)}",allowBypass:${allowBypass}}`;
            });
            comfyImageInputConfigsCode = `[${configItems.join(",")}]`;
          }
          const comfyAllImageNodeIdsCode = comfyAllImageNodeIds.length > 0 ? `[${comfyAllImageNodeIds.map((id) => `"${escapeString(id)}"`).join(", ")}]` : "null";
          const maxImageDimension = Number(data.maxImageDimension) || 0;
          const maxImageSizeKB = Number(data.maxImageSizeKB) || 0;
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
      ${comfyPrimaryPromptNodeId ? `"${escapeString(String(comfyPrimaryPromptNodeId))}"` : "null"},
      ${comfyNodeIdsCode},
      ${imageInputsCode},
      ${comfyImageInputConfigsCode},
      "${comfySeedMode}",
      ${comfyFixedSeed !== null ? comfyFixedSeed : "null"},
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
        case "image_view": {
          code += `
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "image_save": {
          const outputPath = escapeString(String(data.path || data.outputPath || ""));
          const format = escapeString(String(data.format || "png"));
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
        case "image_resize": {
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
    }
  };
  var compiler_default = CoreImageCompiler;

  // ../zipp-core/modules/core-image/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    ImageGenNode: () => ImageGenNode_default,
    ImageSaveNode: () => ImageSaveNode_default,
    ImageViewNode: () => ImageViewNode_default
  });

  // ../zipp-core/modules/core-image/ui/ImageGenNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);

  // ../zipp-core/modules/core-image/comfyui-analyzer.ts
  var PROMPT_NODE_TYPES = [
    "CLIPTextEncode",
    "CLIPTextEncodeSD3",
    "CLIPTextEncodeFlux",
    "CLIPTextEncodeSDXL",
    "CLIPTextEncodeSDXLRefiner",
    "TextEncodeQwenImageEditPlus",
    "PromptExpansion",
    "StringMultiline",
    "Text"
  ];
  var IMAGE_INPUT_NODE_TYPES = [
    "LoadImage",
    "LoadImageMask",
    "LoadImageBase64"
  ];
  var OUTPUT_NODE_TYPES = [
    "SaveImage",
    "PreviewImage",
    "SaveImageWebsocket"
  ];
  var SEED_NODE_TYPES = [
    "KSampler",
    "KSamplerAdvanced",
    "SamplerCustom",
    "SamplerCustomAdvanced",
    "RandomNoise"
  ];
  function isNegativePrompt(node, nodeId, workflow) {
    const title = node._meta?.title?.toLowerCase() || "";
    if (title.includes("negative") || title.includes("neg ")) {
      return true;
    }
    for (const [, otherNode] of Object.entries(workflow)) {
      if (otherNode.class_type === "KSampler" || otherNode.class_type === "KSamplerAdvanced") {
        const negativeInput = otherNode.inputs?.negative;
        if (Array.isArray(negativeInput) && negativeInput[0] === nodeId) {
          return true;
        }
      }
    }
    return false;
  }
  function analyzeComfyUIWorkflow(workflowJson) {
    let workflow;
    if (typeof workflowJson === "string") {
      try {
        workflow = JSON.parse(workflowJson);
      } catch (e) {
        return {
          isValid: false,
          error: `Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`,
          prompts: [],
          images: [],
          outputs: [],
          seeds: [],
          workflow: null
        };
      }
    } else {
      workflow = workflowJson;
    }
    if (typeof workflow !== "object" || workflow === null) {
      return {
        isValid: false,
        error: "Workflow must be an object",
        prompts: [],
        images: [],
        outputs: [],
        seeds: [],
        workflow: null
      };
    }
    const prompts = [];
    const images = [];
    const outputs = [];
    const seeds = [];
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (!node || typeof node !== "object" || !node.class_type) {
        continue;
      }
      const nodeType = node.class_type;
      const title = node._meta?.title || nodeType;
      if (PROMPT_NODE_TYPES.includes(nodeType)) {
        const textKeys = ["text", "prompt", "string", "positive", "negative"];
        for (const key of textKeys) {
          if (typeof node.inputs?.[key] === "string") {
            prompts.push({
              nodeId,
              nodeType,
              title,
              inputKey: key,
              currentValue: node.inputs[key],
              isNegative: isNegativePrompt(node, nodeId, workflow)
            });
            break;
          }
        }
      }
      if (IMAGE_INPUT_NODE_TYPES.includes(nodeType)) {
        const imageKey = node.inputs?.image !== void 0 ? "image" : "image_base64";
        images.push({
          nodeId,
          nodeType,
          title,
          inputKey: imageKey,
          currentValue: typeof node.inputs?.[imageKey] === "string" ? node.inputs[imageKey] : ""
        });
      }
      if (OUTPUT_NODE_TYPES.includes(nodeType)) {
        outputs.push({
          nodeId,
          nodeType,
          title
        });
      }
      if (SEED_NODE_TYPES.includes(nodeType)) {
        const seedKeys = ["seed", "noise_seed"];
        for (const key of seedKeys) {
          const seedValue = node.inputs?.[key];
          if (typeof seedValue === "number") {
            seeds.push({
              nodeId,
              nodeType,
              title,
              inputKey: key,
              currentValue: seedValue
            });
            break;
          }
        }
      }
    }
    prompts.sort((a, b) => {
      if (a.isNegative === b.isNegative) return 0;
      return a.isNegative ? 1 : -1;
    });
    return {
      isValid: true,
      prompts,
      images,
      outputs,
      seeds,
      workflow
    };
  }
  function getWorkflowSummary(analysis) {
    if (!analysis.isValid) {
      return `Invalid workflow: ${analysis.error}`;
    }
    const parts = [];
    const positivePrompts = analysis.prompts.filter((p) => !p.isNegative);
    const negativePrompts = analysis.prompts.filter((p) => p.isNegative);
    if (positivePrompts.length > 0) {
      parts.push(`${positivePrompts.length} prompt${positivePrompts.length > 1 ? "s" : ""}`);
    }
    if (negativePrompts.length > 0) {
      parts.push(`${negativePrompts.length} negative`);
    }
    if (analysis.images.length > 0) {
      parts.push(`${analysis.images.length} image input${analysis.images.length > 1 ? "s" : ""}`);
    }
    if (analysis.outputs.length > 0) {
      parts.push(`${analysis.outputs.length} output${analysis.outputs.length > 1 ? "s" : ""}`);
    }
    return parts.join(", ") || "Empty workflow";
  }

  // ../zipp-core/modules/core-image/ui/ImageGenNode.tsx
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var API_FORMATS = [
    { value: "openai", label: "OpenAI GPT Image", description: "GPT Image 1 - best quality & text rendering", endpoint: "https://api.openai.com/v1/images/generations", model: "gpt-image-1", apiKeyConstant: "OPENAI_API_KEY", supportsImg2Img: true },
    { value: "gemini-3-pro", label: "Gemini 3 Pro", description: "Best quality - 4K, thinking, grounding", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent", model: "gemini-3-pro-image-preview", apiKeyConstant: "GOOGLE_API_KEY", supportsImg2Img: true },
    { value: "gemini-flash", label: "Gemini 2.5 Flash", description: "Fast image gen - optimized for speed", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent", model: "gemini-2.5-flash-preview-05-20", apiKeyConstant: "GOOGLE_API_KEY", supportsImg2Img: true },
    { value: "gemini-2-flash", label: "Gemini 2.0 Flash", description: "Experimental image gen with Imagen 3", endpoint: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent", model: "gemini-2.0-flash-exp", apiKeyConstant: "GOOGLE_API_KEY", supportsImg2Img: true },
    { value: "comfyui", label: "ComfyUI", description: "ComfyUI API - load workflow JSON file", endpoint: "http://localhost:8188", model: "", isLocal: true, apiKeyConstant: "", supportsImg2Img: true },
    { value: "custom", label: "Custom", description: "Custom API - connect Template for body, supports headers", endpoint: "", model: "", apiKeyConstant: "", supportsImg2Img: true }
  ];
  var GEMINI_ASPECT_RATIOS = [
    { value: "1:1", label: "1:1 (Square)" },
    { value: "3:4", label: "3:4 (Portrait)" },
    { value: "4:3", label: "4:3 (Landscape)" },
    { value: "9:16", label: "9:16 (Vertical)" },
    { value: "16:9", label: "16:9 (Widescreen)" }
  ];
  var ImageGenIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "currentColor", viewBox: "0 0 20 20", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { fillRule: "evenodd", d: "M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z", clipRule: "evenodd" }) });
  function ImageGenNode({ data }) {
    const onEndpointChangeRef = (0, import_react.useRef)(data.onEndpointChange);
    const onApiFormatChangeRef = (0, import_react.useRef)(data.onApiFormatChange);
    const onModelChangeRef = (0, import_react.useRef)(data.onModelChange);
    const onSizeChangeRef = (0, import_react.useRef)(data.onSizeChange);
    const onQualityChangeRef = (0, import_react.useRef)(data.onQualityChange);
    const onOutputFormatChangeRef = (0, import_react.useRef)(data.onOutputFormatChange);
    const onBackgroundChangeRef = (0, import_react.useRef)(data.onBackgroundChange);
    const onAspectRatioChangeRef = (0, import_react.useRef)(data.onAspectRatioChange);
    const onApiKeyChangeRef = (0, import_react.useRef)(data.onApiKeyChange);
    const onApiKeyConstantChangeRef = (0, import_react.useRef)(data.onApiKeyConstantChange);
    const onHeadersChangeRef = (0, import_react.useRef)(data.onHeadersChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    const onComfyWorkflowChangeRef = (0, import_react.useRef)(data.onComfyWorkflowChange);
    const onComfyWorkflowNameChangeRef = (0, import_react.useRef)(data.onComfyWorkflowNameChange);
    const onComfyPrimaryPromptNodeIdChangeRef = (0, import_react.useRef)(data.onComfyPrimaryPromptNodeIdChange);
    const onComfyImageInputNodeIdsChangeRef = (0, import_react.useRef)(data.onComfyImageInputNodeIdsChange);
    const onComfyImageInputConfigsChangeRef = (0, import_react.useRef)(data.onComfyImageInputConfigsChange);
    const onComfySeedModeChangeRef = (0, import_react.useRef)(data.onComfySeedModeChange);
    const onComfyFixedSeedChangeRef = (0, import_react.useRef)(data.onComfyFixedSeedChange);
    const onImageInputCountChangeRef = (0, import_react.useRef)(data.onImageInputCountChange);
    const onOpenComfyWorkflowDialogRef = (0, import_react.useRef)(data.onOpenComfyWorkflowDialog);
    const fileInputRef = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      onEndpointChangeRef.current = data.onEndpointChange;
      onApiFormatChangeRef.current = data.onApiFormatChange;
      onModelChangeRef.current = data.onModelChange;
      onSizeChangeRef.current = data.onSizeChange;
      onQualityChangeRef.current = data.onQualityChange;
      onOutputFormatChangeRef.current = data.onOutputFormatChange;
      onBackgroundChangeRef.current = data.onBackgroundChange;
      onAspectRatioChangeRef.current = data.onAspectRatioChange;
      onApiKeyChangeRef.current = data.onApiKeyChange;
      onApiKeyConstantChangeRef.current = data.onApiKeyConstantChange;
      onHeadersChangeRef.current = data.onHeadersChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
      onComfyWorkflowChangeRef.current = data.onComfyWorkflowChange;
      onComfyWorkflowNameChangeRef.current = data.onComfyWorkflowNameChange;
      onComfyPrimaryPromptNodeIdChangeRef.current = data.onComfyPrimaryPromptNodeIdChange;
      onComfyImageInputNodeIdsChangeRef.current = data.onComfyImageInputNodeIdsChange;
      onComfyImageInputConfigsChangeRef.current = data.onComfyImageInputConfigsChange;
      onComfySeedModeChangeRef.current = data.onComfySeedModeChange;
      onComfyFixedSeedChangeRef.current = data.onComfyFixedSeedChange;
      onImageInputCountChangeRef.current = data.onImageInputCountChange;
      onOpenComfyWorkflowDialogRef.current = data.onOpenComfyWorkflowDialog;
    });
    const handleApiFormatChange = (0, import_react.useCallback)((format) => {
      onApiFormatChangeRef.current?.(format);
      const formatInfo = API_FORMATS.find((f) => f.value === format);
      if (formatInfo) {
        onEndpointChangeRef.current?.(formatInfo.endpoint);
        if (formatInfo.model) {
          onModelChangeRef.current?.(formatInfo.model);
        }
        if (formatInfo.apiKeyConstant) {
          onApiKeyConstantChangeRef.current?.(formatInfo.apiKeyConstant);
        }
        if (format === "openai") {
          onSizeChangeRef.current?.("auto");
          onQualityChangeRef.current?.("auto");
          onOutputFormatChangeRef.current?.("png");
          onBackgroundChangeRef.current?.("auto");
        } else if (format === "gemini-flash" || format === "gemini-2-flash" || format === "gemini-3-pro") {
          onAspectRatioChangeRef.current?.("1:1");
          onOutputFormatChangeRef.current?.("png");
        }
        if (format !== "comfyui") {
          onComfyWorkflowChangeRef.current?.("");
          onComfyWorkflowNameChangeRef.current?.("");
          onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
          onComfyImageInputNodeIdsChangeRef.current?.([]);
        }
        onImageInputCountChangeRef.current?.(0);
      }
    }, []);
    const handleApiKeyConstantChange = (0, import_react.useCallback)((e) => {
      onApiKeyConstantChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleWorkflowFileSelect = (0, import_react.useCallback)((e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        const analysis = analyzeComfyUIWorkflow(content);
        if (!analysis.isValid) {
          alert(`Invalid workflow: ${analysis.error}`);
          return;
        }
        if (analysis.prompts.length > 0 || analysis.images.length > 0) {
          onOpenComfyWorkflowDialogRef.current?.(analysis, file.name);
        } else {
          onComfyWorkflowChangeRef.current?.(content);
          onComfyWorkflowNameChangeRef.current?.(file.name);
          onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
          onComfyImageInputNodeIdsChangeRef.current?.([]);
        }
      };
      reader.readAsText(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, []);
    const handleAddImageInput = (0, import_react.useCallback)(() => {
      const current = data.imageInputCount || 0;
      onImageInputCountChangeRef.current?.(current + 1);
    }, [data.imageInputCount]);
    const handleRemoveImageInput = (0, import_react.useCallback)(() => {
      const current = data.imageInputCount || 0;
      if (current > 0) {
        onImageInputCountChangeRef.current?.(current - 1);
      }
    }, [data.imageInputCount]);
    const handleClearWorkflow = (0, import_react.useCallback)(() => {
      onComfyWorkflowChangeRef.current?.("");
      onComfyWorkflowNameChangeRef.current?.("");
      onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
      onComfyImageInputNodeIdsChangeRef.current?.([]);
      onComfyImageInputConfigsChangeRef.current?.([]);
      onComfySeedModeChangeRef.current?.("random");
      onComfyFixedSeedChangeRef.current?.(null);
    }, []);
    const defaultProvider = data.projectSettings?.defaultImageProvider || "openai";
    const defaultEndpoint = data.projectSettings?.defaultImageEndpoint || "";
    const defaultApiKeyConstant = data.projectSettings?.defaultImageApiKeyConstant || "";
    const apiFormat = data.apiFormat || defaultProvider;
    const isComfyUI = apiFormat === "comfyui";
    const isCustom = apiFormat === "custom";
    const selectedFormat = API_FORMATS.find((f) => f.value === apiFormat);
    const isLocal = selectedFormat?.isLocal || false;
    const isOpenAI = apiFormat === "openai";
    const isGemini = apiFormat === "gemini-flash" || apiFormat === "gemini-2-flash" || apiFormat === "gemini-3-pro";
    const supportsImg2Img = selectedFormat?.supportsImg2Img || false;
    const projectConstants = data.projectConstants || [];
    const apiKeyConstants = projectConstants.filter((c) => c.category === "api_key");
    const effectiveApiKeyConstant = data.apiKeyConstant || defaultApiKeyConstant;
    const hasEmbeddedWorkflow = (0, import_react.useMemo)(() => {
      return data.comfyuiWorkflow && Object.keys(data.comfyuiWorkflow).length > 0;
    }, [data.comfyuiWorkflow]);
    const workflowAnalysis = (0, import_react.useMemo)(() => {
      if (data.comfyWorkflow) {
        return analyzeComfyUIWorkflow(data.comfyWorkflow);
      }
      if (hasEmbeddedWorkflow) {
        return analyzeComfyUIWorkflow(JSON.stringify(data.comfyuiWorkflow));
      }
      return null;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, data.comfyuiWorkflow]);
    const embeddedWorkflowNodeCount = (0, import_react.useMemo)(() => {
      if (!hasEmbeddedWorkflow) return 0;
      return Object.keys(data.comfyuiWorkflow).length;
    }, [hasEmbeddedWorkflow, data.comfyuiWorkflow]);
    const getSizeOptions = () => {
      if (isOpenAI) {
        return [
          { value: "auto", label: "Auto" },
          { value: "1024x1024", label: "1024x1024 (Square)" },
          { value: "1536x1024", label: "1536x1024 (Landscape)" },
          { value: "1024x1536", label: "1024x1536 (Portrait)" }
        ];
      }
      return [
        { value: "1024x1024", label: "1024x1024" },
        { value: "512x512", label: "512x512" }
      ];
    };
    const validationIssues = (0, import_react.useMemo)(() => {
      const issues = [];
      if (isCustom && !data.endpoint && !defaultEndpoint) {
        issues.push({ field: "Endpoint", message: "Required for custom" });
      }
      if (!isLocal && !effectiveApiKeyConstant && !data.apiKey) {
        issues.push({ field: "API Key", message: "Required for cloud" });
      }
      if (isComfyUI && !data.comfyWorkflow && !hasEmbeddedWorkflow) {
        issues.push({ field: "Workflow", message: "Load a workflow file" });
      }
      return issues;
    }, [data.endpoint, data.apiKey, data.comfyWorkflow, isLocal, isCustom, isComfyUI, defaultEndpoint, effectiveApiKeyConstant, hasEmbeddedWorkflow]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-pink-400 font-medium", children: selectedFormat?.label || "Custom" }),
      isComfyUI && data.comfyWorkflowName && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-slate-500 ml-1 text-xs", children: [
        "(",
        data.comfyWorkflowName,
        ")"
      ] }),
      isComfyUI && !data.comfyWorkflowName && hasEmbeddedWorkflow && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-green-500 ml-1 text-xs", children: "(Embedded)" })
    ] });
    const effectiveImageInputCount = isComfyUI ? data.comfyImageInputNodeIds?.length || 0 : data.imageInputCount || 0;
    const inputHandles = (0, import_react.useMemo)(() => {
      const handles = [];
      const hasWorkflow = data.comfyWorkflow || hasEmbeddedWorkflow;
      const hasPromptNode = data.comfyPrimaryPromptNodeId !== null || hasEmbeddedWorkflow && data.workflowInputs?.promptNodeId;
      const showPromptInput = !isComfyUI || !hasWorkflow || hasPromptNode;
      if (showPromptInput) {
        handles.push({ id: "prompt", type: "target", position: import_react2.Position.Left, color: "!bg-blue-500", label: "prompt", labelColor: "text-blue-400", size: "lg" });
      }
      if (!isLocal) {
        handles.push({ id: "apiKey", type: "target", position: import_react2.Position.Left, color: "!bg-yellow-500", label: "api key", labelColor: "text-yellow-400", size: "sm" });
      }
      if (isComfyUI && data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0) {
        data.comfyImageInputConfigs.forEach((config, index) => {
          const label = config.title || `image ${index + 1}`;
          const bypassIndicator = config.allowBypass ? " (opt)" : "";
          handles.push({
            id: `image_${index}`,
            type: "target",
            position: import_react2.Position.Left,
            color: config.allowBypass ? "!bg-purple-400" : "!bg-purple-500",
            label: `${label.toLowerCase()}${bypassIndicator}`,
            labelColor: config.allowBypass ? "text-purple-300" : "text-purple-400",
            size: "md"
          });
        });
      } else if (isComfyUI && data.comfyImageInputNodeIds && data.comfyImageInputNodeIds.length > 0) {
        data.comfyImageInputNodeIds.forEach((nodeId, index) => {
          const analysis = workflowAnalysis;
          const imageInput = analysis?.images.find((img) => img.nodeId === nodeId);
          const label = imageInput?.title || `image ${index + 1}`;
          handles.push({
            id: `image_${index}`,
            type: "target",
            position: import_react2.Position.Left,
            color: "!bg-purple-500",
            label: label.toLowerCase(),
            labelColor: "text-purple-400",
            size: "md"
          });
        });
      } else if (hasEmbeddedWorkflow && data.workflowInputs?.imageNodeId) {
        handles.push({
          id: "image_0",
          type: "target",
          position: import_react2.Position.Left,
          color: "!bg-purple-500",
          label: "image",
          labelColor: "text-purple-400",
          size: "md"
        });
      } else if (effectiveImageInputCount > 0) {
        for (let i = 0; i < effectiveImageInputCount; i++) {
          handles.push({
            id: `image_${i}`,
            type: "target",
            position: import_react2.Position.Left,
            color: "!bg-purple-500",
            label: effectiveImageInputCount === 1 ? "image" : `image ${i + 1}`,
            labelColor: "text-purple-400",
            size: "md"
          });
        }
      }
      if (isCustom) {
        handles.push({ id: "body", type: "target", position: import_react2.Position.Left, color: "!bg-orange-500", label: "body", labelColor: "text-orange-400", size: "md" });
      }
      return handles;
    }, [isLocal, isComfyUI, isCustom, data.comfyPrimaryPromptNodeId, data.comfyImageInputNodeIds, data.comfyImageInputConfigs, effectiveImageInputCount, workflowAnalysis, hasEmbeddedWorkflow, data.workflowInputs, data.comfyWorkflow]);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "image", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Image Generator",
        color: "pink",
        icon: ImageGenIcon,
        width: 280,
        collapsedWidth: 150,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Provider" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                value: apiFormat,
                onChange: (e) => handleApiFormatChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: API_FORMATS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: f.value, children: f.label }, f.value))
              }
            )
          ] }),
          isComfyUI && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Workflow" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: ".json",
                onChange: handleWorkflowFileSelect,
                className: "hidden"
              }
            ),
            data.comfyWorkflow || hasEmbeddedWorkflow ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded p-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-sm text-green-400 font-medium truncate flex-1", children: data.comfyWorkflowName || (hasEmbeddedWorkflow ? `Embedded (${embeddedWorkflowNodeCount} nodes)` : "workflow.json") }),
                data.comfyWorkflow && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleClearWorkflow,
                    className: "text-slate-500 hover:text-red-400 ml-2",
                    title: "Remove workflow",
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
                  }
                )
              ] }),
              workflowAnalysis && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-slate-500", children: getWorkflowSummary(workflowAnalysis) }),
              hasEmbeddedWorkflow && !data.comfyWorkflow && data.workflowInputs && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-1 text-xs text-slate-500", children: [
                "Prompt: node ",
                data.workflowInputs.promptNodeId,
                " | Image: node ",
                data.workflowInputs.imageNodeId
              ] }),
              data.comfySeedMode && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "mt-2 pt-2 border-t border-slate-300 dark:border-slate-700", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-500", children: "Seed:" }),
                data.comfySeedMode === "random" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-green-400", children: "Random each run" }),
                data.comfySeedMode === "fixed" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-blue-400", children: [
                  "Fixed (",
                  data.comfyFixedSeed,
                  ")"
                ] }),
                data.comfySeedMode === "workflow" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-400", children: "From workflow" })
              ] }) }),
              data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "mt-2 pt-2 border-t border-slate-300 dark:border-slate-700", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-slate-500 mb-1", children: "Image inputs:" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "space-y-1", children: data.comfyImageInputConfigs.map((config) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "w-2 h-2 rounded-full bg-purple-500" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-300", children: config.title }),
                  config.allowBypass ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-green-400 text-[10px]", children: "(optional)" }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-amber-400 text-[10px]", children: "(required)" })
                ] }, config.nodeId)) })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => fileInputRef.current?.click(),
                  className: "mt-2 text-xs text-pink-400 hover:text-pink-300",
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Change workflow"
                }
              )
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "button",
              {
                onClick: () => fileInputRef.current?.click(),
                onMouseDown: (e) => e.stopPropagation(),
                className: "nodrag w-full bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 hover:border-pink-500 rounded p-3 text-center transition-colors",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-6 h-6 mx-auto text-slate-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-sm text-slate-400", children: "Load ComfyUI workflow" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-xs text-slate-600 mt-1", children: ".json exported from ComfyUI" })
                ]
              }
            )
          ] }),
          (!isComfyUI || !data.comfyWorkflow && !hasEmbeddedWorkflow) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Endpoint" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500 font-mono",
                placeholder: "https://api.example.com/v1/images",
                value: data.endpoint || "",
                onChange: (e) => onEndpointChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          isComfyUI && (data.comfyWorkflow || hasEmbeddedWorkflow) && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "ComfyUI Server" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500 font-mono",
                placeholder: "http://localhost:8188",
                value: data.endpoint || "http://localhost:8188",
                onChange: (e) => onEndpointChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          !isComfyUI && !isCustom && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Model" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                placeholder: selectedFormat?.model || "model-name",
                value: data.model || "",
                onChange: (e) => onModelChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          isOpenAI && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Size" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                  value: data.size || "auto",
                  onChange: (e) => onSizeChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: getSizeOptions().map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: opt.value, children: opt.label }, opt.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Quality" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                  value: data.quality || "auto",
                  onChange: (e) => onQualityChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "auto", children: "Auto" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "low", children: "Low" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "medium", children: "Medium" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "high", children: "High" })
                  ]
                }
              )
            ] })
          ] }),
          isGemini && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Aspect" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                  value: data.aspectRatio || "1:1",
                  onChange: (e) => onAspectRatioChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: GEMINI_ASPECT_RATIOS.map((opt) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: opt.value, children: opt.label }, opt.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Format" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                  value: data.outputFormat || "png",
                  onChange: (e) => onOutputFormatChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "png", children: "PNG" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "jpeg", children: "JPEG" }),
                    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "webp", children: "WebP" })
                  ]
                }
              )
            ] })
          ] }),
          !isComfyUI && supportsImg2Img && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Image Inputs" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleRemoveImageInput,
                    disabled: effectiveImageInputCount === 0,
                    className: "w-5 h-5 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-30 disabled:cursor-not-allowed text-slate-300",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M20 12H4" }) })
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-xs text-slate-400 w-4 text-center", children: effectiveImageInputCount }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleAddImageInput,
                    className: "w-5 h-5 flex items-center justify-center rounded bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-300",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 4v16m8-8H4" }) })
                  }
                )
              ] })
            ] }),
            effectiveImageInputCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", { className: "text-xs text-slate-500", children: [
              effectiveImageInputCount,
              " image input",
              effectiveImageInputCount > 1 ? "s" : "",
              " for img2img"
            ] })
          ] }),
          !isLocal && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
              "API Key ",
              apiKeyConstants.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(from settings)" })
            ] }),
            apiKeyConstants.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
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
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                placeholder: "API key...",
                value: data.apiKey || "",
                onChange: (e) => onApiKeyChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          isCustom && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Headers (JSON)" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500 font-mono resize-none",
                placeholder: '{"Authorization": "Bearer sk-..."}',
                value: data.headers || "",
                onChange: (e) => onHeadersChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                rows: 2
              }
            )
          ] })
        ] })
      }
    ) });
  }
  var ImageGenNode_default = (0, import_react.memo)(ImageGenNode);

  // ../zipp-core/modules/core-image/ui/ImageViewNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var ImageViewIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 12a3 3 0 11-6 0 3 3 0 016 0z" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" })
  ] });
  function ImageViewNode({ data }) {
    const [isExpanded, setIsExpanded] = (0, import_react3.useState)(false);
    const [hasLoadError, setHasLoadError] = (0, import_react3.useState)(false);
    const hasImage = data.imageUrl && data.imageUrl !== "";
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const isValidImage = hasImage && (data.imageUrl?.startsWith("data:image") || data.imageUrl?.startsWith("http") || data.imageUrl?.startsWith("blob:"));
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-slate-400", children: hasImage ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-indigo-400", children: "Image" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "italic text-slate-500", children: "No image" }) });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "image", type: "target", position: import_react4.Position.Left, color: "!bg-blue-500", size: "lg" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "image", type: "source", position: import_react4.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Image Viewer",
        color: "indigo",
        icon: ImageViewIcon,
        width: isExpanded ? 384 : 288,
        collapsedWidth: 140,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Label" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500",
                placeholder: "image_preview",
                value: data.label || "",
                onChange: (e) => data.onLabelChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Preview" }),
              hasImage && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  onClick: () => setIsExpanded(!isExpanded),
                  className: "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded text-[10px] flex items-center gap-0.5",
                  children: isExpanded ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M20 12H4" }) }),
                    "Collapse"
                  ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" }) }),
                    "Expand"
                  ] })
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: `w-full bg-white dark:bg-slate-900 border rounded flex items-center justify-center transition-all ${hasImage ? "border-indigo-600" : "border-slate-300 dark:border-slate-700"} ${isExpanded ? "h-64" : "h-32"}`, children: isValidImage && !hasLoadError ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "img",
              {
                src: data.imageUrl,
                alt: data.label || "Image",
                className: "max-w-full max-h-full object-contain rounded",
                onError: () => setHasLoadError(true),
                onLoad: () => setHasLoadError(false)
              }
            ) : hasImage ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-center p-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-8 h-8 mx-auto text-slate-600 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-500 text-xs", children: "Invalid image format" })
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-center p-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-8 h-8 mx-auto text-slate-600 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" }) }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-500 text-xs italic", children: "Waiting for image..." })
            ] }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[10px]", children: "Displays image from input. Connect to Image Generator output." })
        ] })
      }
    );
  }
  var ImageViewNode_default = (0, import_react3.memo)(ImageViewNode);

  // ../zipp-core/modules/core-image/ui/ImageSaveNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var ImageSaveIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" }) });
  function ImageSaveNode({ data }) {
    const hasImage = data.imageUrl && data.imageUrl !== "";
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-teal-400", children: data.format?.toUpperCase() || "PNG" }),
      data.filename && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-1 text-[10px]", children: data.filename })
    ] });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "image", type: "target", position: import_react6.Position.Left, color: "!bg-blue-500", size: "lg", label: "image" },
      { id: "filename", type: "target", position: import_react6.Position.Left, color: "!bg-amber-500", size: "sm", label: "name" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "path", type: "source", position: import_react6.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const titleExtra = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-auto px-1.5 py-0.5 bg-teal-900 text-teal-400 text-[10px] rounded", children: "AUTO" });
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Save Image",
        color: "teal",
        icon: ImageSaveIcon,
        width: 288,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        titleExtra,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                placeholder: "my_image",
                value: data.filename || "image",
                onChange: (e) => data.onFilenameChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                value: data.format || "png",
                onChange: (e) => data.onFormatChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "png", children: "PNG" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "jpg", children: "JPG" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "webp", children: "WebP" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Preview" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: `w-full h-20 bg-white dark:bg-slate-900 border rounded flex items-center justify-center ${hasImage ? "border-teal-600" : "border-slate-300 dark:border-slate-700"}`, children: hasImage ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "img",
              {
                src: data.imageUrl?.startsWith("data:") || data.imageUrl?.startsWith("http") ? data.imageUrl : data.imageUrl?.match(/^[A-Za-z]:[\\/]/) ? `asset://localhost/${encodeURIComponent(data.imageUrl.replace(/\\/g, "/")).replace(/%2F/g, "/").replace(/%3A/g, ":")}` : data.imageUrl,
                alt: "Preview",
                className: "max-w-full max-h-full object-contain rounded"
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-slate-500 text-xs italic", children: "No image" }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-4 h-4 text-teal-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "Auto-saves during workflow execution" })
          ] })
        ] })
      }
    );
  }
  var ImageSaveNode_default = (0, import_react5.memo)(ImageSaveNode);

  // ../zipp-core/modules/core-image/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
