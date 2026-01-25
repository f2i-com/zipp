//! Zipp Filesystem Module - Native File Operations
//!
//! This module provides filesystem operations for reading, writing, and listing files.
//! Uses an allow-list security model to restrict access to user directories only.

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use tauri::AppHandle;

// ============================================
// Constants
// ============================================

/// Maximum file size to load directly into memory (10MB)
const MAX_IN_MEMORY_SIZE: u64 = 10 * 1024 * 1024;

// ============================================
// Path Security (Allow-list approach)
// ============================================

/// Strip Windows extended-length path prefix (\\?\) from a path
fn strip_windows_prefix(path: &Path) -> PathBuf {
    let path_str = path.to_string_lossy();
    if path_str.starts_with("\\\\?\\") {
        PathBuf::from(&path_str[4..])
    } else {
        path.to_path_buf()
    }
}

/// Validate that a path is safe to access using ALLOW-LISTING
/// Only permits access to user directories (Home, Documents, Downloads, Desktop, Pictures, Videos)
pub fn validate_path_security(path_str: &str) -> Result<PathBuf, String> {
    // Normalize path: strip Windows \\?\ prefix if present
    let normalized_path_str = if path_str.starts_with("\\\\?\\") {
        &path_str[4..]
    } else {
        path_str
    };
    let path = Path::new(normalized_path_str);

    // 1. Reject paths containing traversal sequences
    if path.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return Err("Path traversal (..) is not allowed for security reasons".to_string());
    }

    // 2. Canonicalize to resolve symlinks and normalize the path
    let canonical = if path.exists() {
        let canon = path.canonicalize()
            .map_err(|e| format!("Invalid path: {}", e))?;
        strip_windows_prefix(&canon)
    } else {
        // For new files, check the parent directory
        if let Some(parent) = path.parent() {
            if parent.as_os_str().is_empty() {
                std::env::current_dir()
                    .map_err(|e| format!("Cannot get current directory: {}", e))?
                    .join(path)
            } else if parent.exists() {
                let canonical_parent = parent.canonicalize()
                    .map_err(|e| format!("Invalid parent path: {}", e))?;
                let canonical_parent = strip_windows_prefix(&canonical_parent);
                canonical_parent.join(path.file_name().unwrap_or_default())
            } else {
                return Err(format!("Parent directory does not exist: {:?}", parent));
            }
        } else {
            path.to_path_buf()
        }
    };

    // 3. ALLOW-LISTING: Only allow specific user directories
    let allowed_prefixes: Vec<PathBuf> = [
        dirs::home_dir(),
        dirs::document_dir(),
        dirs::download_dir(),
        dirs::desktop_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
        dirs::audio_dir(),
        dirs::data_dir(),
        dirs::data_local_dir(),
        dirs::cache_dir(),
        Some(std::env::temp_dir()),
    ]
    .into_iter()
    .flatten()
    .collect();

    let is_allowed = allowed_prefixes.iter().any(|prefix| {
        canonical.starts_with(prefix)
    });

    if !is_allowed {
        return Err(format!(
            "Security restriction: Access denied to '{}'. \
            You can only access files in your Home, Documents, Downloads, Desktop, Pictures, Videos, or app data folders.",
            canonical.display()
        ));
    }

    // 4. Block known sensitive files even within allowed directories
    let file_name = canonical.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();

    let sensitive_files = [
        ".ssh", "id_rsa", "id_ed25519", ".gnupg", ".aws", ".azure",
        "credentials", ".netrc", ".npmrc", ".pypirc",
    ];

    for sensitive in sensitive_files {
        if file_name.contains(sensitive) {
            return Err(format!(
                "Security restriction: Access to sensitive file/directory '{}' is not allowed",
                file_name
            ));
        }
    }

    Ok(canonical)
}

// ============================================
// Types (matching runtime.ts expectations)
// ============================================

