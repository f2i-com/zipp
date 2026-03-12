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

  // external-global:@monaco-editor/react
  var require_react3 = __commonJS({
    "external-global:@monaco-editor/react"(exports, module) {
      module.exports = __PLUGIN_GLOBALS__.MonacoReact;
    }
  });

  // ../zipp-core/modules/core-utility/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-utility/runtime.ts
  var ctx;
  var memory = /* @__PURE__ */ new Map();
  function template(templateStr, variables) {
    ctx.log("info", `[Template] Processing template with ${Object.keys(variables).length} variables`);
    let result = templateStr;
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      const stringValue = typeof value === "object" ? JSON.stringify(value) : String(value);
      result = result.replace(placeholder, stringValue);
    }
    return result;
  }
  function logicBlock(code, inputs) {
    ctx.log("info", `[LogicBlock] Executing code with ${Object.keys(inputs).length} inputs`);
    if (typeof code !== "string") {
      throw new Error("LogicBlock code must be a string");
    }
    const MAX_CODE_LENGTH = 1024 * 1024;
    if (code.length > MAX_CODE_LENGTH) {
      throw new Error(`LogicBlock code exceeds maximum length of ${MAX_CODE_LENGTH} characters`);
    }
    const validIdentifier = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
    const inputKeys = Object.keys(inputs);
    for (const key of inputKeys) {
      if (!validIdentifier.test(key)) {
        throw new Error(`Invalid input name: "${key}". Must be a valid JavaScript identifier.`);
      }
      const reserved = [
        "eval",
        "Function",
        "constructor",
        "__proto__",
        "prototype",
        "__defineGetter__",
        "__defineSetter__",
        "__lookupGetter__",
        "__lookupSetter__",
        "hasOwnProperty",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toLocaleString",
        "toString",
        "valueOf"
      ];
      if (reserved.includes(key)) {
        throw new Error(`Reserved input name not allowed: "${key}"`);
      }
    }
    try {
      const fn = new Function(...inputKeys, code);
      return fn(...Object.values(inputs));
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[LogicBlock] Execution failed: ${errMsg}`);
      throw error;
    }
  }
  function memoryRead(key, defaultValue) {
    ctx.log("info", `[Memory] Reading key: ${key}`);
    const value = memory.get(key);
    if (value === void 0) {
      return defaultValue;
    }
    return value;
  }
  function memoryWrite(key, value) {
    ctx.log("info", `[Memory] Writing key: ${key}`);
    memory.set(key, value);
  }
  function memoryClear() {
    ctx.log("info", "[Memory] Clearing all keys");
    memory.clear();
  }
  async function httpRequest(url, method, headers, body) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Utility] Aborted by user before HTTP request");
      throw new Error("Operation aborted by user");
    }
    ctx.log("info", `[Utility] HTTP ${method} ${url}`);
    try {
      if (ctx.secureFetch) {
        const fetchOptions2 = {
          method,
          headers
        };
        if (body) {
          fetchOptions2.body = body;
        }
        const response2 = await ctx.secureFetch(url, fetchOptions2);
        const responseBody2 = await response2.text();
        const responseHeaders2 = {};
        response2.headers.forEach((value, key) => {
          responseHeaders2[key] = value;
        });
        return {
          status: response2.status,
          headers: responseHeaders2,
          body: responseBody2
        };
      }
      if (ctx.tauri) {
        const result = await ctx.tauri.invoke("http_request", {
          request: {
            url,
            method,
            headers,
            body: body || null,
            follow_redirects: true,
            max_redirects: 10,
            allow_private_networks: true
          }
        });
        return {
          status: result.status,
          headers: result.headers,
          body: result.body
        };
      }
      const fetchOptions = {
        method,
        headers
      };
      if (body) {
        fetchOptions.body = body;
      }
      const response = await ctx.fetch(url, fetchOptions);
      const responseBody = await response.text();
      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });
      return {
        status: response.status,
        headers: responseHeaders,
        body: responseBody
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Utility] HTTP request failed: ${errMsg}`);
      throw error;
    }
  }
  async function comfyuiFreeMemory(comfyuiUrl, unloadModels, freeMemory, nodeId) {
    ctx.log("info", `[ComfyUI Free Memory] Freeing GPU memory (unloadModels: ${unloadModels}, freeMemory: ${freeMemory})`);
    ctx.onNodeStatus?.(nodeId, "running");
    try {
      const requestBody = {};
      if (unloadModels) {
        requestBody.unload_models = true;
      }
      if (freeMemory) {
        requestBody.free_memory = true;
      }
      const response = await fetch(`${comfyuiUrl}/free`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorText = await response.text();
        ctx.log("warn", `[ComfyUI Free Memory] API returned ${response.status}: ${errorText}`);
        ctx.onNodeStatus?.(nodeId, "completed");
        return false;
      }
      ctx.log("info", "[ComfyUI Free Memory] GPU memory freed successfully");
      ctx.onNodeStatus?.(nodeId, "completed");
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("warn", `[ComfyUI Free Memory] Failed to free memory: ${errMsg}`);
      ctx.onNodeStatus?.(nodeId, "completed");
      return false;
    }
  }
  async function getServiceUrl(serviceId) {
    ctx.log("info", `[Utility] Getting URL for service: ${serviceId}`);
    try {
      if (ctx.tauri) {
        const port = await ctx.tauri.invoke("get_service_port", { serviceId });
        if (port) {
          const url = `http://127.0.0.1:${port}`;
          ctx.log("info", `[Utility] Service ${serviceId} running on ${url}`);
          return url;
        }
        ctx.log("warn", `[Utility] Service ${serviceId} is not running`);
        return null;
      }
      if (ctx.secureFetch || ctx.fetch) {
        const fetchFn = ctx.secureFetch || ctx.fetch;
        const response = await fetchFn(`http://127.0.0.1:8767/api/services/${serviceId}/port`);
        if (response.ok) {
          const data = await response.json();
          if (data.data?.port) {
            const url = `http://127.0.0.1:${data.data.port}`;
            ctx.log("info", `[Utility] Service ${serviceId} running on ${url}`);
            return url;
          }
        }
      }
      ctx.log("warn", `[Utility] Could not determine URL for service ${serviceId}`);
      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Utility] Failed to get service URL: ${errMsg}`);
      return null;
    }
  }
  async function ensureService(serviceId) {
    ctx.log("info", `[Utility] Ensuring service is ready: ${serviceId}`);
    try {
      if (ctx.tauri) {
        const result = await ctx.tauri.invoke("ensure_service_ready", { serviceId });
        if (result.success && result.port) {
          const url = `http://127.0.0.1:${result.port}`;
          if (result.already_running) {
            ctx.log("info", `[Utility] Service ${serviceId} already running on ${url}`);
          } else {
            ctx.log("info", `[Utility] Service ${serviceId} started and healthy on ${url}`);
          }
          return url;
        }
        if (result.error) {
          ctx.log("warn", `[Utility] Service ${serviceId} failed to start: ${result.error}`);
        } else {
          ctx.log("warn", `[Utility] Service ${serviceId} is not available`);
        }
        return null;
      }
      if (ctx.secureFetch || ctx.fetch) {
        const fetchFn = ctx.secureFetch || ctx.fetch;
        const response = await fetchFn(`http://127.0.0.1:8767/api/services/${serviceId}/ensure`, {
          method: "POST"
        });
        if (response.ok) {
          const data = await response.json();
          if (data.data?.success && data.data?.port) {
            const url = `http://127.0.0.1:${data.data.port}`;
            ctx.log("info", `[Utility] Service ${serviceId} ready on ${url}`);
            return url;
          }
        }
      }
      ctx.log("warn", `[Utility] Could not ensure service ${serviceId} is ready`);
      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Utility] Failed to ensure service: ${errMsg}`);
      return null;
    }
  }
  async function ensureServiceByPort(port) {
    ctx.log("info", `[Utility] Ensuring service on port ${port} is ready...`);
    try {
      if (ctx.tauri) {
        const result = await ctx.tauri.invoke("ensure_service_ready_by_port", { port });
        if (result.success && result.port) {
          const url = `http://127.0.0.1:${result.port}`;
          if (result.already_running) {
            ctx.log("info", `[Utility] Service on port ${port} already running at ${url}`);
          } else {
            ctx.log("info", `[Utility] Service on port ${port} started and healthy at ${url}`);
          }
          return url;
        }
        if (result.error) {
          ctx.log("warn", `[Utility] Service on port ${port} failed to start: ${result.error}`);
        } else {
          ctx.log("warn", `[Utility] Service on port ${port} is not available`);
        }
        return null;
      }
      ctx.log("warn", `[Utility] Could not ensure service on port ${port} is ready (Tauri not available)`);
      return null;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Utility] Failed to ensure service by port: ${errMsg}`);
      return null;
    }
  }
  var CoreUtilityRuntime = {
    name: "Utility",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Utility] Module initialized");
    },
    methods: {
      template,
      logicBlock,
      memoryRead,
      memoryWrite,
      memoryClear,
      httpRequest,
      comfyuiFreeMemory,
      getServiceUrl,
      ensureService,
      ensureServiceByPort
    },
    async cleanup() {
      memory.clear();
      ctx?.log?.("info", "[Utility] Module cleanup");
    }
  };
  var runtime_default = CoreUtilityRuntime;

  // ../zipp-core/modules/core-utility/compiler.ts
  var CoreUtilityCompiler = {
    name: "Utility",
    getNodeTypes() {
      return ["template", "logic_block", "memory", "comfyui_free_memory"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, isInLoop, loopStartId, escapeString, sanitizeId, debugEnabled } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const debug = debugEnabled ?? false;
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("input1") || inputs.get("value") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "template": {
          let template2 = escapeString(String(data.template || ""));
          if (debug) {
            console.log(`[Template Compiler] Node ${node.id}: raw template (first 500 chars):`, template2.substring(0, 500));
            console.log(`[Template Compiler] Node ${node.id}: template includes {{history}}:`, template2.includes("{{history}}"));
          }
          const templateVars = template2.match(/\{\{([^}]+)\}\}/g) || [];
          if (debug) {
            console.log(`[Template Compiler] Node ${node.id}: found templateVars:`, templateVars);
          }
          const varMap = {};
          let firstInputVar = null;
          const inputNames = data.inputNames || [];
          const handleToName = {
            "input": inputNames[0] || "input",
            "input2": inputNames[1] || "input2",
            "input3": inputNames[2] || "input3",
            "input4": inputNames[3] || "input4",
            "input5": inputNames[4] || "input5",
            "input6": inputNames[5] || "input6"
          };
          for (const [handleId, sourceVar] of inputs) {
            const varName = handleToName[handleId] || handleId;
            varMap[varName] = sourceVar;
            varMap[handleId] = sourceVar;
            if (!firstInputVar) {
              firstInputVar = sourceVar;
            }
            if (!varMap["input"] && (handleId === "default" || handleId === "input" || handleId === "input1")) {
              varMap["input"] = sourceVar;
            }
          }
          if (debug) {
            console.log(`[Template Compiler] Node ${node.id}: inputNames:`, inputNames, "varMap keys:", Object.keys(varMap));
          }
          let loopSubstitutions = "";
          if (isInLoop && loopStartId) {
            const historyStrVar = `${sanitizeId(loopStartId)}_history_str`;
            const indexVar = `node_${sanitizeId(loopStartId)}_out_index`;
            const itemVar = `node_${sanitizeId(loopStartId)}_out`;
            if (debug) {
              code += `
  console.log("[Template] (${node.id}) loop context: historyStrVar=${historyStrVar}, historyValue=" + ${historyStrVar});`;
            }
            loopSubstitutions = `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{history}}").join("" + (${historyStrVar} || ''));
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{index}}").join("" + (${indexVar} || ''));
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{item}}").join(JSON.stringify(${itemVar}));`;
          }
          const checkForConditionBranch = firstInputVar && (firstInputVar.includes("_out_true") || firstInputVar.includes("_out_false"));
          if (checkForConditionBranch) {
            code += `
  // Check if condition branch input is null (skip template if so)
  ${letOrAssign}${outputVar} = null;
  if (${firstInputVar} === null) {
    console.log("[Template] (${node.id}): skipped (condition branch input is null)");
    workflow_context["${node.id}"] = null;
  } else {`;
            code += `
    console.log("[Template] (${node.id}) === Template Node Start ===");
    let _tmpl_${sanitizedId} = "${template2}";
    console.log("[Template] (${node.id}) raw template length: " + _tmpl_${sanitizedId}.length);`;
            if (loopSubstitutions) {
              code += loopSubstitutions;
            }
            for (const varName of templateVars) {
              const cleanName = varName.replace(/\{\{|\}\}/g, "");
              if (varMap[cleanName]) {
                code += `
    _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{${cleanName}}}").join("" + (${varMap[cleanName]} || ''));`;
              }
            }
            code += `
    _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{input}}").join("" + (${inputVar} || ''));
    ${outputVar} = _tmpl_${sanitizedId};
    console.log("[Template] output (${node.id}): " + ${outputVar}.substring(0, 100));
    workflow_context["${node.id}"] = ${outputVar};
  }`;
          } else {
            code += `
  console.log("[Template] (${node.id}) === Template Node Start ===");
  let _tmpl_${sanitizedId} = "${template2}";
  console.log("[Template] (${node.id}) raw template length: " + _tmpl_${sanitizedId}.length);`;
            if (loopSubstitutions) {
              code += loopSubstitutions;
            }
            for (const varName of templateVars) {
              const cleanName = varName.replace(/\{\{|\}\}/g, "");
              if (varMap[cleanName]) {
                code += `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{${cleanName}}}").join("" + (${varMap[cleanName]} || ''));`;
              }
            }
            code += `
  _tmpl_${sanitizedId} = _tmpl_${sanitizedId}.split("{{input}}").join("" + (${inputVar} || ''));
  ${letOrAssign}${outputVar} = _tmpl_${sanitizedId};
  console.log("[Template] output (${node.id}): " + ${outputVar}.substring(0, 100));
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        case "logic_block": {
          let userCode = String(data.code || data.script || "input");
          userCode = userCode.trim();
          const iifeParams = [];
          const iifeArgs = [];
          let namedInputsSetup = "";
          iifeParams.push("_p_input");
          iifeArgs.push(inputVar);
          namedInputsSetup += `
  let input = _p_input;`;
          for (const [handleId, sourceVar] of inputs) {
            if (handleId !== "default" && handleId !== "input") {
              const paramName = `_p_${handleId}`;
              iifeParams.push(paramName);
              iifeArgs.push(sourceVar);
              namedInputsSetup += `
  let ${handleId} = ${paramName};`;
            }
          }
          if (isInLoop && loopStartId) {
            const sanitizedLoopId = sanitizeId(loopStartId);
            const loopIdxVar = `_i_${sanitizedLoopId}`;
            iifeParams.push("_p_loop_index");
            iifeArgs.push(loopIdxVar);
            namedInputsSetup += `
  let loop_index = _p_loop_index;`;
          }
          const hasReturn = /\breturn\b/.test(userCode);
          const hasAwait = /\bawait\b/.test(userCode);
          const asyncPrefix = hasAwait ? "async " : "";
          const awaitPrefix = hasAwait ? "await " : "";
          if (hasReturn && hasAwait) {
            const transformedCode = userCode.replace(/\breturn\s+([^;]+);/g, `${outputVar} = ($1); break;`).replace(/\breturn\s*;/g, "break;");
            code += `
  // Logic block: inline with await + return (do/while pattern)
  let context = workflow_context;`;
            code += `
  let input = ${inputVar};`;
            for (const [handleId, sourceVar] of inputs) {
              if (handleId !== "default" && handleId !== "input") {
                code += `
  let ${handleId} = ${sourceVar};`;
              }
            }
            if (isInLoop && loopStartId) {
              const sanitizedLoopId = sanitizeId(loopStartId);
              code += `
  let loop_index = _i_${sanitizedLoopId};`;
            }
            code += `
  ${letOrAssign}${outputVar} = null;
  do {
    ${transformedCode}
  } while (false);
  workflow_context["${node.id}"] = ${outputVar};`;
          } else if (hasReturn) {
            code += `
  // Logic block: wrapped in IIFE for proper return behavior
  let context = workflow_context;
  ${letOrAssign}${outputVar} = (function(${iifeParams.join(", ")}) {${namedInputsSetup}
    ${userCode}
  })(${iifeArgs.join(", ")});
  workflow_context["${node.id}"] = ${outputVar};`;
          } else {
            const isSingleExpression = !userCode.includes(";") && !userCode.includes("\n");
            if (isSingleExpression && !hasAwait) {
              code += `
  // Logic block: inline FormLogic execution
  let context = workflow_context;
  let input = ${inputVar};`;
              for (const [handleId, sourceVar] of inputs) {
                if (handleId !== "default" && handleId !== "input") {
                  code += `
  let ${handleId} = ${sourceVar};`;
                }
              }
              if (isInLoop && loopStartId) {
                const sanitizedLoopId = sanitizeId(loopStartId);
                code += `
  let loop_index = _i_${sanitizedLoopId};`;
              }
              code += `
  ${letOrAssign}${outputVar} = ${userCode};
  workflow_context["${node.id}"] = ${outputVar};`;
            } else if (hasAwait) {
              code += `
  // Logic block: multi-statement with await (inline)
  let context = workflow_context;
  let input = ${inputVar};`;
              for (const [handleId, sourceVar] of inputs) {
                if (handleId !== "default" && handleId !== "input") {
                  code += `
  let ${handleId} = ${sourceVar};`;
                }
              }
              if (isInLoop && loopStartId) {
                const sanitizedLoopId = sanitizeId(loopStartId);
                code += `
  let loop_index = _i_${sanitizedLoopId};`;
              }
              code += `
  ${userCode};
  ${letOrAssign}${outputVar} = null;
  workflow_context["${node.id}"] = ${outputVar};`;
            } else {
              code += `
  // Logic block: multi-statement (no return)
  let context = workflow_context;
  ${letOrAssign}${outputVar} = (function(${iifeParams.join(", ")}) {${namedInputsSetup}
    ${userCode};
    return null;
  })(${iifeArgs.join(", ")});
  workflow_context["${node.id}"] = ${outputVar};`;
            }
          }
          break;
        }
        case "memory": {
          const memoryKey = escapeString(String(data.key || "default"));
          const operation = String(data.operation || "get");
          if (operation === "set") {
            code += `
  // Memory set: store value
  console.log("[Memory] (${node.id}) === Memory Set ===");
  console.log("[Memory] (${node.id}) key: ${memoryKey}, input type: " + (typeof ${inputVar}));
  await Agent.set("${memoryKey}", ${inputVar});
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
          } else {
            code += `
  // Memory get: retrieve stored value
  console.log("[Memory] (${node.id}) === Memory Get ===");
  console.log("[Memory] (${node.id}) key: ${memoryKey}");
  ${letOrAssign}${outputVar} = await Agent.get("${memoryKey}");
  console.log("[Memory] (${node.id}) retrieved type: " + (typeof ${outputVar}));
  if (${outputVar} == null) {
    ${outputVar} = ${inputVar}; // Fallback to input if nothing stored
    console.log("[Memory] (${node.id}) using fallback input");
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        case "comfyui_free_memory": {
          const comfyuiUrl = escapeString(String(data.comfyuiUrl || "http://127.0.0.1:8188"));
          const unloadModels = data.unloadModels !== false;
          const freeMemory = data.freeMemory !== false;
          code += `
  // ComfyUI Free Memory: unload models and free GPU memory
  console.log("[ComfyUI Free Memory] (${node.id}) === Freeing GPU Memory ===");
  await Utility.comfyuiFreeMemory(
    "${comfyuiUrl}",
    ${unloadModels},
    ${freeMemory},
    "${node.id}"
  );
  // Pass through the input unchanged
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreUtilityCompiler;

  // ../zipp-core/modules/core-utility/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    LogicBlockNode: () => LogicBlockNode_default,
    MemoryNode: () => MemoryNode_default,
    TemplateNode: () => TemplateNode_default
  });

  // ../zipp-core/modules/core-utility/ui/TemplateNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var TemplateIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" }) });
  function TemplateNode({ data }) {
    const { size, handleResizeStart } = (0, import_zipp_ui_components.useNodeResize)({
      initialWidth: 320,
      initialHeight: 300,
      constraints: { minWidth: 260, maxWidth: 600, minHeight: 250, maxHeight: 600 }
    });
    const inputCount = data.inputCount ?? 2;
    const inputNames = data.inputNames || ["var1", "var2"];
    const onTemplateChangeRef = (0, import_react.useRef)(data.onTemplateChange);
    const onInputCountChangeRef = (0, import_react.useRef)(data.onInputCountChange);
    const onInputNamesChangeRef = (0, import_react.useRef)(data.onInputNamesChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onTemplateChangeRef.current = data.onTemplateChange;
      onInputCountChangeRef.current = data.onInputCountChange;
      onInputNamesChangeRef.current = data.onInputNamesChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleTemplateChange = (0, import_react.useCallback)((e) => {
      onTemplateChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const templateVariables = (0, import_react.useMemo)(() => {
      if (!data.template) return [];
      const matches = data.template.match(/\{\{(\w+)\}\}/g);
      return matches ? [...new Set(matches.map((m) => m.slice(2, -2)))] : [];
    }, [data.template]);
    const handleInputNameChange = (0, import_react.useCallback)((index, name) => {
      const newNames = [...inputNames];
      newNames[index] = name;
      onInputNamesChangeRef.current?.(newNames);
    }, [inputNames]);
    const handleAddInput = (0, import_react.useCallback)(() => {
      if (inputCount < 6) {
        const newCount = inputCount + 1;
        const newNames = [...inputNames, `var${newCount}`];
        onInputCountChangeRef.current?.(newCount);
        onInputNamesChangeRef.current?.(newNames);
      }
    }, [inputCount, inputNames]);
    const handleRemoveInput = (0, import_react.useCallback)(() => {
      if (inputCount > 1) {
        const newCount = inputCount - 1;
        const newNames = inputNames.slice(0, newCount);
        onInputCountChangeRef.current?.(newCount);
        onInputNamesChangeRef.current?.(newNames);
      }
    }, [inputCount, inputNames]);
    const textareaHeight = Math.max(80, size.height - 200);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-amber-400", children: [
        inputCount,
        " vars"
      ] }),
      templateVariables.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "ml-1 text-[10px] font-mono", children: `{{${templateVariables[0]}}}` })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => {
      const standardIds = ["input", "input2", "input3", "input4", "input5"];
      return standardIds.slice(0, inputCount).map((id, index) => ({
        id,
        type: "target",
        position: import_react2.Position.Left,
        color: "!bg-blue-500",
        label: inputNames[index] || id,
        labelColor: "text-blue-400",
        size: "md"
      }));
    }, [inputNames, inputCount]);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "result", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-amber-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-amber-500/30 transition-all",
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
        title: "Template",
        color: "amber",
        icon: TemplateIcon,
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
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Input Variables" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex gap-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleRemoveInput,
                    disabled: inputCount <= 1,
                    className: "w-5 h-5 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-xs",
                    children: "\u2212"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                  "button",
                  {
                    onClick: handleAddInput,
                    disabled: inputCount >= 6,
                    className: "w-5 h-5 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-xs",
                    children: "+"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-col gap-1", children: Array.from({ length: inputCount }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs text-amber-400 focus:outline-none focus:border-amber-500 font-mono",
                value: inputNames[index] || "",
                onChange: (e) => handleInputNameChange(index, e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                placeholder: `var${index + 1}`
              },
              index
            )) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: [
              "Template ",
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "text-slate-600", children: [
                "(use ",
                `{{varName}}`,
                ")"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "textarea",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-amber-500 font-mono",
                style: { height: textareaHeight },
                placeholder: `{"prompt": "{{prompt}}"}`,
                value: data.template || "",
                onChange: handleTemplateChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          templateVariables.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "flex flex-wrap gap-1", children: templateVariables.map((varName) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "span",
            {
              className: `px-1.5 py-0.5 text-[10px] rounded font-mono ${inputNames.includes(varName) ? "bg-green-900/50 text-green-400 border border-green-700" : "bg-red-900/50 text-red-400 border border-red-700"}`,
              children: `{{${varName}}}`
            },
            varName
          )) })
        ] })
      }
    );
  }
  var TemplateNode_default = (0, import_react.memo)(TemplateNode);

  // ../zipp-core/modules/core-utility/ui/LogicBlockNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_react5 = __toESM(require_react3(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  function useDocumentTheme() {
    const [isDark, setIsDark] = (0, import_react3.useState)(
      () => typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    );
    (0, import_react3.useEffect)(() => {
      const observer = new MutationObserver(() => {
        setIsDark(document.documentElement.classList.contains("dark"));
      });
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
      return () => observer.disconnect();
    }, []);
    return isDark;
  }
  var LogicBlockIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-white font-bold text-xs", children: "\u0192" });
  function LogicBlockNode({ data }) {
    const isDarkTheme = useDocumentTheme();
    const { size, handleResizeStart } = (0, import_zipp_ui_components2.useNodeResize)({
      initialWidth: 300,
      initialHeight: 260,
      constraints: { minWidth: 240, maxWidth: 600, minHeight: 200, maxHeight: 600 }
    });
    const inputCount = data.inputCount || 1;
    const inputNames = data.inputNames || ["input"];
    const onCodeChangeRef = (0, import_react3.useRef)(data.onCodeChange);
    const onInputCountChangeRef = (0, import_react3.useRef)(data.onInputCountChange);
    const onInputNamesChangeRef = (0, import_react3.useRef)(data.onInputNamesChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onCodeChangeRef.current = data.onCodeChange;
      onInputCountChangeRef.current = data.onInputCountChange;
      onInputNamesChangeRef.current = data.onInputNamesChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleEditorChange = (0, import_react3.useCallback)((value) => {
      if (value !== void 0) {
        onCodeChangeRef.current?.(value);
      }
    }, []);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleInputNameChange = (0, import_react3.useCallback)((index, name) => {
      const newNames = [...inputNames];
      newNames[index] = name;
      onInputNamesChangeRef.current?.(newNames);
    }, [inputNames]);
    const handleAddInput = (0, import_react3.useCallback)(() => {
      if (inputCount < 6) {
        const newCount = inputCount + 1;
        const newNames = [...inputNames, `var${newCount}`];
        onInputCountChangeRef.current?.(newCount);
        onInputNamesChangeRef.current?.(newNames);
      }
    }, [inputCount, inputNames]);
    const handleRemoveInput = (0, import_react3.useCallback)(() => {
      if (inputCount > 1) {
        const newCount = inputCount - 1;
        const newNames = inputNames.slice(0, newCount);
        onInputCountChangeRef.current?.(newCount);
        onInputNamesChangeRef.current?.(newNames);
      }
    }, [inputCount, inputNames]);
    const editorHeight = Math.max(80, size.height - 180);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-slate-400", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "text-blue-400", children: [
      inputCount,
      " input",
      inputCount > 1 ? "s" : ""
    ] }) });
    const inputHandles = (0, import_react3.useMemo)(() => {
      const standardIds = ["input", "input2", "input3", "input4", "input5"];
      return standardIds.slice(0, inputCount).map((id, index) => ({
        id,
        type: "target",
        position: import_react4.Position.Left,
        color: "!bg-blue-500",
        label: inputNames[index] || id,
        labelColor: "text-blue-400",
        size: "md"
      }));
    }, [inputNames, inputCount]);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "output", type: "source", position: import_react4.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-blue-500/30 transition-all",
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
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Logic Block",
        color: "blue",
        icon: LogicBlockIcon,
        width: size.width,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        resizeHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Input Variables" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex gap-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    onClick: handleRemoveInput,
                    disabled: inputCount <= 1,
                    className: "w-5 h-5 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-xs",
                    children: "\u2212"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    onClick: handleAddInput,
                    disabled: inputCount >= 6,
                    className: "w-5 h-5 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-xs",
                    children: "+"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "flex flex-col gap-1", children: Array.from({ length: inputCount }).map((_, index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-0.5 text-xs text-yellow-400 focus:outline-none focus:border-blue-500 font-mono",
                value: inputNames[index] || "",
                onChange: (e) => handleInputNameChange(index, e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                placeholder: `var${index + 1}`
              },
              index
            )) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
            "div",
            {
              className: "nodrag nowheel border border-slate-300 dark:border-slate-600 rounded overflow-hidden",
              style: { height: editorHeight },
              onMouseDown: (e) => e.stopPropagation(),
              children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                import_react5.default,
                {
                  height: "100%",
                  defaultLanguage: "javascript",
                  value: data.code || "// Transform the inputs\nreturn input;",
                  theme: isDarkTheme ? "vs-dark" : "light",
                  options: {
                    minimap: { enabled: false },
                    lineNumbers: "off",
                    fontSize: 12,
                    scrollBeyondLastLine: false,
                    wordWrap: "on",
                    padding: { top: 8 }
                  },
                  onChange: handleEditorChange
                }
              )
            }
          )
        ] })
      }
    );
  }
  var LogicBlockNode_default = (0, import_react3.memo)(LogicBlockNode);

  // ../zipp-core/modules/core-utility/ui/MemoryNode.tsx
  var import_react6 = __toESM(require_react(), 1);
  var import_react7 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var MemoryIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { className: "w-3 h-3 text-white", fill: "currentColor", viewBox: "0 0 20 20", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3 12v3c0 1.657 3.134 3 7 3s7-1.343 7-3v-3c0 1.657-3.134 3-7 3s-7-1.343-7-3z" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M3 7v3c0 1.657 3.134 3 7 3s7-1.343 7-3V7c0 1.657-3.134 3-7 3S3 8.657 3 7z" }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M17 5c0 1.657-3.134 3-7 3S3 6.657 3 5s3.134-3 7-3 7 1.343 7 3z" })
  ] });
  function MemoryNode({ data }) {
    const [mode, setMode] = (0, import_react6.useState)(data.mode || "read");
    const onModeChangeRef = (0, import_react6.useRef)(data.onModeChange);
    const onKeyChangeRef = (0, import_react6.useRef)(data.onKeyChange);
    const onDefaultValueChangeRef = (0, import_react6.useRef)(data.onDefaultValueChange);
    const onCollapsedChangeRef = (0, import_react6.useRef)(data.onCollapsedChange);
    (0, import_react6.useEffect)(() => {
      onModeChangeRef.current = data.onModeChange;
      onKeyChangeRef.current = data.onKeyChange;
      onDefaultValueChangeRef.current = data.onDefaultValueChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleModeChange = (0, import_react6.useCallback)((newMode) => {
      setMode(newMode);
      onModeChangeRef.current?.(newMode);
    }, []);
    const handleKeyChange = (0, import_react6.useCallback)((e) => {
      onKeyChangeRef.current?.(e.target.value);
    }, []);
    const handleDefaultValueChange = (0, import_react6.useCallback)((e) => {
      onDefaultValueChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react6.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const validationIssues = (0, import_react6.useMemo)(() => {
      const issues = [];
      if (!data.key) {
        issues.push({ field: "Key", message: "Required" });
      }
      return issues;
    }, [data.key]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: mode === "read" ? "text-cyan-400" : "text-orange-400", children: mode.toUpperCase() }),
      data.key && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-1 font-mono text-[10px]", children: data.key })
    ] });
    const inputHandles = (0, import_react6.useMemo)(() => {
      if (mode === "write") {
        return [
          { id: "value", type: "target", position: import_react7.Position.Left, color: "!bg-blue-500", label: "value", labelColor: "text-blue-400", size: "lg" }
        ];
      }
      return [];
    }, [mode]);
    const outputHandles = (0, import_react6.useMemo)(() => [
      { id: "value", type: "source", position: import_react7.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Memory",
        color: "cyan",
        icon: MemoryIcon,
        width: 240,
        collapsedWidth: 130,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Mode" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === "read" ? "bg-cyan-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-600"}`,
                  onClick: () => handleModeChange("read"),
                  children: "Read"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "button",
                {
                  className: `flex-1 px-3 py-1.5 rounded text-sm font-medium transition-colors ${mode === "write" ? "bg-cyan-600 text-white" : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-600"}`,
                  onClick: () => handleModeChange("write"),
                  children: "Write"
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Key Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono",
                placeholder: "my_variable",
                value: data.key || "",
                onChange: handleKeyChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          mode === "read" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Default (if not set)" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                placeholder: "default value",
                value: data.defaultValue || "",
                onChange: handleDefaultValueChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] })
        ] })
      }
    );
  }
  var MemoryNode_default = (0, import_react6.memo)(MemoryNode);

  // ../zipp-core/modules/core-utility/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
