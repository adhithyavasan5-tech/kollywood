ALTER TABLE public.movies
  ADD COLUMN tmdb_id integer UNIQUE,
  ADD COLUMN original_title text,
  ADD COLUMN overview text,
  ADD COLUMN poster_path text,
  ADD COLUMN backdrop_path text,
  ADD COLUMN release_date date,
  ADD COLUMN popularity numeric NOT NULL DEFAULT 0,
  ADD COLUMN vote_count integer NOT NULL DEFAULT 0,
  ADD COLUMN director_photo text,
  ADD COLUMN heroine_photo text,
  ADD COLUMN hero_photo text,
  ADD COLUMN cast_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN trivia text[] NOT NULL DEFAULT '{}',
  ADD COLUMN playable boolean NOT NULL DEFAULT true,
  ADD COLUMN source text NOT NULL DEFAULT 'curated',
  ADD COLUMN synced_at timestamptz;

CREATE INDEX movies_playable_idx ON public.movies (playable) WHERE playable;

ALTER TABLE public.room_secrets ADD COLUMN used_tmdb_ids integer[] NOT NULL DEFAULT '{}';

CREATE TABLE public.tmdb_sync_state (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  year integer NOT NULL DEFAULT extract(year from now())::int,
  page integer NOT NULL DEFAULT 1,
  passes integer NOT NULL DEFAULT 0,
  last_run_at timestamptz,
  last_error text,
  processed integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.tmdb_sync_state TO service_role;
ALTER TABLE public.tmdb_sync_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.tmdb_sync_state (id) VALUES (1);

-- Upsert one batch of TMDB movies (service role only). Matches curated rows by title+year to avoid duplicates.
CREATE OR REPLACE FUNCTION public.tmdb_upsert_movies(p_movies jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb; existing int; n int := 0;
BEGIN
  FOR j IN SELECT * FROM jsonb_array_elements(p_movies) LOOP
    SELECT id INTO existing FROM public.movies WHERE tmdb_id = (j->>'tmdb_id')::int;
    IF existing IS NULL THEN
      SELECT id INTO existing FROM public.movies
      WHERE tmdb_id IS NULL AND public._norm(title) = public._norm(j->>'title')
        AND (year IS NULL OR (j->>'year') IS NULL OR abs(year - (j->>'year')::int) <= 1)
      LIMIT 1;
    END IF;
    IF existing IS NULL THEN
      INSERT INTO public.movies (tmdb_id, title, original_title, aliases, year, story, overview, genres, director, heroine, hero,
        poster_path, backdrop_path, release_date, popularity, vote_count, director_photo, heroine_photo, hero_photo,
        cast_json, trivia, playable, source, synced_at)
      VALUES ((j->>'tmdb_id')::int, j->>'title', j->>'original_title',
        ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'aliases','[]'))), (j->>'year')::int,
        coalesce(j->>'story',''), j->>'overview', ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'genres','[]'))),
        coalesce(j->>'director',''), coalesce(j->>'heroine',''), coalesce(j->>'hero',''),
        j->>'poster_path', j->>'backdrop_path', nullif(j->>'release_date','')::date,
        coalesce((j->>'popularity')::numeric,0), coalesce((j->>'vote_count')::int,0),
        j->>'director_photo', j->>'heroine_photo', j->>'hero_photo', coalesce(j->'cast','[]'),
        ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'trivia','[]'))), coalesce((j->>'playable')::boolean,false), 'tmdb', now());
    ELSE
      -- curated rows keep their hand-written clue/answer text; TMDB fills media + details
      UPDATE public.movies SET tmdb_id = (j->>'tmdb_id')::int,
        original_title = j->>'original_title', overview = j->>'overview',
        poster_path = j->>'poster_path', backdrop_path = j->>'backdrop_path',
        release_date = nullif(j->>'release_date','')::date,
        popularity = coalesce((j->>'popularity')::numeric,0), vote_count = coalesce((j->>'vote_count')::int,0),
        director_photo = j->>'director_photo', heroine_photo = j->>'heroine_photo', hero_photo = j->>'hero_photo',
        cast_json = coalesce(j->'cast','[]'), trivia = ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'trivia','[]'))),
        story = CASE WHEN source = 'curated' THEN story ELSE coalesce(j->>'story', story) END,
        aliases = CASE WHEN source = 'curated' THEN aliases ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'aliases','[]'))) END,
        director = CASE WHEN source = 'curated' THEN director ELSE coalesce(j->>'director','') END,
        heroine = CASE WHEN source = 'curated' THEN heroine ELSE coalesce(j->>'heroine','') END,
        hero = CASE WHEN source = 'curated' THEN hero ELSE coalesce(j->>'hero','') END,
        genres = CASE WHEN source = 'curated' THEN genres ELSE ARRAY(SELECT jsonb_array_elements_text(coalesce(j->'genres','[]'))) END,
        playable = CASE WHEN source = 'curated' THEN true ELSE coalesce((j->>'playable')::boolean,false) END,
        synced_at = now()
      WHERE id = existing;
    END IF;
    n := n + 1;
  END LOOP;
  RETURN n;
