// WebView management for browser automation
// Uses Tauri's WebView windows for JS-enabled page loading

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder,
};
use tokio::sync::oneshot;
use uuid::Uuid;

/// Escape a string for safe embedding in JavaScript.
/// Returns a JSON-serialized string (including quotes).
fn escape_js_string(s: &str) -> String {
    serde_json::to_string(s).unwrap_or_else(|_| "null".to_string())
}

// Linux-specific imports for webkit2gtk
#[cfg(target_os = "linux")]
use javascriptcore::ValueExt;
#[cfg(target_os = "linux")]
use webkit2gtk::{gio, WebViewExt};

// Windows-specific imports for WebView2 native script execution
#[cfg(target_os = "windows")]
use webview2_com::ExecuteScriptCompletedHandler;

/// Global state to track active WebView sessions
pub struct WebViewState {
    pub sessions: Mutex<HashMap<String, WebViewSession>>,
    /// Pending HTML requests waiting for response from webview
    pub pending_html_requests: Mutex<HashMap<String, oneshot::Sender<String>>>,
    /// Pending screenshot requests waiting for response from webview
    pub pending_screenshot_requests: Mutex<HashMap<String, oneshot::Sender<String>>>,
    /// Pending navigation/ready requests waiting for page to settle
    pub pending_ready_requests: Mutex<HashMap<String, oneshot::Sender<bool>>>,
}

impl Default for WebViewState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            pending_html_requests: Mutex::new(HashMap::new()),
            pending_screenshot_requests: Mutex::new(HashMap::new()),
            pending_ready_requests: Mutex::new(HashMap::new()),
        }
    }
}

#[derive(Clone, Debug)]
pub struct WebViewSession {
    pub id: String,
    pub window_label: String,
    pub user_agent: String,
    pub cookies: HashMap<String, String>,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebViewConfig {
    pub profile: String,
    pub custom_user_agent: Option<String>,
    pub viewport_width: Option<u32>,
    pub viewport_height: Option<u32>,
    pub cookies: Option<HashMap<String, String>>,
    pub headers: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WebViewResult {
    pub success: bool,
    pub session_id: Option<String>,
    pub data: Option<String>,
    pub error: Option<String>,
}

/// Get user agent string for browser profile
fn get_user_agent(profile: &str, custom: Option<&str>) -> String {
    if let Some(ua) = custom {
        if !ua.is_empty() {
            return ua.to_string();
        }
    }

    match profile {
        "chrome_windows" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string(),
        "chrome_mac" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string(),
        "firefox_windows" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0".to_string(),
        "firefox_mac" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) Gecko/20100101 Firefox/133.0".to_string(),
        "safari_mac" => "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15".to_string(),
        "edge_windows" => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0".to_string(),
        "mobile_ios" => "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1".to_string(),
        "mobile_android" => "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36".to_string(),
        _ => "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36".to_string(),
    }
}

/// Create a new WebView session
#[tauri::command]
async fn webview_create<R: Runtime>(
    app: AppHandle<R>,
    config: WebViewConfig,
) -> Result<WebViewResult, String> {
    let session_id = Uuid::new_v4().to_string();
    let window_label = format!("webview_{}", session_id.replace("-", "_"));
    let user_agent = get_user_agent(&config.profile, config.custom_user_agent.as_deref());

    let width = config.viewport_width.unwrap_or(1280);
    let height = config.viewport_height.unwrap_or(800);

    // Initialization script that runs on every page load
    let init_script = r#"
        // Set up Zipp state system (more robust than title-based signaling)
        (function() {
            if (!window.__ZIPP_STATE__) {
                Object.defineProperty(window, '__ZIPP_STATE__', {
                    value: {
                        ready: true,
                        navigating: false,
                        loadCount: 0,
                        lastUrl: window.location.href
                    },
                    writable: true,
                    configurable: true
                });
            }

            var markReady = function() {
                if (window.__ZIPP_STATE__) {
                    window.__ZIPP_STATE__.ready = true;
                    window.__ZIPP_STATE__.navigating = false;
                    window.__ZIPP_STATE__.loadCount++;
                    window.__ZIPP_STATE__.lastUrl = window.location.href;
                }
            };

            var markNavigating = function() {
                if (window.__ZIPP_STATE__) {
                    window.__ZIPP_STATE__.ready = false;
                    window.__ZIPP_STATE__.navigating = true;
                }
            };

            window.addEventListener('load', markReady);

            if (document.readyState === 'complete') {
                markReady();
            }

            // SPA Navigation Detection
            var wrapHistory = function(type) {
                var orig = history[type];
                return function() {
                    markNavigating();
                    var rv = orig.apply(this, arguments);
                    setTimeout(function() {
                        if (window.__ZIPP_STATE__) {
                            window.__ZIPP_STATE__.lastUrl = window.location.href;
                            window.__ZIPP_STATE__.ready = true;
                            window.__ZIPP_STATE__.navigating = false;
                            window.__ZIPP_STATE__.loadCount++;
                        }
                    }, 100);
                    return rv;
                };
            };
            history.pushState = wrapHistory('pushState');
            history.replaceState = wrapHistory('replaceState');

            window.addEventListener('popstate', function() {
                markNavigating();
                setTimeout(markReady, 100);
            });

            window.__ZIPP__ = {
                captureHtml: function() {
                    try {
                        return document.documentElement.outerHTML;
                    } catch(e) {
                        console.error('[Zipp] Failed to capture HTML:', e);
                        return '';
                    }
                },
                getState: function() {
                    return JSON.stringify(window.__ZIPP_STATE__ || {ready: true, navigating: false});
                }
            };
            console.log('[Zipp] State system initialized (with SPA support)');
        })();
    "#;

    // Create a hidden WebView window with initialization script
    let webview = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App("about:blank".into()),
    )
    .title("Zipp Browser")
    .inner_size(width as f64, height as f64)
    .visible(false)
    .user_agent(&user_agent)
    .initialization_script(init_script)
    .build();

