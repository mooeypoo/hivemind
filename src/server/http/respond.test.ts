import { describe, expect, test } from 'vitest';
import { statusFor } from './respond.ts';

describe('domain error kinds map to HTTP statuses', () => {
  test.each([
    ['unauthenticated', 401],
    ['forbidden', 403],
    ['not-found', 404],
    ['conflict', 409],
    ['invalid', 422],
    ['unavailable', 503],
  ] as const)('%s → %i', (kind, status) => {
    expect(statusFor(kind)).toBe(status);
  });
});
