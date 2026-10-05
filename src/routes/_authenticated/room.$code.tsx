
function RevealCard({ reveal, meId }: { reveal: Reveal; meId: string }) {
  const won = reveal.outcome === "correct";

  /*
   * Wiki poster fallback.
   * Used when poster_path is missing or the TMDB poster fails.
   */
  const wikiPoster = useMoviePoster(
    reveal.poster_path ? undefined : (reveal.wiki_title ?? reveal.title),
  );

  /*
   * Convert the database poster_path into a complete TMDB URL.
   *
   * Supports:
   *   /abc.jpg
   *   abc.jpg
   *   https://image.tmdb.org/t/p/w500/abc.jpg
   *   https://media.themoviedb.org/t/p/w188_and_h282_face/abc.jpg
   */
  function getPosterUrl(path?: string | null) {
    if (!path) return null;

    const value = path.trim();

    if (!value) return null;

    /*
     * Already a complete URL.
     */
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value;
    }

    /*
     * If only the TMDB file path is stored:
     * /abc.jpg
     * abc.jpg
     */
    const cleanPath = value.startsWith("/") ? value : `/${value}`;

    return `https://image.tmdb.org/t/p/w500${cleanPath}`;
  }

  const tmdbPoster = getPosterUrl(reveal.poster_path);

  /*
   * Prefer TMDB poster.
   * If there is no TMDB poster, use Wiki fallback.
   */
  const poster = tmdbPoster ?? wikiPoster ?? null;

  return (
    <div className="space-y-5 text-center">
      {won && <Confetti />}

      {/* RESULT TITLE */}
      <div>
        <p
          className={`slam font-display text-3xl font-black sm:text-5xl ${
            won ? "text-shimmer" : "text-foreground"
          }`}
        >
          {won
            ? reveal.dialogue
            : reveal.outcome === "nobody"
              ? "TIME'S UP!"
              : "NOBODY GOT IT!"}
        </p>

        <p
          className="rise-in mt-2 text-muted-foreground"
          style={{ animationDelay: "0.3s" }}
        >
          {won ? (
            <>
              <span className="text-foreground">
                {reveal.winner_id === meId ? "You" : reveal.winner_name}
              </span>{" "}
              found it on clue {reveal.clue} ·{" "}
              <span className="font-mono text-success">+1</span>
            </>
          ) : (
            <>
              {reveal.dialogue} ·{" "}
              <span className="font-mono">+0</span>
            </>
          )}
        </p>
      </div>

      {/* ANSWER CARD */}
      <div
        className="panel light-sweep rise-in mx-auto max-w-3xl overflow-hidden"
        style={{ animationDelay: "0.5s" }}
      >
        <div className="grid sm:grid-cols-[minmax(220px,0.8fr)_1.2fr]">

          {/* ================= POSTER ================= */}
          <div className="relative aspect-[2/3] min-h-[360px] overflow-hidden bg-muted">

            {poster ? (
              <img
                src={poster}
                alt={`${reveal.title} movie poster`}
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
                onError={(event) => {
                  const img = event.currentTarget;

                  /*
                   * TMDB poster failed.
                   * Try Wiki poster if available.
                   */
                  if (wikiPoster && img.src !== wikiPoster) {
                    img.src = wikiPoster;
                    return;
                  }

                  /*
                   * Both posters failed.
                   * Hide broken image.
                   */
                  img.style.display = "none";

                  /*
                   * Show the fallback container.
                   */
                  const fallback = img.parentElement?.querySelector(
                    "[data-poster-fallback]",
                  ) as HTMLElement | null;

                  if (fallback) {
                    fallback.style.display = "grid";
                  }
                }}
              />
            ) : null}

            {/* ================= POSTER FALLBACK ================= */}
            <div
              data-poster-fallback
              className={`absolute inset-0 place-items-center bg-gradient-to-b from-secondary via-card to-background p-6 text-center ${
                poster ? "hidden" : "grid"
              }`}
            >
              <div>
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.25em] text-accent">
                  Movie
                </p>

                <h2 className="font-display text-4xl font-black text-primary">
                  {reveal.title}
                </h2>

                <p className="mt-3 text-sm text-muted-foreground">
                  Poster unavailable
                </p>
              </div>
            </div>

            {/* FILM STRIPS */}
            <div className="film-strip absolute inset-x-0 top-0" />
            <div className="film-strip absolute inset-x-0 bottom-0" />
          </div>

          {/* ================= MOVIE DETAILS ================= */}
          <div className="flex flex-col justify-center p-6 text-left sm:p-8">

            <p className="font-display text-xs font-bold uppercase text-accent">
              The answer is
            </p>

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

            {/* RELEASE + DIRECTOR */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Released
                </p>

                <p className="font-mono text-2xl font-bold text-primary">
                  {reveal.year ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Directed by
                </p>

                <p className="font-display text-lg font-bold leading-tight">
                  {reveal.director}
                </p>
              </div>
            </div>

            {/* CAST */}
            <p className="mt-4 text-sm text-muted-foreground">
              Starring
            </p>

            <p className="font-semibold">
              {reveal.hero} & {reveal.heroine}
            </p>

            {/* MOVIE DETAILS */}
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