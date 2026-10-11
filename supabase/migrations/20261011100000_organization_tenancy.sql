-- Apply transactionally with a coordinated application release. No IDs or files
-- are recreated. Invalid historical cross-camp references abort this migration.
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check(char_length(trim(name)) between 2 and 120),
  owner_user_id uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'viewer' check(role in ('admin','editor','viewer')),
  permissions jsonb not null default '{}' check(jsonb_typeof(permissions)='object'),
  is_active boolean not null default true,
  directive_role text check(directive_role is null or char_length(trim(directive_role)) between 1 and 80),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);
create index organization_members_user_idx on public.organization_members(user_id,organization_id);
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check(email=lower(trim(email)) and position('@' in email)>1),
  role text not null check(role in ('admin','editor','viewer')),
  permissions jsonb not null default '{}' check(jsonb_typeof(permissions)='object'),
  directive_role text check(directive_role is null or char_length(trim(directive_role)) between 1 and 80),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now()+interval '7 days',
  revoked_at timestamptz, accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations(organization_id,created_at);
alter table public.camporees add column organization_id uuid references public.organizations(id) on delete restrict;
alter table public.camporees add column time_zone text not null default 'America/Santo_Domingo';

insert into public.organizations(id,name,owner_user_id)
select '00000000-0000-4000-8000-000000000001','Organización inicial',
 (select user_id from public.app_members where is_active and role='admin' order by created_at,user_id limit 1)
where exists(select 1 from public.app_members) or exists(select 1 from public.camporees);
insert into public.organization_members(organization_id,user_id,role,permissions,is_active,directive_role,created_at,updated_at)
select '00000000-0000-4000-8000-000000000001',legacy.user_id,legacy.role,legacy.permissions,
       legacy.is_active,nullif(to_jsonb(legacy)->>'directive_role',''),legacy.created_at,legacy.updated_at
from public.app_members legacy;
update public.camporees set organization_id='00000000-0000-4000-8000-000000000001';
alter table public.camporees alter column organization_id set not null;
create index camporees_organization_idx on public.camporees(organization_id,starts_on);

-- Prevent deleting an Auth account from cascading through the event history.
alter table public.camporees alter column owner_id drop not null;
alter table public.camporees drop constraint camporees_owner_id_fkey;
alter table public.camporees add constraint camporees_owner_id_fkey foreign key(owner_id) references auth.users(id) on delete set null;
do $$ declare tbl text; begin
 foreach tbl in array array['tasks','expenses','income_entries','notes','camporee_documents','announcements','attendance_sessions'] loop
  execute format('alter table public.%I alter column created_by drop not null',tbl);
  execute format('alter table public.%I drop constraint %I',tbl,tbl||'_created_by_fkey');
  execute format('alter table public.%I add constraint %I foreign key(created_by) references auth.users(id) on delete set null',tbl,tbl||'_created_by_fkey');
 end loop;
end $$;
alter table public.profiles add column avatar_path text;
update public.profiles set avatar_path=split_part(split_part(avatar_url,'/storage/v1/object/public/profile-avatars/',2),'?',1)
where avatar_url like '%/storage/v1/object/public/profile-avatars/%';
-- Reconcile the field already consumed by the existing activity manager.
alter table public.camporee_activities add column if not exists is_completed boolean not null default false;

-- Give child rows their own verifiable scope. Triggers accept old clients that
-- omit this field, deriving it from the parent; supplied mismatches are rejected.
do $$ declare r record; begin
 for r in select * from (values
  ('task_checklist_items','task_id','tasks'),('list_items','list_id','lists'),
  ('meal_ingredients','meal_id','meals'),('attendance_marks','session_id','attendance_sessions'),
  ('camporee_activity_participants','activity_id','camporee_activities')
 ) x(tbl,parent_column,parent_table) loop
  execute format('alter table public.%I add column camporee_id uuid',r.tbl);
  execute format('update public.%I child set camporee_id=parent.camporee_id from public.%I parent where parent.id=child.%I',r.tbl,r.parent_table,r.parent_column);
  execute format('alter table public.%I alter column camporee_id set not null',r.tbl);
  execute format('create index %I on public.%I(camporee_id)',r.tbl||'_camporee_idx',r.tbl);
 end loop;
