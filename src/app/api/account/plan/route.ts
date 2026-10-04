import { NextResponse } from "next/server";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";

/*
  The caller's own plan, for the Upgrade icon in the top bar (PRICE.3). The
  plan is readable only by its owner, through my_profile_private() (D194).
  Signed out, or on any failure, the answer is null and the icon stays hidden:
  a failed read must not show Upgrade to someone who already pays.
*/
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ plan: null });
  if (!(await withinBurst("plan"))) return NextResponse.json({ plan: null }, { status: 429 });
  if (!(await getCurrentUser())) return NextResponse.json({ plan: null }, { status: 401 });

  const db = await createClient();
  const { data, error } = await db.rpc("my_profile_private");
  if (error) {
    console.error("[account] plan read failed", error.code, error.message);
    return NextResponse.json({ plan: null }, { status: 500 });
  }
  const plan = (data as { plan: string | null } | null)?.plan ?? "free";
  return NextResponse.json(
    { plan },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
