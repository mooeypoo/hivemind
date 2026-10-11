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
  expect(overflow, 'page is wider than the viewport').toEqual({ extra: 0, culprits: [] });
};
