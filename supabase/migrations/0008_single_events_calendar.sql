-- =============================================================================
-- Schednd · Migrazione 0008 · Eventi singoli, incontri straordinari, calendario
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede le migrazioni 0001–0007.
--
-- - Un gruppo può essere "ricorrente" (come finora) o un "evento singolo".
-- - Gli incontri fuori ricorrenza (l'evento singolo, gli incontri
--   straordinari) sono righe di occurrences con is_extra = true.
-- - Ogni utente può avere un link segreto al proprio calendario (iCal).
-- =============================================================================

create type public.group_kind as enum ('recurring', 'single');

alter table public.groups add column kind public.group_kind not null default 'recurring';
alter table public.occurrences add column is_extra boolean not null default false;

-- Token segreti del calendario: tabella separata, così non è leggibile da chi
-- vede il profilo (i membri dei gruppi). Si legge solo tramite le funzioni.
create table public.calendar_tokens (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  token       text not null unique,
  created_at  timestamptz not null default now()
);
alter table public.calendar_tokens enable row level security;
revoke all on public.calendar_tokens from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Il cambio della ricorrenza non tocca gli incontri straordinari.
-- -----------------------------------------------------------------------------
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

  delete from public.group_schedules
  where group_id = p_group_id and valid_until is null and anchor_date >= v_cutoff;

  update public.group_schedules
  set valid_until = v_cutoff
  where group_id = p_group_id and valid_until is null;

  insert into public.group_schedules (group_id, anchor_date, interval_weeks, start_time)
  values (p_group_id, p_anchor_date, p_interval_weeks, p_start_time);

  delete from public.occurrences
  where group_id = p_group_id and original_date >= v_cutoff and not is_extra;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: crea un evento singolo (gruppo con un solo incontro).
-- -----------------------------------------------------------------------------
create or replace function public.create_single_event(
  p_name                text,
  p_date                date,
  p_time                time,
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
  if ((p_date + p_time) at time zone p_timezone) <= now() then
    raise exception 'La data dell''evento deve essere nel futuro.';
  end if;

  insert into public.groups (
    name, description, mode, default_location, online_link, timezone,
    duration_minutes, default_game_title, min_attendees, approval_rule, created_by, kind
  ) values (
    btrim(p_name), nullif(btrim(p_description), ''), p_mode,
    nullif(btrim(p_default_location), ''), nullif(btrim(p_online_link), ''), p_timezone,
    p_duration_minutes, nullif(btrim(p_default_game_title), ''), p_min_attendees,
    p_approval_rule, v_user, 'single'
  )
  returning id into v_group_id;

  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_user, 'owner');

  insert into public.occurrences (group_id, original_date, start_date, start_time, is_extra)
  values (v_group_id, p_date, p_date, p_time, true);

  return v_group_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: incontro straordinario in un gruppo ricorrente (solo owner).
-- -----------------------------------------------------------------------------
create or replace function public.create_extra_meeting(
  p_group_id  uuid,
  p_date      date,
  p_time      time,
  p_game      text default null,
  p_location  text default null,
  p_notes     text default null
)
returns date
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_loc text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può aggiungere incontri.';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  if ((p_date + p_time) at time zone v_group.timezone) <= now() then
    raise exception 'La data dell''incontro deve essere nel futuro.';
  end if;
  if exists (select 1 from public.occurrences where group_id = p_group_id and original_date = p_date)
     or public.scheduled_time_for(p_group_id, p_date) is not null then
    raise exception 'In questa data c''è già un incontro.';
  end if;

  insert into public.occurrences (
    group_id, original_date, start_date, start_time, is_extra,
    game_title_override, location_override, notes
  ) values (
    p_group_id, p_date, p_date, p_time, true,
    nullif(btrim(p_game), ''), nullif(btrim(p_location), ''), nullif(btrim(p_notes), '')
  );

  for v_user in select user_id from public.memberships where group_id = p_group_id loop
    continue when v_user = v_actor;
    v_loc := public.user_locale(v_user);
    perform public.enqueue_notification(
      v_user, 'extra_meeting',
      public.tr(v_loc, '📅 Incontro in più · ', '📅 Extra meeting · ') || v_group.name,
      public.tr(v_loc,
        'Nuovo incontro ' || public.fmt_day(p_date, v_loc) || ' alle ' || public.fmt_time(p_time) || '. Ci sei?',
        'New meeting on ' || public.fmt_day(p_date, v_loc) || ' at ' || public.fmt_time(p_time) || '. Are you in?'),
      public.meeting_url(p_group_id, p_date),
      'extra_meeting:' || p_group_id || ':' || p_date || ':' || v_user
    );
  end loop;

  return p_date;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: l'owner sposta data/ora di un incontro (le presenze restano).
