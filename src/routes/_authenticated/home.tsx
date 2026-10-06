import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, Backdrop, Logo } from "@/components/Backdrop";
import { PosterWall } from "@/components/PosterWall";
import { TmdbAttribution } from "@/components/TmdbAttribution";
import { useEffect } from "react";
import { Linkedin, Instagram, Github, CodeXml } from "lucide-react";

export const Route = createFileRoute("/_authenticated/home")({
  head: () => ({
    meta: [
      { title: "Lobby — Kollywood Clash" },
      {
        name: "description",
        content: "Create or join a Kollywood Clash show and challenge your friends.",
      },
      { property: "og:title", content: "Lobby — Kollywood Clash" },
      { property: "og:description", content: "Create or join a Kollywood Clash show." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const { data: profile } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("id", user.id).single()).data,
  });

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
      if (event.key.toLowerCase() === "c") navigate({ to: "/create" });
      if (event.key.toLowerCase() === "j") navigate({ to: "/join" });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate]);

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col px-4 pb-24 pt-5 sm:px-8 sm:pb-24 sm:pt-6">
      <Backdrop />
      <PosterWall />
<header className="fade-slide mx-auto flex w-full max-w-5xl items-center justify-between">
  <div className="relative flex items-center">
    {/* Kollywood Clash Logo */}
    <Logo size="sm" />

    {/* Selected Actor — appears attached to the logo */}
    {profile?.avatar && (
      <Link
        to="/profile"
        aria-label={`Open profile - ${profile.avatar}`}
        className="group relative -ml-2 z-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="rounded-full border-2 border-primary bg-background p-0.5 shadow-lg shadow-primary/30 transition-transform duration-200 group-hover:scale-110">
          <Avatar
            name={profile?.username ?? "Player"}
            actor={profile.avatar}
            gold
            size={42}
          />
        </div>

        {/* Actor name */}
        <span className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-background/95 px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider text-primary opacity-0 shadow-md transition-opacity group-hover:opacity-100">
          {profile.avatar}
        </span>
      </Link>
    )}
  </div>

  <button
    onClick={async () => {
      await supabase.auth.signOut();
      navigate({ to: "/" });
    }}
    className="touch-control min-h-11 px-2 text-xs uppercase text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
  >
    Sign out
  </button>
</header>
      <section className="mx-auto mt-10 w-full max-w-4xl sm:mt-20 lg:mt-24">
        <p
          className="fade-slide font-display text-xs font-bold uppercase text-foreground/80"
          style={{ animationDelay: "80ms" }}
        >
          Tonight’s show
        </p>

        <h1
          className="rise-in mt-3 max-w-3xl font-display text-[clamp(2.65rem,13vw,4.5rem)] font-extrabold leading-[0.98] text-foreground"
          style={{ animationDelay: "160ms" }}
        >
          Bring your crew.
          <br />
          <span className="text-foreground">Name that movie.</span>
        </h1>

        <p
          className="fade-slide mt-4 max-w-xl text-base leading-relaxed text-foreground/70 sm:text-lg"
          style={{ animationDelay: "280ms" }}
        >
          Create a private room or enter a friend’s code.
        </p>

        <div className="mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
          <Link
            to="/create"
            aria-keyshortcuts="C"
            className="btn-gold touch-control hover-scale fade-slide min-h-14 py-4 text-base"
            style={{ animationDelay: "380ms" }}
          >
            Create room <kbd className="shortcut-hint">C</kbd>
          </Link>

          <Link
            to="/join"
            aria-keyshortcuts="J"
            className="btn-outline-gold touch-control hover-scale fade-slide min-h-14 py-4 text-base"
            style={{ animationDelay: "460ms" }}
          >
            Join room <kbd className="shortcut-hint">J</kbd>
          </Link>
        </div>
      </section>

      <section
        className="panel card-lift rise-in mx-auto mt-10 w-full max-w-4xl border-l-2 border-l-primary p-4 sm:mt-14 sm:p-6"
        style={{ animationDelay: "560ms" }}
      >
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto] sm:gap-8">
          <Link
            to="/profile"
            aria-label="Change avatar in Profile Settings"
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Avatar
              name={profile?.username ?? "?"}
              actor={profile?.avatar}
              gold
              size={56}
            />
          </Link>

          <div className="min-w-0">
            <div className="truncate font-display text-xl">
              {profile?.username ?? "…"}
            </div>

            <div className="truncate font-mono text-xs text-muted-foreground">
              ID · {profile?.player_id ?? "…"}
            </div>

            <Link
              to="/profile"
              className="mt-1 inline-block text-[11px] font-bold uppercase text-primary hover:underline"
            >
              Profile settings
            </Link>
          </div>

          <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:col-span-1 sm:contents sm:border-0 sm:pt-0">
            <Stat label="Total games" value={profile?.total_games} />
            <Stat label="Total points" value={profile?.total_points} gold />
          </div>
        </div>
      </section>

      <footer
        className="fade-slide mt-auto pt-16 pb-4"
        style={{ animationDelay: "680ms" }}
      >
        <div className="mx-auto w-full max-w-4xl">
          <div className="glow-line w-full" />

          <div className="footer-beat mt-4 flex flex-col items-center gap-1 text-center">

            <p className="font-display text-[11px] font-bold uppercase tracking-[0.35em] text-foreground/85">
              Fan-made · Made by Adhithyavasan
            </p>

            {/* Social Media Icons */}
            <div className="mt-5 flex items-center justify-center gap-4">

              {/* LinkedIn */}
              <a
                href="https://www.linkedin.com/in/adhithyavasan-r"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LinkedIn"
                title="LinkedIn"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-300 hover:scale-110 hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Linkedin size={19} strokeWidth={1.8} />
              </a>

              {/* Instagram */}
              <a
                href="https://www.instagram.com/hht__adhithya__18?stkn=emR0and4ZXB3cWY0"
                aria-label="Instagram"
                title="Instagram"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-300 hover:scale-110 hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Instagram size={19} strokeWidth={1.8} />
              </a>

              {/* GitHub */}
              <a
                href="https://github.com/adhithyavasan5-tech"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                title="GitHub"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-300 hover:scale-110 hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <Github size={19} strokeWidth={1.8} />
              </a>

              {/* LeetCode */}
              <a
                href="https://leetcode.com/u/Adhithyavasan/"
                aria-label="LeetCode"
                title="LeetCode"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-all duration-300 hover:scale-110 hover:border-primary hover:bg-primary/10 hover:text-primary"
              >
                <CodeXml size={19} strokeWidth={1.8} />
              </a>

            </div>

            <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              © {new Date().getFullYear()} Kollywood Clash · Not affiliated with any studio or
              production house
            </p>

            <div className="mt-1">
              <TmdbAttribution />
            </div>

          </div>
        </div>
      </footer>
    </main>
  );
}

function Stat({
  label,
  value,
  gold,
}: {
  label: string;
  value?: number | undefined;
  gold?: boolean;
}) {
  return (
    <div className="text-center sm:text-right">
      <div className={`font-mono text-3xl font-bold ${gold ? "text-primary" : ""}`}>
        {value ?? "–"}
      </div>

      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
