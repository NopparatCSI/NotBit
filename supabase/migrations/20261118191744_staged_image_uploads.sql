insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('upload-staging','upload-staging',false,10485760,array['image/jpeg','image/png','image/webp']);

create table public.upload_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id),
  purpose text not null check(purpose in ('listing','evidence','chat')),
  scope_id uuid,
  object_path text not null unique,
  content_type text not null check(content_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 10485760),
  file_hash public.hex32 not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '15 minutes',
  consumed_at timestamptz
);
create index upload_tickets_user_recent_idx on public.upload_tickets(user_id,created_at);
create index upload_tickets_cleanup_idx on public.upload_tickets(expires_at);
alter table public.upload_tickets enable row level security;
revoke all on public.upload_tickets from public,anon,authenticated,service_role;
grant select,insert,update,delete on public.upload_tickets to service_role;

create function public.reserve_upload_ticket(p_user uuid,p_purpose text,p_scope uuid,p_type text,p_bytes integer,p_hash text)
returns table(id uuid,object_path text) language plpgsql security invoker set search_path=''
as $$
declare ticket uuid := gen_random_uuid();
begin
  perform pg_advisory_xact_lock(hashtextextended('upload:'||p_user::text,0));
  if (select count(*) from public.upload_tickets t where t.user_id=p_user and t.created_at>now()-interval '10 minutes')>=30 then
    raise exception 'UPLOAD_QUOTA' using errcode='P0001';
  end if;
  return query insert into public.upload_tickets(id,user_id,purpose,scope_id,object_path,content_type,size_bytes,file_hash)
    values(ticket,p_user,p_purpose,p_scope,p_user::text||'/'||ticket::text,p_type,p_bytes,p_hash)
    returning upload_tickets.id,upload_tickets.object_path;
end;
$$;
revoke all on function public.reserve_upload_ticket(uuid,text,uuid,text,integer,text) from public,anon,authenticated;
grant execute on function public.reserve_upload_ticket(uuid,text,uuid,text,integer,text) to service_role;
