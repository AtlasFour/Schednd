-- =============================================================================
-- Schednd · 0014 · Limiti sulle richieste di accesso e supporto alle notifiche
-- Da eseguire nel SQL Editor di Supabase dopo 0013_hardening.sql.
--
-- 1. Le richieste di accesso non possono più essere usate per inondare gli
--    amministratori: al massimo 30 nuove richieste all'ora vengono registrate e
--    al massimo 5 avvisi all'ora arrivano a ciascun amministratore.
-- 2. Funzioni di servizio per l'app: id dell'utente da un'email (per bloccare
--    subito chi viene bloccato) ed email di più utenti in una sola lettura.
-- =============================================================================

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
  select status into v_status from public.access_requests where email = v_email;

  if v_status is null then
    -- Troppe richieste nuove nell'ultima ora: si risponde "in attesa" senza
    -- registrare nulla (protezione contro gli script).
    if (select count(*) from public.access_requests
        where first_seen > now() - interval '1 hour' and status = 'pending') >= 30
       and exists (select 1 from public.app_admins) then
      return 'pending';
    end if;
  end if;

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
      -- Al massimo 5 avvisi all'ora: le altre richieste si vedono nella pagina Accessi.
      continue when (
        select count(*) from public.notification_queue
        where user_id = v_admin and kind = 'access_request' and created_at > now() - interval '1 hour'
      ) >= 5;
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

-- Id dell'account con questa email (null se non esiste).
create or replace function public.user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1;
$$;

-- Email di più utenti in una sola lettura (per l'invio delle notifiche).
create or replace function public.user_emails(p_user_ids uuid[])
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select id, email::text from auth.users where id = any (p_user_ids) and email is not null;
$$;

revoke execute on function public.user_id_by_email(text) from public, anon, authenticated;
revoke execute on function public.user_emails(uuid[]) from public, anon, authenticated;
grant execute on function public.user_id_by_email(text) to service_role;
grant execute on function public.user_emails(uuid[]) to service_role;
