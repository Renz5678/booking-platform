"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { isMobile, isTouch, onScroll, prefersReducedMotion } from "@/engine";
import { usePage } from "@/engine/next";

/**
 * QuietRoomCanvas: a calm, single-clock architectural light field.
 * Renders soft capiz-filtered light bands that breathe slowly at rest
 * and respond gently to pointer position and scroll progress.
 */
export default function QuietRoomCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  usePage(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let visible = true;
    let scrollProgress = 0;

    const pointer = { x: 0.68, y: 0.34, tx: 0.68, ty: 0.34 };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, Math.floor(rect.width));
      height = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    window.addEventListener("resize", resize);

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    const onPointerMove = (e: PointerEvent) => {
      if (isTouch()) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointer.tx = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        pointer.ty = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
      }
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const offScroll = onScroll(({ progress }) => {
      scrollProgress = progress;
    });

    const tick = (time: number) => {
      if (!visible) return;

      pointer.x += (pointer.tx - pointer.x) * 0.04;
      pointer.y += (pointer.ty - pointer.y) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // Slow breathing cycle (~8s period)
      const breath = Math.sin(time * 0.8) * 0.5 + 0.5;
      const cx = width * (pointer.x * 0.45 + 0.42) + Math.cos(time * 0.45) * 18;
      const cy = height * (pointer.y * 0.35 + 0.25 + scrollProgress * 0.12) + Math.sin(time * 0.55) * 12;

      // Warm capiz window light
      const r1 = Math.max(width, height) * (0.48 + breath * 0.08);
      const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
      g1.addColorStop(0, "rgba(23, 89, 70, 0.13)");
      g1.addColorStop(0.45, "rgba(210, 200, 180, 0.28)");
      g1.addColorStop(1, "rgba(243, 241, 236, 0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, width, height);

      // Subtle architectural horizon lines (capiz lattice echo)
      ctx.strokeStyle = "rgba(17, 26, 34, 0.065)";
      ctx.lineWidth = 1;
      const bands = 5;
      for (let i = 1; i <= bands; i++) {
        const yBase = (height / (bands + 1)) * i;
        const drift = Math.sin(time * 0.55 + i * 0.9) * 9;
        ctx.beginPath();
        ctx.moveTo(0, yBase + drift);
        ctx.bezierCurveTo(
          width * 0.33,
          yBase - drift * 0.8,
          width * 0.66,
          yBase + drift * 1.1,
          width,
          yBase - drift * 0.5
        );
        ctx.stroke();
      }
    };

    gsap.ticker.add(tick);
    if (isMobile() || isTouch()) {
      // Render a single calm static frame on mobile so 4x-throttled phones hold 60 fps scroll
      tick(0);
      gsap.ticker.remove(tick);
    }

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      io.disconnect();
      offScroll();
    };
  });

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
