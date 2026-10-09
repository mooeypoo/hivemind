import type { MemberId } from '../../../../shared/kernel/index.ts';
import type { ErasureRegistry } from '../../application/ports.ts';

export class InMemoryErasureRegistry implements ErasureRegistry {
  readonly erased = new Map<MemberId, Date>();
  record(memberId: MemberId, at: Date) {
    this.erased.set(memberId, at);
    return Promise.resolve();
  }
  wasErased(memberId: MemberId) {
    return Promise.resolve(this.erased.has(memberId));
  }
  forgetBefore(cutoff: Date) {
    let n = 0;
    for (const [id, at] of this.erased) {
      if (at < cutoff) {
        this.erased.delete(id);
        n += 1;
      }
    }
    return Promise.resolve(n);
  }
}
