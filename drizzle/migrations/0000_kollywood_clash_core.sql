create extension if not exists fuzzystrmatch with schema extensions;

-- PROFILES
create table public.profiles (
  id uuid primary key,
  username text not null,
  player_id text not null unique,
  total_games int not null default 0,
  total_points int not null default 0,
  created_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, player_id)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', 'Player'),
          lower(coalesce(new.raw_user_meta_data->>'player_id', new.id::text)));
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_player_id_available(p_player_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.profiles where player_id = lower(trim(p_player_id)));
$$;
grant execute on function public.is_player_id_available(text) to anon, authenticated;

-- MOVIES (private: never readable by clients)
create table public.movies (
  id serial primary key,
  title text not null,
  aliases text[] not null default '{}',
  year int,
  story text not null,
  genres text[] not null default '{}',
  director text not null,
  heroine text not null,
  hero text not null
);
grant all on public.movies to service_role;
alter table public.movies enable row level security;

-- ROOMS
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null,
  max_players int not null check (max_players between 2 and 5),
  status text not null default 'waiting',
  total_rounds int not null default 10,
  round int not null default 0,
  phase text not null default 'lobby',
  clue int not null default 0,
  phase_ends_at timestamptz,
  answer_player_id uuid,
  answered_players uuid[] not null default '{}',
  clue_data jsonb not null default '{}',
  reveal jsonb,
  last_event jsonb,
  event_seq int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.room_secrets (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  movie_id int,
  used_movies int[] not null default '{}'
);
create table public.room_players (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  username text not null,
  score int not null default 0,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
grant select on public.rooms to authenticated;
grant select on public.room_players to authenticated;
grant all on public.rooms, public.room_players, public.room_secrets to service_role;
alter table public.rooms enable row level security;
alter table public.room_players enable row level security;
alter table public.room_secrets enable row level security;

create or replace function public.is_room_member(p_room uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.room_players where room_id = p_room and user_id = auth.uid());
$$;
create policy "members read room" on public.rooms for select to authenticated using (public.is_room_member(id));
create policy "members read players" on public.room_players for select to authenticated using (public.is_room_member(room_id));

alter table public.room_players replica identity full;
alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;

-- HELPERS
create or replace function public.get_server_time()
returns timestamptz language sql stable as $$ select clock_timestamp(); $$;
grant execute on function public.get_server_time() to authenticated;

create or replace function public._norm(s text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(lower(coalesce(s,'')), '[^a-z0-9]', '', 'g'), '\s+', '', 'g');
$$;

create or replace function public._bump(p_room uuid, p_event jsonb)
returns void language sql security definer set search_path = public as $$
  update public.rooms set last_event = p_event, event_seq = event_seq + 1, updated_at = now() where id = p_room;
$$;

create or replace function public._begin_round(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.room_secrets; m public.movies;
begin
  select * into s from public.room_secrets where room_id = p_room;
  select * into m from public.movies where not (id = any(coalesce(s.used_movies,'{}'))) order by random() limit 1;
  if m.id is null then
    update public.room_secrets set used_movies = '{}' where room_id = p_room;
    select * into m from public.movies order by random() limit 1;
  end if;
  update public.room_secrets set movie_id = m.id, used_movies = array_append(used_movies, m.id) where room_id = p_room;
  update public.rooms set phase = 'clue', clue = 1, phase_ends_at = clock_timestamp() + interval '20 seconds',
    clue_data = jsonb_build_object('story', m.story, 'genres', to_jsonb(m.genres)),
    answered_players = '{}', answer_player_id = null, reveal = null, updated_at = now()
  where id = p_room;
end; $$;

create or replace function public._reveal(p_room uuid, p_outcome text, p_winner uuid, p_dialogue text)
returns void language plpgsql security definer set search_path = public as $$
declare m public.movies; r public.rooms; wname text;
begin
  select * into r from public.rooms where id = p_room;
  select mv.* into m from public.movies mv join public.room_secrets s on s.movie_id = mv.id where s.room_id = p_room;
  select username into wname from public.room_players where room_id = p_room and user_id = p_winner;
  update public.rooms set phase = 'reveal', phase_ends_at = clock_timestamp() + interval '7 seconds', answer_player_id = null,
    reveal = jsonb_build_object('title', m.title, 'year', m.year, 'director', m.director, 'heroine', m.heroine,
      'hero', m.hero, 'genres', to_jsonb(m.genres), 'outcome', p_outcome, 'winner_id', p_winner,
      'winner_name', wname, 'dialogue', p_dialogue, 'clue', r.clue),
    updated_at = now()
  where id = p_room;
end; $$;

create or replace function public._wrong(p_room uuid, p_user uuid, p_timeout boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r public.rooms; eligible int; uname text;
begin
  update public.room_players set score = score - 1 where room_id = p_room and user_id = p_user returning username into uname;
  update public.rooms set answered_players = array_append(answered_players, p_user) where id = p_room returning * into r;
  select count(*) into eligible from public.room_players where room_id = p_room and not (user_id = any(r.answered_players));
  perform public._bump(p_room, jsonb_build_object('type','wrong','user_id',p_user,'name',uname,'timeout',p_timeout,
    'text', case when p_timeout then 'Time''s up! Aiyo!' else 'Aiyo! Close... but not this one!' end));
  if eligible > 0 then
    update public.rooms set phase = 'open', answer_player_id = null,
      phase_ends_at = clock_timestamp() + interval '5 seconds', updated_at = now() where id = p_room;
  else
    perform public._reveal(p_room, 'exhausted', null, 'Padam escape aayiduchu!');
  end if;
end; $$;

create or replace function public._gen_code()
returns text language plpgsql as $$
declare chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; c text; i int;
begin
  loop
    c := '';
    for i in 1..5 loop c := c || substr(chars, 1 + floor(random()*length(chars))::int, 1); end loop;
    exit when not exists (select 1 from public.rooms where code = c);
  end loop;
  return c;
end; $$;

revoke execute on function public._norm(text), public._bump(uuid,jsonb), public._begin_round(uuid),
  public._reveal(uuid,text,uuid,text), public._wrong(uuid,uuid,boolean), public._gen_code(),
  public.handle_new_user() from public, anon, authenticated;

-- PUBLIC ACTIONS
create or replace function public.create_room(p_max int)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.profiles; c text; rid uuid;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  if p_max < 2 or p_max > 5 then raise exception 'Choose 2 to 5 players.'; end if;
  select * into p from public.profiles where id = uid;
  c := public._gen_code();
  insert into public.rooms (code, host_id, max_players) values (c, uid, p_max) returning id into rid;
  insert into public.room_secrets (room_id) values (rid);
  insert into public.room_players (room_id, user_id, username) values (rid, uid, coalesce(p.username,'Player'));
  return c;
end; $$;

create or replace function public.join_room(p_code text)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; p public.profiles; n int;
begin
  if uid is null then raise exception 'Please sign in first.'; end if;
  select * into r from public.rooms where code = upper(trim(p_code)) for update;
  if r.id is null then raise exception 'That room doesn''t exist.'; end if;
  if exists (select 1 from public.room_players where room_id = r.id and user_id = uid) then return r.code; end if;
  if r.status <> 'waiting' then raise exception 'The show has already started.'; end if;
  select count(*) into n from public.room_players where room_id = r.id;
  if n >= r.max_players then raise exception 'This show is already full.'; end if;
  select * into p from public.profiles where id = uid;
  insert into public.room_players (room_id, user_id, username) values (r.id, uid, coalesce(p.username,'Player'));
  perform public._bump(r.id, jsonb_build_object('type','joined','name',p.username));
  return r.code;
end; $$;

create or replace function public.leave_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; uname text; n int; newhost uuid;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then return; end if;
  delete from public.room_players where room_id = p_room and user_id = uid returning username into uname;
  select count(*) into n from public.room_players where room_id = p_room;
  if n = 0 then delete from public.rooms where id = p_room; return; end if;
  if r.host_id = uid then
    select user_id into newhost from public.room_players where room_id = p_room order by joined_at limit 1;
    update public.rooms set host_id = newhost where id = p_room;
  end if;
  if r.status = 'playing' and n < 2 then
    update public.rooms set status = 'waiting', phase = 'lobby', phase_ends_at = null, round = 0, clue = 0,
      clue_data = '{}', reveal = null, answer_player_id = null where id = p_room;
  elsif r.status = 'playing' and r.answer_player_id = uid then
    update public.rooms set phase = 'open', answer_player_id = null,
      answered_players = array_append(answered_players, uid),
      phase_ends_at = clock_timestamp() + interval '5 seconds' where id = p_room;
  end if;
  perform public._bump(p_room, jsonb_build_object('type','left','name',uname));
end; $$;

create or replace function public.start_game(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; n int;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null then raise exception 'That room doesn''t exist.'; end if;
  if r.host_id <> uid then raise exception 'Only the host can start the show.'; end if;
  if r.status = 'playing' then raise exception 'The show has already started.'; end if;
  select count(*) into n from public.room_players where room_id = p_room;
  if n < 2 then raise exception 'At least 2 players are needed.'; end if;
  update public.room_players set score = 0 where room_id = p_room;
  update public.room_secrets set movie_id = null, used_movies = '{}' where room_id = p_room;
  update public.rooms set status = 'playing', round = 1, phase = 'transition', clue = 0,
    phase_ends_at = clock_timestamp() + interval '3 seconds', answered_players = '{}', answer_player_id = null,
    clue_data = '{}', reveal = null, updated_at = now() where id = p_room;
  perform public._bump(p_room, jsonb_build_object('type','start'));
end; $$;

create or replace function public.advance_room(p_room uuid)
returns void language plpgsql security definer set search_path = public as $$
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
          when 2 then jsonb_build_object('director', m.director)
          when 3 then jsonb_build_object('heroine', m.heroine)
          else jsonb_build_object('hero', m.hero) end,
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
    phase_ends_at = clock_timestamp() + interval '5 seconds', updated_at = now() where id = p_room;
  perform public._bump(p_room, jsonb_build_object('type','buzz','user_id',uid,'name',uname));
  return true;
end; $$;

create or replace function public.submit_answer(p_room uuid, p_answer text)
returns boolean language plpgsql security definer set search_path = extensions, public as $$
declare uid uuid := auth.uid(); r public.rooms; m public.movies; a text; cand text; ok boolean := false; lim int;
begin
  select * into r from public.rooms where id = p_room for update;
  if r.id is null or r.phase <> 'answer' or r.answer_player_id is distinct from uid then
    raise exception 'It''s not your turn to answer.';
  end if;
  if clock_timestamp() > r.phase_ends_at + interval '1500 milliseconds' then raise exception 'Time''s up!'; end if;
  if coalesce(trim(p_answer),'') = '' then raise exception 'Please enter an answer.'; end if;
  select mv.* into m from public.movies mv join public.room_secrets s on s.movie_id = mv.id where s.room_id = p_room;
  a := public._norm(p_answer);
  foreach cand in array (array[m.title] || m.aliases) loop
    cand := public._norm(cand);
    lim := case when length(cand) >= 9 then 2 when length(cand) >= 5 then 1 else 0 end;
    if a = cand or (length(a) > 0 and levenshtein(a, cand) <= lim) then ok := true; exit; end if;
  end loop;
  if ok then
    update public.room_players set score = score + 1 where room_id = p_room and user_id = uid;
    perform public._reveal(p_room, 'correct', uid, case r.clue when 1 then 'Adra Sakka!' when 2 then 'Semma Mass!'
      when 3 then 'Vera Level!' else 'Mass-ah kandupidichitta!' end);
  else
    perform public._wrong(p_room, uid, false);
  end if;
  return ok;
end; $$;

grant execute on function public.create_room(int), public.join_room(text), public.leave_room(uuid),
  public.start_game(uuid), public.advance_room(uuid), public.buzz(uuid), public.submit_answer(uuid,text),
  public.is_room_member(uuid) to authenticated;
revoke execute on function public.create_room(int), public.join_room(text), public.leave_room(uuid),
  public.start_game(uuid), public.advance_room(uuid), public.buzz(uuid), public.submit_answer(uuid,text) from anon;

-- SEED MOVIES
insert into public.movies (title, aliases, year, story, genres, director, heroine, hero) values
('Ghilli', '{Gilli}', 2004, 'A kabaddi player from Chennai rescues a young woman from a powerful factionist in Madurai and hides her inside his own family home.', '{Action,Sports,Romance}', 'Dharani', 'Trisha', 'Vijay'),
('96', '{"Ninety Six"}', 2018, 'Two school sweethearts meet again at a reunion twenty-two years later and spend one long night revisiting what might have been.', '{Romance,Drama}', 'C. Prem Kumar', 'Trisha', 'Vijay Sethupathi'),
('Ratsasan', '{Raatchasan}', 2018, 'A wannabe filmmaker turned cop hunts a serial killer who preys on young girls.', '{Thriller,Crime}', 'Ram Kumar', 'Amala Paul', 'Vishnu Vishal'),
('Remo', '{}', 2016, 'A struggling actor disguises himself as a woman to win over a doctor who is engaged to someone else.', '{Comedy,Romance}', 'Bakkiyaraj Kannan', 'Keerthy Suresh', 'Sivakarthikeyan'),
('Varuthapadatha Valibar Sangam', '{"Varutha Padatha Valibar Sangam",VVS}', 2013, 'A carefree village youth''s love for a girl sparks a feud with her influential father.', '{Comedy,Romance}', 'Ponram', 'Sri Divya', 'Sivakarthikeyan'),
('Ethir Neechal', '{}', 2013, 'A young man mocked for his odd name finds confidence and love with the help of his childhood friend.', '{Comedy,Romance}', 'R.S. Durai Senthilkumar', 'Priya Anand', 'Sivakarthikeyan'),
('Kadhal Desam', '{"Kaadhal Desam"}', 1996, 'Two best friends fall for the same girl in a college love triangle.', '{Romance,Drama,Musical}', 'Kathir', 'Tabu', 'Abbas'),
('Kaadhal Kottai', '{"Kadhal Kottai"}', 1996, 'Two people fall in love through letters without ever meeting each other.', '{Romance,Drama}', 'Agathiyan', 'Devayani', 'Ajith Kumar'),
('Singam 2', '{"Singam II"}', 2013, 'A fearless cop goes undercover to take down an international arms smuggling mafia.', '{Action,Thriller}', 'Hari', 'Anushka Shetty', 'Suriya'),
('24', '{"Twenty Four"}', 2016, 'A scientist''s invention of a time-travel watch triggers a deadly fight with his twin brother.', '{Sci-Fi,Action,Thriller}', 'Vikram Kumar', 'Samantha', 'Suriya'),
('Nandhaa', '{Nanda}', 2001, 'A young man released from juvenile prison struggles to find acceptance and escape violence.', '{Drama,Action}', 'Bala', 'Laila', 'Suriya'),
('Maattrraan', '{Maatraan}', 2012, 'Conjoined twins with opposite personalities uncover a shocking conspiracy at a food company.', '{Action,Thriller}', 'K.V. Anand', 'Kajal Aggarwal', 'Suriya'),
('Ayan', '{}', 2009, 'A cunning young smuggler works for a city don while a customs officer closes in.', '{Action,Thriller,Comedy}', 'K.V. Anand', 'Tamannaah', 'Suriya'),
('Paiyaa', '{}', 2010, 'A jobless youth offers a girl a lift on a road trip and gets chased by her fiancé''s goons.', '{Action,Romance,Musical}', 'Lingusamy', 'Tamannaah', 'Karthi'),
('Naan Mahaan Alla', '{}', 2010, 'A jobless youth turns avenger after his family is torn apart by a ruthless gang.', '{Action,Thriller}', 'Suseenthiran', 'Kajal Aggarwal', 'Karthi'),
('Theeran Adhigaaram Ondru', '{Theeran}', 2017, 'A police officer tracks a ruthless highway robber gang across states.', '{Action,Crime,Thriller}', 'H. Vinoth', 'Rakul Preet Singh', 'Karthi'),
('Ponniyin Selvan: I', '{"Ponniyin Selvan",PS1}', 2022, 'Rivals plot to seize the Chola throne while a fearless traveller spies across the empire.', '{Historical,Action,Drama}', 'Mani Ratnam', 'Aishwarya Rai Bachchan', 'Vikram'),
('Viswasam', '{Visuvasam}', 2019, 'A village man''s reunion with his estranged wife and daughter exposes the girl to danger.', '{Action,Drama}', 'Siva', 'Nayanthara', 'Ajith Kumar'),
('Mugavari', '{}', 2000, 'A struggling musician chases his dream with the support of the girl who believes in him.', '{Romance,Drama,Musical}', 'V.Z. Durai', 'Jyothika', 'Ajith Kumar'),
('Kadhalukku Mariyadhai', '{"Kaadhalukku Mariyadhai"}', 1997, 'Two lovers from different religions fight their families to stay together.', '{Romance,Drama,Musical}', 'Fazil', 'Shalini', 'Vijay'),
('Poove Unakkaga', '{}', 1996, 'A young man''s love for his neighbour''s sister is tested when family troubles arise.', '{Romance,Drama}', 'Vikraman', 'Sangita', 'Vijay'),
('Varisu', '{Vaarisu}', 2023, 'A businessman''s youngest son returns to hold his family together and take over his father''s empire.', '{Action,Drama}', 'Vamshi Paidipally', 'Rashmika Mandanna', 'Vijay'),
('Beast', '{}', 2022, 'A former spy trapped in a mall during a hostage crisis takes on the terrorists.', '{Action,Thriller,Comedy}', 'Nelson Dilipkumar', 'Pooja Hegde', 'Vijay'),
('Mahanadhi', '{Mahanadi}', 1994, 'A father''s life collapses after he is cheated and jailed, and his children are lost.', '{Drama}', 'Santhana Bharathi', 'Sukanya', 'Kamal Haasan'),
('Virumaandi', '{Virumandi}', 2004, 'A death-row prisoner''s story is told through two conflicting perspectives.', '{Drama,Crime}', 'Kamal Haasan', 'Abhirami', 'Kamal Haasan'),
('Vishwaroopam', '{Viswaroopam}', 2013, 'A dancer''s hidden past as a spy comes to light as he faces a terrorist group.', '{Action,Thriller,Spy}', 'Kamal Haasan', 'Pooja Kumar', 'Kamal Haasan'),
('Mynaa', '{Myna}', 2010, 'A young couple''s love is threatened by the girl''s father and a harsh society.', '{Romance,Drama}', 'Prabhu Solomon', 'Amala Paul', 'Vidharth'),
('Kumki', '{}', 2012, 'A mahout and his elephant protect a tribal village from a rampaging wild elephant.', '{Romance,Drama,Adventure}', 'Prabhu Solomon', 'Lakshmi Menon', 'Vikram Prabhu'),
('Soodhu Kavvum', '{}', 2013, 'A trio of oddball kidnappers sees their plans go hilariously wrong.', '{Comedy,Crime}', 'Nalan Kumarasamy', 'Sanchita Shetty', 'Vijay Sethupathi'),
('Boss Engira Baskaran', '{BEB}', 2010, 'A lazy man becomes a matchmaker for his younger brother and creates comic chaos.', '{Comedy,Romance}', 'M. Rajesh', 'Nayanthara', 'Arya'),
('Irudhi Suttru', '{Saala Khadoos}', 2016, 'A disgraced boxing coach trains a fiery fisherwoman to become a champion.', '{Drama,Sports}', 'Sudha Kongara', 'Ritika Singh', 'R. Madhavan'),
('Meesaya Murukku', '{"Meesai Murukku"}', 2017, 'A passionate youngster dreams of making it big in the music industry while his love life hangs by a thread.', '{Comedy,Romance,Musical}', 'Hiphop Tamizha Adhi', 'Aathmika', 'Hiphop Tamizha Adhi'),
('Natpe Thunai', '{}', 2019, 'A former international hockey player picks up the stick again to save the ground of a local team.', '{Comedy,Sports}', 'Parthiban Desingu', 'Anagha', 'Hiphop Tamizha Adhi'),
('Naan Sirithal', '{}', 2020, 'A man who laughs uncontrollably under stress lands in trouble until he finds a solution.', '{Comedy,Romance}', 'Raana', 'Iswarya Menon', 'Hiphop Tamizha Adhi'),
('Sivakumarin Sabadham', '{}', 2021, 'A young man from a weaving family vows to restore its past glory by taking on a textile magnate.', '{Drama,Comedy}', 'Hiphop Tamizha Adhi', 'Madonna Sebastian', 'Hiphop Tamizha Adhi'),
('Anbarivu', '{}', 2022, 'Twin brothers raised in two different worlds are forced to switch places to reunite their family.', '{Action,Drama}', 'Aswin Raam', 'Kashmira Pardeshi', 'Hiphop Tamizha Adhi'),
('Veeran', '{}', 2023, 'A man struck by lightning in childhood returns to his village to fight evil with the help of local deities.', '{Fantasy,Action,Comedy}', 'ARK Saravan', 'Athira Raj', 'Hiphop Tamizha Adhi'),
('PT Sir', '{"P.T. Sir"}', 2024, 'A physical training teacher inspires his students to chase their dreams while facing challenges at school.', '{Drama,Comedy}', 'Karthik Venugopalan', 'Kashmira Pardeshi', 'Hiphop Tamizha Adhi'),
('Kadaisi Ulaga Por', '{"Kadaisi Ulagaporu"}', 2024, 'In a near-future world war, neutral India sees Tamil Nadu captured from the south.', '{Action,Sci-Fi}', 'Hiphop Tamizha Adhi', 'Natasha Singh', 'Hiphop Tamizha Adhi'),
('Meesaya Murukku 2', '{"Meesai Murukku 2"}', 2026, 'Forty years after his grandfather''s humiliation as a Gana singer, a young man chases his own dream in independent music.', '{Comedy,Romance,Musical}', 'Hiphop Tamizha Adhi', 'Chaithra J', 'Hiphop Tamizha Adhi'),
('Sardar', '{}', 2022, 'A spy known for his many disguises takes on a mafia trying to privatise water.', '{Action,Thriller}', 'P.S. Mithran', 'Raashii Khanna', 'Karthi'),
('Jana Nayagan', '{"Thalapathy 69"}', 2026, 'A fearless, people-loved police officer takes on a powerful villain and inspires boycotting villagers to vote.', '{Action,Drama,Political}', 'H. Vinoth', 'Pooja Hegde', 'Vijay'),
('Karuppu', '{}', 2026, 'A guardian deity takes human form as a lawyer to defeat a corrupt advocate who controls the courts.', '{Action,Fantasy,Drama}', 'RJ Balaji', 'Trisha', 'Suriya'),
('Thalaivar Thambi Thalaimaiyil', '{TTT}', 2026, 'A village panchayat leader must manage chaos when a death happens next door on the eve of a wedding.', '{Comedy,Drama}', 'Nithish Sahadev', 'Prathana Nathan', 'Jiiva'),
('Love Insurance Kompany', '{LIK}', 2026, 'A corporate employee''s expensive romance pushes his finances to the edge in a comic spiral.', '{Comedy,Romance}', 'Vignesh Shivan', 'Krithi Shetty', 'Pradeep Ranganathan'),
('Baasha', '{Basha,Baashha}', 1995, 'A humble auto-rickshaw driver quietly hides a fearsome past in the Bombay underworld.', '{Action,Drama}', 'Suresh Krissna', 'Nagma', 'Rajinikanth'),
('Enthiran', '{Endhiran,Robot}', 2010, 'A scientist builds an advanced humanoid that develops emotions and falls for its creator''s fiancee.', '{"Sci-Fi",Action,Romance}', 'Shankar', 'Aishwarya Rai', 'Rajinikanth'),
('Anniyan', '{Aniyan,Aparichit}', 2005, 'A timid, rule-abiding lawyer with a split personality punishes people who ignore everyday laws.', '{Thriller,Action}', 'Shankar', 'Sadha', 'Vikram'),
('Mankatha', '{Mankaatha}', 2011, 'A suspended cop joins a gang planning to steal a fortune in betting money during a cricket season.', '{Action,Heist,Thriller}', 'Venkat Prabhu', 'Trisha', 'Ajith Kumar'),
('Thuppakki', '{Thupakki}', 2012, 'An army officer on holiday in Mumbai hunts down a network of sleeper cells planning serial blasts.', '{Action,Thriller}', 'A.R. Murugadoss', 'Kajal Aggarwal', 'Vijay'),
('Vinnaithaandi Varuvaayaa', '{VTV,"Vinnaithaandi Varuvaya","Vinnai Thaandi Varuvaayaa"}', 2010, 'An aspiring filmmaker falls for the girl upstairs, who is torn between love and her family''s wishes.', '{Romance,Drama}', 'Gautham Vasudev Menon', 'Trisha', 'Silambarasan'),
('Alaipayuthey', '{Alaipayuthe,Alaipayudhey}', 2000, 'A young couple marries secretly against their families and discovers that life after love is harder than falling in it.', '{Romance,Drama}', 'Mani Ratnam', 'Shalini', 'R. Madhavan'),
('Roja', '{}', 1992, 'A village bride travels to Kashmir with her husband, who is suddenly kidnapped by militants.', '{Romance,Thriller}', 'Mani Ratnam', 'Madhoo', 'Arvind Swamy'),
('Bombay', '{}', 1995, 'An interfaith couple builds a family in a city that is torn apart by riots.', '{Romance,Drama}', 'Mani Ratnam', 'Manisha Koirala', 'Arvind Swamy'),
('Nayakan', '{Nayagan}', 1987, 'A boy from the slums of Bombay rises to become a don who is both feared and loved.', '{Crime,Drama}', 'Mani Ratnam', 'Saranya', 'Kamal Haasan'),
('Sivaji', '{"Sivaji The Boss"}', 2007, 'A software architect returns from America to build free hospitals and colleges, and ends up battling corruption.', '{Action,Drama}', 'Shankar', 'Shriya Saran', 'Rajinikanth'),
('Vaaranam Aayiram', '{"Varanam Aayiram","Varanam Ayiram"}', 2008, 'A soldier looks back on his father''s influence through love, loss and recovery.', '{Drama,Romance}', 'Gautham Vasudev Menon', 'Sameera Reddy', 'Suriya'),
('Ghajini', '{Gajini}', 2005, 'A man with short-term memory loss relies on tattoos and photographs to hunt down his girlfriend''s killer.', '{Thriller,Action,Romance}', 'A.R. Murugadoss', 'Asin', 'Suriya'),
('Singam', '{Singham}', 2010, 'An honest village police officer clashes with a powerful gangster from Chennai.', '{Action,Drama}', 'Hari', 'Anushka Shetty', 'Suriya'),
('Theri', '{}', 2016, 'A bakery owner raising his little daughter in Kerala hides his past as a fearless police officer.', '{Action,Family}', 'Atlee', 'Samantha', 'Vijay'),
('Mersal', '{Mersel}', 2017, 'A mysterious series of crimes targets the medical industry, linked to a family tragedy from years ago.', '{Action,Drama}', 'Atlee', 'Samantha', 'Vijay'),
('Master', '{}', 2021, 'An alcoholic college professor is sent to a juvenile home where a ruthless gangster uses the boys for his crimes.', '{Action,Thriller}', 'Lokesh Kanagaraj', 'Malavika Mohanan', 'Vijay'),
('Vada Chennai', '{Vadachennai}', 2018, 'A gifted carrom player from North Chennai gets pulled into a gang war that spans decades.', '{Crime,Drama}', 'Vetrimaaran', 'Aishwarya Rajesh', 'Dhanush'),
('Asuran', '{}', 2019, 'A quiet farmer goes on the run with his young son after a land feud turns violent.', '{Action,Drama}', 'Vetrimaaran', 'Manju Warrier', 'Dhanush'),
('Soorarai Pottru', '{"Soorarai Potru","Soorarai Pottu"}', 2020, 'A former air force officer sets out to launch a low-cost airline so that ordinary people can fly.', '{Drama,Biography}', 'Sudha Kongara', 'Aparna Balamurali', 'Suriya'),
('Jai Bhim', '{Jaibhim}', 2021, 'A lawyer takes up the fight of a tribal woman whose husband disappears from police custody.', '{Legal,Drama}', 'T.J. Gnanavel', 'Lijomol Jose', 'Suriya'),
('Minnale', '{Minnalae}', 2001, 'A young man pretends to be his college rival to win the girl he fell for at first sight.', '{Romance,Comedy}', 'Gautham Vasudev Menon', 'Reema Sen', 'R. Madhavan'),
('Kaakha Kaakha', '{"Kaaka Kaaka","Kakka Kakka"}', 2003, 'An encounter specialist''s personal life is threatened when a vengeful gangster targets his wife.', '{Action,Thriller,Romance}', 'Gautham Vasudev Menon', 'Jyothika', 'Suriya'),
('Padayappa', '{Padaiyappa}', 1999, 'A man rebuilds his family''s pride while a woman he rejected vows lifelong revenge.', '{Drama,Action}', 'K.S. Ravikumar', 'Soundarya', 'Rajinikanth'),
('Muthu', '{}', 1995, 'A loyal chariot driver of a rich landlord falls for a stage actress and uncovers the truth about his own birth.', '{Comedy,Drama,Romance}', 'K.S. Ravikumar', 'Meena', 'Rajinikanth'),
('Indian', '{}', 1996, 'An elderly freedom fighter turns vigilante to wipe out corruption.', '{Action,Drama}', 'Shankar', 'Manisha Koirala', 'Kamal Haasan'),
('Raja Rani', '{}', 2013, 'A couple stuck in an arranged marriage slowly uncovers each other''s past heartbreaks.', '{Romance,Comedy,Drama}', 'Atlee', 'Nayanthara', 'Arya'),
('Petta', '{Pettai}', 2019, 'A cheerful hostel warden turns out to have a dangerous past connected to a long-standing feud.', '{Action,Drama}', 'Karthik Subbaraj', 'Simran', 'Rajinikanth'),
('Autograph', '{}', 2004, 'A man invites old friends to his wedding and looks back on the three loves that shaped his life.', '{Drama,Romance}', 'Cheran', 'Gopika', 'Cheran'),
('Kushi', '{Khushi}', 2000, 'Two proud, stubborn youngsters fall in love but let their egos keep them apart.', '{Romance,Comedy}', 'S.J. Suryah', 'Jyothika', 'Vijay'),
('Sandakozhi', '{"Sandai Kozhi"}', 2005, 'A village leader''s son steps up to protect his family and the town festival from a bloodthirsty rival.', '{Action,Drama}', 'Lingusamy', 'Meera Jasmine', 'Vishal'),
('Paruthiveeran', '{}', 2007, 'A reckless village rowdy and his devoted cousin share a love that ends in tragedy.', '{Drama,Romance}', 'Ameer', 'Priyamani', 'Karthi'),
('Subramaniapuram', '{}', 2008, 'In 1980s Madurai, jobless friends are pulled into a politician''s violent scheme.', '{Drama,Thriller}', 'M. Sasikumar', 'Swathi Reddy', 'Jai'),
('Pariyerum Perumal', '{}', 2018, 'A law college student from an oppressed caste faces brutal discrimination while befriending a classmate.', '{Drama}', 'Mari Selvaraj', 'Anandhi', 'Kathir'),
('Karnan', '{}', 2021, 'A fearless youth in a neglected village fights an oppressive police force for his people''s dignity.', '{Action,Drama}', 'Mari Selvaraj', 'Rajisha Vijayan', 'Dhanush'),
('Thani Oruvan', '{}', 2015, 'An upright IPS officer takes on a respected scientist who is secretly a criminal mastermind.', '{Action,Thriller}', 'Mohan Raja', 'Nayanthara', 'Jayam Ravi'),
('Aadukalam', '{}', 2011, 'A cockfighting champion''s rivalry with his own mentor turns into betrayal and revenge.', '{Drama,Action}', 'Vetrimaaran', 'Taapsee Pannu', 'Dhanush'),
('Pudhupettai', '{"Pudhu Pettai"}', 2006, 'A boy with a rough childhood slowly rises through the underworld of Chennai.', '{Action,Drama,Crime}', 'Selvaraghavan', 'Sneha', 'Dhanush'),
('7G Rainbow Colony', '{}', 2004, 'A directionless young man''s life changes when a new girl moves into his colony.', '{Romance,Drama}', 'Selvaraghavan', 'Sonia Agarwal', 'Ravi Krishna'),
('Kaadhal', '{}', 2004, 'A mechanic''s romance with a rich girl is crushed by her family''s pride.', '{Romance,Drama}', 'Balaji Sakthivel', 'Sandhya', 'Bharath'),
('Sethu', '{}', 1999, 'A rowdy college student''s love for a shy girl changes him in unexpected and painful ways.', '{Romance,Drama}', 'Bala', 'Abitha', 'Vikram'),
('Pithamagan', '{}', 2003, 'A graveyard-raised loner and a smooth conman form an unlikely friendship that turns violent.', '{Drama,Action}', 'Bala', 'Sangeetha', 'Vikram'),
('Saamy', '{Samy}', 2003, 'A fearless cop takes on the notorious gangster who rules a city''s underworld.', '{Action,Drama}', 'Hari', 'Trisha', 'Vikram'),
('Vettaiyaadu Vilaiyaadu', '{VV}', 2006, 'A tough cop hunts a pair of serial killers who torment women.', '{Action,Thriller,Crime}', 'Gautham Vasudev Menon', 'Jyothika', 'Kamal Haasan'),
('Dasavathaaram', '{Dasavatharam}', 2008, 'A scientist races to stop a deadly bioweapon from falling into the wrong hands.', '{Action,Thriller,Comedy}', 'K.S. Ravikumar', 'Asin', 'Kamal Haasan'),
('Anbe Sivam', '{}', 2003, 'Two opposite strangers stranded on a journey form a bond that changes both of them.', '{Drama,Comedy}', 'Sundar C.', 'Kiran Rathod', 'Kamal Haasan'),
('Thevar Magan', '{"Thevar Magan"}', 1992, 'A city-educated son returns home and is pulled into a bloody village feud.', '{Drama,Action}', 'Bharathan', 'Revathi', 'Kamal Haasan'),
('Mouna Ragam', '{"Mouna Raagam"}', 1986, 'A young bride struggling with an arranged marriage cannot forget her past love.', '{Romance,Drama}', 'Mani Ratnam', 'Revathi', 'Mohan'),
('Thalapathi', '{Thalapathy}', 1991, 'A man abandoned at birth finds loyalty and a brother in a local don.', '{Drama,Action}', 'Mani Ratnam', 'Shobana', 'Rajinikanth'),
('Annamalai', '{}', 1992, 'Two childhood friends become bitter enemies over class and ambition.', '{Action,Drama}', 'Suresh Krissna', 'Khushbu', 'Rajinikanth'),
('Gentleman', '{}', 1993, 'A dutiful man secretly steals from the rich to fund education for the poor.', '{Action,Drama,Thriller}', 'Shankar', 'Madhubala', 'Arjun'),
('Mudhalvan', '{Mudhalavan}', 1999, 'A TV journalist becomes chief minister for a day and shakes up the whole system.', '{Action,Drama,Thriller}', 'Shankar', 'Manisha Koirala', 'Arjun'),
('Nanban', '{}', 2012, 'Two friends search for a college buddy who vanished right after graduation.', '{Comedy,Drama}', 'Shankar', 'Ileana D''Cruz', 'Vijay'),
('Billa', '{}', 2007, 'A look-alike is forced to take the place of a ruthless don in a dangerous underworld game.', '{Action,Thriller}', 'Vishnuvardhan', 'Nayanthara', 'Ajith Kumar'),
('Veeram', '{}', 2014, 'A fearless village man avoids marriage so that nothing can break his bond with his four brothers.', '{Action,Drama,Romance}', 'Siva', 'Tamannaah', 'Ajith Kumar'),
('Vedalam', '{Vedhalam}', 2015, 'A cab driver in Kolkata hides a violent past to protect his sister.', '{Action,Drama}', 'Siva', 'Shruti Haasan', 'Ajith Kumar'),
('Vaali', '{}', 1999, 'A man obsessed with his twin brother''s wife turns dangerously possessive.', '{Thriller,Romance}', 'S.J. Suryah', 'Simran', 'Ajith Kumar'),
('Yennai Arindhaal', '{"Yennai Arindhal"}', 2015, 'A calm police officer takes on a ruthless crime lord while protecting those close to him.', '{Action,Crime,Thriller}', 'Gautham Vasudev Menon', 'Trisha', 'Ajith Kumar'),
('Mudhal Mariyadhai', '{}', 1985, 'A village chief''s late-life friendship with a young woman sparks gossip and heartbreak.', '{Drama,Romance}', 'Bharathiraja', 'Radha', 'Sivaji Ganesan'),
('Kadhalan', '{}', 1994, 'A student''s love for a girl clashes with her father, a corrupt police commissioner.', '{Romance,Action,Musical}', 'Shankar', 'Nagma', 'Prabhu Deva'),
('Maanagaram', '{}', 2017, 'Several strangers'' lives collide in Chennai over one night after a kidnapping.', '{Thriller,Crime}', 'Lokesh Kanagaraj', 'Regina Cassandra', 'Sundeep Kishan'),
('Madras', '{}', 2014, 'A rivalry over a wall in North Chennai drags a young man and his friends into violence.', '{Drama,Action}', 'Pa. Ranjith', 'Catherine Tresa', 'Karthi'),
('Kabali', '{}', 2016, 'A released gangster returns to fight the drug lords who destroyed his family in Malaysia.', '{Action,Drama,Crime}', 'Pa. Ranjith', 'Radhika Apte', 'Rajinikanth'),
('Sarpatta Parambarai', '{Sarpatta}', 2021, 'In 1970s North Chennai, a young man trains to restore his clan''s pride in the boxing ring.', '{Drama,Sports}', 'Pa. Ranjith', 'Dushara Vijayan', 'Arya'),
('Naanum Rowdy Dhaan', '{NRD}', 2015, 'A girl seeking revenge for her parents asks the man who loves her, a wannabe rowdy, for help.', '{Comedy,Romance,Action}', 'Vignesh Shivan', 'Nayanthara', 'Vijay Sethupathi'),
('Pizza', '{}', 2012, 'A pizza delivery boy and his girlfriend get caught in a spooky mystery in a haunted bungalow.', '{Horror,Thriller}', 'Karthik Subbaraj', 'Remya Nambeesan', 'Vijay Sethupathi'),
('Jigarthanda', '{}', 2014, 'An aspiring director follows a ruthless Madurai don to make a gangster film.', '{Action,Comedy,Crime}', 'Karthik Subbaraj', 'Lakshmi Menon', 'Siddharth'),
('Kaththi', '{Kathi}', 2014, 'A convict who looks like an activist takes his place to fight a corporate land grab.', '{Action,Drama}', 'A.R. Murugadoss', 'Samantha', 'Vijay'),
('Sarkar', '{}', 2018, 'A corporate tycoon returns to vote, finds his vote already cast, and ends up in politics.', '{Action,Drama,Political}', 'A.R. Murugadoss', 'Keerthy Suresh', 'Vijay'),
('Bigil', '{Whistle}', 2019, 'A gangster turned football coach leads a women''s team while fighting his past.', '{Action,Drama,Sports}', 'Atlee', 'Nayanthara', 'Vijay'),
('Pokkiri', '{Pokiri}', 2007, 'A street-smart goon in Chennai''s underworld hides a secret mission.', '{Action,Thriller}', 'Prabhu Deva', 'Asin', 'Vijay'),
('Maari', '{}', 2015, 'A pigeon-loving local don''s swagger is challenged by a new police officer.', '{Action,Comedy}', 'Balaji Mohan', 'Kajal Aggarwal', 'Dhanush'),
('Thiruchitrambalam', '{"Thiru Chitrambalam"}', 2022, 'A delivery boy finds comfort and love in his childhood best friend.', '{Romance,Comedy,Drama}', 'Mithran Jawahar', 'Nithya Menen', 'Dhanush'),
('Kaadhal Kondein', '{}', 2003, 'A lonely youngster''s obsessive love for a classmate unsettles his life.', '{Drama,Thriller,Romance}', 'Selvaraghavan', 'Sonia Agarwal', 'Dhanush'),
('OK Kanmani', '{"O Kadhal Kanmani"}', 2015, 'Two young people in Mumbai try a live-in relationship while dodging the question of commitment.', '{Romance,Drama}', 'Mani Ratnam', 'Nithya Menen', 'Dulquer Salmaan'),
('Kannathil Muthamittal', '{"Kannathil Muthamitaal"}', 2002, 'An adopted girl sets out to find her birth mother in war-torn Sri Lanka.', '{Drama}', 'Mani Ratnam', 'Simran', 'R. Madhavan'),
('Michael Madana Kama Rajan', '{MMKR}', 1990, 'Four identical men, separated at birth, collide in a chaotic comedy of kidnap and chase.', '{Comedy}', 'Singeetam Srinivasa Rao', 'Urvashi', 'Kamal Haasan'),
('Apoorva Sagodharargal', '{"Apoorva Sagotharargal"}', 1989, 'A short man takes revenge on the villains who killed his police-officer father, helped by his twin brother.', '{Action,Drama,Comedy}', 'Singeetam Srinivasa Rao', 'Gautami', 'Kamal Haasan'),
('Moondram Pirai', '{"Moondrum Pirai"}', 1982, 'A teacher cares for an amnesiac woman who has regressed to a childlike state.', '{Drama,Romance}', 'Balu Mahendra', 'Sridevi', 'Kamal Haasan'),
('Arunachalam', '{}', 1997, 'A man who inherits a fortune must spend 30 crores in 30 days to claim it.', '{Action,Comedy,Drama}', 'Sundar C.', 'Soundarya', 'Rajinikanth'),
('Chandramukhi', '{Chandramuki}', 2005, 'A psychiatrist is called to a family mansion to treat a daughter-in-law''s strange behaviour.', '{Comedy,Horror,Thriller}', 'P. Vasu', 'Jyothika', 'Rajinikanth'),
('Jailer', '{}', 2023, 'A retired jailer takes on a smuggler gang after his son goes missing.', '{Action,Thriller}', 'Nelson Dilipkumar', 'Ramya Krishnan', 'Rajinikanth'),
('Leo', '{}', 2023, 'A café owner''s peaceful hill-town life is shaken when gangsters mistake him for someone else.', '{Action,Thriller}', 'Lokesh Kanagaraj', 'Trisha', 'Vijay'),
('Amaran', '{}', 2024, 'An army major''s journey of love and sacrifice on Kashmir''s frontlines.', '{Action,Biography,Drama}', 'Rajkumar Periasamy', 'Sai Pallavi', 'Sivakarthikeyan'),
('Doctor', '{}', 2021, 'A military doctor goes on a quest to find his fiancée''s kidnapped niece.', '{Comedy,Crime,Action}', 'Nelson Dilipkumar', 'Priyanka Mohan', 'Sivakarthikeyan'),
('Thunivu', '{Thegimpu}', 2023, 'A masked robber holds a bank hostage, but his real target is a much bigger fraud hidden behind it.', '{Action,Thriller,Heist}', 'H. Vinoth', 'Manju Warrier', 'Ajith Kumar'),
('Valimai', '{}', 2022, 'A cop chases a ruthless biker gang behind a wave of chain-snatching and drug crimes.', '{Action,Crime,Thriller}', 'H. Vinoth', 'Huma Qureshi', 'Ajith Kumar'),
('Nerkonda Paarvai', '{"Nerkonda Parvai"}', 2019, 'A lawyer takes up the case of three women framed after resisting a powerful man''s son.', '{Drama,Legal}', 'H. Vinoth', 'Shraddha Srinath', 'Ajith Kumar'),
('Vivegam', '{Vivekam}', 2017, 'A counter-terror agent thought to be dead returns to stop a global terror plot.', '{Action,Thriller,Spy}', 'Siva', 'Kajal Aggarwal', 'Ajith Kumar'),
('Arrambam', '{Aarambam}', 2013, 'A top agent and a young hacker uncover a deadly conspiracy that threatens the country.', '{Action,Thriller}', 'Vishnuvardhan', 'Nayanthara', 'Ajith Kumar'),
('Dheena', '{}', 2001, 'A small-time Chennai rowdy rises through the underworld while protecting his family and friends.', '{Action,Drama}', 'A.R. Murugadoss', 'Laila', 'Ajith Kumar'),
('Mayakkam Enna', '{}', 2011, 'A wildlife photographer''s bond with his best friend is tested by the woman who comes between them.', '{Drama,Romance}', 'Selvaraghavan', 'Richa Gangopadhyay', 'Dhanush'),
('Polladhavan', '{}', 2007, 'A middle-class man''s beloved bike is stolen, and chasing it pulls him into a dangerous gang''s world.', '{Action,Crime,Drama}', 'Vetrimaaran', 'Divya Spandana', 'Dhanush'),
('Velaiilla Pattadhari', '{VIP,"Velai Illa Pattadhari"}', 2014, 'An unemployed civil engineer takes on a corporate rival who holds him back.', '{Action,Drama,Comedy}', 'Velraj', 'Amala Paul', 'Dhanush'),
('Raayan', '{Rayan}', 2024, 'A cook protects his younger siblings as a gang war erupts in North Chennai.', '{Action,Crime,Drama}', 'Dhanush', 'Dushara Vijayan', 'Dhanush'),
('Captain Miller', '{}', 2024, 'A reluctant soldier in 1930s British India turns rebel to reclaim a temple for his people.', '{Action,Adventure,Period}', 'Arun Matheswaran', 'Priyanka Mohan', 'Dhanush'),
('Vaathi', '{Sir}', 2023, 'A teacher fights to protect free education from a ruthless private coaching industry.', '{Drama,Romance}', 'Venky Atluri', 'Samyuktha', 'Dhanush'),
('Velaikkaran', '{Velaikaran}', 2017, 'A man working at a food company discovers its toxic secrets and fights back.', '{Action,Drama,Thriller}', 'Mohan Raja', 'Nayanthara', 'Sivakarthikeyan'),
('Maaveeran', '{Mahaveerudu}', 2023, 'A timid cartoonist hears a mysterious voice that turns him into a hero in a slum redevelopment fight.', '{Action,Fantasy,Comedy}', 'Madonne Ashwin', 'Aditi Shankar', 'Sivakarthikeyan'),
('Don', '{}', 2022, 'A rebellious college student clashes with his strict father and a stern professor.', '{Comedy,Drama}', 'Cibi Chakaravarthi', 'Priyanka Mohan', 'Sivakarthikeyan'),
('Kanchana', '{Muni 2}', 2011, 'A timid young man''s family house is haunted by a spirit that possesses him and seeks vengeance.', '{Horror,Comedy}', 'Raghava Lawrence', 'Lakshmi Rai', 'Raghava Lawrence'),
('Kolamaavu Kokila', '{Kokila,Coco}', 2018, 'A middle-class girl becomes a drug courier to afford her mother''s treatment and gets tangled up in crime.', '{Comedy,Crime}', 'Nelson Dilipkumar', 'Nayanthara', 'Yogi Babu'),
('Iru Mugan', '{Irumugan}', 2016, 'An agent chases a mad scientist who feeds on a drug that boosts his strength.', '{Action,Sci-Fi,Thriller}', 'Anand Shankar', 'Nayanthara', 'Vikram'),
('Ponniyin Selvan: II', '{PS2,"Ponniyin Selvan 2"}', 2023, 'Conspiracies close in on the Chola throne as a love-hate story reaches its climax.', '{Historical,Action,Drama}', 'Mani Ratnam', 'Aishwarya Rai Bachchan', 'Vikram'),
('Vidaamuyarchi', '{}', 2025, 'A man fights to rescue his wife after she is kidnapped on a road trip.', '{Action,Thriller}', 'Magizh Thirumeni', 'Trisha', 'Ajith Kumar'),
('Good Bad Ugly', '{GBU}', 2025, 'A reformed gangster returns to his old world to protect his son.', '{Action,Comedy}', 'Adhik Ravichandran', 'Trisha', 'Ajith Kumar'),
('Coolie', '{}', 2025, 'A former union man investigates his friend''s death, which is tied to a smuggling syndicate.', '{Action,Thriller}', 'Lokesh Kanagaraj', 'Shruti Haasan', 'Rajinikanth'),
('Retro', '{}', 2025, 'A gangster tries to leave violence behind for love, but his past drags him back.', '{Action,Romance}', 'Karthik Subbaraj', 'Pooja Hegde', 'Suriya'),
('Dragon', '{"Return of the Dragon"}', 2025, 'A backbencher who cheats his way to success faces a moral reckoning.', '{Comedy,Drama}', 'Ashwath Marimuthu', 'Anupama Parameswaran', 'Pradeep Ranganathan'),
('Love Today', '{}', 2022, 'A couple agrees to swap phones for a day to prove their love and gets a nasty shock.', '{Comedy,Romance}', 'Pradeep Ranganathan', 'Ivana', 'Pradeep Ranganathan'),
('Maharaja', '{}', 2024, 'A barber files a complaint about a missing dustbin, and the truth behind it turns out to be shocking.', '{Thriller,Crime,Drama}', 'Nithilan Saminathan', 'Mamta Mohandas', 'Vijay Sethupathi'),
('Vettaiyan', '{}', 2024, 'An encounter specialist faces a moral dilemma after a flawed arrest.', '{Action,Thriller,Drama}', 'T.J. Gnanavel', 'Manju Warrier', 'Rajinikanth'),
('The Greatest of All Time', '{GOAT}', 2024, 'An anti-terror squad member confronts his estranged son, who has a mysterious past.', '{Action,Sci-Fi,Thriller}', 'Venkat Prabhu', 'Sneha', 'Vijay'),
('Viduthalai Part 1', '{Viduthalai}', 2023, 'A rookie cop guards a forest against a rebel leader and begins to question the system.', '{Crime,Drama,Thriller}', 'Vetrimaaran', 'Bhavani Sre', 'Soori'),
('16 Vayathinile', '{"Pathinaaru Vayathinile"}', 1977, 'A naive village girl dreams of a better life while a gentle simpleton adores her and a cruel bully torments both.', '{Drama}', 'Bharathiraja', 'Sridevi', 'Kamal Haasan'),
('Vikram Vedha', '{}', 2017, 'An honest cop hunting a gangster is told stories that blur the line between right and wrong.', '{Crime,Thriller}', 'Pushkar-Gayathri', 'Shraddha Srinath', 'R. Madhavan');