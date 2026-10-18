import { expect, test } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`activity log in ${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`filters, changes and pagination fit at ${String(width)}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        const second = { id: 'list-2', title: 'Another list', slug: 'another' };
        await page.route('**/api/admin/activity**', async (route) => {
          const query = new URL(route.request().url()).searchParams;
          const selected = query.get('list') === second.id ? second : list;
          await route.fulfill({
            json: {
              lists: [list, second].map(({ id, title, slug }) => ({ id, title, slug })),
              events: [
                {
                  id: 'event-1',
                  action: 'settings-edited',
                  at: '2026-01-02T12:00:00Z',
                  adminName: query.has('cursor') ? null : admin.displayName,
                  entryTitle: 'AnUnbrokenEntryTitle'.repeat(12),
                  list: { id: selected.id, title: selected.title, slug: selected.slug },
                  changes: [{ field: 'maxNominationsPerMember', before: '3', after: 'null' }],
                },
              ],
              nextCursor: query.has('cursor') ? null : 'older',
            },
          });
        });
        await page.goto('/admin/activity');
        await expect(
          page.getByRole('heading', { name: 'Activity log', exact: true }),
        ).toBeVisible();
        await expect(page.locator('.activity__list')).toHaveText(list.title);
        await page.getByText('View changes', { exact: true }).click();
        await expect(page.locator('.activity__changes')).toBeVisible();
        await expect(page.locator('.activity__changes')).toContainText('3 → Unlimited');
        await page.getByRole('button', { name: 'Older activity', exact: true }).click();
        await expect(page.getByText('Admin identity removed', { exact: true })).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'Older activity', exact: true }),
        ).toBeDisabled();
        await page.getByLabel('List', { exact: true }).selectOption(second.id);
        await expect(page).toHaveURL(/list=list-2/);
        await expect(page.locator('.activity__list')).toHaveText(second.title);
        await expect(
          page.getByRole('button', { name: 'Newer activity', exact: true }),
        ).toBeDisabled();
        await page.goBack();
        await expect(page.locator('.activity__list')).toHaveText(list.title);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await expect(page.locator('[style]')).toHaveCount(0);
      });
    }
  });
}
