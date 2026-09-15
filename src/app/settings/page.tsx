import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { Button, ButtonLink } from "@/components/ui/button";
import { isStaffRole, ROLE_LABEL, type Role } from "@/lib/admin/capabilities";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import {
  AskSettingsForm,
  type AskSettingsValues,
} from "@/components/ask/ask-settings-form";
import { Avatar } from "@/components/ui/avatar";
import { PLAN_LIMITS } from "@/lib/ai/config";
import { isWebSearchConfigured } from "@/lib/ai/web-search";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";
import type { Plan } from "@/lib/ai/types";

export const metadata: Metadata = {
  title: "Settings",
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
    .select("plan, ask_settings, is_developer, username, full_name, avatar_url, role")
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
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
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
        {/*
          Settings, for everything. This page used to be titled "Ask Celpare
          settings" and held only the assistant's preferences, which left the
          one place called Settings covering a single surface, and left
          developer mode with nowhere to live. Founder instruction 2026-09-14.
          Sections, one per thing a person might come here to change.
        */}
        <BackLink href="/profile" label="Back to your profile" className="mb-5" />

        <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
          Settings
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          You are on the {plan} plan, which allows {limits.messagesPerDay}{" "}
          questions a day. Limits reset at midnight.
        </p>

        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Profile</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Your name, username, picture, bio and interests. All of it is public.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Avatar
              size="md"
              fullName={profile?.full_name ?? null}
              username={profile?.username ?? ""}
              avatarUrl={profile?.avatar_url ?? null}
            />
            <div className="min-w-0">
              <p className="text-[15px] font-medium">
                {profile?.full_name?.trim() || profile?.username}
              </p>
              <p className="text-[13px] text-muted">@{profile?.username}</p>
            </div>
            <Link
              href="/profile/edit"
              className="text-[14px] underline underline-offset-4 hover:text-muted"
            >
              Edit profile
            </Link>
          </div>
        </section>

        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Ask Celpare</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            How the assistant answers you, and what it keeps.
          </p>
          <AskSettingsForm
            values={values}
            webSearchAvailable={webSearchAvailable}
            webSearchReason={webSearchReason}
          />
        </section>

        {/*
          The way in to the admin dashboard, for the people who have one.

          The sidebar now carries one too, added in Phase 4Q. This one stays
          because it does something the sidebar entry does not: it names the
          role and what it means, which is the thing somebody comes to settings
          to check. The original note here said the sidebar was impossible
          because threading a role through thirteen pages would put the link on
          some and not others. 4Q threaded the notice bar through those same
          thirteen, so the pattern is applied uniformly rather than avoided.

          isStaffRole is a render decision and grants nothing: /admin gates on
          the same role server side, and every routine behind it checks a
          capability in SQL.
        */}
        {isStaffRole(profile?.role) ? (
          <section className="mt-12 border-t border-border pt-10">
            <h2 className="font-display text-[17px] font-semibold">Administration</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-muted">
              Your account holds the {ROLE_LABEL[profile!.role as Role]} role.
            </p>
            <div className="mt-4">
              <ButtonLink href="/admin" variant="outline" size="sm">
                Open the admin dashboard
              </ButtonLink>
            </div>
          </section>
        ) : null}

      </Container>
    </AppShell>
  );
}
