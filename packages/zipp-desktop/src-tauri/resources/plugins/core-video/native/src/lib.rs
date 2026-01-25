//! Zipp Video Module - Native FFmpeg Integration
//!
//! This module provides video processing capabilities using FFmpeg.
//! It can be used as a Tauri plugin or standalone library.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use ffmpeg_sidecar::ffprobe::ffprobe_path;
use tempfile::TempDir;

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
fn validate_path_security(path_str: &str) -> Result<PathBuf, String> {
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
        return Err(format!("File does not exist: {}", path_str));
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

    Ok(canonical)
}

// Windows-specific imports for hiding console window
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Information about an extracted video frame
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameInfo {
    pub index: usize,
    pub timestamp: f64,
    pub path: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}

/// Video metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub duration: f64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub codec: String,
    pub format: String,
}

/// Options for frame extraction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractOptions {
    #[serde(rename = "intervalSeconds")]
    pub interval_seconds: f64,
    #[serde(rename = "startTime")]
    pub start_time: Option<f64>,
    #[serde(rename = "endTime")]
    pub end_time: Option<f64>,
    #[serde(rename = "maxFrames")]
    pub max_frames: Option<usize>,
    #[serde(rename = "outputFormat")]
    pub output_format: String,
    #[serde(rename = "scaleWidth")]
    pub scale_width: Option<u32>,
    #[serde(rename = "scaleHeight")]
    pub scale_height: Option<u32>,
}

/// Result from batch extraction
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatchExtractResult {
    pub frames: Vec<FrameInfo>,
    #[serde(rename = "batchIndex")]
    pub batch_index: usize,
    #[serde(rename = "totalBatches")]
    pub total_batches: usize,
    #[serde(rename = "totalFrames")]
    pub total_frames: usize,
    #[serde(rename = "hasMore")]
    pub has_more: bool,
    #[serde(rename = "nextStartTime")]
    pub next_start_time: f64,
}

/// Ensure FFmpeg is available (download if needed)
pub fn ensure_ffmpeg() -> Result<(), String> {
    if ffmpeg_sidecar::command::ffmpeg_is_installed() {
        return Ok(());
    }

    ffmpeg_sidecar::download::auto_download()
        .map_err(|e| format!("Failed to download FFmpeg: {}. Please install FFmpeg manually.", e))?;

    Ok(())
}

/// Get video metadata using ffprobe
pub fn get_video_info(path: &str) -> Result<VideoInfo, String> {
    ensure_ffmpeg()?;

    // Security: Validate path before proceeding
    let video_path = validate_path_security(path)?;
    let video_path_str = video_path.to_string_lossy();

    let mut cmd = std::process::Command::new(ffprobe_path());
    cmd.args([
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        video_path_str.as_ref(),
    ]);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    let output = cmd.output()
        .map_err(|e| format!("Failed to run ffprobe: {}", e))?;

    if !output.status.success() {
        return Err(format!("ffprobe failed: {}", String::from_utf8_lossy(&output.stderr)));
    }

    let json_str = String::from_utf8_lossy(&output.stdout);
    let json: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse ffprobe output: {}", e))?;

    let streams = json["streams"].as_array()
        .ok_or("No streams found in video")?;

    let video_stream = streams.iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No video stream found")?;

    let width = video_stream["width"].as_u64().unwrap_or(0) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(0) as u32;
    let codec = video_stream["codec_name"].as_str().unwrap_or("unknown").to_string();

    let fps_str = video_stream["r_frame_rate"].as_str().unwrap_or("0/1");
    let fps = if fps_str.contains('/') {
        let parts: Vec<&str> = fps_str.split('/').collect();
        if parts.len() == 2 {
            let num: f64 = parts[0].parse().unwrap_or(0.0);
            let den: f64 = parts[1].parse().unwrap_or(1.0);
            if den > 0.0 { num / den } else { 0.0 }
        } else {
            0.0
        }
    } else {
        fps_str.parse().unwrap_or(0.0)
    };

    let duration = json["format"]["duration"].as_str()
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0);

    let format = json["format"]["format_name"].as_str()
        .unwrap_or("unknown")
        .to_string();

    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
        codec,
        format,
    })
}

