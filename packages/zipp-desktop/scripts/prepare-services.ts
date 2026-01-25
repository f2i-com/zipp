/**
 * Prepares services for bundling by copying them without venv/cache folders
 */
import * as fs from 'fs';
import * as path from 'path';

const EXCLUDE_DIRS = ['venv', '__pycache__', 'node_modules', '.git', '.venv'];
const EXCLUDE_FILES = ['.pyc', '.pyo', '.egg-info'];

function copyDir(src: string, dest: string) {
  // Create destination directory
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip excluded directories
      if (EXCLUDE_DIRS.includes(entry.name)) {
        console.log(`  Skipping: ${entry.name}/`);
        continue;
      }
      copyDir(srcPath, destPath);
    } else {
      // Skip excluded file types
      if (EXCLUDE_FILES.some(ext => entry.name.endsWith(ext))) {
        continue;
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  // Handle Windows paths (remove leading slash if present)
  const normalizedDir = scriptDir.replace(/^\/([A-Z]:)/, '$1');

  const repoRoot = path.resolve(normalizedDir, '..', '..', '..');
  const servicesSource = path.join(repoRoot, 'services');
  const servicesDest = path.join(normalizedDir, '..', 'src-tauri', 'resources', 'services');

  console.log('Preparing services for bundling...');
  console.log(`  Source: ${servicesSource}`);
  console.log(`  Dest: ${servicesDest}`);

  // Check if source exists
  if (!fs.existsSync(servicesSource)) {
    console.log('NOTE: Services directory not found at:', servicesSource);
    console.log('  Creating empty services directory (no services to bundle)');
    fs.mkdirSync(servicesDest, { recursive: true });
    console.log('\nPrepared 0 services (services directory does not exist)');
    return;
  }

  // Clean destination
  if (fs.existsSync(servicesDest)) {
    console.log('  Cleaning existing services...');
    fs.rmSync(servicesDest, { recursive: true });
  }

  // Copy services
  console.log('  Copying services (excluding venv, __pycache__)...');
  copyDir(servicesSource, servicesDest);

  // List what was copied
  const copied = fs.readdirSync(servicesDest);
  console.log(`\nPrepared ${copied.length} services:`);
  for (const service of copied) {
    console.log(`  - ${service}`);
  }
}

main().catch(console.error);
