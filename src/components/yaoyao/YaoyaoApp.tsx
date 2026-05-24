import { useEffect, useId, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { yaoyaoData, setYaoyaoData, setYaoyaoAnswers, type EmotionMonster } from "@/lib/yaoyao-data";
import { CuteMonster, ScreenFrame } from "./CuteMonster";
import { AnimatedMonster } from "@/components/AnimatedMonster";
import { uploadVideo, uploadDemoVideo, pollTask, generateAnswers } from "@/lib/api";

// upload → hatch(孵蛋交互,后台轮询) → monster → report → transition → questions → answers → card
type Step = "upload" | "hatch" | "monster" | "report" | "transition" | "questions" | "answers" | "card";

// 3 只候选小妖怪:monster、焰焰狐、星绒绒
const MONSTER_POOL = [
  { src: "/monster.mp4", poster: "/monster.png" },
  { src: "/焰焰狐.mp4", poster: "" },
  { src: "/星绒绒.mp4", poster: "" },
] as const;

function randomMonster() {
  return MONSTER_POOL[Math.floor(Math.random() * MONSTER_POOL.length)];
}

export function YaoyaoApp() {
  // ★ 默认从 upload 进。想跳过后端直接看 demo UI?把这里改成 "monster"。
  const [step, setStep] = useState<Step>("upload");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [pollSeconds, setPollSeconds] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedQuestion, setSelectedQuestion] = useState<string | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<EmotionMonster | null>(null);
  const [monsterVideo, setMonsterVideo] = useState(randomMonster);
  const [backendReady, setBackendReady] = useState(false);

  const go = (s: Step) => setStep(s);

  // 上传视频/示例 → 拿 task_id → 进孵蛋页 → 后台轮询 → backendReady
  const handleUpload = async (fileOrSource: File | string) => {
    setUploadError(null);
    setPollSeconds(0);
    setBackendReady(false);
    try {
      let tid: string;
      if (typeof fileOrSource === "string") {
        // Demo video — bypass file upload, send source name directly
        tid = await uploadDemoVideo(fileOrSource);
      } else {
        tid = await uploadVideo(fileOrSource);
      }
      setTaskId(tid);
      go("hatch");
      // 后台轮询,不阻塞孵蛋交互
      pollTask(tid, (elapsed) => setPollSeconds(elapsed))
        .then((result) => {
          setYaoyaoData(result);
          setBackendReady(true);
        })
        .catch((e) => {
          setUploadError(e instanceof Error ? e.message : "分析失败");
        });
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "上传或分析失败");
      go("upload");
    }
  };

  // 用户在 Screen 4 选了一个问题 → 进 Screen 5 之前先调 generate-answers
  // 把 5 妖怪的 answer 写回 yaoyaoData,Screen 5 读到的 m.answer 就是真实的
  const handlePickQuestion = async (q: string) => {
    setSelectedQuestion(q);
    go("answers");
    if (taskId) {
      try {
        const monsters = await generateAnswers(taskId, q);
        setYaoyaoAnswers(monsters);
      } catch {
        toast("小妖怪们走丢了,先用默认答案 🥺");
      }
    }
  };

  const restart = () => {
    setTaskId(null);
    setPollSeconds(0);
    setSelectedQuestion(null);
    setSelectedAnswer(null);
    setUploadError(null);
    setBackendReady(false);
    setMonsterVideo(randomMonster());
    setStep("upload");
  };

  return (
    <div className="min-h-screen flex flex-col items-center pb-10">
      <Header />
      {step === "upload" && <UploadScreen onUpload={handleUpload} error={uploadError} />}
      {step === "hatch" && (
        <HatchEggScreen
          seconds={pollSeconds}
          backendReady={backendReady}
          onHatchComplete={() => go("monster")}
        />
      )}
      {step === "monster" && <MonsterScreen onNext={() => go("report")} monsterSrc={monsterVideo.src} monsterPoster={monsterVideo.poster} />}
      {step === "report" && <ReportScreen onNext={() => go("transition")} monsterSrc={monsterVideo.src} monsterPoster={monsterVideo.poster} />}
      {step === "transition" && <TransitionScreen onDone={() => go("questions")} />}
      {step === "questions" && (
        <QuestionsScreen onPick={handlePickQuestion} />
      )}
      {step === "answers" && selectedQuestion && (
        <AnswersScreen
          question={selectedQuestion}
          onPick={(m) => {
            setSelectedAnswer(m);
            go("card");
          }}
        />
      )}
      {step === "card" && selectedQuestion && selectedAnswer && (
        <CardScreen
          question={selectedQuestion}
          answer={selectedAnswer}
          monsterSrc={monsterVideo.src}
          monsterPoster={monsterVideo.poster}
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
      <span className="yy-chip">轻娱乐 · Demo</span>
    </div>
  );
}

/* ---------------- Screen 0a: Upload ---------------- */
/**
 * UploadScreen —— 让用户选一段 mp4 上传到后端。
 * 视觉:梦幻紫色卡片 + 选文件按钮 + 上传按钮(都用渐变胶囊)。
 * 选好文件后会显示文件名 + 体积 + 内嵌 video preview。
 */
// 底部 3 个示例视频:点击 → fetch public/*.mp4 → 包成 File → 直接 onUpload。
// 想换示例视频:改这个数组即可,src 用 / 开头的 public 路径,encodeURI 在渲染时处理中文。
const DEMO_VIDEOS = [
  { src: "/哈利波特.mp4", label: "哈利波特" },
  { src: "/马.mp4", label: "小马" },
  { src: "/monster.mp4", label: "小妖怪" },
];

function UploadScreen({
  onUpload,
  error,
}: {
  onUpload: (f: File | string) => Promise<void> | void;
  error: string | null;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 点示例视频:直接发送 source 名称到后端,不再下载+上传文件本体。
  // 后端用与视频内容匹配的模板秒出分析,省去移动端上传 2-5MB 的等待时间。
  const handleDemoClick = async (src: string, label: string) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await onUpload(label as any);
    } catch {
      toast("示例视频走丢了 🥺");
      setSubmitting(false);
    }
  };

  // 切换文件时释放上一个 blob URL,防止内存泄漏
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const pickFile = (f: File | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      toast("需要一段视频文件喔 📹");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const handleSubmit = async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    try {
      await onUpload(file);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenFrame keyId="upload">
      {/* 标题:渐变粉紫字,和 CardScreen 大标题同款风格 */}
      <h1
        className="text-center font-extrabold mb-1 mt-2"
        style={{
          fontSize: "clamp(1.7rem, 7vw, 2.2rem)",
          background: "linear-gradient(135deg, #c084fc 0%, #ec4899 50%, #a855f7 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          letterSpacing: "0.06em",
          filter: "drop-shadow(0 2px 8px rgba(196,167,231,0.55))",
        }}
      >
        上传一段视频 🎬
      </h1>
      <p
        className="text-center text-xs mb-5"
        style={{ color: "rgba(74,29,86,0.7)" }}
      >
        小妖怪要从画面里读出你今天的心情
      </p>

      {/* 渐变描边 + 磨砂玻璃卡 */}
      <div
        className="relative rounded-[28px] mb-4"
        style={{
          padding: "2px",
          background: "linear-gradient(135deg, rgba(216,180,254,0.95), rgba(249,168,212,0.95), rgba(196,181,253,0.95))",
          boxShadow: "0 12px 30px -8px rgba(168,121,224,0.55)",
        }}
      >
        <div
          className="rounded-[26px] p-5"
          style={{
            background: "rgba(255,253,255,0.78)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
          }}
        >
          {/* 隐藏 input,自定义按钮 */}
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0])}
          />

          {previewUrl ? (
            <>
              <video
                src={previewUrl}
                controls
                playsInline
                className="w-full rounded-2xl mb-3 select-none"
                style={{ maxHeight: 240, background: "#000" }}
              />
              <div
                className="text-xs mb-3 truncate"
                style={{ color: "rgba(74,29,86,0.75)" }}
                title={file?.name}
              >
                📁 {file?.name}{" "}
                <span style={{ opacity: 0.6 }}>
                  ({((file?.size ?? 0) / 1024 / 1024).toFixed(1)} MB)
                </span>
              </div>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full text-sm mb-2"
                style={{
                  background: "rgba(255,255,255,0.7)",
                  color: "#7a3d8a",
                  borderRadius: 999,
                  padding: "0.7rem 1rem",
                  border: "1.5px solid rgba(196,181,253,0.7)",
                }}
              >
                🔄 换一个视频
              </button>
            </>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full font-semibold"
              style={{
                background: "rgba(255,255,255,0.6)",
                color: "#7a3d8a",
                borderRadius: 22,
                padding: "1.4rem 1rem",
                border: "2px dashed rgba(196,181,253,0.7)",
                fontSize: "0.95rem",
              }}
            >
              📎 点这里选一段 mp4
              <div
                className="text-xs mt-1 font-normal"
                style={{ color: "rgba(74,29,86,0.55)" }}
              >
                支持 mp4 / mov / webm,最大 200MB
              </div>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="rounded-2xl px-4 py-3 mb-3 text-sm"
          style={{
            background: "rgba(255,180,200,0.45)",
            color: "#7a1235",
            border: "1px solid rgba(244,114,182,0.5)",
          }}
        >
          ⚠️ {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="w-full font-bold transition-transform active:scale-[0.98]"
        style={{
          background:
            file && !submitting
              ? "linear-gradient(135deg, #f7a8c4 0%, #c8a6e9 55%, #a3c4ff 100%)"
              : "linear-gradient(135deg, #d4c4dc, #c0b3d0)",
          color: "white",
          borderRadius: 999,
          padding: "1.05rem 1.5rem",
          fontSize: "1rem",
          letterSpacing: "0.05em",
          boxShadow: "0 14px 30px -8px rgba(196,167,231,0.6)",
          opacity: !file || submitting ? 0.7 : 1,
          cursor: !file || submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "上传中…" : "✨ 让妖妖看看 ✨"}
      </button>

      {/* 底部:3 个示例视频。点一下 = handleDemoClick → onUpload → 自动进 loading。
          缩略图用 first-frame trick(onLoadedData 跳到 0.05s)避免黑屏。 */}
      <div className="mt-5">
        <p
          className="text-center text-xs mb-2"
          style={{ color: "rgba(74,29,86,0.65)" }}
        >
          ✨ 或者点一段示例视频试试 ✨
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {DEMO_VIDEOS.map((d) => (
            <button
              key={d.src}
              onClick={() => handleDemoClick(d.src, d.label)}
              disabled={submitting}
              className="relative rounded-2xl overflow-hidden transition-transform active:scale-95"
              style={{
                aspectRatio: "9 / 16",
                border: "2px solid rgba(196,181,253,0.65)",
                boxShadow: "0 12px 26px -8px rgba(168,121,224,0.55)",
                background: "rgba(255,253,255,0.6)",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.55 : 1,
              }}
            >
              <video
                src={encodeURI(d.src)}
                poster="/monster.png"
                autoPlay
                loop
                muted
                playsInline
                preload="auto"
                className="w-full h-full object-cover pointer-events-none"
                style={{ background: "#1a0a2e" }}
                onLoadedData={(e) => {
                  const v = e.currentTarget;
                  v.currentTime = 0.05;
                  v.play().catch(() => {});
                }}
              />
              <span
                className="absolute bottom-2 left-2 right-2 text-center text-sm font-bold rounded-full px-1.5 py-1"
                style={{
                  background: "rgba(255,253,255,0.88)",
                  color: "#7a3d8a",
                  backdropFilter: "blur(4px)",
                }}
              >
                {d.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 0b: Loading ---------------- */
/* ---------------- Screen 0b: HatchEgg (孵蛋交互) ---------------- */
/**
 * HatchEggScreen —— "孵化今日小妖怪"
 *
 * 用户点击妖蛋 → 孵化进度增加;不点击 → 进度缓慢下降。
 * 进度到达 100 → 播放孵化动画 → 等后端数据就绪后跳转到 Monster 页。
 *
 * 三段视频素材(放在 public/ 下):
 *   /egg-idle.mp4   — 空闲:蛋轻轻漂浮发光 loop
 *   /egg-active.mp4  — 点击:蛋抖动、裂纹发光 loop
 *   /egg-hatch.mp4   — 孵化成功:强光、裂开、粒子爆发短视频
 *
 * 调参速查:
 *   - CLICK_BOOST  → 单次点击增加点数
 *   - DECAY_PER_TICK → 每 50ms 衰减点数
 *   - ACTIVE_THRESHOLD → 切换到 active 视频的进度阈值
 *   - HATCH_DELAY_MS → 孵化动画播放多久后检查后端
 */
const CLICK_BOOST = 6;
const DECAY_PER_TICK = 0.8;
const ACTIVE_THRESHOLD = 40;
const HATCH_DELAY_MS = 1500;

function HatchEggScreen({
  seconds,
  backendReady,
  onHatchComplete,
}: {
  seconds: number;
  backendReady: boolean;
  onHatchComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [isHatching, setIsHatching] = useState(false);
  const [hatchAnimDone, setHatchAnimDone] = useState(false);

  // 孵化完成 → 等动画播完 + 后端就绪 → 跳转
  useEffect(() => {
    if (!isHatching) return;
    const t = setTimeout(() => setHatchAnimDone(true), HATCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [isHatching]);

  useEffect(() => {
    if (hatchAnimDone && backendReady) {
      onHatchComplete();
    }
  }, [hatchAnimDone, backendReady, onHatchComplete]);

  // 定时器:不操作时衰减
  useEffect(() => {
    if (isHatching) return;
    const timer = setInterval(() => {
      setProgress((prev) => Math.max(0, prev - DECAY_PER_TICK));
    }, 50);
    return () => clearInterval(timer);
  }, [isHatching]);

  // 进度到 100 → 孵化
  useEffect(() => {
    if (progress >= 100 && !isHatching) {
      setIsHatching(true);
    }
  }, [progress, isHatching]);

  const handleClick = () => {
    if (isHatching) return;
    setProgress((prev) => Math.min(100, prev + CLICK_BOOST));
  };

  // 根据进度选视频(素材暂统一用孵蛋.mp4)
  const videoSrc = "/孵蛋.mp4";

  return (
    <ScreenFrame keyId="hatch" bg={COMMON_BG}>
      <div className="flex flex-col items-center justify-center" style={{ minHeight: "70vh" }}>
        {/* 标题 */}
        <h1
          className="text-center font-extrabold mb-2"
          style={{
            fontSize: "clamp(1.5rem, 6.5vw, 2rem)",
            background: "linear-gradient(135deg, #c084fc 0%, #ec4899 50%, #a855f7 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            WebkitTextFillColor: "transparent",
            letterSpacing: "0.06em",
            filter: "drop-shadow(0 2px 8px rgba(196,167,231,0.55))",
          }}
        >
          {isHatching ? "✨ 小妖怪破壳而出 ✨" : "点击妖蛋，孵化今日小妖怪"}
        </h1>

        {/* 妖蛋视频区 */}
        <motion.div
          className="relative cursor-pointer select-none"
          onClick={handleClick}
          animate={isHatching ? { scale: [1, 1.15, 1] } : {}}
          transition={{ duration: 0.6 }}
          style={{ touchAction: "manipulation" }}
          aria-label="点击孵化妖蛋"
        >
          {/* 蛋周光晕:进度越高越亮 */}
          <div
            aria-hidden
            className="absolute pointer-events-none rounded-full"
            style={{
              inset: -40,
              background: `radial-gradient(circle, rgba(255,210,240,${0.3 + progress / 200}), rgba(196,167,231,${0.15 + progress / 400}), transparent 70%)`,
              filter: "blur(18px)",
            }}
          />

          <video
            key={isHatching ? "hatch" : progress >= ACTIVE_THRESHOLD ? "active" : "idle"}
            src={videoSrc}
            poster="/monster.png"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="relative select-none"
            style={{
              width: 260,
              height: 260,
              objectFit: "contain",
              filter: `drop-shadow(0 18px 35px rgba(180,90,220,0.35)) brightness(${1 + progress * 0.003})`,
              transform: `scale(${1 + progress * 0.001})`,
              transition: "transform 0.12s ease, filter 0.12s ease",
            }}
            onLoadedData={(e) => {
              const v = e.currentTarget;
              v.currentTime = 0.05;
              v.play().catch(() => {});
            }}
          />

          {/* 孵化白光 */}
          {isHatching && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 1.2 }}
              style={{ background: "white", filter: "blur(24px)" }}
            />
          )}
        </motion.div>

        {/* 进度条卡片 */}
        <div
          className="w-[86%] max-w-[320px] mt-6 px-5 py-4"
          style={{
            borderRadius: 22,
            background: "rgba(255,255,255,0.72)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            boxShadow: "0 12px 35px rgba(190,120,220,0.22)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-center justify-between mb-2.5">
            <span
              className="font-bold"
              style={{ color: "#8950aa", fontSize: "0.9rem" }}
            >
              孵化能量
            </span>
            <span
              className="font-extrabold"
              style={{ color: "#6b2d8b", fontSize: "1.1rem" }}
            >
              {Math.round(progress)}%
            </span>
          </div>
          <div
            className="w-full h-3.5 rounded-full overflow-hidden"
            style={{ background: "#f4dff8" }}
          >
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1, ease: "linear" }}
              style={{
                background: "linear-gradient(90deg, #ff8bd8, #b78cff, #7fdcff)",
                boxShadow: "0 1px 4px rgba(180,120,220,0.4) inset",
              }}
            />
          </div>
        </div>

        {/* 底部提示 */}
        <p
          className="mt-4 text-sm text-center"
          style={{ color: "rgba(74,29,86,0.65)" }}
        >
          {isHatching
            ? backendReady
              ? "小妖怪来啦！🎉"
              : "小妖怪正在赶来…🏃‍♀️"
            : "连续点击妖蛋，让小妖怪醒过来 ✨"}
        </p>

        {/* 后端等待秒数:孵满但后端还没好时显示 */}
        {isHatching && !backendReady && (
          <p className="mt-1 text-xs" style={{ color: "rgba(74,29,86,0.45)" }}>
            已等候 {seconds} 秒
          </p>
        )}

        {/* 浮动装饰星星 */}
        <div className="relative w-full mt-4" style={{ height: 50 }}>
          {[
            { top: "10%", left: "12%", size: 16, color: "#fbcfe8", delay: "0s" },
            { top: "50%", left: "78%", size: 14, color: "#e9d5ff", delay: "0.5s" },
            { top: "70%", left: "30%", size: 18, color: "#fde68a", delay: "1s" },
            { top: "20%", left: "62%", size: 12, color: "#c4b5fd", delay: "0.3s" },
          ].map((s, i) => (
            <span
              key={i}
              className="absolute am-star pointer-events-none"
              style={{
                top: s.top,
                left: s.left,
                animationDelay: s.delay,
                fontSize: s.size,
                color: s.color,
              }}
              aria-hidden
            >
              ✦
            </span>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 1 ---------------- */

// 公用:Screen 1 / 2 / 5 用同一张占卜屋背景图。
// 通过 ScreenFrame 的 bg prop 注入 → 图片以 absolute 方式贴在 motion.div 里(手机屏的范围),
// 不会全屏铺到 viewport,内容永远渲染在它上面。
const COMMON_BG = encodeURI("/妖妖占卜屋1.png");

/**
 * MonsterScreen —— "专属小妖怪生成结果页"
 * 改为竖版海报式单屏布局:奶油粉/桃色背景,大标题 + 角色 + 诗句卡片 + 标签 + 底部按钮。
 *
 * 调参速查:
 *   - 背景渐变:见下方 fixed bg div 的 style.background
 *   - 主标题色 / 阴影:BRAND_DARK
 *   - 角色尺寸:<AnimatedMonster size={...} />,默认 280
 *   - 落地椭圆阴影:monster wrapper 下的 absolute div
 *   - 诗句拆分:取自 m.attributes[3](性格特征),按"，"切两段
 *   - 标签内容:chips 数组
 *   - 装饰 emoji:DECOR 数组
 */
function MonsterScreen({ onNext, monsterSrc, monsterPoster }: { onNext: () => void; monsterSrc: string; monsterPoster: string }) {
  const m = yaoyaoData.monster;

  // 主深色——按需求"深棕色"。可在这里统一调
  const BRAND_DARK = "#5a2d1f";

  // 把"嘴上摆烂，心里偷偷着急"这种逗号分隔的句子拆成两行,作为诗句主文案
  const personality = m.attributes[3]?.value ?? m.type;
  const parts = personality.split(/[，,、]/).map((s) => s.trim()).filter(Boolean);
  const line1 = parts[0] ?? personality;
  const line2 = parts[1] ?? "";
  // 副文案:用出没时段拼一句口语
  const subline = `它每天 ${m.attributes[0]?.value ?? "深夜"} 准时蹲在你脑子里`;

  // 标签:从 type / attributes 抽,不引入新文案字段
  const chips = [
    `#${m.type.replace("小妖怪", "").replace("型", "").trim() || "今日妖怪"}`,
    `#${m.attributes[0]?.value ?? "深夜出没"}`,
    `#${m.attributes[2]?.value?.split(/[、，,]/)[0] ?? "假装自律"}`,
  ];

  // 装饰 emoji:轻量、左右零散分布
  const DECOR = [
    { emoji: "✨", top: "4%", left: "4%", size: 20, opacity: 0.7 },
    { emoji: "🌙", top: "12%", right: "6%", size: 18, opacity: 0.55 },
    { emoji: "🍪", top: "44%", left: "2%", size: 18, opacity: 0.55 },
    { emoji: "⭐", top: "38%", right: "3%", size: 16, opacity: 0.6 },
    { emoji: "💭", top: "62%", left: "4%", size: 16, opacity: 0.5 },
  ];

  return (
    <ScreenFrame keyId="monster" bg={COMMON_BG}>
      {/* 装饰 emoji,绝对定位,pointer-events-none */}
      <div className="relative" aria-hidden>
        {DECOR.map((d, i) => (
          <span
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              top: d.top,
              left: d.left,
              right: d.right,
              fontSize: d.size,
              opacity: d.opacity,
            }}
          >
            {d.emoji}
          </span>
        ))}
      </div>

      {/* 海报主体:flex 列,min-h 撑满,按钮通过 mt-auto 顶到底部 */}
      <div className="flex flex-col items-center min-h-[calc(100svh-7rem)] pt-2">
        {/* 顶部小字 */}
        <p className="text-xs sm:text-sm mb-1 mt-1" style={{ color: "rgba(90,45,31,0.7)" }}>
          你的收藏夹里住着一只
        </p>

        {/* 大标题 —— 妖怪名字 */}
        <h1
          className="font-extrabold tracking-wide"
          style={{
            color: BRAND_DARK,
            fontSize: "clamp(2.2rem, 9vw, 3rem)",
            textShadow: "0 2px 6px rgba(90,45,31,0.18)",
            lineHeight: 1.1,
          }}
        >
          {m.name}
        </h1>

        {/* 角色 + 落地椭圆阴影 */}
        <div className="relative mt-4 mb-1">
          <AnimatedMonster size={300} src={monsterSrc} poster={monsterPoster} />
          {/* 淡粉色椭圆落地阴影 */}
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2"
            style={{
              bottom: "2%",
              width: "55%",
              height: 14,
              borderRadius: "50%",
              background: "radial-gradient(ellipse at center, rgba(244,114,182,0.45), transparent 70%)",
              filter: "blur(3px)",
            }}
          />
        </div>

        {/* 中部奶油色诗句卡片 */}
        <div
          className="w-[86%] mt-4 px-6 py-5 text-center"
          style={{
            background: "rgba(255,253,247,0.82)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            borderRadius: 32,
            border: "1px solid rgba(255,255,255,0.7)",
            boxShadow: "0 10px 28px -12px rgba(180,90,60,0.2)",
          }}
        >
          <p className="font-bold leading-snug" style={{ color: BRAND_DARK, fontSize: "clamp(1rem, 4.6vw, 1.25rem)" }}>
            {line1}，
          </p>
          {line2 && (
            <p className="font-bold leading-snug" style={{ color: BRAND_DARK, fontSize: "clamp(1rem, 4.6vw, 1.25rem)" }}>
              {line2}。
            </p>
          )}
          <p className="text-sm mt-3" style={{ color: "rgba(90,45,31,0.7)" }}>
            {subline}。
          </p>
        </div>

        {/* 标签胶囊 */}
        <div className="flex flex-wrap justify-center gap-2 mt-4 w-[86%]">
          {chips.map((c) => (
            <span
              key={c}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                background: "rgba(255,255,255,0.65)",
                color: "#7a3d2a",
                border: "1px solid rgba(255,255,255,0.55)",
                backdropFilter: "blur(4px)",
              }}
            >
              {c}
            </span>
          ))}
        </div>

        {/* 间距 spacer:把按钮顶到屏幕底部(同时保留页面可滚动时按钮跟随内容) */}
        <div className="flex-1 min-h-6" />

        {/* 底部按钮 —— 深棕色大圆角,沿用原跳转逻辑 */}
        <button
          onClick={onNext}
          className="w-[86%] font-bold transition-transform active:scale-[0.98]"
          style={{
            background: "linear-gradient(180deg, #6b3a23, #4a2412)",
            color: "#fff5ea",
            borderRadius: 999,
            padding: "1.15rem 1.5rem",
            fontSize: "1rem",
            boxShadow: "0 12px 26px -8px rgba(74,36,18,0.5), inset 0 1px 0 rgba(255,255,255,0.15)",
            letterSpacing: "0.04em",
          }}
        >
          🎁 看看它叼来了什么
        </button>
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 2 ---------------- */
/**
 * ReportScreen —— "今日状态报告"
 *
 * 极简自然风:中心一只大妖怪 + 周围 4 片代表 MBTI 的叶子 + 下方两朵大白云。
 *   - 顶部只有大标题"今日状态报告",无副文案、无小妖怪名字 / 副标题、无"今日 MBTI 人格配方"小标题
 *   - 中央:140px 圆形 mp4 视频(送信小妖怪上位为主视觉)
 *   - 周围:4 片叶子,大小按 MBTI 占比缩放,叶尖朝外像花瓣
 *   - 点叶子 → 下方解释条 AnimatePresence
 *   - 下方:2 朵更大的白云(minHeight 150),字号更大
 *   - 底部:粉紫蓝梦幻渐变 CTA
 *
 * 调参速查:
 *   - 中心妖怪大小       → CENTER_SIZE
 *   - 中心妖怪视频源     → <CenterMonster /> 内 src(默认 /monster.mp4)
 *   - 叶子基础大小       → PETAL_BASE_W / PETAL_BASE_H
 *   - 叶子占比→大小映射  → scaleFor(percent)
 *   - 叶子摆放位置/旋转  → PETAL_LAYOUT 数组
 *   - 云朵默认高度       → <Cloud minHeight={...} />
 *   - 主深棕文字色       → BRAND_DARK
 */

const BRAND_DARK = "#5a2d1f";

// 中心妖怪视觉直径(px)。不再是"白圆头像",而是 mp4 用 mask 羽化成柔和圆形 + 背后浅粉光晕。
const CENTER_SIZE = 220;

// 叶子基础尺寸(占比 = 1.0 时);最终尺寸 = base * scaleFor(percent)
// 这一版再放大一大档:230×280 → 310×380,叶子真正成为主视觉的一部分,不再像装饰背景。
const PETAL_BASE_W = 310;
const PETAL_BASE_H = 380;

// 占比 → 视觉缩放:35% → 1.0;下限提高到 0.85,即使小占比叶子也保持大块头。
function scaleFor(percent: number) {
  return Math.max(0.85, Math.min(1.0, 0.6 + (percent / 35) * 0.4));
}

// 4 片叶子在 stage(正方形)中的位置 + 旋转(叶尖朝外像花瓣)
// 顺序对应 yaoyaoData.mbtiMix 顺序 [INFP, ENFP, INTJ, ISFP]
// 位置外推到 28%/72%,让叶子可见部分更多(叶根才进入妖怪范围)
const PETAL_LAYOUT = [
  { left: "28%", top: "28%", rotate: -55 },  // 左上 — 叶尖指左上
  { left: "72%", top: "28%", rotate: 55 },   // 右上 — 叶尖指右上
  { left: "28%", top: "72%", rotate: -125 }, // 左下 — 叶尖指左下
  { left: "72%", top: "72%", rotate: 125 },  // 右下 — 叶尖指右下
];

function ReportScreen({ onNext, monsterSrc, monsterPoster }: { onNext: () => void; monsterSrc: string; monsterPoster: string }) {
  const [active, setActive] = useState<number | null>(null);
  const data = yaoyaoData.mbtiMix;

  return (
    <ScreenFrame keyId="report" bg={COMMON_BG}>
      {/* 只保留大标题,无副文案 */}
      <h1
        className="text-center text-2xl font-bold mb-4"
        style={{ color: BRAND_DARK }}
      >
        今日状态报告
      </h1>

      {/* 主视觉:中心妖怪 + 4 片 MBTI 叶子(正方形 stage,响应式) */}
      <div
        className="relative mx-auto"
        style={{
          width: "100%",
          maxWidth: 408,
          aspectRatio: "1 / 1",
          overflow: "visible",
        }}
      >
        {/* 叶子轨道:整层 360° 旋转。active !== null 时暂停。
            动画周期 24s,linear 匀速。叶子内部会反向旋转抵消,文字保持竖直。 */}
        <div
          className="absolute inset-0"
          style={{
            animation: "petalOrbit 24s linear infinite",
            animationPlayState: active !== null ? "paused" : "running",
          }}
        >
          {data.map((d, i) => (
            <MbtiPetal
              key={d.type}
              type={d.type}
              percent={d.percent}
              color={d.color}
              pos={PETAL_LAYOUT[i]}
              active={active === i}
              orbitPaused={active !== null}
              onClick={() => setActive((prev) => (prev === i ? null : i))}
            />
          ))}
        </div>

        {/* 中心妖怪 mp4 —— 轨道之外,不参与旋转 */}
        <CenterMonster size={CENTER_SIZE} src={monsterSrc} poster={monsterPoster} />
      </div>

      {/* 点叶子后的 MBTI 解释条。
          未选中时不渲染,不占空间;选中时直接出现并淡入,页面跟随重排。
          ★ 去掉了 height: 0 → "auto" 动画 —— motion 的 auto-height 偶尔会卡在 0
            导致解释看不见,改成纯 opacity + y 平移,更稳定。 */}
      <div className="mx-auto mt-3" style={{ maxWidth: "92%" }}>
        <AnimatePresence mode="wait">
          {active !== null && (
            <motion.div
              key={data[active].type}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl px-4 py-3 leading-relaxed"
              style={{
                background: data[active].color + "55",
                border: `1px solid ${data[active].color}AA`,
                color: BRAND_DARK,
                fontSize: "0.95rem",
                boxShadow: `0 6px 18px -8px ${data[active].color}99`,
              }}
            >
              <b style={{ fontSize: "1.05rem", marginRight: 6 }}>
                {data[active].type}
              </b>
              {data[active].cute}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 大白云 1:能量值。和上方主视觉的间距收紧到 mt-3 */}
      <Cloud className="mt-3" minHeight={180}>
        <div
          className="text-base font-bold mb-3"
          style={{ color: BRAND_DARK }}
        >
          ⚡ 今日能量值
        </div>
        <div className="flex items-center gap-4">
          <div
            className="flex-1 h-5 rounded-full overflow-hidden"
            style={{ background: "rgba(244,114,182,0.2)" }}
          >
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${yaoyaoData.energyScore}%` }}
              transition={{ duration: 1 }}
              className="h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg,#ffd98a,#f8b6d2,#cdb6f8,#a3c4ff)",
                boxShadow: "0 1px 4px rgba(244,114,182,0.35) inset",
              }}
            />
          </div>
          <span
            className="font-extrabold"
            style={{ color: BRAND_DARK, fontSize: "2.25rem", lineHeight: 1 }}
          >
            {yaoyaoData.energyScore}
          </span>
        </div>
      </Cloud>

      {/* 大白云 2:今日情绪 —— flowDelay 错开半个周期(3s 周期 → -1.5s),
          和上面那朵不同步,视觉上是两朵不同状态的云 */}
      <Cloud className="mt-4" minHeight={180} flowDelay="-1.5s" turbFreq="0.018 0.024">
        <div
          className="text-base font-bold mb-2"
          style={{ color: BRAND_DARK }}
        >
          ☁️ 今日情绪
        </div>
        <p
          className="leading-relaxed"
          style={{
            color: "rgba(90,45,31,0.88)",
            fontSize: "1.15rem",
          }}
        >
          {yaoyaoData.emotionText}
        </p>
      </Cloud>

      {/* CTA:粉紫蓝梦幻渐变,略放大 */}
      <button
        onClick={onNext}
        className="w-full mt-7 mb-2 font-bold transition-transform active:scale-[0.98]"
        style={{
          background:
            "linear-gradient(135deg,#f7a8c4 0%,#c8a6e9 55%,#a3c4ff 100%)",
          color: "white",
          borderRadius: 999,
          padding: "1.15rem 1.5rem",
          fontSize: "1.05rem",
          letterSpacing: "0.05em",
          boxShadow:
            "0 14px 30px -8px rgba(196,167,231,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        进入妖妖占卜屋 🔮
      </button>
    </ScreenFrame>
  );
}

/* —— ReportScreen 内部辅助组件 —— */

/**
 * 单片可点击 MBTI 叶子。
 *
 * 结构:
 *   - 外层 button:绝对定位 + 平移到位置中心(translate(-50%, -50%))
 *   - 内层 wrapper:做 active 时的整体放大(scale 1.06)
 *   - SVG 叶子:viewBox 用了较大的 padding(-30 到 130 范围),保证旋转后不会被剪
 *   - 文字 overlay:始终保持竖直,不随叶子一起旋转
 */
function MbtiPetal({
  type,
  percent,
  color,
  pos,
  active,
  orbitPaused,
  onClick,
}: {
  type: string;
  percent: number;
  color: string;
  pos: { left: string; top: string; rotate: number };
  active: boolean;
  orbitPaused: boolean;
  onClick: () => void;
}) {
  const scale = scaleFor(percent);
  const w = PETAL_BASE_W * scale;
  const h = PETAL_BASE_H * scale;

  return (
    <button
      onClick={onClick}
      aria-label={`${type} ${percent}%`}
      className="absolute"
      style={{
        left: pos.left,
        top: pos.top,
        width: w,
        height: h,
        transform: "translate(-50%, -50%)",
        background: "transparent",
        border: "none",
        padding: 0,
        cursor: "pointer",
        // 显式开启点击,防止任何上层"装饰"容器(比如 monster halo)误关掉
        pointerEvents: "auto",
        // 未选中:在妖怪(z-20)之下,叶根被妖怪盖住 → 花瓣式构图
        // 选中:抬到 z-25,叶子盖在妖怪前面,视觉强反馈
        zIndex: active ? 25 : 10,
      }}
    >
      {/* 反旋层:轨道在公转,本层逆时针自转 → 抵消轨道的旋转,
          这样"叶面 + 文字"看起来不会随轨道翻跟头,只是绕中心绕圈。
          周期必须和外层 petalOrbit 一致(24s linear)。 */}
      <div
        className="relative w-full h-full"
        style={{
          animation: "petalOrbitCounter 24s linear infinite",
          animationPlayState: orbitPaused ? "paused" : "running",
          // active 反馈用 transition 而非额外 transform 链,避免和动画冲突
          transition: "filter 0.2s ease",
          filter: active ? "brightness(1.05)" : undefined,
        }}
      >
        {/* 叶子 SVG(viewBox 留出旋转空间,避免叶尖被剪) */}
        <svg
          viewBox="-30 -30 160 190"
          className="absolute inset-0 w-full h-full"
          aria-hidden
          style={{
            filter: `drop-shadow(0 6px 14px ${color}66)`,
            transform: active ? "scale(1.06)" : "scale(1)",
            transition: "transform 0.25s ease",
          }}
        >
          <g transform={`rotate(${pos.rotate} 50 65)`}>
            {/* 主叶面 */}
            <path
              d="M50 4 C 86 22, 86 102, 50 126 C 14 102, 14 22, 50 4 Z"
              fill={color}
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="1.5"
            />
            {/* 中脉 */}
            <path
              d="M50 10 Q 52 65 50 120"
              stroke="rgba(255,255,255,0.55)"
              strokeWidth="1.4"
              fill="none"
            />
            {/* 侧脉 — 3 对 */}
            <path d="M50 35 Q 65 38 75 35" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
            <path d="M50 35 Q 35 38 25 35" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
            <path d="M50 65 Q 68 68 80 65" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
            <path d="M50 65 Q 32 68 20 65" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
            <path d="M50 92 Q 64 95 72 92" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
            <path d="M50 92 Q 36 95 28 92" stroke="rgba(255,255,255,0.4)" strokeWidth="1" fill="none" />
          </g>
        </svg>

        {/* 始终竖直的文字 overlay */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span
            className="font-extrabold leading-none"
            style={{
              color: BRAND_DARK,
              // 文字也跟着 scale,但加最小值防止小叶子文字过小
              fontSize: Math.max(15, 20 * scale),
              textShadow: "0 1px 2px rgba(255,255,255,0.7)",
            }}
          >
            {type}
          </span>
          <span
            className="font-semibold leading-none mt-1.5"
            style={{
              color: "rgba(90,45,31,0.78)",
              fontSize: Math.max(12, 15 * scale),
            }}
          >
            {percent}%
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * 中心妖怪 mp4:绝对居中。
 * 不再用"白圆头像 + 白边 + 内阴影"的相框感视觉。
 * 改成:背后一层柔和粉色光晕(blur radial-gradient) + 视频本体用 mask 羽化边缘,
 * 让妖怪融进场景里,而不是"被装进一个白盘子里"。
 *
 * 替换 mp4 时只改这里的 src(以及可选 poster)。
 */
function CenterMonster({ size = CENTER_SIZE, src, poster }: { size?: number; src: string; poster: string }) {
  const maskValue =
    "radial-gradient(circle at 50% 50%, #000 50%, transparent 92%)";

  return (
    <div
      className="absolute"
      style={{
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 20,
        width: size,
        height: size,
        pointerEvents: "none",
      }}
    >
      <div
        aria-hidden
        className="absolute"
        style={{
          inset: -size * 0.18,
          background:
            "radial-gradient(circle at 50% 50%, rgba(255,210,230,0.55), rgba(255,230,240,0.2) 50%, transparent 70%)",
          filter: "blur(10px)",
        }}
      />
      {/* iOS 不支持 video 上的 CSS mask,把 mask 放在 wrapper div 上 */}
      <div
        className="relative w-full h-full"
        style={{
          WebkitMaskImage: maskValue,
          maskImage: maskValue,
        }}
      >
        <video
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
          className="w-full h-full object-contain select-none"
          style={{ background: "#1a0a2e" }}
        />
      </div>
    </div>
  );
}

/**
 * 云朵容器:SVG path 作为云形背景,内容浮在上层。
 *
 * 波浪流动感由两层组合产生:
 *   1) SVG <filter> 用 feTurbulence + feDisplacementMap 给云朵轮廓做**有机鼓包扰动**
 *      → 边缘看起来不是光滑曲线,而是被风拂过的不规则鼓包,像云的波浪
 *   2) CSS .cloud-flow 关键帧 → 整朵云轻微 translate + skewX + scaleY 起伏
 *      → 云朵整体在缓缓飘
 *
 * 不再用 SMIL <animate>(在 React SSR + hydration 下偶发失效)。
 *
 * `displaceScale` 控制轮廓鼓包幅度;`turbFreq` 控制鼓包密度;`wavy` 关掉动画。
 */
const CLOUD_PATH =
  "M40 110 C 8 110, 8 70, 40 68 C 38 38, 80 28, 100 50 C 115 18, 165 18, 180 48 C 200 18, 250 18, 265 50 C 290 25, 340 35, 340 70 C 380 70, 380 115, 345 118 C 365 155, 295 165, 275 138 C 250 168, 200 168, 175 138 C 150 168, 100 165, 85 138 C 60 162, 15 145, 40 110 Z";

function Cloud({
  children,
  className = "",
  minHeight = 180,
  wavy = true,
  displaceScale = 12,
  turbFreq = "0.014 0.02",
  flowDelay = "0s",
}: {
  children: React.ReactNode;
  className?: string;
  minHeight?: number;
  wavy?: boolean;
  displaceScale?: number;
  turbFreq?: string;
  flowDelay?: string;
}) {
  // 每个 Cloud 实例需要唯一 filter id,避免多朵云共用同一个 filter 被覆盖
  const rawId = useId();
  const filterId = `cloud-wave-${rawId.replace(/:/g, "")}`;

  return (
    <div className={`relative ${className}`} style={{ minHeight }}>
      <svg
        viewBox="0 0 400 180"
        preserveAspectRatio="none"
        className={`absolute inset-0 w-full h-full ${wavy ? "cloud-flow" : ""}`}
        aria-hidden
        style={{
          filter: "drop-shadow(0 10px 24px rgba(160,140,210,0.22))",
          animationDelay: flowDelay,
        }}
      >
        <defs>
          <filter
            id={filterId}
            x="-10%"
            y="-10%"
            width="120%"
            height="120%"
          >
            {/* fractalNoise 给云边缘做有机扰动。
                baseFrequency 控制鼓包密度(数值越大鼓包越细密)。
                numOctaves 控制层次复杂度。
                seed 不同 → 每朵云的鼓包形状不同。 */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency={turbFreq}
              numOctaves={2}
              seed={(rawId.charCodeAt(rawId.length - 2) || 7) % 50}
              result="noise"
            />
            {/* 把 source(也就是 path)按 noise 做位移。
                scale 越大,边缘鼓包/扭曲越明显(6~10 是甜区,过大会破形)。 */}
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={displaceScale}
            />
          </filter>
        </defs>
        <path
          d={CLOUD_PATH}
          fill="rgba(255,255,255,0.94)"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="1"
          filter={wavy ? `url(#${filterId})` : undefined}
        />
      </svg>

      <div
        className="relative z-10 flex flex-col justify-center"
        style={{ padding: "1.5rem 2rem", minHeight }}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- Screen 3 transition ---------------- */
function TransitionScreen({ onDone }: { onDone: () => void }) {
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
      {/* stars */}
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
        initial={{ y: -200, rotate: -30, scale: 0.4 }}
        animate={{ y: 0, rotate: 0, scale: 1.6 }}
        transition={{
          y: { type: "spring", bounce: 0.6, duration: 1.4 },
          rotate: { type: "spring", bounce: 0.6, duration: 1.4 },
          scale: { duration: 1.8, ease: "easeOut" },
        }}
      >
        {/* 用 黑夜转身.mp4 替代原 CuteMonster:autoPlay + loop 保证一进来就播 + 不会进入"已结束"
            状态而触发某些浏览器(尤其安卓 Chrome / X5)自动注入的"1.00 倍速"播放速度控件。
            controlsList / disablePictureInPicture 进一步阻止任何浏览器自动加角标 / 控件。
            和首页 AnimatedMonster 同样的属性集。 */}
        <video
          src={encodeURI("/黑夜转身.mp4")}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
          className="rounded-full object-cover select-none"
          style={{
            width: 220,
            height: 220,
            border: "5px solid rgba(255,255,255,0.95)",
            boxShadow:
              "0 0 60px rgba(255,200,240,0.55), 0 24px 48px -10px rgba(60,30,90,0.6)",
          }}
          aria-hidden
        />
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

/* ---------------- Screen 4 ---------------- */
/**
 * QuestionsScreen —— "妖妖占卜屋"
 *
 * 简化:
 *   - 移除"今日浏览数据分析"白卡
 *   - 移除 Q1/Q2/Q3 前缀
 *   - 只显示前 3 个问题(yaoyaoData.recommendedQuestions.slice(0, 3))
 *   - 整页用 /妖妖占卜屋.png 做全屏背景图(放在 public/)
 *
 * 视觉:
 *   - 全屏背景图(fixed inset-0, -z-20)
 *   - 柔雾遮罩(fixed inset-0, -z-10)
 *   - 标题在顶部,flex-1 间距把 3 张卡片推到屏幕下方,中间留出小屋区域
 *   - 卡片用"渐变描边 + 磨砂玻璃"双层结构(双 background trick)
 *
 * 调参速查:
 *   - 替换背景图:把 /妖妖占卜屋.png 换成 public/ 里别的文件,改下面 BG_IMAGE_PATH
 *   - 卡片描边颜色:CARD_GRADIENT
 *   - 卡片玻璃透明度:卡片内层 background rgba 的 alpha
 *   - 装饰位置:DECOR 数组
 */
const BG_IMAGE_PATH = encodeURI("/妖妖占卜屋.png");
const CARD_GRADIENT =
  "linear-gradient(135deg, rgba(216,180,254,0.95) 0%, rgba(249,168,212,0.95) 50%, rgba(196,181,253,0.95) 100%)";

function QuestionsScreen({ onPick }: { onPick: (q: string) => void }) {
  // 只取前 3 个问题(数据里有 4 个,但本屏只展示 3 个)
  const questions = yaoyaoData.recommendedQuestions.slice(0, 3);

  // 顶部少量装饰 —— 不要堆太多
  const DECOR = [
    { emoji: "✨", top: "1%",  left: "5%",  fontSize: 22, opacity: 0.75 },
    { emoji: "🌙", top: "3%",  right: "8%", fontSize: 18, opacity: 0.6  },
  ];

  return (
    <ScreenFrame keyId="questions">
      <div className="relative">
        {/* 顶部装饰 */}
        {DECOR.map((d, i) => (
          <span
            key={i}
            className="absolute pointer-events-none select-none"
            style={{
              top: d.top,
              left: d.left,
              right: d.right,
              fontSize: d.fontSize,
              opacity: d.opacity,
            }}
            aria-hidden
          >
            {d.emoji}
          </span>
        ))}

        {/* 标题 */}
        <div className="text-center pt-2">
          <h1
            className="font-extrabold"
            style={{
              color: "#4a1d56",
              fontSize: "clamp(1.85rem, 7.5vw, 2.4rem)",
              textShadow:
                "0 2px 12px rgba(255,255,255,0.8), 0 1px 3px rgba(74,29,86,0.25)",
              letterSpacing: "0.08em",
              lineHeight: 1.15,
            }}
          >
            妖妖占卜屋
          </h1>
          {/* 副标题已挪到下方 3 个问题卡上面;此处只保留主标题,占位更紧凑 */}
        </div>

        {/* 妖妖占卜屋 图片 —— 普通 <img> 按原图宽高比展示。
            -mx-5 抵消 ScreenFrame 的 px-5,让图片左右贴齐到手机宽 */}
        <div className="mt-2 -mx-5">
          <img
            src={BG_IMAGE_PATH}
            alt=""
            className="w-full h-auto block select-none"
            draggable={false}
          />
        </div>

        {/* 3 个梦幻问题卡 —— 用负 margin-top 把卡片拉到图片下半部分,
            视觉上覆盖在屋子下半截上。
            % 的 margin 相对于父容器 WIDTH 计算,所以在不同手机尺寸上比例一致。
            想覆盖更多 / 更少 → 调下面的 -70% */}
        <div
          className="relative flex flex-col gap-3.5 pb-2"
          style={{ marginTop: "-70%" }}
        >
          {/* 副标题 —— 移到这里,正好挂在 3 个问题卡上面 */}
          <p
            className="text-center text-sm mb-1 font-medium"
            style={{
              color: "rgba(74,29,86,0.85)",
              textShadow: "0 1px 4px rgba(255,255,255,0.85)",
              letterSpacing: "0.05em",
            }}
          >
            ✨ 选一个你今天最想问的问题 ✨
          </p>
          {questions.map((q, i) => (
            <motion.button
              key={q}
              onClick={() => onPick(q)}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.1, type: "spring", stiffness: 200, damping: 20 }}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="relative rounded-[28px] text-left"
              style={{
                // 外层(渐变描边):2px 的内边距让渐变作为"边框"露出来
                padding: "2px",
                background: CARD_GRADIENT,
                boxShadow:
                  "0 12px 30px -8px rgba(168,121,224,0.55), 0 0 0 1px rgba(255,255,255,0.4) inset",
                cursor: "pointer",
                border: "none",
              }}
            >
              {/* 内层(磨砂玻璃):半透明白 + backdrop-blur,实现梦幻气泡感 */}
              <div
                className="rounded-[26px] px-5 py-4 font-medium leading-relaxed"
                style={{
                  background: "rgba(255,253,255,0.7)",
                  backdropFilter: "blur(14px)",
                  WebkitBackdropFilter: "blur(14px)",
                  color: "#3d1745",
                  fontSize: "0.95rem",
                  boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                }}
              >
                {q}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </ScreenFrame>
  );
}

/* ---------------- Screen 5 ---------------- */
/**
 * AnswersScreen —— 5 个情绪小妖怪选答案
 *
 * 版式按 mockup:
 *   - 顶部:整张 妖妖占卜屋screen5.png 横向铺到容器满宽 + 半透明大标题压在上面
 *   - 中部:你选择的问题卡片(渐变边框 + 磨砂玻璃)
 *   - 副标题:点一个小妖怪…(两侧 ⌒⌒ 小装饰)
 *   - 5 只情绪 mp4 用 3+2 网格摆开,每只圆形磨砂气泡
 *   - 选中后:解释卡(emoji 头像 + 名字 + 情绪 chip + 回答)+ 渐变胶囊 CTA
 *
 * 视频源对照表(注意:数据里是"炸毛球",对应的文件名是"炸毛毛.mp4"):见 EMOTION_VIDEO_BY_NAME
 *
 * 播放逻辑(没变):
 *   - 挂载后:5 个 video 各自 play().then(pause()) → 解码首帧并停住
 *   - active 变化:被选中的 play(),其他全部 pause()
 *   - 重新激活同一个:currentTime = 0 重头播
 */
const SCREEN5_BG = encodeURI("/妖妖占卜屋screen5.png");

const EMOTION_VIDEO_BY_NAME: Record<string, string> = {
  "乐啵啵": encodeURI("/乐啵啵.mp4"),
  "灰绵绵": encodeURI("/灰绵绵.mp4"),
  "怯团团": encodeURI("/怯团团.mp4"),
  "嫌叽叽": encodeURI("/嫌叽叽.mp4"),
  "炸毛毛": encodeURI("/炸毛毛.mp4"),
};

function AnswersScreen({
  question,
  onPick,
}: {
  question: string;
  onPick: (m: EmotionMonster) => void;
}) {
  const [active, setActive] = useState<EmotionMonster | null>(null);
  const monsters = yaoyaoData.emotionMonsters;
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);

  // active 切换:被点的 play,其他 pause;同一个重新激活则从头播
  useEffect(() => {
    monsters.forEach((m, i) => {
      const v = videoRefs.current[i];
      if (!v) return;
      if (active?.name === m.name) {
        v.currentTime = 0;
        v.play().catch(() => {});
      } else {
        v.pause();
      }
    });
  }, [active, monsters]);

  return (
    <ScreenFrame keyId="answers" bg={COMMON_BG}>
      {/* 标题 */}
      <h1
        className="font-extrabold mb-4 mt-1"
        style={{
          color: "#fffaf2",
          fontSize: "clamp(1.5rem, 6.5vw, 2rem)",
          textShadow:
            "0 0 14px rgba(180,120,220,0.95), 0 0 4px rgba(255,255,255,1), 0 3px 8px rgba(70,30,90,0.55)",
          letterSpacing: "0.08em",
          lineHeight: 1.1,
        }}
      >
        妖妖占卜屋{" "}
        <span
          style={{
            filter: "drop-shadow(0 2px 6px rgba(255,160,220,0.5))",
            fontSize: "0.9em",
          }}
        >
          🔮
        </span>
      </h1>

      {/* 内容直接走文档流 —— 删掉了之前的 marginTop:-150% 负 margin 覆盖手法,
          因为顶部已经没有占位图片;问题卡 / 5 妖怪 / 解释卡 / CTA 自然向上 */}
      <div className="relative">
        {/* === 你选择的问题 卡片 === */}
        <div
          className="relative rounded-[26px] mb-4"
          style={{
            padding: "2px",
            background: CARD_GRADIENT,
            boxShadow:
              "0 10px 24px -8px rgba(168,121,224,0.45), 0 0 0 1px rgba(255,255,255,0.4) inset",
          }}
        >
          <div
            className="rounded-[24px] px-5 py-3.5"
            style={{
              background: "rgba(255,253,255,0.82)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            <div
              className="text-xs font-medium mb-1 flex items-center gap-1.5"
              style={{ color: "rgba(74,29,86,0.55)" }}
            >
              <span>✨</span>
              <span>你选择的问题</span>
            </div>
            <div
              className="text-base font-bold leading-snug"
              style={{ color: "#3d1745" }}
            >
              {question}
            </div>
          </div>
        </div>

        {/* === 副标题 === */}
        <div className="flex items-center justify-center gap-2.5 mb-4">
          <span aria-hidden style={{ color: "#d8b4fe", fontSize: 14, letterSpacing: "-2px" }}>
            ⌒⌒
          </span>
          <span
            className="text-sm font-medium"
            style={{ color: "rgba(74,29,86,0.85)", letterSpacing: "0.03em" }}
          >
            点一个小妖怪,听听 TA 怎么说
          </span>
          <span aria-hidden style={{ color: "#d8b4fe", fontSize: 14, letterSpacing: "-2px" }}>
            ⌒⌒
          </span>
        </div>

        {/* === 5 只情绪 mp4:圆环布局 ===
            从顶部开始(-π/2),逆时针 5 等分,每只放在 STAGE 圆周上。
            STAGE_W/H 是正方形舞台尺寸,RADIUS 是中心到妖怪中心的距离。
            想改气泡大小:MONSTER_SIZE;想改圆环半径:RADIUS。 */}
        {(() => {
          const STAGE_W = 320;
          const STAGE_H = 320;
          const MONSTER_SIZE = 100;
          const RADIUS = 110;
          const CX = STAGE_W / 2;
          const CY = STAGE_H / 2;
          return (
            <div
              className="relative mx-auto"
              style={{ width: STAGE_W, height: STAGE_H, maxWidth: "100%" }}
            >
              {monsters.map((m, i) => {
                const angle = (i / monsters.length) * Math.PI * 2 - Math.PI / 2;
                const x = CX + Math.cos(angle) * RADIUS - MONSTER_SIZE / 2;
                const y = CY + Math.sin(angle) * RADIUS - MONSTER_SIZE / 2;
                return (
                  <div
                    key={m.name}
                    className="absolute"
                    style={{ left: x, top: y, width: MONSTER_SIZE }}
                  >
                    <MonsterBubble
                      m={m}
                      index={i}
                      active={active?.name === m.name}
                      videoRefs={videoRefs}
                      onClick={() => setActive(m)}
                    />
                  </div>
                );
              })}
              {/* 中心装饰星 */}
              <div
                className="absolute pointer-events-none text-3xl"
                style={{
                  left: "50%",
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  animation: "floatSoft 3s ease-in-out infinite",
                }}
                aria-hidden
              >
                ✨
              </div>
            </div>
          );
        })()}

        {/* === 解释卡 + CTA(active 时才显示) === */}
        <AnimatePresence mode="wait">
          {active && (
            <motion.div
              key={active.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="mt-4"
            >
              <div
                className="relative rounded-[24px]"
                style={{
                  padding: "2px",
                  background: `linear-gradient(135deg, ${active.color}, rgba(249,168,212,0.9), ${active.color})`,
                  boxShadow: `0 12px 28px -8px ${active.color}99`,
                }}
              >
                <div
                  className="rounded-[22px] px-4 py-3.5 flex items-start gap-3"
                  style={{
                    background: `linear-gradient(135deg, ${active.color}33, rgba(255,253,255,0.85))`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                  }}
                >
                  <div
                    className="rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 56,
                      height: 56,
                      background: `radial-gradient(circle at 35% 30%, white, ${active.color} 75%)`,
                      border: "2.5px solid rgba(255,255,255,0.95)",
                      boxShadow: `0 6px 14px -4px ${active.color}AA`,
                      fontSize: "1.9rem",
                      lineHeight: 1,
                    }}
                  >
                    {active.emoji}
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="font-bold"
                        style={{ color: "#3d1745", fontSize: "1.05rem" }}
                      >
                        {active.name}
                      </span>
                      <span
                        className="px-2.5 py-[2px] rounded-full text-[10px] font-bold"
                        style={{
                          background: `linear-gradient(135deg, ${active.color}, ${active.color}CC)`,
                          color: "white",
                          letterSpacing: "0.05em",
                        }}
                      >
                        {active.emotion}
                      </span>
                    </div>
                    <p
                      className="leading-relaxed"
                      style={{
                        color: "rgba(61,23,69,0.88)",
                        fontSize: "0.92rem",
                      }}
                    >
                      {active.answer}
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onPick(active)}
                className="w-full mt-3 font-bold transition-transform active:scale-[0.98]"
                style={{
                  background:
                    "linear-gradient(135deg, #f7a8c4 0%, #c8a6e9 55%, #a3c4ff 100%)",
                  color: "white",
                  borderRadius: 999,
                  padding: "1.05rem 1.5rem",
                  fontSize: "1rem",
                  letterSpacing: "0.05em",
                  boxShadow:
                    "0 14px 30px -8px rgba(196,167,231,0.6), inset 0 1px 0 rgba(255,255,255,0.3)",
                }}
              >
                选择这个回答 💌
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ScreenFrame>
  );
}

/**
 * 单只情绪小妖怪气泡:圆形磨砂玻璃 + 内嵌 mp4。
 * 视频通过 videoRefs.current[index] 注册,由 AnswersScreen 的两个 useEffect 控制 play/pause。
 */
function MonsterBubble({
  m,
  index,
  active,
  videoRefs,
  onClick,
}: {
  m: EmotionMonster;
  index: number;
  active: boolean;
  videoRefs: React.MutableRefObject<(HTMLVideoElement | null)[]>;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="flex flex-col items-center w-full"
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      animate={{ scale: active ? 1.08 : 1 }}
      transition={{ type: "spring", stiffness: 260, damping: 18 }}
      aria-label={`${m.name}(${m.emotion})`}
    >
      {/* 圆形 mp4 容器 —— 1:1,占满 grid 单元格宽 */}
      <div
        className="rounded-full overflow-hidden relative w-full"
        style={{
          aspectRatio: "1 / 1",
          background: `radial-gradient(circle at 35% 30%, white, ${m.color} 70%)`,
          border: `3px solid ${active ? m.color : "rgba(255,255,255,0.92)"}`,
          boxShadow: active
            ? `0 12px 28px -6px ${m.color}, 0 0 0 6px ${m.color}40`
            : `0 8px 18px -6px ${m.color}AA`,
          transition: "border-color 0.25s, box-shadow 0.25s",
        }}
      >
        <video
          ref={(el) => {
            videoRefs.current[index] = el;
          }}
          src={EMOTION_VIDEO_BY_NAME[m.name]}
          loop
          muted
          playsInline
          preload="auto"
          className="w-full h-full object-cover"
          aria-hidden
          // ★ 强制渲染首帧:有些 mp4 的关键帧位置让 play()+pause() 不可靠,
          //   尤其 嫌叽叽 / 怯团团 这两段。loadeddata 是浏览器明确告知
          //   "已经拿到 currentTime 那一帧的数据"的时机,
          //   再 seek 一个微小偏移强制把那帧绘制到画面上。
          onLoadedData={(e) => {
            const v = e.currentTarget;
            try {
              v.currentTime = 0.05;
            } catch {
              /* 某些浏览器在 readyState 不够时会抛错,无所谓 */
            }
          }}
        />
      </div>
      <span
        className="text-xs font-semibold mt-1.5 whitespace-nowrap"
        style={{
          color: active ? "#3d1745" : "rgba(74,29,86,0.72)",
        }}
      >
        {m.name}
      </span>
    </motion.button>
  );
}

/* ---------------- Screen 6 ---------------- */
/**
 * CardScreen —— "今日专属妖妖卡 🎀"
 *
 * 这是一张可保存/分享的结果卡片,做成可复用模板:
 *   - 集中读取 resultData(从 yaoyaoData + props 拼装)
 *   - 边框、布局、装饰固定;文案、头像、MBTI、能量、情绪、问答全部根据数据动态变化
 *
 * 视觉风格:梦幻紫粉、玻璃拟态、星星水晶云朵装饰
 *
 * 调参速查:
 *   - 替换中央妖怪头像:resultData.monsterMedia(可填 mp4 或图片路径)
 *   - 主品牌色 / 文字色:BRAND_PURPLE / DEEP_PURPLE
 *   - 装饰星星 / 云朵位置:DECOR 数组
 *
 * 三个按钮的逻辑:
 *   - 保存(onSave):由父组件 YaoyaoApp 注入,目前是 toast。如要保存截图,
 *     可在父级用 html-to-image / dom-to-image 库截 #spook-card 节点。
 *   - 分享(onShare):同上,目前 toast,可换成 navigator.share()。
 *   - 再玩一次(onRestart):由父组件提供,跳回 Screen 1 并重置 state。
 */
function CardScreen({
  question,
  answer,
  monsterSrc,
  monsterPoster,
  onRestart,
  onSave,
  onShare,
}: {
  question: string;
  answer: EmotionMonster;
  monsterSrc: string;
  monsterPoster: string;
  onRestart: () => void;
  onSave: () => void;
  onShare: () => void;
}) {
  // —— 集中数据,模板化 ——
  const monster = yaoyaoData.monster;
  const topMbti = yaoyaoData.mbtiMix[0];
  const today = new Date();
  const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;

  const resultData = {
    brandName: "妖妖乐",
    date: dateStr,
    monsterName: monster.name,
    monsterType: monster.type,
    monsterMedia: monsterSrc,
    monsterPoster: monsterPoster,
    monsterColor: monster.color,
    mbti: topMbti.type,
    mbtiPercent: topMbti.percent,
    energy: yaoyaoData.energyScore,
    moodTitle: "今日情绪",
    moodText: yaoyaoData.emotionText,
    question,
    answerMonsterName: answer.name,
    answerMonsterColor: answer.color,
    answerText: answer.answer,
  };

  const BRAND_PURPLE = "#a855f7";
  const DEEP_PURPLE = "#3d1745";

  // 卡片内 / 外的装饰星星 + 云朵 + 蝴蝶结
  const DECOR = [
    { kind: "star", top: "1%",  left: "8%",  size: 18, color: "#fbcfe8", delay: "0s"   },
    { kind: "star", top: "4%",  right: "10%", size: 14, color: "#e9d5ff", delay: "0.6s" },
    { kind: "star", top: "26%", left: "3%",  size: 12, color: "#fde68a", delay: "1.2s" },
    { kind: "star", top: "62%", right: "4%", size: 14, color: "#c4b5fd", delay: "0.4s" },
    { kind: "star", top: "82%", left: "5%",  size: 16, color: "#f9a8d4", delay: "0.9s" },
    { kind: "cloud", top: "12%", left: "-4%", size: 60, opacity: 0.55 },
    { kind: "cloud", top: "70%", right: "-3%", size: 70, opacity: 0.45 },
  ];

  return (
    <ScreenFrame keyId="card">
      {/* 全屏梦幻渐变背景:紫粉蓝奶油白 */}
      <div
        aria-hidden
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          background: `
            radial-gradient(at 18% 0%, rgba(216,180,254,0.55), transparent 55%),
            radial-gradient(at 82% 12%, rgba(249,168,212,0.5), transparent 55%),
            radial-gradient(at 30% 100%, rgba(196,221,255,0.55), transparent 55%),
            linear-gradient(180deg, #fef6ff 0%, #f5e7ff 60%, #e7f0ff 100%)
          `,
        }}
      />

      {/* 大标题 —— 渐变字 + 发光阴影 */}
      <h1
        className="result-title text-center font-extrabold mb-4 mt-1"
        style={{
          fontSize: "clamp(2rem, 8.5vw, 2.6rem)",
          background:
            "linear-gradient(135deg, #c084fc 0%, #ec4899 50%, #a855f7 100%)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextFillColor: "transparent",
          letterSpacing: "0.06em",
          filter:
            "drop-shadow(0 2px 8px rgba(196,167,231,0.55)) drop-shadow(0 0 12px rgba(255,255,255,0.6))",
          lineHeight: 1.15,
        }}
      >
        今日专属妖妖卡 <span style={{ filter: "drop-shadow(0 2px 4px rgba(255,160,220,0.5))" }}>🎀</span>
      </h1>

      {/* ===== 主体大卡 ===== */}
      <motion.div
        id="spook-card"
        initial={{ scale: 0.9, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 180, damping: 22 }}
        className="magic-card relative mx-auto rounded-[40px]"
        style={{
          width: "100%",
          maxWidth: 420,
          // 双边框:外层粉紫渐变 padding,内层磨砂玻璃
          padding: "3px",
          background:
            "linear-gradient(135deg, rgba(216,180,254,0.95) 0%, rgba(249,168,212,0.95) 50%, rgba(196,181,253,0.95) 100%)",
          boxShadow:
            "0 24px 60px -16px rgba(168,121,224,0.55), 0 0 0 1px rgba(255,255,255,0.4) inset, 0 0 32px rgba(244,114,182,0.3)",
        }}
      >
        {/* 装饰层 — 星星 + 云朵,absolute,pointer-events-none */}
        <div className="sparkle-layer absolute inset-0 pointer-events-none overflow-hidden rounded-[40px]">
          {DECOR.map((d, i) =>
            d.kind === "star" ? (
              <span
                key={i}
                className="absolute am-star"
                style={{
                  top: d.top,
                  left: d.left,
                  right: d.right,
                  animationDelay: d.delay,
                }}
              >
                <Star4 size={d.size!} color={d.color!} />
              </span>
            ) : (
              <span
                key={i}
                className="absolute"
                style={{
                  top: d.top,
                  left: d.left,
                  right: d.right,
                  opacity: d.opacity,
                  width: d.size,
                  height: (d.size as number) * 0.62,
                }}
              >
                <CloudPuff />
              </span>
            ),
          )}
        </div>

        {/* 卡片内层:磨砂玻璃 */}
        <div
          className="magic-card-inner rounded-[37px] relative z-10"
          style={{
            background: "rgba(255,253,255,0.62)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            padding: "1.25rem 1.25rem 1.5rem",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
          }}
        >
          {/* —— 顶栏:品牌 / 日期 —— */}
          <div className="flex items-center justify-between mb-3">
            <span
              className="font-bold flex items-center gap-1.5"
              style={{ color: DEEP_PURPLE, fontSize: "0.95rem" }}
            >
              <span>🔮</span>
              <span>{resultData.brandName}</span>
            </span>
            <span
              className="font-medium"
              style={{ color: "rgba(74,29,86,0.6)", fontSize: "0.85rem" }}
            >
              {resultData.date}
            </span>
          </div>

          {/* —— 中央妖怪头像区 —— */}
          <div className="relative flex flex-col items-center">
            {/* 云朵托底 */}
            <div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                bottom: -10,
                left: "50%",
                transform: "translateX(-50%)",
                width: "82%",
                height: 30,
                background:
                  "radial-gradient(ellipse at center, rgba(255,255,255,0.95), rgba(216,180,254,0.4) 60%, transparent 80%)",
                filter: "blur(4px)",
              }}
            />
            {/* 圆形头像 — 三层环 */}
            <div
              className="relative rounded-full"
              style={{
                width: 170,
                height: 170,
                padding: 6,
                background:
                  "conic-gradient(from 180deg, #f9a8d4, #c4b5fd, #a3c4ff, #f9a8d4)",
                boxShadow:
                  "0 0 32px rgba(244,114,182,0.45), 0 16px 32px -8px rgba(168,121,224,0.5)",
              }}
            >
              <div
                className="rounded-full overflow-hidden w-full h-full relative"
                style={{
                  background: `radial-gradient(circle at 35% 30%, white, ${resultData.monsterColor} 75%)`,
                  border: "3px solid rgba(255,255,255,0.95)",
                  boxShadow: "inset 0 2px 8px rgba(255,255,255,0.7)",
                }}
              >
                {/* 主头像:用 mp4 但默认不自动播放(autoPlay 没有,paused 显示 poster) */}
                <video
                  src={resultData.monsterMedia}
                  poster={resultData.monsterPoster}
                  muted
                  loop
                  playsInline
                  preload="auto"
                  className="w-full h-full object-cover"
                  aria-hidden
                  // 强制渲染首帧,默认静态展示
                  onLoadedData={(e) => {
                    try {
                      e.currentTarget.currentTime = 0.05;
                    } catch {}
                  }}
                />
              </div>
              {/* 头像角点小星星 */}
              <span className="absolute" style={{ top: -4, right: 6 }}>
                <Star4 size={20} color="#fbcfe8" />
              </span>
              <span className="absolute" style={{ bottom: 4, left: -2 }}>
                <Star4 size={14} color="#e9d5ff" />
              </span>
            </div>

            {/* —— 名字 + 类型 —— */}
            <div className="flex items-center gap-2 mt-3">
              <span aria-hidden style={{ color: "#f9a8d4", fontSize: 14 }}>✦</span>
              <h2
                className="font-extrabold"
                style={{
                  color: DEEP_PURPLE,
                  fontSize: "clamp(1.7rem, 7vw, 2.1rem)",
                  textShadow: "0 1px 0 rgba(255,255,255,0.8), 0 2px 10px rgba(168,121,224,0.3)",
                  letterSpacing: "0.04em",
                  lineHeight: 1.1,
                }}
              >
                {resultData.monsterName}
              </h2>
              <span aria-hidden style={{ color: "#f9a8d4", fontSize: 14 }}>✦</span>
            </div>
            {/* 类型胶囊 */}
            <div
              className="mt-2 px-3.5 py-1 rounded-full text-xs font-semibold"
              style={{
                background:
                  "linear-gradient(135deg, rgba(216,180,254,0.85), rgba(249,168,212,0.85))",
                color: "white",
                border: "1px solid rgba(255,255,255,0.6)",
                boxShadow: "0 4px 12px -2px rgba(196,167,231,0.5)",
                letterSpacing: "0.05em",
                textShadow: "0 1px 2px rgba(122,61,123,0.3)",
              }}
            >
              ✦ {resultData.monsterType} ✦
            </div>
          </div>

          {/* —— MBTI / 能量 双信息块 —— */}
          <div className="grid grid-cols-2 gap-2.5 mt-5">
            <InfoTile
              icon="🔮"
              label="MBTI 配方"
              value={`${resultData.mbti} ${resultData.mbtiPercent}%`}
            />
            <InfoTile
              icon="⚡"
              label="能量值"
              value={String(resultData.energy)}
            />
          </div>

          {/* —— 今日情绪云朵条 —— */}
          <div
            className="cloud-decoration relative mt-3 px-4 py-3"
            style={{
              borderRadius: "30px 36px 28px 32px / 28px 32px 30px 36px",
              background:
                "linear-gradient(135deg, rgba(255,253,255,0.85), rgba(252,231,243,0.7))",
              border: "1px solid rgba(216,180,254,0.55)",
              boxShadow:
                "0 6px 18px -6px rgba(196,167,231,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span aria-hidden>☁️</span>
              <span className="text-xs font-bold" style={{ color: BRAND_PURPLE }}>
                {resultData.moodTitle}
              </span>
            </div>
            <p
              className="leading-relaxed font-medium"
              style={{ color: DEEP_PURPLE, fontSize: "0.92rem" }}
            >
              {resultData.moodText}
            </p>
            <span
              className="absolute am-star"
              style={{ top: -6, right: 14 }}
            >
              <Star4 size={14} color="#fbcfe8" />
            </span>
          </div>

          {/* —— 提问 / 回答 魔法纸条 —— */}
          <div
            className="mt-3 rounded-[24px] overflow-hidden"
            style={{
              background:
                "linear-gradient(180deg, rgba(255,253,255,0.85) 0%, rgba(252,231,243,0.78) 50%, rgba(243,232,255,0.85) 100%)",
              border: "1px solid rgba(196,181,253,0.55)",
              boxShadow:
                "0 8px 24px -8px rgba(196,167,231,0.4), inset 0 1px 0 rgba(255,255,255,0.7)",
            }}
          >
            {/* 我问妖妖 */}
            <div className="px-4 pt-3.5 pb-2.5">
              <div
                className="text-xs font-bold mb-1"
                style={{ color: BRAND_PURPLE, letterSpacing: "0.05em" }}
              >
                ✨ 我问妖妖
              </div>
              <p
                className="leading-relaxed font-medium"
                style={{ color: DEEP_PURPLE, fontSize: "0.92rem" }}
              >
                {resultData.question}
              </p>
            </div>
            {/* 分割线:虚线 */}
            <div
              className="mx-4"
              style={{
                borderTop: "1.5px dashed rgba(196,181,253,0.6)",
                height: 1,
              }}
            />
            {/* 答案 */}
            <div
              className="relative px-4 pt-2.5 pb-3.5"
              style={{
                background: `linear-gradient(180deg, ${resultData.answerMonsterColor}22, transparent)`,
              }}
            >
              <div
                className="text-xs font-bold mb-1 flex items-center gap-1"
                style={{ color: BRAND_PURPLE, letterSpacing: "0.05em" }}
              >
                🎀 {resultData.answerMonsterName} 叼来的回答
              </div>
              <p
                className="leading-relaxed"
                style={{ color: DEEP_PURPLE, fontSize: "0.92rem" }}
              >
                {resultData.answerText}
              </p>
              {/* 信封小装饰 */}
              <span
                aria-hidden
                className="absolute pointer-events-none"
                style={{
                  right: 8,
                  bottom: 4,
                  fontSize: 22,
                  opacity: 0.85,
                  filter: "drop-shadow(0 2px 4px rgba(196,167,231,0.5))",
                }}
              >
                💌
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ===== 底部三按钮 ===== */}
      <div className="grid grid-cols-3 gap-2.5 mt-5 pb-4">
        <ResultButton
          onClick={onSave}
          variant="solid"
          gradient="linear-gradient(135deg, #c084fc, #ec4899)"
        >
          💾 保存
        </ResultButton>
        <ResultButton
          onClick={onShare}
          variant="solid"
          gradient="linear-gradient(135deg, #f472b6, #a855f7)"
        >
          📤 分享
        </ResultButton>
        <ResultButton onClick={onRestart} variant="ghost">
          🔄 再玩一次
        </ResultButton>
      </div>
    </ScreenFrame>
  );
}

/* —— CardScreen 内部辅助小组件 —— */

// 4 角星(SVG),纯装饰
function Star4({ size = 14, color = "#fbcfe8" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 1.5 L13.8 9.2 L21.5 11 L13.8 12.8 L12 20.5 L10.2 12.8 L2.5 11 L10.2 9.2 Z"
        fill={color}
      />
    </svg>
  );
}

// 软云朵 SVG —— 用在卡片角落做装饰
function CloudPuff() {
  return (
    <svg viewBox="0 0 100 60" className="w-full h-full" aria-hidden>
      <path
        d="M15 40 C 0 40, 0 22, 18 22 C 18 6, 50 4, 52 22 C 65 10, 90 14, 88 30 C 100 32, 100 50, 80 48 C 60 60, 25 60, 15 40 Z"
        fill="white"
        opacity="0.85"
      />
    </svg>
  );
}

// 信息小水晶 tile(MBTI / 能量)
function InfoTile({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      className="rounded-[22px] px-3 py-2.5 flex items-center gap-2.5"
      style={{
        background:
          "linear-gradient(135deg, rgba(255,253,255,0.85), rgba(243,232,255,0.7))",
        border: "1px solid rgba(216,180,254,0.6)",
        boxShadow:
          "0 4px 12px -4px rgba(196,167,231,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
      }}
    >
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          width: 36,
          height: 36,
          background:
            "linear-gradient(135deg, rgba(216,180,254,0.4), rgba(249,168,212,0.4))",
          border: "1px solid rgba(255,255,255,0.6)",
          fontSize: 18,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div
          className="text-[10px] font-semibold"
          style={{ color: "rgba(74,29,86,0.55)", letterSpacing: "0.05em" }}
        >
          {label}
        </div>
        <div
          className="font-extrabold leading-tight"
          style={{ color: "#3d1745", fontSize: "1rem" }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

// 底部糖果按钮:实色渐变 / 幽灵玻璃 两种
function ResultButton({
  onClick,
  variant,
  gradient,
  children,
}: {
  onClick: () => void;
  variant: "solid" | "ghost";
  gradient?: string;
  children: React.ReactNode;
}) {
  if (variant === "solid") {
    return (
      <button
        onClick={onClick}
        className="font-bold transition-transform active:scale-[0.96]"
        style={{
          background: gradient,
          color: "white",
          borderRadius: 999,
          padding: "0.95rem 0.4rem",
          fontSize: "0.95rem",
          letterSpacing: "0.03em",
          border: "none",
          boxShadow:
            "0 12px 24px -8px rgba(168,85,247,0.55), inset 0 1px 0 rgba(255,255,255,0.35)",
          textShadow: "0 1px 2px rgba(122,61,123,0.35)",
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      className="font-bold transition-transform active:scale-[0.96]"
      style={{
        background: "rgba(255,255,255,0.7)",
        color: "#7a3d8a",
        borderRadius: 999,
        padding: "0.95rem 0.4rem",
        fontSize: "0.95rem",
        letterSpacing: "0.03em",
        border: "1.5px solid rgba(196,181,253,0.7)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        boxShadow:
          "0 6px 16px -4px rgba(196,167,231,0.35), inset 0 1px 0 rgba(255,255,255,0.7)",
      }}
    >
      {children}
    </button>
  );
}
