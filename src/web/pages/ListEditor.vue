<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  CreateListRequest,
  ItemSourceKind,
  ListDetailDto,
  ListDto,
  PresetImportedDto,
  SourcesDto,
} from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { fromLocalInput, toLocalInput } from '../lib/datetime.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts.ts';
import { sourceLabel } from '../lib/labels.ts';
import { slugify } from '../lib/slugify.ts';

const route = useRoute();
const router = useRouter();

const routeSlug = computed(() =>
  typeof route.params.slug === 'string' ? route.params.slug : null,
);
const draftKey = computed(() => `editor:${routeSlug.value ?? 'new'}`);

interface Form {
  title: string;
  slug: string;
  /** Once the Admin edits the slug, it stops following the title. */
  slugEdited: boolean;
  description: string;
  sourceKind: ItemSourceKind;
  presetId: string | null;
  presetCount: number | null;
  entryMode: 'nominations' | 'seeded';
  scaleMin: number;
  scaleMax: number;
  maxNominationsPerMember: number;
  unlimitedNominations: boolean;
  resultsVisibility: 'live' | 'after-close';
  minVotes: number;
  showNominators: boolean;
  /** Role IDs as typed: separated by commas, spaces or new lines. */
  requiredRoleIds: string;
  /** `datetime-local` values, in the Admin's time zone. */
  opensAt: string;
  nominationsCloseAt: string;
  closesAt: string;
}

const form = reactive<Form>({
  title: '',
  slug: '',
  slugEdited: false,
  description: '',
  sourceKind: 'freeform',
  presetId: null,
  presetCount: null,
  entryMode: 'nominations',
  scaleMin: 1,
  scaleMax: 10,
  maxNominationsPerMember: 3,
  unlimitedNominations: false,
  resultsVisibility: 'live',
  minVotes: 5,
  showNominators: true,
  requiredRoleIds: '',
  opensAt: '',
  nominationsCloseAt: '',
  closesAt: '',
});

const existing = ref<ListDto | null>(null);

const roleTokens = computed(() =>
  form.requiredRoleIds.split(/[\s,]+/).filter((token) => token !== ''),
);
/** Anything typed that isn't a role ID, most likely a role's name. */
const notRoleIds = computed(() => roleTokens.value.filter((token) => !/^\d{5,25}$/.test(token)));
const sources = ref<readonly ItemSourceKind[]>([]);
const error = ref<ApiError | null>(null);
const status = ref('');
const busy = ref(false);
const csv = ref('');
const csvError = ref<ApiError | null>(null);

/** Once a list is scheduled, only its description and a later close may change. */
const locked = computed(() => existing.value !== null && existing.value.lifecycle !== 'draft');
const finished = computed(
  () => existing.value?.lifecycle === 'closed' || existing.value?.lifecycle === 'archived',
);

const fillFrom = (list: ListDto) => {
  Object.assign(form, {
    title: list.title,
    slug: list.slug,
    slugEdited: true,
    description: list.description,
    sourceKind: list.itemSource.kind,
    presetId: list.itemSource.kind === 'preset' ? list.itemSource.presetId : null,
    presetCount: null,
    entryMode: list.entryMode,
    scaleMin: list.scale.min,
    scaleMax: list.scale.max,
    maxNominationsPerMember: list.maxNominationsPerMember ?? 3,
    unlimitedNominations: list.maxNominationsPerMember === null,
    resultsVisibility: list.resultsVisibility,
    minVotes: list.ranking.minVotes,
    showNominators: list.showNominators,
    requiredRoleIds: list.requiredRoleIds.join(', '),
    opensAt: list.schedule === null ? '' : toLocalInput(list.schedule.opensAt),
    nominationsCloseAt:
      list.schedule?.nominationsCloseAt == null
        ? ''
        : toLocalInput(list.schedule.nominationsCloseAt),
    closesAt: list.schedule === null ? '' : toLocalInput(list.schedule.closesAt),
  } satisfies Partial<Form>);
};

