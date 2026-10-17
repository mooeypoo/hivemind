import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { App } from '../../composition.ts';
import type {
  BallotDto,
  EntryDto,
  ErrorDto,
  ImportSummaryDto,
  ListDetailDto,
  ListDto,
} from '../contracts.ts';
import { SESSION_COOKIE } from '../cookies.ts';
import {
  request,
  signInAs,
  SITE_ADMIN_ID,
  SITE_URL,
  startHarness,
  testConfig,
  type Harness,
} from '../testing/harness.ts';
import { exportBackup, importBackup } from './backup.ts';
import {
  createList,
  editList,
  getList,
  nominate,
  scheduleList,
  setVisibility,
  withdrawNomination,
  setEntryAside,
} from './lists.ts';
import { deleteMyData } from './me.ts';
import { changeScore, getMyBallot } from './voting.ts';

type Endpoint = (request: Request, app: App) => Promise<Response>;

let h: Harness;
let admin: string;
let ada: string;
let bob: string;

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- names the expected response type
const call = async <T>(
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null,
  body?: unknown,
) => {
  const response = await endpoint(
    request(method, path, {
      ...(session === null ? {} : { cookies: { [SESSION_COOKIE]: session } }),
      origin: SITE_URL,
      ...(body === undefined ? {} : { body }),
    }),
    h.app,
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (text === '' ? null : JSON.parse(text)) as T,
    text,
    headers: response.headers,
  };
};

beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
  ada = await signInAs(h, { id: '900000000000000010', username: 'ada' });
  bob = await signInAs(h, { id: '900000000000000011', username: 'bob' });
  const list = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
    title: 'Games',
    slug: 'games',
    itemSource: { kind: 'freeform' },
  });
  await call(scheduleList, 'POST', `/api/lists/${list.body.id}/schedule`, admin, {
    opensAt: '2026-01-01T00:00:00.000Z',
    nominationsCloseAt: null,
    closesAt: null,
  });
  const root = (
    await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', ada, { title: 'Root' })
  ).body.id;
  const azul = (
    await call<EntryDto>(nominate, 'POST', '/api/lists/games/entries', bob, { title: 'Azul' })
  ).body.id;
  await call(changeScore, 'PUT', '/api/lists/games/ballot', ada, { entryId: root, score: 9 });
  await call(changeScore, 'PUT', '/api/lists/games/ballot', bob, { entryId: azul, score: 4 });
});
afterEach(async () => {
  await h.close();
});

