import Link from "next/link";
import { AlertTriangle, BellRing, CalendarDays, ChevronRight, ClipboardCheck, HeartPulse, ListChecks, MapPin, Play, Search, Soup, Users, WalletCards } from "lucide-react";
import BottomNav from "./components/bottom-nav";
import NotificationControls from "./components/notification-controls";

type EventRow = { id:string; title:string; starts_at:string; ends_at:string|null; location:string|null };
type TaskRow = { id:string; title:string; priority:string; due_at:string|null };
type UrgentAnnouncement = { id:string; title:string; message:string; created_at:string };

export default function HomeDashboard({ userId, firstName, avatarUrl, camporee, days, progress, pendingTasks, completedTasks, totalTasks, todayPendingTasks, participants, presentParticipants, totalExpenses, totalIncome, phase, dayNumber, totalDays, programCount, todayProgramCount, currentEvent, nextEvent, todayTasks, urgentAnnouncement }: {
  userId:string; firstName:string; avatarUrl:string|null; camporee:{id:string;name:string;location:string|null;status:string}; days:number; progress:number; pendingTasks:number; completedTasks:number; totalTasks:number; todayPendingTasks:number; participants:number; presentParticipants:number; totalExpenses:number; totalIncome:number; phase:"before"|"during"|"after"; dayNumber:number|null; totalDays:number; programCount:number; todayProgramCount:number; currentEvent:EventRow|null; nextEvent:EventRow|null; todayTasks:TaskRow[]; urgentAnnouncement:UrgentAnnouncement|null;
}) {
  const active = phase === "during";
  const after = phase === "after";
  const formatMoney = (value:number) => `RD$ ${value.toLocaleString("es-DO", { maximumFractionDigits:0 })}`;
  const formatTime = (value:string) => new Date(value).toLocaleTimeString("es-DO", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"America/Santo_Domingo" });
  const now = new Date().toLocaleTimeString("es-DO", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"America/Santo_Domingo" });
  const heroTitle = active ? currentEvent?.title ?? "Tiempo libre" : after ? "Camporee finalizado" : camporee.name;
  const summary = [
    { href:"/tasks", label:"Tareas", value:`${completedTasks}/${totalTasks}`, detail:"completadas", icon:ListChecks, tone:"peach", percent:progress },
    { href:"/more/participants", label:"Participantes", value:presentParticipants, detail:`presentes de ${participants}`, icon:Users, tone:"sage", percent:participants ? Math.round(presentParticipants / participants * 100) : 0 },
    { href:"/program", label:"Programa", value:active ? todayProgramCount : programCount, detail:active ? "actividades hoy" : "actividades", icon:CalendarDays, tone:"sky", percent:Math.min(100,programCount ? 75 : 0) },
    { href:"/more/budget", label:"Gastos", value:formatMoney(totalExpenses), detail:`saldo ${formatMoney(totalIncome-totalExpenses)}`, icon:WalletCards, tone:"pink", percent:totalIncome ? Math.min(100,Math.round(totalExpenses/totalIncome*100)) : 0 },
  ] as const;
  const quick = [
    { href:"/more/announcements", label:"Avisos", icon:BellRing, tone:"peach" },
    { href:"/more/attendance", label:"Pases de lista", icon:ClipboardCheck, tone:"sage" },
    { href:"/more/meals", label:"Comidas", icon:Soup, tone:"pink" },
    { href:"/more/emergency", label:"Emergencia", icon:HeartPulse, tone:"pink" },
  ] as const;

  return <main className={`app polymet-home home-phase-${phase}`}>
    <header className="polymet-home-head">
      <div><span className="polymet-sync">☁ Sincronizado</span><h1>Hola, {firstName}</h1><p>{camporee.name}</p></div>
      <Link href="/profile" className="polymet-home-avatar" aria-label="Abrir mi perfil">{avatarUrl ? <img src={avatarUrl} alt="" /> : firstName.charAt(0).toUpperCase()}</Link>
    </header>
    <Link href="/search" className="polymet-home-search"><span>Buscar actividades, personas, tareas...</span><span className="polymet-search-icon"><Search size={20}/></span></Link>
    <NotificationControls camporeeId={camporee.id} userId={userId} mode="prompt" />

    <section className="polymet-home-hero">
      <img src={after ? "/polymet-camp-closing.svg" : "/polymet-camp-hero.svg"} alt="" />
      <div className="polymet-hero-content">
        <div className="polymet-hero-top"><span>● {active ? `Día ${dayNumber} de ${totalDays}` : after ? "Evento completado" : `Faltan ${days} días`}</span><span>{now}</span></div>
        <small>{active ? "AHORA" : after ? "CERRANDO" : "PRÓXIMAMENTE"}</small>
        <h2>{heroTitle}</h2>
        {active && currentEvent ? <p><MapPin size={14}/>{currentEvent.location || camporee.location || "Camporee"}</p> : !active && camporee.location ? <p><MapPin size={14}/>{camporee.location}</p> : null}
        <div className="polymet-hero-progress"><i style={{width:`${active && currentEvent?.ends_at ? Math.min(100,Math.max(0,(Date.now()-new Date(currentEvent.starts_at).getTime())/(new Date(currentEvent.ends_at).getTime()-new Date(currentEvent.starts_at).getTime())*100)) : progress}%`}}/></div>
        <div className="polymet-hero-times"><span>{active && currentEvent ? formatTime(currentEvent.starts_at) : after ? "100%" : `${progress}% listo`}</span><span>{active && currentEvent?.ends_at ? formatTime(currentEvent.ends_at) : ""}</span></div>
      </div>
    </section>
    {active && nextEvent ? <Link href="/program" className="polymet-next"><span className="polymet-next-icon"><Play size={18}/></span><span><small>Próxima · {formatTime(nextEvent.starts_at)}</small><strong>{nextEvent.title}</strong></span><ChevronRight size={21}/></Link> : null}
    {active && urgentAnnouncement ? <Link href="/more/announcements" className="polymet-urgent"><span className="polymet-urgent-icon"><AlertTriangle size={22}/></span><span><small>AVISO URGENTE</small><strong>{urgentAnnouncement.title}</strong><span>{urgentAnnouncement.message}</span></span></Link> : null}

    <section className="polymet-quick">{quick.map(({href,label,icon:Icon,tone}) => <Link href={href} key={label}><span className={`polymet-quick-icon tone-${tone}`}><Icon size={22}/></span><small>{label}</small></Link>)}</section>
    <section className="polymet-summary">{summary.map(({href,label,value,detail,icon:Icon,tone,percent}) => <Link href={href} className="polymet-summary-card" key={label}><div><span className={`polymet-summary-icon tone-${tone}`}><Icon size={18}/></span><small>{label}</small></div><strong>{value}</strong><span>{detail}</span><div className="polymet-bar"><i className={`bar-${tone}`} style={{width:`${percent}%`}}/></div></Link>)}</section>
    <BottomNav />
  </main>;
}
