//! ZIPP Package System
//!
//! Handles .zipp package files - portable workflow packages that include
//! flows, custom nodes, services, and assets.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use zip::read::ZipArchive;
use zip::write::ZipWriter;
use zip::CompressionMethod;

// =============================================================================
// Types
// =============================================================================

/// Package permission types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PackagePermission {
    Filesystem,
    #[serde(rename = "filesystem:read")]
    FilesystemRead,
    Network,
    Clipboard,
    Notifications,
    Camera,
    Microphone,
}

/// System dependency required by a package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDependency {
    pub name: String,
    pub min_version: Option<String>,
    pub optional: Option<bool>,
    pub install_url: Option<String>,
}

/// Service included in a package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageService {
    pub id: String,
    pub path: String,
    pub name: Option<String>,
    pub auto_start: Option<bool>,
    pub preferred_port: Option<u16>,
    pub env: Option<HashMap<String, String>>,
}

/// Node module included in a package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageNodeModule {
    pub path: String,
    pub overrides_built_in: Option<String>,
}

/// Isolation settings for a package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageIsolation {
    pub sandboxed: bool,
    pub allowed_paths: Option<Vec<String>>,
    pub network_access: Option<bool>,
    pub ipc_allowed: Option<bool>,
}

/// Package dependencies
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PackageDependencies {
    pub zipp_version: Option<String>,
    pub modules: Option<Vec<String>>,
    pub system: Option<Vec<SystemDependency>>,
    pub packages: Option<Vec<PackageDependencyRef>>,
}

/// Reference to another package
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageDependencyRef {
    pub id: String,
    pub version: Option<String>,
}

/// Package manifest (manifest.json)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageManifest {
    pub format_version: String,
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub license: Option<String>,
    pub homepage: Option<String>,
    pub icon: Option<String>,
    pub tags: Option<Vec<String>>,
    pub entry_flow: String,
    pub startup_script: Option<String>,
    pub flows: Vec<String>,
    pub nodes: Option<Vec<PackageNodeModule>>,
    pub services: Option<Vec<PackageService>>,
    pub assets: Option<Vec<String>>,
    pub dependencies: Option<PackageDependencies>,
    pub permissions: Option<Vec<PackagePermission>>,
    pub isolation: Option<PackageIsolation>,
    pub content_hash: Option<String>,
    pub signature: Option<String>,
    /// Embedded macros (self-contained in manifest)
    pub macros: Option<Vec<String>>,
    /// Embedded custom nodes with TypeScript source (compiled on load)
    pub embedded_custom_nodes: Option<Vec<serde_json::Value>>,
    /// Embedded node extensions with TypeScript source (compiled on load)
    pub embedded_node_extensions: Option<Vec<serde_json::Value>>,
}

/// Trust level for installed packages
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackageTrustLevel {
    Untrusted,
    Trusted,
    Verified,
    Blocked,
}

/// Status of an installed package
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum PackageStatus {
    Installed,
    Running,
    Updating,
    Error,
}

/// Information about an installed package
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledPackage {
    pub manifest: PackageManifest,
    pub install_path: String,
    pub source_path: Option<String>,
    pub installed_at: String,
    pub last_run_at: Option<String>,
    pub status: PackageStatus,
    pub trust_level: PackageTrustLevel,
    pub granted_permissions: Vec<PackagePermission>,
    pub running_services: Vec<String>,
    pub error: Option<String>,
}

/// Compact package info for listing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub icon: Option<String>,
    pub install_path: String,
    pub status: PackageStatus,
    pub trust_level: PackageTrustLevel,
}

/// Result of package validation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationResult {
    pub valid: bool,
    pub errors: Vec<ValidationError>,
    pub warnings: Vec<ValidationError>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationError {
    pub path: String,
    pub message: String,
    pub severity: String,
}

/// Global state for package management
#[derive(Default)]
pub struct PackagesState {
    /// Installed packages by ID
    pub installed: Mutex<HashMap<String, InstalledPackage>>,
    /// Currently active package (if running in package mode)
    pub active_package: Mutex<Option<String>>,
}

