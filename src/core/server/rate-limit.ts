import 'server-only';

interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

const rateLimitStore = new Map<string, number[]>();

export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now()
): RateLimitResult {
  const cutoff = now - windowMs;
  const timestamps = (rateLimitStore.get(key) ?? []).filter(
    (timestamp) => timestamp > cutoff
  );

  if (timestamps.length >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((timestamps[0] + windowMs - now) / 1000)
      ),
    };
  }

  timestamps.push(now);
  rateLimitStore.set(key, timestamps);

  if (rateLimitStore.size > 10_000) {
    for (const [storedKey, values] of rateLimitStore) {
      if (values.every((timestamp) => timestamp <= cutoff)) {
        rateLimitStore.delete(storedKey);
      }
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function resetRateLimitsForTests(): void {
  rateLimitStore.clear();
}
