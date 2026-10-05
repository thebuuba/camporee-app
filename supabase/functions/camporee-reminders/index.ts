import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

import { messageFor, editorResponsibilities } from "./messages.ts";

const jsonHeaders = { "Content-Type": "application/json" };
const DAY = 24 * 60 * 60 * 1000;
const VAPID_SUBJECT = "mailto:notifications@example.com";

function dateKeyInSantoDomingo(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function daysBetween(from: string, to: string) {
  const a = new Date(`${from}T00:00:00-04:00`).getTime();
  const b = new Date(`${to}T00:00:00-04:00`).getTime();
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
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const suppliedSecret = req.headers.get("x-cron-secret") ?? "";
    const { data: secretRow } = await supabase.from("system_cron_secrets").select("secret").eq("key", "camporee_reminders").maybeSingle();
    if (!secretRow?.secret || suppliedSecret !== secretRow.secret) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const today = dateKeyInSantoDomingo();
    const { data: camporees, error: camporeeError } = await supabase.from("camporees").select("id,name,starts_on,status").neq("status", "archived");
    if (camporeeError) throw camporeeError;

    const targets = (camporees ?? []).map((camporee: any) => ({ ...camporee, daysLeft: daysBetween(today, camporee.starts_on) })).map((camporee: any) => ({ ...camporee, milestone: milestoneFor(camporee.daysLeft) })).filter((camporee: any) => Boolean(camporee.milestone));
    if (!targets.length) return new Response(JSON.stringify({ sent: 0, message: "No milestone today" }), { headers: jsonHeaders });

    const { data: keyRow, error: keyError } = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    if (keyError || !keyRow?.public_key || !keyRow?.private_key) throw keyError ?? new Error("Push keys unavailable");
    webpush.setVapidDetails(VAPID_SUBJECT, keyRow.public_key, keyRow.private_key);

    const { data: members, error: memberError } = await supabase.from("app_members").select("user_id,role,is_active,permissions,directive_role").eq("is_active", true);
    if (memberError) throw memberError;

    let sent = 0;
    const staleIds: string[] = [];
    for (const camporee of targets) {
      const milestone = camporee.milestone as string;
      for (const member of members ?? []) {
        const { data: alreadySent } = await supabase.from("system_push_reminder_log").select("id").eq("camporee_id", camporee.id).eq("user_id", member.user_id).eq("milestone", milestone).maybeSingle();
        if (alreadySent) continue;
        const { data: subscriptions } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("camporee_id", camporee.id).eq("user_id", member.user_id);
        if (!subscriptions?.length) continue;
        const message = messageFor(member.role, milestone, camporee.name, member.permissions as PermissionMap | null, member.directive_role);
        const permissionTag = member.role === "editor" ? editorResponsibilities(member.permissions as PermissionMap | null).map((item) => item.key).join("-") || "generic" : member.role;
        const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url, tag: `camporee-${camporee.id}-${milestone}-${permissionTag}` });
        let userSent = 0;
        for (const subscription of subscriptions) {
          try {
            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload, { TTL: 86400 });
            userSent += 1;
            sent += 1;
          } catch (error: any) {
            if (error?.statusCode === 404 || error?.statusCode === 410) staleIds.push(subscription.id);
            else console.error("Camporee reminder push failed", error?.statusCode ?? error?.body ?? error?.message ?? error);
          }
        }
        if (userSent > 0) await supabase.from("system_push_reminder_log").insert({ camporee_id: camporee.id, user_id: member.user_id, milestone });
      }
    }
    if (staleIds.length) await supabase.from("push_subscriptions").delete().in("id", staleIds);
    return new Response(JSON.stringify({ sent, stale: staleIds.length, targets: targets.length }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error("camporee-reminders failed", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