// =============================================================================
// Constants
// =============================================================================

/// Package file extension
pub const PACKAGE_EXTENSION: &str = ".zipp";

/// Manifest file name within a package
pub const MANIFEST_FILE_NAME: &str = "manifest.json";

/// Directory name for installed packages
pub const PACKAGES_DIR_NAME: &str = "packages";

/// Port range for package services (separate from global services)
pub const PACKAGE_SERVICE_PORT_START: u16 = 8900;
pub const PACKAGE_SERVICE_PORT_END: u16 = 8999;

// =============================================================================
// Helper Functions
// =============================================================================

/// Get the packages directory path
pub fn get_packages_dir() -> Result<PathBuf, String> {
    // Use AppData/Roaming/zipp/packages on Windows
    if let Some(app_data) = dirs::data_dir() {
        let packages_path = app_data.join("zipp").join(PACKAGES_DIR_NAME);
        return Ok(packages_path);
    }
    Err("Could not determine packages directory".to_string())
}

/// Calculate SHA-256 hash of a file
fn hash_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open file: {}", e))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];

    loop {
        let n = reader
            .read(&mut buffer)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }

    Ok(hex::encode(hasher.finalize()))
}

/// Validate a package manifest
fn validate_manifest(manifest: &PackageManifest) -> ValidationResult {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    // Check format version
    if manifest.format_version != "1.0" {
        errors.push(ValidationError {
            path: "formatVersion".to_string(),
            message: format!("Unknown format version: {}", manifest.format_version),
            severity: "error".to_string(),
        });
    }

    // Check required fields
    if manifest.id.is_empty() {
        errors.push(ValidationError {
            path: "id".to_string(),
            message: "Package ID is required".to_string(),
            severity: "error".to_string(),
        });
    }

    if manifest.name.is_empty() {
        errors.push(ValidationError {
            path: "name".to_string(),
            message: "Package name is required".to_string(),
            severity: "error".to_string(),
        });
    }

    if manifest.version.is_empty() {
        errors.push(ValidationError {
            path: "version".to_string(),
            message: "Package version is required".to_string(),
            severity: "error".to_string(),
        });
    }

    if manifest.entry_flow.is_empty() {
        errors.push(ValidationError {
            path: "entryFlow".to_string(),
            message: "Entry flow is required".to_string(),
            severity: "error".to_string(),
        });
    }

    if manifest.flows.is_empty() {
        errors.push(ValidationError {
            path: "flows".to_string(),
            message: "At least one flow is required".to_string(),
            severity: "error".to_string(),
        });
    }

    // Warnings
    if manifest.description.is_none() {
        warnings.push(ValidationError {
            path: "description".to_string(),
            message: "Package should have a description".to_string(),
            severity: "warning".to_string(),
        });
    }

    ValidationResult {
        valid: errors.is_empty(),
        errors,
        warnings,
    }
}

/// Load the package registry from disk
fn load_package_registry() -> HashMap<String, InstalledPackage> {
    let packages_dir = match get_packages_dir() {
        Ok(dir) => dir,
        Err(_) => return HashMap::new(),
    };

    let registry_path = packages_dir.join("registry.json");
    if !registry_path.exists() {
        return HashMap::new();
    }

    match fs::read_to_string(&registry_path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => HashMap::new(),
    }
}

/// Validate that a relative path is safe (no traversal, no absolute paths, no drive letters)
/// Returns Ok(normalized_path) if valid, Err(message) if invalid
fn validate_relative_path(requested: &str) -> Result<String, String> {
    // Reject empty paths
    if requested.is_empty() {
        return Err("Empty path not allowed".to_string());
    }

    // Reject path traversal attempts
    if requested.contains("..") {
        return Err("Path traversal (..) not allowed".to_string());
    }

    // Reject Windows drive letters (e.g., C:, D:)
    if requested.len() >= 2 && requested.chars().nth(1) == Some(':') {
        return Err("Drive letters not allowed".to_string());
    }

    // Reject UNC paths (\\server\share)
    if requested.starts_with("\\\\") || requested.starts_with("//") {
        return Err("UNC paths not allowed".to_string());
    }

    // Reject absolute paths (starting with / or \)
    if requested.starts_with('/') || requested.starts_with('\\') {
        return Err("Absolute paths not allowed".to_string());
    }

    // Normalize path separators to forward slashes
    let normalized = requested.replace('\\', "/");

    // Check for null bytes (path injection)
    if normalized.contains('\0') {
        return Err("Null bytes not allowed in path".to_string());
    }

    Ok(normalized)
}

