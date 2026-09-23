import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { cache } from "react";

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function isSupabaseConfigured() {
  return Boolean(url() && key());
}

function assertConfigured() {
  if (!isSupabaseConfigured()) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }
}

/*
  Session aware server client. Reads and writes the auth cookies, so Server
  Components, Server Actions and Route Handlers all see the same session.

  Publishable key on purpose. The service role key bypasses every RLS policy
  and must never be used on a request shaped by user input.
*/
export async function createClient() {
  assertConfigured();
  const cookieStore = await cookies();

  return createServerClient(url()!, key()!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read only.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/*
  The same session aware client, plus the caller's own IP address under a header
  only this server sets.

  It exists for one reason: public.admin_audit records where an administrative
  action came from, and the address PostgREST sees is this server's, not the
  administrator's. Supabase's edge sets x-forwarded-for to whoever called it,
  which for a server rendered app is the app. Forwarding the real client address
  explicitly is the only way the audit log can be right about it.

  Still the publishable key and still the caller's own session, so every policy
  and every capability check applies exactly as before. The header carries no
  authority: nothing reads it to decide anything, it is only written down.
*/
export async function createAdminScopedClient(clientIp: string | null) {
  assertConfigured();
  const cookieStore = await cookies();

  return createServerClient(url()!, key()!, {
    global: {
      headers: clientIp ? { "x-celpare-client-ip": clientIp } : {},
    },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read only.
        }
      },
    },
  });
}

/*
  The signed in user for THIS request, verified with the auth server once.

  A page, the admin link and the notice bar each asked getUser() on their own, and
  each ask is a network round trip to Supabase Auth, so one render paid for three or
  four of them in a row. cache() scopes the answer to a single server render, so it
  is shared inside one request and never between two people. It is still getUser,
  not getSession (D21): the token is revalidated, just not four times.

  For server rendering only. A server action is its own request and calls getUser
  directly.
*/
export const getCurrentUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user;
});

/* Stateless client for anonymous writes that need no session, such as the
   demo request form. */
export function createAnonClient() {
  assertConfigured();
  return createPlainClient(url()!, key()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
