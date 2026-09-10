import { createBrowserClient } from "@supabase/ssr";

/* Browser client. Publishable key only. Used for OAuth redirects and any
   client side session read. RLS is what protects data, not this key. */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