/// Validate that a path stays within its base directory after joining
/// Used for filesystem operations where we need to ensure no escape
fn validate_path_within_directory(base: &Path, requested: &str) -> Result<PathBuf, String> {
    // First validate the relative path format
    let normalized = validate_relative_path(requested)?;

    // Join with base directory
    let full_path = base.join(&normalized);

    // Canonicalize base path (must exist)
    let canonical_base = fs::canonicalize(base)
        .map_err(|e| format!("Invalid base path: {}", e))?;

    // For the full path, we need to handle the case where it doesn't exist yet
    // First check if it exists, then canonicalize
    if full_path.exists() {
        let canonical_full = fs::canonicalize(&full_path)
            .map_err(|e| format!("Invalid path: {}", e))?;

        // Verify the path is within the base directory
        if !canonical_full.starts_with(&canonical_base) {
            return Err("Path escapes allowed directory".to_string());
        }

        Ok(canonical_full)
    } else {
        // Path doesn't exist - verify parent exists and is within base
        // This handles the case of new files being created
        if let Some(parent) = full_path.parent() {
            if parent.exists() {
                let canonical_parent = fs::canonicalize(parent)
                    .map_err(|e| format!("Invalid parent path: {}", e))?;

                if !canonical_parent.starts_with(&canonical_base) {
                    return Err("Path escapes allowed directory".to_string());
                }
            }
        }

        // Return the non-canonicalized path since the file doesn't exist
        Ok(full_path)
    }
}

/// Save the package registry to disk
fn save_package_registry(registry: &HashMap<String, InstalledPackage>) -> Result<(), String> {
    let packages_dir = get_packages_dir()?;
    fs::create_dir_all(&packages_dir)
        .map_err(|e| format!("Failed to create packages directory: {}", e))?;

    let registry_path = packages_dir.join("registry.json");
    let content = serde_json::to_string_pretty(registry)
        .map_err(|e| format!("Failed to serialize registry: {}", e))?;

    fs::write(&registry_path, content)
        .map_err(|e| format!("Failed to write registry: {}", e))?;

    Ok(())
}

// =============================================================================
// Tauri Commands
// =============================================================================

