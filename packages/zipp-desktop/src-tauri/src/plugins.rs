use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

// ============================================
// Security Validation
// ============================================

/// Validate a plugin ID to prevent path traversal attacks
/// Plugin IDs must be alphanumeric with hyphens/underscores only
fn validate_plugin_id(plugin_id: &str) -> Result<(), String> {
    if plugin_id.is_empty() {
        return Err("Plugin ID cannot be empty".to_string());
    }

    if plugin_id.len() > 128 {
        return Err("Plugin ID too long (max 128 characters)".to_string());
    }

    // Check for path traversal attempts
    if plugin_id.contains("..") || plugin_id.contains('/') || plugin_id.contains('\\') {
        return Err("Invalid plugin ID: path traversal not allowed".to_string());
    }

    // Check for null bytes
    if plugin_id.contains('\0') {
        return Err("Invalid plugin ID: null bytes not allowed".to_string());
    }

    // Only allow alphanumeric, hyphens, underscores, and dots (for versioning)
    if !plugin_id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.') {
        return Err("Invalid plugin ID: only alphanumeric characters, hyphens, underscores, and dots allowed".to_string());
    }

    // Don't allow starting with a dot (hidden files)
    if plugin_id.starts_with('.') {
        return Err("Invalid plugin ID: cannot start with a dot".to_string());
    }

    Ok(())
}

// ============================================
// Install Configuration
// ============================================

/// Configuration saved during installation
/// The app_data_path is the root folder where all Zipp data is stored.
/// Plugins are in {app_data_path}/plugins
#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstallConfig {
    /// Root app data folder (e.g., C:\Users\User\AppData\Roaming\zipp)
    /// If not set, uses the default: %APPDATA%/zipp (Windows) or ~/.local/share/zipp (Linux)
    pub app_data_path: Option<String>,
    /// Legacy field - for backwards compatibility during migration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plugins_path: Option<String>,
}

/// Get the default app data directory
/// Uses: %APPDATA%/zipp (Windows) or ~/.local/share/zipp (Linux)
fn get_default_app_data_directory() -> Result<PathBuf, String> {
    let data_dir = dirs::data_dir()
        .ok_or_else(|| "Could not determine app data directory".to_string())?;
    Ok(data_dir.join("zipp"))
}

/// Get the path to the install config file
fn get_install_config_path() -> Result<PathBuf, String> {
    let app_data = get_default_app_data_directory()?;
    Ok(app_data.join("install-config.json"))
}

/// Read the install configuration (set by the installer)
/// Handles migration from old pluginsPath to new appDataPath
#[tauri::command]
pub fn get_install_config() -> Result<InstallConfig, String> {
    let config_path = get_install_config_path()?;
    println!("[Plugins] get_install_config called, path: {:?}", config_path);

    if !config_path.exists() {
        println!("[Plugins] Config file does not exist, returning default");
        return Ok(InstallConfig::default());
    }

    let content = fs::read_to_string(&config_path)
        .map_err(|e| format!("Failed to read install config: {}", e))?;

    println!("[Plugins] Read config content: {}", content);

    let mut config: InstallConfig = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse install config: {}", e))?;

    // Migration: If old pluginsPath exists but appDataPath doesn't, derive appDataPath
    if config.app_data_path.is_none() && config.plugins_path.is_some() {
        if let Some(plugins_path) = &config.plugins_path {
            // Check if plugins_path ends with /plugins or \plugins
            let path = PathBuf::from(plugins_path);
            if path.file_name().map(|n| n == "plugins").unwrap_or(false) {
                if let Some(parent) = path.parent() {
                    config.app_data_path = Some(parent.to_string_lossy().to_string());
                    println!("[Plugins] Migrated pluginsPath to appDataPath: {:?}", config.app_data_path);
                }
            } else {
                // pluginsPath wasn't a /plugins subfolder, use it as-is for app_data_path
                config.app_data_path = Some(plugins_path.clone());
                println!("[Plugins] Using pluginsPath as appDataPath: {:?}", config.app_data_path);
            }
        }
    }

    println!("[Plugins] Parsed config: {:?}", config);
    Ok(config)
}

