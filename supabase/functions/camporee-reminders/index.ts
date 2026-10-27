import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

import { messageFor, editorResponsibilities } from "./messages.ts";
import { sendScheduleReminders } from "./schedule.ts";
import { sendTaskOverdueReminders } from "./tasks.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const DAY = 24 * 60 * 60 * 1000;
const VAPID_SUBJECT = "mailto:notifications@example.com";
type PermissionMap = Record<string, boolean>;

function dateKeyInZone(timeZone: string, date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function daysBetween(from: string, to: string) {
  // Work with calendar dates independent of DST and server timezone.
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY);
}

function milestoneFor(daysLeft: number) {
  if (daysLeft === 10) return "d10";
  if (daysLeft === 5) return "d5";
  if (daysLeft === 1) return "d1";
  if (daysLeft === 0) return "d0";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', {status: 405});
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const suppliedSecret = req.headers.get("x-cron-secret") ?? "";
    const { data: secretRow } = await supabase.from("system_cron_secrets").select("secret").eq("key", "camporee_reminders").maybeSingle();
    if (!secretRow?.secret || suppliedSecret !== secretRow.secret) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    const body = await req.json().catch(() => ({}));
    const minuteRun = body?.action === 'schedule';
    let scheduled = { sent: 0, stale: 0 };
    if (minuteRun) {
      const schedule = await sendScheduleReminders(supabase, webpush);
      const tasks = await sendTaskOverdueReminders(supabase, webpush);
      scheduled = {sent: schedule.sent + tasks.sent, stale: schedule.stale + tasks.stale};
    }

    const now = new Date();

    const { data: camporees, error: camporeeError } = await supabase.from("camporees")
      .select("id,organization_id,name,starts_on,status,time_zone").neq("status", "archived");
    if (camporeeError) throw camporeeError;

    const targets = (camporees ?? [])
      .map(camporee => ({
        ...camporee,
        daysLeft: daysBetween(dateKeyInZone(camporee.time_zone || "America/Santo_Domingo", now), camporee.starts_on),
      }))
      .map(camporee => ({ ...camporee, milestone: milestoneFor(camporee.daysLeft) }))
      .filter(camporee => {
        if (!minuteRun) return Boolean(camporee.milestone) && camporee.milestone !== 'd0';
        // The minute cron sends the first-day greeting at 08:00 local time.
        // Retry during that hour if no device has accepted the notification.
        return camporee.milestone === 'd0' && Number(new Intl.DateTimeFormat('en-GB', {
          timeZone: camporee.time_zone || 'America/Santo_Domingo', hour: '2-digit', hourCycle: 'h23',
        }).format(now)) === 8;
      });
    if (!targets.length) return new Response(JSON.stringify({ ...scheduled, message: "No milestone today" }), { headers: jsonHeaders });

    const { data: keyRow, error: keyError } = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    if (keyError || !keyRow?.public_key || !keyRow?.private_key) throw keyError ?? new Error("Push keys unavailable");
    webpush.setVapidDetails(VAPID_SUBJECT, keyRow.public_key, keyRow.private_key);

    // Membership is different for each organization, even for the same Auth user.
    let sent = scheduled.sent;
    const staleIds: string[] = [];
    for (const camporee of targets) {
      const { data: members, error: memberError } = await supabase.from("organization_members")
        .select("user_id,role,permissions,directive_role").eq("organization_id", camporee.organization_id).eq("is_active", true);
      if (memberError) throw memberError;
      const milestone = camporee.milestone as string;
      for (const member of members ?? []) {
        const { data: alreadySent } = await supabase.from("system_push_reminder_log").select("id").eq("camporee_id", camporee.id).eq("user_id", member.user_id).eq("milestone", milestone).maybeSingle();
        if (alreadySent) continue;
        const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").contains("camporee_ids", [camporee.id]).eq("user_id", member.user_id);
        if (!subscriptions?.length) continue;
        // Claim before sending: overlapping cron requests must not both send.
        const { data: claim, error: claimError } = await supabase.from('system_push_reminder_log')
          .insert({ camporee_id: camporee.id, user_id: member.user_id, milestone }).select('id').single();
        if (claimError?.code === '23505') continue;
        if (claimError || !claim) throw claimError ?? new Error('Reminder claim unavailable');
        const message = messageFor(member.role, milestone, camporee.name, member.permissions as PermissionMap | null, member.directive_role);
        const permissionTag = member.role === "editor" ? editorResponsibilities(member.permissions as PermissionMap | null).map((item) => item.key).join("-") || "generic" : member.role;
        const url = `/o/${camporee.organization_id}/c/${camporee.id}${message.url === "/" ? "" : message.url}`;
        const payload = JSON.stringify({ title: message.title, body: message.body, url, tag: `camporee-${camporee.id}-${milestone}-${permissionTag}` });
        let userSent = 0;
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: milestone === 'd0' ? 3600 : 86400 });
            userSent += 1;
            sent += 1;
          } catch (error: any) {
            if (error?.statusCode === 404 || error?.statusCode === 410) staleIds.push(subscription.id);
            else console.error("Camporee reminder push failed", error?.statusCode ?? error?.body ?? error?.message ?? error);
          }
        }
        if (!userSent) {
          const { error } = await supabase.from('system_push_reminder_log').delete().eq('id', claim.id);
          if (error) throw error;
        }
      }
    }
    if (staleIds.length) await supabase.from("push_subscriptions").delete().in("id", staleIds);
    return new Response(JSON.stringify({ sent, stale: staleIds.length + scheduled.stale, targets: targets.length }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error("camporee-reminders failed", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
