drop policy if exists announcements_shared_select on public.announcements;
drop policy if exists announcements_shared_write on public.announcements;
create policy announcements_shared_select on public.announcements for select using (private.is_app_member());
create policy announcements_shared_write on public.announcements for all using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));

drop policy if exists attendance_sessions_select on public.attendance_sessions;
drop policy if exists attendance_sessions_write on public.attendance_sessions;
create policy attendance_sessions_select on public.attendance_sessions for select using (private.is_app_member());
create policy attendance_sessions_write on public.attendance_sessions for all using (private.can_edit_module('participants')) with check (private.can_edit_module('participants'));

drop policy if exists attendance_marks_select on public.attendance_marks;
drop policy if exists attendance_marks_write on public.attendance_marks;
create policy attendance_marks_select on public.attendance_marks for select using (private.is_app_member());
create policy attendance_marks_write on public.attendance_marks for all using (private.can_edit_module('participants')) with check (private.can_edit_module('participants'));

drop policy if exists meal_ingredients_shared_select on public.meal_ingredients;
drop policy if exists meal_ingredients_shared_write on public.meal_ingredients;
create policy meal_ingredients_shared_select on public.meal_ingredients for select using (private.is_app_member());
create policy meal_ingredients_shared_write on public.meal_ingredients for all using (private.can_edit_module('meals')) with check (private.can_edit_module('meals'));

drop policy if exists camporee_activities_shared_select on public.camporee_activities;
drop policy if exists camporee_activities_shared_write on public.camporee_activities;
create policy camporee_activities_shared_select on public.camporee_activities for select using (private.is_app_member());
create policy camporee_activities_shared_write on public.camporee_activities for all using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));

drop policy if exists camporee_activity_participants_shared_select on public.camporee_activity_participants;
drop policy if exists camporee_activity_participants_shared_write on public.camporee_activity_participants;
create policy camporee_activity_participants_shared_select on public.camporee_activity_participants for select using (private.is_app_member());
create policy camporee_activity_participants_shared_write on public.camporee_activity_participants for all using (private.can_edit_module('schedule')) with check (private.can_edit_module('schedule'));