/// File information returned from folder scanning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    pub path: String,
    pub name: String,
    pub name_without_ext: String,
    pub ext: String,
    pub size: u64,
    pub modified_at: String,
    pub is_directory: bool,
}

/// Result from reading a file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub size: u64,
    pub path: String,
    pub name: String,
    pub name_without_ext: String,
    pub ext: String,
    #[serde(default)]
    pub is_large_file: bool,
}

/// Chunk reference for streaming large files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkRef {
    pub path: String,
    pub start: u64,
    pub length: u64,
    pub index: usize,
    pub total: usize,
    #[serde(rename = "__type")]
    pub ref_type: String,
}

/// Filter for file picker dialog
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileFilter {
    pub name: String,
    pub extensions: Vec<String>,
}

// ============================================
// Helper Functions
// ============================================

/// Check if a filename matches a glob pattern
fn matches_pattern(name: &str, pattern: &str) -> bool {
    let pattern = pattern.to_lowercase();
    let name = name.to_lowercase();

    if pattern == "*" || pattern == "*.*" {
        return true;
    }

    if pattern.starts_with("*.") {
        let ext = &pattern[1..];
        return name.ends_with(&ext);
    }

    if pattern.starts_with('*') && pattern.ends_with('*') && pattern.len() > 2 {
        let middle = &pattern[1..pattern.len()-1];
        return name.contains(middle);
    }

    if pattern.ends_with('*') {
        let prefix = &pattern[..pattern.len()-1];
        return name.starts_with(prefix);
    }

    if pattern.starts_with('*') {
        let suffix = &pattern[1..];
        return name.ends_with(suffix);
    }

    name == pattern
}

/// Check if a file matches the include/exclude patterns
fn matches_filters(name: &str, include: &[String], exclude: &[String]) -> bool {
    let included = if include.is_empty() {
        true
    } else {
        include.iter().any(|p| matches_pattern(name, p))
    };

    let excluded = exclude.iter().any(|p| matches_pattern(name, p));
    included && !excluded
}

/// Get file info from a path
fn get_file_info(path: &Path) -> Result<FileInfo, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata for {:?}: {}", path, e))?;

    let name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();

    let ext = path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e))
        .unwrap_or_default();

    let name_without_ext = path.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();

    let modified_at = metadata.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| {
            let secs = d.as_secs();
            let datetime = chrono::DateTime::from_timestamp(secs as i64, 0)
                .unwrap_or_default();
            datetime.format("%Y-%m-%dT%H:%M:%SZ").to_string()
        })
        .unwrap_or_default();

    Ok(FileInfo {
        path: path.to_string_lossy().to_string(),
        name,
        name_without_ext,
        ext,
        size: metadata.len(),
        modified_at,
        is_directory: metadata.is_dir(),
    })
}

/// Recursively collect files from a directory
fn collect_files(
    dir: &Path,
    recursive: bool,
    include: &[String],
    exclude: &[String],
    max_files: usize,
    results: &mut Vec<FileInfo>,
) -> Result<(), String> {
    if results.len() >= max_files {
        return Ok(());
    }

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory {:?}: {}", dir, e))?;

    for entry in entries {
        if results.len() >= max_files {
            break;
        }

        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if recursive {
                collect_files(&path, recursive, include, exclude, max_files, results)?;
            }
        } else if path.is_file() {
            let name = path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");

            if matches_filters(name, include, exclude) {
                if let Ok(info) = get_file_info(&path) {
                    results.push(info);
                }
            }
        }
    }

    Ok(())
}

// ============================================
// Tauri Plugin Commands
// ============================================

mod commands {
    use super::*;

    /// List files in a folder with filtering options
    #[tauri::command]
    pub async fn list_folder(
        path: String,
        recursive: bool,
        include_patterns: Vec<String>,
        exclude_patterns: Vec<String>,
        max_files: usize,
    ) -> Result<Vec<FileInfo>, String> {
        let dir = validate_path_security(&path)?;

        if !dir.exists() {
            return Err(format!("Directory does not exist: {}", path));
        }

        if !dir.is_dir() {
            return Err(format!("Path is not a directory: {}", path));
        }

        let max = if max_files == 0 { 10000 } else { max_files.min(10000) };
        let mut results = Vec::new();

        collect_files(
            &dir,
            recursive,
            &include_patterns,
            &exclude_patterns,
            max,
            &mut results,
        )?;

        results.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(results)
    }

