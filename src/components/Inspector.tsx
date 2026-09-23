"use client";

import {
  BUCKET_LABELS,
  CLARIFY_BUCKETS,
  ENERGY_LEVELS,
  ITEM_KINDS,
  type Bucket,
  type Energy,
  type ItemKind,
} from "@/lib/gtd";
import { relativeDate } from "@/lib/slashCommands";

export type Draft = {
  bucket: Bucket;
  kind: ItemKind;
  energy: Energy | null;
  dueDate: Date | null;
  deferDate: Date | null;
  waitingOn: string | null;
  pinned: boolean;
};

type Props = {
  draft: Draft;
  onChange: (changes: Partial<Draft>) => void;
};

/** Taps, not dropdowns — clarifying is the step people skip. */
export function Inspector({ draft, onChange }: Props) {
  return (
    <div className="space-y-4 p-4">
      <Section title="Status">
        <div className="flex flex-wrap gap-1.5">
          {CLARIFY_BUCKETS.map((bucket) => (
            <Pill
              key={bucket}
              label={BUCKET_LABELS[bucket]}
              on={draft.bucket === bucket}
              onClick={() => onChange({ bucket })}
            />
          ))}
        </div>
      </Section>

      <Section title="Type">
        <div className="flex gap-1.5">
          {ITEM_KINDS.map((kind) => (
            <Pill
              key={kind}
              label={kind}
              on={draft.kind === kind}
              onClick={() => onChange({ kind })}
            />
          ))}
        </div>
      </Section>

      <Section title="Due">
        <DateRow
          value={draft.dueDate}
          onPick={(dueDate) => onChange({ dueDate })}
          shortcuts={[
            ["Today", 0],
            ["Tomorrow", 1],
            ["+1w", 7],
          ]}
        />
      </Section>

      <Section title="Start">
        <DateRow
          value={draft.deferDate}
          onPick={(deferDate) => onChange({ deferDate })}
          shortcuts={[
            ["Today", 0],
            ["Tomorrow", 1],
            ["+1w", 7],
          ]}
        />
      </Section>

      {draft.kind !== "note" ? (
        <Section title="Energy">
          <div className="flex gap-1.5">
            {ENERGY_LEVELS.map((energy) => (
              <Pill
                key={energy}
                label={energy}
                on={draft.energy === energy}
                // Tapping the active level clears it back to "any".
                onClick={() =>
                  onChange({ energy: draft.energy === energy ? null : energy })
                }
              />
            ))}
          </div>
        </Section>
      ) : null}

      {draft.bucket === "waiting" ? (
        <Section title="Waiting on">
          <input
            value={draft.waitingOn ?? ""}
            onChange={(event) =>
              onChange({ waitingOn: event.target.value || null })
            }
            placeholder="Who?"
            className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-violet-500"
          />
        </Section>
      ) : null}

      <Pill
        label={draft.pinned ? "📌 Pinned" : "Pin to top"}
        on={draft.pinned}
        onClick={() => onChange({ pinned: !draft.pinned })}
      />
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </p>
      {children}
    </div>
  );
}

function Pill({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1.5 text-xs capitalize ${
        on ? "bg-violet-600 font-medium text-white" : "bg-neutral-800 text-neutral-300"
      }`}
    >
      {label}
    </button>
  );
}

function DateRow({
  value,
  onPick,
  shortcuts,
}: {
  value: Date | null;
  onPick: (date: Date | null) => void;
  shortcuts: [string, number][];
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {value ? (
        <span className="rounded-lg bg-neutral-800 px-2.5 py-1.5 text-xs">
          {value.toLocaleDateString()}
          <button
            type="button"
            onClick={() => onPick(null)}
            aria-label="Clear date"
            className="ml-2 text-neutral-500"
          >
            ✕
          </button>
        </span>
      ) : null}
      {shortcuts.map(([label, days]) => (
        <Pill
          key={label}
          label={label}
          on={false}
          onClick={() => onPick(relativeDate(days))}
        />
      ))}
    </div>
  );
}
