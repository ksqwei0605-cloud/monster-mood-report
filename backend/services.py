from __future__ import annotations

import json
import os
import random
import subprocess

import httpx

from config import (
    DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL,
    LLM_PROVIDER,
    OPENAI_API_KEY,
    OPENAI_BASE_URL,
    OPENAI_LLM_MODEL,
)
from prompts import (
    ANSWER_SYSTEM_PROMPT,
    REPORT_SYSTEM_PROMPT,
)

# ---------------------------------------------------------------------------
#  Predefined video-analysis templates — each matches one of the 3 demo videos
# ---------------------------------------------------------------------------
# Keys match the "source" field sent by the frontend demo buttons.

_DEMO_TEMPLATES: dict[str, str] = {
    "哈利波特": (
        "画面中，哈利波特和小天狼星布莱克在霍格沃茨的拱门走廊里相拥。"
        "温暖的魔法光芒环绕着他们，阳光透过古老的石柱洒落。"
        "小天狼星脸上带着释然和骄傲的微笑，哈利的眼神中充满了久别重逢的激动与释怀。"
        "他们的对话缓慢而深情，肢体语言透着彼此信任与依靠。"
        "整体氛围温馨、感人，带有一丝劫后余生的庆幸与感慨。"
        "这是一个关于和解、原谅与亲情的经典魔法时刻。"
        "画面中哈利略微颤抖的手和深吸一口气的细节，暗示着他内心深处仍然藏着对失去的恐惧，但此刻选择勇敢拥抱当下。"
    ),
    "小马": (
        "画面中，一个身穿深色西装、戴着马头头套的人站在红色幕布前。"
        "马头人姿态自信挺拔，用手势配合着富有节奏感的声音在发表讲话。"
        "幕布背景简洁正式，灯光聚拢在马头人身上，营造出一种庄严的舞台感。"
        "画面构图规整，镜头稳定，色调偏暖，给人一种既正式又荒诞的视觉冲击。"
        "马头人的肢体语言充满了自信与幽默，仿佛在发表一场重要的演讲。"
        "马头人偶尔用前蹄调整领带的细节、幕布被风轻轻吹动的瞬间，给整个场景增添了一丝戏剧张力和微妙的紧张。"
    ),
    "小妖怪": (
        "画面中，一只毛茸茸的可爱小妖怪开心地举着一张'今日小妖怪'的卡片。"
        "小妖怪蹦蹦跳跳，卡片上的字迹醒目而有趣，背景是明亮柔和的卡通色调。"
        "整体画面色彩丰富，紫色与粉色渐变的主调中点缀着金色星星光点。"
        "小妖怪的表情俏皮而灵动，时而眨眼睛，时而咧嘴大笑，充满童趣。"
        "氛围轻松愉快，传递出一种'你就是今天的专属小妖怪'的仪式感。"
        "小妖怪偶尔低头偷看卡片背后的内容、又迅速翻回来的小动作，流露出对未知结果的好奇和一丝小小的忐忑。"
    ),
}

# Fallback pool for user-uploaded (non-demo) videos — shuffled at import.
_FALLBACK_TEMPLATES = [
    "画面整体色调偏暖，光线柔和，镜头移动平缓。人物表情自然放松，偶尔露出微笑，眼神中带着一丝好奇。背景环境整洁有序，有绿色植物点缀，整体氛围温馨安宁。视频的节奏不快不慢，给人一种舒适惬意的感觉。画面中有细微的动作细节：手指轻敲桌面、脚尖微微晃动，透露出一点点小焦虑。",
    "画面色彩丰富鲜艳，光线明亮，镜头切换节奏轻快。人物面带笑容，动作活泼灵动，时而蹦跳时而摆手。背景中出现了一些色彩缤纷的装饰物，整体氛围欢快热闹。视频的节奏偏快，给人一种充满能量和活力的感觉。画面中偶尔出现短暂的停顿和思考的表情，暗示着一丝不确定。",
    "画面整体偏暗但色调柔和，光线从侧面打过来，营造出一种静谧的氛围。人物表情冷静沉稳，偶尔低头思考，偶尔抬眼凝视远方。背景简洁干净，暗色为主，整体氛围偏向内省。视频节奏缓慢，每一个镜头都停留较长时间，给人一种深沉的感觉。画面中有轻轻叹气的小动作，以及反复整理衣角的细节，隐约有些纠结。",
    "画面明亮通透，高光居多，色彩饱和度较高，给人一种清新的感觉。人物表情丰富多变，时而是夸张的惊讶，时而是俏皮的眨眼。背景充满生活气息，有书籍、茶杯、小摆件等日常物品。视频节奏明快，剪辑点密集，画面信息量较大。画面中不经意间流露出倦意——打了一个小哈欠、揉了揉眼睛。",
    "画面色调优雅，带有淡淡的滤镜效果，质感细腻。人物姿态舒展，表情温和而专注，有一种沉浸在当下时刻的感觉。背景布置精致，带有艺术感的道具和柔和的灯光点缀其中。视频节奏舒缓，长镜头居多，给人一种从容不迫的印象。画面中人物偶尔皱眉头，似乎在思考什么，手指不自觉地绕着一缕头发。",
]

