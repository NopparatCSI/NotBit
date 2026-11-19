import nextEnv from "@next/env";
import { execFileSync } from "node:child_process";

nextEnv.loadEnvConfig(process.cwd(), true);
const secret = process.env.INDEXER_SECRET || process.env.CRON_SECRET;
const endpoint = process.env.INDEXER_SCHEDULE_URL;
if (!secret || secret.length < 32 || !endpoint || !/^https?:\/\//.test(endpoint)) {
  console.error("Set INDEXER_SCHEDULE_URL to the URL reachable from Supabase and an indexer secret of at least 32 characters.");
  process.exit(1);
}
// Secrets go to psql over stdin, never command-line arguments or console output.
const quote = value => `'${value.replaceAll("'", "''")}'`;
const sql = `do $$ declare item record; begin
  for item in select * from (values ('notbit_indexer_url',${quote(endpoint)}),('notbit_indexer_secret',${quote(secret)})) as v(name,value) loop
    if exists(select 1 from vault.secrets s where s.name=item.name) then
      perform vault.update_secret((select s.id from vault.secrets s where s.name=item.name),item.value);
    else perform vault.create_secret(item.value,item.name); end if;
  end loop;
end; $$;`;
try {
  execFileSync("docker", ["exec", "-i", "supabase_db_game-item-marketplace", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], { input: sql, stdio: ["pipe", "pipe", "pipe"] });
  console.log("OK local indexer URL and bearer secret configured in Vault.");
} catch { console.error("Could not configure the local scheduler. Check Docker and the scheduler migration."); process.exitCode = 1; }
