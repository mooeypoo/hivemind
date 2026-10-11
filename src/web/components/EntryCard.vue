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
      :aria-label="`Details for ${entry.item.title}`"
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
        :class="{ 'rank-badge--provisional': standing.provisional }"
        aria-hidden="true"
        >#{{ standing.rank }}</span
      >
    </button>
    <div class="entry__body">
      <h3 class="entry__title">{{ entry.item.title }}</h3>
      <p v-if="entry.item.subtitle !== null" class="entry__subtitle">{{ entry.item.subtitle }}</p>
      <p v-if="entry.isMine" class="entry__meta"><span class="pill pill--mine">Yours</span></p>
      <p v-else-if="entry.nominatedBy !== null" class="entry__meta">
        Nominated by {{ entry.nominatedBy }}
      </p>
      <p v-if="standing !== undefined" class="entry__standing">
        <template v-if="standing.rank === null">No votes yet</template>
        <template v-else>
          Rank {{ standing.rank }}
          <span v-if="standing.provisional" class="tag">Provisional</span>
        </template>
      </p>
    </div>
    <div class="entry__rate"><slot /></div>
  </li>
</template>
