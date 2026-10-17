<script setup lang="ts">
import { session } from '../state/session.ts';
import { site } from '../state/site.ts';
import CommunityBadge from './CommunityBadge.vue';
import ExternalLink from './ui/ExternalLink.vue';

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
        <ExternalLink :href="sourceUrl">Source code</ExternalLink>
      </nav>
    </div>
    <p class="site-footer__fine">
      Made by <ExternalLink href="https://moriel.tech">Moriel Schottlender</ExternalLink>. Code
      licensed under the GPL-3.0-or-later. Lists, nominations and scores belong to the community.
      <template v-if="site.info?.offersMovieData === true">
        Movie data from <ExternalLink href="https://www.themoviedb.org/">TMDB</ExternalLink>, used
        under TMDB’s terms.
      </template>
      <template v-if="site.info?.offersTvData === true">
        TV series data from <ExternalLink href="https://thetvdb.com/">TheTVDB</ExternalLink>, used
        under its API terms.
      </template>
      <template v-if="site.info?.offersGameData === true">
        Game data and artwork from <ExternalLink href="https://www.igdb.com/">IGDB</ExternalLink>,
        used under Twitch's developer terms.
      </template>
    </p>
  </footer>
</template>
