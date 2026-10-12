-- Reuse the existing private cron secret and async HTTP transport.
-- Auth signup stays silent: only a new pending club membership queues a push.
create or replace function private.notify_pending_camporee_request()
returns trigger language plpgsql security definer set search_path='' as $$
declare alert_secret text;
begin
  select secret into alert_secret from public.system_cron_secrets where key='signup_alerts';
  if alert_secret is null then
    raise warning 'Pending membership alert not queued: signup_alerts secret unavailable';
    return new;
  end if;
  perform net.http_post(
    url := 'https://fmfmebbblqvcbdnukryf.supabase.co/functions/v1/admin-signup-alert',
    headers := pg_catalog.jsonb_build_object('Content-Type','application/json','x-cron-secret',alert_secret),
    body := pg_catalog.jsonb_build_object('organizationId',new.organization_id,'userId',new.user_id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- A transport failure must never discard the applicant's request.
  raise warning 'Pending membership alert could not be queued: %',sqlerrm;
  return new;
end $$;
revoke all on function private.notify_pending_camporee_request() from public,anon,authenticated;
create trigger notify_pending_camporee_request
after insert on public.organization_members
for each row when (
  not new.is_active
  and new.permissions->>'access_pending'='true'
  and new.permissions->>'access_rejected' is distinct from 'true'
) execute function private.notify_pending_camporee_request();
