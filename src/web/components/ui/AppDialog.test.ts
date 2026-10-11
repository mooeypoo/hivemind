// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, test } from 'vitest';
import AppDialog from './AppDialog.vue';

const mountDialog = () =>
  mount(AppDialog, {
    props: { open: true, title: 'Delete?' },
    slots: { default: '<p>Body</p>', actions: '<button type="button">OK</button>' },
    attachTo: document.body,
  });

describe('AppDialog', () => {
  test('is named by its title and opens as a modal', () => {
    const dialog = mountDialog();
    const element = dialog.get('dialog').element as HTMLDialogElement;
    expect(element.open).toBe(true);
    const labelledBy = element.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(labelledBy)?.textContent).toBe('Delete?');
    dialog.unmount();
  });

  test('Escape and a backdrop click ask to close; a click inside does not', async () => {
    const dialog = mountDialog();
    await dialog.get('dialog').trigger('cancel');
    await dialog.get('dialog').trigger('click');
    await dialog.get('.dialog__body').trigger('click');
    expect(dialog.emitted('close')).toHaveLength(2);
    dialog.unmount();
  });

  test('closes when open turns false', async () => {
    const dialog = mountDialog();
    await dialog.setProps({ open: false });
    expect((dialog.get('dialog').element as HTMLDialogElement).open).toBe(false);
    dialog.unmount();
  });
});
