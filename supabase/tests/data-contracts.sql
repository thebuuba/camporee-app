-- Runs after multi-tenant.sql, under the same rollback-only pgTAP plan.
reset role;
select has_column('public','tasks','assigned_participant_id','rebuilt task schema supports participant assignment');
select col_is_null('public','tasks','assigned_participant_id','participant assignment is optional for existing tasks');
select ok(not has_function_privilege('anon','public.save_camporee_activity(uuid,uuid,jsonb,uuid[],boolean)','EXECUTE'),'anonymous cannot save activities');
select ok(not has_function_privilege('anon','public.get_camporee_home_summary(uuid,timestamptz)','EXECUTE'),'anonymous cannot read summary RPC');
select ok((select not prosecdef from pg_proc where oid='public.save_camporee_activity(uuid,uuid,jsonb,uuid[],boolean)'::regprocedure),'atomic save retains caller RLS');
select ok((select not prosecdef from pg_proc where oid='public.get_camporee_home_summary(uuid,timestamptz)'::regprocedure),'summary retains caller RLS');
select ok(not has_function_privilege('anon','public.get_camporee_finance_rows(uuid,text)','EXECUTE'),'anonymous cannot read finance snapshots');
select ok((select not prosecdef and provolatile='s' from pg_proc where oid='public.get_camporee_finance_rows(uuid,text)'::regprocedure),'finance snapshot is stable and retains caller RLS');

-- Dedicated fixtures keep totals independent from the preceding tenancy tests.
insert into auth.users(id,email,email_confirmed_at) values
 ('d1000000-0000-4000-8000-000000000001','data-owner@club.test',now()),
 ('d1000000-0000-4000-8000-000000000002','data-viewer@club.test',now()),
 ('d1000000-0000-4000-8000-000000000003','data-other@club.test',now());
insert into organizations(id,name,owner_user_id) values
 ('d2000000-0000-4000-8000-000000000001','Data club','d1000000-0000-4000-8000-000000000001'),
 ('d2000000-0000-4000-8000-000000000002','Other data club','d1000000-0000-4000-8000-000000000003');
insert into organization_members(organization_id,user_id,role) values
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','admin'),
 ('d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002','viewer'),
 ('d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003','admin');
insert into camporees(id,organization_id,owner_id,name,starts_on,ends_on,time_zone) values
 ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Data camp','2026-10-01','2026-10-31','America/La_Paz'),
 ('d3000000-0000-4000-8000-000000000002','d2000000-0000-4000-8000-000000000002','d1000000-0000-4000-8000-000000000003','Other data camp','2026-10-01','2026-10-31','America/La_Paz');
insert into participants(id,camporee_id,full_name) values
 ('d4000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Original participant'),
 ('d4000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000001','Replacement participant'),
 ('d4000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000002','Foreign participant');

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into tasks(id,camporee_id,title,created_by,assigned_participant_id) values
 ('d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Assigned task',auth.uid(),'d4000000-0000-4000-8000-000000000002');
select is((select assigned_participant_id::text from tasks where id='d5000000-0000-4000-8000-000000000001'),'d4000000-0000-4000-8000-000000000002','task assignment round trips through actual schema');
select throws_ok($$update tasks set assigned_participant_id='d4000000-0000-4000-8000-000000000003' where id='d5000000-0000-4000-8000-000000000001'$$,'23503',null,'task cannot reference a foreign participant');
select throws_ok($$update participants set camporee_id='d3000000-0000-4000-8000-000000000002' where id='d4000000-0000-4000-8000-000000000002'$$,'23514',null,'assigned participant cannot move to another camporee');
delete from participants where id='d4000000-0000-4000-8000-000000000002';
select is((select assigned_participant_id from tasks where id='d5000000-0000-4000-8000-000000000001'),null::uuid,'deleting participant clears optional assignment');
select is((select camporee_id::text from tasks where id='d5000000-0000-4000-8000-000000000001'),'d3000000-0000-4000-8000-000000000001','assignment cleanup preserves task tenant');

-- The scalar result contains the persisted activity and participant membership.
select save_camporee_activity('d3000000-0000-4000-8000-000000000001',null,
 '{"title":"Original activity","starts_at":"2026-10-27T14:00:00Z","location":"Cancha"}',
 array['d4000000-0000-4000-8000-000000000001'::uuid],true) as activity_result \gset
