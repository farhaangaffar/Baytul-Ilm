import { useReorder } from '../lib/useReorder';

// Wraps useReorder in its own component so that state changes during a drag
// (which happen on every hovered-card change) only re-render this grid and its
// cards — not the whole page (stat boxes, tabs, modals) that renders around it.
export default function ReorderableGrid({ items, getId, onReordered, className, renderItem }) {
  const { list, isDragging, handleProps, cardAttrs } = useReorder(items, getId, onReordered);
  return (
    <div className={className}>
      {list.map(item => {
        const id = getId(item);
        return renderItem(item, { isDragging: isDragging(id), handleProps: handleProps(id), cardAttrs: cardAttrs(id) });
      })}
    </div>
  );
}
