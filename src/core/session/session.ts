import 'server-only';
import { cookies } from 'next/headers';
import { getFirebaseAdminAuth } from '../firebase/admin';

export async function createSession(idToken: string) {
  const expiresIn = 60 * 60;
  const sessionCookie = await getFirebaseAdminAuth().createSessionCookie(
    idToken,
    { expiresIn: expiresIn * 1000 }
  );

  const cookieStore = await cookies();
  cookieStore.set('session', sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: expiresIn,
    sameSite: 'lax',
    path: '/',
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

export async function getSession(): Promise<{ userId: string } | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get('session')?.value;

  if (!sessionCookie) return null;

  try {
    const decodedToken = await getFirebaseAdminAuth().verifySessionCookie(
      sessionCookie,
      true
    );
    return { userId: decodedToken.uid };
  } catch {
    return null;
  }
}
