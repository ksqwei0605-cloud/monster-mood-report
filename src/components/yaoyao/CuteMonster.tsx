import { motion, AnimatePresence } from "framer-motion";

export function CuteMonster({
  emoji,
  color,
  size = 120,
  label,
  wiggle,
}: {
  emoji: string;
  color: string;
  size?: number;
  label?: string;
  wiggle?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.div
        className={`relative flex items-center justify-center rounded-full ${wiggle ? "wiggle" : "float-soft"}`}
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 35% 30%, white, ${color} 70%)`,
          boxShadow: `0 12px 28px -8px ${color}, inset -6px -8px 16px rgba(255,255,255,0.5)`,
        }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
      >
        <span style={{ fontSize: size * 0.55 }}>{emoji}</span>
        {/* cheeks */}
        <span
          className="absolute rounded-full opacity-60"
          style={{ width: size * 0.13, height: size * 0.08, background: "#ff8fb1", left: "18%", top: "58%" }}
        />
        <span
          className="absolute rounded-full opacity-60"
          style={{ width: size * 0.13, height: size * 0.08, background: "#ff8fb1", right: "18%", top: "58%" }}
        />
      </motion.div>
      {label && <span className="text-sm font-semibold text-foreground/80">{label}</span>}
    </div>
  );
}

export function ScreenFrame({
  children,
  keyId,
  bg,
}: {
  children: React.ReactNode;
  keyId: string;
  /** 可选背景图 URL。会以 absolute 方式贴在 motion.div 内,作为本屏的"画布",
   *  内容永远渲染在它之上。不传 → 透明,沿用 body / 全局背景。 */
  bg?: string;
}) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={keyId}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto px-5 py-6 relative overflow-hidden"
      >
        {bg && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `url("${bg}")`,
              backgroundSize: "cover",
              backgroundPosition: "center top",
              backgroundRepeat: "no-repeat",
              zIndex: 0,
            }}
          />
        )}
        {/* 内容层 z-index 1,保证永远在背景图之上 */}
        <div className="relative" style={{ zIndex: 1 }}>
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
