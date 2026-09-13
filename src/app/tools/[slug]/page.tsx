import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Container } from "@/components/ui/container";
import { Button, ButtonLink } from "@/components/ui/button";
import { AppShell } from "@/components/app/app-shell";
import {
  createAnonClient,
  createClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

/*
  The tool record an Ask Celpare citation points at.

  This page reads the full row, not the AI projection. The seven column
  allowlist in search_tools exists to limit what the MODEL sees; a person
  looking at a tool page is entitled to the website link and the rest of the
  record. Conflating the two would be a misreading of the boundary.

  RLS still applies: the anon client can only see status = 'approved'.
*/

/* Reads the session cookie for the shell, so it must never be prerendered. */
export const dynamic = "force-dynamic";

type Tool = {
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  website_url: string | null;
  docs_url: string | null;
  pricing: string | null;
  pricing_model: string | null;
  tags: string[];
  features: string[];
  platforms: string[];
  rating: number | null;
  verified: boolean;
  source: string;
  submitted_at: string;
};

async function getTool(slug: string): Promise<Tool | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = createAnonClient();
  const { data, error } = await supabase
    .from("tools")
    .select(
      "slug, name, tagline, description, website_url, docs_url, pricing, pricing_model, tags, features, platforms, rating, verified, source, submitted_at",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[tools] lookup failed", error.code, error.message);
    return null;
  }
  return (data as Tool) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = await getTool(slug);
  if (!tool) return { title: "Tool not found" };

  return {
    title: tool.name,
    description: tool.tagline ?? tool.description?.slice(0, 160) ?? undefined,
  };
}

export default async function ToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = await getTool(slug);
  if (!tool) notFound();

  let signedIn = false;
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
  }

  return (
    <AppShell
      signedIn={signedIn}
      signOutAction={
        <form action={signOut}>
          <Button variant="outline" size="sm" type="submit">
            Log out
          </Button>
        </form>
      }
    >
      <Container className="max-w-[720px] py-10 sm:py-14">
        <Link
          href="/ask"
          className="inline-flex items-center gap-1.5 text-sm text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to Ask Celpare
        </Link>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[clamp(1.7rem,4vw,2.2rem)] font-semibold leading-tight">
            {tool.name}
          </h1>
          {tool.verified ? (
            <span className="rounded-full bg-accent px-2.5 py-1 text-[12px] font-medium text-on-accent">
              Verified
            </span>
          ) : null}
        </div>

        {tool.tagline ? (
          <p className="mt-2 text-[17px] text-muted">{tool.tagline}</p>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {tool.website_url ? (
            <ButtonLink href={tool.website_url} size="sm" target="_blank" rel="noreferrer noopener">
              Visit website
              <ExternalLink className="size-3.5" aria-hidden />
            </ButtonLink>
          ) : null}
          {tool.docs_url ? (
            <ButtonLink
              href={tool.docs_url}
              variant="outline"
              size="sm"
              target="_blank"
              rel="noreferrer noopener"
            >
              Documentation
            </ButtonLink>
          ) : null}
        </div>

        {tool.description ? (
          <p className="mt-8 text-[15px] leading-relaxed">{tool.description}</p>
        ) : null}

        <dl className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
          <Fact label="Pricing" value={tool.pricing ?? "Not recorded"} />
          <Fact
            label="Pricing model"
            value={tool.pricing_model ? cap(tool.pricing_model) : "Not recorded"}
          />
          <Fact
            label="Rating"
            /* D40: null until there are real reviews. It says so rather than
               showing a zero that looks like a bad score. */
            value={tool.rating === null ? "Not rated yet" : `${tool.rating} out of 5`}
          />
          <Fact
            label="Platforms"
            value={tool.platforms.length ? tool.platforms.join(", ") : "Not recorded"}
          />
        </dl>

        {tool.features.length ? (
          <section className="mt-8">
            <h2 className="font-display text-[18px] font-semibold">Features</h2>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {tool.features.map((f) => (
                <li key={f} className="flex gap-2 text-[15px]">
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {tool.tags.length ? (
          <section className="mt-8">
            <h2 className="sr-only">Tags</h2>
            <ul className="flex flex-wrap gap-2">
              {tool.tags.map((t) => (
                <li
                  key={t}
                  className="rounded-full border border-border px-3 py-1 text-[13px] text-muted"
                >
                  {t.replace(/-/g, " ")}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* Hard rule 3 in CLAUDE.md: every tool records where it came from and
            when. Showing it is what makes the catalogue auditable rather than
            just asserted. */}
        <p className="mt-10 border-t border-border pt-5 text-[13px] text-muted">
          Added {new Date(tool.submitted_at).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
          {" · "}
          {tool.source === "admin_seed"
            ? "Curated by Celpare"
            : tool.source === "developer_submission"
              ? "Submitted by the developer"
              : "Imported"}
        </p>
      </Container>
    </AppShell>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background p-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-1 text-[15px]">{value}</dd>
    </div>
  );
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
