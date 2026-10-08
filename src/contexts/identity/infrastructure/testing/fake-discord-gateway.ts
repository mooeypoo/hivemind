import type { DomainError, Result } from '../../../../shared/kernel/index.ts';
import type { Membership } from '../../domain/membership.ts';
import type { DiscordGateway } from '../../application/ports.ts';

export class FakeDiscordGateway implements DiscordGateway {
  readonly codes: string[] = [];

  constructor(private outcome: Result<Membership, DomainError>) {}

  willReturn(outcome: Result<Membership, DomainError>): void {
    this.outcome = outcome;
  }

  authorizeUrl(state: string): string {
    return `https://discord.test/authorize?state=${state}`;
  }

  verifyMembership(code: string): Promise<Result<Membership, DomainError>> {
    this.codes.push(code);
    return Promise.resolve(this.outcome);
  }
}
