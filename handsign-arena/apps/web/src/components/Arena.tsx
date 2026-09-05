"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GameState } from "@handsign/shared";
import { ArenaRenderer, interpolateState } from "@/lib/render/renderer";
import { TICK_MS } from "@handsign/shared";

export interface ArenaHandle {
  pushState: (state: GameState) => void;
}

export const Arena = forwardRef<ArenaHandle, { className?: string }>(function Arena({ className }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const snapshotsRef = useRef<{ prev: GameState | null; curr: GameState | null; currAt: number; prevAt: number }>({
    prev: null,
    curr: null,
    currAt: 0,
    prevAt: 0,
  });

  useImperativeHandle(ref, () => ({
    pushState(state: GameState) {
      const s = snapshotsRef.current;
      s.prev = s.curr ?? state;
      s.prevAt = s.currAt || performance.now();
      s.curr = state;
      s.currAt = performance.now();
      rendererRef.current?.applyState(state);
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new ArenaRenderer(canvas);
    rendererRef.current = renderer;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      renderer.resize(w, h, dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    let raf: number;
    const loop = () => {
      const s = snapshotsRef.current;
      if (s.curr) {
        const base = s.prev ?? s.curr;
        const elapsed = performance.now() - s.currAt;
        const t = TICK_MS > 0 ? elapsed / TICK_MS : 1;
        const rendered = base === s.curr ? s.curr : interpolateState(base, s.curr, t);
        renderer.render(rendered);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={`relative w-full h-full ${className ?? ""}`}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
});
