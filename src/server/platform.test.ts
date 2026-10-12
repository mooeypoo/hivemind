import { beforeEach, describe, expect, test, vi } from 'vitest';

let token = 'first';
const opened = (kind: string) => ({
  kind,
  token,
  get(this: { kind: string; token: string }) {
    return Promise.resolve(`${this.kind}:${this.token}`);
  },
});
vi.mock('@netlify/blobs', () => ({
  getStore: vi.fn(() => opened('site')),
  getDeployStore: vi.fn(() => opened('deploy')),
}));

const { netlifyPlatform } = await import('./platform.ts');

beforeEach(() => {
  token = 'first';
});

describe('stores per deploy context', () => {
  test.each([
    ['production', 'site'],
    ['dev', 'site'],
    ['deploy-preview', 'deploy'],
    ['branch-deploy', 'deploy'],
  ] as const)('%s uses %s-scoped stores', async (context, kind) => {
    expect(await netlifyPlatform(context).store('lists').get('key')).toBe(`${kind}:first`);
  });
});

test('a store kept across invocations uses the current Blobs token', async () => {
  const store = netlifyPlatform('production').store('lists');
  await store.get('key');
  token = 'second';
  expect(await store.get('key')).toBe('site:second');
});
