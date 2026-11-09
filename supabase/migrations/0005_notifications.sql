-- =============================================================================
-- Schednd · Migrazione 0005 · Notifiche
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede le migrazioni 0001–0004.
--
-- Il database decide CHI avvisare e CON QUALE messaggio, scrivendo nella
-- coda notification_queue (tramite trigger o la funzione giornaliera).
-- L'app (server) legge la coda e invia notifiche push ed email.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Preferenze e iscrizioni alle notifiche push
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column notify_push boolean not null default true,
  add column notify_email boolean not null default false;

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text check (char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;

-- Salva (o sposta sull'utente attuale) l'iscrizione push di questo dispositivo.
create or replace function public.save_push_subscription(
  p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;
  if p_endpoint !~ '^https://' then
    raise exception 'Iscrizione non valida.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Coda delle notifiche (letta solo dal server con la chiave service_role)
-- -----------------------------------------------------------------------------
create table public.notification_queue (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  url         text not null default '/',
  dedupe_key  text unique,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  attempts    integer not null default 0,
  sent_at     timestamptz
);

create index notification_queue_pending_idx on public.notification_queue (id) where sent_at is null;

alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

-- Stato "minimo raggiunto già comunicato" per ogni incontro.
alter table public.occurrences add column confirmed_notified boolean not null default false;

-- -----------------------------------------------------------------------------
-- Funzioni di supporto per i testi
-- -----------------------------------------------------------------------------
-- "mer 18 nov"
create or replace function public.fmt_day(p_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select (array['lun','mar','mer','gio','ven','sab','dom'])[extract(isodow from p_date)::int]
    || ' ' || extract(day from p_date)::int
    || ' ' || (array['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'])[extract(month from p_date)::int];
$$;

-- "21:00"
create or replace function public.fmt_time(p_time time)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_time, 'HH24:MI');
$$;

-- Accoda una notifica (ignorata se la chiave di deduplica esiste già).
create or replace function public.enqueue_notification(
  p_user_id uuid, p_kind text, p_title text, p_body text, p_url text, p_dedupe_key text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_queue (user_id, kind, title, body, url, dedupe_key)
  values (p_user_id, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_dedupe_key)
  on conflict (dedupe_key) do nothing;
$$;

-- Partecipanti di un incontro: membri del gruppo + ospiti dell'incontro.
create or replace function public.occurrence_participants(p_occurrence_id uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id
  from public.occurrences o join public.memberships m on m.group_id = o.group_id
  where o.id = p_occurrence_id
  union
  select g.user_id from public.occurrence_guests g where g.occurrence_id = p_occurrence_id;
$$;

create or replace function public.group_owner_id(p_group_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select user_id from public.memberships where group_id = p_group_id and role = 'owner';
$$;

create or replace function public.meeting_url(p_group_id uuid, p_original_date date)
returns text
language sql
immutable
set search_path = ''
as $$
  select '/groups/' || p_group_id || '/' || to_char(p_original_date, 'YYYY-MM-DD');
$$;

-- -----------------------------------------------------------------------------
-- Trigger: nuova proposta → avvisa i partecipanti (tranne chi l'ha fatta).
-- -----------------------------------------------------------------------------
create or replace function public.notify_proposal_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_group text;
  v_author text;
  v_what text;
  v_user uuid;
begin
  select * into v_occ from public.occurrences where id = new.occurrence_id;
  select name into v_group from public.groups where id = v_occ.group_id;
  select display_name into v_author from public.profiles where id = new.created_by;
  v_what := case new.type
    when 'reschedule' then 'di cambiare data'
    when 'skip' then 'di saltare l''incontro'
    else 'di cambiare gioco'
  end;

  for v_user in select user_id from public.occurrence_participants(new.occurrence_id) loop
    continue when v_user = new.created_by;
    perform public.enqueue_notification(
      v_user, 'proposal_created',
      '🗳️ Nuova proposta · ' || v_group,
      coalesce(v_author, 'Qualcuno') || ' propone ' || v_what || ' per ' || public.fmt_day(v_occ.start_date) || '. Vota anche tu!',
      public.meeting_url(v_occ.group_id, v_occ.original_date) || '#proposte',
      'proposal_created:' || new.id || ':' || v_user
    );
  end loop;
  return null;
end;
$$;

create trigger proposals_notify_created
  after insert on public.proposals
  for each row execute function public.notify_proposal_created();

-- -----------------------------------------------------------------------------
-- Trigger: esito di una proposta (approvata, respinta, pareggio).
-- -----------------------------------------------------------------------------
create or replace function public.notify_proposal_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_group text;
  v_opt public.proposal_options;
  v_title text;
  v_body text;
  v_kind text;
  v_url text;
  v_user uuid;
  v_owner uuid;
begin
  if new.status = old.status then
    return null;
  end if;

  select * into v_occ from public.occurrences where id = new.occurrence_id;
  select name into v_group from public.groups where id = v_occ.group_id;
  v_url := public.meeting_url(v_occ.group_id, v_occ.original_date);

  if new.status = 'needs_owner' then
    v_owner := public.group_owner_id(v_occ.group_id);
    perform public.enqueue_notification(
      v_owner, 'proposal_tie',
      '⚖️ Pareggio · ' || v_group,
      'La proposta per ' || public.fmt_day(v_occ.start_date) || ' è in pareggio: decidi tu.',
      v_url || '#proposte',
      'proposal_tie:' || new.id
    );
    return null;
  end if;

  if new.status = 'approved' then
    select * into v_opt from public.proposal_options where id = new.winning_option_id;
    v_kind := 'proposal_approved';
    if new.type = 'skip' then
      v_title := '⏭️ Incontro saltato · ' || v_group;
      v_body := 'L''incontro di ' || public.fmt_day(v_occ.original_date) || ' non si fa.';
    elsif new.type = 'reschedule' then
      v_title := '📅 Nuova data · ' || v_group;
      v_body := 'L''incontro di ' || public.fmt_day(v_occ.original_date) || ' si sposta a '
        || public.fmt_day(v_opt.new_start_date) || ' alle ' || public.fmt_time(v_opt.new_start_time) || '.';
    else
      v_title := '🎲 Cambio gioco · ' || v_group;
      v_body := public.fmt_day(v_occ.start_date) || ' si gioca a ' || coalesce(v_opt.game_title, '?') || '.';
    end if;
  elsif new.status = 'rejected' then
    v_kind := 'proposal_rejected';
    v_title := '❌ Proposta respinta · ' || v_group;
    v_body := 'Per ' || public.fmt_day(v_occ.start_date) || ' resta tutto com''era.';
  else
    return null;
  end if;

  for v_user in select user_id from public.occurrence_participants(new.occurrence_id) loop
    perform public.enqueue_notification(
      v_user, v_kind, v_title, v_body, v_url,
      -- Il salto usa la stessa chiave della notifica "incontro saltato".
      case when new.type = 'skip' and new.status = 'approved'
        then 'skipped:' || v_occ.id || ':' || v_user
        else v_kind || ':' || new.id || ':' || v_user
      end
    );
  end loop;
  return null;
end;
$$;

create trigger proposals_notify_status
  after update of status on public.proposals
  for each row execute function public.notify_proposal_status();

-- -----------------------------------------------------------------------------
-- Trigger: l'owner salta o ripristina un incontro.
-- -----------------------------------------------------------------------------
create or replace function public.notify_occurrence_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_user uuid;
  v_actor uuid := (select auth.uid());
begin
  if new.status = old.status then
    return null;
  end if;
  select name into v_group from public.groups where id = new.group_id;

  for v_user in select user_id from public.occurrence_participants(new.id) loop
    continue when v_user = v_actor;
    if new.status = 'skipped' then
      perform public.enqueue_notification(
        v_user, 'occurrence_skipped',
        '⏭️ Incontro saltato · ' || v_group,
        'L''incontro di ' || public.fmt_day(new.start_date) || ' non si fa.',
        public.meeting_url(new.group_id, new.original_date),
        'skipped:' || new.id || ':' || v_user
      );
    else
      perform public.enqueue_notification(
        v_user, 'occurrence_restored',
        '▶️ Si gioca di nuovo · ' || v_group,
        'L''incontro di ' || public.fmt_day(new.start_date) || ' è stato ripristinato.',
        public.meeting_url(new.group_id, new.original_date),
        'restored:' || new.id || ':' || v_user || ':' || to_char(now(), 'YYYYMMDDHH24MI')
      );
    end if;
  end loop;
  return null;
end;
$$;

create trigger occurrences_notify_status
  after update of status on public.occurrences
  for each row execute function public.notify_occurrence_status();

-- -----------------------------------------------------------------------------
-- Trigger: minimo presenti raggiunto o perso.
-- -----------------------------------------------------------------------------
create or replace function public.notify_attendance_minimum()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_group public.groups;
  v_yes integer;
  v_user uuid;
  v_stamp text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
  -- Durante l'applicazione di un cambio data le presenze vengono riscritte:
  -- in quel caso avvisa già la notifica della proposta.
  if current_setting('schednd.suppress_attendance_notify', true) = 'on' then
    return null;
  end if;

  select * into v_occ from public.occurrences
  where id = coalesce(new.occurrence_id, old.occurrence_id);
  if not found or v_occ.status <> 'scheduled' then
    return null;
  end if;

  select * into v_group from public.groups where id = v_occ.group_id;
  if v_group.min_attendees is null
     or v_occ.start_date < (now() at time zone v_group.timezone)::date then
    return null;
  end if;

  select count(*) into v_yes from public.attendances
  where occurrence_id = v_occ.id and status = 'yes';

  if v_yes >= v_group.min_attendees and not v_occ.confirmed_notified then
    update public.occurrences set confirmed_notified = true where id = v_occ.id;
    for v_user in select user_id from public.attendances where occurrence_id = v_occ.id and status = 'yes' loop
      perform public.enqueue_notification(
        v_user, 'minimum_reached',
        '🎲 Si gioca! · ' || v_group.name,
        public.fmt_day(v_occ.start_date) || ' alle ' || public.fmt_time(v_occ.start_time)
          || ': siete in ' || v_yes || ', il minimo è raggiunto.',
        public.meeting_url(v_occ.group_id, v_occ.original_date),
        'minimum_reached:' || v_occ.id || ':' || v_user || ':' || v_stamp
      );
    end loop;
  elsif v_yes < v_group.min_attendees and v_occ.confirmed_notified then
    update public.occurrences set confirmed_notified = false where id = v_occ.id;
    perform public.enqueue_notification(
      public.group_owner_id(v_group.id), 'minimum_lost',
      '⚠️ Sotto il minimo · ' || v_group.name,
      public.fmt_day(v_occ.start_date) || ': ora siete in ' || v_yes || ' su un minimo di '
        || v_group.min_attendees || '.',
      public.meeting_url(v_occ.group_id, v_occ.original_date),
      'minimum_lost:' || v_occ.id || ':' || v_stamp
    );
  end if;
  return null;
end;
$$;

create trigger attendances_notify_minimum
  after insert or update or delete on public.attendances
  for each row execute function public.notify_attendance_minimum();

-- -----------------------------------------------------------------------------
-- Trigger: cambio fisso della ricorrenza → avvisa i membri.
-- -----------------------------------------------------------------------------
create or replace function public.notify_schedule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group text;
  v_user uuid;
  v_actor uuid := (select auth.uid());
  v_desc text;
begin
  -- Solo per un cambio, non per la prima ricorrenza: il gruppo e la sua prima
  -- ricorrenza nascono nella stessa transazione (stesso now()).
  if (select created_at from public.groups where id = new.group_id) = now() then
    return null;
  end if;

  select name into v_group from public.groups where id = new.group_id;
  v_desc := case when new.interval_weeks = 1 then 'ogni settimana' else 'ogni ' || new.interval_weeks || ' settimane' end
    || ', alle ' || public.fmt_time(new.start_time) || ', a partire da ' || public.fmt_day(new.anchor_date);

  for v_user in select user_id from public.memberships where group_id = new.group_id loop
    continue when v_user = v_actor;
    perform public.enqueue_notification(
      v_user, 'schedule_changed',
      '📅 Nuovo calendario · ' || v_group,
      'Da ora si gioca ' || v_desc || '. Le presenze dei prossimi incontri sono da rifare.',
      '/groups/' || new.group_id,
      'schedule_changed:' || new.id || ':' || v_user
    );
  end loop;
  return null;
end;
$$;

create trigger group_schedules_notify
  after insert on public.group_schedules
  for each row execute function public.notify_schedule_changed();

-- -----------------------------------------------------------------------------
-- apply_proposal: durante il cambio data le presenze vengono riscritte senza
-- generare avvisi sul minimo; poi lo stato "confermato" viene riallineato.
-- -----------------------------------------------------------------------------
create or replace function public.apply_proposal(p_proposal_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.proposals;
  v_opt public.proposal_options;
  v_min integer;
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if v_p.type <> 'skip' then
    select * into v_opt from public.proposal_options
    where id = p_option_id and proposal_id = p_proposal_id;
    if not found then
      raise exception 'Opzione non valida.';
    end if;
  end if;

  update public.proposals
  set status = 'approved', winning_option_id = p_option_id, decided_at = now()
  where id = p_proposal_id;

  update public.proposals set status = 'cancelled', decided_at = now()
  where occurrence_id = v_p.occurrence_id and id <> p_proposal_id
    and status in ('open', 'needs_owner')
    and (v_p.type = 'skip' or (v_p.type = 'reschedule' and type = 'skip'));

  if v_p.type = 'skip' then
    update public.occurrences set status = 'skipped' where id = v_p.occurrence_id;

  elsif v_p.type = 'change_game' then
    update public.occurrences set game_title_override = v_opt.game_title
    where id = v_p.occurrence_id;

  elsif v_p.type = 'reschedule' then
    update public.occurrences
    set start_date = v_opt.new_start_date, start_time = v_opt.new_start_time,
        status = 'scheduled'
    where id = v_p.occurrence_id;

    perform set_config('schednd.suppress_attendance_notify', 'on', true);
    delete from public.attendances where occurrence_id = v_p.occurrence_id;
    insert into public.attendances (occurrence_id, user_id, status)
    select v_p.occurrence_id, b.user_id, 'yes'
    from public.ballots b
    where b.proposal_id = p_proposal_id and p_option_id = any (b.option_ids);
    perform set_config('schednd.suppress_attendance_notify', 'off', true);

    select g.min_attendees into v_min
    from public.occurrences o join public.groups g on g.id = o.group_id
    where o.id = v_p.occurrence_id;
    update public.occurrences
    set confirmed_notified = v_min is not null and (
      select count(*) from public.attendances
      where occurrence_id = v_p.occurrence_id and status = 'yes'
    ) >= v_min
    where id = v_p.occurrence_id;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Incontri di un gruppo tra due date (calcolati dalla ricorrenza + eccezioni).
-- -----------------------------------------------------------------------------
create or replace function public.group_meetings_between(p_group_id uuid, p_from date, p_to date)
returns table (
  original_date date,
  start_date date,
  start_time time,
  occurrence_id uuid,
  skipped boolean,
  game text,
  location text
)
language sql
stable
security definer
set search_path = ''
as $$
  with sched as (
    select d::date as original_date, s.start_time
    from public.group_schedules s
    cross join lateral generate_series(
      s.anchor_date
        + (greatest(0, ceil((p_from - s.anchor_date)::numeric / (7 * s.interval_weeks)))::int)
          * 7 * s.interval_weeks,
      p_to::timestamp,
      make_interval(days => 7 * s.interval_weeks)
    ) as d
    where s.group_id = p_group_id
      and d::date >= s.anchor_date
      and (s.valid_until is null or d::date < s.valid_until)
  ),
  occ as (
    select * from public.occurrences where group_id = p_group_id
  ),
  merged as (
    select
      coalesce(o.original_date, sc.original_date) as original_date,
      coalesce(o.start_date, sc.original_date) as start_date,
      coalesce(o.start_time, sc.start_time) as start_time,
      o.id as occurrence_id,
      coalesce(o.status = 'skipped', false) as skipped,
      o.game_title_override,
      o.location_override
    from sched sc
    full join occ o on o.original_date = sc.original_date
  )
  select m.original_date, m.start_date, m.start_time, m.occurrence_id, m.skipped,
         coalesce(m.game_title_override, g.default_game_title),
         coalesce(m.location_override, g.default_location)
  from merged m
  cross join public.groups g
  where g.id = p_group_id and m.start_date between p_from and p_to;
$$;

-- -----------------------------------------------------------------------------
-- Funzione giornaliera (chiamata dal cron del server):
-- chiude le proposte scadute e accoda i promemoria a 2 giorni e a 1 giorno.
-- -----------------------------------------------------------------------------
create or replace function public.run_daily_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group public.groups;
  v_today date;
  v_m record;
  v_yes integer;
  v_owner uuid;
  v_user uuid;
  v_url text;
  v_key text;
  v_id uuid;
  v_before bigint;
  v_count integer;
begin
  select coalesce(max(id), 0) into v_before from public.notification_queue;

  -- Proposte scadute in tutti i gruppi.
  for v_id in
    select id from public.proposals where status = 'open' and closes_at <= now()
  loop
    perform public.evaluate_proposal(v_id);
  end loop;

  for v_group in select * from public.groups where status = 'active' loop
    v_today := (now() at time zone v_group.timezone)::date;
    v_owner := public.group_owner_id(v_group.id);

    for v_m in
      select * from public.group_meetings_between(v_group.id, v_today + 1, v_today + 2)
      where not skipped
    loop
      v_url := public.meeting_url(v_group.id, v_m.original_date);
      v_key := v_group.id || ':' || v_m.original_date;
      select count(*) into v_yes from public.attendances
      where occurrence_id = v_m.occurrence_id and status = 'yes';

      -- 2 giorni prima: se manca il minimo, avvisa chi non ha risposto e l'owner.
      if v_m.start_date = v_today + 2 and v_group.min_attendees is not null
         and v_yes < v_group.min_attendees then
        for v_user in
          select m.user_id from public.memberships m where m.group_id = v_group.id
          union
          select g.user_id from public.occurrence_guests g where g.occurrence_id = v_m.occurrence_id
        loop
          continue when v_user <> v_owner and exists (
            select 1 from public.attendances a
            where a.occurrence_id = v_m.occurrence_id and a.user_id = v_user
          );
          perform public.enqueue_notification(
            v_user, 'min_check_48h',
            '⏳ ' || v_group.name || ' · ' || public.fmt_day(v_m.start_date),
            case when v_user = v_owner
              then 'Tra 2 giorni: siete in ' || v_yes || ' su un minimo di ' || v_group.min_attendees || '.'
              else 'Tra 2 giorni: siete in ' || v_yes || ' su un minimo di ' || v_group.min_attendees || '. Ci sei?'
            end,
            v_url,
            'min_check_48h:' || v_key || ':' || v_user
          );
        end loop;
      end if;

      -- 1 giorno prima: promemoria a tutti i presenti.
      if v_m.start_date = v_today + 1 then
        for v_user in
          select a.user_id from public.attendances a
          where a.occurrence_id = v_m.occurrence_id and a.status = 'yes'
        loop
          perform public.enqueue_notification(
            v_user, 'reminder_24h',
            '🎲 Domani si gioca! · ' || v_group.name,
            coalesce(v_m.game || ' · ', '') || 'alle ' || public.fmt_time(v_m.start_time)
              || coalesce(' · ' || v_m.location, ''),
            v_url,
            'reminder_24h:' || v_key || ':' || v_user
          );
        end loop;

        -- Se manca ancora il minimo, decide l'owner.
        if v_group.min_attendees is not null and v_yes < v_group.min_attendees then
          perform public.enqueue_notification(
            v_owner, 'owner_min_24h',
            '⚠️ Manca il minimo per domani · ' || v_group.name,
            'Siete in ' || v_yes || ' su ' || v_group.min_attendees
              || '. Decidi tu: giocate comunque, saltate o cambiate gioco.',
            v_url,
            'owner_min_24h:' || v_key
          );
        end if;
      end if;
    end loop;
  end loop;

  select count(*) into v_count from public.notification_queue where id > v_before;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Prende in carico un blocco di notifiche da inviare (per il server).
-- -----------------------------------------------------------------------------
create or replace function public.claim_notifications(p_limit integer default 200)
returns setof public.notification_queue
language sql
security definer
set search_path = ''
as $$
  update public.notification_queue q
  set claimed_at = now(), attempts = q.attempts + 1
  where q.id in (
    select id from public.notification_queue
    where sent_at is null
      and attempts < 3
      and created_at > now() - interval '3 days'
      and (claimed_at is null or claimed_at < now() - interval '5 minutes')
    order by id
    limit p_limit
    for update skip locked
  )
  returning q.*;
$$;

-- Accoda una notifica di prova per l'utente collegato.
create or replace function public.enqueue_test_notification()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.enqueue_notification(
    (select auth.uid()), 'test',
    '🔔 Notifiche attive',
    'Funziona! Riceverai qui gli avvisi di Schednd.',
    '/profile',
    'test:' || (select auth.uid()) || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );
$$;

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
revoke execute on function
  public.save_push_subscription(text, text, text, text),
  public.fmt_day(date),
  public.fmt_time(time),
  public.enqueue_notification(uuid, text, text, text, text, text),
  public.occurrence_participants(uuid),
  public.group_owner_id(uuid),
  public.meeting_url(uuid, date),
  public.notify_proposal_created(),
  public.notify_proposal_status(),
  public.notify_occurrence_status(),
  public.notify_attendance_minimum(),
  public.notify_schedule_changed(),
  public.group_meetings_between(uuid, date, date),
  public.run_daily_notifications(),
  public.claim_notifications(integer),
  public.enqueue_test_notification()
from public, anon, authenticated;

grant execute on function
  public.save_push_subscription(text, text, text, text),
  public.enqueue_test_notification()
to authenticated;

grant execute on function
  public.run_daily_notifications(),
  public.claim_notifications(integer)
to service_role;
