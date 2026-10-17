// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import ExternalLink from './ExternalLink.vue';

test('external links open safely in a new tab with a visible icon and accessible notice', () => {
  const wrapper = mount(ExternalLink, {
    props: { href: 'https://example.org/guide' },
    attrs: { class: 'menu__item' },
    slots: { default: 'Admin guide and FAQ' },
  });
  const link = wrapper.get('a');
  expect(link.attributes()).toMatchObject({
    href: 'https://example.org/guide',
    target: '_blank',
    rel: 'noopener noreferrer',
    class: 'menu__item',
  });
  expect(link.text()).toContain('Admin guide and FAQ');
  expect(link.get('.visually-hidden').text()).toBe('(opens in a new tab)');
  expect(link.get('svg').attributes('aria-hidden')).toBe('true');
  wrapper.unmount();
});
