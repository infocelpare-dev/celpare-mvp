import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/app/app-shell";
import { AccountNotices } from "@/components/app/account-notices";
import { AdminLink } from "@/components/app/admin-link";
import { BackLink } from "@/components/ui/back-link";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { SearchInput } from "@/components/search/search-input";
import { RecentSearches } from "@/components/search/recent-searches";
import { SearchEmptyState } from "@/components/search/empty-state";
import { ResultTabs } from "@/components/search/result-tabs";
import { Pagination } from "@/components/search/pagination";
import { SearchTracking } from "@/components/search/search-tracking";
import { WeakMatchNotice, ZeroResults } from "@/components/search/zero-results";
import {
  ModelResult,
  PersonResult,
  PostResult,
  ToolResult,
} from "@/components/search/results";
import { hydratePosts, runSearch } from "@/lib/search/engine";
import { readerFor } from "@/lib/search/retrieval";
import { loadRecentSearches, RECENT_SEARCHES_SHOWN } from "@/lib/search/history";
import { loadRecommendations, loadRelatedSearches } from "@/lib/search/recommendations";
import { getViewerState, EMPTY_VIEWER_STATE } from "@/lib/community/queries";
import { WEIGHTS } from "@/lib/search/ranking";
import type { SearchResults, SearchTab, Scored } from "@/lib/search/types";

/* What to call a tab in a sentence. "Nothing under Models" reads; "Nothing under
   models tab" does not. */
const TAB_NOUN: Record<SearchTab, string> = {
  all: "any type",
  tools: "Tools",
  models: "Models",
  people: "People",
  posts: "Posts",
};

/* Reads the session cookie and records the search, so it must never be
   prerendered or cached. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search",
  description:
    "Search AI tools, models and people across Celpare. Relevance first, not a popularity contest.",
  /* A results page is not something a crawler should index: the useful pages are
     the tools and the profiles it points at, and an index full of query URLs is
     the same thing repeated with different parameters. The follower lists took
     this decision in 4AK.1 for the same reason. */
  robots: { index: false, follow: true },
};

/*
  Celpare Search.

  THIS IS NOT EXPLORE AND IT DOES NOT REPLACE IT. /explore is a browse surface: the
  categories, the featured shelf, a way around the catalogue for somebody with no
  particular question. This is the query surface. The bar icon that used to point
  at /explore points here, because a magnifier means "I know what I am looking
  for".

  EVERYTHING IS DECIDED ON THE SERVER. The pipeline runs here, in a server
  component, and the browser receives ranked HTML. Section 26: no ranking in React,
  and nothing loads the catalogue into the page to sort it there.

  PUBLIC, LIKE THE FEED. Searching does not need an account (section 14), so a
  signed out visitor gets the whole thing through the anon client, which is the
  same path a crawler takes and the reason the policies are exercised rather than
  assumed. What they do not get is a history and a personalised order, because
  both of those are things only an account can have.
*/
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q : "";
  const tab = typeof params?.tab === "string" ? params.tab : undefined;
  /* Clamped rather than trusted. ?page=-4 and ?page=abc both mean page one. */
  const page = Math.max(1, Math.trunc(Number(params?.page ?? 1)) || 1);

  let signedIn = false;
  let viewerId: string | null = null;

  if (isSupabaseConfigured()) {
    const db = await createClient();
    const {
      data: { user },
    } = await db.auth.getUser();
    signedIn = Boolean(user);
    viewerId = user?.id ?? null;
  }

  const hasQuery = q.trim().length > 0;

  /* Two entirely different pages, so they are two branches rather than one page
     with everything conditional inside it. */
  const [results, recent, recommendations, categories] = await Promise.all([
    hasQuery
      ? runSearch({ query: q, tab, signedIn, viewerId })
      : Promise.resolve(null),
    loadRecentSearches(viewerId, RECENT_SEARCHES_SHOWN),
    hasQuery
      ? Promise.resolve(null)
      : loadRecommendations({ signedIn, viewerId }),
    hasQuery ? Promise.resolve([]) : loadCategories(signedIn),
  ]);

  return (
    <AppShell
      banner={<AccountNotices />}
      adminLink={<AdminLink />}
      signedIn={signedIn}
    >
      <div className="mx-auto w-full max-w-[760px] px-4 py-4 sm:px-5">
        <BackLink href="/community" label="Back to Celpare" />

        <h1 className="sr-only">Search Celpare</h1>

        <div className="mt-3">
          {/*
            autoFocus only when there is nothing to read yet. On a result page it
            would scroll a phone's keyboard over the results somebody just asked
            for, and on the empty page it is exactly what was wanted.
          */}
          <SearchInput initialQuery={q} autoFocus={!hasQuery} />
        </div>

        {!hasQuery ? (
          <>
            <RecentSearches searches={recent} />
            {recommendations ? (
              <SearchEmptyState
                recommendations={recommendations}
                categories={categories}
                signedIn={signedIn}
                /* Empty by construction, not by omission: suggested_people
                   excludes anybody the caller already follows, so every row here
                   is somebody they do not. A suggestion you have already acted on
                   is a wasted row. */
                following={new Set<string>()}
                viewerId={viewerId}
              />
            ) : null}
          </>
        ) : results ? (
          <Results
            results={results}
            page={page}
            signedIn={signedIn}
            viewerId={viewerId}
          />
        ) : null}
      </div>
    </AppShell>
  );
}