/// Get the packages directory path
#[tauri::command]
pub fn get_packages_directory() -> Result<String, String> {
    let dir = get_packages_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

/// List all installed packages
#[tauri::command]
pub fn list_packages() -> Result<Vec<PackageInfo>, String> {
    let registry = load_package_registry();

    let packages: Vec<PackageInfo> = registry
        .values()
        .map(|pkg| PackageInfo {
            id: pkg.manifest.id.clone(),
            name: pkg.manifest.name.clone(),
            version: pkg.manifest.version.clone(),
            description: pkg.manifest.description.clone(),
            author: pkg.manifest.author.clone(),
            icon: pkg.manifest.icon.clone(),
            install_path: pkg.install_path.clone(),
            status: pkg.status.clone(),
            trust_level: pkg.trust_level.clone(),
        })
        .collect();

    Ok(packages)
}

/// Get detailed info about a specific package
#[tauri::command]
pub fn get_package(package_id: String) -> Result<InstalledPackage, String> {
    let registry = load_package_registry();
    registry
        .get(&package_id)
        .cloned()
        .ok_or_else(|| format!("Package '{}' not found", package_id))
}

/// Read and validate a package file without installing it
#[tauri::command]
pub fn read_package(package_path: String) -> Result<PackageManifest, String> {
    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    let file = File::open(&path).map_err(|e| format!("Failed to open package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    // Read manifest.json
    let manifest_entry = archive
        .by_name(MANIFEST_FILE_NAME)
        .map_err(|_| "Package does not contain manifest.json")?;

    let manifest: PackageManifest = serde_json::from_reader(manifest_entry)
        .map_err(|e| format!("Failed to parse manifest.json: {}", e))?;

    // Validate manifest
    let validation = validate_manifest(&manifest);
    if !validation.valid {
        let errors: Vec<String> = validation.errors.iter().map(|e| e.message.clone()).collect();
        return Err(format!("Invalid manifest: {}", errors.join(", ")));
    }

    Ok(manifest)
}

/// Get the modification time of a package file (in milliseconds since Unix epoch)
#[tauri::command]
pub fn get_package_mtime(package_path: String) -> Result<u64, String> {
    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    let metadata = fs::metadata(&path).map_err(|e| format!("Failed to get file metadata: {}", e))?;
    let modified = metadata.modified().map_err(|e| format!("Failed to get modification time: {}", e))?;

    // Convert to milliseconds since Unix epoch
    let duration = modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| format!("Invalid modification time: {}", e))?;

    Ok(duration.as_millis() as u64)
}

/// Install a package from a .zipp file
#[tauri::command]
pub async fn install_package(
    package_path: String,
    trust: bool,
) -> Result<InstalledPackage, String> {
    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    // Read and validate manifest
    let manifest = read_package(package_path.clone())?;

    // Get installation directory
    let packages_dir = get_packages_dir()?;
    let install_dir = packages_dir.join(&manifest.id);

    // Check if already installed
    if install_dir.exists() {
        return Err(format!(
            "Package '{}' is already installed. Uninstall first to reinstall.",
            manifest.id
        ));
    }

    // Create installation directory
    fs::create_dir_all(&install_dir)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    // Extract package contents
    let file = File::open(&path).map_err(|e| format!("Failed to open package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {}", e))?;

        let entry_path = match entry.enclosed_name() {
            Some(p) => p.to_owned(),
            None => continue, // Skip invalid paths
        };

        let target_path = install_dir.join(&entry_path);

        if entry.is_dir() {
            fs::create_dir_all(&target_path)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        } else {
            // Ensure parent directory exists
            if let Some(parent) = target_path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Failed to create parent directory: {}", e))?;
            }

            let mut outfile = File::create(&target_path)
                .map_err(|e| format!("Failed to create file: {}", e))?;
            std::io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Failed to extract file: {}", e))?;
        }
    }

    // Calculate content hash
    let content_hash = hash_file(&path)?;

    // Create installed package record
    let installed = InstalledPackage {
        manifest: manifest.clone(),
        install_path: install_dir.to_string_lossy().to_string(),
        source_path: Some(package_path),
        installed_at: chrono::Utc::now().to_rfc3339(),
        last_run_at: None,
        status: PackageStatus::Installed,
        trust_level: if trust {
            PackageTrustLevel::Trusted
        } else {
            PackageTrustLevel::Untrusted
        },
        granted_permissions: if trust {
            manifest.permissions.clone().unwrap_or_default()
        } else {
            Vec::new()
        },
        running_services: Vec::new(),
        error: None,
    };

    // Update registry
    let mut registry = load_package_registry();
    registry.insert(manifest.id.clone(), installed.clone());
    save_package_registry(&registry)?;

    println!(
        "[Packages] Installed package '{}' v{} (hash: {})",
        manifest.name, manifest.version, content_hash
    );

    Ok(installed)
}

