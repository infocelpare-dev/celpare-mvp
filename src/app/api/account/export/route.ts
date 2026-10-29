import { NextResponse } from "next/server";
import { getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { createAdminClient, hasServiceRole } from "@/lib/supabase/admin";
import { withinBurst } from "@/lib/security/burst";
import {
  ASK_MESSAGE_SELECT,
  DM_MESSAGE_SELECT,
  EXPORT_TABLES,
  matchValue,
} from "@/lib/account/export-spec";

export const dynamic = "force-dynamic";

/*
  Download my data (phase LEGAL, 2026-10-07): the access and portability rights
  of the Kenya Data Protection Act 2019 and the GDPR, self serve.

  Read on the service role because several of these tables have no read grant
  for the person (search events, devices, viewers), but every query is filtered
  on the caller's own id from the session, never on anything in the request, so
  the file cannot hold somebody else's rows. A failed table is named in
  `errors` rather than shown as empty (rule 13).
*/

const PAGE = 1000;
const MAX_ROWS = 20000;

type Read = { rows: unknown[]; error?: string };

async function readAll(
  table: string,
  select: string,
  column: string,
  values: string | string[],
): Promise<Read> {
  const admin = createAdminClient();
  const rows: unknown[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const base = admin.from(table).select(select);
    const filtered = Array.isArray(values) ? base.in(column, values) : base.eq(column, values);
    const { data, error } = await filtered.range(from, from + PAGE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return { rows };
}

export async function GET() {
  if (!isSupabaseConfigured() || !hasServiceRole()) {
    return NextResponse.json({ error: "Not available on this server." }, { status: 503 });
  }
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await withinBurst("account_export"))) {
    return NextResponse.json({ error: "Wait a minute, then try again." }, { status: 429 });
  }

  const data: Record<string, unknown[]> = {};
  const errors: Record<string, string> = {};
  const keep = (key: string, r: Read) => {
    data[key] = r.rows;
    if (r.error) errors[key] = r.error;
  };

  await Promise.all(
    EXPORT_TABLES.map(async (t) =>
      keep(t.key, await readAll(t.table, t.select, t.column, matchValue(t, user.id))),
    ),
  );

  const conversationIds = (data.ask_conversations as { id: string }[]).map((c) => c.id);
  keep(
    "ask_messages",
    conversationIds.length
      ? await readAll("messages", ASK_MESSAGE_SELECT, "conversation_id", conversationIds)
      : { rows: [] },
  );

  const threadIds = (data.message_threads as { thread_id: string }[]).map((p) => p.thread_id);
  keep(
    "direct_messages",
    threadIds.length
      ? await readAll("dm_messages", DM_MESSAGE_SELECT, "thread_id", threadIds)
      : { rows: [] },
  );

  const file = {
    about:
      "Everything Celpare holds that is tied to your account, as of exported_at. Direct messages include the ones you received, because they are part of your conversations. Privacy Policy: https://celpare.com/legal/privacy",
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email ?? null, created_at: user.created_at },
    errors,
    data,
  };

  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(file, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="celpare-data-${day}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
