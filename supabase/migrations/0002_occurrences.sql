-- =============================================================================
-- Schednd · Migrazione 0002 · Incontri e presenze
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede la 0001.
-- =============================================================================

create type public.occurrence_status as enum ('scheduled', 'skipped');
create type public.attendance_status as enum ('yes', 'no', 'maybe');

-- -----------------------------------------------------------------------------
-- Incontri: una riga solo per le date su cui qualcuno ha interagito
-- (presenza, modifica dell'owner...). Le altre date si calcolano dalla
-- ricorrenza. La chiave stabile è (group_id, original_date).
-- -----------------------------------------------------------------------------
create table public.occurrences (
  id                 uuid primary key default gen_random_uuid(),
  group_id           uuid not null references public.groups (id) on delete cascade,
  original_date      date not null,
  start_date         date not null,
  start_time         time not null,
  status             public.occurrence_status not null default 'scheduled',
  game_title_override text check (char_length(game_title_override) <= 120),
  location_override  text check (char_length(location_override) <= 200),
  notes              text check (char_length(notes) <= 1000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (group_id, original_date)
);

create index occurrences_group_date_idx on public.occurrences (group_id, start_date);

create trigger occurrences_touch before update on public.occurrences
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Presenze
-- -----------------------------------------------------------------------------
create table public.attendances (
  occurrence_id  uuid not null references public.occurrences (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         public.attendance_status not null,
  note           text check (char_length(note) <= 200),
  updated_at     timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);

create index attendances_user_idx on public.attendances (user_id);

create trigger attendances_touch before update on public.attendances
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
create or replace function public.occurrence_group_id(p_occurrence_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id from public.occurrences where id = p_occurrence_id;
$$;

alter table public.occurrences enable row level security;
alter table public.attendances enable row level security;

create policy occurrences_select on public.occurrences for select to authenticated
  using (public.is_group_member(group_id));

create policy attendances_select on public.attendances for select to authenticated
  using (public.is_group_member(public.occurrence_group_id(occurrence_id)));

revoke all on public.occurrences, public.attendances from anon;

-- -----------------------------------------------------------------------------
-- Funzioni di supporto
-- -----------------------------------------------------------------------------

-- Orario previsto dalla ricorrenza per una data, oppure null se in quella data
-- il gruppo non ha un incontro.
create or replace function public.scheduled_time_for(p_group_id uuid, p_date date)
returns time
language sql
stable
security definer
set search_path = ''
as $$
  select s.start_time
  from public.group_schedules s
  where s.group_id = p_group_id
    and p_date >= s.anchor_date
    and (s.valid_until is null or p_date < s.valid_until)
    and ((p_date - s.anchor_date) % (s.interval_weeks * 7)) = 0
  order by s.anchor_date desc
  limit 1;
$$;

-- Restituisce l'incontro (lo crea se serve) per una data della ricorrenza.
create or replace function public.ensure_occurrence(p_group_id uuid, p_original_date date)
returns public.occurrences
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_time time;
begin
  select * into v_occ from public.occurrences
  where group_id = p_group_id and original_date = p_original_date;

  if found then
    return v_occ;
  end if;

  v_time := public.scheduled_time_for(p_group_id, p_original_date);
  if v_time is null then
    raise exception 'In questa data il gruppo non ha un incontro.';
  end if;

  insert into public.occurrences (group_id, original_date, start_date, start_time)
  values (p_group_id, p_original_date, p_original_date, v_time)
  on conflict (group_id, original_date) do nothing;

  select * into v_occ from public.occurrences
  where group_id = p_group_id and original_date = p_original_date;
  return v_occ;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: presenza
-- p_status null = cancella la mia risposta.
-- -----------------------------------------------------------------------------
create or replace function public.set_attendance(
  p_group_id       uuid,
  p_original_date  date,
  p_status         public.attendance_status,
  p_note           text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_occ public.occurrences;
  v_today date;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;

  select (now() at time zone g.timezone)::date into v_today
  from public.groups g where g.id = p_group_id;

  v_occ := public.ensure_occurrence(p_group_id, p_original_date);

  if v_occ.start_date < v_today then
    raise exception 'Questo incontro è già passato.';
  end if;

  if p_status is null then
    delete from public.attendances where occurrence_id = v_occ.id and user_id = v_user;
  else
    insert into public.attendances (occurrence_id, user_id, status, note)
    values (v_occ.id, v_user, p_status, nullif(btrim(p_note), ''))
    on conflict (occurrence_id, user_id)
    do update set status = excluded.status, note = excluded.note;
  end if;

  return v_occ.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: decisioni dell'owner su un singolo incontro
-- (salta/ripristina, gioco o luogo diversi, nota).
-- -----------------------------------------------------------------------------
create or replace function public.update_occurrence(
  p_group_id             uuid,
  p_original_date        date,
  p_status               public.occurrence_status,
  p_game_title_override  text default null,
  p_location_override    text default null,
  p_notes                text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare l''incontro.';
  end if;

  v_occ := public.ensure_occurrence(p_group_id, p_original_date);

  update public.occurrences
  set status = p_status,
      game_title_override = nullif(btrim(p_game_title_override), ''),
      location_override = nullif(btrim(p_location_override), ''),
      notes = nullif(btrim(p_notes), '')
  where id = v_occ.id;

  return v_occ.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cambio fisso della ricorrenza: ora azzera anche gli incontri futuri
-- della vecchia ricorrenza (presenze comprese), come deciso (D12).
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

  -- Gli incontri dalla data di cambio in poi ripartono da zero.
  delete from public.occurrences
  where group_id = p_group_id and original_date >= v_cutoff;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permessi sulle funzioni
-- -----------------------------------------------------------------------------
revoke execute on function
  public.occurrence_group_id(uuid),
  public.scheduled_time_for(uuid, date),
  public.ensure_occurrence(uuid, date),
  public.set_attendance(uuid, date, public.attendance_status, text),
  public.update_occurrence(uuid, date, public.occurrence_status, text, text, text)
from public, anon;

revoke execute on function public.ensure_occurrence(uuid, date) from authenticated;

grant execute on function
  public.occurrence_group_id(uuid),
  public.scheduled_time_for(uuid, date),
  public.set_attendance(uuid, date, public.attendance_status, text),
  public.update_occurrence(uuid, date, public.occurrence_status, text, text, text)
to authenticated;

-- -----------------------------------------------------------------------------
-- Aggiornamenti in tempo reale (Supabase Realtime) per presenze e incontri.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.attendances, public.occurrences;
  end if;
end;
$$;
