'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Every editor and detail panel uses the same Polymet sheet and motion.
export default function BottomSheet({ open, onClose, title, description, children, footer, busy = false }: {
  open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode;
  children: ReactNode; footer?: ReactNode; busy?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const [present, setPresent] = useState(open);
  const content = useRef({ title, description, children, footer });
  const drag = useRef<number | null>(null);
  if (open) content.current = { title, description, children, footer };

  useEffect(() => {
    if (open) { setPresent(true); return; }
    const timer = setTimeout(() => setPresent(false), window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 300);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!present || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    return () => { element.close(); };
  }, [present]);

  function close() { if (!busy) onClose(); }
  if (!present) return null;
  const panel = content.current;
  return <dialog ref={dialog} className="pm-sheet-frame" data-state={open ? 'open' : 'closed'}
    aria-labelledby={titleId} aria-describedby={panel.description ? descriptionId : undefined}
    onCancel={(event) => { event.preventDefault(); close(); }}
    onClick={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="pm-sheet" onClick={(event) => event.stopPropagation()}>
      <header className="pm-sheet-header" onPointerDown={(event) => {
        if (busy || event.button !== 0 || (event.target as Element).closest('button')) return;
        drag.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={(event) => {
        if (drag.current === null) return;
        const sheet = event.currentTarget.parentElement!;
        sheet.style.transition = 'none';
        sheet.style.transform = `translateY(${Math.max(0, event.clientY - drag.current)}px)`;
      }} onPointerUp={(event) => {
        if (drag.current === null) return;
        const distance = event.clientY - drag.current; drag.current = null;
        const sheet = event.currentTarget.parentElement!;
        sheet.style.removeProperty('transition'); sheet.style.removeProperty('transform');
        if (distance > 95) close();
      }} onPointerCancel={(event) => {
        drag.current = null;
        event.currentTarget.parentElement!.style.removeProperty('transition');
        event.currentTarget.parentElement!.style.removeProperty('transform');
      }}>
        <div className="pm-sheet-handle" />
        <button type="button" className="pm-sheet-close" onClick={close} disabled={busy} autoFocus aria-label="Cerrar"><X size={16}/></button>
        <h2 id={titleId}>{panel.title}</h2>
        {panel.description ? <p id={descriptionId}>{panel.description}</p> : null}
      </header>
      <div className="pm-sheet-content">{panel.children}</div>
      {panel.footer ? <footer className="pm-sheet-footer">{panel.footer}</footer> : null}
    </section>
  </dialog>;
}
