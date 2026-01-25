// Secure secrets storage using encrypted file
// Uses base64 encoding with a simple XOR cipher for obfuscation
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

const SECRETS_FILE: &str = "secrets.dat";
const OBFUSCATION_KEY: &[u8] = b"zipp-desktop-secrets-key-2024";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SecretsStore {
    secrets: HashMap<String, String>,
}

/// Get the secrets file path
fn get_secrets_path() -> Result<PathBuf, String> {
    let app_data = dirs::data_dir()
        .ok_or_else(|| "Could not find app data directory".to_string())?;
    let zipp_dir = app_data.join("zipp");

    // Ensure directory exists
    if !zipp_dir.exists() {
        fs::create_dir_all(&zipp_dir)
            .map_err(|e| format!("Failed to create zipp directory: {}", e))?;
    }

    Ok(zipp_dir.join(SECRETS_FILE))
}

/// Simple XOR obfuscation (not cryptographically secure, but prevents casual reading)
fn obfuscate(data: &[u8]) -> Vec<u8> {
    data.iter()
        .enumerate()
        .map(|(i, b)| b ^ OBFUSCATION_KEY[i % OBFUSCATION_KEY.len()])
        .collect()
}

/// Load secrets from file
fn load_secrets() -> Result<SecretsStore, String> {
    let path = get_secrets_path()?;

    if !path.exists() {
        return Ok(SecretsStore::default());
    }

    let encoded = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read secrets file: {}", e))?;

    if encoded.trim().is_empty() {
        return Ok(SecretsStore::default());
    }

    // Decode base64
    let obfuscated = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded.trim())
        .map_err(|e| format!("Failed to decode secrets: {}", e))?;

    // De-obfuscate
    let json_bytes = obfuscate(&obfuscated);

    // Parse JSON
    let store: SecretsStore = serde_json::from_slice(&json_bytes)
        .map_err(|e| format!("Failed to parse secrets: {}", e))?;

    Ok(store)
}

/// Save secrets to file
fn save_secrets(store: &SecretsStore) -> Result<(), String> {
    let path = get_secrets_path()?;

    // Serialize to JSON
    let json = serde_json::to_vec(store)
        .map_err(|e| format!("Failed to serialize secrets: {}", e))?;

    // Obfuscate
    let obfuscated = obfuscate(&json);

    // Encode as base64
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &obfuscated);

    // Write to file
    fs::write(&path, encoded)
        .map_err(|e| format!("Failed to write secrets file: {}", e))?;

    println!("[Secrets] Saved {} secrets to {:?}", store.secrets.len(), path);
    Ok(())
}

/// Store a secret
#[tauri::command]
pub fn store_secret(key: String, value: String) -> Result<(), String> {
    println!("[Secrets] store_secret called for key: {}", key);

    let mut store = load_secrets()?;

    if value.is_empty() {
        store.secrets.remove(&key);
        println!("[Secrets] Removed secret for key: {}", key);
    } else {
        store.secrets.insert(key.clone(), value);
        println!("[Secrets] Stored secret for key: {}", key);
    }

    save_secrets(&store)?;
    Ok(())
}

/// Retrieve a secret
#[tauri::command]
pub fn get_secret(key: String) -> Result<Option<String>, String> {
    let store = load_secrets()?;
    Ok(store.secrets.get(&key).cloned())
}

/// Delete a secret
#[tauri::command]
pub fn delete_secret(key: String) -> Result<(), String> {
    let mut store = load_secrets()?;
    store.secrets.remove(&key);
    save_secrets(&store)?;
    Ok(())
}

/// Get all secrets for a list of keys
#[tauri::command]
pub fn get_secrets(keys: Vec<String>) -> Result<HashMap<String, String>, String> {
    println!("[Secrets] get_secrets called for keys: {:?}", keys);

    let store = load_secrets()?;
    let mut result = HashMap::new();

    for key in keys {
        if let Some(value) = store.secrets.get(&key) {
            println!("[Secrets] Found secret for key: {}", key);
            result.insert(key, value.clone());
        } else {
            println!("[Secrets] No entry for key: {}", key);
        }
    }

    println!("[Secrets] Returning {} secrets", result.len());
    Ok(result)
}

/// Store multiple secrets at once
#[tauri::command]
pub fn store_secrets(secrets: HashMap<String, String>) -> Result<(), String> {
    let mut store = load_secrets()?;

    for (key, value) in secrets {
        if value.is_empty() {
            store.secrets.remove(&key);
        } else {
            store.secrets.insert(key, value);
        }
    }

    save_secrets(&store)?;
    Ok(())
}
