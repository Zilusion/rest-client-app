import 'server-only';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { STATUS_CODES } from 'node:http';
import type { LookupFunction } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, request, type Dispatcher } from 'undici';
import { z } from 'zod';

const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;
const ALLOWED_PORTS = new Set(['', '80', '443']);
const MAX_REDIRECTS = 3;
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const BLOCKED_HOST_SUFFIXES = [
  '.internal',
  '.lan',
  '.local',
  '.localdomain',
  '.localhost',
  '.home',
];
const BLOCKED_HOSTS = new Set([
  'localhost',
  'metadata.google.internal',
  'host.docker.internal',
  'gateway.docker.internal',
]);
const SENSITIVE_FORWARD_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'proxy-authorization',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
]);
const CROSS_ORIGIN_HEADERS = new Set([
  'authorization',
  'cookie',
  'proxy-authorization',
]);

export const requestPayloadSchema = z
  .object({
    method: z.enum(ALLOWED_METHODS),
    url: z.string().trim().min(1).max(2048),
    headers: z.record(z.string().max(128), z.string().max(8192)),
    body: z.string().optional(),
  })
  .superRefine((payload, context) => {
    const entries = Object.entries(payload.headers);
    const headerBytes = entries.reduce(
      (total, [key, value]) =>
        total + Buffer.byteLength(key) + Buffer.byteLength(value),
      0
    );

    if (entries.length > 50 || headerBytes > 32 * 1024) {
      context.addIssue({
        code: 'custom',
        path: ['headers'],
        message: 'Request headers are too large.',
      });
    }

    if (
      payload.body !== undefined &&
      Buffer.byteLength(payload.body) > MAX_REQUEST_BODY_BYTES
    ) {
      context.addIssue({
        code: 'custom',
        path: ['body'],
        message: 'Request body exceeds 1 MB.',
      });
    }
  });

export type RequestPayload = z.infer<typeof requestPayloadSchema>;

export interface SafeRequestResponse {
  status: number;
  statusText: string;
  data: string;
  headers: Record<string, string>;
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, '');
}

export function isPublicAddress(address: string): boolean {
  try {
    const parsed = ipaddr.parse(address);
    const normalized =
      parsed instanceof ipaddr.IPv6 && parsed.isIPv4MappedAddress()
        ? parsed.toIPv4Address()
        : parsed;

    return normalized.range() === 'unicast';
  } catch {
    return false;
  }
}

export function validateRequestUrl(input: string): URL {
  let url: URL;

  try {
    url = new URL(input);
  } catch {
    throw new Error('Enter a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Only HTTP and HTTPS URLs are allowed.');
  }

  if (url.username || url.password) {
    throw new Error('Credentials in URLs are not allowed.');
  }

  if (!ALLOWED_PORTS.has(url.port)) {
    throw new Error('Only ports 80 and 443 are allowed.');
  }

  const hostname = normalizeHostname(url.hostname);
  if (
    BLOCKED_HOSTS.has(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    throw new Error('Local and internal hosts are not allowed.');
  }

  return url;
}

async function resolvePublicAddresses(url: URL): Promise<LookupAddress[]> {
  const hostname = normalizeHostname(url.hostname);
  const literal = ipaddr.isValid(hostname);
  const addresses = literal
    ? [
        {
          address: hostname,
          family: ipaddr.parse(hostname).kind() === 'ipv4' ? 4 : 6,
        },
      ]
    : await lookup(hostname, { all: true, verbatim: true });

  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error('The target resolves to a private or reserved network.');
  }

  return addresses;
}

function createPinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (_hostname, options, callback) => {
    const matching = options.family
      ? addresses.filter(({ family }) => family === options.family)
      : addresses;
    const candidates = matching.length > 0 ? matching : addresses;

    if (options.all) {
      callback(null, candidates);
      return;
    }

    const first = candidates[0];
    callback(null, first.address, first.family);
  };
}

function sanitizeForwardHeaders(
  input: Record<string, string>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !SENSITIVE_FORWARD_HEADERS.has(key.toLowerCase())
    )
  );
}

function sanitizeRedirectHeaders(
  input: Record<string, string>,
  isCrossOrigin: boolean
): Record<string, string> {
  if (!isCrossOrigin) return input;

  return Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => !CROSS_ORIGIN_HEADERS.has(key.toLowerCase())
    )
  );
}

function normalizeResponseHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(
        (entry): entry is [string, string | string[]] => entry[1] !== undefined
      )
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? value.join(', ') : value,
      ])
  );
}

async function readLimitedBody(
  body: Dispatcher.ResponseData['body']
): Promise<string> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of body) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;

    if (totalBytes > MAX_RESPONSE_BODY_BYTES) {
      body.destroy();
      throw new Error('Response body exceeds 2 MB.');
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks).toString('utf8');
}

function formatResponseBody(
  body: string,
  contentType: string | undefined
): string {
  if (!contentType?.includes('application/json')) return body;

  try {
    return JSON.stringify(JSON.parse(body) as unknown, null, 2);
  } catch {
    return body;
  }
}

function isRedirect(statusCode: number): boolean {
  return [301, 302, 303, 307, 308].includes(statusCode);
}

export async function executeSafeRequest(
  payload: RequestPayload
): Promise<SafeRequestResponse> {
  let currentUrl = validateRequestUrl(payload.url);
  let currentMethod: RequestPayload['method'] = payload.method;
  let currentHeaders = sanitizeForwardHeaders(payload.headers);
  let currentBody = payload.body;

  for (
    let redirectCount = 0;
    redirectCount <= MAX_REDIRECTS;
    redirectCount += 1
  ) {
    const addresses = await resolvePublicAddresses(currentUrl);
    const dispatcher = new Agent({
      connect: { lookup: createPinnedLookup(addresses) },
    });

    try {
      const response = await request(currentUrl, {
        dispatcher,
        method: currentMethod,
        headers: currentHeaders,
        body: ['GET', 'HEAD'].includes(currentMethod) ? undefined : currentBody,
        headersTimeout: REQUEST_TIMEOUT_MS,
        bodyTimeout: REQUEST_TIMEOUT_MS,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      const responseHeaders = normalizeResponseHeaders(response.headers);
      const location = responseHeaders.location;

      if (isRedirect(response.statusCode) && location) {
        if (redirectCount === MAX_REDIRECTS) {
          response.body.destroy();
          throw new Error('The request exceeded 3 redirects.');
        }

        response.body.destroy();
        const nextUrl = validateRequestUrl(
          new URL(location, currentUrl).toString()
        );
        const isCrossOrigin = nextUrl.origin !== currentUrl.origin;
        currentHeaders = sanitizeRedirectHeaders(currentHeaders, isCrossOrigin);

        if (
          response.statusCode === 303 ||
          ((response.statusCode === 301 || response.statusCode === 302) &&
            currentMethod === 'POST')
        ) {
          currentMethod = 'GET';
          currentBody = undefined;
          currentHeaders = Object.fromEntries(
            Object.entries(currentHeaders).filter(
              ([key]) =>
                !['content-type', 'content-length'].includes(key.toLowerCase())
            )
          );
        }

        currentUrl = nextUrl;
        continue;
      }

      const body = await readLimitedBody(response.body);
      return {
        status: response.statusCode,
        statusText: STATUS_CODES[response.statusCode] ?? '',
        data: formatResponseBody(body, responseHeaders['content-type']),
        headers: responseHeaders,
      };
    } finally {
      await dispatcher.close();
    }
  }

  throw new Error('The request could not be completed.');
}
