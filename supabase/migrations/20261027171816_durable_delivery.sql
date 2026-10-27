-- Keep historical log rows delivered. New jobs are explicitly pending.
alter table public.system_push_reminder_log
 add column state text not null default 'delivered' check(state in ('pending','leased','delivered','failed')),
 add column payload jsonb,
 add column ttl integer not null default 86400 check(ttl between 1 and 86400),
 add column expires_at timestamptz not null default (now()+interval '1 day'),
 add column next_attempt_at timestamptz not null default now(),
 add column attempts integer not null default 0 check(attempts between 0 and 8),
 add column lease_token uuid,
 add column lease_until timestamptz,
 add column accepted_subscription_ids uuid[] not null default '{}';
create index system_push_delivery_pending_idx on public.system_push_reminder_log(next_attempt_at)
 where state in ('pending','leased');
create index system_push_delivery_retention_idx on public.system_push_reminder_log(expires_at)
 where payload is not null or cardinality(accepted_subscription_ids)>0;
revoke all on public.system_push_reminder_log from public, anon, authenticated;
grant all on public.system_push_reminder_log to service_role;

create function public.enqueue_push_delivery(target_camporee uuid, target_user uuid, delivery_key text,
 delivery_payload jsonb, delivery_ttl integer, delivery_expires timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.camporees c join public.organization_members m on m.organization_id=c.organization_id
  where c.id=target_camporee and c.status <> 'archived' and m.user_id=target_user and m.is_active) then
  raise exception 'Inactive or unrelated delivery recipient' using errcode='42501';
 end if;
 insert into public.system_push_reminder_log(camporee_id,user_id,milestone,state,payload,ttl,expires_at)
 values(target_camporee,target_user,delivery_key,'pending',delivery_payload,delivery_ttl,
  least(delivery_expires,now()+interval '1 day')) on conflict(camporee_id,user_id,milestone) do nothing;
end $$;

create function private.queue_announcement_delivery() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient record; organization uuid; delivery_ttl integer;
begin
 select organization_id into organization from public.camporees where id=new.camporee_id;
 delivery_ttl := case when new.priority='urgent' then 3600 else 21600 end;
 for recipient in select user_id from public.organization_members where organization_id=organization and is_active
  and user_id is distinct from new.created_by loop
  perform public.enqueue_push_delivery(new.camporee_id,recipient.user_id,'announcement:'||new.id,
   jsonb_build_object('title',case when new.priority='urgent' then '⚠️ ' else '' end||left(new.title,120),'body',left(new.message,500),
    'url','/o/'||organization||'/c/'||new.camporee_id||'/more/announcements','tag','announcement-'||new.id),
   delivery_ttl,now()+make_interval(secs=>delivery_ttl));
 end loop;
 return new;
end $$;
revoke all on function private.queue_announcement_delivery() from public,anon,authenticated;
create trigger announcement_delivery after insert on public.announcements
 for each row execute function private.queue_announcement_delivery();

create function public.claim_push_delivery() returns setof public.system_push_reminder_log
language plpgsql security definer set search_path='' as $$
begin
 -- Retain deduplication keys for existing reminders. Expired payloads and
 -- subscription identifiers have a bounded 30-day retention.
 update public.system_push_reminder_log set state='failed',lease_token=null,lease_until=null
 where state in ('pending','leased') and (expires_at <= now() or attempts >= 8)
  and (lease_until is null or lease_until <= now());
 update public.system_push_reminder_log set payload=null,accepted_subscription_ids='{}'
 where expires_at < now()-interval '30 days' and (payload is not null or cardinality(accepted_subscription_ids)>0);
 return query
 with candidate as (
  select l.id from public.system_push_reminder_log l
  join public.camporees c on c.id=l.camporee_id
  join public.organization_members m on m.organization_id=c.organization_id and m.user_id=l.user_id and m.is_active
  where l.state in ('pending','leased') and l.expires_at>now() and l.attempts<8
   and l.next_attempt_at<=now() and (l.lease_until is null or l.lease_until<=now()) and c.status<>'archived'
  order by l.next_attempt_at,l.id for update of l skip locked limit 1
 ) update public.system_push_reminder_log l set state='leased',attempts=attempts+1,
  lease_token=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 from candidate where l.id=candidate.id returning l.*;
end $$;

create function public.renew_push_delivery(delivery_id uuid, owner_token uuid) returns boolean
language sql security definer set search_path='' as $$
 with renewed as (update public.system_push_reminder_log l set lease_until=now()+interval '2 minutes'
 where l.id=delivery_id and l.lease_token=owner_token and l.state='leased' and l.lease_until>now() and l.expires_at>now()
 and exists(select 1 from public.camporees c join public.organization_members m on m.organization_id=c.organization_id
  where c.id=l.camporee_id and c.status<>'archived' and m.user_id=l.user_id and m.is_active)
 returning 1) select exists(select 1 from renewed);
$$;

create function public.ack_push_subscription(delivery_id uuid, owner_token uuid, subscription_id uuid) returns boolean
language sql security definer set search_path='' as $$
 with acknowledged as (update public.system_push_reminder_log set
  accepted_subscription_ids=array(select distinct unnest(accepted_subscription_ids||subscription_id))
 where id=delivery_id and lease_token=owner_token and state='leased' and lease_until>now()
 returning 1) select exists(select 1 from acknowledged);
$$;

create function public.finish_push_delivery(delivery_id uuid, owner_token uuid, accepted_ids uuid[], retry boolean)
returns boolean language sql security definer set search_path='' as $$
 with finished as (update public.system_push_reminder_log set
  accepted_subscription_ids=array(select distinct unnest(accepted_subscription_ids||accepted_ids)),
  state=case when retry and attempts<8 and expires_at>now() then 'pending'
    when retry then 'failed' else 'delivered' end,
  next_attempt_at=now()+make_interval(secs=>least(3600,30*power(2,attempts-1)::integer)),
  lease_token=null,lease_until=null,sent_at=now()
 where id=delivery_id and lease_token=owner_token and state='leased' and lease_until>now()
 returning 1) select exists(select 1 from finished);
$$;

revoke all on function public.enqueue_push_delivery(uuid,uuid,text,jsonb,integer,timestamptz),
 public.claim_push_delivery(),public.renew_push_delivery(uuid,uuid),public.ack_push_subscription(uuid,uuid,uuid),public.finish_push_delivery(uuid,uuid,uuid[],boolean)
 from public,anon,authenticated;
grant execute on function public.enqueue_push_delivery(uuid,uuid,text,jsonb,integer,timestamptz),
 public.claim_push_delivery(),public.renew_push_delivery(uuid,uuid),public.ack_push_subscription(uuid,uuid,uuid),public.finish_push_delivery(uuid,uuid,uuid[],boolean)
 to service_role;
