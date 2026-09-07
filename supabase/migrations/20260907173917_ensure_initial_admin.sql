do $$
begin
  if not exists (select 1 from public.app_members where role='admin' and is_active) then
    update public.app_members
    set role='admin', is_active=true, updated_at=now()
    where user_id = (select user_id from public.app_members order by created_at asc limit 1);
  end if;
end $$;
