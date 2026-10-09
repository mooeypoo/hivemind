<script setup lang="ts">
import { ref } from 'vue';
import type { DemoPersona } from '../../server/http/contracts.ts';
import { api, navigation, type ApiError } from '../services/api.ts';
import ErrorNotice from './ErrorNotice.vue';

const personas: { persona: DemoPersona; label: string; hint: string }[] = [
  { persona: 'admin', label: 'Try as Demo Admin', hint: 'can create and edit lists' },
  { persona: 'member-a', label: 'Try as Demo Member A', hint: 'can nominate and rate' },
  { persona: 'member-b', label: 'Try as Demo Member B', hint: 'a second member, to compare' },
];

const busy = ref(false);
const error = ref<ApiError | null>(null);

const signIn = async (persona: DemoPersona) => {
  busy.value = true;
  error.value = null;
  const result = await api.post('/api/auth/demo', { persona });
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  navigation.assign('/');
};
</script>

<template>
  <section class="card demo-sign-in" aria-labelledby="demo-heading">
    <h2 id="demo-heading">Demo mode</h2>
    <p>
      This is a demo with sample lists and pretend accounts, for trying things out. Nothing here is
      real, and it isn’t shared with the live site.
    </p>
    <ul class="demo-sign-in__personas">
      <li v-for="entry in personas" :key="entry.persona">
        <button type="button" class="button" :disabled="busy" @click="signIn(entry.persona)">
          {{ entry.label }}
        </button>
        <span class="meta">{{ entry.hint }}</span>
      </li>
    </ul>
    <ErrorNotice :error="error" />
  </section>
</template>
