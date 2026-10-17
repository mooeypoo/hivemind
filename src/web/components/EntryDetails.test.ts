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
  test('last moderation attribution appears in the separate admin tools only', () => {
    const props = {
      entry: { ...entry, moderation: { adminName: 'Alex', at: '2026-01-01T12:00:00Z' } },
      scale: { min: 1, max: 10 },
    };
    const ordinary = mount(EntryDetails, { props });
    expect(ordinary.text()).not.toContain('Alex');
    ordinary.unmount();
    const admin = mount(EntryDetails, { props: { ...props, canSetAside: true } });
    expect(admin.get('.entry-admin').text()).toContain('Last moderation: Alex');
    admin.unmount();
  });
  test('shows game synopsis and developer/publisher companies with their own labels', () => {
    const dialog = mount(EntryDetails, {
      props: {
        entry: {
          ...entry,
          item: {
            source: 'igdb-game',
            externalId: '1942',
            title: 'A game',
            subtitle: '2015',
            imageUrl: null,
            overview: 'A game synopsis.',
            developer: 'A Studio',
            publisher: 'A Publisher',
          },
        },
        scale: { min: 1, max: 10 },
      },
      attachTo: document.body,
    });
    expect(dialog.text()).toContain('A game synopsis.');
    expect(dialog.text()).toContain('Developer');
    expect(dialog.text()).toContain('A Studio');
    expect(dialog.text()).toContain('Publisher');
    expect(dialog.text()).toContain('A Publisher');
    expect(dialog.text()).not.toContain('Director');
    dialog.unmount();
  });

  test('shows series synopsis, creator, and cast without labeling creators as directors', () => {
    const item = {
      source: 'tvdb-series',
      externalId: '123',
      title: 'A Show',
      subtitle: null,
      imageUrl: null,
      overview: 'A series synopsis.',
      creator: 'A Creator',
      cast: ['An Actor'],
    };
    const dialog = mount(EntryDetails, {
      props: {
        entry: { ...entry, item },
        scale: { min: 1, max: 10 },
      },
      attachTo: document.body,
    });
    expect(dialog.text()).toContain('A series synopsis.');
    expect(dialog.text()).toContain('Created by');
    expect(dialog.text()).toContain('A Creator');
    expect(dialog.text()).toContain('An Actor');
    expect(dialog.text()).not.toContain('Director');
    dialog.unmount();
  });
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
