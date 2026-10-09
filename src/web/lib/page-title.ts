import { watchEffect } from 'vue';

const siteName = (): string => import.meta.env.VITE_SITE_NAME;

/** Every page has its own title, "Page · Site" (WCAG 2.4.2). */
export const pageTitle = (page: string | null): string =>
  page === null || page === '' ? siteName() : `${page} · ${siteName()}`;

export const usePageTitle = (page: () => string | null): void => {
  watchEffect(() => {
    document.title = pageTitle(page());
  });
};
