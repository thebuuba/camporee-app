select no_plan();
select has_table('public','organizations','organizations exist');
select has_table('public','organization_members','organization membership exists');
select ok(not has_function_privilege('anon','public.create_organization(text,uuid)','EXECUTE'),'anonymous cannot execute privileged organization RPC');
select ok(not has_function_privilege('authenticated','private.is_app_admin()','EXECUTE'),'old global admin helper revoked');
select is((select count(*) from camporees where organization_id='00000000-0000-4000-8000-000000000001'),2::bigint,'all legacy camporees belong to initial organization');
select is((select count(*) from tasks),(select count(*) from legacy_tasks),'legacy tasks preserved');
select is((select title from tasks where id='30000000-0000-4000-8000-000000000001'),'Tarea intacta','legacy task ID and content preserved');
select is((select count(*) from organization_members),4::bigint,'all legacy access states preserved');
select is((select count(*) from organization_members m join legacy_members l using(user_id) where m.role=l.role and m.permissions=l.permissions and m.is_active=l.is_active and m.directive_role is not distinct from l.directive_role),4::bigint,'roles, permissions, activity and duties preserved exactly');
select is((select camporee_id::text from task_checklist_items limit 1),'20000000-0000-4000-8000-000000000001','child camporee backfilled');
do $$ declare r record; n bigint; missing bigint; begin
 for r in select * from legacy_counts loop
  execute format('select count(*) from public.%I',r.table_name) into n;
  execute format('select count(*) from legacy_rows old where old.table_name=%L and not exists(select 1 from public.%I current_row where to_jsonb(current_row) @> old.data)',r.table_name,r.table_name) into missing;
  if n<>r.row_count or missing<>0 then raise exception 'Historical row lost or changed in %',r.table_name; end if;
 end loop;
end $$;
select pass('all original columns, IDs and row counts retained in every module');
-- A second organization controlled by another account.
insert into auth.users(id,email,email_confirmed_at) values ('10000000-0000-4000-8000-000000000005','other@club.test',now());
select is((select count(*) from app_members),4::bigint,'new signup does not receive global membership');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select is((select count(*) from tasks),0::bigint,'outsider cannot read legacy tasks');
do $$ declare tbl text; n bigint; begin
 foreach tbl in array array['areas','task_checklist_items','schedule_events','lists','list_items','meals','meal_ingredients','participants','expenses','income_entries','notes','inventory_items','emergency_contacts','camporee_documents','announcements','attendance_sessions','attendance_marks','camporee_activities','camporee_activity_participants'] loop
  execute format('select count(*) from public.%I',tbl) into n;
  if n<>0 then raise exception 'Outsider leaked % rows from %',n,tbl; end if;
 end loop;
