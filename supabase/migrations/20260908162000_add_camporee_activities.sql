create table if not exists public.camporee_activities (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  title text not null,
  activity_type text not null default 'competition' check (activity_type in ('competition','honor','sport','march','talent','other')),
  starts_at timestamptz,
  location text,
  responsible_name text,
  materials text,
  result text,
  score numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.camporee_activity_participants (
  activity_id uuid not null references public.camporee_activities(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(activity_id,participant_id)
);

alter table public.camporee_activities enable row level security;
alter table public.camporee_activity_participants enable row level security;

create policy camporee_activities_shared_select on public.camporee_activities
for select using (is_app_member());
create policy camporee_activities_shared_write on public.camporee_activities
for all using (can_edit_module('schedule')) with check (can_edit_module('schedule'));
create policy camporee_activity_participants_shared_select on public.camporee_activity_participants
for select using (is_app_member());
create policy camporee_activity_participants_shared_write on public.camporee_activity_participants
for all using (can_edit_module('schedule')) with check (can_edit_module('schedule'));

create index if not exists camporee_activities_camporee_starts_idx on public.camporee_activities(camporee_id, starts_at);
create index if not exists camporee_activity_participants_participant_idx on public.camporee_activity_participants(participant_id);
