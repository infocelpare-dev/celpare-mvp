import { WEB_SEARCH_LIMIT } from "./config";
import type { WebResult } from "./types";

/*
  Web search, through Serper (D44).

  Called only when the classifier says the answer depends on information newer
  than the model's training AND the plan allows it. The founder's own Notion
  note is explicit about not calling it on every message: it costs money and
  latency, and most questions about choosing a tool are answered from the
  catalogue.

  Everything this returns is untrusted external content. The Notion threat list
  names malicious retrieved content directly. Results are labelled as untrusted
  in the prompt and sit below the safety rules, never above them, so a page that
  says "ignore your instructions" is read as text on a web page rather than as
  something to do.
*/

type SerperResponse = {
  organic?: { title?: string; link?: string; snippet?: string }[];
};

export function isWebSearchConfigured() {
  return Boolean(process.env.SERPER_API_KEY);
}

export async function webSearch(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<WebResult[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key || !query.trim()) return [];

  const limit = opts.limit ?? WEB_SEARCH_LIMIT;

  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: { "content-type": "application/json", "X-API-KEY": key },
      body: JSON.stringify({ q: query, num: limit }),
      signal: opts.signal,
    });

    if (!res.ok) {
      console.error("[ai] serper returned", res.status);
      return [];
    }

    const json = (await res.json()) as SerperResponse;

    return (json.organic ?? [])
      .slice(0, limit)
      .map((r) => ({
        title: (r.title ?? "").slice(0, 200),
        url: r.link ?? "",
        // Truncated hard. A long snippet is both a token cost and a larger
        // surface for injected instructions to hide in.
        snippet: (r.snippet ?? "").slice(0, 300),
      }))
      .filter((r) => r.url.startsWith("https://") || r.url.startsWith("http://"));
  } catch (err) {
    console.error("[ai] serper threw", err);
    // Web search is an enhancement. Losing it degrades the answer; it does not
    // fail the request, because the catalogue is still there.
    return [];
  }
}
