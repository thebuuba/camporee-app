create table public.scheduled_announcements (
 id uuid primary key default gen_random_uuid(),
 camporee_id uuid not null references public.camporees(id) on delete cascade,
 title text not null check(length(trim(title))>0),
 message text not null check(length(trim(message))>0),
 priority text not null default 'normal' check(priority in ('normal','important','urgent')),
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 publish_at timestamptz not null check(publish_at>created_at)
);
create index scheduled_announcements_due_idx on public.scheduled_announcements(publish_at);
create index scheduled_announcements_camporee_idx on public.scheduled_announcements(camporee_id);
alter table public.scheduled_announcements enable row level security;
revoke all on public.scheduled_announcements from public,anon,authenticated;
grant select,insert,delete on public.scheduled_announcements to authenticated;
grant all on public.scheduled_announcements to service_role;
create policy scheduled_read on public.scheduled_announcements for select to authenticated
 using(private.can_edit_camporee(camporee_id,'schedule'));
create policy scheduled_insert on public.scheduled_announcements for insert to authenticated
 with check(private.can_edit_camporee(camporee_id,'schedule') and created_by=(select auth.uid()) and publish_at>now());
create policy scheduled_delete on public.scheduled_announcements for delete to authenticated
 using(private.can_edit_camporee(camporee_id,'schedule'));

-- The service worker publishes and queues delivery in one transaction. Concurrent
-- minute runs skip locked rows, so an announcement can only be published once.
create function public.publish_due_announcements() returns integer
language plpgsql security invoker set search_path='' as $$
declare published integer;
begin
 with due as (
  select id from public.scheduled_announcements where publish_at<=now()
  order by publish_at for update skip locked limit 100
 ), removed as (
  delete from public.scheduled_announcements s using due where s.id=due.id returning s.*
 ), inserted as (
  insert into public.announcements(camporee_id,title,message,priority,created_by)
  select s.camporee_id,s.title,s.message,s.priority,s.created_by from removed s
  join public.camporees c on c.id=s.camporee_id
  join public.organization_members m on m.organization_id=c.organization_id and m.user_id=s.created_by
  where c.status not in ('finished','archived') and m.is_active
   and (m.role in ('admin','editor') or m.permissions->'schedule'='true'::jsonb or m.permissions->'edit'='true'::jsonb)
  returning id
 ) select count(*) into published from inserted;
 return published;
end $$;
revoke all on function public.publish_due_announcements() from public,anon,authenticated;
grant execute on function public.publish_due_announcements() to service_role;
