// Services module - manages external Python services
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::net::TcpListener;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

// =============================================================================
// Cross-Platform Process Management
// =============================================================================

/// Kill a process tree cross-platform
/// On Windows, uses taskkill /F /T to kill the entire process tree
/// On Linux/macOS, uses pkill and kill -9 to terminate child processes and main process
pub fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        println!("[Services] Killing process tree for PID {} (Windows)", pid);
        let output = Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let stderr = String::from_utf8_lossy(&out.stderr);
            if !stdout.is_empty() {
                println!("[Services] taskkill output: {}", stdout.trim());
            }
            if !stderr.is_empty() && !stderr.contains("not found") {
                println!("[Services] taskkill stderr: {}", stderr.trim());
            }
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        println!("[Services] Killing process tree for PID {} (Unix)", pid);
        // First, kill child processes using pkill -P (parent PID)
        let _ = Command::new("pkill")
            .args(["-9", "-P", &pid.to_string()])
            .output();
        // Then kill the main process
        let _ = Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output();
    }
}

/// Find processes listening on a specific port cross-platform
/// Returns a vector of PIDs found listening on the port
/// Security: Uses separate arguments instead of shell interpolation to prevent command injection
pub fn find_processes_on_port(port: u16) -> Vec<u32> {
    let mut pids = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Security: Use netstat directly with separate arguments, then filter in Rust
        // This avoids shell interpolation which could be exploited if port were user-controlled
        if let Ok(output) = Command::new("netstat")
            .args(["-ano"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            let port_str = format!(":{}", port);
            for line in stdout.lines() {
                // Filter lines that contain our port and are in LISTENING state
                if line.contains(&port_str) && line.contains("LISTENING") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(pid_str) = parts.last() {
                        if let Ok(pid) = pid_str.parse::<u32>() {
                            if pid > 0 && !pids.contains(&pid) {
                                pids.push(pid);
                            }
                        }
                    }
                }
            }
        }
    }

    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        // Use lsof to find processes on the port
        if let Ok(output) = Command::new("lsof")
            .args(["-t", "-i", &format!(":{}", port)])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Ok(pid) = line.trim().parse::<u32>() {
                    if pid > 0 && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
    }

    pids
}

/// Get the shell command for starting a service based on platform
#[cfg(target_os = "windows")]
fn get_service_command(service_path: &PathBuf) -> (Command, PathBuf) {
    let start_script = service_path.join("start.bat");
    let mut cmd = Command::new("cmd");
    cmd.args(["/c", start_script.to_str().unwrap()]);
    (cmd, start_script)
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
fn get_service_command(service_path: &PathBuf) -> (Command, PathBuf) {
    // Try start.sh first, then fall back to start.bat with bash
    let start_sh = service_path.join("start.sh");
    let start_bat = service_path.join("start.bat");

    if start_sh.exists() {
        let mut cmd = Command::new("bash");
        cmd.arg(start_sh.to_str().unwrap());
        (cmd, start_sh)
    } else if start_bat.exists() {
        // Some services may only have .bat files, try to run with bash
        let mut cmd = Command::new("bash");
        cmd.arg(start_bat.to_str().unwrap());
        (cmd, start_bat)
    } else {
        // Default to start.sh path even if it doesn't exist (will fail later)
        let mut cmd = Command::new("bash");
        cmd.arg(start_sh.to_str().unwrap());
        (cmd, start_sh)
    }
}

// Maximum number of output lines to keep per service
const MAX_OUTPUT_LINES: usize = 1000;

// Port range for dynamic allocation (global services)
const PORT_RANGE_START: u16 = 8700;
const PORT_RANGE_END: u16 = 8899;

// Port range for package services (isolated from global services)
const PACKAGE_PORT_RANGE_START: u16 = 8900;
const PACKAGE_PORT_RANGE_END: u16 = 8999;

/// Find an available port, trying the preferred port first
/// Falls back to scanning PORT_RANGE_START..PORT_RANGE_END
fn find_available_port(preferred: u16) -> Result<u16, String> {
    // Try the preferred port first
    if preferred > 0 {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", preferred)) {
            drop(listener);
            return Ok(preferred);
        }
    }

    // Scan the port range for an available port
    for port in PORT_RANGE_START..=PORT_RANGE_END {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)) {
            drop(listener);
            println!("[Services] Preferred port {} unavailable, using port {}", preferred, port);
            return Ok(port);
        }
    }

    Err(format!(
        "No available port found in range {}-{}",
        PORT_RANGE_START, PORT_RANGE_END
    ))
}

// =============================================================================
// Lifecycle Configuration
// =============================================================================

