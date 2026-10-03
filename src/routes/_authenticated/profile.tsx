import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, Backdrop, Logo } from "@/components/Backdrop";
import { AvatarPicker } from "@/components/AvatarPicker";
import { TmdbAttribution } from "@/components/TmdbAttribution";
import { errMsg } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile Settings — Kollywood Clash" },
      { name: "description", content: "Choose your actor avatar for Kollywood Clash." },
      { property: "og:title", content: "Profile Settings — Kollywood Clash" },
      {
        property: "og:description",
        content: "Pick the Tamil star who represents you in every show.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = Route.useRouteContext();
  const qc = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () =>
      (await supabase.from("profiles").select("*").eq("id", user.id).single()).data,
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile) setChoice(profile.avatar);
    return undefined;
  }, [profile]);

  async function save() {
    if (!choice) {
      toast.error("Please choose an avatar.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("set_avatar", { p_avatar: choice });
    setBusy(false);
    if (error) {
      toast.error(errMsg(error));
      return;
    }
    toast.success("Avatar saved");
    qc.invalidateQueries({ queryKey: ["profile", user.id] });
  }

  return (
    <main className="relative isolate flex min-h-[100svh] flex-col px-4 pb-24 pt-5 sm:px-8">
      <Backdrop />
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between">
        <Logo size="sm" />
        <Link
          to="/home"
          className="touch-control min-h-11 px-2 text-xs uppercase text-muted-foreground hover:text-primary"
        >
          ← Lobby
        </Link>
      </header>
      <section className="mx-auto mt-8 w-full max-w-4xl">
        <p className="fade-slide font-display text-xs font-bold uppercase text-accent">
          Profile settings
        </p>
        <h1 className="rise-in mt-2 font-display text-4xl font-extrabold sm:text-5xl">
          Choose your star
        </h1>
        <div className="panel mt-6 flex items-center gap-4 p-4">
          <Avatar name={profile?.username ?? "?"} actor={choice} gold size={64} />
          <div className="min-w-0">
            <div className="truncate font-display text-xl">
              {profile?.username ?? (isLoading ? "…" : "Player")}
            </div>
            <div className="truncate font-mono text-xs text-muted-foreground">
              ID · {profile?.player_id ?? "…"}
            </div>
          </div>
        </div>
        <div className="mt-6">
          <AvatarPicker value={choice} onChange={setChoice} />
        </div>
        <button
          onClick={save}
          disabled={busy || !choice || choice === profile?.avatar}
          className="btn-gold touch-control mt-6 min-h-12 w-full sm:w-auto sm:px-10"
        >
          {busy ? "Saving…" : choice === profile?.avatar ? "Saved" : "Save avatar"}
        </button>
      </section>
      <footer className="mt-auto pt-12">
        <TmdbAttribution />
      </footer>
    </main>
  );
}
