<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { EntryDto } from '../../server/http/contracts.ts';
import { useListPage } from '../composables/list-page.ts';
import { useToast } from '../composables/toast.ts';
import { sourceLabel } from '../lib/labels.ts';
import { usePageTitle } from '../lib/page-title.ts';
import { session } from '../state/session.ts';
import EntryCard from '../components/EntryCard.vue';
import EntryDetails from '../components/EntryDetails.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import EventCountdown from '../components/EventCountdown.vue';
import LeaderboardPanel from '../components/LeaderboardPanel.vue';
import NominatePanel from '../components/NominatePanel.vue';
import PublicScoreDisclosure from '../components/PublicScoreDisclosure.vue';
import RateOneByOne from '../components/RateOneByOne.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import AppTabs from '../components/ui/AppTabs.vue';
import type { Tab } from '../lib/tabs.ts';
import RatingProgress from '../components/ui/RatingProgress.vue';
import ScoreInput from '../components/ui/ScoreInput.vue';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const page = useListPage(() => String(route.params.slug));
const { list, error, ballot, entries, standings, publicScores, canVote, hasStandings } = page;
const { canNominateHere, isClosed, resultsSealed, unrated, ratedCount, next, requiredRolesText } =
  page;
const { scores, saving, errors } = ballot;
usePageTitle(() => list.value?.title ?? null);

// Tabs, kept in the address (?tab=standings) so they can be linked to.
const tabs = computed((): Tab[] => {
  if (list.value === null) return [];
  return [
    {
      id: 'entries',
      label: canVote.value ? 'Rate' : 'Entries',
      count: list.value.entries.length,
    },
    ...(hasStandings.value ? [{ id: 'standings', label: 'Standings' }] : []),
    ...(canNominateHere.value ? [{ id: 'nominate', label: 'Nominate' }] : []),
  ];
});
const tab = computed({
  get: () => {
    const wanted = String(route.query.tab ?? 'entries');
    return tabs.value.some((t) => t.id === wanted) ? wanted : 'entries';
  },
  set: (id: string) => {
    void router.replace({ query: { ...route.query, tab: id === 'entries' ? undefined : id } });
  },
});
const panelProps = (id: string) =>
  tabs.value.length > 1
    ? { role: 'tabpanel', id: `list-panel-${id}`, 'aria-labelledby': `list-tab-${id}` }
    : {};

// Entry details and rating one by one
const selectedId = ref<string | null>(null);
const selected = computed(
  () => list.value?.entries.find((entry) => entry.id === selectedId.value) ?? null,
);
const queue = ref<readonly EntryDto[]>([]);
const rating = ref(false);
const startRating = () => {
  queue.value = unrated.value;
  rating.value = true;
};

const scoreState = (entryId: string) => ({
  value: scores.value[entryId] ?? null,
  saving: saving.value[entryId] === true,
  error: errors.value[entryId] ?? null,
});
const onDetailsChange = (value: number | null) => {
  if (selected.value !== null) ballot.set(selected.value.id, value);
};

const copyMemberLink = async () => {
  if (list.value === null) return;
  const url = new URL(
    `/lists/${encodeURIComponent(list.value.slug)}`,
    window.location.origin,
  ).toString();
  try {
    await navigator.clipboard.writeText(url);
    toast.show('Member link copied. Sign-in is required to view or take part.', 'success');
  } catch {
    toast.show('Copy failed. You can share this page address with community members.', 'error');
  }
};

const backdrop = computed(() => entries.value.find((entry) => entry.item.imageUrl !== null));
</script>