/// Configuration for service lifecycle management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceLifecycleConfig {
    /// Default idle timeout in seconds (0 = never auto-stop). Default: 900 (15 min)
    pub default_idle_timeout_secs: u64,
    /// Per-service idle timeout overrides
    pub service_idle_timeouts: HashMap<String, u64>,
    /// Startup timeout in seconds. Default: 60
    pub startup_timeout_secs: u64,
}

impl Default for ServiceLifecycleConfig {
    fn default() -> Self {
        Self {
            default_idle_timeout_secs: 900, // 15 minutes
            service_idle_timeouts: HashMap::new(),
            startup_timeout_secs: 60,
        }
    }
}

/// Result from ensure_service_ready command
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnsureServiceResult {
    pub success: bool,
    pub port: Option<u16>,
    pub error: Option<String>,
    pub already_running: bool,
}

// Global state for tracking running services
pub struct ServicesState {
    pub running: Mutex<HashMap<String, RunningService>>,
    pub lifecycle_config: Mutex<ServiceLifecycleConfig>,
}

impl Default for ServicesState {
    fn default() -> Self {
        Self {
            running: Mutex::new(HashMap::new()),
            lifecycle_config: Mutex::new(ServiceLifecycleConfig::default()),
        }
    }
}

// Output buffer for a service
pub struct ServiceOutputBuffer {
    pub lines: VecDeque<String>,
}

impl Default for ServiceOutputBuffer {
    fn default() -> Self {
        Self {
            lines: VecDeque::with_capacity(MAX_OUTPUT_LINES),
        }
    }
}

