import Link from "next/link";
import { CalendarDays, CheckCircle2, DollarSign, Flag, MapPin, Search, ShoppingCart, Sparkles, StickyNote, TentTree, Trees, Users } from "lucide-react";
import BottomNav from "./components/bottom-nav";

export default function HomeDashboard({ firstName, camporee, days, progress, pendingTasks, participants, totalExpenses }: { firstName: string; camporee: { name:string; location:string|null; status:string }; days:number; progress:number; pendingTasks:number; participants:number; totalExpenses:number }) {
  const active = camporee.status === "active";
  return <main className="app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="avatar" aria-label="Cerrar sesión">{firstName.slice(0,1).toUpperCase()}</button></form></header>
    <button className="search-card" type="button"><Search size={24}/><span>Buscar en el camporee</span></button>

    <section className="hero hero-v3">
      <div className="hero-v3-decor hero-v3-decor-one"><Trees size={38}/></div>
      <div className="hero-v3-decor hero-v3-decor-two"><Sparkles size={28}/></div>
      <div className="hero-v3-head">
        <span className="hero-v3-badge"><Flag size={14}/>{active ? "¡Ya comenzó!" : "Próxima aventura"}</span>
        <span className="hero-v3-mini"><TentTree size={18}/></span>
      </div>
      <div className="hero-v3-title-wrap">
        <small>{active ? "CAMPOREE EN CURSO" : "NOS VAMOS DE CAMPOREE"}</small>
        <h2>{camporee.name}</h2>
        {camporee.location ? <div className="hero-place"><MapPin size={16}/><span>{camporee.location}</span></div> : null}
      </div>
      <div className="hero-v3-days">
        <div className="hero-v3-number">{days}</div>
        <div><strong>{days === 1 ? "día" : "días"}</strong><span>{active ? "de aventura" : "para preparar todo"}</span></div>
      </div>
      <div className="hero-v3-progress-card">
        <div className="hero-v3-progress-top"><div><span>Preparación</span><strong>{progress}% listo</strong></div><span className="hero-v3-status">{active ? "En curso" : "Vamos avanzando"}</span></div>
        <div className="bar"><i style={{width:`${progress}%`}}/></div>
        <div className="hero-progress-meta"><span>{pendingTasks} {pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes"}</span><span>{participants} {participants === 1 ? "participante" : "participantes"}</span></div>
      </div>
    </section>

    <div className="phase-row"><span className="done">Preparación</span><span>Salida</span><span>Camporee</span><span>Regreso</span></div>
    <section className="grid"><Link href="/tasks" className="stat ios-card"><span className="stat-icon stat-red"><CheckCircle2 size={20}/></span><small>Tareas pendientes</small><b>{pendingTasks}</b></Link><Link href="/program" className="stat ios-card"><span className="stat-icon stat-gold"><CalendarDays size={20}/></span><small>Programa</small><b>—</b></Link><Link href="/more/participants" className="stat ios-card"><span className="stat-icon stat-blue"><Users size={20}/></span><small>Participantes</small><b>{participants}</b></Link><Link href="/more/budget" className="stat ios-card"><span className="stat-icon stat-green"><DollarSign size={20}/></span><small>Gastos</small><b>RD${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}</b></Link></section>
    <section className="section-card ios-card"><div className="section-head inside"><h3>Agregar rápido</h3><span>Lo que necesites</span></div><div className="actions"><Link className="action" href="/tasks"><span className="ico"><CheckCircle2 size={20}/></span><small>Tarea</small></Link><Link className="action" href="/more/notes"><span className="ico"><StickyNote size={20}/></span><small>Apunte</small></Link><Link className="action" href="/more/budget"><span className="ico"><DollarSign size={20}/></span><small>Gasto</small></Link><Link className="action" href="/more/lists"><span className="ico"><ShoppingCart size={20}/></span><small>Compra</small></Link></div></section>
    <section className="section-card ios-card today-card"><div className="section-head inside"><h3>Para hoy</h3><span>{pendingTasks ? `${pendingTasks} pendientes` : "Todo al día"}</span></div><div className="empty compact">{pendingTasks ? "Aquí aparecerán las tareas más importantes del día." : "No hay tareas pendientes."}</div></section>
    <BottomNav />
  </main>;
}
