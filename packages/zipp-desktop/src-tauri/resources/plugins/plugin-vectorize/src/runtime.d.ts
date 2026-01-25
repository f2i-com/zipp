/**
 * Plugin Vectorize Module Type Declarations
 */

import type { RuntimeModule } from '../../src/module-types';

/**
 * Vectorize module methods available at runtime
 */
export interface VectorizeModuleMethods {
  /**
   * Convert a raster image to SVG vector format
   *
   * @param imageInput - Input image (path, URL, base64 data URL, or object with path/dataUrl)
   * @param outputPath - Output SVG file path (empty for auto-generation)
   * @param colorCount - Number of colors in the output (2-64)
   * @param quality - Quality level: 'fast' | 'balanced' | 'high' | 'detailed'
   * @param smoothness - Path smoothing level (0.1-5.0)
   * @param minArea - Minimum shape area in pixels
   * @param removeBackground - Whether to remove the detected background
   * @param optimize - Whether to optimize the SVG for file size
   * @param nodeId - The workflow node ID for status tracking
   * @returns Promise resolving to the output SVG file path
   */
  convert(
    imageInput: unknown,
    outputPath: string,
    colorCount: number,
    quality: string,
    smoothness: number,
    minArea: number,
    removeBackground: boolean,
    optimize: boolean,
    nodeId: string
  ): Promise<string>;
}

declare const PluginVectorizeRuntime: RuntimeModule;
export default PluginVectorizeRuntime;
