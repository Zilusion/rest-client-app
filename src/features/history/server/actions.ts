'use server';

import { getFirebaseAdminDb } from '@/core/firebase/admin';
import { getSession } from '@/core/session/session';
import { logger } from '@/core/utils/logger';
import { Timestamp } from 'firebase-admin/firestore';

export interface HistoryEntry {
  id: string;
  userId: string;
  request: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: string;
    size: number;
  };
  response: {
    status: number | null;
    duration: number | null;
    error: string | null;
    size: number;
  };
  createdAt: Date;
}

export async function getHistory(): Promise<HistoryEntry[]> {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return [];
    }

    const querySnapshot = await getFirebaseAdminDb()
      .collection('users')
      .doc(session.userId)
      .collection('history')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    return querySnapshot.docs.map((doc) => {
      const data = doc.data();
      const createdAt = data.createdAt as Timestamp | undefined;

      return {
        id: doc.id,
        ...data,
        userId: session.userId,
        createdAt: createdAt?.toDate() ?? new Date(0),
      } as HistoryEntry;
    });
  } catch (error) {
    logger.error('Failed to fetch history:', error);
    return [];
  }
}
