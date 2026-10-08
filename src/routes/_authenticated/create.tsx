import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop } from "@/components/Backdrop";
import { errMsg } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/create")({
  head: () => ({
    meta: [
      { title: "Create Your Show — Kollywood Clash" },
      {
        name: "description",
        content:
          "Pick 2, 3, 4, 5, 10 players, or create a Team Battle room.",
      },
      {
        property: "og:title",
        content: "Create Your Show — Kollywood Clash",
      },
      {
        property: "og:description",
        content: "Open a new Kollywood Clash room.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateRoom,
});

function CreateRoom() {
  const navigate = useNavigate();

  const [n, setN] = useState(4);
  const [teamBattle, setTeamBattle] = useState(false);
  const [teamSize, setTeamSize] = useState(2);
  const [team1Name, setTeam1Name] = useState("");
  const [team2Name, setTeam2Name] = useState("");

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
      ) {
        return;
      }

      if (!teamBattle) {
        const value = Number(event.key);

        if (value >= 2 && value <= 5) setN(value);
        if (event.key === "0") setN(10);
      }

      if (event.key === "Enter" && !busy) {
        void create();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    teamBattle,
    busy,
    n,
    teamSize,
    team1Name,
    team2Name,
  ]);

  async function create() {
    setBusy(true);
    setError(null);

    try {
      if (teamBattle) {
        const name1 = team1Name.trim();
        const name2 = team2Name.trim();

        if (!name1) {
          throw new Error("Please enter Team 1 name.");
        }

        if (!name2) {
          throw new Error("Please enter Team 2 name.");
        }

        if (name1.toLowerCase() === name2.toLowerCase()) {
          throw new Error("Team names must be different.");
        }

        if (name1.length > 20 || name2.length > 20) {
          throw new Error("Team names can be at most 20 characters.");
        }

       const { data, error } = await supabase.rpc("create_team_room", {
  p_team_size: teamSize,
  p_team_1_name: name1,
  p_team_2_name: name2,
});

        if (error || !data) {
          throw error ?? new Error("Could not create room.");
        }

        navigate({
          to: "/room/$code",
          params: { code: data },
        });

        return;
      }

      // EXISTING NORMAL GAME MODE
      const { data, error } = await supabase.rpc("create_room", {
        p_max: n,
      });

      if (error || !data) {
        throw error ?? new Error("Could not create room.");
      }

      navigate({
        to: "/room/$code",
        params: { code: data },
      });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
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

        <p
          className="fade-slide mt-3 text-muted-foreground"
          style={{ animationDelay: "220ms" }}
        >
          Choose your game mode
        </p>

        {/* GAME MODE */}

        <div className="mt-7 grid grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-6">
          {[2, 3, 4, 5, 10].map((v, i) => (
            <button
              key={v}
              type="button"
              aria-pressed={!teamBattle && n === v}
              aria-keyshortcuts={v === 10 ? "0" : `${v}`}
              data-selected={!teamBattle && n === v}
              onClick={() => {
                setTeamBattle(false);
                setN(v);
                setError(null);
              }}
              className="select-card touch-control rise-in min-h-24 px-4 py-4 sm:py-8"
              style={{ animationDelay: `${300 + i * 70}ms` }}
            >
              <div
                className={`font-mono text-4xl font-bold sm:text-5xl ${
                  !teamBattle && n === v ? "text-primary" : ""
                }`}
              >
                {v}
              </div>

              <div className="mt-2 font-display text-xs tracking-[0.3em] text-muted-foreground">
                PLAYERS
              </div>
            </button>
          ))}

          {/* TEAM BATTLE */}

          <button
            type="button"
            aria-pressed={teamBattle}
            data-selected={teamBattle}
            onClick={() => {
              setTeamBattle(true);
              setError(null);
            }}
            className="select-card touch-control rise-in min-h-24 px-3 py-4 sm:py-6"
            style={{ animationDelay: "650ms" }}
          >
            <div
              className={`text-3xl font-bold sm:text-4xl ${
                teamBattle ? "text-primary" : ""
              }`}
            >
              ⚔️
            </div>

            <div className="mt-2 font-display text-xs font-bold tracking-[0.18em] text-muted-foreground">
              TEAM BATTLE
            </div>
          </button>
        </div>

        {/* TEAM BATTLE SETTINGS */}

        {teamBattle && (
          <div className="mt-8 space-y-6 text-left animate-fade-in">
            {/* TEAM SIZE */}

            <div>
              <p className="mb-3 text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Team Size
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[2, 3, 4, 5].map((size) => (
                  <button
                    key={size}
                    type="button"
                    aria-pressed={teamSize === size}
                    data-selected={teamSize === size}
                    onClick={() => {
                      setTeamSize(size);
                      setError(null);
                    }}
                    className="select-card touch-control min-h-20"
                  >
                    <div
                      className={`font-mono text-2xl font-bold ${
                        teamSize === size ? "text-primary" : ""
                      }`}
                    >
                      {size} vs {size}
                    </div>

                    <div className="mt-1 text-xs text-muted-foreground">
                      {size * 2} players
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* TEAM NAMES */}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  🔴 Team 1 Name
                </span>

                <input
                  className="field min-h-12 w-full"
                  value={team1Name}
                  maxLength={20}
                  placeholder="MASS MASTERS"
                  onChange={(e) => setTeam1Name(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  🔵 Team 2 Name
                </span>

                <input
                  className="field min-h-12 w-full"
                  value={team2Name}
                  maxLength={20}
                  placeholder="THALA FANS"
                  onChange={(e) => setTeam2Name(e.target.value)}
                />
              </label>
            </div>

            {/* PREVIEW */}

            <div className="panel border border-border p-5">
              <p className="mb-4 text-center font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                Team Battle Preview
              </p>

              <div className="grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xl font-bold text-primary">
                    🔴 {team1Name.trim() || "TEAM 1"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    0 / {teamSize} players
                  </div>
                </div>

                <div>
                  <div className="text-xl font-bold text-primary">
                    🔵 {team2Name.trim() || "TEAM 2"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    0 / {teamSize} players
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-6 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          onClick={create}
          disabled={busy}
          aria-keyshortcuts="Enter"
          className="btn-gold touch-control fade-slide mt-7 min-h-14 w-full max-w-sm py-4 sm:mt-10"
          style={{ animationDelay: "720ms" }}
        >
          {busy
            ? "Setting the stage…"
            : teamBattle
              ? "Create Team Battle"
              : "Create room"}
        </button>
      </div>
    </main>
  );
}