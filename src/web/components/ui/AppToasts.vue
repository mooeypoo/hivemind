<script setup lang="ts">
defineProps<{
  toasts: readonly { readonly id: number; readonly message: string; readonly tone: string }[];
}>();
const emit = defineEmits<{ dismiss: [id: number] }>();
</script>

<template>
  <!-- Always rendered, so screen readers already watch the region when a toast arrives. -->
  <div class="toasts" role="status" aria-live="polite">
    <TransitionGroup name="toast">
      <p v-for="toast in toasts" :key="toast.id" class="toast" :class="`toast--${toast.tone}`">
        <span class="toast__message">{{ toast.message }}</span>
        <button
          type="button"
          class="toast__dismiss"
          aria-label="Dismiss notification"
          @click="emit('dismiss', toast.id)"
        >
          ×
        </button>
      </p>
    </TransitionGroup>
  </div>
</template>
