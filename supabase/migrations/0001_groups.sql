-- =============================================================================
-- Schednd · Migrazione 0001 · Profili, gruppi, ricorrenze, membri
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tipi
-- -----------------------------------------------------------------------------
create type public.group_mode as enum ('in_person', 'online', 'hybrid');
create type public.approval_rule as enum ('majority', 'unanimous_attendees', 'owner_decides');
create type public.group_status as enum ('active', 'paused', 'archived');
create type public.member_role as enum ('owner', 'member');

-- -----------------------------------------------------------------------------
-- Profili (uno per utente, creato automaticamente alla registrazione)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 50),
  avatar_url    text,
  timezone      text not null default 'Europe/Rome',
  locale        text not null default 'it',
  bgg_username  text check (char_length(bgg_username) <= 50),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := left(coalesce(nullif(split_part(new.email, '@', 1), ''), 'Giocatore'), 50);
  insert into public.profiles (id, display_name) values (new.id, v_name)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profili per gli utenti già registrati prima di questa migrazione.
insert into public.profiles (id, display_name)
select u.id, left(coalesce(nullif(split_part(u.email, '@', 1), ''), 'Giocatore'), 50)
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Gruppi
-- -----------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns text
language sql
volatile
set search_path = ''
as $$
  select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
$$;

create table public.groups (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 80),
  description         text check (char_length(description) <= 1000),
  mode                public.group_mode not null default 'in_person',
  default_location    text check (char_length(default_location) <= 200),
  online_link         text check (char_length(online_link) <= 500),
  timezone            text not null default 'Europe/Rome',
  duration_minutes    integer not null default 180 check (duration_minutes between 15 and 1440),
  default_game_title  text check (char_length(default_game_title) <= 120),
  min_attendees       integer check (min_attendees between 1 and 100),
  approval_rule       public.approval_rule not null default 'majority',
  status              public.group_status not null default 'active',
  invite_code         text not null unique default public.generate_invite_code(),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Ricorrenze: "ogni N settimane, a partire da anchor_date, alle start_time".
-- Il cambio fisso del giorno chiude la ricorrenza attuale (valid_until,
-- esclusivo) e ne apre una nuova: lo storico resta.
-- -----------------------------------------------------------------------------
create table public.group_schedules (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups (id) on delete cascade,
  anchor_date     date not null,
  weekday         smallint generated always as (extract(isodow from anchor_date)::smallint) stored,
  interval_weeks  smallint not null check (interval_weeks between 1 and 12),
  start_time      time not null,
  valid_until     date,
  created_at      timestamptz not null default now(),
  check (valid_until is null or valid_until > anchor_date)
);

create unique index group_schedules_one_current
  on public.group_schedules (group_id) where valid_until is null;

-- -----------------------------------------------------------------------------
-- Membri
-- -----------------------------------------------------------------------------
create table public.memberships (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.member_role not null default 'member',
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);

create unique index memberships_one_owner
  on public.memberships (group_id) where role = 'owner';
create index memberships_user_idx on public.memberships (user_id);

-- -----------------------------------------------------------------------------
-- updated_at automatico
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Funzioni di supporto per i permessi
-- -----------------------------------------------------------------------------
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where group_id = p_group_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where group_id = p_group_id and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

create or replace function public.shares_group_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_schedules enable row level security;
alter table public.memberships enable row level security;

-- Profili: vedo il mio e quelli di chi è in un gruppo con me; modifico solo il mio.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Gruppi: li vedono i membri; li modifica/elimina l'owner. Si creano con create_group().
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_owner(id)) with check (public.is_group_owner(id));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_owner(id));

-- Ricorrenze: le vedono i membri; si modificano con change_schedule().
create policy group_schedules_select on public.group_schedules for select to authenticated
  using (public.is_group_member(group_id));

