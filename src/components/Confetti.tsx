import { useMemo } from "react";

export function Confetti({ count = 60 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        dur: 2.2 + Math.random() * 1.8,
        size: 6 + Math.random() * 8,
        rot: Math.random() * 360,
        tone: i % 3,
      })),
    [count],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <span
          key={i}
          className={`confetti absolute top-0 ${b.tone === 0 ? "bg-primary" : b.tone === 1 ? "bg-secondary" : "bg-foreground"}`}
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size * 0.4,
            animationDelay: `${b.delay}s`,
            animationDuration: `${b.dur}s`,
            rotate: `${b.rot}deg`,
          }}
        />
      ))}
    </div>
  );
}
