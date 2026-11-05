'use client';

import { useEffect } from 'react';
import type {} from '@/lib/launch-bootstrap';

export default function NotFound() {
  useEffect(() => { window.__camporeeLaunch?.ready(); }, []);
  return <main className="app error-state"><section className="section-card ios-card error-card"><h1>Página no encontrada</h1><p>Este enlace no está disponible.</p><a href="/" className="primary-btn">Volver al inicio</a></section></main>;
}
