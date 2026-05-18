"use client";
// Loading skeleton shown while the server-side getForecast call is pending.
// Mirrors the real Desktop/Mobile layouts so the page reveals progressively
// instead of going blank for 4–7s on cold-cache navigations.
//
// Strategy: reuse the data-light shared subcomponents (AppBar, FilterChips,
// ScoreMethodology) for pixel-identical chrome, and build skeleton variants
// only of the data-bound cards. Same palette (C from mobile/Shared) so the
// only difference vs. the real page is shimmer rectangles in place of data
// nodes — everything else (backgrounds, padding, border-radius, shadows) is
// copied verbatim from the real components.

import { MapPin, Send, Sparkles } from "lucide-react";
import { AppBar, C, FilterChips } from "@/components/mobile/Shared";
import { ScoreMethodology } from "@/components/ScoreMethodology";
import { breakTypeLabel, dirLabel } from "@/lib/data";
import type { GearKey } from "@/lib/forecast-shared";
import { SPOTS } from "@/lib/spots";

// Single neutral placeholder color that reads cleanly on every surface in the
// app (sand bg, surface card, panel chat column). Avoids the "shimmer colors
// look different in different sections" effect from per-area overrides.
const PH = "rgba(10,58,68,0.08)";
const PULSE = "surf-skeleton-pulse 1.6s ease-in-out infinite";

function Bar({
  w,
  h = 12,
  delay = 0,
}: {
  w: number | string;
  h?: number;
  delay?: number;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "block",
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: 999,
        background: PH,
        animation: PULSE,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

function Block({
  w,
  h,
  radius = 12,
  delay = 0,
}: {
  w: number | string;
  h: number | string;
  radius?: number;
  delay?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: radius,
        background: PH,
        animation: PULSE,
        animationDelay: `${delay}s`,
      }}
    />
  );
}

// Half-disc shape that mirrors the geometry of the real ScoreWedge (a 0–10
// gauge arc with a centered number). Subtle pulse, no number.
function Wedge({ size = 88 }: { size?: number }) {
  const w = size;
  const h = size * 0.7;
  const cx = w / 2;
  const cy = size * 0.62;
  const r = size * 0.4;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      style={{ flex: "0 0 auto", animation: PULSE }}
      aria-hidden
    >
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        stroke={PH}
        strokeWidth="8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Mobile ─────────────────────────────────────────────────────────────────

function MobileSummaryCard({
  spotName,
  breakType,
  facing,
}: {
  spotName: string;
  breakType: string;
  facing: number;
}) {
  return (
    <div
      style={{
        margin: "0 16px",
        padding: "14px 16px",
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
            <MapPin size={11} /> {breakTypeLabel(breakType)} · frente para {dirLabel(facing)}
          </div>
          <div
            style={{
              fontFamily: C.display,
              fontSize: 26,
              color: C.deep,
              fontWeight: 700,
              lineHeight: 1,
              marginTop: 3,
              letterSpacing: "-0.02em",
            }}
          >
            {spotName}
          </div>
          <div style={{ marginTop: 8 }}>
            <Bar w="70%" h={11} />
          </div>
        </div>
        <Wedge size={88} />
      </div>
    </div>
  );
}

function MobileHourList() {
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
          05h → 18h
        </span>
      </div>
      {Array.from({ length: 14 }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "42px 26px 1fr 64px 60px 26px",
            padding: "8px 11px 8px 14px",
            alignItems: "center",
            gap: 8,
            borderLeft: "3px solid transparent",
            borderBottom: i < 13 ? `1px solid ${C.rule}66` : "none",
          }}
        >
          <Bar w={28} h={10} delay={i * 0.03} />
          <Bar w={18} h={10} delay={i * 0.03} />
          <Bar w="100%" h={5} delay={i * 0.03} />
          <Bar w={48} h={10} delay={i * 0.03} />
          <Bar w={36} h={10} delay={i * 0.03} />
          <Block w={11} h={11} radius={999} delay={i * 0.03} />
        </div>
      ))}
    </div>
  );
}

