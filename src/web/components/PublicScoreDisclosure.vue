<script setup lang="ts">
defineProps<{ scores: readonly { readonly displayName: string; readonly score: number }[] }>();
</script>

<template>
  <details v-if="scores.length > 0" class="public-scores">
    <summary>Who voted ({{ scores.length }})</summary>
    <ul>
      <li v-for="(item, index) in scores" :key="`${item.displayName}-${index}`">
        {{ item.displayName }}: {{ item.score }}
      </li>
    </ul>
  </details>
</template>
