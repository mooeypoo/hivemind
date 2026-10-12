<script setup lang="ts">
import { computed, ref } from 'vue';
import type { EntryDto, LeaderboardDto, PublicScoresDto } from '../../server/http/contracts.ts';
import { durationText, formatDateTime } from '../lib/datetime.ts';
import { buildStandings, scalePercent, type StandingRow } from '../lib/standings.ts';
import PublicScoreDisclosure from './PublicScoreDisclosure.vue';
import EntryDetails from './EntryDetails.vue';
import ItemArt from './ui/ItemArt.vue';

const props = defineProps<{
  board: LeaderboardDto;
  entries: readonly EntryDto[];
  scale: { readonly min: number; readonly max: number };
  /** The viewer's own scores, shown beside the community's. Omitted on the results page. */
  myScores?: Readonly<Record<string, number>> | undefined;
  publicScores?: PublicScoresDto | undefined;
  canVote?: boolean | undefined;
  scoreState?:
    | ((entryId: string) => { value: number | null; saving: boolean; error: string | null })
    | undefined;
  /** The level of this board's own headings: one below the page section it sits in. */
  headingLevel?: 'h2' | 'h3' | undefined;
}>();
const emit = defineEmits<{
  rate: [event: { entryId: string; score: number | null }];
}>();

const visible = computed(() => (props.board.hidden ? null : props.board));
const selectedId = ref<string | null>(null);
const selectedEntry = computed(() => {
  const entry = props.entries.find((entry) => entry.id === selectedId.value);
  return entry === undefined ? null : { ...entry, withdrawalToken: null };
});
const selectedStanding = computed(() =>
  visible.value?.rows.find((row) => row.entryId === selectedId.value),
);
const selectedVoters = computed(() =>
  props.publicScores?.visible === true && selectedId.value !== null
    ? (props.publicScores.entries[selectedId.value] ?? [])
    : undefined,
);
const standings = computed(() =>
  visible.value === null ? null : buildStandings(visible.value.rows, props.entries),
);
const anyVotes = computed(
  () => (standings.value?.podium.length ?? 0) + (standings.value?.provisional.length ?? 0) > 0,
);
const untilReveal = computed(() =>
  props.board.hidden && props.board.revealsAt !== null
    ? new Date(props.board.revealsAt).getTime() - Date.now()
    : null,
);

const percent = (row: StandingRow) =>
  row.score === null ? 0 : scalePercent(row.score, props.scale);
const votesText = (votes: number) => `${String(votes)} ${votes === 1 ? 'vote' : 'votes'}`;
const needsText = (row: StandingRow) =>
  `Needs ${String(row.votesNeeded)} more ${row.votesNeeded === 1 ? 'vote' : 'votes'}`;
const voters = (row: StandingRow) =>
  props.publicScores?.visible === true ? (props.publicScores.entries[row.entryId] ?? []) : null;
</script>

