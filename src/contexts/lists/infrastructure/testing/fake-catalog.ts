import { domainError, err, ok } from '../../../../shared/kernel/index.ts';
import type { Catalog } from '../../application/ports.ts';
import type { ItemSnapshot } from '../../domain/entry.ts';

const unavailable = domainError('invalid', 'catalog.source-unavailable', 'Unavailable');
const notFound = domainError('not-found', 'catalog.item-not-found', 'Not found');
const cannotSeed = domainError('invalid', 'catalog.cannot-seed', 'Cannot seed');

const movie = (externalId: string, title: string): ItemSnapshot => ({
  source: 'tmdb-movie',
  externalId,
  title,
  subtitle: null,
  imageUrl: null,
});

/** A catalog with a few movies, free text, and one preset named `albums`. */
export class FakeCatalog implements Catalog {
  readonly movies: readonly ItemSnapshot[] = [
    movie('78', 'Blade Runner'),
    movie('603', 'The Matrix'),
    movie('62', '2001: A Space Odyssey'),
    movie('1891', 'The Empire Strikes Back'),
  ];
  readonly albums: readonly ItemSnapshot[] = ['OK Computer', 'Kid A', 'Blue'].map((title) => ({
    source: 'preset',
    externalId: title.toLowerCase(),
    title,
    subtitle: null,
    imageUrl: null,
  }));

  checkSource: Catalog['checkSource'] = (ref, { seeded }) => {
    if (!['tmdb-movie', 'freeform', 'preset'].includes(ref.kind))
      return Promise.resolve(err(unavailable));
    if (seeded && ref.kind !== 'preset') return Promise.resolve(err(cannotSeed));
    return Promise.resolve(ok(undefined));
  };

  search: Catalog['search'] = (ref, query) =>
    Promise.resolve(
      ok(
        this.itemsFor(ref.kind).filter((item) =>
          item.title.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
    );

  resolve: Catalog['resolve'] = (ref, key) => {
    if (ref.kind === 'freeform') {
      return Promise.resolve(
        ok({
          source: 'freeform',
          externalId: key.trim().toLowerCase(),
          title: key.trim(),
          subtitle: null,
          imageUrl: null,
        }),
      );
    }
    const item = this.itemsFor(ref.kind).find((candidate) => candidate.externalId === key);
    return Promise.resolve(item === undefined ? err(notFound) : ok(item));
  };

  snapshotRetentionDays: Catalog['snapshotRetentionDays'] = (source) =>
    source === 'tmdb-movie' ? 183 : null;

  seedItems: Catalog['seedItems'] = (ref) =>
    Promise.resolve(ref.kind === 'preset' ? ok(this.albums) : err(cannotSeed));

  private itemsFor(kind: string): readonly ItemSnapshot[] {
    return kind === 'tmdb-movie' ? this.movies : kind === 'preset' ? this.albums : [];
  }
}
