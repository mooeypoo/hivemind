<script setup lang="ts">
defineProps<{
  reason?: string | null | undefined;
  itemTitle?: string;
  showReason?: boolean;
}>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <span v-if="reason != null" class="set-aside-notice">
    <span class="tag">Set aside</span>
    <span v-if="showReason" class="set-aside-notice__reason">{{ reason }}</span>
    <button
      v-else
      type="button"
      class="set-aside-notice__why"
      :aria-label="`Why was ${itemTitle ?? 'this entry'} set aside?`"
      aria-haspopup="dialog"
      @click="emit('open')"
    >
      Why?
    </button>
  </span>
</template>
