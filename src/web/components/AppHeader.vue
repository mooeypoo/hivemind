<script setup lang="ts">
import { ref } from 'vue';
import { api, loginUrl, navigation, type ApiError } from '../services/api.ts';
import { session, signOut } from '../state/session.ts';
import ConfirmDialog from './ConfirmDialog.vue';
import ErrorNotice from './ErrorNotice.vue';

const siteName = import.meta.env.VITE_SITE_NAME;
const confirmingDelete = ref(false);
const deleteError = ref<ApiError | null>(null);

const deleteMyData = async () => {
  const result = await api.delete('/api/me');
  if (!result.ok) {
    deleteError.value = result.error;
    return;
  }
  confirmingDelete.value = false;
  session.me = null;
  navigation.assign('/');
};
</script>

<template>
  <header class="site-header">
    <RouterLink to="/" class="site-header__name">{{ siteName }}</RouterLink>
    <nav v-if="session.loaded" class="site-header__nav" aria-label="Account">
      <template v-if="session.me !== null">
        <details class="menu">
          <summary class="menu__trigger">
            <img :src="session.me.avatarUrl" alt="" class="avatar" width="32" height="32" />
            <span>{{ session.me.displayName }}</span>
          </summary>
          <div class="menu__panel">
            <a class="menu__item" href="/api/me/export" download="my-data.json">Download my data</a>
            <button
              type="button"
              class="menu__item menu__item--danger"
              @click="confirmingDelete = true"
            >
              Delete my data
            </button>
            <button type="button" class="menu__item" @click="signOut">Sign out</button>
          </div>
        </details>
      </template>
      <a v-else class="button button--primary" :href="loginUrl()">Sign in with Discord</a>
    </nav>
  </header>

  <ConfirmDialog
    v-if="session.me !== null"
    :open="confirmingDelete"
    title="Delete your data?"
    confirm-label="Delete my data"
    danger
    @confirm="deleteMyData"
    @cancel="confirmingDelete = false"
  >
    <p>
      This removes your profile and signs you out. Entries you nominated stay in their lists,
      without your name. This can’t be undone.
    </p>
    <ErrorNotice :error="deleteError" />
  </ConfirmDialog>
</template>
