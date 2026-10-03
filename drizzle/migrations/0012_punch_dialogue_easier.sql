ALTER TABLE public.movies ADD COLUMN IF NOT EXISTS punch_line text;

CREATE OR REPLACE FUNCTION public.clue_rewrite_queue(p_limit int)
RETURNS TABLE(id int, title text, aliases text[], year int, story text, overview text, director text, hero text, heroine text, genres text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, aliases, year, story, overview, director, hero, heroine, genres FROM public.movies
  WHERE playable AND (story_ta IS NULL OR punch_line IS NULL) AND (source = 'curated' OR vote_count >= 15)
  ORDER BY (source = 'curated') DESC, vote_count DESC LIMIT p_limit;
$$;
REVOKE EXECUTE ON FUNCTION public.clue_rewrite_queue(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clue_rewrite_queue(int) TO service_role;

-- Easier: 25s per clue; final (hero) clue also shows the movie's punch dialogue.
CREATE OR REPLACE FUNCTION public.advance_room(p_room uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare r public.rooms; m public.movies; tv text[];
begin
  if not public.is_room_member(p_room) then return; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.status <> 'playing' or r.phase_ends_at is null or clock_timestamp() < r.phase_ends_at then return; end if;
  if r.phase = 'transition' then
    perform public._begin_round(p_room);
    update public.rooms set phase_ends_at = clock_timestamp() + interval '25 seconds' where id = p_room and phase = 'clue';
  elsif r.phase = 'clue' then
    if r.clue < 4 then
      select mv.* into m from public.movies mv join public.room_secrets s on s.movie_id = mv.id where s.room_id = p_room;
      tv := public._safe_trivia(m);
      update public.rooms set clue = r.clue + 1, phase_ends_at = clock_timestamp() + interval '25 seconds',
        clue_data = clue_data || case r.clue + 1
          when 2 then jsonb_strip_nulls(jsonb_build_object('director', m.director, 'director_photo', m.director_photo))
          when 3 then jsonb_strip_nulls(jsonb_build_object('heroine', m.heroine, 'heroine_photo', m.heroine_photo))
          else jsonb_strip_nulls(jsonb_build_object('hero', m.hero, 'hero_photo', m.hero_photo, 'punch', m.punch_line)) end
          || jsonb_build_object('trivia', to_jsonb(coalesce(tv[1:r.clue + 2], '{}'))),
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