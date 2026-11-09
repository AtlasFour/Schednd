-- =============================================================================
-- Schednd · Migrazione 0004 · Ospiti "una tantum"
--
-- Come applicarla: Supabase → SQL Editor → New query → incolla tutto → Run.
-- Richiede le migrazioni 0001–0003.
--
-- Un ospite è un utente registrato invitato a UN SOLO incontro tramite link.
-- Vede solo quell'incontro, segna la presenza (che conta nel minimo) e vota
-- le proposte di quell'incontro. Non vede il resto del gruppo.
-- =============================================================================

-- Link d'invito per ospiti: uno attivo per incontro, riutilizzabile da più
-- persone, valido fino al giorno dell'incontro. Rigenerarlo revoca il vecchio.
create table public.guest_invites (
  id             uuid primary key default gen_random_uuid(),
  occurrence_id  uuid not null references public.occurrences (id) on delete cascade,
  token          text not null unique
                   default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz
);

create unique index guest_invites_one_active
  on public.guest_invites (occurrence_id) where revoked_at is null;

create table public.occurrence_guests (
  occurrence_id  uuid not null references public.occurrences (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  invite_id      uuid references public.guest_invites (id) on delete set null,
  joined_at      timestamptz not null default now(),
  primary key (occurrence_id, user_id)
);

create index occurrence_guests_user_idx on public.occurrence_guests (user_id);

-- -----------------------------------------------------------------------------
-- Funzioni di supporto per i permessi
-- -----------------------------------------------------------------------------
create or replace function public.is_occurrence_guest(p_occurrence_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.occurrence_guests
    where occurrence_id = p_occurrence_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.proposal_occurrence_id(p_proposal_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select occurrence_id from public.proposals where id = p_proposal_id;
$$;

-- Posso vedere il profilo di p_user_id se: siamo nello stesso gruppo, oppure
-- è ospite di un incontro di un mio gruppo, oppure io sono ospite di un
-- incontro a cui partecipa anche lui (come membro del gruppo o come ospite).
create or replace function public.can_see_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
    or public.shares_group_with(p_user_id)
    or exists (
      select 1
      from public.occurrence_guests g
      join public.occurrences o on o.id = g.occurrence_id
      where g.user_id = p_user_id and public.is_group_member(o.group_id)
    )
    or exists (
      select 1
      from public.occurrence_guests mine
      join public.occurrences o on o.id = mine.occurrence_id
      where mine.user_id = (select auth.uid())
        and (
          exists (select 1 from public.memberships m where m.group_id = o.group_id and m.user_id = p_user_id)
          or exists (select 1 from public.occurrence_guests g where g.occurrence_id = o.id and g.user_id = p_user_id)
        )
    );
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.guest_invites enable row level security;
alter table public.occurrence_guests enable row level security;

create policy guest_invites_select on public.guest_invites for select to authenticated
  using (public.is_group_member(public.occurrence_group_id(occurrence_id)));

create policy occurrence_guests_select on public.occurrence_guests for select to authenticated
  using (
    public.is_group_member(public.occurrence_group_id(occurrence_id))
    or public.is_occurrence_guest(occurrence_id)
  );

-- Gli ospiti leggono il loro incontro, le presenze e le proposte.
create policy occurrences_select_guest on public.occurrences for select to authenticated
  using (public.is_occurrence_guest(id));
create policy attendances_select_guest on public.attendances for select to authenticated
  using (public.is_occurrence_guest(occurrence_id));
create policy proposals_select_guest on public.proposals for select to authenticated
  using (public.is_occurrence_guest(occurrence_id));
create policy proposal_options_select_guest on public.proposal_options for select to authenticated
  using (public.is_occurrence_guest(public.proposal_occurrence_id(proposal_id)));
create policy ballots_select_guest on public.ballots for select to authenticated
  using (public.is_occurrence_guest(public.proposal_occurrence_id(proposal_id)));

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));

revoke all on public.guest_invites, public.occurrence_guests from anon;

-- -----------------------------------------------------------------------------
-- RPC: link ospite di un incontro (lo crea se non esiste). Solo membri.
-- -----------------------------------------------------------------------------
create or replace function public.get_guest_invite(p_group_id uuid, p_original_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ public.occurrences;
  v_token text;
  v_today date;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;

  select (now() at time zone timezone)::date into v_today from public.groups where id = p_group_id;
  v_occ := public.ensure_occurrence(p_group_id, p_original_date);
  if v_occ.start_date < v_today then
    raise exception 'Questo incontro è già passato.';
  end if;

  select token into v_token from public.guest_invites
  where occurrence_id = v_occ.id and revoked_at is null;

  if v_token is null then
    insert into public.guest_invites (occurrence_id, created_by)
    values (v_occ.id, (select auth.uid()))
    on conflict do nothing;
    select token into v_token from public.guest_invites
    where occurrence_id = v_occ.id and revoked_at is null;
  end if;

  return v_token;
end;
$$;

-- Revoca il link attuale e ne crea uno nuovo. Solo membri.
create or replace function public.regenerate_guest_invite(p_group_id uuid, p_original_date date)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ_id uuid;
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'Non fai parte di questo gruppo.';
  end if;
  select id into v_occ_id from public.occurrences
  where group_id = p_group_id and original_date = p_original_date;
  update public.guest_invites set revoked_at = now()
  where occurrence_id = v_occ_id and revoked_at is null;
  return public.get_guest_invite(p_group_id, p_original_date);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: anteprima del link ospite (per la pagina d'invito).
-- -----------------------------------------------------------------------------
create or replace function public.get_guest_invite_preview(p_token text)
returns table (
  group_id uuid,
  group_name text,
  original_date date,
  start_date date,
  start_time time,
  game text,
  location text,
  mode public.group_mode,
  skipped boolean,
  invited_by text,
  is_member boolean,
  is_guest boolean,
  expired boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    o.original_date,
    o.start_date,
    o.start_time,
    coalesce(o.game_title_override, g.default_game_title),
    coalesce(o.location_override, g.default_location),
    g.mode,
    o.status = 'skipped',
    (select p.display_name from public.profiles p where p.id = i.created_by),
    exists (select 1 from public.memberships m where m.group_id = g.id and m.user_id = (select auth.uid())),
    exists (select 1 from public.occurrence_guests og where og.occurrence_id = o.id and og.user_id = (select auth.uid())),
    o.start_date < (now() at time zone g.timezone)::date
  from public.guest_invites i
  join public.occurrences o on o.id = i.occurrence_id
  join public.groups g on g.id = o.group_id
  where i.token = btrim(p_token) and i.revoked_at is null;
$$;

-- -----------------------------------------------------------------------------
-- RPC: accetta l'invito come ospite. Restituisce gruppo e data dell'incontro.
-- -----------------------------------------------------------------------------
create or replace function public.accept_guest_invite(p_token text)
returns table (group_id uuid, original_date date)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_invite public.guest_invites;
  v_occ public.occurrences;
  v_tz text;
begin
  if v_user is null then
    raise exception 'Devi aver fatto l''accesso.';
  end if;

  select * into v_invite from public.guest_invites
  where token = btrim(p_token) and revoked_at is null;
  if not found then
    raise exception 'Il link non è valido o è stato sostituito.';
  end if;

  select * into v_occ from public.occurrences where id = v_invite.occurrence_id;
  select timezone into v_tz from public.groups where id = v_occ.group_id;
  if v_occ.start_date < (now() at time zone v_tz)::date then
    raise exception 'L''incontro è già passato.';
  end if;

  -- Chi è già membro del gruppo non diventa ospite.
  if not public.is_group_member(v_occ.group_id) then
    insert into public.occurrence_guests (occurrence_id, user_id, invite_id)
    values (v_occ.id, v_user, v_invite.id)
    on conflict (occurrence_id, user_id) do nothing;
  end if;

  return query select v_occ.group_id, v_occ.original_date;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: rimuove un ospite (l'owner, oppure l'ospite stesso). Toglie anche la
-- sua presenza e i suoi voti per quell'incontro.
-- -----------------------------------------------------------------------------
create or replace function public.remove_guest(p_group_id uuid, p_original_date date, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_occ_id uuid;
begin
  select id into v_occ_id from public.occurrences
  where group_id = p_group_id and original_date = p_original_date;

  if v_occ_id is null then
    raise exception 'Incontro non trovato.';
  end if;
  if not (public.is_group_owner(p_group_id) or p_user_id = (select auth.uid())) then
    raise exception 'Solo l''owner può rimuovere un ospite.';
  end if;

  delete from public.ballots b
  using public.proposals p
  where p.id = b.proposal_id and p.occurrence_id = v_occ_id and b.user_id = p_user_id;
  delete from public.attendances where occurrence_id = v_occ_id and user_id = p_user_id;
  delete from public.occurrence_guests where occurrence_id = v_occ_id and user_id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: l'owner aggiunge un ospite come membro del gruppo.
-- -----------------------------------------------------------------------------
create or replace function public.promote_guest(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può aggiungere membri.';
  end if;
  if not exists (
    select 1 from public.occurrence_guests g
    join public.occurrences o on o.id = g.occurrence_id
    where o.group_id = p_group_id and g.user_id = p_user_id
  ) then
    raise exception 'Questa persona non è ospite di un incontro del gruppo.';
  end if;

  insert into public.memberships (group_id, user_id, role)
  values (p_group_id, p_user_id, 'member')
  on conflict (group_id, user_id) do nothing;

  delete from public.occurrence_guests g
  using public.occurrences o
  where o.id = g.occurrence_id and o.group_id = p_group_id and g.user_id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: dati del gruppo e partecipanti per chi è ospite di un incontro.
-- (Gli ospiti non leggono direttamente gruppo e membri.)
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

-- -----------------------------------------------------------------------------
-- RPC: incontri in cui sono ospite (per la home).
-- -----------------------------------------------------------------------------
create or replace function public.my_guest_meetings()
returns table (
  group_id uuid,
  group_name text,
  original_date date,
  start_date date,
  start_time time,
  skipped boolean,
  game text,
  my_status public.attendance_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, o.original_date, o.start_date, o.start_time,
         o.status = 'skipped',
         coalesce(o.game_title_override, g.default_game_title),
         a.status
  from public.occurrence_guests og
  join public.occurrences o on o.id = og.occurrence_id
  join public.groups g on g.id = o.group_id
  left join public.attendances a on a.occurrence_id = o.id and a.user_id = og.user_id
  where og.user_id = (select auth.uid())
    and o.start_date >= (now() at time zone g.timezone)::date
  order by o.start_date, o.start_time;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni esistenti aggiornate per gli ospiti: possono segnare la presenza
-- e votare, e contano tra gli aventi diritto al voto.
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
  if not (
    public.is_group_member(p_group_id)
    or exists (
      select 1 from public.occurrences o
      where o.group_id = p_group_id and o.original_date = p_original_date
        and public.is_occurrence_guest(o.id)
    )
  ) then
    raise exception 'Non partecipi a questo incontro.';
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
    where exists (
      select 1 from public.memberships m where m.user_id = b.user_id and m.group_id = p.group_id
    ) or exists (
      select 1 from public.occurrence_guests g where g.user_id = b.user_id and g.occurrence_id = p.occurrence_id
    )
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

  -- Aventi diritto: membri del gruppo + ospiti dell'incontro.
  select
    (select count(*) from public.memberships where group_id = v_group_id)
    + (select count(*) from public.occurrence_guests where occurrence_id = v_p.occurrence_id)
  into v_eligible;
  select count(*) into v_voted from public.ballots b
  where b.proposal_id = p_proposal_id
    and (
      exists (select 1 from public.memberships m where m.user_id = b.user_id and m.group_id = v_group_id)
      or exists (select 1 from public.occurrence_guests g where g.user_id = b.user_id and g.occurrence_id = v_p.occurrence_id)
    );
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
  if v_group_id is null or not (
    public.is_group_member(v_group_id)
    or public.is_occurrence_guest(public.proposal_occurrence_id(p_proposal_id))
  ) then
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
-- Permessi sulle funzioni
-- -----------------------------------------------------------------------------
revoke execute on function
  public.is_occurrence_guest(uuid),
  public.proposal_occurrence_id(uuid),
  public.can_see_profile(uuid),
  public.get_guest_invite(uuid, date),
  public.regenerate_guest_invite(uuid, date),
  public.get_guest_invite_preview(text),
  public.accept_guest_invite(text),
  public.remove_guest(uuid, date, uuid),
  public.promote_guest(uuid, uuid),
  public.get_guest_context(uuid, date),
  public.my_guest_meetings()
from public, anon;

grant execute on function
  public.is_occurrence_guest(uuid),
  public.proposal_occurrence_id(uuid),
  public.can_see_profile(uuid),
  public.get_guest_invite(uuid, date),
  public.regenerate_guest_invite(uuid, date),
  public.get_guest_invite_preview(text),
  public.accept_guest_invite(text),
  public.remove_guest(uuid, date, uuid),
  public.promote_guest(uuid, uuid),
  public.get_guest_context(uuid, date),
  public.my_guest_meetings()
to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.occurrence_guests;
  end if;
end;
$$;
