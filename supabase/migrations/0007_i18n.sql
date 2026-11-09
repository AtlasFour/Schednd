-- =============================================================================
-- Schednd · Migrazione 0007 · Lingua (italiano / inglese)
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede le migrazioni 0001–0006.
--
-- La lingua dell'utente è in profiles.locale ('it' o 'en'; null = non ancora
-- scelta, si usa l'italiano). Le notifiche vengono scritte nella lingua di
-- chi le riceve.
-- =============================================================================

-- Finora la colonna valeva sempre 'it' per default: la si azzera, così al
-- prossimo accesso viene presa la lingua del dispositivo (o quella scelta).
alter table public.profiles alter column locale drop not null;
alter table public.profiles alter column locale drop default;
update public.profiles set locale = null where locale = 'it';
alter table public.profiles
  add constraint profiles_locale_check check (locale is null or locale in ('it', 'en'));

-- -----------------------------------------------------------------------------
-- Funzioni di supporto
-- -----------------------------------------------------------------------------
create or replace function public.user_locale(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select locale from public.profiles where id = p_user_id), 'it');
$$;

-- Sceglie il testo nella lingua indicata.
create or replace function public.tr(p_locale text, p_it text, p_en text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_locale = 'en' then p_en else p_it end;
$$;

-- "mer 18 nov" / "Wed 18 Nov"
create or replace function public.fmt_day(p_date date, p_locale text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_locale = 'en' then
    (array['Mon','Tue','Wed','Thu','Fri','Sat','Sun'])[extract(isodow from p_date)::int]
      || ' ' || extract(day from p_date)::int
      || ' ' || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from p_date)::int]
  else public.fmt_day(p_date) end;
$$;

-- -----------------------------------------------------------------------------
-- Nuova proposta
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
  v_user uuid;
  v_loc text;
begin
  select * into v_occ from public.occurrences where id = new.occurrence_id;
  select name into v_group from public.groups where id = v_occ.group_id;
  select display_name into v_author from public.profiles where id = new.created_by;

  for v_user in select user_id from public.occurrence_participants(new.occurrence_id) loop
    continue when v_user = new.created_by;
    v_loc := public.user_locale(v_user);
    perform public.enqueue_notification(
      v_user, 'proposal_created',
      public.tr(v_loc, '🗳️ Nuova proposta · ', '🗳️ New proposal · ') || v_group,
      coalesce(v_author, public.tr(v_loc, 'Qualcuno', 'Someone')) || public.tr(v_loc,
        ' propone ' || case new.type
          when 'reschedule' then 'di cambiare data'
          when 'skip' then 'di saltare l''incontro'
          else 'di cambiare gioco' end
          || ' per ' || public.fmt_day(v_occ.start_date, v_loc) || '. Vota anche tu!',
        ' suggests ' || case new.type
          when 'reschedule' then 'a new date'
          when 'skip' then 'skipping the meeting'
          else 'a different game' end
          || ' for ' || public.fmt_day(v_occ.start_date, v_loc) || '. Cast your vote!'),
      public.meeting_url(v_occ.group_id, v_occ.original_date) || '#proposte',
      'proposal_created:' || new.id || ':' || v_user
    );
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Esito di una proposta
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
  v_loc text;
