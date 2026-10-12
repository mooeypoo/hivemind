<script setup lang="ts">
import { usePageTitle } from '../lib/page-title.ts';

usePageTitle(() => 'Page not found');
</script>

<template>
  <section class="not-found" aria-labelledby="not-found-heading">
    <p class="not-found__code" aria-hidden="true">404</p>
    <h1 id="not-found-heading">Page not found</h1>
    <p class="meta">
      There’s nothing at this address. It may be mistyped, or the list may have moved.
    </p>
    <p class="not-found__actions">
      <RouterLink to="/" class="button button--primary">Back to the lists</RouterLink>
    </p>
  </section>
</template>
