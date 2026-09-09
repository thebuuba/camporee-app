create extension if not exists pg_net with schema extensions;

insert into public.system_cron_secrets(key, secret)
values ('signup_alerts', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  bootstrap_admin boolean;
  signup_secret text;
  display_name text;
begin
  perform pg_advisory_xact_lock(hashtext('camporee:first-admin'));
  select not exists(
    select 1 from public.app_members where role='admin' and is_active
  ) into bootstrap_admin;

  display_name := nullif(trim(coalesce(new.raw_user_meta_data->>'full_name','')), '');

  insert into public.profiles(id, full_name, email)
  values(new.id, display_name, new.email)
  on conflict (id) do update set email=excluded.email, updated_at=now();

  insert into public.app_members(user_id, role, is_active)
  values(new.id, case when bootstrap_admin then 'admin' else 'viewer' end, bootstrap_admin)
  on conflict (user_id) do nothing;

  if not bootstrap_admin then
    select secret into signup_secret from public.system_cron_secrets where key='signup_alerts';
    if signup_secret is not null then
      perform net.http_post(
        url := 'https://fmfmebbblqvcbdnukryf.supabase.co/functions/v1/admin-signup-alert',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', signup_secret
        ),
        body := jsonb_build_object(
          'userId', new.id,
          'fullName', coalesce(display_name, 'Nuevo usuario'),
          'email', coalesce(new.email, '')
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user_profile() from public, anon, authenticated;
