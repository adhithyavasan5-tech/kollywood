// Server-only TMDB ingestion. The read access token never leaves the server.
const API = "https://api.themoviedb.org/3";
const FIRST_YEAR = 1931;
const PAGES_PER_RUN = 3;

type Person = {
  id: number;
  name: string;
  gender: number;
  order?: number;
  character?: string;
  job?: string;
  profile_path: string | null;
};
type Details = {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  popularity: number;
  vote_count: number;
  vote_average: number;
  runtime: number | null;
  tagline: string | null;
  budget: number;
  revenue: number;
  genres: { name: string }[];
  credits?: { cast: Person[]; crew: Person[] };
  keywords?: { keywords: { name: string }[] };
  alternative_titles?: { titles: { title: string }[] };
};

export class TmdbError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function tmdb<T>(path: string, params: Record<string, string> = {}, attempt = 0): Promise<T> {
  const token = process.env["TMDB_READ_ACCESS_TOKEN"];
  if (!token) throw new TmdbError("TMDB token is not configured", 500);
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (res.status === 429 && attempt < 3) {
    const wait = Number(res.headers.get("retry-after") ?? "2") * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 10000)));
    return tmdb<T>(path, params, attempt + 1);
  }
  if (!res.ok)
    throw new TmdbError(`TMDB ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);
  return (await res.json()) as T;
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function maskStory(text: string, secrets: string[]) {
  let out = text;
  for (const s of secrets) {
    if (!s || s.length < 3) continue;
    out = out.replace(new RegExp(escapeRe(s), "gi"), "this film");
  }
  return out.trim();
}

function toRow(d: Details) {
  const cast = [...(d.credits?.cast ?? [])].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  const director = d.credits?.crew.find((c) => c.job === "Director");
  const hero = cast.find((c) => c.gender === 2);
  const heroine = cast.find((c) => c.gender === 1);
  const year = d.release_date ? Number(d.release_date.slice(0, 4)) : null;
  const aliases = Array.from(
    new Set(
      [d.original_title, ...(d.alternative_titles?.titles ?? []).map((t) => t.title)].filter(
        (t) => t && /^[\x20-\x7E]+$/.test(t) && t !== d.title,
      ),
    ),
  );
  const trivia: string[] = [];
  if (d.tagline) trivia.push(`Tagline: “${d.tagline}”`);
  if (d.original_title && d.original_title !== d.title)
    trivia.push(`Original title: ${d.original_title}`);
  if (d.runtime) trivia.push(`Runtime: ${Math.floor(d.runtime / 60)}h ${d.runtime % 60}m`);
  if (d.vote_count > 20)
    trivia.push(`Rated ${d.vote_average.toFixed(1)}/10 by ${d.vote_count} TMDB members`);
  if (d.budget > 0) trivia.push(`Reported budget: $${(d.budget / 1e6).toFixed(1)}M`);
  if (d.revenue > 0) trivia.push(`Reported box office: $${(d.revenue / 1e6).toFixed(1)}M`);
  const kw = (d.keywords?.keywords ?? []).slice(0, 6).map((k) => k.name);
  if (kw.length) trivia.push(`Themes: ${kw.join(", ")}`);
  const story = d.overview
    ? maskStory(d.overview, [
        d.title,
        d.original_title,
        ...aliases,
        hero?.name ?? "",
        heroine?.name ?? "",
        director?.name ?? "",
      ])
    : "";
  const playable = Boolean(story.length > 40 && d.poster_path && director && hero && heroine);
  return {
    tmdb_id: d.id,
    title: d.title,
    original_title: d.original_title,
    aliases,
    year,
    story,
    overview: d.overview,
    genres: d.genres.map((g) => g.name),
    director: director?.name ?? "",
    hero: hero?.name ?? "",
    heroine: heroine?.name ?? "",
    director_photo: director?.profile_path ?? null,
    hero_photo: hero?.profile_path ?? null,
    heroine_photo: heroine?.profile_path ?? null,
    poster_path: d.poster_path,
    backdrop_path: d.backdrop_path,
    release_date: d.release_date || null,
    popularity: d.popularity,
    vote_count: d.vote_count,
    cast: cast
      .slice(0, 12)
      .map((c) => ({ name: c.name, character: c.character ?? "", profile_path: c.profile_path })),
    trivia,
    playable,
  };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>) {
  const out: R[] = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx] as T);
      }
    }),
  );
  return out;
}

/** Daily refresh: pulls Tamil films released in the last ~90 days (and upcoming), newest first. */
export async function runTmdbRecent(pages = 4) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  let saved = 0;
  let playable = 0;
  for (let page = 1; page <= pages; page++) {
    const list = await tmdb<{ results: { id: number }[]; total_pages: number }>("/discover/movie", {
      with_original_language: "ta",
      "primary_release_date.gte": since,
      sort_by: "primary_release_date.desc",
      include_adult: "false",
      page: String(page),
    });
    const details = await mapLimit(list.results, 8, (m) =>
      tmdb<Details>(`/movie/${m.id}`, {
        append_to_response: "credits,keywords,alternative_titles",
      }).catch(() => null),
    );
    const rows = details.filter((d): d is Details => d !== null).map(toRow);
    if (rows.length) {
      const { error } = await supabaseAdmin.rpc("tmdb_upsert_movies", { p_movies: rows });
      if (error) throw new Error(error.message);
      saved += rows.length;
      playable += rows.filter((r) => r.playable).length;
    }
    if (page >= list.total_pages) break;
  }
  return { saved, playable };
}

/** Processes a bounded slice of TMDB's Tamil catalogue and saves the cursor for the next run. */
export async function runTmdbSync() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: state, error: stErr } = await supabaseAdmin
    .from("tmdb_sync_state")
    .select("*")
    .eq("id", 1)
    .single();
  if (stErr || !state) throw new Error(stErr?.message ?? "sync state missing");
  let { year, page, passes } = state;
  let saved = 0;
  let playable = 0;
  try {
    for (let run = 0; run < PAGES_PER_RUN; run++) {
      const list = await tmdb<{ results: { id: number }[]; total_pages: number }>(
        "/discover/movie",
        {
          with_original_language: "ta",
          primary_release_year: String(year),
          sort_by: "popularity.desc",
          include_adult: "false",
          page: String(page),
        },
      );
      const details = await mapLimit(list.results, 8, (m) =>
        tmdb<Details>(`/movie/${m.id}`, {
          append_to_response: "credits,keywords,alternative_titles",
        }).catch(() => null),
      );
      const rows = details.filter((d): d is Details => d !== null).map(toRow);
      if (rows.length) {
        const { error } = await supabaseAdmin.rpc("tmdb_upsert_movies", { p_movies: rows });
        if (error) throw new Error(error.message);
        saved += rows.length;
        playable += rows.filter((r) => r.playable).length;
      }
      const maxPage = Math.min(list.total_pages, 500);
      if (page < maxPage) page += 1;
      else {
        year -= 1;
        page = 1;
        if (year < FIRST_YEAR) {
          year = new Date().getFullYear();
          passes += 1;
        }
      }
    }
    await supabaseAdmin
      .from("tmdb_sync_state")
      .update({
        year,
        page,
        passes,
        last_run_at: new Date().toISOString(),
        last_error: null,
        processed: state.processed + saved,
      })
      .eq("id", 1);
    return { saved, playable, next: { year, page }, passes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabaseAdmin
      .from("tmdb_sync_state")
      .update({ year, page, last_run_at: new Date().toISOString(), last_error: msg.slice(0, 500) })
      .eq("id", 1);
    throw e;
  }
}
