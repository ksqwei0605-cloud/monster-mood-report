/**
 * AnimatedMonster
 * --------------------------------
 * 用一段循环视频(MP4)作为主视觉,外加纯装饰的星星。
 *
 * 视频本体已经包含角色的动作和"今日小妖怪"牌子,
 * 所以这里不再叠加眨眼 / 翅膀 / 尾巴 / 呼吸 / 牌子等覆盖层,只保留装饰星星。
 *
 * 视频边缘做了软边渐隐(radial-gradient mask)处理:
 *   - 视频本身的背景色和卡片背景不一致时会有明显色差
 *   - 通过 mask 让视频边缘逐渐透明,过渡到卡片背景,视觉上消除"矩形边框"
 *   - 调整 MASK_FADE_START / MASK_FADE_END 可以控制羽化范围
 *
 * 调参速查(全部基于组件方框百分比,改 size 不用重算):
 *   - MASK_FADE_START / MASK_FADE_END → 视频边缘羽化软边
 *   - STARS  → 周围星星的位置 / 大小 / 颜色 / 延迟
 */

type Props = {
  /** 组件最大宽度(px),默认 260。容器 1:1,移动端 max-w-full 防溢出 */
  size?: number;
  /** 视频源(默认 /monster.mp4) */
  src?: string;
  /** 视频未加载前的封面图(默认 /monster.png) */
  poster?: string;
  className?: string;
};

// ===== 视频边缘羽化参数 =====
// black 到 transparent 的过渡:这两个百分比离得越近,边缘越"硬";越远越"软"。
// 想完全没有羽化(矩形锐边):把 MASK_FADE_END 也设为 100% 并把 START 设为 100%。
const MASK_FADE_START = "60%"; // 这个半径之内,视频 100% 显示
const MASK_FADE_END = "95%";   // 这个半径之外,视频完全透明

// 周围小星星 —— 6 颗,位置 / 大小 / 颜色 / 动画延迟错开
const STARS = [
  { left: "8%",  top: "8%",  size: 18, delay: "0s",    color: "#fbcfe8" },
  { left: "82%", top: "6%",  size: 14, delay: "0.5s",  color: "#e9d5ff" },
  { left: "92%", top: "30%", size: 10, delay: "1.1s",  color: "#fde68a" },
  { left: "2%",  top: "52%", size: 12, delay: "0.8s",  color: "#c4b5fd" },
  { left: "88%", top: "78%", size: 16, delay: "1.6s",  color: "#fbcfe8" },
  { left: "6%",  top: "88%", size: 11, delay: "0.3s",  color: "#f9a8d4" },
];

function Star({ color = "#fbcfe8", size = 14 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 1.5 L13.8 9.2 L21.5 11 L13.8 12.8 L12 20.5 L10.2 12.8 L2.5 11 L10.2 9.2 Z"
        fill={color}
      />
    </svg>
  );
}

export function AnimatedMonster({
  size = 260,
  src = "/monster.mp4",
  poster = "/monster.png",
  className,
}: Props) {
  const maskValue = `radial-gradient(circle at 50% 50%, #000 ${MASK_FADE_START}, transparent ${MASK_FADE_END})`;

  return (
    <div
      className={`relative w-full max-w-full mx-auto ${className ?? ""}`}
      style={{ width: size, maxWidth: "100%", aspectRatio: "1 / 1" }}
      aria-label="今日小妖怪"
    >
      {/* 星星层 —— 放在视频外层,不受 mask 影响 */}
      {STARS.map((s, i) => (
        <span
          key={i}
          className="am-star absolute pointer-events-none"
          style={{ left: s.left, top: s.top, animationDelay: s.delay }}
        >
          <Star color={s.color} size={s.size} />
        </span>
      ))}

      {/* 视频主体 —— autoplay + loop + muted + playsinline 保证移动端能自动播 */}
      {/* maskImage 让视频边缘渐隐到透明,以消除视频背景与卡片背景的色差 */}
      {/* iOS 不支持 video 元素上的 CSS mask,所以把 mask 放在 wrapper 上 */}
      <div
        className="absolute inset-0"
        style={{
          WebkitMaskImage: maskValue,
          maskImage: maskValue,
        }}
      >
        <video
          className="absolute inset-0 w-full h-full object-contain select-none"
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          aria-hidden
          style={{ background: "#1a0a2e" }}
        />
      </div>
    </div>
  );
}

export default AnimatedMonster;
