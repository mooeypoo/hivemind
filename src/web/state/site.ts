import { reactive } from 'vue';
import type { SiteDto } from '../../server/http/contracts.ts';
import { api } from '../services/api.ts';

/** Public facts about this deployment: which community, and whether it offers movie data. */
export const site = reactive<{ info: SiteDto | null }>({ info: null });

let loading: Promise<void> | null = null;

export const loadSite = (): Promise<void> => {
  loading ??= (async () => {
    const result = await api.get<SiteDto>('/api/site', { allowSignedOut: true });
    if (result.ok) site.info = result.data;
  })();
  return loading;
};