/// Build FFmpeg filter string
fn build_filter(interval_seconds: f64, scale_width: Option<u32>, scale_height: Option<u32>) -> String {
    let fps_value = 1.0 / interval_seconds;
    let fps_filter = format!("fps={}", fps_value);

    if let (Some(w), Some(h)) = (scale_width, scale_height) {
        format!("{},scale={}:{}", fps_filter, w, h)
    } else if let Some(w) = scale_width {
        format!("{},scale={}:-1", fps_filter, w)
    } else if let Some(h) = scale_height {
        format!("{},scale=-1:{}", fps_filter, h)
    } else {
        fps_filter
    }
}

/// Extract frames from video file
pub fn extract_frames(path: &str, options: &ExtractOptions) -> Result<Vec<FrameInfo>, String> {
    ensure_ffmpeg()?;

    // Security: Validate path before proceeding
    let video_path = validate_path_security(path)?;
    let video_path_str = video_path.to_string_lossy().to_string();

    let video_info = get_video_info(&video_path_str)?;

    let start_time = options.start_time.unwrap_or(0.0);
    let end_time = if let Some(end) = options.end_time {
        if end > 0.0 { end } else { video_info.duration }
    } else {
        video_info.duration
    };

    if start_time >= end_time {
        return Err("Start time must be less than end time".to_string());
    }

    let temp_dir = TempDir::new()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    let ext = match options.output_format.to_lowercase().as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let output_pattern = temp_path.join(format!("frame_%06d.{}", ext));
    let filter = build_filter(options.interval_seconds, options.scale_width, options.scale_height);

    let mut cmd = FfmpegCommand::new();
    cmd.args(["-ss", &start_time.to_string()])
       .args(["-i", &video_path_str])
       .args(["-t", &(end_time - start_time).to_string()])
       .args(["-vf", &filter])
       .args(["-q:v", "2"])
       .arg(output_pattern.to_string_lossy().as_ref());

    #[cfg(target_os = "windows")]
    cmd.as_inner_mut().creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let events: Vec<FfmpegEvent> = child.iter()
        .map_err(|e| format!("FFmpeg iteration error: {}", e))?
        .collect();

    for event in &events {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            if !msg.contains("deprecated") && !msg.contains("discarding") {
                return Err(format!("FFmpeg error: {}", msg));
            }
        }
    }

    let mut frames: Vec<FrameInfo> = Vec::new();
    let max_frames = options.max_frames.unwrap_or(1000);
    let mime_type = if ext == "png" { "image/png" } else { "image/jpeg" };

    for i in 1..=max_frames {
        let frame_path = temp_path.join(format!("frame_{:06}.{}", i, ext));

        if !frame_path.exists() {
            break;
        }

        let frame_bytes = fs::read(&frame_path)
            .map_err(|e| format!("Failed to read frame {}: {}", i, e))?;

        let data_url = format!("data:{};base64,{}", mime_type, BASE64.encode(&frame_bytes));
        let timestamp = start_time + ((i - 1) as f64 * options.interval_seconds);

        frames.push(FrameInfo {
            index: i - 1,
            timestamp,
            path: frame_path.to_string_lossy().to_string(),
            data_url,
        });
    }

    Ok(frames)
}

