// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import ConfirmDialog from './ConfirmDialog.vue';

describe('ConfirmDialog', () => {
  test('with confirmText, the confirm button works only once it is typed exactly', async () => {
    const dialog = mount(ConfirmDialog, {
      props: {
        open: false,
        title: 'Archive?',
        confirmLabel: 'Archive permanently',
        confirmText: 'best-sci-fi',
        danger: true,
      },
    });
    await dialog.setProps({ open: true });
    const confirm = () => dialog.findAll('button').find((b) => b.text() === 'Archive permanently');
    expect(dialog.text()).toContain('Type best-sci-fi to confirm');
    expect((confirm()?.element as HTMLButtonElement).disabled).toBe(true);
    await dialog.get('input').setValue('best-sci');
    expect((confirm()?.element as HTMLButtonElement).disabled).toBe(true);
    await dialog.get('input').setValue('best-sci-fi');
    expect((confirm()?.element as HTMLButtonElement).disabled).toBe(false);
    await confirm()?.trigger('click');
    expect(dialog.emitted('confirm')).toHaveLength(1);
  });

  test('the typed text resets each time it opens', async () => {
    const dialog = mount(ConfirmDialog, {
      props: { open: true, title: 'Archive?', confirmLabel: 'Go', confirmText: 'x' },
    });
    await dialog.get('input').setValue('x');
    await dialog.setProps({ open: false });
    await dialog.setProps({ open: true });
    expect((dialog.get('input').element as HTMLInputElement).value).toBe('');
  });

  test('without confirmText, confirming needs no typing', () => {
    const dialog = mount(ConfirmDialog, {
      props: { open: true, title: 'Close?', confirmLabel: 'Close voting' },
    });
    expect(dialog.find('input').exists()).toBe(false);
    expect(
      (
        dialog.findAll('button').find((b) => b.text() === 'Close voting')
          ?.element as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });
});
