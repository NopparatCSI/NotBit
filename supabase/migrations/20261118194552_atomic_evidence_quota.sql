create table public.evidence_upload_reservations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.users(id),
  file_count integer not null check(file_count between 1 and 6), created_at timestamptz not null default now()
);
create index evidence_upload_reservations_recent_idx on public.evidence_upload_reservations(user_id,created_at);
alter table public.evidence_upload_reservations enable row level security;
revoke all on public.evidence_upload_reservations from public,anon,authenticated,service_role;
grant select,insert,delete on public.evidence_upload_reservations to service_role;
alter table public.evidence add column upload_reservation_id uuid references public.evidence_upload_reservations(id) on delete set null;

create function public.reserve_evidence_quota(p_user uuid,p_count integer)
returns uuid language plpgsql security invoker set search_path=''
as $$
declare used_files bigint; held_files bigint; reservation uuid;
begin
  if p_count not between 1 and 6 then raise exception 'INVALID_COUNT' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('evidence:'||p_user::text,0));
  select count(*) into used_files from public.evidence where submitted_by=p_user and created_at>now()-interval '10 minutes';
  select coalesce(sum(greatest(r.file_count-(select count(*) from public.evidence e where e.upload_reservation_id=r.id),0)),0)
    into held_files from public.evidence_upload_reservations r where r.user_id=p_user and r.created_at>now()-interval '10 minutes';
  if used_files+held_files+p_count>30 then raise exception 'EVIDENCE_QUOTA' using errcode='P0001'; end if;
  insert into public.evidence_upload_reservations(user_id,file_count) values(p_user,p_count) returning id into reservation;
  return reservation;
end;
$$;
revoke all on function public.reserve_evidence_quota(uuid,integer) from public,anon,authenticated;
grant execute on function public.reserve_evidence_quota(uuid,integer) to service_role;
