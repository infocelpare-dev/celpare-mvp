import "server-only";
import { createClient } from "@supabase/supabase-js";

/*
  Service role client. Read the comment before using it anywhere new.

  D21 says the service role key never touches a user shaped request, and that
  rule stands. This narrows it rather than breaking it: the only thing this
  client is allowed to do is write rows to public.ai_usage_records, where every
  value in the row is computed by our own code and none of it comes from the
  request body. It never reads user data and it never serves a response.

  The reason it has to exist: ai_usage_records deliberately has no insert policy,
  so a forged usage row cannot be posted straight to the REST API with the
  publishable key, which is public. Something has to be able to write the real
  ones, and the alternative, an insert policy for authenticated users, would let
  anybody write whatever numbers they liked into their own billing record.

  Never NEXT_PUBLIC_. The pre-commit scan fails a commit that makes it public,
  which is CLAUDE.md rule 4 enforced by a hook rather than by memory.
*/

export function hasServiceRole() {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set. This client must never be used in the browser.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
