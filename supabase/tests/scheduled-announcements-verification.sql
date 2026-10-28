-- Run against a database with this migration installed. All fixture writes,
-- including queued push deliveries, are rolled back; no pushes are sent.
begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organization_members where is_active and role='admin' limit 1),true);
select set_config('test.camporee',(select c.id::text from public.camporees c join public.organization_members m on m.organization_id=c.organization_id where m.user_id=auth.uid() and c.status not in ('finished','archived') limit 1),true);
select set_config('test.notice_id',coalesce((select id::text from public.announcements limit 1),gen_random_uuid()::text),true);
set local role authenticated;
insert into public.scheduled_announcements(id,camporee_id,title,message,created_by,publish_at)
values(current_setting('test.notice_id')::uuid,current_setting('test.camporee')::uuid,'__scheduled_verification__','transaction rollback only',auth.uid(),now()+interval '1 hour');
do $$begin
 if not exists(select 1 from public.scheduled_announcements where title='__scheduled_verification__') then raise exception 'Manager cannot see schedule';end if;
 if exists(select 1 from public.announcements where title='__scheduled_verification__') then raise exception 'Published early';end if;
end$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$begin
 if exists(select 1 from public.scheduled_announcements where title='__scheduled_verification__') then raise exception 'Private schedule exposed';end if;
 if has_function_privilege('authenticated','public.publish_due_announcements()','execute') then raise exception 'Client can publish';end if;
 begin
  insert into public.scheduled_announcements(camporee_id,title,message,created_by,publish_at)
  values(current_setting('test.camporee')::uuid,'unauthorized','test',auth.uid(),now()+interval '1 hour');
  raise exception 'Unrelated user can schedule';
 exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Isolate the fixture even when other real notices are due.
update public.scheduled_announcements set created_at=now()-interval '2 minutes',publish_at=now()-interval '1 minute'
where title='__scheduled_verification__';
set local role service_role;
do $$begin
 perform public.publish_due_announcements();
 perform public.publish_due_announcements();
 if (select count(*) from public.announcements where title='__scheduled_verification__')<>1 then raise exception 'Missing or duplicate publication';end if;
 if exists(select 1 from public.scheduled_announcements where title='__scheduled_verification__') then raise exception 'Published notice still scheduled';end if;
 if not exists(select 1 from public.system_push_reminder_log where payload->>'title'='__scheduled_verification__') then raise exception 'Notification not queued';end if;
end$$;
reset role;
rollback;
select 'Private visibility, permissions, due publication, ID collision, deduplication and notification enqueue passed; test writes rolled back' as verification;
