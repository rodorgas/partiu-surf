"use client";
// Desktop UI — "Coastal Warm" direction (final pick from the design handoff).
// Sand + ocean, soft curves, friendly. Space Grotesk + Bricolage Grotesque.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Calendar,
  ChevronDown,
  ChevronUp,
  Circle,
  CircleDot,
  LayoutGrid,
  MapPin,
  Search,
  Send,
  Sparkles,
  Thermometer,
  TriangleAlert,
  Waves,
  Wind,
  X,
} from "lucide-react";
import type { Forecast } from "@/lib/data";
import { breakTypeLabel, dirLabel } from "@/lib/data";
import { useChat } from "@/lib/useChat";
import { Markdown } from "@/components/Markdown";
import { ScoreMethodology } from "@/components/ScoreMethodology";
import { SPOTS, STATE_NAMES, STATE_ORDER, type Spot, type StateUF } from "@/lib/spots";
import { buildSpotUrl, FORECAST_DAY_COUNT, type GearKey } from "@/lib/forecast-shared";
import { dateKicker, formatDateLong, forecastDates, todayISO } from "@/lib/date";

function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function filterSpots(query: string): Spot[] {
  const q = normalizeText(query.trim());
  if (!q) return Object.values(SPOTS);
  return Object.values(SPOTS).filter(
    (s) =>
      normalizeText(s.name).includes(q) ||
      normalizeText(s.region).includes(q) ||
      s.state.toLowerCase().includes(q),
  );
}

function groupByState(spots: Spot[]): Array<[StateUF, Spot[]]> {
  const buckets = new Map<StateUF, Spot[]>();
  for (const s of spots) {
    const bucket = buckets.get(s.state);
    if (bucket) bucket.push(s);
    else buckets.set(s.state, [s]);
  }
  return STATE_ORDER
    .filter((uf) => buckets.has(uf))
    .map((uf) => [uf, buckets.get(uf)!] as [StateUF, Spot[]]);
}

function countByState(): Record<StateUF, number> {
  const counts = {} as Record<StateUF, number>;
  for (const uf of STATE_ORDER) counts[uf] = 0;
  for (const s of Object.values(SPOTS)) counts[s.state] += 1;
  return counts;
}

const GEAR_LABELS: Record<GearKey, string> = {
  auto: "Auto",
  bodyboard: "Bodyboard",
  longboard: "Longboard",
  funboard: "Funboard",
  shortboard: "Shortboard",
};
const GEAR_ORDER: GearKey[] = [
  "auto",
  "bodyboard",
  "longboard",
  "funboard",
  "shortboard",
];

const C = {
  bg:       "#f5e8d2",
  surface:  "#fff8e9",
  panel:    "#fbecd1",
  deep:     "#0a3a44",
  teal:     "#147184",
  teal2:    "#1d8d9f",
  sand:     "#e9c585",
  sun:      "#f29c50",
  coral:    "#e26a4a",
  foam:     "#cde9e3",
  ink:      "#1d2a30",
  inkDim:   "#557078",
  inkSoft:  "#8a9ea3",
  rule:     "#e1cfa6",
  green:    "#1f8a5b",
  amber:    "#d97a1a",
  red:      "#c0392b",
  sans:     "var(--font-sans), ui-sans-serif, system-ui, sans-serif",
  display:  "var(--font-display), var(--font-sans), ui-sans-serif, system-ui, sans-serif",
} as const;

const scoreInk = (s: number): string =>
  s >= 7 ? C.green : s >= 4 ? C.amber : C.red;

function ChatBubble({
  role,
  children,
  tone,
}: {
  role: "user" | "assistant" | "error";
  children: React.ReactNode;
  tone?: "amber" | "red";
}) {
  if (role === "user") {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            maxWidth: "82%",
            padding: "10px 12px",
            borderRadius: 14,
            borderTopRightRadius: 4,
            background: C.deep,
            color: "#fff",
            fontSize: 13.5,
            lineHeight: 1.45,
            fontWeight: 500,
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  if (role === "error") {
    const bg = tone === "amber" ? `${C.amber}22` : `${C.red}1a`;
    const fg = tone === "amber" ? C.amber : C.red;
    return (
      <div
        style={{
          maxWidth: "92%",
          padding: "10px 12px",
          borderRadius: 14,
          background: bg,
          color: fg,
          fontSize: 13,
          lineHeight: 1.45,
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 14,
        borderTopLeftRadius: 4,
        padding: "10px 14px",
        boxShadow: `0 1px 0 ${C.rule}`,
        maxWidth: "92%",
        fontSize: 13.5,
        lineHeight: 1.55,
        color: C.ink,
      }}
    >
      {children}
    </div>
  );
}

function TypingDots() {
  return (
    <span
      aria-label="copiloto digitando"
      data-testid="chat-typing"
      style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }}
    >
      {[0, 0.15, 0.3].map((d, i) => (
        <span
          key={i}
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: C.inkSoft,
            animation: `bouncedot 1s ${d}s infinite`,
          }}
        />
      ))}
    </span>
  );
}

