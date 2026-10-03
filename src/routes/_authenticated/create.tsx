import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop } from "@/components/Backdrop";
import { errMsg } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create Your Show — Kollywood Clash" },
      { name: "description", content: "Pick 2 to 5 players and open a new Kollywood Clash room." },
      { property: "og:title", content: "Create Your Show — Kollywood Clash" },
      { property: "og:description", content: "Open a new Kollywood Clash room." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateRoom,
});

function CreateRoom() {
  const navigate = useNavigate();
  const [n, setN] = useState(4);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      )
        return;
      const value = Number(event.key);
      if (value >= 2 && value <= 5) setN(value);
      if (event.key === "Enter" && !busy) void create();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  async function create() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_room", { p_max: n });
    setBusy(false);
    if (error || !data) return setError(errMsg(error));
    navigate({ to: "/room/$code", params: { code: data } });
  }

  return (
    <main className="relative isolate grid min-h-[100svh] place-items-center px-4 pb-24 pt-6 sm:py-10">
      <Backdrop />
      <div className="w-full max-w-3xl text-center">
        <Link
          to="/home"
          className="touch-control fade-slide inline-flex min-h-11 items-center px-2 text-xs font-bold uppercase text-muted-foreground hover:text-primary"
        >
          ← Lobby
        </Link>
        <p
          className="fade-slide mt-4 font-display text-xs font-bold uppercase text-accent sm:mt-8"
          style={{ animationDelay: "60ms" }}
        >
          New room
        </p>
        <h1
          className="rise-in mt-2 font-display text-4xl font-extrabold sm:mt-3 sm:text-6xl"
          style={{ animationDelay: "120ms" }}
        >
          Build your <span className="text-primary">cast</span>
        </h1>
        <p className="fade-slide mt-3 text-muted-foreground" style={{ animationDelay: "220ms" }}>
          How many players tonight?
        </p>
        <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-4">
          {[2, 3, 4, 5].map((v, i) => (
            <button
              key={v}
              type="button"
              aria-pressed={n === v}
              aria-keyshortcuts={`${v}`}
              data-selected={n === v}
              onClick={() => setN(v)}
              className="select-card touch-control rise-in min-h-24 px-4 py-4 sm:py-8"
              style={{ animationDelay: `${300 + i * 80}ms` }}
            >
              <div
                className={`font-mono text-4xl font-bold sm:text-5xl ${n === v ? "text-primary" : ""}`}
              >
                {v}
              </div>
              <div className="mt-2 font-display text-xs tracking-[0.3em] text-muted-foreground">
                PLAYERS
              </div>
            </button>
          ))}
        </div>
        {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
        <button
          onClick={create}
          disabled={busy}
          aria-keyshortcuts="Enter"
          className="btn-gold touch-control fade-slide mt-7 min-h-14 w-full max-w-sm py-4 sm:mt-10"
          style={{ animationDelay: "620ms" }}
        >
          {busy ? "Setting the stage…" : "Create room"}
        </button>
      </div>
    </main>
  );
}
