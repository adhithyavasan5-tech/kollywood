import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** The daily database scheduler authenticates with a random token that exists only inside the database. */
async function isDailySchedulerCall(request: Request) {
  const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get("x-daily-token") ?? "")?.[1];
  if (!token) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_private_config")
    .select("value")
    .eq("name", "tmdb_daily_token")
    .maybeSingle();
  if (!data?.value) return false;
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const d = (v: string) => createHash("sha256").update(v, "utf8").digest();
  return timingSafeEqual(d(token), d(data.value));
}

export const Route = createFileRoute("/api/public/tmdb-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const daily = await isDailySchedulerCall(request);
        if (!daily) {
          const denied = await authenticateCronRequest(request);
          if (denied) return denied;
        }
        const { runTmdbSync, runTmdbRecent, TmdbError } = await import("@/lib/tmdb-sync.server");
        const body = (await request.json().catch(() => ({}))) as { mode?: unknown };
        try {
          const { runClueRewrite } = await import("@/lib/clue-rewrite.server");
          if (body.mode === "clues") return Response.json(await runClueRewrite());
          if (daily || body.mode === "daily") {
            const recent = await runTmdbRecent();
            const backfill = await runTmdbSync();
            const clues = await runClueRewrite(30).catch((e) => ({ error: String(e) }));
            return Response.json({ recent, backfill, clues });
          }
          return Response.json(await runTmdbSync());
        } catch (e) {
          const status = e instanceof TmdbError && e.status === 429 ? 429 : 502;
          console.error("TMDB sync failed", e);
          return Response.json(
            { error: e instanceof Error ? e.message : "sync failed" },
            { status },
          );
        }
      },
    },
  },
});
