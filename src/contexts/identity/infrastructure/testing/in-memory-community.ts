import { ok, type DomainError, type Result } from '../../../../shared/kernel/index.ts';
import type {
  CommunityCache,
  CommunityLookup,
  RoleLabelRepository,
} from '../../application/ports.ts';
import type { CachedCommunity, Community } from '../../domain/community.ts';
import type { RoleLabel } from '../../domain/role-labels.ts';

export class FakeCommunityLookup implements CommunityLookup {
  calls = 0;
  constructor(public outcome: Result<Community, DomainError>) {}
  lookup() {
    this.calls += 1;
    return Promise.resolve(this.outcome);
  }
}

export const communityOk = (name: string): Result<Community, DomainError> =>
  ok({
    name,
    iconUrl: `https://cdn.discordapp.com/icons/1/${name}.png`,
    inviteUrl: 'https://discord.gg/abc',
  });

export class InMemoryCommunityCache implements CommunityCache {
  value: CachedCommunity | null = null;
  get() {
    return Promise.resolve(this.value);
  }
  put(cached: CachedCommunity) {
    this.value = cached;
    return Promise.resolve();
  }
}

export class InMemoryRoleLabelRepository implements RoleLabelRepository {
  private row: { labels: readonly RoleLabel[]; version: string } | null = null;
  private counter = 0;
  get() {
    return Promise.resolve(this.row);
  }
  save(labels: readonly RoleLabel[], expectedVersion: string | null) {
    if ((this.row?.version ?? null) !== expectedVersion) return Promise.resolve(false);
    this.counter += 1;
    this.row = { labels, version: `v${String(this.counter)}` };
    return Promise.resolve(true);
  }
}