    match webview {
        Ok(_window) => {
            let state = app.state::<WebViewState>();
            let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;

            sessions.insert(
                session_id.clone(),
                WebViewSession {
                    id: session_id.clone(),
                    window_label: window_label.clone(),
                    user_agent,
                    cookies: config.cookies.unwrap_or_default(),
                    headers: config.headers.unwrap_or_default(),
                },
            );

            Ok(WebViewResult {
                success: true,
                session_id: Some(session_id),
                data: None,
                error: None,
            })
        }
        Err(e) => Ok(WebViewResult {
            success: false,
            session_id: None,
            data: None,
            error: Some(format!("Failed to create WebView: {}", e)),
        }),
    }
}

/// Navigate WebView to URL and wait for page load
#[tauri::command]
async fn webview_navigate<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    url: String,
    wait_for: Option<String>,
    timeout_ms: Option<u64>,
) -> Result<WebViewResult, String> {
    let window_label = {
        let state = app.state::<WebViewState>();
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get(&session_id).ok_or("Session not found")?;
        session.window_label.clone()
    };

    let window = app
        .get_webview_window(&window_label)
        .ok_or("WebView window not found")?;

    let _ = window.navigate(url.parse().map_err(|e: url::ParseError| e.to_string())?);

    let timeout = timeout_ms.unwrap_or(30000);
    let wait_script = if let Some(selector) = wait_for {
        format!(
            r#"
            new Promise((resolve, reject) => {{
                const timeout = setTimeout(() => reject('Timeout waiting for selector'), {});
                const check = () => {{
                    if (document.querySelector('{}')) {{
                        clearTimeout(timeout);
                        resolve('ready');
                    }} else {{
                        requestAnimationFrame(check);
                    }}
                }};
                if (document.readyState === 'complete') {{
                    check();
                }} else {{
                    window.addEventListener('load', check);
                }}
            }})
        "#,
            timeout, selector
        )
    } else {
        format!(
            r#"
            new Promise((resolve) => {{
                if (document.readyState === 'complete') {{
                    resolve('ready');
                }} else {{
                    window.addEventListener('load', () => resolve('ready'));
                    setTimeout(() => resolve('timeout'), {});
                }}
            }})
        "#,
            timeout
        )
    };

    let _ = window.eval(&wait_script);
    tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;

    Ok(WebViewResult {
        success: true,
        session_id: Some(session_id),
        data: Some("navigated".to_string()),
        error: None,
    })
}

/// Execute JavaScript in WebView and return result
#[tauri::command]
async fn webview_evaluate<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    script: String,
) -> Result<WebViewResult, String> {
    let state = app.state::<WebViewState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions.get(&session_id).ok_or("Session not found")?;
    let window_label = session.window_label.clone();
    drop(sessions);

    let window = app
        .get_webview_window(&window_label)
        .ok_or("WebView window not found")?;

    match window.eval(&script) {
        Ok(_) => Ok(WebViewResult {
            success: true,
            session_id: Some(session_id),
            data: Some("executed".to_string()),
            error: None,
        }),
        Err(e) => Ok(WebViewResult {
            success: false,
            session_id: Some(session_id),
            data: None,
            error: Some(format!("Script error: {}", e)),
        }),
    }
}

