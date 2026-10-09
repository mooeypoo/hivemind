<script setup lang="ts">
import { ref } from 'vue';
import { api, loginUrl, navigation, type ApiError } from '../services/api.ts';
import { session, signOut } from '../state/session.ts';
import { site } from '../state/site.ts';
import CommunityBadge from './CommunityBadge.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import ErrorNotice from './ErrorNotice.vue';

const siteName = import.meta.env.VITE_SITE_NAME;
const confirmingDelete = ref(false);
const menu = ref<HTMLDetailsElement | null>(null);
const siteMenu = ref<HTMLDetailsElement | null>(null);

/** Escape closes an open menu and returns focus to its button. */
const closeMenu = (element: HTMLDetailsElement | null) => {
  if (element?.open !== true) return;
  element.open = false;
  element.querySelector('summary')?.focus();
};
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
    <RouterLink to="/" class="site-header__name">
      <CommunityBadge
        v-if="site.info?.community != null && site.info.community.iconUrl !== null"
        :community="site.info.community"
        :show-name="false"
      />
      {{ siteName }}
    </RouterLink>
    <nav class="site-header__nav" aria-label="Site and account">
      <details ref="siteMenu" class="menu site-menu" @keydown.escape="closeMenu(siteMenu)">
        <summary class="menu__trigger">Menu</summary>
        <div class="menu__panel">
          <RouterLink class="menu__item" :to="{ name: 'lists' }" @click="closeMenu(siteMenu)">
            Lists
          </RouterLink>
          <RouterLink class="menu__item" :to="{ name: 'about' }" @click="closeMenu(siteMenu)">
            About
          </RouterLink>
          <RouterLink class="menu__item" :to="{ name: 'privacy' }" @click="closeMenu(siteMenu)">
            Privacy
          </RouterLink>
        </div>
      </details>
      <template v-if="session.loaded && session.me !== null">
        <details ref="menu" class="menu" @keydown.escape="closeMenu(menu)">
          <summary class="menu__trigger" :aria-label="`Account menu for ${session.me.displayName}`">
            <img :src="session.me.avatarUrl" alt="" class="avatar" width="32" height="32" />
            <span class="account-name">{{ session.me.displayName }}</span>
          </summary>
          <div class="menu__panel">
            <template v-if="session.me.isAdmin">
              <RouterLink class="menu__item" :to="{ name: 'roles' }" @click="closeMenu(menu)">
                Roles
              </RouterLink>
              <RouterLink class="menu__item" :to="{ name: 'backups' }" @click="closeMenu(menu)">
                Backups
              </RouterLink>
            </template>
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
      <a v-else-if="session.loaded" class="button button--primary" :href="loginUrl()">
        <span class="signin-label">Sign in with Discord</span>
      </a>
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
