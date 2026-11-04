'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Printer } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import { buildMealMenuDocument, type MenuMeal } from '@/lib/meal-menu';
import styles from './meal-menu-print.module.css';

export default function MealMenuPrint({ meals, camporeeName }: {
  meals: readonly MenuMeal[]; camporeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [loadedDocument, setLoadedDocument] = useState<string | null>(null);
  const [error, setError] = useState('');
  const frame = useRef<HTMLIFrameElement>(null);
  const documentHtml = useMemo(() => buildMealMenuDocument(meals, camporeeName), [meals, camporeeName]);
  const ready = loadedDocument === documentHtml;
  useEffect(() => { setMounted(true); }, []);

  function printMenu() {
    const target = frame.current?.contentWindow;
    if (!ready || !target || !meals.length) return;
    setError('');
    try { target.focus(); target.print(); }
    catch { setError('No se pudo abrir la impresión. Abre esta misma app en Safari o Chrome y vuelve a pulsar Imprimir menú.'); }
  }

  return <>
    <div className={styles.toolbar}>
      <button type="button" className={`primary-btn ${styles.trigger}`} disabled={!meals.length || !ready} onClick={printMenu}>
        <Printer size={18} aria-hidden="true"/> {meals.length && !ready ? 'Preparando menú…' : 'Imprimir menú'}
      </button>
      <button type="button" className={`secondary-btn ${styles.trigger}`} disabled={!meals.length} onClick={() => { setError(''); setOpen(true); }}>
        <Eye size={18} aria-hidden="true"/> Vista previa
      </button>
    </div>
    {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
    {/* Mount after hydration so onLoad cannot fire before React attaches it.
        Preload the full menu for a synchronous user-initiated print call.
        It is not display:none: Safari must lay out the printable document. */}
    {mounted ? <iframe key={documentHtml} ref={frame} className={styles.printFrame} title="Documento de impresión del menú" aria-hidden="true" tabIndex={-1}
      srcDoc={documentHtml} sandbox="allow-same-origin allow-modals"
      onLoad={() => setLoadedDocument(documentHtml)}
      onError={() => { setLoadedDocument(null); setError('No se pudo preparar el menú. Recarga la página e inténtalo de nuevo.'); }}/> : null}
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Vista previa del menú"
      description="Todos los días, en vertical y sin tachaduras."
      footer={<div className={styles.actions}>
        <p>Imprime directamente desde la app o elige Guardar como PDF en el diálogo de impresión.</p>
        <button type="button" className="primary-btn" onClick={printMenu} disabled={!ready || !meals.length}>
          <Printer size={18} aria-hidden="true"/> Imprimir menú
        </button>
        {error ? <p role="alert">{error}</p> : null}
      </div>}>
      <iframe className={styles.preview} title="Vista previa del menú del camporee" srcDoc={documentHtml} sandbox="allow-same-origin"/>
    </BottomSheet>
  </>;
}
