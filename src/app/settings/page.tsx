import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { ButtonLink } from "@/components/ui/button";
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
import { PrivacyForm } from "@/components/settings/privacy-form";
import { ClearRecent } from "@/components/profile/clear-recent";
import { ThemeChoice } from "@/components/ui/theme-choice";
import type { PrivacyValues } from "@/app/actions/settings";
import type { Plan } from "@/lib/ai/types";

const PLAN_LABEL: Record<Plan, string> = {
  /* `anon` is a plan in the AI gateway's sense, a signed out asker. It cannot
     occur here because this page redirects a signed out visitor, but Plan
     includes it so the map has to. */
  anon: "Free",
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};

/* Suspension is evaluated on read, because there is no scheduler to flip it
   (D79). account_status can still say suspended after the date has passed, so
   this never claims more than the column does. */
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  suspended: "Suspended",
  banned: "Banned",
  deleted: "Closed",
};

/* Pinned to UTC. Without a timeZone this formats in the runtime's own zone, and
   the server and the browser are not always in the same one, which caused a
   real hydration error on /admin/security. */
function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium">{value}</dd>
    </div>
  );
}

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
    .select(
      "plan, ask_settings, is_developer, username, full_name, avatar_url, role, created_at, account_status, is_private, show_replies, show_follows, show_saved_tools, show_saved_models",
    )
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

  /*
    The email comes from the auth session, NOT from profiles.

    profiles.email is not in the SELECT grant for authenticated at all, so it
    cannot reach a page even by mistake, and that is worth keeping. The address
    on the session is the same value and is already the caller's own.
  */
  const email = user.email ?? null;

  const privacy: PrivacyValues = {
    isPrivate: profile?.is_private ?? false,
    showReplies: profile?.show_replies ?? true,
    showFollows: profile?.show_follows ?? true,
    showSavedTools: profile?.show_saved_tools ?? false,
    showSavedModels: profile?.show_saved_models ?? false,
  };

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn
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

        {/*
          Profile and account, the first section, founder instruction
          2026-09-18: somebody who opens Settings and touches Profile should
          find their actual account details there, not a link away from them.

          Everything in the facts list is read only. The email cannot be
          changed here because changing an email means re-verifying it, which
          is an auth flow that does not exist yet, and a field that looks
          editable and is not is worse than no field.
        */}
        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Profile and account</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Who you are on Celpare, and what the account itself says.
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-4">
            <Avatar
              size="md"
              fullName={profile?.full_name ?? null}
              username={profile?.username ?? ""}
              avatarUrl={profile?.avatar_url ?? null}
            />
            <div className="min-w-0 flex-1">
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

          <dl className="mt-5 divide-y divide-border rounded-2xl border border-border text-[14px]">
            <Fact label="Email" value={email ?? "Not set"} />
            <Fact
              label="Account created"
              value={profile?.created_at ? longDate(profile.created_at) : "Unknown"}
            />
            <Fact label="Plan" value={PLAN_LABEL[plan]} />
            <Fact
              label="Profile visibility"
              value={privacy.isPrivate ? "Private" : "Public"}
            />
            <Fact label="Status" value={STATUS_LABEL[profile?.account_status ?? "active"] ?? "Active"} />
          </dl>

          <p className="mt-3 text-[13px] leading-relaxed text-muted">
            Your name, username, picture, bio and interests are public whenever
            your account is. The email is yours alone: it is never shown on your
            profile and is not readable by anybody else.
          </p>
        </section>

        {/*
          Privacy. Its own section rather than four checkboxes inside Profile,
          because "who is this" and "who may see it" are different questions and
          the second one is the one people come here worried about.
        */}
        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Privacy</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            What a visitor to your profile can see. Every one of these is
            enforced in the database, not just hidden on the page.
          </p>
          <PrivacyForm values={privacy} />
        </section>

        {/*
          Appearance. Founder instruction 2026-09-19: the theme control came out
          of the top bar of every page and lives here, with the other
          preferences, because that is what it is.

          It is the first section after the account itself on purpose: it is the
          one setting on this page that changes something a person can see
          immediately, so it is the cheapest one to find and confirm.
        */}
        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Appearance</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Light, dark, or whatever your device is set to. It applies straight
            away and is remembered on this browser.
          </p>
          <div className="mt-4">
            <ThemeChoice />
          </div>
        </section>

        {/*
          Recent activity. It is not a privacy toggle, because it has no public
          setting at all: searches and the tools you opened are never shown to
          anybody. What belongs here is the way to delete it.
        */}
        <section className="mt-12 border-t border-border pt-10">
          <h2 className="font-display text-[17px] font-semibold">Recent activity</h2>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Celpare records what you searched for and which tools you opened, so
            you can get back to them from the Recent section of your profile.
            Only you can ever see it, and there is no setting that publishes it.
          </p>
          <div className="mt-4">
            <ClearRecent />
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
