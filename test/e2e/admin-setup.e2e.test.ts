import { expect, test } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`admin publishing in ${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`review and privacy acknowledgments work at ${String(width)}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        const draft = {
          ...list,
          lifecycle: 'draft',
          schedule: null,
          entries: [],
          itemSourceEditable: true,
        };
        let published = false;
        let saved = false;
        await page.route('**/api/lists/films', (route) => route.fulfill({ json: draft }));
        await page.route('**/api/lists/list-1', async (route) => {
          expect(route.request().method()).toBe('PUT');
          saved = true;
          await route.fulfill({ json: draft });
        });
        await page.route('**/api/lists/list-1/schedule', async (route) => {
          expect(saved).toBe(true);
          expect(route.request().postDataJSON()).toMatchObject({
            nominationsCloseAt: null,
            closesAt: null,
          });
          published = true;
          await route.fulfill({ json: list });
        });
        const fits = async () => {
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          const box = await page
            .getByRole('dialog', { name: 'Review before publishing' })
            .boundingBox();
          expect(box).not.toBeNull();
          expect(box?.x).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
        };
        await page.goto('/admin/lists/films');
        await page.getByRole('radio', { name: /^Named:/ }).check();
        await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
        const review = page.getByRole('dialog', { name: 'Review before publishing' });
        await expect(review).toBeVisible();
        await expect(review.getByRole('button', { name: 'Back to settings' })).toBeFocused();
        await expect(review).toContainText('What becomes fixed');
        await fits();
        expect(saved).toBe(false);
        await review.getByRole('button', { name: 'Back to settings' }).click();
        await expect(review).not.toBeVisible();
        expect(published).toBe(false);
        await page.getByRole('button', { name: 'Review & publish', exact: true }).click();
        const confirm = review.getByRole('button', {
          name: 'Publish and open voting',
          exact: true,
        });
        await expect(confirm).toBeDisabled();
        await review.getByLabel('I have reviewed the settings that become fixed.').check();
        await expect(confirm).toBeDisabled();
        await review
          .getByRole('checkbox', { name: /^I understand members will see names/ })
          .check();
        await fits();
        await confirm.click();
        await expect(review).not.toBeVisible();
        expect(published).toBe(true);
      });
    }
  });
}
