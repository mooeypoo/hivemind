import { err, ok } from '../../../shared/kernel/index.ts';
import type { ItemSource } from '../application/ports.ts';
import { catalogErrors } from '../domain/errors.ts';
import { cleanTitle, isValidTitle, titleKey } from '../domain/title.ts';

/** Free text: members type a title. Nothing to search; duplicates are caught by `titleKey`. */
export const createFreeformSource = (): ItemSource => ({
  search: () => Promise.resolve(ok([])),
  resolve: (_ref, title) =>
    Promise.resolve(
      isValidTitle(title)
        ? ok({
            source: 'freeform',
            externalId: titleKey(title),
            title: cleanTitle(title),
            subtitle: null,
            imageUrl: null,
          })
        : err(catalogErrors.invalidTitle),
    ),
});
