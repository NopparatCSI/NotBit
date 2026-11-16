-- Supabase Auth may return only the subject for Web3 identities. The verified
-- Ethereum provider ID is available independently of optional identity metadata.
create or replace function marketplace_private.provision_wallet_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  verified_wallet text := substring(lower(new.provider_id) from '^web3:ethereum:(0x[0-9a-f]{40})$');
begin
  if new.provider = 'web3'
    and verified_wallet is not null
    and verified_wallet <> '0x0000000000000000000000000000000000000000'
  then
    insert into public.users (id, wallet) values (new.user_id, verified_wallet)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

-- Provision users who already signed in while Auth omitted the metadata fields.
with candidates as (
  select user_id, created_at, provider_id,
    substring(lower(provider_id) from '^web3:ethereum:(0x[0-9a-f]{40})$') as wallet
  from auth.identities
  where provider = 'web3'
), wallets as (
  select distinct on (user_id) user_id, created_at, wallet
  from candidates
  where wallet is not null and wallet <> '0x0000000000000000000000000000000000000000'
  order by user_id, created_at, provider_id
)
insert into public.users (id, wallet)
  select user_id, wallet
  from wallets
  order by created_at, user_id
  on conflict do nothing;
