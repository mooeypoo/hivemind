<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import type { EntryDto, ListDetailDto, SetEntryAsideRequest } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts.ts';
import AppDialog from './ui/AppDialog.vue';
import ErrorNotice from './ErrorNotice.vue';

const props = defineProps<{ entry: EntryDto | null; list: ListDetailDto }>();
const emit = defineEmits<{ close: []; saved: [entry: EntryDto] }>();
const reason = ref('');
const busy = ref(false);
const error = ref<ApiError | null>(null);
const id = useId();
const draftKey = computed(
  () => `set-aside:${props.list.id}:${props.entry?.id ?? ''}:${props.entry?.deletionToken ?? ''}`,
);
watch(
  () => props.entry,
  (entry) => {
    error.value = null;
    const draft = loadDraft(draftKey.value);
    reason.value = typeof draft === 'string' ? draft : (entry?.setAsideReason ?? '');
  },
  { immediate: true },
);
const setReason = (event: Event) => {
  if (!(event.target instanceof HTMLTextAreaElement)) return;
  reason.value = event.target.value;
  saveDraft(draftKey.value, reason.value);
};
const valid = computed(() => reason.value.trim().length > 0 && reason.value.trim().length <= 500);
const save = async (restore = false) => {
  const entry = props.entry;
  if (busy.value || entry?.deletionToken == null || (!restore && !valid.value)) return;
  busy.value = true;
  error.value = null;
  const body: SetEntryAsideRequest = {
    entryId: entry.id,
    token: entry.deletionToken,
    expectedReason: entry.setAsideReason ?? null,
    reason: restore ? null : reason.value,
  };
  try {
    const result = await api.put<EntryDto>(
      `/api/lists/${encodeURIComponent(props.list.id)}/entries/set-aside`,
      body,
    );
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    clearDraft(draftKey.value);
    emit('saved', result.data);
  } finally {
    busy.value = false;
  }
};
const close = () => {
  if (!busy.value) emit('close');
};
</script>

<template>
  <AppDialog
    :open="entry !== null"
    :title="`${entry?.setAsideReason == null ? 'Set aside' : 'Edit set-aside status'}: ${entry?.item.title ?? ''}`"
    @close="close"
  >
    <p>
      Set this entry aside as outside the list's criteria. Existing ratings are kept, and members
      can continue rating it while voting is open.
    </p>
    <p v-if="list.lifecycle === 'closed'" class="notice">
      Voting has ended. Changing this classification changes the final standings.
    </p>
    <form :id="`${id}-form`" class="stack" @submit.prevent="save()">
      <label :for="`${id}-reason`">Reason shown to members</label>
      <textarea
        :id="`${id}-reason`"
        :value="reason"
        :disabled="busy"
        required
        maxlength="500"
        rows="4"
        :aria-describedby="`${id}-help`"
        @input="setReason"
      />
      <p :id="`${id}-help`" class="meta">
        {{ reason.length }}/500 characters. Describe the item, not personal information.
      </p>
      <ErrorNotice :error="error" />
    </form>
    <template #actions>
      <button
        v-if="entry?.setAsideReason != null"
        type="button"
        class="button"
        :disabled="busy"
        @click="save(true)"
      >
        Return to main ranking
      </button>
      <button type="button" class="button" :disabled="busy" @click="close">Cancel</button>
      <button
        type="submit"
        :form="`${id}-form`"
        class="button button--primary"
        :disabled="busy || !valid"
      >
        {{ busy ? 'Saving...' : entry?.setAsideReason == null ? 'Set aside' : 'Save explanation' }}
      </button>
    </template>
  </AppDialog>
</template>
