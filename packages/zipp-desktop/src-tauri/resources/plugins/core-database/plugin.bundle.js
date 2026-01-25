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

  // ../zipp-core/modules/core-database/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-database/runtime.ts
  var ctx;
  async function execute(operation, collection, data, queryJson, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[Database] Aborted by user before operation");
      return { success: false, error: "Operation aborted by user" };
    }
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Database] ${operation} on ${collection}`);
    if (!ctx.database) {
      ctx.onNodeStatus?.(nodeId, "error");
      ctx.log("error", "[Database] Database not available in runtime context");
      return { success: false, error: "Database not available" };
    }
    let query;
    if (queryJson) {
      try {
        query = JSON.parse(queryJson);
      } catch {
        ctx.log("warn", "[Database] Invalid query JSON, ignoring");
      }
    }
    try {
      let result;
      switch (operation.toLowerCase()) {
        case "insert": {
          if (!data) {
            result = { success: false, error: "Insert requires data" };
            break;
          }
          let dataObj;
          if (typeof data === "object" && data !== null) {
            dataObj = data;
          } else {
            dataObj = { value: data };
          }
          const id = await ctx.database.insertDocument(collection, dataObj);
          result = {
            success: true,
            data,
            insertedId: id,
            rowsAffected: 1
          };
          break;
        }
        case "query":
        case "select": {
          const docs = await ctx.database.findDocuments(collection, query);
          result = {
            success: true,
            data: docs.map((doc) => ({
              id: doc.id,
              ...doc.data,
              _created: doc.created_at
            }))
          };
          break;
        }
        case "update": {
          if (!data || !query?.id) {
            result = { success: false, error: "Update requires data and query.id" };
            break;
          }
          let dataObj;
          if (typeof data === "object" && data !== null) {
            dataObj = data;
          } else {
            dataObj = { value: data };
          }
          const updated = await ctx.database.updateDocument(String(query.id), dataObj);
          result = {
            success: true,
            data,
            rowsAffected: updated ? 1 : 0
          };
          break;
        }
        case "delete": {
          if (!query?.id) {
            result = { success: false, error: "Delete requires query.id" };
            break;
          }
          const deleted = await ctx.database.deleteDocument(String(query.id));
          result = {
            success: true,
            rowsAffected: deleted ? 1 : 0
          };
          break;
        }
        default:
          result = { success: false, error: `Unknown operation: ${operation}` };
      }
      if (result.success) {
        ctx.onNodeStatus?.(nodeId, "completed");
        ctx.log("success", `[Database] ${operation} completed`);
      } else {
        ctx.onNodeStatus?.(nodeId, "error");
        ctx.log("error", `[Database] ${operation} failed: ${result.error}`);
      }
      return result;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Database] ${operation} failed: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
  var CoreDatabaseRuntime = {
    name: "Database",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Database] Module initialized");
    },
    methods: {
      execute
    },
    async cleanup() {
      ctx?.log?.("info", "[Database] Module cleanup");
    }
  };
  var runtime_default = CoreDatabaseRuntime;

  // ../zipp-core/modules/core-database/compiler.ts
  var CoreDatabaseCompiler = {
    name: "Database",
    getNodeTypes() {
      return ["database", "database_query"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      if (nodeType === "database") {
        const inputVar = inputs.get("default") || inputs.get("input") || inputs.get("data") || "null";
        const collection = escapeString(String(data.collection_name || data.collectionName || data.table || "default"));
        const code = `
  // --- Node: ${node.id} (database - store) ---
  ${letOrAssign}${outputVar} = null;
  // Skip insert if data is empty/null/undefined
  if (${inputVar} && ${inputVar} !== "") {
    ${outputVar} = await Database.execute(
      "insert",
      "${collection}",
      ${inputVar},
      "{}",
      "${node.id}"
    );
    if (${outputVar} === "__ABORT__") {
      console.log("[Workflow] aborted");
      return workflow_context;
    }
  } else {
    console.log("[Database] (${node.id}) skipping insert - no data");
    ${outputVar} = { success: true, skipped: true };
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      if (nodeType === "database_query") {
        const filterInput = inputs.get("default") || inputs.get("input") || inputs.get("filter");
        const filterJson = escapeString(String(data.filterJson || data.filter_json || "{}"));
        const collection = escapeString(String(data.collectionName || data.collection_name || "default"));
        let filterVar;
        if (filterInput) {
          filterVar = `JSON.stringify(${filterInput} || {})`;
        } else {
          filterVar = `"${filterJson}"`;
        }
        const code = `
  // --- Node: ${node.id} (database - query) ---
  ${letOrAssign}${outputVar} = await Database.execute(
    "query",
    "${collection}",
    null,
    ${filterVar},
    "${node.id}"
  );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  // Extract the data array from the result
  ${outputVar} = ${outputVar}?.data || [];
  workflow_context["${node.id}"] = ${outputVar};`;
        return code;
      }
      return null;
    }
  };
  var compiler_default = CoreDatabaseCompiler;

  // ../zipp-core/modules/core-database/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    DatabaseNode: () => DatabaseNode_default,
    DatabaseQueryNode: () => DatabaseQueryNode_default
  });

  // ../zipp-core/modules/core-database/ui/DatabaseNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var DatabaseIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" }) });
  function DatabaseNode({ data }) {
    const onCollectionNameChangeRef = (0, import_react.useRef)(data.onCollectionNameChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onCollectionNameChangeRef.current = data.onCollectionNameChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollectionNameChange = (0, import_react.useCallback)((e) => {
      onCollectionNameChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-400", children: data.collectionName ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-emerald-400 font-mono text-[10px]", children: data.collectionName }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "italic text-slate-500", children: "No name" }) });
    const inputHandles = (0, import_react.useMemo)(() => [
      { id: "data", type: "target", position: import_react2.Position.Left, color: "!bg-blue-500", size: "lg" }
    ], []);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "result", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "Store Data",
        color: "emerald",
        icon: DatabaseIcon,
        width: 200,
        collapsedWidth: 120,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Collection Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 font-mono",
                placeholder: "my_data",
                value: data.collectionName || "",
                onChange: handleCollectionNameChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px]", children: "Stores any JSON data to the collection" })
        ] })
      }
    );
  }
  var DatabaseNode_default = (0, import_react.memo)(DatabaseNode);

  // ../zipp-core/modules/core-database/ui/DatabaseQueryNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var DatabaseIcon2 = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" }) });
  function DatabaseQueryNode({ data }) {
    const onCollectionNameChangeRef = (0, import_react3.useRef)(data.onCollectionNameChange);
    const onFilterJsonChangeRef = (0, import_react3.useRef)(data.onFilterJsonChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onCollectionNameChangeRef.current = data.onCollectionNameChange;
      onFilterJsonChangeRef.current = data.onFilterJsonChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollectionNameChange = (0, import_react3.useCallback)((e) => {
      onCollectionNameChangeRef.current?.(e.target.value);
    }, []);
    const handleFilterJsonChange = (0, import_react3.useCallback)((e) => {
      onFilterJsonChangeRef.current?.(e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-slate-400", children: data.collectionName ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-blue-400 font-mono text-[10px]", children: data.collectionName }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "italic text-slate-500", children: "No name" }) });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "filter", type: "target", position: import_react4.Position.Left, color: "!bg-orange-500", size: "lg" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "result", type: "source", position: import_react4.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Read Data",
        color: "blue",
        icon: DatabaseIcon2,
        width: 200,
        collapsedWidth: 120,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Collection Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 font-mono",
                placeholder: "my_data",
                value: data.collectionName || "",
                onChange: handleCollectionNameChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filter (JSON)" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 font-mono",
                placeholder: "{}",
                value: data.filterJson || "",
                onChange: handleFilterJsonChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[10px]", children: "Reads data from the collection. Connect a filter or use JSON." })
        ] })
      }
    );
  }
  var DatabaseQueryNode_default = (0, import_react3.memo)(DatabaseQueryNode);

  // ../zipp-core/modules/core-database/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