impl ServiceOutputBuffer {
    pub fn push(&mut self, line: String) {
        if self.lines.len() >= MAX_OUTPUT_LINES {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }

    pub fn get_all(&self) -> Vec<String> {
        self.lines.iter().cloned().collect()
    }

    pub fn get_recent(&self, count: usize) -> Vec<String> {
        self.lines.iter().rev().take(count).rev().cloned().collect()
    }
}

pub struct RunningService {
    pub process: Child,
    pub port: u16,
    pub output: Arc<Mutex<ServiceOutputBuffer>>,
    /// Last time this service was accessed (for idle timeout tracking)
    pub last_used: Arc<Mutex<Instant>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub category: String,
    pub port: u16,
    pub icon: String,
    pub color: String,
    pub path: String,
    pub installed: bool,
    #[serde(rename = "startupTimeout", default = "default_startup_timeout")]
    pub startup_timeout: u64,
}

fn default_startup_timeout() -> u64 {
    60
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceStatus {
    pub id: String,
    pub running: bool,
    pub healthy: bool,
    pub port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceOutputLine {
    pub service_id: String,
    pub line: String,
    pub stream: String, // "stdout" or "stderr"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServiceOutput {
    pub service_id: String,
    pub lines: Vec<String>,
}

/// Get the services directory path
fn get_services_dir() -> Result<PathBuf, String> {
    // 1. Check AppData/Roaming/zipp/services (primary location for both dev and production)
    if let Some(app_data) = dirs::data_dir() {
        let services_path = app_data.join("zipp").join("services");
        if services_path.exists() && services_path.is_dir() {
            return Ok(services_path);
        }
    }

    // 2. Check relative to executable (for bundled installs)
    if let Ok(exe_path) = std::env::current_exe() {
        // Check ../resources/services (typical Tauri bundle location)
        if let Some(exe_dir) = exe_path.parent() {
            let bundled_path = exe_dir.join("resources").join("services");
            if bundled_path.exists() && bundled_path.is_dir() {
                return Ok(bundled_path);
            }
        }
    }

    // 3. Development fallback: walk up from exe to find repo root
    if let Ok(exe_path) = std::env::current_exe() {
        let mut current = exe_path.parent();
        while let Some(dir) = current {
            let services_path = dir.join("services");
            if services_path.exists() && services_path.is_dir() {
                // Verify it looks like our services dir (has at least one service.json)
                if let Ok(entries) = std::fs::read_dir(&services_path) {
                    for entry in entries.flatten() {
                        if entry.path().join("service.json").exists() {
                            return Ok(services_path);
                        }
                    }
                }
            }
            current = dir.parent();
        }
    }

    // 4. Development fallback: check current working directory parents
    if let Ok(cwd) = std::env::current_dir() {
        let mut current = Some(cwd.as_path());
        while let Some(dir) = current {
            let services_path = dir.join("services");
            if services_path.exists() && services_path.is_dir() {
                return Ok(services_path.to_path_buf());
            }
            current = dir.parent();
        }
    }

    // Build helpful error message with paths we checked
    let mut checked_paths = Vec::new();

    if let Some(app_data) = dirs::data_dir() {
        checked_paths.push(app_data.join("zipp").join("services").to_string_lossy().to_string());
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            checked_paths.push(exe_dir.join("resources").join("services").to_string_lossy().to_string());
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        checked_paths.push(cwd.join("services").to_string_lossy().to_string());
    }

    Err(format!(
        "Services directory not found. Checked: {}. Run the dev setup script (run_dev.bat on Windows, or manually copy services to ~/.local/share/zipp/services on Linux/macOS).",
        checked_paths.join(", ")
    ))
}

/// List all available services by scanning the services directory
#[tauri::command]
pub fn list_services() -> Result<Vec<ServiceInfo>, String> {
    let services_dir = get_services_dir()?;
    let mut services = Vec::new();

    let entries = std::fs::read_dir(&services_dir)
        .map_err(|e| format!("Failed to read services directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if !path.is_dir() {
            continue;
        }

        // Check if this directory has a start script (start.bat on Windows, start.sh or start.bat on Unix)
        let start_bat = path.join("start.bat");
        let start_sh = path.join("start.sh");
        let has_start_script = start_bat.exists() || start_sh.exists();
        if !has_start_script {
            continue;
        }

        let id = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        // Try to read service.json for metadata
        let service_json = path.join("service.json");
        let (name, description, category, port, icon, color, startup_timeout) = if service_json.exists() {
            let content = std::fs::read_to_string(&service_json).unwrap_or_default();
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                (
                    json.get("name").and_then(|v| v.as_str()).unwrap_or(&id).to_string(),
                    json.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    json.get("category").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    json.get("port").and_then(|v| v.as_u64()).unwrap_or(0) as u16,
                    json.get("icon").and_then(|v| v.as_str()).unwrap_or("server").to_string(),
                    json.get("color").and_then(|v| v.as_str()).unwrap_or("#6B7280").to_string(),
                    json.get("startupTimeout").and_then(|v| v.as_u64()).unwrap_or(60),
                )
            } else {
                (id.clone(), String::new(), String::new(), 0, "server".to_string(), "#6B7280".to_string(), 60)
            }
        } else {
            // Default: use folder name as service name
            let name = id.replace("-", " ").replace("_", " ");
            let name = name.split_whitespace()
                .map(|word| {
                    let mut chars = word.chars();
                    match chars.next() {
                        None => String::new(),
                        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                    }
                })
                .collect::<Vec<_>>()
                .join(" ");
            (name, String::new(), String::new(), 0, "server".to_string(), "#6B7280".to_string(), 60)
        };

        // Check if venv exists (installed)
        let venv_path = path.join("venv");
        let installed = venv_path.exists();

        services.push(ServiceInfo {
            id,
            name,
            description,
            category,
            port,
            icon,
            color,
            path: path.to_string_lossy().to_string(),
            installed,
            startup_timeout,
        });
    }

    // Sort by name
    services.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(services)
}

/// Start a service by running its start.bat file
#[tauri::command]
pub async fn start_service(
    app: AppHandle,
    service_id: String,
    env_vars: Option<HashMap<String, String>>,
) -> Result<ServiceStatus, String> {
    let services_dir = get_services_dir()?;
    let service_path = services_dir.join(&service_id);

    if !service_path.exists() {
        return Err(format!("Service '{}' not found", service_id));
    }

    // Check for start script (cross-platform)
    let (_, start_script) = get_service_command(&service_path);
    if !start_script.exists() {
        return Err(format!("Start script not found for service '{}' (tried: {:?})", service_id, start_script));
    }

    // Get preferred port from service.json
    let service_json = service_path.join("service.json");
    let preferred_port = if service_json.exists() {
        let content = std::fs::read_to_string(&service_json).unwrap_or_default();
        serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|json| json.get("port").and_then(|v| v.as_u64()))
            .unwrap_or(0) as u16
    } else {
        0
    };

    // Find an available port (tries preferred first, then falls back to range)
    let port = find_available_port(preferred_port)?;
    println!("[Services] Starting '{}' on port {} (preferred: {})", service_id, port, preferred_port);

    // Check if already running
    let state = app.state::<ServicesState>();
    {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if running.contains_key(&service_id) {
            return Ok(ServiceStatus {
                id: service_id,
                running: true,
                healthy: false, // Will be checked separately
                port,
            });
        }
    }

    // Build the command with optional environment variables (cross-platform)
    let (mut cmd, _) = get_service_command(&service_path);
    cmd.current_dir(&service_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Always set the ZIPP_SERVICE_PORT environment variable for dynamic port allocation
    cmd.env("ZIPP_SERVICE_PORT", port.to_string());

    // Add environment variables if provided
    if let Some(vars) = env_vars {
        for (key, value) in vars {
            if !value.is_empty() {
                cmd.env(&key, &value);
            }
        }
    }

    // Start the service with piped stdout/stderr for output capture
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start service: {}", e))?;

    // Create output buffer
    let output_buffer = Arc::new(Mutex::new(ServiceOutputBuffer::default()));

    // Spawn thread to read stdout
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let service_id_clone = service_id.clone();
    let output_clone = output_buffer.clone();
    let app_clone = app.clone();

    if let Some(stdout) = stdout {
        let service_id = service_id_clone.clone();
        let output = output_clone.clone();
        let app = app_clone.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // Add to buffer
                    if let Ok(mut buf) = output.lock() {
                        buf.push(line.clone());
                    }
                    // Emit event to frontend
                    let _ = app.emit(&format!("service-output:{}", service_id), ServiceOutputLine {
                        service_id: service_id.clone(),
                        line,
                        stream: "stdout".to_string(),
                    });
                }
            }
        });
    }

    if let Some(stderr) = stderr {
        let service_id = service_id_clone;
        let output = output_clone;
        let app = app_clone;
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    // Add to buffer (no prefix - frontend colors based on content)
                    if let Ok(mut buf) = output.lock() {
                        buf.push(line.clone());
                    }
                    // Emit event to frontend
                    let _ = app.emit(&format!("service-output:{}", service_id), ServiceOutputLine {
                        service_id: service_id.clone(),
                        line,
                        stream: "stderr".to_string(),
                    });
                }
            }
        });
    }

    // Store the running service with output buffer and last_used timestamp
    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        running.insert(service_id.clone(), RunningService {
            process: child,
            port,
            output: output_buffer,
            last_used: Arc::new(Mutex::new(Instant::now())),
        });
    }

    Ok(ServiceStatus {
        id: service_id,
        running: true,
        healthy: false,
        port,
    })
}