<template>
  <div class="standings">
    <div v-if="board.hidden" class="sealed">
      <p class="sealed__title">Sealed until voting closes</p>
      <p class="sealed__text">
        <template v-if="board.revealsAt !== null">
          Results are revealed when voting closes,
          <time :datetime="board.revealsAt">{{ formatDateTime(board.revealsAt) }}</time
          ><template v-if="untilReveal !== null && untilReveal > 0">
            (in {{ durationText(untilReveal) }})</template
          >.
        </template>
        <template v-else>Results are revealed when an Admin closes voting.</template>
      </p>
    </div>

    <p v-else-if="!anyVotes" class="empty">No votes yet.</p>

    <template v-else-if="standings !== null && visible !== null">
      <p v-if="standings.podium.length === 0" class="empty">
        No entry has enough votes for a place yet.
      </p>
      <ol v-else class="podium" aria-label="Top three">
        <li
          v-for="row in standings.podium"
          :key="row.entryId"
          class="podium__place"
          :class="`podium__place--${row.rank}`"
        >
          <div class="podium__art">
            <button
              type="button"
              class="standing__art-button"
              :aria-label="`Open full details for ${row.item.title}`"
              @click="selectedId = row.entryId"
            >
              <ItemArt
                :title="row.item.title"
                :subtitle="row.item.subtitle"
                :image-url="row.item.imageUrl"
              />
            </button>
            <span class="podium__medal" :aria-label="`Rank ${String(row.rank)}`">{{
              row.rank
            }}</span>
          </div>
          <p class="podium__title">
            <button type="button" class="standing__title-button" @click="selectedId = row.entryId">
              {{ row.item.title }}
            </button>
          </p>
          <p v-if="row.item.subtitle !== null" class="podium__subtitle">{{ row.item.subtitle }}</p>
          <p class="podium__score">
            <strong>{{ row.score?.toFixed(1) }}</strong>
            <span><span class="visually-hidden"> · </span>{{ votesText(row.votes) }}</span>
          </p>
          <p v-if="row.nominatedBy !== null" class="standing__nominator">
            Nominated by {{ row.nominatedBy }}
          </p>
          <button
            v-if="canVote && myScores?.[row.entryId] !== undefined"
            type="button"
            class="standing__mine-button"
            :aria-label="`Change your rating for ${row.item.title}, currently ${myScores[row.entryId]}`"
            @click="selectedId = row.entryId"
          >
            You: {{ myScores[row.entryId] }} (edit)
          </button>
          <p v-else-if="!canVote && myScores?.[row.entryId] !== undefined" class="standing__mine">
            You: {{ myScores[row.entryId] }}
          </p>
          <button
            v-else-if="canVote"
            type="button"
            class="standing__rate-button"
            :aria-label="`Rate ${row.item.title}`"
            @click="selectedId = row.entryId"
          >
            + Rate
          </button>
          <PublicScoreDisclosure v-if="voters(row) !== null" :scores="voters(row) ?? []" />
        </li>
      </ol>

      <ol v-if="standings.rest.length > 0" class="ranking" aria-label="The rest of the ranking">
        <li v-for="row in standings.rest" :key="row.entryId" class="ranking__row">
          <span class="ranking__rank" :aria-label="`Rank ${String(row.rank)}`">{{ row.rank }}</span>
          <button
            type="button"
            class="standing__art-button ranking__art"
            :aria-label="`Open full details for ${row.item.title}`"
            @click="selectedId = row.entryId"
          >
            <ItemArt :title="row.item.title" :image-url="row.item.imageUrl" size="small" />
          </button>
          <span class="ranking__title">
            <button type="button" class="standing__title-button" @click="selectedId = row.entryId">
              {{ row.item.title }}
            </button>
            <span
              v-if="row.item.subtitle !== null || row.item.director != null"
              class="ranking__metadata meta"
            >
              <span v-if="row.item.subtitle !== null">{{ row.item.subtitle }}</span>
              <span
                v-if="row.item.subtitle !== null && row.item.director != null"
                aria-hidden="true"
              >
                ·
              </span>
              <span v-if="row.item.director != null">Directed by {{ row.item.director }}</span>
            </span>
            <span v-if="row.nominatedBy !== null" class="standing__nominator">
              Nominated by {{ row.nominatedBy }}
            </span>
            <PublicScoreDisclosure v-if="voters(row) !== null" :scores="voters(row) ?? []" />
          </span>
          <span class="ranking__numbers">
            <strong>{{ row.score?.toFixed(1) }}</strong>
            <span class="meta">
              · {{ votesText(row.votes) }}
              <template v-if="!canVote && myScores?.[row.entryId] !== undefined">
                · you: {{ myScores[row.entryId] }}
              </template>
            </span>
            <button
              v-if="canVote && myScores?.[row.entryId] !== undefined"
              type="button"
              class="standing__mine-button"
              :aria-label="`Change your rating for ${row.item.title}, currently ${myScores[row.entryId]}`"
              @click="selectedId = row.entryId"
            >
              you: {{ myScores[row.entryId] }} (edit)
            </button>
            <button
              v-else-if="canVote"
              type="button"
              class="standing__rate-button"
              :aria-label="`Rate ${row.item.title}`"
              @click="selectedId = row.entryId"
            >
              + Rate
            </button>
            <svg
              class="score-bar"
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect class="score-bar__track" width="100" height="6" rx="3" />
              <rect class="score-bar__fill" :width="percent(row)" height="6" rx="3" />
            </svg>
          </span>
        </li>
      </ol>

      <section v-if="standings.provisional.length > 0" class="standings__provisional">
        <component :is="headingLevel ?? 'h3'">Not enough votes yet</component>
        <p class="meta">
          Entries get a place once at least {{ visible.minVotes }} people have rated them. Until
          then they wait here, however high their score, so a few early votes can’t outrank broad
          agreement.
        </p>
        <ul class="ranking">
          <li
            v-for="row in standings.provisional"
            :key="row.entryId"
            class="ranking__row ranking__row--provisional"
          >
            <span class="ranking__rank" aria-hidden="true">–</span>
            <button
              type="button"
              class="standing__art-button ranking__art"
              :aria-label="`Open full details for ${row.item.title}`"
              @click="selectedId = row.entryId"
            >
              <ItemArt :title="row.item.title" :image-url="row.item.imageUrl" size="small" />
            </button>
            <span class="ranking__title">
              <button
                type="button"
                class="standing__title-button"
                @click="selectedId = row.entryId"
              >
                {{ row.item.title }}
              </button>
              <span
                v-if="row.item.subtitle !== null || row.item.director != null"
                class="ranking__metadata meta"
              >
                <span v-if="row.item.subtitle !== null">{{ row.item.subtitle }}</span>
                <span
                  v-if="row.item.subtitle !== null && row.item.director != null"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span v-if="row.item.director != null">Directed by {{ row.item.director }}</span>
              </span>
              <span class="visually-hidden">, </span>
              <span class="tag">{{ needsText(row) }}</span>
              <span v-if="row.nominatedBy !== null" class="standing__nominator">
                Nominated by {{ row.nominatedBy }}
              </span>
              <PublicScoreDisclosure v-if="voters(row) !== null" :scores="voters(row) ?? []" />
            </span>
            <span class="ranking__numbers">
              <strong>{{ row.score?.toFixed(1) }}</strong>
              <span class="meta">
                · {{ votesText(row.votes) }}
                <template v-if="!canVote && myScores?.[row.entryId] !== undefined">
                  · you: {{ myScores[row.entryId] }}
                </template>
              </span>
              <button
                v-if="canVote && myScores?.[row.entryId] !== undefined"
                type="button"
                class="standing__mine-button"
                :aria-label="`Change your rating for ${row.item.title}, currently ${myScores[row.entryId]}`"
                @click="selectedId = row.entryId"
              >
                you: {{ myScores[row.entryId] }} (edit)
              </button>
              <button
                v-else-if="canVote"
                type="button"
                class="standing__rate-button"
                :aria-label="`Rate ${row.item.title}`"
                @click="selectedId = row.entryId"
              >
                + Rate
              </button>
            </span>
          </li>
        </ul>
      </section>

      <section v-if="standings.unrated.length > 0" class="standings__unrated">
        <component :is="headingLevel ?? 'h3'">Not rated yet</component>
        <ul class="ranking">
          <li v-for="row in standings.unrated" :key="row.entryId" class="ranking__row">
            <span class="ranking__rank" aria-hidden="true">–</span>
            <button
              type="button"
              class="standing__art-button ranking__art"
              :aria-label="`Open full details for ${row.item.title}`"
              @click="selectedId = row.entryId"
            >
              <ItemArt :title="row.item.title" :image-url="row.item.imageUrl" size="small" />
            </button>
            <span class="ranking__title">
              <button
                type="button"
                class="standing__title-button"
                @click="selectedId = row.entryId"
              >
                {{ row.item.title }}
              </button>
              <span
                v-if="row.item.subtitle !== null || row.item.director != null"
                class="ranking__metadata meta"
              >
                <span v-if="row.item.subtitle !== null">{{ row.item.subtitle }}</span>
                <span
                  v-if="row.item.subtitle !== null && row.item.director != null"
                  aria-hidden="true"
                >
                  ·
                </span>
                <span v-if="row.item.director != null">Directed by {{ row.item.director }}</span>
              </span>
              <span v-if="row.nominatedBy !== null" class="standing__nominator">
                Nominated by {{ row.nominatedBy }}
              </span>
            </span>
            <span class="ranking__numbers meta">
              No votes yet
              <button
                v-if="canVote && myScores?.[row.entryId] !== undefined"
                type="button"
                class="standing__mine-button"
                :aria-label="`Change your rating for ${row.item.title}, currently ${myScores[row.entryId]}`"
                @click="selectedId = row.entryId"
              >
                you: {{ myScores[row.entryId] }} (edit)
              </button>
              <button
                v-else-if="canVote"
                type="button"
                class="standing__rate-button"
                :aria-label="`Rate ${row.item.title}`"
                @click="selectedId = row.entryId"
              >
                + Rate
              </button>
            </span>
          </li>
        </ul>
      </section>

      <p class="standings__note meta">
        Each score blends an entry’s average rating with the average across all ratings. As more
        people rate an entry, its own average has more influence. An entry needs at least
        {{ visible.minVotes }} votes to get a place; scores can change until voting closes.
      </p>
    </template>
    <EntryDetails
      :entry="selectedEntry"
      :scale="scale"
      :standing="selectedStanding"
      :public-scores="selectedVoters"
      :score="
        selectedId !== null && canVote && scoreState !== undefined ? scoreState(selectedId) : null
      "
      :final-score="selectedId === null ? undefined : myScores?.[selectedId]"
      @close="selectedId = null"
      @change="
        selectedId !== null ? emit('rate', { entryId: selectedId, score: $event }) : undefined
      "
    />
  </div>
</template>
