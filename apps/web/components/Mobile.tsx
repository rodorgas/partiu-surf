"use client";
// Mobile UI — bottom sheet drawer.
// Dashboard fills the screen. Chat lives in a draggable bottom sheet with
// 3 snap states: peek (chips only), half (recent thread + composer), full
// (covers all but a slice of dashboard).

import { useCallback, useRef, useState } from "react";
import type { Forecast } from "@/lib/data";
import {
  C,
  AppBar,
  SummaryCard,
  HourList,
  FilterChips,
  SuggestionPill,
} from "@/components/mobile/Shared";

export const SNAPS = { peek: 18, half: 52, full: 92 } as const;
export type SheetState = keyof typeof SNAPS;
const ORDER: SheetState[] = ["peek", "half", "full"];

export function nearestSnap(pct: number): SheetState {
  let best: SheetState = "peek";
  let bestD = Infinity;
  for (const k of ORDER) {
    const d = Math.abs(pct - SNAPS[k]);
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

function Body({ data }: { data: Forecast }) {
  return (
    <>
      <AppBar />
      <FilterChips />
      <div style={{ height: 12 }} />
      <SummaryCard />
      <div style={{ height: 12 }} />
      <HourList rows={data.hours} max={8} />
      <div style={{ height: 240 }} />
    </>
  );
}

type DragRef = {
  startY: number;
  startPct: number;
  lastY: number;
  lastT: number;
  vh: number;
};

function Sheet({
  state,
  setState,
  data,
}: {
  state: SheetState;
  setState: (s: SheetState) => void;
  data: Forecast;
}) {
  const [livePct, setLivePct] = useState<number | null>(null);
  const dragRef = useRef<DragRef | null>(null);
  const heightPct = livePct != null ? livePct : SNAPS[state];
  const radius = state === "full" && livePct == null ? 14 : 22;
  const isDark = state === "full" && (livePct == null || livePct > 70);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const y = e.touches[0].clientY;
      const vh = window.innerHeight;
      dragRef.current = { startY: y, startPct: SNAPS[state], lastY: y, lastT: Date.now(), vh };
    },
    [state],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const y = e.touches[0].clientY;
    const { startY, startPct, vh } = dragRef.current;
    const deltaPct = ((startY - y) / vh) * 100;
    const next = Math.max(SNAPS.peek, Math.min(SNAPS.full, startPct + deltaPct));
    setLivePct(next);
    dragRef.current.lastY = y;
    dragRef.current.lastT = Date.now();
  }, []);

  const onTouchEnd = useCallback(() => {
    if (!dragRef.current) return;
    const finalPct = livePct != null ? livePct : SNAPS[state];
    setState(nearestSnap(finalPct));
    setLivePct(null);
    dragRef.current = null;
  }, [livePct, state, setState]);

  const cycle = () => {
    const i = ORDER.indexOf(state);
    setState(ORDER[(i + 1) % ORDER.length]);
  };

  return (
    <div
      data-testid="mobile-sheet"
      data-state={state}
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: `${heightPct}%`,
        background: isDark ? "#0c2a32" : "rgba(252,243,222,0.94)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        boxShadow: "0 -10px 30px rgba(10,58,68,0.18)",
        color: isDark ? "#fff" : C.ink,
        display: "flex",
        flexDirection: "column",
        transition:
          livePct == null ? "height .3s ease, background .25s ease, color .25s ease" : "none",
        overflow: "hidden",
        touchAction: "none",
        zIndex: 2,
      }}
    >
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        onClick={cycle}
        style={{
          padding: "10px 0 6px",
          display: "flex",
          justifyContent: "center",
          cursor: "pointer",
        }}
        aria-label="alternar painel do chat"
        role="button"
        data-testid="sheet-grabber"
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 999,
            background: isDark ? "rgba(255,255,255,0.3)" : "rgba(10,58,68,0.18)",
          }}
        />
      </div>

      {state === "peek" && livePct == null && <PeekContents data={data} />}
      {state === "half" && livePct == null && <HalfContents />}
      {state === "full" && livePct == null && <FullContents onClose={() => setState("peek")} />}
      {livePct != null && <DragHint pct={livePct} />}
    </div>
  );
}

function DragHint({ pct }: { pct: number }) {
  return (
    <div
      style={{
        padding: "8px 16px",
        textAlign: "center",
        fontSize: 12,
        color: C.inkSoft,
        fontWeight: 500,
      }}
    >
      {pct < 35 ? "solte para fechar" : pct < 75 ? "solte para meio" : "solte para abrir"}
    </div>
  );
}

