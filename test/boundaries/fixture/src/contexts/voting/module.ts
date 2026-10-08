import { createListsReader } from './infrastructure/lists-reader.ts';
export const createVotingModule = (deps: { lists: Parameters<typeof createListsReader>[0] }) =>
  createListsReader(deps.lists);
