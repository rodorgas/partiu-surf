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
import { useChat, type ChatTurn, type ChatStatus, type ChatError } from "@/lib/useChat";
import { Markdown } from "@/components/Markdown";
import { ScoreMethodology } from "@/components/ScoreMethodology";
import type { GearKey } from "@/lib/forecast-shared";
import { todayISO } from "@/lib/date";

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

function Body({
  data,
  spot,
  gear,
  date,
  today,
}: {
  data: Forecast;
  spot: string;
  gear: GearKey;
  date: string;
  today: string;
}) {
  return (
    <>
      <AppBar spot={spot} gear={gear} date={date} today={today} />
      <FilterChips spot={spot} gear={gear} date={date} today={today} />
      <div style={{ height: 12 }} />
      <SummaryCard data={data} />
      <div style={{ height: 12 }} />
      <HourList rows={data.hours} />
      <ScoreMethodology variant="mobile" />
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

type ChatProps = {
  history: ChatTurn[];
  streaming: string;
  status: ChatStatus;
  error: ChatError | null;
  send: (text: string) => void;
  dismissError: () => void;
  suggestions: string[];
  /** Called when a suggestion is tapped — expands sheet to `full`. */
  onSuggestionFire: (text: string) => void;
};

function Sheet({
  state,
  setState,
  data,
  chat,
}: {
  state: SheetState;
  setState: (s: SheetState) => void;
  data: Forecast;
  chat: ChatProps;
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

      {state === "peek" && livePct == null && (
        <PeekContents data={data} chat={chat} />
      )}
      {state === "half" && livePct == null && <HalfContents chat={chat} />}
      {state === "full" && livePct == null && (
        <FullContents onClose={() => setState("peek")} chat={chat} />
      )}
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

function PeekContents({ data, chat }: { data: Forecast; chat: ChatProps }) {
  const sugg = data.suggestions.slice(0, 3);
  const disabled = chat.status === "waiting" || chat.status === "streaming";
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
          <SuggestionPill
            key={i}
            onClick={disabled ? undefined : () => chat.onSuggestionFire(s)}
          >
            {s}
          </SuggestionPill>
        ))}
      </div>
    </div>
  );
}

function HalfContents({ chat }: { chat: ChatProps }) {
  const showSuggestions = chat.history.length === 0 && chat.status === "idle";
  // For half-state, show only the latest assistant reply (or current streaming
  // text). Full conversation is reserved for the full sheet.
  const lastAssistant = [...chat.history].reverse().find((t) => t.role === "assistant");
  return (
    <>
      {showSuggestions && (
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
            {chat.suggestions.slice(0, 4).map((s, i) => (
              <SuggestionPill key={i} onClick={() => chat.onSuggestionFire(s)}>
                {s}
              </SuggestionPill>
            ))}
          </div>
        </>
      )}
      <div
        data-testid="chat-half-thread"
        style={{ padding: "8px 14px", flex: 1, overflow: "auto" }}
      >
        {showSuggestions ? (
          <BotBubble>
            <b style={{ color: C.deep }}>Bom dia! 🏄‍♀️</b>
            <br />
            Pergunta sobre o pico — eu olho a previsão antes de responder.
          </BotBubble>
        ) : chat.status === "waiting" ? (
          <BotBubble typing />
        ) : chat.status === "streaming" && chat.streaming ? (
          <BotBubble>
            <div data-testid="chat-streaming">
              <Markdown>{chat.streaming}</Markdown>
            </div>
          </BotBubble>
        ) : lastAssistant ? (
          <BotBubble>
            <Markdown>{lastAssistant.content}</Markdown>
          </BotBubble>
        ) : null}

        {chat.error && (
          <ErrorBubble
            kind={chat.error.kind}
            message={chat.error.message}
            onRetry={chat.error.kind === "network" ? chat.dismissError : undefined}
          />
        )}
      </div>
      <Composer onSubmit={chat.send} disabled={chat.status === "waiting" || chat.status === "streaming"} />
    </>
  );
}

