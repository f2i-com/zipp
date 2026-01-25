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

  // ../zipp-core/modules/core-flow-control/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-flow-control/runtime.ts
  var ctx;
  var callStack = [];
  var MAX_RECURSION_DEPTH = 10;
  async function execute(flowId, input, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Subflow] Running flow: ${flowId}`);
    if (!ctx.runSubflow) {
      ctx.onNodeStatus?.(nodeId, "error");
      ctx.log("error", "[Subflow] No subflow callback configured in runtime context");
      return `Error: No subflow callback configured`;
    }
    if (callStack.includes(flowId)) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Recursive subflow detected: ${flowId}`);
    }
    if (callStack.length >= MAX_RECURSION_DEPTH) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Maximum subflow depth (${MAX_RECURSION_DEPTH}) exceeded`);
    }
    try {
      callStack.push(flowId);
      const inputs = typeof input === "object" && input !== null ? input : { input };
      const result = await ctx.runSubflow(flowId, inputs);
      callStack.pop();
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Subflow] Completed: ${flowId}`);
      return result;
    } catch (error) {
      callStack.pop();
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Subflow] Failed: ${errMsg}`);
      throw error;
    }
  }
  function checkAborted() {
    return ctx.abortSignal?.aborted ?? false;
  }
  async function executeMacro(workflowId, inputs, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Macro] Running macro workflow: ${workflowId}`);
    ctx.log("info", `[Macro] DEBUG: inputs received = ${JSON.stringify(inputs).substring(0, 500)}`);
    if (!ctx.runSubflow) {
      ctx.onNodeStatus?.(nodeId, "error");
      ctx.log("error", "[Macro] No subflow callback configured in runtime context");
      throw new Error("No subflow callback configured");
    }
    const stackKey = `macro:${workflowId}`;
    if (callStack.includes(stackKey)) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Recursive macro detected: ${workflowId}`);
    }
    if (callStack.length >= MAX_RECURSION_DEPTH) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error(`Maximum macro depth (${MAX_RECURSION_DEPTH}) exceeded`);
    }
    try {
      callStack.push(stackKey);
      const macroContext = {
        __macro_inputs__: inputs
      };
      ctx.log("info", `[Macro] DEBUG: macroContext = ${JSON.stringify(macroContext).substring(0, 500)}`);
      const result = await ctx.runSubflow(workflowId, macroContext);
      callStack.pop();
      const outputs = result?.__macro_outputs__ || result || {};
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Macro] Completed: ${workflowId}`);
      return outputs;
    } catch (error) {
      callStack.pop();
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Macro] Failed: ${errMsg}`);
      throw error;
    }
  }
  var CoreFlowControlRuntime = {
    name: "Subflow",
    async init(context) {
      ctx = context;
      callStack.length = 0;
      ctx?.log?.("info", "[Core Flow Control] Module initialized");
    },
    methods: {
      execute,
      executeMacro,
      checkAborted
    },
    async cleanup() {
      callStack.length = 0;
      ctx?.log?.("info", "[Core Flow Control] Module cleanup");
    }
  };
  var runtime_default = CoreFlowControlRuntime;

  // ../zipp-core/modules/core-flow-control/compiler.ts
  var CoreFlowControlCompiler = {
    name: "FlowControl",
    getNodeTypes() {
      return ["loop_start", "loop_end", "condition", "output", "subflow", "macro_input", "macro_output", "macro"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString, debugEnabled } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const debug = debugEnabled ?? false;
      const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("input_0") || inputs.get("result") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "loop_start":
          code += `
  // Loop start - main structure handled by compiler`;
          return code;
        case "loop_end":
          code += `
  // Loop end - main structure handled by compiler`;
          return code;
        case "condition": {
          const conditionType = String(data.operator || data.conditionType || "contains");
          const conditionValue = escapeString(String(data.compareValue || data.conditionValue || ""));
          const conditionField = escapeString(String(data.conditionField || ""));
          code += `
  // Condition evaluation (operator: ${conditionType}, compareValue: ${conditionValue})
  let _cond_val_${sanitizedId} = ${inputVar};
  let _cond_result_${sanitizedId} = false;`;
          switch (conditionType) {
            case "contains":
              code += `
  if (typeof _cond_val_${sanitizedId} === 'string' && _cond_val_${sanitizedId}.indexOf("${conditionValue}") >= 0) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "not_contains":
              code += `
  if (typeof _cond_val_${sanitizedId} !== 'string' || _cond_val_${sanitizedId}.indexOf("${conditionValue}") < 0) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "equals":
              code += `
  if (String(_cond_val_${sanitizedId}) === "${conditionValue}") {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "not_equals":
              code += `
  if (String(_cond_val_${sanitizedId}) !== "${conditionValue}") {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "starts_with":
              code += `
  if (typeof _cond_val_${sanitizedId} === 'string' && _cond_val_${sanitizedId}.startsWith("${conditionValue}")) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "ends_with":
              code += `
  if (typeof _cond_val_${sanitizedId} === 'string' && _cond_val_${sanitizedId}.endsWith("${conditionValue}")) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "greater":
            case "greater_than":
              code += `
  if (parseFloat(_cond_val_${sanitizedId}) > parseFloat("${conditionValue}")) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "less":
            case "less_than":
              code += `
  if (parseFloat(_cond_val_${sanitizedId}) < parseFloat("${conditionValue}")) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "is_empty":
              code += `
  if (_cond_val_${sanitizedId} === null || _cond_val_${sanitizedId} === undefined || (typeof _cond_val_${sanitizedId} === 'string' && _cond_val_${sanitizedId}.trim() === '')) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "not_empty":
            case "is_not_empty":
              code += `
  if (_cond_val_${sanitizedId} !== null && _cond_val_${sanitizedId} !== undefined && (typeof _cond_val_${sanitizedId} !== 'string' || _cond_val_${sanitizedId}.trim() !== '')) {
    _cond_result_${sanitizedId} = true;
  }`;
              break;
            case "json_field":
              code += `
  try {
    let _json_${sanitizedId} = typeof _cond_val_${sanitizedId} === 'string' ? JSON.parse(_cond_val_${sanitizedId}) : _cond_val_${sanitizedId};
    if (_json_${sanitizedId} && String(_json_${sanitizedId}["${conditionField}"]) === "${conditionValue}") {
      _cond_result_${sanitizedId} = true;
    }
  } catch(e) { _cond_result_${sanitizedId} = false; }`;
              break;
            case "regex":
              code += `
  try {
    const _regex_pattern_${sanitizedId} = "${conditionValue}";
    if (_regex_pattern_${sanitizedId}.length > 500) {
      console.warn("[Condition] Regex pattern too long, skipping");
      _cond_result_${sanitizedId} = false;
    } else {
      let _regex_${sanitizedId} = new RegExp(_regex_pattern_${sanitizedId});
      if (_regex_${sanitizedId}.test(String(_cond_val_${sanitizedId}))) {
        _cond_result_${sanitizedId} = true;
      }
    }
  } catch(e) {
    console.warn("[Condition] Invalid regex pattern: " + e.message);
    _cond_result_${sanitizedId} = false;
  }`;
              break;
          }
          const branchLetOrAssign = ctx2.isInLoop ? "" : "let ";
          code += `
  ${letOrAssign}${outputVar} = ${inputVar};
  console.log("[Condition] (${node.id}): result=" + _cond_result_${sanitizedId});
  ${branchLetOrAssign}${outputVar}_true = _cond_result_${sanitizedId} ? ${inputVar} : null;
  ${branchLetOrAssign}${outputVar}_false = _cond_result_${sanitizedId} ? null : ${inputVar};
  console.log("[Condition] (${node.id}): true=" + (${outputVar}_true ? "has value" : "null") + ", false=" + (${outputVar}_false ? "has value" : "null"));
  workflow_context["${node.id}"] = _cond_result_${sanitizedId};`;
          break;
        }
        case "output": {
          const label = escapeString(String(data.label || "Output"));
          const outputType = String(data.outputType || "text");
          const isInsideLoop = ctx2.isInLoop || false;
          if (isInsideLoop) {
            code += `
  // Workflow output: ${label} (inside loop - accumulating)
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};
  // Accumulate outputs in array when inside loop
  if (!workflow_context["__output__"] || !Array.isArray(workflow_context["__output__"])) {
    workflow_context["__output__"] = [];
  }
  workflow_context["__output__"].push(${outputVar});
  workflow_context["__output_type__"] = "${outputType}";
  console.log("[Output] (${label}): accumulated " + workflow_context["__output__"].length + " results");`;
          } else {
            code += `
  // Workflow output: ${label}
  ${letOrAssign}${outputVar} = ${inputVar};
  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["__output__"] = ${outputVar};
  workflow_context["__output_type__"] = "${outputType}";
  console.log("[Output] (${label}): " + (typeof ${outputVar} === 'string' ? "string length " + ${outputVar}.length : "type " + typeof ${outputVar}));`;
          }
          break;
        }
        case "subflow": {
          const flowId = escapeString(String(data.flowId || ""));
          const inputMappings = data.inputMappings || [];
          const inputCount = Number(data.inputCount) || 1;
          if (!flowId) {
            code += `
  console.log("[Subflow]: No flow ID specified");
  ${letOrAssign}${outputVar} = ${inputVar};`;
          } else {
            const inputParts = [];
            for (let i = 0; i < inputCount; i++) {
              const handleId = `input_${i}`;
              const mapping = inputMappings.find((m) => m.handleId === handleId);
              const sourceVar = inputs.get(handleId) || (i === 0 ? inputVar : "null");
              if (mapping && mapping.targetNodeId) {
                inputParts.push(`"${mapping.targetNodeId}": ${sourceVar}`);
              } else if (i === 0) {
                inputParts.push(`"input": ${sourceVar}`);
              }
            }
            const inputObj = inputParts.length > 0 ? `{${inputParts.join(", ")}}` : inputVar;
            code += `
  // Execute subflow with mapped inputs
  let _subflow_input_${sanitizedId} = ${inputObj};
  console.log("[Subflow] (${node.id}) INPUT to ${flowId}: " + JSON.stringify(_subflow_input_${sanitizedId}).substring(0, 300));
  ${letOrAssign}${outputVar} = await Subflow.execute("${flowId}", _subflow_input_${sanitizedId}, "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        case "macro_input": {
          const inputName = escapeString(String(data.name || "input"));
          const defaultValue = escapeString(String(data.defaultValue || ""));
          code += `
  // Macro Input: ${inputName}${debug ? `
  console.log("[MacroInput] (${inputName}) DEBUG: workflow_context keys = " + Object.keys(workflow_context || {}).join(", "));
  console.log("[MacroInput] (${inputName}) DEBUG: __macro_inputs__ = " + JSON.stringify(workflow_context["__macro_inputs__"] || "NOT SET").substring(0, 300));` : ""}
  ${letOrAssign}${outputVar} = workflow_context["__macro_inputs__"]?.["${inputName}"];${debug ? `
  console.log("[MacroInput] (${inputName}) DEBUG: raw value = " + JSON.stringify(${outputVar}).substring(0, 200));` : ""}
  if (${outputVar} === undefined || ${outputVar} === null) {${debug ? `
    console.log("[MacroInput] (${inputName}) DEBUG: using default value: ${defaultValue}");` : ""}
    ${outputVar} = "${defaultValue}" || null;
  }
  console.log("[MacroInput] (${inputName}): " + (typeof ${outputVar} === 'string' ? ${outputVar}.substring(0, 100) : typeof ${outputVar}));
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "macro_output": {
          const outputName = escapeString(String(data.name || "output"));
          const valueVar = inputs.get("value") || inputVar;
          code += `
  // Macro Output: ${outputName}
  ${letOrAssign}${outputVar} = ${valueVar};
  if (!workflow_context["__macro_outputs__"]) {
    workflow_context["__macro_outputs__"] = {};
  }
  workflow_context["__macro_outputs__"]["${outputName}"] = ${outputVar};
  console.log("[MacroOutput] (${outputName}): " + (typeof ${outputVar} === 'string' ? ${outputVar}.substring(0, 100) : typeof ${outputVar}));
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "macro": {
          const macroWorkflowId = escapeString(String(data._macroWorkflowId || ""));
          const macroName = escapeString(String(data._macroName || "unnamed"));
          const macroInputs = data._macroInputs || [];
          const macroOutputs = data._macroOutputs || [];
          if (!macroWorkflowId) {
            code += `
  console.log("[Macro]: No macro workflow specified - node needs to be re-added from palette");
  ${letOrAssign}${outputVar} = null;`;
          } else {
            const inputDebug = [];
            const inputParts = [];
            for (const input of macroInputs) {
              const sourceVar = inputs.get(input.id) || "null";
              inputDebug.push(`${input.id}(${input.name})=${sourceVar}`);
              inputParts.push(`"${escapeString(input.name)}": ${sourceVar}`);
            }
            const inputObj = inputParts.length > 0 ? `{${inputParts.join(", ")}}` : "{}";
            code += `
  // Execute macro workflow: ${macroWorkflowId}${debug ? `
  // DEBUG: Macro inputs mapping: ${inputDebug.join(", ")}
  // DEBUG: Available inputs map keys: ${Array.from(inputs.keys()).join(", ") || "NONE"}` : ""}
  let _macro_input_${sanitizedId} = ${inputObj};
  console.log("[Macro] (${node.id}) Executing macro with inputs: " + JSON.stringify(_macro_input_${sanitizedId}).substring(0, 500));
  ${letOrAssign}${outputVar} = await Subflow.executeMacro("${macroWorkflowId}", _macro_input_${sanitizedId}, "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
            for (const output of macroOutputs) {
              const outputSafeId = output.id.replace(/[^a-zA-Z0-9_]/g, "_");
              code += `
  let ${outputVar}_${outputSafeId} = ${outputVar}?.["${escapeString(output.name)}"] ?? null;`;
            }
          }
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreFlowControlCompiler;

  // ../zipp-core/modules/core-flow-control/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    ConditionNode: () => ConditionNode_default,
    LoopEndNode: () => LoopEndNode_default,
    LoopStartNode: () => LoopStartNode_default,
    MacroInputNode: () => MacroInputNode_default,
    MacroNode: () => MacroNode_default,
    MacroOutputNode: () => MacroOutputNode_default,
    OutputNode: () => OutputNode_default,
    SubflowNode: () => SubflowNode_default
  });

  // ../zipp-core/modules/core-flow-control/ui/LoopStartNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var LOOP_MODES = [
    { value: "count", label: "Count", description: "Run N times" },
    { value: "foreach", label: "For Each", description: "Iterate array" },
    { value: "while_true", label: "While True", description: "Run until stop condition" }
  ];
  var LoopIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z" })
  ] });
  function LoopStartNode({ data }) {
    const onIterationsChangeRef = (0, import_react.useRef)(data.onIterationsChange);
    const onLoopModeChangeRef = (0, import_react.useRef)(data.onLoopModeChange);
    const onLoopNameChangeRef = (0, import_react.useRef)(data.onLoopNameChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onIterationsChangeRef.current = data.onIterationsChange;
      onLoopModeChangeRef.current = data.onLoopModeChange;
      onLoopNameChangeRef.current = data.onLoopNameChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleLoopNameChange = (0, import_react.useCallback)((e) => {
      onLoopNameChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const loopMode = data.loopMode || "count";
    const rawIterations = data.iterations ?? 3;
    const maxIterations = 100;
    const iterations = Math.max(1, Math.min(maxIterations, rawIterations));
    const isWarning = loopMode === "count" && rawIterations > 20;
    const showBodyProperties = data.showBodyProperties !== false;
    const validationIssues = (0, import_react.useMemo)(() => {
      const issues = [];
      if (!data.loopName) {
        issues.push({ field: "Name", message: "Helps identify loops" });
      }
      return issues;
    }, [data.loopName]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-400", children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `font-mono text-[10px] ${loopMode === "while_true" ? "text-purple-400" : "text-amber-400"}`, children: [
      loopMode === "count" && `FOR 1..${iterations}`,
      loopMode === "foreach" && "FOR EACH",
      loopMode === "while_true" && "WHILE TRUE"
    ] }) });
    const inputHandles = (0, import_react.useMemo)(() => {
      if (loopMode === "count") {
        return [
          { id: "count", type: "target", position: import_react2.Position.Left, color: "!bg-amber-500", label: "count", labelColor: "text-amber-400", size: "md" }
        ];
      }
      return [
        { id: "array", type: "target", position: import_react2.Position.Left, color: "!bg-blue-500", label: "array", labelColor: "text-blue-400", size: "md" }
      ];
    }, [loopMode]);
    const outputHandles = (0, import_react.useMemo)(() => {
      const handles = [
        { id: "item", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", label: loopMode === "foreach" ? "item" : "i", labelColor: "text-green-400", size: "lg" }
      ];
      if (loopMode === "foreach") {
        handles.push({ id: "index", type: "source", position: import_react2.Position.Right, color: "!bg-amber-500", label: "index", labelColor: "text-amber-400", size: "sm" });
      }
      return handles;
    }, [loopMode]);
    const bottomHandles = (0, import_react.useMemo)(() => [
      { id: "loop", type: "source", position: import_react2.Position.Bottom, color: "!bg-amber-500", label: "loop end", labelColor: "text-amber-400", size: "lg" }
    ], []);
    const title = data.loopName ? `Loop: ${data.loopName}` : "Loop Start";
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title,
        color: "amber",
        icon: LoopIcon,
        width: 200,
        collapsedWidth: 130,
        status: data._status,
        validationIssues,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        bottomHandles,
        children: showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 font-mono",
                placeholder: "main, outer...",
                value: data.loopName || "",
                onChange: handleLoopNameChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Mode" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500",
                value: loopMode,
                onChange: (e) => onLoopModeChangeRef.current?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation(),
                children: LOOP_MODES.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: mode.value, children: mode.label }, mode.value))
              }
            )
          ] }),
          loopMode === "count" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Iterations" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "number",
                min: 1,
                max: 50,
                className: `nodrag nowheel w-full bg-white dark:bg-slate-900 border rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none font-mono ${isWarning ? "border-orange-500 focus:border-orange-400" : "border-slate-300 dark:border-slate-600 focus:border-amber-500"}`,
                value: iterations,
                onChange: (e) => {
                  const val = parseInt(e.target.value) || 1;
                  onIterationsChangeRef.current?.(Math.max(1, Math.min(50, val)));
                },
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          loopMode === "while_true" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Max Iterations" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "number",
                min: 1,
                max: 1e3,
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-purple-500 font-mono",
                value: iterations,
                onChange: (e) => {
                  const val = parseInt(e.target.value) || 100;
                  onIterationsChangeRef.current?.(Math.max(1, Math.min(1e3, val)));
                },
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] })
        ] })
      }
    );
  }
  var LoopStartNode_default = (0, import_react.memo)(LoopStartNode);

  // ../zipp-core/modules/core-flow-control/ui/LoopEndNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var STOP_CONDITIONS = [
    { value: "none", label: "Run All Iterations", description: "No early stop" },
    { value: "contains", label: "Result Contains", description: "Stop when result contains text" },
    { value: "equals", label: "Result Equals", description: "Stop when result equals value" },
    { value: "starts_with", label: "Result Starts With", description: "Stop when result starts with text" },
    { value: "json_field", label: "JSON Field Equals", description: "Stop when JSON field equals value" }
  ];
  var LoopEndIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "w-4 h-4 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" })
  ] });
  function LoopEndNode({ data }) {
    const resultCount = data.collectedResults?.length ?? 0;
    const stopCondition = data.stopCondition || "none";
    const onStopConditionChangeRef = (0, import_react3.useRef)(data.onStopConditionChange);
    const onStopValueChangeRef = (0, import_react3.useRef)(data.onStopValueChange);
    const onStopFieldChangeRef = (0, import_react3.useRef)(data.onStopFieldChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onStopConditionChangeRef.current = data.onStopConditionChange;
      onStopValueChangeRef.current = data.onStopValueChange;
      onStopFieldChangeRef.current = data.onStopFieldChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleStopConditionChange = (0, import_react3.useCallback)((e) => {
      onStopConditionChangeRef.current?.(e.target.value);
    }, []);
    const handleStopValueChange = (0, import_react3.useCallback)((e) => {
      onStopValueChangeRef.current?.(e.target.value);
    }, []);
    const handleStopFieldChange = (0, import_react3.useCallback)((e) => {
      onStopFieldChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const showStopValue = stopCondition !== "none";
    const showStopField = stopCondition === "json_field";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: stopCondition !== "none" ? "text-purple-400" : "text-amber-400", children: stopCondition !== "none" ? "WHEN DONE" : "END FOR" }),
      resultCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: "ml-1 text-[10px]", children: [
        "(",
        resultCount,
        ")"
      ] })
    ] });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "loop", type: "target", position: import_react4.Position.Top, color: "!bg-amber-500", label: "loop", labelColor: "text-amber-400", size: "md" },
      { id: "input", type: "target", position: import_react4.Position.Left, color: "!bg-blue-500", size: "lg" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "results", type: "source", position: import_react4.Position.Right, color: "!bg-green-500", label: "[ ]", labelColor: "text-green-400", size: "lg" }
    ], []);
    const titleExtra = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      data.loopName && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "px-1.5 py-0.5 bg-amber-800 text-amber-300 text-[10px] rounded font-mono", children: data.loopName }),
      resultCount > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "ml-auto px-1.5 py-0.5 bg-amber-900 text-amber-400 text-[10px] rounded", children: resultCount })
    ] });
    const showBodyProperties = data.showBodyProperties !== false;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Loop End",
        color: "amber",
        icon: LoopEndIcon,
        width: 220,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        titleExtra,
        children: showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Stop When" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "select",
              {
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500",
                value: stopCondition,
                onChange: handleStopConditionChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: STOP_CONDITIONS.map((cond) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: cond.value, children: cond.label }, cond.value))
              }
            )
          ] }),
          showStopField && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Field Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 font-mono",
                placeholder: "status, done, complete",
                value: data.stopField || "",
                onChange: handleStopFieldChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          showStopValue && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: stopCondition === "json_field" ? "Field Value" : "Stop Value" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500 font-mono",
                placeholder: stopCondition === "json_field" ? "true, done, complete" : "DONE, finished, complete",
                value: data.stopValue || "",
                onChange: handleStopValueChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[10px]", children: stopCondition === "none" ? "Collects results from each iteration into an array." : "Stops loop early when condition is met." })
        ] })
      }
    );
  }
  var LoopEndNode_default = (0, import_react3.memo)(LoopEndNode);

  // ../zipp-core/modules/core-flow-control/ui/ConditionNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var operators = [
    { value: "equals", label: "== (equals)" },
    { value: "not_equals", label: "!= (not equals)" },
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "not contains" },
    { value: "greater", label: "> (greater)" },
    { value: "less", label: "< (less)" },
    { value: "greater_eq", label: ">= (greater or eq)" },
    { value: "less_eq", label: "<= (less or eq)" },
    { value: "is_empty", label: "is empty" },
    { value: "not_empty", label: "is not empty" }
  ];
  var ConditionIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-4 h-4 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) });
  function ConditionNode({ data }) {
    const onOperatorChangeRef = (0, import_react5.useRef)(data.onOperatorChange);
    const onCompareValueChangeRef = (0, import_react5.useRef)(data.onCompareValueChange);
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onOperatorChangeRef.current = data.onOperatorChange;
      onCompareValueChangeRef.current = data.onCompareValueChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const operator = data.operator ?? "equals";
    const needsCompareValue = !["is_empty", "not_empty"].includes(operator);
    const showBodyProperties = data.showBodyProperties !== false;
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const operatorLabel = operators.find((op) => op.value === operator)?.label || operator;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-cyan-400", children: "IF" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-1 text-[10px] font-mono", children: operatorLabel.split(" ")[0] })
    ] });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "input", type: "target", position: import_react6.Position.Left, color: "!bg-blue-500", label: "value", labelColor: "text-blue-400", size: "lg" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "true", type: "source", position: import_react6.Position.Right, color: "!bg-green-500", label: "true", labelColor: "text-green-400", size: "md" },
      { id: "false", type: "source", position: import_react6.Position.Right, color: "!bg-red-500", label: "false", labelColor: "text-red-400", size: "md" }
    ], []);
    const titleExtra = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "ml-auto px-1.5 py-0.5 bg-cyan-900 text-cyan-400 text-[10px] rounded", children: "IF" });
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Condition",
        color: "cyan",
        icon: ConditionIcon,
        width: 260,
        collapsedWidth: 120,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        titleExtra,
        children: [
          showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Operator" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                  value: operator,
                  onChange: (e) => onOperatorChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation(),
                  children: operators.map((op) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: op.value, children: op.label }, op.value))
                }
              )
            ] }),
            needsCompareValue && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Compare To" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 font-mono",
                  placeholder: "value to compare...",
                  value: data.compareValue || "",
                  onChange: (e) => onCompareValueChangeRef.current?.(e.target.value),
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-500 text-[10px]", children: "Routes to True or False output based on condition." })
        ]
      }
    );
  }
  var ConditionNode_default = (0, import_react5.memo)(ConditionNode);

  // ../zipp-core/modules/core-flow-control/ui/OutputNode.tsx
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react2(), 1);
  var import_zipp_ui_components4 = __toESM(require_zipp_ui_components(), 1);
  var import_zipp_core = __toESM(require_zipp_core(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var isSafeUrl = (url) => {
    if (!url || typeof url !== "string") return false;
    const trimmed = url.trim().toLowerCase();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("data:image/") || trimmed.startsWith("data:video/") || trimmed.startsWith("data:audio/") || trimmed.startsWith("blob:");
  };
  var isImageUrl = (url) => {
    if (!isSafeUrl(url)) return false;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "blob:", "data:"].includes(parsed.protocol)) return false;
    } catch {
      if (!url.startsWith("data:image/")) return false;
    }
    return url.includes("/view?filename=") && /\.(png|jpg|jpeg|gif|webp)/i.test(url) || /\.(png|jpg|jpeg|gif|webp)(\?|$)/i.test(url) || url.startsWith("data:image/");
  };
  var isVideoUrl = (url) => {
    if (!isSafeUrl(url)) return false;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "blob:", "data:"].includes(parsed.protocol)) return false;
    } catch {
      if (!url.startsWith("data:video/")) return false;
    }
    return url.includes("/view?filename=") && /\.(mp4|webm|mov|avi)/i.test(url) || /\.(mp4|webm|mov|avi)(\?|$)/i.test(url) || url.startsWith("data:video/");
  };
  var isAudioUrl = (url) => {
    if (!isSafeUrl(url)) return false;
    try {
      const parsed = new URL(url);
      if (!["http:", "https:", "blob:", "data:"].includes(parsed.protocol)) return false;
    } catch {
      if (!url.startsWith("data:audio/")) return false;
    }
    return /\.(wav|mp3|ogg|flac|m4a|aac)(\?|$)/i.test(url) || url.startsWith("data:audio/");
  };
  var isAudioPath = (value) => {
    if (!value || typeof value !== "string") return false;
    const isFilePath = /^([A-Z]:[\\]|\/)/.test(value);
    if (!isFilePath) return false;
    return /\.(wav|mp3|ogg|flac|m4a|aac)$/i.test(value);
  };
  var isVideoPath = (value) => {
    if (!value || typeof value !== "string") return false;
    const isFilePath = /^([A-Z]:[\\/]|\/)/i.test(value);
    if (!isFilePath) return false;
    return /\.(mp4|webm|mov|avi|mkv)$/i.test(value);
  };
  var OutputIcon = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-white", fill: "currentColor", viewBox: "0 0 20 20", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { fillRule: "evenodd", d: "M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z", clipRule: "evenodd" }) });
  function OutputNode({ data }) {
    const { size, handleResizeStart } = (0, import_zipp_ui_components4.useNodeResize)({
      initialWidth: 280,
      initialHeight: 260,
      constraints: { minWidth: 220, maxWidth: 600, minHeight: 200, maxHeight: 800 }
    });
    const [selectedImageIndex, setSelectedImageIndex] = (0, import_react7.useState)(0);
    const [imageErrors, setImageErrors] = (0, import_react7.useState)(/* @__PURE__ */ new Set());
    const [copyFeedback, setCopyFeedback] = (0, import_react7.useState)(null);
    const copyTimeoutRef = (0, import_react7.useRef)(null);
    const onCollapsedChangeRef = (0, import_react7.useRef)(data.onCollapsedChange);
    (0, import_react7.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    (0, import_react7.useEffect)(() => {
      return () => {
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      };
    }, []);
    const handleCollapsedChange = (0, import_react7.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const extractDisplayValue = (v) => {
      if (v === null || v === void 0) return null;
      if (typeof v === "string") return v;
      if (typeof v === "object" && v !== null) {
        const obj = v;
        if (typeof obj.video === "string") return obj.video;
        if (typeof obj.audio === "string") return obj.audio;
        if (typeof obj.path === "string") return obj.path;
        return JSON.stringify(v);
      }
      return String(v);
    };
    const outputArray = Array.isArray(data.outputValue) ? data.outputValue.map(extractDisplayValue).filter((v) => v !== null && v !== "") : data.outputValue ? [extractDisplayValue(data.outputValue)].filter((v) => v !== null && v !== "") : [];
    const hasOutput = outputArray.length > 0;
    const isMultiple = outputArray.length > 1;
    (0, import_react7.useEffect)(() => {
      if (outputArray.length > 0) {
        setSelectedImageIndex((prev) => prev >= outputArray.length ? 0 : prev);
      }
    }, [outputArray.length]);
    (0, import_react7.useEffect)(() => {
      setImageErrors(/* @__PURE__ */ new Set());
    }, [data.outputValue]);
    const isImageArray = hasOutput && outputArray.every(isImageUrl);
    const isSingleImage = hasOutput && !isMultiple && isImageUrl(outputArray[0]);
    const isVideoArray = hasOutput && outputArray.every((v) => isVideoUrl(v) || isVideoPath(v));
    const isSingleVideo = hasOutput && !isMultiple && (isVideoUrl(outputArray[0]) || isVideoPath(outputArray[0]));
    const isAudioArray = hasOutput && outputArray.every((v) => isAudioUrl(v) || isAudioPath(v));
    const isSingleAudio = hasOutput && !isMultiple && (isAudioUrl(outputArray[0]) || isAudioPath(outputArray[0]));
    const safeIndex = Math.min(selectedImageIndex, Math.max(0, outputArray.length - 1));
    const displayValue = isMultiple ? outputArray[safeIndex] || "" : outputArray[0] || "";
    const handleCopy = async () => {
      if (hasOutput) {
        const textContent = Array.isArray(data.outputValue) ? JSON.stringify(data.outputValue, null, 2) : typeof data.outputValue === "object" ? JSON.stringify(data.outputValue, null, 2) : String(data.outputValue || "");
        try {
          await navigator.clipboard.writeText(textContent);
          setCopyFeedback("success");
          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => setCopyFeedback(null), 2e3);
        } catch {
          setCopyFeedback("error");
          if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => setCopyFeedback(null), 3e3);
        }
      }
    };
    const handleSave = async () => {
      if (!hasOutput) return;
      if (isVideoArray || isSingleVideo) {
        let savedCount = 0;
        let failedCount = 0;
        for (let i = 0; i < outputArray.length; i++) {
          const videoUrl = outputArray[i];
          if (!isSafeUrl(videoUrl)) continue;
          try {
            const response = await fetch(videoUrl);
            const blob = await response.blob();
            let ext = "mp4";
            const urlMatch = videoUrl.match(/\.(mp4|webm|mov|avi)/i);
            if (urlMatch) {
              ext = urlMatch[1].toLowerCase();
            } else if (blob.type.includes("webm")) {
              ext = "webm";
            } else if (blob.type.includes("avi")) {
              ext = "avi";
            }
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            const suffix = outputArray.length > 1 ? `_${i + 1}` : "";
            a.download = `${data.label || "output"}${suffix}.${ext}`;
            a.click();
            URL.revokeObjectURL(blobUrl);
            savedCount++;
            if (i < outputArray.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch (err) {
            console.error(`Failed to download video ${i + 1}:`, err);
            failedCount++;
          }
        }
        if (data.onShowToast) {
          if (failedCount === 0) {
            const msg = savedCount === 1 ? "Video saved to Downloads" : `${savedCount} videos saved to Downloads`;
            data.onShowToast(msg, "success");
          } else if (savedCount === 0) {
            data.onShowToast("Failed to save videos", "error");
          } else {
            data.onShowToast(`Saved ${savedCount} videos, ${failedCount} failed`, "warning");
          }
        }
      } else if (isImageArray || isSingleImage) {
        let savedCount = 0;
        let failedCount = 0;
        for (let i = 0; i < outputArray.length; i++) {
          const imageUrl = outputArray[i];
          if (!isSafeUrl(imageUrl)) continue;
          try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            let ext = "png";
            const urlMatch = imageUrl.match(/\.(png|jpg|jpeg|gif|webp)/i);
            if (urlMatch) {
              ext = urlMatch[1].toLowerCase();
            } else if (blob.type.includes("jpeg") || blob.type.includes("jpg")) {
              ext = "jpg";
            } else if (blob.type.includes("gif")) {
              ext = "gif";
            } else if (blob.type.includes("webp")) {
              ext = "webp";
            }
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            const suffix = outputArray.length > 1 ? `_${i + 1}` : "";
            a.download = `${data.label || "output"}${suffix}.${ext}`;
            a.click();
            URL.revokeObjectURL(blobUrl);
            savedCount++;
            if (i < outputArray.length - 1) {
              await new Promise((resolve) => setTimeout(resolve, 200));
            }
          } catch (err) {
            console.error(`Failed to download image ${i + 1}:`, err);
            failedCount++;
          }
        }
        if (data.onShowToast) {
          if (failedCount === 0) {
            const msg = savedCount === 1 ? "Image saved to Downloads" : `${savedCount} images saved to Downloads`;
            data.onShowToast(msg, "success");
          } else if (savedCount === 0) {
            data.onShowToast("Failed to save images", "error");
          } else {
            data.onShowToast(`Saved ${savedCount} images, ${failedCount} failed`, "warning");
          }
        }
      } else {
        const textContent = Array.isArray(data.outputValue) ? JSON.stringify(data.outputValue, null, 2) : typeof data.outputValue === "object" ? JSON.stringify(data.outputValue, null, 2) : String(data.outputValue || "");
        const blob = new Blob([textContent], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.label || "output"}.txt`;
        a.click();
        URL.revokeObjectURL(url);
        if (data.onShowToast) {
          data.onShowToast(`Saved ${data.label || "output"}.txt to Downloads`, "success");
        }
      }
    };
    const contentHeight = Math.max(60, size.height - 160);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "text-slate-400", children: hasOutput ? isVideoArray || isSingleVideo ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "text-orange-400", children: [
      "Video",
      isMultiple ? ` (${outputArray.length})` : ""
    ] }) : isImageArray || isSingleImage ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "text-pink-400", children: [
      "Image",
      isMultiple ? ` (${outputArray.length})` : ""
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "truncate text-[10px]", children: [
      displayValue.substring(0, 40),
      "..."
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "italic text-slate-500", children: "Waiting..." }) });
    const inputHandles = (0, import_react7.useMemo)(() => [
      { id: "result", type: "target", position: import_react8.Position.Left, color: "!bg-blue-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-emerald-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-emerald-500/30 transition-all",
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
        title: "Output",
        color: "emerald",
        icon: OutputIcon,
        width: size.width,
        collapsedWidth: 140,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        resizeHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Label" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500",
                placeholder: "final_result",
                value: data.label || "",
                onChange: (e) => data.onLabelChange?.(e.target.value),
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Result" }),
            isVideoArray || isSingleVideo ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                className: "bg-slate-100 dark:bg-slate-900 border border-orange-600 rounded overflow-hidden",
                style: { height: contentHeight },
                children: (() => {
                  const isPath = isVideoPath(displayValue);
                  const videoSrc = isPath ? (0, import_zipp_core.pathToMediaUrl)(displayValue) : displayValue;
                  const isValidSrc = isSafeUrl(displayValue) || isPath;
                  return isValidSrc ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "video",
                    {
                      src: videoSrc,
                      controls: true,
                      className: "w-full h-full object-contain",
                      onError: () => setImageErrors((prev) => /* @__PURE__ */ new Set([...prev, 0]))
                    },
                    displayValue
                  ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "flex items-center justify-center h-full text-slate-500 text-xs p-2", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "truncate", children: displayValue }) });
                })()
              }
            ) : isImageArray || isSingleImage ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                className: "bg-slate-100 dark:bg-slate-900 border border-emerald-600 rounded overflow-hidden",
                style: { height: contentHeight },
                children: isMultiple ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "grid grid-cols-2 gap-1 p-1 overflow-auto h-full", children: outputArray.map((url, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    onClick: () => setSelectedImageIndex(index),
                    className: `relative aspect-square rounded border overflow-hidden ${index === safeIndex ? "border-pink-500 ring-1 ring-pink-500/50" : "border-slate-300 dark:border-slate-600"}`,
                    children: imageErrors.has(index) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "w-full h-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-500", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-xs", children: "Error" }) }) : isSafeUrl(url) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      "img",
                      {
                        src: url,
                        alt: `Image ${index + 1}`,
                        className: "w-full h-full object-cover",
                        onError: () => setImageErrors((prev) => /* @__PURE__ */ new Set([...prev, index]))
                      }
                    ) : null
                  },
                  `img-${index}`
                )) }) : isSafeUrl(displayValue) ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "img",
                  {
                    src: displayValue,
                    alt: "Output",
                    className: "w-full h-full object-contain",
                    onError: () => setImageErrors((prev) => /* @__PURE__ */ new Set([...prev, 0]))
                  }
                ) : null
              }
            ) : isAudioArray || isSingleAudio ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                className: "bg-slate-100 dark:bg-slate-900 border border-teal-600 rounded overflow-hidden p-3",
                style: { minHeight: 60 },
                children: isMultiple ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "space-y-2 overflow-auto max-h-32", children: outputArray.map((audioPath, index) => {
                  const audioSrc = isAudioPath(audioPath) ? `asset://localhost/${encodeURIComponent(audioPath).replace(/%5C/g, "/").replace(/%3A/g, ":")}` : audioPath;
                  const fileName = audioPath.split(/[\\/]/).pop() || `Audio ${index + 1}`;
                  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2 bg-slate-200/50 dark:bg-slate-800/50 p-2 rounded", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      "audio",
                      {
                        controls: true,
                        className: "h-8 flex-1",
                        style: { filter: "invert(1) hue-rotate(180deg)" },
                        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("source", { src: audioSrc, type: "audio/wav" })
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-[10px] text-slate-400 truncate max-w-[80px]", children: fileName })
                  ] }, `audio-${index}`);
                }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    "audio",
                    {
                      controls: true,
                      className: "h-8 flex-1",
                      style: { filter: "invert(1) hue-rotate(180deg)" },
                      children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                        "source",
                        {
                          src: isAudioPath(displayValue) ? `asset://localhost/${encodeURIComponent(displayValue).replace(/%5C/g, "/").replace(/%3A/g, ":")}` : displayValue,
                          type: "audio/wav"
                        }
                      )
                    },
                    displayValue
                  ),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-[10px] text-slate-400 truncate max-w-[80px]", children: displayValue.split(/[\\/]/).pop() })
                ] })
              }
            ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "textarea",
              {
                readOnly: true,
                value: hasOutput ? Array.isArray(data.outputValue) ? JSON.stringify(data.outputValue, null, 2) : typeof data.outputValue === "object" ? JSON.stringify(data.outputValue, null, 2) : String(data.outputValue || "") : "",
                placeholder: "Waiting for execution...",
                style: { height: contentHeight },
                className: `nodrag nowheel w-full bg-white dark:bg-slate-900 border rounded px-2 py-2 text-xs font-mono resize-none ${hasOutput ? "border-emerald-600 text-emerald-400 dark:text-emerald-300" : "border-slate-300 dark:border-slate-700 text-slate-500"}`,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          hasOutput && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex gap-1.5", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                onClick: handleCopy,
                className: `flex-1 px-2 py-1.5 text-xs rounded flex items-center justify-center gap-1 ${copyFeedback === "success" ? "bg-green-700 text-white" : copyFeedback === "error" ? "bg-red-700 text-white" : "bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300"}`,
                children: copyFeedback === "success" ? "Copied!" : copyFeedback === "error" ? "Failed" : "Copy"
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                onClick: handleSave,
                className: "flex-1 px-2 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs rounded",
                children: "Save"
              }
            )
          ] })
        ] })
      }
    );
  }
  var OutputNode_default = (0, import_react7.memo)(OutputNode);

  // ../zipp-core/modules/core-flow-control/ui/SubflowNode.tsx
  var import_react9 = __toESM(require_react(), 1);
  var import_react10 = __toESM(require_react2(), 1);
  var import_zipp_ui_components5 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
  var SubflowIcon = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" }) });
  function SubflowNode({ data }) {
    const nodeData = data;
    const {
      flowId,
      flowName,
      inputMappings = [],
      inputCount = 1,
      _status,
      _collapsed,
      onFlowSelect,
      onInputMappingsChange,
      onInputCountChange,
      availableFlows = []
    } = nodeData;
    const onCollapsedChangeRef = (0, import_react9.useRef)(nodeData.onCollapsedChange);
    const onInputMappingsChangeRef = (0, import_react9.useRef)(onInputMappingsChange);
    const onInputCountChangeRef = (0, import_react9.useRef)(onInputCountChange);
    (0, import_react9.useEffect)(() => {
      onCollapsedChangeRef.current = nodeData.onCollapsedChange;
      onInputMappingsChangeRef.current = onInputMappingsChange;
      onInputCountChangeRef.current = onInputCountChange;
    });
    const handleCollapsedChange = (0, import_react9.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleMappingChange = (0, import_react9.useCallback)((handleId, targetNodeId) => {
      const existingIndex = inputMappings.findIndex((m) => m.handleId === handleId);
      let newMappings;
      if (targetNodeId === "") {
        newMappings = inputMappings.filter((m) => m.handleId !== handleId);
      } else if (existingIndex >= 0) {
        newMappings = [...inputMappings];
        newMappings[existingIndex] = { handleId, targetNodeId };
      } else {
        newMappings = [...inputMappings, { handleId, targetNodeId }];
      }
      onInputMappingsChangeRef.current?.(newMappings);
    }, [inputMappings]);
    const handleInputCountChange = (0, import_react9.useCallback)((newCount) => {
      const clampedCount = Math.max(1, Math.min(10, newCount));
      onInputCountChangeRef.current?.(clampedCount);
      const validHandleIds = Array.from({ length: clampedCount }, (_, i) => `input_${i}`);
      const filteredMappings = inputMappings.filter((m) => validHandleIds.includes(m.handleId));
      if (filteredMappings.length !== inputMappings.length) {
        onInputMappingsChangeRef.current?.(filteredMappings);
      }
    }, [inputMappings]);
    const selectedFlow = availableFlows.find((f) => f.id === flowId);
    const targetNodes = (0, import_react9.useMemo)(() => {
      if (!selectedFlow) return [];
      return selectedFlow.graph.nodes.filter((n) => n.type === "input_text" || n.type === "input_file" || n.type === "template").map((n) => ({
        id: n.id,
        type: n.type,
        label: n.data.label || n.data.value?.substring(0, 20) || n.id
      }));
    }, [selectedFlow]);
    const inputHandleNames = (0, import_react9.useMemo)(() => {
      return Array.from({ length: inputCount }, (_, i) => `input_${i}`);
    }, [inputCount]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "text-slate-400", children: selectedFlow ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-cyan-400 truncate", children: selectedFlow.name }) : flowName ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-yellow-400 text-[10px]", children: "Missing" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "italic text-slate-500", children: "None" }) });
    const inputHandles = (0, import_react9.useMemo)(() => {
      return inputHandleNames.map((name, i) => ({
        id: name,
        type: "target",
        position: import_react10.Position.Left,
        color: "!bg-cyan-500",
        size: "md",
        label: inputCount > 1 ? `in${i}` : void 0
      }));
    }, [inputHandleNames, inputCount]);
    const outputHandles = (0, import_react9.useMemo)(() => [
      { id: "output", type: "source", position: import_react10.Position.Right, color: "!bg-cyan-500", size: "lg" }
    ], []);
    const getMappingForHandle = (handleId) => {
      return inputMappings.find((m) => m.handleId === handleId)?.targetNodeId || "";
    };
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      import_zipp_ui_components5.CollapsibleNodeWrapper,
      {
        title: "Subflow",
        color: "cyan",
        icon: SubflowIcon,
        width: 260,
        collapsedWidth: 120,
        status: _status,
        isCollapsed: _collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: nodeData.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
          availableFlows.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Select Flow" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
              "select",
              {
                value: flowId || "",
                onChange: (e) => onFlowSelect?.(e.target.value),
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500",
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: "Select a flow..." }),
                  availableFlows.map((flow) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: flow.id, children: flow.name }, flow.id))
                ]
              }
            )
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "text-xs text-slate-500 italic", children: "No other flows available" }),
          selectedFlow && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "mt-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1.5", children: "Inputs" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-3", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    onClick: () => handleInputCountChange(inputCount - 1),
                    disabled: inputCount <= 1,
                    className: "nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-lg font-medium",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: "\u2212"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-sm text-slate-700 dark:text-slate-300 w-6 text-center font-medium", children: inputCount }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                  "button",
                  {
                    onClick: () => handleInputCountChange(inputCount + 1),
                    disabled: inputCount >= 10,
                    className: "nodrag w-8 h-8 flex items-center justify-center bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-slate-700 dark:text-slate-300 text-lg font-medium",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: "+"
                  }
                )
              ] })
            ] }),
            targetNodes.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "mt-3 space-y-1.5", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { className: "text-slate-400 text-xs block", children: "Mappings" }),
              inputHandleNames.map((handleId, i) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-1.5 min-w-0", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: "text-[10px] text-cyan-400 w-5 flex-shrink-0 font-medium", children: [
                  "in",
                  i
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 text-slate-500 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 7l5 5m0 0l-5 5m5-5H6" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                  "select",
                  {
                    value: getMappingForHandle(handleId),
                    onChange: (e) => handleMappingChange(handleId, e.target.value),
                    className: "nodrag nowheel flex-1 min-w-0 px-1.5 py-1 text-[11px] bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-cyan-500 truncate",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: "", children: i === 0 ? "Default" : "None" }),
                      targetNodes.map((node) => /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("option", { value: node.id, children: node.label }, node.id))
                    ]
                  }
                )
              ] }, handleId))
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2 mt-3 pt-2 border-t border-slate-300 dark:border-slate-700", children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-1 text-[10px] text-slate-500", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
                  selectedFlow.graph.nodes.length,
                  " nodes"
                ] })
              ] }),
              selectedFlow.localOnly && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-1 text-[10px] text-green-400", children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" }) }),
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: "Local" })
              ] })
            ] })
          ] }),
          flowName && !selectedFlow && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-yellow-900/30 border border-yellow-600/50 rounded text-yellow-400 text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { children: [
              'Flow "',
              flowName,
              '" not found'
            ] })
          ] })
        ] })
      }
    );
  }
  var SubflowNode_default = (0, import_react9.memo)(SubflowNode);

  // ../zipp-core/modules/core-flow-control/ui/MacroInputNode.tsx
  var import_react11 = __toESM(require_react(), 1);
  var import_react12 = __toESM(require_react2(), 1);
  var import_zipp_ui_components6 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime6 = __toESM(require_jsx_runtime(), 1);
  var MacroInputIcon = /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" }) });
  var typeColors = {
    any: "!bg-slate-400",
    text: "!bg-emerald-500",
    number: "!bg-amber-500",
    image: "!bg-pink-500",
    video: "!bg-blue-500",
    audio: "!bg-purple-500",
    file: "!bg-orange-500"
  };
  function MacroInputNode({ data }) {
    const nodeData = data;
    const nodeId = (0, import_react12.useNodeId)();
    const { updateNodeData } = (0, import_react12.useReactFlow)();
    const onCollapsedChangeRef = (0, import_react11.useRef)(nodeData.onCollapsedChange);
    (0, import_react11.useEffect)(() => {
      onCollapsedChangeRef.current = nodeData.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react11.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleNameChange = (0, import_react11.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { name: e.target.value });
    }, [nodeId, updateNodeData]);
    const handleTypeChange = (0, import_react11.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { inputType: e.target.value });
    }, [nodeId, updateNodeData]);
    const handleDefaultChange = (0, import_react11.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { defaultValue: e.target.value });
    }, [nodeId, updateNodeData]);
    const handleRequiredChange = (0, import_react11.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { required: e.target.checked });
    }, [nodeId, updateNodeData]);
    const name = nodeData.name || "input";
    const inputType = nodeData.inputType || "any";
    const defaultValue = nodeData.defaultValue || "";
    const required = nodeData.required !== false;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "text-violet-400 font-medium", children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: "ml-1 text-slate-500", children: [
        "(",
        inputType,
        ")"
      ] })
    ] });
    const outputHandles = (0, import_react11.useMemo)(() => [
      {
        id: "value",
        type: "source",
        position: import_react12.Position.Right,
        color: typeColors[inputType] || "!bg-slate-400",
        size: "lg",
        label: name
      }
    ], [inputType, name]);
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      import_zipp_ui_components6.CollapsibleNodeWrapper,
      {
        title: "Macro Input",
        color: "violet",
        icon: MacroInputIcon,
        width: 200,
        collapsedWidth: 120,
        status: nodeData._status,
        isCollapsed: nodeData._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles: [],
        outputHandles,
        children: nodeData.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(import_jsx_runtime6.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Input Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "text",
                value: name,
                onChange: handleNameChange,
                placeholder: "input",
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Type" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
              "select",
              {
                value: inputType,
                onChange: handleTypeChange,
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "any", children: "Any" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "text", children: "Text" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "number", children: "Number" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "image", children: "Image" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "video", children: "Video" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "audio", children: "Audio" }),
                  /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("option", { value: "file", children: "File" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Default Value" }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "text",
                value: defaultValue,
                onChange: handleDefaultChange,
                placeholder: "(optional)",
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                type: "checkbox",
                id: `required-${nodeId}`,
                checked: required,
                onChange: handleRequiredChange,
                className: "nodrag w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-violet-500 focus:ring-violet-500",
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("label", { htmlFor: `required-${nodeId}`, className: "text-slate-600 dark:text-slate-400 text-xs", children: "Required" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-violet-900/20 border border-violet-800/30 rounded text-xs text-violet-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: "Defines a macro input port" })
          ] })
        ] })
      }
    );
  }
  var MacroInputNode_default = (0, import_react11.memo)(MacroInputNode);

  // ../zipp-core/modules/core-flow-control/ui/MacroOutputNode.tsx
  var import_react13 = __toESM(require_react(), 1);
  var import_react14 = __toESM(require_react2(), 1);
  var import_zipp_ui_components7 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime7 = __toESM(require_jsx_runtime(), 1);
  var MacroOutputIcon = /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" }) });
  var typeColors2 = {
    any: "!bg-slate-400",
    text: "!bg-emerald-500",
    number: "!bg-amber-500",
    image: "!bg-pink-500",
    video: "!bg-blue-500",
    audio: "!bg-purple-500",
    file: "!bg-orange-500"
  };
  function MacroOutputNode({ data }) {
    const nodeData = data;
    const nodeId = (0, import_react14.useNodeId)();
    const { updateNodeData } = (0, import_react14.useReactFlow)();
    const onCollapsedChangeRef = (0, import_react13.useRef)(nodeData.onCollapsedChange);
    (0, import_react13.useEffect)(() => {
      onCollapsedChangeRef.current = nodeData.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react13.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleNameChange = (0, import_react13.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { name: e.target.value });
    }, [nodeId, updateNodeData]);
    const handleTypeChange = (0, import_react13.useCallback)((e) => {
      if (nodeId) updateNodeData(nodeId, { outputType: e.target.value });
    }, [nodeId, updateNodeData]);
    const name = nodeData.name || "output";
    const outputType = nodeData.outputType || "any";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "text-violet-400 font-medium", children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: "ml-1 text-slate-500", children: [
        "(",
        outputType,
        ")"
      ] })
    ] });
    const inputHandles = (0, import_react13.useMemo)(() => [
      {
        id: "value",
        type: "target",
        position: import_react14.Position.Left,
        color: typeColors2[outputType] || "!bg-slate-400",
        size: "lg",
        label: name
      }
    ], [outputType, name]);
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      import_zipp_ui_components7.CollapsibleNodeWrapper,
      {
        title: "Macro Output",
        color: "violet",
        icon: MacroOutputIcon,
        width: 200,
        collapsedWidth: 120,
        status: nodeData._status,
        isCollapsed: nodeData._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles: [],
        children: nodeData.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
              "input",
              {
                type: "text",
                value: name,
                onChange: handleNameChange,
                placeholder: "output",
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Type" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
              "select",
              {
                value: outputType,
                onChange: handleTypeChange,
                className: "nodrag nowheel w-full px-2 py-1.5 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded text-slate-800 dark:text-slate-200 focus:outline-none focus:border-violet-500",
                onMouseDown: (e) => e.stopPropagation(),
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "any", children: "Any" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "text", children: "Text" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "number", children: "Number" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "image", children: "Image" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "video", children: "Video" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "audio", children: "Audio" }),
                  /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("option", { value: "file", children: "File" })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-violet-900/20 border border-violet-800/30 rounded text-xs text-violet-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { children: "Defines a macro output port" })
          ] })
        ] })
      }
    );
  }
  var MacroOutputNode_default = (0, import_react13.memo)(MacroOutputNode);

  // ../zipp-core/modules/core-flow-control/ui/MacroNode.tsx
  var import_react15 = __toESM(require_react(), 1);
  var import_react16 = __toESM(require_react2(), 1);
  var import_zipp_ui_components8 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime8 = __toESM(require_jsx_runtime(), 1);
  var typeColors3 = {
    any: "!bg-slate-400",
    text: "!bg-emerald-500",
    number: "!bg-amber-500",
    image: "!bg-pink-500",
    video: "!bg-blue-500",
    audio: "!bg-purple-500",
    file: "!bg-orange-500"
  };
  var defaultColors = {
    violet: "violet",
    purple: "purple",
    blue: "blue",
    cyan: "cyan",
    emerald: "emerald",
    amber: "amber",
    rose: "pink",
    // rose maps to pink
    pink: "pink"
  };
  var MacroIcon = /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" }) });
  function MacroNode({ data }) {
    const nodeData = data;
    const onCollapsedChangeRef = (0, import_react15.useRef)(nodeData.onCollapsedChange);
    (0, import_react15.useEffect)(() => {
      onCollapsedChangeRef.current = nodeData.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react15.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const macroName = nodeData._macroName || "Macro";
    const macroDescription = nodeData._macroDescription || "";
    const macroColor = nodeData._macroColor || "violet";
    const macroInputs = nodeData._macroInputs || [];
    const macroOutputs = nodeData._macroOutputs || [];
    const inputHandles = (0, import_react15.useMemo)(() => {
      return macroInputs.map((input, index) => ({
        id: input.id,
        type: "target",
        position: import_react16.Position.Left,
        color: typeColors3[input.type] || "!bg-slate-400",
        size: "lg",
        label: input.name,
        // Offset handles vertically if multiple
        style: macroInputs.length > 1 ? { top: `${25 + index * 25}%` } : void 0
      }));
    }, [macroInputs]);
    const outputHandles = (0, import_react15.useMemo)(() => {
      return macroOutputs.map((output, index) => ({
        id: output.id,
        type: "source",
        position: import_react16.Position.Right,
        color: typeColors3[output.type] || "!bg-slate-400",
        size: "lg",
        label: output.name,
        // Offset handles vertically if multiple
        style: macroOutputs.length > 1 ? { top: `${25 + index * 25}%` } : void 0
      }));
    }, [macroOutputs]);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "text-violet-400", children: [
        macroInputs.length,
        " in"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "mx-1", children: "\u2192" }),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "text-violet-400", children: [
        macroOutputs.length,
        " out"
      ] })
    ] });
    const maxInputLabelLength = Math.max(...macroInputs.map((i) => i.name.length), 0);
    const maxOutputLabelLength = Math.max(...macroOutputs.map((o) => o.name.length), 0);
    const calculatedWidth = Math.max(200, 100 + (maxInputLabelLength + maxOutputLabelLength) * 6);
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      import_zipp_ui_components8.CollapsibleNodeWrapper,
      {
        title: macroName,
        color: defaultColors[macroColor] || "violet",
        icon: MacroIcon,
        width: Math.min(calculatedWidth, 320),
        collapsedWidth: 130,
        status: nodeData._status,
        isCollapsed: nodeData._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: nodeData.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(import_jsx_runtime8.Fragment, { children: [
          macroDescription && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "text-slate-600 dark:text-slate-400 text-xs", children: macroDescription }),
          macroInputs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-500 text-[10px] uppercase tracking-wide", children: "Inputs" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "mt-1 space-y-1", children: macroInputs.map((input) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "div",
                {
                  className: `w-2 h-2 rounded-full ${typeColors3[input.type]?.replace("!", "") || "bg-slate-400"}`
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "text-slate-300", children: input.name }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "text-slate-500", children: [
                "(",
                input.type,
                ")"
              ] }),
              input.required && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "text-red-400 text-[10px]", children: "*" })
            ] }, input.id)) })
          ] }),
          macroOutputs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("label", { className: "text-slate-500 text-[10px] uppercase tracking-wide", children: "Outputs" }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "mt-1 space-y-1", children: macroOutputs.map((output) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2 text-xs", children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                "div",
                {
                  className: `w-2 h-2 rounded-full ${typeColors3[output.type]?.replace("!", "") || "bg-slate-400"}`
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "text-slate-300", children: output.name }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("span", { className: "text-slate-500", children: [
                "(",
                output.type,
                ")"
              ] })
            ] }, output.id)) })
          ] }),
          nodeData.onEditMacro && /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
            "button",
            {
              onClick: () => nodeData.onEditMacro?.(),
              className: "nodrag w-full flex items-center justify-center gap-2 px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-xs text-slate-700 dark:text-slate-300 transition-colors",
              onMouseDown: (e) => e.stopPropagation(),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-3 h-3", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }) }),
                "Edit Macro"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-violet-900/20 border border-violet-800/30 rounded text-xs text-violet-300", children: [
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { children: "Macro" })
          ] })
        ] })
      }
    );
  }
  var MacroNode_default = (0, import_react15.memo)(MacroNode);

  // ../zipp-core/modules/core-flow-control/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
