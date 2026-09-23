import {
  MAX_ITEMS,
  isGoal,
  type CompareGoal,
  type CompareItemType,
  type CompareRef,
} from "@/lib/compare/types";

/*
  The comparison lives in the URL, and only there.

  ONE ROUTE, ONE PARAMETER. `/compare?items=tool:cursor,model:gpt-4o&goal=coding`.
  The order in the list IS the column order, so a shared link reproduces the
  comparison exactly, and adding, removing or moving an item is a URL change the
  back button can undo. There is no client store to fall out of step with it.

  THE TYPE PREFIX IS NOT DECORATION. Tool and model slugs are separate namespaces
  and do collide: the catalogue has a tool called Claude and models called
  Claude, and a bare `claude` could mean either.

  `?a=` and `?b=` are still read, as tool slugs, because Ask Celpare's
  recommendation cards have linked `/compare?a=<slug>` since Phase 4E and those
  links are in people's saved chats. They are folded into `items` on the first
  change and never written again.

  Pure, with no server import, so the builder in the browser and the page on the
  server parse the same way.
*/

const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;

function parseOne(raw: string): CompareRef | null {
  const [prefix, ...rest] = raw.trim().toLowerCase().split(":");
  const slug = rest.join(":");
  if (prefix !== "tool" && prefix !== "model") return null;
  if (!SLUG.test(slug)) return null;
  return { type: prefix as CompareItemType, slug };
}

export function refKey(ref: CompareRef): string {
  return `${ref.type}:${ref.slug}`;
}

/*
  Duplicates are dropped here, at the one door every ref comes through, so no
  later stage has to wonder whether the same tool can fill two columns. The
  first occurrence wins, which keeps the order the person chose.
*/
export function parseRefs(params: {
  items?: string | string[];
  a?: string | string[];
  b?: string | string[];
}): CompareRef[] {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const raw: string[] = [];

  const items = first(params.items);
  if (items) raw.push(...items.split(","));
  for (const legacy of [first(params.a), first(params.b)]) {
    if (legacy) raw.push(`tool:${legacy}`);
  }

  const seen = new Set<string>();
  const out: CompareRef[] = [];
  for (const r of raw) {
    const ref = parseOne(r);
    if (!ref) continue;
    const key = refKey(ref);
    if (seen.has(key)) continue;
    /* The ceiling is per tab: six tools and six models can share a URL. */
    if (out.filter((r) => r.type === ref.type).length === MAX_ITEMS) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function parseGoal(value: string | string[] | undefined): CompareGoal | null {
  const v = Array.isArray(value) ? value[0] : value;
  return isGoal(v) ? v : null;
}

/*
  Which tab is showing. Tools and Models are two separate comparisons that share
  one URL: `items` can hold both kinds, and each tab shows only its own, so
  switching tab never throws away what was picked on the other one.

  With no `view`, the tab follows the first item, so an old link or an entry
  point that only passes `items` lands on the right tab.
*/
export type CompareView = "tools" | "models";

export function viewType(view: CompareView): CompareItemType {
  return view === "models" ? "model" : "tool";
}

export function parseView(value: string | string[] | undefined, refs: CompareRef[]): CompareView {
  const v = Array.isArray(value) ? value[0] : value;
  if (v === "tools" || v === "models") return v;
  return refs[0]?.type === "model" ? "models" : "tools";
}

/* The canonical URL for a comparison. Commas and colons are left readable: both
   are legal in a query value, and a link somebody can read is a link somebody
   trusts enough to open. */
export function compareHref(
  refs: CompareRef[],
  goal: CompareGoal | null = null,
  view: CompareView | null = null,
): string {
  const parts: string[] = [];
  if (view) parts.push(`view=${view}`);
  if (refs.length > 0) parts.push(`items=${refs.map(refKey).join(",")}`);
  if (goal) parts.push(`goal=${goal}`);
  return parts.length > 0 ? `/compare?${parts.join("&")}` : "/compare";
}
