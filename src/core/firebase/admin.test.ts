import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apps: [] as Array<{ name: string }>,
  app: { name: 'rest-client-admin' },
  credential: { provider: 'application-default' },
  auth: { kind: 'auth' },
  db: { kind: 'firestore' },
  initializeApp: vi.fn(),
  getApp: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/app', () => ({
  applicationDefault: vi.fn(() => mocks.credential),
  getApps: vi.fn(() => mocks.apps),
  getApp: mocks.getApp,
  initializeApp: mocks.initializeApp,
}));
vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => mocks.auth),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mocks.db),
}));

import {
  getFirebaseAdminApp,
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
} from './admin';

describe('Firebase Admin SDK', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.apps = [];
    mocks.initializeApp.mockReturnValue(mocks.app);
    mocks.getApp.mockReturnValue(mocks.app);
    vi.stubEnv('FIREBASE_PROJECT_ID', 'rest-client-demo');
  });

  it('initializes a named application lazily', () => {
    expect(getFirebaseAdminApp()).toBe(mocks.app);
    expect(mocks.initializeApp).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'rest-client-demo' }),
      'rest-client-admin'
    );
  });

  it('reuses the existing named application', () => {
    mocks.apps = [mocks.app];

    expect(getFirebaseAdminApp()).toBe(mocks.app);
    expect(mocks.getApp).toHaveBeenCalledWith('rest-client-admin');
    expect(mocks.initializeApp).not.toHaveBeenCalled();
  });

  it('requires a Firebase project id on first initialization', () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', '');
    expect(() => getFirebaseAdminApp()).toThrow(
      'FIREBASE_PROJECT_ID is not configured.'
    );
  });

  it('exposes scoped Auth and Firestore clients', () => {
    expect(getFirebaseAdminAuth()).toBe(mocks.auth);
    expect(getFirebaseAdminDb()).toBe(mocks.db);
  });
});