end $$;
do $$ declare tbl text; begin
 foreach tbl in array array['areas','tasks','lists','meals','inventory_items','meal_ingredients','participants','attendance_sessions','camporee_activities','schedule_events'] loop
  execute format('alter table public.%I add constraint %I unique(camporee_id,id)',tbl,tbl||'_camporee_id_unique');
 end loop;
end $$;
do $$ declare r record; fk record; begin
 for r in select * from (values
  ('tasks','area_id','areas','null'),('schedule_events','area_id','areas','null'),
  ('expenses','area_id','areas','null'),('notes','area_id','areas','null'),
  ('task_checklist_items','task_id','tasks','cascade'),('list_items','list_id','lists','cascade'),
  ('meal_ingredients','meal_id','meals','cascade'),('meal_ingredients','inventory_item_id','inventory_items','null'),
  ('list_items','source_meal_ingredient_id','meal_ingredients','null'),
  ('attendance_marks','session_id','attendance_sessions','cascade'),('attendance_marks','participant_id','participants','cascade'),
  ('camporee_activity_participants','activity_id','camporee_activities','cascade'),('camporee_activity_participants','participant_id','participants','cascade'),
  ('camporee_activities','schedule_event_id','schedule_events','null')
 ) x(tbl,col,parent,delete_action) loop
  -- Replace rather than duplicate FKs: PostgREST keeps an unambiguous relation.
  for fk in select conname from pg_constraint c join pg_attribute a on a.attrelid=c.conrelid and a.attnum=c.conkey[1]
   where c.conrelid=format('public.%I',r.tbl)::regclass and c.contype='f' and cardinality(c.conkey)=1 and a.attname=r.col loop
   execute format('alter table public.%I drop constraint %I',r.tbl,fk.conname);
  end loop;
  execute format('alter table public.%I add constraint %I foreign key(camporee_id,%I) references public.%I(camporee_id,id) %s',
   r.tbl,r.tbl||'_'||r.col||'_camporee_fk',r.col,r.parent,
   case when r.delete_action='cascade' then 'on delete cascade' else format('on delete set null (%I)',r.col) end);
 end loop;
end $$;
alter table public.camporee_documents add constraint documents_scoped_file_path
 check(file_path is null or file_path like camporee_id::text||'/%');

create function private.is_organization_member(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=target_organization and user_id=(select auth.uid()) and is_active)
$$;
create function private.is_organization_admin(target_organization uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members where organization_id=target_organization and user_id=(select auth.uid()) and is_active and role='admin')
$$;
create or replace function private.is_camporee_member(target_camporee uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.camporees c where c.id=target_camporee and private.is_organization_member(c.organization_id))
$$;
create function private.can_edit_camporee(target_camporee uuid,module_name text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.camporees c join public.organization_members m on m.organization_id=c.organization_id
  where c.id=target_camporee and c.status<>'archived' and m.user_id=(select auth.uid()) and m.is_active
   and (m.role in ('admin','editor') or m.permissions->module_name='true'::jsonb or m.permissions->'edit'='true'::jsonb))
