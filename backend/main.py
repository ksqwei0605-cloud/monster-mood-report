from __future__ import annotations

import asyncio
import os
import time
import traceback
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_VIDEO_TYPES, LLM_PROVIDER, MAX_VIDEO_SIZE_MB, TEMP_DIR, VISION_PROVIDER
from models import (
    EmotionMonster,
    GenerateAnswersRequest,
    GenerateAnswersResponse,
    ReportData,
    TaskResponse,
    TaskStatus,
)
from services import (
    APIError,
    analyze_video,
    generate_monster_answers,
    generate_report,
)

# ---------------------------------------------------------------------------
#  Fixed emotion monster definitions
# ---------------------------------------------------------------------------

FIXED_EMOTION_MONSTERS: list[dict] = [
    {"emotion": "快乐", "name": "乐啵啵", "emoji": "😆", "color": "#ffd98a", "style": "明亮、开心、圆滚滚"},
    {"emotion": "悲伤", "name": "灰绵绵", "emoji": "🥺", "color": "#c9d4e8", "style": "柔软、低落、像小云朵"},
    {"emotion": "害怕", "name": "怯团团", "emoji": "😨", "color": "#d6c9f0", "style": "小心、害怕、缩成一团"},
    {"emotion": "讨厌", "name": "嫌叽叽", "emoji": "😒", "color": "#b8e6c8", "style": "别扭、嫌弃、嘴硬"},
    {"emotion": "愤怒", "name": "炸毛毛", "emoji": "😤", "color": "#ffb3a8", "style": "生气、炸毛、行动派"},
]

# ---------------------------------------------------------------------------
#  App
# ---------------------------------------------------------------------------

app = FastAPI(title="妖妖乐 API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

tasks: dict[str, dict] = {}
_video_semaphore = asyncio.Semaphore(2)  # max concurrent video processing
_MAX_TASKS = 100  # prune oldest tasks when exceeded
_TASK_TTL = 3600  # auto-clean tasks older than 1 hour (seconds)


# ---------------------------------------------------------------------------
#  Helpers
# ---------------------------------------------------------------------------

def _normalize_report(raw: dict) -> ReportData:
    """Force emotionMonsters to the fixed set and fix MBTI percentages."""
    raw["emotionMonsters"] = [
        {**m, "answer": ""} for m in FIXED_EMOTION_MONSTERS
    ]
    mbti = raw.get("mbtiMix", [])
    if mbti and len(mbti) == 4:
        total = sum(item.get("percent", 0) for item in mbti)
        if total != 100 and total > 0:
            for item in mbti:
                item["percent"] = round(item["percent"] * 100 / total)
            diff = 100 - sum(item["percent"] for item in mbti)
            mbti[0]["percent"] += diff

    # Frontend ReportScreen renders exactly 4 videoAnalysis leaves
    va = raw.get("videoAnalysis") or []
    if len(va) > 4:
        raw["videoAnalysis"] = va[:4]
    elif len(va) < 4:
        pad = [{"icon": "🌙", "text": "今天的浏览节奏有点小情绪"}] * (4 - len(va))
        raw["videoAnalysis"] = va + pad

    # QuestionsScreen takes the first 3, keep at least 3 entries
    rq = raw.get("recommendedQuestions") or []
    if len(rq) < 3:
        rq = rq + [
            "今天最适合我的一个小行动是什么？",
            "我到底是真的累，还是在逃避？",
            "我为什么总在看很多方法，却还是不行动？",
        ][: 3 - len(rq)]
        raw["recommendedQuestions"] = rq

    return ReportData(**raw)


def _make_monsters_with_answers(answers: dict) -> list[EmotionMonster]:
    return [
        EmotionMonster(**{**m, "answer": answers.get(m["name"], "")})
        for m in FIXED_EMOTION_MONSTERS
    ]


def _prune_tasks() -> None:
    """Remove old tasks to prevent unbounded memory growth."""
    now = time.time()
    stale = [
        tid for tid, t in tasks.items()
        if t.get("_created", 0) < now - _TASK_TTL
    ]
    for tid in stale:
        del tasks[tid]
    if len(tasks) > _MAX_TASKS:
        oldest = sorted(tasks.keys(), key=lambda tid: tasks[tid].get("_created", 0))
        for tid in oldest[:len(tasks) - _MAX_TASKS]:
            del tasks[tid]


async def _process_video(task_id: str, file_path: str) -> None:
    async with _video_semaphore:
        try:
            tasks[task_id]["status"] = TaskStatus.PROCESSING

            video_analysis = await analyze_video(file_path)
            report_dict = await generate_report(video_analysis)
            report = _normalize_report(report_dict)

            tasks[task_id]["status"] = TaskStatus.COMPLETED
            tasks[task_id]["result"] = report
            tasks[task_id]["video_analysis"] = video_analysis

        except Exception as exc:
            tasks[task_id]["status"] = TaskStatus.FAILED
            tasks[task_id]["error"] = f"{type(exc).__name__}: {exc}"
            traceback.print_exc()

        finally:
            try:
                os.remove(file_path)
            except OSError:
                pass


# ---------------------------------------------------------------------------
#  Routes
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup() -> None:
    os.makedirs(TEMP_DIR, exist_ok=True)
    print(f"[妖妖乐] vision={VISION_PROVIDER}  llm={LLM_PROVIDER}")


@app.post("/api/upload-video", response_model=TaskResponse)
async def upload_video(file: UploadFile = File(...)) -> TaskResponse:
    if file.content_type and file.content_type not in ALLOWED_VIDEO_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的文件类型: {file.content_type}。支持: {', '.join(ALLOWED_VIDEO_TYPES)}",
        )

    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > MAX_VIDEO_SIZE_MB:
        raise HTTPException(
            status_code=413,
            detail=f"文件过大 ({size_mb:.1f}MB)，最大支持 {MAX_VIDEO_SIZE_MB}MB",
        )

    task_id = uuid.uuid4().hex[:12]
    ext = Path(file.filename or "video.mp4").suffix or ".mp4"
    file_path = os.path.join(TEMP_DIR, f"{task_id}{ext}")

    with open(file_path, "wb") as f:
        f.write(contents)

    _prune_tasks()

    tasks[task_id] = {
        "status": TaskStatus.PENDING,
        "result": None,
        "video_analysis": None,
        "error": None,
        "_created": time.time(),
    }

    asyncio.create_task(_process_video(task_id, file_path))

    return TaskResponse(task_id=task_id, status=TaskStatus.PROCESSING)


@app.get("/api/task/{task_id}/status", response_model=TaskResponse)
async def get_task_status(task_id: str) -> TaskResponse:
    task = tasks.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return TaskResponse(
        task_id=task_id,
        status=task["status"],
        result=task.get("result"),
        error=task.get("error"),
    )


@app.post("/api/generate-answers", response_model=GenerateAnswersResponse)
async def generate_answers(req: GenerateAnswersRequest) -> GenerateAnswersResponse:
    task = tasks.get(req.task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task["status"] != TaskStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="任务尚未完成，请等待报告生成")
    if task.get("video_analysis") is None:
        raise HTTPException(status_code=400, detail="缺少视频分析数据")

    try:
        answers = await generate_monster_answers(task["video_analysis"], req.question)
    except APIError as e:
        raise HTTPException(status_code=502, detail=f"LLM 调用失败: {e}")

    return GenerateAnswersResponse(emotionMonsters=_make_monsters_with_answers(answers))


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "vision": VISION_PROVIDER,
        "llm": LLM_PROVIDER,
        "tasks": len(tasks),
    }
