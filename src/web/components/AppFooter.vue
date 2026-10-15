<script setup lang="ts">
import { session } from '../state/session.ts';
import { site } from '../state/site.ts';
import CommunityBadge from './CommunityBadge.vue';

const sourceUrl = import.meta.env.VITE_SOURCE_URL;
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__row">
      <p class="site-footer__community">
        Connected to
        <CommunityBadge v-if="site.info?.community != null" :community="site.info.community" />
        <template v-else>a Discord community</template>.
        <template v-if="session.me !== null">
          Lists here are visible only to its signed-in members.
        </template>
      </p>
      <nav class="site-footer__links" aria-label="Footer">
        <RouterLink :to="{ name: 'about' }">About</RouterLink>
        <RouterLink :to="{ name: 'privacy' }">Privacy</RouterLink>
        <a :href="sourceUrl" rel="noopener">Source code</a>
      </nav>
    </div>
    <p class="site-footer__fine">
      Made by <a href="https://moriel.tech" rel="noopener">Moriel Schottlender</a>. Code licensed
      under the GPL-3.0-or-later. Lists, nominations and scores belong to the community.
      <template v-if="site.info?.offersMovieData === true">
        Movie data from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>, used under
        TMDB’s terms.
      </template>
      <template v-if="site.info?.offersTvData === true">
        TV series data from <a href="https://thetvdb.com/" rel="noopener">TheTVDB</a>, used under
        its API terms.
      </template>
      <template v-if="site.info?.offersGameData === true">
        Game data and artwork from <a href="https://www.igdb.com/" rel="noopener">IGDB</a>, used
        under Twitch's developer terms.
      </template>
    </p>
  </footer>
</template>
