import type { ListsModule } from '../../lists/index.ts';
import type { ListReader } from '../application/ports.ts';

/** What voting needs from the lists module's public interface. */
export type ListsApi = Pick<ListsModule, 'rulesForVoting' | 'entryExists'>;

/** AGENTS.md's cross-context pattern: voting's `ListReader` port over the lists module. */
export const createListReader = (lists: ListsApi): ListReader => ({
  rulesFor: (list, viewer) => lists.rulesForVoting(list, viewer),
  entryExists: (listId, entryId) => lists.entryExists(listId, entryId),
});
