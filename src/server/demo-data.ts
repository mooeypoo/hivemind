import type { App } from './composition.ts';

/**
 * Sample lists for demo mode, created through the normal use cases as the demo personas.
 * Runs on demo sign-in; does nothing if the samples exist or demo mode is off.
 * This is fixture data, not business logic: every rule is still the use cases'.
 */
export const ensureDemoData = async (app: App): Promise<void> => {
  const actors = app.identity.demoActors;
  if (actors === null) return;
  const { admin, memberA, memberB, voters } = actors;

  const existing = await app.lists.listLists(admin);
  if (existing.ok && existing.value.some((list) => list.slug === 'demo-board-games')) return;

  const now = Date.now();
  const day = 86_400_000;
  const schedule = (nominationsCloseAt: Date | null) => ({
    opensAt: new Date(now - day),
    nominationsCloseAt,
    closesAt: new Date(now + 30 * day),
  });

  // 1. Free text, open, with nominations and enough votes for a leaderboard.
  const games = await app.lists.createList(admin, {
    title: 'Demo: Best Board Games',
    slug: 'demo-board-games',
    description: 'Sample list for trying things out. Nominate a game, rate the others.',
    itemSource: { kind: 'freeform' },
    entryMode: 'nominations',
    scale: { min: 1, max: 10 },
    maxNominationsPerMember: 3,
    resultsVisibility: 'live',
    ranking: { strategy: 'bayesian', minVotes: 3 },
    showNominators: true,
    requiredRoleIds: [],
    scoreVisibility: 'public',
  });
  if (!games.ok) return; // Another demo sign-in created the samples at the same moment.
  await app.lists.scheduleList(admin, {
    list: games.value.id,
    schedule: schedule(new Date(now + 14 * day)),
  });

  const nominations: [typeof memberA, string][] = [
    [memberA, 'Root'],
    [memberA, 'Wingspan'],
    [memberB, 'Azul'],
    [memberB, 'Terraforming Mars'],
    [admin, 'Catan'],
  ];
  const entryIds = new Map<string, string>();
  for (const [actor, title] of nominations) {
    const entry = await app.lists.nominate(actor, { list: 'demo-board-games', key: title });
    if (entry.ok) entryIds.set(title, entry.value.id);
  }
  /** Each row: one voter's scores, by title. A spread that shows ranks and provisional entries. */
  const ballots: [typeof memberA, Record<string, number>][] = [
    [memberB, { Root: 9, Wingspan: 8, Catan: 5 }],
    [admin, { Root: 8, Azul: 9, Wingspan: 7 }],
    [voters[0] ?? admin, { Root: 9, Azul: 7, 'Terraforming Mars': 10 }],
    [voters[1] ?? admin, { Root: 7, Wingspan: 9, Catan: 4 }],
    [voters[2] ?? admin, { Azul: 8, Catan: 6 }],
    [voters[3] ?? admin, { Wingspan: 6, Root: 10 }],
  ];
  for (const [actor, scores] of ballots) {
    for (const [title, score] of Object.entries(scores)) {
      const entryId = entryIds.get(title);
      if (entryId !== undefined) {
        await app.voting.changeScore(actor, { list: 'demo-board-games', entryId, score });
      }
    }
  }

  // 2. A CSV preset where every row is an entry, with results hidden until it closes.
  const preset = await app.catalog.importPreset(admin, {
    csv: 'title,subtitle\nOK Computer,Radiohead\nBlue,Joni Mitchell\nRumours,Fleetwood Mac\nThe Miseducation of Lauryn Hill,Lauryn Hill\nKind of Blue,Miles Davis',
  });
  if (preset.ok) {
    const albums = await app.lists.createList(admin, {
      title: 'Demo: Rank these albums',
      slug: 'demo-albums',
      description:
        'Sample seeded list: every album is already in, just rate them. Results stay hidden until it closes.',
      itemSource: { kind: 'preset', presetId: preset.value.presetId },
      entryMode: 'seeded',
      scale: { min: 1, max: 5 },
      maxNominationsPerMember: null,
      resultsVisibility: 'after-close',
      ranking: { strategy: 'bayesian', minVotes: 2 },
      showNominators: false,
      requiredRoleIds: [],
      scoreVisibility: 'private',
    });
    if (albums.ok)
      await app.lists.scheduleList(admin, { list: albums.value.id, schedule: schedule(null) });
  }

  // 3. Movies, only where TMDB is configured.
  if (app.config.tmdbReadToken !== null) {
    const movies = await app.lists.createList(admin, {
      title: 'Demo: Sci-fi movies',
      slug: 'demo-sci-fi',
      description: 'Sample movie list: search TMDB and nominate a film.',
      itemSource: { kind: 'tmdb-movie' },
      entryMode: 'nominations',
      scale: { min: 1, max: 10 },
      maxNominationsPerMember: 3,
      resultsVisibility: 'live',
      ranking: { strategy: 'bayesian', minVotes: 3 },
      showNominators: true,
      requiredRoleIds: [],
      scoreVisibility: 'private',
    });
    if (movies.ok)
      await app.lists.scheduleList(admin, { list: movies.value.id, schedule: schedule(null) });
  }
};