END; $$;
REVOKE EXECUTE ON FUNCTION public.tmdb_upsert_movies(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tmdb_upsert_movies(jsonb) TO service_role;

-- Round selection: random playable movie, never repeating a TMDB ID (or curated id) within the game.
CREATE OR REPLACE FUNCTION public._begin_round(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.room_secrets; m public.movies;
BEGIN
  SELECT * INTO s FROM public.room_secrets WHERE room_id = p_room FOR UPDATE;
  SELECT * INTO m FROM public.movies
  WHERE playable
    AND NOT (id = ANY(coalesce(s.used_movies,'{}')))
    AND (tmdb_id IS NULL OR NOT (tmdb_id = ANY(coalesce(s.used_tmdb_ids,'{}'))))
  ORDER BY random() LIMIT 1;
  IF m.id IS NULL THEN
    -- pool exhausted: end the show instead of repeating a movie
    UPDATE public.rooms SET status = 'finished', phase = 'final', phase_ends_at = null, updated_at = now() WHERE id = p_room;
    UPDATE public.profiles p SET total_games = p.total_games + 1, total_points = p.total_points + rp.score
      FROM public.room_players rp WHERE rp.room_id = p_room AND rp.user_id = p.id;
    RETURN;
  END IF;
  UPDATE public.room_secrets SET movie_id = m.id, used_movies = array_append(used_movies, m.id),
    used_tmdb_ids = CASE WHEN m.tmdb_id IS NULL THEN used_tmdb_ids ELSE array_append(used_tmdb_ids, m.tmdb_id) END
  WHERE room_id = p_room;
  UPDATE public.rooms SET phase = 'clue', clue = 1, phase_ends_at = clock_timestamp() + interval '20 seconds',
    clue_data = jsonb_build_object('story', m.story, 'genres', to_jsonb(m.genres)),
    answered_players = '{}', answer_player_id = null, reveal = null, updated_at = now()
  WHERE id = p_room;
END; $$;
REVOKE EXECUTE ON FUNCTION public._begin_round(uuid) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.start_game(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare uid uuid := auth.uid(); r public.rooms; n int;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then raise exception 'That room doesn''t exist.'; end if;
  if r.host_id <> uid then raise exception 'Only the host can start the show.'; end if;
  if r.status = 'playing' then raise exception 'The show has already started.'; end if;
  select count(*) into n from public.room_players where room_id = p_room;
  if n < 2 then raise exception 'At least 2 players are needed.'; end if;
  update public.room_players set score = 0 where room_id = p_room;
  update public.room_secrets set movie_id = null, used_movies = '{}', used_tmdb_ids = '{}' where room_id = p_room;
  update public.rooms set status = 'playing', round = 1, phase = 'transition', clue = 0,
    phase_ends_at = clock_timestamp() + interval '3 seconds', answered_players = '{}', answer_player_id = null,
    clue_data = '{}', reveal = null, updated_at = now() where id = p_room;
  perform public._bump(p_room, jsonb_build_object('type','start'));
end; $$;

-- Same flow as before; clues 2-4 now also carry the TMDB profile photo path (person image, not the answer).
CREATE OR REPLACE FUNCTION public.advance_room(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r public.rooms; m public.movies;
begin
  if not public.is_room_member(p_room) then return; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.status <> 'playing' or r.phase_ends_at is null or clock_timestamp() < r.phase_ends_at then return; end if;
  if r.phase = 'transition' then
    perform public._begin_round(p_room);
  elsif r.phase = 'clue' then
    if r.clue < 4 then
      select mv.* into m from public.movies mv join public.room_secrets s on s.movie_id = mv.id where s.room_id = p_room;
      update public.rooms set clue = r.clue + 1, phase_ends_at = clock_timestamp() + interval '20 seconds',
        clue_data = clue_data || case r.clue + 1
          when 2 then jsonb_strip_nulls(jsonb_build_object('director', m.director, 'director_photo', m.director_photo))
          when 3 then jsonb_strip_nulls(jsonb_build_object('heroine', m.heroine, 'heroine_photo', m.heroine_photo))
          else jsonb_strip_nulls(jsonb_build_object('hero', m.hero, 'hero_photo', m.hero_photo)) end,
        updated_at = now()
      where id = p_room;
    else
      perform public._reveal(p_room, 'nobody', null, 'Padam escape aayiduchu!');
    end if;
  elsif r.phase = 'answer' then
    perform public._wrong(p_room, r.answer_player_id, true);
  elsif r.phase = 'open' then
    perform public._reveal(p_room, 'nobody', null, 'Padam escape aayiduchu!');
  elsif r.phase = 'reveal' then
    if r.round >= r.total_rounds then
      update public.rooms set status = 'finished', phase = 'final', phase_ends_at = null, updated_at = now() where id = p_room;
      update public.profiles p set total_games = p.total_games + 1, total_points = p.total_points + rp.score
        from public.room_players rp where rp.room_id = p_room and rp.user_id = p.id;
    else
      update public.rooms set round = r.round + 1, phase = 'transition', clue = 0, clue_data = '{}', reveal = null,
        phase_ends_at = clock_timestamp() + interval '2500 milliseconds', updated_at = now() where id = p_room;
    end if;
  end if;
end; $$;

CREATE OR REPLACE FUNCTION public._reveal(p_room uuid, p_outcome text, p_winner uuid, p_dialogue text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.movies; r public.rooms; wname text;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = p_room;
  SELECT mv.* INTO m FROM public.movies mv JOIN public.room_secrets s ON s.movie_id = mv.id WHERE s.room_id = p_room;
  SELECT username INTO wname FROM public.room_players WHERE room_id = p_room AND user_id = p_winner;
  UPDATE public.rooms SET phase = 'reveal', phase_ends_at = clock_timestamp() + interval '9 seconds', answer_player_id = null,
    reveal = jsonb_build_object('movie_id', m.id, 'tmdb_id', m.tmdb_id, 'poster_path', m.poster_path, 'backdrop_path', m.backdrop_path,
      'title', m.title, 'year', m.year, 'director', m.director, 'heroine', m.heroine,
      'hero', m.hero, 'genres', to_jsonb(m.genres), 'wiki_title', m.wiki_title, 'outcome', p_outcome, 'winner_id', p_winner,
      'winner_name', wname, 'dialogue', p_dialogue, 'clue', r.clue),
    updated_at = now()
  WHERE id = p_room;
END; $$;
REVOKE EXECUTE ON FUNCTION public._reveal(uuid,text,uuid,text) FROM public, anon, authenticated;

-- Public catalogue reads (never linked to any room's current movie).
CREATE OR REPLACE FUNCTION public.movie_showcase(p_limit integer DEFAULT 60)
RETURNS TABLE (id integer, title text, year integer, poster_path text, wiki_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, year, poster_path, wiki_title FROM public.movies
  WHERE playable AND poster_path IS NOT NULL
  ORDER BY random() LIMIT least(greatest(p_limit, 1), 120);
$$;

CREATE OR REPLACE FUNCTION public.movie_details(p_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('id', id, 'tmdb_id', tmdb_id, 'title', title, 'original_title', original_title, 'year', year,
    'release_date', release_date, 'overview', coalesce(overview, story), 'genres', to_jsonb(genres),
    'director', director, 'director_photo', director_photo, 'hero', hero, 'hero_photo', hero_photo,
    'heroine', heroine, 'heroine_photo', heroine_photo, 'cast', cast_json, 'trivia', to_jsonb(trivia),
    'poster_path', poster_path, 'backdrop_path', backdrop_path, 'wiki_title', wiki_title)
  FROM public.movies WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.movie_pool_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('total', count(*), 'playable', count(*) FILTER (WHERE playable)) FROM public.movies;
$$;

GRANT EXECUTE ON FUNCTION public.movie_showcase(integer), public.movie_details(integer), public.movie_pool_stats() TO anon, authenticated;