/// Stop a running service
#[tauri::command]
pub async fn stop_service(app: AppHandle, service_id: String) -> Result<ServiceStatus, String> {
    let state = app.state::<ServicesState>();

    // Get the port and PID before removing
    let (port, pid) = {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        running.get(&service_id)
            .map(|s| (s.port, s.process.id()))
            .unwrap_or((0, 0))
    };

    println!("[Services] Stopping service '{}' (PID: {}, port: {})", service_id, pid, port);

    // First, kill the process tree by PID (cross-platform)
    if pid > 0 {
        kill_process_tree(pid);
    }

    // Remove from running services
    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        running.remove(&service_id);
    }

    // Also try to kill any process on that port (fallback for orphaned processes)
    if port > 0 {
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Find and kill any orphaned processes on the port (cross-platform)
        let orphan_pids = find_processes_on_port(port);
        for orphan_pid in orphan_pids {
            if orphan_pid != pid {
                println!("[Services] Killing orphaned process on port {}: PID {}", port, orphan_pid);
                kill_process_tree(orphan_pid);
            }
        }
    }

    // Small delay to ensure process is fully terminated
    std::thread::sleep(std::time::Duration::from_millis(200));

    println!("[Services] Service '{}' stopped", service_id);

    Ok(ServiceStatus {
        id: service_id,
        running: false,
        healthy: false,
        port,
    })
}

/// Check if a service is healthy by hitting its health endpoint
#[tauri::command]
pub async fn check_service_health(service_id: String, port: u16) -> Result<ServiceStatus, String> {
    if port == 0 {
        return Ok(ServiceStatus {
            id: service_id,
            running: false,
            healthy: false,
            port: 0,
        });
    }

    let health_url = format!("http://127.0.0.1:{}/health", port);

    // Try to hit the health endpoint
    let healthy = match reqwest::Client::new()
        .get(&health_url)
        .timeout(std::time::Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    };

    Ok(ServiceStatus {
        id: service_id,
        running: healthy,
        healthy,
        port,
    })
}

/// Get status of all services
#[tauri::command]
pub async fn get_services_status(_app: AppHandle) -> Result<Vec<ServiceStatus>, String> {
    let services = list_services()?;
    let mut statuses = Vec::new();

    for service in services {
        let status = check_service_health(service.id.clone(), service.port).await?;
        statuses.push(status);
    }

    Ok(statuses)
}

