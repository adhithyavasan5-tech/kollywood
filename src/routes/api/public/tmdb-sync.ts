import { backfillMissingMoviePosters } from "@/lib/tmdb-sync.server";

/**
 * POST /api/public/tmdb-sync?mode=poster-backfill
 *
 * IMPORTANT:
 * This endpoint is POSTER ONLY.
 *
 * It does NOT run:
 * - runTmdbSync()
 * - runTmdbRecent()
 * - tmdb_upsert_movies()
 *
 * Therefore it cannot add new movies.
 */

export async function POST({
  request,
}: {
  request: Request;
}) {
  try {
    const url = new URL(request.url);

    const mode = url.searchParams.get("mode");

    /**
     * ONLY allow poster backfill.
     */
    if (mode !== "poster-backfill") {
      return Response.json(
        {
          error: "TMDB catalogue sync is disabled.",
          message:
            "Use ?mode=poster-backfill to update posters for existing movies only.",
        },
        {
          status: 403,
        }
      );
    }

    /**
     * Run poster-only update.
     */
    const result = await backfillMissingMoviePosters();

    return Response.json(result);
  } catch (error) {
    console.error("[POSTER-BACKFILL] ERROR:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
      {
        status: 500,
      }
    );
  }
}