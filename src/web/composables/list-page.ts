import { computed, ref, watch } from 'vue';
import type {
  BallotDto,
  EntryDto,
  LeaderboardDto,
  LeaderboardRowDto,
  ListDetailDto,
  PublicScoresDto,
  RoleLabelDto,
  RoleLabelsDto,
} from '../../server/http/contracts.ts';
import { roleIdsOf, rolesPhrase } from '../lib/access.ts';
import { nextEvent } from '../lib/next-event.ts';
import { api, type ApiError } from '../services/api.ts';
import { useBallot } from './ballot.ts';

/**
 * Everything the list page shows, and what the viewer may do there. The caller's own scores
 * are the only ballot ever loaded; nobody else's are.
 */
export const useListPage = (slug: () => string) => {
  const list = ref<ListDetailDto | null>(null);
  const error = ref<ApiError | null>(null);
  const publicScores = ref<PublicScoresDto>({ visible: false });
  const leaderboard = ref<LeaderboardDto | null>(null);
  const withdrawing = ref(false);
  const withdrawalError = ref<ApiError | null>(null);

  const path = () => `/api/lists/${encodeURIComponent(slug())}`;
  const refreshPublicScores = async () => {
    const result = await api.get<PublicScoresDto>(`${path()}/scores`);
    if (result.ok) publicScores.value = result.data;
  };
  const ballot = useBallot(() => list.value?.id ?? '', {
    onSaved: () => void refreshPublicScores(),
    revision: () => list.value?.writeRevision ?? null,
  });

  const load = async () => {
    leaderboard.value = null;
    const [detail, own, attribution] = await Promise.all([
      api.get<ListDetailDto>(path()),
      api.get<BallotDto>(`${path()}/ballot`),
      api.get<PublicScoresDto>(`${path()}/scores`),
    ]);
    if (detail.ok) {
      list.value = detail.data;
      error.value = null;
    } else {
      error.value = detail.error;
    }
    if (own.ok) ballot.load(own.data.scores);
    if (attribution.ok) publicScores.value = attribution.data;
  };
  watch(slug, load, { immediate: true });

  const withdraw = async (entry: EntryDto): Promise<boolean> => {
    if (withdrawing.value || entry.withdrawalToken == null) return false;
    withdrawing.value = true;
    withdrawalError.value = null;
    try {
      const result = await api.post<undefined>(`${path()}/entries/withdraw`, {
        entryId: entry.id,
        token: entry.withdrawalToken,
      });
      if (!result.ok) {
        withdrawalError.value = result.error;
        return false;
      }
      await load();
      return true;
    } finally {
      withdrawing.value = false;
    }
  };

  /** Called by the standings panel whenever it loads. */
  const onLeaderboard = (board: LeaderboardDto) => {
    leaderboard.value = board;
  };
  const rows = computed((): readonly LeaderboardRowDto[] | null =>
    leaderboard.value === null || leaderboard.value.hidden
      ? null
      : leaderboard.value.groups === undefined
        ? leaderboard.value.rows
        : [...leaderboard.value.groups.main, ...leaderboard.value.groups.setAside],
  );
  const standings = computed((): Readonly<Record<string, LeaderboardRowDto>> =>
    Object.fromEntries((rows.value ?? []).map((row) => [row.entryId, row])),
  );

  /** In leaderboard order when results are visible; otherwise as listed. */
  const entries = computed(() => {
    const all = [...(list.value?.entries ?? [])];
    if (rows.value === null) return all;
    const position = new Map(rows.value.map((row, index) => [row.entryId, index]));
    const at = (id: string) => position.get(id) ?? Number.MAX_SAFE_INTEGER;
    return all.sort((a, b) => at(a.id) - at(b.id));
  });

  const lifecycle = computed(() => list.value?.lifecycle);
  const isClosed = computed(() => lifecycle.value === 'closed' || lifecycle.value === 'archived');
  const hasStandings = computed(
    () =>
      list.value?.participationPaused !== true && (lifecycle.value === 'open' || isClosed.value),
  );
  /** Members rate while the list is open; once it closes they still see their own scores. */
  const canVote = computed(() => lifecycle.value === 'open' && list.value?.viewer.canRate === true);
  const canNominateHere = computed(
    () =>
      list.value?.entryMode === 'nominations' &&
      list.value.participationPaused !== true &&
      (lifecycle.value === 'open' || lifecycle.value === 'scheduled'),
  );
  const ratedCount = computed(
    () => entries.value.filter((entry) => ballot.scores.value[entry.id] !== undefined).length,
  );
  const unrated = computed(() =>
    entries.value.filter((entry) => ballot.scores.value[entry.id] === undefined),
  );
  /** Results are hidden until voting closes: there's nothing to see on the results page yet. */
  const resultsSealed = computed(() => leaderboard.value?.hidden === true);
  const next = computed(() => (list.value === null ? null : nextEvent(list.value, new Date())));

  /** Role names, loaded only when this list limits nominating or rating to roles. */
  const roleLabels = ref<readonly RoleLabelDto[]>([]);
  watch(
    () =>
      list.value === null
        ? 0
        : roleIdsOf(list.value.access.nominate).length + roleIdsOf(list.value.access.rate).length,
    async (count) => {
      if (count === 0) return;
      const result = await api.get<RoleLabelsDto>('/api/roles');
      if (result.ok) roleLabels.value = result.data.labels;
    },
  );
  /** "the Film Club or Moderators role" for members who may not rate. */
  const rateRolesText = computed(() =>
    list.value === null ? '' : rolesPhrase(list.value.access.rate, roleLabels.value),
  );
  const nominateRolesText = computed(() =>
    list.value === null ? '' : rolesPhrase(list.value.access.nominate, roleLabels.value),
  );

  return {
    list,
    error,
    publicScores,
    ballot,
    load,
    onLeaderboard,
    standings,
    entries,
    isClosed,
    hasStandings,
    canVote,
    canNominateHere,
    ratedCount,
    unrated,
    resultsSealed,
    next,
    rateRolesText,
    nominateRolesText,
    withdraw,
    withdrawing,
    withdrawalError,
  };
};
