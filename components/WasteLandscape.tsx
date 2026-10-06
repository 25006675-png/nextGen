"use client";

import { useEffect, useRef, useState } from "react";
import type { Landscape } from "@/lib/queries";
import { PALETTE } from "@/lib/palette";

/**
 * 3D cost landscape: how much a delivery size costs (waste + missed sales)
 * across quiet to busy weeks. Turns once, slowly, unless the viewer grabs it first.
 */
export function WasteLandscape({ data }: { data: Landscape }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  // On touch screens a swipe over the chart would rotate it instead of scrolling
  // the page, so the chart only takes touches after a deliberate tap.
  const [touch, setTouch] = useState(false);
  const [armed, setArmed] = useState(false);
  useEffect(() => setTouch(window.matchMedia("(pointer: coarse)").matches), []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    let grabbed = false; // set even before Plotly loads, so rotation never starts
    let Plotly: any; // eslint-disable-line @typescript-eslint/no-explicit-any

    const stop = () => {
      grabbed = true;
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    el.addEventListener("pointerdown", stop);
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });

    (async () => {
      try {
        const mod = await import("plotly.js-dist-min");
        Plotly = mod.default ?? mod;
      } catch {
        setFailed(true);
        return;
      }
      if (cancelled) return;

      const ys = data.scenarios.map((s) => Math.round((s - 1) * 100));
      const lift = Math.max(...data.cost.flat()) * 0.015; // keep lines visible above the surface
      const line = (name: string, color: string, order: number, cost: number[]) => [
        {
          type: "scatter3d",
          mode: "lines",
          name,
          x: ys.map(() => order),
          y: ys,
          z: cost.map((c) => c + lift),
          line: { color, width: 9 },
          hovertemplate: `${name}: ${order.toFixed(1)} ${data.unit}<br>Week %{y:+}%<br>RM%{z:.0f} lost/week<extra></extra>`,
        },
        {
          type: "scatter3d",
          mode: "markers",
          showlegend: false,
          x: [order],
          y: [0],
          z: [cost[ys.indexOf(0)] + lift],
          marker: { color, size: 7, line: { color: "white", width: 2 } },
          hoverinfo: "skip",
        },
      ];

      const traces = [
        {
          type: "surface",
          x: data.orders,
          y: ys,
          z: data.cost,
          colorscale: [
            [0, PALETTE.green],
            [0.25, PALETTE.limeDeep],
            [0.5, PALETTE.amber],
            [1, PALETTE.loss],
          ],
          showscale: false,
          opacity: 0.92,
          contours: { z: { show: true, usecolormap: true, project: { z: true }, width: 1 } },
          hovertemplate: `Order %{x:.1f} ${data.unit}<br>Week %{y:+}% vs forecast<br>RM%{z:.0f} lost/week<extra></extra>`,
          lighting: { ambient: 0.75, diffuse: 0.6, specular: 0.15, roughness: 0.6 },
        },
        ...line("Your usual order", PALETTE.loss, data.usual.order, data.usual.cost),
        ...line("Smart order", PALETTE.forest, data.smart.order, data.smart.cost),
      ];

      const axis = (title: string) => ({
        title: { text: title, font: { size: 11, color: PALETTE.muted } },
        tickfont: { size: 10, color: PALETTE.muted },
        gridcolor: PALETTE.line,
        zerolinecolor: PALETTE.line,
        backgroundcolor: "rgba(0,0,0,0)",
        showbackground: true,
      });
      // Phones get a closer, lower camera so the surface fills the shorter box.
      const small = !window.matchMedia("(min-width: 768px)").matches;
      const r = small ? 2.25 : 2.0;
      let angle = -2.3;
      const eye = () => ({ x: r * Math.cos(angle), y: r * Math.sin(angle), z: small ? 0.75 : 0.95 });

      await Plotly.react(
        el,
        traces,
        {
          margin: { l: 0, r: 0, t: 0, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          autosize: true, // height comes from the container (shorter on phones)
          showlegend: true,
          legend: { orientation: "h", x: 0, y: 1, font: { size: 11 } },
          scene: {
            domain: { x: [0, 1], y: [0, small ? 0.9 : 0.94] }, // leave the top strip for the legend
            // Shorter titles on phones so they fit; the RM axis is named in the caption above.
            xaxis: axis(small ? `Order (${data.unit})` : `Order per delivery (${data.unit})`),
            yaxis: axis(small ? "vs forecast (%)" : "Busier / quieter week (%)"),
            zaxis: axis(""), // the caption above says "RM lost per week"; a title here collides with the y title
            camera: { eye: eye(), center: { x: 0, y: 0, z: small ? -0.26 : -0.25 } },
            aspectratio: small ? { x: 1.1, y: 1, z: 0.8 } : { x: 1.2, y: 1, z: 0.7 },
          },
        },
        { displayModeBar: false, responsive: true },
      );
      if (cancelled || grabbed || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const end = angle + 2 * Math.PI; // one full turn (~50s), then rest
      timer = setInterval(() => {
        if (document.hidden) return; // pause in background tabs
        angle += 0.006;
        if (angle >= end) return stop();
        Plotly.relayout(el, { "scene.camera.eye": eye() });
      }, 50);
    })();

    return () => {
      cancelled = true;
      stop();
      el.removeEventListener("pointerdown", stop);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
      if (Plotly) Plotly.purge(el);
    };
  }, [data]);

  if (failed) return <p className="text-sm text-muted">The 3D chart couldn&apos;t load.</p>;
  return (
    <div className="relative">
      <div ref={ref} className="h-[320px] w-full md:h-[420px]" aria-label="3D chart of weekly cost by order size and demand" />
      {touch && !armed && (
        <button
          type="button"
          onClick={() => setArmed(true)}
          className="absolute inset-0 flex items-end justify-center pb-4"
          aria-label="Tap to rotate the 3D chart"
        >
          <span className="rounded-full bg-ink/75 px-3 py-1.5 text-xs font-semibold text-white">Tap to rotate</span>
        </button>
      )}
    </div>
  );
}
