<script setup lang="ts">
import { usePageTitle } from '../lib/page-title.ts';

usePageTitle(() => 'Page not found');
</script>

<template>
  <section class="empty">
    <h1>Page not found</h1>
    <p><RouterLink to="/">Back to the lists</RouterLink></p>
  </section>
</template>
