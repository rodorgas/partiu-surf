import { Redis } from "@upstash/redis";

/**
 * Forecast cache — TS port of `surfcheck/cache.py`.
 *
 * Date rule:
 *   - Past dates  → cache permanent (forecasts don't change retroactively).
 *   - Today/future → cache valid for 12h via Redis TTL.
 *
 * Key namespacing convention (consumed by phase 3):
 *   forecast:{spot}:{YYYY-MM-DD}        marine + atmospheric forecast
 *   tide:{spot}:{YYYY-MM-DD}            tide heights (when WorldTides is enabled)
 *   historic:{spot}:{YYYY-MM}:{gear}    monthly climatology (permanent)
 */

export const redis = Redis.fromEnv();

const TODAY_TTL_S = 12 * 60 * 60; // 12h
const TZ = "America/Sao_Paulo";

/** YYYY-MM-DD in São Paulo time. */
export function todayISO(): string {
  // 'sv-SE' locale formats as YYYY-MM-DD.
  return new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
}

function buildKey(namespace: string, targetDate: string): string {
  return `${namespace}:${targetDate}`;
}

export async function getCached<T>(
  namespace: string,
  targetDate: string,
): Promise<T | null> {
  return redis.get<T>(buildKey(namespace, targetDate));
}

export async function setCached<T>(
  namespace: string,
  targetDate: string,
  data: T,
): Promise<void> {
  const key = buildKey(namespace, targetDate);
  // Past dates → permanent. Today/future → 12h TTL.
  if (targetDate < todayISO()) {
    await redis.set(key, data);
  } else {
    await redis.set(key, data, { ex: TODAY_TTL_S });
  }
}

/** Get/set without date-based TTL — used for climatology that stays stable per calendar month. */
export async function getPermanent<T>(key: string): Promise<T | null> {
  return redis.get<T>(key);
}

export async function setPermanent<T>(key: string, data: T): Promise<void> {
  await redis.set(key, data);
}

export async function invalidate(
  namespace: string,
  targetDate?: string,
): Promise<void> {
  if (targetDate) {
    await redis.del(buildKey(namespace, targetDate));
    return;
  }
  // Delete every key in this namespace via SCAN (used by /api/refresh).
  let cursor = 0;
  do {
    const [next, keys] = await redis.scan(cursor, {
      match: `${namespace}:*`,
      count: 100,
    });
    if (keys.length) {
      await redis.del(...keys);
    }
    cursor = Number(next);
  } while (cursor !== 0);
}
