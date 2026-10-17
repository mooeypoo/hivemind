<script setup lang="ts">
defineProps<{ fixed: boolean; label: string }>();
</script>

<template>
  <details v-if="fixed" class="fixed-settings">
    <summary>{{ label }} <span class="pill">Fixed · view settings</span></summary>
    <div class="stack fixed-settings__body"><slot /></div>
  </details>
  <div v-else class="stack"><slot /></div>
</template>
