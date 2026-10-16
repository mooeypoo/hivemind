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
        <strong>Details of nominated movies</strong> (title, year, poster address, overview,
        director, and two cast members) from TMDB. These are about the movies, not about you. Six
        months after a list is archived, they are removed: the entry keeps its scores and place,
        labelled “details removed”.
      </li>
      <li v-if="site.info?.offersTvData !== false">
        <strong>Details of nominated TV shows</strong> (title, year, poster address, synopsis,
        creators and two cast members where available) from TheTVDB. These describe the shows, not
        you, and are kept with the list, including after it is archived.
      </li>
      <li v-if="site.info?.offersGameData === true">
        <strong>Details of nominated games</strong> (title, release year, cover address, synopsis,
        and developer and publisher companies where available) from IGDB. These describe games, not
        you, and are kept with the list, including after it is archived.
      </li>
    </ul>

    <p>
      The site also keeps random operation tokens to prevent item-source changes and permanent list
      or entry deletion from racing with entry, ballot and leaderboard writes. They contain no
      member identity or scores. Active write markers are normally removed after completion; an
      interrupted write may leave its marker for an operator to check.
    </p>

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

    <h2>Setting entries aside</h2>
    <p>
      Admins can set an entry aside as outside a list's criteria, with a member-visible explanation.
      The classification and explanation are stored with the entry and included in list backups; no
      Admin identity or edit history is recorded. Ratings are kept and members can still rate the
      entry. Withdrawal and re-nomination retain the classification. Explanations should describe
      the item, not contain personal information.
    </p>
    <h2>Withdrawing a nomination</h2>
    <p>
      While nominations are open, you can withdraw your own nomination. The item leaves the list and
      no longer uses your nomination allowance. Your nominator name is removed from the item; a
      reservation record may remain until your next nomination or data deletion and is included in
      Download my data. The item and its withdrawal date are kept, along with earlier scores,
      including names attached to public scores. Those scores are not shown in results or public
      scores while the item is withdrawn. If you or another member nominates the same item in the
      same list, its earlier scores return. Download my data includes your retained scores, and
      Delete my data removes them.
    </p>
    <p>
      Admins can inspect retained withdrawn items in an Admin-only section to permanently delete
      them. They do not appear in the main list or ranking.
    </p>

    <h2>When an Admin deletes a list</h2>
    <p>
      Admins can permanently delete a list, including an archived one. This removes its entries,
      withdrawn nominations, nomination records, all members' scores for that list and its cached
      ranking. It does not delete member accounts or shared imported presets. Once deletion starts,
      the list is unavailable to members; interrupted cleanup can be retried by an Admin.
    </p>
    <p>
      After cleanup, only a non-personal marker at the old list ID and an empty address reservation
      remain to prevent stale requests from restoring data or affecting a replacement list. No
      title, entry, nominator identity or score is retained in these markers. Previously downloaded
      backups are not erased and can restore a separate copy.
    </p>

    <h2>When an Admin deletes an entry</h2>
    <p>
      Permanent entry deletion removes the item, its nomination records and everyone's scores for
      it, including scores retained after withdrawal. It frees the nomination allowance and
      recalculates the ranking. If nominated again, the item starts without earlier scores. Deleting
      from a closed or archived list changes its final results.
    </p>
    <p>
      Nominations and scores pause for that list while cleanup finishes. During an interrupted
      deletion, its entry ID, title and confirmation token remain so an Admin can retry. After
      completion only a random list revision token remains to reject stale writes; no deleted entry
      details, nominator or score remain. Previously downloaded backups are not erased.
    </p>

    <h2>Shared links</h2>
    <p>
      Link previews can show the site and community names and the title of a published list. Draft
      and hidden list titles are not included. Entries, nominations, scores and member details are
      never included in these previews. Viewing a list still requires sign-in. Social platforms may
      keep a preview after a list is hidden.
    </p>

    <h2>Cookies and browser storage</h2>
    <ul>
      <li>
        <strong>A session cookie</strong> keeps you signed in for 12 hours. It holds your user ID,
        your roles in the server, and when it expires, signed so it can’t be forged.
      </li>
      <li>
        <strong>Two short-lived sign-in cookies</strong> (10 minutes) protect the sign-in itself and
        remember which page to return you to.
      </li>
      <li>
        <strong>Your Appearance choice</strong>, only if you pick Light or Dark. It is one word
        (<code>light</code> or <code>dark</code>) in this browser’s local storage, read before the
        page appears so it doesn’t flash the other theme. It is never sent to the server, and
        choosing System removes it. Nothing else is kept in local storage.
      </li>
      <li>
        <strong>Unsaved form input</strong> is kept in this tab’s session storage so a sign-in
        interruption loses nothing. It is never sent anywhere and is gone when the tab closes.
      </li>
      <li>No third-party cookies.</li>
    </ul>
    <p v-if="site.info?.offersTvData !== false">
      TV show searches and selected show IDs are sent to TheTVDB by our server, without your Discord
      identity or scores. Posters load from TheTVDB's artwork service, which receives your IP
      address when your browser requests an image.
    </p>
    <p v-if="site.info?.offersGameData === true">
      Game searches and selected game IDs are sent to IGDB by our server, without your Discord
      identity or scores. Covers load from IGDB's image service, which receives your IP address when
      your browser requests an image. Twitch application tokens are kept only in server memory and
      renewed when needed; they do not identify community members.
    </p>

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
      <li v-if="site.info?.offersTvData !== false">
        TV series data and artwork come from
        <a href="https://thetvdb.com/" rel="noopener">TheTVDB</a>
        and are used under its API terms, separately from the software's license.
      </li>
      <li v-if="site.info?.offersGameData === true">
        Game data and artwork come from <a href="https://www.igdb.com/" rel="noopener">IGDB</a>,
        under the
        <a href="https://www.twitch.tv/p/en/legal/developer-agreement/" rel="noopener"
          >Twitch Developer Services Agreement</a
        >, separately from the software's license.
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
