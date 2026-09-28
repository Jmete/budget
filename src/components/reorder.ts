import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';

interface DragState {
  from: number;
  to: number;
  dy: number;
  size: number;
}

/** Distance from the viewport edge (px) where a drag starts scrolling the page. */
const EDGE = 72;

/**
 * Drag-and-drop reordering for a list of `.row` elements marked with `data-drag-row`.
 * Rows stay in place while dragging (the dragged row follows the pointer, the others
 * slide aside); the list order only changes on drop. Pointer events cover mouse and
 * touch, and the handle also moves its row with the arrow keys.
 */
export function useReorder(onMove: (from: number, to: number) => void) {
  const listRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const cleanup = useRef<() => void>(undefined);

  useEffect(() => () => cleanup.current?.(), []);

  const onPointerDown = (index: number) => (e: PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !listRef.current) return;
    e.preventDefault();
    const rows = [...listRef.current.querySelectorAll<HTMLElement>('[data-drag-row]')];
    if (!rows[index]) return;
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + window.scrollY + b.height / 2;
    });
    const size = rows[index].getBoundingClientRect().height;
    const startY = e.clientY + window.scrollY;
    let clientY = e.clientY;
    let to = index;
    let frame = 0;

    const update = () => {
      const dy = clientY + window.scrollY - startY;
      const center = mids[index] + dy;
      let t = index;
      while (t < mids.length - 1 && center > mids[t + 1]) t++;
      while (t > 0 && center < mids[t - 1]) t--;
      to = t;
      setDrag({ from: index, to, dy, size });
    };
    // Scroll the page while the pointer rests near the top or bottom edge.
    const tick = () => {
      const step =
        clientY < EDGE ? -Math.ceil((EDGE - clientY) / 6)
        : clientY > window.innerHeight - EDGE ? Math.ceil((clientY - window.innerHeight + EDGE) / 6)
        : 0;
      if (step) {
        window.scrollBy(0, step);
        update();
      }
      frame = requestAnimationFrame(tick);
    };

    const move = (ev: globalThis.PointerEvent) => {
      clientY = ev.clientY;
      update();
    };
    const end = (ev: globalThis.PointerEvent) => {
      const cancelled = ev.type === 'pointercancel';
      cleanup.current?.();
      if (!cancelled && to !== index) onMove(index, to);
    };
    cleanup.current = () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      cleanup.current = undefined;
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    update();
    frame = requestAnimationFrame(tick);
  };

  const onKeyDown = (index: number, count: number) => (e: KeyboardEvent<HTMLElement>) => {
    const to = e.key === 'ArrowUp' ? index - 1 : e.key === 'ArrowDown' ? index + 1 : -1;
    if (to < 0 || to >= count) return;
    e.preventDefault();
    onMove(index, to);
  };

  const rowStyle = (index: number): CSSProperties | undefined => {
    if (!drag) return undefined;
    const { from, to, dy, size } = drag;
    if (index === from) return { transform: `translateY(${dy}px)` };
    let shift = 0;
    if (from < to && index > from && index <= to) shift = -size;
    else if (to < from && index >= to && index < from) shift = size;
    return { transform: shift ? `translateY(${shift}px)` : undefined, transition: 'transform 150ms ease' };
  };

  const rowClass = (index: number) => (drag?.from === index ? 'is-dragging' : '');

  return { listRef, dragging: drag !== null, onPointerDown, onKeyDown, rowStyle, rowClass };
}
