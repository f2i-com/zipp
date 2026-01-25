// Terminal automation plugin for Zipp
// Provides PTY management, keyboard simulation, and screenshot capture

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::process::{Child, Command, Stdio};
use std::io::{BufRead, BufReader};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime,
};
use uuid::Uuid;
use std::sync::Arc;
use std::collections::VecDeque;

// =============================================================================
// Types
// =============================================================================

/// Terminal session configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalConfig {
    /// Shell to use: auto, powershell, cmd, bash, sh
    pub shell: String,
    /// Working directory for the terminal
    pub working_dir: Option<String>,
    /// Whether to show a popup window for the terminal
    pub show_window: bool,
    /// Window title
    pub title: Option<String>,
    /// Window width
    pub width: Option<u32>,
    /// Window height
    pub height: Option<u32>,
}

/// Result from terminal operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalResult {
    pub success: bool,
    pub session_id: Option<String>,
    pub data: Option<String>,
    pub error: Option<String>,
}

/// Key action for keyboard simulation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyAction {
    /// Type of action: "type" for text, "key" for special key, "combo" for key combination
    pub action_type: String,
    /// Value: text to type, key name, or comma-separated keys for combo
    pub value: String,
    /// Optional delay in ms after the action
    pub delay_ms: Option<u64>,
}

/// Session info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub session_id: String,
    pub shell: String,
    pub working_dir: String,
    pub visible: bool,
    pub created_at: u64,
}

// =============================================================================
// State Management
// =============================================================================

const MAX_OUTPUT_LINES: usize = 1000;

/// Output buffer for terminal
struct OutputBuffer {
    lines: VecDeque<String>,
}

impl Default for OutputBuffer {
    fn default() -> Self {
        Self {
            lines: VecDeque::with_capacity(MAX_OUTPUT_LINES),
        }
    }
}

impl OutputBuffer {
    fn push(&mut self, line: String) {
        if self.lines.len() >= MAX_OUTPUT_LINES {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }

    fn get_all(&self) -> Vec<String> {
        self.lines.iter().cloned().collect()
    }

    fn get_recent(&self, count: usize) -> Vec<String> {
        self.lines.iter().rev().take(count).rev().cloned().collect()
    }
}

/// A running terminal session
pub struct TerminalSession {
    id: String,
    shell: String,
    working_dir: String,
    process: Child,
    output: Arc<Mutex<OutputBuffer>>,
    window_label: Option<String>,
    created_at: u64,
    /// Stored to keep stdin alive; prefixed with _ to suppress unused warning
    #[allow(dead_code)]
    _stdin_handle: Option<std::process::ChildStdin>,
}

/// Global state for terminal sessions
pub struct TerminalState {
    pub sessions: Mutex<HashMap<String, TerminalSession>>,
}

impl Default for TerminalState {
    fn default() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// =============================================================================
// Shell Detection
// =============================================================================

/// Detect the appropriate shell for the current platform
fn detect_shell(requested: &str) -> String {
    if requested != "auto" {
        return requested.to_string();
    }

    #[cfg(target_os = "windows")]
    {
        // Prefer PowerShell on Windows
        "powershell".to_string()
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        // Use bash on Unix-like systems
        "bash".to_string()
    }
}

/// Get the shell command and arguments
fn get_shell_command(shell: &str) -> (String, Vec<String>) {
    match shell {
        "powershell" => ("powershell".to_string(), vec!["-NoProfile".to_string(), "-NoLogo".to_string()]),
        "cmd" => ("cmd".to_string(), vec!["/Q".to_string()]),
        "bash" => ("bash".to_string(), vec!["--norc".to_string()]),
        "sh" => ("sh".to_string(), vec![]),
        "zsh" => ("zsh".to_string(), vec!["--no-rcs".to_string()]),
        _ => ("bash".to_string(), vec![]),
    }
}

// =============================================================================
// Keyboard Simulation
// =============================================================================

/// Send text as keyboard typing using enigo
fn send_text_as_typing(text: &str) -> Result<(), String> {
    use enigo::{Enigo, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    // Type each character
    for c in text.chars() {
        enigo.text(&c.to_string())
            .map_err(|e| format!("Failed to type character '{}': {}", c, e))?;
        // Small delay between characters for reliability
        std::thread::sleep(std::time::Duration::from_millis(10));
    }

    Ok(())
}

/// Send a special key
fn send_special_key(key_name: &str) -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    let key = match key_name.to_lowercase().as_str() {
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "escape" | "esc" => Key::Escape,
        "backspace" => Key::Backspace,
        "delete" => Key::Delete,
        "up" | "arrowup" => Key::UpArrow,
        "down" | "arrowdown" => Key::DownArrow,
        "left" | "arrowleft" => Key::LeftArrow,
        "right" | "arrowright" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "space" => Key::Space,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        _ => return Err(format!("Unknown special key: {}", key_name)),
    };

    enigo.key(key, enigo::Direction::Click)
        .map_err(|e| format!("Failed to send key: {}", e))?;

    Ok(())
}

/// Send a key combination (e.g., Ctrl+C)
fn send_key_combo(combo: &str) -> Result<(), String> {
    use enigo::{Enigo, Key, Keyboard, Settings};

    let mut enigo = Enigo::new(&Settings::default())
        .map_err(|e| format!("Failed to create Enigo instance: {}", e))?;

    let parts: Vec<&str> = combo.split('+').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return Err("Empty key combination".to_string());
    }

