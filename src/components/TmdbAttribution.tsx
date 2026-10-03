import { TMDB_LOGO } from "@/lib/tmdb";

export function TmdbAttribution() {
  return (
    <div className="flex items-center justify-center gap-2 text-[10px] text-muted-foreground">
      <img src={TMDB_LOGO} alt="TMDB" className="h-3 w-auto" />
      <span>This product uses the TMDB API but is not endorsed or certified by TMDB.</span>
    </div>
  );
}
