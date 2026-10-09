import { reactive } from 'vue';
import type { MeDto } from '../../server/http/contracts.ts';
import { api, navigation } from '../services/api.ts';

/** Who is signed in. Loaded once at start-up; null when signed out. */
export const session = reactive<{ loaded: boolean; me: MeDto | null }>({ loaded: false, me: null });

let loading: Promise<void> | null = null;

export const loadSession = (): Promise<void> => {
  loading ??= (async () => {
    const result = await api.get<MeDto>('/api/me', { allowSignedOut: true });
    session.me = result.ok ? result.data : null;
    session.loaded = true;
  })();
  return loading;
};

export const signOut = async (): Promise<void> => {
  await api.post('/api/auth/logout');
  session.me = null;
  navigation.assign('/');
};
