<script setup lang="ts">
import { ref } from 'vue';
import { useTheme, type ThemeChoice } from '../composables/theme.ts';
import { adminGuideUrl, adminLinks, primaryLinks } from '../lib/navigation.ts';
import { api, loginUrl, navigation, type ApiError } from '../services/api.ts';
import { session, signOut } from '../state/session.ts';
import { site } from '../state/site.ts';
import CommunityBadge from './CommunityBadge.vue';
import ConfirmDialog from './ConfirmDialog.vue';
import ErrorNotice from './ErrorNotice.vue';
import AppDialog from './ui/AppDialog.vue';
import ExternalLink from './ui/ExternalLink.vue';

const siteName = import.meta.env.VITE_SITE_NAME;
const theme = useTheme();
const themeChoices: readonly { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const menuOpen = ref(false);
const closeMenu = () => {
  menuOpen.value = false;
};
const adminMenuOpen = ref(false);
const closeAdminMenu = () => {
  adminMenuOpen.value = false;
};

const confirmingDelete = ref(false);
const deleteError = ref<ApiError | null>(null);
const askToDelete = () => {
  menuOpen.value = false;
  confirmingDelete.value = true;
};
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
    <RouterLink to="/" class="site-header__brand">
      <CommunityBadge
        v-if="site.info?.community != null && site.info.community.iconUrl !== null"
        :community="site.info.community"
        :show-name="false"
      />
      <span class="site-header__name">{{ siteName }}</span>
    </RouterLink>

    <nav class="site-nav" aria-label="Main">
      <RouterLink
        v-for="link in primaryLinks"
        :key="link.route"
        class="site-nav__link"
        :to="{ name: link.route }"
      >
        {{ link.label }}
      </RouterLink>
      <button
        v-if="session.me?.isAdmin === true"
        type="button"
        class="site-nav__link site-nav__admin"
        aria-haspopup="dialog"
        :aria-expanded="adminMenuOpen"
        @click="adminMenuOpen = true"
      >
        Admin
      </button>
    </nav>

    <div class="site-header__end">
      <a
        v-if="session.loaded && session.me === null"
        class="button button--primary site-header__sign-in"
        :href="loginUrl()"
      >
        Sign in
      </a>
      <button
        type="button"
        class="menu-trigger"
        aria-haspopup="dialog"
        :aria-expanded="menuOpen"
        :aria-label="session.me === null ? 'Menu' : `Menu for ${session.me.displayName}`"
        @click="menuOpen = true"
      >
        <template v-if="session.me !== null">
          <img :src="session.me.avatarUrl" alt="" class="avatar" width="32" height="32" />
          <span class="menu-trigger__name">{{ session.me.displayName }}</span>
        </template>
        <span v-else class="menu-trigger__icon" aria-hidden="true"></span>
      </button>
    </div>
  </header>

  <AppDialog :open="menuOpen" title="Menu" variant="sheet" @close="closeMenu">
    <div v-if="session.me !== null" class="menu-identity">
      <img :src="session.me.avatarUrl" alt="" class="avatar avatar--large" width="48" height="48" />
      <div>
        <p class="menu-identity__name">{{ session.me.displayName }}</p>
        <p v-if="session.me.isAdmin" class="pill">Admin</p>
      </div>
    </div>

    <nav class="menu" aria-label="Site">
      <ul class="menu__group">
        <li v-for="link in primaryLinks" :key="link.route">
          <RouterLink class="menu__item" :to="{ name: link.route }" @click="closeMenu">
            {{ link.label }}
          </RouterLink>
        </li>
      </ul>

      <div v-if="session.me?.isAdmin === true" class="menu__admin">
        <h3 class="menu__heading">Admin</h3>
        <ul class="menu__group">
          <li v-for="link in adminLinks" :key="link.route">
            <RouterLink class="menu__item" :to="{ name: link.route }" @click="closeMenu">
              {{ link.label }}
            </RouterLink>
          </li>
          <li>
            <ExternalLink class="menu__item" :href="adminGuideUrl" @click="closeMenu"
              >Admin guide and FAQ</ExternalLink
            >
          </li>
        </ul>
      </div>

      <h3 class="menu__heading">{{ session.me === null ? 'Privacy' : 'Your data' }}</h3>
      <ul class="menu__group">
        <li>
          <RouterLink class="menu__item" :to="{ name: 'privacy' }" @click="closeMenu">
            Privacy
          </RouterLink>
        </li>
        <template v-if="session.me !== null">
          <li>
            <a class="menu__item" href="/api/me/export" download="my-data.json">
              Download my data
            </a>
          </li>
          <li>
            <button type="button" class="menu__item menu__item--danger" @click="askToDelete">
              Delete my data
            </button>
          </li>
        </template>
      </ul>
    </nav>

    <fieldset class="segmented">
      <legend class="menu__heading">Appearance</legend>
      <label v-for="option in themeChoices" :key="option.value" class="segmented__option">
        <input
          type="radio"
          name="theme"
          :value="option.value"
          :checked="theme.choice.value === option.value"
          @change="theme.set(option.value)"
        />
        <span>{{ option.label }}</span>
      </label>
    </fieldset>

    <template #actions>
      <button v-if="session.me !== null" type="button" class="button" @click="signOut">
        Sign out
      </button>
      <a v-else-if="session.loaded" class="button button--primary" :href="loginUrl()">
        Sign in with Discord
      </a>
      <button type="button" class="button" @click="closeMenu">Close</button>
    </template>
  </AppDialog>

  <AppDialog
    v-if="session.me?.isAdmin === true"
    :open="adminMenuOpen"
    title="Admin"
    variant="sheet"
    class="admin-menu"
    @close="closeAdminMenu"
  >
    <nav aria-label="Admin">
      <ul class="menu__group">
        <li v-for="link in adminLinks" :key="link.route">
          <RouterLink class="menu__item" :to="{ name: link.route }" @click="closeAdminMenu">
            {{ link.label }}
          </RouterLink>
        </li>
        <li>
          <ExternalLink class="menu__item" :href="adminGuideUrl" @click="closeAdminMenu"
            >Admin guide and FAQ</ExternalLink
          >
        </li>
      </ul>
    </nav>
    <template #actions>
      <button type="button" class="button" @click="closeAdminMenu">Close</button>
    </template>
  </AppDialog>

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
