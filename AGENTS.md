<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Architecture rules

- All game logic (timers, buzzer lock, scoring, answer checking, round flow) lives in Postgres security-definer RPCs; clients only call RPCs and read rooms/room_players. Why: server-authoritative play without a long-running server.
- Movie answers live in `movies`/`room_secrets`, which clients can never read. Why: the answer must not reach the browser before reveal.
- Players sign in with Player ID mapped to a synthetic email (src/lib/auth.ts). Why: the brief forbids email-based accounts.
- App-wide motion intensity is device-local and applied through the root motion provider. Why: accessibility preferences should take effect instantly without changing game state.
- Personalized motion guidance uses a public TanStack server function and server-only Lovable AI Gateway helper. Why: the AI key and prompt must never reach the browser.
- The movie pool is synced from TMDB (Tamil, by TMDB ID) through the cron-secret-protected `/api/public/tmdb-sync` route with a server-only token; only rows flagged `playable` enter games. Why: large catalogue without exposing the token.
- Each room tracks used TMDB IDs privately and never repeats a movie within a game; title, TMDB ID and poster reach the browser only inside the reveal payload. Why: no-repeat play and answer secrecy.
- Public catalogue reads (poster wall, movie details) go through security-definer `movie_showcase`/`movie_details` functions that never touch room data. Why: browsing must not leak a room's current movie.
- Actor avatars are a fixed key list validated server-side (`_valid_avatar`, `set_avatar`), and a BEFORE INSERT trigger copies avatar + Player ID onto room_players. Why: room RPCs stay untouched and clients can't write arbitrary profile data.
- A daily database schedule calls /api/public/tmdb-sync with a random token stored only in the private app_private_config table (recent releases + one backfill step). Why: the pool grows automatically without exposing any secret.
- Clues unlock one filtered TMDB trivia line per step (_safe_trivia drops original titles and anything naming the film). Why: varied hints without spoiling the answer.
- Round picks are ~85% modern (2000+) and ~15% familiar pre-2000 classics, weighted by a TMDB-based familiarity score (votes, popularity, star lead) inside _begin_round. Why: recognisable movies that grow automatically with the synced pool.
- Easy English + Tamil first clues (story_easy/story_ta) are pre-written by a server-only AI job (clue-rewrite.server.ts) run via the protected tmdb-sync route and the daily schedule; rounds prefer movies that have them. Why: bilingual easy clues without slowing rounds or exposing answers.