/// Helper function to get HTML content from webview
#[cfg(target_os = "linux")]
async fn webview_get_html_with_result<R: Runtime>(
    _app: AppHandle<R>,
    session_id: String,
    window: tauri::WebviewWindow<R>,
) -> Result<WebViewResult, String> {
    use std::sync::{Arc, Mutex as StdMutex};

    eprintln!(
        "[WebView] get_html v3: starting for session {}",
        session_id
    );

    let result_holder: Arc<StdMutex<Option<Result<String, String>>>> =
        Arc::new(StdMutex::new(None));
    let result_holder_for_callback = result_holder.clone();

    eprintln!("[WebView] get_html v3: scheduling on main thread");

    let window_clone = window.clone();
    let schedule_result = window.run_on_main_thread(move || {
        eprintln!("[WebView] get_html v3: now on main thread");

        let _with_webview_result = window_clone.with_webview(move |webview| {
            eprintln!("[WebView] get_html v3: inside with_webview closure");

            let wv = webview.inner();

            if let Some(uri) = wv.uri() {
                eprintln!("[WebView] get_html v3: URI = {}", uri);
            } else {
                eprintln!("[WebView] get_html v3: no URI");
            }
            eprintln!("[WebView] get_html v3: is_loading = {}", wv.is_loading());

            // More robust script that handles edge cases
            let script = r#"(function() {
                if (!document.documentElement) {
                    return '<html><body>Page not loaded</body></html>';
                }
                try {
                    var html = document.documentElement.outerHTML;
                    if (html && html.length > 0) {
                        return html;
                    }
                    var doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '';
                    var head = document.head ? document.head.outerHTML : '<head></head>';
                    var body = document.body ? document.body.outerHTML : '<body></body>';
                    return doctype + '<html>' + head + body + '</html>';
                } catch(e) {
                    return '<html><body>Error: ' + e.message + '</body></html>';
                }
            })()"#;
            eprintln!("[WebView] get_html v3: calling run_javascript");

            #[allow(deprecated)]
            wv.run_javascript(script, gio::Cancellable::NONE, move |result| {
                eprintln!("[WebView] get_html v3: *** CALLBACK FIRED ***");

                let html_result = match result {
                    Ok(js_result) => {
                        eprintln!("[WebView] get_html v3: JS succeeded");
                        if let Some(value) = js_result.js_value() {
                            if let Some(json_str) = value.to_json(0) {
                                let s = json_str.to_string();
                                eprintln!("[WebView] get_html v3: got {} bytes", s.len());
                                if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
                                    match serde_json::from_str::<String>(&s) {
                                        Ok(unescaped) => Ok(unescaped),
                                        Err(_) => Ok(s[1..s.len() - 1].to_string()),
                                    }
                                } else {
                                    Ok(s)
                                }
                            } else {
                                eprintln!("[WebView] get_html v3: to_json returned None");
                                Err("to_json returned None".to_string())
                            }
                        } else {
                            eprintln!("[WebView] get_html v3: js_value returned None");
                            Err("js_value returned None".to_string())
                        }
                    }
                    Err(e) => {
                        eprintln!("[WebView] get_html v3: JS error: {}", e);
                        Err(format!("JavaScript error: {}", e))
                    }
                };

                eprintln!("[WebView] get_html v3: storing result");
                if let Ok(mut guard) = result_holder_for_callback.lock() {
                    *guard = Some(html_result);
                    eprintln!("[WebView] get_html v3: result stored OK");
                } else {
                    eprintln!("[WebView] get_html v3: FAILED to lock result_holder");
                }
            });
            eprintln!("[WebView] get_html v3: run_javascript called (callback pending)");
        });
    });

    match &schedule_result {
        Ok(_) => eprintln!("[WebView] get_html v3: scheduled on main thread OK"),
        Err(e) => eprintln!("[WebView] get_html v3: schedule FAILED: {}", e),
    }

    if let Err(e) = schedule_result {
        return Ok(WebViewResult {
            success: false,
            session_id: Some(session_id),
            data: None,
            error: Some(format!("Failed to schedule on main thread: {}", e)),
        });
    }

    let timeout = std::time::Duration::from_secs(10);
    let start = std::time::Instant::now();
    let poll_interval = std::time::Duration::from_millis(50);

    eprintln!("[WebView] get_html v3: starting poll loop");

    loop {
        if let Ok(guard) = result_holder.lock() {
            if let Some(ref result) = *guard {
                match result {
                    Ok(html) => {
                        eprintln!("[WebView] get_html v3: SUCCESS - {} bytes", html.len());
                        return Ok(WebViewResult {
                            success: true,
                            session_id: Some(session_id),
                            data: Some(html.clone()),
                            error: None,
                        });
                    }
                    Err(e) => {
                        eprintln!("[WebView] get_html v3: FAILURE - {}", e);
                        return Ok(WebViewResult {
                            success: false,
                            session_id: Some(session_id),
                            data: None,
                            error: Some(e.clone()),
                        });
                    }
                }
            }
        }

        if start.elapsed() > timeout {
            eprintln!("[WebView] get_html v3: TIMEOUT after 10s");
            return Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some("Timeout waiting for HTML (10s)".to_string()),
            });
        }

        tokio::time::sleep(poll_interval).await;
    }
}

