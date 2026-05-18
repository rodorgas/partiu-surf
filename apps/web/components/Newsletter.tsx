"use client";
// Newsletter subscribe — Variation B ("Horizon") from the design handoff.
// Same content vocabulary for two surfaces:
//   • Desktop  → popover anchored under the topbar trigger pill (caret)
//   • Mobile   → bottom sheet, scrollable body, sticky CTA
//
// Form state is local: channel (email|whatsapp), freq (daily|weekly) + weekday,
// and up to 3 picos chosen from real SPOTS in lib/spots.ts. The submit handler
// is intentionally a no-op for now — backend wiring lives outside this file.

import { forwardRef, useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Mail, MessageCircle, Phone, Search, X } from "lucide-react";
import { SPOTS, type Spot } from "@/lib/spots";

const N = {
  bg: "#f5e8d2",
  surface: "#fff8e9",
  panel: "#fbecd1",
  deep: "#0a3a44",
  teal: "#147184",
  teal2: "#1d8d9f",
  sun: "#f29c50",
  coral: "#e26a4a",
  foam: "#cde9e3",
  ink: "#1d2a30",
  inkDim: "#557078",
  inkSoft: "#8a9ea3",
  rule: "#e1cfa6",
  green: "#1f8a5b",
  sans: "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  display: "var(--font-display), var(--font-sans), ui-sans-serif, system-ui, sans-serif",
} as const;

type Channel = "email" | "whatsapp";
type Freq = "daily" | "weekly";

const WEEKDAYS = [
  { v: 0, short: "Dom", long: "domingo" },
  { v: 1, short: "Seg", long: "segunda" },
  { v: 2, short: "Ter", long: "terça" },
  { v: 3, short: "Qua", long: "quarta" },
  { v: 4, short: "Qui", long: "quinta" },
  { v: 5, short: "Sex", long: "sexta" },
  { v: 6, short: "Sáb", long: "sábado" },
] as const;

const MAX_PICKS = 3;

function normalizeText(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function useNewsletterForm(initialPicks: string[]) {
  const [channel, setChannel] = useState<Channel>("whatsapp");
  const [freq, setFreq] = useState<Freq>("weekly");
  const [weekday, setWeekday] = useState<number>(5);
  const [picked, setPicked] = useState<string[]>(initialPicks);
  const [query, setQuery] = useState("");

  const togglePick = useCallback((slug: string) => {
    setPicked((p) =>
      p.includes(slug)
        ? p.filter((x) => x !== slug)
        : p.length >= MAX_PICKS
          ? p
          : [...p, slug],
    );
  }, []);

  const allSpots = Object.values(SPOTS);
  const pickedSpots = picked
    .map((slug) => SPOTS[slug])
    .filter((s): s is Spot => Boolean(s));
  const q = normalizeText(query.trim());
  const otherSpots = allSpots
    .filter((s) => !picked.includes(s.slug))
    .filter(
      (s) =>
        !q ||
        normalizeText(s.name).includes(q) ||
        normalizeText(s.region).includes(q),
    );

  return {
    channel,
    setChannel,
    freq,
    setFreq,
    weekday,
    setWeekday,
    picked,
    togglePick,
    query,
    setQuery,
    pickedSpots,
    otherSpots,
  };
}

// ── Shared bits ──────────────────────────────────────────────────────────────

export const NewsletterTrigger = forwardRef<
  HTMLButtonElement,
  { open: boolean; onClick: () => void; compact?: boolean }
>(function NewsletterTrigger({ open, onClick, compact }, ref) {
  const active = open;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-haspopup="dialog"
      data-testid="newsletter-trigger"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: compact ? "8px 12px 8px 10px" : "10px 14px 10px 12px",
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        fontFamily: N.sans,
        fontWeight: 600,
        fontSize: compact ? 12.5 : 13.5,
        letterSpacing: "-0.005em",
        background: active ? N.deep : N.surface,
        color: active ? "#fff" : N.ink,
        boxShadow: active
          ? `0 6px 16px rgba(10,58,68,0.22)`
          : `0 1px 0 ${N.rule}`,
        transition: "background 120ms ease, color 120ms ease, box-shadow 120ms ease",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: active ? "rgba(255,255,255,0.14)" : N.foam,
          color: active ? "#fff" : N.teal,
        }}
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
          <rect
            x="1.5"
            y="3.5"
            width="13"
            height="9"
            rx="1.6"
            stroke="currentColor"
            strokeWidth="1.4"
          />
          <path
            d="M2 5.2 Q 5 8 8 7 T 14 6.4"
            stroke="currentColor"
            strokeWidth="1.4"
            fill="none"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {!compact && <span>Newsletter</span>}
      {compact && <span>News</span>}
      <span
        style={{
          marginLeft: 2,
          padding: "1px 7px",
          borderRadius: 999,
          background: N.coral,
          color: "#fff",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.04em",
        }}
      >
        NOVO
      </span>
    </button>
  );
});

