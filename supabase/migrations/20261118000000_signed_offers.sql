create function public.get_conversation_wallets(p_conversation_id uuid)
returns table (buyer public.wallet_address, seller public.wallet_address)
language sql stable security definer set search_path = ''
as $$
  select b.wallet, s.wallet from public.conversations c
  join public.users b on b.id = c.buyer_id
  join public.users s on s.id = c.seller_id
  where c.id = p_conversation_id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid());
$$;
revoke all on function public.get_conversation_wallets(uuid) from public, anon, authenticated;
grant execute on function public.get_conversation_wallets(uuid) to authenticated;

-- Serialize offer creation with listing changes and keep signed snapshots immutable.
create function marketplace_private.check_offer_listing()
returns trigger language plpgsql set search_path = ''
as $$
begin
  perform 1 from public.listings where id = new.listing_id and status = 'ACTIVE' for share;
  if not found then raise exception 'Listing is unavailable' using errcode = '23514'; end if;
  if exists (select 1 from public.orders where listing_id = new.listing_id) then
    raise exception 'Listing already funded' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger check_offer_listing before insert on public.offers
  for each row execute function marketplace_private.check_offer_listing();

create table public.funding_attempts (
  id bigint generated always as identity primary key,
  offer_id uuid not null references public.offers(id),
  tx_hash public.hex32 not null,
  created_at timestamptz not null default now(),
  unique (offer_id, tx_hash)
);
alter table public.funding_attempts enable row level security;
revoke all on public.funding_attempts from public, anon, authenticated, service_role;
grant select on public.funding_attempts to authenticated;
grant select, insert on public.funding_attempts to service_role;
grant usage on sequence public.funding_attempts_id_seq to service_role;
create policy view_own_funding_attempts on public.funding_attempts for select to authenticated
  using (offer_id in (select id from public.offers));

alter publication supabase_realtime add table public.offers;
alter publication supabase_realtime add table public.funding_attempts;