/// Helper function to get HTML content from webview (Windows)
/// Uses WebView2's native ExecuteScript which works on external pages
#[cfg(target_os = "windows")]
async fn webview_get_html_with_result<R: Runtime>(
    _app: AppHandle<R>,
    session_id: String,
    window: tauri::WebviewWindow<R>,
) -> Result<WebViewResult, String> {
    use std::sync::{Arc, Mutex as StdMutex};

    eprintln!(
        "[WebView] get_html: Windows path - using WebView2 native ExecuteScript"
    );

    let result_holder: Arc<StdMutex<Option<Result<String, String>>>> =
        Arc::new(StdMutex::new(None));
    let result_holder_for_callback = result_holder.clone();

    let window_clone = window.clone();
    let schedule_result = window.run_on_main_thread(move || {
        eprintln!("[WebView] get_html: now on main thread");

        let result_for_webview = result_holder_for_callback.clone();

        let _with_webview_result = window_clone.with_webview(move |webview| {
            eprintln!("[WebView] get_html: inside with_webview closure");

            // Get the WebView2 controller and then the CoreWebView2
            let controller = webview.controller();
            let core_webview = match unsafe { controller.CoreWebView2() } {
                Ok(wv) => wv,
                Err(e) => {
                    eprintln!("[WebView] get_html: failed to get CoreWebView2: {:?}", e);
                    if let Ok(mut guard) = result_for_webview.lock() {
                        *guard = Some(Err(format!("Failed to get CoreWebView2: {:?}", e)));
                    }
                    return;
                }
            };

            let result_for_handler = result_for_webview.clone();
            // More robust script that waits for document and handles edge cases
            let script = r#"(function() {
                // Wait for document to be ready
                if (!document.documentElement) {
                    return '<html><body>Page not loaded</body></html>';
                }
                try {
                    var html = document.documentElement.outerHTML;
                    if (html && html.length > 0) {
                        return html;
                    }
                    // Fallback to constructing from parts
                    var doctype = document.doctype ? new XMLSerializer().serializeToString(document.doctype) : '';
                    var head = document.head ? document.head.outerHTML : '<head></head>';
                    var body = document.body ? document.body.outerHTML : '<body></body>';
                    return doctype + '<html>' + head + body + '</html>';
                } catch(e) {
                    return '<html><body>Error: ' + e.message + '</body></html>';
                }
            })()"#;

            // Create the completion handler
            // Note: ClosureArg trait automatically converts PCWSTR -> String
            let handler = ExecuteScriptCompletedHandler::create(
                Box::new(move |hr, result_str: String| {
                    eprintln!("[WebView] get_html: ExecuteScript callback fired, hr={:?}", hr);

                    if hr.is_err() {
                        eprintln!("[WebView] get_html: ExecuteScript failed with HRESULT");
                        if let Ok(mut guard) = result_for_handler.lock() {
                            *guard = Some(Err(format!("ExecuteScript failed: {:?}", hr)));
                        }
                        return Ok(());
                    }

                    eprintln!(
                        "[WebView] get_html: got {} bytes JSON result",
                        result_str.len()
                    );

                    // The result is JSON-encoded, so we need to parse it
                    // A string result comes as "\"<html>...\""
                    let html = match serde_json::from_str::<String>(&result_str) {
                        Ok(decoded) => decoded,
                        Err(_) => {
                            // If it's not a JSON string, it might be null or an error
                            if result_str == "null" || result_str.is_empty() {
                                eprintln!("[WebView] get_html: got null/empty result");
                                if let Ok(mut guard) = result_for_handler.lock() {
                                    *guard = Some(Err("Script returned null".to_string()));
                                }
                                return Ok(());
                            }
                            result_str
                        }
                    };

                    eprintln!("[WebView] get_html: decoded {} bytes HTML", html.len());

                    if let Ok(mut guard) = result_for_handler.lock() {
                        *guard = Some(Ok(html));
                    }

                    Ok(())
                })
            );

            eprintln!("[WebView] get_html: calling ExecuteScript");

            // Convert script to wide string (UTF-16 with null terminator)
            let script_wide: Vec<u16> = script.encode_utf16().chain(std::iter::once(0)).collect();

            unsafe {
                // Create PCWSTR from the wide string pointer
                let script_pcwstr = windows_core::PCWSTR::from_raw(script_wide.as_ptr());

                if let Err(e) = core_webview.ExecuteScript(script_pcwstr, &handler) {
                    eprintln!("[WebView] get_html: ExecuteScript call failed: {:?}", e);
                    if let Ok(mut guard) = result_for_webview.lock() {
                        *guard = Some(Err(format!("ExecuteScript failed: {:?}", e)));
                    }
                }
            }
        });
    });

    if let Err(e) = schedule_result {
        return Ok(WebViewResult {
            success: false,
            session_id: Some(session_id),
            data: None,
            error: Some(format!("Failed to schedule on main thread: {:?}", e)),
        });
    }

    // Poll for result with timeout
    let timeout = std::time::Duration::from_secs(10);
    let poll_interval = std::time::Duration::from_millis(50);
    let start = std::time::Instant::now();

    loop {
        if start.elapsed() > timeout {
            eprintln!("[WebView] get_html: timeout waiting for result");
            return Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some("Timeout waiting for HTML".to_string()),
            });
        }

        if let Ok(guard) = result_holder.lock() {
            if let Some(result) = guard.as_ref() {
                return match result {
                    Ok(html) => {
                        eprintln!("[WebView] get_html: success, {} bytes", html.len());
                        Ok(WebViewResult {
                            success: true,
                            session_id: Some(session_id),
                            data: Some(html.clone()),
                            error: None,
                        })
                    }
                    Err(err) => {
                        eprintln!("[WebView] get_html: error: {}", err);
                        Ok(WebViewResult {
                            success: false,
                            session_id: Some(session_id),
                            data: None,
                            error: Some(err.clone()),
                        })
                    }
                };
            }
        }

        tokio::time::sleep(poll_interval).await;
    }
}