-- Membri: li vedono i membri del gruppo. Un membro può uscire; l'owner può
-- rimuovere i membri. Ingresso e cambio owner passano dalle funzioni.
create policy memberships_select on public.memberships for select to authenticated
  using (public.is_group_member(group_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (
    role = 'member'
    and (user_id = (select auth.uid()) or public.is_group_owner(group_id))
  );

-- Gli utenti non autenticati non leggono nulla.
revoke all on public.profiles, public.groups, public.group_schedules, public.memberships from anon;

-- -----------------------------------------------------------------------------
-- Funzioni chiamabili dall'app (RPC)
-- -----------------------------------------------------------------------------

-- Crea un gruppo con la sua ricorrenza; chi lo crea diventa owner.
create or replace function public.create_group(
  p_name                text,
  p_anchor_date         date,
  p_interval_weeks      integer,
  p_start_time          time,
  p_description         text default null,
  p_mode                public.group_mode default 'in_person',
  p_default_location    text default null,
  p_online_link         text default null,
  p_timezone            text default 'Europe/Rome',
  p_duration_minutes    integer default 180,
  p_default_game_title  text default null,
  p_min_attendees       integer default null,
  p_approval_rule       public.approval_rule default 'majority'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group_id uuid;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Fuso orario non valido.';
  end if;

  insert into public.groups (
    name, description, mode, default_location, online_link, timezone,
    duration_minutes, default_game_title, min_attendees, approval_rule, created_by
  ) values (
    btrim(p_name), nullif(btrim(p_description), ''), p_mode,
    nullif(btrim(p_default_location), ''), nullif(btrim(p_online_link), ''), p_timezone,
    p_duration_minutes, nullif(btrim(p_default_game_title), ''), p_min_attendees,
    p_approval_rule, v_user
  )
  returning id into v_group_id;

  insert into public.group_schedules (group_id, anchor_date, interval_weeks, start_time)
  values (v_group_id, p_anchor_date, p_interval_weeks, p_start_time);

  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_user, 'owner');

  return v_group_id;
end;
$$;

-- Anteprima di un gruppo a partire dal codice d'invito (per la pagina "Entra").
create or replace function public.get_invite_preview(p_code text)
returns table (
  group_id uuid,
  name text,
  description text,
  member_count integer,
  is_member boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.description,
    (select count(*)::integer from public.memberships m where m.group_id = g.id),
    exists (
      select 1 from public.memberships m
      where m.group_id = g.id and m.user_id = (select auth.uid())
    )
  from public.groups g
  where g.invite_code = upper(btrim(p_code)) and g.status <> 'archived';
$$;

-- Entra in un gruppo con il codice d'invito.
create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group_id uuid;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;

  select id into v_group_id
  from public.groups
  where invite_code = upper(btrim(p_code)) and status <> 'archived';

  if v_group_id is null then
    raise exception 'Codice d''invito non valido.';
  end if;

  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

-- Cambio fisso del giorno/orario/frequenza (solo owner).
-- La ricorrenza attuale vale fino a oggi compreso; la nuova parte da p_anchor_date.
create or replace function public.change_schedule(
  p_group_id        uuid,
  p_anchor_date     date,
  p_interval_weeks  integer,
  p_start_time      time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date;
  v_cutoff date;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può cambiare la ricorrenza.';
  end if;

  select (now() at time zone g.timezone)::date into v_today
  from public.groups g where g.id = p_group_id;

  if p_anchor_date < v_today then
    raise exception 'Il nuovo primo incontro non può essere nel passato.';
  end if;

  v_cutoff := least(v_today + 1, p_anchor_date);

  -- Ricorrenze non ancora iniziate: si eliminano.
  delete from public.group_schedules
  where group_id = p_group_id and valid_until is null and anchor_date >= v_cutoff;

  -- Ricorrenza in corso: si chiude.
  update public.group_schedules
  set valid_until = v_cutoff
  where group_id = p_group_id and valid_until is null;

  insert into public.group_schedules (group_id, anchor_date, interval_weeks, start_time)
  values (p_group_id, p_anchor_date, p_interval_weeks, p_start_time);
end;
$$;

-- Passa il ruolo di owner a un altro membro.
create or replace function public.transfer_ownership(p_group_id uuid, p_new_owner uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può cedere il proprio ruolo.';
  end if;
  if p_new_owner = v_user then
    return;
  end if;
  if not exists (
    select 1 from public.memberships where group_id = p_group_id and user_id = p_new_owner
  ) then
    raise exception 'La persona scelta non fa parte del gruppo.';
  end if;

  update public.memberships set role = 'member'
  where group_id = p_group_id and user_id = v_user;
  update public.memberships set role = 'owner'
  where group_id = p_group_id and user_id = p_new_owner;
end;
$$;

-- Genera un nuovo codice d'invito (il vecchio smette di funzionare).
create or replace function public.regenerate_invite_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può rigenerare il codice d''invito.';
  end if;
  update public.groups set invite_code = public.generate_invite_code()
  where id = p_group_id
  returning invite_code into v_code;
  return v_code;
end;
$$;

-- Permessi sulle funzioni: solo utenti autenticati.
revoke execute on function
  public.create_group(text, date, integer, time, text, public.group_mode, text, text, text, integer, text, integer, public.approval_rule),
  public.get_invite_preview(text),
  public.join_group(text),
  public.change_schedule(uuid, date, integer, time),
  public.transfer_ownership(uuid, uuid),
  public.regenerate_invite_code(uuid),
  public.is_group_member(uuid),
  public.is_group_owner(uuid),
  public.shares_group_with(uuid),
  public.handle_new_user(),
  public.generate_invite_code()
from public, anon;

grant execute on function
  public.create_group(text, date, integer, time, text, public.group_mode, text, text, text, integer, text, integer, public.approval_rule),
  public.get_invite_preview(text),
  public.join_group(text),
  public.change_schedule(uuid, date, integer, time),
  public.transfer_ownership(uuid, uuid),
  public.regenerate_invite_code(uuid),
  public.is_group_member(uuid),
  public.is_group_owner(uuid),
  public.shares_group_with(uuid),
  public.generate_invite_code()
to authenticated;
