<script setup lang="ts">
import type { Lifecycle, Viewers } from '../../server/http/contracts.ts';
import { lifecycleLabel } from '../lib/labels.ts';

defineProps<{ lifecycle: Lifecycle; viewers?: Viewers; review?: boolean }>();
</script>

<template>
  <span class="badges">
    <span class="badge" :class="`badge--${lifecycle}`">{{ lifecycleLabel[lifecycle] }}</span>
    <span v-if="viewers === 'site-admins'" class="badge badge--hidden">Hidden</span>
    <span
      v-else-if="viewers === 'roles'"
      class="badge badge--limited"
      title="Only members with particular roles can see this list"
      >Some roles</span
    >
    <span v-if="review" class="badge badge--review">Access needs review</span>
  </span>
</template>
