import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { App } from '../../composition.ts';
import { domainError, err, type MemberId } from '../../../shared/kernel/index.ts';
import type { EntryDto, ListDetailDto, ListDto, BallotDto, LeaderboardDto } from '../contracts.ts';
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
  createList,
  scheduleList,
  nominate,
  deleteEntry,
  getList,
  closeVoting,
  archiveList,
  withdrawNomination,
} from './lists.ts';
import { changeScore, getMyBallot } from './voting.ts';
import { getLeaderboard } from './ranking.ts';
import { exportBackup } from './backup.ts';
import { importPreset } from './catalog.ts';

let h: Harness;
let admin: string;
let member: string;
let list: ListDto;
let pick: EntryDto;
let keep: EntryDto;
const findEntry = (entries: readonly EntryDto[], title: string): EntryDto => {
  const entry = entries.find((entry) => entry.item.title === title);
  if (entry === undefined) throw new Error(`Missing fixture entry: ${title}`);
  return entry;
};
type Endpoint = (request: Request, app: App) => Promise<Response>;
const call = (
  endpoint: Endpoint,
  method: string,
  path: string,
  session: string | null = admin,
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
const remove = (entry = pick, session: string | null = admin) =>
  call(deleteEntry, 'POST', `/api/lists/${list.id}/entries/delete`, session, {
    entryId: entry.id,
    token: entry.deletionToken,
    confirmation: entry.item.title,
  });
const detail = async () =>
  (await (await call(getList, 'GET', `/api/lists/${list.id}`)).json()) as ListDetailDto;
const rate = async (entry: EntryDto, score: number) =>
  call(changeScore, 'PUT', `/api/lists/${list.id}/ballot`, member, {
    entryId: entry.id,
    score,
    revision: (await detail()).writeRevision ?? null,
  });
beforeEach(async () => {
  h = await startHarness();
  admin = await signInAs(h, { id: SITE_ADMIN_ID });
  member = await signInAs(h, { id: '900000000000000010' });
  list = (await (
    await call(createList, 'POST', '/api/lists', admin, {
      title: 'Picks',
      slug: 'picks',
      itemSource: { kind: 'freeform' },
      maxNominationsPerMember: 2,
      ranking: { strategy: 'bayesian', minVotes: 1 },
    })
  ).json()) as ListDto;
  expect(
    (
      await call(scheduleList, 'POST', `/api/lists/${list.id}/schedule`, admin, {
        opensAt: '2026-01-01T00:00:00.000Z',
        nominationsCloseAt: null,
        closesAt: null,
      })
    ).status,
  ).toBe(200);
  for (const title of ['Pick', 'Keep']) {
    expect(
      (await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, { title })).status,
    ).toBe(201);
  }
  const entries = (await detail()).entries;
  pick = findEntry(entries, 'Pick');
  keep = findEntry(entries, 'Keep');
  expect((await rate(pick, 10)).status).toBe(200);
  expect((await rate(keep, 2)).status).toBe(200);
});
afterEach(async () => {
  vi.restoreAllMocks();
  await h.close();
});

