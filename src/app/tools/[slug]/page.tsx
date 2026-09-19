import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Code2,
  Globe,
  Link2,
  MessageCircle,
  Play,
  Plus,
  Sparkles,
} from "lucide-react";
import { Container } from "@/components/ui/container";
import { ButtonLink } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { ToolActions } from "@/components/tools/tool-actions";
import {
  RatingSummary,
  ReviewComposer,
  ReviewList,
  Stars,
} from "@/components/tools/tool-reviews";
import {
  getDeveloperCard,
  getRatingBreakdown,
  getRelatedTools,
  getToolProfile,
  getToolReviews,
  getViewerState,
  type ToolProfile,
} from "@/lib/tools/queries";
import { recordToolView } from "@/lib/telemetry";

/*
  The public tool profile.

  Everything here is read with the anon client, whose RLS policy on tools
  allows status = 'approved' and nothing else. A draft is a 404 to everybody
  including its own developer, which is deliberate: the owner reads their draft
  in the developer workspace, where it is labelled as one.

  Three rules this page keeps that are easy to break:

    1. No invented numbers (D13, D30). A rating that nobody has given says
       "Not rated yet", never 0.0. A count of zero is hidden rather than shown.
    2. Lime is an accent (D2). It is the primary button, the active state and
       the filled star. It never carries white text and it is never a wash.
    3. The dislike count is never rendered. It is not even readable by this
       page: the column is absent from the client select grant.
*/

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getToolProfile(slug);
  if (!tool) return { title: "Tool not found" };

  return {
    title: tool.name,
    description: tool.tagline ?? tool.description?.slice(0, 160) ?? undefined,
    alternates: { canonical: `/tools/${tool.slug}` },
    openGraph: {
      title: tool.name,
      description: tool.tagline ?? undefined,
      /* The logo, not the cover. Covers were removed from the profile on
         founder instruction, so the share card now shows the same mark the
         page does rather than an image nobody can see on the page itself. */
      images: tool.logo_url ? [tool.logo_url] : undefined,
    },
  };
}

const LINK_META: Record<string, { label: string; icon: typeof Globe }> = {
  demo: { label: "Live demo", icon: Play },
  github: { label: "GitHub", icon: Code2 },
  discord: { label: "Discord", icon: MessageCircle },
  x: { label: "X", icon: Link2 },
  linkedin: { label: "LinkedIn", icon: Link2 },
  api: { label: "API", icon: Link2 },
  changelog: { label: "Changelog", icon: Link2 },
  pricing: { label: "Pricing", icon: Link2 },
  other: { label: "More", icon: Link2 },
};

