<script setup lang="ts">
defineProps<{ reason?: string | null | undefined }>();
</script>

<template>
  <span v-if="reason != null" class="set-aside-notice">
    <span class="tag">Set aside</span>
    <span class="set-aside-notice__reason">{{ reason }}</span>
  </span>
</template>
