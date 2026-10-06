/**
 * The app's tooltip card (map overlays, figures, element tracker): a title, a
 * coloured kind line and a short body.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

export function TipCard({ title, kind, color, children }: { title: string; kind: string; color: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/95 px-3 py-2 text-sm shadow-lg">
      <div className="font-medium text-frost-100">{title}</div>
      <div className="mb-1 flex items-center gap-1.5 text-xs text-frost-400">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
        {kind}
      </div>
      <div className="grid gap-1 text-xs text-frost-200">{children}</div>
    </div>
  );
}

/**
 * Shows a TipCard while the mouse is over the wrapped element: above it, or
 * below when there is no room, kept inside the window horizontally.
 */
export function HoverTip({ tip, children }: { tip: { title: string; kind: string; color: string; body?: ReactNode }; children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect>();
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean }>();
  useLayoutEffect(() => {
    if (!rect || !card.current) return setPos(undefined);
    const { offsetWidth: w, offsetHeight: h } = card.current;
    const below = rect.top - h < 0;
    const left = Math.max(8, Math.min(window.innerWidth - w - 8, rect.left + rect.width / 2 - w / 2));
    const top = below ? rect.bottom : rect.top - h;
    if (!pos || pos.left !== left || pos.top !== top) setPos({ left, top, below });
  });
  return (
    <span
      ref={anchor}
      className="inline-flex"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setRect(anchor.current!.getBoundingClientRect())}
      onPointerLeave={() => setRect(undefined)}
    >
      {children}
      {rect &&
        createPortal(
          <div
            ref={card}
            className={`pointer-events-none fixed z-50 w-60 ${pos?.below ? 'pt-2' : 'pb-2'}`}
            style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          >
            <TipCard title={tip.title} kind={tip.kind} color={tip.color}>
              {tip.body}
            </TipCard>
          </div>,
          document.body
        )}
    </span>
  );
}
