import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import {
  AskSettingsForm,
  type AskSettingsValues,
} from "@/components/ask/ask-settings-form";
import { PLAN_LIMITS } from "@/lib/ai/config";
import { isWebSearchConfigured } from "@/lib/ai/web-search";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import type { Plan } from "@/lib/ai/types";

export const metadata: Metadata = {
  title: "Ask Celpare settings",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Settings belong to an account. A signed out visitor has nothing to change,
  // so send them to the gate rather than showing a form that cannot save.
  if (!user) redirect("/get-started");

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, ask_settings")
    .eq("id", user.id)
    .maybeSingle();

  const plan = (profile?.plan ?? "free") as Plan;
  const limits = PLAN_LIMITS[plan];
  const stored = (profile?.ask_settings ?? {}) as Partial<AskSettingsValues>;

  const values: AskSettingsValues = {
    answerLength: stored.answerLength ?? "balanced",
    webSearch: stored.webSearch ?? true,
    saveHistory: stored.saveHistory ?? true,
  };

  /* Two different reasons web search can be unavailable, and saying which one
     is the difference between "upgrade" and "wait for us". */
  const webSearchAvailable = limits.webSearch && isWebSearchConfigured();
  const webSearchReason = !limits.webSearch
    ? `Web search is available on Pro and Premium. You are on the ${plan} plan.`
    : "Web search is not switched on yet. It needs a search provider key.";

  return (
    <AppShell
      signedIn
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      <Container className="max-w-[640px] py-10 sm:py-14">
        <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
          Ask Celpare settings
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          You are on the {plan} plan, which allows {limits.messagesPerDay}{" "}
          questions a day. Limits reset at midnight.
        </p>

        <AskSettingsForm
          values={values}
          webSearchAvailable={webSearchAvailable}
          webSearchReason={webSearchReason}
        />
      </Container>
    </AppShell>
  );
}