begin
  if new.status = old.status then
    return null;
  end if;

  select * into v_occ from public.occurrences where id = new.occurrence_id;
  select name into v_group from public.groups where id = v_occ.group_id;
  v_url := public.meeting_url(v_occ.group_id, v_occ.original_date);

  if new.status = 'needs_owner' then
    v_owner := public.group_owner_id(v_occ.group_id);
    v_loc := public.user_locale(v_owner);
    perform public.enqueue_notification(
      v_owner, 'proposal_tie',
      public.tr(v_loc, '⚖️ Pareggio · ', '⚖️ Tie · ') || v_group,
      public.tr(v_loc,
        'La proposta per ' || public.fmt_day(v_occ.start_date, v_loc) || ' è in pareggio: decidi tu.',
        'The proposal for ' || public.fmt_day(v_occ.start_date, v_loc) || ' is tied: you decide.'),
      v_url || '#proposte',
      'proposal_tie:' || new.id
    );
    return null;
  end if;

  if new.status = 'approved' then
    select * into v_opt from public.proposal_options where id = new.winning_option_id;
    v_kind := 'proposal_approved';
  elsif new.status = 'rejected' then
    v_kind := 'proposal_rejected';
  else
    return null;
  end if;

  for v_user in select user_id from public.occurrence_participants(new.occurrence_id) loop
    v_loc := public.user_locale(v_user);
    if new.status = 'rejected' then
      v_title := public.tr(v_loc, '❌ Proposta respinta · ', '❌ Proposal rejected · ') || v_group;
      v_body := public.tr(v_loc,
        'Per ' || public.fmt_day(v_occ.start_date, v_loc) || ' resta tutto com''era.',
        'Nothing changes for ' || public.fmt_day(v_occ.start_date, v_loc) || '.');
    elsif new.type = 'skip' then
      v_title := public.tr(v_loc, '⏭️ Incontro saltato · ', '⏭️ Meeting skipped · ') || v_group;
      v_body := public.tr(v_loc,
        'L''incontro di ' || public.fmt_day(v_occ.original_date, v_loc) || ' non si fa.',
        'The meeting on ' || public.fmt_day(v_occ.original_date, v_loc) || ' is off.');
    elsif new.type = 'reschedule' then
      v_title := public.tr(v_loc, '📅 Nuova data · ', '📅 New date · ') || v_group;
      v_body := public.tr(v_loc,
        'L''incontro di ' || public.fmt_day(v_occ.original_date, v_loc) || ' si sposta a '
          || public.fmt_day(v_opt.new_start_date, v_loc) || ' alle ' || public.fmt_time(v_opt.new_start_time) || '.',
        'The meeting on ' || public.fmt_day(v_occ.original_date, v_loc) || ' moves to '
          || public.fmt_day(v_opt.new_start_date, v_loc) || ' at ' || public.fmt_time(v_opt.new_start_time) || '.');
    else
      v_title := public.tr(v_loc, '🎲 Cambio gioco · ', '🎲 Game change · ') || v_group;
      v_body := public.tr(v_loc,
        public.fmt_day(v_occ.start_date, v_loc) || ' si gioca a ' || coalesce(v_opt.game_title, '?') || '.',
        public.fmt_day(v_occ.start_date, v_loc) || ' we play ' || coalesce(v_opt.game_title, '?') || '.');
    end if;

    perform public.enqueue_notification(
      v_user, v_kind, v_title, v_body, v_url,
      case when new.type = 'skip' and new.status = 'approved'
        then 'skipped:' || v_occ.id || ':' || v_user
        else v_kind || ':' || new.id || ':' || v_user
      end
    );
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Incontro saltato / ripristinato dall'owner
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
  v_loc text;
begin
  if new.status = old.status then
    return null;
  end if;
  select name into v_group from public.groups where id = new.group_id;

  for v_user in select user_id from public.occurrence_participants(new.id) loop
    continue when v_user = v_actor;
    v_loc := public.user_locale(v_user);
    if new.status = 'skipped' then
      perform public.enqueue_notification(
        v_user, 'occurrence_skipped',
        public.tr(v_loc, '⏭️ Incontro saltato · ', '⏭️ Meeting skipped · ') || v_group,
        public.tr(v_loc,
          'L''incontro di ' || public.fmt_day(new.start_date, v_loc) || ' non si fa.',
          'The meeting on ' || public.fmt_day(new.start_date, v_loc) || ' is off.'),
        public.meeting_url(new.group_id, new.original_date),
        'skipped:' || new.id || ':' || v_user
      );
    else
      perform public.enqueue_notification(
        v_user, 'occurrence_restored',
        public.tr(v_loc, '▶️ Si gioca di nuovo · ', '▶️ Back on · ') || v_group,
        public.tr(v_loc,
          'L''incontro di ' || public.fmt_day(new.start_date, v_loc) || ' è stato ripristinato.',
          'The meeting on ' || public.fmt_day(new.start_date, v_loc) || ' has been restored.'),
        public.meeting_url(new.group_id, new.original_date),
        'restored:' || new.id || ':' || v_user || ':' || to_char(now(), 'YYYYMMDDHH24MI')
      );
    end if;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Minimo presenti raggiunto o perso
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
  v_owner uuid;
  v_loc text;
  v_stamp text := to_char(now(), 'YYYYMMDDHH24MISS');
begin
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
      v_loc := public.user_locale(v_user);
      perform public.enqueue_notification(
        v_user, 'minimum_reached',
        public.tr(v_loc, '🎲 Si gioca! · ', '🎲 Game on! · ') || v_group.name,
        public.tr(v_loc,
          public.fmt_day(v_occ.start_date, v_loc) || ' alle ' || public.fmt_time(v_occ.start_time)
            || ': siete in ' || v_yes || ', il minimo è raggiunto.',
          public.fmt_day(v_occ.start_date, v_loc) || ' at ' || public.fmt_time(v_occ.start_time)
            || ': ' || v_yes || ' of you are in, the minimum is reached.'),
        public.meeting_url(v_occ.group_id, v_occ.original_date),
        'minimum_reached:' || v_occ.id || ':' || v_user || ':' || v_stamp
      );
    end loop;
  elsif v_yes < v_group.min_attendees and v_occ.confirmed_notified then
    update public.occurrences set confirmed_notified = false where id = v_occ.id;
    v_owner := public.group_owner_id(v_group.id);
    v_loc := public.user_locale(v_owner);
    perform public.enqueue_notification(
      v_owner, 'minimum_lost',
      public.tr(v_loc, '⚠️ Sotto il minimo · ', '⚠️ Below the minimum · ') || v_group.name,
      public.tr(v_loc,
        public.fmt_day(v_occ.start_date, v_loc) || ': ora siete in ' || v_yes || ' su un minimo di '
          || v_group.min_attendees || '.',
        public.fmt_day(v_occ.start_date, v_loc) || ': now ' || v_yes || ' are in, the minimum is '
          || v_group.min_attendees || '.'),
      public.meeting_url(v_occ.group_id, v_occ.original_date),
      'minimum_lost:' || v_occ.id || ':' || v_stamp
    );
  end if;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Cambio fisso della ricorrenza
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
  v_loc text;
