-- Extensions are present on Supabase. Lightweight PostgreSQL test engines without
-- them skip only the scheduling infrastructure, not marketplace migrations.
do $migration$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
    and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_cron;
    create extension if not exists pg_net with schema extensions;
    execute $function$
      create or replace function marketplace_private.invoke_indexer()
      returns bigint language plpgsql security invoker set search_path = ''
      as $body$
      declare endpoint text; bearer text;
      begin
        select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'notbit_indexer_url';
        select decrypted_secret into bearer from vault.decrypted_secrets where name = 'notbit_indexer_secret';
        if endpoint is null or bearer is null then return null; end if;
        return net.http_post(url := endpoint,
          headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || bearer),
          body := '{}'::jsonb, timeout_milliseconds := 55000);
      end;
      $body$;
    $function$;
    revoke all on function marketplace_private.invoke_indexer() from public, anon, authenticated, service_role;
    perform cron.schedule('notbit-indexer', '* * * * *', 'select marketplace_private.invoke_indexer();');
  end if;
end;
$migration$;
