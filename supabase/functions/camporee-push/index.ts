import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

  // Older clients may still call send after inserting an announcement. The
  // INSERT trigger now owns that delivery; a second path would duplicate it.
  if (body?.action === "send") return json({ error: "Announcement delivery is queued automatically on publication" }, 410);
  return json({ error: "Unknown action" }, 400);
});
