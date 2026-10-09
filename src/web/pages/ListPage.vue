<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { ListDetailDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import EventCountdown from '../components/EventCountdown.vue';
import EntryCard from '../components/EntryCard.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import NominatePanel from '../components/NominatePanel.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import { sourceLabel } from '../lib/labels.ts';
import { nextEvent } from '../lib/next-event.ts';
import { session } from '../state/session.ts';

const route = useRoute();
const list = ref<ListDetailDto | null>(null);
const error = ref<ApiError | null>(null);

const load = async () => {
  const result = await api.get<ListDetailDto>(
    `/api/lists/${encodeURIComponent(String(route.params.slug))}`,
  );
  if (result.ok) {
    list.value = result.data;
    error.value = null;
  } else {
    error.value = result.error;
  }
};
watch(() => route.params.slug, load, { immediate: true });

const next = computed(() => (list.value === null ? null : nextEvent(list.value, new Date())));
const showNominate = computed(
  () =>
    list.value !== null &&
    list.value.entryMode === 'nominations' &&
    (list.value.lifecycle === 'open' || list.value.lifecycle === 'scheduled'),
);
</script>

<template>
  <ErrorNotice :error="error" />
  <p v-if="list === null && error === null" class="meta" aria-live="polite">Loading…</p>

  <article v-if="list !== null" class="list-page">
    <header class="page-header">
      <div>
        <h1>{{ list.title }}</h1>
        <p class="meta">
          <StatusBadge :lifecycle="list.lifecycle" />
          {{ sourceLabel[list.itemSource.kind] }} · rated {{ list.scale.min }}–{{ list.scale.max }}
        </p>
      </div>
      <RouterLink
        v-if="session.me?.isAdmin === true"
        :to="{ name: 'edit-list', params: { slug: list.slug } }"
        class="button"
      >
        Edit
      </RouterLink>
    </header>

    <p v-if="list.description !== ''" class="lead">{{ list.description }}</p>
    <EventCountdown v-if="next !== null" :label="next.label" :at="next.at" />

    <NominatePanel v-if="showNominate" :list="list" @nominated="load" />

    <section aria-labelledby="entries-heading">
      <h2 id="entries-heading">
        Entries <span class="meta">({{ list.entries.length }})</span>
      </h2>
      <p v-if="list.entries.length === 0" class="empty">Nothing nominated yet.</p>
      <ul v-else class="entries">
        <EntryCard v-for="entry in list.entries" :key="entry.id" :entry="entry" />
      </ul>
    </section>

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
  </article>
</template>
