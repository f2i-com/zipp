// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

pub mod http;
pub mod fs;  // Security utilities for path validation
pub mod video;
pub mod image_processing;
pub mod api_server;
pub mod media_server;
pub mod plugins;
pub mod tts;
pub mod services;
pub mod secrets;
pub mod packages;

use http::{HttpRequest, HttpResponse, make_request};
use api_server::{get_api_config, set_api_config, get_api_status};
use tauri::Manager;
use tauri::tray::{TrayIconBuilder, MouseButton, MouseButtonState};
use tauri::menu::{Menu, MenuItem};
use clap::Parser;

// =============================================================================
// CLI Arguments
// =============================================================================

#[derive(Parser, Debug, Clone)]
#[command(name = "zipp")]
#[command(about = "Zipp - Visual Workflow Builder")]
pub struct CliArgs {
    /// Run in headless mode (no GUI, API server only)
    #[arg(long)]
    pub headless: bool,

    /// API server port (default: 3000)
    #[arg(long, default_value = "3000")]
    pub port: u16,

    /// API key for authentication (optional)
    #[arg(long)]
    pub api_key: Option<String>,

    /// Bind to all interfaces (0.0.0.0) instead of localhost only
    #[arg(long)]
    pub public: bool,

    /// Minimize to system tray on close instead of exiting
    #[arg(long)]
    pub tray: bool,

    /// Run a workflow file and exit (hidden window mode for CLI/cron jobs)
    /// Accepts .json workflow files or .zipp packages
    #[arg(long, value_name = "FILE")]
    pub run: Option<String>,

    /// JSON string with input values for the workflow (used with --run)
    #[arg(long, value_name = "JSON")]
    pub inputs: Option<String>,

    /// Output file to write workflow results as JSON (used with --run)
    #[arg(long, value_name = "FILE")]
    pub output: Option<String>,
}

// Global flag for tray mode
static MINIMIZE_TO_TRAY: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

// =============================================================================
// CLI Run Mode State
// =============================================================================

/// State for CLI run mode (workflow execution from command line)
#[derive(Debug, Clone, Default)]
pub struct CliRunState {
    /// Path to workflow file to run
    pub workflow_path: Option<String>,
    /// JSON string with input values
    pub inputs: Option<String>,
    /// Output file for results
    pub output_path: Option<String>,
    /// Whether we're in CLI run mode
    pub is_run_mode: bool,
}

impl CliRunState {
    pub fn from_args(args: &CliArgs) -> Self {
        Self {
            workflow_path: args.run.clone(),
            inputs: args.inputs.clone(),
            output_path: args.output.clone(),
            is_run_mode: args.run.is_some(),
        }
    }
}

/// Set up the system tray icon and menu
fn setup_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Show Zipp", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Hide to Tray", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Zipp - Visual Workflow Builder")
        .on_menu_event(|app, event| {
            match event.id.as_ref() {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "hide" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.hide();
                    }
                }
                "quit" => {
                    // Stop all running services before exiting
                    if let Some(state) = app.try_state::<services::ServicesState>() {
                        if let Ok(mut running) = state.running.lock() {
                            let service_ids: Vec<String> = running.keys().cloned().collect();
                            for service_id in service_ids {
                                if let Some(mut service) = running.remove(&service_id) {
                                    println!("[Services] Stopping service '{}' on quit (PID: {})", service_id, service.process.id());
                                    let pid = service.process.id();
                                    services::kill_process_tree(pid);
                                    let _ = service.process.kill();
                                }
                            }
                        }
                    }
                    // Shutdown media server
                    media_server::shutdown_media_server();
                    app.exit(0);
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            // Double-click or left-click to show window
            if let tauri::tray::TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    println!("[Tray] System tray initialized");
    Ok(())
}
use video::{get_video_info, extract_video_frames, extract_video_frames_to_dir, extract_video_frames_batch, check_ffmpeg_status, download_ffmpeg};
use image_processing::{resize_image, resize_images_batch};
use plugins::{
    get_plugins_dir, get_default_plugins_dir, get_default_app_data_dir, list_plugins, read_plugin_manifest,
    read_plugin_nodes, read_plugin_bundle, create_plugin_scaffold, delete_plugin,
    copy_bundled_plugins, has_bundled_plugins, list_bundled_plugins, copy_plugins_to_folder,
    read_plugin_source, list_plugin_sources, write_plugin_bundle, plugin_has_sources,
    plugin_needs_rebuild, get_install_config, set_install_config, get_bundled_plugins_dir,
};

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// =============================================================================
// CLI Run Mode Commands
// =============================================================================

/// Get CLI run mode configuration (for workflow execution from command line)
#[tauri::command]
fn get_cli_run_config(state: tauri::State<'_, CliRunState>) -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "isRunMode": state.is_run_mode,
        "workflowPath": state.workflow_path,
        "inputs": state.inputs,
        "outputPath": state.output_path,
    }))
}

