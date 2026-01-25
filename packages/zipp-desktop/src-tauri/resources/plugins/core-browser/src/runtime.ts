/**
 * Core Browser Module Runtime
 *
 * Provides browser automation: HTTP requests, page control, data extraction.
 * Supports both simple fetch-based requests and full browser automation via Tauri.
 *
 * Native Rust plugin: zipp-browser (see native/src/lib.rs)
 */

import type { RuntimeContext, RuntimeModule } from '../../src/module-types';

// Module-level context reference (set during init)
let ctx: RuntimeContext;

// =============================================================================
// SERVICE HELPERS
// =============================================================================

/**
 * Extract port number from a URL string
 * @param url The URL to extract port from (e.g., "http://127.0.0.1:8769")
 * @returns The port number or null if not found
 */
function extractPortFromUrl(url: string): number | null {
  const match = url.match(/:(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Try to auto-start a service using ensure_service_ready_by_port (fully dynamic lookup)
 * @param port The port number to find and start the service
 * @returns The service URL or null if failed
 */
async function ensureServiceReadyByPort(port: number): Promise<string | null> {
  if (!ctx.tauri) return null;

  try {
    interface EnsureServiceResult {
      success: boolean;
      port?: number;
      error?: string;
      already_running: boolean;
    }

    ctx.log('info', `[Browser] Ensuring service on port ${port} is ready...`);

    // Use dynamic port-based lookup - finds service from services folder
    const result = await ctx.tauri.invoke<EnsureServiceResult>('ensure_service_ready_by_port', {
      port,
    });

    if (result.success && result.port) {
      const url = `http://127.0.0.1:${result.port}`;
      if (!result.already_running) {
        ctx.log('info', `[Browser] Service on port ${port} auto-started at ${url}`);
      } else {
        ctx.log('info', `[Browser] Service on port ${port} already running at ${url}`);
      }
      return url;
    } else if (result.error) {
      ctx.log('warn', `[Browser] Service on port ${port} failed to start: ${result.error}`);
    }
  } catch {
    // ensure_service_ready_by_port not available (older backend)
    ctx.log('info', `[Browser] Dynamic service lookup not available`);
  }

  return null;
}

// =============================================================================
// REQUEST LIMITS
// =============================================================================

// Maximum request body size: 10 MB
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;

// Maximum response body size: 50 MB
const MAX_RESPONSE_BODY_SIZE = 50 * 1024 * 1024;

// Maximum URL length (per RFC 2616, most browsers support ~2000 chars)
const MAX_URL_LENGTH = 8192;

/**
 * Validates a URL for HTTP requests.
 * Throws an error if the URL is invalid or potentially dangerous.
 */
function validateUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required');
  }

  // Check URL length
  if (url.length > MAX_URL_LENGTH) {
    throw new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH} characters`);
  }

  // Parse and validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Only allow http and https protocols
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Only http and https are allowed.`);
  }

  // Check for javascript: URLs (XSS prevention - defense in depth)
  if (url.toLowerCase().includes('javascript:')) {
    throw new Error('JavaScript URLs are not allowed');
  }
}

/**
 * Validates request body size.
 */
function validateRequestBody(body: string | undefined): void {
  if (body && body.length > MAX_REQUEST_BODY_SIZE) {
    throw new Error(`Request body exceeds maximum size of ${MAX_REQUEST_BODY_SIZE / 1024 / 1024} MB`);
  }
}

/**
 * Truncates response body if it exceeds the maximum size.
 * Returns the body and whether it was truncated.
 */
function limitResponseSize(body: string): { body: string; truncated: boolean } {
  if (body.length > MAX_RESPONSE_BODY_SIZE) {
    return {
      body: body.substring(0, MAX_RESPONSE_BODY_SIZE),
      truncated: true,
    };
  }
  return { body, truncated: false };
}

interface BrowserSession {
  id: string;
  mode: 'http' | 'webview' | 'headless';
  cookies?: Record<string, string>;
  headers?: Record<string, string>;
  userAgent?: string;
  currentUrl?: string; // Track the last URL for auto-navigation
}

