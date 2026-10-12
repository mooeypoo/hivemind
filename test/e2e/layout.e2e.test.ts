import { expect, test, type Page } from '@playwright/test';
import { admin, fakeApi } from './fake-api.ts';

/**
 * Real-browser layout checks that happy-dom can't make: no page scrolls sideways, down to the
 * 320 px minimum in AGENTS.md, in either colour scheme.
 */
const widths = [320, 375, 1280];
const memberRoutes = [
  '/',
  '/lists/films',
  '/lists/films/results',
  '/admin/lists/new',
  '/admin/lists/films',
  '/admin/roles',
  '/admin/backups',
  '/about',
  '/privacy',
  '/no-such-page',
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const width of widths) {
      test(`signed out, ${String(width)} px: the welcome page fits`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, null);
        await page.goto('/');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expectNoSidewaysScroll(page);
      });

      test(`the open menu at ${String(width)} px fits on screen`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        await page.goto('/');
        await page.getByRole('button', { name: /^Menu/ }).click();
        const menu = page.getByRole('dialog', { name: 'Menu' });
        await expect(menu.getByRole('link', { name: 'Backups' })).toBeVisible();
        const box = await menu.boundingBox();
        expect(box).not.toBeNull();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
        await expectNoSidewaysScroll(page);
      });

      test(`list dialogs at ${String(width)} px fit on screen`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        await page.goto('/lists/films');
        await page.getByRole('button', { name: /^Open full details for Alien/ }).click();
        const details = page.getByRole('dialog', { name: 'Alien' });
        await expect(details.getByText('Your score')).toBeVisible();
        const box = await details.boundingBox();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
        await expectNoSidewaysScroll(page);
        await details.getByRole('button', { name: 'Close' }).click();
        await page.getByRole('button', { name: 'Rate one by one' }).click();
        await expect(page.getByRole('dialog', { name: 'Rate one by one' })).toBeVisible();
        await expectNoSidewaysScroll(page);
      });

      test(`movie details in rate-one-by-one at ${String(width)} px fit on screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin, { movieDetails: true });
        await page.goto('/lists/films');
        await page.getByRole('button', { name: 'Rate one by one' }).click();
        const stage = page.getByRole('dialog', { name: 'Rate one by one' });
        await expect(stage.getByText(/A blade runner must pursue replicants/)).toBeVisible();
        await expect(stage.getByText('Ridley Scott')).toBeVisible();
        await expect(stage.getByText('Harrison Ford, Rutger Hauer')).toBeVisible();
        const box = await stage.boundingBox();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
        await expectNoSidewaysScroll(page);
      });

      test(`compact movie standings at ${String(width)} px fit and open details`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin, { movieStandings: true });
        for (const path of ['/lists/films', '/lists/films/results']) {
          await page.goto(path);
          if (path === '/lists/films') await page.getByRole('tab', { name: 'Standings' }).click();
          const row = page.locator('.ranking__row').filter({ hasText: 'Blade Runner' });
          await expect(row.locator('.ranking__metadata')).toHaveText(
            '1982 · Directed by Ridley Scott',
          );
          await expect(row.locator('img')).toBeVisible();
          expect(
            await row.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
          ).toBeGreaterThan(0);
          await expectNoSidewaysScroll(page);
          for (const trigger of [
            row.getByRole('button', { name: 'Blade Runner', exact: true }),
            row.getByRole('button', { name: 'Open full details for Blade Runner' }),
          ]) {
            await trigger.click();
            const details = page.getByRole('dialog', { name: 'Blade Runner' });
            await expect(details.getByText('Ridley Scott')).toBeVisible();
            await expect(details.getByText(/A blade runner must pursue replicants/)).toBeVisible();
            await expectNoSidewaysScroll(page);
            await details.getByRole('button', { name: 'Close', exact: true }).click();
            await expect(trigger).toBeFocused();
          }
        }
      });

      test(`movie nomination review at ${String(width)} px fits on screen`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin, { movieSearch: true });
        await page.goto('/lists/films');
        await page.getByRole('tab', { name: 'Nominate' }).click();
        await page.getByRole('searchbox', { name: 'Search' }).fill('blade');
        const reviewButton = page.getByRole('button', { name: 'Review' });
        await expect(reviewButton).toBeVisible();
        await expect(page.getByText(/A blade runner must pursue replicants/)).toBeVisible();
        await reviewButton.click();
        const review = page.getByRole('dialog', { name: 'Blade Runner' });
        await expect(review.getByText(/line between human and machine/)).toBeVisible();
        await expect(review.getByText('Ridley Scott')).toBeVisible();
        await expect(review.getByText('Harrison Ford, Rutger Hauer')).toBeVisible();
        await expect(review.getByText('Ridley Scott')).toBeVisible();
        await expect(review.getByText('Harrison Ford, Rutger Hauer')).toBeVisible();
        const box = await review.boundingBox();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
        await expectNoSidewaysScroll(page);
      });

      test(`withdrawing a nomination at ${String(width)} px fits and refreshes the list`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        await page.goto('/lists/films');
        await page.getByRole('button', { name: /^Open full details for Dr\. Strangelove/ }).click();
        await page.getByRole('button', { name: 'Withdraw nomination', exact: true }).click();
        const confirmation = page.getByRole('dialog', { name: /^Withdraw Dr\. Strangelove/ });
        await expect(confirmation).toBeVisible();
        await expect(confirmation.getByRole('button', { name: 'Cancel' })).toBeFocused();
        const box = await confirmation.boundingBox();
        expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= width).toBe(true);
        await expectNoSidewaysScroll(page);
        await confirmation.getByRole('button', { name: 'Cancel' }).click();
        await page.getByRole('button', { name: 'Withdraw nomination', exact: true }).click();
        await confirmation
          .getByRole('button', { name: 'Withdraw nomination', exact: true })
          .click();
        await expect(confirmation).not.toBeVisible();
        await expect(
          page.getByRole('button', { name: /^Open full details for Dr\. Strangelove/ }),
        ).toHaveCount(0);
        await expect(page.getByRole('tab', { name: 'Rate 2', exact: true })).toBeVisible();
        await expectNoSidewaysScroll(page);
      });

      for (const path of memberRoutes) {
        test(`${path} at ${String(width)} px fits`, async ({ page }) => {
          await page.setViewportSize({ width, height: 800 });
          await fakeApi(page, admin);
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
          await expectNoSidewaysScroll(page);
        });
      }
    }
  });
}

const expectNoSidewaysScroll = async (page: Page) => {
  const overflow = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    const culprits = [...document.querySelectorAll('body *')]
      .filter((element) => element.getBoundingClientRect().right > width + 1)
      .slice(0, 5)
      .map((element) => `${element.tagName.toLowerCase()}.${element.className}`);
    return { extra: document.documentElement.scrollWidth - width, culprits };
  });
  // Culprits only explain a failure: elements inside a scrolling strip may extend past the edge.
  expect(overflow.extra, `page scrolls sideways; widest: ${overflow.culprits.join(', ')}`).toBe(0);
};
