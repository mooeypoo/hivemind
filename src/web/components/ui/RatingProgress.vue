<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ done: number; total: number }>();

/** One bulb per entry while that stays readable; a bar beyond. */
const MAX_BULBS = 30;
const bulbs = computed(() =>
  props.total <= MAX_BULBS ? Array.from({ length: props.total }, (_, i) => i < props.done) : null,
);
</script>

<template>
  <div class="rating-progress" :class="{ 'rating-progress--complete': done === total }">
    <p class="rating-progress__text">
      <strong>{{ done }} of {{ total }}</strong> rated
    </p>
    <div v-if="bulbs !== null" class="rating-progress__bulbs" aria-hidden="true">
      <span
        v-for="(lit, index) in bulbs"
        :key="index"
        class="bulb"
        :class="{ 'bulb--lit': lit }"
      ></span>
    </div>
    <progress v-else class="rating-progress__bar" :value="done" :max="total" aria-hidden="true">
      {{ done }} of {{ total }}
    </progress>
  </div>
</template>