    // Collect modifier keys
    let mut modifiers: Vec<Key> = Vec::new();
    for part in &parts[..parts.len() - 1] {
        let modifier = match part.to_lowercase().as_str() {
            "ctrl" | "control" => Key::Control,
            "alt" => Key::Alt,
            "shift" => Key::Shift,
            "meta" | "win" | "cmd" | "super" => Key::Meta,
            _ => continue,
        };
        modifiers.push(modifier);
    }

    // Press all modifier keys
    for modifier in &modifiers {
        enigo.key(*modifier, enigo::Direction::Press)
            .map_err(|e| format!("Failed to press modifier: {}", e))?;
    }

    // Small delay to ensure modifiers are registered
    std::thread::sleep(std::time::Duration::from_millis(10));

    // Press and release the main key
    let main_key = parts.last().unwrap();
    if main_key.len() == 1 {
        // Single character - use Unicode key
        let c = main_key.to_lowercase().chars().next().unwrap();
        enigo.key(Key::Unicode(c), enigo::Direction::Click)
            .map_err(|e| format!("Failed to send key: {}", e))?;
    } else {
        // Special key - map to Key enum
        let key = match main_key.to_lowercase().as_str() {
            "enter" | "return" => Key::Return,
            "tab" => Key::Tab,
            "escape" | "esc" => Key::Escape,
            "backspace" => Key::Backspace,
            "delete" => Key::Delete,
            "up" | "arrowup" => Key::UpArrow,
            "down" | "arrowdown" => Key::DownArrow,
            "left" | "arrowleft" => Key::LeftArrow,
            "right" | "arrowright" => Key::RightArrow,
            "home" => Key::Home,
            "end" => Key::End,
            "pageup" => Key::PageUp,
            "pagedown" => Key::PageDown,
            "space" => Key::Space,
            _ => return Err(format!("Unknown key in combo: {}", main_key)),
        };
        enigo.key(key, enigo::Direction::Click)
            .map_err(|e| format!("Failed to send key: {}", e))?;
    }

    // Small delay before releasing
    std::thread::sleep(std::time::Duration::from_millis(10));

    // Release modifier keys in reverse order
    for modifier in modifiers.iter().rev() {
        enigo.key(*modifier, enigo::Direction::Release)
            .map_err(|e| format!("Failed to release modifier: {}", e))?;
    }

    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Create a new terminal session
#[tauri::command]
async fn terminal_create<R: Runtime>(
    app: AppHandle<R>,
    config: TerminalConfig,
) -> Result<TerminalResult, String> {
    let session_id = Uuid::new_v4().to_string();
    let shell = detect_shell(&config.shell);
    let (shell_cmd, shell_args) = get_shell_command(&shell);

    let working_dir = config.working_dir.clone().unwrap_or_else(|| {
        std::env::current_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| ".".to_string())
    });

    println!("[Terminal] Creating session {} with shell '{}' in '{}'", session_id, shell, working_dir);

