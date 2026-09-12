'use client';

import { useEffect } from 'react';

const CLOSE_DISTANCE = 95;

export default function MoreSheetBehavior() {
  useEffect(() => {
    let active: { backdrop: HTMLElement; sheet: HTMLElement; startY: number; offset: number; pointerId: number } | null = null;

    function resetSheet(sheet: HTMLElement) {
      sheet.classList.remove('is-dragging');
      sheet.style.removeProperty('transform');
    }

    function startDrag(event: globalThis.PointerEvent) {
      if (event.button !== 0 || !(event.target instanceof Element)) return;
      if (window.matchMedia('(min-width: 900px)').matches) return;
      const grip = event.target.closest('.sheet-handle, .sheet-card > h2, .sheet-card > .sheet-title-row');
      const sheet = event.target.closest<HTMLElement>('.sheet-card');
      const backdrop = sheet?.closest<HTMLElement>('.sheet-backdrop');
      if (!grip || !sheet || !backdrop || !backdrop.closest('.more-route-shell')) return;
      if (sheet.matches('.participant-edit-sheet, .task-edit-sheet, .program-activity-sheet')) return;
      if (sheet.querySelector('button[type="submit"]:disabled')) return;

      event.preventDefault();
      active = { backdrop, sheet, startY:event.clientY, offset:0, pointerId:event.pointerId };
      sheet.classList.add('is-dragging');
      if (grip instanceof HTMLElement) grip.setPointerCapture?.(event.pointerId);
    }

    function moveDrag(event: globalThis.PointerEvent) {
      if (!active || active.pointerId !== event.pointerId) return;
      active.offset = Math.max(0, event.clientY - active.startY);
      active.sheet.style.transform = `translateY(${active.offset}px)`;
    }

    function finishDrag(event: globalThis.PointerEvent) {
      if (!active || active.pointerId !== event.pointerId) return;
      const { backdrop, sheet, offset } = active;
      active = null;
      resetSheet(sheet);
      if (offset > CLOSE_DISTANCE) backdrop.click();
    }

    document.addEventListener('pointerdown', startDrag);
    document.addEventListener('pointermove', moveDrag);
    document.addEventListener('pointerup', finishDrag);
    document.addEventListener('pointercancel', finishDrag);
    return () => {
      document.removeEventListener('pointerdown', startDrag);
      document.removeEventListener('pointermove', moveDrag);
      document.removeEventListener('pointerup', finishDrag);
      document.removeEventListener('pointercancel', finishDrag);
      if (active) resetSheet(active.sheet);
    };
  }, []);

  return null;
}
