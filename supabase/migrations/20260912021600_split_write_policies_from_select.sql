drop policy if exists announcements_shared_write on public.announcements;
create policy announcements_shared_insert on public.announcements for insert with check (private.can_edit_module('schedule'));
create policy announcements_shared_update on public.announcements for update using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));
create policy announcements_shared_delete on public.announcements for delete using (private.can_edit_module('schedule'));

drop policy if exists attendance_marks_write on public.attendance_marks;
create policy attendance_marks_insert on public.attendance_marks for insert with check (private.can_edit_module('participants'));
create policy attendance_marks_update on public.attendance_marks for update using (private.can_edit_module('participants')) with check (private.can_edit_module('participants'));
create policy attendance_marks_delete on public.attendance_marks for delete using (private.can_edit_module('participants'));

drop policy if exists attendance_sessions_write on public.attendance_sessions;
create policy attendance_sessions_insert on public.attendance_sessions for insert with check (private.can_edit_module('participants'));
create policy attendance_sessions_update on public.attendance_sessions for update using (private.can_edit_module('participants')) with check (private.can_edit_module('participants'));
create policy attendance_sessions_delete on public.attendance_sessions for delete using (private.can_edit_module('participants'));

drop policy if exists camporee_activities_shared_write on public.camporee_activities;
create policy camporee_activities_shared_insert on public.camporee_activities for insert with check (private.can_edit_module('schedule'));
create policy camporee_activities_shared_update on public.camporee_activities for update using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));
create policy camporee_activities_shared_delete on public.camporee_activities for delete using (private.can_edit_module('schedule'));

drop policy if exists camporee_activity_participants_shared_write on public.camporee_activity_participants;
create policy camporee_activity_participants_shared_insert on public.camporee_activity_participants for insert with check (private.can_edit_module('schedule'));
create policy camporee_activity_participants_shared_update on public.camporee_activity_participants for update using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));
create policy camporee_activity_participants_shared_delete on public.camporee_activity_participants for delete using (private.can_edit_module('schedule'));

drop policy if exists meal_ingredients_shared_write on public.meal_ingredients;
create policy meal_ingredients_shared_insert on public.meal_ingredients for insert with check (private.can_edit_module('meals'));
create policy meal_ingredients_shared_update on public.meal_ingredients for update using (private.can_edit_module('meals')) with check (private.can_edit_module('meals'));
create policy meal_ingredients_shared_delete on public.meal_ingredients for delete using (private.can_edit_module('meals'));
