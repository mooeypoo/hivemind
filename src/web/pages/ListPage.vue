<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type {
  BallotDto,
  LeaderboardDto,
  LeaderboardRowDto,
  ListDetailDto,
  PublicScoresDto,
  RoleLabelsDto,
} from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import { useToast } from '../composables/toast.ts';
import EventCountdown from '../components/EventCountdown.vue';
import EntryCard from '../components/EntryCard.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import LeaderboardPanel from '../components/LeaderboardPanel.vue';
import NominatePanel from '../components/NominatePanel.vue';
import ScorePicker from '../components/ScorePicker.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import PublicScoreDisclosure from '../components/PublicScoreDisclosure.vue';
import { sourceLabel } from '../lib/labels.ts';
import { nextEvent } from '../lib/next-event.ts';
import { session } from '../state/session.ts';
import { usePageTitle } from '../lib/page-title.ts';

const route = useRoute();
const list = ref<ListDetailDto | null>(null);
const error = ref<ApiError | null>(null);
/** The caller's own scores, by entry id. Nobody else's are ever loaded. */
const scores = ref<Readonly<Record<string, number>>>({});
const publicScores = ref<PublicScoresDto>({ visible: false });
const leaderboardRows = ref<readonly LeaderboardRowDto[] | null>(null);
const toast = useToast();

