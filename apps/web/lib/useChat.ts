"use client";
// useChat — shared streaming chat hook for the desktop sidebar and mobile sheet.
//
// State machine:
//   idle        → user has typed nothing or last turn finished cleanly.
//   waiting     → POST sent, no first byte yet (mobile shows the Typing dots).
//   streaming   → tokens are arriving, partial assistant reply in `streaming`.
//   error       → 429 (amber) or network error (red w/ "tente de novo" CTA).
//
// On submit we optimistically push the user turn into `history` then start
// reading the SSE stream. The Anthropic SDK's toReadableStream emits standard
// SSE frames: `event: <type>\ndata: <json>\n\n`. We only act on
// content_block_delta + message_stop.

import { useCallback, useRef, useState } from "react";

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
};

export type ChatStatus = "idle" | "waiting" | "streaming" | "error";

export type ChatError = {
  kind: "rate_limit" | "network";
  message: string;
};

export type UseChatResult = {
  history: ChatTurn[];
  streaming: string;
  status: ChatStatus;
  error: ChatError | null;
  /**
   * Send a message. No-op if a request is already in flight. Adds the user
   * turn synchronously, then begins streaming.
   */
  send: (text: string) => Promise<void>;
  /** Clear the most recent error so the user can try again. */
  dismissError: () => void;
};

export function useChat(spot: string): UseChatResult {
  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState<ChatStatus>("idle");
  const [error, setError] = useState<ChatError | null>(null);
  // Guard against double-submit while a request is in flight (e.g., suggestion
  // click race). useState would cause closure capture issues across rapid sends.
  const inFlight = useRef(false);

  const dismissError = useCallback(() => setError(null), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || inFlight.current) return;
      inFlight.current = true;

      const userTurn: ChatTurn = { role: "user", content: trimmed };
      // Snapshot the history that gets sent to the API — the post-update value
      // of `history` isn't visible inside this closure.
      const historyForRequest = [...history, userTurn];
      setHistory(historyForRequest);
      setStreaming("");
      setStatus("waiting");
      setError(null);

      let res: Response;
      try {
        res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            spot,
            history: history, // server-side, history excludes the new user msg (passed as `message`)
            message: trimmed,
          }),
        });
      } catch {
        setStatus("error");
        setError({
          kind: "network",
          message: "Não consegui falar com o servidor. Tente de novo.",
        });
        inFlight.current = false;
        return;
      }

      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        setStatus("error");
        setError({
          kind: "rate_limit",
          message: data.message ?? "Limite de mensagens atingido. Tenta de novo em alguns minutos.",
        });
        inFlight.current = false;
        return;
      }

      if (!res.ok || !res.body) {
        setStatus("error");
        setError({
          kind: "network",
          message: "Algo deu errado. Tente de novo.",
        });
        inFlight.current = false;
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          // Process complete SSE frames (separated by blank line).
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const dataLine = frame
              .split("\n")
              .find((line) => line.startsWith("data: "));
            if (!dataLine) continue;
            const json = dataLine.slice("data: ".length).trim();
            if (!json || json === "[DONE]") continue;
            let evt: unknown;
            try {
              evt = JSON.parse(json);
            } catch {
              continue;
            }
            if (typeof evt !== "object" || evt === null) continue;
            const e = evt as { type?: string; delta?: { type?: string; text?: string } };
            if (
              e.type === "content_block_delta" &&
              e.delta?.type === "text_delta" &&
              typeof e.delta.text === "string"
            ) {
              acc += e.delta.text;
              setStreaming(acc);
              if (status !== "streaming") setStatus("streaming");
            }
          }
        }
      } catch {
        setStatus("error");
        setError({
          kind: "network",
          message: "A conexão caiu no meio. Tente de novo.",
        });
        inFlight.current = false;
        return;
      }

      // Stream finished. Flush the assembled reply into history.
      if (acc) {
        setHistory((h) => [...h, { role: "assistant", content: acc }]);
      }
      setStreaming("");
      setStatus("idle");
      inFlight.current = false;
    },
    // `history` is read inside the closure; `status` is only used to gate a
    // status update, not to capture state — safe to omit and avoid re-renders
    // ratcheting send identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, spot],
  );

  return { history, streaming, status, error, send, dismissError };
}
