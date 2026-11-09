-- =============================================================================
-- Schednd · 0009 · Avvisi nei gruppi esterni (bot Telegram)
-- Da eseguire nel SQL Editor di Supabase dopo 0008_single_events_calendar.sql.
--
-- Un gruppo Schednd può essere collegato a una chat di gruppo Telegram: il bot
-- vi scrive gli avvisi scelti dall'owner (proposte, esiti, cambi, "si gioca!",
-- promemoria). Il collegamento avviene con un codice monouso che l'owner manda
-- al bot dalla chat (link "aggiungi a un gruppo" di Telegram).
-- =============================================================================

-- Chat esterne collegate (una per gruppo e servizio).
create table public.group_channels (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  provider    text not null default 'telegram' check (provider in ('telegram')),
  chat_id     text not null,
  chat_title  text,
  locale      text not null default 'it' check (locale in ('it', 'en')),
  -- Categorie di avvisi da inviare.
  events      text[] not null default array['proposals', 'outcomes', 'changes', 'game_on', 'reminders'],
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (group_id, provider)
);

create index group_channels_chat_idx on public.group_channels (provider, chat_id);

alter table public.group_channels enable row level security;
revoke all on public.group_channels from anon, authenticated;
grant select on public.group_channels to authenticated;

-- Solo l'owner vede il collegamento (le modifiche passano dalle funzioni sotto).
create policy "group_channels: l'owner legge"
  on public.group_channels for select to authenticated
  using (public.is_group_owner(group_id));

-- Codici monouso per collegare una chat (validi 1 ora).
create table public.channel_link_codes (
  code        text primary key,
  group_id    uuid not null references public.groups (id) on delete cascade,
  created_by  uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '1 hour'
);

alter table public.channel_link_codes enable row level security;
revoke all on public.channel_link_codes from anon, authenticated;

-- Messaggi da inviare nelle chat collegate.
create table public.channel_outbox (
  id          bigint generated always as identity primary key,
  channel_id  uuid not null references public.group_channels (id) on delete cascade,
  kind        text not null,
  title       text not null,
  body        text not null,
  url         text not null default '/',
  event_key   text not null,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  attempts    integer not null default 0,
  sent_at     timestamptz,
  unique (channel_id, event_key)
);

create index channel_outbox_pending_idx on public.channel_outbox (id) where sent_at is null;

alter table public.channel_outbox enable row level security;
revoke all on public.channel_outbox from anon, authenticated;

