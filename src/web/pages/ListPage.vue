<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { BallotDto, ListDetailDto, RoleLabelsDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import EventCountdown from '../components/EventCountdown.vue';
import EntryCard from '../components/EntryCard.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import LeaderboardPanel from '../components/LeaderboardPanel.vue';
import NominatePanel from '../components/NominatePanel.vue';
import ScorePicker from '../components/ScorePicker.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import { sourceLabel } from '../lib/labels.ts';
import { nextEvent } from '../lib/next-event.ts';
import { session } from '../state/session.ts';
import { usePageTitle } from '../lib/page-title.ts';

const route = useRoute();
const list = ref<ListDetailDto | null>(null);
const error = ref<ApiError | null>(null);
/** The caller's own scores, by entry id. Nobody else's are ever loaded. */
const scores = ref<Readonly<Record<string, number>>>({});

const load = async () => {
  const slug = encodeURIComponent(String(route.params.slug));
  const [detail, ballot] = await Promise.all([
    api.get<ListDetailDto>(`/api/lists/${slug}`),
    api.get<BallotDto>(`/api/lists/${slug}/ballot`),
  ]);
  if (detail.ok) {
    list.value = detail.data;
    error.value = null;
  } else {
    error.value = detail.error;
  }
  if (ballot.ok) scores.value = ballot.data.scores;
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
    </header>

    <p v-if="list.description !== ''" class="lead">{{ list.description }}</p>
    <EventCountdown v-if="next !== null" :label="next.label" :at="next.at" />
    <p
      v-if="list.lifecycle === 'open' && list.schedule !== null && list.schedule.closesAt === null"
      class="meta"
    >
      Voting stays open until an Admin closes it.
    </p>

    <LeaderboardPanel v-if="listClosed" :list="list.slug" :my-scores="scores" />

    <NominatePanel v-if="showNominate" :list="list" @nominated="load" />

    <section aria-labelledby="entries-heading">
      <h2 id="entries-heading">
        {{ list.entryMode === 'seeded' && canVote ? 'Rate these' : 'Entries' }}
        <span class="meta">({{ list.entries.length }})</span>
      </h2>
      <p v-if="canVote && list.entries.length > 0" class="meta">
        You’ve rated {{ ratedCount }} of {{ list.entries.length }}. Your scores are private: only
        you can see them.
      </p>
      <p v-else-if="list.lifecycle === 'open' && !list.viewer.canParticipate" class="meta">
        This list is open only to members with {{ requiredRolesText }}, so you can’t rate it.
      </p>
      <p v-if="list.entries.length === 0" class="empty">Nothing nominated yet.</p>
      <ul v-else class="entries">
        <EntryCard v-for="entry in list.entries" :key="entry.id" :entry="entry">
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

    <LeaderboardPanel
      v-if="list.lifecycle === 'open'"
      :key="list.entries.length"
      :list="list.slug"
      :my-scores="scores"
    />

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
  </article>
</template>
