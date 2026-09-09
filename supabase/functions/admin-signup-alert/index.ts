import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const jsonHeaders = { "Content-Type": "application/json" };
const VAPID_SUBJECT = "mailto:notifications@example.com";

type SubscriptionRow = { id:string; endpoint:string; p256dh:string; auth:string; user_id:string };

Deno.serve(async (req: Request) => {
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{ persistSession:false } });
    const suppliedSecret = req.headers.get("x-cron-secret") ?? "";
    const { data: secretRow } = await supabase.from("system_cron_secrets").select("secret").eq("key","signup_alerts").maybeSingle();
    if (!secretRow?.secret || suppliedSecret !== secretRow.secret) return new Response(JSON.stringify({error:"Unauthorized"}),{status:401,headers:jsonHeaders});

    const body = await req.json().catch(() => ({}));
    const userId = String(body?.userId ?? "");
    const fullName = String(body?.fullName ?? "").trim() || "Nuevo usuario";
    const email = String(body?.email ?? "").trim();
    if (!userId) return new Response(JSON.stringify({error:"userId required"}),{status:400,headers:jsonHeaders});

    const { data:keyRow, error:keyError } = await supabase.from("push_vapid_keys").select("public_key,private_key").eq("singleton",true).maybeSingle();
    if (keyError || !keyRow?.public_key || !keyRow?.private_key) throw keyError ?? new Error("Push keys unavailable");
    webpush.setVapidDetails(VAPID_SUBJECT, keyRow.public_key, keyRow.private_key);

    const { data:admins, error:adminError } = await supabase.from("app_members").select("user_id").eq("role","admin").eq("is_active",true);
    if (adminError) throw adminError;
    const adminIds = new Set((admins ?? []).map((row:{user_id:string}) => row.user_id));

    const { data:allSubscriptions, error:subscriptionsError } = await supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth,user_id");
    if (subscriptionsError) throw subscriptionsError;
    const subscriptions = ((allSubscriptions ?? []) as SubscriptionRow[]).filter((subscription) => adminIds.has(subscription.user_id));

    const payload = JSON.stringify({ title:"👤 Nuevo registro pendiente", body:`${fullName}${email ? ` (${email})` : ""} se registró. Revisa la cuenta y actívala si corresponde.`, url:"/more/users", tag:`new-signup-${userId}` });
    let sent = 0;
    const staleIds:string[] = [];
    const failures:{statusCode:number|null;message:string}[] = [];
    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth}},payload,{TTL:86400});
        sent += 1;
      } catch (error:any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) staleIds.push(subscription.id);
        else failures.push({statusCode:error?.statusCode ?? null,message:String(error?.body ?? error?.message ?? error).slice(0,300)});
      }
    }
    if (staleIds.length) await supabase.from("push_subscriptions").delete().in("id",staleIds);
    return new Response(JSON.stringify({sent,stale:staleIds.length,admins:adminIds.size,subscriptions:subscriptions.length,failures}),{headers:jsonHeaders});
  } catch (error:any) {
    return new Response(JSON.stringify({error:error?.message ?? "Unknown error"}),{status:500,headers:jsonHeaders});
  }
});