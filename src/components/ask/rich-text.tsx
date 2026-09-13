"use client";

import { Fragment, useState } from "react";
import { Check, Copy } from "lucide-react";

/*
  A small markdown renderer for model output.

  Deliberately not a markdown library. It covers what the model actually emits
  under this prompt: paragraphs, bullet and numbered lists, headings, fenced
  code, inline code, bold, italic and links. Anything else arrives as plain
  text, which is the right failure: unrendered markdown is readable, and a
  parser that tries to do everything is a much larger surface to get wrong.

  It builds React elements rather than HTML, so there is no
  dangerouslySetInnerHTML anywhere near model output. That matters more than the
  feature set: Layer 3 exists because what the model emits is untrusted, and
  handing it a raw HTML channel would undo it.

  Link hrefs are filtered to http and https for the same reason. A javascript:
  or data: URL in a link the model wrote is a script the model chose to run.
*/

/* Order matters: the two star form has to be tried before the one star form,
   or `**bold**` matches as an empty italic followed by text. Links are matched
   before both, so a bold word inside a link label does not split the link. */
const TOKEN =
  /(\[[^\]\n]+\]\((?:https?:\/\/|\/)[^\s)]+\)|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|https?:\/\/[^\s<>()]+)/g;

function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (href.startsWith("/")) return href;
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function Anchor({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = safeHref(href);
  if (!safe) return <>{children}</>;

  const external = safe.startsWith("http");

  return (
    <a
      href={safe}
      {...(external
        ? // noreferrer as well as noopener: a link the model produced from a
          // web result has no business knowing where the visitor came from.
          { target: "_blank", rel: "noopener noreferrer nofollow" }
        : {})}
      className="underline underline-offset-2 transition-colors duration-200 hover:text-muted"
    >
      {children}
    </a>
  );
}

function inline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(TOKEN).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (!part) return <Fragment key={key} />;

    const link = part.match(/^\[([^\]\n]+)\]\((.+)\)$/);
    if (link) {
      return (
        <Anchor key={key} href={link[2]}>
          {link[1]}
        </Anchor>
      );
    }

    if (/^https?:\/\//.test(part)) {
      return (
        <Anchor key={key} href={part}>
          {part.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </Anchor>
      );
    }

    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (
      part.startsWith("*") &&
      part.endsWith("*") &&
      !part.startsWith("**") &&
      part.length > 2
    ) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={key}
          className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.9em]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

/* Code, with its own copy button. Copying a snippet by selecting it in a
   streaming transcript is a fight; a button is not. */
function CodeBlock({ code, lang }: { code: string; lang: string | null }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access can be refused. The code is on screen and selectable,
      // so this is a convenience that failed, not an error worth showing.
    }
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border first:mt-0">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">
          {lang || "code"}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] text-muted transition-colors duration-200 hover:text-foreground"
        >
          {copied ? (
            <Check className="size-3 text-accent" aria-hidden />
          ) : (
            <Copy className="size-3" aria-hidden />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* The one place a horizontal scrollbar is allowed: a long line of code
          must not stretch the page. */}
      <pre className="overflow-x-auto px-3 py-3">
        <code className="font-mono text-[13px] leading-relaxed">{code}</code>
      </pre>
    </div>
  );
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "h"; level: 2 | 3; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "code"; code: string; lang: string | null };

/*
  Line based, because the text arrives a token at a time and a half written
  document has to render sensibly. An unterminated code fence, for example,
  renders as a code block rather than as nothing: mid stream that is exactly
  what it is.
*/
function parse(text: string): Block[] {
  const lines = text.split("\n");
  const blocks: Block[] = [];
  let i = 0;

  const flushParagraph = (buffer: string[]) => {
    if (buffer.length) blocks.push({ kind: "p", lines: [...buffer] });
    buffer.length = 0;
  };

  const paragraph: string[] = [];

  while (i < lines.length) {
    const line = lines[i];

    const fence = line.match(/^\s*```(\w+)?\s*$/);
    if (fence) {
      flushParagraph(paragraph);
      const lang = fence[1] ?? null;
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i += 1;
      }
      i += 1; // the closing fence, if it arrived
      blocks.push({ kind: "code", code: code.join("\n"), lang });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushParagraph(paragraph);
      blocks.push({
        kind: "h",
        level: heading[1].length <= 2 ? 2 : 3,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      flushParagraph(paragraph);
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!next) break;
        items.push(next[1]);
        i += 1;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      flushParagraph(paragraph);
      const items: string[] = [];
      while (i < lines.length) {
        const next = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!next) break;
        items.push(next[1]);
        i += 1;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph(paragraph);
      i += 1;
      continue;
    }

    paragraph.push(line);
    i += 1;
  }

  flushParagraph(paragraph);
  return blocks;
}

export function RichText({ text }: { text: string }) {
  const blocks = parse(text);

  return (
    <>
      {blocks.map((block, b) => {
        if (block.kind === "code") {
          return <CodeBlock key={b} code={block.code} lang={block.lang} />;
        }

        if (block.kind === "h") {
          const Tag = block.level === 2 ? "h2" : "h3";
          return (
            <Tag
              key={b}
              className="mt-5 font-display text-[16px] font-semibold first:mt-0"
            >
              {inline(block.text, `h-${b}`)}
            </Tag>
          );
        }

        if (block.kind === "ul" || block.kind === "ol") {
          const Tag = block.kind === "ul" ? "ul" : "ol";
          return (
            <Tag
              key={b}
              className={
                block.kind === "ul"
                  ? "mt-3 space-y-1.5 first:mt-0"
                  : "mt-3 list-inside list-decimal space-y-1.5 first:mt-0"
              }
            >
              {block.items.map((item, n) => (
                <li
                  key={n}
                  className={
                    block.kind === "ul"
                      ? "relative pl-4 leading-relaxed before:absolute before:left-0 before:top-[0.7em] before:size-1.5 before:rounded-full before:bg-accent before:content-['']"
                      : "leading-relaxed"
                  }
                >
                  {inline(item, `li-${b}-${n}`)}
                </li>
              ))}
            </Tag>
          );
        }

        return (
          <p key={b} className="mt-3 leading-relaxed first:mt-0">
            {block.lines.map((lineText, l) => (
              <Fragment key={l}>
                {l > 0 ? <br /> : null}
                {inline(lineText, `${b}-${l}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}