function MobileSideCard({ title, height }: { title: string; height: number }) {
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 16,
        boxShadow: `0 1px 0 ${C.rule}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "10px 14px 6px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: C.inkSoft,
        }}
      >
        {title}
      </div>
      <div style={{ padding: "8px 14px 16px" }}>
        <Block w="100%" h={height} radius={12} />
      </div>
    </div>
  );
}

function MobileSideCards() {
  return (
    <div style={{ margin: "12px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      <MobileSideCard title="Direção do swell" height={160} />
      <MobileSideCard title="Maré" height={120} />
      <MobileSideCard title="Comparado à média" height={120} />
    </div>
  );
}

function MobilePeekSheet() {
  // Static "peek" snap of the bottom sheet — 18% of viewport, no drag.
  return (
    <div
      data-testid="mobile-sheet-skeleton"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: "18%",
        background: "rgba(252,243,222,0.94)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        boxShadow: "0 -10px 30px rgba(10,58,68,0.18)",
        color: C.ink,
        zIndex: 2,
        overflow: "hidden",
      }}
    >
      <div style={{ padding: "10px 0 6px", display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 999,
            background: "rgba(10,58,68,0.18)",
          }}
        />
      </div>
      <div style={{ padding: "4px 14px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: "50%",
              background: C.foam,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.teal,
            }}
          >
            <Sparkles size={14} />
          </span>
          <Bar w={140} h={12} />
        </div>
        <div style={{ display: "flex", gap: 6, overflow: "hidden" }}>
          <Block w={120} h={28} radius={999} />
          <Block w={140} h={28} radius={999} />
          <Block w={100} h={28} radius={999} />
        </div>
      </div>
    </div>
  );
}

function MobileSkeleton({
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
  const meta = SPOTS[spot];
  const name = meta?.name ?? spot;
  const breakType = meta?.breakType ?? "beach";
  const facing = meta?.facing ?? 0;

  return (
    <div
      data-testid="spot-skeleton-mobile"
      aria-busy="true"
      style={{
        position: "fixed",
        inset: 0,
        background: C.bg,
        color: C.ink,
        fontFamily: C.sans,
        overflow: "hidden",
        paddingTop: "env(safe-area-inset-top)",
      }}
    >
      <div style={{ height: "100%", overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        <AppBar spot={spot} gear={gear} date={date} today={today} />
        <FilterChips spot={spot} gear={gear} date={date} today={today} />
        <div style={{ height: 12 }} />
        <MobileSummaryCard spotName={name} breakType={breakType} facing={facing} />
        <div style={{ height: 12 }} />
        <MobileHourList />
        <ScoreMethodology variant="mobile" />
        <MobileSideCards />
        <div style={{ height: 240 }} />
      </div>
      <MobilePeekSheet />
    </div>
  );
}

// ─── Desktop ────────────────────────────────────────────────────────────────

// Mirrors Desktop's ChatPanel — yellow-cream bg (C.panel), logo + intro card,
// a stack of suggestion pills, and a pill-shaped composer with a coral send
// button. Used to be a teal-on-dark column; corrected to match the real UI.
function DesktopChatPanel() {
  return (
    <aside
      className="surf-chat-panel"
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
      {/* Logo + brand */}
      <div style={{ padding: "22px 26px 18px", display: "flex", alignItems: "center", gap: 10 }}>
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden>
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
      </div>

      {/* Intro card */}
      <div style={{ padding: "4px 26px 12px" }}>
        <div
          style={{
            background: C.surface,
            borderRadius: 18,
            borderTopLeftRadius: 6,
            padding: "14px 16px",
            boxShadow: `0 1px 0 ${C.rule}`,
          }}
        >
          <div
            style={{
              fontSize: 11,
              color: C.inkSoft,
              marginBottom: 8,
              fontWeight: 500,
              letterSpacing: "0.02em",
            }}
          >
            partiu · agora
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <Bar w="92%" h={12} />
            <Bar w="80%" h={12} delay={0.1} />
            <Bar w="60%" h={12} delay={0.2} />
          </div>
        </div>
      </div>

      {/* Suggestions stack */}
      <div style={{ padding: "4px 18px", flex: "1 1 auto", overflow: "hidden" }}>
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              style={{
                padding: "10px 14px",
                borderRadius: 14,
                background: C.surface,
                boxShadow: `0 1px 0 ${C.rule}`,
              }}
            >
              <Bar w={`${[78, 64, 86, 56][i]}%`} h={12} delay={i * 0.08} />
            </div>
          ))}
        </div>
      </div>

      {/* Composer */}
      <div style={{ padding: "14px 18px 22px" }}>
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
          <div
            style={{
              flex: 1,
              fontSize: 14,
              color: C.inkSoft,
              padding: "8px 0",
            }}
          >
            pergunta sobre a previsão…
          </div>
          <span
            style={{
              width: 34,
              height: 34,
              borderRadius: "50%",
              background: C.coral,
              color: "#fff",
              opacity: 0.5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
            aria-hidden
          >
            <Send size={16} />
          </span>
        </div>
      </div>
    </aside>
  );
}

function DesktopTopBar() {
  return (
    <div
      style={{
        padding: "18px 28px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
      }}
    >
      <Block w={200} h={40} radius={999} />
      <Block w={160} h={40} radius={999} delay={0.08} />
      <Block w={140} h={40} radius={999} delay={0.16} />
    </div>
  );
}

function DesktopHero({
  name,
  breakType,
  facing,
}: {
  name: string;
  breakType: string;
  facing: number;
}) {
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
        <div
          className="surf-hero-row"
          style={{ display: "flex", alignItems: "flex-start", gap: 24, position: "relative" }}
        >
          <div className="surf-hero-text" style={{ flex: "1 1 auto", minWidth: 0 }}>
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
              <MapPin size={12} /> {breakTypeLabel(breakType)} · frente para {dirLabel(facing)}
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
              {name}
            </h1>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8, maxWidth: 520 }}>
              <Bar w="100%" h={13} />
              <Bar w="68%" h={13} delay={0.1} />
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
              <Block w={120} h={32} radius={999} />
              <Block w={120} h={32} radius={999} delay={0.05} />
              <Block w={120} h={32} radius={999} delay={0.1} />
              <Block w={120} h={32} radius={999} delay={0.15} />
            </div>
          </div>
          <div className="surf-hero-wedge">
            <Wedge size={140} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors the real HourTable: 9-column horizontal grid (Hora, Score, Onda,
// Per., Dir., Vento, Rajada, Maré, ·) with 14 rows. minWidth 820 + inner
// scroll like the real one.
function DesktopHourTable() {
  const cols = "62px 130px 80px 56px 86px 100px 70px 110px 40px";
  return (
    <div style={{ padding: "18px 28px 8px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
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
        <span style={{ fontSize: 12.5, color: C.inkDim }}>05h–18h · janela diurna</span>
      </div>
      <div
        className="surf-hour-scroll"
        style={{
          background: C.surface,
          borderRadius: 18,
          boxShadow: `0 1px 0 ${C.rule}`,
        }}
      >
        <div style={{ minWidth: 820 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: cols,
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
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: cols,
                padding: "10px 18px",
                alignItems: "center",
                gap: 10,
                borderLeft: "3px solid transparent",
                borderBottom: i < 13 ? `1px solid ${C.rule}88` : "none",
              }}
            >
              <Bar w={36} h={12} delay={i * 0.03} />
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Bar w={24} h={12} delay={i * 0.03} />
                <span style={{ flex: 1, display: "block" }}>
                  <Bar w="100%" h={6} delay={i * 0.03} />
                </span>
              </span>
              <span style={{ textAlign: "right" }}>
                <Bar w={48} h={12} delay={i * 0.03} />
              </span>
              <span style={{ textAlign: "right" }}>
                <Bar w={30} h={12} delay={i * 0.03} />
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Block w={14} h={14} radius={999} delay={i * 0.03} />
                <Bar w={40} h={12} delay={i * 0.03} />
              </span>
              <span style={{ textAlign: "right" }}>
                <Bar w={60} h={12} delay={i * 0.03} />
              </span>
              <span style={{ textAlign: "right" }}>
                <Bar w={30} h={12} delay={i * 0.03} />
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Bar w={72} h={18} delay={i * 0.03} />
              </span>
              <span style={{ textAlign: "center" }}>
                <Block w={12} h={12} radius={999} delay={i * 0.03} />
              </span>
            </div>
          ))}
        </div>
      </div>
      <ScoreMethodology variant="desktop" />
    </div>
  );
}

function DesktopSideCard({
  title,
  height,
}: {
  title: string;
  height: number;
}) {
  return (
    <div
      style={{
        background: C.surface,
        borderRadius: 18,
        boxShadow: `0 1px 0 ${C.rule}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "12px 16px 8px",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: C.inkSoft,
        }}
      >
        {title}
      </div>
      <div style={{ padding: "8px 16px 18px" }}>
        <Block w="100%" h={height} radius={14} />
      </div>
    </div>
  );
}

