import { expect, test, type Page } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';

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
  '/admin/activity',
  '/admin/insights',
  '/admin/insights?list=films',
  '/about',
  '/privacy',
  '/no-such-page',
];

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`${colorScheme} mode`, () => {
    test.use({ colorScheme });

    for (const width of widths) {
      test(`pending entry deletion and withdrawn management at ${String(width)} px fit`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        const withdrawn = list.entries[1];
        if (withdrawn === undefined) throw new Error('fixture');
        let pending = false;
        await page.route('**/api/lists/films', (route) =>
          route.fulfill({
            json: {
              ...list,
              entries: list.entries.filter((entry) => entry.id !== withdrawn.id),
              withdrawnEntries: [withdrawn],
              participationPaused: pending,
              ...(pending
                ? {
                    entryDeletion: {
                      entryId: withdrawn.id,
                      token: withdrawn.deletionToken,
                      title: withdrawn.item.title,
                    },
                    viewer: { canParticipate: false, canNominate: false, nominationsUsed: 0 },
                  }
                : {}),
            },
          }),
        );
        await page.goto('/lists/films');
        await page.getByText('Withdrawn nominations (Admin)', { exact: true }).click();
        await expectNoSidewaysScroll(page);
        await page.getByRole('button', { name: /^Permanently delete withdrawn Dr/ }).click();
        await expect(page.getByRole('dialog', { name: /^Permanently delete Dr/ })).toBeVisible();
        await expectNoSidewaysScroll(page);
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        pending = true;
        await page.reload();
        await expect(page.getByText(/Nominations and scores are temporarily paused/)).toBeVisible();
        await page.getByRole('button', { name: 'Retry entry deletion...', exact: true }).click();
        await expect(page.getByRole('dialog', { name: /^Permanently delete Dr/ })).toBeVisible();
        await expectNoSidewaysScroll(page);
      });

      test(`entry deletion confirmation at ${String(width)} px fits and requires the title`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        let removed = false;
        await page.route('**/api/lists/list-1/entries/delete', async (route) => {
          expect(route.request().postDataJSON()).toEqual({
            entryId: 'b',
            token: 'entry-b',
            confirmation: list.entries[1]?.item.title,
          });
          removed = true;
          await route.fulfill({ status: 204 });
        });
        await page.route('**/api/lists/films', (route) =>
          route.fulfill({
            json: {
              ...list,
              entries: removed ? list.entries.filter((entry) => entry.id !== 'b') : list.entries,
            },
          }),
        );
        await page.goto('/lists/films');
        await page.getByRole('button', { name: /^Open full details for Dr/ }).click();
        await page.getByRole('button', { name: /^Permanently delete Dr/ }).click();
        const dialog = page.getByRole('dialog', { name: /^Permanently delete Dr/ });
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
        const confirm = dialog.getByRole('button', {
          name: 'Delete entry permanently',
          exact: true,
        });
        await expect(confirm).toBeDisabled();
        await dialog.getByRole('textbox').fill('wrong');
        await expect(confirm).toBeDisabled();
        await dialog.getByRole('textbox').fill(list.entries[1]?.item.title ?? '');
        await expectNoSidewaysScroll(page);
        await confirm.click();
        await expect(dialog).not.toBeVisible();
        await expect(page.getByRole('button', { name: /^Open full details for Dr/ })).toHaveCount(
          0,
        );
      });

      test(`permanent deletion confirmation at ${String(width)} px fits and requires the slug`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        await page.route('**/api/lists/list-1', async (route) => {
          expect(route.request().method()).toBe('DELETE');
          expect(route.request().postDataJSON()).toEqual({ confirmation: 'films' });
          await route.fulfill({ status: 204 });
        });
        await page.goto('/admin/lists/films');
        await page.getByRole('button', { name: 'Delete list…', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: /^Permanently delete/ });
        await expect(dialog).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
        const confirm = dialog.getByRole('button', { name: 'Delete permanently', exact: true });
        await expect(confirm).toBeDisabled();
        await expect(dialog.getByText(/including withdrawn/)).toBeVisible();
        await dialog.getByRole('textbox').fill('wrong');
        await expect(confirm).toBeDisabled();
        await dialog.getByRole('textbox').fill('films');
        await expect(confirm).toBeEnabled();
        await expectNoSidewaysScroll(page);
        await confirm.click();
        await expect(page).toHaveURL('/?deleted=1');
        await expect(page.getByRole('status').filter({ hasText: 'List deleted' })).toBeVisible();
      });

      test(`unused list source controls at ${String(width)} px fit on screen`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin);
        await page.route('**/api/lists/films', (route) =>
          route.fulfill({ json: { ...list, entries: [], itemSourceEditable: true } }),
        );
        await page.goto('/admin/lists/films');
        await expect(page.locator('#editor-items input[value=preset]')).toBeEnabled();
        await expect(page.locator('#editor-rating input').first()).toBeDisabled();
        await page.getByRole('radio', { name: /^Preset list \(CSV\)/ }).check();
        await expect(page.getByRole('radio', { name: /^Rate them all/ })).toBeDisabled();
        await expectNoSidewaysScroll(page);
      });

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

      test(`TV series review, rating and results at ${String(width)} px fit on screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin, { tvSeries: true });
        await page.goto('/lists/films');
        await expect(page.getByText('TV series data and artwork from')).toBeVisible();
        await page.getByRole('button', { name: 'Rate one by one' }).click();
        const stage = page.getByRole('dialog', { name: 'Rate one by one' });
        await expect(stage.getByText('Created by')).toBeVisible();
        await expect(stage.getByText(/A series synopsis/)).toBeVisible();
        const image = stage.locator('img');
        await expect(image).toBeVisible();
        expect(
          await image.evaluate((element: HTMLImageElement) => element.naturalWidth),
        ).toBeGreaterThan(0);
        await expectNoSidewaysScroll(page);
        await stage.getByRole('button', { name: 'Stop' }).click();
        await page.getByRole('tab', { name: 'Nominate' }).click();
        await page.getByRole('searchbox', { name: 'Search' }).fill('series');
        await page.getByRole('button', { name: 'Review', exact: true }).click();
        const review = page.getByRole('dialog', {
          name: 'A Television Series With A Very Long Title',
        });
        await expect(review.getByText('Created by')).toBeVisible();
        await expect(
          review.getByText('An Actor With A Long Name, Another Actor With A Long Name'),
        ).toBeVisible();
        if (width < 640) {
          const posterBox = await review.locator('img').boundingBox();
          const infoBox = await review.locator('.nomination-review__info').boundingBox();
          expect(infoBox?.width).toBeGreaterThan(width * 0.7);
          expect(infoBox?.y).toBeGreaterThanOrEqual((posterBox?.y ?? 0) + (posterBox?.height ?? 0));
        }
        await expectNoSidewaysScroll(page);
        await review.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.goto('/lists/films/results');
        await expect(page.getByText('TV series data and artwork from')).toBeVisible();
        await expectNoSidewaysScroll(page);
      });

      test(`IGDB game review, rating and results at ${String(width)} px fit on screen`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await fakeApi(page, admin, { games: true });
        await page.goto('/lists/films');
        await expect(page.getByText('Games (IGDB)')).toBeVisible();
        await page.getByRole('button', { name: 'Rate one by one' }).click();
        const stage = page.getByRole('dialog', { name: 'Rate one by one' });
        await expect(stage.getByText('Developer', { exact: true })).toBeVisible();
        await expect(stage.getByText('Publisher', { exact: true })).toBeVisible();
        await expect(stage.getByText(/A game synopsis/)).toBeVisible();
        expect(
          await stage.locator('img').evaluate((image: HTMLImageElement) => image.naturalWidth),
        ).toBeGreaterThan(0);
        await expectNoSidewaysScroll(page);
        await stage.getByRole('button', { name: 'Stop' }).click();
        await page.getByRole('tab', { name: 'Nominate' }).click();
        await page.getByRole('searchbox', { name: 'Search' }).fill('game');
        await expect(page.locator('.result')).toContainText('A Development Studio');
        await page.getByRole('button', { name: 'Review', exact: true }).click();
        const review = page.getByRole('dialog', {
          name: 'A Game With A Very Long Title For A Small Screen',
        });
        await expect(review.getByText('Developer', { exact: true })).toBeVisible();
        await expect(review.getByText('Publisher', { exact: true })).toBeVisible();
        await expectNoSidewaysScroll(page);
        await review.getByRole('button', { name: 'Cancel', exact: true }).click();
        await page.goto('/lists/films/results');
        await expect(page.locator('.podium')).toContainText('A Development Studio');
        await page.locator('.podium').getByRole('button').first().click();
        const details = page.getByRole('dialog', {
          name: 'A Game With A Very Long Title For A Small Screen',
        });
        await expect(details.getByText(/A game synopsis/)).toBeVisible();
        await expect(details.getByText('Publisher', { exact: true })).toBeVisible();
        await expectNoSidewaysScroll(page);
        await details.getByRole('button', { name: 'Close', exact: true }).click();
        const attribution = page
          .getByRole('link', { name: 'IGDB (opens in a new tab)', exact: true })
          .first();
        await expect(attribution).toBeVisible();
        await expect(attribution).toHaveAttribute('target', '_blank');
        await expect(attribution.locator('.external-link-icon')).toBeVisible();
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
