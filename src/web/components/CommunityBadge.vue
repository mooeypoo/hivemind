<script setup lang="ts">
import type { CommunityDto } from '../../server/http/contracts.ts';

/** `showName: false` shows only the icon, which then carries the name as its alt text. */
const props = withDefaults(defineProps<{ community: CommunityDto; showName?: boolean }>(), {
  showName: true,
});
</script>

<template>
  <span class="community">
    <img
      v-if="community.iconUrl !== null"
      :src="community.iconUrl"
      :alt="props.showName ? '' : community.name"
      class="community__icon"
      width="24"
      height="24"
    />
    <span v-if="props.showName" class="community__name">{{ community.name }}</span>
  </span>
</template>
