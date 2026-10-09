<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type {
  CatalogItemDto,
  EntryDto,
  ListDetailDto,
  SearchResultsDto,
} from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import { formatDateTime } from '../lib/datetime.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts.ts';
import ErrorNotice from './ErrorNotice.vue';

const props = defineProps<{ list: ListDetailDto }>();
const emit = defineEmits<{ nominated: [entry: EntryDto] }>();

const isFreeText = computed(() => props.list.itemSource.kind === 'freeform');
/** Nominations left, or null when they are unlimited. */
const left = computed(() => {
  const cap = props.list.maxNominationsPerMember;
  return cap === null ? null : cap - props.list.viewer.nominationsUsed;
});
const inList = computed(
  () => new Set(props.list.entries.map((entry) => `${entry.item.source}:${entry.item.externalId}`)),
);

/** Why the member can't nominate right now, or null if they can. */
const blocked = computed((): string | null => {
  const { lifecycle, schedule, viewer } = props.list;
  if (!viewer.canParticipate) return 'This list is open only to members with a particular role.';
  if (lifecycle === 'scheduled' && schedule !== null) {
    return `Nominations open ${formatDateTime(schedule.opensAt)}.`;
  }
  if (left.value !== null && left.value <= 0) {
    return `You’ve used all ${String(props.list.maxNominationsPerMember)} of your nominations.`;
  }
  if (!viewer.canNominate) return 'Nominations are closed for this list.';
  return null;
});

const error = ref<ApiError | null>(null);
const busy = ref(false);
const announcement = ref('');
const query = ref('');
const results = ref<readonly CatalogItemDto[]>([]);
const searched = ref(false);
const searching = ref(false);
let debounce: ReturnType<typeof setTimeout> | undefined;

const nominate = async (body: { externalId: string } | { title: string }) => {
  busy.value = true;
  error.value = null;
  const result = await api.post<EntryDto>(`/api/lists/${props.list.id}/entries`, body);
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return false;
  }
  announcement.value = `Nominated ${result.data.item.title}.`;
  if ('externalId' in body) {
    clearTimeout(debounce);
    query.value = '';
    results.value = [];
    searched.value = false;
    searching.value = false;
  }
  emit('nominated', result.data);
  return true;
};

// Search (TMDB and preset pools)
const search = async () => {
  const q = query.value.trim();
  if (q === '') {
    results.value = [];
    searched.value = false;
    searching.value = false;
    return;
  }
  searching.value = true;
  const result = await api.get<SearchResultsDto>(
    `/api/lists/${props.list.id}/search?q=${encodeURIComponent(q)}`,
  );
  if (q !== query.value.trim()) return; // a newer search is on its way
  searching.value = false;
  if (result.ok) {
    searched.value = true;
    results.value = result.data.items;
    error.value = null;
  } else {
    searched.value = false;
    error.value = result.error;
  }
};

watch(query, () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => void search(), 300);
});
onBeforeUnmount(() => {
  clearTimeout(debounce);
});

// Free text
const draftKey = `nominate:${props.list.id}`;
const savedTitle = loadDraft(draftKey);
const title = ref(typeof savedTitle === 'string' ? savedTitle : '');
watch(title, (value) => {
  saveDraft(draftKey, value);
});

const submitTitle = async () => {
  if (title.value.trim() === '') return;
  if (await nominate({ title: title.value })) {
    title.value = '';
    clearDraft(draftKey);
  }
};
</script>

<template>
  <section class="card nominate" aria-labelledby="nominate-heading">
    <h2 id="nominate-heading">Nominate</h2>

    <p v-if="blocked !== null" class="notice">{{ blocked }}</p>

    <template v-else>
      <p
        v-if="announcement !== ''"
        class="notice notice--success nomination-feedback"
        role="status"
      >
        {{ announcement }}
      </p>

      <p v-if="left === null" class="meta">
        Nominate as many as you like.
        <template v-if="list.viewer.nominationsUsed > 0">
          You’ve nominated {{ list.viewer.nominationsUsed }} so far.
        </template>
      </p>
      <p v-else class="meta">{{ left }} of {{ list.maxNominationsPerMember }} nominations left.</p>

      <form v-if="isFreeText" class="stack" @submit.prevent="submitTitle">
        <label for="nominate-title">Title</label>
        <input
          id="nominate-title"
          v-model="title"
          type="text"
          maxlength="200"
          required
          autocomplete="off"
        />
        <div class="actions">
          <button
            type="submit"
            class="button button--primary"
            :disabled="busy || title.trim() === ''"
          >
            Nominate
          </button>
        </div>
      </form>

      <div v-else class="stack">
        <label for="nominate-search">Search</label>
        <input
          id="nominate-search"
          v-model="query"
          type="search"
          maxlength="100"
          autocomplete="off"
          aria-describedby="nominate-search-hint"
          @input="announcement = ''"
        />
        <p id="nominate-search-hint" class="meta">Type at least a few letters of the title.</p>

        <p v-if="searching" class="search-status meta" role="status">Searching the catalog…</p>
        <p v-else-if="searched && results.length === 0" class="meta">
          No matches. Try another title.
        </p>
        <ul v-else-if="results.length > 0" class="results" aria-label="Search results">
          <li v-for="item in results" :key="item.externalId" class="result">
            <img
              v-if="item.imageUrl !== null"
              :src="item.imageUrl"
              alt=""
              class="result__image"
              loading="lazy"
              width="46"
              height="69"
            />
            <span class="result__text">
              <strong>{{ item.title }}</strong>
              <span v-if="item.subtitle !== null" class="result__subtitle">{{
                item.subtitle
              }}</span>
            </span>
            <span v-if="inList.has(`${item.source}:${item.externalId}`)" class="tag"
              >Already in the list</span
            >
            <button
              v-else
              type="button"
              class="button"
              :disabled="busy"
              @click="nominate({ externalId: item.externalId })"
            >
              Nominate
            </button>
          </li>
        </ul>
      </div>
    </template>

    <ErrorNotice :error="error" />
  </section>
</template>
