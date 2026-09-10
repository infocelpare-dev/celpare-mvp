import { createClient } from "@supabase/supabase-js";

/*
  Server side Supabase client for anonymous writes.

  Uses the publishable key on purpose, not the service role key. The waitlist
  insert is permitted by RLS, so nothing here needs to bypass it. The service
  role key bypasses all RLS and must never be used for a request shaped by
  user input. See docs/context/03-data-model.md
*/
export function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
