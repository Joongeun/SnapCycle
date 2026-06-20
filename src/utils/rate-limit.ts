import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Lightweight client-side rate limiter backed by AsyncStorage.
 *
 * NOTE: This is a *soft* limit — it deters casual overuse, runaway loops, and
 * accidental spamming of paid APIs (e.g. Google Vision) from a single device.
 * It is NOT a security boundary: a determined user could clear storage. Real
 * enforcement must happen server-side (planned for the Phase 4 backend).
 */

const PREFIX = 'rrr2:ratelimit:';

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  /** ms timestamp when the oldest hit in the window expires. */
  resetsAt: number;
}

/**
 * Records a usage against `key` within a rolling `windowMs` window and reports
 * whether it was allowed. When the window is full, nothing is recorded and
 * `allowed` is false.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const storageKey = PREFIX + key;
  const now = Date.now();

  let timestamps: number[] = [];
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (raw) timestamps = JSON.parse(raw);
  } catch {
    timestamps = [];
  }

  // Drop entries that have aged out of the window.
  timestamps = timestamps.filter((t) => now - t < windowMs);

  if (timestamps.length >= limit) {
    const oldest = Math.min(...timestamps);
    return { allowed: false, remaining: 0, limit, resetsAt: oldest + windowMs };
  }

  timestamps.push(now);
  await AsyncStorage.setItem(storageKey, JSON.stringify(timestamps));

  return {
    allowed: true,
    remaining: limit - timestamps.length,
    limit,
    resetsAt: now + windowMs,
  };
}

/** Human-friendly "time until reset" string, e.g. "3h 12m". */
export function formatResetIn(resetsAt: number): string {
  const ms = Math.max(0, resetsAt - Date.now());
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Shared limits so the whole app agrees on the quota. */
export const RateLimits = {
  /** Item identifications (Google Vision calls) per device, per 24h. */
  IDENTIFY: { limit: 30, windowMs: 24 * 60 * 60 * 1000 },
} as const;
