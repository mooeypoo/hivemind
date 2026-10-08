import { createListsModule } from '../contexts/lists/index.ts';
import { createVotingModule } from '../contexts/voting/index.ts';
export const voting = createVotingModule({ lists: createListsModule() });
export type { ListReader } from '../contexts/voting/index.ts';
