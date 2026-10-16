<script setup lang="ts">
import { computed } from 'vue';
import type { ListDto } from '../../server/http/contracts.ts';
import { durationText, formatDateTime } from '../lib/datetime.ts';
import { sourceLabel } from '../lib/labels.ts';
import { nextEvent } from '../lib/next-event.ts';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ list: ListDto; canEdit: boolean }>();
const next = computed(() => nextEvent(props.list, new Date()));
const remaining = computed(() =>
  next.value === null ? null : new Date(next.value.at).getTime() - Date.now(),
);
</script>

<template>
  <article class="list-card" :class="`list-card--${list.lifecycle}`">
    <header class="list-card__header">
      <StatusBadge :lifecycle="list.lifecycle" :hidden="list.visibility === 'hidden'" />
      <span class="list-card__source">{{ sourceLabel[list.itemSource.kind] }}</span>
    </header>
    <h3 class="list-card__title">
      <!-- The link covers the whole card (see .list-card__title a::after). -->
      <RouterLink
        :to="{
          name: list.deleting === true ? 'edit-list' : 'list',
          params: { slug: list.deleting === true ? list.id : list.slug },
        }"
        >{{ list.title }}</RouterLink
      >
    </h3>
    <p v-if="list.description !== ''" class="list-card__description">{{ list.description }}</p>
    <p v-if="list.deleting === true" class="notice">Deletion in progress. Retry from the editor.</p>
    <p v-if="next !== null" class="list-card__next">
      {{ next.label }}
      <time :datetime="next.at" :title="formatDateTime(next.at)">
        <template v-if="remaining !== null && remaining > 0">
          in {{ durationText(remaining) }}
        </template>
        <template v-else>{{ formatDateTime(next.at) }}</template>
      </time>
    </p>
    <RouterLink
      v-if="canEdit"
      :to="{ name: 'edit-list', params: { slug: list.deleting === true ? list.id : list.slug } }"
      class="list-card__edit"
      :aria-label="`Edit ${list.title}`"
    >
      {{ list.deleting === true ? 'Retry deletion' : 'Edit' }}
    </RouterLink>
  </article>
</template>
