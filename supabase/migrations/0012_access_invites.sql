-- =============================================================================
-- Schednd · 0012 · Chi arriva da un link d'invito entra senza approvazione
-- Da eseguire nel SQL Editor di Supabase dopo 0011_access_requests.sql.
-- =============================================================================

-- Se il login parte da un link d'invito valido (a un gruppo o da ospite),
-- l'email viene approvata in automatico. Chi è bloccato resta bloccato.
-- Restituisce true se il link è valido.
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
        select 1 from public.guest_invites
        where token = v_match[1] and revoked_at is null
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
