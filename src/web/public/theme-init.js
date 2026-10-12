// Applies a saved Light/Dark choice before the first paint, so the page never flashes the other
// theme. Plain JavaScript on purpose: it must run, render-blocking, before the app's module
// loads. The key and values match src/web/composables/theme.ts (tested).
try {
  const theme = localStorage.getItem('hivemind:theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
} catch {
  // Storage blocked: follow the system setting.
}
