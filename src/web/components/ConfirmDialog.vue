<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue';
import AppDialog from './ui/AppDialog.vue';

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

const typed = ref('');
const inputId = useId();

const canConfirm = computed(
  () => props.confirmText === undefined || typed.value.trim() === props.confirmText,
);

watch(
  () => props.open,
  () => {
    typed.value = '';
  },
);
</script>

<template>
  <AppDialog :open="open" :title="title" @close="emit('cancel')">
    <slot />
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
    <template #actions>
      <!-- Focus starts on the safe choice. -->
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
    </template>
  </AppDialog>
</template>
