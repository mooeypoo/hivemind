<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type {
  LeaderboardDto,
  EntryDto,
  ListDetailDto,
  PublicScoresDto,
} from '../../server/http/contracts.ts';
import { durationText } from '../lib/datetime.ts';
import { api, type ApiError } from '../services/api.ts';
import ErrorNotice from './ErrorNotice.vue';
import StandingsBoard from './StandingsBoard.vue';

const props = defineProps<{
  list: ListDetailDto;
  /** The caller's own scores, shown beside the community's. */
  myScores: Readonly<Record<string, number>>;
  publicScores?: PublicScoresDto | undefined;
  canVote?: boolean | undefined;
  canDelete?: boolean | undefined;
  canSetAside?: boolean | undefined;
  scoreState?:
    | ((entryId: string) => { value: number | null; saving: boolean; error: string | null })
    | undefined;
}>();
const emit = defineEmits<{
  loaded: [board: LeaderboardDto];
  rate: [entryId: string, score: number | null];
  delete: [entry: EntryDto];
  setAside: [entry: EntryDto];
}>();

const board = ref<LeaderboardDto | null>(null);
const error = ref<ApiError | null>(null);
const loading = ref(false);

const load = async () => {
  loading.value = true;
  const result = await api.get<LeaderboardDto>(
    `/api/lists/${encodeURIComponent(props.list.slug)}/leaderboard`,
  );
  loading.value = false;
  if (result.ok) {
    board.value = result.data;
    error.value = null;
    emit('loaded', result.data);
  } else {
    error.value = result.error;
  }
};
watch(() => props.list, load, { immediate: true });
defineExpose({ refresh: load });

const updated = computed(() => {
  if (board.value === null || board.value.hidden) return '';
  const age = Date.now() - new Date(board.value.computedAt).getTime();
  return age < 60_000 ? 'Updated just now' : `Updated ${durationText(age)} ago`;
});
</script>

<template>
  <section class="leaderboard" aria-labelledby="leaderboard-heading">
    <div class="leaderboard__header">
      <h2 id="leaderboard-heading">Leaderboard</h2>
      <p v-if="updated !== ''" class="meta">{{ updated }}</p>
      <button
        v-if="board !== null && !board.hidden"
        type="button"
        class="button button--quiet"
        :disabled="loading"
        @click="load"
      >
        Refresh
      </button>
    </div>

    <ErrorNotice :error="error" />

    <StandingsBoard
      v-if="board !== null"
      :board="board"
      :entries="list.entries"
      :scale="list.scale"
      :my-scores="myScores"
      :can-vote="canVote"
      :can-delete="canDelete"
      :can-set-aside="canSetAside"
      :score-state="scoreState"
      v-bind="publicScores === undefined ? {} : { publicScores }"
      @rate="emit('rate', $event.entryId, $event.score)"
      @delete="emit('delete', $event)"
      @set-aside="emit('setAside', $event)"
    />
  </section>
</template>
