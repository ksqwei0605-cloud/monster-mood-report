# 妖妖乐 — 你的专属情绪小妖怪 🎀

上传一段视频，AI 帮你生成一只专属可爱小妖怪，解锁今日 MBTI 人格配方、能量值、情绪描述，还能进「妖妖占卜屋」让五只情绪妖怪为你答疑解惑。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | React 19 + TypeScript + Tailwind CSS + Framer Motion + Recharts |
| 后端 | Python FastAPI + 异步任务管线 |
| 视频理解 | Qwen3-VL-32B (vLLM) |
| 文本生成 | DeepSeek Chat API |
| 进程管理 | PM2 (开机自启、崩溃重启) |

## 项目结构

```
monster-mood-report/
├── src/                     # 前端源代码
│   ├── components/yaoyao/   # 妖妖乐核心组件（6 步流程）
│   └── lib/api.ts           # 后端 API 调用封装
├── backend/                 # 后端服务
│   ├── main.py              # FastAPI 应用 + 路由
│   ├── services.py          # LLM/Vision 调用层
│   ├── prompts.py           # Prompt 模板
│   ├── models.py            # Pydantic 数据模型
│   └── config.py            # Provider 配置
├── ecosystem.config.cjs     # PM2 进程配置
└── package.json
```

## 页面流程

```
上传视频 → 专属妖怪 → 今日状态报告 → 转场动画 → 妖妖占卜屋 → 情绪妖怪回答 → 分享卡片
```

## 本地开发

### 环境要求

- Node.js 24+ / Bun
- Python 3.13+
- ffmpeg（视频帧提取）
- vLLM（视频理解模型，已部署在 :8100）

### 安装与启动

```bash
# 前端
npm install
npx vite dev --host 0.0.0.0 --port 5173

# 后端
cd backend
pip install -r requirements.txt
python3 -m uvicorn main:app --host 0.0.0.0 --port 8787
```

## 远程访问（SSH 隧道）

```bash
ssh -L 5173:localhost:5173 -L 8787:localhost:8787 <user>@<server-ip>
```

浏览器打开 `http://localhost:5173/`。

## 后端 API

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/upload-video` | 上传视频，返回 task_id |
| `GET` | `/api/task/{id}/status` | 轮询任务状态 + 获取报告 |
| `POST` | `/api/generate-answers` | 为选定问题生成五个妖怪回答 |
| `GET` | `/api/health` | 健康检查 |

API 文档：启动后端后访问 `http://localhost:8787/docs`。

## 配置

后端通过 `backend/config.py` 切换 Provider：

```python
LLM_PROVIDER = "deepseek"   # 文本生成：deepseek / openai-next
VISION_PROVIDER = "vllm"    # 视频理解：vllm / doubao
```

环境变量覆盖：

```bash
export DEEPSEEK_API_KEY="sk-xxx"
export YAOYAO_VISION_PROVIDER="doubao"
```
