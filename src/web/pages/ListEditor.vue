<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type {
  CreateListRequest,
  DraftScheduleDto,
  DeleteListRequest,
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
import ListActivity from '../components/ListActivity.vue';
import AppDialog from '../components/ui/AppDialog.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { formatDateTime, fromLocalInput, toLocalInput } from '../lib/datetime.ts';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts.ts';
import { sourceExplanation, sourceLabel } from '../lib/labels.ts';
import { slugify } from '../lib/slugify.ts';
import { usePageTitle } from '../lib/page-title.ts';
import { site } from '../state/site.ts';
import { adminGuideUrl } from '../lib/navigation.ts';
import { compareListSettings } from '../lib/list-settings.ts';

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
  sourceKind: ItemSourceKind | null;
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
  sourceKind: null,
  presetId: null,
  presetCount: null,
  entryMode: 'nominations',
  scaleMin: 1,
  scaleMax: 10,
  maxNominationsPerMember: 3,
  unlimitedNominations: true,
  resultsVisibility: 'live',
  scoreVisibility: 'private',
  minVotes: 2,
  showNominators: true,
  requiredRoleIds: [],
  opensMode: 'now',
  opensAt: '',
  nominationsCloseAt: '',
  endMode: 'open-ended',
  closesAt: '',
});

const existing = ref<ListDto | null>(null);
const ready = ref(false);
const baseSettingsVersion = ref<number | undefined>();
const baseLifecycle = ref<ListDto['lifecycle'] | undefined>();
const settingsConflict = ref(false);
const latestSettings = ref<ListDetailDto | null>(null);
const conflictHeading = ref<HTMLHeadingElement | null>(null);
const sourcePermission = ref(false);
const itemSourceEditable = computed(
  () =>
    sourcePermission.value &&
    existing.value?.deleting !== true &&
    (existing.value?.lifecycle === 'draft' ||
      (existing.value?.entryMode === 'nominations' &&
        (existing.value.lifecycle === 'scheduled' || existing.value.lifecycle === 'open'))),
);
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
const deletionError = ref<ApiError | null>(null);
const deleting = computed(() => existing.value?.deleting === true);
const csv = ref('');
const csvError = ref<ApiError | null>(null);
const setupError = ref('');
const editorForm = ref<HTMLFormElement | null>(null);
const reviewing = ref(false);
const locksAccepted = ref(false);
const namedScoresAccepted = ref(false);
const draftSavedForPublish = ref(false);
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
usePageTitle(() => (existing.value === null ? 'New list' : `Edit ${existing.value.title}`));

/** Publishing locks settings except for the server-authorized source exception below. */
const locked = computed(() => existing.value !== null && existing.value.lifecycle !== 'draft');
const sourceLocked = computed(() => existing.value !== null && !itemSourceEditable.value);
const finished = computed(
  () =>
    deleting.value ||
    existing.value?.lifecycle === 'closed' ||
    existing.value?.lifecycle === 'archived',
);

let fillingForm = false;
const fillFrom = (list: ListDto) => {
  fillingForm = true;
  const dates = list.lifecycle === 'draft' ? (list.draftSchedule ?? list.schedule) : list.schedule;
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
    opensMode: dates?.opensAt == null ? 'now' : 'at',
    opensAt: dates?.opensAt == null ? '' : toLocalInput(dates.opensAt),
    nominationsCloseAt:
      dates?.nominationsCloseAt == null ? '' : toLocalInput(dates.nominationsCloseAt),
    // A draft without a schedule starts open-ended, so it can be published with no dates.
    endMode: dates?.closesAt == null ? 'open-ended' : 'at',
    closesAt: dates?.closesAt == null ? '' : toLocalInput(dates.closesAt),
  } satisfies Partial<Form>);
  fillingForm = false;
};

