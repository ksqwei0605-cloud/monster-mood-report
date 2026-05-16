import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { CuteMonster, ScreenFrame } from "./CuteMonster";
import {
  uploadVideo,
  pollTask,
  generateAnswers,
  type ReportData,
} from "@/lib/api";

type EmotionMonster = ReportData["emotionMonsters"][number];
type Step = "upload" | "loading" | "monster" | "report" | "transition" | "questions" | "answers" | "card";
type MBTIData = { type: string; percent: number; color: string; cute: string }[];

export function YaoyaoApp() {
  const [step, setStep] = useState<Step>("upload");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [monsters, setMonsters] = useState<ReportData["emotionMonsters"] | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<EmotionMonster | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pollSeconds, setPollSeconds] = useState(0);

  const go = (s: Step) => setStep(s);

  const handleUpload = async (file: File) => {
    setError(null);
    try {
      const tid = await uploadVideo(file);
      setTaskId(tid);
      setPollSeconds(0);
      go("loading");

      const result = await pollTask(tid, (elapsed) => setPollSeconds(elapsed));
      setReport(result);
      go("monster");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      go("upload");
    }
  };

  const handlePickQuestion = async (q: string) => {
    if (!taskId) return;
    setSelectedQuestion(q);
    go("answers");
    setMonsters(null);

    try {
      const result = await generateAnswers(taskId, q);
      setMonsters(result);
    } catch (e) {
      toast("小妖怪们走丢了，再试一次吧 🥺");
    }
  };

  const restart = () => {
    setTaskId(null);
    setReport(null);
    setMonsters(null);
    setSelectedQuestion(null);
    setSelectedAnswer(null);
    setError(null);
    setPollSeconds(0);
    setStep("upload");
  };

  return (
    <div className="min-h-screen flex flex-col items-center pb-10">
      <Header />
      {step === "upload" && <UploadScreen onUpload={handleUpload} error={error} />}
      {step === "loading" && <LoadingScreen seconds={pollSeconds} />}
      {step === "monster" && report && <MonsterScreen report={report} onNext={() => go("report")} />}
      {step === "report" && report && <ReportScreen report={report} onNext={() => go("transition")} />}
      {step === "transition" && report && <TransitionScreen emoji={report.monster.emoji} color={report.monster.color} onDone={() => go("questions")} />}
      {step === "questions" && report && (
        <QuestionsScreen report={report} onPick={handlePickQuestion} />
      )}
      {step === "answers" && selectedQuestion && report && (
        <AnswersScreen
          question={selectedQuestion}
          monsters={monsters}
          onPick={(m) => {
            setSelectedAnswer(m);
            go("card");
          }}
        />
      )}
      {step === "card" && selectedQuestion && selectedAnswer && report && (
        <CardScreen
          report={report}
          question={selectedQuestion}
          answer={selectedAnswer}
          onRestart={restart}
          onSave={() => toast("卡片已保存到妖妖口袋！🎀")}
          onShare={() => toast("分享链接已生成！✨")}
        />
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="w-full max-w-md mx-auto px-5 pt-6 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">🔮</span>
        <span className="font-bold text-lg tracking-wide bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent">
          妖妖乐
        </span>
      </div>
      <span className="yy-chip">AI · Demo</span>
    </div>
  );
}

/* ---------------- Upload Screen ---------------- */
function UploadScreen({ onUpload, error }: { onUpload: (f: File) => void; error: string | null }) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast("请选择一个视频文件喔 📹");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file) return;
    setUploading(true);
    await onUpload(file);
    setUploading(false);
  };

  return (
    <ScreenFrame keyId="upload">
      <h1 className="text-center text-2xl font-bold mb-1">妖妖乐 🎀</h1>
      <p className="text-center text-sm text-muted-foreground mb-6">
        上传一段你最近看的视频，小妖怪帮你看看心情～
      </p>

      {/* Video preview */}
      {previewUrl ? (
        <div className="yy-card overflow-hidden mb-4">
          <video
            ref={videoRef}
            src={previewUrl}
            controls
            playsInline
            className="w-full rounded-xl"
            style={{ maxHeight: 280, background: "#000" }}
          />
          <div className="flex items-center justify-between mt-3 px-1">
            <div>
              <p className="font-semibold text-sm truncate max-w-[200px]">{file!.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file!.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
            <button
              onClick={() => {
                inputRef.current?.click();
              }}
              className="text-xs text-primary font-medium hover:underline"
            >
              更换视频
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="yy-card p-8 flex flex-col items-center cursor-pointer border-2 border-dashed border-primary/30 hover:border-primary/60 transition-colors"
        >
          <span className="text-5xl mb-3">🎬</span>
          <div className="text-center">
            <p className="font-semibold text-sm">点击选择视频文件</p>
            <p className="text-xs text-muted-foreground mt-1">支持 MP4 / WebM / MOV，最大 200MB</p>
          </div>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {error && (
        <div className="mt-4 p-3 rounded-2xl bg-red-50 text-red-600 text-sm text-center">
          {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || uploading}
        className="yy-btn w-full mt-5 disabled:opacity-50"
      >
        {uploading ? "上传中..." : "开始分析 ✨"}
      </button>
    </ScreenFrame>
  );
}

/* ---------------- Loading Screen ---------------- */
function LoadingScreen({ seconds }: { seconds: number }) {
  const dots = ".".repeat((seconds % 3) + 1);
  return (
    <ScreenFrame keyId="loading">
      <div className="flex flex-col items-center mt-16">
        <motion.div
          animate={{ y: [0, -10, 0], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <CuteMonster emoji="🔮" color="#cdb6f8" size={120} wiggle />
        </motion.div>
        <h1 className="text-xl font-bold mt-6">小妖怪正在看你的视频{dots}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {seconds < 10 && "正在抽取视频画面..."}
          {seconds >= 10 && seconds < 20 && "正在理解视频内容..."}
          {seconds >= 20 && seconds < 30 && "正在调配人格配方..."}
          {seconds >= 30 && "快好啦，再等一下下..."}
        </p>
        <p className="text-xs text-muted-foreground mt-2">已等待 {seconds} 秒</p>

        <div className="mt-6 w-48 h-1.5 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg,#ffd98a,#f8b6d2,#cdb6f8)" }}
            animate={{ width: [`${Math.min(seconds * 3, 90)}%`, `${Math.min(seconds * 4, 95)}%`] }}
            transition={{ duration: 1 }}
          />
        </div>
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 1: Monster ---------------- */
function MonsterScreen({ report, onNext }: { report: ReportData; onNext: () => void }) {
  const m = report.monster;
  return (
    <ScreenFrame keyId="monster">
      <h1 className="text-center text-2xl font-bold mb-1">你的专属小妖怪来啦！</h1>
      <p className="text-center text-sm text-muted-foreground mb-6">今天 TA 偷偷跟着你浏览了好多视频～</p>

      <div className="yy-card p-6 flex flex-col items-center">
        <CuteMonster emoji={m.emoji} color={m.color} size={140} />
        <div className="mt-4 text-xl font-bold">{m.name}</div>
        <div className="yy-chip mt-2">{m.type}</div>

        <div className="w-full mt-5 grid gap-2">
          {m.attributes.map((a) => (
            <div
              key={a.label}
              className="flex items-start gap-2 rounded-2xl px-4 py-3"
              style={{ background: "oklch(0.97 0.03 320 / 0.7)" }}
            >
              <span className="text-xs font-semibold text-primary min-w-[64px]">{a.label}</span>
              <span className="text-sm">{a.value}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="text-center mt-6 text-sm font-medium text-foreground/70">「{m.intro}」</p>

      <button onClick={onNext} className="yy-btn w-full mt-5">
        查看今日状态报告 ✨
      </button>
    </ScreenFrame>
  );
}

/* ---------------- Screen 2: Report ---------------- */
function ReportScreen({ report, onNext }: { report: ReportData; onNext: () => void }) {
  const [active, setActive] = useState<number | null>(null);
  const data = report.mbtiMix;
  return (
    <ScreenFrame keyId="report">
      <h1 className="text-center text-2xl font-bold mb-4">今日状态报告 📋</h1>

      <div className="yy-card p-5">
        <div className="flex items-center gap-3">
          <CuteMonster emoji={report.monster.emoji} color={report.monster.color} size={70} />
          <div>
            <div className="font-bold">{report.monster.name}</div>
            <div className="text-xs text-muted-foreground">{report.monster.type}</div>
          </div>
        </div>

        <div className="mt-3 relative">
          <div className="text-sm font-semibold mb-2">今日 MBTI 人格配方</div>
          <div className="relative h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="percent"
                  innerRadius={50}
                  outerRadius={85}
                  paddingAngle={3}
                  onClick={(_, i) => setActive(i)}
                >
                  {data.map((d, i) => (
                    <Cell
                      key={d.type}
                      fill={d.color}
                      stroke="white"
                      strokeWidth={3}
                      style={{ cursor: "pointer", filter: active === i ? "brightness(1.05)" : undefined }}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <motion.div
              className="absolute"
              style={{ top: -10, right: 10 }}
              animate={{ y: [0, -6, 0], rotate: [-5, 5, -5] }}
              transition={{ duration: 3, repeat: Infinity }}
            >
              <CuteMonster emoji={report.monster.emoji} color={report.monster.color} size={50} />
            </motion.div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-2">
            {data.map((d, i) => (
              <button
                key={d.type}
                onClick={() => setActive(i)}
                className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-xl"
                style={{ background: active === i ? d.color : "transparent" }}
              >
                <span className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                <span className="font-semibold">{d.type}</span>
                <span className="text-muted-foreground">{d.percent}%</span>
              </button>
            ))}
          </div>

          <AnimatePresence>
            {active !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 rounded-2xl p-3 text-sm"
                style={{ background: data[active].color + "55" }}
              >
                <b>{data[active].type}：</b>
                {data[active].cute}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="yy-card p-5 mt-4">
        <div className="text-sm font-semibold mb-2">⚡ 今日能量值</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-4 rounded-full bg-muted overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${report.energyScore}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-full"
              style={{ background: "linear-gradient(90deg,#ffd98a,#f8b6d2,#cdb6f8)" }}
            />
          </div>
          <span className="font-bold text-lg">{report.energyScore}</span>
        </div>
      </div>

      <div className="yy-card p-5 mt-4">
        <div className="text-sm font-semibold mb-2">☁️ 今日情绪</div>
        <p className="text-sm leading-relaxed">{report.emotionText}</p>
      </div>

      <button onClick={onNext} className="yy-btn w-full mt-5">
        进入妖妖占卜屋 🔮
      </button>
    </ScreenFrame>
  );
}

/* ---------------- Screen 3: Transition ---------------- */
function TransitionScreen({ emoji, color, onDone }: { emoji: string; color: string; onDone: () => void }) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(circle at 50% 40%, oklch(0.45 0.1 300), oklch(0.22 0.08 300))",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onAnimationComplete={() => setTimeout(onDone, 2200)}
    >
      {[...Array(20)].map((_, i) => (
        <motion.span
          key={i}
          className="absolute text-yellow-200"
          style={{ left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%` }}
          animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1.3, 0.8] }}
          transition={{ duration: 2, delay: i * 0.1, repeat: Infinity }}
        >
          ✦
        </motion.span>
      ))}

      <motion.div
        initial={{ y: -200, rotate: -30 }}
        animate={{ y: 0, rotate: 0 }}
        transition={{ type: "spring", bounce: 0.6, duration: 1.4 }}
      >
        <CuteMonster emoji={emoji} color={color} size={130} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-6 text-white text-base px-6 text-center"
      >
        小妖怪正在叼着问题进屋……
      </motion.div>

      <motion.div
        className="absolute bottom-20 w-72 h-32 rounded-t-[120px]"
        style={{ background: "linear-gradient(180deg, #cdb6f8, #8d6bd5)" }}
        initial={{ y: 200 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.5, type: "spring" }}
      >
        <div className="text-center text-white text-sm mt-4">🪟 妖妖占卜屋</div>
      </motion.div>
    </motion.div>
  );
}

/* ---------------- Screen 4: Questions ---------------- */
function QuestionsScreen({
  report,
  onPick,
}: {
  report: ReportData;
  onPick: (q: string) => void;
}) {
  return (
    <ScreenFrame keyId="questions">
      <h1 className="text-center text-2xl font-bold mb-1">妖妖占卜屋 🔮</h1>
      <p className="text-center text-base mt-3 mb-4 font-medium">「我猜你想问我——」</p>

      <div className="yy-card p-4 mb-4">
        <div className="text-xs font-semibold text-primary mb-2">📊 今日浏览数据分析</div>
        <div className="grid gap-1.5">
          {report.videoAnalysis.map((v) => (
            <div key={v.text} className="text-xs flex items-center gap-2 text-muted-foreground">
              <span>{v.icon}</span>
              <span>{v.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {report.recommendedQuestions.map((q, i) => (
          <motion.button
            key={q}
            onClick={() => onPick(q)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="yy-card p-4 text-left text-sm font-medium hover:shadow-lg"
          >
            <span className="text-primary mr-2">Q{i + 1}.</span>
            {q}
          </motion.button>
        ))}
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 5: Answers ---------------- */
function AnswersScreen({
  question,
  monsters: monstersProp,
  onPick,
}: {
  question: string;
  monsters: ReportData["emotionMonsters"] | null;
  onPick: (m: EmotionMonster) => void;
}) {
  const [active, setActive] = useState<EmotionMonster | null>(null);

  // Fall back to empty answers if still loading
  const monsters = monstersProp ?? [
    { emotion: "快乐", name: "乐啵啵", emoji: "😆", color: "#ffd98a", style: "明亮、开心、圆滚滚", answer: "正在赶来..." },
    { emotion: "悲伤", name: "灰绵绵", emoji: "🥺", color: "#c9d4e8", style: "柔软、低落、像小云朵", answer: "正在赶来..." },
    { emotion: "害怕", name: "怯团团", emoji: "😨", color: "#d6c9f0", style: "小心、害怕、缩成一团", answer: "正在赶来..." },
    { emotion: "讨厌", name: "嫌叽叽", emoji: "😒", color: "#b8e6c8", style: "别扭、嫌弃、嘴硬", answer: "正在赶来..." },
    { emotion: "愤怒", name: "炸毛球", emoji: "😤", color: "#ffb3a8", style: "生气、炸毛、行动派", answer: "正在赶来..." },
  ];

  return (
    <ScreenFrame keyId="answers">
      <div className="yy-card p-4 mb-4">
        <div className="text-xs text-muted-foreground mb-1">你选择的问题</div>
        <div className="text-sm font-semibold">{question}</div>
      </div>

      <p className="text-center text-sm text-muted-foreground mb-3">
        点一个小妖怪，听听 TA 怎么说 🌟
      </p>

      <div className="relative h-72 mx-auto" style={{ width: 280 }}>
        {monsters.map((m, i) => {
          const angle = (i / monsters.length) * Math.PI * 2 - Math.PI / 2;
          const r = 105;
          const x = 140 + Math.cos(angle) * r - 40;
          const y = 140 + Math.sin(angle) * r - 40;
          const isActive = active?.name === m.name;
          return (
            <motion.button
              key={m.name}
              onClick={() => setActive(m)}
              className="absolute"
              style={{ left: x, top: y }}
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              animate={{ scale: isActive ? 1.15 : 1 }}
            >
              <CuteMonster emoji={m.emoji} color={m.color} size={80} label={m.name} wiggle={isActive} />
            </motion.button>
          );
        })}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-3xl"
          style={{ animation: "floatSoft 3s ease-in-out infinite" }}
        >
          {monstersProp ? "✨" : "⏳"}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {active && (
          <motion.div
            key={active.name}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="yy-card p-4 mt-4"
            style={{ background: active.color + "33" }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="font-bold">{active.name}</span>
              <span className="yy-chip">{active.emotion}</span>
            </div>
            <p className="text-sm leading-relaxed">{active.answer}</p>
            {monstersProp && (
              <button onClick={() => onPick(active)} className="yy-btn w-full mt-3">
                选择这个回答 💌
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ScreenFrame>
  );
}

/* ---------------- Screen 6: Card ---------------- */
function CardScreen({
  report,
  question,
  answer,
  onRestart,
  onSave,
  onShare,
}: {
  report: ReportData;
  question: string;
  answer: EmotionMonster;
  onRestart: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  const topMbti = report.mbtiMix[0];
  return (
    <ScreenFrame keyId="card">
      <h1 className="text-center text-2xl font-bold mb-4">今日专属妖妖卡 🎀</h1>

      <motion.div
        initial={{ scale: 0.9, opacity: 0, rotate: -3 }}
        animate={{ scale: 1, opacity: 1, rotate: 0 }}
        transition={{ type: "spring" }}
        className="rounded-3xl p-5 text-foreground relative overflow-hidden"
        style={{
          background:
            "linear-gradient(160deg, #fff3f7 0%, #f0e8ff 50%, #e8f3ff 100%)",
          boxShadow: "0 20px 50px -15px oklch(0.7 0.15 320 / 0.4)",
          border: "2px dashed oklch(0.85 0.08 320)",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="font-bold text-pink-500">🔮 妖妖乐</span>
          <span className="text-xs text-muted-foreground">{new Date().toLocaleDateString("zh-CN")}</span>
        </div>

        <div className="flex flex-col items-center">
          <CuteMonster emoji={report.monster.emoji} color={report.monster.color} size={100} />
          <div className="mt-2 font-bold text-lg">{report.monster.name}</div>
          <div className="yy-chip mt-1">{report.monster.type}</div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <div className="rounded-2xl bg-white/60 p-2">
            <div className="text-muted-foreground">MBTI 配方</div>
            <div className="font-bold">{topMbti.type} {topMbti.percent}%</div>
          </div>
          <div className="rounded-2xl bg-white/60 p-2">
            <div className="text-muted-foreground">能量值</div>
            <div className="font-bold">⚡ {report.energyScore}</div>
          </div>
          <div className="rounded-2xl bg-white/60 p-2 col-span-2">
            <div className="text-muted-foreground">今日情绪</div>
            <div className="text-foreground">{report.emotionText}</div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl bg-white/70 p-3">
          <div className="text-xs text-muted-foreground mb-1">🌟 我问妖妖</div>
          <div className="text-sm font-medium">{question}</div>
          <div className="text-xs text-muted-foreground mt-2 mb-1">
            🎀 {answer.name} 叼来的回答
          </div>
          <div className="text-sm">{answer.answer}</div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-2 mt-5">
        <button onClick={onSave} className="yy-btn !px-2 text-sm">💾 保存</button>
        <button onClick={onShare} className="yy-btn !px-2 text-sm">📤 分享</button>
        <button
          onClick={onRestart}
          className="rounded-full font-semibold text-sm"
          style={{ background: "white", border: "1px solid var(--border)" }}
        >
          🔄 再玩一次
        </button>
      </div>
    </ScreenFrame>
  );
}
