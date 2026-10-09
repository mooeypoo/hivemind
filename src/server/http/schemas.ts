import { z } from 'zod';
import { LIST_DEFAULTS } from '../../contexts/lists/index.ts';
import type { RoleId } from '../../shared/kernel/index.ts';

/** Discord's redirect back to us. A cancelled sign-in arrives with `error` and no `code`. */
export const loginCallbackQuery = z.object({
  code: z.string().min(1).max(512),
  state: z.string().min(1).max(128),
});

const isoDate = z.iso.datetime({ offset: true }).transform((value) => new Date(value));
const roleId = z
  .string()
  .regex(/^\d{5,25}$/, 'must be a Discord role ID')
  .transform((id) => id as RoleId);

const itemSource = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('tmdb-movie') }),
  z.strictObject({ kind: z.literal('freeform') }),
  z.strictObject({ kind: z.literal('preset'), presetId: z.string().min(1).max(64) }),
]);

/** Shapes and types only; the lists domain validates ranges and rules. */
const listConfigFields = {
  title: z.string().max(500),
  slug: z.string().max(100),
  description: z.string().max(5000),
  itemSource,
  entryMode: z.enum(['nominations', 'seeded']),
  scale: z.strictObject({ min: z.number().int(), max: z.number().int() }),
  /** Null: unlimited. */
  maxNominationsPerMember: z.number().int().nullable(),
  resultsVisibility: z.enum(['live', 'after-close']),
  ranking: z.strictObject({ strategy: z.literal('bayesian'), minVotes: z.number().int() }),
  showNominators: z.boolean(),
  requiredRoleIds: z.array(roleId).max(100),
};

export const createListBody = z.strictObject({
  ...listConfigFields,
  description: listConfigFields.description.default(LIST_DEFAULTS.description),
  entryMode: listConfigFields.entryMode.default(LIST_DEFAULTS.entryMode),
  scale: listConfigFields.scale.default(LIST_DEFAULTS.scale),
  maxNominationsPerMember: listConfigFields.maxNominationsPerMember.default(
    LIST_DEFAULTS.maxNominationsPerMember,
  ),
  resultsVisibility: listConfigFields.resultsVisibility.default(LIST_DEFAULTS.resultsVisibility),
  ranking: listConfigFields.ranking.default(LIST_DEFAULTS.ranking),
  showNominators: listConfigFields.showNominators.default(LIST_DEFAULTS.showNominators),
  requiredRoleIds: listConfigFields.requiredRoleIds.default([]),
});

export const editListBody = z
  .strictObject(listConfigFields)
  .partial()
  .extend({ closesAt: isoDate.optional() });

export const scheduleBody = z.strictObject({
  opensAt: isoDate,
  nominationsCloseAt: isoDate.nullable(),
  closesAt: isoDate,
});

export const nominateBody = z.union([
  z.strictObject({ externalId: z.string().min(1).max(200) }),
  z.strictObject({ title: z.string().min(1).max(500) }),
]);

/** About 200 rows of 2 × 200 characters, with room for quoting. */
export const importPresetBody = z.strictObject({ csv: z.string().min(1).max(100_000) });

/** Sets a score, or clears it with `null`. Ranges are the domain's to check. */
export const changeScoreBody = z.strictObject({
  entryId: z.string().min(1).max(300),
  score: z.number().nullable(),
});

export const searchQuery = z.object({ q: z.string().max(200).default('') });
