import React, { useLayoutEffect, useRef } from 'react';
import { useReorder } from '../lib/useReorder';

// Wraps useReorder in its own component so that state changes during a drag
// (which happen on every hovered-card change) only re-render this grid and its
// cards — not the whole page (stat boxes, tabs, modals) that renders around it.
// When the order changes, the cards glide up or down to their new places instead of
// jumping (each starts where it was and slides — the "FLIP" trick).
export default function ReorderableGrid({ items, getId, onReordered, className, renderItem }) {
  const { list, isDragging, handleProps, cardAttrs } = useReorder(items, getId, onReordered);
  const box = useRef(null);
  const places = useRef(new Map()); // id → where the card was (page position)
  const order = list.map(getId).join('|');
  const lastOrder = useRef(order);

  useLayoutEffect(() => {
    const cards = box.current ? [...box.current.querySelectorAll(':scope > [data-reorder-id]')] : [];
    const moved = order !== lastOrder.current;
    lastOrder.current = order;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    for (const el of cards) {
      const id = el.getAttribute('data-reorder-id');
      const r = el.getBoundingClientRect();
      const now = { x: r.left + window.scrollX, y: r.top + window.scrollY };
      const was = places.current.get(id);
      places.current.set(id, now);
      if (!moved || !was || reduce) continue;
      const dx = was.x - now.x, dy = was.y - now.y;
      if (!dx && !dy) continue;
      el.style.transition = 'none';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      requestAnimationFrame(() => {
        el.style.transition = 'transform 200ms ease';
        el.style.transform = '';
      });
    }
  });

  return (
    <div className={className} ref={box}>
      {list.map(item => {
        const id = getId(item);
        return renderItem(item, { isDragging: isDragging(id), handleProps: handleProps(id), cardAttrs: cardAttrs(id) });
      })}
    </div>
  );
}