function ChatPanel({ data, spot }: { data: Forecast; spot: string }) {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { history, streaming, status, error, send, dismissError } = useChat(spot);

  const sendingDisabled = status === "waiting" || status === "streaming";

  const submit = async (text: string) => {
    if (sendingDisabled) return;
    setDraft("");
    await send(text);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    void submit(draft);
  };

  const onSuggestionClick = (s: string) => {
    if (sendingDisabled) return;
    setDraft(s);
    void submit(s);
  };

  const showSuggestions = history.length === 0;

  return (
    <aside
      style={{
        width: 360,
        flex: "0 0 360px",
        height: "100%",
        background: C.panel,
        display: "flex",
        flexDirection: "column",
        fontFamily: C.sans,
        color: C.ink,
        boxShadow: `inset -1px 0 0 ${C.rule}`,
      }}
    >
      <div style={{ padding: "22px 26px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
          <circle cx="17" cy="17" r="16" fill={C.sun} />
          <path
            d="M2 22 Q 9 15 17 22 T 32 22"
            stroke={C.deep}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M2 26 Q 9 19 17 26 T 32 26"
            stroke={C.deep}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            opacity="0.5"
          />
        </svg>
        <div>
          <div
            style={{
              fontFamily: C.display,
              fontSize: 22,
              lineHeight: 1,
              color: C.deep,
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            partiu<span style={{ color: C.coral }}>.</span>surf
          </div>
          <div style={{ fontSize: 11, color: C.inkDim, marginTop: 2 }}>copiloto · pt-BR</div>
        </div>
      </div>

      <div style={{ padding: "4px 26px 12px" }}>
        <div
          style={{
            background: C.surface,
            borderRadius: 18,
            borderTopLeftRadius: 6,
            padding: "14px 16px",
            boxShadow: `0 1px 0 ${C.rule}`,
            position: "relative",
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.inkSoft,
              marginBottom: 6,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            partiu · agora
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: C.ink }}>
            <span style={{ fontFamily: C.display, fontSize: 16, color: C.deep }}>Bom dia! 🏄‍♀️</span>
            <br />
            Eu olho swell, vento e maré, comparo com seu nível e te falo se tá bom pra remar.
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 13, lineHeight: 1.5, color: C.inkDim }}>
            Pergunta sobre o pico — eu olho a previsão antes de responder.
          </p>
        </div>
      </div>

      <div
        data-testid="chat-history"
        style={{
          padding: "4px 18px",
          flex: "1 1 auto",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {history.map((turn, i) => (
          <ChatBubble key={i} role={turn.role}>
            {turn.role === "assistant" ? (
              <Markdown>{turn.content}</Markdown>
            ) : (
              turn.content
            )}
          </ChatBubble>
        ))}

        {status === "waiting" && (
          <ChatBubble role="assistant">
            <TypingDots />
          </ChatBubble>
        )}

        {status === "streaming" && streaming && (
          <ChatBubble role="assistant">
            <div data-testid="chat-streaming">
              <Markdown>{streaming}</Markdown>
            </div>
          </ChatBubble>
        )}

        {error && (
          <ChatBubble
            role="error"
            tone={error.kind === "rate_limit" ? "amber" : "red"}
          >
            <div data-testid={`chat-error-${error.kind}`}>{error.message}</div>
            {error.kind === "network" && (
              <button
                type="button"
                onClick={dismissError}
                style={{
                  marginTop: 6,
                  border: "none",
                  background: "transparent",
                  color: C.red,
                  fontWeight: 600,
                  fontSize: 12.5,
                  cursor: "pointer",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                tente de novo
              </button>
            )}
          </ChatBubble>
        )}

        {showSuggestions && (
          <>
            <div
              style={{
                fontSize: 11,
                color: C.inkSoft,
                padding: "6px 8px 8px",
                letterSpacing: "0.04em",
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Sparkles size={12} /> tente perguntar
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {data.suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => onSuggestionClick(s)}
                  disabled={sendingDisabled}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    border: "none",
                    borderRadius: 14,
                    background: i === 0 ? C.deep : C.surface,
                    color: i === 0 ? "#fff" : C.ink,
                    fontFamily: C.sans,
                    fontSize: 13.5,
                    cursor: sendingDisabled ? "default" : "pointer",
                    opacity: sendingDisabled ? 0.6 : 1,
                    boxShadow:
                      i === 0
                        ? `0 4px 14px rgba(10,58,68,0.18)`
                        : `0 1px 0 ${C.rule}`,
                    lineHeight: 1.4,
                  }}
                >
                  {i === 0 && (
                    <Sparkles
                      size={12}
                      style={{ marginRight: 8, verticalAlign: "-2px" }}
                    />
                  )}
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <form onSubmit={onSubmit} style={{ padding: "14px 18px 22px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: C.surface,
            borderRadius: 999,
            padding: "6px 6px 6px 16px",
            boxShadow: `0 1px 0 ${C.rule}, 0 4px 14px rgba(10,58,68,0.05)`,
          }}
        >
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="pergunta sobre a previsão…"
            disabled={sendingDisabled}
            style={{
              flex: 1,
              fontSize: 14,
              color: C.ink,
              background: "transparent",
              border: "none",
              outline: "none",
              padding: "8px 0",
            }}
          />
          <button
            type="submit"
            aria-label="enviar"
            disabled={sendingDisabled || !draft.trim()}
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: C.coral,
              color: "#fff",
              border: "none",
              cursor: sendingDisabled ? "default" : "pointer",
              opacity: sendingDisabled || !draft.trim() ? 0.5 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </form>
    </aside>
  );
}

function GearPicker({
  spot,
  gear,
  date,
  today,
}: {
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const label = GEAR_LABELS[gear];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="gear-picker-toggle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: C.surface,
          borderRadius: 999,
          padding: "10px 16px",
          boxShadow: `0 1px 0 ${C.rule}`,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <LayoutGrid size={14} color={C.teal} />
        <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
          {label}
        </span>
        <span style={{ display: "inline-flex", color: C.inkSoft, marginLeft: 2 }}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          data-testid="gear-picker-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 180,
            background: C.surface,
            borderRadius: 14,
            boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
            padding: 6,
            listStyle: "none",
            margin: 0,
            zIndex: 5,
          }}
        >
          {GEAR_ORDER.map((g) => {
            const isCurrent = g === gear;
            return (
              <li key={g}>
                <Link
                  href={buildSpotUrl(spot, { gear: g, date, today })}
                  scroll={false}
                  style={{
                    display: "block",
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: isCurrent ? C.foam : "transparent",
                    color: C.ink,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: isCurrent ? 600 : 500,
                  }}
                >
                  {GEAR_LABELS[g]}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SpotPickerItem({
  spot,
  current,
  href,
}: {
  spot: Spot;
  current: string;
  href: string;
}) {
  const isCurrent = spot.slug === current;
  return (
    <li>
      <Link
        href={href}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 12px",
          borderRadius: 12,
          background: isCurrent ? C.foam : "transparent",
          color: C.ink,
          textDecoration: "none",
          fontSize: 14,
          fontWeight: isCurrent ? 600 : 500,
        }}
      >
        <MapPin size={14} color={C.teal} />
        <span>{spot.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: C.inkSoft }}>
          {spot.region}
        </span>
      </Link>
    </li>
  );
}

type Region = StateUF | "all";

function RegionButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        width: "100%",
        padding: "8px 10px",
        borderRadius: 10,
        background: active ? C.foam : "transparent",
        color: active ? C.deep : C.ink,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        textAlign: "left",
        marginBottom: 2,
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {children}
      </span>
      <span
        style={{
          fontSize: 11,
          color: active ? C.deep : C.inkSoft,
          fontWeight: 600,
          background: active ? "transparent" : C.bg,
          padding: "1px 6px",
          borderRadius: 999,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function SpotPicker({
  spot,
  gear,
  date,
  today,
}: {
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [region, setRegion] = useState<Region>("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const current = SPOTS[spot] ?? SPOTS.itamambuca;
  const totalCount = Object.keys(SPOTS).length;
  const counts = countByState();

  const filtered = filterSpots(query).filter(
    (s) => region === "all" || s.state === region,
  );
  const grouped = groupByState(filtered);
  const isSearching = query.trim().length > 0;
  const showGroups = region === "all" && !isSearching;

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setRegion("all");
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
        setRegion("all");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Picker resets to its initial closed state when the route's spot changes —
  // the parent (TopBar) renders <SpotPicker key={spot} /> to force a remount.
  // Closing inside the Link's onClick races with Next.js navigation, so we
  // can't rely on that path to reset state.

  const toggle = () => {
    if (open) {
      setOpen(false);
      setQuery("");
      setRegion("all");
    } else {
      setOpen(true);
    }
  };

  return (
    <div ref={rootRef} style={{ flex: "1 1 280px", position: "relative", minWidth: 0 }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="spot-picker-toggle"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: C.surface,
          borderRadius: 999,
          padding: "10px 16px",
          boxShadow: `0 1px 0 ${C.rule}`,
          minWidth: 0,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          textAlign: "left",
        }}
      >
        <Search size={14} color={C.teal} />
        <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>{current.name}</span>
        <span style={{ fontSize: 13, color: C.inkDim }}>· {current.region}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 11,
            color: C.inkSoft,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          {totalCount} picos · BR
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <div
          data-testid="spot-picker-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 560,
            maxWidth: "calc(100vw - 60px)",
            background: C.surface,
            borderRadius: 18,
            boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
            padding: 8,
            maxHeight: 440,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: C.bg,
              borderRadius: 999,
              padding: "8px 14px",
              marginBottom: 6,
            }}
          >
            <Search size={14} color={C.teal} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar pico ou cidade…"
              data-testid="spot-picker-search"
              style={{
                flex: 1,
                fontSize: 13.5,
                color: C.ink,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: "2px 0",
              }}
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="limpar"
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.inkSoft,
                  cursor: "pointer",
                  padding: 0,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "150px 1fr",
              gap: 6,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <aside
              data-testid="spot-picker-regions"
              style={{
                overflow: "auto",
                padding: "2px 4px 2px 0",
                borderRight: `1px solid ${C.rule}`,
              }}
            >
              <RegionButton
                active={region === "all"}
                onClick={() => setRegion("all")}
                count={totalCount}
              >
                Todos
              </RegionButton>
              {STATE_ORDER.map((uf) => (
                <RegionButton
                  key={uf}
                  active={region === uf}
                  onClick={() => setRegion(uf)}
                  count={counts[uf]}
                >
                  {STATE_NAMES[uf]}
                </RegionButton>
              ))}
            </aside>
            <div style={{ overflow: "auto", paddingLeft: 4 }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "16px 12px",
                    fontSize: 13,
                    color: C.inkSoft,
                    textAlign: "center",
                  }}
                >
                  Nenhum pico encontrado.
                </div>
              ) : showGroups ? (
                grouped.map(([uf, spots]) => (
                  <div key={uf}>
                    <div
                      style={{
                        padding: "8px 12px 4px",
                        fontSize: 10.5,
                        color: C.inkSoft,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {STATE_NAMES[uf]} · {uf}
                    </div>
                    <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {spots.map((s) => (
                        <SpotPickerItem
                          key={s.slug}
                          spot={s}
                          current={spot}
                          href={buildSpotUrl(s.slug, { gear, date, today })}
                        />
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {filtered.map((s) => (
                    <SpotPickerItem
                      key={s.slug}
                      spot={s}
                      current={spot}
                      href={buildSpotUrl(s.slug, { gear, date, today })}
                    />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DatePicker({
  spot,
  gear,
  date,
  today,
}: {
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const days = forecastDates(today, FORECAST_DAY_COUNT);
  const kicker = dateKicker(date, today);
  const main = formatDateLong(date);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="date-picker-toggle"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: C.surface,
          borderRadius: 999,
          padding: "10px 16px",
          boxShadow: `0 1px 0 ${C.rule}`,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <Calendar size={14} color={C.coral} />
        {kicker && (
          <span style={{ fontSize: 14, color: C.ink, fontWeight: 600 }}>
            {kicker}
          </span>
        )}
        <span style={{ fontSize: 13, color: C.inkDim }}>{main}</span>
        <span style={{ display: "inline-flex", color: C.inkSoft, marginLeft: 2 }}>
          {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          data-testid="date-picker-menu"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            minWidth: 220,
            background: C.surface,
            borderRadius: 14,
            boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
            padding: 6,
            listStyle: "none",
            margin: 0,
            zIndex: 5,
          }}
        >
          {days.map((iso) => {
            const isCurrent = iso === date;
            const itemKicker = dateKicker(iso, today);
            return (
              <li key={iso}>
                <Link
                  href={buildSpotUrl(spot, { gear, date: iso, today })}
                  scroll={false}
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    padding: "9px 12px",
                    borderRadius: 10,
                    background: isCurrent ? C.foam : "transparent",
                    color: C.ink,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: isCurrent ? 600 : 500,
                  }}
                >
                  {itemKicker && (
                    <span style={{ color: C.deep, fontWeight: 600 }}>
                      {itemKicker}
                    </span>
                  )}
                  <span style={{ color: C.inkDim }}>{formatDateLong(iso)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TopBar({
  spot,
  gear,
  date,
  today,
}: {
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  return (
    <div
      style={{
        padding: "18px 28px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        background: "transparent",
      }}
    >
      <SpotPicker key={spot} spot={spot} gear={gear} date={date} today={today} />
      <DatePicker key={date} spot={spot} gear={gear} date={date} today={today} />
      <GearPicker spot={spot} gear={gear} date={date} today={today} />
    </div>
  );
}

function Pill({ icon, label, v, tone, sub }: { icon: React.ReactNode; label: string; v: string; tone?: string; sub?: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        background: C.bg,
        borderRadius: 999,
        fontSize: 13,
        color: C.ink,
      }}
    >
      <span style={{ display: "inline-flex", color: tone === "green" ? C.green : C.teal }}>{icon}</span>
      <span
        style={{
          color: C.inkDim,
          fontSize: 11.5,
          fontWeight: 500,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <b style={{ color: tone === "green" ? C.green : C.deep }}>{v}</b>
      {sub && <span style={{ color: C.inkSoft, fontSize: 11.5 }}>· {sub}</span>}
    </span>
  );
}

function ScoreWedge({ score }: { score: number }) {
  const w = 220,
    h = 132;
  const cx = w / 2,
    cy = 116,
    r = 86;
  const t = Math.max(0, Math.min(1, score / 10));
  const ang = Math.PI * (1 - t);
  const x2 = cx + r * Math.cos(ang);
  const y2 = cy - r * Math.sin(ang);
  const ink = scoreInk(score);
  const largeArc = 0;
  return (
    <div style={{ flex: "0 0 auto", textAlign: "center" }}>
      <svg viewBox={`0 0 ${w} ${h}`} width="220" height="132">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          stroke={C.foam}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
          stroke={ink}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />
        <text
          x={cx}
          y={cy - 22}
          fontSize="44"
          fill={C.deep}
          textAnchor="middle"
          fontFamily={C.display}
          fontWeight="700"
          letterSpacing="-0.03em"
        >
          {score.toFixed(1)}
        </text>
        <text
          x={cx}
          y={cy - 4}
          fontSize="10.5"
          fill={C.inkSoft}
          textAnchor="middle"
          fontFamily={C.sans}
          fontWeight="600"
          letterSpacing="0.12em"
        >
          /10 · PICO HOJE
        </text>
        <text
          x={cx - r}
          y={cy + 16}
          fontSize="10"
          fill={C.inkSoft}
          textAnchor="middle"
          fontFamily={C.sans}
        >
          0
        </text>
        <text
          x={cx + r}
          y={cy + 16}
          fontSize="10"
          fill={C.inkSoft}
          textAnchor="middle"
          fontFamily={C.sans}
        >
          10
        </text>
      </svg>
      <div
        style={{
          marginTop: 6,
          padding: "4px 10px",
          background: `${C.green}1a`,
          color: C.green,
          fontSize: 11.5,
          fontWeight: 600,
          borderRadius: 999,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Circle size={10} fill={C.green} color={C.green} /> dia bom · 32% acima da média
      </div>
    </div>
  );
}

function Hero({ data }: { data: Forecast }) {
  const now = data.hours[0];
  const facingLabel = dirLabel(data.spot.facing);
  const tideState = now?.tide ?? "subindo";
  const swellSummary = now
    ? `${now.swH.toFixed(1)}m · ${now.swT}s · ${dirLabel(now.swDir)}`
    : "—";
  const windSummary = now
    ? `${now.wKmh} km/h ${dirLabel(now.wDir)}`
    : "—";
  const tideSummary = now ? `${now.tideH.toFixed(1)}m ${now.tide}` : "—";
  const waterSummary = data.spot.waterTemp
    ? `${data.spot.waterTemp.toFixed(1)}°C`
    : "—";

  return (
    <div style={{ padding: "4px 28px 0" }}>
      <div
        style={{
          background: C.surface,
          borderRadius: 24,
          padding: "28px 32px",
          boxShadow: `0 1px 0 ${C.rule}, 0 8px 24px rgba(10,58,68,0.04)`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: `radial-gradient(circle at center, ${C.sun}33 0%, transparent 70%)`,
            pointerEvents: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "flex-start", gap: 24, position: "relative" }}>
          <div style={{ flex: "1 1 auto" }}>
            <div
              style={{
                fontSize: 11.5,
                color: C.teal,
                fontWeight: 600,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                marginBottom: 6,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <MapPin size={12} /> {breakTypeLabel(data.spot.breakType)} · frente para {facingLabel} · maré {tideState}
            </div>
            <h1
              style={{
                margin: 0,
                fontFamily: C.display,
                fontSize: 48,
                lineHeight: 1,
                color: C.deep,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {data.spot.name}
            </h1>
            <p style={{ margin: "12px 0 0", fontSize: 16, lineHeight: 1.5, color: C.inkDim, maxWidth: 520 }}>
              Janela boa — pico em{" "}
              <b style={{ color: C.deep }}>{data.spot.bestWindow}</b> com swell de{" "}
              <b style={{ color: C.deep }}>{swellSummary}</b>. Acompanhe vento e maré hora a hora abaixo.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              <Pill icon={<Waves size={14} />} label="Swell" v={swellSummary} />
              <Pill icon={<Wind size={14} />} label="Vento" v={windSummary} />
              <Pill icon={<Activity size={14} />} label="Maré" v={tideSummary} />
              <Pill icon={<Thermometer size={14} />} label="Água" v={waterSummary} />
            </div>
          </div>

          <ScoreWedge score={data.spot.todayPeak} />
        </div>
      </div>
    </div>
  );
}

function HourTable({ data }: { data: Forecast }) {
  const max = Math.max(...data.hours.map((x) => x.score));
  return (
    <div style={{ padding: "18px 28px 8px" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: C.display,
            fontSize: 24,
            color: C.deep,
            fontWeight: 700,
            letterSpacing: "-0.01em",
          }}
        >
          Hora a hora
        </h2>
        <span style={{ fontSize: 12.5, color: C.inkDim }}>06h–18h · janela diurna</span>
      </div>
      <div
        style={{
          background: C.surface,
          borderRadius: 18,
          overflow: "hidden",
          boxShadow: `0 1px 0 ${C.rule}`,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "62px 130px 80px 56px 86px 100px 70px 110px 40px",
            padding: "10px 18px",
            fontSize: 10.5,
            color: C.inkSoft,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            borderBottom: `1px solid ${C.rule}`,
            gap: 10,
          }}
        >
          <span>Hora</span>
          <span>Score</span>
          <span style={{ textAlign: "right" }}>Onda</span>
          <span style={{ textAlign: "right" }}>Per.</span>
          <span>Dir.</span>
          <span style={{ textAlign: "right" }}>Vento</span>
          <span style={{ textAlign: "right" }}>Rajada</span>
          <span>Maré</span>
          <span style={{ textAlign: "center" }}>·</span>
        </div>
        {data.hours.map((r, i) => {
          const peak = r.score === max;
          const ink = scoreInk(r.score);
          return (
            <div
              key={r.h}
              style={{
                display: "grid",
                gridTemplateColumns: "62px 130px 80px 56px 86px 100px 70px 110px 40px",
                padding: "10px 18px",
                alignItems: "center",
                gap: 10,
                background: peak ? "#fff5e2" : "transparent",
                borderBottom: i < data.hours.length - 1 ? `1px solid ${C.rule}88` : "none",
                fontSize: 14,
                color: C.ink,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <span style={{ fontWeight: peak ? 700 : 500, color: peak ? C.coral : C.ink }}>{r.h}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: ink, fontWeight: 600, width: 24 }}>{r.score.toFixed(1)}</span>
                <span
                  style={{
                    flex: 1,
                    height: 6,
                    background: C.foam,
                    borderRadius: 999,
                    overflow: "hidden",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: `${r.score * 10}%`,
                      height: "100%",
                      background: ink,
                      borderRadius: 999,
                    }}
                  />
                </span>
              </span>
              <span style={{ textAlign: "right" }}>{r.swH.toFixed(1)} m</span>
              <span style={{ textAlign: "right" }}>{r.swT}s</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 14,
                    height: 14,
                    transform: `rotate(${r.swDir + 180}deg)`,
                    color: C.teal,
                  }}
                >
                  <svg viewBox="0 0 14 14" width="14" height="14">
                    <path
                      d="M7 1 L7 12 M7 1 L4 4 M7 1 L10 4"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
                <span style={{ color: C.inkDim }}>{dirLabel(r.swDir)}</span>
              </span>
              <span style={{ textAlign: "right" }}>
                {r.wKmh} <span style={{ color: C.inkSoft, fontSize: 12 }}>km/h</span>
              </span>
              <span style={{ textAlign: "right", color: r.gust > 25 ? C.red : C.inkDim }}>{r.gust}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>{r.tideH.toFixed(1)}m</span>
                <span
                  style={{
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 999,
                    fontWeight: 500,
                    color: r.tide === "alta" ? C.coral : r.tide === "baixa" ? C.amber : C.teal,
                    background:
                      r.tide === "alta" ? "#fce6d6" : r.tide === "baixa" ? "#fbe6c2" : "#d8edf0",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {r.tide === "subindo" ? (
                    <ArrowUp size={11} />
                  ) : r.tide === "descendo" ? (
                    <ArrowDown size={11} />
                  ) : r.tide === "alta" ? (
                    <CircleDot size={11} />
                  ) : (
                    <Circle size={11} />
                  )}
                  {r.tide}
                </span>
              </span>
              <span
                style={{
                  textAlign: "center",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {r.flag === "⚠️" ? (
                  <TriangleAlert size={14} color={C.amber} />
                ) : (
                  <Circle
                    size={12}
                    color={scoreInk(r.score)}
                    fill={scoreInk(r.score)}
                  />
                )}
              </span>
            </div>
          );
        })}
      </div>
      <ScoreMethodology variant="desktop" />
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 20,
        padding: "18px 20px 16px",
        boxShadow: `0 1px 0 ${C.rule}`,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: C.deep,
          fontWeight: 600,
          marginBottom: 14,
          fontFamily: C.display,
          letterSpacing: "-0.005em",
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function SwellRose({ data }: { data: Forecast }) {
  const cx = 85,
    cy = 85,
    r = 68;
  const facing = data.spot.facing;
  const swDeg = data.hours[0]?.swDir ?? facing;
  const a1 = ((facing - 45 - 90) * Math.PI) / 180;
  const a2 = ((facing + 45 - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(a1),
    y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2),
    y2 = cy + r * Math.sin(a2);
  const a = ((swDeg - 90) * Math.PI) / 180;
  const ox = cx + (r - 2) * Math.cos(a),
    oy = cy + (r - 2) * Math.sin(a);
  const ix = cx - 30 * Math.cos(a - Math.PI),
    iy = cy - 30 * Math.sin(a - Math.PI);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg viewBox="0 0 170 170" width="160" height="160">
        <circle cx={cx} cy={cy} r={r} fill={C.foam} />
        <path
          d={`M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`}
          fill={C.sun}
          fillOpacity="0.35"
        />
        <circle cx={cx} cy={cy} r="3.5" fill={C.deep} />
        {([["N", 0], ["L", 90], ["S", 180], ["O", 270]] as const).map(([lbl, d]) => {
          const ang = ((d - 90) * Math.PI) / 180;
          const x = cx + (r + 10) * Math.cos(ang),
            y = cy + (r + 10) * Math.sin(ang) + 4;
          return (
            <text
              key={lbl}
              x={x}
              y={y}
              fontSize="11"
              fill={C.inkDim}
              textAnchor="middle"
              fontFamily={C.sans}
              fontWeight="600"
            >
              {lbl}
            </text>
          );
        })}
        <g>
          <line x1={ox} y1={oy} x2={ix} y2={iy} stroke={C.deep} strokeWidth="2.5" strokeLinecap="round" />
          <polygon
            points={`${ix - 6},${iy - 6} ${ix + 6},${iy} ${ix - 6},${iy + 6}`}
            transform={`rotate(${swDeg - 90} ${ix} ${iy})`}
            fill={C.deep}
          />
        </g>
      </svg>
      <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
        <div
          style={{
            color: C.inkDim,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          swell
        </div>
        <div style={{ color: C.deep, fontWeight: 700, fontSize: 18 }}>
          {Math.round(swDeg)}° {dirLabel(swDeg)}
        </div>
        <div
          style={{
            color: C.inkDim,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            marginTop: 8,
          }}
        >
          orientação do pico
        </div>
        <div style={{ color: C.coral, fontWeight: 700, fontSize: 14 }}>
          {Math.round(facing)}° {dirLabel(facing)}
        </div>
        {(() => {
          const offset = Math.min(
            Math.abs(((swDeg - facing + 540) % 360) - 180),
            180,
          );
          const aligned = offset <= 30;
          return (
            <div
              style={{
                marginTop: 10,
                padding: "5px 10px",
                background: aligned ? `${C.green}22` : `${C.amber}22`,
                color: aligned ? C.green : C.amber,
                borderRadius: 999,
                fontSize: 11.5,
                fontWeight: 600,
                display: "inline-block",
              }}
            >
              offset {Math.round(offset)}° · {aligned ? "alinhado" : "desalinhado"}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function TideArc() {
  const w = 380,
    h = 150,
    pad = 14;
  const pts = Array.from({ length: 48 }, (_, i) => {
    const t = (i / 47) * 24;
    const v = 1.3 + 0.9 * Math.sin(((t - 3) / 12.4) * 2 * Math.PI);
    return [pad + (t / 24) * (w - pad * 2), h - pad - 22 - (v / 2.4) * (h - pad * 2 - 22), v] as const;
  });
  const path = pts.map((p, i) => `${i ? "L" : "M"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const fill = `${path} L ${pts[pts.length - 1][0]} ${h - pad - 22} L ${pts[0][0]} ${h - pad - 22} Z`;
  const nowT = 9;
  const nowI = Math.round((nowT / 24) * 47);
  const lows = [3, 15];
  const highs = [9, 21];
  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="150">
        <defs>
          <linearGradient id="tidegrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={C.teal2} stopOpacity="0.35" />
            <stop offset="100%" stopColor={C.teal2} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path d={fill} fill="url(#tidegrad)" />
        <path d={path} stroke={C.teal} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <g>
          {lows.map((t) => {
            const i = Math.round((t / 24) * 47);
            return (
              <g key={`lo${t}`}>
                <circle cx={pts[i][0]} cy={pts[i][1]} r="3" fill={C.amber} />
                <text
                  x={pts[i][0]}
                  y={pts[i][1] + 18}
                  fontSize="10"
                  fill={C.amber}
                  textAnchor="middle"
                  fontFamily={C.sans}
                  fontWeight="600"
                >{`baixa ${String(t).padStart(2, "0")}:42`}</text>
              </g>
            );
          })}
          {highs.map((t) => {
            const i = Math.round((t / 24) * 47);
            return (
              <g key={`hi${t}`}>
                <circle cx={pts[i][0]} cy={pts[i][1]} r="3" fill={C.coral} />
                <text
                  x={pts[i][0]}
                  y={pts[i][1] - 8}
                  fontSize="10"
                  fill={C.coral}
                  textAnchor="middle"
                  fontFamily={C.sans}
                  fontWeight="600"
                >{`alta ${String(t).padStart(2, "0")}:51`}</text>
              </g>
            );
          })}
        </g>
        <line
          x1={pts[nowI][0]}
          y1={pad}
          x2={pts[nowI][0]}
          y2={h - pad - 22}
          stroke={C.deep}
          strokeDasharray="3 3"
          strokeWidth="1"
        />
        <circle cx={pts[nowI][0]} cy={pts[nowI][1]} r="5" fill={C.deep} />
        <circle cx={pts[nowI][0]} cy={pts[nowI][1]} r="9" fill={C.deep} fillOpacity="0.18" />
        {[0, 6, 12, 18, 23].map((t) => {
          const i = Math.round((t / 24) * 47);
          return (
            <text
              key={t}
              x={pts[i][0]}
              y={h - 4}
              fontSize="10"
              textAnchor="middle"
              fill={C.inkSoft}
              fontFamily={C.sans}
            >{`${String(t).padStart(2, "0")}h`}</text>
          );
        })}
        <text
          x={pts[nowI][0] + 8}
          y={pad + 12}
          fontSize="11"
          fontFamily={C.sans}
          fontWeight="700"
          fill={C.deep}
        >
          agora · 2.0m
        </text>
      </svg>
    </div>
  );
}

function Hist() {
  const rows = [
    { label: "Score", today: 8.9, avg: 6.1, max: 10, unit: "" },
    { label: "Altura", today: 1.7, avg: 1.2, max: 3, unit: "m" },
    { label: "Período", today: 13, avg: 9.5, max: 18, unit: "s" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rows.map((r) => (
        <div key={r.label}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: C.inkDim,
              marginBottom: 5,
            }}
          >
            <span style={{ fontWeight: 500 }}>{r.label}</span>
            <span>
              <b style={{ color: C.coral }}>
                {r.today}
                {r.unit || ""}
              </b>{" "}
              <span style={{ color: C.inkSoft }}>
                vs {r.avg}
                {r.unit || ""} média
              </span>
            </span>
          </div>
          <div style={{ position: "relative", height: 8, background: C.foam, borderRadius: 999 }}>
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                height: "100%",
                width: `${(r.avg / r.max) * 100}%`,
                background: C.teal2,
                opacity: 0.35,
                borderRadius: 999,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 0,
                top: -1,
                height: 10,
                width: `${(r.today / r.max) * 100}%`,
                background: C.coral,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      ))}
      <div
        style={{
          marginTop: 4,
          padding: "10px 14px",
          borderRadius: 14,
          fontSize: 12.5,
          background: `${C.sun}22`,
          color: C.amber,
          lineHeight: 1.5,
        }}
      >
        <b style={{ color: C.coral, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowUp size={12} /> acima da média
        </b>
        <br />
        <span style={{ color: C.inkDim }}>
          32% acima de novembro · top 18% das sessões logadas no pico.
        </span>
      </div>
    </div>
  );
}

function SideCards({ data }: { data: Forecast }) {
  return (
    <div
      style={{
        padding: "14px 28px 32px",
        display: "grid",
        gridTemplateColumns: "1fr 1.1fr 1fr",
        gap: 16,
      }}
    >
      <Card title="Direção do swell">
        <SwellRose data={data} />
      </Card>
      <Card title="Maré · 24h">
        <TideArc />
      </Card>
      <Card title="Comparado à média">
        <Hist />
      </Card>
    </div>
  );
}

export function Desktop({
  data,
  spot,
  gear = "auto",
  date,
  today,
}: {
  data: Forecast;
  spot: string;
  gear?: GearKey;
  date?: string;
  today?: string;
}) {
  const t = today ?? todayISO();
  const d = date ?? t;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: C.bg,
        color: C.ink,
        fontFamily: C.sans,
      }}
    >
      <ChatPanel data={data} spot={spot} />
      <main style={{ flex: "1 1 auto", overflow: "auto" }}>
        <TopBar spot={spot} gear={gear} date={d} today={t} />
        <Hero data={data} />
        <SideCards data={data} />
        <HourTable data={data} />
      </main>
    </div>
  );
}

export default Desktop;
