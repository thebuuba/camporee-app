'use client';

import { useEffect, useState } from 'react';
import { TentTree } from 'lucide-react';

export default function AppSplash() {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = window.setTimeout(() => setVisible(false), reduced ? 180 : 850);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="pm-launch-screen" aria-label="Cargando Camporee" role="status">
    <div className="pm-launch-content">
      <span className="pm-launch-mark" aria-hidden="true"><TentTree size={36} strokeWidth={1.5}/></span>
      <strong>Camporee</strong>
      <p>Una historia juntos</p>
      <span className="pm-launch-progress" aria-hidden="true"><span /></span>
      <small>Preparando tu camporee…</small>
    </div>
  </div>;
}
