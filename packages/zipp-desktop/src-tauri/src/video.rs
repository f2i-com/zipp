use serde::{Deserialize, Serialize};
use std::fs;
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use ffmpeg_sidecar::command::FfmpegCommand;
use ffmpeg_sidecar::event::{FfmpegEvent, LogLevel};
use ffmpeg_sidecar::ffprobe::ffprobe_path;
use tempfile::TempDir;

// Import path security validation from fs module
use crate::fs::validate_path_security;

// Windows-specific imports for hiding console window
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// Windows CREATE_NO_WINDOW flag
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

/// Result from batch extraction - includes metadata for pagination
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

/// FFmpeg status information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FfmpegStatus {
    pub installed: bool,
    pub version: Option<String>,
}

/// Check if FFmpeg is installed and get version info
#[tauri::command]
pub fn check_ffmpeg_status() -> FfmpegStatus {
    let installed = ffmpeg_sidecar::command::ffmpeg_is_installed();

    let version = if installed {
        // Try to get version
        let mut cmd = std::process::Command::new(ffmpeg_sidecar::paths::ffmpeg_path());
        cmd.arg("-version");

        #[cfg(target_os = "windows")]
        cmd.creation_flags(CREATE_NO_WINDOW);

        cmd.output().ok().and_then(|output| {
            String::from_utf8(output.stdout).ok().and_then(|s| {
                s.lines().next().map(|line| line.to_string())
            })
        })
    } else {
        None
    };

    FfmpegStatus { installed, version }
}

/// Download FFmpeg if not installed
/// This should be called explicitly with UI feedback rather than blocking during workflow
#[tauri::command]
pub fn download_ffmpeg() -> Result<String, String> {
    // Check if already installed
    if ffmpeg_sidecar::command::ffmpeg_is_installed() {
        return Ok("FFmpeg is already installed".to_string());
    }

    // Download FFmpeg
    println!("[Video] Downloading FFmpeg...");
    ffmpeg_sidecar::download::auto_download()
        .map_err(|e| format!("Failed to download FFmpeg: {}. Please install FFmpeg manually.", e))?;

    println!("[Video] FFmpeg download complete");
    Ok("FFmpeg downloaded successfully".to_string())
}

/// Ensure FFmpeg is available (download if needed)
fn ensure_ffmpeg() -> Result<(), String> {
    // Check if FFmpeg is already available
    if ffmpeg_sidecar::command::ffmpeg_is_installed() {
        return Ok(());
    }

    // Try to download FFmpeg
    ffmpeg_sidecar::download::auto_download()
        .map_err(|e| format!("Failed to download FFmpeg: {}. Please install FFmpeg manually.", e))?;

    Ok(())
}

