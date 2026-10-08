import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { Avatar, Backdrop, Logo } from "@/components/Backdrop";
import { errMsg } from "@/lib/auth";
import { playBuzz, playCorrect, playWrong, startMassBgm } from "@/lib/sfx";
import { Confetti } from "@/components/Confetti";
import { usePersonImage } from "@/lib/people";
import { useMoviePoster } from "@/lib/posters";
import { tmdbImage } from "@/lib/tmdb";

type Room = Tables<"rooms">;
type Player = Tables<"room_players">;
type ClueData = {
  story?: string;
  story_ta?: string;
  genres?: string[];
  trivia?: string[];
  director?: string;
  heroine?: string;
  hero?: string;
  director_photo?: string;
  heroine_photo?: string;
  hero_photo?: string;
  punch?: string;
};
type Reveal = {
  title: string;
  year: number;
  director: string;
  heroine: string;
  hero: string;
  genres: string[];
  wiki_title?: string;
  movie_id?: number;
  poster_path?: string | null;
  outcome: "correct" | "nobody" | "exhausted";
  winner_id: string | null;
  winner_name: string | null;
  dialogue: string;
  clue: number;
};
type GameEvent = {
  type: string;
  name?: string;
  text?: string;
  user_id?: string;
  timeout?: boolean;
};

export const Route = createFileRoute("/_authenticated/room/$code")({
  head: ({ params }) => ({
    meta: [
      { title: `Show ${params.code} — Kollywood Clash` },
      { name: "description", content: "A live Kollywood Clash show in progress." },
      { property: "og:title", content: `Show ${params.code} — Kollywood Clash` },
      { property: "og:description", content: "Join the live Tamil movie guessing show." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RoomPage,
});

function RoomPage() {
  const { code } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const [room, setRoom] = useState<Room | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(true);
  const lastSeq = useRef<number | null>(null);
  const lastAdvance = useRef(0);
  const roomRef = useRef<Room | null>(null);
  const lastReveal = useRef<string | null>(null);
  const [flash, setFlash] = useState<{ kind: "red" | "gold"; k: number } | null>(null);

  const load = useCallback(async () => {
    let { data: r } = await supabase.from("rooms").select("*").eq("code", code).maybeSingle();
    if (!r) {
      const { error: jErr } = await supabase.rpc("join_room", { p_code: code });
      if (jErr) return setError(errMsg(jErr));
      r = (await supabase.from("rooms").select("*").eq("code", code).maybeSingle()).data;
    }
    if (!r) return setError("That room doesn't exist.");
    const { data: ps } = await supabase
      .from("room_players")
      .select("*")
      .eq("room_id", r.id)
      .order("joined_at");
    if (ps && !ps.some((p) => p.user_id === user.id)) return setError("You left this show.");
    roomRef.current = r;
    setRoom(r);
    setPlayers(ps ?? []);
  }, [code, user.id]);

  // initial load + server clock sync
  useEffect(() => {
    load();
    const t0 = Date.now();
    supabase.rpc("get_server_time").then(({ data }) => {
      if (data) setOffset(new Date(data).getTime() - (t0 + Date.now()) / 2);
    });
  }, [load]);

  // realtime
  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
        () => load(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        () => load(),
      )
      .subscribe((status) => setOnline(status === "SUBSCRIBED"));
    const poll = setInterval(load, 4000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  }, [roomId, load]);

  // clock + server-authoritative advancing
  useEffect(() => {
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      const r = roomRef.current;
      if (!r || r.status !== "playing" || !r.phase_ends_at) return;
      if (
        n + offset >= new Date(r.phase_ends_at).getTime() + 150 &&
        n - lastAdvance.current > 800
      ) {
        lastAdvance.current = n;
        supabase.rpc("advance_room", { p_room: r.id }).then(() => load());
      }
    }, 200);
    return () => clearInterval(t);
  }, [offset, load]);

  // event toasts + sounds
  useEffect(() => {
    if (!room) return;
    if (lastSeq.current === null) {
      lastSeq.current = room.event_seq;
      return;
    }
    if (room.event_seq === lastSeq.current) return;
    lastSeq.current = room.event_seq;
    const ev = room.last_event as GameEvent | null;
    if (!ev) return;
    if (ev.type === "joined") toast(`${ev.name} joined the show`);
    if (ev.type === "left") toast(`${ev.name} left the show`);
    if (ev.type === "buzz") playBuzz();
    if (ev.type === "wrong") {
      toast.error(`${ev.name} — ${ev.text} −1`);
      playWrong();
      setFlash({ kind: "red", k: Date.now() });
    }
  }, [room]);

  // reveal sound (once per round)
  useEffect(() => {
    if (!room || room.phase !== "reveal") return;
    const key = `${room.id}-${room.round}`;
    if (lastReveal.current === key) return;
    const first = lastReveal.current === null;
    lastReveal.current = key;
    if (first) return;
    const rv = room.reveal as Reveal | null;
    if (rv?.outcome === "correct") {
      playCorrect();
      setFlash({ kind: "gold", k: Date.now() });
    } else playWrong();
  }, [room]);

  if (error) {
    return (
      <main className="relative isolate grid min-h-screen place-items-center px-4 text-center">
        <Backdrop />
        <div className="panel max-w-sm p-8">
          <p className="font-display text-xl text-primary">{error}</p>
          <Link to="/home" className="btn-gold mt-6 w-full">
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="relative isolate grid min-h-screen place-items-center">
        <Backdrop />
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="mt-4 font-display tracking-[0.4em] text-muted-foreground">
            LOADING THE REEL
          </p>
        </div>
      </main>
    );
  }

  const serverNow = now + offset;
  const remaining = room.phase_ends_at
    ? Math.max(0, (new Date(room.phase_ends_at).getTime() - serverNow) / 1000)
    : 0;
  const isHost = room.host_id === user.id;

  async function leave() {
    await supabase.rpc("leave_room", { p_room: room!.id });
    navigate({ to: "/home" });
  }

  return (
    <main className="relative isolate min-h-screen pb-10">
      <Backdrop />
      <header className="border-b border-border bg-background/75 px-4 py-4 backdrop-blur-xl sm:px-6">
        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="flex min-w-0 items-center gap-4">
            <Logo size="sm" />
            <span className="hidden font-mono text-xs tracking-[0.3em] text-muted-foreground sm:inline">
              SHOW · {room.code}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`flex items-center gap-1.5 text-[10px] uppercase tracking-widest ${online ? "text-success" : "text-destructive"}`}
            >
              <span
                className={`h-2 w-2 rounded-full ${online ? "bg-success" : "bg-destructive animate-pulse"}`}
              />
              {online ? "Live" : "Reconnecting…"}
            </span>
            <button
              onClick={leave}
              className="text-xs font-bold uppercase text-muted-foreground hover:text-primary"
            >
              Leave
            </button>
          </div>
        </div>
      </header>

      {room.status === "waiting" && (
        <Lobby room={room} players={players} isHost={isHost} meId={user.id} />
      )}
      {room.status === "playing" && (
        <Game room={room} players={players} meId={user.id} remaining={remaining} reload={load} />
      )}
      {room.status === "finished" && (
        <Final room={room} players={players} isHost={isHost} meId={user.id} />
      )}
      {flash && (
        <div
          key={flash.k}
          className={`pointer-events-none fixed inset-0 z-30 ${flash.kind === "red" ? "flash-red" : "flash-gold"}`}
        />
      )}
    </main>
  );
}

