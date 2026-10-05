-- Club duties are separate from application access permissions.
alter table public.app_members add column directive_role text;
alter table public.app_members add constraint app_members_directive_role_length
  check (directive_role is null or char_length(trim(directive_role)) between 1 and 80);

-- Return only the directory needed to assign tasks. Membership permissions
-- remain private under app_members_select_self_or_admin.
create function public.active_task_assignees()
returns table(id uuid, full_name text, email text, directive_role text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.email, m.directive_role
  from public.app_members m
  join public.profiles p on p.id = m.user_id
  where m.is_active and private.is_app_member()
  order by p.full_name nulls last, p.id;
$$;
revoke all on function public.active_task_assignees() from public, anon;
grant execute on function public.active_task_assignees() to authenticated;
