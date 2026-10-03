import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop } from "@/components/Backdrop";
import { errMsg } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/join")({
  head: () => ({
    meta: [
      { title: "Join a Show — Kollywood Clash" },
      {
        name: "description",
        content: "Enter a room code to join your friends' Kollywood Clash show.",
      },
      { property: "og:title", content: "Join a Show — Kollywood Clash" },
      { property: "og:description", content: "Enter a room code to join a show." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: JoinRoom,
});

function JoinRoom() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "/" && !(event.target instanceof HTMLInputElement)) {
        event.preventDefault();
        codeInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function join(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return setError("Please enter a room code.");
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("join_room", { p_code: code });
    setBusy(false);
    if (error || !data) return setError(errMsg(error));
    navigate({ to: "/room/$code", params: { code: data } });
  }

  return (
    <main className="relative isolate grid min-h-[100svh] place-items-center px-4 pb-24 pt-6 sm:py-10">
      <Backdrop />
      <form onSubmit={join} className="w-full max-w-md text-center">
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
          Your friends are waiting
        </p>
        <h1
          className="rise-in mt-3 font-display text-4xl font-extrabold sm:text-6xl"
          style={{ animationDelay: "120ms" }}
        >
          Enter the <span className="text-primary">show</span>
        </h1>
        <div
          className="panel card-lift fade-slide mt-7 border-t-2 border-t-primary p-5 sm:mt-10 sm:p-8"
          style={{ animationDelay: "240ms" }}
        >
          <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
            Room code
          </label>
          <input
            ref={codeInput}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 5))}
            placeholder="A7K9P"
            aria-keyshortcuts="/"
            className="field min-h-14 text-center font-mono text-3xl uppercase sm:text-4xl sm:tracking-[0.5em]"
          />
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
          <button disabled={busy} className="btn-gold touch-control mt-6 min-h-14 w-full py-4">
            {busy ? "Finding your seat…" : "Join show"}
          </button>
        </div>
      </form>
    </main>
  );
}
