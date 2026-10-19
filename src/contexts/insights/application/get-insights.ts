import {
  domainError,
  err,
  ok,
  requireAdmin,
  type Actor,
  type Clock,
  type DomainError,
  type Result,
} from '../../../shared/kernel/index.ts';
import type { Insights, ListInsight, ParticipationMetrics } from '../domain/insights.ts';
import type { ListParticipation, VotingParticipation } from './ports.ts';

export const makeGetInsights =
  (deps: {
    readonly lists: ListParticipation;
    readonly voting: VotingParticipation;
    readonly clock: Clock;
  }) =>
  async (
    actor: Actor,
    input: { readonly list?: string },
  ): Promise<Result<Insights, DomainError>> => {
    const admin = requireAdmin(actor);
    if (!admin.ok) return admin;
    const scope = await deps.lists.scope(admin.value, input);
    if (!scope.ok) return scope;
    const available = scope.value.lists.filter((list) => list.status === 'available');
    const voting = await deps.voting.summarize(admin.value, available);
    if (!voting.ok) return voting;
    const votes = new Map(voting.value.lists.map((list) => [list.id, list]));
    const totals: { -readonly [K in keyof ParticipationMetrics]: ParticipationMetrics[K] } = {
      entries: 0,
      withdrawnEntries: 0,
      setAsideEntries: 0,
      nominators: scope.value.nominators,
      ratings: 0,
      voters: voting.value.voters,
      ratedEntries: 0,
      readyEntries: 0,
    };
    const lists: ListInsight[] = [];
    for (const list of scope.value.lists) {
      if (list.status !== 'available') {
        lists.push(list);
        continue;
      }
      const summary = votes.get(list.id);
      if (summary === undefined)
        return err(
          domainError(
            'unavailable',
            'insights.incomplete',
            'Participation data is incomplete. Please try again.',
          ),
        );
      const metrics: ParticipationMetrics = {
        entries: list.entries,
        withdrawnEntries: list.withdrawnEntries,
        setAsideEntries: list.setAsideEntries,
        nominators: list.nominators,
        ratings: summary.ratings,
        voters: summary.voters,
        ratedEntries: summary.ratedEntries,
        readyEntries: summary.readyEntries,
      };
      for (const key of [
        'entries',
        'withdrawnEntries',
        'setAsideEntries',
        'ratings',
        'ratedEntries',
        'readyEntries',
      ] as const)
        totals[key] += metrics[key];
      lists.push({
        id: list.id,
        title: list.title,
        slug: list.slug,
        lifecycle: list.lifecycle,
        viewers: list.viewers,
        source: list.source,
        entryMode: list.entryMode,
        status: 'available',
        metrics,
        minVotes: list.minVotes,
        distribution: summary.distribution,
      });
    }
    return ok({
      computedAt: deps.clock.now().toISOString(),
      includedLists: available.length,
      excludedLists: lists.length - available.length,
      totals,
      lists,
    });
  };
