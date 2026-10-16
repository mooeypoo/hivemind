import { getCurrentScope, onScopeDispose, readonly, ref } from 'vue';
import type { BallotDto } from '../../server/http/contracts.ts';
import { api } from '../services/api.ts';

type Scores = Readonly<Record<string, number>>;

/** Quick changes (arrow keys across score chips) become one save. */
const SETTLE_MS = 250;

/**
 * The caller's own ballot for one list. Score changes show at once and are saved in the
 * background: at most one request per entry is in flight, and only the latest value is sent.
 * A failed save puts the last saved score back and reports the error for that entry.
 */
export const useBallot = (
  listId: () => string,
  options: { onSaved?: () => void; revision?: () => string | null } = {},
) => {
  const scores = ref<Scores>({});
  const saving = ref<Readonly<Record<string, boolean>>>({});
  const errors = ref<Readonly<Record<string, string>>>({});
  let saved: Scores = {};
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();
  const again = new Set<string>();
  const revisions = new Map<string, string | null>();
  let generation = 0;

  const withEntry = <T>(map: Readonly<Record<string, T>>, entryId: string, value: T | null) => {
    const rest = Object.fromEntries(Object.entries(map).filter(([id]) => id !== entryId));
    return value === null ? rest : { ...rest, [entryId]: value };
  };

  const send = async (entryId: string): Promise<void> => {
    if (inFlight.has(entryId)) {
      again.add(entryId);
      saving.value = withEntry(saving.value, entryId, true);
      return;
    }
    inFlight.add(entryId);
    saving.value = withEntry(saving.value, entryId, true);
    const score = scores.value[entryId] ?? null;
    const sentGeneration = generation;
    const result = await api.put<BallotDto>(`/api/lists/${listId()}/ballot`, {
      entryId,
      score,
      revision: revisions.get(entryId) ?? null,
    });
    inFlight.delete(entryId);
    if (sentGeneration !== generation) {
      if (again.delete(entryId)) await send(entryId);
      return;
    }
    if (result.ok) {
      saved = result.data.scores;
    } else if (!again.has(entryId)) {
      scores.value = withEntry(scores.value, entryId, saved[entryId] ?? null);
      errors.value = withEntry(errors.value, entryId, result.error.message);
    }
    if (again.delete(entryId)) {
      await send(entryId);
      return;
    }
    saving.value = withEntry(saving.value, entryId, null);
    if (result.ok) options.onSaved?.();
  };

  /** Sets (or, with null, clears) the caller's score for an entry. */
  const set = (entryId: string, score: number | null) => {
    revisions.set(entryId, options.revision?.() ?? null);
    scores.value = withEntry(scores.value, entryId, score);
    errors.value = withEntry(errors.value, entryId, null);
    clearTimeout(timers.get(entryId));
    timers.set(
      entryId,
      setTimeout(() => {
        timers.delete(entryId);
        void send(entryId);
      }, SETTLE_MS),
    );
  };

  /** Replaces the ballot with the server's copy. */
  const load = (next: Scores) => {
    generation += 1;
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    again.clear();
    revisions.clear();
    saved = next;
    scores.value = next;
    saving.value = {};
    errors.value = {};
  };

  /** Sends any change still settling, e.g. when the page is left. */
  const flush = () => {
    for (const [entryId, timer] of timers) {
      clearTimeout(timer);
      void send(entryId);
    }
    timers.clear();
  };
  if (getCurrentScope() !== undefined) onScopeDispose(flush);

  return {
    scores: readonly(scores),
    saving: readonly(saving),
    errors: readonly(errors),
    set,
    load,
    flush,
  };
};
