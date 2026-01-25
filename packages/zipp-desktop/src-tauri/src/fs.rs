//! Filesystem Security Utilities
//!
//! Provides path security validation for other modules.
//! The actual filesystem commands are now in tauri-plugin-zipp-filesystem.

use std::path::{Path, PathBuf};

/// Strip Windows extended-length path prefix (\\?\) from a path
fn strip_windows_prefix(path: &Path) -> PathBuf {
    let path_str = path.to_string_lossy();
    if let Some(stripped) = path_str.strip_prefix("\\\\?\\") {
        PathBuf::from(stripped)
    } else {
        path.to_path_buf()
    }
}

/// Validate that a path is safe to access using ALLOW-LISTING
/// Only permits access to user directories (Home, Documents, Downloads, Desktop, Pictures, Videos)
/// Returns Ok(canonical_path) or Err with reason
pub fn validate_path_security(path_str: &str) -> Result<PathBuf, String> {
    // Normalize path: strip Windows \\?\ prefix if present
    let normalized_path_str = path_str.strip_prefix("\\\\?\\").unwrap_or(path_str);
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
