//! Zipp Audio Module - Native TTS using Sherpa-ONNX
//!
//! Provides embedded text-to-speech functionality using sherpa-onnx models.
//! No external binaries required - TTS runs directly in the Tauri app.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{command, AppHandle, Runtime};

// Sherpa TTS imports
use sherpa_rs::tts::{OfflineTts, OfflineTtsConfig, OfflineTtsModelConfig, OfflineTtsVitsModelConfig};

/// TTS generation result
#[derive(Debug, Serialize, Deserialize)]
pub struct TtsResult {
    pub audio_path: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
}

/// TTS configuration
#[derive(Debug, Serialize, Deserialize)]
pub struct TtsConfig {
    pub model_path: String,
    pub tokens_path: String,
    pub data_dir: Option<String>,
    pub speaker_id: i32,
    pub speed: f32,
}

/// Global TTS instance (lazy initialized)
static TTS_INSTANCE: Mutex<Option<OfflineTts>> = Mutex::new(None);

/// Initialize TTS with a model
#[command]
pub async fn init_tts<R: Runtime>(
    _app: AppHandle<R>,
    config: TtsConfig,
) -> Result<String, String> {
    let vits_config = OfflineTtsVitsModelConfig::builder()
        .model(config.model_path)
        .tokens(config.tokens_path)
        .build();

    let model_config = OfflineTtsModelConfig::builder()
        .vits(vits_config)
        .build();

    let tts_config = OfflineTtsConfig::builder()
        .model(model_config)
        .build();

    let tts = OfflineTts::new(tts_config)
        .map_err(|e| format!("Failed to initialize TTS: {}", e))?;

    let mut instance = TTS_INSTANCE.lock().map_err(|e| e.to_string())?;
    *instance = Some(tts);

    Ok("TTS initialized successfully".to_string())
}

/// Generate speech from text
#[command]
pub async fn synthesize<R: Runtime>(
    _app: AppHandle<R>,
    text: String,
    output_path: String,
    speaker_id: Option<i32>,
    speed: Option<f32>,
) -> Result<TtsResult, String> {
    let instance = TTS_INSTANCE.lock().map_err(|e| e.to_string())?;
    let tts = instance.as_ref().ok_or("TTS not initialized. Call init_tts first.")?;

    let sid = speaker_id.unwrap_or(0);
    let spd = speed.unwrap_or(1.0);

    // Generate audio
    let audio = tts.generate(&text, sid, spd)
        .map_err(|e| format!("TTS generation failed: {}", e))?;

    // Save to WAV file
    let sample_rate = audio.sample_rate;
    let samples = audio.samples;
    let duration_ms = (samples.len() as u64 * 1000) / sample_rate as u64;

    // Write WAV file
    write_wav(&output_path, &samples, sample_rate)
        .map_err(|e| format!("Failed to write WAV: {}", e))?;

    Ok(TtsResult {
        audio_path: output_path,
        duration_ms,
        sample_rate,
    })
}

/// List available voices/models in the models directory
#[command]
pub async fn list_tts_models<R: Runtime>(
    _app: AppHandle<R>,
    models_dir: String,
) -> Result<Vec<String>, String> {
    let path = PathBuf::from(&models_dir);
    if !path.exists() {
        return Ok(vec![]);
    }

    let mut models = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&path) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            // Look for .onnx model files
            if name.ends_with(".onnx") {
                models.push(name.replace(".onnx", ""));
            }
        }
    }

    Ok(models)
}

/// Write samples to a WAV file
fn write_wav(path: &str, samples: &[f32], sample_rate: u32) -> Result<(), std::io::Error> {
    use std::fs::File;
    use std::io::Write;

    let mut file = File::create(path)?;

    // Convert f32 samples to i16
    let samples_i16: Vec<i16> = samples
        .iter()
        .map(|&s| (s.clamp(-1.0, 1.0) * 32767.0) as i16)
        .collect();

    let data_size = (samples_i16.len() * 2) as u32;
    let file_size = 36 + data_size;

    // WAV header
    file.write_all(b"RIFF")?;
    file.write_all(&file_size.to_le_bytes())?;
    file.write_all(b"WAVE")?;
    file.write_all(b"fmt ")?;
    file.write_all(&16u32.to_le_bytes())?; // fmt chunk size
    file.write_all(&1u16.to_le_bytes())?; // PCM format
    file.write_all(&1u16.to_le_bytes())?; // mono
    file.write_all(&sample_rate.to_le_bytes())?;
    file.write_all(&(sample_rate * 2).to_le_bytes())?; // byte rate
    file.write_all(&2u16.to_le_bytes())?; // block align
    file.write_all(&16u16.to_le_bytes())?; // bits per sample
    file.write_all(b"data")?;
    file.write_all(&data_size.to_le_bytes())?;

    // Write samples
    for sample in samples_i16 {
        file.write_all(&sample.to_le_bytes())?;
    }

    Ok(())
}

/// Plugin commands to expose to Tauri
pub fn commands() -> Vec<tauri::ipc::Invoke<tauri::Wry>> {
    vec![]
}
