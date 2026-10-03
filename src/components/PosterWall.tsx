import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { listShowcase, type ShowcaseMovie } from "@/lib/movies.functions";
import { tmdbImage } from "@/lib/tmdb";

function Poster({ movie }: { movie: ShowcaseMovie }) {
  const url = tmdbImage(movie.poster_path, "w185");
  return (
    <Link
      to="/movie/$id"
      params={{ id: String(movie.id) }}
      tabIndex={-1}
      aria-label={`${movie.title} details`}
      className="pointer-events-auto relative block aspect-[2/3] w-28 shrink-0 overflow-hidden rounded-md bg-card transition-opacity hover:opacity-100 sm:w-36"
    >
      {url ? (
        <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center p-2 text-center font-display text-xs text-muted-foreground">
          {movie.title}
        </div>
      )}
    </Link>
  );
}

export function PosterWall() {
  // Server returns a random sample of the TMDB pool on every visit.
  const { data } = useQuery({
    queryKey: ["showcase"],
    queryFn: () => listShowcase(),
    staleTime: 60_000,
  });
  const movies = data?.movies ?? [];
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      {movies.length > 0 && (
        <div className="poster-field absolute -inset-x-32 -inset-y-40 grid grid-cols-6 gap-3 opacity-30 sm:grid-cols-8 lg:grid-cols-10">
          {movies.map((m) => (
            <Poster key={m.id} movie={m} />
          ))}
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/70 via-background/55 to-background/85" />
    </div>
  );
}
