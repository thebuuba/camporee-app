import Link from "next/link";
import { CalendarDays, CheckCircle2, DollarSign, Flag, MapPin, Search, ShoppingCart, Sparkles, StickyNote, TentTree, Trees, Users } from "lucide-react";
import BottomNav from "./components/bottom-nav";

type EventRow = { id:string; title:string; starts_at:string; ends_at:string|null; location:string|null };
type TaskRow = { id:string; title:string; priority:string; due_at:string|null };

export default function HomeDashboard({ firstName, camporee, days, progress, pendingTasks, participants, totalExpenses, phase, dayNumber, totalDays, programCount, currentEvent, nextEvent, todayTasks }: {
  firstName: string;
  camporee: { name:string; location:string|null; status:string };
  days:number; progress:number; pendingTasks:number; participants:number; totalExpenses:number;
  phase:"before"|"during"|"after"; dayNumber:number|null; totalDays:number; programCount:number;
  currentEvent:EventRow|null; nextEvent:EventRow|null; todayTasks:TaskRow[];
}) {
  const active = phase === "during";
  const after = phase === "after";
  const phaseLabels = phase === "before" ? ["Preparación","Salida","Camporee","Regreso"] : phase === "during" ? ["Preparación","Salida","Camporee","Regreso"] : ["Preparación","Salida","Camporee","Regreso"];
  return <main className="app">
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><form action="/auth/signout" method="post"><button className="avatar" aria-label="Cerrar sesión">{firstName.slice(0,1).toUpperCase()}</button></form></header>
    <form className="search-card" action="/search"><Search size={22}/><input name="q" placeholder="Buscar en el camporee" aria-label="Buscar en el camporee"/><button type="submit" aria-label="Buscar">→</button></form>

    <section className="hero hero-v3">
      <div className="hero-v3-decor hero-v3-decor-one"><Trees size={38}/></div><div className="hero-v3-decor hero-v3-decor-two"><Sparkles size={28}/></div>
      <div className="hero-v3-head"><span className="hero-v3-badge"><Flag size={14}/>{active ? `Día ${dayNumber} de ${totalDays}` : after ? "De regreso" : "Próxima aventura"}</span><span className="hero-v3-mini"><TentTree size={18}/></span></div>
      <div className="hero-v3-title-wrap"><small>{active ? "CAMPOREE EN CURSO" : after ? "MISIÓN CUMPLIDA" : "NOS VAMOS DE CAMPOREE"}</small><h2>{camporee.name}</h2>{camporee.location ? <div className="hero-place"><MapPin size={16}/><span>{camporee.location}</span></div> : null}</div>
      <div className="hero-v3-days"><div className="hero-v3-number">{active ? dayNumber : days}</div><div><strong>{active ? `de ${totalDays} días` : after ? "camporee terminado" : days === 1 ? "día" : "días"}</strong><span>{active ? "¡A disfrutar y organizar!" : after ? "hora de revisar y cerrar" : "para preparar todo"}</span></div></div>
      {active ? <div className="live-strip"><div><span>Ahora</span><strong>{currentEvent?.title ?? "Sin actividad programada"}</strong>{currentEvent?.location ? <small>{currentEvent.location}</small> : null}</div><div><span>Próximo</span><strong>{nextEvent?.title ?? "Fin del programa"}</strong>{nextEvent ? <small>{new Date(nextEvent.starts_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'})}</small> : null}</div></div> : null}
      <div className="hero-v3-progress-card"><div className="hero-v3-progress-top"><div><span>{after ? "Cierre" : "Preparación"}</span><strong>{progress}% listo</strong></div><span className="hero-v3-status">{active ? "En marcha" : after ? "Revisar regreso" : "Vamos avanzando"}</span></div><div className="bar"><i style={{width:`${progress}%`}}/></div><div className="hero-progress-meta"><span>{pendingTasks} {pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes"}</span><span>{participants} {participants === 1 ? "participante" : "participantes"}</span></div></div>
    </section>

    <div className="phase-row">{phaseLabels.map((label,index)=><span key={label} className={(phase==='before'&&index===0)||(phase==='during'&&index<=2)||(phase==='after')?'done':''}>{label}</span>)}</div>
    <section className="grid"><Link href="/tasks" className="stat ios-card"><span className="stat-icon stat-red"><CheckCircle2 size={20}/></span><small>Tareas pendientes</small><b>{pendingTasks}</b></Link><Link href="/program" className="stat ios-card"><span className="stat-icon stat-gold"><CalendarDays size={20}/></span><small>Programa</small><b>{programCount}</b></Link><Link href="/more/participants" className="stat ios-card"><span className="stat-icon stat-blue"><Users size={20}/></span><small>Participantes</small><b>{participants}</b></Link><Link href="/more/budget" className="stat ios-card"><span className="stat-icon stat-green"><DollarSign size={20}/></span><small>Gastos</small><b>RD${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}</b></Link></section>
    <section className="section-card ios-card"><div className="section-head inside"><h3>Agregar rápido</h3><span>Lo que necesites</span></div><div className="actions"><Link className="action" href="/tasks"><span className="ico"><CheckCircle2 size={20}/></span><small>Tarea</small></Link><Link className="action" href="/more/notes"><span className="ico"><StickyNote size={20}/></span><small>Apunte</small></Link><Link className="action" href="/more/budget"><span className="ico"><DollarSign size={20}/></span><small>Gasto</small></Link><Link className="action" href="/more/lists"><span className="ico"><ShoppingCart size={20}/></span><small>Compra</small></Link></div></section>
    <section className="section-card ios-card today-card"><div className="section-head inside"><h3>Para hoy</h3><span>{todayTasks.length ? `${todayTasks.length} para revisar` : "Todo al día"}</span></div>{todayTasks.length ? <div className="panel-list">{todayTasks.map(task=><Link href="/tasks" className="panel-row today-row" key={task.id}><span className="status-pill pending">{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':'Hoy'}</span><div className="panel-row-copy"><strong>{task.title}</strong><small>{task.due_at ? new Date(task.due_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'}) : 'Sin hora'}</small></div><span className="chevron">›</span></Link>)}</div> : <div className="empty compact">No hay tareas con vencimiento hoy.</div>}</section>
    <BottomNav />
  </main>;
}