/// Helper function to get HTML content from webview (macOS)
/// Falls back to simple eval - may not work on all external pages
#[cfg(target_os = "macos")]
async fn webview_get_html_with_result<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    window: tauri::WebviewWindow<R>,
) -> Result<WebViewResult, String> {
    eprintln!("[WebView] get_html: macOS path - attempting simple eval approach");

    // On macOS, try a simpler approach without IPC
    // This may not work for all pages but is worth trying
    let request_id = uuid::Uuid::new_v4().to_string();
    let (tx, rx) = oneshot::channel::<String>();

    {
        let state = app.state::<WebViewState>();
        let mut pending = state
            .pending_html_requests
            .lock()
            .map_err(|e| e.to_string())?;
        pending.insert(request_id.clone(), tx);
    }

    let capture_script = format!(
        r#"
        (async function() {{
            try {{
                const html = document.documentElement.outerHTML;
                if (window.__TAURI__) {{
                    await window.__TAURI__.core.invoke('plugin:zipp-browser|webview_html_callback', {{
                        request_id: '{}',
                        html: html
                    }});
                }} else {{
                    console.log('[Zipp] No Tauri IPC available');
                }}
            }} catch(e) {{
                console.error('[Zipp] HTML capture error:', e);
            }}
        }})();
    "#,
        request_id
    );

    if let Err(e) = window.eval(&capture_script) {
        let state = app.state::<WebViewState>();
        let mut pending = state
            .pending_html_requests
            .lock()
            .map_err(|e| e.to_string())?;
        pending.remove(&request_id);

        return Ok(WebViewResult {
            success: false,
            session_id: Some(session_id),
            data: None,
            error: Some(format!("Failed to eval script: {}", e)),
        });
    }

    // Shorter timeout since we know IPC likely won't work
    let timeout = tokio::time::Duration::from_secs(3);
    match tokio::time::timeout(timeout, rx).await {
        Ok(Ok(html)) => {
            if html.starts_with("__ERROR__:") {
                let err = html.trim_start_matches("__ERROR__:");
                Ok(WebViewResult {
                    success: false,
                    session_id: Some(session_id),
                    data: None,
                    error: Some(format!("HTML capture error: {}", err)),
                })
            } else {
                Ok(WebViewResult {
                    success: true,
                    session_id: Some(session_id),
                    data: Some(html),
                    error: None,
                })
            }
        }
        Ok(Err(_)) | Err(_) => {
            let state = app.state::<WebViewState>();
            if let Ok(mut pending) = state.pending_html_requests.lock() {
                pending.remove(&request_id);
            }
            // Return an error indicating IPC not available
            Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some("HTML capture not available on macOS for external pages".to_string()),
            })
        }
    }
}

