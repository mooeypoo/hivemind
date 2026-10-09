<script setup lang="ts">
import { site } from '../state/site.ts';
import CommunityBadge from './CommunityBadge.vue';

const sourceUrl = import.meta.env.VITE_SOURCE_URL;
</script>

<template>
  <footer class="site-footer">
    <p>
      Connected to
      <CommunityBadge v-if="site.info?.community != null" :community="site.info.community" />
      <template v-else>a Discord community</template>.
    </p>
    <p>
      Made by <a href="https://moriel.tech" rel="noopener">Moriel Schottlender</a> ·
      <a :href="sourceUrl" rel="noopener">Source code</a> ·
      <RouterLink :to="{ name: 'privacy' }">Privacy</RouterLink>
    </p>
    <p class="meta">
      Code licensed under the GPL-3.0-or-later. Lists, nominations and scores belong to the
      community.
      <template v-if="site.info?.offersMovieData === true">
        Movie data from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>, used under
        TMDB’s terms.
      </template>
    </p>
  </footer>
</template>
