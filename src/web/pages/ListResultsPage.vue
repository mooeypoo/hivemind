<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { LeaderboardDto, ListDetailDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import { formatDateTime } from '../lib/datetime.ts';
import { buildResults, type ResultRow } from '../lib/results.ts';
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
const visible = computed(() => (board.value !== null && !board.value.hidden ? board.value : null));
const results = computed(() =>
  visible.value === null || list.value === null
    ? null
    : buildResults(visible.value.rows, list.value.entries),
);
const votesText = (votes: number) => `${String(votes)} ${votes === 1 ? 'person' : 'people'} voted`;
const details = (row: ResultRow) =>
  row.average === null
    ? 'No votes yet'
    : `${votesText(row.votes)} · average ${row.average.toFixed(1)}`;
</script>

<template>
  <ErrorNotice :error="error" />
  <p v-if="list === null && error === null" class="meta" aria-live="polite">Loading…</p>

  <article v-if="list !== null" class="results-page">
    <p class="back-link">
      <RouterLink :to="{ name: 'list', params: { slug: list.slug } }">Back to the list</RouterLink>
    </p>
    <header class="page-header">
      <h1>{{ list.title }}</h1>
      <RouterLink
        v-if="canRate"
        :to="{ name: 'list', params: { slug: list.slug } }"
        class="button button--primary"
      >
        Rate entries
      </RouterLink>
    </header>
    <p class="lead">
      {{ final ? 'Final results.' : 'Where things stand right now. Positions can still change.' }}
    </p>

    <p v-if="board?.hidden === true" class="notice">
      <template v-if="board.revealsAt !== null">
        Results are revealed when voting closes,
        <time :datetime="board.revealsAt">{{ formatDateTime(board.revealsAt) }}</time
        >.
      </template>
      <template v-else>Results are revealed when an Admin closes voting.</template>
    </p>

    <template v-else-if="results !== null && visible !== null">
      <p class="meta">
        Positions use a weighted score that balances each entry’s average against how many people
        rated it, so a couple of high votes don’t outrank broad agreement.
      </p>

      <section class="results-group" aria-labelledby="ranked-heading">
        <h2 id="ranked-heading">Ranking</h2>
        <p v-if="results.ranked.length === 0" class="empty">
          No entry has enough votes for a place yet.
        </p>
        <ol v-else class="ranking">
          <li v-for="row in results.ranked" :key="row.entryId" class="ranking__row">
            <span class="ranking__rank" :aria-label="`Position ${String(row.position)}`">
              {{ row.position }}
            </span>
            <span class="ranking__title">
              <strong>{{ row.item.title }}</strong>
              <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
              <span v-if="row.nominatedBy !== null" class="results__nominator meta">
                Nominated by {{ row.nominatedBy }}
              </span>
            </span>
            <span class="ranking__numbers meta">{{ details(row) }}</span>
          </li>
        </ol>
      </section>

      <section
        v-if="results.provisional.length > 0"
        class="results-group"
        aria-labelledby="provisional-heading"
      >
        <h2 id="provisional-heading">Provisional</h2>
        <p class="meta">
          Fewer than {{ visible.minVotes }} votes so far, so these don’t have a place yet. Shown in
          their current order.
        </p>
        <ul class="ranking">
          <li v-for="row in results.provisional" :key="row.entryId" class="ranking__row">
            <span class="ranking__rank" aria-hidden="true">–</span>
            <span class="ranking__title">
              <strong>{{ row.item.title }}</strong>
              <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
              <span class="tag">
                Provisional · needs {{ row.votesNeeded }} more
                {{ row.votesNeeded === 1 ? 'vote' : 'votes' }}
              </span>
              <span v-if="row.nominatedBy !== null" class="results__nominator meta">
                Nominated by {{ row.nominatedBy }}
              </span>
            </span>
            <span class="ranking__numbers meta">{{ details(row) }}</span>
          </li>
        </ul>
      </section>

      <section
        v-if="results.unrated.length > 0"
        class="results-group"
        aria-labelledby="unrated-heading"
      >
        <h2 id="unrated-heading">Not rated yet</h2>
        <ul class="ranking">
          <li v-for="row in results.unrated" :key="row.entryId" class="ranking__row">
            <span class="ranking__rank" aria-hidden="true">–</span>
            <span class="ranking__title">
              <strong>{{ row.item.title }}</strong>
              <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
              <span v-if="row.nominatedBy !== null" class="results__nominator meta">
                Nominated by {{ row.nominatedBy }}
              </span>
            </span>
            <span class="ranking__numbers meta">No votes yet</span>
          </li>
        </ul>
      </section>
    </template>

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
  </article>
</template>