end $$;
select pass('outsider denied in every populated module');
select is((select count(*) from profiles),1::bigint,'outsider sees only own profile');
select create_organization('Otro club','50000000-0000-4000-8000-000000000001');
select create_camporee('50000000-0000-4000-8000-000000000001','Otro camporee','2027-01-01','2027-01-05','60000000-0000-4000-8000-000000000001');
select lives_ok($$select create_camporee('50000000-0000-4000-8000-000000000001','Otro camporee','2027-01-01','2027-01-05','60000000-0000-4000-8000-000000000001')$$,'camporee creation retries are idempotent');
select is((select count(*) from areas where camporee_id='60000000-0000-4000-8000-000000000001'),10::bigint,'areas seeded once atomically');
select throws_ok($$select create_camporee('50000000-0000-4000-8000-000000000001','Año siguiente','2028-01-01','2028-01-05','60000000-0000-4000-8000-000000000002')$$,'23505',null,'the director cannot create a second current camporee in the same club');
select is((select count(*) from camporees),1::bigint,'club member has only one current camporee');
insert into tasks(id,camporee_id,title,created_by) values ('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','Otra tarea','10000000-0000-4000-8000-000000000005');
select is((select count(*) from tasks),1::bigint,'other organization sees only its task');
select is((select count(*) from storage.objects),0::bigint,'other organization cannot read legacy file');
select throws_ok($$insert into tasks(camporee_id,area_id,title,created_by) values('60000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','Cross-area','10000000-0000-4000-8000-000000000005')$$,'23503',null,'cross-camp area denied');
select throws_ok($$insert into camporee_documents(camporee_id,title,file_path,created_by) values('60000000-0000-4000-8000-000000000001','Cross-file','20000000-0000-4000-8000-000000000001/documents/legacy.pdf','10000000-0000-4000-8000-000000000005')$$,'23514',null,'document cannot point to another camporee storage path');
select throws_ok($$insert into tasks(camporee_id,title,assigned_to,created_by) values('60000000-0000-4000-8000-000000000001','Wrong assignee','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005')$$,'23514',null,'task assignee must be active in the organization');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is((select count(*) from tasks),1::bigint,'legacy member sees only legacy task');
select lives_ok($$update tasks set title='Editada' where id='30000000-0000-4000-8000-000000000001'$$,'granular tasks permission retained');
select throws_ok($$update tasks set created_by='10000000-0000-4000-8000-000000000002' where id='30000000-0000-4000-8000-000000000001'$$,'23514',null,'editing cannot rewrite original author');
select throws_ok($$insert into notes(camporee_id,body,created_by) values('20000000-0000-4000-8000-000000000001','Denied','10000000-0000-4000-8000-000000000002')$$,'42501',null,'viewer cannot write another module');
select throws_ok($$insert into task_checklist_items(task_id,camporee_id,label) values('70000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Cross-camp')$$,'23503',null,'cross-camp child reference denied');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*) from tasks),0::bigint,'pending legacy user still cannot read');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select remove_organization_member('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001')$$,'23514',null,'cannot remove organization owner');
select throws_ok($$update tasks set camporee_id='60000000-0000-4000-8000-000000000001' where id='30000000-0000-4000-8000-000000000001'$$,'23514',null,'cannot move data to another camporee');
select is((select count(*) from organization_task_assignees('00000000-0000-4000-8000-000000000001')),2::bigint,'directory includes only active members of this organization');
select lives_ok($$select decide_organization_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','reject')$$,'legacy pending access can be rejected atomically');
select throws_ok($$select decide_organization_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','approve')$$,'23514',null,'stale approval cannot revive rejected request');
select throws_ok($$select decide_organization_access('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','reject')$$,'23514',null,'stale rejection cannot disable active membership');
select is((select permissions->>'notes' from organization_members where organization_id='00000000-0000-4000-8000-000000000001' and user_id='10000000-0000-4000-8000-000000000003'),(select permissions->>'notes' from app_members where user_id='10000000-0000-4000-8000-000000000003'),'access decision retains existing module permissions');
-- A member cannot claim access to a second club, including via the legacy
-- email-bound invitation route. The separate organization remains isolated.
select create_organization_invitation('00000000-0000-4000-8000-000000000001','other@club.test','viewer','{}',null) as invite_token \gset
select set_config('test.invite_token', :'invite_token', true);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select throws_ok($$select accept_organization_invitation(current_setting('test.invite_token'))$$,'23505',null,'user already in one club cannot accept invitation to another');
select is((select count(*) from tasks),1::bigint,'member of other club cannot read legacy tasks');
select is((select count(*) from organization_members where user_id=auth.uid()),1::bigint,'one account has one club');
select throws_ok($$insert into tasks(camporee_id,title,created_by) values('20000000-0000-4000-8000-000000000001','Denied','10000000-0000-4000-8000-000000000005')$$,'42501',null,'member from another club cannot write legacy task');
select throws_ok($$update organization_members set role='admin' where organization_id='50000000-0000-4000-8000-000000000001' and user_id=auth.uid()$$,'42501',null,'direct membership escalation is denied');
select throws_ok($$select remove_organization_member('50000000-0000-4000-8000-000000000001',auth.uid())$$,'23514',null,'club owner cannot remove their own membership');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*) from organization_members where user_id='10000000-0000-4000-8000-000000000005'),1::bigint,'other club membership is unchanged');
select throws_ok($$select create_organization('No second club','50000000-0000-4000-8000-000000000003')$$,'23505',null,'existing member cannot create a second club');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
update camporees set status='archived' where id='60000000-0000-4000-8000-000000000001';
select is((select count(*) from tasks),1::bigint,'archived history remains readable');
select throws_ok($$insert into tasks(camporee_id,title,created_by) values('60000000-0000-4000-8000-000000000001','Archived write','10000000-0000-4000-8000-000000000005')$$,'42501',null,'archived event is read only');
select is((select count(*) from storage.objects where bucket_id='profile-avatars'),0::bigint,'unrelated avatars not exposed');
reset role;
-- A legacy organization without an owner cannot be claimed via a retry UUID.
update organizations set owner_user_id=null where id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select create_organization('Claim existing','00000000-0000-4000-8000-000000000001')$$,'23505',null,'creation retry cannot claim ownerless legacy organization');
reset role;
update organizations set owner_user_id='10000000-0000-4000-8000-000000000001' where id='00000000-0000-4000-8000-000000000001';
select is((select count(*) from auth.users),5::bigint,'membership removal never deletes Auth account');
select is((select public from storage.buckets where id='profile-avatars'),false,'avatar bucket private');
select is((select count(*) from app_members),4::bigint,'legacy authorization snapshot retained');
-- Deleting a non-owner Auth account must not cascade through authored history.
insert into tasks(id,camporee_id,title,created_by) values('90000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Author history','10000000-0000-4000-8000-000000000002');
select lives_ok($$delete from auth.users where id='10000000-0000-4000-8000-000000000002'$$,'non-owner account deletion is possible without history deletion');
select is((select count(*) from tasks where id='90000000-0000-4000-8000-000000000001'),1::bigint,'Auth deletion retains historical task');
select is((select created_by from tasks where id='90000000-0000-4000-8000-000000000001'),null::uuid,'deleted historical author is cleared by FK');
-- One physical push subscription belongs to one account, but can target
-- several camporees. Rebinding the same endpoint to another signed-in user
-- must discard ALL of the previous user's event destinations.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
-- Earlier fixture archived the first new camporee. Its admin reopens it for push tests.
update public.camporees set status='planning' where id='60000000-0000-4000-8000-000000000001';
select lives_ok($$select register_camporee_push(
  '60000000-0000-4000-8000-000000000001',
  'https://push.example.test/device-1',repeat('P',64),repeat('A',32)
)$$,'verified organization member can register a push endpoint');
select throws_ok($$select register_camporee_push(
  '60000000-0000-4000-8000-000000000002',
  'https://push.example.test/device-1',repeat('P',64),repeat('A',32)
)$$,'42501',null,'push cannot register a nonexistent second current camporee');
select is((select count(*) from push_subscriptions where endpoint='https://push.example.test/device-1'),1::bigint,
  'push endpoint remains globally unique');
