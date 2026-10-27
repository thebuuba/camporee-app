import { enqueueDelivery, drainDeliveries } from './delivery.ts';
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

import { messageFor, editorResponsibilities } from "./messages.ts";
import { sendScheduleReminders } from "./schedule.ts";
import { sendTaskOverdueReminders } from "./tasks.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const DAY = 24 * 60 * 60 * 1000;
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
    if (minuteRun) {
      await sendScheduleReminders(supabase, webpush);
      await sendTaskOverdueReminders(supabase, webpush);
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
        // Queue only in that local hour; durable retries expire at 09:00.
        return camporee.milestone === 'd0' && Number(new Intl.DateTimeFormat('en-GB', {
          timeZone: camporee.time_zone || 'America/Santo_Domingo', hour: '2-digit', hourCycle: 'h23',
        }).format(now)) === 8;
      });
    if (!targets.length) {
      const delivery = await drainDeliveries(supabase, webpush);
      return new Response(JSON.stringify(delivery), { headers: jsonHeaders });
    }

    // Membership is different for each organization, even for the same Auth user.
    for (const camporee of targets) {
      const { data: members, error: memberError } = await supabase.from("organization_members")
        .select("user_id,role,permissions,directive_role").eq("organization_id", camporee.organization_id).eq("is_active", true);
      if (memberError) throw memberError;
      const milestone = camporee.milestone as string;
      for (const member of members ?? []) {
        const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").contains("camporee_ids", [camporee.id]).eq("user_id", member.user_id);
        if (!subscriptions?.length) continue;
        const message = messageFor(member.role, milestone, camporee.name, member.permissions as PermissionMap | null, member.directive_role);
        const permissionTag = member.role === "editor" ? editorResponsibilities(member.permissions as PermissionMap | null).map((item) => item.key).join("-") || "generic" : member.role;
        const url = `/o/${camporee.organization_id}/c/${camporee.id}${message.url === "/" ? "" : message.url}`;
        const payload = JSON.stringify({ title: message.title, body: message.body, url, tag: `camporee-${camporee.id}-${milestone}-${permissionTag}` });
        const localParts = new Intl.DateTimeFormat('en-GB', {timeZone: camporee.time_zone || 'America/Santo_Domingo', minute: '2-digit', second: '2-digit'}).formatToParts(now);
        const secondsIntoHour = Number(localParts.find(part => part.type === 'minute')?.value) * 60 + Number(localParts.find(part => part.type === 'second')?.value);
        const ttl = milestone === 'd0' ? 3600 - secondsIntoHour : 86400;
        await enqueueDelivery(supabase, camporee.id, member.user_id, milestone, JSON.parse(payload), ttl, new Date(now.getTime() + ttl * 1000));
      }
    }
    const delivery = await drainDeliveries(supabase, webpush);
    return new Response(JSON.stringify({ ...delivery, targets: targets.length }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error("camporee-reminders failed", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
