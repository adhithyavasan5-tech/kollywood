import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Backdrop, Logo } from "@/components/Backdrop";
import { AvatarPicker } from "@/components/AvatarPicker";
import {
  PLAYER_ID_RE,
  errMsg,
  normalizePlayerId,
  passwordProblem,
  playerEmail,
} from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kollywood Clash — Guess the Movie. Beat the Clock." },
      {
        name: "description",
        content:
          "Enter the show: a real-time multiplayer Tamil movie guessing game for 2 to 10 players.",
      },
      {
        property: "og:title",
        content: "Kollywood Clash — Guess the Movie. Beat the Clock.",
      },
      {
        property: "og:description",
        content: "Real-time multiplayer Tamil movie guessing game for 2 to 10 players.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [pid, setPid] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/home" });
    });
  }, [navigate]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setMode((value) => (value === "login" ? "signup" : "login"));
        setError(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const name = username.trim();
    const id = normalizePlayerId(pid);

    if (!name) return setError("Please enter your username.");
    if (!id) return setError("Please enter your Player ID.");
    if (!pw) return setError("Please enter your password.");
    if (!avatar) return setError("Please choose your actor avatar.");

    setBusy(true);

    try {
      if (mode === "signup") {
        if (name.length > 20) {
          throw new Error("Username can be at most 20 characters.");
        }

        if (!PLAYER_ID_RE.test(id)) {
          throw new Error("Player ID: 3–20 letters, numbers or _.");
        }

        const p = passwordProblem(pw);

        if (p) throw new Error(p);

        if (pw !== pw2) {
          throw new Error("Passwords don't match.");
        }

        const { data: free } = await supabase.rpc(
          "is_player_id_available",
          { p_player_id: id },
        );

        if (free === false) {
          throw new Error("Player ID already exists.");
        }

        const { data, error } = await supabase.auth.signUp({
          email: playerEmail(id),
          password: pw,
          options: {
            data: {
              username: name,
              player_id: id,
              avatar,
            },
          },
        });

        if (error) {
          throw new Error(
            /registered|exists/i.test(error.message)
              ? "Player ID already exists."
              : error.message,
          );
        }

        if (!data.session) {
          throw new Error("Account created. Please sign in.");
        }
      } else {
        const { data, error } =
          await supabase.auth.signInWithPassword({
            email: playerEmail(id),
            password: pw,
          });

        if (error || !data.user) {
          throw new Error("Invalid credentials.");
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", data.user.id)
          .maybeSingle();

        if (
          !prof ||
          prof.username.toLowerCase() !== name.toLowerCase()
        ) {
          await supabase.auth.signOut();
          throw new Error("Invalid credentials.");
        }

        // Save the actor selected during login
        const { error: avatarError } = await supabase.rpc(
          "set_avatar",
          {
            p_avatar: avatar,
          },
        );

        if (avatarError) {
          await supabase.auth.signOut();
          throw new Error(errMsg(avatarError));
        }
      }

      navigate({ to: "/home" });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative isolate grid min-h-[100svh] items-center px-4 pb-24 pt-5 sm:py-8 lg:grid-cols-[1.15fr_0.85fr] lg:px-12">
      <Backdrop image />

      <section className="hidden max-w-2xl animate-fade-in lg:block">
        <p className="font-display text-sm font-bold uppercase text-primary">
          Live Tamil cinema game night
        </p>

        <h1 className="mt-4 font-display text-7xl font-extrabold leading-[0.95]">
          Guess the movie.
          <br />
          <span className="text-shimmer">Own the screen.</span>
        </h1>

        <p className="mt-6 max-w-lg text-xl leading-relaxed text-muted-foreground">
          Four clues. One buzzer. Ten rounds with the people who know
          Kollywood best.
        </p>

        <div className="mt-10 flex gap-8 border-t border-border pt-5 text-sm text-muted-foreground">
          <span>
            <b className="text-foreground">2–10</b> players
          </span>

          <span>
            <b className="text-foreground">10</b> rounds
          </span>

          <span>
            <b className="text-foreground">Live</b> scores
          </span>
        </div>
      </section>

      <div className="mx-auto w-full max-w-md">
        <Logo size="md" />

        <div className="mt-5 flex justify-center gap-5 border-y border-border py-3 text-xs text-muted-foreground lg:hidden">
          <span>
            <b className="text-foreground">2–10</b> players
          </span>

          <span>
            <b className="text-foreground">10</b> rounds
          </span>

          <span>
            <b className="text-foreground">Live</b> scores
          </span>
        </div>

        <form
          onSubmit={submit}
          className="panel mt-5 space-y-4 border-t-2 border-t-primary p-5 sm:mt-8 sm:p-8"
          noValidate
        >
          <h2 className="text-center font-display text-lg text-primary">
            {mode === "login" ? "WELCOME BACK" : "JOIN THE CAST"}
          </h2>

          <Field
            label="Username"
            value={username}
            onChange={setUsername}
            autoComplete="nickname"
            placeholder="ADHITHYA"
            delay={80}
          />

          <Field
            label="Player ID"
            value={pid}
            onChange={setPid}
            autoComplete="username"
            placeholder="adhi_07"
            delay={160}
          />

          <Field
            label="Password"
            type="password"
            value={pw}
            onChange={setPw}
            autoComplete={
              mode === "login"
                ? "current-password"
                : "new-password"
            }
            placeholder="••••••••"
            delay={240}
          />

          {mode === "signup" && (
            <Field
              label="Confirm password"
              type="password"
              value={pw2}
              onChange={setPw2}
              autoComplete="new-password"
              placeholder="••••••••"
              delay={320}
            />
          )}

          {/* Actor picker is now available during BOTH login and signup */}
          <div
            className="fade-slide"
            style={{
              animationDelay: mode === "signup" ? "360ms" : "320ms",
            }}
          >
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Your actor avatar
            </span>

            <AvatarPicker
              value={avatar}
              onChange={setAvatar}
              compact
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-gold touch-control fade-slide min-h-12 w-full"
            style={{ animationDelay: "420ms" }}
          >
            {busy
              ? "Rolling…"
              : mode === "login"
                ? "Enter the show"
                : "Create account"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode(
                mode === "login"
                  ? "signup"
                  : "login",
              );
              setError(null);
            }}
            aria-keyshortcuts="Alt+S"
            className="btn-outline-gold touch-control fade-slide min-h-12 w-full"
            style={{ animationDelay: "500ms" }}
          >
            {mode === "login"
              ? "Create account"
              : "I already have an account"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  autoComplete?: string;
  placeholder?: string;
  delay?: number;
}) {
  return (
    <label
      className="fade-slide block"
      style={
        props.delay !== undefined
          ? { animationDelay: `${props.delay}ms` }
          : undefined
      }
    >
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {props.label}
      </span>

      <input
        className="field min-h-12"
        type={props.type ?? "text"}
        value={props.value}
        autoComplete={props.autoComplete}
        placeholder={props.placeholder}
        onChange={(e) =>
          props.onChange(e.target.value)
        }
      />
    </label>
  );
}