const load = async () => {
  error.value = null;
  const sourcesResult = await api.get<SourcesDto>('/api/catalog/sources');
  if (sourcesResult.ok) sources.value = sourcesResult.data.sources;

  if (routeSlug.value !== null) {
    const result = await api.get<ListDetailDto>(
      `/api/lists/${encodeURIComponent(routeSlug.value)}`,
    );
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    existing.value = result.data;
    fillFrom(result.data);
  } else {
    existing.value = null;
  }

  const draft = loadDraft(draftKey.value);
  if (draft !== null && typeof draft === 'object' && !locked.value) Object.assign(form, draft);
};
onMounted(load);
watch(routeSlug, load);

watch(
  () => ({ ...form }),
  (value) => {
    saveDraft(draftKey.value, value);
  },
);

watch(
  () => form.title,
  (title) => {
    if (!form.slugEdited && !locked.value) form.slug = slugify(title);
  },
);

watch(
  () => form.sourceKind,
  (kind) => {
    if (kind !== 'preset') form.entryMode = 'nominations';
  },
);

const config = (): CreateListRequest => ({
  title: form.title,
  slug: form.slug,
  description: form.description,
  itemSource:
    form.sourceKind === 'preset'
      ? { kind: 'preset', presetId: form.presetId ?? '' }
      : { kind: form.sourceKind },
  entryMode: form.sourceKind === 'preset' ? form.entryMode : 'nominations',
  scale: { min: form.scaleMin, max: form.scaleMax },
  maxNominationsPerMember: form.unlimitedNominations ? null : form.maxNominationsPerMember,
  resultsVisibility: form.resultsVisibility,
  ranking: { strategy: 'bayesian', minVotes: form.minVotes },
  showNominators: form.showNominators,
  requiredRoleIds: roleTokens.value,
});

const run = async <T,>(
  work: () => Promise<{ ok: true; data: T } | { ok: false; error: ApiError }>,
  done: string,
) => {
  busy.value = true;
  error.value = null;
  status.value = '';
  const result = await work();
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return null;
  }
  status.value = done;
  return result.data;
};

const afterSave = async (list: ListDto) => {
  clearDraft(draftKey.value);
  existing.value = list;
  if (list.slug !== routeSlug.value) {
    await router.replace({ name: 'edit-list', params: { slug: list.slug } });
  } else {
    fillFrom(list);
  }
};

const create = async () => {
  if (notRoleIds.value.length > 0) return;
  const list = await run(() => api.post<ListDto>('/api/lists', config()), 'Draft created.');
  if (list !== null) await afterSave(list);
};

const save = async () => {
  if (notRoleIds.value.length > 0) return;
  if (existing.value === null) return;
  const body = locked.value
    ? {
        description: form.description,
        ...(fromLocalInput(form.closesAt) === existing.value.schedule?.closesAt ||
        form.closesAt === ''
          ? {}
          : { closesAt: fromLocalInput(form.closesAt) }),
      }
    : config();
  const list = await run(
    () => api.put<ListDto>(`/api/lists/${existing.value?.id ?? ''}`, body),
    'Saved.',
  );
  if (list !== null) await afterSave(list);
};

const schedule = async () => {
  if (notRoleIds.value.length > 0) return;
  if (existing.value === null) return;
  const id = existing.value.id;
  const saved = await run(() => api.put<ListDto>(`/api/lists/${id}`, config()), '');
  if (saved === null) return;
  const list = await run(
    () =>
      api.post<ListDto>(`/api/lists/${id}/schedule`, {
        opensAt: fromLocalInput(form.opensAt),
        nominationsCloseAt: fromLocalInput(form.nominationsCloseAt),
        closesAt: fromLocalInput(form.closesAt),
      }),
    'Scheduled. Members can see the list now.',
  );
  if (list !== null) await afterSave(list);
};

const archive = async () => {
  if (existing.value === null) return;
  const id = existing.value.id;
  const list = await run(() => api.post<ListDto>(`/api/lists/${id}/archive`), 'Archived.');
  if (list !== null) await afterSave(list);
};

const readCsvFile = async (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file !== undefined) csv.value = await file.text();
};

const importCsv = async () => {
  csvError.value = null;
  const result = await api.post<PresetImportedDto>('/api/catalog/presets', { csv: csv.value });
  if (!result.ok) {
    csvError.value = result.error;
    return;
  }
  form.presetId = result.data.presetId;
  form.presetCount = result.data.count;
  csv.value = '';
};
</script>

