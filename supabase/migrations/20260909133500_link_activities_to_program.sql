alter table public.camporee_activities
add column if not exists schedule_event_id uuid references public.schedule_events(id) on delete set null;

create unique index if not exists camporee_activities_schedule_event_uidx
on public.camporee_activities(schedule_event_id)
where schedule_event_id is not null;
