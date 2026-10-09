<script setup lang="ts">
import type { Lifecycle } from '../../server/http/contracts.ts';
import { lifecycleLabel } from '../lib/labels.ts';

defineProps<{ lifecycle: Lifecycle; hidden?: boolean }>();
</script>

<template>
  <span class="badges">
    <span class="badge" :class="`badge--${lifecycle}`">{{ lifecycleLabel[lifecycle] }}</span>
    <span v-if="hidden" class="badge badge--hidden">Hidden</span>
  </span>
</template>
