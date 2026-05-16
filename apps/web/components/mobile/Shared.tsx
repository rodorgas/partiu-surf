"use client";
// Shared mobile primitives — palette + reusable bits used by the mobile shell.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Circle,
  LayoutGrid,
  MapPin,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import type { Forecast, ForecastHour } from "@/lib/data";
import { dirLabel } from "@/lib/data";
import { SPOTS, STATE_NAMES, STATE_ORDER, type Spot, type StateUF } from "@/lib/spots";
import { buildSpotUrl, FORECAST_DAY_COUNT, type GearKey } from "@/lib/forecast-shared";
import { dateKicker, formatDateLong, forecastDates } from "@/lib/date";

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

type Region = StateUF | "all";

const GEAR_LABELS: Record<GearKey, string> = {
  auto: "Auto",
  bodyboard: "BB",
  longboard: "Long",
  funboard: "Fun",
  shortboard: "Short",
};
const GEAR_ORDER: GearKey[] = [
  "auto",
  "bodyboard",
  "longboard",
  "funboard",
  "shortboard",
];

export const C = {
  bg:       "#f5e8d2",
  surface:  "#fff8e9",
  panel:    "#fbecd1",
  deep:     "#0a3a44",
  teal:     "#147184",
  teal2:    "#1d8d9f",
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

export const scoreInk = (s: number): string =>
  s >= 7 ? C.green : s >= 4 ? C.amber : C.red;

function MobileSpotItem({
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
          gap: 8,
          padding: "8px 10px",
          borderRadius: 10,
          background: isCurrent ? C.foam : "transparent",
          color: C.ink,
          textDecoration: "none",
          fontSize: 13,
          fontWeight: isCurrent ? 600 : 500,
        }}
      >
        <MapPin size={13} color={C.teal} />
        <span>{spot.name}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.inkSoft }}>
          {spot.region.split(" · ")[1] ?? spot.region}
        </span>
      </Link>
    </li>
  );
}

function MobileRegionButton({
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        width: "100%",
        padding: "6px 8px",
        borderRadius: 8,
        background: active ? C.foam : "transparent",
        color: active ? C.deep : C.ink,
        border: "none",
        cursor: "pointer",
        fontFamily: "inherit",
        fontSize: 11.5,
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
          fontSize: 10,
          color: active ? C.deep : C.inkSoft,
          fontWeight: 600,
        }}
      >
        {count}
      </span>
    </button>
  );
}

