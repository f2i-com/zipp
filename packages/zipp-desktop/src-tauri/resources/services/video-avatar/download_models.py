"""
Download Ditto model files from HuggingFace.

Downloads all required checkpoints for Ditto PyTorch inference:
- Main model files (decoder, motion extractor, etc.)
- Auxiliary models (HuBERT, face detection, etc.)
- Configuration files
"""

import os
import sys
from pathlib import Path

# Install huggingface_hub if not present
try:
    from huggingface_hub import hf_hub_download, snapshot_download
except ImportError:
    print("[Download] Installing huggingface_hub...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "huggingface_hub"])
    from huggingface_hub import hf_hub_download, snapshot_download

# Configuration
SCRIPT_DIR = Path(__file__).parent
CHECKPOINTS_DIR = SCRIPT_DIR / "checkpoints"
HF_REPO = "digital-avatar/ditto-talkinghead"

# Files to download with their subdirectories
FILES_TO_DOWNLOAD = [
    # Config files
    ("ditto_cfg/v0.4_hubert_cfg_pytorch.pkl", "ditto_cfg"),

    # Main model files
    ("ditto_pytorch/models/appearance_extractor.pth", "ditto_pytorch/models"),
    ("ditto_pytorch/models/decoder.pth", "ditto_pytorch/models"),
    ("ditto_pytorch/models/lmdm_v0.4_hubert.pth", "ditto_pytorch/models"),
    ("ditto_pytorch/models/motion_extractor.pth", "ditto_pytorch/models"),
    ("ditto_pytorch/models/stitch_network.pth", "ditto_pytorch/models"),
    ("ditto_pytorch/models/warp_network.pth", "ditto_pytorch/models"),

    # Auxiliary models
    ("ditto_pytorch/aux_models/2d106det.onnx", "ditto_pytorch/aux_models"),
    ("ditto_pytorch/aux_models/det_10g.onnx", "ditto_pytorch/aux_models"),
    ("ditto_pytorch/aux_models/face_landmarker.task", "ditto_pytorch/aux_models"),
    ("ditto_pytorch/aux_models/hubert_streaming_fix_kv.onnx", "ditto_pytorch/aux_models"),
    ("ditto_pytorch/aux_models/landmark203.onnx", "ditto_pytorch/aux_models"),
]


def download_file(filename: str, subdir: str) -> bool:
    """Download a single file from HuggingFace."""
    try:
        local_dir = CHECKPOINTS_DIR / subdir
        local_dir.mkdir(parents=True, exist_ok=True)

        local_path = CHECKPOINTS_DIR / filename
        if local_path.exists():
            print(f"  [Skip] {filename} (already exists)")
            return True

        print(f"  [Download] {filename}...")
        downloaded_path = hf_hub_download(
            repo_id=HF_REPO,
            filename=filename,
            local_dir=CHECKPOINTS_DIR,
            local_dir_use_symlinks=False
        )
        print(f"  [Done] {filename}")
        return True
    except Exception as e:
        print(f"  [Error] {filename}: {e}")
        return False


def main():
    print("=" * 50)
    print("  Ditto Model Downloader")
    print("=" * 50)
    print()
    print(f"Repository: {HF_REPO}")
    print(f"Destination: {CHECKPOINTS_DIR}")
    print()

    # Create checkpoints directory
    CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)

    # Download files
    success_count = 0
    fail_count = 0

    for filename, subdir in FILES_TO_DOWNLOAD:
        if download_file(filename, subdir):
            success_count += 1
        else:
            fail_count += 1

    print()
    print("=" * 50)
    print(f"  Download complete: {success_count} succeeded, {fail_count} failed")
    print("=" * 50)

    if fail_count > 0:
        print()
        print("Some files failed to download. Please check your internet connection")
        print("and try again, or manually download from:")
        print(f"  https://huggingface.co/{HF_REPO}")
        sys.exit(1)

    print()
    print("All models downloaded successfully!")
    print("You can now start the Video Avatar server.")


if __name__ == "__main__":
    main()
