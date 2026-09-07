create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.is_app_member()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.is_active)
$$;
create or replace function private.is_app_admin()
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.is_active and m.role='admin')
$$;
create or replace function private.can_edit_module(module_name text)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.is_active and (m.role in ('admin','editor') or coalesce((m.permissions->>module_name)::boolean,false) or coalesce((m.permissions->>'edit')::boolean,false)))
$$;
create or replace function private.is_camporee_member(target_camporee uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select private.is_app_member() and exists(select 1 from public.camporees c where c.id=target_camporee)
$$;
revoke all on all functions in schema private from public, anon;
grant execute on function private.is_app_member() to authenticated;
grant execute on function private.is_app_admin() to authenticated;
grant execute on function private.can_edit_module(text) to authenticated;
grant execute on function private.is_camporee_member(uuid) to authenticated;

alter policy profiles_select_app_member on public.profiles to authenticated using (private.is_app_member());
alter policy profiles_update_self on public.profiles to authenticated using (id=(select auth.uid())) with check (id=(select auth.uid()));
alter policy app_members_select_self_or_admin on public.app_members to authenticated using (user_id=(select auth.uid()) or private.is_app_admin());
alter policy app_members_admin_update on public.app_members to authenticated using (private.is_app_admin()) with check (private.is_app_admin());
alter policy app_members_admin_insert on public.app_members to authenticated with check (private.is_app_admin());
alter policy app_members_admin_delete on public.app_members to authenticated using (private.is_app_admin());
alter policy camporees_shared_select on public.camporees to authenticated using (private.is_app_member());
alter policy camporees_admin_insert on public.camporees to authenticated with check (private.is_app_admin() and owner_id=(select auth.uid()));
alter policy camporees_admin_update on public.camporees to authenticated using (private.is_app_admin()) with check (private.is_app_admin());
alter policy camporees_admin_delete on public.camporees to authenticated using (private.is_app_admin());
alter policy members_shared_select on public.camporee_members to authenticated using (private.is_app_member());
drop policy if exists members_admin_manage on public.camporee_members;
create policy members_admin_insert on public.camporee_members for insert to authenticated with check (private.is_app_admin());
create policy members_admin_update on public.camporee_members for update to authenticated using (private.is_app_admin()) with check (private.is_app_admin());
create policy members_admin_delete on public.camporee_members for delete to authenticated using (private.is_app_admin());

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('areas','areas_shared_select','settings'),('tasks','tasks_shared_select','tasks'),('schedule_events','schedule_events_shared_select','schedule'),('lists','lists_shared_select','lists'),('list_items','list_items_shared_select','lists'),('meals','meals_shared_select','meals'),('participants','participants_shared_select','participants'),('expenses','expenses_shared_select','finances'),('notes','notes_shared_select','notes'),('inventory_items','inventory_items_shared_select','inventory'),('task_checklist_items','checklist_shared_select','tasks'),('emergency_contacts','emergency_shared_select','participants'),('camporee_documents','documents_shared_select','settings')
  ) AS x(tbl, selpol, module_name)
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I', replace(r.selpol,'_select','_write'), r.tbl);
    IF r.tbl='task_checklist_items' THEN EXECUTE 'drop policy if exists checklist_shared_write on public.task_checklist_items'; END IF;
    IF r.tbl='emergency_contacts' THEN EXECUTE 'drop policy if exists emergency_shared_write on public.emergency_contacts'; END IF;
    IF r.tbl='camporee_documents' THEN EXECUTE 'drop policy if exists documents_shared_write on public.camporee_documents'; END IF;
    EXECUTE format('alter policy %I on public.%I to authenticated using (private.is_app_member())', r.selpol, r.tbl);
    EXECUTE format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_module(%L))', r.tbl||'_insert', r.tbl, r.module_name);
    EXECUTE format('create policy %I on public.%I for update to authenticated using (private.can_edit_module(%L)) with check (private.can_edit_module(%L))', r.tbl||'_update', r.tbl, r.module_name, r.module_name);
    EXECUTE format('create policy %I on public.%I for delete to authenticated using (private.can_edit_module(%L))', r.tbl||'_delete', r.tbl, r.module_name);
  END LOOP;
END $$;

alter policy camporee_files_select on storage.objects using (bucket_id='camporee-files' and private.is_camporee_member(((storage.foldername(name))[1])::uuid));
alter policy camporee_files_insert on storage.objects with check (bucket_id='camporee-files' and private.is_camporee_member(((storage.foldername(name))[1])::uuid));
alter policy camporee_files_update on storage.objects using (bucket_id='camporee-files' and private.is_camporee_member(((storage.foldername(name))[1])::uuid)) with check (bucket_id='camporee-files' and private.is_camporee_member(((storage.foldername(name))[1])::uuid));
alter policy camporee_files_delete on storage.objects using (bucket_id='camporee-files' and private.is_camporee_member(((storage.foldername(name))[1])::uuid));

revoke all on function public.is_app_member() from public, anon, authenticated;
revoke all on function public.is_app_admin() from public, anon, authenticated;
revoke all on function public.can_edit_app() from public, anon, authenticated;
revoke all on function public.has_app_permission(text) from public, anon, authenticated;
revoke all on function public.can_edit_module(text) from public, anon, authenticated;
revoke all on function public.is_camporee_member(uuid) from public, anon, authenticated;
revoke all on function public.can_manage_camporee(uuid) from public, anon, authenticated;

create index if not exists idx_camporees_owner_id on public.camporees(owner_id);
create index if not exists idx_camporee_members_user_id on public.camporee_members(user_id);
create index if not exists idx_tasks_area_id on public.tasks(area_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_task_checklist_task_id on public.task_checklist_items(task_id);
create index if not exists idx_schedule_events_area_id on public.schedule_events(area_id);
create index if not exists idx_lists_camporee_id on public.lists(camporee_id);
create index if not exists idx_list_items_list_id on public.list_items(list_id);
create index if not exists idx_meals_camporee_id on public.meals(camporee_id);
create index if not exists idx_expenses_area_id on public.expenses(area_id);
create index if not exists idx_expenses_created_by on public.expenses(created_by);
create index if not exists idx_notes_area_id on public.notes(area_id);
create index if not exists idx_notes_created_by on public.notes(created_by);
create index if not exists idx_inventory_camporee_id on public.inventory_items(camporee_id);
create index if not exists idx_documents_created_by on public.camporee_documents(created_by);
