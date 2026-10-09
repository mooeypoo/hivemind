<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BallotDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';

const props = defineProps<{
  listId: string;
  entryId: string;
  entryTitle: string;
  scale: { min: number; max: number };
  score: number | null;
}>();
const emit = defineEmits<{ changed: [ballot: BallotDto] }>();

const options = computed(() =>
  Array.from({ length: props.scale.max - props.scale.min + 1 }, (_, i) => props.scale.min + i),
);
const id = computed(() => `score-${props.entryId}`);
const saving = ref(false);
const status = ref('');
const error = ref<ApiError | null>(null);

const change = async (event: Event) => {
  const raw = (event.target as HTMLSelectElement).value;
  const score = raw === '' ? null : Number(raw);
  saving.value = true;
  error.value = null;
  status.value = '';
  const result = await api.put<BallotDto>(`/api/lists/${props.listId}/ballot`, {
    entryId: props.entryId,
    score,
  });
  saving.value = false;
  if (!result.ok) {
    error.value = result.error;
    (event.target as HTMLSelectElement).value = props.score === null ? '' : String(props.score);
    return;
  }
  status.value = score === null ? 'Score cleared' : 'Saved';
  emit('changed', result.data);
};
</script>

<template>
  <div class="score">
    <label :for="id" class="score__label">
      Your score<span class="visually-hidden"> for {{ entryTitle }}</span>
    </label>
    <select
      :id="id"
      class="score__select"
      :value="score === null ? '' : String(score)"
      :disabled="saving"
      :aria-describedby="`${id}-status`"
      @change="change"
    >
      <option value="">Not rated</option>
      <option v-for="option in options" :key="option" :value="String(option)">{{ option }}</option>
    </select>
    <span :id="`${id}-status`" class="score__status" aria-live="polite">
      <template v-if="error !== null">{{ error.message }}</template>
      <template v-else>{{ status }}</template>
    </span>
  </div>
</template>
