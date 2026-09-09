create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.system_push_reminder_log (
  id uuid primary key default gen_random_uuid(),
  camporee_id uuid not null references public.camporees(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone text not null,
  sent_at timestamptz not null default now(),
  unique (camporee_id, user_id, milestone)
);

alter table public.system_push_reminder_log enable row level security;
revoke all on public.system_push_reminder_log from anon, authenticated;

create table if not exists public.system_cron_secrets (
  key text primary key,
  secret text not null,
  created_at timestamptz not null default now()
);

alter table public.system_cron_secrets enable row level security;
revoke all on public.system_cron_secrets from anon, authenticated;

insert into public.system_cron_secrets(key, secret)
values ('camporee_reminders', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

select cron.unschedule(jobid)
from cron.job
where jobname = 'camporee-role-aware-reminders';

select cron.schedule(
  'camporee-role-aware-reminders',
  '0 12 * * *',
  $cron$
  select net.http_post(
    url := 'https://fmfmebbblqvcbdnukryf.supabase.co/functions/v1/camporee-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select secret from public.system_cron_secrets where key = 'camporee_reminders')
    ),
    body := jsonb_build_object('source','pg_cron')
  );
  $cron$
);
