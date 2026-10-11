-- One browser PushManager subscription (endpoint) may cover multiple camporees,
-- but belongs to exactly ONE current Auth account. Rebinding it on account
-- switch replaces targets so notifications from the previous account stop.
alter table public.push_subscriptions
  add column if not exists camporee_ids uuid[] not null default '{}'::uuid[];
update public.push_subscriptions
  set camporee_ids=array[camporee_id] where not (camporee_id=any(camporee_ids));

create or replace function public.register_camporee_push(
  target_camporee uuid,
  push_endpoint text,
  push_p256dh text,
  push_auth text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=(select auth.uid());
  device_id uuid;
begin
  if actor is null or not private.is_camporee_member(target_camporee)
    or not exists(select 1 from public.camporees where id=target_camporee and status<>'archived')
  then raise exception 'Active camporee membership required' using errcode='42501'; end if;
  if push_endpoint is null or left(push_endpoint,8)<>'https://' or char_length(push_endpoint)>2048
    or char_length(push_endpoint)<16
    or push_p256dh is null or char_length(push_p256dh) not between 40 and 512
    or push_auth is null or char_length(push_auth) not between 8 and 512
  then raise exception 'Invalid push subscription' using errcode='23514'; end if;

  -- endpoint is unique; ON CONFLICT serializes concurrent registration.
  insert into public.push_subscriptions(user_id,camporee_id,endpoint,p256dh,auth,camporee_ids)
  values(actor,target_camporee,push_endpoint,push_p256dh,push_auth,array[target_camporee])
  on conflict(endpoint) do update
  set user_id=excluded.user_id, camporee_id=excluded.camporee_id,
      p256dh=excluded.p256dh,auth=excluded.auth,
      camporee_ids=case
        when public.push_subscriptions.user_id is distinct from excluded.user_id
          then excluded.camporee_ids
        when excluded.camporee_id=any(public.push_subscriptions.camporee_ids)
          then public.push_subscriptions.camporee_ids
        else array_append(public.push_subscriptions.camporee_ids,excluded.camporee_id)
      end,
      updated_at=now()
  returning id into device_id;
  return device_id;
end $$;

-- Old versions used direct upsert against the globally unique endpoint.
-- Multi-tenant clients must use the membership-checking RPC above.
revoke insert,update,delete on public.push_subscriptions from authenticated;
revoke all on function public.register_camporee_push(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.register_camporee_push(uuid,text,text,text) to authenticated;

-- Membership is always rechecked at delivery, so stale target IDs cannot
-- authorize delivery after a member loses access.
create index if not exists push_subscriptions_targets_gin_idx
  on public.push_subscriptions using gin(camporee_ids);

-- Realtime listeners for permission changes need the membership table to
-- belong to the existing publication. RLS still limits which rows a user sees.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public' and tablename='organization_members'
  ) then
    alter publication supabase_realtime add table public.organization_members;
  end if;
end $$;
