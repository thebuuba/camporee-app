'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Camporee route error', error); }, [error]);
  return <main className="app error-state">
    <section className="section-card ios-card error-card">
      <span className="stat-icon stat-gold"><AlertTriangle size={22}/></span>
      <div><div className="eyebrow">CAMPOREE</div><h1>Algo no cargó bien.</h1><p>No necesitas cerrar la app. Intenta cargar esta pantalla otra vez.</p></div>
      <button className="primary-btn" onClick={reset}><RotateCcw size={18}/> Intentar de nuevo</button>
    </section>
  </main>;
}
