import {
  RESEARCH_PAGE_CHARS,
  RESEARCH_PAGE_MAX_BYTES,
  RESEARCH_PAGE_TIMEOUT_MS,
} from "../config";

/*
  Reading a web page for deep research (phase DR, D231).

  The URL came from a search result, which is untrusted, so the fetch is the
  dangerous part: a result pointing at a private address would make Celpare's
  server request its own network. Only https on a public looking hostname, no
  IP literals, redirects followed by hand and each hop checked again, a timeout,
  a byte cap, text types only.

  What comes back is text for the UNTRUSTED web block, never instructions. On
  any failure the caller keeps the search snippet.
*/

const BLOCKED_SUFFIXES = [".local", ".internal", ".lan", ".localhost", ".home", ".corp", ".intranet"];
const MAX_REDIRECTS = 3;

export function isSafeUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  if (u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".")) return false;
  if (host === "localhost" || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return false;
  /* IPv4 literal, or any IPv6 literal (URL keeps the brackets). */
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false;
  /* Numeric hosts written other ways ("0x7f.1", "2130706433"). */
  if (/^(0x[0-9a-f]+|\d+)(\.(0x[0-9a-f]+|\d+))*$/i.test(host)) return false;
  return true;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function htmlToText(html: string, maxChars = RESEARCH_PAGE_CHARS): string {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const decoded = `${title}\n${body}`
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n) < 0x110000 ? Number(n) : 32))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16) < 0x110000 ? parseInt(n, 16) : 32))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
  return decoded
    .split("\n")
    .map((l) => l.replace(/[ \t\f\v\r]+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n")
    .slice(0, maxChars);
}

async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  const buf = new Uint8Array(Math.min(total, maxBytes));
  let at = 0;
  for (const c of chunks) {
    const take = Math.min(c.byteLength, buf.byteLength - at);
    if (take <= 0) break;
    buf.set(c.subarray(0, take), at);
    at += take;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

/* The page's readable text, or null. Never throws. */
export async function fetchPageText(
  url: string,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? RESEARCH_PAGE_TIMEOUT_MS);
  let current = url;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!isSafeUrl(current)) return null;
      const res = await doFetch(current, {
        redirect: "manual",
        signal,
        headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "CelpareResearch/1.0 (+https://celpare.com)" },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = res.headers.get("location");
        if (!next) return null;
        current = new URL(next, current).href;
        continue;
      }
      if (!res.ok) return null;
      const type = (res.headers.get("content-type") ?? "").toLowerCase();
      if (!type.includes("text/html") && !type.includes("text/plain")) return null;
      const raw = await readCapped(res, RESEARCH_PAGE_MAX_BYTES);
      const text = type.includes("text/html") ? htmlToText(raw) : raw.slice(0, RESEARCH_PAGE_CHARS);
      return text.trim().length >= 200 ? text : null;
    }
    return null;
  } catch {
    return null;
  }
}
