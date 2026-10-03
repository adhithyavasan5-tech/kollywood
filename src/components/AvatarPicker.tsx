import { useRef, type KeyboardEvent } from "react";
import { ACTORS, actorPhoto } from "@/lib/actors";

/** Radio-group of actor cards: arrow keys move, Space/Enter select. */
export function AvatarPicker({
  value,
  onChange,
  compact = false,
}: {
  value: string | null;
  onChange: (key: string) => void;
  compact?: boolean;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(
    0,
    ACTORS.findIndex((a) => a.key === value),
  );

  function onKey(e: KeyboardEvent, i: number) {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (i + delta + ACTORS.length) % ACTORS.length;
    onChange(ACTORS[next]!.key);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Choose your actor avatar"
      className={`grid gap-2 sm:gap-3 ${compact ? "grid-cols-4" : "grid-cols-2 sm:grid-cols-4"}`}
    >
      {ACTORS.map((a, i) => {
        const selected = a.key === value;
        return (
          <button
            key={a.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === current ? 0 : -1}
            onClick={() => onChange(a.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={`touch-control group relative aspect-[3/4] overflow-hidden rounded-lg border-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected ? "scale-[1.02] border-primary shadow-[var(--shadow-gold)]" : "border-border opacity-80 hover:opacity-100"}`}
          >
            <img
              src={actorPhoto(a.key)!}
              alt=""
              width={185}
              height={278}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              className="absolute inset-0 h-full w-full object-cover object-top"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent p-1.5 pt-6 sm:p-2 sm:pt-8">
              <span
                className={`block font-display font-bold leading-tight ${compact ? "text-[9px] sm:text-[11px]" : "text-[11px] sm:text-xs"}`}
              >
                {a.name}
              </span>
            </span>
            {selected && (
              <span
                aria-hidden
                className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground"
              >
                ✓
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
