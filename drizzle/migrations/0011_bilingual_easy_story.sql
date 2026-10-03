ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS story_easy text, ADD COLUMN IF NOT EXISTS story_ta text;

CREATE OR REPLACE FUNCTION public.clue_rewrite_queue(p_limit int)
RETURNS TABLE(id int, title text, aliases text[], year int, story text, overview text, director text, hero text, heroine text, genres text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, aliases, year, story, overview, director, hero, heroine, genres FROM public.movies
  WHERE playable AND story_ta IS NULL AND (source = 'curated' OR vote_count >= 15)
  ORDER BY (source = 'curated') DESC, vote_count DESC LIMIT p_limit;
$$;
REVOKE EXECUTE ON FUNCTION public.clue_rewrite_queue(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clue_rewrite_queue(int) TO service_role;

CREATE OR REPLACE FUNCTION public._begin_round(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.room_secrets; m public.movies; tv text[]; tier int; classic_first boolean := random() < 0.15; pool int;
BEGIN
  SELECT * INTO s FROM public.room_secrets WHERE room_id = p_room FOR UPDATE;
  FOR tier IN 1..4 LOOP
    pool := CASE WHEN tier = 1 THEN (CASE WHEN classic_first THEN 2 ELSE 1 END)
                 WHEN tier = 2 THEN (CASE WHEN classic_first THEN 1 ELSE 2 END)
                 ELSE tier END;
    SELECT mv.* INTO m FROM public.movies mv
    WHERE mv.playable
      AND NOT (mv.id = ANY(coalesce(s.used_movies,'{}')))
      AND (mv.tmdb_id IS NULL OR NOT (mv.tmdb_id = ANY(coalesce(s.used_tmdb_ids,'{}'))))
      AND CASE pool
        WHEN 1 THEN coalesce(mv.year,0) >= 2000 AND (mv.source = 'curated' OR mv.vote_count >= 30)
        WHEN 2 THEN coalesce(mv.year,9999) < 2000 AND public._is_familiar_classic(mv)
        WHEN 3 THEN mv.source = 'curated' OR mv.vote_count >= 15
        ELSE true END
    ORDER BY (mv.story_ta IS NOT NULL) DESC, -ln(random() + 1e-9) / greatest(public._familiarity(mv), 0.1)
    LIMIT 1;
    EXIT WHEN m.id IS NOT NULL;
  END LOOP;
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
    clue_data = jsonb_strip_nulls(jsonb_build_object('story', coalesce(m.story_easy, m.story), 'story_ta', m.story_ta,
      'genres', to_jsonb(m.genres), 'trivia', to_jsonb(coalesce(tv[1:2], '{}')))),
    answered_players = '{}', answer_player_id = null, reveal = null, updated_at = now()
  WHERE id = p_room;
END; $$;
REVOKE EXECUTE ON FUNCTION public._begin_round(uuid) FROM public, anon, authenticated;