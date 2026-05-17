from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# --- Monster ---

class MonsterAttribute(BaseModel):
    label: str
    value: str


class Monster(BaseModel):
    name: str
    type: str
    emoji: str
    color: str
    attributes: list[MonsterAttribute]
    intro: str


# --- MBTI ---

class MbtiMixItem(BaseModel):
    type: str
    percent: int
    color: str
    cute: str


# --- Video analysis ---

class VideoAnalysisItem(BaseModel):
    icon: str
    text: str


# --- Emotion monster ---

class EmotionMonster(BaseModel):
    emotion: str
    name: str
    emoji: str
    color: str
    style: str
    answer: str = ""


# --- Report (the full result) ---

class ReportData(BaseModel):
    monster: Monster
    mbtiMix: list[MbtiMixItem]
    energyScore: int
    emotionText: str
    videoAnalysis: list[VideoAnalysisItem]
    recommendedQuestions: list[str]
    emotionMonsters: list[EmotionMonster]


# --- API request / response ---

class TaskResponse(BaseModel):
    task_id: str
    status: TaskStatus
    result: Optional[ReportData] = None
    error: Optional[str] = None


class GenerateAnswersRequest(BaseModel):
    task_id: str
    question: str = Field(..., min_length=1)


class GenerateAnswersResponse(BaseModel):
    emotionMonsters: list[EmotionMonster]