/// Get the services directory path (for display in UI)
#[tauri::command]
pub fn get_services_directory() -> Result<String, String> {
    let dir = get_services_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

/// Get buffered output for a service
#[tauri::command]
pub fn get_service_output(app: AppHandle, service_id: String, limit: Option<usize>) -> Result<ServiceOutput, String> {
    let state = app.state::<ServicesState>();
    let running = state.running.lock().map_err(|e| e.to_string())?;

    if let Some(service) = running.get(&service_id) {
        let output = service.output.lock().map_err(|e| e.to_string())?;
        let lines = if let Some(limit) = limit {
            output.get_recent(limit)
        } else {
            output.get_all()
        };
        Ok(ServiceOutput {
            service_id,
            lines,
        })
    } else {
        Ok(ServiceOutput {
            service_id,
            lines: vec![],
        })
    }
}

/// Clear output buffer for a service
#[tauri::command]
pub fn clear_service_output(app: AppHandle, service_id: String) -> Result<(), String> {
    let state = app.state::<ServicesState>();
    let running = state.running.lock().map_err(|e| e.to_string())?;

    if let Some(service) = running.get(&service_id) {
        let mut output = service.output.lock().map_err(|e| e.to_string())?;
        output.lines.clear();
    }

    Ok(())
}

/// Get the port a running service is using
/// Returns None if the service is not running
/// Updates the last_used timestamp to keep the service alive
#[tauri::command]
pub fn get_service_port(app: AppHandle, service_id: String) -> Option<u16> {
    let state = app.state::<ServicesState>();
    let running = state.running.lock().ok()?;
    if let Some(service) = running.get(&service_id) {
        // Update last_used timestamp
        if let Ok(mut last_used) = service.last_used.lock() {
            *last_used = Instant::now();
        }
        Some(service.port)
    } else {
        None
    }
}

// =============================================================================
// Package Service Functions
// =============================================================================

/// Find an available port in the package service range
fn find_available_package_port(preferred: u16) -> Result<u16, String> {
    // Try the preferred port first if it's in the package range
    if preferred >= PACKAGE_PORT_RANGE_START && preferred <= PACKAGE_PORT_RANGE_END {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", preferred)) {
            drop(listener);
            return Ok(preferred);
        }
    }

    // Scan the package port range for an available port
    for port in PACKAGE_PORT_RANGE_START..=PACKAGE_PORT_RANGE_END {
        if let Ok(listener) = TcpListener::bind(format!("127.0.0.1:{}", port)) {
            drop(listener);
            return Ok(port);
        }
    }

    Err(format!(
        "No available port found in package range {}-{}",
        PACKAGE_PORT_RANGE_START, PACKAGE_PORT_RANGE_END
    ))
}

/// Generate a namespaced service ID for package services
/// Format: "{package_id}::{service_id}"
pub fn package_service_key(package_id: &str, service_id: &str) -> String {
    format!("{}::{}", package_id, service_id)
}

/// Start a service from a package
/// The service is registered with a namespaced key: "{package_id}::{service_id}"
#[tauri::command]
pub async fn start_package_service(
    app: AppHandle,
    package_id: String,
    service_id: String,
    service_path: String,
    preferred_port: Option<u16>,
    env_vars: Option<HashMap<String, String>>,
) -> Result<ServiceStatus, String> {
    let service_path = PathBuf::from(&service_path);

    if !service_path.exists() {
        return Err(format!("Service path not found: {:?}", service_path));
    }

    // Check for start script (cross-platform)
    let (_, start_script) = get_service_command(&service_path);
    if !start_script.exists() {
        return Err(format!("Start script not found in service directory (tried: {:?})", start_script));
    }

    // Find an available port in the package range
    let port = find_available_package_port(preferred_port.unwrap_or(0))?;
    let namespaced_id = package_service_key(&package_id, &service_id);

    println!(
        "[Services] Starting package service '{}::{}' on port {}",
        package_id, service_id, port
    );

    // Check if already running
    let state = app.state::<ServicesState>();
    {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if running.contains_key(&namespaced_id) {
            return Ok(ServiceStatus {
                id: namespaced_id,
                running: true,
                healthy: false,
                port,
            });
        }
    }

    // Build the command (cross-platform)
    let (mut cmd, _) = get_service_command(&service_path);
    cmd.current_dir(&service_path)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Set the port environment variable
    cmd.env("ZIPP_SERVICE_PORT", port.to_string());
    cmd.env("ZIPP_PACKAGE_ID", &package_id);

    // Add additional environment variables if provided
    if let Some(vars) = env_vars {
        for (key, value) in vars {
            if !value.is_empty() {
                cmd.env(&key, &value);
            }
        }
    }

    // Start the service
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start package service: {}", e))?;

    // Create output buffer
    let output_buffer = Arc::new(Mutex::new(ServiceOutputBuffer::default()));

    // Spawn threads to capture output
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        let namespaced_id_clone = namespaced_id.clone();
        let output = output_buffer.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().flatten() {
                if let Ok(mut buf) = output.lock() {
                    buf.push(line.clone());
                }
                let _ = app_clone.emit(
                    &format!("service-output:{}", namespaced_id_clone),
                    ServiceOutputLine {
                        service_id: namespaced_id_clone.clone(),
                        line,
                        stream: "stdout".to_string(),
                    },
                );
            }
        });
    }

    if let Some(stderr) = stderr {
        let namespaced_id_clone = namespaced_id.clone();
        let output = output_buffer.clone();
        let app_clone = app.clone();
        thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().flatten() {
                if let Ok(mut buf) = output.lock() {
                    buf.push(line.clone());
                }
                let _ = app_clone.emit(
                    &format!("service-output:{}", namespaced_id_clone),
                    ServiceOutputLine {
                        service_id: namespaced_id_clone.clone(),
                        line,
                        stream: "stderr".to_string(),
                    },
                );
            }
        });
    }

    // Store the running service with last_used timestamp
    {
        let mut running = state.running.lock().map_err(|e| e.to_string())?;
        running.insert(
            namespaced_id.clone(),
            RunningService {
                process: child,
                port,
                output: output_buffer,
                last_used: Arc::new(Mutex::new(Instant::now())),
            },
        );
    }

    Ok(ServiceStatus {
        id: namespaced_id,
        running: true,
        healthy: false,
        port,
    })
}

