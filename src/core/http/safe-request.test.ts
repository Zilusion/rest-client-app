import { describe, expect, it, vi } from 'vitest';
import {
  isPublicAddress,
  requestPayloadSchema,
  validateRequestUrl,
} from './safe-request';

vi.mock('server-only', () => ({}));

describe('safe outbound request validation', () => {
  it('accepts public IP addresses', () => {
    expect(isPublicAddress('93.184.216.34')).toBe(true);
    expect(isPublicAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(true);
  });

  it('blocks private, loopback, link-local and mapped private addresses', () => {
    expect(isPublicAddress('127.0.0.1')).toBe(false);
    expect(isPublicAddress('192.168.2.10')).toBe(false);
    expect(isPublicAddress('169.254.169.254')).toBe(false);
    expect(isPublicAddress('::1')).toBe(false);
    expect(isPublicAddress('::ffff:10.0.0.1')).toBe(false);
  });

  it('accepts ordinary HTTP and HTTPS URLs', () => {
    expect(validateRequestUrl('https://example.com/api').hostname).toBe(
      'example.com'
    );
    expect(validateRequestUrl('http://example.com').protocol).toBe('http:');
  });

  it.each([
    'file:///etc/passwd',
    'http://localhost',
    'http://service.internal',
    'https://user:password@example.com',
    'https://example.com:3000',
  ])('blocks unsafe URL %s', (url) => {
    expect(() => validateRequestUrl(url)).toThrow();
  });

  it('rejects oversized request bodies', () => {
    const result = requestPayloadSchema.safeParse({
      method: 'POST',
      url: 'https://example.com',
      headers: {},
      body: 'x'.repeat(1024 * 1024 + 1),
    });

    expect(result.success).toBe(false);
  });
});
