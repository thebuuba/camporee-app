import { LoaderCircle } from "lucide-react";

export default function Loading() {
  return <main className="app panel-page">
    <section className="section-card ios-card" style={{display:"flex",alignItems:"center",gap:14,marginTop:24}}>
      <span className="stat-icon stat-green" style={{margin:0}}><LoaderCircle size={20}/></span>
      <div style={{display:"grid",gap:4}}><strong>Cargando panel…</strong><small style={{color:"var(--muted)"}}>Mostrando la información.</small></div>
    </section>
  </main>;
}
