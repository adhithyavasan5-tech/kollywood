import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ============================================================
// ENVIRONMENT
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TMDB_READ_ACCESS_TOKEN = process.env.TMDB_READ_ACCESS_TOKEN;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is missing from .env");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing from .env");
}

if (!TMDB_READ_ACCESS_TOKEN) {
  throw new Error("TMDB_READ_ACCESS_TOKEN is missing from .env");
}

// ============================================================
// SUPABASE CLIENT
// ============================================================

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// ============================================================
// TMDB SEARCH
// ============================================================

async function searchTMDB(title, year) {
  const url = new URL(
    "https://api.themoviedb.org/3/search/movie"
  );

  url.searchParams.set("query", title);
  url.searchParams.set("language", "en-US");
  url.searchParams.set("include_adult", "false");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${TMDB_READ_ACCESS_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `TMDB search failed: HTTP ${response.status} ${body}`
    );
  }

  const data = await response.json();

  if (!data.results || data.results.length === 0) {
    return null;
  }

  // ----------------------------------------------------------
  // Prefer matching release year
  // ----------------------------------------------------------

  if (year) {
    const sameYear = data.results.find((movie) => {
      if (!movie.release_date) {
        return false;
      }

      const releaseYear = Number(
        movie.release_date.substring(0, 4)
      );

      return releaseYear === Number(year);
    });

    if (sameYear) {
      return sameYear;
    }
  }

  // ----------------------------------------------------------
  // Prefer Tamil-language movies
  // ----------------------------------------------------------

  const tamilMovie = data.results.find(
    (movie) => movie.original_language === "ta"
  );

  if (tamilMovie) {
    return tamilMovie;
  }

  return data.results[0];
}

// ============================================================
// GET MOVIES
// ============================================================

async function getMovies() {
  const { data, error } = await supabase
    .from("movies")
    .select("id,title,year,aliases")
    .order("id");

  if (error) {
    throw new Error(
      `Supabase error while reading movies: ${error.message}`
    );
  }

  return data ?? [];
}

// ============================================================
// UPDATE MOVIE
// ============================================================

async function updateMovie(movieId, match) {
  const { error } = await supabase
    .from("movies")
    .update({
      tmdb_id: match.id ?? null,
      poster_path: match.poster_path ?? null,
      backdrop_path: match.backdrop_path ?? null,
      original_title: match.original_title ?? null,
      release_date: match.release_date || null,
      overview: match.overview ?? null,
    })
    .eq("id", movieId);

  if (error) {
    throw new Error(
      `Database update failed: ${error.message}`
    );
  }
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("======================================");
  console.log(" KOLLYWOOD TMDB POPULATION");
  console.log("======================================");
  console.log();

  console.log("Checking Supabase connection...");

  // Simple connection test
  const { error: connectionError } = await supabase
    .from("movies")
    .select("id")
    .limit(1);

  if (connectionError) {
    throw new Error(
      `Supabase connection failed: ${connectionError.message}`
    );
  }

  console.log("✅ Supabase connection successful.");
  console.log();

  const movies = await getMovies();

  if (movies.length === 0) {
    console.log("No movies found in Supabase.");
    return;
  }

  console.log(`Found ${movies.length} movies.`);
  console.log();

  let updated = 0;
  let noPoster = 0;
  let notFound = 0;
  let failed = 0;

  // ==========================================================
  // PROCESS EACH MOVIE
  // ==========================================================

  for (let index = 0; index < movies.length; index++) {
    const movie = movies[index];

    console.log(
      `[${index + 1}/${movies.length}] Searching: ${movie.title}`
    );

    try {
      let match = await searchTMDB(
        movie.title,
        movie.year
      );

      // ------------------------------------------------------
      // Try aliases if title search failed
      // ------------------------------------------------------

      if (!match && Array.isArray(movie.aliases)) {
        for (const alias of movie.aliases) {
          if (!alias) continue;

          console.log(`   Trying alias: ${alias}`);

          match = await searchTMDB(
            alias,
            movie.year
          );

          if (match) {
            break;
          }
        }
      }

      // ------------------------------------------------------
      // No match
      // ------------------------------------------------------

      if (!match) {
        console.log(
          `   ❌ No TMDB match: ${movie.title}`
        );

        notFound++;

        await new Promise((resolve) =>
          setTimeout(resolve, 300)
        );

        continue;
      }

      // ------------------------------------------------------
      // Update Supabase
      // ------------------------------------------------------

      await updateMovie(movie.id, match);

      updated++;

      if (match.poster_path) {
        console.log(
          `   ✅ ${movie.title} → TMDB ${match.id}`
        );

        console.log(
          `   Poster: ${match.poster_path}`
        );
      } else {
        console.log(
          `   ⚠️ ${movie.title} matched, but has NO poster`
        );

        noPoster++;
      }

      console.log();

      // Small delay to avoid hammering TMDB
      await new Promise((resolve) =>
        setTimeout(resolve, 300)
      );
    } catch (error) {
      failed++;

      console.log(
        `   ❌ Failed: ${movie.title}`
      );

      console.log(
        `   ${error.message}`
      );

      console.log();

      // Continue with the next movie
      continue;
    }
  }

  // ==========================================================
  // SUMMARY
  // ==========================================================

  console.log();
  console.log("======================================");
  console.log(" TMDB POPULATION COMPLETE");
  console.log("======================================");
  console.log(`Total movies : ${movies.length}`);
  console.log(`Updated      : ${updated}`);
  console.log(`No poster    : ${noPoster}`);
  console.log(`Not found    : ${notFound}`);
  console.log(`Failed       : ${failed}`);
  console.log("======================================");
}

main().catch((error) => {
  console.error();
  console.error("======================================");
  console.error(" FATAL ERROR");
  console.error("======================================");
  console.error(error.message);
  console.error("======================================");

  process.exit(1);
});