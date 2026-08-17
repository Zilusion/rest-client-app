import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  get: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/core/session/session', () => ({ getSession: mocks.getSession }));
vi.mock('@/core/firebase/admin', () => ({
  getFirebaseAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        collection: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({ get: mocks.get })),
          })),
        })),
      })),
    })),
  })),
}));

import { getHistory } from './actions';
import { logger } from '@/core/utils/logger';

describe('getHistory server action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns an empty list for an unauthenticated request', async () => {
    mocks.getSession.mockResolvedValue(null);
    await expect(getHistory()).resolves.toEqual([]);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('returns the latest user-scoped history entries', async () => {
    const createdAt = new Date('2026-08-17T12:00:00Z');
    mocks.getSession.mockResolvedValue({ userId: 'user-123' });
    mocks.get.mockResolvedValue({
      docs: [
        {
          id: 'entry-1',
          data: () => ({
            request: {
              method: 'GET',
              url: 'https://example.com',
              headers: {},
              size: 0,
            },
            response: {
              status: 200,
              duration: 25,
              error: null,
              size: 12,
            },
            createdAt: { toDate: () => createdAt },
          }),
        },
      ],
    });

    const history = await getHistory();

    expect(history).toHaveLength(1);
    expect(history[0]).toEqual(
      expect.objectContaining({
        id: 'entry-1',
        userId: 'user-123',
        createdAt,
      })
    );
  });

  it('returns an empty list when Firestore is unavailable', async () => {
    const log = vi.spyOn(logger, 'error').mockImplementation(() => {});
    mocks.getSession.mockResolvedValue({ userId: 'user-123' });
    mocks.get.mockRejectedValue(new Error('Firestore unavailable'));

    await expect(getHistory()).resolves.toEqual([]);
    expect(log).toHaveBeenCalledWith(
      'Failed to fetch history:',
      expect.any(Error)
    );
  });
});
