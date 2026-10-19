<script setup lang="ts">
import { ref, watch } from 'vue';
import type { ListActivityDto, RoleLabelDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import ActivityEvent from './ActivityEvent.vue';
import ErrorNotice from './ErrorNotice.vue';

const props = defineProps<{
  listId: string;
  settingsVersion: number | undefined;
  roles?: readonly RoleLabelDto[] | undefined;
}>();
const open = ref(false);
const busy = ref(false);
const events = ref<ListActivityDto['events']>([]);
const error = ref<ApiError | null>(null);
const count = ref(20);
let requestId = 0;
const load = async () => {
  const request = ++requestId;
  busy.value = true;
  error.value = null;
  const result = await api.get<ListActivityDto>(
    `/api/lists/${encodeURIComponent(props.listId)}/activity`,
  );
  if (request !== requestId) return;
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  events.value = result.data.events;
};
const show = async () => {
  open.value = true;
  await load();
};
watch(
  () => [props.listId, props.settingsVersion],
  () => {
    requestId += 1;
    events.value = [];
    if (open.value) void load();
  },
);
</script>

<template>
  <section class="card stack activity" aria-labelledby="activity-heading">
    <header class="stack">
      <p class="eyebrow">Admin only</p>
      <h2 id="activity-heading">List activity</h2>
      <p class="meta">
        A shared record of list decisions, not a record of votes. Admin names are kept for one year,
        or until they delete their data. Older actions remain without a name.
      </p>
      <RouterLink :to="{ name: 'activity', query: { list: listId } }">
        Open full activity log
      </RouterLink>
    </header>
    <button v-if="!open" type="button" class="button" @click="show">Show activity</button>
    <template v-else>
      <div class="actions">
        <button type="button" class="button" :disabled="busy" @click="load">
          Refresh activity
        </button>
        <button type="button" class="button button--link" @click="open = false">
          Hide activity
        </button>
      </div>
      <ErrorNotice :error="error" />
      <p v-if="busy" role="status">Loading activity…</p>
      <p v-else-if="error === null && events.length === 0" class="meta">
        No activity recorded yet. Changes made before activity history was introduced are not
        recorded.
      </p>
      <ol v-if="events.length > 0" class="activity__timeline">
        <li v-for="event in events.slice(0, count)" :key="event.id" class="activity__event stack">
          <ActivityEvent :event="event" :roles="roles" />
        </li>
      </ol>
      <button v-if="events.length > count" type="button" class="button" @click="count += 20">
        Show older activity
      </button>
    </template>
    <p class="meta">
      Old descriptions and explanations are not kept. Activity history is not included in list
      backups.
    </p>
  </section>
</template>