/// Uninstall a package
#[tauri::command]
pub async fn uninstall_package(package_id: String) -> Result<(), String> {
    let mut registry = load_package_registry();

    let package = registry
        .get(&package_id)
        .ok_or_else(|| format!("Package '{}' not found", package_id))?;

    // Check if package is running
    if package.status == PackageStatus::Running {
        return Err("Cannot uninstall a running package. Stop it first.".to_string());
    }

    let install_path = PathBuf::from(&package.install_path);

    // Remove installation directory
    if install_path.exists() {
        fs::remove_dir_all(&install_path)
            .map_err(|e| format!("Failed to remove package directory: {}", e))?;
    }

    // Remove from registry
    registry.remove(&package_id);
    save_package_registry(&registry)?;

    println!("[Packages] Uninstalled package '{}'", package_id);

    Ok(())
}

/// Update package trust level
#[tauri::command]
pub fn set_package_trust(
    package_id: String,
    trust_level: PackageTrustLevel,
    granted_permissions: Vec<PackagePermission>,
) -> Result<InstalledPackage, String> {
    let mut registry = load_package_registry();

    let package = registry
        .get_mut(&package_id)
        .ok_or_else(|| format!("Package '{}' not found", package_id))?;

    package.trust_level = trust_level;
    package.granted_permissions = granted_permissions;

    let updated = package.clone();
    save_package_registry(&registry)?;

    Ok(updated)
}

