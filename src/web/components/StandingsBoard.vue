<script setup lang="ts">
import { computed } from 'vue';
import type { EntryDto, LeaderboardDto, PublicScoresDto } from '../../server/http/contracts.ts';
import { durationText, formatDateTime } from '../lib/datetime.ts';
import { buildStandings, scalePercent, type StandingRow } from '../lib/standings.ts';
import PublicScoreDisclosure from './PublicScoreDisclosure.vue';
import ItemArt from './ui/ItemArt.vue';

const props = defineProps<{
  board: LeaderboardDto;
  entries: readonly EntryDto[];
  scale: { readonly min: number; readonly max: number };
  /** The viewer's own scores, shown beside the community's. Omitted on the results page. */
  myScores?: Readonly<Record<string, number>>;
  publicScores?: PublicScoresDto;
  /** The level of this board's own headings: one below the page section it sits in. */
  headingLevel?: 'h2' | 'h3';
}>();

const visible = computed(() => (props.board.hidden ? null : props.board));
const standings = computed(() =>
  visible.value === null ? null : buildStandings(visible.value.rows, props.entries),
);
const anyVotes = computed(() => (standings.value?.podium.length ?? 0) > 0);
const untilReveal = computed(() =>
  props.board.hidden && props.board.revealsAt !== null
    ? new Date(props.board.revealsAt).getTime() - Date.now()
    : null,
);

const percent = (row: StandingRow) =>
  row.score === null ? 0 : scalePercent(row.score, props.scale);
const votesText = (votes: number) => `${String(votes)} ${votes === 1 ? 'vote' : 'votes'}`;
const averageText = (row: StandingRow) =>
  row.average === null ? '' : ` · avg ${row.average.toFixed(1)}`;
const needsText = (row: StandingRow) =>
  `Provisional · needs ${String(row.votesNeeded)} more ${row.votesNeeded === 1 ? 'vote' : 'votes'}`;
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
      <ol class="podium" aria-label="Top three">
        <li
          v-for="row in standings.podium"
          :key="row.entryId"
          class="podium__place"
          :class="[`podium__place--${row.rank}`, { 'podium__place--provisional': row.provisional }]"
        >
          <div class="podium__art">
            <ItemArt
              :title="row.item.title"
              :subtitle="row.item.subtitle"
              :image-url="row.item.imageUrl"
            />
            <span class="podium__medal" :aria-label="`Rank ${String(row.rank)}`">{{
              row.rank
            }}</span>
          </div>
          <p class="podium__title">{{ row.item.title }}</p>
          <p v-if="row.item.subtitle !== null" class="podium__subtitle">{{ row.item.subtitle }}</p>
          <p class="podium__score">
            <strong>{{ row.score?.toFixed(1) }}</strong>
            <span
              ><span class="visually-hidden"> · </span>{{ votesText(row.votes)
              }}{{ averageText(row) }}</span
            >
          </p>
          <p v-if="row.provisional" class="tag">{{ needsText(row) }}</p>
          <p v-if="row.nominatedBy !== null" class="standing__nominator">
            Nominated by {{ row.nominatedBy }}
          </p>
          <p v-if="myScores?.[row.entryId] !== undefined" class="standing__mine">
            You: {{ myScores[row.entryId] }}
          </p>
          <PublicScoreDisclosure v-if="voters(row) !== null" :scores="voters(row) ?? []" />
        </li>
      </ol>

      <ol v-if="standings.rest.length > 0" class="ranking" aria-label="The rest of the ranking">
        <li
          v-for="row in standings.rest"
          :key="row.entryId"
          class="ranking__row"
          :class="{ 'ranking__row--provisional': row.provisional }"
        >
          <span class="ranking__rank" :aria-label="`Rank ${String(row.rank)}`">{{ row.rank }}</span>
          <span class="ranking__title">
            <strong>{{ row.item.title }}</strong>
            <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
            <span v-if="row.provisional" class="tag">{{ needsText(row) }}</span>
            <span v-if="row.nominatedBy !== null" class="standing__nominator">
              Nominated by {{ row.nominatedBy }}
            </span>
            <PublicScoreDisclosure v-if="voters(row) !== null" :scores="voters(row) ?? []" />
          </span>
          <span class="ranking__numbers">
            <strong>{{ row.score?.toFixed(1) }}</strong>
            <span class="meta">
              · {{ votesText(row.votes) }}{{ averageText(row)
              }}<template v-if="myScores?.[row.entryId] !== undefined">
                · you: {{ myScores[row.entryId] }}</template
              >
            </span>
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

      <section v-if="standings.unrated.length > 0" class="standings__unrated">
        <component :is="headingLevel ?? 'h3'">Not rated yet</component>
        <ul class="ranking">
          <li v-for="row in standings.unrated" :key="row.entryId" class="ranking__row">
            <span class="ranking__rank" aria-hidden="true">–</span>
            <span class="ranking__title">
              <strong>{{ row.item.title }}</strong>
              <span v-if="row.item.subtitle !== null" class="meta"> {{ row.item.subtitle }}</span>
              <span v-if="row.nominatedBy !== null" class="standing__nominator">
                Nominated by {{ row.nominatedBy }}
              </span>
            </span>
            <span class="ranking__numbers meta">No votes yet</span>
          </li>
        </ul>
      </section>

      <p class="standings__note meta">
        Scores are weighted: each entry’s average is balanced against how many people rated it, so a
        couple of high votes don’t outrank broad agreement. Entries with fewer than
        {{ visible.minVotes }} votes are provisional and keep their place until confirmed.
      </p>
    </template>
  </div>
</template>
