/**
 * Flattens Atlassian Document Format to plain text.
 *
 * Jira Cloud's v3 API returns descriptions and comments as ADF — a nested
 * node tree, not a string. Without this, a description arrives as `[object
 * Object]` or unreadable JSON, and the model reasons about punctuation.
 */
type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
};

export function adfToText(node: unknown, depth = 0): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) {
    return node.map((child) => adfToText(child, depth)).join("");
  }
  if (typeof node !== "object") return String(node);

  const adf = node as AdfNode;
  const children = () => adfToText(adf.content ?? [], depth);

  switch (adf.type) {
    case "text":
      return adf.text ?? "";

    // A mention's display text lives in attrs, not a child text node.
    case "mention":
      return typeof adf.attrs?.text === "string" ? adf.attrs.text : "@unknown";

    case "emoji":
      return typeof adf.attrs?.shortName === "string" ? adf.attrs.shortName : "";

    case "hardBreak":
      return "\n";

    case "rule":
      return "\n---\n";

    case "paragraph":
    case "heading":
      return `${children()}\n`;

    case "listItem":
      return `${"  ".repeat(Math.max(0, depth - 1))}- ${children().trim()}\n`;

    case "bulletList":
    case "orderedList":
      return adfToText(adf.content ?? [], depth + 1);

    case "codeBlock":
      return `\n\`\`\`\n${children().trim()}\n\`\`\`\n`;

    case "blockquote":
      return children()
        .trim()
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
        .concat("\n");

    case "table":
    case "tableRow":
      return `${children()}\n`;

    case "tableCell":
    case "tableHeader":
      return `${children().trim()} | `;

    // Attachments and embeds carry no text worth passing on.
    case "media":
    case "mediaSingle":
    case "mediaGroup":
      return "";

    default:
      return children();
  }
}

/** Collapses the runs of blank lines that flattening tends to leave behind. */
export function tidy(text: string, maxLength: number): string {
  const collapsed = text.replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.length > maxLength
    ? `${collapsed.slice(0, maxLength)}\n…[truncated]`
    : collapsed;
}