/// Save the install configuration
#[tauri::command]
pub fn set_install_config(config: InstallConfig) -> Result<(), String> {
    let config_path = get_install_config_path()?;
    println!("[Plugins] set_install_config called, path: {:?}", config_path);
    println!("[Plugins] Config to save: {:?}", config);

    // Ensure parent directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    println!("[Plugins] Saving config content: {}", content);

    fs::write(&config_path, content)
        .map_err(|e| format!("Failed to write install config: {}", e))?;

    println!("[Plugins] Config saved successfully");
    Ok(())
}

/// Get the default plugins directory path
/// Uses the app data directory: ~/.local/share/zipp/plugins (Linux)
/// or %APPDATA%/zipp/plugins (Windows)
fn get_default_plugins_directory() -> Result<PathBuf, String> {
    let app_data = get_default_app_data_directory()?;
    Ok(app_data.join("plugins"))
}

/// Resolve the plugins directory - use custom app data path if provided, otherwise default
/// The custom_path can be either an app data path (new style) or a plugins path (legacy)
fn resolve_plugins_directory(custom_path: Option<String>) -> Result<PathBuf, String> {
    let plugins_dir = match custom_path {
        Some(path) if !path.is_empty() => {
            let path_buf = PathBuf::from(&path);
            // Check if the path already ends with "plugins" (legacy compatibility)
            if path_buf.file_name().map(|n| n == "plugins").unwrap_or(false) {
                path_buf
            } else {
                // Treat it as an app data path, append /plugins
                path_buf.join("plugins")
            }
        }
        _ => get_default_plugins_directory()?,
    };

    // Create the directory if it doesn't exist
    if !plugins_dir.exists() {
        fs::create_dir_all(&plugins_dir)
            .map_err(|e| format!("Failed to create plugins directory: {}", e))?;
    }

    Ok(plugins_dir)
}

/// Plugin metadata returned from discovery
#[derive(Debug, Serialize, Deserialize)]
pub struct PluginInfo {
    pub id: String,
    pub path: String,
    pub has_manifest: bool,
    pub has_bundle: bool,
    pub has_nodes: bool,
}

/// Get the default plugins directory path
#[tauri::command]
pub fn get_default_plugins_dir() -> Result<String, String> {
    let dir = get_default_plugins_directory()?;
    Ok(dir.to_string_lossy().to_string())
}

/// Get the default app data directory path
#[tauri::command]
pub fn get_default_app_data_dir() -> Result<String, String> {
    let dir = get_default_app_data_directory()?;
    Ok(dir.to_string_lossy().to_string())
}

/// Get the plugins directory path (uses custom path if provided)
#[tauri::command]
pub fn get_plugins_dir(custom_path: Option<String>) -> Result<String, String> {
    let dir = resolve_plugins_directory(custom_path)?;
    Ok(dir.to_string_lossy().to_string())
}

/// List all plugins in the plugins directory
#[tauri::command]
pub fn list_plugins(custom_path: Option<String>) -> Result<Vec<PluginInfo>, String> {
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let mut plugins = Vec::new();

    // Check if directory exists (it may be empty or not yet created)
    if !plugins_dir.exists() {
        return Ok(plugins);
    }

    // Read the plugins directory
    let entries = fs::read_dir(&plugins_dir)
        .map_err(|e| format!("Failed to read plugins directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process directories
        if !path.is_dir() {
            continue;
        }

        let plugin_id = path.file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        if plugin_id.is_empty() || plugin_id.starts_with('.') {
            continue;
        }

        let manifest_path = path.join("manifest.json");
        let bundle_path = path.join("plugin.bundle.js");
        let nodes_dir = path.join("nodes");

        plugins.push(PluginInfo {
            id: plugin_id,
            path: path.to_string_lossy().to_string(),
            has_manifest: manifest_path.exists(),
            has_bundle: bundle_path.exists(),
            has_nodes: nodes_dir.exists() && nodes_dir.is_dir(),
        });
    }

    Ok(plugins)
}

/// Read a plugin's manifest.json
#[tauri::command]
pub fn read_plugin_manifest(plugin_id: String, custom_path: Option<String>) -> Result<String, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let manifest_path = plugins_dir.join(&plugin_id).join("manifest.json");

    if !manifest_path.exists() {
        return Err(format!("Manifest not found for plugin: {}", plugin_id));
    }

    fs::read_to_string(&manifest_path)
        .map_err(|e| format!("Failed to read manifest: {}", e))
}