/// Get video metadata using ffprobe
#[tauri::command]
pub async fn get_video_info(path: String) -> Result<VideoInfo, String> {
    ensure_ffmpeg()?;

    // Security: Validate path before proceeding
    let video_path = validate_path_security(&path)?;
    if !video_path.exists() {
        return Err(format!("Video file not found: {}", path));
    }

    // Use ffprobe to get video info
    let mut cmd = std::process::Command::new(ffprobe_path());
    cmd.args([
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        &path,
    ]);

    // Hide console window on Windows
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

    // Find video stream
    let streams = json["streams"].as_array()
        .ok_or("No streams found in video")?;

    let video_stream = streams.iter()
        .find(|s| s["codec_type"].as_str() == Some("video"))
        .ok_or("No video stream found")?;

    // Extract info
    let width = video_stream["width"].as_u64().unwrap_or(0) as u32;
    let height = video_stream["height"].as_u64().unwrap_or(0) as u32;
    let codec = video_stream["codec_name"].as_str().unwrap_or("unknown").to_string();

    // Parse frame rate (can be "30/1" or "29.97")
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

    // Get duration from format
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

/// Extract frames from video file
#[tauri::command]
pub async fn extract_video_frames(
    path: String,
    options: ExtractOptions,
) -> Result<Vec<FrameInfo>, String> {
    ensure_ffmpeg()?;

    // Security: Validate path before proceeding
    let video_path = validate_path_security(&path)?;
    if !video_path.exists() {
        return Err(format!("Video file not found: {}", path));
    }

    // Validate interval to prevent divide by zero
    if options.interval_seconds <= 0.0 {
        return Err("Interval must be greater than 0".to_string());
    }

    // Get video info for duration
    let video_info = get_video_info(path.clone()).await?;

    // Calculate time range
    let start_time = options.start_time.unwrap_or(0.0);
    let end_time = if let Some(end) = options.end_time {
        if end > 0.0 { end } else { video_info.duration }
    } else {
        video_info.duration
    };

    if start_time >= end_time {
        return Err("Start time must be less than end time".to_string());
    }

    // Create temp directory for frames
    let temp_dir = TempDir::new()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.path();

    // Determine output format
    let ext = match options.output_format.to_lowercase().as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let output_pattern = temp_path.join(format!("frame_%06d.{}", ext));

    // Build FFmpeg command
    // Using fps filter to extract frames at interval
    let fps_value = 1.0 / options.interval_seconds;
    let fps_filter = format!("fps={}", fps_value);

    // Add scale filter if requested
    let filter = if let (Some(w), Some(h)) = (options.scale_width, options.scale_height) {
        format!("{},scale={}:{}", fps_filter, w, h)
    } else if let Some(w) = options.scale_width {
        format!("{},scale={}:-1", fps_filter, w)
    } else if let Some(h) = options.scale_height {
        format!("{},scale=-1:{}", fps_filter, h)
    } else {
        fps_filter
    };

    // Build and run FFmpeg command
    let mut cmd = FfmpegCommand::new();
    cmd.args(["-ss", &start_time.to_string()])
       .args(["-i", &path])
       .args(["-t", &(end_time - start_time).to_string()])
       .args(["-vf", &filter])
       .args(["-q:v", "2"]) // High quality for JPEG
       .arg(output_pattern.to_string_lossy().as_ref());

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.as_inner_mut().creation_flags(CREATE_NO_WINDOW);

    // Run FFmpeg
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    // Wait for completion and collect events
    let events: Vec<FfmpegEvent> = child.iter()
        .map_err(|e| format!("FFmpeg iteration error: {}", e))?
        .collect();

    // Check for errors in events
    for event in &events {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            // Ignore some common non-fatal errors
            if !msg.contains("deprecated") && !msg.contains("discarding") {
                return Err(format!("FFmpeg error: {}", msg));
            }
        }
    }

    // Read extracted frames
    let mut frames: Vec<FrameInfo> = Vec::new();
    // Limit max_frames to 10000 to prevent resource exhaustion
    let max_frames = options.max_frames.unwrap_or(1000).min(10000);

    for i in 1..=max_frames {
        let frame_path = temp_path.join(format!("frame_{:06}.{}", i, ext));

        if !frame_path.exists() {
            break; // No more frames
        }

        // Read frame and convert to base64
        let frame_bytes = fs::read(&frame_path)
            .map_err(|e| format!("Failed to read frame {}: {}", i, e))?;

        let mime_type = if ext == "png" { "image/png" } else { "image/jpeg" };
        let data_url = format!("data:{};base64,{}", mime_type, BASE64.encode(&frame_bytes));

        // Calculate timestamp
        let timestamp = start_time + ((i - 1) as f64 * options.interval_seconds);

        frames.push(FrameInfo {
            index: i - 1,
            timestamp,
            path: frame_path.to_string_lossy().to_string(),
            data_url,
        });
    }

    // Temp directory is automatically cleaned up when TempDir goes out of scope
    // But we've already read the frames into memory as base64

    Ok(frames)
}

/// Extract frames returning file references (for large videos)
/// Frames stay on disk, caller is responsible for cleanup
#[tauri::command]
pub async fn extract_video_frames_to_dir(
    path: String,
    options: ExtractOptions,
    output_dir: String,
) -> Result<Vec<FrameInfo>, String> {
    ensure_ffmpeg()?;

    // Security: Validate paths before proceeding
    let video_path = validate_path_security(&path)?;
    if !video_path.exists() {
        return Err(format!("Video file not found: {}", path));
    }

    // Security: Validate output directory path
    let out_path = validate_path_security(&output_dir)?;
    fs::create_dir_all(&out_path)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;

    // Validate interval to prevent divide by zero
    if options.interval_seconds <= 0.0 {
        return Err("Interval must be greater than 0".to_string());
    }

    // Get video info for duration
    let video_info = get_video_info(path.clone()).await?;

    // Calculate time range
    let start_time = options.start_time.unwrap_or(0.0);
    let end_time = if let Some(end) = options.end_time {
        if end > 0.0 { end } else { video_info.duration }
    } else {
        video_info.duration
    };

    // Determine output format
    let ext = match options.output_format.to_lowercase().as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let output_pattern = out_path.join(format!("frame_%06d.{}", ext));

    // Build filter
    let fps_value = 1.0 / options.interval_seconds;
    let fps_filter = format!("fps={}", fps_value);

    let filter = if let (Some(w), Some(h)) = (options.scale_width, options.scale_height) {
        format!("{},scale={}:{}", fps_filter, w, h)
    } else {
        fps_filter
    };

    // Build and run FFmpeg command
    let mut cmd = FfmpegCommand::new();
    cmd.args(["-ss", &start_time.to_string()])
       .args(["-i", &path])
       .args(["-t", &(end_time - start_time).to_string()])
       .args(["-vf", &filter])
       .args(["-q:v", "2"])
       .arg(output_pattern.to_string_lossy().as_ref());

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.as_inner_mut().creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    // Wait for completion
    let _events: Vec<FfmpegEvent> = child.iter()
        .map_err(|e| format!("FFmpeg iteration error: {}", e))?
        .collect();

    // Collect frame info (without loading into memory)
    let mut frames: Vec<FrameInfo> = Vec::new();
    let max_frames = options.max_frames.unwrap_or(1000);

    for i in 1..=max_frames {
        let frame_path = out_path.join(format!("frame_{:06}.{}", i, ext));

        if !frame_path.exists() {
            break;
        }

        let timestamp = start_time + ((i - 1) as f64 * options.interval_seconds);

        frames.push(FrameInfo {
            index: i - 1,
            timestamp,
            path: frame_path.to_string_lossy().to_string(),
            data_url: String::new(), // Empty - files are on disk
        });
    }

    Ok(frames)
}

