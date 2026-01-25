//! Local Media Server
//!
//! Provides a simple HTTP server to serve media files (video, audio) from the output directory.
//! This is necessary because the Tauri asset:// protocol has limited browser support.

use axum::{
    extract::Path,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::net::SocketAddr;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use tokio::fs::File;
use tokio::io::AsyncReadExt;
use tokio::sync::watch;
use tower_http::cors::{Any, CorsLayer};

// Preferred port for media server (will try this first)
const PREFERRED_PORT: u16 = 31338;
// Port range to try if preferred is unavailable
const PORT_RANGE_START: u16 = 31338;
const PORT_RANGE_END: u16 = 31400;

// Global shutdown signal sender
static SHUTDOWN_TX: OnceLock<watch::Sender<bool>> = OnceLock::new();

// The actual port the server is running on
static ACTIVE_PORT: AtomicU16 = AtomicU16::new(0);

/// Find a free port in the given range
fn find_free_port() -> Option<u16> {
    // First try the preferred port
    if std::net::TcpListener::bind(format!("127.0.0.1:{}", PREFERRED_PORT)).is_ok() {
        return Some(PREFERRED_PORT);
    }

    // Try ports in range
    for port in PORT_RANGE_START..=PORT_RANGE_END {
        if port == PREFERRED_PORT {
            continue; // Already tried
        }
        if std::net::TcpListener::bind(format!("127.0.0.1:{}", port)).is_ok() {
            return Some(port);
        }
    }

    // Last resort: let OS assign a port
    if let Ok(listener) = std::net::TcpListener::bind("127.0.0.1:0") {
        if let Ok(addr) = listener.local_addr() {
            return Some(addr.port());
        }
    }

    None
}

/// Get the port the media server is running on
pub fn get_active_port() -> u16 {
    ACTIVE_PORT.load(Ordering::Relaxed)
}

/// Start the media file server on app initialization
pub fn start_media_server() {
    // Create shutdown channel
    let (tx, rx) = watch::channel(false);
    let _ = SHUTDOWN_TX.set(tx);

    tauri::async_runtime::spawn(async move {
        // Find a free port
        let port = match find_free_port() {
            Some(p) => p,
            None => {
                eprintln!("[Media Server] Could not find a free port");
                return;
            }
        };

        // Store the active port
        ACTIVE_PORT.store(port, Ordering::Relaxed);

        let addr: SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();

        let cors = CorsLayer::new()
            .allow_methods([axum::http::Method::GET, axum::http::Method::OPTIONS])
            .allow_headers(Any)
            .allow_origin(Any);

        let router = Router::new()
            .route("/health", get(health_check))
            .route("/media/*path", get(serve_media_file))
            .layer(cors);

        println!("[Media Server] Starting on http://{}", addr);

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[Media Server] Failed to bind to {}: {}", addr, e);
                ACTIVE_PORT.store(0, Ordering::Relaxed);
                return;
            }
        };

        println!("[Media Server] Successfully bound to port {}", port);

        // Use axum::serve with graceful shutdown
        let mut shutdown_rx = rx;
        let server = axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                // Wait for shutdown signal
                while !*shutdown_rx.borrow() {
                    if shutdown_rx.changed().await.is_err() {
                        break;
                    }
                }
                println!("[Media Server] Shutdown signal received");
            });

        if let Err(e) = server.await {
            eprintln!("[Media Server] Server error: {}", e);
        }

        ACTIVE_PORT.store(0, Ordering::Relaxed);
        println!("[Media Server] Server stopped");
    });
}

/// Shutdown the media server gracefully
pub fn shutdown_media_server() {
    if let Some(tx) = SHUTDOWN_TX.get() {
        println!("[Media Server] Sending shutdown signal...");
        let _ = tx.send(true);
    }
}

/// Health check endpoint
async fn health_check() -> &'static str {
    "OK"
}

