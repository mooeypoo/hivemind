<script setup lang="ts">
defineProps<{ href: string }>();
</script>

<template>
  <a :href="href" target="_blank" rel="noopener noreferrer">
    <slot /><svg
      class="external-link-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" /></svg
    ><span class="visually-hidden"> (opens in a new tab)</span>
  </a>
</template>
