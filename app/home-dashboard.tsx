import Link from "next/link";
import { CalendarDays, CheckCircle2, DollarSign, Flag, MapPin, Search, ShoppingCart, Sparkles, StickyNote, TentTree, Trees, Users } from "lucide-react";
import BottomNav from "./components/bottom-nav";

type EventRow = { id:string; title:string; starts_at:string; ends_at:string|null; location:string|null };
type TaskRow = { id:string; title:string; priority:string; due_at:string|null };

export default function HomeDashboard({ firstName, camporee, days, progress, pendingTasks, todayPendingTasks, participants, totalExpenses, phase, dayNumber, totalDays, programCount, todayProgramCount, currentEvent, nextEvent, todayTasks }: {
  firstName: string;
  camporee: { name:string; location:string|null; status:string };
  days:number; progress:number; pendingTasks:number; todayPendingTasks:number; participants:number; totalExpenses:number;
  phase:"before"|"during"|"after"; dayNumber:number|null; totalDays:number; programCount:number; todayProgramCount:number;
  currentEvent:EventRow|null; nextEvent:EventRow|null; todayTasks:TaskRow[];
}) {
  const active = phase === "during";
  const after = phase === "after";
  const phaseLabels = ["Preparación","Salida","Camporee","Regreso"];

  const summaryCards = active
    ? [
        { href:"/program", label:"Actividades de hoy", value:todayProgramCount, icon:<CalendarDays size={20}/>, tone:"stat-gold" },
        { href:"/tasks", label:"Pendientes de hoy", value:todayPendingTasks, icon:<CheckCircle2 size={20}/>, tone:"stat-red" },
        { href:"/more/participants", label:"Participantes", value:participants, icon:<Users size={20}/>, tone:"stat-blue" },
        { href:"/more/budget", label:"Gastos registrados", value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`, icon:<DollarSign size={20}/>, tone:"stat-green" },
      ]
    : after
      ? [
          { href:"/tasks", label:"Pendientes de cierre", value:pendingTasks, icon:<CheckCircle2 size={20}/>, tone:"stat-red" },
          { href:"/program", label:"Actividades realizadas", value:programCount, icon:<CalendarDays size={20}/>, tone:"stat-gold" },
          { href:"/more/participants", label:"Participantes", value:participants, icon:<Users size={20}/>, tone:"stat-blue" },
          { href:"/more/budget", label:"Gasto final", value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`, icon:<DollarSign size={20}/>, tone:"stat-green" },
        ]
      : [
          { href:"/tasks", label:"Tareas pendientes", value:pendingTasks, icon:<CheckCircle2 size={20}/>, tone:"stat-red" },
          { href:"/program", label:"Programa preparado", value:programCount, icon:<CalendarDays size={20}/>, tone:"stat-gold" },
          { href:"/more/participants", label:"Participantes", value:participants, icon:<Users size={20}/>, tone:"stat-blue" },
          { href:"/more/budget", label:"Gastos de preparación", value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`, icon:<DollarSign size={20}/>, tone:"stat-green" },
        ];

  const quickTitle = active ? "Operación rápida" : after ? "Cerrar camporee" : "Preparar rápido";
  const quickSubtitle = active ? "Acciones para ahora" : after ? "Deja todo cerrado" : "Lo que falta organizar";
  const todayTitle = active ? "Prioridades de hoy" : after ? "Pendientes para cerrar" : "Preparación de hoy";
  const emptyToday = active ? "No hay tareas operativas pendientes para hoy." : after ? "No quedan tareas de cierre para hoy." : "No hay tareas de preparación con vencimiento hoy.";

  return <main className={`app home-phase-${phase}`}>
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><Link href="/more" className="avatar" aria-label="Abrir perfil y opciones">{firstName.slice(0,1).toUpperCase()}</Link></header>
    <form className="search-card" action="/search"><Search size={22}/><input name="q" placeholder="Buscar en el camporee" aria-label="Buscar en el camporee"/><button type="submit" aria-label="Buscar">→</button></form>

    <section className="hero hero-v3">
      <div className="hero-v3-decor hero-v3-decor-one"><Trees size={38}/></div><div className="hero-v3-decor hero-v3-decor-two"><Sparkles size={28}/></div>
      <div className="hero-v3-head"><span className="hero-v3-badge"><Flag size={14}/>{active ? `Día ${dayNumber} de ${totalDays}` : after ? "Etapa de cierre" : "Modo preparación"}</span><span className="hero-v3-mini"><TentTree size={18}/></span></div>
      <div className="hero-v3-title-wrap"><small>{active ? "CAMPOREE EN CURSO" : after ? "CAMPOREE FINALIZADO" : "PREPARANDO EL CAMPOREE"}</small><h2>{camporee.name}</h2>{camporee.location ? <div className="hero-place"><MapPin size={16}/><span>{camporee.location}</span></div> : null}</div>
      <div className="hero-v3-days"><div className="hero-v3-number">{active ? dayNumber : days}</div><div><strong>{active ? `de ${totalDays} días` : after ? "evento terminado" : days === 1 ? "día para comenzar" : "días para comenzar"}</strong><span>{active ? "Modo evento activo" : after ? "Revisa, cierra y archiva" : "Organiza todo antes de salir"}</span></div></div>
      {active ? <div className="live-strip"><div><span>Ahora</span><strong>{currentEvent?.title ?? "Sin actividad programada"}</strong>{currentEvent?.location ? <small>{currentEvent.location}</small> : null}</div><div><span>Próximo</span><strong>{nextEvent?.title ?? "Fin del programa"}</strong>{nextEvent ? <small>{new Date(nextEvent.starts_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'})}</small> : null}</div></div> : null}
      <div className="hero-v3-progress-card"><div className="hero-v3-progress-top"><div><span>{after ? "Cierre" : active ? "Operación" : "Preparación"}</span><strong>{progress}% listo</strong></div><span className="hero-v3-status">{active ? "En marcha" : after ? "Por cerrar" : "Preparando"}</span></div><div className="bar"><i style={{width:`${progress}%`}}/></div><div className="hero-progress-meta"><span>{pendingTasks} {pendingTasks === 1 ? "tarea pendiente" : "tareas pendientes"}</span><span>{participants} {participants === 1 ? "participante" : "participantes"}</span></div></div>
    </section>

    <div className="phase-row">{phaseLabels.map((label,index)=><span key={label} className={(phase==='before'&&index===0)||(phase==='during'&&index<=2)||(phase==='after')?'done':''}>{label}</span>)}</div>

    <section className="grid">{summaryCards.map(card=><Link href={card.href} className="stat ios-card" key={card.label}><span className={`stat-icon ${card.tone}`}>{card.icon}</span><small>{card.label}</small><b>{card.value}</b></Link>)}</section>

    <section className="section-card ios-card"><div className="section-head inside"><h3>{quickTitle}</h3><span>{quickSubtitle}</span></div><div className="actions">
      <Link className="action" href="/tasks"><span className="ico"><CheckCircle2 size={20}/></span><small>{after ? "Cerrar tarea" : active ? "Tarea" : "Pendiente"}</small></Link>
      <Link className="action" href={active ? "/program" : "/more/notes"}><span className="ico">{active ? <CalendarDays size={20}/> : <StickyNote size={20}/>}</span><small>{active ? "Programa" : "Apunte"}</small></Link>
      <Link className="action" href="/more/budget"><span className="ico"><DollarSign size={20}/></span><small>{after ? "Gasto final" : "Gasto"}</small></Link>
      <Link className="action" href={after ? "/more/participants" : "/more/lists"}><span className="ico">{after ? <Users size={20}/> : <ShoppingCart size={20}/>}</span><small>{after ? "Asistencia" : active ? "Suministro" : "Compra"}</small></Link>
    </div></section>

    {active && nextEvent ? <section className="section-card ios-card today-card"><div className="section-head inside"><h3>Próxima actividad</h3><span>{new Date(nextEvent.starts_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'})}</span></div><Link href="/program" className="panel-row today-row"><span className="stat-icon stat-gold"><CalendarDays size={20}/></span><div className="panel-row-copy"><strong>{nextEvent.title}</strong><small>{nextEvent.location ?? "Sin ubicación definida"}</small></div><span className="chevron">›</span></Link></section> : null}

    <section className="section-card ios-card today-card"><div className="section-head inside"><h3>{todayTitle}</h3><span>{todayTasks.length ? `${todayTasks.length} para revisar` : "Todo al día"}</span></div>{todayTasks.length ? <div className="panel-list">{todayTasks.map(task=><Link href="/tasks" className="panel-row today-row" key={task.id}><span className="status-pill pending">{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':'Hoy'}</span><div className="panel-row-copy"><strong>{task.title}</strong><small>{task.due_at ? new Date(task.due_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'}) : 'Sin hora'}</small></div><span className="chevron">›</span></Link>)}</div> : <div className="empty compact">{emptyToday}</div>}</section>
    <BottomNav />
  </main>;
}
