import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  logInWithEmailAndPassword,
  registerWithEmailAndPassword,
} from './auth';

vi.mock('server-only', () => ({}));

const authResponse = {
  localId: 'user-123',
  email: 'test@example.com',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  expiresIn: '3600',
};

describe('Firebase Identity Toolkit client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', 'test-api-key');
  });

  it('signs in with email and password', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(authResponse)));

    await expect(
      logInWithEmailAndPassword('test@example.com', 'Password123!')
    ).resolves.toEqual(authResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('accounts:signInWithPassword?key=test-api-key'),
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('registers a user through the sign-up endpoint', async () => {
    const fetchMock = vi
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(authResponse)));

    await registerWithEmailAndPassword('test@example.com', 'Password123!');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('accounts:signUp?key=test-api-key'),
      expect.any(Object)
    );
  });

  it('returns the Firebase error code', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'INVALID_PASSWORD' } }), {
        status: 400,
      })
    );

    await expect(
      logInWithEmailAndPassword('test@example.com', 'wrong-password')
    ).rejects.toThrow('INVALID_PASSWORD');
  });

  it('requires the public Firebase API key', async () => {
    vi.stubEnv('NEXT_PUBLIC_FIREBASE_API_KEY', '');

    await expect(
      logInWithEmailAndPassword('test@example.com', 'Password123!')
    ).rejects.toThrow('Firebase API key is not configured.');
  });
});
