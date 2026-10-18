import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { AdminActivityDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';

export const useAdminActivity = () => {
  const route = useRoute();
  const router = useRouter();
  const selectedList = computed(() =>
    typeof route.query.list === 'string' ? route.query.list : '',
  );
  const lists = ref<AdminActivityDto['lists']>([]);
  const data = ref<AdminActivityDto | null>(null);
  const error = ref<ApiError | null>(null);
  const busy = ref(false);
  const page = ref(0);
  const cursors = ref<(string | null)[]>([null]);
  let requestId = 0;

  const load = async (target = 0, cursor: string | null = null) => {
    const request = ++requestId;
    busy.value = true;
    error.value = null;
    const query = new URLSearchParams();
    if (selectedList.value !== '') query.set('list', selectedList.value);
    if (cursor !== null) query.set('cursor', cursor);
    const suffix = query.size === 0 ? '' : `?${query.toString()}`;
    const result = await api.get<AdminActivityDto>(`/api/admin/activity${suffix}`);
    if (request !== requestId) return;
    busy.value = false;
    if (!result.ok) {
      error.value = result.error;
      return;
    }
    lists.value = result.data.lists;
    data.value = result.data;
    page.value = target;
    if (target === 0) cursors.value = [null];
    else cursors.value[target] = cursor;
  };

  const selectList = (list: string) =>
    router.push({
      query: { ...route.query, list: list === '' ? undefined : list },
    });
  const older = () => {
    const cursor = data.value?.nextCursor;
    if (!busy.value && cursor != null) void load(page.value + 1, cursor);
  };
  const newer = () => {
    if (!busy.value && page.value > 0)
      void load(page.value - 1, cursors.value[page.value - 1] ?? null);
  };
  watch(
    selectedList,
    () => {
      data.value = null;
      page.value = 0;
      cursors.value = [null];
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    requestId += 1;
  });
  return {
    selectedList,
    lists,
    data,
    error,
    busy,
    page,
    selectList,
    older,
    newer,
    refresh: () => load(),
  };
};
