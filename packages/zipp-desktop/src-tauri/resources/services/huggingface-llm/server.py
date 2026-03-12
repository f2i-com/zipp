"""
HuggingFace LLM Service for Zipp

FastAPI server that loads any HuggingFace text generation model (including vision/multimodal)
and provides an OpenAI-compatible chat completions API.
"""

import os
import gc
import io
import sys
import json
import time
import base64
import logging
import asyncio
import uuid
from threading import Thread
from typing import Optional, List, Dict, Any, AsyncGenerator

import torch
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from PIL import Image

load_dotenv()

# =============================================================================
# CONFIG
# =============================================================================

HOST = os.getenv("HF_LLM_HOST", "127.0.0.1")
PORT = int(os.getenv("ZIPP_SERVICE_PORT", os.getenv("HF_LLM_PORT", "8774")))
DEFAULT_MODEL = os.getenv("HF_LLM_DEFAULT_MODEL", "Qwen/Qwen3.5-9B")
QUANTIZE = os.getenv("HF_LLM_QUANTIZE", "none").lower()
MAX_NEW_TOKENS_DEFAULT = int(os.getenv("HF_LLM_MAX_NEW_TOKENS", "2048"))
HF_TOKEN = os.getenv("HF_TOKEN", None)

# Auto-detect device
_device_env = os.getenv("HF_LLM_DEVICE", "").lower()
if _device_env:
    DEVICE = _device_env
elif torch.cuda.is_available():
    DEVICE = "cuda"
elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
    DEVICE = "mps"
else:
    DEVICE = "cpu"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("hf-llm")

# Check for llama-cpp-python (fast GGUF inference)
LLAMA_CPP_AVAILABLE = False
try:
    from llama_cpp import Llama
    LLAMA_CPP_AVAILABLE = True
    logger.info("llama-cpp-python available for fast GGUF inference")
except ImportError:
    pass

# Detect best attention implementation
def _detect_attn_implementation() -> str:
    """Detect the best available attention implementation."""
    if DEVICE != "cuda":
        return "eager"
    try:
        import flash_attn  # noqa: F401
        logger.info(f"Flash Attention {flash_attn.__version__} available")
        return "flash_attention_2"
    except ImportError:
        pass
    # SDPA (PyTorch native scaled dot-product attention) is fast and always available
    logger.info("Using PyTorch SDPA attention (flash-attn not installed)")
    return "sdpa"

ATTN_IMPL = _detect_attn_implementation()

# Enable CUDA optimizations
if DEVICE == "cuda":
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    if hasattr(torch.backends.cuda, "enable_flash_sdp"):
        torch.backends.cuda.enable_flash_sdp(True)
    if hasattr(torch.backends.cuda, "enable_mem_efficient_sdp"):
        torch.backends.cuda.enable_mem_efficient_sdp(True)

# Known vision model types
VISION_MODEL_TYPES = {
    "qwen2_vl", "qwen2_5_vl", "llava", "llava_next", "llava_onevision",
    "phi3_v", "mllama", "internvl_chat", "minicpmv", "idefics2",
    "paligemma", "chameleon", "pixtral",
}


# =============================================================================
# REQUEST/RESPONSE MODELS
# =============================================================================

class ChatMessage(BaseModel):
    role: str
    content: Any  # str or list of content parts (for vision)

class ChatCompletionRequest(BaseModel):
    model: Optional[str] = None
    messages: List[ChatMessage]
    stream: bool = False
    temperature: float = 0.7
    top_p: float = 0.9
    max_tokens: Optional[int] = None
    stop: Optional[List[str]] = None
    seed: Optional[int] = None
    enable_thinking: bool = False

class ModelLoadRequest(BaseModel):
    model: str
    quantize: Optional[str] = None


# =============================================================================
# MODEL MANAGER
# =============================================================================

