"""
HeartMuLa Music Generation Server

A local FastAPI server for music generation using HeartMuLa.
Supports text-to-music generation with lyrics and tags.

Usage:
    python server.py

Configuration via .env file or environment variables.
"""

import os
import uuid
import tempfile
from pathlib import Path
from typing import Optional
from contextlib import asynccontextmanager

import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from tqdm import tqdm

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("HEARTMULA_HOST", "127.0.0.1")
PORT = int(os.getenv("HEARTMULA_PORT", "8767"))
DEVICE = os.getenv("HEARTMULA_DEVICE", "cuda" if torch.cuda.is_available() else "cpu")
DEVICE_ID = int(os.getenv("HEARTMULA_DEVICE_ID", "0"))
MODEL_PATH = os.getenv("HEARTMULA_MODEL_PATH", "")
CODEC_PATH = os.getenv("HEARTMULA_CODEC_PATH", "")
TOKENIZER_PATH = os.getenv("HEARTMULA_TOKENIZER_PATH", "")
OUTPUT_DIR = os.getenv("HEARTMULA_OUTPUT_DIR") or tempfile.gettempdir()
USE_FP8 = os.getenv("HEARTMULA_USE_FP8", "true").lower() == "true"

# Global instances
model = None
codec = None
tokenizer = None
model_config = None


def has_valid_model_weights(model_path: Path) -> bool:
    """Check if a model path has valid weights (FP8 or sharded)."""
    if not model_path.exists():
        return False
    # Check for FP8 quantized model (single file)
    if (model_path / "model.safetensors").exists():
        return True
    # Check for sharded model (multiple files)
    if list(model_path.glob("model-*.safetensors")):
        return True
    return False


def get_model_paths():
    """Get or download model paths."""
    from huggingface_hub import snapshot_download

    base_dir = Path(__file__).parent / "models"
    base_dir.mkdir(exist_ok=True)

    # Model path - check for user override first
    if MODEL_PATH and Path(MODEL_PATH).exists():
        model_path = Path(MODEL_PATH)
    else:
        model_path = base_dir / "HeartMuLa-oss-3B"
        # Download if no valid weights found (handles .gitignore case)
        if not has_valid_model_weights(model_path):
            print("[HeartMuLa] Local FP8 model not found, downloading from HuggingFace...")
            print("[HeartMuLa] This will download the full precision model (~15GB)")
            snapshot_download(
                repo_id="HeartMuLa/HeartMuLa-oss-3B",
                local_dir=str(model_path),
                local_dir_use_symlinks=False
            )

    # Codec path
    if CODEC_PATH and Path(CODEC_PATH).exists():
        codec_path = Path(CODEC_PATH)
    else:
        codec_path = base_dir / "HeartCodec-oss"
        # Check for valid model files, not just folder existence
        if not has_valid_model_weights(codec_path):
            print("[HeartMuLa] Downloading codec from HuggingFace...")
            snapshot_download(
                repo_id="HeartMuLa/HeartCodec-oss",
                local_dir=str(codec_path),
                local_dir_use_symlinks=False
            )

    # Tokenizer path
    if TOKENIZER_PATH and Path(TOKENIZER_PATH).exists():
        tokenizer_path = Path(TOKENIZER_PATH)
    else:
        tokenizer_path = base_dir / "tokenizer.json"
        if not tokenizer_path.exists():
            print("[HeartMuLa] Downloading tokenizer from HuggingFace...")
            snapshot_download(
                repo_id="HeartMuLa/HeartMuLaGen",
                local_dir=str(base_dir),
                local_dir_use_symlinks=False
            )

    return model_path, codec_path, tokenizer_path