<template>
  <ErrorNotice :error="error" />
  <p v-if="list === null && error === null" class="meta" aria-live="polite">Loading…</p>

  <article v-if="list !== null" class="list-page">
    <header class="list-hero">
      <img
        v-if="backdrop?.item.imageUrl != null"
        :src="backdrop.item.imageUrl"
        alt=""
        class="list-hero__backdrop"
        aria-hidden="true"
      />
      <div class="list-hero__content">
        <p class="list-hero__kicker">
          <StatusBadge :lifecycle="list.lifecycle" :hidden="list.visibility === 'hidden'" />
          <span
            >{{ sourceLabel[list.itemSource.kind] }} · rated {{ list.scale.min }}–{{
              list.scale.max
            }}</span
          >
        </p>
        <h1>{{ list.title }}</h1>
        <p v-if="list.description !== ''" class="lead">{{ list.description }}</p>
        <EventCountdown v-if="next !== null" v-bind="next" />
        <p
          v-if="
            list.lifecycle === 'open' && list.schedule !== null && list.schedule.closesAt === null
          "
          class="meta"
        >
          Voting stays open until an Admin closes it.
        </p>
        <div class="list-hero__actions">
          <button type="button" class="button share-link" @click="copyMemberLink">Copy link</button>
          <RouterLink
            v-if="hasStandings && !resultsSealed"
            :to="{ name: 'list-results', params: { slug: list.slug } }"
            class="button"
          >
            Full results
          </RouterLink>
          <RouterLink
            v-if="session.me?.isAdmin === true"
            :to="{ name: 'edit-list', params: { slug: list.slug } }"
            class="button button--quiet"
          >
            Edit
          </RouterLink>
        </div>
      </div>
    </header>

    <p v-if="list.scoreVisibility === 'public'" class="notice public-score-notice">
      Scores on this list are public: other members can see the score you give each entry.
    </p>
    <p v-if="list.lifecycle === 'open' && !list.viewer.canParticipate" class="notice">
      This list is open only to members with {{ requiredRolesText }}, so you can’t rate it.
    </p>

    <AppTabs
      v-if="tabs.length > 1"
      v-model="tab"
      :tabs="tabs"
      id-prefix="list"
      label="List sections"
      class="list-tabs"
    />

    <section
      v-show="tab === 'entries'"
      v-bind="panelProps('entries')"
      class="list-entries"
      aria-labelledby="entries-heading"
    >
      <div class="list-entries__head">
        <h2 id="entries-heading">
          {{
            list.entryMode === 'seeded'
              ? canVote
                ? 'Rate these'
                : 'List items'
              : 'All community nominations'
          }}
        </h2>
        <details class="list-howto">
          <summary>How this list works</summary>
          <p v-if="list.entryMode === 'nominations'">
            This is the full list, including entries nominated by other members.<template
              v-if="canVote"
            >
              You can rate any entry while voting is open.</template
            >
          </p>
          <p v-if="hasStandings">
            <template v-if="!resultsSealed">
              Sorted by the current standings, provisional entries included in place.
            </template>
            <template v-else
              >Not in ranking order: results are hidden until voting closes.</template
            >
          </p>
          <p v-if="list.scoreVisibility !== 'public'">
            Your scores are private: only you can see them.
          </p>
          <p>
            Scores go from {{ list.scale.min }} (lowest) to {{ list.scale.max }} (highest). Tap an
            entry’s picture for its details.
          </p>
        </details>
      </div>

      <div v-if="canVote && list.entries.length > 0" class="ballot-bar">
        <RatingProgress :done="ratedCount" :total="list.entries.length" />
        <button
          v-if="unrated.length > 0"
          type="button"
          class="button button--primary"
          @click="startRating"
        >
          Rate one by one
        </button>
      </div>

      <p v-if="list.entries.length === 0" class="empty">Nothing nominated yet.</p>
      <ul v-else class="entries">
        <EntryCard
          v-for="entry in entries"
          :key="entry.id"
          :entry="entry"
          :standing="standings[entry.id]"
          :rated="scores[entry.id] !== undefined"
          @open="selectedId = entry.id"
        >
          <PublicScoreDisclosure
            v-if="publicScores.visible"
            :scores="publicScores.entries[entry.id] ?? []"
          />
          <ScoreInput
            v-if="canVote"
            v-bind="scoreState(entry.id)"
            :scale="list.scale"
            :item-title="entry.item.title"
            @change="ballot.set(entry.id, $event)"
          />
          <p v-else-if="isClosed && scores[entry.id] !== undefined" class="entry__meta">
            Your score: <strong>{{ scores[entry.id] }}</strong>
          </p>
        </EntryCard>
      </ul>
    </section>

    <section
      v-if="hasStandings"
      v-show="tab === 'standings'"
      v-bind="panelProps('standings')"
      class="list-standings"
    >
      <LeaderboardPanel
        :key="list.entries.length"
        :list="list"
        :my-scores="scores"
        :public-scores="publicScores"
        @loaded="page.onLeaderboard"
      />
    </section>

    <section
      v-if="canNominateHere"
      v-show="tab === 'nominate'"
      v-bind="panelProps('nominate')"
      class="list-nominate"
    >
      <NominatePanel :list="list" @nominated="page.load" />
    </section>

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />

    <EntryDetails
      :entry="selected"
      :scale="list.scale"
      :standing="selected === null ? undefined : standings[selected.id]"
      :public-scores="
        selected !== null && publicScores.visible
          ? (publicScores.entries[selected.id] ?? [])
          : undefined
      "
      :score="selected !== null && canVote ? scoreState(selected.id) : null"
      :final-score="selected !== null && isClosed ? scores[selected.id] : undefined"
      @close="selectedId = null"
      @change="onDetailsChange"
    />
    <RateOneByOne
      v-if="canVote"
      :open="rating"
      :queue="queue"
      :scale="list.scale"
      :scores="scores"
      :saving="saving"
      :errors="errors"
      @close="rating = false"
      @change="(entryId, value) => ballot.set(entryId, value)"
    />
  </article>
</template>