/// Read all node definition files for a plugin
#[tauri::command]
pub fn read_plugin_nodes(plugin_id: String, custom_path: Option<String>) -> Result<Vec<String>, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let nodes_dir = plugins_dir.join(&plugin_id).join("nodes");

    if !nodes_dir.exists() {
        return Ok(Vec::new());
    }

    let mut nodes = Vec::new();

    let entries = fs::read_dir(&nodes_dir)
        .map_err(|e| format!("Failed to read nodes directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process JSON files
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }

        let content = fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read node file {:?}: {}", path, e))?;

        nodes.push(content);
    }

    Ok(nodes)
}

/// Read a plugin's bundle.js file
#[tauri::command]
pub fn read_plugin_bundle(plugin_id: String, custom_path: Option<String>) -> Result<String, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let bundle_path = plugins_dir.join(&plugin_id).join("plugin.bundle.js");

    if !bundle_path.exists() {
        return Err(format!("Bundle not found for plugin: {}", plugin_id));
    }

    fs::read_to_string(&bundle_path)
        .map_err(|e| format!("Failed to read bundle: {}", e))
}

/// Create the plugin directory structure for a new plugin
#[tauri::command]
pub fn create_plugin_scaffold(plugin_id: String, custom_path: Option<String>) -> Result<String, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let plugin_path = plugins_dir.join(&plugin_id);

    if plugin_path.exists() {
        return Err(format!("Plugin already exists: {}", plugin_id));
    }

    // Create directories
    fs::create_dir_all(&plugin_path)
        .map_err(|e| format!("Failed to create plugin directory: {}", e))?;

    fs::create_dir_all(plugin_path.join("nodes"))
        .map_err(|e| format!("Failed to create nodes directory: {}", e))?;

    // Create a basic manifest
    let manifest = serde_json::json!({
        "id": plugin_id,
        "name": plugin_id,
        "version": "1.0.0",
        "description": "A custom Zipp plugin",
        "author": "",
        "category": "Custom",
        "nodes": [],
        "ui": {
            "nodes": []
        }
    });

    fs::write(
        plugin_path.join("manifest.json"),
        serde_json::to_string_pretty(&manifest).unwrap()
    ).map_err(|e| format!("Failed to write manifest: {}", e))?;

    Ok(plugin_path.to_string_lossy().to_string())
}

/// Delete a plugin
#[tauri::command]
pub fn delete_plugin(plugin_id: String, custom_path: Option<String>) -> Result<(), String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let plugin_path = plugins_dir.join(&plugin_id);

    if !plugin_path.exists() {
        return Err(format!("Plugin not found: {}", plugin_id));
    }

    // Security: Make sure we're only deleting from the plugins directory
    let canonical_plugins = plugins_dir.canonicalize()
        .map_err(|e| format!("Failed to canonicalize plugins dir: {}", e))?;
    let canonical_plugin = plugin_path.canonicalize()
        .map_err(|e| format!("Failed to canonicalize plugin path: {}", e))?;

    if !canonical_plugin.starts_with(&canonical_plugins) {
        return Err("Security error: Invalid plugin path".to_string());
    }

    fs::remove_dir_all(&plugin_path)
        .map_err(|e| format!("Failed to delete plugin: {}", e))
}

// ============================================
// Bundled Plugin Management
// ============================================

