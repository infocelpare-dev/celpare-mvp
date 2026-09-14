"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormAlert } from "@/components/ui/field";
import { becomeDeveloper, declineDeveloper, type DeveloperState } from "@/app/actions/developer";

/*
  The developer terms, gated on actually reaching the end of them.

  Agree stays disabled until the text has been scrolled to the bottom. That is
  a deliberate friction: an agreement nobody could have read is not an
  agreement, and this is the one screen in the product where slowing somebody
  down is the correct behaviour.

  Two things it does NOT do, because both would make the gate theatre:
  it does not auto scroll for you, and it does not unlock on a timer.

  The one case that needs care: if the text is short enough to fit without
  scrolling, there is nothing to scroll and the button would never unlock. So
  reaching the end is measured, not assumed, and a pane that does not overflow
  counts as already read.
*/

const SECTIONS: { heading: string; body: string[] }[] = [
  {
    heading: "What Celpare is",
    body: [
      "Celpare is a catalogue people use to choose an AI tool. Entries are read by people making a decision, and by the Celpare assistant when it answers questions. A developer entry is a record other people rely on, which is why every submission is reviewed before it is published.",
    ],
  },
  {
    heading: "One account",
    body: [
      "Developer Mode is a switch on the Celpare account you already have. It is not a separate kind of signup and it is not a role. You remain an ordinary Celpare user with the same plan, the same permissions and the same profile.",
    ],
  },
  {
    heading: "What you can do",
    body: [
      "Submit AI tools you build or officially represent, and AI models you own or represent.",
      "Edit your own submissions while they are a draft, or when a review has asked for changes.",
      "Send a submission for review and see exactly where it is in the queue.",
      "Keep a public developer profile: your handle, what you build, and your links. It is separate from your personal Celpare profile, so it can be your company rather than you.",
    ],
  },
  {
    heading: "What you cannot do",
    body: [
      "You cannot approve, verify or publish your own submissions. Review is done by Celpare. This is not a policy that relies on good behaviour: the database refuses a self approval outright, and the fields that control publication are not writable by any account.",
      "You cannot see, edit or submit another developer's tools or models, including their drafts.",
      "You cannot change your own role, plan or permissions. Developer Mode is not an admin role and grants no moderation ability.",
      "You cannot submit something you do not build or officially represent.",
    ],
  },
  {
    heading: "What is expected of a submission",
    body: [
      "Describe the tool accurately. Pricing and features are read by people deciding what to use, and quoting a price that has moved is worse than quoting none.",
      "Keep entries current. An out of date entry damages the person who trusted it and the tool it describes.",
      "One entry per tool. Duplicates are rejected.",
      "No misleading claims, no invented benchmarks, and no describing a competitor's product as your own.",
    ],
  },
  {
    heading: "Review, and what happens to a submission",
    body: [
      "A new submission is a private draft. Nothing is visible to anyone else until you send it for review and Celpare approves it.",
      "While a submission is in review you cannot edit it, because a reviewer reading a record that changes underneath them is not a review.",
      "A review can approve it, reject it, or send it back asking for changes. Sent back, it becomes editable again.",
      "Celpare can unpublish an entry later if it becomes inaccurate or if it breaks these terms.",
    ],
  },
  {
    heading: "Turning Developer Mode off",
    body: [
      "You can turn Developer Mode off at any time while you have nothing in the catalogue. Once you have submitted a tool or a model it stays on, because those records exist and remain attributed to you. Ask Celpare if you need an entry removed.",
    ],
  },
  {
    heading: "Honesty about these terms",
    body: [
      "Celpare has not published full legal terms, a privacy policy or a data policy yet. This page is a plain statement of how the developer area works, and it is the same boundary the database actually enforces. When formal terms exist you will be asked to read and accept those instead.",
    ],
  },
];

export function TermsGate() {
  const [state, action, pending] = useActionState<DeveloperState, FormData>(
    becomeDeveloper,
    { status: "idle", message: "" },
  );

  const paneRef = useRef<HTMLDivElement>(null);
  const [readToEnd, setReadToEnd] = useState(false);

  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;

    function check() {
      if (!pane) return;
      // A pane that does not overflow has no end to reach, so it counts as read.
      const noScrollNeeded = pane.scrollHeight <= pane.clientHeight + 1;
      const atBottom =
        pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 24;
      if (noScrollNeeded || atBottom) setReadToEnd(true);
    }

    check();
    pane.addEventListener("scroll", check, { passive: true });
    // Fonts and a resize both change where the bottom is.
    const ro = new ResizeObserver(check);
    ro.observe(pane);
    return () => {
      pane.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, []);

  return (
    <div>
      {state.status === "error" && state.message ? (
        <div className="mb-5">
          <FormAlert tone="error">{state.message}</FormAlert>
        </div>
      ) : null}

      <div className="relative">
        <div
          ref={paneRef}
          tabIndex={0}
          role="region"
          aria-label="Developer terms"
          className="h-[min(56vh,520px)] overflow-y-auto rounded-2xl border border-border px-5 py-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-7"
        >
          {SECTIONS.map((section, i) => (
            <section key={section.heading} className={i === 0 ? "" : "mt-8"}>
              <h2 className="font-display text-[17px] font-semibold">
                {section.heading}
              </h2>
              {section.body.map((para) => (
                <p key={para} className="mt-2.5 text-[15px] leading-relaxed text-muted">
                  {para}
                </p>
              ))}
            </section>
          ))}

          <p className="mt-10 border-t border-border pt-5 text-[13px] text-muted">
            That is the end of the terms.
          </p>
        </div>

        {/* A fade, so a pane that continues looks like it continues. */}
        {!readToEnd ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-px bottom-px h-20 rounded-b-2xl bg-gradient-to-t from-background to-transparent"
          />
        ) : null}
      </div>

      <p
        role="status"
        aria-atomic="true"
        className="mt-3 flex items-center gap-2 text-[13px] text-muted"
      >
        {readToEnd ? (
          "You have read to the end."
        ) : (
          <>
            <ArrowDown className="size-4 shrink-0" aria-hidden />
            Scroll to the end to continue.
          </>
        )}
      </p>

      <form action={action} className="mt-6">
        <input type="hidden" name="agree" value="on" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={!readToEnd || pending}>
            {pending ? "Setting up" : "I agree, become a developer"}
          </Button>

          <Button
            type="submit"
            variant="outline"
            formAction={declineDeveloper}
            disabled={pending}
          >
            I do not agree
          </Button>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-muted">
          Declining changes nothing. You stay an ordinary Celpare account and go
          back to your profile.
        </p>
      </form>
    </div>
  );
}
