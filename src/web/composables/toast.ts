import { readonly, ref } from 'vue';

export type ToastTone = 'info' | 'success' | 'error';
export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly tone: ToastTone;
}

const SHOWN_FOR_MS = 5000;
const toasts = ref<Toast[]>([]);
let nextId = 1;

const dismiss = (id: number) => {
  toasts.value = toasts.value.filter((toast) => toast.id !== id);
};

/** Short, non-blocking feedback ("Link copied"), announced politely by the toast region. */
const show = (message: string, tone: ToastTone = 'info') => {
  const id = nextId++;
  toasts.value = [...toasts.value, { id, message, tone }];
  setTimeout(() => {
    dismiss(id);
  }, SHOWN_FOR_MS);
};

export const useToast = () => ({ toasts: readonly(toasts), show, dismiss });
