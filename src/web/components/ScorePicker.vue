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

const id = computed(() => `score-${props.entryId}`);
const sliderValue = computed(() => props.score ?? props.scale.min);
const sliderDescription = computed(() =>
  props.score === null
    ? `Not rated. Low ${String(props.scale.min)} is on the left; high ${String(props.scale.max)} is on the right.`
    : `${String(props.score)}. Low ${String(props.scale.min)} is on the left; high ${String(props.scale.max)} is on the right.`,
);
const saving = ref(false);
const status = ref('');
const error = ref<ApiError | null>(null);

const saveScore = async (score: number | null, slider?: HTMLInputElement) => {
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
    if (slider !== undefined) slider.value = String(sliderValue.value);
    return;
  }
  status.value = score === null ? 'Score cleared' : 'Saved';
  emit('changed', result.data);
};

const change = (event: Event) => {
  const slider = event.currentTarget as HTMLInputElement;
  void saveScore(Number(slider.value), slider);
};

const clear = () => {
  void saveScore(null);
};
</script>

<template>
  <div class="score">
    <label :for="id" class="score__label">
      Your score<span class="visually-hidden"> for {{ entryTitle }}</span>
    </label>
    <output :for="id" class="score__value" :aria-label="`Current score for ${entryTitle}`">
      {{ score ?? 'Not rated' }}
    </output>
    <input
      :id="id"
      class="score__range"
      type="range"
      :min="scale.min"
      :max="scale.max"
      step="1"
      :value="sliderValue"
      :aria-valuetext="sliderDescription"
      :disabled="saving"
      :aria-describedby="`${id}-ends ${id}-status`"
      @change="change"
    />
    <div :id="`${id}-ends`" class="score__ends" aria-hidden="true">
      <span>Low · {{ scale.min }}</span>
      <span>High · {{ scale.max }}</span>
    </div>
    <button
      v-if="score !== null"
      type="button"
      class="score__clear"
      :disabled="saving"
      :aria-label="`Clear score for ${entryTitle}`"
      @click="clear"
    >
      Clear score
    </button>
    <span :id="`${id}-status`" class="score__status" aria-live="polite">
      <template v-if="error !== null">{{ error.message }}</template>
      <template v-else>{{ status }}</template>
    </span>
  </div>
</template>
