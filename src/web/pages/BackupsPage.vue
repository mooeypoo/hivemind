<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BackupPreview, ImportSummaryDto } from '../../server/http/contracts.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import { formatDateTime } from '../lib/datetime.ts';
import { usePageTitle } from '../lib/page-title.ts';
import { api, type ApiError } from '../services/api.ts';
import { site } from '../state/site.ts';

usePageTitle(() => 'Backups');

/** The chosen file, as text, and what it contains (read in the browser, before importing). */
const fileText = ref<string | null>(null);
const preview = ref<BackupPreview | null>(null);
const fileProblem = ref('');
const busy = ref(false);
const error = ref<ApiError | null>(null);
const summary = ref<ImportSummaryDto | null>(null);

const readFile = async (event: Event) => {
  summary.value = null;
  error.value = null;
  fileProblem.value = '';
  preview.value = null;
  fileText.value = null;
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file === undefined) return;
  const text = await file.text();
  try {
    const parsed = JSON.parse(text) as Partial<BackupPreview>;
    if (parsed.format !== 'votable-lists-backup' || !Array.isArray(parsed.lists))
      throw new Error('format');
    preview.value = parsed as BackupPreview;
    fileText.value = text;
  } catch {
    fileProblem.value = 'That file isn’t a backup from this site.';
  }
};

const votesInFile = computed(
  () => preview.value?.lists.filter((part) => part.ballots !== null).length ?? 0,
);

const importFile = async () => {
  if (fileText.value === null) return;
  busy.value = true;
  error.value = null;
  const result = await api.post<ImportSummaryDto>(
    '/api/admin/backup',
    JSON.parse(fileText.value) as unknown,
  );
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  summary.value = result.data;
  preview.value = null;
  fileText.value = null;
};
</script>

<template>
  <div class="stack prose admin-page">
    <div>
      <p class="eyebrow">Admin</p>
      <h1>Backups</h1>
    </div>

    <p v-if="site.info?.backups !== true" class="notice">
      Backups aren’t set up on this site. To turn them on, set a <code>BACKUP_KEY</code> (at least
      32 random characters) in the site’s environment variables, and keep a copy of it somewhere
      safe: without the same key, the votes in a backup can’t be restored.
    </p>

    <template v-else>
      <p class="lead">
        Download your lists to keep a copy, and import them again if you ever need to.
      </p>
      <ul>
        <li>
          <strong>Votes stay private.</strong> They’re sealed inside the file: nobody holding it can
          see how anyone voted. Only this site, with the same backup key, can restore them.
        </li>
        <li>
          <strong>Deleted data stays deleted.</strong> Members who deleted their data after a backup
          was made are never restored from it.
        </li>
        <li>
          <strong>Nothing is overwritten.</strong> Importing always adds lists. If a list’s address
          is taken, it’s added under a new address, hidden, for you to review.
        </li>
      </ul>

      <section class="card stack" aria-labelledby="export-heading">
        <h2 id="export-heading">Download</h2>
        <p>
          One file with every list, its entries, nominations and sealed votes. To back up a single
          list, use “Download a backup of this list” in its editor.
        </p>
        <div class="actions">
          <a class="button button--primary" href="/api/admin/backup" download>Download all lists</a>
        </div>
        <p class="meta">
          The file includes nominators’ names and Discord IDs. Store it as carefully as the site.
        </p>
      </section>

      <section class="card stack" aria-labelledby="import-heading">
        <h2 id="import-heading">Import</h2>
        <label for="backup-file">Backup file</label>
        <input id="backup-file" type="file" accept=".json,application/json" @change="readFile" />
        <p v-if="fileProblem !== ''" class="notice notice--error" role="alert">{{ fileProblem }}</p>

        <template v-if="preview !== null">
          <p>
            Made <time :datetime="preview.exportedAt">{{ formatDateTime(preview.exportedAt) }}</time
            >, with {{ preview.lists.length }}
            {{ preview.lists.length === 1 ? 'list' : 'lists' }} ({{ votesInFile }} with votes):
          </p>
          <ul>
            <li v-for="part in preview.lists" :key="part.list.config.slug">
              {{ part.list.config.title }}
              <span class="meta">· {{ part.entries.length }} entries</span>
            </li>
          </ul>
          <div class="actions">
            <button
              type="button"
              class="button button--primary"
              :disabled="busy"
              @click="importFile"
            >
              Import {{ preview.lists.length === 1 ? 'this list' : 'these lists' }}
            </button>
          </div>
        </template>

        <ErrorNotice :error="error" />

        <div v-if="summary !== null" class="stack" role="status">
          <h3>Imported</h3>
          <p v-if="!summary.keyMatched" class="notice">
            This file was made with a different backup key, so nominator names and votes weren’t
            restored. The lists and their entries were.
          </p>
          <ul>
            <li v-for="item in summary.lists" :key="item.title">
              <template v-if="item.ok">
                <RouterLink :to="{ name: 'list', params: { slug: item.slug } }">{{
                  item.title
                }}</RouterLink>
                : {{ item.entries }} entries, {{ item.votesRestored }} votes restored<template
                  v-if="item.membersLeftOut > 0"
                  >, {{ item.membersLeftOut }}
                  {{ item.membersLeftOut === 1 ? 'member' : 'members' }} left out</template
                >.
                <template v-if="item.renamed">
                  Its address was taken, so it’s at <code>/lists/{{ item.slug }}</code> and hidden
                  until you make it public.
                </template>
              </template>
              <template v-else> {{ item.title }}: not imported. {{ item.problem }} </template>
            </li>
          </ul>
        </div>
      </section>
    </template>
  </div>
</template>
