-- =============================================================================
-- Schednd · Controllo delle notifiche ogni ora (facoltativo, consigliato)
--
-- Il piano gratuito di Vercel fa partire il controllo automatico solo una volta
-- al giorno (la mattina). Con questo script è Supabase a chiamarlo ogni ora,
-- così i promemoria partono all'ora scelta in ogni gruppo.
--
-- Prima di eseguirlo sostituisci, qui sotto, solo:
--   INCOLLA_QUI_IL_CRON_SECRET  → il valore della variabile CRON_SECRET su Vercel
--   https://schednd.vercel.app  → l'indirizzo del tuo sito, se è diverso
-- Non incollare il segreto in nessuna chat: resta solo qui, nel database
-- (cifrato nel Vault di Supabase).
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Il segreto viene salvato cifrato (se esiste già, viene aggiornato).
do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'schednd_cron_secret';
  if v_id is null then
    perform vault.create_secret('INCOLLA_QUI_IL_CRON_SECRET', 'schednd_cron_secret');
  else
    perform vault.update_secret(v_id, 'INCOLLA_QUI_IL_CRON_SECRET');
  end if;
end;
$$;

-- Ogni ora, al minuto 5.
select cron.schedule(
  'schednd-notifiche-orarie',
  '5 * * * *',
  $job$
  select net.http_get(
    url := 'https://schednd.vercel.app/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'schednd_cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $job$
);

-- Per controllare che giri: select * from cron.job_run_details order by start_time desc limit 5;
-- Per toglierlo:            select cron.unschedule('schednd-notifiche-orarie');