/// Exit the application (used after CLI workflow execution completes)
#[tauri::command]
fn exit_app(app: tauri::AppHandle, code: Option<i32>) {
    println!("[CLI] Exiting application with code: {}", code.unwrap_or(0));
    app.exit(code.unwrap_or(0));
}

/// Write workflow results to output file (used in CLI run mode)
#[tauri::command]
fn write_cli_output(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, &content)
        .map_err(|e| format!("Failed to write output file: {}", e))
}

/// Make an HTTP request from Rust (bypasses browser security restrictions)
/// This allows setting any headers including Origin, Referer, etc.
#[tauri::command]
async fn http_request(request: HttpRequest) -> Result<HttpResponse, String> {
    make_request(request).await
}

/// Get the user's Downloads folder path
#[tauri::command]
fn get_downloads_path() -> Result<String, String> {
    dirs::download_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine downloads directory".to_string())
}

/// Clean up temporary directories created by video processing
/// Only allows cleaning directories that contain "zipp-video" or are in system temp
#[tauri::command]
fn cleanup_temp_dir(path: String) -> Result<(), String> {
    // Security: Only allow cleaning temp directories related to video processing
    let path_lower = path.to_lowercase();
    let is_temp_path = path_lower.contains("zipp-video")
        || path_lower.contains("tmp")
        || path_lower.contains("temp");

    if !is_temp_path {
        return Err("Can only clean up temporary directories".to_string());
    }

    // Additional check: ensure path exists and is a directory
    let path_buf = std::path::PathBuf::from(&path);
    if !path_buf.exists() {
        return Ok(()); // Already cleaned up
    }
    if !path_buf.is_dir() {
        return Err("Path is not a directory".to_string());
    }

    std::fs::remove_dir_all(&path)
        .map_err(|e| format!("Failed to remove directory: {}", e))
}

// ============================================
// Macro Loading Commands
// ============================================

/// Get the macros directory path (repo root/macros or AppData/zipp/macros)
fn get_macros_dir() -> Result<std::path::PathBuf, String> {
    // 1. Check AppData/Roaming/zipp/macros (for user-installed macros)
    if let Some(app_data) = dirs::data_dir() {
        let macros_path = app_data.join("zipp").join("macros");
        if macros_path.exists() && macros_path.is_dir() {
            return Ok(macros_path);
        }
    }

    // 2. Check relative to executable (for bundled/dev builds)
    if let Ok(exe_path) = std::env::current_exe() {
        // Walk up to find repo root with macros folder
        let mut current = exe_path.parent();
        while let Some(dir) = current {
            let macros_path = dir.join("macros");
            if macros_path.exists() && macros_path.is_dir() {
                return Ok(macros_path);
            }
            current = dir.parent();
        }
    }

    // 3. Check current working directory and parents
    if let Ok(cwd) = std::env::current_dir() {
        let mut current = Some(cwd.as_path());
        while let Some(dir) = current {
            let macros_path = dir.join("macros");
            if macros_path.exists() && macros_path.is_dir() {
                return Ok(macros_path.to_path_buf());
            }
            current = dir.parent();
        }
    }

    Err("Macros directory not found".to_string())
}

/// List all macro JSON files in the macros directory
#[tauri::command]
fn list_macros() -> Result<Vec<String>, String> {
    let macros_dir = get_macros_dir()?;
    let mut macros = Vec::new();

    let entries = std::fs::read_dir(&macros_dir)
        .map_err(|e| format!("Failed to read macros directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    if let Some(name) = path.file_stem() {
                        macros.push(name.to_string_lossy().to_string());
                    }
                }
            }
        }
    }

    macros.sort();
    Ok(macros)
}

