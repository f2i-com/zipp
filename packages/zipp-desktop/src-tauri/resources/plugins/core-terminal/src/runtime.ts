/**
 * Core Terminal Module Runtime
 *
 * Provides AI-driven terminal automation with keyboard simulation.
 * Uses native Tauri plugin for PTY management and keyboard input.
 *
 * Native Rust plugin: zipp-terminal (see native/src/lib.rs)
 */

import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

// Module-level context reference (set during init)
let ctx: RuntimeContext;

// =============================================================================
// Types
// =============================================================================

interface TerminalSession {
  id: string;
  shell: string;
  workingDir: string;
}

interface KeyAction {
  action_type: 'type' | 'key' | 'combo';
  value: string;
  delay_ms?: number;
}

interface AIControlOptions {
  // Session creation options (used when no session provided)
  shell?: string;
  workingDir?: string;
  showWindow?: boolean;
  // AI options
  systemPrompt: string;
  screenshotDelayMs: number;
  maxIterations: number;
  provider: string;
  model: string;
  apiKey: string;
  apiKeyConstant: string;
  endpoint: string;
  format: string;
  maxTokens: number;
  // Optional context image for additional AI context
  contextImage?: string;
}

interface AIControlResult {
  session: TerminalSession;
  result: string;
  screenshot: string;
}

interface AIResponse {
  observation: string;
  reasoning: string;
  action: { type: string; value: string } | null;
  done: boolean;
  result?: string;
}

interface TerminalResult {
  success: boolean;
  session_id?: string;
  data?: string;
  error?: string;
}

interface RunCommandOptions {
  waitMs: number;
  takeScreenshot: boolean;
}

interface RunCommandResult {
  session: TerminalSession;
  output: string;
  screenshot: string | null;
}

// Local cache for sessions
const sessions: Map<string, TerminalSession> = new Map();

// =============================================================================
// Session Management
// =============================================================================

/**
 * Create a new terminal session
 */
async function createSession(
  shell: string,
  workingDir: string,
  showWindow: boolean,
  title: string,
  nodeId: string
): Promise<TerminalSession> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Terminal] Creating session (${shell} mode)`);

  if (!ctx.tauri) {
    throw new Error('Tauri not available - terminal requires native plugin');
  }

  try {
    const result = await ctx.tauri.invoke<TerminalResult>('plugin:zipp-terminal|terminal_create', {
      config: {
        shell: shell || 'auto',
        working_dir: workingDir || undefined,
        show_window: showWindow,
        title: title || undefined,
        width: 800,
        height: 600,
      },
    });

    if (!result.success || !result.session_id) {
      throw new Error(result.error || 'Failed to create terminal session');
    }

    const session: TerminalSession = {
      id: result.session_id,
      shell: shell || 'auto',
      workingDir: result.data || workingDir || '.',
    };

    sessions.set(session.id, session);
    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Terminal] Session created: ${session.id}`);

    return session;
  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Terminal] Failed to create session: ${errMsg}`);
    throw error;
  }
}

// =============================================================================
// AI Control Loop
// =============================================================================

/**
 * Build the AI prompt for terminal control
 */
function buildAIPrompt(
  taskDescription: string,
  history: string[],
  systemPrompt: string
): string {
  let prompt = systemPrompt + '\n\n';
  prompt += `## Task\n${taskDescription}\n\n`;

  if (history.length > 0) {
    prompt += '## Previous Actions\n';
    for (const entry of history) {
      prompt += `- ${entry}\n`;
    }
    prompt += '\n';
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

/**
 * Parse AI response JSON
 */
function parseAIResponse(response: string): AIResponse {
  // Try to extract JSON from the response
  let jsonStr = response.trim();

  // Handle markdown code blocks
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return {
      observation: parsed.observation || '',
      reasoning: parsed.reasoning || '',
      action: parsed.action || null,
      done: parsed.done === true,
      result: parsed.result,
    };
  } catch {
    // If parsing fails, return a default response
    return {
      observation: 'Failed to parse AI response',
      reasoning: response,
      action: null,
      done: true,
      result: 'Error: Could not parse AI response as JSON',
    };
  }
}

/**
 * AI-driven terminal control loop
 *
 * @param sessionOrNull - Optional existing session. If null/undefined, creates a new terminal.
 * @param taskDescription - What the AI should accomplish
 * @param options - AI and session configuration
 * @param nodeId - Node ID for status updates
 */