/// Extract a single batch of frames from video
/// This is memory-efficient for long videos - extract and process in batches
#[tauri::command]
pub async fn extract_video_frames_batch(
    path: String,
    interval_seconds: f64,
    batch_size: usize,
    batch_index: usize,
    output_format: String,
    scale_width: Option<u32>,
    scale_height: Option<u32>,
) -> Result<BatchExtractResult, String> {
    ensure_ffmpeg()?;

    // Validate interval to prevent divide by zero
    if interval_seconds <= 0.0 {
        return Err("Interval must be greater than 0".to_string());
    }

    // Security: Validate path before proceeding
    let video_path = validate_path_security(&path)?;
    if !video_path.exists() {
        return Err(format!("Video file not found: {}", path));
    }

    // Get video info for duration
    let video_info = get_video_info(path.clone()).await?;
    let duration = video_info.duration;

    // Calculate total frames and batches
    let total_frames = ((duration / interval_seconds).floor() as usize).max(1);
    let total_batches = total_frames.div_ceil(batch_size); // Ceiling division

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

    // Calculate time range for this batch
    let start_frame = batch_index * batch_size;
    let start_time = start_frame as f64 * interval_seconds;
    let frames_in_batch = batch_size.min(total_frames - start_frame);
    let batch_duration = frames_in_batch as f64 * interval_seconds;

    // Create temp directory for this batch
    // Use keep() to persist the directory - caller is responsible for cleanup
    // This is necessary because we return file paths that need to remain valid
    let temp_dir = TempDir::new()
        .map_err(|e| format!("Failed to create temp directory: {}", e))?;
    let temp_path = temp_dir.keep();

    // Determine output format
    let ext = match output_format.to_lowercase().as_str() {
        "png" => "png",
        _ => "jpg",
    };

    let output_pattern = temp_path.join(format!("frame_%06d.{}", ext));

    // Build filter
    let fps_value = 1.0 / interval_seconds;
    let fps_filter = format!("fps={}", fps_value);

    let filter = if let (Some(w), Some(h)) = (scale_width, scale_height) {
        format!("{},scale={}:{}", fps_filter, w, h)
    } else if let Some(w) = scale_width {
        format!("{},scale={}:-1", fps_filter, w)
    } else if let Some(h) = scale_height {
        format!("{},scale=-1:{}", fps_filter, h)
    } else {
        fps_filter
    };

    // Build and run FFmpeg command for this batch
    let mut cmd = FfmpegCommand::new();
    cmd.args(["-ss", &start_time.to_string()])
       .args(["-i", &path])
       .args(["-t", &batch_duration.to_string()])
       .args(["-vf", &filter])
       .args(["-q:v", "2"])
       .arg(output_pattern.to_string_lossy().as_ref());

    // Hide console window on Windows
    #[cfg(target_os = "windows")]
    cmd.as_inner_mut().creation_flags(CREATE_NO_WINDOW);

    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn FFmpeg: {}", e))?;

    // Wait for completion
    let events: Vec<FfmpegEvent> = child.iter()
        .map_err(|e| format!("FFmpeg iteration error: {}", e))?
        .collect();

    // Check for errors
    for event in &events {
        if let FfmpegEvent::Log(LogLevel::Error, msg) = event {
            if !msg.contains("deprecated") && !msg.contains("discarding") {
                return Err(format!("FFmpeg error: {}", msg));
            }
        }
    }

    // Read extracted frames for this batch
    let mut frames: Vec<FrameInfo> = Vec::new();
    let mime_type = if ext == "png" { "image/png" } else { "image/jpeg" };

    for i in 1..=frames_in_batch {
        let frame_path = temp_path.join(format!("frame_{:06}.{}", i, ext));

        if !frame_path.exists() {
            break;
        }

        // Read frame and convert to base64
        let frame_bytes = fs::read(&frame_path)
            .map_err(|e| format!("Failed to read frame {}: {}", i, e))?;

        let data_url = format!("data:{};base64,{}", mime_type, BASE64.encode(&frame_bytes));

        // Global index across all batches
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
