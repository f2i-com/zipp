/**
 * Media Server Utilities
 *
 * Provides helper functions for constructing media server URLs with dynamic port support.
 */

import { createLogger } from './logger.js';

const logger = createLogger('MediaUtils');

// Cache the media server port
let cachedPort: number = 31338; // Default fallback

/**
 * Initialize the media server port. Call this on app startup.
 * This should be called from the frontend after getting the port from Tauri.
 */
export async function initMediaServerPort(): Promise<number> {
    if (cachedPort !== 31338) {
        return cachedPort;
    }

    try {
        // Try to get port from Tauri via window invoke
        if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
            const port = await (window as any).__TAURI_INTERNALS__.invoke('get_media_server_port');
            if (port && port > 0) {
                cachedPort = port;
                logger.debug(`Media server port: ${cachedPort}`);
            }
        }
    } catch (e) {
        logger.warn('Failed to get media server port', { error: e });
    }

    return cachedPort;
}

/**
 * Get the cached media server port. Returns 0 if not initialized.
 */
export function getMediaServerPort(): number {
    return cachedPort || 31338; // Fallback to default if not initialized
}

/**
 * Set the media server port directly (useful for initialization)
 */
export function setMediaServerPort(port: number): void {
    cachedPort = port;
}

/**
 * Convert a local file path to a media server URL.
 * Returns the original path if it can't be converted.
 */
export function pathToMediaUrl(filePath: string): string {
    if (!filePath) return filePath;

    const port = getMediaServerPort();
    const normalizedPath = filePath.replace(/\\/g, '/');

    // Check for zipp output directory (AppData/Roaming/zipp/output/)
    const zippOutputMatch = normalizedPath.match(/\/zipp\/output\/(.+)$/i);
    if (zippOutputMatch) {
        return `http://127.0.0.1:${port}/media/zipp-output/${zippOutputMatch[1]}`;
    }

    // Check for Pictures directory
    const picturesMatch = normalizedPath.match(/\/Pictures\/(.+)$/i);
    if (picturesMatch) {
        return `http://127.0.0.1:${port}/media/pictures/${picturesMatch[1]}`;
    }

    // Check for Videos directory
    const videosMatch = normalizedPath.match(/\/Videos\/(.+)$/i);
    if (videosMatch) {
        return `http://127.0.0.1:${port}/media/videos/${videosMatch[1]}`;
    }

    // Check for Downloads directory
    const downloadsMatch = normalizedPath.match(/\/Downloads\/(.+)$/i);
    if (downloadsMatch) {
        return `http://127.0.0.1:${port}/media/downloads/${downloadsMatch[1]}`;
    }

    // Return original if no match
    return filePath;
}

/**
 * Check if a string looks like a local file path (not a URL)
 */
export function isLocalPath(value: string): boolean {
    if (!value || typeof value !== 'string') return false;

    // Check if it's already a URL
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
        return false;
    }

    // Check for common path patterns
    return (
        value.includes('/') ||
        value.includes('\\') ||
        /^[A-Za-z]:/.test(value) // Windows drive letter
    );
}
