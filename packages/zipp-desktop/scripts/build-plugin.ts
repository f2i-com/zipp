#!/usr/bin/env npx tsx
/**
 * Plugin Build Script
 *
 * Builds a Zipp plugin from source into a distributable bundle.
 *
 * Usage:
 *   npx tsx scripts/build-plugin.ts <source-folder> [output-folder]
 *
 * Example:
 *   npx tsx scripts/build-plugin.ts ../zipp-core/modules/plugin-vectorize ./my-plugin-output
 *
 * Or to build directly to the plugins directory:
 *   npx tsx scripts/build-plugin.ts ../zipp-core/modules/plugin-vectorize
 *
 * The script will:
 *   1. Read the module's manifest.json
 *   2. Bundle runtime.ts, compiler.ts, and ui/index.ts into plugin.bundle.js
 *   3. Copy manifest.json and nodes/*.json
 *   4. Output to the specified folder or the user's plugins directory
 */

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================
// Configuration
// ============================================

const args = process.argv.slice(2);

if (args.length < 1) {
  console.error('Usage: npx tsx scripts/build-plugin.ts <source-folder> [output-folder]');
  console.error('');
  console.error('Example:');
  console.error('  npx tsx scripts/build-plugin.ts ../zipp-core/modules/plugin-vectorize');
  process.exit(1);
}

const sourceFolder = path.resolve(args[0]);
const manifestPath = path.join(sourceFolder, 'module.json');

// Check source folder exists
if (!fs.existsSync(sourceFolder)) {
  console.error(`Error: Source folder not found: ${sourceFolder}`);
  process.exit(1);
}

// Check manifest exists
if (!fs.existsSync(manifestPath)) {
  console.error(`Error: manifest.json (or module.json) not found in: ${sourceFolder}`);
  process.exit(1);
}

// Read manifest
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
const pluginId = manifest.id;

if (!pluginId) {
  console.error('Error: manifest must have an "id" field');
  process.exit(1);
}

// Determine output folder
let outputFolder: string;
if (args.length >= 2) {
  outputFolder = path.resolve(args[1]);
} else {
  // Default to user's plugins directory
  const dataDir = process.platform === 'win32'
    ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
    : path.join(os.homedir(), '.local', 'share');
  outputFolder = path.join(dataDir, 'zipp', 'plugins', pluginId);
}

console.log(`Building plugin: ${pluginId}`);
console.log(`  Source: ${sourceFolder}`);
console.log(`  Output: ${outputFolder}`);

// ============================================
// Build Functions
// ============================================

async function buildBundle(): Promise<void> {
  // Find available entry points
  const runtimePath = path.join(sourceFolder, 'runtime.ts');
  const compilerPath = path.join(sourceFolder, 'compiler.ts');
  const uiPath = path.join(sourceFolder, 'ui', 'index.ts');

  const hasRuntime = fs.existsSync(runtimePath);
  const hasCompiler = fs.existsSync(compilerPath);
  const hasUI = fs.existsSync(uiPath);

  if (!hasRuntime && !hasCompiler && !hasUI) {
    console.log('  No TypeScript files to bundle (runtime.ts, compiler.ts, ui/index.ts)');
    return;
  }

  console.log('  Bundling TypeScript files...');
  if (hasRuntime) console.log('    - runtime.ts');
  if (hasCompiler) console.log('    - compiler.ts');
  if (hasUI) console.log('    - ui/index.ts');

  // Create a virtual entry point that exports all modules
  const entryCode = `
// Auto-generated plugin entry point
${hasRuntime ? `import runtime from '${runtimePath.replace(/\\/g, '/')}';` : 'const runtime = undefined;'}
${hasCompiler ? `import compiler from '${compilerPath.replace(/\\/g, '/')}';` : 'const compiler = undefined;'}
${hasUI ? `import * as uiComponents from '${uiPath.replace(/\\/g, '/')}';` : 'const uiComponents = {};'}

// Export in CommonJS format for dynamic loading
module.exports = {
  runtime,
  compiler,
  components: uiComponents,
};
`;

  // Write temporary entry file
  const entryPath = path.join(sourceFolder, '_plugin_entry.ts');
  fs.writeFileSync(entryPath, entryCode);

  try {
    await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      outfile: path.join(outputFolder, 'plugin.bundle.js'),
      format: 'cjs', // CommonJS for easier dynamic loading
      platform: 'browser',
      target: 'es2020',
      minify: false, // Keep readable for debugging
      sourcemap: false,
      external: [
        'react',
        'react-dom',
        '@xyflow/react',
        'zipp-core',
        'zipp-ui-components',
      ],
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
    console.log('  ✓ Bundle created: plugin.bundle.js');
  } finally {
    // Clean up temporary entry file
    if (fs.existsSync(entryPath)) {
      fs.unlinkSync(entryPath);
    }
  }
}

function copyManifest(): void {
  // Copy manifest (rename module.json to manifest.json if needed)
  const srcManifest = path.join(sourceFolder, 'module.json');
  const destManifest = path.join(outputFolder, 'manifest.json');

  if (fs.existsSync(srcManifest)) {
    fs.copyFileSync(srcManifest, destManifest);
    console.log('  ✓ Copied manifest.json');
  }
}

function copyNodes(): void {
  const nodesDir = path.join(sourceFolder, 'nodes');
  const destNodesDir = path.join(outputFolder, 'nodes');

  if (!fs.existsSync(nodesDir)) {
    console.log('  - No nodes directory found');
    return;
  }

  // Create destination nodes directory
  if (!fs.existsSync(destNodesDir)) {
    fs.mkdirSync(destNodesDir, { recursive: true });
  }

  // Copy all JSON files
  const files = fs.readdirSync(nodesDir);
  let count = 0;
  for (const file of files) {
    if (file.endsWith('.json')) {
      fs.copyFileSync(
        path.join(nodesDir, file),
        path.join(destNodesDir, file)
      );
      count++;
    }
  }
  console.log(`  ✓ Copied ${count} node definition(s)`);
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  // Create output directory
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  // Build the bundle
  await buildBundle();

  // Copy manifest
  copyManifest();

  // Copy nodes
  copyNodes();

  console.log('');
  console.log(`✓ Plugin "${pluginId}" built successfully!`);
  console.log(`  Output: ${outputFolder}`);
  console.log('');
  console.log('To use this plugin:');
  console.log(`  1. Copy the folder to your plugins directory`);
  console.log(`  2. Restart Zipp`);
  console.log('');
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
