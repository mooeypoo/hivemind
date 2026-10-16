import { expect, test, type Page } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';

const fits = async (page: Page) => {
  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.viewport);
};

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`set-aside entries in ${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`classification, independent rankings and restoration fit at ${String(width)}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        const pick = list.entries[0];
        if (pick === undefined) throw new Error('fixture');
        let reason: string | null = null;
        let deleted = false;
        const detail = () => ({
          ...list,
          entries: list.entries
            .filter((entry) => !deleted || entry.id !== pick.id)
            .map((entry) => ({
              ...entry,
              setAsideReason: entry.id === pick.id ? reason : null,
            })),
        });
        const rows = list.entries.map((entry, index) => ({
          entryId: entry.id,
          item: entry.item,
          rank: index + 1,
          score: 9 - index,
          votes: 4,
          provisional: false,
          votesNeeded: 0,
        }));
        await page.route('**/api/lists/films', (route) => route.fulfill({ json: detail() }));
        await page.route('**/api/lists/films/leaderboard', (route) =>
          route.fulfill({
            json: {
              hidden: false,
              computedAt: new Date().toISOString(),
              minVotes: 3,
              rows: rows.filter((row) => !deleted || row.entryId !== pick.id),
              ...(reason === null
                ? {}
                : {
                    groups: {
                      main: rows.slice(1).map((row, index) => ({ ...row, rank: index + 1 })),
                      setAside: rows.slice(0, 1),
                    },
                  }),
            },
          }),
        );
        await page.route('**/api/lists/list-1/entries/set-aside', async (route) => {
          const body: unknown = route.request().postDataJSON();
          expect(body).toMatchObject({
            entryId: pick.id,
            token: pick.deletionToken,
            expectedReason: reason,
          });
          if (
            typeof body !== 'object' ||
            body === null ||
            !('reason' in body) ||
            (body.reason !== null && typeof body.reason !== 'string')
          )
            throw new Error('Invalid request');
          reason = body.reason;
          await route.fulfill({ json: { ...pick, setAsideReason: reason } });
        });
        await page.route('**/api/lists/list-1/entries/delete', async (route) => {
          expect(route.request().postDataJSON()).toEqual({
            entryId: pick.id,
            token: pick.deletionToken,
            confirmation: pick.item.title,
          });
          deleted = true;
          await route.fulfill({ status: 204 });
        });
        await page.goto('/lists/films?tab=standings');
        await page
          .locator('.list-standings')
          .getByRole('button', { name: `Open full details for ${pick.item.title}`, exact: true })
          .click();
        await page.getByRole('button', { name: 'Set aside...', exact: true }).click();
        const editor = page.getByRole('dialog', {
          name: `Set aside: ${pick.item.title}`,
          exact: true,
        });
        await expect(editor).toBeVisible();
        const explanation = 'Outside this list’s criteria. ' + 'x'.repeat(450);
        await editor.getByRole('textbox', { name: 'Reason shown to members' }).fill(explanation);
        await fits(page);
        await editor.getByRole('button', { name: 'Set aside', exact: true }).click();
        await expect(editor).not.toBeVisible();
        await expect(page.locator('.set-aside-ranking .set-aside-notice__reason')).toHaveCount(0);
        await page.locator('.set-aside-ranking .set-aside-notice__why').click();
        const details = page.getByRole('dialog', { name: pick.item.title, exact: true });
        await expect(details.locator('.set-aside-notice__reason')).toHaveText(explanation);
        await fits(page);
        await details.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(page.locator('.set-aside-ranking')).toContainText(pick.item.title);
        await expect(page.locator('.set-aside-ranking .podium')).toHaveCount(0);
        await fits(page);
        const options = page.locator('.ranking-options');
        await expect(options).not.toHaveAttribute('open');
        await expect(
          page.getByRole('radio', { name: 'Combine ranking', exact: true }),
        ).toBeHidden();
        await options.locator('summary').focus();
        await page.keyboard.press('Enter');
        await expect(options).toHaveAttribute('open');
        await fits(page);
        await page.getByRole('radio', { name: 'Combine ranking', exact: true }).check();
        await expect(page.locator('.set-aside-ranking')).toHaveCount(0);
        await expect(page.locator('.podium .set-aside-notice__reason')).toHaveCount(0);
        const why = page.locator('.podium .set-aside-notice__why');
        await why.focus();
        await page.keyboard.press('Enter');
        await expect(details.locator('.set-aside-notice__reason')).toHaveText(explanation);
        await fits(page);
        await details.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(why).toBeFocused();
        await options.locator('summary').click();
        await expect(options).not.toHaveAttribute('open');
        await expect(page.locator('.set-aside-ranking')).toHaveCount(0);
        await expect(options.locator('summary')).toHaveText('Ranking view: Combine ranking');
        await fits(page);
        await page.getByRole('link', { name: 'Full results', exact: true }).click();
        await expect(page).toHaveURL('/lists/films/results');
        await expect(options.locator('summary')).toHaveText('Ranking view: Separate rankings');
        await expect(options).not.toHaveAttribute('open');
        await options.locator('summary').click();
        await expect(
          page.getByRole('radio', { name: 'Separate rankings', exact: true }),
        ).toBeChecked();
        await expect(page.locator('.set-aside-ranking .set-aside-notice__reason')).toHaveCount(0);
        await fits(page);
        await page
          .locator('.set-aside-ranking')
          .getByRole('button', { name: `Why was ${pick.item.title} set aside?`, exact: true })
          .click();
        await expect(page.getByRole('dialog').filter({ hasText: 'Set-aside rank' })).toBeVisible();
        await expect(details.locator('.set-aside-notice__reason')).toHaveText(explanation);
        await fits(page);
        await page.getByRole('button', { name: 'Edit set-aside status...', exact: true }).click();
        await page.getByRole('button', { name: 'Return to main ranking', exact: true }).click();
        await expect(page.locator('.set-aside-ranking')).toHaveCount(0);
        await expect(
          page.getByRole('radio', { name: 'Separate rankings', exact: true }),
        ).toHaveCount(0);
        await page
          .getByRole('button', { name: `Open full details for ${pick.item.title}`, exact: true })
          .click();
        await page
          .getByRole('button', { name: `Permanently delete ${pick.item.title}`, exact: true })
          .click();
        const confirmation = page.getByRole('dialog', {
          name: `Permanently delete ${pick.item.title}?`,
          exact: true,
        });
        await expect(confirmation).toBeVisible();
        await expect(
          confirmation.getByRole('button', { name: 'Delete entry permanently' }),
        ).toBeDisabled();
        await fits(page);
        await confirmation.getByRole('textbox').fill(pick.item.title);
        await confirmation.getByRole('button', { name: 'Delete entry permanently' }).click();
        await expect(confirmation).not.toBeVisible();
        await expect(page.getByRole('button', { name: pick.item.title, exact: true })).toHaveCount(
          0,
        );
        await fits(page);
      });
    }
  });
}
