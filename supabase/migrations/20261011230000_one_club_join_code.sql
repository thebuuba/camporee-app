-- One user has one club membership. The app automatically opens that
-- club's current camporee; archived history is not a camporee switcher.
-- No existing memberships or camporee records are deleted.
do $$ begin
  if exists (
    select user_id from public.organization_members
    group by user_id having count(*)>1
  ) then raise exception 'Cannot enable one-club accounts while multi-club memberships exist'; end if;
end $$;
create unique index if not exists organization_members_one_club_per_user
  on public.organization_members(user_id);

-- Keep only one non-archived camporee for each club. Old archived camporees
-- remain in the database for history. A director must archive the old one
-- before creating the next camporee, without offering users a switcher.
do $$ begin
  if exists (
    select organization_id from public.camporees
    where status<>'archived' group by organization_id having count(*)>1
  ) then raise exception 'Archive previous camporees before enabling one current camporee per club'; end if;
end $$;
create unique index if not exists camporees_one_current_per_club
  on public.camporees(organization_id) where status<>'archived';

-- Codes are 64 bits of random data. They can be reused by multiple people.
-- Codes are not exposed through public tables; only an organization admin
-- can request the code and only a verified user can redeem it.
create table public.camporee_join_codes (
  camporee_id uuid primary key references public.camporees(id) on delete cascade,
  code text not null unique check(code ~ '^[A-F0-9]{16}$'),
  created_at timestamptz not null default now()
);
alter table public.camporee_join_codes enable row level security;
revoke all on public.camporee_join_codes from public,anon,authenticated;
revoke all on public.camporee_join_codes from public;

create or replace function public.read_camporee_join_code(target_camporee uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare output_code text;
begin
  if not exists(
    select 1 from public.camporees c
    where c.id=target_camporee and private.is_organization_admin(c.organization_id)
  ) then raise exception 'Club director access required' using errcode='42501'; end if;
  select code into output_code from public.camporee_join_codes where camporee_id=target_camporee;
  return output_code;
end $$;

create or replace function public.create_camporee_join_code(target_camporee uuid)
returns text language plpgsql security definer set search_path='' as $$
declare output_code text;
begin
  if not exists(
    select 1 from public.camporees c
    where c.id=target_camporee and c.status<>'archived'
      and private.is_organization_admin(c.organization_id)
  ) then raise exception 'Club director access required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(target_camporee::text,1));
  select code into output_code from public.camporee_join_codes where camporee_id=target_camporee;
  if output_code is null then
    output_code:=upper(encode(gen_random_bytes(8),'hex'));
    insert into public.camporee_join_codes(camporee_id,code) values(target_camporee,output_code);
  end if;
  return output_code;
end $$;

create or replace function public.join_camporee_by_code(join_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
        destination record;
        existing record;
        clean_code text:=upper(regexp_replace(coalesce(join_code,''),'[^a-fA-F0-9]','','g'));
begin
  if actor is null or not exists(
    select 1 from auth.users where id=actor and email_confirmed_at is not null
  ) then raise exception 'Verify your email before joining a club' using errcode='42501'; end if;
  if char_length(clean_code)<>16 then
    raise exception 'Invalid camporee code' using errcode='22023'; end if;
  select c.id,c.organization_id into destination
  from public.camporee_join_codes j join public.camporees c on c.id=j.camporee_id
  where j.code=clean_code and c.status<>'archived';
  if not found then raise exception 'Invitation code invalid or expired' using errcode='22023'; end if;

  -- Recheck under the organization lock; the unique user index prevents
  -- races when joining or creating clubs from two tabs.
  perform 1 from public.organizations where id=destination.organization_id for update;
  select organization_id,is_active into existing from public.organization_members
     where user_id=actor for update;
  if found then
    if existing.organization_id<>destination.organization_id then
      raise exception 'Your account already belongs to a different club' using errcode='23505';
    end if;
    if not existing.is_active then
      -- A rejected or pending member must still be approved by a director.
      raise exception 'Your membership is pending the director approval' using errcode='42501';
    end if;
    return destination.id;
  end if;

  insert into public.organization_members(organization_id,user_id,role,is_active)
    values(destination.organization_id,actor,'viewer',true);
  return destination.id;
end $$;

revoke all on function public.read_camporee_join_code(uuid) from public,anon,authenticated;
revoke all on function public.create_camporee_join_code(uuid) from public,anon,authenticated;
revoke all on function public.join_camporee_by_code(text) from public,anon,authenticated;
grant execute on function public.read_camporee_join_code(uuid) to authenticated;
grant execute on function public.create_camporee_join_code(uuid) to authenticated;
grant execute on function public.join_camporee_by_code(text) to authenticated;