const load = async () => {
  ready.value = false;
  error.value = null;
  let loaded: ListDetailDto | null = null;
  const [sourcesResult, rolesResult] = await Promise.all([
    api.get<SourcesDto>('/api/catalog/sources'),
    api.get<RoleLabelsDto>('/api/roles'),
  ]);
  if (!sourcesResult.ok) {
    error.value = sourcesResult.error;
    return;
  }
  sources.value = sourcesResult.data.sources;
  if (!rolesResult.ok) {
    error.value = rolesResult.error;
    return;
  }
  roleLabels.value = rolesResult.data.labels;

  if (routeSlug.value !== null) {
    const result = await api.get<ListDetailDto>(
      `/api/lists/${encodeURIComponent(routeSlug.value)}`,
    );
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    existing.value = result.data;
    loaded = result.data;
    baseSettingsVersion.value = result.data.settingsVersion;
    baseLifecycle.value = result.data.lifecycle;
    settingsConflict.value = false;
    latestSettings.value = null;
    sourcePermission.value = result.data.itemSourceEditable;
    snapshotsExpireAt.value = result.data.snapshotsExpireAt;
    fillFrom(result.data);
  } else {
    existing.value = null;
    sourcePermission.value = false;
  }

  const cached = loadDraft(draftKey.value);
  const envelope =
    cached !== null && typeof cached === 'object' && 'form' in cached ? cached : null;
  const draft = envelope === null ? cached : envelope.form;
  const savedLifecycle = envelope !== null && 'lifecycle' in envelope ? envelope.lifecycle : null;
  if (
    savedLifecycle === 'draft' ||
    savedLifecycle === 'scheduled' ||
    savedLifecycle === 'open' ||
    savedLifecycle === 'closed' ||
    savedLifecycle === 'archived'
  ) {
    baseLifecycle.value = savedLifecycle;
  }
  fillingForm = true;
  if (draft !== null && typeof draft === 'object' && (!locked.value || savedLifecycle === 'draft'))
    Object.assign(form, draft);
  if (draft !== null && typeof draft === 'object' && locked.value) {
    for (const field of ['description', 'endMode', 'closesAt', 'unlimitedNominations'] as const) {
      const value: unknown = Reflect.get(draft, field);
      if (typeof value === typeof form[field]) {
        Object.assign(form, { [field]: value });
      }
    }
  }
  if (
    draft !== null &&
    typeof draft === 'object' &&
    locked.value &&
    itemSourceEditable.value &&
    'sourceKind' in draft
  ) {
    const savedKind = sources.value.find((kind) => kind === draft.sourceKind);
    if (savedKind !== undefined) form.sourceKind = savedKind;
    if ('presetId' in draft && (draft.presetId === null || typeof draft.presetId === 'string')) {
      form.presetId = draft.presetId;
    }
  }
  fillingForm = false;
  if (draft !== null && typeof draft === 'object' && existing.value !== null) {
    const cachedVersion =
      envelope !== null &&
      'settingsVersion' in envelope &&
      typeof envelope.settingsVersion === 'number'
        ? envelope.settingsVersion
        : undefined;
    baseSettingsVersion.value = cachedVersion;
    if (cachedVersion === undefined || cachedVersion !== existing.value.settingsVersion) {
      settingsConflict.value = true;
      latestSettings.value = loaded;
    }
  }
  ready.value = true;
};
onMounted(load);
watch(routeSlug, load);

const cacheForm = (value: Form = { ...form }) => {
  saveDraft(draftKey.value, {
    form: value,
    settingsVersion: baseSettingsVersion.value,
    lifecycle: baseLifecycle.value,
  });
};
watch(
  () => ({ ...form }),
  (value) => {
    if (!fillingForm) cacheForm(value);
  },
  { flush: 'sync' },
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

const config = (sourceKind: ItemSourceKind): CreateListRequest => ({
  title: form.title,
  slug: form.slug,
  description: form.description,
  itemSource:
    sourceKind === 'preset'
      ? { kind: 'preset', presetId: form.presetId ?? '' }
      : { kind: sourceKind },
  entryMode: sourceKind === 'preset' ? form.entryMode : 'nominations',
  scale: { min: form.scaleMin, max: form.scaleMax },
  maxNominationsPerMember: form.unlimitedNominations ? null : form.maxNominationsPerMember,
  resultsVisibility: form.resultsVisibility,
  scoreVisibility: form.scoreVisibility,
  ranking: { strategy: 'bayesian', minVotes: form.minVotes },
  showNominators: form.showNominators,
  requiredRoleIds: form.requiredRoleIds,
});

const setupProblem = (): string | null => {
  if (form.sourceKind === null) return 'Choose an item type before saving or publishing.';
  if (
    !sources.value.includes(form.sourceKind) &&
    form.sourceKind !== existing.value?.itemSource.kind
  )
    return 'Choose an item type offered by this site.';
  if (form.sourceKind === 'preset' && form.presetId === null)
    return 'Import your collection before saving or publishing.';
  if (form.title.trim().length === 0 || form.title.trim().length > 120)
    return 'Enter a title of 1-120 characters.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) || form.slug.length > 60)
    return 'Use lowercase letters, digits and single hyphens in the address, up to 60 characters.';
  if (form.description.length > 2000) return 'Keep the description to 2000 characters.';
  if (
    !Number.isInteger(form.scaleMin) ||
    !Number.isInteger(form.scaleMax) ||
    form.scaleMin < 0 ||
    form.scaleMax > 100 ||
    form.scaleMin >= form.scaleMax
  )
    return 'Choose whole-number scores from 0 to 100, with the lowest below the highest.';
  if (!Number.isInteger(form.minVotes) || form.minVotes < 0 || form.minVotes > 1000)
    return 'Votes before a confirmed rank must be a whole number from 0 to 1000.';
  if (
    form.entryMode === 'nominations' &&
    !form.unlimitedNominations &&
    (!Number.isInteger(form.maxNominationsPerMember) ||
      form.maxNominationsPerMember < 1 ||
      form.maxNominationsPerMember > 50)
  )
    return 'Choose 1-50 nominations per member, or unlimited.';
  if (form.requiredRoleIds.length > 25) return 'Choose no more than 25 participation roles.';
  return null;
};

const validatedConfig = (): CreateListRequest | null => {
  setupError.value = setupProblem() ?? '';
  if (setupError.value !== '' || form.sourceKind === null) return null;
  if (editorForm.value?.reportValidity() === false) {
    setupError.value = 'Check the highlighted fields before continuing.';
    return null;
  }
  return config(form.sourceKind);
};

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
    noteSettingsConflict(result.error);
    return null;
  }
  status.value = done;
  return result.data;
};