/// Create a .zipp package from components
#[tauri::command]
pub async fn create_package(
    manifest: PackageManifest,
    source_dir: String,
    output_path: String,
) -> Result<String, String> {
    // Validate manifest
    let validation = validate_manifest(&manifest);
    if !validation.valid {
        let errors: Vec<String> = validation.errors.iter().map(|e| e.message.clone()).collect();
        return Err(format!("Invalid manifest: {}", errors.join(", ")));
    }

    let source = PathBuf::from(&source_dir);
    if !source.exists() {
        return Err(format!("Source directory not found: {}", source_dir));
    }

    let output = PathBuf::from(&output_path);

    // Create the zip file
    let file =
        File::create(&output).map_err(|e| format!("Failed to create output file: {}", e))?;
    let mut zip = ZipWriter::new(file);

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o755);

    // Write manifest.json
    let manifest_json = serde_json::to_string_pretty(&manifest)
        .map_err(|e| format!("Failed to serialize manifest: {}", e))?;
    zip.start_file(MANIFEST_FILE_NAME, options)
        .map_err(|e| format!("Failed to add manifest to archive: {}", e))?;
    zip.write_all(manifest_json.as_bytes())
        .map_err(|e| format!("Failed to write manifest: {}", e))?;

    // Add flows
    for flow_path in &manifest.flows {
        let full_path = source.join(flow_path);
        if full_path.exists() {
            let content = fs::read(&full_path)
                .map_err(|e| format!("Failed to read flow '{}': {}", flow_path, e))?;
            zip.start_file(flow_path, options)
                .map_err(|e| format!("Failed to add flow to archive: {}", e))?;
            zip.write_all(&content)
                .map_err(|e| format!("Failed to write flow: {}", e))?;
        }
    }

    // Add services if present
    if let Some(services) = &manifest.services {
        for service in services {
            let service_path = source.join(&service.path);
            if service_path.exists() && service_path.is_dir() {
                add_directory_to_zip(&mut zip, &service_path, &service.path, options)?;
            }
        }
    }

    // Add assets if present
    if let Some(assets) = &manifest.assets {
        for asset_path in assets {
            let full_path = source.join(asset_path);
            if full_path.exists() {
                if full_path.is_dir() {
                    add_directory_to_zip(&mut zip, &full_path, asset_path, options)?;
                } else {
                    let content = fs::read(&full_path)
                        .map_err(|e| format!("Failed to read asset '{}': {}", asset_path, e))?;
                    zip.start_file(asset_path, options)
                        .map_err(|e| format!("Failed to add asset to archive: {}", e))?;
                    zip.write_all(&content)
                        .map_err(|e| format!("Failed to write asset: {}", e))?;
                }
            }
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize archive: {}", e))?;

    // Calculate hash of created package
    let content_hash = hash_file(&output)?;

    println!(
        "[Packages] Created package '{}' v{} at {} (hash: {})",
        manifest.name,
        manifest.version,
        output_path,
        content_hash
    );

    Ok(output.to_string_lossy().to_string())
}

/// Helper to add a directory recursively to a zip archive
fn add_directory_to_zip(
    zip: &mut ZipWriter<File>,
    source_dir: &Path,
    base_path: &str,
    options: zip::write::SimpleFileOptions,
) -> Result<(), String> {
    for entry in fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?
        .flatten()
    {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let archive_path = format!("{}/{}", base_path, name);

        if path.is_dir() {
            add_directory_to_zip(zip, &path, &archive_path, options)?;
        } else {
            let content =
                fs::read(&path).map_err(|e| format!("Failed to read file '{}': {}", name, e))?;
            zip.start_file(&archive_path, options)
                .map_err(|e| format!("Failed to add file to archive: {}", e))?;
            zip.write_all(&content)
                .map_err(|e| format!("Failed to write file: {}", e))?;
        }
    }
    Ok(())
}

/// Read a flow from an installed package
#[tauri::command]
pub fn read_package_flow(package_id: String, flow_path: String) -> Result<String, String> {
    let registry = load_package_registry();
    let package = registry
        .get(&package_id)
        .ok_or_else(|| format!("Package '{}' not found", package_id))?;

    let install_dir = PathBuf::from(&package.install_path);

    // Validate flow path (security: prevent path traversal and escape)
    let full_path = validate_path_within_directory(&install_dir, &flow_path)
        .map_err(|e| format!("Invalid flow path: {}", e))?;

    if !full_path.exists() {
        return Err(format!("Flow '{}' not found in package", flow_path));
    }

    fs::read_to_string(&full_path).map_err(|e| format!("Failed to read flow: {}", e))
}

/// Check if a path is a .zipp package file
#[tauri::command]
pub fn is_package_file(path: String) -> bool {
    path.to_lowercase().ends_with(PACKAGE_EXTENSION)
}

/// Extract a service from a .zipp package to a temp directory
/// Returns the path to the extracted service directory
/// Uses caching: skips extraction if package hasn't changed since last extraction
#[tauri::command]
pub fn extract_package_service(
    package_path: String,
    service_path: String,
    package_id: String,
    service_id: String,
) -> Result<String, String> {
    // Validate service path (security: prevent path traversal, absolute paths, drive letters)
    let normalized_service_path = validate_relative_path(&service_path)
        .map_err(|e| format!("Invalid service path: {}", e))?;

    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    // Get package modification time
    let package_mtime = fs::metadata(&path)
        .and_then(|m| m.modified())
        .map(|t| {
            t.duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0)
        })
        .unwrap_or(0);

    // Create extraction directory in cache (not temp, so it persists between sessions)
    let cache_base = get_packages_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("zipp-package-services"));
    let cache_dir = cache_base
        .join("service-cache")
        .join(&package_id)
        .join(&service_id);

    // Cache marker file stores the mtime of the package when extracted
    let cache_marker = cache_dir.join(".zipp-cache-marker");

    // Check if cache is valid
    let cache_valid = if cache_marker.exists() {
        match fs::read_to_string(&cache_marker) {
            Ok(content) => {
                let cached_mtime: u64 = content.trim().parse().unwrap_or(0);
                cached_mtime == package_mtime
            }
            Err(_) => false,
        }
    } else {
        false
    };

    // If cache is valid, return the cached path
    if cache_valid && cache_dir.exists() {
        println!(
            "[Packages] Using cached extraction for service '{}::{}'",
            package_id, service_id
        );
        return Ok(cache_dir.to_string_lossy().to_string());
    }

    // Clean up existing extraction (cache invalid or doesn't exist)
    if cache_dir.exists() {
        let _ = fs::remove_dir_all(&cache_dir);
    }
    fs::create_dir_all(&cache_dir)
        .map_err(|e| format!("Failed to create cache directory: {}", e))?;

    // Open the package
    let file = File::open(&path).map_err(|e| format!("Failed to open package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    // Build service prefix for matching archive entries
    let service_prefix = if normalized_service_path.ends_with('/') {
        normalized_service_path.clone()
    } else {
        format!("{}/", normalized_service_path)
    };

    // Extract all files from the service directory
    let mut extracted_count = 0;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {}", e))?;

        let entry_name = entry.name().to_string();

        // Check if this entry is within the service directory
        if entry_name.starts_with(&service_prefix) || entry_name == normalized_service_path {
            // Calculate relative path within service directory
            let relative_path = if entry_name.starts_with(&service_prefix) {
                entry_name[service_prefix.len()..].to_string()
            } else {
                String::new()
            };

            if relative_path.is_empty() && entry.is_dir() {
                continue; // Skip the service directory itself
            }

            let target_path = cache_dir.join(&relative_path);

            if entry.is_dir() {
                fs::create_dir_all(&target_path)
                    .map_err(|e| format!("Failed to create directory: {}", e))?;
            } else {
                // Ensure parent directory exists
                if let Some(parent) = target_path.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| format!("Failed to create parent directory: {}", e))?;
                }

                let mut outfile = File::create(&target_path)
                    .map_err(|e| format!("Failed to create file {:?}: {}", target_path, e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("Failed to extract file: {}", e))?;

                extracted_count += 1;
            }
        }
    }

    if extracted_count == 0 {
        return Err(format!(
            "No files found in service path '{}' within package",
            normalized_service_path
        ));
    }

    // Write cache marker with package mtime
    if let Err(e) = fs::write(&cache_marker, package_mtime.to_string()) {
        println!("[Packages] Warning: Failed to write cache marker: {}", e);
    }

    println!(
        "[Packages] Extracted {} files for service '{}::{}' to {:?}",
        extracted_count, package_id, service_id, cache_dir
    );

    Ok(cache_dir.to_string_lossy().to_string())
}

