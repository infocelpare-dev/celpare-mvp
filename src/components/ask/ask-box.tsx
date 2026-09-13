"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

/*
  The entry point to Ask Celpare from elsewhere in the product.

  A real input that carries the question through to /ask, not a decorative box
  that throws the question away and makes you type it again. The landing hero
  made the same call for the same reason: a search field that returns nothing is
  worse than no search field.
*/
export function AskBox({ autoFocus = false }: { autoFocus?: boolean }) {
  const [value, setValue] = useState("");
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/ask?q=${encodeURIComponent(q.slice(0, 500))}` : "/ask");
  }

  return (
    <form onSubmit={submit} className="w-full">
      <label htmlFor="ask-box" className="sr-only">
        Ask Celpare about AI tools, models, tech or SaaS
      </label>

      <div className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 focus-within:border-foreground">
        <input
          id="ask-box"
          type="text"
          value={value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          placeholder="What are you trying to do?"
          className="min-w-0 flex-1 bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-muted"
        />
        <Button type="submit" size="sm" aria-label="Ask Celpare" className="aspect-square shrink-0 px-0">
          <ArrowUp className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
