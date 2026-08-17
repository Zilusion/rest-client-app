'use server';

import {
  executeSafeRequest,
  requestPayloadSchema,
  type RequestPayload,
} from '@/core/http/safe-request';
import { getFirebaseAdminDb } from '@/core/firebase/admin';
import { getSession } from '@/core/session/session';
import { consumeRateLimit } from '@/core/server/rate-limit';
import { logger } from '@/core/utils/logger';
import { FieldValue } from 'firebase-admin/firestore';
import { headers as getRequestHeaders } from 'next/headers';

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const USER_RATE_LIMIT = 30;
const IP_RATE_LIMIT = 60;
const HISTORY_LIMIT = 50;
const SENSITIVE_HISTORY_HEADERS = new Set([
  'api-key',
  'authorization',
  'cookie',
  'proxy-authorization',
  'x-api-key',
]);

interface ClientResponse {
  status: number | null;
  statusText: string | null;
  data: string | null;
  headers: Record<string, string> | null;
  duration: number;
  error: string | null;
}

function createErrorResponse(
  startTime: number,
  message: string
): ClientResponse {
  return {
    status: null,
    statusText: null,
    data: null,
    headers: null,
    duration: Date.now() - startTime,
    error: message,
  };
}

function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

function applyRequestRateLimits(
  userId: string,
  clientIp: string
): string | null {
  const userLimit = consumeRateLimit(
    `rest-client:user:${userId}`,
    USER_RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );
  const ipLimit = consumeRateLimit(
    `rest-client:ip:${clientIp}`,
    IP_RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS
  );

  if (userLimit.allowed && ipLimit.allowed) return null;

  const retryAfter = Math.max(
    userLimit.retryAfterSeconds,
    ipLimit.retryAfterSeconds
  );
  return `Request limit reached. Try again in ${retryAfter} seconds.`;
}

function sanitizeHistoryHeaders(
  headers: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [
      key,
      SENSITIVE_HISTORY_HEADERS.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ])
  );
}

export async function executeRequestServer(
  input: unknown
): Promise<ClientResponse> {
  const startTime = Date.now();
  const session = await getSession();

  if (!session?.userId) {
    return createErrorResponse(startTime, 'Authentication is required.');
  }

  const parsed = requestPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return createErrorResponse(
      startTime,
      parsed.error.issues[0]?.message ?? 'Invalid request.'
    );
  }

  const requestHeaders = await getRequestHeaders();
  const rateLimitError = applyRequestRateLimits(
    session.userId,
    getClientIp(requestHeaders)
  );

  if (rateLimitError) {
    return createErrorResponse(startTime, rateLimitError);
  }

  try {
    const response = await executeSafeRequest(parsed.data);
    const clientResponse: ClientResponse = {
      ...response,
      duration: Date.now() - startTime,
      error: null,
    };

    await saveToHistory(session.userId, parsed.data, clientResponse);
    return clientResponse;
  } catch (error: unknown) {
    const errorResponse = createErrorResponse(
      startTime,
      error instanceof Error ? error.message : 'Failed to fetch.'
    );

    await saveToHistory(session.userId, parsed.data, errorResponse);
    return errorResponse;
  }
}

async function saveToHistory(
  userId: string,
  request: RequestPayload,
  response: ClientResponse
): Promise<void> {
  try {
    const history = getFirebaseAdminDb()
      .collection('users')
      .doc(userId)
      .collection('history');
    const isHttpError = response.status !== null && response.status >= 400;
    const errorDetails =
      response.error ??
      (isHttpError ? `${response.status} ${response.statusText}` : null);

    await history.add({
      userId,
      request: {
        method: request.method,
        url: request.url,
        headers: sanitizeHistoryHeaders(request.headers),
        body: request.body ?? null,
        size: request.body ? Buffer.byteLength(request.body) : 0,
      },
      response: {
        status: response.status,
        duration: response.duration,
        size: response.data ? Buffer.byteLength(response.data) : 0,
        error: errorDetails,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    const expiredEntries = await history
      .orderBy('createdAt', 'desc')
      .offset(HISTORY_LIMIT)
      .limit(25)
      .get();

    if (!expiredEntries.empty) {
      const batch = getFirebaseAdminDb().batch();
      expiredEntries.docs.forEach((document) => batch.delete(document.ref));
      await batch.commit();
    }
  } catch (error) {
    logger.error('Failed to save request to history:', error);
  }
}

export type { ClientResponse };
