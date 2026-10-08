import type { ListsModule } from '../../lists/index.ts';
import type { ListReader } from '../application/ports.ts';
export const createListsReader = (lists: ListsModule) => lists as unknown as ListReader;