select is((select cardinality(camporee_ids) from push_subscriptions where endpoint='https://push.example.test/device-1'),1,
  'one camporee target is registered for this device');
select throws_ok($$select register_camporee_push(
  '20000000-0000-4000-8000-000000000001',
  'https://push.example.test/unallowed',repeat('P',64),repeat('A',32)
)$$,'42501',null,'cannot register a camporee without membership');
select throws_ok($$update push_subscriptions
  set camporee_ids=array['20000000-0000-4000-8000-000000000001'::uuid]
  where endpoint='https://push.example.test/device-1'$$,'42501',null,'direct subscription modifications are blocked');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$select register_camporee_push(
  '20000000-0000-4000-8000-000000000001',
  'https://push.example.test/device-1',repeat('Q',64),repeat('B',32)
)$$,'shared browser endpoint can be rebound to the next signed-in account');
select is((select user_id from push_subscriptions where endpoint='https://push.example.test/device-1'),
 '10000000-0000-4000-8000-000000000001'::uuid,'rebind updates endpoint ownership');
select is((select camporee_ids from push_subscriptions where endpoint='https://push.example.test/device-1'),
 array['20000000-0000-4000-8000-000000000001'::uuid],'rebind forgets previous account targets');
reset role;

-- Reusable join code joins a verified account without choosing organizations.
insert into auth.users(id,email,email_confirmed_at) values
 ('10000000-0000-4000-8000-000000000006','guest@club.test',now()),
 ('10000000-0000-4000-8000-000000000007','unverified@club.test',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select create_camporee_join_code('60000000-0000-4000-8000-000000000001') as camporee_join_code \gset
select set_config('test.join_code', :'camporee_join_code', true);
select is(read_camporee_join_code('60000000-0000-4000-8000-000000000001'),current_setting('test.join_code'),'club director can retrieve the reusable join code');
select is(create_camporee_join_code('60000000-0000-4000-8000-000000000001'),current_setting('test.join_code'),'repeat code generation is idempotent');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
select lives_ok($$select join_camporee_by_code(current_setting('test.join_code'))$$,'verified member joins with director code');
select lives_ok($$select join_camporee_by_code(current_setting('test.join_code'))$$,'entering the same camporee twice does not duplicate membership');
select is((select count(*) from organization_members where user_id=auth.uid()),1::bigint,'new member belongs to one club');
select throws_ok($$select create_organization('Duplicated club','50000000-0000-4000-8000-000000000005')$$,'23505',null,'joined member cannot create another club');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000007',true);
select throws_ok($$select join_camporee_by_code(current_setting('test.join_code'))$$,'42501',null,'unverified account cannot join via reusable code');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok($$select join_camporee_by_code(current_setting('test.join_code'))$$,'23505',null,'legacy member cannot join another club with valid code');
select throws_ok($$select read_camporee_join_code('60000000-0000-4000-8000-000000000001')$$,'42501',null,'director cannot read code of another club');
reset role;

select finish();
