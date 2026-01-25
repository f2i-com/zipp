"use strict";
var __PLUGIN_EXPORTS__ = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
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
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // ../zipp-core/modules/core-terminal/_plugin_entry.ts
  var plugin_entry_exports = {};
  __export(plugin_entry_exports, {
    compiler: () => compiler_default,
    components: () => components,
    runtime: () => runtime_default
  });

  // ../zipp-core/modules/core-terminal/runtime.ts
  var ctx;
  var sessions = /* @__PURE__ */ new Map();
  async function createSession(shell, workingDir, showWindow, title, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Terminal] Creating session (${shell} mode)`);
    if (!ctx.tauri) {
      throw new Error("Tauri not available - terminal requires native plugin");
    }
    try {
      const result = await ctx.tauri.invoke("plugin:zipp-terminal|terminal_create", {
        config: {
          shell: shell || "auto",
          working_dir: workingDir || void 0,
          show_window: showWindow,
          title: title || void 0,
          width: 800,
          height: 600
        }
      });
      if (!result.success || !result.session_id) {
        throw new Error(result.error || "Failed to create terminal session");
      }
      const session = {
        id: result.session_id,
        shell: shell || "auto",
        workingDir: result.data || workingDir || "."
      };
      sessions.set(session.id, session);
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Terminal] Session created: ${session.id}`);
      return session;
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Terminal] Failed to create session: ${errMsg}`);
      throw error;
    }
  }
  function buildAIPrompt(taskDescription, history, systemPrompt) {
    let prompt = systemPrompt + "\n\n";
    prompt += `## Task
${taskDescription}

`;
    if (history.length > 0) {
      prompt += "## Previous Actions\n";
      for (const entry of history) {
        prompt += `- ${entry}
`;
      }
      prompt += "\n";
    }
    prompt += `## Instructions
Analyze the screenshot(s) and respond with JSON:

\`\`\`json
{
  "observation": "What you see on the screen",
  "reasoning": "Your thought process for what to do next",
  "action": { "type": "type|key|combo", "value": "text or key name" },
  "done": false
}
\`\`\`

Action types:
- "type": Type text (simulates keyboard typing)
- "key": Press a special key (Enter, Tab, Escape, ArrowUp, ArrowDown, etc.)
- "combo": Key combination (Ctrl+C, Ctrl+D, Alt+Tab, etc.)

When the task is complete:
\`\`\`json
{
  "observation": "...",
  "reasoning": "...",
  "action": null,
  "done": true,
  "result": "Summary of what was accomplished"
}
\`\`\`

Respond ONLY with valid JSON, no other text.`;
    return prompt;
  }
  function parseAIResponse(response) {
    let jsonStr = response.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    try {
      const parsed = JSON.parse(jsonStr);
      return {
        observation: parsed.observation || "",
        reasoning: parsed.reasoning || "",
        action: parsed.action || null,
        done: parsed.done === true,
        result: parsed.result
      };
    } catch {
      return {
        observation: "Failed to parse AI response",
        reasoning: response,
        action: null,
        done: true,
        result: "Error: Could not parse AI response as JSON"
      };
    }
  }
  async function aiControl(sessionOrNull, taskDescription, options, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    if (!taskDescription || taskDescription.trim().length === 0) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Task description is required. Please describe what the AI should accomplish.");
    }
    ctx.log("info", `[Terminal] Starting AI control for task: ${taskDescription.substring(0, 50)}...`);
    if (!ctx.tauri) {
      ctx.onNodeStatus?.(nodeId, "error");
      throw new Error("Tauri not available - terminal requires native plugin. This node only works in the desktop app.");
    }
    let session;
    let createdNewSession = false;
    if (sessionOrNull && sessionOrNull.id) {
      session = sessionOrNull;
      ctx.log("info", `[Terminal] Using existing session: ${session.id}`);
    } else {
      ctx.log("info", `[Terminal] Creating new terminal session...`);
      session = await createSession(
        options.shell || "auto",
        options.workingDir || "",
        options.showWindow !== false,
        // Default to true
        "Terminal AI",
        nodeId
      );
      createdNewSession = true;
    }
    await delay(500);
    const history = [];
    let previousScreenshot = options.contextImage || null;
    let finalScreenshot = "";
    let iteration = 0;
    try {
      while (iteration < options.maxIterations) {
        if (ctx.abortSignal?.aborted) {
          ctx.log("info", "[Terminal] Aborted by user");
          ctx.onNodeStatus?.(nodeId, "completed");
          return {
            session,
            result: "Aborted by user",
            screenshot: finalScreenshot
          };
        }
        iteration++;
        ctx.log("info", `[Terminal] AI iteration ${iteration}/${options.maxIterations}`);
        const currentScreenshot = await ctx.tauri.invoke(
          "plugin:zipp-terminal|terminal_screenshot",
          { sessionId: session.id }
        );
        finalScreenshot = currentScreenshot;
        const images = [currentScreenshot];
        if (previousScreenshot && previousScreenshot !== currentScreenshot) {
          images.unshift(previousScreenshot);
        }
        const prompt = buildAIPrompt(taskDescription, history, options.systemPrompt);
        let aiResponse;
        try {
          const aiSettings = ctx.settings?.["core-ai"];
          let resolvedApiKey = options.apiKey || "";
          if (options.apiKeyConstant && ctx.getConstant) {
            const constantKey = ctx.getConstant(options.apiKeyConstant);
            if (constantKey) {
              resolvedApiKey = constantKey;
              ctx.log("info", `[Terminal] Using API key from constant: ${options.apiKeyConstant}`);
            }
          }
          if (!resolvedApiKey) {
            resolvedApiKey = aiSettings?.defaultApiKey || "";
            if (resolvedApiKey) {
              ctx.log("info", "[Terminal] Using API key from module settings");
            }
          }
          let resolvedEndpoint = options.endpoint || "";
          if (!resolvedEndpoint) {
            switch (options.provider) {
              case "openai":
                resolvedEndpoint = "https://api.openai.com/v1/chat/completions";
                break;
              case "anthropic":
                resolvedEndpoint = "https://api.anthropic.com/v1/messages";
                break;
              case "google":
                resolvedEndpoint = "https://generativelanguage.googleapis.com/v1beta/models";
                break;
              case "openrouter":
                resolvedEndpoint = "https://openrouter.ai/api/v1/chat/completions";
                break;
              case "groq":
                resolvedEndpoint = "https://api.groq.com/openai/v1/chat/completions";
                break;
              case "ollama":
                resolvedEndpoint = aiSettings?.ollamaEndpoint || "http://localhost:11434/api/chat";
                break;
              case "lmstudio":
                resolvedEndpoint = aiSettings?.lmstudioEndpoint || "http://localhost:1234/v1/chat/completions";
                break;
              default:
                resolvedEndpoint = aiSettings?.defaultEndpoint || "https://api.openai.com/v1/chat/completions";
            }
          }
          let resolvedModel = options.model || "";
          if (!resolvedModel) {
            switch (options.provider) {
              case "openai":
                resolvedModel = "gpt-4o";
                break;
              case "anthropic":
                resolvedModel = "claude-3-5-sonnet-20241022";
                break;
              case "google":
                resolvedModel = "gemini-1.5-flash";
                break;
              case "openrouter":
                resolvedModel = "openai/gpt-4o";
                break;
              case "groq":
                resolvedModel = "llama-3.2-90b-vision-preview";
                break;
              default:
                resolvedModel = aiSettings?.defaultModel || "gpt-4o";
            }
          }
          const isLocalProvider = ["ollama", "lmstudio", "custom"].includes(options.provider);
          if (ctx.fetch && (resolvedApiKey || isLocalProvider)) {
            ctx.log("info", `[Terminal] Using direct ${options.provider} API call to ${resolvedEndpoint}`);
            const headers = {
              "Content-Type": "application/json"
            };
            let body;
            if (options.format === "anthropic" || options.provider === "anthropic") {
              headers["x-api-key"] = resolvedApiKey;
              headers["anthropic-version"] = "2023-06-01";
              body = JSON.stringify({
                model: resolvedModel,
                max_tokens: options.maxTokens || 1e3,
                system: options.systemPrompt,
                messages: [
                  {
                    role: "user",
                    content: [
                      ...images.map((img) => ({
                        type: "image",
                        source: {
                          type: "base64",
                          media_type: "image/jpeg",
                          data: img.replace(/^data:image\/\w+;base64,/, "")
                        }
                      })),
                      { type: "text", text: prompt }
                    ]
                  }
                ]
              });
            } else if (options.provider === "ollama") {
              body = JSON.stringify({
                model: resolvedModel,
                messages: [
                  ...options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : [],
                  {
                    role: "user",
                    content: prompt,
                    images: images.map((img) => img.replace(/^data:image\/\w+;base64,/, ""))
                  }
                ],
                stream: false
              });
            } else {
              if (resolvedApiKey) {
                headers["Authorization"] = `Bearer ${resolvedApiKey}`;
              }
              body = JSON.stringify({
                model: resolvedModel,
                max_tokens: options.maxTokens || 1e3,
                messages: [
                  ...options.systemPrompt ? [{ role: "system", content: options.systemPrompt }] : [],
                  {
                    role: "user",
                    content: [
                      ...images.map((img) => ({
                        type: "image_url",
                        image_url: { url: img, detail: "high" }
                      })),
                      { type: "text", text: prompt }
                    ]
                  }
                ]
              });
            }
            const response = await ctx.fetch(resolvedEndpoint, {
              method: "POST",
              headers,
              body
            });
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`API call failed (${response.status}): ${errorText.substring(0, 200)}`);
            }
            const data = await response.json();
            if (options.format === "anthropic" || options.provider === "anthropic") {
              aiResponse = data.content?.[0]?.text || "";
            } else if (options.provider === "ollama") {
              aiResponse = data.message?.content || "";
            } else {
              aiResponse = data.choices?.[0]?.message?.content || "";
            }
            if (!aiResponse) {
              ctx.log("warn", "[Terminal] AI returned empty response");
            } else {
              ctx.log("info", `[Terminal] AI response received (${aiResponse.length} chars)`);
            }
          } else {
            throw new Error("No API key configured. Please set up an AI provider with an API key in the node settings or project constants.");
          }
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : "Unknown error";
          ctx.log("error", `[Terminal] AI call failed: ${errMsg}`);
          return {
            session,
            result: `AI error: ${errMsg}`,
            screenshot: finalScreenshot
          };
        }
        const parsed = parseAIResponse(aiResponse);
        ctx.log("info", `[Terminal] Parsed - done: ${parsed.done}, has action: ${!!parsed.action}`);
        history.push(`${parsed.observation} -> ${parsed.reasoning}`);
        ctx.log("info", `[Terminal] AI observation: ${parsed.observation}`);
        if (parsed.done) {
          ctx.onNodeStatus?.(nodeId, "completed");
          ctx.log("success", `[Terminal] AI task completed: ${parsed.result}`);
          return {
            session,
            result: parsed.result || "Task completed",
            screenshot: finalScreenshot
          };
        }
        if (parsed.action) {
          const keys = [{
            action_type: parsed.action.type,
            value: parsed.action.value
          }];
          try {
            await ctx.tauri.invoke("plugin:zipp-terminal|terminal_send_keys", {
              sessionId: session.id,
              keys
            });
            ctx.log("info", `[Terminal] Sent ${parsed.action.type}: ${parsed.action.value}`);
          } catch (error) {
            const errMsg = error instanceof Error ? error.message : "Unknown error";
            ctx.log("error", `[Terminal] Failed to send keys: ${errMsg}`);
          }
          await delay(options.screenshotDelayMs);
        }
        previousScreenshot = currentScreenshot;
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("warn", `[Terminal] Max iterations (${options.maxIterations}) reached`);
      return {
        session,
        result: "Max iterations reached without completion",
        screenshot: finalScreenshot
      };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Terminal] AI control failed: ${errMsg}`);
      ctx.onNodeStatus?.(nodeId, "error");
      if (createdNewSession && session?.id) {
        try {
          await closeSession(session.id);
        } catch (err) {
          ctx.log("warn", `[Terminal] Session cleanup warning: ${err}`);
        }
      }
      return {
        session: session || { id: "", shell: "", workingDir: "" },
        result: `Error: ${errMsg}`,
        screenshot: finalScreenshot || ""
      };
    }
  }
  async function runCommand(session, command, options, nodeId) {
    ctx.onNodeStatus?.(nodeId, "running");
    ctx.log("info", `[Terminal] Running command: ${command}`);
    if (!ctx.tauri) {
      throw new Error("Tauri not available - terminal requires native plugin");
    }
    try {
      const typeKeys = [{
        action_type: "type",
        value: command
      }];
      await ctx.tauri.invoke("plugin:zipp-terminal|terminal_send_keys", {
        sessionId: session.id,
        keys: typeKeys
      });
      await delay(100);
      const enterKey = [{
        action_type: "key",
        value: "Enter"
      }];
      await ctx.tauri.invoke("plugin:zipp-terminal|terminal_send_keys", {
        sessionId: session.id,
        keys: enterKey
      });
      await delay(options.waitMs);
      const output = await ctx.tauri.invoke(
        "plugin:zipp-terminal|terminal_read_output",
        { sessionId: session.id, maxLines: 100 }
      );
      let screenshot = null;
      if (options.takeScreenshot) {
        screenshot = await ctx.tauri.invoke(
          "plugin:zipp-terminal|terminal_screenshot",
          { sessionId: session.id }
        );
      }
      ctx.onNodeStatus?.(nodeId, "completed");
      ctx.log("success", `[Terminal] Command completed`);
      return { session, output, screenshot };
    } catch (error) {
      ctx.onNodeStatus?.(nodeId, "error");
      const errMsg = error instanceof Error ? error.message : "Unknown error";
      ctx.log("error", `[Terminal] Command failed: ${errMsg}`);
      throw error;
    }
  }
  async function closeSession(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    if (ctx.tauri) {
      try {
        await ctx.tauri.invoke("plugin:zipp-terminal|terminal_close", {
          sessionId
        });
      } catch (err) {
        ctx.log("warn", `[Terminal] Close session warning: ${err}`);
      }
    }
    sessions.delete(sessionId);
    ctx.log("info", `[Terminal] Session closed: ${sessionId}`);
  }
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  var CoreTerminalRuntime = {
    name: "Terminal",
    async init(context) {
      ctx = context;
      ctx?.log?.("info", "[Terminal] Module initialized");
    },
    methods: {
      createSession,
      aiControl,
      runCommand,
      closeSession
    },
    async cleanup() {
      for (const sessionId of sessions.keys()) {
        await closeSession(sessionId);
      }
      ctx?.log?.("info", "[Terminal] Module cleanup");
    }
  };
  var runtime_default = CoreTerminalRuntime;

  // ../zipp-core/modules/core-terminal/compiler.ts
  var CoreTerminalCompiler = {
    name: "Terminal",
    getNodeTypes() {
      return ["terminal_session", "terminal_ai_control", "terminal_run_command"];
    },
    compileNode(nodeType, ctx2) {
      const { node, inputs, outputVar, sanitizedId, skipVarDeclaration, escapeString } = ctx2;
      const data = node.data;
      const props = data?.properties || {};
      const letOrAssign = skipVarDeclaration ? "" : "let ";
      let code = `
  // --- Node: ${node.id} (${nodeType}) ---`;
      switch (nodeType) {
        case "terminal_session": {
          const shell = escapeString(String(props.shell || "auto"));
          const workingDir = escapeString(String(props.workingDir || ""));
          const showWindow = props.showWindow === true;
          const title = escapeString(String(props.title || ""));
          code += `
  ${letOrAssign}${outputVar} = await Terminal.createSession("${shell}", "${workingDir}", ${showWindow}, "${title}", "${node.id}");
  if (${outputVar} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }
  workflow_context["${node.id}"] = ${outputVar};`;
          break;
        }
        case "terminal_ai_control": {
          const sessionInput = inputs.get("session") || inputs.get("default");
          const sessionVar = sessionInput || "null";
          const taskInput = inputs.get("task");
          const taskDescription = escapeString(String(props.taskDescription || ""));
          const taskExpr = taskInput || `"${taskDescription}"`;
          const contextImageInput = inputs.get("contextImage");
          const contextImageExpr = contextImageInput || "null";
          const shell = escapeString(String(props.shell || "auto"));
          const workingDir = escapeString(String(props.workingDir || ""));
          const showWindow = props.showWindow !== false;
          const systemPrompt = escapeString(String(props.systemPrompt || "You are an AI assistant controlling a terminal."));
          const screenshotDelayMs = Number(props.screenshotDelayMs) || 500;
          const maxIterations = Number(props.maxIterations) || 20;
          const provider = escapeString(String(props.provider || "openai"));
          const model = escapeString(String(props.model || ""));
          const apiKey = escapeString(String(props.apiKey || ""));
          const apiKeyConstant = escapeString(String(props.apiKeyConstant || ""));
          const endpoint = escapeString(String(props.endpoint || ""));
          const format = escapeString(String(props.format || "openai"));
          const maxTokens = Number(props.maxTokens) || 1e3;
          code += `
  // Terminal AI Control
  let _session_input_${sanitizedId} = ${sessionVar};
  let _task_${sanitizedId} = ${taskExpr};
  let _context_image_${sanitizedId} = ${contextImageExpr};

  let _ai_options_${sanitizedId} = {
    shell: "${shell}",
    workingDir: "${workingDir}",
    showWindow: ${showWindow},
    systemPrompt: "${systemPrompt}",
    screenshotDelayMs: ${screenshotDelayMs},
    maxIterations: ${maxIterations},
    provider: "${provider}",
    model: "${model}",
    apiKey: "${apiKey}",
    apiKeyConstant: "${apiKeyConstant}",
    endpoint: "${endpoint}",
    format: "${format}",
    maxTokens: ${maxTokens},
    contextImage: _context_image_${sanitizedId}
  };

  let _ai_result_${sanitizedId} = await Terminal.aiControl(_session_input_${sanitizedId}, _task_${sanitizedId}, _ai_options_${sanitizedId}, "${node.id}");

  if (_ai_result_${sanitizedId} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }

  // Extract values using direct property access (FormLogic handles this correctly)
  ${letOrAssign}${outputVar} = _ai_result_${sanitizedId};
  ${letOrAssign}${outputVar}_session = _ai_result_${sanitizedId} ? _ai_result_${sanitizedId}.session : null;
  ${letOrAssign}${outputVar}_result = _ai_result_${sanitizedId} ? (_ai_result_${sanitizedId}.result || "") : "";
  ${letOrAssign}${outputVar}_screenshot = _ai_result_${sanitizedId} ? (_ai_result_${sanitizedId}.screenshot || "") : "";

  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_session"] = ${outputVar}_session;
  workflow_context["${node.id}_result"] = ${outputVar}_result;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;`;
          break;
        }
        case "terminal_run_command": {
          const sessionInput = inputs.get("session") || inputs.get("default");
          const sessionVar = sessionInput || "null";
          const commandInput = inputs.get("command");
          const commandText = escapeString(String(props.commandText || ""));
          const commandExpr = commandInput || `"${commandText}"`;
          const waitMs = Number(props.waitMs) || 1e3;
          const takeScreenshot = props.takeScreenshot === true;
          code += `
  // Terminal Run Command
  let _session_${sanitizedId} = ${sessionVar};
  let _command_${sanitizedId} = ${commandExpr};

  let _cmd_options_${sanitizedId} = {
    waitMs: ${waitMs},
    takeScreenshot: ${takeScreenshot}
  };

  let _cmd_result_${sanitizedId} = await Terminal.runCommand(_session_${sanitizedId}, _command_${sanitizedId}, _cmd_options_${sanitizedId}, "${node.id}");

  if (_cmd_result_${sanitizedId} === "__ABORT__") {
    console.log("[Workflow] Aborted");
    return workflow_context;
  }

  // Extract values using direct property access (FormLogic handles this correctly)
  ${letOrAssign}${outputVar} = _cmd_result_${sanitizedId};
  ${letOrAssign}${outputVar}_session = _cmd_result_${sanitizedId} ? _cmd_result_${sanitizedId}.session : null;
  ${letOrAssign}${outputVar}_output = _cmd_result_${sanitizedId} ? (_cmd_result_${sanitizedId}.output || "") : "";
  ${letOrAssign}${outputVar}_screenshot = _cmd_result_${sanitizedId} ? (_cmd_result_${sanitizedId}.screenshot || "") : "";

  workflow_context["${node.id}"] = ${outputVar};
  workflow_context["${node.id}_session"] = ${outputVar}_session;
  workflow_context["${node.id}_output"] = ${outputVar}_output;
  workflow_context["${node.id}_screenshot"] = ${outputVar}_screenshot;`;
          break;
        }
        default:
          return null;
      }
      return code;
    }
  };
  var compiler_default = CoreTerminalCompiler;

  // ../zipp-core/modules/core-terminal/_plugin_entry.ts
  var uiComponents = {};
  var components = uiComponents;
  return __toCommonJS(plugin_entry_exports);
})();
