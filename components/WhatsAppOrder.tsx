"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Camera,
  CheckCheck,
  Mic,
  MoreVertical,
  Paperclip,
  Phone,
  SendHorizontal,
  Smile,
  Video,
  X,
} from "lucide-react";

const now = () => new Date().toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }).toLowerCase();

/** "Send on WhatsApp" button that opens a phone-style chat preview with the message ready to send. */
export function WhatsAppOrder({
  label,
  supplier,
  message,
  reply,
}: {
  label: string;
  supplier: string;
  message: string;
  reply: string; // the supplier's demo answer after sending
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print inline-flex items-center justify-center gap-2 rounded-xl bg-wa-header px-4 py-2.5 text-sm font-semibold text-white transition hover:brightness-110"
      >
        <WhatsAppLogo variant="white" /> {label}
      </button>
      {open && <ChatPreview supplier={supplier} message={message} reply={reply} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhatsAppLogo({ variant }: { variant: "white" | "green" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny static icon
    <img src={variant === "white" ? "/brand/whatsapp-white.png" : "/brand/whatsapp.png"} alt="" width={18} height={18} />
  );
}

type Stage = "draft" | "sent" | "read" | "typing" | "replied";

function ChatPreview({
  supplier,
  message,
  reply,
  onClose,
}: {
  supplier: string;
  message: string;
  reply: string;
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("draft");
  const [times, setTimes] = useState({ sent: "", reply: "" });
  const [clock] = useState(now);
  const closeRef = useRef<HTMLButtonElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Behave like a dialog: Esc closes, the page behind doesn't scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  // After sending: ticks turn blue, the supplier types, then answers.
  useEffect(() => {
    const next: Partial<Record<Stage, [Stage, number]>> = {
      sent: ["read", 900],
      read: ["typing", 700],
      typing: ["replied", 1600],
    };
    const step = next[stage];
    if (!step) return;
    const t = setTimeout(() => {
      if (step[0] === "replied") setTimes((x) => ({ ...x, reply: now() }));
      setStage(step[0]);
    }, step[1]);
    return () => clearTimeout(t);
  }, [stage]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [stage]);

  const send = () => {
    setTimes({ sent: now(), reply: "" });
    setStage("sent");
  };
  const sent = stage !== "draft";
  const initials = supplier
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("");

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-ink/60 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`WhatsApp chat with ${supplier}`}
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-[calc(100dvh-7rem)] w-full max-w-md shrink-0 flex-col overflow-hidden rounded-2xl bg-wa-wall shadow-2xl md:h-[min(680px,calc(100dvh-7rem))] md:w-[360px] md:rounded-[2.25rem] md:border-[7px] md:border-wa-bezel"
      >
        {/* Status bar + chat header */}
        <div className="bg-wa-header text-white">
          <div className="hidden items-center justify-between px-5 pt-1.5 text-[11px] font-medium md:flex">
            <span>{clock}</span>
            <span className="h-3.5 w-14 rounded-full bg-black/80" aria-hidden />
            <span>5G ▮▮▮</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-2">
            <button type="button" onClick={onClose} aria-label="Back" className="rounded-full p-1">
              <ArrowLeft size={20} />
            </button>
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-wa-avatar text-sm font-bold text-wa-icon">
              {initials}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate font-semibold">{supplier}</div>
              <div className="text-xs text-white/80">{stage === "typing" ? "typing…" : "online"}</div>
            </div>
            <Video size={20} className="mx-1.5" />
            <Phone size={18} className="mx-1.5" />
            <MoreVertical size={18} className="ml-1" />
          </div>
        </div>

        {/* Messages */}
        <div ref={bodyRef} className="flex-1 space-y-2 overflow-y-auto px-3 py-3 text-[14px] leading-snug text-wa-ink">
          <div className="mx-auto w-fit rounded-lg bg-white/90 px-3 py-1 text-xs text-wa-icon shadow-sm">Today</div>
          {sent && (
            <div className="wa-in-right ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-wa-out px-2.5 pb-1 pt-1.5 shadow-sm">
              <p className="whitespace-pre-line">{message}</p>
              <div className="mt-0.5 flex items-center justify-end gap-1 text-[11px] text-wa-meta">
                {times.sent}
                <CheckCheck size={15} className={stage === "sent" ? "text-wa-grey" : "text-wa-tick"} />
              </div>
            </div>
          )}
          {stage === "typing" && (
            <div className="wa-in-left w-fit rounded-lg rounded-tl-none bg-white px-3 py-2.5 shadow-sm" aria-label="typing">
              <span className="wa-dots flex gap-1">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          {stage === "replied" && (
            <div className="wa-in-left w-fit max-w-[85%] rounded-lg rounded-tl-none bg-white px-2.5 pb-1 pt-1.5 shadow-sm">
              <p className="whitespace-pre-line">{reply}</p>
              <div className="mt-0.5 text-right text-[11px] text-wa-meta">{times.reply}</div>
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="flex items-end gap-1.5 px-1.5 pb-2 pt-1">
          <div className="flex min-w-0 flex-1 items-end gap-2 rounded-3xl bg-white px-3 py-2 shadow-sm">
            <Smile size={20} className="mb-0.5 shrink-0 text-wa-icon" />
            <p
              className={`max-h-28 min-w-0 flex-1 overflow-y-auto whitespace-pre-line text-[14px] leading-snug ${
                sent ? "text-wa-grey" : "text-wa-ink"
              }`}
            >
              {sent ? "Message" : message}
            </p>
            <Paperclip size={18} className="mb-0.5 shrink-0 -rotate-45 text-wa-icon" />
            {sent && <Camera size={18} className="mb-0.5 shrink-0 text-wa-icon" />}
          </div>
          <button
            type="button"
            onClick={sent ? undefined : send}
            aria-label={sent ? "Voice message" : "Send"}
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-full bg-wa-send text-white shadow ${
              sent ? "" : "wa-pulse"
            }`}
          >
            {sent ? <Mic size={20} /> : <SendHorizontal size={20} />}
          </button>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-sm font-semibold text-ink"
        >
          <WhatsAppLogo variant="green" /> Open in WhatsApp
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-2 text-sm font-semibold text-white"
        >
          <X size={15} /> Close
        </button>
      </div>
      <p className="shrink-0 text-xs text-white/70">Preview: tap send to see the demo. The supplier&apos;s reply is simulated.</p>
    </div>
  );
}
