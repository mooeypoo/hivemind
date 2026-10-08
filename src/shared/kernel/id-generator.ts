export interface IdGenerator {
  /** A new random, URL-safe, unguessable identifier. */
  next(): string;
}