function FieldLabel({
  children,
  hint,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        marginBottom: 8,
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          color: N.inkSoft,
          fontWeight: 600,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        {children}
      </span>
      {hint && <span style={{ fontSize: 11.5, color: N.inkSoft }}>{hint}</span>}
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: Channel;
  onChange: (v: Channel) => void;
  options: Array<{ value: Channel; label: string; icon: React.ReactNode }>;
}) {
  return (
    <div
      style={{
        display: "flex",
        padding: 3,
        background: N.bg,
        borderRadius: 999,
        boxShadow: `inset 0 0 0 1px ${N.rule}`,
      }}
    >
      {options.map((o) => {
        const sel = value === o.value;
        return (
          <button
            type="button"
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1,
              padding: "9px 10px",
              border: "none",
              cursor: "pointer",
              borderRadius: 999,
              fontFamily: N.sans,
              fontWeight: 600,
              fontSize: 13,
              background: sel ? N.deep : "transparent",
              color: sel ? "#fff" : N.inkDim,
              boxShadow: sel ? `0 4px 12px rgba(10,58,68,0.18)` : "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 7,
              transition: "background 120ms ease",
            }}
          >
            <span style={{ display: "inline-flex" }}>{o.icon}</span>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FreqCard({
  selected,
  onClick,
  title,
  sub,
  star,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  star?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        textAlign: "left",
        border: "none",
        cursor: "pointer",
        padding: "12px 14px",
        borderRadius: 14,
        background: selected ? N.deep : N.bg,
        color: selected ? "#fff" : N.ink,
        boxShadow: selected
          ? `0 6px 14px rgba(10,58,68,0.20)`
          : `inset 0 0 0 1px ${N.rule}`,
        fontFamily: N.sans,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
        <b
          style={{
            fontFamily: N.display,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            color: selected ? "#fff" : N.deep,
          }}
        >
          {title}
        </b>
        {star && (
          <span style={{ color: selected ? N.sun : N.coral, fontSize: 12 }}>★</span>
        )}
      </div>
      <span style={{ fontSize: 11.5, color: selected ? "rgba(255,255,255,0.7)" : N.inkDim }}>
        {sub}
      </span>
    </button>
  );
}

function WeekdayPicker({
  weekday,
  setWeekday,
}: {
  weekday: number;
  setWeekday: (n: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 10,
        padding: "10px 10px 12px",
        background: N.panel,
        borderRadius: 12,
        boxShadow: `inset 0 0 0 1px ${N.rule}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
          padding: "0 2px",
        }}
      >
        <span
          style={{
            fontSize: 10,
            color: N.inkSoft,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Dia da semana
        </span>
        <span style={{ fontSize: 11, color: N.inkDim, whiteSpace: "nowrap" }}>
          às <b style={{ color: N.deep }}>17h</b>
        </span>
      </div>
      <div style={{ display: "flex", gap: 4 }}>
        {WEEKDAYS.map((d) => {
          const sel = weekday === d.v;
          return (
            <button
              type="button"
              key={d.v}
              onClick={() => setWeekday(d.v)}
              style={{
                flex: 1,
                padding: "9px 0",
                border: "none",
                cursor: "pointer",
                borderRadius: 10,
                fontFamily: N.sans,
                fontSize: 12,
                fontWeight: 600,
                background: sel ? N.deep : N.surface,
                color: sel ? "#fff" : N.inkDim,
                boxShadow: sel
                  ? `0 4px 10px rgba(10,58,68,0.18)`
                  : `inset 0 0 0 1px ${N.rule}`,
                letterSpacing: "0.02em",
              }}
            >
              {d.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChannelInput({ channel }: { channel: Channel }) {
  return (
    <div
      style={{
        marginTop: 8,
        display: "flex",
        alignItems: "center",
        background: N.bg,
        borderRadius: 12,
        padding: "2px 4px 2px 12px",
        boxShadow: `inset 0 0 0 1px ${N.rule}`,
      }}
    >
      {channel === "whatsapp" ? (
        <span
          style={{
            fontSize: 13.5,
            color: N.inkDim,
            fontWeight: 600,
            paddingRight: 10,
            marginRight: 10,
            borderRight: `1px solid ${N.rule}`,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span aria-hidden>🇧🇷</span> +55
        </span>
      ) : (
        <span style={{ color: N.teal, display: "inline-flex", marginRight: 8 }}>
          <Mail size={14} />
        </span>
      )}
      <span style={{ flex: 1, fontSize: 14, color: N.ink, padding: "10px 0" }}>
        {channel === "email" ? "voce@email.com" : "(11) 9 ____-____"}
      </span>
      <span
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          background: `${N.green}22`,
          color: N.green,
          fontSize: 11,
          fontWeight: 700,
          marginRight: 6,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        prévia
      </span>
    </div>
  );
}

function SpotRow({
  spot,
  selected,
  disabled,
  onClick,
}: {
  spot: Spot;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        textAlign: "left",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "11px 12px",
        borderRadius: 12,
        background: selected ? N.deep : N.bg,
        color: selected ? "#fff" : disabled ? N.inkSoft : N.ink,
        opacity: disabled ? 0.55 : 1,
        boxShadow: selected
          ? `0 4px 10px rgba(10,58,68,0.16)`
          : `inset 0 0 0 1px ${N.rule}`,
        display: "flex",
        alignItems: "center",
        gap: 11,
        fontFamily: N.sans,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: 5,
          border: selected ? "1.5px solid #fff" : `1.5px solid ${N.inkSoft}`,
          background: selected ? "#fff" : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: N.deep,
          flex: "0 0 auto",
        }}
      >
        {selected && <Check size={11} strokeWidth={3} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 600,
            color: selected ? "#fff" : N.ink,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {spot.name}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: selected ? "rgba(255,255,255,0.65)" : N.inkSoft,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {spot.region}
        </div>
      </div>
    </button>
  );
}

function PicosSection({
  pickedSpots,
  otherSpots,
  picked,
  togglePick,
  query,
  setQuery,
}: {
  pickedSpots: Spot[];
  otherSpots: Spot[];
  picked: string[];
  togglePick: (slug: string) => void;
  query: string;
  setQuery: (q: string) => void;
}) {
  const isFull = picked.length >= MAX_PICKS;
  return (
    <div>
      <FieldLabel
        hint={
          <span>
            <b style={{ color: isFull ? N.coral : N.deep }}>{picked.length}</b>/
            {MAX_PICKS} picos
          </span>
        }
      >
        Quais picos rastrear
      </FieldLabel>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: N.bg,
          borderRadius: 12,
          padding: "9px 12px",
          boxShadow: `inset 0 0 0 1px ${N.rule}`,
          marginBottom: 8,
        }}
      >
        <span style={{ color: N.teal, display: "inline-flex" }}>
          <Search size={14} />
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="buscar pico, cidade…"
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            background: "transparent",
            font: "inherit",
            fontSize: 13.5,
            color: N.ink,
            minWidth: 0,
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="limpar"
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: N.inkSoft,
              padding: 0,
              lineHeight: 1,
              display: "inline-flex",
            }}
          >
            <X size={13} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {pickedSpots.map((s) => (
          <SpotRow
            key={s.slug}
            spot={s}
            selected
            onClick={() => togglePick(s.slug)}
          />
        ))}
        {pickedSpots.length > 0 && otherSpots.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "2px 2px",
              fontSize: 10,
              color: N.inkSoft,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ flex: 1, height: 1, background: N.rule, opacity: 0.7 }} />
            <span>outros · {otherSpots.length}</span>
            <span style={{ flex: 1, height: 1, background: N.rule, opacity: 0.7 }} />
          </div>
        )}
        {otherSpots.map((s) => (
          <SpotRow
            key={s.slug}
            spot={s}
            selected={false}
            disabled={isFull}
            onClick={() => !isFull && togglePick(s.slug)}
          />
        ))}
        {otherSpots.length === 0 && query.trim() && (
          <div
            style={{
              padding: "14px 12px",
              textAlign: "center",
              fontSize: 12.5,
              color: N.inkSoft,
              background: N.bg,
              borderRadius: 10,
              boxShadow: `inset 0 0 0 1px ${N.rule}`,
            }}
          >
            Nenhum pico bate com <b style={{ color: N.deep }}>“{query}”</b>.
          </div>
        )}
      </div>
    </div>
  );
}

function HorizonHeader({
  width,
  height = 128,
  showClose,
  showDragHandle,
  onClose,
}: {
  width: number;
  height?: number;
  showClose?: boolean;
  showDragHandle?: boolean;
  onClose?: () => void;
}) {
  const reflectionId = useId();
  return (
    <div style={{ position: "relative", height, overflow: "hidden", flex: "0 0 auto" }}>
      {showDragHandle && (
        <div
          style={{
            position: "absolute",
            top: 8,
            left: "50%",
            marginLeft: -18,
            width: 36,
            height: 4,
            borderRadius: 999,
            background: "rgba(255,255,255,0.55)",
            zIndex: 3,
          }}
        />
      )}
      {/* Sky — clips the sun at the horizon */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "64%",
          overflow: "hidden",
          background: `linear-gradient(180deg, #f6c98a 0%, ${N.sun} 70%, #e88e58 100%)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: -14,
            width: 60,
            height: 60,
            marginLeft: -30,
            borderRadius: "50%",
            background: "#fff1d8",
            boxShadow: "0 0 36px 6px #ffd99a, 0 0 60px 20px #ffd99a55",
          }}
        />
      </div>
      {/* Sea */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: "64%",
          bottom: 0,
          background: `linear-gradient(180deg, ${N.teal} 0%, ${N.deep} 100%)`,
        }}
      />
      {/* Reflection */}
      <div
        aria-hidden
        data-reflection={reflectionId}
        style={{
          position: "absolute",
          left: "50%",
          top: "62%",
          width: 90,
          height: 24,
          marginLeft: -45,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at center, #ffe6b855 0%, transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* Waves */}
      <svg
        viewBox="0 0 420 46"
        width={width}
        height={46}
        preserveAspectRatio="none"
        style={{ position: "absolute", bottom: 0, left: 0, width: "100%" }}
      >
        <path
          d="M0 16 Q 30 6 60 16 T 120 16 T 180 16 T 240 16 T 300 16 T 360 16 T 420 16 L 420 46 L 0 46 Z"
          fill={N.teal2}
          fillOpacity="0.6"
        />
        <path
          d="M0 28 Q 30 18 60 28 T 120 28 T 180 28 T 240 28 T 300 28 T 360 28 T 420 28 L 420 46 L 0 46 Z"
          fill={N.foam}
          fillOpacity="0.45"
        />
        <path
          d="M0 38 Q 30 30 60 38 T 120 38 T 180 38 T 240 38 T 300 38 T 360 38 T 420 38 L 420 46 L 0 46 Z"
          fill="#fff"
          fillOpacity="0.55"
        />
      </svg>
      {/* tag */}
      <div
        style={{
          position: "absolute",
          top: showDragHandle ? 24 : 12,
          left: 14,
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#fff",
          textShadow: "0 1px 2px rgba(0,0,0,0.22)",
        }}
      >
        partiu · newsletter
      </div>
      {showClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="fechar"
          style={{
            position: "absolute",
            top: showDragHandle ? 22 : 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: "rgba(255,255,255,0.88)",
            color: N.deep,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function CTAButton({
  full,
  onSubmit,
}: {
  full?: boolean;
  onSubmit?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSubmit}
      style={{
        width: full ? "100%" : "auto",
        padding: full ? "15px 20px" : "12px 20px",
        border: "none",
        borderRadius: 999,
        background: N.coral,
        color: "#fff",
        fontWeight: 700,
        fontSize: full ? 15.5 : 14,
        fontFamily: N.sans,
        cursor: "pointer",
        boxShadow: `0 8px 20px rgba(226,106,74,0.32)`,
        letterSpacing: "-0.005em",
      }}
    >
      Quero receber
    </button>
  );
}

// ── Desktop popover ──────────────────────────────────────────────────────────

const POPOVER_WIDTH = 420;

type AnchorRect = {
  left: number;
  right: number;
  bottom: number;
  width: number;
};

function usePopoverPosition(anchorRef: React.RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setRect({ left: r.left, right: r.right, bottom: r.bottom, width: r.width });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [anchorRef]);

  return rect;
}

export function NewsletterPopover({
  initialPicks = [],
  anchorRef,
  onClose,
}: {
  initialPicks?: string[];
  /** The trigger element — popover anchors below it via fixed positioning. */
  anchorRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const {
    channel,
    setChannel,
    freq,
    setFreq,
    weekday,
    setWeekday,
    picked,
    togglePick,
    query,
    setQuery,
    pickedSpots,
    otherSpots,
  } = useNewsletterForm(initialPicks);

  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRect = usePopoverPosition(anchorRef);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Defer one tick so the click that *opened* the popover doesn't immediately
    // close it via this listener.
    const id = window.setTimeout(() => {
      document.addEventListener("mousedown", onDocClick);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  if (!mounted || !anchorRect) return null;

  const weeklyLabel = WEEKDAYS[weekday].long;

  // Anchor the popover's right edge to the trigger's right edge when there's
  // room; otherwise clamp to viewport (16px gutter). Caret tracks the trigger's
  // horizontal center.
  const vw = window.innerWidth;
  const popWidth = Math.min(POPOVER_WIDTH, vw - 32);
  const triggerCenterX = anchorRect.left + anchorRect.width / 2;
  const preferredLeft = anchorRect.right - popWidth;
  const left = Math.max(16, Math.min(vw - 16 - popWidth, preferredLeft));
  const top = anchorRect.bottom + 10;
  const caretFromLeft = Math.max(
    16,
    Math.min(popWidth - 28, triggerCenterX - left - 11),
  );

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-label="Inscrever-se na newsletter"
      data-testid="newsletter-popover"
      style={{
        position: "fixed",
        top,
        left,
        width: popWidth,
        background: N.surface,
        borderRadius: 22,
        boxShadow: `0 1px 0 ${N.rule}, 0 24px 60px rgba(10,58,68,0.18)`,
        fontFamily: N.sans,
        color: N.ink,
        overflow: "hidden",
        zIndex: 60,
      }}
    >
      <svg
        width="22"
        height="10"
        viewBox="0 0 22 10"
        aria-hidden
        style={{
          position: "absolute",
          top: -9,
          left: caretFromLeft,
          filter: "drop-shadow(0 -1px 0 rgba(10,58,68,0.04))",
        }}
      >
        <path d="M0 10 L11 0 L22 10 Z" fill="#f6c98a" />
      </svg>

      <HorizonHeader width={POPOVER_WIDTH} showClose onClose={onClose} />

      {/* Title */}
      <div style={{ padding: "14px 22px 6px" }}>
        <h3
          style={{
            margin: 0,
            fontFamily: N.display,
            fontSize: 24,
            lineHeight: 1.05,
            color: N.deep,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          O mar avisa.
          <br />
          <span style={{ color: N.coral }}>A gente repassa.</span>
        </h3>
        <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: N.inkDim }}>
          {freq === "weekly" ? (
            <>
              Resumo dos seus picos favoritos toda{" "}
              <b style={{ color: N.deep }}>{weeklyLabel}</b> à tarde — pra você já
              planejar a semana.
            </>
          ) : (
            <>
              Pico do dia, todo dia às <b style={{ color: N.deep }}>06h</b> — direto
              no celular, antes do café.
            </>
          )}
        </p>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "14px 22px 0",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <FieldLabel>Frequência</FieldLabel>
          <div style={{ display: "flex", gap: 8 }}>
            <FreqCard
              selected={freq === "daily"}
              onClick={() => setFreq("daily")}
              title="Diário"
              sub="06h, todo dia"
            />
            <FreqCard
              selected={freq === "weekly"}
              onClick={() => setFreq("weekly")}
              title="Semanal"
              sub={`${WEEKDAYS[weekday].short.toLowerCase()}, 17h`}
              star
            />
          </div>
          {freq === "weekly" && (
            <WeekdayPicker weekday={weekday} setWeekday={setWeekday} />
          )}
        </div>

        <div>
          <FieldLabel>Canal</FieldLabel>
          <Segmented
            value={channel}
            onChange={setChannel}
            options={[
              { value: "email", label: "E-mail", icon: <Mail size={13} /> },
              {
                value: "whatsapp",
                label: "WhatsApp",
                icon: <MessageCircle size={13} />,
              },
            ]}
          />
          <ChannelInput channel={channel} />
        </div>

        <PicosSection
          pickedSpots={pickedSpots}
          otherSpots={otherSpots}
          picked={picked}
          togglePick={togglePick}
          query={query}
          setQuery={setQuery}
        />
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: 16,
          padding: "14px 22px 18px",
          background: N.panel,
          borderTop: `1px solid ${N.rule}`,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span style={{ flex: 1, fontSize: 11.5, color: N.inkDim, lineHeight: 1.4 }}>
          Sem spam.{" "}
          <span style={{ color: N.inkSoft }}>Cancele com 1 clique.</span>
        </span>
        <CTAButton />
      </div>
    </div>,
    document.body,
  );
}

// ── Mobile bottom sheet ──────────────────────────────────────────────────────

export function NewsletterSheet({
  initialPicks = [],
  onClose,
}: {
  initialPicks?: string[];
  onClose: () => void;
}) {
  const {
    channel,
    setChannel,
    freq,
    setFreq,
    weekday,
    setWeekday,
    picked,
    togglePick,
    query,
    setQuery,
    pickedSpots,
    otherSpots,
  } = useNewsletterForm(initialPicks);

  // Lock background scroll while the sheet is open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const weeklyLabel = WEEKDAYS[weekday].long;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inscrever-se na newsletter"
      data-testid="newsletter-sheet"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* backdrop */}
      <button
        type="button"
        aria-label="fechar"
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(10,42,50,0.45)",
          border: "none",
          padding: 0,
          cursor: "default",
        }}
      />

      {/* sheet */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: "92%",
          background: N.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          boxShadow: "0 -16px 50px rgba(10,58,68,0.22)",
          display: "flex",
          flexDirection: "column",
          fontFamily: N.sans,
          color: N.ink,
          overflow: "hidden",
        }}
      >
        <HorizonHeader
          width={420}
          height={118}
          showDragHandle
          showClose
          onClose={onClose}
        />

        {/* Title */}
        <div style={{ padding: "14px 20px 4px", flex: "0 0 auto" }}>
          <h3
            style={{
              margin: 0,
              fontFamily: N.display,
              fontSize: 24,
              lineHeight: 1.05,
              color: N.deep,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            O mar avisa.
            <br />
            <span style={{ color: N.coral }}>A gente repassa.</span>
          </h3>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: N.inkDim }}>
            {freq === "weekly" ? (
              <>
                Resumo dos seus picos toda{" "}
                <b style={{ color: N.deep }}>{weeklyLabel}</b> à tarde — pra você já
                planejar a semana.
              </>
            ) : (
              <>
                Pico do dia, todo dia às <b style={{ color: N.deep }}>06h</b> —
                antes do café.
              </>
            )}
          </p>
        </div>

        {/* Body (scrolls) */}
        <div
          style={{
            flex: "1 1 auto",
            overflowY: "auto",
            overscrollBehavior: "contain",
            WebkitOverflowScrolling: "touch",
            padding: "12px 20px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 18,
          }}
        >
          <div>
            <FieldLabel>Frequência</FieldLabel>
            <div style={{ display: "flex", gap: 8 }}>
              <FreqCard
                selected={freq === "daily"}
                onClick={() => setFreq("daily")}
                title="Diário"
                sub="06h, todo dia"
              />
              <FreqCard
                selected={freq === "weekly"}
                onClick={() => setFreq("weekly")}
                title="Semanal"
                sub={`${WEEKDAYS[weekday].short.toLowerCase()}, 17h`}
                star
              />
            </div>
            {freq === "weekly" && (
              <WeekdayPicker weekday={weekday} setWeekday={setWeekday} />
            )}
          </div>

          <div>
            <FieldLabel>Canal</FieldLabel>
            <Segmented
              value={channel}
              onChange={setChannel}
              options={[
                { value: "email", label: "E-mail", icon: <Mail size={13} /> },
                {
                  value: "whatsapp",
                  label: "WhatsApp",
                  icon: <Phone size={13} />,
                },
              ]}
            />
            <ChannelInput channel={channel} />
          </div>

          <PicosSection
            pickedSpots={pickedSpots}
            otherSpots={otherSpots}
            picked={picked}
            togglePick={togglePick}
            query={query}
            setQuery={setQuery}
          />
        </div>

        {/* Sticky footer */}
        <div
          style={{
            flex: "0 0 auto",
            padding: "12px 20px calc(22px + env(safe-area-inset-bottom))",
            background: N.panel,
            borderTop: `1px solid ${N.rule}`,
            boxShadow: "0 -6px 20px rgba(10,58,68,0.06)",
          }}
        >
          <CTAButton full />
          <div
            style={{
              marginTop: 10,
              textAlign: "center",
              fontSize: 11.5,
              color: N.inkDim,
            }}
          >
            Sem spam.{" "}
            <span style={{ color: N.inkSoft }}>Cancele com 1 clique.</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
