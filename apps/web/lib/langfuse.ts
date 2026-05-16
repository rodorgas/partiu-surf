import { Langfuse } from "langfuse";

// Singleton Langfuse client. Returns null when keys are unset so the chat
// route can call this unconditionally without branching on env in every
// caller. The SDK auto-reads LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY,
// but expects LANGFUSE_BASEURL (one word) — we read LANGFUSE_BASE_URL (the
// name kept in .env.local) and pass it explicitly.
let _client: Langfuse | null | undefined;

export function langfuse(): Langfuse | null {
  if (_client !== undefined) return _client;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    _client = null;
    return _client;
  }
  _client = new Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL,
  });
  return _client;
}
