/*
  Browser page translation versus React (Sentry JAVASCRIPT-NEXTJS-1G and -H,
  2026-11-25 triage).

  Chrome's "Translate this page" and similar extensions replace the text nodes
  React rendered with their own <font> wrappers. When React later updates that
  text, it asks the old parent to remove a node that is no longer its child,
  and the browser throws "Failed to execute 'removeChild' on 'Node'". The whole
  page then falls to the error screen. Seen on celpare.com from a visitor with a
  Chinese browser, six times in a minute.

  The known workaround (facebook/react#11538): when the node is not where React
  thinks it is, skip the DOM call instead of throwing. React's own bookkeeping
  is unaffected; at worst a translated word stays on screen until the next
  render. Real misuse still shows up in development, where nothing is patched.

  Runs once, before hydration, from instrumentation-client.ts.
*/

const FLAG = "__celpareTranslateGuard";

export function installTranslateGuard(): void {
  if (typeof window === "undefined" || typeof Node !== "function") return;
  if (process.env.NODE_ENV !== "production") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[FLAG]) return;
  w[FLAG] = true;

  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function guardedRemoveChild<T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) return child;
    return removeChild.call(this, child) as T;
  } as typeof Node.prototype.removeChild;

  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function guardedInsertBefore<T extends Node>(
    this: Node,
    node: T,
    reference: Node | null,
  ): T {
    if (reference && reference.parentNode !== this) return node;
    return insertBefore.call(this, node, reference) as T;
  } as typeof Node.prototype.insertBefore;
}
