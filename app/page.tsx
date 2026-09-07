import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCamporee } from "./actions";

function daysUntil(date: string) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const target = new Date(`${date}T00:00:00`);
  return Math.max(0, Math.ceil((target.getTime() - today.getTime()) / 86400000));
}

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { data: camporees } = await supabase.from("camporees").select("id,name,location,starts_on,ends_on,status").order("starts_on", { ascending: true });
  const camporee = camporees?.find((item) => item.status !== "archived") ?? camporees?.[0];
  const firstName = profile?.full_name?.split(" ")[0] || "Conquistador";

  if (!camporee) {
    return <main className="app setup-app">
      <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="icon-btn" aria-label="Cerrar sesión">↗</button></form></header>
      <section className="setup-card">
        <div className="setup-icon">⛺</div>
        <div className="eyebrow">PRIMER PASO</div>
        <h2>Crea tu camporee</h2>
        <p>Con esto activamos el programa, las tareas, participantes, comidas, compras y presupuesto.</p>
        {params.error ? <div className="auth-alert error">{params.error}</div> : null}
        <form action={createCamporee} className="setup-form">
          <label>Nombre del camporee<input name="name" placeholder="Ej. Firmes y Adelante 2026" required /></label>
          <label>Lugar<input name="location" placeholder="Lugar del evento" /></label>
          <div className="date-row"><label>Inicio<input name="startsOn" type="date" required /></label><label>Final<input name="endsOn" type="date" required /></label></div>
          <button className="primary-btn">Crear camporee</button>
        </form>
      </section>
      <div className="palette-strip"><i/><i/><i/><i/></div>
    </main>;
  }

  const [tasksResult, participantsResult, expensesResult] = await Promise.all([
    supabase.from("tasks").select("id,status", { count: "exact" }).eq("camporee_id", camporee.id),
    supabase.from("participants").select("id", { count: "exact", head: true }).eq("camporee_id", camporee.id),
    supabase.from("expenses").select("amount").eq("camporee_id", camporee.id),
  ]);

  const tasks = tasksResult.data ?? [];
  const pendingTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length;
  const completedTasks = tasks.filter((task) => task.status === "done").length;
  const progress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const totalExpenses = (expensesResult.data ?? []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const days = daysUntil(camporee.starts_on);

  return <main className="app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="avatar" aria-label="Cerrar sesión">{firstName.slice(0,1).toUpperCase()}</button></form></header>
    <section className="hero"><small>PRÓXIMO CAMPOREE</small><h2>{camporee.name}</h2>{camporee.location ? <p className="hero-location">📍 {camporee.location}</p> : null}<div className="countdown"><span>{days} {days === 1 ? "día" : "días"}</span><span>{camporee.status === "active" ? "Camporee en curso" : "Modo preparación"}</span></div><div className="progress-label"><span>Preparación general</span><b>{progress}%</b></div><div className="bar"><i style={{ width: `${progress}%` }} /></div></section>
    <section className="grid"><article className="stat"><small>Tareas pendientes</small><b>{pendingTasks}</b></article><article className="stat"><small>Programa</small><b>—</b></article><article className="stat"><small>Participantes</small><b>{participantsResult.count ?? 0}</b></article><article className="stat"><small>Gastos</small><b>RD${totalExpenses.toLocaleString("es-DO", { maximumFractionDigits: 0 })}</b></article></section>
    <div className="section-head"><h3>Agregar rápido</h3><span>Lo que necesites</span></div><section className="actions"><button className="action"><span className="ico">✓</span><small>Tarea</small></button><button className="action"><span className="ico">📝</span><small>Apunte</small></button><button className="action"><span className="ico">💰</span><small>Gasto</small></button><button className="action"><span className="ico">🛒</span><small>Compra</small></button></section>
    <div className="section-head"><h3>Para hoy</h3><span>{pendingTasks ? `${pendingTasks} pendientes` : "Todo al día"}</span></div><div className="empty">{pendingTasks ? "Ya tienes tareas pendientes. En el siguiente paso activaremos la vista de tareas y responsables." : "No hay tareas pendientes. Empieza agregando la primera tarea del camporee."}</div>
    <nav className="nav" aria-label="Navegación principal"><button className="active"><span>⌂</span>Inicio</button><button><span>▣</span>Programa</button><button className="plus" aria-label="Agregar">+</button><button><span>✓</span>Tareas</button><button><span>•••</span>Más</button></nav>
  </main>;
}