const orderedEntries = computed(() => {
  const entries = [...(list.value?.entries ?? [])];
  if (leaderboardRows.value === null) return entries;
  const position = new Map(leaderboardRows.value.map((row, index) => [row.entryId, index]));
  return entries.sort(
    (a, b) =>
      (position.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (position.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
});
const standingsByEntry = computed(() =>
  Object.fromEntries((leaderboardRows.value ?? []).map((row) => [row.entryId, row])),
);

const load = async () => {
  leaderboardRows.value = null;
  const slug = encodeURIComponent(String(route.params.slug));
  const [detail, ballot, attribution] = await Promise.all([
    api.get<ListDetailDto>(`/api/lists/${slug}`),
    api.get<BallotDto>(`/api/lists/${slug}/ballot`),
    api.get<PublicScoresDto>(`/api/lists/${slug}/scores`),
  ]);
  if (detail.ok) {
    list.value = detail.data;
    error.value = null;
  } else {
    error.value = detail.error;
  }
  if (ballot.ok) scores.value = ballot.data.scores;
  if (attribution.ok) publicScores.value = attribution.data;
};

const onLeaderboardLoaded = (board: LeaderboardDto) => {
  leaderboardRows.value = board.hidden ? null : board.rows;
};

const copyMemberLink = async () => {
  if (list.value === null) return;
  const url = new URL(
    `/lists/${encodeURIComponent(list.value.slug)}`,
    window.location.origin,
  ).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast.show('Member link copied. Sign-in is required to view or take part.', 'success');
  } catch {
    toast.show('Copy failed. You can share this page address with community members.', 'error');
  }
};
watch(() => route.params.slug, load, { immediate: true });
usePageTitle(() => list.value?.title ?? null);

const next = computed(() => (list.value === null ? null : nextEvent(list.value, new Date())));
const showNominate = computed(
  () =>
    list.value !== null &&
    list.value.entryMode === 'nominations' &&
    (list.value.lifecycle === 'open' || list.value.lifecycle === 'scheduled'),
);
/** Members rate while the list is open; once it closes they still see their own scores. */
const canVote = computed(
  () => list.value?.lifecycle === 'open' && list.value.viewer.canParticipate,
);
const listClosed = computed(
  () => list.value?.lifecycle === 'closed' || list.value?.lifecycle === 'archived',
);
const ratedCount = computed(
  () => list.value?.entries.filter((entry) => scores.value[entry.id] !== undefined).length ?? 0,
);
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

const onScored = (ballot: BallotDto) => {
  scores.value = ballot.scores;
  const slug = encodeURIComponent(String(route.params.slug));
  void api.get<PublicScoresDto>(`/api/lists/${slug}/scores`).then((result) => {
    if (result.ok) publicScores.value = result.data;
  });
};
</script>

<template>
  <ErrorNotice :error="error" />
  <p v-if="list === null && error === null" class="meta" aria-live="polite">Loading…</p>

  <article v-if="list !== null" class="list-page">
    <header class="page-header">
      <div>
        <h1>{{ list.title }}</h1>
        <p class="meta">
          <StatusBadge :lifecycle="list.lifecycle" :hidden="list.visibility === 'hidden'" />
          {{ sourceLabel[list.itemSource.kind] }} · rated {{ list.scale.min }}–{{ list.scale.max }}
        </p>
      </div>
      <RouterLink
        v-if="session.me?.isAdmin === true"
        :to="{ name: 'edit-list', params: { slug: list.slug } }"
        class="button"
      >
        Edit
      </RouterLink>
      <button type="button" class="button share-link" @click="copyMemberLink">
        Copy member link
      </button>
    </header>

    <p v-if="list.description !== ''" class="lead">{{ list.description }}</p>
    <EventCountdown v-if="next !== null" :label="next.label" :at="next.at" />
    <p
      v-if="list.lifecycle === 'open' && list.schedule !== null && list.schedule.closesAt === null"
      class="meta"
    >
      Voting stays open until an Admin closes it.
    </p>

    <nav
      v-if="list.lifecycle === 'open' || listClosed"
      class="list-jump"
      aria-label="List sections"
    >
      <a href="#entries-heading">{{ canVote ? 'Rate entries' : 'Entries' }}</a>
      <a href="#leaderboard-heading">Leaderboard</a>
      <a v-if="showNominate" href="#nomination-panel">Nominate</a>
      <RouterLink :to="{ name: 'list-results', params: { slug: list.slug } }">
        Full results
      </RouterLink>
    </nav>

    <div class="list-workspace">
      <section class="list-entries" aria-labelledby="entries-heading">
        <h2 id="entries-heading">
          {{
            list.entryMode === 'seeded'
              ? canVote
                ? 'Rate these'
                : 'List items'
              : 'All community nominations'
          }}
          <span class="meta">({{ list.entries.length }})</span>
        </h2>
        <p v-if="list.entryMode === 'nominations'" class="meta list-context">
          This is the full list, including entries nominated by other members.<template
            v-if="canVote"
          >
            You can rate any entry while voting is open.</template
          >
        </p>
        <p v-if="list.lifecycle === 'open' || listClosed" class="meta list-order">
          <template v-if="leaderboardRows !== null">
            Sorted by the current leaderboard, provisional entries included in place.
          </template>
          <template v-else>Not in ranking order: results are hidden until voting closes.</template>
          <RouterLink :to="{ name: 'list-results', params: { slug: list.slug } }">
            See the full results
          </RouterLink>
          for a read-only ranking.
        </p>
        <p v-if="list.scoreVisibility === 'public'" class="notice public-score-notice">
          Scores on this list are public: other members can see the score you give each entry.
        </p>
        <p v-if="canVote && list.entries.length > 0" class="meta ballot-progress">
          <strong>{{ ratedCount }} of {{ list.entries.length }}</strong> rated.
          <template v-if="list.scoreVisibility !== 'public'">
            Your scores are private: only you can see them.
          </template>
        </p>
        <p v-else-if="list.lifecycle === 'open' && !list.viewer.canParticipate" class="meta">
          This list is open only to members with {{ requiredRolesText }}, so you can’t rate it.
        </p>
        <p v-if="list.entries.length === 0" class="empty">Nothing nominated yet.</p>
        <ul v-else class="entries">
          <EntryCard v-for="entry in orderedEntries" :key="entry.id" :entry="entry">
            <p v-if="standingsByEntry[entry.id] !== undefined" class="entry__standing">
              <template v-if="standingsByEntry[entry.id]?.rank === null">
                Pending · no votes yet
              </template>
              <template v-else>
                Rank {{ standingsByEntry[entry.id]?.rank }} ·
                {{ standingsByEntry[entry.id]?.score?.toFixed(1) }} ·
                {{ standingsByEntry[entry.id]?.votes }}
                {{ standingsByEntry[entry.id]?.votes === 1 ? 'vote' : 'votes' }}
                <span v-if="standingsByEntry[entry.id]?.provisional" class="tag">Provisional</span>
              </template>
            </p>
            <PublicScoreDisclosure
              v-if="publicScores.visible"
              :scores="publicScores.entries[entry.id] ?? []"
            />
            <ScorePicker
              v-if="canVote"
              :list-id="list.id"
              :entry-id="entry.id"
              :entry-title="entry.item.title"
              :scale="list.scale"
              :score="scores[entry.id] ?? null"
              @changed="onScored"
            />
            <p v-else-if="listClosed && scores[entry.id] !== undefined" class="entry__meta">
              Your score: <strong>{{ scores[entry.id] }}</strong>
            </p>
          </EntryCard>
        </ul>
      </section>

      <aside
        v-if="showNominate || list.lifecycle === 'open' || listClosed"
        class="list-sidebar"
        aria-label="Nominate and leaderboard"
      >
        <details v-if="showNominate" id="nomination-panel" class="sidebar-disclosure">
          <summary>Nominate another item</summary>
          <NominatePanel :list="list" @nominated="load" />
        </details>
        <div v-if="list.lifecycle === 'open' || listClosed" class="list-sidebar__standings">
          <LeaderboardPanel
            :key="list.entries.length"
            :list="list.slug"
            :my-scores="scores"
            :public-scores="publicScores"
            @loaded="onLeaderboardLoaded"
          />
        </div>
      </aside>
    </div>

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
  </article>
</template>
