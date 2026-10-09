import { afterEach, describe, expect, test } from 'vitest';
import { runRetention } from './jobs.ts';
import { startHarness, type Harness } from './http/testing/harness.ts';

let h: Harness;
afterEach(async () => {
  await h.close();
});

describe('daily retention job', () => {
  test('runs both clean-ups and reports counts only', async () => {
    h = await startHarness();
    expect(await runRetention(h.app)).toBe(
      'Retention: checked 0 archived lists, removed details from 0 entries, cleared 0 cached leaderboards.',
    );
  });
});
