from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile

import httpx

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    LLM_PROVIDER,
    MAX_VIDEO_FRAMES,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_LLM_MODEL,
    VIDEO_FRAME_WIDTH,
    VIDEO_MODEL,
    VISION_PROVIDER,
    VLLM_BASE_URL,
    VLLM_MODEL,
)
from prompts import (
    ANSWER_SYSTEM_PROMPT,
    REPORT_SYSTEM_PROMPT,
    VIDEO_ANALYSIS_PROMPT,
    VIDEO_METADATA_PROMPT,
)


class APIError(Exception):
    """Raised when an LLM/Vision API returns an error."""


# ---------------------------------------------------------------------------
#  LLM client (text generation)
# ---------------------------------------------------------------------------

def _llm_config() -> tuple[str, str, str]:
    """Return (base_url, api_key, model) for text generation."""
    if LLM_PROVIDER == "deepseek":
        return DEEPSEEK_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_MODEL
    return OPENAI_BASE_URL, OPENAI_API_KEY, OPENAI_LLM_MODEL


async def _llm_chat(
    messages: list[dict],
    *,
    temperature: float = 0.8,
    max_tokens: int = 4096,
    response_format: dict | None = None,
) -> dict:
    """Send a chat completion request to the text LLM provider."""
    base_url, api_key, model = _llm_config()
    headers = {"Authorization": f"Bearer {api_key}"} if api_key else {}
    payload: dict = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if response_format is not None:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as cli:
        resp = await cli.post(
            f"{base_url}/chat/completions",
            headers=headers,
            json=payload,
        )
        if resp.status_code != 200:
            raise APIError(f"LLM error ({resp.status_code}): {resp.text[:500]}")
        return resp.json()


def _extract_content(api_response: dict) -> str:
    try:
        return api_response["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as e:
        raise APIError(f"Unexpected response structure: {e}") from e


# ---------------------------------------------------------------------------
#  Vision client (video understanding)
# ---------------------------------------------------------------------------

def _extract_video_frames(file_path: str, max_frames: int = MAX_VIDEO_FRAMES) -> list[str]:
    """Extract frames as base64 data-URL strings. Returns empty list on failure."""
    tmpdir = tempfile.mkdtemp(prefix="frames_")
    try:
        duration_s = 5.0
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", file_path],
            capture_output=True, text=True, timeout=15,
        )
        if probe.returncode == 0:
            info = json.loads(probe.stdout)
            duration_s = float(info.get("format", {}).get("duration", 5))

        fps = min(max_frames / max(duration_s, 1), 2.0)
        subprocess.run(
            [
                "ffmpeg", "-y", "-i", file_path,
                "-vf", f"fps={fps:.2f},scale={VIDEO_FRAME_WIDTH}:-2",
                "-frames:v", str(max_frames),
                "-qscale:v", "5",
                f"{tmpdir}/frame_%d.jpg",
            ],
            capture_output=True, timeout=30,
        )

        frames = []
        for name in sorted(os.listdir(tmpdir), key=lambda n: int(n.split("_")[1].split(".")[0]) if "_" in n else 0):
            path = os.path.join(tmpdir, name)
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode()
                frames.append(f"data:image/jpeg;base64,{b64}")
        return frames
    except Exception:
        return []
    finally:
        for name in os.listdir(tmpdir):
            try:
                os.remove(os.path.join(tmpdir, name))
            except OSError:
                pass
        try:
            os.rmdir(tmpdir)
        except OSError:
            pass


async def _analyze_video_vllm(file_path: str) -> str:
    """Extract frames and send to vLLM (Qwen3-VL) for visual understanding."""
    frames = _extract_video_frames(file_path)
    if not frames:
        raise APIError("Failed to extract video frames")

    content: list[dict] = []
    for fb in frames:
        content.append({"type": "image_url", "image_url": {"url": fb}})
    content.append({"type": "text", "text": VIDEO_ANALYSIS_PROMPT})

    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as cli:
        resp = await cli.post(
            f"{VLLM_BASE_URL}/chat/completions",
            json={
                "model": VLLM_MODEL,
                "messages": [{"role": "user", "content": content}],
                "temperature": 0.8,
                "max_tokens": 2048,
            },
        )
        if resp.status_code != 200:
            raise APIError(f"Vision error ({resp.status_code}): {resp.text[:500]}")
        return _extract_content(resp.json())


