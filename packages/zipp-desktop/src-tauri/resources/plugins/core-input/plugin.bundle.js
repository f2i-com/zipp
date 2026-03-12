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

  // ../zipp-core/modules/core-input/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-input/runtime.ts
  var ctx;
  async function readInputFile(filePath, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[InputFile] Aborted by user before reading file");
      throw new Error("Operation aborted by user");
    }
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[InputFile] Reading: ${filePath}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for file operations");
    }
    try {
      const fileName = filePath.split(/[/\\]/).pop() || "";
      const ext = fileName.split(".").pop()?.toLowerCase() || "";
      let fileType = "text";
      if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) {
        fileType = "image";
      } else if (["mp4", "webm", "avi", "mov", "mkv"].includes(ext)) {
        fileType = "video";
      } else if (["mp3", "wav", "ogg", "flac"].includes(ext)) {
        fileType = "audio";
      } else if (["pdf"].includes(ext)) {
        fileType = "pdf";
      } else if (["json", "xml", "csv", "txt", "md"].includes(ext)) {
        fileType = "text";
      }
      let fileContent;
      if (fileType === "image" || fileType === "video" || fileType === "audio" || fileType === "pdf") {
        const result = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
          path: filePath,
          readAs: "base64"
        });
        fileContent = result.content;
      } else {
        const result = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
          path: filePath,
          readAs: "text"
        });
        fileContent = result.content;
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[InputFile] Read ${fileContent.length} chars from ${fileName}`);
      return {
        fileName,
        fileType,
        fileContent,
        filePath
      };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[InputFile] Failed: ${errMsg}`);
      throw error;
    }
  }
  async function pickFile(filters, nodeId) {
    if (nodeId) ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", "[InputFile] Opening file picker");
    if (!ctx.tauri) {
      if (nodeId) ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for file picker");
    }
    try {
      const result = await ctx.tauri.invoke("plugin:zipp-filesystem|pick_file", { filters });
      if (nodeId) ctx.onNodeStatus?.(nodeId, "completed");
      return result;
    } catch (error) {
      if (nodeId) ctx.onNodeStatus?.(nodeId, "error");
      throw error;
    }
  }
  async function pickFolder(nodeId) {
    if (nodeId) ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", "[InputFile] Opening folder picker");
    if (!ctx.tauri) {
      if (nodeId) ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for folder picker");
    }
    try {
      const result = await ctx.tauri.invoke("plugin:zipp-filesystem|pick_folder", {});
      if (nodeId) ctx.onNodeStatus?.(nodeId, "completed");
      return result;
    } catch (error) {
      if (nodeId) ctx.onNodeStatus?.(nodeId, "error");
      throw error;
    }
  }
  var CoreInputRuntime = {
    name: "Input",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Input] Module initialized");
    },
    methods: {
      readInputFile,
      pickFile,
      pickFolder
    },
    async cleanup() {
      ctx?.log?.("info", "[Input] Module cleanup");
    }
  };
  var runtime_default = CoreInputRuntime;

  // ../zipp-core/modules/core-input/compiler.ts
  var CoreInputCompiler = {
    name: "Input",
    getNodeTypes() {
      return ["input_text", "input_file", "input_video", "input_folder", "input_audio"];
    },
    compileNode(nodeType, ctx2) {
      const { node, outputVar, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "input_text": {
          const nodeLabel = String(data.label || "").toLowerCase().replace(/\s+/g, "_");
          const nodeId = node.id;
          const defaultValue = JSON.stringify(data.value || "");
          code += `
  ${letOrAssign}${outputVar} = (__inputs["${nodeId}"] != null ? __inputs["${nodeId}"] : (__inputs["${nodeLabel}"] != null ? __inputs["${nodeLabel}"] : (__inputs["input"] != null ? __inputs["input"] : ${defaultValue})));
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "input_file": {
          const fileContent = data.content || data.fileContent || data.dataUrl || "";
          const filePath = String(data.filePath || "");
          const fileType = String(data.fileType || "");
          if (fileContent) {
            code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(fileContent)};
  console.log("[InputFile] (${node.id}) embedded content, length:", ${outputVar}.length);
  workflow_context["${node.id}"] = ${outputVar};`;
          } else if (filePath) {
            const escapedPath = escapeString(filePath);
            const isImage = fileType === "image_ref" || fileType === "image" || /\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(filePath);
            if (isImage) {
              const ext = filePath.toLowerCase().split(".").pop() || "png";
              const mimeMap = {
                png: "image/png",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                gif: "image/gif",
                webp: "image/webp",
                bmp: "image/bmp",
                svg: "image/svg+xml"
              };
              const mime = mimeMap[ext] || "image/png";
              code += `
  console.log("[InputFile] (${node.id}) reading image file: ${escapedPath}");
  ${letOrAssign}${outputVar} = await FileSystem.readFile("${escapedPath}", "base64", "${node.id}");
  console.log("[InputFile] (${node.id}) read result:", ${outputVar} ? "loaded " + ${outputVar}.length + " chars" : "null/empty");
  if (${outputVar} && !${outputVar}.startsWith("data:")) {
    ${outputVar} = "data:${mime};base64," + ${outputVar};
  }
  workflow_context["${node.id}"] = ${outputVar};`;
            } else {
              code += `
  console.log("[InputFile] (${node.id}) reading text file: ${escapedPath}");
  ${letOrAssign}${outputVar} = await FileSystem.readFile("${escapedPath}", "text", "${node.id}");
  console.log("[InputFile] (${node.id}) read result:", ${outputVar} ? "loaded " + ${outputVar}.length + " chars" : "null/empty");
  workflow_context["${node.id}"] = ${outputVar};`;
            }
          } else {
            code += `
  ${letOrAssign}${outputVar} = "";
  console.log("[InputFile] (${node.id}) no file path or content configured");
  workflow_context["${node.id}"] = ${outputVar};`;
          }
          break;
        }
        case "input_video": {
          const videoPath = data.filePath || "";
          code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(videoPath)};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "input_folder": {
          const path = escapeString(String(data.path || ""));
          const recursive = data.recursive !== false;
          const includePatterns = escapeString(String(data.includePatterns || "*"));
          const maxFiles = Number(data.maxFiles) || 1e3;
          code += `
  ${letOrAssign}${outputVar} = await FileSystem.listFolder("${path}", ${recursive}, "${includePatterns}", ${maxFiles}, "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "input_audio": {
          const audioPath = data.filePath || "";
          code += `
  ${letOrAssign}${outputVar} = ${JSON.stringify(audioPath)};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreInputCompiler;

  // ../zipp-core/modules/core-input/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    InputAudioNode: () => InputAudioNode_default,
    InputFileNode: () => InputFileNode_default,
    InputFolderNode: () => InputFolderNode_default,
    InputTextNode: () => InputTextNode_default,
    InputVideoNode: () => InputVideoNode_default
  });

  // ../zipp-core/modules/core-input/ui/InputTextNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var InputTextIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" }) });
  function InputTextNode({ data }) {
    const { size, handleResizeStart } = (0, import_zipp_ui_components.useNodeResize)({
      initialWidth: 260,
      initialHeight: 140,
      constraints: { minWidth: 200, maxWidth: 500, minHeight: 120, maxHeight: 400 }
    });
    const onChangeRef = (0, import_react.useRef)(data.onChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onChangeRef.current = data.onChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleChange = (0, import_react.useCallback)((e) => {
      onChangeRef.current?.("value", e.target.value);
    }, []);
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const showBodyProperties = data.showBodyProperties !== false;
    const textareaHeight = Math.max(60, size.height - 80);
    const displayValue = data.value ? typeof data.value === "object" ? JSON.stringify(data.value) : String(data.value) : "";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-400 truncate text-[10px]", children: displayValue ? displayValue.substring(0, 50) + (displayValue.length > 50 ? "..." : "") : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "italic text-slate-500", children: "Empty" }) });
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "text", type: "source", position: import_react2.Position.Right, color: "!bg-green-500", size: "lg" }
    ], []);
    const resizeHandles = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute top-0 right-0 w-2 h-full cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-green-500/30 transition-all",
          onMouseDown: (e) => handleResizeStart(e, "e")
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "div",
        {
          className: "nodrag absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100 hover:bg-green-500/30 transition-all",
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
        title: "Input: Text",
        color: "green",
        icon: InputTextIcon,
        width: size.width,
        collapsedWidth: 140,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        outputHandles,
        resizeHandles,
        children: showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Text Content" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "textarea",
            {
              className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 resize-none focus:outline-none focus:border-green-500",
              style: { height: textareaHeight, resize: "none" },
              placeholder: "Enter text...",
              value: displayValue,
              onChange: handleChange,
              onMouseDown: (e) => e.stopPropagation()
            }
          )
        ] })
      }
    );
  }
  var InputTextNode_default = (0, import_react.memo)(InputTextNode);

  // ../zipp-core/modules/core-input/ui/InputFileNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var MAX_FILE_SIZE = 10 * 1024 * 1024;
  var UI_PREVIEW_LIMIT = 500 * 1024;
  var InputFileIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" }) });
  function InputFileNode({ data }) {
    const [isDragging, setIsDragging] = (0, import_react3.useState)(false);
    const [isLoading, setIsLoading] = (0, import_react3.useState)(false);
    const [error, setError] = (0, import_react3.useState)(null);
    const fileInputRef = (0, import_react3.useRef)(null);
    const activeReaderRef = (0, import_react3.useRef)(null);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    (0, import_react3.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    (0, import_react3.useEffect)(() => {
      return () => {
        if (activeReaderRef.current) {
          activeReaderRef.current.abort();
        }
      };
    }, []);
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleFile = async (file) => {
      if (activeReaderRef.current) {
        activeReaderRef.current.abort();
      }
      setError(null);
      const isImage2 = file.type.startsWith("image/");
      const isText = file.type.startsWith("text/") || file.name.endsWith(".txt") || file.name.endsWith(".md") || file.name.endsWith(".json") || file.name.endsWith(".csv");
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large (max 10MB)`);
        return;
      }
      if (file.size === 0) {
        setError("File is empty");
        return;
      }
      setIsLoading(true);
      const filePath = file.path;
      if (file.size > UI_PREVIEW_LIMIT && filePath) {
        setIsLoading(false);
        const sanitizedName = file.name.replace(/[/\\]/g, "_");
        const fileType = isImage2 ? "image" : isText ? "text" : "binary";
        data.onFileLoad?.("", sanitizedName, `${fileType}_ref`, void 0, filePath);
        return;
      }
      const reader = new FileReader();
      activeReaderRef.current = reader;
      reader.onload = (e) => {
        setIsLoading(false);
        activeReaderRef.current = null;
        const content = e.target?.result;
        const sanitizedName = file.name.replace(/[/\\]/g, "_");
        if (isImage2) {
          data.onFileLoad?.(content, sanitizedName, "image", content, filePath);
        } else if (isText) {
          data.onFileLoad?.(content, sanitizedName, "text", void 0, filePath);
        } else {
          data.onFileLoad?.(content, sanitizedName, "binary", void 0, filePath);
        }
      };
      reader.onerror = () => {
        setIsLoading(false);
        activeReaderRef.current = null;
        setError(`Failed to read file`);
      };
      try {
        if (isImage2 || !isText) {
          reader.readAsDataURL(file);
        } else {
          reader.readAsText(file);
        }
      } catch {
        setIsLoading(false);
        activeReaderRef.current = null;
        setError(`Failed to read file`);
      }
    };
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    };
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };
    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };
    const handleClick = async () => {
      const tauri = window.__TAURI__;
      if (tauri) {
        setIsLoading(true);
        try {
          const result = await tauri.core.invoke("plugin:zipp-filesystem|pick_file", {
            filters: [{
              name: "Supported Files",
              extensions: ["txt", "md", "json", "csv", "png", "jpg", "jpeg", "gif", "webp", "svg", "pdf"]
            }]
          });
          if (result) {
            const sanitizedName = result.split(/[/\\]/).pop() || "file";
            const ext = sanitizedName.split(".").pop()?.toLowerCase() || "";
            const isImage2 = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext);
            const isText = ["txt", "md", "json", "csv"].includes(ext);
            const fileType = isImage2 ? "image" : isText ? "text" : "binary";
            data.onFileLoad?.("", sanitizedName, `${fileType}_ref`, void 0, result);
          }
          setIsLoading(false);
        } catch (err) {
          setIsLoading(false);
          setError(`Failed to pick file: ${err}`);
        }
      } else {
        fileInputRef.current?.click();
      }
    };
    const handleInputChange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };
    const hasFile = data.fileName && (data.fileContent || data.filePath);
    const isImage = data.fileType === "image";
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-slate-400", children: hasFile ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-emerald-400 truncate block", children: data.fileName }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "italic text-slate-500", children: "No file" }) });
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "content", type: "source", position: import_react4.Position.Right, color: "!bg-emerald-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "Input: File",
        color: "emerald",
        icon: InputFileIcon,
        width: 260,
        collapsedWidth: 140,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        outputHandles,
        children: [
          data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "div",
              {
                onClick: handleClick,
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                className: `
              w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
              ${isDragging ? "border-emerald-500 bg-emerald-900/30" : hasFile ? "border-emerald-600 bg-slate-100 dark:bg-slate-900" : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 hover:border-emerald-600"}
            `,
                children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-center", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "w-6 h-6 mx-auto text-emerald-500 animate-spin", fill: "none", viewBox: "0 0 24 24", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4", fill: "none" }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
                ] }) }) : hasFile ? isImage && data.imagePreview ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("img", { src: data.imagePreview, alt: data.fileName, className: "max-w-full max-h-full object-contain rounded" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-center px-2", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-6 h-6 mx-auto text-emerald-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-emerald-400 text-xs truncate max-w-full", children: data.fileName })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-6 h-6 text-slate-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Drop image/text" })
                ] })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: "image/*,.txt,.md,.json,.csv,text/*",
                onChange: handleInputChange,
                className: "hidden"
              }
            )
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-red-900/30 border border-red-600/50 rounded text-red-400 text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: error })
          ] })
        ]
      }
    );
  }
  var InputFileNode_default = (0, import_react3.memo)(InputFileNode);

  // ../zipp-core/modules/core-input/ui/InputVideoNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var MAX_VIDEO_SIZE = 10 * 1024 * 1024 * 1024;
  var VIDEO_EXTENSIONS = [".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"];
  var VideoIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) });
  function InputVideoNode({ data }) {
    const [isDragging, setIsDragging] = (0, import_react5.useState)(false);
    const [isLoading, setIsLoading] = (0, import_react5.useState)(false);
    const [error, setError] = (0, import_react5.useState)(null);
    const fileInputRef = (0, import_react5.useRef)(null);
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const isVideoFile = (file) => {
      const fileExt = "." + file.name.split(".").pop()?.toLowerCase();
      return file.type.startsWith("video/") || VIDEO_EXTENSIONS.includes(fileExt);
    };
    const handleFile = async (file) => {
      setError(null);
      if (!isVideoFile(file)) {
        setError("Please select a video file");
        return;
      }
      if (file.size > MAX_VIDEO_SIZE) {
        setError("Video too large (max 10GB)");
        return;
      }
      if (file.size === 0) {
        setError("File is empty");
        return;
      }
      const filePath = file.path;
      if (!filePath) {
        setError("Could not get file path. Use the file picker.");
        return;
      }
      const sanitizedName = file.name.replace(/[/\\]/g, "_");
      data.onVideoLoad?.(filePath, sanitizedName);
    };
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    };
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };
    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };
    const handleClick = async () => {
      const tauri = window.__TAURI__;
      if (tauri) {
        setIsLoading(true);
        setError(null);
        try {
          const result = await tauri.core.invoke("plugin:zipp-filesystem|pick_file", {
            filters: [{
              name: "Video Files",
              extensions: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv", "flv"]
            }]
          });
          if (result) {
            const sanitizedName = result.split(/[/\\]/).pop() || "video";
            data.onVideoLoad?.(result, sanitizedName);
          }
          setIsLoading(false);
        } catch (err) {
          setIsLoading(false);
          setError(`Failed to load video: ${err}`);
        }
      } else {
        fileInputRef.current?.click();
      }
    };
    const handleInputChange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };
    const hasVideo = data.fileName && data.filePath;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-slate-400", children: hasVideo ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-orange-400 truncate block", children: data.fileName }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "italic text-slate-500", children: "No video" }) });
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "path", type: "source", position: import_react6.Position.Right, color: "!bg-orange-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Input: Video",
        color: "orange",
        icon: VideoIcon,
        width: 260,
        collapsedWidth: 140,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        outputHandles,
        children: [
          data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "div",
              {
                onClick: handleClick,
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                className: `
              w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
              ${isDragging ? "border-orange-500 bg-orange-900/30" : hasVideo ? "border-orange-600 bg-slate-100 dark:bg-slate-900" : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 hover:border-orange-600"}
            `,
                children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-center", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { className: "w-6 h-6 mx-auto text-orange-500 animate-spin", fill: "none", viewBox: "0 0 24 24", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4", fill: "none" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
                ] }) }) : hasVideo ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-center px-2", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-6 h-6 mx-auto text-orange-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-orange-400 text-xs truncate max-w-full", children: data.fileName })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-6 h-6 text-slate-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Click or drop video" })
                ] })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: "video/*,.mp4,.mov,.avi,.mkv,.webm,.m4v,.wmv,.flv",
                onChange: handleInputChange,
                className: "hidden"
              }
            )
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-red-900/30 border border-red-600/50 rounded text-red-400 text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: error })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: "Output: video file path" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: "Use with Video Frames node" })
          ] })
        ]
      }
    );
  }
  var InputVideoNode_default = (0, import_react5.memo)(InputVideoNode);

  // ../zipp-core/modules/core-input/ui/InputFolderNode.tsx
  var import_react7 = __toESM(require_react(), 1);
  var import_react8 = __toESM(require_react2(), 1);
  var import_zipp_ui_components4 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime4 = __toESM(require_jsx_runtime(), 1);
  var FolderIcon = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" }) });
  function InputFolderNode({ data }) {
    const onPathChangeRef = (0, import_react7.useRef)(data.onPathChange);
    const onRecursiveChangeRef = (0, import_react7.useRef)(data.onRecursiveChange);
    const onIncludePatternsChangeRef = (0, import_react7.useRef)(data.onIncludePatternsChange);
    const onMaxFilesChangeRef = (0, import_react7.useRef)(data.onMaxFilesChange);
    const onCollapsedChangeRef = (0, import_react7.useRef)(data.onCollapsedChange);
    const onBrowseRef = (0, import_react7.useRef)(data.onBrowse);
    (0, import_react7.useEffect)(() => {
      onPathChangeRef.current = data.onPathChange;
      onRecursiveChangeRef.current = data.onRecursiveChange;
      onIncludePatternsChangeRef.current = data.onIncludePatternsChange;
      onMaxFilesChangeRef.current = data.onMaxFilesChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
      onBrowseRef.current = data.onBrowse;
    });
    const handleCollapsedChange = (0, import_react7.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handlePathChange = (0, import_react7.useCallback)((e) => {
      onPathChangeRef.current?.(e.target.value);
    }, []);
    const handleRecursiveChange = (0, import_react7.useCallback)((e) => {
      onRecursiveChangeRef.current?.(e.target.checked);
    }, []);
    const handleIncludePatternsChange = (0, import_react7.useCallback)((e) => {
      onIncludePatternsChangeRef.current?.(e.target.value);
    }, []);
    const handleMaxFilesChange = (0, import_react7.useCallback)((e) => {
      const val = parseInt(e.target.value) || 100;
      onMaxFilesChangeRef.current?.(Math.max(1, Math.min(1e4, val)));
    }, []);
    const handleBrowse = (0, import_react7.useCallback)(() => {
      onBrowseRef.current?.();
    }, []);
    const path = data.path || "";
    const recursive = data.recursive ?? false;
    const includePatterns = data.includePatterns || "*.png, *.jpg, *.jpeg";
    const maxFiles = data.maxFiles || 100;
    const fileCount = data._fileCount;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "text-slate-400", children: path ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "truncate", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-green-400 text-[10px]", children: path.split(/[/\\]/).pop() }),
      fileCount !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: "text-slate-500 text-[10px] ml-1", children: [
        "(",
        fileCount,
        ")"
      ] })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "italic text-slate-500 text-[10px]", children: "No folder" }) });
    const inputHandles = (0, import_react7.useMemo)(() => [
      { id: "path", type: "target", position: import_react8.Position.Left, color: "!bg-blue-500", label: "path", labelColor: "text-blue-400", size: "md" }
    ], []);
    const outputHandles = (0, import_react7.useMemo)(() => [
      { id: "files", type: "source", position: import_react8.Position.Right, color: "!bg-green-500", label: "files", labelColor: "text-green-400", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      import_zipp_ui_components4.CollapsibleNodeWrapper,
      {
        title: "Folder Input",
        color: "green",
        icon: FolderIcon,
        width: 280,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Folder Path" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex gap-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-green-500 font-mono text-xs",
                  placeholder: "/path/to/folder",
                  value: path,
                  onChange: handlePathChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  onClick: handleBrowse,
                  className: "nodrag px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors",
                  title: "Browse for folder",
                  onMouseDown: (e) => e.stopPropagation(),
                  children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" }) })
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Include Patterns" }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "text",
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-green-500 font-mono text-xs",
                placeholder: "*.png, *.jpg",
                value: includePatterns,
                onChange: handleIncludePatternsChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: "Comma-separated glob patterns" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-4", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { className: "flex items-center gap-2 cursor-pointer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: recursive,
                  onChange: handleRecursiveChange,
                  className: "nodrag w-4 h-4 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-green-500 focus:ring-green-500 focus:ring-offset-0",
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Recursive" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Max:" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "input",
                {
                  type: "number",
                  min: 1,
                  max: 1e4,
                  className: "nodrag nowheel w-16 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:border-green-500 font-mono",
                  value: maxFiles,
                  onChange: handleMaxFilesChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              )
            ] })
          ] }),
          fileCount !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-green-900/20 border border-green-600/30 rounded text-green-400 text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("svg", { className: "w-3.5 h-3.5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { children: [
              fileCount,
              " files found"
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: "Outputs array of file objects with path, name, ext, size" })
        ] })
      }
    );
  }
  var InputFolderNode_default = (0, import_react7.memo)(InputFolderNode);

  // ../zipp-core/modules/core-input/ui/InputAudioNode.tsx
  var import_react9 = __toESM(require_react(), 1);
  var import_react10 = __toESM(require_react2(), 1);
  var import_zipp_ui_components5 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime5 = __toESM(require_jsx_runtime(), 1);
  var AudioInputIcon = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" }) });
  function InputAudioNode({ data }) {
    const nodeId = (0, import_react10.useNodeId)();
    const { updateNodeData } = (0, import_react10.useReactFlow)();
    const [isDragging, setIsDragging] = (0, import_react9.useState)(false);
    const [isLoading, setIsLoading] = (0, import_react9.useState)(false);
    const [error, setError] = (0, import_react9.useState)(null);
    const fileInputRef = (0, import_react9.useRef)(null);
    const onCollapsedChangeRef = (0, import_react9.useRef)(data.onCollapsedChange);
    (0, import_react9.useEffect)(() => {
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react9.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleFile = (0, import_react9.useCallback)((file) => {
      if (!nodeId) return;
      setError(null);
      const isAudio = file.type.startsWith("audio/") || /\.(mp3|wav|ogg|flac|m4a|aac|wma)$/i.test(file.name);
      if (!isAudio) {
        setError("Please select an audio file");
        return;
      }
      const filePath = file.path;
      if (filePath) {
        updateNodeData(nodeId, {
          filePath,
          fileName: file.name
        });
      } else {
        setError("Could not get file path");
      }
    }, [nodeId, updateNodeData]);
    const handleDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    };
    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
    };
    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };
    const handleClick = async () => {
      const tauri = window.__TAURI__;
      if (tauri && nodeId) {
        setIsLoading(true);
        try {
          const result = await tauri.core.invoke("plugin:zipp-filesystem|pick_file", {
            filters: [{
              name: "Audio Files",
              extensions: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma"]
            }]
          });
          if (result) {
            const fileName2 = result.split(/[/\\]/).pop() || "audio";
            updateNodeData(nodeId, { filePath: result, fileName: fileName2 });
          }
          setIsLoading(false);
        } catch (err) {
          setIsLoading(false);
          setError(`Failed to pick file: ${err}`);
        }
      } else {
        fileInputRef.current?.click();
      }
    };
    const handleInputChange = (e) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    };
    const fileName = (0, import_react9.useMemo)(() => {
      if (data.fileName) return data.fileName;
      if (!data.filePath) return null;
      const parts = data.filePath.replace(/\\/g, "/").split("/");
      return parts[parts.length - 1];
    }, [data.filePath, data.fileName]);
    const hasFile = !!data.filePath;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "text-slate-400", children: hasFile ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "text-teal-400 truncate block", children: fileName }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "italic text-slate-500", children: "No file" }) });
    const outputHandles = (0, import_react9.useMemo)(() => [
      { id: "audio", type: "source", position: import_react10.Position.Right, color: "!bg-teal-500", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      import_zipp_ui_components5.CollapsibleNodeWrapper,
      {
        title: "Audio Input",
        color: "teal",
        icon: AudioInputIcon,
        width: 260,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles: [],
        outputHandles,
        children: [
          data.showBodyProperties !== false && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "div",
              {
                onClick: handleClick,
                onDrop: handleDrop,
                onDragOver: handleDragOver,
                onDragLeave: handleDragLeave,
                className: `
                            nodrag w-full h-24 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-all
                            ${isDragging ? "border-teal-500 bg-teal-900/30" : hasFile ? "border-teal-600 bg-slate-100 dark:bg-slate-900" : "border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-900 hover:border-teal-600"}
                        `,
                children: isLoading ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "text-center", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { className: "w-6 h-6 mx-auto text-teal-500 animate-spin", fill: "none", viewBox: "0 0 24 24", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4", fill: "none" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })
                ] }) }) : hasFile ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "text-center px-2", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-6 h-6 mx-auto text-teal-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-teal-400 text-xs truncate max-w-full", children: fileName })
                ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-6 h-6 text-slate-500 mb-1", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Drop audio file or click" })
                ] })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
              "input",
              {
                ref: fileInputRef,
                type: "file",
                accept: "audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.wma",
                onChange: handleInputChange,
                className: "hidden"
              }
            )
          ] }),
          error && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-red-900/30 border border-red-600/50 rounded text-red-400 text-xs mt-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("svg", { className: "w-3 h-3 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: error })
          ] })
        ]
      }
    );
  }
  var InputAudioNode_default = (0, import_react9.memo)(InputAudioNode);

  // ../zipp-core/modules/core-input/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