begin
  if (select created_at from public.groups where id = new.group_id) = now() then
    return null;
  end if;

  select name into v_group from public.groups where id = new.group_id;

  for v_user in select user_id from public.memberships where group_id = new.group_id loop
    continue when v_user = v_actor;
    v_loc := public.user_locale(v_user);
    perform public.enqueue_notification(
      v_user, 'schedule_changed',
      public.tr(v_loc, '📅 Nuovo calendario · ', '📅 New schedule · ') || v_group,
      public.tr(v_loc,
        'Da ora si gioca '
          || case when new.interval_weeks = 1 then 'ogni settimana' else 'ogni ' || new.interval_weeks || ' settimane' end
          || ', alle ' || public.fmt_time(new.start_time) || ', a partire da ' || public.fmt_day(new.anchor_date, v_loc)
          || '. Le presenze dei prossimi incontri sono da rifare.',
        'From now on you play '
          || case when new.interval_weeks = 1 then 'every week' else 'every ' || new.interval_weeks || ' weeks' end
          || ', at ' || public.fmt_time(new.start_time) || ', starting ' || public.fmt_day(new.anchor_date, v_loc)
          || '. Attendance for upcoming meetings needs to be given again.'),
      '/groups/' || new.group_id,
      'schedule_changed:' || new.id || ':' || v_user
    );
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Promemoria giornalieri
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
  v_loc text;
  v_before bigint;
  v_count integer;
begin
  select coalesce(max(id), 0) into v_before from public.notification_queue;

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
          v_loc := public.user_locale(v_user);
          perform public.enqueue_notification(
            v_user, 'min_check_48h',
            '⏳ ' || v_group.name || ' · ' || public.fmt_day(v_m.start_date, v_loc),
            public.tr(v_loc,
              'Tra 2 giorni: siete in ' || v_yes || ' su un minimo di ' || v_group.min_attendees || '.'
                || case when v_user = v_owner then '' else ' Ci sei?' end,
              'In 2 days: ' || v_yes || ' are in, the minimum is ' || v_group.min_attendees || '.'
                || case when v_user = v_owner then '' else ' Are you in?' end),
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
          v_loc := public.user_locale(v_user);
          perform public.enqueue_notification(
            v_user, 'reminder_24h',
            public.tr(v_loc, '🎲 Domani si gioca! · ', '🎲 Game night tomorrow! · ') || v_group.name,
            coalesce(v_m.game || ' · ', '') || public.tr(v_loc, 'alle ', 'at ') || public.fmt_time(v_m.start_time)
              || coalesce(' · ' || v_m.location, ''),
            v_url,
            'reminder_24h:' || v_key || ':' || v_user
          );
        end loop;

        if v_group.min_attendees is not null and v_yes < v_group.min_attendees then
          v_loc := public.user_locale(v_owner);
          perform public.enqueue_notification(
            v_owner, 'owner_min_24h',
            public.tr(v_loc, '⚠️ Manca il minimo per domani · ', '⚠️ Minimum not reached for tomorrow · ') || v_group.name,
            public.tr(v_loc,
              'Siete in ' || v_yes || ' su ' || v_group.min_attendees
                || '. Decidi tu: giocate comunque, saltate o cambiate gioco.',
              v_yes || ' of ' || v_group.min_attendees
                || ' are in. You decide: play anyway, skip or change the game.'),
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
-- Notifica di prova
-- -----------------------------------------------------------------------------
create or replace function public.enqueue_test_notification()
returns void
language sql
security definer
set search_path = ''
as $$
  select public.enqueue_notification(
    (select auth.uid()), 'test',
    public.tr(public.user_locale((select auth.uid())), '🔔 Notifiche attive', '🔔 Notifications on'),
    public.tr(public.user_locale((select auth.uid())),
      'Funziona! Riceverai qui gli avvisi di Schednd.',
      'It works! You''ll get Schednd alerts here.'),
    '/profile',
    'test:' || (select auth.uid()) || ':' || to_char(now(), 'YYYYMMDDHH24MISS')
  );
$$;

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
revoke execute on function
  public.user_locale(uuid),
  public.tr(text, text, text),
  public.fmt_day(date, text)
from public, anon, authenticated;