/* ---------------- LOBBY ---------------- */
function Lobby({
  room,
  players,
  isHost,
  meId,
}: {
  room: Room;
  players: Player[];
  isHost: boolean;
  meId: string;
}) {
  const [busy, setBusy] = useState(false);

  const isTeamBattle = room.game_mode === "team";

  /*
   * Team Battle players
   */
  const teamA = players.filter((p) => p.team === "team_1");
  const teamB = players.filter((p) => p.team === "team_2");

  const teamSize = room.team_size ?? 0;

  const teamAFull = teamA.length >= teamSize;
  const teamBFull = teamB.length >= teamSize;

  /*
   * Team Battle can start only when BOTH teams
   * have reached the selected team size.
   */
  const teamsReady = teamAFull && teamBFull;

  /*
   * Classic room:
   * Existing behaviour remains unchanged.
   */
  const classicReady = players.length >= 2;

  const canStart = isTeamBattle ? teamsReady : classicReady;

  async function start() {
    if (!canStart || busy) return;

    setBusy(true);

    const { error } = await supabase.rpc("start_game", {
      p_room: room.id,
    });

    setBusy(false);

    if (error) {
      toast.error(errMsg(error));
    }
  }

  async function copyCode(value: string, message: string) {
    try {
      await navigator.clipboard?.writeText(value);
      toast.success(message);
    } catch {
      toast.error("Could not copy the code.");
    }
  }

  /*
   * ---------------- TEAM BATTLE LOBBY ----------------
   */
  if (isTeamBattle) {
    const teamAJoinCode = `${room.code}-A`;
    const teamBJoinCode = `${room.code}-B`;

    return (
      <section className="mx-auto mt-8 max-w-5xl animate-fade-in px-4 text-center sm:mt-10">
        {/* Header */}
        <p className="font-display text-xs tracking-[0.5em] text-accent">
          TEAM BATTLE
        </p>

        <div className="mt-3 font-mono text-5xl font-bold tracking-[0.25em] text-gold sm:text-7xl">
          {room.code}
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          {teamSize} vs {teamSize} · {players.length} / {room.max_players} players
        </p>

        {/* Main room code */}
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => copyCode(room.code, "Main room code copied")}
            className="btn-outline-gold px-5 py-2 text-xs"
          >
            Copy room code
          </button>
        </div>

        {/* Team Join Codes */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {/* TEAM A CODE */}
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-destructive">
              🔴 Team A Join Code
            </p>

            <p className="mt-2 font-mono text-2xl font-black tracking-wider text-destructive">
              {teamAJoinCode}
            </p>

            <button
              onClick={() =>
                copyCode(teamAJoinCode, "Team A code copied")
              }
              className="btn-outline-gold mt-3 px-4 py-2 text-xs"
            >
              Copy Team A Code
            </button>
          </div>

          {/* TEAM B CODE */}
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4">
            <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
              🔵 Team B Join Code
            </p>

            <p className="mt-2 font-mono text-2xl font-black tracking-wider text-primary">
              {teamBJoinCode}
            </p>

            <button
              onClick={() =>
                copyCode(teamBJoinCode, "Team B code copied")
              }
              className="btn-outline-gold mt-3 px-4 py-2 text-xs"
            >
              Copy Team B Code
            </button>
          </div>
        </div>

        {/* Teams */}
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {/* ================= TEAM A ================= */}
          <div className="overflow-hidden rounded-2xl border-2 border-destructive/50 bg-background/60 shadow-xl">
            <div className="border-b border-destructive/30 bg-destructive/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                  <p className="text-2xl">🔴</p>

                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-destructive">
                    {room.team_1_name || "TEAM A"}
                  </h2>

                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Team A
                  </p>
                </div>

                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2">
                  <span className="font-mono text-xl font-bold text-destructive">
                    {teamA.length}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {teamSize}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4">
              {teamA.length === 0 ? (
                <div className="rounded-xl border border-dashed border-destructive/30 p-8">
                  <p className="text-3xl opacity-40">👤</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Waiting for Team A players…
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {teamA.map((p) => (
                    <li
                      key={p.user_id}
                      className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3"
                    >
                      {/* RED TEAM RING */}
                      <div className="rounded-full ring-4 ring-destructive/50">
                        <Avatar
                          name={p.username}
                          actor={p.avatar}
                          gold={p.user_id === meId}
                          size={48}
                        />
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate font-display font-bold">
                          {p.username}
                          {p.user_id === meId && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </p>

                        {p.player_id && (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            ID · {p.player_id}
                          </p>
                        )}
                      </div>

                      {p.user_id === room.host_id && (
                        <span className="rounded-full bg-primary/15 px-2 py-1 font-display text-[9px] tracking-widest text-primary">
                          HOST
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Team A status */}
              <div className="mt-4">
                {teamAFull ? (
                  <p className="rounded-lg bg-success/10 py-2 text-xs font-bold uppercase tracking-widest text-success">
                    ✓ Team A Ready
                  </p>
                ) : (
                  <p className="rounded-lg bg-background/50 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Need {teamSize - teamA.length} more player
                    {teamSize - teamA.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ================= TEAM B ================= */}
          <div className="overflow-hidden rounded-2xl border-2 border-primary/50 bg-background/60 shadow-xl">
            <div className="border-b border-primary/30 bg-primary/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-left">
                  <p className="text-2xl">🔵</p>

                  <h2 className="mt-1 font-display text-2xl font-black uppercase text-primary">
                    {room.team_2_name || "TEAM B"}
                  </h2>

                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Team B
                  </p>
                </div>

                <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2">
                  <span className="font-mono text-xl font-bold text-primary">
                    {teamB.length}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    / {teamSize}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4">
              {teamB.length === 0 ? (
                <div className="rounded-xl border border-dashed border-primary/30 p-8">
                  <p className="text-3xl opacity-40">👤</p>
                  <p className="mt-3 text-sm text-muted-foreground">
                    Waiting for Team B players…
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {teamB.map((p) => (
                    <li
                      key={p.user_id}
                      className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3"
                    >
                      {/* BLUE TEAM RING */}
                      <div className="rounded-full ring-4 ring-primary/50">
                        <Avatar
                          name={p.username}
                          actor={p.avatar}
                          gold={p.user_id === meId}
                          size={48}
                        />
                      </div>

                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate font-display font-bold">
                          {p.username}
                          {p.user_id === meId && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              (you)
                            </span>
                          )}
                        </p>

                        {p.player_id && (
                          <p className="truncate font-mono text-[10px] text-muted-foreground">
                            ID · {p.player_id}
                          </p>
                        )}
                      </div>

                      {p.user_id === room.host_id && (
                        <span className="rounded-full bg-primary/15 px-2 py-1 font-display text-[9px] tracking-widest text-primary">
                          HOST
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {/* Team B status */}
              <div className="mt-4">
                {teamBFull ? (
                  <p className="rounded-lg bg-success/10 py-2 text-xs font-bold uppercase tracking-widest text-success">
                    ✓ Team B Ready
                  </p>
                ) : (
                  <p className="rounded-lg bg-background/50 py-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Need {teamSize - teamB.length} more player
                    {teamSize - teamB.length === 1 ? "" : "s"}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Start status */}
        <div className="mt-7">
          {teamsReady ? (
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-success">
              ✓ Both teams are ready
            </p>
          ) : (
            <p className="animate-pulse font-display text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Waiting for both teams to fill…
            </p>
          )}
        </div>

        {/* Host Start */}
        {isHost ? (
          <button
            onClick={start}
            disabled={busy || !teamsReady}
            className="btn-gold mt-6 w-full max-w-sm py-5"
          >
            {!teamsReady
              ? `Need ${teamSize} vs ${teamSize} players`
              : busy
                ? "Lights…"
                : "Start Team Battle"}
          </button>
        ) : (
          <p className="mt-6 animate-pulse font-display tracking-[0.3em] text-muted-foreground">
            Waiting for the host…
          </p>
        )}
      </section>
    );
  }

  /*
   * ---------------- CLASSIC LOBBY ----------------
   *
   * This is your existing Classic UI.
   * Nothing changes for 2/3/4/5/10 player rooms.
   */
  const slots = Array.from(
    { length: room.max_players },
    (_, i) => players[i],
  );

  return (
    <section className="mx-auto mt-10 max-w-2xl animate-fade-in text-center">
      <p className="font-display text-xs tracking-[0.5em] text-accent">
        SHOW ROOM
      </p>

      <div className="mt-4 font-mono text-6xl font-bold tracking-[0.3em] text-gold sm:text-7xl">
        {room.code}
      </div>

      <button
        onClick={() => {
          navigator.clipboard?.writeText(room.code);
          toast.success("Room code copied");
        }}
        className="btn-outline-gold mt-5 px-5 py-2 text-xs"
      >
        Copy room code
      </button>

      <div className="panel mt-10 p-5 text-left sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-sm tracking-[0.3em] text-muted-foreground">
            CAST
          </span>

          <span className="font-mono text-primary">
            {players.length} / {room.max_players} PLAYERS
          </span>
        </div>

        <ul className="space-y-2">
          {slots.map((p, i) => (
            <li
              key={i}
              className={`flex items-center gap-3 rounded-lg border px-3 py-3 ${
                p
                  ? "border-primary/25 bg-card"
                  : "border-dashed border-border opacity-50"
              }`}
            >
              {p ? (
                <Avatar
                  name={p.username}
                  actor={p.avatar}
                  gold={p.user_id === meId}
                  size={40}
                />
              ) : (
                <div className="h-10 w-10 rounded-full border border-dashed border-border" />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">
                  {p ? p.username : "Waiting…"}
                </span>

                {p?.player_id && (
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    ID · {p.player_id}
                  </span>
                )}
              </span>

              {p?.user_id === room.host_id && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 font-display text-[10px] tracking-widest text-primary">
                  HOST
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>

      {isHost ? (
        <button
          onClick={start}
          disabled={busy || !classicReady}
          className="btn-gold mt-8 w-full max-w-sm py-5"
        >
          {players.length < 2
            ? "Need 2+ players"
            : busy
              ? "Lights…"
              : "Start game"}
        </button>
      ) : (
        <p className="mt-8 animate-pulse font-display tracking-[0.3em] text-muted-foreground">
          Waiting for the host…
        </p>
      )}
    </section>
  );
}

/* ---------------- GAME ---------------- */
function Game({
  room,
  players,
  meId,
  remaining,
  reload,
}: {
  room: Room;
  players: Player[];
  meId: string;
  remaining: number;
  reload: () => void;
}) {
  const clue = room.clue_data as ClueData;
  const eliminated = room.answered_players ?? [];
  const answerer = players.find((p) => p.user_id === room.answer_player_id);
  const canBuzz =
    (room.phase === "clue" || room.phase === "open") && !eliminated.includes(meId) && remaining > 0;
  const [buzzing, setBuzzing] = useState(false);

  async function buzz() {
    if (!canBuzz || buzzing) return;
    setBuzzing(true);
    const { data } = await supabase.rpc("buzz", { p_room: room.id });
    setBuzzing(false);
    if (!data) toast("Too late — someone was faster!");
    reload();
  }

  // keyboard buzzer: Space
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        buzz();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  if (room.phase === "transition") {
    return (
      <section className="grid min-h-[70vh] place-items-center text-center">
        <div key={room.round}>
          <p className="rise-in font-display text-sm tracking-[0.6em] text-accent">
            {room.round === 1 ? "THE SHOW BEGINS" : "NEXT ROUND"}
          </p>
          <h2 className="slam mt-4 font-display text-6xl font-black text-shimmer sm:text-8xl">
            ROUND {String(room.round).padStart(2, "0")}
          </h2>
          <p className="mt-4 animate-pulse tracking-[0.4em] text-muted-foreground">GET READY…</p>
        </div>
      </section>
    );
  }

  const total = room.phase === "clue" ? 20 : room.phase === "answer" ? 20 : 5;

  return (
    <section className="mx-auto grid max-w-7xl gap-4 px-3 pt-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0 space-y-5">
        <div className="broadcast-bar flex items-center justify-between rounded-md px-4 py-3">
          <span className="font-display text-sm tracking-[0.35em] text-muted-foreground">
            ROUND {String(room.round).padStart(2, "0")}{" "}
            <span className="text-primary">/ {room.total_rounds}</span>
          </span>
          {room.phase !== "reveal" && <ClueSteps current={room.clue} />}
        </div>

        {room.phase === "reveal" ? (
          <RevealCard reveal={room.reveal as Reveal} meId={meId} />
        ) : (
          <>
            <div className="panel stage-grid overflow-hidden p-5 sm:p-7">
  <div className="flex items-start justify-between gap-4">
    <div className="min-w-0">
      <p className="font-display text-xs font-bold uppercase text-accent">
        Now showing · Clue {String(room.clue).padStart(2, "0")}
      </p>

      <h3 className="mt-1 font-display text-2xl font-bold sm:text-3xl">
        {["", "STORY", "DIRECTOR", "HEROINE", "HERO"][room.clue]}
      </h3>
    </div>

    <div className="flex shrink-0 flex-col items-center">
      <TimerRing
        remaining={remaining}
        total={total}
        danger={room.phase !== "clue"}
      />

      {room.phase === "answer" && (
        <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.2em] text-destructive">
          Answer Timer
        </p>
      )}
    </div>
  </div>

  <ClueBoard clue={clue} current={room.clue} />
</div>
            <ActionZone
              room={room}
              meId={meId}
              answerer={answerer}
              canBuzz={canBuzz}
              buzzing={buzzing}
              onBuzz={buzz}
              eliminated={eliminated.includes(meId)}
              remaining={remaining}
            />
          </>
        )}
      </div>
     <Scoreboard
  players={players}
  meId={meId}
  hostId={room.host_id}
  eliminated={room.phase === "reveal" ? [] : eliminated}
  active={room.answer_player_id}
  room={room}
/>
    </section>
  );
}

function ClueSteps({ current }: { current: number }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-8 rounded-full transition-all ${i < current ? "bg-primary/50" : i === current ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

function ClueBoard({ clue, current }: { clue: ClueData; current: number }) {
  const people: { k: keyof ClueData; label: string; n: number }[] = [
    { k: "director", label: "Director / இயக்குநர்", n: 2 },
    { k: "heroine", label: "Heroine / கதாநாயகி", n: 3 },
    { k: "hero", label: "Hero / கதாநாயகன்", n: 4 },
  ];

  return (
    <div className="mt-6 space-y-5">
      {/* STORY CLUE */}
      <div
        className={`rounded-md border p-5 sm:p-7 ${
          current === 1
            ? "border-primary/40 bg-background/80"
            : "border-border bg-background/50"
        }`}
      >
        {/* English */}
        <div>
          <p className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-primary">
            Story · English
          </p>

          <p className="max-w-3xl text-lg font-medium leading-relaxed sm:text-2xl">
            “{clue.story || "Story clue unavailable"}”
          </p>
        </div>

        {/* Tamil */}
        <div className="mt-5 border-t border-border/60 pt-4">
          <p
            className="mb-2 font-display text-[10px] font-bold uppercase tracking-[0.25em] text-primary"
            lang="ta"
          >
            கதை · தமிழ்
          </p>

          <p
            lang="ta"
            className="max-w-3xl text-base leading-relaxed text-foreground/90 sm:text-xl"
            style={{
              fontFamily: "'Noto Sans Tamil', var(--font-sans)",
            }}
          >
            “{clue.story_ta || "தமிழ் கதை குறிப்பு கிடைக்கவில்லை"}”
          </p>
        </div>

        {/* Genres */}
        <div className="mt-4 flex flex-wrap gap-2">
          {clue.genres?.map((g) => (
            <span
              key={g}
              className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-display text-[10px] font-bold uppercase text-primary"
            >
              {g}
            </span>
          ))}
        </div>

        {/* Trivia */}
        {clue.trivia && clue.trivia.length > 0 && (
          <ul
            className="mt-4 space-y-1.5 border-t border-border pt-3"
            aria-label="Movie trivia hints"
          >
            {clue.trivia.map((t, i) => (
              <li
                key={`${t}-${i}`}
                className={`flex gap-2 text-sm text-foreground/80 sm:text-base ${
                  i === clue.trivia!.length - 1 ? "fade-slide" : ""
                }`}
              >
                <span className="shrink-0 font-display text-[10px] font-bold uppercase leading-6 text-primary">
                  Trivia
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PEOPLE CLUES */}
      <div className="grid grid-cols-3 gap-3">
        {people.map(({ k, label, n }) => (
          <PersonCard
            key={k}
            name={clue[k] as string | undefined}
            photo={
              clue[`${k}_photo` as keyof ClueData] as string | undefined
            }
            label={label}
            n={n}
            active={current === n}
          />
        ))}
      </div>

      {/* PUNCH DIALOGUE */}
      {clue.punch && current >= 4 && (
        <blockquote className="rise-in rounded-md border border-primary/40 bg-primary/5 p-4 text-center sm:p-5">
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.3em] text-primary">
            Punch Dialogue · பஞ்ச் டயலாக்
          </p>

          <p
            lang="ta"
            className="mt-2 text-lg font-semibold leading-relaxed sm:text-xl"
            style={{
              fontFamily: "'Noto Sans Tamil', var(--font-sans)",
            }}
          >
            “{clue.punch}”
          </p>
        </blockquote>
      )}
    </div>
  );
}

function PersonCard({
  name,
  photo,
  label,
  n,
  active,
}: {
  name: string | undefined;
  photo: string | undefined;
  label: string;
  n: number;
  active: boolean;
}) {
  /*
   * Try the supplied TMDB photo first.
   * If unavailable, try the existing person-image helper.
   */
  const wikiImg = usePersonImage(name);

  const img =
    tmdbImage(photo, "w500") ??
    wikiImg ??
    undefined;

  if (!name) {
    return (
      <div className="flex aspect-[3/4] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/40 text-center">
        <span className="font-display text-3xl text-muted-foreground/40">
          ?
        </span>

        <p className="mt-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground/60">
          Clue {n}
        </p>
      </div>
    );
  }

  return (
    <div
      className={`relative aspect-[3/4] overflow-hidden rounded-xl border transition-all duration-500 ${
        active
          ? "border-primary shadow-[var(--shadow-gold)] animate-scale-in"
          : "border-primary/30"
      }`}
    >
      {img ? (
        <img
          src={img}
          alt={`${label}: ${name}`}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
          onError={(e) => {
            /*
             * If the external image fails, hide the broken image
             * instead of showing a broken-image icon.
             */
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-secondary/60 to-card">
          <Avatar
            name={name}
            size={56}
            gold={active}
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent p-2 pt-8 text-center">
        <p className="text-[9px] uppercase tracking-[0.25em] text-primary">
          {label}
        </p>

        <p className="font-display text-xs font-bold leading-tight sm:text-sm">
          {name}
        </p>
      </div>
    </div>
  );
}

function TimerRing({
  remaining,
  total,
  danger,
}: {
  remaining: number;
  total: number;
  danger?: boolean;
}) {
  const r = 30,
    c = 2 * Math.PI * r;
  const frac = Math.min(1, remaining / total);
  const low = remaining <= 5;
  return (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 72 72" className="h-full w-full -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--muted)" strokeWidth="5" />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke={danger || low ? "var(--destructive)" : "var(--primary)"}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.2s linear" }}
        />
      </svg>
      <span
        className={`absolute inset-0 grid place-items-center font-mono text-2xl font-bold ${low ? "text-destructive" : "text-primary"}`}
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}

function ActionZone(props: {
  room: Room;
  meId: string;
  answerer: Player | undefined;
  canBuzz: boolean;
  buzzing: boolean;
  onBuzz: () => void;
  eliminated: boolean;
  remaining: number;
}) {
  const { room, meId, answerer } = props;
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const mine = room.phase === "answer" && room.answer_player_id === meId;

  useEffect(() => {
    if (mine) {
      setAnswer("");
      inputRef.current?.focus();
    }
    return undefined;
  }, [mine]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!answer.trim()) {
      toast.error("Please enter an answer.");
      return;
    }
    setSending(true);
    const { error } = await supabase.rpc("submit_answer", { p_room: room.id, p_answer: answer });
    setSending(false);
    if (error) toast.error(errMsg(error));
  }

  if (room.phase === "answer") {
    return (
      <div className="panel animate-scale-in p-5 text-center sm:p-7">
        <p className="font-display text-xs tracking-[0.5em] text-destructive">BUZZER LOCKED</p>
        <div className="mt-3 flex justify-center">
          {answerer && <Avatar name={answerer.username} actor={answerer.avatar} gold size={56} />}
        </div>
        <p className="mt-2 font-display text-2xl font-bold text-gold sm:text-3xl">
          {answerer?.username ?? "Someone"} HAS BUZZED!
        </p>
        {mine ? (
          <form onSubmit={submit} className="mx-auto mt-5 flex max-w-lg flex-col gap-3 sm:flex-row">
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="TYPE YOUR ANSWER"
              className="field flex-1 text-lg"
              maxLength={60}
            />
            <button disabled={sending} className="btn-gold">
              Submit
            </button>
          </form>
        ) : (
          <p className="mt-4 text-muted-foreground">
            Answer locked to <span className="text-foreground">{answerer?.username}</span>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      {room.phase === "open" && (
        <p className="animate-pulse font-display text-lg tracking-[0.3em] text-primary">
          OPEN BUZZER · Chance irukku!
        </p>
      )}
      <button
        onClick={props.onBuzz}
        disabled={!props.canBuzz || props.buzzing}
        className="buzzer h-40 w-40 rounded-full text-lg sm:h-44 sm:w-44 sm:text-xl"
        aria-label="I know it"
      >
        <span className="block text-xs font-bold text-primary">BUZZ</span>I KNOW IT
      </button>
      <p className="text-xs text-muted-foreground">
        {props.eliminated ? (
          "You're out for this round."
        ) : (
          <>
            Tap or press <kbd className="rounded border border-border px-1.5 font-mono">Space</kbd>
          </>
        )}
      </p>
    </div>
  );
}

function RevealCard({ reveal, meId }: { reveal: Reveal; meId: string }) {
  const won = reveal.outcome === "correct";
  const wikiPoster = useMoviePoster(
    reveal.poster_path ? undefined : (reveal.wiki_title ?? reveal.title),
  );
  const poster = tmdbImage(reveal.poster_path, "w500") ?? wikiPoster;
  return (
    <div className="space-y-5 text-center">
      {won && <Confetti />}
      <div>
        <p
          className={`slam font-display text-3xl font-black sm:text-5xl ${won ? "text-shimmer" : "text-foreground"}`}
        >
          {won ? reveal.dialogue : reveal.outcome === "nobody" ? "TIME'S UP!" : "NOBODY GOT IT!"}
        </p>
        <p className="rise-in mt-2 text-muted-foreground" style={{ animationDelay: "0.3s" }}>
          {won ? (
            <>
              <span className="text-foreground">
                {reveal.winner_id === meId ? "You" : reveal.winner_name}
              </span>{" "}
              found it on clue {reveal.clue} · <span className="font-mono text-success">+1</span>
            </>
          ) : (
            <>
              {reveal.dialogue} · <span className="font-mono">+0</span>
            </>
          )}
        </p>
      </div>
      <div
        className="panel light-sweep rise-in mx-auto max-w-3xl overflow-hidden"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="grid sm:grid-cols-[minmax(220px,0.8fr)_1.2fr]">
          <div className="relative aspect-[2/3] min-h-[360px] overflow-hidden bg-muted">
            {poster ? (
              <img
                src={poster}
                alt={`${reveal.title} movie poster`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-secondary via-card to-background p-6 text-center">
                <h2 className="font-display text-4xl font-black text-primary">{reveal.title}</h2>
              </div>
            )}
            <div className="film-strip absolute inset-x-0 top-0" />
            <div className="film-strip absolute inset-x-0 bottom-0" />
          </div>
          <div className="flex flex-col justify-center p-6 text-left sm:p-8">
            <p className="font-display text-xs font-bold uppercase text-accent">The answer is</p>
            <h2
              className="slam mt-3 font-display text-4xl font-black leading-tight text-shimmer sm:text-6xl"
              style={{ animationDelay: "0.9s" }}
            >
              {reveal.title}
            </h2>
            <p className="mt-2 font-mono text-sm text-muted-foreground">
              {reveal.year} · {reveal.genres?.join(" / ")}
            </p>
            <div className="my-6 h-px w-full bg-border" />
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Released</p>
                <p className="font-mono text-2xl font-bold text-primary">{reveal.year ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Directed by
                </p>
                <p className="font-display text-lg font-bold leading-tight">{reveal.director}</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Starring</p>
            <p className="font-semibold">
              {reveal.hero} & {reveal.heroine}
            </p>
            {reveal.movie_id && (
              <Link
                to="/movie/$id"
                params={{ id: String(reveal.movie_id) }}
                target="_blank"
                className="btn-outline-gold mt-6 self-start px-4 py-2 text-xs"
              >
                Movie details ↗
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Scoreboard({
  players,
  meId,
  hostId,
  eliminated,
  active,
  room,
}: {
  players: Player[];
  meId: string;
  hostId: string;
  eliminated: string[];
  active: string | null;
  room: Room;
}) {
  const isTeamBattle = room.game_mode === "team";

  /*
   * CLASSIC MODE
   * Keep existing scoreboard behaviour.
   */
  if (!isTeamBattle) {
    const sorted = [...players].sort((a, b) => b.score - a.score);

    return (
      <div className="panel p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="font-display text-xs tracking-[0.3em] text-muted-foreground">
            SCOREBOARD
          </span>

          <span className="font-mono text-xs text-muted-foreground">
            {players.length} PLAYERS
          </span>
        </div>

        <div className="space-y-2">
          {sorted.map((p, i) => {
            const isMe = p.user_id === meId;
            const isActive = p.user_id === active;
            const isEliminated = eliminated.includes(p.user_id);

            return (
              <div
                key={p.user_id}
                className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
                  isActive
                    ? "border-gold/60 bg-gold/10"
                    : isMe
                      ? "border-primary/30 bg-primary/5"
                      : "border-border bg-card/50"
                } ${isEliminated ? "opacity-40" : ""}`}
              >
                <span className="w-6 text-center font-mono text-xs text-muted-foreground">
                  {i + 1}
                </span>

                <Avatar
                  name={p.username}
                  actor={p.avatar}
                  gold={isMe}
                  size={40}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">
                    {p.username}
                    {isMe && (
                      <span className="ml-2 text-[10px] text-primary">
                        YOU
                      </span>
                    )}
                  </p>

                  {p.user_id === hostId && (
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                      HOST
                    </p>
                  )}
                </div>

                <span className="font-mono text-lg font-bold text-gold">
                  {p.score}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /*
   * TEAM BATTLE
   */
  const teamA = [...players]
    .filter((p) => p.team === "team_1")
    .sort((a, b) => b.score - a.score);

  const teamB = [...players]
    .filter((p) => p.team === "team_2")
    .sort((a, b) => b.score - a.score);

  function TeamPlayer({
    player,
    team,
  }: {
    player: Player;
    team: "team_1" | "team_2";
  }) {
    const isMe = player.user_id === meId;
    const isActive = player.user_id === active;
    const isEliminated = eliminated.includes(player.user_id);

    const red = team === "team_1";

    return (
      <div
        className={`flex items-center gap-3 rounded-xl border p-3 transition-all ${
          red
            ? "border-destructive/30 bg-destructive/5"
            : "border-primary/30 bg-primary/5"
        } ${
          isActive
            ? red
              ? "ring-2 ring-destructive/60"
              : "ring-2 ring-primary/60"
            : ""
        } ${isEliminated ? "opacity-40" : ""}`}
      >
        <div
          className={`rounded-full ${
            red ? "ring-4 ring-destructive/50" : "ring-4 ring-primary/50"
          }`}
        >
          <Avatar
            name={player.username}
            actor={player.avatar}
            gold={isMe}
            size={42}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {player.username}

            {isMe && (
              <span className="ml-2 text-[10px] text-primary">
                YOU
              </span>
            )}
          </p>

          {player.user_id === hostId && (
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
              HOST
            </p>
          )}
        </div>

        <span
          className={`font-mono text-xl font-black ${
            red ? "text-destructive" : "text-primary"
          }`}
        >
          {player.score > 0 ? "+" : ""}
          {player.score}
        </span>
      </div>
    );
  }

 return (
  <div className="space-y-5">
    {/* TEAM HEADERS */}
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

      {/* 🔴 TEAM A */}
      <div className="rounded-2xl border-2 border-destructive/50 bg-destructive/5 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-destructive/15 text-2xl">
              🔴
            </div>

            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                TEAM A
              </p>

              <h3 className="truncate font-display text-lg font-black uppercase text-destructive sm:text-xl">
                {room.team_1_name || "TEAM A"}
              </h3>

              <p className="mt-1 text-[10px] text-muted-foreground">
                {teamA.length} / {room.team_size ?? 0} PLAYERS
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              SCORE
            </p>

            <p className="font-mono text-3xl font-black text-destructive">
              {room.team_1_score > 0 ? "+" : ""}
              {room.team_1_score}
            </p>
          </div>
        </div>
      </div>

      {/* 🔵 TEAM B */}
      <div className="rounded-2xl border-2 border-primary/50 bg-primary/5 p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-2xl">
              🔵
            </div>

            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-muted-foreground">
                TEAM B
              </p>

              <h3 className="truncate font-display text-lg font-black uppercase text-primary sm:text-xl">
                {room.team_2_name || "TEAM B"}
              </h3>

              <p className="mt-1 text-[10px] text-muted-foreground">
                {teamB.length} / {room.team_size ?? 0} PLAYERS
              </p>
            </div>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">
              SCORE
            </p>

            <p className="font-mono text-3xl font-black text-primary">
              {room.team_2_score > 0 ? "+" : ""}
              {room.team_2_score}
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* PLAYER CARDS — ALWAYS UNDER THEIR OWN TEAM */}
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">

      {/* 🔴 TEAM A PLAYERS */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive" />

          <span className="truncate font-display text-xs font-bold uppercase tracking-[0.2em] text-destructive">
            {room.team_1_name || "TEAM A"}
          </span>
        </div>

        <div className="space-y-2">
          {teamA.length > 0 ? (
            teamA.map((player) => (
              <TeamPlayer
                key={player.user_id}
                player={player}
                team="team_1"
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-destructive/30 p-4 text-center text-xs text-muted-foreground">
              No players
            </div>
          )}
        </div>
      </section>

      {/* 🔵 TEAM B PLAYERS */}
      <section className="min-w-0">
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />

          <span className="truncate font-display text-xs font-bold uppercase tracking-[0.2em] text-primary">
            {room.team_2_name || "TEAM B"}
          </span>
        </div>

        <div className="space-y-2">
          {teamB.length > 0 ? (
            teamB.map((player) => (
              <TeamPlayer
                key={player.user_id}
                player={player}
                team="team_2"
              />
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-primary/30 p-4 text-center text-xs text-muted-foreground">
              No players
            </div>
          )}
        </div>
      </section>
    </div>
  </div>
);
}
/* ---------------- FINAL ---------------- */
function Final({
  room,
  players,
  isHost,
  meId,
}: {
  room: Room;
  players: Player[];
  isHost: boolean;
  meId: string;
}) {
  const [busy, setBusy] = useState(false);
  const [music, setMusic] = useState(true);

  const isTeamBattle = room.game_mode === "team";

  const sorted = [...players].sort((a, b) => b.score - a.score);

  const teamA = [...players]
    .filter((p) => p.team === "team_1")
    .sort((a, b) => b.score - a.score);

  const teamB = [...players]
    .filter((p) => p.team === "team_2")
    .sort((a, b) => b.score - a.score);

  const teamAScore = room.team_1_score ?? 0;
  const teamBScore = room.team_2_score ?? 0;

  const teamAWins = teamAScore > teamBScore;
  const teamBWins = teamBScore > teamAScore;
  const teamDraw = teamAScore === teamBScore;

  useEffect(() => {
    if (!music) return;

    const stop = startMassBgm();

    return stop;
  }, [music]);

  async function again() {
    setBusy(true);

    const { error } = await supabase.rpc("start_game", {
      p_room: room.id,
    });

    setBusy(false);

    if (error) {
      toast.error(errMsg(error));
    }
  }

  /*
   * =========================
   * TEAM BATTLE FINAL
   * =========================
   */
  if (isTeamBattle) {
    return (
      <section className="relative mx-auto mt-8 max-w-5xl px-4 pb-10 text-center">
        <Confetti count={120} />

        <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[70vh] w-96 -translate-x-1/2 spotlight bg-gradient-to-b from-primary/30 to-transparent blur-2xl" />

        <p className="rise-in font-display text-sm tracking-[0.6em] text-accent">
          TEAM BATTLE COMPLETE
        </p>

        <h1 className="slam mt-3 font-display text-4xl font-black text-shimmer sm:text-6xl">
          THE SHOW IS OVER
        </h1>

        <button
          onClick={() => setMusic((m) => !m)}
          className="btn-outline-gold mt-5 px-4 py-2 text-[10px]"
        >
          {music ? "Celebration music on" : "Play celebration music"}
        </button>

        {/* ================= WINNER ================= */}
        <div className="mt-8">
          {teamDraw ? (
            <>
              <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
                MATCH RESULT
              </p>

              <h2 className="slam mt-2 font-display text-4xl font-black text-gold sm:text-5xl">
                IT'S A DRAW!
              </h2>

              <p className="mt-2 text-muted-foreground">
                Both teams finished with the same score.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-sm uppercase tracking-[0.35em] text-accent">
                CHAMPIONS
              </p>

              <h2
                className={`slam mt-2 font-display text-4xl font-black sm:text-5xl ${
                  teamAWins ? "text-destructive" : "text-primary"
                }`}
              >
                {teamAWins
                  ? room.team_1_name || "TEAM A"
                  : room.team_2_name || "TEAM B"}
              </h2>

              <p className="mt-2 text-muted-foreground">
                {teamAWins ? "Team A takes the victory!" : "Team B takes the victory!"}
              </p>
            </>
          )}
        </div>

        {/* ================= TEAM SCORE ================= */}
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {/* TEAM A */}
          <div
            className={`rounded-3xl border-2 p-6 transition-all ${
              teamAWins
                ? "border-destructive bg-destructive/10 shadow-xl"
                : "border-destructive/40 bg-destructive/5"
            }`}
          >
            <div className="text-4xl">🔴</div>

            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              TEAM A
            </p>

            <h2 className="mt-1 font-display text-2xl font-black uppercase text-destructive sm:text-3xl">
              {room.team_1_name || "TEAM A"}
            </h2>

            <p className="mt-5 font-mono text-6xl font-black text-destructive">
              {teamAScore}
            </p>

            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              TEAM POINTS
            </p>

            {teamAWins && (
              <div className="mt-4 rounded-full bg-destructive/15 py-2 font-display text-xs font-black uppercase tracking-widest text-destructive">
                🏆 WINNER
              </div>
            )}
          </div>

          {/* TEAM B */}
          <div
            className={`rounded-3xl border-2 p-6 transition-all ${
              teamBWins
                ? "border-primary bg-primary/10 shadow-xl"
                : "border-primary/40 bg-primary/5"
            }`}
          >
            <div className="text-4xl">🔵</div>

            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.3em] text-muted-foreground">
              TEAM B
            </p>

            <h2 className="mt-1 font-display text-2xl font-black uppercase text-primary sm:text-3xl">
              {room.team_2_name || "TEAM B"}
            </h2>

            <p className="mt-5 font-mono text-6xl font-black text-primary">
              {teamBScore}
            </p>

            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-muted-foreground">
              TEAM POINTS
            </p>

            {teamBWins && (
              <div className="mt-4 rounded-full bg-primary/15 py-2 font-display text-xs font-black uppercase tracking-widest text-primary">
                🏆 WINNER
              </div>
            )}
          </div>
        </div>

        {/* ================= DRAW ================= */}
        {teamDraw && (
          <div className="mt-5 rounded-2xl border border-gold/40 bg-gold/5 p-4">
            <p className="font-display text-sm font-bold uppercase tracking-widest text-gold">
              🤝 MATCH DRAW
            </p>
          </div>
        )}

        {/* ================= PLAYER SCORES ================= */}
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {/* TEAM A PLAYERS */}
          <div className="panel p-5 text-left">
            <div className="mb-4 flex items-center gap-2">
              <span>🔴</span>

              <h3 className="font-display text-sm font-black uppercase tracking-[0.2em] text-destructive">
                {room.team_1_name || "TEAM A"}
              </h3>
            </div>

            <div className="space-y-2">
              {teamA.map((p, index) => (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                    index === 0
                      ? "bg-destructive/10 ring-1 ring-destructive/30"
                      : "bg-background/40"
                  }`}
                >
                  <span className="w-5 text-center font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="rounded-full ring-2 ring-destructive/50">
                    <Avatar
                      name={p.username}
                      actor={p.avatar}
                      gold={p.user_id === meId}
                      size={42}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {p.username}

                      {p.user_id === meId && (
                        <span className="ml-2 text-[10px] text-primary">
                          YOU
                        </span>
                      )}
                    </p>

                    {p.user_id === room.host_id && (
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        HOST
                      </p>
                    )}
                  </div>

                  <span className="font-mono text-xl font-black text-destructive">
                    {p.score > 0 ? "+" : ""}
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* TEAM B PLAYERS */}
          <div className="panel p-5 text-left">
            <div className="mb-4 flex items-center gap-2">
              <span>🔵</span>

              <h3 className="font-display text-sm font-black uppercase tracking-[0.2em] text-primary">
                {room.team_2_name || "TEAM B"}
              </h3>
            </div>

            <div className="space-y-2">
              {teamB.map((p, index) => (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                    index === 0
                      ? "bg-primary/10 ring-1 ring-primary/30"
                      : "bg-background/40"
                  }`}
                >
                  <span className="w-5 text-center font-mono text-xs text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="rounded-full ring-2 ring-primary/50">
                    <Avatar
                      name={p.username}
                      actor={p.avatar}
                      gold={p.user_id === meId}
                      size={42}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">
                      {p.username}

                      {p.user_id === meId && (
                        <span className="ml-2 text-[10px] text-primary">
                          YOU
                        </span>
                      )}
                    </p>

                    {p.user_id === room.host_id && (
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground">
                        HOST
                      </p>
                    )}
                  </div>

                  <span className="font-mono text-xl font-black text-primary">
                    {p.score > 0 ? "+" : ""}
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ================= ACTIONS ================= */}
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {isHost ? (
            <button
              onClick={again}
              disabled={busy || players.length < 2}
              className="btn-gold"
            >
              {busy ? "Lights…" : "Play again"}
            </button>
          ) : (
            <p className="self-center text-sm text-muted-foreground">
              Host can start a new show
            </p>
          )}

          <Link to="/home" className="btn-outline-gold">
            Home
          </Link>
        </div>
      </section>
    );
  }

  /*
   * =========================
   * CLASSIC FINAL
   * =========================
   */

  const podium = [sorted[1], sorted[0], sorted[2]];
  const heights = ["h-24", "h-36", "h-16"];
  const order = [1, 0, 2];

  return (
    <section className="relative mx-auto mt-8 max-w-2xl text-center">
      <Confetti count={90} />

      <div className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[70vh] w-72 -translate-x-1/2 spotlight bg-gradient-to-b from-primary/30 to-transparent blur-2xl" />

      <p className="rise-in font-display text-sm tracking-[0.6em] text-accent">
        GAME OVER
      </p>

      <h1 className="slam mt-3 font-display text-4xl font-black text-shimmer sm:text-6xl">
        THE SHOW IS OVER
      </h1>

      <button
        onClick={() => setMusic((m) => !m)}
        className="btn-outline-gold mt-5 px-4 py-2 text-[10px]"
      >
        {music ? "Celebration music on" : "Play celebration music"}
      </button>

      <div className="mt-10 grid grid-cols-3 items-end gap-3">
        {podium.map((p, idx) =>
          p ? (
            <div
              key={p.user_id}
              className="rise-in flex flex-col items-center"
              style={{
                animationDelay: `${0.4 + (2 - idx) * 0.25}s`,
              }}
            >
              {order[idx] === 0 && (
                <span className="float-soft mb-1 text-3xl">👑</span>
              )}

              <div className={order[idx] === 0 ? "float-soft" : ""}>
                <Avatar
                  name={p.username}
                  actor={p.avatar}
                  size={order[idx] === 0 ? 72 : 52}
                  gold={order[idx] === 0}
                />
              </div>

              <p className="mt-2 w-full truncate font-display text-sm font-bold">
                {p.username}
              </p>

              <p
                className={`font-mono text-2xl font-bold ${
                  order[idx] === 0 ? "text-primary" : ""
                }`}
              >
                {p.score}
              </p>

              <div
                className={`mt-2 w-full rounded-t-lg border border-b-0 ${
                  order[idx] === 0
                    ? "border-primary bg-gradient-to-b from-primary/40 to-primary/5"
                    : "border-border bg-gradient-to-b from-secondary/60 to-card"
                } ${heights[idx]} grid place-items-center font-display text-2xl font-black text-foreground/70`}
              >
                {(order[idx] ?? 0) + 1}
              </div>
            </div>
          ) : (
            <div key={idx} />
          ),
        )}
      </div>

      <div className="panel light-sweep p-5 sm:p-6">
        <ul className="space-y-3">
          {sorted.map((p, i) => (
            <li
              key={p.user_id}
              className={`rise-in flex items-center gap-4 rounded-xl px-4 py-3 ${
                i === 0
                  ? "bg-primary/10 ring-1 ring-primary"
                  : "bg-background/40"
              }`}
              style={{
                animationDelay: `${1.2 + i * 0.15}s`,
              }}
            >
              <Avatar
                name={p.username}
                actor={p.avatar}
                size={i === 0 ? 48 : 38}
                gold={i === 0}
              />

              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate font-display text-lg">
                  {p.username}

                  {p.user_id === meId && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      (you)
                    </span>
                  )}
                </span>

                {p.player_id && (
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">
                    ID · {p.player_id}
                  </span>
                )}
              </span>

              <span
                className={`font-mono text-2xl font-bold ${
                  i === 0 ? "text-primary" : ""
                }`}
              >
                {p.score}
                <span className="ml-1 text-xs text-muted-foreground">
                  PTS
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {isHost ? (
          <button
            onClick={again}
            disabled={busy || players.length < 2}
            className="btn-gold"
          >
            {busy ? "Lights…" : "Play again"}
          </button>
        ) : (
          <p className="self-center text-sm text-muted-foreground">
            Host can start a new show
          </p>
        )}

        <Link to="/home" className="btn-outline-gold">
          Home
        </Link>
      </div>
    </section>
  );
}