    /// Read a file's contents
    #[tauri::command]
    pub async fn read_file(path: String, read_as: String) -> Result<FileContent, String> {
        let file_path = validate_path_security(&path)?;

        if !file_path.exists() {
            return Err(format!("File does not exist: {}", path));
        }

        if !file_path.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }

        let metadata = fs::metadata(&file_path)
            .map_err(|e| format!("Failed to read file metadata: {}", e))?;

        let name = file_path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let ext = file_path.extension()
            .and_then(|e| e.to_str())
            .map(|e| format!(".{}", e))
            .unwrap_or_default();

        let name_without_ext = file_path.file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let size = metadata.len();

        // SAFETY VALVE: If file exceeds threshold, return reference only
        if size > MAX_IN_MEMORY_SIZE {
            return Ok(FileContent {
                content: "__FILE_REF__".to_string(),
                size,
                path,
                name,
                name_without_ext,
                ext,
                is_large_file: true,
            });
        }

        let content = match read_as.as_str() {
            "text" | "utf8" => {
                fs::read_to_string(&file_path)
                    .map_err(|e| format!("Failed to read file as text: {}", e))?
            },
            "base64" => {
                let bytes = fs::read(&file_path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;

                let mime = match ext.to_lowercase().as_str() {
                    ".png" => "image/png",
                    ".jpg" | ".jpeg" => "image/jpeg",
                    ".gif" => "image/gif",
                    ".webp" => "image/webp",
                    ".svg" => "image/svg+xml",
                    ".pdf" => "application/pdf",
                    ".json" => "application/json",
                    ".txt" => "text/plain",
                    ".html" | ".htm" => "text/html",
                    ".css" => "text/css",
                    ".js" => "application/javascript",
                    _ => "application/octet-stream",
                };

                format!("data:{};base64,{}", mime, BASE64.encode(&bytes))
            },
            "binary" | _ => {
                let bytes = fs::read(&file_path)
                    .map_err(|e| format!("Failed to read file: {}", e))?;
                BASE64.encode(&bytes)
            },
        };

        Ok(FileContent {
            content,
            size,
            path,
            name,
            name_without_ext,
            ext,
            is_large_file: false,
        })
    }

    /// Write content to a file
    #[tauri::command]
    pub async fn write_file(
        path: String,
        content: String,
        content_type: String,
        create_dirs: bool,
    ) -> Result<String, String> {
        let file_path = validate_path_security(&path)?;

        if create_dirs {
            if let Some(parent) = file_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directories: {}", e))?;
            }
        }

        match content_type.as_str() {
            "base64" => {
                let base64_content = if content.contains(",") {
                    content.split(',').last().unwrap_or(&content)
                } else {
                    &content
                };

                let bytes = BASE64.decode(base64_content)
                    .map_err(|e| format!("Failed to decode base64: {}", e))?;

                fs::write(&file_path, bytes)
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            },
            "text" | _ => {
                fs::write(&file_path, content.as_bytes())
                    .map_err(|e| format!("Failed to write file: {}", e))?;
            },
        }

