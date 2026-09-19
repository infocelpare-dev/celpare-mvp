import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Container } from "@/components/ui/container";
import { BackLink } from "@/components/ui/back-link";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ProfileForm } from "@/components/profile/profile-form";
import { AvatarUpload } from "@/components/profile/avatar-upload";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getProfileById } from "@/lib/profile/queries";

export const metadata: Metadata = {
  title: "Edit profile",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EditProfilePage() {
  if (!isSupabaseConfigured()) redirect("/community");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/get-started");

  const profile = await getProfileById(supabase, user.id);
  if (!profile) redirect("/community");

  return (
    <AppShell banner={<AccountNotices />} adminLink={<AdminLink />}
      signedIn
    >
      <Container className="max-w-[640px] py-10 sm:py-14">
        <BackLink href="/profile" label="Back to your profile" className="mb-5" />

        <h1 className="font-display text-[clamp(1.6rem,4vw,2.1rem)] font-semibold leading-tight">
          Edit profile
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">
          Everything here is public and shows at /u/{profile.username}. Your
          assistant and account preferences are in{" "}
          <a href="/settings" className="underline underline-offset-4 hover:text-foreground">
            settings
          </a>
          .
        </p>

        {/*
          Deliberately OUTSIDE ProfileForm. The upload has its own server
          actions, so it renders its own form elements, and HTML forbids a form
          inside a form: React hydration fails outright rather than degrading.
          Two sibling forms, one concern each.
        */}
        <section className="mt-8">
          <h2 className="font-display text-[17px] font-semibold">Picture</h2>
          <AvatarUpload
            fullName={profile.full_name}
            username={profile.username}
            avatarUrl={profile.avatar_url}
          />
        </section>

        <ProfileForm
          values={{
            username: profile.username,
            fullName: profile.full_name ?? "",
            bio: profile.bio ?? "",
            location: profile.location ?? "",
            websiteUrl: profile.website_url ?? "",
            interests: profile.interests ?? [],
            skills: profile.skills ?? [],
          }}
        />
      </Container>
    </AppShell>
  );
}
