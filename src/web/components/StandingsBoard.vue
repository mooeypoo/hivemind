<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { EntryDto, LeaderboardDto, PublicScoresDto } from '../../server/http/contracts.ts';
import RankingGroup from './RankingGroup.vue';

const props = defineProps<{
  board: LeaderboardDto;
  entries: readonly EntryDto[];
  scale: { readonly min: number; readonly max: number };
  myScores?: Readonly<Record<string, number>> | undefined;
  publicScores?: PublicScoresDto | undefined;
  canVote?: boolean | undefined;
  scoreState?:
    | ((entryId: string) => { value: number | null; saving: boolean; error: string | null })
    | undefined;
  headingLevel?: 'h2' | 'h3' | undefined;
}>();
const emit = defineEmits<{ rate: [event: { entryId: string; score: number | null }] }>();
const mode = ref<'separate' | 'combined'>('separate');
const id = useId();
const groups = computed(() => (props.board.hidden ? undefined : props.board.groups));
const separate = computed(() => groups.value !== undefined && mode.value === 'separate');
const mainEntries = computed(() => props.entries.filter((entry) => entry.setAsideReason == null));
const asideEntries = computed(() => props.entries.filter((entry) => entry.setAsideReason != null));
const mainBoard = computed((): LeaderboardDto =>
  props.board.hidden || groups.value === undefined
    ? props.board
    : { ...props.board, rows: groups.value.main },
);
const asideBoard = computed((): LeaderboardDto =>
  props.board.hidden || groups.value === undefined
    ? props.board
    : { ...props.board, rows: groups.value.setAside },
);
</script>

<template>
  <div class="standings-view">
    <template v-if="groups !== undefined">
      <fieldset class="ranking-view" :aria-describedby="`${id}-help`">
        <legend>Ranking view</legend>
        <label>
          <input v-model="mode" type="radio" :name="`${id}-mode`" value="separate" />
          Separate
        </label>
        <label>
          <input v-model="mode" type="radio" :name="`${id}-mode`" value="combined" />
          Combined
        </label>
      </fieldset>
      <p :id="`${id}-help`" class="meta">
        {{
          separate
            ? 'Scores are calculated within each group.'
            : 'Includes entries outside this list’s criteria.'
        }}
        Combined view recalculates all entries together; scores and positions may change.
      </p>
    </template>
    <component :is="headingLevel ?? 'h3'" v-if="separate">Main ranking</component>
    <p v-if="separate && mainEntries.length === 0" class="empty">
      All entries have been set aside. There are no entries in the main ranking.
    </p>
    <RankingGroup
      v-else
      v-bind="props"
      :board="separate ? mainBoard : board"
      :entries="separate ? mainEntries : entries"
      :show-unrated="groups !== undefined"
      :heading-level="separate ? (headingLevel === 'h2' ? 'h3' : 'h4') : headingLevel"
      @rate="emit('rate', $event)"
    />
    <section v-if="separate" class="set-aside-ranking" :aria-labelledby="`${id}-aside`">
      <component :is="headingLevel ?? 'h3'" :id="`${id}-aside`">
        Set aside <span class="meta">({{ asideEntries.length }})</span>
      </component>
      <p class="meta">
        These entries are outside this list’s criteria. You can still rate them while voting is
        open. Places here are within the set-aside group only.
      </p>
      <RankingGroup
        v-bind="props"
        :board="asideBoard"
        :entries="asideEntries"
        :heading-level="headingLevel === 'h2' ? 'h3' : 'h4'"
        rank-label="Set-aside rank"
        quiet
        @rate="emit('rate', $event)"
      />
    </section>
  </div>
</template>
