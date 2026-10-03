create or replace function public.buzz(p_room uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; uname text;
begin
  if not public.is_room_member(p_room) then return false; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.status <> 'playing' or r.phase not in ('clue','open') or r.answer_player_id is not null then return false; end if;
  if clock_timestamp() >= r.phase_ends_at then return false; end if;
  if uid = any(r.answered_players) then return false; end if;
  select username into uname from public.room_players where room_id = p_room and user_id = uid;
  update public.rooms set phase = 'answer', answer_player_id = uid,
    phase_ends_at = clock_timestamp() + interval '12 seconds', updated_at = now() where id = p_room;
  perform public._bump(p_room, jsonb_build_object('type','buzz','user_id',uid,'name',uname));
  return true;
end; $$;