/// Extract a single batch of frames from video
pub fn extract_frames_batch(
    path: &str,
    interval_seconds: f64,
    batch_size: usize,
    batch_index: usize,
    output_format: &str,
    scale_width: Option<u32>,
    scale_height: Option<u32>,
) -> Result<BatchExtractResult, String> {
    ensure_ffmpeg()?;

    // Security: Validate path before proceeding
    let video_path = validate_path_security(path)?;
    let video_path_str = video_path.to_string_lossy().to_string();

    let video_info = get_video_info(&video_path_str)?;
    let duration = video_info.duration;

    let total_frames = ((duration / interval_seconds).floor() as usize).max(1);
    let total_batches = (total_frames + batch_size - 1) / batch_size;

    if batch_index >= total_batches {
        return Ok(BatchExtractResult {
            frames: Vec::new(),
            batch_index,
            total_batches,
            total_frames,
            has_more: false,
            next_start_time: duration,
        });
    }

    let start_frame = batch_index * batch_size;
    let start_time = start_frame as f64 * interval_seconds;
    let frames_in_batch = batch_size.min(total_frames - start_frame);
    let batch_duration = frames_in_batch as f64 * interval_seconds;

    let temp_dir = TempDir::new()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    let ext = match output_format.to_lowercase().as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let output_pattern = temp_path.join(format!("frame_%06d.{}", ext));
    let filter = build_filter(interval_seconds, scale_width, scale_height);

    let mut cmd = FfmpegCommand::new();
    cmd.args(["-ss", &start_time.to_string()])
       .args(["-i", &video_path_str])
       .args(["-t", &batch_duration.to_string()])
       .args(["-vf", &filter])
       .args(["-q:v", "2"])
       .arg(output_pattern.to_string_lossy().as_ref());

    #[cfg(target_os = "windows")]
    cmd.as_inner_mut().creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    let events: Vec<FfmpegEvent> = child.iter()
        .map_err(|e| format!("FFmpeg iteration error: {}", e))?
        .collect();

    for event in &events {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            if !msg.contains("deprecated") && !msg.contains("discarding") {
                return Err(format!("FFmpeg error: {}", msg));
            }
        }
    }

    let mut frames: Vec<FrameInfo> = Vec::new();
    let mime_type = if ext == "png" { "image/png" } else { "image/jpeg" };

    for i in 1..=frames_in_batch {
        let frame_path = temp_path.join(format!("frame_{:06}.{}", i, ext));

        if !frame_path.exists() {
            break;
        }

        let frame_bytes = fs::read(&frame_path)
            .map_err(|e| format!("Failed to read frame {}: {}", i, e))?;

        let data_url = format!("data:{};base64,{}", mime_type, BASE64.encode(&frame_bytes));
        let global_index = start_frame + i - 1;
        let timestamp = global_index as f64 * interval_seconds;

        frames.push(FrameInfo {
            index: global_index,
            timestamp,
            path: frame_path.to_string_lossy().to_string(),
            data_url,
        });
    }

    let has_more = batch_index + 1 < total_batches;
    let next_start_time = if has_more {
        (batch_index + 1) as f64 * batch_size as f64 * interval_seconds
    } else {
        duration
    };

    Ok(BatchExtractResult {
        frames,
        batch_index,
        total_batches,
        total_frames,
        has_more,
        next_start_time,
    })
}

// ============================================
// Tauri Plugin Commands
// ============================================

#[tauri::command]
pub async fn video_get_info(path: String) -> Result<VideoInfo, String> {
    get_video_info(&path)
}

#[tauri::command]
pub async fn video_extract_frames(
    path: String,
    options: ExtractOptions,
) -> Result<Vec<FrameInfo>, String> {
    extract_frames(&path, &options)
}

#[tauri::command]
pub async fn video_extract_frames_batch(
    path: String,
    interval_seconds: f64,
    batch_size: usize,
    batch_index: usize,
    output_format: String,
    scale_width: Option<u32>,
    scale_height: Option<u32>,
) -> Result<BatchExtractResult, String> {
    extract_frames_batch(
        &path,
        interval_seconds,
        batch_size,
        batch_index,
        &output_format,
        scale_width,
        scale_height,
    )
}

/// Initialize the video module as a Tauri plugin
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    tauri::plugin::Builder::new("zipp-video")
        .invoke_handler(tauri::generate_handler![
            video_get_info,
            video_extract_frames,
            video_extract_frames_batch,
        ])
        .build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ensure_ffmpeg() {
        // This will download FFmpeg if not present
        assert!(ensure_ffmpeg().is_ok());
    }
}
