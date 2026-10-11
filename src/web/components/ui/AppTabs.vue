<script setup lang="ts">
import type { Tab } from '../../lib/tabs.ts';

const props = defineProps<{
  tabs: readonly Tab[];
  modelValue: string;
  idPrefix: string;
  label: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [id: string] }>();

/** Arrow keys, Home and End move between tabs and select them (WAI-ARIA tabs pattern). */
const onKeydown = (event: KeyboardEvent, index: number) => {
  const last = props.tabs.length - 1;
  const target =
    event.key === 'ArrowRight'
      ? (index + 1) % props.tabs.length
      : event.key === 'ArrowLeft'
        ? (index - 1 + props.tabs.length) % props.tabs.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : null;
  const tab = target === null ? undefined : props.tabs[target];
  if (tab === undefined) return;
  event.preventDefault();
  emit('update:modelValue', tab.id);
  document.getElementById(`${props.idPrefix}-tab-${tab.id}`)?.focus();
};
</script>

<template>
  <div class="tabs" role="tablist" :aria-label="label">
    <button
      v-for="(tab, index) in tabs"
      :id="`${idPrefix}-tab-${tab.id}`"
      :key="tab.id"
      type="button"
      role="tab"
      class="tabs__tab"
      :aria-selected="tab.id === modelValue"
      :aria-controls="`${idPrefix}-panel-${tab.id}`"
      :tabindex="tab.id === modelValue ? 0 : -1"
      @click="emit('update:modelValue', tab.id)"
      @keydown="onKeydown($event, index)"
    >
      {{ tab.label }}
      <span v-if="tab.count !== undefined" class="tabs__count">{{ tab.count }}</span>
    </button>
  </div>
</template>
