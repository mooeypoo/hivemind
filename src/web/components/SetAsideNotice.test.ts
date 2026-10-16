// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import SetAsideNotice from './SetAsideNotice.vue';

test('compact notices keep the tag and open details without rendering the explanation', async () => {
  const reason = 'A very long explanation. '.repeat(20);
  const notice = mount(SetAsideNotice, { props: { reason, itemTitle: 'Root' } });
  expect(notice.text()).toContain('Set aside');
  expect(notice.text()).not.toContain(reason);
  expect(notice.find('.set-aside-notice__reason').exists()).toBe(false);
  await notice.get('button[aria-label="Why was Root set aside?"]').trigger('click');
  expect(notice.emitted('open')).toHaveLength(1);
});

test('details show the complete plain-text explanation without an extra popup control', () => {
  const reason = '<b>Outside the criteria</b>\nMore context.';
  const notice = mount(SetAsideNotice, { props: { reason, showReason: true } });
  expect(notice.get('.set-aside-notice__reason').text()).toBe(reason);
  expect(notice.find('b').exists()).toBe(false);
  expect(notice.find('button').exists()).toBe(false);
});

test('unmarked entries have neither a tag nor an explanation control', () => {
  const notice = mount(SetAsideNotice, { props: { reason: null } });
  expect(notice.find('.set-aside-notice').exists()).toBe(false);
});
