import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import { loginUrl, navigation } from './services/api.ts';
import { loadSession, session } from './state/session.ts';

declare module 'vue-router' {
  interface RouteMeta {
    /** Signed-in members only; others go to sign-in and come back. */
    member?: boolean;
    admin?: boolean;
  }
}

export const createAppRouter = (history: RouterHistory = createWebHistory()) => {
  const router = createRouter({
    history,
    routes: [
      { path: '/', name: 'lists', component: () => import('./pages/ListsIndex.vue') },
      {
        path: '/lists/:slug',
        name: 'list',
        component: () => import('./pages/ListPage.vue'),
        meta: { member: true },
      },
      {
        path: '/admin/lists/new',
        name: 'new-list',
        component: () => import('./pages/ListEditor.vue'),
        meta: { member: true, admin: true },
      },
      {
        path: '/admin/lists/:slug',
        name: 'edit-list',
        component: () => import('./pages/ListEditor.vue'),
        meta: { member: true, admin: true },
      },
      { path: '/:rest(.*)*', name: 'not-found', component: () => import('./pages/NotFound.vue') },
    ],
    scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  });

  router.beforeEach(async (to) => {
    await loadSession();
    if (to.meta.member === true && session.me === null) {
      navigation.assign(loginUrl(to.fullPath));
      return false;
    }
    if (to.meta.admin === true && session.me?.isAdmin !== true) return { name: 'lists' };
    return true;
  });

  return router;
};
