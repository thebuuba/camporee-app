'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import BottomSheet from './bottom-sheet';
import { createClient } from '@/lib/supabase/client';
import { discardScopedOfflineWrite, flushOfflineWrites, readScopedOfflineWrites, type RecoverableWrite } from '@/lib/offline-fetch';
import styles from './offline-recovery.module.css';

const names: Record<string, string> = { tasks:'Tareas', participants:'Participantes', expenses:'Gastos', income_entries:'Ingresos', notes:'Apuntes', lists:'Listas', list_items:'Artículos', attendance_marks:'Asistencia', announcements:'Avisos', inventory_items:'Inventario', meals:'Comidas' };
const operations: Record<string, string> = { POST:'Agregar', PATCH:'Actualizar', DELETE:'Eliminar' };

function readableBody(body: string | null) {
  if (!body) return 'Solicitud de eliminación';
  try { return JSON.stringify(JSON.parse(body), null, 2); }
  catch { return body; }
}

export default function OfflineRecovery() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<RecoverableWrite[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const running = useRef(false);
  useEffect(() => {
    generation.current++;
    setOpen(false); setEntries([]);
    const { data } = createClient().auth.onAuthStateChange(() => { generation.current++; setOpen(false); setEntries([]); });
    return () => { generation.current++; data.subscription.unsubscribe(); };
  }, [pathname]);

  async function authorization() {
    const { data, error } = await createClient().auth.getSession();
    if (error || !data.session?.access_token) throw new Error('Inicia sesión para recuperar tus cambios.');
    return `Bearer ${data.session.access_token}`;
  }

  async function action(run: (auth: string, current: () => boolean) => Promise<void>) {
    if (running.current) return;
    running.current = true;
    const ticket = generation.current;
    const current = () => ticket === generation.current;
    setBusy(true); setError('');
    try {
      const auth = await authorization();
      if (!current()) return;
      await run(auth, current);
      if (!current()) return;
      const next = await readScopedOfflineWrites(auth);
      if (current()) setEntries(next);
    } catch (cause) { if (current()) setError(cause instanceof Error ? cause.message : 'No se pudieron leer los cambios pendientes.'); }
    finally { running.current = false; setBusy(false); }
  }

  function inspect() { setOpen(true); setEntries([]); void action(async () => {}); }

  async function exportChanges(auth: string, currentAction: () => boolean) {
    const current = await readScopedOfflineWrites(auth);
    if (!currentAction()) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), changes: current }, null, 2)], { type:'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'camporee-cambios-pendientes.json';
    document.body.append(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <>
    <button type="button" onClick={inspect}>Revisar cambios</button>
    {open ? createPortal(<BottomSheet open={open} onClose={() => { if (!busy) setOpen(false); }} title="Cambios pendientes" busy={busy}>
      <p>Estos cambios pertenecen a tu cuenta y al camporee abierto. Puedes exportarlos antes de resolver un conflicto.</p>
      <div className={styles.actions}>
        <button type="button" className="secondary-btn" disabled={busy || !entries.length} onClick={() => void action(exportChanges)}>Exportar copia</button>
        <button type="button" className="primary-btn" disabled={busy} onClick={() => void action(async (auth, current) => {
          const result = await flushOfflineWrites(auth);
          if (current() && result.failed) setError('El conflicto sigue pendiente. Revisa los datos y conserva una copia antes de descartar un cambio.');
        })}>{busy ? 'Comprobando…' : 'Reintentar'}</button>
      </div>
      {error ? <p role="alert" className="auth-alert error">{error}</p> : null}
      {!busy && !entries.length ? <p>No hay cambios recuperables de esta cuenta y camporee. Los cambios antiguos sin identidad y los de otras cuentas se conservan sin enviarlos aquí.</p> : null}
      <div className={styles.entries}>{entries.map(entry => {
        const table = new URL(entry.url).pathname.split('/')[3];
        return <article key={entry.id} className={styles.entry}>
          <strong>{operations[entry.method] ?? entry.method} · {names[table] ?? 'Cambio del camporee'}</strong>
          <small>{new Date(entry.createdAt).toLocaleString('es')}</small>
          <details><summary>Ver datos del cambio</summary><pre>{readableBody(entry.body)}</pre></details>
          <button type="button" className="secondary-btn" disabled={busy} onClick={() => {
            if (window.confirm('¿Descartar este cambio local? No se enviará al servidor. Exporta una copia si necesitas conservarlo; otros cambios pueden depender de él.')) {
              void action((auth, current) => discardScopedOfflineWrite(entry.id, auth, current));
            }
          }}>Descartar este cambio</button>
        </article>;
      })}</div>
    </BottomSheet>, document.body) : null}
  </>;
}
