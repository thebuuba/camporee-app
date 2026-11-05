'use client';

import type { CSSProperties } from 'react';
import './legado-launch.css';

/** Short CSS reveal inspired by the event film; no video, audio or remote assets. */
export default function LegadoLaunch({ ready = false }: { ready?: boolean }) {
  return <div className="legado-launch" role="status" aria-label="Cargando el camporee Legado">
    <div className="legado-launch-atmosphere" aria-hidden="true" />
    <div className="legado-launch-embers" aria-hidden="true">
      {Array.from({ length: 18 }, (_, i) => <i key={i} style={{ '--x': `${8 + (i * 37) % 84}%`, '--delay': `${(i % 7) * -.31}s`, '--drift': `${(i % 2 ? 1 : -1) * (12 + i * 2)}px`, '--duration': `${1.4 + i % 5 * .24}s` } as CSSProperties} />)}
    </div>
    <div className="legado-launch-content">
      <p className="legado-launch-eyebrow">II BI-CAMPOREE</p>
      <div className="legado-launch-stage" aria-hidden="true">
        <div className="legado-launch-halo" />
        <div className="legado-launch-emblem">
          <img src="/legado-emblem-v1.png" width="432" height="422" alt="" fetchPriority="high" />
          <span className="legado-launch-shine" />
          <span className="legado-launch-torch" />
        </div>
      </div>
      <p className="legado-launch-caption">Un legado que sigue vivo</p>
      <div className="legado-launch-loading"><span aria-hidden="true" /><small>{ready ? '¡Bienvenido al camporee!' : 'Entrando al camporee…'}</small></div>
    </div>
    <p className="legado-launch-footer">CONQUISTADORES <span>·</span> GUÍAS MAYORES</p>
  </div>;
}
