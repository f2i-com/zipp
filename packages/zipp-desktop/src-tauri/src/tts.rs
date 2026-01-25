//! Zipp TTS Module - Audio utilities
//!
//! Provides audio file reading utilities. TTS is handled externally via API.

/// Read an audio file and return as base64 data URL for WebView playback
#[tauri::command(rename_all = "camelCase")]
pub async fn read_audio_base64(file_path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use std::fs;
    use std::path::Path;

    println!("[Audio] read_audio_base64 called with path: {}", file_path);

    let path = Path::new(&file_path);
    if !path.exists() {
        return Err(format!("Audio file not found: {}", file_path));
    }

    // Determine MIME type from extension
    let mime_type = match path.extension().and_then(|e| e.to_str()) {
        Some("wav") => "audio/wav",
        Some("mp3") => "audio/mpeg",
        Some("ogg") => "audio/ogg",
        Some("flac") => "audio/flac",
        Some("m4a") => "audio/mp4",
        Some("aac") => "audio/aac",
        _ => "audio/wav",
    };

    // Read file and encode as base64
    let data = fs::read(&file_path)
        .map_err(|e| format!("Failed to read audio file: {}", e))?;

    let base64_data = STANDARD.encode(&data);

    // Return as data URL
    Ok(format!("data:{};base64,{}", mime_type, base64_data))
}
