import React, { useRef, useState } from "react";

function SortableList({ items, getKey, renderItem, onReorder, disabled = false, className }) {
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const containerRef = useRef(null);
  const midpointsRef = useRef([]);
  const startYRef = useRef(0);

  function computeTargetIndex(pointerY) {
    const midpoints = midpointsRef.current;
    let count = 0;

    for (let i = 0; i < midpoints.length; i += 1) {
      if (i !== draggingIndex && midpoints[i] < pointerY) {
        count += 1;
      }
    }

    return Math.min(count, midpoints.length - 1);
  }

  function handlePointerDown(event, index) {
    if (disabled) {
      return;
    }

    const container = containerRef.current;

    if (!container) {
      return;
    }

    event.preventDefault();
    midpointsRef.current = Array.from(container.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return rect.top + rect.height / 2;
    });
    startYRef.current = event.clientY;
    setDraggingIndex(index);
    setOverIndex(index);
    setDragOffset(0);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event) {
    if (draggingIndex === null) {
      return;
    }

    setDragOffset(event.clientY - startYRef.current);
    setOverIndex(computeTargetIndex(event.clientY));
  }

  function handlePointerUp() {
    if (draggingIndex !== null && overIndex !== null && overIndex !== draggingIndex) {
      onReorder(draggingIndex, overIndex);
    }

    setDraggingIndex(null);
    setOverIndex(null);
    setDragOffset(0);
  }

  return (
    <div className={className} ref={containerRef}>
      {items.map((item, index) => {
        const isDragging = index === draggingIndex;
        const isOver = draggingIndex !== null && !isDragging && overIndex === index;
        const dragHandleProps = {
          onPointerDown: (event) => handlePointerDown(event, index),
          onPointerMove: handlePointerMove,
          onPointerUp: handlePointerUp
        };
        const style = isDragging
          ? { transform: `translateY(${dragOffset}px)`, position: "relative", zIndex: 5 }
          : undefined;

        return (
          <div
            key={getKey(item)}
            className={`sortable-item${isDragging ? " sortable-item--dragging" : ""}${
              isOver ? " sortable-item--over" : ""
            }`}
            style={style}
          >
            {renderItem(item, dragHandleProps, index)}
          </div>
        );
      })}
    </div>
  );
}

export default SortableList;