        Ok(path)
    }

    /// Open a folder picker dialog
    #[tauri::command]
    pub async fn pick_folder<R: tauri::Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
        use tauri_plugin_dialog::DialogExt;
        use std::sync::mpsc;

        let (tx, rx) = mpsc::channel();

        app.dialog()
            .file()
            .set_title("Select Folder")
            .pick_folder(move |folder_path| {
                let path_str = folder_path.map(|fp| fp.to_string());
                let _ = tx.send(path_str);
            });

        match rx.recv() {
            Ok(Some(path)) => Ok(Some(path)),
            Ok(None) => Ok(None),
            Err(_) => Err("Dialog was cancelled or failed".to_string()),
        }
    }

    /// Open a file picker dialog
    #[tauri::command]
    pub async fn pick_file<R: tauri::Runtime>(app: AppHandle<R>, filters: Option<Vec<FileFilter>>) -> Result<Option<String>, String> {
        use tauri_plugin_dialog::DialogExt;
        use std::sync::mpsc;

        let (tx, rx) = mpsc::channel();

        let mut dialog = app.dialog()
            .file()
            .set_title("Select File");

        if let Some(filter_list) = filters {
            for filter in filter_list {
                let exts: Vec<&str> = filter.extensions.iter().map(|s| s.as_str()).collect();
                dialog = dialog.add_filter(&filter.name, &exts);
            }
        }

        dialog.pick_file(move |file_path| {
            let path_str = file_path.map(|fp| fp.to_string());
            let _ = tx.send(path_str);
        });

        match rx.recv() {
            Ok(Some(path)) => Ok(Some(path)),
            Ok(None) => Ok(None),
            Err(_) => Err("Dialog was cancelled or failed".to_string()),
        }
    }

    /// Native file copy - handles large files without JS memory overhead
    #[tauri::command]
    pub async fn native_copy_file(source: String, destination: String, create_dirs: bool) -> Result<u64, String> {
        let source_path = validate_path_security(&source)?;
        let dest_path = validate_path_security(&destination)?;

        if !source_path.exists() {
            return Err(format!("Source file not found: {}", source));
        }

        if !source_path.is_file() {
            return Err(format!("Source is not a file: {}", source));
        }

        if create_dirs {
            if let Some(parent) = dest_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create directories: {}", e))?;
            }
        }

        let bytes_copied = fs::copy(&source_path, &dest_path)
            .map_err(|e| format!("Native copy failed: {}", e))?;

        Ok(bytes_copied)
    }

    /// Calculate chunk boundaries for a file
    #[tauri::command]
    pub async fn calculate_file_chunks(
        path: String,
        chunk_size: usize,
        overlap: usize,
    ) -> Result<Vec<ChunkRef>, String> {
        let file_path = validate_path_security(&path)?;

        if !file_path.exists() {
            return Err(format!("File not found: {}", path));
        }

        if !file_path.is_file() {
            return Err(format!("Path is not a file: {}", path));
        }

        let metadata = fs::metadata(&file_path)
            .map_err(|e| format!("Failed to read metadata: {}", e))?;

        let file_size = metadata.len();
        let safe_chunk_size = chunk_size.max(100) as u64;
        let safe_overlap = (overlap as u64).min(safe_chunk_size.saturating_sub(10));
        let step = safe_chunk_size.saturating_sub(safe_overlap);

        if step == 0 {
            return Err("Invalid chunk configuration: step size is zero".to_string());
        }

        let mut chunks = Vec::new();
        let mut cursor = 0u64;
        let mut index = 0usize;

        while cursor < file_size {
            let len = (file_size - cursor).min(safe_chunk_size);

            chunks.push(ChunkRef {
                path: path.clone(),
                start: cursor,
                length: len,
                index,
                total: 0,
                ref_type: "chunk_ref".to_string(),
            });

            if cursor + len >= file_size {
                break;
            }

            cursor += step;
            index += 1;
        }

        let total = chunks.len();
        for chunk in &mut chunks {
            chunk.total = total;
        }

        Ok(chunks)
    }

    /// Read a specific chunk from file
    #[tauri::command]
    pub async fn read_chunk_content(path: String, start: u64, length: u64, read_as: Option<String>) -> Result<String, String> {
        // Limit chunk size to 50MB to prevent DoS via memory exhaustion
        const MAX_CHUNK_SIZE: u64 = 50 * 1024 * 1024;
        if length > MAX_CHUNK_SIZE {
            return Err(format!("Chunk size {} exceeds maximum allowed size of {} bytes", length, MAX_CHUNK_SIZE));
        }

        let validated_path = validate_path_security(&path)?;

        let file = std::fs::File::open(&validated_path)
            .map_err(|e| format!("Failed to open file: {}", e))?;

        let mut reader = BufReader::new(file);

        reader.seek(SeekFrom::Start(start))
            .map_err(|e| format!("Failed to seek to position {}: {}", start, e))?;

        let mut buffer = vec![0u8; length as usize];
        let bytes_read = reader.read(&mut buffer)
            .map_err(|e| format!("Failed to read chunk: {}", e))?;

        buffer.truncate(bytes_read);

        let read_mode = read_as.unwrap_or_else(|| "text".to_string());
        let content = match read_mode.as_str() {
            "base64" | "binary" => BASE64.encode(&buffer),
            _ => String::from_utf8_lossy(&buffer).to_string(),
        };

        Ok(content)
    }

    /// Get the user's Downloads directory path
    #[tauri::command]
    pub fn get_downloads_path() -> Result<String, String> {
        dirs::download_dir()
            .map(|p| p.to_string_lossy().to_string())
            .ok_or_else(|| "Could not determine Downloads directory".to_string())
    }

    /// Get the app data directory path (e.g., %APPDATA%/zipp on Windows)
    #[tauri::command]
    pub fn get_app_data_dir() -> Result<String, String> {
        dirs::data_dir()
            .map(|p| p.join("zipp").to_string_lossy().to_string())
            .ok_or_else(|| "Could not determine app data directory".to_string())
    }

    /// Get the temp directory path
    #[tauri::command]
    pub fn get_temp_dir() -> Result<String, String> {
        Ok(std::env::temp_dir().to_string_lossy().to_string())
    }

    /// Result from running a command
    #[derive(Debug, Clone, Serialize, Deserialize)]
    pub struct CommandResult {
        pub code: i32,
        pub stdout: String,
        pub stderr: String,
    }

    /// Run an external command (only whitelisted commands allowed)
    #[tauri::command]
    pub async fn run_command(
        command: String,
        args: Vec<String>,
        cwd: Option<String>,
    ) -> Result<CommandResult, String> {
        // Security: Only allow whitelisted commands
        let allowed_commands = ["ffmpeg", "ffprobe"];
        let cmd_name = std::path::Path::new(&command)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or(&command);
        
        if !allowed_commands.contains(&cmd_name) {
            return Err(format!(
                "Command '{}' is not allowed. Only {:?} are permitted.",
                command, allowed_commands
            ));
        }

        // Build the command
        let mut cmd = std::process::Command::new(&command);
        cmd.args(&args);
        
        if let Some(dir) = cwd {
            cmd.current_dir(dir);
        }

        // Execute and capture output
        let output = cmd.output().map_err(|e| format!("Failed to execute command: {}", e))?;

        Ok(CommandResult {
            code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        })
    }
}

/// Initialize the filesystem module as a Tauri plugin
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("zipp-filesystem")
        .invoke_handler(tauri::generate_handler![
            commands::list_folder,
            commands::read_file,
            commands::write_file,
            commands::pick_folder,
            commands::pick_file,
            commands::native_copy_file,
            commands::calculate_file_chunks,
            commands::read_chunk_content,
            commands::get_downloads_path,
            commands::get_app_data_dir,
            commands::get_temp_dir,
            commands::run_command,
        ])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_path_security() {
        // Home directory should be allowed
        if let Some(home) = dirs::home_dir() {
            let test_path = home.join("test.txt");
            let result = validate_path_security(test_path.to_str().unwrap());
            assert!(result.is_ok());
        }
    }

    #[test]
    fn test_matches_pattern() {
        assert!(matches_pattern("test.txt", "*.txt"));
        assert!(matches_pattern("test.txt", "*"));
        assert!(!matches_pattern("test.txt", "*.json"));
    }
}
