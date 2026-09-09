create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own_select on public.push_subscriptions;
create policy push_subscriptions_own_select on public.push_subscriptions
for select to authenticated using (user_id = auth.uid());

drop policy if exists push_subscriptions_own_insert on public.push_subscriptions;
create policy push_subscriptions_own_insert on public.push_subscriptions
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists push_subscriptions_own_update on public.push_subscriptions;
create policy push_subscriptions_own_update on public.push_subscriptions
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_own_delete on public.push_subscriptions;
create policy push_subscriptions_own_delete on public.push_subscriptions
for delete to authenticated using (user_id = auth.uid());

create index if not exists push_subscriptions_camporee_idx on public.push_subscriptions(camporee_id);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

create or replace function public.get_camporee_vapid_private_key()
returns text
language sql
security definer
set search_path = public, vault
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'camporee_vapid_private_key'
  order by created_at desc
  limit 1;
$$;

revoke all on function public.get_camporee_vapid_private_key() from public, anon, authenticated;
grant execute on function public.get_camporee_vapid_private_key() to service_role;
