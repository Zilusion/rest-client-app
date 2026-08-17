import 'server-only';

interface FirebaseAuthResponse {
  localId: string;
  email: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

interface FirebaseAuthErrorResponse {
  error?: {
    message?: string;
  };
}

function getFirebaseApiKey(): string {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

  if (!apiKey) {
    throw new Error('Firebase API key is not configured.');
  }

  return apiKey;
}

async function authenticateWithPassword(
  endpoint: 'accounts:signInWithPassword' | 'accounts:signUp',
  email: string,
  password: string
): Promise<FirebaseAuthResponse> {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${getFirebaseApiKey()}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    }
  );

  const data = (await response.json()) as
    | FirebaseAuthResponse
    | FirebaseAuthErrorResponse;

  if (!response.ok || !('idToken' in data)) {
    const code = 'error' in data ? data.error?.message : undefined;
    throw new Error(code ?? 'Firebase authentication failed.');
  }

  return data;
}

export function logInWithEmailAndPassword(
  email: string,
  password: string
): Promise<FirebaseAuthResponse> {
  return authenticateWithPassword(
    'accounts:signInWithPassword',
    email,
    password
  );
}

export function registerWithEmailAndPassword(
  email: string,
  password: string
): Promise<FirebaseAuthResponse> {
  return authenticateWithPassword('accounts:signUp', email, password);
}

export type { FirebaseAuthResponse };