random.shuffle(_FALLBACK_TEMPLATES)
_fallback_idx = 0


def _get_analysis_for_source(source: str) -> str:
    """Return the template analysis for a known demo source, or a random fallback."""
    if source in _DEMO_TEMPLATES:
        return _DEMO_TEMPLATES[source]
    global _fallback_idx
    tmpl = _FALLBACK_TEMPLATES[_fallback_idx % len(_FALLBACK_TEMPLATES)]
    _fallback_idx += 1
    return tmpl


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
#  Simulated "video analysis" (no real vision model — template + metadata)
# ---------------------------------------------------------------------------

def _get_video_metadata(file_path: str) -> dict:
    """Lightweight metadata probe for the simulated analysis text."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json",
             "-show_format", "-show_streams", file_path],
            capture_output=True, text=True, timeout=15,
        )
        info = json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        return {"filename": os.path.basename(file_path), "duration_s": 0}

    fmt = info.get("format", {})
    return {
        "filename": os.path.basename(file_path),
        "duration_s": float(fmt.get("duration", 0)),
    }


async def analyze_video(file_path: str) -> str:
    """Simulated video analysis — metadata + template (fallback for custom uploads)."""
    meta = _get_video_metadata(file_path)
    duration_s = meta["duration_s"]
    duration_label = f"{int(duration_s)}秒" if duration_s < 60 else f"{int(duration_s // 60)}分{int(duration_s % 60)}秒"
    template = _get_analysis_for_source("")

    return (
        f"[模拟视频理解] 用户上传了视频「{meta['filename']}」,时长约{duration_label}。\n\n"
        f"{template}\n\n"
        f"[分析摘要] 基于以上画面观察,该视频传递出的核心情绪线索已在上述描述中体现。"
        f"请根据这些描述,结合用户可能的生活场景,生成完整的妖怪报告。"
    )


def analyze_video_from_source(source: str) -> str:
    """Instant analysis for demo videos — returns the source-matching template directly,
    no file I/O, no ffprobe, no network call."""
    template = _get_analysis_for_source(source)
    label = {"哈利波特": "哈利波特与小天狼星", "小马": "马头人演讲", "小妖怪": "小妖怪举牌"}.get(source, source)

    # Monster style hints — guide DeepSeek to create a monster matching the video's vibe.
    hints = {
        "哈利波特": (
            '【妖怪风格引导】请生成一只温暖治愈系的小妖怪，名字建议偏向「暖」「光」「抱」等柔软意象(如暖暖狮、光光鹿、抱抱熊)，'
            '类型围绕「和解」「重逢」「治愈」来构思。emoji 建议选 🐱🐰🐼 类。整体气质：温柔、包容、给人安全感。'
        ),
        "小马": (
            '【妖怪风格引导】请生成一只自信幽默系的小妖怪，名字建议偏向「言」「思」「哲」等庄重意象(如言言马、思思鸦、哲哲狐)，'
            '类型围绕「表达」「思考」「仪式感」来构思。emoji 建议选 🦊🐨🐻 类。整体气质：自信、有主见、带点反差萌的幽默感。'
        ),
        "小妖怪": (
            '【妖怪风格引导】请生成一只活泼俏皮系的小妖怪，名字建议偏向「蹦」「跳」「糖」等灵动意象(如蹦蹦糖、跳跳兔、糖糖狐)，'
            '类型围绕「元气」「仪式感」「小确幸」来构思。emoji 建议选 🐣🦋🐶 类。整体气质：元气满满、好奇、喜欢给人惊喜。'
        ),
    }

    hint = hints.get(source, "")
    return (
        f"[模拟视频理解] 用户选择了示例视频「{label}」。\n\n"
        f"{template}\n\n"
        f"{hint}\n\n"
        f"[分析摘要] 基于以上画面观察,该视频传递出的核心情绪线索已在上述描述中体现。"
        f"请根据这些描述和妖怪风格引导,生成完整的妖怪报告。"
    )


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
        return json.loads(raw, strict=False)
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
        return json.loads(raw, strict=False)
    except json.JSONDecodeError as e:
        raise APIError(f"Failed to parse answers JSON: {e}\nRaw response: {raw[:500]}") from e
