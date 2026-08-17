import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  executeSafeRequest: vi.fn(),
  add: vi.fn(),
  expiredGet: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/core/session/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/core/http/safe-request', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@/core/http/safe-request')>();
  return { ...original, executeSafeRequest: mocks.executeSafeRequest };
});
vi.mock('@/core/firebase/admin', () => ({
  getFirebaseAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          add: mocks.add,
          orderBy: vi.fn(() => ({
            offset: vi.fn(() => ({
              limit: vi.fn(() => ({ get: mocks.expiredGet })),
            })),
          })),
        })),
      })),
    })),
  })),
}));
vi.mock('next/headers', () => ({
  headers: vi
    .fn()
    .mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.10' })),
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => 'server-timestamp') },
}));

import { resetRateLimitsForTests } from '@/core/server/rate-limit';
import { executeRequestServer } from './actions';

const request = {
  method: 'GET',
  url: 'https://example.com/api',
  headers: { Authorization: 'Bearer secret', Accept: 'application/json' },
} as const;

describe('executeRequestServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRateLimitsForTests();
    mocks.getSession.mockResolvedValue({ userId: 'user-123' });
    mocks.add.mockResolvedValue({ id: 'history-1' });
    mocks.expiredGet.mockResolvedValue({ empty: true, docs: [] });
    mocks.executeSafeRequest.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      data: '{"ok":true}',
      headers: { 'content-type': 'application/json' },
    });
  });

  it('requires a verified session before executing a request', async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await executeRequestServer(request);

    expect(response.error).toBe('Authentication is required.');
    expect(mocks.executeSafeRequest).not.toHaveBeenCalled();
  });

  it('executes a validated request and stores scoped history', async () => {
    const response = await executeRequestServer(request);

    expect(response).toEqual(
      expect.objectContaining({ status: 200, statusText: 'OK', error: null })
    );
    expect(mocks.executeSafeRequest).toHaveBeenCalledWith(request);
    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        request: expect.objectContaining({
          headers: {
            Authorization: '[REDACTED]',
            Accept: 'application/json',
          },
        }),
      })
    );
  });

  it('returns validation errors without making an outbound request', async () => {
    const response = await executeRequestServer({
      ...request,
      url: '',
    });

    expect(response.error).toBeTruthy();
    expect(mocks.executeSafeRequest).not.toHaveBeenCalled();
  });

  it('returns executor errors and keeps them in history', async () => {
    mocks.executeSafeRequest.mockRejectedValue(
      new Error('The target resolves to a private or reserved network.')
    );

    const response = await executeRequestServer(request);

    expect(response.error).toContain('private or reserved network');
    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          error: 'The target resolves to a private or reserved network.',
        }),
      })
    );
  });
});