    // Create the shell process
    let mut cmd = Command::new(&shell_cmd);
    cmd.args(&shell_args)
        .current_dir(&working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // On Windows, create without a console window unless show_window is true
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        if !config.show_window {
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Take ownership of stdin
    let stdin_handle = child.stdin.take();

    // Set up output capture
    let output_buffer = Arc::new(Mutex::new(OutputBuffer::default()));
    let output_clone = output_buffer.clone();

    // Capture stdout
    if let Some(stdout) = child.stdout.take() {
        let session_id_clone = session_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if let Ok(mut buf) = output_clone.lock() {
                    buf.push(line);
                }
            }
            eprintln!("[Terminal] stdout reader exited for {}", session_id_clone);
        });
    }

    // Capture stderr
    let output_clone2 = output_buffer.clone();
    if let Some(stderr) = child.stderr.take() {
        let session_id_clone = session_id.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if let Ok(mut buf) = output_clone2.lock() {
                    buf.push(line);
                }
            }
            eprintln!("[Terminal] stderr reader exited for {}", session_id_clone);
        });
    }

    // Create visible terminal window if requested
    // Instead of a blank webview, we launch a real terminal emulator
    let window_label = if config.show_window {
        let title = config.title.clone().unwrap_or_else(|| format!("Zipp Terminal - {}", shell));

        #[cfg(target_os = "windows")]
        {
            // Launch Windows Terminal or fallback to cmd/powershell in a new window
            let terminal_result = Command::new("wt")
                .args(["--title", &title, "-d", &working_dir, &shell_cmd])
                .spawn();

            if terminal_result.is_err() {
                // Fallback: launch shell in a new console window
                let _ = Command::new("cmd")
                    .args(["/c", "start", &title, &shell_cmd])
                    .current_dir(&working_dir)
                    .spawn();
            }
        }

        #[cfg(target_os = "macos")]
        {
            // Use osascript to open Terminal.app
            let script = format!(
                r#"tell application "Terminal"
                    activate
                    do script "cd '{}' && {}"
                end tell"#,
                working_dir, shell_cmd
            );
            let _ = Command::new("osascript")
                .args(["-e", &script])
                .spawn();
        }

        #[cfg(target_os = "linux")]
        {
            // Try common terminal emulators
            let terminals = ["gnome-terminal", "konsole", "xfce4-terminal", "xterm"];
            for term in terminals {
                let result = match term {
                    "gnome-terminal" => Command::new(term)
                        .args(["--title", &title, "--working-directory", &working_dir, "--", &shell_cmd])
                        .spawn(),
                    "konsole" => Command::new(term)
                        .args(["--workdir", &working_dir, "-e", &shell_cmd])
                        .spawn(),
                    _ => Command::new(term)
                        .args(["-e", &shell_cmd])
                        .current_dir(&working_dir)
                        .spawn(),
                };
                if result.is_ok() {
                    break;
                }
            }
        }

        // Give the terminal window time to open
        std::thread::sleep(std::time::Duration::from_millis(500));

        Some(title)
    } else {
        None
    };

    // Store session
    let state = app.state::<TerminalState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    sessions.insert(session_id.clone(), TerminalSession {
        id: session_id.clone(),
        shell: shell.clone(),
        working_dir: working_dir.clone(),
        process: child,
        output: output_buffer,
        window_label,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs(),
        _stdin_handle: stdin_handle,
    });

    println!("[Terminal] Session {} created successfully", session_id);

    Ok(TerminalResult {
        success: true,
        session_id: Some(session_id),
        data: Some(working_dir),
        error: None,
    })
}

/// Maximum width for screenshot images (smaller = faster API calls)
const MAX_SCREENSHOT_WIDTH: u32 = 800;

/// JPEG quality (0-100, lower = smaller file)
const JPEG_QUALITY: u8 = 55;

/// Resize image if needed, maintaining aspect ratio
fn resize_image_if_needed(img: image::RgbaImage) -> image::RgbaImage {
    let (width, height) = img.dimensions();
    if width <= MAX_SCREENSHOT_WIDTH {
        return img;
    }
    let scale = MAX_SCREENSHOT_WIDTH as f32 / width as f32;
    let new_height = (height as f32 * scale) as u32;
    image::imageops::resize(&img, MAX_SCREENSHOT_WIDTH, new_height, image::imageops::FilterType::Triangle)
}

