import Link from "next/link";
import { ArrowRight, Clock, Tent } from "lucide-react";
import PreparationCountdown from "./preparation-countdown";

export default function PreparationCard({ camporee, preparation, initialNow }: {
  camporee: { starts_on: string; ends_on: string; location: string | null };
  preparation: { completed: number; total: number; percent: number };
  initialNow: number;
}) {
  const formatDate = (value: string) => new Date(`${value}T12:00:00-04:00`).toLocaleDateString("es-DO", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Santo_Domingo" });
  const start = new Date(`${camporee.starts_on}T12:00:00-04:00`);
  const end = new Date(`${camporee.ends_on}T12:00:00-04:00`);
  const dates = camporee.starts_on === camporee.ends_on ? formatDate(camporee.starts_on) : start.getUTCMonth() === end.getUTCMonth() && start.getUTCFullYear() === end.getUTCFullYear() ? `${start.getUTCDate()} – ${formatDate(camporee.ends_on)}` : `${formatDate(camporee.starts_on)} – ${formatDate(camporee.ends_on)}`;
  return <section className="preparation-card" aria-label="Preparación del camporee">
    <div className="preparation-scene"><img src="/polymet-camp-preparation.svg" alt=""/><span><Tent size={14}/>Preparando el camporee</span></div>
    <div className="preparation-content">
      <PreparationCountdown startsOn={camporee.starts_on} initialNow={initialNow}/>
      <div className="preparation-progress">
        <div className="preparation-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle cx="40" cy="40" r="34" fill="none" stroke="white" strokeWidth="9"/><circle cx="40" cy="40" r="34" fill="none" stroke="var(--pm-orange)" strokeWidth="9" strokeLinecap="round" pathLength="100" strokeDasharray="100" strokeDashoffset={100 - preparation.percent}/></svg><span><strong>{preparation.percent}%</strong><small>listo</small></span></div>
        <div className="preparation-copy"><h2>{preparation.percent === 100 ? "¡Todo listo!" : preparation.percent >= 50 ? "¡Vamos muy bien!" : "¡Vamos a prepararnos!"}</h2><p>{preparation.completed} de {preparation.total} tareas de preparación completadas</p><Link href="/tasks?phase=before">Ver pendientes <ArrowRight size={14}/></Link></div>
      </div>
      <p className="preparation-date"><Clock size={14}/><span>{dates}{camporee.location ? ` · ${camporee.location}` : ""}</span></p>
    </div>
  </section>;
}
