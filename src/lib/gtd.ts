/**
 * The GTD vocabulary, kept deliberately identical to the macOS app's `Bucket`
 * and `ItemKind` so the two can share one database when sync lands.
 */
export const BUCKETS = [
  "inbox",
  "next",
  "waiting",
  "scheduled",
  "someday",
  "reference",
  "done",
  "trash",
] as const;

export type Bucket = (typeof BUCKETS)[number];

/** Buckets an item can be filed into while clarifying — trash is a button. */
export const CLARIFY_BUCKETS: readonly Bucket[] = [
  "inbox",
  "next",
  "waiting",
  "scheduled",
  "someday",
  "reference",
  "done",
];

export const BUCKET_LABELS: Record<Bucket, string> = {
  inbox: "Inbox",
  next: "Next Actions",
  waiting: "Waiting For",
  scheduled: "Scheduled",
  someday: "Someday / Maybe",
  reference: "Reference",
  done: "Done",
  trash: "Trash",
};

export const ITEM_KINDS = ["note", "action", "project"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const ENERGY_LEVELS = ["low", "medium", "high"] as const;
export type Energy = (typeof ENERGY_LEVELS)[number];