-- Categoria di avviso di una notifica (null = non va nelle chat di gruppo:
-- avvisi personali come i promemoria "non hai risposto" o quelli solo per l'owner).
create or replace function public.channel_category(p_kind text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_kind = 'proposal_created' then 'proposals'
    when p_kind in ('proposal_approved', 'proposal_rejected') then 'outcomes'
    when p_kind in ('occurrence_skipped', 'occurrence_restored', 'occurrence_moved',
                    'extra_meeting', 'extra_meeting_deleted', 'schedule_changed') then 'changes'
    when p_kind = 'minimum_reached' then 'game_on'
    else null
  end;
$$;

-- Ogni avviso messo in coda per i membri finisce anche (una volta sola) nelle
-- chat collegate al gruppo. I testi degli avvisi non sono personali; si usa
-- quello nella lingua scelta per la chat, se c'è.
create or replace function public.mirror_to_channels()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text := public.channel_category(new.kind);
  v_group uuid;
  v_match text[];
  v_channel public.group_channels;
  v_key text;
  v_same_locale boolean;
begin
  if v_category is null then
    return null;
  end if;
  v_match := regexp_match(new.url, '^/groups/([0-9a-f-]{36})');
  if v_match is null then
    return null;
  end if;
  v_group := v_match[1]::uuid;
  -- Tutte le righe dello stesso evento nascono nella stessa transazione.
  v_key := new.kind || ':' || new.url || ':' || txid_current();

  for v_channel in
    select * from public.group_channels
    where group_id = v_group and v_category = any (events)
  loop
    v_same_locale := public.user_locale(new.user_id) = v_channel.locale;
    insert into public.channel_outbox (channel_id, kind, title, body, url, event_key)
    values (v_channel.id, new.kind, new.title, new.body, new.url, v_key)
    on conflict (channel_id, event_key) do update
      set title = excluded.title, body = excluded.body
      where v_same_locale;
  end loop;
  return null;
end;
$$;

create trigger notification_queue_mirror
  after insert on public.notification_queue
  for each row execute function public.mirror_to_channels();

-- -----------------------------------------------------------------------------
-- Funzioni per l'owner
-- -----------------------------------------------------------------------------

-- Nuovo codice per collegare una chat al gruppo.
create or replace function public.create_channel_link_code(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può collegare una chat.';
  end if;
  delete from public.channel_link_codes where expires_at < now() or group_id = p_group_id;
  insert into public.channel_link_codes (code, group_id, created_by)
  values (v_code, p_group_id, (select auth.uid()));
  return v_code;
end;
$$;

-- Avvisi da inviare nella chat collegata.
create or replace function public.set_channel_events(p_group_id uuid, p_events text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare la chat collegata.';
  end if;
  update public.group_channels
  set events = array(
    select distinct e from unnest(p_events) e
    where e in ('proposals', 'outcomes', 'changes', 'game_on', 'reminders')
  )
  where group_id = p_group_id;
end;
$$;

-- Lingua dei messaggi nella chat collegata.
create or replace function public.set_channel_locale(p_group_id uuid, p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare la chat collegata.';
  end if;
  update public.group_channels set locale = case when p_locale = 'en' then 'en' else 'it' end
  where group_id = p_group_id;
end;
$$;

-- Scollega la chat (restituisce l'id della chat, per salutare).
create or replace function public.unlink_channel(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_chat text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare la chat collegata.';
  end if;
  delete from public.group_channels where group_id = p_group_id returning chat_id into v_chat;
  return v_chat;
end;
$$;

-- Messaggio di prova nella chat collegata.
create or replace function public.enqueue_channel_test(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_channel public.group_channels;
  v_name text;
begin
  if not public.is_group_owner(p_group_id) then
    raise exception 'Solo l''owner può modificare la chat collegata.';
  end if;
  select * into v_channel from public.group_channels where group_id = p_group_id;
  if not found then
    raise exception 'Nessuna chat collegata.';
  end if;
  select name into v_name from public.groups where id = p_group_id;
  insert into public.channel_outbox (channel_id, kind, title, body, url, event_key)
  values (
    v_channel.id, 'test',
    public.tr(v_channel.locale, '🔔 Prova · ', '🔔 Test · ') || v_name,
    public.tr(v_channel.locale,
      'Funziona! Qui arriveranno gli avvisi del gruppo.',
      'It works! Group alerts will show up here.'),
    '/groups/' || p_group_id,
    'test:' || gen_random_uuid()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni per il server (solo service_role: bot e invio)
-- -----------------------------------------------------------------------------

-- Collega la chat che ha mandato il codice. Restituisce il nome del gruppo
-- (null se il codice non è valido o è scaduto).
create or replace function public.link_channel(
  p_code text, p_provider text, p_chat_id text, p_chat_title text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.channel_link_codes;
  v_name text;
begin
  delete from public.channel_link_codes
  where code = p_code and expires_at > now()
  returning * into v_link;
  if not found then
    return null;
  end if;

  insert into public.group_channels (group_id, provider, chat_id, chat_title, locale, created_by)
  values (
    v_link.group_id, p_provider, p_chat_id, left(p_chat_title, 120),
    coalesce(public.user_locale(v_link.created_by), 'it'), v_link.created_by
  )
  on conflict (group_id, provider) do update
    set chat_id = excluded.chat_id, chat_title = excluded.chat_title, created_by = excluded.created_by;

  select name into v_name from public.groups where id = v_link.group_id;
  return v_name;
end;
$$;

create or replace function public.claim_channel_posts(p_limit integer default 100)
returns table (
  id bigint, kind text, title text, body text, url text,
  provider text, chat_id text, locale text
)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.channel_outbox q
    set claimed_at = now(), attempts = q.attempts + 1
    where q.id in (
      select o.id from public.channel_outbox o
      where o.sent_at is null
        and o.attempts < 3
        and o.created_at > now() - interval '3 days'
        and (o.claimed_at is null or o.claimed_at < now() - interval '5 minutes')
      order by o.id
      limit p_limit
      for update skip locked
    )
    returning q.*
  )
  select c.id, c.kind, c.title, c.body, c.url, ch.provider, ch.chat_id, ch.locale
  from claimed c join public.group_channels ch on ch.id = c.channel_id
  order by c.id;
$$;

revoke execute on function public.link_channel(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_channel_posts(integer) from public, anon, authenticated;
revoke execute on function public.mirror_to_channels() from public, anon, authenticated;
grant execute on function public.link_channel(text, text, text, text) to service_role;
grant execute on function public.claim_channel_posts(integer) to service_role;