function PeekContents({ data }: { data: Forecast }) {
  const sugg = data.suggestions.slice(0, 3);
  return (
    <div style={{ padding: "4px 14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span
          style={{
            width: 26,
            height: 26,
            borderRadius: "50%",
            background: C.coral,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          ✦
        </span>
        <span style={{ fontSize: 13, color: C.ink, fontWeight: 600 }}>
          Pergunta pro copiloto
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: C.inkSoft }}>↑ arraste</span>
      </div>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
        {sugg.map((s, i) => (
          <SuggestionPill key={i}>{s}</SuggestionPill>
        ))}
      </div>
    </div>
  );
}

function HalfContents() {
  return (
    <>
      <div
        style={{
          padding: "4px 14px 6px",
          fontSize: 11,
          color: C.inkSoft,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Sugestões
      </div>
      <div style={{ display: "flex", gap: 6, padding: "0 14px 10px", overflowX: "auto" }}>
        <SuggestionPill>Vale ir agora?</SuggestionPill>
        <SuggestionPill>Compara Maranduba</SuggestionPill>
        <SuggestionPill>Por que vento piora?</SuggestionPill>
      </div>
      <div style={{ padding: "8px 14px", flex: 1, overflow: "auto" }}>
        <BotBubble>
          <b style={{ color: C.deep }}>Bom dia! 🏄‍♀️</b>
          <br />
          Itamambuca tá rendendo <b style={{ color: C.green }}>8.9</b> agora. Janela boa{" "}
          <b>até 10h</b>, depois o vento vira oeste.
        </BotBubble>
      </div>
      <Composer />
    </>
  );
}

function FullContents({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div style={{ padding: "2px 16px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#7adcd2",
            boxShadow: "0 0 8px #7adcd2",
          }}
        />
        <span style={{ fontSize: 13, fontWeight: 600 }}>copiloto · partiu.surf</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="fechar"
          style={{
            marginLeft: "auto",
            fontSize: 14,
            color: "rgba(255,255,255,0.6)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          flex: 1,
          padding: "4px 14px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <BotBubble dark>
          Bom dia! Itamambuca <b style={{ color: "#7adcd2" }}>8.9/10</b> agora — pico até 10h.
        </BotBubble>
        <UserBubble dark>e pro meu fish 5&apos;8&quot;?</UserBubble>
        <BotBubble dark>
          Pra fish 5&apos;8&quot; o sweet spot é <b style={{ color: "#7adcd2" }}>1.0–1.6m · 9–12s</b>.
          Hoje tá 1.7m·13s — um <b>nada</b> grande, mas dentro. <b>Score 8.4</b> pro fish (vs 8.9
          pro short).
        </BotBubble>
        <UserBubble dark>e amanhã?</UserBubble>
        <BotBubble dark typing />
      </div>
      <ComposerDark />
    </>
  );
}

function BotBubble({
  children,
  dark,
  typing,
}: {
  children?: React.ReactNode;
  dark?: boolean;
  typing?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          flex: "0 0 auto",
          background: dark ? "rgba(255,255,255,0.12)" : C.sun,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        p
      </span>
      <div
        style={{
          maxWidth: "82%",
          padding: "10px 12px",
          borderRadius: 14,
          borderTopLeftRadius: 4,
          background: dark ? "rgba(255,255,255,0.08)" : C.surface,
          color: dark ? "#fff" : C.ink,
          fontSize: 13,
          lineHeight: 1.45,
          boxShadow: dark ? "none" : `0 1px 0 ${C.rule}`,
        }}
      >
        {typing ? <Typing /> : children}
      </div>
    </div>
  );
}

function UserBubble({ children, dark }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          maxWidth: "80%",
          padding: "9px 12px",
          borderRadius: 14,
          borderTopRightRadius: 4,
          background: dark ? "#7adcd2" : C.deep,
          color: dark ? "#0a3a44" : "#fff",
          fontSize: 13,
          lineHeight: 1.4,
          fontWeight: 500,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Typing() {
  return (
    <span style={{ display: "inline-flex", gap: 4, alignItems: "center", padding: "2px 0" }}>
      <Dot />
      <Dot d=".15s" />
      <Dot d=".3s" />
    </span>
  );
}

function Dot({ d = "0s" }: { d?: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        width: 6,
        height: 6,
        borderRadius: "50%",
        background: "rgba(255,255,255,0.6)",
        animation: `bouncedot 1s ${d} infinite`,
      }}
    />
  );
}

function Composer() {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setV("");
      }}
      style={{ padding: "8px 14px calc(14px + env(safe-area-inset-bottom))" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#fff",
          borderRadius: 999,
          padding: "4px 4px 4px 14px",
          boxShadow: `0 1px 0 ${C.rule}, 0 4px 14px rgba(10,58,68,0.06)`,
        }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="pergunte sobre o pico…"
          style={{
            flex: 1,
            fontSize: 13,
            color: C.ink,
            padding: "8px 0",
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        />
        <button
          type="submit"
          aria-label="enviar"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: C.coral,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          ↑
        </button>
      </div>
    </form>
  );
}

function ComposerDark() {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setV("");
      }}
      style={{ padding: "8px 14px calc(14px + env(safe-area-inset-bottom))" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.08)",
          borderRadius: 999,
          padding: "4px 4px 4px 14px",
        }}
      >
        <input
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="continua a conversa…"
          style={{
            flex: 1,
            fontSize: 13,
            color: "#fff",
            padding: "8px 0",
            background: "transparent",
            border: "none",
            outline: "none",
          }}
        />
        <button
          type="submit"
          aria-label="enviar"
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#7adcd2",
            color: "#0a3a44",
            border: "none",
            cursor: "pointer",
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
          }}
        >
          ↑
        </button>
      </div>
    </form>
  );
}

export function Mobile({ data }: { data: Forecast }) {
  const [state, setState] = useState<SheetState>("peek");
  const dim = state === "full";
  return (
    <div
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
      <div
        style={{
          height: "100%",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <Body data={data} />
      </div>
      {dim && (
        <div
          data-testid="mobile-dim"
          onClick={() => setState("peek")}
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(10,42,50,0.35)",
            transition: "opacity .25s ease",
            zIndex: 1,
          }}
        />
      )}
      <Sheet state={state} setState={setState} data={data} />
    </div>
  );
}

export default Mobile;
