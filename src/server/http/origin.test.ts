import { describe, expect, test } from 'vitest';
import { rejectForeignOrigin } from './origin.ts';

const SITE = 'https://lists.example.org';
const req = (method: string, origin?: string) =>
  new Request(`${SITE}/api/x`, {
    method,
    headers: origin === undefined ? {} : { origin },
  });

describe('Origin check', () => {
  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s from the site passes', (method) => {
    expect(rejectForeignOrigin(req(method, SITE), SITE)).toBeNull();
  });

  test.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s without an Origin is rejected', (method) => {
    expect(rejectForeignOrigin(req(method), SITE)?.status).toBe(403);
  });

  test.each([
    'https://evil.example',
    'https://lists.example.org.evil.example',
    'http://lists.example.org',
    'null',
  ])('a mutation from %s is rejected', (origin) => {
    expect(rejectForeignOrigin(req('POST', origin), SITE)?.status).toBe(403);
  });

  test('reads are not origin-checked', () => {
    expect(rejectForeignOrigin(req('GET'), SITE)).toBeNull();
  });
});
