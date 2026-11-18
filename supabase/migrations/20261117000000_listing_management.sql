alter table public.listings add column item_type text
  check (char_length(item_type) between 1 and 80);

grant insert (seller_id, game_slug, title, description, quantity, region, delivery_method, price_wei, item_type)
  on public.listings to authenticated;
grant update (game_slug, title, description, quantity, region, delivery_method, price_wei, item_type, status)
  on public.listings to authenticated;

create policy create_own_listing on public.listings for insert to authenticated
  with check (
    status = 'ACTIVE'
    and seller_id = (select id from public.get_marketplace_viewer() where role = 'USER')
  );

create policy update_own_open_listing on public.listings for update to authenticated
  using (
    status in ('ACTIVE', 'PAUSED')
    and seller_id = (select id from public.get_marketplace_viewer() where role = 'USER')
  )
  with check (
    status in ('ACTIVE', 'PAUSED')
    and seller_id = (select id from public.get_marketplace_viewer() where role = 'USER')
  );
