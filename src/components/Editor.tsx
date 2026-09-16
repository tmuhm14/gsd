"use client";

import { useEffect, useRef, useState } from "react";
import {
  activeSlashQuery,
  filterCommands,
  type SlashAction,
  type SlashCommand,
} from "@/lib/slashCommands";
import { applyMarker, indentLevel, INDENT_UNIT, classify } from "@/lib/markdown";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onAction: (action: SlashAction) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

/**
 * A plain textarea with a Notion-style `/` palette layered on top.
 *
 * The document stays markdown — the first line is the title, and a line's
 * leading marker is its block type — so what's typed here is byte-identical to
 * what the macOS app writes.
 */
export function Editor({
  value,
  onChange,
  onAction,
  placeholder,
  autoFocus,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [menuQuery, setMenuQuery] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const commands = menuQuery === null ? [] : filterCommands(menuQuery);
  const menuOpen = menuQuery !== null && commands.length > 0;

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  function syncMenu(text: string, caret: number) {
    const session = activeSlashQuery(text, caret);
    setMenuQuery(session ? session.query : null);
    setSelected(0);
  }

  function apply(command: SlashCommand) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const caret = textarea.selectionStart;
    const session = activeSlashQuery(value, caret);
    // Strip the "/query" the user typed before doing anything else.
    const withoutQuery = session
      ? value.slice(0, session.start) + value.slice(caret)
      : value;
    const cursor = session ? session.start : caret;

    setMenuQuery(null);

    if (command.action.type === "marker" || command.action.type === "insert") {
      const next =
        command.action.type === "insert"
          ? withoutQuery.slice(0, cursor) +
            command.action.text +
            withoutQuery.slice(cursor)
          : rewriteLineAt(withoutQuery, cursor, command.action.marker);

      onChange(next);
      queueMicrotask(() => {
        textarea.focus();
        const offset =
          command.action.type === "insert"
            ? cursor + command.action.text.length
            : next.length - (withoutQuery.length - cursor);
        textarea.setSelectionRange(offset, offset);
      });
      return;
    }

    onChange(withoutQuery);
    onAction(command.action);
    queueMicrotask(() => textarea.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((index) => (index + 1) % commands.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((index) => (index - 1 + commands.length) % commands.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const command = commands[selected] ?? commands[0];
        if (command) {
          event.preventDefault();
          apply(command);
          return;
        }
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuQuery(null);
        return;
      }
    }

    if (event.key === "Tab") {
      event.preventDefault();
      shiftIndent(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Enter") {
      const textarea = event.currentTarget;
      const continuation = listContinuation(value, textarea.selectionStart);
      if (continuation !== null) {
        event.preventDefault();
        const caret = textarea.selectionStart;
        const next =
          value.slice(0, caret) + continuation + value.slice(textarea.selectionEnd);
        onChange(next);
        queueMicrotask(() => {
          const offset = caret + continuation.length;
          textarea.setSelectionRange(offset, offset);
        });
      }
    }
  }

  function shiftIndent(direction: 1 | -1) {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const { selectionStart, selectionEnd } = textarea;
    const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
    const lineEndIndex = value.indexOf("\n", selectionEnd);
    const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;

    const block = value.slice(lineStart, lineEnd);
    const shifted = block
      .split("\n")
      .map((line) =>
        direction > 0
          ? INDENT_UNIT + line
          : line.startsWith(INDENT_UNIT)
            ? line.slice(INDENT_UNIT.length)
            : line,
      )
      .join("\n");

    if (shifted === block) return;

    const next = value.slice(0, lineStart) + shifted + value.slice(lineEnd);
    const delta = shifted.length - block.length;
    onChange(next);
    queueMicrotask(() => {
      textarea.focus();
      textarea.setSelectionRange(
        Math.max(lineStart, selectionStart + (direction > 0 ? INDENT_UNIT.length : -INDENT_UNIT.length)),
        selectionEnd + delta,
      );
    });
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <textarea
        ref={textareaRef}
        value={value}
        placeholder={placeholder}
        spellCheck
        onChange={(event) => {
          onChange(event.target.value);
          syncMenu(event.target.value, event.target.selectionStart);
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => setMenuQuery(null)}
        className="min-h-[50vh] w-full flex-1 resize-none bg-transparent p-4 text-base leading-relaxed outline-none placeholder:text-neutral-600"
      />

      {menuOpen ? (
        <div className="absolute bottom-3 left-3 right-3 max-h-64 overflow-y-auto rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-2xl backdrop-blur sm:right-auto sm:w-80">
          {commands.map((command, index) => (
            <button
              key={command.id}
              type="button"
              // onMouseDown, not onClick: onBlur would close the menu first.
              onMouseDown={(event) => {
                event.preventDefault();
                apply(command);
              }}
              className={`flex w-full flex-col items-start px-3 py-2 text-left ${
                index === selected ? "bg-violet-600" : "hover:bg-neutral-800"
              }`}
            >
              <span className="text-sm font-medium">{command.title}</span>
              <span
                className={`text-xs ${index === selected ? "text-violet-100" : "text-neutral-400"}`}
              >
                {command.subtitle}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Replaces the block marker on the line containing `cursor`. */
function rewriteLineAt(text: string, cursor: number, marker: string): string {
  const lineStart = text.lastIndexOf("\n", cursor - 1) + 1;
  const lineEndIndex = text.indexOf("\n", cursor);
  const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  return text.slice(0, lineStart) + applyMarker(marker, line) + text.slice(lineEnd);
}

/**
 * What Enter should insert to continue the current list, or null to let the
 * textarea handle it normally.
 */
export function listContinuation(text: string, caret: number): string | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const line = text.slice(lineStart, caret);
  const { kind, prefixLength } = classify(line);

  let marker: string;
  switch (kind.type) {
    case "bullet":
      marker = "- ";
      break;
    case "todo":
      marker = "- [ ] ";
      break;
    case "numbered":
      marker = `${kind.start + 1}. `;
      break;
    case "quote":
      marker = "> ";
      break;
    default:
      return null;
  }

  // An empty list item means "get me out of this list".
  if (line.length <= prefixLength) return null;

  return "\n" + INDENT_UNIT.repeat(indentLevel(line)) + marker;
}
