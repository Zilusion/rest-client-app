import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  register: vi.fn(),
  login: vi.fn(),
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSession: vi.fn(),
  profileSet: vi.fn(),
  profileDelete: vi.fn(),
  deleteUser: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/core/firebase/auth', () => ({
  registerWithEmailAndPassword: mocks.register,
  logInWithEmailAndPassword: mocks.login,
}));
vi.mock('@/core/firebase/admin', () => ({
  getFirebaseAdminDb: vi.fn(() => ({
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        set: mocks.profileSet,
        delete: mocks.profileDelete,
      })),
    })),
  })),
  getFirebaseAdminAuth: vi.fn(() => ({ deleteUser: mocks.deleteUser })),
}));
vi.mock('@/core/session/session', () => ({
  createSession: mocks.createSession,
  deleteSession: mocks.deleteSession,
  getSession: mocks.getSession,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: vi.fn(() => 'server-timestamp') },
}));

import { getCurrentSession, logout, signIn, signUp } from './actions';

const authResponse = {
  localId: 'user-123',
  email: 'test@example.com',
  idToken: 'id-token',
  refreshToken: 'refresh-token',
  expiresIn: '3600',
};

function createSignUpForm(): FormData {
  const formData = new FormData();
  formData.set('email', 'test@example.com');
  formData.set('password', 'Password123!');
  formData.set('confirmPassword', 'Password123!');
  return formData;
}

function createSignInForm(): FormData {
  const formData = new FormData();
  formData.set('email', 'test@example.com');
  formData.set('password', 'Password123!');
  return formData;
}

describe('Auth server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.register.mockResolvedValue(authResponse);
    mocks.login.mockResolvedValue(authResponse);
    mocks.profileSet.mockResolvedValue(undefined);
    mocks.profileDelete.mockResolvedValue(undefined);
    mocks.deleteUser.mockResolvedValue(undefined);
    mocks.createSession.mockResolvedValue(undefined);
  });

  it('registers a Firebase user, creates a profile and starts a session', async () => {
    const result = await signUp({}, createSignUpForm());

    expect(result.success).toBe(true);
    expect(mocks.profileSet).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'user-123', email: 'test@example.com' })
    );
    expect(mocks.createSession).toHaveBeenCalledWith('id-token');
  });

  it('removes a partially created user when registration setup fails', async () => {
    mocks.createSession.mockRejectedValue(new Error('Session failed'));

    const result = await signUp({}, createSignUpForm());

    expect(result.errors?.general).toEqual(['Session failed']);
    expect(mocks.profileDelete).toHaveBeenCalled();
    expect(mocks.deleteUser).toHaveBeenCalledWith('user-123');
  });

  it('validates registration input before contacting Firebase', async () => {
    const formData = new FormData();
    formData.set('email', 'invalid-email');
    formData.set('password', 'short');
    formData.set('confirmPassword', 'different');

    const result = await signUp({}, formData);

    expect(result.errors?.email).toBeDefined();
    expect(result.errors?.password).toBeDefined();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it('signs in and starts a session', async () => {
    const result = await signIn({}, createSignInForm());

    expect(result.success).toBe(true);
    expect(mocks.createSession).toHaveBeenCalledWith('id-token');
  });

  it('returns Firebase authentication errors', async () => {
    mocks.login.mockRejectedValue(new Error('INVALID_LOGIN_CREDENTIALS'));

    const result = await signIn({}, createSignInForm());

    expect(result.errors?.general).toEqual(['INVALID_LOGIN_CREDENTIALS']);
  });

  it('deletes the session on logout', async () => {
    await logout();
    expect(mocks.deleteSession).toHaveBeenCalledOnce();
  });

  it('returns the current verified session', async () => {
    mocks.getSession.mockResolvedValue({ userId: 'user-123' });
    await expect(getCurrentSession()).resolves.toEqual({ userId: 'user-123' });
  });
});