/// Stop all services belonging to a package
#[tauri::command]
pub async fn stop_package_services(app: AppHandle, package_id: String) -> Result<u32, String> {
    let prefix = format!("{}::", package_id);
    let state = app.state::<ServicesState>();

    // Find all services belonging to this package
    let services_to_stop: Vec<(String, u32, u16)> = {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        running
            .iter()
            .filter(|(id, _)| id.starts_with(&prefix))
            .map(|(id, service)| (id.clone(), service.process.id(), service.port))
            .collect()
    };

    let count = services_to_stop.len() as u32;

    // Stop each service (cross-platform)
    for (service_id, pid, port) in services_to_stop {
        println!(
            "[Services] Stopping package service '{}' (PID: {}, port: {})",
            service_id, pid, port
        );

        // Kill the process tree (cross-platform)
        if pid > 0 {
            kill_process_tree(pid);
        }

        // Remove from running services
        {
            let mut running = state.running.lock().map_err(|e| e.to_string())?;
            running.remove(&service_id);
        }
    }

    println!(
        "[Services] Stopped {} services for package '{}'",
        count, package_id
    );

    Ok(count)
}

/// Check if any services are running for a package
#[tauri::command]
pub fn get_package_services(app: AppHandle, package_id: String) -> Result<Vec<ServiceStatus>, String> {
    let prefix = format!("{}::", package_id);
    let state = app.state::<ServicesState>();
    let running = state.running.lock().map_err(|e| e.to_string())?;

    let services: Vec<ServiceStatus> = running
        .iter()
        .filter(|(id, _)| id.starts_with(&prefix))
        .map(|(id, service)| ServiceStatus {
            id: id.clone(),
            running: true,
            healthy: false, // Would need async check
            port: service.port,
        })
        .collect();

    Ok(services)
}

/// Get logs for a service
#[tauri::command]
pub fn get_service_logs(
    app: AppHandle,
    package_id: String,
    service_id: String,
) -> Result<serde_json::Value, String> {
    let namespaced_id = package_service_key(&package_id, &service_id);
    let state = app.state::<ServicesState>();
    let running = state.running.lock().map_err(|e| e.to_string())?;

    if let Some(service) = running.get(&namespaced_id) {
        let output = service.output.lock().map_err(|e| e.to_string())?;
        let logs = output.get_all();
        Ok(serde_json::json!({ "logs": logs }))
    } else {
        // Check if it's a global service
        if let Some(service) = running.get(&service_id) {
            let output = service.output.lock().map_err(|e| e.to_string())?;
            let logs = output.get_all();
            Ok(serde_json::json!({ "logs": logs }))
        } else {
            Ok(serde_json::json!({ "logs": ["Service not running or no logs available"] }))
        }
    }
}

// =============================================================================
// Service Lifecycle Management
// =============================================================================

