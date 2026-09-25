import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { getTrending } from "@/lib/community/intelligence/server/engine";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  trending_v1 and rising_v1, as data. What is gaining attention on Celpare right
  now: posts, videos, discussions, rising posts, topics, hashtags and creators.

  PUBLIC AND THE SAME FOR EVERYBODY. Computed from the anonymous view only, so a
  private account's post can never trend, and it takes no session. It returns
  ids, handles, topic slugs and hashtags, plus how many posts and people took
  part in a group: never a score, a weight, a view count or anything from
  feed_post_signals directly.

  Nothing in the product renders this yet (Explore's Trending and Rising
  sections belong to Explore, and wiring them is Explore's decision). It exists
  so the algorithm has a tested, callable surface.
*/

const schema = z.object({
  kind: z.enum(["posts", "reels", "topics", "hashtags", "creators", "discussions", "rising"]).default("posts"),
});

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "Unavailable." }, { status: 503 });
  if (!(await withinBurst("trending"))) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const parsed = schema.safeParse({ kind: request.nextUrl.searchParams.get("kind") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "Unknown kind." }, { status: 400 });

  try {
    const result = await getTrending(createAnonClient(), parsed.data.kind);
    if ("posts" in result) {
      return NextResponse.json({
        kind: result.kind,
        algorithm: result.algorithm,
        posts: result.posts.map((p) => ({
          id: p.id,
          author: p.author?.username ?? null,
          topic: p.topic?.slug ?? null,
          created_at: p.created_at,
        })),
      });
    }
    return NextResponse.json({ kind: result.kind, algorithm: result.algorithm, groups: result.groups });
  } catch (err) {
    console.error("[trending] failed", err);
    /* A failure says so. An empty list would claim nothing is trending. */
    return NextResponse.json({ error: "Trending could not be computed." }, { status: 500 });
  }
}
