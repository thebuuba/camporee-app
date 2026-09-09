create index if not exists announcements_created_by_idx on public.announcements(created_by);
create index if not exists attendance_marks_participant_idx on public.attendance_marks(participant_id);
create index if not exists attendance_sessions_created_by_idx on public.attendance_sessions(created_by);
