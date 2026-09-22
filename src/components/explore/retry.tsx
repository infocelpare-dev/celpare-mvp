"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
  Try one failed section again.

  router.refresh() re-runs the server components for this route and swaps the
  result in, so only the sections that failed are re-read and the page is not
  reloaded. That matters here: reloading would throw away the ten sections that
  DID load, which is the opposite of what isolating a failure was for.

  It is a client component because it needs the router and a pending state, and
  it is the ONLY client component a failed section mounts. Everything else in
  Explore is server rendered.

  The pending state is announced rather than only drawn, because a person using a
  screen reader gets no signal at all from a spinning icon.
*/
export function SectionRetry({ label }: { label: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        <RotateCw className="size-4" aria-hidden />
        Try again
        <span className="sr-only">loading {label}</span>
      </Button>
      <span role="status" aria-atomic="true" className="text-[13px] text-muted">
        {pending ? "Loading" : ""}
      </span>
    </div>
  );
}
