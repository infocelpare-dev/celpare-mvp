import { NextResponse } from "next/server";
import { createAnonClient, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  Health check for deploys and rollbacks (phase OPS, step 4).

  GET /api/health        -> { status, version, commit }
  GET /api/health?db=1   -> the same, plus db: "ok" | "degraded"

  scripts/smoke.mjs calls it after every production deploy and every rollback,
  and compares `commit` with the commit it expects, which proves the build that
  passed CI is the one serving traffic.

  What it never returns: env names or values, hostnames, error text, stack
  traces, timings. A failing database shows only "degraded"; the reason goes to
  the server log, not to whoever asked. The version and commit are public on
  purpose (they are also in the JavaScript every visitor downloads).

  The database probe is one anonymous read of `categories`, a table the public
  site already reads, capped at 2 seconds. Anonymous, so the check holds no
  credential worth stealing and proves the same path a visitor uses.
*/

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";
const COMMIT = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "unknown";
const DB_TIMEOUT_MS = 2000;

async function probeDatabase(): Promise<"ok" | "degraded"> {
  if (!isSupabaseConfigured()) return "degraded";
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const db = createAnonClient();
    const query = db.from("categories").select("id").limit(1);
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), DB_TIMEOUT_MS);
    });
    const result = await Promise.race([query, timeout]);
    if (result === "timeout") {
      console.error("[health] database probe timed out");
      return "degraded";
    }
    if (result.error) {
      console.error("[health] database probe failed", result.error.code);
      return "degraded";
    }
    return "ok";
  } catch {
    console.error("[health] database probe threw");
    return "degraded";
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const wantsDb = new URL(request.url).searchParams.get("db") === "1";
  const db = wantsDb ? await probeDatabase() : undefined;
  const healthy = db !== "degraded";

  return NextResponse.json(
    { status: healthy ? "ok" : "degraded", version: VERSION, commit: COMMIT, ...(db ? { db } : {}) },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
    },
  );
}
