import Link from "next/link";
import { AlertTriangle, CalendarDays, CheckCircle2, Circle, ClipboardCheck, Clock3, DollarSign, Flag, Flame, MapPin, Search, ShoppingCart, StickyNote, TentTree, Users } from "lucide-react";
import BottomNav from "./components/bottom-nav";
import NotificationControls from "./components/notification-controls";

type EventRow = { id:string; title:string; starts_at:string; ends_at:string|null; location:string|null };
type TaskRow = { id:string; title:string; priority:string; due_at:string|null };
type UrgentAnnouncement = { id:string; title:string; message:string; created_at:string };

export default function HomeDashboard({ userId, firstName, avatarUrl, camporee, days, progress, pendingTasks, todayPendingTasks, participants, totalExpenses, phase, dayNumber, totalDays, programCount, todayProgramCount, currentEvent, nextEvent, todayTasks, urgentAnnouncement }: {
  userId:string; firstName:string; avatarUrl:string|null; camporee:{id:string;name:string;location:string|null;status:string}; days:number; progress:number; pendingTasks:number; todayPendingTasks:number; participants:number; totalExpenses:number; phase:"before"|"during"|"after"; dayNumber:number|null; totalDays:number; programCount:number; todayProgramCount:number; currentEvent:EventRow|null; nextEvent:EventRow|null; todayTasks:TaskRow[]; urgentAnnouncement:UrgentAnnouncement|null;
}) {
  const active=phase==="during", after=phase==="after"; const phaseLabels=["Preparación","Salida","Camporee","Regreso"];
  const summaryCards=active?[{href:"/program",label:"Actividades de hoy",value:todayProgramCount,icon:<CalendarDays size={20}/>,tone:"stat-gold"},{href:"/tasks",label:"Pendientes de hoy",value:todayPendingTasks,icon:<CheckCircle2 size={20}/>,tone:"stat-red"},{href:"/more/participants",label:"Participantes",value:participants,icon:<Users size={20}/>,tone:"stat-blue"},{href:"/more/budget",label:"Gastos registrados",value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`,icon:<DollarSign size={20}/>,tone:"stat-green"}]:after?[{href:"/tasks",label:"Pendientes de cierre",value:pendingTasks,icon:<CheckCircle2 size={20}/>,tone:"stat-red"},{href:"/program",label:"Actividades realizadas",value:programCount,icon:<CalendarDays size={20}/>,tone:"stat-gold"},{href:"/more/participants",label:"Participantes",value:participants,icon:<Users size={20}/>,tone:"stat-blue"},{href:"/more/budget",label:"Gasto final",value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`,icon:<DollarSign size={20}/>,tone:"stat-green"}]:[{href:"/tasks",label:"Tareas pendientes",value:pendingTasks,icon:<CheckCircle2 size={20}/>,tone:"stat-red"},{href:"/program",label:"Programa preparado",value:programCount,icon:<CalendarDays size={20}/>,tone:"stat-gold"},{href:"/more/participants",label:"Participantes",value:participants,icon:<Users size={20}/>,tone:"stat-blue"},{href:"/more/budget",label:"Gastos de preparación",value:`RD$${totalExpenses.toLocaleString("es-DO",{maximumFractionDigits:0})}`,icon:<DollarSign size={20}/>,tone:"stat-green"}];
  const quickTitle=active?"Acciones del camporee":after?"Cerrar camporee":"Preparar rápido"; const quickSubtitle=active?"Lo que más necesitas durante el evento":after?"Deja todo cerrado":"Lo que falta organizar"; const todayTitle=active?"Prioridades de hoy":after?"Pendientes para cerrar":"Preparación de hoy"; const emptyToday=active?"No hay tareas operativas pendientes para hoy.":after?"No quedan tareas de cierre para hoy.":"No hay tareas de preparación con vencimiento hoy.";
  const quickActions=active?[{href:"/more/attendance",label:"Pasar lista",icon:<ClipboardCheck size={20}/>},{href:"/program",label:"Programa",icon:<CalendarDays size={20}/>},{href:"/more/budget",label:"Registrar gasto",icon:<DollarSign size={20}/>},{href:"/tasks",label:"Tareas",icon:<CheckCircle2 size={20}/>}]:after?[{href:"/tasks",label:"Cerrar tarea",icon:<CheckCircle2 size={20}/>},{href:"/more/participants",label:"Asistencia",icon:<Users size={20}/>},{href:"/more/budget",label:"Gasto final",icon:<DollarSign size={20}/>},{href:"/more/lists",label:"Revisar lista",icon:<ShoppingCart size={20}/>}]:[{href:"/tasks",label:"Pendiente",icon:<CheckCircle2 size={20}/>},{href:"/more/notes",label:"Apunte",icon:<StickyNote size={20}/>},{href:"/more/budget",label:"Gasto",icon:<DollarSign size={20}/>},{href:"/more/lists",label:"Compra",icon:<ShoppingCart size={20}/>}];
  const eventTime=(event:EventRow|null)=>event?new Date(event.starts_at).toLocaleTimeString("es-DO",{hour:"numeric",minute:"2-digit"}):null;
  const safeProgress=Math.max(0,Math.min(progress,100));

  return <main className={`app home-phase-${phase}`}>
    <header className="top"><div><div className="eyebrow">CAMPOREE</div><h1>Hola, {firstName} 👋</h1></div><Link href="/profile" className="avatar avatar-profile" aria-label="Abrir mi perfil">{avatarUrl?<img src={avatarUrl} alt={`Foto de ${firstName}`}/>:<span className="avatar-initial">{firstName.charAt(0).toUpperCase()}</span>}</Link></header>
    <form className="search-card" action="/search"><Search size={22}/><input name="q" placeholder="Buscar en el camporee" aria-label="Buscar en el camporee"/><button type="submit" hidden aria-label="Buscar">Buscar</button></form>
    <NotificationControls camporeeId={camporee.id} userId={userId} mode="prompt"/>
    {active&&urgentAnnouncement?<Link href="/more/announcements" className="home-urgent-alert ios-card"><span className="home-urgent-icon"><AlertTriangle size={19}/></span><div><small>AVISO URGENTE</small><strong>{urgentAnnouncement.title}</strong><span>{urgentAnnouncement.message}</span></div><b>›</b></Link>:null}

    <section className={`hero camporee-state-card camporee-state-${phase}`}>
      <div className="camporee-state-main">
        <div className="camporee-state-top">
          <span className="camporee-state-pill"><i className="camporee-state-dot"/>{active?"Camporee en curso":after?"Camporee finalizado":"Preparando camporee"}</span>
          <span className="camporee-state-logo" aria-hidden="true"><img src="/camporee-logo-v8.png" alt=""/></span>
        </div>
        <div className="camporee-state-heading"><h2>{camporee.name}</h2>{camporee.location?<div className="camporee-state-location"><MapPin size={16}/><span>{camporee.location}</span></div>:null}</div>

        {active?<>
          <div className="live-day-card">
            <span className="camporee-card-label">Estamos en el</span>
            <div className="camporee-big-line"><div className="camporee-big-copy"><strong>Día {dayNumber}</strong><span>de {totalDays}</span></div><Flame className="camporee-big-icon" size={31}/></div>
            <div className="live-day-steps">{Array.from({length:totalDays},(_,index)=>{const day=index+1;const current=day===dayNumber;const done=Boolean(dayNumber&&day<dayNumber);return <div className={`live-day-step ${current?"current":""} ${done?"done":""}`} key={day}><i/><span>DÍA {day}</span></div>})}</div>
          </div>
          <div className="live-timeline-card">
            <div className="timeline-row now"><span className="timeline-marker"><Flame size={15}/></span><div className="timeline-copy"><small>AHORA</small><strong className={currentEvent?"":"empty"}>{currentEvent?.title??"Sin actividad programada"}</strong></div></div>
            <div className="timeline-row next"><span className="timeline-marker"><Clock3 size={14}/></span><div className="timeline-copy"><small>PRÓXIMO</small><strong>{nextEvent?.title??"Fin del programa"}</strong></div>{nextEvent?<span className="timeline-time"><Clock3 size={12}/>{eventTime(nextEvent)}</span>:null}</div>
          </div>
        </>:after?<>
          <div className="prep-countdown-card"><span className="camporee-card-label">Evento completado</span><div className="camporee-big-line"><div className="camporee-big-copy"><strong>Camporee</strong><span>finalizado</span></div><Flag className="camporee-big-icon" size={31}/></div><div className="prep-progress-track"><i style={{width:"100%"}}/></div><div className="prep-progress-meta"><span>Camporee completado</span><span>100%</span></div></div>
        </>:<>
          <div className="prep-countdown-card">
            <span className="camporee-card-label">Cuenta regresiva</span>
            <div className="camporee-big-line"><div className="camporee-big-copy"><strong>Faltan {days}</strong><span>{days===1?"día":"días"}</span></div><TentTree className="camporee-big-icon" size={32}/></div>
            <div className="prep-progress-track"><i style={{width:`${safeProgress}%`}}/></div><div className="prep-progress-meta"><span>Preparación del camporee</span><span>{safeProgress}% listo</span></div>
          </div>
          <div className="prep-status-card">
            <div className="timeline-row now"><span className="timeline-marker"><CheckCircle2 size={15}/></span><div className="timeline-copy"><small>AHORA</small><strong>Preparando el camporee</strong></div></div>
            <div className="timeline-row next"><span className="timeline-marker"><TentTree size={14}/></span><div className="timeline-copy"><small>PRÓXIMO</small><strong>Inicio del camporee</strong></div><span className="timeline-time">{days===0?"Hoy":days===1?"Mañana":`En ${days} días`}</span></div>
          </div>
        </>}
      </div>

      <div className="camporee-operation">
        <div className="operation-top"><span className="operation-ring" style={{background:`conic-gradient(#ff9f0a ${safeProgress*3.6}deg,#f2eee5 0)`}}><strong>{safeProgress}%</strong></span><div className="operation-copy"><small>{after?"Cierre":active?"Operación":"Preparación"}</small><strong>{after?safeProgress===100?"Todo cerrado":"Por cerrar":safeProgress===100?"Todo listo":`${safeProgress}% listo`}</strong></div><span className="operation-state"><Flag size={14}/>{active?"En marcha":after?"Finalizado":"Preparando"}</span></div>
        <div className="operation-meta"><span className="operation-chip"><CheckCircle2 size={14}/>{pendingTasks} {pendingTasks===1?"tarea pendiente":"tareas pendientes"}</span><span className="operation-chip"><Users size={14}/>{participants} {participants===1?"participante":"participantes"}</span></div>
      </div>
    </section>

    <div className="phase-row">{phaseLabels.map((label,index)=><span key={label} className={(phase==='before'&&index===0)||(phase==='during'&&index<=2)||(phase==='after')?'done':''}>{label}</span>)}</div>
    <section className="grid">{summaryCards.map(card=><Link href={card.href} className="stat ios-card" key={card.label}><span className={`stat-icon ${card.tone}`}>{card.icon}</span><small>{card.label}</small><b>{card.value}</b></Link>)}</section>
    <section className="section-card ios-card"><div className="section-head inside"><h3>{quickTitle}</h3><span>{quickSubtitle}</span></div><div className="actions">{quickActions.map(action=><Link className="action" href={action.href} key={action.label}><span className="ico">{action.icon}</span><small>{action.label}</small></Link>)}</div></section>
    {active&&nextEvent?<section className="section-card ios-card today-card"><div className="section-head inside"><h3>Próxima actividad</h3><span>{eventTime(nextEvent)}</span></div><Link href="/program" className="panel-row today-row"><span className="stat-icon stat-gold"><CalendarDays size={20}/></span><div className="panel-row-copy"><strong>{nextEvent.title}</strong><small>{nextEvent.location??"Sin ubicación definida"}</small></div><span className="chevron">›</span></Link></section>:null}
    <section className="section-card ios-card today-card"><div className="section-head inside"><h3>{todayTitle}</h3><span>{todayTasks.length?`${todayTasks.length} para revisar`:"Todo al día"}</span></div>{todayTasks.length?<div className="panel-list">{todayTasks.map(task=><Link href="/tasks" className="panel-row today-row" key={task.id}><span className="status-pill pending">{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':'Hoy'}</span><div className="panel-row-copy"><strong>{task.title}</strong><small>{task.due_at?new Date(task.due_at).toLocaleTimeString('es-DO',{hour:'numeric',minute:'2-digit'}):'Sin hora'}</small></div><span className="chevron">›</span></Link>)}</div>:<div className="empty compact">{emptyToday}</div>}</section><BottomNav />
  </main>;
}
