import type { Clock } from '../clock.ts';
import type { IdGenerator } from '../id-generator.ts';

/** A clock that stays where you put it. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}

/** Predictable ids: `id-1`, `id-2`, ... */
export class SequentialIds implements IdGenerator {
  private count = 0;

  next(): string {
    this.count += 1;
    return `id-${String(this.count)}`;
  }
}
