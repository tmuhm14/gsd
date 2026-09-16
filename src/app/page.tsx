"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/components/TRPCProvider";
import { BucketNav } from "@/components/BucketNav";
import { Editor } from "@/components/Editor";
import { Inspector, type Draft } from "@/components/Inspector";
import { ItemRow } from "@/components/ItemRow";
import { BUCKET_LABELS, type Bucket } from "@/lib/gtd";
import { relativeDate, type SlashAction } from "@/lib/slashCommands";
import type { ItemRow as Row } from "@/db/schema/items";

export default function HomePage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [bucket, setBucket] = useState<Bucket>("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showInspector, setShowInspector] = useState(false);

  const listQuery = useQuery(
    trpc.items.list.queryOptions(
      search.trim() ? { search } : { bucket },
    ),
  );
  const countsQuery = useQuery(trpc.items.counts.queryOptions());

  /** Everything that changes data invalidates the same two queries. */
  function refresh() {
    void queryClient.invalidateQueries({ queryKey: trpc.items.list.queryKey() });
    void queryClient.invalidateQueries({
      queryKey: trpc.items.counts.queryKey(),
    });
  }

  const createItem = useMutation(
    trpc.items.create.mutationOptions({
      onSuccess: (created) => {
        setOpenId(created.id);
        refresh();
      },
    }),
  );
  const updateItem = useMutation(
    trpc.items.update.mutationOptions({ onSuccess: refresh }),
  );
  const trashItem = useMutation(
    trpc.items.trash.mutationOptions({
      onSuccess: () => {
        setOpenId(null);
        refresh();
      },
    }),
  );

  const items = listQuery.data ?? [];
  const openItem = items.find((item) => item.id === openId) ?? null;

  return (
    <main className="flex h-screen flex-col sm:flex-row">
      <div className="sm:h-full sm:shrink-0">
        <BucketNav
          current={bucket}
          counts={countsQuery.data ?? {}}
          onSelect={(next) => {
            setBucket(next);
            setOpenId(null);
            setSearch("");
          }}
        />
      </div>

      <section
        className={`flex min-h-0 flex-1 flex-col border-neutral-800 sm:max-w-sm sm:border-r ${
          openItem ? "hidden sm:flex" : "flex"
        }`}
      >
        <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${BUCKET_LABELS[bucket]}`}
            className="min-w-0 flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm outline-none placeholder:text-neutral-600"
          />
          <button
            type="button"
            onClick={() => createItem.mutate({ bucket })}
            disabled={createItem.isPending}
            aria-label="New note"
            className="h-10 w-10 shrink-0 rounded-lg bg-violet-600 text-lg font-semibold disabled:opacity-40"
          >
            +
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {listQuery.isPending ? (
            <p className="p-6 text-center text-sm text-neutral-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="p-6 text-center text-sm text-neutral-500">
              {search.trim()
                ? "No matches."
                : bucket === "inbox"
                  ? "Inbox zero. Tap + to capture something."
                  : "Nothing here yet."}
            </p>
          ) : (
            items.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                active={item.id === openId}
                onOpen={() => setOpenId(item.id)}
                onToggleDone={() =>
                  updateItem.mutate({
                    id: item.id,
                    bucket: item.bucket === "done" ? "next" : "done",
                  })
                }
              />
            ))
          )}
        </div>
      </section>

      {openItem ? (
        <ItemDetail
          key={openItem.id}
          item={openItem}
          showInspector={showInspector}
          onToggleInspector={() => setShowInspector((open) => !open)}
          onClose={() => setOpenId(null)}
          onSave={(changes) => updateItem.mutate({ id: openItem.id, ...changes })}
          onTrash={() => trashItem.mutate({ id: openItem.id })}
          saving={updateItem.isPending}
        />
      ) : (
        <section className="hidden flex-1 items-center justify-center text-sm text-neutral-600 sm:flex">
          Select a note, or tap + to write a new one.
        </section>
      )}
    </main>
  );
}

type DetailProps = {
  item: Row;
  showInspector: boolean;
  saving: boolean;
  onToggleInspector: () => void;
  onClose: () => void;
  onTrash: () => void;
  onSave: (changes: Partial<Draft> & { body?: string }) => void;
};

function ItemDetail({
  item,
  showInspector,
  saving,
  onToggleInspector,
  onClose,
  onTrash,
  onSave,
}: DetailProps) {
  const [body, setBody] = useState(item.body);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const draft: Draft = useMemo(
    () => ({
      bucket: item.bucket as Draft["bucket"],
      kind: item.kind as Draft["kind"],
      energy: (item.energy as Draft["energy"]) ?? null,
      dueDate: item.dueDate,
      deferDate: item.deferDate,
      waitingOn: item.waitingOn,
      pinned: item.pinned,
    }),
    [item],
  );

  // Autosave on a debounce — there is no save button, so the indicator below
  // is the only signal that typing has landed.
  useEffect(() => {
    if (body === item.body) return;
    const timer = setTimeout(() => {
      onSave({ body });
      setSavedAt(new Date());
    }, 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [body]);

  function applyAction(action: SlashAction) {
    switch (action.type) {
      case "bucket":
        onSave({ bucket: action.bucket });
        break;
      case "kind":
        onSave({ kind: action.kind });
        break;
      case "energy":
        onSave({ energy: action.energy });
        break;
      case "due":
        onSave({ dueDate: relativeDate(action.days) });
        break;
      case "defer":
        onSave({ deferDate: relativeDate(action.days) });
        break;
      case "clearDates":
        onSave({ dueDate: null, deferDate: null });
        break;
      case "marker":
      case "insert":
        break; // Handled inside the editor.
    }
  }

  const dirty = body !== item.body;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-2 py-1.5 text-sm text-neutral-400 sm:hidden"
        >
          ‹ Back
        </button>
        <span className="text-xs text-neutral-500">
          {dirty || saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Saved"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onSave({ bucket: item.bucket === "done" ? "next" : "done" })
            }
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm"
          >
            {item.bucket === "done" ? "Reopen" : "Done"}
          </button>
          <button
            type="button"
            onClick={onToggleInspector}
            aria-label="Properties"
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm"
          >
            ⚙
          </button>
          <button
            type="button"
            onClick={onTrash}
            aria-label="Move to trash"
            className="rounded-lg bg-neutral-800 px-3 py-1.5 text-sm text-red-400"
          >
            🗑
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row">
        <Editor
          value={body}
          onChange={setBody}
          onAction={applyAction}
          placeholder="Title, then return for notes… (/ for commands)"
        />

        {showInspector ? (
          <aside className="border-t border-neutral-800 lg:w-64 lg:shrink-0 lg:border-l lg:border-t-0">
            <Inspector draft={draft} onChange={(changes) => onSave(changes)} />
          </aside>
        ) : null}
      </div>
    </section>
  );
}
