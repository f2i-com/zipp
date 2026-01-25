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

  // ../zipp-core/modules/core-filesystem/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-filesystem/runtime.ts
  var ctx;
  function validatePath(path, operation) {
    if (!path || typeof path !== "string") {
      throw new Error(`${operation}: Path is required`);
    }
    if (path.length > 32767) {
      throw new Error(`${operation}: Path exceeds maximum length`);
    }
    const normalizedPath = path.replace(/\\/g, "/");
    if (path.includes("\0")) {
      throw new Error(`${operation}: Path contains null bytes`);
    }
    const traversalPatterns = [
      "../",
      "..\\",
      "/..",
      "\\..",
      ".."
    ];
    for (const pattern of traversalPatterns) {
      if (normalizedPath.includes(pattern)) {
        throw new Error(`${operation}: Path traversal detected in "${path}"`);
      }
    }
    if (normalizedPath.includes("%2e%2e") || normalizedPath.includes("%2E%2E")) {
      throw new Error(`${operation}: Encoded path traversal detected`);
    }
    const isWindows = path.includes("\\") || /^[a-zA-Z]:/.test(path);
    if (isWindows) {
      const dangerousPrefixes = [
        "\\\\.\\",
        // Device namespace
        "\\\\?\\",
        // Extended-length path prefix
        "//?/",
        // Alternative device namespace
        "//.//"
        // UNC device path
      ];
      for (const prefix of dangerousPrefixes) {
        if (path.startsWith(prefix) || normalizedPath.startsWith(prefix.replace(/\\/g, "/"))) {
          throw new Error(`${operation}: Dangerous path prefix detected`);
        }
      }
      const devicePattern = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i;
      const fileName = normalizedPath.split("/").pop() || "";
      if (devicePattern.test(fileName)) {
        throw new Error(`${operation}: Reserved device name in path`);
      }
    }
  }
  function sanitizePath(path) {
    if (!path) return "";
    let sanitized = path.replace(/\\/g, "/");
    sanitized = sanitized.replace(/\0/g, "");
    sanitized = sanitized.replace(/\/+/g, "/");
    sanitized = sanitized.trim();
    return sanitized;
  }
  async function listFolder(path, recursive, includePatterns, maxFiles, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[FileSystem] Aborted by user before listFolder");
      throw new Error("Operation aborted by user");
    }
    validatePath(path, "listFolder");
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[FileSystem] Listing folder: ${sanitizePath(path)} (recursive: ${recursive}, max: ${maxFiles})`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      const include_patterns = includePatterns.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
      const files = await ctx.tauri.invoke("plugin:zipp-filesystem|list_folder", {
        path,
        recursive,
        includePatterns: include_patterns,
        excludePatterns: [],
        // Empty exclusions
        maxFiles
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[FileSystem] Found ${files.length} files`);
      return files;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] listFolder failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function readFile(path, readAs, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[FileSystem] Aborted by user before readFile");
      throw new Error("Operation aborted by user");
    }
    validatePath(path, "readFile");
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[FileSystem] Reading file: ${sanitizePath(path)} as ${readAs}`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      const result = await ctx.tauri.invoke("plugin:zipp-filesystem|read_file", {
        path,
        readAs
      });
      if (result.isLargeFile) {
        ctx.log("warn", `[FileSystem] File too large for memory: ${path} (${result.size} bytes)`);
        return JSON.stringify({
          __type: "file_ref",
          path: result.path,
          size: result.size,
          name: result.name
        });
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[FileSystem] Read ${result.content.length} chars from ${path}`);
      return result.content;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] readFile failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function calculateFileChunks(path, chunkSize, overlap, nodeId) {
    validatePath(path, "calculateFileChunks");
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[FileSystem] Calculating chunks for: ${sanitizePath(path)} (size: ${chunkSize}, overlap: ${overlap})`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      const chunks = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|calculate_file_chunks",
        { path, chunkSize, overlap }
      );
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[FileSystem] Calculated ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] calculateFileChunks failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function readChunkContent(path, start, length, readAs = "text") {
    validatePath(path, "readChunkContent");
    if (!ctx.tauri) {
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      const content = await ctx.tauri.invoke(
        "plugin:zipp-filesystem|read_chunk_content",
        { path, start, length, readAs }
      );
      return content;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] readChunkContent failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function copyFile(source, destination, createDirs = false, nodeId = "") {
    validatePath(source, "copyFile (source)");
    validatePath(destination, "copyFile (destination)");
    if (nodeId) {
      ctx.onNodeStatus?.(nodeId, "running");
    }
    ctx.log("info", `[FileSystem] Copying file: ${sanitizePath(source)} -> ${sanitizePath(destination)}`);
    if (!ctx.tauri) {
      if (nodeId) {
        ctx.onNodeStatus?.(nodeId, "error");
      }
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      await ctx.tauri.invoke("plugin:zipp-filesystem|native_copy_file", {
        source,
        destination,
        createDirs
      });
      if (nodeId) {
        ctx.onNodeStatus?.(nodeId, "completed");
      }
      ctx.log("success", `[FileSystem] Copied to ${destination}`);
      return destination;
    } catch (error) {
      if (nodeId) {
        ctx.onNodeStatus?.(nodeId, "error");
      }
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] copyFile failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function writeFile(path, content, contentType, createDirs, nodeId) {
    if (ctx.abortSignal?.aborted) {
      ctx.log("info", "[FileSystem] Aborted by user before writeFile");
      throw new Error("Operation aborted by user");
    }
    if (!path || typeof path !== "string") {
      ctx.log("error", `[FileSystem] writeFile skipped: path is not a string (got ${typeof path})`);
      return "ERROR_INVALID_PATH";
    }
    if (path === "[object Object]" || path.includes("[object Object]") || path.includes("[object ") || path.startsWith("[") || path.startsWith("undefined") || path.startsWith("null") || path.startsWith("NaN") || path.includes("__downloads_path__") || path.includes("[FileWrite]") || path.includes("[Module") || /^(true|false)$/i.test(path)) {
      ctx.log("error", `[FileSystem] writeFile skipped: corrupted path detected: ${path}`);
      return "ERROR_CORRUPTED_PATH";
    }
    const hasWindowsDrive = /^[a-zA-Z]:/.test(path);
    const hasUnixRoot = path.startsWith("/");
    if (!hasWindowsDrive && !hasUnixRoot) {
      ctx.log("error", `[FileSystem] writeFile skipped: path is not absolute: ${path}`);
      return "ERROR_NOT_ABSOLUTE_PATH";
    }
    validatePath(path, "writeFile");
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[FileSystem] Writing file: ${sanitizePath(path)} (type: ${contentType})`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available for filesystem operations");
    }
    try {
      await ctx.tauri.invoke("plugin:zipp-filesystem|write_file", {
        path,
        content,
        contentType,
        createDirs
      });
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[FileSystem] Wrote to ${path}`);
      return path;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown error";
      ctx.log("error", `[FileSystem] writeFile failed: ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  async function getDownloadsPath() {
    if (!ctx.tauri) {
      return null;
    }
    try {
      const path = await ctx.tauri.invoke("get_downloads_path");
      return path || null;
    } catch {
      return null;
    }
  }
  var CoreFilesystemRuntime = {
    name: "FileSystem",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[FileSystem] Module initialized");
    },
    methods: {
      listFolder,
      readFile,
      writeFile,
      copyFile,
      calculateFileChunks,
      readChunkContent,
      getDownloadsPath
    },
    async cleanup() {
      ctx?.log?.("info", "[FileSystem] Module cleanup");
    }
  };
  var runtime_default = CoreFilesystemRuntime;

  // ../zipp-core/modules/core-filesystem/compiler.ts
  var CoreFilesystemCompiler = {
    name: "Filesystem",
    getNodeTypes() {
      return ["file_read", "file_write", "text_chunker"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString, isInLoop, loopStartId, sanitizeId } = ctx2;
      const data = node.data;
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      const inputVar = inputs.get("input") || "null";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "file_read": {
          const pathInput = inputs.get("path");
          const readAs = escapeString(String(data.readAs || "text"));
          const csvHasHeader = data.csvHasHeader !== false;
          const needsTextRead = ["json", "csv", "lines"].includes(readAs);
          const actualReadAs = needsTextRead ? "text" : readAs;
          code += `
  // Get file path from input or property
  let _file_path_${sanitizedId} = ${pathInput || inputVar};
  // FormLogic uses 'hash' for objects, JS uses 'object'
  let _is_obj_${sanitizedId} = (typeof _file_path_${sanitizedId} === 'object' || typeof _file_path_${sanitizedId} === 'hash');
  if (_is_obj_${sanitizedId} && _file_path_${sanitizedId}.path) {
    _file_path_${sanitizedId} = _file_path_${sanitizedId}.path;
  }
  // Re-check after potentially extracting path
  _is_obj_${sanitizedId} = (typeof _file_path_${sanitizedId} === 'object' || typeof _file_path_${sanitizedId} === 'hash');
  if (_is_obj_${sanitizedId} && _file_path_${sanitizedId}.dataUrl) {
    // Already has content from file input
    ${letOrAssign}${outputVar} = _file_path_${sanitizedId}.dataUrl;
  } else {
    // Validate path before reading
    let _path_str_${sanitizedId} = "" + _file_path_${sanitizedId};
    // Skip invalid paths (not a real file path - must have : or / for Windows/Unix paths)
    if (_path_str_${sanitizedId}.length < 3 || (_path_str_${sanitizedId}.indexOf(":") < 0 && _path_str_${sanitizedId}.indexOf("/") < 0 && _path_str_${sanitizedId}.indexOf("\\\\") < 0)) {
      console.log("[FileRead] Skipping invalid path: " + _path_str_${sanitizedId});
      ${letOrAssign}${outputVar} = null;
    } else {
      ${letOrAssign}${outputVar} = await FileSystem.readFile(
        _path_str_${sanitizedId},
        "${actualReadAs}",
        "${node.id}"
      );
      if (${outputVar} === "__ABORT__") {
        console.log("[Workflow] aborted");
        return workflow_context;
      }

      // Check if result is a large file reference (for streaming with Text Chunker)
      let _is_file_ref_${sanitizedId} = false;
      if (typeof ${outputVar} === 'string' && ${outputVar}.indexOf('"__type":"file_ref"') >= 0) {
        _is_file_ref_${sanitizedId} = true;
        console.log("[FileRead] Large file detected - passing file reference for streaming");
      }

      // Only apply parsing if not a large file reference
      if (!_is_file_ref_${sanitizedId}) {`;
          if (readAs === "json") {
            code += `
        // Parse JSON content
        if (${outputVar} != null) {
          try {
            ${outputVar} = JSON.parse(${outputVar});
          } catch (_parse_err_${sanitizedId}) {
            console.log("[FileRead] Failed to parse JSON: " + _parse_err_${sanitizedId});
            ${outputVar} = null;
          }
        }`;
          } else if (readAs === "csv") {
            code += `
        // Parse CSV content
        if (${outputVar} != null) {
          let _csv_lines_${sanitizedId} = ${outputVar}.split("\\n").filter(function(_l_) { return _l_.trim().length > 0; });
          let _csv_headers_${sanitizedId} = [];
          let _csv_result_${sanitizedId} = [];
          let _csv_start_${sanitizedId} = 0;

          if (${csvHasHeader} && _csv_lines_${sanitizedId}.length > 0) {
            // Parse header row
            _csv_headers_${sanitizedId} = _csv_lines_${sanitizedId}[0].split(",").map(function(_h_) { return _h_.trim().replace(/^"|"$/g, ''); });
            _csv_start_${sanitizedId} = 1;
          }

          for (let _csv_i_${sanitizedId} = _csv_start_${sanitizedId}; _csv_i_${sanitizedId} < _csv_lines_${sanitizedId}.length; _csv_i_${sanitizedId}++) {
            let _csv_row_${sanitizedId} = _csv_lines_${sanitizedId}[_csv_i_${sanitizedId}];
            // Simple CSV parsing (handles quoted fields with commas)
            let _csv_cols_${sanitizedId} = [];
            let _csv_in_quote_${sanitizedId} = false;
            let _csv_col_${sanitizedId} = "";
            for (let _csv_c_${sanitizedId} = 0; _csv_c_${sanitizedId} < _csv_row_${sanitizedId}.length; _csv_c_${sanitizedId}++) {
              let _csv_char_${sanitizedId} = _csv_row_${sanitizedId}[_csv_c_${sanitizedId}];
              if (_csv_char_${sanitizedId} === '"') {
                _csv_in_quote_${sanitizedId} = !_csv_in_quote_${sanitizedId};
              } else if (_csv_char_${sanitizedId} === ',' && !_csv_in_quote_${sanitizedId}) {
                _csv_cols_${sanitizedId}.push(_csv_col_${sanitizedId}.trim());
                _csv_col_${sanitizedId} = "";
              } else {
                _csv_col_${sanitizedId} += _csv_char_${sanitizedId};
              }
            }
            _csv_cols_${sanitizedId}.push(_csv_col_${sanitizedId}.trim());

            let _csv_row_obj_${sanitizedId} = JSON.parse("{}");
            _csv_row_obj_${sanitizedId}.index = _csv_i_${sanitizedId} - _csv_start_${sanitizedId};
            _csv_row_obj_${sanitizedId}.row = _csv_cols_${sanitizedId};
            if (_csv_headers_${sanitizedId}.length > 0) {
              // Create object with header keys
              let _csv_data_${sanitizedId} = JSON.parse("{}");
              for (let _csv_h_${sanitizedId} = 0; _csv_h_${sanitizedId} < _csv_headers_${sanitizedId}.length; _csv_h_${sanitizedId}++) {
                _csv_data_${sanitizedId}[_csv_headers_${sanitizedId}[_csv_h_${sanitizedId}]] = _csv_cols_${sanitizedId}[_csv_h_${sanitizedId}] || "";
              }
              _csv_row_obj_${sanitizedId}.data = _csv_data_${sanitizedId};
            }
            _csv_result_${sanitizedId}.push(_csv_row_obj_${sanitizedId});
          }
          ${outputVar} = _csv_result_${sanitizedId};
        }`;
          } else if (readAs === "lines") {
            code += `
        // Parse lines content
        if (${outputVar} != null) {
          let _lines_arr_${sanitizedId} = ${outputVar}.split("\\n");
          let _lines_result_${sanitizedId} = [];
          for (let _lines_i_${sanitizedId} = 0; _lines_i_${sanitizedId} < _lines_arr_${sanitizedId}.length; _lines_i_${sanitizedId}++) {
            let _line_${sanitizedId} = _lines_arr_${sanitizedId}[_lines_i_${sanitizedId}];
            if (_line_${sanitizedId}.trim().length > 0) {
              _lines_result_${sanitizedId}.push(_line_${sanitizedId});
            }
          }
          ${outputVar} = _lines_result_${sanitizedId};
        }`;
          }
          code += `
      } // End of: if (!_is_file_ref)
    }
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "file_write": {
          const targetPath = escapeString(String(data.targetPath || data.path || ""));
          const filenamePattern = escapeString(String(data.filenamePattern || ""));
          const contentType = escapeString(String(data.contentType || "text"));
          const createDirs = data.createDirectories !== false && data.createDirectory !== false;
          const infoInput = inputs.get("info");
          const folderInput = inputs.get("folder");
          const pathInput = inputs.get("path");
          const contentInput = inputs.get("content") || inputs.get("default") || inputVar;
          code += `
  // Determine output path from inputs, settings, and filename pattern
  let _write_content_${sanitizedId} = ${contentInput};
  let _output_folder_${sanitizedId} = "${targetPath}";
  let _filename_pattern_${sanitizedId} = "${filenamePattern}";
  let _final_filename_${sanitizedId} = "";

  // Template variables from FileInfo (if connected)
  let _tpl_name_${sanitizedId} = "";
  let _tpl_nameWithoutExt_${sanitizedId} = "";
  let _tpl_ext_${sanitizedId} = "";
  let _tpl_index_${sanitizedId} = ${isInLoop && loopStartId ? `node_${sanitizeId(loopStartId)}_out_index != null ? node_${sanitizeId(loopStartId)}_out_index : 0` : "0"};
  let _source_dir_${sanitizedId} = "";`;
          if (folderInput) {
            code += `
  // Get folder from folder input
  let _folder_in_${sanitizedId} = ${folderInput};
  if (typeof _folder_in_${sanitizedId} === 'string' && _folder_in_${sanitizedId}.length > 0) {
    _output_folder_${sanitizedId} = _folder_in_${sanitizedId};
  }`;
          }
          if (infoInput) {
            code += `
  // Extract template variables from FileInfo object
  // Use JSON roundtrip to safely extract values and avoid VM stack issues
  let _info_json_${sanitizedId} = JSON.stringify(${infoInput});
  let _info_copy_${sanitizedId} = JSON.parse(_info_json_${sanitizedId});
  _tpl_name_${sanitizedId} = _info_copy_${sanitizedId}.name || "";
  _tpl_nameWithoutExt_${sanitizedId} = _info_copy_${sanitizedId}.nameWithoutExt || _info_copy_${sanitizedId}.name_without_ext || "";
  _tpl_ext_${sanitizedId} = _info_copy_${sanitizedId}.ext || _info_copy_${sanitizedId}.extension || "";

  // If no nameWithoutExt, derive from name using split instead of lastIndexOf
  if (!_tpl_nameWithoutExt_${sanitizedId} && _tpl_name_${sanitizedId}) {
    let _name_str_${sanitizedId} = "" + _tpl_name_${sanitizedId};
    let _dot_parts_${sanitizedId} = _name_str_${sanitizedId}.split(".");
    if (_dot_parts_${sanitizedId}.length > 1) {
      // Get extension (last part)
      let _ext_part_${sanitizedId} = _dot_parts_${sanitizedId}.pop();
      // Get name without extension (remaining parts joined)
      _tpl_nameWithoutExt_${sanitizedId} = _dot_parts_${sanitizedId}.join(".");
      if (!_tpl_ext_${sanitizedId}) {
        _tpl_ext_${sanitizedId} = _ext_part_${sanitizedId};
      }
    } else {
      _tpl_nameWithoutExt_${sanitizedId} = _name_str_${sanitizedId};
    }
  }

  // Get source directory from original path (fallback if no output folder specified)
  let _info_path_${sanitizedId} = "" + (_info_copy_${sanitizedId}.path || "");
  let _tpl_name_str_${sanitizedId} = "" + _tpl_name_${sanitizedId};
  if (_info_path_${sanitizedId}.length > 0 && _tpl_name_str_${sanitizedId}.length > 0) {
    // Use indexOf to find name position (not lastIndexOf which may not work in FormLogic)
    let _name_pos_${sanitizedId} = _info_path_${sanitizedId}.indexOf(_tpl_name_str_${sanitizedId});
    if (_name_pos_${sanitizedId} > 0) {
      _source_dir_${sanitizedId} = _info_path_${sanitizedId}.substring(0, _name_pos_${sanitizedId});
    }
  }`;
          }
          if (pathInput && !infoInput) {
            code += `
  // Get path from path input
  let _path_in_${sanitizedId} = ${pathInput};
  let _is_path_obj_${sanitizedId} = (typeof _path_in_${sanitizedId} === 'object' || typeof _path_in_${sanitizedId} === 'hash');
  if (_is_path_obj_${sanitizedId} && _path_in_${sanitizedId}.path) {
    // FileInfo-like object
    _tpl_name_${sanitizedId} = "" + (_path_in_${sanitizedId}.name || "");
    _tpl_nameWithoutExt_${sanitizedId} = "" + (_path_in_${sanitizedId}.nameWithoutExt || "");
    // Get source directory using indexOf instead of lastIndexOf
    let _pi_path_str_${sanitizedId} = "" + _path_in_${sanitizedId}.path;
    let _pi_name_str_${sanitizedId} = "" + _path_in_${sanitizedId}.name;
    let _pi_name_pos_${sanitizedId} = _pi_path_str_${sanitizedId}.indexOf(_pi_name_str_${sanitizedId});
    if (_pi_name_pos_${sanitizedId} > 0) {
      _source_dir_${sanitizedId} = _pi_path_str_${sanitizedId}.substring(0, _pi_name_pos_${sanitizedId});
    }
  } else if (typeof _path_in_${sanitizedId} === 'string') {
    // Direct path string - use as-is for output
    _output_folder_${sanitizedId} = "";
    _final_filename_${sanitizedId} = "" + _path_in_${sanitizedId};
  }`;
          }
          code += `
  // Build final output path
  let _write_path_${sanitizedId} = "";

  // Get iteration index - use loop index directly with minimal variable usage
  // Avoid extra console.log calls which may cause stack corruption in FormLogic VM
  let _iter_num_${sanitizedId} = _tpl_index_${sanitizedId};
  if (typeof _iter_num_${sanitizedId} !== 'number' && typeof _iter_num_${sanitizedId} !== 'integer') {
    _iter_num_${sanitizedId} = 0;
  }

  if (_final_filename_${sanitizedId}) {
    // Direct path was provided
    _write_path_${sanitizedId} = _final_filename_${sanitizedId};
  } else {
    // Use output folder (from settings or folder input) or fall back to source directory
    let _use_folder_${sanitizedId} = _output_folder_${sanitizedId} || _source_dir_${sanitizedId};

    // Apply filename pattern or use default
    let _out_filename_${sanitizedId} = "";
    if (_filename_pattern_${sanitizedId}) {
      // Apply template substitutions to filename pattern
      _out_filename_${sanitizedId} = _filename_pattern_${sanitizedId};
      _out_filename_${sanitizedId} = _out_filename_${sanitizedId}.split("{{name}}").join(_tpl_name_${sanitizedId});
      _out_filename_${sanitizedId} = _out_filename_${sanitizedId}.split("{{nameWithoutExt}}").join(_tpl_nameWithoutExt_${sanitizedId});
      _out_filename_${sanitizedId} = _out_filename_${sanitizedId}.split("{{ext}}").join(_tpl_ext_${sanitizedId});
      _out_filename_${sanitizedId} = _out_filename_${sanitizedId}.split("{{index}}").join("" + _tpl_index_${sanitizedId});
    } else if (_tpl_nameWithoutExt_${sanitizedId}) {
      // Default: original name without extension + .txt
      _out_filename_${sanitizedId} = _tpl_nameWithoutExt_${sanitizedId} + ".txt";
    } else {
      // Fallback: generic output name
      _out_filename_${sanitizedId} = "output_" + _tpl_index_${sanitizedId} + ".txt";
    }

    // If no folder specified, get downloads path as fallback
    if (!_use_folder_${sanitizedId}) {
      _use_folder_${sanitizedId} = await FileSystem.getDownloadsPath();
    }

    // Build full path: folder + "/" + filename (FileSystem handles path normalization)
    _write_path_${sanitizedId} = "" + _use_folder_${sanitizedId} + "/" + _out_filename_${sanitizedId};
  }

  // Write the file - let FileSystem handle any path errors
  ${letOrAssign}${outputVar} = await FileSystem.writeFile(
      _write_path_${sanitizedId},
      _write_content_${sanitizedId},
      "${contentType}",
      ${createDirs},
      "${node.id}"
    );
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "text_chunker": {
          const chunkSize = Number(data.chunkSize) || 1e3;
          const overlap = Number(data.overlap) || 100;
          const contentType = escapeString(String(data.contentType || "auto"));
          const csvHasHeader = data.csvHasHeader !== false;
          const indexName = escapeString(String(data.indexName || "default"));
          code += `
  // Text chunker: split content based on type (auto-detect, raw, json_array, csv, lines)
  let _input_${sanitizedId} = ${inputVar};
  let _chunks_${sanitizedId} = [];
  let _content_type_${sanitizedId} = "${contentType}";
  let _is_file_ref_${sanitizedId} = false;

  // Check if input is a file reference (from large file read)
  if (typeof _input_${sanitizedId} === 'string' && _input_${sanitizedId}.indexOf('"__type":"file_ref"') >= 0) {
    try {
      let _ref_${sanitizedId} = JSON.parse(_input_${sanitizedId});
      if (_ref_${sanitizedId}.__type === "file_ref" && _ref_${sanitizedId}.path) {
        _is_file_ref_${sanitizedId} = true;
        console.log("[TextChunker] Detected large file reference: " + _ref_${sanitizedId}.path + " (" + _ref_${sanitizedId}.size + " bytes)");

        // Use streaming: calculate chunk boundaries then read each chunk
        let _chunk_refs_${sanitizedId} = await FileSystem.calculateFileChunks(
          _ref_${sanitizedId}.path,
          ${chunkSize},
          ${overlap},
          "${node.id}"
        );

        // Read each chunk content
        for (let _ci_${sanitizedId} = 0; _ci_${sanitizedId} < _chunk_refs_${sanitizedId}.length; _ci_${sanitizedId}++) {
          let _cref_${sanitizedId} = _chunk_refs_${sanitizedId}[_ci_${sanitizedId}];
          let _chunk_text_${sanitizedId} = await FileSystem.readChunkContent(
            _cref_${sanitizedId}.path,
            _cref_${sanitizedId}.start,
            _cref_${sanitizedId}.length,
            "text"
          );
          let _chunk_obj_${sanitizedId} = JSON.parse("{}");
          _chunk_obj_${sanitizedId}.text = _chunk_text_${sanitizedId};
          _chunk_obj_${sanitizedId}.index = _cref_${sanitizedId}.index;
          _chunk_obj_${sanitizedId}.start = _cref_${sanitizedId}.start;
          _chunk_obj_${sanitizedId}.end = _cref_${sanitizedId}.start + _cref_${sanitizedId}.length;
          _chunk_obj_${sanitizedId}.documentId = "${indexName}_" + _cref_${sanitizedId}.index;
          _chunk_obj_${sanitizedId}.total = _cref_${sanitizedId}.total;
          _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
        }
        console.log("[TextChunker] Streamed " + _chunks_${sanitizedId}.length + " chunks from large file");
      }
    } catch (_parse_err_${sanitizedId}) {
      console.log("[TextChunker] Not a valid file ref JSON, processing as text");
    }
  }

  // If not a file reference, process as in-memory text
  let _text_${sanitizedId} = "";
  if (!_is_file_ref_${sanitizedId}) {
    _text_${sanitizedId} = typeof _input_${sanitizedId} === 'string' ? _input_${sanitizedId} : JSON.stringify(_input_${sanitizedId} || '');

  // Auto-detect content type
  if (_content_type_${sanitizedId} === "auto") {
    let _trimmed_${sanitizedId} = _text_${sanitizedId}.trim();
    if (_trimmed_${sanitizedId}.startsWith("[") && _trimmed_${sanitizedId}.endsWith("]")) {
      _content_type_${sanitizedId} = "json_array";
    } else if (_trimmed_${sanitizedId}.startsWith("{") && _trimmed_${sanitizedId}.endsWith("}")) {
      // Single JSON object - wrap in array
      _content_type_${sanitizedId} = "json_array";
      _text_${sanitizedId} = "[" + _text_${sanitizedId} + "]";
    } else if (_trimmed_${sanitizedId}.indexOf(",") > 0 && _trimmed_${sanitizedId}.indexOf("\\n") > 0) {
      // Likely CSV (has commas and newlines)
      _content_type_${sanitizedId} = "csv";
    } else {
      _content_type_${sanitizedId} = "raw";
    }
  }

  if (_content_type_${sanitizedId} === "json_array") {
    // JSON Array: parse and return items (optionally batch them)
    try {
      let _arr_${sanitizedId} = JSON.parse(_text_${sanitizedId});
      if (Array.isArray(_arr_${sanitizedId})) {
        if (${chunkSize} > 1 && _arr_${sanitizedId}.length > ${chunkSize}) {
          // Batch into chunks of chunkSize items
          for (let _i_${sanitizedId} = 0; _i_${sanitizedId} < _arr_${sanitizedId}.length; _i_${sanitizedId} += ${chunkSize}) {
            let _batch_${sanitizedId} = _arr_${sanitizedId}.slice(_i_${sanitizedId}, _i_${sanitizedId} + ${chunkSize});
            let _chunk_obj_${sanitizedId} = JSON.parse("{}");
            _chunk_obj_${sanitizedId}.items = _batch_${sanitizedId};
            _chunk_obj_${sanitizedId}.index = Math.floor(_i_${sanitizedId} / ${chunkSize});
            _chunk_obj_${sanitizedId}.count = _batch_${sanitizedId}.length;
            _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
          }
        } else {
          // Return each item individually
          for (let _i_${sanitizedId} = 0; _i_${sanitizedId} < _arr_${sanitizedId}.length; _i_${sanitizedId}++) {
            let _chunk_obj_${sanitizedId} = JSON.parse("{}");
            _chunk_obj_${sanitizedId}.item = _arr_${sanitizedId}[_i_${sanitizedId}];
            _chunk_obj_${sanitizedId}.index = _i_${sanitizedId};
            _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
          }
        }
      }
    } catch(_e_${sanitizedId}) {
      console.log("[TextChunker] Failed to parse JSON: " + _e_${sanitizedId});
      // Fallback to raw text
      _content_type_${sanitizedId} = "raw";
    }
  }

  if (_content_type_${sanitizedId} === "csv") {
    // CSV: parse rows into objects (using header row as keys)
    let _lines_${sanitizedId} = _text_${sanitizedId}.split("\\n").filter(function(_l_) { return _l_.trim().length > 0; });
    let _headers_${sanitizedId} = [];
    let _start_row_${sanitizedId} = 0;

    if (${csvHasHeader} && _lines_${sanitizedId}.length > 0) {
      // Parse header row
      _headers_${sanitizedId} = _lines_${sanitizedId}[0].split(",").map(function(_h_) { return _h_.trim().replace(/^"|"$/g, ''); });
      _start_row_${sanitizedId} = 1;
    }

    for (let _i_${sanitizedId} = _start_row_${sanitizedId}; _i_${sanitizedId} < _lines_${sanitizedId}.length; _i_${sanitizedId}++) {
      let _row_${sanitizedId} = _lines_${sanitizedId}[_i_${sanitizedId}];
      // Simple CSV parsing (handles quoted fields with commas)
      let _cols_${sanitizedId} = [];
      let _in_quote_${sanitizedId} = false;
      let _col_${sanitizedId} = "";
      for (let _c_${sanitizedId} = 0; _c_${sanitizedId} < _row_${sanitizedId}.length; _c_${sanitizedId}++) {
        let _char_${sanitizedId} = _row_${sanitizedId}[_c_${sanitizedId}];
        if (_char_${sanitizedId} === '"') {
          _in_quote_${sanitizedId} = !_in_quote_${sanitizedId};
        } else if (_char_${sanitizedId} === ',' && !_in_quote_${sanitizedId}) {
          _cols_${sanitizedId}.push(_col_${sanitizedId}.trim());
          _col_${sanitizedId} = "";
        } else {
          _col_${sanitizedId} += _char_${sanitizedId};
        }
      }
      _cols_${sanitizedId}.push(_col_${sanitizedId}.trim());

      let _chunk_obj_${sanitizedId} = JSON.parse("{}");
      _chunk_obj_${sanitizedId}.index = _i_${sanitizedId} - _start_row_${sanitizedId};
      _chunk_obj_${sanitizedId}.row = _cols_${sanitizedId};
      if (_headers_${sanitizedId}.length > 0) {
        // Create object with header keys
        let _data_${sanitizedId} = JSON.parse("{}");
        for (let _h_${sanitizedId} = 0; _h_${sanitizedId} < _headers_${sanitizedId}.length; _h_${sanitizedId}++) {
          _data_${sanitizedId}[_headers_${sanitizedId}[_h_${sanitizedId}]] = _cols_${sanitizedId}[_h_${sanitizedId}] || "";
        }
        _chunk_obj_${sanitizedId}.data = _data_${sanitizedId};
      }
      _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
    }
  }

  if (_content_type_${sanitizedId} === "lines") {
    // Lines: split by newlines
    let _lines_${sanitizedId} = _text_${sanitizedId}.split("\\n");
    for (let _i_${sanitizedId} = 0; _i_${sanitizedId} < _lines_${sanitizedId}.length; _i_${sanitizedId}++) {
      let _line_${sanitizedId} = _lines_${sanitizedId}[_i_${sanitizedId}];
      if (_line_${sanitizedId}.trim().length > 0) {
        let _chunk_obj_${sanitizedId} = JSON.parse("{}");
        _chunk_obj_${sanitizedId}.text = _line_${sanitizedId};
        _chunk_obj_${sanitizedId}.index = _i_${sanitizedId};
        _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
      }
    }
  }

  if (_content_type_${sanitizedId} === "raw" || _chunks_${sanitizedId}.length === 0) {
    // Raw text: split into overlapping character chunks
    let _pos_${sanitizedId} = 0;
    let _chunk_idx_${sanitizedId} = 0;
    while (_pos_${sanitizedId} < _text_${sanitizedId}.length) {
      let _end_${sanitizedId} = Math.min(_pos_${sanitizedId} + ${chunkSize}, _text_${sanitizedId}.length);
      let _chunk_${sanitizedId} = _text_${sanitizedId}.substring(_pos_${sanitizedId}, _end_${sanitizedId});
      let _chunk_obj_${sanitizedId} = JSON.parse("{}");
      _chunk_obj_${sanitizedId}.text = _chunk_${sanitizedId};
      _chunk_obj_${sanitizedId}.index = _chunk_idx_${sanitizedId};
      _chunk_obj_${sanitizedId}.start = _pos_${sanitizedId};
      _chunk_obj_${sanitizedId}.end = _end_${sanitizedId};
      _chunk_obj_${sanitizedId}.documentId = "${indexName}_" + _chunk_idx_${sanitizedId};
      _chunks_${sanitizedId}.push(_chunk_obj_${sanitizedId});
      _chunk_idx_${sanitizedId}++;
      _pos_${sanitizedId} = _end_${sanitizedId} - ${overlap};
      if (_pos_${sanitizedId} >= _text_${sanitizedId}.length - ${overlap}) break;
    }
  }

  console.log("[TextChunker] Detected type: " + _content_type_${sanitizedId} + ", chunks: " + _chunks_${sanitizedId}.length);
  } // End of: if (!_is_file_ref_${sanitizedId})
  ${letOrAssign}${outputVar} = _chunks_${sanitizedId};
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreFilesystemCompiler;

  // ../zipp-core/modules/core-filesystem/ui/index.ts
  var ui_exports = {};
  __export(ui_exports, {
    FileReadNode: () => FileReadNode_default,
    FileWriteNode: () => FileWriteNode_default,
    TextChunkerNode: () => TextChunkerNode_default
  });

  // ../zipp-core/modules/core-filesystem/ui/FileReadNode.tsx
  var import_react = __toESM(require_react(), 1);
  var import_react2 = __toESM(require_react2(), 1);
  var import_zipp_ui_components = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime = __toESM(require_jsx_runtime(), 1);
  var FileReadIcon = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) });
  var READ_MODES = [
    { value: "text", label: "Text", description: "Read as UTF-8 text" },
    { value: "base64", label: "Base64", description: "Read as base64 data URL" },
    { value: "json", label: "JSON", description: "Parse as JSON object/array" },
    { value: "csv", label: "CSV", description: "Parse as CSV rows" },
    { value: "lines", label: "Lines", description: "Split into lines array" }
  ];
  function FileReadNode({ data }) {
    const onReadAsChangeRef = (0, import_react.useRef)(data.onReadAsChange);
    const onCsvHasHeaderChangeRef = (0, import_react.useRef)(data.onCsvHasHeaderChange);
    const onCollapsedChangeRef = (0, import_react.useRef)(data.onCollapsedChange);
    (0, import_react.useEffect)(() => {
      onReadAsChangeRef.current = data.onReadAsChange;
      onCsvHasHeaderChangeRef.current = data.onCsvHasHeaderChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleReadAsChange = (0, import_react.useCallback)((e) => {
      onReadAsChangeRef.current?.(e.target.value);
    }, []);
    const handleCsvHasHeaderChange = (0, import_react.useCallback)((e) => {
      onCsvHasHeaderChangeRef.current?.(e.target.checked);
    }, []);
    const readAs = data.readAs || "text";
    const csvHasHeader = data.csvHasHeader !== false;
    const showBodyProperties = data.showBodyProperties !== false;
    const currentMode = READ_MODES.find((m) => m.value === readAs) || READ_MODES[0];
    const getModeColor = () => {
      switch (readAs) {
        case "json":
          return "text-amber-400";
        case "csv":
          return "text-purple-400";
        case "lines":
          return "text-cyan-400";
        case "base64":
          return "text-emerald-400";
        default:
          return "text-blue-400";
      }
    };
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-400", children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: `text-[10px] ${getModeColor()}`, children: currentMode.label }),
      data._fileName && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-500 text-[10px] truncate", children: data._fileName })
    ] });
    const inputHandles = (0, import_react.useMemo)(() => [
      { id: "path", type: "target", position: import_react2.Position.Left, color: "!bg-emerald-500", label: "path", labelColor: "text-emerald-400", size: "md" }
    ], []);
    const outputHandles = (0, import_react.useMemo)(() => [
      { id: "content", type: "source", position: import_react2.Position.Right, color: "!bg-emerald-500", label: "content", labelColor: "text-emerald-400", size: "lg" },
      { id: "info", type: "source", position: import_react2.Position.Right, color: "!bg-slate-500", label: "info", labelColor: "text-slate-400", size: "sm" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      import_zipp_ui_components.CollapsibleNodeWrapper,
      {
        title: "File Read",
        color: "emerald",
        icon: FileReadIcon,
        width: 220,
        collapsedWidth: 120,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: [
          showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Read As" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500",
                  value: readAs,
                  onChange: handleReadAsChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: READ_MODES.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: mode.value, children: mode.label }, mode.value))
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: currentMode.description })
            ] }),
            readAs === "csv" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
                "input",
                {
                  type: "checkbox",
                  className: "nodrag w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-0",
                  checked: csvHasHeader,
                  onChange: handleCsvHasHeaderChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "First row is header" })
            ] })
          ] }),
          data._fileName && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-emerald-900/20 border border-emerald-600/30 rounded text-emerald-400 text-xs truncate", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("svg", { className: "w-3.5 h-3.5 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "truncate", children: data._fileName })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { children: "Input: file path (string or FileInfo)" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [
              "Output: ",
              readAs === "json" ? "parsed object/array" : readAs === "csv" ? "array of row objects" : readAs === "lines" ? "array of strings" : "file content"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "text-slate-600 mt-1", children: "Large files (>10MB) stream via Text Chunker" })
          ] })
        ]
      }
    );
  }
  var FileReadNode_default = (0, import_react.memo)(FileReadNode);

  // ../zipp-core/modules/core-filesystem/ui/FileWriteNode.tsx
  var import_react3 = __toESM(require_react(), 1);
  var import_react4 = __toESM(require_react2(), 1);
  var import_zipp_ui_components2 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime2 = __toESM(require_jsx_runtime(), 1);
  var FileWriteIcon = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" }) });
  var CONTENT_TYPES = [
    { value: "base64", label: "Base64/Binary", description: "For images and binary data" },
    { value: "text", label: "Text", description: "For text files" }
  ];
  function FileWriteNode({ data }) {
    const onTargetPathChangeRef = (0, import_react3.useRef)(data.onTargetPathChange);
    const onFilenamePatternChangeRef = (0, import_react3.useRef)(data.onFilenamePatternChange);
    const onContentTypeChangeRef = (0, import_react3.useRef)(data.onContentTypeChange);
    const onCreateDirectoriesChangeRef = (0, import_react3.useRef)(data.onCreateDirectoriesChange);
    const onCollapsedChangeRef = (0, import_react3.useRef)(data.onCollapsedChange);
    const onBrowseFolderRef = (0, import_react3.useRef)(data.onBrowseFolder);
    (0, import_react3.useEffect)(() => {
      onTargetPathChangeRef.current = data.onTargetPathChange;
      onFilenamePatternChangeRef.current = data.onFilenamePatternChange;
      onContentTypeChangeRef.current = data.onContentTypeChange;
      onCreateDirectoriesChangeRef.current = data.onCreateDirectoriesChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
      onBrowseFolderRef.current = data.onBrowseFolder;
    });
    const handleCollapsedChange = (0, import_react3.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleTargetPathChange = (0, import_react3.useCallback)((e) => {
      onTargetPathChangeRef.current?.(e.target.value);
    }, []);
    const handleFilenamePatternChange = (0, import_react3.useCallback)((e) => {
      onFilenamePatternChangeRef.current?.(e.target.value);
    }, []);
    const handleContentTypeChange = (0, import_react3.useCallback)((e) => {
      onContentTypeChangeRef.current?.(e.target.value);
    }, []);
    const handleCreateDirectoriesChange = (0, import_react3.useCallback)((e) => {
      onCreateDirectoriesChangeRef.current?.(e.target.checked);
    }, []);
    const handleBrowseFolder = (0, import_react3.useCallback)(() => {
      onBrowseFolderRef.current?.();
    }, []);
    const targetPath = data.targetPath || "";
    const filenamePattern = data.filenamePattern || "";
    const contentType = data.contentType || "base64";
    const createDirectories = data.createDirectories ?? true;
    const showBodyProperties = data.showBodyProperties !== false;
    const displayName = filenamePattern || targetPath;
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "text-slate-400", children: displayName ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-teal-400 text-[10px] truncate block", children: displayName.split(/[/\\]/).pop() }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "italic text-slate-500 text-[10px]", children: "No path" }) });
    const inputHandles = (0, import_react3.useMemo)(() => [
      { id: "content", type: "target", position: import_react4.Position.Left, color: "!bg-teal-500", label: "content", labelColor: "text-teal-400", size: "md" },
      { id: "folder", type: "target", position: import_react4.Position.Left, color: "!bg-green-500", label: "folder", labelColor: "text-green-400", size: "md" },
      { id: "info", type: "target", position: import_react4.Position.Left, color: "!bg-slate-500", label: "info", labelColor: "text-slate-400", size: "sm" }
    ], []);
    const outputHandles = (0, import_react3.useMemo)(() => [
      { id: "path", type: "source", position: import_react4.Position.Right, color: "!bg-teal-500", label: "path", labelColor: "text-teal-400", size: "lg" }
    ], []);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
      import_zipp_ui_components2.CollapsibleNodeWrapper,
      {
        title: "File Write",
        color: "teal",
        icon: FileWriteIcon,
        width: 280,
        collapsedWidth: 130,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: [
          showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Output Folder" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex gap-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "input",
                  {
                    type: "text",
                    className: "nodrag nowheel flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 font-mono text-xs",
                    placeholder: "/output/folder or connect",
                    value: targetPath,
                    onChange: handleTargetPathChange,
                    onMouseDown: (e) => e.stopPropagation()
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                  "button",
                  {
                    onClick: handleBrowseFolder,
                    className: "nodrag px-2 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded text-slate-700 dark:text-slate-300 transition-colors",
                    title: "Browse for folder",
                    onMouseDown: (e) => e.stopPropagation(),
                    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-4 h-4", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" }) })
                  }
                )
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: "Connect folder input or enter path manually" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Filename Pattern" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: "text",
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500 font-mono text-xs",
                  placeholder: "{{nameWithoutExt}}_output.txt",
                  value: filenamePattern,
                  onChange: handleFilenamePatternChange,
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: [
                "{{name}}",
                ", ",
                "{{nameWithoutExt}}",
                ", ",
                "{{ext}}",
                ", ",
                "{{index}}"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Content Type" }),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "select",
                {
                  className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-teal-500",
                  value: contentType,
                  onChange: handleContentTypeChange,
                  onMouseDown: (e) => e.stopPropagation(),
                  children: CONTENT_TYPES.map((type) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("option", { value: type.value, children: type.label }, type.value))
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("label", { className: "flex items-center gap-2 cursor-pointer", children: [
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
                "input",
                {
                  type: "checkbox",
                  checked: createDirectories,
                  onChange: handleCreateDirectoriesChange,
                  className: "nodrag w-4 h-4 rounded bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-teal-500 focus:ring-teal-500 focus:ring-offset-0",
                  onMouseDown: (e) => e.stopPropagation()
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Create directories if missing" })
            ] })
          ] }),
          data._lastWrittenPath && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "flex items-center gap-2 px-2 py-1.5 bg-teal-900/20 border border-teal-600/30 rounded text-teal-400 text-xs", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "w-3.5 h-3.5 flex-shrink-0", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M5 13l4 4L19 7" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "truncate", children: data._lastWrittenPath })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Input: content + folder (optional) + file info for templating" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: "Output: written file path" })
          ] })
        ]
      }
    );
  }
  var FileWriteNode_default = (0, import_react3.memo)(FileWriteNode);

  // ../zipp-core/modules/core-filesystem/ui/TextChunkerNode.tsx
  var import_react5 = __toESM(require_react(), 1);
  var import_react6 = __toESM(require_react2(), 1);
  var import_zipp_ui_components3 = __toESM(require_zipp_ui_components(), 1);
  var import_jsx_runtime3 = __toESM(require_jsx_runtime(), 1);
  var TextChunkerIcon = /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: "w-3 h-3 text-white", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M4 6h16M4 12h16m-7 6h7" }) });
  var CONTENT_TYPES2 = [
    { value: "raw", label: "Raw Text", description: "Character-based chunking with overlap" },
    { value: "json_array", label: "JSON Array", description: "Batch array items together" },
    { value: "csv", label: "CSV Rows", description: "Batch CSV rows together" },
    { value: "lines", label: "Lines", description: "Batch lines together" }
  ];
  var EXTENSION_MAP = {
    ".json": "json_array",
    ".csv": "csv",
    ".tsv": "csv",
    ".txt": "raw",
    ".md": "raw",
    ".log": "lines"
  };
  var FORMAT_MAP = {
    "json": "json_array",
    "csv": "csv",
    "lines": "lines",
    "text": "raw"
  };
  function TextChunkerNode({ data }) {
    const onContentTypeChangeRef = (0, import_react5.useRef)(data.onContentTypeChange);
    const onChunkSizeChangeRef = (0, import_react5.useRef)(data.onChunkSizeChange);
    const onOverlapChangeRef = (0, import_react5.useRef)(data.onOverlapChange);
    const onCsvHasHeaderChangeRef = (0, import_react5.useRef)(data.onCsvHasHeaderChange);
    const onCollapsedChangeRef = (0, import_react5.useRef)(data.onCollapsedChange);
    (0, import_react5.useEffect)(() => {
      onContentTypeChangeRef.current = data.onContentTypeChange;
      onChunkSizeChangeRef.current = data.onChunkSizeChange;
      onOverlapChangeRef.current = data.onOverlapChange;
      onCsvHasHeaderChangeRef.current = data.onCsvHasHeaderChange;
      onCollapsedChangeRef.current = data.onCollapsedChange;
    });
    const handleCollapsedChange = (0, import_react5.useCallback)((collapsed) => {
      onCollapsedChangeRef.current?.(collapsed);
    }, []);
    const handleContentTypeChange = (0, import_react5.useCallback)((e) => {
      onContentTypeChangeRef.current?.(e.target.value);
    }, []);
    const handleChunkSizeChange = (0, import_react5.useCallback)((e) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value > 0) {
        onChunkSizeChangeRef.current?.(value);
      }
    }, []);
    const handleOverlapChange = (0, import_react5.useCallback)((e) => {
      const value = parseInt(e.target.value, 10);
      if (!isNaN(value) && value >= 0) {
        onOverlapChangeRef.current?.(value);
      }
    }, []);
    const handleCsvHasHeaderChange = (0, import_react5.useCallback)((e) => {
      onCsvHasHeaderChangeRef.current?.(e.target.checked);
    }, []);
    const chunkSize = data.chunkSize || 1e3;
    const overlap = data.overlap || 100;
    const csvHasHeader = data.csvHasHeader !== false;
    const getDetectedType = () => {
      if (data._sourceFormat && FORMAT_MAP[data._sourceFormat]) {
        return FORMAT_MAP[data._sourceFormat];
      }
      if (data._fileName) {
        const ext = data._fileName.toLowerCase().match(/\.[^.]+$/)?.[0];
        if (ext && EXTENSION_MAP[ext]) {
          return EXTENSION_MAP[ext];
        }
      }
      return null;
    };
    const detectedType = getDetectedType();
    const isAutoDetected = !data.contentType && detectedType !== null;
    const contentType = data.contentType || detectedType || "raw";
    const currentMode = CONTENT_TYPES2.find((m) => m.value === contentType) || CONTENT_TYPES2[0];
    const isRawTextMode = contentType === "raw";
    const isJsonMode = contentType === "json_array";
    const isCsvMode = contentType === "csv";
    const isLinesMode = contentType === "lines";
    const showChunkSize = true;
    const showOverlap = isRawTextMode;
    const showCsvHeader = isCsvMode;
    const getChunkSizeLabel = () => {
      if (isRawTextMode) return "Chunk Size (chars)";
      if (isJsonMode) return "Items per Batch";
      if (isCsvMode) return "Rows per Batch";
      if (isLinesMode) return "Lines per Batch";
      return "Chunk Size";
    };
    const getChunkSizeHelp = () => {
      if (isRawTextMode) return "Characters per chunk";
      if (isJsonMode) return "1 = each item separate, >1 = batch items";
      if (isCsvMode) return "1 = each row separate, >1 = batch rows";
      if (isLinesMode) return "1 = each line separate, >1 = batch lines";
      return "Items per chunk";
    };
    const collapsedPreview = /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-600 dark:text-slate-400 text-[10px]", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-amber-400", children: currentMode.label }),
      isAutoDetected && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-emerald-400 ml-1", children: "\u25CF" }),
      showChunkSize && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-slate-500", children: " \xB7 " }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-amber-300", children: chunkSize })
      ] })
    ] });
    const inputHandles = (0, import_react5.useMemo)(() => [
      { id: "text", type: "target", position: import_react6.Position.Left, color: "!bg-amber-500", label: "input", labelColor: "text-amber-400", size: "md" }
    ], []);
    const outputHandles = (0, import_react5.useMemo)(() => [
      { id: "chunks", type: "source", position: import_react6.Position.Right, color: "!bg-amber-500", label: "chunks", labelColor: "text-amber-400", size: "lg" }
    ], []);
    const showBodyProperties = data.showBodyProperties !== false;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_zipp_ui_components3.CollapsibleNodeWrapper,
      {
        title: "Text Chunker",
        color: "amber",
        icon: TextChunkerIcon,
        width: 260,
        collapsedWidth: 140,
        status: data._status,
        isCollapsed: data._collapsed,
        onCollapsedChange: handleCollapsedChange,
        collapsedPreview,
        inputHandles,
        outputHandles,
        children: showBodyProperties && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center justify-between mb-1", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "Content Type" }),
              isAutoDetected && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { className: "text-emerald-400 text-[10px] flex items-center gap-1", children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u25CF" }),
                " Auto"
              ] })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "select",
              {
                className: `nodrag nowheel w-full bg-white dark:bg-slate-900 border rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none ${isAutoDetected ? "border-emerald-600/50 focus:border-emerald-500" : "border-slate-300 dark:border-slate-600 focus:border-amber-500"}`,
                value: contentType,
                onChange: handleContentTypeChange,
                onMouseDown: (e) => e.stopPropagation(),
                children: CONTENT_TYPES2.map((mode) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("option", { value: mode.value, children: mode.label }, mode.value))
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: isAutoDetected ? `Detected from ${data._sourceFormat ? "File Read" : "file extension"}` : currentMode.description })
          ] }),
          showChunkSize && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: getChunkSizeLabel() }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "number",
                min: 1,
                step: isRawTextMode ? 100 : 1,
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500",
                value: chunkSize,
                onChange: handleChunkSizeChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: getChunkSizeHelp() })
          ] }),
          showOverlap && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "text-slate-600 dark:text-slate-400 text-xs block mb-1", children: "Overlap (chars)" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "number",
                min: 0,
                step: 50,
                className: "nodrag nowheel w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:border-amber-500",
                value: overlap,
                onChange: handleOverlapChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-slate-500 text-[10px] mt-0.5", children: "Overlap between chunks" })
          ] }),
          showCsvHeader && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                type: "checkbox",
                className: "nodrag w-4 h-4 rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-0",
                checked: csvHasHeader,
                onChange: handleCsvHasHeaderChange,
                onMouseDown: (e) => e.stopPropagation()
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "text-slate-600 dark:text-slate-400 text-xs", children: "CSV has header row" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "text-slate-500 text-[10px] border-t border-slate-300 dark:border-slate-700 pt-2 mt-1", children: [
            isJsonMode && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              "Output: ",
              chunkSize === 1 ? "{item, index}" : "{items[], index, count}"
            ] }),
            isCsvMode && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              "Output: ",
              chunkSize === 1 ? "{data, row, index}" : "{rows[], index, count}"
            ] }),
            isLinesMode && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              "Output: ",
              chunkSize === 1 ? "{text, index}" : "{lines[], index, count}"
            ] }),
            isRawTextMode && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { children: [
              "Output: ",
              "{",
              "text, start, end, index",
              "}"
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-slate-600 mt-1", children: "Auto-detects type from .json, .csv, .txt extensions" })
          ] })
        ] })
      }
    );
  }
  var TextChunkerNode_default = (0, import_react5.memo)(TextChunkerNode);

  // ../zipp-core/modules/core-filesystem/_plugin_entry.ts
  var components = ui_exports;
  return __toCommonJS(plugin_entry_exports);
})();