/// Execute action in WebView (click, type, scroll, get_html)
#[tauri::command]
async fn webview_action<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    action: String,
    selector: Option<String>,
    value: Option<String>,
) -> Result<WebViewResult, String> {
    let window_label = {
        let state = app.state::<WebViewState>();
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get(&session_id).ok_or("Session not found")?;
        session.window_label.clone()
    };

    eprintln!(
        "[WebView] action: {} on window_label={}",
        action, window_label
    );

    let window = app
        .get_webview_window(&window_label)
        .ok_or("WebView window not found")?;

    eprintln!("[WebView] action: got window, label={}", window.label());

    if action == "get_html" {
        return webview_get_html_with_result(app, session_id, window).await;
    }

    let is_click = action == "click";

    let script = match action.as_str() {
        "click" => {
            let sel = escape_js_string(&selector.unwrap_or_default());
            format!(
                r#"
                (function() {{
                    var selector = {};
                    var el = null;

                    // Handle :has-text() pseudo-selector (Playwright-style)
                    var hasTextMatch = selector.match(/^(.+?):has-text\(["'](.+?)["']\)$/);
                    if (hasTextMatch) {{
                        var baseSelector = hasTextMatch[1].trim();
                        var searchText = hasTextMatch[2];
                        var candidates = document.querySelectorAll(baseSelector);
                        for (var i = 0; i < candidates.length; i++) {{
                            if (candidates[i].textContent && candidates[i].textContent.indexOf(searchText) !== -1) {{
                                el = candidates[i];
                                break;
                            }}
                        }}
                    }} else {{
                        // Standard CSS selector
                        el = document.querySelector(selector);
                    }}

                    if (el) {{
                        el.click();
                        return 'clicked';
                    }}
                    return 'element not found: ' + selector;
                }})()
            "#,
                sel
            )
        }
        "type" => {
            let sel = escape_js_string(&selector.unwrap_or_default());
            let val = escape_js_string(&value.unwrap_or_default());
            format!(
                r#"
                (function() {{
                    const el = document.querySelector({});
                    if (el) {{
                        el.focus();
                        // React/Vue/Angular compatibility: set value and trigger events
                        const proto = window.HTMLInputElement.prototype;
                        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                        if (nativeSetter) {{
                            nativeSetter.call(el, {});
                        }} else {{
                            el.value = {};
                        }}
                        el.dispatchEvent(new Event('input', {{ bubbles: true }}));
                        el.dispatchEvent(new Event('change', {{ bubbles: true }}));
                        return 'typed';
                    }}
                    return 'element not found';
                }})()
            "#,
                sel,
                val,
                val
            )
        }
        "scroll" => {
            // Validate scroll amount is a valid number to prevent injection
            let amount_str = value.unwrap_or_else(|| "500".to_string());
            let amount: i32 = amount_str.parse().unwrap_or(500);
            format!(
                r#"
                (function() {{
                    window.scrollBy(0, {});
                    return 'scrolled';
                }})()
            "#,
                amount
            )
        }
        _ => {
            return Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some(format!("Unknown action: {}", action)),
            });
        }
    };

    // For click actions, set up navigation listener BEFORE the click to avoid race condition
    // If click triggers a fast navigation, we need the listener already in place
    let (request_id, rx) = if is_click {
        let request_id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel::<bool>();

        {
            let state = app.state::<WebViewState>();
            let mut pending = state
                .pending_ready_requests
                .lock()
                .map_err(|e| e.to_string())?;
            pending.insert(request_id.clone(), tx);
        }

        // Inject navigation listener BEFORE the click
        let ready_script = format!(
            r#"
            (function() {{
                var requestId = '{}';
                var preClickUrl = window.location.href;
                var notified = false;

                var notifyReady = function() {{
                    if (notified) return;
                    notified = true;
                    try {{
                        if (window.__TAURI__ && window.__TAURI__.core) {{
                            window.__TAURI__.core.invoke('plugin:zipp-browser|webview_ready_callback', {{
                                request_id: requestId
                            }});
                        }}
                    }} catch(e) {{
                        console.error('[Zipp] Ready callback error:', e);
                    }}
                }};

                // Listen for load event (for full page navigations)
                window.addEventListener('load', function() {{
                    setTimeout(notifyReady, 100);
                }}, {{ once: true }});

                // Fallback timeout - notify after 3s max
                setTimeout(function() {{
                    if (document.readyState === 'complete') {{
                        notifyReady();
                    }}
                }}, 3000);

                // SPA navigation detection - notify quickly after pushState/replaceState
                var origPush = history.pushState;
                var origReplace = history.replaceState;
                history.pushState = function() {{
                    var rv = origPush.apply(this, arguments);
                    setTimeout(notifyReady, 150);
                    return rv;
                }};
                history.replaceState = function() {{
                    var rv = origReplace.apply(this, arguments);
                    setTimeout(notifyReady, 150);
                    return rv;
                }};

                window.addEventListener('popstate', function() {{
                    setTimeout(notifyReady, 150);
                }}, {{ once: true }});

                // Store preClickUrl for post-click check
                window.__ZIPP_PRE_CLICK_URL__ = preClickUrl;
            }})();
        "#,
            request_id
        );

        if let Err(e) = window.eval(&ready_script) {
            eprintln!("[WebView] click: failed to inject ready script: {}", e);
            // Clean up on failure
            let state = app.state::<WebViewState>();
            let _ = state.pending_ready_requests.lock().map(|mut pending| {
                pending.remove(&request_id);
            });
        }

        (Some(request_id), Some(rx))
    } else {
        (None, None)
    };

    // Now execute the action (click happens AFTER listener is set up)
    match window.eval(&script) {
        Ok(_) => {
            if is_click {
                if let (Some(request_id), Some(rx)) = (request_id, rx) {
                    // After click, check if URL changed - if not, notify immediately
                    let post_click_check = r#"
                        (function() {
                            if (window.__ZIPP_PRE_CLICK_URL__ === window.location.href && document.readyState === 'complete') {
                                // No navigation happened, notify ready after short delay
                                setTimeout(function() {
                                    if (window.__TAURI__ && window.__TAURI__.core && window.__ZIPP_PRE_CLICK_URL__ === window.location.href) {
                                        // Find and call the notifyReady - this is a backup
                                    }
                                }, 300);
                            }
                            delete window.__ZIPP_PRE_CLICK_URL__;
                        })();
                    "#;
                    let _ = window.eval(post_click_check);

                    // Wait for the callback with timeout
                    let timeout = tokio::time::Duration::from_secs(10);
                    match tokio::time::timeout(timeout, rx).await {
                        Ok(Ok(_)) => {
                            eprintln!("[WebView] click: page ready notification received");
                        }
                        Ok(Err(_)) => {
                            eprintln!("[WebView] click: ready channel closed, continuing");
                        }
                        Err(_) => {
                            eprintln!("[WebView] click: timeout waiting for ready, continuing anyway");
                            // Cleanup on timeout
                            let state = app.state::<WebViewState>();
                            let _ = state.pending_ready_requests.lock().map(|mut pending| {
                                pending.remove(&request_id);
                            });
                        }
                    }

                    // Small delay to ensure any final renders complete
                    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                }
            }

            Ok(WebViewResult {
                success: true,
                session_id: Some(session_id),
                data: Some(format!("action:{}", action)),
                error: None,
            })
        }
        Err(e) => {
            // Clean up pending request on error
            if let Some(request_id) = request_id {
                let state = app.state::<WebViewState>();
                let _ = state.pending_ready_requests.lock().map(|mut pending| {
                    pending.remove(&request_id);
                });
            }
            Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some(format!("Action error: {}", e)),
            })
        }
    }
}

