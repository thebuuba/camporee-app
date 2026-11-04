'use client';

import { useMemo, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import { buildMealMenuDocument, type MenuMeal } from '@/lib/meal-menu';
import styles from './meal-menu-print.module.css';

export default function MealMenuPrint({ meals, camporeeName }: {
  meals: readonly MenuMeal[];
  camporeeName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loadedDocument, setLoadedDocument] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [previewKey, setPreviewKey] = useState(0);
  const frame = useRef<HTMLIFrameElement>(null);
  const documentHtml = useMemo(() => buildMealMenuDocument(meals, camporeeName), [meals, camporeeName]);
  const ready = loadedDocument === documentHtml;

  function openPreview() {
    setError('');
    setLoadedDocument(null);
    setPreviewKey(current => current + 1);
    setOpen(true);
  }

  function printMenu() {
    const target = frame.current?.contentWindow;
    if (!ready || !target) return;
    setError('');
    try {
      target.focus();
      target.print();
    } catch {
      setError('No se pudo abrir la impresión. Prueba desde Safari o Chrome.');
    }
  }

  return <>
    <div className={styles.toolbar}>
      <button type="button" className={`primary-btn ${styles.trigger}`} disabled={!meals.length} onClick={openPreview}>
        <Printer size={18} aria-hidden="true"/> Imprimir menú
      </button>
    </div>
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Vista previa del menú"
      description="Menú completo, organizado por día."
      footer={<div className={styles.actions}>
        <p>Puedes imprimirlo o elegir Guardar como PDF en las opciones de impresión.</p>
        <button type="button" className="primary-btn" onClick={printMenu} disabled={!ready || !meals.length}>
          <Printer size={18} aria-hidden="true"/> {ready ? 'Imprimir / Guardar PDF' : 'Preparando menú…'}
        </button>
      </div>}>
      {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
      <iframe key={previewKey} ref={frame} className={styles.preview} title="Menú del camporee para imprimir"
        srcDoc={documentHtml} sandbox="allow-same-origin allow-modals"
        onLoad={() => setLoadedDocument(documentHtml)}
        onError={() => { setLoadedDocument(null); setError('No se pudo cargar la vista previa. Cierra esta ventana y vuelve a intentarlo.'); }}/>
    </BottomSheet>
  </>;
}
