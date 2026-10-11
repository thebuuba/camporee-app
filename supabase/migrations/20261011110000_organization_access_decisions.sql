-- Serialize legacy pending-access decisions with all other membership changes.
create function public.decide_organization_access(target_organization uuid,target_user uuid,decision text)
returns void language plpgsql security definer set search_path='' as $$
declare member public.organization_members;
begin
 perform 1 from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 if target_user=auth.uid() then raise exception 'Cannot decide own access' using errcode='23514'; end if;
 select * into member from public.organization_members where organization_id=target_organization and user_id=target_user for update;
 if not found or member.is_active or coalesce(member.permissions->>'access_rejected','false')='true' then
  raise exception 'Request changed or is no longer pending' using errcode='23514';
 end if;
 if decision='approve' then
  update public.organization_members set is_active=true,role=case when role='admin' then 'editor' else role end,
   permissions=permissions-'access_rejected',updated_at=now() where organization_id=target_organization and user_id=target_user;
 elsif decision='reject' then
  update public.organization_members set permissions=permissions||'{"access_rejected":true}'::jsonb,updated_at=now()
   where organization_id=target_organization and user_id=target_user;
 else raise exception 'Invalid access decision' using errcode='23514';
 end if;
end $$;
revoke all on function public.decide_organization_access(uuid,uuid,text) from public,anon;
grant execute on function public.decide_organization_access(uuid,uuid,text) to authenticated;
