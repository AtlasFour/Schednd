-- =============================================================================
-- Schednd · 0011 · Accesso su approvazione
-- Da eseguire nel SQL Editor di Supabase dopo 0010_telegram_accounts.sql.
--
-- Ogni email che prova ad accedere viene registrata. Entra solo chi è stato
-- approvato da un amministratore dell'app (pagina /admin/accessi). Chi era già
-- registrato prima di questa migrazione resta approvato.
--
-- Dopo averla eseguita, rendi amministratore il tuo account (sostituisci
-- l'email, e lancia questa riga a parte nel SQL Editor):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'la-tua-email@esempio.it';
-- =============================================================================

create table public.app_admins (
  user_id uuid primary key references public.profiles (id) on delete cascade
);

alter table public.app_admins enable row level security;
revoke all on public.app_admins from anon, authenticated;

create table public.access_requests (
  email       text primary key check (email = lower(email)),
  status      text not null default 'pending' check (status in ('pending', 'approved', 'blocked')),
  attempts    integer not null default 1,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid references public.profiles (id) on delete set null
);

alter table public.access_requests enable row level security;
revoke all on public.access_requests from anon, authenticated;

-- Chi è già registrato resta dentro.
insert into public.access_requests (email, status, decided_at)
select lower(email), 'approved', now() from auth.users where email is not null
on conflict (email) do nothing;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- Per il server (solo service_role)
-- -----------------------------------------------------------------------------

-- Registra un tentativo di accesso e restituisce lo stato dell'email.
-- Una nuova richiesta avvisa gli amministratori.
create or replace function public.register_access_attempt(p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_status text;
  v_new boolean;
  v_admin uuid;
  v_loc text;
begin
  insert into public.access_requests (email) values (v_email)
  on conflict (email) do update
    set attempts = public.access_requests.attempts + 1, last_seen = now()
  returning status, (xmax = 0) into v_status, v_new;

  -- Nessun amministratore ancora: per non chiudere fuori nessuno, si entra.
  if not exists (select 1 from public.app_admins) then
    if v_status = 'pending' then
      update public.access_requests set status = 'approved', decided_at = now() where email = v_email;
    end if;
    return case when v_status = 'blocked' then 'blocked' else 'approved' end;
  end if;

  if v_new and v_status = 'pending' then
    for v_admin in select user_id from public.app_admins loop
      v_loc := public.user_locale(v_admin);
      perform public.enqueue_notification(
        v_admin, 'access_request',
        public.tr(v_loc, '🔐 Nuova richiesta di accesso', '🔐 New access request'),
        public.tr(v_loc, v_email || ' vuole entrare in Schednd. Approva o rifiuta.', v_email || ' wants to join Schednd. Approve or decline.'),
        '/admin/accessi',
        'access_request:' || v_email
      );
    end loop;
  end if;
  return v_status;
end;
$$;

revoke execute on function public.register_access_attempt(text) from public, anon, authenticated;
grant execute on function public.register_access_attempt(text) to service_role;

-- -----------------------------------------------------------------------------
-- Per l'utente collegato
-- -----------------------------------------------------------------------------

-- Stato di accesso dell'utente collegato (dopo il login).
create or replace function public.my_access_status()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not exists (select 1 from public.app_admins) then 'approved'
    else coalesce(
      (select status from public.access_requests
       where email = lower((select email from auth.users where id = (select auth.uid())))),
      'pending')
  end;
$$;

-- -----------------------------------------------------------------------------
-- Per gli amministratori
-- -----------------------------------------------------------------------------

create or replace function public.admin_list_access_requests()
returns setof public.access_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo gli amministratori possono gestire gli accessi.';
  end if;
  return query
    select * from public.access_requests
    order by case status when 'pending' then 0 when 'approved' then 1 else 2 end, last_seen desc;
end;
$$;

-- Imposta lo stato di un'email ('approved', 'blocked' o 'pending'); se non
-- c'è ancora la crea (per approvare qualcuno in anticipo).
create or replace function public.admin_set_access(p_email text, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if not public.is_app_admin() then
    raise exception 'Solo gli amministratori possono gestire gli accessi.';
  end if;
  if p_status not in ('approved', 'blocked', 'pending') then
    raise exception 'Stato non valido.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Indirizzo email non valido.';
  end if;
  insert into public.access_requests (email, status, attempts, decided_at, decided_by)
  values (v_email, p_status, 0, now(), (select auth.uid()))
  on conflict (email) do update
    set status = excluded.status, decided_at = now(), decided_by = excluded.decided_by;
end;
$$;

create or replace function public.admin_delete_access(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Solo gli amministratori possono gestire gli accessi.';
  end if;
  delete from public.access_requests where email = lower(btrim(p_email));
end;
$$;
