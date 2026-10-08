import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listShowcase, type ShowcaseMovie } from "@/lib/movies.functions";
import { tmdbImage } from "@/lib/tmdb";

function Poster({ movie }: { movie: ShowcaseMovie }) {
  const url = tmdbImage(movie.poster_path, "w342");

  return (
    <Link
      to="/movie/$id"
      params={{ id: String(movie.id) }}
      tabIndex={-1}
      aria-label={`${movie.title} details`}
      className="relative block aspect-[2/3] w-32 shrink-0 overflow-hidden rounded-lg bg-slate-900 sm:w-40 md:w-44 lg:w-48"
    >
      {url ? (
        <img
          src={url}
          alt={movie.title}
          loading="eager"
          decoding="async"
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";

            const fallback = e.currentTarget.parentElement?.querySelector(
              ".poster-fallback"
            ) as HTMLElement | null;

            if (fallback) {
              fallback.style.display = "flex";
            }
          }}
        />
      ) : null}

      {/* Movie name shown when poster is missing or fails */}
      <div
        className="poster-fallback absolute inset-0 items-center justify-center bg-slate-900 p-3 text-center"
        style={{ display: url ? "none" : "flex" }}
      >
        <span className="font-display text-sm font-bold uppercase tracking-wider text-white sm:text-base">
          {movie.title}
        </span>
      </div>

      <div className="pointer-events-none absolute inset-0 bg-black/25" />
    </Link>
  );
}
export function PosterWall() {
  const { data, isLoading } = useQuery({
    queryKey: ["showcase"],
    queryFn: () => listShowcase(),
    staleTime: 60_000,
  });

  const movies = data?.movies ?? [];

  return (
    <div className="pointer-events-none fixed inset-0 z-0 h-screen w-screen overflow-hidden">
      {movies.length > 0 && (
        <div className="absolute inset-0 flex h-full w-full flex-col justify-center gap-4 overflow-hidden">

          {/* ROW 1 */}
          <div className="poster-scroll flex w-max gap-4">
            {[...movies, ...movies].map((movie, index) => (
              <Poster
                key={`row1-${movie.id}-${index}`}
                movie={movie}
              />
            ))}
          </div>

          {/* ROW 2 */}
          <div className="poster-scroll-reverse flex w-max gap-4">
            {[...movies, ...movies].map((movie, index) => (
              <Poster
                key={`row2-${movie.id}-${index}`}
                movie={movie}
              />
            ))}
          </div>

          {/* ROW 3 */}
          <div className="poster-scroll flex w-max gap-4">
            {[...movies, ...movies].map((movie, index) => (
              <Poster
                key={`row3-${movie.id}-${index}`}
                movie={movie}
              />
            ))}
          </div>

          {/* ROW 4 */}
          <div className="poster-scroll-reverse flex w-max gap-4">
            {[...movies, ...movies].map((movie, index) => (
              <Poster
                key={`row4-${movie.id}-${index}`}
                movie={movie}
              />
            ))}
          </div>

          {/* DARK OVERLAY */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/65 via-background/45 to-background/75" />
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-xs tracking-[0.3em] text-muted-foreground">
            LOADING MOVIES...
          </span>
        </div>
      )}
    </div>
  );
}