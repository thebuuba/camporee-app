import Link from "next/link";
import { CalendarDays, CheckCircle2, DollarSign, Flag, MapPin, Search, ShoppingCart, StickyNote, Users } from "lucide-react";
import BottomNav from "./components/bottom-nav";

export default function HomeDashboard({ firstName, camporee, days, progress, pendingTasks, participants, totalExpenses }: { firstName: string; camporee: { name:string; location:string|null; status:string }; days:number; progress:number; pendingTasks:number; participants:number; totalExpenses:number }) {
  const active = camporee.status === "active";
  return <main className="app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="avatar" aria-label="Cerrar sesión">{firstName.slice(0,1).toUpperCase()}</button></form></header>
    <button className="search-card" type="button"><Search size={24}/><span>Buscar en el camporee</span></button>

    <section className="hero hero-v2">
      <div className="hero-v2-top">
        <span className="hero-kicker"><Flag size={14}/>{active ? "EN CURSO" : "PRÓXIMO CAMPOREE"}</span>
        <span className="hero-status-dot" aria-hidden="true" />
      </div>
      <h2>{camporee.name}</h2>
      {camporee.location ? <div className="hero-place"><MapPin size={16}/><span>{camporee.location}</span></div> : null}
      <div className="hero-metrics">
        <div className="hero-metric hero-metric-primary"><strong>{days}</strong><span>{days === 1 ? "día restante" : "días restantes"}</span></div>
        <div className="hero-metric"><span className="hero-metric-label">Estado</span><strong>{active ? "En curso" : "Preparación"}</strong></div>
      </div>
      <div className="hero-progress-block">
        <div className="progress-label"><span>Preparación general</span><b>{progress}%</b></div>
        <div className="bar"><i style={{width:`${progress}%`}}/></div>
        <div className="hero-progress-meta"><span>{pendingTasks} tareas pendientes</span><span>{participants} participantes</span></div>
      </div>
    </section>

    <div className="phase-row"><span className="done">Preparación</span><span>Salida</span><span>Camporee</span><span>Regreso</span></div>
    <section className="grid"><Link href="/tasks" className="stat ios-card"><span className="stat-icon stat-red"><CheckCircle2 size={20}/></span><small>Tareas pendientes</small><b>{pendingTasks}</b></Link><Link href="/program" className="stat ios-card"><span className="stat-icon stat-gold"><CalendarDays size={20}/></span><small>Programa</small><b>—</b></Link><Link href="/more/participants" className="stat ios-card"><span className="stat-icon stat-blue"><Users size={20}/></span><small>Participantes</small><b>{participants}</b></Link><Link href="/more/budget" className="stat ios-card"><span className="stat-icon stat-green"><DollarSign size={20}/></span><small>Gastos</small><b>RD${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}</b></Link></section>
    <section className="section-card ios-card"><div className="section-head inside"><h3>Agregar rápido</h3><span>Lo que necesites</span></div><div className="actions"><Link className="action" href="/tasks"><span className="ico"><CheckCircle2 size={20}/></span><small>Tarea</small></Link><Link className="action" href="/more/notes"><span className="ico"><StickyNote size={20}/></span><small>Apunte</small></Link><Link className="action" href="/more/budget"><span className="ico"><DollarSign size={20}/></span><small>Gasto</small></Link><Link className="action" href="/more/lists"><span className="ico"><ShoppingCart size={20}/></span><small>Compra</small></Link></div></section>
    <section className="section-card ios-card today-card"><div className="section-head inside"><h3>Para hoy</h3><span>{pendingTasks ? `${pendingTasks} pendientes` : "Todo al día"}</span></div><div className="empty compact">{pendingTasks ? "Aquí aparecerán las tareas más importantes del día." : "No hay tareas pendientes."}</div></section>
    <BottomNav />
  </main>;
}
