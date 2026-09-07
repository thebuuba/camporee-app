import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import BottomNav from "../components/bottom-nav";

export default async function TasksPage() {
  const supabase = await createClient();
  const auth = await supabase.auth.getClaims();
  if (!auth.data.claims?.sub) redirect("/login");
  const camporees = await supabase.from("camporees").select("id,status").order("starts_on", { ascending: true });
  const camporee = camporees.data?.find((item) => item.status !== "archived") ?? camporees.data?.[0];
  const result = camporee ? await supabase.from("tasks").select("id,title,status,priority,due_at").eq("camporee_id", camporee.id).order("created_at", { ascending: false }) : { data: [] };
  const tasks = result.data ?? [];
  return <main className="app"><header className="top"><div><div className="eyebrow">ORGANIZACIÓN</div><h1>Tareas</h1></div><span className="avatar"><CheckCircle2 size={22}/></span></header><section className="section-card ios-card"><div className="section-head inside"><h3>Todas las tareas</h3><span>{tasks.length}</span></div>{tasks.length ? tasks.map((task) => <article className="task" key={task.id}><div><b>{task.title}</b><small>{task.status} · {task.priority}</small></div></article>) : <div className="empty compact">Todavía no hay tareas.</div>}</section><BottomNav /></main>;
}