describe('backups', () => {
  test('saved draft plans survive export/import without starting participation', async () => {
    const draft = await call<ListDto>(createList, 'POST', '/api/lists', admin, {
      title: 'Planned',
      slug: 'planned',
      itemSource: { kind: 'freeform' },
    });
    const plan = { opensAt: null, nominationsCloseAt: '2026-01-10T00:00:00.000Z', closesAt: null };
    expect(
      (await call(editList, 'PUT', `/api/lists/${draft.body.id}`, admin, { draftSchedule: plan }))
        .status,
    ).toBe(200);
    const file = (await call<unknown>(exportBackup, 'GET', '/api/admin/backup?list=planned', admin))
      .body;
    expect((await call(importBackup, 'POST', '/api/admin/backup', admin, file)).status).toBe(200);
    const restored = await call<ListDetailDto>(getList, 'GET', '/api/lists/planned-2', admin);
    expect(restored.body).toMatchObject({
      lifecycle: 'draft',
      schedule: null,
      draftSchedule: plan,
    });
  });

  test('set-aside explanations survive the HTTP backup schema and import', async () => {
    const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/games', admin);
    const root = detail.body.entries.find((entry) => entry.item.title === 'Root');
    if (root === undefined) throw new Error('fixture');
    expect(
      (
        await call(setEntryAside, 'PUT', '/api/lists/games/entries/set-aside', admin, {
          entryId: root.id,
          token: root.deletionToken,
          expectedReason: null,
          reason: 'Outside the criteria',
        })
      ).status,
    ).toBe(200);
    const file = (await call<unknown>(exportBackup, 'GET', '/api/admin/backup?list=games', admin))
      .body;
    expect((await call(importBackup, 'POST', '/api/admin/backup', admin, file)).status).toBe(200);
    const copy = await call<ListDetailDto>(getList, 'GET', '/api/lists/games-2', admin);
    expect(copy.body.entries.find((entry) => entry.id === root.id)?.setAsideReason).toBe(
      'Outside the criteria',
    );
    expect(
      (
        await call(setVisibility, 'PUT', '/api/lists/games-2/visibility', admin, {
          visibility: 'public',
        })
      ).status,
    ).toBe(200);
    const ballot = await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games-2/ballot', ada);
    expect(ballot.status).toBe(200);
    expect(ballot.body.scores[root.id]).toBe(9);
  });

  test('withdrawn items stay withdrawn after import and their sealed votes return on re-nomination', async () => {
    const detail = await call<ListDetailDto>(getList, 'GET', '/api/lists/games', ada);
    const root = detail.body.entries.find((entry) => entry.item.title === 'Root');
    if (root === undefined) throw new Error('fixture');
    await call(withdrawNomination, 'POST', '/api/lists/games/entries/withdraw', ada, {
      entryId: root.id,
      token: root.withdrawalToken,
    });
    const file = (await call<unknown>(exportBackup, 'GET', '/api/admin/backup?list=games', admin))
      .body;
    expect((await call(importBackup, 'POST', '/api/admin/backup', admin, file)).status).toBe(200);
    const copy = await call<ListDetailDto>(getList, 'GET', '/api/lists/games-2', admin);
    expect(copy.body.entries.map((entry) => entry.item.title)).toEqual(['Azul']);
    const restored = await call<EntryDto>(nominate, 'POST', '/api/lists/games-2/entries', admin, {
      title: 'Root',
    });
    expect(restored.body.id).toBe(root.id);
    await call(setVisibility, 'PUT', '/api/lists/games-2/visibility', admin, {
      visibility: 'public',
    });
    const ballot = await call<BallotDto>(getMyBallot, 'GET', '/api/lists/games-2/ballot', ada);
    expect(ballot.body.scores[root.id]).toBe(9);
  });

  test('Admins download a file where votes are sealed', async () => {
    const result = await call(exportBackup, 'GET', '/api/admin/backup', admin);
    expect(result.status).toBe(200);
    expect(result.headers.get('content-disposition')).toMatch(
      /attachment; filename="votable-lists-backup-all-lists-/,
    );
    expect(result.text).toContain('"title":"Root"');
    expect(result.text).not.toMatch(/"scores"|:9[,}]/);
  });

  test('round trip: import restores the list as a hidden copy, with votes, minus erased members', async () => {
    const file = (await call<unknown>(exportBackup, 'GET', '/api/admin/backup?list=games', admin))
      .body;
    await call(deleteMyData, 'DELETE', '/api/me', bob);

    const summary = await call<ImportSummaryDto>(
      importBackup,
      'POST',
      '/api/admin/backup',
      admin,
      file,
    );
    expect(summary.body).toEqual({
      keyMatched: true,
      lists: [
        {
          ok: true,
          title: 'Games',
          slug: 'games-2',
          renamed: true,
          hidden: true,
          entries: 2,
          votesRestored: 1,
          membersLeftOut: 1,
        },
      ],
    });

    const copy = await call<ListDetailDto>(getList, 'GET', '/api/lists/games-2', admin);
    expect(copy.body.entries.map((e) => [e.item.title, e.nominatedBy])).toEqual([
      ['Azul', null],
      ['Root', 'ada'],
    ]);
  });

  test('a file made with a different backup key restores the lists but no names or votes', async () => {
    const file = (await call<{ keyId: string }>(exportBackup, 'GET', '/api/admin/backup', admin))
      .body;
    const summary = await call<ImportSummaryDto>(importBackup, 'POST', '/api/admin/backup', admin, {
      ...file,
      keyId: 'another-key',
    });
    expect(summary.body.keyMatched).toBe(false);
    expect(summary.body.lists[0]).toMatchObject({ ok: true, votesRestored: 0, membersLeftOut: 2 });
  });

  test('are for Admins, from the site itself, and only when set up', async () => {
    expect((await call(exportBackup, 'GET', '/api/admin/backup', ada)).status).toBe(403);
    const file = (await call<unknown>(exportBackup, 'GET', '/api/admin/backup', admin)).body;
    expect((await call(importBackup, 'POST', '/api/admin/backup', ada, file)).status).toBe(403);
    const foreign = await importBackup(
      request('POST', '/api/admin/backup', {
        cookies: { [SESSION_COOKIE]: admin },
        origin: 'https://evil.example',
        body: file,
      }),
      h.app,
    );
    expect(foreign.status).toBe(403);

    await h.close();
    h = await startHarness({ ...testConfig, backupKey: null });
    const adminAgain = await signInAs(h, { id: SITE_ADMIN_ID, username: 'dev' });
    const off = await call<ErrorDto>(exportBackup, 'GET', '/api/admin/backup', adminAgain);
    expect(off.body.error.code).toBe('backup.not-configured');
  });

  test('a file that isn’t a backup is refused with its problems', async () => {
    const result = await call<ErrorDto>(importBackup, 'POST', '/api/admin/backup', admin, {
      format: 'something-else',
    });
    expect(result.status).toBe(422);
    expect(result.body.error.details?.length).toBeGreaterThan(0);
  });
});
