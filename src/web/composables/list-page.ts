import { computed, ref, watch } from 'vue';
import type {
  BallotDto,
  EntryDto,
  LeaderboardDto,
  LeaderboardRowDto,
  ListDetailDto,
  PublicScoresDto,
  RoleLabelsDto,
} from '../../server/http/contracts.ts';
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
  const canVote = computed(
    () => lifecycle.value === 'open' && list.value?.viewer.canParticipate === true,
  );
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

  /** "the Film Club or Moderators role", from the Admins' role names where there are some. */
  const roleNames = ref<Readonly<Record<string, string>>>({});
  watch(
    () => list.value?.requiredRoleIds.length ?? 0,
    async (count) => {
      if (count === 0) return;
      const result = await api.get<RoleLabelsDto>('/api/roles');
      if (result.ok) {
        roleNames.value = Object.fromEntries(
          result.data.labels.map((label) => [label.roleId, label.name]),
        );
      }
    },
  );
  const requiredRolesText = computed(() => {
    const ids = list.value?.requiredRoleIds ?? [];
    const names = ids.map((id) => roleNames.value[id]).filter((name) => name !== undefined);
    if (names.length !== ids.length || names.length === 0) return 'a particular role';
    const joined =
      names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} or ${String(names.at(-1))}`;
    return `the ${String(joined)} role`;
  });

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
    requiredRolesText,
    withdraw,
    withdrawing,
    withdrawalError,
  };
};
