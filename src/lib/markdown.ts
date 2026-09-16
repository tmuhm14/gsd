/**
 * Markdown block parsing, ported from the macOS app's `Markdown` enum.
 *
 * Both clients must agree on what a line means — a checkbox ticked on the phone
 * has to read as ticked on the Mac — so this logic is duplicated deliberately
 * rather than diverging into two dialects.
 */
export type BlockKind =
  | { type: "paragraph" }
  | { type: "heading"; level: number }
  | { type: "bullet" }
  | { type: "numbered"; start: number }
  | { type: "todo"; done: boolean }
  | { type: "quote" }
  | { type: "code" }
  | { type: "divider" };

export type Classified = { kind: BlockKind; prefixLength: number };

export const INDENT_UNIT = "  ";

export function classify(line: string): Classified {
  let leading = 0;
  while (line[leading] === " ") leading += 1;
  const rest = line.slice(leading);

  if (rest.startsWith("- [ ] ")) {
    return { kind: { type: "todo", done: false }, prefixLength: leading + 6 };
  }
  if (rest.startsWith("- [x] ") || rest.startsWith("- [X] ")) {
    return { kind: { type: "todo", done: true }, prefixLength: leading + 6 };
  }
  if (rest === "---" || rest === "***") {
    return { kind: { type: "divider" }, prefixLength: leading + rest.length };
  }
  if (rest.startsWith("```")) {
    return { kind: { type: "code" }, prefixLength: leading + 3 };
  }
  if (rest.startsWith("> ")) {
    return { kind: { type: "quote" }, prefixLength: leading + 2 };
  }
  if (rest.startsWith("- ") || rest.startsWith("* ")) {
    return { kind: { type: "bullet" }, prefixLength: leading + 2 };
  }

  const hashes = /^#{1,3}(?= )/.exec(rest);
  if (hashes) {
    return {
      kind: { type: "heading", level: hashes[0].length },
      prefixLength: leading + hashes[0].length + 1,
    };
  }

  const numbered = /^(\d+)\. /.exec(rest);
  if (numbered?.[1]) {
    return {
      kind: { type: "numbered", start: Number(numbered[1]) },
      prefixLength: leading + numbered[0].length,
    };
  }

  return { kind: { type: "paragraph" }, prefixLength: leading };
}

export function stripPrefix(line: string): string {
  return line.slice(classify(line).prefixLength);
}

export function indentLevel(line: string): number {
  let spaces = 0;
  while (line[spaces] === " ") spaces += 1;
  return Math.floor(spaces / INDENT_UNIT.length);
}

/** Toggles `- [ ]` / `- [x]`, adding the marker when the line has none. */
export function toggleTodo(line: string): string {
  const indent = line.slice(0, line.length - line.trimStart().length);
  const body = line.slice(indent.length);
  if (body.startsWith("- [ ] ")) return `${indent}- [x] ${body.slice(6)}`;
  if (body.startsWith("- [x] ") || body.startsWith("- [X] ")) {
    return `${indent}- [ ] ${body.slice(6)}`;
  }
  return `${indent}- [ ] ${stripPrefix(body)}`;
}

/** Replaces a line's block marker; an empty marker makes it a paragraph. */
export function applyMarker(marker: string, line: string): string {
  const indent = line.slice(0, line.length - line.trimStart().length);
  return indent + marker + stripPrefix(line.slice(indent.length));
}

/** Toggles the checkbox on the line at `lineIndex` within a whole document. */
export function toggleTodoAtLine(body: string, lineIndex: number): string {
  const lines = body.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return body;
  lines[lineIndex] = toggleTodo(line);
  return lines.join("\n");
}

export function todoCounts(body: string): { open: number; done: number } {
  let open = 0;
  let done = 0;
  for (const line of body.split("\n")) {
    const { kind } = classify(line);
    if (kind.type === "todo") {
      if (kind.done) done += 1;
      else open += 1;
    }
  }
  return { open, done };
}

/** The body's first line is the note's title. */
export function deriveTitle(body: string): string {
  return stripPrefix(body.split("\n")[0] ?? "").trim();
}

/** The lines after the title, for list previews. */
export function snippet(body: string, maxLines = 3): string {
  return body
    .split("\n")
    .slice(1)
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .map(stripPrefix)
    .join(" · ")
    .trim();
}

/**
 * Pulls `@context` tokens out of free text. Only counts `@` at the start of a
 * word so email addresses don't become contexts.
 */
export function parseContexts(text: string): string[] {
  const found = text.match(/(^|[\s(])@([\p{L}\p{N}_-]+)/gu) ?? [];
  const names = found.map((match) =>
    match.slice(match.indexOf("@") + 1).toLowerCase(),
  );
  return [...new Set(names)];
}
