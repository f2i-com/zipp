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

  // external-global:zipp-core
  var require_zipp_core = __commonJS({
    "external-global:zipp-core"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.ZippCore;
    }
  });

  // ../zipp-core/modules/core-video/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-video/comfyui-video-analyzer.ts
  var RESOLUTION_NODE_TYPES = [
    "EmptyImage",
    "EmptyLTXVLatentVideo",
    "EmptyLatentImage"
  ];
  var VIDEO_OUTPUT_NODE_TYPES = [
    "SaveVideo",
    "VHS_VideoCombine",
    "VHS_VideoSave",
    "CreateVideo"
  ];
  function analyzeComfyUIVideoWorkflow(workflowJson) {
    let workflow;
    if (typeof workflowJson === "string") {
      try {
        workflow = JSON.parse(workflowJson);
      } catch (e) {
        return {
          isValid: false,
          error: `Invalid JSON: ${e instanceof Error ? e.message : "Parse error"}`,
          lengths: [],
          resolutions: [],
          frameRates: [],
          outputs: [],
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
        lengths: [],
        resolutions: [],
        frameRates: [],
        outputs: [],
        workflow: null
      };
    }
    const lengths = [];
    const resolutions = [];
    const frameRates = [];
    const outputs = [];
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (!node || typeof node !== "object" || !node.class_type) {
        continue;
      }
      const nodeType = node.class_type;
      const title = node._meta?.title || nodeType;
      const titleLower = title.toLowerCase();
      if (nodeType === "PrimitiveInt" && titleLower.includes("length")) {
        const value = node.inputs?.value;
        if (typeof value === "number") {
          lengths.push({
            nodeId,
            nodeType,
            title,
            inputKey: "value",
            currentValue: value
          });
        }
      }
      if ((nodeType === "PrimitiveInt" || nodeType === "PrimitiveFloat") && (titleLower.includes("frame rate") || titleLower.includes("framerate") || titleLower.includes("fps"))) {
        const value = node.inputs?.value;
        if (typeof value === "number") {
          frameRates.push({
            nodeId,
            nodeType,
            title,
            inputKey: "value",
            currentValue: value
          });
        }
      }
      if (RESOLUTION_NODE_TYPES.includes(nodeType)) {
        const width = node.inputs?.width;
        const height = node.inputs?.height;
        if (typeof width === "number" && typeof height === "number") {
          resolutions.push({
            nodeId,
            nodeType,
            title,
            width,
            height
          });
        }
      }
      if (VIDEO_OUTPUT_NODE_TYPES.includes(nodeType)) {
        outputs.push({
          nodeId,
          nodeType,
          title
        });
      }
    }
    return {
      isValid: true,
      lengths,
      resolutions,
      frameRates,
      outputs,
      workflow
    };
  }
  function applyVideoOverrides(workflow, overrides) {
    const modified = { ...workflow };
    if (overrides.lengthNodeId && overrides.length !== void 0 && modified[overrides.lengthNodeId]) {
      modified[overrides.lengthNodeId] = {
        ...modified[overrides.lengthNodeId],
        inputs: {
          ...modified[overrides.lengthNodeId].inputs,
          value: overrides.length
        }
      };
    }
    if (overrides.resolutionNodeId && modified[overrides.resolutionNodeId]) {
      const updates = { ...modified[overrides.resolutionNodeId].inputs };
      if (overrides.width !== void 0) updates.width = overrides.width;
      if (overrides.height !== void 0) updates.height = overrides.height;
      modified[overrides.resolutionNodeId] = {
        ...modified[overrides.resolutionNodeId],
        inputs: updates
      };
    }
    if (overrides.frameRateNodeId && overrides.frameRate !== void 0 && modified[overrides.frameRateNodeId]) {
      modified[overrides.frameRateNodeId] = {
        ...modified[overrides.frameRateNodeId],
        inputs: {
          ...modified[overrides.frameRateNodeId].inputs,
          value: overrides.frameRate
        }
      };
    }
    return modified;
  }

  // ../zipp-core/modules/core-video/runtime.ts
  var ctx;
  var tempBatchFolders = /* @__PURE__ */ new Set();
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function extractPortFromUrl(url) {
    const match = url.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
  async function ensureServiceReadyByPort(port) {
    if (!ctx.tauri) return { success: false };
    try {
      ctx.log("info", `[Video] Ensuring service on port ${port} is ready...`);
      const result = await ctx.tauri.invoke("ensure_service_ready_by_port", {
        port
      });
      if (result.success && result.port) {
        if (!result.already_running) {
          ctx.log("info", `[Video] Service on port ${port} auto-started`);
        }
        return { success: true, port: result.port };
      } else if (result.error) {
        ctx.log("warn", `[Video] Service on port ${port} failed to start: ${result.error}`);
      }
    } catch {
      ctx.log("info", `[Video] Dynamic service lookup not available`);
    }
    return { success: false };
  }
  async function checkServiceAvailable(apiUrl, serviceName) {
    const port = extractPortFromUrl(apiUrl);
    if (port) {
      await ensureServiceReadyByPort(port);
    }
    const baseUrl = apiUrl.replace(/\/[^/]+$/, "");
    try {
      const healthCheck = await fetch(`${baseUrl}/health`, { method: "GET" });
      if (!healthCheck.ok) {
        const healthData = await healthCheck.json().catch(() => ({}));
        if (healthData.missing?.length) {
          throw new Error(`${serviceName} service is missing dependencies: ${healthData.missing.join(", ")}. Please install them and restart the service.`);
        }
      }
    } catch (error) {
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new Error(`${serviceName} service is not running. Please start it from the Services panel (gear icon > Services).`);
      }
      if (error instanceof Error && error.message.includes("missing dependencies")) {
        throw error;
      }
    }
  }
  async function getInfo(path, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoFrames] Getting info for: ${path}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native video processing requires Tauri");
    }
    try {
      const info = await ctx.tauri.invoke("get_video_info", {
        path
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoFrames] Video: ${info.duration}s, ${info.width}x${info.height}, ${info.fps}fps`);
      return info;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoFrames] getInfo failed: ${errMsg}`);
      throw error;
    }
  }
  async function extract(path, intervalSeconds, outputFormat, maxFrames, nodeId, startTime, endTime) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoFrames] Extracting frames from: ${path}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native video processing requires Tauri");
    }
    try {
      const options = {
        intervalSeconds,
        outputFormat,
        maxFrames
      };
      if (startTime !== void 0 && startTime > 0) {
        options.startTime = startTime;
      }
      if (endTime !== void 0 && endTime > 0) {
        options.endTime = endTime;
      }
      const frames = await ctx.tauri.invoke("extract_video_frames", {
        path,
        options
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoFrames] Extracted ${frames.length} frames`);
      return frames;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoFrames] extract failed: ${errMsg}`);
      throw error;
    }
  }
  async function extractAtTimestamps(path, timestamps, outputFormat, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoFrames] Extracting ${timestamps.length} frames at specific timestamps from: ${path}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native video processing requires Tauri");
    }
    if (!timestamps || timestamps.length === 0) {
      ctx.onNodeStatus?.(nodeId, "completed");
      return [];
    }
    try {
      const allFrames = [];
      for (let i = 0; i < timestamps.length; i++) {
        const timestamp = timestamps[i];
        ctx.log("info", `[VideoFrames] Extracting frame ${i + 1}/${timestamps.length} at ${timestamp}s`);
        const options = {
          intervalSeconds: 0.1,
          // High frequency to ensure we get a frame
          outputFormat,
          maxFrames: 1,
          startTime: Math.max(0, timestamp - 0.05),
          endTime: timestamp + 0.05
        };
        const frames = await ctx.tauri.invoke("extract_video_frames", {
          path,
          options
        });
        if (frames && frames.length > 0) {
          const frame = frames[0];
          frame.timestamp = timestamp;
          frame.index = i;
          allFrames.push(frame);
        }
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoFrames] Extracted ${allFrames.length} frames at timestamps`);
      return allFrames;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoFrames] extractAtTimestamps failed: ${errMsg}`);
      throw error;
    }
  }
  async function extractLastFrame(path, outputFormat, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoFrames] Extracting last frame from: ${path}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native video processing requires Tauri");
    }
    try {
      const info = await ctx.tauri.invoke("get_video_info", { path });
      const duration = info.duration;
      const startTime = Math.max(0, duration - 0.1);
      const options = {
        intervalSeconds: 0.1,
        // High frequency to ensure we get a frame
        outputFormat,
        maxFrames: 1,
        startTime,
        endTime: duration
      };
      ctx.log("info", `[VideoFrames] Video duration: ${duration}s, extracting last frame from ${startTime}s`);
      const frames = await ctx.tauri.invoke("extract_video_frames", {
        path,
        options
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoFrames] Extracted last frame (got ${frames.length} frames)`);
      return frames;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoFrames] extractLastFrame failed: ${errMsg}`);
      throw error;
    }
  }
  async function extractBatch(path, intervalSeconds, batchSize, batchIndex, outputFormat, nodeId, scaleWidth, scaleHeight) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoFrames] Extracting batch ${batchIndex} from: ${path}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native video processing requires Tauri");
    }
    try {
      const result = await ctx.tauri.invoke("extract_video_frames_batch", {
        path,
        intervalSeconds,
        batchSize,
        batchIndex,
        outputFormat,
        scaleWidth,
        scaleHeight
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoFrames] Extracted batch ${batchIndex}: ${result.frames.length} frames`);
      if (result.frames.length > 0 && result.frames[0].path) {
        const firstFramePath = result.frames[0].path;
        const lastSlash = Math.max(firstFramePath.lastIndexOf("/"), firstFramePath.lastIndexOf("\\"));
        if (lastSlash > 0) {
          const tempDir = firstFramePath.substring(0, lastSlash);
          tempBatchFolders.add(tempDir);
        }
      }
      return result;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoFrames] extractBatch failed: ${errMsg}`);
      throw error;
    }
  }
  async function waitForComfyUIVideo(endpoint, promptId, outputNodeId, maxAttempts = 3600) {
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;
    for (let i = 0; i < maxAttempts; i++) {
      if (ctx.abortSignal?.aborted) {
        ctx.log("info", "[VideoGen] Aborted by user");
        throw new Error("Video generation aborted by user");
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
          const saveOutput = promptHistory.outputs[outputNodeId];
          if (saveOutput) {
            let targetFile = null;
            if (saveOutput.videos && saveOutput.videos.length > 0) {
              targetFile = saveOutput.videos[0];
            } else if (saveOutput.gifs && saveOutput.gifs.length > 0) {
              targetFile = saveOutput.gifs[0];
            } else if (saveOutput.images && saveOutput.images.length > 0) {
              targetFile = saveOutput.images[0];
            }
            if (targetFile) {
              const fileUrl = `${endpoint}/view?filename=${encodeURIComponent(targetFile.filename)}&subfolder=${encodeURIComponent(targetFile.subfolder || "")}&type=${encodeURIComponent(targetFile.type || "output")}`;
              return fileUrl;
            }
          }
        }
        if (i % 5 === 0) {
          ctx.log("info", `[VideoGen] Still generating... (${i}s)`);
        }
      } catch (error) {
        consecutiveErrors++;
        if (consecutiveErrors >= maxConsecutiveErrors) {
          throw new Error(`ComfyUI polling failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
      }
    }
    throw new Error(`Timeout waiting for video generation after ${maxAttempts} seconds`);
  }
  async function uploadImageToComfyUI(endpoint, imageData, filename) {
    let blob;
    let mimeType = "image/png";
    ctx.log("info", `[VideoGen] uploadImageToComfyUI input type: ${imageData.startsWith("data:") ? "data URL" : imageData.startsWith("http") ? "HTTP URL" : "unknown"}`);
    ctx.log("info", `[VideoGen] uploadImageToComfyUI input length: ${imageData.length}, preview: ${imageData.substring(0, 100)}`);
    if (imageData.startsWith("data:")) {
      const parts = imageData.split(",");
      const mimeMatch = parts[0].match(/:(.*?);/);
      mimeType = mimeMatch ? mimeMatch[1] : "image/png";
      const base64Data = parts[1];
      ctx.log("info", `[VideoGen] Decoding base64 data (${base64Data.length} chars, mime: ${mimeType})`);
      const byteChars = atob(base64Data);
      ctx.log("info", `[VideoGen] Decoded to ${byteChars.length} bytes`);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteNumbers[i] = byteChars.charCodeAt(i);
      }
      blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      ctx.log("info", `[VideoGen] Created blob: size=${blob.size}, type=${blob.type}`);
    } else if (imageData.startsWith("http")) {
      ctx.log("info", `[VideoGen] Fetching image from URL: ${imageData}`);
      const response = await ctx.secureFetch(imageData, { purpose: "Fetch image for ComfyUI" });
      ctx.log("info", `[VideoGen] Fetch response: status=${response.status}, content-type=${response.headers.get("content-type")}`);
      const arrayBuffer = await response.arrayBuffer();
      ctx.log("info", `[VideoGen] ArrayBuffer size: ${arrayBuffer.byteLength}`);
      mimeType = response.headers.get("content-type") || "image/png";
      blob = new Blob([arrayBuffer], { type: mimeType });
      ctx.log("info", `[VideoGen] Blob from URL: size=${blob.size}, type=${blob.type}`);
      const firstBytes = new Uint8Array(arrayBuffer.slice(0, 8));
      const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
      const isPng = firstBytes[0] === pngSignature[0] && firstBytes[1] === pngSignature[1];
      ctx.log("info", `[VideoGen] First 8 bytes: ${Array.from(firstBytes).map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
      ctx.log("info", `[VideoGen] Is PNG signature: ${isPng}`);
      if (blob.size < 100) {
        ctx.log("warn", `[VideoGen] Blob size suspiciously small (${blob.size} bytes)`);
      }
      if (!isPng && mimeType === "image/png") {
        ctx.log("warn", `[VideoGen] Expected PNG but signature doesn't match!`);
      }
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
    ctx.log("info", `[VideoGen] Uploading image to ComfyUI: ${finalFilename} (${mimeType}, ${blob.size} bytes)`);
    const file = new File([blob], finalFilename, { type: mimeType });
    ctx.log("info", `[VideoGen] Created File object: name=${file.name}, size=${file.size}, type=${file.type}`);
    const formData = new FormData();
    formData.append("image", file, finalFilename);
    formData.append("type", "input");
    formData.append("overwrite", "true");
    ctx.log("info", `[VideoGen] Using native fetch for upload to ${endpoint}/upload/image`);
    const uploadResponse = await fetch(`${endpoint}/upload/image`, {
      method: "POST",
      body: formData
    });
    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`ComfyUI upload error: ${uploadResponse.status} - ${errorText.substring(0, 200)}`);
    }
    const data = await uploadResponse.json();
    ctx.log("info", `[VideoGen] Upload response: ${JSON.stringify(data)}`);
    return data.name || finalFilename;
  }
  function extractImageSource(input) {
    if (typeof input === "string") {
      if (input.startsWith("data:")) return { dataUrl: input };
      if (input.startsWith("http")) return { url: input };
      return { path: input };
    }
    if (typeof input === "object" && input !== null) {
      const anyInput = input;
      if (anyInput.dataUrl) return { dataUrl: anyInput.dataUrl };
      if (anyInput.url) return { url: anyInput.url };
      if (anyInput.path) return { path: anyInput.path };
    }
    return {};
  }
  async function generateVideoWan2GP(endpoint, nodeId, prompt, model, width, height, frameCount, frameRate, imageInputs, steps, duration, imageEnd, vram, audioInput) {
    ctx.onNodeStatus?.(nodeId, "running");
    let baseUrl = endpoint || "http://127.0.0.1:8773";
    const port = extractPortFromUrl(baseUrl);
    if (port) {
      const result = await ensureServiceReadyByPort(port);
      if (result.success && result.port) {
        baseUrl = `http://127.0.0.1:${result.port}`;
      }
    }
    const apiUrl = `${baseUrl}/generate/video`;
    ctx.log("info", `[VideoGen] Wan2GP request to ${apiUrl}, model=${model || "wan_t2v_14b"}, steps=${steps || 30}, duration=${duration || 5}s`);
    const body = {
      prompt: prompt || "",
      negative_prompt: "",
      width: width || 832,
      height: height || 480,
      fps: frameRate || 24,
      steps: steps || 30,
      model: model || "wan_t2v_14b",
      seed: -1,
      duration: duration || 5
    };
    if (vram && vram !== "auto") {
      body.vram = parseInt(vram, 10);
    }
    if (frameCount && frameCount > 0) {
      body.frames = frameCount;
    }
    if (imageInputs && imageInputs.length > 0 && imageInputs[0]) {
      const imgInput = imageInputs[0];
      if (typeof imgInput === "string") {
        body.image_start = imgInput;
      } else if (typeof imgInput === "object" && imgInput !== null) {
        const obj = imgInput;
        body.image_start = obj.dataUrl || obj.path || obj.url || "";
      }
    }
    if (imageEnd) {
      if (typeof imageEnd === "string") {
        body.image_end = imageEnd;
      } else if (typeof imageEnd === "object" && imageEnd !== null) {
        const obj = imageEnd;
        body.image_end = obj.dataUrl || obj.path || obj.url || "";
      }
    }
    if (audioInput) {
      if (typeof audioInput === "string") {
        body.audio_guide = audioInput;
      } else if (typeof audioInput === "object" && audioInput !== null) {
        const obj = audioInput;
        body.audio_guide = obj.path || obj.dataUrl || obj.url || "";
      }
    }
    let submitResponse;
    const maxRetries = 30;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      submitResponse = await ctx.secureFetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        purpose: "Wan2GP video generation"
      });
      if (submitResponse.status !== 503) break;
      ctx.log("info", `[VideoGen] Wan2GP not ready yet, retrying in 10s... (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise((resolve) => setTimeout(resolve, 1e4));
    }
    if (!submitResponse || !submitResponse.ok) {
      const errorText = submitResponse ? await submitResponse.text() : "No response";
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Wan2GP video submit error: ${submitResponse?.status || 0} - ${errorText.substring(0, 200)}`);
    }
    const submitData = await submitResponse.json();
    const jobId = submitData.job_id;
    if (!jobId) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Wan2GP did not return a job_id");
    }
    ctx.log("info", `[VideoGen] Wan2GP job submitted: ${jobId}`);
    const pollIntervalMs = 5e3;
    const maxPollTime = 60 * 60 * 1e3;
    const startTime = Date.now();
    while (Date.now() - startTime < maxPollTime) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      const pollResponse = await ctx.secureFetch(`${baseUrl}/job/${jobId}`, {
        purpose: "Wan2GP job status poll"
      });
      if (!pollResponse.ok) {
        ctx.onNodeStatus?.(nodeId, "error");
        throw new Error(`Wan2GP poll error: ${pollResponse.status}`);
      }
      const pollData = await pollResponse.json();
      if (pollData.status === "completed") {
        const videoUrl = pollData.video || pollData.path || "";
        if (!videoUrl) {
          ctx.onNodeStatus?.(nodeId, "error");
          throw new Error("Wan2GP job completed but no video in response");
        }
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[VideoGen] Video generated: ${videoUrl}`);
        return videoUrl;
      }
      if (pollData.status === "failed") {
        ctx.onNodeStatus?.(nodeId, "error");
        throw new Error(`Wan2GP video generation failed: ${pollData.error || "Unknown error"}`);
      }
      const elapsed = pollData.elapsed ? ` (${Math.round(pollData.elapsed)}s)` : "";
      ctx.log("info", `[VideoGen] Wan2GP job ${jobId}: ${pollData.status}${elapsed}`);
    }
    ctx.onNodeStatus?.(nodeId, "error");
    throw new Error("Wan2GP video generation timed out after 1 hour");
  }
  async function generate(endpoint, nodeId, prompt, comfyWorkflow, comfyPrimaryPromptNodeId, comfyImageInputNodeIds, imageInputs, comfyImageInputConfigs, comfySeedMode, comfyFixedSeed, comfyAllImageNodeIds, comfyFrameCount, comfyWidth, comfyHeight, comfyFrameRate) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoGen] Generating video on ${endpoint}`);
    if (!comfyWorkflow) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("ComfyUI workflow is required");
    }
    let workflow;
    try {
      workflow = JSON.parse(comfyWorkflow);
    } catch {
      throw new Error("Invalid ComfyUI workflow JSON");
    }
    const videoAnalysis = analyzeComfyUIVideoWorkflow(workflow);
    const hasImageConnected = imageInputs && imageInputs.some((img) => img !== void 0 && img !== null && img !== "");
    const effectiveFrameCount = typeof comfyFrameCount === "number" && !isNaN(comfyFrameCount) ? comfyFrameCount : videoAnalysis.lengths[0]?.currentValue;
    const effectiveFrameRate = typeof comfyFrameRate === "number" && !isNaN(comfyFrameRate) ? comfyFrameRate : videoAnalysis.frameRates[0]?.currentValue;
    const effectiveWidth = !hasImageConnected && typeof comfyWidth === "number" && !isNaN(comfyWidth) ? comfyWidth : void 0;
    const effectiveHeight = !hasImageConnected && typeof comfyHeight === "number" && !isNaN(comfyHeight) ? comfyHeight : void 0;
    if (videoAnalysis.lengths.length > 0 || videoAnalysis.frameRates.length > 0 || !hasImageConnected && videoAnalysis.resolutions.length > 0) {
      workflow = applyVideoOverrides(workflow, {
        lengthNodeId: videoAnalysis.lengths[0]?.nodeId,
        length: effectiveFrameCount,
        resolutionNodeId: !hasImageConnected ? videoAnalysis.resolutions[0]?.nodeId : void 0,
        width: effectiveWidth,
        height: effectiveHeight,
        frameRateNodeId: videoAnalysis.frameRates[0]?.nodeId,
        frameRate: effectiveFrameRate
      });
      if (hasImageConnected) {
        ctx.log("info", `[VideoGen] Video params: frames=${effectiveFrameCount ?? "default"}, fps=${effectiveFrameRate ?? "default"} (using image resolution)`);
      } else {
        ctx.log("info", `[VideoGen] Video params: frames=${effectiveFrameCount ?? "default"}, size=${effectiveWidth ?? "?"}x${effectiveHeight ?? "?"}, fps=${effectiveFrameRate ?? "default"}`);
      }
    }
    if (prompt && comfyPrimaryPromptNodeId && workflow[comfyPrimaryPromptNodeId]) {
      const node = workflow[comfyPrimaryPromptNodeId];
      const textKeys = ["text", "prompt", "string", "positive"];
      for (const key of textKeys) {
        if (typeof node.inputs?.[key] === "string") {
          ctx.log("info", `[VideoGen] Overriding prompt in node ${comfyPrimaryPromptNodeId}.${key}`);
          node.inputs[key] = prompt;
          break;
        }
      }
    }
    const selectedNodeIds = new Set(comfyImageInputConfigs?.map((c) => c.nodeId) || comfyImageInputNodeIds || []);
    const nodesToBypass = /* @__PURE__ */ new Set();
    if (comfyImageInputConfigs && imageInputs) {
      for (let i = 0; i < comfyImageInputConfigs.length; i++) {
        const config = comfyImageInputConfigs[i];
        const imageInput = imageInputs[i];
        const hasInput = imageInput !== void 0 && imageInput !== null && imageInput !== "";
        if (!hasInput && config.allowBypass) {
          ctx.log("info", `[VideoGen] Node ${config.nodeId} (${config.title}) has no input and allowBypass=true - will be bypassed`);
          nodesToBypass.add(config.nodeId);
          selectedNodeIds.delete(config.nodeId);
        }
      }
    }
    if (comfyAllImageNodeIds && comfyAllImageNodeIds.length > 0) {
      for (const id of comfyAllImageNodeIds) {
        if (!selectedNodeIds.has(id)) {
          nodesToBypass.add(id);
        }
      }
    }
    for (const id of nodesToBypass) {
      if (workflow[id]) {
        const originalNode = workflow[id];
        if (originalNode.class_type === "LoadImage" || originalNode.class_type === "LoadImageMask") {
          const emptyWidth = effectiveWidth ?? 1280;
          const emptyHeight = effectiveHeight ?? 720;
          workflow[id] = {
            class_type: "EmptyImage",
            inputs: {
              width: emptyWidth,
              height: emptyHeight,
              batch_size: 1,
              color: 0
            },
            _meta: {
              title: `Empty Image (bypassing ${originalNode._meta?.title || "image input"})`
            }
          };
          ctx.log("info", `[VideoGen] Bypassed image node ${id}: replaced with EmptyImage ${emptyWidth}x${emptyHeight}`);
        } else {
          delete workflow[id];
          for (const [, otherNode] of Object.entries(workflow)) {
            const node = otherNode;
            if (node.inputs) {
              for (const [key, val] of Object.entries(node.inputs)) {
                if (Array.isArray(val) && val[0] === id) {
                  delete node.inputs[key];
                }
              }
            }
          }
        }
      }
    }
    if (hasImageConnected && typeof comfyWidth === "number" && !isNaN(comfyWidth) && typeof comfyHeight === "number" && !isNaN(comfyHeight)) {
      const resizeNodeTypes = ["ResizeImageMaskNode", "ImageResize", "ResizeImage", "ImageScale"];
      for (const [nodeId2, nodeVal] of Object.entries(workflow)) {
        const node = nodeVal;
        if (resizeNodeTypes.includes(node.class_type || "") && node.inputs) {
          if (node.inputs["resize_type.width"] !== void 0) {
            node.inputs["resize_type.width"] = comfyWidth;
            node.inputs["resize_type.height"] = comfyHeight;
            ctx.log("info", `[VideoGen] Updated resize node ${nodeId2} to ${comfyWidth}x${comfyHeight}`);
          }
        }
      }
    }
    const effectiveNodeIds = (comfyImageInputConfigs?.map((c) => c.nodeId) || comfyImageInputNodeIds || []).filter((nodeId2) => !nodesToBypass.has(nodeId2));
    if (imageInputs && effectiveNodeIds.length > 0) {
      for (let i = 0; i < effectiveNodeIds.length; i++) {
        const id = effectiveNodeIds[i];
        const input = imageInputs[i];
        if (!id || !workflow[id]) continue;
        if (input === void 0 || input === null || input === "") continue;
        const node = workflow[id];
        const source = extractImageSource(input);
        const filename = `zipp_vid_in_${id}_${Date.now()}.png`;
        let imageDataToUpload;
        if (source.url) {
          imageDataToUpload = source.url;
          ctx.log("info", `[VideoGen] Passing URL directly to upload: ${source.url.substring(0, 100)}`);
        } else if (source.dataUrl) {
          imageDataToUpload = source.dataUrl;
          ctx.log("info", `[VideoGen] Using data URL for upload`);
        } else if (source.path && ctx.tauri) {
          try {
            let p = source.path;
            if (p.startsWith("\\\\?\\")) p = p.substring(4);
            const res2 = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", { path: p, readAs: "base64" });
            if (res2.content) {
              const ext = p.split(".").pop()?.toLowerCase() || "png";
              const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
              imageDataToUpload = res2.content.startsWith("data:") ? res2.content : `data:${mime};base64,${res2.content}`;
              ctx.log("info", `[VideoGen] Read local file for upload: ${p}`);
            }
          } catch (e) {
            ctx.log("warn", `[VideoGen] Failed to read local input: ${e}`);
          }
        }
        if (imageDataToUpload) {
          try {
            const uploaded = await uploadImageToComfyUI(endpoint, imageDataToUpload, filename);
            if (node.class_type === "LoadImage" || node.class_type === "LoadImageMask") {
              node.inputs.image = uploaded;
            } else if (node.class_type === "LoadImageBase64") {
              if (imageDataToUpload.startsWith("data:")) {
                node.inputs.image_base64 = imageDataToUpload;
              } else {
                const res2 = await ctx.secureFetch(imageDataToUpload, { purpose: "Fetch image for base64" });
                const blob = await res2.blob();
                const ab = await blob.arrayBuffer();
                const bytes = new Uint8Array(ab);
                let bin = "";
                for (let j = 0; j < bytes.length; j++) bin += String.fromCharCode(bytes[j]);
                node.inputs.image_base64 = `data:${blob.type || "image/png"};base64,${btoa(bin)}`;
              }
            }
            ctx.log("info", `[VideoGen] Uploaded input for node ${id}: ${uploaded}`);
          } catch (e) {
            ctx.log("error", `[VideoGen] Upload failed: ${e}`);
          }
        }
      }
    }
    const effSeedMode = comfySeedMode || "random";
    for (const [, nodeValue] of Object.entries(workflow)) {
      const node = nodeValue;
      if (!node.inputs) continue;
      const seedKeys = ["seed", "noise_seed"];
      for (const key of seedKeys) {
        if (node.inputs[key] !== void 0) {
          if (effSeedMode === "random" || effSeedMode === "workflow" && node.inputs[key] === -1) {
            node.inputs[key] = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
          } else if (effSeedMode === "fixed" && comfyFixedSeed !== null) {
            node.inputs[key] = comfyFixedSeed;
          }
        }
      }
    }
    let outputNodeId = "";
    for (const [key, val] of Object.entries(workflow)) {
      const type = val.class_type;
      if (["SaveVideo", "VHS_VideoCombine", "VHS_VideoSave", "SaveImage"].includes(type)) {
        outputNodeId = key;
        if (type.includes("Video")) break;
      }
    }
    if (!outputNodeId) {
      ctx.log("warn", "[VideoGen] No obvious output node found (checking for SaveVideo/SaveImage)");
    }
    ctx.log("info", `[VideoGen] === WORKFLOW DEBUG START ===`);
    ctx.log("info", `[VideoGen] ${JSON.stringify(workflow)}`);
    ctx.log("info", `[VideoGen] === WORKFLOW DEBUG END ===`);
    const res = await ctx.secureFetch(`${endpoint}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: workflow }),
      purpose: "ComfyUI video gen"
    });
    if (!res.ok) {
      const err = await res.text();
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`ComfyUI Error: ${res.status} - ${err}`);
    }
    const data = await res.json();
    const promptId = data.prompt_id;
    ctx.log("info", `[VideoGen] Queued ${promptId}, output node: ${outputNodeId}`);
    try {
      const videoUrl = await waitForComfyUIVideo(endpoint, promptId, outputNodeId);
      ctx.onNodeStatus?.(nodeId, "completed");
      return videoUrl;
    } catch (e) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw e;
    }
  }
  async function save(videoUrlInput, savePath, filename, format, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[VideoSave] Saving video to ${savePath || "auto"}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Native filesystem access requires Tauri");
    }
    let videoUrl;
    if (typeof videoUrlInput === "object" && videoUrlInput !== null) {
      videoUrl = videoUrlInput.video || videoUrlInput.path || "";
    } else {
      videoUrl = videoUrlInput || "";
    }
    if (!videoUrl) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("No video URL provided");
    }
    if (videoUrl.startsWith("Error:") || videoUrl.includes("Failed:")) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Video input is an error from upstream node: ${videoUrl.substring(0, 100)}...`);
    }
    try {
      let blob;
      if (videoUrl.startsWith("data:")) {
        const parts = videoUrl.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mimeType = mimeMatch ? mimeMatch[1] : "video/mp4";
        const base64Data = parts[1];
        const byteChars = atob(base64Data);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
          byteNumbers[i] = byteChars.charCodeAt(i);
        }
        blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
      } else if (videoUrl.startsWith("http")) {
        const response = await ctx.secureFetch(videoUrl, { purpose: "Download video for save" });
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);
        blob = await response.blob();
      } else {
        const ext2 = format || "mp4";
        const targetFilename2 = `${filename || "video"}.${ext2}`;
        let targetPath2 = savePath;
        if (!targetPath2 || targetPath2 === "") {
          const downloads = await ctx.tauri.invoke("plugin:zipp-filesystem|get_downloads_path");
          targetPath2 = `${downloads}/${targetFilename2}`;
        } else if (!targetPath2.endsWith(`.${ext2}`)) {
          targetPath2 = `${targetPath2}/${targetFilename2}`;
        }
        await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
          source: videoUrl,
          destination: targetPath2,
          createDirs: true
        });
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[VideoSave] Video copied to ${targetPath2}`);
        return targetPath2;
      }
      const ext = format || "mp4";
      const targetFilename = `${filename || "video"}.${ext}`;
      let targetPath = savePath;
      if (!targetPath || targetPath === "") {
        const downloads = await ctx.tauri.invoke("plugin:zipp-filesystem|get_downloads_path");
        targetPath = `${downloads}/${targetFilename}`;
      } else if (!targetPath.endsWith(`.${ext}`)) {
        targetPath = `${targetPath}/${targetFilename}`;
      }
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
        path: targetPath,
        content: base64,
        contentType: "base64",
        createDirs: true
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[VideoSave] Video saved to ${targetPath}`);
      return targetPath;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoSave] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function extendVideos(videos, durations, filename, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      const targetDurations = durations || [];
      const extractPath = (v) => {
        if (!v) return void 0;
        if (typeof v === "string") return v;
        return v.video || v.path || void 0;
      };
      const videoPaths = videos.map(extractPath).filter((v) => !!v);
      if (videoPaths.length === 0) {
        throw new Error("No videos provided for extension");
      }
      ctx.log("info", `[ExtendVideos] Processing ${videoPaths.length} videos`);
      ctx.log("info", `[ExtendVideos] Target durations: ${targetDurations.map((d) => d?.toFixed(1) || "?").join(", ")}s`);
      const appDataDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (!appDataDir) throw new Error("Could not get app data directory");
      const extendedVideos = [];
      for (let i = 0; i < videoPaths.length; i++) {
        const videoPath = videoPaths[i];
        const targetDuration = targetDurations[i];
        if (!targetDuration || targetDuration <= 0) {
          ctx.log("info", `[ExtendVideos] Video ${i}: No target duration, passing through`);
          extendedVideos.push(videoPath);
          continue;
        }
        let currentDuration = 0;
        try {
          const videoInfo = await ctx.tauri?.invoke("get_video_info", { path: videoPath });
          currentDuration = videoInfo?.duration || 0;
        } catch (e) {
          ctx.log("warn", `[ExtendVideos] Could not get video ${i} duration: ${e}`);
          extendedVideos.push(videoPath);
          continue;
        }
        ctx.log("info", `[ExtendVideos] Video ${i}: current ${currentDuration.toFixed(1)}s, target ${targetDuration.toFixed(1)}s`);
        if (currentDuration >= targetDuration - 0.5) {
          ctx.log("info", `[ExtendVideos] Video ${i}: Already long enough, passing through`);
          extendedVideos.push(videoPath);
          continue;
        }
        const padDuration = targetDuration - currentDuration;
        ctx.log("info", `[ExtendVideos] Video ${i}: Extending by ${padDuration.toFixed(1)}s (freeze frame)`);
        const outputPath = `${appDataDir}/output/${filename || "extended"}_${i}_${Date.now()}.mp4`;
        const args = [
          "-i",
          videoPath.replace(/\\/g, "/"),
          "-vf",
          `tpad=stop_mode=clone:stop_duration=${padDuration.toFixed(2)}`,
          "-c:a",
          "copy",
          "-y",
          outputPath
        ];
        const result = await ctx.tauri?.invoke(
          "plugin:zipp-filesystem|run_command",
          { command: "ffmpeg", args, cwd: null }
        );
        if (result?.code !== 0) {
          ctx.log("warn", `[ExtendVideos] Video ${i}: FFmpeg extend failed: ${result?.stderr}`);
          extendedVideos.push(videoPath);
        } else {
          ctx.log("info", `[ExtendVideos] Video ${i}: Extended to ${outputPath}`);
          extendedVideos.push(outputPath);
        }
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { videos: extendedVideos };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[ExtendVideos] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function appendVideos(videos, filename, format, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      const extractPath = (v) => {
        if (!v) return void 0;
        if (typeof v === "string") return v;
        return v.video || v.path || void 0;
      };
      const validVideos = videos.map(extractPath).filter((v) => !!v && typeof v === "string" && v.trim() !== "");
      if (validVideos.length === 0) {
        throw new Error("No videos provided for concatenation");
      }
      ctx.log("info", `[VideoAppend] Concatenating ${validVideos.length} videos`);
      const appDataDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (!appDataDir) throw new Error("Could not get app data directory");
      const outputPath = `${appDataDir}/output/${filename || "appended"}_${Date.now()}.${format || "mp4"}`;
      const tempDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_temp_dir");
      if (!tempDir) throw new Error("Could not get temp directory");
      const concatListPath = `${tempDir}/zipp_concat_${Date.now()}.txt`;
      const videoEntries = [];
      for (const video of validVideos) {
        if (video.startsWith("http://") || video.startsWith("https://")) {
          videoEntries.push(`file '${video}'`);
        } else {
          videoEntries.push(`file '${video.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
        }
      }
      await ctx.tauri?.invoke("plugin:zipp-filesystem|write_file", {
        path: concatListPath,
        content: videoEntries.join("\n"),
        contentType: "text",
        createDirs: true
      });
      const result = await ctx.tauri?.invoke(
        "plugin:zipp-filesystem|run_command",
        {
          command: "ffmpeg",
          args: [
            "-f",
            "concat",
            "-safe",
            "0",
            "-protocol_whitelist",
            "file,http,https,tcp,tls",
            "-i",
            concatListPath,
            "-c",
            "copy",
            "-y",
            outputPath
          ],
          cwd: null
        }
      );
      await ctx.tauri?.invoke("plugin:zipp-filesystem|delete_file", { path: concatListPath }).catch((e) => {
        ctx.log?.("info", `[VideoAppend] Cleanup failed for ${concatListPath}: ${e}`);
      });
      if (result?.code !== 0) {
        throw new Error(`FFmpeg concat failed: ${result?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[VideoAppend] Output saved to ${outputPath}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return { video: outputPath, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[VideoAppend] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function mixAudio(video, audio, videoVolume, audioVolume, replaceAudio, filename, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      let videoPath = typeof video === "string" ? video : video?.path || video?.video || "";
      if (!videoPath) throw new Error("No video provided");
      let audioPath = typeof audio === "string" ? audio : audio?.path || "";
      if (!audioPath) throw new Error("No audio provided");
      if (audioPath.startsWith("data:")) {
        throw new Error('Audio input is a data URL. Please connect the TTS "path" output instead of "audio" output.');
      }
      videoPath = videoPath.replace(/\\/g, "/");
      audioPath = audioPath.replace(/\\/g, "/");
      const videoVol = typeof videoVolume === "number" ? videoVolume : 1;
      const audioVol = typeof audioVolume === "number" ? audioVolume : 1;
      ctx.log("info", `[AudioMixer] Mixing audio (videoVol=${videoVol}, audioVol=${audioVol}, replace=${replaceAudio})`);
      ctx.log("info", `[AudioMixer] Video path: ${videoPath}`);
      ctx.log("info", `[AudioMixer] Audio path: ${audioPath}`);
      const appDataDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (!appDataDir) throw new Error("Could not get app data directory");
      const outputPath = `${appDataDir}/output/${filename || "mixed"}_${Date.now()}.mp4`;
      let args;
      if (replaceAudio) {
        let audioDuration = 0;
        let videoDuration = 0;
        try {
          const audioInfo = await ctx.tauri?.invoke("get_video_info", { path: audioPath });
          audioDuration = audioInfo?.duration || 0;
        } catch (e) {
          ctx.log("warn", `[AudioMixer] Could not get audio duration, will use default behavior`);
        }
        try {
          const videoInfo = await ctx.tauri?.invoke("get_video_info", { path: videoPath });
          videoDuration = videoInfo?.duration || 0;
        } catch (e) {
          ctx.log("warn", `[AudioMixer] Could not get video duration, will use default behavior`);
        }
        ctx.log("info", `[AudioMixer] Video duration: ${videoDuration.toFixed(2)}s, Audio duration: ${audioDuration.toFixed(2)}s`);
        if (audioDuration > videoDuration && videoDuration > 0) {
          const padDuration = audioDuration - videoDuration + 0.5;
          ctx.log("info", `[AudioMixer] Extending video by ${padDuration.toFixed(2)}s with freeze frame`);
          args = [
            "-i",
            videoPath,
            "-i",
            audioPath,
            "-filter_complex",
            `[0:v]tpad=stop_mode=clone:stop_duration=${padDuration.toFixed(2)}[vout]`,
            "-map",
            "[vout]",
            "-map",
            "1:a",
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-af",
            `volume=${audioVol}`,
            "-y",
            outputPath
          ];
        } else {
          ctx.log("info", `[AudioMixer] Keeping full video duration (video has padding for freeze frame)`);
          args = [
            "-i",
            videoPath,
            "-i",
            audioPath,
            "-map",
            "0:v",
            "-map",
            "1:a",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-af",
            `volume=${audioVol}`,
            "-y",
            outputPath
          ];
        }
      } else {
        args = [
          "-i",
          videoPath,
          "-i",
          audioPath,
          "-filter_complex",
          `[0:a]volume=${videoVol}[a0];[1:a]volume=${audioVol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
          "-map",
          "0:v",
          "-map",
          "[aout]",
          "-c:v",
          "copy",
          "-c:a",
          "aac",
          "-y",
          outputPath
        ];
      }
      const result = await ctx.tauri?.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffmpeg", args, cwd: null }
      );
      if (result?.code !== 0) {
        throw new Error(`FFmpeg mix failed: ${result?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[AudioMixer] Output saved to ${outputPath}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return { video: outputPath, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[AudioMixer] Failed: ${errMsg}`);
      if (error instanceof Error && error.stack) {
        ctx.log("error", `[AudioMixer] Stack: ${error.stack}`);
      }
      throw error;
    }
  }
  async function videoPip(mainVideo, pipVideo, position, size, margin, shape, mainVolume, pipVolume, startTime, pipDuration, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      const isErrorString = (s) => {
        return s.startsWith("Error:") || s.includes("Failed:") || s.includes("error:");
      };
      const mainPath = typeof mainVideo === "string" ? mainVideo : mainVideo?.path || mainVideo?.video || "";
      const pipPath = typeof pipVideo === "string" ? pipVideo : pipVideo?.path || pipVideo?.video || "";
      if (!mainPath) {
        ctx.log("info", `[VideoPiP] No main video provided - skipping PiP`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return { video: "", path: "" };
      }
      if (!pipPath) {
        ctx.log("info", `[VideoPiP] No PiP video provided - returning empty (use TTS mix path instead)`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return { video: "", path: "" };
      }
      if (isErrorString(mainPath)) throw new Error(`Main video input is an error from upstream: ${mainPath.substring(0, 100)}...`);
      if (isErrorString(pipPath)) throw new Error(`PiP video input is an error from upstream: ${pipPath.substring(0, 100)}...`);
      const pipSize = typeof size === "number" ? size : 25;
      const pipMargin = typeof margin === "number" ? margin : 20;
      const mainVol = typeof mainVolume === "number" ? mainVolume : 1;
      const pipVol = typeof pipVolume === "number" ? pipVolume : 1;
      const pipStartTime = typeof startTime === "number" ? startTime : 0;
      const pipDur = typeof pipDuration === "number" ? pipDuration : 0;
      ctx.log("info", `[VideoPiP] Creating PiP overlay (position=${position}, size=${pipSize}%, margin=${pipMargin}px, shape=${shape})`);
      ctx.log("info", `[VideoPiP] Audio: mainVol=${mainVol}, pipVol=${pipVol}`);
      ctx.log("info", `[VideoPiP] Timing: startTime=${pipStartTime}s, duration=${pipDur}s (0=auto)`);
      ctx.log("info", `[VideoPiP] Main video: ${mainPath}`);
      ctx.log("info", `[VideoPiP] PiP video: ${pipPath}`);
      let pipVideoDuration = 0;
      try {
        const pipInfo = await ctx.tauri?.invoke("get_video_info", { path: pipPath });
        if (pipInfo) {
          pipVideoDuration = pipInfo.duration;
          ctx.log("info", `[VideoPiP] PiP video duration: ${pipVideoDuration}s`);
        }
      } catch (e) {
        ctx.log("warn", `[VideoPiP] Could not get PiP duration, using fallback`);
      }
      const pipEndTime = pipStartTime + (pipDur > 0 ? pipDur : pipVideoDuration);
      const appDataDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (!appDataDir) throw new Error("Could not get app data directory");
      const outputPath = `${appDataDir}/output/pip_${Date.now()}.mp4`;
      const scaleExpr = `iw*${pipSize / 100}:-1`;
      let xPos, yPos;
      switch (position) {
        case "top-left":
          xPos = String(pipMargin);
          yPos = String(pipMargin);
          break;
        case "top-right":
          xPos = `W-w-${pipMargin}`;
          yPos = String(pipMargin);
          break;
        case "bottom-left":
          xPos = String(pipMargin);
          yPos = `H-h-${pipMargin}`;
          break;
        case "bottom-right":
        default:
          xPos = `W-w-${pipMargin}`;
          yPos = `H-h-${pipMargin}`;
          break;
      }
      let videoFilter;
      let enableExpr = "";
      if (pipDur > 0) {
        enableExpr = `:enable='lte(t,${pipStartTime + pipDur})'`;
      }
      if (shape === "circle") {
        videoFilter = `[1:v]scale=${scaleExpr},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(gt(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),0,255)'[pip];[0:v][pip]overlay=${xPos}:${yPos}:eof_action=pass${enableExpr}[vout]`;
      } else if (shape === "rounded") {
        videoFilter = `[1:v]scale=${scaleExpr},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(X,0,W*0.1)*between(Y,0,H*0.1)*gt(pow(X-W*0.1,2)+pow(Y-H*0.1,2),pow(W*0.1,2)),0,if(between(X,W*0.9,W)*between(Y,0,H*0.1)*gt(pow(X-W*0.9,2)+pow(Y-H*0.1,2),pow(W*0.1,2)),0,if(between(X,0,W*0.1)*between(Y,H*0.9,H)*gt(pow(X-W*0.1,2)+pow(Y-H*0.9,2),pow(W*0.1,2)),0,if(between(X,W*0.9,W)*between(Y,H*0.9,H)*gt(pow(X-W*0.9,2)+pow(Y-H*0.9,2),pow(W*0.1,2)),0,255))))'[pip];[0:v][pip]overlay=${xPos}:${yPos}:eof_action=pass${enableExpr}[vout]`;
      } else {
        videoFilter = `[1:v]scale=${scaleExpr}[pip];[0:v][pip]overlay=${xPos}:${yPos}:eof_action=pass${enableExpr}[vout]`;
      }
      let audioFilter;
      if (pipStartTime > 0 || pipEndTime > 0) {
        const mainVolExpr = `volume='if(between(t,${pipStartTime},${pipEndTime}),${mainVol},1)':eval=frame`;
        const delayMs = Math.round(pipStartTime * 1e3);
        if (pipStartTime > 0) {
          audioFilter = `[0:a]${mainVolExpr}[a0];[1:a]adelay=${delayMs}|${delayMs},volume=${pipVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
        } else {
          audioFilter = `[0:a]${mainVolExpr}[a0];[1:a]volume=${pipVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
        }
        ctx.log("info", `[VideoPiP] Audio ducking: main vol ${mainVol} from ${pipStartTime}s to ${pipEndTime}s`);
      } else {
        audioFilter = `[0:a]volume=${mainVol}[a0];[1:a]volume=${pipVol}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]`;
      }
      const filterComplex = `${videoFilter};${audioFilter}`;
      const args = [
        "-i",
        mainPath
      ];
      if (pipStartTime > 0) {
        args.push("-itsoffset", String(pipStartTime));
      }
      args.push(
        "-i",
        pipPath,
        "-filter_complex",
        filterComplex,
        "-map",
        "[vout]",
        "-map",
        "[aout]",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        "-y",
        outputPath
      );
      ctx.log("info", `[VideoPiP] Running FFmpeg with filter_complex`);
      const result = await ctx.tauri?.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffmpeg", args, cwd: null }
      );
      if (result?.code !== 0) {
        ctx.log("error", `[VideoPiP] FFmpeg stderr: ${result?.stderr}`);
        throw new Error(`FFmpeg PiP failed: ${result?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[VideoPiP] Output saved to ${outputPath}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return { video: outputPath, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[VideoPiP] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function generateAvatar(image, audio, prompt, apiUrl, guidanceScale, numInferenceSteps, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      let imagePath = null;
      if (typeof image === "string") {
        imagePath = image;
      } else if (image && typeof image === "object") {
        imagePath = image.path || null;
      }
      let audioPath = null;
      if (typeof audio === "string") {
        audioPath = audio;
      } else if (audio && typeof audio === "object") {
        audioPath = audio.path || audio.audio || null;
      }
      if (!imagePath) {
        ctx.log("info", `[VideoAvatar] No image provided - skipping avatar generation`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return { video: "", path: "" };
      }
      if (!audioPath) {
        ctx.log("info", `[VideoAvatar] No audio provided - skipping avatar generation`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return { video: "", path: "" };
      }
      ctx.log("info", `[VideoAvatar] Generating avatar video...`);
      ctx.log("info", `[VideoAvatar] Image: ${imagePath}`);
      ctx.log("info", `[VideoAvatar] Audio: ${audioPath}`);
      ctx.log("info", `[VideoAvatar] API URL: ${apiUrl}`);
      await checkServiceAvailable(apiUrl, "Video Avatar");
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          image_path: imagePath,
          audio_path: audioPath
        })
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Video Avatar service error: ${response.status} - ${errorText}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Video Avatar generation failed");
      }
      ctx.log("info", `[VideoAvatar] Generated video: ${result.video_path}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return {
        video: result.video_path,
        path: result.video_path
      };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[VideoAvatar] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function videoCaptions(video, text, position, fontSize, fontColor, backgroundColor, padding, margin, nodeId, durations) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      const videoPath = typeof video === "string" ? video : video?.path || video?.video || "";
      if (!videoPath) throw new Error("No video provided");
      if (!text || text.trim() === "") {
        ctx.log("info", `[VideoCaptions] No text provided - skipping captions, returning video as-is`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return { video: videoPath, path: videoPath };
      }
      const videoInfo = await ctx.tauri?.invoke("get_video_info", { path: videoPath });
      const videoDuration = videoInfo?.duration || 30;
      const segments = text.split(/\s*\.\.\.\s*/).filter((s) => s.trim());
      let segmentTimings = [];
      if (durations && Array.isArray(durations) && durations.length > 0) {
        let currentTime = 0;
        for (let i = 0; i < segments.length; i++) {
          const duration = durations[i] || videoDuration / segments.length;
          segmentTimings.push({ start: currentTime, end: currentTime + duration });
          currentTime += duration;
        }
        ctx.log("info", `[VideoCaptions] Using per-scene durations: ${durations.map((d) => d.toFixed(1)).join(", ")}s`);
      } else {
        const segmentDuration = videoDuration / Math.max(segments.length, 1);
        for (let i = 0; i < segments.length; i++) {
          segmentTimings.push({ start: i * segmentDuration, end: (i + 1) * segmentDuration });
        }
        ctx.log("info", `[VideoCaptions] Using equal division: ${(videoDuration / segments.length).toFixed(1)}s each`);
      }
      ctx.log("info", `[VideoCaptions] Adding captions to video (${segments.length} segments)`);
      ctx.log("info", `[VideoCaptions] Video: ${videoPath}`);
      ctx.log("info", `[VideoCaptions] Style: ${fontSize}px ${fontColor} on ${backgroundColor}`);
      const appDataDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (!appDataDir) throw new Error("Could not get app data directory");
      const outputPath = `${appDataDir}/output/captioned_${Date.now()}.mp4`;
      let yExpr;
      const effectiveMargin = margin || 50;
      switch (position) {
        case "top":
          yExpr = String(effectiveMargin);
          break;
        case "center":
          yExpr = "(h-text_h)/2";
          break;
        case "bottom":
        default:
          yExpr = `h-text_h-${effectiveMargin}`;
          break;
      }
      const effectiveFontSize = fontSize || 48;
      const effectiveFontColor = fontColor || "white";
      const fontFile = "C\\:/Windows/Fonts/comic.ttf";
      const horizontalMargin = effectiveMargin;
      let effectiveBgColor = backgroundColor || "black@0.7";
      const rgbaMatch = effectiveBgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        const a = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;
        effectiveBgColor = `0x${r}${g}${b}@${a}`;
      }
      const effectivePadding = padding || 15;
      const tempDir = await ctx.tauri?.invoke("plugin:zipp-filesystem|get_temp_dir");
      if (!tempDir) throw new Error("Could not get temp directory");
      const textFiles = [];
      const drawtextFilters = [];
      const wrapText = (text2, maxCharsPerLine2) => {
        const words = text2.split(" ");
        const lines = [];
        let currentLine = "";
        for (const word of words) {
          if (currentLine.length === 0) {
            currentLine = word;
          } else if (currentLine.length + 1 + word.length <= maxCharsPerLine2) {
            currentLine += " " + word;
          } else {
            lines.push(currentLine);
            currentLine = word;
          }
        }
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        return lines.join("\n");
      };
      const maxCharsPerLine = Math.max(25, Math.min(40, Math.floor(50 * 48 / effectiveFontSize)));
      for (let i = 0; i < segments.length; i++) {
        let segmentText = segments[i].trim().replace(/[\r\n]+/g, " ").replace(/—/g, "-").replace(/–/g, "-").replace(/'/g, "'").replace(/'/g, "'").replace(/"/g, '"').replace(/"/g, '"').replace(/…/g, "...").replace(/\[|\]/g, "");
        segmentText = wrapText(segmentText, maxCharsPerLine);
        const cleanLines = wrapText(segments[i].trim().replace(/[\r\n]+/g, " "), maxCharsPerLine).split("\n").map((line) => line.trim().replace(/[^\x20-\x7E]/g, "")).filter((line) => line.length > 0);
        const { start: startTime, end: endTime } = segmentTimings[i];
        const normalizedTempDir = tempDir.replace(/[\/\\]+$/, "");
        const lineHeight = effectiveFontSize + 8;
        for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
          const lineText = cleanLines[lineIdx];
          const textFilePath = `${normalizedTempDir}/zipp_caption_${Date.now()}_${i}_${lineIdx}.txt`;
          await ctx.tauri?.invoke("plugin:zipp-filesystem|write_file", {
            path: textFilePath,
            content: lineText,
            contentType: "text",
            createDirs: true
          });
          textFiles.push(textFilePath);
          let ffmpegPath = textFilePath.replace(/\\/g, "/");
          ffmpegPath = ffmpegPath.replace(/^([A-Za-z]):/, "$1\\:");
          const totalLines = cleanLines.length;
          const lineOffset = (totalLines - 1 - lineIdx) * lineHeight;
          let lineYExpr;
          switch (position) {
            case "top":
              lineYExpr = `${effectiveMargin + lineIdx * lineHeight}`;
              break;
            case "center":
              lineYExpr = `(h/2)-(${totalLines}*${lineHeight}/2)+(${lineIdx}*${lineHeight})`;
              break;
            case "bottom":
            default:
              lineYExpr = `h-${effectiveMargin}-${lineOffset}-${effectiveFontSize}`;
              break;
          }
          drawtextFilters.push(
            `drawtext=textfile='${ffmpegPath}':fontfile='${fontFile}':fontsize=${effectiveFontSize}:fontcolor=${effectiveFontColor}:x=(w-text_w)/2:y=${lineYExpr}:box=1:boxcolor=${effectiveBgColor}:boxborderw=${effectivePadding}:enable='between(t,${startTime.toFixed(2)},${endTime.toFixed(2)})'`
          );
        }
      }
      const filterComplex = drawtextFilters.join(",");
      const args = [
        "-i",
        videoPath,
        "-vf",
        filterComplex,
        "-c:a",
        "copy",
        "-y",
        outputPath
      ];
      ctx.log("info", `[VideoCaptions] Running FFmpeg with ${drawtextFilters.length} text segments`);
      const result = await ctx.tauri?.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffmpeg", args, cwd: null }
      );
      for (const tf of textFiles) {
        await ctx.tauri?.invoke("plugin:zipp-filesystem|delete_file", { path: tf }).catch((e) => {
          ctx.log?.("info", `[VideoCaptions] Cleanup failed for ${tf}: ${e}`);
        });
      }
      if (result?.code !== 0) {
        ctx.log("error", `[VideoCaptions] FFmpeg stderr: ${result?.stderr}`);
        throw new Error(`FFmpeg captions failed: ${result?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[VideoCaptions] Output saved to ${outputPath}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return { video: outputPath, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[VideoCaptions] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function downloadVideo(url, apiUrl, mode, start, end, quality, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!url) {
        throw new Error("No URL provided");
      }
      ctx.log("info", `[VideoDownloader] Downloading (${mode}): ${url}`);
      ctx.log("info", `[VideoDownloader] API URL: ${apiUrl}`);
      ctx.log("info", `[VideoDownloader] Quality: ${quality}, Time: ${start}s - ${end ?? "end"}`);
      await checkServiceAvailable(apiUrl, "Video Downloader");
      let response;
      try {
        response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            url,
            mode,
            start,
            end,
            quality
          })
        });
      } catch (fetchError) {
        throw new Error("Video Downloader service is not running. Please start it from the Services panel (gear icon > Services).");
      }
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Video Downloader service error: ${response.status} - ${errorText}`);
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error(result.message || "Download failed");
      }
      ctx.log("success", `[VideoDownloader] Downloaded: ${result.file_path} (${result.duration_seconds?.toFixed(1)}s)`);
      if (result.width && result.height) {
        ctx.log("info", `[VideoDownloader] Resolution: ${result.width}x${result.height}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return {
        video: result.file_path,
        path: result.file_path,
        duration: result.duration_seconds || 0,
        width: result.width || null,
        height: result.height || null
      };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[VideoDownloader] Failed: ${errMsg}`);
      throw error;
    }
  }
  var CoreVideoRuntime = {
    name: "VideoFrames",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Video] Module initialized");
      if (!ctx.tauri) {
        ctx.log("warn", "[Video] Native video processing unavailable - Tauri not detected");
      }
    },
    methods: {
      getInfo,
      extract,
      extractAtTimestamps,
      extractLastFrame,
      extractBatch,
      generate,
      generateVideoWan2GP,
      generateAvatar,
      save,
      saveVideo: save,
      // Alias for compatibility
      extendVideos,
      appendVideos,
      mixAudio,
      videoPip,
      videoCaptions,
      downloadVideo
    },
    async cleanup() {
      ctx?.log?.("info", "[Video] Module cleanup");
      if (ctx?.tauri && tempBatchFolders.size > 0) {
        for (const path of tempBatchFolders) {
          try {
            await ctx.tauri.invoke("cleanup_temp_dir", { path });
          } catch (e) {
            ctx?.log?.("info", `[Video] Cleanup failed for ${path}: ${e}`);
          }
        }
        tempBatchFolders.clear();
      }
    }
  };
  var runtime_default = CoreVideoRuntime;

  // ../zipp-core/modules/core-video/compiler.ts
  var CoreVideoCompiler = {
    name: "Video",
    getNodeTypes() {
      return ["video_frame_extractor", "video_gen", "audio_mixer", "video_append", "video_save", "video_avatar", "video_pip", "video_captions", "video_downloader"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, skipVarDeclaration, escapeString, debugEnabled } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const debug = debugEnabled ?? false;
      const inputVar = inputs.get("video") || inputs.get("default") || inputs.get("input") || "null";
      if (nodeType === "audio_mixer") {
        const videoVar = inputs.get("video") || "null";
        const audioVar = inputs.get("audio") || "null";
        const videoVolume = Number(data.videoVolume) || 1;
        const audioVolume = Number(data.audioVolume) || 1;
        const replaceAudio = Boolean(data.replaceAudio);
        const filename = escapeString(String(data.filename || "mixed_video"));
        const code2 = `
  // --- Node: ${node.id} (audio_mixer) ---
  ${letOrAssign}${outputVar} = await VideoFrames.mixAudio(
    ${videoVar},
    ${audioVar},
    ${videoVolume},
    ${audioVolume},
    ${replaceAudio},
    "${filename}",
    "${node.id}"
  );
  // Destructure outputs for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here
  let ${outputVar}_video = ${outputVar}.video;
  let ${outputVar}_path = ${outputVar}.path;
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_append") {
        const videosArrayVar = inputs.get("videos");
        const video1Var = inputs.get("video_1") || "null";
        const video2Var = inputs.get("video_2") || "null";
        const video3Var = inputs.get("video_3") || "null";
        const video4Var = inputs.get("video_4") || "null";
        const filename = escapeString(String(data.filename || "appended_video"));
        const format = escapeString(String(data.format || "mp4"));
        const videosExpr = videosArrayVar ? `(Array.isArray(${videosArrayVar}) ? ${videosArrayVar} : [${videosArrayVar}])` : `[${video1Var}, ${video2Var}, ${video3Var}, ${video4Var}]`;
        const code2 = `
  // --- Node: ${node.id} (video_append) ---
  ${letOrAssign}${outputVar} = await VideoFrames.appendVideos(
    ${videosExpr},
    "${filename}",
    "${format}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Destructure outputs for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here
  let ${outputVar}_video = ${outputVar};
  let ${outputVar}_path = ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_save") {
        const videoVar = inputs.get("video") || inputs.get("default") || inputs.get("input") || "null";
        const savePath = escapeString(String(data.savePath || data.folder || ""));
        const filename = escapeString(String(data.filename || "output_video"));
        const format = escapeString(String(data.format || "mp4"));
        const code2 = `
  // --- Node: ${node.id} (video_save) ---
  ${letOrAssign}${outputVar} = await VideoFrames.saveVideo(
    ${videoVar},
    "${savePath}",
    "${filename}",
    "${format}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_frame_extractor") {
        const fps2 = Number(data.fps) || 1;
        const maxFrames2 = Number(data.maxFrames) || 100;
        const startTimeProp = Number(data.startTime) || 0;
        const endTimeProp = Number(data.endTime) || 0;
        const lastFrameOnly = data.lastFrameOnly === true;
        const intervalSeconds2 = fps2 > 0 ? 1 / fps2 : 1;
        const outputFormat2 = String(data.outputFormat || "jpeg");
        const timestampsInput = inputs.get("timestamps");
        const startTimeInput = inputs.get("startTimeInput");
        const endTimeInput = inputs.get("endTimeInput");
        const startTimeExpr = startTimeInput ? `(typeof ${startTimeInput} === 'number' ? ${startTimeInput} : ${startTimeProp})` : String(startTimeProp);
        const endTimeExpr = endTimeInput ? `(typeof ${endTimeInput} === 'number' ? ${endTimeInput} : ${endTimeProp})` : String(endTimeProp);
        let code2;
        if (timestampsInput) {
          code2 = `
  // --- Node: ${node.id} (video_frame_extractor - specific timestamps) ---${debug ? `
  console.log("[VideoFrameExtractor] Output var will be: ${outputVar} (timestamps mode)");` : ""}
  ${letOrAssign}${outputVar} = await VideoFrames.extractAtTimestamps(
    ${inputVar},
    ${timestampsInput},
    "${outputFormat2}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Extract just the dataUrls for loop compatibility and store in main output variable
  ${outputVar} = ${outputVar}.map(f => f.dataUrl || f.path || f);${debug ? `
  console.log("[VideoFrameExtractor] Extracted frames at timestamps:", ${outputVar}.length);` : ""}
  workflow_context["${node.id}"] = ${outputVar};`;
        } else if (lastFrameOnly) {
          code2 = `
  // --- Node: ${node.id} (video_frame_extractor - last frame only) ---${debug ? `
  console.log("[VideoFrameExtractor] Output var will be: ${outputVar} (last frame only mode)");` : ""}
  ${letOrAssign}${outputVar} = await VideoFrames.extractLastFrame(
    ${inputVar},
    "${outputFormat2}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Extract just the dataUrls for loop compatibility and store in main output variable
  ${outputVar} = ${outputVar}.map(f => f.dataUrl || f.path || f);${debug ? `
  console.log("[VideoFrameExtractor] Extracted last frame:", ${outputVar}[0] ? ${outputVar}[0].substring(0, 50) : "none");` : ""}
  workflow_context["${node.id}"] = ${outputVar};`;
        } else {
          code2 = `
  // --- Node: ${node.id} (video_frame_extractor) ---${debug ? `
  console.log("[VideoFrameExtractor] Output var will be: ${outputVar}");` : ""}
  ${letOrAssign}${outputVar} = await VideoFrames.extract(
    ${inputVar},
    ${intervalSeconds2},
    "${outputFormat2}",
    ${maxFrames2},
    "${node.id}",
    ${startTimeExpr},
    ${endTimeExpr}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Extract just the dataUrls for loop compatibility and store in main output variable
  ${outputVar} = ${outputVar}.map(f => f.dataUrl || f.path || f);${debug ? `
  console.log("[VideoFrameExtractor] Extracted frames array length:", ${outputVar}.length);
  console.log("[VideoFrameExtractor] First frame sample:", ${outputVar}[0] ? ${outputVar}[0].substring(0, 50) : "none");` : ""}
  workflow_context["${node.id}"] = ${outputVar};`;
        }
        return code2;
      }
      if (nodeType === "video_gen") {
        const promptVar = inputs.get("prompt") || `"${escapeString(String(data.prompt || ""))}"`;
        const projectSettings = data.projectSettings;
        const apiFormat = String(data.apiFormat || "comfyui");
        if (apiFormat === "wan2gp") {
          const rawEndpoint = String(data.endpoint || "");
          const isComfyEndpoint = rawEndpoint.includes(":8188") || rawEndpoint === projectSettings?.defaultVideoEndpoint;
          const endpoint2 = escapeString(isComfyEndpoint ? "" : rawEndpoint);
          const wan2gpModel = escapeString(String(data.wan2gpModel || "wan_t2v_14b"));
          const wan2gpSteps = data.wan2gpSteps != null ? Number(data.wan2gpSteps) : 30;
          const wan2gpDuration = data.wan2gpDuration != null ? Number(data.wan2gpDuration) : 5;
          const wan2gpVram = escapeString(String(data.wan2gpVram || "auto"));
          const comfyWidth2 = data.comfyWidth != null ? Number(data.comfyWidth) : void 0;
          const comfyHeight2 = data.comfyHeight != null ? Number(data.comfyHeight) : void 0;
          const comfyFrameRate2 = data.comfyFrameRate != null ? Number(data.comfyFrameRate) : void 0;
          const imageVar = inputs.get("image") || "null";
          const imageEndVar = inputs.get("image_end") || "null";
          const audioVar = inputs.get("audio") || "null";
          let code3 = `
  // --- Node: ${node.id} (${nodeType} - wan2gp) ---`;
          code3 += `
  ${letOrAssign}${outputVar} = await VideoFrames.generateVideoWan2GP(
    "${endpoint2}",
    "${node.id}",
    ${promptVar},
    "${wan2gpModel}",
    ${comfyWidth2 !== void 0 ? comfyWidth2 : "undefined"},
    ${comfyHeight2 !== void 0 ? comfyHeight2 : "undefined"},
    undefined,
    ${comfyFrameRate2 !== void 0 ? comfyFrameRate2 : "undefined"},
    ${imageVar !== "null" ? `[${imageVar}]` : "null"},
    ${wan2gpSteps},
    ${wan2gpDuration},
    ${imageEndVar !== "null" ? imageEndVar : "null"},
    "${wan2gpVram}",
    ${audioVar}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  let ${outputVar}_video = ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
          return code3;
        }
        const endpoint = escapeString(String(data.endpoint || projectSettings?.defaultVideoEndpoint || ""));
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
            title: "Start Image",
            nodeType: "LoadImage",
            allowBypass: false
            // Required input for video gen
          }];
          if (workflowInputs.endImageNodeId) {
            comfyImageInputNodeIds.push(workflowInputs.endImageNodeId);
            comfyImageInputConfigs.push({
              nodeId: workflowInputs.endImageNodeId,
              title: "End Image",
              nodeType: "LoadImage",
              allowBypass: false
              // Required for start+end workflow
            });
          }
        }
        const comfySeedMode = String(data.comfySeedMode || "random");
        const comfyFixedSeed = data.comfyFixedSeed != null ? Number(data.comfyFixedSeed) : null;
        const imageInputVars = [];
        const effectiveImageCount = comfyImageInputConfigs.length || comfyImageInputNodeIds.length;
        for (let i = 0; i < effectiveImageCount; i++) {
          const config = comfyImageInputConfigs[i];
          const handleId = config?.handleId;
          let imageVar = handleId ? inputs.get(handleId) : null;
          if (!imageVar) imageVar = inputs.get(`image_${i}`);
          if (!imageVar && i === 0) imageVar = inputs.get("image");
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
            const handleId = cfg.handleId || "";
            const allowBypass = cfg.allowBypass ?? false;
            return `{nodeId:"${escapeString(nodeId)}",title:"${escapeString(title)}",nodeType:"${escapeString(nodeType2)}",handleId:"${escapeString(handleId)}",allowBypass:${allowBypass}}`;
          });
          comfyImageInputConfigsCode = `[${configItems.join(",")}]`;
        }
        const comfyAllImageNodeIdsCode = comfyAllImageNodeIds.length > 0 ? `[${comfyAllImageNodeIds.map((id) => `"${escapeString(id)}"`).join(", ")}]` : "null";
        const frameCountInput = inputs.get("frameCount");
        const comfyFrameCountProp = data.comfyFrameCount != null ? Number(data.comfyFrameCount) : void 0;
        const comfyWidth = data.comfyWidth != null ? Number(data.comfyWidth) : void 0;
        const comfyHeight = data.comfyHeight != null ? Number(data.comfyHeight) : void 0;
        const comfyFrameRate = data.comfyFrameRate != null ? Number(data.comfyFrameRate) : void 0;
        let frameCountExpr;
        if (frameCountInput) {
          frameCountExpr = `(typeof ${frameCountInput} === 'number' ? ${frameCountInput} : (parseInt(${frameCountInput}) || ${comfyFrameCountProp !== void 0 ? comfyFrameCountProp : "undefined"}))`;
        } else {
          frameCountExpr = comfyFrameCountProp !== void 0 ? String(comfyFrameCountProp) : "undefined";
        }
        let code2 = `
  // --- Node: ${node.id} (${nodeType}) ---`;
        code2 += `
  ${letOrAssign}${outputVar} = await VideoFrames.generate(
    "${endpoint}",
    "${node.id}",
    ${promptVar},
    ${comfyWorkflowCode},
    ${comfyPrimaryPromptNodeId ? `"${escapeString(String(comfyPrimaryPromptNodeId))}"` : "null"},
    ${comfyNodeIdsCode},
    ${imageInputsCode},
    ${comfyImageInputConfigsCode},
    "${comfySeedMode}",
    ${comfyFixedSeed !== null ? comfyFixedSeed : "null"},
    ${comfyAllImageNodeIdsCode},
    ${frameCountExpr},
    ${comfyWidth !== void 0 ? comfyWidth : "undefined"},
    ${comfyHeight !== void 0 ? comfyHeight : "undefined"},
    ${comfyFrameRate !== void 0 ? comfyFrameRate : "undefined"}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variable for consistency with multi-output pattern
  // Always use 'let' for suffix variables as they are only created here
  let ${outputVar}_video = ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_avatar") {
        const imageVar = inputs.get("image") || "null";
        const audioVar = inputs.get("audio") || "null";
        const promptInput = inputs.get("prompt");
        const promptProp = `"${escapeString(String(data.prompt || "A person speaking naturally, realistic, high quality"))}"`;
        const promptVar = promptInput ? `${promptInput} || ${promptProp}` : promptProp;
        const apiUrl = escapeString(String(data.apiUrl || "http://127.0.0.1:8768/generate"));
        const guidanceScale = Number(data.guidanceScale) || 5;
        const numInferenceSteps = Number(data.numInferenceSteps) || 30;
        const code2 = `
  // --- Node: ${node.id} (video_avatar) ---
  ${letOrAssign}${outputVar} = await VideoFrames.generateAvatar(
    ${imageVar},
    ${audioVar},
    ${promptVar},
    "${apiUrl}",
    ${guidanceScale},
    ${numInferenceSteps},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variables for multi-output node
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_video_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_pip") {
        const mainVideoVar = inputs.get("mainVideo") || "null";
        const pipVideoVar = inputs.get("pipVideo") || "null";
        const position = escapeString(String(data.position || "bottom-right"));
        const size = Number(data.size) || 25;
        const margin = Number(data.margin) || 20;
        const shape = escapeString(String(data.shape || "rectangle"));
        const mainVolume = typeof data.mainVolume === "number" ? data.mainVolume : 1;
        const pipVolume = typeof data.pipVolume === "number" ? data.pipVolume : 1;
        const startTime2 = typeof data.startTime === "number" ? data.startTime : 0;
        const pipDuration = typeof data.pipDuration === "number" ? data.pipDuration : 0;
        const code2 = `
  // --- Node: ${node.id} (video_pip) ---
  ${letOrAssign}${outputVar} = await VideoFrames.videoPip(
    ${mainVideoVar},
    ${pipVideoVar},
    "${position}",
    ${size},
    ${margin},
    "${shape}",
    ${mainVolume},
    ${pipVolume},
    ${startTime2},
    ${pipDuration},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variables for multi-output node
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType === "video_captions") {
        const videoVar = inputs.get("video") || inputs.get("default") || inputs.get("input") || "null";
        const textVar = inputs.get("text") || `"${escapeString(String(data.text || ""))}"`;
        const durationsVar = inputs.get("durations") || "null";
        const segmentsVar = inputs.get("segments");
        const position = escapeString(String(data.position || "bottom"));
        const fontSize = Number(data.fontSize) || 48;
        const fontColor = escapeString(String(data.fontColor || "white"));
        const backgroundColor = escapeString(String(data.backgroundColor || "black@0.7"));
        const padding = Number(data.padding) || 15;
        const margin = Number(data.margin) || 50;
        let code2;
        if (segmentsVar) {
          code2 = `
  // --- Node: ${node.id} (video_captions from STT segments) ---
  // Extract text and durations from STT segments
  let _segments_${node.id.replace(/-/g, "_")} = ${segmentsVar};
  let _text_${node.id.replace(/-/g, "_")} = Array.isArray(_segments_${node.id.replace(/-/g, "_")})
    ? _segments_${node.id.replace(/-/g, "_")}.map(s => s.text || s.word || '').join(' ... ')
    : ${textVar};
  let _durations_${node.id.replace(/-/g, "_")} = Array.isArray(_segments_${node.id.replace(/-/g, "_")})
    ? _segments_${node.id.replace(/-/g, "_")}.map(s => (s.end || 0) - (s.start || 0))
    : ${durationsVar};
  console.log("[VideoCaptions] Using STT segments: " + _segments_${node.id.replace(/-/g, "_")}.length + " segments");
  ${letOrAssign}${outputVar} = await VideoFrames.videoCaptions(
    ${videoVar},
    _text_${node.id.replace(/-/g, "_")},
    "${position}",
    ${fontSize},
    "${fontColor}",
    "${backgroundColor}",
    ${padding},
    ${margin},
    "${node.id}",
    _durations_${node.id.replace(/-/g, "_")}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variables for multi-output node
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        } else {
          code2 = `
  // --- Node: ${node.id} (video_captions) ---
  ${letOrAssign}${outputVar} = await VideoFrames.videoCaptions(
    ${videoVar},
    ${textVar},
    "${position}",
    ${fontSize},
    "${fontColor}",
    "${backgroundColor}",
    ${padding},
    ${margin},
    "${node.id}",
    ${durationsVar}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variables for multi-output node
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        }
        return code2;
      }
      if (nodeType === "video_downloader") {
        const urlInput = inputs.get("url");
        const urlProp = `"${escapeString(String(data.url || ""))}"`;
        const url = urlInput ? `${urlInput} || ${urlProp}` : urlProp;
        const apiUrl = escapeString(String(data.apiUrl || "http://127.0.0.1:8771/download"));
        const mode = escapeString(String(data.mode || "video"));
        const start = Number(data.start) || 0;
        const end = data.end != null ? Number(data.end) : null;
        const endStr = end !== null ? String(end) : "null";
        const quality = escapeString(String(data.quality || "best"));
        const code2 = `
  // --- Node: ${node.id} (video_downloader) ---
  ${letOrAssign}${outputVar} = await VideoFrames.downloadVideo(
    ${url},
    "${apiUrl}",
    "${mode}",
    ${start},
    ${endStr},
    "${quality}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Create suffixed output variables for multi-output node
  // Runtime returns { video, path, duration, width, height }
  let ${outputVar}_video = ${outputVar}.path || ${outputVar};
  let ${outputVar}_duration = ${outputVar}.duration || 0;
  let ${outputVar}_width = ${outputVar}.width || 0;
  let ${outputVar}_height = ${outputVar}.height || 0;
  workflow_context["${node.id}"] = ${outputVar};`;
        return code2;
      }
      if (nodeType !== "video_frame_extractor") {
        return null;
      }
      const fps = Number(data.fps) || Number(data.intervalSeconds) || 1;
      const intervalSeconds = 1 / fps;
      const outputFormat = escapeString(String(data.outputFormat || "jpeg"));
      const rawBatchSize = Number(data.batchSize);
      const batchSize = Number.isNaN(rawBatchSize) ? 10 : rawBatchSize;
      const maxFrames = Number(data.maxFrames) || 100;
      const startTime = Number(data.startTime) || 0;
      const endTime = Number(data.endTime) || 0;
      const isBatchMode = batchSize > 0;
      let code = `
  // --- Node: ${node.id} (video_frame_extractor) ---`;
      if (isBatchMode) {
        code += `
  // Batch mode: extract first batch, include metadata for continuation
  let _video_path_${ctx2.sanitizedId} = ${inputVar};
  if (typeof _video_path_${ctx2.sanitizedId} === 'object' && _video_path_${ctx2.sanitizedId}.path) {
    _video_path_${ctx2.sanitizedId} = _video_path_${ctx2.sanitizedId}.path;
  }
  let _batch_result_${ctx2.sanitizedId} = await VideoFrames.extractBatch(
    _video_path_${ctx2.sanitizedId},
    ${intervalSeconds},
    ${batchSize},
    0,
    "${outputFormat}",
    "${node.id}"
  );
  if (_batch_result_${ctx2.sanitizedId} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Build output with frames and batch metadata for loop continuation
  ${letOrAssign}${outputVar} = _batch_result_${ctx2.sanitizedId}.frames;
  ${outputVar}._batchMeta = {
    intervalSeconds: ${intervalSeconds},
    batchSize: ${batchSize},
    maxFrames: ${maxFrames},
    outputFormat: "${outputFormat}",
    nodeId: "${node.id}",
    videoPath: _video_path_${ctx2.sanitizedId},
    hasMore: _batch_result_${ctx2.sanitizedId}.hasMore,
    nextBatchIndex: 1,
    totalBatches: _batch_result_${ctx2.sanitizedId}.totalBatches,
    totalFrames: _batch_result_${ctx2.sanitizedId}.totalFrames
  };
  workflow_context["${node.id}"] = ${outputVar};`;
      } else {
        code += `
  let _video_path_${ctx2.sanitizedId} = ${inputVar};
  if (typeof _video_path_${ctx2.sanitizedId} === 'object' && _video_path_${ctx2.sanitizedId}.path) {
    _video_path_${ctx2.sanitizedId} = _video_path_${ctx2.sanitizedId}.path;
  }
  ${letOrAssign}${outputVar} = await VideoFrames.extract(
    _video_path_${ctx2.sanitizedId},
    ${intervalSeconds},
    "${outputFormat}",
    ${maxFrames},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Parse if string (use null in catch since FormLogic may have issues with empty blocks)
  if (typeof ${outputVar} === 'string') {
    let _parsed_${ctx2.sanitizedId} = JSON.parse(${outputVar});
    let _parsed_str_${ctx2.sanitizedId} = String(_parsed_${ctx2.sanitizedId});
    if (_parsed_str_${ctx2.sanitizedId}.indexOf("ERROR:") !== 0) {
      ${outputVar} = _parsed_${ctx2.sanitizedId};
    }
  }
  workflow_context["${node.id}"] = ${outputVar};`;
      }
      return code;
    }
  };
  var compiler_default = CoreVideoCompiler;

  // ../zipp-core/modules/core-video/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    AudioMixerNode: () => AudioMixerNode_default,
    VideoAppendNode: () => VideoAppendNode_default,
    VideoAvatarNode: () => VideoAvatarNode_default,
    VideoDownloaderNode: () => VideoDownloaderNode_default,
    VideoFrameExtractorNode: () => VideoFrameExtractorNode_default,
    VideoGenNode: () => VideoGenNode_default,
    VideoPipNode: () => VideoPipNode_default,
    VideoSaveNode: () => VideoSaveNode_default
  });

  // ../zipp-core/modules/core-video/ui/VideoFrameExtractorNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var VideoIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "path",
    {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 2,
      d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    }
  ) });
  function VideoFrameExtractorNode({ data }) {
    const onIntervalSecondsChangeRef = (0, import_react.useRef)(data.onIntervalSecondsChange);
    const onStartTimeChangeRef = (0, import_react.useRef)(data.onStartTimeChange);
    const onEndTimeChangeRef = (0, import_react.useRef)(data.onEndTimeChange);
    const onMaxFramesChangeRef = (0, import_react.useRef)(data.onMaxFramesChange);
    const onOutputFormatChangeRef = (0, import_react.useRef)(data.onOutputFormatChange);
    const onBatchSizeChangeRef = (0, import_react.useRef)(data.onBatchSizeChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onIntervalSecondsChangeRef.current = data.onIntervalSecondsChange;
      onStartTimeChangeRef.current = data.onStartTimeChange;
      onEndTimeChangeRef.current = data.onEndTimeChange;
      onMaxFramesChangeRef.current = data.onMaxFramesChange;
      onOutputFormatChangeRef.current = data.onOutputFormatChange;
      onBatchSizeChangeRef.current = data.onBatchSizeChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleIntervalChange = (0, import_react.useCallback)((e) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value) && value > 0) {
        onIntervalSecondsChangeRef.current?.(value);
      }
    }, []);
    const handleStartTimeChange = (0, import_react.useCallback)((e) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value) && value >= 0) {
        onStartTimeChangeRef.current?.(value);
      }
    }, []);
    const handleEndTimeChange = (0, import_react.useCallback)((e) => {
      const value = parseFloat(e.target.value);
      if (!isNaN(value) && value >= 0) {
        onEndTimeChangeRef.current?.(value);
      }
    }, []);
    const handleMaxFramesChange = (0, import_react.useCallback)((e) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value > 0) {
        onMaxFramesChangeRef.current?.(value);
      }
    }, []);
    const handleFormatChange = (0, import_react.useCallback)((e) => {
      onOutputFormatChangeRef.current?.(e.target.value);
    }, []);
    const handleBatchSizeChange = (0, import_react.useCallback)((e) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value >= 0) {
        onBatchSizeChangeRef.current?.(value);
      }
    }, []);
    const intervalSeconds = data.intervalSeconds ?? 1;
    const startTime = data.startTime ?? 0;
    const endTime = data.endTime ?? 0;
    const maxFrames = data.maxFrames ?? 100;
    const outputFormat = data.outputFormat ?? "jpeg";
    const batchSize = data.batchSize ?? 0;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-orange-400", children: [
        intervalSeconds,
        "s"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-500", children: " / " }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-orange-300", children: [
        maxFrames,
        " max"
      ] })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => [
      {
        id: "video",
        type: "target",
        position: import_react2.Position.Left,
        color: "!bg-orange-500",
        label: "video",
        labelColor: "text-orange-400",
        size: "md"
      }
    ], []);
    const outputHandles = (0, import_react.useMemo)(() => [
      {
        id: "frames",
        type: "source",
        position: import_react2.Position.Right,
        color: "!bg-orange-500",
        label: "frames",
        labelColor: "text-orange-400",
        size: "lg"
      }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Video Frames",
        color: "orange",
        icon: VideoIcon,
        width: 240,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Frame Interval (seconds)" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "number",
                min: 0.1,
                step: 0.1,
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                value: intervalSeconds,
                onChange: handleIntervalChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: "Extract 1 frame every N seconds" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Start (s)" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  min: 0,
                  step: 0.1,
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: startTime,
                  onChange: handleStartTimeChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "End (s)" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  min: 0,
                  step: 0.1,
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: endTime,
                  onChange: handleEndTimeChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: "0 = full video" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "grid grid-cols-2 gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Max Frames" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  min: 1,
                  max: 1e4,
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: maxFrames,
                  onChange: handleMaxFramesChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Batch Size" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  min: 0,
                  max: 100,
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: batchSize,
                  onChange: handleBatchSizeChange,
                  onFocus: (e) => e.target.select(),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px]", children: "Batch: 0 = all at once, >0 = process in batches" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                value: outputFormat,
                onChange: handleFormatChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "jpeg", children: "JPEG (smaller)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "png", children: "PNG (lossless)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "Input: video file path" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "Output: array of frame images" })
          ] })
        ] })
      }
    );
  }
  var VideoFrameExtractorNode_default = (0, import_react.memo)(VideoFrameExtractorNode);

  // ../zipp-core/modules/core-video/ui/VideoGenNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_zipp_core = __toESM(require_zipp_core(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var VideoGenIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) });
  function VideoGenNode({ data }) {
    const onEndpointChangeRef = (0, import_react3.useRef)(data.onEndpointChange);
    const onApiFormatChangeRef = (0, import_react3.useRef)(data.onApiFormatChange);
    const onWan2gpModelChangeRef = (0, import_react3.useRef)(data.onWan2gpModelChange);
    const onWan2gpStepsChangeRef = (0, import_react3.useRef)(data.onWan2gpStepsChange);
    const onWan2gpDurationChangeRef = (0, import_react3.useRef)(data.onWan2gpDurationChange);
    const onWan2gpVramChangeRef = (0, import_react3.useRef)(data.onWan2gpVramChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    const onComfyWorkflowChangeRef = (0, import_react3.useRef)(data.onComfyWorkflowChange);
    const onComfyWorkflowNameChangeRef = (0, import_react3.useRef)(data.onComfyWorkflowNameChange);
    const onComfyPrimaryPromptNodeIdChangeRef = (0, import_react3.useRef)(data.onComfyPrimaryPromptNodeIdChange);
    const onComfyImageInputNodeIdsChangeRef = (0, import_react3.useRef)(data.onComfyImageInputNodeIdsChange);
    const onComfyImageInputConfigsChangeRef = (0, import_react3.useRef)(data.onComfyImageInputConfigsChange);
    const onComfySeedModeChangeRef = (0, import_react3.useRef)(data.onComfySeedModeChange);
    const onComfyFixedSeedChangeRef = (0, import_react3.useRef)(data.onComfyFixedSeedChange);
    const onComfyAllImageNodeIdsChangeRef = (0, import_react3.useRef)(data.onComfyAllImageNodeIdsChange);
    const onOpenComfyWorkflowDialogRef = (0, import_react3.useRef)(data.onOpenComfyWorkflowDialog);
    const fileInputRef = (0, import_react3.useRef)(null);
    (0, import_react3.useEffect)(() => {
      onEndpointChangeRef.current = data.onEndpointChange;
      onApiFormatChangeRef.current = data.onApiFormatChange;
      onWan2gpModelChangeRef.current = data.onWan2gpModelChange;
      onWan2gpStepsChangeRef.current = data.onWan2gpStepsChange;
      onWan2gpDurationChangeRef.current = data.onWan2gpDurationChange;
      onWan2gpVramChangeRef.current = data.onWan2gpVramChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
      onComfyWorkflowChangeRef.current = data.onComfyWorkflowChange;
      onComfyWorkflowNameChangeRef.current = data.onComfyWorkflowNameChange;
      onComfyPrimaryPromptNodeIdChangeRef.current = data.onComfyPrimaryPromptNodeIdChange;
      onComfyImageInputNodeIdsChangeRef.current = data.onComfyImageInputNodeIdsChange;
      onComfyImageInputConfigsChangeRef.current = data.onComfyImageInputConfigsChange;
      onComfySeedModeChangeRef.current = data.onComfySeedModeChange;
      onComfyFixedSeedChangeRef.current = data.onComfyFixedSeedChange;
      onComfyAllImageNodeIdsChangeRef.current = data.onComfyAllImageNodeIdsChange;
      onOpenComfyWorkflowDialogRef.current = data.onOpenComfyWorkflowDialog;
    });
    const prevApiFormatRef = (0, import_react3.useRef)(data.apiFormat);
    (0, import_react3.useEffect)(() => {
      const currentFormat = data.apiFormat || "comfyui";
      const prevFormat = prevApiFormatRef.current || "comfyui";
      if (currentFormat !== prevFormat) {
        prevApiFormatRef.current = currentFormat;
        if (currentFormat === "wan2gp") {
          onEndpointChangeRef.current?.("http://127.0.0.1:8773");
        } else {
          onEndpointChangeRef.current?.(data.projectSettings?.defaultVideoEndpoint || "http://localhost:8188");
        }
      }
    }, [data.apiFormat, data.projectSettings?.defaultVideoEndpoint]);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleWorkflowFileSelect = (0, import_react3.useCallback)((e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result;
        const analysis = (0, import_zipp_core.analyzeComfyUIWorkflow)(content);
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
          onComfyImageInputConfigsChangeRef.current?.([]);
        }
      };
      reader.readAsText(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }, []);
    const handleClearWorkflow = (0, import_react3.useCallback)(() => {
      onComfyWorkflowChangeRef.current?.("");
      onComfyWorkflowNameChangeRef.current?.("");
      onComfyPrimaryPromptNodeIdChangeRef.current?.(null);
      onComfyImageInputNodeIdsChangeRef.current?.([]);
      onComfyImageInputConfigsChangeRef.current?.([]);
      onComfySeedModeChangeRef.current?.("random");
      onComfyFixedSeedChangeRef.current?.(null);
      onComfyAllImageNodeIdsChangeRef.current?.([]);
    }, []);
    const hasEmbeddedWorkflow = (0, import_react3.useMemo)(() => {
      return data.comfyuiWorkflow && Object.keys(data.comfyuiWorkflow).length > 0;
    }, [data.comfyuiWorkflow]);
    const embeddedWorkflowNodeCount = (0, import_react3.useMemo)(() => {
      if (!hasEmbeddedWorkflow) return 0;
      return Object.keys(data.comfyuiWorkflow).length;
    }, [hasEmbeddedWorkflow, data.comfyuiWorkflow]);
    const workflowAnalysis = (0, import_react3.useMemo)(() => {
      if (data.comfyWorkflow) {
        return (0, import_zipp_core.analyzeComfyUIWorkflow)(data.comfyWorkflow);
      }
      if (hasEmbeddedWorkflow) {
        return (0, import_zipp_core.analyzeComfyUIWorkflow)(JSON.stringify(data.comfyuiWorkflow));
      }
      return null;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, data.comfyuiWorkflow]);
    const videoAnalysis = (0, import_react3.useMemo)(() => {
      if (data.comfyWorkflow) {
        return analyzeComfyUIVideoWorkflow(data.comfyWorkflow);
      }
      if (hasEmbeddedWorkflow) {
        return analyzeComfyUIVideoWorkflow(JSON.stringify(data.comfyuiWorkflow));
      }
      return null;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, data.comfyuiWorkflow]);
    const apiFormat = data.apiFormat || "comfyui";
    const isWan2gp = apiFormat === "wan2gp";
    const validationIssues = (0, import_react3.useMemo)(() => {
      const issues = [];
      if (!isWan2gp && !data.comfyWorkflow && !hasEmbeddedWorkflow) {
        issues.push({ field: "Workflow", message: "Load a workflow file" });
      }
      return issues;
    }, [data.comfyWorkflow, hasEmbeddedWorkflow, isWan2gp]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-orange-400 font-medium", children: isWan2gp ? "Wan2GP" : "ComfyUI" }),
      !isWan2gp && data.comfyWorkflowName && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-slate-500 ml-1 text-xs", children: [
        "(",
        data.comfyWorkflowName,
        ")"
      ] }),
      !isWan2gp && !data.comfyWorkflowName && hasEmbeddedWorkflow && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-green-500 ml-1 text-xs", children: "(Embedded)" }),
      isWan2gp && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-slate-500 ml-1 text-xs", children: [
        "(",
        data.wan2gpModel || "wan_t2v_14b",
        ")"
      ] })
    ] });
    const inputHandles = (0, import_react3.useMemo)(() => {
      const handles = [];
      const hasWorkflow = data.comfyWorkflow || hasEmbeddedWorkflow;
      const hasPromptNode = data.comfyPrimaryPromptNodeId !== null || hasEmbeddedWorkflow && data.workflowInputs?.promptNodeId;
      const showPromptInput = !hasWorkflow || hasPromptNode;
      if (showPromptInput) {
        handles.push({ id: "prompt", type: "target", position: import_react4.Position.Left, color: "!bg-blue-500", label: "prompt", labelColor: "text-blue-400", size: "lg" });
      }
      if (data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0) {
        data.comfyImageInputConfigs.forEach((config, index) => {
          const label = config.title || `image ${index + 1}`;
          const bypassIndicator = config.allowBypass ? " (opt)" : "";
          handles.push({
            id: `image_${index}`,
            type: "target",
            position: import_react4.Position.Left,
            color: config.allowBypass ? "!bg-purple-400" : "!bg-purple-500",
            label: `${label.toLowerCase()}${bypassIndicator}`,
            labelColor: config.allowBypass ? "text-purple-300" : "text-purple-400",
            size: "md"
          });
        });
      } else if (data.comfyImageInputNodeIds && data.comfyImageInputNodeIds.length > 0) {
        data.comfyImageInputNodeIds.forEach((nodeId, index) => {
          const analysis = workflowAnalysis;
          const imageInput = analysis?.images.find((img) => img.nodeId === nodeId);
          const label = imageInput?.title || `image ${index + 1}`;
          handles.push({
            id: `image_${index}`,
            type: "target",
            position: import_react4.Position.Left,
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
          position: import_react4.Position.Left,
          color: "!bg-purple-500",
          label: "image",
          labelColor: "text-purple-400",
          size: "md"
        });
      }
      if (isWan2gp) {
        handles.push({
          id: "image",
          type: "target",
          position: import_react4.Position.Left,
          color: "!bg-purple-400",
          label: "start image (opt)",
          labelColor: "text-purple-300",
          size: "sm"
        });
        handles.push({
          id: "image_end",
          type: "target",
          position: import_react4.Position.Left,
          color: "!bg-purple-400",
          label: "end image (opt)",
          labelColor: "text-purple-300",
          size: "sm"
        });
      }
      handles.push({
        id: "frameCount",
        type: "target",
        position: import_react4.Position.Left,
        color: "!bg-green-500",
        label: "frames",
        labelColor: "text-green-400",
        size: "sm"
      });
      if (isWan2gp) {
        handles.push({
          id: "audio",
          type: "target",
          position: import_react4.Position.Left,
          color: "!bg-teal-400",
          label: "audio (opt)",
          labelColor: "text-teal-300",
          size: "sm"
        });
      }
      return handles;
    }, [data.comfyWorkflow, data.comfyPrimaryPromptNodeId, data.comfyImageInputNodeIds, data.comfyImageInputConfigs, workflowAnalysis, hasEmbeddedWorkflow, data.workflowInputs, isWan2gp]);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "video", type: "source", position: import_react4.Position.Right, color: "!bg-orange-500", size: "lg", label: "video" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_jsx_runtime2.Fragment, { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Video Generator",
        color: "orange",
        icon: VideoGenIcon,
        width: 280,
        collapsedWidth: 160,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "space-y-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Backend" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                value: apiFormat,
                onChange: (e) => onApiFormatChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "comfyui", children: "ComfyUI" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan2gp", children: "Wan2GP (LTX/Wan/Hunyuan)" })
                ]
              }
            )
          ] }),
          isWan2gp && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Model" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: data.wan2gpModel || "wan_t2v_14b",
                  onChange: (e) => onWan2gpModelChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("optgroup", { label: "LTX Video", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ltx2_22B", children: "LTX Video 2.3 (22B)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ltx2_22B_distilled", children: "LTX Video 2.3 Distilled (22B)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ltx2_19B", children: "LTX Video 2.0 (19B)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ltx2_distilled", children: "LTX Video 2.0 Distilled (19B)" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("optgroup", { label: "Wan", children: [
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan_t2v_14b", children: "Wan 2.1 T2V 14B" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan_t2v_1_3b", children: "Wan 2.1 T2V 1.3B (Low VRAM)" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan_i2v_480p", children: "Wan 2.1 I2V 480p" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan_i2v_720p", children: "Wan 2.1 I2V 720p" }),
                      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "wan_t2v_2_2", children: "Wan 2.2 T2V" })
                    ] }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("optgroup", { label: "Hunyuan", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "hunyuan_t2v", children: "Hunyuan Video T2V" }) })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "grid grid-cols-2 gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Duration (s)" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "number",
                    className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                    value: data.wan2gpDuration || 5,
                    min: 1,
                    max: 60,
                    step: 1,
                    onChange: (e) => onWan2gpDurationChangeRef.current?.(parseInt(e.target.value) || 5),
                    onMouseDown: (e) => e.stopPropagation()
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Steps" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "number",
                    className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                    value: data.wan2gpSteps || 30,
                    min: 1,
                    max: 100,
                    onChange: (e) => onWan2gpStepsChangeRef.current?.(parseInt(e.target.value) || 30),
                    onMouseDown: (e) => e.stopPropagation()
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "VRAM" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  value: data.wan2gpVram || "auto",
                  onChange: (e) => onWan2gpVramChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "auto", children: "Auto" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "6", children: "6 GB (Low)" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "8", children: "8 GB" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "10", children: "10 GB" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "12", children: "12 GB" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "16", children: "16 GB" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "24", children: "24 GB+" })
                  ]
                }
              )
            ] })
          ] }),
          !isWan2gp && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Workflow" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: ".json",
                onChange: handleWorkflowFileSelect,
                className: "hidden"
              }
            ),
            data.comfyWorkflow || hasEmbeddedWorkflow ? /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded p-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-sm text-green-400 font-medium truncate flex-1", children: data.comfyWorkflowName || (hasEmbeddedWorkflow ? `Embedded (${embeddedWorkflowNodeCount} nodes)` : "workflow.json") }),
                data.comfyWorkflow && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    onClick: handleClearWorkflow,
                    className: "text-slate-500 hover:text-red-400 ml-2",
                    title: "Remove workflow",
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-4 h-4 text-slate-500 hover:text-red-400", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) })
                  }
                )
              ] }),
              workflowAnalysis && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs text-slate-500", children: (0, import_zipp_core.getWorkflowSummary)(workflowAnalysis) }),
              hasEmbeddedWorkflow && !data.comfyWorkflow && data.workflowInputs && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-1 text-xs text-slate-500", children: [
                "Prompt: node ",
                data.workflowInputs.promptNodeId,
                " | Image: node ",
                data.workflowInputs.imageNodeId
              ] }),
              data.comfySeedMode && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "mt-2 pt-2 border-t border-slate-300 dark:border-slate-700", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-500", children: "Seed:" }),
                data.comfySeedMode === "random" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-green-400", children: "Random each run" }),
                data.comfySeedMode === "fixed" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-blue-400", children: [
                  "Fixed (",
                  data.comfyFixedSeed,
                  ")"
                ] }),
                data.comfySeedMode === "workflow" && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-400", children: "From workflow" })
              ] }) }),
              data.comfyImageInputConfigs && data.comfyImageInputConfigs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-2 pt-2 border-t border-slate-300 dark:border-slate-700", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs text-slate-500 mb-1", children: "Image inputs:" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "space-y-1", children: data.comfyImageInputConfigs.map((config) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "w-2 h-2 rounded-full bg-purple-500" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-300", children: config.title }),
                  config.allowBypass ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-green-400 text-[10px]", children: "(optional)" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-amber-400 text-[10px]", children: "(required)" })
                ] }, config.nodeId)) })
              ] }),
              (data.comfyWorkflow || hasEmbeddedWorkflow) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "mt-2 pt-2 border-t border-slate-300 dark:border-slate-700", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs text-slate-500 mb-2", children: "Video parameters:" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "space-y-2", children: [
                  videoAnalysis && videoAnalysis.lengths.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-xs text-slate-400 w-14", children: "Frames:" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "input",
                      {
                        type: "number",
                        value: data.comfyFrameCount ?? "",
                        placeholder: String(videoAnalysis.lengths[0].currentValue),
                        onChange: (e) => {
                          const val = e.target.value;
                          data.onComfyFrameCountChange?.(val === "" ? void 0 : parseInt(val));
                        },
                        onMouseDown: (e) => e.stopPropagation(),
                        className: "nodrag flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white",
                        min: 1
                      }
                    )
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-xs text-slate-400 w-14", children: "Size:" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "input",
                      {
                        type: "number",
                        value: data.comfyWidth ?? "",
                        placeholder: videoAnalysis?.resolutions[0]?.width?.toString() ?? "1280",
                        onChange: (e) => {
                          const val = e.target.value;
                          data.onComfyWidthChange?.(val === "" ? void 0 : parseInt(val));
                        },
                        onMouseDown: (e) => e.stopPropagation(),
                        className: "nodrag w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white",
                        min: 1
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-500 text-xs", children: "\xD7" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "input",
                      {
                        type: "number",
                        value: data.comfyHeight ?? "",
                        placeholder: videoAnalysis?.resolutions[0]?.height?.toString() ?? "720",
                        onChange: (e) => {
                          const val = e.target.value;
                          data.onComfyHeightChange?.(val === "" ? void 0 : parseInt(val));
                        },
                        onMouseDown: (e) => e.stopPropagation(),
                        className: "nodrag w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white",
                        min: 1
                      }
                    )
                  ] }),
                  videoAnalysis && videoAnalysis.frameRates.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-xs text-slate-400 w-14", children: "FPS:" }),
                    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                      "input",
                      {
                        type: "number",
                        value: data.comfyFrameRate ?? "",
                        placeholder: String(videoAnalysis.frameRates[0].currentValue),
                        onChange: (e) => {
                          const val = e.target.value;
                          data.onComfyFrameRateChange?.(val === "" ? void 0 : parseFloat(val));
                        },
                        onMouseDown: (e) => e.stopPropagation(),
                        className: "nodrag w-20 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-white",
                        min: 1,
                        step: "0.1"
                      }
                    )
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  onClick: () => fileInputRef.current?.click(),
                  className: "mt-2 text-xs text-orange-400 hover:text-orange-300",
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Change workflow"
                }
              )
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "button",
              {
                onClick: () => fileInputRef.current?.click(),
                onMouseDown: (e) => e.stopPropagation(),
                className: "nodrag w-full bg-slate-100 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-600 hover:border-orange-500 rounded p-3 text-center transition-colors",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-6 h-6 mx-auto text-slate-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-sm text-slate-400", children: "Load ComfyUI workflow" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-xs text-slate-600 mt-1", children: ".json exported from ComfyUI" })
                ]
              }
            )
          ] }),
          !isWan2gp && (data.comfyWorkflow || hasEmbeddedWorkflow) && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "ComfyUI Server" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500 font-mono",
                placeholder: data.projectSettings?.defaultVideoEndpoint || "http://localhost:8188",
                value: data.endpoint || data.projectSettings?.defaultVideoEndpoint || "http://localhost:8188",
                onChange: (e) => onEndpointChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] })
        ] })
      }
    ) });
  }
  var VideoGenNode_default = (0, import_react3.memo)(VideoGenNode);

  // ../zipp-core/modules/core-video/ui/VideoSaveNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_zipp_core2 = __toESM(require_zipp_core(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var VideoSaveIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" }) });
  function VideoSaveNode({ data }) {
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const savedPath = data.outputValue || data.videoUrl || "";
    const hasVideo = savedPath !== "";
    const getVideoSrc = (0, import_react5.useMemo)(() => {
      if (!savedPath) return "";
      if (savedPath.startsWith("http") || savedPath.startsWith("data:")) return savedPath;
      return (0, import_zipp_core2.pathToMediaUrl)(savedPath);
    }, [savedPath]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-orange-400", children: data.format?.toUpperCase() || "MP4" }),
      data.filename && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-1 text-[10px]", children: data.filename })
    ] });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "video", type: "target", position: import_react6.Position.Left, color: "!bg-blue-500", size: "lg", label: "video" },
      { id: "filename", type: "target", position: import_react6.Position.Left, color: "!bg-amber-500", size: "sm", label: "name" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "path", type: "source", position: import_react6.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const titleExtra = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-auto px-1.5 py-0.5 bg-orange-900 text-orange-400 text-[10px] rounded", children: "AUTO" });
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Save Video",
        color: "orange",
        icon: VideoSaveIcon,
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
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                placeholder: "my_video",
                value: data.filename || "video",
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
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                value: data.format || "mp4",
                onChange: (e) => data.onFormatChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "mp4", children: "MP4" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "webm", children: "WebM" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Preview" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: `w-full bg-white dark:bg-slate-900 border rounded flex items-center justify-center overflow-hidden ${hasVideo ? "border-orange-600" : "border-slate-300 dark:border-slate-700 h-24"}`, children: hasVideo ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "video",
              {
                src: getVideoSrc,
                className: "w-full rounded",
                controls: true,
                playsInline: true,
                style: { maxHeight: "200px" }
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-slate-500 text-xs italic", children: "No video" }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-4 h-4 text-orange-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "Auto-saves during workflow execution" })
          ] })
        ] })
      }
    );
  }
  var VideoSaveNode_default = (0, import_react5.memo)(VideoSaveNode);

  // ../zipp-core/modules/core-video/ui/VideoAppendNode.tsx
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react2(), 1);
  var import_zipp_ui_components4 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var VideoAppendIcon = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" }) });
  function VideoAppendNode({ data }) {
    const arrayCount = data.videos?.length || 0;
    const individualCount = [data.video_1, data.video_2, data.video_3, data.video_4].filter(Boolean).length;
    const totalCount = arrayCount > 0 ? arrayCount : individualCount;
    const usingArray = arrayCount > 0;
    const onCollapsedChangeRef = (0, import_react7.useRef)(data.onCollapsedChange);
    (0, import_react7.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react7.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-400", children: totalCount }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "ml-1 text-[10px]", children: usingArray ? "array" : "videos" })
    ] });
    const inputHandles = (0, import_react7.useMemo)(() => [
      // Array input (primary - for loops)
      { id: "videos", type: "target", position: import_react8.Position.Left, color: "!bg-purple-500", size: "lg", label: "videos[]" },
      // Individual inputs (fallback)
      { id: "video_1", type: "target", position: import_react8.Position.Left, color: "!bg-blue-500", size: "sm", label: "video 1" },
      { id: "video_2", type: "target", position: import_react8.Position.Left, color: "!bg-blue-500", size: "sm", label: "video 2" },
      { id: "video_3", type: "target", position: import_react8.Position.Left, color: "!bg-blue-400", size: "sm", label: "video 3" },
      { id: "video_4", type: "target", position: import_react8.Position.Left, color: "!bg-blue-400", size: "sm", label: "video 4" }
    ], []);
    const outputHandles = (0, import_react7.useMemo)(() => [
      { id: "video", type: "source", position: import_react8.Position.Right, color: "!bg-blue-500", size: "lg" },
      { id: "path", type: "source", position: import_react8.Position.Right, color: "!bg-green-500", size: "sm" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_zipp_ui_components4.CollapsibleNodeWrapper,
      {
        title: "Video Append",
        color: "purple",
        icon: VideoAppendIcon,
        width: 280,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-4 h-4 text-purple-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-slate-400", children: usingArray ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-400 font-medium", children: totalCount }),
              " videos from array"
            ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-400 font-medium", children: totalCount }),
              " video",
              totalCount !== 1 ? "s" : "",
              " connected"
            ] }) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: "appended_video",
                value: data.filename || "appended_video",
                onChange: (e) => data.onFilenameChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: data.format || "mp4",
                onChange: (e) => data.onFormatChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "mp4", children: "MP4" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: "webm", children: "WebM" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-start gap-2 px-2 py-1.5 bg-purple-900/20 border border-purple-800/30 rounded text-xs text-purple-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-4 h-4 flex-shrink-0 mt-0.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
              "Use ",
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-200", children: "videos[]" }),
              " for array input (from loops) or connect individual videos (1\u21922\u21923\u21924)"
            ] })
          ] })
        ] })
      }
    );
  }
  var VideoAppendNode_default = (0, import_react7.memo)(VideoAppendNode);

  // ../zipp-core/modules/core-video/ui/AudioMixerNode.tsx
  var import_react9 = __toESM(require_react(), 1);
  var import_react10 = __toESM(require_react2(), 1);
  var import_zipp_ui_components5 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
  var AudioMixerIcon = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" }) });
  function AudioMixerNode({ data }) {
    const nodeId = (0, import_react10.useNodeId)();
    const { updateNodeData } = (0, import_react10.useReactFlow)();
    const onCollapsedChangeRef = (0, import_react9.useRef)(data.onCollapsedChange);
    (0, import_react9.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react9.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleVideoVolumeChange = (0, import_react9.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { videoVolume: value });
    }, [nodeId, updateNodeData]);
    const handleAudioVolumeChange = (0, import_react9.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { audioVolume: value });
    }, [nodeId, updateNodeData]);
    const handleReplaceAudioChange = (0, import_react9.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { replaceAudio: value });
    }, [nodeId, updateNodeData]);
    const handleFilenameChange = (0, import_react9.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { filename: value });
    }, [nodeId, updateNodeData]);
    const videoVol = data.videoVolume ?? 1;
    const audioVol = data.audioVolume ?? 1;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "text-teal-400", children: [
        "V:",
        (videoVol * 100).toFixed(0),
        "%"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "ml-1", children: [
        "A:",
        (audioVol * 100).toFixed(0),
        "%"
      ] })
    ] });
    const inputHandles = (0, import_react9.useMemo)(() => [
      { id: "video", type: "target", position: import_react10.Position.Left, color: "!bg-blue-500", size: "lg", label: "video" },
      { id: "audio", type: "target", position: import_react10.Position.Left, color: "!bg-teal-500", size: "lg", label: "audio" }
    ], []);
    const outputHandles = (0, import_react9.useMemo)(() => [
      { id: "video", type: "source", position: import_react10.Position.Right, color: "!bg-blue-500", size: "lg", label: "video" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_zipp_ui_components5.CollapsibleNodeWrapper,
      {
        title: "Audio Mixer",
        color: "teal",
        icon: AudioMixerIcon,
        width: 300,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Video Volume" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "text-xs text-teal-400", children: [
                (videoVol * 100).toFixed(0),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "2",
                step: "0.1",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500",
                value: videoVol,
                onChange: (e) => handleVideoVolumeChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Audio Volume" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "text-xs text-teal-400", children: [
                (audioVol * 100).toFixed(0),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "2",
                step: "0.1",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500",
                value: audioVol,
                onChange: (e) => handleAudioVolumeChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Replace Original Audio" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "button",
              {
                type: "button",
                className: `relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${data.replaceAudio ? "bg-teal-600" : "bg-slate-600"}`,
                onClick: () => handleReplaceAudioChange(!data.replaceAudio),
                onMouseDown: (e) => e.stopPropagation(),
                children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "span",
                  {
                    className: `inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${data.replaceAudio ? "translate-x-4" : "translate-x-1"}`
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                placeholder: "mixed_video",
                value: data.filename || "mixed_video",
                onChange: (e) => handleFilenameChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-800/30 rounded text-xs text-teal-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: data.replaceAudio ? "Audio will replace video sound" : "Audio will mix with video sound" })
          ] })
        ] })
      }
    );
  }
  var AudioMixerNode_default = (0, import_react9.memo)(AudioMixerNode);

  // ../zipp-core/modules/core-video/ui/VideoAvatarNode.tsx
  var import_react11 = __toESM(require_react(), 1);
  var import_react12 = __toESM(require_react2(), 1);
  var import_zipp_ui_components6 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);
  var VideoAvatarIcon = /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) });
  function VideoAvatarNode({ data }) {
    const nodeId = (0, import_react12.useNodeId)();
    const { updateNodeData } = (0, import_react12.useReactFlow)();
    const onCollapsedChangeRef = (0, import_react11.useRef)(data.onCollapsedChange);
    (0, import_react11.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react11.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleApiUrlChange = (0, import_react11.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { apiUrl: value });
    }, [nodeId, updateNodeData]);
    const handlePromptChange = (0, import_react11.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { prompt: value });
    }, [nodeId, updateNodeData]);
    const handleGuidanceScaleChange = (0, import_react11.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { guidanceScale: value });
    }, [nodeId, updateNodeData]);
    const handleInferenceStepsChange = (0, import_react11.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { numInferenceSteps: value });
    }, [nodeId, updateNodeData]);
    const guidanceScale = data.guidanceScale ?? 5;
    const inferenceSteps = data.numInferenceSteps ?? 30;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "text-purple-400", children: "Ditto Avatar" }) });
    const inputHandles = (0, import_react11.useMemo)(() => [
      { id: "image", type: "target", position: import_react12.Position.Left, color: "!bg-amber-500", size: "lg", label: "image" },
      { id: "audio", type: "target", position: import_react12.Position.Left, color: "!bg-teal-500", size: "lg", label: "audio" }
    ], []);
    const outputHandles = (0, import_react11.useMemo)(() => [
      { id: "video", type: "source", position: import_react12.Position.Right, color: "!bg-blue-500", size: "lg", label: "video" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_zipp_ui_components6.CollapsibleNodeWrapper,
      {
        title: "Video Avatar",
        color: "purple",
        icon: VideoAvatarIcon,
        width: 320,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "API URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: "http://127.0.0.1:8768/generate",
                value: data.apiUrl || "http://127.0.0.1:8768/generate",
                onChange: (e) => handleApiUrlChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Prompt (optional)" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: "A person talking naturally",
                value: data.prompt || "",
                onChange: (e) => handlePromptChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Guidance Scale" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "text-xs text-purple-400", children: guidanceScale.toFixed(1) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "range",
                min: "1",
                max: "15",
                step: "0.5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500",
                value: guidanceScale,
                onChange: (e) => handleGuidanceScaleChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Inference Steps" }),
              /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "text-xs text-purple-400", children: inferenceSteps })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "range",
                min: "10",
                max: "100",
                step: "5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500",
                value: inferenceSteps,
                onChange: (e) => handleInferenceStepsChange(parseInt(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-purple-900/20 border border-purple-800/30 rounded text-xs text-purple-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "Generates lip-synced video using Ditto" })
          ] })
        ] })
      }
    );
  }
  var VideoAvatarNode_default = (0, import_react11.memo)(VideoAvatarNode);

  // ../zipp-core/modules/core-video/ui/VideoPipNode.tsx
  var import_react13 = __toESM(require_react(), 1);
  var import_react14 = __toESM(require_react2(), 1);
  var import_zipp_ui_components7 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
  var VideoPipIcon = /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("rect", { x: "12", y: "10", width: "6", height: "5", rx: "0.5", strokeWidth: 2 })
  ] });
  function PipPreview({ position, size, shape }) {
    const pipSize = Math.max(20, size / 100 * 80);
    const getPosition = () => {
      switch (position) {
        case "top-left":
          return { top: 4, left: 4 };
        case "top-right":
          return { top: 4, right: 4 };
        case "bottom-left":
          return { bottom: 4, left: 4 };
        case "bottom-right":
          return { bottom: 4, right: 4 };
        default:
          return { bottom: 4, right: 4 };
      }
    };
    const getBorderRadius = () => {
      switch (shape) {
        case "circle":
          return "50%";
        case "rounded":
          return "4px";
        default:
          return "2px";
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "relative w-full h-16 bg-slate-200 dark:bg-slate-800 rounded border border-slate-300 dark:border-slate-600 overflow-hidden", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "absolute inset-0 flex items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-[8px] text-slate-500", children: "Main Video" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "div",
        {
          className: "absolute bg-cyan-500/80 border border-cyan-400 flex items-center justify-center",
          style: {
            width: pipSize,
            height: pipSize * 0.75,
            borderRadius: getBorderRadius(),
            ...getPosition()
          },
          children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-[6px] text-white font-bold", children: "PiP" })
        }
      )
    ] });
  }
  function VideoPipNode({ data }) {
    const nodeId = (0, import_react14.useNodeId)();
    const { updateNodeData } = (0, import_react14.useReactFlow)();
    const onCollapsedChangeRef = (0, import_react13.useRef)(data.onCollapsedChange);
    (0, import_react13.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react13.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handlePositionChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { position: value });
    }, [nodeId, updateNodeData]);
    const handleSizeChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { size: value });
    }, [nodeId, updateNodeData]);
    const handleMarginChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { margin: value });
    }, [nodeId, updateNodeData]);
    const handleShapeChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { shape: value });
    }, [nodeId, updateNodeData]);
    const handleMainVolumeChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { mainVolume: value });
    }, [nodeId, updateNodeData]);
    const handlePipVolumeChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { pipVolume: value });
    }, [nodeId, updateNodeData]);
    const handleStartTimeChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { startTime: value });
    }, [nodeId, updateNodeData]);
    const handlePipDurationChange = (0, import_react13.useCallback)((value) => {
      if (nodeId) updateNodeData(nodeId, { pipDuration: value });
    }, [nodeId, updateNodeData]);
    const position = data.position || "bottom-right";
    const size = data.size ?? 25;
    const margin = data.margin ?? 20;
    const shape = data.shape || "rectangle";
    const startTime = data.startTime ?? 0;
    const pipDuration = data.pipDuration ?? 0;
    const mainVolume = data.mainVolume ?? 1;
    const pipVolume = data.pipVolume ?? 1;
    const endTime = pipDuration > 0 ? startTime + pipDuration : null;
    const formatTime = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-cyan-400", children: "PiP" }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "ml-1", children: position })
    ] });
    const inputHandles = (0, import_react13.useMemo)(() => [
      { id: "mainVideo", type: "target", position: import_react14.Position.Left, color: "!bg-blue-500", size: "lg", label: "main" },
      { id: "pipVideo", type: "target", position: import_react14.Position.Left, color: "!bg-cyan-500", size: "lg", label: "pip" }
    ], []);
    const outputHandles = (0, import_react13.useMemo)(() => [
      { id: "video", type: "source", position: import_react14.Position.Right, color: "!bg-blue-500", size: "lg", label: "video" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      import_zipp_ui_components7.CollapsibleNodeWrapper,
      {
        title: "Video PiP",
        color: "cyan",
        icon: VideoPipIcon,
        width: 300,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Preview" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(PipPreview, { position, size, shape })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Position" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                value: position,
                onChange: (e) => handlePositionChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "top-left", children: "Top Left" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "top-right", children: "Top Right" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "bottom-left", children: "Bottom Left" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "bottom-right", children: "Bottom Right" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Size" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "text-xs text-cyan-400", children: [
                size,
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "10",
                max: "50",
                step: "5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500",
                value: size,
                onChange: (e) => handleSizeChange(parseInt(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Margin" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "text-xs text-cyan-400", children: [
                margin,
                "px"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "100",
                step: "5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500",
                value: margin,
                onChange: (e) => handleMarginChange(parseInt(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Shape" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                value: shape,
                onChange: (e) => handleShapeChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "rectangle", children: "Rectangle" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "rounded", children: "Rounded" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "circle", children: "Circle" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-slate-500 text-[10px] uppercase tracking-wide", children: "Audio Mix" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Main Volume" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "text-xs text-cyan-400", children: [
                (mainVolume * 100).toFixed(0),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "2",
                step: "0.1",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500",
                value: mainVolume,
                onChange: (e) => handleMainVolumeChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "PiP Volume" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "text-xs text-cyan-400", children: [
                (pipVolume * 100).toFixed(0),
                "%"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "2",
                step: "0.1",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500",
                value: pipVolume,
                onChange: (e) => handlePipVolumeChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-slate-500 text-[10px] uppercase tracking-wide", children: "Timing" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Start Time" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-xs text-cyan-400", children: formatTime(startTime) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "300",
                step: "0.5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500",
                value: startTime,
                onChange: (e) => handleStartTimeChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Duration" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-xs text-cyan-400", children: pipDuration === 0 ? "Auto" : formatTime(pipDuration) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "range",
                min: "0",
                max: "300",
                step: "0.5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500",
                value: pipDuration,
                onChange: (e) => handlePipDurationChange(parseFloat(e.target.value)),
                onMouseDown: (e) => e.stopPropagation(),
                onPointerDown: (e) => e.stopPropagation(),
                onTouchStart: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex items-center justify-between px-2 py-1.5 bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-slate-400", children: "PiP appears:" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "text-cyan-400 font-mono", children: [
              formatTime(startTime),
              " \u2192 ",
              endTime !== null ? formatTime(endTime) : "end of PiP"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-cyan-900/20 border border-cyan-800/30 rounded text-xs text-cyan-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "Overlay PiP video on main video" })
          ] })
        ] })
      }
    );
  }
  var VideoPipNode_default = (0, import_react13.memo)(VideoPipNode);

  // ../zipp-core/modules/core-video/ui/VideoDownloaderNode.tsx
  var import_react15 = __toESM(require_react(), 1);
  var import_react16 = __toESM(require_react2(), 1);
  var import_zipp_ui_components8 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);
  var DownloadIcon = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" }) });
  function VideoDownloaderNode({ data }) {
    const onCollapsedChangeRef = (0, import_react15.useRef)(data.onCollapsedChange);
    (0, import_react15.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react15.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleChange = (0, import_react15.useCallback)((field, value) => {
      data.onChange?.(field, value);
    }, [data]);
    const mode = data.mode ?? "video";
    const startTime = data.start ?? 0;
    const endTime = data.end ?? null;
    const quality = data.quality ?? "best";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: mode === "video" ? "text-orange-400" : "text-red-400", children: mode }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "mx-0.5", children: "|" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "text-orange-300", children: quality })
    ] });
    const inputHandles = (0, import_react15.useMemo)(() => [
      { id: "url", type: "target", position: import_react16.Position.Left, color: "!bg-blue-500", size: "lg", label: "url" }
    ], []);
    const outputHandles = (0, import_react15.useMemo)(() => [
      { id: "video", type: "source", position: import_react16.Position.Right, color: "!bg-orange-500", size: "lg", label: mode === "video" ? "video" : "audio" },
      { id: "duration", type: "source", position: import_react16.Position.Right, color: "!bg-purple-500", size: "sm", label: "duration", style: { top: "70%" } }
    ], [mode]);
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      import_zipp_ui_components8.CollapsibleNodeWrapper,
      {
        title: "Video Downloader",
        color: "orange",
        icon: DownloadIcon,
        width: 320,
        collapsedWidth: 150,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "API URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                placeholder: "http://127.0.0.1:8771/download",
                value: data.apiUrl || "http://127.0.0.1:8771/download",
                onChange: (e) => handleChange("apiUrl", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Video URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                placeholder: "https://youtube.com/watch?v=...",
                value: data.url || "",
                onChange: (e) => handleChange("url", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Download Mode" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === "video" ? "bg-orange-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("mode", "video"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Video"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === "audio" ? "bg-red-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("mode", "audio"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Audio Only"
                }
              )
            ] })
          ] }),
          mode === "video" && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Quality" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                value: quality,
                onChange: (e) => handleChange("quality", e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "best", children: "Best Available" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "1080", children: "1080p" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "720", children: "720p" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "480", children: "480p" }),
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: "360", children: "360p" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Start (s)" }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "input",
                {
                  type: "number",
                  min: "0",
                  step: "1",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  placeholder: "0",
                  value: startTime,
                  onChange: (e) => handleChange("start", parseFloat(e.target.value) || 0),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "End (s)" }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "input",
                {
                  type: "number",
                  min: "0",
                  step: "1",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-orange-500",
                  placeholder: "(full)",
                  value: endTime ?? "",
                  onChange: (e) => {
                    const val = e.target.value;
                    handleChange("end", val === "" ? null : parseFloat(val));
                  },
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          data.filePath && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-orange-900/20 border border-orange-800/30 rounded", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-4 h-4 text-orange-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "text-xs text-orange-300 truncate flex-1", children: [
              data.duration ? `${data.duration.toFixed(1)}s` : "Downloaded",
              data.width && data.height && ` (${data.width}x${data.height})`
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-4 h-4 text-orange-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "YouTube, Vimeo, TikTok + 1000 more" })
          ] })
        ] })
      }
    );
  }
  var VideoDownloaderNode_default = (0, import_react15.memo)(VideoDownloaderNode);

  // ../zipp-core/modules/core-video/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
