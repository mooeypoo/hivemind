import { expect, test } from '@playwright/test';
import { insightsFixture } from '../web/insights.ts';
import { admin, fakeApi } from './fake-api.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} insights`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`overview and list detail at ${String(width)} px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await fakeApi(page, admin);
        await page.goto('/admin/insights');
        await expect(
          page.getByRole('heading', { name: 'Community insights', exact: true }),
        ).toBeVisible();
        await expect(page.getByText('75%', { exact: true })).toBeVisible();
        await expect(page.locator('.insights-hero__number')).toHaveText('17');
        await page.getByLabel('Order by').selectOption('coverage');
        await page.getByText('How these numbers work', { exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'What we count', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('heading', { name: 'Privacy, by design', exact: true }),
        ).toBeVisible();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.locator('.insights-list h3 a').click();
        await expect(page).toHaveURL(/list=films/);
        await expect(
          page.getByRole('heading', { name: 'Ratings per entry', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('table')).toBeVisible();
        await page.getByText('How these numbers work', { exact: true }).click();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await expect(page.locator('[style]')).toHaveCount(0);
        await page.getByRole('link', { name: 'All community insights' }).click();
        await expect(page).toHaveURL('/admin/insights');
      });
    }
    test('embargoed, paused and empty states do not invent statistics', async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await fakeApi(page, admin);
      for (const state of ['after-close', 'paused', 'empty', 'zero'] as const) {
        await page.route('**/api/admin/insights', (route) =>
          route.fulfill({ json: insightsFixture(state) }),
        );
        await page.goto('/admin/insights');
        await expect(
          page.getByRole('heading', { name: 'Community insights', exact: true }),
        ).toBeVisible();
        await expect(page.getByRole('button', { name: 'Refresh insights' })).toBeEnabled();
        if (state !== 'zero') await expect(page.locator('.insights-hero')).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.unroute('**/api/admin/insights');
      }
    });
  });
}
