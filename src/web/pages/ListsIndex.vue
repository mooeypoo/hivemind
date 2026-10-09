<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import type { ListDto, ListsDto } from '../../server/http/contracts.ts';
import { api, loginUrl, type ApiError } from '../services/api.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import DemoSignIn from '../components/DemoSignIn.vue';
import ListCard from '../components/ListCard.vue';
import { isLoginOutcome, loginMessage } from '../lib/labels.ts';
import { session } from '../state/session.ts';
import { site } from '../state/site.ts';
import CommunityBadge from '../components/CommunityBadge.vue';
import { usePageTitle } from '../lib/page-title.ts';

const siteName = import.meta.env.VITE_SITE_NAME;
const route = useRoute();
usePageTitle(() => (session.me === null ? null : 'Lists'));

const loginNotice = computed(() => {
  const code = route.query.login;
  return typeof code === 'string' && isLoginOutcome(code) ? loginMessage[code] : null;
});

const lists = ref<readonly ListDto[] | null>(null);

/** Open and upcoming first (drafts included, for Admins), then closed, then archived. */
const groups = computed(() => {
  const all = lists.value ?? [];
  return [
    {
      id: 'current',
      title: 'Open and upcoming',
      lists: all.filter((list) => ['draft', 'scheduled', 'open'].includes(list.lifecycle)),
    },
    {
      id: 'closed',
      title: 'Voting closed',
      lists: all.filter((list) => list.lifecycle === 'closed'),
    },
    {
      id: 'archived',
      title: 'Archived',
      lists: all.filter((list) => list.lifecycle === 'archived'),
    },
  ].filter((group) => group.lists.length > 0);
});
const error = ref<ApiError | null>(null);

onMounted(async () => {
  if (session.me === null) return;
  const result = await api.get<ListsDto>('/api/lists');
  if (result.ok) lists.value = result.data.lists;
  else error.value = result.error;
});
</script>

<template>
  <p v-if="loginNotice !== null" class="notice" role="status">{{ loginNotice }}</p>

  <section v-if="session.me === null" class="hero">
    <h1>{{ siteName }}</h1>
    <p>
      Make ranked lists together: nominate your favourites, rate everyone’s picks, and see what the
      community loves most.
    </p>
    <p v-if="site.info?.community != null" class="hero__community">
      For members of <CommunityBadge :community="site.info.community" />
    </p>
    <p>Sign in with the Discord account you use in this community.</p>
    <div class="actions actions--center">
      <a class="button button--primary button--large" :href="loginUrl('/')">Sign in with Discord</a>
      <a
        v-if="site.info?.community?.inviteUrl != null"
        class="button button--large"
        :href="site.info.community.inviteUrl"
        rel="noopener"
      >
        Join the server
      </a>
    </div>
    <p class="meta">
      <RouterLink :to="{ name: 'privacy' }">What we store, and what we don’t</RouterLink>
    </p>
    <DemoSignIn v-if="site.info?.demo === true" />
  </section>

  <template v-else>
    <div class="page-header lists-heading">
      <div>
        <p class="eyebrow">Community index</p>
        <h1>Lists</h1>
      </div>
      <RouterLink
        v-if="session.me.isAdmin"
        :to="{ name: 'new-list' }"
        class="button button--primary"
      >
        New list
      </RouterLink>
    </div>

    <ErrorNotice :error="error" />
    <p v-if="lists === null && error === null" class="meta" aria-live="polite">Loading lists…</p>
    <p v-else-if="lists !== null && lists.length === 0" class="empty">
      No lists yet.
      <template v-if="session.me.isAdmin"
        >Create the first one with <strong>New list</strong>.</template
      >
      <template v-else>Check back soon.</template>
    </p>
    <template v-else-if="lists !== null">
      <section
        v-for="group in groups"
        :key="group.id"
        class="list-group"
        :aria-labelledby="`group-${group.id}`"
      >
        <h2 :id="`group-${group.id}`">{{ group.title }}</h2>
        <div class="grid">
          <ListCard
            v-for="(list, index) in group.lists"
            :key="list.id"
            :list="list"
            :can-edit="session.me.isAdmin"
            :index="index + 1"
          />
        </div>
      </section>
    </template>
  </template>
</template>
