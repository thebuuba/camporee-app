import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const jsonHeaders = { "Content-Type": "application/json" };

Deno.serve(async (req: Request) => {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const token = authHeader.slice(7);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    const currentUserId = userData.user?.id;
    if (userError || !currentUserId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    }

    const { data: me } = await supabase.from("app_members").select("role,is_active").eq("user_id", currentUserId).maybeSingle();
    if (!me?.is_active || me.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.userId ?? "");
    if (!targetUserId) return new Response(JSON.stringify({ error: "userId required" }), { status: 400, headers: jsonHeaders });
    if (targetUserId === currentUserId) return new Response(JSON.stringify({ error: "No puedes eliminar tu propia cuenta" }), { status: 400, headers: jsonHeaders });

    const { data: target } = await supabase.from("app_members").select("role,is_active").eq("user_id", targetUserId).maybeSingle();
    if (!target) return new Response(JSON.stringify({ error: "Cuenta no encontrada" }), { status: 404, headers: jsonHeaders });

    if (target.role === "admin" && target.is_active) {
      const { count } = await supabase.from("app_members").select("user_id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
      if ((count ?? 0) <= 1) return new Response(JSON.stringify({ error: "No se puede eliminar el último administrador activo" }), { status: 400, headers: jsonHeaders });
    }

    await supabase.from("tasks").update({ assigned_to: null }).eq("assigned_to", targetUserId);
    await supabase.from("push_subscriptions").delete().eq("user_id", targetUserId);
    await supabase.from("system_push_reminder_log").delete().eq("user_id", targetUserId);
    await supabase.from("camporee_members").delete().eq("user_id", targetUserId);
    await supabase.from("app_members").delete().eq("user_id", targetUserId);

    await supabase.from("profiles").update({ full_name: "Usuario eliminado", email: null, updated_at: new Date().toISOString() }).eq("id", targetUserId);

    const replacementEmail = `deleted-${targetUserId}@camporee.invalid`;
    const randomPassword = crypto.randomUUID() + crypto.randomUUID();
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(targetUserId, {
      email: replacementEmail,
      password: randomPassword,
      ban_duration: "876000h",
      user_metadata: { full_name: "Usuario eliminado", deleted: true },
    });
    if (authUpdateError) throw authUpdateError;

    return new Response(JSON.stringify({ ok: true }), { headers: jsonHeaders });
  } catch (error: any) {
    console.error("admin-delete-user failed", error);
    return new Response(JSON.stringify({ error: error?.message ?? "Unknown error" }), { status: 500, headers: jsonHeaders });
  }
});
