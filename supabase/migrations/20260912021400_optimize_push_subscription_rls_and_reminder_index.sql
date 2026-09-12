drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
for delete to authenticated using (user_id = (select auth.uid()));

create index if not exists system_push_reminder_log_user_idx
on public.system_push_reminder_log(user_id);
