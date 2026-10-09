import type { Store } from '@netlify/blobs';
import { readVersioned, writeVersioned } from '../../../shared/infrastructure/blobs.ts';
import type { RoleId } from '../../../shared/kernel/index.ts';
import type { CommunityCache, RoleLabelRepository } from '../application/ports.ts';
import type { Community } from '../domain/community.ts';

/*
 * Store: `identity`. Keys:
 *   community     cached name and icon of the Discord server (public information)
 *   role-labels   Admin-maintained names for Discord role IDs
 */

interface CommunityRecordV1 {
  readonly v: 1;
  readonly community: Community;
  readonly fetchedAt: string;
}

interface RoleLabelsRecordV1 {
  readonly v: 1;
  readonly labels: readonly { readonly roleId: string; readonly name: string }[];
}

export const createBlobsCommunityCache = (store: Store): CommunityCache => ({
  async get() {
    const record = (await store.get('community', {
      type: 'json',
    })) as Partial<CommunityRecordV1> | null;
    // Unreadable is a cache miss: it is looked up again.
    if (record?.v !== 1 || record.community === undefined || record.fetchedAt === undefined)
      return null;
    return { community: record.community, fetchedAt: new Date(record.fetchedAt) };
  },
  async put(cached) {
    const record: CommunityRecordV1 = {
      v: 1,
      community: cached.community,
      fetchedAt: cached.fetchedAt.toISOString(),
    };
    await store.setJSON('community', record);
  },
});

export const createBlobsRoleLabelRepository = (store: Store): RoleLabelRepository => ({
  async get() {
    const entry = await readVersioned(store, 'role-labels');
    if (entry === null) return null;
    const record = entry.data as Partial<RoleLabelsRecordV1> | null;
    if (record?.v !== 1 || record.labels === undefined)
      throw new Error('Unreadable role-labels record');
    return {
      labels: record.labels.map((label) => ({ roleId: label.roleId as RoleId, name: label.name })),
      version: entry.version,
    };
  },
  save: (labels, expectedVersion) =>
    writeVersioned(
      store,
      'role-labels',
      {
        v: 1,
        labels: labels.map(({ roleId, name }) => ({ roleId, name })),
      } satisfies RoleLabelsRecordV1,
      expectedVersion,
    ),
});
