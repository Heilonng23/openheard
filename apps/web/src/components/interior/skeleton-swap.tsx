import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const CROSSFADE = {
  type: "spring",
  stiffness: 260,
  damping: 34,
  mass: 0.8,
} as const;

export function useSkeletonSwap({
  ready,
  delay = 0,
  minVisible = 0,
}: {
  ready: boolean;
  delay?: number;
  minVisible?: number;
}) {
  const [visible, setVisible] = useState(!ready);
  const shownAt = useRef(ready ? 0 : performance.now());

  useEffect(() => {
    if (!ready) {
      if (visible) return;
      const t = setTimeout(() => {
        shownAt.current = performance.now();
        setVisible(true);
      }, delay);
      return () => clearTimeout(t);
    }

    if (!visible) return;
    const rest = Math.max(0, minVisible - (performance.now() - shownAt.current));
    const t = setTimeout(() => setVisible(false), rest);
    return () => clearTimeout(t);
  }, [ready, visible, delay, minVisible]);

  return { showSkeleton: visible };
}

export function SkeletonSwap({
  ready,
  skeleton,
  children,
  className = "",
}: {
  ready: boolean;
  skeleton: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  const { showSkeleton } = useSkeletonSwap({ ready });
  const reduced = useReducedMotion();

  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`}>
      <motion.div
        className="flex min-h-0 flex-1 flex-col"
        initial={false}
        animate={
          reduced
            ? { opacity: showSkeleton ? 0 : 1 }
            : {
                opacity: showSkeleton ? 0 : 1,
                scale: showSkeleton ? 0.99 : 1,
                filter: showSkeleton ? "blur(4px)" : "blur(0px)",
              }
        }
        transition={reduced ? { duration: 0 } : CROSSFADE}
        style={{
          transformOrigin: "top left",
          pointerEvents: showSkeleton ? "none" : undefined,
        }}
      >
        {children}
      </motion.div>

      <AnimatePresence initial={false}>
        {showSkeleton ? (
          <motion.div
            key="skeleton"
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={reduced ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={
              reduced
                ? { opacity: 0 }
                : { opacity: 0, filter: "blur(3px)" }
            }
            transition={reduced ? { duration: 0 } : CROSSFADE}
          >
            {skeleton}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
