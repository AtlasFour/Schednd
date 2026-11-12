-- =============================================================================
-- Schednd · 0013 · Correzioni di sicurezza e di logica sulle proposte
-- Da eseguire nel SQL Editor di Supabase dopo 0012_access_invites.sql.
--
-- 1. Le funzioni interne delle proposte non si possono più chiamare
--    direttamente dagli utenti (prima si poteva "far vincere" una proposta).
-- 2. Una proposta già chiusa non può essere applicata una seconda volta, e uno
--    spostamento a una data ormai passata non viene applicato.
-- 3. Le proposte di cambio data chiudono il voto almeno 24 ore prima della
--    data proposta più vicina (non solo di quella originale).
-- 4. I pareggi non decisi decadono all'inizio dell'incontro, e l'owner non può
--    più decidere dopo.
-- 5. I link ospite approvano l'accesso solo per incontri non ancora passati.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permessi
-- -----------------------------------------------------------------------------
revoke execute on function
  public.apply_proposal(uuid, uuid),
  public.evaluate_proposal(uuid),
  public.proposal_option_votes(uuid, boolean)
from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. apply_proposal: solo proposte ancora aperte, niente date passate
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
  v_tz text;
begin
  -- La riga resta bloccata fino alla fine: due decisioni contemporanee non
  -- possono applicare due opzioni diverse.
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if not found or v_p.status not in ('open', 'needs_owner') then
    raise exception 'La proposta è già chiusa.';
  end if;

  if v_p.type <> 'skip' then
    select * into v_opt from public.proposal_options
    where id = p_option_id and proposal_id = p_proposal_id;
    if not found then
      raise exception 'Opzione non valida.';
    end if;
  end if;

  if v_p.type = 'reschedule' then
    select g.timezone into v_tz
    from public.occurrences o join public.groups g on g.id = o.group_id
    where o.id = v_p.occurrence_id;
    if ((v_opt.new_start_date + v_opt.new_start_time) at time zone v_tz) <= now() then
      -- La data proposta è già passata: non ha senso spostare l'incontro lì.
      update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
      return;
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

revoke execute on function public.apply_proposal(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. Scadenza del voto per i cambi di data
-- -----------------------------------------------------------------------------
-- Il voto chiude 24 ore prima della data più vicina tra quella originale e
-- quelle proposte (ma lasciando almeno 2 ore per votare, se possibile).
create or replace function public.proposal_option_deadline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz text;
  v_option_deadline timestamptz;
begin
  if new.new_start_date is null or new.new_start_time is null then
    return null;
  end if;
  select g.timezone into v_tz
  from public.proposals p
  join public.occurrences o on o.id = p.occurrence_id
  join public.groups g on g.id = o.group_id
  where p.id = new.proposal_id;

  v_option_deadline := ((new.new_start_date + new.new_start_time) at time zone v_tz) - interval '24 hours';
  update public.proposals
  set closes_at = greatest(least(closes_at, v_option_deadline), least(closes_at, now() + interval '2 hours'))
  where id = new.proposal_id and type = 'reschedule';
  return null;
end;
$$;

drop trigger if exists proposal_options_deadline on public.proposal_options;
create trigger proposal_options_deadline
  after insert on public.proposal_options
  for each row execute function public.proposal_option_deadline();

-- -----------------------------------------------------------------------------
-- 4. Pareggi: decadono all'inizio dell'incontro
-- -----------------------------------------------------------------------------
create or replace function public.decide_proposal(p_proposal_id uuid, p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := public.proposal_group_id(p_proposal_id);
  v_status public.proposal_status;
  v_started boolean;
begin
  if v_group_id is null or not public.is_group_owner(v_group_id) then
    raise exception 'Solo l''owner può decidere.';
  end if;

  select p.status, ((o.start_date + o.start_time) at time zone g.timezone) <= now()
  into v_status, v_started
  from public.proposals p
  join public.occurrences o on o.id = p.occurrence_id
  join public.groups g on g.id = o.group_id
  where p.id = p_proposal_id
  for update of p;

  if v_status not in ('open', 'needs_owner') or v_started then
    raise exception 'La proposta è già chiusa.';
  end if;

  if p_option_id is null then
    update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
  else
    perform public.apply_proposal(p_proposal_id, p_option_id);
  end if;
end;
$$;

create or replace function public.close_due_proposals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  for v_id in
    select p.id
    from public.proposals p
    join public.occurrences o on o.id = p.occurrence_id
    where p.status = 'open' and p.closes_at <= now()
      and public.is_group_member(o.group_id)
  loop
    perform public.evaluate_proposal(v_id);
    v_count := v_count + 1;
  end loop;

  -- Pareggi che l'owner non ha deciso prima dell'incontro: decadono.
  update public.proposals p
  set status = 'rejected', decided_at = now()
  from public.occurrences o join public.groups g on g.id = o.group_id
  where o.id = p.occurrence_id
    and p.status = 'needs_owner'
    and ((o.start_date + o.start_time) at time zone g.timezone) <= now()
    and public.is_group_member(o.group_id);

  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Link ospite: solo per incontri non ancora passati
-- -----------------------------------------------------------------------------
create or replace function public.approve_invited_access(p_email text, p_path text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_match text[];
  v_valid boolean := false;
begin
  v_match := regexp_match(coalesce(p_path, ''), '^/join/([A-Za-z0-9]+)');
  if v_match is not null then
    v_valid := exists (
      select 1 from public.groups
      where invite_code = upper(v_match[1]) and status <> 'archived'
    );
  else
    v_match := regexp_match(coalesce(p_path, ''), '^/ospite/([^/?#]+)');
    if v_match is not null then
      v_valid := exists (
        select 1
        from public.guest_invites i
        join public.occurrences o on o.id = i.occurrence_id
        join public.groups g on g.id = o.group_id
        where i.token = v_match[1] and i.revoked_at is null
          and o.start_date >= (now() at time zone g.timezone)::date
      );
    end if;
  end if;

  if not v_valid then
    return false;
  end if;

  insert into public.access_requests (email, status, attempts, decided_at)
  values (v_email, 'approved', 0, now())
  on conflict (email) do update
    set status = 'approved', decided_at = now()
    where public.access_requests.status = 'pending';
  return true;
end;
$$;

revoke execute on function public.approve_invited_access(text, text) from public, anon, authenticated;
grant execute on function public.approve_invited_access(text, text) to service_role;
