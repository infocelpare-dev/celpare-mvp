import type { Comment } from "./queries";

/*
  A flat list of comments becomes a tree.

  ONE QUERY, NOT ONE PER LEVEL. getComments already reads every comment on the
  post in a single ordered select, so the tree is built in memory here rather than
  by recursing into the database. A recursive CTE would move the work server side
  for no gain: the whole thread is coming back anyway, and an unbounded depth of
  round trips is exactly what makes a comment section slow.

  UNLIMITED DEPTH IN THE DATA. Founder instruction 2026-09-22. Nothing here caps
  how deep a reply can go, and nothing in the schema does either. What IS capped is
  the visual indent, in the component, because at 390px a tenth level indent leaves
  about nine characters per line. Depth is carried on the node so the renderer can
  stop indenting without the data pretending the reply is somewhere it is not.

  AN ORPHAN IS SHOWN, NOT DROPPED. A reply whose parent is missing from this list,
  because the parent was hidden by a moderator or its author's replies are private,
  is promoted to the top level rather than silently discarded. Losing somebody's
  reply because of a fact about a different person's comment would be the worse
  failure, and the alternative is a thread that quietly loses posts.
*/

export type CommentNode = Comment & {
  depth: number;
  children: CommentNode[];
  /* Every descendant, not just direct children. This is what "3 replies" on a
     collapsed branch has to count, and computing it during the build costs
     nothing while doing it in render is a walk per node. */
  descendantCount: number;
};

export function buildThread(comments: Comment[]): CommentNode[] {
  const nodes = new Map<string, CommentNode>();
  for (const c of comments) {
    nodes.set(c.id, { ...c, depth: 0, children: [], descendantCount: 0 });
  }

  const roots: CommentNode[] = [];

  for (const c of comments) {
    const node = nodes.get(c.id);
    if (!node) continue;

    const parent = c.parent_id ? nodes.get(c.parent_id) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      /* Either a real top level comment, or an orphan being promoted. */
      roots.push(node);
    }
  }

  /*
    Depth and descendant counts, iteratively.

    NOT RECURSION, deliberately. Depth is unlimited by design, and a recursive
    walk over a thread thousands deep would overflow the stack: an unbounded
    feature needs an unbounded-safe traversal or the limit comes back as a crash
    instead of a rule.
  */
  const stack: CommentNode[] = [...roots];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) continue;
    for (const child of node.children) {
      child.depth = node.depth + 1;
      stack.push(child);
    }
  }

  /* Descendants, bottom up. Sorting by depth descending means every child is
     already totalled before its parent is read. */
  const all = [...nodes.values()].sort((a, b) => b.depth - a.depth);
  for (const node of all) {
    node.descendantCount = node.children.reduce(
      (sum, child) => sum + 1 + child.descendantCount,
      0,
    );
  }

  return roots;
}

/* How many comments the thread holds in total, replies included. The post's
   comment_count says the same thing and is trigger owned; this is for a list that
   has already been filtered by what the viewer may see. */
export function countThread(roots: CommentNode[]): number {
  return roots.reduce((sum, node) => sum + 1 + node.descendantCount, 0);
}
