import { computed, onScopeDispose, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import type { InsightsDto } from '../../server/http/contracts.ts';
import { api, type ApiError } from '../services/api.ts';

export const useInsights = () => {
  const route = useRoute();
  const selectedList = computed(() =>
    typeof route.query.list === 'string' ? route.query.list : '',
  );
  const data = ref<InsightsDto | null>(null);
  const error = ref<ApiError | null>(null);
  const busy = ref(false);
  let requestId = 0;
  const load = async () => {
    const request = ++requestId;
    data.value = null;
    busy.value = true;
    error.value = null;
    const query =
      selectedList.value === '' ? '' : `?${new URLSearchParams({ list: selectedList.value })}`;
    const result = await api.get<InsightsDto>(`/api/admin/insights${query}`);
    if (request !== requestId) return;
    busy.value = false;
    if (result.ok) data.value = result.data;
    else error.value = result.error;
  };
  watch(
    selectedList,
    () => {
      void load();
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    requestId += 1;
  });
  return { selectedList, data, error, busy, refresh: load };
};
