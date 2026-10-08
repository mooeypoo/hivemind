import { makeCreateList } from '../../lists/index.ts';
import type { ListReader } from '../application/ports.ts';
export const reader = { makeCreateList } as unknown as ListReader;
