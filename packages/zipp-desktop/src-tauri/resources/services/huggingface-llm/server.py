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
QUANTIZE = os.getenv("HF_LLM_QUANTIZE", "4bit").lower()
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

        # Check if GGUF — loaded via transformers gguf_file param
        gguf_info = self._parse_gguf(model_name)
        if gguf_info:
            repo_or_dir, gguf_file = gguf_info
            logger.info(f"Loading GGUF via transformers: {repo_or_dir} / {gguf_file}")
            # Skip bitsandbytes for GGUF (already quantized, dequantized to fp16 by transformers)
            self._load_transformers(repo_or_dir, "none", gguf_file=gguf_file)
        else:
            self._load_transformers(model_name, quantize)

        self.model_name = model_name
        self._loading = False

        if torch.cuda.is_available():
            mem = torch.cuda.memory_allocated() / 1024**3
            logger.info(f"Model loaded. VRAM usage: {mem:.1f} GB")
        else:
            logger.info("Model loaded.")

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

        # Detect vision model from config (skip for GGUF)
        if gguf_file:
            self.is_vision = False
        else:
            try:
                config = AutoConfig.from_pretrained(
                    model_name, trust_remote_code=True, token=HF_TOKEN
                )
                model_type = getattr(config, "model_type", "")
                self.is_vision = model_type in VISION_MODEL_TYPES
            except Exception as e:
                logger.warning(f"Could not load config for vision detection: {e}")
                self.is_vision = False

        # Load tokenizer / processor
        if self.is_vision:
            logger.info(f"Detected vision model (type={model_type})")
            self.processor = AutoProcessor.from_pretrained(
                model_name, trust_remote_code=True, token=HF_TOKEN
            )
            self.tokenizer = getattr(self.processor, "tokenizer", self.processor)
        else:
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name, trust_remote_code=True, token=HF_TOKEN, **gguf_kwargs
            )

        # Build quantization config
        quant_config = None
        if DEVICE == "cuda" and quantize == "4bit":
            try:
                quant_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
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
        if quant_config:
            load_kwargs["quantization_config"] = quant_config
            load_kwargs["device_map"] = "auto"
        elif DEVICE == "cuda":
            load_kwargs["device_map"] = "auto"
            load_kwargs["torch_dtype"] = torch.float16
        elif DEVICE == "mps":
            load_kwargs["torch_dtype"] = torch.float16
        else:
            load_kwargs["torch_dtype"] = torch.float32

        load_kwargs.update(gguf_kwargs)

        try:
            self.model = AutoModelForCausalLM.from_pretrained(model_name, **load_kwargs)
        except (ValueError, TypeError):
            if gguf_file:
                raise  # GGUF models are always causal LM
            from transformers import AutoModelForVision2Seq
            logger.info("Falling back to AutoModelForVision2Seq")
            self.model = AutoModelForVision2Seq.from_pretrained(model_name, **load_kwargs)
            self.is_vision = True
            if self.processor is None:
                self.processor = AutoProcessor.from_pretrained(
                    model_name, trust_remote_code=True, token=HF_TOKEN
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

        inputs, images = self._prepare_inputs(messages, enable_thinking=enable_thinking)

        gen_kwargs = {
            "max_new_tokens": max_new,
            "do_sample": temperature > 0,
            "temperature": max(temperature, 0.01),
            "top_p": top_p,
        }
        if seed is not None:
            gen_kwargs["seed"] = seed

        with torch.no_grad():
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
