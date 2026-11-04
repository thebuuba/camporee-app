reset role;
select has_table('public','activity_history','history exists');
select is((select count(*) from information_schema.columns where table_schema='public' and table_name='activity_history' and column_name in ('body','message','payload')),0::bigint,'history does not copy private row content');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.tasks(id,camporee_id,title,description,created_by)
values('e9000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Revisar carpas','Contenido privado','10000000-0000-4000-8000-000000000001');
select is((select action from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001' order by id desc limit 1),'created','created task recorded');
select is((select actor_id from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001' order by id desc limit 1),'10000000-0000-4000-8000-000000000001'::uuid,'actor comes from JWT');
update public.tasks set title='Carpas revisadas' where id='e9000000-0000-4000-8000-000000000001';
select is((select entity_title from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001' order by id desc limit 1),'Carpas revisadas','updated title recorded');
update public.tasks set title='Carpas revisadas' where id='e9000000-0000-4000-8000-000000000001';
select is((select count(*) from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001'),2::bigint,'no-op update omitted');
delete from public.tasks where id='e9000000-0000-4000-8000-000000000001';
select is((select action from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001' order by id desc limit 1),'deleted','deletion recorded after source row is gone');
select throws_ok($$insert into public.activity_history(camporee_id,actor_name,action,entity_type,entity_id,entity_title) values('20000000-0000-4000-8000-000000000001','Otro','created','tasks','e9000000-0000-4000-8000-000000000002','Falso')$$,'42501',null,'browser cannot forge a history entry');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.activity_history where entity_id='e9000000-0000-4000-8000-000000000001'),0::bigint,'other organization cannot see history');
reset role;
