-- =============================================================================
-- Schednd · Migrazione 0003 · Proposte e voto
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede la 0001 e la 0002.
--
-- Una proposta riguarda sempre un singolo incontro e ha una o più opzioni
-- (date o giochi). Ognuno spunta tutte le opzioni che gli vanno bene
-- (voto per approvazione). L'esito dipende dalla regola del gruppo.
-- =============================================================================

create type public.proposal_type as enum ('reschedule', 'skip', 'change_game');
create type public.proposal_status as enum ('open', 'needs_owner', 'approved', 'rejected', 'cancelled');

create table public.proposals (
  id                 uuid primary key default gen_random_uuid(),
  occurrence_id      uuid not null references public.occurrences (id) on delete cascade,
  type               public.proposal_type not null,
  reason             text check (char_length(reason) <= 500),
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  closes_at          timestamptz not null,
  status             public.proposal_status not null default 'open',
  winning_option_id  uuid,
  decided_at         timestamptz
);

-- Una sola proposta aperta per tipo e per incontro.
create unique index proposals_one_open_per_type
  on public.proposals (occurrence_id, type) where status in ('open', 'needs_owner');
create index proposals_occurrence_idx on public.proposals (occurrence_id);

create table public.proposal_options (
  id              uuid primary key default gen_random_uuid(),
  proposal_id     uuid not null references public.proposals (id) on delete cascade,
  position        smallint not null,
  new_start_date  date,
  new_start_time  time,
  game_title      text check (char_length(game_title) <= 120),
  unique (proposal_id, position)
);

alter table public.proposals
  add constraint proposals_winning_option_fk
  foreign key (winning_option_id) references public.proposal_options (id) on delete set null;

