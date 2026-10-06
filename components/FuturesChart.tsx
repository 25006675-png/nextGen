"use client";

import { useEffect, useRef } from "react";
import { addDays, shortDay } from "@/lib/dates";
import { PALETTE, alpha } from "@/lib/palette";

const PAD = { left: 40, right: 12, top: 12, bottom: 26 };
const GREEN = alpha(PALETTE.green, 0.05);
const RED = alpha(PALETTE.loss, 0.05);
const AXIS = PALETTE.larvaLine;

/**
 * Draws every simulated future of one stock lot: its quantity from now until
 * the expiry day. Futures that end with stock left (wasted) are red.
 * Lines draw in over ~1.5s so the fan visibly "spreads" on screen.
 */
export function FuturesChart({
  paths,
  wasted,
  today,
  unit,
}: {
  paths: number[][];
  wasted: boolean[];
  today: string;
  unit: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas || paths.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const steps = paths[0].length; // start + one point per day
    const yMax = Math.max(...paths.map((p) => p[0])) * 1.08 || 1;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;
    let current = reduceMotion ? 1 : 0; // eased progress of the draw-in, reused on resize

    const draw = (progress: number) => {
      const width = wrap.clientWidth;
      const height = 220;
      const dpr = window.devicePixelRatio || 1;
      // Backing store is whole pixels, so compare rounded sizes (fractional dpr would never match).
      const pxW = Math.round(width * dpr);
      const pxH = Math.round(height * dpr);
      if (canvas.width !== pxW || canvas.height !== pxH) {
        canvas.width = pxW;
        canvas.height = pxH;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const plotW = width - PAD.left - PAD.right;
      const plotH = height - PAD.top - PAD.bottom;
      const x = (i: number) => PAD.left + (steps > 1 ? (i / (steps - 1)) * plotW : 0);
      const y = (v: number) => PAD.top + plotH - (v / yMax) * plotH;

      // Axes and labels
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle = AXIS;
      ctx.strokeStyle = PALETTE.line;
      ctx.lineWidth = 1;
      for (const frac of [0, 0.5, 1]) {
        const v = (yMax / 1.08) * frac;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y(v));
        ctx.lineTo(width - PAD.right, y(v));
        ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(`${Math.round(v * 10) / 10}`, PAD.left - 6, y(v) + 4);
      }
      ctx.textAlign = "center";
      for (let i = 0; i < steps; i++) {
        const label = i === 0 ? "now" : shortDay(addDays(today, i - 1));
        if (steps > 8 && i % 2 === 1 && i !== steps - 1) continue;
        ctx.fillText(label, x(i), height - 8);
      }
      ctx.save();
      ctx.translate(11, PAD.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(`${unit} left`, 0, 0);
      ctx.restore();

      // Expiry marker
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = PALETTE.loss;
      ctx.beginPath();
      ctx.moveTo(x(steps - 1), PAD.top);
      ctx.lineTo(x(steps - 1), PAD.top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // Futures: one stroke per line so overlapping futures build up colour
      // (dense = likely); green first so red sits on top.
      const upto = progress * (steps - 1);
      const whole = Math.floor(upto);
      const frac = upto - whole;
      ctx.lineWidth = 1.2;
      for (const red of [false, true]) {
        ctx.strokeStyle = red ? RED : GREEN;
        for (let r = 0; r < paths.length; r++) {
          if (wasted[r] !== red) continue;
          const p = paths[r];
          ctx.beginPath();
          ctx.moveTo(x(0), y(p[0]));
          for (let i = 1; i <= whole; i++) ctx.lineTo(x(i), y(p[i]));
          if (frac > 0 && whole + 1 < steps) {
            ctx.lineTo(x(whole + frac), y(p[whole] + (p[whole + 1] - p[whole]) * frac));
          }
          ctx.stroke();
        }
      }

      // End points: where each future finishes at expiry.
      if (progress >= 1) {
        for (let r = 0; r < paths.length; r++) {
          ctx.fillStyle = wasted[r] ? alpha(PALETTE.loss, 0.25) : alpha(PALETTE.green, 0.25);
          ctx.fillRect(x(steps - 1) - 1.5, y(paths[r][steps - 1]) - 1.5, 3, 3);
        }
      }
    };

    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / 1500);
      current = 1 - Math.pow(1 - p, 3);
      draw(current);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    if (reduceMotion) draw(1);
    else frame = requestAnimationFrame(tick);

    // Fires once on observe too, so redraw at the current progress (not the finished fan).
    const ro = new ResizeObserver(() => draw(current));
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [paths, wasted, today, unit]);

  return (
    <div ref={wrapRef} className="w-full">
      <canvas ref={canvasRef} role="img" aria-label="Simulated stock levels until expiry" />
    </div>
  );
}
