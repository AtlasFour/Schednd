-- =============================================================================
-- Schednd · 0016 · Orario dei promemoria per gruppo
-- Da eseguire nel SQL Editor di Supabase dopo 0015_revoke_anon.sql.
--
-- Ogni gruppo sceglie a che ora partono i promemoria ("tra 2 giorni",
-- "domani si gioca!" e i riepiloghi nelle chat di gruppo). Perché funzionino
-- orari diversi dalla mattina, il controllo deve girare ogni ora: vedi
-- supabase/setup/hourly-cron.sql.
-- =============================================================================

alter table public.groups
  add column if not exists reminder_hour smallint not null default 9
  check (reminder_hour between 0 and 23);

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
    -- Promemoria solo dall'ora scelta per il gruppo (nel suo fuso orario).
    -- Il controllo gira ogni ora: le chiavi di deduplica evitano i doppioni.
    continue when extract(hour from now() at time zone v_group.timezone) < v_group.reminder_hour;
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

revoke execute on function public.run_daily_notifications() from public, anon, authenticated;
grant execute on function public.run_daily_notifications() to service_role;
