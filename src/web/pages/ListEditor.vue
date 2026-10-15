<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  CreateListRequest,
  ItemSourceKind,
  ListDetailDto,
  ListDto,
  PresetImportedDto,
  RefreshMovieDetailsDto,
  RoleLabelDto,
  RoleLabelsDto,
  SourcesDto,
} from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { formatDateTime, fromLocalInput, toLocalInput } from '../lib/datetime.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts.ts';
import { sourceLabel } from '../lib/labels.ts';
import { slugify } from '../lib/slugify.ts';
import { usePageTitle } from '../lib/page-title.ts';
import { site } from '../state/site.ts';

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
  scoreVisibility: 'private' | 'public';
  minVotes: number;
  showNominators: boolean;
  /** Role IDs as typed: separated by commas, spaces or new lines. */
  /** Ticked role IDs; none means every member may take part. */
  requiredRoleIds: string[];
  /** `datetime-local` values, in the Admin's time zone. */
  /** `now`: opens when published. */
  opensMode: 'now' | 'at';
  opensAt: string;
  nominationsCloseAt: string;
  /** `open-ended`: voting stays open until an Admin closes it. */
  endMode: 'open-ended' | 'at';
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
  scoreVisibility: 'private',
  minVotes: 5,
  showNominators: true,
  requiredRoleIds: [],
  opensMode: 'now',
  opensAt: '',
  nominationsCloseAt: '',
  endMode: 'open-ended',
  closesAt: '',
});

const existing = ref<ListDto | null>(null);
/** Archived movie lists: when TMDB details will be removed. */
const snapshotsExpireAt = ref<string | null>(null);

const roleLabels = ref<readonly RoleLabelDto[]>([]);
/** Named roles, plus any role a list already requires that has no name yet, so nothing is lost. */
const roleChoices = computed(() => {
  const named = new Set(roleLabels.value.map((label) => label.roleId));
  const unnamed = form.requiredRoleIds
    .filter((roleId) => !named.has(roleId))
    .map((roleId) => ({ roleId, name: `Unnamed role (${roleId})` }));
  return [...roleLabels.value, ...unnamed];
});
const sources = ref<readonly ItemSourceKind[]>([]);
const error = ref<ApiError | null>(null);
const status = ref('');
const busy = ref(false);
const csv = ref('');
const csvError = ref<ApiError | null>(null);
usePageTitle(() => (existing.value === null ? 'New list' : `Edit ${existing.value.title}`));

/** Once published, only description, a later close, and removal of a finite cap may change. */
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
    scoreVisibility: list.scoreVisibility,
    minVotes: list.ranking.minVotes,
    showNominators: list.showNominators,
    requiredRoleIds: [...list.requiredRoleIds],
    opensMode: list.schedule === null ? 'now' : 'at',
    opensAt: list.schedule === null ? '' : toLocalInput(list.schedule.opensAt),
    nominationsCloseAt:
      list.schedule?.nominationsCloseAt == null
        ? ''
        : toLocalInput(list.schedule.nominationsCloseAt),
    // A draft without a schedule starts open-ended, so it can be published with no dates.
    endMode: list.schedule?.closesAt == null ? 'open-ended' : 'at',
    closesAt: list.schedule?.closesAt == null ? '' : toLocalInput(list.schedule.closesAt),
  } satisfies Partial<Form>);
};

