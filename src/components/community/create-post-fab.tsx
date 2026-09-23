import Link from "next/link";
import { Plus } from "lucide-react";

/*
  The one floating action: write a post.

  It is deliberately a single action and not a cluster. The founder's brief
  rules out using it as a second home for search, notifications, messages or
  Ask Celpare, all of which already sit in the header, and a fan of quick
  actions on a surface with one write path would be inventing choices to fill
  a menu.

  It is a LINK, not a button opening a modal. /community/new is a real page
  with its own URL, so a half written post survives a reload, can be reached
  from anywhere, and does not trap a phone keyboard inside a dialog. That also
  means no JavaScript is involved in reaching the composer.

  POSITIONING. Fixed to the viewport, offset with env(safe-area-inset-bottom)
  so it clears the home indicator on an iPhone rather than sitting under it.
  The feed leaves matching bottom padding, so the last post can always be
  scrolled clear of it.

  Ink on lime is 14.52:1. White on lime is 1.17:1 and is never used (D2).
*/
export function CreatePostFab({ signedIn }: { signedIn: boolean }) {
  const href = signedIn ? "/community/new" : "/get-started";
  const label = signedIn ? "Create post" : "Sign in to post";

  return (
    <Link
      href={href}
      title={label}
      className="fixed end-4 z-30 inline-flex size-14 items-center justify-center rounded-full bg-primary text-on-primary transition-colors duration-200 ease-out hover:bg-primary-hover sm:end-6"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Plus className="size-6" aria-hidden strokeWidth={2.25} />
      {/* Real text in the DOM rather than aria-label, so it survives
          translation and reads the same to every assistive technology. */}
      <span className="sr-only">{label}</span>
    </Link>
  );
}
