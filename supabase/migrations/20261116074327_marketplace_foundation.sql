create schema if not exists marketplace_private;
revoke all on schema marketplace_private from public;
grant usage on schema marketplace_private to authenticated;

create domain public.wallet_address as text
  check (value ~ '^0x[0-9a-f]{40}$' and value <> '0x0000000000000000000000000000000000000000');
create domain public.hex32 as text check (value ~ '^0x[0-9a-f]{64}$');
-- Store decimal text so PostgREST never rounds wei when serializing JSON.
create domain public.positive_wei as text
  check (case when value ~ '^[1-9][0-9]{0,77}$' then
    value::numeric <= 115792089237316195423570985008687907853269984665640564039457584007913129639935
    else false end);
create type public.marketplace_role as enum ('USER', 'ADMIN', 'SUPER_ADMIN');
create type public.listing_status as enum ('ACTIVE', 'PAUSED', 'SOLD');
create type public.offer_status as enum ('OPEN', 'FUNDED', 'EXPIRED');
create type public.order_status as enum ('FUNDED', 'DELIVERED', 'IN_REVIEW', 'RELEASED', 'REFUNDED');
create type public.evidence_stage as enum ('DELIVERY', 'RECEIPT', 'DISPUTE');

create table public.users (
  id uuid primary key references auth.users (id),
  wallet public.wallet_address not null unique,
  display_name text check (char_length(display_name) between 1 and 80),
  created_at timestamptz not null default now()
);

create table public.staff_wallets (
  wallet public.wallet_address primary key,
  role public.marketplace_role not null check (role <> 'USER'),
  created_at timestamptz not null default now()
);

create table public.games (
  slug text primary key check (slug ~ '^[a-z0-9-]+$'),
  name text not null,
  category text not null
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.users (id),
  game_slug text not null references public.games (slug),
  title text not null check (char_length(title) between 1 and 120),
  description text not null,
  quantity integer not null check (quantity > 0),
  region text not null,
  delivery_method text not null,
  price_wei public.positive_wei not null,
  image_path text,
  status public.listing_status not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  unique (id, seller_id)
);
create index listings_market_idx on public.listings (game_slug, created_at desc) where status = 'ACTIVE';
create index listings_seller_idx on public.listings (seller_id);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null,
  buyer_id uuid not null references public.users (id),
  seller_id uuid not null,
  created_at timestamptz not null default now(),
  check (buyer_id <> seller_id),
  foreign key (listing_id, seller_id) references public.listings (id, seller_id),
  unique (listing_id, buyer_id),
  unique (id, listing_id, buyer_id, seller_id)
);
create index conversations_buyer_idx on public.conversations (buyer_id);
create index conversations_seller_idx on public.conversations (seller_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id),
  sender_id uuid references public.users (id),
  kind text not null check (kind in ('USER', 'SYSTEM')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  check ((kind = 'USER') = (sender_id is not null))
);
create index messages_thread_idx on public.messages (conversation_id, created_at, id);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null,
  listing_id uuid not null,
  buyer_id uuid not null,
  seller_id uuid not null,
  chain_id integer not null check (chain_id in (11155111, 31337)),
  escrow_address public.wallet_address not null,
  chain_order_id public.hex32 not null,
  chain_listing_id public.hex32 not null,
  amount_wei public.positive_wei not null,
  agreement jsonb not null check (jsonb_typeof(agreement) = 'object'),
  agreement_hash public.hex32 not null,
  seller_signature text not null check (seller_signature ~ '^0x[0-9a-fA-F]{130}$'),
  status public.offer_status not null default 'OPEN',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  check (expires_at > created_at and expires_at <= created_at + interval '30 minutes'),
  foreign key (conversation_id, listing_id, buyer_id, seller_id)
    references public.conversations (id, listing_id, buyer_id, seller_id),
  unique (chain_id, escrow_address, chain_order_id),
  unique (id, listing_id, chain_id, escrow_address)
);
create index offers_thread_idx on public.offers (conversation_id);

create table public.orders (
  id uuid primary key,
  listing_id uuid not null,
  chain_id integer not null,
  escrow_address public.wallet_address not null,
  status public.order_status not null,
  deadline timestamptz not null,
  funded_at timestamptz not null,
  updated_at timestamptz not null default now(),
  foreign key (id, listing_id, chain_id, escrow_address)
    references public.offers (id, listing_id, chain_id, escrow_address),
  unique (chain_id, escrow_address, listing_id)
);
create index orders_review_idx on public.orders (status, deadline);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id),
  submitted_by uuid not null references public.users (id),
  stage public.evidence_stage not null,
  object_path text not null unique,
  file_hash public.hex32 not null,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
create index evidence_order_idx on public.evidence (order_id, created_at);

