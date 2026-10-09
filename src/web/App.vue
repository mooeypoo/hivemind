<script setup lang="ts">
import { nextTick, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
import { loadSite } from './state/site.ts';

const router = useRouter();
onMounted(() => {
  void loadSite();
  // After in-app navigation, move focus to the new page so keyboard and screen-reader
  // users start at its content, as they would after a full page load.
  router.afterEach((to, from) => {
    if (from.matched.length === 0 || to.path === from.path) return;
    void nextTick(() => {
      document.getElementById('main')?.focus();
    });
  });
});
</script>

<template>
  <a class="skip-link" href="#main">Skip to content</a>
  <AppHeader />
  <main id="main" tabindex="-1" class="page">
    <RouterView />
  </main>
  <AppFooter />
</template>
