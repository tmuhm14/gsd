"use client";

import { BUCKET_LABELS, BUCKETS, type Bucket } from "@/lib/gtd";

type Props = {
  current: Bucket;
  counts: Record<string, number | undefined>;
  onSelect: (bucket: Bucket) => void;
};

/**
 * Horizontally scrolling chips on phones, a vertical sidebar from `sm` up —
 * one component rather than two so the bucket list can't drift apart.
 */
export function BucketNav({ current, counts, onSelect }: Props) {
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-2 py-2 sm:h-full sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-2 sm:py-3">
      {BUCKETS.map((bucket) => {
        const count = counts[bucket] ?? 0;
        const active = bucket === current;
        return (
          <button
            key={bucket}
            type="button"
            onClick={() => onSelect(bucket)}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm sm:w-full ${
              active
                ? "bg-violet-600 font-medium text-white"
                : "text-neutral-300 hover:bg-neutral-800"
            }`}
          >
            <span>{BUCKET_LABELS[bucket]}</span>
            {count > 0 ? (
              <span
                className={`ml-auto text-xs ${active ? "text-violet-100" : "text-neutral-500"}`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </nav>
  );
}
