<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ value: number; max: number }>();
const width = computed(() =>
  props.max <= 0 ? 0 : Math.min(100, Math.max(0, (props.value / props.max) * 100)),
);
</script>

<template>
  <svg class="proportion-bar" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true">
    <rect class="proportion-bar__track" width="100" height="4" rx="2" />
    <rect class="proportion-bar__value" :width="width" height="4" rx="2" />
  </svg>
</template>
