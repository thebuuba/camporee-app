import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const VAPID_SUBJECT = "mailto:notifications@example.com";

function decodeJwtSub(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const token = authHeader.slice(7);
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(part.padEnd(Math.ceil(part.length / 4) * 4, "="));
    return JSON.parse(json).sub as string | undefined;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const userId = decodeJwtSub(req.headers.get("authorization"));
  if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const { data: membership } = await supabase
    .from("app_members")
    .select("role,is_active,permissions")
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership?.is_active) return new Response(JSON.stringify({ error: "Inactive member" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const permissions = membership.permissions ?? {};
  const canSend = membership.role === "admin" || membership.role === "editor" || permissions.schedule === true || permissions.edit === true;
  if (!canSend) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const camporeeId = String(body.camporeeId ?? "");
  const title = String(body.title ?? "Camporee").slice(0, 120);
  const message = String(body.message ?? "Tienes un nuevo aviso.").slice(0, 500);
  const priority = String(body.priority ?? "normal");
  if (!camporeeId) return new Response(JSON.stringify({ error: "camporeeId required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const keys = await getKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, keys.public_key, keys.private_key);

  const { data: subscriptions, error: subscriptionsError } = await supabase
    .from("push_subscriptions")
    .select("id,endpoint,p256dh,auth,user_id")
    .eq("camporee_id", camporeeId);
  if (subscriptionsError) throw subscriptionsError;

  const payload = JSON.stringify({
    title: priority === "urgent" ? `⚠️ ${title}` : title,
    body: message,
    url: "/more/announcements",
    tag: `camporee-${priority}`,
  });

  let sent = 0;
  const staleIds: string[] = [];
  await Promise.all((subscriptions ?? []).map(async (subscription) => {
    if (subscription.user_id === userId) return;
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
