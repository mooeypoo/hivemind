export interface Tab {
  readonly id: string;
  readonly label: string;
  /** A small count shown beside the label. */
  readonly count?: number;
}
