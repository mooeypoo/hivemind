<script setup lang="ts">
import type { ApiError } from '../services/api.ts';

defineProps<{ error: ApiError | null }>();
</script>

<template>
  <div class="notice notice--error" role="alert" aria-live="assertive">
    <template v-if="error !== null">
      <p>{{ error.message }}</p>
      <ul v-if="error.details !== undefined && error.details.length > 0">
        <li v-for="detail in error.details" :key="detail">{{ detail }}</li>
      </ul>
    </template>
  </div>
</template>
