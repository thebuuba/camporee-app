select cron.schedule(
  'camporee-activity-start-reminders',
  '* * * * *',
  $cron$
  select net.http_post(
    url := 'https://fmfmebbblqvcbdnukryf.supabase.co/functions/v1/camporee-reminders',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select secret from public.system_cron_secrets where key='camporee_reminders')),
    body := jsonb_build_object('action','schedule'),
    timeout_milliseconds := 10000
  );
  $cron$
);
