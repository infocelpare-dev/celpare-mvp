import "server-only";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { POST_SELECT, normalisePost, type FeedPost } from "@/lib/community/queries";
import { baitRisk, contentQuality } from "../quality";
import { spamRisk } from "../safety";
import {
  PROCESSOR_VERSION,
  detectLanguage,
  nearestDuplicate,
  simhash64,
  tokenCount,
  type SimhashCandidate,
} from "../upload";
import { toContentItem } from "./data";

/*
  upload_v1, the server half: runs once per post, after the response, through
  after() in createPost. Reads with the service role, computes what upload.ts
  can, and reports back through post_record_processing(), which decides whether
  the post starts testing or is held (the database makes that call, not this
  file, so there is one place it is made).

  NEVER THROWS. Posting has already succeeded when this runs. A failure is
  logged, and the tick finds the post still unprocessed after ten minutes and
  moves it on with the trigger's fields alone (D142), so no post is stranded.
*/
export async function processPost(postId: string, durationMs: number | null = null): Promise<void> {
  if (!hasServiceRole()) return;
  try {
    const db = createAdminClient();
    const { data: row, error } = await db.from("posts").select(POST_SELECT).eq("id", postId).maybeSingle();
    if (error || !row) {
      console.error("[upload] could not read post", postId, error?.code, error?.message);
      return;
    }
    const post = normalisePost(row as unknown as FeedPost);
    const item = toContentItem(post);

    /* The author's recent posts, for the repetition half of spamRisk. */
    const { data: recent } = await db
      .from("posts")
      .select(POST_SELECT)
      .eq("author_id", post.author_id)
      .neq("id", postId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(20);
    const others = ((recent as unknown as FeedPost[]) ?? []).map((p) => toContentItem(normalisePost(p)));

    const hash = simhash64(post.body);
    let near: ReturnType<typeof nearestDuplicate> = null;
    if (hash !== null) {
      const { data: cands } = await db.rpc("post_simhash_candidates", { p_post_id: postId });
      const list: SimhashCandidate[] = ((cands as { post_id: string; author_id: string; simhash: string | number }[]) ?? [])
        .filter((c) => c.simhash !== null)
        .map((c) => ({ postId: c.post_id, authorId: c.author_id, simhash: BigInt(c.simhash) }));
      near = nearestDuplicate(hash, list);
    }

    const { error: recordError } = await db.rpc("post_record_processing", {
      p_post_id: postId,
      p_language: detectLanguage(post.body),
      /* A string, not a number: a 64 bit value does not survive JSON as a
         JavaScript number. PostgREST casts it to bigint. */
      p_simhash: hash === null ? null : hash.toString(),
      p_token_count: tokenCount(post.body),
      p_quality: round(contentQuality(item)),
      p_spam: round(spamRisk(item, others)),
      p_bait: round(baitRisk(post.body)),
      p_near_of: near?.postId ?? null,
      p_near_score: near ? round(near.score) : null,
      p_version: PROCESSOR_VERSION,
      p_duration_ms: durationMs,
    });
    if (recordError) console.error("[upload] record failed", postId, recordError.code, recordError.message);
  } catch (err) {
    console.error("[upload] processing threw", postId, err);
  }
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
