#!/usr/bin/env npx tsx
/**
 * Build All Plugins Script
 *
 * Copies all modules from zipp-core/modules into plugins for bundling with the installer.
 * Does NOT pre-build bundles - the app will build them on first launch.
 * This ensures plugins are always built with the correct/matching versions.
 *
 * Usage:
 *   npx tsx scripts/build-all-plugins.ts
 *   npx tsx scripts/build-all-plugins.ts --prebuild  (to also build bundles)
 *
 * Output:
 *   src-tauri/resources/plugins/<plugin-id>/
 *     - manifest.json
 *     - nodes/*.json
 *     - src/runtime.ts (source for runtime build)
 *     - src/compiler.ts (source for runtime build)
 *     - src/ui/ (source for runtime build)
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ============================================
// Configuration
// ============================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODULES_DIR = path.resolve(__dirname, '../../zipp-core/modules');
const OUTPUT_DIR = path.resolve(__dirname, '../src-tauri/resources/plugins');

// Check for --prebuild flag
const PREBUILD = process.argv.includes('--prebuild');

console.log('Preparing plugins for installer...');
console.log(`  Modules source: ${MODULES_DIR}`);
console.log(`  Output: ${OUTPUT_DIR}`);
console.log(`  Pre-build bundles: ${PREBUILD ? 'YES' : 'NO (app will build on first launch)'}`);
console.log('');

// ============================================
// Build Functions
// ============================================

async function buildPluginBundle(sourceFolder: string, outputFolder: string, pluginId: string): Promise<boolean> {
  const runtimePath = path.join(sourceFolder, 'runtime.ts');
  const compilerPath = path.join(sourceFolder, 'compiler.ts');
  const uiPath = path.join(sourceFolder, 'ui', 'index.ts');
  const uiPathTsx = path.join(sourceFolder, 'ui', 'index.tsx');

  const hasRuntime = fs.existsSync(runtimePath);
  const hasCompiler = fs.existsSync(compilerPath);
  const hasUI = fs.existsSync(uiPath) || fs.existsSync(uiPathTsx);
  const actualUiPath = fs.existsSync(uiPathTsx) ? uiPathTsx : uiPath;

  if (!hasRuntime && !hasCompiler && !hasUI) {
    return false;
  }

  // Create a virtual entry point that exports all modules
  const entryCode = `
// Auto-generated plugin entry point
${hasRuntime ? `import runtime from '${runtimePath.replace(/\\/g, '/')}';` : 'const runtime = undefined;'}
${hasCompiler ? `import compiler from '${compilerPath.replace(/\\/g, '/')}';` : 'const compiler = undefined;'}
${hasUI ? `import * as uiComponents from '${actualUiPath.replace(/\\/g, '/')}';` : 'const uiComponents = {};'}

// Export for dynamic loading
export { runtime, compiler };
export const components = uiComponents;
`;

  // Write temporary entry file
  const entryPath = path.join(sourceFolder, '_plugin_entry.ts');
  fs.writeFileSync(entryPath, entryCode);

  try {
    // Map external modules to global variable names
    const externalGlobals: Record<string, string> = {
      'react': '__PLUGIN_GLOBALS__.React',
      'react-dom': '__PLUGIN_GLOBALS__.ReactDOM',
      'react/jsx-runtime': '__PLUGIN_GLOBALS__.ReactJSXRuntime',
      '@xyflow/react': '__PLUGIN_GLOBALS__.ReactFlow',
      'zipp-core': '__PLUGIN_GLOBALS__.ZippCore',
      'zipp-ui-components': '__PLUGIN_GLOBALS__.ZippUIComponents',
      '@monaco-editor/react': '__PLUGIN_GLOBALS__.MonacoReact',
      '@tauri-apps/api': '__PLUGIN_GLOBALS__.TauriAPI',
      '@tauri-apps/api/core': '__PLUGIN_GLOBALS__.TauriAPICore',
      '@tauri-apps/api/event': '__PLUGIN_GLOBALS__.TauriAPIEvent',
      '@tauri-apps/api/path': '__PLUGIN_GLOBALS__.TauriAPIPath',
      '@tauri-apps/plugin-sql': '__PLUGIN_GLOBALS__.TauriPluginSQL',
    };

    // Plugin to replace external imports with global variable references
    const externalsPlugin: esbuild.Plugin = {
      name: 'external-globals',
      setup(build) {
        // Mark all external packages
        const externalFilter = new RegExp(
          `^(${Object.keys(externalGlobals).map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})$`
        );

        build.onResolve({ filter: externalFilter }, args => ({
          path: args.path,
          namespace: 'external-global',
        }));

        build.onLoad({ filter: /.*/, namespace: 'external-global' }, args => {
          const globalName = externalGlobals[args.path];
          if (globalName) {
            return {
              contents: `module.exports = ${globalName};`,
              loader: 'js',
            };
          }
          return null;
        });
      },
    };

    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      outfile: path.join(outputFolder, 'plugin.bundle.js'),
      format: 'iife',
      globalName: '__PLUGIN_EXPORTS__',
      platform: 'browser',
      target: 'es2020',
      minify: false,
      sourcemap: false,
      plugins: [externalsPlugin],
      define: {
        'process.env.NODE_ENV': '"production"',
      },
      jsx: 'automatic',
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
      },
      logLevel: 'warning',
    });
    return true;
  } finally {
    if (fs.existsSync(entryPath)) {
      fs.unlinkSync(entryPath);
    }
  }
}