def load_models():
    """Load HeartMuLa models."""
    global model, codec, tokenizer, model_config

    if model is not None:
        return model, codec, tokenizer

    print(f"[HeartMuLa] Loading models on {DEVICE}:{DEVICE_ID}...")

    # Set CUDA device
    if DEVICE == "cuda":
        os.environ["CUDA_VISIBLE_DEVICES"] = str(DEVICE_ID)

    # Get model paths
    model_path, codec_path, tokenizer_path = get_model_paths()

    # Import HeartMuLa modules
    from heartlib.heartmula.modeling_heartmula import HeartMuLa
    from heartlib.heartmula.configuration_heartmula import HeartMuLaConfig
    from heartlib.heartcodec.modeling_heartcodec import HeartCodec
    from heartlib.heartcodec.configuration_heartcodec import HeartCodecConfig
    from tokenizers import Tokenizer as HFTokenizer
    from safetensors import safe_open

    # Load tokenizer
    print("[HeartMuLa] Loading tokenizer...")
    tokenizer = HFTokenizer.from_file(str(tokenizer_path))

    # Load codec
    print("[HeartMuLa] Loading codec...")
    codec_weights = codec_path / "model.safetensors"

    # Check if codec has FP8 quantized weights (has scale tensors)
    codec_is_fp8 = False
    if codec_weights.exists():
        with safe_open(str(codec_weights), framework="pt", device="cpu") as f:
            codec_is_fp8 = any(k.endswith("_scale") for k in f.keys())

    if USE_FP8 and codec_is_fp8:
        # Load FP8 quantized codec
        print("[HeartMuLa] Loading FP8 quantized codec...")
        codec_config = HeartCodecConfig.from_pretrained(str(codec_path))
        codec_state_dict = {}
        with safe_open(str(codec_weights), framework="pt", device="cpu") as f:
            keys = [k for k in f.keys() if not k.endswith("_scale")]
            for key in tqdm(keys, desc="Loading codec"):
                tensor = f.get_tensor(key)
                scale_key = f"{key}_scale"
                if scale_key in f.keys():
                    scale = f.get_tensor(scale_key)
                    # Dequantize: quantized / scale = original
                    codec_state_dict[key] = tensor.to(torch.float32) / scale.to(torch.float32)
                else:
                    codec_state_dict[key] = tensor

        codec = HeartCodec(codec_config)
        codec.load_state_dict(codec_state_dict, strict=False)
        codec = codec.to(DEVICE)
    else:
        # Load full precision codec
        codec = HeartCodec.from_pretrained(str(codec_path), device_map=DEVICE)
    codec.eval()

    # Load model
    print("[HeartMuLa] Loading model...")
    model_config = HeartMuLaConfig.from_pretrained(str(model_path))

    # Check for quantized model
    quantized_model = model_path / "model.safetensors"
    sharded_model = list(model_path.glob("model-*.safetensors"))

    if USE_FP8 and quantized_model.exists():
        # Load FP8 quantized model
        print("[HeartMuLa] Loading FP8 quantized weights...")
        state_dict = {}
        with safe_open(str(quantized_model), framework="pt", device="cpu") as f:
            keys = [k for k in f.keys() if not k.endswith("_scale")]
            for key in tqdm(keys, desc="Loading"):
                tensor = f.get_tensor(key)
                scale_key = f"{key}_scale"
                if scale_key in f.keys():
                    scale = f.get_tensor(scale_key)
                    # Dequantize: quantized / scale = original (scale was computed as max_fp8 / max_tensor)
                    state_dict[key] = tensor.to(torch.float32) / scale.to(torch.float32)
                else:
                    state_dict[key] = tensor

        model = HeartMuLa(model_config)
        model.load_state_dict(state_dict, strict=False)
    elif sharded_model:
        # Load sharded model (original format)
        print("[HeartMuLa] Loading full precision weights...")
        model = HeartMuLa.from_pretrained(str(model_path), torch_dtype=torch.bfloat16)
    else:
        raise FileNotFoundError(f"No model weights found at {model_path}")

    model = model.to(DEVICE, dtype=torch.bfloat16)
    model.eval()

    print("[HeartMuLa] Models loaded successfully")
    return model, codec, tokenizer


