-- Automatically provision a director-facing 4-digit code and a separate
-- high-entropy, reusable invite token in the SAME transaction as camporee
-- creation. The short code requests approval; the invite token permits
-- automatic enrollment only for a verified, signed-in user.
alter table public.camporee_join_codes
  add column numeric_code text unique,
  add column invite_token text unique;
alter table public.camporee_join_codes
  add constraint camporee_numeric_code_four_digits
  check (numeric_code ~ '^[0-9]{4}$'),
  add constraint camporee_invite_token_high_entropy
  check (invite_token ~ '^[a-f0-9]{64}$');

create table public.camporee_code_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  attempted_at timestamptz not null default now()
);
create index camporee_code_attempts_recent_idx
  on public.camporee_code_attempts(user_id,attempted_at desc);
alter table public.camporee_code_attempts enable row level security;
revoke all on public.camporee_code_attempts from public,anon,authenticated;

create or replace function private.provision_camporee_invitation(target_camporee uuid)
returns void language plpgsql security definer set search_path='' as $$
declare proposed_code text; proposed_token text; previous text; attempt integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_camporee::text,2));
  select numeric_code into previous from public.camporee_join_codes
    where camporee_id=target_camporee for update;
  if previous is not null then return; end if;
  for attempt in 1..100 loop
    proposed_code:=((1000+pg_catalog.floor(pg_catalog.random()*9000))::integer)::text;
    proposed_token:=pg_catalog.replace(pg_catalog.gen_random_uuid()::text
        ||pg_catalog.gen_random_uuid()::text,'-','');
    begin
      if exists(select 1 from public.camporee_join_codes where camporee_id=target_camporee) then
        update public.camporee_join_codes
          set numeric_code=proposed_code,invite_token=proposed_token
          where camporee_id=target_camporee;
      else
        insert into public.camporee_join_codes(camporee_id,code,numeric_code,invite_token)
          values(target_camporee,
           pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,16)),
           proposed_code,proposed_token);
      end if;
      return;
    exception when unique_violation then
      -- A four-digit collision is normal; retry with a different code.
      null;
    end;
  end loop;
  raise exception 'No four-digit code available, retry later' using errcode='54000';
end $$;
revoke all on function private.provision_camporee_invitation(uuid)
  from public,anon,authenticated;

create or replace function private.camporee_invite_after_insert()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform private.provision_camporee_invitation(new.id);
  return new;
end $$;
revoke all on function private.camporee_invite_after_insert()
  from public,anon,authenticated;
create trigger camporee_invite_automatically
  after insert on public.camporees
  for each row execute function private.camporee_invite_after_insert();

-- Existing events are preserved and receive codes (archived codes cannot be
-- redeemed). The trigger protects all future creations.
do $backfill$
declare item record;
begin
  for item in select id from public.camporees order by id loop
    perform private.provision_camporee_invitation(item.id);
  end loop;
end $backfill$;

