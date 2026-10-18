/** Route names for the site's navigation, in display order. */
export interface NavLink {
  readonly label: string;
  readonly route: string;
}

export const adminGuideUrl = `${import.meta.env.VITE_SOURCE_URL.replace(/\/$/, '')}/blob/HEAD/docs/admin-guide.md`;

/** Shown in the header on wide screens and at the top of the menu on narrow screens. */
export const primaryLinks: readonly NavLink[] = [
  { label: 'Lists', route: 'lists' },
  { label: 'About', route: 'about' },
];

export const adminLinks: readonly NavLink[] = [
  { label: 'New list', route: 'new-list' },
  { label: 'Roles', route: 'roles' },
  { label: 'Community insights', route: 'insights' },
  { label: 'Activity log', route: 'activity' },
  { label: 'Backups', route: 'backups' },
];
