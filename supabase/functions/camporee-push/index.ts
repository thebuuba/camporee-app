import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VAPID_SUBJECT = "mailto:notifications@example.com";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  // A decoded JWT payload is untrusted: verify the signature/session using
  // Supabase Auth before ever consulting the privileged service-role client.
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.slice(7);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  const { data: identity, error: identityError } = await supabase.auth.getUser(token);
  const userId = identity.user?.id;
  if (identityError || !userId) return json({ error: "Unauthorized" }, 401);

  async function getKeys() {
    const { data: existing } = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    if (existing?.public_key && existing?.private_key) return existing;
    const generated = webpush.generateVAPIDKeys();
    const { data, error } = await supabase.from("push_vapid_keys").upsert({ singleton: true, public_key: generated.publicKey, private_key: generated.privateKey }).select("public_key,private_key").single();
    if (error || !data) throw error ?? new Error("Could not create VAPID keys");
    return data;
  }

  const body = await req.json().catch(() => ({}));
  if (body?.action === "public-key") {
    const keys = await getKeys();
    return new Response(JSON.stringify({ publicKey: keys.public_key }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  if (body?.action !== "send") return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const camporeeId = String(body.camporeeId ?? "");
  const title = String(body.title ?? "Camporee").slice(0, 120);
  const message = String(body.message ?? "Tienes un nuevo aviso.").slice(0, 500);
  const priority = String(body.priority ?? "normal");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(camporeeId)) {
    return json({ error: "Valid camporeeId required" }, 400);
  }
  const { data: camporee, error: camporeeError } = await supabase.from("camporees")
    .select("id,organization_id,status").eq("id", camporeeId).maybeSingle();
  if (camporeeError) throw camporeeError;
  if (!camporee || camporee.status === "archived") return json({ error: "Camporee unavailable" }, 403);

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members").select("role,is_active,permissions")
    .eq("organization_id", camporee.organization_id).eq("user_id", userId).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership?.is_active) return json({ error: "Inactive organization member" }, 403);
  const permissions = membership.permissions ?? {};
  const canSend = membership.role === "admin" || membership.role === "editor" ||
    permissions.schedule === true || permissions.edit === true;
  if (!canSend) return json({ error: "Forbidden" }, 403);

  // Send only to people whose access is STILL active in this organization.
  // Stored push subscriptions alone are not proof of current membership.
  const { data: activeMembers, error: activeError } = await supabase
    .from("organization_members").select("user_id")
    .eq("organization_id", camporee.organization_id).eq("is_active", true);
  if (activeError) throw activeError;
  const eligibleUsers = new Set((activeMembers ?? []).map(member => member.user_id));

  const keys = await getKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, keys.public_key, keys.private_key);

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id")
    .contains("camporee_ids", [camporeeId]);
  if (subscriptionsError) throw subscriptionsError;

  const payload = JSON.stringify({
    title: priority === "urgent" ? `⚠️ ${title}` : title,
    body: message,
    url: `/o/${camporee.organization_id}/c/${camporeeId}/more/announcements`,
    tag: `camporee-${priority}`,
  });

  let sent = 0;
  const staleIds: string[] = [];
  await Promise.all((subscriptions ?? []).map(async (subscription) => {
    if (subscription.user_id === userId || !eligibleUsers.has(subscription.user_id)) return;
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, payload, { TTL: priority === "urgent" ? 3600 : 21600 });
      sent += 1;
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) staleIds.push(subscription.id);
      else console.error("Push send failed", error?.statusCode ?? error?.body ?? error?.message ?? error);
    }
  }));

  if (staleIds.length) await supabase.from("push_subscriptions").delete().in("id", staleIds);

  return new Response(JSON.stringify({ sent, stale: staleIds.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
