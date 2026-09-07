alter table public.profiles add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is distinct from u.email;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  insert into public.profiles(id, full_name, email)
  values(new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email)
  on conflict (id) do update set email = excluded.email;
  insert into public.app_members(user_id, role)
  values(new.id, 'viewer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create or replace function public.can_edit_module(module_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public'
as $$
  select exists(
    select 1
    from public.app_members m
    where m.user_id = auth.uid()
      and m.is_active
      and (
        m.role in ('admin','editor')
        or coalesce((m.permissions ->> module_name)::boolean, false)
        or coalesce((m.permissions ->> 'edit')::boolean, false)
      )
  );
$$;

revoke all on function public.can_edit_module(text) from public;
grant execute on function public.can_edit_module(text) to authenticated;

drop policy if exists tasks_shared_write on public.tasks;
create policy tasks_shared_write on public.tasks for all using (public.can_edit_module('tasks')) with check (public.can_edit_module('tasks'));

drop policy if exists schedule_events_shared_write on public.schedule_events;
create policy schedule_events_shared_write on public.schedule_events for all using (public.can_edit_module('schedule')) with check (public.can_edit_module('schedule'));

drop policy if exists participants_shared_write on public.participants;
create policy participants_shared_write on public.participants for all using (public.can_edit_module('participants')) with check (public.can_edit_module('participants'));

drop policy if exists expenses_shared_write on public.expenses;
create policy expenses_shared_write on public.expenses for all using (public.can_edit_module('finances')) with check (public.can_edit_module('finances'));

drop policy if exists meals_shared_write on public.meals;
create policy meals_shared_write on public.meals for all using (public.can_edit_module('meals')) with check (public.can_edit_module('meals'));

drop policy if exists notes_shared_write on public.notes;
create policy notes_shared_write on public.notes for all using (public.can_edit_module('notes')) with check (public.can_edit_module('notes'));

drop policy if exists lists_shared_write on public.lists;
create policy lists_shared_write on public.lists for all using (public.can_edit_module('lists')) with check (public.can_edit_module('lists'));

drop policy if exists list_items_shared_write on public.list_items;
create policy list_items_shared_write on public.list_items for all using (public.can_edit_module('lists')) with check (public.can_edit_module('lists'));

drop policy if exists inventory_items_shared_write on public.inventory_items;
create policy inventory_items_shared_write on public.inventory_items for all using (public.can_edit_module('inventory')) with check (public.can_edit_module('inventory'));

drop policy if exists areas_shared_write on public.areas;
create policy areas_shared_write on public.areas for all using (public.can_edit_module('settings')) with check (public.can_edit_module('settings'));

drop policy if exists checklist_member_all on public.task_checklist_items;
drop policy if exists checklist_shared_select on public.task_checklist_items;
drop policy if exists checklist_shared_write on public.task_checklist_items;
create policy checklist_shared_select on public.task_checklist_items for select using (public.is_app_member());
create policy checklist_shared_write on public.task_checklist_items for all using (public.can_edit_module('tasks')) with check (public.can_edit_module('tasks'));
