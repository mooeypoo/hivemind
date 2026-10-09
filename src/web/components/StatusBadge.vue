<script setup lang="ts">
import type { Lifecycle } from '../../server/http/contracts.ts';
import { lifecycleLabel } from '../lib/labels.ts';

defineProps<{ lifecycle: Lifecycle }>();
</script>

<template>
  <span class="badge" :class="`badge--${lifecycle}`">{{ lifecycleLabel[lifecycle] }}</span>
</template>
