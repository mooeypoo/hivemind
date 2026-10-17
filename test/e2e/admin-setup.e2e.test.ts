import { expect, test } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';
import type { EditListRequest, ListDetailDto } from '../../src/server/http/contracts.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`admin publishing in ${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`saved draft dates survive a fresh editor at ${String(width)}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        let shared: ListDetailDto = {
          ...list,
          lifecycle: 'draft',
          schedule: null,
          entries: [],
          itemSourceEditable: true,
        };
        let publicationRequests = 0;
        await page.route('**/api/lists/films', (route) => route.fulfill({ json: shared }));
        await page.route('**/api/lists/list-1', async (route) => {
          const input = route.request().postDataJSON() as EditListRequest;
          if (input.draftSchedule === undefined) throw new Error('Missing saved dates');
          shared = { ...shared, draftSchedule: input.draftSchedule };
          await route.fulfill({ json: shared });
        });
        await page.route('**/api/lists/list-1/schedule', async (route) => {
          publicationRequests += 1;
          await route.fulfill({ json: list });
        });
        await page.goto('/admin/lists/films');
        await page.getByRole('radio', { name: 'At a set time', exact: true }).check();
        await page.getByLabel('Opens at', { exact: true }).fill('2099-06-10T18:00');
        await page
          .getByLabel('Nominations close (optional)', { exact: true })
          .fill('2099-06-15T18:00');
        await page.getByRole('radio', { name: 'Closes at a set time', exact: true }).check();
        await page.getByLabel('Voting closes at', { exact: true }).fill('2099-06-20T18:00');
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(page.getByText('Saved.', { exact: true }).last()).toBeVisible();
        await page.evaluate(() => {
          sessionStorage.clear();
        });
        await page.reload();
        await expect(page.getByLabel('Opens at', { exact: true })).toHaveValue('2099-06-10T18:00');
        await expect(page.getByLabel('Nominations close (optional)', { exact: true })).toHaveValue(
          '2099-06-15T18:00',
        );
        await expect(page.getByLabel('Voting closes at', { exact: true })).toHaveValue(
          '2099-06-20T18:00',
        );
        await expect(page.getByText('Draft', { exact: true })).toBeVisible();
        expect(shared.schedule).toBeNull();
        expect(publicationRequests).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      });

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