/// Take a screenshot of the terminal window or entire screen
#[tauri::command]
async fn terminal_screenshot<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<String, String> {
    // Try to find the terminal window first
    let state = app.state::<TerminalState>();
    let window_label = {
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get(&session_id)
            .and_then(|s| s.window_label.clone())
    };

    // Run screenshot capture in blocking task
    let result = tokio::task::spawn_blocking(move || -> Result<String, String> {
        use xcap::Window;
        use base64::Engine;

        // If we have a window title, try to find and capture that specific window
        if let Some(ref title) = window_label {
            let windows = Window::all().map_err(|e| format!("Failed to enumerate windows: {}", e))?;

            // Look for windows that match our terminal title or common terminal names
            let target_window = windows.into_iter().find(|w| {
                if let Ok(win_title) = w.title() {
                    // Match by our custom title, or common terminal window patterns
                    win_title.contains(title) ||
                    win_title.contains("Zipp Terminal") ||
                    win_title.contains("Windows PowerShell") ||
                    win_title.contains("Command Prompt") ||
                    win_title.contains("Terminal") ||
                    win_title.contains("bash") ||
                    win_title.contains("zsh")
                } else {
                    false
                }
            });

            if let Some(win) = target_window {
                let image = win.capture_image().map_err(|e| format!("Failed to capture window: {}", e))?;
                let resized = resize_image_if_needed(image);

                let mut jpeg_data = Vec::new();
                let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_data, JPEG_QUALITY);
                encoder.encode_image(&resized).map_err(|e| format!("Failed to encode JPEG: {}", e))?;

                let base64_data = base64::engine::general_purpose::STANDARD.encode(&jpeg_data);
                return Ok(format!("data:image/jpeg;base64,{}", base64_data));
            }
        }

        // Fallback: capture the entire primary monitor
        use xcap::Monitor;
        let monitors = Monitor::all().map_err(|e| format!("Failed to get monitors: {}", e))?;
        let primary = monitors.into_iter().next().ok_or("No monitor found")?;

        let image = primary.capture_image().map_err(|e| format!("Failed to capture screen: {}", e))?;
        let resized = resize_image_if_needed(image);

        let mut jpeg_data = Vec::new();
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut jpeg_data, JPEG_QUALITY);
        encoder.encode_image(&resized).map_err(|e| format!("Failed to encode JPEG: {}", e))?;

        let base64_data = base64::engine::general_purpose::STANDARD.encode(&jpeg_data);
        Ok(format!("data:image/jpeg;base64,{}", base64_data))
    })
    .await
    .map_err(|e| format!("Screenshot task failed: {}", e))??;

    Ok(result)
}

/// Send keyboard input to the terminal
#[tauri::command]
async fn terminal_send_keys<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    keys: Vec<KeyAction>,
) -> Result<(), String> {
    // Verify session exists
    {
        let state = app.state::<TerminalState>();
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        if !sessions.contains_key(&session_id) {
            return Err("Session not found".to_string());
        }
    }

    // Focus the terminal window if it exists
    {
        let state = app.state::<TerminalState>();
        let sessions = state.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(session) = sessions.get(&session_id) {
            if let Some(ref title) = session.window_label {
                // Find and focus the real terminal window by title
                use xcap::Window;
                if let Ok(windows) = Window::all() {
                    if let Some(_win) = windows.into_iter().find(|w| {
                        if let Ok(win_title) = w.title() {
                            win_title.contains(title) ||
                            win_title.contains("Zipp Terminal") ||
                            win_title.contains("Windows PowerShell") ||
                            win_title.contains("Command Prompt") ||
                            win_title.contains("Terminal")
                        } else {
                            false
                        }
                    }) {
                        // Try to bring window to front
                        #[cfg(target_os = "windows")]
                        {
                            use std::os::windows::process::CommandExt;
                            // Use powershell to activate window
                            let _ = Command::new("powershell")
                                .creation_flags(0x08000000)
                                .args(["-Command", &format!(
                                    "$w = Get-Process | Where-Object {{$_.MainWindowTitle -like '*{}*'}} | Select-Object -First 1; if ($w) {{ [void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic'); [Microsoft.VisualBasic.Interaction]::AppActivate($w.Id) }}",
                                    title
                                )])
                                .output();
                        }

                        #[cfg(any(target_os = "linux", target_os = "macos"))]
                        {
                            // xdotool or wmctrl can be used on Linux
                            let _ = Command::new("xdotool")
                                .args(["search", "--name", title, "windowactivate"])
                                .output();
                        }
                    }
                }
            }
        }
    }

    // Small delay to ensure window is focused
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // Send key actions
    for action in keys {
        match action.action_type.as_str() {
            "type" => {
                send_text_as_typing(&action.value)?;
            }
            "key" => {
                send_special_key(&action.value)?;
            }
            "combo" => {
                send_key_combo(&action.value)?;
            }
            _ => {
                return Err(format!("Unknown action type: {}", action.action_type));
            }
        }

        // Apply delay if specified
        if let Some(delay) = action.delay_ms {
            tokio::time::sleep(tokio::time::Duration::from_millis(delay)).await;
        }
    }

    Ok(())
}

