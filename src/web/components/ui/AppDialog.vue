<script setup lang="ts">
import { onMounted, ref, useId, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  /** `sheet`: slides up from the bottom on phones, drops down from the top corner on wider screens. */
  variant?: 'dialog' | 'sheet';
}>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();

const sync = (open: boolean) => {
  if (open && dialog.value?.open !== true) dialog.value?.showModal();
  else if (!open && dialog.value?.open === true) dialog.value.close();
};
watch(() => props.open, sync);
onMounted(() => {
  sync(props.open);
});

/** A click on the backdrop lands on the <dialog> itself, never on its content. */
const onClick = (event: MouseEvent) => {
  if (event.target === dialog.value) emit('close');
};
</script>

<template>
  <!-- The native modal dialog traps focus, closes on Escape and restores focus on close. -->
  <dialog
    ref="dialog"
    class="dialog"
    :class="{ 'dialog--sheet': variant === 'sheet' }"
    :aria-labelledby="titleId"
    @cancel.prevent="emit('close')"
    @click="onClick"
  >
    <div class="dialog__content">
      <h2 :id="titleId" class="dialog__title">{{ title }}</h2>
      <div class="dialog__body"><slot /></div>
      <div v-if="$slots.actions" class="dialog__actions"><slot name="actions" /></div>
    </div>
  </dialog>
</template>
