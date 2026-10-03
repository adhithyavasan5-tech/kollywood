ALTER TABLE public.movies ADD COLUMN wiki_title text;

UPDATE public.movies SET wiki_title = CASE title
  WHEN 'Ghilli' THEN 'Ghilli'
  WHEN '96' THEN '96 (film)'
  WHEN 'Baasha' THEN 'Baashha'
  WHEN 'Enthiran' THEN 'Enthiran'
  WHEN 'Anniyan' THEN 'Anniyan'
  WHEN 'Mankatha' THEN 'Mankatha'
  WHEN 'Thuppakki' THEN 'Thuppakki'
  WHEN 'Vinnaithaandi Varuvaayaa' THEN 'Vinnaithaandi Varuvaayaa'
  WHEN 'Alaipayuthey' THEN 'Alai Payuthey'
  WHEN 'Roja' THEN 'Roja (film)'
  WHEN 'Bombay' THEN 'Bombay (film)'
  WHEN 'Nayakan' THEN 'Nayakan'
  WHEN 'Sivaji' THEN 'Sivaji: The Boss'
  WHEN 'Vaaranam Aayiram' THEN 'Vaaranam Aayiram'
  WHEN 'Ghajini' THEN 'Ghajini (2005 film)'
  WHEN 'Singam' THEN 'Singam'
  WHEN 'Theri' THEN 'Theri (film)'
  WHEN 'Mersal' THEN 'Mersal'
  WHEN 'Master' THEN 'Master (2021 film)'
  WHEN 'Vada Chennai' THEN 'Vada Chennai'
  WHEN 'Asuran' THEN 'Asuran (2019 film)'
  WHEN 'Soorarai Pottru' THEN 'Soorarai Pottru'
  WHEN 'Jai Bhim' THEN 'Jai Bhim (film)'
  WHEN 'Minnale' THEN 'Minnale'
  WHEN 'Kaakha Kaakha' THEN 'Kaakha Kaakha'
  WHEN 'Padayappa' THEN 'Padayappa'
  WHEN 'Muthu' THEN 'Muthu (1995 film)'
  WHEN 'Indian' THEN 'Indian (1996 film)'
  WHEN 'Raja Rani' THEN 'Raja Rani (2013 film)'
  WHEN 'Petta' THEN 'Petta (film)'
  WHEN 'Vikram Vedha' THEN 'Vikram Vedha'
  ELSE title
END;

CREATE OR REPLACE FUNCTION public._reveal(p_room uuid, p_outcome text, p_winner uuid, p_dialogue text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m public.movies; r public.rooms; wname text;
BEGIN
  SELECT * INTO r FROM public.rooms WHERE id = p_room;
  SELECT mv.* INTO m FROM public.movies mv JOIN public.room_secrets s ON s.movie_id = mv.id WHERE s.room_id = p_room;
  SELECT username INTO wname FROM public.room_players WHERE room_id = p_room AND user_id = p_winner;
  UPDATE public.rooms SET phase = 'reveal', phase_ends_at = clock_timestamp() + interval '9 seconds', answer_player_id = null,
    reveal = jsonb_build_object('title', m.title, 'year', m.year, 'director', m.director, 'heroine', m.heroine,
      'hero', m.hero, 'genres', to_jsonb(m.genres), 'wiki_title', m.wiki_title, 'outcome', p_outcome, 'winner_id', p_winner,
      'winner_name', wname, 'dialogue', p_dialogue, 'clue', r.clue),
    updated_at = now()
  WHERE id = p_room;
END; $$;

REVOKE EXECUTE ON FUNCTION public._reveal(uuid,text,uuid,text) FROM public, anon, authenticated;