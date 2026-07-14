import { useRef, useState } from 'react';

// Drag-to-reorder for a list of cards, driven from a small handle rather than the
// whole card (so tapping a card still opens it). Built on Pointer Events instead of
// native HTML5 drag-and-drop because HTML5 DnD doesn't fire on touch devices, and
// this app is used on phones as much as desktop.
//
// items: the server-ordered list to render when nothing is being dragged.
// getId: (item) => stable id string.
// onCommit: (orderedIds) => Promise — called once, on drop, with the full new order.
export function useReorder(items, getId, onCommit) {
  const [dragOrder, setDragOrder] = useState(null); // array of ids while a drag is in progress
  const draggingId = useRef(null);
  // pointerup fires from a listener installed at drag-start time, so it needs a way to read
  // the latest dragOrder rather than closing over the value from that render.
  const dragOrderRef = useRef(dragOrder);
  dragOrderRef.current = dragOrder;

  const list = dragOrder
    ? dragOrder.map(id => items.find(it => getId(it) === id)).filter(Boolean)
    : items;

  function moveTo(overId) {
    if (!draggingId.current || draggingId.current === overId) return;
    setDragOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(draggingId.current);
      const to = arr.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, draggingId.current);
      return arr;
    });
  }

  function handlePointerDown(id, e) {
    e.preventDefault();
    e.stopPropagation();
    draggingId.current = id;
    const startOrder = items.map(getId);
    setDragOrder(startOrder);

    function onMove(ev) {
      const point = ev.touches ? ev.touches[0] : ev;
      const el = document.elementFromPoint(point.clientX, point.clientY)?.closest('[data-reorder-id]');
      if (el) moveTo(el.getAttribute('data-reorder-id'));
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      document.body.style.userSelect = '';
      const finalOrder = draggingId.current ? [...(dragOrderRef.current || startOrder)] : null;
      draggingId.current = null;
      if (finalOrder) {
        try { await onCommit(finalOrder); } catch { /* card already reflects the drop; a background refresh will reconcile */ }
      }
    }
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  return {
    list,
    isDragging: id => draggingId.current === id,
    handleProps: id => ({
      onPointerDown: e => handlePointerDown(id, e),
      style: { touchAction: 'none', cursor: 'grab' },
    }),
    cardAttrs: id => ({ 'data-reorder-id': id }),
  };
}
