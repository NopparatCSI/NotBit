create function public.mark_staff_transaction_failed(p_chain integer,p_escrow text,p_hash text)
returns void language plpgsql security invoker set search_path=''
as $$
declare item public.staff_transactions;
begin
  update public.staff_transactions set status='FAILED',updated_at=now()
    where chain_id=p_chain and escrow_address=lower(p_escrow) and tx_hash=lower(p_hash) and status<>'CONFIRMED'
    returning * into item;
  if not found then return; end if;
  insert into public.audit_logs(staff_id,order_id,action,details,dedupe_key)
    values(item.staff_id,item.order_id,'TRANSACTION_FAILED',item.payload,
      p_chain||':'||lower(p_escrow)||':'||lower(p_hash)||':FAILED') on conflict(dedupe_key) do nothing;
end;
$$;
revoke all on function public.mark_staff_transaction_failed(integer,text,text) from public,anon,authenticated;
grant execute on function public.mark_staff_transaction_failed(integer,text,text) to service_role;
