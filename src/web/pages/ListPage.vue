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
import EntrySetAsideDialog from '../components/EntrySetAsideDialog.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import EventCountdown from '../components/EventCountdown.vue';
import LeaderboardPanel from '../components/LeaderboardPanel.vue';
import NominatePanel from '../components/NominatePanel.vue';
import PublicScoreDisclosure from '../components/PublicScoreDisclosure.vue';
import RateOneByOne from '../components/RateOneByOne.vue';
import StatusBadge from '../components/StatusBadge.vue';
import TmdbAttribution from '../components/TmdbAttribution.vue';
import TvdbAttribution from '../components/TvdbAttribution.vue';
import IgdbAttribution from '../components/IgdbAttribution.vue';
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
const { withdrawing, withdrawalError } = page;
const { deletingEntry, deletionError } = page;
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
const settingAside = ref<EntryDto | null>(null);
const beginSetAside = (entry: EntryDto) => {
  selectedId.value = null;
  settingAside.value = entry;
};
const savedSetAside = async (entry: EntryDto) => {
  settingAside.value = null;
  queue.value = [];
  rating.value = false;
  await page.load();
  toast.show(
    entry.setAsideReason == null
      ? 'Entry returned to the main ranking.'
      : 'Set-aside explanation saved.',
    'success',
  );
};
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

const withdrawalEntry = ref<EntryDto | null>(null);
const beginWithdrawal = (entry: EntryDto) => {
  withdrawalEntry.value = entry;
  withdrawalError.value = null;
  selectedId.value = null;
};
const cancelWithdrawal = () => {
  selectedId.value = withdrawalEntry.value?.id ?? null;
  withdrawalEntry.value = null;
};
const confirmWithdrawal = async () => {
  const entry = withdrawalEntry.value;
  if (entry === null) return;
  if (await page.withdraw(entry)) {
    withdrawalEntry.value = null;
    queue.value = [];
    rating.value = false;
    toast.show('Nomination withdrawn.', 'success');
  }
};