async function aiControl(
  sessionOrNull: TerminalSession | null | undefined,
  taskDescription: string,
  options: AIControlOptions,
  nodeId: string
): Promise<AIControlResult> {
  ctx.onNodeStatus?.(nodeId, 'running');

  // Validate task description
  if (!taskDescription || taskDescription.trim().length === 0) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error('Task description is required. Please describe what the AI should accomplish.');
  }

  ctx.log('info', `[Terminal] Starting AI control for task: ${taskDescription.substring(0, 50)}...`);

  if (!ctx.tauri) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error('Tauri not available - terminal requires native plugin. This node only works in the desktop app.');
  }

  // Create session if not provided
  let session: TerminalSession;
  let createdNewSession = false;

  if (sessionOrNull && sessionOrNull.id) {
    session = sessionOrNull;
    ctx.log('info', `[Terminal] Using existing session: ${session.id}`);
  } else {
    ctx.log('info', `[Terminal] Creating new terminal session...`);
    session = await createSession(
      options.shell || 'auto',
      options.workingDir || '',
      options.showWindow !== false, // Default to true
      'Terminal AI',
      nodeId
    );
    createdNewSession = true;
  }

  // Wait a moment for the terminal to be ready
  await delay(500);

  const history: string[] = [];
  let previousScreenshot: string | null = options.contextImage || null;
  let finalScreenshot = '';
  let iteration = 0;

  try {
    while (iteration < options.maxIterations) {
      // Check for abort at the start of each iteration
      if (ctx.abortSignal?.aborted) {
        ctx.log('info', '[Terminal] Aborted by user');
        ctx.onNodeStatus?.(nodeId, 'completed');
        return {
          session,
          result: 'Aborted by user',
          screenshot: finalScreenshot,
        };
      }

      iteration++;
      ctx.log('info', `[Terminal] AI iteration ${iteration}/${options.maxIterations}`);

      // Take a screenshot
      const currentScreenshot = await ctx.tauri.invoke<string>(
        'plugin:zipp-terminal|terminal_screenshot',
        { sessionId: session.id }
      );
      finalScreenshot = currentScreenshot;

      // Build images array for AI
      const images: string[] = [currentScreenshot];
      if (previousScreenshot && previousScreenshot !== currentScreenshot) {
        images.unshift(previousScreenshot);
      }

      // Build prompt
      const prompt = buildAIPrompt(taskDescription, history, options.systemPrompt);

      // Call AI with vision
      let aiResponse: string;
      try {
        // Get AI settings once
        const aiSettings = ctx.settings?.['core-ai'] as Record<string, string> | undefined;

        // Resolve API key - check constant first, then direct key, then settings
        let resolvedApiKey = options.apiKey || '';
        if (options.apiKeyConstant && ctx.getConstant) {
          const constantKey = ctx.getConstant(options.apiKeyConstant);
          if (constantKey) {
            resolvedApiKey = constantKey;
            ctx.log('info', `[Terminal] Using API key from constant: ${options.apiKeyConstant}`);
          }
        }
        // Fall back to module settings if no key provided
        if (!resolvedApiKey) {
          resolvedApiKey = aiSettings?.defaultApiKey || '';
          if (resolvedApiKey) {
            ctx.log('info', '[Terminal] Using API key from module settings');
          }
        }

        // Resolve endpoint based on provider
        let resolvedEndpoint = options.endpoint || '';
        if (!resolvedEndpoint) {
          switch (options.provider) {
            case 'openai':
              resolvedEndpoint = 'https://api.openai.com/v1/chat/completions';
              break;
            case 'anthropic':
              resolvedEndpoint = 'https://api.anthropic.com/v1/messages';
              break;
            case 'google':
              resolvedEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
              break;
            case 'openrouter':
              resolvedEndpoint = 'https://openrouter.ai/api/v1/chat/completions';
              break;
            case 'groq':
              resolvedEndpoint = 'https://api.groq.com/openai/v1/chat/completions';
              break;
            case 'ollama':
              resolvedEndpoint = aiSettings?.ollamaEndpoint || 'http://localhost:11434/api/chat';
              break;
            case 'lmstudio':
              resolvedEndpoint = aiSettings?.lmstudioEndpoint || 'http://localhost:1234/v1/chat/completions';
              break;
            default:
              resolvedEndpoint = aiSettings?.defaultEndpoint || 'https://api.openai.com/v1/chat/completions';
          }
        }

        // Resolve model - use provider defaults if not specified
        let resolvedModel = options.model || '';
        if (!resolvedModel) {
          switch (options.provider) {
            case 'openai':
              resolvedModel = 'gpt-4o';
              break;
            case 'anthropic':
              resolvedModel = 'claude-3-5-sonnet-20241022';
              break;
            case 'google':
              resolvedModel = 'gemini-1.5-flash';
              break;
            case 'openrouter':
              resolvedModel = 'openai/gpt-4o';
              break;
            case 'groq':
              resolvedModel = 'llama-3.2-90b-vision-preview';
              break;
            default:
              resolvedModel = aiSettings?.defaultModel || 'gpt-4o';
          }
        }

        // Check if this is a local provider (doesn't need API key)
        const isLocalProvider = ['ollama', 'lmstudio', 'custom'].includes(options.provider);

        // Make direct API call for vision
        if (ctx.fetch && (resolvedApiKey || isLocalProvider)) {
          ctx.log('info', `[Terminal] Using direct ${options.provider} API call to ${resolvedEndpoint}`);

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };

          let body: string;

          if (options.format === 'anthropic' || options.provider === 'anthropic') {
            // Anthropic format
            headers['x-api-key'] = resolvedApiKey;
            headers['anthropic-version'] = '2023-06-01';

            body = JSON.stringify({
              model: resolvedModel,
              max_tokens: options.maxTokens || 1000,
              system: options.systemPrompt,
              messages: [
                {
                  role: 'user',
                  content: [
                    ...images.map(img => ({
                      type: 'image',
                      source: {
                        type: 'base64',
                        media_type: 'image/jpeg',
                        data: img.replace(/^data:image\/\w+;base64,/, '')
                      }
                    })),
                    { type: 'text', text: prompt }
                  ]
                }
              ]
            });
          } else if (options.provider === 'ollama') {
            // Ollama format - uses different API structure
            body = JSON.stringify({
              model: resolvedModel,
              messages: [
                ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
                {
                  role: 'user',
                  content: prompt,
                  images: images.map(img => img.replace(/^data:image\/\w+;base64,/, ''))
                }
              ],
              stream: false
            });
          } else {
            // OpenAI format (default) - also used by LMStudio
            if (resolvedApiKey) {
              headers['Authorization'] = `Bearer ${resolvedApiKey}`;
            }

            body = JSON.stringify({
              model: resolvedModel,
              max_tokens: options.maxTokens || 1000,
              messages: [
                ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
                {
                  role: 'user',
                  content: [
                    ...images.map(img => ({
                      type: 'image_url',
                      image_url: { url: img, detail: 'high' }
                    })),
                    { type: 'text', text: prompt }
                  ]
                }
              ]
            });
          }

          const response = await ctx.fetch(resolvedEndpoint, {
            method: 'POST',
            headers,
            body,
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API call failed (${response.status}): ${errorText.substring(0, 200)}`);
          }

          const data = await response.json();

          // Extract response based on format
          if (options.format === 'anthropic' || options.provider === 'anthropic') {
            aiResponse = data.content?.[0]?.text || '';
          } else if (options.provider === 'ollama') {
            aiResponse = data.message?.content || '';
          } else {
            aiResponse = data.choices?.[0]?.message?.content || '';
          }

          // Log response for debugging
          if (!aiResponse) {
            ctx.log('warn', '[Terminal] AI returned empty response');
          } else {
            ctx.log('info', `[Terminal] AI response received (${aiResponse.length} chars)`);
          }
        } else {
          throw new Error('No API key configured. Please set up an AI provider with an API key in the node settings or project constants.');
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        ctx.log('error', `[Terminal] AI call failed: ${errMsg}`);
        return {
          session,
          result: `AI error: ${errMsg}`,
          screenshot: finalScreenshot,
        };
      }

      // Parse AI response
      const parsed = parseAIResponse(aiResponse);
      ctx.log('info', `[Terminal] Parsed - done: ${parsed.done}, has action: ${!!parsed.action}`);
      history.push(`${parsed.observation} -> ${parsed.reasoning}`);

      ctx.log('info', `[Terminal] AI observation: ${parsed.observation}`);

      // Check if done
      if (parsed.done) {
        ctx.onNodeStatus?.(nodeId, 'completed');
        ctx.log('success', `[Terminal] AI task completed: ${parsed.result}`);
        return {
          session,
          result: parsed.result || 'Task completed',
          screenshot: finalScreenshot,
        };
      }

      // Execute action
      if (parsed.action) {
        const keys: KeyAction[] = [{
          action_type: parsed.action.type as 'type' | 'key' | 'combo',
          value: parsed.action.value,
        }];

        try {
          await ctx.tauri.invoke('plugin:zipp-terminal|terminal_send_keys', {
            sessionId: session.id,
            keys,
          });
          ctx.log('info', `[Terminal] Sent ${parsed.action.type}: ${parsed.action.value}`);
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : 'Unknown error';
          ctx.log('error', `[Terminal] Failed to send keys: ${errMsg}`);
        }

        // Wait for the action to take effect
        await delay(options.screenshotDelayMs);
      }

      previousScreenshot = currentScreenshot;
    }

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('warn', `[Terminal] Max iterations (${options.maxIterations}) reached`);

    return {
      session,
      result: 'Max iterations reached without completion',
      screenshot: finalScreenshot,
    };
  } catch (error) {
    // Log the error and clean up if we created the session
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Terminal] AI control failed: ${errMsg}`);
    ctx.onNodeStatus?.(nodeId, 'error');

    // Clean up session if we created it and it failed
    if (createdNewSession && session?.id) {
      try {
        await closeSession(session.id);
      } catch (err) {
        ctx.log('warn', `[Terminal] Session cleanup warning: ${err}`);
      }
    }

    // Return error result instead of throwing (allows workflow to continue)
    return {
      session: session || { id: '', shell: '', workingDir: '' },
      result: `Error: ${errMsg}`,
      screenshot: finalScreenshot || '',
    };
  }
}

// =============================================================================
// Simple Command Execution
// =============================================================================

/**
 * Run a simple command by typing it and pressing Enter
 */
async function runCommand(
  session: TerminalSession,
  command: string,
  options: RunCommandOptions,
  nodeId: string
): Promise<RunCommandResult> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Terminal] Running command: ${command}`);

  if (!ctx.tauri) {
    throw new Error('Tauri not available - terminal requires native plugin');
  }

  try {
    // Type the command
    const typeKeys: KeyAction[] = [{
      action_type: 'type',
      value: command,
    }];

    await ctx.tauri.invoke('plugin:zipp-terminal|terminal_send_keys', {
      sessionId: session.id,
      keys: typeKeys,
    });

    // Small delay before pressing Enter
    await delay(100);

    // Press Enter
    const enterKey: KeyAction[] = [{
      action_type: 'key',
      value: 'Enter',
    }];

    await ctx.tauri.invoke('plugin:zipp-terminal|terminal_send_keys', {
      sessionId: session.id,
      keys: enterKey,
    });

    // Wait for command to execute
    await delay(options.waitMs);

    // Read output
    const output = await ctx.tauri.invoke<string>(
      'plugin:zipp-terminal|terminal_read_output',
      { sessionId: session.id, maxLines: 100 }
    );

    // Take screenshot if requested
    let screenshot: string | null = null;
    if (options.takeScreenshot) {
      screenshot = await ctx.tauri.invoke<string>(
        'plugin:zipp-terminal|terminal_screenshot',
        { sessionId: session.id }
      );
    }

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Terminal] Command completed`);

    return { session, output, screenshot };
  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Terminal] Command failed: ${errMsg}`);
    throw error;
  }
}

// =============================================================================
// Session Cleanup
// =============================================================================

/**
 * Close a terminal session
 */
async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (ctx.tauri) {
    try {
      await ctx.tauri.invoke('plugin:zipp-terminal|terminal_close', {
        sessionId: sessionId,
      });
    } catch (err) {
      ctx.log('warn', `[Terminal] Close session warning: ${err}`);
    }
  }

  sessions.delete(sessionId);
  ctx.log('info', `[Terminal] Session closed: ${sessionId}`);
}

// =============================================================================
// Utility
// =============================================================================

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// Module Export
// =============================================================================

/**
 * Core Terminal Runtime Module
 */
const CoreTerminalRuntime: RuntimeModule = {
  name: 'Terminal',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    ctx?.log?.('info', '[Terminal] Module initialized');
  },

  methods: {
    createSession,
    aiControl,
    runCommand,
    closeSession,
  },

  async cleanup(): Promise<void> {
    // Close all sessions
    for (const sessionId of sessions.keys()) {
      await closeSession(sessionId);
    }
    ctx?.log?.('info', '[Terminal] Module cleanup');
  },
};

export default CoreTerminalRuntime;
