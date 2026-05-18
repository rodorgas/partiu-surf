"use client";
// Three side cards — swell rose, tide arc, historic comparison.
// Used by both Desktop (3-column grid) and Mobile (single column stack).

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Info } from "lucide-react";
import type { Forecast } from "@/lib/data";
import { dirLabel } from "@/lib/data";
import { C } from "@/components/mobile/Shared";
import { TZ } from "@/lib/date";

type Variant = "desktop" | "mobile";

function InfoBadge({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={(e) => {
        e.stopPropagation();
        setOpen((o) => !o);
      }}
      tabIndex={0}
      role="button"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        position: "relative",
        marginLeft: 6,
        color: C.inkSoft,
        cursor: "help",
        outline: "none",
      }}
    >
      <Info size={13} />
      {open && (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            zIndex: 10,
            background: C.deep,
            color: "#fff",
            padding: "8px 10px",
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 1.45,
            width: 240,
            fontWeight: 400,
            letterSpacing: 0,
            fontFamily: C.sans,
            textTransform: "none",
            boxShadow: "0 8px 20px rgba(10,58,68,0.22)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}

function Card({
  title,
  variant,
  info,
  children,
}: {
  title: string;
  variant: Variant;
  info?: { text: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: variant === "mobile" ? 16 : 20,
        padding: variant === "mobile" ? "14px 16px 12px" : "18px 20px 16px",
        boxShadow: `0 1px 0 ${C.rule}`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          fontSize: 13,
          color: C.deep,
          fontWeight: 600,
          marginBottom: 14,
          fontFamily: C.display,
          letterSpacing: "-0.005em",
        }}
      >
        <span>{title}</span>
        {info && <InfoBadge text={info.text} label={info.label} />}
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

function parseHourLabel(s: string): number {
  return Number(s.replace("h", ""));
}

function TideArc({ data, isToday }: { data: Forecast; isToday: boolean }) {
  const [nowHour, setNowHour] = useState<number | null>(null);
  useEffect(() => {
    if (!isToday) return;
    const tick = () => {
      const h = Number(
        new Date().toLocaleString("en-US", {
          timeZone: TZ,
          hour: "2-digit",
          hour12: false,
        }),
      );
      setNowHour(Number.isFinite(h) ? h : null);
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [isToday]);

  const tideHours = data.hours.filter((r) => r.hasTide);
  const w = 380,
    h = 150,
    pad = 14;

  if (tideHours.length < 2) {
    return (
      <div
        style={{
          height: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.inkDim,
          fontSize: 13,
        }}
      >
        sem dados de maré
      </div>
    );
  }

  const tideValues = tideHours.map((r) => r.tideH);
  const minV = Math.min(...tideValues);
  const maxV = Math.max(...tideValues);
  const padded = Math.max(0.2, maxV - minV) * 0.15;
  const lo = minV - padded;
  const hi = maxV + padded;
  const vScale = Math.max(0.01, hi - lo);

  const startHour = parseHourLabel(tideHours[0].h);
  const endHour = parseHourLabel(tideHours[tideHours.length - 1].h);
  const hourSpan = Math.max(1, endHour - startHour);

  const baseY = h - pad - 22;
  const pts = tideHours.map((r) => {
    const t = parseHourLabel(r.h);
    const x = pad + ((t - startHour) / hourSpan) * (w - pad * 2);
    const y = baseY - ((r.tideH - lo) / vScale) * (h - pad * 2 - 22);
    return { x, y, v: r.tideH, hour: t };
  });
  const path = pts
    .map((p, i) => `${i ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");
  const fill = `${path} L ${pts[pts.length - 1].x.toFixed(1)} ${baseY} L ${pts[0].x.toFixed(1)} ${baseY} Z`;

  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1].v;
    const cur = pts[i].v;
    const next = pts[i + 1].v;
    if (cur < prev && cur <= next) lows.push(i);
    else if (cur > prev && cur >= next) highs.push(i);
  }

  const midHour = Math.round((startHour + endHour) / 2);
  const tickHours = Array.from(new Set([startHour, midHour, endHour]));

  let nowIdx: number | null = null;
  if (isToday && nowHour !== null && nowHour >= startHour && nowHour <= endHour) {
    const found = pts.findIndex((p) => p.hour === nowHour);
    nowIdx = found === -1 ? null : found;
  }

  const labelLeftEdge = 8;
  const labelRightEdge = w - 8;
  const clampLabelX = (x: number, anchor: "start" | "middle" | "end") => {
    if (anchor === "middle") {
      return Math.max(labelLeftEdge + 32, Math.min(labelRightEdge - 32, x));
    }
    if (anchor === "start") {
      return Math.max(labelLeftEdge, Math.min(labelRightEdge - 60, x));
    }
    return Math.max(labelLeftEdge + 60, Math.min(labelRightEdge, x));
  };

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
          {lows.map((i) => (
            <g key={`lo${i}`}>
              <circle cx={pts[i].x} cy={pts[i].y} r="3.5" fill={C.amber} />
              <text
                x={clampLabelX(pts[i].x, "middle")}
                y={pts[i].y + 22}
                fontSize="14"
                fill={C.amber}
                textAnchor="middle"
                fontFamily={C.sans}
                fontWeight="600"
              >
                {`baixa ${String(pts[i].hour).padStart(2, "0")}h · ${pts[i].v.toFixed(1)}m`}
              </text>
            </g>
          ))}
          {highs.map((i) => (
            <g key={`hi${i}`}>
              <circle cx={pts[i].x} cy={pts[i].y} r="3.5" fill={C.coral} />
              <text
                x={clampLabelX(pts[i].x, "middle")}
                y={pts[i].y - 10}
                fontSize="14"
                fill={C.coral}
                textAnchor="middle"
                fontFamily={C.sans}
                fontWeight="600"
              >
                {`alta ${String(pts[i].hour).padStart(2, "0")}h · ${pts[i].v.toFixed(1)}m`}
              </text>
            </g>
          ))}
        </g>
        {nowIdx !== null && (
          <g>
            <line
              x1={pts[nowIdx].x}
              y1={pad}
              x2={pts[nowIdx].x}
              y2={baseY}
              stroke={C.deep}
              strokeDasharray="3 3"
              strokeWidth="1"
            />
            <circle cx={pts[nowIdx].x} cy={pts[nowIdx].y} r="5.5" fill={C.deep} />
            <circle cx={pts[nowIdx].x} cy={pts[nowIdx].y} r="10" fill={C.deep} fillOpacity="0.18" />
            <text
              x={clampLabelX(pts[nowIdx].x + 8, "start")}
              y={pad + 14}
              fontSize="14"
              fontFamily={C.sans}
              fontWeight="700"
              fill={C.deep}
            >
              {`agora · ${pts[nowIdx].v.toFixed(1)}m`}
            </text>
          </g>
        )}
        {tickHours.map((t) => {
          const i = pts.findIndex((p) => p.hour === t);
          if (i === -1) return null;
          return (
            <text
              key={t}
              x={pts[i].x}
              y={h - 4}
              fontSize="12"
              textAnchor="middle"
              fill={C.inkSoft}
              fontFamily={C.sans}
            >{`${String(t).padStart(2, "0")}h`}</text>
          );
        })}
      </svg>
    </div>
  );
}

const MONTH_FMT = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: TZ });
const round1 = (n: number) => Math.round(n * 10) / 10;

function Hist({ data, date }: { data: Forecast; date: string }) {
  if (!data.historic) {
    return (
      <div
        style={{
          height: 150,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.inkDim,
          fontSize: 13,
        }}
      >
        sem dados históricos
      </div>
    );
  }
  const peakIdx = data.hours.reduce(
    (best, h, i, arr) => (h.score > arr[best].score ? i : best),
    0,
  );
  const peak = data.hours[peakIdx];
  const todayScore = peak?.score ?? data.spot.todayPeak ?? 0;
  const todayH = peak?.swH ?? 0;
  const todayT = peak?.swT ?? 0;
  const { avgScore, avgSwH, avgSwT } = data.historic;

  const rows = [
    { label: "Score", today: round1(todayScore), avg: avgScore, max: 10, unit: "" },
    {
      label: "Altura",
      today: round1(todayH),
      avg: avgSwH,
      max: Math.max(3, Math.ceil(Math.max(todayH, avgSwH))),
      unit: "m",
    },
    {
      label: "Período",
      today: Math.round(todayT),
      avg: avgSwT,
      max: Math.max(18, Math.ceil(Math.max(todayT, avgSwT))),
      unit: "s",
    },
  ];

  const delta = avgScore > 0 ? ((todayScore - avgScore) / avgScore) * 100 : 0;
  const above = delta >= 0;
  const pct = Math.round(Math.abs(delta));
  const monthName = MONTH_FMT.format(new Date(`${date}T12:00:00`));
  const summaryLabel = above ? "acima da média" : "abaixo da média";
  const SummaryIcon = above ? ArrowUp : ArrowDown;
  const detail = `${pct}% ${above ? "acima" : "abaixo"} da média de ${monthName}`;
  const accent = above ? C.coral : C.teal;
  const bg = above ? `${C.sun}22` : `${C.teal2}22`;
  const noteColor = above ? C.amber : C.teal;

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
          background: bg,
          color: noteColor,
          lineHeight: 1.5,
        }}
      >
        <b style={{ color: accent, display: "inline-flex", alignItems: "center", gap: 4 }}>
          <SummaryIcon size={12} /> {summaryLabel}
        </b>
        <br />
        <span style={{ color: C.inkDim }}>{detail}</span>
      </div>
    </div>
  );
}

export function SideCards({
  data,
  isToday,
  date,
  variant,
}: {
  data: Forecast;
  isToday: boolean;
  date: string;
  variant: Variant;
}) {
  const tideHours = data.hours.filter((r) => r.hasTide);
  const tideTitle =
    tideHours.length >= 2
      ? `Maré · ${tideHours[0].h}–${tideHours[tideHours.length - 1].h}`
      : "Maré";

  if (variant === "mobile") {
    return (
      <div
        style={{
          margin: "12px 16px 0",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Card
          title="Direção do swell"
          variant="mobile"
          info={{
            text: "Swell são ondas formadas por ventos distantes que viajam pelo oceano. A direção mostra de onde estão chegando — quanto mais alinhada com a orientação do pico, melhor a entrada das ondas.",
            label: "o que é swell",
          }}
        >
          <SwellRose data={data} />
        </Card>
        <Card title={tideTitle} variant="mobile">
          <TideArc data={data} isToday={isToday} />
        </Card>
        <Card title="Comparado à média" variant="mobile">
          <Hist data={data} date={date} />
        </Card>
      </div>
    );
  }

  return (
    <div
      className="surf-side-cards"
      style={{
        padding: "14px 28px 32px",
        display: "grid",
        gridTemplateColumns: "1fr 1.1fr 1fr",
        gap: 16,
      }}
    >
      <Card
        title="Direção do swell"
        variant="desktop"
        info={{
          text: "Swell são ondas formadas por ventos distantes que viajam pelo oceano. A direção mostra de onde estão chegando — quanto mais alinhada com a orientação do pico, melhor a entrada das ondas.",
          label: "o que é swell",
        }}
      >
        <SwellRose data={data} />
      </Card>
      <Card title={tideTitle} variant="desktop">
        <TideArc data={data} isToday={isToday} />
      </Card>
      <Card title="Comparado à média" variant="desktop">
        <Hist data={data} date={date} />
      </Card>
    </div>
  );
}

export default SideCards;
