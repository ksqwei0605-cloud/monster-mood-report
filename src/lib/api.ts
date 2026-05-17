// DEV: point to localhost:8787 directly.
// PRODUCTION (VITE_API_BASE=""): same-origin requests proxied by nginx.
const API_BASE = import.meta.env.VITE_API_BASE ?? (
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8787`
    : "http://localhost:8787"
);

export interface ReportData {
  monster: {
    name: string;
    type: string;
    emoji: string;
    color: string;
    attributes: { label: string; value: string }[];
    intro: string;
  };
  mbtiMix: { type: string; percent: number; color: string; cute: string }[];
  energyScore: number;
  emotionText: string;
  videoAnalysis: { icon: string; text: string }[];
  recommendedQuestions: string[];
  emotionMonsters: {
    emotion: string;
    name: string;
    emoji: string;
    color: string;
    style: string;
    answer: string;
  }[];
}

interface TaskResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  result?: ReportData;
  error?: string;
}

interface AnswersResponse {
  emotionMonsters: ReportData["emotionMonsters"];
}

export async function uploadVideo(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);

  const resp = await fetch(`${API_BASE}/api/upload-video`, {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || "Upload failed");
  }

  const data: TaskResponse = await resp.json();
  return data.task_id;
}

export async function pollTask(
  taskId: string,
  onProgress?: (elapsed: number) => void,
): Promise<ReportData> {
  const start = Date.now();

  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    onProgress?.(elapsed);

    const resp = await fetch(`${API_BASE}/api/task/${taskId}/status`);
    if (!resp.ok) throw new Error("Task query failed");

    const data: TaskResponse = await resp.json();

    if (data.status === "completed" && data.result) {
      return data.result;
    }
    if (data.status === "failed") {
      throw new Error(data.error || "Analysis failed");
    }

    // Wait 2s before next poll
    await new Promise((r) => setTimeout(r, 2000));
  }
}

export async function generateAnswers(
  taskId: string,
  question: string,
): Promise<ReportData["emotionMonsters"]> {
  const resp = await fetch(`${API_BASE}/api/generate-answers`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task_id: taskId, question }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || "Answer generation failed");
  }

  const data: AnswersResponse = await resp.json();
  return data.emotionMonsters;
}
