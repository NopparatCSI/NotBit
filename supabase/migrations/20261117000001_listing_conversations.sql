create function public.open_listing_conversation(p_listing_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  buyer uuid;
  seller uuid;
  room uuid;
begin
  select id into buyer from public.get_marketplace_viewer() where role = 'USER';
  if buyer is null then
    raise exception 'A trading account is required' using errcode = '42501';
  end if;

  -- Existing rooms stay available after a listing is paused or sold.
  select id into room from public.conversations where listing_id = p_listing_id and buyer_id = buyer;
  if room is not null then return room; end if;

  select seller_id into seller from public.listings
    where id = p_listing_id and status = 'ACTIVE' for share;
  if seller is null then return null; end if;
  if buyer = seller then
    raise exception 'Cannot open a conversation on your own listing' using errcode = '23514';
  end if;

  insert into public.conversations (listing_id, buyer_id, seller_id)
    values (p_listing_id, buyer, seller)
    on conflict (listing_id, buyer_id) do nothing returning id into room;
  if room is null then
    select id into room from public.conversations where listing_id = p_listing_id and buyer_id = buyer;
  end if;
  return room;
end;
$$;

revoke all on function public.open_listing_conversation(uuid) from public, anon, authenticated;
grant execute on function public.open_listing_conversation(uuid) to authenticated;

create policy view_listing_in_buyer_conversation on public.listings for select to authenticated
  using (exists (
    select 1 from public.conversations
    where listing_id = listings.id and buyer_id = (select auth.uid())
  ));

grant insert (id, conversation_id, sender_id, kind, body) on public.messages to authenticated;

create policy send_own_conversation_message on public.messages for insert to authenticated
  with check (
    kind = 'USER'
    and body ~ '[^[:space:]]'
    and sender_id = (select id from public.get_marketplace_viewer() where role = 'USER')
    and conversation_id in (select id from public.conversations)
  );

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;