function Section({
  title,
  children,
  id,
}: {
  title: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mt-10">
      <h2 className="font-display text-[20px] font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Logo({ tool }: { tool: ToolProfile }) {
  if (tool.logo_url) {
    /* A plain img, following tool-cards.tsx: these are third party hosts and
       next/image would need every one of them allowlisted. */
    return (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img
        src={tool.logo_url}
        alt=""
        /*
          A circle, founder instruction 2026-09-19. object-contain stays and
          the padding goes up a step: a circle clips its corners, so a wide
          wordmark inside a squared box would lose its ends. Contained and
          inset, the whole mark sits inside the circle instead.
        */
        className="size-16 shrink-0 rounded-full border border-border bg-background object-contain p-2"
      />
    );
  }
  return (
    <span
      aria-hidden
      /* The fallback matches the shape, or a tool with no logo would be the
         one square mark on a page of circles. */
      className="flex size-16 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-display text-[26px] font-semibold text-muted"
    >
      {tool.name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getToolProfile(slug);
  if (!tool) notFound();

  const [viewer, reviews, breakdown, related, developer] = await Promise.all([
    getViewerState(tool.id, tool.developer_id),
    getToolReviews(tool.id),
    getRatingBreakdown(tool.id),
    getRelatedTools(tool),
    getDeveloperCard(tool.developer_id, tool.id),
  ]);

  /*
    Record the view, after the page has already resolved.

    Not awaited: a telemetry insert must never be something a reader waits on,
    and if it fails the page is unaffected.
  */
  void recordToolView({ toolId: tool.id, userId: viewer.userId, source: "direct" });

  /*
    The profile's own media and the developer's launch posts are the same
    table and two different things. is_update is what separates them: a
    screenshot of the product belongs under Screenshots, a screenshot of what
    shipped last week belongs under What's new.
  */
  const profileMedia = tool.media.filter((m) => !m.is_update);
  const updates = tool.media.filter((m) => m.is_update);

  /*
    There is no cover any more, founder instruction 2026-09-18. The kind still
    exists in the database and older tools still have a row, because nothing
    here destroys a developer's upload. It simply stops being rendered, and the
    submission form stopped collecting it, so the set drains rather than being
    deleted. Screenshots are where a wide image belongs.
  */
  const screenshots = profileMedia.filter((m) => m.kind === "screenshot");
  const videos = profileMedia.filter((m) => m.kind === "video");
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const shareUrl = `${site}/tools/${tool.slug}`;

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn={viewer.signedIn}
    >
      <Container className="max-w-[820px] py-8 sm:py-12">
        <Link
          href="/explore"
          className="inline-flex items-center gap-1.5 text-[14px] text-muted transition-colors duration-200 ease-out hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Explore tools
        </Link>

        {/* ------------------------------------------------------------ header */}

        {/*
          Centred, founder instruction 2026-09-18. The logo used to sit to the
          left of the name with the text ragged beside it, under a 3:1 cover.
          Both are gone. One column, centre aligned, which is the same shape at
          390px and at 1440 and so needs no second layout for mobile.
        */}
        <div className="mt-6 flex flex-col items-center text-center">
          <Logo tool={tool} />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <h1 className="font-display text-[clamp(1.7rem,4vw,2.3rem)] font-semibold leading-tight">
              {tool.name}
            </h1>
            {tool.verified ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[12px] font-medium text-on-accent">
                <Sparkles className="size-3" aria-hidden />
                Verified
              </span>
            ) : null}
          </div>

          {tool.tagline ? (
            <p className="mt-2 max-w-[56ch] text-[16px] leading-relaxed text-muted">
              {tool.tagline}
            </p>
          ) : null}

          {tool.rating != null && tool.rating_count > 0 ? (
            <a
              href="#reviews"
              className="mt-2 inline-flex items-center gap-2 text-[14px] underline-offset-4 hover:underline"
            >
              <Stars value={tool.rating} />
              <span className="tabular-nums">{tool.rating.toFixed(1)}</span>
              <span className="text-muted">
                ({tool.rating_count} {tool.rating_count === 1 ? "rating" : "ratings"})
              </span>
            </a>
          ) : (
            <p className="mt-2 text-[14px] text-muted">Not rated yet</p>
          )}

          {/* Categories are structure, hashtags are what the developer called
              it. Both render, and neither is interactive yet: a chip that leads
              nowhere is worse than a label. */}
          {tool.categories.length > 0 || tool.tags.length > 0 ? (
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {tool.categories.map((c) => (
                <span
                  key={c}
                  className="rounded-full border border-border px-2.5 py-1 text-[13px]"
                >
                  {c}
                </span>
              ))}
              {tool.tags.map((t) => (
                <span key={t} className="rounded-full px-2.5 py-1 text-[13px] text-muted">
                  #{t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {tool.website_url ? (
            <ButtonLink href={tool.website_url} target="_blank" rel="noopener noreferrer nofollow">
              Try {tool.name}
              <ExternalLink className="size-4" aria-hidden />
            </ButtonLink>
          ) : null}

          {/* Went to /developer/tools, the LIST, which is why editing looked
              broken: the control existed and its destination never did. */}
          {viewer.isOwner ? (
            <ButtonLink
              href={`/developer/tools/${tool.id}/edit`}
              variant="outline"
              size="sm"
            >
              Edit tool
            </ButtonLink>
          ) : null}

          {/* Owner only, and it is not an edit. Posting news does not change
              what the listing claims, so unlike Edit tool it does not send a
              live tool back for review.

              Plus, not Sparkles, founder instruction 2026-09-18. Sparkles is
              already the Verified badge eight lines up, so the same mark meant
              two different things on one screen. A plus says "add one of
              these", which is what the control does. */}
          {viewer.isOwner ? (
            <ButtonLink
              href={`/developer/tools/${tool.id}/update`}
              variant="outline"
              size="sm"
            >
              <Plus className="size-4" aria-hidden />
              Launch a new feature
            </ButtonLink>
          ) : null}
        </div>

        <ToolActions
          toolId={tool.id}
          slug={tool.slug}
          likeCount={tool.like_count}
          reaction={viewer.reaction}
          saved={viewer.saved}
          reported={viewer.reported}
          signedIn={viewer.signedIn}
          shareUrl={shareUrl}
        />

        {/* ------------------------------------------------------- what it does */}

        {tool.description ? (
          <Section title="What it does">
            <p className="whitespace-pre-wrap text-[16px] leading-relaxed">
              {tool.description}
            </p>
          </Section>
        ) : null}

        {tool.features.length > 0 ? (
          <Section title="Features">
            <ul className="grid gap-2 sm:grid-cols-2">
              {tool.features.map((f) => (
                <li
                  key={f}
                  className="rounded-xl border border-border px-4 py-3 text-[15px]"
                >
                  {f}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ----------------------------------------------------------- updates */}

        {updates.length > 0 ? (
          <Section title="What's new">
            <ul className="space-y-4">
              {updates.map((u) => (
                <li
                  key={u.id}
                  className="rounded-xl border border-border p-4"
                >
                  <p className="text-[15px] font-medium">{u.caption}</p>

                  {u.kind === "screenshot" && u.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={u.url}
                      alt=""
                      loading="lazy"
                      className="mt-3 w-full rounded-lg border border-border object-cover"
                    />
                  ) : null}

                  {u.kind === "video" && u.url ? (
                    /* An anchor, not an embed, for the same reason the Video
                       section below is one: a third party player would load
                       their scripts and cookies into a Celpare page. */
                    <a
                      href={u.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-3 flex items-center gap-3 rounded-lg border border-border px-4 py-3 transition-colors duration-200 ease-out hover:bg-surface"
                    >
                      <Play className="size-5 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 text-[14px]">Watch it</span>
                      <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
                    </a>
                  ) : null}

                  {u.link_url ? (
                    <a
                      href={u.link_url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="mt-3 inline-flex items-center gap-1.5 text-[14px] underline underline-offset-4 transition-colors duration-200 ease-out hover:text-muted"
                    >
                      {u.kind === "link" ? "Take a look" : "More about this"}
                      <ExternalLink className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ------------------------------------------------------------- media */}

        {videos.length > 0 ? (
          <Section title="Video">
            <ul className="space-y-4">
              {videos.map((v) => (
                <li key={v.id}>
                  {/* An anchor, not an embed. Embedding a third party player
                      would load their scripts and their cookies into a Celpare
                      page, which is a privacy decision nobody made. */}
                  <a
                    href={v.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="flex items-center gap-3 rounded-xl border border-border px-4 py-3 transition-colors duration-200 ease-out hover:bg-surface"
                  >
                    <Play className="size-5 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 text-[15px]">
                      {v.caption ?? "Watch the demo"}
                    </span>
                    <ExternalLink className="size-4 shrink-0 text-muted" aria-hidden />
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {screenshots.length > 0 ? (
          <Section title="Screenshots">
            <ul className="grid gap-3 sm:grid-cols-2">
              {screenshots.map((s) => (
                <li key={s.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={s.url ?? ""}
                    alt={s.caption ?? ""}
                    loading="lazy"
                    className="w-full rounded-xl border border-border object-cover"
                  />
                  {s.caption ? (
                    <p className="mt-1.5 text-[13px] text-muted">{s.caption}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {/* ----------------------------------------------------------- pricing */}

        <Section title="Pricing and availability">
          <dl className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            <div className="bg-background p-4">
              <dt className="text-[13px] text-muted">Pricing</dt>
              <dd className="mt-1 text-[15px]">{tool.pricing ?? "Not stated"}</dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-[13px] text-muted">Pricing model</dt>
              <dd className="mt-1 text-[15px] capitalize">
                {tool.pricing_model ?? "Not stated"}
              </dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-[13px] text-muted">Platforms</dt>
              <dd className="mt-1 text-[15px]">
                {tool.platforms.length > 0 ? tool.platforms.join(", ") : "Not stated"}
              </dd>
            </div>
            <div className="bg-background p-4">
              <dt className="text-[13px] text-muted">In the catalogue since</dt>
              <dd className="mt-1 text-[15px]">
                {new Date(tool.published_at ?? tool.submitted_at).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "UTC",
                })}
              </dd>
            </div>
          </dl>
        </Section>

        {/* ------------------------------------------------------------- links */}

        <Section title="Links">
          <ul className="flex flex-wrap gap-2">
            {tool.website_url ? (
              <LinkChip href={tool.website_url} label="Website" Icon={Globe} />
            ) : null}
            {tool.docs_url ? (
              <LinkChip href={tool.docs_url} label="Documentation" Icon={BookOpen} />
            ) : null}
            {tool.links.map((l) => {
              const meta = LINK_META[l.kind] ?? LINK_META.other;
              return <LinkChip key={l.kind} href={l.url} label={meta.label} Icon={meta.icon} />;
            })}
          </ul>
        </Section>

        {/* ----------------------------------------------------------- ratings */}

        <Section title="Ratings and reviews" id="reviews">
          <div className="space-y-4">
            <RatingSummary
              rating={tool.rating}
              count={tool.rating_count}
              breakdown={breakdown}
            />
            <ReviewComposer
              toolId={tool.id}
              slug={tool.slug}
              signedIn={viewer.signedIn}
              mine={viewer.myReview}
            />
            <ReviewList reviews={reviews} viewerId={viewer.userId} />
          </div>
        </Section>

        {/* --------------------------------------------------------- developer */}

        {developer ? (
          <Section title="Developer">
            <div className="rounded-2xl border border-border p-5">
              <div className="flex items-start gap-3">
                {developer.avatar_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={developer.avatar_url}
                    alt=""
                    className="size-11 shrink-0 rounded-full border border-border object-cover"
                  />
                ) : (
                  <span
                    aria-hidden
                    className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface font-display text-[16px] font-semibold text-muted"
                  >
                    {(developer.full_name || developer.username || "D").charAt(0).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {developer.username ? (
                      <Link
                        href={`/u/${developer.username}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {developer.full_name || developer.username}
                      </Link>
                    ) : (
                      <span className="font-medium">{developer.full_name ?? "Developer"}</span>
                    )}
                    {developer.verified ? (
                      <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent">
                        Verified developer
                      </span>
                    ) : null}
                  </div>

                  {developer.otherTools.length > 0 ? (
                    <>
                      <p className="mt-2 text-[13px] text-muted">Also by them</p>
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {developer.otherTools.map((t) => (
                          <li key={t.slug}>
                            <Link
                              href={`/tools/${t.slug}`}
                              className="inline-block rounded-full border border-border px-2.5 py-1 text-[13px] transition-colors duration-200 ease-out hover:bg-surface"
                            >
                              {t.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </Section>
        ) : (
          <Section title="Developer">
            <p className="text-[14px] leading-relaxed text-muted">
              This listing was added by Celpare rather than submitted by the
              people who build it. If that is you,{" "}
              <Link href="/developer" className="underline underline-offset-2">
                claim it in Developer Mode
              </Link>
              .
            </p>
          </Section>
        )}

        {/* ----------------------------------------------------------- related */}

        {related.length > 0 ? (
          <Section title="Related tools">
            <p className="-mt-2 mb-3 text-[13px] text-muted">
              Tools tagged like this one. Not a recommendation, just an overlap.
            </p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.slug}>
                  <Link
                    href={`/tools/${r.slug}`}
                    className="flex h-full items-start gap-3 rounded-xl border border-border p-4 transition-colors duration-200 ease-out hover:bg-surface"
                  >
                    {r.logo_url ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.logo_url}
                        alt=""
                        loading="lazy"
                        className="size-9 shrink-0 rounded-lg border border-border object-contain"
                      />
                    ) : (
                      <span
                        aria-hidden
                        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface font-display text-[14px] font-semibold text-muted"
                      >
                        {r.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium">{r.name}</span>
                      {r.tagline ? (
                        <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">
                          {r.tagline}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </Container>
    </AppShell>
  );
}

function LinkChip({
  href,
  label,
  Icon,
}: {
  href: string;
  label: string;
  Icon: typeof Globe;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="inline-flex items-center gap-2 rounded-full border border-border px-3.5 py-2 text-[14px] transition-colors duration-200 ease-out hover:bg-surface"
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
        <ExternalLink className="size-3.5 shrink-0 text-muted" aria-hidden />
      </a>
    </li>
  );
}
