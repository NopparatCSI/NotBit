-- Keep deployment protection enabled. Only the database operator can configure
-- the optional automation credential in Vault; application roles cannot invoke
-- this function or read Vault. An exact origin prevents forwarding it elsewhere.
do $migration$
begin
  if exists (select 1 from pg_extension where extname = 'pg_net') then
    execute $function$
      create or replace function marketplace_private.invoke_indexer()
      returns bigint language plpgsql security invoker set search_path = ''
      as $body$
      declare
        endpoint text;
        bearer text;
        bypass text;
        allowed_origin text;
        request_headers jsonb;
      begin
        select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'notbit_indexer_url';
        select decrypted_secret into bearer from vault.decrypted_secrets where name = 'notbit_indexer_secret';
        if endpoint is null or bearer is null then return null; end if;
        request_headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || bearer);
        select decrypted_secret into bypass from vault.decrypted_secrets where name = 'notbit_vercel_bypass';
        if bypass is not null then
          select decrypted_secret into allowed_origin from vault.decrypted_secrets where name = 'notbit_vercel_origin';
          if allowed_origin is null
            or allowed_origin !~ '^https://[a-zA-Z0-9-]+[.]vercel[.]app$'
            or endpoint <> allowed_origin || '/api/v1/internal/indexer' then
            raise exception 'Indexer protection origin does not match the configured endpoint';
          end if;
          request_headers := request_headers || jsonb_build_object('x-vercel-protection-bypass', bypass);
        end if;
        return net.http_post(url := endpoint, headers := request_headers,
          body := '{}'::jsonb, timeout_milliseconds := 55000);
      end;
      $body$;
    $function$;
    revoke all on function marketplace_private.invoke_indexer() from public, anon, authenticated, service_role;
  end if;
end;
$migration$;
