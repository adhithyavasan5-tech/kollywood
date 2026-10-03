import { useMemo } from "react";
import theatre from "@/assets/hero-theatre.jpg";
import { actorPhoto } from "@/lib/actors";

export function Backdrop({ image = false }: { image?: boolean }) {
  const particles = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: (i * 53) % 100,
        size: 2 + ((i * 7) % 3),
        dur: 14 + ((i * 11) % 12),
        delay: -((i * 3.7) % 20),
      })),
    [],
  );
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background"
      aria-hidden
    >
      {image && (
        <img
          src={theatre}
          alt=""
          width={1920}
          height={1088}
          className="absolute inset-0 h-full w-full object-cover opacity-60"
        />
      )}
      <div className="absolute inset-0 bg-stage" />
      <div className="beam absolute -top-20 left-1/2 h-[90vh] w-[40vw] -translate-x-1/2 bg-gradient-to-b from-primary/10 to-transparent blur-3xl" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="float-particle absolute bottom-0 rounded-full bg-primary/70"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-b from-background/25 via-background/60 to-background" />
    </div>
  );
}

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const cls =
    size === "lg"
      ? "text-4xl sm:text-6xl md:text-7xl"
      : size === "sm"
        ? "text-lg sm:text-xl"
        : "text-2xl sm:text-3xl";
  return (
    <div className="text-center leading-none">
      <div className={`font-display font-extrabold text-foreground ${cls}`}>
        KOLLYWOOD <span className="text-primary">CLASH</span>
      </div>
      <div
        className={`font-sans font-bold uppercase text-accent ${size === "lg" ? "mt-2 text-xs" : "text-[0.45em]"} ${size === "sm" ? "hidden" : ""}`}
      >
        The Tamil cinema face-off
      </div>
    </div>
  );
}

export function Avatar({
  name,
  gold = false,
  size = 40,
  actor,
}: {
  name: string;
  gold?: boolean;
  size?: number;
  actor?: string | null | undefined;
}) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  const photo = actorPhoto(actor);
  const ring = gold
    ? "border-2 border-primary text-primary"
    : "border-2 border-destructive/70 text-accent";
  if (photo) {
    return (
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded-full bg-background object-cover object-top ${ring}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-background font-display font-bold ${ring}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
