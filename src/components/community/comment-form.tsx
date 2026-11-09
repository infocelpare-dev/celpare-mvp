"use client";

import { CommentComposer } from "./comment-composer";

/*
  The comment box under a post. The box itself is CommentComposer, shared with
  replies and the video sheet, so all three look and behave the same.
*/
export function CommentForm({ postId }: { postId: string }) {
  return <CommentComposer postId={postId} placeholder="Add a comment" label="Comment on this post" />;
}
