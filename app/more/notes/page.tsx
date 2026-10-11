import Link from '@/app/components/tenant-link';
import { StickyNote } from "lucide-react";
import { requireCamporeeContext, type TenantPageParams } from "@/lib/tenant-server";
import NotesManager from "./notes-manager";

export default async function NotesPage({ params }: { params?: TenantPageParams } = {}) {
  const context = await requireCamporeeContext(params, '/more/notes');
  const { supabase, userId, camporee } = context;
  const canEdit = context.canEdit('notes');
  const [{ data: notes, error: notesError }, { data: areas, error: areasError }] = camporee ? await Promise.all([
    supabase.from("notes").select("id,title,body,note_date,area_id,created_at").eq("camporee_id", camporee.id).order("created_at", { ascending: false }),
    supabase.from("areas").select("id,name").eq("camporee_id", camporee.id).order("sort_order"),
  ]) : [{ data: [], error: null }, { data: [], error: null }];
  const contentError = notesError ?? areasError;
  if (contentError) throw contentError;

  return <main className="app panel-page"><header className="subpage-top"><Link href="/more" className="back-btn" aria-label="Volver">‹</Link><div><div className="eyebrow">REGISTRO</div><h1>Apuntes</h1><p className="polymet-subtitle">Notas y observaciones</p></div><span className="avatar"><StickyNote size={22}/></span></header><div className="panel-intro"><div><strong>{notes?.length ?? 0} apuntes</strong><small>Ideas, observaciones y cosas que no se pueden olvidar.</small></div></div>{camporee ? <NotesManager key={`${context.userId}:${context.organizationId}:${context.camporeeId}`} camporeeId={camporee.id} userId={userId} canEdit={canEdit} initialNotes={notes ?? []} areas={areas ?? []}/> : <div className="empty compact">Todavía no hay un camporee activo.</div>}</main>;
}
