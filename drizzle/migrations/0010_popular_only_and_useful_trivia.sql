-- Only genuinely helpful hints: release year, themes, tagline.
CREATE OR REPLACE FUNCTION public._safe_trivia(m public.movies)
RETURNS text[] LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT coalesce(array_agg(t ORDER BY pri, ord), '{}') FROM (
    SELECT t, ord, CASE WHEN t ILIKE 'Themes%' THEN 1 ELSE 2 END AS pri
    FROM unnest(m.trivia) WITH ORDINALITY AS u(t, ord)
    WHERE (t ILIKE 'Themes%' OR t ILIKE 'Tagline%')
      AND position(lower(m.title) IN lower(t)) = 0
      AND NOT EXISTS (SELECT 1 FROM unnest(m.aliases) a WHERE length(a) > 2 AND position(lower(a) IN lower(t)) > 0)
    UNION ALL
    SELECT 'Released in ' || m.year, 0, 0 WHERE m.year IS NOT NULL
  ) x;
$$;
REVOKE EXECUTE ON FUNCTION public._safe_trivia(public.movies) FROM public, anon, authenticated;

-- Stricter familiarity: classics need strong TMDB recognition.
CREATE OR REPLACE FUNCTION public._is_familiar_classic(m public.movies)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT m.source = 'curated' OR m.vote_count >= 40 OR (m.vote_count >= 20 AND public._star_lead(m));
$$;
REVOKE EXECUTE ON FUNCTION public._is_familiar_classic(public.movies) FROM public, anon, authenticated;

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
    ORDER BY -ln(random() + 1e-9) / greatest(public._familiarity(mv), 0.1)
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
    clue_data = jsonb_build_object('story', m.story, 'genres', to_jsonb(m.genres), 'trivia', to_jsonb(coalesce(tv[1:2], '{}'))),
    answered_players = '{}', answer_player_id = null, reveal = null, updated_at = now()
  WHERE id = p_room;
END; $$;
REVOKE EXECUTE ON FUNCTION public._begin_round(uuid) FROM public, anon, authenticated;