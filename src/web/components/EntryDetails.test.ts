// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import type { EntryDto } from '../../server/http/contracts.ts';
import EntryDetails from './EntryDetails.vue';

const entry: EntryDto = {
  id: 'tmdb-movie.78',
  item: {
    source: 'tmdb-movie',
    externalId: '78',
    title: 'Blade Runner',
    subtitle: '1982',
    imageUrl: null,
    overview: 'A blade runner must pursue replicants.',
    director: 'Ridley Scott',
    cast: ['Harrison Ford', 'Rutger Hauer'],
  },
  nominatedBy: null,
  isMine: false,
  nominatedAt: '2026-01-01T00:00:00.000Z',
};

describe('EntryDetails', () => {
  test('shows movie overview, director, and leading cast', () => {
    const dialog = mount(EntryDetails, {
      props: { entry, scale: { min: 1, max: 10 } },
      attachTo: document.body,
    });

    expect(dialog.text()).toContain('A blade runner must pursue replicants.');
    expect(dialog.text()).toContain('Director');
    expect(dialog.text()).toContain('Ridley Scott');
    expect(dialog.text()).toContain('Starring');
    expect(dialog.text()).toContain('Harrison Ford, Rutger Hauer');
    dialog.unmount();
  });

  test('does not show movie metadata for other catalog sources', () => {
    const dialog = mount(EntryDetails, {
      props: {
        entry: { ...entry, item: { ...entry.item, source: 'freeform' } },
        scale: { min: 1, max: 10 },
      },
      attachTo: document.body,
    });

    expect(dialog.text()).toContain('1982');
    expect(dialog.text()).not.toContain('A blade runner must pursue replicants.');
    expect(dialog.text()).not.toContain('Ridley Scott');
    expect(dialog.text()).not.toContain('Harrison Ford');
    dialog.unmount();
  });
});