/// Helper to check if a service is healthy via HTTP health endpoint
async fn check_health_async(port: u16) -> bool {
    if port == 0 {
        return false;
    }
    let health_url = format!("http://127.0.0.1:{}/health", port);
    match reqwest::Client::new()
        .get(&health_url)
        .timeout(Duration::from_secs(2))
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

/// Ensure a service is running and healthy, starting it if needed.
/// Polls health endpoint every 500ms until ready or timeout.
/// Updates last_used timestamp on every call.
#[tauri::command]
pub async fn ensure_service_ready(
    app: AppHandle,
    service_id: String,
) -> Result<EnsureServiceResult, String> {
    let state = app.state::<ServicesState>();

    // Get startup timeout - prefer per-service timeout from service.json, fall back to global config
    let startup_timeout_secs = {
        // First try to get service-specific timeout
        let services = list_services().unwrap_or_default();
        let service_timeout = services.iter()
            .find(|s| s.id == service_id)
            .map(|s| s.startup_timeout);

        // Use service-specific timeout if available and > 0, otherwise use global config
        match service_timeout {
            Some(t) if t > 0 => {
                println!("[Services] Using per-service startup timeout: {}s for {}", t, service_id);
                t
            }
            _ => {
                let config = state.lifecycle_config.lock().map_err(|e| e.to_string())?;
                config.startup_timeout_secs
            }
        }
    };

    // Check if service is already running
    let existing_port = {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        if let Some(service) = running.get(&service_id) {
            // Update last_used timestamp
            if let Ok(mut last_used) = service.last_used.lock() {
                *last_used = Instant::now();
            }
            Some(service.port)
        } else {
            None
        }
    };

    if let Some(port) = existing_port {
        // Service is running, check if healthy
        if check_health_async(port).await {
            println!("[Services] Service '{}' already running and healthy on port {}", service_id, port);
            return Ok(EnsureServiceResult {
                success: true,
                port: Some(port),
                error: None,
                already_running: true,
            });
        }
        // Service is running but not healthy yet, wait for it
        println!("[Services] Service '{}' is running on port {} but not healthy, waiting...", service_id, port);
    } else {
        // Service not running, start it
        println!("[Services] Service '{}' not running, starting...", service_id);
        match start_service(app.clone(), service_id.clone(), None).await {
            Ok(status) => {
                println!("[Services] Started service '{}' on port {}", service_id, status.port);
            }
            Err(e) => {
                return Ok(EnsureServiceResult {
                    success: false,
                    port: None,
                    error: Some(format!("Failed to start service: {}", e)),
                    already_running: false,
                });
            }
        }
    }

    // Get the port (might have been assigned during start)
    let port = {
        let running = state.running.lock().map_err(|e| e.to_string())?;
        running.get(&service_id).map(|s| s.port)
    };

    let port = match port {
        Some(p) => p,
        None => {
            return Ok(EnsureServiceResult {
                success: false,
                port: None,
                error: Some("Service started but port not found".to_string()),
                already_running: false,
            });
        }
    };

    // Poll health endpoint until ready or timeout
    let start_time = Instant::now();
    let timeout = Duration::from_secs(startup_timeout_secs);
    let poll_interval = Duration::from_millis(500);

    loop {
        if check_health_async(port).await {
            // Update last_used timestamp on success
            let running = state.running.lock().map_err(|e| e.to_string())?;
            if let Some(service) = running.get(&service_id) {
                if let Ok(mut last_used) = service.last_used.lock() {
                    *last_used = Instant::now();
                }
            }

            println!("[Services] Service '{}' is now healthy on port {}", service_id, port);
            return Ok(EnsureServiceResult {
                success: true,
                port: Some(port),
                error: None,
                already_running: existing_port.is_some(),
            });
        }

        if start_time.elapsed() >= timeout {
            return Ok(EnsureServiceResult {
                success: false,
                port: Some(port),
                error: Some(format!(
                    "Service started but health check timed out after {} seconds",
                    startup_timeout_secs
                )),
                already_running: false,
            });
        }

        tokio::time::sleep(poll_interval).await;
    }
}

/// Ensure a service is ready by name (dynamic lookup)
/// Finds the service by name (case-insensitive partial match) and ensures it's running.
/// This allows runtimes to pass human-readable names like "Chatterbox TTS" or "chatterbox".
#[tauri::command]
pub async fn ensure_service_ready_by_name(
    app: AppHandle,
    service_name: String,
) -> Result<EnsureServiceResult, String> {
    // Get all services
    let services = list_services()?;

    // Find service by name (case-insensitive partial match)
    let name_lower = service_name.to_lowercase();
    let service = services.iter().find(|s| {
        // Match by ID (e.g., "chatterbox-tts")
        s.id.to_lowercase() == name_lower ||
        s.id.to_lowercase().contains(&name_lower) ||
        // Match by name (e.g., "Chatterbox TTS")
        s.name.to_lowercase() == name_lower ||
        s.name.to_lowercase().contains(&name_lower) ||
        // Match by simplified name (removing spaces and special chars)
        s.name.to_lowercase().replace(" ", "").replace("-", "").contains(&name_lower.replace(" ", "").replace("-", ""))
    });

    match service {
        Some(s) => {
            println!("[Services] Found service '{}' (id: {}) for name '{}'", s.name, s.id, service_name);
            ensure_service_ready(app, s.id.clone()).await
        }
        None => {
            println!("[Services] No service found matching name '{}'", service_name);
            Ok(EnsureServiceResult {
                success: false,
                port: None,
                error: Some(format!("No service found matching '{}'. Available services: {}",
                    service_name,
                    services.iter().map(|s| s.name.as_str()).collect::<Vec<_>>().join(", ")
                )),
                already_running: false,
            })
        }
    }
}

/// Ensure a service is ready by port (dynamic lookup)
/// Finds the service that runs on the given port and ensures it's running.
/// This allows runtimes to just pass the port from their API URL.
#[tauri::command]
pub async fn ensure_service_ready_by_port(
    app: AppHandle,
    port: u16,
) -> Result<EnsureServiceResult, String> {
    // Get all services
    let services = list_services()?;

    // Find service by port
    let service = services.iter().find(|s| s.port == port);

    match service {
        Some(s) => {
            println!("[Services] Found service '{}' (id: {}) for port {}", s.name, s.id, port);
            ensure_service_ready(app, s.id.clone()).await
        }
        None => {
            println!("[Services] No service found for port {}", port);
            Ok(EnsureServiceResult {
                success: false,
                port: None,
                error: Some(format!("No service found for port {}. Available services: {}",
                    port,
                    services.iter().map(|s| format!("{} (port {})", s.name, s.port)).collect::<Vec<_>>().join(", ")
                )),
                already_running: false,
            })
        }
    }
}

/// Get current lifecycle configuration
#[tauri::command]
pub fn get_lifecycle_config(app: AppHandle) -> Result<ServiceLifecycleConfig, String> {
    let state = app.state::<ServicesState>();
    let config = state.lifecycle_config.lock().map_err(|e| e.to_string())?;
    Ok(config.clone())
}

/// Set lifecycle configuration
#[tauri::command]
pub fn set_lifecycle_config(
    app: AppHandle,
    config: ServiceLifecycleConfig,
) -> Result<(), String> {
    let state = app.state::<ServicesState>();
    let mut current_config = state.lifecycle_config.lock().map_err(|e| e.to_string())?;
    *current_config = config;
    println!("[Services] Updated lifecycle config: {:?}", *current_config);
    Ok(())
}

/// Background task that monitors idle services and stops them
/// Should be spawned on app startup
pub fn run_idle_monitor(app: AppHandle) {
    let check_interval = Duration::from_secs(60);

    println!("[Services] Starting idle monitor (check interval: {:?})", check_interval);

    loop {
        thread::sleep(check_interval);

        let state = match app.try_state::<ServicesState>() {
            Some(s) => s,
            None => {
                println!("[Services] Idle monitor: state not available, stopping");
                return;
            }
        };

        // Get config
        let config = match state.lifecycle_config.lock() {
            Ok(c) => c.clone(),
            Err(e) => {
                println!("[Services] Idle monitor: failed to get config: {}", e);
                continue;
            }
        };

        // Skip if default timeout is 0 and no overrides
        if config.default_idle_timeout_secs == 0 && config.service_idle_timeouts.is_empty() {
            continue;
        }

        // Find services that have exceeded their idle timeout
        let services_to_stop: Vec<(String, u16, u32)> = {
            let running = match state.running.lock() {
                Ok(r) => r,
                Err(e) => {
                    println!("[Services] Idle monitor: failed to lock running services: {}", e);
                    continue;
                }
            };

            let mut to_stop = Vec::new();
            let now = Instant::now();

            for (service_id, service) in running.iter() {
                // Get timeout for this service (per-service override or default)
                let timeout_secs = config
                    .service_idle_timeouts
                    .get(service_id)
                    .copied()
                    .unwrap_or(config.default_idle_timeout_secs);

                // Skip if timeout is 0 (disabled)
                if timeout_secs == 0 {
                    continue;
                }

                // Check last_used timestamp
                let idle_duration = match service.last_used.lock() {
                    Ok(last_used) => now.duration_since(*last_used),
                    Err(_) => continue,
                };

                let timeout = Duration::from_secs(timeout_secs);
                if idle_duration >= timeout {
                    println!(
                        "[Services] Idle monitor: service '{}' idle for {:?} (timeout: {:?})",
                        service_id, idle_duration, timeout
                    );
                    to_stop.push((service_id.clone(), service.port, service.process.id()));
                }
            }

            to_stop
        };

        // Stop idle services
        for (service_id, port, pid) in services_to_stop {
            println!(
                "[Services] Idle monitor: stopping idle service '{}' (PID: {}, port: {})",
                service_id, pid, port
            );

            // Kill the process tree
            if pid > 0 {
                kill_process_tree(pid);
            }

            // Remove from running services
            if let Ok(mut running) = state.running.lock() {
                running.remove(&service_id);
            }

            // Kill orphaned processes on port
            if port > 0 {
                thread::sleep(Duration::from_millis(100));
                let orphan_pids = find_processes_on_port(port);
                for orphan_pid in orphan_pids {
                    if orphan_pid != pid {
                        println!(
                            "[Services] Idle monitor: killing orphaned process on port {}: PID {}",
                            port, orphan_pid
                        );
                        kill_process_tree(orphan_pid);
                    }
                }
            }

            println!("[Services] Idle monitor: service '{}' stopped due to idle timeout", service_id);
        }
    }
}