/// Serve a media file from allowed directories
async fn serve_media_file(Path(path): Path<String>) -> Response {
    println!("[Media Server] Request for path: {}", path);

    // Security: Only allow serving from specific directories
    // The path parameter is the URL path after /media/
    // Format: /media/zipp-output/filename.mp4

    let allowed_paths = get_allowed_base_paths();

    // Parse the path - first segment is the alias, rest is the file path
    let parts: Vec<&str> = path.splitn(2, '/').collect();
    if parts.len() != 2 {
        return (StatusCode::BAD_REQUEST, "Invalid path format").into_response();
    }

    let alias = parts[0];
    let file_name = parts[1];

    // Validate alias and construct full path
    let base_path = match alias {
        "zipp-output" => allowed_paths.zipp_output,
        "pictures" => allowed_paths.pictures,
        "videos" => allowed_paths.videos,
        "downloads" => allowed_paths.downloads,
        _ => return (StatusCode::FORBIDDEN, "Unknown path alias").into_response(),
    };

    let Some(base) = base_path else {
        println!("[Media Server] Base path not available for alias: {}", alias);
        return (StatusCode::NOT_FOUND, "Base path not available").into_response();
    };

    println!("[Media Server] Base path: {:?}, file: {}", base, file_name);

    // Construct full file path and validate it's within the allowed directory
    let full_path = base.join(file_name);

    // Security: Ensure the resolved path is still within the base directory
    // (prevents path traversal attacks like ../../../etc/passwd)
    let canonical_base = match std::fs::canonicalize(&base) {
        Ok(p) => p,
        Err(e) => {
            println!("[Media Server] Failed to canonicalize base: {:?} - {}", base, e);
            return (StatusCode::NOT_FOUND, "Base path not found").into_response();
        }
    };

    let canonical_file = match std::fs::canonicalize(&full_path) {
        Ok(p) => p,
        Err(e) => {
            println!("[Media Server] Failed to canonicalize file: {:?} - {}", full_path, e);
            return (StatusCode::NOT_FOUND, "File not found").into_response();
        }
    };

    if !canonical_file.starts_with(&canonical_base) {
        return (StatusCode::FORBIDDEN, "Access denied").into_response();
    }

    // Determine content type from extension
    let content_type = match full_path.extension().and_then(|e| e.to_str()) {
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("avi") => "video/x-msvideo",
        Some("mkv") => "video/x-matroska",
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("ogg") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("m4a") => "audio/mp4",
        _ => "application/octet-stream",
    };

    // Read and serve the file
    let mut file = match File::open(&full_path).await {
        Ok(f) => f,
        Err(_) => return (StatusCode::NOT_FOUND, "File not found").into_response(),
    };

    let mut contents = Vec::new();
    if let Err(e) = file.read_to_end(&mut contents).await {
        println!("[Media Server] Read error: {}", e);
        return (StatusCode::INTERNAL_SERVER_ERROR, format!("Read error: {}", e)).into_response();
    }

    println!("[Media Server] Serving {} bytes as {}", contents.len(), content_type);

    (
        StatusCode::OK,
        [(header::CONTENT_TYPE, content_type)],
        contents,
    )
        .into_response()
}

struct AllowedPaths {
    zipp_output: Option<std::path::PathBuf>,
    pictures: Option<std::path::PathBuf>,
    videos: Option<std::path::PathBuf>,
    downloads: Option<std::path::PathBuf>,
}

fn get_allowed_base_paths() -> AllowedPaths {
    let zipp_output = dirs::data_dir().map(|d| d.join("zipp").join("output"));
    let pictures = dirs::picture_dir();
    let videos = dirs::video_dir();
    let downloads = dirs::download_dir();

    AllowedPaths {
        zipp_output,
        pictures,
        videos,
        downloads,
    }
}

/// Get the current media server port
#[tauri::command]
pub fn get_media_server_port() -> u16 {
    get_active_port()
}

/// Get the media server URL for a given file path
/// Returns None if the path is not in an allowed directory
#[tauri::command]
pub fn get_media_url(file_path: String) -> Result<String, String> {
    let port = get_active_port();
    if port == 0 {
        return Err("Media server not running".to_string());
    }

    let path = std::path::Path::new(&file_path);

    let allowed = get_allowed_base_paths();

    // Check which allowed directory this path belongs to
    if let Some(ref base) = allowed.zipp_output {
        if let (Ok(canonical_file), Ok(canonical_base)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(base),
        ) {
            if canonical_file.starts_with(&canonical_base) {
                let relative = canonical_file.strip_prefix(&canonical_base)
                    .map_err(|e| e.to_string())?;
                return Ok(format!("http://127.0.0.1:{}/media/zipp-output/{}",
                    port,
                    relative.to_string_lossy().replace('\\', "/")));
            }
        }
    }

    if let Some(ref base) = allowed.pictures {
        if let (Ok(canonical_file), Ok(canonical_base)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(base),
        ) {
            if canonical_file.starts_with(&canonical_base) {
                let relative = canonical_file.strip_prefix(&canonical_base)
                    .map_err(|e| e.to_string())?;
                return Ok(format!("http://127.0.0.1:{}/media/pictures/{}",
                    port,
                    relative.to_string_lossy().replace('\\', "/")));
            }
        }
    }

    if let Some(ref base) = allowed.videos {
        if let (Ok(canonical_file), Ok(canonical_base)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(base),
        ) {
            if canonical_file.starts_with(&canonical_base) {
                let relative = canonical_file.strip_prefix(&canonical_base)
                    .map_err(|e| e.to_string())?;
                return Ok(format!("http://127.0.0.1:{}/media/videos/{}",
                    port,
                    relative.to_string_lossy().replace('\\', "/")));
            }
        }
    }

    if let Some(ref base) = allowed.downloads {
        if let (Ok(canonical_file), Ok(canonical_base)) = (
            std::fs::canonicalize(path),
            std::fs::canonicalize(base),
        ) {
            if canonical_file.starts_with(&canonical_base) {
                let relative = canonical_file.strip_prefix(&canonical_base)
                    .map_err(|e| e.to_string())?;
                return Ok(format!("http://127.0.0.1:{}/media/downloads/{}",
                    port,
                    relative.to_string_lossy().replace('\\', "/")));
            }
        }
    }

    Err("File not in an allowed directory".to_string())
}
