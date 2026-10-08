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
      {
        property: "og:description",
        content: "Enter a room code to join a show.",
      },
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
      if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        codeInput.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function join(e: FormEvent) {
    e.preventDefault();

    const enteredCode = code.trim().toUpperCase();

    if (!enteredCode) {
      setError("Please enter a room code.");
      return;
    }

    /*
     * Team Battle codes:
     *
     * JMVU3-A → Team A 🔴
     * JMVU3-B → Team B 🔵
     *
     * Classic:
     *
     * JMVU3 → Normal room
     *
     * IMPORTANT:
     * We validate the BASE room code,
     * but send the FULL entered code to join_room().
     */

    let baseRoomCode = enteredCode;

    if (enteredCode.endsWith("-A") || enteredCode.endsWith("-B")) {
      baseRoomCode = enteredCode.slice(0, -2);
    }

    // Base room code must always be exactly 5 characters.
    if (!/^[A-Z0-9]{5}$/.test(baseRoomCode)) {
      setError(
        "Enter a valid room code, such as JMVU3, JMVU3-A, or JMVU3-B."
      );
      return;
    }

    setBusy(true);
    setError(null);

    try {
      /*
       * Send the FULL code.
       *
       * JMVU3   → Classic
       * JMVU3-A → Team A
       * JMVU3-B → Team B
       *
       * The database join_room() function handles
       * the -A / -B suffix and assigns the team.
       */

      const { data, error } = await supabase.rpc("join_room", {
        p_code: enteredCode,
      });

      if (error || !data) {
        console.error("JOIN ROOM ERROR:", error);
        setError(errMsg(error));
        return;
      }

      // Database returns the actual base room code.
      navigate({
        to: "/room/$code",
        params: {
          code: data,
        },
      });
    } catch (err) {
      console.error("JOIN ROOM EXCEPTION:", err);
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
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
            onChange={(e) => {
              setCode(
                e.target.value
                  .toUpperCase()
                  .replace(/[^A-Z0-9-]/g, "")
                  .slice(0, 7)
              );
            }}
            placeholder="JMVU3 or JMVU3-A"
            aria-keyshortcuts="/"
            maxLength={7}
            className="field min-h-14 w-full text-center font-mono text-2xl uppercase sm:text-3xl"
          />

          <p className="mt-3 text-xs text-muted-foreground">
            For Team Battle, add{" "}
            <span className="font-bold text-destructive">-A</span> for Team A
            🔴 or{" "}
            <span className="font-bold text-primary">-B</span> for Team B 🔵
          </p>

          {error && (
            <p className="mt-4 text-sm text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-gold touch-control mt-6 min-h-14 w-full py-4"
          >
            {busy ? "Finding your seat…" : "Join show"}
          </button>
        </div>
      </form>
    </main>
  );
}