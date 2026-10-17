import { expect, test } from '@playwright/test';
import { admin, fakeApi, list } from './fake-api.ts';
import type { EditListRequest, ListDetailDto } from '../../src/server/http/contracts.ts';

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`admin publishing in ${colorScheme} mode`, () => {
    test.use({ colorScheme });
    for (const width of [320, 375, 1280]) {
      test(`new list controls and next step stay clear at ${String(width)}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 850 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await fakeApi(page, admin);
        await page.goto('/admin/lists/new');
        const questionStyle = await page
          .getByText('When can members see the results?', { exact: true })
          .evaluate((el) => {
            const style = getComputedStyle(el);
            return { size: style.fontSize, weight: style.fontWeight, color: style.color };
          });
        const labelStyle = await page.locator('label[for="min-votes"]').evaluate((el) => {
          const style = getComputedStyle(el);
          return { size: style.fontSize, weight: style.fontWeight, color: style.color };
        });
        expect(questionStyle).toEqual(labelStyle);
        const guide = page
          .getByRole('link', { name: 'Admin guide and FAQ (opens in a new tab)', exact: true })
          .first();
        await expect(guide).toHaveAttribute('target', '_blank');
        await expect(guide).toHaveAttribute('rel', 'noopener noreferrer');
        await expect(guide.locator('.external-link-icon')).toBeVisible();
        const radios = page.locator('input[name="source"]');
        const first = await radios.first().boundingBox();
        const freeText = await page.locator('input[value="freeform"]').boundingBox();
        expect(first).not.toBeNull();
        expect(freeText).not.toBeNull();
        expect(freeText?.width).toBe(first?.width);
        expect(freeText?.width).toBeGreaterThanOrEqual(20);
        const choices = page.locator('.source-choice');
        let previousBottom: number | null = null;
        for (const choice of await choices.all()) {
          const box = await choice.boundingBox();
          expect(box).not.toBeNull();
          if (box === null) throw new Error('Item choice is not visible');
          if (previousBottom !== null) expect(box.y - previousBottom).toBeGreaterThanOrEqual(12);
          previousBottom = box.y + box.height;
          const radio = await choice.locator('input').boundingBox();
          expect(radio?.y).toBeGreaterThan(box.y);
          expect((radio?.y ?? 0) + (radio?.height ?? 0)).toBeLessThan(box.y + box.height);
        }
        await choices.filter({ has: page.locator('input[value="freeform"]') }).click();
        await expect(page.locator('input[value="freeform"]')).toBeChecked();
        await expect(page.getByLabel('Unlimited', { exact: true })).toBeChecked();
        await expect(page.locator('.editor-next-step')).toBeVisible();
        expect(
          await page
            .locator('.editor-next-step')
            .evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        ).toBeGreaterThan(16);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      });

      test(`draft steps allow going back without losing choices at ${String(width)}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        const draft = {
          ...list,
          title: 'Community picks',
          slug: 'community-picks',
          lifecycle: 'draft',
          schedule: null,
          draftSchedule: null,
          entries: [],
          settingsVersion: 0,
          itemSourceEditable: true,
          itemSource: { kind: 'freeform' },
          maxNominationsPerMember: null,
          ranking: { strategy: 'bayesian', minVotes: 2 },
          scoreVisibility: 'private',
        };
        let writes = 0;
        await page.route('**/api/lists', async (route) => {
          expect(route.request().method()).toBe('POST');
          writes += 1;
          await route.fulfill({ status: 201, json: draft });
        });
        await page.route('**/api/lists/community-picks', (route) => route.fulfill({ json: draft }));
        await page.goto('/admin/lists/new');
        await page.getByLabel('Title', { exact: true }).fill('Community picks');
        await page.locator('input[value="freeform"]').check();
        await page.getByRole('button', { name: 'Create draft', exact: true }).click();
        await expect(
          page.getByRole('heading', {
            name: 'Draft saved. Next, choose when participation opens.',
          }),
        ).toBeFocused();
        await expect(page.locator('#editor-basics')).not.toBeVisible();
        await expect(page.locator('#editor-schedule')).toBeVisible();
        await page.locator('input[name="opens"][value="at"]').check();
        await page.locator('#opens').fill('2099-07-01T18:00');
        await page.getByRole('button', { name: 'Edit setup', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Step 1: Edit setup' })).toBeFocused();
        await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Community picks');
        await page.locator('#min-votes').fill('4');
        await page.locator('[data-review-publish]').click();
        await expect(page.locator('#opens')).toHaveValue('2099-07-01T18:00');
        await page.getByRole('button', { name: 'Continue to review', exact: true }).click();
        const review = page.getByRole('dialog', { name: 'Review before publishing' });
        await expect(review).toBeVisible();
        await page.getByRole('button', { name: 'Back to timing', exact: true }).click();
        await page.getByRole('button', { name: '1. Set up', exact: true }).click();
        await expect(page.locator('#min-votes')).toHaveValue('4');
        expect(writes).toBe(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
      });

      test(`admin activity history fits and stays separate at ${String(width)}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        await page.route('**/api/lists/list-1/activity', (route) =>
          route.fulfill({
            json: {
              events: [
                {
                  id: '2',
                  action: 'entry-set-aside',
                  at: '2026-10-17T12:00:00Z',
                  adminName: 'An admin with a long display name',
                  entryTitle: 'A'.repeat(180),
                  changes: [],
                },
                {
                  id: '1',
                  action: 'settings-edited',
                  at: '2025-01-01T12:00:00Z',
                  adminName: null,
                  entryTitle: null,
                  changes: [
                    { field: 'maxNominationsPerMember', before: '3', after: 'null' },
                    { field: 'description', before: null, after: null },
                  ],
                },
              ],
            },
          }),
        );
        await page.goto('/admin/lists/films');
        const activity = page.getByRole('region', { name: 'List activity', exact: true });
        await expect(activity).toContainText('Admin only');
        await activity.getByRole('button', { name: 'Show activity', exact: true }).click();
        await expect(activity).toContainText('An admin with a long display name');
        await expect(activity).toContainText('Admin identity removed');
        await expect(activity).toContainText('3 → Unlimited');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await activity.getByRole('button', { name: 'Hide activity', exact: true }).click();
        await expect(
          activity.getByRole('button', { name: 'Show activity', exact: true }),
        ).toBeVisible();
      });

      test(`stale editor comparison retains input and fits at ${String(width)}px`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 850 });
        await fakeApi(page, admin);
        let shared: ListDetailDto = {
          ...list,
          lifecycle: 'draft',
          schedule: null,
          settingsVersion: 0,
          entries: [],
          itemSourceEditable: true,
          scoreVisibility: 'private',
        };
        let saves = 0;
        await page.route('**/api/lists/films', (route) => route.fulfill({ json: shared }));
        await page.route('**/api/lists/list-1', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({ json: shared });
            return;
          }
          saves += 1;
          const body = route.request().postDataJSON() as EditListRequest;
          if (body.expectedSettingsVersion !== shared.settingsVersion) {
            await route.fulfill({
              status: 409,
              json: {
                error: {
                  code: 'lists.settings-changed',
                  message: 'Settings changed since you opened the list.',
                },
              },
            });
            return;
          }
          shared = {
            ...shared,
            description: body.description ?? shared.description,
            settingsVersion: (shared.settingsVersion ?? 0) + 1,
          };
          await route.fulfill({ json: shared });
        });
        await page.goto('/admin/lists/films');
        await page.getByRole('button', { name: 'Edit setup', exact: true }).click();
        await page.getByLabel('Description', { exact: true }).fill('My unsaved description');
        shared = { ...shared, settingsVersion: 1, description: `Other admin: ${'x'.repeat(180)}` };
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(
          page.getByRole('heading', { name: 'Compare before continuing' }),
        ).toBeFocused();
        await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
          'My unsaved description',
        );
        await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Compare latest settings', exact: true }).click();
        const comparison = page.getByRole('region', { name: 'Compare before continuing' });
        await expect(comparison).toContainText('Other admin:');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          width,
        );
        await page.reload();
        await expect(comparison).toContainText('My unsaved description');
        await expect(page.getByLabel('Description', { exact: true })).toHaveValue(
          'My unsaved description',
        );
        await page.getByRole('button', { name: 'Keep my input after comparison' }).click();
        expect(saves).toBe(1);
        await page.getByRole('button', { name: 'Save draft', exact: true }).click();
        await expect(page.getByText('Saved.', { exact: true }).last()).toBeVisible();
        expect(shared.description).toBe('My unsaved description');
        expect(shared.settingsVersion).toBe(2);
      });

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
        await page.getByRole('button', { name: 'Edit setup', exact: true }).click();
        await page.getByRole('radio', { name: /^Named:/ }).check();
        await page.locator('[data-review-publish]').click();
        await page.getByRole('button', { name: 'Continue to review', exact: true }).click();
        const review = page.getByRole('dialog', { name: 'Review before publishing' });
        await expect(review).toBeVisible();
        await expect(review.getByRole('button', { name: 'Back to timing' })).toBeFocused();
        await expect(review).toContainText('What becomes fixed');
        await fits();
        expect(saved).toBe(false);
        await review.getByRole('button', { name: 'Back to timing' }).click();
        await expect(review).not.toBeVisible();
        expect(published).toBe(false);
        await page.getByRole('button', { name: 'Continue to review', exact: true }).click();
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
