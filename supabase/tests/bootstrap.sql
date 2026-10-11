-- Small Auth/Storage boundary fixture, not a substitute for the Supabase API.
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists vault;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table if not exists auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
alter table auth.users add column if not exists email_confirmed_at timestamptz;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth,storage,extensions to authenticated,anon,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;
create table if not exists storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
alter table storage.buckets add column if not exists public boolean default false;
alter table storage.buckets add column if not exists file_size_limit bigint;
alter table storage.buckets add column if not exists allowed_mime_types text[];
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,owner uuid);
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
do $$ begin
 if to_regprocedure('storage.foldername(text)') is null then
  execute 'create function storage.foldername(name text) returns text[] language sql immutable as $fn$ select (string_to_array($1,''/''))[1:array_length(string_to_array($1,''/''),1)-1] $fn$';
 end if;
end $$;
create table if not exists vault.decrypted_secrets(name text,decrypted_secret text,created_at timestamptz default now());
do $$ begin
 if not exists(select 1 from pg_publication where pubname='supabase_realtime') then create publication supabase_realtime; end if;
end $$;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