/// Get the bundled plugins directory (from Tauri resources)
fn get_bundled_plugins_directory(app: &AppHandle) -> Result<PathBuf, String> {
    let resource_path = app.path().resource_dir()
        .map_err(|e| format!("Failed to get resource directory: {}", e))?;
    Ok(resource_path.join("plugins"))
}

/// Result of copying bundled plugins
#[derive(Debug, Serialize, Deserialize)]
pub struct CopyPluginsResult {
    pub copied: Vec<String>,
    pub skipped: Vec<String>,
    pub failed: Vec<PluginCopyError>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PluginCopyError {
    pub id: String,
    pub error: String,
}

/// Copy bundled plugins to the user's plugins directory
/// Only copies if the plugin doesn't exist or if force is true
/// Skips copying if the target directory is the same as the bundled directory
#[tauri::command]
pub fn copy_bundled_plugins(app: AppHandle, custom_path: Option<String>, force: bool) -> Result<CopyPluginsResult, String> {
    let bundled_dir = get_bundled_plugins_directory(&app)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;

    let mut result = CopyPluginsResult {
        copied: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };

    // Check if bundled plugins directory exists
    if !bundled_dir.exists() {
        return Ok(result); // No bundled plugins
    }

    // Skip copying if target is the same as bundled (loading directly from install location)
    if let (Ok(bundled_canonical), Ok(plugins_canonical)) = (bundled_dir.canonicalize(), plugins_dir.canonicalize()) {
        if bundled_canonical == plugins_canonical {
            println!("[Plugins] Skipping copy - using bundled plugins directly from install location");
            return Ok(result);
        }
    }

    // Read bundled plugins
    let entries = fs::read_dir(&bundled_dir)
        .map_err(|e| format!("Failed to read bundled plugins directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                result.failed.push(PluginCopyError {
                    id: "unknown".to_string(),
                    error: format!("Failed to read entry: {}", e),
                });
                continue;
            }
        };

        let source_path = entry.path();
        if !source_path.is_dir() {
            continue;
        }

        let plugin_id = match source_path.file_name().and_then(|n| n.to_str()) {
            Some(name) if !name.starts_with('.') => name.to_string(),
            _ => continue,
        };

        let dest_path = plugins_dir.join(&plugin_id);

        // Skip if exists and not forcing
        if dest_path.exists() && !force {
            result.skipped.push(plugin_id);
            continue;
        }

        // Copy the plugin directory
        match copy_directory_recursive(&source_path, &dest_path) {
            Ok(_) => result.copied.push(plugin_id),
            Err(e) => result.failed.push(PluginCopyError {
                id: plugin_id,
                error: e,
            }),
        }
    }

    Ok(result)
}

/// Recursively copy a directory
fn copy_directory_recursive(src: &PathBuf, dest: &PathBuf) -> Result<(), String> {
    // Remove destination if it exists
    if dest.exists() {
        fs::remove_dir_all(dest)
            .map_err(|e| format!("Failed to remove existing directory: {}", e))?;
    }

    // Create destination directory
    fs::create_dir_all(dest)
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    // Copy contents
    let entries = fs::read_dir(src)
        .map_err(|e| format!("Failed to read source directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let src_path = entry.path();
        let dest_path = dest.join(entry.file_name());

        if src_path.is_dir() {
            copy_directory_recursive(&src_path, &dest_path)?;
        } else {
            fs::copy(&src_path, &dest_path)
                .map_err(|e| format!("Failed to copy file {:?}: {}", src_path, e))?;
        }
    }

    Ok(())
}

/// Get the bundled plugins directory path (from Tauri resources)
#[tauri::command]
pub fn get_bundled_plugins_dir(app: AppHandle) -> Result<String, String> {
    let dir = get_bundled_plugins_directory(&app)?;
    dir.to_str()
        .map(|s| s.to_string())
        .ok_or_else(|| "Invalid path encoding".to_string())
}

/// Check if bundled plugins are available
#[tauri::command]
pub fn has_bundled_plugins(app: AppHandle) -> bool {
    match get_bundled_plugins_directory(&app) {
        Ok(dir) => {
            if dir.exists() && dir.is_dir() {
                // Check if there are any plugin directories inside
                if let Ok(entries) = std::fs::read_dir(&dir) {
                    return entries.filter_map(|e| e.ok())
                        .any(|e| e.path().is_dir());
                }
            }
            false
        },
        Err(_) => false,
    }
}

/// List bundled plugins (from resources)
#[tauri::command]
pub fn list_bundled_plugins(app: AppHandle) -> Result<Vec<String>, String> {
    let bundled_dir = get_bundled_plugins_directory(&app)?;

    if !bundled_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&bundled_dir)
        .map_err(|e| format!("Failed to read bundled plugins directory: {}", e))?;

    let mut plugins = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                if !name.starts_with('.') {
                    plugins.push(name.to_string());
                }
            }
        }
    }

    Ok(plugins)
}

