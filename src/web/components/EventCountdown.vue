<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { durationText, formatDateTime } from '../lib/datetime.ts';

const props = defineProps<{ label: string; at: string }>();

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
});
onBeforeUnmount(() => {
  clearInterval(timer);
});

const remaining = computed(() => new Date(props.at).getTime() - now.value);
</script>

<template>
  <p class="countdown">
    <span class="countdown__label">{{ label }}</span>
    <template v-if="remaining > 0">
      in <strong>{{ durationText(remaining) }}</strong>
    </template>
    <time :datetime="at" class="countdown__at">({{ formatDateTime(at) }})</time>
  </p>
</template>