/// Read recent output from the terminal
#[tauri::command]
async fn terminal_read_output<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    max_lines: Option<usize>,
) -> Result<String, String> {
    let state = app.state::<TerminalState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions.get(&session_id).ok_or("Session not found")?;
    let output = session.output.lock().map_err(|e| e.to_string())?;

    let lines = if let Some(max) = max_lines {
        output.get_recent(max)
    } else {
        output.get_all()
    };

    Ok(lines.join("\n"))
}

/// Close a terminal session
#[tauri::command]
async fn terminal_close<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
) -> Result<(), String> {
    let state = app.state::<TerminalState>();
    let mut sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    if let Some(mut session) = sessions.remove(&session_id) {
        // Kill the shell process first
        let _ = session.process.kill();

        // Try to close the terminal window if it was opened
        if session.window_label.is_some() {
            // Note: The terminal window launched separately may stay open
            // This is intentional - the user can close it manually
            println!("[Terminal] Session {} closed (terminal window may remain open)", session_id);
        } else {
            println!("[Terminal] Session {} closed", session_id);
        }
    }

    Ok(())
}

/// Show or hide the terminal popup window
/// Note: Since we now launch real terminal windows, this has limited functionality
#[tauri::command]
async fn terminal_show_window<R: Runtime>(
    app: AppHandle<R>,
    session_id: String,
    visible: bool,
) -> Result<(), String> {
    let state = app.state::<TerminalState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let session = sessions.get(&session_id).ok_or("Session not found")?;

    if let Some(ref title) = session.window_label {
        if visible {
            // Try to bring the terminal window to front
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("powershell")
                    .creation_flags(0x08000000)
                    .args(["-Command", &format!(
                        "$w = Get-Process | Where-Object {{$_.MainWindowTitle -like '*{}*'}} | Select-Object -First 1; if ($w) {{ [void][System.Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic'); [Microsoft.VisualBasic.Interaction]::AppActivate($w.Id) }}",
                        title
                    )])
                    .output();
            }

            #[cfg(any(target_os = "linux", target_os = "macos"))]
            {
                let _ = Command::new("xdotool")
                    .args(["search", "--name", title, "windowactivate"])
                    .output();
            }
        }
        // Note: Hiding external terminal windows is not easily supported
        Ok(())
    } else {
        Err("Session does not have a visible window".to_string())
    }
}

/// List all active terminal sessions
#[tauri::command]
async fn terminal_list_sessions<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<SessionInfo>, String> {
    let state = app.state::<TerminalState>();
    let sessions = state.sessions.lock().map_err(|e| e.to_string())?;

    let infos: Vec<SessionInfo> = sessions
        .values()
        .map(|s| SessionInfo {
            session_id: s.id.clone(),
            shell: s.shell.clone(),
            working_dir: s.working_dir.clone(),
            visible: s.window_label.is_some(),
            created_at: s.created_at,
        })
        .collect();

    Ok(infos)
}

// =============================================================================
// Plugin Initialization
// =============================================================================

/// Initialize the terminal plugin
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("zipp-terminal")
        .setup(|app, _api| {
            app.manage(TerminalState::default());
            println!("[Terminal Plugin] Initialized");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            terminal_create,
            terminal_screenshot,
            terminal_send_keys,
            terminal_read_output,
            terminal_close,
            terminal_show_window,
            terminal_list_sessions,
        ])
        .build()
}
