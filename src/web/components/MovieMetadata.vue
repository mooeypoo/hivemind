<script setup lang="ts">
import type { CatalogItemDto } from '../../server/http/contracts.ts';

defineProps<{ item: CatalogItemDto }>();
</script>

<template>
  <div v-if="item.source === 'tmdb-movie'" class="movie-metadata">
    <p v-if="item.subtitle !== null" class="entry-details__subtitle">{{ item.subtitle }}</p>
    <p v-if="item.overview != null" class="entry-details__overview">{{ item.overview }}</p>
    <p v-else class="meta">No overview available.</p>
    <dl v-if="item.director != null || item.cast != null" class="entry-details__credits">
      <div v-if="item.director != null">
        <dt>Director</dt>
        <dd>{{ item.director }}</dd>
      </div>
      <div v-if="item.cast != null && item.cast.length > 0">
        <dt>Starring</dt>
        <dd>{{ item.cast.join(', ') }}</dd>
      </div>
    </dl>
  </div>
  <p v-else-if="item.subtitle !== null" class="entry-details__subtitle">
    {{ item.subtitle }}
  </p>
</template>