/// Read a macro JSON file by name (without .json extension)
#[tauri::command]
fn read_macro(name: String) -> Result<String, String> {
    // Validate name to prevent path traversal
    if name.contains("..") || name.contains('/') || name.contains('\\') {
        return Err("Invalid macro name".to_string());
    }

    let macros_dir = get_macros_dir()?;
    let macro_path = macros_dir.join(format!("{}.json", name));

    if !macro_path.exists() {
        return Err(format!("Macro '{}' not found", name));
    }

    std::fs::read_to_string(&macro_path)
        .map_err(|e| format!("Failed to read macro: {}", e))
}

/// Load all macros from the macros directory
#[tauri::command]
fn load_all_macros() -> Result<Vec<serde_json::Value>, String> {
    let macros_dir = match get_macros_dir() {
        Ok(dir) => dir,
        Err(_) => return Ok(Vec::new()), // No macros directory, return empty
    };

    let mut macros = Vec::new();

    let entries = match std::fs::read_dir(&macros_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(Vec::new()),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext == "json" {
                    if let Ok(content) = std::fs::read_to_string(&path) {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                            // Only include if it's marked as a macro
                            if json.get("isMacro").and_then(|v| v.as_bool()).unwrap_or(false) {
                                macros.push(json);
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(macros)
}

/// Get the macros directory path (for display in UI)
#[tauri::command]
fn get_macros_directory() -> Result<String, String> {
    let dir = get_macros_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Parse CLI arguments
    let args = CliArgs::parse();

    // Handle headless mode
    if args.headless {
        run_headless(args);
        return;
    }

    // Set tray mode flag
    if args.tray {
        MINIMIZE_TO_TRAY.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    // Run GUI mode
    run_gui(args);
}

/// Run in headless mode (API server only, no GUI)
fn run_headless(args: CliArgs) {
    println!("============================================");
    println!("  Zipp Headless Mode");
    println!("============================================");
    println!();
    println!("  Port: {}", args.port);
    println!("  Host: {}", if args.public { "0.0.0.0" } else { "127.0.0.1" });
    println!("  Auth: {}", if args.api_key.is_some() { "Enabled" } else { "Disabled" });
    println!();

    // Create a tokio runtime for the headless server
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
    rt.block_on(async {
        api_server::run_standalone(api_server::ApiServerConfig {
            enabled: true,
            port: args.port,
            host: if args.public { "0.0.0.0".to_string() } else { "127.0.0.1".to_string() },
            api_key: args.api_key.unwrap_or_default(),
        }).await;
    });
}

/// Run in GUI mode with Tauri
fn run_gui(args: CliArgs) {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_screenshots::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_zipp_database::init())
        .plugin(tauri_plugin_zipp_filesystem::init())
        .plugin(tauri_plugin_zipp_browser::init())
        .plugin(tauri_plugin_zipp_terminal::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            // CLI run mode commands
            get_cli_run_config,
            exit_app,
            write_cli_output,
            http_request,
            // Video processing commands
            get_video_info,
            extract_video_frames,
            extract_video_frames_to_dir,
            extract_video_frames_batch,
            // FFmpeg management commands
            check_ffmpeg_status,
            download_ffmpeg,
            // Image processing commands
            resize_image,
            resize_images_batch,
            // Filesystem utility commands
            get_downloads_path,
            // Cleanup commands
            cleanup_temp_dir,
            // API Server commands
            get_api_config,
            set_api_config,
            get_api_status,
            // Plugin system commands
            get_plugins_dir,
            get_default_plugins_dir,
            get_default_app_data_dir,
            list_plugins,
            read_plugin_manifest,
            read_plugin_nodes,
            read_plugin_bundle,
            create_plugin_scaffold,
            delete_plugin,
            // Bundled plugin commands
            copy_bundled_plugins,
            has_bundled_plugins,
            list_bundled_plugins,
            copy_plugins_to_folder,
            get_bundled_plugins_dir,
            // Plugin source/compilation commands
            read_plugin_source,
            list_plugin_sources,
            write_plugin_bundle,
            plugin_has_sources,
            plugin_needs_rebuild,
            // Install configuration
            get_install_config,
            set_install_config,
            // Audio utilities
            tts::read_audio_base64,
            // Media server
            media_server::get_media_url,
            media_server::get_media_server_port,
            // Services management
            services::list_services,
            services::start_service,
            services::stop_service,
            services::check_service_health,
            services::get_services_status,
            services::get_services_directory,
            services::get_service_output,
            services::clear_service_output,
            services::get_service_port,
            // Package services
            services::start_package_service,
            services::stop_package_services,
            services::get_package_services,
            services::get_service_logs,
            // Service lifecycle management
            services::ensure_service_ready,
            services::ensure_service_ready_by_name,
            services::ensure_service_ready_by_port,
            services::get_lifecycle_config,
            services::set_lifecycle_config,
            // Macro loading
            list_macros,
            read_macro,
            load_all_macros,
            get_macros_directory,
            // Secure secrets storage
            secrets::store_secret,
            secrets::get_secret,
            secrets::delete_secret,
            secrets::get_secrets,
            secrets::store_secrets,
            // Package system
            packages::get_packages_directory,
            packages::list_packages,
            packages::get_package,
            packages::read_package,
            packages::get_package_mtime,
            packages::install_package,
            packages::uninstall_package,
            packages::set_package_trust,
            packages::create_package,
            packages::read_package_flow,
            packages::read_package_flow_content,
            packages::extract_package_service,
            packages::is_package_file,
            packages::scan_directory_for_packages,
            packages::read_package_nodes,
        ])
        .setup(move |app| {
            // Initialize CLI run state (for --run mode)
            let cli_run_state = CliRunState::from_args(&args);
            let is_run_mode = cli_run_state.is_run_mode;
            app.manage(cli_run_state);

            // Initialize Services state
            app.manage(services::ServicesState::default());
            // Initialize Packages state
            app.manage(packages::PackagesState::default());
            // Initialize API Server module
            api_server::init(app.handle().clone());
            // Start media file server for video/audio playback
            media_server::start_media_server();

            // Start service idle monitor in background thread
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                services::run_idle_monitor(app_handle);
            });

            // Hide window if in CLI run mode (headless workflow execution)
            if is_run_mode {
                if let Some(window) = app.get_webview_window("main") {
                    println!("[CLI] Running in hidden window mode");
                    let _ = window.hide();
                }
            }

            // Set up system tray if tray mode is enabled
            if args.tray || MINIMIZE_TO_TRAY.load(std::sync::atomic::Ordering::SeqCst) {
                if let Err(e) = setup_tray(app) {
                    eprintln!("[Tray] Failed to set up system tray: {}", e);
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Handle window close - minimize to tray or clean up
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();

                // Check if we should minimize to tray instead of closing
                if MINIMIZE_TO_TRAY.load(std::sync::atomic::Ordering::SeqCst) {
                    // Hide window to tray instead of closing
                    let _ = window.hide();
                    api.prevent_close();
                    println!("[Tray] Window hidden to system tray");
                    return;
                }

                // Close all WebView sessions managed by the browser plugin
                if let Some(state) = app.try_state::<tauri_plugin_zipp_browser::WebViewState>() {
                    if let Ok(mut sessions) = state.sessions.lock() {
                        let session_ids: Vec<String> = sessions.keys().cloned().collect();
                        for session_id in session_ids {
                            if let Some(session) = sessions.remove(&session_id) {
                                if let Some(wv_window) = app.get_webview_window(&session.window_label) {
                                    let _ = wv_window.close();
                                }
                            }
                        }
                    }
                }

                // Shutdown media server gracefully
                media_server::shutdown_media_server();

                // Stop all running services (Playwright, TTS, etc.) - cross-platform
                if let Some(state) = app.try_state::<services::ServicesState>() {
                    if let Ok(mut running) = state.running.lock() {
                        let service_ids: Vec<String> = running.keys().cloned().collect();
                        for service_id in service_ids {
                            if let Some(mut service) = running.remove(&service_id) {
                                println!("[Services] Stopping service '{}' on app close (PID: {})", service_id, service.process.id());
                                // Kill the process tree (cross-platform)
                                let pid = service.process.id();
                                services::kill_process_tree(pid);
                                // Also try to kill the process directly
                                let _ = service.process.kill();
                            }
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