<template>
  <div class="editor">
    <header class="page-header">
      <h1>{{ existing === null ? 'New list' : `Edit “${existing.title}”` }}</h1>
      <StatusBadge v-if="existing !== null" :lifecycle="existing.lifecycle" />
    </header>

    <p v-if="locked && !finished" class="notice">
      This list is published, so its settings are fixed. You can still change the description and
      move the closing time later.
    </p>
    <p v-if="finished" class="notice">This list has closed. It can be archived, but not edited.</p>

    <form class="stack" @submit.prevent="existing === null ? create() : save()">
      <fieldset class="card stack" :disabled="finished">
        <legend>Basics</legend>
        <label for="title">Title</label>
        <input
          id="title"
          v-model="form.title"
          type="text"
          maxlength="120"
          required
          :disabled="locked"
        />

        <label for="slug">Address</label>
        <div class="input-prefix">
          <span aria-hidden="true">/lists/</span>
          <input
            id="slug"
            v-model="form.slug"
            type="text"
            maxlength="60"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            required
            aria-describedby="slug-hint"
            :disabled="locked"
            @input="form.slugEdited = true"
          />
        </div>
        <p id="slug-hint" class="meta">Lowercase letters, digits and hyphens.</p>

        <label for="description">Description</label>
        <textarea id="description" v-model="form.description" rows="3" maxlength="2000" />
      </fieldset>

      <fieldset class="card stack" :disabled="locked">
        <legend>Items</legend>
        <p class="meta">Where do the things in this list come from?</p>
        <div class="choices" role="radiogroup" aria-label="Item source">
          <label v-for="kind in sources" :key="kind" class="choice">
            <input v-model="form.sourceKind" type="radio" name="source" :value="kind" />
            {{ sourceLabel[kind] }}
          </label>
        </div>

        <template v-if="form.sourceKind === 'preset'">
          <p v-if="form.presetId !== null" class="notice">
            Using an imported CSV<template v-if="form.presetCount !== null">
              with {{ form.presetCount }} items</template
            >. Import another below to replace it.
          </p>
          <label for="csv">CSV</label>
          <textarea
            id="csv"
            v-model="csv"
            rows="6"
            aria-describedby="csv-hint"
            placeholder="title,subtitle&#10;OK Computer,Radiohead"
          />
          <p id="csv-hint" class="meta">
            First row: <code>title</code> or <code>title,subtitle</code>. Up to 200 rows.
          </p>
          <label for="csv-file">Or choose a file</label>
          <input id="csv-file" type="file" accept=".csv,text/csv" @change="readCsvFile" />
          <div class="actions">
            <button type="button" class="button" :disabled="csv.trim() === ''" @click="importCsv">
              Import CSV
            </button>
          </div>
          <ErrorNotice :error="csvError" />

          <p class="meta">How should members use these items?</p>
          <div class="choices" role="radiogroup" aria-label="Entry mode">
            <label class="choice">
              <input v-model="form.entryMode" type="radio" name="mode" value="seeded" />
              Rate them all: every item is in the list from the start
            </label>
            <label class="choice">
              <input v-model="form.entryMode" type="radio" name="mode" value="nominations" />
              Nominate from them: members pick which items go in
            </label>
          </div>
        </template>
      </fieldset>

      <fieldset class="card stack" :disabled="locked">
        <legend>Rating</legend>
        <div class="row">
          <div class="stack">
            <label for="scale-min">Lowest score</label>
            <input
              id="scale-min"
              v-model.number="form.scaleMin"
              type="number"
              min="0"
              max="99"
              required
            />
          </div>
          <div class="stack">
            <label for="scale-max">Highest score</label>
            <input
              id="scale-max"
              v-model.number="form.scaleMax"
              type="number"
              min="1"
              max="100"
              required
            />
          </div>
        </div>

        <template v-if="form.entryMode === 'nominations'">
          <label for="cap">Nominations per member</label>
          <input
            id="cap"
            v-model.number="form.maxNominationsPerMember"
            type="number"
            min="1"
            max="50"
            :required="!form.unlimitedNominations"
            :disabled="locked || form.unlimitedNominations"
          />
          <label class="choice">
            <input v-model="form.unlimitedNominations" type="checkbox" />
            Unlimited
          </label>
        </template>

        <label for="min-votes">Votes before a rank is confirmed</label>
        <input
          id="min-votes"
          v-model.number="form.minVotes"
          type="number"
          min="0"
          max="1000"
          required
          aria-describedby="min-votes-hint"
        />
        <p id="min-votes-hint" class="meta">
          Members can vote the whole time the list is open. Entries with fewer votes than this still
          appear on the leaderboard, marked provisional, so one early 10 can’t top the list.
        </p>

        <p class="meta">When can members see the results?</p>
        <div class="choices" role="radiogroup" aria-label="Results visibility">
          <label class="choice">
            <input v-model="form.resultsVisibility" type="radio" name="visibility" value="live" />
            While voting is open
          </label>
          <label class="choice">
            <input
              v-model="form.resultsVisibility"
              type="radio"
              name="visibility"
              value="after-close"
            />
            Only after the list closes
          </label>
        </div>

        <label class="choice">
          <input v-model="form.showNominators" type="checkbox" />
          Show who nominated each entry
        </label>

        <label for="roles">Only members with these Discord roles (optional)</label>
        <input
          id="roles"
          v-model="form.requiredRoleIds"
          type="text"
          autocomplete="off"
          aria-describedby="roles-hint roles-problem"
          :aria-invalid="notRoleIds.length > 0"
        />
        <p id="roles-hint" class="meta">
          Leave empty to let every member take part. Otherwise paste role IDs, separated by commas;
          anyone with at least one of them can take part.
        </p>
        <p
          v-if="notRoleIds.length > 0"
          id="roles-problem"
          class="notice notice--error"
          role="alert"
        >
          “{{ notRoleIds[0] }}” isn’t a role ID. Role IDs are long numbers, not names. In Discord,
          turn on Developer Mode (User Settings → Advanced), then open Server Settings → Roles,
          right-click the role and choose Copy Role ID.
        </p>
      </fieldset>

      <fieldset v-if="existing !== null" class="card stack" :disabled="finished">
        <legend>Schedule</legend>
        <p class="meta">Times are in your time zone.</p>
        <label for="opens">Opens</label>
        <input id="opens" v-model="form.opensAt" type="datetime-local" :disabled="locked" />
        <template v-if="form.entryMode === 'nominations'">
          <label for="nominations-close">Nominations close (optional)</label>
          <input
            id="nominations-close"
            v-model="form.nominationsCloseAt"
            type="datetime-local"
            :disabled="locked"
          />
        </template>
        <label for="closes">Closes</label>
        <input id="closes" v-model="form.closesAt" type="datetime-local" />
      </fieldset>

      <ErrorNotice :error="error" />
      <p class="visually-hidden" aria-live="polite">{{ status }}</p>
      <p v-if="status !== ''" class="notice notice--success">{{ status }}</p>

      <p v-if="existing === null" class="meta">
        You’ll set when it opens and closes after creating the draft.
      </p>
      <div class="actions">
        <button
          v-if="existing === null"
          type="submit"
          class="button button--primary"
          :disabled="busy"
        >
          Create draft
        </button>
        <template v-else-if="!finished">
          <button type="submit" class="button" :disabled="busy">
            {{ locked ? 'Save changes' : 'Save draft' }}
          </button>
          <button
            v-if="!locked"
            type="button"
            class="button button--primary"
            :disabled="busy || form.opensAt === '' || form.closesAt === ''"
            @click="schedule"
          >
            Schedule &amp; publish
          </button>
        </template>
        <button
          v-if="existing?.lifecycle === 'closed'"
          type="button"
          class="button"
          :disabled="busy"
          @click="archive"
        >
          Archive
        </button>
        <RouterLink
          v-if="existing !== null"
          :to="{ name: 'list', params: { slug: existing.slug } }"
          class="button button--link"
        >
          View list
        </RouterLink>
      </div>
    </form>
  </div>
</template>
