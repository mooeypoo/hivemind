// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { expect, test } from 'vitest';
import FixedSettings from './FixedSettings.vue';

test('fixed settings start collapsed and keep their contents available for inspection', async () => {
  const wrapper = mount(FixedSettings, {
    props: { fixed: true, label: 'Rating' },
    slots: { default: '<fieldset disabled><input value="2"></fieldset>' },
  });
  expect(wrapper.get('summary').text()).toBe('Rating Fixed · view settings');
  expect(wrapper.get('details').attributes('open')).toBeUndefined();
  expect(wrapper.get('input').element).toHaveProperty('value', '2');
  await wrapper.setProps({ fixed: false });
  expect(wrapper.find('details').exists()).toBe(false);
  expect(wrapper.get('input').element).toHaveProperty('value', '2');
  wrapper.unmount();
});