// ============================================
// Plugin Source File Access (for runtime compilation)
// ============================================

/// Read a plugin's source file (for runtime compilation)
#[tauri::command]
pub fn read_plugin_source(plugin_id: String, file_path: String, custom_path: Option<String>) -> Result<String, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    // Normalize the file path to use platform-specific separators
    let normalized_path = file_path.replace('/', std::path::MAIN_SEPARATOR_STR);
    let source_path = plugins_dir.join(&plugin_id).join("src").join(&normalized_path);

    if !source_path.exists() {
        return Err(format!("Source file not found: {}", file_path));
    }

    // Security check: ensure we're reading from within the plugin's src directory
    let canonical_src_dir = plugins_dir.join(&plugin_id).join("src").canonicalize()
        .map_err(|_| "Plugin src directory not found".to_string())?;
    let canonical_source = source_path.canonicalize()
        .map_err(|e| format!("Failed to canonicalize source path: {}", e))?;

    if !canonical_source.starts_with(&canonical_src_dir) {
        return Err("Security error: Invalid source path".to_string());
    }

    fs::read_to_string(&source_path)
        .map_err(|e| format!("Failed to read source file: {}", e))
}

/// List source files in a plugin (for runtime compilation)
#[tauri::command]
pub fn list_plugin_sources(plugin_id: String, custom_path: Option<String>) -> Result<Vec<String>, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let src_dir = plugins_dir.join(&plugin_id).join("src");

    if !src_dir.exists() {
        return Ok(Vec::new());
    }

    collect_files_recursive(&src_dir, &src_dir)
}

/// Recursively collect file paths relative to base directory
fn collect_files_recursive(dir: &PathBuf, base: &PathBuf) -> Result<Vec<String>, String> {
    let mut files = Vec::new();

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            files.extend(collect_files_recursive(&path, base)?);
        } else {
            let relative = path.strip_prefix(base)
                .map_err(|_| "Failed to get relative path".to_string())?;
            // Normalize path separators to forward slashes for cross-platform compatibility
            let relative_str = relative.to_string_lossy().replace('\\', "/");
            files.push(relative_str);
        }
    }

    Ok(files)
}

/// Write a plugin's bundle file (after runtime compilation)
#[tauri::command]
pub fn write_plugin_bundle(plugin_id: String, bundle_content: String, custom_path: Option<String>) -> Result<(), String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let bundle_path = plugins_dir.join(&plugin_id).join("plugin.bundle.js");

    // Ensure plugin directory exists
    let plugin_dir = plugins_dir.join(&plugin_id);
    if !plugin_dir.exists() {
        return Err(format!("Plugin directory not found: {}", plugin_id));
    }

    fs::write(&bundle_path, bundle_content)
        .map_err(|e| format!("Failed to write bundle: {}", e))
}

