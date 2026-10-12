<script setup lang="ts">
import type { EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';
import PublicScoreDisclosure from './PublicScoreDisclosure.vue';
import AppDialog from './ui/AppDialog.vue';
import ItemArt from './ui/ItemArt.vue';
import ScoreInput from './ui/ScoreInput.vue';

defineProps<{
  entry: EntryDto | null;
  scale: { readonly min: number; readonly max: number };
  standing?: LeaderboardRowDto | undefined;
  publicScores?: readonly { readonly displayName: string; readonly score: number }[] | undefined;
  /** Null: the viewer can't rate (list not open, or a required role is missing). */
  score?: { value: number | null; saving: boolean; error: string | null } | null;
  /** The viewer's final score on a closed list. */
  finalScore?: number | undefined;
}>();
const emit = defineEmits<{ close: []; change: [value: number | null] }>();
</script>

<template>
  <AppDialog :open="entry !== null" :title="entry?.item.title ?? ''" @close="emit('close')">
    <div v-if="entry !== null" class="entry-details">
      <ItemArt
        :title="entry.item.title"
        :subtitle="entry.item.subtitle"
        :image-url="entry.item.imageUrl"
        :alt="`Poster for ${entry.item.title}`"
        size="large"
      />
      <div class="entry-details__info">
        <p v-if="entry.item.subtitle !== null" class="entry-details__subtitle">
          {{ entry.item.subtitle }}
        </p>
        <p v-if="entry.isMine" class="entry__meta"><span class="pill pill--mine">Yours</span></p>
        <p v-else-if="entry.nominatedBy !== null" class="entry__meta">
          Nominated by {{ entry.nominatedBy }}
        </p>
        <dl v-if="standing !== undefined" class="entry-details__stats">
          <div>
            <dt>Rank</dt>
            <dd>{{ standing.rank ?? '–' }}</dd>
          </div>
          <div>
            <dt>Score</dt>
            <dd>{{ standing.score?.toFixed(1) ?? '–' }}</dd>
          </div>
          <div>
            <dt>Votes</dt>
            <dd>{{ standing.votes }}</dd>
          </div>
        </dl>
        <p v-if="standing?.provisional === true && standing.votes > 0" class="meta">
          Provisional: needs {{ standing.votesNeeded }} more
          {{ standing.votesNeeded === 1 ? 'vote' : 'votes' }} to confirm its place.
        </p>
        <PublicScoreDisclosure v-if="publicScores !== undefined" :scores="publicScores" />
      </div>
      <ScoreInput
        v-if="score != null"
        class="entry-details__score"
        :value="score.value"
        :scale="scale"
        :item-title="entry.item.title"
        :saving="score.saving"
        :error="score.error"
        size="large"
        @change="emit('change', $event)"
      />
      <p v-else-if="finalScore !== undefined" class="entry-details__final">
        Your score: <strong>{{ finalScore }}</strong>
      </p>
    </div>
    <template #actions>
      <button type="button" class="button" @click="emit('close')">Close</button>
    </template>
  </AppDialog>
</template>
