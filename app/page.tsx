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

      <section className="setup-intro ios-card">
        <div className="setup-icon">⛺</div>
        <div>
          <span className="auth-kicker">EMPECEMOS</span>
          <h2>Prepara tu camporee en minutos.</h2>
          <p>Primero crea el evento. Después podrás organizar tareas, programa, participantes, comidas, compras y presupuesto.</p>
        </div>
        <div className="setup-steps"><span className="active">1</span><i/><span>2</span><i/><span>3</span></div>
        <div className="setup-step-labels"><span>Evento</span><span>Organización</span><span>Listo</span></div>
      </section>

      <section className="setup-card ios-card">
        <div className="section-head inside"><div><div className="eyebrow">PASO 1 DE 3</div><h3>Datos del camporee</h3></div><span>Luego podrás editarlos</span></div>
        {params.error ? <div className="auth-alert error">{params.error}</div> : null}
        <form action={createCamporee} className="setup-form">
          <label>Nombre del camporee<div className="field-card"><span>✦</span><input name="name" placeholder="Ej. Firmes y Adelante 2026" required /></div></label>
          <label>Lugar<div className="field-card"><span>⌖</span><input name="location" placeholder="Lugar del evento" /></div></label>
          <div className="date-row"><label>Inicio<input name="startsOn" type="date" required /></label><label>Final<input name="endsOn" type="date" required /></label></div>
          <button className="primary-btn setup-primary">Crear camporee y continuar</button>
        </form>
      </section>
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

    <button className="search-card" type="button" aria-label="Buscar"><span className="search-icon">⌕</span><span>Buscar en el camporee</span></button>

    <section className="hero"><small>{camporee.status === "active" ? "CAMPOREE EN CURSO" : "PRÓXIMO CAMPOREE"}</small><h2>{camporee.name}</h2>{camporee.location ? <p className="hero-location">📍 {camporee.location}</p> : null}<div className="countdown"><span>{days} {days === 1 ? "día" : "días"}</span><span>{camporee.status === "active" ? "Modo evento" : "Modo preparación"}</span></div><div className="progress-label"><span>Preparación general</span><b>{progress}%</b></div><div className="bar"><i style={{ width: `${progress}%` }} /></div></section>

    <div className="phase-row"><span className="done">Preparación</span><span>Salida</span><span>Camporee</span><span>Regreso</span></div>

    <section className="grid">
      <article className="stat ios-card"><span className="stat-icon stat-red">✓</span><small>Tareas pendientes</small><b>{pendingTasks}</b></article>
      <article className="stat ios-card"><span className="stat-icon stat-gold">▣</span><small>Programa</small><b>—</b></article>
      <article className="stat ios-card"><span className="stat-icon stat-blue">♟</span><small>Participantes</small><b>{participantsResult.count ?? 0}</b></article>
      <article className="stat ios-card"><span className="stat-icon stat-green">$</span><small>Gastos</small><b>RD${totalExpenses.toLocaleString("es-DO", { maximumFractionDigits: 0 })}</b></article>
    </section>

    <section className="section-card ios-card">
      <div className="section-head inside"><h3>Agregar rápido</h3><span>Lo que necesites</span></div>
      <div className="actions"><button className="action"><span className="ico">✓</span><small>Tarea</small></button><button className="action"><span className="ico">📝</span><small>Apunte</small></button><button className="action"><span className="ico">💰</span><small>Gasto</small></button><button className="action"><span className="ico">🛒</span><small>Compra</small></button></div>
    </section>

    <section className="section-card ios-card today-card">
      <div className="section-head inside"><h3>Para hoy</h3><span>{pendingTasks ? `${pendingTasks} pendientes` : "Todo al día"}</span></div>
      <div className="empty compact">{pendingTasks ? "Aquí aparecerán las tareas más importantes del día." : "No hay tareas pendientes. Empieza agregando la primera tarea del camporee."}</div>
    </section>

    <nav className="nav" aria-label="Navegación principal"><button className="active"><span>⌂</span>Inicio</button><button><span>▣</span>Programa</button><button className="plus" aria-label="Agregar">+</button><button><span>✓</span>Tareas</button><button><span>•••</span>Más</button></nav>
  </main>;
}