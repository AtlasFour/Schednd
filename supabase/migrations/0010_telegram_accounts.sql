-- =============================================================================
-- Schednd · 0010 · Account Telegram personali
-- Da eseguire nel SQL Editor di Supabase dopo 0009_group_channels.sql.
--
-- Ogni utente può collegare il proprio account Telegram (dal profilo): così
-- può segnare la presenza e votare le proposte con i pulsanti del bot nelle
-- chat di gruppo, e ricevere gli avvisi anche in privato dal bot.
-- =============================================================================

create table public.telegram_accounts (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  telegram_user_id   text not null unique,
  telegram_username  text,
  private_chat_id    text,
  notify_private     boolean not null default true,
  linked_at          timestamptz not null default now()
);

alter table public.telegram_accounts enable row level security;
revoke all on public.telegram_accounts from anon, authenticated;
grant select on public.telegram_accounts to authenticated;

create policy "telegram_accounts: ognuno vede il proprio"
  on public.telegram_accounts for select to authenticated
  using (user_id = (select auth.uid()));

create table public.telegram_account_codes (
  code        text primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  expires_at  timestamptz not null default now() + interval '1 hour'
);

alter table public.telegram_account_codes enable row level security;
revoke all on public.telegram_account_codes from anon, authenticated;

-- Pulsanti (Telegram "inline keyboard") da allegare ai messaggi in coda.
alter table public.channel_outbox add column reply_markup jsonb;

-- La funzione di prelievo restituisce anche i pulsanti e il gruppo.
drop function public.claim_channel_posts(integer);
create function public.claim_channel_posts(p_limit integer default 100)
returns table (
  id bigint, kind text, title text, body text, url text,
  provider text, chat_id text, locale text, reply_markup jsonb
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
  select c.id, c.kind, c.title, c.body, c.url, ch.provider, ch.chat_id, ch.locale, c.reply_markup
  from claimed c join public.group_channels ch on ch.id = c.channel_id
  order by c.id;
$$;

revoke execute on function public.claim_channel_posts(integer) from public, anon, authenticated;
grant execute on function public.claim_channel_posts(integer) to service_role;

-- -----------------------------------------------------------------------------
-- Funzioni per l'utente collegato
-- -----------------------------------------------------------------------------

create or replace function public.create_telegram_account_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
begin
  if v_user is null then
    raise exception 'Accesso richiesto.';
  end if;
  delete from public.telegram_account_codes where expires_at < now() or user_id = v_user;
  insert into public.telegram_account_codes (code, user_id) values (v_code, v_user);
  return v_code;
end;
$$;

create or replace function public.set_telegram_private_notifications(p_on boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.telegram_accounts set notify_private = coalesce(p_on, false)
  where user_id = (select auth.uid());
$$;

-- Scollega l'account (restituisce la chat privata, per salutare).
create or replace function public.unlink_telegram_account()
returns text
language sql
security definer
set search_path = ''
as $$
  delete from public.telegram_accounts where user_id = (select auth.uid())
  returning private_chat_id;
$$;

-- -----------------------------------------------------------------------------
-- Funzioni per il bot (solo service_role)
-- -----------------------------------------------------------------------------

-- Collega l'account Telegram che ha mandato il codice. Restituisce il nome
-- dell'utente su Schednd (null se il codice non è valido o è scaduto).
create or replace function public.link_telegram_account(
  p_code text, p_telegram_user_id text, p_username text, p_private_chat_id text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_name text;
begin
  delete from public.telegram_account_codes
  where code = p_code and expires_at > now()
  returning user_id into v_user;
  if v_user is null then
    return null;
  end if;

  -- Un account Telegram vale per un solo utente: il collegamento più recente vince.
  delete from public.telegram_accounts where telegram_user_id = p_telegram_user_id and user_id <> v_user;
  insert into public.telegram_accounts (user_id, telegram_user_id, telegram_username, private_chat_id)
  values (v_user, p_telegram_user_id, left(p_username, 64), p_private_chat_id)
  on conflict (user_id) do update
    set telegram_user_id = excluded.telegram_user_id,
        telegram_username = excluded.telegram_username,
        private_chat_id = excluded.private_chat_id,
        linked_at = now();

  select display_name into v_name from public.profiles where id = v_user;
  return coalesce(v_name, '');
end;
$$;

-- Le azioni dal bot valgono come fatte dall'utente collegato: le funzioni
-- usate dall'app (presenze, voti) controllano i permessi con auth.uid().
create or replace function public.telegram_act_as(p_telegram_user_id text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.telegram_accounts where telegram_user_id = p_telegram_user_id;
  if v_user is null then
    raise exception 'Account Telegram non collegato.';
  end if;
  perform set_config('request.jwt.claim.sub', v_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  return v_user;
end;
$$;

-- Presenza da un pulsante del bot (la nota già scritta resta).
create or replace function public.telegram_set_attendance(
  p_telegram_user_id text, p_group_id uuid, p_original_date date, p_status public.attendance_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_act_as(p_telegram_user_id);
  v_note text;
begin
  select a.note into v_note
  from public.attendances a join public.occurrences o on o.id = a.occurrence_id
  where o.group_id = p_group_id and o.original_date = p_original_date and a.user_id = v_user;
  perform public.set_attendance(p_group_id, p_original_date, p_status, v_note);
end;
$$;

-- Voto da un pulsante del bot: aggiunge o toglie l'opzione in quella posizione
-- (posizione null = "nessuna mi va bene"). Restituisce le opzioni scelte.
create or replace function public.telegram_toggle_vote(
  p_telegram_user_id text, p_proposal_id uuid, p_position integer
)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := public.telegram_act_as(p_telegram_user_id);
  v_current uuid[];
  v_option uuid;
  v_next uuid[];
begin
  select option_ids into v_current from public.ballots
  where proposal_id = p_proposal_id and user_id = v_user;
  v_current := coalesce(v_current, '{}');

  if p_position is null then
    v_next := '{}';
  else
    select id into v_option from public.proposal_options
    where proposal_id = p_proposal_id and position = p_position;
    if v_option is null then
      raise exception 'Opzione non valida.';
    end if;
    v_next := case when v_option = any (v_current)
      then array_remove(v_current, v_option)
      else array_append(v_current, v_option) end;
  end if;

  perform public.cast_vote(p_proposal_id, v_next);
  return v_next;
end;
$$;

revoke execute on function public.link_telegram_account(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.telegram_act_as(text) from public, anon, authenticated;
revoke execute on function public.telegram_set_attendance(text, uuid, date, public.attendance_status) from public, anon, authenticated;
revoke execute on function public.telegram_toggle_vote(text, uuid, integer) from public, anon, authenticated;
grant execute on function public.link_telegram_account(text, text, text, text) to service_role;
grant execute on function public.telegram_act_as(text) to service_role;
grant execute on function public.telegram_set_attendance(text, uuid, date, public.attendance_status) to service_role;
grant execute on function public.telegram_toggle_vote(text, uuid, integer) to service_role;