/// Scan a directory for .zipp package files
/// Returns a list of paths to discovered package files
#[tauri::command]
pub fn scan_directory_for_packages(directory_path: String) -> Result<Vec<String>, String> {
    let dir = PathBuf::from(&directory_path);
    if !dir.exists() {
        return Err(format!("Directory not found: {}", directory_path));
    }
    if !dir.is_dir() {
        return Err(format!("Path is not a directory: {}", directory_path));
    }

    let mut packages = Vec::new();

    // Read directory entries
    let entries = fs::read_dir(&dir)
        .map_err(|e| format!("Failed to read directory: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let path = entry.path();

        // Check if it's a .zipp file
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if ext.to_string_lossy().to_lowercase() == "zipp" {
                    packages.push(path.to_string_lossy().to_string());
                }
            }
        }
    }

    println!(
        "[Packages] Found {} packages in {:?}",
        packages.len(),
        dir
    );

    Ok(packages)
}

/// Read a flow directly from a .zipp package file (without installing)
/// Used for previewing/running packages without full installation
#[tauri::command]
pub fn read_package_flow_content(package_path: String, flow_path: String) -> Result<String, String> {
    // Validate flow path (security: prevent path traversal, absolute paths, drive letters)
    let forward_path = validate_relative_path(&flow_path)
        .map_err(|e| format!("Invalid flow path: {}", e))?;

    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    let file = File::open(&path).map_err(|e| format!("Failed to open package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    // Try both forward and backslash path separators for compatibility
    // Standard ZIP uses forward slashes, but Windows PowerShell may create ZIPs with backslashes
    let back_path = forward_path.replace('/', "\\");

    // Try to read the flow file from the archive (try forward slash first, then backslash)
    // First check which path exists, then read it
    let actual_path = if archive.by_name(&forward_path).is_ok() {
        forward_path.clone()
    } else {
        back_path.clone()
    };

    // Re-open archive to get a fresh borrow
    let file = File::open(&path).map_err(|e| format!("Failed to reopen package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    let mut flow_entry = archive
        .by_name(&actual_path)
        .map_err(|_| format!("Flow '{}' not found in package (tried both path formats)", forward_path))?;

    let mut content = String::new();
    flow_entry
        .read_to_string(&mut content)
        .map_err(|e| format!("Failed to read flow content: {}", e))?;

    Ok(content)
}

/// Result of reading package nodes
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageNodesResult {
    /// Module manifest JSON string
    pub manifest: String,
    /// Array of node definition JSON strings
    pub nodes: Vec<String>,
}

/// Read custom node definitions from a .zipp package file
/// Returns the module manifest and all node definitions found in the module directory
#[tauri::command]
pub fn read_package_nodes(
    package_path: String,
    module_path: String,
) -> Result<PackageNodesResult, String> {
    // Validate module path (security: prevent path traversal, absolute paths, drive letters)
    let forward_module_path = validate_relative_path(&module_path)
        .map_err(|e| format!("Invalid module path: {}", e))?;

    let path = PathBuf::from(&package_path);
    if !path.exists() {
        return Err(format!("Package file not found: {}", package_path));
    }

    let file = File::open(&path).map_err(|e| format!("Failed to open package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    // Try both forward and backslash path separators for compatibility
    // Standard ZIP uses forward slashes, but Windows PowerShell may create ZIPs with backslashes
    let back_module_path = forward_module_path.replace('/', "\\");

    let forward_prefix = if forward_module_path.ends_with('/') {
        forward_module_path.clone()
    } else {
        format!("{}/", forward_module_path)
    };
    let back_prefix = if back_module_path.ends_with('\\') {
        back_module_path.clone()
    } else {
        format!("{}\\", back_module_path)
    };

    // Read module.json manifest (try forward slash path first, then backslash)
    let forward_manifest_path = format!("{}module.json", forward_prefix);
    let back_manifest_path = format!("{}module.json", back_prefix);

    // First check which path exists
    let actual_manifest_path = if archive.by_name(&forward_manifest_path).is_ok() {
        forward_manifest_path.clone()
    } else {
        back_manifest_path.clone()
    };

    // Re-open archive to get a fresh borrow
    let file = File::open(&path).map_err(|e| format!("Failed to reopen package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    let manifest = {
        let mut manifest_entry = archive
            .by_name(&actual_manifest_path)
            .map_err(|_| format!("Module manifest not found at '{}' (tried both path formats)", forward_manifest_path))?;
        let mut content = String::new();
        manifest_entry
            .read_to_string(&mut content)
            .map_err(|e| format!("Failed to read module manifest: {}", e))?;
        content
    };

    // Re-open the archive (ZipArchive consumed by by_name)
    let file = File::open(&path).map_err(|e| format!("Failed to reopen package: {}", e))?;
    let mut archive =
        ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

    // Read all node definitions from the nodes/ subdirectory
    // Support both forward and backslash path formats
    let forward_nodes_prefix = format!("{}nodes/", forward_prefix);
    let back_nodes_prefix = format!("{}nodes\\", back_prefix);
    let mut nodes: Vec<String> = Vec::new();

    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("Failed to read archive entry: {}", e))?;

        let entry_name = entry.name().to_string();

        // Check if this is a JSON file in the nodes/ directory (supports both path formats)
        let is_node_file = (entry_name.starts_with(&forward_nodes_prefix) || entry_name.starts_with(&back_nodes_prefix))
            && entry_name.ends_with(".json")
            && !entry.is_dir();

        if is_node_file {
            // Re-open to read the specific file
            let file = File::open(&path).map_err(|e| format!("Failed to reopen package: {}", e))?;
            let mut archive =
                ZipArchive::new(file).map_err(|e| format!("Failed to read package archive: {}", e))?;

            let mut node_entry = archive
                .by_name(&entry_name)
                .map_err(|_| format!("Failed to read node definition: {}", entry_name))?;

            let mut content = String::new();
            node_entry
                .read_to_string(&mut content)
                .map_err(|e| format!("Failed to read node definition: {}", e))?;

            nodes.push(content);
        }
    }

    println!(
        "[Packages] Read {} node definitions from module '{}'",
        nodes.len(),
        module_path
    );

    Ok(PackageNodesResult { manifest, nodes })
}
