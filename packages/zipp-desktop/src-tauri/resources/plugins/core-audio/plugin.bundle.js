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

  // ../zipp-core/modules/core-audio/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-audio/runtime.ts
  var ctx;
  function extractPortFromUrl(url) {
    const match = url.match(/:(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
  async function resolveServiceUrl(_serviceKey, userUrl) {
    if (!userUrl) {
      throw new Error(`No API URL provided for service`);
    }
    const port = extractPortFromUrl(userUrl);
    if (!port) {
      return userUrl;
    }
    const urlMatch = userUrl.match(/^(https?:\/\/[^\/]+)(\/.*)?$/);
    const endpoint = urlMatch?.[2] || "";
    if (ctx.tauri) {
      try {
        ctx.log("info", `[Audio] Ensuring service on port ${port} is ready...`);
        const result = await ctx.tauri.invoke("ensure_service_ready_by_port", {
          port
        });
        if (result.success && result.port) {
          if (!result.already_running) {
            ctx.log("info", `[Audio] Service on port ${port} auto-started`);
          }
          return `http://127.0.0.1:${result.port}${endpoint}`;
        } else if (result.error) {
          ctx.log("warn", `[Audio] Service on port ${port} failed to start: ${result.error}`);
        }
      } catch (err) {
        ctx.log("info", `[Audio] Dynamic service lookup not available`);
      }
    }
    return userUrl;
  }
  async function ensureServiceReadyByPort(port) {
    if (!ctx.tauri) return { success: false };
    try {
      ctx.log("info", `[Audio] Ensuring service on port ${port} is ready...`);
      const result = await ctx.tauri.invoke("ensure_service_ready_by_port", {
        port
      });
      if (result.success && result.port) {
        if (!result.already_running) {
          ctx.log("info", `[Audio] Service on port ${port} auto-started`);
        }
        return { success: true, port: result.port };
      } else if (result.error) {
        ctx.log("warn", `[Audio] Service on port ${port} failed to start: ${result.error}`);
      }
    } catch {
      ctx.log("info", `[Audio] Dynamic service lookup not available`);
    }
    return { success: false };
  }
  async function fetchWithTimeout(url, options = {}, timeoutMs = 5e3) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
  async function checkServiceAvailable(apiUrl, serviceName) {
    const baseUrl = apiUrl.replace(/\/[^/]+$/, "");
    try {
      const quickCheck = await fetchWithTimeout(`${baseUrl}/health`, { method: "GET" }, 3e3);
      if (quickCheck.ok) {
        ctx.log("info", `[Audio] Service already running at ${baseUrl}`);
        return;
      }
    } catch {
      ctx.log("info", `[Audio] Service not responding, attempting auto-start...`);
    }
    const port = extractPortFromUrl(apiUrl);
    if (port) {
      await ensureServiceReadyByPort(port);
    }
    const maxRetries = 60;
    const retryDelay = 2e3;
    ctx.log("info", `[Audio] Starting health check loop for ${baseUrl}/health`);
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        ctx.log("info", `[Audio] Health check attempt ${attempt + 1}: fetching ${baseUrl}/health`);
        const healthCheck = await fetchWithTimeout(`${baseUrl}/health`, { method: "GET" }, 5e3);
        ctx.log("info", `[Audio] Health check response: status=${healthCheck.status}, ok=${healthCheck.ok}`);
        if (healthCheck.ok) {
          ctx.log("info", `[Audio] Service ready after ${attempt + 1} health check(s)`);
          return;
        }
        const healthData = await healthCheck.json().catch(() => ({}));
        ctx.log("info", `[Audio] Health data: ${JSON.stringify(healthData)}`);
        if (healthData.missing?.length) {
          throw new Error(`${serviceName} service is missing dependencies: ${healthData.missing.join(", ")}. Please install them and restart the service.`);
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes("missing dependencies")) {
          throw error;
        }
        if (ctx.abortSignal?.aborted) {
          throw new Error("Operation aborted by user");
        }
        const errMsg = error instanceof Error ? error.message : String(error);
        ctx.log("info", `[Audio] Health check attempt ${attempt + 1} failed: ${errMsg}`);
        if (attempt > 0 && attempt % 10 === 0) {
          ctx.log("info", `[Audio] Waiting for service to be ready (attempt ${attempt + 1}/${maxRetries})...`);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
    throw new Error(`${serviceName} service is not running. Please start it from the Services panel (gear icon > Services).`);
  }
  async function textToSpeech(text, apiUrl, responseFormat, description, outputFormat, filename, nodeId, audioPromptPath, speaker, language) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[TTS] Aborted by user before starting");
      throw new Error("Operation aborted by user");
    }
    ctx.log("info", `[TTS] Generating speech via API: ${apiUrl} (format: ${responseFormat})`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!text || text.trim() === "") {
        throw new Error("No text provided for TTS");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      const serviceName = apiUrl.includes(":8772") ? "Qwen3 TTS" : "Chatterbox TTS";
      await checkServiceAvailable(apiUrl, serviceName);
      const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
      if (responseFormat === "json") {
        const requestBody = { text };
        if (description) requestBody.description = description;
        if (speaker) requestBody.speaker = speaker;
        if (language && language !== "Auto") requestBody.language = language;
        if (audioPromptPath && audioPromptPath.trim() !== "") {
          requestBody.audio_prompt_path = audioPromptPath;
          ctx.log("info", `[TTS] Using audio prompt: ${audioPromptPath}`);
        }
        ctx.log("info", `[TTS] Sending JSON request with text: "${text.substring(0, 50)}..."`);
        const response2 = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        if (!response2.ok) {
          const errorText = await response2.text();
          throw new Error(`TTS API error: ${response2.status} ${response2.statusText} - ${errorText}`);
        }
        const result = await response2.json();
        if (result.success === false) {
          throw new Error(`TTS failed: ${result.message || "Unknown error"}`);
        }
        ctx.log("info", `[TTS] Generated audio: ${result.audio_path}`);
        const outputPath2 = `${appDataDir}/output/${filename || "tts"}_${Date.now()}.wav`;
        try {
          await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
            source: result.audio_path,
            destination: outputPath2,
            createDirs: true
          });
          ctx.log("info", `[TTS] Copied audio to ${outputPath2}`);
        } catch (copyError) {
          ctx.log("warn", `[TTS] Copy failed, using original path: ${copyError}`);
          const audioUrl3 = await ctx.tauri.invoke("get_media_url", { filePath: result.audio_path });
          ctx.onNodeStatus?.(nodeId, "completed");
          return { audio: audioUrl3, path: result.audio_path, durationMs: result.duration_ms };
        }
        let audioUrl2 = outputPath2;
        try {
          audioUrl2 = await ctx.tauri.invoke("get_media_url", { filePath: outputPath2 });
        } catch (e) {
          ctx.log("error", `[TTS] Failed to get media URL: ${e}`);
        }
        ctx.onNodeStatus?.(nodeId, "completed");
        return { audio: audioUrl2, path: outputPath2, durationMs: result.duration_ms };
      }
      const fileExt = responseFormat === "audio_file" ? outputFormat || "mp3" : "wav";
      const outputPath = `${appDataDir}/output/${filename || "tts"}_${Date.now()}.${fileExt}`;
      const formData = new FormData();
      formData.append("text", text);
      if (description) formData.append("description", description);
      if (speaker) formData.append("speaker", speaker);
      if (language && language !== "Auto") formData.append("language", language);
      if (audioPromptPath && audioPromptPath.trim() !== "") {
        formData.append("audio_prompt_path", audioPromptPath);
      }
      ctx.log("info", `[TTS] Sending request with text: "${text.substring(0, 50)}..."`);
      const response = await fetch(apiUrl, {
        method: "POST",
        body: formData
      });
      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status} ${response.statusText}`);
      }
      if (responseFormat === "audio_file") {
        const audioBlob = await response.blob();
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioData = new Uint8Array(arrayBuffer);
        ctx.log("info", `[TTS] Received ${audioData.length} bytes of audio file`);
        const base64Audio = uint8ArrayToBase64(audioData);
        await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
          path: outputPath,
          content: base64Audio,
          contentType: "base64",
          createDirs: true
        });
      } else {
        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error("No response body from TTS API");
        }
        const chunks = [];
        while (true) {
          if (ctx.abortSignal?.aborted) {
            ctx.log("info", "[TTS] Aborted by user during streaming");
            throw new Error("Operation aborted by user");
          }
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const pcmData = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          pcmData.set(chunk, offset);
          offset += chunk.length;
        }
        ctx.log("info", `[TTS] Received ${pcmData.length} bytes of PCM audio`);
        const sampleRate = 24e3;
        const numChannels = 1;
        const bitsPerSample = 16;
        const wavBuffer = createWavBuffer(pcmData, sampleRate, numChannels, bitsPerSample);
        const base64Audio = uint8ArrayToBase64(wavBuffer);
        await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
          path: outputPath,
          content: base64Audio,
          contentType: "base64",
          createDirs: true
        });
      }
      ctx.log("info", `[TTS] Audio saved to ${outputPath}`);
      let audioUrl = outputPath;
      try {
        audioUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
        ctx.log("info", `[TTS] Media URL: ${audioUrl}`);
      } catch (e) {
        ctx.log("error", `[TTS] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { audio: audioUrl, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[TTS] Failed: ${errMsg}`);
      throw error;
    }
  }
  function createWavBuffer(pcmData, sampleRate, numChannels, bitsPerSample) {
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcmData.length;
    const headerSize = 44;
    const totalSize = headerSize + dataSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    writeString(view, 0, "RIFF");
    view.setUint32(4, totalSize - 8, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataSize, true);
    const wavBuffer = new Uint8Array(buffer);
    wavBuffer.set(pcmData, headerSize);
    return wavBuffer;
  }
  function writeString(view, offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }
  function uint8ArrayToBase64(data) {
    const CHUNK_SIZE = 8192;
    let result = "";
    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.subarray(i, Math.min(i + CHUNK_SIZE, data.length));
      result += String.fromCharCode.apply(null, chunk);
    }
    return btoa(result);
  }
  async function saveAudio(audioPath, filename, directory, format, overwrite, nodeId) {
    ctx.log("info", `[Audio] Saving audio: ${audioPath}`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!audioPath) {
        throw new Error("No audio path provided");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      let outputDir = directory;
      if (!outputDir) {
        const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
        outputDir = `${appDataDir}/output`;
      }
      const ext = format || "wav";
      const outputPath = `${outputDir}/${filename || "audio_output"}.${ext}`;
      ctx.log("info", `[Audio] Copying to: ${outputPath}`);
      await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
        source: audioPath,
        destination: outputPath,
        createDirs: true
      });
      ctx.log("info", `[Audio] Audio saved to ${outputPath}`);
      let audioUrl = outputPath;
      try {
        audioUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
        ctx.log("info", `[Audio] Media URL: ${audioUrl}`);
      } catch (e) {
        ctx.log("error", `[Audio] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { path: audioUrl };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Audio] Save failed: ${errMsg}`);
      throw error;
    }
  }
  async function generateMusicAceStep15(prompt, lyrics, baseUrl, duration, settings, seed, nodeId) {
    const hasLyrics = lyrics && lyrics.trim() !== "" && !lyrics.trim().toLowerCase().match(/^\[?(inst|instrumental)\]?$/);
    const requestBody = {
      prompt,
      // This is the caption/style description
      lyrics: lyrics || "",
      audio_duration: duration,
      infer_step: settings.inferSteps ?? 8,
      // v1.5 turbo uses 8 steps by default
      guidance_scale: settings.guidanceScale ?? 15,
      // Enable thinking mode when lyrics are provided - this uses the 5Hz LM to generate
      // audio codes that incorporate the vocals/lyrics
      thinking: !!hasLyrics,
      vocal_language: "en"
      // Default to English for now
    };
    if (hasLyrics) {
      ctx.log("info", `[Music Gen] Lyrics detected, enabling thinking mode for vocal generation`);
    }
    if (seed >= 0) {
      requestBody.seed = seed;
      requestBody.use_random_seed = false;
    } else {
      requestBody.use_random_seed = true;
    }
    ctx.log("info", `[Music Gen] Submitting task to ACE-Step 1.5: ${baseUrl}/release_task`);
    const submitResponse = await fetch(`${baseUrl}/release_task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(`ACE-Step task submission failed: ${submitResponse.status} ${submitResponse.statusText} - ${errorText}`);
    }
    const submitWrapper = await submitResponse.json();
    const submitResult = submitWrapper.data || submitWrapper;
    const taskId = submitResult.task_id;
    if (!taskId) {
      throw new Error(`ACE-Step task submission failed: No task_id returned - ${JSON.stringify(submitWrapper)}`);
    }
    ctx.log("info", `[Music Gen] Task submitted: ${taskId}, polling for results...`);
    const maxAttempts = 120;
    const initialDelay = 2e3;
    const maxDelay = 1e4;
    let delay = initialDelay;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (ctx.abortSignal?.aborted) {
        ctx.log("info", "[Music Gen] Aborted by user during polling");
        throw new Error("Operation aborted by user");
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      const queryResponse = await fetch(`${baseUrl}/query_result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id_list: [taskId] })
      });
      if (!queryResponse.ok) {
        ctx.log("warn", `[Music Gen] Query failed (attempt ${attempt + 1}): ${queryResponse.status}`);
        delay = Math.min(delay * 1.5, maxDelay);
        continue;
      }
      const queryWrapper = await queryResponse.json();
      const taskResults = queryWrapper.data || [];
      const taskResult = taskResults.find((r) => r.task_id === taskId);
      if (taskResult) {
        if (taskResult.status === 1 && taskResult.result) {
          try {
            const audioResults = JSON.parse(taskResult.result);
            if (audioResults.length > 0 && audioResults[0].file) {
              let filePath = audioResults[0].file;
              if (filePath.includes("?path=")) {
                const pathParam = filePath.split("?path=")[1];
                filePath = decodeURIComponent(pathParam);
              }
              ctx.log("info", `[Music Gen] Task completed: ${filePath}`);
              return { audioPath: filePath };
            }
          } catch (parseErr) {
            ctx.log("warn", `[Music Gen] Failed to parse result JSON: ${parseErr}`);
          }
        } else if (taskResult.status === 2) {
          throw new Error("Music generation failed on server");
        }
      }
      ctx.log("info", `[Music Gen] Task still processing (attempt ${attempt + 1}/${maxAttempts})...`);
      ctx.onNodeStatus?.(nodeId, "running");
      delay = Math.min(delay * 1.2, maxDelay);
    }
    throw new Error("Music generation timed out after maximum polling attempts");
  }
  async function generateMusic(prompt, lyrics, apiUrl, duration, service, settings, seed, filename, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Music Gen] Aborted by user before starting");
      throw new Error("Operation aborted by user");
    }
    const serviceName = service === "heartmula" ? "HeartMuLa Music" : "ACE-Step Music";
    ctx.log("info", `[Music Gen] Generating music via ${serviceName}: ${apiUrl}`);
    ctx.log("info", `[Music Gen] Prompt: "${prompt.substring(0, 50)}...", Duration: ${duration}s`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!prompt || prompt.trim() === "") {
        throw new Error("No prompt provided for music generation");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      const baseUrl = apiUrl.replace(/\/[^/]+$/, "");
      await checkServiceAvailable(apiUrl, serviceName);
      let audioPath;
      if (service === "ace-step") {
        const result = await generateMusicAceStep15(
          prompt,
          lyrics,
          baseUrl,
          duration,
          settings,
          seed,
          nodeId
        );
        audioPath = result.audioPath;
      } else {
        const requestBody = {
          prompt,
          lyrics: lyrics || "",
          duration,
          temperature: settings.temperature ?? 1,
          topk: settings.topk ?? 50,
          cfg_scale: settings.cfgScale ?? 1.5
        };
        if (seed >= 0) {
          requestBody.seed = seed;
        }
        ctx.log("info", `[Music Gen] Sending request to ${serviceName}...`);
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Music Gen API error: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const result = await response.json();
        if (result.success === false) {
          throw new Error(`Music generation failed: ${result.message || "Unknown error"}`);
        }
        audioPath = result.audio_path;
      }
      ctx.log("info", `[Music Gen] Generated audio: ${audioPath}`);
      const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
      const sourceExt = audioPath.split(".").pop() || "mp3";
      const outputPath = `${appDataDir}/output/${filename || "music"}_${Date.now()}.${sourceExt}`;
      try {
        await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
          source: audioPath,
          destination: outputPath,
          createDirs: true
        });
        ctx.log("info", `[Music Gen] Copied audio to ${outputPath}`);
      } catch (copyError) {
        ctx.log("warn", `[Music Gen] Copy failed, using original path: ${copyError}`);
        const audioUrl2 = await ctx.tauri.invoke("get_media_url", { filePath: audioPath });
        ctx.onNodeStatus?.(nodeId, "completed");
        return { audio: audioUrl2, path: audioPath };
      }
      let audioUrl = outputPath;
      try {
        audioUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
      } catch (e) {
        ctx.log("error", `[Music Gen] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { audio: audioUrl, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Music Gen] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function grabAudio(url, apiUrl, start, end, sampleRate, mono, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Audio DL] Aborted by user before starting");
      throw new Error("Operation aborted by user");
    }
    ctx.log("info", `[Audio DL] Downloading audio from: ${url}`);
    ctx.log("info", `[Audio DL] Time range: ${start}s - ${end ?? "end"}, Sample rate: ${sampleRate}, Mono: ${mono}`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!url || url.trim() === "") {
        throw new Error("No URL provided for audio download");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      await checkServiceAvailable(apiUrl, "Audio Downloader");
      const requestBody = {
        url,
        start: start || 0,
        sample_rate: sampleRate || 44100,
        mono: mono || false
      };
      if (end !== null) {
        requestBody.end = end;
      }
      ctx.log("info", `[Audio DL] Sending request to ${apiUrl}...`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Audio download API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const result = await response.json();
      if (result.success === false) {
        throw new Error(`Audio download failed: ${result.message || "Unknown error"}`);
      }
      ctx.log("info", `[Audio DL] Downloaded audio: ${result.audio_path} (${result.duration_seconds}s)`);
      const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
      const outputPath = `${appDataDir}/output/audio_dl_${result.video_id || "clip"}_${Date.now()}.wav`;
      try {
        await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
          source: result.audio_path,
          destination: outputPath,
          createDirs: true
        });
        ctx.log("info", `[Audio DL] Copied audio to ${outputPath}`);
      } catch (copyError) {
        ctx.log("warn", `[Audio DL] Copy failed, using original path: ${copyError}`);
        const audioUrl2 = await ctx.tauri.invoke("get_media_url", { filePath: result.audio_path });
        ctx.onNodeStatus?.(nodeId, "completed");
        return { audio: audioUrl2, path: result.audio_path, duration: result.duration_seconds || 0 };
      }
      let audioUrl = outputPath;
      try {
        audioUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
      } catch (e) {
        ctx.log("error", `[Audio DL] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { audio: audioUrl, path: outputPath, duration: result.duration_seconds || 0 };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Audio DL] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function speechToText(mediaPath, apiUrl, language, enableWordTimestamps, enableDiarization, minSpeakers, maxSpeakers, startTime, endTime, nodeId, hfTokenConstant = null) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[STT] Aborted by user before starting");
      throw new Error("Operation aborted by user");
    }
    ctx.log("info", `[STT] Transcribing: ${mediaPath}`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!mediaPath || mediaPath.trim() === "") {
        throw new Error("No media file provided for transcription");
      }
      let resolvedPath = mediaPath;
      if (mediaPath.startsWith("http://127.0.0.1:") && mediaPath.includes("/media/")) {
        if (ctx.tauri) {
          const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
          resolvedPath = mediaPath.replace(/http:\/\/127\.0\.0\.1:\d+\/media\/zipp-output\//, `${appDataDir}/output/`);
        }
      }
      if (typeof mediaPath === "object" && mediaPath !== null) {
        const mediaObj = mediaPath;
        resolvedPath = mediaObj.path || mediaObj.audio || mediaObj.video || "";
      }
      ctx.log("info", `[STT] Resolved path: ${resolvedPath}`);
      await checkServiceAvailable(apiUrl, "WhisperX STT");
      let hfToken = null;
      if (hfTokenConstant && enableDiarization) {
        if (ctx.getConstant) {
          hfToken = ctx.getConstant(hfTokenConstant) || null;
        }
        if (!hfToken) {
          const settingToken = ctx.getModuleSetting?.(hfTokenConstant);
          if (typeof settingToken === "string") {
            hfToken = settingToken;
          }
        }
        if (hfToken) {
          ctx.log("info", `[STT] Using HuggingFace token from constant: ${hfTokenConstant}`);
        } else {
          ctx.log("warn", `[STT] HuggingFace token constant '${hfTokenConstant}' not found - diarization may fail`);
        }
      }
      const requestBody = {
        audio_path: resolvedPath,
        enable_word_timestamps: enableWordTimestamps,
        enable_diarization: enableDiarization
      };
      if (hfToken) {
        requestBody.hf_token = hfToken;
      }
      if (language && language.trim() !== "") {
        requestBody.language = language;
      }
      if (startTime !== null && startTime !== void 0) {
        requestBody.start_time = startTime;
      }
      if (endTime !== null && endTime !== void 0) {
        requestBody.end_time = endTime;
      }
      if (enableDiarization) {
        if (minSpeakers !== null && minSpeakers !== void 0) {
          requestBody.min_speakers = minSpeakers;
        }
        if (maxSpeakers !== null && maxSpeakers !== void 0) {
          requestBody.max_speakers = maxSpeakers;
        }
      }
      ctx.log("info", `[STT] Sending request to ${apiUrl}...`);
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`STT API error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      const result = await response.json();
      if (result.success === false) {
        throw new Error(`Transcription failed: ${result.message || "Unknown error"}`);
      }
      ctx.log("info", `[STT] Transcription complete: ${result.segments?.length || 0} segments, ${result.word_count || 0} words`);
      ctx.log("info", `[STT] Detected language: ${result.language}, Duration: ${result.duration}s`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return {
        text: result.text || "",
        segments: result.segments || [],
        language: result.language || "unknown",
        duration: result.duration || 0
      };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[STT] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function appendAudio(audios, filename, format, nodeId) {
    ctx.log("info", `[Audio Append] Concatenating ${audios?.length || 0} audio files`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!audios || audios.length === 0) {
        throw new Error("No audio files provided");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      const audioPaths = [];
      for (let i = 0; i < audios.length; i++) {
        const audio = audios[i];
        let audioPath = "";
        if (typeof audio === "string") {
          audioPath = audio;
        } else if (audio && typeof audio === "object") {
          audioPath = audio.path || audio.audio || "";
        }
        if (audioPath) {
          if (audioPath.startsWith("http://127.0.0.1:") && audioPath.includes("/media/")) {
            const appDataDir2 = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
            audioPath = audioPath.replace(/http:\/\/127\.0\.0\.1:\d+\/media\/zipp-output\//, `${appDataDir2}/output/`);
          }
          audioPaths.push(audioPath);
        }
      }
      if (audioPaths.length === 0) {
        throw new Error("No valid audio paths found");
      }
      ctx.log("info", `[Audio Append] Processing ${audioPaths.length} audio files`);
      const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
      const outputDir = `${appDataDir}/output`;
      const ext = format || "wav";
      const outputPath = `${outputDir}/${filename || "concatenated_audio"}_${Date.now()}.${ext}`;
      const tempDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_temp_dir");
      const concatListPath = `${tempDir}/audio_concat_${Date.now()}.txt`;
      let concatContent = "";
      for (const audioPath of audioPaths) {
        const escapedPath = audioPath.replace(/\\/g, "/").replace(/'/g, "'\\''");
        concatContent += `file '${escapedPath}'
`;
      }
      await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
        path: concatListPath,
        content: concatContent,
        contentType: "text",
        createDirs: true
      });
      ctx.log("info", `[Audio Append] Concat list created: ${concatListPath}`);
      const args = [
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatListPath,
        "-c",
        "copy",
        "-y",
        outputPath
      ];
      const result = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffmpeg", args, cwd: null }
      );
      await ctx.tauri.invoke("plugin:zipp-filesystem|delete_file", { path: concatListPath }).catch(() => {
      });
      if (result?.code !== 0) {
        ctx.log("error", `[Audio Append] FFmpeg stderr: ${result?.stderr}`);
        throw new Error(`FFmpeg concat failed: ${result?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[Audio Append] Output saved to ${outputPath}`);
      let audioUrl = outputPath;
      try {
        audioUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
      } catch (e) {
        ctx.log("error", `[Audio Append] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { audio: audioUrl, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : String(error);
      ctx.log("error", `[Audio Append] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function getAudioDuration(audioPath) {
    ctx.log("info", `[Audio] Getting duration for: ${audioPath}`);
    if (!audioPath) {
      ctx.log("warn", "[Audio] No audio path provided for duration check");
      return 0;
    }
    if (!ctx.tauri) {
      ctx.log("warn", "[Audio] Tauri not available for duration check");
      return 0;
    }
    try {
      let resolvedPath = audioPath;
      if (audioPath.startsWith("http://127.0.0.1:") && audioPath.includes("/media/")) {
        const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
        const urlMatch = audioPath.match(/\/media\/zipp-output\/(.+)$/) || audioPath.match(/\/media\/(.+)$/);
        if (urlMatch) {
          const relativePath = urlMatch[1];
          if (audioPath.includes("/media/zipp-output/")) {
            resolvedPath = `${appDataDir}/output/${relativePath}`;
          } else {
            resolvedPath = `${appDataDir}/${relativePath}`;
          }
        }
      }
      ctx.log("info", `[Audio] Resolved path for ffprobe: ${resolvedPath}`);
      const args = [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        resolvedPath
      ];
      const result = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffprobe", args, cwd: null }
      );
      if (result?.code === 0 && result.stdout) {
        const durationSec = parseFloat(result.stdout.trim());
        const durationMs = Math.round(durationSec * 1e3);
        ctx.log("info", `[Audio] Duration: ${durationSec}s (${durationMs}ms)`);
        return durationMs;
      } else {
        ctx.log("warn", `[Audio] ffprobe failed: ${result?.stderr || "Unknown error"}`);
        return 0;
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Audio] Failed to get duration: ${errMsg}`);
      return 0;
    }
  }
  async function fadeAudio(videoPath, fadeDuration, fadeType, fadeDirection, filename, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Audio Fade] Aborted by user before starting");
      throw new Error("Operation aborted by user");
    }
    ctx.log("info", `[Audio Fade] Applying ${fadeType} fade ${fadeDirection} (${fadeDuration}s) to: ${videoPath}`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      if (!videoPath || videoPath.trim() === "") {
        throw new Error("No video path provided for audio fade");
      }
      if (!ctx.tauri) throw new Error("Tauri not available");
      let resolvedPath = videoPath;
      if (videoPath.startsWith("http://127.0.0.1:") && videoPath.includes("/media/")) {
        const appDataDir2 = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
        resolvedPath = videoPath.replace(/http:\/\/127\.0\.0\.1:\d+\/media\/zipp-output\//, `${appDataDir2}/output/`);
      }
      ctx.log("info", `[Audio Fade] Resolved path: ${resolvedPath}`);
      const probeArgs = [
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        resolvedPath
      ];
      const probeResult = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffprobe", args: probeArgs, cwd: null }
      );
      if (probeResult?.code !== 0 || !probeResult.stdout) {
        throw new Error(`Failed to get video duration: ${probeResult?.stderr || "Unknown error"}`);
      }
      const totalDuration = parseFloat(probeResult.stdout.trim());
      ctx.log("info", `[Audio Fade] Video duration: ${totalDuration}s`);
      const actualFadeDuration = Math.min(fadeDuration, totalDuration);
      const fadeStart = fadeDirection === "out" ? Math.max(0, totalDuration - actualFadeDuration) : 0;
      const ffmpegCurve = fadeType === "exponential" ? "exp" : "tri";
      const afadeFilter = `afade=t=${fadeDirection}:st=${fadeStart}:d=${actualFadeDuration}:curve=${ffmpegCurve}`;
      ctx.log("info", `[Audio Fade] Filter: ${afadeFilter}`);
      const appDataDir = await ctx.tauri.invoke("plugin:zipp-filesystem|get_app_data_dir");
      const outputPath = `${appDataDir}/output/${filename || "audio_faded"}_${Date.now()}.mp4`;
      const ffmpegArgs = [
        "-i",
        resolvedPath,
        "-vcodec",
        "copy",
        "-af",
        afadeFilter,
        "-y",
        outputPath
      ];
      ctx.log("info", `[Audio Fade] Running FFmpeg...`);
      const ffmpegResult = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|run_command",
        { command: "ffmpeg", args: ffmpegArgs, cwd: null }
      );
      if (ffmpegResult?.code !== 0) {
        ctx.log("error", `[Audio Fade] FFmpeg stderr: ${ffmpegResult?.stderr}`);
        throw new Error(`FFmpeg audio fade failed: ${ffmpegResult?.stderr || "Unknown error"}`);
      }
      ctx.log("info", `[Audio Fade] Output saved to ${outputPath}`);
      let videoUrl = outputPath;
      try {
        videoUrl = await ctx.tauri.invoke("get_media_url", { filePath: outputPath });
      } catch (e) {
        ctx.log("error", `[Audio Fade] Failed to get media URL: ${e}`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      return { video: videoUrl, path: outputPath };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Audio Fade] Failed: ${errMsg}`);
      throw error;
    }
  }
  var CoreAudioRuntime = {
    name: "Audio",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Audio] Module initialized");
    },
    methods: {
      textToSpeech,
      saveAudio,
      generateMusic,
      grabAudio,
      appendAudio,
      speechToText,
      resolveServiceUrl,
      getAudioDuration,
      fadeAudio
    },
    async cleanup() {
      ctx?.log?.("info", "[Audio] Module cleanup");
    }
  };
  var runtime_default = CoreAudioRuntime;

  // ../zipp-core/modules/core-audio/compiler.ts
  var CoreAudioCompiler = {
    name: "Audio",
    getNodeTypes() {
      return ["text_to_speech", "save_audio", "music_gen", "audio_append", "speech_to_text", "audio_fade"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      if (nodeType === "text_to_speech") {
        const textVar = inputs.get("text") || `"${escapeString(String(data.text || ""))}"`;
        const descriptionInput = inputs.get("descriptionInput");
        const descriptionProp = `"${escapeString(String(data.description || ""))}"`;
        const description = descriptionInput ? `${descriptionInput} || ${descriptionProp}` : descriptionProp;
        const audioPromptInput = inputs.get("audioPrompt");
        let audioPromptPath;
        if (audioPromptInput) {
          audioPromptPath = `(typeof ${audioPromptInput} === 'object' && ${audioPromptInput}.path ? ${audioPromptInput}.path : ${audioPromptInput})`;
        } else {
          audioPromptPath = '""';
        }
        const service = String(data.service || "chatterbox-tts");
        let apiUrl;
        let serviceId;
        if (service === "qwen3-tts") {
          apiUrl = "http://127.0.0.1:8772/tts";
          serviceId = "qwen3-tts";
        } else if (service === "custom") {
          apiUrl = escapeString(String(data.apiUrl || "http://127.0.0.1:8765/tts"));
          serviceId = "";
        } else {
          apiUrl = "http://127.0.0.1:8765/tts";
          serviceId = "chatterbox-tts";
        }
        const responseFormat = escapeString(String(data.responseFormat || "json"));
        const outputFormat = escapeString(String(data.outputFormat || "wav"));
        const filename = escapeString(String(data.filename || "tts_output"));
        const speaker = escapeString(String(data.speaker || ""));
        const language = escapeString(String(data.language || "Auto"));
        const resolveServiceCall = serviceId ? `await Audio.resolveServiceUrl("${serviceId}", "${apiUrl}")` : `"${apiUrl}"`;
        let code = `
  // --- Node: ${node.id} (text_to_speech) ---
  const ${outputVar}_apiUrl = ${resolveServiceCall};
  ${letOrAssign}${outputVar} = await Audio.textToSpeech(
    ${textVar},
    ${outputVar}_apiUrl,
    "${responseFormat}",
    ${description},
    "${outputFormat}",
    "${filename}",
    "${node.id}",
    ${audioPromptPath},
    "${speaker}",
    "${language}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "save_audio") {
        let audioVar = inputs.get("audio") || '""';
        if (audioVar.includes("_out_audio")) {
          const baseVar = audioVar.replace(/_audio$/, "");
          audioVar = `(${baseVar}.path || ${audioVar})`;
        } else if (audioVar.includes("_out") && !audioVar.includes(".path")) {
          audioVar = `(typeof ${audioVar} === 'object' && ${audioVar}.path ? ${audioVar}.path : ${audioVar})`;
        }
        const filename = escapeString(String(data.filename || "audio_output"));
        const directory = escapeString(String(data.directory || ""));
        const format = escapeString(String(data.format || "wav"));
        const overwrite = Boolean(data.overwrite);
        let code = `
  // --- Node: ${node.id} (save_audio) ---
  ${letOrAssign}${outputVar} = await Audio.saveAudio(
    ${audioVar},
    "${filename}",
    "${directory}",
    "${format}",
    ${overwrite},
    "${node.id}"
  );
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "music_gen") {
        const service = escapeString(String(data.service || "ace-step"));
        const promptInput = inputs.get("prompt");
        const promptProp = `"${escapeString(String(data.prompt || "pop, energetic, catchy melody"))}"`;
        const prompt = promptInput ? `${promptInput} || ${promptProp}` : promptProp;
        const lyricsInput = inputs.get("lyrics");
        const lyricsProp = `"${escapeString(String(data.lyrics || ""))}"`;
        const lyrics = lyricsInput ? `${lyricsInput} || ${lyricsProp}` : lyricsProp;
        const durationInput = inputs.get("duration");
        const durationProp = Number(data.duration) || 60;
        const durationExpr = durationInput ? `(typeof ${durationInput} === 'number' ? ${durationInput} : (parseFloat(${durationInput}) || ${durationProp}))` : String(durationProp);
        const defaultApiUrl = service === "heartmula" ? "http://127.0.0.1:8767/generate" : "http://127.0.0.1:8766/generate";
        const apiUrl = escapeString(String(data.apiUrl || defaultApiUrl));
        const inferSteps = Number(data.inferSteps) || 8;
        const guidanceScale = Number(data.guidanceScale) || 15;
        const temperature = Number(data.temperature) || 1;
        const topk = Number(data.topk) || 50;
        const cfgScale = Number(data.cfgScale) || 1.5;
        const seed = Number(data.seed) || -1;
        const filename = escapeString(String(data.filename || "music_output"));
        let code = `
  // --- Node: ${node.id} (music_gen) ---
  ${letOrAssign}${outputVar} = await Audio.generateMusic(
    ${prompt},
    ${lyrics},
    "${apiUrl}",
    ${durationExpr},
    "${service}",
    { inferSteps: ${inferSteps}, guidanceScale: ${guidanceScale}, temperature: ${temperature}, topk: ${topk}, cfgScale: ${cfgScale} },
    ${seed},
    "${filename}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "audio_append") {
        const audiosVar = inputs.get("audios") || "[]";
        const filename = escapeString(String(data.filename || "concatenated_audio"));
        const format = escapeString(String(data.format || "wav"));
        let code = `
  // --- Node: ${node.id} (audio_append) ---
  ${letOrAssign}${outputVar} = await Audio.appendAudio(
    ${audiosVar},
    "${filename}",
    "${format}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  // Always use 'let' for suffix variables as they are only created here (not pre-declared by main compiler)
  let ${outputVar}_audio = ${outputVar}.audio || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "speech_to_text") {
        let mediaVar = inputs.get("media") || '""';
        if (!mediaVar.includes(".path") && !mediaVar.startsWith('"')) {
          mediaVar = `(typeof ${mediaVar} === 'object' && (${mediaVar}.path || ${mediaVar}.video || ${mediaVar}.audio) ? (${mediaVar}.path || ${mediaVar}.video || ${mediaVar}.audio) : ${mediaVar})`;
        }
        const startTimeInput = inputs.get("startTime");
        const endTimeInput = inputs.get("endTime");
        const startTime = startTimeInput || "null";
        const endTime = endTimeInput || "null";
        const apiUrl = escapeString(String(data.apiUrl || "http://127.0.0.1:8770/transcribe"));
        const language = escapeString(String(data.language || ""));
        const enableWordTimestamps = data.enableWordTimestamps !== false;
        const enableDiarization = Boolean(data.enableDiarization);
        const minSpeakers = data.minSpeakers != null ? Number(data.minSpeakers) : "null";
        const maxSpeakers = data.maxSpeakers != null ? Number(data.maxSpeakers) : "null";
        const hfTokenConstant = data.hfTokenConstant ? escapeString(String(data.hfTokenConstant)) : "";
        let code = `
  // --- Node: ${node.id} (speech_to_text) ---
  const ${outputVar}_apiUrl = await Audio.resolveServiceUrl("whisperx", "${apiUrl}");
  ${letOrAssign}${outputVar} = await Audio.speechToText(
    ${mediaVar},
    ${outputVar}_apiUrl,
    ${language ? `"${language}"` : "null"},
    ${enableWordTimestamps},
    ${enableDiarization},
    ${minSpeakers},
    ${maxSpeakers},
    ${startTime},
    ${endTime},
    "${node.id}",
    ${hfTokenConstant ? `"${hfTokenConstant}"` : "null"}
  );
  // Create suffixed output variables for multi-output node pattern
  let ${outputVar}_text = ${outputVar}.text || "";
  let ${outputVar}_segments = ${outputVar}.segments || [];
  let ${outputVar}_language = ${outputVar}.language || "unknown";
  let ${outputVar}_duration = ${outputVar}.duration || 0;
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "audio_fade") {
        let videoVar = inputs.get("video") || '""';
        if (!videoVar.includes(".path") && !videoVar.includes(".video") && !videoVar.startsWith('"')) {
          videoVar = `(typeof ${videoVar} === 'object' && (${videoVar}.path || ${videoVar}.video) ? (${videoVar}.path || ${videoVar}.video) : ${videoVar})`;
        }
        const fadeDuration = Number(data.fadeDuration) || 10;
        const fadeType = escapeString(String(data.fadeType || "exponential"));
        const fadeDirection = escapeString(String(data.fadeDirection || "out"));
        const filename = escapeString(String(data.filename || "audio_faded"));
        let code = `
  // --- Node: ${node.id} (audio_fade) ---
  ${letOrAssign}${outputVar} = await Audio.fadeAudio(
    ${videoVar},
    ${fadeDuration},
    "${fadeType}",
    "${fadeDirection}",
    "${filename}",
    "${node.id}"
  );
  // Create suffixed output variables for multi-output node pattern
  let ${outputVar}_video = ${outputVar}.video || ${outputVar};
  let ${outputVar}_path = ${outputVar}.path || ${outputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      return null;
    }
  };
  var compiler_default = CoreAudioCompiler;

  // ../zipp-core/modules/core-audio/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    AudioFadeNode: () => AudioFadeNode_default,
    MusicGenNode: () => MusicGenNode_default,
    SpeechToTextNode: () => SpeechToTextNode_default,
    TextToSpeechNode: () => TextToSpeechNode_default
  });

  // ../zipp-core/modules/core-audio/ui/TextToSpeechNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var TTS_SERVICES = [
    { id: "chatterbox-tts", name: "Chatterbox TTS", port: 8765, endpoint: "/tts" },
    { id: "qwen3-tts", name: "Qwen3 TTS", port: 8772, endpoint: "/tts" },
    { id: "custom", name: "Custom URL", port: 0, endpoint: "" }
  ];
  var TTSIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" }) });
  function TextToSpeechNode({ data }) {
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    const [isPlaying, setIsPlaying] = (0, import_react.useState)(false);
    const audioRef = (0, import_react.useRef)(null);
    (0, import_react.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleChange = (0, import_react.useCallback)((field, value) => {
      data.onChange?.(field, value);
    }, [data]);
    const service = data.service || "chatterbox-tts";
    const selectedService = TTS_SERVICES.find((s) => s.id === service) || TTS_SERVICES[0];
    const isCustom = service === "custom";
    const handleServiceChange = (0, import_react.useCallback)((newService) => {
      handleChange("service", newService);
      const svc = TTS_SERVICES.find((s) => s.id === newService);
      if (svc && svc.id !== "custom") {
        handleChange("apiUrl", `http://127.0.0.1:${svc.port}${svc.endpoint}`);
      }
    }, [handleChange]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-teal-400", children: selectedService.name }) });
    const inputHandles = (0, import_react.useMemo)(() => {
      const handles = [
        { id: "text", type: "target", position: import_react2.Position.Left, color: "!bg-amber-500", size: "lg", label: "text" },
        { id: "descriptionInput", type: "target", position: import_react2.Position.Left, color: "!bg-purple-500", size: "md", label: "desc" },
        { id: "audioPrompt", type: "target", position: import_react2.Position.Left, color: "!bg-teal-500", size: "md", label: "voice" }
      ];
      return handles;
    }, []);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "audio", type: "source", position: import_react2.Position.Right, color: "!bg-teal-500", size: "lg", label: "audio" }
    ], []);
    const handlePlayPause = () => {
      if (!data.audioPath) return;
      if (!audioRef.current) {
        audioRef.current = new Audio(data.audioPath);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Text to Speech",
        color: "teal",
        icon: TTSIcon,
        width: 300,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "TTS Service" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                value: service,
                onChange: (e) => handleServiceChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: TTS_SERVICES.map((svc) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: svc.id, children: svc.name }, svc.id))
              }
            )
          ] }),
          isCustom && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "API URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                placeholder: "http://127.0.0.1:8765/tts",
                value: data.apiUrl || "http://127.0.0.1:8765/tts",
                onChange: (e) => handleChange("apiUrl", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Response Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                value: data.responseFormat || "json",
                onChange: (e) => handleChange("responseFormat", e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "json", children: "JSON (with audio_path)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "pcm16_stream", children: "PCM16 Stream (raw audio)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "audio_file", children: "Audio File (MP3/WAV download)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Voice Description" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 resize-none",
                placeholder: "Natural voice, clear and expressive tone...",
                rows: 2,
                value: data.description || "",
                onChange: (e) => handleChange("description", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Speaker" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                placeholder: "e.g., Vivian, Ryan (for Qwen3-TTS)",
                value: data.speaker || "",
                onChange: (e) => handleChange("speaker", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Language" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                value: data.language || "Auto",
                onChange: (e) => handleChange("language", e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Auto", children: "Auto Detect" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Chinese", children: "Chinese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "English", children: "English" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Japanese", children: "Japanese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Korean", children: "Korean" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "French", children: "French" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "German", children: "German" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Spanish", children: "Spanish" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Italian", children: "Italian" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Portuguese", children: "Portuguese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "Russian", children: "Russian" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-800/30 rounded text-xs text-teal-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4 text-teal-500 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: 'Connect audio to "voice" for cloning' })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                value: data.outputFormat || "wav",
                onChange: (e) => handleChange("outputFormat", e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "wav", children: "WAV (lossless)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "mp3", children: "MP3 (compressed)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                placeholder: "tts_output",
                value: data.filename || "tts_output",
                onChange: (e) => handleChange("filename", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          data.audioPath && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-800/30 rounded", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "button",
              {
                type: "button",
                className: "p-1.5 rounded bg-teal-600 hover:bg-teal-500 transition-colors",
                onClick: handlePlayPause,
                onMouseDown: (e) => e.stopPropagation(),
                children: isPlaying ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4 text-white", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6 4h4v16H6V4zm8 0h4v16h-4V4z" }) }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4 text-white", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 5v14l11-7z" }) })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-xs text-teal-300 truncate flex-1", children: "Audio generated" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-4 h-4 text-teal-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: isCustom ? "Using custom TTS API" : `Using ${selectedService.name}` })
          ] })
        ] })
      }
    );
  }
  var TextToSpeechNode_default = (0, import_react.memo)(TextToSpeechNode);

  // ../zipp-core/modules/core-audio/ui/MusicGenNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var MusicIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" }) });
  function MusicGenNode({ data }) {
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    const [isPlaying, setIsPlaying] = (0, import_react3.useState)(false);
    const audioRef = (0, import_react3.useRef)(null);
    (0, import_react3.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleChange = (0, import_react3.useCallback)((field, value) => {
      data.onChange?.(field, value);
    }, [data]);
    const duration = data.duration ?? 60;
    const service = data.service ?? "ace-step";
    const getDefaultApiUrl = (0, import_react3.useCallback)((svc) => {
      return svc === "heartmula" ? "http://127.0.0.1:8767/generate" : "http://127.0.0.1:8766/generate";
    }, []);
    const handleServiceChange = (0, import_react3.useCallback)((newService) => {
      handleChange("service", newService);
      handleChange("apiUrl", getDefaultApiUrl(newService));
    }, [handleChange, getDefaultApiUrl]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-purple-400", children: [
        duration,
        "s"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-1 text-slate-500", children: service === "heartmula" ? "HM" : "ACE" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-1 truncate", children: [
        data.prompt?.substring(0, 12) || "music",
        "..."
      ] })
    ] });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "prompt", type: "target", position: import_react4.Position.Left, color: "!bg-amber-500", size: "lg", label: "prompt" },
      { id: "lyrics", type: "target", position: import_react4.Position.Left, color: "!bg-pink-500", size: "md", label: "lyrics" },
      { id: "duration", type: "target", position: import_react4.Position.Left, color: "!bg-green-500", size: "sm", label: "duration" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "audio", type: "source", position: import_react4.Position.Right, color: "!bg-purple-500", size: "lg", label: "audio" },
      { id: "path", type: "source", position: import_react4.Position.Right, color: "!bg-slate-400", size: "sm", label: "path" }
    ], []);
    const handlePlayPause = () => {
      if (!data.audioPath) return;
      if (!audioRef.current) {
        audioRef.current = new Audio(data.audioPath);
        audioRef.current.onended = () => setIsPlaying(false);
      }
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    };
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Music Gen",
        color: "purple",
        icon: MusicIcon,
        width: 320,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Music Service" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: service,
                onChange: (e) => handleServiceChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "ace-step", children: "ACE-Step (Pop/EDM)" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: "heartmula", children: "HeartMuLa (Vocal/Lyrics)" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "API URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: getDefaultApiUrl(service),
                value: data.apiUrl || getDefaultApiUrl(service),
                onChange: (e) => handleChange("apiUrl", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Prompt (style tags)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 resize-none",
                placeholder: "pop, energetic, catchy melody, female vocal...",
                rows: 2,
                value: data.prompt || "",
                onChange: (e) => handleChange("prompt", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Lyrics (optional)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 resize-none",
                placeholder: "[verse]\nYour lyrics here...\n[chorus]\nCatchy chorus...",
                rows: 3,
                value: data.lyrics || "",
                onChange: (e) => handleChange("lyrics", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Duration" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-xs text-purple-400", children: [
                duration,
                "s"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "range",
                min: "10",
                max: "240",
                step: "5",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500",
                value: duration,
                onChange: (e) => handleChange("duration", parseInt(e.target.value)),
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex justify-between text-[10px] text-slate-500 mt-0.5", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "10s" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "4 min" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                placeholder: "music_output",
                value: data.filename || "music_output",
                onChange: (e) => handleChange("filename", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          data.audioPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-purple-900/20 border border-purple-800/30 rounded", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "button",
              {
                type: "button",
                className: "p-1.5 rounded bg-purple-600 hover:bg-purple-500 transition-colors",
                onClick: handlePlayPause,
                onMouseDown: (e) => e.stopPropagation(),
                children: isPlaying ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-4 h-4 text-white", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M6 4h4v16H6V4zm8 0h4v16h-4V4z" }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-4 h-4 text-white", fill: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M8 5v14l11-7z" }) })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-xs text-purple-300 truncate flex-1", children: "Music generated" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-4 h-4 text-purple-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: service === "heartmula" ? "HeartMuLa: FP8 quantized, great for vocals" : "ACE-Step: Full precision, great for EDM/pop" })
          ] })
        ] })
      }
    );
  }
  var MusicGenNode_default = (0, import_react3.memo)(MusicGenNode);

  // ../zipp-core/modules/core-audio/ui/SpeechToTextNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var STTIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) });
  function SpeechToTextNode({ data }) {
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleChange = (0, import_react5.useCallback)((field, value) => {
      data.onChange?.(field, value);
    }, [data]);
    const enableDiarization = data.enableDiarization ?? false;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-violet-400", children: data.language || "auto-detect" }),
      data.detectedLanguage && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "ml-1 text-emerald-400", children: [
        "(",
        data.detectedLanguage,
        ")"
      ] })
    ] });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "media", type: "target", position: import_react6.Position.Left, color: "!bg-teal-500", size: "lg", label: "media" },
      { id: "startTime", type: "target", position: import_react6.Position.Left, color: "!bg-amber-500", size: "md", label: "start" },
      { id: "endTime", type: "target", position: import_react6.Position.Left, color: "!bg-amber-500", size: "md", label: "end" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "text", type: "source", position: import_react6.Position.Right, color: "!bg-amber-500", size: "lg", label: "text" },
      { id: "segments", type: "source", position: import_react6.Position.Right, color: "!bg-blue-500", size: "md", label: "segments" },
      { id: "language", type: "source", position: import_react6.Position.Right, color: "!bg-purple-500", size: "sm", label: "lang" },
      { id: "duration", type: "source", position: import_react6.Position.Right, color: "!bg-green-500", size: "sm", label: "duration" }
    ], []);
    const formatDuration = (seconds) => {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs.toString().padStart(2, "0")}`;
    };
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Speech to Text",
        color: "violet",
        icon: STTIcon,
        width: 300,
        collapsedWidth: 150,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "API URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                placeholder: "http://127.0.0.1:8770/transcribe",
                value: data.apiUrl || "http://127.0.0.1:8770/transcribe",
                onChange: (e) => handleChange("apiUrl", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Language" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                value: data.language || "",
                onChange: (e) => handleChange("language", e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "", children: "Auto-detect" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "en", children: "English" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "es", children: "Spanish" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "fr", children: "French" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "de", children: "German" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "it", children: "Italian" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "pt", children: "Portuguese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "nl", children: "Dutch" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ru", children: "Russian" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "zh", children: "Chinese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ja", children: "Japanese" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ko", children: "Korean" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "ar", children: "Arabic" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: "hi", children: "Hindi" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Word Timestamps" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: `nodrag relative w-10 h-5 rounded-full transition-colors ${data.enableWordTimestamps !== false ? "bg-violet-600" : "bg-slate-600"}`,
                onClick: () => handleChange("enableWordTimestamps", data.enableWordTimestamps === false),
                onMouseDown: (e) => e.stopPropagation(),
                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "span",
                  {
                    className: `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${data.enableWordTimestamps !== false ? "left-5" : "left-0.5"}`
                  }
                )
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Speaker Diarization" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: `nodrag relative w-10 h-5 rounded-full transition-colors ${enableDiarization ? "bg-violet-600" : "bg-slate-600"}`,
                onClick: () => handleChange("enableDiarization", !enableDiarization),
                onMouseDown: (e) => e.stopPropagation(),
                children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "span",
                  {
                    className: `absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enableDiarization ? "left-5" : "left-0.5"}`
                  }
                )
              }
            )
          ] }),
          enableDiarization && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Min Speakers" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "number",
                  min: "1",
                  max: "20",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                  placeholder: "Auto",
                  value: data.minSpeakers ?? "",
                  onChange: (e) => handleChange("minSpeakers", e.target.value ? parseInt(e.target.value) : null),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Max Speakers" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "number",
                  min: "1",
                  max: "20",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                  placeholder: "Auto",
                  value: data.maxSpeakers ?? "",
                  onChange: (e) => handleChange("maxSpeakers", e.target.value ? parseInt(e.target.value) : null),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          enableDiarization && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-amber-900/20 border border-amber-800/30 rounded text-xs text-amber-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-4 h-4 text-amber-500 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "Requires HF_TOKEN in service config" })
          ] }),
          data.transcriptText && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between text-xs", children: [
              data.duration !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "text-slate-400", children: [
                "Duration: ",
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-violet-400", children: formatDuration(data.duration) })
              ] }),
              data.detectedLanguage && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "text-slate-400", children: [
                "Language: ",
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-emerald-400", children: data.detectedLanguage })
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "bg-slate-100/50 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-700 rounded p-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-xs text-slate-400 mb-1", children: "Transcript Preview:" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-xs text-slate-700 dark:text-slate-300 max-h-24 overflow-y-auto", children: [
                data.transcriptText.substring(0, 200),
                data.transcriptText.length > 200 && "..."
              ] })
            ] }),
            data.segments && data.segments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-xs text-slate-400", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-blue-400", children: data.segments.length }),
              " segments detected"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-4 h-4 text-violet-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "Uses WhisperX for accurate transcription" })
          ] })
        ] })
      }
    );
  }
  var SpeechToTextNode_default = (0, import_react5.memo)(SpeechToTextNode);

  // ../zipp-core/modules/core-audio/ui/AudioFadeNode.tsx
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react2(), 1);
  var import_zipp_ui_components4 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var FadeIcon = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.414a5 5 0 001.414 1.414M3.757 17.243a9 9 0 010-12.728" }) });
  function AudioFadeNode({ data }) {
    const onCollapsedChangeRef = (0, import_react7.useRef)(data.onCollapsedChange);
    (0, import_react7.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react7.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleChange = (0, import_react7.useCallback)((field, value) => {
      data.onChange?.(field, value);
    }, [data]);
    const fadeDuration = data.fadeDuration ?? 10;
    const fadeType = data.fadeType ?? "exponential";
    const fadeDirection = data.fadeDirection ?? "out";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "text-pink-400", children: [
        fadeDuration,
        "s"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mx-0.5", children: "|" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-400", children: fadeType === "exponential" ? "exp" : "lin" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "mx-0.5", children: "|" }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-blue-400", children: fadeDirection })
    ] });
    const inputHandles = (0, import_react7.useMemo)(() => [
      { id: "video", type: "target", position: import_react8.Position.Left, color: "!bg-orange-500", size: "lg", label: "video" }
    ], []);
    const outputHandles = (0, import_react7.useMemo)(() => [
      { id: "video", type: "source", position: import_react8.Position.Right, color: "!bg-orange-500", size: "lg", label: "video" },
      { id: "path", type: "source", position: import_react8.Position.Right, color: "!bg-slate-400", size: "sm", label: "path" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_zipp_ui_components4.CollapsibleNodeWrapper,
      {
        title: "Audio Fade",
        color: "pink",
        icon: FadeIcon,
        width: 280,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Fade Direction" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${fadeDirection === "out" ? "bg-pink-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("fadeDirection", "out"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Fade Out"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${fadeDirection === "in" ? "bg-blue-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("fadeDirection", "in"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Fade In"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Fade Curve" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${fadeType === "exponential" ? "bg-purple-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("fadeType", "exponential"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Exponential"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${fadeType === "linear" ? "bg-cyan-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  onClick: () => handleChange("fadeType", "linear"),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: "Linear"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex justify-between items-center mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Fade Duration" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "text-xs text-pink-400", children: [
                fadeDuration,
                "s"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "range",
                min: "1",
                max: "30",
                step: "1",
                className: "nodrag nowheel w-full h-2 bg-slate-300 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-pink-500",
                value: fadeDuration,
                onChange: (e) => handleChange("fadeDuration", parseInt(e.target.value)),
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex justify-between text-[10px] text-slate-500 mt-0.5", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "1s" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "30s" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filename" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-pink-500",
                placeholder: "audio_faded",
                value: data.filename || "audio_faded",
                onChange: (e) => handleChange("filename", e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-slate-100/50 dark:bg-slate-900/50 rounded text-xs text-slate-600 dark:text-slate-400", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-4 h-4 text-pink-500", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "Applies audio fade to video" })
          ] })
        ] })
      }
    );
  }
  var AudioFadeNode_default = (0, import_react7.memo)(AudioFadeNode);

  // ../zipp-core/modules/core-audio/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
