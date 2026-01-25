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

  // ../zipp-core/modules/core-browser/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-browser/runtime.ts
  var ctx;
  async function ensureServiceReadyByPort(port) {
    if (!ctx.tauri) return null;
    try {
      ctx.log("info", `[Browser] Ensuring service on port ${port} is ready...`);
      const result = await ctx.tauri.invoke("ensure_service_ready_by_port", {
        port
      });
      if (result.success && result.port) {
        const url = `http://127.0.0.1:${result.port}`;
        if (!result.already_running) {
          ctx.log("info", `[Browser] Service on port ${port} auto-started at ${url}`);
        } else {
          ctx.log("info", `[Browser] Service on port ${port} already running at ${url}`);
        }
        return url;
      } else if (result.error) {
        ctx.log("warn", `[Browser] Service on port ${port} failed to start: ${result.error}`);
      }
    } catch {
      ctx.log("info", `[Browser] Dynamic service lookup not available`);
    }
    return null;
  }
  var MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;
  var MAX_RESPONSE_BODY_SIZE = 50 * 1024 * 1024;
  var MAX_URL_LENGTH = 8192;
  function validateUrl(url) {
    if (!url || typeof url !== "string") {
      throw new Error("URL is required");
    }
    if (url.length > MAX_URL_LENGTH) {
      throw new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters`);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
    }
    if (url.toLowerCase().includes("javascript:")) {
      throw new Error("JavaScript URLs are not allowed");
    }
  }
  function validateRequestBody(body) {
    if (body && body.length > MAX_REQUEST_BODY_SIZE) {
      throw new Error(`Request body exceeds maximum size of ${MAX_REQUEST_BODY_SIZE / 1024 / 1024} MB`);
    }
  }
  function limitResponseSize(body) {
    if (body.length > MAX_RESPONSE_BODY_SIZE) {
      return {
        body: body.substring(0, MAX_RESPONSE_BODY_SIZE),
        truncated: true
      };
    }
    return { body, truncated: false };
  }
  var sessions = /* @__PURE__ */ new Map();
  async function createSession(_profile, mode, customUserAgent, customHeaders, initialCookies, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Browser] Creating session (${mode} mode)`);
    let headers = {};
    if (customHeaders) {
      try {
        headers = JSON.parse(customHeaders);
      } catch {
        ctx.log("warn", "[Browser] Invalid custom headers JSON");
      }
    }
    let cookies = {};
    if (initialCookies) {
      try {
        cookies = JSON.parse(initialCookies);
      } catch {
        ctx.log("warn", "[Browser] Invalid cookies JSON");
      }
    }
    if ((mode === "webview" || mode === "headless") && ctx.tauri) {
      try {
        const result = await ctx.tauri.invoke("plugin:zipp-browser|webview_create", {
          config: {
            profile: _profile || "default",
            custom_user_agent: customUserAgent || void 0,
            viewport_width: 1280,
            viewport_height: 800,
            cookies,
            headers
          }
        });
        if (!result.success || !result.session_id) {
          throw new Error(result.error || "Failed to create webview session");
        }
        const session2 = {
          id: result.session_id,
          mode,
          cookies,
          headers,
          userAgent: customUserAgent
        };
        sessions.set(session2.id, session2);
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[Browser] Native session created: ${session2.id}`);
        return session2;
      } catch (error) {
        ctx.log("warn", `[Browser] Native session failed, falling back to HTTP mode: ${error}`);
      }
    }
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const session = {
      id: sessionId,
      mode: "http",
      // Force HTTP mode since native session failed or wasn't requested
      cookies,
      headers,
      userAgent: customUserAgent
    };
    sessions.set(sessionId, session);
    ctx.onNodeStatus?.(nodeId, "completed");
    ctx.log("success", `[Browser] Session created: ${sessionId}`);
    return session;
  }
  function updateSessionCookies(session, headers) {
    const setCookieHeader = headers["set-cookie"] || headers["Set-Cookie"];
    if (!setCookieHeader) return;
    if (!session.cookies) {
      session.cookies = {};
    }
    const cookieStrings = setCookieHeader.split(/[,\n]/).map((s) => s.trim()).filter((s) => s);
    for (const cookieStr of cookieStrings) {
      const parts = cookieStr.split(";");
      if (parts.length === 0) continue;
      const nameValue = parts[0].trim();
      const eqIndex = nameValue.indexOf("=");
      if (eqIndex === -1) continue;
      const name = nameValue.substring(0, eqIndex).trim();
      const value = nameValue.substring(eqIndex + 1).trim();
      if (!name || name.toLowerCase() === "path" || name.toLowerCase() === "domain" || name.toLowerCase() === "expires" || name.toLowerCase() === "max-age" || name.toLowerCase() === "secure" || name.toLowerCase() === "httponly" || name.toLowerCase() === "samesite") {
        continue;
      }
      session.cookies[name] = value;
      ctx.log("info", `[Browser] Cookie set: ${name}`);
    }
    sessions.set(session.id, session);
  }
  async function request(url, method, headersJson, body, sessionId, nodeId, allowLocalNetwork = false) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Browser] Aborted by user before request");
      throw new Error("Operation aborted by user");
    }
    validateUrl(url);
    validateRequestBody(body);
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Browser] ${method} request to ${url}${allowLocalNetwork ? " (local network allowed)" : ""}`);
    const session = sessionId ? sessions.get(sessionId) : void 0;
    let headers = {
      "Content-Type": "application/json"
    };
    if (session?.headers) {
      headers = { ...headers, ...session.headers };
    }
    if (session?.cookies && Object.keys(session.cookies).length > 0) {
      const cookieStr = Object.entries(session.cookies).map(([k, v]) => `${k}=${v}`).join("; ");
      headers["Cookie"] = cookieStr;
      ctx.log("info", `[Browser] Sending cookies (${Object.keys(session.cookies).length} cookies)`);
    }
    if (headersJson) {
      try {
        const customHeaders = JSON.parse(headersJson);
        headers = { ...headers, ...customHeaders };
      } catch {
        ctx.log("warn", "[Browser] Invalid headers JSON");
      }
    }
    try {
      if (ctx.tauri) {
        const result = await ctx.tauri.invoke("http_request", {
          request: {
            url,
            method,
            headers,
            body: body || null,
            follow_redirects: true,
            max_redirects: 10,
            allow_private_networks: allowLocalNetwork
          }
        });
        if (session && result.headers) {
          updateSessionCookies(session, result.headers);
        }
        if (session) {
          session.currentUrl = result.url || url;
        }
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[Browser] Response: ${result.status}`);
        let responseBody2 = result.body;
        if (result.bodyIsBase64) {
          const contentType = result.headers["content-type"] || result.headers["Content-Type"] || "application/octet-stream";
          responseBody2 = `data:${contentType};base64,${result.body}`;
          ctx.log("info", `[Browser] Binary response converted to Data URL (${contentType})`);
        }
        const limited2 = limitResponseSize(responseBody2);
        if (limited2.truncated) {
          ctx.log("warn", `[Browser] Response truncated to ${MAX_RESPONSE_BODY_SIZE / 1024 / 1024} MB`);
        }
        return {
          status: result.status,
          headers: result.headers,
          body: limited2.body
        };
      }
      const response = await ctx.fetch(url, {
        method,
        headers,
        body: body || void 0
      });
      const responseBody = await response.text();
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      if (session) {
        updateSessionCookies(session, responseHeaders);
      }
      const limited = limitResponseSize(responseBody);
      if (limited.truncated) {
        ctx.log("warn", `[Browser] Response truncated to ${MAX_RESPONSE_BODY_SIZE / 1024 / 1024} MB`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Browser] Response: ${response.status}`);
      return {
        status: response.status,
        headers: responseHeaders,
        body: limited.body
      };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Browser] Request failed: ${errMsg}`);
      throw error;
    }
  }
  function extract(content, extractType, pattern, attribute) {
    ctx.log("info", `[Browser] Extracting with ${extractType}: ${pattern}`);
    if (extractType === "jsonpath") {
      try {
        const data = JSON.parse(content);
        const pathParts = pattern.replace(/^\$\.?/, "").match(/([^[.\]]+|\[\d+\])/g) || [];
        let result = data;
        for (const part of pathParts) {
          if (result === null || result === void 0) break;
          if (part.startsWith("[") && part.endsWith("]")) {
            const index = parseInt(part.slice(1, -1), 10);
            if (Array.isArray(result)) {
              result = result[index];
            } else {
              result = void 0;
            }
          } else {
            const key = part;
            if (Array.isArray(result)) {
              const index = parseInt(key, 10);
              if (!isNaN(index)) {
                result = result[index];
              } else if (key === "*") {
              } else {
                result = result.map((item) => item ? item[key] : void 0);
              }
            } else if (typeof result === "object") {
              result = result[key];
            }
          }
        }
        if (Array.isArray(result)) {
          return result.map(String);
        }
        return String(result);
      } catch {
        ctx.log("error", "[Browser] Invalid JSON for JSONPath extraction");
        return "";
      }
    }
    if (extractType === "regex") {
      const MAX_PATTERN_LENGTH = 500;
      const MAX_RESULTS = 1e4;
      const MAX_ITERATIONS = 1e5;
      if (!pattern) {
        ctx.log("error", "[Browser] Empty regex pattern");
        return [];
      }
      if (pattern.length > MAX_PATTERN_LENGTH) {
        ctx.log("error", `[Browser] Regex pattern too long (max ${MAX_PATTERN_LENGTH} chars)`);
        return [];
      }
      try {
        const regex = new RegExp(pattern, "g");
        const results = [];
        let match;
        let iterations = 0;
        while ((match = regex.exec(content)) !== null) {
          iterations++;
          if (iterations > MAX_ITERATIONS) {
            ctx.log("warn", "[Browser] Regex extraction exceeded iteration limit");
            break;
          }
          if (match.length > 1) {
            results.push(match[1]);
          } else {
            results.push(match[0]);
          }
          if (results.length >= MAX_RESULTS) {
            ctx.log("warn", "[Browser] Regex extraction reached result limit");
            break;
          }
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
        if (results.length === 1) {
          return results[0];
        }
        return results;
      } catch {
        ctx.log("error", "[Browser] Invalid regex pattern");
        return [];
      }
    }
    if (extractType === "selector" || extractType === "css_selector") {
      if (!pattern) {
        ctx.log("error", "[Browser] Empty CSS selector pattern");
        return [];
      }
      if (typeof DOMParser !== "undefined") {
        try {
          const parser = new DOMParser();
          const doc = parser.parseFromString(content, "text/html");
          ctx.log("info", `[Browser] Extracting with selector: ${pattern}`);
          const elements = doc.querySelectorAll(pattern);
          const results = [];
          elements.forEach((el) => {
            if (attribute === "text") {
              results.push(el.textContent || "");
            } else if (attribute === "html") {
              results.push(el.innerHTML);
            } else {
              results.push(el.getAttribute(attribute) || "");
            }
          });
          return results.length === 1 ? results[0] : results;
        } catch {
          ctx.log("error", "[Browser] Invalid CSS selector");
          return [];
        }
      }
    }
    return "";
  }
  async function control(sessionParam, action, target, value, timeout, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Browser] Aborted by user before control action");
      throw new Error("Operation aborted by user");
    }
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Browser] Control action: ${action} on ${target}`);
    const session = sessions.get(sessionParam.id) || sessionParam;
    if (session.mode === "http") {
      if (action === "goto" && target) {
        const response = await ctx.fetch(target);
        const body = await response.text();
        ctx.onNodeStatus?.(nodeId, "completed");
        return body;
      }
      ctx.onNodeStatus?.(nodeId, "error");
      ctx.log("error", `[Browser] HTTP mode only supports 'goto' action. For '${action}', use WebView or Headless mode.`);
      throw new Error(`HTTP mode only supports 'goto' action. The '${action}' action requires WebView or Headless mode with the native browser plugin enabled.`);
    }
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for browser control");
    }
    try {
      let result;
      if (action === "goto") {
        const navResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_navigate", {
          sessionId: session.id,
          url: target,
          waitFor: null,
          timeoutMs: timeout
        });
        if (!navResult.success) {
          throw new Error(navResult.error || "Navigation failed");
        }
        const htmlResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_action", {
          sessionId: session.id,
          action: "get_html",
          selector: null,
          value: null
        });
        result = {
          success: htmlResult.success,
          data: htmlResult.data,
          error: htmlResult.error
        };
      } else if (action === "screenshot") {
        const screenshotResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_screenshot", {
          sessionId: session.id
        });
        result = {
          success: screenshotResult.success,
          screenshotData: screenshotResult.data,
          error: screenshotResult.error
        };
      } else if (action === "click" || action === "type" || action === "scroll") {
        if (session.currentUrl) {
          ctx.log("info", `[Browser] Auto-navigating webview to ${session.currentUrl}`);
          const navResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_navigate", {
            sessionId: session.id,
            url: session.currentUrl,
            waitFor: null,
            timeoutMs: timeout
          });
          if (!navResult.success) {
            ctx.log("warn", `[Browser] Auto-navigation failed: ${navResult.error}`);
          }
          session.currentUrl = void 0;
        }
        const actionResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_action", {
          sessionId: session.id,
          action,
          selector: target || null,
          value: value || null
        });
        result = {
          success: actionResult.success,
          data: actionResult.data,
          error: actionResult.error
        };
      } else if (action === "get_html") {
        if (session.currentUrl) {
          ctx.log("info", `[Browser] Auto-navigating webview to ${session.currentUrl} (before get_html)`);
          const navResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_navigate", {
            sessionId: session.id,
            url: session.currentUrl,
            waitFor: null,
            timeoutMs: timeout
          });
          if (!navResult.success) {
            ctx.log("warn", `[Browser] Auto-navigation failed: ${navResult.error}`);
          }
          session.currentUrl = void 0;
        }
        const htmlResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_action", {
          sessionId: session.id,
          action: "get_html",
          selector: null,
          value: null
        });
        result = {
          success: htmlResult.success,
          data: htmlResult.data,
          error: htmlResult.error
        };
      } else if (action === "evaluate") {
        const evalResult = await ctx.tauri.invoke("plugin:zipp-browser|webview_evaluate", {
          sessionId: session.id,
          script: target
          // Script is passed in target parameter
        });
        result = {
          success: evalResult.success,
          data: evalResult.data,
          error: evalResult.error
        };
      } else {
        throw new Error(`Unknown browser action: ${action}`);
      }
      if (!result.success) {
        throw new Error(result.error || `Action '${action}' failed`);
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      if (result.screenshotData) {
        return result.screenshotData;
      }
      return result.data || "";
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Browser] Control failed: ${errMsg}`);
      throw error;
    }
  }
  async function closeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if ((session.mode === "webview" || session.mode === "headless") && ctx.tauri) {
      try {
        await ctx.tauri.invoke("plugin:zipp-browser|webview_close", { sessionId });
      } catch (err) {
        ctx.log("warn", `[Browser] Close session warning: ${err}`);
      }
    }
    sessions.delete(sessionId);
    ctx.log("info", `[Browser] Session closed: ${sessionId}`);
  }
  var CoreBrowserRuntime = {
    name: "Browser",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Browser] Module initialized");
    },
    methods: {
      createSession,
      request,
      extract,
      control,
      closeSession,
      ensureServiceReadyByPort
    },
    async cleanup() {
      for (const sessionId of sessions.keys()) {
        await closeSession(sessionId);
      }
      ctx?.log?.("info", "[Browser] Module cleanup");
    }
  };
  var runtime_default = CoreBrowserRuntime;

  // ../zipp-core/modules/core-browser/compiler.ts
  var CoreBrowserCompiler = {
    name: "Browser",
    getNodeTypes() {
      return ["browser_session", "browser_request", "browser_extract", "browser_control"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString, debugEnabled } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const debug = debugEnabled ?? false;
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("content") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "browser_session": {
          const profile = escapeString(String(data.profile || data.browserProfile || "default"));
          const sessionMode = String(data.sessionMode || "webview");
          if (debug) {
            console.log(`[Browser Compiler] browser_session node ${node.id}: sessionMode="${sessionMode}", data.sessionMode="${data.sessionMode}", playwrightUrl="${data.playwrightUrl}"`);
          }
          const userAgent = escapeString(String(data.userAgent || data.customUserAgent || ""));
          const customHeaders = escapeString(String(data.customHeaders || data.headers || "{}"));
          const initialCookies = escapeString(String(data.initialCookies || data.cookies || "{}"));
          const playwrightUrl = escapeString(String(data.playwrightUrl || "http://127.0.0.1:8769"));
          if (sessionMode === "playwright") {
            const customUserAgent = escapeString(String(data.customUserAgent || ""));
            const portMatch = playwrightUrl.match(/:(\d+)/);
            const playwrightPort = portMatch ? portMatch[1] : "8769";
            code += `
  // Browser session: Playwright mode
  // Determine Playwright service URL (auto-start if needed, then get port)
  let _playwright_url_${sanitizedId} = "${playwrightUrl}";
  // Using dynamic service lifecycle management (auto-start by port)
  let _dynamic_url_${sanitizedId} = await Browser.ensureServiceReadyByPort(${playwrightPort});
  if (_dynamic_url_${sanitizedId}) {
    _playwright_url_${sanitizedId} = _dynamic_url_${sanitizedId};
    console.log("[Browser] (${node.id}) Playwright service ready at: " + _playwright_url_${sanitizedId});
  } else {
    console.log("[Browser] (${node.id}) Playwright service not available, using default: " + _playwright_url_${sanitizedId});
  }

  console.log("[Browser] (${node.id}) sessionMode=playwright, creating Playwright session...");
  let _playwright_response_${sanitizedId} = null;
  try {
    _playwright_response_${sanitizedId} = await Utility.httpRequest(
      _playwright_url_${sanitizedId} + "/session/create",
      "POST",
      { "Content-Type": "application/json" },
      JSON.stringify({
        user_agent: "${customUserAgent}" || null,
        viewport_width: 1920,
        viewport_height: 1080
      })
    );
  } catch (_pw_err_${sanitizedId}) {
    console.log("[Browser] (${node.id}) Playwright service error: " + _pw_err_${sanitizedId});
  }

  ${letOrAssign}${outputVar} = null;
  let _playwright_failed_${sanitizedId} = false;
  if (_playwright_response_${sanitizedId} && _playwright_response_${sanitizedId}.body) {
    let _pw_body_${sanitizedId} = _playwright_response_${sanitizedId}.body;
    if (typeof _pw_body_${sanitizedId} === "string") {
      try {
        _pw_body_${sanitizedId} = JSON.parse(_pw_body_${sanitizedId});
      } catch (_e_${sanitizedId}) {}
    }
    if (_pw_body_${sanitizedId}.success && _pw_body_${sanitizedId}.session_id) {
      ${outputVar} = {
        id: _pw_body_${sanitizedId}.session_id,
        mode: "playwright",
        serviceUrl: _playwright_url_${sanitizedId}
      };
      console.log("[Browser] (${node.id}) Playwright session created: " + ${outputVar}.id);
    } else {
      console.log("[Browser] (${node.id}) Playwright session creation failed: " + (_pw_body_${sanitizedId}.message || "unknown error"));
      _playwright_failed_${sanitizedId} = true;
    }
  } else {
    console.log("[Browser] (${node.id}) Could not connect to Playwright service at " + _playwright_url_${sanitizedId} + ". Falling back to WebView mode.");
    _playwright_failed_${sanitizedId} = true;
  }

  // Fallback to WebView mode if Playwright failed
  if (_playwright_failed_${sanitizedId} && !${outputVar}) {
    console.log("[Browser] (${node.id}) Falling back to WebView session...");
    ${outputVar} = await Browser.createSession(
      "${profile}",
      "webview",
      "${userAgent}",
      "${customHeaders}",
      "${initialCookies}",
      "${node.id}"
    );
    if (${outputVar} === "__ABORT__") {
      console.log("[Workflow] Aborted");
      return workflow_context;
    }
    if (${outputVar} && typeof ${outputVar} === "object") {
      ${outputVar}.mode = "webview";
      console.log("[Browser] (${node.id}) WebView fallback session created: " + ${outputVar}.id);
    } else {
      console.log("[Browser] (${node.id}) WebView fallback also failed");
    }
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          } else {
            code += `
  // Browser session: WebView mode
  console.log("[Browser] (${node.id}) sessionMode=webview, creating WebView session...");
  ${letOrAssign}${outputVar} = await Browser.createSession(
    "${profile}",
    "webview",
    "${userAgent}",
    "${customHeaders}",
    "${initialCookies}",
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }
  // Add mode to session object
  if (${outputVar} && typeof ${outputVar} === "object") {
    ${outputVar}.mode = "webview";
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        case "browser_request": {
          const urlInput = inputs.get("url");
          const staticUrl = escapeString(String(data.url || ""));
          const method = escapeString(String(data.method || "GET"));
          const headers = escapeString(String(data.headers || "{}"));
          const staticBody = escapeString(String(data.body || ""));
          const allowLocalNetwork = data.allowLocalNetwork === true;
          const bodyInput = inputs.get("body");
          const sessionInput = inputs.get("session");
          const sessionVar = sessionInput || "null";
          const urlExpr = urlInput ? urlInput : `"${staticUrl}"`;
          const bodyExpr = bodyInput ? bodyInput : `"${staticBody}"`;
          code += `
  let _session_id_${sanitizedId} = ${sessionVar} ? ${sessionVar}.id : null;
  let _url_${sanitizedId} = ${urlExpr};
  let _body_${sanitizedId} = ${bodyExpr};
  // Apply template substitution to headers (allows {{API_KEY}} etc.)
  let _headers_raw_${sanitizedId} = "${headers}";
  let _headers_${sanitizedId} = _headers_raw_${sanitizedId};
  if (_headers_raw_${sanitizedId}.indexOf("{{") >= 0) {
    _headers_${sanitizedId} = Utility.template(_headers_raw_${sanitizedId}, workflow_context);
  }
  ${letOrAssign}${outputVar} = await Browser.request(
    _url_${sanitizedId},
    "${method}",
    _headers_${sanitizedId},
    _body_${sanitizedId},
    _session_id_${sanitizedId},
    "${node.id}",
    ${allowLocalNetwork}
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }
  ${letOrAssign}${outputVar}_session = ${sessionVar};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "browser_extract": {
          const extractType = escapeString(String(data.type || data.extractType || data.extractionType || "selector"));
          const pattern = escapeString(String(data.pattern || data.selector || ""));
          const attribute = escapeString(String(data.attribute || data.extractTarget || "text"));
          const maxLength = Number(data.maxLength) || 0;
          const contentVar = inputVar;
          code += `
  let _content_${sanitizedId} = ${contentVar};
  // FormLogic typeof returns 'hash' for objects, not 'object'
  if ((typeof _content_${sanitizedId} === 'object' || typeof _content_${sanitizedId} === 'hash') && _content_${sanitizedId}.body) {
    _content_${sanitizedId} = _content_${sanitizedId}.body;
  }
  ${letOrAssign}${outputVar} = Browser.extract(
    String(_content_${sanitizedId}),
    "${extractType}",
    "${pattern}",
    "${attribute}"
  );
  // Apply maxLength truncation if specified
  ${maxLength > 0 ? `
  if (typeof ${outputVar} === 'string' && ${outputVar}.length > ${maxLength}) {
    ${outputVar} = ${outputVar}.substring(0, ${maxLength}) + "... [truncated]";
    console.log("[Browser] Extracted text truncated to ${maxLength} chars");
  }` : ""}
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "browser_control": {
          const staticAction = escapeString(String(data.action || ""));
          const staticTarget = escapeString(String(data.target || data.selector || ""));
          const staticValue = escapeString(String(data.value || ""));
          const timeout = Number(data.timeout) || 3e4;
          const takeScreenshot = data.takeScreenshot === true;
          const sessionInput = inputs.get("session");
          const sessionVar = sessionInput || "null";
          const selectorInput = inputs.get("selector");
          const valueInput = inputs.get("value");
          const actionInput = inputs.get("action");
          if (actionInput) {
            code += `
  // Browser control: dynamic from AI
  console.log("[Browser] (${node.id}) === Browser Control Start ===");
  let _session_${sanitizedId} = ${sessionVar};
  console.log("[Browser] (${node.id}) session: " + (_session_${sanitizedId} ? "valid" : "null"));
  let _action_input_raw_${sanitizedId} = ${actionInput};
  // Ensure input is a string (FormLogic may pass unexpected types)
  let _action_input_${sanitizedId} = "";
  if (typeof _action_input_raw_${sanitizedId} === 'string') {
    _action_input_${sanitizedId} = _action_input_raw_${sanitizedId};
  } else if (_action_input_raw_${sanitizedId} !== null && typeof _action_input_raw_${sanitizedId} !== 'undefined') {
    _action_input_${sanitizedId} = String(_action_input_raw_${sanitizedId});
  }
  console.log("[Browser] received action input type=" + (typeof _action_input_raw_${sanitizedId}) + ", length=" + _action_input_${sanitizedId}.length);
  let _action_${sanitizedId} = "done";
  let _selector_${sanitizedId} = "";
  let _reason_${sanitizedId} = "";
  let _parsed_ok_${sanitizedId} = false;

  // Parse AI output (JSON format: {action, selector, reason})
  // Robust parsing that handles:
  // - Markdown code blocks: \`\`\`json { ... } \`\`\`
  // - Conversational text: "Here is the action: { ... }"
  // - Nested objects
  if (_action_input_${sanitizedId}.length > 0) {
    let _json_str_${sanitizedId} = "";

    // Step 1: Try to extract from markdown code block first
    let _code_block_regex_${sanitizedId} = new RegExp("\`\`\`(?:json)?\\\\s*([\\\\s\\\\S]*?)\`\`\`");
    let _code_match_${sanitizedId} = _action_input_${sanitizedId}.match(_code_block_regex_${sanitizedId});
    if (_code_match_${sanitizedId} && _code_match_${sanitizedId}[1]) {
      _json_str_${sanitizedId} = _code_match_${sanitizedId}[1].trim();
    }

    // Step 2: If no code block, use regex to find JSON object
    if (!_json_str_${sanitizedId}) {
      let _json_regex_${sanitizedId} = new RegExp("\\\\{[\\\\s\\\\S]*\\\\}");
      let _json_match_${sanitizedId} = _action_input_${sanitizedId}.match(_json_regex_${sanitizedId});
      if (_json_match_${sanitizedId}) {
        _json_str_${sanitizedId} = _json_match_${sanitizedId}[0];
      }
    }

    // Step 3: Try to parse the extracted JSON
    if (_json_str_${sanitizedId}) {
      try {
        let _parsed_${sanitizedId} = JSON.parse(_json_str_${sanitizedId});
        // FormLogic returns ErrorObject on parse failure - check if result is valid
        let _parsed_str_${sanitizedId} = String(_parsed_${sanitizedId});
        if (_parsed_str_${sanitizedId}.indexOf("ERROR:") !== 0 && _parsed_${sanitizedId} !== null) {
          _action_${sanitizedId} = _parsed_${sanitizedId}.action || "done";
          _selector_${sanitizedId} = _parsed_${sanitizedId}.selector || "";
          _reason_${sanitizedId} = _parsed_${sanitizedId}.reason || "";
          _parsed_ok_${sanitizedId} = true;
        }
      } catch (_parse_err_${sanitizedId}) {
        console.log("[Browser] JSON parse failed: " + _parse_err_${sanitizedId});
      }
    }

    // Step 4: Fallback to string extraction if parsing failed
    if (!_parsed_ok_${sanitizedId} && _json_str_${sanitizedId}) {
      console.log("[Browser] Using fallback string extraction");
      // Extract action field using regex
      let _action_regex_${sanitizedId} = new RegExp('"action"\\\\s*:\\\\s*"([^"]*)"');
      let _action_match_${sanitizedId} = _json_str_${sanitizedId}.match(_action_regex_${sanitizedId});
      if (_action_match_${sanitizedId} && _action_match_${sanitizedId}[1]) {
        _action_${sanitizedId} = _action_match_${sanitizedId}[1];
      }

      // Extract selector field using regex
      let _selector_regex_${sanitizedId} = new RegExp('"selector"\\\\s*:\\\\s*"([^"]*)"');
      let _selector_match_${sanitizedId} = _json_str_${sanitizedId}.match(_selector_regex_${sanitizedId});
      if (_selector_match_${sanitizedId} && _selector_match_${sanitizedId}[1]) {
        _selector_${sanitizedId} = _selector_match_${sanitizedId}[1];
      }

      // Extract reason field using regex
      let _reason_regex_${sanitizedId} = new RegExp('"reason"\\\\s*:\\\\s*"([^"]*)"');
      let _reason_match_${sanitizedId} = _json_str_${sanitizedId}.match(_reason_regex_${sanitizedId});
      if (_reason_match_${sanitizedId} && _reason_match_${sanitizedId}[1]) {
        _reason_${sanitizedId} = _reason_match_${sanitizedId}[1];
      }
    }
  }
  // Also check if the raw input was already an object (hash in FormLogic)
  if (typeof _action_input_raw_${sanitizedId} === 'object' || typeof _action_input_raw_${sanitizedId} === 'hash') {
    // Already an object - extract fields directly
    _action_${sanitizedId} = _action_input_raw_${sanitizedId}.action || "done";
    _selector_${sanitizedId} = _action_input_raw_${sanitizedId}.selector || "";
    _reason_${sanitizedId} = _action_input_raw_${sanitizedId}.reason || "";
  }

  // Step 5: If input is a simple action string (click, scroll, type, goto, done) and no JSON was found,
  // use it directly as the action. This supports workflows that extract action/selector separately.
  if (_action_${sanitizedId} === "done" && !_parsed_ok_${sanitizedId}) {
    // Check if input is a valid action keyword
    let _simple_action_${sanitizedId} = String(_action_input_${sanitizedId}).trim().toLowerCase();
    if (_simple_action_${sanitizedId} === "click" || _simple_action_${sanitizedId} === "scroll" ||
        _simple_action_${sanitizedId} === "type" || _simple_action_${sanitizedId} === "goto") {
      _action_${sanitizedId} = _simple_action_${sanitizedId};
      console.log("[Browser] Using simple action string: " + _action_${sanitizedId});
    }
  }

  // Override selector with separate selector input if connected
  ${selectorInput ? `_selector_${sanitizedId} = String(${selectorInput} || "");` : ""}
  // Override value with separate value input if connected
  ${valueInput ? `let _value_${sanitizedId} = String(${valueInput} || "");` : `let _value_${sanitizedId} = "";`}

  console.log("[Browser] action=" + _action_${sanitizedId} + ", selector=" + _selector_${sanitizedId});

  // Initialize page HTML variable - will be populated AFTER action for click/type/scroll
  ${letOrAssign}${outputVar}_page = "";

  // Check if using Playwright mode
  let _is_playwright_${sanitizedId} = _session_${sanitizedId} && _session_${sanitizedId}.mode === "playwright";
  console.log("[Browser] (${node.id}) mode: " + (_is_playwright_${sanitizedId} ? "playwright" : "webview"));

  // If action is "done", skip the browser action but still return the action type
  if (_action_${sanitizedId} === "done") {
    ${letOrAssign}${outputVar} = "action:done";
    // For done action, get the current page HTML
    if (_session_${sanitizedId} && _session_${sanitizedId}.id) {
      if (_is_playwright_${sanitizedId}) {
        // Playwright: get HTML via HTTP
        try {
          let _pw_html_${sanitizedId} = await Utility.httpRequest(
            _session_${sanitizedId}.serviceUrl + "/session/" + _session_${sanitizedId}.id + "/get_html",
            "POST",
            { "Content-Type": "application/json" },
            "{}"
          );
          if (_pw_html_${sanitizedId} && _pw_html_${sanitizedId}.body) {
            let _pw_html_body_${sanitizedId} = _pw_html_${sanitizedId}.body;
            if (typeof _pw_html_body_${sanitizedId} === "string") {
              try { _pw_html_body_${sanitizedId} = JSON.parse(_pw_html_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
            }
            if (_pw_html_body_${sanitizedId}.success) {
              ${outputVar}_page = _pw_html_body_${sanitizedId}.result || "";
            }
          }
        } catch (_pw_err_${sanitizedId}) {
          console.log("[Browser] (${node.id}) Playwright get_html failed: " + _pw_err_${sanitizedId});
        }
      } else {
        // WebView: use Browser.control
        try {
          let _page_final_${sanitizedId} = await Browser.control(
            _session_${sanitizedId},
            "get_html",
            "",
            "",
            ${timeout},
            "${node.id}"
          );
          if (_page_final_${sanitizedId} !== "__ABORT__" && typeof _page_final_${sanitizedId} === "string") {
            ${outputVar}_page = _page_final_${sanitizedId};
          }
        } catch (_page_err_${sanitizedId}) {
          console.log("[Browser] (${node.id}) get_html failed: " + _page_err_${sanitizedId});
        }
      }
    }
  } else if (!_session_${sanitizedId} || !_session_${sanitizedId}.id) {
    console.log("[Browser] No valid session");
    ${letOrAssign}${outputVar} = "action:" + _action_${sanitizedId};
  } else if (_is_playwright_${sanitizedId}) {
    // ===== PLAYWRIGHT MODE =====
    console.log("[Browser] (${node.id}) Executing via Playwright service...");
    let _pw_endpoint_${sanitizedId} = _session_${sanitizedId}.serviceUrl + "/session/" + _session_${sanitizedId}.id;
    let _pw_result_${sanitizedId} = null;

    // Map action to Playwright endpoint
    if (_action_${sanitizedId} === "goto") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/goto",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ url: _selector_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_action_${sanitizedId} === "click") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/click",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _selector_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_action_${sanitizedId} === "type") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/type",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _selector_${sanitizedId}, text: _value_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_action_${sanitizedId} === "scroll") {
      let _scroll_y_${sanitizedId} = parseInt(_value_${sanitizedId}) || 500;
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/scroll",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ y: _scroll_y_${sanitizedId}, selector: _selector_${sanitizedId} || null })
      );
    } else if (_action_${sanitizedId} === "get_html") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/get_html",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _selector_${sanitizedId} || null })
      );
    }

    // Parse Playwright response
    if (_pw_result_${sanitizedId} && _pw_result_${sanitizedId}.body) {
      let _pw_body_${sanitizedId} = _pw_result_${sanitizedId}.body;
      if (typeof _pw_body_${sanitizedId} === "string") {
        try { _pw_body_${sanitizedId} = JSON.parse(_pw_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
      }
      if (_pw_body_${sanitizedId}.success) {
        console.log("[Browser] (${node.id}) Playwright action succeeded");
      } else {
        console.log("[Browser] (${node.id}) Playwright action failed: " + (_pw_body_${sanitizedId}.message || "unknown"));
      }
    }

    ${letOrAssign}${outputVar} = "action:" + _action_${sanitizedId};

    // Get page HTML AFTER the action
    console.log("[Browser] (${node.id}) get_html AFTER action via Playwright");
    try {
      let _pw_html_after_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/get_html",
        "POST",
        { "Content-Type": "application/json" },
        "{}"
      );
      if (_pw_html_after_${sanitizedId} && _pw_html_after_${sanitizedId}.body) {
        let _pw_html_body_${sanitizedId} = _pw_html_after_${sanitizedId}.body;
        if (typeof _pw_html_body_${sanitizedId} === "string") {
          try { _pw_html_body_${sanitizedId} = JSON.parse(_pw_html_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
        }
        if (_pw_html_body_${sanitizedId}.success) {
          ${outputVar}_page = _pw_html_body_${sanitizedId}.result || "";
          console.log("[Browser] (${node.id}) Playwright get_html: " + ${outputVar}_page.length + " bytes");
        }
      }
    } catch (_pw_html_err_${sanitizedId}) {
      console.log("[Browser] (${node.id}) Playwright get_html failed: " + _pw_html_err_${sanitizedId});
    }
  } else {
    // ===== WEBVIEW MODE =====
    // Execute the action (click, type, scroll, extract, etc.)
    let _ctrl_result_${sanitizedId} = await Browser.control(
      _session_${sanitizedId},
      _action_${sanitizedId},
      _selector_${sanitizedId},
      _value_${sanitizedId},
      ${timeout},
      "${node.id}"
    );
    if (_ctrl_result_${sanitizedId} === "__ABORT__") {
      console.log("[Workflow] Aborted");
      return workflow_context;
    }
    // Return "action:X" prefix + original input for stop condition and history
    // This allows stop condition to check for "done" while preserving the full AI response
    ${letOrAssign}${outputVar} = "action:" + _action_${sanitizedId};

    // Get page HTML AFTER the action (captures new page after click navigation)
    console.log("[Browser] (${node.id}) get_html AFTER action: STARTING await");
    try {
      let _page_after_${sanitizedId} = await Browser.control(
        _session_${sanitizedId},
        "get_html",
        "",
        "",
        ${timeout},
        "${node.id}"
      );
      console.log("[Browser] (${node.id}) get_html AFTER: got " + (typeof _page_after_${sanitizedId} === "string" ? _page_after_${sanitizedId}.length : 0) + " bytes");
      if (_page_after_${sanitizedId} !== "__ABORT__" && typeof _page_after_${sanitizedId} === "string") {
        ${outputVar}_page = _page_after_${sanitizedId};
      }
    } catch (_page_err_after_${sanitizedId}) {
      console.log("[Browser] (${node.id}) get_html AFTER failed: " + _page_err_after_${sanitizedId});
    }
  }
  // Also store the raw AI response for downstream nodes that need the full context
  ${letOrAssign}${outputVar}_ai_response = _action_input_${sanitizedId};
  console.log("[Browser] (${node.id}) === Browser Control End, _page length=" + ${outputVar}_page.length + " ===");

  // Take screenshot if requested
  ${letOrAssign}${outputVar}_screenshot = "";
  ${takeScreenshot ? `
  if (_session_${sanitizedId} && _session_${sanitizedId}.id && _action_${sanitizedId} !== "done") {
    if (_is_playwright_${sanitizedId}) {
      // Playwright: screenshot via HTTP
      try {
        let _pw_screenshot_${sanitizedId} = await Utility.httpRequest(
          _session_${sanitizedId}.serviceUrl + "/session/" + _session_${sanitizedId}.id + "/screenshot",
          "POST",
          { "Content-Type": "application/json" },
          "{}"
        );
        if (_pw_screenshot_${sanitizedId} && _pw_screenshot_${sanitizedId}.body) {
          let _pw_ss_body_${sanitizedId} = _pw_screenshot_${sanitizedId}.body;
          if (typeof _pw_ss_body_${sanitizedId} === "string") {
            try { _pw_ss_body_${sanitizedId} = JSON.parse(_pw_ss_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
          }
          if (_pw_ss_body_${sanitizedId}.success && _pw_ss_body_${sanitizedId}.result) {
            ${outputVar}_screenshot = "data:image/" + (_pw_ss_body_${sanitizedId}.result.format || "png") + ";base64," + _pw_ss_body_${sanitizedId}.result.data;
          }
        }
      } catch (_pw_ss_err_${sanitizedId}) {
        console.log("[Browser] (${node.id}) Playwright screenshot failed: " + _pw_ss_err_${sanitizedId});
      }
    } else {
      // WebView: screenshot via Browser.control
      try {
        let _screenshot_result_${sanitizedId} = await Browser.control(
          _session_${sanitizedId},
          "screenshot",
          "",
          "",
          ${timeout},
          "${node.id}"
        );
        if (_screenshot_result_${sanitizedId} !== "__ABORT__" && typeof _screenshot_result_${sanitizedId} === "string") {
          ${outputVar}_screenshot = _screenshot_result_${sanitizedId};
        }
      } catch (_screenshot_err_${sanitizedId}) {
        console.log("[Browser] (${node.id}) screenshot failed: " + _screenshot_err_${sanitizedId});
      }
    }
  }` : ""}
  ${letOrAssign}${outputVar}_session = _session_${sanitizedId};
  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_page"] = ${outputVar}_page;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;
  workflow_context["${node.id}_session"] = ${outputVar}_session;`;
          } else {
            const targetExpr = selectorInput ? selectorInput : `"${staticTarget}"`;
            const valueExpr = valueInput ? valueInput : `"${staticValue}"`;
            code += `
  // Browser control: ${staticAction || "goto"}
  let _session_${sanitizedId} = ${sessionVar};
  let _target_${sanitizedId} = ${targetExpr};
  let _value_${sanitizedId} = ${valueExpr};
  ${letOrAssign}${outputVar} = "";
  ${letOrAssign}${outputVar}_page = "";
  ${letOrAssign}${outputVar}_screenshot = "";
  ${letOrAssign}${outputVar}_session = _session_${sanitizedId};
  console.log("[Browser] Control action: ${staticAction || "goto"} on " + _target_${sanitizedId});

  // Check if using Playwright mode
  let _is_playwright_${sanitizedId} = _session_${sanitizedId} && _session_${sanitizedId}.mode === "playwright";

  if (!_session_${sanitizedId} || !_session_${sanitizedId}.id) {
    console.log("[Browser] No valid session");
  } else if (_is_playwright_${sanitizedId}) {
    // ===== PLAYWRIGHT MODE (static action) =====
    console.log("[Browser] (${node.id}) Static action via Playwright service...");
    let _pw_endpoint_${sanitizedId} = _session_${sanitizedId}.serviceUrl + "/session/" + _session_${sanitizedId}.id;
    let _static_action_${sanitizedId} = "${staticAction || "goto"}";
    let _pw_result_${sanitizedId} = null;

    // Map action to Playwright endpoint
    if (_static_action_${sanitizedId} === "goto") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/goto",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ url: _target_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_static_action_${sanitizedId} === "click") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/click",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _target_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_static_action_${sanitizedId} === "type") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/type",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _target_${sanitizedId}, text: _value_${sanitizedId}, timeout: ${timeout} })
      );
    } else if (_static_action_${sanitizedId} === "scroll") {
      let _scroll_y_${sanitizedId} = parseInt(_value_${sanitizedId}) || 500;
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/scroll",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ y: _scroll_y_${sanitizedId}, selector: _target_${sanitizedId} || null })
      );
    } else if (_static_action_${sanitizedId} === "get_html") {
      _pw_result_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/get_html",
        "POST",
        { "Content-Type": "application/json" },
        JSON.stringify({ selector: _target_${sanitizedId} || null })
      );
    }

    // Parse Playwright response
    if (_pw_result_${sanitizedId} && _pw_result_${sanitizedId}.body) {
      let _pw_body_${sanitizedId} = _pw_result_${sanitizedId}.body;
      if (typeof _pw_body_${sanitizedId} === "string") {
        try { _pw_body_${sanitizedId} = JSON.parse(_pw_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
      }
      if (_pw_body_${sanitizedId}.success) {
        console.log("[Browser] (${node.id}) Playwright static action succeeded");
        // For get_html, the result is the HTML content
        if (_static_action_${sanitizedId} === "get_html" && _pw_body_${sanitizedId}.result) {
          ${outputVar} = _pw_body_${sanitizedId}.result;
        } else {
          ${outputVar} = "success";
        }
      } else {
        console.log("[Browser] (${node.id}) Playwright static action failed: " + (_pw_body_${sanitizedId}.message || "unknown"));
        ${outputVar} = "error: " + (_pw_body_${sanitizedId}.message || "unknown");
      }
    }

    // Get page HTML after action
    // For get_html, the result is already the HTML; for others, fetch it
    if (_static_action_${sanitizedId} === "get_html") {
      ${outputVar}_page = ${outputVar};
    } else {
      try {
        let _pw_html_${sanitizedId} = await Utility.httpRequest(
          _pw_endpoint_${sanitizedId} + "/get_html",
          "POST",
          { "Content-Type": "application/json" },
          "{}"
        );
        if (_pw_html_${sanitizedId} && _pw_html_${sanitizedId}.body) {
          let _pw_html_body_${sanitizedId} = _pw_html_${sanitizedId}.body;
          if (typeof _pw_html_body_${sanitizedId} === "string") {
            try { _pw_html_body_${sanitizedId} = JSON.parse(_pw_html_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
          }
          if (_pw_html_body_${sanitizedId}.success) {
            ${outputVar}_page = _pw_html_body_${sanitizedId}.result || "";
          }
        }
      } catch (_pw_html_err_${sanitizedId}) {
        console.log("[Browser] (${node.id}) Playwright get_html failed: " + _pw_html_err_${sanitizedId});
      }
    }

    // Take screenshot if requested
    ${takeScreenshot ? `
    try {
      let _pw_screenshot_${sanitizedId} = await Utility.httpRequest(
        _pw_endpoint_${sanitizedId} + "/screenshot",
        "POST",
        { "Content-Type": "application/json" },
        "{}"
      );
      if (_pw_screenshot_${sanitizedId} && _pw_screenshot_${sanitizedId}.body) {
        let _pw_ss_body_${sanitizedId} = _pw_screenshot_${sanitizedId}.body;
        if (typeof _pw_ss_body_${sanitizedId} === "string") {
          try { _pw_ss_body_${sanitizedId} = JSON.parse(_pw_ss_body_${sanitizedId}); } catch(_e_${sanitizedId}) {}
        }
        if (_pw_ss_body_${sanitizedId}.success && _pw_ss_body_${sanitizedId}.result) {
          ${outputVar}_screenshot = "data:image/" + (_pw_ss_body_${sanitizedId}.result.format || "png") + ";base64," + _pw_ss_body_${sanitizedId}.result.data;
        }
      }
    } catch (_pw_ss_err_${sanitizedId}) {
      console.log("[Browser] (${node.id}) Playwright screenshot failed: " + _pw_ss_err_${sanitizedId});
    }` : ""}
  } else {
    // ===== WEBVIEW MODE (static action) =====
    let _ctrl_result_${sanitizedId} = await Browser.control(
      _session_${sanitizedId},
      "${staticAction || "goto"}",
      _target_${sanitizedId},
      _value_${sanitizedId},
      ${timeout},
      "${node.id}"
    );
    if (_ctrl_result_${sanitizedId} === "__ABORT__") {
      console.log("[Workflow] Aborted");
      return workflow_context;
    }
    ${outputVar} = _ctrl_result_${sanitizedId};

    // For goto action, the control result is the page HTML
    // For other actions, fetch the page HTML separately
    if ("${staticAction || "goto"}" === "goto") {
      ${outputVar}_page = _ctrl_result_${sanitizedId};
    } else {
      try {
        let _page_result_${sanitizedId} = await Browser.control(
          _session_${sanitizedId},
          "get_html",
          "",
          "",
          ${timeout},
          "${node.id}"
        );
        if (_page_result_${sanitizedId} !== "__ABORT__" && typeof _page_result_${sanitizedId} === "string") {
          ${outputVar}_page = _page_result_${sanitizedId};
        }
      } catch (_page_err_${sanitizedId}) {
        console.log("[Browser] (${node.id}) get_html failed: " + _page_err_${sanitizedId});
      }
    }

    // Take screenshot if requested
    ${takeScreenshot ? `
    try {
      let _screenshot_result_${sanitizedId} = await Browser.control(
        _session_${sanitizedId},
        "screenshot",
        "",
        "",
        ${timeout},
        "${node.id}"
      );
      if (_screenshot_result_${sanitizedId} !== "__ABORT__" && typeof _screenshot_result_${sanitizedId} === "string") {
        ${outputVar}_screenshot = _screenshot_result_${sanitizedId};
      }
    } catch (_screenshot_err_${sanitizedId}) {
      console.log("[Browser] (${node.id}) screenshot failed: " + _screenshot_err_${sanitizedId});
    }` : ""}
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreBrowserCompiler;

  // ../zipp-core/modules/core-browser/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    BrowserControlNode: () => BrowserControlNode_default,
    BrowserExtractNode: () => BrowserExtractNode_default,
    BrowserRequestNode: () => BrowserRequestNode_default,
    BrowserSessionNode: () => BrowserSessionNode_default
  });

  // ../zipp-core/modules/core-browser/ui/BrowserSessionNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var BROWSER_PROFILES = [
    { value: "chrome_windows", label: "Chrome (Windows)", icon: "C" },
    { value: "chrome_mac", label: "Chrome (macOS)", icon: "C" },
    { value: "firefox_windows", label: "Firefox (Windows)", icon: "F" },
    { value: "firefox_mac", label: "Firefox (macOS)", icon: "F" },
    { value: "safari_mac", label: "Safari (macOS)", icon: "S" },
    { value: "edge_windows", label: "Edge (Windows)", icon: "E" },
    { value: "mobile_ios", label: "Safari (iOS)", icon: "M" },
    { value: "mobile_android", label: "Chrome (Android)", icon: "M" },
    { value: "custom", label: "Custom", icon: "?" }
  ];
  var BrowserSessionIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" }) });
  function BrowserSessionNode({ data }) {
    const [profile, setProfile] = (0, import_react.useState)(data.browserProfile || "chrome_windows");
    const [sessionMode, setSessionMode] = (0, import_react.useState)(data.sessionMode || "webview");
    const [showAdvanced, setShowAdvanced] = (0, import_react.useState)(false);
    const { size, handleResizeStart } = (0, import_zipp_ui_components.useNodeResize)({
      initialWidth: 320,
      initialHeight: 220,
      constraints: { minWidth: 280, maxWidth: 500, minHeight: 180, maxHeight: 550 }
    });
    const onBrowserProfileChangeRef = (0, import_react.useRef)(data.onBrowserProfileChange);
    const onSessionModeChangeRef = (0, import_react.useRef)(data.onSessionModeChange);
    const onPlaywrightUrlChangeRef = (0, import_react.useRef)(data.onPlaywrightUrlChange);
    const onCustomUserAgentChangeRef = (0, import_react.useRef)(data.onCustomUserAgentChange);
    const onCustomHeadersChangeRef = (0, import_react.useRef)(data.onCustomHeadersChange);
    const onInitialCookiesChangeRef = (0, import_react.useRef)(data.onInitialCookiesChange);
    const onViewportWidthChangeRef = (0, import_react.useRef)(data.onViewportWidthChange);
    const onViewportHeightChangeRef = (0, import_react.useRef)(data.onViewportHeightChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onBrowserProfileChangeRef.current = data.onBrowserProfileChange;
      onSessionModeChangeRef.current = data.onSessionModeChange;
      onPlaywrightUrlChangeRef.current = data.onPlaywrightUrlChange;
      onCustomUserAgentChangeRef.current = data.onCustomUserAgentChange;
      onCustomHeadersChangeRef.current = data.onCustomHeadersChange;
      onInitialCookiesChangeRef.current = data.onInitialCookiesChange;
      onViewportWidthChangeRef.current = data.onViewportWidthChange;
      onViewportHeightChangeRef.current = data.onViewportHeightChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleProfileChange = (0, import_react.useCallback)((e) => {
      const newProfile = e.target.value;
      setProfile(newProfile);
      onBrowserProfileChangeRef.current?.(newProfile);
    }, []);
    const handleSessionModeChange = (0, import_react.useCallback)((mode) => {
      setSessionMode(mode);
      onSessionModeChangeRef.current?.(mode);
    }, []);
    const handlePlaywrightUrlChange = (0, import_react.useCallback)((e) => {
      onPlaywrightUrlChangeRef.current?.(e.target.value);
    }, []);
    const handleCustomUserAgentChange = (0, import_react.useCallback)((e) => {
      onCustomUserAgentChangeRef.current?.(e.target.value);
    }, []);
    const handleCustomHeadersChange = (0, import_react.useCallback)((e) => {
      onCustomHeadersChangeRef.current?.(e.target.value);
    }, []);
    const handleInitialCookiesChange = (0, import_react.useCallback)((e) => {
      onInitialCookiesChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const selectedProfile = BROWSER_PROFILES.find((p) => p.value === profile) || BROWSER_PROFILES[0];
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: sessionMode === "webview" ? "text-purple-400" : sessionMode === "playwright" ? "text-green-400" : "text-cyan-400", children: sessionMode === "webview" ? "WebView" : sessionMode === "playwright" ? "Playwright" : "HTTP" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ml-1 text-[10px]", children: selectedProfile.icon })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => [
      { id: "cookies", type: "target", position: import_react2.Position.Left, color: "!bg-yellow-500", label: "cookies", labelColor: "text-yellow-400", size: "md" },
      { id: "headers", type: "target", position: import_react2.Position.Left, color: "!bg-orange-400", label: "headers", labelColor: "text-orange-400", size: "md" }
    ], []);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "session", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
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
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Browser Session",
        color: "cyan",
        icon: BrowserSessionIcon,
        width: size.width,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Browser Mode" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => handleSessionModeChange("webview"),
                  className: `flex-1 px-2 py-1.5 text-xs rounded transition-colors ${sessionMode === "webview" ? "bg-purple-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  children: "WebView"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "button",
                {
                  onClick: () => handleSessionModeChange("playwright"),
                  className: `flex-1 px-2 py-1.5 text-xs rounded transition-colors ${sessionMode === "playwright" ? "bg-green-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-600"}`,
                  children: "Playwright"
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[9px] mt-1", children: sessionMode === "webview" ? "Uses embedded browser panel" : "Uses Playwright service (requires service running)" })
          ] }),
          sessionMode === "playwright" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Playwright Service URL" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-green-500 font-mono",
                placeholder: "http://127.0.0.1:8769",
                value: data.playwrightUrl || "http://127.0.0.1:8769",
                onChange: handlePlaywrightUrlChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Browser Profile" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-2 items-center", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: `w-8 h-8 rounded bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-sm ${sessionMode === "webview" ? "text-purple-400" : "text-cyan-400"}`, children: selectedProfile.icon }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                  value: profile,
                  onChange: handleProfileChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: BROWSER_PROFILES.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: p.value, children: p.label }, p.value))
                }
              )
            ] })
          ] }),
          (sessionMode === "webview" || sessionMode === "playwright") && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Viewport Size" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-1 items-center", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  className: "nodrag nowheel flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  placeholder: "1280",
                  value: data.viewportWidth || 1280,
                  onChange: (e) => onViewportWidthChangeRef.current?.(parseInt(e.target.value) || 1280),
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-500 text-xs shrink-0", children: "\xD7" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "number",
                  className: "nodrag nowheel flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  placeholder: "800",
                  value: data.viewportHeight || 800,
                  onChange: (e) => onViewportHeightChangeRef.current?.(parseInt(e.target.value) || 800),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          profile === "custom" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Custom User-Agent" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono",
                placeholder: "Mozilla/5.0 ...",
                value: data.customUserAgent || "",
                onChange: handleCustomUserAgentChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              onClick: () => setShowAdvanced(!showAdvanced),
              className: "w-full flex items-center justify-between px-2 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 transition-colors",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Advanced Settings" }),
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
          showAdvanced && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Custom Headers ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(JSON)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono",
                  rows: 2,
                  placeholder: '{"X-Custom": "value"}',
                  value: data.customHeaders || "",
                  onChange: handleCustomHeadersChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Initial Cookies ",
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600", children: "(from DevTools)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-xs text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono",
                  rows: 2,
                  placeholder: "Paste cookies JSON or cookie header string",
                  value: data.initialCookies || "",
                  onChange: handleInitialCookiesChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px]", children: sessionMode === "webview" ? "Creates a WebView browser with full JavaScript support" : sessionMode === "playwright" ? "Uses Playwright Chromium via external service" : "Creates HTTP session with User-Agent and cookies" })
        ] })
      }
    );
  }
  var BrowserSessionNode_default = (0, import_react.memo)(BrowserSessionNode);

  // ../zipp-core/modules/core-browser/ui/BrowserRequestNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var METHODS = ["GET", "POST", "PUT", "DELETE"];
  var BODY_TYPES = [
    { value: "none", label: "None" },
    { value: "form_urlencoded", label: "Form (URL encoded)" },
    { value: "json", label: "JSON" },
    { value: "raw", label: "Raw" }
  ];
  var RESPONSE_FORMATS = [
    { value: "html", label: "HTML" },
    { value: "json", label: "JSON" },
    { value: "text", label: "Text" },
    { value: "full", label: "Full (with headers)" }
  ];
  var BrowserRequestIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 10V3L4 14h7v7l9-11h-7z" }) });
  function BrowserRequestNode({ data }) {
    const method = data.method || "GET";
    const bodyType = data.bodyType || "none";
    const showBody = method !== "GET" && bodyType !== "none";
    const showBodyProperties = data.showBodyProperties !== false;
    const [showAdvanced, setShowAdvanced] = (0, import_react3.useState)(false);
    const { size, handleResizeStart } = (0, import_zipp_ui_components2.useNodeResize)({
      initialWidth: 340,
      initialHeight: 280,
      constraints: { minWidth: 300, maxWidth: 600, minHeight: 200, maxHeight: 600 }
    });
    const onMethodChangeRef = (0, import_react3.useRef)(data.onMethodChange);
    const onUrlChangeRef = (0, import_react3.useRef)(data.onUrlChange);
    const onBodyTypeChangeRef = (0, import_react3.useRef)(data.onBodyTypeChange);
    const onBodyChangeRef = (0, import_react3.useRef)(data.onBodyChange);
    const onHeadersChangeRef = (0, import_react3.useRef)(data.onHeadersChange || data.onCustomHeadersChange);
    const onResponseFormatChangeRef = (0, import_react3.useRef)(data.onResponseFormatChange);
    const onFollowRedirectsChangeRef = (0, import_react3.useRef)(data.onFollowRedirectsChange);
    const onMaxRedirectsChangeRef = (0, import_react3.useRef)(data.onMaxRedirectsChange);
    const onWaitForSelectorChangeRef = (0, import_react3.useRef)(data.onWaitForSelectorChange);
    const onWaitTimeoutChangeRef = (0, import_react3.useRef)(data.onWaitTimeoutChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onMethodChangeRef.current = data.onMethodChange;
      onUrlChangeRef.current = data.onUrlChange;
      onBodyTypeChangeRef.current = data.onBodyTypeChange;
      onBodyChangeRef.current = data.onBodyChange;
      onHeadersChangeRef.current = data.onHeadersChange || data.onCustomHeadersChange;
      onResponseFormatChangeRef.current = data.onResponseFormatChange;
      onFollowRedirectsChangeRef.current = data.onFollowRedirectsChange;
      onMaxRedirectsChangeRef.current = data.onMaxRedirectsChange;
      onWaitForSelectorChangeRef.current = data.onWaitForSelectorChange;
      onWaitTimeoutChangeRef.current = data.onWaitTimeoutChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleMethodChange = (0, import_react3.useCallback)((newMethod) => {
      onMethodChangeRef.current?.(newMethod);
    }, []);
    const handleUrlChange = (0, import_react3.useCallback)((e) => {
      onUrlChangeRef.current?.(e.target.value);
    }, []);
    const handleBodyTypeChange = (0, import_react3.useCallback)((e) => {
      const newType = e.target.value;
      onBodyTypeChangeRef.current?.(newType);
    }, []);
    const handleBodyChange = (0, import_react3.useCallback)((e) => {
      onBodyChangeRef.current?.(e.target.value);
    }, []);
    const handleHeadersChange = (0, import_react3.useCallback)((e) => {
      onHeadersChangeRef.current?.(e.target.value);
    }, []);
    const handleResponseFormatChange = (0, import_react3.useCallback)((e) => {
      onResponseFormatChangeRef.current?.(e.target.value);
    }, []);
    const handleFollowRedirectsChange = (0, import_react3.useCallback)((e) => {
      onFollowRedirectsChangeRef.current?.(e.target.checked);
    }, []);
    const handleMaxRedirectsChange = (0, import_react3.useCallback)((e) => {
      onMaxRedirectsChangeRef.current?.(parseInt(e.target.value) || 5);
    }, []);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const displayUrl = data.url ? typeof data.url === "object" ? JSON.stringify(data.url) : String(data.url) : "";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-cyan-400", children: method }),
      displayUrl && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-1 text-[10px] truncate", children: [
        displayUrl.slice(0, 20),
        "..."
      ] })
    ] });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "session", type: "target", position: import_react4.Position.Left, color: "!bg-cyan-500", label: "session", labelColor: "text-cyan-400", size: "lg" },
      { id: "url", type: "target", position: import_react4.Position.Left, color: "!bg-blue-500", label: "url", labelColor: "text-blue-400", size: "md" },
      { id: "body", type: "target", position: import_react4.Position.Left, color: "!bg-yellow-500", label: "body", labelColor: "text-yellow-400", size: "md" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "response", type: "source", position: import_react4.Position.Right, color: "!bg-green-500", size: "lg" },
      { id: "session", type: "source", position: import_react4.Position.Right, color: "!bg-cyan-500", label: "session", labelColor: "text-cyan-400", size: "md" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "s")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity",
          onMouseDown: (e) => handleResizeStart(e, "se"),
          children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-slate-500", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22Z" }) })
        }
      )
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Browser Request",
        color: "cyan",
        icon: BrowserRequestIcon,
        width: size.width,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: [
          showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Method" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex gap-1 flex-wrap", children: METHODS.map((m) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "button",
                {
                  className: `px-2 py-1 rounded text-xs font-medium transition-colors ${method === m ? "bg-cyan-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-600"}`,
                  onClick: () => handleMethodChange(m),
                  children: m
                },
                m
              )) })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "URL" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                  placeholder: "https://example.com/page",
                  value: data.url || "",
                  onChange: handleUrlChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] }),
            method !== "GET" && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Body Type" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                  value: bodyType,
                  onChange: handleBodyTypeChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: BODY_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: t.value, children: t.label }, t.value))
                }
              )
            ] }),
            showBody && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Body" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono",
                  rows: 3,
                  placeholder: bodyType === "json" ? '{"key": "value"}' : "key=value&key2=value2",
                  value: data.body || "",
                  onChange: handleBodyChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              onClick: () => setShowAdvanced(!showAdvanced),
              className: "w-full flex items-center justify-between px-2 py-1.5 bg-slate-200/50 dark:bg-slate-700/50 hover:bg-slate-300 dark:hover:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-400 transition-colors",
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "Advanced Settings" }),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "svg",
                  {
                    className: `w-4 h-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`,
                    fill: "none",
                    stroke: "currentColor",
                    viewBox: "0 0 24 24",
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M19 9l-7 7-7-7" })
                  }
                )
              ]
            }
          ),
          showAdvanced && showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Custom Headers ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-cyan-400", children: "(JSON)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "textarea",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-cyan-500 font-mono",
                  rows: 3,
                  placeholder: '{\n  "Origin": "https://example.com",\n  "Referer": "https://example.com/page"\n}',
                  value: data.headers || data.customHeaders || "",
                  onChange: handleHeadersChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[9px] mt-1", children: "Set any headers including Origin, Referer, etc." })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Response Format" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                  value: data.responseFormat || "html",
                  onChange: handleResponseFormatChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: RESPONSE_FORMATS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: f.value, children: f.label }, f.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-4", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "checkbox",
                    className: "nodrag",
                    checked: data.followRedirects !== false,
                    onChange: handleFollowRedirectsChange
                  }
                ),
                "Follow Redirects"
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "flex items-center gap-2 text-slate-600 dark:text-slate-400 text-xs", children: [
                "Max:",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "number",
                    className: "nodrag nowheel w-12 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1 py-0.5 text-xs text-slate-200",
                    value: data.maxRedirects || 5,
                    min: 1,
                    max: 20,
                    onChange: handleMaxRedirectsChange,
                    onMouseDown: (e) => e.stopPropagation()
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
                "Wait for Selector ",
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-purple-400", children: "(WebView)" })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: "#content, .loaded, [data-ready]",
                  value: data.waitForSelector || "",
                  onChange: (e) => onWaitForSelectorChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[9px] mt-1", children: "Wait for this CSS selector before returning (WebView sessions only)" })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "text-slate-500 text-[10px]", children: [
            "Outputs: ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-green-400", children: "body" }),
            ", ",
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-cyan-400", children: "session" }),
            " (with cookies)"
          ] })
        ]
      }
    );
  }
  var BrowserRequestNode_default = (0, import_react3.memo)(BrowserRequestNode);

  // ../zipp-core/modules/core-browser/ui/BrowserExtractNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var EXTRACTION_TYPES = [
    { value: "css_selector", label: "CSS Selector" },
    { value: "regex", label: "Regex Pattern" },
    { value: "all_links", label: "All Links" },
    { value: "all_forms", label: "All Forms" },
    { value: "form_fields", label: "Form Fields" }
  ];
  var EXTRACT_TARGETS = [
    { value: "text", label: "Text Content" },
    { value: "html", label: "Inner HTML" },
    { value: "attribute", label: "Attribute" }
  ];
  var OUTPUT_FORMATS = [
    { value: "first", label: "First Match" },
    { value: "all_json", label: "All (JSON Array)" },
    { value: "all_newline", label: "All (Newline Sep.)" }
  ];
  var BrowserExtractIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" }) });
  function BrowserExtractNode({ data }) {
    const [extractionType, setExtractionType] = (0, import_react5.useState)(data.extractionType || "css_selector");
    const [extractTarget, setExtractTarget] = (0, import_react5.useState)(data.extractTarget || "text");
    const { size, handleResizeStart } = (0, import_zipp_ui_components3.useNodeResize)({
      initialWidth: 320,
      initialHeight: 260,
      constraints: { minWidth: 280, maxWidth: 500, minHeight: 200, maxHeight: 500 }
    });
    const onExtractionTypeChangeRef = (0, import_react5.useRef)(data.onExtractionTypeChange);
    const onSelectorChangeRef = (0, import_react5.useRef)(data.onSelectorChange);
    const onPatternChangeRef = (0, import_react5.useRef)(data.onPatternChange);
    const onExtractTargetChangeRef = (0, import_react5.useRef)(data.onExtractTargetChange);
    const onAttributeNameChangeRef = (0, import_react5.useRef)(data.onAttributeNameChange);
    const onOutputFormatChangeRef = (0, import_react5.useRef)(data.onOutputFormatChange);
    const onMaxLengthChangeRef = (0, import_react5.useRef)(data.onMaxLengthChange);
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onExtractionTypeChangeRef.current = data.onExtractionTypeChange;
      onSelectorChangeRef.current = data.onSelectorChange;
      onPatternChangeRef.current = data.onPatternChange;
      onExtractTargetChangeRef.current = data.onExtractTargetChange;
      onAttributeNameChangeRef.current = data.onAttributeNameChange;
      onOutputFormatChangeRef.current = data.onOutputFormatChange;
      onMaxLengthChangeRef.current = data.onMaxLengthChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleExtractionTypeChange = (0, import_react5.useCallback)((e) => {
      const newType = e.target.value;
      setExtractionType(newType);
      onExtractionTypeChangeRef.current?.(newType);
    }, []);
    const handleSelectorChange = (0, import_react5.useCallback)((e) => {
      onSelectorChangeRef.current?.(e.target.value);
    }, []);
    const handlePatternChange = (0, import_react5.useCallback)((e) => {
      onPatternChangeRef.current?.(e.target.value);
    }, []);
    const handleExtractTargetChange = (0, import_react5.useCallback)((e) => {
      const newTarget = e.target.value;
      setExtractTarget(newTarget);
      onExtractTargetChangeRef.current?.(newTarget);
    }, []);
    const handleAttributeNameChange = (0, import_react5.useCallback)((e) => {
      onAttributeNameChangeRef.current?.(e.target.value);
    }, []);
    const handleOutputFormatChange = (0, import_react5.useCallback)((e) => {
      onOutputFormatChangeRef.current?.(e.target.value);
    }, []);
    const handleMaxLengthChange = (0, import_react5.useCallback)((e) => {
      const value = parseInt(e.target.value) || 0;
      onMaxLengthChangeRef.current?.(value);
    }, []);
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const showSelector = ["css_selector", "form_fields"].includes(extractionType);
    const showPattern = extractionType === "regex";
    const showExtractTarget = ["css_selector", "all_links"].includes(extractionType);
    const showOutputFormat = !["all_links", "all_forms", "form_fields"].includes(extractionType);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-slate-400", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-cyan-400", children: EXTRACTION_TYPES.find((t) => t.value === extractionType)?.label || extractionType }) });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "content", type: "target", position: import_react6.Position.Left, color: "!bg-blue-500", label: "html", labelColor: "text-blue-400", size: "lg" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "result", type: "source", position: import_react6.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-cyan-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "s")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity",
          onMouseDown: (e) => handleResizeStart(e, "se"),
          children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-slate-500", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22Z" }) })
        }
      )
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Extract Content",
        color: "cyan",
        icon: BrowserExtractIcon,
        width: size.width,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Extraction Type" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: extractionType,
                onChange: handleExtractionTypeChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: EXTRACTION_TYPES.map((t) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: t.value, children: t.label }, t.value))
              }
            )
          ] }),
          showSelector && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "CSS Selector" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                placeholder: ".product-title",
                value: data.selector || "",
                onChange: handleSelectorChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          showPattern && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Regex Pattern" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                placeholder: "Product ID: (\\d+)",
                value: data.pattern || "",
                onChange: handlePatternChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          showExtractTarget && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Target" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "select",
                {
                  className: "flex-1 nodrag nowheel bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  value: extractTarget,
                  onChange: handleExtractTargetChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: EXTRACT_TARGETS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: t.value, children: t.label }, t.value))
                }
              ),
              extractTarget === "attribute" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "text",
                  className: "flex-1 nodrag nowheel bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: "href",
                  value: data.attributeName || "",
                  onChange: handleAttributeNameChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          showOutputFormat && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Format" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: data.outputFormat || "first",
                onChange: handleOutputFormatChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: OUTPUT_FORMATS.map((f) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: f.value, children: f.label }, f.value))
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Max Length (0 = unlimited)" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "number",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono",
                placeholder: "8000",
                value: data.maxLength || 0,
                min: 0,
                max: 1e5,
                onChange: handleMaxLengthChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-600 text-[10px] mt-1", children: "Truncates output for AI processing (recommended: 8000-16000)" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "text-slate-500 text-[10px]", children: [
            extractionType === "all_links" && "Extracts all links as JSON array [{text, href}]",
            extractionType === "all_forms" && "Extracts all forms with fields as JSON",
            extractionType === "form_fields" && "Extracts input fields from selected form",
            extractionType === "css_selector" && "Extracts content matching CSS selector",
            extractionType === "regex" && "Extracts content matching regex pattern"
          ] })
        ] })
      }
    );
  }
  var BrowserExtractNode_default = (0, import_react5.memo)(BrowserExtractNode);

  // ../zipp-core/modules/core-browser/ui/BrowserControlNode.tsx
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react2(), 1);
  var import_zipp_ui_components4 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var ACTIONS = [
    { value: "click", label: "Click Element" },
    { value: "type", label: "Type Text" },
    { value: "scroll", label: "Scroll Page" },
    { value: "screenshot", label: "Take Screenshot" },
    { value: "evaluate", label: "Run JavaScript" },
    { value: "wait", label: "Wait for Element" }
  ];
  var SCROLL_DIRECTIONS = ["up", "down", "left", "right"];
  var BrowserControlIcon = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" }) });
  function BrowserControlNode({ data }) {
    const [action, setAction] = (0, import_react7.useState)(data.action || "click");
    const { size, handleResizeStart } = (0, import_zipp_ui_components4.useNodeResize)({
      initialWidth: 280,
      initialHeight: 240,
      constraints: { minWidth: 240, maxWidth: 400, minHeight: 180, maxHeight: 450 }
    });
    const onActionChangeRef = (0, import_react7.useRef)(data.onActionChange);
    const onSelectorChangeRef = (0, import_react7.useRef)(data.onSelectorChange);
    const onValueChangeRef = (0, import_react7.useRef)(data.onValueChange);
    const onScrollDirectionChangeRef = (0, import_react7.useRef)(data.onScrollDirectionChange);
    const onScrollAmountChangeRef = (0, import_react7.useRef)(data.onScrollAmountChange);
    const onWaitTimeoutChangeRef = (0, import_react7.useRef)(data.onWaitTimeoutChange);
    const onCollapsedChangeRef = (0, import_react7.useRef)(data.onCollapsedChange);
    (0, import_react7.useEffect)(() => {
      onActionChangeRef.current = data.onActionChange;
      onSelectorChangeRef.current = data.onSelectorChange;
      onValueChangeRef.current = data.onValueChange;
      onScrollDirectionChangeRef.current = data.onScrollDirectionChange;
      onScrollAmountChangeRef.current = data.onScrollAmountChange;
      onWaitTimeoutChangeRef.current = data.onWaitTimeoutChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleActionChange = (0, import_react7.useCallback)((newAction) => {
      setAction(newAction);
      onActionChangeRef.current?.(newAction);
    }, []);
    const handleSelectorChange = (0, import_react7.useCallback)((e) => {
      onSelectorChangeRef.current?.(e.target.value);
    }, []);
    const handleValueChange = (0, import_react7.useCallback)((e) => {
      onValueChangeRef.current?.(e.target.value);
    }, []);
    const handleScrollDirectionChange = (0, import_react7.useCallback)((e) => {
      onScrollDirectionChangeRef.current?.(e.target.value);
    }, []);
    const handleScrollAmountChange = (0, import_react7.useCallback)((e) => {
      onScrollAmountChangeRef.current?.(parseInt(e.target.value) || 300);
    }, []);
    const handleWaitTimeoutChange = (0, import_react7.useCallback)((e) => {
      onWaitTimeoutChangeRef.current?.(parseInt(e.target.value) || 3e4);
    }, []);
    const handleCollapsedChange = (0, import_react7.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const showSelector = ["click", "type", "wait"].includes(action);
    const showValue = ["type", "evaluate"].includes(action);
    const showScrollOptions = action === "scroll";
    const validationIssues = (0, import_react7.useMemo)(() => {
      const issues = [];
      if (showSelector && !data.selector) {
        issues.push({ field: "Selector", message: "Required" });
      }
      if (action === "type" && !data.value) {
        issues.push({ field: "Value", message: "Required" });
      }
      if (action === "evaluate" && !data.value) {
        issues.push({ field: "Code", message: "Required" });
      }
      return issues;
    }, [action, data.selector, data.value, showSelector]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "text-slate-400", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-purple-400 font-medium", children: ACTIONS.find((a) => a.value === action)?.label || action }) });
    const inputHandles = (0, import_react7.useMemo)(() => {
      const handles = [
        { id: "session", type: "target", position: import_react8.Position.Left, color: "!bg-cyan-500", label: "session", labelColor: "text-cyan-400", size: "lg" },
        { id: "action", type: "target", position: import_react8.Position.Left, color: "!bg-purple-400", label: "action", labelColor: "text-purple-400", size: "sm" }
      ];
      if (showSelector) {
        handles.push({ id: "selector", type: "target", position: import_react8.Position.Left, color: "!bg-blue-400", label: "selector", labelColor: "text-blue-400", size: "sm" });
      }
      if (showValue) {
        handles.push({ id: "value", type: "target", position: import_react8.Position.Left, color: "!bg-green-400", label: "value", labelColor: "text-green-400", size: "sm" });
      }
      return handles;
    }, [showSelector, showValue]);
    const outputHandles = (0, import_react7.useMemo)(() => [
      { id: "result", type: "source", position: import_react8.Position.Right, color: "!bg-green-500", label: "result", labelColor: "text-green-400", size: "lg" },
      { id: "page", type: "source", position: import_react8.Position.Right, color: "!bg-orange-500", label: "page", labelColor: "text-orange-400", size: "md" },
      { id: "screenshot", type: "source", position: import_react8.Position.Right, color: "!bg-pink-500", label: "screenshot", labelColor: "text-pink-400", size: "md" },
      { id: "session", type: "source", position: import_react8.Position.Right, color: "!bg-cyan-500", label: "session", labelColor: "text-cyan-400", size: "sm" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-purple-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "s")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-1 right-1 w-3 h-3 cursor-nwse-resize opacity-0 group-hover:opacity-100 transition-opacity",
          onMouseDown: (e) => handleResizeStart(e, "se"),
          children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-slate-500", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { d: "M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22Z" }) })
        }
      )
    ] });
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_zipp_ui_components4.CollapsibleNodeWrapper,
      {
        title: "Browser Control",
        color: "purple",
        icon: BrowserControlIcon,
        width: size.width,
        collapsedWidth: 150,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Action" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                value: action,
                onChange: (e) => handleActionChange(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: ACTIONS.map((a) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: a.value, children: a.label }, a.value))
              }
            )
          ] }),
          ["click", "type", "wait", "evaluate"].includes(action) && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: action === "wait" ? "Selector (Optional)" : "Selector" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                placeholder: action === "wait" ? ".target (if waiting for element)" : "#submit-btn",
                value: data.selector || "",
                onChange: handleSelectorChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          action === "type" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Value to Type" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                placeholder: "Hello World",
                value: data.value || "",
                onChange: handleValueChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          action === "evaluate" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "JavaScript Code" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-purple-500 font-mono",
                rows: 4,
                placeholder: "return document.title;",
                value: data.value || "",
                onChange: handleValueChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          showScrollOptions && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Direction" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500",
                  value: data.scrollDirection || "down",
                  onChange: handleScrollDirectionChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: SCROLL_DIRECTIONS.map((dir) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("option", { value: dir, children: dir.charAt(0).toUpperCase() + dir.slice(1) }, dir))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Amount (px)" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "number",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                  placeholder: "300",
                  value: data.scrollAmount || 300,
                  onChange: handleScrollAmountChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          action === "wait" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Timeout (ms)" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "number",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                placeholder: "30000",
                value: data.waitTimeout || 3e4,
                min: 0,
                max: 12e4,
                onChange: handleWaitTimeoutChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          action === "screenshot" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "bg-pink-900/20 border border-pink-500/30 rounded p-2", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-pink-300 text-xs", children: "Captures page as base64 PNG" }) })
        ] })
      }
    );
  }
  var BrowserControlNode_default = (0, import_react7.memo)(BrowserControlNode);

  // ../zipp-core/modules/core-browser/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
