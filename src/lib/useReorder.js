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
  const lastOverId = useRef(null); // avoids re-splicing the array on every pointermove tick
  const dragOrderRef = useRef(null);
  const rafId = useRef(null);
  const latestPoint = useRef(null);

  const list = dragOrder
    ? dragOrder.map(id => items.find(it => getId(it) === id)).filter(Boolean)
    : items;

  function moveTo(overId) {
    if (!draggingId.current || draggingId.current === overId || lastOverId.current === overId) return;
    lastOverId.current = overId;
    setDragOrder(prev => {
      const arr = [...prev];
      const from = arr.indexOf(draggingId.current);
      const to = arr.indexOf(overId);
      if (from === -1 || to === -1) return prev;
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      dragOrderRef.current = arr;
      return arr;
    });
  }

  function processFrame() {
    rafId.current = null;
    const point = latestPoint.current;
    if (!point) return;
    const el = document.elementFromPoint(point.x, point.y)?.closest('[data-reorder-id]');
    if (el) moveTo(el.getAttribute('data-reorder-id'));
  }

  function handlePointerDown(id, e) {
    e.preventDefault();
    e.stopPropagation();
    // Pointer capture keeps events targeted at the handle even once the finger/cursor is
    // over a different card, which stops letting go over another card from synthesizing a
    // click there and "opening" it. Captured events still bubble to window normally, so the
    // move/up listeners are attached there rather than to the handle's own DOM node — that
    // node can otherwise go stale if a reorder mid-drag causes React to move it in the tree.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not critical if unsupported */ }

    draggingId.current = id;
    lastOverId.current = id;
    const startOrder = items.map(getId);
    setDragOrder(startOrder);
    dragOrderRef.current = startOrder;

    function onMove(ev) {
      latestPoint.current = { x: ev.clientX, y: ev.clientY };
      if (rafId.current == null) rafId.current = requestAnimationFrame(processFrame);
    }
    async function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // A pending animation frame holding the final pointer position would otherwise be
      // dropped by cancelAnimationFrame below, silently losing the last movement before release.
      if (rafId.current != null) { cancelAnimationFrame(rafId.current); rafId.current = null; processFrame(); }
      document.body.style.userSelect = '';

      const finalOrder = dragOrderRef.current;
      const wasDragging = draggingId.current;
      draggingId.current = null;
      lastOverId.current = null;
      setDragOrder(null);

      if (wasDragging && finalOrder) {
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