async def _upload_and_analyze_openai(file_path: str) -> str:
    """Upload video to OpenAI-Next and analyze with doubao."""
    async with httpx.AsyncClient(timeout=httpx.Timeout(300.0)) as cli:
        with open(file_path, "rb") as fh:
            upload_resp = await cli.post(
                f"{OPENAI_BASE_URL}/files",
                headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
                files={"file": (os.path.basename(file_path), fh, "video/mp4")},
                data={"purpose": "vision"},
            )
        if upload_resp.status_code != 200:
            raise APIError(f"File upload failed ({upload_resp.status_code}): {upload_resp.text}")
        file_id = upload_resp.json()["id"]

        chat_resp = await cli.post(
            f"{OPENAI_BASE_URL}/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": VIDEO_MODEL,
                "messages": [{
                    "role": "user",
                    "content": [
                        {"type": "file", "file": {"file_id": file_id}},
                        {"type": "text", "text": VIDEO_ANALYSIS_PROMPT},
                    ],
                }],
                "max_tokens": 2048,
            },
        )
        if chat_resp.status_code != 200:
            raise APIError(f"Video analysis failed ({chat_resp.status_code}): {chat_resp.text}")
        return _extract_content(chat_resp.json())


def _get_video_metadata(file_path: str) -> dict:
    """Fallback: extract technical metadata for text-only analysis."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", file_path],
            capture_output=True, text=True, timeout=15,
        )
        info = json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        return {"filename": os.path.basename(file_path), "duration": "未知", "resolution": "未知", "codec": "未知", "filesize": "未知"}

    fmt = info.get("format", {})
    streams = info.get("streams", [])
    video_stream = next((s for s in streams if s.get("codec_type") == "video"), {})

    duration_s = float(fmt.get("duration", 0))
    if duration_s >= 60:
        duration_str = f"{int(duration_s // 60)}分{int(duration_s % 60)}秒"
    else:
        duration_str = f"{int(duration_s)}秒"

    size_bytes = int(fmt.get("size", 0))
    if size_bytes > 1024 * 1024 * 1024:
        filesize_str = f"{size_bytes / (1024*1024*1024):.1f}GB"
    elif size_bytes > 1024 * 1024:
        filesize_str = f"{size_bytes / (1024*1024):.1f}MB"
    else:
        filesize_str = f"{size_bytes / 1024:.1f}KB"

    return {
        "filename": os.path.basename(file_path),
        "duration": duration_str,
        "resolution": f"{video_stream.get('width', '?')}x{video_stream.get('height', '?')}",
        "codec": video_stream.get("codec_name", fmt.get("format_name", "未知")),
        "filesize": filesize_str,
    }


# ---------------------------------------------------------------------------
#  Public API
# ---------------------------------------------------------------------------

async def analyze_video(file_path: str) -> str:
    """Analyze a video file. Uses vision model when available, metadata fallback otherwise."""
    if VISION_PROVIDER == "vllm":
        return await _analyze_video_vllm(file_path)
    elif VISION_PROVIDER == "doubao":
        return await _upload_and_analyze_openai(file_path)
    else:
        # Pure text fallback: metadata → LLM simulation
        meta = _get_video_metadata(file_path)
        prompt = VIDEO_METADATA_PROMPT.format(**meta)
        response = await _llm_chat(
            messages=[{"role": "user", "content": prompt}],
            temperature=0.9,
            max_tokens=2048,
        )
        return _extract_content(response)


async def generate_report(video_analysis: str) -> dict:
    """Generate a structured report JSON from video analysis text."""
    response = await _llm_chat(
        messages=[
            {"role": "system", "content": REPORT_SYSTEM_PROMPT},
            {"role": "user", "content": f"以下是对用户上传视频的分析结果：\n\n{video_analysis}\n\n请根据以上分析，生成完整的妖怪报告 JSON。"},
        ],
        temperature=0.9,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    raw = _extract_content(response)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise APIError(f"Failed to parse report JSON: {e}\nRaw response: {raw[:500]}") from e


async def generate_monster_answers(video_analysis: str, question: str) -> dict:
    """Generate five emotion monster answers for a given question."""
    user_msg = f"用户上传的视频分析结果：\n{video_analysis}\n\n用户提出的问题：{question}\n\n请用五只小妖怪的身份分别回答这个问题。"
    response = await _llm_chat(
        messages=[
            {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        temperature=0.9,
        max_tokens=2048,
        response_format={"type": "json_object"},
    )
    raw = _extract_content(response)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise APIError(f"Failed to parse answers JSON: {e}\nRaw response: {raw[:500]}") from e
