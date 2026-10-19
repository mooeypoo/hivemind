import type { App } from './composition.ts';

export const FIRST_LIST_SLUG = 'best-sci-fi-movies';

/**
 * The first list (AGENTS.md, M6): "Best Sci-Fi Movies", TMDB movies, scored 1–10, created as a
 * draft for an Admin to review and schedule. Does nothing if it already exists.
 */
export const seedFirstList = async (app: App): Promise<'created' | 'exists'> => {
  const operator = app.identity.operatorActor('seed');
  const lists = await app.lists.listLists(operator);
  if (lists.ok && lists.value.some((list) => list.slug === FIRST_LIST_SLUG)) return 'exists';
  const created = await app.lists.createList(operator, {
    title: 'Best Sci-Fi Movies',
    slug: FIRST_LIST_SLUG,
    description: 'Nominate the science-fiction films you love, then rate everyone’s picks.',
    itemSource: { kind: 'tmdb-movie' },
    entryMode: 'nominations',
    scale: { min: 1, max: 10 },
    maxNominationsPerMember: 3,
    resultsVisibility: 'live',
    ranking: { strategy: 'bayesian', minVotes: 5 },
    showNominators: true,
    access: {
      view: { kind: 'everyone' },
      nominate: { kind: 'everyone' },
      rate: { kind: 'everyone' },
    },
    scoreVisibility: 'private',
  });
  if (!created.ok) throw new Error(`Could not create the list: ${created.error.message}`);
  return 'created';
};
