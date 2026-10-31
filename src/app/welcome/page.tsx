import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getOnboarding, loadOptions } from "@/lib/onboarding/server";
import { declaredFrom } from "@/lib/onboarding/prior";
import { STEPS, type StepKey } from "@/lib/onboarding/options";

export const metadata: Metadata = {
  title: "Welcome",
  description: "A few questions so Celpare starts with what you care about.",
  robots: { index: false },
};

/*
  The questions after sign up (phase ONB). /app sends a new account here once;
  anybody already done, or signed out, is sent on rather than shown it again.
*/
export default async function WelcomePage() {
  if (!isSupabaseConfigured()) redirect("/community");
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const state = await getOnboarding(db);
  if (!state || state.onboardedAt) redirect("/community");

  const options = await loadOptions(db);
  const a = (state.answers ?? {}) as Record<string, unknown>;
  const declared = declaredFrom(a);

  /* Resume at the first step neither answered nor skipped. */
  const skipped = Array.isArray(a.skipped) ? (a.skipped as string[]) : [];
  const answered: Record<StepKey, boolean> = {
    role: declared.role !== null,
    goals: declared.goals.length > 0,
    interests: declared.categoryIds.length + declared.topicIds.length > 0,
    tools: declared.toolIds.length > 0,
    heard: typeof a.heard_from === "string",
    people: false,
  };
  const startAt = Math.max(0, STEPS.findIndex((s) => !answered[s] && !skipped.includes(s)));

  return (
    <>
      <header className="border-b border-border">
        <Container className="flex h-[68px] items-center justify-between">
          <Logo />
          <ThemeToggle />
        </Container>
      </header>
      <main className="flex flex-1 justify-center px-4 py-10 sm:py-14">
        <div className="w-full max-w-[640px]">
          <OnboardingFlow
            startAt={startAt}
            options={options}
            initial={{
              role: declared.role,
              goals: declared.goals,
              categoryIds: declared.categoryIds,
              topicIds: declared.topicIds,
              toolIds: declared.toolIds,
              heardFrom: typeof a.heard_from === "string" ? a.heard_from : null,
              heardOther: typeof a.heard_from_other === "string" ? a.heard_from_other : "",
            }}
          />
        </div>
      </main>
    </>
  );
}
