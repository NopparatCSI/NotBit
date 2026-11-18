ALTER TABLE "public"."orders"
  DROP CONSTRAINT "orders_chain_id_escrow_address_listing_id_key";

CREATE UNIQUE INDEX orders_canonical_listing_idx ON public.orders USING btree (chain_id, escrow_address, listing_id)
  WHERE on_chain;
