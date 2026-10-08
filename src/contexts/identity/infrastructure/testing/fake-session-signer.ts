import type { Session } from '../../domain/session.ts';
import type { SessionSigner } from '../../application/ports.ts';

/** Readable, unsigned tokens for application tests. Anything without the prefix is "tampered". */
export class FakeSessionSigner implements SessionSigner {
  private static readonly prefix = 'fake-signed:';

  sign(session: Session): string {
    return FakeSessionSigner.prefix + JSON.stringify(session);
  }

  verify(token: string): Session | null {
    if (!token.startsWith(FakeSessionSigner.prefix)) return null;
    return JSON.parse(token.slice(FakeSessionSigner.prefix.length)) as Session;
  }
}
