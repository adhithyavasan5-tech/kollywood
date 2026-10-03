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
('Vikram Vedha', '{}', 2017, 'An honest cop hunting a gangster is told stories that blur the line between right and wrong.', '{Crime,Thriller}', 'Pushkar-Gayathri', 'Shraddha Srinath', 'R. Madhavan');