-- -----------------------------------------------------------------------------
create or replace function public.move_occurrence(
  p_group_id       uuid,
  p_original_date  date,
  p_new_date       date,
  p_new_time       time
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_group public.groups;
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_loc text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare l''incontro.';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  if ((p_new_date + p_new_time) at time zone v_group.timezone) <= now() then
    raise exception 'La data dell''incontro deve essere nel futuro.';
  end if;

  v_occ := public.ensure_occurrence(p_group_id, p_original_date);
  if v_occ.start_date = p_new_date and v_occ.start_time = p_new_time then
    return;
  end if;

  update public.occurrences
  set start_date = p_new_date, start_time = p_new_time
  where id = v_occ.id;

  for v_user in select user_id from public.occurrence_participants(v_occ.id) loop
    continue when v_user = v_actor;
    v_loc := public.user_locale(v_user);
    perform public.enqueue_notification(
      v_user, 'occurrence_moved',
      public.tr(v_loc, '📅 Nuova data · ', '📅 New date · ') || v_group.name,
      public.tr(v_loc,
        'L''incontro di ' || public.fmt_day(v_occ.start_date, v_loc) || ' si sposta a '
          || public.fmt_day(p_new_date, v_loc) || ' alle ' || public.fmt_time(p_new_time) || '.',
        'The meeting on ' || public.fmt_day(v_occ.start_date, v_loc) || ' moves to '
          || public.fmt_day(p_new_date, v_loc) || ' at ' || public.fmt_time(p_new_time) || '.'),
      public.meeting_url(p_group_id, p_original_date),
      'occurrence_moved:' || v_occ.id || ':' || v_user || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: l'owner elimina un incontro straordinario (avvisa i partecipanti).
-- -----------------------------------------------------------------------------
create or replace function public.delete_extra_meeting(p_group_id uuid, p_original_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_group public.groups;
  v_actor uuid := (select auth.uid());
  v_user uuid;
  v_loc text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare l''incontro.';
  end if;
  select * into v_group from public.groups where id = p_group_id;
  if v_group.kind = 'single' then
    raise exception 'Per annullare un evento singolo elimina il gruppo dalle impostazioni.';
  end if;
  select * into v_occ from public.occurrences
  where group_id = p_group_id and original_date = p_original_date and is_extra;
  if not found then
    raise exception 'Incontro non trovato.';
  end if;

  for v_user in select user_id from public.occurrence_participants(v_occ.id) loop
    continue when v_user = v_actor;
    v_loc := public.user_locale(v_user);
    perform public.enqueue_notification(
      v_user, 'extra_meeting_deleted',
      public.tr(v_loc, '❌ Incontro annullato · ', '❌ Meeting cancelled · ') || v_group.name,
      public.tr(v_loc,
        'L''incontro di ' || public.fmt_day(v_occ.start_date, v_loc) || ' è stato annullato.',
        'The meeting on ' || public.fmt_day(v_occ.start_date, v_loc) || ' has been cancelled.'),
      '/groups/' || p_group_id,
      'extra_meeting_deleted:' || v_occ.id || ':' || v_user
    );
  end loop;

  delete from public.occurrences where id = v_occ.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: link segreto al calendario personale (lo crea o lo rigenera).
-- -----------------------------------------------------------------------------
create or replace function public.get_calendar_token(p_regenerate boolean default false)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_token text;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;
  select token into v_token from public.calendar_tokens where user_id = v_user;
  if v_token is null or p_regenerate then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.calendar_tokens (user_id, token) values (v_user, v_token)
    on conflict (user_id) do update set token = excluded.token, created_at = now();
  end if;
  return v_token;
end;
$$;

revoke execute on function
  public.create_single_event(text, date, time, text, public.group_mode, text, text, text, integer, text, integer, public.approval_rule),
  public.create_extra_meeting(uuid, date, time, text, text, text),
  public.move_occurrence(uuid, date, date, time),
  public.delete_extra_meeting(uuid, date),
  public.get_calendar_token(boolean)
from public, anon;

grant execute on function
  public.create_single_event(text, date, time, text, public.group_mode, text, text, text, integer, text, integer, public.approval_rule),
  public.create_extra_meeting(uuid, date, time, text, text, text),
  public.move_occurrence(uuid, date, date, time),
  public.delete_extra_meeting(uuid, date),
  public.get_calendar_token(boolean)
to authenticated;

-- -----------------------------------------------------------------------------
-- Per il feed del calendario (server, chiave service_role): utente dal token.
-- -----------------------------------------------------------------------------
create or replace function public.calendar_user(p_token text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.calendar_tokens where token = p_token;
$$;

revoke execute on function public.calendar_user(text) from public, anon, authenticated;
grant execute on function public.calendar_user(text) to service_role;

-- -----------------------------------------------------------------------------
-- Contesto ospite: aggiunge durata e tipo di gruppo (per il calendario).
-- -----------------------------------------------------------------------------
create or replace function public.get_guest_context(p_group_id uuid, p_original_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_occ_id uuid;
begin
  select id into v_occ_id from public.occurrences
  where group_id = p_group_id and original_date = p_original_date;

  if v_occ_id is null or not public.is_occurrence_guest(v_occ_id) then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'group', jsonb_build_object(
        'id', g.id,
        'name', g.name,
        'mode', g.mode,
        'default_location', g.default_location,
        'online_link', g.online_link,
        'timezone', g.timezone,
        'default_game_title', g.default_game_title,
        'min_attendees', g.min_attendees,
        'approval_rule', g.approval_rule,
        'duration_minutes', g.duration_minutes,
        'kind', g.kind,
        'group_schedules', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', s.id, 'anchor_date', s.anchor_date, 'interval_weeks', s.interval_weeks,
            'start_time', s.start_time, 'valid_until', s.valid_until))
          from public.group_schedules s where s.group_id = g.id
        ), '[]'::jsonb)
      ),
      'participants', (
        select coalesce(jsonb_agg(x), '[]'::jsonb) from (
          select m.user_id, p.display_name as name, m.role::text as role
          from public.memberships m join public.profiles p on p.id = m.user_id
          where m.group_id = g.id
          union all
          select og.user_id, p.display_name, 'guest'
          from public.occurrence_guests og join public.profiles p on p.id = og.user_id
          where og.occurrence_id = v_occ_id
        ) x
      )
    )
    from public.groups g where g.id = p_group_id
  );
end;
$$;
