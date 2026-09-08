create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  title text not null,
  session_type text not null default 'general' check (session_type in ('general','departure','arrival','activity','worship','night','return')),
  occurred_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance_marks (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique(session_id, participant_id)
);

alter table public.attendance_sessions enable row level security;
alter table public.attendance_marks enable row level security;

create policy attendance_sessions_select on public.attendance_sessions for select using (is_app_member());
create policy attendance_sessions_write on public.attendance_sessions for all using (can_edit_module('participants')) with check (can_edit_module('participants'));
create policy attendance_marks_select on public.attendance_marks for select using (is_app_member());
create policy attendance_marks_write on public.attendance_marks for all using (can_edit_module('participants')) with check (can_edit_module('participants'));

create index if not exists attendance_sessions_camporee_idx on public.attendance_sessions(camporee_id, occurred_at desc);
create index if not exists attendance_marks_session_idx on public.attendance_marks(session_id, participant_id);
