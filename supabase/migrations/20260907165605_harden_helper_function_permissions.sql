-- Restores the helper functions that existed in the original production baseline.
-- Keeping them here lets a fresh database follow the same migration versions as production.
create or replace function public.is_camporee_member(target_camporee uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from public.camporees c
    where c.id = target_camporee
      and (
        c.owner_id = (select auth.uid())
        or exists(select 1 from public.camporee_members m where m.camporee_id=c.id and m.user_id=(select auth.uid()))
      )
  );
$$;

create or replace function public.can_manage_camporee(target_camporee uuid)
returns boolean language sql stable security definer set search_path=public,auth as $$
  select exists(
    select 1 from public.camporees c
    where c.id = target_camporee
      and (
        c.owner_id = (select auth.uid())
        or exists(
          select 1 from public.camporee_members m
          where m.camporee_id=c.id and m.user_id=(select auth.uid()) and m.role in ('admin','director')
        )
      )
  );
$$;

revoke execute on function public.is_camporee_member(uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_camporee(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;

create policy profiles_update_self on public.profiles for update to authenticated
using (id=(select auth.uid())) with check (id=(select auth.uid()));

create policy camporee_files_select on storage.objects for select to authenticated
using (bucket_id='camporee-files' and public.is_camporee_member(((storage.foldername(name))[1])::uuid));
create policy camporee_files_insert on storage.objects for insert to authenticated
with check (bucket_id='camporee-files' and public.is_camporee_member(((storage.foldername(name))[1])::uuid));
create policy camporee_files_update on storage.objects for update to authenticated
using (bucket_id='camporee-files' and public.is_camporee_member(((storage.foldername(name))[1])::uuid))
with check (bucket_id='camporee-files' and public.is_camporee_member(((storage.foldername(name))[1])::uuid));
create policy camporee_files_delete on storage.objects for delete to authenticated
using (bucket_id='camporee-files' and public.is_camporee_member(((storage.foldername(name))[1])::uuid));