def generate_music(
    tags: str,
    lyrics: str,
    max_duration_ms: int = 60000,
    temperature: float = 1.0,
    topk: int = 50,
    cfg_scale: float = 1.5,
):
    """Generate music from tags and lyrics."""
    global model, codec, tokenizer, model_config

    model, codec, tokenizer = load_models()

    # Config values (matching official HeartMuLaGenConfig)
    text_bos_id = 128000
    text_eos_id = 128001
    audio_eos_id = 8193
    num_codebooks = codec.config.num_quantizers + 1

    # Process tags
    tags = tags.lower()
    if not tags.startswith("<tag>"):
        tags = f"<tag>{tags}"
    if not tags.endswith("</tag>"):
        tags = f"{tags}</tag>"

    tags_ids = tokenizer.encode(tags).ids
    if tags_ids[0] != text_bos_id:
        tags_ids = [text_bos_id] + tags_ids
    if tags_ids[-1] != text_eos_id:
        tags_ids = tags_ids + [text_eos_id]

    # Process lyrics
    lyrics = lyrics.lower()
    lyrics_ids = tokenizer.encode(lyrics).ids
    if lyrics_ids[0] != text_bos_id:
        lyrics_ids = [text_bos_id] + lyrics_ids
    if lyrics_ids[-1] != text_eos_id:
        lyrics_ids = lyrics_ids + [text_eos_id]

    # Build input tokens
    muq_idx = len(tags_ids)
    prompt_len = len(tags_ids) + 1 + len(lyrics_ids)
    bs_size = 2 if cfg_scale != 1.0 else 1

    tokens = torch.zeros(bs_size, prompt_len, num_codebooks, dtype=torch.long, device=DEVICE)
    tokens[:, :len(tags_ids), -1] = torch.tensor(tags_ids, device=DEVICE)
    tokens[:, len(tags_ids) + 1:, -1] = torch.tensor(lyrics_ids, device=DEVICE)

    tokens_mask = torch.zeros_like(tokens, dtype=torch.bool)
    tokens_mask[..., -1] = True

    input_pos = torch.arange(prompt_len, device=DEVICE).unsqueeze(0).repeat(bs_size, 1)
    muq_embed = torch.zeros(bs_size, 512, dtype=torch.bfloat16, device=DEVICE)

    # Setup caches
    model.setup_caches(max_batch_size=bs_size)

    frames = []
    max_frames = max_duration_ms // 80

    print(f"[HeartMuLa] Generating up to {max_frames} frames (max {max_duration_ms}ms)...")

    with torch.no_grad(), torch.autocast(device_type="cuda", dtype=torch.bfloat16):
        # First frame
        curr_token = model.generate_frame(
            tokens=tokens,
            tokens_mask=tokens_mask,
            input_pos=input_pos,
            temperature=temperature,
            topk=topk,
            cfg_scale=cfg_scale,
            continuous_segments=muq_embed,
            starts=[muq_idx] * bs_size,
        )
        frames.append(curr_token[0:1])

        # Subsequent frames
        for i in tqdm(range(max_frames - 1), desc="Generating"):
            padded_token = torch.zeros(bs_size, 1, num_codebooks, device=DEVICE, dtype=torch.long)
            padded_token[:, 0, :-1] = curr_token
            padded_mask = torch.ones_like(padded_token, dtype=torch.bool)
            padded_mask[..., -1] = False

            curr_token = model.generate_frame(
                tokens=padded_token,
                tokens_mask=padded_mask,
                input_pos=input_pos[:, -1:] + i + 1,
                temperature=temperature,
                topk=topk,
                cfg_scale=cfg_scale,
                continuous_segments=None,
                starts=None,
            )

            # Check for EOS token (matching official pipeline: curr_token[0:1, :] >= audio_eos_id)
            if torch.any(curr_token[0:1, :] >= audio_eos_id):
                print(f"[HeartMuLa] EOS reached at frame {i+2} - song finished naturally")
                break
            frames.append(curr_token[0:1])

    # Decode to audio
    frames_tensor = torch.stack(frames).permute(1, 2, 0).squeeze(0)
    print(f"[HeartMuLa] Decoding {len(frames)} frames to audio...")
    with torch.no_grad():
        wav = codec.detokenize(frames_tensor)

    return wav


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize models on startup."""
    print(f"[HeartMuLa] Starting server on {HOST}:{PORT}")
    print(f"[HeartMuLa] Device: {DEVICE}:{DEVICE_ID}")
    print(f"[HeartMuLa] FP8 Quantization: {USE_FP8}")
    print(f"[HeartMuLa] Output directory: {OUTPUT_DIR}")

    # Pre-load models
    try:
        load_models()
    except Exception as e:
        print(f"[HeartMuLa] Warning: Failed to pre-load models: {e}")

    yield

    # Cleanup
    print("[HeartMuLa] Shutting down...")
    global model, codec
    model = None
    codec = None
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


app = FastAPI(
    title="HeartMuLa Music Generation Server",
    description="Local music generation server using HeartMuLa",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class MusicGenRequest(BaseModel):
    """Request body for music generation."""
    prompt: str = Field(..., description="Music tags (e.g., 'piano,happy,romantic')")
    lyrics: str = Field(default="", description="Song lyrics")
    duration: float = Field(default=60.0, ge=10.0, le=240.0, description="Max duration in seconds")
    temperature: float = Field(default=1.0, ge=0.1, le=2.0, description="Sampling temperature")
    topk: int = Field(default=50, ge=1, le=500, description="Top-k sampling")
    cfg_scale: float = Field(default=1.5, ge=1.0, le=10.0, description="Classifier-free guidance scale")
    seed: Optional[int] = Field(default=None, description="Random seed")


class MusicGenResponse(BaseModel):
    """Response from music generation."""
    success: bool
    audio_path: str
    duration_seconds: float
    sample_rate: int
    message: Optional[str] = None


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "HeartMuLa Music Generation Server",
        "device": f"{DEVICE}:{DEVICE_ID}",
        "fp8": USE_FP8,
        "cuda_available": torch.cuda.is_available()
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy", "device": f"{DEVICE}:{DEVICE_ID}"}


@app.post("/generate", response_model=MusicGenResponse)
async def api_generate_music(request: MusicGenRequest):
    """Generate music from tags and lyrics."""
    if not request.prompt or not request.prompt.strip():
        raise HTTPException(status_code=400, detail="Prompt (tags) is required")

    # Set seed
    if request.seed is not None:
        torch.manual_seed(request.seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed(request.seed)

    print(f"[HeartMuLa] Generating: tags='{request.prompt[:50]}', max_duration={request.duration}s")

    try:
        wav = generate_music(
            tags=request.prompt,
            lyrics=request.lyrics or "la la la",
            max_duration_ms=int(request.duration * 1000),
            temperature=request.temperature,
            topk=request.topk,
            cfg_scale=request.cfg_scale,
        )

        # Save output
        output_filename = f"heartmula_{uuid.uuid4().hex}.wav"
        output_path = os.path.join(OUTPUT_DIR, output_filename)

        import soundfile as sf

        # Convert to numpy (samples, channels)
        wav_numpy = wav.cpu().numpy().T
        actual_duration = wav.shape[1] / 48000

        sf.write(output_path, wav_numpy, 48000)
        print(f"[HeartMuLa] Generated: {output_path} ({actual_duration:.1f}s)")

        return MusicGenResponse(
            success=True,
            audio_path=output_path,
            duration_seconds=actual_duration,
            sample_rate=48000,
            message=f"Generated {actual_duration:.1f}s of music"
        )
    except Exception as e:
        print(f"[HeartMuLa] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/generate/file")
async def generate_music_file(request: MusicGenRequest):
    """Generate music and return the audio file directly."""
    result = await api_generate_music(request)
    if not os.path.exists(result.audio_path):
        raise HTTPException(status_code=500, detail="Generated file not found")
    return FileResponse(
        result.audio_path,
        media_type="audio/wav",
        filename=os.path.basename(result.audio_path)
    )


@app.get("/info")
async def model_info():
    """Get model information."""
    return {
        "model": "HeartMuLa-oss-3B",
        "quantization": "float8_e4m3fn" if USE_FP8 else "none",
        "capabilities": ["text-to-music", "lyrics-to-music"],
        "max_duration_seconds": 240,
        "default_sample_rate": 48000,
        "supported_tags": [
            "piano", "guitar", "drums", "bass", "synthesizer",
            "happy", "sad", "energetic", "calm", "romantic",
            "pop", "rock", "electronic", "jazz", "classical"
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT)