/// Callback command that webview calls to send HTML back to Rust
#[tauri::command]
async fn webview_html_callback<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    html: String,
) -> Result<(), String> {
    let state = app.state::<WebViewState>();
    let tx = {
        let mut pending = state
            .pending_html_requests
            .lock()
            .map_err(|e| e.to_string())?;
        pending.remove(&request_id)
    };

    if let Some(tx) = tx {
        let _ = tx.send(html);
    }

    Ok(())
}

/// Take screenshot of WebView using native OS screenshot capability (xcap)
/// This provides pixel-perfect captures that work even on sites with strict
/// CSP policies (unlike html2canvas which injects JavaScript)
#[tauri::command]
async fn webview_screenshot<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<WebViewResult, String> {
    let state = app.state::<WebViewState>();

    let window_label = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        let session = sessions.get(&session_id).ok_or("Session not found")?;
        session.window_label.clone()
    };

    let window = app
        .get_webview_window(&window_label)
        .ok_or("WebView window not found")?;

    // Wait a bit for any pending renders to complete
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Use native OS screenshot with xcap
    // First, try to find the window by its title
    let window_title = window.title().unwrap_or_else(|_| "Zipp Browser".to_string());

    // Run the capture in a blocking task since xcap is sync
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        use xcap::Window;
        use base64::Engine;
        use image::ImageEncoder;

        // Get all windows and find ours by title
        let windows = Window::all().map_err(|e| format!("Failed to enumerate windows: {}", e))?;

        let target_window = windows.into_iter().find(|w| {
            if let Ok(title) = w.title() {
                title.contains(&window_title) || title.contains("Zipp")
            } else {
                false
            }
        });

        match target_window {
            Some(win) => {
                // Capture the window
                let image = win.capture_image().map_err(|e| format!("Failed to capture window: {}", e))?;

                // Encode to PNG using image crate
                let mut png_data = Vec::new();
                let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
                encoder
                    .write_image(
                        image.as_raw(),
                        image.width(),
                        image.height(),
                        image::ExtendedColorType::Rgba8,
                    )
                    .map_err(|e| format!("Failed to encode PNG: {}", e))?;

                // Convert to base64 data URL
                let base64_data = base64::engine::general_purpose::STANDARD.encode(&png_data);
                Ok(format!("data:image/png;base64,{}", base64_data))
            }
            None => Err("Could not find WebView window for screenshot".to_string()),
        }
    })
    .await
    .map_err(|e| format!("Screenshot task failed: {}", e))?;

    match result {
        Ok(data_url) => {
            eprintln!("[WebView] screenshot: native capture succeeded");
            Ok(WebViewResult {
                success: true,
                session_id: Some(session_id),
                data: Some(data_url),
                error: None,
            })
        }
        Err(e) => {
            eprintln!("[WebView] screenshot: native capture failed: {}", e);
            Ok(WebViewResult {
                success: false,
                session_id: Some(session_id),
                data: None,
                error: Some(e),
            })
        }
    }
}

