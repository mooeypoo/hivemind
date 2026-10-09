<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LeaderboardDto } from '../../server/http/contracts.ts';
import { durationText, formatDateTime } from '../lib/datetime.ts';
import { api, type ApiError } from '../services/api.ts';
import ErrorNotice from './ErrorNotice.vue';

const props = defineProps<{
  list: string;
  /** The caller's own scores, shown beside the community's. */
  myScores: Readonly<Record<string, number>>;
}>();

const board = ref<LeaderboardDto | null>(null);
const error = ref<ApiError | null>(null);
const loading = ref(false);

const load = async () => {
  loading.value = true;
  const result = await api.get<LeaderboardDto>(
    `/api/lists/${encodeURIComponent(props.list)}/leaderboard`,
  );
  loading.value = false;
  if (result.ok) {
    board.value = result.data;
    error.value = null;
  } else {
    error.value = result.error;
  }
};
onMounted(load);
defineExpose({ refresh: load });

const visible = computed(() => (board.value !== null && !board.value.hidden ? board.value : null));
const anyVotes = computed(() => visible.value?.rows.some((row) => row.votes > 0) ?? false);
const updated = computed(() => {
  if (visible.value === null) return '';
  const age = Date.now() - new Date(visible.value.computedAt).getTime();
  return age < 60_000 ? 'Updated just now' : `Updated ${durationText(age)} ago`;
});
</script>

<template>
  <section class="leaderboard" aria-labelledby="leaderboard-heading">
    <div class="leaderboard__header">
      <h2 id="leaderboard-heading">Leaderboard</h2>
      <button
        v-if="visible !== null"
        type="button"
        class="button"
        :disabled="loading"
        @click="load"
      >
        Refresh
      </button>
    </div>

    <ErrorNotice :error="error" />

    <p v-if="board?.hidden === true" class="notice">
      <template v-if="board.revealsAt !== null">
        Results are revealed when voting closes,
        <time :datetime="board.revealsAt">{{ formatDateTime(board.revealsAt) }}</time
        >.
      </template>
      <template v-else>Results are revealed when an Admin closes voting.</template>
    </p>

    <template v-else-if="visible !== null">
      <p v-if="!anyVotes" class="empty">No votes yet.</p>
      <template v-else>
        <p class="meta">
          {{ updated }}. Entries with fewer than {{ visible.minVotes }} votes are provisional.
        </p>
        <ol class="ranking">
          <li v-for="row in visible.rows" :key="row.entryId" class="ranking__row">
            <span
              class="ranking__rank"
              :aria-label="row.rank === null ? 'Unranked' : `Rank ${String(row.rank)}`"
            >
              {{ row.rank ?? '–' }}
            </span>
            <span class="ranking__title">
              <strong>{{ row.item.title }}</strong>
              <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
              <span v-if="row.provisional && row.votes > 0" class="tag">
                Provisional · needs {{ row.votesNeeded }} more
                {{ row.votesNeeded === 1 ? 'vote' : 'votes' }}
              </span>
            </span>
            <span class="ranking__numbers">
              <template v-if="row.score !== null">
                <strong>{{ row.score.toFixed(1) }}</strong>
                <span class="meta">
                  · {{ row.votes }} {{ row.votes === 1 ? 'vote' : 'votes' }}</span
                >
              </template>
              <span v-else class="meta">No votes yet</span>
              <span v-if="myScores[row.entryId] !== undefined" class="meta">
                · you: {{ myScores[row.entryId] }}
              </span>
            </span>
          </li>
        </ol>
      </template>
    </template>
  </section>
</template>
