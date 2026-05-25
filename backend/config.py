from __future__ import annotations

import os

# -- LLM provider for text generation (reports, answers) --
LLM_PROVIDER = os.getenv("YAOYAO_LLM_PROVIDER", "deepseek")

# -- Vision provider for video understanding --
VISION_PROVIDER = os.getenv("YAOYAO_VISION_PROVIDER", "vllm")

# -- DeepSeek (text) --
DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1"
DEEPSEEK_API_KEY = os.getenv(
    "DEEPSEEK_API_KEY",
    "", # 请配置你的 API KEY
)
DEEPSEEK_MODEL = "deepseek-chat"

# -- vLLM / Qwen3-VL (vision) --
VLLM_BASE_URL = "http://localhost:8100/v1"
VLLM_MODEL = "/root/Qwen3-VL-32B-Instruct-FP8"

# -- OpenAI-Next (cloud, requires internet) --
OPENAI_BASE_URL = "https://api.openai-next.com/v1"
OPENAI_API_KEY = os.getenv("YAOYAO_API_KEY", "") # 请配置你的 API KEY
VIDEO_MODEL = "doubao-seed-2-0-lite-260215"
OPENAI_LLM_MODEL = "deepseek-v3.2"

# -- Temp file storage --
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")
MAX_VIDEO_SIZE_MB = 200
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/quicktime", "video/webm", "video/x-msvideo"}

# -- Video frame extraction --
MAX_VIDEO_FRAMES = 3  # max frames to send to vision model
VIDEO_FRAME_WIDTH = 300  # downscale frames to keep base64 within vLLM context window
