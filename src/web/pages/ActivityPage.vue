<script setup lang="ts">
import { computed, ref } from 'vue';
import ActivityEvent from '../components/ActivityEvent.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import { useAdminActivity } from '../composables/admin-activity.ts';
import { activityDay } from '../lib/activity.ts';
import { usePageTitle } from '../lib/page-title.ts';

const { selectedList, lists, data, error, busy, page, selectList, older, newer, refresh } =
  useAdminActivity();
usePageTitle(() =>
  page.value === 0 ? 'Activity log' : `Activity log (page ${String(page.value + 1)})`,
);
const now = ref(new Date());
const groups = computed(() => {
  const days: { label: string; events: NonNullable<typeof data.value>['events'][number][] }[] = [];
  for (const event of data.value?.events ?? []) {
    const label = activityDay(event.at, now.value);
    const last = days.at(-1);
    if (last?.label === label) last.events.push(event);
    else days.push({ label, events: [event] });
  }
  return days;
});
const chosenName = computed(
  () =>
    lists.value.find((list) => list.id === selectedList.value || list.slug === selectedList.value)
      ?.title,
);
const selectedId = computed(
  () =>
    lists.value.find((list) => list.id === selectedList.value || list.slug === selectedList.value)
      ?.id ?? selectedList.value,
);
const filter = (event: Event) => {
  if (event.target instanceof HTMLSelectElement) void selectList(event.target.value);
};
const reload = () => {
  now.value = new Date();
  void refresh();
};
</script>

<template>
  <div class="stack admin-page activity-page">
    <header class="stack">
      <p class="eyebrow">Admin only</p>
      <h1>Activity log</h1>
      <p class="lead">See changes admins have made to lists and entries.</p>
      <p class="meta">
        This is a shared history of decisions, not a record of votes or technical errors.
      </p>
    </header>
    <div class="card activity-page__filters">
      <div class="stack">
        <label for="activity-list">List</label>
        <select id="activity-list" :value="selectedId" @change="filter">
          <option value="">All lists</option>
          <option v-if="selectedList !== '' && chosenName === undefined" :value="selectedList">
            Selected list ({{ selectedList }})
          </option>
          <option v-for="list in lists" :key="list.id" :value="list.id">
            {{ list.title }} ({{ list.slug }})
          </option>
        </select>
      </div>
      <button type="button" class="button" :disabled="busy" @click="reload">
        Refresh activity
      </button>
    </div>
    <p class="meta">Newest first · Times shown in your local time zone.</p>
    <ErrorNotice :error="error" />
    <p v-if="busy" role="status">Loading activity…</p>
    <p v-else-if="data !== null && error === null" role="status" class="meta">
      {{ data.events.length }} {{ data.events.length === 1 ? 'event' : 'events' }} on page
      {{ page + 1 }}<template v-if="chosenName !== undefined"> for {{ chosenName }}</template
      >.
    </p>
    <section aria-label="Recorded activity" :aria-busy="busy" class="stack" tabindex="-1">
      <p v-if="!busy && error === null && data?.events.length === 0" class="empty">
        {{
          selectedList === ''
            ? 'No activity recorded yet.'
            : 'No activity recorded for this list yet.'
        }}
        Changes made before activity history was introduced are not recorded.
      </p>
      <section v-for="group in groups" :key="group.label" class="activity-page__day stack">
        <h2>{{ group.label }}</h2>
        <ol class="activity__timeline">
          <li v-for="event in group.events" :key="event.id" class="activity__event">
            <ActivityEvent :event="event" :list="event.list" collapsible />
          </li>
        </ol>
      </section>
    </section>
    <nav v-if="page > 0 || data?.nextCursor != null" aria-label="Activity pages" class="actions">
      <button type="button" class="button" :disabled="busy || page === 0" @click="newer">
        Newer activity
      </button>
      <span class="meta">Page {{ page + 1 }}</span>
      <button
        type="button"
        class="button"
        :disabled="busy || data?.nextCursor == null"
        @click="older"
      >
        Older activity
      </button>
    </nav>
    <details class="card stack">
      <summary>About this history</summary>
      <p>
        Admin names are kept for one year after each action, or until they delete their data. Older
        actions remain without a name.
      </p>
      <p>
        Old titles, addresses, descriptions and explanations are not kept. List names shown here are
        their current names. Deleting a list removes its history; deleting an entry removes its
        identifying history.
      </p>
      <p>
        Activity history is not included in list backups. An imported list starts with a new import
        event. This is a collaboration aid, not a tamper-proof audit log.
      </p>
    </details>
  </div>
</template>