select set_config('test.activity_id',(:'activity_result'::jsonb->>'id'),true);
select set_config('test.event_id',(:'activity_result'::jsonb->>'schedule_event_id'),true);
select is((:'activity_result'::jsonb->'camporee_activity_participants'->0->>'participant_id'),'d4000000-0000-4000-8000-000000000001','RPC returns saved membership');
select is((select title from schedule_events where id=current_setting('test.event_id')::uuid),'Original activity','RPC creates the linked program event');
select throws_ok($$select save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,
 '{"title":"Must roll back","starts_at":"2026-10-28T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000003'::uuid],true)$$,'23503',null,'foreign participant rejects the entire activity save');
select is((select title from camporee_activities where id=current_setting('test.activity_id')::uuid),'Original activity','participant failure rolls back the activity edit');
select is((select title from schedule_events where id=current_setting('test.event_id')::uuid),'Original activity','participant failure rolls back program changes');
select is((select participant_id::text from camporee_activity_participants where activity_id=current_setting('test.activity_id')::uuid),'d4000000-0000-4000-8000-000000000001','participant failure restores previous membership');
select throws_ok($$select save_camporee_activity('d3000000-0000-4000-8000-000000000001',null,
 '{"title":"Failed new activity","starts_at":"2026-10-28T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000003'::uuid],true)$$,'23503',null,'failed new activity is atomic');
select is((select count(*) from camporee_activities where title='Failed new activity'),0::bigint,'no orphan activity after failed create');
select is((select count(*) from schedule_events where title='Failed new activity'),0::bigint,'no orphan program event after failed create');
select is((save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,
 '{"title":"Updated activity","starts_at":"2026-10-28T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000001'::uuid],true)->>'location'),'Cancha','omitted optional location survives edit');
select is((save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,
 '{"title":"Updated activity"}','{}',false)->>'schedule_event_id'),null::text,'unsync clears program link atomically');
select is((select count(*) from schedule_events where id=current_setting('test.event_id')::uuid),0::bigint,'unsync removes the linked event');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select save_camporee_activity('d3000000-0000-4000-8000-000000000001',null,'{"title":"Denied"}','{}',false)$$,'42501',null,'viewer without schedule permission cannot save');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select throws_ok($$select save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,'{"title":"Denied"}','{}',false)$$,'42501',null,'foreign administrator cannot save another camporee');
select throws_ok($$select save_camporee_activity('d3000000-0000-4000-8000-000000000002',current_setting('test.activity_id')::uuid,'{"title":"Denied"}','{}',false)$$,'42501',null,'activity ID cannot be combined with another authorized camporee');
select throws_ok($$select get_camporee_home_summary('d3000000-0000-4000-8000-000000000001')$$,'42501',null,'summary refuses cross-tenant access');
select throws_ok($$select get_camporee_finance_rows('d3000000-0000-4000-8000-000000000001','expenses')$$,'42501',null,'finance snapshot refuses cross-tenant access');
select throws_ok($$select get_camporee_finance_rows('d3000000-0000-4000-8000-000000000002','expenses; drop table expenses')$$,'23514',null,'finance kind is a closed set rather than dynamic SQL');
reset role;

-- Inject errors at each multi-write boundary. A function error must undo all
-- preceding writes, including a participant-list DELETE before an INSERT fails.
create function public.test_fail_activity_write() returns trigger language plpgsql as $$
declare occurrence integer;
begin
  if current_setting('test.fail_write',true)=TG_TABLE_NAME||':'||TG_OP then
    occurrence := coalesce(nullif(current_setting('test.write_count',true),''),'0')::integer+1;
    perform set_config('test.write_count',occurrence::text,true);
    if occurrence=coalesce(nullif(current_setting('test.fail_occurrence',true),''),'1')::integer then
      raise exception 'Injected activity write failure' using errcode='P0001';
    end if;
  end if;
  if TG_OP='DELETE' then return old; end if;
  return new;
end $$;
create trigger test_fail_activity before insert or update on camporee_activities for each row execute function test_fail_activity_write();
create trigger test_fail_event before insert or update or delete on schedule_events for each row execute function test_fail_activity_write();
create trigger test_fail_participants before insert or delete on camporee_activity_participants for each row execute function test_fail_activity_write();
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,
 '{"title":"Failure baseline","starts_at":"2026-10-27T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000001'::uuid],true);
