import { CloudOff, RefreshCw, TentTree } from 'lucide-react';

export default function OfflinePage() {
  return <main className="auth-shell">
    <section className="auth-card auth-card-ios" style={{textAlign:'center'}}>
      <div className="brand-badge" style={{margin:'0 auto 18px'}}><TentTree size={28}/></div>
      <span className="auth-kicker"><CloudOff size={13}/> SIN CONEXIÓN</span>
      <h1>Seguimos en campamento</h1>
      <p className="auth-copy">No hay internet ahora mismo. La app conservará sus recursos básicos y volverá a cargar los datos cuando recuperes conexión.</p>
      <a href="/" className="primary-btn auth-link-btn" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><RefreshCw size={17}/> Intentar de nuevo</a>
    </section>
  </main>;
}
