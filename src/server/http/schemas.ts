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
  z.strictObject({ kind: z.literal('tvdb-series') }),
  z.strictObject({ kind: z.literal('igdb-game') }),
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
  scoreVisibility: z.enum(['private', 'public']),
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
  scoreVisibility: listConfigFields.scoreVisibility.default(LIST_DEFAULTS.scoreVisibility),
});

export const editListBody = z
  .strictObject(listConfigFields)
  .partial()
  .extend({ closesAt: isoDate.nullable().optional() });

/** `closesAt: null`: open-ended, until an Admin closes voting. */
export const scheduleBody = z.strictObject({
  opensAt: isoDate,
  nominationsCloseAt: isoDate.nullable(),
  closesAt: isoDate.nullable(),
});

export const visibilityBody = z.strictObject({ visibility: z.enum(['public', 'hidden']) });
export const deleteListBody = z.strictObject({ confirmation: z.string().min(1).max(60) });
export const deleteEntryBody = z.strictObject({
  entryId: z.string().min(1).max(1000),
  token: z.string().min(1).max(200),
  confirmation: z.string().min(1).max(1000),
});

export const scoreVisibilityBody = z.strictObject({
  scoreVisibility: z.enum(['private', 'public']),
});

export const nominateBody = z.union([
  z.strictObject({ externalId: z.string().min(1).max(200) }),
  z.strictObject({ title: z.string().min(1).max(500) }),
]);

export const withdrawNominationBody = z.strictObject({
  entryId: z.string().min(1).max(700),
  token: z.string().min(1).max(200),
});

/** About 200 rows of 2 × 200 characters, with room for quoting. */
export const importPresetBody = z.strictObject({ csv: z.string().min(1).max(100_000) });

/** Sets a score, or clears it with `null`. Ranges are the domain's to check. */
export const changeScoreBody = z.strictObject({
  entryId: z.string().min(1).max(300),
  score: z.number().nullable(),
  revision: z.string().min(1).max(200).nullable().optional(),
});

export const saveRoleLabelsBody = z.strictObject({
  labels: z
    .array(z.strictObject({ roleId: z.string().max(100), name: z.string().max(200) }))
    .max(200),
  version: z.string().max(200).nullable(),
});

export const demoSignInBody = z.strictObject({ persona: z.string().min(1).max(40) });

export const searchQuery = z.object({ q: z.string().max(200).default('') });

export const resolveItemQuery = z.strictObject({ externalId: z.string().min(1).max(300) });

export const refreshDetailsQuery = z.strictObject({ after: z.string().min(1).max(700).optional() });

// ---- Backups ----

const isoString = z.iso.datetime({ offset: true });

const backupListPart = z.object({
  list: z.object({
    // Backups made before score visibility existed had private scores.
    config: z.object({
      ...listConfigFields,
      scoreVisibility: listConfigFields.scoreVisibility.default('private'),
    }),
    schedule: z
      .object({
        opensAt: isoString,
        nominationsCloseAt: isoString.nullable(),
        closesAt: isoString.nullable(),
      })
      .nullable(),
    phase: z.enum(['draft', 'published', 'archived']),
    visibility: z.enum(['public', 'hidden']),
    createdAt: isoString,
    archivedAt: isoString.nullable(),
  }),
  entries: z
    .array(
      z.object({
        item: z.object({
          source: z.string().max(40),
          externalId: z.string().max(300),
          title: z.string().max(500),
          subtitle: z.string().max(500).nullable(),
          imageUrl: z.url().max(500).nullable(),
          overview: z.string().max(10_000).optional(),
          director: z.string().max(200).optional(),
          creator: z.string().max(2000).optional(),
          developer: z.string().max(2000).optional(),
          publisher: z.string().max(2000).optional(),
          cast: z.array(z.string().max(200)).max(2).optional(),
        }),
        nominatedBy: z
          .object({ memberId: z.string().max(40), displayName: z.string().max(200) })
          .nullable(),
        nominatedAt: isoString,
        snapshotPurgedAt: isoString.nullable(),
        withdrawnAt: isoString.nullable().optional(),
      }),
    )
    .max(2000),
  nominators: z.array(
    z.object({ memberId: z.string().max(40), entryIds: z.array(z.string().max(400)).max(2000) }),
  ),
  preset: z
    .object({
      items: z
        .array(z.object({ title: z.string().max(500), subtitle: z.string().max(500).nullable() }))
        .max(200),
    })
    .nullable(),
  ballots: z.string().max(4_000_000).nullable(),
});

/** A backup file (format version 1). The contexts check the contents again on import. */
export const backupFileBody = z.object({
  format: z.literal('votable-lists-backup'),
  version: z.literal(1),
  exportedAt: isoString,
  keyId: z.string().max(64),
  lists: z.array(backupListPart).max(200),
});

export const BACKUP_MAX_BYTES = 5 * 1024 * 1024;
