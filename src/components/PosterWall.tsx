import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listShowcase, type ShowcaseMovie } from "@/lib/movies.functions";
import { tmdbImage } from "@/lib/tmdb";

function Poster({ movie }: { movie: ShowcaseMovie }) {
  const url = tmdbImage(movie.poster_path, "w342");

  if (!url) return null;

  return (
    <Link
      to="/movie/$id"
      params={{ id: String(movie.id) }}
      tabIndex={-1}
      aria-label={`${movie.title} details`}
      className="relative block aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-md sm:w-36"
    >
      <img
        src={url}
        alt=""
        loading="eager"
        decoding="async"
        className="h-full w-full object-cover"
      />

      <div className="pointer-events-none absolute inset-0 bg-black/20" />
    </Link>
  );
}

export function PosterWall() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["showcase"],
    queryFn: () => listShowcase(),
    staleTime: 60_000,
  });

  const movies = data?.movies ?? [];

  console.log("POSTER WALL MOVIES:", movies.length);
  console.log("POSTER WALL DATA:", data);
  console.log("POSTER WALL ERROR:", error);

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {movies.length > 0 && (
        <div
          className="
            absolute
            -inset-x-32
            -inset-y-40
            grid
            grid-cols-6
            gap-3
            opacity-35
            sm:grid-cols-8
            lg:grid-cols-10
          "
        >
          {movies.map((movie) => (
            <Poster
              key={`${movie.id}-${movie.poster_path}`}
              movie={movie}
            />
          ))}
        </div>
      )}

      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-display text-xs tracking-[0.3em] text-muted-foreground">
            LOADING MOVIES...
          </span>
        </div>
      )}

      <div
        className="
          pointer-events-none
          absolute
          inset-0
          bg-gradient-to-b
          from-background/60
          via-background/45
          to-background/80
        "
      />
    </div>
  );
}