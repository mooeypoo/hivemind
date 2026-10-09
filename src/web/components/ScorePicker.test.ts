// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { stubApi } from '../testing/fixtures.ts';
import ScorePicker from './ScorePicker.vue';

const props = {
  listId: 'list-1',
  entryId: 'freeform.root',
  entryTitle: 'Root',
  scale: { min: 1, max: 5 },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ScorePicker', () => {
  test('shows an unrated slider with low on the left and high on the right', () => {
    const picker = mount(ScorePicker, { props: { ...props, score: null } });
    expect(picker.get('input[type=range]').attributes()).toMatchObject({ min: '1', max: '5' });
    expect(picker.text()).toContain('Not rated');
    expect(picker.text()).toContain('Low · 1');
    expect(picker.text()).toContain('High · 5');
    expect(picker.get('label').text()).toContain('for Root');
  });

  test('saves a chosen score and reports the new ballot', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () =>
        Response.json({ listId: 'list-1', scores: { 'freeform.root': 4 } }),
    });
    const picker = mount(ScorePicker, { props: { ...props, score: null } });
    await picker.get('input[type=range]').setValue('4');
    await flushPromises();
    expect(calls[0]?.body).toEqual({ entryId: 'freeform.root', score: 4 });
    expect(picker.emitted('changed')?.[0]).toEqual([
      { listId: 'list-1', scores: { 'freeform.root': 4 } },
    ]);
    expect(picker.text()).toContain('Saved');
  });

  test('Clear score removes a previous score', async () => {
    const calls = stubApi({
      'PUT /api/lists/list-1/ballot': () => Response.json({ listId: 'list-1', scores: {} }),
    });
    const picker = mount(ScorePicker, { props: { ...props, score: 3 } });
    await picker.get('button').trigger('click');
    await flushPromises();
    expect(calls[0]?.body).toEqual({ entryId: 'freeform.root', score: null });
    expect(picker.text()).toContain('Score cleared');
  });

  test('on an error, shows it and puts the old score back', async () => {
    stubApi({
      'PUT /api/lists/list-1/ballot': () =>
        Response.json(
          {
            error: {
              code: 'voting.closed',
              message: 'Voting is not open for this list right now.',
            },
          },
          { status: 403 },
        ),
    });
    const picker = mount(ScorePicker, { props: { ...props, score: 3 } });
    await picker.get('input[type=range]').setValue('5');
    await flushPromises();
    expect(picker.text()).toContain('Voting is not open');
    expect((picker.get('input[type=range]').element as HTMLInputElement).value).toBe('3');
  });
});