const load = async () => {
  error.value = null;
  const [sourcesResult, rolesResult] = await Promise.all([
    api.get<SourcesDto>('/api/catalog/sources'),
    api.get<RoleLabelsDto>('/api/roles'),
  ]);
  if (sourcesResult.ok) sources.value = sourcesResult.data.sources;
  if (rolesResult.ok) roleLabels.value = rolesResult.data.labels;

  if (routeSlug.value !== null) {
    const result = await api.get<ListDetailDto>(
      `/api/lists/${encodeURIComponent(routeSlug.value)}`,
    );
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    existing.value = result.data;
    snapshotsExpireAt.value = result.data.snapshotsExpireAt;
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
  scoreVisibility: form.scoreVisibility,
  ranking: { strategy: 'bayesian', minVotes: form.minVotes },
  showNominators: form.showNominators,
  requiredRoleIds: form.requiredRoleIds,
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
  const list = await run(() => api.post<ListDto>('/api/lists', config()), 'Draft created.');
  if (list !== null) await afterSave(list);
};

/** The end-date change to send for a published list, if any: a later date, a new date, or none. */
const endChange = (): { closesAt?: string | null } => {
  const current = existing.value?.schedule?.closesAt ?? null;
  if (form.endMode === 'open-ended') return current === null ? {} : { closesAt: null };
  const wanted = fromLocalInput(form.closesAt);
  return wanted === null || wanted === current ? {} : { closesAt: wanted };
};

/** Why "Schedule & publish" can't be used yet, or null when it can. */
const publishBlocker = computed((): string | null => {
  if (form.opensMode === 'at' && fromLocalInput(form.opensAt) === null)
    return 'Choose when it opens.';
  if (form.endMode === 'at' && fromLocalInput(form.closesAt) === null) {
    return 'Choose when voting closes, or let it stay open.';
  }
  return null;
});

const save = async () => {
  if (existing.value === null) return;
  const removeNominationCap =
    existing.value.maxNominationsPerMember !== null && form.unlimitedNominations
      ? { maxNominationsPerMember: null }
      : {};
  const body = locked.value
    ? { description: form.description, ...endChange(), ...removeNominationCap }
    : config();
  const list = await run(
    () => api.put<ListDto>(`/api/lists/${existing.value?.id ?? ''}`, body),
    'Saved.',
  );
  if (list !== null) await afterSave(list);
};

const schedule = async () => {
  if (existing.value === null) return;
  const id = existing.value.id;
  const saved = await run(() => api.put<ListDto>(`/api/lists/${id}`, config()), '');
  if (saved === null) return;
  const list = await run(
    () =>
      api.post<ListDto>(`/api/lists/${id}/schedule`, {
        opensAt: form.opensMode === 'now' ? new Date().toISOString() : fromLocalInput(form.opensAt),
        nominationsCloseAt: fromLocalInput(form.nominationsCloseAt),
        closesAt: form.endMode === 'open-ended' ? null : fromLocalInput(form.closesAt),
      }),
    form.opensMode === 'now' ? 'Published. Members can see the list now.' : 'Scheduled.',
  );
  if (list !== null) await afterSave(list);
};

const confirming = ref<'close' | 'archive' | 'private-scores' | null>(null);

const archive = async () => {
  if (existing.value === null) return;
  const id = existing.value.id;
  confirming.value = null;
  const list = await run(() => api.post<ListDto>(`/api/lists/${id}/archive`), 'Archived.');
  if (list !== null) await afterSave(list);
};

const closeVotingNow = async () => {
  if (existing.value === null) return;
  const id = existing.value.id;
  confirming.value = null;
  const list = await run(
    () => api.post<ListDto>(`/api/lists/${id}/close`),
    'Voting closed. Scores are final and the results are shown.',
  );
  if (list !== null) await afterSave(list);
};

const changeVisibility = async (visibility: 'public' | 'hidden') => {
  if (existing.value === null) return;
  const id = existing.value.id;
  const list = await run(
    () => api.put<ListDto>(`/api/lists/${id}/visibility`, { visibility }),
    visibility === 'hidden'
      ? 'Hidden: only Admins can see it now.'
      : 'Public: all members can see it.',
  );
  if (list !== null) existing.value = list;
};

const makeScoresPrivate = async () => {
  if (existing.value === null) return;
  const list = await run(
    () =>
      api.put<ListDto>(`/api/lists/${existing.value?.id ?? ''}/score-visibility`, {
        scoreVisibility: 'private',
      }),
    'Scores are private now.',
  );
  confirming.value = null;
  if (list !== null) {
    existing.value = list;
    form.scoreVisibility = 'private';
  }
};

// TVDB refreshes run in batches; this is where the next click continues.
const refreshAfter = ref<string | null>(null);

const refreshMovieDetails = async () => {
  const list = existing.value;
  if (list === null) return;
  const isTvdb = list.itemSource.kind === 'tvdb-series';
  busy.value = true;
  error.value = null;
  status.value = '';
  const after =
    isTvdb && refreshAfter.value !== null ? `?after=${encodeURIComponent(refreshAfter.value)}` : '';
  const result = await api.post<RefreshMovieDetailsDto>(
    `/api/lists/${encodeURIComponent(list.id)}/refresh-movie-details${after}`,
  );
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  const { eligible, updated, skipped, failed, remaining, next } = result.data;
  if (isTvdb) {
    refreshAfter.value = next;
    status.value =
      eligible === 0
        ? 'No active, unpurged show entries were found.'
        : `Show posters and details checked: ${String(updated)} updated, ${String(skipped)} already up to date, ${String(failed)} could not be refreshed.${remaining > 0 ? ` ${String(remaining)} still to check; run refresh again to continue.` : ''}`;
    return;
  }
  status.value =
    eligible === 0
      ? 'No active, unpurged movie entries were found.'
      : `Movie details refreshed: ${String(updated)} updated, ${String(skipped)} already had a synopsis, ${String(failed)} could not be refreshed.${remaining > 0 ? ` ${String(remaining)} still need attention; run refresh again to continue.` : ''}`;
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
      <div>
        <p class="eyebrow">List setup</p>
        <h1>{{ existing === null ? 'New list' : `Edit “${existing.title}”` }}</h1>
      </div>
      <StatusBadge
        v-if="existing !== null"
        :lifecycle="existing.lifecycle"
        :hidden="existing.visibility === 'hidden'"
      />
    </header>

    <p v-if="locked && !finished" class="notice">
      This list is published, so its settings are fixed. You can still change the description and
      when voting ends (later, or not at all).<template
        v-if="existing?.entryMode === 'nominations' && existing.maxNominationsPerMember !== null"
      >
        You can also remove its nomination cap, but you can’t add one back.</template
      >
    </p>
    <p v-if="existing?.lifecycle === 'closed'" class="notice">
      Voting has closed, so the list can’t be edited. You can still hide it or archive it below.
    </p>
    <p v-if="existing?.lifecycle === 'archived'" class="notice">
      This list is archived: read-only, with its final results. You can still hide it.
    </p>
    <p v-if="snapshotsExpireAt !== null" class="notice">
      Movie details in this archived list will be removed on
      <time :datetime="snapshotsExpireAt">{{ formatDateTime(snapshotsExpireAt) }}</time
      >, as TMDB’s terms require. Titles become “details removed”; scores and ranks stay.
    </p>

    <nav class="editor-index" aria-label="List settings">
      <a href="#editor-basics">Basics</a>
      <a href="#editor-items">Items</a>
      <a href="#editor-rating">Rating</a>
      <a href="#editor-scores">Scores</a>
      <a href="#editor-roles">Who can take part</a>
      <a v-if="form.entryMode === 'nominations'" href="#editor-nominations">Nominations</a>
      <a v-if="existing !== null" href="#editor-schedule">Schedule</a>
      <a v-if="existing !== null && existing.lifecycle !== 'draft'" href="#status-heading">
        Status
      </a>
    </nav>

    <form class="stack" @submit.prevent="existing === null ? create() : save()">
      <fieldset id="editor-basics" class="card stack" :disabled="finished">
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

      <fieldset id="editor-items" class="card stack" :disabled="locked">
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

      <fieldset id="editor-rating" class="card stack" :disabled="locked">
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
          Members can vote the whole time the list is open. Entries with fewer votes than this don’t
          get a place yet: they wait below the ranking, so a few early 10s can’t top the list.
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
            Only after voting closes
          </label>
        </div>

        <label class="choice">
          <input v-model="form.showNominators" type="checkbox" />
          Show who nominated each entry
        </label>
      </fieldset>

      <fieldset id="editor-scores" class="card stack" :disabled="locked">
        <legend>Scores</legend>
        <div class="choices" role="radiogroup" aria-label="Score visibility">
          <label class="choice">
            <input
              v-model="form.scoreVisibility"
              type="radio"
              name="score-visibility"
              value="private"
            />
            Private: each member sees only their own score
          </label>
          <label class="choice">
            <input
              v-model="form.scoreVisibility"
              type="radio"
              name="score-visibility"
              value="public"
            />
            Public: everyone can see who gave what score
          </label>
        </div>
        <p class="meta">
          Choose before publishing. Public scores appear when results do; after publishing, a public
          list can only become private.
        </p>
      </fieldset>

      <fieldset id="editor-roles" class="card stack" :disabled="locked">
        <legend>Who can take part</legend>
        <p id="roles-hint" class="meta">
          Leave every role unticked to let all members take part. Otherwise, members need at least
          one of the ticked roles.
        </p>
        <div v-if="roleChoices.length > 0" class="choices" aria-describedby="roles-hint">
          <label v-for="role in roleChoices" :key="role.roleId" class="choice">
            <input v-model="form.requiredRoleIds" type="checkbox" :value="role.roleId" />
            {{ role.name }}
          </label>
        </div>
        <p class="meta">
          Role not listed?
          <RouterLink :to="{ name: 'roles' }">Name it on the Roles page</RouterLink>, then come
          back.
        </p>
      </fieldset>

      <fieldset
        v-if="form.entryMode === 'nominations'"
        id="editor-nominations"
        class="card stack"
        :disabled="finished"
      >
        <legend>Nominations</legend>
        <template v-if="locked">
          <p v-if="existing?.maxNominationsPerMember !== null" class="meta">
            You can remove this limit to allow unlimited nominations. After saving, the limit cannot
            be restored; existing nominations stay as they are.
          </p>
          <p v-else class="meta">
            Nominations are already unlimited; a cap cannot be added after publishing.
          </p>
          <label class="choice" for="unlimited">
            <input
              id="unlimited"
              v-model="form.unlimitedNominations"
              type="checkbox"
              :disabled="existing?.maxNominationsPerMember === null"
            />
            Unlimited
          </label>
        </template>
        <template v-else>
          <label for="cap">Nominations per member</label>
          <input
            id="cap"
            v-model.number="form.maxNominationsPerMember"
            type="number"
            min="1"
            max="50"
            :required="!form.unlimitedNominations"
            :disabled="form.unlimitedNominations"
          />
          <label class="choice" for="unlimited">
            <input id="unlimited" v-model="form.unlimitedNominations" type="checkbox" />
            Unlimited
          </label>
        </template>
      </fieldset>

      <fieldset
        v-if="existing !== null"
        id="editor-schedule"
        class="card stack"
        :disabled="finished"
      >
        <legend>Schedule</legend>
        <p class="meta">Times are in your time zone.</p>

        <fieldset class="stack" :disabled="locked">
          <legend class="legend--small">Opens</legend>
          <p class="meta">From this moment members can see the list, nominate and rate.</p>
          <div class="choices">
            <label class="choice">
              <input v-model="form.opensMode" type="radio" name="opens" value="now" />
              Right away when published
            </label>
            <label class="choice">
              <input v-model="form.opensMode" type="radio" name="opens" value="at" />
              At a set time
            </label>
          </div>
          <template v-if="form.opensMode === 'at'">
            <label for="opens">Opens at</label>
            <input id="opens" v-model="form.opensAt" type="datetime-local" />
          </template>
        </fieldset>

        <template v-if="form.entryMode === 'nominations'">
          <label for="nominations-close">Nominations close (optional)</label>
          <input
            id="nominations-close"
            v-model="form.nominationsCloseAt"
            type="datetime-local"
            aria-describedby="nominations-close-hint"
            :disabled="locked"
          />
          <p id="nominations-close-hint" class="meta">
            After this, no new nominations; members can still rate.
          </p>
        </template>

        <fieldset class="stack">
          <legend class="legend--small">Voting</legend>
          <p class="meta">
            When voting closes, scores are final and the results are shown. The list stays visible;
            archive it to file it away.
          </p>
          <div class="choices">
            <label class="choice">
              <input v-model="form.endMode" type="radio" name="end" value="open-ended" />
              Stays open until an Admin closes it
            </label>
            <label class="choice">
              <input v-model="form.endMode" type="radio" name="end" value="at" />
              Closes at a set time
            </label>
          </div>
          <template v-if="form.endMode === 'at'">
            <label for="closes">Voting closes at</label>
            <input id="closes" v-model="form.closesAt" type="datetime-local" />
          </template>
        </fieldset>
      </fieldset>

      <ErrorNotice :error="error" />
      <p class="visually-hidden" aria-live="polite">{{ status }}</p>
      <p v-if="status !== ''" class="notice notice--success">{{ status }}</p>

      <p v-if="existing === null" class="meta">
        You’ll choose when it opens, and whether voting ends, after creating the draft.
      </p>
      <p v-else-if="!locked && publishBlocker !== null" class="meta">{{ publishBlocker }}</p>
      <div class="actions editor-actions">
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
            :disabled="busy || publishBlocker !== null"
            @click="schedule"
          >
            {{ form.opensMode === 'now' ? 'Publish now' : 'Schedule & publish' }}
          </button>
        </template>
        <RouterLink
          v-if="existing !== null"
          :to="{ name: 'list', params: { slug: existing.slug } }"
          class="button button--link"
        >
          View list
        </RouterLink>
      </div>
    </form>

    <section
      v-if="existing !== null && existing.lifecycle !== 'draft'"
      class="card stack status-section"
      aria-labelledby="status-heading"
    >
      <h2 id="status-heading">Status</h2>
      <div v-if="existing.scoreVisibility === 'public'" class="stack">
        <p class="meta">Scores on this list are public and may include names with scores.</p>
        <button
          type="button"
          class="button"
          :disabled="busy"
          @click="confirming = 'private-scores'"
        >
          Make scores private
        </button>
      </div>
      <div v-if="existing.itemSource.kind === 'tmdb-movie'" class="stack">
        <p class="meta">
          Fill missing TMDB synopses for active entries, along with any available credits. Entries
          with a synopsis, withdrawn entries, and details removed under TMDB retention are skipped.
        </p>
        <button
          v-if="existing.lifecycle !== 'archived'"
          type="button"
          class="button"
          :disabled="busy"
          @click="refreshMovieDetails"
        >
          Refresh missing movie details
        </button>
      </div>
      <div v-if="existing.itemSource.kind === 'tvdb-series'" class="stack">
        <p class="meta">
          Update show posters to the ones TheTVDB currently shows in search, and fill any missing
          synopses and credits. Checks up to 20 active entries per run; withdrawn entries are
          skipped.
        </p>
        <button
          v-if="existing.lifecycle !== 'archived'"
          type="button"
          class="button"
          :disabled="busy"
          @click="refreshMovieDetails"
        >
          {{
            refreshAfter === null ? 'Refresh show posters and details' : 'Continue refreshing shows'
          }}
        </button>
      </div>
      <fieldset class="stack">
        <legend class="legend--small">Who can see this list</legend>
        <div class="choices">
          <label class="choice">
            <input
              type="radio"
              name="visibility"
              value="public"
              :checked="existing.visibility === 'public'"
              :disabled="busy"
              @change="changeVisibility('public')"
            />
            Public: all members can see it
          </label>
          <label class="choice">
            <input
              type="radio"
              name="visibility"
              value="hidden"
              :checked="existing.visibility === 'hidden'"
              :disabled="busy"
              @change="changeVisibility('hidden')"
            />
            Hidden: only Admins can see it
          </label>
        </div>
        <p class="meta">Hiding keeps every nomination and score; make it public again any time.</p>
      </fieldset>
      <p v-if="site.info?.backups === true" class="meta">
        <a :href="`/api/admin/backup?list=${encodeURIComponent(existing.id)}`" download>
          Download a backup of this list
        </a>
      </p>
      <div class="actions">
        <button
          v-if="existing.lifecycle === 'open'"
          type="button"
          class="button"
          :disabled="busy"
          @click="confirming = 'close'"
        >
          Close voting now
        </button>
        <button
          v-if="existing.lifecycle !== 'archived'"
          type="button"
          class="button button--danger"
          :disabled="busy"
          @click="confirming = 'archive'"
        >
          Archive
        </button>
      </div>
    </section>

    <ConfirmDialog
      :open="confirming === 'close'"
      title="Close voting now?"
      confirm-label="Close voting"
      @confirm="closeVotingNow"
      @cancel="confirming = null"
    >
      <p>
        Members won’t be able to nominate or change their scores. Scores become final and the
        results are shown, including results that were hidden until the end.
      </p>
    </ConfirmDialog>
    <ConfirmDialog
      :open="confirming === 'private-scores'"
      title="Make scores private?"
      confirm-label="Make scores private"
      @confirm="makeScoresPrivate"
      @cancel="confirming = null"
    >
      <p>Members will no longer see who gave what score. This setting can’t be changed back.</p>
    </ConfirmDialog>
    <ConfirmDialog
      v-if="existing !== null"
      :open="confirming === 'archive'"
      :title="`Archive “${existing.title}” permanently?`"
      confirm-label="Archive permanently"
      :confirm-text="existing.slug"
      danger
      @confirm="archive"
      @cancel="confirming = null"
    >
      <p class="danger-text"><strong>This can’t be undone.</strong></p>
      <p>Archiving is permanent. As soon as you confirm:</p>
      <ul>
        <li>Voting and nominations end immediately.</li>
        <li>Every score becomes final, and the results are shown to members.</li>
        <li>The list can never be edited, reopened or un-archived.</li>
      </ul>
      <p>
        It stays visible in the Archived section (unless you hide it). If you might want it back,
        download a backup first.
      </p>
    </ConfirmDialog>
  </div>
</template>
