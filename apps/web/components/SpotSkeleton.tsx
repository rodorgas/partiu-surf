"use client";
// Loading skeleton shown while the server-side getForecast call is pending.
// Mirrors the real Desktop/Mobile layouts so the page reveals progressively
// instead of going blank for 4–7s on cold-cache navigations.
//
// Strategy: reuse the data-light shared subcomponents (AppBar, FilterChips,
// ScoreMethodology) for pixel-identical chrome, and build skeleton variants
// only of the data-bound cards (SummaryCard, HourList, SideCards, Hero,
// HourTable, ChatPanel). Same palette (C from mobile/Shared) so colors and
// border-radius match perfectly.

import { MapPin, Send, Sparkles } from "lucide-react";
import { AppBar, C, FilterChips } from "@/components/mobile/Shared";
import { ScoreMethodology } from "@/components/ScoreMethodology";
import type { GearKey } from "@/lib/forecast-shared";
import { SPOTS } from "@/lib/spots";

const PULSE = "surf-skeleton-pulse 1.4s ease-in-out infinite";

function Bar({
  w,
  h = 12,
  delay = 0,
  color = C.foam,
  inline = false,
}: {
  w: number | string;
  h?: number;
  delay?: number;
  color?: string;
  inline?: boolean;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: inline ? "inline-block" : "block",
        width: typeof w === "number" ? `${w}px` : w,
        height: h,
        borderRadius: 999,
        background: color,
        animation: PULSE,
        animationDelay: `${delay}s`,
        verticalAlign: inline ? "middle" : undefined,
      }}
    />
  );
}

function Wedge({ size = 88 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size * 0.7,
        flex: "0 0 auto",
        background: `radial-gradient(circle at ${size / 2}px ${size * 0.62}px, ${C.foam} 0%, ${C.foam} ${size * 0.32}px, transparent ${size * 0.36}px)`,
        animation: PULSE,
        borderRadius: 12,
      }}
    />
  );
}

// ─── Mobile cards ───────────────────────────────────────────────────────────

function MobileSummaryCard({ spotName, region }: { spotName: string; region: string }) {
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
            <MapPin size={11} /> {region}
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
          <Bar w={28} h={10} delay={i * 0.04} />
          <Bar w={18} h={10} delay={i * 0.04 + 0.05} />
          <Bar w="100%" h={5} delay={i * 0.04 + 0.1} />
          <Bar w={48} h={10} delay={i * 0.04 + 0.15} />
          <Bar w={36} h={10} delay={i * 0.04 + 0.2} />
          <Bar w={11} h={11} delay={i * 0.04 + 0.25} />
        </div>
      ))}
    </div>
  );
}

function MobileSideCard({
  title,
  height,
  delay = 0,
}: {
  title: string;
  height: number;
  delay?: number;
}) {
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
        <div
          style={{
            height,
            borderRadius: 12,
            background: C.foam,
            animation: PULSE,
            animationDelay: `${delay}s`,
          }}
        />
      </div>
    </div>
  );
}

function MobileSideCards() {
  return (
    <div style={{ margin: "12px 16px 0", display: "flex", flexDirection: "column", gap: 12 }}>
      <MobileSideCard title="Direção do swell" height={160} delay={0} />
      <MobileSideCard title="Maré" height={120} delay={0.1} />
      <MobileSideCard title="Comparado à média" height={120} delay={0.2} />
    </div>
  );
}

function MobilePeekSheet() {
  // Mirrors the "peek" snap of the Sheet — 18% of viewport — but with no
  // interactive handlers. Static placeholder so the layout matches.
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
          <Bar w={120} h={28} />
          <Bar w={140} h={28} delay={0.1} />
          <Bar w={100} h={28} delay={0.2} />
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
  const region = meta?.region ?? "";

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
        <MobileSummaryCard spotName={name} region={region} />
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

function DesktopChatPanel() {
  return (
    <aside
      className="surf-chat-panel"
      style={{
        width: 360,
        flex: "0 0 auto",
        background: C.deep,
        color: "#fff",
        display: "flex",
        flexDirection: "column",
        padding: 20,
        gap: 16,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            background: "rgba(255,255,255,0.12)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Sparkles size={14} />
        </span>
        <Bar w={120} h={12} color="rgba(255,255,255,0.18)" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
        <Bar w="90%" h={12} color="rgba(255,255,255,0.18)" delay={0.1} />
        <Bar w="75%" h={12} color="rgba(255,255,255,0.18)" delay={0.2} />
        <Bar w="60%" h={12} color="rgba(255,255,255,0.18)" delay={0.3} />
      </div>
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <Bar w="100%" h={28} color="rgba(255,255,255,0.10)" />
        <Bar w="100%" h={28} color="rgba(255,255,255,0.10)" delay={0.1} />
        <Bar w="100%" h={28} color="rgba(255,255,255,0.10)" delay={0.2} />
      </div>
      <div
        style={{
          marginTop: 8,
          padding: "10px 14px",
          borderRadius: 14,
          background: "rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Bar w="100%" h={14} color="rgba(255,255,255,0.12)" />
        <Send size={16} color="rgba(255,255,255,0.4)" />
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
      <Bar w={180} h={36} />
      <Bar w={140} h={36} delay={0.1} />
      <Bar w={120} h={36} delay={0.2} />
    </div>
  );
}

function DesktopHero({ name, region }: { name: string; region: string }) {
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
              <MapPin size={12} /> {region}
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
              <Bar w={120} h={32} />
              <Bar w={120} h={32} delay={0.05} />
              <Bar w={120} h={32} delay={0.1} />
              <Bar w={120} h={32} delay={0.15} />
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

function DesktopHourTable() {
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
          padding: "12px 16px",
        }}
      >
        <div style={{ display: "flex", gap: 10 }}>
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: "0 0 64px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                alignItems: "center",
              }}
            >
              <Bar w={28} h={11} delay={i * 0.04} />
              <Bar w={36} h={20} delay={i * 0.04 + 0.05} />
              <Bar w={48} h={4} delay={i * 0.04 + 0.1} />
              <Bar w={42} h={10} delay={i * 0.04 + 0.15} />
              <Bar w={36} h={10} delay={i * 0.04 + 0.2} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DesktopSideCard({
  title,
  height,
  delay = 0,
}: {
  title: string;
  height: number;
  delay?: number;
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
        <div
          style={{
            height,
            borderRadius: 14,
            background: C.foam,
            animation: PULSE,
            animationDelay: `${delay}s`,
          }}
        />
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
      <DesktopSideCard title="Direção do swell" height={180} delay={0} />
      <DesktopSideCard title="Maré" height={180} delay={0.1} />
      <DesktopSideCard title="Comparado à média" height={180} delay={0.2} />
    </div>
  );
}

function DesktopSkeleton({ spot }: { spot: string }) {
  const meta = SPOTS[spot];
  const name = meta?.name ?? spot;
  const region = meta?.region ?? "";

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
        <DesktopHero name={name} region={region} />
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

