do $$
declare
  shared_table text;
begin
  foreach shared_table in array array[
    'app_members',
    'profiles',
    'camporees',
    'areas',
    'tasks',
    'task_checklist_items',
    'schedule_events',
    'lists',
    'list_items',
    'meals',
    'meal_ingredients',
    'participants',
    'expenses',
    'income_entries',
    'notes',
    'inventory_items',
    'emergency_contacts',
    'camporee_documents',
    'announcements',
    'attendance_sessions',
    'attendance_marks',
    'camporee_activities',
    'camporee_activity_participants'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables publication_table
      where publication_table.pubname = 'supabase_realtime'
        and publication_table.schemaname = 'public'
        and publication_table.tablename = shared_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', shared_table);
    end if;
  end loop;
end $$;
