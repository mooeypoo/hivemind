<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  confirmLabel: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);

watch(
  () => props.open,
  (open) => {
    if (open) dialog.value?.showModal();
    else dialog.value?.close();
  },
);
</script>

<template>
  <dialog ref="dialog" class="dialog" :aria-label="title" @cancel.prevent="emit('cancel')">
    <h2 class="dialog__title">{{ title }}</h2>
    <div class="dialog__body"><slot /></div>
    <div class="actions">
      <!-- Focus starts on the safe choice; the native modal dialog traps focus and restores it on close. -->
      <button type="button" class="button" autofocus @click="emit('cancel')">Cancel</button>
      <button
        type="button"
        class="button"
        :class="danger === true ? 'button--danger' : 'button--primary'"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </div>
  </dialog>
</template>