async function loadCategories(signedIn: boolean) {
  const db = await readerFor(signedIn);
  const { data, error } = await db
    .from("categories")
    .select("name, slug")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[search] categories failed", error.code, error.message);
    return [];
  }
  return ((data as { name: string; slug: string }[] | null) ?? []).map((c) => ({
    name: c.name,
    slug: String(c.slug),
  }));
}

/* ---------------------------------------------------------------------------
   The result list.
   --------------------------------------------------------------------------- */

async function Results({
  results,
  page,
  signedIn,
  viewerId,
}: {
  results: SearchResults;
  page: number;
  signedIn: boolean;
  viewerId: string | null;
}) {
  const { tab, query } = results;

  if (results.total === 0) {
    const db = await readerFor(signedIn);
    const related = await loadRelatedSearches(db);
    return (
      <>
        <ZeroResults query={query} related={related} />
        {/* The search itself was recorded with a result count of zero, which is
            the most useful row in that table. No impressions to track. */}
      </>
    );
  }

  const ranked: Scored[] =
    tab === "all"
      ? results.all
      : tab === "tools"
        ? results.tools
        : tab === "models"
          ? results.models
          : tab === "people"
            ? results.people
            : results.posts;

  /*
    The page slice. Ranking produced the whole ordered list; this is the window
    onto it. offset is also the POSITION an impression is recorded at, so a click
    on the first row of page three is recorded at 24 and not at 0, which is the
    whole basis of the position adjusted click signal.
  */
  const pageCount = Math.max(1, Math.ceil(ranked.length / WEIGHTS.PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const offset = (current - 1) * WEIGHTS.PAGE_SIZE;
  const list = ranked.slice(offset, offset + WEIGHTS.PAGE_SIZE);

  /* Posts are hydrated only when they are going to be shown, which after the
     slice means the handful on this page rather than every post that matched. */
  const shownPosts = list.filter((s) => s.candidate.type === "post");

  const db = await readerFor(signedIn);

  /* Only fetched when the best match in the pool was weak, so the ordinary path
     does not pay for a query it will not render. */
  const related = results.weak ? await loadRelatedSearches(db) : [];

  const postRows = await hydratePosts(
    db,
    shownPosts.map((s) => s.candidate.id),
  );

  /* The viewer's own likes and saves for those posts, read with the SESSION
     client, never the anon one: what somebody liked is nobody's business but
     theirs. 4AK.4 made the same call for the profile. */
  const viewer =
    signedIn && viewerId
      ? await getViewerState(
          await createClient(),
          viewerId,
          [...postRows.keys()],
        )
      : EMPTY_VIEWER_STATE;

  function render(item: Scored, position: number) {
    const c = item.candidate;

    if (c.type === "tool") {
      return (
        <ToolResult
          key={`tool-${c.id}`}
          item={item as Scored<typeof c>}
          position={position}
        />
      );
    }
    if (c.type === "model") {
      return (
        <ModelResult
          key={`model-${c.id}`}
          item={item as Scored<typeof c>}
          position={position}
        />
      );
    }
    if (c.type === "person") {
      return (
        <PersonResult
          key={`person-${c.id}`}
          item={item as Scored<typeof c>}
          position={position}
          signedIn={signedIn}
          following={results.following.has(c.id)}
          viewerId={viewerId}
        />
      );
    }

    const post = postRows.get(c.id);
    /* A post whose row did not come back is a post the reader may not see. It is
       dropped rather than rendered as a gap, and that is RLS doing its job
       twice: once in the candidate function and once in the hydrate. */
    if (!post) return null;
    return (
      <PostResult
        key={`post-${c.id}`}
        item={item as Scored<typeof c>}
        post={post}
        position={position}
        viewer={viewer}
        signedIn={signedIn}
      />
    );
  }

  return (
    <>
      {results.weak ? (
        <WeakMatchNotice query={query} related={related} />
      ) : null}

      <div className="mt-5">
        <ResultTabs results={results} query={query.raw} />
      </div>

      {/*
        The correction notice, when retrieval searched for something other than
        what was typed. It says so rather than silently substituting, and it
        offers the original back.
      */}
      {query.corrected && query.corrected !== query.normalized ? (
        <p className="mt-4 text-[14px] text-muted">
          Showing results for{" "}
          <span className="font-medium text-foreground">{query.corrected}</span>
        </p>
      ) : null}

      {list.length === 0 ? (
        /*
          The tab you are on is kept visible even at zero, so that landing on a
          shared /search?tab=models link does not silently move you somewhere
          else. The cost of that is this state, and a blank list under a selected
          tab is the dead end the ux guidance rates a defect. So it says which
          tab found nothing and points at the one that did.
        */
        <p className="mt-8 text-[15px] leading-relaxed text-muted">
          Nothing under {TAB_NOUN[tab]} for &ldquo;{query.raw}&rdquo;.{" "}
          <Link
            href={`/search?q=${encodeURIComponent(query.raw)}`}
            className="text-foreground underline underline-offset-4"
          >
            See everything that matched
          </Link>
          .
        </p>
      ) : (
        <ol className="mt-1">{list.map((item, i) => render(item, offset + i))}</ol>
      )}

      <Pagination
        page={current}
        pageCount={pageCount}
        capped={results.hasMore}
        hrefFor={(n) => {
          const p = new URLSearchParams({ q: query.raw });
          if (tab !== "all") p.set("tab", tab);
          if (n > 1) p.set("page", String(n));
          return `/search?${p.toString()}`;
        }}
      />

      <SearchTracking queryId={results.queryId} query={query.raw} />

      {/* Clears the bottom of the viewport on a phone, so the last result can be
          scrolled clear of the browser chrome. */}
      <div className="h-16" aria-hidden />
    </>
  );
}