function DesktopSideCards() {
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
      <DesktopSideCard title="Direção do swell" height={180} />
      <DesktopSideCard title="Maré" height={180} />
      <DesktopSideCard title="Comparado à média" height={180} />
    </div>
  );
}

function DesktopSkeleton({ spot }: { spot: string }) {
  const meta = SPOTS[spot];
  const name = meta?.name ?? spot;
  const breakType = meta?.breakType ?? "beach";
  const facing = meta?.facing ?? 0;

  return (
    <div
      data-testid="spot-skeleton-desktop"
      aria-busy="true"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: C.bg,
        color: C.ink,
        fontFamily: C.sans,
      }}
    >
      <DesktopChatPanel />
      <main className="surf-desktop-main" style={{ flex: "1 1 auto", overflow: "auto" }}>
        <DesktopTopBar />
        <DesktopHero name={name} breakType={breakType} facing={facing} />
        <DesktopHourTable />
        <DesktopSideCards />
      </main>
    </div>
  );
}

// ─── Public entry ───────────────────────────────────────────────────────────

export function SpotSkeleton({
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
    <>
      <div className="layout-desktop">
        <DesktopSkeleton spot={spot} />
      </div>
      <div className="layout-mobile">
        <MobileSkeleton spot={spot} gear={gear} date={date} today={today} />
      </div>
    </>
  );
}
