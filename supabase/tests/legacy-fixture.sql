-- Disable the legacy external signup notification only while seeding fixtures.
alter table auth.users disable trigger on_auth_user_created;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','owner@club.test',now(),'{"full_name":"Owner"}'),
('10000000-0000-4000-8000-000000000002','editor@club.test',now(),'{"full_name":"Editor"}'),
('10000000-0000-4000-8000-000000000003','pending@club.test',now(),'{"full_name":"Pending"}'),
('10000000-0000-4000-8000-000000000004','rejected@club.test',now(),'{"full_name":"Rejected"}');
insert into profiles(id,email,full_name) select id,email,raw_user_meta_data->>'full_name' from auth.users;
insert into app_members(user_id,role,is_active,permissions,directive_role) values
('10000000-0000-4000-8000-000000000001','admin',true,'{}','Director'),
('10000000-0000-4000-8000-000000000002','viewer',true,'{"tasks":true}','Secretario'),
('10000000-0000-4000-8000-000000000003','viewer',false,'{}',null),
('10000000-0000-4000-8000-000000000004','viewer',false,'{"access_rejected":true}',null);
insert into camporees(id,owner_id,name,starts_on,ends_on) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Camporee legado','2026-10-01','2026-10-05');
insert into camporees(id,owner_id,name,starts_on,ends_on,status) values
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Historial legado','2025-10-01','2025-10-05','archived');
insert into tasks(id,camporee_id,title,created_by) values
('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Tarea intacta','10000000-0000-4000-8000-000000000001');
insert into task_checklist_items(id,task_id,label) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Detalle intacto');
insert into areas(id,camporee_id,name) values ('41000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Área legado');
insert into schedule_events(id,camporee_id,title,starts_at) values ('42000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Programa legado',now());
insert into lists(id,camporee_id,title) values ('43000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Lista legado');
insert into list_items(list_id,label) values ('43000000-0000-4000-8000-000000000001','Detalle lista');
insert into inventory_items(id,camporee_id,name) values ('44000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Inventario legado');
insert into meals(id,camporee_id,meal_date,meal_type,menu) values ('45000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',current_date,'breakfast','Menú legado');
insert into meal_ingredients(meal_id,name,inventory_item_id) values ('45000000-0000-4000-8000-000000000001','Ingrediente legado','44000000-0000-4000-8000-000000000001');
insert into participants(id,camporee_id,full_name) values ('46000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Participante legado');
insert into attendance_sessions(id,camporee_id,title,created_by) values ('47000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Asistencia legado','10000000-0000-4000-8000-000000000001');
insert into attendance_marks(session_id,participant_id) values ('47000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001');
insert into camporee_activities(id,camporee_id,title,schedule_event_id) values ('48000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','Actividad legado','42000000-0000-4000-8000-000000000001');
insert into camporee_activity_participants(activity_id,participant_id) values ('48000000-0000-4000-8000-000000000001','46000000-0000-4000-8000-000000000001');
insert into expenses(camporee_id,description,amount,created_by) values ('20000000-0000-4000-8000-000000000001','Gasto legado',50,'10000000-0000-4000-8000-000000000001');
insert into income_entries(camporee_id,description,amount,created_by) values ('20000000-0000-4000-8000-000000000001','Ingreso legado',100,'10000000-0000-4000-8000-000000000001');
insert into notes(camporee_id,body,created_by) values ('20000000-0000-4000-8000-000000000001','Nota legado','10000000-0000-4000-8000-000000000001');
insert into emergency_contacts(camporee_id,name,phone) values ('20000000-0000-4000-8000-000000000001','Emergencia legado','555');
insert into camporee_documents(camporee_id,title,file_path,created_by) values ('20000000-0000-4000-8000-000000000001','Documento legado','20000000-0000-4000-8000-000000000001/documents/legacy.pdf','10000000-0000-4000-8000-000000000001');
insert into announcements(camporee_id,title,message,created_by) values ('20000000-0000-4000-8000-000000000001','Aviso legado','Mensaje','10000000-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name) values ('camporee-files','20000000-0000-4000-8000-000000000001/documents/legacy.pdf');
create temp table legacy_tasks as table tasks;
create temp table legacy_members as table app_members;
create temp table legacy_rows(table_name text,data jsonb);
create temp table legacy_counts(table_name text,row_count bigint);
do $$ declare tbl text; begin
 foreach tbl in array array['profiles','app_members','camporees','camporee_members','areas','tasks','task_checklist_items','schedule_events','lists','list_items','meals','meal_ingredients','participants','expenses','income_entries','notes','inventory_items','emergency_contacts','camporee_documents','announcements','attendance_sessions','attendance_marks','camporee_activities','camporee_activity_participants'] loop
  execute format('insert into legacy_rows select %L,to_jsonb(t) from public.%I t',tbl,tbl);
  execute format('insert into legacy_counts select %L,count(*) from public.%I',tbl,tbl);
 end loop;
end $$;
alter table auth.users enable trigger on_auth_user_created;
