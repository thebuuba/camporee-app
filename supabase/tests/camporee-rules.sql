reset role;
select is((select count(*) from public.camporee_rule_sets),(select count(*) from public.camporees),'existing camporees receive a rule list');
select is((select cardinality(rules) from public.camporee_rule_sets where camporee_id='20000000-0000-4000-8000-000000000001'),14,'published rules are preserved');
select ok(exists(select 1 from pg_trigger where tgname='seed_camporee_rules' and not tgisinternal),'new camporees receive rules automatically');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok($$update public.camporee_rule_sets set rules=array['Respetar al equipo.','Cuidar el agua.'] where camporee_id='20000000-0000-4000-8000-000000000001'$$,'admin can edit and add rules');
select is((select rules from public.camporee_rule_sets where camporee_id='20000000-0000-4000-8000-000000000001'),array['Respetar al equipo.','Cuidar el agua.'],'edits persist in order');
select throws_ok($$update public.camporee_rule_sets set rules='{}' where camporee_id='20000000-0000-4000-8000-000000000001'$$,'23514',null,'empty rule list is rejected');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.camporee_rule_sets),0::bigint,'inactive member cannot read rules');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
with changed as (update public.camporee_rule_sets set rules=array['Intrusión'] where camporee_id='20000000-0000-4000-8000-000000000001' returning id)
select is(count(*),0::bigint,'another organization cannot edit rules') from changed;
reset role;