function MobileSpotPicker({
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
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // State resets on route change because <MobileSpotPicker key={spot} /> in
  // AppBar forces a remount when the spot prop changes (see Desktop.tsx for
  // why we can't close inside the Link's onClick).

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
    <div ref={rootRef} style={{ marginLeft: "auto", position: "relative" }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="mobile-spot-picker-toggle"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 10px",
          background: C.surface,
          borderRadius: 999,
          fontSize: 11.5,
          color: C.ink,
          fontWeight: 500,
          boxShadow: `0 1px 0 ${C.rule}`,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <MapPin size={12} color={C.teal} />
        {current.name}
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div
          data-testid="mobile-spot-picker-menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 6px)",
            width: 320,
            maxWidth: "calc(100vw - 24px)",
            background: C.surface,
            borderRadius: 14,
            boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
            padding: 6,
            maxHeight: 380,
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
              gap: 6,
              background: C.bg,
              borderRadius: 999,
              padding: "6px 12px",
              marginBottom: 4,
            }}
          >
            <Search size={13} color={C.teal} />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="buscar pico…"
              data-testid="mobile-spot-picker-search"
              style={{
                flex: 1,
                // 16px to prevent iOS Safari auto-zoom on focus.
                fontSize: 16,
                color: C.ink,
                background: "transparent",
                border: "none",
                outline: "none",
                padding: 0,
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
                <X size={13} />
              </button>
            )}
          </div>
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "96px 1fr",
              gap: 4,
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <aside
              data-testid="mobile-spot-picker-regions"
              style={{
                overflow: "auto",
                padding: "2px 4px 2px 0",
                borderRight: `1px solid ${C.rule}`,
              }}
            >
              <MobileRegionButton
                active={region === "all"}
                onClick={() => setRegion("all")}
                count={totalCount}
              >
                Todos
              </MobileRegionButton>
              {STATE_ORDER.map((uf) => (
                <MobileRegionButton
                  key={uf}
                  active={region === uf}
                  onClick={() => setRegion(uf)}
                  count={counts[uf]}
                >
                  {uf}
                </MobileRegionButton>
              ))}
            </aside>
            <div style={{ overflow: "auto", paddingLeft: 2 }}>
              {filtered.length === 0 ? (
                <div
                  style={{
                    padding: "14px 10px",
                    fontSize: 12.5,
                    color: C.inkSoft,
                    textAlign: "center",
                  }}
                >
                  Nenhum pico.
                </div>
              ) : showGroups ? (
                grouped.map(([uf, spots]) => (
                  <div key={uf}>
                    <div
                      style={{
                        padding: "6px 10px 2px",
                        fontSize: 9.5,
                        color: C.inkSoft,
                        fontWeight: 600,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                      }}
                    >
                      {STATE_NAMES[uf]}
                    </div>
                    <ul role="listbox" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                      {spots.map((s) => (
                        <MobileSpotItem
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
                    <MobileSpotItem
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

export function AppBar({
  tight,
  spot,
  gear = "auto",
  date,
  today,
}: {
  tight?: boolean;
  spot: string;
  gear?: GearKey;
  date: string;
  today: string;
}) {
  return (
    <div
      style={{
        padding: tight ? "4px 16px 8px" : "6px 16px 10px",
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: "transparent",
      }}
    >
      <svg width="26" height="26" viewBox="0 0 34 34" fill="none">
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
      <span
        style={{
          fontFamily: C.display,
          fontSize: 18,
          fontWeight: 700,
          color: C.deep,
          letterSpacing: "-0.02em",
        }}
      >
        partiu<span style={{ color: C.coral }}>.</span>surf
      </span>
      <MobileSpotPicker
        key={spot}
        spot={spot}
        gear={gear}
        date={date}
        today={today}
      />
    </div>
  );
}

export function Wedge({ score = 8.9, size = 88 }: { score?: number; size?: number }) {
  const w = size,
    h = size * 0.7,
    cx = w / 2,
    cy = size * 0.62,
    r = size * 0.4;
  const t = Math.max(0, Math.min(1, score / 10));
  const ang = Math.PI * (1 - t);
  const x2 = cx + r * Math.cos(ang),
    y2 = cy - r * Math.sin(ang);
  const ink = scoreInk(score);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ flex: "0 0 auto" }}>
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={C.foam}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
        stroke={ink}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
      <text
        x={cx}
        y={cy - 8}
        fontSize={size * 0.28}
        fill={C.deep}
        textAnchor="middle"
        fontFamily={C.display}
        fontWeight="700"
        letterSpacing="-0.02em"
      >
        {score.toFixed(1)}
      </text>
      <text
        x={cx}
        y={cy + 5}
        fontSize="8"
        fill={C.inkSoft}
        textAnchor="middle"
        fontFamily={C.sans}
        fontWeight="600"
        letterSpacing="0.1em"
      >
        /10
      </text>
    </svg>
  );
}

export function SummaryCard({
  data,
  compact = false,
}: {
  data: Forecast;
  compact?: boolean;
}) {
  const now = data.hours[0];
  const swellSummary = now
    ? `${now.swH.toFixed(1)}m·${now.swT}s ${dirLabel(now.swDir)}`
    : "—";
  return (
    <div
      style={{
        margin: compact ? "4px 12px" : "0 16px",
        padding: compact ? "12px 14px" : "14px 16px",
        background: C.surface,
        borderRadius: 18,
        boxShadow: `0 1px 0 ${C.rule}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -40,
          right: -40,
          width: 120,
          height: 120,
          borderRadius: "50%",
          background: `radial-gradient(circle at center, ${C.sun}40 0%, transparent 70%)`,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10,
              color: C.teal,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <MapPin size={11} /> {data.spot.breakType} · facing {dirLabel(data.spot.facing)}
          </div>
          <div
            style={{
              fontFamily: C.display,
              fontSize: compact ? 22 : 26,
              color: C.deep,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 3,
              letterSpacing: "-0.02em",
            }}
          >
            {data.spot.name}
          </div>
          <div style={{ fontSize: 12, color: C.inkDim, marginTop: 6, lineHeight: 1.45 }}>
            Pico <b style={{ color: C.deep }}>{data.spot.bestWindow}</b> · {swellSummary}
          </div>
        </div>
        <Wedge score={data.spot.todayPeak} size={compact ? 72 : 88} />
      </div>
    </div>
  );
}

export function HourList({ rows, max = 8 }: { rows: ForecastHour[]; max?: number }) {
  const useRows = rows.slice(0, max);
  const peakMax = Math.max(...useRows.map((x) => x.score));
  return (
    <div
      style={{
        margin: "0 16px",
        background: C.surface,
        borderRadius: 16,
        boxShadow: `0 1px 0 ${C.rule}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 14px",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: C.inkSoft,
          borderBottom: `1px solid ${C.rule}88`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
        }}
      >
        <span>Hora a hora</span>
        <span
          style={{
            color: C.teal,
            letterSpacing: 0,
            textTransform: "none",
            fontWeight: 500,
            fontSize: 11,
          }}
        >
          06h → 18h
        </span>
      </div>
      {useRows.map((r, i) => {
        const peak = r.score === peakMax;
        const ink = scoreInk(r.score);
        return (
          <div
            key={r.h}
            style={{
              display: "grid",
              gridTemplateColumns: "42px 26px 1fr 64px 60px 26px",
              padding: "8px 14px",
              alignItems: "center",
              gap: 8,
              background: peak ? "#fff5e2" : "transparent",
              borderBottom: i < useRows.length - 1 ? `1px solid ${C.rule}66` : "none",
              fontSize: 12.5,
              color: C.ink,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            <span style={{ fontWeight: peak ? 700 : 500, color: peak ? C.coral : C.ink }}>{r.h}</span>
            <span style={{ color: ink, fontWeight: 600, textAlign: "right" }}>{r.score.toFixed(1)}</span>
            <span style={{ height: 5, background: C.foam, borderRadius: 999, overflow: "hidden" }}>
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
            <span style={{ color: C.inkDim, fontSize: 11.5 }}>
              {r.swH.toFixed(1)}m·{r.swT}s
            </span>
            <span style={{ color: r.gust > 25 ? C.red : C.inkDim, fontSize: 11.5 }}>
              {r.wKmh}
              <span style={{ color: C.inkSoft, fontSize: 10 }}>km/h</span>
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
                <TriangleAlert size={13} color={C.amber} />
              ) : (
                <Circle size={11} color={ink} fill={ink} />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function Chip({ active, children }: { active?: boolean; children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "7px 12px",
        borderRadius: 999,
        background: active ? C.deep : C.surface,
        color: active ? "#fff" : C.ink,
        boxShadow: active ? `0 2px 8px rgba(10,58,68,0.18)` : `0 1px 0 ${C.rule}`,
        whiteSpace: "nowrap",
        fontWeight: 500,
      }}
    >
      {children}
    </span>
  );
}

function MobileGearPicker({
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  // Portal-positioned menu: FilterChips parent uses overflowX:auto, which
  // clips position:absolute children on both axes. Use a portal + fixed
  // coords computed from the button rect so the popover escapes the clip.
  const pos = usePopoverPosition(open, buttonRef, "right");
  const label = GEAR_LABELS[gear];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="mobile-gear-picker-toggle"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "7px 12px",
          background: open ? C.foam : C.surface,
          color: C.ink,
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          boxShadow: open ? `0 2px 8px rgba(10,58,68,0.18)` : `0 1px 0 ${C.rule}`,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        <LayoutGrid size={12} color={C.teal} />
        {label}
        <span style={{ display: "inline-flex", color: C.inkSoft }}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            data-testid="mobile-gear-picker-menu"
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              minWidth: 160,
              background: C.surface,
              borderRadius: 12,
              boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
              padding: 4,
              listStyle: "none",
              margin: 0,
              zIndex: 50,
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
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: isCurrent ? C.foam : "transparent",
                      color: C.ink,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: isCurrent ? 600 : 500,
                    }}
                  >
                    {GEAR_LABELS[g]}
                  </Link>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

function MobileDatePicker({
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
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  // Portal-positioned: see MobileGearPicker for why.
  const pos = usePopoverPosition(open, buttonRef, "left");
  const days = forecastDates(today, FORECAST_DAY_COUNT);
  const kicker = dateKicker(date, today);
  const buttonLabel = kicker ?? formatDateLong(date);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="listbox"
        data-testid="mobile-date-picker-toggle"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "7px 12px",
          background: open ? C.foam : C.surface,
          color: C.ink,
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 500,
          boxShadow: open ? `0 2px 8px rgba(10,58,68,0.18)` : `0 1px 0 ${C.rule}`,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          whiteSpace: "nowrap",
        }}
      >
        <Calendar size={12} color={C.coral} />
        {buttonLabel}
        <span style={{ display: "inline-flex", color: C.inkSoft }}>
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>
      {open &&
        pos &&
        createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            data-testid="mobile-date-picker-menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              minWidth: 200,
              background: C.surface,
              borderRadius: 12,
              boxShadow: `0 1px 0 ${C.rule}, 0 14px 30px rgba(10,58,68,0.18)`,
              padding: 4,
              listStyle: "none",
              margin: 0,
              zIndex: 50,
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
                      gap: 6,
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: isCurrent ? C.foam : "transparent",
                      color: C.ink,
                      textDecoration: "none",
                      fontSize: 13,
                      fontWeight: isCurrent ? 600 : 500,
                    }}
                  >
                    {itemKicker && (
                      <span style={{ color: C.deep, fontWeight: 600 }}>
                        {itemKicker}
                      </span>
                    )}
                    <span style={{ color: C.inkDim }}>
                      {formatDateLong(iso)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </div>
  );
}

type PopoverPos = { top: number; left?: number; right?: number };
/**
 * Compute fixed-position coords for a popover anchored under a button.
 * Used to escape parent `overflowX: auto` clipping on the mobile filter row.
 * Recomputes on open + viewport resize; popover closes on outside click so
 * we don't bother tracking scroll.
 */
function usePopoverPosition(
  open: boolean,
  buttonRef: React.RefObject<HTMLButtonElement | null>,
  anchor: "left" | "right",
): PopoverPos | null {
  const [pos, setPos] = useState<PopoverPos | null>(null);
  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const recompute = () => {
      const el = buttonRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (anchor === "right") {
        setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
      } else {
        setPos({ top: r.bottom + 6, left: r.left });
      }
    };
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [open, anchor, buttonRef]);
  return pos;
}

export function FilterChips({
  spot,
  gear = "auto",
  date,
  today,
}: {
  spot: string;
  gear?: GearKey;
  date: string;
  today: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, padding: "0 16px", overflowX: "auto" }}>
      <MobileDatePicker key={date} spot={spot} gear={gear} date={date} today={today} />
      <MobileGearPicker spot={spot} gear={gear} date={date} today={today} />
    </div>
  );
}

export function SuggestionPill({
  children,
  dark,
  onClick,
}: {
  children: React.ReactNode;
  dark?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-block",
        whiteSpace: "nowrap",
        fontSize: 12.5,
        padding: "7px 12px",
        borderRadius: 999,
        lineHeight: 1.2,
        border: "none",
        cursor: onClick ? "pointer" : "default",
        background: dark ? "rgba(255,255,255,0.12)" : C.surface,
        color: dark ? "#fff" : C.ink,
        boxShadow: dark ? "none" : `0 1px 0 ${C.rule}`,
      }}
    >
      {children}
    </button>
  );
}
