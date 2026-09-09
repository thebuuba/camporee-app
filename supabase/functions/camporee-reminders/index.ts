import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import webpush from "npm:web-push@3.6.7";

const jsonHeaders = { "Content-Type": "application/json" };
const DAY = 24 * 60 * 60 * 1000;
const VAPID_SUBJECT = "mailto:notifications@example.com";

type PermissionMap = Record<string, boolean>;
type ReminderMessage = { title: string; body: string; url: string };
type PermissionMeta = { label: string; url: string; weight: number };

const permissionMeta: Record<string, PermissionMeta> = {
  tasks: { label: "tareas", url: "/tasks", weight: 100 },
  schedule: { label: "programa", url: "/program", weight: 95 },
  participants: { label: "participantes", url: "/more/participants", weight: 90 },
  inventory: { label: "inventario", url: "/more/inventory", weight: 85 },
  meals: { label: "comidas", url: "/more/meals", weight: 80 },
  finances: { label: "presupuesto", url: "/more/budget", weight: 75 },
  lists: { label: "listas y compras", url: "/more/lists", weight: 70 },
  notes: { label: "notas", url: "/more/notes", weight: 30 },
};

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

function editorResponsibilities(permissions: PermissionMap | null | undefined) {
  return Object.entries(permissions ?? {}).filter(([key, enabled]) => enabled === true && permissionMeta[key]).map(([key]) => ({ key, ...permissionMeta[key] })).sort((a, b) => b.weight - a.weight);
}

function naturalList(items: string[]) {
  if (!items.length) return "tus responsabilidades";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} y ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function editorMessage(milestone: string, camporeeName: string, permissions: PermissionMap | null | undefined): ReminderMessage {
  const responsibilities = editorResponsibilities(permissions);
  const labels = responsibilities.slice(0, 3).map((item) => item.label);
  const focus = naturalList(labels);
  const extra = responsibilities.length > 3 ? " y otras áreas asignadas" : "";
  const url = responsibilities[0]?.url ?? "/tasks";
  if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Faltan 10 días para ${camporeeName}. Revisa ${focus}${extra} y detecta lo que todavía falta preparar.`, url };
  if (milestone === "d5") return { title: "🔥 Ya casi estamos", body: `Quedan 5 días. Confirma ${focus}${extra} y deja resueltos los pendientes de tus áreas.`, url };
  if (milestone === "d1") return { title: "⛺ Mañana comenzamos", body: `Mañana comienza ${camporeeName}. Deja listos ${focus}${extra} antes de salir.`, url };
  return { title: "🎉 ¡Llegó el día!", body: `¿Estás listo? Hoy comienza ${camporeeName}. Mantén al día ${focus}${extra} durante la operación.`, url };
}

function messageFor(role: string, milestone: string, camporeeName: string, permissions?: PermissionMap | null): ReminderMessage {
  if (role === "editor") return editorMessage(milestone, camporeeName, permissions);
  if (role === "viewer") {
    if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Cada vez falta menos para ${camporeeName}. Consulta el programa y los avisos para mantenerte al día.`, url: "/program" };
    if (milestone === "d5") return { title: "🔥 Ya casi estamos", body: `Solo faltan 5 días para ${camporeeName}. Revisa el programa y cualquier aviso importante.`, url: "/program" };
    if (milestone === "d1") return { title: "⛺ Mañana es el camporee", body: `Mañana comienza ${camporeeName}. Revisa el programa, la hora de salida y los últimos avisos.`, url: "/program" };
    return { title: "🎉 ¡Llegó el día!", body: `¿Estás listo? ${camporeeName} comienza hoy. Abre la app para ver el programa y los avisos del día.`, url: "/program" };
  }
  if (milestone === "d10") return { title: "🏕️ Faltan 10 días", body: `Faltan 10 días para ${camporeeName}. Revisa responsables, tareas, presupuesto y logística general.`, url: "/" };
  if (milestone === "d5") return { title: "🔥 Faltan 5 días", body: "Haz una revisión general: programa, transporte, comidas, inventario, participantes y pendientes.", url: "/" };
  if (milestone === "d1") return { title: "⛺ Falta 1 día", body: `Mañana comienza ${camporeeName}. Confirma que logística, participantes, programa, presupuesto e inventario estén listos.`, url: "/" };
  return { title: "🎉 ¡Llegó el día!", body: `¿Están listos? ${camporeeName} comienza hoy. Abre Inicio y coordina la operación del camporee.`, url: "/" };
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

    const { data: members, error: memberError } = await supabase.from("app_members").select("user_id,role,is_active,permissions").eq("is_active", true);
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
        const message = messageFor(member.role, milestone, camporee.name, member.permissions as PermissionMap | null);
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
