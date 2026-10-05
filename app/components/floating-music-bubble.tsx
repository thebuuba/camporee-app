'use client';

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Music2 } from 'lucide-react';
import { clampPosition, parsePosition, restorePosition, snapPosition, type Bounds, type EdgePosition, type Point } from '@/lib/music-bubble-position';
import '../floating-music-bubble.css';

const storageKey = 'camporee:music-bubble-position';

export default function FloatingMusicBubble({ title, playing, onOpen }: { title: string; playing: boolean; onOpen: () => void }) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [point, setPoint] = useState<Point>({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const bounds = useRef<Bounds>({ minX: 0, maxX: 0, minY: 0, maxY: 0 });
  const saved = useRef<EdgePosition>({ edge: 'right', offset: 0.12 });
  const drag = useRef<{ id: number; startX: number; startY: number; point: Point; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    const element = document.createElement('div');
    element.className = 'music-bubble-host';
    // A body portal is inert behind showModal(); keep it inside the newest modal.
    const modalOrder: HTMLDialogElement[] = [];
    const syncHost = (records: MutationRecord[] = []) => {
      const dialogs = Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]')).filter(dialog => dialog.matches(':modal'));
      for (let index = modalOrder.length - 1; index >= 0; index--) if (!dialogs.includes(modalOrder[index])) modalOrder.splice(index, 1);
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof HTMLDialogElement && dialogs.includes(record.target)) {
          const index = modalOrder.indexOf(record.target);
          if (index >= 0) modalOrder.splice(index, 1);
          modalOrder.push(record.target);
        }
      }
      for (const dialog of dialogs) if (!modalOrder.includes(dialog)) modalOrder.push(dialog);
      const parent = modalOrder.at(-1) ?? document.body;
      if (element.parentElement !== parent) parent.appendChild(element);
    };
    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open'] });
    try { saved.current = parsePosition(localStorage.getItem(storageKey)) ?? saved.current; } catch { /* Storage can be disabled. */ }
    const resize = () => {
      const style = getComputedStyle(element);
      const viewport = window.visualViewport;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const minX = left + Math.min(parseFloat(style.paddingLeft), Math.max(0, width - 48));
      const minY = top + Math.min(parseFloat(style.paddingTop), Math.max(0, height - 48));
      bounds.current = { minX, minY, maxX: Math.max(minX, left + width - 48 - parseFloat(style.paddingRight)), maxY: Math.max(minY, top + height - 48 - parseFloat(style.paddingBottom)) };
      if (drag.current?.moved) suppressClick.current = true;
      drag.current = null;
      setDragging(false);
      setPoint(restorePosition(saved.current, bounds.current));
    };
    resize();
    setHost(element);
    window.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('resize', resize);
    window.visualViewport?.addEventListener('scroll', resize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('resize', resize);
      window.visualViewport?.removeEventListener('scroll', resize);
      element.remove();
    };
  }, []);

  function settle(position: Point) {
    saved.current = snapPosition(position, bounds.current);
    setPoint(restorePosition(saved.current, bounds.current));
    try { localStorage.setItem(storageKey, JSON.stringify(saved.current)); } catch { /* Moving still works without storage. */ }
  }

  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = drag.current;
    if (!active || active.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (active.moved) {
      suppressClick.current = true;
      settle(clampPosition({ x: active.point.x + event.clientX - active.startX, y: active.point.y + event.clientY - active.startY }, bounds.current));
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (!host) return null;
  return createPortal(<button type="button" className={`music-bubble${playing ? ' is-playing' : ''}${dragging ? ' is-dragging' : ''}`}
    style={{ transform: `translate3d(${point.x}px, ${point.y}px, 0)` }}
    aria-label={`Abrir reproductor: ${title}. Usa las flechas para mover; Mayúsculas y flecha para cambiar de borde.`} aria-haspopup="dialog"
    onClick={event => { event.stopPropagation(); if (suppressClick.current && event.detail !== 0) { suppressClick.current = false; return; } suppressClick.current = false; onOpen(); }}
    onPointerDown={event => {
      event.stopPropagation();
      if (event.button !== 0 || !event.isPrimary) return;
      suppressClick.current = false;
      drag.current = { id: event.pointerId, startX: event.clientX, startY: event.clientY, point, moved: false };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={event => {
      const active = drag.current;
      if (!active || active.id !== event.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      if (!active.moved && Math.hypot(dx, dy) < 6) return;
      active.moved = true;
      setDragging(true);
      setPoint(clampPosition({ x: active.point.x + dx, y: active.point.y + dy }, bounds.current));
    }}
    onPointerUp={finish}
    onPointerCancel={() => { if (drag.current?.moved) suppressClick.current = true; drag.current = null; setDragging(false); settle(point); }}
    onLostPointerCapture={() => { if (drag.current) { suppressClick.current = drag.current.moved; drag.current = null; setDragging(false); settle(point); } }}
    onKeyDown={event => {
      const movement: Record<string, Point> = { ArrowLeft: { x: -24, y: 0 }, ArrowRight: { x: 24, y: 0 }, ArrowUp: { x: 0, y: -24 }, ArrowDown: { x: 0, y: 24 } };
      const delta = movement[event.key];
      if (!delta) return;
      event.preventDefault(); event.stopPropagation();
      if (event.shiftKey) {
        settle({ x: delta.x < 0 ? bounds.current.minX : delta.x > 0 ? bounds.current.maxX : point.x, y: delta.y < 0 ? bounds.current.minY : delta.y > 0 ? bounds.current.maxY : point.y });
        return;
      }
      const next = clampPosition({ x: point.x + delta.x, y: point.y + delta.y }, bounds.current);
      setPoint(next);
    }}
    onKeyUp={event => { if (event.key.startsWith('Arrow')) settle(point); }}>
    <Music2 size={23} aria-hidden="true"/><span className="music-bubble-dot" aria-hidden="true"/>
  </button>, host);
}
