"""
Test script for ACE-Step Music Generation API
"""

import requests
import os
import time

API_URL = "http://127.0.0.1:8766"


def test_health():
    """Test health endpoint."""
    print("Testing health endpoint...")
    response = requests.get(f"{API_URL}/health")
    assert response.status_code == 200, f"Health check failed: {response.text}"
    data = response.json()
    assert data["status"] == "healthy", f"Unexpected status: {data}"
    print(f"  OK: {data}")
    return True


def test_info():
    """Test info endpoint."""
    print("Testing info endpoint...")
    response = requests.get(f"{API_URL}/info")
    assert response.status_code == 200, f"Info check failed: {response.text}"
    data = response.json()
    assert data["model"] == "ACE-Step-v1-3.5B", f"Unexpected model: {data}"
    print(f"  OK: Model={data['model']}, Max duration={data['max_duration_seconds']}s")
    return True


def test_generate_music():
    """Test music generation."""
    print("Testing music generation...")
    print("  This may take 10-30 seconds on first run (model loading)...")

    start_time = time.time()
    response = requests.post(
        f"{API_URL}/generate",
        json={
            "prompt": "electronic, upbeat, synth, dance, energetic",
            "duration": 15,
            "infer_steps": 27,
        },
        timeout=300,
    )
    elapsed = time.time() - start_time

    assert response.status_code == 200, f"Generation failed: {response.text}"
    data = response.json()

    assert data["success"] is True, f"Generation not successful: {data}"
    assert "audio_path" in data, f"No audio_path in response: {data}"
    assert os.path.exists(data["audio_path"]), f"Audio file not found: {data['audio_path']}"

    file_size = os.path.getsize(data["audio_path"]) / 1024  # KB
    print(f"  OK: Generated {data['duration_seconds']}s audio in {elapsed:.1f}s")
    print(f"      File: {data['audio_path']}")
    print(f"      Size: {file_size:.1f} KB")
    print(f"      Sample rate: {data['sample_rate']} Hz")

    return True


def test_generate_with_lyrics():
    """Test music generation with lyrics."""
    print("Testing music generation with lyrics...")

    start_time = time.time()
    response = requests.post(
        f"{API_URL}/generate",
        json={
            "prompt": "pop, female vocal, emotional, piano",
            "lyrics": "[verse]\nHello world, this is a test\nOf the music generation\n[chorus]\nLa la la, singing along\nTo a brand new song",
            "duration": 15,
            "infer_steps": 27,
        },
        timeout=300,
    )
    elapsed = time.time() - start_time

    assert response.status_code == 200, f"Generation failed: {response.text}"
    data = response.json()

    assert data["success"] is True, f"Generation not successful: {data}"
    print(f"  OK: Generated {data['duration_seconds']}s audio with lyrics in {elapsed:.1f}s")
    print(f"      File: {data['audio_path']}")

    return True


def main():
    print("=" * 60)
    print("ACE-Step Music Generation API Tests")
    print("=" * 60)
    print()

    tests = [
        ("Health Check", test_health),
        ("Model Info", test_info),
        ("Music Generation", test_generate_music),
        ("Music with Lyrics", test_generate_with_lyrics),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            if test_fn():
                passed += 1
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1
        print()

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return failed == 0


if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)
