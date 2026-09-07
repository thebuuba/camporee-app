-- New accounts wait for administrator approval. The first account in a fresh
-- installation is still promoted atomically so initial setup cannot deadlock.
alter table public.app_members alter column is_active set default false;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  bootstrap_admin boolean;
begin
  perform pg_advisory_xact_lock(hashtext('camporee:first-admin'));
  select not exists(
    select 1 from public.app_members where role='admin' and is_active
  ) into bootstrap_admin;

  insert into public.profiles(id, full_name, email)
  values(new.id, nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), ''), new.email)
  on conflict (id) do update set email=excluded.email, updated_at=now();

  insert into public.app_members(user_id, role, is_active)
  values(new.id, case when bootstrap_admin then 'admin' else 'viewer' end, bootstrap_admin)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;

-- Reading files follows application membership; changing files requires the
-- same settings permission used by the documents panel.
alter policy camporee_files_insert on storage.objects
with check (
  bucket_id='camporee-files'
  and private.is_camporee_member(((storage.foldername(name))[1])::uuid)
  and private.can_edit_module('settings')
);
alter policy camporee_files_update on storage.objects
using (
  bucket_id='camporee-files'
  and private.is_camporee_member(((storage.foldername(name))[1])::uuid)
  and private.can_edit_module('settings')
)
with check (
  bucket_id='camporee-files'
  and private.is_camporee_member(((storage.foldername(name))[1])::uuid)
  and private.can_edit_module('settings')
);
alter policy camporee_files_delete on storage.objects
using (
  bucket_id='camporee-files'
  and private.is_camporee_member(((storage.foldername(name))[1])::uuid)
  and private.can_edit_module('settings')
);

-- Supabase no longer grants API table privileges automatically for every new
-- project. Make the intended RLS-protected API surface explicit.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

alter table public.camporees drop constraint if exists camporees_date_order;
alter table public.camporees add constraint camporees_date_order check (ends_on >= starts_on);
create unique index if not exists areas_camporee_name_unique on public.areas(camporee_id, lower(trim(name)));
