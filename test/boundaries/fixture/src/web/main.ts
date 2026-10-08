import type { MeDto } from '../server/http/contracts.ts';
import { createApp } from 'vue';
export const x: MeDto | typeof createApp = createApp;
