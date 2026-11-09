-- =============================================================================
-- Schednd · Migrazione 0006 · Librerie dei giochi
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede le migrazioni 0001–0005.
--
-- Ogni utente ha la sua libreria (giochi che possiede, con i preferiti).
-- La libreria di un gruppo è l'unione delle librerie dei suoi membri.
-- I giochi possono essere inseriti a mano o importati da BoardGameGeek.
-- =============================================================================

create type public.game_kind as enum ('board', 'rpg', 'card', 'online', 'other');

-- Catalogo condiviso dei giochi.
create table public.games (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (char_length(title) between 1 and 120),
  kind             public.game_kind not null default 'board',
  min_players      smallint check (min_players between 1 and 99),
  max_players      smallint check (max_players between 1 and 99),
  playing_minutes  smallint check (playing_minutes between 1 and 9999),
  year_published   smallint,
  image_url        text check (char_length(image_url) <= 500),
  bgg_id           integer unique,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger games_touch before update on public.games
  for each row execute function public.touch_updated_at();

-- Libreria personale.
create table public.user_games (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game_id      uuid not null references public.games (id) on delete cascade,
  is_favorite  boolean not null default false,
  source       text not null default 'manual' check (source in ('manual', 'bgg')),
  added_at     timestamptz not null default now(),
  primary key (user_id, game_id)
);

create index user_games_game_idx on public.user_games (game_id);

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
alter table public.games enable row level security;
alter table public.user_games enable row level security;

-- Il catalogo è leggibile da tutti gli utenti registrati (sono solo titoli).
create policy games_select on public.games for select to authenticated using (true);

-- Vedo la mia libreria e quella di chi gioca con me.
create policy user_games_select on public.user_games for select to authenticated
  using (user_id = (select auth.uid()) or public.can_see_profile(user_id));
create policy user_games_update on public.user_games for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy user_games_delete on public.user_games for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.games, public.user_games from anon;

-- -----------------------------------------------------------------------------
-- RPC: aggiunge un gioco alla mia libreria inserendolo a mano.
-- Se esiste già un gioco "manuale" con lo stesso titolo creato da me, lo riusa.
-- -----------------------------------------------------------------------------
create or replace function public.add_manual_game(
  p_title            text,
  p_kind             public.game_kind default 'board',
  p_min_players      integer default null,
  p_max_players      integer default null,
  p_playing_minutes  integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_title text := btrim(p_title);
  v_game_id uuid;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;
  if v_title = '' then
    raise exception 'Scrivi il nome del gioco.';
  end if;
  if p_min_players is not null and p_max_players is not null and p_min_players > p_max_players then
    raise exception 'Il numero minimo di giocatori supera il massimo.';
  end if;

  select id into v_game_id from public.games
  where bgg_id is null and created_by = v_user and lower(title) = lower(v_title)
  limit 1;

  if v_game_id is null then
    insert into public.games (title, kind, min_players, max_players, playing_minutes, created_by)
    values (left(v_title, 120), p_kind, p_min_players, p_max_players, p_playing_minutes, v_user)
    returning id into v_game_id;
  end if;

  insert into public.user_games (user_id, game_id, source)
  values (v_user, v_game_id, 'manual')
  on conflict (user_id, game_id) do nothing;

  return v_game_id;
end;
$$;

-- Numero intero da testo, solo se nell'intervallo indicato (altrimenti null).
create or replace function public.int_in_range(p_text text, p_min integer, p_max integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when p_text ~ '^-?[0-9]{1,6}$' and p_text::integer between p_min and p_max then p_text::integer
  end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: sincronizza la mia libreria con la collezione BoardGameGeek.
-- p_games: [{"bgg_id":13,"title":"Catan","min_players":3,"max_players":4,
--            "playing_minutes":120,"year":1995,"image_url":"https://..."}, ...]
-- Aggiunge i giochi nuovi, aggiorna i dati, toglie i giochi importati da BGG
-- che non sono più nella collezione. I preferiti e i giochi manuali restano.
-- -----------------------------------------------------------------------------
create or replace function public.sync_bgg_collection(p_games jsonb)
returns table (added integer, removed integer, total integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_added integer;
  v_removed integer;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;
  if jsonb_typeof(p_games) <> 'array' or jsonb_array_length(p_games) > 3000 then
    raise exception 'Collezione non valida.';
  end if;

  set local client_min_messages = warning;
  drop table if exists pg_temp.bgg_in;
  -- Valori mancanti o fuori scala (es. 0 giocatori su BGG) = "non indicato".
  create temporary table bgg_in on commit drop as
  select distinct on (bgg_id) * from (
    select
      (g ->> 'bgg_id')::integer as bgg_id,
      left(btrim(g ->> 'title'), 120) as title,
      public.int_in_range(g ->> 'min_players', 1, 99)::smallint as min_players,
      public.int_in_range(g ->> 'max_players', 1, 99)::smallint as max_players,
      public.int_in_range(g ->> 'playing_minutes', 1, 9999)::smallint as playing_minutes,
      public.int_in_range(g ->> 'year', -5000, 3000)::smallint as year_published,
      case when g ->> 'image_url' ~ '^https://' then left(g ->> 'image_url', 500) end as image_url
    from jsonb_array_elements(p_games) g
    where (g ->> 'bgg_id') ~ '^[0-9]{1,9}$' and coalesce(btrim(g ->> 'title'), '') <> ''
  ) x;

  insert into public.games (title, kind, min_players, max_players, playing_minutes, year_published, image_url, bgg_id, created_by)
  select title, 'board', min_players, max_players, playing_minutes, year_published, image_url, bgg_id, v_user
  from pg_temp.bgg_in
  on conflict (bgg_id) do update
    -- Un dato mancante non cancella quello già noto.
    set title = excluded.title,
        min_players = coalesce(excluded.min_players, public.games.min_players),
        max_players = coalesce(excluded.max_players, public.games.max_players),
        playing_minutes = coalesce(excluded.playing_minutes, public.games.playing_minutes),
        year_published = coalesce(excluded.year_published, public.games.year_published),
        image_url = coalesce(excluded.image_url, public.games.image_url);

  with ins as (
    insert into public.user_games (user_id, game_id, source)
    select v_user, g.id, 'bgg'
    from pg_temp.bgg_in b join public.games g on g.bgg_id = b.bgg_id
    on conflict (user_id, game_id) do nothing
    returning 1
  )
  select count(*) into v_added from ins;

  with del as (
    delete from public.user_games ug
    using public.games g
    where ug.game_id = g.id and ug.user_id = v_user and ug.source = 'bgg'
      and g.bgg_id not in (select bgg_id from pg_temp.bgg_in)
    returning 1
  )
  select count(*) into v_removed from del;

  return query
  select v_added, v_removed,
         (select count(*)::integer from public.user_games where user_id = v_user);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: libreria di un gruppo (solo membri): giochi dei membri, con chi li
-- possiede, quanti li hanno tra i preferiti e se sono tra i miei.
-- -----------------------------------------------------------------------------
create or replace function public.group_library(p_group_id uuid)
returns table (
  game_id uuid,
  title text,
  kind public.game_kind,
  min_players smallint,
  max_players smallint,
  playing_minutes smallint,
  image_url text,
  bgg_id integer,
  owners text[],
  favorite_count integer,
  my_favorite boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id, g.title, g.kind, g.min_players, g.max_players, g.playing_minutes, g.image_url, g.bgg_id,
    array_agg(distinct p.display_name order by p.display_name),
    count(*) filter (where ug.is_favorite)::integer,
    coalesce(bool_or(ug.is_favorite and ug.user_id = (select auth.uid())), false)
  from public.memberships m
  join public.user_games ug on ug.user_id = m.user_id
  join public.games g on g.id = ug.game_id
  join public.profiles p on p.id = ug.user_id
  where m.group_id = p_group_id and public.is_group_member(p_group_id)
  group by g.id
  order by count(*) filter (where ug.is_favorite) desc, lower(g.title);
$$;

revoke execute on function
  public.add_manual_game(text, public.game_kind, integer, integer, integer),
  public.sync_bgg_collection(jsonb),
  public.group_library(uuid)
from public, anon;

grant execute on function
  public.add_manual_game(text, public.game_kind, integer, integer, integer),
  public.sync_bgg_collection(jsonb),
  public.group_library(uuid)
to authenticated;
