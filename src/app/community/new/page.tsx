import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  getAttachableModels,
  getAttachableTools,
  getTopics,
} from "@/lib/community/queries";
import { ComposerForm } from "@/components/community/composer-form";

export const metadata: Metadata = {
  title: "Write a post",
  description: "Share what you found, ask which tool fits, post what you shipped.",
  /* A composer is not a page a search engine should hold. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/*
  The composer, on its own URL rather than in a modal.

  A real page means a half written post survives a reload, the browser back
  button does the obvious thing, and a phone keyboard is not trapped inside a
  dialog that has to manage its own focus. It is also what lets the floating
  button on the feed be a plain link with no JavaScript behind it.

  Writing needs an account (D32), and that is enforced twice: the redirect
  below decides what to RENDER, and posts_insert_own is the control. A signed
  out request that got past this would still be refused at 42501.
*/
export default async function NewPostPage() {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/get-started");

  const [topics, tools, models] = await Promise.all([
    getTopics(supabase),
    getAttachableTools(supabase),
    getAttachableModels(supabase),
  ]);

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn
    >
      <Container className="max-w-[640px] py-6 sm:py-10">
        <BackLink href="/community" label="Back to the feed" className="mb-5" />

        <h1 className="font-display text-[24px] font-semibold leading-tight sm:text-[28px]">
          Write a post
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Share what you found, ask which tool fits, or post what you shipped.
        </p>

        <div className="mt-7">
          <ComposerForm topics={topics} tools={tools} models={models} />
        </div>
      </Container>
    </AppShell>
  );
}
