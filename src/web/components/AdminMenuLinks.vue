<script setup lang="ts">
import { adminGuideUrl, adminSections } from '../lib/navigation.ts';
import ExternalLink from './ui/ExternalLink.vue';

defineProps<{ heading?: 'h3' | 'h4' }>();
defineEmits<{ navigate: [] }>();
</script>

<template>
  <template v-for="section in adminSections" :key="section.label">
    <component :is="heading ?? 'h3'" class="menu__heading">{{ section.label }}</component>
    <ul class="menu__group">
      <li v-for="link in section.links" :key="link.route">
        <RouterLink class="menu__item" :to="{ name: link.route }" @click="$emit('navigate')">
          {{ link.label }}
        </RouterLink>
      </li>
    </ul>
  </template>
  <component :is="heading ?? 'h3'" class="menu__heading">Help</component>
  <ul class="menu__group">
    <li>
      <ExternalLink class="menu__item" :href="adminGuideUrl" @click="$emit('navigate')"
        >Admin guide and FAQ</ExternalLink
      >
    </li>
  </ul>
</template>
