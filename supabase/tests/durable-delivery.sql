-- Runs after data-contracts.sql in the rollback-only local database.
reset role;
select has_column('public','system_push_reminder_log','lease_token','deliveries have fenced recoverable leases');
select ok(not has_function_privilege('anon','public.claim_push_delivery()','EXECUTE'),'anonymous cannot claim deliveries');
select ok(not has_function_privilege('authenticated','public.claim_push_delivery()','EXECUTE'),'members cannot claim deliveries');
select ok(not has_function_privilege('authenticated','public.enqueue_push_delivery(uuid,uuid,text,jsonb,integer,timestamptz)','EXECUTE'),'members cannot forge delivery jobs');
select ok(not has_function_privilege('authenticated','public.finish_push_delivery(uuid,uuid,uuid[],boolean)','EXECUTE'),'members cannot finalize deliveries');
select ok(not has_function_privilege('anon','public.ack_push_subscription(uuid,uuid,uuid)','EXECUTE') and not has_function_privilege('authenticated','public.renew_push_delivery(uuid,uuid)','EXECUTE'),'members cannot acknowledge or renew another worker');
select ok(has_function_privilege('service_role','public.claim_push_delivery()','EXECUTE'),'worker role can claim delivery');
select ok(not has_table_privilege('authenticated','public.system_push_reminder_log','INSERT') and not has_table_privilege('anon','public.system_push_reminder_log','SELECT'),'untrusted clients cannot alter or read delivery jobs');

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into announcements(id,camporee_id,title,message,created_by) values
 ('d9000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Offline replay','Durable announcement',auth.uid());
reset role;
select is((select count(*) from system_push_reminder_log where milestone='announcement:d9000000-0000-4000-8000-000000000001'),1::bigint,'announcement INSERT atomically queues own active recipients');
select is((select count(*) from system_push_reminder_log where milestone='announcement:d9000000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000001'),0::bigint,'announcement author is excluded as in original delivery');
select is((select count(*) from system_push_reminder_log where milestone='announcement:d9000000-0000-4000-8000-000000000001' and user_id='d1000000-0000-4000-8000-000000000003'),0::bigint,'foreign club has no announcement job');
select throws_ok($$insert into announcements(id,camporee_id,title,message,created_by) values
 ('d9000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Offline replay','Durable announcement','d1000000-0000-4000-8000-000000000001')$$,'23505',null,'replayed same announcement cannot create a duplicate');
select is((select count(*) from system_push_reminder_log where milestone='announcement:d9000000-0000-4000-8000-000000000001'),1::bigint,'lost response retry leaves exactly one job per recipient');
create function pg_temp.reject_delivery() returns trigger language plpgsql as $$ begin raise exception 'Injected delivery insert failure'; end $$;
create trigger reject_test_delivery before insert on system_push_reminder_log for each row
 when (new.milestone='announcement:d9000000-0000-4000-8000-000000000002') execute function pg_temp.reject_delivery();
select throws_ok($$insert into announcements(id,camporee_id,title,message,created_by) values
 ('d9000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001','Must roll back','Delivery failed','d1000000-0000-4000-8000-000000000001')$$,'P0001','Injected delivery insert failure','delivery enqueue failure rejects announcement transaction');
select is((select count(*) from announcements where id='d9000000-0000-4000-8000-000000000002'),0::bigint,'no published announcement without its delivery job');
drop trigger reject_test_delivery on system_push_reminder_log;
select throws_ok($$select enqueue_push_delivery('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000003','foreign','{}',300,now()+interval '1 hour')$$,'42501',null,'even privileged enqueue rejects foreign recipients');
update organization_members set is_active=false where user_id='d1000000-0000-4000-8000-000000000002';
select throws_ok($$select enqueue_push_delivery('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','inactive','{}',300,now()+interval '1 hour')$$,'42501',null,'inactive recipients cannot be queued');

-- Isolate one job; a live claim excludes another worker, an expired one recovers.
update system_push_reminder_log set state='failed' where milestone <> 'announcement:d9000000-0000-4000-8000-000000000001';
select is((select count(*) from claim_push_delivery()),0::bigint,'inactive queued recipient cannot be claimed');
update organization_members set is_active=true where user_id='d1000000-0000-4000-8000-000000000002';
set local role service_role;
select id::text as job_id, lease_token::text as first_token from claim_push_delivery() \gset
select is((select count(*) from claim_push_delivery()),0::bigint,'concurrent worker cannot claim a live lease');
reset role;
update system_push_reminder_log set lease_until=now()-interval '1 second' where id=:'job_id';
select id::text as recovered_id, lease_token::text as second_token from claim_push_delivery() \gset
select is(:'recovered_id'::text,:'job_id'::text,'interrupted worker job is recovered');
select isnt(:'first_token'::text,:'second_token'::text,'recovery fences the previous owner');
select is(finish_push_delivery(:'job_id',:'first_token','{}',false),false,'old worker cannot finalize newer lease');
select is(renew_push_delivery(:'job_id',:'first_token'),false,'old worker cannot renew newer lease');
select is(ack_push_subscription(:'job_id',:'first_token','d8000000-0000-4000-8000-000000000001'),false,'old worker cannot acknowledge newer lease');
select is(finish_push_delivery(:'job_id',:'second_token','{}',true),true,'owner can request retry');
select is((select count(*) from claim_push_delivery()),0::bigint,'retry has backoff');
update system_push_reminder_log set next_attempt_at=now()-interval '1 second' where id=:'job_id';
select id::text as retry_id, lease_token::text as retry_token from claim_push_delivery() \gset
select is(:'retry_id'::text,:'job_id'::text,'pending delivery survives a cron restart');
select is(finish_push_delivery(:'job_id',:'retry_token',array['d8000000-0000-4000-8000-000000000001'::uuid],false),true,'successful delivery is finalized');
select is((select state from system_push_reminder_log where id=:'job_id'),'delivered','completed delivery is retained for deduplication');
select is((select count(*) from claim_push_delivery()),0::bigint,'delivered or inactive jobs cannot be reclaimed');
select enqueue_push_delivery('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','bounded','{}',300,now()+interval '1 hour');
update system_push_reminder_log set attempts=8 where milestone='bounded';
select is((select count(*) from claim_push_delivery()),0::bigint,'permanently unavailable endpoint stops after eight attempts');
select is((select state from system_push_reminder_log where milestone='bounded'),'failed','exhausted jobs retain failed state');
update system_push_reminder_log set payload='{}',expires_at=now()-interval '31 days' where milestone='bounded';
select count(*) from claim_push_delivery();
select is((select payload from system_push_reminder_log where milestone='bounded'),null::jsonb,'expired delivery payload has bounded retention');
select is((select count(*) from system_push_reminder_log where milestone='bounded'),1::bigint,'retention preserves reminder deduplication key');

-- Membership is rechecked after claim, before each provider request.
update organization_members set is_active=true where user_id='d1000000-0000-4000-8000-000000000002';
select enqueue_push_delivery('d3000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','revoked','{}',300,now()+interval '1 hour');
select id::text as revoked_id, lease_token::text as revoked_token from claim_push_delivery() \gset
update organization_members set is_active=false where user_id='d1000000-0000-4000-8000-000000000002';
select is(renew_push_delivery(:'revoked_id',:'revoked_token'),false,'membership removed during processing prevents further sends');