function FullContents({ onClose, chat }: { onClose: () => void; chat: ChatProps }) {
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
        data-testid="chat-full-thread"
        style={{
          flex: 1,
          padding: "4px 14px",
          overflow: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {chat.history.length === 0 && chat.status === "idle" && (
          <BotBubble dark>
            Bom dia! Pergunta sobre o pico — eu olho a previsão antes de responder.
          </BotBubble>
        )}

        {chat.history.map((turn, i) =>
          turn.role === "assistant" ? (
            <BotBubble key={i} dark>
              <Markdown variant="dark">{turn.content}</Markdown>
            </BotBubble>
          ) : (
            <UserBubble key={i} dark>
              {turn.content}
            </UserBubble>
          ),
        )}

        {chat.status === "waiting" && <BotBubble dark typing />}

        {chat.status === "streaming" && chat.streaming && (
          <BotBubble dark>
            <div data-testid="chat-streaming-full">
              <Markdown variant="dark">{chat.streaming}</Markdown>
            </div>
          </BotBubble>
        )}

        {chat.error && (
          <ErrorBubble
            kind={chat.error.kind}
            message={chat.error.message}
            onRetry={chat.error.kind === "network" ? chat.dismissError : undefined}
            dark
          />
        )}
      </div>
      <ComposerDark onSubmit={chat.send} disabled={chat.status === "waiting" || chat.status === "streaming"} />
    </>
  );
}

function ErrorBubble({
  kind,
  message,
  onRetry,
  dark,
}: {
  kind: "rate_limit" | "network";
  message: string;
  onRetry?: () => void;
  dark?: boolean;
}) {
  const amber = kind === "rate_limit";
  const bg = dark
    ? amber
      ? "rgba(217,122,26,0.22)"
      : "rgba(192,57,43,0.22)"
    : amber
    ? `${C.amber}22`
    : `${C.red}1a`;
  const fg = dark ? "#fff" : amber ? C.amber : C.red;
  return (
    <div
      data-testid={`chat-error-${kind}`}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        background: bg,
        color: fg,
        fontSize: 12.5,
        lineHeight: 1.45,
        fontWeight: 500,
        maxWidth: "92%",
      }}
    >
      {message}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            display: "block",
            marginTop: 6,
            border: "none",
            background: "transparent",
            color: fg,
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
    </div>
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

function Composer({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = v.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
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
          disabled={disabled}
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
          disabled={disabled || !v.trim()}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: C.coral,
            color: "#fff",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled || !v.trim() ? 0.5 : 1,
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

function ComposerDark({
  onSubmit,
  disabled,
}: {
  onSubmit: (text: string) => void;
  disabled?: boolean;
}) {
  const [v, setV] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = v.trim();
        if (!trimmed || disabled) return;
        onSubmit(trimmed);
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
          disabled={disabled}
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
          disabled={disabled || !v.trim()}
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: "#7adcd2",
            color: "#0a3a44",
            border: "none",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled || !v.trim() ? 0.5 : 1,
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

export function Mobile({
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
  const [state, setState] = useState<SheetState>("peek");
  const { history, streaming, status, error, send, dismissError } = useChat(spot);
  const dim = state === "full";

  // Suggestion taps expand the sheet AND immediately fire the chat send.
  // Per the phase doc, clicking a suggestion should not require a second
  // tap on the submit button.
  const onSuggestionFire = useCallback(
    (text: string) => {
      setState("full");
      void send(text);
    },
    [send],
  );

  const chat: ChatProps = {
    history,
    streaming,
    status,
    error,
    send,
    dismissError,
    suggestions: data.suggestions,
    onSuggestionFire,
  };

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
        <Body data={data} spot={spot} gear={gear} date={d} today={t} />
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
      <Sheet state={state} setState={setState} data={data} chat={chat} />
    </div>
  );
}

export default Mobile;
