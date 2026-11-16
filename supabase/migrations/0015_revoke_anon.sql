-- =============================================================================
-- Schednd · 0015 · Protezione in più: la chiave pubblica (anon) non può
-- chiamare nessuna funzione del database.
-- Da eseguire nel SQL Editor di Supabase dopo 0014_access_limits.sql.
--
-- La chiave anon è visibile nel browser per come funziona Supabase. Le tabelle
-- erano già protette e le funzioni controllavano già chi le chiama; questo
-- toglie anche la possibilità di provarci. Gli utenti collegati
-- (authenticated) e il server (service_role) mantengono esattamente i
-- permessi che avevano.
-- =============================================================================

do $$
declare
  f record;
  v_auth boolean;
  v_service boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (  -- funzioni delle estensioni escluse
        select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e'
      )
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    v_auth := has_function_privilege('authenticated', f.oid, 'execute');
    v_service := has_function_privilege('service_role', f.oid, 'execute');
    execute format('revoke execute on function %s from public, anon', f.sig);
    -- Togliendo il permesso a "public" non si devono perdere quelli degli altri ruoli.
    if v_auth then
      execute format('grant execute on function %s to authenticated', f.sig);
    end if;
    if v_service then
      execute format('grant execute on function %s to service_role', f.sig);
    end if;
  end loop;
end;
$$;

-- Anche le funzioni create in futuro non saranno chiamabili con la chiave anon
-- (né tramite il ruolo generale "public", da cui anon eredita i permessi).
-- Gli utenti collegati e il server continuano a riceverle come prima.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;
alter default privileges in schema public grant execute on functions to authenticated, service_role;