/// Callback command that webview calls to send screenshot back to Rust
#[tauri::command]
async fn webview_screenshot_callback<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
    screenshot: String,
) -> Result<(), String> {
    let state = app.state::<WebViewState>();
    let tx = {
        let mut pending = state
            .pending_screenshot_requests
            .lock()
            .map_err(|e| e.to_string())?;
        pending.remove(&request_id)
    };

    if let Some(tx) = tx {
        let _ = tx.send(screenshot);
    }

    Ok(())
}

/// Callback command that webview calls when navigation/page load completes
#[tauri::command]
async fn webview_ready_callback<R: Runtime>(
    app: AppHandle<R>,
    request_id: String,
) -> Result<(), String> {
    eprintln!("[WebView] ready_callback received for request_id: {}", request_id);
    let state = app.state::<WebViewState>();
    let tx = {
        let mut pending = state
            .pending_ready_requests
            .lock()
            .map_err(|e| e.to_string())?;
        pending.remove(&request_id)
    };

    if let Some(tx) = tx {
        let _ = tx.send(true);
    }

    Ok(())
}

/// Close WebView session
#[tauri::command]
async fn webview_close<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<WebViewResult, String> {
    let state = app.state::<WebViewState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    if let Some(session) = sessions.remove(&session_id) {
        if let Some(window) = app.get_webview_window(&session.window_label) {
            let _ = window.close();
        }

        Ok(WebViewResult {
            success: true,
            session_id: Some(session_id),
            data: Some("closed".to_string()),
            error: None,
        })
    } else {
        Ok(WebViewResult {
            success: false,
            session_id: None,
            data: None,
            error: Some("Session not found".to_string()),
        })
    }
}

/// Get page HTML from WebView
#[tauri::command]
async fn webview_get_html<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<WebViewResult, String> {
    let state = app.state::<WebViewState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions.get(&session_id).ok_or("Session not found")?;
    let window_label = session.window_label.clone();
    drop(sessions);

    let window = app
        .get_webview_window(&window_label)
        .ok_or("WebView window not found")?;

    let script = r#"
        window.__TAURI__.event.emit('webview-html', document.documentElement.outerHTML);
    "#;

    match window.eval(script) {
        Ok(_) => Ok(WebViewResult {
            success: true,
            session_id: Some(session_id),
            data: Some("html_requested".to_string()),
            error: None,
        }),
        Err(e) => Ok(WebViewResult {
            success: false,
            session_id: Some(session_id),
            data: None,
            error: Some(format!("Get HTML error: {}", e)),
        }),
    }
}

/// Initialize the browser plugin
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zipp-browser")
        .setup(|app, _api| {
            app.manage(WebViewState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            webview_create,
            webview_navigate,
            webview_evaluate,
            webview_action,
            webview_html_callback,
            webview_screenshot,
            webview_screenshot_callback,
            webview_ready_callback,
            webview_close,
            webview_get_html,
        ])
        .build()
}
