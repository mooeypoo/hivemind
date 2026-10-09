<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { RoleLabelsDto } from '../../server/http/contracts.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import { usePageTitle } from '../lib/page-title.ts';
import { api, type ApiError } from '../services/api.ts';

usePageTitle(() => 'Roles');

interface Row {
  key: number;
  name: string;
  roleId: string;
}

let nextKey = 0;
const rows = ref<Row[]>([]);
const version = ref<string | null>(null);
const error = ref<ApiError | null>(null);
const status = ref('');
const busy = ref(false);

const toRows = (data: RoleLabelsDto) =>
  data.labels.map((label) => ({ key: nextKey++, name: label.name, roleId: label.roleId }));

onMounted(async () => {
  const result = await api.get<RoleLabelsDto>('/api/roles');
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  rows.value = toRows(result.data);
  version.value = result.data.version;
});

const add = () => {
  rows.value.push({ key: nextKey++, name: '', roleId: '' });
};
const remove = (key: number) => {
  rows.value = rows.value.filter((row) => row.key !== key);
};

/** Rows whose ID field holds something other than a role ID, e.g. the role's name. */
const notIds = computed(() =>
  rows.value.filter((row) => row.roleId.trim() !== '' && !/^\d{5,25}$/.test(row.roleId.trim())),
);

const save = async () => {
  busy.value = true;
  error.value = null;
  status.value = '';
  const result = await api.put<RoleLabelsDto>('/api/roles', {
    labels: rows.value.map(({ name, roleId }) => ({ name, roleId })),
    version: version.value,
  });
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  rows.value = toRows(result.data);
  version.value = result.data.version;
  status.value = 'Roles saved.';
};
</script>

<template>
  <div class="stack">
    <h1>Roles</h1>
    <p class="lead">
      Give Discord roles a name here, and they can be chosen by name when limiting who may take part
      in a list.
    </p>
    <details class="card">
      <summary>How do I find a role ID?</summary>
      <p>
        In Discord, turn on Developer Mode (User Settings → Advanced). Then open Server Settings →
        Roles, right-click the role, and choose <strong>Copy Role ID</strong>. If you can’t see the
        server’s roles, ask someone who can to send you the ID.
      </p>
    </details>

    <form class="stack" @submit.prevent="save">
      <table v-if="rows.length > 0" class="roles-table">
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Role ID</th>
            <th scope="col"><span class="visually-hidden">Remove</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row.key">
            <td>
              <input
                v-model="row.name"
                type="text"
                maxlength="60"
                required
                :aria-label="`Name for role ${String(index + 1)}`"
              />
            </td>
            <td>
              <input
                v-model="row.roleId"
                type="text"
                inputmode="numeric"
                required
                :aria-label="`Role ID for role ${String(index + 1)}`"
                :aria-invalid="notIds.includes(row)"
              />
            </td>
            <td>
              <button type="button" class="button" @click="remove(row.key)">
                Remove<span class="visually-hidden">
                  {{ row.name || `role ${String(index + 1)}` }}</span
                >
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">No roles named yet.</p>

      <p v-if="notIds.length > 0" class="notice notice--error" role="alert">
        “{{ notIds[0]?.roleId }}” isn’t a role ID. Role IDs are long numbers; see “How do I find a
        role ID?” above.
      </p>

      <ErrorNotice :error="error" />
      <p class="visually-hidden" aria-live="polite">{{ status }}</p>
      <p v-if="status !== ''" class="notice notice--success">{{ status }}</p>

      <div class="actions">
        <button type="button" class="button" @click="add">Add a role</button>
        <button type="submit" class="button button--primary" :disabled="busy || notIds.length > 0">
          Save
        </button>
      </div>
    </form>
  </div>
</template>
