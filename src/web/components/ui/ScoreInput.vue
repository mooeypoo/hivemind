<script setup lang="ts">
import { computed, useId } from 'vue';
import { scaleValues, usesScoreChips } from '../../lib/items.ts';

const props = defineProps<{
  value: number | null;
  scale: { readonly min: number; readonly max: number };
  /** What is being scored, for assistive technology: "Blade Runner". */
  itemTitle: string;
  saving?: boolean;
  error?: string | null;
  size?: 'normal' | 'large';
}>();
const emit = defineEmits<{ change: [value: number | null] }>();

const id = useId();
const chips = computed(() => usesScoreChips(props.scale));
const values = computed(() => scaleValues(props.scale));
/** At most five chips a row, so each stays 44 px wide at 320 px: 1–5 one row, 1–10 two of five. */
const columns = computed(() => {
  const count = values.value.length;
  if (count <= 5) return count;
  return count <= 10 ? Math.ceil(count / 2) : 4;
});
const status = computed(() => {
  if (props.error != null) return props.error;
  if (props.saving) return 'Saving…';
  return '';
});

const onSlide = (event: Event) => {
  emit('change', Number((event.currentTarget as HTMLInputElement).value));
};
</script>

<template>
  <fieldset
    class="score-input"
    :class="{ 'score-input--large': size === 'large', 'score-input--rated': value !== null }"
    :aria-describedby="`${id}-status`"
  >
    <legend class="score-input__legend">
      Your score<span class="visually-hidden"> for {{ itemTitle }}</span>
      <span v-if="value === null" class="score-input__unrated">Not rated</span>
    </legend>

    <div v-if="chips" class="score-input__chips" :class="`score-input__chips--cols-${columns}`">
      <label
        v-for="option in values"
        :key="option"
        class="score-chip"
        :class="{ 'score-chip--on': value === option }"
      >
        <input
          type="radio"
          :name="id"
          :value="option"
          :checked="value === option"
          @change="emit('change', option)"
        />
        <span>{{ option }}</span>
      </label>
    </div>

    <div v-else class="score-input__slider">
      <input
        :id="`${id}-range`"
        type="range"
        :min="scale.min"
        :max="scale.max"
        step="1"
        :value="value ?? scale.min"
        :aria-label="`Your score for ${itemTitle}`"
        :aria-valuetext="value === null ? 'Not rated' : String(value)"
        @change="onSlide"
      />
      <output :for="`${id}-range`" class="score-input__value">{{ value ?? '–' }}</output>
    </div>

    <div class="score-input__footer">
      <span
        :id="`${id}-status`"
        class="score-input__status"
        :class="{ 'score-input__status--error': error != null }"
        aria-live="polite"
        >{{ status }}</span
      >
      <button
        v-if="value !== null"
        type="button"
        class="score-input__clear"
        :aria-label="`Clear score for ${itemTitle}`"
        @click="emit('change', null)"
      >
        Clear
      </button>
    </div>
  </fieldset>
</template>
