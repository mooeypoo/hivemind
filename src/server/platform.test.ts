import { describe, expect, test, vi } from 'vitest';

vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => ({ kind: 'site' })),
  getDeployStore: vi.fn(() => ({ kind: 'deploy' })),
}));

const { netlifyPlatform } = await import('./platform.ts');

describe('stores per deploy context', () => {
  test.each([
    ['production', 'site'],
    ['dev', 'site'],
    ['deploy-preview', 'deploy'],
    ['branch-deploy', 'deploy'],
  ] as const)('%s uses %s-scoped stores', (context, kind) => {
    expect(netlifyPlatform(context).store('lists')).toEqual({ kind });
  });
});