class ModelManager:
    def __init__(self):
        self.model = None
        self.tokenizer = None
        self.processor = None
        self.model_name: Optional[str] = None
        self.is_vision: bool = False
        self._backend: str = "transformers"  # "transformers" or "llamacpp"
        self.lock = asyncio.Lock()
        self._loading: bool = False

    @property
    def is_loaded(self) -> bool:
        return self.model is not None

    def unload(self):
        if self.model is not None:
            del self.model
            self.model = None
        if self.tokenizer is not None:
            del self.tokenizer
            self.tokenizer = None
        if self.processor is not None:
            del self.processor
            self.processor = None
        self.model_name = None
        self.is_vision = False
        self._backend = "transformers"
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    @staticmethod
    def _parse_gguf(model_name: str):
        """If model_name is a .gguf reference, return (repo_or_dir, filename). Else None."""
        if not model_name.lower().endswith(".gguf"):
            return None
        # Local file: C:/models/model.gguf
        if os.path.isfile(model_name):
            return os.path.dirname(os.path.abspath(model_name)), os.path.basename(model_name)
        # HuggingFace Hub: org/repo/file.gguf
        parts = model_name.split("/")
        if len(parts) >= 3:
            return "/".join(parts[:-1]), parts[-1]
        return None

    def load_model(self, model_name: str, quantize: str = QUANTIZE):
        if self.model_name == model_name and self.model is not None:
            logger.info(f"Model {model_name} already loaded")
            return

        self._loading = True
        logger.info(f"Loading model: {model_name} (quantize={quantize}, device={DEVICE})")

        self.unload()

        # Check if GGUF
        gguf_info = self._parse_gguf(model_name)
        if gguf_info:
            repo_or_dir, gguf_file = gguf_info
            if LLAMA_CPP_AVAILABLE:
                try:
                    logger.info(f"Loading GGUF via llama-cpp-python: {repo_or_dir} / {gguf_file}")
                    self._load_llamacpp(repo_or_dir, gguf_file)
                except Exception as e:
                    logger.warning(f"llama-cpp-python failed: {e}")
                    logger.info("Falling back to transformers backend for GGUF")
                    self.unload()
                    self._load_transformers(repo_or_dir, "none", gguf_file=gguf_file)
            else:
                logger.info(f"Loading GGUF via transformers: {repo_or_dir} / {gguf_file}")
                self._load_transformers(repo_or_dir, "none", gguf_file=gguf_file)
        else:
            self._load_transformers(model_name, quantize)

        self.model_name = model_name
        self._loading = False
        # Re-enable hub access for future model swaps
        os.environ.pop("HF_HUB_OFFLINE", None)
        os.environ.pop("TRANSFORMERS_OFFLINE", None)
        try:
            import huggingface_hub.constants as hf_constants
            hf_constants.HF_HUB_OFFLINE = False
        except Exception:
            pass

        # Report model memory usage
        if self._backend == "llamacpp":
            logger.info("Model loaded (llama-cpp-python backend).")
        elif torch.cuda.is_available():
            try:
                param_bytes = sum(
                    p.nelement() * p.element_size() for p in self.model.parameters()
                )
                buffer_bytes = sum(
                    b.nelement() * b.element_size() for b in self.model.buffers()
                )
                model_gb = (param_bytes + buffer_bytes) / 1024**3
                logger.info(f"Model loaded. Estimated size: {model_gb:.1f} GB")
            except Exception:
                logger.info("Model loaded.")
        else:
            logger.info("Model loaded.")

    @staticmethod
    def _is_cached_locally(model_name: str) -> bool:
        """Check if a model is already cached in the HuggingFace cache directory."""
        if os.path.isdir(model_name):
            return True  # Local directory path
        try:
            from huggingface_hub import try_to_load_from_cache
            # Check if config.json exists in cache (a reliable indicator)
            result = try_to_load_from_cache(model_name, "config.json")
            return result is not None and isinstance(result, str)
        except Exception:
            return False

    def _load_llamacpp(self, repo_or_dir: str, gguf_file: str):
        """Load a GGUF model via llama-cpp-python for fast inference."""
        # Resolve the GGUF file path
        local_path = os.path.join(repo_or_dir, gguf_file) if os.path.isdir(repo_or_dir) else None
        if local_path and os.path.isfile(local_path):
            model_path = local_path
        else:
            from huggingface_hub import hf_hub_download
            logger.info(f"Resolving GGUF from HuggingFace Hub: {repo_or_dir}/{gguf_file}")
            model_path = hf_hub_download(repo_or_dir, gguf_file, token=HF_TOKEN)

        logger.info(f"Loading GGUF: {model_path}")
        n_gpu = -1 if DEVICE in ("cuda", "mps") else 0
        self.model = Llama(
            model_path=model_path,
            n_gpu_layers=n_gpu,
            n_ctx=4096,
            verbose=False,
        )
        self.tokenizer = None
        self.processor = None
        self.is_vision = False
        self._backend = "llamacpp"

    def _load_transformers(self, model_name: str, quantize: str, gguf_file: str = None):
        """Load a model via HuggingFace transformers (safetensors, GGUF, local dir, or HF hub)."""
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            AutoProcessor,
            AutoConfig,
            BitsAndBytesConfig,
        )

        gguf_kwargs = {"gguf_file": gguf_file} if gguf_file else {}

        # Check if model is cached locally to avoid network requests
        is_local = os.path.isdir(model_name) or (not gguf_file and self._is_cached_locally(model_name))
        if is_local:
            logger.info(f"Model found in local cache, loading offline")
            os.environ["HF_HUB_OFFLINE"] = "1"
            os.environ["TRANSFORMERS_OFFLINE"] = "1"
            # Also patch huggingface_hub's runtime constant
            try:
                import huggingface_hub.constants as hf_constants
                hf_constants.HF_HUB_OFFLINE = True
            except Exception:
                pass
        local_kwargs = {"local_files_only": True} if is_local else {}

        # Detect vision model from config (skip for GGUF)
        if gguf_file:
            self.is_vision = False
        else:
            try:
                config = AutoConfig.from_pretrained(
                    model_name, trust_remote_code=True, token=HF_TOKEN, **local_kwargs
                )
                model_type = getattr(config, "model_type", "")
                self.is_vision = model_type in VISION_MODEL_TYPES
            except Exception as e:
                if is_local:
                    # Retry without local_files_only
                    logger.info(f"Local cache incomplete, fetching from hub")
                    local_kwargs = {}
                    os.environ.pop("HF_HUB_OFFLINE", None)
                    os.environ.pop("TRANSFORMERS_OFFLINE", None)
                    try:
                        import huggingface_hub.constants as hf_constants
                        hf_constants.HF_HUB_OFFLINE = False
                    except Exception:
                        pass
                    try:
                        config = AutoConfig.from_pretrained(
                            model_name, trust_remote_code=True, token=HF_TOKEN
                        )
                        model_type = getattr(config, "model_type", "")
                        self.is_vision = model_type in VISION_MODEL_TYPES
                    except Exception as e2:
                        logger.warning(f"Could not load config for vision detection: {e2}")
                        self.is_vision = False
                else:
                    logger.warning(f"Could not load config for vision detection: {e}")
                    self.is_vision = False

        # Load tokenizer / processor
        if self.is_vision:
            logger.info(f"Detected vision model (type={model_type})")
            self.processor = AutoProcessor.from_pretrained(
                model_name, trust_remote_code=True, token=HF_TOKEN, **local_kwargs
            )
            self.tokenizer = getattr(self.processor, "tokenizer", self.processor)
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name, trust_remote_code=True, token=HF_TOKEN, **local_kwargs, **gguf_kwargs
            )

        # Build quantization config
        quant_config = None
        if DEVICE == "cuda" and quantize == "4bit":
            try:
                # Use bfloat16 compute dtype on Ampere+ GPUs (SM >= 8.0) for better perf
                compute_dtype = torch.bfloat16
                if torch.cuda.is_available():
                    cap = torch.cuda.get_device_capability()
                    if cap[0] < 8:
                        compute_dtype = torch.float16
                quant_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=compute_dtype,
                    bnb_4bit_use_double_quant=True,
                    bnb_4bit_quant_type="nf4",
                )
                logger.info("Using 4-bit quantization (nf4)")
            except Exception as e:
                logger.warning(f"4-bit quantization unavailable: {e}")
        elif DEVICE == "cuda" and quantize == "8bit":
            try:
                quant_config = BitsAndBytesConfig(load_in_8bit=True)
                logger.info("Using 8-bit quantization")
            except Exception as e:
                logger.warning(f"8-bit quantization unavailable: {e}")

        # Load model
        load_kwargs = {
            "trust_remote_code": True,
            "token": HF_TOKEN,
        }
        load_kwargs.update(local_kwargs)
        if quant_config:
            load_kwargs["quantization_config"] = quant_config
            load_kwargs["device_map"] = {"": DEVICE}
        elif DEVICE == "cuda":
            load_kwargs["torch_dtype"] = torch.float16
            load_kwargs["device_map"] = {"": DEVICE}
        elif DEVICE == "mps":
            load_kwargs["torch_dtype"] = torch.float16
        else:
            load_kwargs["torch_dtype"] = torch.float32

        load_kwargs.update(gguf_kwargs)

        # Use best available attention implementation
        if ATTN_IMPL != "eager":
            load_kwargs["attn_implementation"] = ATTN_IMPL
            logger.info(f"Using attention: {ATTN_IMPL}")

        try:
            self.model = AutoModelForCausalLM.from_pretrained(model_name, **load_kwargs)
        except OSError:
            if is_local:
                # Cache might be incomplete, retry with network
                logger.info("Local cache incomplete for model weights, fetching from hub")
                load_kwargs.pop("local_files_only", None)
                os.environ.pop("HF_HUB_OFFLINE", None)
                self.model = AutoModelForCausalLM.from_pretrained(model_name, **load_kwargs)
            else:
                raise
        except (ValueError, TypeError):
            if gguf_file:
                raise  # GGUF models are always causal LM
            from transformers import AutoModelForVision2Seq
            logger.info("Falling back to AutoModelForVision2Seq")
            self.model = AutoModelForVision2Seq.from_pretrained(model_name, **load_kwargs)
            self.is_vision = True
            if self.processor is None:
                self.processor = AutoProcessor.from_pretrained(
                    model_name, trust_remote_code=True, token=HF_TOKEN, **local_kwargs
                )
                self.tokenizer = getattr(self.processor, "tokenizer", self.processor)

        if "device_map" not in load_kwargs and DEVICE != "cpu":
            self.model = self.model.to(DEVICE)

        self.model.eval()

    def _get_device(self):
        if hasattr(self.model, "device"):
            return self.model.device
        if hasattr(self.model, "hf_device_map"):
            return "cuda"
        return DEVICE

    def generate_sync(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: Optional[int] = None,
        stop: Optional[List[str]] = None,
        seed: Optional[int] = None,
        enable_thinking: bool = False,
    ) -> tuple:
        """Synchronous generation. Returns (text, prompt_tokens, completion_tokens)."""
        max_new = max_tokens or MAX_NEW_TOKENS_DEFAULT

        # llama-cpp-python backend
        if self._backend == "llamacpp":
            t0 = time.time()
            kwargs = {
                "messages": messages,
                "max_tokens": max_new,
                "temperature": max(temperature, 0.01) if temperature > 0 else 0,
                "top_p": top_p,
            }
            if stop:
                kwargs["stop"] = stop
            if seed is not None:
                kwargs["seed"] = seed
            response = self.model.create_chat_completion(**kwargs)
            text = response["choices"][0]["message"]["content"]
            usage = response.get("usage", {})
            prompt_tokens = usage.get("prompt_tokens", 0)
            completion_tokens = usage.get("completion_tokens", 0)
            elapsed = time.time() - t0
            tok_per_sec = completion_tokens / elapsed if elapsed > 0 else 0
            logger.info(f"Generated {completion_tokens} tokens in {elapsed:.1f}s ({tok_per_sec:.1f} tok/s)")
            return text, prompt_tokens, completion_tokens

        inputs, images = self._prepare_inputs(messages, enable_thinking=enable_thinking)

        gen_kwargs = {
            "max_new_tokens": max_new,
            "do_sample": temperature > 0,
            "temperature": max(temperature, 0.01),
            "top_p": top_p,
        }
        if seed is not None:
            gen_kwargs["seed"] = seed

        t0 = time.time()
        with torch.inference_mode():
            if self.is_vision and self.processor and images:
                text_input = self.processor.apply_chat_template(
                    messages, tokenize=False, add_generation_prompt=True,
                    enable_thinking=enable_thinking,
                )
                model_inputs = self.processor(
                    text=text_input, images=images, return_tensors="pt"
                )
                device = self._get_device()
                model_inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in model_inputs.items()}
                prompt_len = model_inputs.get("input_ids", torch.tensor([])).shape[-1]
                output_ids = self.model.generate(**model_inputs, **gen_kwargs)
            else:
                prompt_len = inputs["input_ids"].shape[-1]
                output_ids = self.model.generate(**inputs, **gen_kwargs)

        new_tokens = output_ids[0][prompt_len:]
        elapsed = time.time() - t0
        tok_per_sec = len(new_tokens) / elapsed if elapsed > 0 else 0
        logger.info(f"Generated {len(new_tokens)} tokens in {elapsed:.1f}s ({tok_per_sec:.1f} tok/s)")
        text = self.tokenizer.decode(new_tokens, skip_special_tokens=True)

        return text, prompt_len, len(new_tokens)

    def generate_stream_sync(
        self,
        messages: List[Dict],
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: Optional[int] = None,
        stop: Optional[List[str]] = None,
        seed: Optional[int] = None,
        enable_thinking: bool = False,
    ):
        """Synchronous streaming generation. Yields text chunks."""
        max_new = max_tokens or MAX_NEW_TOKENS_DEFAULT

        # llama-cpp-python backend
        if self._backend == "llamacpp":
            kwargs = {
                "messages": messages,
                "max_tokens": max_new,
                "temperature": max(temperature, 0.01) if temperature > 0 else 0,
                "top_p": top_p,
                "stream": True,
            }
            if stop:
                kwargs["stop"] = stop
            if seed is not None:
                kwargs["seed"] = seed
            for chunk in self.model.create_chat_completion(**kwargs):
                delta = chunk.get("choices", [{}])[0].get("delta", {})
                content = delta.get("content", "")
                if content:
                    yield content
            return

        from transformers import TextIteratorStreamer

        inputs, images = self._prepare_inputs(messages, enable_thinking=enable_thinking)

        streamer = TextIteratorStreamer(
            self.tokenizer, skip_prompt=True, skip_special_tokens=True
        )

        gen_kwargs = {
            "max_new_tokens": max_new,
            "do_sample": temperature > 0,
            "temperature": max(temperature, 0.01),
            "top_p": top_p,
            "streamer": streamer,
        }
        if seed is not None:
            gen_kwargs["seed"] = seed

        if self.is_vision and self.processor and images:
            text_input = self.processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=True,
                enable_thinking=enable_thinking,
            )
            model_inputs = self.processor(
                text=text_input, images=images, return_tensors="pt"
            )
            device = self._get_device()
            model_inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in model_inputs.items()}
            gen_kwargs.update(model_inputs)
        else:
            gen_kwargs.update(inputs)

        thread = Thread(target=self.model.generate, kwargs=gen_kwargs)
        thread.start()

        for text in streamer:
            if text:
                yield text

        thread.join()

    def _prepare_inputs(self, messages: List[Dict], enable_thinking: bool = False) -> tuple:
        """Prepare model inputs from chat messages. Returns (inputs_dict, images_list)."""
        images = []

        # Extract images from multimodal messages
        hf_messages = []
        for msg in messages:
            content = msg.get("content", msg.get("content", ""))
            if isinstance(content, list):
                parts = []
                for part in content:
                    if isinstance(part, dict):
                        if part.get("type") == "text":
                            parts.append({"type": "text", "text": part.get("text", "")})
                        elif part.get("type") == "image_url":
                            img = self._load_image(part.get("image_url", {}))
                            if img:
                                images.append(img)
                                parts.append({"type": "image", "image": img})
                    elif isinstance(part, str):
                        parts.append({"type": "text", "text": part})
                hf_messages.append({"role": msg.get("role", "user"), "content": parts})
            else:
                hf_messages.append({"role": msg.get("role", "user"), "content": str(content)})

        # For vision models with images, return hf_messages for processor handling
        if self.is_vision and images:
            return {}, images

        # For text-only: apply chat template and tokenize
        try:
            text = self.tokenizer.apply_chat_template(
                hf_messages, tokenize=False, add_generation_prompt=True,
                enable_thinking=enable_thinking,
            )
        except Exception:
            # Fallback: manual prompt construction
            text = ""
            for msg in hf_messages:
                role = msg["role"]
                content = msg["content"]
                if isinstance(content, list):
                    content = " ".join(
                        p.get("text", "") for p in content if isinstance(p, dict) and p.get("type") == "text"
                    )
                text += f"<|{role}|>\n{content}\n"
            text += "<|assistant|>\n"

        inputs = self.tokenizer(text, return_tensors="pt")
        device = self._get_device()
        inputs = {k: v.to(device) for k, v in inputs.items()}
        return inputs, images

    def _load_image(self, image_url_obj) -> Optional[Image.Image]:
        """Load an image from a URL or base64 data URL."""
        url = image_url_obj if isinstance(image_url_obj, str) else image_url_obj.get("url", "")
        try:
            if url.startswith("data:"):
                # Base64 data URL
                _, b64data = url.split(",", 1)
                img_bytes = base64.b64decode(b64data)
                return Image.open(io.BytesIO(img_bytes)).convert("RGB")
            elif url.startswith("http"):
                # Download from URL
                resp = httpx.get(url, timeout=30, follow_redirects=True)
                resp.raise_for_status()
                return Image.open(io.BytesIO(resp.content)).convert("RGB")
        except Exception as e:
            logger.warning(f"Failed to load image: {e}")
        return None