const deletion = ref<{ entryId: string; token: string; title: string } | null>(null);
const beginDeletion = (entry: EntryDto) => {
  if (entry.deletionToken == null) return;
  deletion.value = { entryId: entry.id, token: entry.deletionToken, title: entry.item.title };
  deletionError.value = null;
  selectedId.value = null;
};
const cancelDeletion = () => {
  const entryId = deletion.value?.entryId;
  selectedId.value = list.value?.entries.some((entry) => entry.id === entryId)
    ? (entryId ?? null)
    : null;
  deletion.value = null;
};
const confirmDeletion = async () => {
  if (deletion.value === null) return;
  if (
    await page.deleteEntry({
      entryId: deletion.value.entryId,
      token: deletion.value.token,
      confirmation: deletion.value.title,
    })
  ) {
    deletion.value = null;
    queue.value = [];
    rating.value = false;
    toast.show('Entry and its scores permanently deleted.', 'success');
  }
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
    <div v-if="list.participationPaused" class="notice" role="status">
      <p>An entry is being permanently deleted. Nominations and scores are temporarily paused.</p>
      <button
        v-if="session.me?.isAdmin === true && list.entryDeletion != null"
        type="button"
        class="button button--danger"
        @click="
          deletion = list.entryDeletion;
          deletionError = null;
        "
      >
        Retry entry deletion...
      </button>
    </div>
    <p v-else-if="list.lifecycle === 'open' && !list.viewer.canParticipate" class="notice">
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
              Sorted by the current standings: ranked entries first, then ones that need more votes
              for a place.
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
            v-if="publicScores.visible && !list.participationPaused"
            :scores="publicScores.entries[entry.id] ?? []"
          />
          <ScoreInput
            v-if="canVote"
            v-bind="scoreState(entry.id)"
            :scale="list.scale"
            :item-title="entry.item.title"
            @change="ballot.set(entry.id, $event)"
          />
          <p
            v-else-if="isClosed && !list.participationPaused && scores[entry.id] !== undefined"
            class="entry__meta"
          >
            Your score: <strong>{{ scores[entry.id] }}</strong>
          </p>
        </EntryCard>
      </ul>
      <details
        v-if="session.me?.isAdmin === true && (list.withdrawnEntries?.length ?? 0) > 0"
        class="stack"
      >
        <summary>Withdrawn nominations (Admin)</summary>
        <p>
          These are outside the list and ranking. Their earlier scores are retained for
          re-nomination unless you permanently delete them.
        </p>
        <ul class="stack">
          <li v-for="entry in list.withdrawnEntries" :key="entry.id">
            <span>{{ entry.item.title }}</span>
            <button
              v-if="entry.deletionToken != null && !list.participationPaused"
              type="button"
              class="button button--danger"
              :aria-label="`Permanently delete withdrawn ${entry.item.title}`"
              @click="beginDeletion(entry)"
            >
              Delete entry...
            </button>
          </li>
        </ul>
      </details>
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
        :can-vote="canVote"
        :score-state="canVote ? scoreState : undefined"
        @loaded="page.onLeaderboard"
        @rate="ballot.set"
      />
    </section>

    <section
      v-if="canNominateHere"
      v-show="tab === 'nominate'"
      v-bind="panelProps('nominate')"
      class="list-nominate"
    >
      <NominatePanel
        :list="list"
        :score-state="canVote ? scoreState : undefined"
        @nominated="page.load"
        @rate="ballot.set"
      />
    </section>

    <TmdbAttribution v-if="list.itemSource.kind === 'tmdb-movie'" />
    <TvdbAttribution v-if="list.itemSource.kind === 'tvdb-series'" />
    <IgdbAttribution v-if="list.itemSource.kind === 'igdb-game'" />

    <EntryDetails
      :entry="selected"
      :scale="list.scale"
      :standing="selected === null ? undefined : standings[selected.id]"
      :public-scores="
        selected !== null && publicScores.visible && !list.participationPaused
          ? (publicScores.entries[selected.id] ?? [])
          : undefined
      "
      :score="selected !== null && canVote ? scoreState(selected.id) : null"
      :final-score="
        selected !== null && isClosed && !list.participationPaused ? scores[selected.id] : undefined
      "
      :can-delete="session.me?.isAdmin === true && !list.participationPaused"
      :can-set-aside="
        session.me?.isAdmin === true && list.lifecycle !== 'archived' && !list.participationPaused
      "
      @close="selectedId = null"
      @change="onDetailsChange"
      @withdraw="beginWithdrawal"
      @delete="beginDeletion"
      @set-aside="beginSetAside"
    />
    <EntrySetAsideDialog
      :entry="settingAside"
      :list="list"
      @close="settingAside = null"
      @saved="savedSetAside"
    />
    <ConfirmDialog
      :open="deletion !== null"
      :title="`Permanently delete ${deletion?.title ?? 'entry'}?`"
      confirm-label="Delete entry permanently"
      :confirm-text="deletion?.title ?? ''"
      :busy="deletingEntry"
      danger
      @cancel="cancelDeletion"
      @confirm="confirmDeletion"
    >
      <p>
        This cannot be undone. The entry, all its scores and nomination records will be erased. Its
        nomination allowance will be freed. If nominated again, it starts with no previous scores.
      </p>
      <p v-if="isClosed">
        This list has finished voting. Deletion changes its final results and may change every rank.
      </p>
      <p>
        Ranking will be recalculated. Nominations and score changes pause for this list until
        cleanup finishes. Once started, deletion must be finished; closing this dialog does not
        cancel it. Previously downloaded backups are not erased.
      </p>
      <ErrorNotice :error="deletionError" />
    </ConfirmDialog>
    <ConfirmDialog
      :open="withdrawalEntry !== null"
      :title="`Withdraw ${withdrawalEntry?.item.title ?? 'nomination'}?`"
      :confirm-label="withdrawing ? 'Withdrawing...' : 'Withdraw nomination'"
      :busy="withdrawing"
      danger
      @cancel="cancelWithdrawal"
      @confirm="confirmWithdrawal"
    >
      <p>
        This removes the item from the list and frees your nomination slot. To bring it back, you or
        another member must nominate it again while nominations are open. Any earlier ratings will
        return with it.
      </p>
      <ErrorNotice :error="withdrawalError" />
    </ConfirmDialog>
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
