import { NextResponse } from "next/server";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";
import { withinBurst } from "@/lib/security/burst";

export const dynamic = "force-dynamic";

/*
  The bell's count (4BH). Signed out, or on any failure, the answer is null and
  the bell shows no badge: a failed read must not claim zero unread (rule 13),
  and it must not invent a number either. my_unread_notification_count() counts
  only the caller's own rows and caps at 100.
*/
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ count: null });
  if (!(await withinBurst("notifications"))) return NextResponse.json({ count: null }, { status: 429 });
  if (!(await getCurrentUser())) return NextResponse.json({ count: null }, { status: 401 });

  const db = await createClient();
  const { data, error } = await db.rpc("my_unread_notification_count");
  if (error) {
    console.error("[notifications] unread count failed", error.code, error.message);
    return NextResponse.json({ count: null }, { status: 500 });
  }
  return NextResponse.json(
    { count: typeof data === "number" ? data : null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
