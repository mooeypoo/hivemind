import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { App } from '../../composition.ts';
import type {
  EntryDto,
  ListDetailDto,
  ListDto,
  ListsDto,
  PresetImportedDto,
} from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  type Harness,
} from '../testing/harness.ts';
import {
  archiveList,
  closeVoting,
  createList,
  deleteList,
  editList,
  getList,
  listLists,
  nominate,
  scheduleList,
  withdrawNomination,
} from './lists.ts';
import { changeScore, getMyBallot, getPublicScores } from './voting.ts';
import { getLeaderboard } from './ranking.ts';
import { exportBackup } from './backup.ts';
import { importPreset } from './catalog.ts';

let h: Harness;
let admin: string;
let member: string;
beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID });
  member = await signInAs(h, { id: '900000000000000010' });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await h.close();
});
type Endpoint = (request: Request, app: App) => Promise<Response>;
const call = (
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
) =>
  endpoint(
    request(method, path, {
      origin: SITE_URL,
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
const create = async (slug = 'mistake') => {
  const response = await call(createList, 'POST', '/api/lists', admin, {
    title: 'A mistake',
    slug,
    itemSource: { kind: 'freeform' },
  });
  expect(response.status).toBe(201);
  return (await response.json()) as ListDto;
};
const publish = async (id: string, opensAt = '2026-01-01T00:00:00.000Z') => {
  const response = await call(scheduleList, 'POST', `/api/lists/${id}/schedule`, admin, {
    opensAt,
    nominationsCloseAt: null,
    closesAt: null,
  });
  expect(response.status).toBe(200);
};
const remove = (id: string, confirmation = 'mistake', session: string | null = admin) =>
  call(deleteList, 'DELETE', `/api/lists/${id}`, session, { confirmation });

describe('DELETE /api/lists/:list', () => {
  test.each(['draft', 'scheduled', 'open', 'closed', 'archived'])(
    'permanently removes a %s list and releases its slug',
    async (lifecycle) => {
      const list = await create();
      if (lifecycle !== 'draft')
        await publish(list.id, lifecycle === 'scheduled' ? '2026-02-01T00:00:00.000Z' : undefined);
      if (lifecycle === 'closed') {
        expect((await call(closeVoting, 'POST', `/api/lists/${list.id}/close`, admin)).status).toBe(
          200,
        );
      }
      if (lifecycle === 'archived') {
        expect(
          (await call(archiveList, 'POST', `/api/lists/${list.id}/archive`, admin)).status,
        ).toBe(200);
      }
      const deleted = await remove(list.id);
      expect(deleted.status).toBe(204);
      expect(deleted.headers.get('Cache-Control')).toBe('no-store');
      expect((await call(getList, 'GET', `/api/lists/${list.id}`, admin)).status).toBe(404);
      const next = await create();
      expect(next.id).not.toBe(list.id);
      expect((await remove(list.id)).status).toBe(204);
      const bySlug = await call(getList, 'GET', '/api/lists/mistake', admin);
      expect(((await bySlug.json()) as ListDetailDto).id).toBe(next.id);
    },
  );

  test('requires Admin authorization, same origin, strict input, immutable ID and typed slug', async () => {
    const list = await create();
    expect((await remove(list.id, 'mistake', null)).status).toBe(401);
    expect((await remove(list.id, 'mistake', member)).status).toBe(403);
    expect((await remove(list.id, 'wrong')).status).toBe(422);
    expect((await remove('mistake')).status).toBe(422);
    const foreign = await deleteList(
      request('DELETE', `/api/lists/${list.id}`, {
        cookies: { [SESSION_COOKIE]: admin },
        origin: 'https://elsewhere.example',
        body: { confirmation: 'mistake' },
      }),
      h.app,
    );
    expect(foreign.status).toBe(403);
    expect(
      (
        await call(deleteList, 'DELETE', `/api/lists/${list.id}`, admin, {
          confirmation: 'mistake',
          unexpected: true,
        })
      ).status,
    ).toBe(422);
    const detail = await call(getList, 'GET', `/api/lists/${list.id}`, admin);
    expect(((await detail.json()) as ListDetailDto).deleting).toBe(false);
  });

  test('erases active and withdrawn entries, scores, ledgers and cached ranking without touching other data', async () => {
    const preset = await call(importPreset, 'POST', '/api/catalog/presets', admin, {
      csv: 'title\nKeep me',
    });
    expect(preset.status).toBe(201);
    const imported = (await preset.json()) as PresetImportedDto;
    const list = await create();
    const other = await create('keep');
    await publish(list.id);
    await publish(other.id);
    for (const [id, title] of [
      [list.id, 'Active'],
      [list.id, 'Withdrawn'],
      [other.id, 'Keep me'],
    ] as const) {
      const response = await call(nominate, 'POST', `/api/lists/${id}/entries`, member, { title });
      expect(response.status).toBe(201);
      const entry = (await response.json()) as EntryDto;
      expect(
        (
          await call(changeScore, 'PUT', `/api/lists/${id}/ballot`, member, {
            entryId: entry.id,
            score: 8,
          })
        ).status,
      ).toBe(200);
      if (title === 'Withdrawn') {
        expect(
          (
            await call(withdrawNomination, 'POST', `/api/lists/${id}/entries/withdraw`, member, {
              entryId: entry.id,
              token: entry.withdrawalToken,
            })
          ).status,
        ).toBe(204);
      }
    }
    expect(
      (await call(getLeaderboard, 'GET', `/api/lists/${list.id}/leaderboard`, member)).status,
    ).toBe(200);
    expect((await h.store('ranking').list()).blobs.length).toBeGreaterThan(0);
    expect((await remove(list.id)).status).toBe(204);
    for (const prefix of [`entry/${list.id}/`, `entry-write/${list.id}/`]) {
      expect((await h.store('lists').list({ prefix })).blobs).toEqual([]);
    }
    expect(
      (await h.store('lists').list({ prefix: 'nominator/' })).blobs.every(
        (blob) => !blob.key.endsWith(`/${list.id}`),
      ),
    ).toBe(true);
    expect((await h.store('voting').list({ prefix: `ballot/${list.id}/` })).blobs).toEqual([]);
    expect(await h.store('ranking').get(`leaderboard/${list.id}`)).toBeNull();
    expect(await h.store('lists').get(`list/${list.id}`, { type: 'json' })).toEqual({
      v: 3,
      deleted: true,
    });
    expect(await h.store('catalog').get(`preset/${imported.presetId}`)).not.toBeNull();
    expect((await call(getMyBallot, 'GET', `/api/lists/${other.id}/ballot`, member)).status).toBe(
      200,
    );
    expect((await h.store('identity').list({ prefix: 'member/' })).blobs).toHaveLength(2);
    const replacement = await create();
    await publish(replacement.id);
    const detail = await call(getList, 'GET', '/api/lists/mistake', member);
    expect(((await detail.json()) as ListDetailDto).entries).toEqual([]);
    expect((await h.store('voting').list({ prefix: `ballot/${replacement.id}/` })).blobs).toEqual(
      [],
    );
  });

  test('an interrupted cleanup stays pending and retains the slug until a retry succeeds', async () => {
    const list = await create();
    await publish(list.id);
    const fail = vi
      .spyOn(h.app.ranking, 'deleteListData')
      .mockRejectedValueOnce(new Error('Storage interrupted'));
    await expect(remove(list.id)).rejects.toThrow('Storage interrupted');
    expect((await call(getList, 'GET', '/api/lists/mistake', member)).status).toBe(404);
    const pending = await call(getList, 'GET', `/api/lists/${list.id}`, admin);
    expect(((await pending.json()) as ListDetailDto).deleting).toBe(true);
    for (const [endpoint, method, suffix, body] of [
      [editList, 'PUT', '', { description: 'No changes allowed' }],
      [nominate, 'POST', '/entries', { title: 'Late item' }],
      [changeScore, 'PUT', '/ballot', { entryId: 'e1', score: 8 }],
      [getLeaderboard, 'GET', '/leaderboard', undefined],
      [getPublicScores, 'GET', '/scores', undefined],
    ] as const) {
      expect(
        (await call(endpoint, method, `/api/lists/${list.id}${suffix}`, admin, body)).status,
      ).toBe(409);
    }
    expect(
      (await call(exportBackup, 'GET', `/api/admin/backup?list=${list.id}`, admin)).status,
    ).toBe(409);
    const restoration = await h.app.voting.restoreBallots(list.id, 'sealed', () =>
      Promise.resolve(true),
    );
    expect(!restoration.ok && restoration.error.code).toBe('lists.deleting');
    const visible = await call(listLists, 'GET', '/api/lists', member);
    expect(((await visible.json()) as ListsDto).lists).toEqual([]);
    const duplicate = await call(createList, 'POST', '/api/lists', admin, {
      title: 'Another',
      slug: 'mistake',
      itemSource: { kind: 'freeform' },
    });
    expect(duplicate.status).toBe(409);
    fail.mockRestore();
    expect((await remove(list.id)).status).toBe(204);
    const afterDeletion = await h.app.voting.restoreBallots(list.id, 'sealed', () =>
      Promise.resolve(true),
    );
    expect(!afterDeletion.ok && afterDeletion.error.code).toBe('lists.not-found');
    expect((await create()).id).not.toBe(list.id);
  });

  test.each(['vote', 'leaderboard'] as const)(
    'waits for an admitted %s write before cleanup',
    async (kind) => {
      const list = await create();
      await publish(list.id);
      const response = await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, {
        title: 'A pick',
      });
      const entry = (await response.json()) as EntryDto;
      let admitted!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        admitted = resolve;
      });
      const finish = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = h.app.lists.withListWrite;
      vi.spyOn(h.app.lists, 'withListWrite').mockImplementation((id, work) =>
        original(id, async () => {
          const result = await work();
          admitted();
          await finish;
          return result;
        }),
      );
      const writer =
        kind === 'vote'
          ? call(changeScore, 'PUT', `/api/lists/${list.id}/ballot`, member, {
              entryId: entry.id,
              score: 8,
            })
          : call(getLeaderboard, 'GET', `/api/lists/${list.id}/leaderboard`, member);
      await started;
      const busy = await remove(list.id);
      expect(busy.status).toBe(409);
      expect(((await busy.json()) as { error: { code: string } }).error.code).toBe(
        'lists.deletion-busy',
      );
      release();
      expect((await writer).status).toBe(200);
      expect((await remove(list.id)).status).toBe(204);
      expect((await h.store('voting').list({ prefix: `ballot/${list.id}/` })).blobs).toEqual([]);
      expect(await h.store('ranking').get(`leaderboard/${list.id}`)).toBeNull();
    },
  );

  test('a vote paused before admission cannot recreate a deleted ballot', async () => {
    const list = await create();
    await publish(list.id);
    const nominated = await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, {
      title: 'A pick',
    });
    const entry = (await nominated.json()) as EntryDto;
    let reached!: () => void;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const finish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = h.app.lists.withListWrite;
    vi.spyOn(h.app.lists, 'withListWrite').mockImplementation(async (id, work) => {
      reached();
      await finish;
      return original(id, work);
    });
    const vote = call(changeScore, 'PUT', `/api/lists/${list.id}/ballot`, member, {
      entryId: entry.id,
      score: 8,
    });
    await ready;
    expect((await remove(list.id)).status).toBe(204);
    release();
    expect((await vote).status).toBe(404);
    expect((await h.store('voting').list({ prefix: `ballot/${list.id}/` })).blobs).toEqual([]);
    expect((await h.store('lists').list({ prefix: `entry-write/${list.id}/` })).blobs).toEqual([]);
  });
});