describe('permanent entry deletion', () => {
  test.each(['open', 'closed', 'archived', 'withdrawn'])(
    'erases an entry and its scores from a %s list',
    async (state) => {
      expect(
        (await call(getLeaderboard, 'GET', `/api/lists/${list.id}/leaderboard`, member)).status,
      ).toBe(200);
      if (state === 'closed') await call(closeVoting, 'POST', `/api/lists/${list.id}/close`);
      if (state === 'archived') await call(archiveList, 'POST', `/api/lists/${list.id}/archive`);
      if (state === 'withdrawn') {
        const own = (await (
          await call(getList, 'GET', `/api/lists/${list.id}`, member)
        ).json()) as ListDetailDto;
        const entry = findEntry(own.entries, 'Pick');
        expect(
          (
            await call(
              withdrawNomination,
              'POST',
              `/api/lists/${list.id}/entries/withdraw`,
              member,
              {
                entryId: entry.id,
                token: entry.withdrawalToken,
              },
            )
          ).status,
        ).toBe(204);
        const withdrawn = (await detail()).withdrawnEntries ?? [];
        expect(
          withdrawn.some(
            (entry) => entry.id === pick.id && entry.deletionToken === pick.deletionToken,
          ),
        ).toBe(true);
        const memberDetail = (await (
          await call(getList, 'GET', `/api/lists/${list.id}`, member)
        ).json()) as ListDetailDto;
        expect(memberDetail.withdrawnEntries).toEqual([]);
      }
      expect((await remove()).status).toBe(204);
      expect((await detail()).entries.map((entry) => entry.id)).toEqual([keep.id]);
      expect(await h.store('lists').get(`entry/${list.id}/${pick.id}`)).toBeNull();
      expect(await h.store('ranking').get(`leaderboard/${list.id}`)).toBeNull();
      const ballot = (await (
        await call(getMyBallot, 'GET', `/api/lists/${list.id}/ballot`, member)
      ).json()) as BallotDto;
      expect(ballot.scores).toEqual({ [keep.id]: 2 });
      const records = (await h.app.lists.personalData.exportFor('900000000000000010' as MemberId))
        .nominationRecords;
      expect(
        records.every(
          (record) =>
            !record.entryIds.some((id) => id === pick.id) && record.claims?.[pick.id] === undefined,
        ),
      ).toBe(true);
      const board = (await (
        await call(getLeaderboard, 'GET', `/api/lists/${list.id}/leaderboard`, member)
      ).json()) as LeaderboardDto;
      expect(!board.hidden && board.rows[0]?.score).toBe(2);
      expect((await remove()).status).toBe(204);
    },
  );

  test('frees allowance and re-nominates without old scores or stale confirmation affecting it', async () => {
    expect((await remove()).status).toBe(204);
    const added = await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, {
      title: 'Pick',
    });
    expect(added.status).toBe(201);
    const fresh = findEntry((await detail()).entries, 'Pick');
    expect(fresh.deletionToken).not.toBe(pick.deletionToken);
    const beforeRating = (await (
      await call(getMyBallot, 'GET', `/api/lists/${list.id}/ballot`, member)
    ).json()) as BallotDto;
    expect(beforeRating.scores[pick.id]).toBeUndefined();
    expect(
      (
        await call(changeScore, 'PUT', `/api/lists/${list.id}/ballot`, member, {
          entryId: fresh.id,
          score: 10,
          revision: list.writeRevision ?? null,
        })
      ).status,
    ).toBe(409);
    expect((await rate(fresh, 7)).status).toBe(200);
    expect((await remove()).status).toBe(409);
    const ballot = (await (
      await call(getMyBallot, 'GET', `/api/lists/${list.id}/ballot`, member)
    ).json()) as BallotDto;
    expect(ballot.scores).toEqual({ [fresh.id]: 7, [keep.id]: 2 });
  });

  test.each(['scheduled', 'open'])('deletes seeded entries from a %s list', async (state) => {
    const preset = await call(importPreset, 'POST', '/api/catalog/presets', admin, {
      csv: 'title\nSeed',
    });
    const imported = (await preset.json()) as { presetId: string };
    list = (await (
      await call(createList, 'POST', '/api/lists', admin, {
        title: 'Seeded',
        slug: 'seeded',
        itemSource: { kind: 'preset', presetId: imported.presetId },
        entryMode: 'seeded',
      })
    ).json()) as ListDto;
    expect(
      (
        await call(scheduleList, 'POST', `/api/lists/${list.id}/schedule`, admin, {
          opensAt: state === 'scheduled' ? '2026-02-01T00:00:00.000Z' : '2026-01-01T00:00:00.000Z',
          nominationsCloseAt: null,
          closesAt: null,
        })
      ).status,
    ).toBe(200);
    const seed = findEntry((await detail()).entries, 'Seed');
    expect(seed.nominatedBy).toBeNull();
    expect((await remove(seed)).status).toBe(204);
    expect((await detail()).entries).toEqual([]);
    expect(await h.store('catalog').get(`preset/${imported.presetId}`)).not.toBeNull();
  });

  test('partial cleanup is resumable without success or lost unrelated scores', async () => {
    vi.spyOn(h.app.ranking, 'deleteListData').mockResolvedValueOnce(
      err(domainError('unavailable', 'ranking.cleanup-unavailable', 'Retry ranking cleanup.')),
    );
    const partial = await remove();
    expect(partial.status).toBe(503);
    expect((await detail()).entryDeletion?.title).toBe('Pick');
    expect((await detail()).entries.some((entry) => entry.id === pick.id)).toBe(true);
    expect((await remove()).status).toBe(204);
    expect((await detail()).entryDeletion).toBeNull();
    const ballot = (await (
      await call(getMyBallot, 'GET', `/api/lists/${list.id}/ballot`, member)
    ).json()) as BallotDto;
    expect(ballot.scores).toEqual({ [keep.id]: 2 });
    const stored = await h.store('lists').get(`list/${list.id}`);
    expect(stored).not.toContain(pick.id);
    expect(stored).not.toContain('"title":"Pick"');
  });

  test('guards authorization, origin, strict schema, immutable ID and confirmation', async () => {
    expect((await remove(pick, null)).status).toBe(401);
    expect((await remove(pick, member)).status).toBe(403);
    expect(
      (
        await call(deleteEntry, 'POST', '/api/lists/picks/entries/delete', admin, {
          entryId: pick.id,
          token: pick.deletionToken,
          confirmation: 'Pick',
        })
      ).status,
    ).toBe(422);
    for (const body of [
      { entryId: pick.id, token: pick.deletionToken, confirmation: 'wrong' },
      { entryId: pick.id, token: pick.deletionToken, confirmation: 'Pick', extra: true },
    ])
      expect(
        (await call(deleteEntry, 'POST', `/api/lists/${list.id}/entries/delete`, admin, body))
          .status,
      ).toBe(422);
    expect(
      (
        await deleteEntry(
          request('POST', `/api/lists/${list.id}/entries/delete`, {
            origin: 'https://elsewhere.example',
            cookies: { [SESSION_COOKIE]: admin },
            body: { entryId: pick.id, token: pick.deletionToken, confirmation: 'Pick' },
          }),
          h.app,
        )
      ).status,
    ).toBe(403);
    const visible = (await (
      await call(getList, 'GET', `/api/lists/${list.id}`, member)
    ).json()) as ListDetailDto;
    expect(visible.entries.every((entry) => entry.deletionToken === null)).toBe(true);
  });

  test('pauses writes while admitted writers drain, exposes retry, and finishes without data resurrection', async () => {
    let ready!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const original = h.app.lists.withListWrite;
    vi.spyOn(h.app.lists, 'withListWrite').mockImplementation((id, work, revision) =>
      original(
        id,
        async () => {
          const result = await work();
          ready();
          await wait;
          return result;
        },
        revision,
      ),
    );
    const vote = rate(keep, 3);
    await started;
    expect((await remove()).status).toBe(409);
    const pending = await detail();
    expect(pending.participationPaused).toBe(true);
    expect(pending.entryDeletion?.entryId).toBe(pick.id);
    expect((await rate(pick, 8)).status).toBe(409);
    expect(
      (await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, { title: 'Late' }))
        .status,
    ).toBe(409);
    expect((await call(exportBackup, 'GET', `/api/admin/backup?list=${list.id}`)).status).toBe(409);
    release();
    expect((await vote).status).toBe(200);
    expect((await remove()).status).toBe(204);
    expect((await detail()).participationPaused).toBe(false);
  });

  test.each(['vote', 'leaderboard'])(
    'a %s delayed before admission cannot affect a fresh nomination',
    async (kind) => {
      let ready!: () => void;
      let release!: () => void;
      const started = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = h.app.lists.withListWrite;
      vi.spyOn(h.app.lists, 'withListWrite').mockImplementation(async (id, work, revision) => {
        ready();
        await wait;
        return original(id, work, revision);
      });
      const writer =
        kind === 'vote'
          ? rate(pick, 9)
          : call(getLeaderboard, 'GET', `/api/lists/${list.id}/leaderboard`, member);
      await started;
      expect((await remove()).status).toBe(204);
      expect(
        (await call(nominate, 'POST', `/api/lists/${list.id}/entries`, member, { title: 'Pick' }))
          .status,
      ).toBe(201);
      release();
      expect((await writer).status).toBe(409);
      expect(await h.store('ranking').get(`leaderboard/${list.id}`)).toBeNull();
      const ballot = (await (
        await call(getMyBallot, 'GET', `/api/lists/${list.id}/ballot`, member)
      ).json()) as BallotDto;
      expect(ballot.scores).toEqual({ [keep.id]: 2 });
    },
  );
});
