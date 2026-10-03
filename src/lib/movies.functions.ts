import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type ShowcaseMovie = {
  id: number;
  title: string;
  year: number | null;
  poster_path: string | null;
  wiki_title: string | null;
};
export type CastMember = { name: string; character: string; profile_path: string | null };
export type MovieDetails = {
  id: number;
  tmdb_id: number | null;
  title: string;
  original_title: string | null;
  year: number | null;
  release_date: string | null;
  overview: string | null;
  genres: string[];
  director: string;
  director_photo: string | null;
  hero: string;
  hero_photo: string | null;
  heroine: string;
  heroine_photo: string | null;
  cast: CastMember[];
  trivia: string[];
  poster_path: string | null;
  backdrop_path: string | null;
  wiki_title: string | null;
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const listShowcase = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await publicClient().rpc("movie_showcase", { p_limit: 70 });
  if (error) {
    console.error("showcase failed", error);
    return { movies: [] as ShowcaseMovie[], error: "Posters are unavailable right now." };
  }
  return { movies: (data ?? []) as ShowcaseMovie[], error: null };
});

export const getMovieDetails = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    const { data: movie, error } = await publicClient().rpc("movie_details", { p_id: data.id });
    if (error) {
      console.error("details failed", error);
      return { movie: null, error: "We couldn't load this movie right now. Please try again." };
    }
    return { movie: (movie ?? null) as MovieDetails | null, error: null };
  });