# =============================================================================
# GLOBAL STATE
# =============================================================================

manager = ModelManager()


# =============================================================================
# LIFESPAN
# =============================================================================

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"HuggingFace LLM server starting on {HOST}:{PORT}")
    logger.info(f"Device: {DEVICE}, Quantization: {QUANTIZE}")
    # Load model in background so server accepts connections immediately
    if DEFAULT_MODEL:
        async def _bg_load():
            logger.info(f"Loading default model: {DEFAULT_MODEL}")
            try:
                await asyncio.to_thread(manager.load_model, DEFAULT_MODEL, QUANTIZE)
                logger.info("Default model ready!")
            except Exception as e:
                logger.error(f"Failed to load default model: {e}")
        asyncio.create_task(_bg_load())
    yield
    logger.info("Shutting down, unloading model...")
    manager.unload()


# =============================================================================
# FASTAPI APP
# =============================================================================

app = FastAPI(title="HuggingFace LLM", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# ENDPOINTS
# =============================================================================

@app.get("/")
async def root():
    return {
        "service": "HuggingFace LLM",
        "version": "1.0.0",
        "status": "running",
        "model": manager.model_name,
        "device": DEVICE,
        "vision": manager.is_vision,
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "model": manager.model_name,
        "model_loaded": manager.is_loaded,
        "device": DEVICE,
        "quantization": QUANTIZE,
        "vision": manager.is_vision,
    }


@app.get("/v1/models")
async def list_models():
    models = []
    if manager.model_name:
        models.append({
            "id": manager.model_name,
            "object": "model",
            "created": int(time.time()),
            "owned_by": "huggingface",
        })
    return {"object": "list", "data": models}


@app.post("/v1/models/load")
async def load_model(req: ModelLoadRequest):
    quantize = req.quantize or QUANTIZE
    async with manager.lock:
        try:
            await asyncio.to_thread(manager.load_model, req.model, quantize)
        except Exception as e:
            raise HTTPException(500, f"Failed to load model: {e}")
    return {
        "status": "loaded",
        "model": manager.model_name,
        "vision": manager.is_vision,
        "device": DEVICE,
    }


@app.post("/v1/chat/completions")
async def chat_completions(req: ChatCompletionRequest):
    requested_model = req.model or DEFAULT_MODEL

    if not manager.is_loaded:
        if manager._loading:
            raise HTTPException(503, "Model is still loading. Please wait.")
        # Auto-load requested model
        async with manager.lock:
            try:
                await asyncio.to_thread(manager.load_model, requested_model, QUANTIZE)
            except Exception as e:
                raise HTTPException(500, f"Failed to load model {requested_model}: {e}")

    # Switch model if different
    if requested_model != manager.model_name and requested_model != DEFAULT_MODEL:
        async with manager.lock:
            try:
                await asyncio.to_thread(manager.load_model, requested_model, QUANTIZE)
            except Exception as e:
                raise HTTPException(500, f"Failed to switch to model {requested_model}: {e}")

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    if req.stream:
        return StreamingResponse(
            _stream_response(messages, req, requested_model, req.enable_thinking),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Non-streaming
    async with manager.lock:
        try:
            text, prompt_tokens, completion_tokens = await asyncio.to_thread(
                manager.generate_sync,
                messages,
                req.temperature,
                req.top_p,
                req.max_tokens,
                req.stop,
                req.seed,
                req.enable_thinking,
            )
        except Exception as e:
            logger.error(f"Generation failed: {e}")
            raise HTTPException(500, f"Generation failed: {e}")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:8]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": manager.model_name,
        "choices": [{
            "index": 0,
            "message": {"role": "assistant", "content": text},
            "finish_reason": "stop",
        }],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": prompt_tokens + completion_tokens,
        },
    }


