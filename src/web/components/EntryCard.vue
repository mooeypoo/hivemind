<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EntryDto } from '../../server/http/contracts.ts';

const props = defineProps<{ entry: EntryDto }>();
/** A poster that fails to load falls back to the text tile. */
const imageFailed = ref(false);
const initials = computed(() =>
  props.entry.item.title
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join(''),
);
</script>

<template>
  <li class="entry">
    <img
      v-if="entry.item.imageUrl !== null && !imageFailed"
      :src="entry.item.imageUrl"
      :alt="`Poster for ${entry.item.title}`"
      class="entry__image"
      loading="lazy"
      width="342"
      height="513"
      @error="imageFailed = true"
    />
    <div v-else class="entry__image entry__image--text" aria-hidden="true">{{ initials }}</div>
    <div class="entry__body">
      <h3 class="entry__title">{{ entry.item.title }}</h3>
      <p v-if="entry.item.subtitle !== null" class="entry__subtitle">{{ entry.item.subtitle }}</p>
      <p class="entry__meta">
        <span v-if="entry.isMine" class="tag">Your nomination</span>
        <span v-else-if="entry.nominatedBy !== null">Nominated by {{ entry.nominatedBy }}</span>
      </p>
    </div>
  </li>
</template>
