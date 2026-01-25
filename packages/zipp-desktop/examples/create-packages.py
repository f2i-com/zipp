#!/usr/bin/env python3
"""Script to create .zipp packages with proper ZIP structure"""

import zipfile
import os
from pathlib import Path

def create_package(source_dir: Path, output_file: Path):
    """Create a .zipp package from a source directory."""
    with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        # Add manifest.json
        manifest_path = source_dir / 'manifest.json'
        if manifest_path.exists():
            zf.write(manifest_path, 'manifest.json')
            print(f"  Added: manifest.json")

        # Add flows directory
        flows_dir = source_dir / 'flows'
        if flows_dir.exists():
            for root, dirs, files in os.walk(flows_dir):
                for file in files:
                    file_path = Path(root) / file
                    arc_name = file_path.relative_to(source_dir).as_posix()
                    zf.write(file_path, arc_name)
                    print(f"  Added: {arc_name}")

        # Add assets directory
        assets_dir = source_dir / 'assets'
        if assets_dir.exists():
            for root, dirs, files in os.walk(assets_dir):
                for file in files:
                    file_path = Path(root) / file
                    arc_name = file_path.relative_to(source_dir).as_posix()
                    zf.write(file_path, arc_name)
                    print(f"  Added: {arc_name}")

        # Add services directory
        services_dir = source_dir / 'services'
        if services_dir.exists():
            for root, dirs, files in os.walk(services_dir):
                for file in files:
                    file_path = Path(root) / file
                    arc_name = file_path.relative_to(source_dir).as_posix()
                    zf.write(file_path, arc_name)
                    print(f"  Added: {arc_name}")

    print(f"Created: {output_file} ({output_file.stat().st_size} bytes)")

def main():
    script_dir = Path(__file__).parent

    # Sample package
    print("\nCreating hello-world.zipp...")
    create_package(
        script_dir / 'sample-package',
        script_dir / 'sample-package' / 'hello-world.zipp'
    )

    # API service package
    print("\nCreating weather-api.zipp...")
    create_package(
        script_dir / 'api-service-package',
        script_dir / 'api-service-package' / 'weather-api.zipp'
    )

    print("\nDone!")

if __name__ == '__main__':
    main()
