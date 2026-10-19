<script setup lang="ts">
import type { ListActivityDto, RoleLabelDto } from '../../server/http/contracts.ts';
import { activityField, activityLabel, activityValue } from '../lib/activity.ts';
import { formatDateTime } from '../lib/datetime.ts';

defineProps<{
  event: ListActivityDto['events'][number];
  list?: { readonly title: string; readonly slug: string };
  collapsible?: boolean;
  roles?: readonly RoleLabelDto[] | undefined;
}>();
</script>

<template>
  <article class="stack">
    <h3>{{ activityLabel[event.action] }}</h3>
    <p v-if="list !== undefined" class="activity__list">
      <RouterLink :to="{ name: 'edit-list', params: { slug: list.slug } }">
        {{ list.title }}
      </RouterLink>
    </p>
    <p class="meta">
      <strong>{{ event.adminName ?? 'Admin identity removed' }}</strong> ·
      <time :datetime="event.at">{{ formatDateTime(event.at) }}</time>
    </p>
    <p v-if="event.entryTitle !== null">{{ event.entryTitle }}</p>
    <component
      :is="collapsible ? 'details' : 'div'"
      v-if="event.changes.length > 0"
      class="activity__details"
    >
      <summary v-if="collapsible">View changes</summary>
      <ul class="activity__changes">
        <li v-for="change in event.changes" :key="change.field">
          <strong>{{ activityField[change.field] ?? change.field }}</strong
          ><template v-if="change.before !== null || change.after !== null"
            >: {{ activityValue(change.field, change.before, roles) }} →
            {{ activityValue(change.field, change.after, roles) }}</template
          >
          <template v-else> changed</template>
        </li>
      </ul>
    </component>
  </article>
</template>