select set_config('test.event_id',(select schedule_event_id::text from camporee_activities where id=current_setting('test.activity_id')::uuid),true);
do $$ declare boundary text; previous jsonb; after_failure jsonb; begin
  foreach boundary in array array['camporee_activities:UPDATE','schedule_events:UPDATE','camporee_activity_participants:DELETE','camporee_activity_participants:INSERT','schedule_events:DELETE','camporee_activities:LINK'] loop
    select jsonb_build_object('activity',to_jsonb(a),'event',(select to_jsonb(e) from schedule_events e where e.id=a.schedule_event_id),
      'participants',(select jsonb_agg(to_jsonb(p) order by p.participant_id) from camporee_activity_participants p where p.activity_id=a.id)) into previous
      from camporee_activities a where a.id=current_setting('test.activity_id')::uuid;
    perform set_config('test.fail_write',case when boundary='camporee_activities:LINK' then 'camporee_activities:UPDATE' else boundary end,true);
    perform set_config('test.write_count','0',true);
    perform set_config('test.fail_occurrence',case when boundary='camporee_activities:LINK' then '2' else '1' end,true);
    begin
      perform save_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.activity_id')::uuid,
        '{"title":"Should roll back","starts_at":"2026-10-28T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000001'::uuid],boundary<>'schedule_events:DELETE');
      raise exception 'Failure injection did not execute at %',boundary using errcode='P0002';
    exception when sqlstate 'P0001' then null; end;
    perform set_config('test.fail_write','',true);
    select jsonb_build_object('activity',to_jsonb(a),'event',(select to_jsonb(e) from schedule_events e where e.id=a.schedule_event_id),
      'participants',(select jsonb_agg(to_jsonb(p) order by p.participant_id) from camporee_activity_participants p where p.activity_id=a.id)) into after_failure
      from camporee_activities a where a.id=current_setting('test.activity_id')::uuid;
    if after_failure is distinct from previous then raise exception 'Partial write at %',boundary; end if;
  end loop;
end $$;
select pass('activity update/link, program update/delete and participant delete/insert failures preserve every original field');
do $$ declare boundary text; before_counts bigint[]; after_counts bigint[]; begin
  select array[(select count(*) from camporee_activities),(select count(*) from schedule_events),(select count(*) from camporee_activity_participants)] into before_counts;
  foreach boundary in array array['camporee_activities:INSERT','schedule_events:INSERT','camporee_activities:UPDATE','camporee_activity_participants:INSERT'] loop
    perform set_config('test.fail_write',boundary,true);
    perform set_config('test.write_count','0',true);
    perform set_config('test.fail_occurrence','1',true);
    begin
      perform save_camporee_activity('d3000000-0000-4000-8000-000000000001',null,
        '{"title":"Injected failed create","starts_at":"2026-10-28T14:00:00Z"}',array['d4000000-0000-4000-8000-000000000001'::uuid],true);
      raise exception 'Failure injection did not execute at %',boundary using errcode='P0002';
    exception when sqlstate 'P0001' then null; end;
    perform set_config('test.fail_write','',true);
    select array[(select count(*) from camporee_activities),(select count(*) from schedule_events),(select count(*) from camporee_activity_participants)] into after_counts;
    if after_counts is distinct from before_counts then raise exception 'Orphan rows at %',boundary; end if;
  end loop;
end $$;
select pass('new activity, event, link and membership insertion failures leave no orphan rows');
reset role;
drop trigger test_fail_activity on camporee_activities;
drop trigger test_fail_event on schedule_events;
drop trigger test_fail_participants on camporee_activity_participants;
drop function test_fail_activity_write();

