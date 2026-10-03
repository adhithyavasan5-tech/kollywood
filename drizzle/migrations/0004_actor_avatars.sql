ALTER TABLE public.profiles ADD COLUMN avatar text;
ALTER TABLE public.room_players ADD COLUMN avatar text, ADD COLUMN player_id text;

CREATE OR REPLACE FUNCTION public._valid_avatar(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IN ('vijay','ajith','suriya','vikram','dhanush','simbu','sivakarthikeyan','hiphop-adhi') THEN p ELSE NULL END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
begin
  insert into public.profiles (id, username, player_id, avatar)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', 'Player'),
          lower(coalesce(new.raw_user_meta_data->>'player_id', new.id::text)),
          public._valid_avatar(new.raw_user_meta_data->>'avatar'));
  return new;
end; $$;

CREATE OR REPLACE FUNCTION public.set_avatar(p_avatar text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in first.'; END IF;
  IF public._valid_avatar(p_avatar) IS NULL THEN RAISE EXCEPTION 'Please choose one of the actor avatars.'; END IF;
  UPDATE public.profiles SET avatar = p_avatar WHERE id = auth.uid();
  UPDATE public.room_players SET avatar = p_avatar WHERE user_id = auth.uid();
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_avatar(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_avatar(text) TO authenticated;

-- Copy avatar + Player ID onto room rows at join time without touching room RPCs.
CREATE OR REPLACE FUNCTION public._room_player_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT avatar, player_id INTO NEW.avatar, NEW.player_id FROM public.profiles WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public._room_player_profile() FROM public, anon, authenticated;
CREATE TRIGGER room_players_profile BEFORE INSERT ON public.room_players
FOR EACH ROW EXECUTE FUNCTION public._room_player_profile();

UPDATE public.room_players rp SET player_id = p.player_id, avatar = p.avatar FROM public.profiles p WHERE p.id = rp.user_id;