const afterSave = async (list: ListDto) => {
  clearDraft(draftKey.value);
  existing.value = list;
  baseSettingsVersion.value = list.settingsVersion;
  baseLifecycle.value = list.lifecycle;
  settingsConflict.value = false;
  latestSettings.value = null;
  if (list.slug !== routeSlug.value) {
    await router.replace({ name: 'edit-list', params: { slug: list.slug } });
  } else {
    fillFrom(list);
  }
};

const create = async () => {
  if (busy.value) return;
  const input = validatedConfig();
  if (input === null) return;
  const list = await run(() => api.post<ListDto>('/api/lists', input), 'Draft created.');
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
const scheduleProblem = (publishing = true): string | null => {
  const now = Date.now();
  const opens = form.opensMode === 'now' ? now : Date.parse(fromLocalInput(form.opensAt) ?? '');
  const nominations = fromLocalInput(form.nominationsCloseAt);
  const closes = form.endMode === 'at' ? fromLocalInput(form.closesAt) : null;
  if (!Number.isFinite(opens)) return 'Choose when it opens.';
  if (form.endMode === 'at' && closes === null) {
    return 'Choose when voting closes, or let it stay open.';
  }
  if (form.entryMode === 'nominations' && form.nominationsCloseAt !== '' && nominations === null)
    return 'Enter a valid nomination deadline.';
  if (publishing && closes !== null && Date.parse(closes) <= now)
    return 'Voting must close in the future.';
  if ((publishing || form.opensMode === 'at') && closes !== null && Date.parse(closes) <= opens)
    return 'Voting must close after participation opens.';
  if (form.entryMode === 'nominations' && nominations !== null) {
    if ((publishing || form.opensMode === 'at') && Date.parse(nominations) <= opens)
      return 'Nominations must close after participation opens.';
    if (closes !== null && Date.parse(nominations) > Date.parse(closes))
      return 'Nominations must close no later than voting.';
  }
  return null;
};
const publishBlocker = computed(() => scheduleProblem());
const draftSchedule = (): DraftScheduleDto => ({
  opensAt: form.opensMode === 'now' ? null : fromLocalInput(form.opensAt),
  nominationsCloseAt:
    form.entryMode === 'nominations' ? fromLocalInput(form.nominationsCloseAt) : null,
  closesAt: form.endMode === 'open-ended' ? null : fromLocalInput(form.closesAt),
});
const reviewDate = (value: string) => {
  const iso = fromLocalInput(value);
  return iso === null ? 'Not set' : formatDateTime(iso);
};
const participationSummary = computed(() =>
  form.requiredRoleIds.length === 0
    ? 'All community members'
    : `Members with any of: ${roleChoices.value
        .filter((role) => form.requiredRoleIds.includes(role.roleId))
        .map((role) => role.name)
        .join(', ')}`,
);

const expectation = () =>
  baseSettingsVersion.value === undefined
    ? {}
    : { expectedSettingsVersion: baseSettingsVersion.value };
const noteSettingsConflict = (failure: ApiError) => {
  if (failure.code !== 'lists.settings-changed') return;
  settingsConflict.value = true;
  latestSettings.value = null;
  reviewing.value = false;
  confirming.value = null;
  void nextTick(() => conflictHeading.value?.focus());
};
const compareLatest = async () => {
  if (existing.value === null || busy.value) return;
  busy.value = true;
  const result = await api.get<ListDetailDto>(
    `/api/lists/${encodeURIComponent(existing.value.id)}`,
  );
  busy.value = false;
  if (!result.ok) {
    error.value = result.error;
    return;
  }
  latestSettings.value = result.data;
  error.value = null;
};
const comparison = computed(() => {
  if (latestSettings.value === null || existing.value === null || form.sourceKind === null)
    return [];
  const mine: ListDto = {
    ...existing.value,
    lifecycle: baseLifecycle.value ?? existing.value.lifecycle,
    ...config(form.sourceKind),
    ...(baseLifecycle.value === 'draft'
      ? { draftSchedule: draftSchedule() }
      : {
          schedule:
            existing.value.schedule === null
              ? null
              : { ...existing.value.schedule, ...endChange() },
        }),
  };
  return compareListSettings(latestSettings.value, mine, roleLabels.value);
});
const resolveSettingsConflict = (keepInput: boolean) => {
  const latest = latestSettings.value;
  if (latest === null) return;
  existing.value = latest;
  baseSettingsVersion.value = latest.settingsVersion;
  baseLifecycle.value = latest.lifecycle;
  sourcePermission.value = latest.itemSourceEditable;
  snapshotsExpireAt.value = latest.snapshotsExpireAt;
  if (!keepInput) fillFrom(latest);
  else if (latest.lifecycle !== 'draft') {
    const editable = {
      description: form.description,
      endMode: form.endMode,
      closesAt: form.closesAt,
      unlimitedNominations: form.unlimitedNominations,
      ...(latest.itemSourceEditable
        ? { sourceKind: form.sourceKind, presetId: form.presetId, presetCount: form.presetCount }
        : {}),
    };
    fillFrom(latest);
    Object.assign(form, editable);
  }
  settingsConflict.value = false;
  latestSettings.value = null;
  error.value = null;
  locksAccepted.value = false;
  namedScoresAccepted.value = false;
  cacheForm();
  status.value = keepInput
    ? 'Your edits are kept. Review them, then save or review publication again. Nothing has been saved yet.'
    : 'Latest saved settings loaded. Your previous unsaved input has been replaced.';
};

const reviewPublish = () => {
  if (busy.value || settingsConflict.value || validatedConfig() === null) return;
  setupError.value = scheduleProblem() ?? '';
  if (setupError.value !== '') return;
  locksAccepted.value = false;
  namedScoresAccepted.value = false;
  draftSavedForPublish.value = false;
  error.value = null;
  reviewing.value = true;
};

const save = async () => {
  if (existing.value === null || busy.value || settingsConflict.value) return;
  if (
    locked.value &&
    existing.value.maxNominationsPerMember !== null &&
    form.unlimitedNominations &&
    confirming.value !== 'remove-cap'
  ) {
    confirming.value = 'remove-cap';
    return;
  }
  const input = validatedConfig();
  if (input === null) return;
  if (!locked.value) {
    setupError.value = scheduleProblem(false) ?? '';
    if (setupError.value !== '') return;
  }
  const removeNominationCap =
    existing.value.maxNominationsPerMember !== null && form.unlimitedNominations
      ? { maxNominationsPerMember: null }
      : {};
  const body = locked.value
    ? {
        description: form.description,
        ...endChange(),
        ...removeNominationCap,
        ...(itemSourceEditable.value ? { itemSource: input.itemSource } : {}),
      }
    : { ...input, draftSchedule: draftSchedule() };
  const list = await run(
    () => api.put<ListDto>(`/api/lists/${existing.value?.id ?? ''}`, { ...body, ...expectation() }),
    'Saved.',
  );
  if (list !== null) {
    confirming.value = null;
    await afterSave(list);
  }
};

const schedule = async () => {
  if (
    existing.value === null ||
    busy.value ||
    settingsConflict.value ||
    !reviewing.value ||
    !locksAccepted.value ||
    (form.scoreVisibility === 'public' && !namedScoresAccepted.value)
  )
    return;
  const input = validatedConfig();
  if (input === null) return;
  setupError.value = scheduleProblem() ?? '';
  if (setupError.value !== '') return;
  const id = existing.value.id;
  busy.value = true;
  error.value = null;
  status.value = '';
  draftSavedForPublish.value = false;
  try {
    const saved = await api.put<ListDto>(`/api/lists/${id}`, {
      ...input,
      draftSchedule: draftSchedule(),
      ...expectation(),
    });
    if (!saved.ok) {
      error.value = saved.error;
      noteSettingsConflict(saved.error);
      return;
    }
    draftSavedForPublish.value = true;
    baseSettingsVersion.value = saved.data.settingsVersion;
    cacheForm();
    const result = await api.post<ListDto>(`/api/lists/${id}/schedule`, {
      ...expectation(),
      opensAt: form.opensMode === 'now' ? new Date().toISOString() : fromLocalInput(form.opensAt),
      nominationsCloseAt:
        form.entryMode === 'nominations' ? fromLocalInput(form.nominationsCloseAt) : null,
      closesAt: form.endMode === 'open-ended' ? null : fromLocalInput(form.closesAt),
    });
    if (!result.ok) {
      error.value = result.error;
      noteSettingsConflict(result.error);
      return;
    }
    reviewing.value = false;
    status.value =
      form.opensMode === 'now'
        ? 'Published. Members can take part now.'
        : 'Published with a scheduled opening.';
    await afterSave(result.data);
  } finally {
    busy.value = false;
  }
};

const confirming = ref<'close' | 'archive' | 'private-scores' | 'delete' | 'remove-cap' | null>(
  null,
);

const deleteList = async () => {
  const list = existing.value;
  if (list === null || busy.value) return;
  busy.value = true;
  deletionError.value = null;
  const body: DeleteListRequest = { confirmation: list.slug };
  const result = await api.delete<undefined>(`/api/lists/${encodeURIComponent(list.id)}`, body);
  busy.value = false;
  if (!result.ok) {
    deletionError.value = result.error;
    // A lost response may follow a persisted deletion intent. Never offer normal edits here.
    existing.value = { ...list, deleting: true };
    return;
  }
  clearDraft(draftKey.value);
  confirming.value = null;
  await router.replace({ name: 'lists', query: { deleted: '1' } });
};

const archive = async () => {
  if (existing.value === null || busy.value || settingsConflict.value) return;
  const id = existing.value.id;
  confirming.value = null;
  const list = await run(
    () => api.post<ListDto>(`/api/lists/${id}/archive`, expectation()),
    'Archived.',
  );
  if (list !== null) await afterSave(list);
};

const closeVotingNow = async () => {
  if (existing.value === null || busy.value || settingsConflict.value) return;
  const id = existing.value.id;
  confirming.value = null;
  const list = await run(
    () => api.post<ListDto>(`/api/lists/${id}/close`, expectation()),
    'Voting closed. Scores are final and the results are shown.',
  );
  if (list !== null) await afterSave(list);
};

const changeVisibility = async (visibility: 'public' | 'hidden') => {
  if (existing.value === null || busy.value || settingsConflict.value) return;
  const id = existing.value.id;
  const list = await run(
    () => api.put<ListDto>(`/api/lists/${id}/visibility`, { visibility, ...expectation() }),
    visibility === 'hidden'
      ? 'Hidden: only Admins can see it now.'
      : 'Public: all members can see it.',
  );
  if (list !== null) {
    existing.value = list;
    baseSettingsVersion.value = list.settingsVersion;
    cacheForm();
  }
};

const makeScoresPrivate = async () => {
  if (existing.value === null || busy.value || settingsConflict.value) return;
  const list = await run(
    () =>
      api.put<ListDto>(`/api/lists/${existing.value?.id ?? ''}/score-visibility`, {
        scoreVisibility: 'private',
        ...expectation(),
      }),
    'Scores are private now.',
  );
  confirming.value = null;
  if (list !== null) {
    existing.value = list;
    baseSettingsVersion.value = list.settingsVersion;
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
        <p class="eyebrow">Admin · List setup</p>
        <h1>{{ existing === null ? 'New list' : `Edit “${existing.title}”` }}</h1>
      </div>
      <StatusBadge
        v-if="existing !== null"
        :lifecycle="existing.lifecycle"
        :hidden="existing.visibility === 'hidden'"
      />
    </header>

    <p v-if="!ready && error === null" role="status">Loading list settings…</p>
    <ErrorNotice v-if="!ready" :error="error" />
    <p class="meta">
      Save a draft, review the member experience, then publish.
      <a :href="adminGuideUrl">Admin guide and FAQ</a>
    </p>
    <p v-if="existing?.createdBy != null" class="meta">
      Created or imported by {{ existing.createdBy }}
    </p>
    <section
      v-if="settingsConflict"
      class="card stack settings-conflict"
      aria-labelledby="settings-conflict-heading"
    >
      <h2 id="settings-conflict-heading" ref="conflictHeading" tabindex="-1">
        Compare before continuing
      </h2>
      <p role="alert">
        This list may have changed since you started editing. Your input is still in the form; it
        has not overwritten the saved settings. Compare the latest version before continuing.
      </p>
      <button type="button" :disabled="busy" @click="compareLatest">Compare latest settings</button>
      <template v-if="latestSettings !== null">
        <p>
          Differences between the latest saved settings and your form (times in {{ timeZone }}):
        </p>
        <div v-for="row in comparison" :key="row.label" class="stack">
          <h3>{{ row.label }}</h3>
          <dl class="review-summary">
            <dt>Latest saved</dt>
            <dd>{{ row.latest }}</dd>
            <dt>Your form</dt>
            <dd>{{ row.yours }}</dd>
          </dl>
        </div>
        <p v-if="comparison.length === 0">
          The settings shown in your form match the latest saved settings.
        </p>
        <p v-if="latestSettings.lifecycle !== baseLifecycle">
          The list’s status has changed. Load the latest settings to see what can still be edited.
        </p>
        <div class="actions">
          <button type="button" :disabled="busy" @click="resolveSettingsConflict(false)">
            Replace my input with latest settings
          </button>
          <button
            type="button"
            :disabled="busy || latestSettings.lifecycle !== baseLifecycle"
            @click="resolveSettingsConflict(true)"
          >
            Keep my input after comparison
          </button>
        </div>
        <p class="meta">
          Keeping your input does not save or publish it. Save again only after reviewing these
          differences.
        </p>
      </template>
    </section>
    <p v-if="!locked" class="notice">
      Publishing fixes most settings immediately, even if participation opens later. You will review
      the choices before publishing.
    </p>
    <p v-if="deleting" class="notice" role="status">
      Deletion in progress. Members can no longer access this list. Normal edits and participation
      are blocked; retry deletion below to finish cleanup and release its address.
    </p>
    <p v-if="locked && !finished" class="notice">
      This list is published, so its settings are fixed. You can still change the description and
      when voting ends (later, or not at all).<template
        v-if="existing?.entryMode === 'nominations' && existing.maxNominationsPerMember !== null"
      >
        You can also remove its nomination cap, but you can’t add one back.</template
      >
      <template v-if="itemSourceEditable">
        You can also change the item source until the first entry is added.
      </template>
    </p>
    <p v-if="existing?.lifecycle === 'closed' && !deleting" class="notice">
      Voting has closed, so the list can’t be edited. You can still hide it or archive it below.
    </p>
    <p v-if="existing?.lifecycle === 'archived' && !deleting" class="notice">
      This list is archived: read-only, with its final results. You can still hide it.
    </p>
    <p v-if="snapshotsExpireAt !== null" class="notice">
      Movie details in this archived list will be removed on
      <time :datetime="snapshotsExpireAt">{{ formatDateTime(snapshotsExpireAt) }}</time
      >, as TMDB’s terms require. Titles become “details removed”; scores and ranks stay.
    </p>

    <nav v-if="ready && !deleting" class="editor-index" aria-label="List settings">
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

    <form
      v-if="ready && !deleting"
      ref="editorForm"
      class="stack"
      @submit.prevent="existing === null ? create() : save()"
    >
      <fieldset id="editor-basics" class="card stack" :disabled="finished">
        <legend>Basics</legend>
        <p class="meta"><span class="pill">Fixed when published</span> Title and address.</p>
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
        <p class="meta"><span class="pill">Editable until voting closes</span> Description only.</p>
        <textarea id="description" v-model="form.description" rows="3" maxlength="2000" />
      </fieldset>

      <fieldset id="editor-items" class="card stack" :disabled="sourceLocked">
        <legend>Items</legend>
        <p class="meta">Where do the things in this list come from?</p>
        <p class="meta">
          <span class="pill">{{ sourceLocked ? 'Locked' : 'Editable while unused' }}</span>
          Item type locks when the first entry is added, even if later withdrawn. A collection
          included in full locks when published. Finished lists cannot change item type.
        </p>
        <p v-if="locked && itemSourceEditable" class="meta">
          This list is unused. You can change its item source until the first entry is added.
          Published lists keep their nomination mode.
        </p>
        <p v-else-if="sourceLocked && !finished" class="meta">
          The source is locked once entries have been added, including withdrawn entries. Published
          seeded lists also keep their source. An unfinished entry write temporarily locks the
          source.
        </p>
        <div class="source-choices" role="radiogroup" aria-label="Item source">
          <label v-for="kind in sources" :key="kind" class="choice source-choice">
            <input v-model="form.sourceKind" type="radio" name="source" :value="kind" />
            <span>
              <strong>{{ sourceLabel[kind] }}</strong>
              <span class="source-explanation">{{ sourceExplanation[kind] }}</span>
            </span>
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
          <p class="meta">
            <span class="pill">Fixed when published</span> How items enter the list.
          </p>
          <div class="choices" role="radiogroup" aria-label="Entry mode">
            <label class="choice">
              <input
                v-model="form.entryMode"
                type="radio"
                name="mode"
                value="seeded"
                :disabled="locked"
              />
              Rate them all: every item is in the list from the start
            </label>
            <label class="choice">
              <input
                v-model="form.entryMode"
                type="radio"
                name="mode"
                value="nominations"
                :disabled="locked"
              />
              Nominate from them: members pick which items go in
            </label>
          </div>
        </template>
      </fieldset>

      <fieldset id="editor-rating" class="card stack" :disabled="locked">
        <legend>Rating</legend>
        <p class="meta">
          <span class="pill">Fixed when published</span>
          Score range, votes needed for a rank, standings timing and nomination names.
        </p>
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
        <p class="meta">
          Hiding nomination names does not hide individual scores. These are separate choices.
        </p>
      </fieldset>

      <fieldset id="editor-scores" class="card stack" :disabled="locked">
        <legend>Scores</legend>
        <p class="meta">
          <span class="pill">One-way change after publishing</span>
          Named scores can become private, but private scores can never become named.
        </p>
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
            Named: community members can see who gave what score
          </label>
        </div>
        <p class="meta">
          Private scores still count toward standings. Named scores appear only when standings are
          visible. Admins cannot inspect other members' private scores.
        </p>
      </fieldset>

      <fieldset id="editor-roles" class="card stack" :disabled="locked">
        <legend>Who can take part</legend>
        <p class="meta"><span class="pill">Fixed when published</span> Participation roles.</p>
        <p id="roles-hint" class="meta">
          Leave every role unticked to let all members take part. Otherwise, members need at least
          one of the ticked roles.
        </p>
        <p class="meta">
          Roles restrict nominating and rating, not viewing. Other signed-in community members can
          still see a published list unless it is hidden.
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
        <p class="meta">
          <span class="pill">Remove-only after publishing</span>
          A limit can become unlimited, but cannot be lowered, increased to another finite limit,
          added or restored.
        </p>
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
        <p class="meta">Times are shown in {{ timeZone }}.</p>
        <p v-if="!locked" class="notice">
          Save draft shares these planned dates with other admins without publishing or opening
          participation. Dates stay editable in draft and are checked again before publishing.
        </p>

        <fieldset class="stack" :disabled="locked">
          <legend class="legend--small">Opens</legend>
          <p class="meta"><span class="pill">Fixed when published</span> Participation opening.</p>
          <p class="meta">
            From this moment eligible members can nominate and rate. A published list is visible to
            signed-in members before opening, unless hidden.
          </p>
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
          <p class="meta"><span class="pill">Fixed when published</span> Nomination deadline.</p>
          <input
            id="nominations-close"
            v-model="form.nominationsCloseAt"
            type="datetime-local"
            aria-describedby="nominations-close-hint"
            :disabled="locked"
          />
          <p id="nominations-close-hint" class="meta">
            After this, no new nominations; members can still rate. Leave blank to accept
            nominations until voting closes.
          </p>
        </template>

        <fieldset class="stack">
          <legend class="legend--small">Voting</legend>
          <p class="meta">
            <span class="pill">Extend-only while active</span>
            Move a deadline later, remove it, or give open-ended voting a future deadline. To end
            voting immediately, use Close voting now. Closed voting cannot be reopened.
          </p>
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
      <p v-if="setupError !== ''" class="notice notice--error" role="alert">{{ setupError }}</p>
      <p class="visually-hidden" aria-live="polite">{{ status }}</p>
      <p v-if="status !== ''" class="notice notice--success">{{ status }}</p>

      <section
        v-if="existing === null"
        class="notice editor-next-step"
        aria-labelledby="next-step-heading"
      >
        <h2 id="next-step-heading">Next step: choose dates and publish</h2>
        <p>You’ll choose when it opens, and whether voting ends, after creating the draft.</p>
      </section>
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
          <button type="submit" class="button" :disabled="busy || settingsConflict">
            {{ locked ? 'Save changes' : 'Save draft' }}
          </button>
          <button
            v-if="!locked"
            type="button"
            class="button button--primary"
            :disabled="busy || settingsConflict || publishBlocker !== null"
            data-review-publish
            @click="reviewPublish"
          >
            Review &amp; publish
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
      v-if="ready && existing !== null && existing.lifecycle !== 'draft' && !deleting"
      class="card stack status-section"
      aria-labelledby="status-heading"
    >
      <h2 id="status-heading">Admin controls</h2>
      <div v-if="existing.scoreVisibility === 'public'" class="stack">
        <p class="meta">Scores on this list are public and may include names with scores.</p>
        <button
          type="button"
          class="button"
          :disabled="busy || settingsConflict"
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
      <fieldset class="stack" :disabled="busy || settingsConflict">
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
            Community members: sign-in required
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
        <p class="meta">
          <span class="pill">Editable any time</span>
          Hiding keeps every nomination and score; show it again any time. Hiding does not pause the
          schedule. Shared-link previews may show a non-hidden published list's title.
        </p>
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
          :disabled="busy || settingsConflict"
          @click="confirming = 'close'"
        >
          Close voting now
        </button>
        <button
          v-if="existing.lifecycle !== 'archived'"
          type="button"
          class="button button--danger"
          :disabled="busy || settingsConflict"
          @click="confirming = 'archive'"
        >
          Archive
        </button>
      </div>
    </section>

    <AppDialog
      :open="reviewing"
      title="Review before publishing"
      @close="!busy && (reviewing = false)"
    >
      <div class="stack">
        <h3>{{ form.title }}</h3>
        <p><strong>Member address:</strong> /lists/{{ form.slug }}</p>
        <h3>What members will experience</h3>
        <ul>
          <li>
            Item type: {{ form.sourceKind === null ? 'Not chosen' : sourceLabel[form.sourceKind] }}.
          </li>
          <li>{{ form.sourceKind === null ? '' : sourceExplanation[form.sourceKind] }}</li>
          <li v-if="form.entryMode === 'seeded'">
            Every item in the imported collection is included. Members do not nominate.
          </li>
          <li v-else>
            Nominations per member:
            {{ form.unlimitedNominations ? 'unlimited' : form.maxNominationsPerMember }}.
          </li>
          <li>
            Scores: {{ form.scaleMin }} to {{ form.scaleMax }}; {{ form.minVotes }} votes needed for
            a confirmed rank.
          </li>
          <li>
            Standings:
            {{
              form.resultsVisibility === 'live'
                ? 'visible during voting'
                : 'hidden until voting ends'
            }}.
          </li>
          <li>
            Individual scores:
            {{
              form.scoreVisibility === 'private'
                ? 'private'
                : 'named, visible to community members when standings are visible'
            }}.
          </li>
          <li v-if="form.entryMode === 'nominations'">
            Nominator names: {{ form.showNominators ? 'shown' : 'hidden' }}.
          </li>
          <li>Who can take part: {{ participationSummary }}.</li>
        </ul>
        <h3>Timing · {{ timeZone }}</h3>
        <ul>
          <li>
            Participation opens:
            {{ form.opensMode === 'now' ? 'immediately on publishing' : reviewDate(form.opensAt) }}.
          </li>
          <li v-if="form.entryMode === 'nominations'">
            Nominations close:
            {{
              form.nominationsCloseAt === ''
                ? 'when voting closes'
                : reviewDate(form.nominationsCloseAt)
            }}.
          </li>
          <li>
            Voting closes:
            {{
              form.endMode === 'open-ended'
                ? 'No automatic end; an admin must close voting'
                : reviewDate(form.closesAt)
            }}.
          </li>
        </ul>
        <p>
          {{
            existing?.visibility === 'hidden'
              ? 'Only admins can see this hidden list.'
              : 'Signed-in community members can see this list as soon as it is published, even before participation opens.'
          }}
        </p>
        <p v-if="form.resultsVisibility === 'after-close'" class="notice">
          Standings stay hidden from everyone, including admins, until voting ends.
          <template v-if="form.endMode === 'open-ended'"
            >An admin must close voting to reveal them.</template
          >
        </p>
        <section class="notice stack" aria-labelledby="publish-lock-heading">
          <h3 id="publish-lock-heading">What becomes fixed</h3>
          <p>
            Publishing locks the title, address, nomination mode, rating rules, standings timing,
            nominator-name setting, participation roles, opening time and nomination deadline
            immediately, not when voting starts.
          </p>
          <p>
            Item type locks once an entry has been added, including withdrawn entries. Including a
            whole imported collection locks its source when publishing. While active, the
            description remains editable, voting can be extended and a nomination limit can only be
            removed. List visibility can change any time.
          </p>
          <label class="choice" for="publish-locks">
            <input id="publish-locks" v-model="locksAccepted" type="checkbox" :disabled="busy" />
            I have reviewed the settings that become fixed.
          </label>
        </section>
        <label v-if="form.scoreVisibility === 'public'" class="choice" for="publish-named-scores">
          <input
            id="publish-named-scores"
            v-model="namedScoresAccepted"
            type="checkbox"
            :disabled="busy"
          />
          I understand members will see names with individual scores when standings are visible.
          Making scores private later cannot undo what people have already seen.
        </label>
        <p v-if="draftSavedForPublish && error !== null" class="notice">
          Draft settings and planned dates saved, but publishing was not confirmed. If another admin
          published this list, reload to check its current state before continuing.
        </p>
        <ErrorNotice :error="error" />
        <p v-if="setupError !== ''" class="notice notice--error" role="alert">{{ setupError }}</p>
      </div>
      <template #actions>
        <button type="button" class="button" autofocus :disabled="busy" @click="reviewing = false">
          Back to settings
        </button>
        <button
          type="button"
          class="button button--primary"
          data-confirm-publish
          :disabled="
            busy || !locksAccepted || (form.scoreVisibility === 'public' && !namedScoresAccepted)
          "
          @click="schedule"
        >
          {{
            busy
              ? 'Publishing...'
              : form.opensMode === 'now'
                ? 'Publish and open voting'
                : 'Publish with scheduled opening'
          }}
        </button>
      </template>
    </AppDialog>

    <ConfirmDialog
      :open="confirming === 'remove-cap'"
      title="Allow unlimited nominations?"
      confirm-label="Save with unlimited nominations"
      :busy="busy"
      @confirm="save"
      @cancel="!busy && (confirming = null)"
    >
      <p>
        This saves your other edits too. After publishing, a removed nomination limit cannot be
        restored.
      </p>
      <ErrorNotice :error="error" />
      <p v-if="setupError !== ''" class="notice notice--error" role="alert">{{ setupError }}</p>
    </ConfirmDialog>

    <ListActivity
      v-if="ready && existing !== null && !deleting"
      :list-id="existing.id"
      :settings-version="existing.settingsVersion"
    />

    <section v-if="ready && existing !== null" class="card stack" aria-labelledby="danger-heading">
      <h2 id="danger-heading" class="danger-text">Danger zone</h2>
      <p>
        Permanently delete this list and all its entries and scores. Unlike archiving, deletion
        removes the data and makes this address available again.
      </p>
      <p v-if="!deleting && site.info?.backups === true">
        <a :href="`/api/admin/backup?list=${encodeURIComponent(existing.id)}`" download>
          Download a backup before deleting
        </a>
      </p>
      <div class="actions">
        <button
          type="button"
          class="button button--danger"
          :disabled="busy"
          @click="
            deletionError = null;
            confirming = 'delete';
          "
        >
          {{ deleting ? 'Retry deletion…' : 'Delete list…' }}
        </button>
      </div>
    </section>

    <ConfirmDialog
      v-if="existing !== null"
      :open="confirming === 'delete'"
      :title="`Permanently delete “${existing.title}”?`"
      confirm-label="Delete permanently"
      :confirm-text="existing.slug"
      :busy="busy"
      danger
      @confirm="deleteList"
      @cancel="!busy && (confirming = null)"
    >
      <p class="danger-text"><strong>This cannot be undone in the app.</strong></p>
      <ul>
        <li>The list and every entry, including withdrawn nominations, will be removed.</li>
        <li>All members' scores and nomination records for this list will be erased.</li>
        <li>Once confirmed, deletion cannot be cancelled, even if cleanup needs a retry.</li>
        <li>
          The address <code>/lists/{{ existing.slug }}</code> can be reused after cleanup.
        </li>
      </ul>
      <p>
        Old shared links may then lead to a replacement list. Previously downloaded backups are not
        erased and can restore a separate copy.
      </p>
      <ErrorNotice :error="deletionError" />
    </ConfirmDialog>

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
      <p>
        <strong>Voting cannot be reopened.</strong> Admin corrections and permanent entry deletion
        can still change standings.
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
      :title="`Archive “${existing.title}”?`"
      confirm-label="Archive list"
      :confirm-text="existing.slug"
      danger
      @confirm="archive"
      @cancel="confirming = null"
    >
      <p class="danger-text"><strong>This can’t be undone.</strong></p>
      <p>
        Archiving preserves this list and its scores; it does not delete them. As soon as you
        confirm:
      </p>
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
