/*
  @mentions, the parts that are plain text (founder, 2026-11-09: mentions in
  posts, comments and messages).

  ONE RULE FOR WHAT A MENTION IS, the same one the database applies when it
  records a mention and notifies the person (tg_post_intake for posts,
  tg_comment_mentions for comments): @ then 2 to 30 letters, digits or
  underscores. Here it also has to start a word (at the start of the text or
  after a space or punctuation that is not part of an address), so an email
  address like ana@celpare.com is never drawn as a mention.
*/

export const MENTION_MAX = 30;

/* A mention as it appears in text, for rendering. The lookbehind keeps
   name@example.com from matching. */
const MENTION_IN_TEXT = /(?<![\p{L}\p{N}_.@])@([A-Za-z0-9_]{2,30})(?![A-Za-z0-9_])/gu;

export type TextPart = { kind: "text"; text: string } | { kind: "mention"; username: string; text: string };

/* Splits text into plain runs and @mentions, in order, for a renderer to turn
   the mentions into profile links. */
export function splitMentions(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(MENTION_IN_TEXT)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    parts.push({ kind: "mention", username: m[1].toLowerCase(), text: m[0] });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}

/*
  The mention being typed, if the caret is at the end of one: the @ must start a
  word, and what follows it so far must be mention characters. Returns where the
  @ is and the letters typed after it (possibly none yet).
*/
export function mentionAtCaret(text: string, caret: number): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const m = /(^|[^\p{L}\p{N}_.@])@([A-Za-z0-9_]{0,30})$/u.exec(before);
  if (!m) return null;
  const start = caret - m[2].length - 1;
  return { start, query: m[2] };
}

/* Replaces the mention being typed with the chosen username and a space, and
   says where the caret goes. */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  username: string,
): { text: string; caret: number } {
  const insert = `@${username} `;
  const after = text.slice(caret).replace(/^[A-Za-z0-9_]+/, "");
  const next = text.slice(0, start) + insert + after.replace(/^ /, "");
  return { text: next, caret: start + insert.length };
}