/// Check if a plugin has source files (can be rebuilt)
#[tauri::command]
pub fn plugin_has_sources(plugin_id: String, custom_path: Option<String>) -> Result<bool, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let src_dir = plugins_dir.join(&plugin_id).join("src");

    if !src_dir.exists() {
        return Ok(false);
    }

    // Check if there are any .ts or .tsx files
    let entries = fs::read_dir(&src_dir)
        .map_err(|e| format!("Failed to read src directory: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext == "ts" || ext == "tsx" {
                return Ok(true);
            }
        }
        // Check ui subdirectory
        if path.is_dir() && path.file_name().and_then(|n| n.to_str()) == Some("ui") {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Check if plugin sources are newer than the bundle
/// Returns true if any source file is newer than bundle.js, or if bundle doesn't exist
#[tauri::command]
pub fn plugin_needs_rebuild(plugin_id: String, custom_path: Option<String>) -> Result<bool, String> {
    validate_plugin_id(&plugin_id)?;
    let plugins_dir = resolve_plugins_directory(custom_path)?;
    let plugin_dir = plugins_dir.join(&plugin_id);
    let src_dir = plugin_dir.join("src");
    let bundle_path = plugin_dir.join("bundle.js");

    // If no sources, no rebuild needed
    if !src_dir.exists() {
        return Ok(false);
    }

    // If bundle doesn't exist, needs rebuild
    if !bundle_path.exists() {
        return Ok(true);
    }

    // Get bundle modification time
    let bundle_mtime = bundle_path
        .metadata()
        .and_then(|m| m.modified())
        .map_err(|e| format!("Failed to get bundle mtime: {}", e))?;

    // Recursively check all source files
    fn check_dir_newer(dir: &std::path::Path, bundle_mtime: std::time::SystemTime) -> Result<bool, String> {
        let entries = fs::read_dir(dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                if check_dir_newer(&path, bundle_mtime)? {
                    return Ok(true);
                }
            } else if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if ext == "ts" || ext == "tsx" {
                    if let Ok(metadata) = path.metadata() {
                        if let Ok(mtime) = metadata.modified() {
                            if mtime > bundle_mtime {
                                return Ok(true);
                            }
                        }
                    }
                }
            }
        }
        Ok(false)
    }

    check_dir_newer(&src_dir, bundle_mtime)
}

/// Copy plugins from one folder to another
/// Used when the user changes the plugins directory location
#[tauri::command]
pub fn copy_plugins_to_folder(source_path: String, dest_path: String, force: bool) -> Result<CopyPluginsResult, String> {
    let source_dir = PathBuf::from(&source_path);
    let dest_dir = PathBuf::from(&dest_path);

    let mut result = CopyPluginsResult {
        copied: Vec::new(),
        skipped: Vec::new(),
        failed: Vec::new(),
    };

    // Check if source directory exists
    if !source_dir.exists() {
        return Ok(result); // No source plugins
    }

    // Create destination directory if it doesn't exist
    if !dest_dir.exists() {
        fs::create_dir_all(&dest_dir)
            .map_err(|e| format!("Failed to create destination directory: {}", e))?;
    }

    // Read source plugins
    let entries = fs::read_dir(&source_dir)
        .map_err(|e| format!("Failed to read source plugins directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                result.failed.push(PluginCopyError {
                    id: "unknown".to_string(),
                    error: format!("Failed to read entry: {}", e),
                });
                continue;
            }
        };

        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }

        let plugin_id = match entry_path.file_name().and_then(|n| n.to_str()) {
            Some(name) if !name.starts_with('.') => name.to_string(),
            _ => continue,
        };

        let dest_plugin_path = dest_dir.join(&plugin_id);

        // Skip if exists and not forcing
        if dest_plugin_path.exists() && !force {
            result.skipped.push(plugin_id);
            continue;
        }

        // Copy the plugin directory
        match copy_directory_recursive(&entry_path, &dest_plugin_path) {
            Ok(_) => result.copied.push(plugin_id),
            Err(e) => result.failed.push(PluginCopyError {
                id: plugin_id,
                error: e,
            }),
        }
    }

    Ok(result)
}
