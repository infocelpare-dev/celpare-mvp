import { redirect } from "next/navigation";

/*
  Every entry path lands here: sign up, log in, the OAuth callback, and skip.

  The home is /community (D27), so this redirects rather than duplicating it.
  Kept as a route instead of being deleted because four separate entry paths
  point at /app, and changing all of them at once is a bigger change than one
  redirect, with more places to get it wrong.
*/
export default function AppPage() {
  redirect("/community");
}