create table public.disputes (
  order_id uuid primary key references public.orders (id),
  opened_by uuid references public.users (id),
  reason text,
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users (id),
  refund_buyer boolean,
  decision_reason text,
  decision_hash public.hex32,
  resolved_at timestamptz,
  check (
    (resolved_at is null and resolved_by is null and refund_buyer is null and decision_reason is null and decision_hash is null)
    or (resolved_at is not null and resolved_by is not null and refund_buyer is not null
      and length(btrim(decision_reason)) > 0 and decision_reason is not null and decision_hash is not null)
  )
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  staff_id uuid not null references public.users (id),
  order_id uuid references public.orders (id),
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_order_idx on public.audit_logs (order_id, created_at);

create table public.chain_events (
  chain_id integer not null,
  escrow_address public.wallet_address not null,
  tx_hash public.hex32 not null,
  log_index integer not null check (log_index >= 0),
  block_number bigint not null check (block_number >= 0),
  block_hash public.hex32 not null,
  event_name text not null,
  payload jsonb not null,
  primary key (chain_id, escrow_address, tx_hash, log_index)
);
create index chain_events_block_idx on public.chain_events (chain_id, escrow_address, block_number);

create table public.chain_checkpoints (
  chain_id integer not null,
  escrow_address public.wallet_address not null,
  block_number bigint not null check (block_number >= 0),
  block_hash public.hex32 not null,
  primary key (chain_id, escrow_address)
);

-- This trigger reads the provider's identity rather than editable auth.users metadata.
create function marketplace_private.provision_wallet_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  verified_wallet text := lower(new.identity_data ->> 'address');
begin
  if new.provider = 'web3'
    and new.identity_data ->> 'chain' = 'ethereum'
    and lower(new.provider_id) = ('web3:ethereum:' || verified_wallet)
    and verified_wallet ~ '^0x[0-9a-f]{40}$'
    and verified_wallet <> '0x0000000000000000000000000000000000000000'
  then
    insert into public.users (id, wallet) values (new.user_id, verified_wallet)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function marketplace_private.provision_wallet_user() from public;
create trigger provision_marketplace_wallet
  after insert on auth.identities for each row
  execute function marketplace_private.provision_wallet_user();

-- Also provision Ethereum identities created before the migration.
insert into public.users (id, wallet)
  select distinct on (user_id) user_id, lower(identity_data ->> 'address')
  from auth.identities
  where provider = 'web3' and identity_data ->> 'chain' = 'ethereum'
    and lower(provider_id) = ('web3:ethereum:' || lower(identity_data ->> 'address'))
    and lower(identity_data ->> 'address') ~ '^0x[0-9a-f]{40}$'
    and lower(identity_data ->> 'address') <> '0x0000000000000000000000000000000000000000'
  order by user_id, created_at, provider_id
  on conflict (id) do nothing;

create function public.get_marketplace_viewer()
returns table (id uuid, wallet public.wallet_address, role public.marketplace_role)
language sql stable security invoker set search_path = ''
as $$
  select u.id, u.wallet, coalesce(s.role, 'USER'::public.marketplace_role)
  from public.users as u left join public.staff_wallets as s on s.wallet = u.wallet
  where u.id = (select auth.uid());
$$;
revoke all on function public.get_marketplace_viewer() from public, anon, authenticated;
grant execute on function public.get_marketplace_viewer() to authenticated;

create function marketplace_private.is_staff()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.get_marketplace_viewer()
    where role in ('ADMIN', 'SUPER_ADMIN')
  );
$$;
revoke all on function marketplace_private.is_staff() from public;
grant execute on function marketplace_private.is_staff() to authenticated;

alter table public.users enable row level security;
alter table public.staff_wallets enable row level security;
alter table public.games enable row level security;
alter table public.listings enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.offers enable row level security;
alter table public.orders enable row level security;
alter table public.evidence enable row level security;
alter table public.disputes enable row level security;
alter table public.audit_logs enable row level security;
alter table public.chain_events enable row level security;
alter table public.chain_checkpoints enable row level security;

revoke all on public.users, public.staff_wallets, public.games, public.listings, public.conversations,
  public.messages, public.offers, public.orders, public.evidence, public.disputes, public.audit_logs,
  public.chain_events, public.chain_checkpoints from public, anon, authenticated, service_role;
grant select on public.games, public.listings to anon, authenticated;
grant select on public.users, public.staff_wallets, public.conversations, public.messages,
  public.offers, public.orders, public.disputes, public.audit_logs to authenticated;
grant select, update (display_name) on public.users to service_role;
grant select, insert, update on public.games, public.listings, public.conversations,
  public.offers, public.orders, public.disputes, public.chain_checkpoints to service_role;
grant select, insert on public.messages, public.evidence, public.audit_logs to service_role;
grant select, insert, delete on public.chain_events to service_role;
grant usage on sequence public.audit_logs_id_seq to service_role;

create policy own_profile on public.users for select to authenticated
  using (id = (select auth.uid()));
create policy own_staff_role on public.staff_wallets for select to authenticated
  using (wallet in (select u.wallet from public.users as u where u.id = (select auth.uid())));
create policy browse_games on public.games for select to anon, authenticated using (true);
create policy browse_active_listings on public.listings for select to anon, authenticated using (status = 'ACTIVE');
create policy view_owned_listings on public.listings for select to authenticated using (seller_id = (select auth.uid()));
create policy view_conversation on public.conversations for select to authenticated
  using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));
create policy view_messages on public.messages for select to authenticated
  using (conversation_id in (select id from public.conversations));
create policy view_offers on public.offers for select to authenticated
  using (conversation_id in (select id from public.conversations));
create policy view_orders on public.orders for select to authenticated
  using (id in (select id from public.offers) or (select marketplace_private.is_staff()));
-- Evidence is delivered by the API so staff reads can be audited before issuing a signed URL.
create policy view_disputes on public.disputes for select to authenticated
  using (order_id in (select id from public.orders));
create policy view_audit_logs on public.audit_logs for select to authenticated
  using ((select marketplace_private.is_staff()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('listing-images', 'listing-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('order-evidence', 'order-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']);
