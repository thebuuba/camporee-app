create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('admin','editor','viewer')),
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_members enable row level security;

insert into public.app_members(user_id, role)
select p.id,
       case when exists(select 1 from public.camporees c where c.owner_id = p.id) then 'admin' else 'viewer' end
from public.profiles p
on conflict (user_id) do nothing;

do $$
begin
  if not exists (select 1 from public.app_members where role='admin' and is_active) then
    update public.app_members
    set role='admin', updated_at=now()
    where user_id = (select user_id from public.app_members order by created_at asc limit 1);
  end if;
end $$;

create or replace function public.is_app_member()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_members m where m.user_id = auth.uid() and m.is_active);
$$;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_members m where m.user_id = auth.uid() and m.is_active and m.role='admin');
$$;

create or replace function public.can_edit_app()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_members m where m.user_id = auth.uid() and m.is_active and (m.role in ('admin','editor') or coalesce((m.permissions->>'edit')::boolean,false)));
$$;

create or replace function public.has_app_permission(permission_name text)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.app_members m where m.user_id = auth.uid() and m.is_active and (m.role='admin' or coalesce((m.permissions->>permission_name)::boolean,false)));
$$;

revoke all on function public.is_app_member() from public;
revoke all on function public.is_app_admin() from public;
revoke all on function public.can_edit_app() from public;
revoke all on function public.has_app_permission(text) from public;
grant execute on function public.is_app_member() to authenticated;
grant execute on function public.is_app_admin() to authenticated;
grant execute on function public.can_edit_app() to authenticated;
grant execute on function public.has_app_permission(text) to authenticated;

create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id, full_name)
  values(new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''))
  on conflict (id) do nothing;
  insert into public.app_members(user_id, role)
  values(new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create policy app_members_select_self_or_admin on public.app_members for select to authenticated using (user_id=auth.uid() or public.is_app_admin());
create policy app_members_admin_update on public.app_members for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy app_members_admin_insert on public.app_members for insert to authenticated with check (public.is_app_admin());
create policy app_members_admin_delete on public.app_members for delete to authenticated using (public.is_app_admin());

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_app_member on public.profiles for select to authenticated using (public.is_app_member());

drop policy if exists camporees_select_member on public.camporees;
drop policy if exists camporees_insert_owner on public.camporees;
drop policy if exists camporees_update_manager on public.camporees;
drop policy if exists camporees_delete_owner on public.camporees;
create policy camporees_shared_select on public.camporees for select to authenticated using (public.is_app_member());
create policy camporees_admin_insert on public.camporees for insert to authenticated with check (public.is_app_admin() and owner_id=auth.uid());
create policy camporees_admin_update on public.camporees for update to authenticated using (public.is_app_admin()) with check (public.is_app_admin());
create policy camporees_admin_delete on public.camporees for delete to authenticated using (public.is_app_admin());

drop policy if exists members_select_member on public.camporee_members;
drop policy if exists members_manage_manager on public.camporee_members;
create policy members_shared_select on public.camporee_members for select to authenticated using (public.is_app_member());
create policy members_admin_manage on public.camporee_members for all to authenticated using (public.is_app_admin()) with check (public.is_app_admin());

do $$ declare t text; begin
  foreach t in array array['areas','tasks','schedule_events','lists','meals','participants','expenses','notes','inventory_items'] loop
    execute format('drop policy if exists %I_member_all on public.%I', case when t='schedule_events' then 'schedule' when t='inventory_items' then 'inventory' else t end, t);
    execute format('create policy %I_shared_select on public.%I for select to authenticated using (public.is_app_member())', t, t);
    execute format('create policy %I_shared_write on public.%I for all to authenticated using (public.can_edit_app()) with check (public.can_edit_app())', t, t);
  end loop;
end $$;

drop policy if exists checklist_member_all on public.task_checklist_items;
create policy checklist_shared_select on public.task_checklist_items for select to authenticated using (public.is_app_member());
create policy checklist_shared_write on public.task_checklist_items for all to authenticated using (public.can_edit_app()) with check (public.can_edit_app());

drop policy if exists list_items_member_all on public.list_items;
create policy list_items_shared_select on public.list_items for select to authenticated using (public.is_app_member());
create policy list_items_shared_write on public.list_items for all to authenticated using (public.can_edit_app()) with check (public.can_edit_app());