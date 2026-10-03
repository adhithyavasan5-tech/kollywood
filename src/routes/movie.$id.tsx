import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { getMovieDetails } from "@/lib/movies.functions";
import { tmdbImage } from "@/lib/tmdb";
import { useMoviePoster } from "@/lib/posters";
import { Avatar, Backdrop, Logo } from "@/components/Backdrop";
import { TmdbAttribution } from "@/components/TmdbAttribution";

const detailsQuery = (id: number) =>
  queryOptions({
    queryKey: ["movie", id],
    queryFn: () => getMovieDetails({ data: { id } }),
  });

export const Route = createFileRoute("/movie/$id")({
  loader: async ({ params, context }) => {
    const id = Number(params.id);
    if (!Number.isInteger(id) || id <= 0) throw notFound();
    const res = await context.queryClient.ensureQueryData(detailsQuery(id));
    if (!res.error && !res.movie) throw notFound();
    return {
      title: res.movie?.title ?? "Movie",
      year: res.movie?.year ?? null,
      overview: res.movie?.overview ?? "",
      poster: tmdbImage(res.movie?.poster_path, "w500"),
    };
  },
  head: ({ loaderData }) => {
    const title = `${loaderData?.title ?? "Movie"}${loaderData?.year ? ` (${loaderData.year})` : ""} — Kollywood Clash`;
    const desc = (
      loaderData?.overview || "Cast, director, release year and trivia for this Tamil film."
    ).slice(0, 155);
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "video.movie" },
        { name: "twitter:card", content: "summary_large_image" },
        ...(loaderData?.poster
          ? [
              { property: "og:image", content: loaderData.poster },
              { name: "twitter:image", content: loaderData.poster },
            ]
          : []),
      ],
    };
  },
  component: MoviePage,
  pendingComponent: () => (
    <main className="relative isolate grid min-h-[100svh] place-items-center">
      <Backdrop />
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="mt-4 font-display tracking-[0.4em] text-muted-foreground">LOADING THE REEL</p>
      </div>
    </main>
  ),
  errorComponent: MovieError,
  notFoundComponent: () => <Message text="We couldn't find that movie." />,
});

function MovieError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <Message
      text="This movie didn't load."
      action={
        <button
          className="btn-gold"
          onClick={() => {
            router.invalidate();
            reset();
          }}
        >
          Try again
        </button>
      }
    />
  );
}

function Message({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <main className="relative isolate grid min-h-[100svh] place-items-center px-4 text-center">
      <Backdrop />
      <div className="panel max-w-sm space-y-4 p-8">
        <p className="font-display text-xl text-primary">{text}</p>
        {action}
        <Link to="/home" className="btn-outline-gold w-full">
          Back to lobby
        </Link>
      </div>
    </main>
  );
}

function MoviePage() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(detailsQuery(Number(id)));
  const router = useRouter();
  const wikiPoster = useMoviePoster(
    data.movie && !data.movie.poster_path ? (data.movie.wiki_title ?? data.movie.title) : undefined,
  );
  if (data.error || !data.movie) {
    return (
      <Message
        text={data.error ?? "We couldn't find that movie."}
        action={
          <button className="btn-gold" onClick={() => router.invalidate()}>
            Try again
          </button>
        }
      />
    );
  }
  const m = data.movie;
  const poster = tmdbImage(m.poster_path, "w500") ?? wikiPoster;
  const backdrop = tmdbImage(m.backdrop_path, "w1280");
  const crew = [
    { role: "Director", name: m.director, photo: m.director_photo },
    { role: "Hero", name: m.hero, photo: m.hero_photo },
    { role: "Heroine", name: m.heroine, photo: m.heroine_photo },
  ].filter((p) => p.name);

  return (
    <main className="relative isolate min-h-[100svh] pb-16">
      <Backdrop />
      {backdrop && (
        <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh] overflow-hidden">
          <img src={backdrop} alt="" className="h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
        </div>
      )}
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-5 sm:px-8">
        <Logo size="sm" />
        <Link
          to="/home"
          className="touch-control min-h-11 px-2 text-xs uppercase text-muted-foreground hover:text-primary"
        >
          ← Lobby
        </Link>
      </header>

      <section className="mx-auto mt-8 grid max-w-5xl gap-8 px-4 sm:px-8 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="rise-in mx-auto w-48 self-start overflow-hidden rounded-lg border border-primary/30 bg-card shadow-[var(--shadow-gold)] md:w-full">
          {poster ? (
            <img
              src={poster}
              alt={`${m.title} poster`}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="grid aspect-[2/3] place-items-center p-4 text-center font-display text-2xl text-primary">
              {m.title}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="fade-slide font-display text-xs font-bold uppercase text-accent">
            Tamil cinema
          </p>
          <h1 className="rise-in mt-2 font-display text-4xl font-extrabold leading-tight sm:text-6xl">
            {m.title}
          </h1>
          <p className="mt-2 font-mono text-sm text-muted-foreground">
            {m.release_date ?? m.year ?? "Year unknown"}
            {m.original_title && m.original_title !== m.title ? ` · ${m.original_title}` : ""}
          </p>
          {m.genres.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {m.genres.map((g) => (
                <span
                  key={g}
                  className="rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-display text-[10px] font-bold uppercase text-primary"
                >
                  {g}
                </span>
              ))}
            </div>
          )}
          {m.overview && (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-foreground/85 sm:text-lg">
              {m.overview}
            </p>
          )}

          <div className="mt-8 grid grid-cols-3 gap-3 sm:max-w-lg">
            {crew.map((p) => (
              <PersonTile key={p.role} {...p} />
            ))}
          </div>
        </div>
      </section>

      {m.cast.length > 0 && (
        <section className="mx-auto mt-12 max-w-5xl px-4 sm:px-8">
          <h2 className="font-display text-sm font-bold uppercase tracking-[0.3em] text-muted-foreground">
            Cast
          </h2>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {m.cast.map((c) => (
              <li key={c.name + c.character} className="panel card-lift overflow-hidden">
                {c.profile_path ? (
                  <img
                    src={tmdbImage(c.profile_path, "w185")!}
                    alt={c.name}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover object-top"
                  />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center bg-muted">
                    <Avatar name={c.name} size={48} />
                  </div>
                )}
                <div className="p-2">
                  <p className="truncate text-xs font-semibold">{c.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">{c.character}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto mt-12 max-w-5xl px-4 sm:px-8">
        <h2 className="font-display text-sm font-bold uppercase tracking-[0.3em] text-muted-foreground">
          Trivia
        </h2>
        {m.trivia.length > 0 ? (
          <ul className="panel mt-4 space-y-2 p-5">
            {m.trivia.map((t) => (
              <li key={t} className="border-l-2 border-primary/60 pl-3 text-sm text-foreground/85">
                {t}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">No trivia for this film yet.</p>
        )}
      </section>

      <footer className="mx-auto mt-14 max-w-5xl px-4">
        <TmdbAttribution />
      </footer>
    </main>
  );
}

function PersonTile({ role, name, photo }: { role: string; name: string; photo: string | null }) {
  const url = tmdbImage(photo, "w185");
  return (
    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-primary/30">
      {url ? (
        <img
          src={url}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-secondary/60 to-card">
          <Avatar name={name} size={52} />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent p-2 pt-8 text-center">
        <p className="text-[9px] uppercase tracking-[0.25em] text-primary">{role}</p>
        <p className="font-display text-xs font-bold leading-tight sm:text-sm">{name}</p>
      </div>
    </div>
  );
}
