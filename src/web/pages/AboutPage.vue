<script setup lang="ts">
import CommunityBadge from '../components/CommunityBadge.vue';
import { usePageTitle } from '../lib/page-title.ts';
import { site } from '../state/site.ts';

usePageTitle(() => 'About');
const siteName = import.meta.env.VITE_SITE_NAME;
const sourceUrl = import.meta.env.VITE_SOURCE_URL;
</script>

<template>
  <article class="prose">
    <h1>About {{ siteName }}</h1>
    <p class="lead">
      A place for a community to make ranked lists together: nominate entries, rate them, and see
      what rises to the top.
    </p>

    <h2>How it works</h2>
    <p>
      Admins create lists and choose whether members nominate entries or rate a ready-made set.
      Members can rate each entry while voting is open. The leaderboard combines those scores;
      entries with too few votes are marked provisional until more members weigh in.
    </p>
    <p>
      Scores are private unless a list says they are public. Public lists explain this before you
      vote, and show who gave each score when results are visible. Admins can make public scores
      private later, but can’t make a published private list public.
    </p>

    <h2>This community</h2>
    <p v-if="site.info?.community != null">
      <CommunityBadge :community="site.info.community" />
      <template v-if="site.info.community.inviteUrl != null">
        · <a :href="site.info.community.inviteUrl" rel="noopener">Join the server</a>
      </template>
    </p>
    <p v-else>This site serves a Discord community.</p>
    <p>This site is run by its community’s Admins.</p>

    <h2>Credits</h2>
    <p>
      Made by <a href="https://moriel.tech" rel="noopener">Moriel Schottlender</a>.
      <a :href="sourceUrl" rel="noopener">Source code</a> is licensed under the GPL-3.0-or-later.
      Community lists and scores belong to their members.
    </p>
    <p v-if="site.info?.offersMovieData === true">
      Movie data from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>, used under
      <a href="https://www.themoviedb.org/api-terms-of-use" rel="noopener">its terms</a>. This
      product uses the TMDB API but is not endorsed or certified by TMDB.
    </p>
  </article>
</template>
