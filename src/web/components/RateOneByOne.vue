<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { EntryDto } from '../../server/http/contracts.ts';
import AppDialog from './ui/AppDialog.vue';
import ItemArt from './ui/ItemArt.vue';
import ScoreInput from './ui/ScoreInput.vue';

const props = defineProps<{
  open: boolean;
  /** The entries still unrated when the member started; kept fixed while they rate. */
  queue: readonly EntryDto[];
  scale: { readonly min: number; readonly max: number };
  scores: Readonly<Record<string, number>>;
  saving: Readonly<Record<string, boolean>>;
  errors: Readonly<Record<string, string>>;
}>();
const emit = defineEmits<{ close: []; change: [entryId: string, value: number | null] }>();

const index = ref(0);
watch(
  () => props.open,
  (open) => {
    if (open) index.value = 0;
  },
);
const entry = computed(() => props.queue[index.value]);
const done = computed(() => index.value >= props.queue.length);
const ratedNow = computed(() => props.queue.filter((e) => props.scores[e.id] !== undefined).length);
const next = () => {
  index.value += 1;
};
</script>

<template>
  <AppDialog :open="open" title="Rate one by one" variant="stage" @close="emit('close')">
    <p class="one-by-one__progress meta" aria-live="polite">
      <template v-if="!done">{{ index + 1 }} of {{ queue.length }}</template>
      <template v-else>Done</template>
    </p>
    <div v-if="entry !== undefined" :key="entry.id" class="one-by-one">
      <ItemArt
        :title="entry.item.title"
        :subtitle="entry.item.subtitle"
        :image-url="entry.item.imageUrl"
        :alt="`Poster for ${entry.item.title}`"
        size="large"
      />
      <div class="one-by-one__body">
        <h3 class="one-by-one__title">{{ entry.item.title }}</h3>
        <p v-if="entry.item.subtitle !== null" class="meta">{{ entry.item.subtitle }}</p>
        <ScoreInput
          :value="scores[entry.id] ?? null"
          :scale="scale"
          :item-title="entry.item.title"
          :saving="saving[entry.id] === true"
          :error="errors[entry.id] ?? null"
          size="large"
          @change="emit('change', entry.id, $event)"
        />
      </div>
    </div>
    <div v-else class="one-by-one__done">
      <p class="one-by-one__cheer">
        You rated {{ ratedNow }} of {{ queue.length }}
        {{ queue.length === 1 ? 'entry' : 'entries' }}.
      </p>
      <p class="meta">You can change any score from the list until voting closes.</p>
    </div>
    <template #actions>
      <template v-if="!done">
        <button type="button" class="button" @click="emit('close')">Stop</button>
        <button
          type="button"
          class="button"
          :class="{ 'button--primary': entry !== undefined && scores[entry.id] !== undefined }"
          @click="next"
        >
          {{ entry !== undefined && scores[entry.id] !== undefined ? 'Next' : 'Skip' }}
        </button>
      </template>
      <button v-else type="button" class="button button--primary" @click="emit('close')">
        Back to the list
      </button>
    </template>
  </AppDialog>
</template>