-- Una "scheda" per votante: le opzioni che gli vanno bene (vuota = nessuna).
create table public.ballots (
  proposal_id  uuid not null references public.proposals (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  option_ids   uuid[] not null default '{}',
  updated_at   timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

create trigger ballots_touch before update on public.ballots
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Permessi
-- -----------------------------------------------------------------------------
create or replace function public.proposal_group_id(p_proposal_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select o.group_id
  from public.proposals p
  join public.occurrences o on o.id = p.occurrence_id
  where p.id = p_proposal_id;
$$;

alter table public.proposals enable row level security;
alter table public.proposal_options enable row level security;
alter table public.ballots enable row level security;

create policy proposals_select on public.proposals for select to authenticated
  using (public.is_group_member(public.occurrence_group_id(occurrence_id)));
create policy proposal_options_select on public.proposal_options for select to authenticated
  using (public.is_group_member(public.proposal_group_id(proposal_id)));
create policy ballots_select on public.ballots for select to authenticated
  using (public.is_group_member(public.proposal_group_id(proposal_id)));

revoke all on public.proposals, public.proposal_options, public.ballots from anon;

-- -----------------------------------------------------------------------------
-- Applica l'esito di una proposta approvata.
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

  -- Proposte che non hanno più senso: dopo un salto tutte le altre,
  -- dopo un cambio data un eventuale salto in corso.
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

    -- Le presenze ripartono da zero: chi ha votato la data scelta resta presente.
    delete from public.attendances where occurrence_id = v_p.occurrence_id;
    insert into public.attendances (occurrence_id, user_id, status)
    select v_p.occurrence_id, b.user_id, 'yes'
    from public.ballots b
    where b.proposal_id = p_proposal_id and p_option_id = any (b.option_ids);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Voti per opzione, contando solo i membri attuali del gruppo.
-- Con p_attendees_only = true restituisce solo le opzioni votate da TUTTI
-- quelli segnati presenti all'incontro.
-- -----------------------------------------------------------------------------
create or replace function public.proposal_option_votes(
  p_proposal_id uuid,
  p_attendees_only boolean default false
)
returns table (option_id uuid, votes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with p as (
    select pr.id, pr.occurrence_id, o.group_id
    from public.proposals pr
    join public.occurrences o on o.id = pr.occurrence_id
    where pr.id = p_proposal_id
  ),
  valid_ballots as (
    select b.user_id, b.option_ids
    from public.ballots b
    join p on p.id = b.proposal_id
    join public.memberships m on m.user_id = b.user_id and m.group_id = p.group_id
  )
  select o.id, (
    select count(*)::integer from valid_ballots vb where o.id = any (vb.option_ids)
  )
  from public.proposal_options o
  join p on p.id = o.proposal_id
  where not p_attendees_only
     or not exists (
       select 1 from public.attendances a
       where a.occurrence_id = p.occurrence_id and a.status = 'yes'
         and not exists (
           select 1 from valid_ballots vb
           where vb.user_id = a.user_id and o.id = any (vb.option_ids)
         )
     );
$$;

-- -----------------------------------------------------------------------------
-- Valuta una proposta aperta secondo la regola del gruppo e, se l'esito è
-- già certo (o il voto è scaduto), la chiude.
-- -----------------------------------------------------------------------------
create or replace function public.evaluate_proposal(p_proposal_id uuid)
returns public.proposal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p public.proposals;
  v_rule public.approval_rule;
  v_group_id uuid;
  v_due boolean;
  v_eligible integer;
  v_voted integer;
  v_remaining integer;
  v_top_id uuid;
  v_top integer := 0;
  v_second integer := 0;
  v_attendees integer;
  v_attendees_voted integer;
  v_pass_count integer;
begin
  select * into v_p from public.proposals where id = p_proposal_id for update;
  if v_p.status <> 'open' then
    return v_p.status;
  end if;

  select g.approval_rule, g.id into v_rule, v_group_id
  from public.occurrences o join public.groups g on g.id = o.group_id
  where o.id = v_p.occurrence_id;

  v_due := now() >= v_p.closes_at;

  if v_rule = 'owner_decides' then
    -- Decide l'owner; se non lo fa entro la scadenza la proposta decade.
    if v_due then
      update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
      return 'rejected';
    end if;
    return 'open';
  end if;

  -- Voti per opzione (per "skip" c'è un'unica opzione: "sì, saltiamo").
  select option_id, votes into v_top_id, v_top
  from public.proposal_option_votes(p_proposal_id) order by votes desc, option_id limit 1;
  select coalesce((
    select votes from public.proposal_option_votes(p_proposal_id)
    order by votes desc, option_id offset 1 limit 1
  ), 0) into v_second;

  select count(*) into v_eligible from public.memberships where group_id = v_group_id;
  select count(*) into v_voted from public.ballots b
  join public.memberships m on m.user_id = b.user_id and m.group_id = v_group_id
  where b.proposal_id = p_proposal_id;
  v_remaining := greatest(v_eligible - v_voted, 0);

  if v_rule = 'majority' then
    -- Vince l'opzione votata da più della metà degli aventi diritto.
    if v_top * 2 > v_eligible and v_top > v_second + v_remaining then
      perform public.apply_proposal(p_proposal_id, v_top_id);
      return 'approved';
    end if;

    if v_due or v_remaining = 0 then
      if v_top * 2 > v_eligible then
        if v_top = v_second then
          update public.proposals set status = 'needs_owner' where id = p_proposal_id;
          return 'needs_owner';
        end if;
        perform public.apply_proposal(p_proposal_id, v_top_id);
        return 'approved';
      end if;
      update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
      return 'rejected';
    end if;

    -- Nessuna opzione può più arrivare alla maggioranza.
    if (v_top + v_remaining) * 2 <= v_eligible then
      update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
      return 'rejected';
    end if;

    return 'open';
  end if;

  -- Unanimità dei presenti: un'opzione passa se la votano tutti quelli che
  -- hanno detto "ci sono" all'incontro.
  select count(*) into v_attendees from public.attendances
  where occurrence_id = v_p.occurrence_id and status = 'yes';

  select count(*) into v_attendees_voted
  from public.attendances a
  join public.ballots b on b.user_id = a.user_id and b.proposal_id = p_proposal_id
  where a.occurrence_id = v_p.occurrence_id and a.status = 'yes';

  -- Si decide alla scadenza, oppure prima se tutti i presenti hanno votato.
  if not v_due and (v_attendees = 0 or v_attendees_voted < v_attendees) then
    return 'open';
  end if;

  select count(*) into v_pass_count from public.proposal_option_votes(p_proposal_id, true);

  if v_attendees = 0 or v_pass_count = 0 then
    if v_due then
      update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
      return 'rejected';
    end if;
    return 'open';
  end if;

  select option_id, votes into v_top_id, v_top
  from public.proposal_option_votes(p_proposal_id, true) order by votes desc, option_id limit 1;
  select coalesce((
    select votes from public.proposal_option_votes(p_proposal_id, true)
    order by votes desc, option_id offset 1 limit 1
  ), -1) into v_second;

  if v_top = v_second then
    update public.proposals set status = 'needs_owner' where id = p_proposal_id;
    return 'needs_owner';
  end if;

  perform public.apply_proposal(p_proposal_id, v_top_id);
  return 'approved';
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: crea una proposta.
-- p_options: per "reschedule" [{"date":"2026-11-20","time":"21:00"}, ...];
--            per "change_game" [{"game":"Catan"}, ...]; per "skip" [].
-- -----------------------------------------------------------------------------
create or replace function public.create_proposal(
  p_group_id       uuid,
  p_original_date  date,
  p_type           public.proposal_type,
  p_options        jsonb default '[]'::jsonb,
  p_reason         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_tz text;
  v_occ public.occurrences;
  v_closes_at timestamptz;
  v_proposal_id uuid;
  v_opt jsonb;
  v_pos integer := 0;
  v_date date;
  v_time time;
  v_game text;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;

  select timezone into v_tz from public.groups where id = p_group_id;
  v_occ := public.ensure_occurrence(p_group_id, p_original_date);

  if v_occ.status = 'skipped' then
    raise exception 'L''incontro è già stato saltato.';
  end if;

  v_closes_at := ((v_occ.start_date + v_occ.start_time) at time zone v_tz) - interval '24 hours';
  if now() >= v_closes_at then
    raise exception 'Mancano meno di 24 ore all''incontro: non si possono più fare proposte.';
  end if;

  if exists (
    select 1 from public.proposals
    where occurrence_id = v_occ.id and type = p_type and status in ('open', 'needs_owner')
  ) then
    raise exception 'C''è già una proposta di questo tipo in corso per questo incontro.';
  end if;

  if p_type <> 'skip' then
    if jsonb_typeof(p_options) <> 'array' or jsonb_array_length(p_options) = 0 then
      raise exception 'Aggiungi almeno un''opzione.';
    end if;
    if jsonb_array_length(p_options) > 6 then
      raise exception 'Puoi proporre al massimo 6 opzioni.';
    end if;
  end if;

  insert into public.proposals (occurrence_id, type, reason, created_by, closes_at)
  values (v_occ.id, p_type, nullif(btrim(p_reason), ''), v_user, v_closes_at)
  returning id into v_proposal_id;

  if p_type = 'skip' then
    insert into public.proposal_options (proposal_id, position) values (v_proposal_id, 0);
  else
    for v_opt in select * from jsonb_array_elements(p_options) loop
      if p_type = 'reschedule' then
        v_date := (v_opt ->> 'date')::date;
        v_time := (v_opt ->> 'time')::time;
        if v_date is null or v_time is null then
          raise exception 'Ogni data proposta deve avere giorno e orario.';
        end if;
        if ((v_date + v_time) at time zone v_tz) <= now() then
          raise exception 'Le date proposte devono essere nel futuro.';
        end if;
        if v_date = v_occ.start_date and v_time = v_occ.start_time then
          raise exception 'Una delle date proposte coincide con quella attuale.';
        end if;
        insert into public.proposal_options (proposal_id, position, new_start_date, new_start_time)
        values (v_proposal_id, v_pos, v_date, v_time);
      else
        v_game := nullif(btrim(v_opt ->> 'game'), '');
        if v_game is null then
          raise exception 'Ogni gioco proposto deve avere un nome.';
        end if;
        insert into public.proposal_options (proposal_id, position, game_title)
        values (v_proposal_id, v_pos, left(v_game, 120));
      end if;
      v_pos := v_pos + 1;
    end loop;
  end if;

  -- Chi propone vota per tutte le sue opzioni (può cambiare il voto dopo).
  insert into public.ballots (proposal_id, user_id, option_ids)
  select v_proposal_id, v_user, coalesce(array_agg(id), '{}')
  from public.proposal_options where proposal_id = v_proposal_id;

  perform public.evaluate_proposal(v_proposal_id);
  return v_proposal_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: vota (sostituisce il voto precedente). Lista vuota = nessuna opzione.
-- -----------------------------------------------------------------------------
create or replace function public.cast_vote(p_proposal_id uuid, p_option_ids uuid[])
returns public.proposal_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_group_id uuid := public.proposal_group_id(p_proposal_id);
  v_status public.proposal_status;
  v_closes_at timestamptz;
begin
  if v_group_id is null or not public.is_group_member(v_group_id) then
    raise exception 'Non puoi votare questa proposta.';
  end if;

  select status, closes_at into v_status, v_closes_at
  from public.proposals where id = p_proposal_id;
  if v_status not in ('open', 'needs_owner') then
    raise exception 'La votazione è chiusa.';
  end if;
  if now() >= v_closes_at then
    perform public.evaluate_proposal(p_proposal_id);
    raise exception 'La votazione è chiusa.';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_option_ids, '{}')) as x(id)
    where not exists (
      select 1 from public.proposal_options o where o.id = x.id and o.proposal_id = p_proposal_id
    )
  ) then
    raise exception 'Opzione non valida.';
  end if;

  insert into public.ballots (proposal_id, user_id, option_ids)
  values (p_proposal_id, v_user, coalesce(p_option_ids, '{}'))
  on conflict (proposal_id, user_id) do update set option_ids = excluded.option_ids;

  -- Un pareggio può sbloccarsi se qualcuno cambia voto prima della scadenza.
  if v_status = 'needs_owner' then
    update public.proposals set status = 'open' where id = p_proposal_id;
  end if;

  return public.evaluate_proposal(p_proposal_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: decisione dell'owner (regola "decide l'owner" o pareggio).
-- p_option_id null = respinge la proposta.
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
begin
  if v_group_id is null or not public.is_group_owner(v_group_id) then
    raise exception 'Solo l''owner può decidere.';
  end if;
  select status into v_status from public.proposals where id = p_proposal_id;
  if v_status not in ('open', 'needs_owner') then
    raise exception 'La proposta è già chiusa.';
  end if;

  if p_option_id is null then
    update public.proposals set status = 'rejected', decided_at = now() where id = p_proposal_id;
  else
    perform public.apply_proposal(p_proposal_id, p_option_id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: annulla una proposta (chi l'ha creata o l'owner).
-- -----------------------------------------------------------------------------
create or replace function public.cancel_proposal(p_proposal_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group_id uuid := public.proposal_group_id(p_proposal_id);
begin
  if v_group_id is null or not (
    public.is_group_owner(v_group_id)
    or exists (select 1 from public.proposals where id = p_proposal_id and created_by = (select auth.uid()))
  ) then
    raise exception 'Solo chi ha fatto la proposta o l''owner può annullarla.';
  end if;

  update public.proposals set status = 'cancelled', decided_at = now()
  where id = p_proposal_id and status in ('open', 'needs_owner');
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: chiude le proposte scadute nei miei gruppi. L'app la chiama prima di
-- mostrare gli incontri (in attesa dei controlli programmati della fase 5).
-- -----------------------------------------------------------------------------
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
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Le presenze contano per la regola "unanimità dei presenti": quando
-- cambiano, si rivalutano le proposte aperte dell'incontro.
-- -----------------------------------------------------------------------------
create or replace function public.attendance_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  for v_id in
    select id from public.proposals
    where occurrence_id = coalesce(new.occurrence_id, old.occurrence_id) and status = 'open'
  loop
    perform public.evaluate_proposal(v_id);
  end loop;
  return null;
end;
$$;

-- Le presenze inserite da apply_proposal non devono rivalutare in ricorsione:
-- a quel punto la proposta è già chiusa, quindi il ciclo non trova nulla.
create trigger attendances_reevaluate
  after insert or update or delete on public.attendances
  for each row execute function public.attendance_changed();

-- -----------------------------------------------------------------------------
-- Permessi sulle funzioni
-- -----------------------------------------------------------------------------
revoke execute on function
  public.proposal_group_id(uuid),
  public.proposal_option_votes(uuid, boolean),
  public.apply_proposal(uuid, uuid),
  public.evaluate_proposal(uuid),
  public.create_proposal(uuid, date, public.proposal_type, jsonb, text),
  public.cast_vote(uuid, uuid[]),
  public.decide_proposal(uuid, uuid),
  public.cancel_proposal(uuid),
  public.close_due_proposals(),
  public.attendance_changed()
from public, anon;

grant execute on function
  public.proposal_group_id(uuid),
  public.create_proposal(uuid, date, public.proposal_type, jsonb, text),
  public.cast_vote(uuid, uuid[]),
  public.decide_proposal(uuid, uuid),
  public.cancel_proposal(uuid),
  public.close_due_proposals()
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.proposals, public.ballots;
  end if;
end;
$$;
