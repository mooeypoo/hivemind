/** Route names for the site's navigation, in display order. */
export interface NavLink {
  readonly label: string;
  readonly route: string;
}

/** Shown in the header on wide screens and at the top of the menu everywhere. */
export const primaryLinks: readonly NavLink[] = [
  { label: 'Lists', route: 'lists' },
  { label: 'About', route: 'about' },
];

export const adminLinks: readonly NavLink[] = [
  { label: 'New list', route: 'new-list' },
  { label: 'Roles', route: 'roles' },
  { label: 'Backups', route: 'backups' },
];
