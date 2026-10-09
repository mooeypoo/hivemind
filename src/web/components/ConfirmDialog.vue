<script setup lang="ts">
import { computed, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
  /**
   * For actions that can't be undone: the person must type this exactly before the confirm
   * button works.
   */
  confirmText?: string;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const typed = ref('');
const inputId = `confirm-${Math.random().toString(36).slice(2)}`;

const canConfirm = computed(
  () => props.confirmText === undefined || typed.value.trim() === props.confirmText,
);

watch(
  () => props.open,
  (open) => {
    typed.value = '';
    if (open) dialog.value?.showModal();
    else dialog.value?.close();
  },
);
</script>

<template>
  <dialog ref="dialog" class="dialog" :aria-label="title" @cancel.prevent="emit('cancel')">
    <h2 class="dialog__title">{{ title }}</h2>
    <div class="dialog__body"><slot /></div>
    <div v-if="confirmText !== undefined" class="stack dialog__confirm">
      <label :for="inputId">
        Type <code>{{ confirmText }}</code> to confirm
      </label>
      <input
        :id="inputId"
        v-model="typed"
        type="text"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </div>
    <div class="actions">
      <!-- Focus starts on the safe choice; the native modal dialog traps focus and restores it on close. -->
      <button type="button" class="button" autofocus @click="emit('cancel')">Cancel</button>
      <button
        type="button"
        class="button"
        :class="danger === true ? 'button--danger' : 'button--primary'"
        :disabled="!canConfirm"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </div>
  </dialog>
</template>
