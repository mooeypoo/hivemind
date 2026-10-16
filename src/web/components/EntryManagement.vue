<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EntryDto, ListDetailDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import { useToast } from '../composables/toast.ts';
import EntrySetAsideDialog from './EntrySetAsideDialog.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import ErrorNotice from './ErrorNotice.vue';

const props = defineProps<{ list: ListDetailDto; reload: () => Promise<void> }>();
const emit = defineEmits<{ changed: []; cancel: [entryId: string] }>();
const toast = useToast();
const settingAside = ref<EntryDto | null>(null);
const deletion = ref<{ entryId: string; token: string; title: string } | null>(null);
const busy = ref(false);
const error = ref<ApiError | null>(null);
const final = computed(
  () => props.list.lifecycle === 'closed' || props.list.lifecycle === 'archived',
);
const beginSetAside = (entry: EntryDto) => {
  settingAside.value = entry;
};
const beginDeletion = (entry: EntryDto) => {
  if (entry.deletionToken == null) return;
  retryDeletion({ entryId: entry.id, token: entry.deletionToken, title: entry.item.title });
};
const retryDeletion = (entry: { entryId: string; token: string; title: string }) => {
  deletion.value = entry;
  error.value = null;
};
const savedSetAside = async (entry: EntryDto) => {
  settingAside.value = null;
  emit('changed');
  await props.reload();
  toast.show(
    entry.setAsideReason == null
      ? 'Entry returned to the main ranking.'
      : 'Set-aside explanation saved.',
    'success',
  );
};
const confirmDeletion = async () => {
  if (busy.value || deletion.value === null) return;
  busy.value = true;
  error.value = null;
  try {
    const result = await api.post<undefined>(
      `/api/lists/${encodeURIComponent(props.list.id)}/entries/delete`,
      {
        entryId: deletion.value.entryId,
        token: deletion.value.token,
        confirmation: deletion.value.title,
      },
    );
    // Even failed cleanup can pause participation; refresh the deletion's retry state.
    await props.reload();
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    deletion.value = null;
    emit('changed');
    toast.show('Entry and its scores permanently deleted.', 'success');
  } finally {
    busy.value = false;
  }
};
const cancelDeletion = () => {
  if (busy.value || deletion.value === null) return;
  emit('cancel', deletion.value.entryId);
  deletion.value = null;
};
defineExpose({ beginSetAside, beginDeletion, retryDeletion });
</script>

<template>
  <EntrySetAsideDialog
    :entry="settingAside"
    :list="list"
    @close="settingAside = null"
    @saved="savedSetAside"
  />
  <ConfirmDialog
    :open="deletion !== null"
    :title="`Permanently delete ${deletion?.title ?? 'entry'}?`"
    confirm-label="Delete entry permanently"
    :confirm-text="deletion?.title ?? ''"
    :busy="busy"
    danger
    @cancel="cancelDeletion"
    @confirm="confirmDeletion"
  >
    <p>
      This cannot be undone. The entry, all its scores and nomination records will be erased. Its
      nomination allowance will be freed. If nominated again, it starts with no previous scores.
    </p>
    <p v-if="final">
      This list has finished voting. Deletion changes its final results and may change every rank.
    </p>
    <p>
      Ranking will be recalculated. Nominations and score changes pause for this list until cleanup
      finishes. Once started, deletion must be finished; closing this dialog does not cancel it.
      Previously downloaded backups are not erased.
    </p>
    <ErrorNotice :error="error" />
  </ConfirmDialog>
</template>
