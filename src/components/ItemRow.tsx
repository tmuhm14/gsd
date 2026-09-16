"use client";

import type { ItemRow as Row } from "@/db/schema/items";
import { snippet, todoCounts } from "@/lib/markdown";

type Props = {
  item: Row;
  active: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
};

export function ItemRow({ item, active, onOpen, onToggleDone }: Props) {
  const counts = todoCounts(item.body);
  const preview = snippet(item.body);
  const overdue =
    item.dueDate !== null &&
    item.bucket !== "done" &&
    item.bucket !== "trash" &&
    item.dueDate < new Date();

  return (
    <div
      className={`flex gap-3 border-b border-neutral-800/70 px-4 py-3 ${
        active ? "bg-violet-600/15" : "active:bg-neutral-900"
      }`}
    >
      {item.kind === "note" ? (
        <span className="mt-1 text-neutral-600" aria-hidden>
          ▢
        </span>
      ) : (
        <button
          type="button"
          onClick={onToggleDone}
          aria-label={item.bucket === "done" ? "Reopen" : "Mark done"}
          // 44px hit target: this sits next to the row's own tap area.
          className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-lg"
        >
          <span className={item.bucket === "done" ? "text-violet-400" : "text-neutral-500"}>
            {item.bucket === "done" ? "☑" : "☐"}
          </span>
        </button>
      )}

      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p
          className={`truncate text-sm font-medium ${
            item.bucket === "done" ? "text-neutral-500 line-through" : ""
          }`}
        >
          {item.pinned ? "📌 " : ""}
          {item.title || "Untitled"}
        </p>

        {preview ? (
          <p className="mt-0.5 truncate text-xs text-neutral-500">{preview}</p>
        ) : null}

        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-neutral-500">
          {item.dueDate ? (
            <span className={overdue ? "text-red-400" : undefined}>
              {item.dueDate.toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ) : null}
          {item.waitingOn ? <span>waiting on {item.waitingOn}</span> : null}
          {counts.open + counts.done > 0 ? (
            <span>
              {counts.done}/{counts.open + counts.done}
            </span>
          ) : null}
          {item.contexts.slice(0, 3).map((context) => (
            <span key={context} className="text-violet-400">
              @{context}
            </span>
          ))}
        </div>
      </button>
    </div>
  );
}
