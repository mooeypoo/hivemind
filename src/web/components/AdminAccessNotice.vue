<script setup lang="ts">
import { computed } from 'vue';
import type { AccessActionDto, ListDto } from '../../server/http/contracts.ts';

const props = defineProps<{ list: ListDto; editLink?: boolean }>();

const verb: Record<AccessActionDto, string> = { view: 'see', nominate: 'nominate', rate: 'rate' };
const join = (words: readonly string[]) =>
  words.length <= 1
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${String(words.at(-1))}`;

/** "see and rate": what the site admin may do here only because they are a site admin. */
const onlyAsAdmin = computed(() =>
  join(props.list.viewer.viaSiteAdmin.map((action) => verb[action])),
);
</script>

<template>
  <div v-if="list.accessNeedsReview === true" class="notice notice--error" role="alert">
    <p>
      <strong>Access needs review.</strong> An older version of this site changed who can access
      this list, so it is hidden from members to be safe. Check who can view, nominate and rate,
      then save.
    </p>
    <RouterLink
      v-if="editLink !== false"
      :to="{ name: 'edit-list', params: { slug: list.slug }, hash: '#editor-access' }"
      class="button"
    >
      Review access
    </RouterLink>
  </div>
  <p v-if="onlyAsAdmin !== ''" class="notice">
    Your Discord roles aren’t among the ones this list allows. You can {{ onlyAsAdmin }} it because
    you are a site admin.
  </p>
</template>