-- SQL aggregates remain exact at both 1,200 and 10,000 rows. Include boundary
-- timestamps so local-day counts cannot accidentally use UTC calendar days.
delete from tasks where camporee_id='d3000000-0000-4000-8000-000000000001';
delete from schedule_events where camporee_id='d3000000-0000-4000-8000-000000000001';
delete from participants where camporee_id='d3000000-0000-4000-8000-000000000001';
do $$ declare volume integer; result jsonb; expense_rows jsonb; income_rows jsonb; begin
  foreach volume in array array[1200,10000] loop
    delete from tasks where camporee_id='d3000000-0000-4000-8000-000000000001';
    delete from expenses where camporee_id='d3000000-0000-4000-8000-000000000001';
    delete from income_entries where camporee_id='d3000000-0000-4000-8000-000000000001';
    delete from participants where camporee_id='d3000000-0000-4000-8000-000000000001';
    delete from schedule_events where camporee_id='d3000000-0000-4000-8000-000000000001';
    insert into tasks(camporee_id,title,status,phase,due_at) select 'd3000000-0000-4000-8000-000000000001','Task '||i,
      case when i%4=0 then 'done' when i%4=1 then 'cancelled' else 'pending' end,'before','2026-10-28T02:00:00Z'::timestamptz from generate_series(1,volume) i;
    insert into expenses(camporee_id,description,amount) select 'd3000000-0000-4000-8000-000000000001','Expense',2 from generate_series(1,volume);
    insert into income_entries(camporee_id,description,amount) select 'd3000000-0000-4000-8000-000000000001','Income',3 from generate_series(1,volume);
    insert into participants(camporee_id,full_name,attendance_status) select 'd3000000-0000-4000-8000-000000000001','Person',case when i%2=0 then 'checked_in' else 'confirmed' end from generate_series(1,volume) i;
    insert into schedule_events(camporee_id,title,starts_at) select 'd3000000-0000-4000-8000-000000000001','Event','2026-10-28T02:00:00Z' from generate_series(1,volume);
    perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
    set local role authenticated;
    result := get_camporee_home_summary('d3000000-0000-4000-8000-000000000001','2026-10-27T23:00:00Z');
    expense_rows := get_camporee_finance_rows('d3000000-0000-4000-8000-000000000001','expenses');
    income_rows := get_camporee_finance_rows('d3000000-0000-4000-8000-000000000001','income_entries');
    reset role;
    if (result->>'totalTasks')::integer<>volume*3/4 or (result->>'completedTasks')::integer<>volume/4
      or (result->>'pendingTasks')::integer<>volume/2 or (result->>'todayPendingTasks')::integer<>volume/2
      or (result->>'totalExpenses')::numeric<>volume*2 or (result->>'totalIncome')::numeric<>volume*3
      or (result->>'participants')::integer<>volume or (result->>'presentParticipants')::integer<>volume/2
      or (result->>'programCount')::integer<>volume or (result->>'todayProgramCount')::integer<>volume
      or (result->'preparation'->>'total')::integer<>volume*3/4 or jsonb_array_length(result->'todayTasks')<>3 then
      raise exception 'Incomplete SQL summary at % rows: %',volume,result;
    end if;
    if jsonb_array_length(expense_rows)<>volume or jsonb_array_length(income_rows)<>volume
      or (select count(distinct entry->>'id') from jsonb_array_elements(expense_rows) entry)<>volume
      or (select count(distinct entry->>'id') from jsonb_array_elements(income_rows) entry)<>volume
      or (select sum((entry->>'amount')::numeric) from jsonb_array_elements(expense_rows) entry)<>volume*2
      or (select sum((entry->>'amount')::numeric) from jsonb_array_elements(income_rows) entry)<>volume*3 then
      raise exception 'Incomplete finance snapshot at % rows',volume;
    end if;
    if exists(select 1 from (
      select entry->>'id' id,lag(entry->>'id') over(order by position) previous_id
      from jsonb_array_elements(expense_rows) with ordinality rows(entry,position)
    ) ordered where previous_id>id) then raise exception 'Unstable expense tie order'; end if;
  end loop;
end $$;
select pass('SQL home totals and time-zone daily counts remain exact at 1200 and 10000 rows');
select pass('finance snapshots contain all distinct rows and exact amounts at 1200 and 10000 rows');

-- A data-modifying CTE executes before the function target expression. STABLE
-- must still read the outer statement's snapshot, rather than mixing the new
-- insertion/deletion with rows from the start of that statement.
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select is(jsonb_array_length(get_camporee_finance_rows('d3000000-0000-4000-8000-000000000002','expenses')),0,'authorized foreign club sees its empty list without any of the 10000 other-club rows');
insert into expenses(id,camporee_id,description,amount,created_by) values
 ('d6000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000002','A',10,auth.uid()),
 ('d6000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-000000000002','B',20,auth.uid()),
 ('d6000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-000000000002','C',30,auth.uid());
