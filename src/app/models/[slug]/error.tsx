"use client";

import { Container } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";

/* A failed read says so and offers a way on (D99, D109): never an empty page
   that looks like a model with nothing recorded. */
export default function ModelError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Container className="max-w-[820px] py-16">
      <h1 className="font-display text-[24px] font-semibold">This model could not be loaded</h1>
      <p className="mt-2 text-[15px] text-muted">The catalogue did not answer just now. Nothing is wrong with your account.</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
        <ButtonLink href="/explore?tab=models" variant="outline">
          Browse models
        </ButtonLink>
      </div>
    </Container>
  );
}
