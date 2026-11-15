import { NextResponse, type NextRequest } from "next/server";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";
import { sameOrigin } from "@/lib/security/same-origin";
import { isBot } from "@/lib/statsig/core";
import { statsigOn, visitorFrom } from "@/lib/statsig/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/*
  Who the session recorder should say this browser is (D269), asked once by
  components/analytics/session-recorder.tsx.

  WHY A ROUTE. The recorder must store nothing in the browser, so it cannot
  keep an id of its own. The server already knows who a visitor is for page
  views (D264): the account id when signed in, otherwise the daily HMAC id.
  Handing the recorder the same two ids keeps a recording and the page views
  of the same person together in Statsig.

  The client key is sent from here too rather than baked into the bundle. It
  is a public key by design (it can only write events), and reading it at
  request time means switching recording off is an env change, not a rebuild.

  204 means "do not record": recording is off, the request is not from our own
  pages, it is a bot, or the burst limit is spent.
*/

const off = () => new NextResponse(null, { status: 204 });

export async function GET(request: NextRequest) {
  const key = process.env.STATSIG_CLIENT_KEY;
  if (!key || !statsigOn()) return off();
  if (!sameOrigin(request.headers) || isBot(request.headers.get("user-agent"))) return off();
  if (!(await withinBurst("beacon"))) return off();

  let userId: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const {
        data: { user },
      } = await (await createClient()).auth.getUser();
      userId = user?.id ?? null;
    } catch {
      /* Recorded as signed out rather than not at all. */
    }
  }

  const { visitor } = visitorFrom(request.headers);
  return NextResponse.json(
    { key, userID: userId ?? visitor, stableID: visitor, signedIn: Boolean(userId) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
