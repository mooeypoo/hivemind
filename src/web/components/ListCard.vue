<script setup lang="ts">
import { computed } from 'vue';
import type { ListDto } from '../../server/http/contracts.ts';
import { formatDateTime } from '../lib/datetime.ts';
import { sourceLabel } from '../lib/labels.ts';
import { nextEvent } from '../lib/next-event.ts';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ list: ListDto; canEdit: boolean }>();
const next = computed(() => nextEvent(props.list, new Date()));
</script>

<template>
  <article class="card list-card">
    <header class="list-card__header">
      <h2 class="list-card__title">
        <RouterLink :to="{ name: 'list', params: { slug: list.slug } }">{{
          list.title
        }}</RouterLink>
      </h2>
      <StatusBadge :lifecycle="list.lifecycle" :hidden="list.visibility === 'hidden'" />
    </header>
    <p v-if="list.description !== ''" class="list-card__description">{{ list.description }}</p>
    <p class="meta">
      <span>{{ sourceLabel[list.itemSource.kind] }}</span>
      <span v-if="next !== null">
        · {{ next.label }} <time :datetime="next.at">{{ formatDateTime(next.at) }}</time>
      </span>
    </p>
    <p v-if="canEdit" class="list-card__admin">
      <RouterLink :to="{ name: 'edit-list', params: { slug: list.slug } }">Edit</RouterLink>
    </p>
  </article>
</template>
