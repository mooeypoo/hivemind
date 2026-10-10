<script setup lang="ts">
import { usePageTitle } from '../lib/page-title.ts';
import { site } from '../state/site.ts';

usePageTitle(() => 'Privacy');
const siteName = import.meta.env.VITE_SITE_NAME;
</script>

<!--
  This page must describe exactly what the app stores (AGENTS.md). Any change to stored data
  updates it in the same change.
-->
<template>
  <article class="prose">
    <h1>Privacy and your data</h1>
    <p class="lead">
      {{ siteName }} keeps as little about you as it can to run community lists, and nothing it
      doesn’t need.
    </p>

    <h2>What we store about you</h2>
    <ul>
      <li>
        <strong>Your Discord user ID, display name and avatar address.</strong> They identify you
        and show who you are on the site. We refresh them each time you sign in.
      </li>
      <li>
        <strong>What you nominate,</strong> with your display name at the time, so the list can show
        who nominated what (if the list shows nominators).
      </li>
      <li>
        <strong>Your scores.</strong> They are private unless a list says its scores are public.
        Public lists say so before you vote; other members can then see the score you gave each
        entry when results are visible. The leaderboard otherwise uses totals and averages. Making a
        list private hides its public scores, and deleting your data removes your scores and name.
      </li>
      <li v-if="site.info?.offersMovieData !== false">
        <strong>Details of nominated movies</strong> (title, year, poster address) from TMDB. These
        are about the movies, not about you. Six months after a list is archived, they are removed:
        the entry keeps its scores and place, labelled “details removed”.
      </li>
    </ul>

    <h2>What we never store</h2>
    <ul>
      <li>Your email address. We never ask Discord for it.</li>
      <li>
        Your Discord password or access token. Discord gives us a token only to check that you are
        in the server; we revoke it right after.
      </li>
      <li>Which servers you’re in, other than this community’s.</li>
      <li>Analytics, tracking, advertising, or your IP address.</li>
    </ul>

    <h2>Shared links</h2>
    <p>
      Link previews can show the site and community names and the title of a published list. Draft
      and hidden list titles are not included. Entries, nominations, scores and member details are
      never included in these previews. Viewing a list still requires sign-in. Social platforms may
      keep a preview after a list is hidden.
    </p>

    <h2>Cookies</h2>
    <ul>
      <li>
        <strong>A session cookie</strong> keeps you signed in for 12 hours. It holds your user ID,
        your roles in the server, and when it expires, signed so it can’t be forged.
      </li>
      <li>
        <strong>Two short-lived sign-in cookies</strong> (10 minutes) protect the sign-in itself and
        remember which page to return you to.
      </li>
      <li>No third-party cookies.</li>
    </ul>

    <h2 id="download">Download my data</h2>
    <p>
      From the menu under your name, <strong>Download my data</strong> gives you a file with
      everything above that is about you: your profile, your nominations and your scores in every
      list.
    </p>

    <h2 id="delete">Delete my data</h2>
    <p>
      <strong>Delete my data</strong> removes your profile and all your scores, and signs you out.
      Entries you nominated stay in their lists, because other members have rated them, but your
      name is removed from them. This can’t be undone. You can sign in again later and start fresh.
    </p>

    <h2 id="backups">Backups</h2>
    <p>
      The site’s Admins can download backups of the lists, to restore them if something goes wrong.
      A backup holds the lists, their entries, and nominators’ names and Discord IDs. Your scores
      (including any name attached to a public score) are sealed inside it: nobody who has the file,
      Admins included, can see how you voted.
    </p>
    <p>
      When you delete your data, the site keeps a one-way fingerprint of your ID for two years, and
      nothing else. It can’t be turned back into your ID, but it means restoring an older backup can
      never bring your data back.
    </p>

    <h2>Who owns what</h2>
    <ul>
      <li>
        The lists, nominations, descriptions and scores belong to the community and its members.
      </li>
      <li>The software is open source under the GNU GPL, version 3 or later.</li>
      <li v-if="site.info?.offersMovieData !== false">
        Movie data comes from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a> and is
        used under
        <a href="https://www.themoviedb.org/api-terms-of-use" rel="noopener">TMDB’s terms</a>. This
        product uses the TMDB API but is not endorsed or certified by TMDB.
      </li>
    </ul>

    <template v-if="site.info?.demo === true">
      <h2>Demo mode</h2>
      <p>
        This copy of the site is a demo. The “Try as…” accounts are pretend, the lists are samples,
        and none of it is shared with the live site.
      </p>
    </template>

    <h2>Questions</h2>
    <p>
      This site is run by the community’s Admins. Ask them in the Discord server<template
        v-if="site.info?.community != null"
      >
        ({{ site.info.community.name }})</template
      >.
    </p>
  </article>
</template>