interface ControlResult {
  success: boolean;
  data?: string;
  error?: string;
  screenshotData?: string;
}

/**
 * Shared response type for WebView plugin invoke calls
 */
interface WebViewResult {
  success: boolean;
  session_id?: string;
  data?: string;
  error?: string;
}

/**
 * HTTP response type for native HTTP requests
 */
interface HttpResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  bodyIsBase64?: boolean;
}

// Local cache for sessions (mirrors native state)
const sessions: Map<string, BrowserSession> = new Map();

/**
 * Create a new browser session
 */
async function createSession(
  _profile: string,
  mode: string,
  customUserAgent: string,
  customHeaders: string,
  initialCookies: string,
  nodeId: string
): Promise<BrowserSession> {
  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Browser] Creating session (${mode} mode)`);

  // Parse custom headers
  let headers: Record<string, string> = {};
  if (customHeaders) {
    try {
      headers = JSON.parse(customHeaders);
    } catch {
      ctx.log('warn', '[Browser] Invalid custom headers JSON');
    }
  }

  // Parse cookies
  let cookies: Record<string, string> = {};
  if (initialCookies) {
    try {
      cookies = JSON.parse(initialCookies);
    } catch {
      ctx.log('warn', '[Browser] Invalid cookies JSON');
    }
  }

  // For WebView/Headless modes, use native webview commands if available
  if ((mode === 'webview' || mode === 'headless') && ctx.tauri) {
    try {
      // Use browser plugin webview_create command
      // Pass cookies and headers so they can be used for HTTP fetch fallback
      const result = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_create', {
        config: {
          profile: _profile || 'default',
          custom_user_agent: customUserAgent || undefined,
          viewport_width: 1280,
          viewport_height: 800,
          cookies: cookies,
          headers: headers,
        },
      });

      if (!result.success || !result.session_id) {
        throw new Error(result.error || 'Failed to create webview session');
      }

      const session: BrowserSession = {
        id: result.session_id,
        mode: mode as 'webview' | 'headless',
        cookies,
        headers,
        userAgent: customUserAgent,
      };
      sessions.set(session.id, session);
      ctx.onNodeStatus?.(nodeId, 'completed');
      ctx.log('success', `[Browser] Native session created: ${session.id}`);
      return session;
    } catch (error) {
      ctx.log('warn', `[Browser] Native session failed, falling back to HTTP mode: ${error}`);
      // Fall through to HTTP mode
    }
  }

  // HTTP mode or fallback - always use 'http' mode since native failed
  const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const session: BrowserSession = {
    id: sessionId,
    mode: 'http', // Force HTTP mode since native session failed or wasn't requested
    cookies,
    headers,
    userAgent: customUserAgent,
  };

  sessions.set(sessionId, session);
  ctx.onNodeStatus?.(nodeId, 'completed');
  ctx.log('success', `[Browser] Session created: ${sessionId}`);
  return session;
}

/**
 * Parse Set-Cookie header and update session cookies
 */
function updateSessionCookies(session: BrowserSession, headers: Record<string, string>): void {
  // Look for set-cookie header (case-insensitive)
  const setCookieHeader = headers['set-cookie'] || headers['Set-Cookie'];
  if (!setCookieHeader) return;

  // Initialize cookies if not present
  if (!session.cookies) {
    session.cookies = {};
  }

  // Parse Set-Cookie values (may be comma or newline separated for multiple cookies)
  const cookieStrings = setCookieHeader.split(/[,\n]/).map(s => s.trim()).filter(s => s);

  for (const cookieStr of cookieStrings) {
    // Cookie format: name=value; optional-attributes
    const parts = cookieStr.split(';');
    if (parts.length === 0) continue;

    const nameValue = parts[0].trim();
    const eqIndex = nameValue.indexOf('=');
    if (eqIndex === -1) continue;

    const name = nameValue.substring(0, eqIndex).trim();
    const value = nameValue.substring(eqIndex + 1).trim();

    // Skip empty cookie names or attributes that got parsed as cookies
    if (!name || name.toLowerCase() === 'path' || name.toLowerCase() === 'domain' ||
        name.toLowerCase() === 'expires' || name.toLowerCase() === 'max-age' ||
        name.toLowerCase() === 'secure' || name.toLowerCase() === 'httponly' ||
        name.toLowerCase() === 'samesite') {
      continue;
    }

    session.cookies[name] = value;
    // Log cookie name only, not value (security - session tokens are sensitive)
    ctx.log('info', `[Browser] Cookie set: ${name}`);
  }

  // Update the session in the map
  sessions.set(session.id, session);
}

/**
 * Make an HTTP request
 */
async function request(
  url: string,
  method: string,
  headersJson: string,
  body: string,
  sessionId: string | undefined,
  nodeId: string,
  allowLocalNetwork: boolean = false
): Promise<{
  status: number;
  headers: Record<string, string>;
  body: string;
}> {
  // Check for abort before starting
  if (ctx.abortSignal?.aborted) {
    ctx.log('info', '[Browser] Aborted by user before request');
    throw new Error('Operation aborted by user');
  }

  // Validate URL and request body before proceeding
  validateUrl(url);
  validateRequestBody(body);

  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Browser] ${method} request to ${url}${allowLocalNetwork ? ' (local network allowed)' : ''}`);

  // Get session if provided
  const session = sessionId ? sessions.get(sessionId) : undefined;

  // Build headers
  let headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add session headers
  if (session?.headers) {
    headers = { ...headers, ...session.headers };
  }

  // Add session cookies as Cookie header
  if (session?.cookies && Object.keys(session.cookies).length > 0) {
    const cookieStr = Object.entries(session.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
    headers['Cookie'] = cookieStr;
    // Log that cookies are being sent without exposing actual values
    ctx.log('info', `[Browser] Sending cookies (${Object.keys(session.cookies).length} cookies)`);
  }

  // Add custom headers
  if (headersJson) {
    try {
      const customHeaders = JSON.parse(headersJson);
      headers = { ...headers, ...customHeaders };
    } catch {
      ctx.log('warn', '[Browser] Invalid headers JSON');
    }
  }

  try {
    // Use Tauri's native HTTP to bypass CORS restrictions
    if (ctx.tauri) {
      const result = await ctx.tauri.invoke<HttpResult>('http_request', {
        request: {
          url,
          method,
          headers,
          body: body || null,
          follow_redirects: true,
          max_redirects: 10,
          allow_private_networks: allowLocalNetwork,
        }
      });

      // Update session cookies from Set-Cookie header
      if (session && result.headers) {
        updateSessionCookies(session, result.headers);
      }

      // Track the URL in session for auto-navigation in browser_control
      if (session) {
        session.currentUrl = result.url || url;
      }

      ctx.onNodeStatus?.(nodeId, 'completed');
      ctx.log('success', `[Browser] Response: ${result.status}`);

      // Handle Base64-encoded binary responses (images, PDFs, etc.)
      let responseBody = result.body;
      if (result.bodyIsBase64) {
        // Get content-type for Data URL format
        const contentType = result.headers['content-type'] || result.headers['Content-Type'] || 'application/octet-stream';
        // Format as Data URL so downstream nodes (Image Save, etc.) can use it directly
        responseBody = `data:${contentType};base64,${result.body}`;
        ctx.log('info', `[Browser] Binary response converted to Data URL (${contentType})`);
      }

      // Limit response size
      const limited = limitResponseSize(responseBody);
      if (limited.truncated) {
        ctx.log('warn', `[Browser] Response truncated to ${MAX_RESPONSE_BODY_SIZE / 1024 / 1024} MB`);
      }

      return {
        status: result.status,
        headers: result.headers,
        body: limited.body,
      };
    }

    // Fallback to browser fetch (will hit CORS issues for cross-origin)
    const response = await ctx.fetch(url, {
      method,
      headers,
      body: body || undefined,
    });

    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Update session cookies from Set-Cookie header
    if (session) {
      updateSessionCookies(session, responseHeaders);
    }

    // Limit response size
    const limited = limitResponseSize(responseBody);
    if (limited.truncated) {
      ctx.log('warn', `[Browser] Response truncated to ${MAX_RESPONSE_BODY_SIZE / 1024 / 1024} MB`);
    }

    ctx.onNodeStatus?.(nodeId, 'completed');
    ctx.log('success', `[Browser] Response: ${response.status}`);

    return {
      status: response.status,
      headers: responseHeaders,
      body: limited.body,
    };
  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Browser] Request failed: ${errMsg}`);
    throw error;
  }
}

/**
 * Extract data from HTML/JSON content
 */
function extract(
  content: string,
  extractType: string,
  pattern: string,
  attribute: string
): string | string[] {
  ctx.log('info', `[Browser] Extracting with ${extractType}: ${pattern}`);

  if (extractType === 'jsonpath') {
    try {
      const data = JSON.parse(content);
      // Simple JSONPath implementation that handles dot notation and array brackets
      // Matches: property names OR [index]
      const pathParts = pattern.replace(/^\$\.?/, '').match(/([^[.\]]+|\[\d+\])/g) || [];
      let result: unknown = data;
      
      for (const part of pathParts) {
        if (result === null || result === undefined) break;
        
        // Handle array index [n]
        if (part.startsWith('[') && part.endsWith(']')) {
          const index = parseInt(part.slice(1, -1), 10);
          if (Array.isArray(result)) {
            result = result[index];
          } else {
            // Trying to index non-array
            result = undefined;
          }
        } else {
          // Handle property name
          // Check if we are iterating over an array (wildcard behavior implicit in some jsonpath impls, 
          // but here we stick to strict property access unless it's explicit array map which we don't fully support yet 
          // except via this simple logic from original code which handled wildcard/map strangely)
          // The original code had: if (Array.isArray(result)) { ... map ... }
          // But standard dot notation on array usually means "map" or is invalid.
          // Let's support the "map" behavior if it's an array, to preserve existing feature if any.
          const key = part;
          if (Array.isArray(result)) {
             const index = parseInt(key, 10);
             if (!isNaN(index)) {
               result = result[index];
             } else if (key === '*') {
               // result = result; // No-op
             } else {
               // Map over array
               result = result.map((item: any) => item ? item[key] : undefined);
             }
          } else if (typeof result === 'object') {
            result = (result as Record<string, unknown>)[key];
          }
        }
      }
      
      if (Array.isArray(result)) {
        return result.map(String);
      }
      return String(result);
    } catch {
      ctx.log('error', '[Browser] Invalid JSON for JSONPath extraction');
      return '';
    }
  }

  if (extractType === 'regex') {
    // Validate pattern to prevent ReDoS attacks
    const MAX_PATTERN_LENGTH = 500;
    const MAX_RESULTS = 10000;
    const MAX_ITERATIONS = 100000;

    if (!pattern) {
      ctx.log('error', '[Browser] Empty regex pattern');
      return [];
    }

    if (pattern.length > MAX_PATTERN_LENGTH) {
      ctx.log('error', `[Browser] Regex pattern too long (max ${MAX_PATTERN_LENGTH} chars)`);
      return [];
    }

    try {
      const regex = new RegExp(pattern, 'g');
      const results: string[] = [];
      let match: RegExpExecArray | null;
      let iterations = 0;

      // Use exec() to get capture groups, not match() which only returns full matches
      // Limit iterations to prevent ReDoS
      while ((match = regex.exec(content)) !== null) {
        iterations++;
        if (iterations > MAX_ITERATIONS) {
          ctx.log('warn', '[Browser] Regex extraction exceeded iteration limit');
          break;
        }

        // If there are capture groups, return the first capture group
        // Otherwise return the full match
        if (match.length > 1) {
          results.push(match[1]); // First capture group
        } else {
          results.push(match[0]); // Full match
        }

        // Limit number of results
        if (results.length >= MAX_RESULTS) {
          ctx.log('warn', '[Browser] Regex extraction reached result limit');
          break;
        }

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          regex.lastIndex++;
        }
      }

      // Return single value if only one match, array if multiple
      if (results.length === 1) {
        return results[0];
      }
      return results;
    } catch {
      ctx.log('error', '[Browser] Invalid regex pattern');
      return [];
    }
  }

  if (extractType === 'selector' || extractType === 'css_selector') {
    // CSS selector extraction requires DOM parsing
    // In a browser environment, we can use DOMParser
    if (!pattern) {
      ctx.log('error', '[Browser] Empty CSS selector pattern');
      return [];
    }
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        ctx.log('info', `[Browser] Extracting with selector: ${pattern}`);
        const elements = doc.querySelectorAll(pattern);
        const results: string[] = [];
        elements.forEach((el) => {
          if (attribute === 'text') {
            results.push(el.textContent || '');
          } else if (attribute === 'html') {
            results.push(el.innerHTML);
          } else {
            results.push(el.getAttribute(attribute) || '');
          }
        });
        return results.length === 1 ? results[0] : results;
      } catch {
        ctx.log('error', '[Browser] Invalid CSS selector');
        return [];
      }
    }
  }

  return '';
}

/**
 * Control browser (click, type, navigate, etc.)
 */
async function control(
  sessionParam: BrowserSession,
  action: string,
  target: string,
  value: string | undefined,
  timeout: number,
  nodeId: string
): Promise<string> {
  // Check for abort before starting
  if (ctx.abortSignal?.aborted) {
    ctx.log('info', '[Browser] Aborted by user before control action');
    throw new Error('Operation aborted by user');
  }

  ctx.onNodeStatus?.(nodeId, 'running');
  ctx.log('info', `[Browser] Control action: ${action} on ${target}`);

  // Get the live session from the Map (has currentUrl from browser_request)
  // Fall back to the passed session if not found
  const session = sessions.get(sessionParam.id) || sessionParam;

  // For HTTP mode, only 'goto' is supported (as a fetch request)
  if (session.mode === 'http') {
    if (action === 'goto' && target) {
      const response = await ctx.fetch(target);
      const body = await response.text();
      ctx.onNodeStatus?.(nodeId, 'completed');
      return body;
    }
    ctx.onNodeStatus?.(nodeId, 'error');
    ctx.log('error', `[Browser] HTTP mode only supports 'goto' action. For '${action}', use WebView or Headless mode.`);
    throw new Error(`HTTP mode only supports 'goto' action. The '${action}' action requires WebView or Headless mode with the native browser plugin enabled.`);
  }

  // WebView/Headless mode - use native Tauri webview commands
  if (!ctx.tauri) {
    ctx.onNodeStatus?.(nodeId, 'error');
    throw new Error('Tauri not available for browser control');
  }

  try {
    let result: ControlResult;

    // Map actions to appropriate Tauri webview commands
    if (action === 'goto') {
      // Navigate to URL
      const navResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_navigate', {
        sessionId: session.id,
        url: target,
        waitFor: null,
        timeoutMs: timeout,
      });

      if (!navResult.success) {
        throw new Error(navResult.error || 'Navigation failed');
      }

      // After navigation, get the page HTML
      const htmlResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_action', {
        sessionId: session.id,
        action: 'get_html',
        selector: null,
        value: null,
      });

      result = {
        success: htmlResult.success,
        data: htmlResult.data,
        error: htmlResult.error,
      };
    } else if (action === 'screenshot') {
      // Take screenshot
      const screenshotResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_screenshot', {
        sessionId: session.id,
      });

      result = {
        success: screenshotResult.success,
        screenshotData: screenshotResult.data,
        error: screenshotResult.error,
      };
    } else if (action === 'click' || action === 'type' || action === 'scroll') {
      // Auto-navigate to the session's currentUrl if webview hasn't been navigated yet
      // This handles the case where browser_request was used (HTTP mode) but browser_control
      // needs to interact with the webview
      if (session.currentUrl) {
        ctx.log('info', `[Browser] Auto-navigating webview to ${session.currentUrl}`);
        const navResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_navigate', {
          sessionId: session.id,
          url: session.currentUrl,
          waitFor: null,
          timeoutMs: timeout,
        });

        if (!navResult.success) {
          ctx.log('warn', `[Browser] Auto-navigation failed: ${navResult.error}`);
        }
        // Clear the URL so we don't re-navigate on subsequent actions
        session.currentUrl = undefined;
      }

      // Use webview_action for click, type, scroll
      const actionResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_action', {
        sessionId: session.id,
        action,
        selector: target || null,
        value: value || null,
      });

      result = {
        success: actionResult.success,
        data: actionResult.data,
        error: actionResult.error,
      };
    } else if (action === 'get_html') {
      // Auto-navigate to the session's currentUrl if webview hasn't been navigated yet
      if (session.currentUrl) {
        ctx.log('info', `[Browser] Auto-navigating webview to ${session.currentUrl} (before get_html)`);
        const navResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_navigate', {
          sessionId: session.id,
          url: session.currentUrl,
          waitFor: null,
          timeoutMs: timeout,
        });

        if (!navResult.success) {
          ctx.log('warn', `[Browser] Auto-navigation failed: ${navResult.error}`);
        }
        // Clear the URL so we don't re-navigate on subsequent actions
        session.currentUrl = undefined;
      }

      // Get page HTML
      const htmlResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_action', {
        sessionId: session.id,
        action: 'get_html',
        selector: null,
        value: null,
      });

      result = {
        success: htmlResult.success,
        data: htmlResult.data,
        error: htmlResult.error,
      };
    } else if (action === 'evaluate') {
      // Execute JavaScript
      const evalResult = await ctx.tauri.invoke<WebViewResult>('plugin:zipp-browser|webview_evaluate', {
        sessionId: session.id,
        script: target, // Script is passed in target parameter
      });

      result = {
        success: evalResult.success,
        data: evalResult.data,
        error: evalResult.error,
      };
    } else {
      throw new Error(`Unknown browser action: ${action}`);
    }

    if (!result.success) {
      throw new Error(result.error || `Action '${action}' failed`);
    }

    ctx.onNodeStatus?.(nodeId, 'completed');

    // Return screenshot data if available, otherwise return data
    if (result.screenshotData) {
      return result.screenshotData;
    }
    return result.data || '';
  } catch (error) {
    ctx.onNodeStatus?.(nodeId, 'error');
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    ctx.log('error', `[Browser] Control failed: ${errMsg}`);
    throw error;
  }
}

/**
 * Close a browser session
 */
async function closeSession(sessionId: string): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session) return;

  // For WebView/Headless modes, close native session
  if ((session.mode === 'webview' || session.mode === 'headless') && ctx.tauri) {
    try {
      await ctx.tauri.invoke('plugin:zipp-browser|webview_close', { sessionId: sessionId });
    } catch (err) {
      ctx.log('warn', `[Browser] Close session warning: ${err}`);
    }
  }

  sessions.delete(sessionId);
  ctx.log('info', `[Browser] Session closed: ${sessionId}`);
}

/**
 * Core Browser Runtime Module
 */
const CoreBrowserRuntime: RuntimeModule = {
  name: 'Browser',

  async init(context: RuntimeContext): Promise<void> {
    ctx = context;
    ctx?.log?.('info', '[Browser] Module initialized');
  },

  methods: {
    createSession,
    request,
    extract,
    control,
    closeSession,
    ensureServiceReadyByPort,
  },

  async cleanup(): Promise<void> {
    // Close all sessions
    for (const sessionId of sessions.keys()) {
      await closeSession(sessionId);
    }
    ctx?.log?.('info', '[Browser] Module cleanup');
  },
};

export default CoreBrowserRuntime;
