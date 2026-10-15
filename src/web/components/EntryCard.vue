<script setup lang="ts">
import type { EntryDto, LeaderboardRowDto } from '../../server/http/contracts.ts';
import ItemArt from './ui/ItemArt.vue';

defineProps<{ entry: EntryDto; standing?: LeaderboardRowDto | undefined; rated?: boolean }>();
const emit = defineEmits<{ open: [] }>();
</script>

<template>
  <li class="entry" :class="{ 'entry--mine': entry.isMine, 'entry--rated': rated === true }">
    <button
      type="button"
      class="entry__art"
      :aria-label="`Open full details for ${entry.item.title}`"
      @click="emit('open')"
    >
      <ItemArt
        :title="entry.item.title"
        :subtitle="entry.item.subtitle"
        :image-url="entry.item.imageUrl"
      />
      <span
        v-if="standing !== undefined && standing.rank !== null"
        class="rank-badge"
        aria-hidden="true"
        >#{{ standing.rank }}</span
      >
    </button>
    <div class="entry__body">
      <h3 class="entry__title">
        <button
          type="button"
          class="entry__title-button"
          :aria-label="`Open details for ${entry.item.title}`"
          @click="emit('open')"
        >
          <span>{{ entry.item.title }}</span>
          <span class="entry__info-icon" aria-hidden="true">i</span>
        </button>
      </h3>
      <p
        v-if="
          entry.item.subtitle !== null ||
          entry.item.director != null ||
          entry.item.creator != null ||
          entry.item.developer != null ||
          entry.item.publisher != null
        "
        class="entry__subtitle"
      >
        <span v-if="entry.item.subtitle !== null">{{ entry.item.subtitle }}</span>
        <span
          v-if="
            entry.item.subtitle !== null &&
            (entry.item.director != null ||
              entry.item.creator != null ||
              entry.item.developer != null ||
              entry.item.publisher != null)
          "
          aria-hidden="true"
        >
          ·
        </span>
        <span v-if="entry.item.creator != null">Created by {{ entry.item.creator }}</span>
        <span v-else-if="entry.item.director != null">Directed by {{ entry.item.director }}</span>
        <span v-else-if="entry.item.developer != null">
          Developed by {{ entry.item.developer }}
        </span>
        <span v-else-if="entry.item.publisher != null">
          Published by {{ entry.item.publisher }}
        </span>
      </p>
      <p v-if="entry.isMine" class="entry__meta"><span class="pill pill--mine">Yours</span></p>
      <p v-else-if="entry.nominatedBy !== null" class="entry__meta">
        Nominated by {{ entry.nominatedBy }}
      </p>
      <p v-if="standing !== undefined" class="entry__standing">
        <template v-if="standing.votes === 0">No votes yet</template>
        <template v-else-if="standing.rank === null">
          <span class="tag"
            >Needs {{ standing.votesNeeded }} more
            {{ standing.votesNeeded === 1 ? 'vote' : 'votes' }} for a place</span
          >
        </template>
        <template v-else>Rank {{ standing.rank }}</template>
      </p>
    </div>
    <div class="entry__rate"><slot /></div>
  </li>
</template>