function copyDirectory(src: string, dest: string, excludeDirs: string[] = []): void {
  if (!fs.existsSync(src)) return;

  fs.mkdirSync(dest, { recursive: true });

  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    // Skip excluded directories (like 'target' for Rust builds)
    if (entry.isDirectory() && excludeDirs.includes(entry.name)) {
      continue;
    }

    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath, excludeDirs);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function buildPlugin(moduleDir: string): Promise<{ id: string; success: boolean; error?: string }> {
  const manifestPath = path.join(moduleDir, 'module.json');

  if (!fs.existsSync(manifestPath)) {
    return { id: path.basename(moduleDir), success: false, error: 'No module.json found' };
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const pluginId = manifest.id;

  if (!pluginId) {
    return { id: path.basename(moduleDir), success: false, error: 'No id in module.json' };
  }

  const outputFolder = path.join(OUTPUT_DIR, pluginId);

  try {
    // Clean output folder
    if (fs.existsSync(outputFolder)) {
      fs.rmSync(outputFolder, { recursive: true });
    }
    fs.mkdirSync(outputFolder, { recursive: true });

    // Copy manifest (as manifest.json)
    fs.copyFileSync(manifestPath, path.join(outputFolder, 'manifest.json'));

    // Copy nodes
    const nodesDir = path.join(moduleDir, 'nodes');
    if (fs.existsSync(nodesDir)) {
      copyDirectory(nodesDir, path.join(outputFolder, 'nodes'));
    }

    // Build bundle (only if --prebuild flag is set)
    if (PREBUILD) {
      await buildPluginBundle(moduleDir, outputFolder, pluginId);
    }

    // Copy source files for runtime building
    const srcDir = path.join(outputFolder, 'src');
    fs.mkdirSync(srcDir, { recursive: true });

    // Copy runtime.ts
    const runtimePath = path.join(moduleDir, 'runtime.ts');
    if (fs.existsSync(runtimePath)) {
      fs.copyFileSync(runtimePath, path.join(srcDir, 'runtime.ts'));
    }

    // Copy compiler.ts
    const compilerPath = path.join(moduleDir, 'compiler.ts');
    if (fs.existsSync(compilerPath)) {
      fs.copyFileSync(compilerPath, path.join(srcDir, 'compiler.ts'));
    }

    // Copy ui folder
    const uiDir = path.join(moduleDir, 'ui');
    if (fs.existsSync(uiDir)) {
      copyDirectory(uiDir, path.join(srcDir, 'ui'));
    }

    // Copy any additional .ts files in module root (e.g., browser-utils.ts)
    const moduleFiles = fs.readdirSync(moduleDir);
    for (const file of moduleFiles) {
      if (file.endsWith('.ts') && !file.startsWith('_') && file !== 'runtime.ts' && file !== 'compiler.ts') {
        const srcFilePath = path.join(moduleDir, file);
        if (fs.statSync(srcFilePath).isFile()) {
          fs.copyFileSync(srcFilePath, path.join(srcDir, file));
        }
      }
    }

    // Copy native folder for Rust plugins (if exists)
    // Exclude 'target' directory which contains large build artifacts
    const nativeDir = path.join(moduleDir, 'native');
    if (fs.existsSync(nativeDir)) {
      copyDirectory(nativeDir, path.join(outputFolder, 'native'), ['target']);
    }

    return { id: pluginId, success: true };
  } catch (error) {
    return { id: pluginId, success: false, error: String(error) };
  }
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  // Clean output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Find all module directories (skip hidden folders and test folders)
  const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
  const moduleDirs = entries
    .filter(e => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('__'))
    .map(e => path.join(MODULES_DIR, e.name));

  console.log(`Found ${moduleDirs.length} modules to prepare:\n`);

  const results: { id: string; success: boolean; error?: string }[] = [];

  for (const moduleDir of moduleDirs) {
    const moduleName = path.basename(moduleDir);
    process.stdout.write(`  ${PREBUILD ? 'Building' : 'Copying'} ${moduleName}... `);

    const result = await buildPlugin(moduleDir);
    results.push(result);

    if (result.success) {
      console.log('✓');
    } else {
      console.log(`✗ ${result.error}`);
    }
  }

  // Summary
  console.log('');
  console.log('=' .repeat(50));
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`${PREBUILD ? 'Built' : 'Prepared'} ${successful.length}/${results.length} plugins successfully`);

  if (failed.length > 0) {
    console.log('\nFailed:');
    for (const f of failed) {
      console.log(`  - ${f.id}: ${f.error}`);
    }
  }

  console.log(`\nOutput: ${OUTPUT_DIR}`);
  console.log('');

  // Exit with error if any failed
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
