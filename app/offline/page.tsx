import { CloudOff, RefreshCw, TentTree } from 'lucide-react';

export default function OfflinePage() {
  return <main className="auth-shell offline-page">
    <section className="auth-card auth-card-ios" style={{textAlign:'center'}}>
      <div className="brand-badge" style={{margin:'0 auto 18px'}}><TentTree size={28}/></div>
      <span className="auth-kicker"><CloudOff size={13}/> SIN CONEXIÓN</span>
      <h1>Seguimos en campamento</h1>
      <p className="auth-copy">Abre una pantalla que hayas visitado antes con internet. Si todavía no hay una copia guardada, necesitas conexión para cargar los datos por primera vez.</p>
      <nav className="offline-shortcuts" aria-label="Abrir pantallas guardadas">
        <a href="/program">Hoy</a><a href="/tasks">Tareas</a><a href="/more/songs">Canciones</a><a href="/more">Más</a>
      </nav>
      <a href="/" className="primary-btn auth-link-btn" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><RefreshCw size={17}/> Intentar de nuevo</a>
    </section>
  </main>;
}
