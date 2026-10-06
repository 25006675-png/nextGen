"use client";

import { useState } from "react";

/** Photo for an item from public/items/<name-slug>.webp, or its first letter if there is none. */
export function ItemImage({ name, className = "h-12 w-12" }: { name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  if (failed) {
    return (
      <span className={`grid shrink-0 place-items-center rounded-xl bg-brand-soft font-semibold text-brand-strong ${className}`}>
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static thumbnails, already sized
    <img
      src={`/items/${slug}.webp`}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-xl bg-canvas object-cover ${className}`}
    />
  );
}
