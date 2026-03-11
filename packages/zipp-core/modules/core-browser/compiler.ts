/**
 * Core Browser Module Compiler
 *
 * Compiles browser automation nodes into FormLogic code.
 */

import type { ModuleCompiler, ModuleCompilerContext } from '../../src/module-types';

const CoreBrowserCompiler: ModuleCompiler = {
  name: 'Browser',

  getNodeTypes() {
    return ['browser_session', 'browser_request', 'browser_extract', 'browser_control'];
  },

  compileNode(nodeType: string, ctx: ModuleCompilerContext): string | null {
    const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString, debugEnabled } = ctx;
    const data = node.data;
    const letOrAssign = skipVarDeclaration ? '' : 'let ';
    const debug = debugEnabled ?? false;
    // Check multiple possible handle names: 'default', 'input', 'content'
    const inputVar = inputs.get('default') || inputs.get('input') || inputs.get('content') || 'null';

    let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;

    switch (nodeType) {
      case 'browser_session': {
        // Handle various field naming conventions
        const profile = escapeString(String(data.profile || data.browserProfile || 'default'));
        const sessionMode = String(data.sessionMode || 'webview'); // webview or playwright
        if (debug) {
          console.log(`[Browser Compiler] browser_session node ${node.id}: sessionMode="${sessionMode}", data.sessionMode="${data.sessionMode}", playwrightUrl="${data.playwrightUrl}"`);
        }
        const userAgent = escapeString(String(data.userAgent || data.customUserAgent || ''));
        const customHeaders = escapeString(String(data.customHeaders || data.headers || '{}'));
        const initialCookies = escapeString(String(data.initialCookies || data.cookies || '{}'));
        const playwrightUrl = escapeString(String(data.playwrightUrl || 'http://127.0.0.1:8769'));

        if (sessionMode === 'playwright') {
          // Playwright session - create via HTTP API
          // Note: Headless mode is controlled by PLAYWRIGHT_HEADLESS env var in the service
          // Only pass custom user agent string, not preset names like "chrome"
          const customUserAgent = escapeString(String(data.customUserAgent || ''));

          // Extract port from URL for dynamic service lookup (default: 8769)
          const portMatch = playwrightUrl.match(/:(\d+)/);
          const playwrightPort = portMatch ? portMatch[1] : '8769';

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
          // WebView session - use existing Browser.createSession
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

      case 'browser_request': {
        // URL can come from connected input or from node data
        const urlInput = inputs.get('url');
        const staticUrl = escapeString(String(data.url || ''));
        const method = escapeString(String(data.method || 'GET'));
        const headers = escapeString(String(data.headers || '{}'));
        const staticBody = escapeString(String(data.body || ''));

        // Allow local network requests (for localhost services like ComfyUI, Ollama, package services)
        const allowLocalNetwork = data.allowLocalNetwork === true;

        // Body can come from connected input or from node data
        const bodyInput = inputs.get('body');

        // Get session from input if connected
        const sessionInput = inputs.get('session');
        const sessionVar = sessionInput || 'null';

        // Use URL input if connected, otherwise use static URL from data
        const urlExpr = urlInput ? urlInput : `"${staticUrl}"`;

        // Use body input if connected, otherwise use static body from data
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

      case 'browser_extract': {
        // Handle various field naming conventions
        // type/extractType/extractionType for the extraction type
        // pattern/selector for the selector/pattern
        // attribute/extractTarget for what to extract
        const extractType = escapeString(String(data.type || data.extractType || data.extractionType || 'selector'));
        const pattern = escapeString(String(data.pattern || data.selector || ''));
        const attribute = escapeString(String(data.attribute || data.extractTarget || 'text'));
        const maxLength = Number(data.maxLength) || 0;

        // Input can be response body or page HTML
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
  }` : ''}
  workflow_context["${node.id}"] = ${outputVar};`;
        break;
      }

      case 'browser_control': {
        const staticAction = escapeString(String(data.action || ''));
        const staticTarget = escapeString(String(data.target || data.selector || ''));
        const staticValue = escapeString(String(data.value || ''));
        const timeout = Number(data.timeout) || 30000;
        const takeScreenshot = data.takeScreenshot === true;

        // Get session from input
        const sessionInput = inputs.get('session');
        const sessionVar = sessionInput || 'null';

        // Check for dynamic inputs (selector, value) that override static config
        const selectorInput = inputs.get('selector');
        const valueInput = inputs.get('value');

        // Check if action comes from a connected input (e.g., AI output)
        const actionInput = inputs.get('action');

        if (actionInput) {
          // Dynamic action from connected input (AI agent mode)
          // Parse JSON to extract action, selector, reason
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
  ${selectorInput ? `_selector_${sanitizedId} = "" + (${selectorInput} || "");` : ''}
  // Override value with separate value input if connected
  ${valueInput ? `let _value_${sanitizedId} = "" + (${valueInput} || "");` : `let _value_${sanitizedId} = "";`}

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
  }` : ''}
  ${letOrAssign}${outputVar}_session = _session_${sanitizedId};
  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_page"] = ${outputVar}_page;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;
  workflow_context["${node.id}_session"] = ${outputVar}_session;`;
        } else {
          // Static action from node configuration (with optional dynamic selector/value inputs)
          const targetExpr = selectorInput ? selectorInput : `"${staticTarget}"`;
          const valueExpr = valueInput ? valueInput : `"${staticValue}"`;
          code += `
  // Browser control: ${staticAction || 'goto'}
  let _session_${sanitizedId} = ${sessionVar};
  let _target_${sanitizedId} = ${targetExpr};
  let _value_${sanitizedId} = ${valueExpr};
  ${letOrAssign}${outputVar} = "";
  ${letOrAssign}${outputVar}_page = "";
  ${letOrAssign}${outputVar}_screenshot = "";
  ${letOrAssign}${outputVar}_session = _session_${sanitizedId};
  console.log("[Browser] Control action: ${staticAction || 'goto'} on " + _target_${sanitizedId});

  // Check if using Playwright mode
  let _is_playwright_${sanitizedId} = _session_${sanitizedId} && _session_${sanitizedId}.mode === "playwright";

  if (!_session_${sanitizedId} || !_session_${sanitizedId}.id) {
    console.log("[Browser] No valid session");
  } else if (_is_playwright_${sanitizedId}) {
    // ===== PLAYWRIGHT MODE (static action) =====
    console.log("[Browser] (${node.id}) Static action via Playwright service...");
    let _pw_endpoint_${sanitizedId} = _session_${sanitizedId}.serviceUrl + "/session/" + _session_${sanitizedId}.id;
    let _static_action_${sanitizedId} = "${staticAction || 'goto'}";
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
    }` : ''}
  } else {
    // ===== WEBVIEW MODE (static action) =====
    let _ctrl_result_${sanitizedId} = await Browser.control(
      _session_${sanitizedId},
      "${staticAction || 'goto'}",
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
    if ("${staticAction || 'goto'}" === "goto") {
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
    }` : ''}
  }
  workflow_context["${node.id}"] = ${outputVar};`;
        }
        break;
      }

      default:
        return null;
    }

    return code;
  },
};

export default CoreBrowserCompiler;
