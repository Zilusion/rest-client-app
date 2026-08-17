'use server';

import {
  createAuthFormSchema,
  createSignUpSchema,
  FormState,
} from '@/features/auth/model/definitions';
import {
  createSession,
  deleteSession,
  getSession,
} from '@/core/session/session';
import {
  registerWithEmailAndPassword,
  logInWithEmailAndPassword,
} from '@/core/firebase/auth';
import {
  getFirebaseAdminAuth,
  getFirebaseAdminDb,
} from '@/core/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getTranslations } from 'next-intl/server';

export async function signUp(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const t = await getTranslations('ZodErrors');
  const signUpSchema = createSignUpSchema(t);
  const validatedFields = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;

  let registeredUserId: string | null = null;

  try {
    const data = await registerWithEmailAndPassword(email, password);
    registeredUserId = data.localId;

    await getFirebaseAdminDb().collection('users').doc(data.localId).set({
      uid: data.localId,
      authProvider: 'local',
      email: data.email,
      createdAt: FieldValue.serverTimestamp(),
    });

    await createSession(data.idToken);

    return {
      success: true,
      message: 'Registration successful!',
    };
  } catch (error: unknown) {
    if (registeredUserId) {
      await getFirebaseAdminDb()
        .collection('users')
        .doc(registeredUserId)
        .delete()
        .catch(() => {});
      await getFirebaseAdminAuth()
        .deleteUser(registeredUserId)
        .catch(() => {});
    }

    if (error instanceof Error)
      return {
        errors: {
          general: [error.message],
        },
      };
    return { errors: undefined };
  }
}

export async function signIn(
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const t = await getTranslations('ZodErrors');
  const authFormSchema = createAuthFormSchema(t);
  const validatedFields = authFormSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
    };
  }

  const { email, password } = validatedFields.data;

  try {
    const data = await logInWithEmailAndPassword(email, password);
    await createSession(data.idToken);

    return {
      success: true,
      message: 'Login successful!',
    };
  } catch (error: unknown) {
    if (error instanceof Error)
      return {
        errors: {
          general: [error.message],
        },
      };
    return { errors: undefined };
  }
}

export async function logout() {
  await deleteSession();
}

export async function getCurrentSession() {
  return getSession();
}
