import Link from "next/link";
import { redirect } from "next/navigation";
import { StickyNote } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import NotesManager from "./notes-manager";

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) redirect("/login");
  const [{ data: membership }, { data: camporees }] = await Promise.all([
    supabase.from("app_members").select("role,is_active,permissions").eq("user_id", userId).maybeSingle(),
    supabase.from("camporees").select("id,status").order("starts_on", { ascending: true }),
  ]);
  if (!membership?.is_active) redirect("/login");
  const permissions = (membership.permissions ?? {}) as Record<string, boolean>;
  const canEdit = membership.role === "admin" || membership.role === "editor" || Boolean(permissions.notes);
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const [{ data: notes }, { data: areas }] = camporee ? await Promise.all([
    supabase.from("notes").select("id,title,body,note_date,area_id,created_at").eq("camporee_id", camporee.id).order("created_at", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order"),
  ]) : [{ data: [] }, { data: [] }];
  return <main className="app panel-page"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">REGISTRO</div><h1>Apuntes</h1></div><span className="avatar"><StickyNote size={22}/></span></header><div className="panel-intro"><div><strong>{notes?.length ?? 0} apuntes</strong><small>Ideas, observaciones y cosas que no se pueden olvidar.</small></div></div>{camporee ? <NotesManager camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialNotes={notes ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
