/**
 * Retakes the README screenshots in docs/screenshots: `npm run screenshots`.
 * Serves the built app (vite preview) against fixture data, so no real community, member or
 * TMDB poster appears in the images. Needs `npx playwright install chromium` once.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from '@playwright/test';
import type {
  EntryDto,
  LeaderboardDto,
  ListDetailDto,
  ListDto,
  MeDto,
  SiteDto,
} from '../src/server/http/contracts.ts';

const PORT = 4174;
const BASE = `http://localhost:${String(PORT)}`;
const OUT = new URL('../docs/screenshots/', import.meta.url);

const day = 24 * 60 * 60 * 1000;
const at = (offset: number) => new Date(Date.now() + offset).toISOString();

const me: MeDto = { id: '1', displayName: 'Ada', avatarUrl: '/favicon.svg', isAdmin: true };
const site: SiteDto = {
  community: { name: 'Board Game Night', iconUrl: null, inviteUrl: 'https://discord.gg/example' },
  offersMovieData: false,
  offersTvData: false,
  offersGameData: false,
  demo: false,
  backups: true,
};

const games = [
  ['Wingspan', 'Stonemaier Games', 'Ada'],
  ['Root', 'Leder Games', 'Sam'],
  ['Azul', 'Plan B Games', 'Kit'],
  ['Terraforming Mars', 'FryxGames', 'Sam'],
  ['Cascadia', 'Flatout Games', 'Ada'],
  ['The Crew', 'Kosmos', 'Lee'],
] as const;
const entries: EntryDto[] = games.map(([title, subtitle, by], index) => ({
  id: `g${String(index)}`,
  item: { source: 'freeform', externalId: `g${String(index)}`, title, subtitle, imageUrl: null },
  nominatedBy: by === 'Ada' ? null : by,
  isMine: by === 'Ada',
  nominatedAt: at(-3 * day),
}));

const base: Omit<ListDto, 'id' | 'title' | 'slug' | 'description' | 'lifecycle'> = {
  itemSource: { kind: 'freeform' },
  entryMode: 'nominations',
  scale: { min: 1, max: 10 },
  maxNominationsPerMember: 3,
  resultsVisibility: 'live',
  scoreVisibility: 'private',
  ranking: { strategy: 'bayesian', minVotes: 3 },
  showNominators: true,
  access: {
    view: { kind: 'everyone' },
    nominate: { kind: 'everyone' },
    rate: { kind: 'everyone' },
  },
  viewers: 'everyone',
  schedule: { opensAt: at(-5 * day), nominationsCloseAt: at(4 * day), closesAt: at(12 * day) },
  viewer: {
    allowed: { nominate: true, rate: true },
    canRate: true,
    canNominate: true,
    nominationsUsed: 2,
    viaSiteAdmin: [],
  },
};
const list: ListDetailDto = {
  ...base,
  id: 'list-1',
  title: 'Best board games of all time',
  slug: 'board-games',
  description: 'Nominate the games your group keeps coming back to, then rate everyone’s picks.',
  lifecycle: 'open',
  entries,
  itemSourceEditable: false,
  snapshotsExpireAt: null,
};
const lists: ListDto[] = [
  list,
  {
    ...base,
    id: 'list-2',
    title: 'Albums of the decade',
    slug: 'albums',
    description: 'Every album is already in: just rate them. Results stay sealed until it closes.',
    lifecycle: 'open',
    itemSource: { kind: 'preset', presetId: 'p1' },
    entryMode: 'seeded',
    scale: { min: 1, max: 5 },
    resultsVisibility: 'after-close',
  },
  {
    ...base,
    id: 'list-3',
    title: 'Cosiest co-op games',
    slug: 'co-op',
    description: 'Opens next week. Start thinking about your nominations.',
    lifecycle: 'scheduled',
    schedule: { opensAt: at(6 * day), nominationsCloseAt: null, closesAt: at(20 * day) },
  },
  {
    ...base,
    id: 'list-4',
    title: 'Best party games',
    slug: 'party',
    description: 'Last spring’s list. Final results are in.',
    lifecycle: 'closed',
    schedule: { opensAt: at(-90 * day), nominationsCloseAt: null, closesAt: at(-60 * day) },
  },
];
// Leaderboard order: ranked entries, then one with too few votes (however high), then none.
const order = [0, 1, 2, 4, 3, 5];
const scores = [8.6, 8.1, 7.4, 9.1, 6.2, null];
const votes = [7, 6, 5, 2, 4, 0];
const ranks = [1, 2, 3, null, 4, null];
const board: LeaderboardDto = {
  hidden: false,
  computedAt: new Date().toISOString(),
  minVotes: 3,
  rows: order.flatMap((index) => {
    const entry = entries[index];
    if (entry === undefined) return [];
    const score = scores[index] ?? null;
    const count = votes[index] ?? 0;
    return {
      rank: ranks[index] ?? null,
      entryId: entry.id,
      item: entry.item,
      score,
      average: score === null ? null : score + 0.4,
      votes: count,
      provisional: count < 3,
      votesNeeded: Math.max(0, 3 - count),
    };
  }),
};

const fixtures: Record<string, unknown> = {
  'GET /api/site': site,
  'GET /api/lists': { lists },
  'GET /api/lists/board-games': list,
  'GET /api/lists/board-games/ballot': { listId: list.id, scores: { g0: 9, g1: 8, g3: 7 } },
  'GET /api/lists/board-games/scores': { visible: false },
  'GET /api/lists/board-games/leaderboard': board,
  'GET /api/roles': { labels: [], version: null },
};

const serve = async (page: Page, signedIn: boolean) => {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const key = `${route.request().method()} ${url.pathname}`;
    if (key === 'GET /api/me') {
      return signedIn ? route.fulfill({ json: me }) : route.fulfill({ status: 401, json: {} });
    }
    const body = fixtures[key];
    return body === undefined
      ? route.fulfill({ status: 404, json: { error: { code: 'http.not-found', message: '' } } })
      : route.fulfill({ json: body });
  });
};

const scrollTo = (page: Page, selector: string) =>
  page.evaluate((target) => {
    const element = document.querySelector(target);
    if (element !== null)
      window.scrollTo(0, element.getBoundingClientRect().top + window.scrollY - 130);
  }, selector);

interface Shot {
  name: string;
  path: string;
  width: number;
  height: number;
  scheme: 'light' | 'dark';
  signedIn?: boolean;
  act?: (page: Page) => Promise<void>;
}
const shots: Shot[] = [
  { name: 'landing', path: '/', width: 1280, height: 800, scheme: 'dark', signedIn: false },
  { name: 'lists', path: '/', width: 1280, height: 800, scheme: 'light' },
  { name: 'list', path: '/lists/board-games', width: 1280, height: 900, scheme: 'dark' },
  {
    name: 'rating-phone',
    path: '/lists/board-games',
    width: 390,
    height: 844,
    scheme: 'light',
    act: async (page) => {
      await scrollTo(page, '.ballot-bar');
    },
  },
  {
    name: 'standings-phone',
    path: '/lists/board-games?tab=standings',
    width: 390,
    height: 844,
    scheme: 'dark',
    act: async (page) => {
      await scrollTo(page, '.leaderboard');
    },
  },
  {
    name: 'menu-phone',
    path: '/lists/board-games',
    width: 390,
    height: 844,
    scheme: 'dark',
    act: async (page) => {
      await page.getByRole('button', { name: /^Menu/ }).click();
    },
  },
];

const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  stdio: 'ignore',
});
try {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await fetch(BASE);
      break;
    } catch (error) {
      if (attempt > 50) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      colorScheme: shot.scheme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await serve(page, shot.signedIn ?? true);
    await page.goto(`${BASE}${shot.path}`);
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.evaluate(() => document.fonts.ready);
    await shot.act?.(page);
    await page.waitForTimeout(300);
    await page.screenshot({
      path: new URL(`${shot.name}.jpg`, OUT).pathname,
      type: 'jpeg',
      quality: 82,
    });
    await context.close();
    console.log(`docs/screenshots/${shot.name}.jpg`);
  }
  await browser.close();
} finally {
  preview.kill();
}