with added as (
 insert into expenses(id,camporee_id,description,amount,created_by)
 values('d6000000-0000-4000-8000-000000000004','d3000000-0000-4000-8000-000000000002','X',100,auth.uid()) returning id
)
select get_camporee_finance_rows('d3000000-0000-4000-8000-000000000002','expenses') as insert_snapshot
from (select count(*) n from added) changes where n=1 \gset
select is((select sum((entry->>'amount')::numeric) from jsonb_array_elements(:'insert_snapshot'::jsonb) entry),60::numeric,'insert cannot mix a new row into a finance statement snapshot');
select is((select sum(amount) from expenses where camporee_id='d3000000-0000-4000-8000-000000000002'),160::numeric,'insertion actually took effect after the snapshot');
with removed as (delete from expenses where id='d6000000-0000-4000-8000-000000000002' returning id)
select get_camporee_finance_rows('d3000000-0000-4000-8000-000000000002','expenses') as delete_snapshot
from (select count(*) n from removed) changes where n=1 \gset
select is((select sum((entry->>'amount')::numeric) from jsonb_array_elements(:'delete_snapshot'::jsonb) entry),160::numeric,'deletion cannot remove a row midway through a finance statement snapshot');
select is((select sum(amount) from expenses where camporee_id='d3000000-0000-4000-8000-000000000002'),140::numeric,'deletion actually took effect after the snapshot');
reset role;

select ok(not has_function_privilege('anon','public.delete_camporee_activity(uuid,uuid)','EXECUTE'),'anonymous cannot delete activities');
select ok((select not prosecdef from pg_proc where oid='public.delete_camporee_activity(uuid,uuid)'::regprocedure),'activity removal retains caller RLS');
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
insert into participants(id,camporee_id,full_name) values('d7000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Delete rollback participant');
select save_camporee_activity('d3000000-0000-4000-8000-000000000001',null,
 '{"title":"Atomic deletion candidate","starts_at":"2026-10-27T14:00:00Z"}',
 array['d7000000-0000-4000-8000-000000000001'::uuid],true) as delete_candidate \gset
select set_config('test.delete_activity_id',(:'delete_candidate'::jsonb->>'id'),true);
select set_config('test.delete_event_id',(:'delete_candidate'::jsonb->>'schedule_event_id'),true);
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001')$$,'42501',null,'missing activity never reports deletion success');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.delete_activity_id')::uuid)$$,'42501',null,'viewer without schedule permission cannot remove activity');
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000003',true);
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.delete_activity_id')::uuid)$$,'42501',null,'foreign administrator cannot remove activity');
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000002',current_setting('test.delete_activity_id')::uuid)$$,'42501',null,'delete cannot combine foreign activity ID with an authorized camporee');
reset role;
create function public.test_fail_activity_removal() returns trigger language plpgsql as $$
begin
  if old.id=current_setting('test.delete_event_id')::uuid then
    if current_setting('test.delete_mode',true)='skip' then return null; end if;
    raise exception 'Linked event deletion failed' using errcode='P0001';
  end if;
  return old;
end $$;
create trigger test_fail_activity_removal before delete on schedule_events for each row execute function test_fail_activity_removal();
set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.delete_activity_id')::uuid)$$,'P0001',null,'linked event failure aborts activity deletion');
select is((select count(*) from camporee_activities where id=current_setting('test.delete_activity_id')::uuid),1::bigint,'failed linked delete restores original activity');
select is((select count(*) from schedule_events where id=current_setting('test.delete_event_id')::uuid),1::bigint,'failed linked delete retains program event');
select is((select participant_id::text from camporee_activity_participants where activity_id=current_setting('test.delete_activity_id')::uuid),'d7000000-0000-4000-8000-000000000001','failed linked delete restores cascaded participant membership');
select set_config('test.delete_mode','skip',true);
select throws_ok($$select delete_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.delete_activity_id')::uuid)$$,'42501',null,'zero affected linked event rows cannot report success');
select is((select count(*) from camporee_activities where id=current_setting('test.delete_activity_id')::uuid),1::bigint,'zero affected linked delete also restores activity');
reset role;
drop trigger test_fail_activity_removal on schedule_events;
drop function test_fail_activity_removal();
set local role authenticated;
select is(delete_camporee_activity('d3000000-0000-4000-8000-000000000001',current_setting('test.delete_activity_id')::uuid),current_setting('test.delete_activity_id')::uuid,'atomic removal returns confirmed activity ID');
select is((select count(*) from camporee_activities where id=current_setting('test.delete_activity_id')::uuid),0::bigint,'confirmed deletion removes activity');
select is((select count(*) from schedule_events where id=current_setting('test.delete_event_id')::uuid),0::bigint,'confirmed deletion removes linked program event');
select is((select count(*) from camporee_activity_participants where activity_id=current_setting('test.delete_activity_id')::uuid),0::bigint,'confirmed deletion removes participant membership');
reset role;
