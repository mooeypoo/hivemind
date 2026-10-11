import { createApp } from 'vue';
import App from './App.vue';
import { applySavedTheme } from './composables/theme.ts';
import { createAppRouter } from './router.ts';

applySavedTheme();
createApp(App).use(createAppRouter()).mount('#app');
