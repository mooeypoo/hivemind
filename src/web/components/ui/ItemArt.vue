<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { initials, titleCardVariant } from '../../lib/items.ts';

const props = defineProps<{
  title: string;
  subtitle?: string | null;
  imageUrl: string | null;
  /** Alt text for the image; the title card is decorative because the title is shown nearby. */
  alt?: string;
  size?: 'small' | 'normal' | 'large';
}>();

/** A poster that fails to load falls back to the title card. */
const failed = ref(false);
watch(
  () => props.imageUrl,
  () => {
    failed.value = false;
  },
);
const variant = computed(() => titleCardVariant(props.title));
</script>

<template>
  <img
    v-if="imageUrl !== null && !failed"
    :src="imageUrl"
    :alt="alt ?? ''"
    class="item-art"
    :class="`item-art--${size ?? 'normal'}`"
    loading="lazy"
    width="342"
    height="513"
    @error="failed = true"
  />
  <div
    v-else
    class="item-art title-card"
    :class="[`item-art--${size ?? 'normal'}`, `title-card--${variant}`]"
    aria-hidden="true"
  >
    <span v-if="size === 'small'" class="title-card__initials">{{ initials(title) }}</span>
    <template v-else>
      <span class="title-card__title">{{ title }}</span>
      <span v-if="subtitle != null" class="title-card__subtitle">{{ subtitle }}</span>
    </template>
  </div>
</template>
