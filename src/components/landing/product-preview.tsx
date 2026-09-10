import { Search, Sparkles } from "lucide-react";

/*
  Static preview of the product, per the ui-ux-pro-max "Product Demo + Features"
  pattern: hero, then a product mockup in the centre, then features.

  It is decorative, so it is hidden from assistive tech. It is a mockup and not
  a live search, and the caption underneath says so. Selling a screenshot as a
  working feature is how landing pages start lying.
*/
const results = [
  {
    name: "Opus Clip",
    category: "Video repurposing",
    why: "Auto-cuts long video into vertical clips with captions",
    match: "Best match",
  },
  {
    name: "Descript",
    category: "Video and audio editing",
    why: "Edit video by editing the transcript, then export shorts",
    match: "Strong",
  },
  {
    name: "Vizard",
    category: "Video repurposing",
    why: "Batch clipping with a generous free tier",
    match: "Budget pick",
  },
];

export function ProductPreview() {
  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div
        aria-hidden
        className="overflow-hidden rounded-[16px] border border-border bg-surface text-left"
      >
        {/* window chrome */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-3 font-mono text-[11px] text-muted">
            celpare.com/search
          </span>
        </div>

        <div className="p-4 sm:p-6">
          {/* query */}
          <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3">
            <Search className="h-4 w-4 shrink-0 text-muted" />
            <span className="truncate text-[14px] text-foreground">
              turn my long videos into TikTok clips
            </span>
          </div>

          {/* AI summary line */}
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border bg-background px-4 py-3">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
            <p className="text-[13px] leading-relaxed text-muted">
              <span className="font-medium text-foreground">Ask Celpare:</span>{" "}
              3 tools do this well. They differ on batch limits and caption
              quality, so the right one depends on how much you publish.
            </p>
          </div>

          {/* results */}
          <ul className="mt-4 space-y-2.5">
            {results.map((r) => (
              <li
                key={r.name}
                className="flex items-start justify-between gap-4 rounded-xl border border-border bg-background px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-display text-[14px] font-semibold">
                    {r.name}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted">
                    {r.category}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted">
                    {r.why}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-accent px-2.5 py-1 text-[11px] font-medium text-on-accent">
                  {r.match}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-3 text-center text-[12px] text-muted">
        A preview of Celpare search. Tool data shown is illustrative.
      </p>
    </div>
  );
}