create or replace function public.read_camporee_invitation(target_camporee uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare details jsonb;
begin
  if not exists(
    select 1 from public.camporees c
    where c.id=target_camporee and private.is_organization_admin(c.organization_id)
  ) then raise exception 'Director access required' using errcode='42501'; end if;
  select pg_catalog.jsonb_build_object('code',numeric_code,'token',invite_token)
    into details from public.camporee_join_codes where camporee_id=target_camporee;
  if details is null then raise exception 'Camporee invite not configured' using errcode='23514'; end if;
  return details;
end $$;

-- Keep old admin RPCs callable while returning ONLY the four-digit code.
create or replace function public.read_camporee_join_code(target_camporee uuid)
returns text language sql stable security definer set search_path='' as $$
  select (public.read_camporee_invitation(target_camporee)->>'code')::text
$$;
create or replace function public.create_camporee_join_code(target_camporee uuid)
returns text language plpgsql security definer set search_path='' as $$
begin
  if not exists (
    select 1 from public.camporees c where c.id=target_camporee
    and c.status<>'archived' and private.is_organization_admin(c.organization_id)
  ) then raise exception 'Director access required' using errcode='42501'; end if;
  perform private.provision_camporee_invitation(target_camporee);
  return public.read_camporee_join_code(target_camporee);
end $$;

-- A short code is not a credential. Brute-force attempts are restricted, and
-- even a correct code only creates a PENDING membership requiring approval.
create or replace function public.join_camporee_by_code(join_code text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());
  destination record;existing record; clean_code text:=pg_catalog.trim(coalesce(join_code,''));
  used_attempts integer;
begin
  if actor is null or not exists(select 1 from auth.users
    where id=actor and email_confirmed_at is not null)
  then raise exception 'Verified account required' using errcode='42501'; end if;
  if clean_code !~ '^[0-9]{4}$' then
    raise exception 'Four-digit code required' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text,17));
  select count(*) into used_attempts from public.camporee_code_attempts
    where user_id=actor and attempted_at>now()-interval '24 hours';
  if used_attempts>=5 then
    raise exception 'Too many attempts, try tomorrow' using errcode='42501';
  end if;
  -- Log attempts separately from the result. Rollback on a failed lookup
  -- would otherwise erase the rate-limit record, so unknown codes return
  -- NULL instead of raising an exception.
  insert into public.camporee_code_attempts(user_id) values(actor);
  select c.id,c.organization_id into destination
    from public.camporee_join_codes j join public.camporees c on c.id=j.camporee_id
    where j.numeric_code=clean_code and c.status<>'archived';
  if not found then return null; end if;
  perform 1 from public.organizations where id=destination.organization_id for update;
  select organization_id,is_active into existing from public.organization_members
    where user_id=actor for update;
  if found then
    if existing.organization_id<>destination.organization_id then
      raise exception 'Already belongs to another club' using errcode='23505'; end if;
    return destination.id;
  end if;
  insert into public.organization_members(organization_id,user_id,role,is_active,permissions)
    values(destination.organization_id,actor,'viewer',false,'{"access_pending":true}'::jsonb);
  return destination.id;
end $$;

-- Possessing the long token represents an invitation from the director.
-- Only verified, signed-in users can redeem it; an existing rejected or
-- revoked membership cannot be silently reactivated.
create or replace function public.join_camporee_by_token(invite_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=(select auth.uid());destination record;existing record;
begin
  if actor is null or not exists(select 1 from auth.users
    where id=actor and email_confirmed_at is not null)
  then raise exception 'Verified account required' using errcode='42501'; end if;
  if invite_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation link' using errcode='22023'; end if;
  select c.id,c.organization_id into destination
    from public.camporee_join_codes j join public.camporees c on c.id=j.camporee_id
    where j.invite_token=invite_token and c.status<>'archived';
  if not found then raise exception 'Invitation unavailable' using errcode='22023'; end if;
  perform 1 from public.organizations where id=destination.organization_id for update;
  select organization_id,is_active into existing from public.organization_members
    where user_id=actor for update;
  if found then
    if existing.organization_id<>destination.organization_id then
      raise exception 'Already belongs to another club' using errcode='23505'; end if;
    if not existing.is_active then
      raise exception 'Club access requires director approval' using errcode='42501';
    end if;
    return destination.id;
  end if;
  insert into public.organization_members(organization_id,user_id,role,is_active)
    values(destination.organization_id,actor,'viewer',true);
  return destination.id;
end $$;

revoke all on function public.read_camporee_invitation(uuid) from public,anon,authenticated;
revoke all on function public.read_camporee_join_code(uuid) from public,anon,authenticated;
revoke all on function public.create_camporee_join_code(uuid) from public,anon,authenticated;
revoke all on function public.join_camporee_by_code(text) from public,anon,authenticated;
revoke all on function public.join_camporee_by_token(text) from public,anon,authenticated;
grant execute on function public.read_camporee_invitation(uuid) to authenticated;
grant execute on function public.read_camporee_join_code(uuid) to authenticated;
grant execute on function public.create_camporee_join_code(uuid) to authenticated;
grant execute on function public.join_camporee_by_code(text) to authenticated;
grant execute on function public.join_camporee_by_token(text) to authenticated;
