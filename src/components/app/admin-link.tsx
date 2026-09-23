import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { isStaffRole, ROLE_LABEL, type Role } from "@/lib/admin/capabilities";
import { createClient, getCurrentUser, isSupabaseConfigured } from "@/lib/supabase/server";

/*
  The way into the admin dashboard, in the sidebar.

  It used to exist only as a button on /settings, and the reasoning recorded
  there was that the sidebar is a client component rendered from thirteen pages,
  so threading a role through all of them would put the link on some and not
  others. That was true when it was written. Phase 4Q threaded the notice bar
  through the same thirteen, so the pattern is established and applied
  uniformly: a server component passed into a slot, rendered on every page or
  none.

  The symptom that made this worth fixing: a super admin signs in, lands on the
  app, and sees no sign anywhere that an admin dashboard exists. A surface you
  can only reach by typing the URL is a surface most people never reach.

  A render decision and nothing more. /admin gates on the same role server side
  through requireAdmin(), and every routine behind it checks a capability in
  SQL. Someone forging this component into existence gets a page that refuses.
*/
export async function AdminLink() {
  if (!isSupabaseConfigured()) return null;

  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = data?.role as string | undefined;
  if (!isStaffRole(role)) return null;

  return (
    <Link
      href="/admin"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] text-muted transition-colors duration-200 ease-out hover:bg-surface hover:text-foreground"
    >
      <ShieldCheck className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0">
        Admin
        <span className="block text-[12px] leading-snug text-muted">
          {ROLE_LABEL[role as Role]}
        </span>
      </span>
    </Link>
  );
}
