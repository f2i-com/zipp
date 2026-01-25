// Image processing utilities for Zipp
// Moves heavy image operations to Rust backend to prevent UI thread blocking

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use image::{DynamicImage, imageops::FilterType};
use std::io::Cursor;

/// Maximum dimension for resized images (longest side)
const MAX_IMAGE_DIMENSION: u32 = 1024;

/// Maximum file size in KB for output images
const MAX_IMAGE_SIZE_KB: usize = 500;

/// Result from image resize operation
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageResizeResult {
    pub success: bool,
    pub data_url: Option<String>,
    pub original_width: u32,
    pub original_height: u32,
    pub new_width: u32,
    pub new_height: u32,
    pub original_size_kb: usize,
    pub new_size_kb: usize,
    pub error: Option<String>,
}

/// Resize an image to fit within MAX_IMAGE_DIMENSION while preserving aspect ratio
/// Converts to JPEG for smaller file size
/// Input: base64 data URL (data:image/xxx;base64,...)
/// Output: resized base64 data URL
#[tauri::command]
pub async fn resize_image(data_url: String) -> Result<ImageResizeResult, String> {
    // Parse data URL to extract format and base64 content
    if !data_url.starts_with("data:image") {
        return Ok(ImageResizeResult {
            success: false,
            data_url: Some(data_url),
            original_width: 0,
            original_height: 0,
            new_width: 0,
            new_height: 0,
            original_size_kb: 0,
            new_size_kb: 0,
            error: Some("Input is not an image data URL".to_string()),
        });
    }

    // Extract base64 content after the comma
    let parts: Vec<&str> = data_url.splitn(2, ',').collect();
    if parts.len() != 2 {
        return Err("Invalid data URL format".to_string());
    }

    let base64_data = parts[1];
    let original_size_kb = base64_data.len() / 1024;

    // Decode base64 to bytes
    let image_bytes = BASE64.decode(base64_data)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Load image using the image crate
    let img = image::load_from_memory(&image_bytes)
        .map_err(|e| format!("Failed to load image: {}", e))?;

    let original_width = img.width();
    let original_height = img.height();

    // Check if resize is needed
    let dimensions_ok = original_width <= MAX_IMAGE_DIMENSION && original_height <= MAX_IMAGE_DIMENSION;
    let size_ok = original_size_kb <= MAX_IMAGE_SIZE_KB;
    let is_png = data_url.starts_with("data:image/png");

    // Skip resize if within limits and not PNG (PNG should be converted to JPEG for size)
    if dimensions_ok && size_ok && !is_png {
        return Ok(ImageResizeResult {
            success: true,
            data_url: Some(data_url),
            original_width,
            original_height,
            new_width: original_width,
            new_height: original_height,
            original_size_kb,
            new_size_kb: original_size_kb,
            error: None,
        });
    }

    // Calculate new dimensions preserving aspect ratio
    let (new_width, new_height) = if original_width > original_height {
        // Landscape - limit width
        let new_w = std::cmp::min(original_width, MAX_IMAGE_DIMENSION);
        let new_h = (original_height as f64 * new_w as f64 / original_width as f64) as u32;
        (new_w, new_h)
    } else {
        // Portrait or square - limit height
        let new_h = std::cmp::min(original_height, MAX_IMAGE_DIMENSION);
        let new_w = (original_width as f64 * new_h as f64 / original_height as f64) as u32;
        (new_w, new_h)
    };

    // Resize the image using Lanczos3 filter for high quality
    let resized = img.resize(new_width, new_height, FilterType::Lanczos3);

    // Encode as JPEG with quality 80
    let mut output_bytes = encode_as_jpeg(&resized, 80)?;
    let mut quality = 80u8;

    // If still too large, reduce quality
    while output_bytes.len() / 1024 > MAX_IMAGE_SIZE_KB && quality > 30 {
        quality -= 20;
        output_bytes = encode_as_jpeg(&resized, quality)?;
    }

    // Convert to base64 data URL
    let new_base64 = BASE64.encode(&output_bytes);
    let new_data_url = format!("data:image/jpeg;base64,{}", new_base64);
    let new_size_kb = new_base64.len() / 1024;

    eprintln!(
        "[Image] Resized: {}x{} -> {}x{}, {}KB -> {}KB (quality: {})",
        original_width, original_height, new_width, new_height,
        original_size_kb, new_size_kb, quality
    );

    Ok(ImageResizeResult {
        success: true,
        data_url: Some(new_data_url),
        original_width,
        original_height,
        new_width,
        new_height,
        original_size_kb,
        new_size_kb,
        error: None,
    })
}

/// Encode a DynamicImage as JPEG with specified quality
fn encode_as_jpeg(img: &DynamicImage, quality: u8) -> Result<Vec<u8>, String> {
    let mut buffer = Cursor::new(Vec::new());

    // Convert to RGB8 format for JPEG encoding
    let rgb_image = img.to_rgb8();

    // Use the jpeg encoder with quality setting
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buffer, quality);
    rgb_image.write_with_encoder(encoder)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    Ok(buffer.into_inner())
}

/// Batch resize multiple images
/// More efficient than calling resize_image multiple times due to reduced IPC overhead
#[tauri::command]
pub async fn resize_images_batch(data_urls: Vec<String>) -> Result<Vec<ImageResizeResult>, String> {
    let mut results = Vec::with_capacity(data_urls.len());

    for data_url in data_urls {
        let result = resize_image(data_url).await?;
        results.push(result);
    }

    Ok(results)
}