async def _stream_response(
    messages: List[Dict],
    req: ChatCompletionRequest,
    model_name: str,
    enable_thinking: bool = False,
) -> AsyncGenerator[str, None]:
    """Stream SSE chunks in OpenAI format."""
    chat_id = f"chatcmpl-{uuid.uuid4().hex[:8]}"
    created = int(time.time())

    # Role chunk
    role_chunk = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model_name,
        "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}],
    }
    yield f"data: {json.dumps(role_chunk)}\n\n"

    # Stream content chunks
    import queue
    text_queue: queue.Queue = queue.Queue()
    error_holder = [None]

    def _generate():
        try:
            for chunk in manager.generate_stream_sync(
                messages,
                req.temperature,
                req.top_p,
                req.max_tokens,
                req.stop,
                req.seed,
                enable_thinking,
            ):
                text_queue.put(chunk)
        except Exception as e:
            error_holder[0] = e
        finally:
            text_queue.put(None)  # Sentinel

    async with manager.lock:
        thread = Thread(target=_generate, daemon=True)
        thread.start()

        while True:
            item = await asyncio.to_thread(text_queue.get)
            if item is None:
                break
            chunk = {
                "id": chat_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": model_name,
                "choices": [{"index": 0, "delta": {"content": item}, "finish_reason": None}],
            }
            yield f"data: {json.dumps(chunk)}\n\n"

        thread.join()

    if error_holder[0]:
        logger.error(f"Stream generation error: {error_holder[0]}")

    # Final chunk
    final_chunk = {
        "id": chat_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model_name,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(final_chunk)}\n\n"
    yield "data: [DONE]\n\n"


# =============================================================================
# MAIN
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
