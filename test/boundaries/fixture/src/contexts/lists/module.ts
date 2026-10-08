import { makeCreateList } from './application/create-list.ts';
export const createListsModule = () => ({ createList: makeCreateList() });
export type ListsModule = ReturnType<typeof createListsModule>;
