'use client';

import { useMemo, useState, type MouseEvent } from 'react';
import { Eye, Printer } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import Link from '@/app/components/tenant-link';
import { buildMealMenuDocument, type MenuMeal } from '@/lib/meal-menu';
import { prepareMealMenuFonts } from '@/lib/meal-menu-fonts';
import styles from './meal-menu-print.module.css';

export default function MealMenuPrint({ meals, camporeeName, camporeeTheme = '' }: {
  meals: readonly MenuMeal[]; camporeeName: string; camporeeTheme?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const documentHtml = useMemo(() => buildMealMenuDocument(meals, camporeeName, camporeeTheme), [meals, camporeeName, camporeeTheme]);

  function checkConnection(event: MouseEvent<HTMLAnchorElement>) {
    if (!navigator.onLine) {
      event.preventDefault();
      setError('Conéctate a internet para abrir la página de impresión del menú guardado. La vista previa sigue disponible.');
    } else setError('');
  }

  // Real user-activated navigation: no hidden frame, window.open(), font gate
  // or missed onLoad can leave this control permanently disabled.
  const printLink = <Link href="/print/meals" prefetch={false} target="_blank" rel="noopener noreferrer"
    className={`primary-btn ${styles.trigger}`} onClick={checkConnection}>
    <Printer size={18} aria-hidden="true"/> Imprimir menú
  </Link>;

  return <>
    <div className={styles.toolbar}>
      {meals.length ? printLink : <button type="button" className={`primary-btn ${styles.trigger}`} disabled>
        <Printer size={18} aria-hidden="true"/> Imprimir menú
      </button>}
      <button type="button" className={`secondary-btn ${styles.trigger}`} disabled={!meals.length} onClick={() => { setError(''); setOpen(true); }}>
        <Eye size={18} aria-hidden="true"/> Vista previa
      </button>
    </div>
    {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
    <BottomSheet open={open} onClose={() => setOpen(false)} title="Vista previa del menú"
      description="Todos los días, en vertical y sin tachaduras."
      footer={<div className={styles.actions}>
        <p>Abre el menú guardado en una página de impresión y pulsa Imprimir / Guardar PDF.</p>
        {meals.length ? printLink : null}
        {error ? <p role="alert">{error}</p> : null}
      </div>}>
      <iframe className={styles.preview} title="Vista previa del menú del camporee" srcDoc={documentHtml} sandbox="allow-same-origin"
        onLoad={event => {
          const target = event.currentTarget.contentDocument;
          if (target) void prepareMealMenuFonts(document, target).catch(() => undefined);
        }}/>
    </BottomSheet>
  </>;
}
