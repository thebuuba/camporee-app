create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  title text not null,
  message text not null,
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.announcements enable row level security;

create policy announcements_shared_select on public.announcements
for select using (is_app_member());

create policy announcements_shared_write on public.announcements
for all using (can_edit_module('schedule'))
with check (can_edit_module('schedule'));

create index if not exists announcements_camporee_created_idx
on public.announcements(camporee_id, created_at desc);
