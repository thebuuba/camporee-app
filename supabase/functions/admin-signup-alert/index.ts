import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const jsonHeaders = { "Content-Type": "application/json" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: jsonHeaders});

// Called only by the pending-membership trigger, never by global Auth signup.
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({error: "Method not allowed"}, 405);
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {auth: {persistSession: false}});
    const suppliedSecret = req.headers.get("x-cron-secret");
    if (!suppliedSecret) return json({error: "Unauthorized"}, 401);
    const {data: secret, error: secretError} = await supabase.from("system_cron_secrets").select("secret").eq("key", "signup_alerts").maybeSingle();
    if (secretError) throw secretError;
    if (!secret?.secret || suppliedSecret !== secret.secret) return json({error: "Unauthorized"}, 401);

    const body = await req.json();
    if (typeof body.organizationId !== "string" || typeof body.userId !== "string") return json({error: "Membership identifiers required"}, 400);
    const organizationId = body.organizationId;
    const userId = body.userId;
    const {data: request, error: requestError} = await supabase.from("organization_members")
      .select("is_active,permissions").eq("organization_id", organizationId).eq("user_id", userId).maybeSingle();
    if (requestError) throw requestError;
    if (!request || request.is_active || request.permissions?.access_pending !== true || request.permissions?.access_rejected === true) return json({sent: 0});

    const {data: camporee, error: camporeeError} = await supabase.from("camporees")
      .select("id,name").eq("organization_id", organizationId).neq("status", "archived").maybeSingle();
    if (camporeeError) throw camporeeError;
    if (!camporee) return json({sent: 0});
    const {data: admins, error: adminsError} = await supabase.from("organization_members")
      .select("user_id").eq("organization_id", organizationId).eq("is_active", true).eq("role", "admin");
    if (adminsError) throw adminsError;
    if (!admins?.length) return json({sent: 0});
    const {data: subscriptions, error: subscriptionsError} = await supabase.from("push_subscriptions")
      .select("id,endpoint,p256dh,auth").contains("camporee_ids", [camporee.id]).in("user_id", admins.map(admin => admin.user_id));
    if (subscriptionsError) throw subscriptionsError;
    if (!subscriptions?.length) return json({sent: 0});
    const {data: profile, error: profileError} = await supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle();
    if (profileError) throw profileError;
    const {data: keys, error: keysError} = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton", true).maybeSingle();
    if (keysError || !keys?.public_key || !keys?.private_key) throw keysError ?? new Error("Push keys unavailable");
    webpush.setVapidDetails("mailto:notifications@example.com", keys.public_key, keys.private_key);
    const payload = JSON.stringify({
      title: "Nueva solicitud de acceso",
      body: `${profile?.full_name || profile?.email || "Una persona"} solicita entrar a ${camporee.name}. Revisa su solicitud.`,
      url: `/o/${organizationId}/members`,
      tag: `membership-${organizationId}-${userId}`,
    });
    let sent = 0;
    const stale: string[] = [];
    await Promise.all(subscriptions.map(async subscription => {
      try {
        await webpush.sendNotification({endpoint: subscription.endpoint, keys: {p256dh: subscription.p256dh, auth: subscription.auth}}, payload, {TTL: 21600});
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) stale.push(subscription.id);
        else console.error("Pending request push failed", error?.statusCode ?? error?.message);
      }
    }));
    if (stale.length) {
      const {error} = await supabase.from("push_subscriptions").delete().in("id", stale);
      if (error) throw error;
    }
    return json({sent, stale: stale.length});
  } catch (error) {
    console.error("Pending request alert failed", error);
    return json({error: "Could not deliver request alert"}, 500);
  }
});
