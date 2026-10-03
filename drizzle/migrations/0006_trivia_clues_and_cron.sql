CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Trivia lines safe to show before the reveal: never the original title, never text containing the title or aliases.
CREATE OR REPLACE FUNCTION public._safe_trivia(m public.movies)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(t ORDER BY ord), '{}') FROM (
    SELECT t, ord FROM unnest(m.trivia) WITH ORDINALITY AS u(t, ord)
    WHERE t NOT ILIKE 'Original title%'
      AND position(lower(m.title) IN lower(t)) = 0
      AND NOT EXISTS (SELECT 1 FROM unnest(m.aliases) a WHERE length(a) > 2 AND position(lower(a) IN lower(t)) > 0)
    UNION ALL
    SELECT 'Released in ' || m.year, 1000 WHERE m.year IS NOT NULL
  ) x;
$$;
REVOKE EXECUTE ON FUNCTION public._safe_trivia(public.movies) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public._begin_round(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.room_secrets; m public.movies; tv text[];
BEGIN
  SELECT * INTO s FROM public.room_secrets WHERE room_id = p_room FOR UPDATE;
  SELECT * INTO m FROM public.movies
  WHERE playable
    AND NOT (id = ANY(coalesce(s.used_movies,'{}')))
    AND (tmdb_id IS NULL OR NOT (tmdb_id = ANY(coalesce(s.used_tmdb_ids,'{}'))))
  ORDER BY random() LIMIT 1;
  IF m.id IS NULL THEN
    UPDATE public.rooms SET status = 'finished', phase = 'final', phase_ends_at = null, updated_at = now() WHERE id = p_room;
    UPDATE public.profiles p SET total_games = p.total_games + 1, total_points = p.total_points + rp.score
      FROM public.room_players rp WHERE rp.room_id = p_room AND rp.user_id = p.id;
    RETURN;
  END IF;
  tv := public._safe_trivia(m);
  UPDATE public.room_secrets SET movie_id = m.id, used_movies = array_append(used_movies, m.id),
    used_tmdb_ids = CASE WHEN m.tmdb_id IS NULL THEN used_tmdb_ids ELSE array_append(used_tmdb_ids, m.tmdb_id) END
  WHERE room_id = p_room;
  UPDATE public.rooms SET phase = 'clue', clue = 1, phase_ends_at = clock_timestamp() + interval '20 seconds',
    clue_data = jsonb_build_object('story', m.story, 'genres', to_jsonb(m.genres), 'trivia', to_jsonb(coalesce(tv[1:1], '{}'))),
    answered_players = '{}', answer_player_id = null, reveal = null, updated_at = now()
  WHERE id = p_room;
END; $$;
REVOKE EXECUTE ON FUNCTION public._begin_round(uuid) FROM public, anon, authenticated;

-- Unchanged flow; each clue step also unlocks one more trivia hint.
CREATE OR REPLACE FUNCTION public.advance_room(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r public.rooms; m public.movies; tv text[];
begin
  if not public.is_room_member(p_room) then return; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.status <> 'playing' or r.phase_ends_at is null or clock_timestamp() < r.phase_ends_at then return; end if;
  if r.phase = 'transition' then
    perform public._begin_round(p_room);
  elsif r.phase = 'clue' then
    if r.clue < 4 then
      select mv.* into m from public.movies mv join public.room_secrets s on s.movie_id = mv.id where s.room_id = p_room;
      tv := public._safe_trivia(m);
      update public.rooms set clue = r.clue + 1, phase_ends_at = clock_timestamp() + interval '20 seconds',
        clue_data = clue_data || case r.clue + 1
          when 2 then jsonb_strip_nulls(jsonb_build_object('director', m.director, 'director_photo', m.director_photo))
          when 3 then jsonb_strip_nulls(jsonb_build_object('heroine', m.heroine, 'heroine_photo', m.heroine_photo))
          else jsonb_strip_nulls(jsonb_build_object('hero', m.hero, 'hero_photo', m.hero_photo)) end
          || jsonb_build_object('trivia', to_jsonb(coalesce(tv[1:r.clue + 1], '{}'))),
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