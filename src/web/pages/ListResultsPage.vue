<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { LeaderboardDto, ListDetailDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import StandingsBoard from '../components/StandingsBoard.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import { usePageTitle } from '../lib/page-title.ts';

const route = useRoute();
const list = ref<ListDetailDto | null>(null);
const board = ref<LeaderboardDto | null>(null);
const error = ref<ApiError | null>(null);

const load = async () => {
  const slug = encodeURIComponent(String(route.params.slug));
  const [detail, leaderboard] = await Promise.all([
    api.get<ListDetailDto>(`/api/lists/${slug}`),
    api.get<LeaderboardDto>(`/api/lists/${slug}/leaderboard`),
  ]);
  if (!detail.ok) {
    error.value = detail.error;
    return;
  }
  list.value = detail.data;
  if (leaderboard.ok) {
    board.value = leaderboard.data;
    error.value = null;
  } else {
    error.value = leaderboard.error;
  }
};
watch(() => route.params.slug, load, { immediate: true });
usePageTitle(() => (list.value === null ? null : `${list.value.title}: results`));

const final = computed(
  () => list.value?.lifecycle === 'closed' || list.value?.lifecycle === 'archived',
);
const canRate = computed(
  () => list.value?.lifecycle === 'open' && list.value.viewer.canParticipate,
);
const canNominate = computed(
  () => list.value?.entryMode === 'nominations' && list.value.viewer.canNominate,
);
</script>

<template>
  <ErrorNotice :error="error" />
  <p v-if="list === null && error === null" class="meta" aria-live="polite">Loading…</p>

  <article v-if="list !== null" class="results-page">
    <p class="back-link">
      <RouterLink :to="{ name: 'list', params: { slug: list.slug } }">Back to the list</RouterLink>
    </p>
    <header class="results-hero">
      <p class="results-hero__kicker">
        <StatusBadge :lifecycle="list.lifecycle" :hidden="list.visibility === 'hidden'" />
        <span>{{ final ? 'Final results' : 'Live standings' }}</span>
      </p>
      <h1>{{ list.title }}</h1>
      <p class="lead">
        {{ final ? 'Final results.' : 'Where things stand right now. Positions can still change.' }}
      </p>
      <div v-if="canRate || canNominate" class="results-hero__actions">
        <RouterLink
          v-if="canRate"
          :to="{ name: 'list', params: { slug: list.slug } }"
          class="button button--primary"
        >
          Rate entries
        </RouterLink>
        <RouterLink
          v-if="canNominate"
          :to="{ name: 'list', params: { slug: list.slug }, query: { tab: 'nominate' } }"
          class="button"
        >
          Nominate items
        </RouterLink>
      </div>
    </header>

    <StandingsBoard
      v-if="board !== null"
      :board="board"
      :entries="list.entries"
      :scale="list.scale"
      heading-level="h2"
    />

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
  </article>
</template>
