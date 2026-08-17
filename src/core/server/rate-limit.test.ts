import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { consumeRateLimit, resetRateLimitsForTests } from './rate-limit';

describe('in-process rate limit', () => {
  beforeEach(() => resetRateLimitsForTests());

  it('allows requests within the configured window', () => {
    expect(consumeRateLimit('user:1', 2, 1_000, 1_000).allowed).toBe(true);
    expect(consumeRateLimit('user:1', 2, 1_000, 1_100).allowed).toBe(true);
  });

  it('blocks excess requests until the window expires', () => {
    consumeRateLimit('user:1', 1, 1_000, 1_000);

    expect(consumeRateLimit('user:1', 1, 1_000, 1_100)).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    expect(consumeRateLimit('user:1', 1, 1_000, 2_001).allowed).toBe(true);
  });
});