$$;
create function private.can_view_profile(target_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select target_user=(select auth.uid()) or exists(
  select 1 from public.organization_members them join public.organization_members me using(organization_id)
  where them.user_id=target_user and me.user_id=(select auth.uid()) and me.is_active
   and (them.is_active or me.role='admin'))
$$;
create function private.path_camporee(path text)
returns uuid language sql immutable set search_path='' as $$
 select case when split_part(path,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(path,'/',1)::uuid end
$$;
create function private.enforce_camporee_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare parent_scope uuid;
begin
 if TG_NARGS=2 then
  execute format('select camporee_id from public.%I where id=($1->>%L)::uuid',TG_ARGV[0],TG_ARGV[1]) into parent_scope using to_jsonb(new);
  if new.camporee_id is null then new.camporee_id:=parent_scope; end if;
 end if;
 if TG_OP='UPDATE' and new.camporee_id is distinct from old.camporee_id then raise exception 'Camporee scope is immutable' using errcode='23514'; end if;
 if TG_OP='UPDATE' and to_jsonb(new)->'created_by' is distinct from to_jsonb(old)->'created_by' then
  -- The Auth FK may clear a deleted account; ordinary edits preserve authorship.
  if to_jsonb(new)->>'created_by' is not null or exists(select 1 from auth.users where id=(to_jsonb(old)->>'created_by')::uuid) then
   raise exception 'Original author is immutable' using errcode='23514';
  end if;
 end if;
 if TG_TABLE_NAME='tasks' then
  if new.assigned_to is not null and (TG_OP='INSERT' or new.assigned_to is distinct from old.assigned_to) then
   if not exists(select 1 from public.organization_members m join public.camporees c on c.organization_id=m.organization_id
    where c.id=new.camporee_id and m.user_id=new.assigned_to and m.is_active) then
    raise exception 'Assignee must be an active organization member' using errcode='23514';
   end if;
  end if;
 end if;
 return new;
end $$;
create function private.enforce_organization_scope()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.organization_id is distinct from old.organization_id then raise exception 'Organization scope is immutable' using errcode='23514'; end if;
 return new;
end $$;
create trigger camporees_immutable_organization before update on public.camporees for each row execute function private.enforce_organization_scope();
do $$ declare r record; begin
 for r in select * from (values
  ('areas',null,null),('tasks',null,null),('schedule_events',null,null),('lists',null,null),('meals',null,null),
  ('participants',null,null),('expenses',null,null),('income_entries',null,null),('notes',null,null),('inventory_items',null,null),
  ('emergency_contacts',null,null),('camporee_documents',null,null),('announcements',null,null),('attendance_sessions',null,null),('camporee_activities',null,null),
  ('task_checklist_items','tasks','task_id'),('list_items','lists','list_id'),('meal_ingredients','meals','meal_id'),
  ('attendance_marks','attendance_sessions','session_id'),('camporee_activity_participants','camporee_activities','activity_id')
 ) x(tbl,parent,parent_column) loop
  execute format('create trigger enforce_camporee_scope before insert or update on public.%I for each row execute function private.enforce_camporee_scope(%s)',r.tbl,
   case when r.parent is null then '' else format('%L,%L',r.parent,r.parent_column) end);
 end loop;
end $$;

-- Remove every permissive predecessor, not merely the policies whose names we
-- remember. PostgreSQL OR-combines permissive policies.
do $$ declare p record; begin
 for p in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename=any(array[
 'organizations','organization_members','organization_invitations','profiles','app_members','camporees','camporee_members',
 'areas','tasks','task_checklist_items','schedule_events','lists','list_items','meals','meal_ingredients','participants','expenses','income_entries','notes','inventory_items','emergency_contacts','camporee_documents','announcements','attendance_sessions','attendance_marks','camporee_activities','camporee_activity_participants','push_subscriptions']) loop
  execute format('drop policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
 end loop;
end $$;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
create policy organizations_read on public.organizations for select to authenticated using(private.is_organization_member(id));
create policy memberships_read on public.organization_members for select to authenticated
 using(user_id=(select auth.uid()) or private.is_organization_admin(organization_id));
create policy invitations_admin_read on public.organization_invitations for select to authenticated using(private.is_organization_admin(organization_id));
revoke all on public.organizations,public.organization_members,public.organization_invitations from anon,authenticated;
grant select on public.organizations,public.organization_members,public.organization_invitations to authenticated;
create policy profiles_read_scoped on public.profiles for select to authenticated using(private.can_view_profile(id));
create policy profiles_update_self on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy legacy_members_read on public.app_members for select to authenticated
 using(user_id=(select auth.uid()) or private.is_organization_admin('00000000-0000-4000-8000-000000000001'));
revoke insert,update,delete on public.app_members,public.camporee_members from authenticated;
create policy camporee_members_history_read on public.camporee_members for select to authenticated using(private.is_camporee_member(camporee_id));
create policy camporees_read on public.camporees for select to authenticated using(private.is_organization_member(organization_id));
create policy camporees_admin_update on public.camporees for update to authenticated using(private.is_organization_admin(organization_id)) with check(private.is_organization_admin(organization_id));
-- Creation is an atomic RPC; history is archived, never deleted from the API.
revoke insert,delete on public.camporees from authenticated;
do $$ declare r record; begin
 for r in select * from (values
 ('areas','settings'),('tasks','tasks'),('task_checklist_items','tasks'),('schedule_events','schedule'),
 ('lists','lists'),('list_items','lists'),('meals','meals'),('meal_ingredients','meals'),('participants','participants'),
 ('expenses','finances'),('income_entries','finances'),('notes','notes'),('inventory_items','inventory'),('emergency_contacts','participants'),
 ('camporee_documents','settings'),('announcements','schedule'),('attendance_sessions','participants'),('attendance_marks','participants'),
 ('camporee_activities','schedule'),('camporee_activity_participants','schedule')
 ) x(tbl,module_name) loop
  execute format('create policy tenant_read on public.%I for select to authenticated using(private.is_camporee_member(camporee_id))',r.tbl);
  execute format('create policy tenant_insert on public.%I for insert to authenticated with check(private.can_edit_camporee(camporee_id,%L)%s)',r.tbl,r.module_name,
   case when r.tbl=any(array['tasks','expenses','income_entries','notes','camporee_documents','announcements','attendance_sessions']) then ' and created_by=(select auth.uid())' else '' end);
  execute format('create policy tenant_update on public.%I for update to authenticated using(private.can_edit_camporee(camporee_id,%L)) with check(private.can_edit_camporee(camporee_id,%L))',r.tbl,r.module_name,r.module_name);
  execute format('create policy tenant_delete on public.%I for delete to authenticated using(private.can_edit_camporee(camporee_id,%L))',r.tbl,r.module_name);
 end loop;
end $$;
-- Legacy global helpers are no longer an authorization surface.
revoke all on function private.is_app_member(),private.is_app_admin(),private.can_edit_module(text) from authenticated,anon,public;
do $$ begin
  -- Some production databases never had this optional helper; do not fail
  -- the tenant migration just because no legacy function exists to revoke.
  if to_regprocedure('public.active_task_assignees()') is not null then
    execute 'revoke all on function public.active_task_assignees() from authenticated,anon,public';
  end if;
end $$;

-- Storage object names stay intact. Object scope changes are forbidden too.
do $$ declare p record; begin
 for p in select policyname from pg_policies where schemaname='storage' and tablename='objects' and
 (policyname like 'camporee_files_%' or policyname like 'profile_avatars_%') loop
  execute format('drop policy %I on storage.objects',p.policyname);
 end loop;
end $$;
update storage.buckets set public=false where id='profile-avatars';
create policy camporee_files_read on storage.objects for select to authenticated
 using(bucket_id='camporee-files' and private.is_camporee_member(private.path_camporee(name)));
create policy camporee_files_insert on storage.objects for insert to authenticated
 with check(bucket_id='camporee-files' and private.can_edit_camporee(private.path_camporee(name),'settings'));
create policy camporee_files_update on storage.objects for update to authenticated
 using(bucket_id='camporee-files' and private.can_edit_camporee(private.path_camporee(name),'settings'))
 with check(bucket_id='camporee-files' and private.can_edit_camporee(private.path_camporee(name),'settings'));
create policy camporee_files_delete on storage.objects for delete to authenticated
 using(bucket_id='camporee-files' and private.can_edit_camporee(private.path_camporee(name),'settings'));
create policy profile_avatars_read on storage.objects for select to authenticated
 using(bucket_id='profile-avatars' and private.can_view_profile(private.path_camporee(name)));
create policy profile_avatars_insert_own on storage.objects for insert to authenticated
 with check(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
create policy profile_avatars_update_own on storage.objects for update to authenticated
 using(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text)
 with check(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
create policy profile_avatars_delete_own on storage.objects for delete to authenticated
 using(bucket_id='profile-avatars' and split_part(name,'/',1)=(select auth.uid())::text);
create function private.enforce_storage_scope()
returns trigger language plpgsql set search_path='' as $$
begin
 if old.bucket_id in ('camporee-files','profile-avatars') and
  (new.bucket_id is distinct from old.bucket_id or split_part(new.name,'/',1) is distinct from split_part(old.name,'/',1))
 then raise exception 'Storage scope is immutable' using errcode='23514'; end if;
 return new;
end $$;
create trigger enforce_tenant_storage_scope before update on storage.objects for each row execute function private.enforce_storage_scope();
create policy push_read_own on public.push_subscriptions for select to authenticated using(user_id=(select auth.uid()));
create policy push_insert_own on public.push_subscriptions for insert to authenticated with check(user_id=(select auth.uid()) and private.is_camporee_member(camporee_id));
create policy push_update_own on public.push_subscriptions for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()) and private.is_camporee_member(camporee_id));
create policy push_delete_own on public.push_subscriptions for delete to authenticated using(user_id=(select auth.uid()));

-- New accounts get a personal profile, without global access/bootstrap races.
create or replace function public.handle_new_user_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,full_name,email)
 values(new.id,nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')),''),new.email)
 on conflict(id) do update set email=excluded.email,updated_at=now();
 return new;
end $$;

create function public.create_organization(organization_name text,organization_uuid uuid default gen_random_uuid())
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); existing_owner uuid;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Verified account required' using errcode='42501'; end if;
 -- Serialize retries of the same request, including across browser tabs.
 perform pg_advisory_xact_lock(hashtextextended(organization_uuid::text,0));
 select owner_user_id into existing_owner from public.organizations where id=organization_uuid;
 if found then
  if existing_owner is distinct from actor then raise exception 'Organization ID already exists' using errcode='23505'; end if;
  return organization_uuid;
 end if;
 insert into public.organizations(id,name,owner_user_id) values(organization_uuid,trim(organization_name),actor);
 insert into public.organization_members(organization_id,user_id,role) values(organization_uuid,actor,'admin');
 return organization_uuid;
end $$;
create function public.create_camporee(target_organization uuid,camporee_name text,start_date date,end_date date,camporee_uuid uuid default gen_random_uuid(),camporee_location text default null,camporee_theme text default null,camporee_currency text default 'DOP',camporee_time_zone text default 'America/Santo_Domingo')
returns uuid language plpgsql security definer set search_path='' as $$
declare existing_org uuid;
begin
 perform 1 from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 if not exists(select 1 from pg_timezone_names where name=camporee_time_zone) then raise exception 'Invalid time zone' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(camporee_uuid::text,0));
 select organization_id into existing_org from public.camporees where id=camporee_uuid;
 if found then
  if existing_org<>target_organization then raise exception 'Camporee ID already exists' using errcode='23505'; end if;
  return camporee_uuid;
 end if;
 insert into public.camporees(id,organization_id,owner_id,name,starts_on,ends_on,location,theme,currency,time_zone)
 values(camporee_uuid,target_organization,auth.uid(),trim(camporee_name),start_date,end_date,nullif(trim(camporee_location),''),nullif(trim(camporee_theme),''),camporee_currency,camporee_time_zone);
 insert into public.areas(camporee_id,name,icon,sort_order)
 select camporee_uuid,name,icon,ordinality::integer from unnest(
 array['Alimentación','Campamento','Transporte','Equipaje','Finanzas','Salud','Espiritual','Actividades','Administración','Compras'],
 array['utensils','tent','bus','backpack','wallet','heart-pulse','book-open','target','clipboard-list','shopping-cart']) with ordinality as x(name,icon,ordinality);
 return camporee_uuid;
end $$;
create function public.create_organization_invitation(target_organization uuid,invited_email text,invited_role text default 'viewer',invited_permissions jsonb default '{}',invited_directive_role text default null)
returns text language plpgsql security definer set search_path='' as $$
declare token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 perform 1 from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 insert into public.organization_invitations(organization_id,email,role,permissions,directive_role,token_hash,invited_by)
 values(target_organization,lower(trim(invited_email)),invited_role,invited_permissions,nullif(trim(invited_directive_role),''),encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 return token;
end $$;
create function public.accept_organization_invitation(invitation_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invite public.organization_invitations; actor uuid:=auth.uid(); verified_email text; invite_org uuid;
begin
 select lower(trim(email)) into verified_email from auth.users where id=actor and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verified account required' using errcode='42501'; end if;
 select organization_id into invite_org from public.organization_invitations where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex');
 -- Always lock organization before invitation to match all administrative RPCs.
 perform 1 from public.organizations where id=invite_org for update;
 select * into invite from public.organization_invitations where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex') for update;
 if not found or invite.email<>verified_email then raise exception 'Invitation unavailable for this account' using errcode='42501'; end if;
 if invite.accepted_at is not null or invite.revoked_at is not null or invite.expires_at<=now() then raise exception 'Invitation expired or already used' using errcode='23514'; end if;
 if not exists(select 1 from public.organization_members where organization_id=invite.organization_id and user_id=invite.invited_by and role='admin' and is_active) then raise exception 'Inviter no longer authorized' using errcode='42501'; end if;
 -- Invitations never overwrite a membership or silently revive revoked access.
 if exists(select 1 from public.organization_members where organization_id=invite.organization_id and user_id=actor) then raise exception 'Membership already exists' using errcode='23514'; end if;
 insert into public.organization_members(organization_id,user_id,role,permissions,directive_role)
 values(invite.organization_id,actor,invite.role,invite.permissions,invite.directive_role);
 update public.organization_invitations set accepted_at=now(),accepted_by=actor where id=invite.id;
 return invite.organization_id;
end $$;
create function public.update_organization_member(target_organization uuid,target_user uuid,member_role text,member_permissions jsonb,member_active boolean,member_directive_role text default null)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select owner_user_id into owner_id from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 if target_user=owner_id and (member_role<>'admin' or not member_active) then raise exception 'Owner must remain active admin' using errcode='23514'; end if;
 if (member_role<>'admin' or not member_active) and not exists(select 1 from public.organization_members where organization_id=target_organization and user_id<>target_user and role='admin' and is_active) then raise exception 'Organization needs an active administrator' using errcode='23514'; end if;
 update public.organization_members set role=member_role,permissions=member_permissions,is_active=member_active,directive_role=nullif(trim(member_directive_role),''),updated_at=now()
 where organization_id=target_organization and user_id=target_user;
 if not found then raise exception 'Membership not found' using errcode='23514'; end if;
end $$;
create function public.remove_organization_member(target_organization uuid,target_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 select owner_user_id into owner_id from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 if target_user=owner_id then raise exception 'Transfer ownership before removing owner' using errcode='23514'; end if;
 if not exists(select 1 from public.organization_members where organization_id=target_organization and user_id<>target_user and role='admin' and is_active) then raise exception 'Organization needs an active administrator' using errcode='23514'; end if;
 delete from public.organization_members where organization_id=target_organization and user_id=target_user;
end $$;
create function public.revoke_organization_invitation(target_organization uuid,invitation_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.organizations where id=target_organization for update;
 if not private.is_organization_admin(target_organization) then raise exception 'Organization admin required' using errcode='42501'; end if;
 update public.organization_invitations set revoked_at=now() where id=invitation_id and organization_id=target_organization and accepted_at is null;
end $$;
create function public.transfer_organization_ownership(target_organization uuid,new_owner uuid)
returns void language plpgsql security definer set search_path='' as $$
declare current_owner uuid;
begin
 select owner_user_id into current_owner from public.organizations where id=target_organization for update;
 if current_owner is distinct from auth.uid() or not private.is_organization_admin(target_organization) then raise exception 'Owner required' using errcode='42501'; end if;
 if not exists(select 1 from public.organization_members where organization_id=target_organization and user_id=new_owner and is_active and role='admin') then raise exception 'New owner must be an active administrator' using errcode='23514'; end if;
 update public.organizations set owner_user_id=new_owner,updated_at=now() where id=target_organization;
end $$;
create function public.organization_task_assignees(target_organization uuid)
returns table(id uuid,full_name text,email text,directive_role text)
language sql stable security definer set search_path='' as $$
 select p.id,p.full_name,p.email,m.directive_role from public.organization_members m join public.profiles p on p.id=m.user_id
 where m.organization_id=target_organization and m.is_active and private.is_organization_member(target_organization)
 order by p.full_name nulls last,p.id
$$;

-- Explicit grants: SECURITY DEFINER RPCs must never inherit PUBLIC execution.
revoke all on all functions in schema private from public,anon;
grant execute on function private.is_organization_member(uuid),private.is_organization_admin(uuid),private.is_camporee_member(uuid),private.can_edit_camporee(uuid,text),private.can_view_profile(uuid),private.path_camporee(text) to authenticated;
do $$ declare r record; begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=any(array[
 'create_organization','create_camporee','create_organization_invitation','accept_organization_invitation','update_organization_member','remove_organization_member','revoke_organization_invitation','transfer_organization_ownership','organization_task_assignees']) loop
  execute format('revoke all on function %s from public,anon,authenticated',r.signature);
  execute format('grant execute on function %s to authenticated',r.signature);
 end loop;
end $$;
revoke all on function public.handle_new_user_profile() from public,anon,authenticated;
